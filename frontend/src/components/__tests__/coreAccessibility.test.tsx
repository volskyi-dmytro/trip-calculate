import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../contexts/LanguageContext'
import { QuickCalculator } from '../QuickCalculator'
import { ProfileCard } from '../dashboard/ProfileCard'
import { RoutesList } from '../dashboard/RoutesList'
import { TopChatBar } from '../TopChatBar'
import { ChatInterface } from '../ChatInterface'
import { RoutePanel } from '../RoutePanel'

function renderEnglish(node: React.ReactNode) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/en']}>
      <LanguageProvider>{node}</LanguageProvider>
    </MemoryRouter>,
  )
}

describe('core control accessibility', () => {
  it('associates quick calculator labels and names passenger controls', () => {
    const html = renderEnglish(<QuickCalculator />)

    for (const id of ['quick-distance', 'quick-passengers', 'quick-consumption', 'quick-fuel-price', 'quick-currency']) {
      expect(html).toContain(`for="${id}"`)
      expect(html).toContain(`id="${id}"`)
    }
    expect(html).toContain('aria-label="Decrease passengers"')
    expect(html).toContain('aria-label="Increase passengers"')
  })

  it('names dashboard edit, delete and sort controls', () => {
    const profileHtml = renderEnglish(
      <ProfileCard
        profile={{
          id: 1,
          email: 'test@example.com',
          name: 'Test User',
          pictureUrl: '',
          createdAt: '2026-01-01T00:00:00Z',
          lastLogin: '2026-01-02T00:00:00Z',
          role: 'USER',
          preferredLanguage: 'en',
          emailNotificationsEnabled: true,
          routePlannerAccess: true,
        }}
        onProfileUpdate={() => undefined}
      />,
    )
    expect(profileHtml).toContain('aria-label="Edit Profile"')

    const routesHtml = renderEnglish(
      <RoutesList
        routes={[{
          id: 7,
          name: 'Test Route',
          waypointCount: 2,
          totalDistance: 100,
          totalCost: 20,
          currency: 'UAH',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }]}
        onRouteDeleted={() => undefined}
      />,
    )
    expect(routesHtml).toContain('for="route-sort"')
    expect(routesHtml).toContain('id="route-sort"')
    expect(routesHtml).toContain('aria-label="Delete Test Route"')
  })

  it('names the AI send action', () => {
    const html = renderEnglish(
      <TopChatBar chatInput="Kyiv to Lviv" onChatInputChange={() => undefined}
        onSendMessage={() => undefined} isProcessing={false} />,
    )
    expect(html).toContain('aria-label="Send message"')

    const welcomeChatHtml = renderEnglish(
      <ChatInterface messages={[]} chatInput="Kyiv to Lviv"
        onChatInputChange={() => undefined} onSendMessage={() => undefined}
        isProcessing={false} />,
    )
    expect(welcomeChatHtml).toContain('aria-label="Send message"')
  })

  it('names editable waypoint fields', () => {
    const html = renderEnglish(
      <RoutePanel
        waypoints={[{ id: '1', name: 'Kyiv', lat: 50.45, lng: 30.52 }]}
        routeSettings={{
          fuelConsumption: 7,
          fuelCostPerLiter: 60,
          currency: 'UAH',
          passengerCount: 2,
          fuelType: 'petrol',
          fuelPriceTouched: false,
        }}
        onUpdateWaypointName={() => undefined}
        onRemoveWaypoint={() => undefined}
        onReorderWaypoints={() => undefined}
        onUpdateSettings={() => undefined}
        fuelSuggestion={null}
        onApplyFuelSuggestion={() => undefined}
        weather={null}
        departureDate="2026-07-14"
        onDepartureDateChange={() => undefined}
      />,
    )
    expect(html).toContain('aria-label="Waypoint 1: Kyiv"')
    expect(html).toContain('aria-label="Delete waypoint 1: Kyiv"')
  })
})
