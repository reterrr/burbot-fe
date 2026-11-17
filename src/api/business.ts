import * as definitions from './generated/business-definitions/business-definitions'
import * as language from './generated/business-language/business-language'
import * as data from './generated/business-data/business-data'
import type {
  BusinessModel,
  BusinessModelCreateRequest,
  BusinessModelListResponse,
  BusinessModelRevisionListResponse,
  BusinessModelRevisionResponse,
  Schema,
  SchemaChangeResponse,
  SchemaRegisterResponse,
  Program,
  ExecutionResult,
  EntityDefinitionRead,
  BusinessObjectRead,
  BusinessObjectFieldValueRead,
  CreateObjectResponse,
  UpdateModelRequest,
  AssignFieldValuesRequest,
} from './models'
import { formatApiError } from '../lib/api-error'

export class BusinessApiError extends Error {
  readonly status: number
  readonly data: unknown
  constructor(status: number, data: unknown) {
    super(formatApiError(data, `The API returned status ${status}.`))
    this.name = 'BusinessApiError'
    this.status = status
    this.data = data
  }
}

export async function result<T>(
  request: Promise<{ status: number; data?: unknown }>,
): Promise<T> {
  const response = await request
  if (response.status < 200 || response.status >= 300)
    throw new BusinessApiError(response.status, response.data)
  return response.data as T
}

export const business = {
  async models(signal?: AbortSignal): Promise<BusinessModel[]> {
    const items: BusinessModel[] = []
    let total = Infinity
    while (items.length < total) {
      const page = await result<BusinessModelListResponse>(
        definitions.getModelsApiV1BusinessModelsGet(
          { offset: items.length, limit: 100 },
          { signal },
        ),
      )
      items.push(...page.items)
      total = page.total
      if (!page.items.length) break
    }
    return items
  },
  model: (id: number, signal?: AbortSignal) =>
    result<BusinessModel>(
      definitions.getModelApiV1BusinessModelsModelIdGet(id, { signal }),
    ),
  createModel: (body: BusinessModelCreateRequest) =>
    result<BusinessModel>(
      definitions.createBusinessModelApiV1BusinessModelsPost(body),
    ),
  updateModel: (id: number, body: UpdateModelRequest) =>
    result<BusinessModel>(
      definitions.updateModelApiV1BusinessModelsModelIdPatch(id, body),
    ),
  deleteModel: (id: number) =>
    result<void>(definitions.deleteModelApiV1BusinessModelsModelIdDelete(id)),
  schema: (id: number, signal?: AbortSignal) =>
    result<Schema>(
      definitions.getSchemaApiV1BusinessModelsModelIdSchemaGet(id, undefined, {
        signal,
      }),
    ),
  revisions: (id: number, offset = 0, signal?: AbortSignal) =>
    result<BusinessModelRevisionListResponse>(
      definitions.getModelRevisionsApiV1BusinessModelsModelIdRevisionsGet(
        id,
        { offset, limit: 20 },
        { signal },
      ),
    ),
  revision: (id: number, revision: number) =>
    result<BusinessModelRevisionResponse>(
      definitions.getModelRevisionApiV1BusinessModelsModelIdRevisionsRevisionIdGet(
        id,
        revision,
      ),
    ),
  compile: (id: number | null, code: string, signal?: AbortSignal) =>
    result<Program>(
      id === null
        ? language.compileProgramApiV1BusinessLanguageCompilePost(
            { code },
            { signal },
          )
        : language.compileModelProgramApiV1BusinessModelsModelIdCompilePost(
            id,
            { code },
            { signal },
          ),
    ),
  changes: (id: number, schema: Schema) =>
    result<SchemaChangeResponse[]>(
      definitions.previewSchemaChangesApiV1BusinessModelsModelIdChangesPost(
        id,
        { schema },
      ),
    ),
  register: (id: number, schema: Schema, reason: string) =>
    result<SchemaRegisterResponse>(
      definitions.registerBusinessSchemaApiV1BusinessModelsModelIdRevisionsPost(
        id,
        {
          schema,
          reason: reason || null,
          metadata_json: { created_from: 'burbot-studio' },
        },
      ),
    ),
  execute: (id: number, code: string, reason: string) =>
    result<ExecutionResult>(
      language.executeProgramApiV1BusinessModelsModelIdExecutePost(id, {
        code,
        reason: reason || null,
        metadata_json: { created_from: 'burbot-studio' },
      }),
    ),
  entities: (id: number, offset: number, signal?: AbortSignal) =>
    result<EntityDefinitionRead[]>(
      definitions.listEntitiesApiV1BusinessModelsModelIdEntitiesGet(
        id,
        { offset, limit: 100 },
        { signal },
      ),
    ),
  entityHistory: (id: number, offset = 0) =>
    result<unknown[]>(
      definitions.getEntityHistoryApiV1BusinessEntitiesEntityIdHistoryGet(id, {
        offset,
        limit: 100,
      }),
    ),
  fieldHistory: (id: number, offset = 0) =>
    result<unknown[]>(
      definitions.getFieldHistoryApiV1BusinessEntityFieldsFieldIdHistoryGet(
        id,
        { offset, limit: 100 },
      ),
    ),
  relations: (id: number) =>
    result<unknown[]>(
      definitions.listRelationsApiV1BusinessEntitiesEntityIdRelationsGet(id),
    ),
  relationHistory: (id: string, offset = 0) =>
    result<unknown[]>(
      definitions.getRelationHistoryApiV1BusinessRelationsRelationIdHistoryGet(
        id,
        { offset, limit: 100 },
      ),
    ),
  objects: (
    id: number,
    offset: number,
    include_archived: boolean,
    at?: string,
    known_at?: string,
    signal?: AbortSignal,
  ) =>
    result<BusinessObjectRead[]>(
      data.listObjectsApiV1BusinessEntitiesEntityIdObjectsGet(
        id,
        {
          offset,
          limit: 20,
          include_archived,
          at: at || undefined,
          known_at: known_at || undefined,
        },
        { signal },
      ),
    ),
  object: (id: number) =>
    result<BusinessObjectRead>(
      data.getObjectApiV1BusinessObjectsObjectIdGet(id),
    ),
  createObject: (id: number, values: Record<string, unknown>) =>
    result<CreateObjectResponse>(
      data.createObjectApiV1BusinessEntitiesEntityIdObjectsPost(id, { values }),
    ),
  assignValues: (id: number, body: AssignFieldValuesRequest) =>
    result<BusinessObjectRead>(
      data.assignObjectFieldValuesApiV1BusinessObjectsObjectIdValuesPatch(
        id,
        body,
      ),
    ),
  syncFields: (id: number) =>
    result<CreateObjectResponse>(
      data.syncObjectFieldsApiV1BusinessObjectsObjectIdSyncFieldsPost(id),
    ),
  archive: (id: number) =>
    result<BusinessObjectRead>(
      data.archiveObjectApiV1BusinessObjectsObjectIdArchivePost(id),
    ),
  restore: (id: number) =>
    result<BusinessObjectRead>(
      data.restoreObjectApiV1BusinessObjectsObjectIdRestorePost(id),
    ),
  deleteObject: (id: number) =>
    result<void>(data.deleteObjectApiV1BusinessObjectsObjectIdDelete(id)),
  valueHistory: (id: number, offset = 0) =>
    result<BusinessObjectFieldValueRead[]>(
      data.getObjectFieldHistoryApiV1BusinessObjectFieldsObjectFieldIdHistoryGet(
        id,
        { offset, limit: 100 },
      ),
    ),
}
