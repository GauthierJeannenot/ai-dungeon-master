import type { AdventureContent } from '../../lib/adventures'
import { FEY_SHADOW_FAIR_MAP } from './map'

// Contenu APP du module « La Foire du Voleur d'Ombres ». Voir le commentaire de
// tête de adventures/grammys-country-apple-pie/definition.ts pour la frontière
// moteur/app. Module MULTI-MAPS de référence : battlemapImages fournit une image
// par mapId (la grille de chaque map vient de map.ts — source de vérité unique).
// Les deux cartes sont GRANDES (viewport scrollable, cellSize 64) : 1536×1024
// et 1024×1536, la résolution native maximale des images générées par ChatGPT.

const WELCOME =
  "La Foire aux Chandelles ne s'installe au pré communal qu'aux nuits de lune-miel : un chapiteau à trois pointes, une théière géante qui crache des bulles, un carrousel à dos de limaces — et hier soir, tu y as perdu quelque chose d'embarrassant : ton ombre. Gagée au bonneteau contre Maître Filou, un farfadet aux cartes trop parfaites, envolée avec lui vers le Bois-Ricanant. Sous les lampions, les badauds gloussent en montrant tes talons nus de toute silhouette. La rumeur dit que seule Madame Bougie ouvre le Portail des Vers Luisants — et qu'elle ne l'ouvre qu'aux gens qu'elle apprécie. Ton billet d'hier a encore huit poinçons. Que fais-tu ?"

const PLACEHOLDERS: Record<string, string[]> = {
  default: [
    'Complimenter une chandelière, suivre une piste de souliers pointus, oser le carrousel...',
    "Faire rire une fée, marchander un indice, garder sa bourse à l'œil...",
  ],
  '2': [
    'Aborder Madame Bougie, surveiller les tire-goussets, tenter un jeu forain...',
    "Rendre un service à la gardienne du portail, acheter une chandelle-souvenir...",
  ],
  '5': [
    'Franchir le portail (sans retour !), vérifier ses affaires, dire adieu à la foire...',
    "S'assurer que Barnabé est du voyage, respirer un grand coup, passer l'arche...",
  ],
  '7': [
    "Payer un tour de bulle, répondre en rimes à Théophile, viser une attraction depuis le ciel...",
    'Survoler la foire en bulle, humer la tisane, tenter une rime...',
  ],
  '9': [
    'Déchiffrer le mime de Miroslav, se regarder (avec ombre) dans les glaces, rester poli avec les reflets...',
    "Consoler le mime, chercher un indice sur Filou, éviter de toiser les miroirs...",
  ],
  '12': [
    'Préparer une blague inédite, avouer un secret honteux, négocier avec le Capitaine...',
    "Payer le péage avec de l'esprit, admirer le mirliton, garder ses 10 po...",
  ],
  '16': [
    "Faire rire le Prince, dénoncer la triche de Filou, saluer APRÈS la blague...",
    "Tenter le pas de l'Ombre Soliste, produire les cartes truquées, réclamer son ombre poliment...",
  ],
}

const ROOM_STATUS_HINTS: Record<string, string> = {
  '1': "La foire scintille: montre ton billet a Nicodeme, cherche ton ombre, remonte vers les attractions.",
  '2': "Madame Bougie tient le portail: rends-lui service, charme-la, ou regle leur compte aux tire-goussets.",
  '3': 'Le carrousel de limaces tourne, les escargots s\'elancent: paie un tour, parle a Barnabé, joue les jockeys.',
  '4': 'La tente de Filou: interroge Pipotin, fouille la table, evite d\'accuser sans preuve.',
  '5': 'Le portail attend: confirme ton depart (sans retour) ou finis tes affaires ici.',
  '6': 'Le Grand Chapiteau: applaudis les numeros, donne un bouton a Ernestine, ne chahute pas les loups savants.',
  '7': 'La Theiere a Bulles: rime avec Theophile, paie un tour de bulle, survole toute la foire.',
  '8': 'Le Verger aux Ripailles: tente le concours de gateaux, ecoute Mirabelle, respecte la creme anglaise.',
  '9': 'Le Palais des Miroirs: dechiffre le mime de Miroslav, console-le, reste poli avec les reflets.',
  '10': 'Les champignons ricanent: passe ton chemin, cherche des traces, ne les vexe pas.',
  '11': 'Les Tetes Jacassantes se contredisent: recoupe leurs directions, lis les affiches, choisis ta route.',
  '12': 'Le peage du Capitaine Mirliton: paie d\'une blague inedite, d\'un secret honteux, ou passe a tes risques.',
  '13': 'Le bal des grenouilles: danse, apprends le protocole, ou contourne la mare.',
  '14': 'Les chiens-clins veulent jouer: comprends leur jeu ou cours apres ton miroir.',
  '15': 'Le Bal des Ombres repete: invite la Soliste a danser, apprends LE pas, ne marche sur aucune ombre.',
  '16': 'La Cour du Prince: fais-le rire AVANT de saluer, ou denonce la triche de Filou.',
}

