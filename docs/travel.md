# Voyage à pied — règles standard 2014

Le voyage conserve une distance et une durée réellement résolues. Il ne déplace aucun jeton ni carte : terminer la distance signifie `distance_complete`, sans arrivée spatiale implicite. Le MJ établit explicitement l'origine, la destination, la distance en pieds, le terrain et la provenance de la route. Un changement de carte reste une opération distincte sur les destinations réellement disponibles de la même aventure.

`begin_travel_tracking` établit une seule fois le début du jour actuel et une durée antérieure de marche explicitement connue, au plus huit heures et jamais supérieure au temps réellement écoulé. Une nutrition standard active doit déjà exister. L'absence d'historique reste inconnue ; aucun repas, équipement, eau ou monture n'est créé. Tous les identifiants de route partagent ensuite ce même historique, même après abandon, repos, changement d'identifiant ou reprise de la nutrition.

Le sens de « jour » est une adjudication annoncée : fenêtres consécutives de vingt-quatre heures depuis l'époque explicitement établie par le MJ. La marche se remet à zéro seulement à la véritable fenêtre suivante, après résolution des événements dus. Un repos ne remet pas ce compteur à zéro et le voyage n'accorde aucun bénéfice de repos.

`create_travel_route`, `inspect_travel`, `advance_travel` et `abandon_travel_route` utilisent les routes persistées. Chaque segment choisit explicitement allure et échelle de la table PHB :

| Allure | Par minute | Par heure | Par journée de huit heures |
|---|---:|---:|---:|
| Lente | 200 pieds | 2 milles | 18 milles |
| Normale | 300 pieds | 3 milles | 24 milles |
| Rapide | 400 pieds | 4 milles | 30 milles |

Les arrondis publiés ne sont pas convertis artificiellement : huit heures rapides ne représentent pas le même nombre imprimé dans les colonnes heure et jour. L'échelle journée effectue un bloc de huit heures depuis zéro heure de marche ; les segments partiels choisissent minute ou heure. Le terrain difficile et la réduction de vitesse par épuisement divisent chacun la distance par deux. Les différences ordinaires de vitesse de marche n'altèrent pas la table de voyage, conformément à l'explication du DMG ; une vitesse réellement nulle reste bloquante. La progression utilise des unités entières communes aux trois échelles pour éviter les erreurs d'arrondi aux frontières.

Un segment ne franchit ni la prochaine sauvegarde de marche forcée ni le prochain jour. À neuf heures de marche effective, puis après chaque heure supplémentaire, `resolve_forced_march` résout le véritable jet de Constitution : DD 11, puis 12, etc. L'échec ajoute un niveau d'épuisement standard 2014. Le jet tenu par une Inspiration bardique garde ses dés et son événement après sauvegarde/rechargement. Rejouer l'événement terminé ne relance rien. Si nutrition et marche forcée sont simultanées, leur ordre relève du choix explicite du MJ ; les deux résolveurs permettent cet ordre sans le fabriquer. Si une vraie mort survient avant la sauvegarde, l'événement est conservé et clôturé sans jeter pour un cadavre.

Le joueur doit pouvoir marcher et satisfaire les gardes réelles de charge, état, temps et événements. Un repos enregistré peut contenir de la marche : l'intervalle réellement effectué y est inscrit comme activité pénible, sans faux sommeil et sans ignorer un historique intermédiaire manquant. Une charge physique tenue doit passer par son déplacement apparié ou être libérée : le registre de route ne téléporte aucun corps ou objet. Les contextes d'air indisponible et les événements d'affliction interrompant le segment demandent leur procédure explicite avant de poursuivre.

L'activité et le rang sont déclarés pour chaque segment. Surveiller fournit la Perception passive réelle, diminuée de cinq à allure rapide. Une autre activité exclut cette contribution à la détection. L'allure lente hors terrain ouvert permet de tenter la discrétion ; elle n'en résout pas un succès. Cartographier, naviguer, pister ou chercher de la nourriture ne crée aucun résultat, carte, objet ou provision. Le forage à allure rapide est refusé.

