import type {
  AdventureRoom,
  AdventureMapData,
  EncounterDefinition,
  AdventureNpcSpec,
  AdventureTransition,
  MapTransition,
  MapQuest,
  GridCell,
} from '../../lib/adventure-map'

// ─────────────────────────────────────────────────────────────────────────────
// « La Foire du Voleur d'Ombres » — données de carte du module.
//
// PREMIER MODULE MULTI-MAPS (docs/multi-map-adventures.md) : deux cartes à
// grilles différentes, une quête de map à objectifs vérifiables par le moteur,
// une transition à sens unique avec compagnon.
//
//   Carte « fair » — La Foire aux Chandelles : 17 col (x:0-16) × 15 rangées
//   (y:0-14). Salles 1-5 (numérotation GLOBALE continue à travers les maps).
//   Carte « wood » — Le Bois-Ricanant : 15 col (x:0-14) × 13 rangées (y:0-12).
//   Salles 6-9.
//
// Types de monstres : uniquement des types du bestiaire commun du moteur
// (goblin_minion, goblin, satyr, sprite, blink_dog, will_o_wisp, violet_fungus,
// giant_frog) avec reskin par `name`.
// ─────────────────────────────────────────────────────────────────────────────

export const FEY_SHADOW_FAIR_ID = 'fey-shadow-fair'

// Position initiale du joueur : le pré aux lanternes, devant l'arche de la foire.
export const FEY_SHADOW_FAIR_START_CELL: GridCell = { x: 4, y: 13 }

export const FEY_SHADOW_FAIR_ROOMS: AdventureRoom[] = [
  // ── Carte fair — La Foire aux Chandelles ──────────────────────────────────
  { id: '1', name: 'Le Pré aux Lanternes', mapId: 'fair', zone: { minX: 2, maxX: 16, minY: 12, maxY: 14 } },
  { id: '2', name: "L'Allée des Baraques", mapId: 'fair', zone: { minX: 2, maxX: 9, minY: 8, maxY: 11 } },
  { id: '3', name: 'Le Carrousel de Limaces', mapId: 'fair', zone: { minX: 11, maxX: 15, minY: 8, maxY: 11 } },
  { id: '4', name: 'La Tente du Bonneteau', mapId: 'fair', zone: { minX: 3, maxX: 7, minY: 3, maxY: 6 } },
  { id: '5', name: 'Le Portail des Vers Luisants', mapId: 'fair', zone: { minX: 10, maxX: 14, minY: 2, maxY: 5 } },
  // ── Carte wood — Le Bois-Ricanant ─────────────────────────────────────────
  { id: '6', name: 'La Clairière des Champignons Moqueurs', mapId: 'wood', zone: { minX: 1, maxX: 6, minY: 8, maxY: 11 } },
  { id: '7', name: 'La Mare aux Grenouilles de Bal', mapId: 'wood', zone: { minX: 8, maxX: 13, minY: 7, maxY: 11 } },
  { id: '8', name: 'Le Sentier des Chiens-Clins', mapId: 'wood', zone: { minX: 1, maxX: 6, minY: 3, maxY: 6 } },
  { id: '9', name: 'La Cour du Prince des Farces', mapId: 'wood', zone: { minX: 8, maxX: 13, minY: 1, maxY: 5 } },
]

// Points d'entrée par salle (cibles move_token du DM).
export const FEY_SHADOW_FAIR_ENTRY_CELLS: Record<string, GridCell> = {
  '1': { x: 4, y: 13 },
  '2': { x: 5, y: 10 },
  '3': { x: 13, y: 10 },
  '4': { x: 5, y: 5 },
  '5': { x: 12, y: 4 },
  '6': { x: 3, y: 10 },
  '7': { x: 10, y: 9 },
  '8': { x: 3, y: 5 },
  '9': { x: 10, y: 3 },
}

