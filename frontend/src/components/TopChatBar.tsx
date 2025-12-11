import { Send, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLanguage } from '../contexts/LanguageContext';

interface TopChatBarProps {
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendMessage: () => void;
  isProcessing: boolean;
}

export function TopChatBar({
  chatInput,
  onChatInputChange,
  onSendMessage,
  isProcessing,
}: TopChatBarProps) {
  const { language } = useLanguage();

  const t = {
    placeholder: language === 'uk'
      ? 'Попросіть AI змінити маршрут...'
      : 'Ask AI to change route...',
    processing: language === 'uk'
      ? 'Обробка...'
      : 'Processing...',
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isProcessing && chatInput.trim()) {
      onSendMessage();
    }
  };

  return (
    <div className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <div className="max-w-7xl mx-auto p-4">
        <div className="relative">
          {/* Progress indicator when processing */}
          {isProcessing && (
            <div className="absolute -top-1 left-0 right-0 h-1 bg-gradient-to-r from-indigo-400 via-purple-500 to-indigo-400 animate-pulse rounded-full" />
          )}

          <div className="flex gap-2">
            <Input
              type="text"
              placeholder={t.placeholder}
              value={chatInput}
              onChange={(e) => onChatInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
              className="flex-1 h-10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            />
            <Button
              onClick={onSendMessage}
              disabled={isProcessing || !chatInput.trim()}
              className="px-4 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="ml-2 hidden sm:inline">{t.processing}</span>
                </>
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
