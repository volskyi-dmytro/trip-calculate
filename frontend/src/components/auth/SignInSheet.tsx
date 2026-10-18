import { useEffect } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { buildLoginUrl } from '../../utils/loginUrl';
import { track } from '../../lib/analytics';

export type SignInReason = 'general' | 'save' | 'ai';

interface SignInSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Why we ask: changes the title so the request matches what the user just tried to do. */
  reason?: SignInReason;
  /** Where to land after Google (path + query). Defaults to the current page. */
  returnTo?: string;
  /** Analytics label for where the dialog was opened from. */
  source?: string;
  /** Called right before leaving for Google (e.g. to stash a draft trip). */
  onBeforeLogin?: () => void;
  /** Shows "your trip stays here" when there is work in progress to restore. */
  hasDraft?: boolean;
}

/** Shown before the jump to Google, so the redirect isn't a surprise.
 *  Dialog supplies role=dialog, the focus trap, Esc and focus return to the opener. */
export function SignInSheet({
  open, onOpenChange, reason = 'general', returnTo, source = 'unknown', onBeforeLogin, hasDraft = false,
}: SignInSheetProps) {
  const { t } = useLanguage();
  const { login } = useAuth();
  const titleKey = reason === 'save' ? 'signInSheet.title.save' : reason === 'ai' ? 'signInSheet.title.ai' : 'signInSheet.title';

  useEffect(() => {
    if (open) track('signin_dialog_open', { source, reason });
  }, [open, source, reason]);

  const close = () => {
    track('signin_dismiss', { source, reason });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="mx-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            {t(titleKey)}
          </DialogTitle>
          <DialogDescription>{t('signInSheet.text')}</DialogDescription>
        </DialogHeader>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{t('signInSheet.privacy')}</span>
        </p>
        {hasDraft && <p className="text-sm text-muted-foreground">{t('signInSheet.restoreNote')}</p>}
        <DialogFooter className="gap-2">
          <button type="button" className="btn btn-secondary" onClick={close}>
            {t('signInSheet.notNow')}
          </button>
          <a
            className="btn"
            href={buildLoginUrl(returnTo)}
            onClick={(e) => {
              e.preventDefault();
              onBeforeLogin?.();
              login(returnTo, source);
            }}
          >
            {t('signInSheet.continue')}
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
