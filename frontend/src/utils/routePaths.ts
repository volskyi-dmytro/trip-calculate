import type { Language } from '../types'
import { withLocalePrefix } from './locale'

export function routeEditPath(routeId: number, language: Language): string {
  return withLocalePrefix(`/route-planner?routeId=${routeId}`, language)
}
