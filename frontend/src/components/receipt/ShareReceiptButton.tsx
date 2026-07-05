import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useLanguage } from '../../contexts/LanguageContext';
import { ShareReceiptModal } from './ShareReceiptModal';
import type { ReceiptPayload } from '../../types/Receipt';

interface ShareReceiptButtonProps {
  payload: ReceiptPayload;
  disabled?: boolean;
  className?: string;
}

export function ShareReceiptButton({ payload, disabled, className }: ShareReceiptButtonProps) {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const label = language === 'uk' ? 'Поділитися квитанцією' : 'Share receipt';

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className={className ?? 'w-full'}
      >
        <Share2 className="h-4 w-4 mr-2" />
        {label}
      </Button>
      <ShareReceiptModal payload={payload} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
