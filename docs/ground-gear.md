# Billes, chausse-trappes et piège de chasse — PHB 2014

Ce lot utilise les passages fournis du PHB 2014 : table d’équipement
(billes : 1 000/1 po/2 lb ; chausse-trappes : 20/1 po/2 lb ; piège :
5 po/25 lb), puis entrées `Ball Bearings` (ligne 4253), `Caltrops`
(4259) et `Hunting Trap` (4289). Le catalogue ne donne aucun équipement
au joueur et n’achète rien implicitement.

## Procédures

| Équipement réel | Pose | Contact et conséquence |
| --- | --- | --- |
| Sac de 1 000 billes | Une action, carré réellement nivelé de 10 pieds | Traverser : DEX DD 10 ou à terre. Déplacement à demi-vitesse : aucun jet. |
| Sac de 20 chausse-trappes | Une action, carré de 5 pieds | Entrer : DEX DD 15 ou arrêt du mouvement pour ce tour et 1 perforant. Si ces dégâts sont effectivement subis, vitesse de marche −10 pieds jusqu’au gain réel d’au moins 1 PV. Demi-vitesse : aucun jet. |
| Piège de chasse | Une action, vraie fixation immobile et chaîne réelle, habituellement 3 pieds | Marcher sur la petite plaque : DEX DD 13 ou 1d4 perforant et arrêt du mouvement. Le dispositif se referme même si la sauvegarde réussit ; il faut une nouvelle action réelle pour le réarmer. La chaîne limite les destinations physiques. Une action et un test de Force DD 13 libèrent soi-même ou une autre créature à portée ; un échec inflige 1 perforant au captif. |

Le piège ne donne ni `restrained` ni une vitesse de zéro. L’arrêt de mouvement
des chausse-trappes ne se renouvelle pas grâce à Action Surge ; sa pénalité
de marche ne s’applique pas au vol et ne se cumule pas par pointe.
Stabilisation, PV temporaires et soin plafonné à zéro ne constituent pas un
gain de PV. Une résistance ou immunité peut ramener les dégâts à zéro :
l’arrêt source subsiste, mais aucune blessure réduisant la marche n’est créée.

## Outils et choix explicites

- `place_ground_gear` déplace un vrai lot possédé, avec mains disponibles,
  surface actuelle, provenance et fixation réelle pour le piège.
- `set_ground_gear_pace` conserve le choix explicite `normal`/`careful`.
  La marche prudente paie le double de son coût réel ; elle ne donne pas une
  immunité à une poussée ou une réception de saut.
- `resolve_ground_gear_contact` résout un contact réellement enregistré.
  Le MJ choisit l’ordre complet des dispositifs simultanés et indique,
  avec provenance physique, si la petite plaque a effectivement été pressée.
  La cellule du piège n’est pas une plaque de 5 pieds inventée.
- `escape_hunting_trap` et `reset_hunting_trap` emploient leurs actions,
  mains, portée et éventuel test réels.
- `start_ground_gear_recovery`, `continue_ground_gear_recovery`,
  `finish_ground_gear_recovery`, `cancel_ground_gear_recovery` séparent
  préparation, travail et acquisition physique de la collecte.

Un déplacement engagé peut s’arrêter sur un vrai contact. Ses coûts déjà
payés sont conservés ; la résolution reprend seulement la même marche,
réception ou suite d’effet qui avait été explicitement choisie. Les jets
d’Inspiration suspendus, les ordres choisis et les résultats survivent à la
sauvegarde. Rejouer le même événement ne déplace, ne blesse et ne dépense
rien une deuxième fois. Un contact dû bloque les autres mutations de position,
actions ou avances de temps avant leur coût.

Les historiques legacy incomplets sont refusés avant les premiers dés de
sauvegarde, de dégâts ou d’Inspiration : corps vivant à zéro PV sans épisode
établi, roster d’un corps suivi absent, poison de sprite ou affliction sans
témoin de suspension dans la pierre. Le même préflight protège un vrai
contact avec l’huile au sol avant le déplacement. Aucun épisode de mort,
onset ou passé manquant n’est fabriqué pour contourner le refus.

`enter_combat.hazardPreparation={kind:'ground_gear',hazardId}` permet de
préparer explicitement les tours avant l’approche d’un vrai danger actif et
physiquement atteignable. Cela ne déplace personne, ne déclenche aucun
contact et ne crée aucun adversaire. Les corps réellement concernés restent
dans le roster exigé, y compris lorsqu’ils sont cachés ; leur visibilité
n’est pas changée par la résolution mécanique.

## Vérité physique et stocks

La pose retire le vrai objet de l’inventaire. Une collecte partielle retire
uniquement les unités effectivement ramassées et laisse le reliquat et sa
couverture réelle. Elle exige un vrai récipient explicitement choisi, de la
capacité et une provenance de la couverture restante. Aucun sac plein n’est
recréé depuis dix pointes. Le récipient d’origine vide et son contenu peuvent
être représentés séparément ; déposer, lancer ou ramasser le récipient
transfère les mêmes unités, dans la même pièce physique. Une unité encore
attachée à son récipient ne peut pas être sélectionnée directement comme
un objet libre, y compris avant le jet d’un lancer.

