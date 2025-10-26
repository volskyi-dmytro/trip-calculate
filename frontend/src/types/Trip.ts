export interface Trip {
  customFuelConsumption: number;
  numberOfPassengers: number;
  distance: number;
  fuelCost: number;
}

export interface TripResult extends Trip {
  totalFuelCost: number;
  costPerPassenger: number;
}
