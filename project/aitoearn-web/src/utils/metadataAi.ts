export interface MetadataPromptContext {
  title: string
  description: string
  tags: string[]
  platforms: string[]
}

export function extractHashTags(text?: string) {
  if (!text)
    return []

  return Array.from(
    new Set(
      (text.match(/#([\p{L}\p{N}_-]+)/gu) || [])
        .map(tag => tag.replace(/^#/, '').trim())
        .filter(Boolean),
    ),
  )
}

export function buildPromptFromTemplate(template: string, context: MetadataPromptContext) {
  const replacements: Record<string, string> = {
    '{{title}}': context.title.trim(),
    '{{description}}': context.description.trim(),
    '{{tags}}': context.tags.join(', '),
    '{{platforms}}': context.platforms.join(', '),
  }

  return Object.entries(replacements).reduce((acc, [key, value]) => acc.split(key).join(value), template)
}
