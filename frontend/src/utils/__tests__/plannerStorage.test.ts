/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { clearPlannerStorage } from '../plannerStorage'

describe('clearPlannerStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('removes saved route coordinates, settings, car and cached AI answers', () => {
    localStorage.setItem('tripCalculate_currentRoute', '[{"lat":50.45,"lng":30.52}]')
    localStorage.setItem('tripCalculate_routeSettings', '{}')
    localStorage.setItem('tc_car_v1', '{}')
    sessionStorage.setItem('ai_cache_abc', '{"prompt":"from my home"}')

    clearPlannerStorage()

    expect(localStorage.getItem('tripCalculate_currentRoute')).toBeNull()
    expect(localStorage.getItem('tripCalculate_routeSettings')).toBeNull()
    expect(localStorage.getItem('tc_car_v1')).toBeNull()
    expect(sessionStorage.getItem('ai_cache_abc')).toBeNull()
  })

  it('keeps preferences that are not personal data', () => {
    localStorage.setItem('language', 'uk')
    localStorage.setItem('theme', 'dark')

    clearPlannerStorage()

    expect(localStorage.getItem('language')).toBe('uk')
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})
