import { useId, useState } from 'react'
import { Loader2, Route as RouteIcon } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { PlaceCombobox } from './PlaceCombobox'
import { useLanguage } from '../contexts/LanguageContext'
import { geocodingService, type Place } from '../services/geocodingService'
import { routingService } from '../services/routingService'
import { track } from '../lib/analytics'

interface DistanceFinderProps {
  /** Called with the road distance in km (rounded to whole km). */
  onDistance: (km: number) => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; km: number; from: string; to: string }
  | { kind: 'error' }

/** "Don't know the distance?" — From/To fields that fill the quick estimate's
 *  distance with a real road route (same routing the planner and city pages use). */
export function DistanceFinder({ onDistance }: DistanceFinderProps) {
  const { language, t } = useLanguage()
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [fromText, setFromText] = useState('')
  const [toText, setToText] = useState('')
  const [fromPlace, setFromPlace] = useState<Place | null>(null)
  const [toPlace, setToPlace] = useState<Place | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const resolve = async (picked: Place | null, text: string) => {
    if (picked && picked.name === text) return { lat: picked.lat, lng: picked.lng, name: picked.name }
    const found = await geocodingService.forwardGeocode(text, language)
    return found ? { lat: found.lat, lng: found.lng, name: text.trim() } : null
  }

  const find = async () => {
    if (!fromText.trim() || !toText.trim() || status.kind === 'loading') return
    setStatus({ kind: 'loading' })
    try {
      const [a, b] = await Promise.all([resolve(fromPlace, fromText), resolve(toPlace, toText)])
      if (!a || !b) throw new Error('not found')
      const route = await routingService.getRoute([a, b])
      if (!(route.totalDistance > 0) || route.quality === 'unavailable') throw new Error('no route')
      const km = Math.round(route.totalDistance)
      onDistance(km)
      setStatus({ kind: 'found', km, from: a.name, to: b.name })
      track('quick_estimate_distance_lookup', { success: true, quality: route.quality })
    } catch {
      setStatus({ kind: 'error' })
      track('quick_estimate_distance_lookup', { success: false })
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center min-h-11 text-sm text-primary hover:underline"
        aria-expanded={false}
      >
        <RouteIcon className="mr-1 h-4 w-4" aria-hidden="true" />
        {t('quickCalc.findDistance')}
      </button>
    )
  }

  const busy = status.kind === 'loading'
  return (
    <div className="mt-2 space-y-2 rounded-md border border-slate-200 dark:border-slate-700 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <Label htmlFor={`${uid}-from`} className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t('quickCalc.from')}
          </Label>
          <PlaceCombobox
            id={`${uid}-from`}
            label={t('quickCalc.from')}
            language={language}
            placeholder={t('quickCalc.fromPlaceholder')}
            value={fromText}
            onChange={(v) => { setFromText(v); setFromPlace(null) }}
            onPick={setFromPlace}
            onSubmit={find}
            className="mt-1 w-full"
          />
        </div>
        <div className="relative">
          <Label htmlFor={`${uid}-to`} className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t('quickCalc.to')}
          </Label>
          <PlaceCombobox
            id={`${uid}-to`}
            label={t('quickCalc.to')}
            language={language}
            placeholder={t('quickCalc.toPlaceholder')}
            value={toText}
            onChange={(v) => { setToText(v); setToPlace(null) }}
            onPick={setToPlace}
            onSubmit={find}
            className="mt-1 w-full"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={find}
        disabled={busy || !fromText.trim() || !toText.trim()}
        className="btn btn-secondary w-full disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RouteIcon className="h-4 w-4" aria-hidden="true" />}
        {busy ? t('quickCalc.findingDistance') : t('quickCalc.getDistance')}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-slate-600 dark:text-slate-300 min-h-5">
        {status.kind === 'found' && t('quickCalc.distanceFound')
          .replace('{from}', status.from)
          .replace('{to}', status.to)
          .replace('{km}', String(status.km))}
        {status.kind === 'error' && <span className="text-destructive">{t('quickCalc.distanceNotFound')}</span>}
      </p>
    </div>
  )
}
