import { Send } from 'lucide-react';
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
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isProcessing) {
      onSendMessage();
    }
  };

  return (
    <div className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder={t.placeholder}
            value={chatInput}
            onChange={(e) => onChatInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 h-10"
          />
          <Button
            onClick={onSendMessage}
            disabled={isProcessing || !chatInput.trim()}
            className="px-4 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
