import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface BlockingError {
  title: string
  description: string
}

/**
 * A failure the user must read before carrying on (no road route, AI limit,
 * AI couldn't process the request). Unlike a toast it stays until dismissed.
 * Routine notices stay toasts, so this remains rare enough to be read.
 */
export function BlockingErrorDialog({ error, onClose, acknowledgeLabel }: {
  error: BlockingError | null
  onClose: () => void
  acknowledgeLabel: string
}) {
  return (
    <Dialog open={error !== null} onOpenChange={(open) => { if (!open) onClose() }} role="alertdialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{error?.title}</DialogTitle>
          <DialogDescription>{error?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>{acknowledgeLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
