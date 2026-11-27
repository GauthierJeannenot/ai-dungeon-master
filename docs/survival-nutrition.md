# Nutrition PHB 2014 — tranche de PHB-SURVIVAL

Cette tranche suit le personnage unique avec les besoins standard explicitement
confirmés par le MJ. Elle ne déduit ni race, ni physiologie, ni repas passé.
Sources locales ciblées : `rules/books/phb-2014.md`, Food and Water/Food/Water,
lignes 5400–5416 ; Appendix A, Exhaustion, ligne 13655 ; Adventuring Gear,
Rations (1 day), 2 lb, et Waterskin, quatre pintes. Les archives d'audit ne
sont pas rescannées et le [registre canonique](suivi-integration-mcp.md) reste autoritaire.

## Outils et unités

- `begin_nutrition_tracking` établit une fois les besoins, le temps chaud ou
  tempéré et l'historique connu de privation. Un nouvel identifiant ne permet
  pas de recommencer ou de supprimer une échéance. Un événement identique est
  idempotent. `resume_after_death` exige une suspension enregistrée par le
  moteur et une résurrection effective ; aucune dette alimentaire ne change.
- `consume_provisions` consomme un objet exact déjà possédé. Une
  `ration_1_day` pèse deux livres et contient quatre unités de demi-livre.
  Une `waterskin_full` contient quatre unités d'une pinte. Les restes
  persistent ; une outre vidée reste le même objet, `waterskin_empty`, et ne
  peut pas être remplie gratuitement. Aucun objet n'est ajouté au kit initial.
- `inspect_survival` est une lecture sans initialisation, jet ou consommation.
- `resolve_survival_day` résout une seule journée réellement écoulée, sans
  avancer l'horloge. Une demi-livre compte comme une demi-journée sans
  nourriture ; une livre remet le compteur à zéro. Au-delà de 3 + modificateur
  CON jours, minimum un jour, la privation ajoute un niveau d'épuisement.
  L'eau requise est huit pintes, ou seize si le temps chaud est établi.
  La moitié impose CON DD 15 ; moins donne automatiquement un niveau, ou
  deux si le personnage est déjà épuisé. Les effets utilisent `changeExhaustion`.

Une journée est une fenêtre de 24 heures ancrée au commencement du suivi,
pas un minuit civil inventé. Une échéance peut être atteinte par le temps
mais ne peut pas être franchie sans résolution explicite. Manger après
l'échéance ne remplit jamais rétrospectivement la journée terminée. Le MJ
établit explicitement le temps de la journée suivante.

Une exception interne bornée évite une impasse au milieu d'un round : un
vrai pas de combat de six secondes au plus peut franchir l'échéance une fois.
Le pas suivant est bloqué jusqu'à la résolution explicite de la journée ; sa
borne originale est conservée. `combatStep` n'est jamais un argument public
de saut temporel. Le moteur prévalide ce pas avant la transition de tour et
l'écriture de l'horloge. La nutrition ne fabrique aucun
appel MCP et ne possède pas de minuterie universelle.

Lorsque faim et soif donnent simultanément des effets, le PHB ne fixe pas
leur ordre. L'outil demande `food_then_water` ou `water_then_food` comme
arbitrage explicite du MJ ; il ne lui substitue pas la règle facultative de
Xanathar sur les effets d'un tour. Le niveau d'épuisement réellement présent
lors de la soif détermine son éventuel doublement. Un décès arrête les autres
phases, suspend la nutrition et laisse l'horloge du monde fonctionner.

La sauvegarde d'eau suit le pipeline existant : dés déterministes, défenses,
Inspiration du MJ, éventuelle Inspiration bardique et reprise persistée du
même jet. L'identifiant de journée préserve résultat, ordre et coûts. Les
historiques sont bornés sans éviction : 512 opérations et 256 objets.

## Repos et raccords réalisés

`nutritionRestEligibility` est pur. L'épuisement ordinaire exige de vrais
aliments **et** de l'eau depuis la précédente clôture de repos. Une privation
connue, ou une provenance ancienne inconnue, exige la quantité complète ;
cela prouve aussi la condition la plus stricte sans attribuer gratuitement
une origine à l'épuisement historique. L'absence de suivi reste bloquée.
Les quantités ne sont jamais considérées acquises depuis une simple narration.
Une nouvelle privation remet cette fenêtre à zéro : ses apports insuffisants
antérieurs ne satisfont pas rétroactivement son prérequis de récupération.

Les raccords suivants sont implémentés et validés dans l'instantané W4
référencé ci-dessous :

1. `SurvivalStateSchema` est enregistré sous `dmTools.survival`, conservé au
   remplacement d'état et inclus dans le build partagé. `registerSurvivalTools`
   enregistre les quatre outils et leurs continuations.
2. Le catalogue contient `ration_1_day`, `waterskin_full`, `waterskin_empty` ; aucun
   changement de kit. Les outils de scène peuvent placer ces fournitures.
