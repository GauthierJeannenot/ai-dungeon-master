# Poisons physiques DMG 2014

Sources fournies : `rules/books/dmg-2014.md`, passages 8451–8633 (voies, quatorze poisons, achat et récolte). Les profils d'affliction existants restent la source des DD, dégâts, durées, immunités et sauvegardes ultérieures. Les prix du catalogue sont des références suggérées ; aucun marchand, dose, achat, recette ou poids n'en découle.

## Procédures livrées

- `inspect_player_poisons` lit les quatorze profils et les vrais reçus, sans identification gratuite.
- `prepare_player_poison` consomme une dose canonique réellement possédée et l'associe à une surface physique choisie. Le lanceur et ses projectiles restent distincts. Une mâchoire de piège de chasse est un vrai composant ; un lot de chausse-trappes n'est pas arbitrairement transformé en vingt composants enduits.
- `expose_player_poison` résout un véritable événement établi par le MJ pour le contact ou l'ingestion. Un contact exige une décision explicite sur la peau exposée. L'ingestion exige la dose entière effectivement avalée ; elle ne crée ni nourriture, ni liquide, ni nutrition, ni action de nourrir de force.
- `release_inhaled_poison` dépense une vraie dose dans son cube physique de cinq pieds. Les vrais corps et barrières, y compris les PNJ cachés, déterminent les expositions. Retenir son souffle ne protège pas. Le gaz se dissipe immédiatement ; aucun terrain persistant n'est créé.
- `wash_player_poison` retire une application de contact/blessure par un lavage complet explicitement établi, avec une quantité d'eau réellement débitée dans un récipient possédé et suivi. Il ne purifie pas la nourriture.

Les blessures positives réellement perforantes ou tranchantes transmettent une seule application de blessure. Un échec d'attaque ou un dégât entièrement annulé conserve cette puissance. Les armes ordinaires, Extra Attack, Ready, attaques d'opportunité, frappe de l'autre main et les vraies mâchoires du piège réutilisent cette procédure. Le DD et les dégâts de poison restent séparés du critique et du choix non létal de la frappe.

Une unité de projectile conserve son témoin physique lorsqu'elle est réservée dans une fronde, déchargée séparément, tirée ou réellement récupérée. `recover_ammunition.recoveredPoisonedAttackIds` choisit explicitement les unités encore puissantes parmi les vrais tirs ; une sélection vide est possible. La récupération standard de la moitié totale n'est pas augmentée. Une unité enduite récupérée devient une unité distincte, avec son argenture réelle ; aucun reste de pile n'hérite de la dose.

Les CON tenues conservent leur véritable jet, leur cible, la dose déjà dépensée et l'effet déjà engagé après hydratation ou SQL. Elles reprennent la séquence d'attaque ou le déplacement initial lorsqu'il existe, sans nouveau choix du serveur. Un PNJ vivant à 0 PV continue à recevoir ses sauvegardes et véritables dégâts ; ses historiques réels de 0 PV restent requis. Les corps cachés physiquement présents ne sont pas révélés par ces résolutions.

Les poisons exigeant des sauvegardes de début/fin de tour imposent explicitement la participation des corps réellement présents avant l'initiative. Une entrée en combat ne fabrique ni ennemi ni tour pour un acteur distant. Les nouveaux événements retiennent la phase/génération du vrai tour, afin qu'un ancien compteur zéro d'exploration ne supprime pas le premier événement du combat suivant. Les anciens enregistrements sans ce témoin ne reçoivent aucune histoire inventée.

## Interprétations annoncées

- Une action complète en combat ou six secondes effectives hors combat pour préparer/laver : convention de moteur, pas durée universelle imprimée DMG.
- Première procédure : une dose sur une surface/un projectile, une transmission. Ce n'est pas une limite RAW d'un projectile ; la répartition d'une dose exige encore une adjudication enregistrée de quantité, puissance et expositions.
- Lecture littérale retenue pour le contact : le vrai toucher termine la puissance de cette application, mais l'effet exige de la peau exposée. Un gant ou outil touché ne devient pas automatiquement une seconde surface enduite.
- Origine du cube inhalé à cinq pieds au plus du manipulateur, avec vraie géométrie : portée de manipulation annoncée, aucune portée de lancer gratuite.
- Lavage : quantité suffisante et lavage complet adjudiqués explicitement par le MJ, avec vrai stock d'eau. Aucun volume universel n'est inventé et l'immersion n'efface pas silencieusement la dose.

## Suites encore explicites

- Les doses empilées doivent être séparées réellement ; aucun fractionnement implicite de poison n'est proposé.
- Distribution simultan�e d�une dose sur plusieurs objets, puissance partielle et m�langes restent � int�grer. Le d�placement d�une m�me dose enti�re entre portions r�elles est distinct ; la r�gle PHB des trois munitions n�est pas import�e ici.
- La nourriture/eau � quantit� suivie est d�sormais raccord�e � sa vraie ingestion, aux transvasements et � la CON tenue : voir `docs/poison-nutrition.md`. Les doses r�ellement fractionn�es et les concentrations d�un point d�eau situ� restent refus�es ; la portion de sc�ne ne cr�dite toujours aucune nutrition.
- La synchronisation d'afflictions hors scène/archives avec les tours d'un autre combat reste un lot distinct. Aucun tour, temps d'exposition passé ou rattrapage n'est reconstruit ici.
- La récolte naturelle est le sous-lot parallèle dédié. L'achat et la fabrication sont des dépendances autonomes ; l'utilisation d'une dose ne les termine pas par transitivité.
