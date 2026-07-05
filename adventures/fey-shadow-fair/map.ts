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
// MODULE MULTI-MAPS de référence (docs/multi-map-adventures.md) : deux GRANDES
// cartes scrollables (docs/battlemap-viewport.md), une quête de map à objectifs
// vérifiables par le moteur, une transition à sens unique avec compagnon.
//
//   Carte « fair » — La Foire aux Chandelles : 24 col (x:0-23) × 16 rangées
//   (y:0-15). Salles 1-9 (numérotation GLOBALE continue à travers les maps).
//   Carte « wood » — Le Bois-Ricanant : 16 col (x:0-15) × 24 rangées (y:0-23).
//   Salles 10-16. On y progresse du sud (arrivée) vers le nord (la Cour).
//
// cellSize: 64 → les battlemaps sont générées à 64 px/case, soit 1536×1024
// (paysage) et 1024×1536 (portrait) : la résolution native maximale des images
// produites par ChatGPT — une illustration générée s'y dépose telle quelle.
//
// Types de monstres : uniquement des types du bestiaire commun du moteur
// (goblin_minion, goblin, satyr, sprite, blink_dog, will_o_wisp, violet_fungus,
// giant_frog, wolf, bandit, zombie, hobgoblin) avec reskin par `name`.
// ─────────────────────────────────────────────────────────────────────────────

export const FEY_SHADOW_FAIR_ID = 'fey-shadow-fair'

// Position initiale du joueur : le pré aux lanternes, devant l'arche de la foire.
export const FEY_SHADOW_FAIR_START_CELL: GridCell = { x: 4, y: 14 }

export const FEY_SHADOW_FAIR_ROOMS: AdventureRoom[] = [
  // ── Carte fair — La Foire aux Chandelles (24×16) ──────────────────────────
  { id: '1', name: 'Le Pré aux Lanternes', mapId: 'fair', zone: { minX: 0, maxX: 23, minY: 13, maxY: 15 } },
  { id: '2', name: "L'Allée des Baraques", mapId: 'fair', zone: { minX: 0, maxX: 9, minY: 9, maxY: 12 } },
  { id: '3', name: "Le Carrousel de Limaces et la Piste d'Escargots", mapId: 'fair', zone: { minX: 12, maxX: 21, minY: 9, maxY: 12 } },
  { id: '4', name: 'La Tente du Bonneteau', mapId: 'fair', zone: { minX: 0, maxX: 5, minY: 0, maxY: 4 } },
  { id: '5', name: 'Le Portail des Vers Luisants', mapId: 'fair', zone: { minX: 14, maxX: 19, minY: 0, maxY: 4 } },
  { id: '6', name: 'Le Grand Chapiteau', mapId: 'fair', zone: { minX: 0, maxX: 6, minY: 5, maxY: 8 } },
  { id: '7', name: 'La Théière à Bulles', mapId: 'fair', zone: { minX: 16, maxX: 21, minY: 5, maxY: 8 } },
  { id: '8', name: 'Le Verger aux Ripailles', mapId: 'fair', zone: { minX: 8, maxX: 14, minY: 5, maxY: 8 } },
  { id: '9', name: 'Le Palais des Miroirs', mapId: 'fair', zone: { minX: 7, maxX: 12, minY: 0, maxY: 4 } },
  // ── Carte wood — Le Bois-Ricanant (16×24, sud → nord) ─────────────────────
  { id: '10', name: 'La Clairière des Champignons Moqueurs', mapId: 'wood', zone: { minX: 0, maxX: 15, minY: 19, maxY: 23 } },
  { id: '11', name: 'Le Carrefour des Têtes Jacassantes', mapId: 'wood', zone: { minX: 0, maxX: 15, minY: 14, maxY: 18 } },
  { id: '12', name: 'Le Péage des Brigands à Mirliton', mapId: 'wood', zone: { minX: 0, maxX: 7, minY: 9, maxY: 13 } },
  { id: '13', name: 'La Mare aux Grenouilles de Bal', mapId: 'wood', zone: { minX: 9, maxX: 15, minY: 9, maxY: 13 } },
  { id: '14', name: 'Le Sentier des Chiens-Clins', mapId: 'wood', zone: { minX: 0, maxX: 7, minY: 5, maxY: 8 } },
  { id: '15', name: 'Le Bal des Ombres', mapId: 'wood', zone: { minX: 9, maxX: 15, minY: 5, maxY: 8 } },
  { id: '16', name: 'La Cour du Prince des Farces', mapId: 'wood', zone: { minX: 2, maxX: 13, minY: 0, maxY: 4 } },
]

