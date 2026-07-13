export function routeCalculationKey(
  waypoints: Array<{ id: string; lat: number; lng: number; name: string }>,
): string {
  return JSON.stringify(waypoints.map(({ id, lat, lng, name }) => ({ id, lat, lng, name })))
}

export function resolveRouteCalculation(
  calculationId: number,
  latestCalculationId: number,
  pendingAiRouteKey: string | null,
  completedRouteKey: string,
  routeDistance: number,
): { apply: boolean; revealAiResult: boolean } {
  const apply = calculationId === latestCalculationId
  return {
    apply,
    revealAiResult:
      apply &&
      pendingAiRouteKey === completedRouteKey &&
      routeDistance > 0,
  }
}
