import { useState, useEffect } from 'react'
import type { Waypoint, RouteSettings } from './RoutePlanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MapPin, Trash2, GripVertical, Plus } from 'lucide-react'
import type { Language } from '../types'
import { getTranslation } from '../i18n/routePlanner'
import { useLanguage } from '../contexts/LanguageContext'

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
  onUpdateSettings: (settings: RouteSettings) => void
  onAddManually?: () => void
}

export function RoutePanel({
  waypoints,
  routeSettings,
  onUpdateWaypointName,
  onRemoveWaypoint,
  onUpdateSettings,
  onAddManually,
}: RoutePanelProps) {
  const { language } = useLanguage()
  const t = getTranslation(language as Language)

  // Local state for text inputs (to allow empty strings and decimals)
  const [fuelConsumptionInput, setFuelConsumptionInput] = useState<string>('')
  const [fuelCostInput, setFuelCostInput] = useState<string>('')

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
              {waypoints.map((waypoint, index) => (
                <div key={waypoint.id}>
                  <div className="flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-2 flex-1">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {index + 1}
                      </div>
                      <Input
                        value={waypoint.name}
                        onChange={(e) => onUpdateWaypointName(waypoint.id, e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onRemoveWaypoint(waypoint.id)}
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
