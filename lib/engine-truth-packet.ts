import { summarizeGameState } from '@/lib/server-logger'
import { buildEngineResolutionView } from '@/lib/world-engine'
import { buildSceneSurface, summarizeSceneSurfaceForDebug } from '@/lib/scene-surface'
import type { CombatLogEntry, EngineEvent, GameState, PlayerAffordance } from '@/lib/types'
import type { GameActionConfidence, GameActionIntent, GameActionKind, GameActionPrimitive } from '@/lib/game-actions'
import type { IntentInterpreterOutput } from '@/lib/intent-interpreter'
import type { NarratedWorldFact } from '@/lib/narrative-world-contract'

export interface EngineTruthIntentInterpreter {
  used: boolean
  model: string | null
  output: IntentInterpreterOutput | null
  fallbackReason: string | null
}

function formatPosition(position: { x: number; y: number }): string {
  return `(${position.x},${position.y})`
}

export interface EngineTruthPacket {
  actionIntent: {
    kind: GameActionKind
    primitive: GameActionPrimitive
    reason: string
    confidence: GameActionConfidence
    requiresEngine: boolean
  }
  intentInterpreter?: {
    used: boolean
    model: string | null
    output: IntentInterpreterOutput | null
    fallbackReason: string | null
  }
  toolsUsed: string[]
  state: ReturnType<typeof summarizeGameState>
  sceneSurface: Record<string, unknown>
  events: EngineEvent[]
  affordances: PlayerAffordance[]
  combatLog: Array<Pick<CombatLogEntry, 'round' | 'turn' | 'action' | 'mechanicalDetail'>>
  allowedFacts: string[]
  narrativeFactContract: {
    supportedEventTypes: string[]
    riskyFactKinds: Array<NarratedWorldFact['kind']>
  }
}

function formatDeathSavesForTruth(gameState: GameState): string {
  const saves = gameState.player.deathSaves ?? { successes: 0, failures: 0 }
  return `successes=${saves.successes}, failures=${saves.failures}, stable=${Boolean(saves.stable)}, dead=${Boolean(saves.dead)}`
}

export function buildDownedPlayerFinalNarrationInstruction(gameState: GameState): string | undefined {
  if (gameState.player.hp.current > 0) return undefined

  const saves = gameState.player.deathSaves ?? { successes: 0, failures: 0 }
  if (saves.dead) {
    return 'CONTRAINTE KO: Le joueur est mort selon le paquet moteur. Narre la consequence immediate de la mort; ne propose ni attaque, ni mouvement, ni jet de mort.'
  }
  if (saves.stable) {
    return 'CONTRAINTE KO: Le joueur est stable mais inconscient. Narre une consequence immediate de scene; ne propose ni attaque, ni mouvement, ni nouvelle action heroique.'
  }
  if (gameState.phase === 'combat' && gameState.currentTurn === 'player') {
    return 'CONTRAINTE KO: currentTurn=player signifie que le prochain levier jouable est un jet de mort. Ne dis jamais que les ennemis vont agir maintenant, que c est a eux de frapper, ou que le joueur peut attaquer/se deplacer.'
  }
  if (gameState.phase === 'combat') {
    return 'CONTRAINTE KO: Le joueur est inconscient pendant que l initiative tourne. Ne propose ni attaque, ni mouvement, ni defense active; rappelle seulement une consequence immediate soutenue par les logs.'
  }

  return 'CONTRAINTE KO: Le joueur est a 0 PV hors combat. Ne propose ni attaque, ni mouvement heroique; garde la suite sur les consequences immediates de la scene.'
}

