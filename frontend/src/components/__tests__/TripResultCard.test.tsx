import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Waypoint, RouteSettings } from '../RoutePlanner'

vi.mock('../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }))
vi.mock('../WeatherStrip', () => ({ WeatherStrip: () => null }))

const { TripResultCard } = await import('../TripResultCard')

const waypoints: Waypoint[] = [
  { id: 'a', lat: 50.7451, lng: 25.3201, name: 'Lutsk, Ukraine' },
  { id: 'b', lat: 50.0614, lng: 19.9383, name: '50.74507, 25.32008' },
]

const baseSettings: RouteSettings = {
  fuelConsumption: 7,
  fuelCostPerLiter: 55,
  currency: 'UAH',
  passengerCount: 1,
  fuelType: 'diesel',
  fuelPriceTouched: false,
}

const suggestion = { price: 55, currency: 'UAH', stale: false, fetchedAt: '2026-01-01', source: 'test' }

describe('TripResultCard', () => {
  it('labels the price "live" only when it is the one actually used', () => {
    const html = renderToStaticMarkup(
      <TripResultCard
        waypoints={waypoints}
        routeSettings={baseSettings}
        routeDistance={100}
        routeDuration={90}
        fuelSuggestion={suggestion}
        weather={null}
        onSaveRoute={() => {}}
        onShareReceipt={() => {}}
      />,
    )
    expect(html).toContain('live price')
  })

  it('offers "use live price" instead of the live badge once the price has been overridden', () => {
    const html = renderToStaticMarkup(
      <TripResultCard
        waypoints={waypoints}
        routeSettings={{ ...baseSettings, fuelCostPerLiter: 89.99, fuelPriceTouched: true }}
        routeDistance={100}
        routeDuration={90}
        fuelSuggestion={suggestion}
        weather={null}
        onSaveRoute={() => {}}
        onShareReceipt={() => {}}
        onApplyLivePrice={() => {}}
      />,
    )
    expect(html).not.toContain('· live price')
    expect(html).toContain('Use live price')
  })

  it('never shows a raw coordinate pair as a stop name', () => {
    const html = renderToStaticMarkup(
      <TripResultCard
        waypoints={waypoints}
        routeSettings={baseSettings}
        routeDistance={100}
        routeDuration={90}
        fuelSuggestion={null}
        weather={null}
        onSaveRoute={() => {}}
        onShareReceipt={() => {}}
      />,
    )
    expect(html).not.toContain('50.74507')
    expect(html).toContain('Waypoint 2')
  })

  const card = (quality: 'road' | 'approximate' | 'unavailable', distance: number) =>
    renderToStaticMarkup(
      <TripResultCard
        waypoints={waypoints}
        routeSettings={baseSettings}
        routeDistance={distance}
        routeDuration={0}
        routeQuality={quality}
        fuelSuggestion={null}
        weather={null}
        onSaveRoute={() => {}}
        onShareReceipt={() => {}}
      />,
    )

  it('labels an outage estimate approximate and blocks receipt sharing', () => {
    const html = card('approximate', 0)
    expect(html).toContain('Approximate')
    expect(html).toContain('≈')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Share/s)
  })

  it('does not allow a receipt when there is no route', () => {
    expect(card('unavailable', 0)).toMatch(/<button[^>]*disabled/)
  })

  it('shows a road route without warnings and shareable', () => {
    const html = card('road', 100)
    expect(html).not.toContain('Approximate')
    expect(html).not.toMatch(/<button[^>]*disabled/)
  })
})
