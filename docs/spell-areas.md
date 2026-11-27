# Zones de sorts — PHB 2014

Le moteur utilise les profils sourcés de Mains brûlantes (cône de 15 pieds),
Onde de choc (cube de 15 pieds), Éclair (ligne de 100 pieds sur 5), Fracassement
(sphère de rayon 10), Boule de feu (sphère de rayon 20) et Colonne de flamme
(cylindre de rayon 10 et hauteur 40). Aucun argument ne crée un profil, une
dimension, un sort connu, un emplacement ou une cible supplémentaire.

Sources locales : `rules/books/phb-2014.md`, **A Clear Path to the Target**
(6308–6312), **Areas of Effect / Cone / Cube / Cylinder / Line / Sphere**
(6329–6368), **Flame Strike** (10032–10044). Le profil littéral et sa licence
figurent dans `lib/srd/spell-area-sources.json` et son fichier LICENSE.

`cast_spell`, `cast_creature_spell`, les sorts préparés avec Ready,
`use_spell_scroll` et la baguette de Boule de feu acceptent `area`. L'origine
contient `x`, `y` en cellules de cinq pieds et `zFeet` dans le repère de la
carte. Le cône et la ligne exigent un vecteur `direction` explicite, normalisé
par le moteur. Le cube ajoute `faceU` perpendiculaire et `faceOffset` en pieds :
l'origine peut être placée sur toute sa face, bord compris. Le cylindre exige
`verticalDirection` et le `surfaceId` réel de sa base ; une origine au sommet
descend de la hauteur sourcée jusqu'à cette base. Sphère et cylindre incluent
leur origine ; cône, cube et ligne l'excluent sauf `includeOrigin:true`.

Le volume de ligne emploie une section circulaire de diamètre égal à la largeur
sourcée. C'est une convention géométrique du moteur pour la dimension verticale
non détaillée par ce passage, pas une clarification officielle ni une variante
activée depuis du texte. Les cibles sont évaluées à leur position XY réelle,
sur l'intervalle vertical de leur corps observé. Les anciennes commandes
`toCell`/`direction` conservent leur convention du point de référence du pion
sur le plan plat Z0 ; elles n'inventent aucune taille corporelle pour un calcul
spatial. Une vraie question d'intersection dépendant d'une hauteur inconnue
refuse précisément avant dé ou coût. Un corps déjà présent dans le volume à
ses pieds peut être atteint sans inventer sa hauteur totale.

Les appuis, la hauteur réelle de vol et les mesures de corps/posture viennent
du registre unique `dmTools.jumping`. Les outils `record_vertical_surface`,
`observe_standing_surface` et `record_physical_body` enregistrent des faits MJ,
sans déplacer, faire atterrir ou transformer un acteur. Un corps passé à terre
n'hérite pas silencieusement de sa hauteur debout.

`declare_vertical_barrier` mesure le bas, le haut et, si nécessaire, l'opacité
d'un mur, d'une porte, d'une cellule effectivement bloquée, d'un support, d'un
obstacle physique ou d'une référence de couverture existants.
`remove_vertical_barrier` retire seulement la mesure ; il ne retire pas le mur.
`inspect_vertical_barriers` distingue source ouverte/détruite et mesure périmée.
Les identités d'événements, empreintes physiques et limites persistent ; changer
de nonce ne change pas la hauteur du même objet. Détruire ou déplacer un vrai
support référencé rend sa mesure inactive. Une ancienne mesure devenue fausse
n'est pas réemployée pour un rayon ou un saut.

La propagation suit la vraie géométrie physique, indépendamment de la visibilité
du pion et du brouillard de connaissance. La couverture totale retranche les
parties effectivement bloquées. Pour le cylindre, l'expansion est d'abord
radiale dans le cercle de base/sommet, puis verticale : aucun rayon diagonal
ne remplace cette procédure. Boule de feu exige un chemin réellement libre à
l'intérieur de sa sphère pour contourner un angle ; elle n'ignore pas toute
couverture. Si la recherche bornée ne prouve aucun chemin et qu'une issue
dépend de hauteurs ou d'espace hors carte non représentés, le moteur refuse
précisément plutôt qu'inventer un passage ou un mur infini.

Une origine ponctuelle obstruée et non visible est replacée sur le côté proche
du premier obstacle opaque, selon le passage Clear Path ; origine demandée et
origine réelle restent toutes deux dans le résultat. Une barrière explicitement
transparente bloque le chemin physique sans feindre cette absence de vision.
Si cette correction rend la base d'un cylindre indéterminée, un vrai nouvel
emplacement doit être choisi avant lancement.

Les fractions de couverture restent une observation du MJ. `configure_cover`
accepte `spatial:{originZFeet,barrierId}` pour ancrer le grade à la vraie origine,
au support/posture de la cible et à l'obstacle mesuré. Une ancienne observation
XY ne fournit pas automatiquement un bonus dans une nouvelle configuration
verticale. Les bonus de +2/+5 ne s'additionnent pas ; ils ne concernent que les
sauvegardes de Dextérité. La couverture totale n'est jamais un bonus numérique.
Une origine ponctuelle spatiale peut être entre deux cases ; `inspect_cover`
accepte alors `originZFeet` pour lire le même témoin exact. Une barrière dont
le rayon ne rencontre aucune partie du corps observé ne peut recevoir un
grade par simple déclaration.

Colonne de flamme possède sa vraie voie jouable par parchemin de clerc de niveau
5, rare, DD 17. Au-dessus du plus haut niveau normalement accessible, le lecteur
fait son vrai test d'aptitude DD 15 : un échec détruit le parchemin sans dégâts.
Aucun niveau de personnage ni emplacement n'est ajouté. Les deux jets de 4d6,
feu puis radiant, sont conservés avec leurs fenêtres réelles de réaction.
Les sauvegardes de toutes les cibles sont résolues avant toute application de
dégâts. Chaque composante est divisée et arrondie séparément lors d'une réussite,
puis reçoit ses défenses propres ; cette combinaison des passages demi-dégâts
et résistance est l'interprétation explicite du moteur, sans arbitrage officiel
supplémentaire revendiqué. Les types identiques sont regroupés avant défenses.
Le paquet simultané n'applique les PV temporaires, PV, Protection contre la mort,
dégâts à 0 PV et concentration qu'une fois. Le radiant réel empêche la Robustesse
de mort-vivant ; aucun type représentatif fictif ne remplace les composantes.
Une vraie surincantation autorisée exige le choix explicite `upcastDamageType`
feu ou radiant ; un parchemin conserve son niveau fixe.

Les jets, choix, témoins spatiaux et identités de dégâts persistent dans une
reprise. Une configuration physique changée pendant un jet tenu refuse avant
un nouveau dé ou coût. Les poussées d'Onde de choc utilisent la vraie direction
qui éloigne du lanceur et prévalident leur chemin, y compris les contacts au
sol. Un déplacement vertical forcé encore non représenté est refusé avant
le lancement ; les autres volumes spatiaux restent utilisables.

`inspect_spell_area` est un aperçu confidentiel MJ, jamais un lancement. Les
corps cachés réellement présents peuvent subir une zone sans être découverts,
enrôlés ni rendus ciblables directement. Le contexte distingue les cibles
confidentielles et celles déjà perceptibles pour la narration. Comme pour les
portes cachées, le transport actuel de l'état mécanique intégral n'est pas une
frontière de confidentialité contre l'inspection technique du client ; aucune
projection publique complète de l'état n'est revendiquée par ce lot.
