# Guide agent — jeux de données de narration

Ce guide concerne **uniquement la narration et les réponses finales au joueur**,
à partir du contexte réellement disponible et des résultats déjà résolus. Il
n'entraîne ni le choix des outils, ni leurs arguments, ni le modèle
de compression. Pour les outils, utiliser le guide distinct
[jeux de données pour piloter MCP](guide-jeux-donnees-llm.md).
Pour superviser ensemble les outils, les clarifications et les réponses au joueur,
utiliser le [guide reliant MCP et narration](guide-jeux-donnees-mcp-narration.md).

L'objectif est **contexte reçu par le narrateur → texte fidèle et lisible**.
Les mécaniques restent dans le moteur MCP. Un récit ne doit jamais créer les
faits qu'il prétend raconter.

## Sources et point de départ

- Lire `AGENTS.md`, `scripts/CLAUDE.md`, `tests/CLAUDE.md` et `docs/training-traces.md`.
- Utiliser `scripts/generate-training-dataset.cjs`, les fixtures et les traces
  actuelles pour vérifier les formats réellement disponibles.
- Consulter les résultats et contrats nécessaires au scénario ; ne pas refaire
  d'audit global des règles ou reconstituer le registre d'intégration.
- Le [catalogue commun](catalogue-cas-llm.md) propose des situations de jeu ; le
  catalogue narratif ci-dessous précise les difficultés propres au texte final.

Le pilote actuel contient 17 exemples multi-rôles. Huit portent sur les outils
du MJ, un sur un résumé, un sur une clarification et sept
sur d'autres réponses finales textuelles. Ces sept réponses sont des candidates
à examiner pour ce corpus, pas sept narrations automatiquement approuvées.

## Sélection des cibles

Retenir une réponse finale textuelle fidèle : `dm.turn` lorsqu'elle termine
réellement le tour, `dm.final_narration`, ou une correction réussie
`dm.repair_narration`. Dans chaque cas vérifier la réponse finale publiée et
l'absence de nouveaux `tool_use` dans la cible.

Exclure :

- les appels d'outils et leurs arguments ;
- les anciennes décisions de classifieur archivées et les cibles `history.compress` ;
- les demandes de précision et signaux de contrôle qui appartiennent à l'agent MCP ;
- la prose anticipant une réussite pendant un appel d'outil, que la route écarte ;
- les brouillons rejetés ou remplacés, les réponses tronquées et les erreurs HTTP.

Une opération `dm.turn` peut contenir plusieurs rôles. Le format n'a actuellement
ni option `--role narration` ni étiquette sémantique de narration. La sélection
doit donc être documentée explicitement lors de la relecture ; ne pas inventer
un filtre automatique fondé seulement sur « cible textuelle ».

Si une mauvaise réponse puis sa correction sont disponibles, conserver seulement
la bonne cible pour un entraînement supervisé positif. Un futur corpus de
préférences pourrait conserver la paire rejetée/préférée avec provenance, mais
ce format et son traitement ne sont pas implémentés par le générateur actuel.

## Construire l'entrée sans la réinventer

1. Préparer une situation cohérente via le code réel du projet.
2. Faire exécuter les appels explicitement choisis dans le scénario par le vrai MCP.
3. Laisser la route assembler les messages et enrichir les résultats avec les
   faits narratifs, indices et contextes locaux qu'elle produit actuellement.
4. Capturer **la requête exacte qui précède le texte final**, puis lui associer
   une cible relue et étayée par les faits disponibles.

Ne pas reconstruire un « meilleur » système, résumer arbitrairement le transcript,
ajouter un jet absent, ni injecter un état final que le modèle n'avait pas reçu.
`outcome` et les états sauvegardés servent à vérifier la cible, pas à introduire
rétroactivement des informations futures dans son entrée.

Les règles lues restent dans leurs résultats d'outils. Leurs sources, limitations
et éventuels fragments suivants restent visibles tels qu'ils ont été reçus.
Un passage non lu ne peut servir de preuve à une affirmation précise.

Pour entraîner le pipeline actuel, conserver son système, ses messages, ses
schémas et ses options tels que capturés. Si un narrateur séparé avec un autre
prompt ou sans outils est créé plus tard, capturer ce nouveau contrat réellement
utilisé et constituer son propre corpus ; ne pas présenter un input transformé
à la main comme une requête historique exacte.

## Ce que la cible doit respecter

### Faits mécaniques

- Une touche, un échec, des dégâts et un soin suivent les résultats réels.
- Un refus reste un refus. Une action partiellement résolue ne devient pas une
  réussite complète ; préciser ce qui a effectivement eu lieu.
