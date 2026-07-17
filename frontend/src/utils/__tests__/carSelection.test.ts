import { describe, it, expect } from 'vitest'
import { matchingCarId } from '../carSelection'
import type { GarageCar } from '../../types/Car'

describe('matchingCarId', () => {
  const cars: GarageCar[] = [
    {
      id: 1,
      name: 'Peugeot 307',
      makeModel: 'Peugeot 307 2003-2008',
      fuelType: 'diesel',
      fuelConsumption: 7.2,
      isDefault: false,
      source: 'catalog',
    },
    {
      id: 2,
      name: 'Volkswagen Golf',
      makeModel: 'Volkswagen Golf 2.0 TDI',
      fuelType: 'diesel',
      fuelConsumption: 6.5,
      isDefault: true,
      source: 'catalog',
    },
    {
      id: 3,
      name: 'Ford Focus',
      makeModel: 'Ford Focus Petrol',
      fuelType: 'petrol',
      fuelConsumption: 8.9,
      isDefault: false,
      source: 'catalog',
    },
  ]

  it('returns the id when fuel type and consumption match exactly', () => {
    expect(matchingCarId(cars, 'diesel', 7.2)).toBe(1)
  })

  it('returns the id when consumption is off by 0.005 (within tolerance)', () => {
    expect(matchingCarId(cars, 'diesel', 7.205)).toBe(1)
    expect(matchingCarId(cars, 'diesel', 7.195)).toBe(1)
  })

  it('returns null when consumption is off by 0.1 (outside tolerance)', () => {
    expect(matchingCarId(cars, 'diesel', 7.3)).toBeNull()
    expect(matchingCarId(cars, 'diesel', 7.1)).toBeNull()
  })

  it('returns null when fuel type does not match', () => {
    expect(matchingCarId(cars, 'petrol', 7.2)).toBeNull()
  })

  it('returns null when no matching car exists', () => {
    expect(matchingCarId(cars, 'lpg', 5.0)).toBeNull()
  })

  it('returns the first matching car when two cars are identical', () => {
    const carsWithDuplicate: GarageCar[] = [
      ...cars,
      {
        id: 4,
        name: 'Duplicate Peugeot',
        makeModel: 'Peugeot 307 2003-2008',
        fuelType: 'diesel',
        fuelConsumption: 7.2,
        isDefault: false,
        source: 'manual',
      },
    ]
    expect(matchingCarId(carsWithDuplicate, 'diesel', 7.2)).toBe(1)
  })

  it('returns null when garage is empty', () => {
    expect(matchingCarId([], 'diesel', 7.2)).toBeNull()
  })
})
