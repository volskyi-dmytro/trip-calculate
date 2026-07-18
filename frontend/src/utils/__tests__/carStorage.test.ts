// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { loadStoredCar, saveStoredCar, clearStoredCar } from '../carStorage'
import type { CarSelection } from '../../types/Car'

describe('carStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('saveStoredCar and loadStoredCar', () => {
    it('round-trip: save and load returns the same car', () => {
      const car: CarSelection = {
        name: 'My Peugeot',
        makeModel: 'Peugeot 307',
        fuelType: 'diesel',
        consumption: 7.2,
        source: 'catalog',
      }
      saveStoredCar(car)
      expect(loadStoredCar()).toEqual(car)
    })

    it('returns null when no car is stored', () => {
      expect(loadStoredCar()).toBeNull()
    })

    it('returns null on garbage JSON', () => {
      localStorage.setItem('tc_car_v1', '{oops')
      expect(loadStoredCar()).toBeNull()
    })

    it('returns null on missing name field', () => {
      localStorage.setItem('tc_car_v1', JSON.stringify({
        makeModel: 'Test Car',
        fuelType: 'petrol',
        consumption: 8.0,
        source: 'manual',
      }))
      expect(loadStoredCar()).toBeNull()
    })

    it('returns null on empty name', () => {
      localStorage.setItem('tc_car_v1', JSON.stringify({
        name: '',
        makeModel: null,
        fuelType: 'petrol',
        consumption: 8.0,
        source: 'manual',
      }))
      expect(loadStoredCar()).toBeNull()
    })

    it('returns null on invalid fuelType', () => {
      localStorage.setItem('tc_car_v1', JSON.stringify({
        name: 'My Car',
        makeModel: null,
        fuelType: 'coal',
        consumption: 8.0,
        source: 'manual',
      }))
      expect(loadStoredCar()).toBeNull()
    })

    it('returns null on invalid source', () => {
      localStorage.setItem('tc_car_v1', JSON.stringify({
        name: 'My Car',
        makeModel: null,
        fuelType: 'petrol',
        consumption: 8.0,
        source: 'unknown',
      }))
      expect(loadStoredCar()).toBeNull()
    })

    it('returns null on consumption 2.0 (out of bounds, < 3.0)', () => {
      localStorage.setItem('tc_car_v1', JSON.stringify({
        name: 'My Car',
        makeModel: null,
        fuelType: 'petrol',
        consumption: 2.0,
        source: 'manual',
      }))
      expect(loadStoredCar()).toBeNull()
    })

    it('returns null on consumption 26.0 (out of bounds, > 25.0)', () => {
      localStorage.setItem('tc_car_v1', JSON.stringify({
        name: 'My Car',
        makeModel: null,
        fuelType: 'petrol',
        consumption: 26.0,
        source: 'manual',
      }))
      expect(loadStoredCar()).toBeNull()
    })

    it('accepts consumption 3.0 (lower bound)', () => {
      const car: CarSelection = {
        name: 'My Car',
        makeModel: null,
        fuelType: 'petrol',
        consumption: 3.0,
        source: 'manual',
      }
      localStorage.setItem('tc_car_v1', JSON.stringify(car))
      expect(loadStoredCar()).toEqual(car)
    })

    it('accepts consumption 25.0 (upper bound)', () => {
      const car: CarSelection = {
        name: 'My Car',
        makeModel: null,
        fuelType: 'petrol',
        consumption: 25.0,
        source: 'manual',
      }
      localStorage.setItem('tc_car_v1', JSON.stringify(car))
      expect(loadStoredCar()).toEqual(car)
    })

    it('coerces makeModel to null when not a string', () => {
      localStorage.setItem('tc_car_v1', JSON.stringify({
        name: 'My Car',
        makeModel: 123,
        fuelType: 'petrol',
        consumption: 8.0,
        source: 'manual',
      }))
      const loaded = loadStoredCar()
      expect(loaded).toEqual({
        name: 'My Car',
        makeModel: null,
        fuelType: 'petrol',
        consumption: 8.0,
        source: 'manual',
      })
    })
  })

  describe('clearStoredCar', () => {
    it('removes the stored car', () => {
      const car: CarSelection = {
        name: 'My Peugeot',
        makeModel: 'Peugeot 307',
        fuelType: 'diesel',
        consumption: 7.2,
        source: 'catalog',
      }
      saveStoredCar(car)
      expect(loadStoredCar()).not.toBeNull()
      clearStoredCar()
      expect(loadStoredCar()).toBeNull()
    })
  })
})
