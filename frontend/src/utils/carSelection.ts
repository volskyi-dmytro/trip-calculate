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
export function carMentionedInText(cars: GarageCar[], text: string): GarageCar | null {
  const haystack = text.toLowerCase()
  return cars.find((car) => {
    const needles = [car.makeModel, car.name].filter((n): n is string => Boolean(n && n.trim()))
    return needles.some((needle) => haystack.includes(needle.toLowerCase()))
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
): GarageCar | null {
  const mentioned = carMentionedInText(cars, message)
  if (mentioned) return mentioned
  if (!agentGaveCarDetails) return cars.find((c) => c.isDefault) ?? null
  return null
}
