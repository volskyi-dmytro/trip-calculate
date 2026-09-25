import { Link } from 'react-router-dom';
import { Header } from '../components/common/Header';
import { Footer } from '../components/common/Footer';
import { useLanguage } from '../contexts/LanguageContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { withLocalePrefix } from '../utils/locale';

// Shown for unknown /en/... and /uk/... paths. The server already answers them
// with 404 + noindex; this keeps visitors from landing on a blank page.
export function NotFoundPage() {
  const { language, t } = useLanguage();
  useDocumentTitle(t('notFound.title'));
  return (
    <>
      <Header />
      <main className="container">
        <section className="section text-center">
          <h1>{t('notFound.title')}</h1>
          <p className="section-lead" style={{ margin: '0 auto 24px' }}>
            {t('notFound.text')}
          </p>
          <Link className="btn" to={withLocalePrefix('/', language)}>
            {t('notFound.cta')}
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
