import type { Task } from './api/contracts'

export function label(value: string): string {
  const words = value.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function titleOf(task: Task): string {
  return task.title?.trim() || label(task.type)
}

export function hasReview(task: Task): boolean {
  return (
    Boolean(task.metadata_json?.monitoringKey) ||
    task.type === 'review_source_change' ||
    task.type === 'resolve_observation'
  )
}
