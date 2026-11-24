import { useTable } from '@refinedev/antd'
import { Button, Empty, Form, Input, Select, Space, Table } from 'antd'
import type { TableColumnsType } from 'antd'
import { RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { inboxStatuses, taskReasons, taskTypes } from '../api/contracts'
import type { InboxFilters, InboxTask } from '../api/contracts'
import { positiveId } from '../api/task-client'
import type { TaskApiError } from '../api/task-client'
import { readInboxFilters, taskResources } from '../api/task-provider'
import { TaskActions } from '../components/TaskActions'
import {
  RequestFailure,
  StatusTag,
  TaskHeader,
  Timestamp,
} from '../components/TaskPresentation'
import { useInboxCount } from '../hooks/task-queries'
import { label, titleOf } from '../presentation'

const filterOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: label(value) }))
const idRule = {
  validator: (_rule: unknown, value: string | undefined) =>
    !value?.trim() || positiveId(value)
      ? Promise.resolve()
      : Promise.reject(new Error('Enter a positive integer ID.')),
}

const toFilters = (values: InboxFilters) =>
  Object.entries(values)
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([field, value]) => ({
      field,
      operator: 'eq' as const,
      value: value.trim(),
    }))

export default function InboxPage() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const { query: countQuery } = useInboxCount()
  const {
    tableProps,
    tableQuery,
    filters,
    setFilters,
    currentPage,
    pageSize,
    setCurrentPage,
    searchFormProps,
  } = useTable<InboxTask, TaskApiError, InboxFilters>({
    resource: taskResources.tasks,
    syncWithLocation: true,
    pagination: { pageSize: 20, mode: 'server' },
    filters: { mode: 'server', defaultBehavior: 'replace' },
    onSearch: toFilters,
    errorNotification: false,
    queryOptions: {
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  })
  const form = searchFormProps.form

  useEffect(() => {
    const active = readInboxFilters(filters)
    form?.setFieldsValue({
      status: active.status,
      type: active.type,
      reason: active.reason,
      source_id: active.source_id,
      task_id: active.task_id,
    })
  }, [filters, form])

  const total = tableQuery.data?.total
  useEffect(() => {
    if (total === undefined || tableQuery.isFetching) return
    const last = Math.max(1, Math.ceil(total / pageSize))
    if (currentPage > last) setCurrentPage(last)
  }, [total, tableQuery.isFetching, pageSize, currentPage, setCurrentPage])

  function refresh() {
    void tableQuery.refetch()
    void countQuery.refetch()
  }

  const fromInbox = { inboxSearch: search }
  const columns: TableColumnsType<InboxTask> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 78,
      responsive: ['sm'],
      render: (id) => <span className="task-mono">#{id}</span>,
    },
    {
      title: 'Title',
      key: 'title',
      render: (_, task) => (
        <Link
          className="task-row-title"
          to={`/tasks/${task.id}`}
          state={fromInbox}
          onClick={(event) => event.stopPropagation()}
        >
          {titleOf(task)}
        </Link>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 147,
      responsive: ['xl'],
      render: label,
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      width: 130,
      responsive: ['lg'],
      render: (reason) => (reason ? label(reason) : '—'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 108,
      render: (status) => <StatusTag status={status} />,
    },
    {
      title: 'Source',
      dataIndex: 'source_id',
      width: 86,
      responsive: ['md'],
      render: (id) => <span className="task-mono">#{id}</span>,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      width: 143,
      responsive: ['lg'],
      render: (value) => <Timestamp value={value} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 186,
      responsive: ['sm'],
      render: (_, task) => (
        <Space size={6} wrap>
          <Link
            to={`/tasks/${task.id}`}
            state={fromInbox}
            onClick={(event) => event.stopPropagation()}
          >
            View
          </Link>
          <TaskActions task={task} compact />
        </Space>
      ),
    },
  ]

  return (
    <div className="task-page">
      <TaskHeader
        title="Task inbox"
        subtitle="Actionable tasks from active source workflows."
        actions={
          <Button
            icon={<RefreshCw size={15} />}
            onClick={refresh}
            loading={tableQuery.isFetching}
          >
            Refresh
          </Button>
        }
      />
      <Form {...searchFormProps} layout="vertical" className="task-filters">
        <Form.Item name="status" label="Status">
          <Select
            allowClear
            options={filterOptions(inboxStatuses)}
            placeholder="Any status"
          />
        </Form.Item>
        <Form.Item name="type" label="Task type">
          <Select
            allowClear
            options={filterOptions(taskTypes)}
            placeholder="Any type"
          />
        </Form.Item>
        <Form.Item name="reason" label="Reason">
          <Select
            allowClear
            options={filterOptions(taskReasons)}
            placeholder="Any reason"
          />
        </Form.Item>
        <Form.Item name="source_id" label="Source ID" rules={[idRule]}>
          <Input inputMode="numeric" allowClear placeholder="Source ID" />
        </Form.Item>
        <Form.Item name="task_id" label="Task ID" rules={[idRule]}>
          <Input inputMode="numeric" allowClear placeholder="Task ID" />
        </Form.Item>
        <div className="task-filter-actions">
          <Button type="primary" htmlType="submit">
            Apply filters
          </Button>
          <Button
            type="text"
            onClick={() => {
              form?.resetFields()
              setFilters([], 'replace')
              setCurrentPage(1)
            }}
          >
            Reset
          </Button>
        </div>
      </Form>
      {tableQuery.isError ? (
        <RequestFailure
          message="Could not load the Inbox"
          error={tableQuery.error}
          retry={refresh}
        />
      ) : (
        <div className="task-table">
          <Table<InboxTask>
            {...tableProps}
            columns={columns}
            rowKey="id"
            size="small"
            tableLayout="fixed"
            rowClassName="task-clickable-row"
            onRow={(task) => ({
              onClick: (event) => {
                if (
                  !(event.target instanceof Element) ||
                  !event.target.closest('a, button')
                )
                  void navigate(`/tasks/${task.id}`, { state: fromInbox })
              },
            })}
            pagination={{
              ...tableProps.pagination,
              pageSizeOptions: [20, 50, 100],
              showSizeChanger: true,
              showTotal: (amount, [first, last]) =>
                `${first}–${last} of ${amount}`,
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    filters.length
                      ? 'No tasks match the filters'
                      : 'No actionable tasks'
                  }
                />
              ),
            }}
          />
        </div>
      )}
    </div>
  )
}