export const FEY_SHADOW_FAIR_CONTENT: AdventureContent = {
  id: 'fey-shadow-fair',
  title: "La Foire du Voleur d'Ombres",
  tagline: 'Ton ombre est partie au Feywild — elle, au moins, savait danser',
  description:
    "À la Foire aux Chandelles, le héros a perdu son ombre au bonneteau contre un farfadet tricheur. Pour la récupérer : neuf attractions féeriques (chapiteau, théière à bulles, palais des miroirs, courses d'escargots…), une gardienne de portail à charmer, une traversée SANS RETOUR vers le Bois-Ricanant — péage à blagues, bal d'ombres et chiens téléporteurs compris — et, au bout, un archifée collectionneur d'ombres à faire rire. Deux grandes cartes, zéro seconde chance, beaucoup de fous rires.",
  level: 'Niveau 3 · D&D 5e',
  duration: '~3-4 h',
  accent: 'emerald',
  battlemapImage: '/battlemaps/fey-shadow-fair-fair.png',
  battlemapImages: {
    fair: '/battlemaps/fey-shadow-fair-fair.png',
    wood: '/battlemaps/fey-shadow-fair-wood-zelda.png',
  },
  scenes: {
    fair: {
      image: '/adventures/fey-shadow-fair/fair-aerial.png',
      alt: 'La Foire aux Chandelles vue de haut : tente du bonneteau, palais des miroirs et portail au nord ; grand chapiteau, allée des baraques et carrousel au centre ; pré aux lanternes, verger et théière à bulles au sud.',
      width: 1536,
      height: 1024,
      hint: 'Choisis un repère sur la foire ou son bouton dans la légende pour demander au MJ de t’y rendre.',
      hotspots: FEY_SHADOW_FAIR_MAP.rooms
        .filter(room => room.mapId === 'fair')
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map(room => ({
          id: `fair_room_${room.id}`,
          destinationRoomId: room.id,
          marker: room.id,
          label: room.id === '3' ? 'Carrousel et piste d’escargots' : room.name,
          roomIds: FEY_SHADOW_FAIR_MAP.rooms.filter(candidate => candidate.mapId === 'fair').map(candidate => candidate.id),
          message: room.id === '5'
            ? 'Je me rends devant le Portail des Vers Luisants, sans le franchir ni quitter la foire.'
            : `Je me rends au lieu « ${room.name} ».`,
          // Anchor every pin to the engine zone, independently of illustration size.
          bounds: {
            x: (room.zone.minX + room.zone.maxX + 1) / (2 * FEY_SHADOW_FAIR_MAP.maps[0].grid.cols) * 100 - 3,
            y: (room.zone.minY + room.zone.maxY + 1) / (2 * FEY_SHADOW_FAIR_MAP.maps[0].grid.rows) * 100 - 4,
            width: 6,
            height: 8,
          },
        })),
      npcOverlays: [],
    },
  },
  // Source de vérité unique : la grille du moteur (map.ts, première map). Pas de duplication.
  grid: FEY_SHADOW_FAIR_MAP.maps[0].grid,
  welcomeMessage: WELCOME,
  chatPlaceholders: PLACEHOLDERS,
  roomStatusHints: ROOM_STATUS_HINTS,
  // Prémisse commune du module : le héros a gagé son OMBRE au bonneteau (les
  // cartes étaient truquées). Elle suit désormais Maître Filou au Bois-Ricanant.
  // Chaque personnage la vit à sa manière.
  characterHooks: {
    fighter: "Vainqueur de la boulangerie de Grammy et de la Crypte des Marées, tu as commis une erreur de débutant hier soir : tu as gagé ton OMBRE au bonneteau (les cartes étaient truquées — elles l'étaient). Elle suit maintenant Maître Filou dans la Foire aux Chandelles. Tu ne projettes plus aucune ombre, et tu vis TRÈS mal les gloussements.",
    bard: "Toi qui vis d'illusions et de tours de scène, te faire plumer au bonneteau ? Le comble — et pourtant Maître Filou t'a soutiré ton OMBRE avec des cartes truquées. Elle le suit dans la Foire aux Chandelles. Récupère-la, et fais-en au moins une chanson.",
    wizard: "Une ombre gagée au bonneteau ne se sépare pas d'un corps par magie ordinaire — et c'est pourtant ce que Maître Filou a fait de la tienne. Fascinant, humiliant, et à corriger. Elle le suit dans la Foire aux Chandelles.",
    cleric: "Ton ombre — part de ton âme, diraient les anciens — t'a été soustraite au bonneteau par Maître Filou. La récupérer dans la Foire aux Chandelles est autant une affaire spirituelle qu'une question d'orgueil.",
  },
  promptGuidance: {
    movementExample: 'je vais au carrousel de limaces',
    namedPlaces:
      "le Pré aux Lanternes, l'Allée des Baraques, le Carrousel de Limaces et la Piste d'Escargots, la Tente du Bonneteau, le Grand Chapiteau, la Théière à Bulles, le Verger aux Ripailles, le Palais des Miroirs, le Portail des Vers Luisants — puis, au Bois-Ricanant : la clairière des champignons, le Carrefour des Têtes Jacassantes, le Péage des Brigands, la Mare aux Grenouilles, le Sentier des Chiens-Clins, le Bal des Ombres, la Cour du Prince",
    visibleNpcExample: 'Nicodème, Madame Bougie et Barnabé dès le départ sur la foire',
    nonHostileNpcs: "Nicodème Minuit, Madame Bougie, Pipotin, Barnabé l'arbuste, Ernestine, Théophile, Mirabelle, Miroslav le mime, les Têtes Jacassantes, le Capitaine Mirliton, la Baronne Grenouille, l'Ombre Soliste, Maître Filou, le Prince des Farces",
    actionExamples: [
      '- "je complimente madame bougie sur ses chandelles" → appelle roll_ability_check, ability=cha, dc≈13.',
      '- "j\'attrape le tire-gousset la main dans mon sac" → appelle start_encounter.',
      '- "je franchis le portail des vers luisants" → appelle travel_to_map.',
      '- "je monte dans une bulle de la théière et je vise le portail" → appelle roll_ability_check, ability=dex, dc≈10.',
      '- "je paie le péage d\'une blague inédite" → appelle roll_ability_check, ability=cha, dc≈12 ; après réussite confirmée, choisis reveal_npc si la scène le justifie, avec un npcId exact du profil brigand présent.',
      '- "je danse la gavotte avec la baronne" → appelle roll_ability_check, ability=dex, dc≈11 ; après réussite confirmée, choisis reveal_npc si la scène le justifie, avec un npcId exact du profil frog_noble présent.',
      '- "je raconte au prince comment j\'ai perdu mon ombre comme un idiot" → appelle roll_ability_check, ability=cha, dc≈13 ; après réussite confirmée, choisis reveal_npc si la scène le justifie, avec un npcId exact du profil archfey présent.',
      '- "je contemple les lampions / c\'est quoi cette foire ?" → dialogue ou description sans effet mécanique.',
    ],
  },
}
