import { lazy, Suspense } from 'react'
import { Layout } from 'antd'
import { Navigate, Route, Routes } from 'react-router'
import { TaskLoading } from './components/TaskPresentation'
import './tasks.css'

const InboxPage = lazy(() => import('./pages/InboxPage'))
const TaskDetailsPage = lazy(() => import('./pages/TaskDetailsPage'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
const WorkflowHistoryPage = lazy(() => import('./pages/WorkflowHistoryPage'))

export default function TaskRoutes() {
  return (
    <Layout className="task-workspace">
      <Layout.Content className="task-content">
        <Suspense fallback={<TaskLoading />}>
          <Routes>
            <Route index element={<InboxPage />} />
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
