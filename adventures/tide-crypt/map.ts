import type {
  AdventureRoom,
  AdventureMapData,
  EncounterDefinition,
  AdventureNpcSpec,
  AdventureTransition,
  GridCell,
} from '../../lib/adventure-map'

// ─────────────────────────────────────────────────────────────────────────────
// « La Crypte des Marées » — données de carte du module.
//
// ⚠️ PAS ENCORE BRANCHÉ AU MOTEUR. Le moteur MCP et la route DM sont câblés sur
// Grammy's (lib/adventure-map.ts) tant que l'architecture multi-modules n'est
// pas en place — voir docs/multi-adventure-architecture.md pour le plan de
// câblage. Ce fichier utilise exactement les mêmes formes de données que
// lib/adventure-map.ts : le refactor consistera à les servir via un registre au
// lieu d'imports statiques.
//
// Grille : 17 colonnes (x:0-16) × 15 rangées (y:0-14) — mêmes bornes que
// MAP_BOUNDS du moteur (mcp-server/rules.ts).
// Types de monstres : uniquement des types existants du moteur
// (wolf, bandit, skeleton, zombie, hobgoblin_captain) avec reskin par `name`.
// ─────────────────────────────────────────────────────────────────────────────

export const TIDE_CRYPT_ID = 'tide-crypt'

// Position initiale du joueur : la grève, près de Maël le gardien de phare.
export const TIDE_CRYPT_START_CELL: GridCell = { x: 4, y: 13 }

export const TIDE_CRYPT_ROOMS: AdventureRoom[] = [
  { id: '1', name: 'La Grève aux Épaves', zone: { minX: 2, maxX: 16, minY: 12, maxY: 14 } },
  { id: '2', name: 'Le Phare Éteint', zone: { minX: 13, maxX: 15, minY: 8, maxY: 11 } },
  { id: '3', name: "L'Épave de la Sirène", zone: { minX: 2, maxX: 4, minY: 9, maxY: 11 } },
  { id: '4', name: 'Le Passage des Marées', zone: { minX: 7, maxX: 10, minY: 9, maxY: 11 } },
  { id: '5', name: "L'Antichambre Engloutie", zone: { minX: 6, maxX: 11, minY: 6, maxY: 8 } },
  { id: '6', name: "L'Ossuaire des Marins", zone: { minX: 2, maxX: 5, minY: 3, maxY: 7 } },
  { id: '7', name: 'La Salle des Cloches', zone: { minX: 12, maxX: 15, minY: 3, maxY: 6 } },
  { id: '8', name: 'La Chapelle de la Gardienne', zone: { minX: 6, maxX: 11, minY: 1, maxY: 5 } },
]

// Points d'entrée par salle (cibles move_token du DM).
export const TIDE_CRYPT_ENTRY_CELLS: Record<string, GridCell> = {
  '1': { x: 4, y: 13 },
  '2': { x: 14, y: 11 },
  '3': { x: 3, y: 11 },
  '4': { x: 8, y: 11 },
  '5': { x: 8, y: 8 },
  '6': { x: 5, y: 5 },
  '7': { x: 12, y: 4 },
  '8': { x: 8, y: 5 },
}

