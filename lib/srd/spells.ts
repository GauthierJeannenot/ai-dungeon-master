import type { EntityStats, Condition, DamageType } from '../types'
import { NARRATIVE_SPELLS } from './narrative-spells'

// ─────────────────────────────────────────────────────────────────────────────
// Registre SRD 5 : effets mécaniques fermés, conséquences narratives décrites
// par l'IA dans les limites du sort. Le moteur valide les coûts et les règles.
// Importable par le serveur MCP : rien d'app-only.
//
// Legacy profiles keep their original subset. SRD 2014 level-three/seven profiles
// resolve concentration, reactions, areas and rituals in hero-spells.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type SpellEffect =
  // Jet d'attaque magique vs CA (ex. rayon de givre).
  | { kind: 'attack_roll'; damage: string; damageType: DamageType }
  // La cible fait une sauvegarde ; dégâts pleins ou moitié (ex. mains brûlantes).
  | { kind: 'save'; ability: keyof EntityStats; damage: string; damageType: DamageType; halfOnSave: boolean;
      components?:Array<{damage:string;damageType:DamageType}> }
  // Touche automatique : projectile magique = '3d4+3' (3 dards agrégés, cible unique).
  | { kind: 'auto_hit'; damage: string; damageType: DamageType }
  // Soin (ex. soins). amount = notation, le mod d'aptitude est ajouté si +MOD présent.
  | { kind: 'heal'; amount: string }
  // Condition avec sauvegarde, résolue par le moteur des profils SRD 2014.
  | { kind: 'condition'; condition: Condition; ability: keyof EntityStats }
  // Sort UTILITAIRE sans résolution mécanique : le moteur débite le COÛT
  // (connaissance, action, emplacement) et le LLM narre dans les bornes de
  // srdNote. `fact` (optionnel) : trace mémorielle enregistrée par le moteur
  // dans GameState.worldFacts, injectée au prompt tant qu'elle vit.
  | { kind: 'utility'; srdNote: string; fact?: { text: string; expires: 'room' | 'map' } }
  // Free narrative consequence supplied by the AI; costs/location remain rules.
  | { kind: 'water'; srdNote: string }
  | { kind: 'teleport' }
  | { kind: 'restore'; conditions: Condition[] }
  | { kind: 'advanced'; mechanic: string }

export interface SpellSpec {
  id: string
  label: string
  level: 0 | 1 | 2 | 3 | 4 | 5
  rangeCells: number
  target: 'enemy' | 'self' | 'any' | 'object'
  effect: SpellEffect
  scalesWithLevel?: boolean
  upcast?: { dice: number; flat?: number }
  explorationOnly?: boolean
  materialName?: string
  materialConsumed?: boolean
  narrativeTarget?: 'self' | 'point' | 'creature'
}

