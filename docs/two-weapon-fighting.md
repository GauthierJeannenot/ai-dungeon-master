# Combat à deux armes — PHB 2014

État de livraison, validations exécutées et travail restant : [registre canonique des intégrations MCP](suivi-integration-mcp.md). Ce guide décrit le périmètre technique ; les anciennes matrices d’audit ne sont pas le suivi courant.

L'attaque bonus vise actuellement une créature active. Une attaque primaire
contre un objet préparé peut fournir le témoin, mais dépenser l'attaque bonus
contre un objet demande encore un raccord au résolveur d'objets.

Source locale : `rules/books/phb-2014.md`, « Two-Weapon Fighting », lignes 5943–5947 ; propriétés « Light », « Range » et « Thrown » du chapitre équipement. Une attaque de l'action Attaquer avec une arme légère de mêlée tenue dans une main permet une attaque avec une autre arme légère de mêlée tenue dans l'autre main, au prix d'une action bonus. Lancer l'une de ces armes est possible si elle possède la propriété adéquate.

L'IA doit d'abord équiper les deux instances physiques dans les deux mains avec `equip_item`. Une propriété historique « arme possédée » ne suffit pas à prouver les deux mains : ce mécanisme exige un équipement explicite. Aucun kit ne reçoit automatiquement une seconde arme.

Une vraie attaque éligible renvoie `primaryAttackId` et `twoWeaponEligibility`, qui identifient son tour, l'instance primaire et l'autre instance alors tenue. L'IA choisit ensuite `resolve_two_weapon_attack` avec `attackId` unique, ce `primaryAttackId`, `weaponItemId` exact, `targetId` exact et `attackMode: "melee" | "thrown"`. Les identifiants de deux armes du même type restent distincts. Le résolveur ne choisit pas une main, une arme ou une cible à partir du texte.

Le bonus d'attaque utilise normalement la caractéristique, la maîtrise et l'enchantement. Les dégâts de l'attaque bonus omettent le modificateur de caractéristique positif, mais conservent un modificateur négatif. Un enchantement réel reste appliqué. Le style Deux armes du PHB 2014, lorsqu'il figure réellement dans `player.features` sous `two_weapon_fighting`, permet également le modificateur positif aux dégâts de cette attaque bonus. Aucune fiche actuelle ne reçoit ce style et l'outil ne l'accorde pas ; Dual Wielder et les armes non légères ne sont pas ajoutés à ce périmètre.

Cette attaque utilise l'unique action bonus du tour. Elle ne consomme ni ne renouvelle les attaques restantes d'Attaque supplémentaire. Sursaut n'accorde pas une seconde action bonus. Le témoin est lié au combat et au tour : une réaction, une attaque bonus ou un témoin ancien ne déclenchent pas une nouvelle éligibilité.

Une liste explicitement choisie pour `resolve_player_multiattack` s'arrête lorsqu'une attaque ouvre une fenêtre de réaction. Après reprise du même dé, le moteur poursuit uniquement les attaques restantes de cette liste, puis renvoie les témoins des attaques primaires réellement résolues. Il ne choisit aucune seconde arme ou cible à la place de l'IA et refuse une liste réutilisant une instance physique déjà lancée plus tôt dans cette même liste.

Lancer une arme exige le choix explicite `attackMode: "thrown"`, également disponible sur les attaques primaires. Les armes de mêlée utilisent autrement leur portée de mêlée. Les dagues et hachettes du registre ont une portée de lancer de 20/60 pieds ; la longue portée impose le désavantage. L'instance lancée quitte l'inventaire et sa main après résolution, puis apparaît au sol à la position de la cible. Les dés tenus en attente d'une réaction conservent l'instance jusqu'à la résolution ; aucun autre acteur ne peut agir pendant cette attente. Le témoin primaire conserve les deux mains établies avant un lancer, ce qui permet ensuite le lancer explicite de l'autre arme.

Le reçu persistant `dmTools.twoWeapon.receipts[attackId]` mémorise les choix, puis le résultat tenu ou final. Un appel identique retourne ce résultat sans nouveau dé, coût, dégât ou dépôt. Un identifiant réutilisé avec une autre cible, arme, catégorie ou autre argument mécanique est refusé. Une reprise bardique utilise le d20 tenu et le même reçu. Les témoins anciens sont retirés à la prochaine attaque éligible ; les 256 reçus d'attaques bonus sont conservés pour éviter un rejeu de dégâts.

Les erreurs de prérequis, propriété, main, cible ou portée surviennent avant le d20 et la dépense. La couverture s'applique selon l'origine de l'attaque réelle. Le moteur ne devine aucun obstacle, mode de lancer ou justification d'avantage.

Les attaques contre des objets utilisent leur résolveur atomique, qui capture les deux mains avant le jet puis publie son témoin à la résolution de l'attaque. Une attaque éligible contre un objet peut ainsi précéder l'attaque bonus contre une créature. Le résolveur ne transforme pas un jet générique, un sort ou une réaction en action Attaquer.

Le style Duel déjà acquis examine les deux mains réelles : il applique son +2 lorsque l'arme employée est la seule arme physique tenue, dans l'une ou l'autre main, et appartient à la catégorie mêlée. Un bouclier n'est pas une seconde arme ; une arme rangée ou seulement portée dans l'inventaire n'est pas comptée comme tenue. La propriété de lancer ne change pas cette catégorie. Deux dagues tenues empêchent donc ce +2 sur l'attaque primaire ; après le lancer de la première, la seule dague restante peut bénéficier de Duel sur l'attaque bonus, de mêlée ou lancée. Ce +2 ne rétablit pas le modificateur positif de caractéristique omis par le combat à deux armes. Source : « Dueling », PHB local lignes 1466/1815, qui porte sur l'arme de mêlée tenue et les dégâts de cette arme.

`tests/two-weapon.test.cjs` couvre les deux instances, dégâts positifs/négatifs, erreurs avant coût, action bonus, Attaque supplémentaire et Sursaut, hydratation et reprise bardique, rejeux, témoins expirés et conservation des armes lancées. `tests/two-weapon-integration.test.cjs` vérifie le témoin d'une attaque contre un objet, la couverture pendant une reprise bardique et l'effet du style réellement acquis.

Le suivi des raccords et des validations reste dans le registre canonique.
Le bonus contre un objet, le don Dual Wielder et la distribution de styles ou
de nouveaux équipements ne sont pas accordés par ce lot.
