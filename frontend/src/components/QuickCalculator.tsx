import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function QuickCalculator() {
  const { language } = useLanguage();
  const [distance, setDistance] = useState<number>(0);
  const [passengers, setPassengers] = useState<number>(1);
  const [fuelConsumption, setFuelConsumption] = useState<number>(8.5);
  const [fuelPrice, setFuelPrice] = useState<number>(55);
  const [currency, setCurrency] = useState<string>('UAH');
  const [totalCost, setTotalCost] = useState<number>(0);
  const [costPerPassenger, setCostPerPassenger] = useState<number>(0);

  // Calculate costs whenever inputs change
  useEffect(() => {
    const total = (distance / 100) * fuelConsumption * fuelPrice;
    const perPerson = passengers > 0 ? total / passengers : 0;
    setTotalCost(total);
    setCostPerPassenger(perPerson);
  }, [distance, passengers, fuelConsumption, fuelPrice]);

  const t = {
    title: language === 'uk' ? 'Швидкий Розрахунок' : 'Quick Estimate',
    guestMode: language === 'uk' ? 'ГОСТЬОВИЙ РЕЖИМ' : 'GUEST MODE',
    distance: language === 'uk' ? 'Відстань (км)' : 'Distance (km)',
    passengers: language === 'uk' ? 'Пасажири' : 'Passengers',
    consumption: language === 'uk' ? 'Л/100км' : 'L/100km',
    fuelPrice: language === 'uk' ? 'Ціна палива' : 'Fuel Price',
    totalCost: language === 'uk' ? 'Загальна вартість' : 'Total Cost',
    perPassenger: language === 'uk' ? 'На пасажира' : 'Per Passenger',
  };

  return (
    <Card className="p-6 bg-white dark:bg-slate-800 border-2">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t.title}</h3>
          <span className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold">
            {t.guestMode}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Distance */}
        <div>
          <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
            {t.distance}
          </Label>
          <Input
            type="number"
            min="0"
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
            className="mt-1"
            placeholder="0"
          />
        </div>

        {/* Passengers */}
        <div>
          <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
            {t.passengers}
          </Label>
          <div className="flex items-center gap-2 mt-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPassengers(Math.max(1, passengers - 1))}
              className="h-9 w-9"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              min="1"
              value={passengers}
              onChange={(e) => setPassengers(Math.max(1, Number(e.target.value)))}
              className="text-center"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPassengers(passengers + 1)}
              className="h-9 w-9"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Fuel Consumption */}
        <div>
          <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
            {t.consumption}
          </Label>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={fuelConsumption}
            onChange={(e) => setFuelConsumption(Number(e.target.value))}
            className="mt-1"
          />
        </div>

        {/* Fuel Price */}
        <div>
          <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
            {t.fuelPrice}
          </Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="number"
              min="0"
              value={fuelPrice}
              onChange={(e) => setFuelPrice(Number(e.target.value))}
              className="flex-1"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-24 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="UAH">UAH</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="PLN">PLN</option>
            </select>
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
            <span className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">
              {costPerPassenger.toFixed(2)} {currency}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