// Points d'entrée par salle (cibles move_token du DM).
export const FEY_SHADOW_FAIR_ENTRY_CELLS: Record<string, GridCell> = {
  '1': { x: 4, y: 14 },
  '2': { x: 5, y: 10 },
  '3': { x: 13, y: 10 },
  '4': { x: 3, y: 2 },
  '5': { x: 16, y: 2 },
  '6': { x: 3, y: 6 },
  '7': { x: 18, y: 6 },
  '8': { x: 11, y: 6 },
  '9': { x: 9, y: 2 },
  '10': { x: 4, y: 21 },
  '11': { x: 7, y: 16 },
  '12': { x: 3, y: 11 },
  '13': { x: 11, y: 11 },
  '14': { x: 3, y: 6 },
  '15': { x: 11, y: 6 },
  '16': { x: 7, y: 2 },
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
    playerCell: { x: 3, y: 3 },
    monsters: [
      { monsterType: 'satyr', cell: { x: 2, y: 1 }, name: 'Videur satyre' },
      { monsterType: 'goblin', cell: { x: 4, y: 1 }, name: 'Croupier gobelin' },
    ],
  },
  circus_wolves: {
    id: 'circus_wolves',
    roomId: '6',
    name: 'Les loups savants font un rappel',
    playerCell: { x: 3, y: 7 },
    monsters: [
      { monsterType: 'wolf', cell: { x: 5, y: 7 }, name: 'Loup savant échappé' },
      { monsterType: 'wolf', cell: { x: 6, y: 8 }, name: 'Loup savant échappé' },
    ],
  },
  feast_flan: {
    id: 'feast_flan',
    roomId: '8',
    name: 'Le Grand Flan se vexe',
    playerCell: { x: 11, y: 7 },
    monsters: [
      // zombie (22 HP, CA 8, vitesse 20) : parfait pour un flan géant offensé.
      { monsterType: 'zombie', cell: { x: 9, y: 7 }, name: 'Le Grand Flan', hpOverride: 16 },
    ],
  },
  mirror_reflections: {
    id: 'mirror_reflections',
    roomId: '9',
    name: 'Les reflets sortent du cadre',
    playerCell: { x: 9, y: 3 },
    monsters: [
      { monsterType: 'bandit', cell: { x: 10, y: 1 }, name: 'Reflet désobligeant' },
      { monsterType: 'bandit', cell: { x: 11, y: 2 }, name: 'Reflet désobligeant' },
    ],
  },
  mocking_mushrooms: {
    id: 'mocking_mushrooms',
    roomId: '10',
    name: 'Champignons moqueurs vexés',
    playerCell: { x: 5, y: 20 },
    monsters: [
      { monsterType: 'violet_fungus', cell: { x: 3, y: 20 }, name: 'Champignon moqueur' },
      { monsterType: 'violet_fungus', cell: { x: 6, y: 21 }, name: 'Champignon moqueur' },
    ],
  },
  toll_brigands: {
    id: 'toll_brigands',
    roomId: '12',
    name: 'Le péage passe en force',
    playerCell: { x: 4, y: 12 },
    monsters: [
      { monsterType: 'goblin', cell: { x: 1, y: 12 }, name: 'Péagiste zélé' },
      { monsterType: 'goblin_minion', cell: { x: 5, y: 10 }, name: 'Brigand à mirliton' },
      { monsterType: 'goblin_minion', cell: { x: 6, y: 12 }, name: 'Brigand à mirliton' },
    ],
  },
  frog_gavotte: {
    id: 'frog_gavotte',
    roomId: '13',
    name: 'La gavotte tourne mal',
    playerCell: { x: 10, y: 12 },
    monsters: [
      { monsterType: 'giant_frog', cell: { x: 11, y: 13 }, name: 'Grenouille de bal' },
      { monsterType: 'giant_frog', cell: { x: 13, y: 12 }, name: 'Grenouille de bal' },
    ],
  },
  blink_pack: {
    id: 'blink_pack',
    roomId: '14',
    name: 'La meute des Chiens-Clins',
    playerCell: { x: 3, y: 6 },
    monsters: [
      { monsterType: 'blink_dog', cell: { x: 2, y: 5 }, name: 'Chien-clin' },
      { monsterType: 'blink_dog', cell: { x: 5, y: 5 }, name: 'Chien-clin' },
    ],
  },
  shadow_cotillon: {
    id: 'shadow_cotillon',
    roomId: '15',
    name: 'Le cotillon des ombres offensées',
    playerCell: { x: 11, y: 7 },
    monsters: [
      { monsterType: 'sprite', cell: { x: 10, y: 5 }, name: 'Ombre-cotillon' },
      { monsterType: 'sprite', cell: { x: 12, y: 5 }, name: 'Ombre-cotillon' },
      { monsterType: 'sprite', cell: { x: 14, y: 7 }, name: 'Ombre-cotillon' },
    ],
  },
  princes_jest: {
    id: 'princes_jest',
    roomId: '16',
    name: 'La Grande Farce du Prince',
    playerCell: { x: 7, y: 3 },
    monsters: [
      // will_o_wisp (22 HP, CA 19) retaillé pour un héros niveau 3 seul.
      { monsterType: 'will_o_wisp', cell: { x: 8, y: 2 }, name: 'Feu follet majordome', hpOverride: 18 },
      { monsterType: 'sprite', cell: { x: 6, y: 2 }, name: 'Lutin duelliste' },
      { monsterType: 'sprite', cell: { x: 11, y: 2 }, name: 'Lutin duelliste' },
    ],
  },
}

