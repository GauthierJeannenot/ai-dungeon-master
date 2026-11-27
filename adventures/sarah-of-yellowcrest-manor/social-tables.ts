import type { AdventureSocialData } from '../../lib/social'

// Original preparation tables. Flavor adds no witness, item, clue or mechanical effect.
const table = (description: string, entries: string[]) => ({ description: `${description} (table maison).`, entries })
export const YELLOWCREST_SOCIAL_TABLES: NonNullable<AdventureSocialData['tables']> = {
  personal_ideals: table('Idéal secondaire, sans remplacer les convictions du rôle', [
    'Une promesse mérite d’être tenue.', 'La patience aide à comprendre.',
    'Les gestes comptent autant que les paroles.', 'Les petits témoignages de respect ont de la valeur.',
  ]),
  personal_bonds: table('Attache secondaire sans nouvel objet ni personnage', [
    'Le souvenir d’un moment paisible.', 'Une habitude familière et rassurante.',
    'Les marques de respect reçues dans les moments difficiles.', 'Le souvenir d’une aide discrète.',
  ]),
  personal_traits: table('Manière de réagir compatible avec le silence de Sarah', [
    'Observe longtemps avant de réagir.', 'Exprime son accord par un signe de tête.',
    'Prend un instant pour mesurer sa réponse.', 'Remarque les gestes de respect.',
  ]),
  personal_dislikes: table('Sujet sensible secondaire des interlocuteurs civils', [
    'Impatience devant une hésitation', 'Familiarité imposée', 'Promesses faites à la légère', 'Mépris des petites attentions',
  ]),
  sarah_likes: table('Sujet apprécié de Sarah, exprimé par gestes ou écrits avant les adieux', [
    'Apprentissage de l’écriture', 'Souvenirs de gestes bienveillants', 'Dessins de jardins', 'Lettres soigneusement tracées',
  ]),
  avowed_likes: table('Sujet apprécié de l’archiviste', [
    'Calligraphie', 'Méthodes de classement', 'Voyages documentés', 'Conservation des manuscrits',
  ]),
  arnulf_likes: table('Goût secondaire d’Arnulf ; son intérêt macabre reste fixe', [
    'Art de recevoir', 'Maisons bien entretenues', 'Étiquette de visite', 'Récits de la vie citadine',
  ]),
  vecken_likes: table('Sujet apprécié de Vecken, commun à ses deux représentations', [
    'Hospitalité autour du thé', 'Devoir envers les proches', 'Courage discret', 'Souvenirs de camaraderie',
  ]),
  cobbler_likes: table('Sujet apprécié du cordonnier', [
    'Travail du cuir', 'Outils bien entretenus', 'Chaussures de voyage', 'Savoir-faire artisanal',
  ]),
  kara_likes: table('Sujet apprécié de Kara, sans modifier ses connaissances sur Yaeda', [
    'Jardinage', 'Récoltes du village', 'Entraide entre voisins', 'Soins apportés aux plantes',
  ]),
  old_fargo_likes: table('Sujet apprécié du vieux Fargo sans révéler ses confidences', [
    'Recettes d’auberge', 'Hospitalité', 'Histoires de voyageurs sans indiscrétion', 'Entretien d’un foyer accueillant',
  ]),
  yaeda_likes: table('Sujet rassurant pour Yaeda ; ne vaut pas sauvetage des captifs', [
    'Aide concrète aux plus faibles', 'Projets simples après le retour', 'Repos dans un lieu sûr', 'Solidarité entre compagnons',
  ]),
  young_fargo_likes: table('Sujet apprécié de la recrue manipulée', [
    'Apprentissage patient', 'Exemples de courage sans cruauté', 'Possibilité de réparer une erreur', 'Reconnaissance d’un effort sincère',
  ]),
  keeper_likes: table('Sujet apprécié de la gardienne', [
    'Entretien des fleurs', 'Histoire des monuments', 'Gestes de recueillement', 'Souvenirs transmis avec respect',
  ]),
  cult_traits: table('Manie secondaire des fidèles ; aucun doute sur leur loyauté', [
    'Marque un silence pesant avant de réagir.', 'Garde une immobilité étudiée.',
    'Observe les mains de son interlocuteur.', 'Répète un geste rituel discret avant de répondre.',
  ]),
  cult_likes: table('Intérêt de mise en scène des fidèles, jamais levier de persuasion', [
    'Symboles rituels soigneusement tracés', 'Cérémonial ordonné', 'Discipline des officiants', 'Récitation exacte des formules',
  ]),
  cult_dislikes: table('Aversion secondaire des fidèles, sans influence sociale possible', [
    'Imprécision dans le cérémonial', 'Désordre dans les préparatifs', 'Interruption des formules', 'Désinvolture envers les symboles',
  ]),
  faerl_likes: table('Goût de Faerl, commun à ses deux positions ; aucune corruption possible', [
    'Étoffes luxueuses', 'Chapeaux élégants', 'Comptes impeccablement tenus', 'Confort des voyages en coche',
  ]),
  viallis_likes: table('Goût de Viallis sans affaiblir son fanatisme', [
    'Traités occultes anciens', 'Généalogies nobles', 'Calligraphie des formules', 'Mise en scène des cérémonies',
  ]),
  mercenary_likes: table('Goût du mercenaire du coche, distinct du garde cultiste', [
    'Contrats clairement établis', 'Pauses sans danger', 'Équipement solide', 'Itinéraires bien préparés',
  ]),
  mercenary_dislikes: table('Aversion secondaire du mercenaire', [
    'Ordres contradictoires', 'Risques inutiles', 'Mépris du travail de garde', 'Engagements imprécis',
  ]),
  grick_traits: table('Comportement non verbal du grick, sans dialogue humain', [
    'Hume longuement avant d’approcher.', 'S’immobilise pour observer les mouvements.',
    'Se replie près de la pierre avant d’avancer.', 'Tourne autour d’une odeur nouvelle.',
  ]),
  grick_likes: table('Stimulus favorable du grick, à établir concrètement dans la scène', [
    'Nourriture déposée à distance', 'Absence de mouvements brusques', 'Recul laissant un espace libre', 'Calme autour de sa cachette',
  ]),
  grick_dislikes: table('Stimulus défavorable du grick', [
    'Bruits métalliques répétés', 'Gestes brusques près de sa tête', 'Issues bloquées autour de lui', 'Approche insistante de sa cachette',
  ]),
}
