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
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h2>{t('intro.title')}</h2>
            <p style={{
              fontSize: '1.2em',
              color: 'var(--text-secondary)',
              maxWidth: '700px',
              margin: '0 auto',
              lineHeight: '1.6'
            }}>
              {t('intro.description')}
            </p>
          </div>
          <div className="features">
            <div className="feature">
              <div style={{
                fontSize: '3em',
                marginBottom: '16px',
                background: 'var(--gradient-ocean)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                ✨
              </div>
              <h3>{t('intro.userFriendly.title')}</h3>
              <p>{t('intro.userFriendly.text')}</p>
            </div>
            <div className="feature">
              <div style={{
                fontSize: '3em',
                marginBottom: '16px',
                background: 'var(--gradient-sunset)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                🗺️
              </div>
              <h3>{t('intro.routePlanner.title')}</h3>
              <p>{t('intro.routePlanner.text')}</p>
            </div>
            <div className="feature">
              <div style={{
                fontSize: '3em',
                marginBottom: '16px',
                background: 'var(--gradient-hero)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                ⚡
              </div>
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
