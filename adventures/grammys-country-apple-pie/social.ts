import type { AdventureSocialData, SocialProfile } from '../../lib/social'

const npc = (goals: string[], likedTopics: string[], tabooTopics: string[]): SocialProfile =>
  ({ influenceable: true, goals, likedTopics, tabooTopics })
const dryad: SocialProfile = {
  ...npc(['Protéger les pommiers et se divertir'], ['Nature', 'Danse', 'Offrandes respectueuses'], ['Abattre les arbres', 'Mépris des esprits']),
  personality: {
    ideals: ['La nature mérite le respect ; la joie et les jeux valent mieux que la violence.'],
    bonds: ['Les pommiers du verger et les deux autres dryades.'],
    traits: ['Malicieuse et joueuse.', 'Farouche avec les inconnus ; se cache avant de leur faire confiance.', 'Rit et glousse volontiers quand elle est à l’aise.'],
  },
}

// Original campaign tables. Goals are never randomized.
const randomize: NonNullable<SocialProfile['randomize']> = {
  ideals: 'bakery_ideals', bonds: 'bakery_bonds', traits: 'bakery_traits',
  likedTopics: 'bakery_likes', tabooTopics: 'bakery_dislikes',
}
export const GRAMMYS_SOCIAL: AdventureSocialData = {
  tables: {
    bakery_ideals: { description: 'Idéaux des occupants, compatibles avec leurs buts fixes (table maison).', entries: [
      'Le partage : un bon repas se déguste mieux quand chacun reçoit sa part.',
      'La liberté : personne ne devrait décider à ma place de la manière dont je vis.',
      'Le mérite : les actes et les talents comptent davantage que les grands titres.',
      'La prudence : un compromis raisonnable vaut mieux qu’une victoire dangereuse.',
      'La curiosité : essayer une méthode nouvelle est le meilleur moyen d’apprendre.',
      'La loyauté : une promesse envers ma bande mérite d’être tenue.',
      'Le confort : une vie tranquille et un repas chaud sont de vraies richesses.',
      'La fierté : les gobelins méritent autant de respect que les autres peuples.',
    ] },
    bakery_bonds: { description: 'Attaches affectives, sans création automatique de PNJ ou d’objet (table maison).', entries: [
      'Ma bande est la famille que je me suis choisie.',
      'Je garde un souvenir tendre des repas de mon enfance.',
      'Je tiens à l’apprenti à qui j’ai promis de montrer comment cuisiner.',
      'Un camarade m’a déjà sorti d’un mauvais pas ; je veux lui rendre la pareille.',
      'J’aimerais rapporter un jour une bonne recette aux miens.',
      'J’ai beaucoup d’affection pour les cuisiniers patients qui expliquent sans se moquer.',
      'La boulangerie représente pour moi la chance de mener une vie meilleure.',
      'Je voudrais que les autres reconnaissent enfin un talent dont je suis fier.',
    ] },
    bakery_traits: { description: 'Traits et manière de parler, indépendants du but principal (table maison).', entries: [
      'Je bavarde et donne volontiers des surnoms aux gens que je rencontre.',
      'Je parle peu, observe beaucoup et réponds après avoir pesé mes mots.',
      'Je fais des plaisanteries quand je suis nerveux.',
      'Je suis méticuleux et compare tout à une recette à suivre dans l’ordre.',
      'Je suis curieux et pose sans cesse de petites questions.',
      'Je me vante de mes talents, mais rougis devant un compliment sincère.',
      'Je suis méfiant au début, puis chaleureux avec ceux qui tiennent parole.',
      'Je m’exprime avec de grands gestes et dramatise les petits désagréments.',
    ] },
    bakery_likes: { description: 'Sujets appréciés en plus du but fixe de manger des tartes (table maison).', entries: [
      'Recettes de famille', 'Astuces de cuisson', 'Histoires drôles', 'Travail bien fait',
      'Musique et chansons', 'Souvenirs de bons repas', 'Petites inventions utiles', 'Compliments sincères sur ses talents',
    ] },
    bakery_dislikes: { description: 'Sujets sensibles personnels (table maison).', entries: [
      'Moqueries sur les fournées ratées', 'Insultes contre les gobelins', 'Gaspillage de nourriture',
      'Humiliation publique', 'Promesses volontairement trompeuses', 'Mépris du travail des cuisiniers',
      'Propositions de partager des parts injustes', 'Railleries sur sa manière de parler',
    ] },
  },
  npcDefault: npc(['Protéger la boulangerie'], ['Entraide'], ['Destruction gratuite']),
  monsterDefault: { influenceable: true,
    goals: ['Préserver son territoire'], likedTopics: ['Nourriture'], tabooTopics: ['Menaces'] },
  npcs: {
    mac: {
      ...npc(['Préserver les pommiers', 'Faire respecter la cour'], ['Souvenirs de Grammy', 'Soin des arbres'], ['Feu', 'Haches', 'Insultes contre Grammy']),
      personality: {
        ideals: ['Protéger le vivant et faire respecter les lieux sans violence inutile.'],
        bonds: ['Les pommiers, les arbustes de la cour et le souvenir de Grammy.'],
        traits: ['Bougon et réservé ; ne s’implique pas si on le laisse tranquille.', 'Protecteur quand les plantes sont menacées.', 'Cherche à neutraliser les agresseurs, jamais à les tuer.'],
      },
    },
    dryad_1: dryad, dryad_2: dryad, dryad_3: dryad,
  },
  monsterTypes: {
    // Goblinoids retain their SRD combat stats and authored social personalities.
    goblin: { ...npc(['Manger des tartes'], [], []), randomize },
    // Ordered goals: survival always takes precedence over appetite or a drawn trait.
    hobgoblin: { ...npc(['Survivre', 'Manger des tartes'], [], []), randomize },
    violet_fungus: { influenceable: false,
      refusalReason: 'Le champignon ne comprend ni arguments, ni menaces, ni mensonges.',
      goals: ['Se nourrir'], likedTopics: [], tabooTopics: [] },
  },
}