// PNJ scénarisés, rendus par leur token sur la battlemap (de LEUR map).
export const FEY_SHADOW_FAIR_NPCS: AdventureNpcSpec[] = [
  {
    id: 'nicodeme',
    name: 'Nicodème Minuit',
    kind: 'ticketer',
    roomId: '1',
    cell: { x: 7, y: 14 },
    disposition: 'neutral',
    visibleFromStart: true,
    description: "Gobelin billettiste centenaire, longue-vue et cornet acoustique. Fait mine d'être sourd et myope — les deux instruments détectent surtout les mensonges. Vend billets à huit poinçons et ailes de papillon réglementaires.",
  },
  {
    id: 'madame_bougie',
    name: 'Madame Bougie',
    kind: 'merchant',
    roomId: '2',
    cell: { x: 2, y: 10 },
    disposition: 'neutral',
    visibleFromStart: true,
    description: "Tenancière de la foire, cire fondue dans les cheveux, sourire en flamme de veilleuse. Seule à savoir ouvrir le Portail des Vers Luisants — et ne l'ouvre qu'aux gens qu'elle apprécie.",
  },
  {
    id: 'barnabe',
    name: 'Barnabé',
    kind: 'shrub',
    roomId: '3',
    cell: { x: 19, y: 10 },
    disposition: 'helpful',
    visibleFromStart: true,
    description: "Arbuste éveillé en pot, employé du carrousel, s'ennuie à mourir. Rêve de voir le Bois-Ricanant — suivra le joueur si on l'emporte (compagnon de la transition).",
  },
  {
    id: 'pipotin',
    name: 'Pipotin',
    kind: 'barker',
    roomId: '4',
    cell: { x: 1, y: 1 },
    disposition: 'wary',
    visibleFromStart: true,
    description: "Gobelin bonimenteur, apprenti de Maître Filou. Sait où son patron s'est enfui avec l'ombre — et vend l'information contre trois compliments sincères ou une pièce.",
  },
  {
    id: 'ernestine',
    name: 'Ernestine',
    kind: 'musician',
    roomId: '6',
    cell: { x: 1, y: 6 },
    disposition: 'neutral',
    visibleFromStart: true,
    description: "Guenon à la vielle du Grand Chapiteau, cape couverte de boutons dépareillés. Joue volontairement faux — c'est la tradition de la foire. Collectionne les boutons des visiteurs et n'offre en échange qu'un sourire (c'est écrit sur sa pancarte).",
  },
  {
    id: 'theophile',
    name: 'Théophile',
    kind: 'tea_goblin',
    roomId: '7',
    cell: { x: 20, y: 6 },
    disposition: 'helpful',
    visibleFromStart: true,
    description: "Gobelin tisanier de la Théière à Bulles, ceinturon de petites cuillères. Ne parle qu'en rimes approximatives et exige qu'on lui réponde pareil. Vend des tours de bulle qui survolent TOUTE la foire.",
  },
  {
    id: 'mirabelle',
    name: 'Mirabelle',
    kind: 'bard',
    roomId: '8',
    cell: { x: 13, y: 5 },
    disposition: 'neutral',
    visibleFromStart: true,
    description: "Ménestrelle gnome installée sur une balançoire accrochée à un poirier. Semble tout savoir avant tout le monde, parle par énigmes, et jure que le héros est « exactement là où il doit être ». Personne ne l'a jamais vue payer son billet.",
  },
  {
    id: 'miroslav',
    name: 'Miroslav',
    kind: 'mime',
    roomId: '9',
    cell: { x: 8, y: 1 },
    disposition: 'wary',
    visibleFromStart: true,
    description: "Mime du Palais des Miroirs. Son REFLET a été gagé au bonneteau contre Maître Filou — il ne se voit plus dans aucune glace et communique exclusivement en mime. Frère d'infortune du héros, en plus silencieux.",
  },
  {
    id: 'tetes_jacassantes',
    name: 'Les Têtes Jacassantes',
    kind: 'oracle',
    roomId: '11',
    cell: { x: 7, y: 15 },
    disposition: 'neutral',
    visibleFromStart: true,
    description: "Trois têtes de pierre moussues empilées au carrefour. Donnent chacune une direction différente, avec un aplomb total, et se coupent la parole. L'une des trois dit toujours vrai — jamais la même.",
  },
  {
    id: 'capitaine_mirliton',
    name: 'Le Capitaine Mirliton',
    kind: 'brigand',
    roomId: '12',
    cell: { x: 2, y: 10 },
    disposition: 'wary',
    visibleFromStart: true,
    description: "Chef des brigands du péage, tricorne trop grand, mirliton en bandoulière. Son péage n'accepte que trois monnaies : une blague inédite, un secret honteux, ou dix pièces d'or (personne n'a jamais payé en or, ça le vexerait presque).",
  },
  {
    id: 'baronne_grenouille',
    name: 'La Baronne Grenouille',
    kind: 'frog_noble',
    roomId: '13',
    cell: { x: 13, y: 10 },
    disposition: 'neutral',
    visibleFromStart: true,
    description: "Grenouille géante à collerette de nénuphar, très à cheval sur l'étiquette du bal. Connaît le protocole exact pour saluer le Prince sans finir changé en tabouret.",
  },
  {
    id: 'ombre_soliste',
    name: "L'Ombre Soliste",
    kind: 'shadow',
    roomId: '15',
    cell: { x: 13, y: 6 },
    disposition: 'neutral',
    visibleFromStart: true,
    description: "Vedette du Bal des Ombres : l'ombre d'une danseuse étoile, gagée au bonneteau il y a cent ans. Danse divinement, boude théâtralement, et connaît LE pas de danse qui fait rire le Prince à tous les coups.",
  },
  {
    id: 'maitre_filou',
    name: 'Maître Filou',
    kind: 'trickster',
    roomId: '16',
    cell: { x: 5, y: 1 },
    disposition: 'wary',
    visibleFromStart: true,
    description: "Farfadet tricheur qui a gagné l'ombre du héros au bonneteau — avec des cartes peintes à la main, toutes identiques. L'ombre dépasse de sa sacoche et fait des signes.",
  },
  {
    id: 'prince_farces',
    name: 'Le Prince des Farces',
    kind: 'archfey',
    roomId: '16',
    cell: { x: 9, y: 1 },
    disposition: 'wary',
    visibleFromStart: false,
    description: "Archifée du Bois-Ricanant, invisible tant qu'il n'a pas ri. Collectionne les ombres bien repassées mais respecte quiconque le fait rire ou joue franc jeu.",
  },
]