const SPELLS: SpellSpec[] = [
  ...NARRATIVE_SPELLS,
  {id:'bestow-curse',label:'Malédiction',level:3,rangeCells:1,target:'any',effect:{kind:'advanced',mechanic:'bestow-curse'}},
  {id:'remove-curse',label:'Délivrance des malédictions',level:3,rangeCells:1,target:'any',effect:{kind:'advanced',mechanic:'remove-curse'}},
  // ── Tours de magie (niveau 0) ──────────────────────────────────────────────
  {
    id: 'ray-of-frost', label: 'Rayon de givre', level: 0, rangeCells: 12, target: 'enemy', scalesWithLevel: true,
    effect: { kind: 'attack_roll', damage: '1d8', damageType: 'cold' },
  },
  {
    id: 'sacred-flame', label: 'Flamme sacrée', level: 0, rangeCells: 12, target: 'enemy', scalesWithLevel: true,
    effect: { kind: 'save', ability: 'dex', damage: '1d8', damageType: 'radiant', halfOnSave: false },
  },
  {
    id: 'light', label: 'Lumière', level: 0, rangeCells: 1, target: 'object',
    effect: { kind: 'advanced', mechanic: 'light-object' },
  },
  {
    id: 'thaumaturgy', label: 'Thaumaturgie', level: 0, rangeCells: 6, target: 'any',
    effect: {
      kind: 'utility',
      srdNote: 'Menue manifestation de pouvoir divin : voix tonnante, tremblement bref, flammes qui vacillent — effet sensoriel, aucun dégât ni contrainte mécanique.',
    },
  },
  {
    id: 'vicious-mockery', label: 'Moquerie cruelle', level: 0, rangeCells: 12, target: 'enemy', scalesWithLevel: true,
    // The SRD-profile resolver also tracks disadvantage on the next attack.
    effect: { kind: 'save', ability: 'wis', damage: '1d4', damageType: 'psychic', halfOnSave: false },
  },
  {
    id: 'minor-illusion', label: 'Illusion mineure', level: 0, rangeCells: 6, target: 'any',
    effect: {
      kind: 'utility',
      srdNote: "Crée un SON ou l'IMAGE IMMOBILE d'un objet (cube de 1,5 m) pendant 1 min ; ni lumière, ni odeur, ni effet physique — le toucher ou une Investigation réussie la perce.",
      fact: { text: "Une illusion mineure (son ou image immobile, sort Illusion mineure) est en place dans la salle.", expires: 'room' },
    },
  },

  // ── Sorts de niveau 1 ───────────────────────────────────────────────────────
  {
    id: 'charm-person', label: 'Charme-personne', level: 1, rangeCells: 6, target: 'any',
    effect: { kind: 'condition', condition: 'charmed', ability: 'wis' },
  },
  {
    id: 'magic-missile', label: 'Projectile magique', level: 1, rangeCells: 24, target: 'enemy', upcast: { dice: 1, flat: 1 },
    effect: { kind: 'auto_hit', damage: '3d4+3', damageType: 'force' },
  },
  {
    id: 'burning-hands', label: 'Mains brûlantes', level: 1, rangeCells: 3, target: 'enemy', upcast: { dice: 1 },
    effect: { kind: 'save', ability: 'dex', damage: '3d6', damageType: 'fire', halfOnSave: true },
  },
  {
    id: 'cure-wounds', label: 'Soins', level: 1, rangeCells: 1, target: 'any', upcast: { dice: 1 },
    // +MOD signale au moteur d'ajouter le mod d'aptitude d'incantation.
    effect: { kind: 'heal', amount: '1d8+MOD' },
  },
  {
    id: 'guiding-bolt', label: 'Éclair traçant', level: 1, rangeCells: 24, target: 'enemy', upcast: { dice: 1 },
    // The SRD-profile resolver also grants the next attacker advantage.
    effect: { kind: 'attack_roll', damage: '4d6', damageType: 'radiant' },
  },
  {
    id: 'create-water', label: "Création d'eau", level: 1, rangeCells: 6, target: 'any',
    effect: {
      kind: 'water',
      srdNote: "Crée jusqu'à ~40 L d'eau propre dans un récipient ou en pluie sur un cube de 9 m, OU éteint des flammes sur un cube de 9 m. Pas de dégât, pas de noyade.",
    },
  },
  {
    id: 'healing-word', label: 'Mot de guérison', level: 1, rangeCells: 12, target: 'self', upcast: { dice: 1 },
    effect: { kind: 'heal', amount: '1d4+MOD' },
  },
  {
    id: 'thunderwave', label: 'Vague tonnante', level: 1, rangeCells: 3, target: 'enemy', upcast: { dice: 1 },
    // SRD : cube de 4,5 m autour du lanceur — simplification solo : une cible proche.
    effect: { kind: 'save', ability: 'con', damage: '2d8', damageType: 'thunder', halfOnSave: true },
  },
  {
    id: 'disguise-self', label: 'Déguisement', level: 1, rangeCells: 0, target: 'self',
    effect: {
      kind: 'utility',
      srdNote: "Change l'apparence du lanceur (visage, vêtements, ±30 cm de taille) pendant 1 h ; purement visuel — le toucher ou une Investigation réussie perce l'illusion.",
      fact: { text: "Le héros porte une apparence illusoire de son choix (sort Déguisement).", expires: 'map' },
    },
  },
  {
    id: 'speak-with-animals', label: 'Communication avec les animaux', level: 1, rangeCells: 0, target: 'self',
    effect: {
      kind: 'utility',
      srdNote: "Comprend les bêtes et se fait comprendre d'elles pendant 10 min ; leur savoir reste celui d'une bête, et leur attitude reste la leur (aucun contrôle).",
      fact: { text: 'Le héros comprend les animaux et peut leur parler (sort Communication avec les animaux).', expires: 'map' },
    },
  },
  { id: 'mage-hand', label: 'Main du mage', level: 0, rangeCells: 6, target: 'any',
    effect: { kind: 'utility', srdNote: 'Main spectrale, 1 minute, objet de 5 kg au plus ; aucune attaque ni activation magique. Les changements réels d’inventaire ou de porte exigent toujours leurs outils dédiés, la description seule ne les résout pas.' } },
  { id: 'mending', label: 'Réparation', level: 0, rangeCells: 0, target: 'self', explorationOnly: true,
    effect: { kind: 'utility', srdNote: 'Incantation de 1 minute : répare une cassure ou déchirure de 30 cm au plus d’un objet touché ; ne restitue aucune propriété magique et ne soigne pas une créature.' } },
  { id: 'comprehend-languages', label: 'Compréhension des langues', level: 1, rangeCells: 0, target: 'self',
    effect: { kind: 'utility', srdNote: 'Pendant 1 heure, comprend le sens littéral des langues entendues et des textes touchés ; ne parle pas les langues et ne déchiffre ni codes ni glyphes magiques.',
      fact: { text: 'Le héros comprend les langues entendues et les textes touchés, sans en obtenir la parole ni percer les codes.', expires: 'map' } } },
  { id: 'shatter', label: 'Fracassement', level: 2, rangeCells: 12, target: 'enemy', upcast: { dice: 1 },
    effect: { kind: 'save', ability: 'con', damage: '3d8', damageType: 'thunder', halfOnSave: true } },
  { id: 'gentle-repose', label: 'Préservation des morts', level: 2, rangeCells: 0, target: 'self',
    effect: { kind: 'utility', srdNote: 'Préserve un cadavre touché de la décomposition et empêche sa transformation en mort-vivant pendant 10 jours ; ne ressuscite pas et ne libère pas une âme. Les deux pièces sur les yeux doivent rester en place.',
      fact: { text: 'Les restes touchés ont reçu le rite de Préservation des morts ; ils ne sont ni ressuscités ni apaisés par ce seul sort.', expires: 'room' } } },
  { id: 'prayer-of-healing', label: 'Prière de guérison', level: 2, rangeCells: 0, target: 'self', explorationOnly: true, upcast: { dice: 1 },
    effect: { kind: 'heal', amount: '2d8+MOD' } },
  { id: 'lesser-restoration', label: 'Restauration partielle', level: 2, rangeCells: 0, target: 'self',
    effect: { kind: 'restore', conditions: ['blinded', 'deafened', 'paralyzed', 'poisoned'] } },
  { id: 'lightning-bolt', label: 'Éclair', level: 3, rangeCells: 20, target: 'enemy', upcast: { dice: 1 },
    effect: { kind: 'save', ability: 'dex', damage: '8d6', damageType: 'lightning', halfOnSave: true } },
  { id: 'tongues', label: 'Langues', level: 3, rangeCells: 0, target: 'self',
    effect: { kind: 'utility', srdNote: 'Pendant 1 heure, le héros comprend les langues parlées ; une créature qui connaît une langue comprend ce qu’il dit. N’accorde ni persuasion automatique ni lecture des pensées.',
      fact: { text: 'Le héros bénéficie de Langues : compréhension et communication orales, sans contrôle des interlocuteurs.', expires: 'map' } } },
  { id: 'speak-with-dead', label: 'Communication avec les morts', level: 3, rangeCells: 2, target: 'any',
    effect: { kind: 'utility', srdNote: 'Cinq questions en 10 minutes à un cadavre doté d’une bouche, pas à un mort-vivant ni à un esprit désincarné. Il ne connaît que ce qu’il savait vivant, peut être bref ou hostile et ne peut être réinterrogé par ce sort avant 10 jours. Pas de résurrection ni de savoir automatique sur une énigme.' } },
  { id: 'sending', label: 'Communication à distance', level: 3, rangeCells: 0, target: 'self',
    effect: { kind: 'utility', srdNote: 'Adresse 25 mots au plus à une créature familière ; elle peut répondre aussitôt avec autant de mots. Un autre plan comporte 5 % de risque d’échec. Aucun déplacement, effet coercitif ni sauvetage à distance. L’échange est narratif, pas un effet physique.' } },
  { id: 'dimension-door', label: 'Porte dimensionnelle', level: 4, rangeCells: 100, target: 'self', effect: { kind: 'teleport' } },
  { id: 'divination', label: 'Divination', level: 4, rangeCells: 0, target: 'self', materialName: 'Offrande de divination',
    effect: { kind: 'utility', srdNote: 'Offrande de 25 po consommée : une question sur un événement, objectif ou activité des 7 prochains jours. Réponse brève, parfois symbolique, sans prédire les circonstances futures nouvelles. Répétitions : 25 % de risque cumulatif de réponse aléatoire ; voir le résultat oracleReliable.',
      fact: { text: 'Une offrande a été consacrée pour demander une divination sur les sept prochains jours ; la question ne constitue pas un fait acquis.', expires: 'map' } } },
  {id:'acid-splash',label:'Aspersion acide',level:0,rangeCells:12,target:'enemy',scalesWithLevel:true,effect:{kind:'save',ability:'dex',damage:'1d6',damageType:'acid',halfOnSave:false}},
  {id:'fireball',label:'Boule de feu',level:3,rangeCells:30,target:'enemy',upcast:{dice:1},effect:{kind:'save',ability:'dex',damage:'8d6',damageType:'fire',halfOnSave:true}},
  {id:'detect-magic',label:'Détection de la magie',level:1,rangeCells:0,target:'self',effect:{kind:'utility',srdNote:'Pendant 10 minutes avec concentration, ressent la magie dans les 9 m. Une action permet de voir les auras des créatures/objets visibles et leur école éventuelle. Ne révèle pas les propriétés, les pièges non magiques ou une solution inconnue. Pierre de 30 cm, métal de 2,5 cm, plomb ou bois/terre de 90 cm bloquent.'}},
  {id:'identify',label:'Identification',level:1,rangeCells:1,target:'any',effect:{kind:'utility',srdNote:'Après 1 minute de contact avec un objet, apprend ses propriétés magiques, leur utilisation, l’harmonisation requise, charges et sorts actifs éventuels ; sur une créature touchée, identifie les sorts actifs. Ne révèle pas généralement une malédiction ou un secret historique. Perle de 100 po requise, non consommée.'}},
  ...([
    ['aid','Aide',2,6],['protection-from-poison','Protection contre le poison',2,1],['blindness-deafness','Cécité/Surdité',2,6],
    ['bless','Bénédiction',1,6],['spiritual-weapon','Arme spirituelle',2,12],['beacon-of-hope','Lueur d’espoir',3,6],
    ['revivify','Revivification',3,1],['death-ward','Protection contre la mort',4,1],['guardian-of-faith','Gardien de la foi',4,6],
    ['shield','Bouclier',1,0],['mage-armor','Armure du mage',1,1],['counterspell','Contresort',3,12],
    ['dispel-magic','Dissipation de la magie',3,24],['misty-step','Pas brumeux',2,6],['greater-invisibility','Invisibilité supérieure',4,1],
  ] as const).map(([id,label,level,rangeCells]):SpellSpec=>({id,label,level,rangeCells,target:'any',effect:{kind:'advanced',mechanic:id}})),
]

