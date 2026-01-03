import { useState, useEffect } from 'react'
import type { Waypoint, RouteSettings } from './RoutePlanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MapPin, Trash2, GripVertical, Plus, Loader2 } from 'lucide-react'
import type { Language } from '../types'
import { getTranslation } from '../i18n/routePlanner'
import { useLanguage } from '../contexts/LanguageContext'
import { toast } from 'sonner'

// Currency options with symbols
const CURRENCIES = [
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' }
] as const

type CurrencyCode = 'UAH' | 'USD' | 'EUR'

interface RoutePanelProps {
  waypoints: Waypoint[]
  routeSettings: RouteSettings
  onUpdateWaypointName: (id: string, name: string) => void
  onRemoveWaypoint: (id: string) => void
  onReorderWaypoints: (waypoints: Waypoint[]) => void
  onUpdateSettings: (settings: RouteSettings) => void
  onAddManually?: () => void
  isCalculating?: boolean
}

export function RoutePanel({
  waypoints,
  routeSettings,
  onUpdateWaypointName,
  onRemoveWaypoint,
  onReorderWaypoints,
  onUpdateSettings,
  onAddManually,
  isCalculating = false,
}: RoutePanelProps) {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)

  // Local state for text inputs (to allow empty strings and decimals)
  const [fuelConsumptionInput, setFuelConsumptionInput] = useState<string>('')
  const [fuelCostInput, setFuelCostInput] = useState<string>('')

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Initialize local state from routeSettings
  useEffect(() => {
    setFuelConsumptionInput(routeSettings.fuelConsumption > 0 ? routeSettings.fuelConsumption.toString() : '')
    setFuelCostInput(routeSettings.fuelCostPerLiter > 0 ? routeSettings.fuelCostPerLiter.toString() : '')
  }, [])

  // Handle fuel consumption input change
  const handleFuelConsumptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value

    // Allow empty string (user is clearing the field)
    if (value === '') {
      setFuelConsumptionInput('')
      onUpdateSettings({
        ...routeSettings,
        fuelConsumption: 0
      })
      return
    }

    // Replace comma with period for internal storage
    value = value.replace(',', '.')

    // Only allow valid numeric input with one decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setFuelConsumptionInput(value)

      // Update parent with numeric value
      const numValue = parseFloat(value)
      if (!isNaN(numValue) && numValue >= 0) {
        onUpdateSettings({
          ...routeSettings,
          fuelConsumption: numValue
        })
      }
    }
  }

  // Validate fuel consumption on blur
  const handleFuelConsumptionBlur = () => {
    if (fuelConsumptionInput === '' || fuelConsumptionInput === '.') {
      setFuelConsumptionInput('')
      onUpdateSettings({
        ...routeSettings,
        fuelConsumption: 0
      })
      return
    }

    const numValue = parseFloat(fuelConsumptionInput)

    // Ensure valid positive number
    if (isNaN(numValue) || numValue < 0) {
      setFuelConsumptionInput('')
      onUpdateSettings({
        ...routeSettings,
        fuelConsumption: 0
      })
    } else {
      // Clean up the display
      setFuelConsumptionInput(numValue.toString())
      onUpdateSettings({
        ...routeSettings,
        fuelConsumption: numValue
      })
    }
  }

  // Handle fuel cost input change
  const handleFuelCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value

    // Allow empty string (user is clearing the field)
    if (value === '') {
      setFuelCostInput('')
      onUpdateSettings({
        ...routeSettings,
        fuelCostPerLiter: 0
      })
      return
    }

    // Replace comma with period for internal storage
    value = value.replace(',', '.')

    // Only allow valid numeric input with one decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setFuelCostInput(value)

      // Update parent with numeric value
      const numValue = parseFloat(value)
      if (!isNaN(numValue) && numValue >= 0) {
        onUpdateSettings({
          ...routeSettings,
          fuelCostPerLiter: numValue
        })
      }
    }
  }

  // Validate fuel cost on blur
  const handleFuelCostBlur = () => {
    if (fuelCostInput === '' || fuelCostInput === '.') {
      setFuelCostInput('')
      onUpdateSettings({
        ...routeSettings,
        fuelCostPerLiter: 0
      })
      return
    }

    const numValue = parseFloat(fuelCostInput)

    // Ensure valid positive number
    if (isNaN(numValue) || numValue < 0) {
      setFuelCostInput('')
      onUpdateSettings({
        ...routeSettings,
        fuelCostPerLiter: 0
      })
    } else {
      // Clean up the display
      setFuelCostInput(numValue.toString())
      onUpdateSettings({
        ...routeSettings,
        fuelCostPerLiter: numValue
      })
    }
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isCalculating) {
      e.preventDefault()
      return
    }
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML)
    // Add a slight delay to allow the drag ghost to render
    setTimeout(() => {
      (e.target as HTMLElement).style.opacity = '0.4'
    }, 0)
  }

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1'
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    if (draggedIndex === null || draggedIndex === index) return

    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()

    if (draggedIndex === null || draggedIndex === dropIndex || isCalculating) return

    // Reorder waypoints array
    const reorderedWaypoints = [...waypoints]
    const [draggedWaypoint] = reorderedWaypoints.splice(draggedIndex, 1)
    reorderedWaypoints.splice(dropIndex, 0, draggedWaypoint)

    onReorderWaypoints(reorderedWaypoints)

    setDraggedIndex(null)
    setDragOverIndex(null)

    toast.success(
      language === 'uk' ? 'Точку маршруту переміщено' : 'Waypoint reordered',
      { duration: 2000 }
    )
  }

  const handleDeleteWaypoint = (id: string) => {
    if (waypoints.length <= 2) {
      toast.error(
        language === 'uk'
          ? 'Потрібно мінімум 2 точки для маршруту'
          : 'Minimum 2 waypoints required',
        { duration: 3000 }
      )
      return
    }

    if (isCalculating) {
      toast.error(
        language === 'uk'
          ? 'Зачекайте завершення розрахунку'
          : 'Wait for calculation to finish',
        { duration: 3000 }
      )
      return
    }

    onRemoveWaypoint(id)
  }

  return (
    <div className="p-4 space-y-4">
      {/* Route Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t.routeSettings.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fuel-consumption">{t.routeSettings.fuelConsumption}</Label>
            <Input
              id="fuel-consumption"
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={fuelConsumptionInput}
              onChange={handleFuelConsumptionChange}
              onBlur={handleFuelConsumptionBlur}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fuel-cost">{t.routeSettings.fuelCost}</Label>
            <Input
              id="fuel-cost"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={fuelCostInput}
              onChange={handleFuelCostChange}
              onBlur={handleFuelCostBlur}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">{t.routeSettings.currency}</Label>
            <select
              id="currency"
              value={routeSettings.currency}
              onChange={(e) => onUpdateSettings({
                ...routeSettings,
                currency: e.target.value as CurrencyCode
              })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-white [&>option]:text-gray-900 dark:[&>option]:bg-gray-800 dark:[&>option]:text-white"
            >
              {CURRENCIES.map((curr) => (
                <option key={curr.code} value={curr.code}>
                  {curr.symbol} {curr.code}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Waypoints List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>{t.waypoints.title} ({waypoints.length})</span>
            {onAddManually && (
              <Button
                size="sm"
                variant="outline"
                onClick={onAddManually}
              >
                <Plus className="h-4 w-4 mr-1" />
                {t.buttons.addManually}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {waypoints.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t.waypoints.noWaypoints}</p>
              <p className="text-xs mt-1">{t.waypoints.clickMap}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {waypoints.map((waypoint, index) => {
                const isDragging = draggedIndex === index
                const isDropTarget = dragOverIndex === index && draggedIndex !== index

                return (
                  <div
                    key={waypoint.id}
                    draggable={!isCalculating}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    className={`
                      waypoint-card-wrapper
                      ${isDragging ? 'dragging' : ''}
                      ${isDropTarget ? 'drop-target' : ''}
                      ${isCalculating ? 'calculating' : ''}
                    `}
                  >
                    <div className="waypoint-card flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-all duration-200">
                      <div className="flex items-center gap-2 flex-1">
                        <GripVertical
                          className={`h-4 w-4 text-muted-foreground transition-colors ${
                            isCalculating ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'
                          }`}
                        />
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-[#4ECDC4] to-[#556FE6] text-white text-xs font-bold shadow-sm">
                          {index + 1}
                        </div>
                        <Input
                          value={waypoint.name}
                          onChange={(e) => onUpdateWaypointName(waypoint.id, e.target.value)}
                          className="h-8"
                          disabled={isCalculating}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        onClick={() => handleDeleteWaypoint(waypoint.id)}
                        disabled={isCalculating || waypoints.length <= 2}
                        title={
                          waypoints.length <= 2
                            ? (language === 'uk' ? 'Потрібно мінімум 2 точки' : 'Minimum 2 waypoints')
                            : (language === 'uk' ? 'Видалити точку' : 'Delete waypoint')
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground px-3 py-1">
                      {waypoint.lat.toFixed(5)}, {waypoint.lng.toFixed(5)}
                    </div>
                    {index < waypoints.length - 1 && (
                      <Separator className="my-2" />
                    )}
                  </div>
                )
              })}
              {isCalculating && (
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-[#4ECDC4]" />
                  {language === 'uk' ? 'Розрахунок маршруту...' : 'Calculating route...'}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
