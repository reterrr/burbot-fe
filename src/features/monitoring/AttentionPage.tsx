import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Pagination,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  RequestFailure,
  TaskHeader,
  TaskLoading,
  Timestamp,
} from '../tasks/components/TaskPresentation'
import type { AttentionSource, Issue, Sort } from './api'
import {
  attentionReasons,
  issueLabels,
  monitoringApi,
  monitoringQueryKey,
} from './api'
import { sourceDomain, sourceTitle } from './presentation'
import { CheckTag } from './StatusTags'

const pageSize = 20
const counters = {
  changed: 'Changed',
  missing: 'Missing',
  extractionFailed: 'Extraction failed',
  ambiguous: 'Ambiguous',
  conflict: 'Conflicting',
  initial: 'Initial evidence',
  unchanged: 'Unchanged',
} as const

const priorities = {
  high: { text: 'High attention', color: 'red' },
  normal: { text: 'Normal attention', color: 'gold' },
  informational: { text: 'Informational', color: 'blue' },
}

type Filters = { search: string; issue?: Issue; sort: Sort }

function SourceItem({ source }: { source: AttentionSource }) {
  const priority = priorities[source.severity]
  const domain = sourceDomain(source)
  return (
    <Card size="small" className="monitoring-source-item">
      <div className="monitoring-source-row">
        <div className="monitoring-source-heading">
          <Typography.Title level={3}>{sourceTitle(source)}</Typography.Title>
          <div className="monitoring-context">
            <span>Source #{source.id}</span>
            {domain && source.name && <span>{domain}</span>}
            <CheckTag check={source.lastCheck} />
            {source.lastCheck && (
              <span>
                Last checked <Timestamp value={source.lastCheck.checkedAt} />
              </span>
            )}
          </div>
          {source.url && (
            <Typography.Text type="secondary" className="monitoring-url">
              {source.url}
            </Typography.Text>
          )}
        </div>
        <Link
          className="monitoring-open"
          to={`/monitoring/sources/${source.id}`}
        >
          Open source review <ArrowUpRight size={15} aria-hidden />
        </Link>
      </div>
      <div className="monitoring-source-counts">
        <Space wrap size={[10, 6]}>
          {source.reason && <Tag color={priority.color}>{priority.text}</Tag>}
          <Typography.Text strong>
            {source.counts.problems}{' '}
            {source.counts.problems === 1 ? 'problem field' : 'problem fields'}
          </Typography.Text>
          <Typography.Text>
            {source.openTaskCount} open{' '}
            {source.openTaskCount === 1 ? 'task' : 'tasks'}
          </Typography.Text>
          {source.reason && (
            <Typography.Text type="secondary">
              {attentionReasons[source.reason]}
            </Typography.Text>
          )}
        </Space>
        <dl className="monitoring-counters">
          {Object.entries(counters).map(([key, title]) => (
            <div
              className={
                source.counts[key as keyof typeof counters] ? 'has-count' : ''
              }
              key={key}
            >
              <dt>{title}</dt>
              <dd>{source.counts[key as keyof typeof counters]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  )
}

export default function AttentionPage({
  includeAll = false,
}: {
  includeAll?: boolean
}) {
  const [params, setParams] = useSearchParams()
  const [form] = Form.useForm<Filters>()
  const search = params.get('search') ?? ''
  const issue = (Object.keys(issueLabels) as Issue[]).find(
    (value) => value === params.get('issue'),
  )
  const sort =
    params.get('sort') === 'last_checked' ? 'last_checked' : 'priority'
  const rawPage = Number(params.get('page') ?? 1)
  const page =
    Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 100_000_000
      ? rawPage
      : 1
  const filters = {
    search,
    issue: issue ?? '',
    sort,
    includeAll,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  } as const
  const query = useQuery({
    queryKey: [...monitoringQueryKey, 'attention', filters],
    queryFn: ({ signal }) => monitoringApi.attention(filters, signal),
  })
  useEffect(() => {
    form.setFieldsValue({ search, issue, sort })
  }, [form, search, issue, sort])
  const total = query.data?.total
  useEffect(() => {
    if (total == null || page <= Math.max(1, Math.ceil(total / pageSize)))
      return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('page', String(Math.max(1, Math.ceil(total / pageSize))))
        return next
      },
      { replace: true },
    )
  }, [total, page, setParams])

  function searchSources(values: Filters) {
    const next = new URLSearchParams()
    if (values.search?.trim()) next.set('search', values.search.trim())
    if (values.issue) next.set('issue', values.issue)
    if (values.sort === 'last_checked') next.set('sort', values.sort)
    setParams(next)
  }

  return (
    <div className="task-page">
      <TaskHeader
        title={includeAll ? 'Monitored sources' : 'Sources requiring attention'}
        subtitle={
          total == null ? undefined : (
            <span>
              {total} {total === 1 ? 'source' : 'sources'}
            </span>
          )
        }
        actions={
          <Button
            icon={<RefreshCw size={16} />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh
          </Button>
        }
      />
      <Form
        form={form}
        layout="vertical"
        className="task-filters"
        onFinish={searchSources}
      >
        <Form.Item name="search" label="Search sources">
          <Input placeholder="Source ID or URL" maxLength={2048} allowClear />
        </Form.Item>
        <Form.Item name="issue" label="Problem type">
          <Select
            allowClear
            virtual={false}
            placeholder="All outcomes"
            options={Object.entries(issueLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </Form.Item>
        <Form.Item name="sort" label="Sort by">
          <Select
            virtual={false}
            options={[
              { value: 'priority', label: 'Priority' },
              { value: 'last_checked', label: 'Last checked' },
            ]}
          />
        </Form.Item>
        <Button
          className="task-filter-actions"
          type="primary"
          htmlType="submit"
        >
          Apply
        </Button>
      </Form>
      {query.isPending ? (
        <TaskLoading />
      ) : query.isError ? (
        <RequestFailure
          message="Could not load monitoring sources"
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <Empty
          description={
            search || issue
              ? 'No sources match these filters'
              : includeAll
                ? 'No monitored sources'
                : 'No sources requiring attention'
          }
        />
      ) : (
        <div className="task-stack">
          {query.data.items.map((source) => (
            <SourceItem key={source.id} source={source} />
          ))}
          <Pagination
            current={page}
            pageSize={pageSize}
            total={query.data.total}
            showSizeChanger={false}
            onChange={(number) => {
              const next = new URLSearchParams(params)
              next.set('page', String(number))
              setParams(next)
            }}
          />
        </div>
      )}
    </div>
  )
}
