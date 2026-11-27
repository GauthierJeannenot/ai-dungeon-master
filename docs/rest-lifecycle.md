# Repos réels et décisions de dés de vie

`begin_rest({restId,kind})` commence une période à l'heure et aux PV actuels. Il ne donne ni sommeil, ni soin, ni ressource. `advance_rest` effectue la durée explicitement choisie de sommeil ou d'activité légère et avance la véritable horloge. `inspect_rest` lit les segments réellement accomplis, les interruptions et les conditions manquantes ; `abandon_rest` clôt la tentative sans bénéfice ni retour en arrière.

Un repos court exige une heure sans activité intense. Un repos long exige huit heures, dont au moins six de sommeil et au plus deux d'activité légère, avec au moins 1 PV à son début. Une heure cumulée d'activité intense interrompt la période longue enregistrée : ce choix est une interprétation annoncée du moteur, pas une clarification officielle. Les variantes de privation de sommeil et de récupération en armure restent désactivées par défaut. Leur adoption structurée explicite avant les intervalles concernés est décrite dans [Sommeil Xanathar](xge-sleep.md).

Le sommeil applique une véritable source temporaire d'inconscience. Il fait tomber les objets réellement tenus et termine la concentration. Sa fin ne retire pas une autre source d'inconscience et ne relève ni ne rééquipe le personnage. Aucune ancienne narration ou attente externe ne prouve du sommeil passé.

`record_rest_activity` constate explicitement une activité réelle depuis le dernier point enregistré, sans effectuer cette activité ni avancer le temps. Les déplacements et le combat doivent être déclarés intenses ; une vraie marche de voyage inscrit directement son intervalle mesuré. Un intervalle manquant demande cette observation avant la reprise. Une observation ne peut inventer ni sommeil, ni durée, ni action antérieure à la période.

Les événements dus restent autoritaires. On peut avancer jusqu'à leur frontière, résoudre leur véritable outil, constater l'activité correspondante puis poursuivre la période. Le repos ne lance aucune sauvegarde de poison, de mort ou de marche forcée à la place du MJ, et ne franchit pas une résolution obligatoire.

`finish_rest` applique les bénéfices seulement si la période réellement enregistrée est éligible. Il ne fait pas payer une seconde heure ou huit heures. Les choix de DV, Chant de repos et Récupération arcanique sont explicites, avec validation avant coûts et dés. Le bénéfice d'un repos long reste limité à une fois par vingt-quatre heures. Un joueur vivant et stable à 0 PV peut terminer un repos court admissible ; un mort ou un joueur mourant ne reçoit aucun soin de repos implicite.

Après un repos court, `spend_rest_hit_die({restId,eventId})` permet de choisir un DV supplémentaire après lecture du résultat précédent, au même instant réel d'achèvement. Chaque choix possède un reçu distinct. Il ne donne ni seconde heure ni second renouvellement de ressources. Chant de repos ne s'ajoute qu'une fois et seulement si le DV rend réellement des PV. Une autre activité ou le passage du temps ferme cette possibilité : on ne soigne pas une blessure ultérieure avec un ancien repos.

Les appels atomiques `take_rest`, les études d'identification et les harmonisations utilisent les mêmes périodes. L'étude et l'harmonisation restent deux repos distincts ; leurs propres effets sont inclus dans la fin réelle de leur période. Un repos commencé explicitement doit être terminé ou abandonné avant un nouvel appel atomique.

Les identifiants d'activité et d'achèvement sont immuables. Un rejeu exact ne répète ni temps, ni dés, ni bénéfice ; changer les choix sous le même identifiant est refusé. Les sauvegardes conservent les périodes, observations et reçus ; elles ne reconstruisent pas d'historique absent.

Source ciblée : [PHB 2014, Resting / Short Rest / Long Rest](../rules/books/phb-2014.md). Implémentation : `lib/rest-state.ts`, `mcp-server/resting.ts`, `mcp-server/tools/rest-tools.ts`. Vérifications : `tests/rest-period.test.cjs`, `tests/rest-lifecycle.test.cjs`, `tests/dm-rest-lifecycle.test.cjs` ; leurs résultats exécutés sont consignés dans le [suivi MCP](suivi-integration-mcp.md).

Les nouveaux points de contrôle de repos utilisent un fingerprint canonique des mêmes valeurs réellement observées, afin que le rangement des clés JSON par SQL ne crée pas une fausse interruption. Un ancien fingerprint brut reste accepté seulement si les valeurs actuelles le prouvent encore ; un ancien témoin impossible à prouver reste refusé, sans effacement ni recalage automatique.
