import { useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTranslation } from '../i18n/routePlanner';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, Loader2, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AiPrivacyNote } from './AiPrivacyNote';

interface WelcomeScreenProps {
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendMessage: (message: string) => void;
  isProcessing: boolean;
  onManualClick: () => void;
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
}: WelcomeScreenProps) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const firstName = user?.name.split(' ')[0];
  const tr = getTranslation(language);
  const t = tr.agent;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read the DOM value, not state: autofill/IME can update the field
    // without a React change event.
    const message = new FormData(e.currentTarget).get('aiPrompt');
    onSendMessage(typeof message === 'string' ? message : '');
  };

  // Examples only fill the composer — sending stays an explicit user action
  // because every send is a billable AI request.
  const applyExample = (text: string) => {
    const draft = chatInput.trim();
    if (draft && draft !== text && !window.confirm(t.replaceDraft)) return;
    onChatInputChange(text);
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
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-2">
            {firstName ? t.greeting.replace('{name}', firstName) : t.greetingNoName}
          </h1>
          <p className="text-base text-slate-600 dark:text-slate-300">{t.greetingSubtitle}</p>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <form className="flex gap-2" onSubmit={handleSubmit}>
            <Input
              ref={inputRef}
              type="text"
              name="aiPrompt"
              aria-label={tr.chat.inputLabel}
              value={chatInput}
              onChange={(e) => onChatInputChange(e.target.value)}
              placeholder={t.describeTrip}
              disabled={isProcessing}
              className="flex-1 h-11 text-base"
              autoFocus
            />
            <button
              type="submit"
              aria-label={tr.planner.sendMessage}
              disabled={isProcessing}
              className="h-11 w-11 flex items-center justify-center rounded-lg flex-shrink-0 bg-primary text-white disabled:opacity-40"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-3" role="group" aria-label={t.examplesLabel}>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t.examplesLabel}</p>
            <div className="flex flex-wrap gap-2">
              {t.examples.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => applyExample(ex.text)}
                  disabled={isProcessing}
                  className="planner-example-chip"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-700">
            <AiPrivacyNote className="flex-1 min-w-[12rem]" />
            <button
              type="button"
              onClick={onManualClick}
              className="text-sm font-medium flex items-center gap-1 hover:opacity-80 transition-opacity"
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
    </div>
  );
}
