import { Link } from 'react-router-dom';
import { PageShell } from '../components/common/PageShell';
import { useLanguage } from '../contexts/LanguageContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { withLocalePrefix } from '../utils/locale';
import '../styles/page-layout.css';

// Shown for unknown /en/... and /uk/... paths. The server already answers them
// with 404 + noindex; this keeps visitors from landing on a blank page.
export function NotFoundPage() {
  const { language, t } = useLanguage();
  useDocumentTitle(t('notFound.title'));
  return (
    <PageShell mainClassName="container">
        <section className="section text-center">
          <h1>{t('notFound.title')}</h1>
          <p className="section-lead" style={{ margin: '0 auto 24px' }}>
            {t('notFound.text')}
          </p>
          <Link className="btn" to={withLocalePrefix('/', language)}>
            {t('notFound.cta')}
          </Link>
        </section>
    </PageShell>
  );
}