export const TIDE_CRYPT_ENCOUNTERS: Record<string, EncounterDefinition> = {
  wreck_wolves: {
    id: 'wreck_wolves',
    roomId: '3',
    name: "Loups des dunes de l'épave",
    playerCell: { x: 3, y: 10 },
    monsters: [
      { monsterType: 'wolf', cell: { x: 2, y: 9 }, name: 'Loup des dunes' },
      { monsterType: 'wolf', cell: { x: 4, y: 9 }, name: 'Loup des dunes' },
    ],
  },
  lighthouse_looters: {
    id: 'lighthouse_looters',
    roomId: '2',
    name: "Pilleurs d'épaves du phare",
    playerCell: { x: 14, y: 10 },
    monsters: [
      { monsterType: 'bandit', cell: { x: 13, y: 9 }, name: "Pilleur d'épaves" },
      { monsterType: 'bandit', cell: { x: 15, y: 9 }, name: "Pilleur d'épaves" },
    ],
  },
  drowned_antechamber: {
    id: 'drowned_antechamber',
    roomId: '5',
    name: "Les Noyés de l'antichambre",
    playerCell: { x: 8, y: 7 },
    monsters: [
      { monsterType: 'zombie', cell: { x: 7, y: 6 }, name: 'Noyé' },
      { monsterType: 'skeleton', cell: { x: 10, y: 7 }, name: 'Marin squelette' },
    ],
  },
  ossuary_awakening: {
    id: 'ossuary_awakening',
    roomId: '6',
    name: "Réveil de l'ossuaire",
    playerCell: { x: 4, y: 5 },
    monsters: [
      { monsterType: 'skeleton', cell: { x: 3, y: 4 }, name: 'Marin squelette' },
      { monsterType: 'skeleton', cell: { x: 2, y: 5 }, name: 'Marin squelette' },
      { monsterType: 'skeleton', cell: { x: 3, y: 6 }, name: 'Marin squelette' },
    ],
  },
  bells_misring: {
    id: 'bells_misring',
    roomId: '7',
    name: 'Fausse note des cloches',
    playerCell: { x: 13, y: 4 },
    monsters: [
      { monsterType: 'skeleton', cell: { x: 14, y: 3 }, name: 'Sonneur squelette' },
      { monsterType: 'skeleton', cell: { x: 15, y: 5 }, name: 'Sonneur squelette' },
    ],
  },
  guardian_chapel: {
    id: 'guardian_chapel',
    roomId: '8',
    name: 'Le Gardien Noyé',
    playerCell: { x: 8, y: 4 },
    monsters: [
      // hobgoblin_captain (52 HP de base) retaillé pour un héros niveau 2 seul.
      { monsterType: 'hobgoblin_captain', cell: { x: 8, y: 2 }, name: 'Le Gardien Noyé', hpOverride: 33 },
      { monsterType: 'zombie', cell: { x: 10, y: 2 }, name: 'Noyé de la chapelle' },
    ],
  },
}

// PNJ scénarisés, rendus par leur token sur la battlemap.
export const TIDE_CRYPT_NPCS: AdventureNpcSpec[] = [
  {
    id: 'mael',
    name: 'Maël',
    kind: 'hermit',
    roomId: '1',
    cell: { x: 12, y: 13 },
    disposition: 'neutral',
    visibleFromStart: true,
    description: 'Vieux gardien du phare éteint, bourru et rongé par la culpabilité.',
  },
  {
    id: 'guardian_echo',
    name: 'Écho de la Gardienne',
    kind: 'ghost',
    roomId: '8',
    cell: { x: 7, y: 1 },
    disposition: 'wary',
    visibleFromStart: false,
    description: "Silhouette d'eau et de lumière — le souvenir de Morgane, première Gardienne des Marées.",
  },
]

export const TIDE_CRYPT_NAMED_LOCATION_CELLS: Array<{ id: string; pattern: RegExp; cell: GridCell }> = [
  { id: 'mael', pattern: /\b(mael|maël|gardien du phare|vieux gardien|ermite)\b/, cell: { x: 12, y: 13 } },
]

export const TIDE_CRYPT_ROOM_NAVIGATION_ALIASES: Array<{ roomId: string; pattern: RegExp }> = [
  { roomId: '2', pattern: /\b(phare|tour|lanterne du phare)\b/ },
  { roomId: '3', pattern: /\b(epave|épave|sirene|sirène|carcasse|navire|bateau)\b/ },
  { roomId: '4', pattern: /\b(passage|chaussee|chaussée|marees?|marées?|gue|gué)\b/ },
  { roomId: '5', pattern: /\b(antichambre|salle engloutie|entree de la crypte|entrée de la crypte)\b/ },
  { roomId: '6', pattern: /\b(ossuaire|niches?|ossements|tombes? des marins)\b/ },
  { roomId: '7', pattern: /\b(cloches?|carillon|salle des cloches)\b/ },
  { roomId: '8', pattern: /\b(chapelle|gardienne|tombeau|autel)\b/ },
  { roomId: '1', pattern: /\b(greve|grève|plage|dehors|exterieur|extérieur|sortie|sable)\b/ },
]