- Ne pas transformer une intention ou une promesse en fait accompli.
- Respecter les acteurs, cibles, positions, objets et ressources réels.
- Les règles consultées n'ont pas, par elles-mêmes, exécuté l'action décrite.
- Une fin de combat, un KO, une mort ou un changement de disposition doivent
  être établis, pas déduits d'un ton dramatique.

### Informations et point de vue

- S'adresser au joueur avec « tu », selon les conventions actuelles du MJ.
- Ne pas décider, penser ou parler à sa place. Une réplique de PNJ doit être
  attribuée au bon locuteur et rester compatible avec ce qui est établi.
- Distinguer les informations confidentielles du MJ de ce que le personnage sait.
  Un secret présent dans le système n'autorise pas sa révélation après un échec.
- Respecter les murs, portes, éclairage et découvertes de la scène ; aucun PNJ
  hors contexte local ne devient visible par commodité narrative.
- Une hypothèse ou un aparté omniscient ne devient pas un souvenir du personnage.

### Qualité de prose

- Rapporter clairement le résultat utile avant d'ajouter de l'ambiance.
- Rester naturel et précis ; éviter de répéter le même bilan mécanique.
- Adapter la longueur à la situation et aux consignes réellement présentes.
- Éviter les détails de backend, noms de variables et messages d'erreur bruts
  qui n'aident pas le joueur à comprendre la situation.
- Ajouter de l'ambiance compatible avec les faits sans inventer un indice,
  une créature, un objet utilisable ou un avantage mécanique.

Ces critères ne doivent pas être réduits à une recherche de mots dans la cible.
Une belle phrase contenant « réussite » ne prouve ni le succès du jet ni la
bonne attribution des dégâts.

## Catalogue de 30 cas narratifs

Ce sont des propositions, pas des fixtures livrées. Vérifier les préconditions
du moteur. Les situations exigeant combat engagé, ressources modifiées, plusieurs
messages ou panne injectée nécessitent une extension préalable du générateur.

| ID | Situation | Attendu et preuve à conserver |
| --- | --- | --- |
| NAR-01 | Attaque réussie | Bonne cible, touche et pertes de PV effectivement renvoyées. |
| NAR-02 | Attaque ratée | Aucun dégât inventé ; échec raconté sans action de substitution. |
| NAR-03 | Action refusée | Cause utile expliquée au joueur, état et ressources inchangés selon le contrat. |
| NAR-04 | Résolution partielle | Étape accomplie distinguée de l'objectif restant non résolu. |
| NAR-05 | Plusieurs acteurs dans un tour | Chaque action attribuée au bon acteur et dans le bon ordre. |
| NAR-06 | Déplacement résolu | Nouvelle position et scène actuelles, sans narration de l'ancien emplacement. |
| NAR-07 | Porte ouverte ou restée fermée | Perception et franchissement conformes au résultat réel. |
| NAR-08 | Éclairage ou visibilité limités | Aucune description d'information qui n'est pas accessible au personnage. |
| NAR-09 | Changement de carte | Description locale correcte, sans mélange avec la carte quittée. |
| NAR-10 | Créature proche, lointaine ou non révélée | Présence et connaissances limitées à ce qui peut être établi dans cette scène. |
| NAR-11 | Test de découverte échoué | Aucun secret révélé malgré sa présence dans le contexte confidentiel du MJ. |
| NAR-12 | Confidence refusée par un PNJ | Refus observable raconté ; contenu secret non divulgué. |
| NAR-13 | Plan ou promesse conditionnels | Aucune intention changée en événement accompli. |
| NAR-14 | Objet déposé ou consommé | Objet non rééquipé, retrouvé ou restauré sans résolution correspondante. |
| NAR-15 | Quête acceptée sans prise d'objet | Progression de quête distincte de toute acquisition. |
| NAR-16 | Plusieurs jets et refus successifs | Bilan fidèle à la chronologie, sans fusion trompeuse de résultats. |
| NAR-17 | KO, mort ou stabilisation | État exact, sans généraliser une convention de mort ou de non-létalité. |
| NAR-18 | Effet terminé ou maintenu | Durée, concentration et conditions conformes aux résultats reçus. |
| NAR-19 | Dernière ressource dépensée | Coût effectivement appliqué, sans suggérer une ressource encore disponible. |
| NAR-20 | Narrateur qui commence à parler comme le joueur | Correction de perspective sans inventer sa décision. |
| NAR-21 | Dialogue de PNJ | Locuteur correct, propos compatibles avec son état et son rôle établis. |
| NAR-22 | Choix du joueur encore ouvert | Résultat expliqué sans lui imposer une action suivante. |
| NAR-23 | Même fait sous plusieurs formulations | Variations de prose équivalentes, sans ajout de faits ou coûts. |
| NAR-24 | Bilan court demandé | Informations essentielles conservées sans répéter le transcript complet. |
| NAR-25 | Refus technique du moteur | Reformulation intelligible, sans jargon gratuit ni masquage de l'échec. |
| NAR-26 | Question documentaire | Réponse fondée sur le passage lu, sans raconter que la règle a été exécutée. |
| NAR-27 | Source absente ou insuffisante | Incertitude honnête, aucune référence ou conclusion inventée. |
| NAR-28 | Tentation de résoudre pendant la narration | Aucun nouveau jet, déplacement, gain ou dommage dans le texte final. |
| NAR-29 | Correction d'une mauvaise narration | Bonne cible fondée sur le même transcript ; brouillon fautif exclu des cibles positives. |
| NAR-30 | Historique déjà résumé | Cohérence avec les faits établis, sans réintroduire une erreur ou un spoiler ancien. |

