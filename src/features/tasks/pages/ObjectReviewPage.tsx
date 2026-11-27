import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  Collapse,
  Drawer,
  Empty,
  Pagination,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import FieldInspector from '../../monitoring/FieldInspector'
import { SnapshotLink } from '../../monitoring/SnapshotLink'
import { FieldTag } from '../../monitoring/StatusTags'
import {
  monitoringApi,
  monitoringQueryKey,
  type ObjectFinding,
  type ObjectReviewTask,
} from '../../monitoring/api'
import { businessFieldTitle, sourceTitle } from '../../monitoring/presentation'
import { positiveId } from '../api/task-client'
import { TaskActions } from '../components/TaskActions'
import {
  RecordId,
  RequestFailure,
  StatusTag,
  TaskHeader,
  TaskLoading,
  Timestamp,
} from '../components/TaskPresentation'
import { readPage } from '../presentation'

const pageSize = 10
const historySize = 5

type CaptureField = Pick<ObjectFinding, 'selectorUuid' | 'checkId'> & {
  sourceId: number
}
type InspectFinding = (field: ObjectFinding) => void

function FindingTable({
  fields,
  inspect,
}: {
  fields: ObjectFinding[]
  inspect: InspectFinding
}) {
  const columns: TableColumnsType<ObjectFinding> = [
    {
      title: 'Business field',
      render: (_, field) => (
        <Button
          type="link"
          className="task-object-field"
          onClick={() => inspect(field)}
        >
          {businessFieldTitle(field.businessField)}
        </Button>
      ),
    },
    {
      title: 'Status',
      width: 145,
      render: (_, field) => <FieldTag status={field.status} />,
    },
    {
      title: 'Recorded at',
      width: 170,
      responsive: ['sm'],
      render: (_, field) => <Timestamp value={field.checkedAt} />,
    },
  ]

  return (
    <Table<ObjectFinding>
      size="small"
      columns={columns}
      dataSource={fields}
      rowKey={(field) => `${field.checkId}:${field.selectorUuid}`}
      pagination={false}
      locale={{ emptyText: 'No recorded field details' }}
    />
  )
}

function FindingHistory({
  task,
  inspect,
}: {
  task: ObjectReviewTask
  inspect: InspectFinding
}) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: [...monitoringQueryKey, 'object-findings', task.id, page],
    queryFn: ({ signal }) =>
      monitoringApi.findings(
        task.id,
        (page - 1) * historySize,
        historySize,
        signal,
      ),
  })
  if (query.isPending) return <TaskLoading message="Loading finding history…" />
  if (query.isError)
    return (
      <RequestFailure
        message="Could not load finding history"
        error={query.error}
        retry={() => void query.refetch()}
      />
    )

  return (
    <div className="task-stack">
      {query.data.items.map((capture) => (
        <section className="task-stack" key={capture.checkId}>
          <Space wrap>
            <Typography.Text strong>
              <Timestamp value={capture.checkedAt} />
            </Typography.Text>
            <Link
              to={`/monitoring/sources/${task.source.id}?check=${capture.checkId}`}
            >
              Source review
            </Link>
            {capture.snapshotId !== null && (
              <SnapshotLink
                sourceId={task.source.id}
                snapshotId={capture.snapshotId}
                checkId={capture.checkId}
                small
              />
            )}
          </Space>
          <FindingTable fields={capture.fields} inspect={inspect} />
        </section>
      ))}
      {!query.data.items.length && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No recorded findings"
        />
      )}
      {query.data.total > historySize && (
        <Pagination
          size="small"
          current={page}
          total={query.data.total}
          pageSize={historySize}
          onChange={setPage}
          showSizeChanger={false}
        />
      )}
    </div>
  )
}

function SourceTask({
  task,
  inspect,
}: {
  task: ObjectReviewTask
  inspect: InspectFinding
}) {
  const { pathname, search, state } = useLocation()
  return (
    <Card size="small">
      <div className="task-stack">
        <div className="monitoring-source-row">
          <div className="monitoring-source-heading">
            <h3>{sourceTitle(task.source)}</h3>
            <Space wrap>
              <StatusTag status={task.status} />
              {task.workflowStatus === 'superseded' && (
                <Tag>Superseded workflow</Tag>
              )}
              <Link
                to={`/tasks/${task.id}`}
                state={{ objectReviewBack: { to: pathname + search, state } }}
              >
                Task #{task.id}
              </Link>
              <Link to={`/monitoring/sources/${task.source.id}`}>
                Source review
              </Link>
            </Space>
          </div>
          <TaskActions
            task={{
              id: task.id,
              status: task.status,
              allowed_statuses: task.allowedStatuses,
            }}
            review
          />
        </div>
        <FindingTable fields={task.fields} inspect={inspect} />
        <Collapse
          size="small"
          items={[
            {
              key: 'history',
              label: 'Finding history',
              children: <FindingHistory task={task} inspect={inspect} />,
            },
          ]}
        />
      </div>
    </Card>
  )
}

