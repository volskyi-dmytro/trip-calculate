// Single import() site for the planner route so the lazy route and the
// hover/focus/touch prefetch share one chunk and one request.
export const loadRoutePlanner = () => import('../pages/RoutePlannerPage');

let prefetched = false;
export function prefetchRoutePlanner() {
  if (prefetched) return;
  prefetched = true;
  loadRoutePlanner().catch(() => {
    prefetched = false; // allow a retry after a network failure
  });
}
