import { describe, expect, it } from 'vitest'
import { routeEditPath } from '../routePaths'

describe('routeEditPath', () => {
  it('keeps the route id while prefixing the edit URL with the active locale', () => {
    expect(routeEditPath(42, 'en')).toBe('/en/route-planner?routeId=42')
    expect(routeEditPath(42, 'uk')).toBe('/uk/route-planner?routeId=42')
  })
})
