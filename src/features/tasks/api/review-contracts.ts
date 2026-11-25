export type SelectorEvaluationStatus =
  'success' | 'not_found' | 'ambiguous' | 'conflict' | 'error' | 'unsupported'

interface TextQuote {
  exact: string
  prefix?: string
  suffix?: string
}

type ExtractionSpec =
  | { type: 'text' }
  | { type: 'attribute'; name: string }
  | { type: 'selection'; quote: TextQuote }

export type SelectorLocator = { uuid: string; order: number } & (
  | { kind: 'css_path'; selector: string }
  | { kind: 'xpath'; expression: string }
  | { kind: 'element_id'; elementId: string }
  | { kind: 'text_quote'; quote: TextQuote }
  | {
      kind:
        | 'dom_path'
        | 'dom_range'
        | 'exact_pos'
        | 'text_position'
        | 'text_fragment'
      payload: Record<string, unknown>
    }
)

export interface SelectorPart {
  uuid: string
  order: number
  extraction: ExtractionSpec
  joinWith?: string
  locators: SelectorLocator[]
}

export interface SelectorRecipe {
  uuid: string
  order: number
  parts: SelectorPart[]
}

export interface ReviewSelector {
  identity: {
    uuid: string
    target: { objectId: string; field: string }
    pageUrl?: string
    activeVersionUuid?: string | null
    createdAt: string
  }
  versionId: number
  version: {
    uuid: string
    selectorUuid: string
    versionNo: number
    status: 'active' | 'superseded' | 'draft' | 'rejected'
    createdAt: string
    recipes: SelectorRecipe[]
  }
}

export interface RecordedResult {
  status: SelectorEvaluationStatus
  diagnostic?: string
  rawValue?: string
}

export interface LocatorResult extends RecordedResult {
  locatorUuid: string
  matchCount: number
}

export interface PartResult extends RecordedResult {
  partUuid: string
  locatorResults: LocatorResult[]
}

export interface RecipeResult extends RecordedResult {
  recipeUuid: string
  partResults: PartResult[]
}

export interface EvaluationResult extends RecordedResult {
  selectorVersionUuid: string
  recipeResults: RecipeResult[]
}

export interface ReviewEvaluation {
  uuid: string
  evaluatedAt: string
  pageUrl: string
  sourceSnapshotId: number
  extractionRunId: number
  provenance: 'browser_agent_reported' | 'backend_verified' | 'client_reported'
  result: EvaluationResult
}

export interface ReviewSource {
  id: number
  url: string | null
  name?: string | null
}

export interface ReviewSnapshot {
  id: number
  source_id: number
  fetched_at: string
  page_url: string | null
  mime_type: string | null
  representation: string | null
  representation_version: string | null
  structure_hash_version: string | null
  hash_algorithm: string | null
  content_hash: string | null
  structure_hash: string | null
}
