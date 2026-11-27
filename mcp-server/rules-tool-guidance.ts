import links from './rules-tool-links.json'
import { guidesForDomain } from '../lib/rule-guides'
import type { CatalogTool } from '../lib/tool-catalog'
import { TOOLKIT_SUPPORT } from './toolkit-support'

type Domain = keyof typeof TOOLKIT_SUPPORT
export interface RuleToolLink {
  domain: Domain
  sources: Array<{ book: string; headings?: string[]; descendants?: boolean; within?: string; pages?: number[]; lines?: number[] }>
  guideIds?: string[]
  tools?: string[]
}
interface RuleReference {
  book?: string
  headings?: string[]
  source?: { origin?: string; page?: number; sha256?: string; startLine?: number; endLine?: number }
  readRange?: { startLine: number; endLine: number }
}
const authoredLinks = links as RuleToolLink[]
// Line anchors apply only to these exact transcriptions. Title anchors survive pagination.
const lineSourceHashes: Record<string, string> = {
  'phb-2014': '7d0651f7bc7f31c5f0562516b4f8d8104f241ff5649645950cd5028281470fb3',
  xge: '519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf',
}
const title = (value: string) => value.normalize('NFC').toLowerCase()
const notice = 'Project MCP usage annotations, separate from the unchanged book text. Only the model chooses calls and arguments. Tools listed as available have schemas loaded after a passage/table read; search hits only preview links. Procedures may mention unavailable tools: do not call those. No action, optional rule, homebrew or engine capability is activated by reading. Engine refusals and returned state remain authoritative.'

/** Match authored source titles/pages, never queries, source prose or player messages. */
export function linksForRule(reference: RuleReference): RuleToolLink[] {
  if (reference.source?.origin === 'homebrew') return []
  return authoredLinks.filter(link => link.sources.some(source => {
    if (source.book !== reference.book) return false
    const headings = (reference.headings ?? []).map(title)
    if (source.within && !headings.includes(title(source.within))) return false
    if (source.pages && !source.pages.includes(reference.source?.page ?? -1)) return false
    if (source.lines) {
      const range = reference.readRange ?? reference.source
      if (reference.source?.sha256 !== lineSourceHashes[source.book] || range?.startLine === undefined
        || range.endLine === undefined || range.startLine > source.lines[1] || range.endLine < source.lines[0]) return false
    }
    return !source.headings || source.headings.some(heading => source.descendants
      ? headings.includes(title(heading)) : headings.at(-1) === title(heading))
  }))
}

function guidance(reference: RuleReference, available: CatalogTool[], detailed: boolean) {
  const matches = linksForRule(reference)
  const domains = [...new Set(matches.map(link => link.domain))]
  const names = [...new Set(matches.flatMap(link => link.tools ?? [
    ...TOOLKIT_SUPPORT[link.domain].tools,
    // A procedure can require a shared resolver not listed in the domain's specialist tools.
    ...guidesForDomain(link.domain).filter(guide => !link.guideIds || link.guideIds.includes(guide.id))
      .flatMap(guide => guide.tools),
  ]))]
  const availableNames = new Set(available.map(tool => tool.name))
  const tools = names.filter(name => availableNames.has(name))
  const unavailableTools = names.filter(name => !availableNames.has(name))
  const procedures = [...new Map(matches.flatMap(link => guidesForDomain(link.domain)
    .filter(guide => !link.guideIds || link.guideIds.includes(guide.id)))
    .map(guide => [guide.id, guide])).values()]
  return {
    origin: 'project_mcp_annotations', domains, tools,
    ...(detailed ? { notice, unavailableTools, procedures,
      coverage: domains.map(domain => ({ domain, ...TOOLKIT_SUPPORT[domain], tools: undefined })),
      ...(!matches.length ? { help: 'No authored tool association for this passage. Choose get_rules_support(domain) or discover_tools explicitly; do not infer engine support from the book.' } : {}),
    } : { help: 'Read this sectionId/tableId to receive the linked MCP procedures and load their available schemas.' }),
  }
}

/** Documentary enrichment only. Original text, excerpts, provenance and pagination are preserved. */
export function withRuleToolGuidance<T extends { kind: string }>(result: T, available: CatalogTool[]) {
  if ((result.kind === 'passage' || result.kind === 'table') && 'book' in result) {
    return { ...result, engineGuidance: guidance(result as T & RuleReference, available, true) }
  }
  if ((result.kind === 'search' || result.kind === 'tables') && 'results' in result && Array.isArray(result.results)) {
    return { ...result, results: result.results.map((reference: RuleReference) => ({
      ...reference, engineGuidance: guidance(reference, available, false),
    })) }
  }
  return result
}
