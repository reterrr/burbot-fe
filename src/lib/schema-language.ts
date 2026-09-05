import type * as Monaco from 'monaco-editor'
import { formatSchemaSource, generateTableName, getSchemaOutline } from './schema.ts'
import { FIELD_OPTIONS, TYPE_ALIASES, type FieldOption } from './sema.ts'

export const SCHEMA_LANGUAGE_ID = 'burbot'

const OPTION_HELP: Record<FieldOption, string> = {
  nullable: 'Whether the field accepts null. Default: True. Primary keys require False.',
  unique: 'Require unique values. Default: False.',
  index: 'Create an index for this field. Default: False.',
  primary_key: 'Mark one field as the primary key; nullable must be False. The name id is reserved.',
  default: 'Literal default value; strings, numbers, True, False, None, lists, and dictionaries are supported.',
  min_length: 'String only. Minimum length, a non-negative integer.',
  max_length: 'String only. Maximum length, a positive integer.',
  pattern: 'String only. A Python regular expression stored as a string.',
  gt: 'Numeric types only. Exclusive lower bound; cannot be combined with ge.',
  ge: 'Numeric types only. Inclusive lower bound; cannot be combined with gt.',
  lt: 'Numeric types only. Exclusive upper bound; cannot be combined with le.',
  le: 'Numeric types only. Inclusive upper bound; cannot be combined with lt.',
  precision: 'Decimal only. Total digits, a positive integer.',
  scale: 'Decimal only. Fractional digits, from zero to precision.',
  reference: 'Reference only. Exact target entity name, for example "Project". Do not append .id.',
}

const OPTION_VALUE: Record<FieldOption, string> = {
  nullable: '${1|True,False|}', unique: '${1|True,False|}', index: '${1|True,False|}',
  primary_key: '${1|True,False|}', default: '${1:None}', min_length: '${1:0}',
  max_length: '${1:100}', pattern: 'r"${1:.*}"', gt: '${1:0}', ge: '${1:0}',
  lt: '${1:100}', le: '${1:100}', precision: '${1:12}', scale: '${1:2}',
  reference: '"${1:Project}"',
}

// Ignore quoted strings/comments while locating the containing multiline Field call.
function maskLiterals(source: string): string {
  return source.replace(/#[^\n]*|("""|''')[\s\S]*?(?:\1|$)|"(?:\\.|[^"\\])*?(?:"|$)|'(?:\\.|[^'\\])*?(?:'|$)/g,
    (literal) => literal.replace(/[^\n]/g, ' '))
}

export function getFieldCompletionContext(source: string): { type: string; used: Set<string>; arguments: string } | null {
  const masked = maskLiterals(source)
  const openings: number[] = []
  for (let i = 0; i < masked.length; i += 1) {
    if (masked[i] === '(') openings.push(i)
    if (masked[i] === ')') openings.pop()
  }
  const start = openings.reverse().find((index) => /\bField\s*$/.test(masked.slice(0, index)))
  if (start === undefined) return null
  const declaration = masked.slice(0, start).match(/:[ \t]*([^=:\n]+)[ \t]*=[ \t]*Field\s*$/)
  const annotation = declaration?.[1].trim() ?? ''
  const type = Object.hasOwn(TYPE_ALIASES, annotation) ? TYPE_ALIASES[annotation]
    : annotation.startsWith('Reference[') ? 'Reference' : annotation
  const args = masked.slice(start + 1)
  return { type, used: new Set([...args.matchAll(/\b(\w+)\s*=/g)].map((match) => match[1])), arguments: source.slice(start + 1) }
}

