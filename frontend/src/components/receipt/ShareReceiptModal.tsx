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

// Receipts are public, so a label is pre-filled only when it looks like a
// place name. Anything with digits or commas (street, house number) is left
// for the driver to type on purpose.
const safeLabel = (label?: string) => (label && !/[\d,]/.test(label) ? label : '');

export function ShareReceiptModal({ payload, isOpen, onClose }: ShareReceiptModalProps) {
  const { t: tr } = useLanguage();
  const [origin, setOrigin] = useState(safeLabel(payload.originLabel));
  const [destination, setDestination] = useState(safeLabel(payload.destinationLabel));
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Re-arm the modal each time it opens with a fresh calculation
  useEffect(() => {
    if (isOpen) {
      setReceipt(null);
      setCopied(false);
      setOrigin(safeLabel(payload.originLabel));
      setDestination(safeLabel(payload.destinationLabel));
    }
  }, [isOpen, payload.originLabel, payload.destinationLabel]);

  const t = {
    title: tr('shareReceipt.title'),
    description: tr('shareReceipt.description'),
    from: tr('shareReceipt.from'),
    to: tr('shareReceipt.to'),
    create: tr('shareReceipt.create'),
    publicNotice: tr('shareReceipt.publicNotice'),
    addressHint: tr('shareReceipt.addressHint'),
    copy: tr('shareReceipt.copy'),
    copiedToast: tr('shareReceipt.copiedToast'),
    share: tr('shareReceipt.share'),
    expiresNote: tr('shareReceipt.expiresNote'),
    rateLimited: tr('shareReceipt.rateLimited'),
    genericError: tr('shareReceipt.genericError'),
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
              <Label htmlFor="receipt-origin" className="text-xs font-semibold uppercase">{t.from}</Label>
              <Input
                id="receipt-origin"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                maxLength={120}
                className="mt-1"
                placeholder={tr('shareReceipt.fromPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="receipt-destination" className="text-xs font-semibold uppercase">{t.to}</Label>
              <Input
                id="receipt-destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                maxLength={120}
                className="mt-1"
                placeholder={tr('shareReceipt.toPlaceholder')}
              />
            </div>
            <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
              <p>{t.publicNotice}</p>
              <p>{t.addressHint}</p>
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
