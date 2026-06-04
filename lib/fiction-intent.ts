import { normalizeFrenchText } from './dm-intent'

export type FictionSignalCategory =
  | 'creative'
  | 'bodily_transgression'
  | 'defacement'
  | 'humiliation'
  | 'provocation'
  | 'disruption'

export type FictionSignalSeverity = 'minor' | 'moderate' | 'severe'

export interface FictionImprovisationAnalysis {
  normalizedText: string
  improvisable: boolean
  transgressive: boolean
  socialViolation: boolean
  disruptive: boolean
  severity: FictionSignalSeverity
  categories: FictionSignalCategory[]
  tags: string[]
}

type FictionSignalGroup = {
  category: FictionSignalCategory
  tag: string
  pattern: RegExp
  severity?: FictionSignalSeverity
  socialViolation?: boolean
  disruptive?: boolean
}

const FICTION_SIGNAL_GROUPS: FictionSignalGroup[] = [
  {
    category: 'creative',
    tag: 'creative_improvisation',
    pattern: /\b(crees?|creer|creation|invoques?|invoquer|conjures?|conjurer|fabriques?|fabriquer|bricoles?|bricoler|improvises?|improviser|inventes?|inventer|transformes?|transformer|arrache|arraches?|arracher|casses?|casser|detruis|detruire|renverses?|renverser|verses?|verser|repands?|repandre|mouilles?|mouiller|seches?|secher|enflammes?|enflammer|eteins?|eteindre|bloques?|bloquer|coinces?|coincer|barricades?|barricader|pieges?|pieger|attaches?|attacher|ligotes?|ligoter|creuses?|creuser)\b/,
  },
  {
    category: 'bodily_transgression',
    tag: 'bodily_transgression',
    pattern: /\b(pipi|faire pipi|fais pipi|pisses?|pisser|urines?|uriner|crache|craches?|cracher|vomis|vomir|gerbes?|gerber|chies?|chier|defeques?|defequer)\b/,
    severity: 'severe',
    socialViolation: true,
    disruptive: true,
  },
  {
    category: 'defacement',
    tag: 'defacement',
    pattern: /\b(salis|salir|souilles?|souiller|tagues?|taguer|barbouilles?|barbouiller|degrades?|degrader|defaces?|defacer|grave|graves?|graver)\b/,
    severity: 'moderate',
    socialViolation: true,
  },
  {
    category: 'humiliation',
    tag: 'humiliation',
    pattern: /\b(humilies?|humilier|ridiculises?|ridiculiser|insultes?|insulter|outrages?|outrager|profanes?|profaner|doigt d honneur|bras d honneur)\b/,
    severity: 'moderate',
    socialViolation: true,
  },
  {
    category: 'provocation',
    tag: 'provocation',
    pattern: /\b(provoques?|provoquer|nargues?|narguer|moques?|moquer|menaces?|menacer|intimides?|intimider)\b/,
    severity: 'moderate',
    socialViolation: true,
  },
  {
    category: 'disruption',
    tag: 'disruption',
    pattern: /\b(cries?|crier|hurles?|hurler|tapes?|taper|fracasses?|fracasser|claques?|claquer|fais du bruit|vacarme)\b/,
    severity: 'minor',
    disruptive: true,
  },
]

const CREATIVE_MATERIAL_PATTERN = /\b(eau|flotte|pluie|feu|fumee|huile|farine|corde|chaise|table|planche|jambe|sol|porte|mur|trou|tunnel|boue|verre|pierre|meuble|outil|arme|abri|barricade|piege|lumiere|ombre|odeur|bruit|sort|magie|illusion|creation d eau|create water)\b/
const CREATIVE_PURPOSE_PATTERN = /\b(pour|afin de|histoire de|comme ca|de facon a|de maniere a|servir de|en faire|faire glisser|ralentir|bloquer|distraire|couvrir|eteindre|mouiller|ouvrir|passer|franchir)\b/

function strongestSeverity(values: FictionSignalSeverity[]): FictionSignalSeverity {
  if (values.includes('severe')) return 'severe'
  if (values.includes('moderate')) return 'moderate'
  return 'minor'
}

export function analyzeFictionImprovisation(message: string): FictionImprovisationAnalysis {
  const normalizedText = normalizeFrenchText(message)
  const matchedGroups = FICTION_SIGNAL_GROUPS.filter(group => group.pattern.test(normalizedText))
  const categories = [...new Set(matchedGroups.map(group => group.category))]
  const tags = [...new Set(matchedGroups.map(group => group.tag))]
  const hasCreativeSignal = categories.includes('creative')
  const hasCreativeAnchor = CREATIVE_MATERIAL_PATTERN.test(normalizedText) || CREATIVE_PURPOSE_PATTERN.test(normalizedText)
  const transgressive = matchedGroups.some(group => group.socialViolation)
  const disruptive = matchedGroups.some(group => group.disruptive)
  const severity = strongestSeverity(matchedGroups.map(group => group.severity ?? 'minor'))

  return {
    normalizedText,
    improvisable: (hasCreativeSignal && hasCreativeAnchor) || transgressive || disruptive,
    transgressive,
    socialViolation: transgressive,
    disruptive,
    severity,
    categories,
    tags,
  }
}

export function detectFictionImprovisationIntent(message: string): boolean {
  return analyzeFictionImprovisation(message).improvisable
}
