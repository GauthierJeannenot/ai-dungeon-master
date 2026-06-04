import { getAdventureRoom } from './adventure-map'
import type { CombatLogEntry, GameState, SceneMemory } from './types'
import type { GameActionIntent } from './game-actions'

export interface DirectorDecision {
  narrative: string | null
  shouldUseLlmNarrator: boolean
  reason: string
  beats: string[]
  sceneMemory: SceneMemory
}

export interface DirectorInput {
  playerMessage: string
  actionIntent: GameActionIntent
  gameState: GameState
  toolsUsed: string[]
  newCombatLogEntries: CombatLogEntry[]
}

const LOCAL_NARRATION_TOOLS = new Set([
  'move_token',
  'resolve_player_attack',
  'resolve_player_action',
  'use_healing_potion',
  'roll_death_save',
  'pass_turn',
  'start_encounter',
  'next_turn',
  'resolve_attack',
  'end_combat',
])

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function roomName(gameState: GameState): string {
  return getAdventureRoom(gameState.currentRoomId)?.name ?? 'la zone inconnue'
}

function countAliveMonsters(gameState: GameState): number {
  return Object.values(gameState.monsters).filter(monster => monster.isAlive).length
}

function worldPressureTail(gameState: GameState): string {
  const memory = gameState.sceneMemory
  if (!memory) return ''

  const freshSignal = memory.lastWorldSignals?.[0]
  if (freshSignal) return ` ${freshSignal}`

  if (memory.macDisposition === 'offended' && (gameState.currentRoomId === '1' || gameState.currentRoomId === '2')) {
    return ' Dans ton dos, Mac garde un silence lourd.'
  }

  if ((memory.alertLevel ?? 0) >= 4) {
    return " Plus loin, la boulangerie n'a plus l'air endormie."
  }

  if (memory.patrolPressure === 'hunting') {
    return ' Des pas cherchent maintenant une origine au bruit.'
  }

  if (memory.patrolPressure === 'stirring') {
    return ' Quelque chose remue dans les salles voisines.'
  }

  if ((memory.alertLevel ?? 0) >= 2) {
    return ' Un craquement repond quelque part dans le batiment.'
  }

  return ''
}

function isPlayerActorName(value: string): boolean {
  const actor = normalizeText(value).trim()
  return actor === 'player' || actor.includes('heros')
}

function updateSceneMemory(input: DirectorInput): SceneMemory {
  const previous = input.gameState.sceneMemory ?? {}
  const text = normalizeText(input.playerMessage)
  const tools = unique(input.toolsUsed)
  const beats: string[] = []
  const signals: string[] = []
  let tension = previous.tension ?? 0
  let alertLevel = previous.alertLevel ?? 0

  const noisyThisTurn =
    tools.includes('start_encounter') ||
    /\b(crie|hurle|tape|frappe|defonce|enfonce|casse|brise|provoque|attaque|combat|initiative|perissez|fuyez)\b/.test(text)
  const madeNoise = Boolean(previous.madeNoise) || noisyThisTurn
  if (madeNoise && !previous.madeNoise) {
    beats.push('noise-made')
    signals.push('Du bruit porte plus loin dans la boulangerie.')
    tension += 1
  }

  const insultedMac =
    Boolean(previous.insultedMac) ||
    (/\b(mac|pommier|treant|arbre)\b/.test(text) && /\b(insulte|menace|frappe|coupe|brule|attaque|debile|vieux tas)\b/.test(text))
  let macDisposition = previous.macDisposition ?? 'neutral'
  if (insultedMac && !previous.insultedMac) {
    beats.push('mac-offended')
    signals.push('Mac garde rancune.')
    tension += 1
    macDisposition = 'offended'
  } else if (
    macDisposition !== 'offended' &&
    /\b(mac|pommier|treant|arbre)\b/.test(text) &&
    /\b(remercie|merci|aide|aider|parle|discute|calme|gentiment|respecte)\b/.test(text)
  ) {
    macDisposition = 'helpful'
    beats.push('mac-softened')
    signals.push('Mac semble plus dispose a aider.')
  }

  const foundRecipeMentions = input.newCombatLogEntries.filter(entry =>
    /recette|parchemin/i.test(`${entry.action} ${entry.mechanicalDetail ?? ''}`)
  ).length
  const foundRecipeHalfCount = Math.min(2, (previous.foundRecipeHalfCount ?? 0) + foundRecipeMentions)
  if (foundRecipeHalfCount > (previous.foundRecipeHalfCount ?? 0)) {
    beats.push('recipe-progress')
    signals.push(`Indice de recette trouve: ${foundRecipeHalfCount}/2.`)
  }

  const sparedGoblin =
    Boolean(previous.sparedGoblin) ||
    (/\b(epargne|laisse vivre|negocie|parlemente|rend toi|rendez vous|baisse les armes)\b/.test(text) &&
      /\b(gobelin|grukk|ennemi|monstre)\b/.test(text))
  if (sparedGoblin && !previous.sparedGoblin) {
    beats.push('mercy-shown')
    signals.push('Un gobelin epargne peut changer le ton des prochains echanges.')
  }

  const combatEscalated = tools.includes('resolve_player_attack') || tools.includes('resolve_attack')
  if (combatEscalated) tension += 1
  if (noisyThisTurn) alertLevel += 1
  if (combatEscalated) alertLevel += 1
  if (tools.includes('end_combat')) tension = Math.max(0, tension - 2)
  let patrolPressure = previous.patrolPressure ?? 'quiet'
  if (alertLevel >= 5 && patrolPressure !== 'hunting') {
    patrolPressure = 'hunting'
    beats.push('patrol-hunting')
    signals.push('La boulangerie se met franchement a chercher la source du desordre.')
  } else if (alertLevel >= 3 && patrolPressure === 'quiet') {
    patrolPressure = 'stirring'
    beats.push('patrol-stirring')
    signals.push('Des pas etouffes commencent a repondre dans le batiment.')
  }

  const goblinCasualties = input.newCombatLogEntries.filter(entry =>
    /\bgobel/i.test(entry.action) && /\|\s*MORT/i.test(entry.mechanicalDetail ?? '')
  ).length
  let goblinMorale = previous.goblinMorale ?? 'steady'
  if (goblinCasualties > 0) {
    goblinMorale = goblinCasualties >= 2 || goblinMorale === 'shaken' ? 'broken' : 'shaken'
    beats.push('goblin-morale-hit')
    signals.push(goblinMorale === 'broken'
      ? 'Les gobelins encore debout cherchent une sortie.'
      : 'Les gobelins ont vu que le sang peut tourner.'
    )
  }
  if (sparedGoblin && goblinMorale === 'steady') {
    goblinMorale = 'shaken'
  }

  return {
    ...previous,
    madeNoise,
    insultedMac,
    foundRecipeHalfCount,
    sparedGoblin,
    tension: clamp(tension, 0, 6),
    alertLevel: clamp(alertLevel, 0, 5),
    macDisposition,
    goblinMorale,
    patrolPressure,
    lastDirectorBeats: beats,
    lastWorldSignals: signals,
    updatedAt: new Date().toISOString(),
  }
}

