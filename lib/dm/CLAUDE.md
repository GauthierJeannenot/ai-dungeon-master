# lib/dm/ — pipeline du Dungeon Master

Orchestré par app/api/dm/route.ts : anti-abus → débit → session autoritaire →
sync MCP → compression historique (`history.ts`) → agent MJ unique
(interprétation, tool-use, narration) → persistance.

## Contexte et procédures à la demande

Le système contient le contrat permanent, la fiche, les petits socles partagés,
les exemples locaux et l’index du module. Il reste indépendant de l’état courant.
`consult_rules`, `consult_campaign` et `discover_tools` sont trois outils MCP,
toujours exposés avec leur schéma et documentés dans le prompt système : aucun
appel de découverte préalable. `mcp-server/campaign-reference.ts` lit le Markdown
de l'aventure figée au spawn ; toutes ses cartes et annexes sont consultables
par index/recherche/lecture paginés. La découverte interroge les outils réellement
enregistrés via leurs handles publics SDK, sans mutation de partie. La politique
`lib/tool-exposure.ts` est commune au moteur et à la route. `lib/tool-catalog.ts`
porte les recherches et le chargement des schémas spécialisés ; la route applique
les sélections renvoyées par MCP avant l'appel LLM suivant. Les lectures distinctes
renouvellent le budget de progression, les relectures identiques ne le renouvellent
pas. Aucun outil documentaire local dans la route ; aucun effet de jeu acquis.
`buildTurnUserMessage` fige le contexte d’ouverture ; les résultats outils portent
les changements ultérieurs dans leur ordre réel.

La politique de consultation demande à l'agent, à chaque nouveau message joueur,
y compris un dialogue, une attente ou une clarification, une recherche puis
lecture ciblée `consult_campaign` et une recherche `discover_tools` avant toute
action de jeu ou réponse finale. Les notes du contexte et lectures d'un ancien
tour ne remplacent pas ces appels. Un tour couvre le message et sa résolution,
pas chaque appel LLM. Pour une mécanique, ajouter la procédure `get_rules_support`
et la lecture du passage source `consult_rules`, même pour une action courante. Un
rappel générique figure dans le contexte du tour ; aucun message joueur n'est
analysé par le serveur pour décider ces appels. Les lectures déjà utiles sont
réutilisées dans ce même tour, sans boucle documentaire. Après un refus, le
retour `actionRecovery` demande de réutiliser les lectures pertinentes du même
tour, compléter les procédures manquantes et inspecter les références incertaines
avant un nouvel essai autorisé, en conservant les identités existantes. Le dialogue
sans mécanique reste possible sans jet ni mutation artificiels. Cette politique
renforce les consignes, sans garantir l'obéissance
du modèle ni fabriquer d'appels MCP.

L'initiative du MJ ne dépend pas d'une demande concrète du joueur. Le contrat
lui demande d'examiner à chaque échange les motivations, faits établis et
conséquences dues, puis de choisir les consultations, inspections et outils
nécessaires aux réactions des PNJ et aux événements justifiés du monde.
Ces effets attendent leur résultat moteur, même pendant une conversation ou
une attente. Cette initiative ne choisit aucun acte du personnage et ne crée
ni événement, danger, temps ou dé pour augmenter artificiellement les appels.
La vérification avant narration couvre aussi ces événements et conséquences.

`social-interaction-context.ts` transmet les repères des conversations persistées
sur la carte courante (ouvertes et fermées, événements utilisés, dernier échange,
participants et dernier test). Le prompt dynamique et les résultats des outils
sociaux/changements de scène les rendent au modèle ; aucun appel n'est fabriqué.
`inspect_social_interaction` appartient au catalogue courant : `{}` retrouve
les IDs sans en deviner un. La procédure et les schémas distinguent l'ID stable
de conversation, l'ID unique de chaque étape réelle et le reçu d'échange réussi
nécessaire à une demande. Le rejeu conserve tous les arguments ; un nouvel ID
ne permet pas de répéter un jet. Les participants excluent la cible opposée.
Une erreur d'appel ne constitue pas un refus du PNJ et se corrige sans faire
répéter au joueur des propos déjà déclarés. La projection reste confidentielle
et ne fournit aucune coopération, confidence ou résultat non résolu.

