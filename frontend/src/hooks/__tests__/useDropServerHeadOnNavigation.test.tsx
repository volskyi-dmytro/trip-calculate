/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { useDropServerHeadOnNavigation } from '../useDocumentTitle';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let go: (path: string) => void = () => {};
let root: Root;

function mountAt(path: string) {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  act(() => root.render(<MemoryRouter initialEntries={[path]}><Probe /></MemoryRouter>));
}

function Probe() {
  useDropServerHeadOnNavigation();
  go = useNavigate();
  return null;
}

// What SpaShellController injects for /uk/route/kyiv-lviv
function serverHead() {
  document.head.innerHTML = `
    <meta name="description" content="Київ → Львів ≈ 541 км" />
    <meta property="og:image" content="https://trip-calculate.online/images/og-cover.png" />
    <link rel="canonical" href="https://trip-calculate.online/uk/route/kyiv-lviv" />
    <link rel="alternate" hreflang="en" href="https://trip-calculate.online/en/route/kyiv-lviv" />
    <link rel="icon" href="/favicon.ico" />
    <script type="application/ld+json">{"@type":"BreadcrumbList"}</script>`;
}

describe('useDropServerHeadOnNavigation', () => {
  afterEach(() => {
    act(() => root.unmount());
    document.head.innerHTML = '';
  });

  it('keeps the server tags on the page the visitor landed on', () => {
    serverHead();
    mountAt('/uk/route/kyiv-lviv');
    expect(document.querySelector('link[rel="canonical"]')).not.toBeNull();
    expect(document.querySelectorAll('link[hreflang]')).toHaveLength(1);
  });

  it('drops the previous page\'s canonical, hreflang, JSON-LD and description after navigating', () => {
    serverHead();
    mountAt('/uk/route/kyiv-lviv');
    act(() => go('/uk/dashboard'));

    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('link[hreflang]')).toBeNull();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(document.querySelector('meta[name="description"]')).toBeNull();
    // Site-wide tags stay.
    expect(document.querySelector('link[rel="icon"]')).not.toBeNull();
    expect(document.querySelector('meta[property="og:image"]')).not.toBeNull();
  });
});