export const FEY_SHADOW_FAIR_ENCOUNTERS: Record<string, EncounterDefinition> = {
  fair_pickpockets: {
    id: 'fair_pickpockets',
    roomId: '2',
    name: "Tire-goussets de l'Allée",
    playerCell: { x: 6, y: 10 },
    monsters: [
      { monsterType: 'goblin_minion', cell: { x: 7, y: 9 }, name: 'Tire-gousset gobelin' },
      { monsterType: 'goblin_minion', cell: { x: 8, y: 10 }, name: 'Tire-gousset gobelin' },
    ],
  },
  bonneteau_bouncers: {
    id: 'bonneteau_bouncers',
    roomId: '4',
    name: 'Videurs du Bonneteau',
    playerCell: { x: 5, y: 6 },
    monsters: [
      { monsterType: 'satyr', cell: { x: 4, y: 3 }, name: 'Videur satyre' },
      { monsterType: 'goblin', cell: { x: 6, y: 3 }, name: 'Croupier gobelin' },
    ],
  },
  mocking_mushrooms: {
    id: 'mocking_mushrooms',
    roomId: '6',
    name: 'Champignons moqueurs vexés',
    playerCell: { x: 4, y: 9 },
    monsters: [
      { monsterType: 'violet_fungus', cell: { x: 2, y: 8 }, name: 'Champignon moqueur' },
      { monsterType: 'violet_fungus', cell: { x: 5, y: 8 }, name: 'Champignon moqueur' },
    ],
  },
  frog_gavotte: {
    id: 'frog_gavotte',
    roomId: '7',
    name: 'La gavotte tourne mal',
    playerCell: { x: 9, y: 9 },
    monsters: [
      { monsterType: 'giant_frog', cell: { x: 10, y: 10 }, name: 'Grenouille de bal' },
      { monsterType: 'giant_frog', cell: { x: 12, y: 10 }, name: 'Grenouille de bal' },
    ],
  },
  blink_pack: {
    id: 'blink_pack',
    roomId: '8',
    name: 'La meute des Chiens-Clins',
    playerCell: { x: 3, y: 5 },
    monsters: [
      { monsterType: 'blink_dog', cell: { x: 2, y: 4 }, name: 'Chien-clin' },
      { monsterType: 'blink_dog', cell: { x: 5, y: 4 }, name: 'Chien-clin' },
    ],
  },
  princes_jest: {
    id: 'princes_jest',
    roomId: '9',
    name: 'La Grande Farce du Prince',
    playerCell: { x: 10, y: 4 },
    monsters: [
      // will_o_wisp (22 HP, CA 19) retaillé pour un héros niveau 3 seul.
      { monsterType: 'will_o_wisp', cell: { x: 11, y: 3 }, name: 'Feu follet majordome', hpOverride: 18 },
      { monsterType: 'sprite', cell: { x: 9, y: 4 }, name: 'Lutin duelliste' },
      { monsterType: 'sprite', cell: { x: 13, y: 3 }, name: 'Lutin duelliste' },
    ],
  },
}

