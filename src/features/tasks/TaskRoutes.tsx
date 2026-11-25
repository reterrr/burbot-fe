import { lazy, Suspense } from 'react'
import { Layout } from 'antd'
import { NavLink, Navigate, Route, Routes, useSearchParams } from 'react-router'
import { localReviewEnabled } from '../../app/studio'
import { TaskLoading } from './components/TaskPresentation'
import './tasks.css'
import '../monitoring/monitoring.css'

const InboxPage = lazy(() => import('./pages/InboxPage'))
const ObjectInboxPage = lazy(() => import('./pages/ObjectInboxPage'))
const ObjectReviewPage = lazy(() => import('./pages/ObjectReviewPage'))
const TaskDetailsPage = lazy(() => import('./pages/TaskDetailsPage'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
const WorkflowHistoryPage = lazy(() => import('./pages/WorkflowHistoryPage'))

export default function TaskRoutes() {
  const [params] = useSearchParams()
  const legacyInbox =
    params.has('currentPage') ||
    params.has('pageSize') ||
    [...params.keys()].some((key) => key.startsWith('filters['))
  return (
    <Layout className="task-workspace">
      <Layout.Content className="task-content">
        {localReviewEnabled && (
          <nav className="monitoring-nav" aria-label="Task navigation">
            <NavLink to="/tasks" end>
              By business object
            </NavLink>
            <NavLink to="/tasks/unbound">Unbound observations</NavLink>
            <NavLink to="/monitoring/attention?issue=job_failed">
              Source-level issues
            </NavLink>
            <NavLink to="/tasks/all">All tasks</NavLink>
          </nav>
        )}
        <Suspense fallback={<TaskLoading />}>
          <Routes>
            <Route
              index
              element={
                localReviewEnabled ? (
                  legacyInbox ? (
                    <Navigate to={`/tasks/all?${params}`} replace />
                  ) : (
                    <ObjectInboxPage />
                  )
                ) : (
                  <InboxPage />
                )
              }
            />
            <Route path="all" element={<InboxPage key="all" />} />
            <Route
              path="unbound"
              element={<InboxPage key="unbound" unbound />}
            />
            {localReviewEnabled && (
              <Route path="objects/:objectId" element={<ObjectReviewPage />} />
            )}
            <Route path="history" element={<WorkflowHistoryPage />} />
            <Route path=":id" element={<TaskDetailsPage />} />
            <Route path=":id/review" element={<ReviewPage />} />
            <Route path="*" element={<Navigate to="/tasks" replace />} />
          </Routes>
        </Suspense>
      </Layout.Content>
    </Layout>
  )
}
