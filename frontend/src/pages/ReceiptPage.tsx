import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, MapPin } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { receiptService } from '../services/receiptService';
import type { Receipt } from '../types/Receipt';

type PageState = 'loading' | 'ready' | 'expired' | 'notFound';

/** Decorative SVG sketch of the route — deliberately not a real map:
 *  zero tile quota, zero JS weight, and it keeps the receipt look. */
function RouteSketch({ geometry }: { geometry: Array<[number, number]> }) {
  const lats = geometry.map((p) => p[0]);
  const lngs = geometry.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;
  const W = 280;
  const H = 120;
  const PAD = 12;
  const points = geometry
    .map(([lat, lng]) => {
      const x = PAD + ((lng - minLng) / spanLng) * (W - 2 * PAD);
      const y = PAD + ((maxLat - lat) / spanLat) * (H - 2 * PAD);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const [x0, y0] = points.split(' ')[0].split(',').map(Number);
  const lastPoint = points.split(' ').slice(-1)[0];
  const [x1, y1] = lastPoint.split(',').map(Number);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="6 4"
        opacity="0.7"
      />
      <circle cx={x0} cy={y0} r="4" fill="currentColor" />
      <circle cx={x1} cy={y1} r="4" fill="currentColor" />
    </svg>
  );
}

export function ReceiptPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [state, setState] = useState<PageState>('loading');
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    if (!slug) return;
    receiptService
      .get(slug)
      .then((data) => {
        setReceipt(data);
        setState('ready');
      })
      .catch((err: { response?: { status?: number } }) => {
        setState(err.response?.status === 410 ? 'expired' : 'notFound');
      });
  }, [slug]);

  // Receipt renders in its stored locale by default; a user-chosen language wins
  const lang = receipt && !localStorage.getItem('language') ? receipt.locale : language;

  const t = {
    receipt: lang === 'uk' ? 'Квитанція за поїздку' : 'Trip receipt',
    distance: lang === 'uk' ? 'Відстань' : 'Distance',
    consumption: lang === 'uk' ? 'Витрата пального' : 'Fuel consumption',
    fuelPrice: lang === 'uk' ? 'Ціна пального' : 'Fuel price',
    total: lang === 'uk' ? 'Разом за паливо' : 'Fuel total',
    people: lang === 'uk' ? 'Осіб' : 'People',
    perPerson: lang === 'uk' ? 'На особу' : 'Per person',
    poweredBy: lang === 'uk' ? 'Створено на' : 'Powered by',
    cta: lang === 'uk' ? 'Розрахувати свою поїздку' : 'Calculate your own trip',
    expiredTitle: lang === 'uk' ? 'Ця квитанція застаріла' : 'This receipt has expired',
    expiredText:
      lang === 'uk'
        ? 'Посилання діяло 30 днів. Але ваша наступна поїздка — за хвилину звідси.'
        : 'The link lasted 30 days. Your next trip is a minute away, though.',
    notFoundTitle: lang === 'uk' ? 'Квитанцію не знайдено' : 'Receipt not found',
  };

  const handleCta = () => {
    if (slug) receiptService.registerCta(slug);
    navigate('/');
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state === 'expired' || state === 'notFound') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="receipt-card text-center">
          <h1 className="text-xl font-bold mb-2">
            {state === 'expired' ? t.expiredTitle : t.notFoundTitle}
          </h1>
          <p className="text-sm opacity-70 mb-6">{state === 'expired' ? t.expiredText : ''}</p>
          <button className="btn" onClick={handleCta}>
            {t.cta}
          </button>
        </div>
      </div>
    );
  }

  const r = receipt!;
  const geometry: Array<[number, number]> | null = r.routeGeometry
    ? JSON.parse(r.routeGeometry)
    : null;
  const money = (v: number) => `${v.toFixed(2)} ${r.currency}`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="receipt-card receipt-torn">
        <div className="text-center mb-4">
          <span className="text-xs uppercase tracking-widest opacity-60">{t.receipt}</span>
          {(r.originLabel || r.destinationLabel) && (
            <h1 className="text-lg font-bold mt-1 flex items-center justify-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              {r.originLabel ?? '…'} → {r.destinationLabel ?? '…'}
            </h1>
          )}
        </div>

        {geometry && geometry.length >= 2 && (
          <div className="text-primary mb-4">
            <RouteSketch geometry={geometry} />
          </div>
        )}

        <dl className="receipt-rows">
          <div className="receipt-row">
            <dt>{t.distance}</dt>
            <dd>{r.distanceKm.toFixed(0)} km</dd>
          </div>
          <div className="receipt-row">
            <dt>{t.consumption}</dt>
            <dd>{r.fuelConsumption} L/100km</dd>
          </div>
          <div className="receipt-row">
            <dt>{t.fuelPrice}</dt>
            <dd>
              {r.fuelPrice} {r.currency}/L
            </dd>
          </div>
          <div className="receipt-row">
            <dt>{t.people}</dt>
            <dd>{r.people}</dd>
          </div>
          <div className="receipt-divider" role="presentation" />
          <div className="receipt-row">
            <dt>{t.total}</dt>
            <dd>{money(r.totalCost)}</dd>
          </div>
          <div className="receipt-row receipt-hero">
            <dt>{t.perPerson}</dt>
            <dd>{money(r.costPerPerson)}</dd>
          </div>
        </dl>

        <div className="receipt-divider" role="presentation" />

        <div className="text-center mt-4 space-y-3">
          <button className="btn w-full" onClick={handleCta}>
            {t.cta}
          </button>
          <p className="text-xs opacity-60">
            {t.poweredBy}{' '}
            <a href="/" className="underline font-semibold">
              Trip Calculate
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
