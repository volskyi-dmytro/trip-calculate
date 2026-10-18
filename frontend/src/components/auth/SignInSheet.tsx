import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { useLanguage } from '../../contexts/LanguageContext';
import { API_BASE_URL } from '../../services/api';

interface SignInSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Shown to guests before the jump to Google, so the redirect isn't a surprise.
 *  Dialog supplies role=dialog, the focus trap, Esc and focus return to the opener. */
export function SignInSheet({ open, onOpenChange }: SignInSheetProps) {
  const { t } = useLanguage();
  const loginUrl = `${API_BASE_URL || ''}/oauth2/authorization/google`.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            {t('signInSheet.title')}
          </DialogTitle>
          <DialogDescription>{t('signInSheet.text')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => onOpenChange(false)}>
            {t('signInSheet.notNow')}
          </button>
          <a className="btn" href={loginUrl}>
            {t('signInSheet.continue')}
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
