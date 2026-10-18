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

/** Popular-route list SpaShellController ships with the home HTML, so crawlers see
 *  the links without an API call (same idea as CityRoutePage's data island). */
function embeddedRoutes(): CityRouteSummary[] {
  try {
    const island = document.getElementById('city-routes-data');
    return island ? (JSON.parse(island.textContent ?? '') as CityRouteSummary[]) : [];
  } catch {
    return [];
  }
}

export function HomePage() {
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const { t, language } = useLanguage();
  const [popularRoutes, setPopularRoutes] = useState<CityRouteSummary[]>(embeddedRoutes);
  useDocumentTitle(t('pageTitle.home'));

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

  // A wall of 20 chips buries the useful ones; the rest stay in the DOM
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
          <section className="section">
            <h2>{t('home.popularRoutes.title')}</h2>
            <div className="route-chips" id="popular-routes">
              {popularRoutes.map((route, i) => (
                <Link
                  className="route-chip"
                  to={withLocalePrefix(`/route/${route.slug}`, language)}
                  key={route.slug}
                  hidden={!showAllRoutes && i >= VISIBLE_ROUTES}
                >
                  {route.from[language]} → {route.to[language]}
                </Link>
              ))}
              {!showAllRoutes && popularRoutes.length > VISIBLE_ROUTES && (
                <button
                  type="button"
                  className="route-chip route-chip-more"
                  aria-controls="popular-routes"
                  aria-expanded={false}
                  onClick={() => setShowAllRoutes(true)}
                >
                  {t('home.popularRoutes.all')} ({popularRoutes.length})
                </button>
              )}
            </div>
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
          </div>
        </section>
      </PageShell>
    </>
  );
}