// PNJ scénarisés, rendus par leur token sur la battlemap (de LEUR map).
export const FEY_SHADOW_FAIR_NPCS: AdventureNpcSpec[] = [
  {
    id: 'madame_bougie',
    name: 'Madame Bougie',
    kind: 'merchant',
    roomId: '2',
    cell: { x: 3, y: 9 },
    disposition: 'neutral',
    visibleFromStart: true,
    description: "Tenancière de la foire, cire fondue dans les cheveux, sourire en flamme de veilleuse. Seule à savoir ouvrir le Portail des Vers Luisants — et ne l'ouvre qu'aux gens qu'elle apprécie.",
  },
  {
    id: 'pipotin',
    name: 'Pipotin',
    kind: 'barker',
    roomId: '4',
    cell: { x: 4, y: 4 },
    disposition: 'wary',
    visibleFromStart: true,
    description: "Gobelin bonimenteur, apprenti de Maître Filou. Sait où son patron s'est enfui avec l'ombre — et vend l'information contre trois compliments sincères ou une pièce.",
  },
  {
    id: 'barnabe',
    name: 'Barnabé',
    kind: 'shrub',
    roomId: '3',
    cell: { x: 14, y: 9 },
    disposition: 'helpful',
    visibleFromStart: true,
    description: "Arbuste éveillé en pot, employé du carrousel, s'ennuie à mourir. Rêve de voir le Bois-Ricanant — suivra le joueur si on l'emporte (compagnon de la transition).",
  },
  {
    id: 'baronne_grenouille',
    name: 'La Baronne Grenouille',
    kind: 'frog_noble',
    roomId: '7',
    cell: { x: 12, y: 8 },
    disposition: 'neutral',
    visibleFromStart: true,
    description: 'Grenouille géante à collerette de nénuphar, très à cheval sur l\'étiquette du bal. Connaît le protocole exact pour saluer le Prince sans finir changé en tabouret.',
  },
  {
    id: 'maitre_filou',
    name: 'Maître Filou',
    kind: 'trickster',
    roomId: '9',
    cell: { x: 9, y: 2 },
    disposition: 'wary',
    visibleFromStart: true,
    description: "Farfadet tricheur qui a gagné l'ombre du héros au bonneteau — avec des cartes peintes à la main, toutes identiques. L'ombre dépasse de sa sacoche et fait des signes.",
  },
  {
    id: 'prince_farces',
    name: 'Le Prince des Farces',
    kind: 'archfey',
    roomId: '9',
    cell: { x: 11, y: 2 },
    disposition: 'wary',
    visibleFromStart: false,
    description: "Archifée du Bois-Ricanant, invisible tant qu'il n'a pas ri. Collectionne les ombres bien repassées mais respecte quiconque le fait rire ou joue franc jeu.",
  },
]

export const FEY_SHADOW_FAIR_NAMED_LOCATION_CELLS: Array<{ id: string; pattern: RegExp; cell: GridCell }> = [
  { id: 'madame_bougie', pattern: /\b(madame bougie|bougie|chandeliere|chandelière|tenanciere|tenancière)\b/, cell: { x: 3, y: 9 } },
  { id: 'firefly_gate', pattern: /\b(portail|vers luisants|arche luisante)\b/, cell: { x: 12, y: 4 } },
]

export const FEY_SHADOW_FAIR_ROOM_NAVIGATION_ALIASES: Array<{ roomId: string; pattern: RegExp }> = [
  { roomId: '1', pattern: /\b(pre|pré|lanternes?|entree de la foire|entrée de la foire|prairie)\b/ },
  { roomId: '2', pattern: /\b(allee|allée|baraques?|stands?|echoppes?|échoppes?|boutiques?)\b/ },
  { roomId: '3', pattern: /\b(carrousel|manege|manège|limaces?)\b/ },
  { roomId: '4', pattern: /\b(tente|bonneteau|table de jeu|cartes)\b/ },
  { roomId: '5', pattern: /\b(portail|vers luisants|arche)\b/ },
  { roomId: '6', pattern: /\b(clairiere|clairière|champignons?)\b/ },
  { roomId: '7', pattern: /\b(mare|etang|étang|grenouilles?|bal)\b/ },
  { roomId: '8', pattern: /\b(sentier|chiens?[- ]clins?)\b/ },
  { roomId: '9', pattern: /\b(cour|prince|trone|trône)\b/ },
]

export const FEY_SHADOW_FAIR_DOOR_TRANSITIONS: AdventureTransition[] = [
  { fromRoomId: '1', toRoomId: '2' },
  { fromRoomId: '1', toRoomId: '3', pattern: /\b(carrousel|manege|manège|limaces?)\b/ },
  { fromRoomId: '2', toRoomId: '4' },
  { fromRoomId: '2', toRoomId: '3', pattern: /\b(carrousel|manege|manège|limaces?)\b/ },
  { fromRoomId: '2', toRoomId: '5', pattern: /\b(portail|arche|vers luisants)\b/ },
  { fromRoomId: '3', toRoomId: '2' },
  { fromRoomId: '4', toRoomId: '5' },
  { fromRoomId: '6', toRoomId: '7', pattern: /\b(mare|grenouilles?|bal)\b/ },
  { fromRoomId: '6', toRoomId: '8' },
  { fromRoomId: '7', toRoomId: '9' },
  { fromRoomId: '8', toRoomId: '9' },
]

