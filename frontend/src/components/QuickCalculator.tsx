import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareReceiptButton } from './receipt/ShareReceiptButton';
import { CarPicker } from './car/CarPicker';
import { loadStoredCar, saveStoredCar, clearStoredCar } from '../utils/carStorage';
import { carService } from '../services/carService';
import type { CarSelection, GarageCar } from '../types/Car';

interface QuickCalculatorPrefill {
  distance: number;
  consumption?: number;
  price?: number;
  currency?: string;
  passengers?: number;
}

interface QuickCalculatorProps {
  /** Prefill with a locale-appropriate worked example (public landing). */
  example?: boolean;
  /** Prefill from a known route (e.g. a city-route landing page). Takes
   *  precedence over `example`; unlike the example it isn't swapped away
   *  when the language changes and doesn't show the "example" badge. */
  prefill?: QuickCalculatorPrefill;
}

// Static precomputed examples — zero API calls on the landing page (spec decision).
// The route names are quickCalc.exampleFrom/To in src/i18n/common.ts.
const EXAMPLES = {
  uk: { distance: 540, consumption: 7.5, price: 58, people: 4, currency: 'UAH' },
  en: { distance: 584, consumption: 7.5, price: 1.75, people: 4, currency: 'EUR' },
} as const;

export function QuickCalculator({ example = false, prefill }: QuickCalculatorProps) {
  const { language, t: tr } = useLanguage();
  const { user } = useAuth();
  const initial = !prefill && example ? EXAMPLES[language === 'uk' ? 'uk' : 'en'] : null;
  const stored = loadStoredCar();
  const [exampleActive, setExampleActive] = useState(!prefill && example);
  const [distance, setDistance] = useState<number>(prefill?.distance ?? initial?.distance ?? 0);
  const [passengers, setPassengers] = useState<number>(prefill?.passengers ?? initial?.people ?? 1);
  const [fuelConsumption, setFuelConsumption] = useState<number>(
    prefill?.consumption ?? initial?.consumption ?? stored?.consumption ?? 8.5,
  );
  const [fuelPrice, setFuelPrice] = useState<number>(prefill?.price ?? initial?.price ?? 55);
  const [currency, setCurrency] = useState<string>(prefill?.currency ?? initial?.currency ?? 'UAH');
  const [totalCost, setTotalCost] = useState<number>(0);
  const [costPerPassenger, setCostPerPassenger] = useState<number>(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [storedCar, setStoredCar] = useState<CarSelection | null>(stored);
  const [garageCars, setGarageCars] = useState<GarageCar[]>([]);

  useEffect(() => {
    if (user) carService.list().then(setGarageCars).catch(() => {});
  }, [user]);

  // Calculate costs whenever inputs change
  useEffect(() => {
    const total = (distance / 100) * fuelConsumption * fuelPrice;
    const perPerson = passengers > 0 ? total / passengers : 0;
    setTotalCost(total);
    setCostPerPassenger(perPerson);
  }, [distance, passengers, fuelConsumption, fuelPrice]);

  // While the example is untouched, switching language swaps to that locale's example
  useEffect(() => {
    if (!exampleActive) return;
    const ex = EXAMPLES[language === 'uk' ? 'uk' : 'en'];
    setDistance(ex.distance);
    setPassengers(ex.people);
    setFuelConsumption(ex.consumption);
    setFuelPrice(ex.price);
    setCurrency(ex.currency);
  }, [language, exampleActive]);

  /** First user edit converts the example into the user's own trip. */
  const edited = <T,>(setter: (v: T) => void) => (v: T) => {
    setExampleActive(false);
    setter(v);
  };

  const handleCarSelect = (selection: CarSelection) => {
    edited(setFuelConsumption)(selection.consumption);
    saveStoredCar(selection);
    setStoredCar(selection);
    setPickerOpen(false);
  };

  const t = {
    title: tr('quickCalc.title'),
    guestMode: tr('quickCalc.guestMode'),
    distance: tr('quickCalc.distance'),
    passengers: tr('quickCalc.passengers'),
    consumption: tr('quickCalc.consumption'),
    fuelPrice: tr('quickCalc.fuelPrice'),
    currency: tr('quickCalc.currency'),
    decreasePassengers: tr('quickCalc.decreasePassengers'),
    increasePassengers: tr('quickCalc.increasePassengers'),
    totalCost: tr('quickCalc.totalCost'),
    perPassenger: tr('quickCalc.perPassenger'),
    exampleBadge: tr('quickCalc.exampleBadge'),
    exampleRoute: exampleActive
      ? `${tr('quickCalc.exampleFrom')} → ${tr('quickCalc.exampleTo')}`
      : '',
  };

  return (
    <Card className="p-6">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">{t.title}</h2>
          <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary font-semibold">
            {t.guestMode}
          </span>
        </div>
        {exampleActive && (
          <div className="mt-2 text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
            {t.exampleRoute} · {t.exampleBadge}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Distance */}
        <div>
          <Label htmlFor="quick-distance" className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
            {t.distance}
          </Label>
          <Input
            id="quick-distance"
            type="number"
            min="0"
            value={distance}
            onChange={(e) => edited(setDistance)(Number(e.target.value))}
            className="mt-1"
            placeholder="0"
          />
        </div>

        {/* Passengers */}
        <div>
          <Label htmlFor="quick-passengers" className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
            {t.passengers}
          </Label>
          <div className="flex items-center gap-2 mt-1">
            <Button
              aria-label={t.decreasePassengers}
              variant="outline"
              size="icon"
              onClick={() => edited(setPassengers)(Math.max(1, passengers - 1))}
              className="h-9 w-9"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              id="quick-passengers"
              type="number"
              min="1"
              value={passengers}
              onChange={(e) => edited(setPassengers)(Math.max(1, Number(e.target.value)))}
              className="text-center"
            />
            <Button
              aria-label={t.increasePassengers}
              variant="outline"
              size="icon"
              onClick={() => edited(setPassengers)(passengers + 1)}
              className="h-9 w-9"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Fuel Consumption */}
        <div>
          <Label htmlFor="quick-consumption" className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
            {t.consumption}
          </Label>
          <Input
            id="quick-consumption"
            type="number"
            min="0"
            step="0.1"
            value={fuelConsumption}
            onChange={(e) => edited(setFuelConsumption)(Number(e.target.value))}
            className="mt-1"
          />
          {storedCar ? (
            <div className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="hover:underline"
              >
                🚗 {storedCar.name} · {storedCar.consumption} L/100km
              </button>
              <button
                type="button"
                aria-label={tr('quickCalc.clearSavedCar')}
                className="opacity-60 hover:opacity-100"
                onClick={() => { clearStoredCar(); setStoredCar(null); }}
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-1 text-xs text-primary hover:underline"
            >
              🚗 {tr('quickCalc.unknownConsumption')}
            </button>
          )}
        </div>

        {/* Fuel Price */}
        <div>
          <Label htmlFor="quick-fuel-price" className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
            {t.fuelPrice}
          </Label>
          <div className="flex gap-2 mt-1">
            <Input
              id="quick-fuel-price"
              type="number"
              min="0"
              value={fuelPrice}
              onChange={(e) => edited(setFuelPrice)(Number(e.target.value))}
              className="flex-1"
            />
            <div>
              <Label htmlFor="quick-currency" className="sr-only">{t.currency}</Label>
              <select
                id="quick-currency"
                value={currency}
                onChange={(e) => edited(setCurrency)(e.target.value)}
                className="w-24 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="UAH">UAH</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="PLN">PLN</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t.totalCost}:
            </span>
            <span className="text-xl font-bold text-slate-800 dark:text-white">
              {totalCost.toFixed(2)} {currency}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t.perPassenger}:
            </span>
            <span className="text-lg font-semibold text-primary">
              {costPerPassenger.toFixed(2)} {currency}
            </span>
          </div>

          <ShareReceiptButton
            className="w-full mt-2"
            disabled={distance <= 0 || totalCost <= 0}
            payload={{
              distanceKm: distance,
              fuelConsumption,
              fuelPrice,
              currency,
              people: passengers,
              locale: language,
            }}
          />
        </div>
      </div>

      <CarPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleCarSelect}
        garageCars={garageCars}
      />
    </Card>
  );
}
