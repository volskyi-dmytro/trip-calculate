import { useEffect, useState } from 'react';
import { Calculator, Car, Map, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '../components/common/Header';
import { Footer } from '../components/common/Footer';
import { CalculatorModal } from '../components/calculator/CalculatorModal';
import { QuickCalculator } from '../components/QuickCalculator';
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
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const { t, language } = useLanguage();
  const [popularRoutes, setPopularRoutes] = useState<CityRouteSummary[]>(embeddedRoutes);
  useDocumentTitle(t('pageTitle.home'));

  // The server embeds the list on /en and /uk; the fetch only covers a client-side
  // arrival from another page. Best-effort — a failure just hides the section.
  useEffect(() => {
    if (popularRoutes.length > 0) return;
    cityRouteService.list().then(setPopularRoutes).catch(() => {});
  }, [popularRoutes.length]);

  const features = [
    {
      icon: Sparkles,
      title: t('intro.aiAssistant.title'),
      text: t('intro.aiAssistant.text'),
    },
    {
      icon: Calculator,
      title: t('intro.userFriendly.title'),
      text: t('intro.userFriendly.text'),
    },
    {
      icon: Car,
      title: t('intro.carGarage.title'),
      text: t('intro.carGarage.text'),
    },
    {
      icon: Map,
      title: t('intro.routePlanner.title'),
      text: t('intro.routePlanner.text'),
      href: withLocalePrefix('/route-planner', language),
    },
    {
      icon: Users,
      title: t('intro.quickLookup.title'),
      text: t('intro.quickLookup.text'),
    },
  ];

  return (
    <>
      <Header onCalculateClick={() => setIsCalculatorOpen(true)} />

      <main className="container">
        <section className="section home-intro" aria-labelledby="home-intro-title">
          <div className="home-intro-copy">
            <p className="home-intro-eyebrow">{t('home.intro.eyebrow')}</p>
            <h2 id="home-intro-title" className="home-intro-title">{t('home.intro.title')}</h2>
            <p className="home-intro-text">{t('home.intro.text')}</p>
            {/* Decorative: the text beside it carries the meaning. */}
            <img
              className="home-intro-art"
              src="/images/planner-empty.webp"
              alt=""
              width={720}
              height={480}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="home-intro-calc">
            <QuickCalculator example />
          </div>
        </section>

        <section className="section">
          <h2>{t('intro.title')}</h2>
          <p className="section-lead">{t('intro.description')}</p>
          <div className="features">
            {features.map(({ icon: Icon, title, text, href }) =>
              href ? (
                <Link className="feature" to={href} key={title}>
                  <span className="feature-icon">
                    <Icon size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </Link>
              ) : (
                <article className="feature" key={title}>
                  <span className="feature-icon">
                    <Icon size={20} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              )
            )}
          </div>
        </section>

        {popularRoutes.length > 0 && (
          <section className="section">
            <h2>{t('home.popularRoutes.title')}</h2>
            <div className="route-chips">
              {popularRoutes.map((route) => (
                <Link
                  className="route-chip"
                  to={withLocalePrefix(`/route/${route.slug}`, language)}
                  key={route.slug}
                >
                  {route.from[language]} → {route.to[language]}
                </Link>
              ))}
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
      </main>

      <Footer />

      <CalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />
    </>
  );
}
