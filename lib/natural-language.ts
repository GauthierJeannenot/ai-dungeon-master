import { isDoorTraversalIntent, normalizeFrenchText } from './dm-intent'

export const FRENCH_LOCATION_STOPWORDS = new Set([
  'aller',
  'alors',
  'avec',
  'dans',
  'dire',
  'dirige',
  'diriger',
  'elle',
  'elles',
  'faire',
  'faut',
  'irais',
  'irai',
  'leur',
  'lui',
  'mais',
  'mon',
  'nous',
  'pour',
  'puis',
  'que',
  'quoi',
  'suis',
  'tres',
  'vers',
  'vais',
  'voir',
])

const MOVEMENT_VERB_PATTERNS = [
  'deplaces?',
  'deplacer',
  'avances?',
  'avancer',
  'bouges?',
  'bouger',
  'aller',
  'vers',
  'pars?',
  'partir',
  'entres?',
  'entrer',
  'rentres?',
  'rentrer',
  'retournes?',
  'retourner',
  'rejoins?',
  'rejoindre',
  'retrouves?',
  'retrouver',
  'rends',
  'traverses?',
  'approches?',
  'sors?',
  'sorts?',
  'sortir',
  'quittes?',
  'quitter',
  'explores?',
  'explorer',
  'aventures?',
  'aventurer',
  'continues?',
  'continuer',
  'plus loin',
  'montes?',
  'monter',
  'grimpes?',
  'grimpe',
  'empruntes?',
  'prends',
  'fuis',
  'fuite',
  'recules?',
  'glisses?',
  'glisser',
]

const NAMED_ROUTE_EXTRA_VERB_PATTERNS = [
  'vais',
  'va',
  'rejoint',
  'suis',
  'suivre',
  'continue',
  'aventure',
  'ouvres?',
  'ouvrir',
  'pousses?',
  'pousser',
  'forces?',
  'forcer',
  'enfonces?',
  'enfoncer',
  'defonces?',
  'defoncer',
  'detruis',
  'detruire',
  'casses?',
  'casser',
  'exploses?',
  'exploser',
  'deboites?',
  'deboiter',
  'franchis',
  'franchir',
  'passes?',
  'passer',
  'investig\\w*',
  'inspect\\w*',
  'examin\\w*',
  'fouill\\w*',
  'cherch\\w*',
  'trouv\\w*',
  'denich\\w*',
  'traqu\\w*',
  'pist\\w*',
]

const DESTINATION_PREPOSITION_PATTERNS = [
  'vers',
  'au',
  'aux',
  'a la',
  'a l',
  'dans',
  'voir',
  'rejoindre',
  'retrouver',
  'retourner',
]

const MOVEMENT_TARGET_VERB_PATTERNS = [
  'vais',
  'va',
  'aller',
  'dirige',
  'diriger',
  'pars',
  'partir',
]

const DESTINATION_CUE_PATTERNS = [
  'salle',
  'piece',
  'bureau',
  'appartement',
  'boulangerie',
  'quai',
  'verger',
  'mac',
  'treant',
  'pommier',
  'dryades?',
  'druidesse',
  'fees?',
  'soeur',
  'demoiselles',
  'etage',
  'haut',
  'escalier',
  'four',
  'fours?',
  'odeur',
  'bruit',
  'cuisine',
  'reserve',
  'reserves',
  'portes?',
  'entree',
  'seuil',
  'battants?',
  'batiment',
  'interieur',
  'dedans',
  'dehors',
  'exterieur',
  'sortie',
]

const SPECIFIC_EXPLORATION_CUE_PATTERNS = [
  'odeur',
  'fumet',
  'origine',
  'bruit',
  'son',
  'voix',
  'chant',
  'fours?',
  'fournee',
  'cuisine',
  'reserve',
  'reserves',
  'escalier',
  'etage',
  'haut',
  'bas',
  'bureau',
  'appartement',
  'quai',
  'chargement',
  'verger',
  'pommier',
  'dryades?',
  'druidesse',
  'fees?',
  'soeur',
  'demoiselles',
  'dechets?',
  'champignons?',
  'dehors',
  'exterieur',
  'sortie',
  'gauche',
  'droite',
  'grammy',
  'grukk',
  'mac',
  'treant',
  'porte',
  'portes?',
  'seuil',
  'battants?',
]