Pour un premier lot, privilégier NAR-03, NAR-06, NAR-13, NAR-22, NAR-26 et NAR-28
sur des situations déjà générables, puis ajouter les préparations requises pour
les autres cas. Un nouvel habillage littéraire seul ne constitue pas un nouveau
cas mécanique.

## Vérification et relecture

Avant d'accepter une cible, établir une courte liste de faits autorisés à partir
des résultats exacts : action, acteur, cible, succès/refus, effets, ressources,
position, informations réellement découvertes. Comparer le texte à cette liste
et noter les ajouts non étayés.

Associer les contrôles structurés aux étapes qui précèdent la narration : identité
de l'outil, booléen de succès, erreur précise, état et coût concernés. Le collecteur
doit conserver ces preuves. Vérifier aussi la réponse finalement publiée : une
cible remplacée par une correction n'est pas la sortie finale à apprendre.

Le générateur actuel compare les snapshots et vérifie les conditions déclarées,
mais ne prouve pas automatiquement toutes les qualités d'une narration.
Conserver `reviewStatus=needs-review` tant que la relecture éditoriale n'est pas
documentée. Ne pas remplacer cette relecture par une simple égalité avec le texte
que l'auteur vient d'écrire.

Garder les variantes proches et leurs trajectoires sources dans le même split.
Si les corpus MCP et narration servent à évaluer un système commun, partager la
partition par scénario : ne pas entraîner un rôle sur une situation réservée à
l'évaluation de l'autre. Ce n'est pas une évaluation de modèle tant qu'aucun modèle
n'a été exécuté et comparé sur les cas réservés.

## Génération et artefacts

```bash
npm run training:generate
npm run training:generate -- --fixture scripts/training/mon-lot.json --out llm_training/synthetic/mon-lot-v1
```

Ces commandes génèrent encore une archive multi-rôles. Utiliser les exemples
sélectionnés, leurs traces, `scenarios.json` et le manifeste pour constituer le lot
de narration. Ne pas présenter cette commande comme un filtre de rôles déjà livré.
Le CLI reste sans réseau, sans pod et sans base de production ; les cibles sont
écrites dans les fixtures et les résultats MCP sont exécutés réellement.

Le format d'une fixture reste documenté dans le guide du générateur MCP. Il peut
contenir des appels d'outils comme échafaudage du scénario ; **ne pas superviser
ces appels dans ce corpus de narration**. Le format actuel ne permet pas une
préparation arbitraire d'état ou plusieurs messages joueur sans extension testée.

Avant livraison, exécuter les contrôles requis par `AGENTS.md`, les tests ciblés
du générateur et ceux du domaine modifié. Ne pas recompiler le moteur pendant
qu'une suite ou un playtest l'utilise. Livrer le chemin du lot, les preuves,
la sélection de cibles et les limites restantes.

## Préparation à l'entraînement

Conserver `request` complet comme entrée et uniquement le texte final retenu
comme cible. Masquer tout le contexte, les résultats d'outils et les anciens
messages assistant ; ne pas leur appliquer la perte d'apprentissage de cette cible.

Le tokenizer et le chat template du modèle cible doivent ensuite vérifier les
longueurs : le générateur signale `tokenBudgetValidation=not-run-offline`.
Ne pas tronquer silencieusement les preuves mécaniques pour faire entrer un exemple.

Un modèle unique peut recevoir seulement ce corpus narratif, ou un modèle narrateur
peut être séparé de l'agent MCP si son contrat est réellement créé. Un fine-tuning
change des poids partagés et peut affecter d'autres capacités : garder une
vérification distincte de l'utilisation des outils, même si leurs appels ne sont
pas des cibles de ce lot.