3. `assertSurvivalTimeAdvance(seconds)` prévalide les mutations qui précèdent un
   saut temporel. Le garde central de l'horloge seul ne suffit pas lorsqu'une
   incantation ou une copie paie avant son appel.
   `isSurvivalDayDue()` et `assertSurvivalEventsResolved()` sont des lectures
   sans mutation pour les gardes d'action et de tour. Le moteur donne au seul
   résolveur de journée un contournement **interne** du garde d'échéance,
   sans désactiver les autres contrôles d'`available`. Une boucle de tours
   de monstres s'arrête sur cet événement au lieu de fabriquer un appel MCP.
4. `assertSurvivalRestWindow(seconds, true)` s'exécute avant tout temps/coût/bénéfice
   d'un repos long ; `false` pour le court. Un repos ne peut pas terminer à
   l'échéance non résolue. Le précontrôle vérifie aussi les places de reçus et
   l'épuisement ancien, afin de ne découvrir aucun refus après les bénéfices.
5. `afterSurvivalLongRest(restEventId)` intervient uniquement après un repos effectif,
   avec ID moteur stable, avant les soins pour rendre le bon maximum de PV.
   Il retire au plus un niveau éligible et ferme la fenêtre d'apports, une
   seule fois. `exhaustionLongRestRecovery` expose le helper pur sans
   déclencher cette mutation lors d'une inspection.
6. `suspendSurvivalForDeath()` est raccordé au cycle de vie et n'intervient que
   lorsque le moteur établit réellement la mort du personnage. Les effets
   quotidiens suspendent aussi le suivi lors de leur propre décès.
7. Exposition à l'agent : inspection documentaire ; commencement et journée
   sont événements factuels du MJ ; consommation est une action du joueur.
   Aucun appel MCP de journée ne doit être fabriqué par le serveur.

## Validation et limites

Les 27 tests de cette tranche sont dans
`survival-nutrition.test.cjs` (14), `survival-lifecycle.test.cjs` (7),
`dm-survival-routing.test.cjs` (2) et `survival-preflight-atomicity.test.cjs` (4).
Ils couvrent les quantités et schémas, les refus avant coûts/dés, les reprises,
la persistance, le repos et le routage IA.

La validation de l'instantané `output/mcp-wave4-final-20261031` est réussie :
TypeScript, **1 094/1 094 tests**, **30/30 tours mock** dans neuf scénarios
(97 appels mock, 0 $) et **129 outils MCP** vérifiés, dont les quatre outils
de nutrition. Toutes les commandes terminent en sortie 0. Le
[rapport W4](rules-audit/validation-wave4-2026-10-31.json) conserve les essais,
empreintes et limites ; le [registre canonique](suivi-integration-mcp.md)
reste la référence des statuts. Cette preuve porte sur l'instantané W4 et
reste distincte de la validation W3.

La [récolte physique](foraging.md), les [sources d'eau situées et les
transvasements](water-sources.md) sont désormais raccordés aux véritables
contenus consommés et au portage ; les quantités d'eau suivies conservent les
quarts de pinte. Les besoins non standard, la nourriture magique, les achats
et les procédures spécifiques de contamination restent ouverts dans ce guide.
La consommation en combat est refusée : ses durées et son économie
d'action ne sont pas inventées. Les corps des PNJ et réserves du groupe ne
sont pas projetés. Ce sous-lot ne termine pas PHB-SURVIVAL.

### Raccord du cycle moteur

Le précontrôle commun time-preflight combine nutrition et feu grégeois. Les longues incantations, la copie du grimoire/parchemin et la préparation d'onguent vérifient leur durée avant coûts ou dés ; la préparation de sorts calcule sa durée totale avant de remplacer la liste. advance_game_time vérifie aussi son écriture directe de l'horloge. Les actions, déplacements, passages et transitions de tour sont bloqués lorsqu'une journée attend sa résolution.

Un franchissement en fin de round suspend le passage à la ronde suivante dans un témoin strict pendingCombatRound lié au combat, round, carte et journée. La résolution explicite de nutrition reprend cette transition mécanique une seule fois, après application des nouveaux niveaux, en conservant l'ordre d'initiative standard 2014. Le témoin survit à l'hydratation ; il ne crée aucun appel MCP et ne relance aucun dé d'initiative. Les batches de monstres renvoient l'échéance au modèle.

Le compteur de privation est borné à 20 000 demi-journées. Si cette borne est dépassée, foodDebtAtLeast indique « au moins » ; le calcul du seuil applique la dette brute avant saturation. Cela ne supprime aucune conséquence pour les caractéristiques publiées. Une journée avec au moins une livre réelle remet le compteur exact à zéro et retire cette borne. Le registre conserve les reçus des jours au lieu d'inventer une ancienneté exacte.

Les sept tests de survival-lifecycle.test.cjs vérifient les horloges, la préparation exacte, le repos et le bon maximum de PV, l'échéance stricte d'un repos, la suspension/reprise d'initiative persistée, le décès massif et la saturation/restauration du compteur. Leur exécution fait partie de la validation W4 attestée ci-dessus.
