import { foldText, matchCatalogCar, type CatalogEntry } from './carCatalog'
import type { FuelType, GarageCar } from '../types/Car'

const TOLERANCE = 0.01

export function matchingCarId(
  cars: GarageCar[],
  fuelType: FuelType,
  consumption: number,
): number | null {
  const match = cars.find(
    (car) => car.fuelType === fuelType
      && Math.abs(car.fuelConsumption - consumption) < TOLERANCE,
  )
  return match ? match.id : null
}

/** Finds a garage car the user's own free-text message names by make/model
 * or nickname (e.g. "diesel Skoda Superb" → the garage's "Skoda Superb"),
 * case-insensitive. Returns null when nothing in the garage is mentioned. */
export function carMentionedInText(
  cars: GarageCar[],
  text: string,
  catalog: CatalogEntry[] = [],
): GarageCar | null {
  // Diacritic-insensitive and engine-agnostic: "skoda superb" must find the
  // garage's "Škoda Superb 2.0 TDI" (audit #7), and with the catalog loaded
  // the Cyrillic aliases ("шкода суперб") match too.
  const haystack = ` ${foldText(text)} `
  return cars.find((car) => {
    const needles = [car.makeModel, car.name].filter((n): n is string => Boolean(n && n.trim()))
    const known = matchCatalogCar(car.makeModel ?? car.name, catalog)?.entry
      ?? catalog.find((e) => needles.some((n) => foldText(n).startsWith(foldText(`${e.make} ${e.model}`))))
    if (known) needles.push(`${known.make} ${known.model}`, ...known.aliases)
    return needles.some((needle) => haystack.includes(` ${foldText(needle)} `))
  }) ?? null
}

/** Which garage car (if any) an AI trip result should apply, ahead of a
 * generic AI-guessed fuel category: a car the user's message names beats
 * everything; otherwise the garage default fills in only when the AI gave
 * no car-specific guess of its own. */
export function preferredCarForAiResult(
  cars: GarageCar[],
  message: string,
  agentGaveCarDetails: boolean,
  catalog: CatalogEntry[] = [],
): GarageCar | null {
  const mentioned = carMentionedInText(cars, message, catalog)
  if (mentioned) return mentioned
  if (!agentGaveCarDetails) return cars.find((c) => c.isDefault) ?? null
  return null
}
