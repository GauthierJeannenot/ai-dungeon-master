import { ADVENTURE_ROOMS, findAdventureRoomIdByAlias } from '@/lib/adventure-map'
import { normalizeFrenchText } from '@/lib/dm-intent'
import { buildSceneSurface } from '@/lib/scene-surface'
import type { EngineEvent, GameState, MonsterState, WorldState } from '@/lib/types'
import type { GameActionIntent, GameActionKind } from '@/lib/game-actions'

export interface NarrativeIntentInterpreterTurn {
  output?: { clarificationQuestion?: string | null } | null
}

export interface OralNarrativeGuardOptions {
  maxSentences: number
  maxChars: number
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function mcpErrorCode(result: unknown): string | null {
  return isObjectRecord(result) && typeof result.code === 'string'
    ? result.code
    : null
}

function aliveMonsters(gameState: GameState): MonsterState[] {
  return Object.values(gameState.monsters).filter(monster => monster.isAlive)
}

function countAliveMonsters(gameState: GameState): number {
  return Object.values(gameState.monsters).filter(monster => monster.isAlive).length
}

export function buildMcpRuleErrorNarrative(errorResult: unknown, gameState: GameState, toolsUsed: string[] = []): string {
  const code = mcpErrorCode(errorResult)
  const roomName = getCurrentRoomName(gameState)
  const detail = isObjectRecord(errorResult) && isObjectRecord(errorResult.detail) ? errorResult.detail : {}
  const concreteAffordances = () => buildSceneSurface(gameState).affordances
    .filter(affordance => affordance.enabled)
    .map(affordance => affordance.target?.name ?? affordance.label)
    .filter(Boolean)
    .slice(0, 4)

  if (code === 'ACTION_ALREADY_USED') {
    if (gameState.phase === 'combat') {
      return gameState.currentTurn === 'player'
        ? "Ton elan arrive trop tard: ton action est deja depensee. Une nouvelle ouverture revient, mais il faut choisir un geste net."
        : "Ton elan arrive trop tard: ton action est deja depensee. Les adversaires reprennent l'initiative dans la cohue."
    }
    return "Ton geste arrive trop tard: l'ouverture que tu visais s'est deja refermee."
  }

  if (code === 'ROOM_EVENT_LOCATION_MISMATCH' && toolsUsed.includes('move_token')) {
    return roomName
      ? `Tu arrives dans ${roomName}. Le decor reagit mal a ton irruption, mais rien de plus ne se declenche encore.`
      : "Tu avances. Le decor reagit mal a ton irruption, mais rien de plus ne se declenche encore."
  }

  if (code === 'TURN_ACTION_REQUIRED') {
    return "Pas encore: il te reste une vraie action a poser avant de laisser filer ton tour."
  }

  if (code === 'ACTION_NOT_AFFORDED') {
    if (gameState.player.hp.current <= 0 || gameState.player.conditions.includes('unconscious')) {
      return buildPlayerDownNarrative(gameState)
    }
    const options = concreteAffordances()
    return options.length > 0
      ? `L'etat moteur ne valide pas cette action maintenant. Les prises concretes ici sont: ${options.join(', ')}.`
      : "L'etat moteur ne valide pas cette action maintenant. Donne l'effet voulu, et je le rattache a une action ou une improvisation persistante."
  }

  if (code === 'WORLD_OBJECT_AMBIGUOUS') {
    const candidates = Array.isArray(detail.candidates)
      ? detail.candidates
          .map(candidate => isObjectRecord(candidate) && typeof candidate.name === 'string' ? candidate.name : null)
          .filter((name): name is string => Boolean(name))
      : []
    return candidates.length > 0
      ? `Il y a plusieurs cibles possibles ici: ${candidates.slice(0, 4).join(', ')}. Dis laquelle tu vises, et je resous le geste.`
      : "Il y a plusieurs cibles possibles ici. Precise laquelle tu vises, et je resous le geste."
  }

  if (code === 'WORLD_OBJECT_NOT_AFFORDED') {
    const surface = buildSceneSurface(gameState)
    const visibleTargets = surface.objects
      .filter(object => object.actionKinds.length > 0)
      .map(object => object.name)
      .slice(0, 4)
    return visibleTargets.length > 0
      ? `La cible n'est pas claire dans la scene actuelle. Tu peux viser ${visibleTargets.join(', ')}.`
      : "Je ne vois pas de cible manipulable ici pour ce geste. Donne un objet concret ou change d'approche."
  }

  if (code === 'NOT_CURRENT_TURN' || code === 'PLAYER_TURN_REQUIRED') {
    return "Pas maintenant: le rythme du combat ne te laisse pas cette ouverture."
  }

  if (code === 'CELL_OCCUPIED') {
    return "Tu t'elances, mais la place est deja prise; il faut trouver une autre ligne ou bousculer la situation."
  }

  if (code === 'MOVE_TOO_FAR' || code === 'OUT_OF_BOUNDS') {
    return "Tu cherches l'angle, mais ce mouvement est trop court ou trop risque pour aboutir maintenant."
  }

  if (isObjectRecord(errorResult) && typeof errorResult.error === 'string') {
    const options = concreteAffordances()
    return options.length > 0
      ? `Cette action est refusee par l'etat actuel. Tu peux plutot t'appuyer sur: ${options.join(', ')}.`
      : "Cette action est refusee par l'etat actuel; il me faut une cible ou un effet plus exploitable pour la resoudre."
  }

  return "Cette action n'a pas abouti dans l'etat actuel; je garde le monde en place au lieu d'inventer une consequence."
}

export type OralNarrativeGuardResult = {
  narrative: string
  changed: boolean
  fallbackUsed: boolean
  reasons: string[]
  removedLineCount: number
  originalLength: number
  finalLength: number
}

export function getCurrentRoomName(gameState: GameState): string | null {
  return ADVENTURE_ROOMS.find(room => room.id === gameState.currentRoomId)?.name ?? null
}

export function buildDirectiveSceneNarrative(gameState: GameState): string {
  if (gameState.phase === 'combat') {
    if (gameState.player.hp.current <= 0) {
      return buildPlayerDownNarrative(gameState)
    }

    const alive = aliveMonsters(gameState)
    const aliveNames = Array.from(new Set(alive.map(monster => monster.name)))
    const threatVerb = alive.length <= 1 ? 'tient' : 'tiennent'
    const pressureVerb = alive.length <= 1 ? 'garde' : 'gardent'
    const namedThreats = alive.length > aliveNames.length
      ? `${alive.length} adversaires, dont ${aliveNames.join(', ')}`
      : alive.length === 0
      ? "le danger"
      : aliveNames.length === 1
        ? aliveNames[0]
        : `${aliveNames.slice(0, -1).join(', ')} et ${aliveNames[aliveNames.length - 1]}`
    const lastKill = [...gameState.combatLog].reverse().find(entry =>
      /\bMORT\b/.test(entry.mechanicalDetail ?? '') &&
      /\battaque\b/i.test(entry.action)
    )
    const killedName = lastKill?.action.match(/attaque (.+?) avec/i)?.[1]
    const killSentence = killedName ? `${killedName} tombe pour de bon. ` : ''

    return gameState.currentTurn === 'player'
      ? `${killSentence}Le combat ne lache pas: ${namedThreats} ${threatVerb} encore la salle, mais une ouverture se dessine dans la cohue.`
      : `${killSentence}Le combat ne lache pas: ${namedThreats} ${pressureVerb} la pression, et chaque pas compte.`
    return gameState.currentTurn === 'player'
      ? "Le combat se resserre autour de toi. L'ennemi le plus proche baisse sa garde une fraction de seconde, tandis qu'une échappée s'ouvre près du décor."
      : "Le combat continue sans pause. Quelque chose heurte le sol derrière toi, et l'air se charge d'une menace immédiate."
  }

  const surface = buildSceneSurface(gameState)
  const roomName = surface.currentRoom?.name ?? getCurrentRoomName(gameState) ?? 'la zone actuelle'
  const latestEvent = [...(gameState.world?.eventLog ?? [])].reverse().find(event => event.visibleToPlayer && event.summary?.trim())
  if (latestEvent) {
    return `${latestEvent.summary} Depuis ${roomName}, choisis une cible ou un effet concret et je le resous proprement.`
  }

  const npc = surface.npcs.find(entry => entry.known)
  if (npc) {
    return `${npc.name} est toujours la, disposition ${npc.disposition}; tes mots ou tes gestes peuvent vraiment changer la suite.`
  }

  const affordance = surface.affordances.find(entry => entry.enabled && entry.target?.name)
  if (affordance?.target?.name) {
    return `Dans ${roomName}, la prise la plus nette reste ${affordance.target.name}; nomme l'action ou l'effet voulu et je l'applique sans inventer.`
  }

  const exit = surface.exits[0]
  if (exit) {
    return `Depuis ${roomName}, ${exit.name} reste accessible; donne-moi l'approche exacte et je fais avancer la position.`
  }

  return `Dans ${roomName}, rien ne change encore: precise une cible, une parole, ou un effet improvise, et je le traite comme un fait de jeu.`

}

export function buildOralFallbackNarrative(gameState: GameState, toolsUsed: string[]): string {
  const roomName = getCurrentRoomName(gameState)

  if (gameState.phase === 'combat' && gameState.player.hp.current <= 0) {
    return buildPlayerDownNarrative(gameState)
  }

  if (toolsUsed.includes('start_encounter')) {
    return buildDirectiveSceneNarrative(gameState)
  }

  if (toolsUsed.includes('move_token')) {
    return roomName
      ? `Tu arrives dans ${roomName}; un detail exploitable accroche aussitot ton attention.`
      : "Tu avances; le decor change assez pour t'offrir une prise claire."
  }

  if (gameState.phase === 'combat') {
    return gameState.currentTurn === 'player'
      ? "Le combat se resserre autour de toi; l'ouverture est à toi."
      : "Le combat continue dans une tension brutale."
  }

  const options = buildSceneSurface(gameState).affordances
    .filter(affordance => affordance.enabled)
    .map(affordance => affordance.target?.name ?? affordance.label)
    .filter(Boolean)
    .slice(0, 4)
  return options.length > 0
    ? `Aucun effet net ne se produit encore. Les prises concretes ici sont: ${options.join(', ')}.`
    : "Aucun effet net ne se produit encore; precise la cible ou l'effet voulu."
}

export function looksLikeGenericSceneFallback(text: string): boolean {
  const normalized = normalizeFrenchText(text)
  return [
    /\bla piece gronde\b/,
    /\bla scene (?:avance|progresse)\b/,
    /\bun detail concret\b/,
    /\bla facade de la boulangerie grince\b/,
    /\bdans le verger, les branches se referment\b/,
    /\bau quai de chargement, la porte laterale\b/,
    /\bau sol de la boulangerie, les fours claquent\b/,
    /\bdans l'appartement de grammy, l'odeur\b/,
    /\bla piste se brouille\b/,
  ].some(pattern => pattern.test(normalized))
}

export function buildContextualNoFallbackNarrative(
  gameState: GameState,
  actionIntent: GameActionIntent,
  intentInterpreter?: NarrativeIntentInterpreterTurn
): string {
  const clarification = intentInterpreter?.output?.clarificationQuestion
  if (clarification) return clarification

  const surface = buildSceneSurface(gameState)
  const npc = surface.npcs[0]
  if (npc && ['talk', 'ask', 'persuade', 'threaten', 'social'].includes(actionIntent.kind)) {
    return `${npc.name} te fixe et attend quelque chose de plus net: une question, une offre, une menace, ou un objet a montrer.`
  }

  const enabledAffordances = surface.affordances
    .filter(affordance => affordance.enabled)
    .map(affordance => affordance.target?.name ?? affordance.label)
    .filter(Boolean)
    .slice(0, 4)
  if (enabledAffordances.length > 0) {
    return `Je comprends l'intention, mais il me manque une cible nette. Ici, les prises claires sont: ${enabledAffordances.join(', ')}.`
  }

  return "Je comprends l'intention, mais je ne veux pas inventer une consequence sans fait moteur. Precise la cible ou l'effet voulu, et je le resous proprement."
}

const SOCIAL_ACTION_KINDS = new Set<GameActionKind>([
  'talk',
  'ask',
  'persuade',
  'threaten',
  'show_item',
  'give_item',
  'social',
])

const SOCIAL_EVENT_TYPES = new Set<EngineEvent['type']>([
  'npc.disposition_changed',
  'npc.information_revealed',
  'item.shown',
  'item.given',
  'alarm.raised',
  'action.blocked',
])

export function isSocialNarrationContext(
  actionIntent: GameActionIntent,
  toolsUsed: string[],
  newWorldEvents: EngineEvent[] = []
): boolean {
  return SOCIAL_ACTION_KINDS.has(actionIntent.kind) ||
    toolsUsed.some(toolName => /^world\.(talk|ask|persuade|threaten|show_item|give_item)$/.test(toolName)) ||
    newWorldEvents.some(event => SOCIAL_EVENT_TYPES.has(event.type))
}

function visibleNpcInCurrentRoom(gameState: GameState): WorldState['npcs'][string] | null {
  if (!gameState.currentRoomId || !gameState.world?.npcs) return null
  const npcs = Object.values(gameState.world.npcs)
    .filter(npc => npc.roomId === gameState.currentRoomId)
  return npcs.length === 1 ? npcs[0] : null
}

function npcForSocialEvent(gameState: GameState, event: EngineEvent | undefined): WorldState['npcs'][string] | null {
  const targetId = typeof event?.targetId === 'string' ? event.targetId : null
  if (targetId && gameState.world?.npcs?.[targetId]) return gameState.world.npcs[targetId]
  return visibleNpcInCurrentRoom(gameState)
}

export function buildSocialFallbackNarrative(
  gameState: GameState,
  actionIntent: GameActionIntent,
  toolsUsed: string[],
  newWorldEvents: EngineEvent[] = []
): string | null {
  if (!isSocialNarrationContext(actionIntent, toolsUsed, newWorldEvents)) return null

  const latestSocialEvent = [...newWorldEvents].reverse().find(event => SOCIAL_EVENT_TYPES.has(event.type))
  if (latestSocialEvent?.summary) {
    const followUp = latestSocialEvent.type === 'npc.information_revealed'
      ? "Tu as maintenant une piste exploitable."
      : latestSocialEvent.type === 'npc.disposition_changed'
        ? "L'echange reste ouvert, mais son attitude a vraiment change."
        : latestSocialEvent.type === 'alarm.raised'
          ? "La tension monte aussitot autour de vous."
          : "La conversation garde une prise concrete."
    return `${latestSocialEvent.summary} ${followUp}`
  }

  const npc = npcForSocialEvent(gameState, latestSocialEvent)
  if (npc) {
    return `${npc.name} reste face a toi, assez proche pour que tes mots comptent. Pose ta question, formule ta demande, ou change d'approche.`
  }

  return "La conversation ne trouve pas encore d'interlocuteur clair. Nomme la personne a qui tu parles, et je garde l'echange dans la scene."
}

function splitIntoSentences(text: string): string[] {
  const sentences: string[] = []
  let start = 0
  let index = 0
  let inQuote = false

  while (index < text.length) {
    const char = text[index]
    if (char === '"' || char === '«' || char === '“') {
      inQuote = char === '"' ? !inQuote : true
      index++
      continue
    }

    if (char === '»' || char === '”') {
      inQuote = false
      index++
      continue
    }

    if (!'.!?'.includes(char)) {
      index++
      continue
    }

    let end = index + 1
    while (end < text.length && '.!?'.includes(text[end])) end++
    let closesQuote = false
    while (end < text.length && /["»”]/.test(text[end])) {
      closesQuote = true
      end++
    }
    if (inQuote && !closesQuote) {
      index = end
      continue
    }
    if (closesQuote) inQuote = false

    const whitespaceMatch = text.slice(end).match(/^\s+/)
    const nextIndex = end + (whitespaceMatch?.[0].length ?? 0)
    const nextChar = text[nextIndex]
    const startsNewSentence = !nextChar || /["'«“A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/.test(nextChar)

    if (startsNewSentence) {
      const sentence = text.slice(start, end).trim()
      if (sentence) sentences.push(sentence)
      start = nextIndex
      index = nextIndex
      continue
    }

    index = end
  }

  const tail = text.slice(start).trim()
  if (tail) sentences.push(tail)
  return sentences
}

export function trimIncompleteTrailingSentence(text: string): { text: string; changed: boolean } {
  const trimmed = text.trim()
  if (!trimmed) return { text: '', changed: text !== '' }
  if (/[.!?…]["'»”]?$/.test(trimmed)) return { text: trimmed, changed: trimmed !== text }

  for (let index = trimmed.length - 1; index >= 0; index--) {
    if (!'.!?…'.includes(trimmed[index])) continue

    let end = index + 1
    while (end < trimmed.length && /["'»”]/.test(trimmed[end])) end++
    const complete = trimmed.slice(0, end).trim()
    return { text: complete, changed: complete !== trimmed }
  }

  return { text: '', changed: true }
}

function lineLooksLikeMetaCommentary(line: string): boolean {
  const normalized = normalizeFrenchText(line)
  if (!normalized) return false

  const containsPositionCoordinates = /\(\s*\d{1,2}\s*,\s*\d{1,2}\s*\)/.test(line) &&
    /\b(actuellement|position|coordonnees?|salle|tu es)\b/.test(normalized)
  if (containsPositionCoordinates) return true

  if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) return true

  return [
    /\b(debug|moteur|mcp|tool|tools|outil|llm|prompt|systeme|etat moteur|contrat)\b/,
    /\b(action mecanique|resultats? mecaniques?|mutation de l'etat|etat attendu|dernier message du joueur)\b/,
    /\b(je comprends le systeme|en attente de ton action|tu as entierement raison|tu as raison|vous avez raison)\b/,
    /\b(tu es actuellement|tu es a\s+(?:en\s+)?salle\s+\d+|salle\s+\d+\s+[-:])\b/,
    /\b(excuse-moi|desole|erreur de ma part|j'aurais du|j aurais du|je vais corriger|merci de cette correction)\b/,
    /\b(je dois clarifier|non, ce message n'est pas|ce message n'est pas|on continue|laissez-moi recommencer|plus de substance)\b/,
    /\b(que fais-tu|que faites-vous|qu[' ]?allez-vous faire|qu[' ]?en est-il|ou veux-tu aller ensuite|vous allez ou|tu vas ou|ou allez-vous|qu[' ]?est-ce que tu fais|deplacement,\s*attaque|attaque,\s*test|roleplay pur)\b/,
    /\b(c'est ton tour|c est ton tour|c'est a toi|c est a toi|a toi de jouer|aucun ennemi visible|tu restes dans|quelque chose semble)\b|\bchoisis\s*:|\bchoisissez\s*:/,
    /\b(appeler\s+\w+|move_token|start_encounter|resolve_player_attack|pass_turn|roll_dice)\b/,
    /\b(fin de quete|fin de campagne|quete alternative|objectif accompli|mission accomplie)\b/,
    /\b(heures suivantes|jours suivants|semaines suivantes|premiere fournee|faire fortune)\b/,
  ].some(pattern => pattern.test(normalized))
}

function isMetaOnlyNarrative(text: string): boolean {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  return lines.length > 0 && lines.every(lineLooksLikeMetaCommentary)
}

function looksLikeEnglishDrift(fragment: string): boolean {
  const normalized = normalizeFrenchText(fragment)
  const englishMarkers = normalized.match(/\b(eyes|shine|genuine|really|guys|friend|quest|campaign|with|the|you|your)\b/g)
  return (englishMarkers?.length ?? 0) >= 2
}

function hasMixedSecondPersonAddress(fragment: string): boolean {
  const normalized = normalizeFrenchText(fragment)
  return /\b(tu|te|toi|ton|ta|tes)\b|t'/.test(normalized) &&
    /\b(vous|votre|vos)\b/.test(normalized)
}

function normalizeSecondPersonAddress(fragment: string): { text: string; changed: boolean } {
  if (!hasMixedSecondPersonAddress(fragment)) return { text: fragment, changed: false }

  let text = fragment
    .replace(/\b[Vv]otre\b/g, match => match[0] === 'V' ? 'Ton' : 'ton')
    .replace(/\b[Vv]os\b/g, match => match[0] === 'V' ? 'Tes' : 'tes')
    .replace(/\b[Vv]ous\b/g, match => match[0] === 'V' ? 'Tu' : 'tu')

  const verbFixes: Array<[RegExp, string]> = [
    [/\btu etes\b/gi, 'tu es'],
    [/\btu avez\b/gi, 'tu as'],
    [/\btu allez\b/gi, 'tu vas'],
    [/\btu faites\b/gi, 'tu fais'],
    [/\btu pouvez\b/gi, 'tu peux'],
    [/\btu voulez\b/gi, 'tu veux'],
    [/\btu voyez\b/gi, 'tu vois'],
    [/\btu entendez\b/gi, 'tu entends'],
    [/\btu sentez\b/gi, 'tu sens'],
    [/\btu devez\b/gi, 'tu dois'],
    [/\btu approchez\b/gi, 'tu approches'],
    [/\btu avancez\b/gi, 'tu avances'],
    [/\btu entrez\b/gi, 'tu entres'],
    [/\btu ouvrez\b/gi, 'tu ouvres'],
    [/\btu attaquez\b/gi, 'tu attaques'],
  ]
  for (const [pattern, replacement] of verbFixes) {
    text = text.replace(pattern, replacement)
  }

  return { text, changed: text !== fragment }
}

export function normalizeNarrativeForOralPlayback(
  narrative: string,
  gameState: GameState,
  toolsUsed: string[],
  options: OralNarrativeGuardOptions
): OralNarrativeGuardResult {
  const reasons = new Set<string>()
  const original = narrative.trim()

  let text = original
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, () => {
      reasons.add('code_block_removed')
      return ' '
    })

  const formattingCleaned = text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')

  if (formattingCleaned !== text) {
    reasons.add('markdown_removed')
    text = formattingCleaned
  }

  const withoutParentheticals = text.replace(/\s*\([^)]{0,180}\)/g, match => {
    reasons.add('parenthetical_removed')
    return /[.!?]\s*$/.test(match) ? '. ' : ' '
  })
  if (withoutParentheticals !== text) text = withoutParentheticals

  let removedLineCount = 0
  const keptLines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false
      if (!lineLooksLikeMetaCommentary(line)) return true

      removedLineCount++
      reasons.add('meta_line_removed')
      return false
    })

  text = keptLines
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([!?]){2,}/g, '$1')
    .trim()

  const secondPerson = normalizeSecondPersonAddress(text)
  if (secondPerson.changed) {
    text = secondPerson.text
    reasons.add('second_person_normalized')
  }

  let sentences = splitIntoSentences(text)
  const filteredSentences = sentences.filter(sentence => {
    if (!lineLooksLikeMetaCommentary(sentence) && !looksLikeEnglishDrift(sentence)) return true

    reasons.add(looksLikeEnglishDrift(sentence) ? 'non_french_sentence_removed' : 'meta_sentence_removed')
    return false
  })
  if (filteredSentences.length !== sentences.length) {
    text = filteredSentences.join(' ').trim()
    sentences = splitIntoSentences(text)
  }

  const completeText = trimIncompleteTrailingSentence(text)
  if (completeText.changed) {
    text = completeText.text
    sentences = splitIntoSentences(text)
    reasons.add('incomplete_tail_removed')
  }

  if (text.length > options.maxChars && sentences.length > options.maxSentences) {
    text = sentences.slice(0, options.maxSentences).join(' ')
    reasons.add('sentence_limit_applied')
  }

  let fallbackUsed = false
  if (!text || normalizeFrenchText(text).length < 12) {
    text = buildOralFallbackNarrative(gameState, toolsUsed)
    fallbackUsed = true
    reasons.add('fallback_used')
  }

  const finalNarrative = text.trim()
  return {
    narrative: finalNarrative,
    changed: finalNarrative !== original,
    fallbackUsed,
    reasons: [...reasons],
    removedLineCount,
    originalLength: original.length,
    finalLength: finalNarrative.length,
  }
}

export function buildPlayerDownNarrative(gameState: GameState): string {
  const deathSaves = gameState.player.deathSaves ?? { successes: 0, failures: 0 }

  if (deathSaves.dead) {
    return "Cette fois, oui: le dernier souffle quitte ta poitrine. Les gobelins reculent d'un pas, surpris par le silence soudain, et la boulangerie retombe dans une chaleur noire."
  }

  if (deathSaves.stable) {
    return "Tu n'es pas mort, mais tu ne peux plus agir: ta respiration s'accroche à un fil stable. Les gobelins te traînent hors du passage, persuadés que tu ne leur poseras plus de problème tout de suite."
  }

  const saveText = `${deathSaves.successes} succès, ${deathSaves.failures} échec${deathSaves.failures > 1 ? 's' : ''}`

  if (gameState.phase === 'combat' && gameState.currentTurn === 'player') {
    return `Tu n'es pas mort, mais tu es à zéro PV et inconscient: pas d'attaque, pas de parade, pas de mouvement héroïque. Là, ton seul vrai levier est le jet de mort; pour l'instant tu as ${saveText}.`
  }

  if (gameState.phase !== 'combat') {
    return `Tu es à zéro PV et hors combat pour l'instant: pas d'attaque, pas de parade, pas de mouvement héroïque. Ton corps tient encore, mais la suite appartient aux conséquences de la scène.`
  }

  return `Tu es à zéro PV et inconscient, donc tu ne peux pas agir pendant que l'initiative tourne encore. Dès que ton tour revient, le prochain vrai levier sera le jet de mort; pour l'instant tu as ${saveText}.`
}

export function buildQuestGuidanceNarrative(gameState: GameState): string {
  if (gameState.phase === 'combat') {
    return gameState.currentTurn === 'player'
      ? "Là, tout se joue dans les deux prochaines secondes: une ouverture apparaît sur le flanc de l'ennemi, mais elle ne restera pas longtemps."
      : "L'ennemi a l'initiative de l'instant. Le sol craque sous ses appuis, et tu sens venir le prochain mouvement."
  }

  switch (gameState.currentRoomId) {
    case '1':
      return "La mission reste simple dans son absurdité: retrouver la recette de Grammy. Mac bruisse au bord du chemin; le verger peut parler, mais la bâtisse garde la vraie prise."
    case '2':
      return "La dryade fait tourner une pomme entre ses doigts. \"La recette est coupée en deux, soldat: une moitié dort dans le bureau, l'autre dans l'appartement de Grammy. Et si tu veux éviter de tomber nez à nez avec les gobelins, le quai de chargement mord moins fort que l'entrée.\""
    case '4':
      return "Dans l'entrée, les traces gobelines filent vers les fours, mais les vrais papiers de Grammy ne sentent pas la farine: le bureau et l'appartement gardent de meilleurs secrets."
    case '5':
      return "Le bureau est exactement le genre d'endroit où Grammy aurait caché une moitié de recette. Un tiroir résiste sous les papiers, et la poussière autour de la poignée a été dérangée récemment."
    case '7':
      return "Le quai de chargement donne un angle discret sur le sol de la boulangerie. De là, tu peux entrer sans annoncer ta présence à tout ce qui traîne près des fours."
    case '8':
      return "Le sol de la boulangerie est le cœur dangereux du bâtiment. Les gobelins cherchent la même recette que toi, et les portes vers le bureau et l'appartement deviennent soudain beaucoup plus importantes."
    case '9':
      return "L'appartement de Grammy a tout d'une tanière occupée, mais c'est aussi là qu'une moitié de recette peut encore survivre. Quelqu'un a remué les affaires anciennes, récemment."
    default:
      return "La piste principale tient toujours: deux moitiés de recette, l'une côté papiers, l'autre côté appartement. Le bâtiment grince comme s'il n'aimait pas qu'on s'en souvienne."
  }
}

export function detectDryadInformationRequest(message: string, gameState: GameState): boolean {
  if (gameState.phase !== 'exploration' || gameState.currentRoomId !== '2') return false
  const text = normalizeFrenchText(message)
  const talksToDryads = /\b(dryades?|fees?|elles|vous|renseigne\w*|renseignement\w*|aide[rz]?|aider|parle|demande)\b/.test(text)
  const asksQuest = /\b(recette|tarte|grammy|chercher|trouver|ou aller|ou je vais|direction|renseignement\w*|info\w*|indice\w*|aide[rz]?|sauriez|savez)\b/.test(text)
  return talksToDryads && asksQuest
}

export function buildDryadInformationNarrative(): string {
  return "La dryade retient sa pomme pourrie juste avant de la lancer. \"D'accord, soldat: la recette de Grammy est en deux morceaux. La première moitié dort dans le bureau, sous la poussière; la seconde est dans l'appartement, là où les gobelins se prennent pour des rois. Passe par le quai de chargement si tu veux les surprendre.\""
}

export function detectDryadOffense(message: string, gameState: GameState): boolean {
  if (gameState.phase !== 'exploration' || gameState.currentRoomId !== '2') return false
  const text = normalizeFrenchText(message)
  const targetsDryads = /\b(dryades?|fees?|fées?|filles?|creatures?|elles|branche|branches)\b/.test(text)
  const hostileOrRude = /\b(attaque|attaquer|frappe|frapper|menace|menacer|intimide|intimider|insulte|insulter|crie|crier|hurle|hurler|provoque|provoquer|lance|jette|menacant|hostile)\b/.test(text)
  return targetsDryads && hostileOrRude
}

export function buildDryadOffenseNarrative(): string {
  return "La dryade visée disparaît derrière un rideau de feuilles avant que ton geste ne porte. Une pomme pourrie explose à tes pieds, puis deux autres sifflent depuis les branches; leurs rires ne sont plus joueurs du tout. Le verger entier semble se pencher vers toi."
}

export function buildDebugStateNarrative(gameState: GameState): string {
  const debugRoomName = getCurrentRoomName(gameState) ?? 'une zone non identifiee'
  const debugPosition = gameState.player.position
  const debugAlive = aliveMonsters(gameState)
  const activeText = debugAlive.length > 0
    ? `${debugAlive.length} ennemi${debugAlive.length > 1 ? 's' : ''} actif${debugAlive.length > 1 ? 's' : ''}: ${debugAlive.map(monster => `${monster.name} en x ${monster.position.x}, y ${monster.position.y}`).join('; ')}.`
    : "Aucun ennemi actif dans l'etat serveur."
  const turnText = gameState.phase === 'combat'
    ? `Combat round ${gameState.round}, tour: ${gameState.currentTurn ?? 'personne'}.`
    : `Phase: ${gameState.phase}.`
  return `Cote serveur, tu as ${gameState.player.hp.current}/${gameState.player.hp.max} PV et ton pion est dans ${debugRoomName}, case x ${debugPosition.x}, y ${debugPosition.y}. ${turnText} ${activeText} Si l'ecran montre autre chose, l'affichage client est en retard.`
  const roomName = getCurrentRoomName(gameState) ?? 'une zone non identifiée'
  const position = gameState.player.position
  const aliveCount = countAliveMonsters(gameState)
  const monsterText = aliveCount > 0
    ? `${aliveCount} ennemi${aliveCount > 1 ? 's' : ''} actif${aliveCount > 1 ? 's' : ''} existe${aliveCount > 1 ? 'nt' : ''} dans l'état de jeu.`
    : "Aucun ennemi actif n'existe dans l'état de jeu."

  return `Côté serveur, ton pion est dans ${roomName}, case x ${position.x}, y ${position.y}. ${monsterText} Si l'écran montre autre chose, l'affichage client est en retard.`
}

export function resolveLocationReconcileRoomId(message: string): string | null {
  return findAdventureRoomIdByAlias(normalizeFrenchText(message))
}

export function buildLocationReconcileNeedsTargetNarrative(): string {
  const roomNames = ADVENTURE_ROOMS.map(room => room.name).join(', ')
  return `Je peux te replacer, mais il me faut une salle claire: ${roomNames}.`
}

export function buildLocationReconcileSameRoomNarrative(gameState: GameState): string {
  const roomName = getCurrentRoomName(gameState) ?? 'la zone actuelle'
  const { x, y } = gameState.player.position
  return `Cote moteur, tu es deja dans ${roomName}, case x ${x}, y ${y}. Je garde cette position et je repars de la scene actuelle.`
}

export function buildLocationReconcileNarrative(gameState: GameState, targetRoomId: string): string {
  const targetRoomName = ADVENTURE_ROOMS.find(room => room.id === targetRoomId)?.name ?? 'la salle cible'
  const { x, y } = gameState.player.position
  return `Ok, je te replace dans ${targetRoomName}, case x ${x}, y ${y}. ${buildDirectiveSceneNarrative(gameState)}`
}
