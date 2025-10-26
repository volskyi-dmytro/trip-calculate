import { Modal } from '../common/Modal';
import { CalculatorForm } from './CalculatorForm';
import { useLanguage } from '../../contexts/LanguageContext';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CalculatorModal({ isOpen, onClose }: CalculatorModalProps) {
  const { t } = useLanguage();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('calculator.title')}>
      <CalculatorForm />
    </Modal>
  );
}
