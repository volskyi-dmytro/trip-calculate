import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Input } from '../ui/input';
import {
  compareScenarios, computeCost, formatAmount, formatDelta, MAX_SCENARIOS, parseOverride,
  type CostInputs, type ScenarioOverrides,
} from '../../services/costScenarios';

interface Props {
  /** Live calculator values. Read-only here: scenarios never write back. */
  baseline: CostInputs;
  currency: string;
}

// Raw text per field so partial typing ("1.") is never rewritten under the user.
interface Draft { id: number; consumption: string; price: string; passengers: string }

const FIELD_CLASS = 'min-h-11';
const LABEL_CLASS = 'block text-xs font-semibold text-slate-600 dark:text-slate-300';

export function ScenarioComparison({ baseline, currency }: Props) {
  const { t } = useLanguage();
  const uid = useId();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const nextId = useRef(1);
  const focusId = useRef<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusId.current) {
      document.getElementById(focusId.current)?.focus();
      focusId.current = null;
    }
  });

  const parsed = useMemo(
    () => drafts.map((d) => ({
      consumption: parseOverride(d.consumption),
      price: parseOverride(d.price),
      passengers: parseOverride(d.passengers, true),
    })),
    [drafts],
  );
  const overrides: ScenarioOverrides[] = parsed.map((p) => ({
    consumption: p.consumption === 'invalid' ? NaN : p.consumption,
    price: p.price === 'invalid' ? NaN : p.price,
    passengers: p.passengers === 'invalid' ? NaN : p.passengers,
  }));
  // Scenarios are priced on the baseline's distance and nothing else of it.
  const rows = compareScenarios(baseline, overrides);
  const base = computeCost(baseline);

  const add = () => {
    if (drafts.length >= MAX_SCENARIOS) return;
    const id = nextId.current++;
    focusId.current = `${uid}-${id}-consumption`;
    setDrafts((d) => [...d, { id, consumption: '', price: '', passengers: '' }]);
  };
  const remove = (id: number) => {
    setDrafts((d) => d.filter((x) => x.id !== id));
    focusId.current = addRef.current?.id ?? null;
  };
  const edit = (id: number, key: 'consumption' | 'price' | 'passengers', value: string) =>
    setDrafts((d) => d.map((x) => (x.id === id ? { ...x, [key]: value } : x)));

  const fields = [
    { key: 'consumption' as const, label: t('quickCalc.consumption'), value: baseline.consumption, mode: 'decimal' as const },
    { key: 'price' as const, label: t('scenarios.priceIn').replace('{currency}', currency), value: baseline.price, mode: 'decimal' as const },
    { key: 'passengers' as const, label: t('quickCalc.passengers'), value: baseline.passengers, mode: 'numeric' as const },
  ];

  return (
    <details className="pt-4 border-t border-slate-200 dark:border-slate-700">
      <summary className="cursor-pointer min-h-11 flex items-center text-sm font-semibold text-slate-700 dark:text-slate-200">
        {t('scenarios.title')}
      </summary>
      <div className="space-y-3 pt-1">
        <p className="text-xs text-slate-600 dark:text-slate-300">{t('scenarios.hint')}</p>

        {!base || baseline.distanceKm <= 0 ? (
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {t(base ? 'scenarios.noDistance' : 'scenarios.baselineInvalid')}
          </p>
        ) : (
          <div className="flex justify-between text-sm">
            <span className="font-medium">{t('scenarios.baseline')}</span>
            <span className="tabular-nums">
              {formatAmount(base.total, currency)} · {formatAmount(base.perPerson, currency)}
            </span>
          </div>
        )}

        {drafts.map((d, i) => {
          const row = rows[i];
          const name = t('scenarios.name').replace('{n}', String(i + 1));
          const bad = parsed[i];
          const hasInvalid = [bad.consumption, bad.price, bad.passengers].includes('invalid');
          return (
            <fieldset key={d.id} className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
              <legend className="px-1 text-sm font-semibold">{name}</legend>
              <div className="grid grid-cols-3 gap-2">
                {fields.map((f) => {
                  const id = `${uid}-${d.id}-${f.key}`;
                  const invalid = bad[f.key] === 'invalid';
                  return (
                    <div key={f.key}>
                      <label htmlFor={id} className={LABEL_CLASS}>{f.label}</label>
                      <Input
                        id={id}
                        type="text"
                        inputMode={f.mode}
                        className={FIELD_CLASS}
                        placeholder={String(f.value)}
                        value={d[f.key]}
                        aria-invalid={invalid || undefined}
                        aria-describedby={invalid ? `${id}-err` : undefined}
                        onChange={(e) => edit(d.id, f.key, e.target.value)}
                      />
                      {invalid && <span id={`${id}-err`} className="text-xs text-red-600 dark:text-red-400">{t('scenarios.invalid')}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-start justify-between gap-2">
                <div aria-live="polite" className="text-sm tabular-nums">
                  {hasInvalid || !row.result ? (
                    <span className="text-xs text-slate-600 dark:text-slate-300">{t('scenarios.invalidResult')}</span>
                  ) : (
                    <>
                      <div>{formatAmount(row.result.total, currency)} · {formatAmount(row.result.perPerson, currency)}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        {row.deltaTotal === 0 && row.deltaPerPerson === 0
                          ? t('scenarios.same')
                          : row.deltaTotal === null || row.deltaPerPerson === null
                            ? ''
                            : `${formatDelta(row.deltaTotal, currency)} · ${formatDelta(row.deltaPerPerson, currency)} ${t('scenarios.vs')}`}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t('scenarios.remove').replace('{n}', String(i + 1))}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => remove(d.id)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </fieldset>
          );
        })}

        <button
          ref={addRef}
          id={`${uid}-add`}
          type="button"
          onClick={add}
          disabled={drafts.length >= MAX_SCENARIOS}
          className="inline-flex min-h-11 items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 px-3 text-sm font-medium disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {drafts.length >= MAX_SCENARIOS ? t('scenarios.max').replace('{max}', String(MAX_SCENARIOS)) : t('scenarios.add')}
        </button>
      </div>
    </details>
  );
}
