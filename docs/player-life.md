# Joueur mourant — événements réels et règles 2014

Une vraie chute à 0 PV par dégâts, ou de vrais dégâts qui rendent un joueur
stable à nouveau mourant, établissent leur épisode à l’instant mécanique.
`inspect_player_life` expose la source, les compteurs conservés et le véritable
événement de sauvegarde. Hors combat, chaque frontière de six secondes doit
être explicitement résolue avec `roll_death_save` et son `eventId` exact ; un
saut de temps ne peut pas la franchir. Aucun dé n’est lancé pour avancer le
temps ou simplement lire un état.

Les anciennes sauvegardes sans date restent chargées sans histoire inventée.
Un corps instable à 0 PV sans source connue ne peut pas faire avancer le temps
avant un `checkpoint_player_dying` explicite du MJ. Ce checkpoint date
l’observation présente, conserve les compteurs et fixe la prochaine frontière
connue à six secondes ; il ne prétend pas connaître la chute originale. Une
nouvelle nonce ne redémarre jamais un épisode existant. Un véritable début de
tour sélectionné en combat donne aussi un point d’observation réel.
Un ancien état chargé au milieu d’un tour ne prouve pas que ce tour avait
commencé à 0 PV : il exige le checkpoint présent puis un prochain début de
tour réel, même si son ancien budget d’action était encore inutilisé.

Un joueur vivant à 0 PV peut être explicitement inclus dans un nouveau combat.
Cela ne lui permet aucune action physique. Sa sauvegarde appartient au début
réel de son tour et ne dépense pas son action normale. Un 20 naturel qui rend
effectivement 1 PV laisse donc cette action disponible. Chaque vraie clé de
tour ou événement temporel se résout une seule fois ; son rejeu retourne son
reçu sans nouveau dé, soin, action ou changement de compteur. Une chute qui
survient pendant son propre tour ne crée pas de sauvegarde rétroactive.

Le MJ choisit toujours les appels. Ni `next_turn` avec `skipAction`, ni une fin
forcée du combat ne peuvent escamoter une sauvegarde réellement due. Le moteur
ne lance pas cette sauvegarde et ne termine pas le tour automatiquement.

Le cycle de suffocation enregistré reste compatible via un adaptateur ; un
second cycle indépendant est refusé à l’hydratation. Un joueur déjà mourant à
cause de dégâts conserve son épisode quand il commence à suffoquer. Le verrou
d’air et les témoins exacts de trois succès restent appliqués ; un 20 naturel
sans air ne stocke aucun PV différé. Les soins effectifs, la stabilité et la
mort ferment le cycle, sans effacer ses vrais reçus. La stabilité rejoint le
délai naturel de 1d4 heures de `player-recovery`.

Source ciblée : PHB 2014, chapitre 9, « Death Saving Throws » et « Stabilizing a
Creature ». L’intersection des trois succès et du manque d’air conserve
l’interprétation documentée dans `docs/breathing.md`, sans la présenter comme
une clarification officielle publiée.

Les historiques conservent au plus 256 sauvegardes du joueur au total, y
compris les anciens reçus de suffocation, et 128 checkpoints explicites. La
capacité est vérifiée avant tout nouveau dé ; aucun ancien reçu n’est effacé
pour contourner une échéance. Les validations refusent un recul de séquence,
un reçu futur, un identifiant déjà affecté à deux stores ou un double cycle.

Vérifications ciblées : `tests/player-life.test.cjs` exerce les appels MCP
réels ; les suites de suffocation, récupération stable, perte de conscience et
les cas historiques de sauvegardes moteur vérifient leur raccord.

Le 20 naturel joueur/PNJ et le réveil naturel PNJ respectent également le
plafond de soin de la Teinture pâle (`rules/books/dmg-2014.md:8579`). Si le
plafond ne permet aucun PV, le 20 compte comme un succès, sans PV différé ;
trois succès permettent la stabilité si l’air le permet. Cette intersection
est une interprétation explicite du moteur, pas une clarification officielle.
Un réveil PNJ réellement empêché conserve son dé et sa date d’origine et
reprend une seule fois à la levée réelle du plafond (fin, soin du poison ou
suspension existante), sans résurrection ni reconstitution au chargement.
