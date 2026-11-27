import type { AdventureSocialData, SocialProfile } from '../../lib/social'

// Campaign preparation tables: extra color must never overwrite the authored role.
export const WOOD_SOCIAL_TABLES: NonNullable<AdventureSocialData['tables']> = {
  wood_ideals: { description: 'Idéal secondaire compatible avec les jeux du bois (table maison).', entries: [
    'La curiosité mérite une chance.', 'Une bonne idée mérite d’être saluée.',
    'Chacun doit pouvoir trouver sa place dans un jeu.', 'Un moment partagé vaut mieux qu’une victoire solitaire.',
  ] },
  wood_bonds: { description: 'Attache secondaire narrative ; ne crée aucun objet ou PNJ (table maison).', entries: [
    'Le souvenir d’un jeu particulièrement réussi.', 'Une habitude partagée avec son groupe.',
    'Un endroit favori où regarder passer les visiteurs.', 'La reconnaissance de ceux qui ont déjà joué avec lui.',
  ] },
  wood_traits: { description: 'Manière secondaire de réagir, ajoutée aux traits fixes (table maison).', entries: [
    'Fait durer le suspense avant de réagir.', 'Imite les gestes des visiteurs pour les taquiner.',
    'Cherche les regards approbateurs de ses compagnons.', 'Remarque les petits détails que les autres négligent.',
  ] },
  wood_dislikes: { description: 'Sujet sensible secondaire, ajouté aux limites fixes (table maison).', entries: [
    'Vantardise sans esprit', 'Gâcher une plaisanterie par impatience',
    'Refuser de saluer après un jeu', 'Brusquer ses compagnons',
  ] },
  mushroom_likes: { description: 'Goût personnel des champignons moqueurs (table maison).', entries: [
    'Chutes sans gravité', 'Jeux de mots', 'Imitations comiques', 'Répliques pleines d’autodérision',
  ] },
  woodland_brigand_likes: { description: 'Goût personnel des brigands du péage (table maison).', entries: [
    'Fanfares improvisées', 'Anecdotes de voyage', 'Costumes extravagants', 'Saluts inventifs',
  ] },
  dancing_frog_likes: { description: 'Goût personnel des grenouilles de bal (table maison).', entries: [
    'Gavottes', 'Coassements harmonieux', 'Costumes de bal', 'Histoires d’invitations galantes',
  ] },
  blink_dog_likes: { description: 'Goût personnel des chiens-clins, exprimé par le jeu (table maison).', entries: [
    'Objets à rapporter', 'Cache-cache', 'Jeux calmes en groupe', 'Félicitations après un jeu',
  ] },
  cotillion_likes: { description: 'Goût personnel des ombres-cotillons (table maison).', entries: [
    'Figures de groupe', 'Saluts de scène', 'Histoires de spectacles', 'Reflets de lune',
  ] },
  courtier_likes: { description: 'Goût personnel des serviteurs de la Grande Farce (table maison).', entries: [
    'Entrées théâtrales', 'Duels de réparties', 'Révérences comiques', 'Numéros de jonglage',
  ] },
}

function group(goal: string, ideal: string, bond: string, traits: string[],
  tabooTopics: string[], likedTable: string): SocialProfile {
  return { influenceable: true,
    goals: [goal], personality: { ideals: [ideal], bonds: [bond], traits }, likedTopics: [], tabooTopics,
    randomizeMode: 'append', randomize: { ideals: 'wood_ideals', bonds: 'wood_bonds', traits: 'wood_traits',
      likedTopics: likedTable, tabooTopics: 'wood_dislikes' } }
}

export const WOOD_ENCOUNTER_SOCIAL: Record<string, SocialProfile> = {
  mocking_mushrooms: group('Se divertir sans être piétinés et répondre aux plaisanteries',
    'Un rire partagé vaut mieux qu’une blessure.', 'La clairière et les autres champignons moqueurs.',
    ['Ricanent à chaque geste des visiteurs.', 'Inoffensifs tant qu’on ne les vexe pas.', 'Saluent une reconnaissance sincère de leur plaisanterie.'],
    ['Les piétiner', 'Insultes sans esprit'], 'mushroom_likes'),
  toll_brigands: group('Tenir le péage avec leur capitaine et obtenir un divertissement',
    'Un péage réussi doit laisser une histoire à raconter.', 'La bande du Capitaine Mirliton et son péage.',
    ['Suivent leur capitaine.', 'Jouent du mirliton avec un sérieux comique.', 'Acceptent les excuses présentées en fanfare.'],
    ['Passage en force', 'Humiliation de leur bande'], 'woodland_brigand_likes'),
  frog_gavotte: group('Préserver le bon déroulement du bal et le respect de ses participants',
    'La courtoisie permet de danser ensemble.', 'La mare, les danseurs et l’orchestre du bal.',
    ['Respectent l’étiquette du bal.', 'Protègent les nénuphars réservés.', 'Accueillent les excuses sincères dansées sur trois temps.'],
    ['Piétiner les nénuphars réservés', 'Refus méprisant de la danse'], 'dancing_frog_likes'),
  blink_pack: group('Jouer à rapporter et reconnaître les visiteurs qui comprennent le jeu',
    'Le plaisir du jeu compte davantage que la possession du jouet.', 'La meute et ses compagnons de jeu.',
    ['Dérobent un objet pour inviter au jeu, pas pour le garder.', 'Ne cherchent jamais à tuer.', 'Rendent l’objet quand le jeu est compris.', 'Peuvent escorter et annoncer l’Invité Qui Joue après le jeu résolu.'],
    ['Menaces', 'Les poursuivre avant de comprendre le jeu'], 'blink_dog_likes'),
  shadow_cotillon: group('Protéger leur numéro et la dignité des danseurs du bal',
    'Un artiste mérite que l’on respecte sa scène.', 'Les autres ombres et le spectacle nocturne.',
    ['Dansent en groupe.', 'S’offensent si l’on traverse leur numéro ou marche sur une ombre.', 'Acceptent une excuse présentée en révérence dansée.'],
    ['Traverser la scène pendant le numéro', 'Marcher sur une ombre'], 'cotillion_likes'),
  princes_jest: group('Servir le Prince et jouer la Grande Farce qu’il a ordonnée',
    'La confrontation reste un spectacle au service de la cour.', 'La cour et le Prince des Farces.',
    ['Suivent les ordres du Prince.', 'Jouent leur rôle dans la Grande Farce.', 'La résolution par autodérision prévue par le module reste possible.'],
    ['Menaces contre la cour', 'Exigences autoritaires'], 'courtier_likes'),
}
