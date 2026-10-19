import { useEffect, useState } from 'react';
import { Copy, Eye, Loader2, Receipt as ReceiptIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatDistance, formatMoney } from '../../lib/format';
import { receiptService, receiptUrl } from '../../services/receiptService';
import type { Receipt } from '../../types/Receipt';

/** Owned receipts never expire; this list is where users manage the links they shared. */
export function ReceiptsList() {
  const { t: tr, tn, language } = useLanguage();
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const t = {
    title: tr('receiptsList.title'),
    empty: tr('receiptsList.empty'),
    copied: tr('receiptsList.copied'),
    deleted: tr('receiptsList.deleted'),
    copyLabel: tr('receiptsList.copyLabel'),
    deleteLabel: tr('receiptsList.deleteLabel'),
    deleteFailed: tr('receiptsList.deleteFailed'),
    confirmDelete: tr('receiptsList.confirmDelete'),
    confirmTitle: tr('receiptsList.confirmTitle'),
    cancel: tr('common.cancel'),
    unnamed: tr('receiptsList.unnamed'),
  };

  useEffect(() => {
    receiptService
      .listMine()
      .then(setReceipts)
      .catch(() => setReceipts([]));
  }, []);

  const handleCopy = async (slug: string) => {
    await navigator.clipboard.writeText(receiptUrl(slug));
    toast.success(t.copied);
  };

  const handleDelete = async (slug: string) => {
    setDeleting(slug);
    try {
      await receiptService.remove(slug);
      setReceipts((prev) => (prev ? prev.filter((r) => r.slug !== slug) : prev));
      toast.success(t.deleted);
    } catch {
      toast.error(t.deleteFailed);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ReceiptIcon className="h-5 w-5" aria-hidden="true" />
          {t.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {receipts === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-caption">{t.empty}</p>
        ) : (
          <ul className="space-y-2">
            {receipts.map((r) => (
              <li
                key={r.slug}
                className="flex items-center gap-2 p-2 rounded-lg border border-edge"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {r.originLabel && r.destinationLabel
                      ? `${r.originLabel} → ${r.destinationLabel}`
                      : `${t.unnamed} · ${formatDistance(r.distanceKm, language)}`}
                  </div>
                  <div className="text-xs text-caption flex items-center gap-1">
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    {tn('receiptsList.views', r.viewCount)} · {formatMoney(r.costPerPerson, r.currency, language)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  
                  onClick={() => handleCopy(r.slug)}
                  aria-label={t.copyLabel}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  
                  onClick={() => setPendingDelete(r.slug)}
                  disabled={deleting === r.slug}
                  aria-label={t.deleteLabel}
                >
                  {deleting === r.slug ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={t.confirmTitle}
        description={t.confirmDelete}
        confirmLabel={t.deleteLabel}
        cancelLabel={t.cancel}
        destructive
        onConfirm={() => { if (pendingDelete) void handleDelete(pendingDelete); }}
      />
    </Card>
  );
}
