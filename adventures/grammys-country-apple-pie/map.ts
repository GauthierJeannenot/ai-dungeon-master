import type { AdventureMapData, GridCell } from '../../lib/adventure-map'

// ─────────────────────────────────────────────────────────────────────────────
// « Grammy's Country Apple Pie » — données de carte du module (module par défaut).
//
// Déplacé depuis lib/adventure-map.ts lors du refactor multi-modules. Même forme
// que adventures/tide-crypt/map.ts : le registre lib/adventure-map.ts agrège les
// deux via getAdventureMap(adventureId).
//
// Grille : 17 colonnes (x:0-16) × 15 rangées (y:0-14) — MAP_BOUNDS du moteur.
// ─────────────────────────────────────────────────────────────────────────────

export const GRAMMYS_ID = 'grammys-country-apple-pie'

// Position initiale du joueur : chemin d'entrée, à côté de Mac le Tréant.
export const GRAMMYS_START_CELL: GridCell = { x: 4, y: 13 }

export const GRAMMYS_MAP: AdventureMapData = {
  // Aventure 1-map : toutes les salles vivent sur la map unique (mapId implicite).
  maps: [{ id: 'bakery', name: 'La boulangerie et ses abords', grid: { cols: 17, rows: 15 } }],
  mapQuests: {},
  mapTransitions: [],
  startCell: GRAMMYS_START_CELL,
  // Niveau 1. PV et kit viennent du personnage (guerrier N1 = 20 PV, kit épée
  // longue + bouclier + potion) : aucun objet propre à ce module.
  initialPlayer: {
    level: 1,
  },
  rooms: [
    { id: '1', name: 'Entrée extérieure', zone: { minX: 3, maxX: 16, minY: 13, maxY: 14 } },
    { id: '2', name: 'Verger de pommiers', zone: { minX: 3, maxX: 15, minY: 1, maxY: 2 } },
    { id: '3', name: 'Tas de déchets', zone: { minX: 12, maxX: 13, minY: 5, maxY: 7 } },
    { id: '4', name: "L'entrée", zone: { minX: 10, maxX: 13, minY: 9, maxY: 12 } },
    { id: '5', name: 'Le Bureau', zone: { minX: 5, maxX: 6, minY: 8, maxY: 11 } },
    { id: '7', name: 'Quai de chargement', zone: { minX: 3, maxX: 5, minY: 5, maxY: 7 } },
    { id: '8', name: 'Sol de la boulangerie', zone: { minX: 6, maxX: 11, minY: 5, maxY: 8 } },
    { id: '9', name: 'Appartement de Grammy', zone: { minX: 7, maxX: 9, minY: 8, maxY: 11 } },
  ],

  // Alignés sur les lignes « Point d'entrée » du module markdown (source de
  // vérité que le DM lit pour les déplacements).
  entryCells: {
    '1': { x: 4, y: 13 },
    '2': { x: 14, y: 2 },
    '3': { x: 13, y: 6 },
    '4': { x: 11, y: 12 },
    '5': { x: 6, y: 8 },
    '7': { x: 3, y: 6 },
    '8': { x: 11, y: 8 },
    '9': { x: 8, y: 9 },
  },

  encounters: {
    loading_dock_patrol: {
      id: 'loading_dock_patrol',
      roomId: '7',
      name: 'Patrouille du quai de chargement',
      playerCell: { x: 4, y: 6 },
      monsters: [
        { monsterType: 'goblin', cell: { x: 5, y: 5 }, name: 'Gobelin Patrouille' },
        { monsterType: 'goblin', cell: { x: 5, y: 6 }, name: 'Gobelin Patrouille' },
      ],
    },
    bakery_floor_goblins: {
      id: 'bakery_floor_goblins',
      roomId: '8',
      name: 'Gobelin Charpentier',
      playerCell: { x: 9, y: 6 },
      monsters: [
        { monsterType: 'goblin_minion', cell: { x: 10, y: 5 }, name: 'Gobelin Charpentier' },
        { monsterType: 'goblin_minion', cell: { x: 10, y: 8 }, name: 'Gobelin Charpentier' },
        { monsterType: 'goblin_minion', cell: { x: 7, y: 7 }, name: 'Gobelin Charpentier' },
      ],
    },
    grammy_apartment_guards: {
      id: 'grammy_apartment_guards',
      roomId: '9',
      name: 'Gardes de Chef Grukk',
      playerCell: { x: 8, y: 9 },
      monsters: [
        { monsterType: 'goblin', cell: { x: 9, y: 11 }, name: 'Gobelin Garde' },
        { monsterType: 'goblin', cell: { x: 9, y: 10 }, name: 'Gobelin Garde' },
        { monsterType: 'hobgoblin', cell: { x: 7, y: 11 }, name: 'Chef Grukk', hpOverride: 18 },
      ],
    },
    violet_fungus_heap: {
      id: 'violet_fungus_heap',
      roomId: '3',
      name: 'Champignon Violet',
      playerCell: { x: 12, y: 6 },
      monsters: [
        { monsterType: 'violet_fungus', cell: { x: 13, y: 6 }, name: 'Champignon Violet' },
      ],
    },
  },

  // PNJ scénarisés du module, rendus par leur propre token sur la battlemap.
  // visibleFromStart=false → présents mais cachés tant qu'ils ne se sont pas
  // révélés (le DM appelle reveal_npc). Mac est dans la salle du joueur (1) donc
  // visible d'emblée ; les dryades du verger (salle 2) restent cachées jusqu'à
  // offrande ou réussite sociale.
  npcs: [
    {
      id: 'mac',
      name: 'Mac',
      kind: 'awakened_tree',
      roomId: '1',
      cell: { x: 3, y: 13 },
      disposition: 'neutral',
      visibleFromStart: true,
      description: 'Grand pommier animé (tréant), gardien bougon de la cour.',
    },
    {
      id: 'dryad_1',
      name: 'Dryade',
      kind: 'dryad',
      roomId: '2',
      cell: { x: 3, y: 1 },
      disposition: 'wary',
      visibleFromStart: false,
      description: 'Esprit malicieux du verger, caché dans les pommiers.',
    },
    {
      id: 'dryad_2',
      name: 'Dryade',
      kind: 'dryad',
      roomId: '2',
      cell: { x: 8, y: 1 },
      disposition: 'wary',
      visibleFromStart: false,
      description: 'Esprit malicieux du verger, caché dans les pommiers.',
    },
    {
      id: 'dryad_3',
      name: 'Dryade',
      kind: 'dryad',
      roomId: '2',
      cell: { x: 13, y: 1 },
      disposition: 'wary',
      visibleFromStart: false,
      description: 'Esprit malicieux du verger, caché dans les pommiers.',
    },
    // Patrouille du quai : tokens visibles dès que le joueur entre en salle 7
    // (la narration les décrit immédiatement). Mêmes noms que l'encounter
    // loading_dock_patrol : si le combat démarre, les tokens monstres
    // remplacent les tokens PNJ (filtre anti-doublon par nom). Cases distinctes
    // des spawns de l'encounter — invariant adventure-modules.test.cjs.
    {
      id: 'goblin_patrol_1',
      name: 'Gobelin Patrouille',
      kind: 'goblin',
      roomId: '7',
      cell: { x: 4, y: 5 },
      disposition: 'hostile',
      visibleFromStart: true,
      description: 'Gobelin en patrouille près de l\'ouverture vers la boulangerie.',
    },
    {
      id: 'goblin_patrol_2',
      name: 'Gobelin Patrouille',
      kind: 'goblin',
      roomId: '7',
      cell: { x: 4, y: 7 },
      disposition: 'hostile',
      visibleFromStart: true,
      description: 'Gobelin en patrouille près de l\'ouverture vers la boulangerie.',
    },
  ],

  namedLocationCells: [
    { id: 'mac', pattern: /\b(mac|treant|grand pommier|pommier anime|pommier eveille)\b/, cell: { x: 3, y: 13 } },
  ],

  roomNavigationAliases: [
    { roomId: '5', pattern: /\b(bureau|bureau de grammy)\b/ },
    { roomId: '9', pattern: /\b(appartement|appartement de grammy|etage|a l etage|en haut|escalier)\b/ },
    { roomId: '8', pattern: /\b(sol de la boulangerie|boulangerie|four|cuisine)\b/ },
    { roomId: '7', pattern: /\b(quai|chargement|dock)\b/ },
    { roomId: '2', pattern: /\b(verger|pommiers?|pommier|arbres?)\b/ },
    { roomId: '3', pattern: /\b(dechets?|tas|champignons?|fungus)\b/ },
    { roomId: '4', pattern: /\b(entree|hall)\b/ },
    { roomId: '1', pattern: /\b(exterieur|dehors|sortie)\b/ },
  ],

  roomContextAliases: [
    { roomId: '8', pattern: /\b(porte des reserves?|reserves?|sol(?: de la)? boulangerie|fours?|fournee|plans de travail)\b/ },
    { roomId: '9', pattern: /\b(appartement(?: de grammy)?|grammy|chef grukk|grukk)\b/ },
    { roomId: '7', pattern: /\b(quai de chargement|quai|chargement|porte laterale)\b/ },
    { roomId: '5', pattern: /\b(bureau|paperasse|registres?|classeurs?)\b/ },
    { roomId: '3', pattern: /\b(tas de dechets?|dechets?|champignons? violets?)\b/ },
    { roomId: '2', pattern: /\b(verger|pommiers?|pommier)\b/ },
  ],

  doorTransitions: [
    { fromRoomId: '1', toRoomId: '4' },
    { fromRoomId: '7', toRoomId: '8' },
    { fromRoomId: '4', toRoomId: '9', pattern: /\b(appartement|grammy|gauche|etage|haut|escalier)\b/ },
    { fromRoomId: '4', toRoomId: '1', pattern: /\b(dehors|exterieur|sortie|arriere|retour)\b/ },
    { fromRoomId: '4', toRoomId: '8' },
    { fromRoomId: '8', toRoomId: '9', pattern: /\b(appartement|grammy|etage|haut|escalier)\b/ },
    { fromRoomId: '8', toRoomId: '5', pattern: /\b(bureau|paperasse|registres?)\b/ },
    { fromRoomId: '8', toRoomId: '7', pattern: /\b(quai|chargement|laterale|dock)\b/ },
  ],

  forwardTransitions: [
    { fromRoomId: '1', toRoomId: '4' },
    { fromRoomId: '4', toRoomId: '8' },
    { fromRoomId: '7', toRoomId: '8' },
    { fromRoomId: '8', toRoomId: '9' },
  ],

  // Synthèse des accroches mécaniques par salle. Injectée dans le prompt
  // dynamique (quand currentRoomId est connu) pour que le DM sache quels tools
  // sont pertinents SANS avoir à retrouver la bonne section du module markdown.
  roomHooks: {
    '1': [
      'Mac le Tréant (pommier animé) a déjà son token visible en (3,13) : non hostile si ignoré ; hostile si on menace les plantes.',
      'Si Mac devient hostile : spawn_monster (awakened_tree, à sa position) + enter_combat (son token PNJ laisse place au combattant).',
      'DD 12 Persuasion ou Investigation (roll_ability_check) → il évoque les secrets des dryades du verger.',
      'Mac ne sait RIEN de la recette (ni contenu, ni deux moitiés, ni emplacements) : il ne révèle JAMAIS ces informations et renvoie vers les dryades.',
      'Grandes portes barrées : DD 14 Force (roll_ability_check) pour enfoncer, ou contourner par le quai de chargement (salle 7).',
    ].join('\n'),
    '2': [
      "Trois dryades malicieuses, présentes mais CACHÉES (tokens invisibles) : n'apparaissent que sur offrande ou DD 13 Persuasion (roll_ability_check).",
      'Dès qu’elles se montrent (offrande acceptée ou DD 13 réussi) : appelle reveal_npc({ kind: "dryad" }) pour afficher leurs trois tokens — peut accompagner le roll_ability_check du même message.',
      'Une fois amadouées, elles racontent en gloussant que les gobelins essaient de faire des tartes depuis des semaines sans jamais y arriver.',
      'DD 17 Persuasion ou Investigation → elles révèlent que la recette est en deux moitiés (bureau salle 5 + appartement salle 9).',
      'Si offensées : reveal_npc({ kind: "dryad", disposition: "offended" }) puis elles bombardent de pommes pourries jusqu’au départ du joueur (pas de vrai combat).',
    ].join('\n'),
    '3': [
      'Champignon violet hostile : start_encounter("violet_fungus_heap") dès qu’on approche à ≤1 case (5 pieds).',
    ].join('\n'),
    '4': [
      "Caisse verrouillée derrière le comptoir : DD 12 Perception pour la trouver, puis DD 14 Dextérité (outils) ou DD 16 Force pour l'ouvrir (roll_ability_check). Butin : 8 po, 11 pa, 21 pc.",
      "Indices d'infestation gobeline visibles (traces, déjections).",
    ].join('\n'),
    '5': [
      'Coffre caché : DD 13 Perception pour trouver, DD 15 Dextérité ou DD 17 Force pour ouvrir (75 po, 50 pa, 25 pc).',
      'Tiroir piégé = 1re MOITIÉ DE LA RECETTE (objectif) : DD 13 Perception pour repérer, DD 16 Dextérité pour désamorcer. Si déclenché : resolve_saving_throw(con, DD 15) → empoisonné + dégâts de poison.',
    ].join('\n'),
    '7': [
      'Patrouille de 2 gobelins déjà visible sur la carte en (4,5) et (4,7) — tokens PNJ, pas encore des combattants : ne PAS appeler reveal_npc.',
      'DD 13 Discrétion (roll_ability_check) pour passer inaperçu.',
      'Si repéré : start_encounter("loading_dock_patrol") — les combattants remplacent les tokens PNJ. Entrer discrètement ici donne la surprise sur les gobelins du sol de la boulangerie (salle 8).',
    ].join('\n'),
    '8': [
      'Armoire en verre (6,7) : 2 potions de soin ordinaires, sans verrou.',
      'Épices cachées : DD 15 Perception (roll_ability_check).',
      '3 gobelins charpentiers dans les poutres : start_encounter("bakery_floor_goblins") si le joueur manipule les objets magiques (rouleaux, couteaux, fours). Négociation possible DD 14 CHA.',
    ].join('\n'),
    '9': [
      'SALLE FINALE. Chef Grukk (hobgoblin) + 2 gobelins gardes : start_encounter("grammy_apartment_guards") à l’entrée.',
      '2e MOITIÉ DE LA RECETTE ici. Négociation possible DD 14 CHA (Grukk veut nourriture / or / paix).',
    ].join('\n'),
  },
}
