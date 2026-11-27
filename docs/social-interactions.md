# Interactions sociales standard de D&D 2014

Sources locales consultées pour ce lot : `rules/books/phb-2014.md:5430–5489` (Social Interaction, Roleplaying, Results of Roleplaying, Ability Checks) et `rules/books/dmg-2014.md:7769–7832` (Starting Attitude, Conversation, Charisma Check, Conversation Reaction, Repeat). Aucun nouveau catalogue de traits ou de secrets n'est généré.

## Procédure

Le contexte dynamique du MJ fournit les repères persistés des interactions de
la carte courante, ouvertes et fermées : identité de cible, `interactionId`,
attitude, événements déjà utilisés, dernier échange avec ses participants et
ses indicateurs, dernier test et éventuelle clôture. Ce contexte est actualisé
dans les résultats des outils sociaux et après un changement de scène. Il ne
crée ni conversation, ni coopération, ni connaissance du personnage.
`inspect_social_interaction` est disponible avec les outils courants, sans
découverte préalable. L'appel `{}` liste les conversations de la carte ; un
`interactionId` exact permet d'en lire les propos et reçus complets. Le MJ
inspecte les références incertaines au lieu d'inventer un identifiant.

Une conversation ouverte conserve son **même `interactionId`** entre outils
et tours. Chaque étape réelle possède en revanche son **propre `eventId`** :
ouverture, échange, demande, intuition et clôture sont des événements distincts.
Seul le rejeu exact d'un même appel reprend son événement et tous ses arguments.
Le `conversationEventId` d'une demande ou d'une intuition désigne l'événement
d'un `record_social_conversation` réussi, jamais l'ouverture ou un refus.
Les `participants` de cet échange sont le joueur et les contributeurs de son
groupe, chacun une fois ; la cible opposée n'est pas un participant aidant.
Le demandeur (`entityId`, par exemple `player`) doit en faire partie.

Pour un joueur seul qui tente de persuader un PNJ, `participants` contient donc
seulement la contribution de `player` ; les réponses du PNJ peuvent être
mentionnées dans `source`. Cette liste ne représente pas tous les locuteurs.
Une démarche descriptive suffit, sans citation inventée du joueur.
`sufficientForInsight` ne conditionne pas un jet de Persuasion.

Les erreurs `SOCIAL_PARTICIPANT_IS_TARGET` et `SOCIAL_PARTICIPANT_DUPLICATE`
renvoient les références de l'échange refusé et une `agentContinuation` de
correction. Le refus a lieu avant tout reçu, coût ou jet : le modèle peut
corriger les participants en conservant l'`eventId` encore inutilisé. Cela ne
change pas l'exigence de rejeu exact des événements déjà acceptés ou suspendus.
Un nouvel enregistrement réussi avec `requestReached: true` renvoie une
continuation pour résoudre cette demande ; elle n'est pas conservée dans le
reçu, afin qu'un rejeu ancien ne réclame pas un autre jet.

La route conserve ces indications moteur pour le tour en cours et maintient
les outils disponibles jusqu'à correction/résolution ou constat d'un blocage
réel par le moteur, sous le budget habituel d'itérations sans progression.
Si le fournisseur produit de la prose malgré ce choix d'outils, un rappel de
la continuation est envoyé dans ce même budget. La route ne choisit ni cible,
ni compétence, ni risque, ni arguments et ne fabrique aucun appel. Une demande
de persuasion déclarée et nécessitant un jet se résout par le modèle avec
`resolution: check`, `skill: persuasion`, le reçu d'échange réussi et un
événement de demande distinct. Les restrictions de répétition, les choix
réels du joueur et les réactions sur le dé original restent applicables.

Les descriptions, champs des schémas et procédure `get_rules_support` portent
ces distinctions. Après une erreur de référence, le MJ doit retrouver et
reprendre l'interaction existante, puis poursuivre les propos ou la demande
déjà déclarés si autorisés. Une erreur technique ne constitue pas un refus du
PNJ et n'exige pas que le joueur répète sa démarche. Un nouvel événement ne
permet jamais de contourner les gardes de répétition d'un test déjà terminé.

`begin_social_interaction` établit une conversation avec une cible réellement existante et accessible. Le MJ choisit explicitement son attitude **friendly**, **indifferent** ou **hostile**, avec sa source. L'attitude est arbitrée par le MJ et ne remplace pas la disposition utilisée par les quêtes. Les restrictions sociales propres au personnage ou à l'aventure restent applicables.

