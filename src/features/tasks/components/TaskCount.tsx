import { useInboxCount } from '../hooks/task-queries'

export default function TaskCount() {
  const { result } = useInboxCount()
  const count = result?.count
  return count ? (
    <span
      className="activity-task-count"
      title={`${count} actionable tasks`}
      data-testid="task-inbox-count"
    >
      {count > 99 ? '99+' : count}
    </span>
  ) : null
}
