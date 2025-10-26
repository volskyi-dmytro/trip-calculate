import { useLanguage } from '../../contexts/LanguageContext';

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer>
      <div className="container">
        <p>© 2024 Dmytro Volskyi</p>
        <div className="social-links">
          <p>{t('footer.connectWith')}</p>
          <a href="https://www.linkedin.com/in/volskyi-dmytro" target="_blank" rel="noopener noreferrer" title="LinkedIn">
            LinkedIn
          </a>
          <a href="https://www.github.com/volskyi-dmytro" target="_blank" rel="noopener noreferrer" title="GitHub">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
