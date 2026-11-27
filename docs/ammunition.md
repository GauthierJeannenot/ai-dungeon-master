# Munitions et récupération — règles 2014

Un tir à munitions demande `ammunitionItemId`, une pile réellement possédée
dont le type et la quantité sont connus. Une munition est dépensée au véritable
jet d'attaque, même raté. Le reçu de ce jet reste le même pendant une réaction
suspendue et après rechargement de l'état. Les anciens objets ne gagnent aucun
stock supposé. `create_ammunition` prépare seulement une vraie pile au sol ;
le personnage doit l'acquérir normalement.

Loading limite chaque arme à un projectile par véritable action ou réaction.
Une Attaque supplémentaire ne renouvelle pas cette limite. Une deuxième action
réellement disponible peut commencer explicitement une nouvelle action
Attaquer avec `newAttackAction`; elle ne recharge aucun crédit par elle-même.
Les mains et la prise effective restent vérifiées avant les dés.

Après une bataille, `recover_ammunition` retrouve la moitié du total réellement
expensé, arrondie une seule fois à l'inférieur, après une minute effective de
recherche. Le calcul couvre les piles et les tirs ratés de toute cette bataille.
Il exige les reçus des véritables tirs en combat ; une ancienne dépense sans
ce témoin ne devient pas un historique de bataille.

Pour plusieurs types, `recoveredCounts` donne explicitement les quantités
arbitrées par le MJ, y compris les zéros. Leur somme doit être la moitié totale,
et aucun type ne peut dépasser sa dépense réelle. Le PHB ne détaille pas la
composition d'une récupération mixte : cette allocation est une interprétation
annoncée, sans choix automatique selon le prix. Une seule récupération est
possible pour toute la bataille, même avec un autre identifiant.

Une bataille entièrement située dans la pièce actuelle se recherche directement
en soixante secondes. Pour plusieurs pièces :

1. `begin_ammunition_search` choisit une bataille réelle et fige ses dépenses
   et les pièces à rechercher.
2. L'agent choisit les vrais déplacements avec les outils de navigation.
   `advance_ammunition_search` ne crédite que la pièce et la position actuelles,
   pendant la durée positive explicitement choisie.
3. Toutes les pièces doivent avoir reçu du temps de recherche, pour un total de
   soixante secondes. Le temps de déplacement, d'attente ou de repos extérieur
   ne se transforme pas en recherche.
4. `recover_ammunition` avec ce `searchId` termine la récupération sans payer
   une deuxième minute.

Ces étapes et leurs reçus se reprennent sur plusieurs messages. Un vrai
changement de carte ou un nouveau combat interrompt la recherche et conserve
ses anciens points de passage ; revenir ensuite ne réactive pas ces crédits.
La répartition des soixante secondes entre pièces est une interprétation du
total source, explicitement indiquée dans les résultats. Aucun trajet, visite
ou appel de déplacement n'est fabriqué par le serveur. La charge des objets
réellement récupérés est prévalidée avant leur acquisition.

Dans un même message, l'application peut aussi transmettre les déplacements
explicitement choisis entre les étapes de cette même recherche. Chaque
déplacement supplémentaire exige un nouveau point de recherche réellement
effectué ; une attente ne le remplace pas. La récupération clôt ce parcours
sans autoriser une autre action sans rapport. Aucun trajet ni argument n'est
choisi par l'application. `tests/dm-ammunition-search.test.cjs` vérifie ce
budget et la transmission des appels ; les règles physiques et les parcours
réels restent vérifiés séparément par les tests MCP de recherche.

État : `dmTools.ammunition`. Sources ciblées : PHB 2014, propriétés
*Ammunition* et *Loading*, table des armes. Les validations et les propriétés
encore ouvertes figurent dans le [suivi MCP](suivi-integration-mcp.md).