export const FEY_SHADOW_FAIR_FORWARD_TRANSITIONS: AdventureTransition[] = [
  { fromRoomId: '1', toRoomId: '2' },
  { fromRoomId: '2', toRoomId: '4' },
  { fromRoomId: '4', toRoomId: '5' },
  { fromRoomId: '6', toRoomId: '8' },
  { fromRoomId: '8', toRoomId: '9' },
]

// ── Quêtes de map (jugées par le MOTEUR — docs/multi-map-adventures.md) ──────
export const FEY_SHADOW_FAIR_MAP_QUESTS: Record<string, MapQuest> = {
  fair: {
    mapId: 'fair',
    objectives: [
      {
        id: 'find_filou_trail',
        label: "Apprendre à la Tente du Bonneteau où Maître Filou s'est enfui",
        required: true,
        check: { type: 'roomVisited', roomId: '4' },
      },
      {
        id: 'charm_bougie',
        label: 'Gagner la faveur de Madame Bougie, gardienne du portail',
        required: true,
        check: { type: 'npcDisposition', npcId: 'madame_bougie', disposition: 'helpful' },
      },
      {
        id: 'stop_pickpockets',
        label: "Régler leur compte aux tire-goussets de l'Allée",
        required: false,
        check: { type: 'encounterResolved', encounterId: 'fair_pickpockets' },
      },
      {
        id: 'ride_carousel',
        label: 'Faire un tour au Carrousel de Limaces (et rencontrer Barnabé)',
        required: false,
        check: { type: 'roomVisited', roomId: '3' },
      },
    ],
  },
  // Carte finale : pas de sortie — la quête sert au contexte du DM (objectif
  // affiché), jamais à une transition.
  wood: {
    mapId: 'wood',
    objectives: [
      {
        id: 'reach_court',
        label: 'Atteindre la Cour du Prince des Farces',
        required: true,
        check: { type: 'roomVisited', roomId: '9' },
      },
      {
        id: 'recover_shadow',
        label: "Convaincre le Prince des Farces de faire rendre l'ombre volée",
        required: true,
        check: { type: 'npcDisposition', npcId: 'prince_farces', disposition: 'helpful' },
      },
      {
        id: 'befriend_baroness',
        label: 'Être pris en affection par la Baronne Grenouille',
        required: false,
        check: { type: 'npcDisposition', npcId: 'baronne_grenouille', disposition: 'helpful' },
      },
    ],
  },
}

// ── Transition inter-maps (SENS UNIQUE) ──────────────────────────────────────
export const FEY_SHADOW_FAIR_MAP_TRANSITIONS: MapTransition[] = [
  {
    id: 'firefly_gate',
    fromMapId: 'fair',
    toMapId: 'wood',
    arrivalCell: { x: 3, y: 10 },
    arrivalRoomId: '6',
    // Barnabé l'arbuste éveillé saute dans le sac du héros et traverse avec lui.
    companions: ['barnabe'],
    pattern: /\b(portail|vers luisants|bois[- ]ricanant|foret|forêt)\b/,
  },
]