function attackOutcome(entry: CombatLogEntry): {
  actor: string
  target: string
  hit: boolean
  critical: boolean
  killed: boolean
  downed: boolean
} | null {
  const match = entry.action.match(/^(.+?) attaque (.+?) avec /i)
  if (!match) return null

  const detail = entry.mechanicalDetail ?? ''
  return {
    actor: match[1],
    target: match[2],
    hit: /->\s*(TOUCHE|CRITIQUE)/i.test(detail),
    critical: /->\s*CRITIQUE/i.test(detail),
    killed: /\|\s*MORT/i.test(detail),
    downed: /\|\s*A TERRE/i.test(detail),
  }
}

function buildMoveNarrative(gameState: GameState): string {
  const position = gameState.player.position
  const name = roomName(gameState)
  const tail = worldPressureTail(gameState)
  if (gameState.currentRoomId) {
    return `Tu gagnes ${name}, case ${position.x},${position.y}. Le decor se replace autour de toi, assez net pour choisir ton prochain risque.${tail}`
  }

  return `Tu te deplaces vers la case ${position.x},${position.y}. Hors des salles balisees, le batiment garde ses distances et la prochaine decision doit te ramener vers un lieu clair.${tail}`
}

function buildAttackNarrative(gameState: GameState, entries: CombatLogEntry[]): string | null {
  const attacks = entries.map(attackOutcome).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  if (attacks.length === 0) return null

  const playerAttack = attacks.find(entry => isPlayerActorName(entry.actor))
  const enemyAttacks = attacks.filter(entry => entry !== playerAttack)
  const alive = countAliveMonsters(gameState)
  const first = playerAttack ?? attacks[0]

  const opener = first.critical
    ? `Tu trouves une ouverture brutale sur ${first.target}.`
    : first.hit
      ? `Ton attaque accroche ${first.target}.`
      : `Ton attaque force ${first.target} a reculer, mais ne mord pas assez.`

  const outcome = first.killed
    ? ` ${first.target} tombe net; il reste ${alive} menace${alive > 1 ? 's' : ''} debout.`
    : first.downed
      ? ` ${first.target} vacille au bord du noir.`
      : first.hit
        ? ` Il reste dans la melee, plus prudent qu'avant.`
        : ` L'echange reste ouvert.`

  const riposte = enemyAttacks.length > 0
    ? ` La riposte part aussitot: ${enemyAttacks.map(entry => entry.hit ? `${entry.actor} touche` : `${entry.actor} rate`).join(', ')}.`
    : ''

  const turnHint = gameState.phase === 'combat' && gameState.currentTurn === 'player'
    ? ' A toi de reprendre le tempo.'
    : gameState.phase === 'combat'
      ? ' Le tour continue de tourner.'
      : ''
  const moraleHint = gameState.sceneMemory?.goblinMorale === 'broken' && alive > 0
    ? ' Les survivants regardent deja les issues.'
    : ''

  return `${opener}${outcome}${riposte}${moraleHint}${turnHint}${worldPressureTail(gameState)}`
}

