import { Alert, Layout } from 'antd'
import { lazy, Suspense } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router'
import { localReviewEnabled } from '../../app/studio'
import { TaskLoading } from '../tasks/components/TaskPresentation'
import AttentionPage from './AttentionPage'
import SourceReviewPage from './SourceReviewPage'
import '../tasks/tasks.css'
import './monitoring.css'

const SnapshotViewer = lazy(() => import('./SnapshotViewer'))

export default function MonitoringRoutes() {
  return (
    <Layout className="task-workspace">
      <Layout.Content className="task-content">
        <nav className="monitoring-nav" aria-label="Monitoring navigation">
          <NavLink to="/monitoring/attention">Attention</NavLink>
          <NavLink to="/monitoring/sources">Sources</NavLink>
          {localReviewEnabled && (
            <NavLink to="/tasks" end>
              Objects requiring attention
            </NavLink>
          )}
        </nav>
        {localReviewEnabled ? (
          <Routes>
            <Route path="attention" element={<AttentionPage />} />
            <Route path="sources" element={<AttentionPage includeAll />} />
            <Route path="sources/:sourceId" element={<SourceReviewPage />} />
            <Route
              path="sources/:sourceId/snapshots/:snapshotId"
              element={
                <Suspense
                  fallback={<TaskLoading message="Loading snapshot…" />}
                >
                  <SnapshotViewer />
                </Suspense>
              }
            />
            <Route
              path="*"
              element={<Navigate to="/monitoring/attention" replace />}
            />
          </Routes>
        ) : (
          <div className="task-page">
            <Alert
              type="info"
              showIcon
              message="Monitoring needs a local operator token"
              description={
                <>
                  Set <code>MONITORING_ADMIN_TOKEN</code> in the Vite server
                  environment and restart Studio.
                </>
              }
            />
          </div>
        )}
      </Layout.Content>
    </Layout>
  )
}
