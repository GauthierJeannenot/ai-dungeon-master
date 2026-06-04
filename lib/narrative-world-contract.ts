import type { EngineEvent, GameState } from './types'
import { normalizeFrenchText } from './dm-intent'

export type NarratedWorldFactKind =
  | 'recipe_acquired'
  | 'recipe_completed'
  | 'object_discovered'
  | 'object_opened'
  | 'npc_convinced'
  | 'trap_triggered'
  | 'trap_disarmed'
  | 'alarm_negated'
  | 'item_used_negated'
  | 'player_dead'
  | 'player_unconscious'

export interface NarratedWorldFact {
  kind: NarratedWorldFactKind
  trigger: string
}

export interface UnsupportedNarratedWorldFact {
  reason: string
  fact: NarratedWorldFact
  suggestedTools: string[]
}

function has(pattern: RegExp, text: string): boolean {
  return pattern.test(text)
}

export function extractNarratedWorldFacts(responseText: string): NarratedWorldFact[] {
  const text = normalizeFrenchText(responseText)
  const facts: NarratedWorldFact[] = []
  const add = (kind: NarratedWorldFactKind, trigger: string, pattern: RegExp) => {
    if (has(pattern, text)) facts.push({ kind, trigger })
  }

  add(
    'recipe_acquired',
    'recipe acquired/found wording',
    /\b(trouves?|trouve|decouvres?|decouvre|ramasses?|ramasse|prends?|prend|recuperes?|recupere|empoches?|empoche)\b.{0,80}\b(recette|fragment|moitie|parchemin|papier)\b/
  )
  add(
    'recipe_completed',
    'recipe completed wording',
    /\b(recette)\b.{0,100}\b(complete|assemblee|reconstituee|entiere|terminee|reparee)\b/
  )
  add(
    'object_discovered',
    'object discovered wording',
    /\b(decouvres?|decouvre|trouves?|trouve|revele|apparait|apercois|apercoit)\b.{0,80}\b(tiroir|coffre|armoire|indice|parchemin|fragment|recette)\b/
  )
  add(
    'object_opened',
    'object opened wording',
    /\b(porte|battants?|serrure|verrou|tiroir|coffre|armoire)\b.{0,80}\b(s'ouvre|s ouvre|ouverte|ouvert|cedent?|cede|deverrouillee?|deverrouille|franchissable)\b/
  )
  add(
    'npc_convinced',
    'npc convinced wording',
    /\b(convaincu|convaincs?|accepte|cede|te croit|t'aide|t aide|devient amical|devient allie|se rallie|cooperer|coopere)\b/
  )
  add(
    'trap_triggered',
    'trap triggered wording',
    /\b(piege|champignons?|couteaux?|ratelier|mecanisme)\b.{0,100}\b(declenche|active|s active|blesse|empoisonne|jaillit|attaque|se referme)\b/
  )
  add(
    'trap_disarmed',
    'trap disarmed wording',
    /\b(piege|champignons?|couteaux?|ratelier|mecanisme)\b.{0,100}\b(desamorce|neutralise|desactive|inoffensif|sans danger)\b/
  )
  add(
    'alarm_negated',
    'alarm negated wording',
    /\b(tout est calme|aucune alerte|personne n a entendu|personne ne remarque|personne ne reagit|le silence retombe|rien ne bouge)\b/
  )
  add(
    'item_used_negated',
    'used item negated wording',
    /\b(potion|fiole|elixir)\b.{0,100}\b(vide|etait vide|etait deja vide|depuis le debut|sans effet|n a rien fait|ne fait rien|inutile|eventee|evente)\b/
  )
  add(
    'player_dead',
    'player death wording',
    /\b(tu es mort|tu meurs|mort definitive|c est la mort|ton corps sans vie)\b/
  )
  add(
    'player_unconscious',
    'player unconscious wording',
    /\b(inconscient|tu t effondres|tu tombes a terre|tu perds connaissance)\b/
  )

  return facts
}

export function detectUnsupportedNarratedWorldFact(
  fact: NarratedWorldFact,
  gameState: GameState,
  recentEvents: EngineEvent[],
  toolsUsed: string[] = []
): UnsupportedNarratedWorldFact | null {
  const world = gameState.world
  if (!world) return null

  const eventTypes = new Set(recentEvents.map(event => event.type))
  const objects = Object.values(world.objects)
  const npcs = Object.values(world.npcs)
  const suggestedTools = ['resolve_player_action']

  switch (fact.kind) {
    case 'recipe_acquired': {
      const recipeTaken = objects.some(object => object.tags?.includes('recipe_half') && object.taken)
      if (!recipeTaken && !eventTypes.has('quest.item_found') && !eventTypes.has('object.taken')) {
        return { reason: 'recipe_found_without_engine_state', fact, suggestedTools }
      }
      return null
    }
    case 'recipe_completed': {
      const quest = world.quests.grammy_recipe
      if (!quest?.completed && !eventTypes.has('quest.completed')) {
        return { reason: 'recipe_completed_without_engine_state', fact, suggestedTools }
      }
      return null
    }
    case 'object_discovered': {
      const discovered = objects.some(object =>
        object.discovered &&
        (object.tags?.includes('recipe_half') || object.tags?.includes('recipe_cache') || ['container', 'clue', 'item'].includes(object.kind))
      )
      if (!discovered && !eventTypes.has('room.object_discovered') && !eventTypes.has('quest.item_found')) {
        return { reason: 'object_discovered_without_engine_state', fact, suggestedTools }
      }
      return null
    }
    case 'object_opened': {
      const opened = objects.some(object => ['door', 'container'].includes(object.kind) && object.opened)
      if (!opened && !eventTypes.has('door.opened') && !eventTypes.has('object.opened')) {
        return { reason: 'object_opened_without_engine_state', fact, suggestedTools }
      }
      return null
    }
    case 'npc_convinced': {
      const compatibleNpcState = npcs.some(npc => npc.disposition === 'helpful' || npc.disposition === 'wary')
      if (!compatibleNpcState && !eventTypes.has('npc.disposition_changed') && !toolsUsed.includes('roll_ability_check')) {
        return { reason: 'npc_convinced_without_engine_state', fact, suggestedTools }
      }
      return null
    }
    case 'trap_triggered': {
      const triggered = objects.some(object => object.kind === 'trap' && object.used && !object.disarmed)
      if (!triggered && !eventTypes.has('trap.triggered')) {
        return { reason: 'trap_triggered_without_engine_state', fact, suggestedTools }
      }
      return null
    }
    case 'trap_disarmed': {
      const disarmed = objects.some(object => object.kind === 'trap' && object.disarmed)
      if (!disarmed && !eventTypes.has('trap.disarmed')) {
        return { reason: 'trap_disarmed_without_engine_state', fact, suggestedTools }
      }
      return null
    }
    case 'alarm_negated': {
      const raisedAlarms = Object.values(world.alarms).some(alarm => alarm.raised && alarm.level > 0)
      if (raisedAlarms && !eventTypes.has('alarm.raised')) {
        return { reason: 'alarm_ignored_by_narration', fact, suggestedTools }
      }
      return null
    }
    case 'item_used_negated':
      if (eventTypes.has('item.used') || toolsUsed.includes('use_healing_potion')) {
        return { reason: 'item_used_contradicted_by_narration', fact, suggestedTools: ['resolve_player_action', 'use_healing_potion'] }
      }
      return null
    case 'player_dead':
      if (!gameState.player.deathSaves?.dead) {
        return { reason: 'player_dead_without_engine_state', fact, suggestedTools: ['roll_death_save'] }
      }
      return null
    case 'player_unconscious':
      if (gameState.player.hp.current > 0 && !gameState.player.conditions.includes('unconscious')) {
        return { reason: 'player_unconscious_without_engine_state', fact, suggestedTools }
      }
      return null
    default:
      return null
  }
}

export function detectUnsupportedNarratedWorldFacts(
  responseText: string,
  gameState: GameState,
  recentEvents: EngineEvent[],
  toolsUsed: string[] = []
): UnsupportedNarratedWorldFact[] {
  return extractNarratedWorldFacts(responseText)
    .map(fact => detectUnsupportedNarratedWorldFact(fact, gameState, recentEvents, toolsUsed))
    .filter((problem): problem is UnsupportedNarratedWorldFact => Boolean(problem))
}