`record_social_conversation` enregistre les propos et contributions réels de participants précis. Le MJ indique si l'échange a atteint sa demande et s'il est suffisant pour une lecture de personnalité. Le moteur ne lit pas le dialogue pour choisir une intention, une cible ou un effet. Le jeu descriptif et le dialogue incarné sont tous deux valables ; la procédure standard n'attribue aucun bonus numérique à la qualité littéraire ou à la première personne.

Un changement d'attitude exige une décision MJ sourcée. Le garde automatise la procédure normale : au plus un cran depuis l'attitude de départ pendant cette interaction. Le DMG qualifie cette limite de « typique » ; ce garde n'est pas présenté comme une interdiction officielle de toute exception du MJ. Aucune exception ni nouvel état favorable n'est déduit automatiquement des propos.

`resolve_social_request` résout une demande précise, son risque/sacrifice réel et sa source. Seul un personnage ayant effectivement participé peut faire le test. Le mode **check** utilise le Charisme et, si elle s'applique, Persuasion, Tromperie ou Intimidation. Les contributions substantielles d'autres participants peuvent donner avantage ou désavantage ; plusieurs causes ne les empilent pas. L'aide générique d'un acteur qui n'a pas réellement contribué positivement à cette conversation n'est ni empruntée ni consommée. Les protagonistes, y compris un PNJ réellement coopératif avec une fiche active, gardent leurs véritables caractéristiques.

| Attitude | DD 0 | DD 10 | DD 20 |
| --- | --- | --- | --- |
| Friendly | Aide sans risque ni sacrifice | Accepte un risque/sacrifice mineur | Accepte un risque/sacrifice important |
| Indifferent | N'aide ni ne nuit | Aide sans risque ni sacrifice | Accepte un risque/sacrifice mineur |
| Hostile | S'oppose aux objectifs | N'aide ni ne nuit | Aide sans risque ni sacrifice |

Un résultat inférieur à zéro n'atteint aucune bande de cette table ; le moteur n'invente pas une réaction supplémentaire. La capacité d'une bande ne crée pas un risque que le joueur n'a pas demandé. Une demande dépassant la table ou explicitement impossible n'est pas accordée par un haut dé. Un 20 naturel n'est pas un succès automatique de test de caractéristique.

Le mode **roleplay** enregistre plutôt la véritable décision du MJ, sans dé. Il permet notamment l'aide amicale ordinaire sans coût ni risque. Cette décision doit être fournie explicitement ; le moteur ne déduit pas la volonté du PNJ. Une impossibilité ou un refus absolu établi reste applicable.

Une demande formulée en réplique ou par une menace reste une tentative sociale
si elle vise une confidence, une aide ou une reddition. Le contrat demande au
modèle de consulter la procédure et de résoudre cette demande avant la réponse
finale ; une issue certaine autorisée exige aussi son outil, en mode roleplay.
Pour une cible explicitement non influençable, le MJ vérifie la restriction
dans la campagne et respecte ce blocage : ni jet artificiel ni appel social
déjà connu comme interdit. Une erreur technique ne devient pas un refus du PNJ.
Ce sont des consignes au modèle ; le serveur ne détecte pas une menace dans le
texte et ne fabrique aucun appel manquant.

Le MJ choisit ce mode dès que l'issue réelle est certaine : condition du module
déjà satisfaite, ou résultat minimal avec les vrais modificateurs atteignant
déjà le DD. Par exemple, une aide amicale sans risque est à DD 0 ; un acteur
à +0 ne peut pas la manquer sur un d20. Dire « je tente de persuader » ne rend
pas un jet obligatoire. Un modificateur négatif peut en revanche laisser une
vraie incertitude à DD 0. Le MJ ne crée ni risque, demande supplémentaire ou
DD plus haut pour justifier un jet. Les consignes figurent dans le contrat,
la procédure, les schémas et la continuation de l'échange ; le serveur ne
transforme pas un appel check du modèle en décision roleplay à sa place.

Le résultat traite seulement la demande choisie. Il n'exécute pas un déplacement ou un ordre de PNJ, ne révèle aucun indice, ne transfère aucun objet et ne valide ni paiement ni objectif de quête. Les outils correspondants et leurs propres préconditions restent nécessaires. Une phrase « je le persuade » ne produit pas ces conséquences.

