import { useList, useOne } from '@refinedev/core'
import { Button, Descriptions, Drawer, Empty, Form, Input, Table } from 'antd'
import type { TableColumnsType } from 'antd'
import { Search } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import type { Task, Workflow } from '../api/contracts'
import { positiveId } from '../api/task-client'
import { taskResources } from '../api/task-provider'
import {
  RequestFailure,
  StatusTag,
  TaskHeader,
  TaskLoading,
  Timestamp,
} from '../components/TaskPresentation'
import { titleOf } from '../presentation'

const pageSize = 20
const pageNumber = (value: string | null) => Number(positiveId(value) ?? 1)

function WorkflowContents({
  id,
  tasksPage,
  onTasksPage,
  onSelect,
}: {
  id: string
  tasksPage: number
  onTasksPage: (page: number) => void
  onSelect: (workflow: number) => void
}) {
  const { search } = useLocation()
  const { query, result: workflow } = useOne<Workflow>({
    resource: taskResources.workflows,
    id,
    errorNotification: false,
  })
  const { query: taskQuery, result: tasks } = useList<Task>({
    resource: taskResources.workflowTasks,
    meta: { workflowId: id },
    pagination: { currentPage: tasksPage, pageSize, mode: 'server' },
    queryOptions: { enabled: Boolean(workflow) },
    errorNotification: false,
  })

  if (query.isLoading) return <TaskLoading />
  if (!workflow || query.isError)
    return (
      <RequestFailure
        message="Could not load this workflow"
        error={query.error}
        retry={() => void query.refetch()}
      />
    )

  const columns: TableColumnsType<Task> = [
    {
      title: 'Task',
      key: 'title',
      render: (_, task) => (
        <Link to={`/tasks/${task.id}`} state={{ workflowSearch: search }}>
          {titleOf(task)}
        </Link>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (status) => <StatusTag status={status} />,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      width: 145,
      responsive: ['sm'],
      render: (value) => <Timestamp value={value} />,
    },
  ]

  return (
    <div className="task-stack">
      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, sm: 2 }}
        items={[
          {
            key: 'status',
            label: 'Status',
            children: <StatusTag status={workflow.status} />,
          },
          {
            key: 'source',
            label: 'Source',
            children: `#${workflow.source_id}`,
          },
          {
            key: 'snapshot',
            label: 'Source snapshot',
            children: `#${workflow.source_snapshot_id}`,
          },
          {
            key: 'created',
            label: 'Created',
            children: <Timestamp value={workflow.created_at} />,
          },
          {
            key: 'complete',
            label: 'Completed',
            children: <Timestamp value={workflow.completed_at} />,
          },
          {
            key: 'superseded',
            label: 'Superseded',
            children: <Timestamp value={workflow.superseded_at} />,
          },
          {
            key: 'previous',
            label: 'Previous workflow',
            children:
              workflow.previous_workflow_id != null ? (
                <Button
                  type="link"
                  onClick={() => onSelect(workflow.previous_workflow_id!)}
                >
                  #{workflow.previous_workflow_id}
                </Button>
              ) : (
                '—'
              ),
          },
        ]}
      />
      <section aria-label="Workflow tasks" className="task-table">
        <h2>Workflow tasks</h2>
        {taskQuery.isError ? (
          <RequestFailure
            message="Could not load workflow tasks"
            error={taskQuery.error}
            retry={() => void taskQuery.refetch()}
          />
        ) : (
          <Table<Task>
            columns={columns}
            dataSource={tasks.data}
            loading={taskQuery.isFetching}
            rowKey="id"
            size="small"
            pagination={{
              current: tasksPage,
              pageSize,
              total: tasks.total,
              showSizeChanger: false,
              onChange: onTasksPage,
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No tasks in this workflow"
                />
              ),
            }}
          />
        )}
      </section>
    </div>
  )
}