`stopAtDestination` doit être explicite pour arrêter un segment minute/heure plus tôt. Le temps nécessaire est alors arrondi vers le haut à une seconde entière : c'est une convention de précision du moteur, pas une nouvelle table officielle.

`resolve_travel_navigation` résout le véritable test de Sagesse (Survie) demandé explicitement par le MJ hors des chemins. La table DMG donne DD 15 pour forêt, jungle, marais et montagnes, DD 10 pour arctique, désert et collines, DD 5 pour prairie, pré et terre agricole. Les deux lignes de mer sont conservées dans les données de référence mais refusées par l'outil à pied, faute de navire réellement supporté. L'allure lente ajoute cinq au vrai modificateur du jet ; l'allure rapide en retranche cinq. Le DD de la table reste inchangé et ce bonus ne détourne pas la récompense de rôleplay.

Une carte précise exige une instance réellement présente dans l'inventaire et une confirmation sourcée de sa précision pour la route ; son nom ou sa description ne créent aucune précision. Voir le soleil ou les étoiles exige une observation explicite actuelle avec sa provenance. Ces aides donnent un seul avantage, avec les annulations ordinaires, et ne rendent pas la vue à un personnage aveuglé. Le jet tenu conserve son contexte et ses dés.

Un échec tire un véritable `1d6` pour le nombre d'heures nécessaires avant de réessayer. L'état perdu est commun à tous les identifiants de route. `advance_navigation_search` réalise explicitement une recherche en marchant : son temps compte dans les mêmes journées, la marche forcée, la nutrition et les repos, sans créditer de distance vers une destination ni inventer une direction. Attendre avec `advance_time`, changer de route ou de reçu ne remplace pas cette recherche. Après la durée réellement effectuée, un nouveau test réussi termine la perte d'orientation ; un nouvel échec conserve l'épisode et tire son nouveau délai. Rejouer un ancien test ou intervalle ne réécrit pas l'état courant. Aucun dé de délai n'est tiré tant qu'un choix d'Inspiration tient encore le test initial.

Le [forage physique](foraging.md) permet un test explicitement demandé sur de vrais intervalles de voyage à activité `forage`, puis la collecte et la consommation séparées de nourriture et d'eau réellement trouvées. Aucun test n'est déclenché automatiquement par la marche.

L'application transmet plusieurs segments explicitement choisis du même trajet
dans un message, y compris les vraies résolutions de marche forcée entre les
segments. Le forage puis la collecte de ce même trajet peuvent suivre sans
seconde durée de recherche. Changer de trajet ou entreprendre une autre action
reste un choix distinct ; aucun appel, cible, destination ou provision n'est
fabriqué par le serveur. Les tests route/MCP/SQL `dm-travel.test.cjs` et
`dm-provisions.test.cjs` vérifient cette orchestration et la persistance réelle.

Limites : seul le joueur à pied possède ce registre mécanique. Les groupes et leurs rangs complets, les montures/véhicules, les allures magiques, les rencontres, le pistage, la météo et les dangers environnementaux ne sont pas résolus par cette tranche. La recherche d'orientation supportée est une vraie marche mesurée ; les autres méthodes ne sont pas automatiquement créditées. Le rang déclaré ne sélectionne aucune victime ni position tactique. Les outils de consultation gardent ces sources accessibles au MJ.

Sources ciblées : [PHB 2014](../rules/books/phb-2014.md), chapitre 8, *Travel Pace*, *Difficult Terrain*, *Activity While Traveling*, pp.181–183 ; [DMG 2014](../rules/books/dmg-2014.md), *Foraging* et *Becoming Lost*, p.111, *Map Travel Pace* et *Special Travel Pace*, p.242.
