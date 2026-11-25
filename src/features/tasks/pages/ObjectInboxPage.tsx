import { useQuery } from '@tanstack/react-query'
import { Button, Empty, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import {
  monitoringApi,
  monitoringQueryKey,
  type ObjectInboxItem,
} from '../../monitoring/api'
import {
  RecordId,
  RequestFailure,
  StatusTag,
  TaskHeader,
  Timestamp,
} from '../components/TaskPresentation'
import { label, readPage } from '../presentation'

const pageSize = 20
const severityColors = { high: 'red', normal: 'gold', informational: 'blue' }

const columns: TableColumnsType<ObjectInboxItem> = [
  {
    title: 'Business object',
    render: (_, row) => <ObjectName row={row} />,
  },
  { title: 'Fields to review', width: 122, dataIndex: 'fieldCount' },
  { title: 'Sources', width: 85, dataIndex: 'sourceCount' },
  {
    title: 'Severity',
    width: 125,
    responsive: ['md'],
    render: (_, row) => (
      <Tag color={severityColors[row.severity]}>{label(row.severity)}</Tag>
    ),
  },
  {
    title: 'Status',
    width: 108,
    render: (_, row) => <StatusTag status={row.status} />,
  },
  {
    title: 'Last checked',
    width: 170,
    responsive: ['lg'],
    render: (_, row) => <Timestamp value={row.lastCheckedAt} />,
  },
]

function ObjectName({ row }: { row: ObjectInboxItem }) {
  const { search } = useLocation()
  return (
    <div className="task-object-name">
      {row.object.code && <span className="task-mono">{row.object.code}</span>}
      <Link
        className="task-row-title"
        to={`/tasks/objects/${row.object.id}`}
        state={{ inboxSearch: search }}
      >
        {row.object.name ?? `BusinessObject #${row.object.id}`}
      </Link>
      <div className="task-value-meta">
        <span>{row.object.entityName ?? `Entity #${row.object.entityId}`}</span>
        {row.object.name && (
          <RecordId id={row.object.id} prefix="BusinessObject" />
        )}
      </div>
    </div>
  )
}

export default function ObjectInboxPage() {
  const [params, setParams] = useSearchParams()
  const page = readPage(params.get('page'), pageSize)
  const query = useQuery({
    queryKey: [...monitoringQueryKey, 'objects', page],
    queryFn: ({ signal }) =>
      monitoringApi.objects((page - 1) * pageSize, pageSize, signal),
    refetchInterval: 30_000,
  })
  const total = query.data?.total
  useEffect(() => {
    if (total === undefined) return
    const last = Math.max(1, Math.ceil(total / pageSize))
    if (page > last)
      setParams(last === 1 ? {} : { page: String(last) }, { replace: true })
  }, [page, setParams, total])

  return (
    <div className="task-page">
      <TaskHeader
        title="Tasks by business object"
        actions={
          <Button
            icon={<RefreshCw size={15} />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh
          </Button>
        }
      />
      {query.isError ? (
        <RequestFailure
          message="Could not load object reviews"
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : (
        <Table<ObjectInboxItem>
          className="task-table"
          size="small"
          rowKey={(row) => row.object.id}
          columns={columns}
          dataSource={query.data?.items}
          loading={query.isPending}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No business objects require review"
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total: query.data?.total,
            showSizeChanger: false,
            onChange: (next) =>
              setParams(next === 1 ? {} : { page: String(next) }),
          }}
        />
      )}
    </div>
  )
}
