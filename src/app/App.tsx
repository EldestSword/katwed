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
const QuizEditorPage = lazy(() => import('../routes/QuizEditorPage').then((module) => ({ default: module.QuizEditorPage })))
const HostGamePage = lazy(() => import('../routes/HostGamePage').then((module) => ({ default: module.HostGamePage })))
const NotFoundPage = lazy(() => import('../routes/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))

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
            <Route path="/host/quizzes/:quizId/edit" element={<QuizEditorPage />} />
            <Route path="/host/game/:sessionId" element={<HostGamePage />} />
          </Route>
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}
