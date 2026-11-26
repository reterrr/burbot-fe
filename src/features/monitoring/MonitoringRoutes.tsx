import { Alert, Layout } from 'antd'
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router'
import { localReviewEnabled } from '../../app/studio'
import { positiveId } from '../tasks/api/task-client'
import AttentionPage from './AttentionPage'
import SourceReviewPage from './SourceReviewPage'
import '../tasks/tasks.css'
import './monitoring.css'

function LegacySnapshotRedirect() {
  const sourceId = positiveId(useParams().sourceId)
  return (
    <Navigate
      to={sourceId ? `/monitoring/sources/${sourceId}` : '/monitoring/sources'}
      replace
    />
  )
}

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
              element={<LegacySnapshotRedirect />}
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
