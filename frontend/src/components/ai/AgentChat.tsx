// Option A: placed as a section on RoutePlannerPage for granted users.
// The access gate is already resolved by the parent — this component is only rendered
// when hasAccess === true, so it never calls /api/ai/chat for non-granted users.
import { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAgentStream } from '../../hooks/useAgentStream';
import type { AgentProgress } from '../../hooks/useAgentStream';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { AgentChatErrorBoundary } from './AgentChatErrorBoundary';

// Maps internal errorMessage keys to i18n translation keys.
// Unknown codes — including arbitrary server-supplied strings — collapse to the
// generic streamError key so the i18n layer always renders, never a raw server payload.
function mapErrorKey(errorMessage: string | null): string {
  switch (errorMessage) {
    case 'access_denied':   return 'aiChat.error.accessDenied';
    case 'rate_limited':    return 'aiChat.error.rateLimited';
    case 'http_error':      return 'aiChat.error.httpError';
    case 'no_body':         return 'aiChat.error.noBody';
    case 'network_error':   return 'aiChat.error.networkError';
    case 'stream_error':    return 'aiChat.error.streamError';
    case 'timeout':         return 'aiChat.error.timeout';
    default:                return 'aiChat.error.streamError';
  }
}

function ProgressItem({ item }: { item: AgentProgress }) {
  const { t } = useLanguage();

  if (item.type === 'tool_start' && item.tool_name) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 py-0.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 dark:bg-blue-500 shrink-0" />
        <span>
          {t('aiChat.progress.toolStart')} <span className="font-medium">{item.tool_name}</span>
          {item.message ? `: ${item.message}` : ''}
        </span>
      </div>
    );
  }

  if (item.type === 'tool_result' && item.tool_name) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 py-0.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 dark:bg-green-500 shrink-0" />
        <span>
          {t('aiChat.progress.toolResult')} <span className="font-medium">{item.tool_name}</span>
          {item.message ? `: ${item.message}` : ''}
        </span>
      </div>
    );
  }

  if (item.message) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 py-0.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0" />
        <span>{item.message}</span>
      </div>
    );
  }

  return null;
}

function AgentChatInner() {
  const { t } = useLanguage();
  const { messages, progress, state, errorMessage, start, abort } = useAgentStream();

  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Stable session id for the duration of the component's lifetime
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  // Check prefers-reduced-motion once on mount
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scroll to bottom as messages stream in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'instant' : 'smooth' });
  }, [messages, prefersReducedMotion]);

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || state === 'streaming') return;
    setInputValue('');
    start(trimmed, sessionIdRef.current);
  }, [inputValue, state, start]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isStreaming = state === 'streaming';
  const hasContent = messages.length > 0 || progress.length > 0;

  // Always rendered through i18n — server-supplied error strings never reach the DOM.
  const displayError = t(mapErrorKey(errorMessage));

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-gray-900 dark:text-white">
          {t('aiChat.title')}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 p-4 pt-0">
        {/* Response area */}
        <div
          className="min-h-[200px] max-h-[400px] overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 space-y-3"
          role="log"
          aria-live="polite"
          aria-label={t('aiChat.responseAreaLabel')}
        >
          {/* Idle empty state */}
          {state === 'idle' && !hasContent && (
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center pt-8">
              {t('aiChat.emptyState')}
            </p>
          )}

          {/* Progress timeline */}
          {progress.length > 0 && (
            <div className="space-y-0.5 border-b border-gray-200 dark:border-gray-700 pb-3 mb-3">
              {progress.map((item, i) => (
                <ProgressItem key={i} item={item} />
              ))}
            </div>
          )}

          {/* Assistant messages */}
          {messages.map((msg) => (
            <div key={msg.id} className="space-y-1">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                {t('aiChat.assistantLabel')}
              </p>
              <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </p>
            </div>
          ))}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              {prefersReducedMotion ? (
                <span>{t('aiChat.streaming')}</span>
              ) : (
                <>
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse"
                    aria-hidden="true"
                  />
                  <span>{t('aiChat.streaming')}</span>
                </>
              )}
            </div>
          )}

          {/* Done indicator */}
          {state === 'done' && hasContent && (
            <p className="text-xs text-green-600 dark:text-green-400 text-right">
              {t('aiChat.done')}
            </p>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error alert */}
        {state === 'error' && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{displayError}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  start(inputValue.trim() || t('aiChat.retryMessage'), sessionIdRef.current);
                }}
              >
                {t('aiChat.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Input row */}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={isStreaming}
            placeholder={t('aiChat.placeholder')}
            aria-label={t('aiChat.placeholder')}
            className="flex-1 resize-none rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          />

          {isStreaming ? (
            <Button
              variant="outline"
              onClick={abort}
              aria-label={t('aiChat.stopAriaLabel')}
              className="min-h-[44px] min-w-[44px] shrink-0"
            >
              {t('aiChat.stop')}
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              aria-label={t('aiChat.sendAriaLabel')}
              className="min-h-[44px] min-w-[44px] shrink-0"
            >
              {t('aiChat.send')}
            </Button>
          )}
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-400">
          {t('aiChat.hint')}
        </p>
      </CardContent>
    </Card>
  );
}

export function AgentChat() {
  const { t } = useLanguage();

  return (
    <AgentChatErrorBoundary
      fallbackMessage={t('aiChat.errorBoundaryFallback')}
      retryLabel={t('aiChat.retry')}
    >
      <AgentChatInner />
    </AgentChatErrorBoundary>
  );
}
