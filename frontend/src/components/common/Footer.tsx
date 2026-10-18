import { Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { withLocalePrefix } from '../../utils/locale';

// Same address the Privacy Policy already publishes as the controller contact.
const CONTACT_EMAIL = 'volskyi.dmytro@gmail.com';

export function Footer() {
  const { language, t } = useLanguage();
  const [before, after] = t('footer.contact').split('{email}');
  return (
    <footer>
      <div className="container footer-about">
        <p>{t('footer.about')}</p>
        <p>
          {before}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {after}
          {' · '}
          <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Trip Calculate feedback')}`}>{t('footer.feedback')}</a>
        </p>
      </div>
      <div className="container footer-inner">
        <p style={{ margin: 0 }}>© 2026 Trip Calculate · Dmytro Volskyi</p>
        <nav className="footer-links" aria-label={t('footer.legal')}>
          <Link to={withLocalePrefix('/privacy', language)}>{t('footer.privacy')}</Link>
          <Link to={withLocalePrefix('/terms', language)}>{t('footer.terms')}</Link>
          <Link to={`${withLocalePrefix('/privacy', language)}#cookies`}>{t('footer.cookies')}</Link>
        </nav>
        <div className="footer-links">
          <a
            href="https://www.linkedin.com/in/volskyi-dmytro"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
          <a
            href="https://www.github.com/volskyi-dmytro"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