Les erreurs de participants sociaux renvoient une `agentContinuation` moteur
avec les références refusées sans reçu ; le modèle corrige ce même événement,
sans participant cible ni doublon. Pour un joueur seul, participants = player,
pas tous les locuteurs ; les paroles de la cible vont au besoin dans source.
Un nouvel échange réussi avec requestReached=true indique aussi la demande à
résoudre. Cette continuation n'est pas persistée dans le reçu rejouable. La
route maintient le choix d'outils pendant la continuation et rappelle l'état
incomplet si le fournisseur répond en prose ; le budget sans progression reste
inchangé. Elle ne choisit aucun appel/argument ni compétence depuis le texte
joueur. Une résolution ou un vrai refus métier de la même procédure lève cette
attente ; une erreur de participants ne fait pas répéter la demande au joueur.

Les procédures spécialisées sont dans `lib/dm/rule-guides.json`. `lib/rule-guides.ts`
les sélectionne par domaine explicite ; `get_rules_support({domain})` les expose
avec les capacités et limites moteur. Sans domaine : index compact, jamais tout
le catalogue. Chaque nouvelle mécanique ajoute sa procédure au domaine concerné,
pas un nouveau paragraphe au système permanent.

La procédure sociale impose un enjeu réel avant de choisir un dé. Une issue
certaine utilise `resolve_social_request` en `roleplay` avec décision MJ
explicite ; aucune augmentation de risque/DD pour fabriquer une incertitude.
Après accord, `outcomeApplication` rappelle que la disposition n'est pas
appliquée. Le modèle choisit `reveal_npc` si la confiance/coopération réelle
justifie ce changement, même pour un PNJ visible et sans jet. Ce schéma est
chargé par le domaine social. Les repères distinguent la dernière demande
résolue de la disposition actuelle ; aucune conversion automatique en helpful,
recrutement, escorte ou objectif, aucun nouvel appel de jeu côté serveur.

`consult_rules` renvoie également `engineGuidance`, annotations de projet
séparées du texte source intact : outils/domaines en recherche, puis procédures
canoniques sélectionnées et limites moteur lors d'une lecture. La route charge
uniquement après cette lecture les schémas associés actuellement disponibles,
sans appeler d'action. Les associations autorées sont dans
`mcp-server/rules-tool-links.json` ; les procédures restent dans le catalogue
commun, sans duplication dans les livres. `unavailableTools` et l'absence de
lien sont explicites ; une lecture n'adopte aucune règle optionnelle et ne
complète aucun choix joueur. Réutiliser la procédure déjà lue dans le tour.

`discover_tools` est une lecture MCP du catalogue public réel : query ou noms
explicitement choisis par le modèle. Les schémas trouvés deviennent disponibles
à l’appel LLM suivant ; la lecture n'exécute aucun outil de jeu trouvé et ne consomme aucune
action. Une consultation réussie d’un domaine charge aussi ses outils disponibles.
Aucun classifieur du message joueur. Les restrictions phase/personnage sont
réévaluées depuis l’état moteur ; un chargement antérieur ne les contourne pas.

Le transport live unique est vLLM. Types de transcript locaux dans `llm-types.ts`,
aucun SDK fournisseur. Le cache de préfixe est éventuel et géré côté vLLM, sans
marqueur applicatif. Le tokenizer protège chaque appel live et le résumé reste
le seul préfixe remplaçable sous pression de contexte.

## Carte de la scène (scene-map.ts)

