import type { AdventureSocialData, SocialProfile } from '../../lib/social'
import { WOOD_SOCIAL_TABLES } from './wood-social'
const npc = (goal: string, likedTopics: string[], tabooTopics: string[]): SocialProfile =>
  ({ influenceable: true, goals: [goal], likedTopics, tabooTopics })
const character = (goal: string, ideal: string, bond: string, traits: string[],
  tabooTopics: string[], likedTable: string): SocialProfile => ({
  ...npc(goal, [], tabooTopics),
  personality: { ideals: [ideal], bonds: [bond], traits },
  randomize: { likedTopics: likedTable },
})
export const FEY_SHADOW_FAIR_SOCIAL: AdventureSocialData = {
  tables: {
    ...WOOD_SOCIAL_TABLES,
    ticketer_likes: { description: 'Sujet apprécié de Nicodème, tiré une fois par nouvelle partie (table maison).', entries: [
      'Vieilles histoires', 'Devinettes', 'Objets anciens', 'Traditions féeriques',
    ] },
    ticketer_dislikes: { description: 'Sujet sensible de Nicodème, tiré une fois par nouvelle partie (table maison).', entries: [
      'Moqueries sur son âge', 'Impatience', 'Interruptions', 'Mépris de son métier',
    ] },
    candlekeeper_likes: { description: 'Sujet apprécié de Madame Bougie, tiré une fois par nouvelle partie (table maison).', entries: [
      'Souvenirs heureux', 'Artisanat', 'Histoires de voyage', 'Petites attentions',
    ] },
    shrub_likes: { description: 'Sujet apprécié de Barnabé, tiré une fois par nouvelle partie (table maison).', entries: [
      'Grandes forêts', 'Voyages', 'Animaux étranges', 'Récits d’aventure',
    ] },
    barker_likes: { description: 'Sujet apprécié de Pipotin (table maison).', entries: [
      'Tours de bonneteau', 'Belles formules', 'Récits de réussite', 'Petites affaires',
    ] },
    musician_likes: { description: 'Sujet apprécié d’Ernestine (table maison).', entries: [
      'Boutons anciens', 'Couture', 'Costumes de spectacle', 'Souvenirs du chapiteau',
    ] },
    tea_maker_likes: { description: 'Sujet apprécié de Théophile (table maison).', entries: [
      'Mélanges de thé', 'Jeux de rimes', 'Histoires de bulles', 'Collection de petites cuillères',
    ] },
    bard_likes: { description: 'Sujet apprécié de Mirabelle (table maison).', entries: [
      'Poésie', 'Histoires vraies', 'Mélodies anciennes', 'Rencontres inattendues',
    ] },
    mime_likes: { description: 'Sujet apprécié de Miroslav, évoqué sans le faire parler (table maison).', entries: [
      'Pantomime', 'Gestes délicats', 'Scènes comiques silencieuses', 'Souvenirs d’artistes',
    ] },
    oracle_likes: { description: 'Sujet apprécié des Têtes Jacassantes, profil commun aux trois têtes (table maison).', entries: [
      'Énigmes', 'Débats contradictoires', 'Chants en canon', 'Questions de géographie',
    ] },
    captain_likes: { description: 'Sujet apprécié du Capitaine Mirliton (table maison).', entries: [
      'Blagues inédites', 'Histoires de fanfare', 'Secrets racontés avec sincérité', 'Moustaches et tricornes',
    ] },
    baroness_likes: { description: 'Sujet apprécié de la Baronne Grenouille (table maison).', entries: [
      'Danses de cour', 'Étiquette féerique', 'Musique d’orchestre', 'Élégance des nénuphars',
    ] },
    soloist_likes: { description: 'Sujet apprécié de l’Ombre Soliste (table maison).', entries: [
      'Ballet', 'Souvenirs de scène', 'Duos improvisés', 'Clair de lune',
    ] },
    trickster_likes: { description: 'Sujet apprécié de Maître Filou (table maison).', entries: [
      'Jeux de hasard', 'Marchandages', 'Tours de passe-passe', 'Histoires de ruses',
    ] },
    prince_likes: { description: 'Sujet apprécié du Prince des Farces (table maison).', entries: [
      'Farces inventives', 'Autodérision', 'Numéros inattendus', 'Jeux loyaux',
    ] },
  },
  npcDefault: npc('Préserver la magie de la foire', ['Jeux loyaux'], ['Violence gratuite']),
  monsterDefault: { influenceable: true,
    goals: ['Garder sa place dans le bois'], likedTopics: ['Cadeaux', 'Jeux'], tabooTopics: ['Humiliation', 'Menaces'] },
  npcs: {
    nicodeme: {
      ...npc('Contrôler les entrées et faire respecter les usages de la foire', [], []),
      personality: {
        ideals: ['Tout le monde peut s’amuser, à condition de jouer le jeu.'],
        bonds: ['La foire et son poste de billettiste, dont il est fier.'],
        traits: ['Feint la surdité.', 'Procède avec une lenteur cérémonieuse.', 'Pratique un humour pince-sans-rire.'],
      },
      randomize: { likedTopics: 'ticketer_likes', tabooTopics: 'ticketer_dislikes' },
    },
    madame_bougie: {
      ...npc('Préserver la foire et aider les visiteurs bienveillants', [], ['Flagornerie grossière', 'Désordre violent']),
      personality: {
        ideals: ['La bonté se prouve par des actes.'],
        bonds: ['La foire, ses forains et ses chandelles-souvenirs.'],
        traits: ['Chaleureuse et maternelle.', 'Perspicace.', 'Possède une répartie piquante.'],
      },
      randomize: { likedTopics: 'candlekeeper_likes' },
    },
    barnabe: {
      ...npc('Découvrir le Bois-Ricanant avec un compagnon de voyage', [], ['Abandon', 'Le traiter comme un objet']),
      personality: {
        ideals: ['Avoir des racines n’oblige pas à rester immobile.'],
        bonds: ['Son pot, sa petite maison, et ceux qui le considèrent comme un compagnon.'],
        traits: ['Curieux et enthousiaste.', 'Naïf et bavard.', 'S’émerveille facilement.'],
      },
      randomize: { likedTopics: 'shrub_likes' },
    },
    pipotin: character('Gagner reconnaissance et récompenses grâce à ses talents de bonimenteur',
      'Un talent mérite d’être reconnu.', 'La baraque de bonneteau et son statut d’apprenti de Maître Filou.',
      ['Vantard et théâtral.', 'Rusé et susceptible.', 'Sensible aux compliments sincères.'],
      ['Humiliation publique', 'Menaces contre lui'], 'barker_likes'),
    ernestine: character('Enrichir sa collection de boutons',
      'Un sourire sincère vaut plus qu’une promesse de récompense.', 'Sa cape de boutons et les artistes du Grand Chapiteau.',
      ['Chaleureuse.', 'Joue volontairement faux selon la tradition de la foire.', 'Compte et coud ses boutons avec une gravité comique.'],
      ['Mépris de sa musique', 'Arracher les boutons de sa cape'], 'musician_likes'),
    theophile: character('Partager son thé et ses rimes',
      'Les mots comme le thé gagnent à être partagés.', 'La Théière à Bulles et son ceinturon de petites cuillères.',
      ['Généreux et enthousiaste.', 'Parle uniquement en rimes approximatives.', 'Exige qu’on lui réponde en rimes.'],
      ['Mépris de ses rimes'], 'tea_maker_likes'),
    mirabelle: character('Guider les visiteurs par ses chansons',
      'La vérité porte plus loin quand elle se chante.', 'Son luth, sa balançoire et les récits des voyageurs.',
      ['Énigmatique et bienveillante.', 'Sourit comme si elle savait déjà la fin de l’histoire.', 'Guide par des énigmes sans dévoiler les confidences soumises à un jet.'],
      ['Cynisme méprisant'], 'bard_likes'),
    miroslav: character('Retrouver son reflet',
      'Être regardé comme une personne compte plus que les apparences.', 'Son reflet perdu et son art du mime.',
      ['Ne parle jamais : mime, ou écrit si on lui donne de quoi écrire.', 'Expressif et mélancolique.', 'S’attache à ceux qui prennent le temps de le comprendre.'],
      ['Moquerie de son absence de reflet', 'Lui imposer de parler'], 'mime_likes'),
    tetes_jacassantes: character('Être écoutées et débattre au carrefour',
      'Toute question mérite trois réponses et un débat.', 'Le carrefour, ses chemins et leur rivalité fraternelle.',
      ['Se coupent la parole et se notent mutuellement.', 'Chacune est sûre d’avoir raison.', 'Une tête dit vrai à la fois, jamais toujours la même.', 'Adorent réciter en canon.'],
      ['Les réduire au silence', 'Se moquer de leur intelligence'], 'oracle_likes'),
    capitaine_mirliton: character('Obtenir un péage divertissant et sauver la face de sa bande',
      'L’esprit et la sincérité valent mieux que l’or.', 'Sa bande de brigands, son mirliton et le péage.',
      ['Théâtral et susceptible.', 'Joue faux avec un aplomb militaire.', 'Préfère une blague inédite ou un secret sincère à un paiement banal.'],
      ['Mépris du péage', 'Humiliation de sa bande'], 'captain_likes'),
    baronne_grenouille: character('Faire respecter le protocole du bal',
      'Les bonnes manières permettent à chacun de trouver sa place.', 'Le bal, son orchestre et sa collerette de nénuphar.',
      ['Digne et exigeante sur l’étiquette.', 'Coasse avec emphase.', 'Apprécie les excuses sincères et bien dansées.'],
      ['Grossièreté', 'Moqueries sur son apparence'], 'baroness_likes'),
    ombre_soliste: character('Retrouver le plaisir de danser et être reconnue comme une artiste',
      'La grâce d’un geste vaut la dignité d’une personne.', 'L’art du ballet et les souvenirs de sa danseuse.',
      ['Danse avec grâce.', 'Boude théâtralement.', 'S’exprime surtout par le mouvement, mais peut glisser quelques mots.'],
      ['Moquerie de sa captivité', 'Interrompre son numéro'], 'soloist_likes'),
    maitre_filou: character('Conserver ses gains et sauver la face',
      'La ruse vaut davantage que la force.', 'Sa sacoche, ses gains et son statut auprès du Prince.',
      ['Mielleux dans les négociations.', 'Fuyant quand on exige des preuves.', 'Triche au bonneteau.', 'Craint d’être démasqué devant le Prince.'],
      ['Dénonciation de sa triche', 'Humiliation devant le Prince'], 'trickster_likes'),
    prince_farces: character('Être surpris par un divertissement digne de lui',
      'Le jeu loyal et l’esprit valent mieux que les titres.', 'Sa cour, ses spectacles et sa collection d’ombres.',
      ['Théâtral et capricieux.', 'Apprécie l’autodérision et les farces inventives.', 'Respecte ceux qui jouent franc jeu.', 'Reste invisible tant qu’il n’a pas ri.'],
      ['Ennui', 'Flagornerie', 'Exigences autoritaires'], 'prince_likes'),
  },
  monsterTypes: {
    violet_fungus: { influenceable: false,
      refusalReason: 'Ce champignon ne comprend pas les interactions sociales.', goals: ['Se nourrir'], likedTopics: [], tabooTopics: [] },
    zombie: { influenceable: false,
      refusalReason: 'Ce mort-vivant ne répond pas aux arguments, menaces ou mensonges.', goals: ['Suivre son ordre'], likedTopics: [], tabooTopics: [] },
  },
}
