import { useState } from 'react';
import { Header } from '../components/common/Header';
import { Footer } from '../components/common/Footer';
import { CalculatorModal } from '../components/calculator/CalculatorModal';
import { useLanguage } from '../contexts/LanguageContext';

export function HomePage() {
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <>
      <Header onCalculateClick={() => setIsCalculatorOpen(true)} />

      <section className="intro">
        <div className="container">
          <h2>{t('intro.title')}</h2>
          <p>{t('intro.description')}</p>
          <div className="features">
            <div className="feature">
              <h3>{t('intro.userFriendly.title')}</h3>
              <p>{t('intro.userFriendly.text')}</p>
            </div>
            <div className="feature">
              <h3>{t('intro.routePlanner.title')}</h3>
              <p>{t('intro.routePlanner.text')}</p>
            </div>
            <div className="feature">
              <h3>{t('intro.quickLookup.title')}</h3>
              <p>{t('intro.quickLookup.text')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="faq">
        <div className="container">
          <h2>{t('faq.title')}</h2>
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

      <Footer />

      <CalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />
    </>
  );
}
