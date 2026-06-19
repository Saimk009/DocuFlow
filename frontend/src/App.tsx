import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useTenantRouter } from '@/lib/tenant'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Shell } from '@/components/layout/Shell'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { Invite } from '@/pages/auth/Invite'
import { SetupWizard } from '@/pages/onboarding/SetupWizard'
import { Dashboard } from '@/pages/dashboard/Dashboard'
import { Capture } from '@/pages/capture/Capture'
import { Queue } from '@/pages/queue/Queue'
import { ExceptionCenter } from '@/pages/exceptions/ExceptionCenter'
import { ExceptionGroupDetail } from '@/pages/exceptions/ExceptionGroupDetail'
import { DocumentList } from '@/pages/documents/DocumentList'
import { DocumentDetail } from '@/pages/documents/DocumentDetail'
import { WorkflowList } from '@/pages/workflows/WorkflowList'
import { WorkflowDesigner } from '@/pages/workflows/WorkflowDesigner'
import { RobotList } from '@/pages/robots/RobotList'
import { RobotDetail } from '@/pages/robots/RobotDetail'
import { Analytics } from '@/pages/analytics/Analytics'
import { CaseList } from '@/pages/cases/CaseList'
import { CaseDetail } from '@/pages/cases/CaseDetail'
import { Connectors } from '@/pages/connectors/Connectors'
import { ConnectorBuilder } from '@/pages/connectors/ConnectorBuilder'
import { ConnectorLogs } from '@/pages/connectors/ConnectorLogs'
import { Settings } from '@/pages/settings/Settings'
import { SuperAdmin } from '@/pages/admin/SuperAdmin'

export default function App() {
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage)
  useTenantRouter()

  useEffect(() => {
    void loadFromStorage()
  }, [loadFromStorage])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/invite/:token" element={<Invite />} />

      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <SetupWizard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Shell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="capture" element={<Capture />} />
        <Route path="queue" element={<Queue />} />
        <Route path="exceptions" element={<ExceptionCenter />} />
        <Route path="exceptions/:id" element={<ExceptionGroupDetail />} />
        <Route path="documents" element={<DocumentList />} />
        <Route path="documents/:id" element={<DocumentDetail />} />
        <Route path="workflows" element={<WorkflowList />} />
        <Route path="workflows/:id" element={<WorkflowDesigner />} />
        <Route path="robots" element={<RobotList />} />
        <Route path="robots/:id" element={<RobotDetail />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="cases" element={<CaseList />} />
        <Route path="cases/:id" element={<CaseDetail />} />
        <Route path="connectors" element={<Connectors />} />
        <Route path="connectors/new" element={<ConnectorBuilder />} />
        <Route path="connectors/:id/edit" element={<ConnectorBuilder />} />
        <Route path="connectors/:id/logs" element={<ConnectorLogs />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin" element={<SuperAdmin />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
