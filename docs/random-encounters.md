# Rencontres aléatoires — DMG 2014

Le lot canonique `ENCOUNTER-RANDOM` est en cours. Source consultée ponctuellement :
`rules/books/dmg-2014.md`, lignes 3131–3220, notamment Checking for Random
Encounters, Probabilities et Sylvan Forest Encounters. Aucun nouvel audit.

## Tirage des tables sources

`consult_rules` retrouve le passage et son véritable `tableId`. `roll_table`
utilise la colonne littérale choisie, y compris **d12 + d8** pour la forêt
sylvestre. Chaque dé est lancé une seule fois ; les résultats sont additionnés
avant de sélectionner la ligne source. Les extrémités 2 et 20 possèdent chacune
une combinaison sur 96 ; une valeur centrale comme 10 en possède huit sur 96.
Le résultat indique cette probabilité sous forme de nombre de combinaisons,
sans rendre les lignes artificiellement équiprobables.

Les dés simples conservent leur procédure. Les sommes sont limitées à quatre
dés standards de table, avec plage complète et sans chevauchement. Les
expressions imbriquées, modificateurs constants, colonnes de texte et tableaux
incomplets sont refusés avant tout dé. Le texte source ne devient jamais du
code ni une instruction de jeu exécutée automatiquement.

La ligne tirée reste une inspiration confidentielle pour le MJ. Ni les nombres
de créatures mentionnés dans le texte, ni une sous-table, ni les capacités d’un
profil absent ne sont résolus implicitement. Aucun acteur, combat, déplacement,
PV, provision, durée ou découverte n’est créé par ce tirage.

## Contrôles et historique persistés

Le DMG laisse le MJ choisir quand une rencontre survient ou quand effectuer
son test de d20, avec rencontre sur 18 ou plus. Ses fréquences sont des choix
de campagne ; aucun contrôle horaire n’est activé par défaut.

`check_random_encounter` conserve un `checkId`, une raison et le contexte réel
de la partie. Le MJ choisit `d20`, `dm_occurrence` ou `dm_no_occurrence`.
Le d20 est brut, sans bonus de personnage ni Inspiration : 18 ou plus indique
une rencontre. Une décision MJ ne lance aucun dé. Répéter le même identifiant
avec les mêmes arguments rend le résultat original ; modifier la décision ou
sa raison sous cet identifiant est refusé avant tout dé.

`draw_random_encounter` demande un contrôle positif et un `drawId`, ainsi que
le véritable `tableId` et, si nécessaire, sa colonne. Le contrôle doit encore
correspondre à la carte et à la salle réelles. Un nouveau tirage demande le
dernier `previousDrawId`, `contextIncompatibleConfirmed: true` et une raison
dans `reroll`. Une reprise d’un ancien résultat ne rembobine pas cet historique.
Les tirages originaux et leur chaîne sont conservés dans la sauvegarde SQL.

`inspect_random_encounters` lit cet historique confidentiel par pages :
`view: checks | draws`, `checkId` facultatif, `offset` et `limit` (maximum 10).
Cette inspection ne modifie ni état, dés ou temps. Les plafonds de conservation
sont vérifiés avant tout nouveau dé ; aucune ancienne décision n’est évincée.

Ces trois outils ne créent ni acteur, combat, hostilité, indice, récompense,
découverte ou déplacement. L’IA choisit séparément les appels de mise en scène
appropriés, depuis les créatures et lieux réellement pris en charge, et peut
consulter `assess_encounter_budget` sans garantie d’équilibre.

## Validation et limites restantes

### Tables propres à la campagne

`create_random_encounter_table` enregistre une référence MJ explicitement
rédigée pour cette partie selon la procédure standard du DMG. Son `tableId`
commence par `campaign:`. Le MJ fournit son titre, son thème, sa portée
(`scope.kind: adventure`, ou `map` avec un véritable `mapId`), de un à quatre
dés standards dans `dice`, et les entrées `{rowId, low, high, text}`.
Chaque somme possible doit appartenir à exactement une entrée. Les plages
définissent les chances réelles, y compris pour une somme de dés non uniforme.

La table est immuable : une reprise exacte retrouve la même référence ; une
révision demande une autre identité. `draw_random_encounter` accepte ensuite
ce véritable `tableId` après un contrôle positif, avec les mêmes règles de
contexte, de reprise et de nouveau tirage motivé que pour les tables du livre.
Une portée de carte différente est refusée avant dé. Le résultat indique
`source.origin: campaign_authored`, pour distinguer le contenu de campagne du
texte fourni des livres. Cette rédaction n’active aucune règle maison.

`inspect_random_encounter_tables` présente les tables enregistrées, ou les
entrées de la table choisie, avec `offset` et `limit` (maximum 10). Aucune
fréquence, rencontre, quantité de créatures, scène ou connaissance du joueur
n’est créée par l’écriture, l’inspection ou le tirage de cette référence.

Cette tranche suivante passe TypeScript/build0,26/26 ciblés (dont sept nouveaux
cas mécaniques et quatre parcours API/SQL livre/campagne sur SRD/legacy), puis
mock30/30, neuf scénarios,71appels,0$, objectifs atteints. Un véritable processus
expose240outils uniques, dont les deux nouveaux outils de tables de campagne.
Preuve : [rapport borné](rules-audit/validation-campaign-encounter-tables-2026-11-02.json).
Elle est exclue du gel W16, dont la full est déjà lancée ; sa livraison intégrée
doit être validée dans une cohorte suivante.

