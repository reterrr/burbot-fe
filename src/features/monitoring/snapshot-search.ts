export type SnapshotSearch = 'text' | 'class' | 'id'
export type SourceRange = { start: number; end: number }

const rawTextTags = new Set([
  'iframe',
  'noembed',
  'noframes',
  'plaintext',
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
])
/** Find source offsets without instantiating the captured HTML in a browser document. */
export function findSnapshotMatches(
  html: string,
  query: string,
  mode: SnapshotSearch,
) {
  const starts: number[] = []
  const tagEnds: number[] | null = mode === 'text' ? null : []
  const record = (start: number, end: number) => {
    starts.push(start)
    tagEnds?.push(end)
  }
  const result = {
    get count() {
      return starts.length
    },
    at(index: number): SourceRange | undefined {
      const start = starts[index]
      if (start !== undefined)
        return { start, end: tagEnds?.[index] ?? start + query.length }
    },
  }

  if (mode === 'text') {
    if (query) {
      const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      for (const match of html.matchAll(new RegExp(literal, 'gi')))
        record(match.index, match.index + match[0].length)
    }
    return result
  }

  const prefix = mode === 'class' ? '.' : '#'
  const trimmed = query.trim()
  const value = trimmed.startsWith(prefix) ? trimmed.slice(1) : trimmed
  if (!value) return result
  const nodes =
    /<!--[\s\S]*?(?:-->|$)|<([a-z][\w:-]*)(?=[\s/>])((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi
  const attributes =
    /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  for (let node = nodes.exec(html); node; node = nodes.exec(html)) {
    if (!node[1]) continue
    for (const [
      ,
      name,
      doubleQuoted,
      singleQuoted,
      unquoted,
    ] of node[2].matchAll(attributes)) {
      if (name.toLowerCase() !== mode) continue
      const attribute = doubleQuoted ?? singleQuoted ?? unquoted ?? ''
      if (
        mode === 'class'
          ? attribute.split(/[\t\n\f\r ]+/).includes(value)
          : attribute === value
      )
        record(node.index, nodes.lastIndex)
      break
    }
    const tag = node[1].toLowerCase()
    if (!rawTextTags.has(tag)) continue
    if (tag === 'plaintext') break
    const end = new RegExp(`</${tag}\\s*>`, 'gi')
    end.lastIndex = nodes.lastIndex
    if (!end.test(html)) break
    nodes.lastIndex = end.lastIndex
  }
  return result
}