export const FEY_SHADOW_FAIR_NAMED_LOCATION_CELLS: Array<{ id: string; pattern: RegExp; cell: GridCell }> = [
  { id: 'madame_bougie', pattern: /\b(madame bougie|bougie|chandeliere|chandelière|tenanciere|tenancière)\b/, cell: { x: 2, y: 10 } },
  { id: 'billetterie', pattern: /\b(billetterie|billets?|nicodeme|nicodème)\b/, cell: { x: 7, y: 14 } },
  { id: 'firefly_gate', pattern: /\b(portail|vers luisants|arche luisante)\b/, cell: { x: 16, y: 2 } },
]

export const FEY_SHADOW_FAIR_ROOM_NAVIGATION_ALIASES: Array<{ roomId: string; pattern: RegExp }> = [
  { roomId: '1', pattern: /\b(pre|pré|lanternes?|entree de la foire|entrée de la foire|prairie|billetterie)\b/ },
  { roomId: '2', pattern: /\b(allee|allée|baraques?|stands?|echoppes?|échoppes?|boutiques?|chandelles?)\b/ },
  { roomId: '3', pattern: /\b(carrousel|manege|manège|limaces?|escargots?|course|piste)\b/ },
  { roomId: '4', pattern: /\b(tente|bonneteau|table de jeu|cartes)\b/ },
  { roomId: '5', pattern: /\b(portail|vers luisants|arche)\b/ },
  { roomId: '6', pattern: /\b(chapiteau|cirque|spectacle|numeros?|numéros?|vielle)\b/ },
  { roomId: '7', pattern: /\b(theiere|théière|bulles?|the|thé|tisane)\b/ },
  { roomId: '8', pattern: /\b(verger|ripailles?|banquet|gateaux?|gâteaux?|concours|festin)\b/ },
  { roomId: '9', pattern: /\b(palais|miroirs?|glaces?|reflets?)\b/ },
  { roomId: '10', pattern: /\b(clairiere|clairière|champignons?)\b/ },
  { roomId: '11', pattern: /\b(carrefour|tetes?|têtes?|panneaux?|affiches?|croisee|croisée)\b/ },
  { roomId: '12', pattern: /\b(peage|péage|pont|brigands?|mirliton)\b/ },
  { roomId: '13', pattern: /\b(mare|etang|étang|grenouilles?|gavotte|nenuphars?|nénuphars?)\b/ },
  { roomId: '14', pattern: /\b(sentier|chiens?[- ]clins?)\b/ },
  { roomId: '15', pattern: /\b(bal des ombres|ronde des ombres|estrade|scene|scène|soliste)\b/ },
  { roomId: '16', pattern: /\b(cour|prince|trone|trône)\b/ },
]

export const FEY_SHADOW_FAIR_DOOR_TRANSITIONS: AdventureTransition[] = [
  // ── Foire ──
  { fromRoomId: '1', toRoomId: '2' },
  { fromRoomId: '1', toRoomId: '3', pattern: /\b(carrousel|manege|manège|limaces?|escargots?)\b/ },
  { fromRoomId: '2', toRoomId: '1', pattern: /\b(pre|pré|lanternes?|billetterie)\b/ },
  { fromRoomId: '2', toRoomId: '3', pattern: /\b(carrousel|manege|manège|limaces?|escargots?)\b/ },
  { fromRoomId: '2', toRoomId: '6', pattern: /\b(chapiteau|cirque|spectacle)\b/ },
  { fromRoomId: '2', toRoomId: '8', pattern: /\b(verger|ripailles?|banquet)\b/ },
  { fromRoomId: '3', toRoomId: '2' },
  { fromRoomId: '3', toRoomId: '7', pattern: /\b(theiere|théière|bulles?)\b/ },
  { fromRoomId: '6', toRoomId: '4' },
  { fromRoomId: '6', toRoomId: '8', pattern: /\b(verger|ripailles?)\b/ },
  { fromRoomId: '4', toRoomId: '9' },
  { fromRoomId: '8', toRoomId: '9', pattern: /\b(palais|miroirs?)\b/ },
  { fromRoomId: '8', toRoomId: '6', pattern: /\b(chapiteau|cirque)\b/ },
  { fromRoomId: '8', toRoomId: '7', pattern: /\b(theiere|théière|bulles?)\b/ },
  { fromRoomId: '7', toRoomId: '5' },
  { fromRoomId: '9', toRoomId: '5' },
  // ── Bois ──
  { fromRoomId: '10', toRoomId: '11' },
  { fromRoomId: '11', toRoomId: '12', pattern: /\b(peage|péage|pont|brigands?)\b/ },
  { fromRoomId: '11', toRoomId: '13', pattern: /\b(mare|grenouilles?|gavotte)\b/ },
  { fromRoomId: '12', toRoomId: '14' },
  { fromRoomId: '13', toRoomId: '15' },
  { fromRoomId: '14', toRoomId: '16' },
  { fromRoomId: '15', toRoomId: '16' },
]

