import { GRAMMYS_SOCIAL } from './social'
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
  social: GRAMMYS_SOCIAL,
  // Aventure 1-map : toutes les salles vivent sur la map unique (mapId implicite).
  maps: [{ id: 'bakery', name: 'La boulangerie et ses abords', navigationMode: 'tactical',
    explorationRoomIds: ['1', '2', '3'], fogOfWar: true, fogReveal: 'open-door',
    fogHiddenRoomIds: ['4', '5', '7', '8', '9'], grid: { cols: 17, rows: 15 } }],
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
    { id: '4', enclosed: true, name: "L'entrée", zone: { minX: 10, maxX: 13, minY: 9, maxY: 12 } },
    { id: '5', enclosed: true, name: 'Le Bureau', zone: { minX: 5, maxX: 6, minY: 8, maxY: 12 } },
    { id: '7', enclosed: true, name: 'Quai de chargement', entryStealthDc: 13, zone: { minX: 3, maxX: 5, minY: 4, maxY: 7 } },
    { id: '8', enclosed: true, name: 'Sol de la boulangerie', zone: { minX: 6, maxX: 11, minY: 4, maxY: 8 },
      areas: [{ minX: 6, maxX: 11, minY: 4, maxY: 7 }, { minX: 10, maxX: 11, minY: 8, maxY: 8 }] },
    { id: '9', enclosed: true, navigationEvent: { id: 'apartment-guards', label: 'Decider comment aborder les gardes avant de franchir le seuil.' }, name: 'Appartement de Grammy', zone: { minX: 7, maxX: 9, minY: 8, maxY: 12 } },
  ],

  // Arrivées mécaniques alignées sur la géométrie corrigée ; le module narratif
  // les documente, mais ne les remplace jamais pendant la navigation.
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

  // Chaque côté est une case DANS la salle correspondante : approcher ne
  // franchit jamais le seuil. Les directions sont vues depuis cette salle.
  doors: [
    { id: 'front', name: 'Porte extérieure', initialState: 'closed', forceDc: 14, barredFromRoomId: '1',
      sides: [{ roomId: '1', cell: { x: 11, y: 13 }, direction: 'nord' }, { roomId: '4', cell: { x: 11, y: 12 }, direction: 'sud' }] },
    { id: 'entry-apartment', name: 'Porte de l’appartement', initialState: 'closed', forceDc: 14,
      sides: [{ roomId: '4', cell: { x: 10, y: 10 }, direction: 'ouest' }, { roomId: '9', cell: { x: 9, y: 10 }, direction: 'est' }] },
    { id: 'entry-floor', name: 'Porte de la boulangerie', initialState: 'open',
      sides: [{ roomId: '4', cell: { x: 10, y: 9 }, direction: 'nord' }, { roomId: '8', cell: { x: 10, y: 8 }, direction: 'sud' }] },
    { id: 'dock-floor', name: 'Porte du quai', initialState: 'open',
      sides: [{ roomId: '7', cell: { x: 5, y: 6 }, direction: 'est' }, { roomId: '8', cell: { x: 6, y: 6 }, direction: 'ouest' }] },
    { id: 'floor-office', name: 'Porte du bureau', initialState: 'closed',
      sides: [{ roomId: '8', cell: { x: 6, y: 7 }, direction: 'sud-ouest' }, { roomId: '5', cell: { x: 6, y: 8 }, direction: 'nord' }] },
    { id: 'floor-apartment', name: 'Porte de l’appartement côté fourneaux', initialState: 'closed',
      sides: [{ roomId: '8', cell: { x: 8, y: 7 }, direction: 'sud' }, { roomId: '9', cell: { x: 8, y: 8 }, direction: 'nord' }] },
  ],

  encounters: {
    bakery_floor_goblins: {
      id: 'bakery_floor_goblins',
      roomId: '8',
      name: 'Gobelins pâtissiers',
      playerCell: { x: 9, y: 6 },
      monsters: [
        { monsterType: 'goblin', cell: { x: 7, y: 5 }, name: 'Gobelin Pâtissier' },
        { monsterType: 'goblin', cell: { x: 7, y: 6 }, name: 'Gobelin Pâtissier' },
      ],
    },
    grammy_apartment_guards: {
      id: 'grammy_apartment_guards',
      roomId: '9',
      name: 'Gardes de Chef Grukk',
      noiseAmbush: { perceptionDc: 13, dexterityDc: 13 },
      playerCell: { x: 8, y: 9 },
      monsters: [
        { monsterType: 'goblin', cell: { x: 9, y: 11 }, name: 'Gobelin Garde' },
        { monsterType: 'goblin', cell: { x: 9, y: 10 }, name: 'Gobelin Garde' },
        { monsterType: 'hobgoblin', cell: { x: 7, y: 11 }, name: 'Chef Grukk' },
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
    statBlock: 'awakened_tree',
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
    statBlock: 'dryad',
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
    statBlock: 'dryad',
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
    statBlock: 'dryad',
      name: 'Dryade',
      kind: 'dryad',
      roomId: '2',
      cell: { x: 13, y: 1 },
      disposition: 'wary',
      visibleFromStart: false,
      description: 'Esprit malicieux du verger, caché dans les pommiers.',
    },
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
      'Grandes portes barrées : approcher front puis interact_door(action="force"), DD 14 Force. La géométrie corrigée ferme le quai côté extérieur : aucun contournement par la salle 7.',
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
      'Si Grukk et ses gardes (salle 9) entendent un bruit important réellement résolu ici : react_to_noise(response="ambush", encounterId="grammy_apartment_guards", sourceRoomId="4", doorId="entry-apartment", moves explicites dans la salle 9). Ils restent dans leur chambre, derrière cette porte, sans venir enquêter.',
      "Caisse verrouillée derrière le comptoir : DD 12 Perception pour la trouver, puis DD 14 Dextérité (outils) ou DD 16 Force pour l'ouvrir (roll_ability_check). Butin : 8 po, 11 pa, 21 pc.",
      "Indices d'infestation gobeline visibles (traces, déjections).",
    ].join('\n'),
    '5': [
      'Coffre caché : DD 13 Perception pour trouver, DD 15 Dextérité ou DD 17 Force pour ouvrir (75 po, 50 pa, 25 pc).',
      'Tiroir piégé = 1re MOITIÉ DE LA RECETTE (objectif) : DD 13 Perception pour repérer, DD 16 Dextérité pour désamorcer. Si déclenché : resolve_saving_throw(con, DD 15) → empoisonné + dégâts de poison.',
    ].join('\n'),
    '7': [
      'Le quai est vide de créatures : aucun gobelin ni rencontre dans cette salle. Les gobelins restent dans la boulangerie (salle 8).',
      'Depuis le quai, à travers dock-floor ouverte et dans la ligne de vue réelle, on voit les deux gobelins pâtissiers essayer de faire des tartes aux pommes en se chamaillant aux plans de travail (7,5) et (7,6). Ils sont à découvert, sans embuscade ; les observer ne déclenche aucun combat.',
      'Entrée discrète : move_token avec stealth=true résout le déplacement et le jet de Discrétion (DEX, DD 13) ensemble. Ne pas relancer roll_ability_check pour cette même entrée.',
      'Réussite : surprise sur les gobelins du sol de la boulangerie (salle 8). Échec : le bruit les alerte, sans surprise ; ne pas faire apparaître de gobelins dans le quai.',
    ].join('\n'),
    '8': [
      'Bruit important entendu dans l’appartement : Grukk et ses gardes restent en salle 9 et préparent une embuscade derrière floor-apartment via react_to_noise(response="ambush", encounterId="grammy_apartment_guards", sourceRoomId="8", doorId="floor-apartment", moves explicites dans la salle 9). Jamais investigate ni join_combat pour eux.',
      'Armoire en verre (6,7) : 2 potions de soin ordinaires, sans verrou.',
      'Épices cachées : DD 15 Perception (roll_ability_check).',
      'Deux gobelins pâtissiers à découvert aux plans de travail (7,5) et (7,6) essaient de faire des tartes aux pommes et se chamaillent. Visibles depuis le quai par dock-floor ouverte selon la ligne de vue ; aucune cachette dans les poutres ni embuscade. Observer, entrer ou manipuler les objets magiques ne déclenche pas de combat automatique. Dialogue possible ; start_encounter("bakery_floor_goblins") seulement si la scène devient réellement hostile, sans surprise accordée aux gobelins par défaut.',
    ].join('\n'),
    '9': [
      'SALLE FINALE. Chef Grukk (hobgoblin) + 2 gobelins gardes : start_encounter("grammy_apartment_guards") à l’entrée.',
      'Même après beaucoup de bruit, ils ne quittent pas l’appartement : embuscade derrière la porte d’où vient le bruit. Le joueur doit réellement franchir ce seuil. start_encounter avec ambush={doorId,attackerIndex,weaponOrSpell,suspicious}, sans playerCell : une frappe de réaction contre CA si insouciant ; si méfiant, Perception DD 13 puis, uniquement sur réussite, sauvegarde DEX DD 13. Sauvegarde réussie : aucun dégât ; sinon frappe normale. Aucune frappe à la seule ouverture ni par l’autre porte. Une seule résolution, puis combat normal ou négociation.',
      '2e MOITIÉ DE LA RECETTE ici. Négociation possible DD 14 CHA (Grukk veut nourriture / or / paix).',
    ].join('\n'),
  },

  // Cloisons : salles contiguës sur la grille mais séparées par un mur — elles
  // ne communiquent PAS directement (voir AdventureMapData.partitions). Tout le
  // reste des contiguïtés est franchissable. Décisions actées :
  // - 3 (Tas de déchets, DEHORS) / 8 (Sol de la boulangerie, DEDANS) : mur
  //   extérieur du bâtiment — le tas s'atteint par l'extérieur, le sol par une
  //   porte intérieure.
  // - 5 (Le Bureau) / 7 (Quai de chargement) : aucune porte entre eux ; le
  //   bureau se rejoint depuis le sol de la boulangerie, le quai par sa latérale.
  // - 5 (Le Bureau) / 9 (Appartement) : rejoints séparément depuis le sol (8).
  partitions: [
    ['3', '8'],
    ['5', '7'],
    ['5', '9'],
  ],
}
