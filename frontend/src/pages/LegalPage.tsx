import { Fragment, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from '../components/common/Header';
import { Footer } from '../components/common/Footer';
import { useLanguage } from '../contexts/LanguageContext';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  legalTranslations,
  type LegalBlock,
  type LegalPageId,
} from '../i18n/legal';

// Renders the tiny inline markup used in legal.ts: **bold** and {email}.
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\{email\})/g).map((part, i) => {
    if (part === '{email}') {
      return (
        <a key={i} href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
          {LEGAL_CONTACT_EMAIL}
        </a>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === 'p') return <p>{renderInline(block.text)}</p>;
  if (block.kind === 'list') {
    return (
      <ul>
        {block.items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="legal-table-wrap">
      <table>
        <thead>
          <tr>
            {block.head.map((cell) => (
              <th scope="col" key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c}>{renderInline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalPage({ page }: { page: LegalPageId }) {
  const { language } = useLanguage();
  const { hash } = useLocation();
  const strings = legalTranslations[language];
  const doc = strings[page];

  // React Router doesn't scroll to #fragments (e.g. the footer's #cookies link).
  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [hash, page]);

  const effective = new Date(`${LEGAL_EFFECTIVE_DATE}T00:00:00Z`).toLocaleDateString(
    language === 'uk' ? 'uk-UA' : 'en-GB',
    { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' },
  );

  return (
    <>
      <Header />
      <main className="container">
        <article className="section legal">
          <h1>{doc.title}</h1>
          <p className="legal-meta">
            {strings.effectiveDate}: <time dateTime={LEGAL_EFFECTIVE_DATE}>{effective}</time>
          </p>

          <nav className="legal-toc" aria-label={strings.onThisPage}>
            <h2>{strings.onThisPage}</h2>
            <ol>
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.heading.replace(/^\d+\.\s*/, '')}</a>
                </li>
              ))}
            </ol>
          </nav>

          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-heading`}>
              <h2 id={`${s.id}-heading`}>{s.heading}</h2>
              {s.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </section>
          ))}
        </article>
      </main>
      <Footer />
    </>
  );
}
