import type { CarSelection } from '../types/Car'

const STORAGE_KEY = 'tc_car_v1'
const FUEL_TYPES = ['petrol', 'diesel', 'lpg']
const SOURCES = ['catalog', 'ai', 'preset', 'manual']

export function loadStoredCar(): CarSelection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CarSelection>
    if (
      typeof parsed.name !== 'string' || parsed.name.length === 0 ||
      !FUEL_TYPES.includes(parsed.fuelType as string) ||
      !SOURCES.includes(parsed.source as string) ||
      typeof parsed.consumption !== 'number' ||
      parsed.consumption < 3.0 || parsed.consumption > 25.0
    ) {
      return null
    }
    return {
      name: parsed.name,
      makeModel: typeof parsed.makeModel === 'string' ? parsed.makeModel : null,
      fuelType: parsed.fuelType as CarSelection['fuelType'],
      consumption: parsed.consumption,
      source: parsed.source as CarSelection['source'],
    }
  } catch {
    return null
  }
}

export function saveStoredCar(car: CarSelection): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(car))
  } catch {
    // storage full/blocked — persistence is best-effort
  }
}

export function clearStoredCar(): void {
  localStorage.removeItem(STORAGE_KEY)
}