// Accroches mécaniques par salle, injectées dans le prompt dynamique du DM.
export const FEY_SHADOW_FAIR_ROOM_HOOKS: Record<string, string> = {
  '1': [
    "Salle d'ambiance et d'exposition : lampions, odeur de pomme d'amour, musique de vielle jouée faux exprès.",
    "DD 11 Perception (roll_ability_check) → remarquer que le héros ne projette AUCUNE ombre sous les lanternes (rappel de l'enjeu, moment gênant devant les badauds).",
    "DD 12 Charisme (roll_ability_check) auprès des forains → apprendre que Madame Bougie (Allée, salle 2) décide de QUI passe le Portail des Vers Luisants.",
  ].join('\n'),
  '2': [
    'Madame Bougie a son token visible en (3,9) : neutre, marchande de chandelles-souvenirs.',
    "DD 13 Persuasion OU un vrai service rendu (tire-goussets réglés, compliment non flagorneur) → reveal_npc({ npcId: \"madame_bougie\", disposition: \"helpful\" }) : elle promet d'ouvrir le portail. OBJECTIF DE QUÊTE (charm_bougie).",
    'Deux tire-goussets gobelins détroussent les badauds : start_encounter("fair_pickpockets") si le joueur les prend sur le fait (DD 12 Perception) ou s\'il se fait voler sa bourse (échec). Combat évitable : DD 12 Intimidation les fait tout rendre.',
    'Objectif optionnel stop_pickpockets : la rencontre fair_pickpockets résolue compte pour la quête.',
  ].join('\n'),
  '3': [
    'Le carrousel tourne à dos de limaces géantes (une lenteur assumée et payante). Barnabé, arbuste éveillé en pot, token visible en (14,9), disposition helpful.',
    "Entrer dans la salle suffit à l'objectif optionnel ride_carousel (trigger_room_event enter).",
    'DD 10 Charisme (roll_ability_check) avec Barnabé → il supplie qu\'on l\'emmène au Bois-Ricanant : rappeler au joueur qu\'il TRAVERSERA avec lui (compagnon de la transition firefly_gate).',
    "Tour de carrousel payé (2 pa) → la limace de tête souffle au joueur que Maître Filou a « filé côté Bois » (indice vers la tente et le portail).",
  ].join('\n'),
  '4': [
    "Pipotin le bonimenteur, token visible en (4,4), wary : il garde la tente de Maître Filou (parti la veille avec l'ombre).",
    'ENTRER dans la salle (trigger_room_event enter) remplit l\'objectif REQUIS find_filou_trail : Pipotin lâche que son patron a filé par le Portail des Vers Luisants vers le Bois-Ricanant.',
    "DD 12 Persuasion (ou 1 po) → Pipotin donne en plus le conseil : « Le Prince rend tout à qui le fait rire. Tout. Même les ombres. »",
    'Accuser la maison de tricher SANS preuve → start_encounter("bonneteau_bouncers") : le videur satyre et le croupier gobelin défendent la réputation de la baraque. Combat évitable : DD 13 CHA, excuse publique.',
  ].join('\n'),
  '5': [
    "L'arche du portail est éteinte tant que Madame Bougie n'est pas helpful : narrer des vers luisants endormis, refus doux du passage.",
    "Quand le joueur franchit DÉLIBÉRÉMENT le portail (et confirme, car c'est SANS RETOUR) → travel_to_map({ toMapId: \"wood\" }). Si le moteur refuse (MAP_QUEST_INCOMPLETE), les vers luisants forment les mots des objectifs manquants dans l'air.",
    'Rappeler ce qui serait laissé derrière : tire-goussets impunis, Barnabé (salle 3) si le joueur ne lui a pas parlé, achats non faits.',
  ].join('\n'),
  '6': [
    "SALLE D'ARRIVÉE de la transition. Les champignons violets ricanent à chaque pas du joueur (moqueurs mais inoffensifs si on ne les vexe pas).",
    'Les piétiner, les insulter avec talent ou rire PLUS fort qu\'eux (DD 12 CHA raté) → start_encounter("mocking_mushrooms").',
    "DD 12 Perception (roll_ability_check) → traces de petits souliers pointus (Maître Filou) vers le nord, et un panneau : « Cour du Prince : tout droit, puis deuxième gauche après l'éclat de rire. »",
    "Si Barnabé a traversé : il s'enracine deux minutes d'émerveillement, puis sert de guide-boussole approximatif (avantage narratif sur l'orientation).",
  ].join('\n'),
  '7': [
    'La Baronne Grenouille, token visible en (12,8), neutre : elle fait répéter la gavotte à ses demoiselles grenouilles.',
    "DD 12 Persuasion OU accepter une danse (DD 11 DEX, roll_ability_check) → reveal_npc({ npcId: \"baronne_grenouille\", disposition: \"helpful\" }) : elle enseigne le protocole du Prince (« Ne JAMAIS s'incliner en premier : il faut le faire rire d'abord »). OBJECTIF optionnel befriend_baroness.",
    'Marcher sur un nénuphar réservé ou refuser grossièrement la danse → start_encounter("frog_gavotte") : deux grenouilles de bal offensées. Combat évitable : DD 12 CHA, excuse dansée.',
  ].join('\n'),
  '8': [
    'Des chiens-clins (blink dogs) jouent à « tu me vois, tu me vois plus » sur le sentier — ils VOLENT un objet du joueur en se téléportant (le miroir de poche fêlé, idéalement).',
    'Leur courir après ou les menacer → start_encounter("blink_pack"). Combat évitable : DD 12 SAG (comprendre la règle du jeu) ou leur lancer quelque chose à rapporter.',
    "Jeu réussi → ils rendent l'objet, ouvrent le passage vers la Cour et hurlent-annoncent le joueur comme « l'Invité Qui Joue » (avantage social salle 9).",
  ].join('\n'),
  '9': [
    "SALLE FINALE. Maître Filou, token visible en (9,2), wary — l'ombre volée dépasse de sa sacoche et fait des signes désespérés au joueur. Le Prince des Farces est présent mais INVISIBLE (token caché).",
    "Faire rire le Prince (farce, autodérision, blague sur Filou, numéro de Barnabé…) DD 13 CHA (roll_ability_check) OU dénoncer la triche de Filou preuve à l'appui (cartes identiques, DD 12 INT) → reveal_npc({ npcId: \"prince_farces\", disposition: \"helpful\" }) : il éclate de rire, se matérialise et ordonne à Filou de rendre l'ombre. OBJECTIF FINAL recover_shadow.",
    "S'incliner en premier, exiger, ou menacer → le Prince (toujours invisible) lance sa Grande Farce : start_encounter(\"princes_jest\") — feu follet majordome + lutins duellistes. Combat évitable même engagé : DD 13 CHA en riant de soi-même.",
    "Ombre rendue : elle se recoud aux talons du héros en faisant semblant de bouder. Le Prince offre une chandelle de Madame Bougie « pour le retour » (clin d'œil : il n'y a PAS de retour — c'est sa dernière farce). FIN du module.",
  ].join('\n'),
}