function buildEncounterNarrative(gameState: GameState): string {
  const alive = Object.values(gameState.monsters).filter(monster => monster.isAlive)
  const names = alive.slice(0, 3).map(monster => monster.name).join(', ')
  return `La scene bascule: ${names || 'des adversaires'} surgissent dans ${roomName(gameState)}. L'initiative claque, et ton premier geste peut encore definir le combat.${worldPressureTail(gameState)}`
}

function buildEndCombatNarrative(gameState: GameState): string {
  if (gameState.player.deathSaves?.dead) {
    return 'Le combat retombe dans un silence dur. Ton aventure se ferme ici, au moins pour cette tentative.'
  }

  if (gameState.player.hp.current <= 0) {
    return "Le combat s'arrete, mais pas comme une victoire: tu restes au sol, stable peut-etre, vulnerable surement."
  }

  return `Le combat cesse dans ${roomName(gameState)}. Tu respires encore, et la piece garde les traces de ce que tu viens de changer.${worldPressureTail(gameState)}`
}

function buildAbilityNarrative(entries: CombatLogEntry[]): string | null {
  const detail = [...entries].reverse().find(entry => entry.mechanicalDetail)?.mechanicalDetail
  if (!detail) return null

  if (/SUCCES/i.test(detail)) {
    return `Le jet tranche en ta faveur: ${detail}. La scene t'accorde une vraie ouverture.`
  }

  if (/ECHEC/i.test(detail)) {
    return `Le jet ne suffit pas: ${detail}. La situation ne se ferme pas totalement, mais elle devient plus couteuse.`
  }

  return `Le jet fixe l'incertitude: ${detail}.`
}

function buildLocalNarrative(input: DirectorInput): string | null {
  const tools = unique(input.toolsUsed)
  const { actionIntent, gameState, newCombatLogEntries } = input

  if (tools.includes('start_encounter')) return buildEncounterNarrative(gameState)
  if (tools.includes('end_combat') && gameState.phase !== 'combat') return buildEndCombatNarrative(gameState)
  if (tools.includes('resolve_player_attack') || tools.includes('resolve_player_action') || tools.includes('resolve_attack')) {
    return buildAttackNarrative(gameState, newCombatLogEntries)
  }
  if (tools.includes('move_token')) return buildMoveNarrative(gameState)
  if (tools.includes('use_healing_potion')) {
    return `La potion rallume tes forces: tu remontes a ${gameState.player.hp.current}/${gameState.player.hp.max} PV. Ce n'est pas du confort, mais c'est assez pour agir.`
  }
  if (tools.includes('roll_death_save')) {
    const detail = [...newCombatLogEntries].reverse().find(entry => entry.mechanicalDetail)?.mechanicalDetail
    return detail ? `Au bord du noir, le destin repond: ${detail}.` : null
  }
  if (tools.includes('pass_turn')) {
    return gameState.phase === 'combat'
      ? "Tu gardes ton souffle et laisses filer ton ouverture. La melee se deplace d'un cran."
      : `Tu prends une seconde dans ${roomName(gameState)}. Rien ne t'arrete, mais rien ne t'attend longtemps.`
  }
  if (tools.includes('roll_ability_check') && actionIntent.kind !== 'social') {
    return buildAbilityNarrative(newCombatLogEntries)
  }

  return null
}

function shouldUseLlmNarrator(input: DirectorInput, localNarrative: string | null): { value: boolean; reason: string } {
  if (localNarrative) return { value: false, reason: 'director-local-narrative' }
  if (input.toolsUsed.length === 0) return { value: true, reason: 'no-engine-mutation' }
  if (input.actionIntent.kind === 'social') return { value: true, reason: 'social-scene' }
  if (input.actionIntent.kind === 'interact') return { value: true, reason: 'fictional-object-interaction' }

  const allToolsLocal = unique(input.toolsUsed).every(toolName => LOCAL_NARRATION_TOOLS.has(toolName))
  if (allToolsLocal) return { value: false, reason: 'all-tools-local-safe' }

  return { value: true, reason: 'complex-tool-result' }
}

export function buildDirectorDecision(input: DirectorInput): DirectorDecision {
  const sceneMemory = updateSceneMemory(input)
  const gameStateWithMemory = {
    ...input.gameState,
    sceneMemory,
  }
  const narrative = buildLocalNarrative({
    ...input,
    gameState: gameStateWithMemory,
  })
  const llm = shouldUseLlmNarrator(input, narrative)
  const beats = sceneMemory.lastDirectorBeats ?? []

  return {
    narrative,
    shouldUseLlmNarrator: llm.value,
    reason: llm.reason,
    beats,
    sceneMemory,
  }
}