`renderSceneMap` génère la carte de la map COURANTE depuis GameState + map.ts,
dans le bloc DYNAMIQUE (`## CARTE DE LA SCÈNE`). Deux niveaux : TOUJOURS les
zones de salles + contiguïtés précalculées (`zonesTouch`/`directionLabel`),
entrées et positions (joueur, PNJ révélés, monstres vivants) ; en COMBAT
seulement, la grille ASCII tactique en plus (géométrie fine — hors combat elle
coûterait des tokens par appel pour un signal déjà couvert). C'est LA carte de
référence du DM : les `adventure-module.md` n'ont plus de grille écrite à la
main (leur section « Carte des salles » renvoie au bloc dynamique). Ne jamais
déplacer cette carte dans le bloc statique (elle varie à chaque tour), ni réintroduire une grille figée dans un module .md (elle divergerait
de l'état).

Les connexions de salles sont maintenant derivees des regles communes de
`lib/navigation.ts` : topologie (portes supposees ouvertes), disponibilite du
trajet dans l'etat courant, distance geometrique et cout reel restent distincts.
Le système reste statique ; la carte et le contexte courant sont dynamiques.
Le DM choisit `roomId` pour un lieu
nomme ; seul le moteur choisit le point d'arrivee et le chemin.

Les murs approuves viennent de `adventures/<id>/geometry.json`. Sans extraction
approuvee, la carte annonce `legacy_unverified` et utilise cloisons, seuils et
salles `enclosed` autorees. Un brouillon incertain n'est jamais active en silence.
L'analyse d'image est faite dans la conversation, sans integration d'API vision.
Voir `docs/navigation-and-battlemaps.md` (import/revision/ASCII, contrats moteurs
et exemples) et `docs/multi-map-adventures.md` (portee par map).

`nearby-rooms.ts` ajoute les notes COMPLETES des seules salles reliées à la salle
courante en navigation tactique (portes fermées comprises, jamais une autre map).
`lib/scene-perception.ts` sépare cette référence confidentielle du MJ des cases
géométriquement visibles `[x,y]` : murs/portes fermées bloquent la vue, pas les
occupants ni les restrictions de déplacement. Éclairage, cachettes et secrets
restent à interpréter par le modèle. Après mouvement/porte/réaction, un contexte
local actualisé est ajouté au `tool_result`, sans réécrire le message de tour gelé.

Le modèle décide si une action RÉSOLUE fait du bruit et appelle `react_to_noise`
explicitement : alerte persistante, puis investigation à une action ultérieure,
puis entrée éventuelle en combat. Aucun mot-clé, seuil de bruit automatique ou
appel MCP fabriqué côté serveur. Positions et vitesses SRD sont sauvegardées dans
`sceneMemory.encounterAwareness`, par rencontre et map ; les investigateurs
occupent leurs cases sans être encore des combattants. Voir le contrat détaillé
et les limites dans `docs/navigation-and-battlemaps.md`.

Les PNJ reactifs sont sollicites apres une action joueur resolue ou au debut de
leur tour. Le modele emet `npc_action` via le MEME chemin tool_use que le reste
du jeu. Aucun appel de jeu fabrique cote serveur. Les cles d'activation et les
receipts `clientRequestId` sont persistes avant l'appel LLM suivant ; les tours
deterministes de monstres s'arretent devant un combattant `reactive_npc`.

## Vocabulaire par module — jamais en dur

Les prompts ne contiennent AUCUN nom propre de module : lieux, PNJ et exemples
viennent de `promptGuidance` (adventures/<id>/definition.ts) via
`getAdventureDefinition(gameState.adventureId)`. Le verrou
tests/no-module-leaks.test.cjs échoue si « Grammy/verger/dryade/… » réapparaît
dans lib/. Tout nouvel exemple dans un prompt passe par un champ de
`AdventurePromptGuidance`, pas par une chaîne littérale.

## Agent MJ unique

Les conversations privilégient les répliques directes des PNJ à la première
personne, entre guillemets français, avec locuteur identifiable et quelques
gestes ou indications de ton. Le narrateur s'adresse au joueur avec « tu » ;
le « je » d'un PNJ ne parle jamais à sa place. La correction de narration
préserve ces répliques. Personnalité, savoir accessible, secrets, langues et
mutisme du module restent prioritaires ; aucun dialogue ne crée d'effet moteur.

Le modèle MJ interprète directement le message, choisit chaque outil MCP et
ses arguments, puis narre les résultats. Aucun appel `dm.plan`, outil de planification,
classifieur, modèle de vérification ou parseur d'intention n'intervient.
`actionExamples` dans les définitions d'aventure conserve les exemples locaux
et les injecte dans le système statique du MJ. `quest-context.ts` fournit les
conditions exactes au contexte dynamique. Accepter une mission n'autorise pas
une prise d'objet implicite ; chaque choix reste celui du joueur et du modèle.

Une réponse textuelle sans outil reste possible pour le dialogue ou une
clarification. Le serveur n'infère pas un outil manquant depuis cette prose.
Le contrat distingue explicitement ces échanges des paroles qui tentent une
action (menace, confidence demandée, aide, reddition). Le modèle consulte la
procédure puis résout une tentative autorisée avec son outil, même sans dé ;
un refus absolu vérifié dans la campagne reste un blocage sans appel interdit.
Avant de narrer, il vérifie lui-même que chaque acte demandé a un résultat ou
un blocage confirmé. Aucun contrôle sémantique ni appel automatique côté route.
La cohérence sémantique du choix d'outil reste à valider avec le modèle réel ;
le mock vérifie le pipeline, pas cette qualité d'interprétation.

## Modèles et coûts (llm.ts)

- `LLM_PROVIDER=openai` uniquement (défaut), `MODEL` pour le MJ et `COMPRESS_MODEL`
  pour le résumé (par défaut le même modèle OpenAI, `gpt-5.4-mini`). `LLM_MODE=mock|live`, garde
  `ALLOW_PAID_LLM=false` et aucun repli réseau implicite. Voir
  `docs/openai.md`.
- La prose accompagnant un appel outil doit être ignorée (publication ET
  transcript). Un refus métier ou MCP isError ne consomme pas l'action primaire.
  Le fallback de narration garde les résultats du transcript.
- Le système statique ne contient aucun bestiaire global de campagne. Le bloc
  dynamique `buildLocalBestiaryContext` sélectionne les créatures de la zone
  courante en exploration, de la salle courante et des salles directement reliées
  en tactique/combat (portes fermées comprises, même map uniquement).
  `local-creatures.ts` partage ce périmètre entre bestiaire, carte, état sérialisé
  et bilan narratif. Les positions réelles des investigateurs/PNJ priment sur
  leurs placements initiaux ; les membres éloignés d'un groupe restent exclus.
  Les annexes de bestiaire du module sont retirées des index statiques ; les
  stocks `floorMonsters` et `encounterAwareness` ne sont pas sérialisés en bloc.
  `loadBestiaryPrompt` reçoit les types/PNJ locaux : notes d'espèce uniquement,
  sans titres, placements et notes générales qui énumèrent le casting global.
  Le champ optionnel `creatures[].npcIds` associe explicitement un PNJ dont le
  `kind` narratif diffère du type SRD. Les profils complets restent accessibles
  par `get_monster_stat_block`, sur appel du modèle. `bestiary.md` conserve la
  référence complète. Après déplacement/transition/changement de phase, le
  contexte local frais est ajouté au résultat MCP, sans changer le système.
  Ce filtre porte sur les références injectées, pas sur les souvenirs narratifs
  ni sur les résultats d'actions explicitement résolues par les outils.
  Les compléments narratifs optionnels `adventures/<id>/npc-lore.json` sont lus
  par `enrichLocalSocialProfile` après ce même filtre positionnel. Raccord par
  identifiants exacts de PNJ/identité et types de rencontre, jamais par lecture du
  message joueur. Ils restent côté serveur : aucun import de ces JSON dans les
  cartes partagées, le moteur ou le client. Les dossiers portent sources,
  empreintes, passages complets, personnalités sourcées et notes d'adaptation.
  `loreRef` rattache l'acteur au dossier ; les passages communs sont transmis une
  fois par bloc via `passageRefs`. Les tirages conservés ne remplacent pas les
  faits sources. Ces références confidentielles ne créent aucun savoir du joueur
  ni effet mécanique. Le cache narratif est vidé par `invalidateContextCache`.
- Si la narration échoue après un checkpoint mécanique, la réponse d'erreur
  renvoie `newGameState` avec le dernier état sauvegardé ; le client l'applique
  pour conserver la position réelle. Le remboursement reste effectué.
- En OpenAI live, mesurer la requête complète avec `/v1/responses/input_tokens` avant le tour et
  avant chaque appel du MJ (y compris narration finale/correction). La limite
  vient de `OPENAI_CONTEXT_WINDOW_TOKENS` (400000 pour le modèle par défaut), avec budget de sortie + marge de 4096 tokens
  (`LLM_CONTEXT_RESERVE_TOKENS`). Le résumé est un message du préfixe historique,
  séparé du message de tour gelé. Sous pression, `processHistory` réduit même
  les dix messages récents, par échanges complets ; seul ce préfixe est remplacé.
  Le système, le message courant et le transcript MCP restent intacts. Sans
  historique restant, la marge peut être utilisée, mais jamais le budget de sortie.
  Un tour encore trop gros échoue avant génération. Pas de repli payant ni de
  suppression silencieuse si le tokenizer ou le résumé échoue. Les résumés trop
  gros sont eux-mêmes traités par fragments chronologiques. Le résumé et son
  suffixe exact sont sauvegardés dès compression, puis aux checkpoints ; repartir
  de cette version stockée, même en dev, évite de réintroduire l'historique complet
  du navigateur. Le seuil historique en caractères reste actif ; aucun
  réseau de comptage en mock/appels payants bloqués.

- `LLM_MODE` : `mock` ou `live` UNIQUEMENT. Le mock (`createMockLlmMessage`)
  (`mock-llm.ts`) est déterministe et simule les tools par regex — les
  tests et le playtest en dépendent ; si on ajoute un tool critique, étendre
  le mock en conséquence.
  Il lit le transcript `tool_use`/`tool_result` pour ne résoudre chaque action
  qu'une fois et terminer explicitement le cycle via `next_turn` puis
  `run_monster_turns`. La fouille appelle `roll_ability_check` ; une proposition
  de paix appelle Persuasion, puis `end_combat` uniquement après réussite.
  Un échec conserve son jet, sans réessai automatique ni attaque du joueur.
  Ces heuristiques restent exclusivement dans le faux fournisseur.
  Le social standard utilise `begin_social_interaction`, `record_social_conversation`
  puis `resolve_social_request` si une demande exige un jet. Seules les
  attitudes et tables de réaction D&D 2014 sont utilisées. Après
  `end_combat` ou `run_monster_turns`, le mock narre les résultats sans ouvrir
  une nouvelle conversation à partir de l'ancien message du joueur.
- L’estimation de coût (`lib/llm-usage.ts`) utilise uniquement les tarifs OpenAI
  configurés, nuls par défaut, hors coût GPU/stockage.

## Garde-fous de la boucle (route.ts)

- `consult_rules` donne accès aux livres 2014 uniquement sur appel du modèle.
  Il reste disponible dans les deux phases et lors d'une activation PNJ.
  Le MJ peut choisir une lecture préalable ou répondre directement. Les lectures
  n'entrent pas dans les preuves mécaniques et ne créent pas de checkpoint.
  Une nouvelle lecture réussie compte comme progression. Voir docs/rules-library.md.

- Les prompts MJ donnent priorité à l'outil
  dédié : aucun jet générique avant/après un outil qui résout déjà le même
  jet, et aucun contournement d'un refus par un jet séparé. Les jets autonomes
  restent permis pour les actions sans outil adapté ou un jet distinct
  explicitement demandé par un résultat moteur. Le choix reste à l'IA.
- `MAX_STALLED_ITERATIONS` borne les itérations consécutives sans nouveau résultat
  MCP réussi (défaut 6, `LLM_MAX_STALLED_ITERATIONS` ; ancien réglage
  `LLM_MAX_CALLS_PER_REQUEST` accepté comme alias). Aucun plafond total d'appels
  n'interrompt une résolution qui progresse. Répéter le même outil avec les mêmes
  arguments et le même résultat ne renouvelle pas ce budget. Les activations PNJ
  restent dédupliquées par leur activationKey, sans quota arbitraire par message.
  `HIDDEN_FROM_LLM` cache les tools de
  synchro interne ; `selectToolsForPhase` filtre combat/exploration (réévalué
  depuis la phase moteur courante).
- « Une action de jeu majeure par message » (`PRIMARY_ACTION_TOOLS`) ne
  limite que le PERSONNAGE, jamais les événements du MJ ni les autres acteurs
  des outils partagés (`entityId`, `attackerId`, `tokenId`, `actorId`). Le budget
  est contrôlé en EXPLORATION — en combat c'est le moteur qui borne tout, mais
  l'action joueur reste comptée si le combat se termine dans le même message.
  Exception rare choisie par le MJ : `grant_player_action({reason})` autorise
  une deuxième action après la première, jamais une troisième par répétition.
  Le moteur valide l'octroi, enregistre sa justification dans `dmActionAllowance`
  et le journal, et renouvelle seulement l'action en combat (crédit SRD compris).
  Une seule exception par message et par tour de combat, même après hydratation.
  La synchronisation interne initialise le contexte du message sans accorder
  d'action. La route ne débloque son budget qu'après succès de l'outil choisi
  explicitement par le modèle. Le personnage choisit toujours ses propres actes.
  Un déplacement peut accompagner une autre action, mais aucun de ces tools
  ne peut être répété après réussite dans le même message, sauf l'approche puis
  le franchissement de la même porte demandés par le modèle. Un trajet furtif
  utilise `move_token(stealth=true)` : jet + mouvement atomiques côté moteur,
  DD de la salle de destination. Il ne peut pas être suivi d'un deuxième jet
  de Discrétion. Un dépôt/retrait d'objet peut précéder ce trajet.
- Le MJ parle au joueur avec « tu ». Une narration commençant par « je » est
  corrigée une fois avec le transcript moteur avant publication/persistance ;
  si cette correction échoue, la route retourne une erreur remboursée.
- Le message joueur est interprété uniquement par le modèle MJ.
  La route ne recherche ni mots-clés, ni directions, ni intentions furtives ;
  elle ne choisit pas de séquence de porte et ne réécrit pas les arguments.
  Le DM choisit `doorId`, `doorMode`, `stealth`, les cibles et les étapes.
  Le moteur dérive les cases des seuils et valide portée, état de porte et DD.
  Le budget autorise une approche puis un franchissement de la même porte,
  sur la base des appels structurés réussis, sans lire le texte du joueur.
  Le faux fournisseur `mock-llm.ts` est importé paresseusement uniquement en
  `LLM_MODE=mock` ; aucune heuristique de ce module ne s'exécute en live.
- `narration.ts` dérive un relevé compact des résultats MCP (y compris les
  ripostes et les reprises de tour), position/PV finaux et adversaires vivants.
  La route fournit directement ces `narrationFacts` dans chaque `tool_result`
  au modèle qui narre ; le fallback final reçoit aussi le relevé du tour.
  Aucun appel de contrôle ni modèle de vérification supplémentaire. Les faits
  suivent l'ordre des outils ; le dernier état final fait autorité. Les prompts
  exigent de rapporter les blessures réelles, même si l'armure amortit le coup.
  Cela guide la narration sans garantir formellement toute sa cohérence.
- Les prompts MJ réservent une information nécessitant un jet
  à la réussite confirmée du jet correspondant, y compris avant tout jet.
  La règle couvre toutes les découvertes, pas seulement les confidences PNJ.
  Après un `roll_ability_check` échoué, `narrationFacts` rappelle au MJ de ne
  divulguer aucune information conditionnée à la réussite, même dans un bilan
  négatif d'une confidence refusée. Les indices autorés accessibles malgré
  l'échec restent permis. Les descriptions PNJ/libellés de quête n'exposent pas
  les confidences privées ; leurs conditions restent dans les notes de salle.
  La compression écarte aussi ces apartés erronés des connaissances acquises.
  Pas de filtre lexical du message joueur ni d'appel de vérification ajouté.
- Création d'eau demande `waterEffect: { description, cell }` : l'IA interprète
  librement l'effet dans les limites SRD, sans menu de modes. Le moteur valide
  position et coûts avant débit, puis conserve le texte comme `worldFact`
  durable avec `basis: "ai_interpretation"`. Le narrateur le reçoit dès le
  tool_result ; il est rappelé uniquement dans sa salle/map après sauvegarde
  ou retour. La description est une donnée narrative, jamais une instruction
  ni une mutation de PV/inventaire/porte/condition. L'état mécanique prime.
  Le moteur ne valide pas sémantiquement une description libre et ne choisit
  aucun effet à partir du texte joueur. Les anciens faits à modes restent
  lisibles à l'hydratation seulement. Voir `docs/playable-characters.md`.
- `record_scene_fact({description,cell,replaceFactId?})` mémorise les conséquences narratives
  certaines/résolues des autres actions ; aucun effet mécanique n'en découle.
  Il reste auxiliaire et ne remplace aucun effet mécanique dédié ;
  tous ses appels proviennent explicitement du modèle. Dépôt/reprise utilisent
  `drop_item`/`pick_up_item` avec `description` pour lier mémoire et mutation
  d'inventaire. `nearEntityId` ou `toCell` choisit un placement à portée ; le
  repère est un instantané, jamais un suivi du PNJ. Une reprise efface les faits
  liés à `subjectItemId` ; un redépôt remplace la mémoire précédente.
  Après un refus (moteur ou garde-fou serveur), un jet/une attaque
  échoué ou un trajet incomplet, la mémoire libre est bloquée pour le reste
  du tour, même en cas de nouvelle tentative ; les résultats mécaniques et
  les faits atomiques des outils dédiés restent sauvegardés. Ce verrou porte
  uniquement sur les résultats structurés, jamais sur le texte du joueur ou
  la sémantique d'une description. Il est réinitialisé au prochain message.
  L'usage d'un outil dédié plutôt qu'un jet générique relève du MJ et de ses
  consignes ; la route ne déduit aucun plan du message. Les mutations de porte,
  d'inventaire, de PV et de condition restent réservées à leurs outils moteur.
  Sans résultat de jeu résolu, une boucle stagnante termine avec un message
  d'action non résolue ; elle ne déclenche pas de narration libre supplémentaire.
  Un fait narratif de cette scène peut être remplacé par son ID après un
  changement établi, mais un fait lié à la position d'un objet exige son outil
  d'inventaire. Les IDs sont inclus dans le contexte des faits.
- `combat-flow.ts` est un validateur PUR de l'état du tour (aucun import MCP,
  aucune mutation, aucun choix de prochain outil). Si le tour est incomplet,
  la route renvoie ses faits à l'IA dans la boucle existante ; l'IA choisit
  et émet les transitions, ripostes et fin de combat. Idem pour une ancienne
  session bloquée : reprise par l'agent avant la nouvelle intention. Si l'IA
  ignore ces retours jusqu'au seuil de stagnation, conserver les effets déjà confirmés et
  signaler la résolution incomplète, sans fabriquer d'appels ni de narration.
  Une négociation réussie peut toujours se conclure par `end_combat` choisi
  par le modèle, sans riposte. Un cycle terminé rend la main au joueur ; l'octroi
  exceptionnel doit précéder sa clôture. Les erreurs moteur remontent au modèle.
