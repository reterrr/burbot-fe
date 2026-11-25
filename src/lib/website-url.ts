export function websiteUrl(value: string | null | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href
  } catch {
    return undefined
  }
}
