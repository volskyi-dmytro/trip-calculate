import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useSeason } from './hooks/useSeason';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { HomePage } from './pages/HomePage';
import { RoutePlannerPage } from './pages/RoutePlannerPage';
import { UserDashboard } from './pages/UserDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminRoute } from './components/auth/AdminRoute';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
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
              <Route path="/" element={<HomePage />} />
              <Route
                path="/route-planner"
                element={
                  <ProtectedRoute>
                    <RoutePlannerPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/dashboard" element={<UserDashboard />} />
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
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
