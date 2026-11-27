import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  List,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { ExternalLink, History, RefreshCw } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { positiveId } from '../tasks/api/task-client'
import { websiteUrl } from '../../lib/website-url'
import {
  RecordId,
  RequestFailure,
  StatusTag,
  TaskHeader,
  TaskLoading,
  Timestamp,
} from '../tasks/components/TaskPresentation'
import { label } from '../tasks/presentation'
import type { Check, SourceReview, TrackedField } from './api'
import { monitoringApi, monitoringQueryKey } from './api'
import { CanonicalValue } from './CanonicalValue'
import CheckHistory from './CheckHistory'
import { businessFieldTitle, sourceTitle } from './presentation'
import { SnapshotLink } from './SnapshotLink'
import { CheckTag, FieldTag } from './StatusTags'

const FieldInspector = lazy(() => import('./FieldInspector'))
const back = { to: '/monitoring/attention', label: 'Attention' }

function documentChange(
  status: Check['changeStatus'],
  portion: 'CONTENT' | 'STRUCTURE',
) {
  if (!status) return 'Unavailable'
  if (status === 'INITIAL_FETCH') return 'Initial fetch'
  return status.includes(portion) ? 'Changed' : 'Unchanged'
}

function ShortValue({ value, empty }: { value: unknown; empty: string }) {
  if (value == null)
    return <Typography.Text type="secondary">{empty}</Typography.Text>
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return <span className="monitoring-value">{text || 'Empty text'}</span>
}

function TrackedFields({
  review,
  inspect,
}: {
  review: SourceReview
  inspect: (id: string) => void
}) {
  const columns: TableColumnsType<TrackedField> = [
    {
      title: 'Business field',
      width: '29%',
      render: (_, field) => (
        <div>
          <Button
            type="link"
            className="monitoring-field-link"
            onClick={() => inspect(field.selectorUuid)}
          >
            {businessFieldTitle(field.businessField)}
          </Button>
          {field.businessField.name && (
            <div className="monitoring-context">
              <RecordId
                id={field.businessField.id}
                prefix="Field"
                copy={false}
              />
            </div>
          )}
          {field.businessObject && (
            <div className="monitoring-context">
              {field.businessObject.name ??
                `Business object #${field.businessObject.id}`}
            </div>
          )}
        </div>
      ),
    },
    {
      title: review.fields.some(
        (field) => field.canonicalValueScope === 'current',
      )
        ? 'Current canonical'
        : 'Canonical',
      width: '23%',
      render: (_, field) => <CanonicalValue context={field} compact />,
    },
    {
      title: 'Observed',
      width: '23%',
      render: (_, field) => (
        <ShortValue
          value={field.currentEvidence}
          empty={field.status ? 'No value extracted' : '—'}
        />
      ),
    },
    {
      title: 'Status',
      render: (_, field) => (
        <Space wrap size={[4, 5]}>
          <FieldTag status={field.status} />
          {field.task?.workflowStatus === 'superseded' ? (
            <Tag>Superseded workflow</Tag>
          ) : (
            field.task?.requiresReview && (
              <Tag color="gold">
                {field.task.originCheckId === review.selectedCheck?.id
                  ? 'Review required'
                  : 'Earlier task open'}
              </Tag>
            )
          )}
          {!field.configured && <Tag>Selector from this capture</Tag>}
        </Space>
      ),
    },
  ]
  return (
    <Card title="Tracked business fields" size="small">
      {review.fields.length === 0 ? (
        <Empty description="No tracked fields" />
      ) : (
        <Table
          dataSource={review.fields}
          rowKey="selectorUuid"
          columns={columns}
          size="small"
          tableLayout="fixed"
          scroll={{ x: 680 }}
          pagination={
            review.fields.length > 15
              ? { pageSize: 15, showSizeChanger: false }
              : false
          }
          rowClassName="task-clickable-row"
          onRow={(field) => ({
            onClick: () => inspect(field.selectorUuid),
          })}
        />
      )}
    </Card>
  )
}

