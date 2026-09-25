import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, MapPin, Clock, Fuel, ArrowRight } from 'lucide-react';
import { Header } from '../components/common/Header';
import { Footer } from '../components/common/Footer';
import { QuickCalculator } from '../components/QuickCalculator';
import { useLanguage } from '../contexts/LanguageContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { withLocalePrefix } from '../utils/locale';
import { cityRouteService, type CityRouteDetail } from '../services/cityRouteService';

type PageState = 'loading' | 'ready' | 'notFound' | 'error';

function formatDuration(minutes: number, language: 'en' | 'uk'): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return language === 'uk' ? `${m} хв` : `${m} min`;
  return language === 'uk' ? `${h} год ${m} хв` : `${h}h ${m}m`;
}

// SpaShellController embeds this page's data in the HTML, so the first render
// (and search engines, which can't call /api/) needs no API request.
function embeddedRoute(slug: string | undefined, language: string): CityRouteDetail | null {
  const island = document.getElementById('city-route-data');
  if (!slug || !island || island.dataset.slug !== slug || island.dataset.locale !== language) {
    return null;
  }
  try {
    return JSON.parse(island.textContent ?? '') as CityRouteDetail;
  } catch {
    return null;
  }
}

export function CityRoutePage() {
  const { slug } = useParams<{ slug: string }>();
  const { language, t, tn } = useLanguage();
  const [route, setRoute] = useState<CityRouteDetail | null>(() => embeddedRoute(slug, language));
  const [state, setState] = useState<PageState>(() => (route ? 'ready' : 'loading'));
  const [attempt, setAttempt] = useState(0);
  useDocumentTitle(
    state === 'notFound'
      ? t('cityRoute.notFound.title')
      : route
        ? t('pageTitle.cityRoute').replace('{from}', route.fromName).replace('{to}', route.toName)
        : null,
  );

  useEffect(() => {
    if (!slug) return;
    const embedded = embeddedRoute(slug, language);
    if (embedded) {
      setRoute(embedded);
      setState('ready');
      return;
    }
    setState('loading');
    cityRouteService
      .get(slug, language)
      .then((data) => {
        setRoute(data);
        setState('ready');
      })
      .catch((err: { response?: { status?: number } }) => {
        setState(err.response?.status === 404 ? 'notFound' : 'error');
      });
  }, [slug, language, attempt]);

  if (state === 'loading') {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        </div>
        <Footer />
      </>
    );
  }

  if (state === 'notFound' || state === 'error') {
    return (
      <>
        <Header />
        <main className="container">
          <section className="section text-center">
            {/* A failed load (e.g. 429) must not read as "route not found" to search engines. */}
            <h1>{state === 'notFound' ? t('cityRoute.notFound.title') : t('cityRoute.error.title')}</h1>
            <p className="section-lead" style={{ margin: '0 auto 24px' }}>
              {state === 'notFound' ? t('cityRoute.notFound.text') : t('cityRoute.error.text')}
            </p>
            {state === 'error' ? (
              <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
                {t('cityRoute.error.retry')}
              </button>
            ) : (
              <Link className="btn" to={withLocalePrefix('/', language)}>
                {t('cityRoute.notFound.cta')}
              </Link>
            )}
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const r = route!;
  const formattedPriceDate = r.fuelPriceDate
    ? new Date(r.fuelPriceDate).toLocaleDateString(language === 'uk' ? 'uk-UA' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;
  const priceDate = formattedPriceDate
    ? t('cityRoute.priceDateSuffix').replace('{date}', formattedPriceDate)
    : '';
  const explanation = t('cityRoute.explanation')
    .replace('{consumption}', String(r.consumptionL100))
    .replace('{passengers}', tn('common.passengersGenitive', r.passengers))
    .replace('{priceDate}', priceDate);

  const facts = [
    {
      icon: MapPin,
      label: t('cityRoute.distance'),
      value: `${Math.round(r.distanceKm)} km`,
    },
    {
      icon: Clock,
      label: t('cityRoute.duration'),
      value: formatDuration(r.durationMin, language),
    },
    r.fuelPricePerLiter !== null && {
      icon: Fuel,
      label: t('cityRoute.fuelPrice'),
      value: `${r.fuelPricePerLiter} ${r.currency}/L`,
    },
    r.totalCost !== null && {
      icon: ArrowRight,
      label: t('cityRoute.totalCost'),
      value: `${r.totalCost.toFixed(0)} ${r.currency}`,
    },
    r.perPassenger !== null && {
      icon: ArrowRight,
      label: t('cityRoute.perPassenger'),
      value: `${r.perPassenger.toFixed(0)} ${r.currency}`,
    },
  ].filter((f): f is { icon: typeof MapPin; label: string; value: string } => Boolean(f));

  return (
    <>
      <Header />
      <main className="container">
        <section className="section">
          <h1>
            {r.fromName} → {r.toName}: {t('cityRoute.titleSuffix')}
          </h1>
          <p className="section-lead">{explanation}</p>

          <div className="features">
            {facts.map(({ icon: Icon, label, value }) => (
              <div className="feature" key={label}>
                <span className="feature-icon">
                  <Icon size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                {/* A figure, not a heading: keeps the outline h1 → h2 → h3. */}
                <p className="feature-value">{value}</p>
                <p>{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div style={{ maxWidth: '26rem', margin: '0 auto' }}>
            <QuickCalculator
              prefill={{
                distance: r.distanceKm,
                consumption: r.consumptionL100,
                price: r.fuelPricePerLiter ?? undefined,
                currency: r.currency,
                passengers: r.passengers,
              }}
            />
          </div>
        </section>

        <section className="section text-center">
          <Link className="btn" to={withLocalePrefix('/route-planner', language)}>
            {t('cityRoute.plannerCta')}
          </Link>
        </section>

        {r.related.length > 0 && (
          <section className="section">
            <h2>{t('cityRoute.related')}</h2>
            <div className="features">
              {r.related.map((rel) => (
                <Link
                  className="feature"
                  to={withLocalePrefix(`/route/${rel.slug}`, language)}
                  key={rel.slug}
                >
                  <h3>
                    {rel.fromName} → {rel.toName}
                  </h3>
                  <p>{t('home.popularRoutes.viewCost')}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
