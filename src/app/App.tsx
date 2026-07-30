import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { LandingPage } from '../routes/LandingPage'
import { JoinPage } from '../routes/JoinPage'
import { PlayPage } from '../routes/PlayPage'
import { HostLoginPage } from '../routes/HostLoginPage'
import { HostDashboardPage } from '../routes/HostDashboardPage'
import { QuizEditorPage } from '../routes/QuizEditorPage'
import { HostGamePage } from '../routes/HostGamePage'
import { NotFoundPage } from '../routes/NotFoundPage'
import { RequireHost } from '../features/auth/RequireHost'

export function App() {
  return (
    <AppShell>
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
    </AppShell>
  )
}
