import { useState } from 'react';
import type { FormEvent } from 'react';
import { calculatorService } from '../../services/calculatorService';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Trip, TripResult } from '../../types';

export function CalculatorForm() {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<Trip>({
    customFuelConsumption: 0,
    numberOfPassengers: 0,
    distance: 0,
    fuelCost: 0,
  });
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
    setFormData({
      customFuelConsumption: 0,
      numberOfPassengers: 0,
      distance: 0,
      fuelCost: 0,
    });
    setResult(null);
    setError(null);
  };

  const handleChange = (field: keyof Trip, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: parseFloat(value) || 0,
    }));
  };

  return (
    <form id="calculator-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="customFuelConsumption">
          {t('calculator.fuelConsumption')}
        </label>
        <input
          type="number"
          id="customFuelConsumption"
          name="customFuelConsumption"
          value={formData.customFuelConsumption || ''}
          onChange={(e) => handleChange('customFuelConsumption', e.target.value)}
          step="0.01"
          min="0"
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="numberOfPassengers">
          {t('calculator.passengers')}
        </label>
        <input
          type="number"
          id="numberOfPassengers"
          name="numberOfPassengers"
          value={formData.numberOfPassengers || ''}
          onChange={(e) => handleChange('numberOfPassengers', e.target.value)}
          min="0"
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="distance">
          {t('calculator.distance')}
        </label>
        <input
          type="number"
          id="distance"
          name="distance"
          value={formData.distance || ''}
          onChange={(e) => handleChange('distance', e.target.value)}
          min="0"
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="fuelCost">
          {t('calculator.fuelCost')}
        </label>
        <input
          type="number"
          id="fuelCost"
          name="fuelCost"
          value={formData.fuelCost || ''}
          onChange={(e) => handleChange('fuelCost', e.target.value)}
          step="0.01"
          min="0"
          required
        />
      </div>

      <button type="submit" className="btn">
        {t('calculator.calculate')}
      </button>
      <button type="button" className="btn" onClick={handleReset}>
        {t('calculator.reset')}
      </button>

      {error && <div className="error">{error}</div>}
      {result && (
        <div id="result" className="result">
          <p>{t('calculator.totalFuelCost')}: {result.totalFuelCost.toFixed(2)}</p>
          <p>{t('calculator.costPerPassenger')}: {result.costPerPassenger.toFixed(2)}</p>
        </div>
      )}
    </form>
  );
}
