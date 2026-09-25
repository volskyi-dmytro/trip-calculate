// Browser storage that holds personal data: the last route's coordinates,
// planner settings, the chosen car and cached AI answers (which repeat the
// user's prompts). Cleared on logout and on account deletion; language and
// theme preferences stay.
const PERSONAL_LOCAL_KEYS = ['tripCalculate_currentRoute', 'tripCalculate_routeSettings', 'tc_car_v1'];
const AI_CACHE_PREFIX = 'ai_cache_';

export function clearPlannerStorage(): void {
  try {
    for (const key of PERSONAL_LOCAL_KEYS) localStorage.removeItem(key);
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(AI_CACHE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage can be blocked (private mode); then there is nothing to clean up.
  }
}
