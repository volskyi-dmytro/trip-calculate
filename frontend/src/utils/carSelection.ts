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
