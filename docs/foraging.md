# Forage, nourriture et eau réellement acquises

La règle DMG 2014 p.111 permet le forage à allure normale ou lente et laisse au MJ le moment du test. Elle ne fixe pas une durée ni un test automatique par heure. `resolve_foraging` choisit donc explicitement un ou plusieurs vrais intervalles contigus de `advance_travel` effectués avec l'activité `forage`. Un intervalle n'est jamais réutilisable sous un autre identifiant ; une attente, une surveillance, un texte narratif ou un ancien emplacement ne devient pas du forage. La recherche n'ajoute aucun temps fictif à la durée déjà réellement parcourue.

Le MJ établit l'abondance avec sa provenance : DD 10 abondante, DD 15 limitée, DD 20 très faible. Le moteur résout le véritable test de Sagesse (Survie), avec les maîtrises, l'épuisement et l'Inspiration réels. Un échec ne donne rien et ne tire aucun dé de rendement. Un succès final tire deux dés distincts : `1d6 + modificateur de Sagesse` livres de nourriture, puis la même formule en gallons d'eau. Un jet tenu ne donne aucun rendement avant sa résolution et conserve ses dés au rechargement. Les quantités physiques négatives sont bornées à zéro : convention explicite du moteur.

Les ressources trouvées restent un stock quantifié, sans acquisition ni apport nutritionnel implicite. `inspect_foraging` permet de lire les résultats et les stocks. `collect_forage` choisit une quantité réellement restante, au même point observé de carte, cellule et historique de marche. Un voyage ultérieur ne permet pas de collecter à distance. La nourriture effectivement acquise devient un véritable objet consommable, mesuré en demi-livres ; aucun sac ni équipement n'est offert.

L'eau exige un récipient réellement possédé. `register_water_container` établit une seule fois son type physique sourcé, sa capacité PHB, son contenu actuel explicitement connu et ses masses mesurées. Un nouveau reçu ne remplit jamais un récipient déjà suivi, et une outre déjà vide reste vide. Les quantités déjà bues d'une outre ancienne sont conservées dans le nouveau témoin ; la migration ne recrée pas le plein. Une potion ou une flasque d'huile non vidée ne devient pas un récipient d'eau par simple déclaration.

| Récipient | Capacité liquide PHB |
|---|---:|
| Tonneau | 40 gallons |
| Bouteille | 1½ pinte |
| Seau | 3 gallons |
| Flasque ou chope | 1 pinte |
| Cruche ou pichet | 1 gallon |
| Marmite en fer | 1 gallon |
| Fiole | ¼ pinte |
| Outre | 4 pintes |

Le stockage utilise des quarts de pinte pour conserver toutes ces capacités exactement ; un gallon représente trente-deux quarts de pinte. La masse vide et la masse d'une pinte d'eau sont des faits physiques explicitement mesurés, jamais des valeurs déduites du seul poids publié d'un récipient plein. Le portage lit la masse actuelle, qui évolue après collecte et consommation. Une projection de tout l'état futur vérifie la capacité réelle avant de transférer le moindre stock ou objet ; les refus ne consomment ni rendement ni place.

`consume_provisions` consomme séparément l'objet réellement possédé : unités entières de demi-livre pour la nourriture, pintes par incréments de quart pour un récipient suivi. Seules les quantités réellement bues ou mangées alimentent la journée nutritionnelle actuelle. Les besoins quotidiens restent une ou deux gallons selon la chaleur établie ; la récupération d'épuisement garde ses conditions existantes. Un récipient vidé reste possédé ; la nourriture intégralement mangée disparaît. Les reçus empêchent les doubles collectes et apports.

La règle standard n'exige aucun certificat de pureté. Le moteur ne déclare pas automatiquement l'eau propre et ne détecte aucun poison ou maladie. Les dangers explicitement établis et sélectionnés par leurs véritables identifiants de faits restent attachés aux ressources. Leur consommation attend la procédure spécifique à ce danger ; aucune purification ou disparition d'un danger connu n'est inventée. Les ressources ordinaires sans danger établi sont consommables directement.

Les [sources d'eau situées et le transvasement](water-sources.md) réutilisent ces contenants réels, leurs capacités, leurs masses et leurs dangers conservés. Aucun récipient supplémentaire n'est fourni par un prélèvement.

Limites : joueur seul, forage pendant un voyage à pied effectivement enregistré ; aucune réserve de groupe, chasse séparée, récolte par monture ou provision créée par sort. Les méthodes de conservation, l'expiration alimentaire, la récupération d'eau renversée et les procédures de purification ne sont pas ajoutées par cette tranche.

Sources ponctuelles : [DMG 2014, Foraging p.111](../rules/books/dmg-2014.md) ; [PHB 2014, Container Capacity p.153 et Food and Water p.185](../rules/books/phb-2014.md). Voir aussi le [voyage](travel.md), la [nutrition](survival-nutrition.md) et le [portage](carrying.md).
