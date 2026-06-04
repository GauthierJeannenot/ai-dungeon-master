import type { GameState } from './types'
import {
  detectDebugStateQuestion,
  detectHealingPotionIntent,
  isDoorTraversalIntent,
  normalizeFrenchText,
  referencesLocalObjectInsteadOfRoom,
} from './dm-intent'

export type GameActionKind =
  | 'attack'
  | 'move'
  | 'interact'
  | 'search'
  | 'open'
  | 'take'
  | 'unlock'
  | 'force'
  | 'talk'
  | 'threaten'
  | 'hide'
  | 'help'
  | 'flee'
  | 'stabilize'
  | 'use_object'
  | 'use_item'
  | 'ability_check'
  | 'social'
  | 'wait'
  | 'death_save'
  | 'query_state'
  | 'guidance'
  | 'encounter'
  | 'observe'
  | 'unknown'

export type GameActionPrimitive =
  | 'resolve_attack'
  | 'move'
  | 'interact'
  | 'world_action'
  | 'use_item'
  | 'check'
  | 'wait'
  | 'query_state'
  | 'narrate'

export type GameActionConfidence = 'low' | 'medium' | 'high'

export interface GameActionIntent {
  kind: GameActionKind
  primitive: GameActionPrimitive
  reason: string
  requiresEngine: boolean
  suggestedTools: string[]
  confidence: GameActionConfidence
  normalizedText: string
}

const NO_TOOLS: string[] = []

function intent(
  normalizedText: string,
  fields: Omit<GameActionIntent, 'normalizedText'>
): GameActionIntent {
  return {
    normalizedText,
    ...fields,
  }
}

function aliveMonsterCount(gameState: GameState): number {
  return Object.values(gameState.monsters).filter(monster => monster.isAlive).length
}

function isPlayerAtZeroHp(gameState: GameState): boolean {
  return gameState.player.hp.current <= 0
}

function isPlayerDeathResolved(gameState: GameState): boolean {
  return Boolean(gameState.player.deathSaves?.stable || gameState.player.deathSaves?.dead)
}

export function isAnaphoricCombatAttackText(normalizedText: string): boolean {
  const attackContinuation = /\b(encore|continues?|continuer|vas[- ]y|go|allez|pareil|meme chose|recommence|retape|acheves?|achever|finis[- ]le|fini[- ]le|termine[- ]le|remets[- ]lui|refais[- ]ca)\b/.test(normalizedText)
  if (!attackContinuation) return false

  return !/\b(attends?|attendre|passe|passer|mort|pv|points? de vie|hp|etat|ou suis|regardes?|observer|observe|decris|quoi|pourquoi|comment)\b/.test(normalizedText)
}

export function detectDeathSaveIntent(message: string): boolean {
  const text = normalizeFrenchText(message)
  return /\b(jet de mort|jets de mort|sauvegarde contre la mort|death save|je tente|tente le jet|tenter le jet|je le fais|je lance|lance le|vas y|vas-y|continue|continuer|on attend|j'attends|j attends|attends|attendre|d'accord|d accord|ok)\b/.test(text)
}

export function detectPassTurnIntent(message: string, gameState: GameState): boolean {
  if (gameState.phase !== 'combat' || gameState.currentTurn !== 'player') return false
  const text = normalizeFrenchText(message)
  return /\b(passe|passer|attends?|attendre|patient|patiente|ne fais rien|reste sur place)\b/.test(text)
}

