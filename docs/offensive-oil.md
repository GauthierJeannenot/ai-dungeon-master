# Huile offensive — PHB 2014

Source ciblée : `rules/books/phb-2014.md`, description Oil ligne 4305 et tableau ligne 4211. Un flacon contient **une pinte**, pèse **1 lb** et coûte **1 pa**. Ce raccord ne fournit ni flacon, ni achat, ni huile provenant gratuitement d’une lampe. Les réservoirs de lanternes conservent leur procédure distincte.

## Flacon lancé ou éclaboussé

`use_oil_flask` sélectionne une instance réellement possédée et une cible explicite : créature réelle ou objet de scène intact avec sa vraie CA. Éclabousser exige une cible à 5 pieds au plus ; lancer porte à 20 pieds au plus. La portée générique 20/60 des autres armes improvisées ne remplace pas cette limite spécifique. Il s’agit d’une attaque à distance de DEX sans maîtrise gratuite ; une éclaboussure à proximité reste soumise au vrai désavantage d’une attaque à distance près d’un hostile. Le vent, le chemin physique et la couverture effectivement représentés restent appliqués. Un objet ne reçoit pas de fausses statistiques de créature.

Le flacon et une action complète sont dépensés, y compris sur un échec. Extra Attack ne paie pas cette action. Aucun dégât d’impact n’est inventé. Un succès enduit la cible pendant 60 secondes ; au terme exact, l’enduit est sec. Les effets d’huile identiques ne multiplient pas les 5 dégâts. Une nouvelle application consomme une nouvelle instance physique et établit sa propre durée.

Le passage mentionne « takes any fire damage ». Le moteur vérifie donc le **feu de l’événement initial après défenses**, avant d’ajouter l’huile : une immunité ou un petit feu résisté et arrondi à zéro ne s’allume pas artificiellement grâce au bonus. Si le feu initial est positif, les **5 dégâts bruts de feu supplémentaires sont fusionnés au même type et au même événement**, puis ses défenses sont recalculées une seule fois. PV temporaires, Death Ward, dégâts à 0 PV et concentration reçoivent un événement unique. L’huile ne s’appelle jamais récursivement et son bonus fixe n’est pas doublé sur un critique.

Le texte ne précise pas une consommation au premier embrasement. Le moteur applique donc ces 5 dégâts à **chaque véritable événement distinct de feu avant séchage** ; c’est une **interprétation annoncée du moteur**, pas une clarification officielle revendiquée. L’enduit seul ne crée ni flamme, ni dégât périodique, ni condition. Le vrai identifiant d’événement conserve source, composantes et résultat ; un rejeu rend le même résultat sans nouveau dommage. Pour un objet, les résistances et le seuil réel de dégâts restent ceux de son profil ; un événement primaire entièrement arrêté par ce seuil ne déclenche pas artificiellement l’huile.

## Une vraie surface de cinq pieds

`pour_oil_flask` consomme une pinte sur un carré explicite de 5 pieds, à portée réelle. Le MJ fournit un vrai fait de scène public à cette cellule et confirme explicitement que la surface est nivelée. La déclaration ne lit aucun mot-clé. Une surface verticale, une pente ou un vide ne devient pas un sol plat. La hauteur est celle du support dans le repère de la carte, distincte de l’altitude géographique ; une géométrie déjà mesurée doit correspondre au support choisi. Le plan historique Z0 reste utilisable lorsqu’aucune géométrie contraire n’existe.

`ignite_oil_patch` applique une **torche ou bougie physique réellement allumée**, tenue ou déjà déposée sur cette flaque, avec combustible encore valable pendant la manipulation. Une description, un objet éteint ou une lampe fermée ne fournit pas cette flamme. Le moteur n’invente pas l’accès à un brûleur enfermé, un sort ou une autre procédure de mise à feu non représentée. L’allumage n’inflige pas de dégâts d’entrée à un occupant déjà présent.

La flaque brûle 12 secondes, représentation explicite de deux rounds. Une créature en contact réel avec son sol prend 5 dégâts de feu à l’entrée ou à la fin de son tour, **une seule fois dans le tour global courant**, même en cas de sorties/retours ou de flaques superposées. Le pied du corps doit effectivement toucher ce support : un profil de vol ne prouve pas un vol actuel, et un vrai vol ou saut intermédiaire ne touche pas automatiquement le sol projeté en XY. Un appui réellement indéterminé reste une frontière à résoudre. Les empreintes suivent la projection de tokens déjà représentée par le moteur ; ce lot n’ajoute pas une empreinte multicase aux grandes créatures.

Les corps KO vivants restent dans leurs vrais slots tant qu’ils sont exposés à cette flaque. Cela ne leur accorde aucune action ; leurs dégâts suivent le cycle 0 PV déjà implémenté. Les PNJ physiquement présents et concernés ne peuvent pas être omis du roster ; un profil absent n’est pas remplacé par des PV génériques. Aucun acteur distant n’est activé.

## Temps, initiative et météo

Lancer, verser et allumer fonctionnent hors combat avec **six secondes de travail réel par action**, convention annoncée. Les préflights de capacité et de temps précèdent flacon, action, progression et dés. Une activité achevée après un effondrement respiratoire connu est refusée avant tout coût.

Une flaque sans aucun corps au contact peut brûler et expirer hors combat sans tour fictif. Si son dommage exige un vrai tour, le moteur demande explicitement `enter_combat` avec les acteurs réels concernés avant de franchir le contact ou le temps. Le modèle choisit cet appel ; aucun appel MCP ni ennemi n’est fabriqué. L’exception `combatants:['player']` existe seulement lorsqu’une vraie flaque active touche ce joueur. Entrer en initiative ne crée pas un dégât d’entrée dans une aire apparue sous lui.

Les sauts de temps, repos et sorties de combat ne peuvent pas effacer les fins de tour dues. L’huile au sol est une flamme ouverte mondaine : vent fort et pluie forte effectivement établis l’éteignent, avec leur témoin de contexte conservé. Il ne s’agit pas d’une dissipation magique. Une durée de carburant supplémentaire ou un rallumage réinitialisant deux rounds n’est pas accordé : le renouvellement d’une flaque déjà embrasée demande un nouveau flacon réel.

Les attaques tenues conservent le flacon, la cible, sa cellule, le mode, le d20, la météo et le travail d’origine. L’Inspiration et l’hydratation ne tirent pas une deuxième attaque et ne paient pas une deuxième action.