export const FEY_SHADOW_FAIR_FORWARD_TRANSITIONS: AdventureTransition[] = [
  { fromRoomId: '1', toRoomId: '2' },
  { fromRoomId: '2', toRoomId: '6' },
  { fromRoomId: '6', toRoomId: '4' },
  { fromRoomId: '4', toRoomId: '9' },
  { fromRoomId: '9', toRoomId: '5' },
  { fromRoomId: '10', toRoomId: '11' },
  { fromRoomId: '11', toRoomId: '12' },
  { fromRoomId: '12', toRoomId: '14' },
  { fromRoomId: '14', toRoomId: '16' },
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
        label: 'Passer au Carrousel de Limaces (et rencontrer Barnabé)',
        required: false,
        check: { type: 'roomVisited', roomId: '3' },
      },
      {
        id: 'console_mime',
        label: 'Consoler Miroslav, le mime au reflet gagé, au Palais des Miroirs',
        required: false,
        check: { type: 'npcDisposition', npcId: 'miroslav', disposition: 'helpful' },
      },
      {
        id: 'taste_orchard',
        label: 'Goûter aux réjouissances du Verger aux Ripailles',
        required: false,
        check: { type: 'roomVisited', roomId: '8' },
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
        check: { type: 'roomVisited', roomId: '16' },
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
      {
        id: 'pass_toll',
        label: 'Régler le péage du Capitaine Mirliton sans y laisser sa chemise',
        required: false,
        check: { type: 'npcDisposition', npcId: 'capitaine_mirliton', disposition: 'helpful' },
      },
      {
        id: 'dance_shadows',
        label: "Danser avec l'Ombre Soliste au Bal des Ombres",
        required: false,
        check: { type: 'npcDisposition', npcId: 'ombre_soliste', disposition: 'helpful' },
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
    arrivalCell: { x: 4, y: 21 },
    arrivalRoomId: '10',
    // Barnabé l'arbuste éveillé saute dans le sac du héros et traverse avec lui.
    companions: ['barnabe'],
    pattern: /\b(portail|vers luisants|bois[- ]ricanant|foret|forêt)\b/,
  },
]

