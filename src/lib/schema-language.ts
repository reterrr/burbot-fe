import type * as Monaco from 'monaco-editor'
import { formatSchemaSource, getSchemaOutline } from './schema.ts'
import { FIELD_OPTIONS, FIELD_TYPES, type FieldOption } from './sema.ts'

export const SCHEMA_LANGUAGE_ID = 'burbot'
const OPTION_HELP: Record<FieldOption, string> = {
  persistent_key:
    'Stable field identity. Keep it unchanged when renaming the field.',
  nullable: 'Accept null. Defaults to True. Primary keys require False.',
  unique: 'Require unique values. Defaults to False.',
  index: 'Index this field. Defaults to False.',
  primary_key:
    'Primary key. Only one per entity; the field name id is reserved.',
  default:
    'Literal or enum member default. An explicit None differs from no default.',
  min_length: 'String only. Minimum length.',
  max_length: 'String only. Maximum length.',
  pattern: 'String only. Python regular expression.',
  gt: 'Exclusive lower numeric bound.',
  ge: 'Inclusive lower numeric bound.',
  lt: 'Exclusive upper numeric bound.',
  le: 'Inclusive upper numeric bound.',
  precision: 'Decimal only. Total digits.',
  scale: 'Decimal only. Fractional digits.',
}
const OPTION_VALUE: Record<FieldOption, string> = {
  persistent_key: '"${1:stable_field_key}"',
  nullable: '${1|True,False|}',
  unique: '${1|True,False|}',
  index: '${1|True,False|}',
  primary_key: '${1|True,False|}',
  default: '${1:None}',
  min_length: '${1:0}',
  max_length: '${1:100}',
  pattern: 'r"${1:.*}"',
  gt: '${1:0}',
  ge: '${1:0}',
  lt: '${1:100}',
  le: '${1:100}',
  precision: '${1:12}',
  scale: '${1:2}',
}

export function getFieldCompletionContext(
  source: string,
): { type: string; used: Set<string>; arguments: string } | null {
  const masked = source.replace(
    /#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    (text) => text.replace(/[^\n]/g, ' '),
  )
  const openings: number[] = []
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '(') openings.push(i)
    if (masked[i] === ')') openings.pop()
  }
  for (const start of openings.reverse()) {
    const declaration = masked.slice(0, start).match(/\b\w+\s*[:=]\s*(\w+)\s*$/)
    if (!declaration) continue
    const args = masked.slice(start + 1)
    return {
      type: declaration[1],
      used: new Set([...args.matchAll(/\b(\w+)\s*=/g)].map((item) => item[1])),
      arguments: source.slice(start + 1),
    }
  }
  return null
}

export function suggestedFieldOptions(
  type: string,
  used: Set<string>,
): FieldOption[] {
  return FIELD_OPTIONS.filter((option) => {
    if (used.has(option)) return false
    if (
      ['min_length', 'max_length', 'pattern'].includes(option) &&
      type !== 'String'
    )
      return false
    if (
      ['gt', 'ge', 'lt', 'le'].includes(option) &&
      !['Integer', 'BigInteger', 'Float', 'Decimal'].includes(type)
    )
      return false
    if (['precision', 'scale'].includes(option) && type !== 'Decimal')
      return false
    const conflict: Partial<Record<FieldOption, FieldOption>> = {
      gt: 'ge',
      ge: 'gt',
      lt: 'le',
      le: 'lt',
    }
    return !conflict[option] || !used.has(conflict[option])
  })
}

