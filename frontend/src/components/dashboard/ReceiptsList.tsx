import { useEffect, useState } from 'react';
import { Copy, Eye, Loader2, Receipt as ReceiptIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { useLanguage } from '../../contexts/LanguageContext';
import { receiptService, receiptUrl } from '../../services/receiptService';
import type { Receipt } from '../../types/Receipt';

/** Owned receipts never expire; this list is where users manage the links they shared. */
export function ReceiptsList() {
  const { language } = useLanguage();
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const t = {
    title: language === 'uk' ? 'Мої квитанції' : 'My receipts',
    empty:
      language === 'uk'
        ? 'Ще немає квитанцій. Поділіться розрахунком — посилання з’явиться тут.'
        : 'No receipts yet. Share a calculation and its link will appear here.',
    views: language === 'uk' ? 'переглядів' : 'views',
    copied: language === 'uk' ? 'Посилання скопійовано' : 'Link copied',
    deleted: language === 'uk' ? 'Квитанцію видалено' : 'Receipt deleted',
    deleteFailed: language === 'uk' ? 'Не вдалося видалити' : 'Delete failed',
    confirmDelete:
      language === 'uk'
        ? 'Видалити квитанцію? Посилання перестане працювати.'
        : 'Delete this receipt? The link will stop working.',
    unnamed: language === 'uk' ? 'Поїздка' : 'Trip',
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
    if (!window.confirm(t.confirmDelete)) return;
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
          <p className="text-sm text-slate-500 dark:text-slate-400">{t.empty}</p>
        ) : (
          <ul className="space-y-2">
            {receipts.map((r) => (
              <li
                key={r.slug}
                className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {r.originLabel && r.destinationLabel
                      ? `${r.originLabel} → ${r.destinationLabel}`
                      : `${t.unnamed} · ${r.distanceKm.toFixed(0)} km`}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    {r.viewCount} {t.views} · {r.costPerPerson.toFixed(2)} {r.currency}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleCopy(r.slug)}
                  aria-label={t.copied}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleDelete(r.slug)}
                  disabled={deleting === r.slug}
                  aria-label={t.deleted}
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
    </Card>
  );
}