// Accroches mécaniques par salle, injectées dans le prompt dynamique du DM.
export const FEY_SHADOW_FAIR_ROOM_HOOKS: Record<string, string> = {
  '1': [
    "Salle d'ambiance et d'exposition : lampions, odeur de pomme d'amour, vielle jouée faux exprès. Chaque lanterne murmure un compliment au passant — celles près du héros toussotent, gênées.",
    "Nicodème Minuit, token visible en (7,14) : billettiste gobelin, longue-vue + cornet acoustique (détecteurs de mensonges déguisés). Le héros a DÉJÀ son billet à huit poinçons (inventaire) — Nicodème le vérifie avec une lenteur théâtrale.",
    "DD 11 Perception (roll_ability_check) → remarquer que sous tant de lanternes croisées, TOUT LE MONDE projette quatre ombres — sauf le héros, qui n'en projette aucune (moment gênant, les enfants dessinent une ombre à la craie pour « l'aider »).",
    "DD 12 Charisme (roll_ability_check) auprès de Nicodème ou des badauds → apprendre que Madame Bougie (Allée, salle 2) décide de QUI passe le Portail des Vers Luisants.",
  ].join('\n'),
  '2': [
    'Madame Bougie a son token visible en (2,10) : neutre, marchande de chandelles-souvenirs qui chuchotent.',
    "DD 13 Persuasion OU un vrai service rendu (tire-goussets réglés, compliment non flagorneur) → reveal_npc({ npcId: \"madame_bougie\", disposition: \"helpful\" }) : elle promet d'ouvrir le portail. OBJECTIF DE QUÊTE (charm_bougie). Flagornerie grossière → offended pour une scène.",
    'Deux tire-goussets gobelins détroussent les badauds : start_encounter("fair_pickpockets") si le joueur les prend sur le fait (DD 12 Perception) ou s\'il se fait voler sa bourse (échec). Combat évitable : DD 12 Intimidation les fait tout rendre. Objectif optionnel stop_pickpockets.',
    "Jeux forains le long de l'allée : lancer d'anneaux sur almiraj téléporteur (DD 13 DEX) et concours de poésie gnome (DD 13 CHA) — un succès vaut un lot (babiole féerique au choix du DM, à ajouter via add_item).",
  ].join('\n'),
  '3': [
    'Le carrousel tourne à dos de limaces géantes (une lenteur assumée et payante) ; à côté, la Piste d\'Escargots accueille des courses d\'escargots de compétition. Barnabé, arbuste éveillé en pot, token visible en (19,10), disposition helpful.',
    "Entrer dans la salle suffit à l'objectif optionnel ride_carousel (trigger_room_event enter).",
    'DD 10 Charisme (roll_ability_check) avec Barnabé → il supplie qu\'on l\'emmène au Bois-Ricanant : rappeler au joueur qu\'il TRAVERSERA avec lui (compagnon de la transition firefly_gate).',
    "Course d'escargots (1 poinçon) : jockey d'un escargot de course, DD 12 Sagesse (Dressage, roll_ability_check) → victoire, lot + ovation. La limace de tête (elle parle, très lentement) souffle que Maître Filou a « fiiilé côté Boiiis » (indice vers la tente et le portail).",
  ].join('\n'),
  '4': [
    "Pipotin le bonimenteur, token visible en (1,1), wary : il garde la tente de Maître Filou (parti la veille avec l'ombre).",
    'ENTRER dans la salle (trigger_room_event enter) remplit l\'objectif REQUIS find_filou_trail : Pipotin lâche que son patron a filé par le Portail des Vers Luisants vers le Bois-Ricanant.',
    "DD 12 Persuasion (ou 1 po) → Pipotin donne en plus le conseil : « Le Prince rend tout à qui le fait rire. Tout. Même les ombres. »",
    'DD 12 Investigation sur la table → un jeu de cartes oublié, TOUTES l\'as de trèfle (preuve de triche, précieuse à la Cour).',
    'Accuser la maison de tricher SANS preuve → start_encounter("bonneteau_bouncers") : le videur satyre et le croupier gobelin défendent la réputation de la baraque. Combat évitable : DD 13 CHA, excuse publique en vers (le satyre est sensible à la métrique).',
  ].join('\n'),
  '5': [
    "L'arche du portail est éteinte tant que Madame Bougie n'est pas helpful : narrer des vers luisants endormis, refus doux du passage.",
    "Quand le joueur franchit DÉLIBÉRÉMENT le portail (et confirme, car c'est SANS RETOUR) → travel_to_map({ toMapId: \"wood\" }). Si le moteur refuse (MAP_QUEST_INCOMPLETE), les vers luisants forment les mots des objectifs manquants dans l'air, avec une faute d'orthographe.",
    "Rappeler ce qui serait laissé derrière : tire-goussets impunis, Barnabé (salle 3) si le joueur ne lui a pas parlé, Miroslav inconsolé, achats non faits.",
  ].join('\n'),
  '6': [
    "Sous le Grand Chapiteau : contorsionniste halfeline qui tient dans une boîte à chapeau, jongleuse gobeline qui rattrape TOUT ce qu'on lui lance (huit objets max — elle le précise), clowns gnomes en canon. Ernestine la guenon à vielle, token visible en (1,6), neutre : quémande UN bouton avec sa pancarte rimée.",
    "Donner un bouton (ou un objet équivalent) → reveal_npc({ npcId: \"ernestine\", disposition: \"helpful\" }) : plus tard, sa vielle couvrira une gaffe du héros au moment opportun (avantage narratif, une fois).",
    "Chahuter le spectacle ou lancer un neuvième objet à la jongleuse → les loups savants ratent leur numéro de cerceaux et s'échappent : start_encounter(\"circus_wolves\"). Combat évitable : DD 12 Sagesse (Dressage) ou leur tendre un cerceau — ils sautent au travers et saluent.",
  ].join('\n'),
  '7': [
    'Théophile le gobelin tisanier, token visible en (20,6), helpful : il ne parle qu\'en rimes et vend des tours de bulle (1 poinçon).',
    "Lui répondre en rimes (DD 12 CHA, roll_ability_check) → il offre un sachet de « thé d'aplomb » : le boire donne de l'aplomb pour UNE scène sociale (avantage narratif à faire valoir, add_item).",
    "Tour de bulle : la bulle s'élève et survole TOUTE la foire — décrire les neuf attractions vues du ciel (moment d'exposition idéal). DD 10 DEX (roll_ability_check) → diriger la bulle et la faire éclater au-dessus de la salle de son choix (move_token vers l'entrée de cette salle) ; échec → atterrissage au hasard, dans un arbre ou sur le toit d'une baraque.",
  ].join('\n'),
  '8': [
    "Tables de banquet, échassiers qui cueillent les fruits, une quantité déraisonnable de crème anglaise. Mirabelle la ménestrelle gnome, token visible en (13,5), neutre, sur sa balançoire : cryptique, elle sait déjà pourquoi le héros est là.",
    "ENTRER dans la salle remplit l'objectif optionnel taste_orchard (trigger_room_event enter).",
    "Concours de gâteaux des fées (1 poinçon) : trois DD 10 CON (roll_ability_check) d'affilée → victoire, le lot est un petit gâteau d'invisibilité (add_item, une utilisation). Un échec = moustache de crème (dégâts d'orgueil uniquement).",
    "Raconter honnêtement sa mésaventure à Mirabelle (DD 12 CHA) → elle offre un couplet porte-bonheur : « Le Prince rend tout à qui le fait rire » (recoupe le conseil de Pipotin) et souffle qu'un mime de la foire a perdu PLUS qu'une ombre.",
    'Renverser le buffet ou insulter la crème anglaise → le Grand Flan s\'anime, vexé : start_encounter("feast_flan"). Combat évitable : DD 12 CHA, en reprendre une part avec conviction.',
  ].join('\n'),
  '9': [
    "Les miroirs vieillissent ou rajeunissent qui s'y regarde — et TOUS montrent le héros AVEC son ombre (pincement au cœur garanti, elle lui manque). Miroslav le mime, token visible en (8,1), wary : son REFLET a été gagé au bonneteau contre Maître Filou.",
    "Comprendre son mime (DD 12 Sagesse, roll_ability_check — ou lui prêter de quoi écrire) → il « raconte » : Filou triche TOUJOURS avec des as de trèfle, et le reflet de Miroslav est parti dans la même sacoche que l'ombre du héros.",
    "Le consoler ou promettre de ramener son reflet (DD 12 CHA) → reveal_npc({ npcId: \"miroslav\", disposition: \"helpful\" }) : OBJECTIF optionnel console_mime. Il offre son béret porte-bonheur (add_item) et mime un standing ovation.",
    'Se moquer des reflets ou toiser les miroirs avec morgue → deux reflets sortent du cadre, vexés : start_encounter("mirror_reflections"). Combat évitable : DD 12 CHA, se complimenter soi-même dans le miroir (ils rougissent et rentrent).',
  ].join('\n'),
  '10': [
    "SALLE D'ARRIVÉE de la transition. Les champignons violets ricanent à chaque pas du joueur (moqueurs mais inoffensifs si on ne les vexe pas).",
    'Les piétiner, les insulter avec talent ou rire PLUS fort qu\'eux (DD 12 CHA raté) → start_encounter("mocking_mushrooms"). Combat évitable : s\'incliner en disant « bien joué », ils saluent en retour.',
    "DD 12 Perception (roll_ability_check) → traces de petits souliers pointus (Maître Filou) vers le nord, et un panneau : « Cour du Prince : tout droit, puis deuxième gauche après l'éclat de rire. »",
    "Si Barnabé a traversé : il s'enracine deux minutes d'émerveillement (« De la VRAIE terre, monsieur ! »), puis sert de guide-boussole approximatif mais enthousiaste.",
  ].join('\n'),
  '11': [
    "Carrefour : trois têtes de pierre moussues (token unique en (7,15), neutres) donnent chacune une direction différente vers la Cour, avec un aplomb total. L'une dit vrai — jamais la même. Elles se notent mutuellement (« Médiocre. Trois sur dix. »).",
    "DD 12 Intelligence (recouper les indications) OU DD 12 CHA (les faire réciter en canon, elles adorent) → la vraie route : le péage à l'ouest (salle 12) PUIS le sentier (14), ou la mare à l'est (13) PUIS le bal (15). Bonus : elles révèlent le protocole — « Ne JAMAIS s'incliner en premier devant le Prince. »",
    "Sur un tronc, des affiches : « RECHERCHÉ : l'Invité Sans Ombre. Récompense : un rire. » — le portrait du HÉROS, plutôt flatteur. Le Prince sait déjà qu'il arrive (à jouer en aparté comique).",
    "Si Barnabé est là : il se dispute avec une des têtes sur la définition du mot « buisson » et perd.",
  ].join('\n'),
  '12': [
    "Un pont de rondins sur un ruisseau qui glousse. Le Capitaine Mirliton, token visible en (2,10), wary : tricorne trop grand, il exige un péage — au choix : une blague INÉDITE, un secret honteux, ou 10 po (personne n'a jamais payé en or, ça le vexerait presque).",
    "Blague inédite ou secret honteux sincère (DD 12 CHA, roll_ability_check) → reveal_npc({ npcId: \"capitaine_mirliton\", disposition: \"helpful\" }) : OBJECTIF optionnel pass_toll. Toute la bande salue au mirliton (faux, évidemment) et il offre un raccourci commenté vers le sentier.",
    'Passer en force, enjamber le péage ou marchander avec morgue → start_encounter("toll_brigands"). Combat évitable : DD 12 CHA, excuse présentée en fanfare (ils fournissent les mirlitons).',
    "Payer les 10 po fonctionne aussi (remove_item) mais le Capitaine est VEXÉ (« C'est d'un banal... ») et le raconte à tout le bois — désavantage narratif d'ambiance jusqu'à la Cour.",
  ].join('\n'),
  '13': [
    'La Baronne Grenouille, token visible en (13,10), neutre : elle fait répéter la gavotte à ses demoiselles grenouilles sur des nénuphars dallés.',
    "DD 12 Persuasion OU accepter une danse (DD 11 DEX, roll_ability_check) → reveal_npc({ npcId: \"baronne_grenouille\", disposition: \"helpful\" }) : elle enseigne le protocole du Prince (« Ne JAMAIS s'incliner en premier : il faut le faire rire d'abord »). OBJECTIF optionnel befriend_baroness.",
    'Marcher sur un nénuphar réservé ou refuser grossièrement la danse → start_encounter("frog_gavotte") : deux grenouilles de bal offensées. Combat évitable : DD 12 CHA, excuse dansée sur trois temps.',
  ].join('\n'),
  '14': [
    'Des chiens-clins (blink dogs) jouent à « tu me vois, tu me vois plus » sur le sentier — ils VOLENT un objet du joueur en se téléportant (le miroir de poche fêlé, idéalement).',
    'Leur courir après ou les menacer → start_encounter("blink_pack"). Combat évitable : DD 12 SAG (comprendre la règle du jeu) ou leur lancer quelque chose à rapporter.',
    "Jeu réussi → ils rendent l'objet, ouvrent le passage vers la Cour et hurlent-annoncent le joueur comme « l'Invité Qui Joue » (avantage social salle 16).",
  ].join('\n'),
  '15': [
    "Une estrade de clair de lune entre les arbres : les ombres gagées au fil des siècles y répètent leur spectacle. L'Ombre Soliste, token visible en (13,6), neutre — vedette du bal, ombre d'une danseuse étoile perdue au bonneteau il y a cent ans.",
    "L'inviter à danser (DD 11 DEX OU DD 12 CHA, roll_ability_check) → reveal_npc({ npcId: \"ombre_soliste\", disposition: \"helpful\" }) : OBJECTIF optionnel dance_shadows. Elle apprend au héros LE pas qui fait rire le Prince à tous les coups (avantage à la Cour) et glisse, du bout des doigts : « La tienne parle de toi, tu sais. En bien. Surtout. »",
    'Traverser la scène pendant le numéro ou marcher sur une ombre → start_encounter("shadow_cotillon") : trois ombres-cotillons offensées. Combat évitable : DD 12 CHA, révérence dansée (jamais s\'incliner… sauf ici, c\'est un PAS de danse, elles apprécient l\'ironie).',
  ].join('\n'),
  '16': [
    "SALLE FINALE. Maître Filou, token visible en (5,1), wary — l'ombre volée dépasse de sa sacoche et fait des signes désespérés au joueur (le reflet de Miroslav aussi, s'il faut un gag de plus). Le Prince des Farces est présent mais INVISIBLE (token caché) : on n'entend que son fauteuil grincer d'impatience.",
    "Faire rire le Prince (farce, autodérision, blague sur Filou, numéro de Barnabé, LE pas de l'Ombre Soliste…) DD 13 CHA (roll_ability_check — avantage narratif si l'Invité Qui Joue, le pas de la Soliste, le thé d'aplomb ou le couplet de Mirabelle s'appliquent) OU dénoncer la triche de Filou preuve à l'appui (cartes toutes as de trèfle, DD 12 INT) → reveal_npc({ npcId: \"prince_farces\", disposition: \"helpful\" }) : il éclate de rire, se matérialise et ordonne à Filou de rendre l'ombre (et le reflet de Miroslav). OBJECTIF FINAL recover_shadow.",
    "S'incliner en premier, exiger, ou menacer → le Prince (toujours invisible) lance sa Grande Farce : start_encounter(\"princes_jest\") — feu follet majordome + lutins duellistes. Combat évitable même engagé : DD 13 CHA en riant de soi-même.",
    "Ombre rendue : elle se recoud aux talons du héros en faisant semblant de bouder. Si console_mime est fait : le reflet de Miroslav rentre aussi, plié dans une enveloppe. Le Prince offre une chandelle de Madame Bougie « pour le retour » (clin d'œil : il n'y a PAS de retour — c'est sa dernière farce). FIN du module.",
  ].join('\n'),
}

// Agrégat consommé par le registre lib/adventure-map.ts (getAdventureMap).
export const FEY_SHADOW_FAIR_MAP: AdventureMapData = {
  maps: [
    // cellSize 64 = rendu net à la résolution native des images (64 px/case) ;
    // les deux cartes débordent du conteneur → viewport scrollable.
    { id: 'fair', name: 'La Foire aux Chandelles', grid: { cols: 24, rows: 16 }, cellSize: 64 },
    { id: 'wood', name: 'Le Bois-Ricanant', grid: { cols: 16, rows: 24 }, cellSize: 64 },
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
      { id: 'fair_ticket', name: 'Billet de la Foire (8 poinçons)', type: 'misc', description: "Acheté hier soir à Nicodème Minuit. Chaque attraction coûte un poinçon. Il en reste huit — la soirée d'hier s'est arrêtée au bonneteau." },
      { id: 'butterfly_wings', name: 'Ailes de papillon en tissu', type: 'misc', description: 'Réglementaires pour tout visiteur de la foire. Ne permettent PAS de voler (c\'est écrit dessus, quelqu\'un a demandé).' },
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