export const TIDE_CRYPT_DOOR_TRANSITIONS: AdventureTransition[] = [
  { fromRoomId: '1', toRoomId: '4' },
  { fromRoomId: '1', toRoomId: '2', pattern: /\b(phare|tour)\b/ },
  { fromRoomId: '1', toRoomId: '3', pattern: /\b(epave|épave|navire|bateau)\b/ },
  { fromRoomId: '4', toRoomId: '5' },
  { fromRoomId: '5', toRoomId: '6', pattern: /\b(ossuaire|gauche|ouest|niches?)\b/ },
  { fromRoomId: '5', toRoomId: '7', pattern: /\b(cloches?|droite|est)\b/ },
  { fromRoomId: '5', toRoomId: '8' },
  { fromRoomId: '5', toRoomId: '4', pattern: /\b(sortie|remonte|retour|arriere|arrière)\b/ },
]

export const TIDE_CRYPT_FORWARD_TRANSITIONS: AdventureTransition[] = [
  { fromRoomId: '1', toRoomId: '4' },
  { fromRoomId: '4', toRoomId: '5' },
  { fromRoomId: '5', toRoomId: '8' },
]

// Accroches mécaniques par salle, injectées dans le prompt dynamique du DM.
export const TIDE_CRYPT_ROOM_HOOKS: Record<string, string> = {
  '1': [
    'Maël le gardien de phare a son token visible en (12,13) : bourru mais inoffensif.',
    'DD 12 Persuasion (roll_ability_check) → Maël raconte la Gardienne, la crypte sous la chaussée, et donne le rythme des cloches : « deux coups graves, un aigu ».',
    "DD 13 Perception (roll_ability_check) sur la laisse de mer → médaillon de la Gardienne à moitié ensablé (offrande idéale pour l'Écho, salle 8).",
    'La marée remonte : chaque aller-retour complet grève ↔ crypte, rappeler que le passage (salle 4) se resserre.',
  ].join('\n'),
  '2': [
    "Deux pilleurs d'épaves campent à l'étage du phare : start_encounter(\"lighthouse_looters\") s'ils repèrent le joueur (DD 13 Discrétion pour les éviter, roll_ability_check).",
    'Négociation possible DD 13 CHA : ils vendent ce qu\'ils ont volé (dont la clé de la lanterne) pour 15 po ou un service.',
    'Le journal de Morgane est dans le bureau du rez : mécanisme de la lanterne = il faut la Flamme de la Gardienne (salle 8) pour rallumer le phare.',
  ].join('\n'),
  '3': [
    'Deux loups des dunes nichent dans la carcasse : start_encounter("wreck_wolves") si on fouille la cale sans précaution (DD 12 Discrétion pour éviter, roll_ability_check).',
    'Cale : DD 13 Perception → coffre de bord (22 po, 30 pa) et une potion de soin.',
  ].join('\n'),
  '4': [
    "La chaussée n'est découverte qu'à marée basse. Si le joueur traîne ou revient plus tard : DD 12 Athlétisme (roll_ability_check) pour traverser sans être happé ; échec → resolve_saving_throw(con, DD 12), raté = 1d6 dégâts de contusion et retour à la grève.",
    "L'escalier noyé descend vers l'antichambre (salle 5) : trigger_room_event enter en le descendant.",
  ].join('\n'),
  '5': [
    'Eau jusqu\'aux genoux, un Noyé et un Marin squelette en garde : start_encounter("drowned_antechamber") dès que le joueur dépasse le milieu de salle sans discrétion (DD 13, roll_ability_check).',
    'Vague de reflux quand on ouvre la porte de la chapelle sans avoir sonné les cloches : resolve_saving_throw(str, DD 12), raté = projeté + 1d4 dégâts.',
    'DD 12 Perception → fresque : « deux marées pleines, une brève » (indice de la séquence des cloches).',
  ].join('\n'),
  '6': [
    'Niches funéraires des marins. Fouiller les niches SANS respect (DD 11 Religion pour faire les gestes rituels, roll_ability_check) → start_encounter("ossuary_awakening").',
    "Trésor rituel : DD 13 Perception → l'anneau du second (15 po) et le MÉDAILLON DE LA GARDIENNE s'il n'a pas été trouvé sur la grève.",
    'Les squelettes réveillés se rendorment si le joueur repose les ossements et réussit DD 13 Religion (combat évitable).',
  ].join('\n'),
  '7': [
    'Trois cloches vert-de-gris : sonner « grave, grave, aigu » (indice de Maël ou fresque salle 5) → la porte de la chapelle se déverrouille SANS combat et les noyés de la crypte se figent (trigger_room_event custom).',
    'Mauvaise séquence → start_encounter("bells_misring") : deux sonneurs squelettes tombent des poutres.',
    'DD 14 Investigation (roll_ability_check) → retrouver la séquence gravée sous la corrosion sans indice préalable.',
  ].join('\n'),
  '8': [
    'SALLE FINALE. Le Gardien Noyé (capitaine mort-vivant) + un Noyé : start_encounter("guardian_chapel") si le joueur approche de la Lanterne sans médiation.',
    "L'Écho de la Gardienne est présente mais CACHÉE : offrande du médaillon OU DD 13 Religion/Persuasion (roll_ability_check) → reveal_npc({ kind: \"ghost\" }) — peut accompagner le jet du même message.",
    "Avec l'Écho révélée : DD 13 CHA pour convaincre le Gardien de rendre la Flamme (combat évitable, il s'incline et s'effondre en écume).",
    'La LANTERNE DE LA GARDIENNE (objectif) est sur l\'autel : la prendre après le combat OU après la médiation. La Flamme rallume le phare (finale chez Maël).',
  ].join('\n'),
}

