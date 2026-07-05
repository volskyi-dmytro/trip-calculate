import { useEffect, useState } from 'react';
import { Copy, Share2, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useLanguage } from '../../contexts/LanguageContext';
import { receiptService, receiptUrl } from '../../services/receiptService';
import type { Receipt, ReceiptPayload } from '../../types/Receipt';

interface ShareReceiptModalProps {
  payload: ReceiptPayload;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareReceiptModal({ payload, isOpen, onClose }: ShareReceiptModalProps) {
  const { language } = useLanguage();
  const [origin, setOrigin] = useState(payload.originLabel ?? '');
  const [destination, setDestination] = useState(payload.destinationLabel ?? '');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Re-arm the modal each time it opens with a fresh calculation
  useEffect(() => {
    if (isOpen) {
      setReceipt(null);
      setCopied(false);
      setOrigin(payload.originLabel ?? '');
      setDestination(payload.destinationLabel ?? '');
    }
  }, [isOpen, payload.originLabel, payload.destinationLabel]);

  const t = {
    title: language === 'uk' ? 'Поділитися квитанцією' : 'Share trip receipt',
    description:
      language === 'uk'
        ? 'Створіть посилання й надішліть його пасажирам у Telegram чи Viber.'
        : 'Create a link and send it to your passengers on Telegram or WhatsApp.',
    from: language === 'uk' ? 'Звідки (необов\'язково)' : 'From (optional)',
    to: language === 'uk' ? 'Куди (необов\'язково)' : 'To (optional)',
    create: language === 'uk' ? 'Створити посилання' : 'Create link',
    copy: language === 'uk' ? 'Копіювати' : 'Copy',
    copiedToast: language === 'uk' ? 'Посилання скопійовано' : 'Link copied',
    share: language === 'uk' ? 'Поділитися' : 'Share',
    expiresNote:
      language === 'uk'
        ? 'Посилання діє 30 днів. Увійдіть, щоб зберігати квитанції без обмежень.'
        : 'Link lasts 30 days. Sign in to keep receipts forever.',
    rateLimited:
      language === 'uk'
        ? 'Забагато квитанцій за годину. Спробуйте пізніше.'
        : 'Too many receipts this hour. Try again later.',
    genericError:
      language === 'uk' ? 'Не вдалося створити посилання' : 'Could not create the link',
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await receiptService.create({
        ...payload,
        originLabel: origin.trim() || undefined,
        destinationLabel: destination.trim() || undefined,
      });
      setReceipt(created);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      toast.error(status === 429 ? t.rateLimited : t.genericError);
    } finally {
      setCreating(false);
    }
  };

  const link = receipt ? receiptUrl(receipt.slug) : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success(t.copiedToast);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = () => {
    navigator.share({ url: link }).catch(() => {});
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        {!receipt ? (
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase">{t.from}</Label>
              <Input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                maxLength={120}
                className="mt-1"
                placeholder={language === 'uk' ? 'Київ' : 'Berlin'}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase">{t.to}</Label>
              <Input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                maxLength={120}
                className="mt-1"
                placeholder={language === 'uk' ? 'Львів' : 'Munich'}
              />
            </div>
            <Button onClick={handleCreate} disabled={creating} className="w-full">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t.create}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input value={link} readOnly className="flex-1 font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={handleCopy} aria-label={t.copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {typeof navigator.share === 'function' && (
              <Button onClick={handleNativeShare} className="w-full">
                <Share2 className="h-4 w-4 mr-2" />
                {t.share}
              </Button>
            )}
            {receipt.expiresAt && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.expiresNote}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
