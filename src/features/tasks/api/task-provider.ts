import type {
  BaseRecord,
  CrudFilters,
  DataProvider,
  GetListParams,
  GetOneParams,
  Pagination,
  ResourceProps,
  UpdateParams,
} from '@refinedev/core'
import {
  inboxStatuses,
  taskReasons,
  taskStatuses,
  taskTypes,
} from './contracts.ts'
import type { InboxFilters, TaskStatus } from './contracts.ts'
import { positiveId, TaskApiError, taskClient } from './task-client.ts'

export const taskResources = {
  tasks: 'tasks',
  count: 'task-inbox-count',
  workflows: 'workflows',
  workflowTasks: 'workflow-tasks',
  reviews: 'monitoring-reviews',
} as const

export const studioResources: ResourceProps[] = [
  { name: taskResources.tasks, list: '/tasks', show: '/tasks/:id' },
  { name: taskResources.workflows, list: '/tasks/history' },
  { name: taskResources.reviews, show: '/tasks/:id/review' },
  { name: taskResources.count },
  { name: taskResources.workflowTasks },
]

const pageOptions = ({ currentPage = 1, pageSize = 20 }: Pagination = {}) => {
  const limit = Number.isSafeInteger(pageSize)
    ? Math.min(100, Math.max(1, pageSize))
    : 20
  const offset = (currentPage - 1) * limit
  return {
    limit,
    offset: Number.isSafeInteger(offset) && offset > 0 ? offset : 0,
  }
}

export function readInboxFilters(filters: CrudFilters = []): InboxFilters {
  const values: InboxFilters = {}
  for (const filter of filters) {
    if (!('field' in filter) || filter.operator !== 'eq') continue
    const { field, value } = filter
    if (field === 'status')
      values.status = inboxStatuses.find((item) => item === value)
    if (field === 'type') values.type = taskTypes.find((item) => item === value)
    if (field === 'reason')
      values.reason = taskReasons.find((item) => item === value)
    if (field === 'source_id' || field === 'task_id')
      values[field] = positiveId(value)
  }
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  )
}

function unsupported(): Promise<never> {
  return Promise.reject(
    new TaskApiError(405, 'This operation is unavailable for the resource.'),
  )
}

export const taskDataProvider: DataProvider = {
  getApiUrl: () => '/backend',
  getList: async <TData extends BaseRecord>({
    resource,
    pagination,
    filters,
    meta,
  }: GetListParams) => {
    const paging = pageOptions(pagination)
    const signal = meta?.queryContext?.signal
    if (resource === taskResources.tasks) {
      const page = await taskClient.inbox(
        paging,
        readInboxFilters(filters),
        signal,
      )
      const data = page.items.map(({ task, ...context }) => ({
        ...context,
        ...task,
      }))
      return { data: data as BaseRecord[] as TData[], total: page.total }
    }
    if (resource === taskResources.workflows) {
      const page = await taskClient.workflows(meta?.sourceId, paging, signal)
      return { data: page.items as BaseRecord[] as TData[], total: page.total }
    }
    if (resource === taskResources.workflowTasks) {
      const page = await taskClient.workflowTasks(
        meta?.workflowId,
        paging,
        signal,
      )
      return { data: page.items as BaseRecord[] as TData[], total: page.total }
    }
    return unsupported()
  },
  getOne: async <TData extends BaseRecord>({
    resource,
    id,
    meta,
  }: GetOneParams) => {
    const signal = meta?.queryContext?.signal
    switch (resource) {
      case taskResources.tasks:
        return {
          data: (await taskClient.task(id, signal)) as BaseRecord as TData,
        }
      case taskResources.workflows:
        return {
          data: (await taskClient.workflow(id, signal)) as BaseRecord as TData,
        }
      case taskResources.reviews:
        return {
          data: {
            ...(await taskClient.review(id, signal)),
            id,
          } as BaseRecord as TData,
        }
      case taskResources.count:
        return {
          data: {
            id,
            count: await taskClient.count(signal),
          } as BaseRecord as TData,
        }
      default:
        return unsupported()
    }
  },
  update: async <TData extends BaseRecord, TVariables>({
    resource,
    id,
    variables,
  }: UpdateParams<TVariables>) => {
    if (resource !== taskResources.tasks) return unsupported()
    const status = (variables as { status?: TaskStatus } | null)?.status
    if (!status || !taskStatuses.includes(status))
      throw new TaskApiError(422, 'Invalid task status.')
    return {
      data: (await taskClient.setStatus(id, status)) as BaseRecord as TData,
    }
  },
  create: unsupported,
  deleteOne: unsupported,
}
