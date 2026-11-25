import { Tag } from 'antd'
import type { Check, TrackedField } from './api'
import { fieldStatuses } from './api'

const changeLabels = {
  INITIAL_FETCH: 'Initial fetch',
  UNCHANGED: 'Website unchanged',
  CONTENT_CHANGED: 'Website content changed',
  STRUCTURE_CHANGED: 'Website structure changed',
  CONTENT_AND_STRUCTURE_CHANGED: 'Content and structure changed',
} as const

export function CheckTag({ check }: { check: Check | null }) {
  if (!check) return <Tag>Not checked</Tag>
  if (check.status === 'failed') return <Tag color="red">Check failed</Tag>
  if (!check.changeStatus) return <Tag>Website change status unavailable</Tag>
  return (
    <Tag
      color={
        ['UNCHANGED', 'INITIAL_FETCH'].includes(check.changeStatus)
          ? 'default'
          : 'blue'
      }
    >
      {changeLabels[check.changeStatus]}
    </Tag>
  )
}

export function FieldTag({ status }: { status: TrackedField['status'] }) {
  const outcome = status && fieldStatuses[status]
  return (
    <Tag color={outcome ? outcome.color : 'default'}>
      {outcome ? outcome.title : 'Not checked'}
    </Tag>
  )
}
