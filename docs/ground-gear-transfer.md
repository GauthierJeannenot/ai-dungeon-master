# Transvasement des stocks récupérés

`start_ground_gear_transfer` désigne le stock source, le nombre exact d’unités et un autre récipient réellement porté. Si celui-ci contient déjà un stock de même nature, `destinationStockItemId` choisit explicitement le stock receveur ; le moteur ne fusionne pas des contenus à la place de l’IA. Des chausse-trappes et des billes ne deviennent pas un même stock.

Le MJ établit la capacité libre actuelle du récipient et la durée réelle de l’opération avec des faits physiques explicites. Aucun tarif de transvasement n’est attribué au PHB. Le travail est suivi par segments : `continue_ground_gear_transfer` poursuit le même essai, puis `finish_ground_gear_transfer` transfère les unités seulement lorsque travail et durée réelle sont tous deux atteints. En combat, un segment crédite au plus six secondes par vraie action sans avancer l’horloge du round. La fin auxiliaire ne consomme pas une action supplémentaire. Attendre sans travailler ne transvase rien.

Les contenus restent dans leurs récipients initiaux jusqu’à la fin. Source, destination, lieu, capacité, faits physiques, main libre et aptitude de l’acteur sont revérifiés avant tout coût et à la fin. Un récipient déposé ou des contenus modifiés ne sont pas remplacés silencieusement. `cancel_ground_gear_transfer` ferme un essai inachevé sans déplacer d’unités, rembourser du temps ou activer un acteur incapable.

La quantité restante et les références des placements d’origine sont conservées. Un récipient vidé reste un vrai objet, sans duplication. Un déplacement de tout le contenu vers un récipient vide conserve l’identité du contenu ; un partage crée seulement l’identité des unités réellement séparées. Les reçus persistants empêchent de répéter le transfert après une sauvegarde.

Un ancien stock sans reçu réel de collecte/transfert ou sans ses placements d’origine connus ne permet pas ce nouveau transfert. Cette frontière est signalée explicitement ; aucun comptage ou passé manquant n’est inventé.

Une masse inconnue ne vaut pas zéro. Si le portage standard est suivi, le reliquat source et le contenu total de destination doivent avoir leurs masses totales réellement mesurées avant le travail. Les deux livres du sac complet publié ne sont jamais réparties proportionnellement. Le poids sec des deux récipients reste distinct. Hors suivi du portage, les nouveaux contenus non mesurés restent de masse inconnue.

Une recomposition explicitement choisie de vingt chausse-trappes ou de mille billes devient un stock complet utilisable par `place_ground_gear`. Cela ne crée pas un nouveau sac : les unités restent liées au récipient réellement choisi, que le placement conserve. Sources de ces lots : PHB 2014, *Caltrops* et *Ball Bearings* (`rules/books/phb-2014.md:4259`, `:4253`). Les durées, capacités physiques et mesures de masse du transvasement sont des arbitrages MJ déclarés, distincts des règles publiées.
