import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useSeason } from './hooks/useSeason';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { HomePage } from './pages/HomePage';
import { AdminRoute } from './components/auth/AdminRoute';
import { LocaleBoundary } from './components/common/LocaleBoundary';
import './styles/global.css';

// Route-level code splitting: HomePage is the landing page and stays eager,
// everything else loads on demand to keep the initial bundle small.
const RoutePlannerPage = lazy(() =>
  import('./pages/RoutePlannerPage').then((m) => ({ default: m.RoutePlannerPage })),
);
const ReceiptPage = lazy(() =>
  import('./pages/ReceiptPage').then((m) => ({ default: m.ReceiptPage })),
);
const UserDashboard = lazy(() =>
  import('./pages/UserDashboard').then((m) => ({ default: m.UserDashboard })),
);
const AdminDashboard = lazy(() =>
  import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
);
const LegalPage = lazy(() =>
  import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);
const CityRoutePage = lazy(() =>
  import('./pages/CityRoutePage').then((m) => ({ default: m.CityRoutePage })),
);

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="glass-panel" style={{ padding: '20px 28px', borderRadius: 'var(--radius-md)' }}>
        <span className="tnum">…</span>
      </div>
    </div>
  );
}

function App() {
  const season = useSeason();

  // The seasonal photo is the ambient layer every glass surface refracts;
  // exposing it as a CSS var lets body::before render it app-wide.
  // The -ambient variant is a ~400-byte pre-blurred asset, so no runtime
  // CSS blur is needed (cheaper than filter: blur() on a fixed layer).
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--season-image',
      `url(/images/${season}-ambient.webp)`
    );
  }, [season]);

  return (
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Server-side redirect (LocaleRedirectController) handles bare "/"
                    for real visitors and crawlers; this is a client-side safety net
                    for any in-app navigation that lands here directly. */}
                <Route path="/" element={<Navigate to="/uk" replace />} />

                {/* Receipt pages are intentionally NOT locale-prefixed — see
                    Global Constraints in the implementation plan. */}
                <Route path="/r/:slug" element={<ReceiptPage />} />

                <Route
                  path="/:locale"
                  element={
                    <LocaleBoundary>
                      <HomePage />
                    </LocaleBoundary>
                  }
                />
                <Route
                  path="/:locale/route-planner"
                  element={
                    <LocaleBoundary>
                      <RoutePlannerPage />
                    </LocaleBoundary>
                  }
                />
                <Route
                  path="/:locale/route/:slug"
                  element={
                    <LocaleBoundary>
                      <CityRoutePage />
                    </LocaleBoundary>
                  }
                />
                <Route
                  path="/:locale/privacy"
                  element={
                    <LocaleBoundary>
                      <LegalPage page="privacy" />
                    </LocaleBoundary>
                  }
                />
                <Route
                  path="/:locale/terms"
                  element={
                    <LocaleBoundary>
                      <LegalPage page="terms" />
                    </LocaleBoundary>
                  }
                />
                <Route
                  path="/:locale/dashboard"
                  element={
                    <LocaleBoundary>
                      <UserDashboard />
                    </LocaleBoundary>
                  }
                />
                <Route
                  path="/:locale/admin"
                  element={
                    <LocaleBoundary>
                      <AdminRoute>
                        <AdminDashboard />
                      </AdminRoute>
                    </LocaleBoundary>
                  }
                />
                {/* Unknown /en/... or /uk/... paths (the server answers them with 404 + noindex) */}
                <Route
                  path="/:locale/*"
                  element={
                    <LocaleBoundary>
                      <NotFoundPage />
                    </LocaleBoundary>
                  }
                />
              </Routes>
            </Suspense>
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