export default function SourceReviewPage() {
  const { sourceId } = useParams()
  const id = positiveId(sourceId)
  const [params, setParams] = useSearchParams()
  const checkId = params.get('check')
  const [earlierPage, setEarlierPage] = useState(1)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [inspected, setInspected] = useState<string | null>(null)
  const query = useQuery({
    queryKey: [...monitoringQueryKey, 'source', id, checkId, earlierPage],
    queryFn: ({ signal }) =>
      monitoringApi.source(id!, checkId, (earlierPage - 1) * 20, signal),
    enabled: Boolean(id),
  })
  if (id && query.isPending) return <TaskLoading />
  const review = query.data
  if (!review || !id || query.isError)
    return (
      <div className="task-page">
        <TaskHeader title="Source review" back={back} />
        <RequestFailure
          message={
            id ? 'Could not load this source review' : 'Invalid source ID'
          }
          error={query.error}
          retry={id ? () => void query.refetch() : undefined}
        />
      </div>
    )
  const {
    source,
    latestCheck,
    latestCompletedCheck,
    selectedCheck,
    snapshot,
    earlierTasks,
  } = review
  const url = websiteUrl(source.url)
  const field = review.fields.find((item) => item.selectorUuid === inspected)
  const historical = selectedCheck?.id !== latestCheck?.id
  const change = selectedCheck?.changeStatus ?? null
  function selectCheck(value?: string) {
    setInspected(null)
    setHistoryOpen(false)
    setParams(value && value !== latestCheck?.id ? { check: value } : {})
  }

  return (
    <div className="task-page">
      <TaskHeader
        title={sourceTitle(source)}
        back={back}
        subtitle={
          <>
            <RecordId id={source.id} prefix="Source" />
            <Tag>{label(source.state)}</Tag>
          </>
        }
        actions={
          <Space wrap>
            {url && (
              <Button
                href={url}
                rel="noopener noreferrer"
                target="_blank"
                icon={<ExternalLink size={15} />}
              >
                Open original website
              </Button>
            )}
            {snapshot && (
              <SnapshotLink
                sourceId={snapshot.source_id}
                snapshotId={snapshot.id}
                checkId={selectedCheck?.id}
                archive={selectedCheck?.archive}
              />
            )}
            <Button
              icon={<History size={15} />}
              onClick={() => setHistoryOpen(true)}
            >
              Monitoring history
            </Button>
            <Button
              aria-label="Refresh source review"
              icon={<RefreshCw size={15} />}
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            />
          </Space>
        }
      />
      <div className="task-stack">
        <Card
          title="Source check"
          extra={<CheckTag check={selectedCheck} />}
          size="small"
        >
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, lg: 3 }}
            items={[
              {
                key: 'url',
                label: 'Source URL',
                span: 'filled',
                children: (
                  <span className="monitoring-url">{source.url ?? '—'}</span>
                ),
              },
              {
                key: 'latest',
                label: 'Last checked',
                children: <Timestamp value={latestCheck?.checkedAt} />,
              },
              {
                key: 'content',
                label: 'Content status',
                children: documentChange(change, 'CONTENT'),
              },
              {
                key: 'structure',
                label: 'Structure status',
                children: documentChange(change, 'STRUCTURE'),
              },
            ]}
          />
        </Card>
        {historical && (
          <Alert
            type="info"
            showIcon
            message={
              <>
                Historical check from{' '}
                <Timestamp value={selectedCheck?.checkedAt} />
              </>
            }
            action={
              <Button size="small" onClick={() => selectCheck()}>
                Return to latest check
              </Button>
            }
          />
        )}
        {selectedCheck?.status === 'failed' && (
          <Alert
            type="error"
            showIcon
            message="Monitoring check failed"
            description={
              <>
                {selectedCheck.errorCode && (
                  <div>{label(selectedCheck.errorCode)}</div>
                )}
                {latestCompletedCheck &&
                  latestCompletedCheck.id !== selectedCheck.id && (
                    <Button
                      type="link"
                      onClick={() => selectCheck(latestCompletedCheck.id)}
                    >
                      Review last completed check
                    </Button>
                  )}
              </>
            }
          />
        )}
        <TrackedFields review={review} inspect={setInspected} />
        <Card
          title="Open tasks from earlier checks"
          size="small"
          extra={
            <Link to={`/tasks/history?source=${source.id}`}>
              Workflow history
            </Link>
          }
        >
          <List
            dataSource={earlierTasks.items}
            locale={{ emptyText: 'No open tasks from earlier checks' }}
            pagination={
              earlierTasks.total > earlierTasks.limit
                ? {
                    current: earlierPage,
                    pageSize: earlierTasks.limit,
                    total: earlierTasks.total,
                    onChange: setEarlierPage,
                    showSizeChanger: false,
                  }
                : false
            }
            renderItem={(task) => (
              <List.Item
                actions={[
                  <Link key="open" to={`/tasks/${task.id}`}>
                    Open task #{task.id}
                  </Link>,
                ]}
              >
                <List.Item.Meta
                  title={task.title ?? `Task #${task.id}`}
                  description={
                    <Space wrap>
                      <Timestamp value={task.checkedAt} />
                      {task.snapshotId && (
                        <span>Snapshot #{task.snapshotId}</span>
                      )}
                      <StatusTag status={task.status} />
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      </div>
      {historyOpen && (
        <CheckHistory
          sourceId={id}
          onSelect={selectCheck}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {field && (
        <Suspense fallback={<TaskLoading />}>
          <FieldInspector
            key={`${selectedCheck?.id ?? ''}:${field.selectorUuid}`}
            field={field}
            review={review}
            onClose={() => setInspected(null)}
          />
        </Suspense>
      )}
    </div>
  )
}
