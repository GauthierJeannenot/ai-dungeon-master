# PHB 2014 — opportunités autour du vol réel

Cette tranche utilise exclusivement la règle PHB publiée des réactions, portées et opportunités : Reactions5675–5681, Reach4096, Melee5927–5933, Opportunity Attacks5935–5941. Elle n’active aucun nouveau pouvoir de monstre. Les profils de vol et d’armes déjà publiés W20 restent leurs sources normales.

Le4novembre2026, l’utilisateur a choisi les distances géométriques réelles pour le vol3D et ses portées, sans changer le coût de marche. Il a ensuite choisi explicitement : « Résoudre les frontières représentables exactement et refuser les autres trajets avant déplacement ; élargir ensuite ». X/Y restent les cases entières de5pieds du moteur ; Z conserve les pieds réels. Il n’y a ni position XY fractionnaire ni interruption conventionnelle au début du pas.

## Règle et qualification physique

Une créature hostile que le réacteur voit quitte la portée de son arme de mêlée exacte : une réaction peut produire une attaque contre cette même créature, immédiatement avant la sortie. Le moteur énumère les portées propres aux armes disponibles ;5et10pieds ne deviennent pas une portée maximale unique. Disengage réel, réaction indisponible, incapacitation ou absence de vue ne donnent pas d’opportunité. Téléportation, déplacement forcé sans mouvement/action/réaction propre et chute ne créent pas une nouvelle provocation.

`record_spatial_opportunity_geometry` observe seulement deux vrais individus déjà inscrits au combat actuel et un fait physique existant sur leur carte. L’IA choisit `sourceId`, `movingId`, `weaponReference`, `sourcePointZFeet` et `movingPointOffsetZFeet`. Les points doivent être réellement établis dans leurs corps mesurés et dans la posture actuelle ; aucune hauteur de main, bouche, œil ou cible n’est déduite d’une taille de source. L’offset conserve le même point réellement attaché au corps pendant sa trajectoire choisie. `actualRetainedBodyPointsConfirmed:true` confirme ce fait ; il n’accorde aucun déplacement, attaque, vue ou dimension.

La qualification lie la source, son équipement/profil, sa position réelle, la carte, le combat/tour et les mesures corporelles. Une mesure périmée ou absente lorsqu’elle est décisive refuse avant coût. Tous les profils de mêlée disponibles qui peuvent réellement rencontrer le trajet doivent être qualifiés ; le moteur ne choisit pas celui qui sera employé. Pour des sources simultanées, `priority` doit donner un ordre MJ distinct et cohérent entre les armes d’une même source. Aucun ordre d’attaque n’est inventé. `inspect_spatial_opportunities` lit uniquement ces témoins et reçus.

## Frontière et continuation exactes

`fly_native_path` précontrôle toute la route choisie avant son premier coût. Il résout l’intersection avec chaque portée euclidienne réelle. Une sortie verticale peut conserver un Z irrationnel ; une sortie intérieure à un pas qui exigerait un XY fractionnaire refuse la route entière avec `SPATIAL_OPPORTUNITY_BOUNDARY_UNREPRESENTABLE`. Une tangence intérieure non qualifiée refuse également. Le moteur ne remplace pas le trajet de l’IA et ne fabrique aucun appel MCP.

À une vraie frontière représentable, la position réellement atteinte et les pieds parcourus sont commis ensemble. `input.path` reste identique. Le curseur désigne le dernier waypoint complet et `partial` conserve la fraction réelle du segment suivant ainsi que le point atteint. Le budget commun marche/vol paie seulement cette distance. Une fenêtre `movement` contient les armes/profils admissibles et leur rayon d’origine ; l’IA utilise explicitement `resolve_reaction`, choisit `decline` ou `opportunity_attack` et l’arme exacte. Une portée5pieds déclinée n’efface pas une sortie ultérieure à10pieds.

Le même résolveur d’attaque déjà publié conserve le d20, l’Inspiration, la réaction, l’arme et les riders existants. Un CON tenu du venin W20 garde son coup source et sa continuation, sans nouvelle blessure. Des reçus bornés conservent chaque décision résolue, sa fenêtre originale et la distance déjà payée ; seule la fenêtre réellement résolue peut rejoindre les frontières ignorées. Les retries, SQL et un nouveau processus conservent le trajet et la même progression. Un rayon ou reçu incohérent est refusé avant installation de l’état ou avant le prochain dé.

Si la vraie réaction met le volant à0PV ou lui retire sa mobilité, la route se termine au point exact atteint. Aucun waypoint suivant n’est payé ou commis. La chute réellement due reste exigible via `complete_native_flight_fall`, avec le support inférieur réel choisi selon les gardes W20. Même après chute, SQL et retry de l’ancien événement ne rejouent pas le vol. Les contacts physiques de réception déjà publiés conservent leurs continuations.

Un déplacement ordinaire au sol autour d’un vrai volant peut proposer les mêmes frontières lorsque celles-ci sont exactement représentables. Son coût et son pathfinding au sol restent ceux de W20 ; une sortie XY intermédiaire non représentable refuse avant marche. Swallow reste prioritaire : un corps avalé n’offre ni origine, cible ou opportunité extérieure par le XY/Z hérité de son hôte.

## Limites exécutables

La tranche couvre les parcours existants impliquant un vrai vol natif W20, pas un nouveau mode du joueur, un vol magique, des passagers ou un pouvoir MM ajouté. Les nouveaux traits modifiant les opportunités ne sont pas activés. Les traits d’alliés décisifs, la découverte de corps cachés, les volumes Guardian, les hauteurs de lumières artificielles et le contexte d’une arme traversant l’eau restent refusés lorsqu’ils ne sont pas représentés. Un obstacle réel sans mesure ne devient ni transparent ni infini ; un mur opaque effectivement mesuré bloque le rayon et exclut la réaction. Le précontrôle de représentabilité reste conservateur avant les autres qualifications prospectives : une intersection non représentable n’est jamais utilisée comme nouvelle position corporelle.

La confirmation de points retenus et la subdivision des trajectoires sont des contrats physiques du moteur, pas des dimensions anatomiques ni une variante RAW présentée comme imprimée. `get_rules_support({domain:'spatial_opportunities'})` expose les outils, sources et refus actuels.

## Validation de lot

Les témoins ciblés couvrent les portées5/10 distinctes, un arrêt au Z irrationnel exact, le refus d’un segment ultérieur XY fractionnaire avant tout coût, la cécité/réaction dépensée/Disengage, les murs mesurés ou inconnus, deux sources avec ordre explicite, d20 puis CON tenus, les corruptions de pause et reçus, la mort/chute et les retries. Le vrai parcours stdio utilise `spawn_monster`, les observations physiques et `enter_combat`, puis SQL et un deuxième processus neuf. Le test POST fait choisir tous les outils et arguments par l’agent, y compris la décision explicite de tenir l’action restante du monstre ; aucun appel de jeu n’est fabriqué par le serveur.
