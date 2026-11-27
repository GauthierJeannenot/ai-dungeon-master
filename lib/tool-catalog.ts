import { guideSearchText } from './rule-guides'

export interface CatalogTool { name: string; description?: string }

// Common play stays immediately available; specialist schemas are loaded by the agent.
const CORE_TOOLS = new Set([
  'discover_tools', 'consult_campaign',
  'record_objective_dialogue', 'inspect_objectives',
  'get_rules_support', 'consult_rules', 'get_monster_stat_block',
  'move_token', 'preview_navigation', 'travel_to_map', 'interact_door', 'trigger_room_event', 'reveal_npc', 'reveal_clue',
  'start_encounter', 'enter_combat', 'end_combat', 'next_turn', 'pass_turn', 'run_monster_turns',
  'resolve_reaction', 'npc_action', 'resolve_attack', 'resolve_player_attack',
  'roll_ability_check', 'resolve_saving_throw', 'record_scene_fact', 'drop_item', 'pick_up_item',
  'use_healing_potion', 'inspect_social_interaction', 'begin_social_interaction', 'record_social_conversation', 'resolve_social_request',
])
export const DISCOVER_TOOLS = {
  name: 'discover_tools',
  description: 'Read-only tool discovery. Search capabilities by English/French query OR load up to 8 exact tool names. Matching schemas become available on the next model call; no gameplay action executes. Without arguments returns a compact name index. Use get_rules_support(domain) for detailed procedures and limitations. Only tools currently allowed by the engine phase/character are searchable.',
  input_schema: { type: 'object', properties: {
    query: { type: 'string', minLength: 1, maxLength: 200 },
    names: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8, uniqueItems: true },
    offset: { type: 'integer', minimum: 0 },
  }, additionalProperties: false },
}
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
export function createToolCatalog() {
  const loaded = new Set<string>()
  const load = (names: readonly string[], available: CatalogTool[]) => {
    const additions = available.filter(tool => names.includes(tool.name) && !loaded.has(tool.name) && !CORE_TOOLS.has(tool.name))
    for (const tool of additions) loaded.add(tool.name)
    return additions.map(tool => tool.name)
  }
  return {
    exposed<T extends CatalogTool>(available: T[]): T[] { return available.filter(tool => CORE_TOOLS.has(tool.name) || loaded.has(tool.name)) },
    load,
    discover(input: Record<string, unknown>, available: CatalogTool[]) {
      const invalid = (error: string) => ({ error, code: 'TOOL_DISCOVERY_INVALID', loaded: [] as string[] })
      if (Object.keys(input).some(key => !['query', 'names', 'offset'].includes(key))) return invalid('Unknown discovery argument.')
      if (input.query !== undefined && (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 200)) return invalid('query must be 1–200 characters.')
      if (input.names !== undefined && (!Array.isArray(input.names) || input.names.length < 1 || input.names.length > 8 || input.names.some(name => typeof name !== 'string') || new Set(input.names).size !== input.names.length)) return invalid('names must contain 1–8 distinct exact tool names.')
      if (input.query !== undefined && input.names !== undefined) return invalid('Choose query or names, not both.')
      const offset = input.offset ?? 0
      if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) return invalid('offset must be a non-negative integer.')
      if (Array.isArray(input.names)) {
        const names = input.names as string[]
        const missing = names.filter(name => !available.some(tool => tool.name === name))
        if (missing.length) return { error: 'Unknown or currently unavailable tool names.', code: 'TOOL_UNAVAILABLE', missing, loaded: [] }
        return { loaded: load(names, available), tools: available.filter(tool => names.includes(tool.name)).map(({ name, description }) => ({ name, description })) }
      }
      if (typeof input.query !== 'string') return { index: available.map(tool => tool.name), notice: 'Load exact names, search with query, or choose a domain using get_rules_support. This index loads no schema.' }
      const query = normalize(input.query), terms = query.split(/[^a-z0-9]+/).filter(Boolean)
      if (!terms.length) return invalid('query must include searchable words.')
      // The query is supplied explicitly by the model, never derived from player prose.
      const matches = available.map(tool => {
        const name = normalize(tool.name), description = normalize(tool.description ?? ''), guide = normalize(guideSearchText(tool.name))
        return { tool, score: (name === query ? 1000 : 0) + terms.reduce((score, term) => score + (name.includes(term) ? 10 : description.includes(term) ? 3 : guide.includes(term) ? 1 : 0), 0) }
      }).filter(match => match.score > 0).sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
      const page = matches.slice(offset, offset + 8).map(match => match.tool)
      return { loaded: load(page.map(tool => tool.name), available),
        tools: page.map(({ name, description }) => ({ name, description })),
        total: matches.length, ...(offset + page.length < matches.length ? { nextOffset: offset + page.length } : {}) }
    },
  }
}
