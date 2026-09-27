import { useState } from 'react';
import type { FormEvent } from 'react';
import { calculatorService } from '../../services/calculatorService';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNumericField } from '../../hooks/useNumericField';
import type { Trip, TripResult } from '../../types';

const EMPTY_FORM: Trip = {
  customFuelConsumption: 0,
  numberOfPassengers: 0,
  distance: 0,
  fuelCost: 0,
};

export function CalculatorForm() {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<Trip>(EMPTY_FORM);
  const [result, setResult] = useState<TripResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const response = await calculatorService.calculateExpenses(formData);
      setResult(response);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Calculation failed';
      setError(errorMessage);
      console.error('Calculation error:', err);
    }
  };

  const handleReset = () => {
    setFormData(EMPTY_FORM);
    setResult(null);
    setError(null);
  };

  const setField = (field: keyof Trip) => (value: number) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  // emptyEquals: 0 keeps the original convention of a blank field for the
  // form's zero-valued initial/reset state, instead of a literal "0".
  const consumptionField = useNumericField(formData.customFuelConsumption, setField('customFuelConsumption'), { min: 0, emptyEquals: 0 });
  const passengersField = useNumericField(formData.numberOfPassengers, setField('numberOfPassengers'), { min: 1, fallback: 1, emptyEquals: 0 });
  const distanceField = useNumericField(formData.distance, setField('distance'), { min: 0, emptyEquals: 0 });
  const fuelCostField = useNumericField(formData.fuelCost, setField('fuelCost'), { min: 0, emptyEquals: 0 });

  return (
    <form id="calculator-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="customFuelConsumption">
          {t('calculator.fuelConsumption')}
        </label>
        <input
          type="text"
          inputMode="decimal"
          id="customFuelConsumption"
          name="customFuelConsumption"
          required
          {...consumptionField}
        />
      </div>

      <div className="form-group">
        <label htmlFor="numberOfPassengers">
          {t('calculator.passengers')}
        </label>
        <input
          type="text"
          inputMode="numeric"
          id="numberOfPassengers"
          name="numberOfPassengers"
          required
          {...passengersField}
        />
      </div>

      <div className="form-group">
        <label htmlFor="distance">
          {t('calculator.distance')}
        </label>
        <input
          type="text"
          inputMode="decimal"
          id="distance"
          name="distance"
          required
          {...distanceField}
        />
      </div>

      <div className="form-group">
        <label htmlFor="fuelCost">
          {t('calculator.fuelCost')}
        </label>
        <input
          type="text"
          inputMode="decimal"
          id="fuelCost"
          name="fuelCost"
          required
          {...fuelCostField}
        />
      </div>

      <div className="form-actions">
        <button type="submit" className="btn">
          {t('calculator.calculate')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleReset}>
          {t('calculator.reset')}
        </button>
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {result && (
        <dl id="result" className="result">
          <div className="result-row">
            <dt>{t('calculator.totalFuelCost')}</dt>
            <dd>{result.totalFuelCost.toFixed(2)}</dd>
          </div>
          <div className="result-row">
            <dt>{t('calculator.costPerPassenger')}</dt>
            <dd>{result.costPerPassenger.toFixed(2)}</dd>
          </div>
        </dl>
      )}
    </form>
  );
}