export function detectDirectiveGuidanceRequest(message: string): boolean {
  const text = normalizeFrenchText(message)
  return /\b(quoi maintenant|je fais quoi|on fait quoi|que faire|quoi faire|quelle suite|prochaine action|tu proposes quoi|tu me proposes quoi|guide moi|aide moi|je suis perdu|on est perdu|quelle direction|ou aller|ou je vais|par ou|donne moi une piste|je comprends pas|je comprends rien|comprends pas|comprends rien|pas compris|j'ai pas compris|j ai pas compris|j'y comprends rien|j y comprends rien|pas clair|objectif|c'est quoi le but|c est quoi le but|c'est quoi l'action|c est quoi l action)\b/.test(text)
}

export function classifyPlayerAction(message: string, gameState: GameState): GameActionIntent {
  const text = normalizeFrenchText(message)

  if (detectDebugStateQuestion(message)) {
    return intent(text, {
      kind: 'query_state',
      primitive: 'query_state',
      reason: 'debug-state-question',
      requiresEngine: false,
      suggestedTools: NO_TOOLS,
      confidence: 'high',
    })
  }

  if (
    isPlayerAtZeroHp(gameState) &&
    gameState.currentTurn === 'player' &&
    !isPlayerDeathResolved(gameState) &&
    detectDeathSaveIntent(message)
  ) {
    return intent(text, {
      kind: 'death_save',
      primitive: 'check',
      reason: 'player-death-save-intent',
      requiresEngine: true,
      suggestedTools: ['roll_death_save'],
      confidence: 'high',
    })
  }

  if (detectHealingPotionIntent(message)) {
    return intent(text, {
      kind: 'use_item',
      primitive: 'use_item',
      reason: 'healing-potion-intent',
      requiresEngine: true,
      suggestedTools: ['use_healing_potion'],
      confidence: 'high',
    })
  }

  if (detectDirectiveGuidanceRequest(message)) {
    return intent(text, {
      kind: 'guidance',
      primitive: 'narrate',
      reason: 'guidance-request',
      requiresEngine: false,
      suggestedTools: NO_TOOLS,
      confidence: 'high',
    })
  }

  const obviousAttackIntent = /\b(attaque|attaquer|frappe|frapper|tape|coup|assene|charge|tire|lance)\b/.test(text)
  const personalStatusQuestion =
    !obviousAttackIntent &&
    /\b(mort|pv|points? de vie|hp|etat|inconscient|je peux|peux[- ]?je|est[- ]ce que je|je suis|suis[- ]je)\b/.test(text) &&
    /\b(je|me|moi|mon|ma|mes|suis|peux|continue|continuer)\b/.test(text)

  if (personalStatusQuestion) {
    return intent(text, {
      kind: 'observe',
      primitive: 'narrate',
      reason: 'player-status-question',
      requiresEngine: false,
      suggestedTools: NO_TOOLS,
      confidence: 'high',
    })
  }

  if (detectPassTurnIntent(message, gameState)) {
    return intent(text, {
      kind: 'wait',
      primitive: 'wait',
      reason: 'player-pass-turn-intent',
      requiresEngine: true,
      suggestedTools: ['pass_turn'],
      confidence: 'high',
    })
  }

  const searchIntent = /\b(fouilles?|fouiller|cherches?|chercher|inspectes?|inspecter|examines?|examiner|regardes?|regarder)\b/.test(text) &&
    /\b(piece|salle|bureau|tiroirs?|coffres?|armoires?|placards?|etagere|recette|indices?|cachette|reserve|four|objets?)\b/.test(text)
  const unlockIntent = /\b(crochetes?|crocheter|deverrouilles?|deverrouiller|deverouille|serrure)\b/.test(text)
  const forceObjectIntent = /\b(forces?|forcer|enfonces?|enfoncer|defonces?|defoncer|casses?|casser)\b/.test(text) &&
    /\b(porte|tiroir|coffre|armoire|serrure|verrou)\b/.test(text)
  const openIntent = /\b(ouvres?|ouvrir|entrouvres?|soulever|souleves?)\b/.test(text) &&
    /\b(porte|tiroir|coffre|armoire|four|couvercle|placard)\b/.test(text)
  const takeWorldObjectIntent = /\b(prends?|prendre|ramasses?|ramasser|recuperes?|recuperer|empoches?|empocher|saisis|attrapes?|attraper)\b/.test(text) &&
    /\b(recette|fragment|moitie|indice|objet|papier|parchemin|cle|clef|potion|lettre)\b/.test(text)
  const talkIntent = /\b(parles?|parler|discutes?|discuter|demandes?|demander|questionnes?|questionner|adresses?|adresser)\b/.test(text) &&
    /\b(mac|pommier|treant|arbre|gobelins?|grukk|grammy|pnj|personne|lui|elle|eux|druidesse)\b/.test(text)
  const threatenIntent = /\b(menaces?|menacer|intimides?|intimider|pression|fais peur|soumet|soumission|rends toi|rendez vous)\b/.test(text)
  const hideIntent = /\b(caches?|cacher|planques?|planquer|discretion|furtif|furtivement)\b/.test(text)
  const fleeIntent = /\b(fuis|fuir|fuite|s enfuir|s'enfuir|retraite|bats en retraite|deguerpis)\b/.test(text)
  const helpIntent = /\b(aides?|aider|assistes?|assister|donnes? un coup de main)\b/.test(text)
  const stabilizeIntent = /\b(stabilises?|stabiliser|premiers secours|medecine|soignes?|soigner)\b/.test(text) &&
    /\b(moi|joueur|heros|allie|blesse|inconscient|agonisant)\b/.test(text)
  const useWorldObjectIntent = /\b(utilises?|utiliser|actives?|activer|touches?|toucher|manipules?|manipuler|declenches?|declencher)\b/.test(text) &&
    /\b(four|levier|piege|champignons?|objet|runes?|mecanisme)\b/.test(text)

  if (searchIntent) {
    return intent(text, {
      kind: 'search',
      primitive: 'world_action',
      reason: 'world-search-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'high',
    })
  }

  if (unlockIntent) {
    return intent(text, {
      kind: 'unlock',
      primitive: 'world_action',
      reason: 'world-unlock-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'high',
    })
  }

  if (forceObjectIntent) {
    return intent(text, {
      kind: 'force',
      primitive: 'world_action',
      reason: 'world-force-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'high',
    })
  }

  if (openIntent) {
    return intent(text, {
      kind: 'open',
      primitive: 'world_action',
      reason: 'world-open-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'high',
    })
  }

  if (takeWorldObjectIntent) {
    return intent(text, {
      kind: 'take',
      primitive: 'world_action',
      reason: 'world-take-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'high',
    })
  }

  if (threatenIntent) {
    return intent(text, {
      kind: 'threaten',
      primitive: 'world_action',
      reason: 'world-threaten-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'high',
    })
  }

  if (talkIntent) {
    return intent(text, {
      kind: 'talk',
      primitive: 'world_action',
      reason: 'world-talk-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'high',
    })
  }

  if (hideIntent) {
    return intent(text, {
      kind: 'hide',
      primitive: 'world_action',
      reason: 'world-hide-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'high',
    })
  }

  if (fleeIntent) {
    return intent(text, {
      kind: 'flee',
      primitive: 'world_action',
      reason: 'world-flee-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'high',
    })
  }

  if (stabilizeIntent) {
    return intent(text, {
      kind: 'stabilize',
      primitive: 'world_action',
      reason: 'world-stabilize-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'high',
    })
  }

  if (helpIntent) {
    return intent(text, {
      kind: 'help',
      primitive: 'world_action',
      reason: 'world-help-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'medium',
    })
  }

  if (useWorldObjectIntent) {
    return intent(text, {
      kind: 'use_object',
      primitive: 'world_action',
      reason: 'world-use-object-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_action'],
      confidence: 'high',
    })
  }

  const attackIntent = obviousAttackIntent
  const directMovementIntent = /\b(deplaces?|deplacer|avances?|avancer|bouges?|bouger|aller|vers|entres?|entrer|rentres?|retournes?|retourner|rejoins?|rejoindre|retrouves?|retrouver|rends|traverses?|approches?|explores?|explorer|aventures?|aventurer|continues?|continuer|plus loin|montes?|monter|grimpes?|grimpe|empruntes?|prends|fuis|fuite|recules?|glisses?|glisser)\b/.test(text)
  const doorMovementIntent = isDoorTraversalIntent(text)
  const goToMovementIntent = /\b(vais|va)\b(?=.{0,80}\b(vers|au|aux|a la|a l|dans|voir|parler|rejoindre|retrouver|retourner|salle|piece|bureau|appartement|boulangerie|quai|verger|pommier)\b)/.test(text)
  const coordinateMovementIntent =
    /\(?\s*\d{1,2}\s*[,;]\s*\d{1,2}\s*\)?/.test(text) &&
    /\b(va|vais|aller|deplaces?|deplacer|avances?|avancer|bouges?|bouger|marche|case|coordonnees?)\b/.test(text)
  const followIntent = /\b(suis|suivre|poursuis|poursuivre)\b/.test(text) && /\b(gobelins?|ennemis?|monstres?|creatures?|silhouettes?|eux|traces?)\b/.test(text)
  const searchEnemyIntent = /\b(cherches?|chercher|trouves?|trouver|deniches?|denicher|traques?|traquer|pistes?|pister)\b(?=.{0,80}\b(gobelins?|ennemis?|mechants?|monstres?|creatures?|silhouettes?)\b)/.test(text)
  const movementIntent = directMovementIntent || doorMovementIntent || goToMovementIntent || coordinateMovementIntent || followIntent || searchEnemyIntent
  const mentionsCreature = /\b(ennemis?|gobelins?|monstres?|creatures?|silhouettes?|eclaireurs?)\b/.test(text)
  const explicitEncounterIntent = /\b(combat|initiative|debarques?|perissez|fuyez)\b/.test(text)
  const hostileCreatureIntent = mentionsCreature && /\b(attaquent?|attaquer|hostiles?|menacent?|chargent?|surgissent?|arrivent?|debarquent?|foncent?|encerclent?)\b/.test(text)
  const encounterIntent = explicitEncounterIntent || hostileCreatureIntent
  const explicitSocialIntent = /\b(persuasion|intimidation|convain|convaincre|negoci|negocier|mentir|mensonge|baratin|intimider|soumet|soumission|reddition|rends toi|rendez vous|rejoignez|rejoins moi|parlemente|capitule)\b/.test(text)
  const conversationalSocialIntent =
    /\b(parles?|parler|discutes?|discuter|demandes?|demander|questionnes?|questionner|adresses?|adresser)\b/.test(text) &&
    /\b(mac|pommier|treant|arbre|gobelins?|grukk|grammy|pnj|personne|lui|elle|eux)\b/.test(text)
  const socialIntent = explicitSocialIntent || conversationalSocialIntent
  const abilityCheckIntent = socialIntent || /\b(test|jet|athletisme|athletics|perception|discretion|stealth|crocheter|fouiller|chercher|forcer|soulever|pousser)\b/.test(text)
  const localObjectIntent = /\b(ouvres?|ouvrir|fouilles?|fouiller|inspectes?|inspecter|examines?|examiner|tiroirs?|coffres?|armoires?|livres?|four|fours|rouleaux?|couteaux?|objets?|potions?)\b/.test(text) &&
    (referencesLocalObjectInsteadOfRoom(text) || /\b(four|fours|rouleaux?|couteaux?|objets? magiques?|potions?)\b/.test(text))
  const asksOnlyForDescription = /\b(observe|regarde|inspecte|ecoute|vois|voir|decris|decrit|quoi|qu'est-ce|est-ce tout)\b/.test(text)

  if (asksOnlyForDescription && !localObjectIntent && !/\b(deplace|attaque|frappe|combat|ouvres?|ouvrir|enfonces?|enfoncer|portes?|gobelins?|ennemis?|monstres?)\b/.test(text)) {
    return intent(text, {
      kind: 'observe',
      primitive: 'narrate',
      reason: 'scene-observation',
      requiresEngine: false,
      suggestedTools: NO_TOOLS,
      confidence: 'medium',
    })
  }

  const anaphoricCombatAttackIntent =
    gameState.phase === 'combat' &&
    gameState.currentTurn === 'player' &&
    aliveMonsterCount(gameState) > 0 &&
    isAnaphoricCombatAttackText(text)

  if (gameState.phase === 'combat' && gameState.currentTurn === 'player' && (attackIntent || anaphoricCombatAttackIntent)) {
    return intent(text, {
      kind: 'attack',
      primitive: 'resolve_attack',
      reason: 'player-combat-attack-intent',
      requiresEngine: true,
      suggestedTools: ['resolve_player_attack', 'move_token'],
      confidence: anaphoricCombatAttackIntent && !attackIntent ? 'medium' : 'high',
    })
  }

  if (gameState.phase === 'combat' && gameState.currentTurn === 'player' && movementIntent) {
    return intent(text, {
      kind: 'move',
      primitive: 'move',
      reason: 'player-combat-movement-intent',
      requiresEngine: true,
      suggestedTools: ['move_token', 'resolve_player_attack'],
      confidence: 'high',
    })
  }

  if (movementIntent) {
    return intent(text, {
      kind: 'move',
      primitive: 'move',
      reason: 'exploration-movement-intent',
      requiresEngine: true,
      suggestedTools: ['move_token', 'trigger_room_event', 'start_encounter'],
      confidence: 'high',
    })
  }

  if (localObjectIntent) {
    return intent(text, {
      kind: 'interact',
      primitive: 'interact',
      reason: 'local-object-interaction-intent',
      requiresEngine: true,
      suggestedTools: ['trigger_room_event', 'roll_ability_check', 'start_encounter'],
      confidence: 'high',
    })
  }

  if (abilityCheckIntent) {
    return intent(text, {
      kind: socialIntent ? 'social' : 'ability_check',
      primitive: 'check',
      reason: 'ability-check-intent',
      requiresEngine: true,
      suggestedTools: ['roll_ability_check'],
      confidence: socialIntent ? 'high' : 'medium',
    })
  }

  if (attackIntent || encounterIntent) {
    return intent(text, {
      kind: encounterIntent && !attackIntent ? 'encounter' : 'attack',
      primitive: attackIntent ? 'resolve_attack' : 'interact',
      reason: 'encounter-or-attack-intent',
      requiresEngine: true,
      suggestedTools: ['start_encounter', 'resolve_player_attack'],
      confidence: attackIntent ? 'high' : 'medium',
    })
  }

  return intent(text, {
    kind: 'unknown',
    primitive: 'narrate',
    reason: 'no-mechanical-intent',
    requiresEngine: false,
    suggestedTools: NO_TOOLS,
    confidence: 'low',
  })
}

export function describeGameActionLanguageForPrompt(): string {
  return [
    'Le joueur peut dire n importe quoi, mais le moteur ne connait qu un petit langage d actions.',
    'Primitives: attack, move, search, open, take, unlock, force, talk, threaten, hide, help, flee, stabilize, use_object, interact, use_item, ability_check, social, wait, death_save, query_state, observe.',
    'Quand le tool resolve_player_action est disponible, utilise-le comme facade canonique pour toute action joueur qui mute le monde.',
    'Ton role: traduire l intention vers une primitive autorisee, appeler le tool correspondant si un etat doit changer, puis narrer seulement les evenements renvoyes par le moteur.',
    'N invente jamais une nouvelle primitive ad hoc. Si l intention est creative, ramene-la a use_object, ability_check ou social avec une cible et un risque clairs.',
    'Si aucune primitive n est claire, clarifie en fiction au lieu de muter le state.',
  ].join('\n')
}