const VAGUE_EXPLORATION_PATTERNS = [
  'change de piece',
  'changer de piece',
  'changes? de piece',
  'explores? encore',
  'explorer encore',
  'continue',
  'continuer',
  "j explore",
  "j'explore",
  'explores?',
  'explorer',
  'j avance',
  'avances?',
  'avancer',
  'plus loin',
  'je cherche une autre salle',
  'autre piece',
  'autre salle',
]

const EXIT_CURRENT_ROOM_VERB_PATTERNS = ['sors?', 'sorts?', 'sortir', 'quittes?', 'quitter']

const COORDINATE_PATTERN = /\(?\s*\d{1,2}\s*[,;]\s*\d{1,2}\s*\)?/

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildFrenchWordRegex(patterns: readonly string[], flags = ''): RegExp {
  return new RegExp(`\\b(?:${patterns.join('|')})\\b`, flags)
}

function hasFrenchWordPattern(normalizedText: string, patterns: readonly string[]): boolean {
  return buildFrenchWordRegex(patterns).test(normalizedText)
}

export function frenchLocationTokens(value: string): string[] {
  return normalizeFrenchText(value)
    .split(/[^a-z0-9']+/)
    .map(part => part.replace(/^j'/, '').replace(/^l'/, ''))
    .filter(part => part.length >= 3 && !FRENCH_LOCATION_STOPWORDS.has(part))
}

export function hasMovementVerb(normalizedText: string): boolean {
  return hasFrenchWordPattern(normalizedText, MOVEMENT_VERB_PATTERNS)
}

export function hasNamedRouteMovementVerb(normalizedText: string): boolean {
  return hasFrenchWordPattern(normalizedText, [...MOVEMENT_VERB_PATTERNS, ...NAMED_ROUTE_EXTRA_VERB_PATTERNS])
}

export function hasDestinationCue(normalizedText: string): boolean {
  return hasFrenchWordPattern(normalizedText, DESTINATION_CUE_PATTERNS)
}

export function hasGoToMovementIntent(normalizedText: string): boolean {
  const targetPatterns = [...DESTINATION_PREPOSITION_PATTERNS, ...DESTINATION_CUE_PATTERNS]
  return new RegExp(`\\b(vais|va)\\b(?=.{0,80}\\b(?:${targetPatterns.join('|')})\\b)`).test(normalizedText)
}

export function isVagueExplorationMoveText(normalizedText: string): boolean {
  return hasFrenchWordPattern(normalizedText, VAGUE_EXPLORATION_PATTERNS)
}

export function hasSpecificExplorationCue(normalizedText: string): boolean {
  return isDoorTraversalIntent(normalizedText) ||
    COORDINATE_PATTERN.test(normalizedText) ||
    hasFrenchWordPattern(normalizedText, SPECIFIC_EXPLORATION_CUE_PATTERNS)
}

export function isExitCurrentRoomIntent(normalizedText: string): boolean {
  return hasFrenchWordPattern(normalizedText, EXIT_CURRENT_ROOM_VERB_PATTERNS)
}

export function aliasLooksLikeDestinationTarget(normalizedText: string, alias: string): boolean {
  const escaped = escapeRegExp(alias)
  return new RegExp(`\\b(?:${DESTINATION_PREPOSITION_PATTERNS.join('|')})\\b.{0,50}\\b${escaped}\\b`).test(normalizedText) ||
    new RegExp(`\\b(?:${MOVEMENT_TARGET_VERB_PATTERNS.join('|')})\\b.{0,80}\\b${escaped}\\b`).test(normalizedText)
}
