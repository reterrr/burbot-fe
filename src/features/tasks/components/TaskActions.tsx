import { useInvalidate, useUpdate } from '@refinedev/core'
import { useQueryClient } from '@tanstack/react-query'
import { App, Button, Dropdown, Space } from 'antd'
import { Ellipsis } from 'lucide-react'
import { monitoringQueryKey } from '../../monitoring/api'
import type { TaskDetail, TaskStatus } from '../api/contracts'
import type { TaskApiError } from '../api/task-client'
import { taskResources } from '../api/task-provider'
import { label } from '../presentation'

const actions: Record<
  TaskStatus,
  { title: string; terminal?: boolean; danger?: boolean }
> = {
  pending: { title: 'Retry' },
  in_progress: { title: 'Start' },
  completed: { title: 'Complete', terminal: true },
  failed: { title: 'Mark failed', terminal: true, danger: true },
  cancelled: { title: 'Cancel task', terminal: true, danger: true },
}

export function TaskActions({
  task,
  compact = false,
}: {
  task: Pick<TaskDetail, 'id' | 'status' | 'allowed_statuses'>
  compact?: boolean
}) {
  const { modal } = App.useApp()
  const invalidate = useInvalidate()
  const cache = useQueryClient()
  const { mutateAsync, mutation } = useUpdate<
    TaskDetail,
    TaskApiError,
    { status: TaskStatus }
  >()
  const allowed = task.allowed_statuses ?? []

  async function update(status: TaskStatus) {
    try {
      await mutateAsync({
        resource: taskResources.tasks,
        id: task.id,
        values: { status },
        mutationMode: 'pessimistic',
        invalidates: [],
        successNotification: () => ({
          type: 'success',
          message: `Task #${task.id} · ${label(status)}`,
        }),
        errorNotification: (error) => ({
          type: 'error',
          message:
            error?.statusCode === 409
              ? 'Workflow changed'
              : 'Task status update failed',
          description: error?.message,
        }),
      })
    } catch (error) {
      if ((error as TaskApiError).statusCode !== 409) return
    }
    await Promise.all([
      cache.invalidateQueries({ queryKey: monitoringQueryKey }),
      invalidate({
        resource: taskResources.tasks,
        id: task.id,
        invalidates: ['list', 'detail'],
      }),
      invalidate({
        resource: taskResources.count,
        id: 'inbox',
        invalidates: ['detail'],
      }),
      invalidate({
        resource: taskResources.workflows,
        invalidates: ['resourceAll'],
      }),
      invalidate({
        resource: taskResources.workflowTasks,
        invalidates: ['list'],
      }),
      invalidate({
        resource: taskResources.reviews,
        id: task.id,
        invalidates: ['detail'],
      }),
    ])
  }

  function run(status: TaskStatus) {
    if (!allowed.includes(status) || mutation.isPending) return
    const action = actions[status]
    if (!action.terminal) {
      void update(status)
      return
    }
    const prompt =
      status === 'failed'
        ? `Mark task #${task.id} as failed?`
        : `${status === 'cancelled' ? 'Cancel' : 'Complete'} task #${task.id}?`
    modal.confirm({
      title: prompt,
      okText: action.title,
      cancelText: 'Go back',
      okButtonProps: { danger: action.danger },
      onOk: () => update(status),
    })
  }

  const primary: TaskStatus[] = (
    ['in_progress', 'completed', 'pending'] as const
  ).filter(
    (status) =>
      allowed.includes(status) &&
      !(task.status === 'failed' && status === 'in_progress'),
  )
  const secondary = allowed.filter((status) => !primary.includes(status))
  if (primary.length === 0 && (compact || secondary.length === 0)) return null

  return (
    <Space size={6} onClick={(event) => event.stopPropagation()}>
      {primary.map((status, index) => (
        <Button
          key={status}
          size={compact ? 'small' : 'middle'}
          type={!compact && index === 0 ? 'primary' : 'default'}
          disabled={mutation.isPending}
          onClick={() => run(status)}
        >
          {actions[status].title}
        </Button>
      ))}
      {!compact && secondary.length > 0 && (
        <Dropdown
          menu={{
            items: secondary.map((status) => ({
              key: status,
              label:
                status === 'in_progress'
                  ? 'Retry and start'
                  : actions[status].title,
              danger: actions[status].danger,
              onClick: () => run(status),
            })),
          }}
          trigger={['click']}
          disabled={mutation.isPending}
        >
          <Button
            aria-label="More task actions"
            icon={<Ellipsis size={16} />}
          />
        </Dropdown>
      )}
    </Space>
  )
}