La repose source exige un lot complet dans l’instance ou le stock choisi.
Plusieurs stocks partiels ne sont pas fusionnés automatiquement ; une nouvelle
aire partielle ou la réunion matérielle de plusieurs lots n’a pas de procédure
publique dans ce lot. Les quantités partielles restent conservées et transportables.

La masse partielle n’est pas une fraction supposée des 2 lb du sac plein.
Quand le portage en dépend, une vraie mesure du contenu et du récipient vide
est requise. Le temps de collecte et la nouvelle couverture partielle sont
des adjudications explicites du MJ, pas des nombres publiés par cette entrée.
Le travail est réel, interrompu par les frontières d’activité et ne devient
pas une collecte achevée après une perte de conscience.

Les contacts utilisent `entityGroundContact` et les appuis/hauteurs réels.
Un profil possédant une vitesse de vol ne prouve pas qu’il vole. Un vrai corps
entièrement porté ne touche pas le sol par sa seule projection XY ; pousser
ou traîner un corps conserve sa propre vérité de contact. Les coûts prudents,
les contacts de marche, réception et déplacement forcé utilisent le dispatch
physique commun, sans moteur de déplacement parallèle.

## Interprétations annoncées et limites

- Hors combat, une action de pose/libération/réarmement achevée emploie
  6 secondes de travail réel : convention du moteur, pas durée PHB ajoutée.
- Une traversée du carré de billes produit un jet ; parcourir sa deuxième
  sous-cellule ne produit pas un deuxième jet. Sortir puis rentrer constitue
  une nouvelle traversée. Le premier pas hors d’un carré fraîchement couvert
  conserve le témoin réel du sol traversé.
- Le dispositif fermé suit le pied dans la limite de sa vraie chaîne.
  Une vraie téléportation peut quitter ce dispositif externe fixé au sol ;
  le piège reste fermé à sa dernière position et la référence au captif est
  retirée seulement au commit effectif, jamais au préflight ou sur un refus.
  Une arrivée ordinaire par passage intercartes conserve la vraie chaîne ;
  son changement de repère ne constitue pas une téléportation magique.
  C’est une adjudication explicite. Le [Sage Advice Compendium officiel,
  p. 19](https://media.wizards.com/2020/dnd/downloads/SA-Compendium.pdf)
  confirme le transport de l’équipement porté avec Misty Step ; il ne donne
  pas une règle particulière sur ce piège externe.
- Ouvrir les mâchoires sur un corps mort emploie le même test physique comme
  adjudication explicite ; aucun dégât de créature ni regain de vie n’en résulte.
- Les armes et couvertures XY refusent une interaction dont les vrais niveaux
  diffèrent ou restent inconnus tant que leur géométrie verticale n’est pas
  représentée. Deux appuis de même niveau connu restent utilisables. Un ancien
  grade XY de couverture ne suit pas implicitement un rebord : les déclarations
  spatiales emploient les témoins communs d’origine, barrière, corps et posture.
  Les objets sans hauteur mesurée ne reçoivent aucune altitude inventée.

Les validations ciblées de ce lot sont dans `tests/ground-gear.test.cjs`,
`tests/ground-gear-recovery.test.cjs`, les tests de contacts de C et
`tests/weapon-physical-height.test.cjs`. Les résultats effectivement exécutés
et les limites restantes sont consignés dans le suivi MCP canonique.

## Appels de l’IA et décision du joueur

La pose, le réarmement, la tentative de libération effectuée par le joueur et
le travail de collecte ou de transvasement sont de vraies actions principales.
Les segments explicitement choisis du même `recoveryId` ou `transferId`
appartiennent au même travail ; ils gardent les durées, objets et arguments
fournis par l’IA. Commencer un autre travail ou effectuer une autre action sans
rapport dans le même message est refusé. En combat, les actions restent dues
à chacun des véritables tours, même pour poursuivre ce travail.

Les appels `finish_ground_gear_recovery` et `finish_ground_gear_transfer`
constatent l’achèvement d’un travail déjà effectué et d’une durée réellement
écoulée : ils ne consomment aucune nouvelle action ou seconde. Les `cancel`
conservent les coûts déjà payés. Le choix de prudence et la résolution d’un
contact dû ne donnent aucun déplacement supplémentaire. Le serveur ne
fabrique aucun de ces appels ni leurs arguments ; l’agent doit les choisir.

Trois parcours API avec sauvegarde SQL vérifient la pose, une collecte en deux
segments et un transvasement en deux segments avec achèvement auxiliaire,
quantités et contenants conservés, puis refus d’une action ou d’un travail
sans rapport avant tout dé : `tests/dm-ground-gear.test.cjs`. Ils sont inclus
dans les96tests ciblés verts de la cohorte W16 ; sa validation complète est
suivie séparément dans le registre.
