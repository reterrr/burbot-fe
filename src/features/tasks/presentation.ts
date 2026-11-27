import type { Task } from './api/contracts'
import type { ExtractionErrorCode, SelectorLocator } from './api/review-contracts'

export function label(value: string): string {
  const words = value.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function titleOf(task: Task): string {
  return task.title?.trim() || label(task.type)
}

export function readPage(value: string | null, size: number) {
  const page = Number(value ?? 1)
  return Number.isInteger(page) && page >= 1 && (page - 1) * size <= 2147483647
    ? page
    : 1
}

export function hasReview(task: Task): boolean {
  return (
    Boolean(task.metadata_json?.monitoringKey) ||
    task.type === 'review_source_change' ||
    task.type === 'resolve_observation'
  )
}

export const locatorLabels: Record<SelectorLocator['kind'], string> = {
  css_path: 'CSS path',
  xpath: 'XPath',
  element_id: 'Element ID',
  text_quote: 'Text quote',
  dom_path: 'DOM path',
  dom_range: 'DOM range',
  exact_pos: 'Exact position',
  text_position: 'Text position',
  text_fragment: 'Text fragment',
}

export const extractionReasons: Record<ExtractionErrorCode, string> = {
  selection_quote_mismatch: 'The selection quote no longer matches.',
  selection_quote_ambiguous: 'The selection quote matches multiple fragments.',
  selection_context_mismatch: 'The selection context no longer matches.',
  selection_context_ambiguous: 'The selection context matches multiple fragments.',
  text_boundary_missing: 'The configured text markers no longer match.',
  text_boundary_ambiguous: 'Multiple pairs of text markers match.',
  element_required: 'This extraction method requires an element locator.',
  attribute_missing: 'The configured attribute is missing.',
  empty_value: 'The extracted value is empty.',
  value_too_large: 'The extracted value exceeds the size limit.',
  extraction_failed: 'The value could not be read from the located target.',
}

export function locatorValue(locator: SelectorLocator) {
  switch (locator.kind) {
    case 'css_path':
      return locator.selector
    case 'xpath':
      return locator.expression
    case 'element_id':
      return locator.elementId
    case 'text_quote':
      return locator.quote
    default:
      return locator.payload
  }
}
