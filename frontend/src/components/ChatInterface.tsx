import { useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { Bot, Send, Loader2, Sparkles, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '../contexts/LanguageContext';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendMessage: (message: string) => void;
  isProcessing: boolean;
  isCentered?: boolean;
  className?: string;
  onGetInsights?: () => void;
  isGettingInsights?: boolean;
  showInsightsButton?: boolean;
  pendingSuggestions?: string[] | null;
  onApplySuggestions?: () => void;
  onDismissSuggestions?: () => void;
  isApplyingSuggestions?: boolean;
}

interface SuggestedStopCardProps {
  stops: string[];
  onApply: () => void;
  onDismiss: () => void;
  isApplying: boolean;
}

const SuggestedStopCard: React.FC<SuggestedStopCardProps> = ({ stops, onApply, onDismiss, isApplying }) => {
  const { language } = useLanguage();

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-2 mb-2 animate-in fade-in slide-in-from-bottom-2">
      <p className="text-xs font-bold text-primary mb-2 uppercase flex items-center gap-1">
        <Sparkles className="w-3 h-3" /> {language === 'uk' ? 'Рекомендовані зупинки' : 'Suggested Stops'}
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {stops.map((stop, idx) => (
          <span
            key={idx}
            className="text-xs glass-inset px-2 py-1 rounded text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
          >
            {stop}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onApply}
          disabled={isApplying}
          className="flex-1 bg-primary hover:bg-primary/90 text-white text-xs"
        >
          {isApplying ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <Plus className="w-3 h-3 mr-1" />
          )}
          {language === 'uk' ? 'Додати до маршруту' : 'Add to Route'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDismiss}
          className="text-primary text-xs"
        >
          {language === 'uk' ? 'Закрити' : 'Dismiss'}
        </Button>
      </div>
    </div>
  );
};

export function ChatInterface({
  messages,
  chatInput,
  onChatInputChange,
  onSendMessage,
  isProcessing,
  isCentered = false,
  className = '',
  onGetInsights,
  isGettingInsights = false,
  showInsightsButton = false,
  pendingSuggestions = null,
  onApplySuggestions,
  onDismissSuggestions,
  isApplyingSuggestions = false,
}: ChatInterfaceProps) {
  const { language } = useLanguage();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingSuggestions]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const message = new FormData(e.currentTarget).get('aiPrompt');
    onSendMessage(typeof message === 'string' ? message : '');
  };

  const t = {
    aiAssistant: language === 'uk' ? 'AI Асистент' : 'AI Assistant',
    insights: language === 'uk' ? 'Інсайти' : 'Insights',
    chatPlaceholder: language === 'uk'
      ? 'Опишіть ваш маршрут (наприклад, "Подорож із Києва до Львова на двох пасажирів")...'
      : 'Describe your trip (e.g., "Trip from Kyiv to Lviv for 2 passengers")...',
    chatPlaceholderShort: language === 'uk' ? 'Запитайте AI...' : 'Ask AI...',
    send: language === 'uk' ? 'Надіслати повідомлення' : 'Send message',
  };

  return (
    <div
      className={`glass-panel p-4 rounded-xl flex flex-col ${
        isCentered ? 'w-full max-w-2xl' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-slate-800 dark:text-white">{t.aiAssistant}</h3>
        </div>
        {showInsightsButton && onGetInsights && (
          <Button
            size="sm"
            variant="outline"
            onClick={onGetInsights}
            disabled={isGettingInsights}
            className="text-xs flex items-center gap-1"
          >
            {isGettingInsights ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {t.insights}
          </Button>
        )}
      </div>

      <div
        className={`${
          isCentered ? 'h-64' : 'h-48'
        } overflow-y-auto mb-3 bg-white/50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700 transition-all duration-300`}
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`mb-2 text-sm ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
            <span
              className={`inline-block px-3 py-2 rounded-lg max-w-[90%] whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary text-white rounded-br-none'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'
              }`}
            >
              {msg.content}
            </span>
          </div>
        ))}

        {isProcessing && (
          <div className="text-left mb-2">
            <span className="inline-block px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-500 rounded-bl-none">
              <Loader2 className="w-4 h-4 animate-spin" />
            </span>
          </div>
        )}

        {pendingSuggestions && onApplySuggestions && onDismissSuggestions && (
          <SuggestedStopCard
            stops={pendingSuggestions}
            onApply={onApplySuggestions}
            onDismiss={onDismissSuggestions}
            isApplying={isApplyingSuggestions}
          />
        )}

        <div ref={chatEndRef} />
      </div>

      <form className="flex gap-2" onSubmit={handleSubmit}>
        <Input
          type="text"
          name="aiPrompt"
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          placeholder={isCentered ? t.chatPlaceholder : t.chatPlaceholderShort}
          disabled={isProcessing}
          className="flex-1 text-sm"
          autoFocus={isCentered}
        />
        <Button aria-label={t.send} type="submit" disabled={isProcessing} size="sm">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
