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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-indigo-950 dark:to-purple-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Robot Icon */}
        <div className="flex justify-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center shadow-lg">
            <Bot className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
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
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium flex items-center gap-1 mx-auto transition-colors group"
          >
            <span>{t.manualLink}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