// Pure rules projection: cantrip scaling and explicit upcasting; no player text.
export function spellAtLevel(spell: SpellSpec, characterLevel: number, slotLevel: number,upcastDamageType?:'fire'|'radiant'): SpellSpec {
  const result = structuredClone(spell)
  const extra = Math.max(0, slotLevel - spell.level)
  const change = (notation: string) => notation.replace(/^(\d+)d(\d+)(.*)$/, (_s, n, sides, tail) => {
    const count = spell.scalesWithLevel ? Number(n) * (1 + [5, 11, 17].filter(l => characterLevel >= l).length)
      : Number(n) + (spell.upcast?.dice ?? 0) * extra
    const suffix = spell.upcast?.flat && extra ? `+${Number(tail || 0) + spell.upcast.flat * extra}` : tail
    return `${count}d${sides}${suffix}`
  })
  if ('damage' in result.effect) result.effect.damage = change(result.effect.damage)
  if(spell.id==='flame-strike'&&extra>0&&result.effect.kind==='save'){
    if(!upcastDamageType)throw new Error('Flame Strike requires an explicit fire or radiant upcast choice.')
    result.effect.components=result.effect.components!.map(c=>({...c,damage:c.damageType===upcastDamageType?`${4+extra}d6`:'4d6'}))
  }
  if (result.effect.kind === 'heal') result.effect.amount = change(result.effect.amount)
  return result
}

