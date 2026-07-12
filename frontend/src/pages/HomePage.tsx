import { useState } from 'react';
import { Calculator, Map, Sparkles, Users } from 'lucide-react';
import { Header } from '../components/common/Header';
import { Footer } from '../components/common/Footer';
import { CalculatorModal } from '../components/calculator/CalculatorModal';
import { QuickCalculator } from '../components/QuickCalculator';
import { useLanguage } from '../contexts/LanguageContext';

export function HomePage() {
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const { t } = useLanguage();

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
      icon: Map,
      title: t('intro.routePlanner.title'),
      text: t('intro.routePlanner.text'),
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
        <section className="section">
          <div style={{ maxWidth: '26rem', margin: '0 auto' }}>
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