export function buildEngineTruthPacket(
  actionIntent: GameActionIntent,
  toolsUsed: string[],
  gameState: GameState,
  newCombatLogEntries: CombatLogEntry[],
  newWorldEvents: EngineEvent[] = [],
  intentInterpreter?: EngineTruthIntentInterpreter
): EngineTruthPacket {
  const engineResolution = buildEngineResolutionView(gameState, newCombatLogEntries, newWorldEvents)
  const sceneSurface = buildSceneSurface(gameState)
  const sceneSurfaceDebug = summarizeSceneSurfaceForDebug(sceneSurface)
  const aliveMonsters = Object.values(gameState.monsters)
    .filter(monster => monster.isAlive)
    .map(monster => ({
      id: monster.id,
      name: monster.name,
      hp: `${monster.hp.current}/${monster.hp.max}`,
      position: formatPosition(monster.position),
    }))

  const allowedFacts = [
    `phase=${gameState.phase}`,
    `currentTurn=${gameState.currentTurn ?? 'none'}`,
    `round=${gameState.round}`,
    `playerHp=${gameState.player.hp.current}/${gameState.player.hp.max}`,
    `playerConditions=${gameState.player.conditions.join(',') || 'none'}`,
    `playerDeathSaves=${formatDeathSavesForTruth(gameState)}`,
    `playerCanAct=${gameState.player.hp.current > 0 && !gameState.player.conditions.includes('unconscious')}`,
    `playerPosition=${formatPosition(gameState.player.position)}`,
    `currentRoomId=${gameState.currentRoomId ?? 'unknown'}`,
    ...(gameState.currentRoomId && gameState.world?.rooms?.[gameState.currentRoomId]
      ? [
          `currentRoomName=${gameState.world.rooms[gameState.currentRoomId].name}`,
          `currentRoomTags=${gameState.world.rooms[gameState.currentRoomId].tags?.join(',') || 'none'}`,
          `currentRoomExits=${gameState.world.rooms[gameState.currentRoomId].exits?.join(',') || 'none'}`,
        ]
      : []),
    `worldFlags=${JSON.stringify(gameState.world?.flags ?? {})}`,
    `aliveMonsters=${aliveMonsters.length}`,
    ...sceneSurface.narratableFacts.map(fact => `sceneSurface=${fact}`),
    ...sceneSurface.objects
      .map(object => `worldObject=${object.id} name=${object.name} kind=${object.kind} visible=${object.visible} discovered=${object.discovered} opened=${Boolean(object.opened)} locked=${Boolean(object.locked)} taken=${Boolean(object.taken)} used=${Boolean(object.used)} disarmed=${Boolean(object.disarmed)} readable=${object.readable} distance=${object.distance} portal=${JSON.stringify(object.portal ?? null)}`),
    ...sceneSurface.npcs
      .map(npc => `worldNpc=${npc.id} name=${npc.name} disposition=${npc.disposition} known=${Boolean(npc.known)} faction=${npc.faction ?? 'none'} goals=${JSON.stringify(npc.goals ?? [])}`),
    ...Object.values(gameState.world?.quests ?? {})
      .map(quest => `quest=${quest.id} progress=${quest.progress}/${quest.goal} completed=${Boolean(quest.completed)} flags=${JSON.stringify(quest.flags ?? {})}`),
    ...Object.entries(gameState.world?.alarms ?? {})
      .map(([alarmId, alarm]) => `alarm=${alarmId} raised=${alarm.raised} level=${alarm.level} clock=${alarm.clock ? `${alarm.clock.value}:${JSON.stringify(alarm.clock.thresholds ?? {})}` : 'none'} reason=${alarm.reason ?? 'none'}`),
    `narrativeFactContract=${JSON.stringify({
      supportedEventTypes: [...new Set(engineResolution.events.map(event => event.type))],
      riskyFactKinds: ['recipe_acquired', 'recipe_completed', 'object_discovered', 'object_opened', 'npc_convinced', 'trap_triggered', 'trap_disarmed', 'alarm_negated', 'item_used_negated', 'player_dead', 'player_unconscious'],
    })}`,
    ...engineResolution.events.map(event => `event=${event.type} outcome=${event.outcome ?? 'none'} summary=${event.summary}`),
    ...engineResolution.affordances.map(action => `affordance=${action.kind} enabled=${action.enabled} tool=${action.toolName ?? 'none'} reason=${action.reason}`),
    ...aliveMonsters.map(monster => `monster=${monster.name} id=${monster.id} hp=${monster.hp} position=${monster.position}`),
  ]

  const downedInstruction = buildDownedPlayerFinalNarrationInstruction(gameState)
  if (downedInstruction) allowedFacts.push(downedInstruction)
  const eventTypes = engineResolution.events.map(event => event.type)
  if (eventTypes.includes('item.used')) {
    allowedFacts.push('CONTRAINTE POTION: Une potion a bien ete consommee et appliquee par le moteur ce tour-ci. Ne dis jamais que la fiole etait vide, inutile, sans effet, ou vide depuis le debut.')
    if (gameState.player.hp.current <= 0) {
      allowedFacts.push('CONTRAINTE ORDRE DES EVENTS: Narre la sequence comme potion appliquee, puis riposte ou consequence mecanique, puis KO. Le KO ne retro-annule pas la potion.')
    }
  }

  return {
    actionIntent: {
      kind: actionIntent.kind,
      primitive: actionIntent.primitive,
      reason: actionIntent.reason,
      confidence: actionIntent.confidence,
      requiresEngine: actionIntent.requiresEngine,
    },
    intentInterpreter: intentInterpreter ? {
      used: intentInterpreter.used,
      model: intentInterpreter.model,
      output: intentInterpreter.output,
      fallbackReason: intentInterpreter.fallbackReason,
    } : undefined,
    toolsUsed: [...new Set(toolsUsed)],
    state: summarizeGameState(gameState),
    sceneSurface: sceneSurfaceDebug,
    events: engineResolution.events,
    affordances: engineResolution.affordances,
    combatLog: newCombatLogEntries.map(entry => ({
      round: entry.round,
      turn: entry.turn,
      action: entry.action,
      mechanicalDetail: entry.mechanicalDetail,
    })),
    allowedFacts,
    narrativeFactContract: {
      supportedEventTypes: [...new Set(engineResolution.events.map(event => event.type))],
      riskyFactKinds: ['recipe_acquired', 'recipe_completed', 'object_discovered', 'object_opened', 'npc_convinced', 'trap_triggered', 'trap_disarmed', 'alarm_negated', 'item_used_negated', 'player_dead', 'player_unconscious'],
    },
  }
}

export function formatEngineTruthPacket(packet: EngineTruthPacket): string {
  return JSON.stringify(packet, null, 2)
}
