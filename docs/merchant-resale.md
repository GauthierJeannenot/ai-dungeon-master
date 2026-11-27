# Revente réelle d'armes et d'armures ordinaires — PHB 2014

Sources locales consultées : `rules/books/phb-2014.md:3905–3915`, Selling Treasure ; tableau des armures `3923–3944` et des armes `4025–4069`. La règle générale donne la moitié du prix des armes, armures et autres équipements non endommagés, à condition de trouver un véritable acheteur intéressé. Les objets de monstre sont rarement en assez bon état ; leur état n'est jamais déduit d'une victoire. Les catégories gemmes/art, marchandises et magie ont leurs procédures distinctes.

Cette première tranche automatise seulement la règle générale sur les **armes et armures canoniques non modifiées** du tableau ciblé. L'IA choisit explicitement les outils et leurs arguments. Le moteur ne recherche ni mots-clés de vente, ni acheteur, prix, état ou destination depuis le message du joueur.

## Constat puis transfert réel

`create_resale_offer` constate l'accord de l'acheteur réel, présent, visible, capable et à portée. Chaque instance doit être réellement possédée, désignée exactement une fois et observée non endommagée. Les faits physiques de condition et d'acceptation se trouvent au véritable marchand. Le montant explicitement choisi doit correspondre au demi-prix source des quantités entières réellement présentes. Aucun objet, pièce, temps ou action n'est accordé par la préparation.

`sell_to_merchant` termine cet accord précis avec les dénominations effectivement reçues et l'intervalle réellement consacré à l'échange. Cette durée et sa justification sont un arbitrage explicite du MJ ; le PHB n'impose pas une durée universelle de six secondes. Les conditions, instances, quantités, faits, scène, portée, mains, capacité, disponibilité des pièces, échéances et charge future sont vérifiés avant le transfert.

Une réussite enlève les mêmes instances de l'inventaire et les conserve dans `dmTools.merchantResales.custody`, sans apparition au sol ni remplacement par un autre exemplaire. La bourse autoritaire `dmTools.wallet` reçoit les mêmes pièces qui quittent la réserve disponible du marchand. Les reçus d'achat antérieurs et leurs tombstones dans `dmTools.merchants.stocks` sont conservés. La garde de chargement vérifie prix, ordre des ventes, recettes réellement antérieures, conservation des dénominations et unicité physique de la garde.

Le même `eventId` exact rejoue le résultat original ; un autre identifiant ne revend ni ne paie un objet déjà transféré. Le `offerId`, son accord et les instances originales restent immuables. Une offre expirée ou dont le contexte réel a changé est refusée.

## Argent du marchand : aucune bourse initiale inventée

La réserve payable vaut **les dénominations des vrais achats déjà terminés par le joueur auprès de ce même marchand, moins ses versements réels de revente**. Le cumul historique `merchants.earnedCoins` continue à représenter toutes ses recettes d'achat ; il n'est pas réécrit comme si elles n'avaient pas eu lieu. Chaque vente conserve aussi les recettes et les soldes réels à cette date.

Cette tranche ne prépare pas de fonds initiaux, n'approvisionne pas un marchand depuis un paiement fictif et ne modélise pas ses autres revenus ou dépenses. Un marchand existant peut donc refuser faute de pièces, même s'il souhaite réellement acheter. Une valeur totale suffisante dans d'autres dénominations ne donne ni monnaie rendue, ni change implicite, ni crédit. Le change du personnage ne crée pas de réserve marchande.

`inspect_merchant_resales` lit les offres, les pièces disponibles et les instances effectivement reçues. Le contexte dynamique ne rappelle que les marchands visibles de la salle et de la carte actuelles ; cette référence confidentielle n'établit aucune acceptation nouvelle.

## État associé et portage

L'équipement actuellement porté ou tenu, y compris les mains déduites d'une ancienne sauvegarde sans loadout explicite, requiert sa vraie procédure préalable de retrait. Aucun objet n'est automatiquement déséquipé par la vente. Les valeurs magiques, primes d'argenture, parchemins et contenus de grimoire ne sont pas ramenés au prix d'un objet ordinaire.

Une instance liée à un état structuré que ce premier transfert ne sait pas déplacer est refusée : enduit, réservations, provisions, contenu, nutrition, source de sort/effet, conditions et autres suivis physiques. Le témoin Basic Poison emploie sa véritable `basicPoisonKey`, sans parser une description ou effacer son horloge. La garde est conservatrice : des historiques associés non transférables peuvent aussi imposer un refus jusqu'à leur procédure dédiée. Aucune purge des données ne rend artificiellement un objet vendable.

Les observations de masse sont conservées après transfert. Leur absence ne devient jamais un poids nul et le prix ne sert pas à calculer une masse. Si le portage est suivi, le moteur évalue l'inventaire restant **et les vraies pièces reçues** avant de payer : une vente peut augmenter la charge portée. Aucune masse gratuite ou recette de poids n'est ajoutée à l'objet reçu par le marchand.

## Bornes restantes

- Armes/armures du tableau ciblé seulement : aucun autre prix, bien magique, prime, service, dépense récurrente, gemme ou œuvre d'art n'est inventé.
- Une demi-valeur qui demande une fraction de cuivre est refusée pour le lot choisi ; aucune règle d'arrondi ni unité supplémentaire n'est créée. Un lot réellement quantifié peut présenter une valeur entière.
- Le nouveau dépôt de revente n'est pas encore un stock que le marchand peut revendre au joueur. Cette garde distincte conserve les anciennes ventes sans réécrire leurs tombstones ; le rachat constitue un prochain raccord précis.
- La réserve extérieure et la richesse initiale d'un marchand, les transports de biens avec suivis actifs et les autres catégories de vente demandent leurs propres données et procédures. Cette tranche ne clôt pas PHB-ECONOMY ou DOWNTIME-ECONOMY.

Le raccord applicatif borne `sell_to_merchant` à la seule action majeure du personnage par message ; le constat et l'inspection n'effectuent pas cet échange. Les vrais parcours API/stdio/SQL et les dés sentinelles vérifient les arguments intactement transmis et les refus avant coûts.