- Verrou structurel : `tests/agent-mcp-call-sites.test.cjs` réserve les appels
  de jeu MCP à l'exécution d'un bloc `tool_use` ; seules les lectures/synchros
  d'état sont permises hors de ce chemin.

## Audit de frontière IA / MCP — 22 octobre 2026

Périmètre : toutes les routes, lib/, composants d'envoi de messages, transport
MCP, outils/moteur, registres d'aventure/SRD et scripts de test/rejeu. Les
points d'appel MCP sont vérifiés par AST en plus des tests avec moteur réel.

Écarts corrigés : reprise/fin automatique de combat, exécution/complétion des
marqueurs du planner, destination déduite de `reason` ou d'une sortie unique,
anciens résolveurs/tables regex de navigation, cible proche/arme implicite,
matching approximatif d'un nom ou d'une phrase d'arme/sort. Le faux fournisseur
est maintenant séparé et exclusivement chargé en mode mock.

Conservé comme validation/résolution, sans interprétation d'intention : JSON et
schémas des appels, droits/quota, bornes/occupation/portée, dés, aptitudes et
maîtrises, coûts, conditions, effets SRD, géométrie des seuils, critères de cible
explicitement demandés, tours de monstres explicitement délégués à leur outil.
Le contrôle de la première personne porte sur la sortie du narrateur, jamais
sur le message joueur, et ne produit aucune action de jeu. Les anciens types
d'EngineEvent/intent encore persistés sont des schémas, sans producteur actif.

