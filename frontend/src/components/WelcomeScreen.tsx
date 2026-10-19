import { useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../i18n/routePlanner';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AiPrivacyNote } from './AiPrivacyNote';
import { PromptComposer } from './PromptComposer';
import { LimitBanner } from './LimitBanner';
import { AgentProgress } from './AgentProgress';
import type { AgentStage } from '../services/agentStreamService';

interface WelcomeScreenProps {
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendMessage: (message: string) => void;
  isProcessing: boolean;
  onManualClick: () => void;
  /** Set after a 429: banner + send disabled until retryAt (null = time unknown). */
  limit?: { retryAt: Date | null } | null;
  onLimitExpire?: () => void;
  doneStages?: AgentStage[];
  degraded?: boolean;
}

// Pre-conversation entry: a compact intro and composer instead of an empty
// transcript. Sending hands off to the planner's conversation layout (the
// parent flips showWelcomeScreen), so nothing here needs to render replies.
export function WelcomeScreen({
  chatInput,
  onChatInputChange,
  onSendMessage,
  isProcessing,
  onManualClick,
  limit = null,
  onLimitExpire = () => {},
  doneStages = [],
  degraded = false,
}: WelcomeScreenProps) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [pendingExample, setPendingExample] = useState<string | null>(null);
  // An example only fills the box (sending costs an AI request), so point at
  // the send button instead of leaving the user waiting for something to happen.
  const [exampleApplied, setExampleApplied] = useState(false);
  const showSendHint = exampleApplied && chatInput.trim().length > 0 && !isProcessing;

  const firstName = user?.name.split(' ')[0];
  const tr = getTranslation(language);
  const t = tr.agent;

  // Examples only fill the composer — sending stays an explicit user action
  // because every send is a billable AI request.
  const applyExample = (text: string) => {
    const draft = chatInput.trim();
    if (draft && draft !== text) {
      setPendingExample(text);
      return;
    }
    onChatInputChange(text);
    setExampleApplied(true);
    inputRef.current?.focus();
  };

  const confirmExample = () => {
    if (pendingExample !== null) {
      onChatInputChange(pendingExample);
      setExampleApplied(true);
    }
    setPendingExample(null);
    inputRef.current?.focus();
  };

  return (
    // h-full + internal scroll: the planner page wraps this in an
    // overflow-hidden viewport-height container.
    <div className="h-full overflow-y-auto flex px-4">
      <div className="w-full max-w-xl m-auto py-6">
        <img
          src="/images/planner-v1/ai-welcome.webp"
          alt=""
          width={600}
          height={400}
          className="planner-welcome-art"
        />

        <div className="text-center mb-5">
          <h1 className="text-3xl md:text-4xl font-bold text-content mb-2">
            {firstName ? t.greeting.replace('{name}', firstName) : t.greetingNoName}
          </h1>
          <p className="text-base text-secondary">{t.greetingSubtitle}</p>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <PromptComposer
            ref={inputRef}
            value={chatInput}
            onChange={onChatInputChange}
            onSubmit={onSendMessage}
            placeholder={t.describeTrip}
            isProcessing={isProcessing}
            sendDisabled={limit?.retryAt != null}
            emphasizeSend={showSendHint}
            autoFocus
          />
          {showSendHint && (
            <p className="mt-2 text-sm font-medium" style={{ color: 'var(--accent)' }} aria-live="polite">
              {t.pressEnterHint}
            </p>
          )}
          {limit && (
            <div className="mt-3">
              <LimitBanner retryAt={limit.retryAt} onExpire={onLimitExpire} />
            </div>
          )}

          {isProcessing ? (
            <div className="mt-3"><AgentProgress doneStages={doneStages} degraded={degraded} /></div>
          ) : (
          <div className="mt-3" role="group" aria-label={t.examplesLabel}>
            <p className="text-xs font-medium text-caption mb-1.5">{t.examplesLabel}</p>
            <div className="flex flex-wrap gap-2">
              {t.examples.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => applyExample(ex.text)}
                  className="planner-example-chip"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
          )}

          <div className="mt-3 pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-edge">
            <AiPrivacyNote className="flex-1 min-w-[12rem]" />
            <button
              type="button"
              onClick={onManualClick}
              className="touch-link text-sm font-medium flex items-center gap-1 hover:opacity-80 transition-opacity"
              // --accent, not text-primary: the Tailwind primary is the same
              // dark teal in both themes and fails contrast on dark glass.
              style={{ color: 'var(--accent)' }}
            >
              {t.configureManually}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={pendingExample !== null}
        onOpenChange={(open) => { if (!open) setPendingExample(null); }}
        title={t.replaceDraftTitle}
        description={t.replaceDraft}
        confirmLabel={t.replaceDraftConfirm}
        cancelLabel={t.replaceDraftCancel}
        onConfirm={confirmExample}
      />
    </div>
  );
}
