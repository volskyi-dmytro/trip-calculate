import { useMemo } from 'react';

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

type SeasonAssets = { desktop: string; mobile: string; ambient: string };

// One season value drives all three files, so hero and ambient can't disagree.
// Built by frontend/scripts/build-season-art.py; versioned dir so a future art
// set never collides with cached copies of this one.
export const seasonAssets: Record<Season, SeasonAssets> = {
  winter: {
    desktop: '/images/seasons-v1/winter-desktop.webp',
    mobile: '/images/seasons-v1/winter-mobile.webp',
    ambient: '/images/seasons-v1/winter-ambient.webp',
  },
  spring: {
    desktop: '/images/seasons-v1/spring-desktop.webp',
    mobile: '/images/seasons-v1/spring-mobile.webp',
    ambient: '/images/seasons-v1/spring-ambient.webp',
  },
  summer: {
    desktop: '/images/seasons-v1/summer-desktop.webp',
    mobile: '/images/seasons-v1/summer-mobile.webp',
    ambient: '/images/seasons-v1/summer-ambient.webp',
  },
  autumn: {
    desktop: '/images/seasons-v1/autumn-desktop.webp',
    mobile: '/images/seasons-v1/autumn-mobile.webp',
    ambient: '/images/seasons-v1/autumn-ambient.webp',
  },
};

/** Northern-hemisphere meteorological seasons, in the visitor's local time. */
export function getSeason(date: Date): Season {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

export function useSeason(): Season {
  return useMemo(() => {
    // Dev-only preview fixture (`?season=winter`) for inspecting every season
    // without touching the OS clock. Dead-code-eliminated from prod builds.
    if (import.meta.env.DEV) {
      const forced = new URLSearchParams(window.location.search).get('season');
      if (forced && forced in seasonAssets) return forced as Season;
    }
    return getSeason(new Date());
  }, []);
}
