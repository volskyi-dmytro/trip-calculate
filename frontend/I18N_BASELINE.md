# i18n Translation Baseline

**Audit Date:** 2026-04-26  
**Status:** COMPLETE - All translations in sync

## Overview

TripCalculate uses two separate translation files for different feature areas:

1. **Main Application** (`frontend/src/contexts/LanguageContext.tsx`) - Core app sections
2. **Route Planner Feature** (`frontend/src/i18n/routePlanner.ts`) - Dedicated route planning UI

Both files support two languages:
- `en` - English
- `uk` - Ukrainian (NOT `ua`)

## Translation Files

### 1. LanguageContext.tsx

**Purpose:** Flat key-value translations for header, navigation, dashboard, admin, FAQ, calculator, and footer sections.

**Key Count:**
- EN: 251 keys
- UK: 251 keys
- **Status:** Perfectly in sync

**Coverage:**
- `header.*` - Navigation and login
- `intro.*` - Homepage introduction and features
- `faq.*` - Frequently asked questions
- `calculator.*` - Trip expense calculator
- `dashboard.*` - User dashboard (profile, stats, routes, settings, quick actions, security)
- `admin.*` - Admin dashboard (overview, users, access requests, user details)
- `footer.*` - Footer links
- `userMenu.*` - User menu items

**Notes:**
- All keys present in both EN and UK
- No placeholder values ("TODO", "MISSING")
- No untranslated English strings in UK section
- Ukrainian translations use natural phrasing with correct grammar

### 2. routePlanner.ts

**Purpose:** Nested translations for route planner feature (beta access, buttons, dialogs, toasts, settings).

**Key Count:**
- EN: 130 keys (across nested structure)
- UK: 130 keys (across nested structure)
- **Status:** Perfectly in sync

**Coverage:**
- `title` - Main feature title
- `betaAccess.*` - Beta access request UI
- `buttons.*` - All action buttons
- `routeSettings.*` - Route configuration options
- `waypoints.*` - Waypoint management labels
- `routeSummary.*` - Route statistics display
- `routeSegments.*` - Segment information
- `costBreakdown.*` - Cost calculation details
- `dialogs.*` - Modal dialogs (save, load, manual add)
- `toasts.*` - Toast notifications and messages

**Notes:**
- All keys present in both EN and UK
- Nested structure matches perfectly
- No placeholder values
- Ukrainian translations are idiomatic and contextually appropriate

## Key Structure Pattern

Both files use the same pattern for key organization:

```
{namespace}.{feature}.{element}
```

Examples:
- `dashboard.editProfile.save` - Save button in edit profile
- `routePlannerTranslations.buttons.saveRoute` - Save route button

## Cross-File Consistency

| Concept | LanguageContext | routePlanner |
|---------|-----------------|--------------|
| Fuel consumption | `calculator.fuelConsumption` | `routeSettings.fuelConsumption` |
| Fuel cost | `calculator.fuelCost` | `routeSettings.fuelCost` |
| Passengers | Not in calculator | `routeSettings.passengers` |
| Save button | Various sections | `buttons.save` |
| Clear/Cancel | Various sections | `buttons.clear`, `buttons.cancel` |
| Distance unit | (in values) | `dialogs.load.routeInfo: 'km'` |

**Note:** The route planner has its own isolated translations and does not depend on LanguageContext keys for its UI.

## Audit Findings

**Date:** 2026-04-26

### Issues Found and Fixed

**LanguageContext.tsx:**
- ✓ No missing keys
- ✓ No mismatches between EN and UK
- ✓ No placeholder values
- ✓ All Ukrainian translations are natural and grammatically correct

**routePlanner.ts:**
- ✓ No missing keys
- ✓ No mismatches between EN and UK
- ✓ No placeholder values
- ✓ All Ukrainian translations are natural and grammatically correct

### Summary

Both translation files were already in perfect sync. No fixes were required. All 381 translation keys (251 in LanguageContext + 130 in routePlanner) are:
- Present in both EN and UK
- Free of placeholders and incomplete translations
- Contextually appropriate and grammatically sound

## Next Steps

1. When adding new features:
   - Add keys to both EN and UK simultaneously
   - For route planner features: update `routePlanner.ts`
   - For global features: update `LanguageContext.tsx`
   - Ensure both languages are filled before merging

2. For Ukrainian translations:
   - Use native speakers for validation (already done for this baseline)
   - Consider regional conventions (e.g., formal vs. informal "you")

3. Future i18n expansion:
   - Language codes: strictly use `en`, `uk` (NOT `ua`)
   - Consider adding more languages following the same structure
   - Types are defined in `frontend/src/types.ts` - update `Language` type when adding new languages

## Files Modified

- **Created:** This document (`frontend/I18N_BASELINE.md`)