export function suggestedFieldOptions(type: string, used: Set<string>): FieldOption[] {
  return FIELD_OPTIONS.filter((option) => {
    if (used.has(option)) return false
    if (['min_length', 'max_length', 'pattern'].includes(option) && type !== 'String') return false
    if (['gt', 'ge', 'lt', 'le'].includes(option) && !['Integer', 'BigInteger', 'Float', 'Decimal'].includes(type)) return false
    if (['precision', 'scale'].includes(option) && type !== 'Decimal') return false
    if (option === 'reference' && type !== 'Reference') return false
    const conflict: Partial<Record<FieldOption, FieldOption>> = { gt: 'ge', ge: 'gt', lt: 'le', le: 'lt' }
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
  monaco.languages.register({ id: SCHEMA_LANGUAGE_ID, aliases: ['Burbot'], extensions: ['.burbot'] })
  monaco.languages.setLanguageConfiguration(SCHEMA_LANGUAGE_ID, configuration)
  monaco.languages.setMonarchTokensProvider(SCHEMA_LANGUAGE_ID, grammar)

  monaco.languages.registerCompletionItemProvider(SCHEMA_LANGUAGE_ID, {
    triggerCharacters: [':', '=', '(', ',', '[', '"', "'"],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const prefix = model.getValue().slice(0, model.getOffsetAt(position))
      const context = getFieldCompletionContext(prefix)
      const entities = getSchemaOutline(model.getValue())
      const reference = prefix.match(/(?:\breference\s*=\s*|\bReference\[)(["']?)[\p{XID_Continue}]*$/u)
      const suggestions: Monaco.languages.CompletionItem[] = []
      const add = (label: string, insertText: string, detail: string, kind = monaco.languages.CompletionItemKind.Snippet) => {
        suggestions.push({ label, insertText, detail, documentation: detail, kind, range,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet })
      }
      if (reference) {
        const inSubscript = /Reference\[/.test(reference[0])
        for (const entity of entities) {
          add(entity.name, reference[1] || inSubscript ? entity.name : `"${entity.name}"`,
            `Reference to ${entity.name}`, monaco.languages.CompletionItemKind.Class)
        }
      } else if (context) {
        for (const option of suggestedFieldOptions(context.type, context.used)) {
          add(option, `${option}=${OPTION_VALUE[option]}`, OPTION_HELP[option], monaco.languages.CompletionItemKind.Property)
        }
        for (const literal of ['True', 'False', 'None']) {
          add(literal, literal, 'Python literal', monaco.languages.CompletionItemKind.Keyword)
        }
      } else {
        for (const [alias, type] of Object.entries(TYPE_ALIASES)) {
          add(alias, alias, `Backend type: ${type}`, monaco.languages.CompletionItemKind.TypeParameter)
        }
        for (const entity of entities) {
          add(entity.name, entity.name, `Reference to ${entity.name}`, monaco.languages.CompletionItemKind.Class)
        }
        add('Field', 'Field($0)', 'Configure field constraints with named options.')
        add('table_name', `table_name: "${generateTableName()}"`, 'Insert a new table identifier. Preserve it across entity renames.')
        add('class', `class \${1:NewEntity}:\n    table_name: "${generateTableName()}"\n    \${2:name}: str = Field(nullable=False, max_length=100)\n`, 'Create a business entity with a stable table identifier.')
      }
      return { suggestions }
    },
  })

  monaco.languages.registerHoverProvider(SCHEMA_LANGUAGE_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position)?.word
      if (!word) return null
      let description: string | undefined
      if (Object.hasOwn(OPTION_HELP, word)) description = OPTION_HELP[word as FieldOption]
      else if (Object.hasOwn(TYPE_ALIASES, word)) description = `Compiles to backend type **${TYPE_ALIASES[word]}**. Fields are nullable by default.`
      else if (word === 'Field') description = 'Configure a field using named literal options. Start typing inside Field(...) for compatible constraints.'
      else if (['table_name', 'tablename', '__tablename__'].includes(word)) description = 'Stable entity identity: `e_` followed by 52 base32 characters. Keep this value when renaming the class.'
      else if (word === 'id') description = 'Reserved field name. Burbot creates id automatically.'
      else if (getSchemaOutline(model.getValue()).some((entity) => entity.name === word)) description = `Business entity **${word}**. Use it as a reference target.`
      return description ? { contents: [{ value: description }] } : null
    },
  })

  monaco.languages.registerSignatureHelpProvider(SCHEMA_LANGUAGE_ID, {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp(model, position) {
      const context = getFieldCompletionContext(model.getValue().slice(0, model.getOffsetAt(position)))
      if (!context) return null
      const options = FIELD_OPTIONS.filter((option) => context.used.has(option) || suggestedFieldOptions(context.type, new Set()).includes(option))
      const current = context.arguments.match(/\b(\w+)\s*=[^,]*$/)?.[1]
      return {
        value: {
          signatures: [{ label: `Field(${options.map((option) => `${option}=…`).join(', ')})`,
            documentation: 'Named options with literal values; Burbot validates the resulting schema again on the backend.',
            parameters: options.map((option) => ({ label: option, documentation: OPTION_HELP[option] })),
          }],
          activeSignature: 0, activeParameter: Math.max(0, options.indexOf(current as FieldOption)),
        },
        dispose() {},
      }
    },
  })

  monaco.languages.registerDocumentFormattingEditProvider(SCHEMA_LANGUAGE_ID, {
    provideDocumentFormattingEdits(model) {
      try { return [{ range: model.getFullModelRange(), text: formatSchemaSource(model.getValue()) }] }
      catch { return [] }
    },
  })

  monaco.languages.registerDefinitionProvider(SCHEMA_LANGUAGE_ID, {
    provideDefinition(model, position) {
      const name = model.getWordAtPosition(position)?.word
      const entity = getSchemaOutline(model.getValue()).find((item) => item.name === name)
      if (!entity) return null
      return { uri: model.uri, range: new monaco.Range(entity.location.line, entity.location.column, entity.location.line, model.getLineMaxColumn(entity.location.line)) }
    },
  })
}