Après l'accord, avec ou sans dé, le résultat `outcomeApplication` rappelle
la cible exacte et, pour un PNJ, sa disposition au moment de la résolution.
`dispositionApplied: false` signifie que cet outil social ne l'a pas modifiée.
Si la confiance ou la coopération est réellement établie selon le module,
le modèle doit ensuite choisir `reveal_npc({npcId, disposition, reason})`,
même pour un PNJ déjà visible, et attendre son succès avant de narrer ce
changement. Le domaine social charge aussi ce schéma. Une attitude friendly,
une écoute ou un accord limité ne vaut pas automatiquement helpful ; les
refus d'expédition, le recrutement et l'escorte restent distincts. Aucun appel
ni argument de disposition n'est fabriqué par le serveur.

Les repères du tour distinguent désormais la dernière demande résolue de la
disposition actuelle. Un accord déjà acquis dont la conséquence a été oubliée
ne doit pas être rejoué avec un autre dé pour appliquer cette conséquence.

## Répétitions et sauvegarde

Après un test réellement terminé, un nouveau test exige une décision MJ explicite désignant son véritable événement précédent. Une seule conversation peut être active par identité sociale réelle. Après sa fermeture, une nouvelle conversation faisant suite à un test antérieur exige aussi une décision de renouvellement liée à la dernière interaction et au dernier test. Changer un identifiant, fermer puis rouvrir sans cette décision, ou viser une autre représentation du même personnage ne donne pas un nouveau dé gratuit.

Les interactions et tests ont des séquences monotones persistantes, même si plusieurs événements ont lieu au même instant. Les reçus immuables gardent les demandes, attitudes, contributions et résultats. Un jet suspendu conserve son d20 et son vrai checkpoint de lieu, cible, temps et action après SQL/hydratation. Sa reprise ne relance pas le test. Un test de combat consomme seulement l'action de son acteur, une fois à sa résolution finale ; les faits MJ et inspections ne consomment pas d'action. Aucun temps de conversation par défaut n'est inventé.

La fermeture est un constat MJ à l'instant présent, possible après le départ ou la disparition de la cible. Elle n'exige pas de ramener un PNJ distant ou archivé dans la scène et ne modifie aucun acteur. Le début d'une nouvelle conversation reste soumis à sa véritable disponibilité et à la décision de renouvellement requise.

Les anciennes fiches conservent leurs statistiques et règles d'action réelles. La procédure ne leur fabrique pas un `HeroState`, une classe ou une réaction de héros pour permettre une conversation.

## Intuition et confidentialité

`discern_social_characteristic` nécessite assez de conversation réellement constatée, un DD choisi par le MJ et une caractéristique déjà sourcée. La préparation référence un élément exact du profil publié du personnage ou un fait du monde déjà établi. Une réussite donne uniquement cette lecture. Un échec d'au moins dix points ne donne une interprétation erronée que si le MJ l'a précisément choisie **avant** le dé ; cet effet optionnel n'est jamais généré et ne crée pas une caractéristique véritable.

`inspect_social_interaction` est une référence confidentielle du MJ. Les traits, erreurs et motivations ne doivent pas être divulgués depuis cette inspection. Les événements résolus sont conservés et relisibles ; leur champ `playerResult` délimite la lecture acquise, y compris une croyance erronée sans annoncer son erreur au joueur. Le transport actuel de l'application transmet encore l'état complet : ces projections et consignes ne prétendent pas protéger les secrets contre l'inspection technique du client.

## Compatibilité et validation

La procédure sociale est exclusivement celle de D&D 2014. Les personnalités,
buts, goûts, sujets sensibles et identités communes aux différentes scènes
restent conservés. Le système de score relationnel, ses variations et son
sélecteur de politique ne font plus partie des outils ni de l'état courant.
Les anciens champs de score et sélections inutilisées sont supprimés aux
frontières SQL et MCP, sans nouveau tirage de personnalité ou dé de jeu.
Les anciens reçus de jets sous une autre règle ne sont pas réécrits : ils sont
refusés par la validation, plutôt que recalculés rétroactivement.

`tests/social-interactions.test.cjs` couvre les tables et plafonds de risque,
les refus avant dés, les participants réels, les coûts d'action, les réactions
suspendues, le stockage SQL et les lectures confidentielles. Les suites de
personnalités vérifient la stabilité des profils et des contraintes de campagne.
`tests/mcp-social.test.cjs` verrouille le catalogue, les prompts, les cibles,
les DD exacts et le nettoyage des anciens champs aux deux frontières.
