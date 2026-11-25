import { useOne } from '@refinedev/core'
import { useLocation } from 'react-router'
import { localReviewEnabled } from '../../../app/studio'
import type { MonitoringReview, TaskDetail } from '../api/contracts'
import { positiveId } from '../api/task-client'
import type { TaskApiError } from '../api/task-client'
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

export function useTaskReview(id: string | undefined, enabled: boolean) {
  const valid = positiveId(id)
  return useOne<MonitoringReview, TaskApiError>({
    resource: taskResources.reviews,
    id: valid,
    errorNotification: false,
    queryOptions: {
      enabled: Boolean(valid && enabled && localReviewEnabled),
      retry: false,
    },
  })
}

export function useTaskBackLink() {
  const { state } = useLocation()
  if (typeof state?.workflowSearch === 'string')
    return {
      to: `/tasks/history${state.workflowSearch}`,
      label: 'Workflow history',
    }
  return {
    to: `/tasks${typeof state?.inboxSearch === 'string' ? state.inboxSearch : ''}`,
    label: 'Task inbox',
  }
}
