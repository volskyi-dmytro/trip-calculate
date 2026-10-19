import { litreUnit } from '../lib/format'
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, MapPin, Clock, Fuel, ArrowRight } from 'lucide-react';
import { PageShell } from '../components/common/PageShell';
import { QuickCalculator } from '../components/QuickCalculator';
import { useLanguage } from '../contexts/LanguageContext';
import { formatMoney, formatPrice, formatDistance, formatDuration } from '../lib/format';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { withLocalePrefix } from '../utils/locale';
import { plannerPrefillQuery } from '../utils/plannerPrefill';
import { track } from '../lib/analytics';
import { cityRouteService, type CityRouteDetail } from '../services/cityRouteService';
import '../styles/page-layout.css';

type PageState = 'loading' | 'ready' | 'notFound' | 'error';


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
      <PageShell>
        <div className="flex items-center justify-center py-24" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      </PageShell>
    );
  }

  if (state === 'notFound' || state === 'error') {
    return (
      <PageShell mainClassName="container">
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
      </PageShell>
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
  const livePrice = r.fuelPricePerLiter !== null && r.fuelPriceSource !== 'seed';
  const priceDate = livePrice && formattedPriceDate
    ? t('cityRoute.priceDateSuffix').replace('{date}', formattedPriceDate)
    : '';
  const priceNote =
    r.fuelPricePerLiter === null
      ? t('cityRoute.method.priceMissing')
      : livePrice
        ? t('cityRoute.method.priceLive').replace('{date}', formattedPriceDate ?? '')
        : t('cityRoute.method.priceDefault');
  const explanation = t('cityRoute.explanation')
    .replace('{consumption}', r.consumptionL100.toLocaleString(language === 'uk' ? 'uk-UA' : 'en-GB'))
    .replace('{passengers}', tn('common.passengersGenitive', r.passengers))
    .replace('{priceDate}', priceDate);

  const facts = [
    {
      icon: MapPin,
      label: t('cityRoute.distance'),
      value: formatDistance(r.distanceKm, language),
    },
    {
      icon: Clock,
      label: t('cityRoute.duration'),
      value: formatDuration(r.durationMin, language),
    },
    r.fuelPricePerLiter !== null && {
      icon: Fuel,
      label: t('cityRoute.fuelPrice'),
      value: `${formatPrice(r.fuelPricePerLiter, r.currency, language)}/${litreUnit(language)}`,
    },
    r.totalCost !== null && {
      icon: ArrowRight,
      label: t('cityRoute.totalCost'),
      value: formatMoney(r.totalCost, r.currency, language),
    },
    r.perPassenger !== null && {
      icon: ArrowRight,
      label: t('cityRoute.perPassenger'),
      value: formatMoney(r.perPassenger, r.currency, language),
    },
  ].filter((f): f is { icon: typeof MapPin; label: string; value: string } => Boolean(f));

  // Opens the planner with this exact route loaded (guest or signed in).
  const plannerHref = withLocalePrefix('/route-planner', language) + plannerPrefillQuery({
    from: { name: r.fromName, lat: r.from.lat, lng: r.from.lng },
    to: { name: r.toName, lat: r.to.lat, lng: r.to.lng },
    passengers: r.passengers,
  });
  const plannerLabel = t('cityRoute.plannerCtaRoute').replace('{from}', r.fromName).replace('{to}', r.toName);

  return (
    <PageShell mainClassName="container">
        <section className="section city-intro">
          <div>
          {/* Visible counterpart of the server's BreadcrumbList JSON-LD. */}
          <nav aria-label={t('cityRoute.breadcrumb')} className="breadcrumb">
            <Link className="touch-link" to={withLocalePrefix('/', language)}>Trip Calculate</Link>
            <span aria-hidden="true"> › </span>
            <span aria-current="page">
              {r.fromName} → {r.toName}
            </span>
          </nav>
          <h1>
            {r.fromName} → {r.toName}: {t('cityRoute.titleSuffix')}
          </h1>
          <p className="section-lead">{explanation}</p>
          {/* The next step at the decision point (above the fold on phones),
              not only at the bottom below the method text. */}
          <Link
            className="btn mt-4 city-planner-cta"
            to={plannerHref}
            onClick={() => track('cta_click', { location: 'route_page', label: 'plan_route_top', slug: r.slug })}
          >
            {plannerLabel}
          </Link>
          </div>
          {/* Calculator right after the intro: on mobile the stats were five tall cards
              deep before any actionable content; from 900px it sits beside the copy. */}
          <div className="city-intro-calc">
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

        <section className="section">
          <div className="features city-stats">
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
          <h2>{t('cityRoute.method.title')}</h2>
          <div className="faq-list">
            <div className="faq-item">
              <ul className="city-method-formula">
                <li>{t('cityRoute.method.liters')}</li>
                <li>{t('cityRoute.method.cost')}</li>
                <li>{t('cityRoute.method.share')}</li>
              </ul>
              <p>{t('cityRoute.method.scope')}</p>
            </div>
            <div className="faq-item">
              <p>
                {t(r.distanceSource === 'live' ? 'cityRoute.method.distanceLive' : 'cityRoute.method.distanceEstimate')}{' '}
                {priceNote}
              </p>
              <p>{t('cityRoute.method.conditions')}</p>
            </div>
          </div>
        </section>

        <section className="section text-center">
          <Link
            className="btn"
            to={plannerHref}
            onClick={() => track('cta_click', { location: 'route_page', label: 'plan_route_bottom', slug: r.slug })}
          >
            {plannerLabel}
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
    </PageShell>
  );
}
