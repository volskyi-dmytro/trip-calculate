import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { CalculatorForm } from './CalculatorForm';
import { useLanguage } from '../../contexts/LanguageContext';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CalculatorModal({ isOpen, onClose }: CalculatorModalProps) {
  const { t } = useLanguage();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="calc-dialog max-h-[88dvh] overflow-y-auto">
        <DialogHeader className="mb-4 flex-row items-center justify-between">
          <DialogTitle>{t('calculator.title')}</DialogTitle>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </DialogHeader>
        <CalculatorForm />
      </DialogContent>
    </Dialog>
  );
}
