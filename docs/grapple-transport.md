# Déplacer une créature tenue — transport en prise 2014

État de livraison, validations exécutées et travail restant : [registre canonique des intégrations MCP](suivi-integration-mcp.md). Ce guide décrit le périmètre technique ; les anciennes matrices d’audit ne sont pas le suivi courant.

Le PHB fourni, lignes 5964–5966, autorise à traîner ou porter la cible d'une
prise : la vitesse du porteur est divisée par deux, sauf si la cible est au
moins deux catégories de taille plus petite. Le moteur lit les tailles des
fiches sources : personnage jouable Medium, Goblin Small, Sprite Tiny. Il
n'infère pas une taille depuis un nom narratif et ne transforme pas une fiche
pour obtenir l'exception.

`preview_grapple_transport` puis `move_grappled_creature` exigent `actorId`,
`targetId`, `toCell` et `targetToCell`. Les deux destinations sont explicites,
distinctes et adjacentes ; aucun choix final ne vient du serveur. Le moteur
calcule les deux chemins intermédiaires ensemble, en respectant obstacles,
occupation, portes et coûts diagonaux/terrain. Le corps tenu peut suivre autour
d'un angle au lieu de recevoir une simple copie de l'offset du porteur.

La prise doit exister dans `hero.effects` ou `monsterEffects`, correspondre aux
deux acteurs et au marqueur `grappled`, avec une cible vivante à portée. Une
condition isolée, une prise relâchée ou un autre détenteur ne suffisent pas.
Les tests créent les prises du joueur avec une vraie main libérée par
`equip_item`, puis `combat_action({action:"grapple",…})` et ses jets opposés.
Les prises de monstre viennent de leur véritable résolveur de fiche, notamment
`resolve_monster_action` pour Bite de Giant Frog.

La prévisualisation est une lecture sans mutation ni dé. Le déplacement utilise
le budget effectif du porteur, sans payer une nouvelle action ou le déplacement
de la victime. `allowPartial:false` refuse un chemin trop coûteux avant tout
effet ; `allowPartial:true` conserve les préfixes correspondants des deux corps.
Un `move_token` ordinaire du détenteur refuse `GRAPPLE_TRANSPORT_REQUIRED` plutôt
que de laisser la cible sur place ou de la téléporter implicitement. Chaque pas
assigne les deux positions avant de réconcilier la portée de la prise.

Seul le mouvement volontaire du détenteur peut provoquer une attaque
d'opportunité. Le déplacement forcé de la victime n'en provoque aucune. La
fenêtre de réaction garde les deux destinations et le transport dans sa
continuation ; l'agent choisit explicitement le refus ou l'attaque et l'arme.
Une nouvelle fenêtre d'Inspiration bardique conserve le jet déjà lancé et la
même continuation. Sauvegarder/restaurer ne relance ni jet ni déplacement payé.

Le transport reste sur une seule carte. `travel_to_map` refuse
`GRAPPLE_MAP_TRAVEL_UNSUPPORTED` lorsqu’une prise active réellement suivie
dans `hero.effects` ou `monsterEffects` implique le joueur, comme détenteur ou
victime. Il faut la relâcher ou y échapper avant le voyage. Le seul marqueur
ancien `grappled` ne déclenche pas ce nouveau refus : les validations habituelles
de mobilité et de portée, notamment dans les escaliers, restent applicables.
Aucun temps, déplacement, archivage ou changement de carte n’est accordé par
un refus.

Une victime inconsciente à zéro PV mais vivante peut rester tenue par une
source consciente et être transportée. La prise réelle de la Giant Frog vient
de son attaque Bite et de sa fiche source ; ce comportement n'autorise ni le
transport d'un cadavre ni une capacité inventée sur une autre créature.
Les prises dont `expiresAt` est déjà passé restent inactives après restauration,
même si un ancien marqueur `grappled` demeure : aucune nouvelle prise n'est
créée pour rendre le déplacement possible.

Le détenteur exact, joueur ou monstre, peut relâcher une prise active avec
`combat_action({action:"release_grapple", actorId, effectId})`. L'identifiant
est celui de son effet réel dans `hero.effects` ou `monsterEffects` ; un autre
détenteur est refusé avant mutation. La libération enlève les états issus de
cette prise, dont `restrained` pour Bite, sans soin, action, déplacement ni
avancée du temps. Une victime à zéro PV reste inconsciente. Ce chemin n'autorise
pas à contourner une activation de PNJ réactif.

Limites déclarées : empreinte actuelle d'une case par créature, y compris pour
une future créature Large prise en charge. Les profils jouables sont Medium et
le résolveur de prise refuse les cibles au-delà de Large. Les tests emploient
les fiches existantes Goblin, Sprite et Giant Frog ; aucune taille ni statistique
de remplacement n’est inventée pour fabriquer une autre catégorie. Prises
multiples, cibles ancrées par un autre piège, transport pendant un déplacement préparé et port de cadavres ne sont
pas représentés par ces outils. Le calcul général de poids et
d’encombrement ne fait pas partie du transport en prise.

`tests/grapple-transport.test.cjs` contient douze scénarios MCP : état et dés
inchangés à la prévisualisation/refus, déplacement réel, translation atomique,
exception Sprite, budgets/partiels, mur sur le chemin de la victime, coude,
prises relâchées/orphelines, mouvement forcé sans OA et OA/Inspiration bardique
avec sauvegarde/reprise. Les deux derniers vérifient une vraie Bite de Giant
Frog, sa victime inconsciente, la libération par son détenteur exact, les refus
de voyage et une prise de monstre expirée restaurée. Le moteur doit être compilé
avant exécution ; builds et tests sont centralisés pour préserver le binaire
partagé. Le registre canonique porte les résultats de cette validation.
