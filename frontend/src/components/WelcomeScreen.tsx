import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { ChatInterface } from './ChatInterface';
import { Bot, ArrowRight } from 'lucide-react';
import type { ChatMessage } from '../types';

interface WelcomeScreenProps {
  chatMessages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendMessage: () => void;
  isProcessing: boolean;
  onManualClick: () => void;
  pendingSuggestions?: string[] | null;
  onApplySuggestions?: () => void;
  onDismissSuggestions?: () => void;
  isApplyingSuggestions?: boolean;
}

export function WelcomeScreen({
  chatMessages,
  chatInput,
  onChatInputChange,
  onSendMessage,
  isProcessing,
  onManualClick,
  pendingSuggestions,
  onApplySuggestions,
  onDismissSuggestions,
  isApplyingSuggestions,
}: WelcomeScreenProps) {
  const { language } = useLanguage();
  const { user } = useAuth();

  const firstName = user?.name.split(' ')[0] || 'there';

  const t = {
    greeting: language === 'uk'
      ? `Куди далі, ${firstName}?`
      : `Where to next, ${firstName}?`,
    subtitle: language === 'uk'
      ? 'Просто скажіть мені, куди ви хочете поїхати.'
      : 'Just tell me where you want to go.',
    example: language === 'uk'
      ? '(наприклад, "Поїздка з Києва до Львова на 3 пасажирів")'
      : '(e.g., "Drive from Kyiv to Lviv with 3 people")',
    manualLink: language === 'uk'
      ? 'Або налаштувати вручну'
      : 'Or configure manually',
  };

  return (
    // h-full + internal scroll: the planner page wraps this in an
    // overflow-hidden viewport-height container, so a min-h-screen block
    // gets its bottom (incl. the manual-config link) clipped with no scroll.
    <div className="h-full overflow-y-auto flex px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-2xl m-auto py-12">
        {/* Robot Icon */}
        <div className="flex justify-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--accent-soft)' }}
          >
            <Bot className="w-10 h-10 text-primary" />
          </div>
        </div>

        {/* Greeting */}
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-5 duration-700 delay-150">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
            {t.greeting}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-2">
            {t.subtitle}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t.example}
          </p>
        </div>

        {/* Chat Card */}
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300">
          <ChatInterface
            messages={chatMessages}
            chatInput={chatInput}
            onChatInputChange={onChatInputChange}
            onSendMessage={onSendMessage}
            isProcessing={isProcessing}
            isCentered={true}
            showInsightsButton={false}
            pendingSuggestions={pendingSuggestions}
            onApplySuggestions={onApplySuggestions}
            onDismissSuggestions={onDismissSuggestions}
            isApplyingSuggestions={isApplyingSuggestions}
          />
        </div>

        {/* Manual Configuration Link */}
        <div className="text-center mt-6 animate-in fade-in slide-in-from-bottom-7 duration-700 delay-450">
          <button
            onClick={onManualClick}
            className="text-primary hover:opacity-80 font-medium flex items-center gap-1 mx-auto transition-opacity group"
          >
            <span>{t.manualLink}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
