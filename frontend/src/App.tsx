import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useSeason } from './hooks/useSeason';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { HomePage } from './pages/HomePage';
import { RoutePlannerPage } from './pages/RoutePlannerPage';
import { ReceiptPage } from './pages/ReceiptPage';
import { UserDashboard } from './pages/UserDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminRoute } from './components/auth/AdminRoute';
import { LocaleBoundary } from './components/common/LocaleBoundary';
import './styles/global.css';

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
            </Routes>
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
