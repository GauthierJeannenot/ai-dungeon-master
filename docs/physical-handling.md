# Transport physique de charges

`begin_handling_load` établit une prise réelle, `move_handled_load` déplace ensemble le joueur et sa charge vers **deux destinations explicites**, puis `release_handled_load` libère cette prise aux emplacements réellement atteints. Une inspection de capacité ne réalise aucune de ces actions.

| Contrôle choisi | Prérequis | Coût réel de saisie |
|---|---|---|
| Prise existante | Effet de grapple réel, exact et toujours actif | Aucun nouveau coût ; la prise a déjà été résolue |
| Créature vivante incapable d'agir, même à 0 PV | Incapacité réelle, main libre, taille et immunités valides | Un véritable remplacement d'attaque ; succès automatique sans dé |
| Créature capable et volontaire | Accord actuel explicitement établi, sans déduction de l'attitude | Une action : adjudication explicite du MJ |
| Objet intact ou cadavre réel | Mobilité confirmée, emprise et forme réelles | Interaction d'objet, ou action si le MJ exige un soin particulier |

L'autosuccès du grapple sur une cible incapable d'agir provient de l'errata officiel du PHB 2014, ajouté dans la version 2018 et repris dans [l'errata 2021, page 4](https://media.wizards.com/2021/dnd/downloads/PH-Errata.pdf#page=4). Ce n'est pas un échec automatique de test ou de sauvegarde. Le coût d'une saisie volontaire et le traitement physique d'un cadavre comme charge inanimée sont des adjudications annoncées selon *Other Activity* et *Improvising an Action* ; le moteur ne les présente pas comme une procédure universelle imprimée.

La masse doit être mesurée pour la charge actuelle entière. Un corps exige `includesCarriedEquipment=true` dans sa déclaration de masse : aucun inventaire de PNJ vide ou sans poids n'est supposé. Porter additionne le véritable inventaire du joueur et cette charge ; les acquisitions ultérieures comptent donc aussi la charge tenue. Pousser ou traîner utilise la limite FOR × 30 et réduit la vitesse à 5 pieds au-delà de la capacité portée, avant Dash. Une véritable prise conserve en plus sa demi-vitesse, sauf cible d'au moins deux tailles inférieures. Pousser une créature vivante demande son véritable résolveur Shove.

Les mains réservées utilisent le même calcul pour les armes, l'équipement et les composantes de sorts. Un grapple existant n'est pas compté deux fois. Une incapacité du porteur, la fin de la prise, une séparation réelle ou un changement de catégorie vivant/mort libère le contrôle ; aucun ancien reçu ne le recrée.

Les deux chemins respectent murs, portes, occupation, terrain difficile, diagonales et budget réel. La forme complète de l'objet est contrôlée : un obstacle Large conserve son véritable gabarit 2 × 2 déjà présent sur la grille ; un conteneur sans forme établie ne reçoit aucun gabarit inventé. Les corps gardent la projection actuelle des pions à une case, sans agrandissement global des créatures. Leurs destinations restent distinctes et adjacentes : aucune altitude ou position sur les épaules n'est simulée.

Seul le départ volontaire du porteur provoque une attaque d'opportunité. La réaction conserve la paire exacte pour sa reprise après sauvegarde. Une cible transportée ne gagne ni tour, ni action, ni déplacement volontaire ; les objets et cadavres ne déclenchent pas les effets d'entrée destinés aux créatures. Les contenus réellement attachés et non collectés suivent leur conteneur sans être acquis. Un levier lié à une porte n'est pas détaché automatiquement.

Le transport reste sur la carte active, avec des corps réellement modélisés et des objets existants. Un changement de carte exige une libération explicite préalable : aucun corps archivé n'est activé et aucune charge ne suit une téléportation de voyage. Les autres porteurs, le vol, les déplacements préparés, la verticalité et les ensembles de plus de deux corps restent refusés tant que leurs données et leur procédure physique ne sont pas modélisées.

Sources ciblées : PHB 2014 p.176, pp.190–195 ([livre local](../rules/books/phb-2014.md)), DMG 2014 *Objects* pp.246–247 ([livre local](../rules/books/dmg-2014.md)), [errata officiel 2018](https://media.wizards.com/2016/downloads/DND/PH-Errata.pdf).
