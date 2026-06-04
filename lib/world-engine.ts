import type {
  CombatLogEntry,
  EngineEvent,
  EngineEventType,
  EngineResolutionView,
  GameState,
  PlayerAffordance,
} from './types'
import { normalizeFrenchText } from './dm-intent'

function aliveMonsters(gameState: GameState) {
  return Object.values(gameState.monsters).filter(monster => monster.isAlive)
}

function hasHealingPotion(gameState: GameState): boolean {
  return gameState.player.inventory.some(item => item.type === 'potion')
}

function affordance(fields: PlayerAffordance): PlayerAffordance {
  return fields
}

export function derivePlayerAffordances(gameState: GameState): PlayerAffordance[] {
  const affordances: PlayerAffordance[] = []
  const playerDown = gameState.player.hp.current <= 0 || gameState.player.conditions.includes('unconscious')
  const deathSaves = gameState.player.deathSaves
  const monstersAlive = aliveMonsters(gameState).length

  if (playerDown) {
    if (deathSaves?.dead) {
      return [
        affordance({
          id: 'observe-aftermath',
          kind: 'observe',
          label: 'Observer les consequences',
          enabled: true,
          reason: 'Le joueur est mort; seules les consequences de scene restent jouables.',
        }),
      ]
    }

    if (deathSaves?.stable) {
      return [
        affordance({
          id: 'observe-stable-unconscious',
          kind: 'observe',
          label: 'Subir la suite immediate',
          enabled: true,
          reason: 'Le joueur est stable mais inconscient; il ne peut pas agir activement.',
        }),
      ]
    }

    if (gameState.phase === 'combat' && gameState.currentTurn === 'player') {
      affordances.push(affordance({
        id: 'roll-death-save',
        kind: 'death_save',
        label: 'Lancer un jet de mort',
        enabled: true,
        reason: 'Le joueur est a 0 PV et son tour est ouvert.',
        toolName: 'roll_death_save',
      }))
    } else {
      affordances.push(affordance({
        id: 'wait-unconscious',
        kind: 'observe',
        label: 'Rester inconscient',
        enabled: true,
        reason: 'Le joueur est inconscient pendant que la scene avance autour de lui.',
      }))
    }

    affordances.push(
      affordance({
        id: 'no-attack-while-unconscious',
        kind: 'attack',
        label: 'Attaquer',
        enabled: false,
        reason: 'Impossible a 0 PV ou inconscient.',
      }),
      affordance({
        id: 'no-move-while-unconscious',
        kind: 'move',
        label: 'Se deplacer',
        enabled: false,
        reason: 'Impossible a 0 PV ou inconscient.',
      })
    )
    return affordances
  }

  if (gameState.phase === 'combat') {
    if (gameState.currentTurn !== 'player') {
      return [
        affordance({
          id: 'wait-for-initiative',
          kind: 'observe',
          label: 'Voir le tour adverse se resoudre',
          enabled: true,
          reason: `Le tour courant est ${gameState.currentTurn ?? 'inconnu'}, pas le joueur.`,
        }),
      ]
    }

    if (monstersAlive > 0) {
      affordances.push(
        affordance({
          id: 'attack-active-enemy',
          kind: 'attack',
          label: 'Attaquer une cible vivante',
          enabled: true,
          reason: `${monstersAlive} adversaire(s) vivant(s) sont engages.`,
          toolName: 'resolve_player_action',
        }),
        affordance({
          id: 'combat-social-pressure',
          kind: 'social',
          label: 'Parlementer ou intimider',
          enabled: true,
          reason: 'Un adversaire conscient peut reagir a une pression sociale credible.',
          toolName: 'resolve_player_action',
        })
      )
    }

    affordances.push(
      affordance({
        id: 'combat-move',
        kind: 'move',
        label: 'Se deplacer',
        enabled: true,
        reason: 'Le joueur est conscient et son tour est ouvert.',
        toolName: 'resolve_player_action',
      }),
      affordance({
        id: 'combat-wait',
        kind: 'wait',
        label: 'Passer ou tenir sa position',
        enabled: true,
        reason: 'Le joueur peut laisser filer son tour.',
        toolName: 'resolve_player_action',
      })
    )

    if (hasHealingPotion(gameState)) {
      affordances.push(affordance({
        id: 'drink-healing-potion',
        kind: 'use_item',
        label: 'Boire une potion de soin',
        enabled: true,
        reason: 'Une potion est dans l inventaire et le joueur peut agir.',
        toolName: 'resolve_player_action',
      }))
    }

    affordances.push(affordance({
      id: 'combat-check',
      kind: 'ability_check',
      label: 'Tenter une manoeuvre risquee',
      enabled: true,
      reason: 'Une action creative doit passer par un test ou une action sociale.',
      toolName: 'resolve_player_action',
    }))

    return affordances
  }

  affordances.push(
    affordance({
      id: 'exploration-observe',
      kind: 'observe',
      label: 'Observer la scene',
      enabled: true,
      reason: 'Observer ne mute pas l etat du monde.',
    }),
    affordance({
      id: 'exploration-move',
      kind: 'move',
      label: 'Changer de lieu ou de position',
      enabled: true,
      reason: 'Le joueur est conscient hors combat.',
      toolName: 'resolve_player_action',
    }),
    affordance({
      id: 'exploration-interact',
      kind: 'interact',
      label: 'Manipuler un element local',
      enabled: true,
      reason: 'Une interaction locale doit passer par le moteur si elle change le monde.',
      toolName: 'resolve_player_action',
    }),
    affordance({
      id: 'exploration-check',
      kind: 'ability_check',
      label: 'Tenter un test',
      enabled: true,
      reason: 'Les actions incertaines passent par un test moteur.',
      toolName: 'resolve_player_action',
    }),
    affordance({
      id: 'exploration-social',
      kind: 'social',
      label: 'Parler ou negocier',
      enabled: true,
      reason: 'Une interaction sociale peut etre resolue si un interlocuteur est present en fiction.',
      toolName: 'resolve_player_action',
    })
  )

  if (hasHealingPotion(gameState) && gameState.player.hp.current < gameState.player.hp.max) {
    affordances.push(affordance({
      id: 'exploration-healing-potion',
      kind: 'use_item',
      label: 'Boire une potion de soin',
      enabled: true,
      reason: 'Le joueur est blesse et possede une potion.',
      toolName: 'resolve_player_action',
    }))
  }

  return affordances
}

