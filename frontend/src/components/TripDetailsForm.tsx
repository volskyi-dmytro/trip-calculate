import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { Waypoint, RouteSettings } from './RoutePlanner';

interface TripDetailsFormProps {
  waypoints: Waypoint[];
  routeSettings: RouteSettings;
  onUpdateSettings: (settings: RouteSettings) => void;
  onUpdateWaypointName?: (id: string, name: string) => void;
}

export function TripDetailsForm({
  waypoints,
  routeSettings,
  onUpdateSettings,
  onUpdateWaypointName,
}: TripDetailsFormProps) {
  const { language } = useLanguage();

  const [fuelConsumptionInput, setFuelConsumptionInput] = useState<string>(
    routeSettings.fuelConsumption > 0 ? routeSettings.fuelConsumption.toString() : '9.2'
  );
  const [fuelCostInput, setFuelCostInput] = useState<string>(
    routeSettings.fuelCostPerLiter > 0 ? routeSettings.fuelCostPerLiter.toString() : '55'
  );
  const [passengersInput, setPassengersInput] = useState<string>('1');

  const t = {
    title: language === 'uk' ? 'Деталі Поїздки' : 'Trip Details',
    start: language === 'uk' ? 'ПОЧАТОК' : 'START',
    destination: language === 'uk' ? 'ПРИЗНАЧЕННЯ' : 'DESTINATION',
    passengers: language === 'uk' ? 'ПАСАЖИРИ' : 'PASSENGERS',
    consumption: language === 'uk' ? 'Л/100КМ' : 'L/100KM',
    price: language === 'uk' ? 'ЦІНА' : 'PRICE',
    startPlaceholder: language === 'uk' ? 'Шукати початкову локацію...' : 'Search start location...',
    destPlaceholder: language === 'uk' ? 'Шукати призначення...' : 'Search destination...',
  };

  // Initialize from routeSettings
  useEffect(() => {
    if (routeSettings.fuelConsumption > 0) {
      setFuelConsumptionInput(routeSettings.fuelConsumption.toString());
    }
    if (routeSettings.fuelCostPerLiter > 0) {
      setFuelCostInput(routeSettings.fuelCostPerLiter.toString());
    }
  }, [routeSettings]);

  const handleFuelConsumptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(',', '.');

    // Allow empty string or valid decimal numbers
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setFuelConsumptionInput(value);

      // If empty, don't update settings (keep previous value)
      if (value === '') {
        return;
      }

      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        onUpdateSettings({
          ...routeSettings,
          fuelConsumption: numValue,
        });
      }
    }
  };

  const handleFuelCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(',', '.');

    // Allow empty string or valid decimal numbers
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setFuelCostInput(value);

      // If empty, don't update settings (keep previous value)
      if (value === '') {
        return;
      }

      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        onUpdateSettings({
          ...routeSettings,
          fuelCostPerLiter: numValue,
        });
      }
    }
  };

  const handlePassengersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setPassengersInput(value);
    }
  };

  const startLocation = waypoints.length > 0 ? waypoints[0] : null;
  const destLocation = waypoints.length > 1 ? waypoints[waypoints.length - 1] : null;

  return (
    <div className="w-80 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-y-auto p-4">
      <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
        <MapPin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        {t.title}
      </h3>

      <div className="space-y-4">
        {/* Start Location */}
        <div>
          <Label className="block text-xs font-semibold mb-1 text-slate-600 dark:text-slate-300 uppercase">
            {t.start}
          </Label>
          <Input
            type="text"
            placeholder={t.startPlaceholder}
            value={startLocation?.name || ''}
            onChange={(e) => {
              if (startLocation && onUpdateWaypointName) {
                onUpdateWaypointName(startLocation.id, e.target.value);
              }
            }}
            className="w-full"
          />
        </div>

        {/* Destination */}
        <div>
          <Label className="block text-xs font-semibold mb-1 text-slate-600 dark:text-slate-300 uppercase">
            {t.destination}
          </Label>
          <Input
            type="text"
            placeholder={t.destPlaceholder}
            value={destLocation?.name || ''}
            onChange={(e) => {
              if (destLocation && onUpdateWaypointName) {
                onUpdateWaypointName(destLocation.id, e.target.value);
              }
            }}
            className="w-full"
          />
        </div>

        {/* Passengers */}
        <div>
          <Label className="block text-xs font-semibold mb-1 text-slate-600 dark:text-slate-300 uppercase">
            {t.passengers}
          </Label>
          <Input
            type="number"
            min="1"
            value={passengersInput}
            onChange={handlePassengersChange}
            className="w-full"
          />
        </div>

        {/* Fuel Consumption */}
        <div>
          <Label className="block text-xs font-semibold mb-1 text-slate-600 dark:text-slate-300 uppercase">
            {t.consumption}
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            value={fuelConsumptionInput}
            onChange={handleFuelConsumptionChange}
            className="w-full"
          />
        </div>

        {/* Fuel Price */}
        <div>
          <Label className="block text-xs font-semibold mb-1 text-slate-600 dark:text-slate-300 uppercase">
            {t.price}
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            value={fuelCostInput}
            onChange={handleFuelCostChange}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