// Source PHB2014 / SRD5.1. Current player profiles gain no level5 slot or
// prepared spell: the bounded level5 scroll is the actual playable route.
SPELLS.push({id:'flame-strike',label:'Colonne de flamme',level:5,rangeCells:12,target:'enemy',effect:{kind:'save',ability:'dex',damage:'4d6',damageType:'fire',halfOnSave:true,
  components:[{damage:'4d6',damageType:'fire'},{damage:'4d6',damageType:'radiant'}]}})
const SPELLS_BY_ID = new Map(SPELLS.map(s => [s.id, s]))

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '')
}

export function getSpell(id: string): SpellSpec | undefined {
  return SPELLS_BY_ID.get(id)
}

export function isKnownSpellId(id: string): boolean {
  return SPELLS_BY_ID.has(id)
}

// Lookup of an explicit id/label. A sentence mentioning a spell is not a name.
export function resolveSpell(text: string | undefined | null): SpellSpec | undefined {
  if (!text) return undefined
  const key = normalize(text)
  const byId = SPELLS_BY_ID.get(key)
  if (byId) return byId
  const byLabel = SPELLS.find(s => normalize(s.label) === key)
  if (byLabel) return byLabel
  return undefined
}

export function listSpells(): SpellSpec[] {
  return SPELLS
}
