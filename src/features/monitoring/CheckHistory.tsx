import { useQuery } from '@tanstack/react-query'
import { Button, Drawer, Empty, List, Space } from 'antd'
import { useState } from 'react'
import {
  RequestFailure,
  TaskLoading,
  Timestamp,
} from '../tasks/components/TaskPresentation'
import { monitoringApi, monitoringQueryKey } from './api'
import { SnapshotLink } from './SnapshotLink'
import { CheckTag } from './StatusTags'

const pageSize = 20

export default function CheckHistory({
  sourceId,
  onSelect,
  onClose,
}: {
  sourceId: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [page, setPage] = useState(0)
  const history = useQuery({
    queryKey: [...monitoringQueryKey, 'history', sourceId, page],
    queryFn: ({ signal }) =>
      monitoringApi.history(sourceId, page * pageSize, pageSize + 1, signal),
  })
  return (
    <Drawer
      title="Monitoring history"
      width="min(100vw, 640px)"
      open
      onClose={onClose}
    >
      {history.isPending ? (
        <TaskLoading />
      ) : history.isError ? (
        <RequestFailure
          message="Could not load monitoring history"
          error={history.error}
          retry={() => void history.refetch()}
        />
      ) : history.data.length === 0 ? (
        <Empty description="No settled monitoring checks" />
      ) : (
        <List
          dataSource={history.data.slice(0, pageSize)}
          renderItem={(check) => (
            <List.Item
              actions={[
                check.snapshotId != null && (
                  <SnapshotLink
                    key="snapshot"
                    sourceId={sourceId}
                    snapshotId={check.snapshotId}
                    checkId={check.id}
                    archive={check.archive}
                    small
                  />
                ),
                <Button
                  key="review"
                  size="small"
                  onClick={() => onSelect(check.id)}
                >
                  Review check
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={<Timestamp value={check.checkedAt} />}
                description={
                  <Space wrap>
                    <CheckTag check={check} />
                    <span>
                      {check.snapshotId
                        ? `Snapshot #${check.snapshotId}`
                        : 'No snapshot'}
                    </span>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
      <Space>
        <Button
          disabled={page === 0 || history.isPending}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          disabled={(history.data?.length ?? 0) <= pageSize}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </Space>
    </Drawer>
  )
}