function classifyLogEntry(entry: CombatLogEntry): { type: EngineEventType; outcome?: EngineEvent['outcome'] } {
  const action = normalizeFrenchText(entry.action)
  const detail = normalizeFrenchText(entry.mechanicalDetail ?? '')

  if (action.includes('jet de sauvegarde contre la mort') || detail.includes('jet de mort')) {
    if (detail.includes('critique')) return { type: 'combat.death_save', outcome: 'critical' }
    if (detail.includes('echec')) return { type: 'combat.death_save', outcome: 'failure' }
    if (detail.includes('succes')) return { type: 'combat.death_save', outcome: 'success' }
    return { type: 'combat.death_save', outcome: 'unknown' }
  }

  if (action.includes('attaque')) {
    if (/\bmiss\b|rate|echec/.test(detail)) return { type: 'combat.attack', outcome: 'miss' }
    if (/\bhit\b|touche|degats|dmg|critique/.test(detail)) return { type: 'combat.attack', outcome: 'hit' }
    return { type: 'combat.attack', outcome: 'unknown' }
  }

  if (action.includes('se deplace') || detail.includes('deplacement')) return { type: 'entity.moved' }
  if (action.includes('boit') || detail.includes('potion de soin')) return { type: 'item.used' }
  if (action.includes('combat engage')) return { type: 'combat.started' }
  if (action.includes('rencontre')) return { type: 'combat.started' }
  if (action.includes('combat termine')) return { type: 'combat.ended' }
  if (action.includes('passe son tour')) return { type: 'combat.turn_passed' }
  if (action.includes('[salle')) return { type: 'room.event' }
  if (detail.includes('hp:') || action.includes(' hp ')) return { type: 'entity.hp_changed' }
  if (detail.includes(' vs dd ') || action.includes('test') || action.includes('persuasion') || action.includes('intimidation')) {
    if (detail.includes('succes')) return { type: 'check.rolled', outcome: 'success' }
    if (detail.includes('echec')) return { type: 'check.rolled', outcome: 'failure' }
    return { type: 'check.rolled', outcome: 'unknown' }
  }

  return { type: 'state.changed' }
}

export function deriveEngineEventsFromCombatLogEntries(entries: CombatLogEntry[]): EngineEvent[] {
  return entries.map((entry, index) => {
    const classified = classifyLogEntry(entry)
    const detail = entry.mechanicalDetail?.trim()
    return {
      id: entry.id || `combat-log-${index}`,
      type: classified.type,
      summary: detail ? `${entry.action} | ${detail}` : entry.action,
      actorId: entry.turn,
      round: entry.round,
      turn: entry.turn,
      mechanicalDetail: detail,
      outcome: classified.outcome,
      visibleToPlayer: true,
    }
  })
}

export function buildEngineResolutionView(
  gameState: GameState,
  newCombatLogEntries: CombatLogEntry[]
): EngineResolutionView {
  return {
    events: deriveEngineEventsFromCombatLogEntries(newCombatLogEntries),
    affordances: derivePlayerAffordances(gameState),
  }
}
