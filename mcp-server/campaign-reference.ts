import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { ACTIVE_ADVENTURE_ID } from './adventure'

export const CONSULT_CAMPAIGN = {
  name: 'consult_campaign',
  description: 'Read the active campaign adventure-module.md, including other maps, room notes, secrets, endings and documentary appendices. No arguments lists headings with sectionIds. Search with query, then read a returned sectionId; sectionId="module" reads the complete Markdown in bounded pages. Continue with nextOffset or nextResultOffset. The campaign is fixed by the server session: no file path or adventure selector. Private GM reference only, never a character discovery or an accomplished event. Read-only, no action, dice, time or state change; available in every phase.',
  input_schema: { type: 'object', properties: {
    query: { type: 'string', minLength: 1, maxLength: 160 },
    sectionId: { type: 'string', minLength: 1, maxLength: 80 },
    offset: { type: 'integer', minimum: 0, description: 'Character offset within the selected section or module.' },
    limit: { type: 'integer', minimum: 1, maximum: 8000, description: 'Maximum Markdown characters returned; default 6000.' },
    resultOffset: { type: 'integer', minimum: 0, description: 'Heading index or search result offset.' },
  }, additionalProperties: false },
}

export const CampaignReferenceInput = z.object({
  query: z.string().trim().min(1).max(160).optional(),
  sectionId: z.string().min(1).max(80).optional(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(8000).optional(),
  resultOffset: z.number().int().nonnegative().optional(),
}).strict()
const notice = 'Référence confidentielle du MJ : distingue scénario prévu, secrets, savoir des PNJ et faits réellement établis. Cette lecture ne révèle rien au personnage, ne communique aucun objectif et ne résout aucune action. Les adaptations du module et les résultats moteur priment sur les annexes documentaires.'
const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

interface Section {
  sectionId: string
  title: string
  level: number
  line: number
  start: number
  end: number
}

// Explicit document lookup chosen by the model, never interpretation of player prose.
// The only file comes from the campaign fixed when this engine process spawned.
export function consultCampaign(input: unknown) {
  const adventureId = ACTIVE_ADVENTURE_ID
  const invalid = (error: string) => ({ code: 'CAMPAIGN_REFERENCE_INVALID', error, notice })
  const parsed = CampaignReferenceInput.safeParse(input)
  if (!parsed.success) return invalid('Arguments invalides : utilise query OU sectionId, avec une pagination valide.')
  const args = parsed.data
  if (args.query !== undefined && args.sectionId !== undefined) return invalid('Choisis query ou sectionId, pas les deux.')
  if (args.sectionId === undefined && (args.offset !== undefined || args.limit !== undefined)) return invalid('offset et limit exigent un sectionId ; utilise "module" pour lire tout le document.')
  if (args.sectionId !== undefined && args.resultOffset !== undefined) return invalid('La lecture utilise offset ; resultOffset est réservé à l’index et à la recherche.')

  try {
    const markdown = fs.readFileSync(path.join(process.cwd(), 'adventures', adventureId, 'adventure-module.md'), 'utf8')
    const sections: Section[] = []
    let position = 0
    let line = 1
    let fenced = false
    let fenceChar = ''
    let fenceLength = 0
    for (const raw of markdown.split('\n')) {
      const fence = /^ {0,3}(`{3,}|~{3,})/.exec(raw)
      if (fence) {
        if (!fenced) {
          fenced = true
          fenceChar = fence[1][0]
          fenceLength = fence[1].length
        } else if (fence[1][0] === fenceChar && fence[1].length >= fenceLength) fenced = false
      } else if (!fenced) {
        const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw)
        if (heading) sections.push({ sectionId: `section-${line}`, title: heading[2], level: heading[1].length,
          line, start: position, end: markdown.length })
      }
      position += raw.length + 1
      line++
    }
    for (let i = 0; i < sections.length; i++) {
      const next = sections.slice(i + 1).find(section => section.level <= sections[i].level)
      if (next) sections[i].end = next.start
    }
    const reference = { adventureId, source: `adventures/${adventureId}/adventure-module.md`, notice }
    if (args.sectionId !== undefined) {
      const section = args.sectionId === 'module' ? undefined : sections.find(section => section.sectionId === args.sectionId)
      if (args.sectionId !== 'module' && !section) return invalid('sectionId inconnu ; consulte l’index du document.')
      const text = section ? markdown.slice(section.start, section.end) : markdown
      const offset = args.offset ?? 0
      if (offset > text.length) return invalid('offset dépasse la longueur du texte sélectionné.')
      const content = text.slice(offset, offset + (args.limit ?? 6000))
      const end = offset + content.length
      return { ...reference, sectionId: args.sectionId, title: section?.title, offset,
        totalCharacters: text.length, content, ...(end < text.length ? { nextOffset: end } : {}) }
    }
    const resultOffset = args.resultOffset ?? 0
    if (args.query !== undefined) {
      const query = normalize(args.query)
      const matches = sections.flatMap((section, index) => {
        // Search each paragraph once, under its nearest heading, including annexes.
        const text = markdown.slice(section.start, sections[index + 1]?.start ?? markdown.length)
        const matchedLines = text.split('\n').filter(textLine => normalize(textLine).includes(query))
        return matchedLines.length ? [{ sectionId: section.sectionId, title: section.title, line: section.line,
          excerpt: matchedLines[0].slice(0, 360) }] : []
      })
      const results = matches.slice(resultOffset, resultOffset + 10)
      return { ...reference, query: args.query, total: matches.length, results,
        ...(resultOffset + results.length < matches.length ? { nextResultOffset: resultOffset + results.length } : {}) }
    }
    const headings = sections.slice(resultOffset, resultOffset + 40).map(({ sectionId, title, level, line }) => ({ sectionId, title, level, line }))
    return { ...reference, documentId: 'module', totalCharacters: markdown.length, total: sections.length, headings,
      ...(resultOffset + headings.length < sections.length ? { nextResultOffset: resultOffset + headings.length } : {}) }
  } catch {
    return { code: 'CAMPAIGN_REFERENCE_UNAVAILABLE', error: 'Le Markdown de cette campagne ne peut pas être chargé.', notice }
  }
}