La tranche persistée est vérifiée dans
`output/mcp-random-encounter-ledger-20261102` : TypeScript complet et compilation
réussis, 28/28 cas tables/contrôles/régressions ciblées, 2/2 parcours API avec
persistance SQL (personnage SRD et ancien personnage), puis 5/5 gardes de
frontière IA et de vocabulaire. Le playtest mock passe 30/30 tours, neuf
scénarios, 71 appels, 0 $, objectifs atteints. Ce contrôle borné ne constitue
pas encore la livraison intégrée du prochain moteur partagé.

La mise en scène mécanique et les éventuels jets de quantité restent des
appels explicitement choisis par l’IA depuis les outils réellement pris en
charge. Aucun texte de table n’est analysé pour fabriquer un appel MCP ; une
fiche ou un pouvoir absent du catalogue ne devient pas utilisable par tirage.

Les probabilités et tableaux ne garantissent ni une rencontre adaptée au niveau
ni une confrontation hostile. Le lien avec l’aventure et les objectifs établis
reste nécessaire à la mise en scène, comme pour les donjons aléatoires.

## Cadence générale explicitement adoptée — W33

Les contrôles d20 sur18+, décisions MJ sans dé, tables sources et chaînes de relances ci-dessus étaient déjà livrés. W33 ajoute leur calendrier optionnel sur le véritable temps du monde, sans second résolveur de rencontre. Source ciblée: DMG2014 Checking for Random Encounters, `rules/books/dmg-2014.md:3157–3168`, SHA256 `fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1`. Le lecteur retient l’identifiant de section, les lignes et le SHA avant adoption et dés.

`configure_random_encounter_cadence` choisit `operation:start`, un `cadenceId` neuf, une raison, et `start:{factId,environment,intervalHours,actualMapScopeConfirmed:true}`. Le fait durable actuel qualifie explicitement toute la carte comme périmètre wilderness ou dungeon. Aucun texte ne classe son type ou ses frontières. Le MJ choisit une heure ou un intervalle entier entre quatre et huit heures parmi les exemples imprimés. Aucune cadence n’est active par défaut. Le premier contrôle est strictement futur, à l’instant actuel augmenté de cet intervalle; aucun historique de voyage ou repos n’est reconstruit.

L’horloge peut atteindre exactement le prochain bord. Un déplacement temporel qui le dépasserait refuse avant durée, effort, coûts et dés. Au bord, tout temps supplémentaire attend `check_random_encounter` avec le `cadenceId` explicite, un `checkId` neuf et le véritable choix `d20`, `dm_occurrence` ou `dm_no_occurrence`. Le producteur déjà publié conserve son unique d20 brut et son seuil18+; une décision MJ conserve le dé suivant. L’identité de cadence, l’index et l’échéance sont liés à ce reçu. L’échéance suivante est dérivée de l’adoption et du nombre de vrais contrôles, sans décalage sur l’heure d’une reprise ni remise à zéro par nouveau nonce.

Un résultat positif reste documentaire. Le MJ choisit séparément la table réelle et son tirage avec `draw_random_encounter`, puis toute mise en scène physique par les producteurs existants. Les propositions, leurs éventuelles incompatibilités motivées et la dernière relance restent dans leur chaîne d’origine même après l’arrêt de la cadence. Aucun acteur, combat, récompense, découverte, durée ou appel MCP n’est créé automatiquement.

`operation:stop` conserve la raison, la période, ses échéances et tous ses contrôles; `start` doit être omis. Un contrôle déjà dû doit être explicitement résolu avant arrêt. La réserve de reçus garde la place du futur arrêt. Un registre de contrôles plein refuse d’atteindre un futur bord, afin de permettre cet arrêt avant échéance plutôt que créer une obligation insoluble. `inspect_random_encounter_cadence` lit ces données sans dé ou mutation; le contexte de l’agent expose le prochain bord.

Les vrais segments de voyage, repos et fabrication suivent le même précontrôle. Un travail indivisible de huit heures peut refuser sous une cadence d’une heure: cette tranche n’invente aucune pause/reprise ou heure déjà travaillée. Choisir un véritable segment pris en charge ou arrêter explicitement la cadence reste une décision du MJ. Sous une cadence de huit heures adoptée à l’instant du travail, un vrai effort de huit heures peut atteindre exactement son contrôle. Les périodes de repos et leurs bénéfices restent leurs propres procédures; à seconde égale, un contrôle documentaire ne remplace aucun jet, soin, événement ou choix du repos.

Limites moteur: une cadence actuelle à la fois, sur une seule carte, hors combat. Elle doit être arrêtée avant une entrée en combat ou un changement de carte, avec résolution préalable d’un contrôle déjà dû. Aucun bord de round de six secondes, contrôle hors carte, rattrapage, pause de cadence ou fréquence jour/repos n’est ajouté dans cette tranche. Les cadences urbaines jour/nuit déjà publiées restent séparées. Les anciens contrôles généraux sans cadence conservent leurs arguments, commandes et reçus.

Le lot Smiths Tools / Repair initialement envisagé reste bloqué par `SOURCE-XGE-TOOLS`: le passage local Xanathar1002–1082 fournit les principes généraux puis une table explicitement maison, sans fiche officielle de réparation. Aucun10PV/heure, source de chaleur ou réparation mécanique n’en est déduit.
