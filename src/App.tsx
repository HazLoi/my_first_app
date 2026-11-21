import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { AuthScreen } from '@/screens/AuthScreen';
import { LobbyScreen } from '@/screens/LobbyScreen';

// Màn bàn chơi kéo theo three.js nên tách chunk riêng.
const TableScreen = lazy(() => import('@/screens/TableScreen').then((module) => ({ default: module.TableScreen })));

function Protected({ children }: { children: JSX.Element }) {
  const ready = useAuthStore((state) => state.ready);
  const session = useAuthStore((state) => state.session);
  const location = useLocation();
  if (!ready) return <div className="grid h-full place-items-center text-white/70">{t('common.loading')}</div>;
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  return children;
}

export function App() {
  const restore = useAuthStore((state) => state.restore);
  const lowGraphics = useSettingsStore((state) => state.lowGraphics);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    document.documentElement.classList.toggle('low-graphics', lowGraphics);
  }, [lowGraphics]);

  return (
    <Suspense fallback={<div className="grid h-full place-items-center text-white/70">{t('common.loading')}</div>}>
      <Routes>
        <Route path="/auth" element={<AuthScreen />} />
        <Route path="/lobby" element={<Protected><LobbyScreen /></Protected>} />
        <Route path="/table/:id" element={<Protected><TableScreen /></Protected>} />
        <Route path="*" element={<Navigate to="/lobby" replace />} />
      </Routes>
    </Suspense>
  );
}
