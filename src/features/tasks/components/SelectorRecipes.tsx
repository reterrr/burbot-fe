import { Collapse, Descriptions, Tag, Typography } from 'antd'
import type {
  EvaluationResult,
  LocatorResult,
  PartResult,
  RecipeResult,
  RecordedResult,
  SelectorEvaluationStatus,
  SelectorLocator,
  SelectorPart,
  SelectorRecipe,
} from '../api/review-contracts'
import { label } from '../presentation'
import { JsonValue } from './TaskPresentation'

const resultColors: Record<SelectorEvaluationStatus, string> = {
  success: 'green',
  not_found: 'orange',
  ambiguous: 'purple',
  conflict: 'red',
  error: 'red',
  unsupported: 'default',
}

const locatorLabels: Record<SelectorLocator['kind'], string> = {
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

const locatorSyntax = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[#[\]():@/=~>+|*])/g

function locatorValue(locator: SelectorLocator) {
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

function matchCountLabel({ matchCount: count, status }: LocatorResult) {
  if (count === 0)
    return status === 'not_found' ? '0 matches · No element found' : '0 matches'
  if (count === 1) return '1 match'
  return `${count} matches · Multiple candidates`
}

export function ExecutionStatus({
  status,
}: {
  status?: SelectorEvaluationStatus
}) {
  return (
    <Tag color={status && resultColors[status]}>
      {status ? label(status) : 'Not recorded'}
    </Tag>
  )
}

export function ResultDetails({ result }: { result?: RecordedResult }) {
  return (
    <>
      {result?.diagnostic && result.diagnostic !== result.status && (
        <Typography.Text className="task-evidence-text">
          {result.diagnostic}
        </Typography.Text>
      )}
      {result?.rawValue != null && (
        <div>
          <Typography.Text type="secondary">Raw value</Typography.Text>
          <JsonValue value={result.rawValue} />
        </div>
      )}
    </>
  )
}

export function LocatorDetails({
  locator,
  result,
  diagnostics = false,
}: {
  locator: SelectorLocator
  result?: LocatorResult
  diagnostics?: boolean
}) {
  const value = locatorValue(locator)
  const copyText =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  const syntax =
    typeof value === 'string' &&
    (locator.kind === 'css_path' || locator.kind === 'xpath')
      ? value.split(locatorSyntax)
      : null
  return (
    <div className="task-locator">
      <div className="task-inspector-row">
        <Typography.Text strong>{locatorLabels[locator.kind]}</Typography.Text>
        {diagnostics && <ExecutionStatus status={result?.status} />}
        {result && (
          <Typography.Text type="secondary">
            {matchCountLabel(result)}
          </Typography.Text>
        )}
        <Typography.Text
          copyable={{
            text: copyText,
            tooltips: ['Copy locator', 'Locator copied'],
          }}
        />
      </div>
      <div className="task-locator-code" data-kind={locator.kind}>
        {syntax ? (
          <pre className="task-json">
            {syntax.map((token, index) =>
              index % 2 === 0 ? token : <span key={index}>{token}</span>,
            )}
          </pre>
        ) : (
          <JsonValue value={value} />
        )}
      </div>
      <ResultDetails result={result} />
    </div>
  )
}

function PartDetails({
  part,
  result,
  diagnostics,
}: {
  part: SelectorPart
  result?: PartResult
  diagnostics: boolean
}) {
  const locators = new Map(
    result?.locatorResults.map((item) => [item.locatorUuid, item]),
  )
  return (
    <div className="task-stack">
      {part.extraction.type !== 'text' && (
        <Descriptions
          size="small"
          column={1}
          items={[
            {
              key: 'extraction',
              label: 'Extraction spec',
              children: <JsonValue value={part.extraction} />,
            },
          ]}
        />
      )}
      {part.joinWith != null && (
        <Typography.Text>
          Join with{' '}
          <Typography.Text code>
            {JSON.stringify(part.joinWith)}
          </Typography.Text>
        </Typography.Text>
      )}
      <ResultDetails result={result} />
      {part.locators.map((locator) => (
        <LocatorDetails
          key={locator.uuid}
          locator={locator}
          result={locators.get(locator.uuid)}
          diagnostics={diagnostics}
        />
      ))}
    </div>
  )
}

function RecipeParts({
  recipe,
  result,
  diagnostics,
}: {
  recipe: SelectorRecipe
  result?: RecipeResult
  diagnostics: boolean
}) {
  const parts = new Map(
    result?.partResults.map((item) => [item.partUuid, item]),
  )
  return (
    <div className="task-stack">
      <ResultDetails result={result} />
      <Collapse
        size="small"
        items={recipe.parts.map((part, index) => {
          const partResult = parts.get(part.uuid)
          return {
            key: part.uuid,
            label: (
              <span className="task-inspector-row">
                <span>Part {index + 1}</span>
                <Typography.Text type="secondary">
                  {label(part.extraction.type)}
                </Typography.Text>
                {diagnostics && <ExecutionStatus status={partResult?.status} />}
              </span>
            ),
            children: (
              <PartDetails
                part={part}
                result={partResult}
                diagnostics={diagnostics}
              />
            ),
          }
        })}
      />
    </div>
  )
}

export function SelectorRecipes({
  recipes,
  evaluation,
}: {
  recipes: SelectorRecipe[]
  evaluation?: EvaluationResult
}) {
  const results = new Map(
    evaluation?.recipeResults.map((item) => [item.recipeUuid, item]),
  )
  return (
    <Collapse
      size="small"
      items={recipes.map((recipe, index) => {
        const result = results.get(recipe.uuid)
        return {
          key: recipe.uuid,
          label: (
            <span className="task-inspector-row">
              <span>Recipe {index + 1}</span>
              {evaluation && <ExecutionStatus status={result?.status} />}
            </span>
          ),
          children: (
            <RecipeParts
              recipe={recipe}
              result={result}
              diagnostics={Boolean(evaluation)}
            />
          ),
        }
      })}
    />
  )
}
