import { useEffect, useState } from 'react';
import { Car, Map, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '../components/common/Header';
import { PageShell } from '../components/common/PageShell';
import { QuickCalculator } from '../components/QuickCalculator';
import { track } from '../lib/analytics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { withLocalePrefix } from '../utils/locale';
import { cityRouteService, type CityRouteSummary } from '../services/cityRouteService';
import { calculateRouteCost } from '../services/routeCost';

/** JSON SpaShellController ships with the home HTML, so crawlers see it without an
 *  API call (same idea as CityRoutePage's data island). */
function readIsland<T>(id: string): T | null {
  try {
    const island = document.getElementById(id);
    return island ? (JSON.parse(island.textContent ?? '') as T) : null;
  } catch {
    return null;
  }
}

interface HomeFuelPrice {
  pricePerLiter: number;
  date: string;
  consumptionL100: number;
  passengers: number;
}

// Used only until the first daily refresh lands (no island): QuickCalculator's
// mid-October 2026 A-95 example price, labelled as indicative on the page.
const SAMPLE_FUEL: HomeFuelPrice = { pricePerLiter: 87, date: '', consumptionL100: 7.5, passengers: 4 };

export function HomePage() {
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const { t, language } = useLanguage();
  const [popularRoutes, setPopularRoutes] = useState<CityRouteSummary[]>(() => readIsland('city-routes-data') ?? []);
  const [liveFuel] = useState(() => readIsland<HomeFuelPrice>('fuel-price-data'));
  useDocumentTitle(t('pageTitle.home'));

  const locale = language === 'uk' ? 'uk-UA' : 'en-GB';
  const num = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits });
  const money = (n: number, digits = 0) => t('home.money').replace('{amount}', num(n, digits));
  const fill = (key: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((text, [k, v]) => text.replaceAll(`{${k}}`, String(v)), t(key));

  // One price for the worked example and the table, so the two always agree.
  const fuel = liveFuel ?? SAMPLE_FUEL;
  const costOf = (km: number) => calculateRouteCost(km, fuel.consumptionL100, fuel.pricePerLiter, fuel.passengers);
  const priceText = money(fuel.pricePerLiter, 2);
  const priceNote = liveFuel
    ? fill('home.guide.priceLive', { date: new Date(liveFuel.date).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) })
    : fill('home.guide.priceSample', { price: priceText });
  const exampleRoute = popularRoutes.find((r) => r.distanceKm) ?? null;
  const example = exampleRoute ? costOf(exampleRoute.distanceKm) : null;

  // The server embeds the list on /en and /uk; the fetch only covers a client-side
  // arrival from another page. Best-effort — a failure just hides the section.
  useEffect(() => {
    if (popularRoutes.length > 0) return;
    cityRouteService.list().then(setPopularRoutes).catch(() => {});
  }, [popularRoutes.length]);

  // Three plain-language benefits (the old five included one describing the
  // calculator the visitor had just used, and only one card was clickable).
  const features = [
    { icon: Sparkles, title: t('intro.aiAssistant.title'), text: t('intro.aiAssistant.text') },
    { icon: Map, title: t('intro.routePlanner.title'), text: t('intro.routePlanner.text') },
    { icon: Car, title: t('intro.carGarage.title'), text: t('intro.carGarage.text') },
  ];

  const steps = [1, 2, 3].map((n) => ({
    n,
    title: t(`home.how.step${n}.title`),
    text: t(`home.how.step${n}.text`),
  }));

  // A 20-row table buries the useful rows; the rest stay in the DOM
  // (crawlable) and appear on request.
  const VISIBLE_ROUTES = 8;

  return (
    <>
      <PageShell header={<Header />} mainClassName="container">
        <section className="section home-intro" aria-labelledby="home-how-title">
          <div className="home-intro-copy">
            <h2 id="home-how-title" className="home-intro-title">{t('home.how.title')}</h2>
            <ol className="home-steps">
              {steps.map((step) => (
                <li className="home-step" key={step.n}>
                  <span className="home-step-num" aria-hidden="true">{step.n}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link
              className="btn home-how-cta"
              to={withLocalePrefix('/route-planner', language)}
              onClick={() => track('cta_click', { location: 'home_how', label: 'plan_trip' })}
            >
              {t('home.how.cta')}
            </Link>
          </div>
          <div className="home-intro-calc">
            <p className="home-calc-label">{t('home.calcLabel')}</p>
            <QuickCalculator example />
          </div>
        </section>

        <section className="section home-guide" aria-labelledby="home-guide-title">
          <h2 id="home-guide-title">{t('home.guide.title')}</h2>
          <p className="section-lead">{t('home.guide.lead')}</p>
          <p className="home-formula">
            <strong>{t('home.guide.formulaLabel')}:</strong> {t('home.guide.formula')}
          </p>
          {exampleRoute && example && (
            <>
              <h3>{fill('home.guide.example.title', { from: exampleRoute.from[language], to: exampleRoute.to[language] })}</h3>
              <ol className="home-guide-list">
                <li>{fill('home.guide.example.step1', { km: num(example.distanceKm) })}</li>
                <li>{fill('home.guide.example.step2', { km: num(example.distanceKm), consumption: num(example.consumption, 1), liters: num(example.fuelNeeded, 1) })}</li>
                <li>{fill('home.guide.example.step3', { liters: num(example.fuelNeeded, 1), price: priceText, total: money(example.total) })}</li>
                <li>{fill('home.guide.example.step4', { people: fuel.passengers, total: money(example.total), share: money(example.perPerson) })}</li>
              </ol>
              <p className="home-guide-note">{priceNote}</p>
            </>
          )}
          <h3>{t('home.guide.split.title')}</h3>
          <p className="home-guide-text">{t('home.guide.split.text')}</p>
          <h3>{t('home.guide.factors.title')}</h3>
          <ul className="home-guide-list">
            {(['speed', 'city', 'load', 'weather', 'tyres'] as const).map((k) => (
              <li key={k}>{t(`home.guide.factors.${k}`)}</li>
            ))}
          </ul>
          <p className="home-guide-text">{t('home.guide.factors.tip')}</p>
          <h3>{t('home.guide.extra.title')}</h3>
          <p className="home-guide-text">
            {t('home.guide.extra.text')}{' '}
            <Link to={withLocalePrefix('/route-planner', language)}>{t('home.guide.extra.link')}</Link>
          </p>
        </section>

        <section className="section">
          <h2>{t('intro.title')}</h2>
          <p className="section-lead">{t('intro.description')}</p>
          <div className="features">
            {features.map(({ icon: Icon, title, text }) => (
              <article className="feature" key={title}>
                <span className="feature-icon">
                  <Icon size={20} strokeWidth={2} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        {popularRoutes.length > 0 && (
          <section className="section" aria-labelledby="home-routes-title">
            <h2 id="home-routes-title">{t('home.routes.title')}</h2>
            <p className="section-lead">
              {fill('home.routes.caption', { consumption: num(fuel.consumptionL100, 1), price: priceText, people: fuel.passengers })}{' '}
              {priceNote}
            </p>
            <div className="home-routes-wrap">
              <table className="home-routes" id="popular-routes">
                <thead>
                  <tr>
                    <th scope="col">{t('home.routes.col.route')}</th>
                    <th scope="col">{t('home.routes.col.distance')}</th>
                    <th scope="col">{t('home.routes.col.cost')}</th>
                    <th scope="col">{t('home.routes.col.share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {popularRoutes.map((route, i) => {
                    const cost = route.distanceKm ? costOf(route.distanceKm) : null;
                    return (
                      // Rows past the first few stay in the DOM (crawlable) and appear on request.
                      <tr key={route.slug} hidden={!showAllRoutes && i >= VISIBLE_ROUTES}>
                        <th scope="row">
                          <Link to={withLocalePrefix(`/route/${route.slug}`, language)}>
                            {route.from[language]} → {route.to[language]}
                          </Link>
                        </th>
                        <td>{cost ? fill('home.routes.km', { km: num(cost.distanceKm) }) : '—'}</td>
                        <td>{cost ? money(cost.total) : '—'}</td>
                        <td>{cost ? money(cost.perPerson) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!showAllRoutes && popularRoutes.length > VISIBLE_ROUTES && (
              <button
                type="button"
                className="route-chip route-chip-more home-routes-more"
                aria-controls="popular-routes"
                aria-expanded={false}
                onClick={() => setShowAllRoutes(true)}
              >
                {t('home.popularRoutes.all')} ({popularRoutes.length})
              </button>
            )}
          </section>
        )}

        <section className="section">
          <h2>{t('faq.title')}</h2>
          <div className="faq-list">
            <div className="faq-item">
              <h3>{t('faq.howWorks.question')}</h3>
              <p>{t('faq.howWorks.answer')}</p>
            </div>
            <div className="faq-item">
              <h3>{t('faq.free.question')}</h3>
              <p>{t('faq.free.answer')}</p>
            </div>
            <div className="faq-item">
              <h3>{t('faq.consumption.question')}</h3>
              <p>{t('faq.consumption.answer')}</p>
            </div>
            <div className="faq-item">
              <h3>{t('faq.abroad.question')}</h3>
              <p>{t('faq.abroad.answer')}</p>
            </div>
            {(['per100', 'price', 'otherFuel'] as const).map((k) => (
              <div className="faq-item" key={k}>
                <h3>{t(`faq.${k}.question`)}</h3>
                <p>{t(`faq.${k}.answer`)}</p>
              </div>
            ))}
          </div>
        </section>
      </PageShell>
    </>
  );
}
