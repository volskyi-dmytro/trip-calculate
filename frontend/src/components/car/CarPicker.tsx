import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { loadCatalog, searchCatalog } from '../../utils/carCatalog';
import type { CatalogEntry, CatalogVariant } from '../../utils/carCatalog';
import { CAR_PRESETS } from '../../utils/carPresets';
import type { CarPreset } from '../../utils/carPresets';
import { carService } from '../../services/carService';
import type { CarSelection, FuelType, GarageCar } from '../../types/Car';

interface CarPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (selection: CarSelection) => void;
  garageCars?: GarageCar[];
}

type Tab = 'search' | 'presets' | 'ai';

const FUEL_TYPES: FuelType[] = ['petrol', 'diesel', 'lpg'];

interface AiEstimateResult {
  makeModel: string;
  fuelType: FuelType;
  consumption: number;
}

export function CarPicker({ open, onClose, onSelect, garageCars = [] }: CarPickerProps) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('search');

  // Search tab state
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [query, setQuery] = useState('');

  // Presets tab state
  const [presetFuelType, setPresetFuelType] = useState<FuelType>('petrol');

  // AI tab state
  const [description, setDescription] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<'rate_limited' | 'recognize_failed' | null>(null);
  const [aiResult, setAiResult] = useState<AiEstimateResult | null>(null);
  // Monotonically increasing request id. Bumped before each estimate request
  // and again whenever the dialog resets, so responses belonging to a stale
  // request (superseded or from a closed session) are discarded on arrival.
  const estimateSeq = useRef(0);

  // Re-arm transient state each time the picker opens, so a previous AI
  // result or search query doesn't linger into an unrelated session.
  useEffect(() => {
    if (open) {
      setTab('search');
      setQuery('');
      setDescription('');
      setAiError(null);
      setAiResult(null);
      estimateSeq.current += 1;
    }
  }, [open]);

  // Load the catalog once, lazily, on first open.
  useEffect(() => {
    if (!open || catalogLoaded) return;
    let cancelled = false;
    setCatalogLoading(true);
    loadCatalog()
      .then((entries) => {
        if (cancelled) return;
        setCatalog(entries);
        setCatalogLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, catalogLoaded]);

  const results = searchCatalog(query, catalog);

  const t = {
    title: language === 'uk' ? 'Обрати автомобіль' : 'Choose a car',
    tabSearch: language === 'uk' ? 'Пошук' : 'Search',
    tabPresets: language === 'uk' ? 'Шаблони' : 'Presets',
    tabAi: language === 'uk' ? 'AI-опис' : 'AI describe',
    searchPlaceholder:
      language === 'uk' ? 'Марка і модель, напр. Skoda Octavia' : 'Make and model, e.g. Skoda Octavia',
    searchLoading: language === 'uk' ? 'Завантаження каталогу…' : 'Loading catalog…',
    searchEmpty: language === 'uk' ? 'Нічого не знайдено' : 'No matches found',
    garageTitle: language === 'uk' ? 'Ваш гараж' : 'Your garage',
    presetsHint: language === 'uk' ? 'Тип пального' : 'Fuel type',
    fuelPetrol: language === 'uk' ? 'Бензин' : 'Petrol',
    fuelDiesel: language === 'uk' ? 'Дизель' : 'Diesel',
    fuelLpg: language === 'uk' ? 'Газ' : 'LPG',
    consumptionUnit: language === 'uk' ? 'л/100км' : 'L/100km',
    consumptionShort: language === 'uk' ? 'л' : 'L',
    aiPlaceholder:
      language === 'uk'
        ? 'Опишіть авто, напр. «Toyota Camry 2015, бензин»'
        : 'Describe the car, e.g. "Toyota Camry 2015, petrol"',
    aiDescLabel: language === 'uk' ? 'Опис авто' : 'Car description',
    aiEstimate: language === 'uk' ? 'Оцінити' : 'Estimate',
    aiEstimating: language === 'uk' ? 'Оцінюємо…' : 'Estimating…',
    aiUse: language === 'uk' ? 'Використати' : 'Use',
    aiRateLimited:
      language === 'uk' ? 'Забагато запитів — спробуйте за хвилину' : 'Too many requests — try again in a minute',
    aiRecognizeFailed: language === 'uk' ? 'Не вдалося розпізнати авто' : "Couldn't recognize that car",
    aiTryPresets: language === 'uk' ? 'Спробувати шаблони' : 'Try presets instead',
    aiConsumptionLabel: language === 'uk' ? 'Витрата (л/100км)' : 'Consumption (L/100km)',
  };

  const handleGarageSelect = (car: GarageCar) => {
    onSelect({
      name: car.name,
      makeModel: car.makeModel,
      fuelType: car.fuelType,
      consumption: car.fuelConsumption,
      source: 'manual',
    });
    onClose();
  };

  const handleCatalogSelect = (entry: CatalogEntry, variant: CatalogVariant) => {
    onSelect({
      name: `${entry.make} ${entry.model}`,
      makeModel: `${entry.make} ${entry.model} ${variant.label}`,
      fuelType: variant.fuelType,
      consumption: variant.consumption,
      source: 'catalog',
    });
    onClose();
  };

  const handlePresetSelect = (preset: CarPreset) => {
    const label = language === 'uk' ? preset.labelUk : preset.labelEn;
    onSelect({
      name: label,
      makeModel: null,
      fuelType: presetFuelType,
      consumption: preset.consumption[presetFuelType],
      source: 'preset',
    });
    onClose();
  };

  const handleEstimate = async () => {
    if (aiLoading) return;
    const trimmed = description.trim();
    if (!trimmed) return;
    const id = ++estimateSeq.current;
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const result = await carService.estimate(trimmed, language);
      if (id !== estimateSeq.current) return;
      setAiResult({
        makeModel: result.makeModel,
        fuelType: result.fuelType,
        consumption: result.consumptionL100km,
      });
    } catch (err: unknown) {
      if (id !== estimateSeq.current) return;
      const status = (err as { response?: { status?: number } })?.response?.status;
      setAiError(status === 429 ? 'rate_limited' : 'recognize_failed');
    } finally {
      if (id === estimateSeq.current) setAiLoading(false);
    }
  };

  const handleAiUse = () => {
    if (!aiResult) return;
    onSelect({
      name: aiResult.makeModel,
      makeModel: aiResult.makeModel,
      fuelType: aiResult.fuelType,
      consumption: aiResult.consumption,
      source: 'ai',
    });
    onClose();
  };

  const tabButtonClass = (active: boolean) =>
    `px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? 'border-primary text-primary'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
    }`;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b border-gray-200/60 dark:border-gray-700/60 mb-4">
          <button type="button" onClick={() => setTab('search')} className={tabButtonClass(tab === 'search')}>
            {t.tabSearch}
          </button>
          <button type="button" onClick={() => setTab('presets')} className={tabButtonClass(tab === 'presets')}>
            {t.tabPresets}
          </button>
          {user && (
            <button type="button" onClick={() => setTab('ai')} className={tabButtonClass(tab === 'ai')}>
              {t.tabAi}
            </button>
          )}
        </div>

        {tab === 'search' && (
          <div className="space-y-4">
            {garageCars.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2">
                  {t.garageTitle}
                </p>
                <div className="space-y-1">
                  {garageCars.map((car) => (
                    <button
                      key={car.id}
                      type="button"
                      onClick={() => handleGarageSelect(car)}
                      className="w-full text-left px-3 py-2 rounded-md border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors"
                    >
                      <span className="font-medium text-sm">{car.name}</span>
                      {car.makeModel && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{car.makeModel}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="car-picker-search" className="sr-only">
                {t.searchPlaceholder}
              </label>
              <Input
                id="car-picker-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
              />
            </div>

            {catalogLoading ? (
              <div className="flex justify-center py-6" role="status" aria-label={t.searchLoading}>
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {query.trim().length >= 2 && results.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t.searchEmpty}</p>
                )}
                {results.map((entry) => (
                  <div key={entry.id}>
                    <p className="text-sm font-medium">
                      {entry.make} {entry.model}{' '}
                      <span className="text-gray-500 dark:text-gray-400 font-normal">({entry.years})</span>
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {entry.variants.map((variant) => (
                        <button
                          key={`${entry.id}-${variant.label}-${variant.fuelType}`}
                          type="button"
                          onClick={() => handleCatalogSelect(entry, variant)}
                          className="px-2 py-1 text-xs rounded-full border border-gray-300/70 dark:border-gray-600/70 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors"
                        >
                          {variant.label} · {variant.consumption} {t.consumptionShort} ·{' '}
                          {variant.fuelType === 'petrol'
                            ? t.fuelPetrol
                            : variant.fuelType === 'diesel'
                              ? t.fuelDiesel
                              : t.fuelLpg}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'presets' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2">
                {t.presetsHint}
              </p>
              <div className="flex gap-2">
                {FUEL_TYPES.map((ft) => (
                  <Button
                    key={ft}
                    type="button"
                    size="sm"
                    variant={presetFuelType === ft ? 'default' : 'outline'}
                    onClick={() => setPresetFuelType(ft)}
                  >
                    {ft === 'petrol' ? t.fuelPetrol : ft === 'diesel' ? t.fuelDiesel : t.fuelLpg}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CAR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className="text-left px-3 py-2 rounded-md border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors"
                >
                  <span className="font-medium text-sm">
                    {language === 'uk' ? preset.labelUk : preset.labelEn}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {preset.consumption[presetFuelType]} {t.consumptionUnit}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'ai' && user && (
          <div className="space-y-4">
            <div>
              <label htmlFor="car-picker-ai-desc" className="sr-only">
                {t.aiDescLabel}
              </label>
              <textarea
                id="car-picker-ai-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder={t.aiPlaceholder}
                className="flex w-full rounded-md border border-gray-300/70 dark:border-gray-600/70 bg-[var(--glass-input)] text-gray-900 dark:text-white px-3 py-2 text-sm placeholder:text-gray-500 dark:placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <Button
              onClick={handleEstimate}
              disabled={aiLoading || !description.trim()}
              aria-label={aiLoading ? t.aiEstimating : undefined}
              aria-busy={aiLoading}
              className="w-full"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t.aiEstimate}
            </Button>

            {aiError && (
              <div className="text-sm text-red-600 dark:text-red-400 space-y-2">
                <p>{aiError === 'rate_limited' ? t.aiRateLimited : t.aiRecognizeFailed}</p>
                {aiError === 'recognize_failed' && (
                  <Button variant="outline" size="sm" onClick={() => setTab('presets')}>
                    {t.aiTryPresets}
                  </Button>
                )}
              </div>
            )}

            {aiResult && (
              <div className="rounded-md border border-gray-200/60 dark:border-gray-700/60 p-3 space-y-2">
                <p className="font-medium text-sm">{aiResult.makeModel}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {aiResult.fuelType === 'petrol'
                    ? t.fuelPetrol
                    : aiResult.fuelType === 'diesel'
                      ? t.fuelDiesel
                      : t.fuelLpg}
                </p>
                <div>
                  <label
                    htmlFor="car-picker-ai-consumption"
                    className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400"
                  >
                    {t.aiConsumptionLabel}
                  </label>
                  <Input
                    id="car-picker-ai-consumption"
                    type="number"
                    step="0.1"
                    min="3"
                    max="25"
                    value={aiResult.consumption}
                    onChange={(e) => setAiResult({ ...aiResult, consumption: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={handleAiUse}
                  disabled={
                    !Number.isFinite(aiResult.consumption) ||
                    aiResult.consumption < 3 ||
                    aiResult.consumption > 25
                  }
                  className="w-full"
                >
                  {t.aiUse}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
