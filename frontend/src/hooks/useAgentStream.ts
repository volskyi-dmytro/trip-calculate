import { useState, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../services/api';

// Hard timeout slightly longer than the server-side 5 min
const HARD_TIMEOUT_MS = 5 * 60 * 1000 + 30_000;

export interface AgentMessage {
  id: string;
  role: 'assistant' | 'system';
  content: string;
  raw?: unknown;
}

export interface AgentProgress {
  type: string;
  message?: string;
  tool_name?: string;
  [key: string]: unknown;
}

export type AgentStreamState = 'idle' | 'streaming' | 'done' | 'error';

export interface UseAgentStreamReturn {
  messages: AgentMessage[];
  progress: AgentProgress[];
  state: AgentStreamState;
  errorMessage: string | null;
  start: (message: string, sessionId?: string) => void;
  abort: () => void;
}

/**
 * Parses raw SSE text buffer into individual event objects.
 * Lines starting with ':' are comments (keep-alive) and are silently dropped.
 * Returns an array of {event, data} pairs for all complete events in the buffer,
 * plus the remaining unparsed tail.
 */
function parseSSEBuffer(buffer: string): {
  events: Array<{ event: string; data: string }>;
  remaining: string;
} {
  const events: Array<{ event: string; data: string }> = [];
  // SSE events are separated by a blank line (\n\n or \r\n\r\n)
  const blocks = buffer.split(/\n\n|\r\n\r\n/);
  // Last block may be incomplete — keep it in the buffer
  const remaining = blocks.pop() ?? '';

  for (const block of blocks) {
    if (!block.trim()) continue;

    let eventName = 'message';
    const dataLines: string[] = [];

    for (const raw of block.split(/\r?\n/)) {
      if (raw.startsWith(':')) {
        // SSE comment — keep-alive ping, silently skip
        continue;
      }
      if (raw.startsWith('event:')) {
        eventName = raw.slice('event:'.length).trim();
      } else if (raw.startsWith('data:')) {
        dataLines.push(raw.slice('data:'.length).trimStart());
      }
    }

    // Only emit if there is actual data
    if (dataLines.length > 0) {
      events.push({ event: eventName, data: dataLines.join('\n') });
    }
  }

  return { events, remaining };
}

export function useAgentStream(): UseAgentStreamReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [progress, setProgress] = useState<AgentProgress[]>([]);
  const [state, setState] = useState<AgentStreamState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHardTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    clearHardTimeout();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState((prev) => (prev === 'streaming' ? 'idle' : prev));
  }, [clearHardTimeout]);

  const start = useCallback(
    (message: string, sessionId?: string) => {
      // Cancel any in-flight request
      clearHardTimeout();
      abortControllerRef.current?.abort();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Reset UI state for new request
      setMessages([]);
      setProgress([]);
      setErrorMessage(null);
      setState('streaming');

      // Hard timeout: if stream never terminates, transition to error
      timeoutRef.current = setTimeout(() => {
        controller.abort();
        setState('error');
        setErrorMessage('timeout');
      }, HARD_TIMEOUT_MS);

      const baseUrl = API_BASE_URL ?? '';
      const url = `${baseUrl}/api/ai/chat`;

      // Accumulates partial SSE data between chunks
      let buffer = '';

      // Tracks assembled assistant message content keyed by a synthetic id
      // LangChain message events carry content fragments; we accumulate per-turn.
      // We use a single "current" id that resets on each start() call.
      const currentMsgId = crypto.randomUUID();

      (async () => {
        try {
          const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
            },
            body: JSON.stringify({
              message,
              sessionId: sessionId ?? undefined,
            }),
          });

          if (!response.ok) {
            clearHardTimeout();
            setState('error');
            // Map HTTP error codes to generic messages; never surface 403 as a toast
            const code = response.status;
            if (code === 401 || code === 403) {
              setErrorMessage('access_denied');
            } else if (code === 429) {
              setErrorMessage('rate_limited');
            } else {
              setErrorMessage('http_error');
            }
            return;
          }

          if (!response.body) {
            clearHardTimeout();
            setState('error');
            setErrorMessage('no_body');
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');

          // Whether we have seen a terminal event (done or error)
          let terminal = false;

          // Tracks whether we have appended content to the current message yet
          let currentMsgInitialized = false;

          while (!terminal) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const { events, remaining } = parseSSEBuffer(buffer);
            buffer = remaining;

            for (const { event, data } of events) {
              // Parse JSON defensively — malformed data must not crash the hook
              let parsed: unknown;
              try {
                parsed = JSON.parse(data);
              } catch {
                console.warn('[useAgentStream] Skipping non-JSON SSE data for event:', event, data);
                continue;
              }

              if (event === 'messages') {
                // LangChain token fragment: {content, additional_kwargs, ...}
                const fragment = parsed as { content?: string };
                const chunk = typeof fragment.content === 'string' ? fragment.content : '';
                if (chunk) {
                  if (!currentMsgInitialized) {
                    // Insert the message row on first content chunk
                    setMessages((prev) => [
                      ...prev,
                      { id: currentMsgId, role: 'assistant', content: chunk, raw: parsed },
                    ]);
                    currentMsgInitialized = true;
                  } else {
                    // Append to existing message
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === currentMsgId
                          ? { ...m, content: m.content + chunk, raw: parsed }
                          : m
                      )
                    );
                  }
                }
              } else if (event === 'updates') {
                // State diff from LangGraph node completion
                // Extract any AI message content and append, similar to messages event
                const update = parsed as { messages?: Array<{ type?: string; content?: string }> };
                if (Array.isArray(update.messages)) {
                  for (const msg of update.messages) {
                    if (msg.type === 'ai' && typeof msg.content === 'string' && msg.content) {
                      if (!currentMsgInitialized) {
                        setMessages((prev) => [
                          ...prev,
                          { id: currentMsgId, role: 'assistant', content: msg.content!, raw: parsed },
                        ]);
                        currentMsgInitialized = true;
                      } else {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === currentMsgId
                              ? { ...m, content: m.content + msg.content!, raw: parsed }
                              : m
                          )
                        );
                      }
                    }
                  }
                }
              } else if (event === 'custom') {
                const customData = parsed as AgentProgress;
                setProgress((prev) => [...prev, customData]);
              } else if (event === 'done') {
                terminal = true;
                clearHardTimeout();
                setState('done');
                break;
              } else if (event === 'error') {
                terminal = true;
                clearHardTimeout();
                setState('error');
                // Server message is the SSE error frame's data.message — never rendered
                // raw; AgentChat collapses unknown codes to a localized streamError key.
                const errData = parsed as { message?: string };
                setErrorMessage(errData.message ?? 'stream_error');
                break;
              }
            }
          }

          // Stream ended without a terminal event (e.g. server closed connection)
          if (!terminal) {
            clearHardTimeout();
            setState('done');
          }
        } catch (err) {
          clearHardTimeout();
          if (err instanceof Error && err.name === 'AbortError') {
            // Intentional abort — leave state as-is (set to idle by abort() or timeout handler)
            return;
          }
          console.error('[useAgentStream] Fetch error:', err);
          setState('error');
          setErrorMessage('network_error');
        }
      })();
    },
    [clearHardTimeout]
  );

  return { messages, progress, state, errorMessage, start, abort };
}
