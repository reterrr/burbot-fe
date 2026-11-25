import { useOne } from '@refinedev/core'
import { useLocation } from 'react-router'
import { localReviewEnabled } from '../../../app/studio'
import type { MonitoringReview, TaskDetail } from '../api/contracts'
import { positiveId, type TaskApiError } from '../api/task-client'
import { taskResources } from '../api/task-provider'

export function useInboxCount() {
  return useOne<{ id: string; count: number }>({
    resource: taskResources.count,
    id: 'inbox',
    errorNotification: false,
    queryOptions: { staleTime: 30_000 },
  })
}

export function useTask(id: string | undefined) {
  const valid = positiveId(id)
  return useOne<TaskDetail>({
    resource: taskResources.tasks,
    id: valid,
    errorNotification: false,
    queryOptions: { enabled: Boolean(valid) },
  })
}

export function useMonitoringReview(id: string | undefined, enabled: boolean) {
  const valid = positiveId(id)
  return useOne<MonitoringReview, TaskApiError>({
    resource: taskResources.reviews,
    id: valid,
    errorNotification: false,
    queryOptions: { enabled: Boolean(valid && enabled && localReviewEnabled) },
  })
}

export function useTaskBackLink() {
  const { state } = useLocation()
  if (typeof state?.workflowSearch === 'string')
    return {
      to: `/tasks/history${state.workflowSearch}`,
      label: 'Workflow history',
    }
  if (
    typeof state?.objectReviewBack?.to === 'string' &&
    state.objectReviewBack.to.startsWith('/tasks/objects/')
  )
    return { ...state.objectReviewBack, label: 'Object review' }
  const path =
    ['/tasks', '/tasks/all', '/tasks/unbound'].find(
      (path) => path === state?.inboxPath,
    ) ?? '/tasks'
  return {
    to: `${path}${typeof state?.inboxSearch === 'string' ? state.inboxSearch : ''}`,
    label: path === '/tasks/unbound' ? 'Unbound observations' : 'Task inbox',
  }
}
