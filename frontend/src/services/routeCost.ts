/** route-cost/2: decimal HALF_UP, never binary floating-point half-cent rounding.
 * Numbers cross the API as JSON decimals, so parse their decimal spelling (also
 * exponent notation) before doing all price arithmetic with integer cents.
 */
function halfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator)
}

function decimalCents(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Expected a finite nonnegative decimal')
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const digits = BigInt(whole + fraction)
  const scale = fraction.length - Number(exponent) - 2
  return scale > 0 ? halfUp(digits, 10n ** BigInt(scale)) : digits * 10n ** BigInt(-scale)
}

export function normalizeDecimal(value: number): number {
  return Number(decimalCents(value)) / 100
}

export function calculateRouteCost(distanceKm: number, consumption: number, price: number, people: number) {
  if (!Number.isInteger(people) || people < 1) throw new RangeError('Expected a positive integer passenger count')
  const distance = decimalCents(distanceKm)
  const fuelConsumption = decimalCents(consumption)
  const fuelPrice = decimalCents(price)
  // Three scale-2 factors /100, then convert the product to currency cents.
  const totalCents = halfUp(distance * fuelConsumption * fuelPrice, 1_000_000n)
  return {
    distanceKm: Number(distance) / 100,
    consumption: Number(fuelConsumption) / 100,
    price: Number(fuelPrice) / 100,
    fuelNeeded: Number(distance * fuelConsumption) / 1_000_000,
    total: Number(totalCents) / 100,
    perPerson: Number(halfUp(totalCents, BigInt(people))) / 100,
  }
}
