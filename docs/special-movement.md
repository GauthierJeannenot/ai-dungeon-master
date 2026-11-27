# Nage de surface et escalade réelles

Sources ciblées : PHB 2014, *Climbing, Swimming, and Crawling* (5282–5285), puis *Using Different Speeds* (5699–5703). Le registre canonique reste `docs/suivi-integration-mcp.md`.

`record_movement_medium` observe une vraie surface d’eau ou une vraie paroi déjà mesurée, avec carte, salle, cellules, bornes locales et fait physique existants. Cette observation ne crée ni eau, ni mur, ni position, ni vitesse. Les mains nécessaires, le terrain difficile et l’éventuel DD d’Athlétisme sont des adjudications explicites du MJ. Le PHB ne fournit aucun DD universel pour une paroi glissante, de rares prises ou une eau agitée. Une nouvelle identité ne réinitialise pas le même milieu. Une paroi réellement changée puis remesurée peut actualiser son témoin sous la même identité, sans effacer ses anciens reçus ou déplacer le corps.

`move_by_climbing_or_swimming` reçoit une décision `eventId`, un acteur réel, ce milieu et un chemin explicite de points `{x,y,zFeet}`. Le premier point correspond au corps actuel. Les segments horizontaux suivent la grille existante ; les segments verticaux séparés ne dépassent pas cinq pieds. Aucune formule nouvelle de trajectoire 3D composée n’est inventée. Un véritable appui d’arrivée est choisi par `landingSurfaceId`.

Sans vitesse native adaptée, un pied parcouru coûte deux pieds de déplacement, ou trois en terrain difficile. La vraie vitesse native de nage/escalade supprime seulement le supplément propre au mode. Armure, épuisement, Dash et déplacement déjà dépensé restent communs. Changer de vitesse ne renouvelle pas le budget. `allowPartial` accepte explicitement un préfixe réellement payable, avec sa vraie hauteur et ses mains encore réservées.

La position verticale reste unique dans `jumping.locomotion`, lue par `entityVerticalContext`. Un corps nageant ou suspendu n’acquiert pas de contact au sol. Le Z décrit la base réelle du corps ; il n’est pas automatiquement égal à la surface de l’eau. La nage de surface est confirmée explicitement et n’accorde aucune respiration sous-marine, provision ou collecte d’eau. Le comptage des mains est partagé avec équipement et composantes de sorts.

L’Athlétisme optionnel conserve son unique d20 et sa reprise avec Inspiration. Un échec ne donne aucune distance ou chute automatique. Une nouvelle nonce ne relance pas le même essai physique. `continue_special_movement` reprend seulement la décision initiale. Les opportunités horizontales et les contacts Gear gardent leur continuation réelle ; les coûts sont figés avant les effets du pas. Les corps ne sont pas déplacés par un appel MCP fabriqué.

`complete_locomotion_fall` résout une chute déjà réellement achevée vers un appui existant au même XY. Les niveaux mesurés déterminent la descente et les dégâts ordinaires de chute sont appliqués une fois. Une suspension devenue physiquement non résolue ne devient pas une plateforme : `locomotionPhysicalIssue` retient les actions et la clôture du tour. L’exception interne d’achèvement vérifie exactement le corps et son témoin de position. Pour un vrai cadavre, seule l’arrivée physique est soldée ; aucun nouveau jet, PV ou historique de mort n’est inventé, et les dégâts d’objet restent non résolus.

Les vrais pas et efforts sont consignés comme activité de repos mesurée, sans ajouter de secondes. `inspect_special_movement` ne lance aucun dé et ne déplace rien. État, reçus, hauteur, posture et étapes sont validés à la réhydratation.

Bornes : nage de surface, acteurs actifs possédant les données nécessaires, aucun transport apparié vertical. La nage immergée et le combat sous l’eau sont un sous-lot distinct. Une opportunité ou un effet spatial vertical réellement décisif sans géométrie représentée est refusé avant coût ou dé, sans interdiction générale des hauteurs.

Validation du lot initial : build MCP et TypeScript MCP/Next en sortie 0 ; 23 nouveaux tests, puis 186/186 tests pertinents dans la copie figée `output/mcp-special-movement-20261102`. Les raccords complémentaires temps/repos/API de la coordination sont validés séparément.
