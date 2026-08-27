import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { LoadingScreen } from '../components/LoadingScreen'
import { RequireHost } from '../features/auth/RequireHost'

const LandingPage = lazy(() => import('../routes/LandingPage').then((module) => ({ default: module.LandingPage })))
const JoinPage = lazy(() => import('../routes/JoinPage').then((module) => ({ default: module.JoinPage })))
const PlayPage = lazy(() => import('../routes/PlayPage').then((module) => ({ default: module.PlayPage })))
const HostLoginPage = lazy(() => import('../routes/HostLoginPage').then((module) => ({ default: module.HostLoginPage })))
const HostDashboardPage = lazy(() => import('../routes/HostDashboardPage').then((module) => ({ default: module.HostDashboardPage })))
const HostStoragePage = lazy(() => import('../routes/HostStoragePage').then((module) => ({ default: module.HostStoragePage })))
const QuizEditorPage = lazy(() => import('../routes/QuizEditorPage').then((module) => ({ default: module.QuizEditorPage })))
const GameSetupPage = lazy(() => import('../routes/GameSetupPage').then((module) => ({ default: module.GameSetupPage })))
const HostGamePage = lazy(() => import('../routes/HostGamePage').then((module) => ({ default: module.HostGamePage })))
const PresentationPage = lazy(() => import('../routes/PresentationPage').then((module) => ({ default: module.PresentationPage })))
const NotFoundPage = lazy(() => import('../routes/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const DesignSystemPage = lazy(() => import('../routes/DesignSystemPage').then((module) => ({ default: module.DesignSystemPage })))

export function App() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingScreen message="Opening Katwed!…" />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/play/:roomCode" element={<PlayPage />} />
          <Route path="/host/login" element={<HostLoginPage />} />
          <Route element={<RequireHost />}>
            <Route path="/host" element={<HostDashboardPage />} />
            <Route path="/host/storage" element={<HostStoragePage />} />
            <Route path="/host/design-system" element={<DesignSystemPage />} />
            <Route path="/host/quizzes/:quizId/edit" element={<QuizEditorPage />} />
            <Route path="/host/quizzes/:quizId/setup" element={<GameSetupPage />} />
            <Route path="/host/game/:sessionId" element={<Navigate to="control" replace />} />
            <Route path="/host/game/:sessionId/control" element={<HostGamePage />} />
            <Route path="/host/game/:sessionId/present" element={<PresentationPage />} />
          </Route>
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}