function RecordedField({
  target,
  objectId,
  close,
}: {
  target: CaptureField
  objectId: number
  close: () => void
}) {
  const query = useQuery({
    queryKey: [
      ...monitoringQueryKey,
      'source',
      String(target.sourceId),
      target.checkId,
      1,
    ],
    queryFn: ({ signal }) =>
      monitoringApi.source(String(target.sourceId), target.checkId, 0, signal),
  })
  const field = query.data?.fields.find(
    (field) =>
      field.selectorUuid === target.selectorUuid &&
      field.businessObject?.id === objectId,
  )
  if (query.data && field) {
    return <FieldInspector field={field} review={query.data} onClose={close} />
  }
  return (
    <Drawer title="Field inspector" open onClose={close}>
      {query.isPending ? (
        <TaskLoading message="Loading recorded field…" />
      ) : (
        <RequestFailure
          message="Could not load the recorded field"
          error={query.error}
          retry={query.isError ? () => void query.refetch() : undefined}
        />
      )}
    </Drawer>
  )
}

export default function ObjectReviewPage() {
  const id = positiveId(useParams().objectId)
  const [params, setParams] = useSearchParams()
  const { state } = useLocation()
  const [selectedField, setSelectedField] = useState<CaptureField | null>(null)
  const focusedTask = positiveId(params.get('task'))
  const page = focusedTask ? 1 : readPage(params.get('page'), pageSize)
  const query = useQuery({
    queryKey: [...monitoringQueryKey, 'object', id, page, focusedTask],
    queryFn: ({ signal }) =>
      monitoringApi.object(
        id!,
        (page - 1) * pageSize,
        pageSize,
        focusedTask,
        signal,
      ),
    enabled: Boolean(id),
  })
  const back = {
    to: `/tasks${typeof state?.inboxSearch === 'string' ? state.inboxSearch : ''}`,
    label: 'Tasks by business object',
  }
  if (id && query.isPending)
    return <TaskLoading message="Loading object review…" />
  if (query.isError || !query.data)
    return (
      <div className="task-page">
        <TaskHeader title="Object review" back={back} />
        <RequestFailure
          message={
            id
              ? 'Could not load the object review'
              : 'Invalid business object ID'
          }
          error={query.error}
          retry={id ? () => void query.refetch() : undefined}
        />
      </div>
    )

  const { object, tasks } = query.data
  return (
    <div className="task-page">
      <TaskHeader
        title={object.name ?? `BusinessObject #${object.id}`}
        back={back}
        subtitle={
          <>
            {object.code && <span className="task-mono">{object.code}</span>}
            <span>{object.entityName ?? `Entity #${object.entityId}`}</span>
            {object.name && <RecordId id={object.id} prefix="BusinessObject" />}
          </>
        }
        actions={
          focusedTask && (
            <Link to={`/tasks/objects/${id}`} state={state}>
              All reviews for this object
            </Link>
          )
        }
      />
      <div className="task-stack">
        <Typography.Title level={2} className="task-object-section-title">
          Monitoring issues
        </Typography.Title>
        {tasks.items.length > 0 && (
          <Typography.Text type="secondary">
            Field statuses reflect their recorded checks. Completing a review
            records the task status only. Evidence acceptance and canonical
            value updates are separate actions.
          </Typography.Text>
        )}
        {tasks.items.map((task) => (
          <SourceTask
            task={task}
            key={task.id}
            inspect={({ checkId, selectorUuid }) =>
              setSelectedField({
                sourceId: task.source.id,
                checkId,
                selectorUuid,
              })
            }
          />
        ))}
        {tasks.items.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No reviews found"
          />
        )}
        {tasks.total > pageSize && (
          <Pagination
            current={page}
            total={tasks.total}
            pageSize={pageSize}
            showSizeChanger={false}
            onChange={(next) =>
              setParams(next === 1 ? {} : { page: String(next) })
            }
          />
        )}
      </div>
      {selectedField && (
        <RecordedField
          target={selectedField}
          objectId={object.id}
          close={() => setSelectedField(null)}
        />
      )}
    </div>
  )
}