export default function WorkflowHistoryPage() {
  const [params, setParams] = useSearchParams()
  const [form] = Form.useForm<{ source: string }>()
  const source = positiveId(params.get('source'))
  const workflowId = positiveId(params.get('workflow'))
  const current = pageNumber(params.get('page'))
  const tasksPage = pageNumber(params.get('tasksPage'))
  const { query, result } = useList<Workflow>({
    resource: taskResources.workflows,
    meta: { sourceId: source },
    pagination: { currentPage: current, pageSize, mode: 'server' },
    queryOptions: { enabled: Boolean(source) },
    errorNotification: false,
  })

  useEffect(() => form.setFieldValue('source', source), [form, source])

  function selectWorkflow(id?: number) {
    const next = new URLSearchParams(params)
    next.delete('tasksPage')
    if (id) next.set('workflow', String(id))
    else next.delete('workflow')
    setParams(next)
  }

  function setPage(field: 'page' | 'tasksPage', page: number) {
    const next = new URLSearchParams(params)
    if (page > 1) next.set(field, String(page))
    else next.delete(field)
    setParams(next)
  }

  const columns: TableColumnsType<Workflow> = [
    {
      title: 'Workflow',
      dataIndex: 'id',
      width: 120,
      render: (id) => (
        <Button type="link" onClick={() => selectWorkflow(id)}>
          #{id}
        </Button>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 126,
      render: (status) => <StatusTag status={status} />,
    },
    {
      title: 'Source',
      dataIndex: 'source_id',
      width: 100,
      responsive: ['md'],
      render: (id) => <span className="task-mono">#{id}</span>,
    },
    {
      title: 'Snapshot',
      dataIndex: 'source_snapshot_id',
      width: 125,
      responsive: ['sm'],
      render: (id) => <span className="task-mono">#{id}</span>,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      width: 153,
      responsive: ['lg'],
      render: (value) => <Timestamp value={value} />,
    },
    {
      title: 'Completed',
      dataIndex: 'completed_at',
      width: 153,
      responsive: ['lg'],
      render: (value) => <Timestamp value={value} />,
    },
    {
      title: 'Previous',
      dataIndex: 'previous_workflow_id',
      responsive: ['md'],
      render: (id) =>
        id ? (
          <Button type="link" onClick={() => selectWorkflow(id)}>
            #{id}
          </Button>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <div className="task-page">
      <TaskHeader
        title="Workflow history"
        subtitle="Browse processing runs and historical tasks for a source."
      />
      <Form
        form={form}
        layout="vertical"
        className="task-history-filter"
        onFinish={({ source: value }) => {
          const id = positiveId(value)
          if (id) setParams({ source: id })
        }}
      >
        <Form.Item
          name="source"
          label="Source ID"
          rules={[
            {
              validator: (_, value) =>
                positiveId(value)
                  ? Promise.resolve()
                  : Promise.reject(new Error('Enter a positive source ID.')),
            },
          ]}
        >
          <Input inputMode="numeric" placeholder="Source ID" />
        </Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          icon={<Search size={15} />}
          loading={query.isFetching}
        >
          View workflows
        </Button>
      </Form>
      {!source ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Enter a source ID to view its workflows"
        />
      ) : query.isError ? (
        <RequestFailure
          message="Could not load workflow history"
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : (
        <Table<Workflow>
          className="task-table"
          columns={columns}
          dataSource={result.data}
          rowKey="id"
          loading={query.isFetching}
          size="small"
          pagination={{
            current,
            pageSize,
            total: result.total,
            showSizeChanger: false,
            onChange: (page) => setPage('page', page),
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No workflows for this source"
              />
            ),
          }}
        />
      )}
      <Drawer
        open={Boolean(workflowId)}
        onClose={() => selectWorkflow()}
        title={workflowId && `Workflow #${workflowId}`}
        width="min(680px, 100vw)"
      >
        {workflowId && (
          <WorkflowContents
            id={workflowId}
            tasksPage={tasksPage}
            onSelect={selectWorkflow}
            onTasksPage={(page) => setPage('tasksPage', page)}
          />
        )}
      </Drawer>
    </div>
  )
}