// Agrégat consommé par le registre lib/adventure-map.ts (getAdventureMap).
export const FEY_SHADOW_FAIR_MAP: AdventureMapData = {
  maps: [
    { id: 'fair', name: 'La Foire aux Chandelles', grid: { cols: 17, rows: 15 } },
    { id: 'wood', name: 'Le Bois-Ricanant', grid: { cols: 15, rows: 13 } },
  ],
  mapQuests: FEY_SHADOW_FAIR_MAP_QUESTS,
  mapTransitions: FEY_SHADOW_FAIR_MAP_TRANSITIONS,
  startCell: FEY_SHADOW_FAIR_START_CELL,
  // Niveau 3 (guerrier N3 = 36 PV). Kit de classe + objets propres au module.
  initialPlayer: {
    level: 3,
    extraInventory: [
      { id: 'potion2', name: 'Potion de soin', type: 'potion', description: 'Restaure 2d4+2 HP' },
      { id: 'cracked_mirror', name: 'Miroir de poche fêlé', type: 'misc', description: "Reflète tout… sauf l'ombre du héros, évidemment. Les chiens-clins l'adorent." },
    ],
  },
  rooms: FEY_SHADOW_FAIR_ROOMS,
  entryCells: FEY_SHADOW_FAIR_ENTRY_CELLS,
  encounters: FEY_SHADOW_FAIR_ENCOUNTERS,
  npcs: FEY_SHADOW_FAIR_NPCS,
  namedLocationCells: FEY_SHADOW_FAIR_NAMED_LOCATION_CELLS,
  roomNavigationAliases: FEY_SHADOW_FAIR_ROOM_NAVIGATION_ALIASES,
  roomContextAliases: [],
  doorTransitions: FEY_SHADOW_FAIR_DOOR_TRANSITIONS,
  forwardTransitions: FEY_SHADOW_FAIR_FORWARD_TRANSITIONS,
  roomHooks: FEY_SHADOW_FAIR_ROOM_HOOKS,
}
