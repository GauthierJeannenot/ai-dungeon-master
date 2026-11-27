# Entrée dans l’état inconscient — PHB 2014

La clause locale [Unconscious](../rules/books/phb-2014.md#L13715) impose de
lâcher les objets tenus et de tomber à terre. `gs.enterUnconscious` applique
ces conséquences sans action, mouvement, temps ou dé supplémentaire.

Les transitions réelles à 0 PV, stabilisation, échecs de mort, dégâts massifs
et `apply_condition(unconscious)` emploient ce point commun. Les effets
source, dont le sommeil de poison de sprite, passent déjà par `applyCondition`.
Les modifications de maximum de PV qui posent unconscious passent ensuite
par le même raccord de conséquences dans `heroAfterHPChange`.

Pour le joueur, les deux mains proviennent du loadout réel. Si la session
n’a pas encore de loadout, sa projection historique est initialisée une seule
fois : première arme réellement portée, armure et bouclier déjà reconnus par
l’équipement. Seuls les objets des mains sont placés au sol, avec leurs ID,
carte, salle et position. L’armure et le bouclier porté restent en place ; une
arme de rechange rangée n’est pas choisie automatiquement après la chute.

La réserve d’objets au sol et les mains vides survivent au remplacement de
l’état. Réappliquer unconscious ne crée pas de deuxième exemplaire. Après
soin ou réveil, prone et les objets au sol restent présents : se relever,
ramasser puis équiper sont des choix/actions distincts. Une véritable nouvelle
perte de conscience peut naturellement faire tomber une instance récupérée
et rééquipée entretemps.

Le chargement d’un ancien snapshot n’est pas traité comme une nouvelle
chute. Il n’invente ni dépôt, ni temps, ni action. Un unconscious explicite à
PV positifs est conservé : hydrater l’état n’est pas un réveil. Les anciennes
sauvegardes déjà incohérentes sur la tenue restent une limite historique à
traiter explicitement, sans rejouer leur fiction en silence.

Les autres créatures tombent prone sous réserve de leur immunité source.
Le moteur ne possède pas d’inventaire de mains général pour leurs blocs :
une attaque « épée » ne produit donc pas gratuitement une épée récupérable.
Leurs objets physiques attendent ce modèle d’inventaire. Les autres états,
comme stunned/paralyzed/petrified, ne sont pas convertis en unconscious et
ne déclenchent pas cette chute par le présent lot.

`gs.recordActualDeath(entityId)` est un raccord distinct : il ne tue pas,
mais enregistre une seule fois l’instant d’un décès déjà établi à 0 PV. Les
soins/résurrections réels conservent leur suppression du timestamp ancien.
La coordination peut le brancher après une mort directe comme Consume Life.
Ce raccord ne demande aucun travail sur la nutrition d’un mort.

Neuf tests MCP sont préparés dans `tests/unconscious-transition.test.cjs` :
HP0 avec mains héritées, deux instances et rechargement, réveil/récupération,
sommeil de sprite, stabilisation/dégâts, mort réelle, autres conditions et
absence de nouvelle chute au chargement. Leur exécution requiert le build
central isolé. Les contrôles sans émission/syntaxe de cet agent ne constituent
pas un passage des tests runtime ; leur résultat sera consigné dans le
[registre canonique](suivi-integration-mcp.md) par la coordination.