Verrous : agent-mcp-call-sites (un seul chemin de jeu issu d'un tool_use,
mock importé dans sa branche seulement), dm-agent-boundary (texte seul sans
effet, arguments transmis intacts, marqueurs non exécutés), dm-combat-flow
(reprise par l'IA, absence d'action automatique si elle ne répond pas),
mcp-agent-selection (choix absents/ambigus refusés sans dés/coût/mutation).
Ces tests vérifient la frontière d'exécution ; ils ne prouvent pas que le
modèle interprétera correctement chaque formulation en partie réelle.


## Journal de propositions de quêtes

`objective-context.ts` fournit la vue connue et les propositions privées des
PNJ actuellement présents. Les conditions de sortie de `quest-context.ts`
restent internes et ne remplissent pas ce journal. Le modèle choisit
`record_objective_dialogue` pour une vraie communication et
`inspect_objectives` pour lire les seuls objectifs connus. La route transmet
les arguments intacts et remet le contexte actualisé après les outils de scène.
Aucun déclenchement depuis le message joueur, helpful ou une visite.
Le détail de procédure reste dans `rule-guides.json` / domaine `objectives`,
pas dans le système permanent. Voir `docs/objective-journal.md` et les tests
`objective-dialogue` / `dm-objective-dialogue`.
