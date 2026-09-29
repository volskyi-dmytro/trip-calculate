import { describe, it, expect } from 'vitest'
import { matchingCarId, carMentionedInText, preferredCarForAiResult } from '../carSelection'
import type { GarageCar } from '../../types/Car'

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

describe('matchingCarId', () => {
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

describe('carMentionedInText', () => {
  it('matches on make/model mentioned in free text, case-insensitive', () => {
    expect(carMentionedInText(cars, 'diesel Skoda Superb next Saturday')).toBeNull()
    expect(carMentionedInText(cars, 'take my VOLKSWAGEN GOLF to Lviv')?.id).toBe(2)
  })

  it('matches on the car nickname', () => {
    expect(carMentionedInText(cars, 'trip in the ford focus')?.id).toBe(3)
  })

  it('returns null when nothing in the garage is mentioned', () => {
    expect(carMentionedInText(cars, 'Lutsk to Krakow, 3 people')).toBeNull()
  })
})

describe('preferredCarForAiResult', () => {
  it('prefers a car named in the message over the AI guess', () => {
    expect(preferredCarForAiResult(cars, 'diesel Peugeot 307 roadtrip', true)?.id).toBe(1)
  })

  it('falls back to the default garage car when the AI gave no car-specific guess', () => {
    expect(preferredCarForAiResult(cars, 'trip to Lviv for 2 people', false)?.id).toBe(2)
  })

  it('leaves the AI guess in place when it gave one and no car is named', () => {
    expect(preferredCarForAiResult(cars, 'trip to Lviv for 2 people', true)).toBeNull()
  })
})

describe('carMentionedInText across spelling (audit #7)', () => {
  const superb: GarageCar = {
    id: 9, name: 'Škoda Superb', makeModel: 'Škoda Superb 2.0 TDI', fuelType: 'diesel',
    fuelConsumption: 6.5, isDefault: false, source: 'catalog',
  }
  const catalog = [{
    id: 'skoda-superb', make: 'Škoda', model: 'Superb', years: '2008–2023',
    aliases: ['суперб', 'шкода суперб'],
    variants: [{ fuelType: 'diesel' as const, consumption: 6.5, label: '2.0 TDI' }],
  }]

  it('ignores diacritics and the engine suffix', () => {
    expect(carMentionedInText([superb], 'Kyiv to Lviv in my skoda superb')?.id).toBe(9)
  })

  it('matches the catalog\'s Cyrillic aliases when the catalog is loaded', () => {
    expect(carMentionedInText([superb], 'Київ Львів на суперб', catalog)?.id).toBe(9)
    expect(carMentionedInText([superb], 'Київ Львів на суперб')).toBeNull()
  })
})
