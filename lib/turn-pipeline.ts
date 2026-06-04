import type { DMTurnUsage, GameState } from './types'
import type { GameActionIntent, GameActionKind } from './game-actions'

export type LlmRoute = DMTurnUsage['llmRoute']

export type ToolLike = {
  name: string
}

const CANONICAL_WORLD_ACTION_KINDS = new Set<GameActionKind>([
  'search',
  'examine',
  'read',
  'open',
  'take',
  'unlock',
  'force',
  'disarm',
  'talk',
  'ask',
  'persuade',
  'threaten',
  'show_item',
  'give_item',
  'hide',
  'help',
  'flee',
  'stabilize',
  'use_object',
  'combine_recipe',
  'improvise',
])

export const LLM_TOOL_SETS = {
  explorationAmbient: ['roll_ability_check', 'trigger_room_event', 'get_entity_stats'],
  explorationDefault: ['resolve_player_action', 'get_entity_stats'],
  explorationMovement: ['resolve_player_action', 'start_encounter', 'get_entity_stats'],
  explorationEncounter: ['resolve_player_action', 'start_encounter', 'get_entity_stats'],
  combatPlayer: ['resolve_player_action', 'end_combat', 'get_entity_stats'],
  combatNonPlayer: ['roll_ability_check', 'roll_dice', 'get_entity_stats'],
  dialogue: ['resolve_player_action', 'get_entity_stats', 'apply_condition'],
} as const

export function isCanonicalWorldActionKind(kind: GameActionKind): boolean {
  return CANONICAL_WORLD_ACTION_KINDS.has(kind)
}

export function mergeLlmRoute(current: LlmRoute, next: LlmRoute): LlmRoute {
  if (next === 'blocked') return 'blocked'
  if (current === 'blocked') return 'blocked'
  if (current === 'rich' || next === 'rich') return 'rich'
  if (current === 'short' || next === 'short') return 'short'
  return 'none'
}

export function selectIterationLlmRoute(actionIntent: GameActionIntent, budgetBlocked: boolean): LlmRoute {
  if (budgetBlocked) return 'blocked'
  if (shouldPreferRichLlm(actionIntent)) return 'rich'
  return 'short'
}

export function selectFinalNarrationLlmRoute(
  actionIntent: GameActionIntent,
  toolsUsed: string[],
  budgetBlocked: boolean
): LlmRoute {
  if (budgetBlocked) return 'blocked'
  if (shouldPreferRichLlm(actionIntent)) return 'rich'
  if (toolsUsed.length > 0) return 'short'
  return 'short'
}

export function selectToolsForLlm<T extends ToolLike>(
  allTools: T[],
  gameState: GameState,
  actionIntent: GameActionIntent
): T[] {
  if (allTools.length === 0) return []

  if (gameState.phase === 'combat') {
    if (gameState.currentTurn !== 'player') return pickTools(allTools, LLM_TOOL_SETS.combatNonPlayer)

    if (actionIntent.kind === 'attack') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'move') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'wait') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'death_save') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'use_item') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'state_reconcile') return pickTools(allTools, ['resolve_player_action'])
    if (isCanonicalWorldActionKind(actionIntent.kind)) return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])
    if (actionIntent.kind === 'social') return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])
    if (actionIntent.kind === 'ability_check') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'unknown') return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])
    if (actionIntent.kind === 'observe' || actionIntent.kind === 'guidance' || actionIntent.kind === 'query_state') {
      return pickTools(allTools, ['get_entity_stats'])
    }

    return pickTools(allTools, LLM_TOOL_SETS.combatPlayer)
  }

  if (gameState.phase === 'dialogue') {
    return pickTools(allTools, LLM_TOOL_SETS.dialogue)
  }

  if (actionIntent.kind === 'move') {
    return pickTools(allTools, LLM_TOOL_SETS.explorationMovement)
  }

  if (actionIntent.kind === 'state_reconcile') {
    return pickTools(allTools, ['resolve_player_action'])
  }

  if (actionIntent.kind === 'attack' || actionIntent.kind === 'encounter') {
    return pickTools(allTools, LLM_TOOL_SETS.explorationEncounter)
  }

  if (actionIntent.kind === 'interact') {
    return pickTools(allTools, ['resolve_player_action', 'start_encounter', 'get_entity_stats'])
  }

  if (actionIntent.kind === 'use_item') {
    return pickTools(allTools, ['resolve_player_action'])
  }

  if (isCanonicalWorldActionKind(actionIntent.kind)) {
    return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])
  }

  if (actionIntent.kind === 'social' || actionIntent.kind === 'ability_check') {
    return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])
  }

  if (actionIntent.kind === 'unknown') return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])

  if (actionIntent.kind === 'observe' || actionIntent.kind === 'guidance' || actionIntent.kind === 'query_state') {
    return pickTools(allTools, ['get_entity_stats'])
  }

  return pickTools(allTools, LLM_TOOL_SETS.explorationDefault)
}

function shouldPreferRichLlm(actionIntent: GameActionIntent): boolean {
  return actionIntent.kind === 'social' ||
    actionIntent.kind === 'interact' ||
    isCanonicalWorldActionKind(actionIntent.kind) ||
    actionIntent.kind === 'guidance' ||
    actionIntent.kind === 'observe'
}

function pickTools<T extends ToolLike>(allTools: T[], names: readonly string[]): T[] {
  const byName = new Map(allTools.map(tool => [tool.name, tool]))
  return names
    .map(name => byName.get(name))
    .filter((tool): tool is T => Boolean(tool))
}
