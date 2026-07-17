import { useEffect, useState } from 'react';
import { Car as CarIcon, Star, Edit2, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { CarPicker } from '../car/CarPicker';
import { carService } from '../../services/carService';
import { useLanguage } from '../../contexts/LanguageContext';
import type { CarSelection, GarageCar } from '../../types/Car';

const MAX_CARS = 10;
const MIN_CONSUMPTION = 3;
const MAX_CONSUMPTION = 25;

function extractErrorMessage(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { error?: string } } })?.response?.data;
  return data?.error;
}

interface PendingCar {
  // present when editing an existing garage car; absent when adding a new one
  id?: number;
  name: string;
  makeModel: string | null;
  fuelType: GarageCar['fuelType'];
  consumption: number;
  source: string;
}

export function CarsCard() {
  const { t } = useLanguage();
  const [cars, setCars] = useState<GarageCar[]>([]);
  const [loading, setLoading] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<PendingCar | null>(null);
  const [saving, setSaving] = useState(false);

  const [carToDelete, setCarToDelete] = useState<GarageCar | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [settingDefaultId, setSettingDefaultId] = useState<number | null>(null);

  const fetchCars = async () => {
    try {
      setLoading(true);
      const data = await carService.list();
      setCars(data);
    } catch (error) {
      console.error('Failed to fetch cars:', error);
      toast.error(extractErrorMessage(error) ?? t('dashboard.error.fetchFailed'));
      setCars([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedCars = [...cars].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

  const handlePickerSelect = (selection: CarSelection) => {
    setPending({
      name: selection.name,
      makeModel: selection.makeModel,
      fuelType: selection.fuelType,
      consumption: selection.consumption,
      source: selection.source,
    });
  };

  const openEdit = (car: GarageCar) => {
    setPending({
      id: car.id,
      name: car.name,
      makeModel: car.makeModel,
      fuelType: car.fuelType,
      consumption: car.fuelConsumption,
      source: car.source,
    });
  };

  const consumptionValid = (value: number) =>
    Number.isFinite(value) && value >= MIN_CONSUMPTION && value <= MAX_CONSUMPTION;

  const handleSave = async () => {
    if (!pending) return;
    if (!consumptionValid(pending.consumption)) return;
    const trimmedName = pending.name.trim();
    if (!trimmedName) return;

    setSaving(true);
    try {
      if (pending.id != null) {
        await carService.update(pending.id, {
          name: trimmedName,
          makeModel: pending.makeModel,
          fuelType: pending.fuelType,
          fuelConsumption: pending.consumption,
          source: pending.source,
        });
      } else {
        await carService.create({
          name: trimmedName,
          makeModel: pending.makeModel,
          fuelType: pending.fuelType,
          fuelConsumption: pending.consumption,
          isDefault: cars.length === 0,
          source: pending.source,
        });
      }
      setPending(null);
      await fetchCars();
    } catch (error) {
      console.error('Failed to save car:', error);
      toast.error(extractErrorMessage(error) ?? t('dashboard.cars.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (car: GarageCar) => {
    setCarToDelete(car);
  };

  const handleDelete = async () => {
    if (!carToDelete) return;
    setDeleting(true);
    try {
      await carService.remove(carToDelete.id);
      setCarToDelete(null);
      await fetchCars();
    } catch (error) {
      console.error('Failed to delete car:', error);
      toast.error(extractErrorMessage(error) ?? t('dashboard.cars.actionFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (car: GarageCar) => {
    if (settingDefaultId !== null) return;
    setSettingDefaultId(car.id);
    try {
      await carService.setDefault(car.id);
      await fetchCars();
    } catch (error) {
      console.error('Failed to set default car:', error);
      toast.error(extractErrorMessage(error) ?? t('dashboard.cars.actionFailed'));
    } finally {
      setSettingDefaultId(null);
    }
  };

  const atLimit = cars.length >= MAX_CARS;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-xl">{t('dashboard.cars.title')}</CardTitle>
            <Button
              size="sm"
              onClick={() => setPickerOpen(true)}
              disabled={atLimit}
              title={atLimit ? t('dashboard.cars.limitReached') : undefined}
            >
              {t('dashboard.cars.add')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8" role="status">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : cars.length === 0 ? (
            <div className="text-center py-8">
              <CarIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('dashboard.cars.empty')}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {sortedCars.map((car) => (
                  <div
                    key={car.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-gray-200/60 dark:border-gray-700/60 glass-inset"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {car.name}
                        </h4>
                        {car.isDefault && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <Star className="h-3.5 w-3.5 fill-current" />
                            {t('dashboard.cars.default')}
                          </span>
                        )}
                      </div>
                      {car.makeModel && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {car.makeModel}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-600 dark:text-gray-400">
                        <span className="px-2 py-0.5 rounded-full border border-gray-300/70 dark:border-gray-600/70 capitalize">
                          {car.fuelType}
                        </span>
                        <span>{car.fuelConsumption} L/100km</span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 sm:mt-0">
                      {!car.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`${t('dashboard.cars.setDefault')} ${car.name}`}
                          onClick={() => handleSetDefault(car)}
                          disabled={settingDefaultId !== null}
                        >
                          {settingDefaultId === car.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            t('dashboard.cars.setDefault')
                          )}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`${t('dashboard.cars.edit')} ${car.name}`}
                        onClick={() => openEdit(car)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`${t('dashboard.cars.delete')} ${car.name}`}
                        onClick={() => confirmDelete(car)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {atLimit && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                  {t('dashboard.cars.limitReached')}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <CarPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handlePickerSelect} />

      {/* Add/Edit confirm dialog */}
      <Dialog open={pending !== null} onOpenChange={(next) => !next && !saving && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.id != null ? t('dashboard.cars.edit') : t('dashboard.cars.add')}</DialogTitle>
          </DialogHeader>
          {pending && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="car-card-name"
                  className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400"
                >
                  {t('dashboard.cars.name')}
                </label>
                <Input
                  id="car-card-name"
                  value={pending.name}
                  onChange={(e) => setPending({ ...pending, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label
                  htmlFor="car-card-consumption"
                  className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400"
                >
                  {t('dashboard.cars.consumption')}
                </label>
                <Input
                  id="car-card-consumption"
                  type="number"
                  step="0.1"
                  min={MIN_CONSUMPTION}
                  max={MAX_CONSUMPTION}
                  value={pending.consumption}
                  onChange={(e) => setPending({ ...pending, consumption: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={saving}>
              {t('dashboard.cars.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !pending ||
                !pending.name.trim() ||
                !consumptionValid(pending.consumption)
              }
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('dashboard.cars.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={carToDelete !== null} onOpenChange={(next) => !next && !deleting && setCarToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboard.cars.deleteTitle')}</DialogTitle>
            <DialogDescription>
              <strong>{carToDelete?.name}</strong>
              <br />
              {t('dashboard.cars.deleteConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCarToDelete(null)} disabled={deleting}>
              {t('dashboard.cars.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('dashboard.cars.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
