import { useState, useEffect } from 'react'
import type { Waypoint, RouteSettings } from './RoutePlanner'
import { Input } from '@/components/ui/input'
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
  }, [routeSettings.fuelConsumption, routeSettings.fuelCostPerLiter])

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

  // Precision Navigation dark palette helpers
  const inputStyle: React.CSSProperties = {
    background: 'var(--nav-bg-input)',
    border: '1px solid var(--nav-border)',
    color: 'var(--nav-text-primary)',
  }
  const labelStyle: React.CSSProperties = {
    color: 'var(--nav-text-secondary)',
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  }
  const cardStyle: React.CSSProperties = {
    background: 'var(--nav-bg-sidebar)',
    border: '1px solid var(--nav-border)',
    borderRadius: '0.5rem',
  }

  return (
    <div className="space-y-4">
      {/* Route Settings */}
      <div style={cardStyle} className="p-3 space-y-3">
        <div style={{ color: 'var(--nav-text-primary)', fontWeight: 600, fontSize: '0.8rem' }}>
          {t.routeSettings.title}
        </div>

        <div className="space-y-1">
          <label style={labelStyle} htmlFor="fuel-consumption">{t.routeSettings.fuelConsumption}</label>
          <Input
            id="fuel-consumption"
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={fuelConsumptionInput}
            onChange={handleFuelConsumptionChange}
            onBlur={handleFuelConsumptionBlur}
            style={inputStyle}
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1">
          <label style={labelStyle} htmlFor="fuel-cost">{t.routeSettings.fuelCost}</label>
          <Input
            id="fuel-cost"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={fuelCostInput}
            onChange={handleFuelCostChange}
            onBlur={handleFuelCostBlur}
            style={inputStyle}
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-1">
          <label style={labelStyle} htmlFor="currency">{t.routeSettings.currency}</label>
          <select
            id="currency"
            value={routeSettings.currency}
            onChange={(e) => onUpdateSettings({
              ...routeSettings,
              currency: e.target.value as CurrencyCode
            })}
            style={{
              ...inputStyle,
              paddingRight: '2rem',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238892a4' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.5rem center',
            }}
            className="flex h-8 w-full rounded-md px-3 py-1 text-sm appearance-none cursor-pointer"
          >
            {CURRENCIES.map((curr) => (
              <option key={curr.code} value={curr.code}>
                {curr.symbol} {curr.code}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label style={labelStyle} htmlFor="passengers">{t.routeSettings.passengers}</label>
          <Input
            id="passengers"
            type="number"
            min="1"
            max="10"
            value={routeSettings.passengerCount}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10)
              if (!isNaN(value) && value >= 1 && value <= 10) {
                onUpdateSettings({ ...routeSettings, passengerCount: value })
              }
            }}
            style={inputStyle}
            className="h-8 text-sm font-mono"
          />
        </div>
      </div>

      {/* Waypoints List */}
      <div style={cardStyle} className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span style={{ color: 'var(--nav-text-primary)', fontWeight: 600, fontSize: '0.8rem' }}>
            {t.waypoints.title} ({waypoints.length})
          </span>
          {onAddManually && (
            <button
              onClick={onAddManually}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
              style={{
                background: 'var(--nav-bg-input)',
                border: '1px solid var(--nav-border)',
                color: 'var(--nav-accent)',
              }}
            >
              <Plus className="h-3 w-3" />
              {t.buttons.addManually}
            </button>
          )}
        </div>

        {waypoints.length === 0 ? (
          <div className="text-center py-6" style={{ color: 'var(--nav-text-secondary)' }}>
            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs">{t.waypoints.noWaypoints}</p>
            <p className="text-xs mt-1 opacity-70">{t.waypoints.clickMap}</p>
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
                  <div
                    className="waypoint-card flex items-center gap-2 p-2 rounded-lg transition-all duration-200"
                    style={{
                      background: 'var(--nav-bg-input)',
                      border: '1px solid var(--nav-border)',
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <GripVertical
                        className={`h-4 w-4 transition-colors flex-shrink-0 ${
                          isCalculating ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing'
                        }`}
                        style={{ color: 'var(--nav-text-secondary)' }}
                      />
                      <div
                        className="flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold flex-shrink-0"
                        style={{ background: 'var(--nav-accent)', color: '#000' }}
                      >
                        {index + 1}
                      </div>
                      <Input
                        value={waypoint.name}
                        onChange={(e) => onUpdateWaypointName(waypoint.id, e.target.value)}
                        className="h-7 text-xs"
                        style={inputStyle}
                        disabled={isCalculating}
                      />
                    </div>
                    <button
                      className="h-7 w-7 flex items-center justify-center rounded flex-shrink-0 transition-colors disabled:opacity-30"
                      onClick={() => handleDeleteWaypoint(waypoint.id)}
                      disabled={isCalculating || waypoints.length <= 2}
                      title={
                        waypoints.length <= 2
                          ? (language === 'uk' ? 'Потрібно мінімум 2 точки' : 'Minimum 2 waypoints')
                          : (language === 'uk' ? 'Видалити точку' : 'Delete waypoint')
                      }
                      style={{ color: 'var(--nav-danger)' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div
                    className="text-xs px-2 py-0.5 font-mono"
                    style={{ color: 'var(--nav-text-secondary)', fontSize: '0.65rem' }}
                  >
                    {waypoint.lat.toFixed(5)}, {waypoint.lng.toFixed(5)}
                  </div>
                  {index < waypoints.length - 1 && (
                    <div style={{ height: '1px', background: 'var(--nav-border)', margin: '4px 0' }} />
                  )}
                </div>
              )
            })}
            {isCalculating && (
              <div className="flex items-center justify-center gap-2 py-2 text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'var(--nav-accent)' }} />
                {language === 'uk' ? 'Розрахунок маршруту...' : 'Calculating route...'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