export function describeTideCryptRoomHooks(roomId: string | null | undefined): string | null {
  if (!roomId) return null
  const room = TIDE_CRYPT_ROOMS.find(candidate => candidate.id === roomId)
  const hooks = TIDE_CRYPT_ROOM_HOOKS[roomId]
  if (!room || !hooks) return null
  return `Salle ${room.id} — ${room.name}\n${hooks}`
}

// Agrégat consommé par le registre lib/adventure-map.ts (getAdventureMap).
// La crypte n'a pas d'alias de contexte dédiés → roomContextAliases vide (le
// moteur retombe alors sur roomNavigationAliases).
export const TIDE_CRYPT_MAP: AdventureMapData = {
  // Aventure 1-map : toutes les salles vivent sur la map unique (mapId implicite).
  maps: [{ id: 'shore', name: 'La grève et la crypte', grid: { cols: 17, rows: 15 } }],
  mapQuests: {},
  mapTransitions: [],
  startCell: TIDE_CRYPT_START_CELL,
  // Niveau 2 (guerrier N2 = 28 PV). Kit de classe + une potion supplémentaire
  // propre au module.
  initialPlayer: {
    level: 2,
    extraInventory: [
      { id: 'potion2', name: 'Potion de soin', type: 'potion', description: 'Restaure 2d4+2 HP' },
    ],
  },
  rooms: TIDE_CRYPT_ROOMS,
  entryCells: TIDE_CRYPT_ENTRY_CELLS,
  encounters: TIDE_CRYPT_ENCOUNTERS,
  npcs: TIDE_CRYPT_NPCS,
  namedLocationCells: TIDE_CRYPT_NAMED_LOCATION_CELLS,
  roomNavigationAliases: TIDE_CRYPT_ROOM_NAVIGATION_ALIASES,
  roomContextAliases: [],
  doorTransitions: TIDE_CRYPT_DOOR_TRANSITIONS,
  forwardTransitions: TIDE_CRYPT_FORWARD_TRANSITIONS,
  roomHooks: TIDE_CRYPT_ROOM_HOOKS,
}