const registered = new WeakSet<object>()
export function registerSchemaLanguage(
  monaco: typeof Monaco,
  configuration: Monaco.languages.LanguageConfiguration,
  grammar: Monaco.languages.IMonarchLanguage,
) {
  if (registered.has(monaco)) return
  registered.add(monaco)
  monaco.languages.register({
    id: SCHEMA_LANGUAGE_ID,
    aliases: ['Burbot'],
    extensions: ['.burbot'],
  })
  monaco.languages.setLanguageConfiguration(SCHEMA_LANGUAGE_ID, configuration)
  monaco.languages.setMonarchTokensProvider(SCHEMA_LANGUAGE_ID, grammar)
  monaco.languages.registerCompletionItemProvider(SCHEMA_LANGUAGE_ID, {
    triggerCharacters: [':', '=', '(', ',', '.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      )
      const prefix = model.getValue().slice(0, model.getOffsetAt(position))
      const context = getFieldCompletionContext(prefix)
      const declarations = getSchemaOutline(model.getValue())
      const suggestions: Monaco.languages.CompletionItem[] = []
      const add = (label: string, insertText: string, detail: string) =>
        suggestions.push({
          label,
          insertText,
          detail,
          documentation: detail,
          kind: monaco.languages.CompletionItemKind.Snippet,
          range,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        })
      if (context) {
        for (const option of suggestedFieldOptions(context.type, context.used))
          add(option, `${option}=${OPTION_VALUE[option]}`, OPTION_HELP[option])
        if (context.type === 'Reference')
          for (const entity of declarations.filter(
            (item) => item.kind === 'entity',
          ))
            add(entity.name, entity.name, `Reference target ${entity.name}`)
        for (const value of ['True', 'False', 'None'])
          add(value, value, 'Python literal')
      } else {
        for (const type of FIELD_TYPES)
          add(
            type,
            type === 'Reference'
              ? 'Reference(${1:Project}, persistent_key="${2:project}")'
              : `${type}($0)`,
            `Burbot ${type} field`,
          )
        for (const declaration of declarations)
          add(
            declaration.name,
            `${declaration.name}($0)`,
            `${declaration.kind} ${declaration.name}`,
          )
        add('Entity', 'Entity', 'Base class for business entities.')
        add('Enum', 'Enum', 'Base class for named string or integer choices.')
        add(
          'class',
          'class ${1:NewEntity}(Entity):\n    ${2:name}: String(persistent_key="${3:name}", nullable=False)\n',
          'Create an entity. The backend resolves its durable table identity.',
        )
        add(
          'enum',
          'class ${1:Status}(Enum):\n    ${2:OPEN} = "${3:open}"\n',
          'Create an enum.',
        )
      }
      return { suggestions }
    },
  })
  monaco.languages.registerHoverProvider(SCHEMA_LANGUAGE_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position)?.word
      if (!word) return null
      const description =
        OPTION_HELP[word as FieldOption] ??
        (word === 'Entity'
          ? 'Business entity declaration. Table names are resolved by the backend; preserve an explicit `tablename` when renaming an entity.'
          : word === 'Enum'
            ? 'Named string or integer choices. Use `Status.OPEN` for an enum value.'
            : FIELD_TYPES.includes(word as (typeof FIELD_TYPES)[number])
              ? `Burbot **${word}** field. Configure constraints inside ${word}(...).`
              : undefined)
      return description ? { contents: [{ value: description }] } : null
    },
  })
  monaco.languages.registerSignatureHelpProvider(SCHEMA_LANGUAGE_ID, {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp(model, position) {
      const context = getFieldCompletionContext(
        model.getValue().slice(0, model.getOffsetAt(position)),
      )
      if (!context) return null
      const options = FIELD_OPTIONS.filter(
        (option) =>
          context.used.has(option) ||
          suggestedFieldOptions(context.type, new Set()).includes(option),
      )
      const current = context.arguments.match(/\b(\w+)\s*=[^,]*$/)?.[1]
      return {
        value: {
          signatures: [
            {
              label: `${context.type}(${options.map((option) => `${option}=…`).join(', ')})`,
              parameters: options.map((option) => ({
                label: option,
                documentation: OPTION_HELP[option],
              })),
            },
          ],
          activeSignature: 0,
          activeParameter: Math.max(0, options.indexOf(current as FieldOption)),
        },
        dispose() {},
      }
    },
  })
  monaco.languages.registerDocumentFormattingEditProvider(SCHEMA_LANGUAGE_ID, {
    provideDocumentFormattingEdits(model) {
      try {
        return [
          {
            range: model.getFullModelRange(),
            text: formatSchemaSource(model.getValue()),
          },
        ]
      } catch {
        return []
      }
    },
  })
  monaco.languages.registerDefinitionProvider(SCHEMA_LANGUAGE_ID, {
    provideDefinition(model, position) {
      const declaration = getSchemaOutline(model.getValue()).find(
        (item) => item.name === model.getWordAtPosition(position)?.word,
      )
      if (!declaration) return null
      return {
        uri: model.uri,
        range: new monaco.Range(
          declaration.location.line,
          1,
          declaration.location.line,
          model.getLineMaxColumn(declaration.location.line),
        ),
      }
    },
  })
}
