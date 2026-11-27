## 25 novembre 2026 — scénario et découverte d'outils à chaque tour du MJ

**Demande et provenance.** L'utilisateur demande explicitement que le MJ
consulte le scénario et ses outils à chaque tour. Lecture ciblée du contrat
`lib/dm/prompts.ts`, du catalogue et de la boucle MCP existants, puis du socle
partagé ; aucun audit global ni scanner.

**Intégré.** Le système et le rappel dynamique demandent désormais, à chaque
nouveau message joueur, une recherche puis lecture pertinente `consult_campaign`
et une recherche ciblée `discover_tools` avant toute action de jeu ou réponse
finale, y compris pendant un dialogue, une attente ou une clarification. L'index,
les notes déjà injectées et les consultations d'un ancien tour ne suffisent pas.
Le tour désigne le message et sa résolution complète : les résultats reçus dans
la même boucle sont réutilisés sans nouvelles lectures identiques à chaque appel
LLM. `get_rules_support` et `consult_rules` restent requis pour les mécaniques ;
aucun jet ou effet artificiel demandé pour un simple dialogue.
`adventures/_shared/dm-rules.md` et `lib/dm/CLAUDE.md` sont alignés.

**Limites et suite concrète.** Tous les appels, recherches et arguments restent
choisis par le modèle. Aucun appel serveur fabriqué, analyse du texte joueur,
changement moteur, catalogue complet injecté ou blocage de narration ajouté.
Ce changement de consignes ne garantit pas l'obéissance du fournisseur live.
Observer un prochain tour narratif et un prochain tour mécanique pour vérifier
la consultation du scénario, la découverte ciblée puis la résolution effective.
**Validation locale.** `npm run typecheck` réussi. Les 20 contrôles existants
de `dm-prompt-guidance`, `dm-tool-discovery`, `dm-agent-boundary`,
`agent-mcp-call-sites` et `no-module-leaks` passent. Le système permanent de
tide-crypt compte 34 970 caractères, sous le plafond existant de 35 000 après
condensation des consignes. `npm test` a été lancé puis arrêté par l'agent après
708 contrôles rapportés, dont 24 échecs ; la suite complète n'est donc pas
validée. Journal : `output/mj-every-turn-tests-20261125.log`. Un échec a été
reproduit isolément : le test direct moteur B2 de `adventure-rewards.test.cjs`
échoue dans `toTemple` avec `MAP_QUEST_INCOMPLETE` (`sarah_story` manquant),
sans charger le prompt MJ ; il est indépendant de cette modification. Les
autres échecs ne sont pas diagnostiqués ici. Journal isolé :
`output/mj-every-turn-engine-failure-20261125.log`. `npm run playtest:mock`
réussi après l'arrêt de la suite générale : 30/30 tours, neuf scénarios,
71 appels mock (2,3667/tour), objectifs OK et sortie 0. Journal :
`output/mj-every-turn-playtest-20261125.log`. Ce fournisseur déterministe ne
prouve pas l'obéissance aux nouvelles consignes en live. Aucun appel LLM payant.

## 25 novembre 2026 — Kara : consultations seules et relances sans résolution sociale

**Demande et provenance.** Diagnostic utilisateur : la conversation avec Kara
aurait mérité une Persuasion. Lecture ciblée de `.data/logs/server.jsonl`,
session `d3252728-673b-4970-af13-6452d91f4567`, trois requêtes entre
22 h 11 et 22 h 16 Paris, et des captures correspondantes
`llm_training/{b1845596-e527-408f-9eb1-cdb9bbc363ea,edd37c4a-099c-4efc-ba54-cc37760de97b,d084dc75-c025-493e-8fbc-62693acf32b0}.jsonl`.
Aucun audit global ni scanner.

**Constat.** Les trois tours ne choisissent que `consult_campaign` et se
terminent normalement, sans erreur MCP. À la dernière relance (« vous etes
sur que vous n'avez rien a me demander ? »), le modèle recherche le jardin,
lit intégralement `section-267`, puis demande encore sur quoi le personnage
fonde ses informations. Ce passage contient bien l'alternative promesse
crédible / CHA Persuasion DD 14. Les trois appels LLM de ce tour disposent
déjà des schémas `begin_social_interaction`, `record_social_conversation`,
`resolve_social_request` et `roll_ability_check`, ainsi que du contrat sur
les paroles qui tentent une action. Aucun appel social n'est tenté ; aucun
enregistrement social ne vise Kara dans l'état final, qui la garde neutral.

**Limite et suite concrète.** Le blocage observé précède toute résolution :
le modèle poursuit les questions de confiance sans engager la procédure.
La route accepte une fin de tour narrative en l'absence de réaction ou
continuation sociale déjà signalée par le moteur ; ce garde ne détecte donc
pas une procédure jamais ouverte. L'absence de dé seule ne prouverait pas un
défaut, puisque le module permet une issue par le jeu de rôle. La suite doit
cibler le passage du dialogue à une tentative sociale, sans exiger les mots
« je persuade », sans fabriquer d'appel serveur ni imposer un dé à une issue
certaine. Diagnostic et consignation seulement : aucun code runtime, état de
partie, appel LLM, test ou playtest exécuté pour cette vérification.

## 23 novembre 2026 — raccourcis d’attaque à côté des adversaires

**Demande et provenance.** Demande utilisateur : disposer en combat d’un
bouton près des ennemis pour attaquer à portée, avec une arme ou de la magie.
Lecture ciblée du panneau d’initiative, des registres d’armes/sorts et des
préconditions d’attaque existantes ; aucun audit global ni changement de
sauvegarde.

**Intégré.** `components/CombatTracker.tsx` présente « Attaquer » près de
chaque adversaire vivant de l’initiative. Le menu propose les armes réellement
possédées, leurs modes corps à corps/lancer/tir et les sorts offensifs connus
du registre (cible ennemie ou effet condition). Les emplacements et piles de
munitions sont des choix explicites ; aucun stock n’est déduit d’un nom.
`lib/combat-attack-options.ts` projette les portées SRD sur la grille XY,
sépare allonge et lancer, signale le désavantage à longue portée et grise les
choix hors portée ou sans ressources/action. Les attaques supplémentaires
restantes sont conservées. Les états incapacitants, tours adverses et réactions
en attente bloquent le raccourci. `app/game/page.tsx` relie le choix à
`sendMessage` et applique les mêmes indisponibilités que les contrôles de carte
(chargement, présence et quota).

Chaque clic de choix envoie une demande joueur au MJ avec la cible, l’objet,
le mode, les munitions ou le niveau d’emplacement sélectionnés. Un tour de
magie ne fournit aucun `slotLevel`, conformément au moteur. Aucun appel de
jeu MCP fabriqué, mutation locale, interpréteur d’intention ou fin de tour
automatique ajouté. Le modèle reste responsable des appels structurés et le
moteur de leur validation/résolution.

**Validation.** `npm run typecheck` : réussi. Les neuf tests ciblés de
`tests/combat-tracker.test.cjs` passent : rendu des boutons, frontières de
portée, diagonales/allonge, lancer/tir, munitions exactes, absence de mutation,
états bloquants, attaques supplémentaires, sorts et emplacements. Suite
de vérification ciblée finale : **18/18 tests réussis**, couvrant
`combat-tracker`, `agent-mcp-call-sites`, `dm-agent-boundary`,
`mcp-agent-selection` et `no-module-leaks`. `npm run typecheck:next` relancé
sur les sources finales : réussi. `git diff --check` : réussi. Suite
complète `npm test` lancée, puis arrêtée après des échecs hors de ce chemin
d’interface : 336 succès et 16 échecs déjà rapportés avant interruption,
sans prétendre valider les tests restants. Une
relance isolée de `node --test --test-name-pattern="public real B2 search"
tests/adventure-rewards.test.cjs` reproduit l’échec de la préparation de
fixture (`tests/helpers/adventure-rewards-fixture.cjs:toTemple`) avec
`MAP_QUEST_INCOMPLETE` : l’objectif initial de récit n’est pas satisfait
avant `travel_to_map`. Ce chemin ne charge pas le nouveau composant ou son
sélecteur. Aucun assouplissement de cette règle ni modification de fixture.

**Limites et suite concrète.** La disponibilité est une aide d’interface en XY,
pas une prévalidation exhaustive : obstacles, couverture, géométrie verticale,
équipement en main, composantes et paramètres de zone restent validés par le
MJ/moteur. Les sorts avancés sans cible ennemie/effet condition et les projectiles
déjà réservés dans un objet chargé restent accessibles par le chat. Pour un
sort de zone, les paramètres spatiaux manquants doivent toujours être choisis
explicitement ; le raccourci ne fabrique ni zone ni cibles secondaires. Aucun
test navigateur interactif (service Computer Use indisponible après nouvelle
tentative et réinitialisation), ni appel LLM payant. Prochaine vérification concrète :
essayer le menu en partie sur mobile et sur écran large.

## 23 novembre 2026 — exception d'intimidation de Faerl autorisée

**Décision utilisateur.** Après le diagnostic ci-dessous, l'utilisateur demande
explicitement de pouvoir intimider Faerl, puis confirme que les autres
cultistes doivent rester non intimidables. Cette décision remplace le verrou
de Faerl uniquement, sans modifier celui des cultistes, fanatiques et Viallis.

**Intégré.** Le profil commun de `faerl_city` et `faerl_village` dans
`adventures/sarah-of-yellowcrest-manor/social.ts` devient influençable et ne
reprend plus le motif de refus absolu des fidèles. Sa loyauté reste forte,
mais sa survie peut primer face à une menace crédible. Le préambule, les
repères sociaux et les salles 8/14 du module explicitent la procédure et
l'exception après la mort des gardes. Les notes d'adaptation de `npc-lore.json`
et leur recette `5etools-import.json` indiquent que cette décision prévaut
sur l'immunité du texte source, conservé intact. Référence multi-map alignée.
Aucun changement du moteur social générique, de la route, du mock, des
positions ou des sauvegardes utilisateur ; aucun appel LLM payant.

**Validation.** `tests/mcp-social.test.cjs` couvre l'intimidation
de Faerl sur les deux cartes avec réussite/échec, restauration SQL/MCP et
rejeu sans nouveau dé. Le refus d'intimidation d'un cultiste reste vérifié.
`tests/yellowcrest-social-personalities.test.cjs` attend dix acteurs de
rencontre verrouillés et les deux représentations de Faerl influençables,
tout en conservant les refus exhaustifs des fidèles et de Viallis.
`npm run typecheck` et compilation MCP : sortie 0. Les deux fichiers ciblés
passent : **19/19**, sortie 0 (`output/faerl-intimidation-focused.log`).
`npm run playtest:mock` : **30/30 tours**, neuf scénarios, objectifs OK,
sortie 0 (`output/faerl-intimidation-playtest.log`). La suite complète avait
été lancée avec `npm test -- --test-concurrency=1`, puis a été interrompue
à la demande explicite de l'utilisateur ; runner et parent vérifiés absents
après l'interruption. Aucune relance, aucun succès global revendiqué ; journal
partiel `output/faerl-intimidation-tests.log`.
La disparition du verrou autorise la procédure mais n'impose aucun appel
automatique ni succès : le modèle choisit les outils et le moteur résout.

## 23 novembre 2026 — intimidation de Faerl après la mort de ses gardes

**Signalement et provenance.** L'utilisateur signale une nouvelle intimidation
sans jet après avoir tué les deux gardes. Lecture ciblée du journal existant
`.data/logs/server.jsonl`, de `social.ts` et du module de Sarah, sans audit
global ni accès SQL. Requête `dm-1795404654507-vfsii3`, le 23 novembre de
04 h 30 min 54 s à 04 h 31 min 15 s Paris : le message décrit le héros couvert
de sang, épée à la gorge de Faerl, exigeant qu'il parle. L'état d'ouverture
confirme deux gardes morts et la phase exploration. La réponse client rapporte
`discover_tools`, `get_rules_support`, `consult_rules` et `move_token`, sans
jet social ; Faerl refuse de parler davantage.

**Constat et limite.** Le profil partagé `faerl_city`/`faerl_village` hérite
toujours de `influenceable:false`. Le préambule et la salle 8 du module
interdisent explicitement l'influence par intimidation ; aucune exception
n'est prévue après la mort des gardes. Ce signalement ne démontre donc pas
un jet oublié par le moteur. Les consultations sont présentes cette fois,
contrairement à la menace du tour précédent documentée plus bas. Leur présence
ne prouve pas à elle seule l'interprétation exacte du modèle. Aucune règle,
sauvegarde ou consigne modifiée, aucun appel LLM ni test exécuté pour ce
diagnostic documentaire. Permettre ce jet nécessiterait une décision explicite
de modifier la restriction de campagne, puis un changement cohérent du profil
moteur et des références narratives ; ne pas la contourner par un jet générique.

## 23 novembre 2026 — images 5e.tools des pions de Sarah

**Demande et provenance.** Recherche et intégration des tokens et illustrations
de la campagne Sarah, confirmée par l’utilisateur. Consultation ciblée du seul
chapitre 9 de CM et des profils MM/CM 2014 concernés, depuis les cinq JSON
déjà figés en v1.221.2 ; téléchargement réel des images sur 5e.tools. Aucun
audit global, scanner de livres, appel LLM ou changement de sauvegarde.

**Intégré.** 30 WebP locaux (5173168 octets) dans
`public/adventures/sarah-of-yellowcrest-manor/5etools/` : cinq illustrations du
chapitre, quatre cartes MJ/joueurs, deux miniatures de cartes, onze tokens et
huit illustrations de bestiaire. `5etools-assets.json` conserve sources,
dimensions, tailles, crédits disponibles et SHA-256. Le nouvel import
`scripts/import-5etools-campaign-images.cjs` reproduit le téléchargement et
génère la galerie de crédits ; `--offline` vérifie fichiers et galerie sans
réseau ni écriture. Inventaire détaillé : `assets-5etools.md` dans l’aventure.

`token-images.ts` raccorde les 14 pions PNJ et tous les profils des rencontres,
avec priorité à l’identité nommée (Faerl, Vecken, Sarah), puis au profil de
créature explicitement autoré. L’identité `encounter:viallis_ritual:0` reçoit
Viallis ; un autre mage conserve son token d’archétype.
`AdventureContent.tokenImages`, `tokenImageForActor`, `Miniature` et `Battlemap`
affichent ces fichiers dans les pions, avec repli sur la figurine/les initiales
si un chargement échoue. Le lien de crédits ouvre la galerie du module.
L’image existante de l’apparition de Sarah est conservée (octets identiques à
la source téléchargée). Les plans jouables, géométrie, états et règles ne
changent pas ; les cartes originales et le grell restent des références.

**Découverte ciblée.** Le champ `portraits` de `npc-lore.json` conserve aussi
des images voisines d’une section : Faerl dans le dossier du cordonnier,
Sarah dans celui des Avoués. Provenance : comparaison de ces champs avec
les nœuds image du chapitre CM. Ce voisinage ne prouve pas l’identité ;
aucune attribution automatique depuis ces dossiers n’a été ajoutée. Les PNJ
sans portrait individuel reçoivent le token générique Commoner, explicitement
signalé dans l’inventaire ; le groupe des esprits est représenté par Sarah.

**Validation.** Typecheck MCP et Next terminé en sortie 0
(`output/campaign-images-typecheck.log`), puis contrôle final après attribution
de Viallis également en sortie 0 (`output/campaign-images-typecheck-final.log`). Cohorte
`token-images`, `miniatures`, `no-module-leaks` : 10/10, sortie 0
(`output/campaign-images-focused.log`) : identités/alias et combat, isolation
des modules et refus des identifiants inconnus, couverture des pions/profils,
intégrité des fichiers et maintien des figurines existantes. Vérification hors
ligne des 30 images et des crédits réussie
(`output/campaign-images-assets-check.log`). Aperçu des recadrages circulaires
inspecté visuellement (`output/campaign-token-preview.png`).

`npm test` a compilé le MCP puis lancé la suite ; sa propre arborescence de
14 processus a été arrêtée après identification du PID, parent et date de
création, car une autre suite complète tournait déjà avant ce lancement. Cette
autre suite n’a pas été interrompue. Aucun succès de suite complète revendiqué ;
journal partiel `output/campaign-images-tests.log`, identification des processus
dans `output/campaign-images-stopped-test-processes.json`. Playtest exécuté
directement avec le moteur déjà compilé, sans nouvelle écriture du dist partagé :
`node scripts/playtest.cjs --mode mock --report output/campaign-images-playtest.json`.
Sortie 0 : 30/30 tours, neuf scénarios, 71 appels mock, coût 0 $, objectifs OK
(89131 ms). Il vérifie le pipeline générique, pas la narration live de Sarah.

**Limites et suite concrète.** Les tokens génériques ne sont pas des portraits
biographiques. Les images des publications D&D restent attribuées à leurs
ayants droit ; aucune licence libre n’est inventée. Pas de recherche dans les
autres campagnes ni dans les livres de règles non concernés. Relancer la suite
générale lorsque le workspace est disponible ; recharger l’interface pour voir
les nouveaux pions.

## 23 novembre 2026 — initiative du MJ sans demande concrète

**Demande et provenance.** L'utilisateur précise que l'usage des outils ne
doit pas attendre une demande concrète. Relecture ciblée du contrat actuel et
du guide local, sans audit global ni lecture ou modification de sauvegarde.

**Intégré.** `lib/dm/prompts.ts` demande au MJ d'examiner à chaque échange la
situation, les motivations des PNJ, les événements établis et les conséquences
dues. Il choisit aussi de sa propre initiative les consultations, inspections,
réactions de PNJ et évolutions de scène justifiées, puis leurs appels de
résolution avant narration, y compris pendant une conversation ou une attente.
La vérification finale inclut ces événements et conséquences, au-delà des
seuls actes demandés. Les choix du personnage restent au joueur ; pas de
danger, temps, événement ou jet créé pour gonfler les appels. Guide local
`lib/dm/CLAUDE.md` aligné. Aucun appel serveur fabriqué, règle moteur, mock ou
état de partie modifié ; aucun appel LLM payant.

**Validation et limite.** Aucun test, typecheck ou playtest lancé, conformément
à l'instruction utilisateur. Relecture des seuls passages modifiés. Il s'agit
de consignes au modèle, sans garantie d'obéissance live. Suite concrète :
observer en partie ses consultations et résolutions spontanées justifiées,
sans imposer de quota d'outils ni d'action au personnage.

## 23 novembre 2026 — attente anormale avant une réponse du MJ

**Provenance.** Signalement utilisateur précisé : attente de la réponse du
maître du jeu. Lecture ciblée de `.data/logs/server.jsonl`, du journal Next,
de `lib/dev-mcp.ts`, de `lib/mcp-client.ts` et de la route DM ; aucun audit
global, appel LLM, outil de jeu ou changement de sauvegarde.

**Constat mesuré.** Requête `dm-1795403934598-tobs95`, le 23 novembre de
04 h 18 min 54 s à 04 h 25 min 11 s Paris : durée totale de 376665 ms.
Entre `dm.request.start` à 04:18:56.572 et le début de `replace_game_state`
à 04:24:21.012, 324440 ms s'écoulent dans la préparation de développement.
La nouvelle révision est publiée à 04:24:20.991. Le démarrage du processus
MCP prend ensuite 13968 ms. Les huit générations `dm.turn` durent ensemble
18015 ms, mesurés entre leurs événements `llm.call.start` et `llm.usage` ;
la première ne commence qu'à 04:24:41.449. Ce tour n'est donc pas bloqué
principalement par la génération du modèle.

`prepareDevelopmentMCPClient` attend la détection des changements et la
compilation d'une révision immuable avant de restaurer l'état. L'empreinte
porte sur tous les fichiers TS/JSON de `lib/`, `mcp-server/`, `adventures/`
et `characters/`, ainsi que les deux fichiers de configuration racine : une
modification de prompt dans `lib/dm/` suffit également à recompiler le moteur.
Une mesure isolée ultérieure du parcours des quatre dossiers (620 fichiers,
6316782 octets) prend 361 ms : elle ne reproduit pas le blocage historique.

**Limites et suite concrète.** Diagnostic uniquement, aucun correctif runtime
ni modification de configuration. Les logs existants ne séparent pas import
dynamique, empreintes, compilation et éventuelles nouvelles tentatives ; ne
pas attribuer les 324 s au seul compilateur ou aux seules lectures disque.
Instrumenter ces étapes au prochain lot, puis vérifier les invalidations
inutiles dues aux sources app et envisager une empreinte limitée aux dépendances
réelles du moteur. Préserver la révision immuable pendant le tour et le contrôle
des modifications pendant compilation. Aucun test automatisé exécuté pour
cette entrée documentaire ; aucun gain de latence revendiqué.

## 23 novembre 2026 — impression de téléportation pendant la confrontation de Faerl

**Provenance.** Signalement utilisateur après la confrontation à Waterdeep.
Lecture ciblée de `.data/logs/server.jsonl`, des sélecteurs de vue dans
`lib/adventures.ts`, de `app/game/page.tsx`, du preset et du handler
`start_encounter`. Vérification SQL dans une transaction `READ ONLY` de la
session `d3252728-673b-4970-af13-6452d91f4567` ; aucune écriture de sauvegarde.

**Constat confirmé.** Le message de 04 h 10 min 46 s Paris demande d'empoigner
Faerl et de le jeter au sol en criant « avoue ! ». À 04 h 11 min 04 s, le
modèle appelle explicitement `start_encounter(faerl_bodyguards)`, puis
`run_monster_turns`. Aucun appel `travel_to_map` pendant ce tour. La sauvegarde
reste `currentMapId=waterdeep`, `currentRoomId=8`, en combat. L'interface masque
la scène aérienne en combat et affiche l'ancienne battlemap schématique de
Waterdeep, visuellement très différente. Le preset impose également sa
`playerCell` : déplacement réel de (22,14) à (18,14), malgré la présence déjà
établie dans la même cour. Les gardes jouent selon l'initiative et infligent
7 PV ; aucune saisie ni mise au sol de Faerl n'a été résolue par un outil.

**Limites et suite concrète.** Diagnostic seulement : aucun correctif runtime,
appel de jeu, test automatisé ou modification de sauvegarde. Si une correction
est engagée, traiter séparément la continuité visuelle du lieu et le placement
automatique d'une rencontre déjà rejointe ; couvrir les positions, occupations,
refus atomiques et embuscades avant de changer le contrat générique. Aucun
changement d'interprétation du message joueur côté serveur.

## 23 novembre 2026 — paroles d'action et outils du MJ

**Demande et provenance.** Signalement d'une intimidation sans jet, puis du
faible usage des outils par le MJ. Lecture ciblée des logs, de l'historique SQL
en transaction READ ONLY et des contrats sociaux, sans audit global. Session
`d3252728-673b-4970-af13-6452d91f4567`, requête
`dm-1795403335913-kun89n` du 23 novembre, 04 h 08–04 h 10 Paris : la menace
exigeant des aveux de Faerl reçoit une réponse narrative, zéro outil et zéro
erreur MCP. L'absence de dé respecte la restriction explicite du module,
`adventure-module.md` salle 8 et `social.ts` profil `influenceable:false` ;
`requireSocialTarget` refuserait effectivement cet acteur. Le manque porte sur
les consultations du tour et la distinction entre dialogue et tentative, pas
sur un dé perdu par le moteur.

**Intégré.** `lib/dm/prompts.ts` distingue les paroles qui tentent une action
des salutations/clarifications : demande concrète et menace suivent les
consultations et la procédure avant leur issue. Sans dé n'exonère pas de
l'outil dédié pour une issue certaine autorisée. Un blocage explicite vérifié
reste applicable sans appel connu comme interdit. Une vérification par le
modèle avant sa réponse finale demande un résultat ou un blocage confirmé pour
chaque acte demandé et interdit de s'arrêter à la découverte/préparation.
Procédure sociale `lib/dm/rule-guides.json`, guide local et documentation
sociale alignés. Aucun parseur de message, appel MCP automatique, règle moteur,
mock ni sauvegarde de partie modifié ; aucun appel LLM payant.

**Validation.** Cohorte `dm-prompt-guidance` et `no-module-leaks` : 12/12,
sortie 0 (`output/tool-use-focused.log`). `npm run typecheck` terminé sans
diagnostic (`output/tool-use-typecheck.log`). La suite `npm test` a été lancée,
puis son runner propre et ses descendants ont été arrêtés après vérification
du PID, parent et date de création, car une autre suite tournait déjà dans le
workspace (`output/tool-use-stopped-test-processes.json`). L'utilisateur a
ensuite demandé explicitement de ne pas faire les tests : aucune relance ni
playtest. Aucun succès de suite complète revendiqué ; log partiel dans
`output/tool-use-tests.log`. Ces consignes ne garantissent pas l'obéissance du
modèle live ; le mock vérifie le pipeline, pas la qualité d'interprétation
réelle. Ne pas forcer un dé contre Faerl ni une séquence sociale interdite.

## 23 novembre 2026 — repères MCP dans le module de Sarah

**Demande et provenance.** Ajout explicitement demandé après lecture ciblée du
module de Sarah, des objectifs et témoins autorisés de son `map.ts`, et des
contrats des outils existants. Aucun nouvel audit global ni scanner de livres.

**Intégré.** `adventures/sarah-of-yellowcrest-manor/adventure-module.md` comporte
une section permanente « Repères MCP du MJ » : communication des objectifs,
conversation et résolution sociale, disposition explicite, sources de récompenses,
issues et escortes. Des rappels locaux relient ces outils aux scènes de Sarah,
des Avoués, d'Arnulf, de Vecken, du cordonnier, de Faerl, de Kara, du vieux et du
jeune Fargo, de la chapelle, des captifs et de la gardienne, ainsi qu'au départ
de Waterdeep et à l'épilogue. Les références d'objectifs respectent les couples
carte/objectif et leurs témoins autorisés ; Sarah communique par écrits ou gestes.
Les accords certains restent sans dé, les refus imposés restent applicables et
les effets exigent toujours leur propre appel réussi. Aucun outil, règle moteur,
mock, annexe documentaire générée ni sauvegarde de partie modifié.

**Validation.** `npm run typecheck` termine en sortie 0
(`output/sarah-mcp-guidance-typecheck.log`). Le contrôle en mémoire du parseur
confirme l'index permanent, les 35 salles, les six cartes, les rappels dans les
15 salles attendues et 17 références carte/objectif existantes ; l'annexe
documentaire reste exclue du contexte de jeu. `npm test` a été interrompu à la
demande explicite de l'utilisateur, avec arrêt de son arbre de processus dédié
(`output/sarah-mcp-guidance-tests.log`) ; aucun succès global revendiqué.
La sortie partielle signale notamment des échecs des fixtures de récompenses,
cycles et issues de campagne déjà mentionnées dans ce registre, sans diagnostic
supplémentaire dans ce lot. `npm run playtest:mock` n'a pas été lancé,
conformément à la demande d'arrêt des tests.

**Limite et suite concrète.** Ces repères guident le choix du MJ, sans garantir
l'obéissance du modèle live ni fabriquer d'appel serveur. La sélection des
sections est vérifiée ; les harnais complets restent à reprendre uniquement
sur nouvelle demande utilisateur. Aucun appel LLM payant.

## 23 novembre 2026 — double révélation de Faerl (diagnostic seulement)

**Provenance.** Question utilisateur sur la seconde révélation malgré son
arrivée déjà annoncée. Lecture ciblée de `.data/logs/server.jsonl`, session
`d3252728-673b-4970-af13-6452d91f4567`, et de
`mcp-server/tools/env-tools.ts`, sans audit global ni écriture de sauvegarde.

**Constat confirmé.** À 03 h 53 min 31 s Paris, `reveal_npc(faerl_city,
neutral)` réussit ; la narration annonce ensuite son arrivée. Au message
suivant, « je l'interroge sur greenfast », le modèle reprend à tort
`waterdeep_arnulf_1` et cible Arnulf : refus `SOCIAL_TARGET_UNREACHABLE` à
03 h 54 min 35 s. Après un déplacement réussi auprès de Faerl, il réémet
`reveal_npc(faerl_city)` à 03 h 54 min 41 s, sans changement de disposition.
La phrase « sa présence doit être explicitement révélée » est son argument
`reason`, pas une exigence ni une erreur du moteur. Ce deuxième appel réussit
et le handler journalise encore « Faerl se révèle » même si déjà visible.

**Limite et suite concrète.** Aucun correctif runtime ni test exécuté dans
ce diagnostic. Reprendre le suivi de cible/conversation par l'agent et le
journal des révélations répétées : ne pas imposer une nouvelle apparition
pour un acteur déjà révélé ; conserver l'application explicite d'une vraie
évolution de disposition. Aucun appel de jeu fabriqué côté serveur.

## 23 novembre 2026 — maître du jeu sur GPT-6.2 Sol

**Provenance.** Demande explicite de passer le MJ sur GPT-6.2 Sol, sans audit.

**Intégré.** `.env.local` sélectionne `DM_MODEL=gpt-6.2-sol`, conserve
`DM_COMPRESS_MODEL=gpt-5.4-mini`, fixe les limites de contexte distinctes à
922000/400000 tokens et l'effort partagé à `low` (Sol refuse `none`). Budgets
de sortie MJ/résumé : 8192/2048, raisonnement inclus. Aucun prompt, outil MCP,
choix d'action, sauvegarde ou défaut du code modifié. `docs/openai.md` décrit
le profil reproductible et sa limite d'entrée conservatrice.

**Vérification.** Configuration chargée via `@next/env`, valeurs réellement
exportées par `llm.ts`, limites de contexte et requête Responses vérifiées par
assertions. Un appel API minimal hors partie répond `OK`, modèle confirmé
`gpt-6.2-sol`, statut `completed`, 12 tokens d'entrée et 5 de sortie.
`npm run typecheck` termine en sortie 0
(`output/model-sol-typecheck.log`). `npm test` a été interrompu, avec son
arbre de processus dédié, à la demande explicite de l'utilisateur de ne pas
exécuter la suite complète ; aucun succès global revendiqué
(`output/model-sol-tests.log`). Next a signalé `Reload env: .env.local`.

**Limite et suite.** Le test API prouve l'accès au modèle, pas sa qualité en
partie. Aucune action de jeu ni écriture de session effectuée. Aucun test
complet supplémentaire demandé ; la qualité narrative se vérifiera en partie.

## 23 novembre 2026 — correction du crash JSONB social, sans modification de sauvegarde

**Demande.** Corriger le diagnostic ci-dessous sans toucher à la sauvegarde
utilisateur. Aucune écriture SQL sur une partie réelle, aucun rejeu de tour,
aucune migration de données ni réinitialisation du moteur de sa session.

**Intégré.** `mcp-server/social-interactions.ts` compare désormais les valeurs
de `playerResult` par `isDeepStrictEqual` pour les demandes avec/sans dé et
l'Intuition. L'ordre des clés JSONB ne change plus la validité du résultat ;
les champs supplémentaires et les valeurs falsifiées restent refusés. Les
chaînes `command`, événements, dés, règles sociales et formats sauvegardés ne
changent pas. `app/api/dm/route.ts` vérifie les lectures/synchronisations MCP
avant de les traiter comme `GameState` : refus, texte brut ou résultat invalide
passent par le chemin existant de remboursement et réponse 503, sans lecture
de repli du moteur initial ni sauvegarde.

**Vérification.** `npm run typecheck` et la cohorte ciblée 24/24 terminent en
sortie 0 (`output/social-jsonb-fix-{typecheck,focused}.log`). Deux régressions
dans `tests/social-interactions.test.cjs` passent un reçu résolu avec/sans dé
par le store SQL pg-mem puis un nouveau processus moteur, avec l'ordre JSONB
explicitement reproduit (pg-mem ne réordonne pas ces propriétés). Elles
vérifient le rejeu sans nouveau dé, la préservation des reçus, le refus d'une
valeur falsifiée et l'absence d'écriture du snapshot stocké. Les cinq cas
`tests/dm-state-sync-errors.test.cjs` vérifient 503, absence d'appel LLM/de
repli moteur et conservation de l'état, historique, résumé et date de mise à
jour ; le cas d'une lecture initiale refusée ne crée aucune session. Le verrou
`agent-mcp-call-sites` passe aussi.

La vraie sauvegarde est également acceptée par le validateur recompilé sur
une copie en mémoire, avec zéro erreur sans même réordonner ses clés. Deux
SELECT encadrant cette vérification donnent le même snapshot et la même
empreinte SHA-256 ; aucune requête d'écriture n'est exécutée. `npm test` a
été lancé puis interrompu par l'agent après 768 succès et 25 échecs affichés,
sans attendre la fin des 441 fichiers : la suite globale était déjà en
échec (`output/social-jsonb-fix-tests.log`). Aucun succès de suite complète
n'est revendiqué. Seuls son runner et ses descendants ont été arrêtés,
après vérification du PID et de la date de création ; inventaire dans
`output/social-jsonb-fix-stopped-test-processes.json`. Les logs live montrent aussi
des tours terminés normalement à 03 h 43, 03 h 46, 03 h 47 et 03 h 49 Paris,
dont `resolve_social_request` ; aucune requête de jeu n'a été envoyée par
l'agent pour produire cette preuve. Aucun prompt, mock ni contenu d'aventure
modifié dans ce correctif ; aucun appel LLM payant.

**Limite de validation globale découverte.** La suite complète signale des
échecs de fixtures de récompenses/cycles/issues de campagne. Reprise ciblée
de `tests/adventure-rewards.test.cjs`, cas `public real B2 search prepares`,
en sortie 1 (`output/social-jsonb-fix-unrelated-recheck.log`) :
`tests/helpers/adventure-rewards-fixture.cjs:7` tente `sail_to_waterdeep`
alors que l'objectif `sarah_story` manque (`MAP_QUEST_INCOMPLETE`). Ce trajet
échoue avant la validation du résultat social modifiée ici. À traiter dans
un lot distinct en mettant les fixtures en accord avec les prérequis réels,
sans modifier les règles pour contourner l'objectif. Le reste des échecs
reste à qualifier séparément ; aucun succès global revendiqué. Le correctif
ciblé et ses tests n'ont pas été élargis à ces autres scénarios.

## 23 novembre 2026 — crash au rechargement du reçu social de Vecken (diagnostic confirmé)

**Provenance.** Demande utilisateur de lire les logs après plantage. Lecture
ciblée de `.data/logs/server.jsonl`, du journal Next et de la session SQL
`d3252728-673b-4970-af13-6452d91f4567`, sans audit global. À 03 h 33 min 04 s
Paris, `replace_game_state` refuse `vecken_request_001` avec
`SOCIAL_INTERACTION_STATE_MISMATCH`, puis la requête
`dm-1795401055098-oz59xr` échoue avec
`Cannot read properties of undefined (reading 'some')`.

**Cause reproduite en lecture seule.** `socialCommand` dans
`lib/social-interaction-state.ts` utilise `JSON.stringify`, sensible à l'ordre
des clés. PostgreSQL JSONB restitue `result.playerResult` dans l'ordre
`granted, request`, alors que `validateSocialInteractionState` dans
`mcp-server/social-interactions.ts` compare à `request, granted`. Sur une copie
en mémoire de la vraie sauvegarde, après le parsing du schéma social utilisé
par le moteur actif `.data/dev-mcp/bcf99a85-9041-47cd-9172-9deeb4bdf7e7`,
le validateur renvoie exactement l'erreur du log ; remettre seulement ces
deux clés dans l'autre ordre donne zéro erreur, sans changer aucune valeur.

**Erreur secondaire.** `syncGameStateToMcp` dans `app/api/dm/route.ts`
convertit le résultat de `replace_game_state` en `GameState` sans refuser le
résultat d'erreur MCP. `pendingCombatContinuation` reçoit alors cet objet
d'erreur ; `complexTrapTurnDue` lit `initiativeOrder.some` sur un champ absent.
Ce deuxième plantage est également reproduit en mémoire. La dernière
sauvegarde SQL est présente à 03 h 31 min 22 s, avec 47 entrées d'historique.

**Suite concrète.** Rendre la comparaison du résultat social indépendante de
l'ordre des clés et refuser explicitement un résultat MCP d'erreur à la
synchronisation avant toute consommation comme état. Ajouter une régression
du reçu après un vrai aller-retour JSONB et du refus de synchronisation.
Diagnostic seulement : aucun code runtime ni état de partie modifié, aucun
appel LLM, aucune suite de tests ni playtest relancé.

## 23 novembre 2026 — enjeu social réel et application explicite de la disposition (validation partielle, tests arrêtés sur demande)

**Demande.** Corriger le jet sans enjeu et l'oubli de disposition du constat
ci-dessous, sans audit global ni appel LLM payant.

**Intégré.** Le contrat `lib/dm/prompts.ts`, le schéma de résolution partagé,
les descriptions MCP et la continuation de `record_social_conversation`
demandent d'évaluer l'incertitude réelle : issue certaine du module ou DD
déjà atteint au minimum sans autre conséquence variable → `roleplay` avec
décision MJ explicite, sans dé/skill. Une formulation de persuasion ne rend
pas un test obligatoire ; aucun risque, obstacle ou DD artificiel n'est créé.
Un DD0 avec un modificateur suffisamment négatif reste un vrai test possible.

La nouvelle procédure `social-interactions-stakes-and-disposition` et le
domaine `social_interactions` chargent aussi `reveal_npc`. Les accords réussis,
avec ou sans dé, renvoient `outcomeApplication` : cible exacte, éventuelle
disposition PNJ à la résolution, indication que cet outil ne l'a pas appliquée
et consigne d'utiliser explicitement l'outil dédié si la confiance/coopération
est réellement établie. Aucun accord limité ni attitude friendly ne devient
automatiquement helpful, recrutement ou escorte. Le contexte social distingue
la dernière demande résolue de la disposition actuelle, pour appliquer une
conséquence oubliée sans relancer le dé. Guides de domaine, documentation
sociale et `lib/dm/CLAUDE.md` alignés. Aucune interprétation serveur du message,
aucun appel MCP fabriqué, aucune partie existante modifiée.

**Validation en cours.** Régressions ajoutées dans
`tests/social-agreement-application.test.cjs` : vrai pipeline API/MCP/SQL sur
Vecken visible, accord certain sans dé suivi de `reveal_npc` choisi par le
modèle scripté ; demande incertaine réussie/échouée ; DD0 à modificateur
négatif ; conservation des dés et absence de mutation automatique.
`npm run build:mcp` et `npm run typecheck` terminent en sortie 0
(`output/social-agreement-{build,typecheck}.log`). La première cohorte ciblée
donne 28/31 : deux attentes anciennes de tool_choice ont été alignées sur la
continuation moteur existante, et la nouvelle assertion de prompt a été
corrigée pour lire les blocs système réels. La reprise des deux tests API
existants et des quatre nouveaux cas passe 6/6, sortie 0
(`output/social-agreement-api-recheck.log`), incluant l'objectif réel
`vecken_warned` faux avant l'outil de disposition et vrai après. Les trois
autres suites ciblées étaient vertes ; ces captures se recouvrent et ne
s'additionnent pas. `npm test` a été interrompu sur demande explicite de
l'utilisateur après son démarrage ; aucun succès de suite complète n'est
revendiqué. Le playtest mock restant n'a pas été lancé, conformément à cette
demande d'arrêt des tests. Sources figées dans
`output/social-agreement-validation-source.json`.
Ces scripts vérifient le contrat et l'application, pas l'obéissance
future du modèle live ; les consignes ne convertissent jamais un appel check
en décision roleplay côté serveur.

## 23 novembre 2026 — jet social de Vecken : outil dédié appelé, enjeu nul et disposition non appliquée

**Demande et provenance.** Diagnostic du d20 sans effet apparent sur la
narration. Lecture ciblée de `.data/logs/server.jsonl`, session
`d3252728-673b-4970-af13-6452d91f4567`, requête
`dm-1795399728582-n4hyrc`, de 03 h 08 à 03 h 10 Paris, et des seules sources
sociales/personnage/module concernées. Aucun audit global ni scanner.

**Constat live.** Le modèle appelle bien `resolve_social_request` à
03 h 10 min 06 s, avec `resolution: check`, `skill: persuasion` et
`entityId: player` (séquence 27760). Aucun `roll_dice` générique sur ce tour.
Le résultat moteur (27762) donne 1d20 = 7, modificateur 0, DD 0,
`success: true` et `requestGranted: true`. Le modificateur est cohérent avec
le guerrier de niveau 7 : CHA 10 et aucune maîtrise de Persuasion. Avant le
jet, `record_social_conversation` (27750) fait passer l'attitude
d'indifférente à amicale ; la demande est ensuite qualifiée sans risque.
La table existante `lib/social-interaction-state.ts` fixe alors DD 0 : avec
ce modificateur, tous les résultats du d20 accordent cette aide sans risque.
Le jet ne pouvait donc pas faire échouer cette demande ainsi paramétrée.

**Limites observées.** Le module, salle 6, permet déjà de révéler Vecken
helpful après une preuve de compassion sans jet obligatoire. La narration
finale annonce une disposition à aider et dit « je marcherai avec toi dans
cette affaire », alors que le résultat social précise ne muter aucune
disposition de quête ni déplacement. Aucun `reveal_npc` ne figure dans ce
tour ; l'objectif `vecken_warned` repose sur la vraie disposition helpful.
Le module précise aussi que Vecken refuse de rejoindre l'expédition à
Waterdeep. La coopération sociale obtenue ne prouve donc ni cet objectif
ni un recrutement. Le résumé imbriqué du check mentionne encore une attente
de choix de dé malgré la résolution finale accordée ; ce libellé seul ne
prouve pas une réaction réellement suspendue.

**Suite concrète.** Pour une aide certaine, choisir la résolution sans jet
prévue par le module ; pour une vraie demande incertaine, qualifier sa portée
et son risque réels avant le dé. Après accord, le modèle doit appeler
explicitement l'outil de disposition autorisé si cet effet est voulu et
ne narrer que la portée effectivement acquise. Aucun argument/appel de jeu
ne doit être fabriqué côté serveur. Diagnostic et registre seulement :
aucun code runtime, état de partie, test, playtest ou appel LLM exécuté.

## 23 novembre 2026 — règles liées aux outils et procédures MCP

**Demande.** Associer les règles consultées aux outils MCP pertinents et à leur
procédure d'utilisation, sans modifier les textes des livres. Travail depuis
les domaines et références existants, sans audit global, reconstruction de
backlog ni relance de scanner des livres.

**Intégré.** `mcp-server/rules-tool-links.json` porte 110 associations autorées
(106 domaines moteur)
par titre, portée des descendants, page SRD ou lignes précises. Les lignes sont
liées aux SHA actuels dans `rules-tool-guidance.ts` et suivent le `readRange`
calculé par `rules-library.ts` pour le bloc effectivement lu. Les textes,
manifestes, empreintes, PDF et extraits des livres restent intacts.
`tools/rules-tools.ts` ajoute `engineGuidance` aux résultats : liens compacts en
recherche/catalogue de tables, procédures canoniques, couverture et limites en
lecture de passage/table. Les procédures sont réutilisées depuis
`lib/dm/rule-guides.json` ; celles manquant à plusieurs domaines déjà pris en
charge ont été ajoutées à ce même catalogue. Le social utilise les procédures
sur les participants du groupe et la reprise après erreur, sans injecter les
anciennes consignes de jet social générique.

Les outils viennent du registre MCP public réellement actif, filtré par
phase/personnage ; ceux indisponibles sont distingués dans `unavailableTools`.
Après une lecture réussie choisie par le modèle, `app/api/dm/route.ts` charge
leurs schémas pour l'appel IA suivant. Une recherche ne les charge pas. Aucun
appel de jeu, argument, choix de cible ou effet n'est fabriqué. Prompt et guides
MCP/DM/bibliothèque alignés. Les options restent explicitement adoptées, jamais
activées par lecture ; les fiches MM renvoient à `engineSupport` sans transformer
une créature documentaire en profil jouable.

**Limites et prochain travail.** Les annotations ne couvrent pas tous les
paragraphes des livres ; une association absente renvoie une liste vide et
oriente vers le support/découverte. Les liens SRD portent sur des pages pouvant
contenir plusieurs règles. Une création maison n'hérite pas de procédure
officielle. Aucun réglage de partie, modèle payant ou source externe utilisé.
Prochain constat live : vérifier que la lecture sociale transmet la procédure
et que le modèle enchaîne les appels corrects ; aucun résultat live revendiqué.

**Validation effective et arrêt demandé.** `npm run typecheck` terminé en exit 0.
Les cinq nouveaux tests documentaires/MCP/route passent. `npm test` s'est terminé
en exit 1 sans bilan global complet dans le journal ; aucun succès de suite
complète revendiqué. `npm run playtest:mock` a ensuite été lancé, puis interrompu
à la demande explicite de l'utilisateur « arrete les tests », avec arrêt de son
processus et de ses descendants. Aucun résultat de playtest revendiqué et aucun
autre test ou contrôle à lancer sans nouvelle demande utilisateur. Les nouvelles
régressions couvrent les associations, le texte inchangé, les procédures
sociales, la pagination des équipements, les filtres phase/personnage, l'absence
de mutation/dé et le chargement de schémas dans la vraie route avec IA simulée.
Le diagnostic isolé de `adventure-rewards.test.cjs` échoue avant toute consultation
sur `MAP_QUEST_INCOMPLETE` : sa préparation ne valide pas le souvenir
`sarah_story` à Candlekeep (`tests/helpers/adventure-rewards-fixture.cjs:7`).
La suite signale aussi à l'import direct de `game-state.js` un profil de
personnage niveau 7 indéfini dans `character-registry.js` (`ammunition.test.cjs`).
Ces constats de validation ne sont pas des corrections de ce lot ; journaux dans
`output/rules-tool-guidance-20261123/`. Aucun succès de suite globale revendiqué.

## 23 novembre 2026 — vérification ciblée des règles effectivement consultées

**Demande et provenance.** Vérifier si le MJ consulte les bonnes règles.
Lecture des seuls échanges documentaires récents de `.data/logs/server.jsonl`
(session `d3252728-673b-4970-af13-6452d91f4567`, de 02 h 46 à 02 h 59 Paris),
de `mcp-server/{rules-library.ts,tools/rules-tools.ts,toolkit-support.ts}`, du
manifeste et des passages sociaux concernés. Aucun audit global ni scanner.

**Constat.** Les lectures réussies visent bien le DMG 2014, chapitre Social
Interaction : introduction, Resolving Interactions, Charisma Check, Repeat,
Starting Attitude et Conversation Reaction. À 02 h 59, le MJ lit intégralement
`dmg-2014:733` (lignes 7803–7806), pertinent pour convaincre Vecken d'aider,
après `get_rules_support({domain: 'social_interactions'})`. La cible ajoutée
ensuite aux participants reste une mauvaise application des arguments, pas
une consultation du mauvais livre. Le catalogue est limité aux sources du
système 2014 et au SRD 5.1, avec contrôle des empreintes ; les ajouts maison
du PHB/Xanathar sont déclarés et distingués par `source.origin`. Cela ne
certifie pas la fidélité exhaustive des transcriptions ni chaque choix futur.

**Limite observée et suite concrète.** Trois recherches sociales longues ne
renvoient aucun résultat ; le modèle les raccourcit ensuite avec succès. Le
code exige tous les termes dans une même section ou ses titres ancêtres :
une recherche longue peut manquer une procédure répartie en sous-sections.
Une lecture de section ne lit pas automatiquement ses sous-sections. Vérifier
sur une prochaine reprise sociale que le MJ utilise les participants du groupe
et résout la demande après enregistrement réussi ; si la récupération
documentaire doit évoluer, traiter uniquement ce cas de recherche ciblé.
Les troncatures à 800 caractères visibles dans les logs sont celles du logger :
le client renvoie le résultat analysé et la route transmet le JSON documentaire
au modèle sans ce résumé. Aucun code runtime changé, test, playtest, appel LLM
ou mutation de partie exécuté pour cette vérification.

## 23 novembre 2026 — participants du groupe et continuation sociale après erreur

**Demande.** Corriger l'appel de participants et la reprise jusqu'au jet de
persuasion, sans lancer de tests, à partir du constat ciblé ci-dessous.
Aucun audit global ni scanner relancé.

**Intégré.** `lib/social-interaction-state.ts` et la description de
`record_social_conversation` dans `mcp-server/tools/social-interaction-tools.ts`
explicitent que participants recense les contributeurs du groupe : pour un
joueur seul, seul player y figure ; cible et répliques de cible restent dans
targetId/source. Les démarches descriptives sont recevables, sans citation
inventée. sufficientForInsight ne conditionne pas Persuasion. Les champs
distinguent l'événement refusé sans reçu, corrigeable avec son ID encore libre,
du rejeu exact obligatoire d'un événement accepté ou suspendu.

`mcp-server/social-interactions.ts` conserve les gardes et l'ordre de priorité
des refus de participants. Cible/doublons renvoient désormais leurs références,
la liste des identités opposées fournies et une `agentContinuation` de
correction, avant tout reçu/coût/dé. Le modèle choisit lui-même les participants
corrigés. Un nouvel échange réussi avec requestReached=true renvoie une
continuation de résolution de la demande. Cette indication est transitoire,
absente du reçu sauvegardé : rejouer un vieil échange ne réclame pas un autre dé.

`app/api/dm/route.ts` conserve ces continuations moteur pendant le tour et
maintient un choix d'outils ouvert, sans sélectionner d'outil particulier ni
fabriquer/réécrire d'arguments. Une prose prématurée du fournisseur reçoit un
rappel de l'état incomplet. Le budget d'itérations sans progression ne change
pas ; résolution, refus métier réel ou erreur de transport de la même procédure
lèvent l'attente. Les reprises réutilisent les consultations encore pertinentes
au lieu d'imposer les mêmes lectures. Les consignes expliquent de poursuivre
vers resolution=check et skill=persuasion pour une tentative déclarée justifiant
ce jet, sans nouveau choix de joueur inventé. Prompt, contexte social,
procédure de domaine et guides (`docs/social-interactions.md`, `lib/dm/CLAUDE.md`)
alignés. Aucun état de partie existant édité, aucune règle de risque, d'attitude,
de coût ou de répétition changée ; aucune interprétation serveur du message.

**Validation et limites.** `npm run build:mcp` et `npm run typecheck:next`
terminés en exit 0. Relecture ciblée et `git diff --check` des sources suivies
modifiées sans défaut signalé. Aucun test, playtest ou appel LLM lancé.
Prochain constat live : demande
de persuasion, participants du groupe seuls, correction éventuelle du refus
dans le même tour, puis appel explicite du modèle à resolve_social_request et
résultat du vrai jet (ou réaction suspendue/blocage réel). Aucun succès live
ne peut être revendiqué sans ce nouveau tour.

## 23 novembre 2026 — constat live après correction : cible ajoutée aux participants

**Provenance.** Dernier échange de `.data/logs/server.jsonl`, session
`d3252728-673b-4970-af13-6452d91f4567`, requête
`dm-1795399085409-ucggbq`, de 02 h 58 à 02 h 59 (Paris). Message joueur exact :
« je tente de le convaincre de m'aider ». Les descriptions renvoyées par la
découverte sont les nouvelles ; l'inspection de `vecken_001` réussit. Le défaut
de récupération des IDs n'est donc plus observé sur ce tour.

**Blocage restant.** `record_social_conversation` utilise correctement
`interactionId: vecken_001` et un événement distinct `vecken_001_talk1`, mais
inclut `vecken` avec `player` dans `participants`. Le moteur refuse à juste
titre avant toute mutation (`SOCIAL_PARTICIPANT_IS_TARGET`) : la cible opposée
n'est pas un contributeur du groupe au jet. Le modèle termine ensuite par une
explication technique et demande une reformulation, malgré les consignes de
reprise. Aucun `resolve_social_request` n'est appelé et aucun jet de persuasion
n'a lieu. Ce n'est ni un jet raté ni un refus mécanique d'aider du PNJ.

**Suite ciblée.** Le modèle doit corriger le même échange refusé en conservant
sa conversation et les propos réels, avec les seuls contributeurs du groupe,
puis appeler explicitement `resolve_social_request` en mode `check` avec
`skill: persuasion` si la demande atteinte justifie ce jet. Aucun outil de jeu
ne doit être fabriqué côté serveur ni argument corrigé automatiquement. Lecture
de logs uniquement et consignation de ce constat ; aucun code, état de partie,
test, playtest ou appel LLM exécuté pour ce diagnostic.

## 23 novembre 2026 — reprise des conversations sociales et références d'événements

**Demande.** Corriger le blocage constaté ci-dessous, sans lancer de tests.
Aucun audit global ni scanner relancé.

**Intégré.** `lib/dm/social-interaction-context.ts` projette depuis l'état moteur
les conversations de la carte courante, ouvertes et fermées : interaction et
identité exactes, attitude, événements utilisés/en attente, dernier échange
avec participants et indicateurs, dernier test et clôture. `lib/dm/prompts.ts`
inclut ces repères à chaque tour ; `app/api/dm/route.ts` les actualise dans les
résultats sociaux et de changement de scène, sans modifier le prompt d'ouverture
figé. Les parties déjà commencées bénéficient des mêmes repères persistés.
`lib/tool-catalog.ts` expose directement `inspect_social_interaction`, dont
l'appel sans ID retrouve déjà les conversations de la carte.

`lib/dm/rule-guides.json`, `mcp-server/tools/social-interaction-tools.ts` et les
descriptions de champs de `lib/social-interaction-state.ts` distinguent
l'`interactionId` stable, l'`eventId` distinct de chaque étape réelle et le
`conversationEventId` d'un enregistrement réussi. Ils précisent les participants
du groupe (cible opposée exclue), le demandeur réel et la reprise après erreur
sans faire répéter le joueur ni transformer le refus technique en refus du PNJ.
Les erreurs de référence/conflit de `mcp-server/social-interactions.ts` guident
l'inspection et la distinction entre rejeu exact et nouvelle étape. Guides
`docs/social-interactions.md` et `lib/dm/CLAUDE.md` alignés. Aucun schéma d'état,
coût, dé, limite de répétition ou choix joueur changé ; aucun appel fabriqué.

**Validation et limites.** `npm run build:mcp` et `npm run typecheck:next`
terminés en exit 0. Relecture ciblée des sources et `git diff --check` des
fichiers suivis modifiés sans défaut signalé. Aucun test, playtest ou appel LLM
lancé, conformément à la demande. Prochain constat live : reprendre la conversation ouverte existante,
enregistrer les propos avec un événement distinct puis résoudre la demande
atteinte en citant ce reçu, sans rouvrir l'interaction ni répéter les propos.
Le respect réel de la procédure par le modèle reste à constater en partie.

## 23 novembre 2026 — constat live : consultations actives, procédure sociale bloquée

**Demande et provenance.** Vérification ciblée demandée par l'utilisateur dans
`.data/logs/server.jsonl`, session `d3252728-673b-4970-af13-6452d91f4567`.
Les 17 tours de 02 h 05 à 02 h 34 (Paris) n'utilisent toujours aucun des trois
outils documentaires de règles/découverte. Sur les trois tours suivants,
de 02 h 45 à 02 h 48, les appels moteur confirment `discover_tools` × 3,
`get_rules_support` × 3 et `consult_rules` × 12 (recherches et lectures).
La consultation live demandée fonctionne désormais, sans garantir la bonne
application de la procédure. Aucun audit global ni scanner relancé.

**Blocage réellement observé.** À 02 h 17, l'ouverture avec Arnulf réussit sous
`interactionId: waterdeep_arnulf_1`, puis `resolve_social_request` réutilise
l'`eventId` de l'ouverture : `SOCIAL_EVENT_CONFLICT`. L'autre résolution,
à 02 h 19, omet `conversationEventId` et `entityId` et échoue au schéma.
Les conversations suivantes utilisent des `interactionId` inexistants ou
tentent de rouvrir la même identité. À 02 h 47, l'ouverture avec Vecken réussit
sous `interactionId: vecken_001`, mais `record_social_conversation` reprend
l'`eventId: waterdeep-vecken-1` de l'ouverture et est refusé pour conflit.
À 02 h 48, une nouvelle ouverture remplace l'interaction existante par
`waterdeep_vecken_yellowcrest` : `SOCIAL_INTERACTION_ALREADY_ACTIVE`, dont le
message fournit pourtant `vecken_001`. Sur les 20 tours : cinq appels de
conversation tous refusés, deux résolutions toutes refusées ; aucune résolution
sociale réussie. Les deux inspections essaient aussi des IDs inexistants.

**Code vérifié et prochain travail concret.** `mcp-server/social-interactions.ts`
conserve les reçus immuables par `eventId` et les conversations par
`interactionId`. `inspect_social_interaction({})` permet déjà de retrouver les
interactions de la carte sans inventer un ID. Le contexte compact de
`lib/dm/prompts.ts` ne transmet pas ces interactions ; la route ne conserve
dans l'historique inter-tours que le message et la narration, pas les blocs
d'appels/résultats. Cette perte de repères contribue vraisemblablement aux IDs
inventés ; les erreurs d'arguments sont directement établies par les logs.
Prochain lot ciblé : rendre visibles les repères sociaux existants et préciser
dans la procédure/descriptions qu'un `interactionId` reste stable, qu'un nouvel
événement réel possède son propre `eventId`, et qu'un rejeu conserve exactement
son ancien événement. Guider l'inspection sans ID quand celui-ci est inconnu,
puis la reprise autorisée ; ne pas fabriquer d'appel ni autoriser de relance.
Aucun code runtime, état de partie ou règle modifié pendant ce diagnostic ;
aucun test, playtest ou appel LLM lancé.

## 23 novembre 2026 — consultations fréquentes des règles et découverte d'outils

**Demande et provenance.** L'utilisateur demande au MJ de consulter les règles
et découvrir les outils le plus souvent possible. Lecture ciblée des logs
`.data/logs/server.jsonl` : sur les 17 tours de la session
`d3252728-673b-4970-af13-6452d91f4567`, de 02 h 05 à 02 h 34 (Paris), aucun
appel `discover_tools`, `consult_rules` ou `get_rules_support`, malgré leur
présence dans les schémas exposés. Une lecture `consult_campaign` de 1 200
caractères du début du module a réussi. Plusieurs refus sociaux n'ont pas
déclenché de lecture de procédure. Aucun audit global ni scanner relancé.

**Intégré.** `lib/dm/prompts.ts` demande désormais, à chaque nouveau tour
mécanique même courant, une recherche ciblée `discover_tools`, la procédure
`get_rules_support` et la lecture source `consult_rules` après recherche.
Un rappel générique est ajouté au contexte de chaque tour. Les résultats
pertinents du même tour sont réutilisés, avec nouvelle consultation si la
situation change ; aucune boucle documentaire sans rapport avec l'action.
Le dialogue sans mécanique reste libre, avec vérification ciblée du scénario
via `consult_campaign` quand nécessaire. Après un refus, la consigne
`actionRecovery` de `app/api/dm/route.ts` demande consultation puis inspection
de l'état réel, sans réessai identique ni nouvel identifiant de contournement.
Le socle `adventures/_shared/dm-rules.md` et `lib/dm/CLAUDE.md` sont alignés.
Le modèle choisit tous les appels et leurs arguments ; aucun appel MCP
automatique, aucune interprétation serveur du texte joueur, aucun effet
mécanique ou option 2014 modifié.

**Validation effective et limites.** Avant l'instruction utilisateur « non pas
de tests », `npm run typecheck` (MCP + Next) et les 12 contrôles existants de
`dm-prompt-guidance` et `no-module-leaks` ont terminé en exit 0. Le prompt
statique tide-crypt compte 31 031 caractères, sous le plafond existant de
35 000. La suite `npm test` déjà lancée a été interrompue à la demande de
l'utilisateur, avec arrêt de son processus et de ses enfants ; son journal
contient des échecs, non analysés et sans attribution à cette modification.
Aucune réussite de suite complète revendiquée. Aucun playtest mock ou appel
LLM payant lancé. Journaux dans `output/mj-consultation-20261123/`.
La fréquence réelle de consultation reste à constater en partie live :
séquence documentaire avant une action courante, puis consultation/inspection
après un refus, sans nouvelle mutation implicite. Aucun autre test à lancer
sans nouvelle demande utilisateur.

## 23 novembre 2026 — paroles des PNJ à la première personne

**Demande et intégration.** L’utilisateur souhaite davantage de paroles de
PNJ à la première personne. Le contrat permanent de `lib/dm/prompts.ts`
privilégie désormais les répliques directes entre guillemets français, avec
locuteur identifiable, gestes et ton brefs, plutôt qu’un résumé systématique
de leurs propos. Le vocabulaire et le rythme suivent leur personnalité et
leurs émotions, sans récitation de fiche ou d’indices. Le MJ continue de
s’adresser au personnage joueur avec « tu ». Les connaissances, secrets,
langues et capacités de communication restent respectés ; le mutisme de Sarah
n’est pas levé par cette consigne générale.

La demande de correction de point de vue dans `app/api/dm/route.ts` préserve
explicitement le « je » des PNJ au discours direct. Le contrôle existant
exclut déjà les répliques ouvrant par un guillemet ; aucune modification du
parseur, du message joueur, des arguments MCP ou des effets moteur. Le guide
`lib/dm/CLAUDE.md` décrit cette distinction.

**Validation et limites.** Relecture ciblée et `git diff --check` des fichiers
modifiés ; aucun test, playtest ou appel LLM lancé, conformément à la demande
utilisateur. La fréquence et le naturel des dialogues restent à constater
dans une conversation réelle avec un PNJ capable de parler ; aucun résultat
live revendiqué. Aucun audit global ni scanner relancé.

## 23 novembre 2026 — placement des contrôles dans l’illustration

**Précision utilisateur.** « Faire des recherches » doit se trouver sur les
étagères de gauche ; le départ vers Waterdeep doit être à droite mais dans
l’image. `definition.ts` déplace les recherches sur les rayonnages de gauche
et remplace l’action extérieure de départ par un hotspot conditionné par
`sarah_story`. `AdventureScene`, son CSS et les types partagés prennent en
charge `hotspots[].appearance: 'button'` pour ce bouton ancré dans l’image,
avec texte repliable. L’image conserve toute sa largeur, sans panneau latéral
pour ce départ. Les conditions de connaissance, le message de départ et la
prise automatique du journal sont inchangés. Module et guide multi-maps mis
à jour. Aucun test, playtest, appel LLM ou vérification live exécuté ; simple
relecture et contrôle des espaces des sources suivies modifiées.

## 23 novembre 2026 — histoire connue, bibliothèque cliquable et journal emporté

**Décision utilisateur, remplaçant les préalables antérieurs.** Connaître
l’histoire de Sarah suffit pour partir vers Waterdeep. Les recherches sont
facultatives et accessibles sur la bibliothèque de l’image. Le bouton de
départ apparaît à droite après cette découverte, et le joueur emporte
automatiquement le livre en partant. Aucun audit global ni scanner relancé.

**Contenu et interface intégrés.** `map.ts` remplace les trois objectifs de
Candlekeep par le seul souvenir `sarah_story`, vérifié via `clueRevealed` sans
proposition de quête obligatoire. `reveal_clue` enregistre ce récit sur choix
explicite du MJ avec Sarah ou l’Avoué présent ; ni apparition seule ni mention
du nom ne suffisent. Les consignes de lecture et de reprise demandent de
mémoriser le récit effectivement transmis, sans rejouer une lecture déjà faite.
`definition.ts` place « Faire des recherches » sur les rayonnages de droite,
aux coordonnées relues sur l’image existante, et le départ dans toutes les
salles de Candlekeep dès le souvenir connu. `AdventureScene.tsx`, son CSS et
le type `AdventureScene` affichent les actions `placement: 'right'` à droite
de l’image, y compris sur écran étroit ; leur disponibilité vient de l’état
moteur. L’accès intermédiaire au quai n’est plus proposé comme préalable.
Le catalogue expose `reveal_clue` avec les outils courants. Module, hooks et
`docs/multi-map-adventures.md` maintenus.

**Livre emporté au départ.** L’exemplaire transportable déjà prévu reste
`sarah_diary_copy` (copie autorisée ; original et fantôme restent à Candlekeep).
La transition `sail_to_waterdeep` le déclare dans le nouveau champ autoré
`MapTransition.departureItemIds`. `prepareMapDepartureItems` vérifie les
instances existantes sur la carte de départ, les contenus, l’unicité et le
portage actif avant l’écoulement du temps. `applyMapTravel` récupère ces objets
dans le même appel moteur et `travel_to_map` renvoie `itemsTaken`. Un exemplaire
déjà porté n’est pas recréé ; aucun objet n’est généré et les autres voyages
n’emportent rien implicitement. Aucun appel de jeu fabriqué côté serveur ni
choix d’objet déduit du texte joueur : cette prise est un effet autoré du
voyage explicitement demandé par l’utilisateur. Aucun retour au livre,
ramassage séparé ou acceptation de mission n’est nécessaire.

**Validation effective et limites.** `npm run typecheck` (MCP + Next), exit 0,
journal `output/sarah-diary-20261123/departure-typecheck.log`. Relecture et
`git diff --check` des sources suivies modifiées sans défaut signalé. Aucun
test, playtest, appel LLM ou partie lancé, conformément à la demande.
Pas de vérification visuelle du rendu live ni de réussite de partie revendiquée.
Les anciennes fixtures qui imposent mission/copie ou les anciens objectifs
devront être adaptées si une validation par tests est ensuite demandée.
Prochain geste concret : dans une partie locale, constater la mémorisation
du récit, le bouton à droite, puis l’arrivée à Waterdeep avec le journal en
inventaire. Pour une partie ancienne sans `sarah_story`, le MJ doit consigner
le récit déjà transmis avec le témoin présent ; aucun savoir n’est inventé
depuis la seule visibilité de Sarah.

## 23 novembre 2026 — bouton de départ vers Waterdeep

**Demande et constat ciblé.** Le clic « Partir pour Waterdeep » doit faire
passer à la carte suivante. Le bouton transmettait déjà une intention au MJ,
mais le contexte dynamique imposait une confirmation avant chaque départ,
même déjà confirmé, et `travel_to_map` exigeait une découverte de schéma.
Inspection limitée au bouton, au catalogue, aux consignes et au circuit d’état.

**Intégré.** Le message du bouton dans
`adventures/sarah-of-yellowcrest-manor/definition.ts` confirme explicitement
le départ définitif sans retour. Son exemple MJ et la salle 3 du module
demandent `travel_to_map(sail_to_waterdeep)` dans le même tour, puis la narration
d’arrivée sur Waterdeep après réussite moteur. `lib/dm/prompts.ts` reconnaît
une confirmation explicite déjà donnée, sans boucle de reconfirmation.
`lib/tool-catalog.ts` expose le schéma de voyage parmi les outils courants.
`docs/multi-map-adventures.md` maintenu. Le circuit existant applique
`newGameState` et sélectionne la scène depuis la carte moteur. Aucun appel de
jeu fabriqué côté serveur, aucune bascule visuelle sans mutation moteur et
aucun préalable de quête supprimé. Un refus doit expliquer ce qui manque.

**Validation et limites.** Aucun test, playtest, appel LLM ou partie lancé,
conformément à la demande utilisateur. Relecture du circuit et
`git diff --check` des sources suivies modifiées : aucun défaut signalé.
Comportement réel à constater au prochain clic dans une partie où les
préalables sont remplis ; aucune réussite live revendiquée.

## 23 novembre 2026 — rechargement automatique en développement

**Demande et constat ciblé.** L'utilisateur demande de reprendre le nouveau
code sans redémarrer manuellement le serveur. Les scripts dev compilaient le
MCP une seule fois et lançaient un processus stdio autonome inutilisé par les
sessions. Les clients MCP et les contextes narratifs étaient conservés en cache.
Aucun nouvel audit ni scanner de livres.

**Intégré.** `lib/dev-mcp.ts` empreinte les sources TS/JSON de mcp-server, lib,
adventures et characters, ainsi que les configurations et le lockfile. Il
partage la compilation entre requêtes simultanées et publie un dossier
immuable dans `.data/dev-mcp/` seulement après compilation réussie et seconde
vérification des empreintes. `lib/mcp-client.ts` renouvelle uniquement le client
de la session concernée à la frontière du tour, sous `lib/session-lock.ts` ;
`app/api/dm/route.ts` restaure ensuite l'état par sa synchronisation existante,
invalide le contexte et relit le catalogue en développement. Clients et verrous
survivent au HMR via globalThis. Les scripts dev lancent uniquement Next après
la compilation initiale ; README et guides locaux mis à jour.

**Validation et limites.** Tests et playtest non lancés sur instruction
explicite de l'utilisateur (« pas besoin des tests »). `npm run typecheck`
(moteur et Next) et `node --check scripts/dev-mock.cjs` réussis. Aucun appel
LLM ni tour de jeu lancé pour vérifier ce changement.
Production inchangée ; les dépendances et variables de démarrage peuvent
nécessiter un redémarrage. Les révisions immuables restent dans le dossier local
ignoré par Git. Prochaine vérification concrète : constater la prise en compte
d'une modification moteur au prochain message d'une partie de développement.

<!-- BEGIN:SARAH-DIARY-2026-11-23 -->
## 23 novembre 2026 — lecture du journal avant l’apparition de Sarah

**Constat local et provenance.** Dernière partie locale à 01 h 25–01 h 26
(Europe/Paris), session `9c0b344e-871d-48f3-b4c0-9a06d90cd300`, dans
`.data/logs/server.jsonl`. Le message « Je lis le journal posé devant moi,
jusqu’à sa dernière page. » obtient un `reveal_npc(sarah, neutral)` réussi,
mais la narration finale de 454 caractères ne transmet aucun contenu des pages.
Elle annonce seulement leur lecture et l’apparition. Aucun échec moteur ;
les consignes d’ouverture privilégiaient l’apparition sans exiger le résumé.
Aucun audit global, scanner de livres ou reconstruction de backlog.

**Intégré.** `adventures/sarah-of-yellowcrest-manor/adventure-module.md`,
salle 1 : résumé narratif complet à raconter dans la réponse finale avant
l’apparition, fondé sur les passages déjà présents dans `npc-lore.json`
(sections `27c`–`27f`) : apprentissage, famille et affaires, Faerl, Vecken,
adresses, dernière entrée et deux croquis. Lecture sans jet ; identification
du rituel, témoignage du fantôme et secrets ultérieurs distincts. L’exemple de
`definition.ts` rappelle cet ordre et l’obligation de placer le résumé dans la
réponse finale, puisque la prose accompagnant un appel outil est ignorée.
`docs/multi-map-adventures.md` maintenu. Aucun nouvel outil ni appel fabriqué,
aucune prise de copie, acceptation de mission ou transition implicite.

**Précision utilisateur sur la forme.** Le résumé doit articuler les
informations du livre, sans les énoncer point par point. La matière de la
salle 1 a été réécrite en prose liée, du quotidien et des attachements de Sarah
à sa peur et aux derniers croquis. Les consignes locales et l’exemple statique
exigent une narration fluide, sans puces, numérotation, sous-titres ni
énumération de pistes. Aucun test ni autre validation exécutée après cette
précision, conformément à la demande utilisateur.

**Validation antérieure à cette précision.** `npm run typecheck` terminé, exit 0. Suite `npm test`
interrompue à la demande explicite de l’utilisateur ; aucun résultat complet
revendiqué et aucun playtest lancé. Journaux dans
`output/sarah-diary-20261123/`. Ne plus exécuter de tests sans demande explicite.
Les tests existants `dm-quest-progress` ont été enrichis pour vérifier la présence des indices et
des consignes avant ET après `reveal_npc`, en chat et via le clic sur le livre ;
`dm-prompt-guidance` leur raccord dans le prompt statique. Ces modifications
de tests n’ont pas de résultat ciblé revendiqué.

**Limites et prochain geste concret.** Ces contrôles vérifient le contenu et
le pipeline, pas l’exhaustivité d’une génération réelle. Aucun appel payant ni
modification de l’historique de la partie locale. À la prochaine lecture avec
le modèle réel et le contexte rechargé, vérifier le résumé puis l’apparition
muette, sans divulgation anticipée ni acceptation automatique de la quête.
<!-- END:SARAH-DIARY-2026-11-23 -->

<!-- BEGIN:OPENAI-MIGRATION-2026-11-23 -->
## 23 novembre 2026 — retour sur master et transport OpenAI

**Demande et périmètre.** Retour sur `master` actualisé depuis `origin/master`
(`cb96bf4`), en conservant le travail local MCP et ses dépendances. Les fichiers
suivis antérieurs sont sauvegardés par le stash et la branche
`codex/backup-before-openai-20261123` ; les fichiers non suivis sont restés en
place. Report par fusion squash sans commit, avec la correction amont de
rattachement des sessions invitées conservée. Aucune reprise d'audit ou de lot
mécanique ; aucune modification du moteur, des aventures, des personnages ou
des sources SRD par cette migration (comparaison avec la sauvegarde).

**Intégré.** `lib/dm/openai.ts` implémente Responses et le compteur
`/responses/input_tokens`. `llm.ts` route le MJ, les narrations et le résumé
vers OpenAI ; modèle par défaut `gpt-5.4-mini`, schémas MCP inchangés,
appels séquentiels, arguments intacts, continuations chiffrées réémises,
`store:false` et refus des sorties incomplètes. Les contrôleurs GPU historiques
restent conservés mais sont inertes pour OpenAI ; les réservations Runpod ont
été retirées de la route DM et du boot. Configuration serveur et locale,
.env.example, comptabilité du cache/coûts explicites, traces HTTP et générateur
hors réseau adaptés. Le format d'export `chat` existant reste compatible
Chat Completions sans appel vLLM. Budget de résumé configurable via
`LLM_COMPRESS_MAX_TOKENS` (300 par défaut). Guide : [OpenAI](openai.md).

**Validation effectivement exécutée.** `npm run typecheck` : exit 0 avant
les derniers ajustements documentaires et le paramétrage du budget de résumé.
Build MCP puis ciblage adaptateur OpenAI, fournisseur, intégration DM/MCP,
découverte des outils, traces HTTP et adaptateur historique : **33/33**, exit 0,
HTTP intégralement simulé, aucun appel payant. La suite complète et le
playtest mock ont ensuite été **interrompus à la demande de l'utilisateur**,
sans relance. La sortie partielle de la suite signale deux fichiers en échec
(`adamantine-held-sql`, `adamantine-integrity`) sans diagnostic complet ;
aucun passage complet vert ou playtest réussi n'est revendiqué.

**Limites et prochain geste concret.** Aucune vérification live payante. La clé
`OPENAI_API_KEY` est à renseigner dans .env.local avant de démarrer en live ;
le fournisseur et les modèles locaux ont été migrés sans copier de secret dans
les traces ou la documentation. Les modèles alternatifs nécessitent leur
fenêtre de contexte documentée. La prochaine vérification de comportement réel
est une partie locale avec cette clé, hors de la présente validation simulée.
<!-- END:OPENAI-MIGRATION-2026-11-23 -->

<!-- BEGIN:SARAH-STORY-CONTEXT -->
**10 novembre 2026 — vue d'ensemble narrative permanente de Sarah.** Demande utilisateur : donner au MJ conscience de l'ensemble du scénario et des liens narratifs entre cartes (aventure appelée « Sasha » dans la demande, identifiée au module Sarah du projet). Aucun audit global ni scanner de livres.

**Intégration.** Le préambule de `adventures/sarah-of-yellowcrest-manor/adventure-module.md` contient désormais le rôle des six cartes dans les cinq actes, les liens journal/preuves/urne/sépulture, les parcours de Vecken et Faerl, les liens Kara/Yaeda et père/fils Fargo, les voyages définitifs et les escaliers réversibles. Il distingue confrontation close, victoire sur le culte, sauvetages et apaisement final, y compris la fuite sans victoire. Le parseur et `buildStaticPrompt` existants conservent ce dossier confidentiel sur toutes les cartes ; aucun changement du moteur, des conditions, du contenu local sélectionné ou des appels MCP. `docs/multi-map-adventures.md` décrit ce raccord et son rechargement.

**Consultation à la demande — architecture finale demandée le 10 novembre.** L'utilisateur demande explicitement que `consult_rules`, `consult_campaign` et `discover_tools` soient tous des outils du moteur MCP, avec documentation directement accessible dans le prompt système, sans découverte préalable. `consult_rules` conserve son implémentation moteur. `mcp-server/campaign-reference.ts` lit uniquement le Markdown de l'aventure figée au spawn : index/recherche paginés, section ou fichier entier (`sectionId: "module"`), toutes cartes et annexes, pages bornées à 8 000 caractères. `mcp-server/tools/documentary-tools.ts` enregistre les deux nouveaux outils et observe les handles publics des outils enregistrés (APIs SDK moderne et legacy), sans registre privé. La découverte filtre les outils cachés, la phase et le personnage via la politique extraite à l'identique dans `lib/tool-exposure.ts`. `lib/tool-catalog.ts` partage la sélection documentaire et le chargement des schémas ; `lib/dm/tool-catalog.ts` conserve le point d'import existant. Les trois outils sont immédiatement exposés ; le prompt décrit leurs arguments, sélecteurs exclusifs, exemples, limites et paginations. Les schémas des autres outils restent chargés sur demande explicite du modèle, d'après les résultats MCP. La route ne traite plus de consultation locale et ne fabrique aucun appel de jeu. Aucun sélecteur de campagne ou chemin libre, aucune mutation/action/dé/temps consommé ; les résultats moteur gardent autorité. Guides et attentes du test de catalogue adaptés, sans exécution.

**Validation bornée et arrêt demandé.** Avant cet ajout d'outil : tests existants du chargement et des consignes MJ **21/21**, exit 0, et `npm run typecheck` exit 0. Inspection du prompt : dossier présent pour les quatre personnages, six cartes couvertes, corps des salles éloignées exclus et autres aventures inchangées. Journaux dans `output/sarah-story-context-20261110/`. La suite générale a été interrompue sur demande explicite de l'utilisateur le 10 novembre ; son journal partiel comporte des échecs, sans diagnostic ni résultat global revendiqué. Aucun test ou playtest relancé, aucun appel LLM. Pour la décision finale MCP : `npm run build:mcp` et `npm run typecheck:next` réussis, exit 0 (`mcp-documentary-build.log`, `mcp-documentary-next-types.log`), sans exécution de partie ni processus de jeu arrêté. Relecture des appels et `git diff --check` réussis. Les contrôles antérieurs ne valident pas le comportement des nouveaux outils, et aucune validation comportementale n'est revendiquée après l'arrêt des tests.

**Limites et suite.** Ce dossier donne une préparation narrative, sans prouver la qualité d'interprétation du modèle réel. Il ne donne aucune connaissance au personnage et n'enregistre aucun événement prévu comme accompli. Pour les nouvelles inscriptions d'outils et le catalogue, recharger l'application et utiliser un nouveau processus MCP sur les sessions reprises ; aucun processus ouvert n'a été interrompu ici. Le Markdown consulté est lu depuis le disque à chaque appel ; le contexte automatique conserve son cache habituel. Maintenir ce dossier avec les scènes et conditions lors de futures évolutions de Sarah.
<!-- END:SARAH-STORY-CONTEXT -->

<!-- BEGIN:OBJECTIVE-DIALOGUE -->
**9 novembre 2026 — journal d’objectifs par conversation livré et vérifié hors ligne.** Demande utilisateur : objectifs prévus ET quêtes inventées, réutilisables dans toutes les campagnes. `record_objective_dialogue` enregistre une communication explicite d’un PNJ visible, présent et capable ; `inspect_objectives` lit uniquement les propositions déjà connues. Moteur, schéma partagé, SQL, contexte MJ et composant `ObjectiveJournal` sont génériques. Les sources PNJ et libellés publics des **17 objectifs de Sarah** restent dans son `map.ts`. Les conditions internes des actes conservent leurs définitions : une quête inventée optionnelle ne crée aucun nouveau verrou de sortie.

**Procédure et état.** Domaine `objectives`, guide `objectives-npc-dialogue` dans `lib/dm/rule-guides.json`, consultable via `get_rules_support({domain: 'objectives'})` ; aucun manuel ajouté au système permanent. Sources et arguments conservés avec témoins de cohérence, rejeu identique sans effet, conflit d’ID et schéma invalide refusés avant mutation ou dé. Les conditions suivent l’état réel ; le départ irréversible fige l’acte quitté avant transfert, les escaliers réversibles ne le figent pas, les propositions pour un acte futur restent actives. Les anciennes parties n’inventent pas de dialogues passés. Aucun déclenchement depuis le texte joueur, helpful ou une visite ; aucun objet, récompense, XP, temps, action ou engagement du joueur accordé automatiquement.

**Validation finale.** `npm run typecheck` : exit 0. Ciblés moteur/API finaux : **10/10**. Passage complet `npm test` : **3 146/3 146**, zéro échec, annulation ou omission, exit 0. Puis `npm run playtest:mock` : **30/30 tours**, neuf scénarios, 71 appels simulés, **0 $**, exit 0. Le passage complet inclut les ciblés ; aucune addition de cohortes. Réutilisation réelle dans un second module, route sans appels fabriqués, SQL/hydratation, voyage, rendu React confidentiel et échappement de texte couverts. Les 23 fichiers de sources/tests suivis sont inchangés pendant la validation ; JSON compilé des procédures sémantiquement identique à la source. Inventaire runtime en lecture seule : **471 outils MCP, 112 domaines, 134 procédures**, index compact de **1 852 caractères**. [Rapport](rules-audit/validation-objective-dialogue-2026-11-09.json), [contrat et guide](objective-journal.md).

**Limites et suite concrète.** Quêtes inventées sur des conditions prises en charge et des références moteur existantes ; aucune création d’acteur, d’objet, de carte ou d’indice par cet outil, aucun prédicat libre. Bornes sans éviction : 64 communications, 64 quêtes inventées, 128 objectifs connus. Le MJ reste responsable des secrets, du mutisme et des préalables narratifs ; aucun parseur sémantique n’est ajouté. Les témoins vérifient la cohérence, sans signature cryptographique. Aucune qualité d’interprétation d’un modèle réel n’a été mesurée ni comparaison payante réalisée. Pour une prochaine campagne, déclarer `dialogue.npcIds` et `dialogue.label` des objectifs autorés dans son `map.ts` ; les quêtes inventées fonctionnent déjà sans adaptation du moteur. Aucun nouvel audit global.
<!-- END:OBJECTIVE-DIALOGUE -->

<!-- BEGIN:VLLM-CONTEXT-REFACTOR -->
**9 novembre 2026 — refonte contexte / vLLM intégrée et vérifiée hors ligne.** Décision utilisateur : transport vLLM unique, sans comparaison payante. SDK, marqueurs de cache fournisseur, effort, tarifs et configuration de l’ancien fournisseur retirés ; types et télémétrie locaux (`lib/dm/llm-types.ts`, `lib/llm-usage.ts`), exemple d’environnement, configuration locale et CI adaptés. Le système par défaut passe de **120 661 à 26 110 caractères** (environ −78 %, comptage local de caractères, pas une mesure de tokens ou de qualité). Le contexte local de campagne est conservé.

**Procédures et outils.** **133 entrées** dans `lib/dm/rule-guides.json`, sélectionnées par `lib/rule-guides.ts` et lues via `get_rules_support({domain})`. Sans domaine : index compact. `lib/dm/tool-catalog.ts` charge les schémas spécialisés après une recherche ou une lecture explicitement choisie par le modèle ; restrictions phase/personnage issues de l’état moteur. `discover_tools` est documentaire et local à la route : aucun appel de jeu fabriqué, aucun nouvel outil mécanique MCP. Un refus d’outil inconnu conserve aussi le verrou de mémoire libre jusqu’au prochain message. Les instructions de maintenance renvoient les futures procédures vers le JSON, pas vers le système permanent.

**Validation réelle, cohortes séparées.** Types MCP/Next finaux : exit 0. Passage complet `npm test` : **3 133/3 135**, les deux échecs provenant de fixtures Overrun/Tumble qui demandaient au faux modèle une lecture interne masquée `get_game_state`. Les fixtures lisent désormais le contexte autoritaire du harnais, avec les mêmes assertions mécaniques ; reprise ciblée de ces deux cas et du croisement W36 : **3/3**, exit 0. Garde-fou mémoire final : **2/2**, exit 0. Le passage complet contient aussi les nouveaux contrôles de découverte vLLM, de lecture MCP compacte et d’export de cibles synthétiques avec découverte de schéma ; ils passent. Dernier `npm run playtest:mock` après le garde-fou final : **30/30 tours**, neuf scénarios, 71 appels simulés, coût LLM **0 $**, exit 0. Les cohortes se recouvrent : aucune addition et aucun passage complet unique entièrement vert revendiqué. Source et JSON compilé des procédures concordent.

**Provenance et limites.** Migration ciblée des consignes du prompt existant, sans audit global ni scanner des livres ni reconstruction du backlog. Deux clauses auparavant mêlées à d’autres paragraphes ont été rangées dans leurs vrais domaines : mot de commande → `magic_items`, pétrification/contaminations → `afflictions`. Les sources de règles et le contenu d’aventure n’ont pas été modifiés. La qualité d’interprétation/narration du modèle réel n’a volontairement pas été comparée ; le tokenizer reste requis et un tour actif trop volumineux peut toujours être refusé avant génération. Pour un prochain ajout de mécanique : maintenir sa procédure et son domaine dans le JSON et sa description d’outil, sans regonfler le système. Aucun nouveau lot mécanique lancé.

[Rapport de validation](rules-audit/validation-vllm-context-2026-11-09.json).
<!-- END:VLLM-CONTEXT-REFACTOR -->

# Suivi canonique des intégrations MCP





Mis à jour le **9 novembre 2026**. Ce document est la **référence unique** du travail identifié par les audits et les recherches déjà effectués. Il reprend les **147 lots** existants ; leur affectation ne signifie pas leur réalisation.





## Règle de travail permanente





- Lire ce registre pour choisir et poursuivre un lot. **Ne pas refaire d’audit global**, ni rescanner les livres ou la couverture du moteur pour reconstruire la liste. Faire confiance aux constats consignés ici.


- Mettre à jour l’entrée concernée à chaque avancée : éléments réellement intégrés, outils et fichiers, tests exécutés, limites restantes et prochain travail concret. Ne pas régénérer ce fichier depuis les anciens JSON : ses statuts sont désormais autoritaires.


- Consulter ponctuellement la source d’une règle nécessaire à un lot et vérifier le code que l’on modifie reste normal. Cette vérification ciblée ne doit pas se transformer en nouvel audit général.


- Garder les matrices historiques et leurs JSON comme **preuves détaillées et archives**. Leurs anciennes mentions « manquant » ou « non commencé » ne remplacent pas les statuts actualisés de ce registre.


- Marquer un lot livré dans son périmètre seulement après code, persistance, refus avant coûts/dés et tests pertinents. Distinguer les règles facultatives, décisions produit et fiches toujours absentes.


- Préserver les invariants d’AGENTS.md : état moteur autoritaire, choix interprétés par l’IA seule, aventure/personnage fixes, aucune action MCP fabriquée côté serveur, aucune option activée implicitement.





## État et validation de la vague courante



<!-- BEGIN:W42-CURRENT-INTEGRATION -->
**W42 — intégré au projet le 9 novembre 2026, sur demande explicite sans relancer les tests.** Gel privé diagonal fusionné sur W39 Sarah. Tirs/lancers à 45° secs et coplanaires, cellule d’impact explicitement choisie, première entrée unique et dégagements de coin mesurés. Autres pentes, coins ambigus, relief et immersion refusent avant coût/dé. Aucun nouvel outil, mouvement, contact corporel ou pouvoir de monstre.

**Validation antérieure uniquement :** types MCP/Next, build MCP et **55/55 ciblés** sur onze fichiers verts ; **1/1 sonde externe W34 R3→SQL→candidat** distincte. Inventaire candidat antérieur : **469 outils, 111 domaines**. `npm test` interrompu par l’utilisateur et mock non lancé. L’instruction suivante, « intègre le lot dans le projet sans relancer les tests », autorise cette publication malgré cette validation globale incomplète : **aucune full ni mock verts revendiqués pour W42**. Les modifications parallèles du fournisseur LLM et l’allègement du prompt système sont conservés ; les résultats antérieurs ne valident pas ces changements ni le prompt réécrit. Schéma d’outil et catalogue de support MCP conservent la couverture W42.

**Publication :** dix fichiers sources/documentation/tests et onze artefacts compilés copiés avec sauvegardes ; sources moteur W42 et tous les binaires ROOT identiques au candidat par empreinte. Aucun nouvel inventaire runtime, test, build ROOT ou arrêt/redémarrage de partie. Livres et `.env.example` conservés. Guide et registre mis à jour ensuite. [Rapport W42](rules-audit/validation-wave42-diagonal-2026-11-09.json), reçu `output/w42-current-publication.json`. Validation globale à reprendre seulement sur demande. Prochain lot possible déjà suivi : préparations conjointes repos court PNJ de poursuite et service communautaire ; autres préparations W40/W41 non intégrées. Aucun nouvel audit global.
<!-- END:W42-CURRENT-INTEGRATION -->

<!-- BEGIN:W39-SARAH-DELIVERED -->
**W39 Sarah — cinq points livrés le 9 novembre 2026 dans leur périmètre borné.** Issues réelles, cycles MJ explicites, escortes/alliés et rencontres prédéfinies avec PNJ, dommage environnemental atomique et récompenses originales du chapitre. Types/builds MCP/Next, couverture ciblée composée : 1111/1112 sur 165 fichiers, seul budget de contexte corrigé par Markdown puis 69/69 sur trois fichiers affectés, sans somme ni fausse passe unique verte, Next isolé et inventaires candidat/ROOT verts. Full **3128/3128**, mock **30/30**, coût 0 $. Inventaire réel : **469 outils**, **111 domaines** ; 18 nouveaux noms et 44 nouveaux standards, neuf sources de règles inchangées.

Conventions utilisateur explicites : rôles civils/alliés distincts, cycle jamais clos automatiquement, fuite réelle avec urne sans victoire fictive, montants originaux/propriété des victimes, robe sans porteur et vraie frontière de prochain tour. Limites : Téléportation 7 acquise/lisible mais lancement refusé ; activation des nouveaux objets magiques par les PNJ non ajoutée ; propriétaire de butin au sol connu Z0 ; revente ordinaire B8 non qualifiée ; groupes et combinaisons PNJ avec embuscade/surprise/roster personnalisé non représentés refusés avant coût.

Les diagnostics et cohortes historiques qui se recouvrent restent séparés ; aucune addition privée prétendue distincte. [Rapport W39](rules-audit/validation-wave39-sarah-2026-11-09.json). Publication et inventaire ROOT réels terminés avant rapport ; arrêt après ce lot, capacités de monstres reportées.
Le full et le mock valident le candidat scellé. ROOT conserve séparément l’édition documentaire concurrente exacte de `.env.example`, archivée et non écrasée ; cette édition n’est pas prétendue validée par ces tests. Moteur et binaires restent ceux du candidat.
<!-- END:W39-SARAH-DELIVERED -->

<!-- BEGIN:W38-PUBLISHED-SUMMARY -->

**Dernière livraison vérifiée — W38 Critical intégrée le 2026-11-08.** Six priorités DMG 2014/Xanathar : concentration, pièges à 0 PV, fosses physiques, initiative des pièges complexes, continuité/repos PNJ et recouvrement d’Aide ; migration explicite du jet de fosse W37 incluse. Types/builds MCP/Next verts, full **3084/3084**, mock **30/30 tours**, coût **0 $**. Processus ROOT neuf : **451 outils, 108 domaines**, neuf fichiers de règles inchangés. [Rapport W38](rules-audit/validation-wave38-2026-11-08.json). Arrêt après ce lot ; capacités de monstres et priorités suivantes reportées.

<!-- END:W38-PUBLISHED-SUMMARY -->

<!-- BEGIN:W37-PUBLISHED-SUMMARY -->


**Livraison précédente vérifiée — W37 intégrée le 2026-11-08.** Contacts réels de glace forcée et clivage optionnel DMG2014, avec W35/W36 conservés. Types MCP/Next, builds MCP/Next Webpack et 641 ciblés passent, héritage exact de 92 fichiers précédents ; full **3052/3052**, mock **30/30 tours**, coût0$. Processus ROOT neuf : **442 outils uniques**, domaines réellement vérifiés. Neuf fichiers de règles inchangés ; deux lots restent partiels. [Rapport W37](rules-audit/validation-wave37-2026-11-08.json).


<!-- END:W37-PUBLISHED-SUMMARY -->





<!-- BEGIN:AUDIT-MCP-DMG-XGE-2026-11-08 -->

**Statut actualisé après W38 : les six premières priorités sont traitées dans le périmètre livré ci-dessous.** Les constats, lignes de code et validations du présent audit décrivent la photographie W37 antérieure aux correctifs ; les points 7 à 10 restent à décider.


**Nouvel audit explicitement demandé le 8 novembre 2026 — proposition de priorités, aucune intégration.** Cette demande autorise ce nouvel audit malgré la consigne historique de ne pas le refaire ; aucun ancien scanner ni reconstruction des archives n’a été lancé. Trois agents ont confronté les passages DMG 2014/Xanathar au code ROOT W37 actuel, sans compter les privés W38 et suivants comme livrés. Les 1 380 sources du manifeste et 1 959 binaires sont inchangés. Les passages Homebrew sont exclus des règles officielles.





**Ordre recommandé pour la jouabilité :**


1. **Concentration avant Contresort — bug reproduit par MCP.** L’ancienne concentration subsiste si la nouvelle incantation à concentration est contrée. Xanathar84–86 ; `mcp-server/hero-spells.ts:333`, `:361`, `:379`.


2. **Conséquences des pièges après 0 PV — bug mâchoires reproduit.** Une vraie potion permet de repartir sans libération STR15 ; l’aiguille empoisonnée présente le même garde PV>0 en lecture statique, sans reproduction supplémentaire. Xanathar1440–1446/1514–1518 ; `mcp-server/tools/trap-tools.ts:56`, `:92`.


3. **Fosses et remontée — contournement reproduit.** Échec réel, chute10ft/dégâts puis simple déplacement XY accepté sans sortie verticale. Xanathar1496–1506 ; `mcp-server/tools/trap-tools.ts:89`.


4. **Initiative réelle des pièges complexes — limite confirmée par code.** Vérifier les vraies frontières10/20 et les égalités avec les créatures, sans appel serveur inventé. Xanathar1676/1692 ; `mcp-server/complex-traps.ts:50`.


5. **Continuité PNJ/cartes/repos — limite technique confirmée.** Un PNJ avec fièvre hilare active, incubation comprise, peut empêcher le départ sans compagnon autoré ou guérison ; un vrai repos PNJ n’est pas représenté. DMG3538–3542/8428 ; `mcp-server/cackle-fever.ts:338`, `mcp-server/tools/map-tools.ts:73`. Le privé W38 de repos court de poursuite n’est ni livré ni une guérison générale.


6. **Recouvrement des effets de même nom — écart statique.** Aide supérieur est refusé tant qu’un Aide existe, alors que seul le bénéfice applicable devrait dominer pendant le recouvrement. DMG8165/Xanathar62 ; `mcp-server/hero-spells.ts:220`.


7. **Ordre général des effets simultanés — procédure partielle.** Préserver les mécanismes spécifiques déjà livrés et introduire le choix persisté du contrôleur après adoption explicite de l’option Xanathar940–942 ; conserver les timings propres aux réactions DMG8159–8161.


8. **Événements improvisés atomiques — procédure commune manquante.** Les dégâts et défenses existent ; sauvegarde, dés et delta HP sont des appels séparés. Relier leur résolution et leurs conséquences par un événement conservé. DMG7997–8025 ; `mcp-server/tools/player-tools.ts:401`.


9. **Liquidité marchande réelle — limite de procédure, pas bourse infinie.** Représenter des fonds finis initiaux/externes réellement qualifiés, au lieu des seuls achats antérieurs du PJ. DMG5336–5348 pour le butin ; règle de pleine valeur PHB3913, dépendance existante et non faussement attribuée au DMG. `lib/merchant-resale-state.ts:33`.


10. **Récompenses magiques utiles à l’aventure — P2 ciblé.** Les trésors gardent les demandes de tirages magiques séparées des objets acquis ; onze profils activables seulement. Choisir un petit ensemble de récompenses réellement prévues et obtenir leurs fiches complètes, sans demander tout le catalogue. DMG5350–5354/5436–5446 ; `mcp-server/tools/hoard-tools.ts:59`, `lib/srd/magic-items.ts:2`.





Trois scénarios publics de diagnostic sont confirmés ; aucun test standard ajouté, aucune nouvelle full ni build exécuté. La validation W37 de3 052 tests reste historique et ne prouve pas ces cas nouveaux. Couverture déclarative, variantes de zones sur grille, recherche de campagne, marché magique optionnel et artisanat générique restent des pistes secondaires documentées ; pouvoirs de monstres reportés. Obtenir les passages officiels absents avant toute mécanique d’identification de sort ou d’outil, sans utiliser les substituts maison.





[Rapport et classement détaillés](../output/audit-mcp-dmg-xge-2026-11-08/audit.json) — SHA `9d721f6677720a9aa27a32a195677f9043dfc16fd40ad502f8ff2fa4590795a4`. Rapports agents, lignes de code, sources, limites et preuves de diagnostic sont liés depuis ce rapport. Aucun statut de lot n’est déclaré livré par cet audit ; cet ordre reste une proposition à l’utilisateur.


<!-- END:AUDIT-MCP-DMG-XGE-2026-11-08 -->





<!-- BEGIN:W38-CRITICAL-DELIVERED -->

**W38 Critical — six priorités intégrées et vérifiées le 8 novembre 2026.** Le lot traite les points 1 à 6 de l’audit précédent, avec la migration de fosse demandée explicitement. Les anciennes préparations W38/NPCchase/Community, Mark, ventes et Disarm restent distinctes et non intégrées par cette livraison. [Rapport permanent W38](rules-audit/validation-wave38-2026-11-08.json).



1. **Concentration avant Contresort.** L’ancienne concentration se termine au commencement de la nouvelle incantation, avant sa fenêtre de réaction ; perception et reprise SQL conservent cette frontière. Source Xanathar 84–86.

2. **Pièges à 0 PV.** Une victime encore vivante conserve les mâchoires jusqu’à sa vraie libération ; l’aiguille applique poison/paralysie avant ses dégâts. Un soin ne les efface pas. Sources Xanathar 1436–1446/1508–1518.

3. **Fosse physique et remontée.** Canevas, fond à dix pieds, bord et face d’escalade sont mesurés ; le corps descend réellement, puis remonte par le mouvement existant et ses coûts. Un ancien jet W37 suspendu peut adopter la géométrie actuelle avec `migrate_held_pit_save`, en gardant exactement son pending, son dé et les coûts déjà payés. Source Xanathar 1496–1506 ; chute/escalade PHB comme dépendances existantes.

4. **Initiative des pièges complexes.** Vrais comptes 10/20, après les créatures à égalité, ordre conservé, impulsion explicitement choisie et reprise SQL. Une sphère seule peut posséder ses vrais tours sans ennemi inventé ; aucune action MCP n’est fabriquée par le serveur. Sources Xanathar 1676–1696/1788–1808.

5. **Continuité et repos PNJ.** Séparation explicitement déclarée, corps et échéances de fièvre hilare conservés, réconciliation au retour et repos long réellement observé sur la carte. Aucune activité ni aucun repos hors champ inventé. Sources DMG 3538–3542/8420–8428 ; repos PHB comme dépendance existante.

6. **Recouvrement d’Aide.** Instances et durées indépendantes, seul le bénéfice le plus fort contribue au maximum. Le nouvel effet supérieur ajoute seulement le delta positif aux PV courants ; égal/faible et réactivation ne soignent pas. Sources DMG 8163–8165/Xanathar 60–62 ; réconciliation des PV selon la convention utilisateur explicite.



**Validation réelle.** Types MCP/Next et build MCP verts ; build Next webpack vert dans une copie séparée. Avant migration : **900/900 sur 131 fichiers** ; reprise finale bornée : **165/165 sur 19 fichiers**, sans additionner ces cohortes qui se chevauchent. Suite complète exécutée seulement après préparation du lot entier : **3084/3084**, aucun échec, saut, annulation ou todo. Les 32 nouveaux standards distinguent 28 parcours publics de jeu, un refus public, une unité UI et deux positifs legacy contrôlés issus d’archives W37 authentiques. Quatre sondes réelles W37→SQL→nouveau moteur passent séparément et ajoutent zéro standard.



**Pipeline et intégration.** Playtest mock **30/30 tours, neuf scénarios, 71 appels mock, 0 $** ; objectifs OK. Publication locale de **240 fichiers** avec sauvegardes byte-exactes, sans build ROOT ni interruption de partie. Le processus ROOT neuf confirme **451 outils uniques, 108 domaines**, mêmes schémas/métadonnées/couverture que le candidat ; les 442 outils W37 sont conservés. Neuf ajouts : `inspect_complex_trap_turn`, `qualify_pit_geometry`, `migrate_held_pit_save` et les six outils de continuité/repos PNJ. Le sceau validé porte 1411 sources et 2003 binaires ; rapport W38 et registre sont des métadonnées de clôture séparées. Neuf fichiers de règles inchangés.



**Limites et prochain travail.** Le repos PNJ reste individuel et prospectif : soins réellement supportés et rétablissement de fièvre hilare, sans dés de vie, ressources, nutrition ou récupération d’épuisement inventés. La prise du bord d’une fosse, les descentes couplées et les géométries non qualifiées restent différées. Le croisement sphère/fosse est refusé avant initiative, tant que le roulement et les volumes ne sont pas représentés. La pile générale d’effets simultanés, les points 7 à 10 de l’audit et les capacités de monstres ne sont pas intégrés ici. Arrêt après ce lot demandé ; aucune suite de lots lancée.



**Preuves de clôture.** Chemin workspace du rapport : `docs/rules-audit/validation-wave38-2026-11-08.json`. Rapport permanent SHA `e4fe2d1f30d09e129ab8ed8274744c51ac8ed02a770521c5e21dc7a605ad81ca`. Publication : `output/w38-critical-publication.json` ; inventaire neuf : `output/w38-critical-root-inventory.json`. Contrôle indépendant de l’état publié et de ce registre : `output/w38-critical-post-publication-verification.json`. Aucun scanner de livres ni reconstruction du backlog depuis les archives n’a été exécuté.

<!-- END:W38-CRITICAL-DELIVERED -->











**Historique privé W42 — désormais intégré selon l’entrée courante ci-dessus.** La préparation DMG2014 4346–4350 avait passé types/build, 5/5 nouveaux publics, 14/14 compatibilités et une sonde externe W34 R3→SQL, sans full privée. Ces preuves restent historiques et ne sont pas ajoutées à une nouvelle full. Provenance : `output/w42-razorvine-diagonal-handoff.json`. État et limites actuels : [rapport W42](rules-audit/validation-wave42-diagonal-2026-11-09.json).





<!-- BEGIN:W36-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W36 intégrée le 2026-11-07.** Référence Xanathar des faibles FP et option DMG Tumble, avec les acquis W35 conservés. Types MCP/Next, builds MCP/Next Webpack et 626 ciblés passent, avec les 89 fichiers de compatibilité hérités conservés ; full **3037/3037**, mock **30/30 tours**, coût 0 $. Processus ROOT neuf : **441 outils uniques**, domaines réellement vérifiés. Neuf fichiers de règles inchangés ; deux lots toujours partiels. [Rapport W36](rules-audit/validation-wave36-2026-11-07.json).


<!-- END:W36-PUBLISHED-SUMMARY -->





<!-- BEGIN:W35-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W35 intégrée le 2026-11-07.** Renouvellement d’un allié nommé, politique commune des parchemins niveau2 sans nouvelle recette et option Overrun. Types MCP/Next, builds MCP/Next Webpack et 610 ciblés passent, avec les84 anciens fichiers de compatibilité retenus dans cette cohorte ; full **3021/3021**, mock **30/30 tours**, coût0$. Processus ROOT neuf : **441 outils uniques**, domaines réellement vérifiés. Neuf fichiers de règles inchangés ; trois lots toujours partiels. [Rapport W35](rules-audit/validation-wave35-2026-11-07.json).


<!-- END:W35-PUBLISHED-SUMMARY -->





<!-- BEGIN:W34-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W34 intégrée le 2026-11-07.** Parchemin multi-jours Pas brumeux, Carousing et seule variante Shove Aside. Types MCP/Next, builds MCP/Next Webpack et 580 ciblés distincts passent ; full **3002/3002**, mock **30/30 tours**, coût0$. Processus ROOT neuf : **440 outils uniques**, domaines réellement vérifiés. Neuf fichiers de règles inchangés. [Rapport W34](rules-audit/validation-wave34-2026-11-07.json).


<!-- END:W34-PUBLISHED-SUMMARY -->





<!-- BEGIN:W33-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W33 intégrée le 7 novembre 2026.** Charme-personne avec adoption explicite de la règle de cible invalide de Xanathar, cadence générale optionnelle des rencontres du DMG, service religieux Xanathar et rites sacrés DMG, dans les périmètres bornés ci-dessous. Types MCP/Next, builds MCP/Next Webpack et 401 tests ciblés passent ; full **2973/2973**, mock **30/30 tours**, coût0$. Un processus ROOT neuf expose **429 outils uniques** et les domaines explicitement vérifiés. Les neuf fichiers de règles gardent leurs empreintes W32. [Rapport W33](rules-audit/validation-wave33-2026-11-07.json).


<!-- END:W33-PUBLISHED-SUMMARY -->





<!-- BEGIN:W32-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W32 intégrée le 7 novembre 2026.** Potions de soins supérieurs et suprêmes et combats de fosse de Xanathar, premières complications de poursuites sauvages du DMG 2014, dans les périmètres bornés ci-dessous. Le candidat r2 conserve aussi les véritables fenêtres passives des corps vivants stabilisés à 0 PV sous poussière. Les types MCP/Next, les builds MCP/Next Webpack et les 243 tests ciblés passent. La tentative R1 a été interrompue avant achèvement et ne valide pas la livraison. La suite complète du candidat R2 a commencé après correction et intégration du lot et confirme **2942/2942 tests**. Le mock confirme **30/30 tours** à 0 $. Un processus ROOT neuf expose **417 outils uniques** et lit les trois domaines. Les neuf fichiers de règles conservent leurs empreintes W31. [Rapport W32](rules-audit/validation-wave32-2026-11-07.json).


<!-- END:W32-PUBLISHED-SUMMARY -->





<!-- BEGIN:W33-PREPARATION -->


**Historique de préparation W33 — 7 novembre 2026.** L’agent potions W32 terminé est relancé sur `XGE-INVALID-TARGET` dans `output/w33-invalid-targets`, copie séparée des mêmes octets W31. Cette branche devra être fusionnée à trois voies sur la dernière vague validée, sans remplacer les évolutions W32. Décision utilisateur reçue : choix explicite du MJ, Charme-personne niveau 1 d’abord ; cible réelle de mauvais type, dépenses normales, apparente sauvegarde réussie sans faux jet ni révélation de la cause. Absence de choix : refus strict existant. Source ciblée Xanathar 1109–1113. Les autres contraintes réelles d’incantation restent prévalidées et aucune nouvelle capacité de monstre n’est ajoutée. Cette préparation n’atteste ni une livraison W33 ni la fin de W32.


Le second agent terminé est relancé dans `output/w33-smith`. La consultation ciblée de `XGE-TOOL-DETAILS` et du passage local Xanathar 1002–1083 reconfirme la lacune déjà suivie `SOURCE-XGE-TOOLS` : les fiches officielles Smith’s Tools / Repair sont absentes et la substitution locale porte explicitement la mention Homebrew. Aucune réparation 10 PV/heure n’est implémentée de mémoire. Relais autorisé sur le prochain contrôle général de `ENCOUNTER-RANDOM`, après distinction explicite du d20 urbain W29 déjà livré et vérification du code nécessaire à cette seule tranche.


Le troisième agent terminé est relancé dans `output/w33-service` sur `XGE-DOWNTIME-SOCIAL`, service religieux : véritable semaine, temple et accès qualifiés, jets et faveurs persistées avec plafond global, demandes d’aide/support réellement acceptées. La réduction de prix d’un service clérical attend son producteur tarifé physique ; aucun miracle, secret, quête, PNJ ou bénéfice n’est fabriqué. Le traitement d’un total inférieur à 1, absent du tableau imprimé, attend la réponse utilisateur. Tous ces privés restent fondés sur W31 pour une future fusion à trois voies, indépendants du candidat W32 scellé.


Le privé Charme-personne est gelé avec 48/48 ciblés, dont quatre nouveaux, types/build verts et compatibilité réelle W31/SQL. Son agent est immédiatement relancé dans `output/w33-rites` sur la tranche `DOWNTIME-ECONOMY` Performing Sacred Rites du DMG 5217–5223 : efforts religieux réels, puis Inspiration datée selon la règle source. Aucune de ces preuves privées ne vaut publication W33 ; intégration, croisements et suite complète commune restent à faire après W32.


**Découverte ciblée W33 — ancien état sans dmTools.** La revue de `retainInvalidTargetCast` a identifié une rétention supposant le registre optionnel déjà présent. Le vrai probe MCP `output/w33-invalid-targets/w33-legacy-absence-probe.log` confirme un état legacy accepté sans ce champ puis une erreur après dépense d’un emplacement. Le gel initial n’est donc pas publiable dans ce périmètre. Révision séparée autorisée dans `output/w33-invalid-targets-r4`, ancien gel conservé : initialiser par la primitive canonique au moment de retenir et tester coût unique, SQL, rejeu et absence de faux jet. Les modes stricts existants et W31 publiée ne sont pas modifiés par cette découverte privée.


**Décision W33 service religieux reçue.** Les totaux inférieurs à 1 sont explicitement rangés avec 1–10 dans « aucune faveur » : zéro gain pour tout total ≤10, vrai jet conservé et contrôle de complication normal. Cette extension du tableau est une convention utilisateur, pas une ligne imprimée ajoutée au livre. L’attente signalée plus haut est levée ; l’agent termine la branche et sa validation finale.


**Révision privée W33 Charme-personne validée.** `output/w33-invalid-targets-r4` remplace le gel initial : 50/50 ciblés, dont six nouveaux, types/build et compatibilité ancien W31/SQL verts. La régression legacy sans `dmTools` et la vraie cible PNJ humanoïde sont publiques ; seul r4 sera fusionné. La revue des rites sépare aussi les reçus des dons quotidiens de la limite de 256 octrois discrétionnaires : l’acquisition déjà gagnée ne doit ni bloquer l’horloge ni jeter une erreur après avance. Le fournisseur d’Inspiration reste commun, avec réservation conservée et reçus source dans le projet borné ; preuve de saturation réelle en préparation. Provenance `mcp-server/dm-inspiration.ts` et privé `output/w33-rites`.


**W33 — quatre privés gelés et intégration exploratoire.** Cibles invalides r4, cadence, service et rites sont verts dans leurs cohortes privées : 28 tests nouveaux distincts, dont 25 publics et trois compléments contrôlés du service, sans addition des cohortes voisines recouvrantes. `output/w33-preview` reprend les octets exacts du gel R2 pour une fusion trois voies depuis W31 ; cet aperçu n’est ni une publication W32 ni un candidat W33 livré. La revue des 27 résolutions conserve les trois activités Pit/Service/Rites, les sources de jets, le KO passif R2 et les hooks temporels. Un défaut distinct de la branche rites est découvert dans `app/api/dm/route.ts` : `inspect_sacred_rites` manque dans `DOCUMENTARY_TOOLS`, le hint MCP seul ne suffisant pas à son classement. Overlay d’intégration avant/après SHA autorisé avec un POST d’inspection seule, séparé des résolutions Git et des gels privés. Les deux croisements communs et ce nouveau POST attendent leur exécution sur l’aperçu compilé ; aucune full W33 n’est lancée.


**W33 — passage à l’intégration officielle.** W32 r2 est désormais publiée et vérifiée : 2942 tests, mock30/30, inventaire neuf417 outils. L’aperçu W33 confirme types/build MCP et trois tests parents verts (deux croisements publics et un POST d’inspection seule), sans suite complète ni publication W33. Le bootstrap officiel conserve aussi 44 archives historiques déjà présentes dans ROOT mais hors du sceau W32 : leurs chemins et empreintes seront explicitement ajoutés à la baseline, sans exclure arbitrairement de nouveaux fichiers. Aucun fichier scellé W32 n’a dérivé. Provenance : `output/w33-builder-root-archive-diagnostic.json` ; les preuves officielles communes restent à produire avant livraison.


**W33 — fusion officielle appliquée.** `output/w33-integrated` part de 1307 sources de la base réelle W32 r2 avec rapport et 44 archives conservées, et de 1859 binaires inchangés. Les cinq passes de planification (13/8/5/1/0 conflits) ont repris exactement 27 résolutions relues ; les 48 chemins des quatre branches correspondent à l’aperçu brut approuvé. Le registre conserve Pit/Service/Rites et le KO passif r2. L’overlay documentaire borné `inspect_sacred_rites` a ensuite été appliqué séparément à la route API. Provenance : `output/w33-approval-transfer-r1.json`, `output/w33-merge-plan.json` et `output/w33-preview-inspection-overlay.json`. Types, builds, ciblés/croisés officiels, inventaire, full et mock restent requis ; W32 demeure la publication vérifiée.


**W33 — contrôles officiels en cours.** Types MCP/Next et build MCP sont verts ; le manifeste officiel `output/w33-integrated/w33-manifest.json` fige 1330 sources et 1899 binaires. La cohorte commune de 59 fichiers est active. Le build Next, l’inventaire réel et la full/mock attendent sa fin ; aucune publication W33 n’est revendiquée.


**W33 — suite complète démarrée après préparation entière.** Les 401/401 tests ciblés dans 59 fichiers sont verts, sans échec/ignoré/annulé, ainsi que les types MCP/Next et builds MCP/Next Webpack sur copie exacte. Le processus candidat expose réellement 429 outils uniques et les huit domaines configurés. Le readiness `output/w33-integrated/w33-readiness.json` SHA `3aedd39fd4a325b0f0d3b4274d1a58dacf1e35aed9b24f9d5e9a29d8cd35fb0d` lie ces cinq preuves au manifeste officiel. La full puis le mock sont lancés sur les 1330 sources et 1899 binaires figés ; aucun résultat final ni publication W33 n’est encore annoncé. Les branches W34 demeurent indépendantes de ces octets.


<!-- END:W33-PREPARATION -->





<!-- BEGIN:W34-PREPARATION -->


**Préparation indépendante W34 — 7 novembre 2026.** Les trois agents sont relancés depuis le manifeste officiel W33 SHA `8c449be42661ec1176007258a61a18651a64f3857420964695a7a5aa3f734b03`, dans des copies séparées : `output/w34-scrolls` pour les parchemins multi-jours de Pas brumeux (Xanathar 2402–2424), `output/w34-carousing` pour les sorties mondaines (Xanathar 2059–2137) et `output/w34-shove-aside` pour la poussée latérale optionnelle (DMG 9193–9195, 9228–9230). Ces travaux ne modifient pas le candidat W33. Les conventions de paiement/retard du parchemin et les résultats non positifs, le paiement et l’affectation des contacts de Carousing sont soumis à l’utilisateur ; aucune réponse n’est présumée. Les validations privées lourdes attendent la fin des prérequis W33. Aucune full ni livraison W34. Capacités des monstres et glace mince restent reportées.


**Décisions W34 reçues.** Pas brumeux : 250 po de fournitures entièrement payées au démarrage, sans remboursement automatique à l’abandon ; après plus de six dates, arbitrage explicite du MJ avec complication réelle, nouvelle échéance finie et suppléments cumulés plafonnés à 250 po (total au plus 500 po). Carousing : toute valeur ≤5, y compris zéro ou négative, rejoint le résultat de contact hostile ; vrai jet et complication sont conservés. Les 10/50/250 po sont payés au premier effort réel de huit heures, sans remboursement automatique. Si les contacts alliés non nommés atteignent leur plafond, le résultat reste en attente d’une affectation explicite aux places libres ou à de vrais PNJ, sans perte de gains ni dépassement du plafond. Ces choix étendent les procédures aux cas non fixés par les livres ; ils ne sont pas présentés comme du texte imprimé. Les agents poursuivent les copies privées, sans modification du candidat W33 en validation.


**Découverte ciblée W34 — réservation de capacité des parchemins.** La relecture du nouveau projet multi-jours dans `output/w34-scrolls` a montré que réserver l’identifiant de sortie ne réservait pas encore une place dans le registre technique existant de 64 parchemins. Un autre producteur pouvait donc remplir la dernière place avant l’achèvement. Le raccord des projets ouverts aux gardes de `create_spell_scroll` et `scribe_xge_spell_scroll`, avec preuve publique au seuil et abandon conservant l’historique, est en préparation avant gel. Aucun binaire W34 n’est publié ; cette limite technique n’est pas une règle imprimée supplémentaire.


**W34 — gels privés et plan commun.** La poussée latérale est gelée avec types/build verts, 84/84 ciblés et dix nouveaux cas publics. Carousing est gelé après 94/94 sur sa cohorte R2 puis 31/31 sur le dernier passage import/réactions : douze nouveaux cas, dix publics et deux compléments contrôlés déclarés. Le registre supprimé sous un vrai jet Carousing en attente est désormais refusé avant remplacement ; le témoin avant correctif est conservé dans `output/w34-carousing-missing-registry-before.json`. Transcription R2 est gelée avec 19/19 sur les producteurs affectés, dont quatre nouveaux cas publics ; la vraie frontière 63 instances + place réservée, abandon puis 64e production et refus de 65e a passé, ainsi que SQL et l’usage hors combat. Ses 82/82 voisins R1 restent une preuve historique distincte avant ce seul correctif de capacité. Ces résultats privés ne s’additionnent pas et ne constituent pas une livraison W34.


**Découverte d’intégration W34 — budget de message API.** La revue du plan commun a relevé les quatre nouveaux outils Scroll absents de `EXPLORATION_ONLY_TOOLS` et `work_xge_spell_scroll_project` absent de `PRIMARY_ACTION_TOOLS` dans `app/api/dm/route.ts`. Le moteur bornait déjà le combat, mais le vrai travail de huit heures ne verrouillait pas correctement une seconde action primaire du même message. Révision indépendante `output/w34-scrolls-r3` autorisée depuis le gel R2 conservé : tags de route et cinquième cas public POST, rouge avant correctif puis vert attendu après. Provenance : plan commun passe1, revue `output/w34-merge-staged-review-pass1.json` et route Carousing/Scroll. Le conflit additif `hero-tools.ts` conserve les deux validations de reprise avant bonus, avec approbation parent aux cinq empreintes. Le prochain plan attend ce nouveau gel Scroll ; aucun candidat commun, build ou full W34 n’est encore créé.


**W34 Scroll R3 — témoin API rouge/vert réel.** Sur la copie indépendante et les mêmes 1907 binaires du gel R2, le cinquième test public a confirmé qu’un second test d’INT atteignait le MCP après la vraie journée de transcription. Après le seul correctif de tags de route, le même POST passe : 28800 secondes exactes, paiement initial conservé sans nouveau débit, arguments IA inchangés, refus `PRIMARY_ACTION_ALREADY_RESOLVED` avant MCP/dé, SQL et rejeu. Les quatre outils ne sont plus proposés pendant un vrai combat. Types/build et cohorte finale R3 restent à terminer avant nouveau plan commun. Le gel R2 et ses preuves sont conservés ; aucun W34 n’est encore publié.


**W34 — candidat commun intégré et compilation verte.** `output/w34-integrated` contient 1349 sources, les deux résolutions parent aux cinq empreintes et les deux tests croisés. Les types MCP/Next et le build MCP sont verts ; le manifeste SHA `0b3d86722edc25540264a5a7eedb1e05442c28011d800d448d9f651a1877f263` fige 1927 binaires. Les validations Carousing/Shove avant bonus, les listes API complètes, les registres de temps partagé et les réservations sont conservés. La cohorte commune est lancée sur ces octets ; build Next, inventaire réel, readiness puis unique full/mock restent requis. W33 demeure la dernière publication vérifiée.


**W34 — cohorte R1 et correction du test parent, sans défaut moteur.** La cohorte commune R1 a terminé à 518/519, aucun ignoré/annulé ; le seul échec venait du test parent Rites/Inspiration/Shove Aside. Le vrai barde proposait encore Mots cinglants sur le jet adverse : les dés 18 et 1 étaient correctement retenus, mais le test attendait le déplacement avant de choisir cette réaction. Le même test corrigé par un refus explicite a passé1/1 sur les binaires R1 inchangés. Sources, 1927 binaires, manifeste et journaux R1 sont conservés ; `output/w34-r1-superseded.json` et les diagnostics en gardent la provenance. Aucune full R1 n’a été lancée.


**W34 R2 — copie commune distincte vérifiée.** `output/w34-integrated-r2` reprend les trois mêmes gels et les deux résolutions relues. Ses 1349 sources diffèrent de R1 uniquement par ce CJS parent ; les 1899 binaires W33 initiaux sont conservés avant reconstruction. Reçu de copie SHA `5ba84a2d53bcfcd5d2a8ee762631c5e51d5c7f56c283cc2724cf0776bd42d6aa`, source-inputs SHA `6d4668593b347882399eea316bb90781f6d4be6d6389d08de126052165021331`. Les types communs R2 sont lancés, puis build/ciblés/Next/inventaire/readiness précéderont sa full. ROOT reste W33. Les privés W35 conservent leur ancêtre R1 exact ; leur future fusion à trois voies héritera du correctif de test R2.


**W34 R2 — ciblés communs verts.** Types MCP/Next et build MCP passent ; les 1927 binaires reconstruits sont strictement identiques à R1, la seule différence source restant le test parent corrigé. Le manifeste R2 SHA `60ef6a6d36566ee55b18c4f8f5cf4c2db50368c446f5ccfe9ef776447a59d615` fige les 1349 sources. La cohorte commune confirme 519/519, zéro échec/ignoré/annulé ; les deux croisements publics et le POST d’action primaire passent. Build Next Webpack sur copie exacte et inventaire MCP neuf sont lancés ; aucune full W34 avant leurs vraies sorties vertes et le readiness.


**W34 R2 — full et mock lancés après préparation entière.** Les cinq preuves sont vertes : types MCP/Next, build MCP, 519/519 ciblés, build Next Webpack sur copie exacte, inventaire réel de 440 outils uniques et onze domaines (dont les huit hérités de W33). Le readiness SHA `a4c04091707e8dc14b0452c79c51274fc66291f4b7ae616d2ee1e032988d92c0` lie ces preuves au manifeste R2. Le préflight confirme un plancher dérivé de 3002 tests, puis la full suivie du mock est réellement démarrée. Les 1349 sources et 1927 binaires restent figés pendant ce contrôle. Aucune publication W34 ni résultat final n’est anticipé ; W35 demeure dans ses copies indépendantes.


**W34 R2 interrompue avant publication — encodage hérité.** La full a révélé un ancien test de trésor refusé ; le probe ciblé `output/w34-hoard-mass-diagnostic-r2.log` confirme le refus d’un titre source valide. Cause précise : `output/w34-edit-shove-aside.py` lisait sans encodage explicite sous Windows cp1252 puis réécrivait en UTF-8, corrompant notamment les tirets Unicode hérités dans `mcp-server/rules-library.ts`. Les neuf livres sont inchangés. Seul l’arbre du contrôleur privé 51136 a été arrêté après vérification de son identité ; les autres processus et ROOT restent intacts. Le gel R2 conserve exactement ses sources, binaires et journaux ; `output/w34-r2-superseded.json` distingue cette tentative inachevée d’une validation réussie. Une révision Shove séparée restaure les octets hérités depuis W33 et conserve les ajouts intentionnels. La vérification reste limitée aux fichiers déclarés des trois gels, sans nouvel audit global. Une nouvelle intégration et ses contrôles ciblés sont requis avant toute full. W33 reste la dernière livraison vérifiée.


**W34 — périmètre du correctif confirmé.** Deux contrôles indépendants limités aux 53 entrées déclarées des trois deltas, soit 41 chemins uniques, identifient uniquement six lignes héritées dans `rules-library.ts`. Les sept cas sélectionnés donnent cinq échecs reproductibles sur R2 et sept réussites sur W33 ; les deux autres passent isolément sur les deux versions et ne sont pas attribués à cette cause. Provenance : `output/w34-unicode-targeted-forensics.json`, `output/w34-unicode-independent-brewing.json` et `output/w34-unicode-focused-comparison.json`. Le nouveau privé `output/w34-shove-aside-r2` restaure seulement ces six lignes, sans changer l’import ni le lecteur Shove intentionnels ; types/build et ciblés restent requis avant son gel. Les anciens gels demeurent immuables.


**W34 R3 — intégration corrigée et vérifications communes.** `output/w34-integrated-r3` conserve 1349 sources et 1927 binaires, manifeste SHA `c97167e09f3cb4ef1a6cdb656641f6b653334ead54318fffb0a308ef273fa879`. Types MCP/Next et build MCP passent. Les 42 autres chemins planifiés sont identiques à R2 ; la comparaison indépendante des deux candidats confirme exactement six lignes héritées restaurées, ainsi que les seuls JS/map correspondants. Provenance : `output/w34-r3-repair-comparison.json`. La cohorte commune de 77 fichiers reprend les consommateurs des lecteurs corrigés ; sept autres fichiers de compatibilité Shove antérieurs seront exécutés séparément, sans recouvrement, avant la full. Cette séparation conserve les preuves de types/build déjà figées et ne réduit pas la couverture précédente. Next, inventaire, full et mock restent requis ; R3 n’est pas publiée.


**W34 R3 — suite complète démarrée après préparation entière.** Les 518/518 tests communs dans 77 fichiers et les 62/62 compatibilités supplémentaires dans sept fichiers distincts sont verts, soit 580 cas sur 84 fichiers, sans ignoré ni annulation. Types MCP/Next et builds MCP/Next Webpack passent ; un processus neuf expose 440 outils uniques et 11 domaines vérifiés. Le readiness SHA `869254c91b8f705daa076f15ea0dc390dcc50b606890b64dd7615673f82df167` lie les cinq phases au manifeste R3 ; le supplément de compatibilité est aussi exigé avant la full par la procédure de publication. La full puis le mock commencent le 7 novembre à 16:14:51 UTC sur les octets figés. Les petits runtimes privés sont terminés avant ce lancement ; aucune autre validation lourde n’est autorisée en parallèle. Aucun verdict final ni publication R3 n’est encore annoncé ; W33 reste livrée.


<!-- END:W34-PREPARATION -->





<!-- BEGIN:W35-PREPARATION -->


**Préparation W35 indépendante — 7 novembre 2026.** Les agents sont relancés depuis le manifeste W34 commun scellé ci-dessus, sans modifier son candidat. Carousing : renouvellement d’un allié nommé déjà consommé ; décision utilisateur reçue pour une convention commune d’un nouveau gain allié provenant d’une nouvelle semaine après l’aide, même classe sociale et même zone, une seule promesse disponible par personne, anciens reçus immuables. Aucun coût/dé/effet/attitude automatique au renouvellement ; l’égalité de seconde est permise si l’ordre causal des événements est réel. Les changements de classe/zone et les contacts hostiles restent hors tranche. Source ciblée Xanathar 2078, 2086, 2088–2096, qui impose de refaire Carousing mais ne fixe pas cette allocation.


**Parchemins — mutualisation par niveau.** L’utilisateur a validé pour Fracassement les mêmes conventions que Pas brumeux, puis demandé de regrouper les conditions identiques : coût/durée et politique de paiement/retard sont communs au niveau 2 (trois dates, 250 po au démarrage, abandon sans remboursement automatique, retard au-delà de six dates avec complication réelle, échéance finie et supplément cumulé au plus 250 po). Les composants et l’admissibilité restent propres au sort, avec un catalogue explicite de recettes réellement exécutables ; aucune activation automatique de tous les sorts de ce niveau.


**Découverte ciblée de dépendance W35 — Fracassement.** Le moteur résout déjà sphère, CON et 3d8 tonnerre, mais `spellAreaCreatures`/`planSpellArea` excluent les objets et `resolveDamageSpell` ne traite pas les objets non magiques non portés ni le désavantage des corps inorganiques ; aucun refus préalable ne borne ces branches. Provenance : `lib/spell-area-state.ts`, `mcp-server/hero-spells.ts` et `mcp-server/monster-rules.ts`, revue ciblée de l’agent transcription. La recette Fracassement est différée plutôt que d’ouvrir une nouvelle tranche PHB. Une autre recette niveau 2 est à qualifier ponctuellement ; aucun nouvel audit global. Le troisième agent prépare seulement le contrat DMG Overrun (Action Options), selon les positions, traversées et réactions réellement représentables. Aucune full ni livraison W35 ; capacités de monstres et glace mince restent reportées.


**W35 — renouvellement allié gelé en privé.** Décision utilisateur reçue : après une aide réelle, une nouvelle semaine dans la même classe sociale et la même zone peut consacrer un nouveau gain allié au renouvellement de ce contact, avec une seule promesse disponible. `output/w35-carousing-renewal` conserve les anciens reçus et ajoute `renew_xge_carousing_contact` au domaine existant. Types MCP/Next et build passent, ainsi que 72/72 ciblés dans 14 fichiers, dont sept nouveaux cas publics. Le vrai passage W34 R2 vers SQL puis W35 conserve l’état et les rejeux ; inventaire privé 440→441 outils. Delta `output/w35-carousing-renewal-delta.json` SHA `33bd06fa4945de4ea10d3abfc603316ddfd5db7d50c737d00d9937c5f501d600`. Cette preuve reste privée : la fusion à trois voies depuis son véritable ancêtre R1 devra reprendre la correction Unicode W34 courante. Aucune aide ni attitude n’est fabriquée par le renouvellement.


**W35 — dépendance Hold Person et socle des parchemins.** La vérification ponctuelle du catalogue exécutable et des routines d’incantation ne trouve pas de fiche Hold Person utilisable ; ses références documentaires ne suffisent pas à ouvrir une recette. Ce sort reste différé avec Fracassement. Le troisième privé peut donc livrer uniquement la mutualisation de la politique de niveau 2, avec Pas brumeux comme seule recette admise et les reçus existants inchangés. Aucune nouvelle tranche PHB ni recherche globale de couverture n’est engagée.


**W35 — politique commune de niveau 2 gelée en privé.** `output/w35-scroll-level-policy` modifie cinq fichiers et garde exactement le même catalogue, les mêmes schémas de reçus et les mêmes commandes : coût/durée et conventions utilisateur sont mutualisés, tandis que l’admissibilité et les matériaux restent par sort. Types MCP/Next et build passent, ainsi que 20/20 tests existants. Un vrai projet ancien W34 R2, deux journées et arbitrage de 50 po déjà réalisés, reprend via SQL sur le nouveau moteur, puis achève et utilise son parchemin réel sans nouveau paiement ni emplacement. La comparaison distingue les valeurs et commandes exactes de l’ordre des propriétés JSON, normalisé aussi par l’ancien moteur. Aucun outil ni test standard supplémentaire ; delta `output/w35-scroll-policy-delta.json` SHA `a1f54c4dc55623ee493c1406b4ad14240efa4a01622d29d17c6f16b4f6c515b2`. Aucune full W35.


**W35 — Overrun gelé en privé.** DMG2014 9193–9195 et 9224–9226 : choix explicite action ou action bonus entière, STR(Athlétisme) opposé réel, taille qualifiée et passage physique de trois cases. Le privé `output/w35-overrun` est gelé avec types MCP/Next/build verts et 11/11 nouveaux cas publics, dont les POST des coûts, réaction Shield tenue, reprise SQL et véritable mort par attaque d’opportunité avant l’entrée. Les coûts, dégâts et réactions déjà résolus restent conservés lors d’un arrêt progressif ; aucune case hostile intermédiaire n’est persistée. Les diagnostics 8/11 puis 10/11 provenaient des fixtures (initiative groupée, dé de l’attaque ratée et fin de cycle API explicite), sans correction moteur associée. Delta SHA `86ba336c9f388ebeded6bdc0ee5720d089239dc1596975303a7cdaed964fd48f`, 20 chemins, aucun nouvel outil. Les autres voisins et le croisement commun restent à tester ; la borne par cible/tour et les refus géométriques sont des limites techniques annoncées, pas de nouvelles interdictions RAW. Aucun W35 n’est publié.


**W35 — candidat commun prêt, full réellement en cours.** Les trois branches privées et le croisement parent sont intégrés dans `output/w35-integrated`, avec 1 360 sources/support et 1 939 binaires scellés (manifeste SHA `571b26e64575d48c8741f4a384e6c85b927382440a1139a889a5ccd6b03040de`). Types MCP/Next, builds MCP/Next Webpack, **610/610 ciblés dans 89 fichiers** et inventaire réel de **441 outils uniques dans onze domaines** passent. Tous les 84 fichiers ciblés W34 restent inclus. Le croisement public résout Shove Aside puis Overrun par action bonus avec une attaque supplémentaire restante, SQL et rejeu du déplacement terminé. La full commence le 7 novembre à **18:13:33 UTC**, après readiness SHA `da592bd75664fc66a103564252d2a634887014c02ed370176d8d6b7488aa96a9` ; le mock suivra automatiquement si elle réussit. Les sources, binaires et helpers restent figés. W34 reste publiée tant que ces contrôles et la copie vérifiée W35 ne sont pas terminés.


<!-- END:W35-PREPARATION -->





<!-- BEGIN:W36-PREPARATION -->


**Préparation indépendante W36 — Xanathar et DMG.** La tranche `XGE-ENCOUNTER` applique la règle distincte Weak Monsters and High-Level Characters (Xanathar 1257–1259) : ratio 1:12 pour un FP réellement publié inférieur à la plus petite colonne du palier, sans remplir une cellule imprimée vide ni extrapoler la table Solo à la session. Le privé `output/w36-weak-monsters`, ancêtre réel W34 R3, est gelé avec types/build verts et 10/10 ciblés, dont trois nouveaux parcours publics ; aucun nouvel outil, acteur, gain d’XP ou pouvoir de monstre. Delta SHA `81a0d9cb8715335703fa1e19a1f453b51c1d4f490309bbb871addd3155d0e5c2`. Sa publication attend une fusion depuis cet ancêtre et une validation commune ultérieure.


**Contrat XGE-EFFECT-ORDER, toujours ouvert.** Les quatre passages source distinguent cumul d’effets, réaction, concentration et ordre des événements simultanés ; la file ne peut rendre ces quatre règles interchangeables. La vérification bornée de deux producteurs existants n’établit pas encore de paire publique : la crise de fièvre hilare exige un humanoïde, tandis que la chute prolongée actuellement qualifiée repose sur un corps à vrai vol natif. Aucun catalogue n’est étendu pour fabriquer ce scénario. Provenance et contrat de file/contrôleur/curseur/reçus : `output/w36-effect-order-contract.json`, SHA `5fe896b2b014091e18616fc638553044151b225246d7d044ac6be0b88f628652`. Aucun nouveau résolveur simultané n’est revendiqué.


**Tumble — source et code privés seulement.** La prochaine tranche DMG 9232–9234 réutilise les limites physiques qualifiées d’Overrun avec deux DEX(Acrobaties) opposés, sans avantage de taille, et une adoption explicite par action ou action bonus. Elle part d’une nouvelle copie du gel Overrun (véritable ancêtre distinct, reçu de scellement SHA `6dba46f552a7a885ddf9bb5c408e6872c74332c461a62feb7ba41760427700d5`). Aucun type/build/runtime n’est lancé pendant la full W34 R3 et aucun état Overrun ancien n’est migré implicitement. La fusion future devra conserver les réparations W34 et les autres branches W35. Capacités de monstres et glace mince restent reportées.


**Tumble — gel privé désormais vérifié.** Types MCP/Next et build passent, ainsi que **23/23 ciblés** (douze nouveaux parcours publics Tumble et onze Overrun), puis une vraie reprise du binaire Overrun antérieur via SQL. Delta SHA `f04a100a7fe7eb9b0becb2f63becf929c2d10345de369ca282402e98a2812dbe`, handoff SHA `8fe0d1ccd969a6bc2b484df49612de828eba5ca96cbb486bf0c98721e87460a9`. Les tentatives restent propres à chaque variante : un Overrun raté n’interdit pas un Tumble utilisant l’autre coût disponible. Aucune migration implicite de reçus Overrun. Les brouillons d’intégration W36 utilisent les deux ancêtres réels distincts, sans encore créer de candidat commun ni annoncer une publication W35 ; leur revue est en cours.


<!-- END:W36-PREPARATION -->





**W36 — premier candidat conservé, fixture croisée corrigée avant la full.** Le candidat commun R1 (`output/w36-integrated`, manifeste SHA `c760cc1b9e677dcc00e2554b629d5189889327a2b12069d702323dcb8eb775d5`) passe types/build, mais son premier test croisé échoue : il comparait un état natif à un état API après la préparation normale de `narrationFacts`. Sources, binaires, logs et helpers R1 sont conservés, sans suite complète ni publication ; reçu `output/w36-r1-superseded.json` SHA `330c65a3ebecd64587e9a60b9ef1a291a4e2639425c491619009e98bd66e3077`. Le parent R2 compare désormais l’état API entier avant/après la consultation documentaire, sans retirer de champ mécanique ou narratif. Il passe **1/1** en diagnostic externe sur le moteur R1 inchangé (1 368 sources et 1 947 binaires vérifiés) ; preuve SHA `22c86461aea65a514e0b99c46de3669a3bad89cb2c4567ec3d88c37d30b7c6c6`. Le nouveau candidat R2 reste à créer et à vérifier ; ce diagnostic n’ajoute aucun test standard ni résultat global.





<!-- BEGIN:W37-PREPARATION -->


**Contrat futur W37 — Cleaving Through Creatures, sans code.** La lecture ciblée du DMG 2014, lignes 9242–9246, et du résolveur d’attaque existant prépare cette variante de `DMG-OPTIONAL-RULES`. Décision utilisateur explicite reçue : l’attaquant active le clivage et peut arrêter sa chaîne à chaque étape, même avec d’autres cibles admissibles ; chaque cible supplémentaire reste choisie explicitement. Cette permission d’arrêt est une convention utilisateur distincte du texte imprimé. Les contrôles de portée depuis l’attaquant, du même jet initial, des PV antérieurs et du surplus doivent encore être contractualisés puis implémentés et testés. TempHP, résistances/réductions et autres branches non représentées ne seront pas ignorés. Provenance : `output/w37-cleaving-user-decision.json`. Aucun clivage, nouveau pouvoir de monstre, build ou test W37 n’est encore revendiqué.


**W37 — premières preuves privées, aucune livraison.** Cleaving est écrit dans une copie indépendante depuis W34 R3, avec neuf cas standard dont un complément explicitement contrôlé de réserve bardique ancienne, sans producteur public artificiel. Les types/build R1 passent ; ses premiers ciblés donnent 7/9 et la vraie reprise ancienne via SQL passe. Une fixture d’initiative et un véritable garde de transition placé trop tard sont corrigés dans une copie R2 distincte : le refus de fin de tour précède désormais tout journal ou coût. Cette R2 n’est pas encore compilée ni exécutée pendant la full W35. L’interprétation du critique initial conserve le comportement existant ; la cible additionnelle et l’arrêt restent explicites.





**W37 — glace glissante forcée, gel privé.** Source DMG 4352–4354 et décision utilisateur antérieure : uniquement sous initiative réelle. La tranche qualifie Shove Aside vers une vraie case glacée, puis un contact causal persistant résolu par DEX(Acrobaties) DD 10 ; l’échec met à terre, sans dépenser de déplacement de la cible. Autres poussées, téléportations, modes ou dangers non qualifiés restent refusés avant coût. Le gel R2 donne **22/22 ciblés** : cinq nouveaux parcours publics dont POST, dix Shove Aside et sept glace existants ; les types/build R1 restent valables par identité exacte des sources TS et binaires, seules trois fixtures CJS étant corrigées. Delta SHA `9a56fa73c57257f29276f499aef7c28e882076ad959ba1431acf75a2d16c4c86`. Aucun nouvel outil ni glace mince ; la full commune W37 reste à effectuer après intégration entière.


<!-- END:W37-PREPARATION -->





**W37 — première full rouge, candidat et preuves conservés.** Après la suspension prolongée de l’environnement, le bilan réel du 8 novembre à10:01UTC donne **3 047/3 052 réussis, cinq échecs, zéro annulé/ignoré/todo**. Tous les échecs affichés sont des timeouts : un sous-processus de corpus limité à300s et quatre requêtes MCP à60000ms, avec durées compatibles avec la suspension. Cela ne prouve pas les mécanismes sains : les cinq rejeux ciblés restent nécessaires. Résultat SHA `f704c2897611242213fb53a6a1c93697f2e674c49d53050b7c43b1bddf77a9f1`, journal SHA `6c5f326757098709a880753e7cc091ec1e6b2a0407139d9b4d149d41c8acb264`. Aucun mock exécuté, aucune publication W37, aucun montant de mock annoncé. Sources/binaires C4e et les cinq phases vertes antérieures restent inchangés. Un diagnostic ciblé à un worker, puis une reprise à concurrence bornée sans modifier règles/fixtures/timeouts, sont en préparation après conservation exacte de R1.





**W37 — diagnostic ciblé des cinq timeouts vert, reprise complète à préparer.** Le 8 novembre à 10:15 UTC, les cinq cas initialement en timeout passent individuellement, à un worker, avec leurs assertions et seuils inchangés : **5/5, zéro échec**. Le corpus se termine en environ 44 secondes. Résultat réel `output/w37-timeout-diagnostic-r1/result.json`, SHA `599bd0f9c2c74f625e393d0239bf6b0fd69787f602ddf3944d6e4df15bdd3d70` ; lanceur source R2 SHA `fe2037f22a18f7bcc42711fd669d1be48caa778dd96cc8e6be93aed88e20f31c`. Cartes complètes des sources et binaires C/ROOT vérifiées avant et après, octets inchangés. Ce diagnostic ne valide pas la suite complète. La revue du lanceur de reprise a trouvé trois références incohérentes avant toute exécution (révision du diagnostic, registre courant opposé à son archive historique W36, chemin du rapport ROOT) ; correction bornée du lanceur en cours, sans changement du moteur. R1 restera archivée avec ses octets et empreintes d’origine avant une nouvelle suite complète limitée à deux workers, puis mock seulement si elle réussit. Aucune archive déplacée ni reprise lancée à ce stade.





**Consigne utilisateur du 8 novembre — arrêt après W37.** Terminer diagnostic, validation complète, publication et clôture de ce seul lot, puis arrêter. Les préparations W38, Mark, vente magique et Disarm sont conservées sans lancement ni poursuite ; un nouvel audit et ses priorités seront décidés ensuite par l’utilisateur. Aucun audit global nouveau n’a été engagé.








**W37 — candidat commun créé après W36 réellement clos.** Les deux gels finaux sont fusionnés à trois voies sur W36 R2 publiée, avec leurs vrais ancêtres W34 R3. Les neuf conflits et leurs 18 régions correspondent exactement aux propositions relues ; les acquis W35/W36 et les six anciennes corrections Unicode sont conservés. Approbations SHA 515daa07b66e763f4f48129b1e57e7e09b25043392d053a9d32c1d5050552542, revue indépendante SHA 93149a34008df6cadefd31cbb8c1cf3ceec39df40fdfdb4ad4f05dc2a28bc558. Le candidat physique output/w37-integrated contient 1 380 sources et conserve initialement les 1 947 binaires W36 ; types MCP/Next et compilation MCP réussis, aucun résultat W37 global anticipé. Son parent croisé source utilise des corps et dés réels : Aside vers glace, résolution explicite du contact, seconde attaque restante puis carry/stop clivage, SQL et rejeu. Le premier diagnostic croisé sur le moteur commun passe **1/1**, avec les 1 380 sources et 1 959 binaires inchangés (log SHA 9a6d16b0b5872461c29c3e570d48d23363b351fe4871a5040bf9e5f587c2f75c) ; il ne crée aucun standard supplémentaire au-delà du parent déjà prévu. Les ciblés communs passent réellement **641/641** sur 97 fichiers, dont les 92 hérités de W36 (log SHA `feebcfb9b19444b0e438fc10160fba6bf00062c21ebad340b424836809f904b6`). Inventaire du candidat : **442 outils uniques / 12 domaines vérifiés** ; build Next Webpack réussi. Readiness SHA `70c216db521b492f1252526879bc3ab5d3e692fcc04a1caf9cb93826b3e8d365`. Après tout le lot prêt et préflight vert, la première full commune a démarré le 7 novembre à **21:32:20 UTC**, seule, sur le manifeste `4e4d0b7999d4afaf808432be3bb212166cfbef6c52abfc2f031396e0777431e6` ; plancher dérivé 3 052, aucun résultat global ni publication encore anticipé. Les agents poursuivent seulement des préparations et revues source.








**W37 — clivage R2 gelé après validation privée.** Types MCP/Next/build verts, **9/9 tests standard** (huit publics et un complément contrôlé de réserve bardique ancienne), puis vraie compatibilité W34 R3→SQL→R2 **1/1 séparée du glob**. Aucun octroi bardique public artificiel ni injection de PV, dés, coûts, cible ou curseur. Le guide seul est finalisé après ces résultats ; moteur, tests et binaires sont restés identiques pendant et après les exécutions. Delta SHA `965ef0824214b176f6d230a0511fe0c10199430b84a98ae6787af92df9987156`, handoff SHA `7e5eb99afc713a233c8a34d699c112c27e4d78af55e8b25d6ec05930d77f79a6`. Neuf propositions d’union source avec W36/glace ont reçu deux relectures, mais restent conditionnelles aux futures préimages officielles ; aucune approbation, full ou publication W37 anticipée.





<!-- BEGIN:W38-PREPARATION -->


**W38 — repos court réel des PNJ après poursuite, sources seulement.** La prochaine dépendance de `DMG-CHASES` vise le retrait des seuls niveaux d’épuisement gagnés en poursuite après un repos réel (DMG 8189 ; durée du repos court PHB 5493–5497 utilisée comme dépendance existante). Le contrat privé `output/w38-npc-chase-rest-contract.json` SHA `6e9a0aeddeaea99b8e7a2804d8e8b1157789092572b113332dabb17a41cc2c16` exige une identité PNJ réelle, au moins 3 600 secondes observées contiguës, activités explicites et reçu lié à la période ; aucun soin ni ressource de PJ. Six outils et quatre parcours publics sont écrits mais non compilés/exécutés. La revue ciblée constate qu’un reçu réservé de retrait pourrait survivre à la suppression de son registre de repos ; une révision distincte ajoute le lien inverse, sans modifier les anciens reçus de poursuite. Provenance : `output/w38-npc-chase-rest-review-razorvine.json` SHA `7a8ba31a5fb0b924a78fab854d94e58c950976b7b64c6ddcf0d367fe3a5d4b1a`. Aucun résultat W38 livré ni audit global.


<!-- END:W38-PREPARATION -->





**Prochain périmètre commun W38 — deux tranches privées réunies, pas encore intégrées.** Le repos PNJ du privé W38 et le service communautaire du privé W39 seront fusionnés dans le même lot commun afin de lancer une seule full après le lot entier prêt. Les deux gels verts et leurs vrais ancêtres W34 R3 restent inchangés : quatre et cinq nouveaux publics privés, zéro nouveau contrôlé, six et zéro nouveaux outils. Les douze domaines W37 incluent déjà `chases` et `xge_religious_service` ; aucun domaine nouveau inventé. Plan source combiné SHA `7cf529d6cbeabdc409901e3e076738d32f8e4c44ca22cf0b7c23678ce22f014d`. L’alternative singleton et son finaliseur sont conservés sans activation ; les nouveaux helpers combinés attendent leur revue et les véritables preuves W37.





**Second parent commun W38 — horloge communautaire et repos distinct, non exécuté.** CJS SHA `d5fdefd2b3b0662c67efab34cfd907b955350d728e03f96d4e81a27e1ff30f91`, plan SHA `ff79e99d2eaea0ee46cecd48bed155a5df77d947f60f6f2a14138fac124559e5`. Un seul parcours public prévu : vraie fatigue de poursuite, attente réelle avant début du repos pour laisser expirer Dash sans effacer d’effet, puis service du PJ pendant huit heures. Le repos PNJ déjà commencé doit rester non crédité jusqu’à observation explicite de son véritable intervalle léger ; identité/corps/journaux/effets/activité sont comparés intégralement et le retrait reste limité à la poursuite. La même vraie semaine communautaire se poursuit avec choix Religion, faveur, SQL et rejeux ; aucun repos rétroactif ni aide fabriquée. Source relue par le parent, mais syntaxe et mécanique attendent encore une véritable exécution après le créneau exclusif W37.








**W38 — préparation de pipeline R2, aucune activation.** Les producteurs source sont portés sur le vrai format du handoff PNJ R4, avec héritage complet des futurs ciblés W37 dérivé seulement de ses preuves réelles. La première revue découvre en source une variable hors portée dans l’inventaire, avant toute phase. Une copie R2 distincte corrige une seule ligne par projection locale du support déjà validé ; peer non bloquant SHA `f00526c05561bb891a1473ba30667e8144599c8432fc375de5e7c9936248a391`, AST3/3 uniquement. Un finaliseur source R3 SHA `96b2bc51ee0b5c3c5a23eb9b7c390925ac6f58c67bec9af50058a835b85f2cd6` conserve le brouillon fermé jusqu’aux véritables publication/clôture/post-vérification W37 ; aucun import de producteur ni changement de configuration/candidat n’a été exécuté. Ne pas confondre cette préparation avec la livraison du repos PNJ.








**W38 — parent commun préparé, source et syntaxe uniquement.** Un unique parcours public prévu réutilise le même PNJ ayant réellement gagné sa fatigue après cinq Dash, puis un demi-repos, une entrée réelle en combat et Shove Aside sur glace W37. Il doit vérifier les refus sans mutation avant résolution du contact, SQL, l’observation explicite de l’activité interrompant le repos, puis un nouveau repos entier qui retire uniquement la fatigue de poursuite. CJS SHA `667c89ec1ac9c858bcd960b5e33951293e2cbe20134f577a7b301f17b11b2629`, `node --check` réellement exit0 ; aucun runtime anticipé. Cette séquence combine génération de combat et déplacement forcé : elle ne prouve pas isolément la détection d’un déplacement hors combat encore non exercée. Les deux unions source conditionnelles W38 conservent W37 et attendent les vraies préimages après publication. Six outils ajoutés au domaine `chases` existant, aucun nouveau domaine inventé.








**W38 — correction relue, validation encore à venir.** La préparation R2 SHA `18121855343a74a63686e471b6a9d78d017bfd4b66090f2ad5a0d86d89c16e79` conserve les préimages du draft et ajoute la liaison inverse pour la seule nouvelle famille de reçus réservés `npc-chase-rest`, y compris si tout `chases` est absent. Trois négatifs SQL sont écrits à partir d’une vraie complétion, sans résultat positif injecté. La relecture indépendante R2 ne relève plus de défaut dans ce changement (`output/w38-npc-chase-rest-review-razorvine-r2.json`, SHA `2536b736d20612db81b39bdbb54a47fd5183e7114f0b69d93171aef42046ec3a`). Aucun type/build/test de cette tranche n’a encore été exécuté.





<!-- BEGIN:W39-PREPARATION -->


**W39 — prosélytisme communautaire de Xanathar, sources en préparation.** Prochaine action concrète de `XGE-DOWNTIME-SOCIAL`, source Xanathar 2333–2363 et dépendance de semaine 1987–1989. Le prosélytisme reste un service au temple, avec accès et croyances/ethos alignés ; jets, faveurs globales, plafond et complications existants sont conservés. Le contrat `output/w39-community-religious-service-contract.json` SHA `d6bf88cf1fd263269e02582d5b9396aab955e41bf7ab7668b75ec53f556a787b` distingue les limites techniques proposées : adoption au vrai temple, efforts sur un point communautaire mesuré avec interlocuteur réel, puis retour au temple pour la résolution. Aucun converti, attitude, secret, PNJ, service tarifé ni aide automatique n’est produit. Une copie privée part exactement du manifeste W34 R3 ; extensions des outils existants seulement, sans migration des anciens reçus. Aucun type/build/runtime ni livraison W39.





**Contrats futurs conservés, sans code.** DMG2014 Mark 9218–9222 : attaque mêlée explicitement marquée même ratée, avantage seulement sur OA, gratuité distincte de la permission de réagir, quota par véritable tour global et échéance à la fin du prochain tour du marqueur. Le raccord doit séparer permission et ressource dans les fournisseurs de réaction ; pas de sort ni capacité supplémentaire (`output/dmg-mark-contract-brewing.json`, SHA `963daeaa6dee981b8a7e2d0cf6b01cca89f2b0375aaa4d34503ccf3c8c355c74`). Le contrat `MAGIC-EQUIPMENT-SLOTS` est également conservé : les objets magiques appariés n’ont pas de modèle actif qualifié dans le catalogue examiné ; aucune paire ni bonus inventés, et aucune prétendue limite imprimée de deux anneaux. Ces contrats ne valent pas implémentation.


<!-- END:W39-PREPARATION -->





**Découverte croisée de préparation W40 — admission Mark/Cleaving non atomique, source seulement.** La preview à trois voies sur le futur cumul W38/W39 identifie qu’une réservation de clivage pourrait rester ouverte si Mark refuse ensuite un vrai tour importé sans témoin OA ; inverser les appels laisse le risque réciproque quand une cible déjà blessée reste admissible pour Mark mais refuse le clivage. La région `hero-combat.ts` reste bloquée ; aucune union ni livraison mécanique n’est revendiquée. Provenance `output/w40-prepublication-on-w39-source-review/combined-admission-source-finding.json`, SHA `f2b569837ea049b3d3b8226e5aa951591a57a61c4ca546f3ff29020c64380d4d`. Proposition technique : validations pures conjointes avant les deux réservations, reprise tenue comprise ; revue et code distincts en préparation, pas une exclusivité RAW inventée entre variantes.





**W40 — proposition conjointe distincte, non validée.** Trois sources TypeScript extraient les deux admissions pures, y compris une reprise tenue, avant toute réservation ; chaque commande conserve ses vrais `cleaveId` et `markId`. Revue source conditionnelle SHA `3f466bf63fda5439333a56ffc376e69d33679dc5a455d83bc7d2ac8d7c4053b6`, aucune compilation/exécution. Deux nouveaux publics et un nouveau complément contrôlé de réserve bardique ancienne sont préparés séparément ; la vraie sonde ancien W37→SQL reste externe au glob et ajoute zéro standard. Les trois scénarios sont relus en source, pas réputés passés ; leur contrat de lancement externe reçoit une révision séparée pour chemin absolu/cwd exact. Aucun profil, PV, dé, coût, résultat, pending ou curseur positif injecté hors l’unique réserve legacy explicitement signalée.








**W39 — préparation de code terminée, non validée.** Le privé contient six fichiers modifiés et deux nouveaux fichiers CJS, cinq parcours publics écrits et une sonde réelle ancienne version→SQL séparée du glob ; les anciens binaires n’ont pas été reconstruits. Préparation SHA `f51428c43eaac60cd7a2a87dbeb69df7b08f049ec0fa05a5b6ab4f2aaef471b2`. Nouveaux efforts communautaires et résolution au temple restent explicites ; les anciens reçus sans mode conservent leur corps. Aucun gel final ni résultat de compilation/test.





**W40 — Mark désormais en préparation source privée.** Depuis le même ancêtre W34 R3, l’option reste désactivée par défaut et ne se choisit qu’avec l’attaque de mêlée réelle. L’attestation prospective du début de tour doit conserver toutes les OA réellement effectuées, sans être fabriquée à l’hydratation ; une adoption sur un ancien tour non attesté refuse avant coût jusqu’à un vrai début observé. La séparation permission/budget de réaction et les témoins internes de mouvement sont en cours. Aucun bénéfice, quota, test ou pouvoir nouveau n’est annoncé livré.





**W36 — copie R2 en validation ciblée.** `output/w36-integrated-r2` est scellé au manifeste SHA `49e46e00e7a17d8952e779e9e66fdd5fe5c18fa031ce0d2f6af2a85fa8a26947` : 1 368 sources et 1 947 binaires. Types MCP/Next et build passent. Les binaires sont exactement ceux de R1 ; l’unique différence de source est le parent CJS corrigé. La cohorte ciblée commune est en cours avec le parallélisme par défaut de Node, pas un worker unique. Inventaire et build Next attendent le résultat ciblé conformément au producteur ; aucune full R2 ni publication W36 n’est encore déclarée.





**W38 — premières validations privées et limites du témoin.** R2 s’arrête au premier contrôle MCP sur TS18048, lecture de `bonusActionUsed` optionnel. R3 corrige exclusivement cette lecture par accès optionnel, dans une copie distincte ; les 1 355 autres sources restent exactes. Types MCP/Next et build R3 passent ; les quatre standards donnent **3/4**. L’échec provient du déplacement exploratoire demandé à un PNJ improvisé sans permission `reactive.capabilities.move` (provenance ciblée `lib/navigation.ts:91`), sans extension de cette permission pour satisfaire le test. Les reprises 3 599+1 secondes/SQL, les liaisons inverses, les refus de corruption et le POST passent. Résultat R3 SHA `c9eb3d4f13a07aa6907b451e549d5b43987a9a996eaad2fc070d5fbd97ced420` ; probe ancien non exécuté après cet échec. Une fixture R4 distincte prépare une activité réelle autorisée pour éprouver l’interruption ; elle ne pourra pas revendiquer un témoin de déplacement. Aucun gel final W38 ni livraison.





**W39 — provenance des nouvelles continuations corrigée en source.** La revue découvre qu’une continuation communautaire sans registre pourrait rester admise si son champ `serviceMode` est conservé avec une valeur invalide. La copie R2 utilise la présence de ce champ nouveau pour son garde, indépendamment de sa valeur, et ajoute deux clones négatifs `null`/invalide ; aucun pending positif n’est injecté. Les commandes anciennes sans ce champ restent inchangées. Préparation SHA `ff5c72d3d0cd776683540861f78d310357a81aec25b41aca269d844dd04ae604`, relecture R2 SHA `e84da00e936c6c13ce192919111365030f80db05c2b7e1f411761d0babc94038`. Toujours cinq parcours publics préparés, aucun type/build/test W39 exécuté.





**Contrat futur — vente d’un objet magique, Xanathar 2437–2473.** Prochaine tranche de `XGE-DOWNTIME-MARKET`, depuis un objet physique déjà pris en charge et un marchand réel financé ; semaine de travail, 25 po, Persuasion, offre et acceptation restent des événements distincts. Décisions utilisateur reçues pour l’activité entière, pas par objet : toute Persuasion ≤ 10, y compris zéro/négatif, donne une offre de 50 % du prix de base en gardant le vrai jet et la complication ; les 25 po sont payées au premier effort réel de huit heures, sans remboursement automatique à l’abandon. Ces conventions ne sont pas présentées comme des précisions imprimées absentes de Xanathar. Provenance : `output/xge-magic-sales-user-decisions.json`. Aucun acheteur, bourse, vente, objet ou paiement automatique, aucune validation ni livraison de ce contrat.





**W36 — full R2 réellement démarrée après préparation entière.** Les types MCP/Next, builds MCP/Next Webpack, **626/626 ciblés dans 92 fichiers** et inventaire réel de **441 outils uniques / onze domaines** passent. Les 89 fichiers ciblés W35 sont conservés. Readiness SHA `87545c4a0b645284c2bc7a909d7f61a8e6d233a16e8a6dc690846ef27058d43d`, puis préflight vert lié au même manifeste R2 ; la full suivie du mock commence réellement le **7 novembre à 19:44:51 UTC**. Sources, binaires et producteurs restent figés ; aucune autre compilation ou exécution privée pendant cette full. W35 reste la version publiée jusqu’aux contrôles finaux et à la copie vérifiée.





**W38 — gel privé final R4.** Les **4/4 parcours publics** et le vrai passage ancien binaire W34 R3→SQL→W38 **1/1 hors glob** passent. Types/build réels R3 sont réutilisés avec identité exacte de toutes les sources TS et des 1 939 binaires ; R4 ne corrige que la fixture d’interruption et son guide. Le nouveau témoin exécute réellement Athletics avec le même PNJ (STR 11, modificateur 0, désavantage d’épuisement), puis qualifie son activité éprouvante sans déplacement ni durée inventés. La détection d’un déplacement exploratoire reste non éprouvée. Guide seul finalisé après les exécutions, sans modifier moteur/CJS/binaires. Delta SHA `8b9425a43ab30bb5db687a8c7c829f56eb2ce68deb4e0518ebfc861acdd7874e`, handoff SHA `2a8c920a2030e21ff6bd4e4e5ca5f47d40a820fa85c2719a45194a47a047a9d8` : six outils et quatre nouveaux standards publics, aucune full commune W38 ni publication anticipée.





**W40 — correction source des fenêtres Mark.** La revue ciblée trouve deux blocages : une commande tenue non marquée pourrait adopter Mark après son dé sans registre propriétaire ; le verrou de corps d’une attaque tenue empêcherait ses propres dégâts à la reprise. Le cadre initial manquait aussi de son témoin réciproque. Une copie R2 distincte corrige ces trois points et reçoit une confirmation source (`output/w40-mark-source-review-razorvine-r2.json`, SHA `69b3b54a8687b66946bf7981cd8b8cc6f1df73e842752d45a4b7d6d735e6e665`). Sept parcours publics et un seul complément contrôlé de réserve bardique ancienne sont écrits, tous non exécutés ; aucun octroi Bardic public artificiel, PV, pending, résultat ou coût injecté pour prétendre une réussite. La réserve seule est contrôlée, puis attaques/dés/fenêtres/SQL/reprises doivent provenir des vrais outils.





**W41 — vente magique en préparation source.** Contrat R2 SHA `a20d530ad098c64f504dc1f62b36b1d181f6406e5d8b2709ac482cc5e1ca8a6d` et API proposée SHA `e356674a522b11928533ee21d0030cc2d0b7633dc6537cefa7dde1c7b5e99b3b`, relus avant code. Une copie indépendante part des octets W34 R3. Première tranche : potion de soins commune physique déjà possédée et identifiée, base Xanathar 50 po, offres 25/50/75 po, avec les conventions utilisateur ci-dessus. Les ventes ordinaires et magiques doivent partager le même registre marchand de ventes/offres/gardes et sa vraie séquence ; les frais publicitaires ne financent pas l’acheteur. Au-delà de dix dates, refus technique avant nouvel effet en attendant l’arbitrage futur. Six outils sont proposés mais aucun type/build/test W41 ni livraison n’est encore revendiqué.





**W41 — premier contrôle privé R3 arrêté avant compilation.** Le typecheck MCP donne exit2 : une erreur TS2345 dans `merchant-resale.ts` voit encore la variante magique dans un callback après son refus explicite. Aucun typecheck Next, build, test ou probe SQL de cette tentative n’a été exécuté ; sources et 1 927 anciens binaires conservés. Résultat SHA `0a8e241916fb1439f45a33f2ff7f2aafadeb5d101117ecd6f81a68910b5bae48`. Une copie R4 distincte prépare une capture constante de la valeur ordinaire après le garde, sans assouplir le schéma ni changer les fixtures ; revue et nouvelle validation restent à faire.





**W41 — R4 compilée, premiers nouveaux tests rouges conservés.** Après la correction de typage relue, types MCP/Next et build passent. La cohorte nouvelle donne **1/6** : seul le cas pur de table passe, les cinq parcours publics échouent ; aucune compatibilité ni sonde ancienne version n’a été exécutée ensuite. Le premier s’arrête sur la main non réellement libérée par une fixture lisant le registre optionnel au lieu de la projection active ; les quatre autres sur le rejet d’une association historique d’acquisition créée normalement par `pick_up_item`. Résultat SHA `4a3fdeafebfb5fbbdc7319978d92af739ef87415df2f56e0afc181b973acffcf`. Analyse/correction R5 source distincte en préparation, sans supprimer de mémoire ni prétendre à une vente publique validée.





**W41 — correction R5 relue en source, non exécutée.** Révision distincte SHA `18cb812e8776d8d694b1dac83655c36d068ecc4e9f4ce4c908c5beedfec87e2f`, peer SHA `3d864ed62a16c92bfbd202802b6a6e727f6885f9e633af937ed4db510445a05f`. Une vraie arme initiale est explicitement rangée par la fixture. Le moteur réutilise sans modification le prédicat strict existant d’historique de ramassage ; seuls les deux souvenirs documentaires normaux sont admis, tous les faits actifs/indices/eau/champs étrangers restent refusés. Aucun historique supprimé ni identifiant renommé. Cinq publics et un pur restent préparés, aucun vert R5 revendiqué. Runner source prêt sur les 1 939 vrais binaires R4, avec nouveau build/sceau requis ; aucun lancement pendant la full W37.





<!-- BEGIN:W32-PREPARATION -->


**Historique de préparation W32 — 7 novembre 2026.** Reprise explicitement demandée jusqu’à épuisement du budget ou achèvement du suivi. Trois agents repartent des mêmes octets W31 publiés : 1 249 entrées sources/support et 1 847 fichiers compilés, copies privées `output/w32-potions`, `output/w32-pit` et `output/w32-chases`. Prochaines tranches choisies dans ce registre : potions de soins supérieurs et suprêmes de Xanathar, combats de fosse de Xanathar, et complications de poursuites en milieu sauvage du DMG 2014. Les règles nécessaires sont consultées ponctuellement dans les livres locaux, sans nouvel audit. Les capacités des monstres et la glace mince restent reportées. Les conventions de paiement et de retard des deux nouvelles puissances de potion sont soumises à une décision explicite ; le code indépendant peut avancer. Les suites complètes attendent l’intégration de la vague entière et ses contrôles ciblés. Aucun résultat W32 n’est encore déclaré livré.


**Décisions W32 reçues.** Les fournitures des potions de soins supérieurs et suprêmes sont entièrement payées au démarrage, sans remboursement automatique à l’abandon. Après plus du double de la durée prévue (30 / 40 dates calendaires), l’arbitrage du MJ exige une complication réellement introduite et une nouvelle échéance finie ; les suppléments cumulés sont plafonnés au coût initial de chaque recette (1 000 / 10 000 po), soit un coût total au plus double. Le plafond de 100 po des anciens projets majeurs reste propre à cette recette. Pour le remplacement d’un test de fosse par un jet d’attaque, le 1 naturel échoue et le 20 naturel réussit, sans dégâts ni dépense de munition dans la procédure abstraite. Ces choix utilisateur ne sont pas présentés comme des précisions imprimées absentes des livres.


**Découverte ciblée W32 — vitesse de poursuite.** La vérification publique de la ligne 5 sauvage du DMG a révélé que le facteur de demi-vitesse devait être raccordé aux accesseurs de navigation et de modes de mouvement, en plus du budget de `mcp-server/hero-rules.ts`. Le correctif et ses preuves de distance réelle, Dash et fin de tour sont en validation dans `output/w32-chases`, notamment `tests/dmg-wilderness-chases.test.cjs`. Ce constat est issu de cette tranche, pas d’un nouvel audit ; il n’atteste pas encore une publication W32.


**Revue ciblée W32 — 0 PV et vie réelle.** La relecture des prédicats de transition et de validation de la poussière de poursuite a relevé une confusion entre 0 PV et décès pour les corps mis KO sans être tués. Les nouveaux prédicats doivent lire la vie réelle et conserver le fournisseur d’aveuglement jusqu’à la vraie fin du tour ; un décès effectif doit clore aussi sa provenance historique. Régression publique KO, SQL, fin de tour et soin en cours dans `output/w32-chases/tests/dmg-wilderness-chases.test.cjs`, sans injecter de PV.


**W32 — contrôles communs terminés, suite complète en cours.** Le candidat `output/w32-integrated` est figé à 1 261 entrées sources/support et 1 859 fichiers compilés. Types MCP/Next, builds MCP/Next Webpack, 241/241 tests ciblés sur 35 fichiers et inventaire réel de 417 outils uniques sont verts. L’unique full W32 commence le 7 novembre à 10:51:16 UTC, après ces preuves et la fin des trois tranches. Aucun fichier du candidat n’est modifié pendant full/mock ; W31 reste publiée tant que W32 n’est pas vérifiée et copiée. Sur les neuf nouveaux tests de fosse, sept sont des parcours publics et deux sont des compléments contrôlés de réserve bardique : ils prouvent les vrais dés, continuations et SQL, pas un octroi public préalable (addendum `output/w32-pit-evidence-clarification.json`).


**W32 r1 remplacée avant publication — KO avant son tour.** Deux probes MCP publics confirment un cas supplémentaire : après poussière de poursuite et arrêt réel, un PNJ mis KO par Ready non létal ou le PJ réellement stabilisé à 0 PV voit son prochain slot sauté ; le fournisseur sans durée finie persiste et bloque la sortie de combat. Provenance `output/w32-dust-ko-probe-summary.json` et scripts/logs SHA associés, `canTakeInitiativeTurnInState` et boucle des slots KO. La full r1 a été interrompue, sans verdict complet ; ses sources/binaires et preuves sont conservés dans le gel initial, avec `output/w32-r1-superseded.json`. Seuls les 19 processus descendants du contrôleur de validation ont été arrêtés et vérifiés absents. La copie physique `output/w32-integrated-r2` repart de ces octets vérifiés pour corriger la fenêtre passive réelle et ajouter deux régressions ; elle attend ses types/build/ciblés et une nouvelle full après préparation entière. Aucun W32 n’a été publié.


**W32 r2 — validation commune verte, full relancée.** Les 1 262 entrées sources et 1 859 binaires sont figés dans `output/w32-integrated-r2`. Types MCP/Next, builds MCP/Next Webpack, 243/243 ciblés sur 36 fichiers et inventaire réel 417 outils sont verts ; les cinq preuves sont vérifiées avant la nouvelle full r2. Le correctif ne réserve que la vraie fenêtre passive de poussière d’un vivant stable à 0 PV : aucune action ni nouveau d20 de poursuite. Les deux régressions publiques NPC/PJ et les guides poursuites/multi-cartes sont intégrés. R1 reste une tentative annulée ; cinq cas devenus rouges pendant son interruption passent isolément sur ses octets inchangés, sans autre correctif. ROOT reste W31 jusqu’à la réussite full/mock et à la copie vérifiée de r2.


<!-- END:W32-PREPARATION -->





<!-- BEGIN:W31-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W31 intégrée le 7 novembre 2026.** Fièvre hilare du DMG 2014 et trait de folie indéfinie persistant, arbitrage explicite du retard de brassage et horaire de recharge local aux objets sélectionnés de Xanathar, dans les périmètres partiels ci-dessous. Les types MCP/Next, les builds MCP/Next Webpack et les 260 tests ciblés passent. La suite complète a commencé après intégration du lot et confirme **2906/2906 tests**. Le mock confirme **30/30 tours** à 0 $. Un processus ROOT neuf expose **407 outils uniques** et lit les trois domaines. Les neuf fichiers de règles conservent leurs empreintes W30. [Rapport W31](rules-audit/validation-wave31-2026-11-07.json).


<!-- END:W31-PUBLISHED-SUMMARY -->





<!-- BEGIN:W31-PREPARATION -->


**Historique de préparation W31 — 7 novembre 2026.** Trois privés repartent des octets W30 publiés et vérifiés, avec 1 234 entrées sources/support et 1 835 binaires. Les tranches choisies dans le registre sont la fièvre hilare du DMG 2014, l'arbitrage explicite des retards de brassage et le choix d'un autre horaire de recharge sur une carte avec aube de Xanathar. Les passages nécessaires sont lus ponctuellement, sans nouvel audit global ni reconstruction du backlog. Les capacités des monstres et la glace mince restent reportées.





Décisions utilisateur reçues pour W31. Le supplément de brassage est plafonné à 100 po cumulées sur le projet, avec complication réellement introduite et échéance finie. Le nouvel horaire de recharge reste local à la carte et aux objets explicitement sélectionnés, sans rattrapage au retour. La troisième sauvegarde de rétablissement ratée de fièvre hilare produit un trait officiel de folie indéfinie persistant, sans action mécanique inventée. Les répétitions de sauvegarde d'une crise utilisent le DD exact au début de cette crise.





Décision de chevauchement reçue ensuite. Un nouveau stress externe garde son jet et ses dégâts et, en cas d'échec, redémarre la minute d'incapacité. Les dégâts psychiques de la crise elle-même appartiennent à la conséquence du même événement et ne créent pas de boucle récursive. La guérison de la folie indéfinie reste hors périmètre tant que son sort source n'est pas actif. Après interruption de quota, les trois copies privées ont été retrouvées et les agents relancés sans réinitialisation ; sources et binaires ROOT correspondent encore à W30.





Décision d'incubation confirmée à la reprise. Les crises de fièvre hilare commencent seulement après l'apparition des symptômes, une fois écoulées les 1d4 heures source. La qualification réelle humanoïde/gnome reste explicite et n'accorde aucun bonus racial. Les témoins privés Xanathar ont repris sur leurs octets conservés ; les validations et l'intégration communes W31 restent à effectuer.





Les types, builds et ciblés restent privés. La suite complète attend les trois tranches intégrées et leurs contrôles ciblés/croisés prêts. Cette note conserve l'étape antérieure à la publication W31 vérifiée ci-dessus. Aucun processus de partie n'a été arrêté.





**Validation commune W31 prête.** Les trois gels ont été fusionnés et leurs deltas vérifiés, avec 1 248 entrées sources/support et 1 847 binaires scellés. Types MCP/Next, build MCP, build Next Webpack et 260/260 tests ciblés dans 40 fichiers passent. Le candidat expose 407 outils uniques et les trois domaines sont réellement lus. Quatre croisements publics vérifient retard et paiement, recharge locale, apparition des symptômes, POST et pause/reprise de trois secondes du même round après SQL. Un vrai état W30 et ses 21 775 octets de registre restent inchangés en passant par SQL vers le candidat commun W31. **La suite complète W31 a réellement démarré le 7 novembre à 09:11:43 UTC**, après précontrôle vert lié aux mêmes sources et binaires. Ceux-ci restent figés pendant l'exécution. Mock, vérification ROOT et publication restent requis.


<!-- END:W31-PREPARATION -->





<!-- BEGIN:W30-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W30 intégrée le 7 novembre 2026.** Tirs et lancers bornés contre les ronces-lames du DMG 2014, potion de soins majeurs sur cinq journées et recharge sur plusieurs cartes d'un même plan sans aube de Xanathar. Les types MCP/Next, les builds MCP/Next Webpack et les 310 tests ciblés passent. La suite complète a commencé après intégration du lot et confirme **2873/2873 tests**. Le mock confirme **30/30 tours** à 0 $. Un processus ROOT neuf expose **398 outils uniques** et lit les trois domaines. Les neuf fichiers de règles conservent leurs empreintes W29. [Rapport W30](rules-audit/validation-wave30-2026-11-07.json).


<!-- END:W30-PUBLISHED-SUMMARY -->





<!-- BEGIN:W30-PREPARATION -->


**Historique de préparation W30 — 7 novembre 2026.** Trois privés repartent des octets W29 publiés et vérifiés, avec 1 225 entrées sources/support et 1 827 binaires. Les tranches choisies dans le registre sont les tirs et lancers contre les ronces-lames du DMG 2014, la potion de soins majeurs de Xanathar sur cinq journées et le rattachement de plusieurs cartes au même plan sans aube pour leur recharge. Les contrats sont bornés par les passages locaux des livres, la géométrie mesurée et le registre partagé de travail. Les capacités des monstres et la glace mince restent reportées. Aucun nouvel audit global ni reconstruction du backlog.





La suite complète attend les trois tranches intégrées, les types, le build MCP et les vérifications ciblées/croisées. Les compilations restent privées et les processus de partie ouverts sont conservés. Cette note décrit l'étape antérieure à la publication W30 vérifiée ci-dessus.





**Contrôles communs W30 prêts.** Types MCP/Next, build MCP, build Next Webpack et 310/310 tests ciblés dans 38 fichiers sont verts sur 1 233 entrées scellées et 1 835 binaires. Le processus candidat expose 398 outils uniques et lit les trois domaines. Les deux croisements couvrent le brassage, la recharge sur carte rattachée et la réservation d'identité face au producteur de ronces-lames. La première lecture seule du précontrôle a rejeté un caractère mal encodé dans le lecteur de journal hérité, corrigé sans changement produit ni exécution de suite complète. **La suite complète W30 a réellement démarré le 7 novembre à 06:40:07 UTC**, après nouveau précontrôle vert et scellement des preuves. Sources et binaires restent figés pendant cette exécution. Publication, mock et processus ROOT neuf restent requis.


<!-- END:W30-PREPARATION -->





<!-- BEGIN:W29-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W29 intégrée le 5 novembre 2026.** Ronces-lames et dé d’occurrence des rencontres urbaines du DMG 2014, jeux d’argent de Xanathar livrés dans les périmètres ci-dessous. Le typecheck MCP et Next, les builds MCP et Next Webpack et les 237 tests ciblés passent. La suite complète, lancée après ces contrôles, confirme **2855/2855 tests**. Le mock confirme **30/30 tours** à 0 $. Le processus moteur neuf expose **394 outils uniques** et les trois domaines attendus. Les neuf fichiers de règles gardent les empreintes de W28. [Rapport W29](rules-audit/validation-wave29-2026-11-05.json).


<!-- END:W29-PUBLISHED-SUMMARY -->





<!-- BEGIN:W28-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W28 intégrée le 5 novembre 2026.** Glace glissante et rencontres urbaines du DMG 2014, transcription de parchemins de Xanathar livrées dans les périmètres ci-dessous. Le typecheck MCP et Next, les builds MCP et Next Webpack et les 150 tests ciblés passent. La suite complète, lancée après ces contrôles, confirme **2840/2840 tests**. Le mock confirme **30/30 tours** à 0 $. Le processus moteur neuf expose **384 outils uniques** et les trois domaines attendus. Les neuf fichiers de règles gardent les empreintes de W27. [Rapport W28](rules-audit/validation-wave28-2026-11-05.json).


<!-- END:W28-PUBLISHED-SUMMARY -->





<!-- BEGIN:W27-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W27 intégrée le 5 novembre 2026.** Sol profané du DMG 2014, recharge sans aube et potion de soins normale de Xanathar sont livrés dans les périmètres ci-dessous. Le typecheck MCP et Next, les builds MCP et Next Webpack et les 128 tests ciblés passent. La suite complète, lancée après ces contrôles, confirme **2822/2822 tests**. Le mock confirme **30/30 tours** à 0 $. Le processus moteur neuf expose **376 outils uniques** et les trois domaines documentaires. Les neuf fichiers de règles gardent les empreintes de W26. [Rapport W27](rules-audit/validation-wave27-2026-11-05.json).


<!-- END:W27-PUBLISHED-SUMMARY -->





<!-- BEGIN:W26-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W26 intégrée le 5 novembre 2026.** Eau glaciale du DMG 2014, avis de rencontre et détente de Xanathar livrés dans leurs périmètres ci-dessous. Les types MCP et Next, le build MCP, le build Next Webpack et les 158 ciblés passent. La suite complète a commencé après ces contrôles. Elle confirme **2805/2805 tests** et le mock **30/30 tours** à 0 $. Le processus moteur neuf confirme **369 outils uniques** et les trois domaines. Les neuf fichiers de règles sont épinglés à la baseline de W25. [Rapport W26](rules-audit/validation-wave26-2026-11-05.json).


<!-- END:W26-PUBLISHED-SUMMARY -->





<!-- BEGIN:W25-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W25 intégrée le 5 novembre 2026.** Alarme mentale, peste des égouts et recherche Xanathar sont livrées dans les périmètres partiels détaillés ci-dessous. Les types MCP et Next, le build MCP et le build Next Webpack passent. Les 145 tests ciblés R2 passent, dont les deux croisements et le chargeur de contexte. La suite complète R2 confirme **2782/2782 tests** et le mock **30/30 tours** à 0 $. Le processus moteur neuf confirme **361 outils uniques**. Les deux suites complètes ont été lancées après préparation des trois tranches. R1 a été interrompue après découverte des supports SRD manquants. R2 rétablit ces supports et scelle tous les fichiers de règles avec le même code et les mêmes binaires. [Rapport W25](rules-audit/validation-wave25-2026-11-05.json).


<!-- END:W25-PUBLISHED-SUMMARY -->





<!-- BEGIN:W24-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W24 publiée le 2026-11-05** : `output/mcp-wave24-integrated-20261105`, types MCP/Next, build MCP et build Next sur copie exacte en sortie0 ; **2758/2758 tests**, aucun échec/ignoré/annulé (1514722.4653ms), **30/30 tours mock**, 9scénarios, 71appels, 0USD, objectifs validés (23445ms). **1129 entrées figées**, **1679 binaires publiés**, **1076 chemins sources/config ROOT vérifiés**, 86 fichiers ROOT mis à jour. Un processus ROOT neuf confirme **353 outils uniques**, 22 domaines effectivement lus. [Rapport permanent W24](rules-audit/validation-wave24-2026-11-05.json).





Cette publication part des 1083 entrées de la base W23 ; 47 supports hérités +1 supplément(s), soit 48 readonly, restent préservés. Les 5 métadonnées de capture ne sont pas des sources à publier. Le manifeste de bibliothèque est épinglé avant la copie/build Next ; aucune baseline ROOT tardive ou variante implicite.





Les trois lots **XGE-DOWNTIME-TRAINING**, **PHB-SPELLS-0-4 — Lumière seulement** et **DMG-CHASES** sont **livrés partiellement**, dans les seuls périmètres approuvés ci-dessous. Aucun autre sort du lot PHB-SPELLS-0-4 ni tout son catalogue n’est déclaré achevé. Les cohortes privées, intégrées et croisées recouvrent la full et ne s’additionnent pas. Les 23 nouveaux noms réellement vérifiés sont : `adopt_xge_training`, `start_xge_training`, `work_xge_training`, `resolve_xge_training_complication`, `adjudicate_xge_training`, `replace_xge_training_instructor`, `manage_xge_training`, `complete_xge_training`, `inspect_xge_training`, `record_light_object`, `set_light_object_cover`, `dismiss_light_spell`, `qualify_chase_guard`, `resolve_chase_guard`, `begin_chase`, `chase_dash`, `resolve_chase_turn`, `qualify_chase_complication`, `resolve_chase_complication`, `resolve_chase_escape`, `stop_chase`, `adjudicate_chase_rest_recovery`, `inspect_chase`.





**Décisions et limites conservées** : PHB/DMG2014 par défaut, variantes seulement après adoption explicite ; la formation XGE ne remplace pas implicitement la formation PHB. Les choix, coûts, dépendances et arbitrages effectivement approuvés sont propres à chaque lot. Aucun nouveau statbloc ou pouvoir MM, aucun choix/cible/action MCP fabriqué par le serveur. Identification officielle reste bloquée source, sans DD maison livré comme RAW.





W23 et les préparations W24 ci-dessous sont historiques. La découverte ciblée Light W23 reste conservée exactement dans son contexte d’origine ; sa correction W24 ne réécrit pas cette ancienne preuve. Aucun build ROOT ni arrêt de partie ouverte.


<!-- END:W24-PUBLISHED-SUMMARY -->


<!-- BEGIN:W24-PREPARATION-HISTORY -->


Historique de préparation, décision ou dépendance W24 : ce contenu conserve exactement son étape et ses limites d’origine, antérieures à la publication vérifiée ci-dessus. Ses formulations « en cours », « non livré » ou « reste à faire » sont historiques.





**W24 en cours — 5 novembre 2026** : reprise de W23 publiée et vérifiée (2689 tests,330 outils uniques). Trois branches privées : **XGE-DOWNTIME-TRAINING**, **PHB-SPELLS-0-4 — Lumière** et **DMG-CHASES**. Contrats et passages ciblés PHB/DMG2014 et Xanathar avant implémentation ; aucun nouveau balayage des livres ou du backlog. Identification officielle toujours bloquée source ; nouvelles capacités de monstres reportées.





Les1083 entrées de base incluent le dernier rapport W23 ; les1627 binaires et la baseline ROOT initiale sont copiés et vérifiés avant les changements. Aucune compilation ROOT ni interruption de partie. La suite complète attendra fusion des gels, types/build MCP, ciblés/croisés, inventaire et build Next sur copie exacte prêts. Aucun résultat W24 n’est encore annoncé comme livré.





La première couche, Lumière, est fusionnée dans la copie privée : 33 fichiers/63 régions avec relecture identique au gel, 19/19 nouveaux tests et 112/112 régressions privés (cohortes qui se recouvrent). La formation est également fusionnée : 19 fichiers/24 régions gardées, 19/19 nouveaux et 41/41 compatibilité privés, sans cumul avec les futures cohortes communes. La revue parent conserve les deux couches sur leurs sept fichiers partagés ; le refus d’une ancienne ancre textuelle contiguë Lumière après insertion des noms Training est préservé et vérifié régionalement, aucun patch forcé. A termine les poursuites urbaines ; aucune full W24, publication ROOT ou validation commune finale n’est encore revendiquée. B/C sont réaffectés aux revues de validation et d’intégration, la préparation externe de clôture étant figée.


Les trois gels sont maintenant fusionnés dans la copie commune : poursuites46fichiers/102opérations dont4unions bornées, avec26/26 nouveaux et110/110compatibilité privés. Le fragment de registre A reste une preuve privée, le guide chases est intégré. Le témoin public DeathWard/épuisement6 a prouvé une perte/relance des CON au refus. Le correctif conservateur est fusionné depuis une nouvelle copie commune figée :9fichiers/14opérations,3/3 nouveaux,26/26poursuites et110/110compatibilité avec sources/binaires liés et types/build0. Aucun arbitrage Ward inventé ; nouvellesWard et bonusBardic tenus sousWard restent source-revus seulement. Types/ciblés/croisés communs finaux, sceau et full sont désormais à effectuer ; W24 n’est pas publiée.


La validation commune est verte : typesMCP/Next et buildMCP0,151/151ciblés dans27fichiers dont les deux vrais croisements.1129entrées figées,1679binaires,1076chemins source/config et48readonly ; le processus candidat confirme353outils uniques et22domaines réellement lus. Le build Next TurbopackR1 a échoué sur le resolver Cinzel, copie et preuves préservées ; un build officiel --webpack sur une nouvelle copie exacteR2 est en cours, sans changer fontes/app/source. La full ne commencera qu’après sa vraie sortie0 et l’intégrité ; W23 reste la publication ROOT.


**Full commune W24 r1 réellement démarrée le 2026-11-05T03:36:51.082130+00:00 (UTC)**, après les trois gels et le correctif Ward, types/build0,151/151ciblés, inventaire353/22, sceaux1129/1679 et build NextR2 --webpack0 sur copie exacte. La preuve readiness épingle tous leurs SHA ; le resolver Cinzel TurbopackR1 et ses octets restent conservés comme échec. Aucun nouveau lot ni changement de source/harnas/binaires pendant cette full. Mock puis intégrités, dryrun/publication et processus ROOT neuf restent requis ; aucune livraison W24 n’est encore annoncée.


<!-- END:W24-PREPARATION-HISTORY -->





<!-- BEGIN:W23-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W23 publiée le 2026-11-05** : `output/mcp-wave23-integrated-20261105`, types MCP/Next, build MCP et build Next sur copie exacte en sortie0 ; **2689/2689 tests**, aucun échec/ignoré/annulé (1401305.3261ms), **30/30 tours mock**, 9scénarios, 71appels, 0USD, objectifs validés (16579ms). **1087 entrées figées**, **1627 binaires publiés**, **1034 chemins sources/config ROOT vérifiés**, 59 fichiers ROOT mis à jour. Un processus ROOT neuf confirme **330 outils uniques**, 19 domaines effectivement lus. [Rapport permanent W23](rules-audit/validation-wave23-2026-11-05.json).





Cette publication part des 1050 entrées de la base W22 ; 47 supports hérités +1 supplément(s), soit 48 readonly, restent préservés. Les 5 métadonnées de capture ne sont pas des sources à publier. Le manifeste de bibliothèque est épinglé avant la copie/build Next ; aucune baseline ROOT tardive ou variante implicite.





Les quatre lots **XGE-KNOTS**, **XGE-SPELL-PERCEPTION**, **XGE-DOWNTIME-LEDGER** et **XGE-DOWNTIME-WORK** sont **livrés partiellement** dans leurs seuls périmètres. Le raccord **PHB-GEAR** concerne uniquement l’acquisition de corde. Les cohortes privées/intégrées/croisées et la full se recouvrent : aucun cumul. Les 14 nouveaux noms réellement vérifiés sont : `prepare_phb_rope_stock`, `configure_knot_rules`, `tie_knot`, `resolve_knot`, `inspect_knots`, `inspect_spellcasting_perception`, `adopt_xge_downtime`, `start_downtime_work`, `work_downtime`, `resolve_downtime_work`, `adjudicate_downtime_work`, `settle_downtime_work`, `cancel_downtime_work`, `inspect_xge_downtime`.





**Décisions et limites conservées** : nœuds et temps libre XGE demandent leur adoption structurée explicite ; coût MJ des nœuds, sans état entravé automatique. Perceiving a Caster at Work est une clarification, sans politique OFF : l’absence d’observateurs sélectionnés ne rend pas une incantation imperceptible. Identification officielle reste bloquée source, aucun DD10 maison livré comme RAW. Work conserve son horloge physique, les arbitrages explicites et le droit non monétaire daté sans nourriture/soins/repos/refund implicite. Les détails approuvés et prochains travaux sont propres à chaque lot ci-dessous.





Les nouvelles capacités/statblocs MM restent reportés. W22 et les étapes de préparation W23 sont historiques et leurs preuves restent conservées. La découverte ciblée Light demeure hors périmètre livré. Aucun build ROOT ni arrêt de partie ouverte.


<!-- END:W23-PUBLISHED-SUMMARY -->


<!-- BEGIN:W23-PREPARATION-HISTORY -->


Ces notes sont historiques et antérieures à la publication W23 vérifiée ci-dessus ; leurs indications temporelles décrivent uniquement leur étape d’origine.





**Historique de préparation W23 — 5 novembre 2026** : reprise de W22 publiée (316 outils uniques vérifiés). Trois branches privées : **XGE-KNOTS**, **XGE-SPELL-PERCEPTION** et **XGE-DOWNTIME-LEDGER/WORK**. Les contrats et passages ciblés PHB/DMG 2014 et Xanathar sont vérifiés avant intégration. Le passage local « Identifying a Spell » contient un remplacement explicitement maison : aucune implémentation de cette proposition comme règle officielle ; obtenir la source officielle ou conserver ce sous-périmètre bloqué.





La suite complète ne sera lancée qu’après fusion de tous les gels, types/build MCP, tests ciblés/croisés, inventaire et build Next de la copie exacte prêts. ROOT n’est ni compilé ni publié pendant la préparation ; les processus de partie existants sont conservés. Nouvelles capacités de monstres reportées. Aucun résultat W23 n’est encore annoncé comme validé.


<!-- END:W23-PREPARATION-HISTORY -->





<!-- BEGIN:W22-PUBLISHED-SUMMARY -->


**Ancienne livraison vérifiée — W22 publiée le 2026-11-04** : `output/mcp-wave22-integrated-20261104`, TypeScript MCP/Next, build MCP et build Next sur copie exacte en sortie 0 ; **2627/2627 tests**, aucun échec/ignoré/annulé (1266239.4655 ms), **30/30 tours mock**, 9 scénarios, 71 appels, 0 USD, objectifs validés (24970 ms). Les **1054 entrées figées**, **1587 binaires publiés** et **1001 chemins sources/config ROOT vérifiés** correspondent aux preuves ; 84 fichiers sources/config ROOT mis à jour. Un processus ROOT neuf confirme **316 outils uniques**, 16 domaines de support effectivement lus. [Rapport permanent W22](rules-audit/validation-wave22-2026-11-04.json).





Cette publication part de la base historique de 1010 entrées W21. Le supplément préexistant `instrumentation.ts` reste une entrée readonly distincte de cette base : 47 supports hérités + 1 supplément(s), soit 48 entrées readonly, jamais écrasées sur ROOT. Les 5 métadonnées de capture ne sont pas des sources à publier. Build Next et ses fichiers générés sont isolés dans la copie exacte ; aucune baseline source ROOT n’est recapturée tardivement.





Les trois lots **XGE-FALLING**, **XGE-ADAMANTINE** et **DMG-CALENDAR** sont **livrés partiellement**, dans leurs seuls périmètres et limites ci-dessous. Sources PHB/DMG 2014 et Xanathar fournies, sans nouvel audit global. Les cohortes privées, intégrées, de croisements et la full se recouvrent : leurs résultats ne s’additionnent pas. Les 11 nouveaux noms réellement vérifiés sont : `configure_campaign_calendar`, `record_calendar_reference`, `inspect_campaign_calendar`, `prepare_adamantine_stock`, `prepare_phb_launcher_stock`, `inspect_adamantine`, `configure_falling_rules`, `begin_xge_fall`, `resolve_xge_fall_descent`, `arrest_xge_fall`, `inspect_xge_falling`.





**Décisions utilisateur conservées** : PHB/DMG 2014 and Xanathar only; new monster capabilities deferred. Chute hors combat : Refuser ces chutes avant tout déplacement tant qu’un suivi de tours réel n’est pas disponible. Sans adoption de l’option, le PHB reste inchangé. Acquisition adamantium : Vendre les versions déjà fabriquées et reporter la transformation ; No conversion or coating service for already owned ordinary equipment. Calendrier : MJ explicit definition and anchor, no default adventure date or worldTime rebase. Options seulement après choix structuré explicite ; aucun événement, effet, temps ou ressource implicite.





**Priorité et historique** : les nouvelles capacités/statblocs MM, dont Tunneler/fouissement, restent reportés. W21 est l’ancienne publication vérifiée et conserve ses preuves ; les notes de préparation W22 ci-dessous sont historiques. Aucun build ROOT ni arrêt de partie ouverte. Les statuts partiels n’annoncent pas les autres sous-lots comme achevés.


<!-- END:W22-PUBLISHED-SUMMARY -->


<!-- BEGIN:W22-PREPARATION-HISTORY -->


Ces notes décrivent les étapes antérieures ; la publication vérifiée ci-dessus les remplace dans son seul périmètre.





**W22 assemblée — validation finale PHB/DMG 2014 et Xanathar** : trois privés repartent des sources W21 publiées, avec 1 010 entrées sources/support et 1 519 binaires identiques. A prend **XGE-FALLING** (options de cadence et de récupération séparément adoptées, XGE944–960 et socle PHB) ; C prend **XGE-ADAMANTINE** (matière réelle des armes/munitions, critique contre objet et surcharge source, XGE986–992) ; B prend **DMG-CALENDAR** (date/ancre de campagne explicites, cycles et observances, DMG1122–1183). Contrats et lectures ponctuelles avant code ; aucun audit global ni scanner. Les nouvelles capacités de monstres restent reportées. Aucun de ces lots n'est encore livré ; W21 demeure la dernière publication. Copie d'intégration : `output/mcp-wave22-integrated-20261104` ; privés `output/mcp-xge-falling-20261104`, `output/mcp-xge-adamantine-20261104`, `output/mcp-dmg-calendar-20261104`. Aucune compilation ROOT ni arrêt de partie ouverte.


**Décision utilisateur W22 — chute hors combat** : si l’option XGE de cadence est explicitement adoptée, une chute totale de plus de 500 pieds hors combat refuse avant tout déplacement, coût ou dé tant qu’aucun vrai suivi de tours n’existe. Aucun combat ni tour de six secondes n’est fabriqué. L’option absente conserve la chute PHB immédiate.


**Décision utilisateur W22 — acquisition adamantium** : vendre les versions déjà fabriquées, avec source initiale et vrai stock marchand, au surcoût imprimé de 500 po pour une arme de mêlée ou dix munitions. La transformation et le service de revêtement d’un équipement déjà possédé sont reportés ; aucun fait ou nonce ne convertit gratuitement une arme ordinaire.


**Consigne utilisateur W22 — full seulement après préparation entière** : la full est autorisée uniquement après fermeture de tous les prérequis ci-dessous. Fusion des trois gels, types/compilation, ciblés et croisements communs, sceaux/inventaire puis build Next de la copie exacte doivent être verts avant la suite complète. Aucun nouveau lot ou changement de source pendant cette full.





**Validation finale commune W22 active** : trois gels fusionnés, types MCP/Next et compilation0, **61/61 ciblés** dans12fichiers dont les trois croisements durables, **1054entrées figées**, **1587binaires**, **1001chemins source/config ROOT gardés**,48readonly et5métadonnées. Nouveau processus : **316outils uniques**,11ajouts et16domaines de support réellement lus. Build Next production0 sur copie exacte avec instrumentation ; seuls ses types next-env générés changent dans cette copie, aucun retour vers le candidat. La full `npm test` r1 a commencé le4novembre à23h34 (Europe/Paris), APRÈS ces preuves ; readiness `output/mcp-wave22-integrated-20261104/w22-full-readiness-r1.json` pinne leurs SHA. Source/bins restent immuables, aucun nouveau lot lancé pendant la full. Mock commun détaillé puis intégrités et inventaire ROOT neuf avant publication ; W21 demeure la livraison publiée.


<!-- END:W22-PREPARATION-HISTORY -->





<!-- BEGIN:W21-PUBLISHED-SUMMARY -->


**Ancienne publication vérifiée — W21 publiée le 2026-11-04** : `output/mcp-wave21-integrated-20261104`, TypeScript MCP/Next et compilation en sortie 0, **2566/2566 tests**, aucun échec/ignoré/annulé (1231835.5179 ms), **30/30 tours mock**, 9 scénarios, 71 appels, 0 USD, objectifs validés (19267 ms). Les **1014 entrées figées**, **1519 binaires publiés** et **963 chemins sources/config ROOT vérifiés** correspondent à leurs preuves ; 74 fichiers sources/config ROOT mis à jour. Un processus ROOT neuf confirme **305 outils uniques** ; les 17 ajouts W21 sont deux Trade Goods, deux opportunités spatiales, sept Sleep et six Renown. Aucun build ROOT ni arrêt de partie ouverte. [Rapport permanent W21](rules-audit/validation-wave21-2026-11-04.json). Les mentions W21 « en cours », « privé » ou « non livré » antérieures sont historiques et remplacées par cette publication dans son seul périmètre explicite.





Les quatre lots livrés sont PHB Trade Goods, opportunités PHB sur le vol réel W20, sommeil naturel et options XGE explicitement adoptées, puis comptabilité Renown DMG optionnelle. Les sources PHB/DMG/Xanathar sont celles déjà fournies et figées ; aucun nouvel audit global ou scanner de couverture n’a reconstruit le backlog. Les 95/95 ciblés intégrés et les croisements durables sommeil/OA 4/4 + sommeil/Renown/repos/SQL 1/1 sont inclus dans leurs suites respectives, jamais additionnés à la full. Les premiers 31/38 (pont scoped C omis du paquet) et 89/90 (compteur global codé en dur dans un test Renown) restent des preuves historiques distinctes ; le pont exact a été fourni sans assouplir les refus et le test vérifie désormais ses propres outils/leur unicité.





**Priorité conservée** : les nouvelles capacités/statblocs MM restent reportés par décision utilisateur du 4 novembre. Tunneler/fouissement demeure un brouillon non livré, sans outil ni mouvement actif ajouté à W21. Le contrat futur de corridors mesurés sur la carte actuelle est seulement conservé pour une reprise expressément demandée. Aucun lot MM n’est rouvert par cette publication.


<!-- END:W21-PUBLISHED-SUMMARY -->





<!-- BEGIN:W21-VALIDATION-CAPTURE -->


**Correction de capture, sans modification mécanique** : la première full W21 a été arrêtée sur deux fichiers de tests bloqués par des supports préexistants absents de la copie (CSS et référence texte). Les 47 fichiers de support réels sont désormais figés séparément ; ils correspondent à ROOT/W20 et ne sont pas recopiés sur ROOT lors de la publication. Les 17 tests des deux fichiers passent après cette seule réparation. La full R2 complète fait foi ; la première exécution incomplète, ses journaux et ses sceaux restent conservés. Un build Next de production réussit sur une copie exacte des 1 014 entrées ; son seul changement source est le fichier de types `next-env.d.ts` généré, isolé dans cette copie. Les 1 519 binaires MCP demeurent identiques avant et après full, mock et publication.


<!-- END:W21-VALIDATION-CAPTURE -->











**Observation historique hors lot — intégration visuelle du 2 novembre 2026** : pendant


la validation de la figurine exclusive `madame_bougie` (`fey-shadow-fair`),


`tests/mcp-social.test.cjs:127` échoue aussi lorsqu’il est exécuté seul :


sa regex `/empath|roleplayQuality|initialEmpathy/i` accroche le mot narratif


`empathized` dans `buildLocalBestiaryContext` de Sarah, issu de


`adventures/sarah-of-yellowcrest-manor/npc-lore.json:69`. Le prompt statique


ne présente aucune occurrence. Ce constat n’indique pas une réintroduction


de score d’empathie et est indépendant du registre de figurines. Preuves :


`output/madame-bougie/social-check.log` et `npm-test.log`. Aucun changement


des procédures sociales ni assouplissement du test dans ce travail visuel.


Prochain travail concret hors de ce périmètre : distinguer les anciens


identifiants mécaniques interdits des mots présents dans les extraits narratifs.





Bilan de cette exécution ROOT, sans extension aux preuves des lots MCP :


`npm run typecheck` termine en sortie 0 ; `tests/miniatures.test.cjs` passe


5/5, y compris l’exclusivité par identifiant, les autres marchands, les autres


aventures, les empreintes GLB et les portraits transparents. `npm test` termine


en sortie 1 : **1 865/1 874**, neuf échecs dans les tests généraux sociaux,


sommeil, cycle de vie/récupération, armes à distance, repos et évasion.


Le visuel public répond HTTP 200 et le modèle de Mirabelle reste inchangé.


Résultats : `output/madame-bougie/integration-validation.json` et journaux


du même dossier. Ces échecs ne sont pas corrigés dans l’intégration visuelle. La reprise globale W14 puis W15, avec le test social actuel visant les identifiants mécaniques précis, est verte ; ce journal visuel historique ne constitue plus un blocage actif.





<!-- MCP-TRACKER:CURRENT-STATUS -->





**Historique avant publication — W21 — fusion 3D et correction de paquet en clôture** : C a gelé dix-neuf nouveaux tests, 69/69 ciblés, types MCP/Next 0 et mock 30/30 (49 034 ms), avec deux nouveaux outils et domaine spatial_opportunities. Les 46 régions/28 fichiers ont été précontrôlés puis appliqués par le parent, avec sauvegarde, en préservant les treize nouveaux/propres fichiers Trade Goods. Types/build parent 0, mais la cohorte commune r1 termine **31/38** (54 263,6563 ms) : sept reprises C refusent SPATIAL_ATTACK_GEOMETRY_REQUIRED ; les dix-neuf Trade Goods passent. La comparaison exhaustive au socle W20 localise le seul fichier C modifié mais omis du paquet : mcp-server/spatial-weapon.ts, pont du rayon scoped/held. Aucun refus n’est assoupli. Supplément autonome deux régions/un fichier, gel historique intact ; repro avant puis **19/19** sur copie exacte W21 après correction. Le parent a appliqué ce seul supplément et relance la cohorte r2 ; contribution C complète **29 fichiers/48 opérations**, source agrégée 6ef08030ff2089db6c33e997206039f96819f50f25724751e4f4979b03078a96. Preuves : output/mcp-flight-opportunity-merge-fix-20261104/SPATIAL-WEAPON-BRIDGE-HANDOFF-20261104.md et journaux W21 r1/r2. ROOT reste W20 publié.





**Historique avant publication — Clôtures XGE et relais DMG W21 — toujours privés** : A a reproduit trois restaurations isolées acceptées avant correction (armorRecovery et compteur resolvedPeriods1/100), preuve output/mcp-xge-sleep-20261104/xge-sleep-policy-tamper-before.log : trois diagnostics positifs, pas trois validations post-correctif. Les gardes relient désormais adoption canonique et périodes résolues continues. Un vrai sommeil mixte armure→retrait→sommeil puis hydratation conservait toutes les valeurs mais perdait le checkpoint de repos à cause de l’ordre des clés ; le seul fingerprint mcp-server/resting.ts:25–29 devient canonique, avec ancien brut accepté seulement s’il reste prouvé. Cohorte privée annoncée 43/43, plus quatre croisements de réveil/fournisseurs et un vrai CON tenu/SQL, avec recouvrements à ne pas additionner ; API/échéances simultanées et gel final restent à fermer. C passe six scénarios publics plus quatre géométriques, dont coûts partiels et d20/rayon/CON tenus ; vraie SQL/process/API reste en cours. B, son Trade Goods désormais immuable, reprend **DMG-RENOWN** dans output/mcp-dmg-renown-20261104 : adoption explicite, membres déjà établis seulement comme limite initiale de l’outil, +1/+2 sourcés, pertes plancher0, registre anti-rejeu et promotions/retraits explicites. L’exemple DMG d’adhésion après1renown demeure distinct ; aucune attitude, ressource ou récompense n’est automatique.





**Historique avant publication — W21 — première couche intégrée en privé** : Trade Goods B est figé, TypeScript complet/build MCP+Next 0, **69/69** (119 313,7167 ms), dont dix-neuf nouveaux et trois POST, mock **30/30**, neuf scénarios, 71 appels, 0 $, objectifs OK (77 823 ms). Ses 941 entrées et 107 vrais assets sont stables, 1 471 binaires conformes au sceau ; processus privé final **290 outils uniques** et support trade_goods réel. Le parent a appliqué les seuls **21 fichiers gardés** (huit nouveaux, huit régionaux, cinq commerce) dans output/mcp-wave21-integrated-20261104 : relecture identique, TypeScript complet/build MCP 0 et **19/19 nouveaux** sur la capture intégrée (49 016,1277 ms). Ces suites se recouvrent. A/C et le prochain contrat DMG restent séparés ; ROOT/W20 ne sont pas compilés ni publiés par ce travail. Handoff B et empreintes : 	rade-goods-handoff-20261104.md/	rade-goods-handoff-sha-20261104.json dans son privé. Prochaine étape : contrats et raccords XGE/PHB/DMG, puis gel commun, full et mock avant livraison.





**Historique avant publication — Priorité utilisateur révisée W21 — PHB, DMG et Xanathar** : demande explicite du 4 novembre « capacités des monstres plus tard », puis ajout de Xanathar. **Tunneler/fouissement est reporté**, pas intégré : le privé output/mcp-mm-next-20261104 conserve un profil source et 4/4 prérequis purs, ainsi qu’un schéma WIP non raccordé ; aucun outil, mouvement ni compilation de ce lot n’est livré. Le choix spatial déjà reçu reste consigné pour une reprise future, sans autoriser sa poursuite maintenant. A est réaffecté à **XGE-SLEEP** (contrat et variantes explicites avant activation) ; B termine **PHB-ECONOMY Trade Goods**, puis préparera le contrat **DMG-RENOWN** dans un autre privé ; C conserve seulement la règle **PHB des opportunités 3D**, sans nouveau pouvoir/statbloc MM ni dépendance au fouissement. La capture W21 part toujours des sources W20 publiées et ne reçoit aucun fichier burrow.





**Historique avant publication — Contrats PHB/XGE en exécution W21** : C reprend les opportunités PHB5939/5941 avec route originale immuable, progression partielle et point d’interruption exact, selon le choix utilisateur de refuser toute frontière XY non représentable avant coût. A reprend XGE962–984 : fournisseurs naturels distincts, réveil par dégâts/secousse action/bruit réellement audible, seuils de perception imprimés ; historique des vraies portions de sommeil en armure moyenne/lourde et récupération du quart des HD dépensés. Les procédures optionnelles XGE demandent un choix structuré conservé avant l’intervalle ; la privation reste OFF sans adoption, démarre au présent et exige un événement explicite CON10 puis +5 par journée consécutive, sans reconstitution du passé. Pas de nouvelle capacité MM. B a une première cohorte Trade Goods 11/13 (trois POST verts) : deux fixtures sont refusées plus tôt par les gardes eventId/nutrition, ajustées sans assouplir le moteur ; reprise ciblée/types/mock en cours. Ces contrats et essais privés ne constituent pas une livraison.





**Historique avant publication — Découverte bornée Trade Goods W21 — provenance de première qualification** : reproduction publique avec sauvegarde SQL immédiatement après qualification et avant toute offre/stock : modifier seulement sourceUnits de 3 à 4 faisait accepter 150→200 cp, et changer seulement la marchandise cuivre en or faisait accepter 150→15 000 cp. Provenance : output/mcp-trade-goods-20261104/trade-goods-preoffer-mutation-probe.log. La correction conserve une commande canonique originale et la valide à l’hydratation, sans interpréter le texte du fait physique. Une régression SQL vérifie aussi état entier et dé inchangés ; types/build/ciblés sont relancés avant gel. Les résultats antérieurs ne prouvent pas encore ce correctif. Les empreintes des seuls PHB/DMG/Xanathar utilisés sont également vérifiées contre leur manifeste dans w21-book-sources.json ; aucun audit de livres relancé.





**Historique avant publication — Raccords ciblés supplémentaires W21** : le vrai pickup produit un WorldFact source pick_up_item, subjectItemId exact, expiration room/map ; sa forme simple ou narrative visuelle (sans effet mécanique) était traitée comme une association active et bloquait la qualification. Diagnostic : 	rade-goods-pickup-association-probe.log, producteur mcp-server/tools/inventory-tools.ts:55–64. B ferme cette seule procédure Trade Goods par un helper structurel exact, sans lire la prose ni effacer le fait ; waterEffect/clue/champs étrangers et liens poison/portions/effets restent refusés. Pour XGE-SLEEP, l’instant exact 24h peut être atteint ; un vrai long repos déjà admissible pourra être explicitement finalisé sans CON prématuré, puis ancre/DD remis à leur valeur correcte. Si nutrition et privation sont simultanément dues, l’agent choisit l’ordre par son premier résolveur explicite ; un jet tenu se termine avant le suivant. Aucun appel MCP de finalisation/jet, saut d’événement ou ordre général XGE n’est fabriqué par le serveur.





**Historique avant publication — Reprise W21 — demande explicite du 4 novembre** : trois agents reprennent la suite depuis les seules sources W20 publiées. B traite les marchandises non vivantes de PHB4513–4535 et leur revente pleine valeur PHB3915, en lots entiers possédés sans subdivision ni masse de tissu déduite. C établit le contrat des vraies réactions d’opportunité 3D autour du vol natif (PHB5935–5941), en conservant la métrique déjà choisie et les décisions explicites de l’IA. A établit le prochain sous-lot MM-POWERS/MM-MOVEMENT, dont Tunneler/fouissement, avec représentation à préciser avant exécution si nécessaire. Privés nouveaux et distincts ; aucune écriture ni compilation dans ROOT ou W20. Le parent prépare output/mcp-wave21-integrated-20261104, garde les baselines ROOT et intégrera les seules régions validées. Aucun de ces nouveaux lots n’est livré à ce stade ; pas de nouvel audit global.





**Historique avant publication — Décisions utilisateur W21 — 4 novembre** : Tunneler utilise des corridors physiques persistants avec entrées/sorties et profondeur mesurées sur la carte actuelle, **sans carte souterraine séparée**. Les opportunités de vol 3D sont résolues aux **frontières représentables exactement** ; les autres trajets refusent avant déplacement et seront élargis ultérieurement. Aucun arrondi au début du pas ni position subcellulaire autoritaire n’est introduit dans cette tranche. A/C poursuivent ces deux contrats explicites ; les règles MM/PHB et leurs limites de représentation restent séparées.





**Ancienne livraison vérifiée — W20 publiée le 4 novembre 2026** : `output/mcp-wave20-integrated-20261104`, TypeScript complet et compilation en sortie 0, **2 471/2 471 tests**, aucun échec/ignoré/annulé (1082483.8588 ms), **30/30 tours mock**, 9 scénarios, 71 appels, 0 $, objectifs OK (17764 ms). Les **925 entrées figées** restent identiques. Les **1 455 fichiers compilés** correspondent au sceau capturé pendant la full après son build initial et sont publiés puis comparés intégralement ; **83 fichiers sources/config ROOT** sont intégrés, avec **924 chemins gardés et vérifiés**. Sauvegardes : `output/mcp-source-before-wave20-20261104` et `output/mcp-engine-before-wave20-20261104`. [Rapport permanent W20](rules-audit/validation-wave20-2026-11-04.json). Un processus ROOT neuf confirme **288 outils uniques**, dix ajouts et neuf domaines réellement lus. Périmètre : avalement du ver pourpre et vraies sorties, vol natif 3D mesuré et substitutions Wyvern en vol, revente à pleine valeur des gemmes/art réellement possédés. Les raccords containment/hauteur/commerce et les archives carte/reddition/SQL sont inclus. Aucun build ROOT ni arrêt de partie ouverte. La première full interrompue et son ancien sceau restent conservés ; ils ne sont pas revendiqués comme verts. Les mentions W20 « en cours » ci-dessous sont historiques et remplacées par cette livraison dans son périmètre explicite.





**Livraison précédente — W19 publiée le 4 novembre 2026** : `output/mcp-wave19-integrated-20261104`, TypeScript complet/build en sortie 0, **2 367/2 367 tests**, aucun échec/ignoré/annulé (1 263 864,6921 ms), **30/30 tours mock**, neuf scénarios, 71 appels, 0 $, objectifs OK (43 435 ms). Les **888 entrées figées** restent identiques. Les **1 399 fichiers compilés** sont publiés et comparés intégralement ; **23 fichiers sources ROOT** sont intégrés, avec **882 chemins source** vérifiés identiques à la capture. Sauvegardes : `output/mcp-source-before-wave19-20261104` et `output/mcp-engine-before-wave19-20261104`. [Rapport permanent W19](rules-audit/validation-wave19-2026-11-04.json). Périmètre supplémentaire : vraie Multiattack Wyvern Bite+Stinger, sans substitution de griffes en vol inventée ; revente ordinaire des armes/armures intactes à moitié prix, acheteur réel et réserve marchande effectivement encaissée. Un nouveau processus ROOT confirme **278 outils uniques**, trois ajouts et six domaines réellement lus. Aucun build ROOT ni arrêt de partie ouverte.





**Relais actif — W20 séparée** : `output/mcp-wave20-integrated-20261104` part des seules sources W19 figées ; la première couche de vente à pleine valeur des gemmes/art est fusionnée par script gardé (quinze fichiers), avec son gel B TypeScript/build 0, 33/33 ciblés puis 1/1 support distinct. Swallow A et vol 3D C sont en clôture stdio/API/SQL avant leurs fusions régionales ; B vérifie les remises physiques entre ces domaines. Aucun de ces trois lots n'est publié ni injecté dans W19. Ordre de fusion convenu : biens précieux, Swallow, puis vol avec priorité de la relation de containment. Les mentions W19 « full en cours » ci-dessous sont historiques, remplacées par la présente livraison.





**W20 assemblée — validation finale en préparation** : les trois couches sont maintenant fusionnées : biens précieux B (quinze fichiers), Swallow A (104 régions / 39 fichiers), vol C (95 régions / 42 fichiers dont treize nouveaux), sans additionner les fichiers partagés. Premier contrôle parent : TypeScript complet/build 0 et **175/175 ciblés** (76 164,7248 ms). Deux défauts nouveaux ont été reproduits pendant cette intégration : une taille Swallow MM contradictoire pouvait être acceptée à la restauration SQL malgré le refus de l'observation publique (garde autonome quatre opérations / trois fichiers, preuve 22/22) ; une offre réelle pouvait être payée après observation d'un vide sous le marchand, sa hauteur inconnue étant omise (un hunk, refus avant pièces/objet/temps/dé, trois cas dont Z0 inchangé et six croisements commerciaux). Ces seules corrections sont appliquées et la cohorte élargie r2 est en cours avant gel/full/mock. Le guide Swallow distingue maintenant la règle imprimée des conventions de containment, d'adjacence de sortie et de blocage de fin de combat. Aucune nouvelle compilation ROOT ni publication de W20.





**Sourçage et témoins supplémentaires W20** : MM16300–16301 pour Swallow, PHB6002 pour le jet commun d'acide au même instant, PHB3913 pour la pleine valeur des gemmes/art, PHB5731–5733 et 5699–5703 pour les mouvements natifs et budgets. Les confirmations externes comprennent : un seul 6d6 pour deux vrais occupants, Death Ward/concentration/SQL et rejeu sans répétition ; une sortie réelle de cadavre pour 20 pieds de mouvement laissant Dodge disponible, puis refus de deuxième action même après fin de combat ; taille MM immuable et absence de cycle d'ingestion. Ce sont des preuves ciblées, pas une nouvelle couverture globale. La concentration actuelle est synchrone, aucune reprise Inspiration différée de ce jet n'est revendiquée. Limites C conservées : réactions 3D décisives non représentées, vol magique, passagers et activation aérienne de PNJ réactifs restent refusés. Prochain travail concret : résultat r2, inventaire réel, sceau de la capture, puis une seule full suivie du mock avant publication éventuelle.





**W20 — clôture des archives avant nouveau gel** : la cohorte r2 termine **217/217** (108 365,1913 ms), TypeScript complet/build 0 et inventaire réel **288 outils uniques**, dix ajouts et neuf domaines lus. La première full a été interrompue volontairement dans le seul privé W20 après reproduction d’un défaut : une taille Swallow légitimement observée devenait invalide à SQL lorsque le corps quittait la carte active. Son journal, sa sortie 1 et son sceau initial de 921 entrées sont conservés séparément ; cette exécution ne constitue pas une full verte. La correction reconnaît les corps inactifs réellement archivés sans autoriser leur ciblage, et reçoit des témoins publics de passage/retraite/SQL. La suppression sans archive est également en clôture ciblée avant un nouveau sceau et une full r2. ROOT reste W19 validée, sans compilation ni arrêt de partie.





**W20 r2 — gel final et full active** : corrections archives appliquées par cinq opérations gardées : lookup actif/retiré/autre carte et conservation du vrai corps nécessaire à l’historique lors d’une reddition sans épuisement. Trois tests Swallow durables et un test vol/archive/restart complètent la capture. Revue parent et agents : TypeScript complet/build 0, 179/179 ciblés (116 214,057 ms), puis 27/27 sur les octets finaux (29 211,9586 ms), avec recouvrement explicite des suites précédentes. Une seule prose de refus commercial « offer price » remplace « half price » ; calcul inchangé. Les **925 entrées** sont scellées et vérifiées sans dérive ; **924 chemins source/config ROOT** sont gardés contre les modifications concurrentes. Inventaire confirmé 288 outils, dix ajouts/neuf domaines. Nouvelle full npm test r2 lancée dans le privé, suivie seulement si verte du mock ; aucun fichier figé ne change pendant ces exécutions. W19 reste publiée.





Précision de lecture du guide vol : **Bite+Stinger reste utilisable au sol**, comme livré en W19. Le vol natif réellement établi autorise en plus **Claws+Stinger** ou **Bite+Claws** ; la phrase regroupant ces trois plans dans le guide W20 ne doit pas être lue comme une nouvelle restriction de la paire ordinaire. Profil source, support et code distinguent ces cas. Cette clarification canonique ne modifie aucun fichier de la capture figée ; harmoniser cette phrase lors de la prochaine retouche documentaire du guide.





**Livraison précédente — W18 publiée le 4 novembre 2026** : `output/mcp-wave18-integrated-20261104`, TypeScript complet et compilation en sortie 0, **2 337/2 337 tests**, aucun échec/ignoré/annulé (1 333 629,6325 ms), **30/30 tours mock**, neuf scénarios, 71 appels, 0 $, objectifs OK (29 473 ms). Les **877 entrées figées** restent identiques. Les **1 387 fichiers compilés** sont publiés et comparés intégralement ; **46 fichiers sources ROOT** sont intégrés avec vérification des **871 chemins source** de la capture. Les anciens fichiers source modifiés et le moteur W17 sont conservés dans `output/mcp-source-before-wave18-20261104` et `output/mcp-engine-before-wave18-20261104`. Un processus neuf ROOT expose réellement **275 outils uniques**, 12 ajouts et cinq domaines lus. Aucun build ROOT ni arrêt de partie ouverte. [Rapport permanent W18](rules-audit/validation-wave18-2026-11-04.json). Périmètre : récolte réelle finie, contamination de provisions/volumes, observation actuelle des anciens PNJ à 0 PV, quatre venins natifs et combat sous l'eau avec ses corrections de séquence/legacy. Wyvern Multiattack, revente, vol 3D, Swallow et biens précieux restent hors de cette livraison.





**Relais actif après W18** : W19 est figée sur **888 entrées** avec Wyvern Bite+Stinger et revente ordinaire, TypeScript/build 0, **88/88 ciblés**, mock **30/30** (43 435 ms), inventaire réel **278 outils** / trois ajouts et six domaines lus. Sa full séparée tourne ; aucune source du gel ne change. A poursuit Swallow, C le vol non stationnaire/3D et B les gemmes/art à pleine valeur dans leurs nouveaux privés, selon les décisions utilisateur et sources indiquées ci-dessous. Ces trois travaux ne sont pas inclus dans W19 et ne doivent pas être injectés dans sa validation. Les paragraphes « en cours » antérieurs de W18 ci-dessous sont historiques, remplacés par cette livraison finale.





**W17 publiée — reprise du 4 novembre 2026** : la suite laissée par le précédent chat est terminée : **2 242/2 242 tests**, aucun échec, ignoré ou annulé (1 076 781,8652 ms ; code de sortie du processus ancien non consigné séparément). Les **789 entrées figées** de `output/mcp-wave17-integrated-20261102` sont toujours identiques. Reprise actuelle de `npm run typecheck` et `npm run playtest:mock` en sortie 0 : **30/30 tours**, neuf scénarios, 71 appels, 0 $, objectifs OK (52 570 ms). Les **1 319 fichiers compilés** sont publiés et comparés octet pour octet, sans fichier obsolète ; le nouveau processus ROOT expose **263 outils uniques**, 25 ajouts et cinq domaines réellement lus. W16 est conservée dans `output/mcp-engine-before-wave17-20261104`. Windows a refusé le déplacement du dossier : sauvegarde par copie vérifiée puis remplacement des fichiers, sans arrêt des parties ni compilation/écrasement des sources ROOT. [Rapport W17](rules-audit/validation-wave17-2026-11-04.json). Cette preuve ne couvre pas récolte, contamination nutritionnelle, attaques venimeuses natives, observation des anciens PNJ à 0 PV ou combat sous l'eau.





**Relais actif du 4 novembre** : trois agents reprennent les privés existants, sans nouvel audit. A achève les attaques venimeuses natives (contrat de continuation précédemment amorcé, tests absents) ; B reprend l'observation physique des PNJ anciens à 0 PV (reprise TypeScript/build 0, 14/14 publics dont 11 nouveaux et trois helpers) puis ses raccords API/SQL avec la récolte ; C achève les règles sous l'eau et leurs tests, encore absents à la reprise. Le parent prépare la fusion suivante et les raccords de contamination alimentaire/liquide. Les fichiers communs seront fusionnés par régions, jamais remplacés par un ancien socle. W17 reste la dernière publication validée jusqu'aux contrôles de cette nouvelle cohorte.





**Incident de compilation ROOT pendant la reprise** : A a lancé par erreur `npm run build:mcp` avec le dossier ROOT au lieu de son privé. Après fin réelle de la commande, les 1 367 fichiers de cette compilation non validée ont été conservés dans `output/mcp-unvalidated-build-preserved-20261104`, les 48 fichiers supplémentaires retirés précisément et les 1 319 fichiers W17 restaurés, avec comparaison intégrale. Aucun fichier source ROOT ni processus de partie modifié. La nouvelle lecture de démarrage W17 est renouvelée après restauration ; cet incident n'est pas une livraison des lots W18. Les trois agents utilisent désormais systématiquement le chemin privé absolu dans chaque commande.





**W18 — fusion régionale et reprise ciblée, 4 novembre** : `output/mcp-wave18-integrated-20261104` conserve le ROOT courant avec toutes les corrections W17, récolte finie, contamination nutrition/volumes et vie actuelle des anciens PNJ ; les hooks natifs inachevés ont d'abord été retirés puis remplacés par le gel A testé. Raccords régionaux : 52 opérations natives, 87 opérations sous-eau initiales puis résistance au feu et quatre préflights de séquences exacts ; les fichiers applicatifs B partent de W17. Première cohorte **104/114**, sortie 1 (63 348,4107 ms) : neuf refus natifs venaient de l'ancienne validation à trois sources conservée en doublon de la nouvelle à quatre ; une ligne de résistance au feu des créatures manquait dans la recette. Les deux régions sont corrigées, sans changement de la règle ni des assertions. Le contrôle ciblé de toute la cohorte est repris ; aucune full W18 ni nouvelle publication n'est encore revendiquée. Les preuves privées demeurent distinctes : A 31/31 natifs/catalogue/stdio ; B 4/4 API/SQL, 19/19 frontières et 1/1 support ; C, fusion sur W17, TypeScript/build 0 et 25/25 (22 mécaniques, trois API/SQL).





**Réaffectations suivantes déjà lancées, hors W18** : A poursuit la vraie Multiattack Wyvern (`output/mcp-wyvern-multiattack-20261104`), sans Swallow ni vol inventé ; B traite la revente d'équipement ordinaire avec les seules pièces effectivement encaissées par le marchand (`output/mcp-merchant-resale-20261104`), sans bourse initiale créée ; C reprend le vol non stationnaire/hauteur et portée réelles (`output/mcp-native-flight-20261104`). Provenance de cette dernière borne : la tranche Wyvern ne peut pas utiliser sa substitution Claws en vol tant que les gardes actuelles de navigation/hauteur n'ont pas de vrai parcours compatible. Ces nouveaux privés n'écrivent ni W18 ni ROOT et leurs anciens socles ne seront jamais copiés en bloc.





**Décisions utilisateur explicites du 4 novembre, pour les prochains lots** : avalement du ver pourpre représenté par une relation « dans le ver », sans carte intérieure, avec transport dérivé du ver et règles dédiées de ciblage/couverture ; les destinations de rejet/sortie restent des choix explicites de l'agent. Pour le vol 3D et ses portées, réutiliser la distance géométrique déjà employée par les sorts, en conservant la marche au sol actuelle. Ce choix de géométrie est une convention moteur autorisée, pas une nouvelle règle RAW. Réponses reçues aux deux demandes de conception ; aucun travail dépendant n'avait été lancé avant leur réception. A, après gel Wyvern 46/46, est réaffecté à Swallow dans `output/mcp-purple-worm-swallow-20261104` ; ces travaux demeurent hors W18.





**W18 — défaut legacy trouvé par la full r1** : une attaque d'un ancien combattant sans métadonnées SRD accédait à `profile.name` dans le nouveau contexte sous-eau. Deux reproductions dédiées échouaient avant correction. Trois petites régions de `combat-tools.ts` conservent désormais la référence d'attaque explicitement fournie, n'accordent aucune exception d'arme canonique sans profil, et rendent le refus de qualification aquatique sous forme de résultat JSON. La full r1, déjà en échec, a été arrêtée uniquement sur son arbre de processus de tests vérifié ; aucune partie ouverte arrêtée. Journal et sceau initial de 876 entrées conservés. Reprise TypeScript/build et anciens parcours API combat/narration/copies/volumes en cours avant un nouveau gel et la full r2 ; ni cette r1 interrompue ni ses cas arrêtés ne sont une validation générale.





**W18 r2 figée ; W19 préparée séparément** : reprise legacy **65/65**, TypeScript/build 0 (70 569,5131 ms), puis nouveau sceau **877 entrées** identiques avant `npm test` r2 ; le processus neuf expose toujours **275 outils uniques**, 12 ajouts et cinq domaines réellement lus. Full et mock séquentiels en cours dans la capture, aucune entrée source modifiée. Trois vérifications externes sur ses binaires figés passent pour le croisement natif/sous-eau (serpent nageur + CON tenue/hydratation, Wyvern aquatique non qualifiée refusée avant dés, vrai désavantage puis CON15 retenue) : `output/mcp-purple-worm-swallow-20261104/w18-native-underwater-review.*`, sans compilation ni modification W18. Pendant cette full, `output/mcp-wave19-integrated-20261104` copie seulement ses sources corrigées, puis reçoit les huit opérations Wyvern gardées ; TypeScript/build 0 et **47/47 ciblés** (21 366,1512 ms), parcours stdio Wyvern séparé en cours. W19 demeure un brouillon non publié, aucune preuve W18 ne certifie ses nouveaux changements.





**W17 — préparation historique du 2 novembre, terminée ci-dessus** : base W16 validée, gels tables de campagne, économie W20r2 conforme aux jours, nage/escalade C, Training W21 et noyau poisons A. Le supplément ciblé4fiches MM validé est ajouté sans attaque privée de ses riders. Les fichiers communs sont fusionnés par régions ; aucun retour vers les anciens socles des agents. TypeScript complet/build0 et première cohorte56/56, puis16/16Training/frontières/PNJ et68/68noyaupois+nage/frontières/Training/PNJ. Ces passes se recouvrent et ne s’additionnent pas. Récolte, contamination des volumes et Underwater restent hors de cette capture.





**Dernière livraison vérifiée — W16 publiée le 2 novembre** : output/mcp-wave16-integrated-20261102, TypeScript complet/build0, **2118/2118tests** (1046856,7658ms), **30/30tours mock**, neuf scénarios,71appels,0$, objectifsOK (23579ms). Les739entrées figées restent identiques ; les1214fichiers compilés sont publiés et comparés octet pour octet sans supplément. Vrai nouveau processus ROOT :238outils uniques,16ajouts (13Gear/collecte/transvasement,3rencontres persistées),2domaines lus et schéma d’approche magique vérifié. Ancien moteur W15 conservé sous output/mcp-engine-before-wave16-20261102 ; aucun build ROOT/source courante écrasée ni processus de partie ouverte arrêté. [Rapport permanent W16](rules-audit/validation-wave16-2026-11-02.json). Les tables de campagne, poisons DMG, commerce/fabrication avec correction de jours requise, nage/escalade et Training restent hors de cette livraison.





**W16r1 terminée, reprise r2 en cours** :2118tests,2117réussis/1échec,1058024,9933ms,739entrées figées sans dérive. Le seul écart est reproduit isolément : ancien test dm-toolkit fournissant un seul20 alors que roll_table puis forçage demandent deux vrais dés, laissant le second aléatoire. Correction de fixture uniquement20,20 et ajout de deux assertions de succès/dé20 ; état du coffre et toutes les assertions précédentes conservés. Reprise W16isolée1/1 (7345,8986ms), fichier complet7/7 dans le privé campagne (23381,8526ms). Aucun moteur changé. Ancien manifeste/test conservés, nouvelle fullr2 lancée sur les739mêmes chemins ; aucune source de poisons/commerce/nage/tables de campagne injectée.





**W16 — cohorte intégrée figée, validation complète en cours** : `output/mcp-wave16-integrated-20261102`,739entrées source/config/tests figées ; TypeScript complet/build0 et **96/96 ciblés** (38108,7849ms), dont3nouveaux API/SQL Gear et2API rencontres. Inventaire réel **238outils uniques**,16ajouts :13Gear/collecte/transvasement et3rencontres persistées. Les domaines ground_gear/random_encounters sont réellement lus ; l'approche magique de hazardPreparation est présente au schéma. Un seul écart initial95/96 provenait de deux lignes C2 validées non encore reprises dans ROOT : landedProne et propagation landingContext lors d'un saut ; ces seules lignes sont rétablies dans ROOT et le candidat, sans modifier le gel C2. Les segments explicites d'un même recoveryId/transferId partagent la décision du joueur ; finish/cancel restent auxiliaires, une autre action ou un autre travail est refusé. La full npm test tourne sur ce gel, aucun input/dist n'est modifié pendant l'exécution. Les WIP poisons, marchands/fabrication et nage/escalade sont explicitement exclus ; les seules régions partagées WIP retirées sont tracées dans prepare-wave16.py/w16-scope.json. Moteur partagé W15 inchangé, aucun build ROOT.





**Livraison précédente — W15r3 publiée le 2 novembre** : `output/mcp-wave15-integrated-20261102`, TypeScript complet/build0, **2012/2012 tests** (924047,1654ms), **30/30 tours mock**, neuf scénarios,71appels,0$, objectifsOK (21718ms). Les **700entrées figées** n’ont aucune dérive. Les **1142fichiers compilés** sont publiés et vérifiés octet pour octet sans supplément ; un nouveau processus partagé expose **222outils uniques**,14ajouts, les quatre schémas de lancement acceptent area et les trois domaines offensive_oil/jumping/spell_areas sont réellement lus. Ancien moteur sauvegardé sous `output/mcp-engine-before-wave15-20261102`, aucune partie ouverte arrêtée, aucun build ROOT ni source courante écrasée. [Rapport permanent W15](rules-audit/validation-wave15-2026-11-02.json). Les correctifs mains Oil et cycle de l’élan sont inclus. Gear actif/collecte/arrivées atomiques, préparation explicite de danger, tirages composés/contrôles persistés et nouveaux préflights des historiques legacy inconnus restent des lots suivants, non couverts par cette preuve. Les quelques champs/helpers passifs Gear présents dans le socle B ne constituent pas des outils Gear livrés.





**Relais courant — actualisation** : les anciens chantiers pétrification/afflictions et vol stationnaire ont été livrés dans leurs périmètres W5–W7 ; leurs limites restent celles des entrées correspondantes. Les noms historiques ne désignent pas un blocage courant. A a gelé le noyau poisons, les quatre profils MM et la contamination nutrition/volumes, puis traite les effets des attaques venimeuses natives. B a gelé fabrication, Training et récolte, puis traite l'observation physique des anciens PNJ à 0 PV dont l'état vital est inconnu ; ses onze nouveaux parcours stdio sont verts, validation complémentaire en cours. C traite le combat sous l'eau, ses témoins physiques et les dégâts de feu dus, compilation/tests en cours. Le parent valide les intégrations sans nouvel audit ; la suite complète W17 tourne dans sa capture figée. Récolte, contamination, attaques venimeuses natives, observation des anciens PNJ à 0 PV et combat sous l'eau restent hors de cette capture. W16 reste le moteur publié tant que W17 n'a pas terminé ses validations.








**W15r2 verte, révision bornée r3 en cours** : **2004/2004**, aucun échec/annulation/test ignoré, sortie0 (1244026,1294ms), après le seul réalignement du test d’escalier et avec698entrées figées. Avant publication, deux vrais défauts supplémentaires découverts pendant Gear ont leurs correctifs autonomes : mains Oil et cycle de l’élan. R3 fusionne uniquement oil.ts, trois petits fichiers footwork et deux lignes GS, en préservant le scope physique PNJ et le bookkeeping existants ;2tests publics mains+6cycle ajoutés. TypeScript/build0, **72/72 ciblés** (14730,0622ms), inventaire222confirmé. Nouvelle full en cours sur **700entrées figées**, sans Gear actif, préparation de danger ou tirages composés. Les sources/binaire r2 précédents sont conservés sous `output/mcp-wave15-before-r3-20261102` et manifeste w15-frozen-inputs-r2.json ; aucune preuve r2 n’est réécrite comme si elle couvrait ces nouveaux correctifs. Le script de test du seul privé reprend sa concurrence par défaut pour cette r3 ; package ROOT inchangé.





**W15 — première full terminée et correction ciblée** :2004tests,2003réussis/1échec, sortie1 (944207,6711ms),698entrées sans dérive. La seule différence reproduite isolément concerne l’ancien test Yellowcrest qui attendait tout hero identique après l’escalier : le vrai historique d’élan est désormais vidé à la frontière de carte, conformément au nouveau saut. Correction exacte du test seulement : PV, temps, objectifs et tous les autres champs héroïques demeurent strictement égaux ; avant footwork.mapId=temple, après footwork absent et movementTrail vide. Reprise ciblée1/1, sortie0. Fullr2 lancée après gel révisé ; seules modifications du privé : ce test, scope et script package de validation borné à quatre processus de tests simultanés (tous les cas restent exécutés, package ROOT inchangé). Aucun correctif moteur ni nouveau lot injecté ; première preuve conservée dans w15-frozen-inputs-r1.json.





**W15 — cohorte figée, suite complète en cours** : `output/mcp-wave15-integrated-20261102` réunit les gels sauts C et zones B, l’huile offensive A et les raccords applicatifs actuels, tout en conservant grimoires/social/poison W14. TypeScript complet0, build0, **79/79 ciblés** (21847,7213ms), dont huit parcours API :3sauts,3huile,2Colonne de flamme. Les vrais appels API conservent les arguments imbriqués area, le parchemin réel, lectureDD15, sauvegardesDD17, feu/radiant en un seul paquet, succès/échec et SQL, sans emplacement accordé ni seconde action. Inventaire réel **222outils uniques**,14ajouts face à W14 ; domaines offensive_oil/jumping/spell_areas réellement lus et champ area contrôlé sur cast_spell/cast_creature_spell/use_spell_scroll/use_magic_item. **698entrées source/config/tests figées** avant npm test (`w15-full-r1.log`, exécution active). Aucun contact Gear ni collecte en cours n’y est injecté ; le moteur partagé reste W14 validé,208outils. Une première commande d’inventaire lancée au mauvais dossier n’a pas trouvé le script ni lancé le moteur ; seule la reprise dans le privé est la preuve222.








**Huile — raccord applicatif ciblé vérifié** : `output/mcp-oil-api-20261102`, TypeScript complet0, compilation0 et **3/3 API/SQL** (27622,1878ms) : lancer sur le vrai objet, verser sur le vrai sol et allumer par la vraie torche, six secondes réelles par opération, dose débitée, PV/position préservés et deuxième action sans rapport refusée avant dé. Aucun ennemi ni tour créé par le serveur. Domaine offensive_oil et consigne MJ préparés. Le playtest mock termine en sortie0 : **30/30 tours**, neuf scénarios,71appels,0$, objectifs OK,43598ms ; ces preuves ciblées ne certifient pas encore les nouveaux contacts/volumes. [Rapport borné](rules-audit/validation-oil-api-2026-11-02.json).








**Livraison précédente — W14 validée et publiée le 2 novembre** : `output/mcp-wave14-integrated-20261102`, TypeScript MCP/Next et compilation0, **1925/1925 tests** (940784,0121ms), **30/30 tours mock**, neuf scénarios,71appels,0$, objectifs OK (16909ms). Les642entrées source/config/tests n’ont aucune dérive après validation. Les1049fichiers compilés sont publiés et vérifiés octet pour octet, sans fichier supplémentaire ; ancien moteur conservé sous `output/mcp-engine-before-wave14-20261102`, aucune partie ouverte arrêtée. Un nouveau processus partagé expose **208 outils uniques**,13ajouts et retrait de record_social_interaction par rapport à W13 ; aucune ancienne option sociale ni socialRelationships. Grimoires physiques, poison basique, social2014 exclusif, fiches/groupes PNJ actuels, météo et A8 sont inclus. Les nouveaux sauts/zones/huile offensive/Gear restent exclus et ne sont pas certifiés par cette preuve. [Rapport final W14](rules-audit/validation-wave14-2026-11-02.json). Le ROOT source en cours n’a pas été recompilé ni écrasé.





**Correctif réel grimoire/respiration vérifié** : les trois nouveaux cas reproduisaient deux défauts avant correction : démarrer une copie en traversant l’effondrement respiratoire et créditer une continuation après cette frontière. `mcp-server/spellbooks.ts` vérifie désormais l’intervalle avant paiement et progression via `lib/activity-preflight.ts`. Le travail peut s’arrêter exactement à la frontière, mais aucune nouvelle connaissance n’est accordée au lecteur incapable ; la finalisation exige sa récupération réelle. Compilation0 et **16/16** (13 mécaniques et trois parcours API) dans `output/mcp-wave14-spellbook-api-20261102/book-breathing-after-fix-r1.log`. La reprise applicative standard termine aussi **23/23**, sortie0 (`standard-application-r2.log`) après alignement des dépendances `context-loader`/`social` et du script de conversion de journal ; aucune assertion affaiblie.





**Relais équipements au sol** : proprietes_armes traite PHB-GEAR : billes, chausse-trappes et piège de chasse, vrais lots possédés, surfaces/ancrage réels, prudence choisie explicitement, événements de contact à résoudre sans rejouer le trajet. Les récupérations restent quantifiées et ne recréent pas un sac plein. L’entrée explicite dans des tours avant contact avec un danger actif réel est approuvée pour éviter l’impasse d’approche ; aucun mouvement ni adversaire n’est fabriqué. initiative_2014 a obtenu31/31 cas sauts/contacts et compilation0 dans sa copie ; la fusion et la validation intégrée restent à faire. respiration poursuit volumes de sorts et dégâts simultanés de Flame Strike. Aucun nouvel audit.





**Décision sociale actuelle — priorité sur les anciens contrats** : demande utilisateur explicite du 2novembre «enleve toute trace du modele d’empathie custom ... ne garder que le systeme2014», vérifiée dans le chat correspondant et consignée en fin de registre. Six outils sociaux standard seulement ; aucune option ni sélecteur maison à restaurer. Le ROOT a été recompilé par les chantiers concurrents : une lecture de nouveau processus confirme208outils, absence des deux anciens outils et du champ relationnel supprimé. Cette lecture de démarrage ne remplace pas une validation globale.





**Livraison historique — W12 du 2 novembre** : **1780/1780 tests**, TypeScript complet et compilation en sortie0, **30/30 tours mock**, neuf scénarios,97appels,0$, objectifs atteints. Le nouveau processus du moteur partagé expose **184 outils uniques**, dont15 ajouts (forage, eau située, filets et portes cachées) ; les quatre domaines de support sont lus réellement. Les **949 fichiers compilés** correspondent octet pour octet à la copie validée. Compilation de production Next séparée en sortie0. [Rapport final W12](rules-audit/validation-wave12-2026-11-02.json),602 entrées source/config/tests empreintées après validation. La compilation ROOT intermédiaire non certifiée, observée après un démarrage dev, est conservée dans `output/mcp-engine-before-wave12-20261102` ; aucune partie ouverte n’a été arrêtée. La météo, les armes improvisées et l’argenture en cours restent exclues de cette preuve.





**Livraison précédente — W11 du 2 novembre** : **1679/1679 tests**, TypeScript complet et compilation0, **30/30 tours mock**, neuf scénarios,97appels mock,0$. Le vrai inventaire MCP confirme **169 outils uniques**, dont28 nouveaux et six domaines de support contrôlés. Les **889 binaires** issus de l'instantané validé ont été publiés dans le moteur partagé et comparés octet pour octet ; un nouveau processus ROOT démarre et expose169outils. L'ancien moteur est conservé sous `output/mcp-engine-before-wave11-20261102`, hors des entrées du compilateur ; aucun processus de partie déjà ouvert n'a été fermé. [Rapport final W11](rules-audit/validation-wave11-2026-11-02.json),568 entrées source/config/tests empreintées. Cette preuve concerne `output/mcp-wave11-rest-current-20261101` après ses corrections r2 ; elle ne certifie pas tout le ROOT courant ni les147lots.





**W13 validée, non publiée après nouvelle demande utilisateur** : `output/mcp-wave13-integrated-20261102`,630entrées source/config/tests demeurées identiques au gel et1005fichiers compilés. TypeScript complet0, build0, inventaire196outils uniques/12ajouts et trois domaines réellement consultés,3/3 API/SQL, **1869/1869 tests** en1124834,1045ms, **30/30 tours mock**, neuf scénarios,67appels,0$, objectifs atteints. [Rapport final W13](rules-audit/validation-wave13-2026-11-02.json). Publication volontairement non effectuée : une demande humaine plus récente dans le chat «Supprimer le modèle d’empathie custom» exige le système social2014 exclusif ; cette ancienne cohorte réintroduirait record_social_interaction. Les nouvelles fiches/groupes PNJ et les lots suivants déjà présents dans ROOT ne doivent pas non plus être écrasés par ces anciens binaires. Aucun moteur de partie ouverte arrêté. La prochaine cohorte doit intégrer ces évolutions actuelles avant sa propre validation ; W13 ne certifie pas le ROOT courant.





**Gels suivants — grimoire et social exclusif** : grimoire `output/mcp-spellbooks-current-20261102`, build/Next0,17/17 ciblés puis10/10 nouveaux ; social actuel `output/mcp-wave15-b-social-standard-20261102`, build/Next0,**63/63** (15mécaniques et48personnalités/retrait/migration). L’ancien privé social optionnel est hors candidature. Agents immédiatement réaffectés aux sauts et zones de sorts. Les réservations de B portent seulement sur ses tests/doc mécaniques sociaux ; toute évolution concurrente de ces fichiers se fusionne par régions, jamais par retour global de l’ancienne version.





**Raccord applicatif grimoire — trois parcours verts** : `tests/dm-spellbooks.test.cjs`, dans `output/mcp-wave14-spellbook-api-20261102/book-api-r1.log`, **3/3** (49563,3039ms) avec moteur standard exclusif capturé depuis le nouveau privé B. Travail900+900, reprise d’un travail payé au message précédent, véritable événement thermique résolu explicitement puis reprise, paiement unique, aucun dé de copie personnel ni nouvelle connaissance avant terme, mêmes arguments, deuxième copie sans rapport refusée et SQL identique. Le serveur comptabilise les appels explicitement choisis du même jobId ; il n’en fabrique aucun. L’ancien moteur grimoire pré-retrait a été conservé hors du runtime de test, sans publication.





**Gel A8 — improvisation et argenture** : `output/mcp-weapons-a8-20261102` immobile, build0. Batch22fichiers252/254, correction réelle du préflight consommable pendant sa propre réaction puis21/21 ; dernier raccord Duel pour une charge improvisée tenue, reprise33/33 dont obstacle à description longue. L’agent dénombre255cas distincts couverts, ces reprises ne s’additionnent pas aux collectes précédentes. Types appropriés étayés par un vrai fait public, association explicite à l’instance sans subjectItemId impossible à créer, coûts/actions/réactions/provenance argent réels. [Guide](improvised-weapons-and-silvering.md). Agent immédiatement réaffecté au poison de base ; global W13 encore en cours.





**Gel météo C — temps, exposition et vol** : privé immobile `output/mcp-weather-current-20261102`, compilation MCP0 et TypeScript Next0. Cohorte50/50 (dont10nouveaux météo/vol et7raccords armes) ; extension17cas propres en16/17 puis reprise du dernier cas1/1 après correction de sa fixture Médecine. Un vrai défaut trouvé et corrigé : une hydratation ne doit pas réinsérer le joueur réellement mort dans l’initiative après décès thermique avant son réveil prévu. Les constats réels de contenu d’eau synchronisent aussi l’épisode chaleur au même instant. Aucun nouveau périmètre météo ajouté après ces frontières. Le gel n’inclut pas les dernières retouches perception/flammes/UI de B et ne vaut pas validation intégrée globale. Agent C immédiatement réaffecté à PHB-SPELLBOOK-RECOVERY.





**Gel météo B — perception et flammes** : privé immobile `output/mcp-wave14-b-weather-20261102`, compilation MCP0 et TypeScript Next0 après alignement de son application sur le retrait du planner. Cohorte117cas :116verts, compatibilité passive sur état réduit sans météo corrigée ; reprise26/26 (22nouveaux météo et4passifs). Sens explicites dans les reprises/Help/Hide, vrais effets vent/pluie/brouillard, pions connus masqués par brouillard physique, vraies flammes et combustible, protection de lampe et idempotence. Sources listées par l’agent, communs C/A à fusionner par régions ; pas de copie globale de son privé contenant A8. Agent immédiatement réaffecté aux deux entrées sociales ci-dessous.





**Raccord applicatif météo préparé, non encore livré** : `app/api/dm/route.ts` classe `inspect_weather` en lecture, les observations/résolutions dues en auxiliaires, le vêtement en vraie action et le vol vertical choisi comme mouvement du véritable `entityId`. Contexte local rafraîchi après changement de météo, protection de lampe ou vol vertical. Domaine `weather` dans le support et consignes MJ explicites ajoutés ; `tests/dm-weather.test.cjs` prépare deux parcours réels moteur/API/SQL avec arguments exacts et sentinelles de dés. Premiers parcours2/2 et contrôle TypeScript ciblé0 dans `output/mcp-wave13-weather-api-20261102` ; ces premiers tests préparaient le fait de vêtement en interne. Le raccord réel découvert ensuite accepte un fait public générique de scène avec association explicite au vrai vêtement (un autre subjectItemId reste refusé), sans étendre record_scene_fact. Le flux public record_scene_fact→wear passe maintenant dans2/2 tests applicatifs avec build0 (`weather-build-r4.log`, `weather-api-r4.log`). Le contrôle TypeScript applicatif ciblé termine également0 ; aucune preuve W12 étendue à ces sources. Le planner a été retiré par le travail utilisateur concurrent décrit en fin de registre ; il n’est pas recréé.





**Poursuite active après W11** : forage66/66, eau située/transvasement61/61, catalogue/lance/filet/finesse201/201, plafonds de soin12nouveaux+43régressions, portes cachées12nouveaux+103régressions sont gelés dans leurs privés distincts. Les quatre tests applicatifs réels voyage/forage/eau/SQL passent avec TypeScript Next0 ; intégration globale W12 maintenant validée et publiée. Les agents ont été immédiatement réaffectés aux armes improvisées/argenture et au groupe météo, partagé entre physiologie/horloges, armes/hauteur et perception/flammes. Aucun nouveau scanner de livres ni audit global.





**Cohorte W12 figée — suite complète et mock verts** : `output/mcp-wave12-integrated-20261102`, issue du socle portes gelé avec A7 vérifié, plus les raccords API/support/consignes. TypeScript complet0, build0,51/51 cas ciblés puis18/18 API/consignes/frontières dans leurs exécutions distinctes. L'inventaire réel confirme184outils uniques,15nouveaux, quatre domaines foraging/water_sources/nets/hidden_doors et quatre schémas Finesse contrôlés. La seconde suite complète termine à **1780/1780**, zéro échec, annulation ou test ignoré, en1631159,595ms (`w12-full-r2.log`) ; playtest mock en sortie0 : **30/30 tours**, neuf scénarios,97appels,0$, objectifs atteints,74843ms (`w12-playtest-r2.log`). La compilation de production Next dans `output/mcp-wave12-next-build-20261102` termine également en sortie0 (`next-build.log`). Les949binaires W12 sont maintenant publiés et vérifiés ; un nouveau processus partagé expose184outils. Aucune source improvisation/argenture/météo en cours n'est injectée dans ce privé figé.





**W12 première full et réalignement de la copie** :1779tests/1775réussis/4échecs. Aucun correctif de règle requis pour ces quatre échecs : fixture filet antérieure à la vraie action du gobelin, déjà corrigée dans A7 ; script training ancien sans selectExamples/option role et route training manquante dans le socle privé. Les seuls fichiers de vérification concernés ont été réalignés sur A7 et le training W11 validé (scripts/route/libs), sans modifier le ROOT training concurrent ni assouplir les assertions. Reprise ciblée **31/31** dans `w12-corrections-r2.log`, puis TypeScript complet0 et **1780/1780** en fullr2 ; le fichier training désormais chargé explique le total distinct de la première exécution. Le mock termine également en sortie0,30/30tours ; empreintes finales, publication et lecture réelle des184outils sont également terminées. Ce réalignement ne reconstruit aucun audit de règles ni le registre.





Les quatre lots W2 sont livrés dans leur périmètre : **999/999 tests**, **30/30 tours mock** et **117 outils MCP** vérifiés. Le [rapport W2](rules-audit/validation-wave2-2026-10-31.json) atteste son instantané propre.





Les sept sous-lots W3 sont maintenant livrés dans leurs périmètres bornés : armures, lanternes/huile, consommables offensifs, tests passifs/de groupe/entraide, composants V/S/M, sens natifs et ramper/se relever. Validation finale : **1 065/1 065 tests**, **30/30 tours mock**, neuf scénarios, 97 appels mock, **0 $** et **125 outils MCP** confirmés, tous en sortie 0. Les collectes ciblées de 110 tests, de 119 tests de compatibilité et de 26 tests des dernières fixtures ont aussi réussi. Le correctif des origines explicites de couverture fait partie de cette validation. Les limites propres à chaque entrée restent ouvertes : livrer ce sous-périmètre ne termine pas les 147 lots. Preuves, essais et empreintes : [rapport W3](rules-audit/validation-wave3-2026-10-31.json).





La tranche W4 nourriture/eau et récupération alimentaire de l’épuisement est maintenant livrée dans son périmètre : **1 094/1 094 tests**, TypeScript complet sortie 0, **30/30 tours mock**, neuf scénarios, 97 appels mock, **0 $**, et **129 outils MCP** compilés dont les quatre de nutrition. Les deux échecs ciblés initiaux ont été corrigés sans affaiblir les assertions ; les onze tests des fichiers corrigés puis toute la suite passent. Preuves et limites : [rapport W4](rules-audit/validation-wave4-2026-10-31.json).





Cette attestation W4 concerne **output/mcp-wave4-final-20261031**, avec quatre copies ciblées de correction et la seule préparation de dés Identify. Les 37 entrées source/tests, 23 binaires et 13 artefacts sont empreintés ; aucune dérive des entrées n’a été trouvée après validation. Elle ne certifie pas des fichiers étrangers au périmètre ou modifiés ensuite. PHB-SURVIVAL reste partiel ; repos et voyage ne deviennent pas livrés par transitivité. Cette livraison avait été validée sans nouvel audit des livres ; le registre reste autoritaire. La revalidation ponctuelle demandée ensuite est décrite ci-dessous.





**Relais des agents** : dès qu’un agent termine, un nouveau prend une autre tâche concrète du registre, y compris raccords, corrections révélées par les tests et validation. La plateforme autorise trois sous-agents actifs avec la coordination ; ce relais maintient cette capacité occupée sans reconstruire le backlog.


La vague W5 est livrée dans ses périmètres bornés : maîtrises d’armes, unconscious et pétrification/afflictions, parole des mots de commande, budget de rencontre, vol horizontal explicite, KO non létal, surprise et raccord de mort Consume Life. Validation finale : **1 201/1 201 tests**, TypeScript complet sortie 0, **30/30 tours mock**, neuf scénarios, 97 appels mock, **0 $**, **130 outils MCP** uniques. La copie finale comporte 181 dépendances moteur et 140 fichiers tests inchangés après validation ; le moteur partagé recompilé correspond aux 697 binaires validés. Preuves : [rapport W5](rules-audit/validation-wave5-2026-10-31.json). Les limites de chaque entrée restent ouvertes.





Les essais ciblés initiaux sont conservés : correction du timestamp indu de KO, puis correction des seules fixtures invalides et du deuxième d20 d’avantage. Les assertions sont conservées ; la suite complète finale confirme tous les cas sur la source figée. Aucun nouvel audit global n’a servi à cette livraison.





**W6 — 1er novembre, livrée dans ses périmètres** : réveil naturel des KO, pause/reprise et cures des sources sprite sous pierre, portées/tir à proximité, inspection et surprise explicite des presets. Les agents ont été réaffectés vers la tranche suivante, puis les tests d’orchestration, la documentation et la validation. La base initiale passait 1 201/1 201 tests avant W6 ; les preuves ciblées restent distinctes du contrôle intégré final.





**Validation finale W6** : **73/73 ciblés**, puis **1 274/1 274 tests**, compilation et TypeScript complets sortie 0 ; **30/30 tours mock**, neuf scénarios, 97 appels mock, **0 $**, objectifs atteints et aucune violation. Inventaire réel **131 outils** et schémas/annotations vérifiés. Les 183 fichiers moteur, quatre configurations, 145 fichiers tests/helpers et 295 sources d’intégration restent identiques au gel après exécution. Le moteur partagé a été recompilé puis comparé aux **705 binaires validés**, sans aucun écart. [Rapport permanent W6](rules-audit/validation-wave6-2026-11-01.json). Les limites ci-dessous demeurent ouvertes ; cette preuve ne déclare pas les 147 lots terminés.





**W7 — 1er novembre, livrée dans ses deux périmètres** : cycle des PNJ à 0 PV et fin des fournisseurs de pétrification sur les acteurs archivés de la même partie. La base W7 est identique par empreintes au W6 validé ; aucun nouvel audit global ni reconstruction du registre. Les agents ont été réaffectés vers les croisements, corrections, documentation et preuves de livraison.





**Validation finale W7 r2** : **83/83 ciblés**, puis **1 331/1 331 tests**, compilation et TypeScript complets sortie 0 ; **30/30 tours mock**, neuf scénarios, 97 appels mock, **0 $**, objectifs atteints et aucune violation. Inventaire réel **132 outils** et schémas/annotations vérifiés. Les 187 fichiers moteur, quatre configurations, 150 fichiers tests/helpers et 299 sources d’intégration restent identiques au gel après exécution. Le moteur partagé a été recompilé puis comparé aux **721 binaires validés**, sans écart. [Rapport permanent W7](rules-audit/validation-wave7-2026-11-01.json).





Les preuves privées A (81/81 puis 47/47), B (12/12 puis 96/96) et C restent distinctes et ne s’additionnent pas. Le premier gel intégré (82/82 et 1 330/1 330) précède le correctif des consignes de reprise du combat et le nouveau cas applicatif : seule la r2 atteste ces derniers fichiers et le playtest. Les croisements ont corrigé le ciblage physique des pièges vers un corps inconscient présent, la propriété des actions joueur/PNJ et la reprise explicitement choisie du batch après le jet PNJ dû ; aucun appel de jeu n’est fabriqué par le serveur. Les limites des deux fiches restent ouvertes et les 147 lots ne sont pas déclarés terminés.





**W8 — 1er novembre, livrée dans son périmètre** : opportunités et libérations d’attaques préparées non létales du joueur, depuis PHB-NONLETHAL. Deux schémas existants sont étendus, sans nouvel outil. Les agents ont été réaffectés aux croisements, régressions, corrections de fixtures, documentation et preuves. La base W8 est identique par empreintes au W7 r2 validé ; aucun nouvel audit global ni reconstruction du registre.





**Validation finale W8** : **72/72 ciblés combinés**, puis **1 365/1 365 tests**, compilation et TypeScript complets sortie 0 ; **30/30 tours mock**, neuf scénarios, 97 appels mock, **0 $**, objectifs atteints et aucune violation. Inventaire réel **132 outils** et nouveaux booléens optionnels vérifiés ; aucun choix KO ajouté à la préparation. Les 187 fichiers moteur, quatre configurations, 154 tests/helpers et 299 autres sources restent identiques au gel après exécution. Le moteur partagé recompilé correspond aux **721 binaires validés**, sans écart. [Rapport permanent W8](rules-audit/validation-wave8-2026-11-01.json).





Les preuves isolées A (12/12 puis 81/81), B (16/16 puis 112/112) et C (6/6 puis 31/31) restent distinctes, sans addition. Leurs premiers échecs de fixtures et reprises sont conservés. L’historique documentaire relu avant clôture est capturé séparément du guide final. La vérification ciblée de hero-combat.ts confirme une borne préexistante conservée : les attaques en réaction exigent une cible à PV positifs, même sans choix KO ou avec false. Les sorts de mêlée, les attaques non létales des monstres et les autres limites de PHB-NONLETHAL restent ouverts ; les 147 lots ne sont pas déclarés terminés.





**W9 — 1er novembre, livrée dans son périmètre MCP** : choix KO sur les vraies attaques de sorts de mêlée du catalogue actuel, limité à Arme spirituelle initiale, répétée ou issue d’un parchemin réel. Trois outils existants étendus, sans nouveau sort ni accès de fiche. Les agents ont été réaffectés aux croisements, correction du bonus de parchemin, documentation et validation. La base W9 correspond au W8 validé ; aucun nouvel audit global ni reconstruction du registre.





**Validation finale W9 de l’instantané r2 figé** : **97/97 ciblés**, **1 408/1 408 tests complets**, compilation MCP et TypeScript complet sortie 0 ; **30/30 tours mock**, neuf scénarios, 97 appels mock, **0 $**, objectifs atteints et aucun seuil violé. Inventaire **132 outils**, trois nouveaux booléens optionnels, contrats W8 préservés et sept fichiers du catalogue inchangés. L’instantané comporte 187 sources moteur, quatre configurations, 158 tests/helpers, 299 autres sources et **721 binaires**. [Rapport permanent W9](rules-audit/validation-wave9-2026-11-01.json).





**Parité constatée à la clôture W9, bornée au moteur** : à cet instant, les 187 sources MCP, quatre configurations et 721 binaires du projet étaient identiques à la r2, vérifiés en lecture seule ; aucune recompilation ROOT supplémentaire n’avait été faite pendant les tests d’un chantier concurrent. La comparaison globale ROOT était **fausse** : des modifications simultanées de l’application, de l’export training et de ses tests étaient hors de cette preuve. Les 1 408 tests certifient l’instantané r2. Un contrôle de compatibilité applicative distinct validait **15/15 tests ciblés** avec compilation privée et TypeScript, sans devenir une suite complète du chantier training. Les changements concurrents ont été conservés sans rollback. Les évolutions W10 décrites ensuite ne sont pas couvertes par cette attestation historique.





**Raccord de source W9** : le diagnostic a reproduit +7 au lieu du **+5 source** pour Arme spirituelle depuis un parchemin niveau 2 (SRD Spell Scroll p.242). Les données persistées de l’effet conservent désormais scrollAttackBonus et scrollItemId pour la frappe initiale et les répétitions, sans changer le modificateur de dégâts ni l’incantation ordinaire. Aucun bonus n’est reconstruit pour un ancien effet sans provenance. C-r2 valide 7/7 puis 48/48 ; les anciens privés A (18/18 puis 48/48), B (18/18 puis 69/69) et C (7/7 puis 50/50) restent pré-correctif et ne s’additionnent pas. La première full a été interrompue avant correction, sans résultat complet ni playtest revendiqués. Les limites de PHB-NONLETHAL restent ouvertes ; les 147 lots ne sont pas déclarés terminés.





**Poursuite continue W10 — en cours** : instruction utilisateur de traiter la suite du registre jusqu’au bout avec relais des agents. Trois missions actives portent des noms explicites : propriétés des armes (tenir/attaquer à deux mains, versatile puis munitions/propriétés), respiration/suffocation, initiative standard 2014. Le choix utilisateur remplace la relance d’initiative par round ; il est reporté dans AGENTS.md et le guide moteur. La copie de base output/mcp-wave10-baseline-20261101 conserve les 187 sources moteur W9 ; les évolutions concurrentes training/package/tests restent tracées séparément, sans rollback. Les validations sont regroupées par lots cohérents plutôt que par chaque petite modification. Aucun nouveau scanner de livres ou audit global.





**W10 — livraison des périmètres validés** : TypeScript complet sortie0, **1523/1523 tests**, **30/30 tours mock**, neuf scénarios,97appels mock, **0$**, aucune violation ; **141 outils MCP uniques** et neuf nouveaux outils contrôlés dans le vrai processus. Sont couverts l'initiative2014 conservée, prise/versatile, munitions/Loading et récupération monopièce mixte, suffocation, chutes établies, dégâts des objets et portage standard explicitement suivi. La première fullr1 avait12anciennes fixtures d'initiative en échec ; toutes les assertions mécaniques sont conservées et la fullr2 passe. Le premier mockr2 avait encore5écarts liés à ses faux dés de relance ; seule sa séquence du scénario combat a été corrigée, puis les six tests de contrat et les30tours ont passé. [Rapport W10](rules-audit/validation-wave10-2026-11-01.json).





Cette attestation concerne **output/mcp-wave10-integrated-r2-20261101**, avec la seule correction de fixture mock après sa full. Elle ne certifie pas les évolutions W11 simultanées du projet ; le moteur partagé n'a pas été recompilé par cette validation. Les agents sont déjà réaffectés à la recherche de munitions entre pièces, au transport physique et au cycle général joueur0PV ; la coordination poursuit les repos fragmentables. Les limites de chaque fiche restent ouvertes, sans prétendre les147lots terminés.





**Historique W11 — collectes ciblées avant la livraison finale ci-dessus** : Heavy/Reach (116/116), transport physique (67/67), voyage à pied et marche forcée (14 nouveaux cas puis 42 régressions distinctes), cycle joueur général à 0 PV (31 cas publics, six cas moteur/anneau et 19 unitaires distincts) avaient passé leurs validations privées avec compilation réussie. Les premiers21cas repos passaient dans une collecte de66/67, avec une ancienne fixture de sauvegarde de mort ensuite corrigée. Ces collectes ne s'additionnent pas ; la preuve finale est la r2,1679/1679 et mock30/30.





Les noms historiques `petrified_afflictions` et `hover_flight_navigation` ne désignent pas des blocages actuels : pause/reprise des afflictions et effets sprite sous pierre livrés en W5–W7, vol horizontal choisi livré en W5. Les limites d'altitude et des autres modes restent dans leurs lots, sans immobiliser les agents sur ces anciens noms. W11 est maintenant validée et publiée ; le relais courant est décrit au début de cette section. Les copies restent immuables pendant leurs exécutions de validation.





**Incident de compilation partagé du 2 novembre, réparé** : une compilation d'agent a visé le dossier partagé au lieu de sa copie privée et a été interrompue. Les 805 fichiers binaires connus de W10 r2 ont été restaurés depuis l'instantané validé, sans retrait de sources ni des fichiers supplémentaires ; le point d'entrée a été publié en dernier. Un vrai processus MCP démarre et expose les 141 outils attendus. Preuve bornée : `output/wave11-root-dist-repair-20261102.json`. Les sources W11 restent présentes ; leurs compilations et tests utilisent un dossier privé explicitement fixé, et cette réparation ne les déclare pas intégrées au binaire partagé.





<!-- /MCP-TRACKER:CURRENT-STATUS -->





Répartition du registre à cette étape : **98 à faire**, **3 entrées en cours**, **46 livrées partiellement**, **0 décision de principe en attente**. Plusieurs entrées de livres décrivent le même mécanisme et partagent un lot ; ces nombres ne sont pas un nombre d'outils distincts ni un pourcentage de règles couvertes.





### Lots déjà réalisés ou en validation





| Lot | État | Outils effectifs | Périmètre et limites |


|---|---|---|---|


| W1-EXHAUSTION | Livré dans son périmètre | `inspect_exhaustion`, `add_exhaustion`, `remove_exhaustion` | Niveaux0–6, effets réels, maxHP/Aid/Drain, mort/résurrection, reçus idempotents ; récupération alimentaire apportée par W4, refusée sans apports vérifiés. |


| W1-DM-INSPIRATION | Livré dans son périmètre | `grant_inspiration`, `spend_inspiration` | Réserve unique du MJ, choix du prochain type de jet avant les dés ; distinct de Bardic et bonusRP ; sans transfert autrePJ. |


| W1-SRD-SOURCE | Livré dans son périmètre | `consult_rules` | Ajouter le SRD5.1 récupéré à consult_rules, avec pages/provenance/licence ; aucune activation de pouvoirs de catalogue. |


| W2-TEMP-HP | Livré dans son périmètre | `grant_temporary_hp`, `inspect_temporary_hp` | Réserve et reçus persistants, choix garder/remplacer, absorption après défenses, concentration/dégâts à 0 PV, durée et repos ; toutes les sources de sorts/capacités ne sont pas distribuées automatiquement. |


| W2-COVER | Livré dans son périmètre | `configure_cover`, `inspect_cover` | +2/+5 CA/DEX directionnels, couverture totale et vraies origines ; prévalidation avant toute multiattaque et exception Sacred Flame. Géométrie 3D et propagation non modélisée autour des coins restent ouvertes. |


| W2-TWO-WEAPON | Livré dans son périmètre | `resolve_two_weapon_attack` | Deux instances légères, témoin Attaquer, bonus unique, modificateurs et styles acquis, lancers physiques et reprises. Duel vérifie les deux mains ; bonus vers les objets encore à raccorder. Aucun équipement/style/don gratuit. |


| W2-GRAPPLE-TRANSPORT | Livré dans son périmètre | `preview_grapple_transport`, `move_grappled_creature` | Prise réelle, deux destinations, chemins joints, demi-vitesse/exception taille, budget, réactions et libération par le détenteur joueur/monstre. Pas de poids général, gabarits multicases, prises multiples ni transfert inter-cartes. |


| W3-ARMOR-PENALTIES | Livré dans son périmètre | equip_item, cast_spell, vrais jets et déplacements | Port non maîtrisé autorisé, malus physiques, interdiction d’incanter et vraie vitesse ; pas d’exemption raciale inventée. |


| W3-LIGHT-GEAR | Livré dans son périmètre | manage_light_source, inspect_lighting | Lampes/lanternes, huile possédée, six heures, capot et cône orienté ; pas de combustible gratuit. |


| W3-CONSUMABLE-WEAPONS | Livré dans son périmètre | use_weapon_consumable, extinguish_alchemists_fire | Acide, eau bénite, feu grégeois sur créatures en combat ; objets, huile offensive, poison et filet restent ouverts. |


| W3-CHECK-MODES | Livré dans son périmètre | resolve_passive_check, resolve_group_check, provide_check_help | Passif, groupe réel et aide exacte hors combat ; aucune découverte/conséquence automatique. |


| W3-LIGHT-SENSES | Livré dans son périmètre | inspect_creature_senses, canSee | Profils natifs, portée, murs/couverture, blindsight et invisibilité ; tremorsense sans données de contact reste documentaire. |


| W3-CASTING-COMPONENTS | Livré dans son périmètre | inspect_spell_components, set_spell_component_constraint, cast_spell, resolve_reaction | V/S/M avant coûts, mains/focus réels et garantie native MM ; symboles portés et inventaires individuels PNJ non projetés. |


| W3-MOVEMENT-MODES | Livré dans son périmètre | move_token, combat_action(stand_up), transport en prise | Ramper ajoute son coût au terrain difficile ; lever à moitié vitesse ajustée avant Dash. Nage/escalade, vol vertical, squeezing et empreintes restent ouverts. |


| W4-NUTRITION | Livré dans son périmètre | inspect_survival, begin_nutrition_tracking, consume_provisions, resolve_survival_day, take_rest | Quantités possédées, faim/soif, reprise CON, échéances, récupération alimentaire ; respiration et suffocation restent ouvertes. |


| W5-WEAPONS | Livré dans son périmètre | attaques et objets réels | Maîtrises des quatre classes, sans bonus indu ; catalogue/propriétés restent bornés. |


| W5-CONDITIONS | Livré dans son périmètre | apply_condition, dégâts/soins, afflictions | Prone/chute réels et pause pétrification des 15 afflictions ; sommeil/poison sprite reste ouvert. |


| W5-COMMAND-WORD | Livré dans son périmètre | use_magic_item | Parole réelle de la Perle avant coûts, sans bloquer les baguettes sans composants. |


| W5-ENCOUNTER-BUDGET | Livré dans son périmètre | assess_encounter_budget | Estimation DMG solo lecture seule ; ni création ni XP ni équilibre garanti. |


| W5-HOVER-FLIGHT | Livré dans son périmètre | preview_navigation, move_token | Vol horizontal natif choisi, budgets et réactions ; altitude et vol automatique ouverts. |


| W5-NONLETHAL | Livré dans son périmètre | quatre résolveurs d’attaque existants | KO stable persistant, soins/rang/XP et gardes ; récupération naturelle et PNJ 0 PV bornés par refus. |


| W5-SURPRISE | Livré dans son périmètre | enter_combat, next_turn | Décision explicite, restrictions jusqu’à la fin individuelle réelle, slots KO traversés. |


| W5-CONSUME-LIFE | Livré dans son périmètre | use_monster_power | Horodatage de mort réelle utile à la résurrection ; aucun travail nutritionnel ajouté. |


| W6-KO-RECOVERY | Livré dans son périmètre | attaques, horloges, take_rest | Vrai d4 unique, 1 PV à échéance, archives sans activation ; anciens témoins et roster inconnu gardent refus. |


| W6-SPRITE-PETRIFIED | Livré dans son périmètre | apply_condition, resolve_monster_action, cast_spell | Pause/reprise et cure source exacte ; fin de fournisseur sur cible déjà archivée reste ouverte. |


| W6-RANGED-WEAPONS | Livré dans son périmètre | attaques physiques existantes | Portées normale/longue et proximité réelle ; munitions/loading et autres propriétés restent ouverts. |


| W6-PRESET-SURPRISE | Livré dans son périmètre | inspect_encounter, start_encounter | Roster confidentiel en lecture seule, indices explicites avant spawn ; embuscade autorée distincte. |


| W7-NPC-ZERO-HP | Livré dans son périmètre | configure_npc_death_saves, roll_death_save, combat_action, dégâts/soins/tours/horloges | Politique MJ préalable, épisodes réels, stabilité/mort/soins, événements et reçus ; archives limitées au jet dû explicite, aucun acteur ou rang inventé. |


| W7-ARCHIVED-CONDITIONS | Livré dans son périmètre | expirations de fournisseurs et horloges existantes | Dernière sortie de pierre et reprise des afflictions dans les archives réelles ; aucune extension des cibles publiques ou sauvegarde de poison automatique. |


| W8-NONLETHAL-REACTIONS | Livré dans son périmètre | resolve_reaction, resolve_readied_action | Choix KO explicite sur opportunité réelle ou libération de l’arme préparée ; booléens optionnels, réaction unique, dés/choix tenus et arrêt du déplacement sur KO. Sorts de mêlée et KO des monstres restent ouverts. |


| W9-NONLETHAL-MELEE-SPELLS | Livré dans son périmètre MCP | cast_spell, use_spell_scroll, use_subclass_feature | Arme spirituelle initiale/répétée/parchemin, choix par frappe, KO réel et bonus de parchemin +5 persistant. Pas de nouveau sort, de Ready bonus, de fenêtre Bardic ou de KO des monstres ; validation complète de l’instantané r2, application concurrente exclue. |








Les sept outils ajoutés en W2 sont `grant_temporary_hp`, `inspect_temporary_hp`, `configure_cover`, `inspect_cover`, `resolve_two_weapon_attack`, `preview_grapple_transport` et `move_grappled_creature`. `combat_action(release_grapple)` permet aussi au détenteur exact, joueur ou monstre, de relâcher sa prise sans action.





### Sources acquises et lacunes connues





Les quatre livres fournis ont déjà été inventoriés : 4 443 titres et 14 080 unités de matrice. Le [SRD 5.1 officiel 2014](../rules/supplements/srd-5.1-2014.source.json) et ses 403 pages sont archivés avec licence et empreintes ; `consult_rules` accepte `srd-5.1-2014`. Cette lecture n’active aucune capacité. Des fiches détaillées de Xanathar restent absentes ; elles sont listées dans les prérequis et les lots ci-dessous. Les options présentes dans les exports ne sont pas adoptées par défaut.





Archives : [PHB](rules-audit/phb-2014.md), [DMG](rules-audit/dmg-2014.md), [Xanathar](rules-audit/xge.md), [Monster Manual](rules-audit/mm-2014.md). Leurs fichiers JSON conservent les unités source exactes auxquelles renvoient les identifiants du registre.





## Revalidation ponctuelle après W4 — 31 octobre 2026





Cette mise à jour consigne la revalidation demandée explicitement après les livraisons W2–W4. La [synthèse de revalidation](rules-audit/revalidation-2026-10-31.md) rassemble les priorités et la matrice par chapitre. Elle ne remplace pas ce registre, ne reconstruit aucun de ses 147 lots et n'autorise aucun nouvel audit automatique ultérieur. Les quatre rapports détaillés [PHB](rules-audit/revalidation-phb-2026-10-31.md), [DMG](rules-audit/revalidation-dmg-2026-10-31.md), [Xanathar](rules-audit/revalidation-xge-2026-10-31.md) et [Monster Manual](rules-audit/revalidation-mm-2026-10-31.md) renvoient aux lots existants ; aucune règle facultative n'est adoptée et aucun mécanisme n'est corrigé par la seule écriture de ce constat.





- Les résultats W4 (**1 094 tests**, **30/30 tours mock**, **129 outils**) restent des preuves historiques bornées ; ils ne certifient pas toutes les règles ni les cas nouvellement identifiés.


- Correction de statut : MM-SENSES est désormais « Livré partiellement », car ses sens natifs et son outil d'inspection ont été livrés en W3. La répartition historique avant cette correction était 126 à faire / 17 partiels / 4 décisions ; la répartition courante est **125 / 18 / 4**.


- Constats ajoutés aux lots existants : maîtrise/prise des armes, transitions unconscious/petrified, mot de commande sous silence/bâillon, horodatage de Consume Life utile à la résurrection et déplacement des créatures volantes déjà actives. Chaque entrée précise si la preuve est statique ou reproduite.


- Trois [reproductions MCP isolées](../output/rules-revalidation-20261031/probes.json) ont été exécutées par la coordination, sans session persistée, DB, LLM ni modification du moteur : mort Consume Life, déplacement du fantôme et Perle de puissance sous silence. Les autres constats statiques devront recevoir leurs tests ciblés avant correction.


- **Préférence produit actuelle** : la suspension nutritionnelle d'un mort n'est pas un travail à intégrer. La conserver uniquement comme fait d'archive dans la sonde et comme comportement éventuel du code déjà livré, sans réouverture automatique. L'horodatage de mort, utile aux sorts de résurrection, reste un raccord distinct.





## Index de tous les travaux





| Identifiant | État courant | Priorité | Responsable | Livre |


|---|---|---|---|---|


| [PHB-CHARACTER-BUILDER](#phb-character-builder) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-OPTIONAL](#phb-optional) | À faire | P1 | Coordination — D&D 2014 standard | phb-2014 |


| [PHB-PROGRESSION](#phb-progression) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-RACIAL-TRAITS](#phb-racial-traits) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-LANGUAGES](#phb-languages) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-SOURCE-SUBRACES](#phb-source-subraces) | À faire | P2 | Agent C — sources, procédures MJ et couverture | phb-2014 |


| [PHB-CLASS-CATALOG](#phb-class-catalog) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-CLASS-BARBARIAN](#phb-class-barbarian) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-SPELL-CATALOG](#phb-spell-catalog) | À faire | P2 | Agent B — combat, magie et deux armes | phb-2014 |


| [PHB-SUBCLASSES](#phb-subclasses) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-CLASS-DRUID](#phb-class-druid) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-FIGHTING-STYLES](#phb-fighting-styles) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-CLASS-MONK](#phb-class-monk) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-CLASS-PALADIN](#phb-class-paladin) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-CLASS-RANGER](#phb-class-ranger) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-CLASS-ROGUE](#phb-class-rogue) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-CLASS-SORCERER](#phb-class-sorcerer) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-CLASS-WARLOCK](#phb-class-warlock) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-SPELLBOOK-RECOVERY](#phb-spellbook-recovery) | Livré partiellement | P2 | initiative_2014 réaffecté — remplacement et sauvegarde de grimoire | phb-2014 |


| [PHB-DM-INSPIRATION](#phb-dm-inspiration) | Livré partiellement | P1 | Agent B — combat, magie et deux armes | phb-2014 |


| [PHB-BACKGROUND-FEATURES](#phb-background-features) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-GEAR](#phb-gear) | Livré partiellement | P2 | proprietes_armes réaffecté — dangers et équipements au sol | phb-2014 |


| [PHB-ECONOMY](#phb-economy) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | phb-2014 |


| [PHB-ARMOR-PENALTIES](#phb-armor-penalties) | Livré partiellement | P1 | Coordination — validate_wave3 | phb-2014 |


| [PHB-WEAPONS](#phb-weapons) | Livré partiellement | P1 | proprietes_armes réaffecté — catalogue et armes spéciales | phb-2014 |


| [PHB-CONSUMABLE-WEAPONS](#phb-consumable-weapons) | Livré partiellement | P1 | Coordination — validate_wave3 | phb-2014 |


| [PHB-POISON-ITEMS](#phb-poison-items) | Livré partiellement | P2 | proprietes_armes réaffecté — Basic Poison et vrais projectiles | phb-2014 |


| [PHB-LIGHT-GEAR](#phb-light-gear) | Livré partiellement | P1 | Coordination — validate_wave3 | phb-2014 |


| [PHB-DOWNTIME](#phb-downtime) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | phb-2014 |


| [PHB-VEHICLES](#phb-vehicles) | À faire | P2 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-CHECK-MODES](#phb-check-modes) | Livré partiellement | P1 | Coordination — validate_wave3 | phb-2014 |


| [PHB-ENCUMBRANCE](#phb-encumbrance) | Livré partiellement | P1 | Coordination — transport physique | phb-2014 |


| [PHB-INITIATIVE-POLICY](#phb-initiative-policy) | Livré partiellement | P1 | initiative_2014 | phb-2014 |


| [PHB-TRAVEL](#phb-travel) | Livré partiellement | P1 | Coordination — voyage et orientation | phb-2014 |


| [PHB-MOVEMENT-MODES](#phb-movement-modes) | Livré partiellement | P1 | Coordination — raccord des modes de déplacement | phb-2014 |


| [PHB-VERTICAL-MOVEMENT](#phb-vertical-movement) | Livré partiellement | P1 | initiative_2014 réaffecté — sauts et surfaces réelles | phb-2014 |


| [PHB-ENVIRONMENT](#phb-environment) | Livré partiellement | P1 | Coordination — chute standard | phb-2014 |


| [PHB-SURVIVAL](#phb-survival) | Livré partiellement | P1 | Coordination — nutrition, forage et eau située | phb-2014 |


| [PHB-LIGHT-SENSES](#phb-light-senses) | Livré partiellement | P1 | Coordination — validate_wave3 | phb-2014 |


| [PHB-SOCIAL-POLICY](#phb-social-policy) | Livré partiellement | P1 | respiration réaffecté — politique sociale standard2014 | phb-2014 |


| [PHB-REST-LIFECYCLE](#phb-rest-lifecycle) | Livré partiellement | P1 | Coordination — périodes de repos validées W11 | phb-2014 |


| [PHB-COMBAT-CORE](#phb-combat-core) | À faire | P2 | Agent B — combat, magie et deux armes | phb-2014 |


| [PHB-SURPRISE](#phb-surprise) | Livré partiellement | P1 | Coordination — validation W6 | phb-2014 |


| [PHB-ACTION-EXTENSIONS](#phb-action-extensions) | À faire | P2 | Agent B — combat, magie et deux armes | phb-2014 |


| [PHB-TWO-WEAPON](#phb-two-weapon) | Livré partiellement | P1 | Agent B — combat, magie et deux armes | phb-2014 |


| [PHB-GRAPPLE-TRANSPORT](#phb-grapple-transport) | Livré partiellement | P1 | Coordination — intégration, déplacements et validation | phb-2014 |


| [PHB-COVER](#phb-cover) | Livré partiellement | P1 | Agent C — sources, procédures MJ et couverture | phb-2014 |


| [PHB-DAMAGE-EXTENSIONS](#phb-damage-extensions) | Livré partiellement | P2 | Coordination — cycles à 0 PV et plafonds de soin | phb-2014 |


| [PHB-NONLETHAL](#phb-nonlethal) | Livré partiellement | P1 | nonlethal_attacks | phb-2014 |


| [PHB-TEMP-HP](#phb-temp-hp) | Livré partiellement | P1 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [PHB-ADVANCED-COMBAT](#phb-advanced-combat) | Livré partiellement | P2 | Coordination — sous-eau W18 publié | phb-2014 |


| [PHB-CASTING-TIME](#phb-casting-time) | Livré partiellement | P1 | Coordination — incantations longues et application | phb-2014 |


| [PHB-CASTING-COMPONENTS](#phb-casting-components) | Livré partiellement | P1 | Coordination — validate_wave3 | phb-2014 |


| [PHB-SPELL-AREAS](#phb-spell-areas) | Livré partiellement | P1 | respiration réaffecté — volumes des zones2014 | phb-2014 |


| [PHB-SPELLS-0-4](#phb-spells-0-4) | Livré partiellement | P1 | Agent B — combat, magie et deux armes | phb-2014 |


| [PHB-SPELLS-5-9](#phb-spells-5-9) | À faire | P2 | Agent B — combat, magie et deux armes | phb-2014 |


| [PHB-CONDITION-SEMANTICS](#phb-condition-semantics) | Livré partiellement | P1 | Coordination — conditions livrées W5–W7 | phb-2014 |


| [PHB-EXHAUSTION](#phb-exhaustion) | Livré partiellement | P1 | Agent A — personnage, survie et PV temporaires | phb-2014 |


| [DMG-RENOWN](#dmg-renown) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [DMG-RESURRECTION](#dmg-resurrection) | À faire | P3 | Agent B — combat, magie et deux armes | dmg-2014 |


| [DMG-CALENDAR](#dmg-calendar) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [CHARACTER-PROGRESSION](#character-progression) | À faire | P3 | Agent A — personnage, survie et PV temporaires | dmg-2014 |


| [DMG-PLANAR-TRAVEL](#dmg-planar-travel) | À faire | P3 | Agent A — personnage, survie et PV temporaires | dmg-2014 |


| [DMG-PLANAR-HAZARDS](#dmg-planar-hazards) | À faire | P3 | Agent B — combat, magie et deux armes | dmg-2014 |


| [DMG-ADVENTURE-PROCEDURE](#dmg-adventure-procedure) | À faire | P3 | Agent B — combat, magie et deux armes | dmg-2014 |


| [ENCOUNTER-BUDGET](#encounter-budget) | Livré partiellement | P1 | Coordination — validation W5 | dmg-2014 |


| [ENCOUNTER-RANDOM](#encounter-random) | Livré partiellement | P2 | Coordination — tables composées puis contrôles persistés | dmg-2014 |


| [NPC-COMPANIONS](#npc-companions) | À faire | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [CHARACTER-OPTIONS](#character-options) | À faire | P3 | Agent A — personnage, survie et PV temporaires | dmg-2014 |


| [DMG-DUNGEON-GENERATION](#dmg-dungeon-generation) | À faire | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [DOORS-DISCOVERY](#doors-discovery) | Livré partiellement | P1 | Coordination — découverte et projection des portes | dmg-2014 |


| [ENVIRONMENT-STRUCTURES](#environment-structures) | À faire | P2 | Agent A — personnage, survie et PV temporaires | dmg-2014 |


| [LIGHTING-EXTENSION](#lighting-extension) | À faire | P2 | Agent A — personnage, survie et PV temporaires | dmg-2014 |


| [TRAVEL-SURVIVAL](#travel-survival) | Livré partiellement | P1 | initiative_2014 + respiration — météo/exposition/perception | dmg-2014 |


| [ENVIRONMENT-HAZARDS](#environment-hazards) | Livré partiellement | P1 | Agent A — personnage, survie et PV temporaires | dmg-2014 |


| [DMG-URBAN-EVENTS](#dmg-urban-events) | Livré partiellement | P3 | Agent B — combat, magie et deux armes | dmg-2014 |


| [MOVEMENT-3D](#movement-3d) | À faire | P1 | Agent A — personnage, survie et PV temporaires | dmg-2014 |


| [TRAPS-EXTENSION](#traps-extension) | À faire | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [DMG-CAMPAIGN-TRACKING](#dmg-campaign-tracking) | À faire | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [DOWNTIME-ECONOMY](#downtime-economy) | Livré partiellement | P1 | respiration réaffecté — commerce et fabrication ordinaire2014 | dmg-2014 |


| [TREASURE-CATALOG](#treasure-catalog) | À faire | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [MAGIC-ITEMS-CATALOG](#magic-items-catalog) | À faire | P1 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [MAGIC-ATTUNEMENT-NPC](#magic-attunement-npc) | À faire | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [MAGIC-CURSED-ITEMS](#magic-cursed-items) | À faire | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [SCROLLS-EXTENSION](#scrolls-extension) | À faire | P2 | Agent B — combat, magie et deux armes | dmg-2014 |


| [DMG-OPTIONAL-RULES](#dmg-optional-rules) | Livré partiellement | P3 | Agent B — combat, magie et deux armes | dmg-2014 |


| [MAGIC-EQUIPMENT-SLOTS](#magic-equipment-slots) | À faire | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [MAGIC-ITEM-EDGE-RULES](#magic-item-edge-rules) | Livré partiellement | P2 | Coordination — validation W5 | dmg-2014 |


| [OBJECT-DAMAGE](#object-damage) | Livré partiellement | P1 | initiative_2014 réaffecté — objets | dmg-2014 |


| [MAGIC-MINOR-PROPERTIES](#magic-minor-properties) | À faire | P3 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [MAGIC-SENTIENT-ARTIFACTS](#magic-sentient-artifacts) | À faire | P3 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [DMG-SPECIAL-REWARDS](#dmg-special-rewards) | À faire | P3 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [ABILITY-EDGE-RULES](#ability-edge-rules) | À faire | P2 | Agent B — combat, magie et deux armes | dmg-2014 |


| [DM-INSPIRATION](#dm-inspiration) | Livré partiellement | P1 | Agent B — combat, magie et deux armes | dmg-2014 |


| [SOCIAL-DMG-REACTIONS](#social-dmg-reactions) | Livré partiellement | P2 | respiration réaffecté — attitudes et réactions DMG | dmg-2014 |


| [COMBAT-EDGE-RULES](#combat-edge-rules) | À faire | P1 | Agent B — combat, magie et deux armes | dmg-2014 |


| [CONTRACT-INITIATIVE](#contract-initiative) | Livré partiellement | P0 | initiative_2014 | dmg-2014 |


| [SPELL-AREAS-EXTENSION](#spell-areas-extension) | À faire | P2 | Agent B — combat, magie et deux armes | dmg-2014 |


| [MASS-COMBAT-SIEGE](#mass-combat-siege) | À faire | P3 | Agent B — combat, magie et deux armes | dmg-2014 |


| [COVER-TARGETING](#cover-targeting) | Livré partiellement | P1 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [EFFECT-STACKING](#effect-stacking) | À faire | P2 | Agent B — combat, magie et deux armes | dmg-2014 |


| [DMG-CHASES](#dmg-chases) | Livré partiellement | P2 | Agent A — personnage, survie et PV temporaires | dmg-2014 |


| [DISEASE-MADNESS](#disease-madness) | Livré partiellement | P1 | Agent B — combat, magie et deux armes | dmg-2014 |


| [NPC-AFFLICTIONS](#npc-afflictions) | À faire | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [POISONS-PLAYER-USE](#poisons-player-use) | Livré partiellement | P1 | Coordination — noyau, nutrition et récolte W18 publiés | dmg-2014 |


| [XP-ADVANCEMENT](#xp-advancement) | À faire | P2 | Agent A — personnage, survie et PV temporaires | dmg-2014 |


| [CREATOR-WORKSHOP](#creator-workshop) | À faire | P3 | Agent B — combat, magie et deux armes | dmg-2014 |


| [MONSTER-CATALOG](#monster-catalog) | À faire | P2 | Agent C — sources, procédures MJ et couverture | dmg-2014 |


| [ENVIRONMENT-MAP-IMPORT](#environment-map-import) | À faire | P3 | Agent A — personnage, survie et PV temporaires | dmg-2014 |


| [XGE-EFFECT-ORDER](#xge-effect-order) | À faire | P1 | Agent B — combat, magie et deux armes | xge |


| [XGE-TEMP-HP](#xge-temp-hp) | Livré partiellement | P1 | Agent A — personnage, survie et PV temporaires | xge |


| [XGE-SLEEP](#xge-sleep) | Livré partiellement | P1 | Agent A — personnage, survie et PV temporaires | xge |


| [XGE-FALLING](#xge-falling) | Livré partiellement | P2 | Agent A — personnage, survie et PV temporaires | xge |


| [XGE-ADAMANTINE](#xge-adamantine) | Livré partiellement | P2 | Agent B — combat, magie et deux armes | xge |


| [XGE-KNOTS](#xge-knots) | Livré partiellement | P2 | Agent B — combat, magie et deux armes | xge |


| [XGE-TOOL-DETAILS](#xge-tool-details) | À faire | P3 | Agent B — combat, magie et deux armes | xge |


| [XGE-SPELL-PERCEPTION](#xge-spell-perception) | Livré partiellement | P2 | Agent B — combat, magie et deux armes | xge |


| [XGE-INVALID-TARGET](#xge-invalid-target) | Livré partiellement | P3 | Agent B — combat, magie et deux armes | xge |


| [XGE-AOE-OPTIONS](#xge-aoe-options) | À faire | P3 | Agent B — combat, magie et deux armes | xge |


| [XGE-ENCOUNTER](#xge-encounter) | Livré partiellement | P1 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-RANDOM-ENCOUNTERS](#xge-random-encounters) | À faire | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-SIMPLE-TRAPS](#xge-simple-traps) | À faire | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-COMPLEX-TRAPS](#xge-complex-traps) | À faire | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-DOWNTIME-LEDGER](#xge-downtime-ledger) | Livré partiellement | P1 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-DOWNTIME-MARKET](#xge-downtime-market) | À faire | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-DOWNTIME-CRAFT](#xge-downtime-craft) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-DOWNTIME-SCROLL](#xge-downtime-scroll) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-DOWNTIME-RESEARCH](#xge-downtime-research) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-DOWNTIME-TRAINING](#xge-downtime-training) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-DOWNTIME-WORK](#xge-downtime-work) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-DOWNTIME-SOCIAL](#xge-downtime-social) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-DOWNTIME-RISK](#xge-downtime-risk) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-DOWNTIME-RELAX](#xge-downtime-relax) | Livré partiellement | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-ITEM-DISTRIBUTION](#xge-item-distribution) | À faire | P2 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-RECHARGE-CALENDAR](#xge-recharge-calendar) | Livré partiellement | P3 | Agent C — sources, procédures MJ et couverture | xge |


| [XGE-SUBCLASSES](#xge-subclasses) | À faire | P3 | Agent A — personnage, survie et PV temporaires | xge |


| [XGE-RACIAL-FEATS](#xge-racial-feats) | À faire | P3 | Agent A — personnage, survie et PV temporaires | xge |


| [XGE-SPELL-CATALOG](#xge-spell-catalog) | À faire | P3 | Agent B — combat, magie et deux armes | xge |


| [XGE-COMMON-ITEMS](#xge-common-items) | À faire | P3 | Agent B — combat, magie et deux armes | xge |


| [XGE-SHARED-CAMPAIGN](#xge-shared-campaign) | À faire | P3 | Agent C — sources, procédures MJ et couverture | xge |


| [MM-POWERS](#mm-powers) | Livré partiellement | P2 | Coordination — pouvoirs/vol natif W20 partiels | mm-2014 |


| [MM-CATALOG](#mm-catalog) | À faire | P2 | Agent C — sources, procédures MJ et couverture | mm-2014 |


| [MM-MOVEMENT](#mm-movement) | Livré partiellement | P2 | Coordination — validation W5 | mm-2014 |


| [MM-SENSES](#mm-senses) | Livré partiellement | P2 | Coordination — revalidation des sens natifs W3 | mm-2014 |


| [MM-RECONCILE](#mm-reconcile) | À faire | P2 | Coordination — intégration, déplacements et validation | mm-2014 |


| [MM-SPELLS](#mm-spells) | À faire | P2 | Agent B — combat, magie et deux armes | mm-2014 |


| [MM-LEGENDARY](#mm-legendary) | À faire | P2 | Agent B — combat, magie et deux armes | mm-2014 |





## Fiches de travail





Chaque fiche décrit le constat historique puis le travail courant. Les dépendances non terminées restent ouvertes même lorsqu’un sous-ensemble borné a été livré. Les catalogues liés restent les listes détaillées déjà établies ; on ne les redécouvre pas par un nouvel audit.





### PHB-CHARACTER-BUILDER





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Sélection initiale parmi quatre prétirés ; pas construction libre, allocation d’attributs, race ou équipement initial complet.


- **Règles concernées** : 1. Choose a Race ; 2. Choose a Class ; 3. Determine Ability Scores ; Ability Score Summary ; Ability Score Point Cost ; Ability Scores and Modifiers ; 5. Choose Equipment ; Armor Class ; Proficiencies ; Equipment ; Starting Equipment ; Starting Wealth by Class.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 17 unités rattachées à ce lot.


- **Noms envisagés dans l’audit** : `create_character_profile`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-OPTIONAL





- **État** : À faire. **Priorité** : decision. **Responsable** : Coordination — intégration, déplacements et validation.


- **Constat de l’audit initial** : Option non adoptée automatiquement ; le fichier contient aussi des options supplémentaires et des renvois incomplets. Vérifier version et décider avant implémentation.


- **Règles concernées** : Variant: Customizing Ability Scores ; Level 3: Primal Knowledge ; Level 7: Instinctive Pounce ; Level 2: Magical Inspiration ; Level 4: Bardic Versatility ; Level 2: Channel Divinity: Harness Divine Power ; Level 4: Cantrip Versatility ; Level 2: Wild Companion ; Blind Fighting ; Interception ; Superior Technique ; Thrown Weapon Fighting ; Unarmed Fighting ; Level 4: Martial Versatility ; Level 2: Dedicated Weapon ; Level 3: Ki-Fueled Attack ; Level 4: Quickened Healing ; Level 5: Focused Aim ; Blessed Warrior ; Level 3: Sacred Oath ; Channel Divinity: Harness Divine Power ; Level 1: Favored Foe ; Level 1: Deft Explorer ; Druidic Warrior ; et 31 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 62 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Décision utilisateur du 1er novembre — poursuite complète** : règles standard D&D 2014 par défaut, explicitement choisies par l’utilisateur ; initiative conservée pendant tout le combat. La décision de principe est actée, le raccord effectif reste à réaliser/valider. Les variantes ne sont pas activées par défaut, et les options d’une autre édition ne deviennent pas des règles 2014. Les règles maison antérieures ne constituent pas une conformité PHB acquise.





### PHB-PROGRESSION





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Pas de progression continue XP/niveaux1–20 ; profils prédéfinis3/7. Ajouter choix de niveau du même personnage sans bascule de characterId.


- **Règles concernées** : Beyond 1st Level ; Tiers of Play ; Level 1: Bardic Inspiration ; Level 1: Spellcasting ; Spellcasting Ability ; Spellcasting Focus ; Level 2: Jack of All Trades ; Level 2: Song of Rest (d6) ; Level 3: Expertise ; Level 4: Ability Score Improvement ; Level 5: Bardic Inspiration (d8) ; Level 5: Font of Inspiration ; Level 6: Countercharm ; Level 8: Ability Score Improvement ; Level 9: Song of Rest (d8) ; Level 10: Bardic Inspiration (d10) ; Level 10: Expertise ; Level 10: Magical Secrets ; Level 12: Ability Score Improvement ; Level 13: Song of Rest (d10) ; Level 14: Magical Secrets ; Level 14: Bard College feature ; Level 15: Bardic Inspiration (d12) ; Level 16: Ability Score Improvement ; et 36 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 81 unités rattachées à ce lot.


- **Outils existants à compléter** : `prepare_spells`, `use_subclass_feature`.


- **Noms envisagés dans l’audit** : `award_experience`, `level_up_character`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Dépendances** : [PHB-CHARACTER-BUILDER](#phb-character-builder).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-RACIAL-TRAITS





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Race/sous-race et trait racial non attribués par un registre joueur. Un sens de monstre ou un sort analogue ne vaut pas cette capacité raciale.


- **Règles concernées** : Dragonborn ; Gnome ; Half-Elf ; Half-Orc ; Tiefling ; Racial Traits ; Ability Score Increase ; Size ; Speed ; Subraces ; Draconic Ancestry ; Breath Weapon ; Damage Resistance ; Dwarf ; Traits ; Darkvision ; Dwarven Resilience ; Dwarven Combat Training ; Tool Proficiency ; Stonecunning ; Elf ; Keen Senses ; Fey Ancestry ; Trance ; et 12 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 61 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-LANGUAGES





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Champ languages en données ; pas sélection raciale ni compréhension universelle vérifiée.


- **Règles concernées** : Languages ; Standard Languages ; Exotic Languages.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 14 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-SOURCE-SUBRACES





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Sous-race nommée sans sa fiche détaillée dans ce passage ; aucune mécanique à inventer depuis ce nom.


- **Règles concernées** : Dwarf (Duergar) ; Dwarf (Hill) ; Dwarf (Mark of Warding) ; Dwarf (Mountain) ; Elf (Drow) ; Elf (Eladrin) (<span title="Dungeon Master’s Guide (2014)">DMG'14</span>) ; Elf (Eladrin) (<span title="Mordenkainen’s Tome of Foes">MTF</span>) ; Elf (High) ; Elf (Mark of Shadow) ; Elf (Pallid) ; Elf (Sea) ; Elf (Shadar-kai) ; Elf (Wood) ; Gnome (Deep) ; Gnome (Deep/Svirfneblin) ; Gnome (Forest) ; Gnome (Mark of Scribing) ; Gnome (Rock) ; Halfling (Ghostwise) ; Halfling (Lightfoot) ; Halfling (Lotusden) ; Halfling (Mark of Healing) ; Halfling (Mark of Hospitality) ; Halfling (Stout).


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 24 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CLASS-CATALOG





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Quatre classes jouables seulement : Fighter, Bard, Cleric, Wizard ; pas douze kits complets.


- **Règles concernées** : Classes ; Bard ; Cleric ; Fighter ; Wizard.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 5 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CLASS-BARBARIAN





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Classe et capacités non jouables ; aucune attribution via un nom narratif ou des statistiques de monstre.


- **Règles concernées** : Barbarian ; Level 1: Rage ; Level 1: Unarmored Defense ; Level 2: Danger Sense ; Level 2: Reckless Attack ; Level 3: Primal Path ; Level 4: Ability Score Improvement ; Level 5: Extra Attack ; Level 5: Fast Movement ; Level 6: Path Feature ; Level 7: Feral Instinct ; Level 8: Ability Score Improvement ; Level 9: Brutal Critical (1 die) ; Level 10: Path feature ; Level 11: Relentless Rage ; Level 12: Ability Score Improvement ; Level 13: Brutal Critical (2 dice) ; Level 14: Path feature ; Level 15: Persistent Rage ; Level 16: Ability Score Improvement ; Level 17: Brutal Critical (3 dice) ; Level 18: Indomitable Might ; Level 19: Ability Score Improvement ; Level 20: Primal Champion.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 24 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-SPELL-CATALOG





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Sorts, préparation, livre et copie effectivement suivis ; classes/niveaux/choix limités aux profils et au catalogue source du moteur.


- **Règles concernées** : Cantrips ; Spell Slots ; Spells Known of 1st Level and Higher ; Ritual Casting ; Preparing and Casting Spells ; Spellbook ; Learning Spells of 1st Level and Higher ; Your Spellbook ; Copying a Spell into the Book ; Copying from a Spell Scroll ; Cast a Spell ; Spellcasting ; What is a Spell? ; Spell Level ; Known and Prepared Spells ; Casting a Spell at a Higher Level ; Rituals ; Casting a Spell ; Casting in Armor ; Bonus Action ; Reactions ; Range ; Duration ; Instantaneous ; et 9 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 40 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





**Entrées de catalogue identifiées** : Cantrips ; Spell Slots ; Spells Known of 1st Level and Higher ; Ritual Casting ; Preparing and Casting Spells ; Spellbook ; Learning Spells of 1st Level and Higher ; Your Spellbook ; Copying a Spell into the Book ; Copying from a Spell Scroll ; Cast a Spell ; Spellcasting ; What is a Spell? ; Spell Level ; Known and Prepared Spells ; Casting a Spell at a Higher Level ; Rituals ; Casting a Spell ; Casting in Armor ; Bonus Action ; Reactions ; Range ; Duration ; Instantaneous ; Concentration ; Targets ; A Clear Path to the Target ; Targeting Yourself ; The Schools of Magic ; Saving Throws ; Attack Rolls ; Combining Magical Effects ; The Weave of Magic.





### PHB-SUBCLASSES





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Une spécialisation SRD par classe ; fiches détaillées de toutes les sous-classes absentes des renvois locaux.


- **Règles concernées** : Level 3: Bard College ; Level 6: Bard College feature ; Level 1: Divine Domain ; Domain Spells ; Level 2: Divine Domain feature ; Level 6: Divine Domain feature ; Level 3: Martial Archetype ; Level 7: Martial Archetype feature ; Level 2: Arcane Tradition ; Level 6: Arcane Tradition feature.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 10 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CLASS-DRUID





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Classe et capacités non jouables ; aucune attribution via un nom narratif ou des statistiques de monstre.


- **Règles concernées** : Druid ; Level 1: Druidic ; Level 1: Spellcasting ; Cantrips ; Preparing and Casting Spells ; Spellcasting Ability ; Ritual Casting ; Spellcasting Focus ; Level 2: Wild Shape ; Beast Shapes ; Level 2: Druid Circle ; Level 4: Wild Shape Improvement ; Level 4: Ability Score Improvement ; Level 6: Druid Circle feature ; Level 8: Wild Shape Improvement ; Level 8: Ability Score Improvement ; Level 10: Druid Circle feature ; Level 12: Ability Score Improvement ; Level 14: Druid Circle feature ; Level 16: Ability Score Improvement ; Level 18: Timeless Body ; Level 18: Beast Spells ; Level 19: Ability Score Improvement ; Level 20: Archdruid.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 24 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-FIGHTING-STYLES





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Duel configuré ; autres styles et choix libres absents.


- **Règles concernées** : Level 1: Fighting Style ; Archery ; Defense ; Dueling ; Great Weapon Fighting ; Protection ; Two-Weapon Fighting.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 7 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CLASS-MONK





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Classe et capacités non jouables ; aucune attribution via un nom narratif ou des statistiques de monstre.


- **Règles concernées** : Monk ; Level 1: Unarmored Defense ; Level 1: Martial Arts ; Level 2: Ki ; Flurry of Blows ; Patient Defense ; Step of the Wind ; Level 2: Unarmored Movement ; Level 3: Deflect Missiles ; Level 3: Monastic Tradition ; Level 4: Ability Score Improvement ; Level 4: Slow Fall ; Level 5: Extra Attack ; Level 5: Stunning Strike ; Level 6: Ki-Empowered Strikes ; Level 6: Monastic Tradition feature ; Level 7: Evasion ; Level 7: Stillness of Mind ; Level 8: Ability Score Improvement ; Level 9: Unarmored Movement improvement ; Level 10: Purity of Body ; Level 11: Monastic Tradition feature ; Level 12: Ability Score Improvement ; Level 13: Tongue of the Sun and Moon ; et 7 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 31 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CLASS-PALADIN





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Classe et capacités non jouables ; aucune attribution via un nom narratif ou des statistiques de monstre.


- **Règles concernées** : Paladin ; Level 1: Divine Sense ; Level 1: Lay on Hands ; Level 2: Divine Smite ; Level 2: Fighting Style ; Defense ; Dueling ; Great Weapon Fighting ; Protection ; Level 2: Spellcasting ; Preparing and Casting Spells ; Spellcasting Ability ; Spellcasting Focus ; Level 3: Divine Health ; Oath Spells ; Channel Divinity ; Breaking Your Oath ; Level 4: Ability Score Improvement ; Level 5: Extra Attack ; Level 6: Aura of Protection ; Level 7: Sacred Oath feature ; Level 8: Ability Score Improvement ; Level 10: Aura of Courage ; Level 11: Improved Divine Smite ; et 7 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 31 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CLASS-RANGER





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Classe et capacités non jouables ; aucune attribution via un nom narratif ou des statistiques de monstre.


- **Règles concernées** : Ranger ; Level 1: Favored Enemy ; Level 1: Natural Explorer ; Canny ; Level 2: Fighting Style ; Archery ; Defense ; Dueling ; Two-Weapon Fighting ; Level 2: Spellcasting ; Spell Slots ; Spells Known of 1st Level and Higher ; Spellcasting Ability ; Level 3: Ranger Archetype ; Level 3: Primeval Awareness ; Primal Awareness Spells ; Level 4: Ability Score Improvement ; Level 5: Extra Attack ; Level 6: Favored Enemy and Natural Explorer improvements ; Level 6: Deft Explorer Improvement ; Roving ; Level 7: Ranger Archetype feature ; Level 8: Ability Score Improvement ; Level 8: Land's Stride ; et 13 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 37 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CLASS-ROGUE





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Classe et capacités non jouables ; aucune attribution via un nom narratif ou des statistiques de monstre.


- **Règles concernées** : Rogue ; Level 1: Expertise ; Level 1: Sneak Attack ; Level 1: Thieves' Cant ; Level 2: Cunning Action ; Level 3: Roguish Archetype ; Level 4: Ability Score Improvement ; Level 5: Uncanny Dodge ; Level 6: Expertise ; Level 7: Evasion ; Level 8: Ability Score Improvement ; Level 9: Roguish Archetype feature ; Level 10: Ability Score Improvement ; Level 11: Reliable Talent ; Level 12: Ability Score Improvement ; Level 13: Roguish Archetype feature ; Level 14: Blindsense ; Level 15: Slippery Mind ; Level 16: Ability Score Improvement ; Level 17: Roguish Archetype feature ; Level 18: Elusive ; Level 19: Ability Score Improvement ; Level 20: Stroke of Luck.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 23 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CLASS-SORCERER





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Classe et capacités non jouables ; aucune attribution via un nom narratif ou des statistiques de monstre.


- **Règles concernées** : Sorcerer ; Level 1: Spellcasting ; Cantrips ; Spell Slots ; Spells Known of 1st Level and Higher ; Spellcasting Ability ; Spellcasting Focus ; Level 1: Sorcerous Origin ; Level 2: Font of Magic ; Sorcery Points ; Flexible Casting ; Creating Spell Slots ; Converting a Spell Slot to Sorcery Points ; Level 3: Metamagic ; Careful Spell ; Distant Spell ; Empowered Spell ; Extended Spell ; Heightened Spell ; Quickened Spell ; Subtle Spell ; Twinned Spell ; Seeking Spell ; Transmuted Spell ; et 11 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 36 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CLASS-WARLOCK





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Classe et capacités non jouables ; aucune attribution via un nom narratif ou des statistiques de monstre.


- **Règles concernées** : Warlock ; Level 1: Pact Magic ; Cantrips ; Spell Slots ; Spells Known of 1st Level and Higher ; Spellcasting Ability ; Spellcasting Focus ; Level 1: Otherworldly Patron ; Level 3: Pact Boon ; Pact of the Blade ; Pact of the Chain ; Pact of the Talisman ; Pact of the Tome ; Level 4: Ability Score Improvement ; Level 6: Otherworldly Patron feature ; Level 8: Ability Score Improvement ; Level 10: Otherworldly Patron feature ; Level 11: Mystic Arcanum (6th level) ; Level 12: Ability Score Improvement ; Level 13: Mystic Arcanum (7th level) ; Level 14: Otherworldly Patron feature ; Level 15: Mystic Arcanum (8th level) ; Level 16: Ability Score Improvement ; Level 17: Mystic Arcanum (9th level) ; et 2 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 26 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-SPELLBOOK-RECOVERY





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : initiative_2014 réaffecté après le gel météo.


- **Constat de l’audit initial** : Copie normale/parchemin présente ; remplacement/sauvegarde de grimoire au tarif de 1 h/10 po par niveau non résolu.


- **Règles concernées** : Replacing the Book.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 1 unités rattachées à ce lot.


- **Outils existants à compléter** : `copy_spell_to_book`.


- **Noms envisagés dans l’audit** : `copy_spellbook`, `replace_spellbook`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Démarrage après gel météo C — 2 novembre** : consultation ciblée de Replacing the Book et contrat de vraie identité des livres, perte et sorts préparés, copie personnelle1h/10po par niveau. Aucun livre/sort/matériau acquis gratuitement, aucune restauration de tous les anciens sorts après perte. Raccord avec copie ordinaire/parchemin, bourse canonique, durée réelle et reçus à préparer ; nouveau privé distinct, aucun outil de ce lot encore déclaré livré.





- **Validation et publication W14 du 2 novembre** :1925/1925tests, TypeScript/build0, mock30/30 (neuf scénarios,71appels,0$, objectifs OK),208outils réellement exposés. Les642entrées figées et1049binaires publiés concordent ; [rapport permanent W14](rules-audit/validation-wave14-2026-11-02.json). Ce lot sort du travail actif dans son périmètre livré ; ses limites spécifiques ci-dessus et les autres lots de catalogue restent distincts. Les sources des agents suivantes ne sont pas couvertes par cette livraison.





### PHB-DM-INSPIRATION





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Inspiration du MJ (avantage conservé) absente ; Inspiration bardique et bonusRP numériques sont des règles différentes.


- **Règles concernées** : Inspiration ; Gaining Inspiration ; Using Inspiration.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 3 unités rattachées à ce lot.


- **Outils existants à compléter** : `roll_ability_check`, `resolve_player_attack`, `resolve_saving_throw`.


- **Noms envisagés dans l’audit** : `grant_inspiration`, `use_inspiration`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Intégration courante — W1-DM-INSPIRATION** : Réserve unique du MJ, choix du prochain type de jet avant les dés ; distinct de Bardic et bonusRP ; sans transfert autrePJ.


- **Outils effectifs** : `grant_inspiration`, `spend_inspiration`.


- **Fichiers** : [lib/dm-inspiration-state.ts](../lib/dm-inspiration-state.ts), [mcp-server/dm-inspiration.ts](../mcp-server/dm-inspiration.ts), [mcp-server/tools/dm-inspiration-tools.ts](../mcp-server/tools/dm-inspiration-tools.ts), [tests/dm-inspiration.test.cjs](../tests/dm-inspiration.test.cjs).


- **Validation** : TypeScript OK ; 942/942 tests ; 30/30 tours mock ; 42 fichiers identiques à la copie validée.


- **Reste connu** : One SRD player: no transfer to another player character. Pre-roll reservation only, no retrospective alteration of held results or 2024 reroll. Bardic Inspiration and numerical house roleplay bonus retain separate state.





### PHB-BACKGROUND-FEATURES





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Avantage d’historique non relié à un état/résolveur source ; nommer cet historique ne produit pas l’avantage.


- **Règles concernées** : Feature: Shelter of the Faithful ; Feature: False Identity ; Feature: Criminal Contact ; Feature: By Popular Demand ; Feature: Rustic Hospitality ; Feature: Guild Membership ; Feature: Discovery ; Feature: Position of Privilege ; Feature: Wanderer ; Feature: Researcher ; Feature: Ship's Passage ; Feature: Military Rank ; Feature: City Secrets.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 13 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-GEAR





<!-- BEGIN:W23-BRIDGE-PHB-GEAR -->


- **Raccord W23 — acquisition de corde seulement** : prepare_phb_rope_stock prépare chez un vrai marchand une corde PHB entière de50pieds : chanvre1po/10lb ou soie10po/5lb. Offre, achat, pièces, temps, charge et custody sont réellement résolus ; aucune corde gratuite, duplication par fait/ID ou conversion de l’ancienne corde narrative. Cette acquisition est indépendante de l’adoption des nœuds. Les autres limites PHB-GEAR restent ouvertes. Aucun autre équipement, revente globale, rupture, ligotage ou lot PHB-GEAR entier n’est déclaré achevé.


<!-- END:W23-BRIDGE-PHB-GEAR -->


<!-- BEGIN:W22-BRIDGE-PHB-GEAR -->


- **Raccord W22 confirmé dans son seul périmètre** : Dépendance physique de XGE-ADAMANTINE : prepare_phb_launcher_stock prépare uniquement un vrai stock initial marchand de l’un des sept lanceurs PHB ordinaires, prix et masse source séparés, fronde à masse imprimée inconnue. Aucun lanceur ne se trouvait dans les profils/sol authored W21 ; ce manque a été constaté par lecture ciblée, sans nouvel audit. Un vrai personnage frais achète désormais arc court25po puis dix flèches adamantines500po5pa ; cinq POST imposent les deux achats sur messages distincts, avec vraies mains/équipement et paiements. Trésor réel52550cp ajouté puis dépensé, bourse initialeSRD7de25000cp conservée exactement ; le marchand ne gagne que les vrais52550cp payés. Tir d’une unité, SQL et trois processus/rejeux ne dupliquent ni objet, paiement, munition ou dé. Aucune attribution d’inventaire par remplacement de l’état ; seuls des états réellement sauvegardés sont réhydratés. Le statut PHB-GEAR reste partiel. Les limites existantes restent valables ; aucun lot entier supplémentaire n’est déclaré terminé.


<!-- END:W22-BRIDGE-PHB-GEAR -->


- **Témoin public indépendant W22 — acquisition et tir, non publié** : sur copie commune Calendar+C strictement vérifiée avant/après (1037entrées,1567binaires, trois livres/manifeste et107assets), 1/1 achat réel passe : cinq POST choisis par l’agent scripté, trois processus avec SQL fidèle, source normale shortbow25po puis dix flèches adamantines500po5pa, deux paiements52550pc et fonds propres initiaux25000pc conservés exactement. Un vrai tir consomme1flèche, critique contre objet, conserve l’arc ordinaire ; rejeux inchangés et marqueur19. La première tentative supposait à tort une bourse initiale vide dans le harnais ; seul ce CJS est corrigé sur la baseline observée, aucun fonds ni dé changés. Le témoin hauteur1/1 reste vert sur les mêmes binaires : vrai support joueurZ20, objet sansZ inventé, refus avant état/munition/action/dé à travers SQL. Ces deux cas sont inclus dans la future full, pas additionnés aux36tests recouvrants. Preuves : `output/mcp-w22-calendar-adamantine-witness-r2-20261104/ca-witness-handoff.json`. Chute A et validation finale commune restent à fermer.





- **Dépendance découverte W22 — parcours public du lanceur, non livré** : contrôle ciblé des catalogues/outils existants pendant XGE-ADAMANTINE : les sept profils de lanceurs SRD existent, mais aucun dans les quatre personnages publiés ni leurs variantes, ni dans le loot authored actuel. Le stock marchand requiert un vrai objet préalable ; fabrication ordinaire, contenus SCENE_SUPPLIES, trésors et magie actuels ne créent pas de lanceur. Un arc initialisé en fixture ne prouve donc pas son acquisition en jeu. C ajoute une préparation bornée de stock INITIAL de lanceur ordinaire chez un vrai marchand, aux prix/masses PHB, suivie des offres/achats/custody existants ; B prépare le témoin public achat lanceur + lot adamantin + tir + SQL. Aucun objet gratuit, nouveau personnage, forge, enchantement ou conversion de matière. Provenance : lecture ciblée `lib/srd/weapons.ts`, fiches de personnages, `merchant-tools`, `ordinary-crafting`, `treasure-tools`, `magic-item-tools` ; ce constat ne reconstruit pas le backlog. Résultats et limites à consigner après gel.





- **Reprise ciblée du 4 novembre, vie inconnue et premiers secours** : sources du privé W23 conservées dans la capture W18, avec les deux outils `observe_legacy_npc_life`/`inspect_legacy_npc_life`. Observation actuelle liée au vrai corps et fait physique, jamais une date ancienne de mort ni des compteurs inventés ; six secondes de borne d'incertitude annoncées comme politique moteur. Guérison réelle ou Médecine réussie peut normaliser le présent, y compris hors combat. Raccord API/SQL : quatre cas verts, dont le refus public sur un corps caché et le travail segmenté de la même extraction ; inspections et observation MJ restent auxiliaires. [Guide](legacy-npc-life.md), contexte local `lib/dm/npc-harvest-context.ts`, domaine `legacy_npc_life` et tests `legacy-npc-life`, `dm-legacy-npc-harvest`, `npc-harvest-support`. Ce périmètre est intégré dans la capture W18 en validation, pas encore dans le moteur publié W17. Aucun soin/réveil/révélation/enrôlement automatique.





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : proprietes_armes — équipements au sol.


- **Constat de l’audit initial** : Inventaire/port et quelques usages ; la description seule n’accorde pas l’effet particulier de cet objet.


- **Règles concernées** : Equipment ; Barbarian ; Bard ; Cleric ; Druid ; Fighter ; Monk ; Paladin ; Ranger ; Rogue ; Sorcerer ; Warlock ; Wizard ; Adventuring Gear ; Abacus ; Alchemist's fire (flask) ; Arrows (20) ; Blowgun needles (50) ; Crossbow bolts (20) ; Sling bullets (20) ; Antitoxin (vial) ; Crystal ; Orb ; Rod ; et 151 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 186 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Tranche active du 2 novembre** : billes, chausse-trappes et piège de chasse ; quantités source, actions et vrais contacts, prudence explicite, piège ancré et libération à portée. Coordination avec les contacts de déplacement de C ; aucune livraison globale revendiquée avant tests et persistance.





- **Préparation d’initiative prise par la coordination** : nouveau mcp-server/hazard-combat.ts et régions phase-tools/validateEnterCombat, argument enter_combat.hazardPreparation {kind:oil|ground_gear,hazardId}. Qualification d’un vrai danger actif et chemin physique pur, aucun mouvement/contact/temps/ennemi créé ; vrais corps déjà dans l’huile inclus explicitement, sans changer visible. Six tests MCP écrits, validation privée `output/mcp-hazard-preparation-20261102` en cours. end_combat doit aussi refuser d’effacer un arrêt de chausse-trappes encore lié au tour courant, avant XP/phase ; un next_turn explicite solde ce vrai tour, sans entrave générale inventée pour la chaîne du piège de chasse. Parent garde ces régions afin de ne pas sérialiser C/B.


- **Progrès des autres agents** : A compile0 et passe10/10pose/résolution Gear (vrai stock, mains, billes/caltrops, sauvegardes tenues, vraie plaque/chaîne/STR13). B a écrit start/continue/finish/cancel_ground_gear_recovery, vraie collecte partielle/contenant/quantité, segments et attente de l’horloge réelle en combat ; reprises SQL corrigées, nouveaux cas portage/piège en cours. C poursuit commits de groupe, arrêts/reprises de marche/prise/saut/téléport et prudence, avec qualification avant jets/ressources. Ces collectes partielles ne valent pas livraison intégrée globale.





- **Préparation de danger validée de façon ciblée** : `output/mcp-hazard-preparation-20261102`, TypeScript/build0 et7/7 (38576,7719ms). Six parcours MCP publics pour vrai danger, refus absence/obstacle/expiration avant dé, vrai roster caché sans révélation, plus un cas backend d’arrêt caltrops résolu qui interdit end_combat avant le vrai next_turn, sans changement XP/phase/PV au refus. Un défaut réel initial du qualificateur a été corrigé : une victime déjà dans l’huile impose son horloge même si sa cellule occupée n’est pas une destination d’approche libre. Le nom du refus d’obstacle a été aligné sur DESTINATION_BLOCKED. [Rapport borné](rules-audit/validation-hazard-preparation-2026-11-02.json). **Limite concrète encore ouverte** : un danger accessible seulement par téléportation ne peut pas encore être qualifié par ce chemin au sol ; ne pas déclarer tous les téléports/Gear jouables sans raccorder cette sélection explicite. Cette tranche est hors W15.


- **Téléportation et chaîne — arbitrage moteur annoncé** : le piège de chasse réellement ancré, externe à l’équipement du corps, demeure fermé et fixé au sol lorsqu’une véritable téléportation le quitte ; victimId ne disparaît qu’après commit, jamais au préflight/jet tenu/refus. Marche/poussée/transport restent bornés par la vraie chaîne. Le passage officiel [Sage Advice Compendium v2.7, p.19](https://media.wizards.com/2020/dnd/downloads/SA-Compendium.pdf) confirme le transport de l’équipement porté/transporté avec Misty Step ; le cas du piège externe est ici une inférence et adjudication explicitement annoncée, pas une réponse officielle spécifique au piège.


- **Relais de B après collecte** : raccorder les vrais téléports à deux corps et poussées par pas aux nouvelles primitives C assertPhysicalDisplacements/commitPhysicalDisplacements, avant coûts et avec continuation des effets déjà choisis. Ne pas confondre le gel zones (deux anciens moveToken successifs pour Dimension Door) avec ce nouveau contrat de contacts atomiques.





- **Dernier état collecte B après hooks réels C** :16/16nouveaux et TypeScript/build0 ; collecte60cas à59/60, le seul écart vient d’un helper A qui enregistre une seconde fois un contact désormais déjà produit par le vrai moveToken. Replay après retrait de ce double enregistrement en préparation, assertions conservées. **Reste concret après la collecte** : transfert explicite de deux stocks déjà portés dans des récipients différents ; regroupement lors de la collecte vers un même récipient livré, aucun transvasement/repack automatique. Provenance : implémentation collecte B et son guide, pas nouvel audit.





- **Collecte B gelée et relais effectué** : `output/mcp-wave17-b-ground-recovery-20261102` immobile, buildMCP/Next0,16nouveaux verts (14vrais stdio et2purs/primitives). Cohorte60 à59/60 puis replay du fichier Gear16/16 après retrait du seul double enregistrement manuel devenu redondant avec GS.moveToken instrumenté ; assertions conservées. Nouveaux modules ground-gear-recovery-state, ground-gear-containers, ground-gear-recovery et outils associés, wrappers GS drop/pickup et portage réel. B immédiatement réaffecté à sa tranche magique dans nouveau privé, gels zones/collecte intacts.


- **Raccord arrivé vs téléportation** : les arrivées intercartes ordinaires avaient historiquement l’étiquette teleport. A/C les distinguent par arrival pour qu’un escalier ne libère pas implicitement le pied d’un piège ; seule une vraie téléportation bénéficie de l’adjudication annoncée. Test de captif intercarte en préparation/validation par A. Autre limite précise : une pose exige encore un lot source complet choisi ; les stocks partiels ne sont pas fusionnés automatiquement pour reconstituer20/1000unités. Le futur transfert/fusion doit être un choix explicite avec vrais contenants/quantités, sans aire partielle ou masse inventée.


- **Nouveaux préflights des sources sol** : A/C ont découvert pendant Gear que des historiques anciens0PV ou sprite/pétrification incomplets pouvaient refuser le packet seulement après le dé de sauvegarde/dégât. Nouveau ground-damage-preflight déterministe en validation avec sentinelles, sans fabrication d’histoire ni activation d’un corps caché. Cette correction reste avec la prochaine cohorte Gear, hors de la preuve W15r3.





- **Gel A confirmé et réaffectation** : `output/mcp-ground-gear-20261102` immobile, buildMCP0 et contrôle des types MCP/Next0 ; ce privé ne contient pas app/, donc son contrôle Next porte sur les sources partagées présentes, pas toutes les routes/UI. Derniers journaux vérifiés : gear-final-targeted128/128, gear-last-reprise19/19 ; total distinct annoncé par A253cas pertinents après reprises, sans addition des collectes. Pose, résolution/libération, source des doses et gardes hauteur/cover/nets, arrivées vs téléportation, préflight dommage et vrais corps cachés inclus dans ce périmètre. Garde de plaque explicitement évitée ne réclame pas un historique de dégâts qui n’arrivera pas. Les raccords groupés C/B postérieurs ne sont pas certifiés rétroactivement. A immédiatement réaffecté à POISONS-PLAYER-USE ; aucun ancien gel touché.


- **Gel B magie/dangers confirmé** : `output/mcp-wave18-b-spell-ground-contacts-20261102` immobile, build/types0,10/10nouveaux et62/62régressions vérifiés. Arrivées Dimension Door groupées, companionToCell et companionWillingConfirmed explicites, dégâts/saves Thunderwave avant ses pas forcés retenus, continuation de résultat sans nouveau cast. hazardPreparation.approach reçoit une vraie approche spell/scroll et ses arguments ; elle qualifie la préparation magique sans chemin au sol, sans lancer ni payer au préflight. Ce gel ferme la limite de qualification magique décrite précédemment dans son périmètre ; ses autres limites restent : masse/taille complètes du compagnon, objets non fixés de Thunderwave et ancien trajet manquant après dégâts. B réaffecté immédiatement au transfert explicite des stocks, nouveau privéW19, gelW18 intact. Parent n’a pas encore validé la cohorte complète Gear/API.





- **Complément Gear du 2 novembre, hors W15** : le transvasement B est gelé sous `output/mcp-wave19-b-ground-transfer-20261102` : TypeScript/build0,8/8nouveaux publics,53/53régressions et21/21portage/inventaire. Outils start/continue/finish/cancel_ground_gear_transfer, états/provenance et deux vrais contenants, destination/fusion choisie explicitement, unités conservées et masses totales observées. La reconstitution réelle de20chausse-trappes ou1000billes puis leur pose est testée ; l'ancienne limite « transfert entre deux stocks encore absent » est donc close dans ce périmètre. Finish/cancel sont auxiliaires sans action/temps nouveau ni remboursement. B immédiatement réaffecté à DOWNTIME-ECONOMY, gel immuable.


- **Contacts C2 gelés, hors W15** : `output/mcp-ground-contacts-c2-20261102`, buildMCP/Next0,223cas distincts :222verts initialement, seul helper privé ammo antérieur sans registration Gear réaligné sur celui du gel A, puis reprise29/29 (11hauteurs,18contacts). Vrais déplacements/réactions/reprises, téléport natif puis morsure déjà payée, sauvegarde SQL, vol vertical et vraie arrivée de chute déclenchent leurs contacts réels. Préflight de toutes les positions d'un groupe avant OA/dé/coût ; aucun double contact/double coût. Le gel n'inclut pas le nouveau WIP nage/escalade. Prochain travail parent : raccord API/support puis cohorte intégrée avec les gels A/B et préparation de danger.





- **Constat ciblé restant, provenance lecture du raccord Gear** : groundGearAction(actorId) et setGroundGearPace(entityId) passent encore par available() héroïque. Vérifier un PNJ capable qui ouvre le piège du joueur à0PV ou choisit son allure : son action ne doit pas être refusée seulement à cause de l’incapacité du héros. Agent A informé pour un correctif autonome et test réel si confirmé ; aucun nouveau code injecté dans W16 en cours.





- **Périmètre Gear intégré et publié W16** : pose/prudence/contacts/piège, collecte et transvasement explicites, vrais parcours et continuations sont inclus dans2118/2118 et mock30/30,238outils,1214binaires vérifiés. API/SQL3/3 ciblés inclus. Le constat PNJ capable vs available() héroïque reste un correctif concret identifié ; les autres équipements du chapitre ne sont pas tous couverts par cette tranche. Voir rapport permanent W16 en tête.





- **Constat PNJ/available clarifié par vrai test** : available() ne teste pas lesPV/capacité du héros. Le test public/SQL passe désormais : PNJ capable choisit son allure, ouvre le piège du joueur réellement tombé0PV, consomme sa propre action seulement, aucun soin/réveil/compteurmort/temps offert. Les deux premières reproductions ont en fait révélé un défaut create_npc (ENTITY_NOT_FOUND puis PHYSICAL_BODY_REQUIRED avant entrée), pas un refus dû auxPV du héros. Correction ciblée : création par createNpcState avec vrai bloc SRD ; réhydratation du bloc des improvisés positifs depuis leur source conservée, sans soigner/révéler/activer.3cas verts dans56W17. Ancien improvisé0PV sans témoin isAlive reste intact/inconnu ; observer/migrer sa vie reste un prochain travail précis, sans déclarer vivant/mort à la simple restauration. Aucun changement hypothétique d’available n’a été fait.





### PHB-ECONOMY


<!-- BEGIN:W21-PUBLISHED-PHB-ECONOMY -->


- **Publication W21 — Trade Goods PHB** : pleine valeur PHB3915 et 4513–4535 pour 17 références non vivantes, lots physiques entiers déjà établis ; acheteurs réels PHB3907. Deux outils nouveaux `record_trade_good` et `create_trade_good_resale_offer`, achats/ventes via les outils et la custody existants. Source/quantité et première commande canonique protégées dès la première restauration SQL ; mêmes vrais exemplaires, offre, dénominations et fonds effectivement encaissés, sans relecture du nom ni masse de tissu inventée. Seules les deux formes structurées exactes du vrai `pick_up_item` constituent une provenance historique non active ; les faits ne sont ni interprétés ni effacés. Poison, portions/consommation, contenus et effets restent bloquants. Les contrôles containment/hauteur/mains/portage/échéances précèdent le débit. [Guide](trade-goods.md), [validation W21](rules-audit/validation-wave21-2026-11-04.json).


- **Limites / prochain travail concret** : services, dépenses, animaux, fractions, division/fusion, troc et fonds marchands externes restent distincts. Aucun rachat automatique du bien vendu, pureté ou nourriture accordés ; la vraie durée est choisie par le MJ et non un coût RAW de six secondes. Poursuivre seulement une procédure PHB/DMG/Xanathar encore inscrite au registre, avec son contrat physique et économique explicite.


<!-- END:W21-PUBLISHED-PHB-ECONOMY -->








- **Historique W21 avant publication** : biens commerciaux PHB3915/4513–4535, 17 références non vivantes et lots entiers, source/quantités immuables à SQL, mêmes vrais achats/reventes et fonds encaissés. Le privé output/mcp-trade-goods-20261104 passe 42/42 avant les deux clôtures provenance pré-offre et pickup narratif ; typecheck complet après la première garde 0, nouvelles preuves en cours. Aucune caisse initiale, division de lot, nourriture purifiée ou masse de tissu créée. Voir les découvertes/provenances en tête du registre.





- **Publication W19/W20 du 4 novembre** : revente ordinaire à moitié prix livrée en W19 ; W20 ajoute `create_valuable_resale_offer` pour les gemmes/art sourcés réellement collectés et possédés, à pleine valeur PHB3913. Aucune lecture du seul nom ne transforme un bijou narratif en objet enregistré ; acheteur, prix, monnaie et durée restent explicitement choisis. Les fonds marchands proviennent des recettes réellement encaissées, sans bourse initiale inventée. Refus avant paiement/dé/temps pour containment, hauteur inconnue ou portée réelle insuffisante. Validation intégrée **2 471/2 471**, mock **30/30** ; [rapport W20](rules-audit/validation-wave20-2026-11-04.json). Guide [valuable-resale.md](valuable-resale.md). Prochain périmètre concret : biens commerciaux/services et autres sources réellement représentées de fonds marchands ; ni estimation, ni pureté, ni monnaie ne sont inférées.





- **Revente ordinaire, gel séparé du 4 novembre** : `output/mcp-merchant-resale-20261104`, sources PHB3907–3915, prix armes4025–4069 et armures3923–3944. Trois outils `create_resale_offer`/`sell_to_merchant`/`inspect_merchant_resales` : vrai bien possédé non endommagé, moitié du prix canonique, acheteur intéressé et dénominations effectivement disponibles. La réserve du marchand est limitée à ses recettes réellement encaissées moins les reventes payées ; aucune bourse initiale créée, aucune règle RAW de financement prétendue. Mesures physiques et custody vendue restent conservées ; équipement implicite, enduction Basic Poison par clé physique JSON, magie, argenture et associations non transférables sont refusés avant coût/mutation. La durée `workSeconds` est choisie explicitement ; les six secondes des fixtures ne sont pas une durée PHB universelle. TypeScript/build 0, **21/21** (12 revente/support, six achats et trois API/SQL), mock **30/30**, neuf scénarios, 71 appels et 0 $, frontières **19/19**. Le premier mock à 48 écarts venait d'images de cartes absentes (`GEOMETRY_STALE`) : seuls les 107 vrais assets ont été rétablis, les 753 empreintes source sont restées identiques. Script gardé de quinze fichiers appliqué uniquement dans le brouillon W19, validation intégrée encore en cours ; aucune publication de ce lot dans W17/W18. [Guide](merchant-resale.md). B est réaffecté aux biens précieux à pleine valeur, dans un nouveau privé, sans changer ce gel.





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Tables de prix lisibles ; pas stock marchand, achat/vente effectif, services acquis ou dépenses récurrentes.


- **Règles concernées** : Selling Treasure ; Trade Goods ; Expenses ; Lifestyle Expenses ; Food, Drink, and Lodging ; Services ; Spellcasting Services.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 11 unités rattachées à ce lot.


- **Outils existants à compléter** : `spend_currency`.


- **Noms envisagés dans l’audit** : `create_trade_offer`, `purchase_item`, `sell_item`, `purchase_service`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Prochaine étape concrète** : Services/dépenses ou autre sous-périmètre économique PHB/DMG/Xanathar encore inscrit, avec vrais prix, bénéficiaires, fonds et temps ; la pleine valeur des lots Trade Goods ci-dessus est livrée.





- **Tranche commerce standard2014 gelée W20** : record_merchant_stock, create_trade_offer, purchase_trade_offer, inspect_trade_stock ; seuls des objets réellement existants passent du lieu au stock du vrai PNJ puis au joueur contre les dénominations explicitement choisies. Accords/faits, portage/masses, temps et SQL sont validés dans les99/99B ci-dessous. Achat seul livré dans ce périmètre ; vente du joueur, services acquis et dépenses récurrentes restent ouverts. Ce gel privé n’est pas une publication du moteur partagé.





### PHB-ARMOR-PENALTIES





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — validate_wave3.


- **Constat de l’audit initial** : CA/port/durée/discrétion configurés ; non-maîtrise et Force insuffisante refusées au lieu d’appliquer toutes pénalités PHB.


- **Règles concernées** : Armor and Shields ; Armor ; Padded ; Leather ; Studded leather ; Hide ; Chain shirt ; Scale mail ; Breastplate ; Half plate ; Ring mail ; Chain mail ; Splint ; Plate ; Shield ; Light Armor ; Medium Armor ; Heavy Armor ; Getting Into and Out of Armor ; Donning and Doffing Armor.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 20 unités rattachées à ce lot.


- **Prochaine étape concrète** : Représenter explicitement les éventuelles exemptions raciales avant de les appliquer ; préserver les maîtrises de la fiche fixe et les pénalités dérivées du loadout réel.





- **Avancée du 31 octobre — W3** : Raccord livré : port non maîtrisé autorisé, CA conservée, désavantage STR/DEX sur les vrais tests/sauvegardes/attaques, blocage des incantations et vitesse −10 pieds avant épuisement puis budget Dash. Maîtrises lues sur la fiche immuable ; aucune exemption raciale déduite. [Helper](../lib/armor-penalties.ts), [jets](../mcp-server/roll-rules.ts), [navigation](../lib/navigation.ts), [guide](armor-penalties.md). Dix tests préparés dans [armor-penalties.test.cjs](../tests/armor-penalties.test.cjs), dont l’ordre vitesse/épuisement/Dash ; contrôles TypeScript sans émission et collecte ciblée MCP réussis ; régression complète W3 réussie dans son instantané final.





- **Validation W3 finale** : compilation et TypeScript en sortie 0 ; **1 065/1 065 tests**, aucun échec/ignoré/annulé (exit 0, 292 609,8517 ms) ; playtest **30/30 tours, neuf scénarios, 97 appels mock et 0 $** (exit 0, 16 000 ms). listTools confirme **125 outils**, dont les huit nouveaux (exit 0). Les collectes ciblées 110/110, compatibilité 119/119 et dernières fixtures 26/26 ont passé. Attestation de l’instantané final W3 uniquement : [rapport et empreintes](rules-audit/validation-wave3-2026-10-31.json). Les travaux W4 ultérieurs sont exclus.





### PHB-WEAPONS





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : proprietes_armes réaffecté — catalogue et armes spéciales.


- **Constat de l’audit initial** : Dix armes + frappe sans arme ; portée normale/longue, munitions, loading, versatile, heavy/reach et armes spéciales incomplets.


- **Règles concernées** : Weapons ; Club ; Dagger ; Greatclub ; Handaxe ; Javelin ; Light hammer ; Mace ; Quarterstaff ; Sickle ; Spear ; Crossbow, light ; Dart ; Shortbow ; Sling ; Battleaxe ; Flail ; Glaive ; Greataxe ; Greatsword ; Halberd ; Lance ; Longsword ; Maul ; et 20 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 45 unités rattachées à ce lot.


- **Outils existants à compléter** : `equip_item`, `resolve_player_attack`, `resolve_player_multiattack`.


- **Révalidation ciblée du 31 octobre — raccords à corriger** : la maîtrise d'arme est actuellement ajoutée à toute arme enregistrée possédée/tenue dans [hero-combat.ts](../mcp-server/hero-combat.ts#L62), sans liste de maîtrises d'armes sur la fiche. Posséder une arme ne prouve pas sa maîtrise. Le catalogue et ses propriétés restent bornés ; ammunition/loading/heavy/reach/versatile/special et la portée longue de l'arc ne sont pas généralisés. La simple tenue d'une arme twoHanded occupe aussi deux mains dans les helpers, alors que l'obligation publiée vise l'attaque : distinguer la prise de l'attaque avant d'étendre les composantes somatiques. [Constats et sources PHB](rules-audit/revalidation-phb-2026-10-31.md#phb-weapons--maîtrise-et-représentation-des-propriétés). Revue statique ; préparer des régressions d'arme récupérée non maîtrisée et de prise avant correctif.











- **Livraison W5 du 31 octobre** : La maîtrise provient désormais des quatre classes fixes et de la catégorie source de l’arme : le bonus de maîtrise n’est plus accordé à une arme simplement possédée. Attaques, deux armes et objets utilisent le même helper ; aucun don ni équipement ajouté. Voir [weapon-proficiency.md](weapon-proficiency.md).


- **Outils/raccords W5 validés** : resolve_player_attack, resolve_player_multiattack, resolve_two_weapon_attack, resolve_attack, interact_object.


- **Preuve finale W5** : 1 201/1 201 tests, TypeScript complet et 30/30 tours mock passent ; [rapport borné et empreintes](rules-audit/validation-wave5-2026-10-31.json).











- **Livraison W6 du 1er novembre** : Arc court 80/320 pieds et vrais lancers explicites de dague/hache de main 20/60 : désavantage à longue portée, refus hors longue portée avant dé/coût/dépôt. Un hostile à proximité impose le désavantage seulement s’il voit réellement le tireur et n’est pas neutralisé. rangedContext et le jet tenu restent exacts ; toutes les cibles sont prévalidées, y compris legacy Extra Attack. Le périmètre antérieur 48/48 +20/20 est complété par la suite intégrée W6. Voir [ranged-weapons.md](ranged-weapons.md).


- **Outils/raccords W6 validés** : resolve_player_attack, resolve_player_multiattack, resolve_two_weapon_attack, resolve_attack ; lib/srd/weapons.ts, mcp-server/ranged-weapon-rules.ts, equipment.ts et résolveurs.


- **Reste / prochaine étape** : Poursuivre le catalogue et les propriétés ammunition/loading/heavy/reach/versatile/special, les portées des autres armes et la distinction entre prise et attaque. Aucune munition/arme gratuite, attaque à distance sur objet ou extension des sorts n’a été ajoutée.


- **Preuve finale W6** : 73/73 ciblés puis **1 274/1 274 tests**, TypeScript complet, playtest **30/30 tours**, neuf scénarios, 97 appels mock et 0 $, tous sortie 0 ; **131 outils** vérifiés. [Rapport et empreintes W6](rules-audit/validation-wave6-2026-11-01.json).





- **Reprise W10 du 1er novembre** : lot attribué à proprietes_armes depuis ce registre, sans nouvel audit. Contrat et implémentation en cours ; seules les validations réellement obtenues seront consignées avant livraison.


- **Avancée W10 — prise et attaque** : `weaponHands` explicite sur attaques ordinaires, multiattaques, opportunités, libération préparée et objets ; versatile utilise son vrai dé à deux mains et Duel seulement à une main. Tenir une arme occupe une main, sa véritable attaque à deux mains exige l'autre disponible. Le même raccord est appliqué aux composantes somatiques. Build privé réussi ; premier lot 43/44, puis correction du décompte somatique et reprise du seul cas échoué 1/1 réussie. La validation intégrée reste à faire. Munitions/Loading sont en cours : quantités et reçus persistés, identité d'action réelle, aucun stock historique inventé ; récupération et autres propriétés restent ouvertes.


- **Avancée W10 — munitions** : `create_ammunition`, `ammunitionItemId` exact sur attaques et libération préparée, stocks réels, reçu par véritable d20 même raté/suspendu, Loading par véritable action, nouvelle action explicitement choisie et réellement disponible. Arc court et deux arbalètes sourcées ; aucun kit enrichi. Compilation privée réussie, neuf nouveaux tests munitions, onze prise et vingt-et-un portée verts. Premier lot63cas :61verts et deux fixtures à adapter (créature non enregistrée et liste fermée des anciennes armes) ; reprises chutes10/10 et deux cas maîtrise/nonlétal réussies après corrections. Ces exécutions sont distinctes, pas une suite complète revendiquée. Agent réaffecté à la récupération monopièce avec agrégation bataille/type et minute de recherche réelle ; les champs de bataille multi-pièces restent explicitement à traiter.


- **Complément W11 recherche — ciblé** : `begin_ammunition_search` et `advance_ammunition_search`, étapes et temps réellement effectués dans les positions/pièces actuelles,60secondes actives globales ; `recover_ammunition(searchId)` achève sans deuxième minute. Dépenses figées, interruptions carte/combat persistées, retrys et hydratation, allocation mixte et préflight portage. Build privé puis33/33 cas ciblés réussis après correction de la seule fixture de salles visitées ; [guide munitions](ammunition.md). Pas de déclaration de visite ni trajet fabriqué. Répartition entre pièces explicitement interprétée. Prochain raccord applicatif constaté dans `app/api/dm/route.ts` (budget de mouvements) : permettre les déplacements explicitement choisis d'une même recherche suivie dans un message, tout en conservant la limite d'autres actions ; les checkpoints actuels se reprennent déjà sur plusieurs messages. Agent immédiatement réaffecté aux propriétés Heavy/Reach ; elles restent ouvertes jusqu'à tests et intégration réels.


- **Complément W11 Heavy/Reach du 2 novembre — validation ciblée** : désavantage Heavy pour une véritable taille Small et portée Reach de l'arme réellement choisie, raccordés aux attaques, préparations, réactions et objets du périmètre courant. Compilation privée réussie et 116/116 cas ciblés, dont 14 Heavy et 17 Reach. Voir `tests/heavy-weapons.test.cjs` et `tests/reach-weapons.test.cjs`. Ce résultat clôt ce sous-lot ; catalogue complet, armes spéciales et autres limites restent ouverts. Agent réaffecté à PHB-CASTING-TIME, sans attendre un nouvel audit.


- **Raccord applicatif recherche W11 achevé ensuite** : `app/api/dm/route.ts` regroupe les déplacements explicitement demandés d'une même recherche active, avec un nouveau véritable checkpoint entre deux déplacements supplémentaires. La récupération compte comme achèvement et ne laisse pas passer une autre action sans rapport. Les deux tests de budget/transmission/SQL passent après correction d'une fixture de synchronisation puis d'un premier mouvement qui n'était pas compté comme action principale. Les tests isolent le budget applicatif ; ils ne remplacent pas les 33 cas physiques MCP. Aucun choix de destination ni appel fabriqué. Preuve : `output/mcp-wave11-rest-current-20261101/ammo-api-r10.log`, guide munitions actualisé. L'ancien prochain raccord décrit ci-dessus est donc résolu dans ce périmètre.


- **Relais après incantations longues** : agent revenu au reste concret du lot : catalogue des 37 armes physiques de la table standard, propriétés/portées/poids sourcés, sarbacane à dégâts fixes et vraies aiguilles, lance et filet avec leurs procédures réelles. Table PHB lignes4027–4068 et Special4123–4125 consultées ponctuellement. Le filet demande attaque distante, vraie instance, limitation du nombre d'attaques par véritable action, entrave et libération STR/DD10 ou dégâts tranchants sur le filet ; les choix de seuil sont à documenter sans PV inventés. Contrat approuvé, aucune livraison de ce complément revendiquée ; hooks communs coordonnés avec le gel W11, sans audit global.


- **Gel A7 après ce démarrage** : catalogue37, vraie lance, filet et choix Finesse intégrés ; quatre outils `set_net_creature_form`, `inspect_net`, `free_from_net`, `attack_net`. Finesse conserve aptitude/modificateur d'origine sur reprises, choix indépendant en frappe bonus ; défaut compatible meilleur score explicitement décrit comme moteur. Filet lancé réel, sans dégâts, unique attaque de l'action/bonus/réaction, provider restrained séparé, vraie action STR/DD10 ou coupe CA10 ; cumul des5tranchants annoncé comme interprétation, pas PV inventés. Build privé0 et **201/201 tests** de17fichiers, dont49nouveaux, zéro skip/cancel, vrai stdio inclus. `output/mcp-weapons-a7-20261102`, `weapons-regression.log`, [guide armes](standard-weapons.md). API/classifications/support préparés ; validation globale de cette cohorte à effectuer. Agent immédiatement réaffecté aux armes improvisées et argenture réelles (source PHB4107–4117), reçus/prise/profils/coûts100gp et défenses argentées, sans monture ni dotation gratuite. A7 reste figé ; raccords météo/argenture se poursuivent ailleurs.





<!-- Appui technique au lot munitions, sans déclaration de livraison W10. -->


**Appui du 1er novembre, collecte de corpus MCP** : protection du champ optionnel


`state.npcs` dans `mcp-server/ammunition-recovery.ts` via


`Object.hasOwn(state.npcs ?? {}, itemId)`, nécessaire pour compiler et exécuter le


nouveau corpus. Aucun outil ou effet de récupération supplémentaire n'est ajouté


par ce correctif. La compilation puis la génération ont réussi : 16 scénarios,


45 cibles MCP, zéro appel réseau ; les cinq tests du générateur passent.


La reprise des neuf tests de récupération sur l'arbre partagé donne cinq réussites


et quatre échecs (garde de bataille active/lieu, dépenses d'exploration, anciens


reçus et mélange de types). Ce n'est pas une validation de livraison du lot.


Les contrôles globaux `typecheck` / `npm test` se sont ensuite arrêtés sur


`mcp-server/carrying.ts:38` (champ possiblement absent). Prochain travail du lot


armes : reprendre ces quatre contrats de récupération et la validation intégrée


sur une source stable, sans modifier le corpus déjà capturé rétroactivement.





- **Raccord applicatif A8 préparé, validation cohérente en attente** : outils MJ adjudicate_improvised_weapon/establish_silvering_service auxiliaires ; manage_sling_projectile vraie manipulation et silver_equipment vrai travail hors combat dans le budget du message. Domaines improvised_weapons/silvering et consignes explicites ajoutés. Le service atomique refuse avant paiement les frontières temporelles qu’il ne peut franchir ; un service segmenté reste un prochain raccord, sans raccourcissement fictif de la durée. La voie consommable dédiée doit également conserver ses vrais modificateurs vent/hauteur ; constat ciblé A8, pas nouvel audit.





- **Validation et publication W14 du 2 novembre** :1925/1925tests, TypeScript/build0, mock30/30 (neuf scénarios,71appels,0$, objectifs OK),208outils réellement exposés. Les642entrées figées et1049binaires publiés concordent ; [rapport permanent W14](rules-audit/validation-wave14-2026-11-02.json). Ce lot sort du travail actif dans son périmètre livré ; ses limites spécifiques ci-dessus et les autres lots de catalogue restent distincts. Les sources des agents suivantes ne sont pas couvertes par cette livraison.





### PHB-CONSUMABLE-WEAPONS





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — validate_wave3.


- **Constat de l’audit initial** : Usage atomique spécifique (cible, DD/dégâts/conditions/durée et consommation) absent.


- **Règles concernées** : Net ; Acid (vial) ; Holy water (flask) ; Oil (flask) ; Poison, basic (vial).


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 5 unités rattachées à ce lot.


- **Outils existants à compléter** : `use_item`, `resolve_player_attack`.


- **Noms envisagés dans l’audit** : `use_adventuring_gear`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Prochaine étape concrète** : Raccorder les cibles objets à leur vraie résolution de dégâts/destruction, puis traiter les usages sourcés d’huile offensive, poison de base et filet sans créer de tours fictifs.





- **Avancée du 31 octobre — W3** : Raccord livré : use_weapon_consumable et extinguish_alchemists_fire, trois objets exacts du catalogue, consommation et action, dégâts typés, feu au vrai début de tour, garde avant sauts de temps/sortie du combat, reprises et reçus persistants. [État](../lib/weapon-consumable-state.ts), [résolveur](../mcp-server/weapon-consumables.ts), [outils](../mcp-server/tools/weapon-consumable-tools.ts), [cycle](../mcp-server/game-state.ts), [guide](weapon-consumables.md). Douze tests préparés dans [weapon-consumables.test.cjs](../tests/weapon-consumables.test.cjs), inclus dans les 110 tests ciblés centraux réussis. Périmètre borné au combat actif et aux cibles créatures ; objets, filet, poison et huile offensive restent ouverts.





- **Validation W3 finale** : compilation et TypeScript en sortie 0 ; **1 065/1 065 tests**, aucun échec/ignoré/annulé (exit 0, 292 609,8517 ms) ; playtest **30/30 tours, neuf scénarios, 97 appels mock et 0 $** (exit 0, 16 000 ms). listTools confirme **125 outils**, dont les huit nouveaux (exit 0). Les collectes ciblées 110/110, compatibilité 119/119 et dernières fixtures 26/26 ont passé. Attestation de l’instantané final W3 uniquement : [rapport et empreintes](rules-audit/validation-wave3-2026-10-31.json). Les travaux W4 ultérieurs sont exclus.





- **Huile offensive — gel propre et raccords en cours** : `output/mcp-oil-offensive-20261102`, compilation0 et21/21huile ; collectes distinctes195/195 et55raccords signalées par A. use_oil_flask/pour_oil_flask/ignite_oil_patch utilisent la vraie pinte, la vraie cible ou surface nivelée et la vraie flamme. Enduit60secondes, bonus5feu dans le même événement, sol12secondes et contact/fin de tour une fois par vrai tour. Répétition du bonus à chaque événement de feu et6secondes hors combat sont des interprétations annoncées, pas une clarification officielle. C garde les raccords des vrais mouvements, prises, arrivées et sauts ; entrée explicite avant contact liée au vrai danger en préparation par A. Le parent a écrit classement API des trois actions, domaine offensive_oil, consigne et trois parcours API/SQL ; validation dans `output/mcp-oil-api-20261102` en cours. Ces écritures ne déclarent pas l’huile intégrée globalement ; la W14 figée l’exclut. Voir [guide huile](offensive-oil.md).





- **Correctif mains découvert pendant Gear, gel indépendant prêt** : weaponItemHeld traitait historiquement un objet simplement possédé comme tenu en l’absence de loadout ; l’exception du flacon/de la flamme pouvait donc contourner deux mains réellement occupées. `output/mcp-oil-hands-delta-20261102`, dérivé du seul ancien gel huile, build0 et23/23 (21huile+2nouveaux MCP publics). Trois petits raccords de oil.ts lisent les vrais slots currentLoadout pour la dose et la flamme ; test oil-real-hands. ROOT corrigé, aucun ancien gel modifié. Ce delta reste à fusionner/valider dans la prochaine révision W15 avant publication des nouveaux binaires ; le W14 partagé n’expose pas encore l’huile offensive.





### PHB-POISON-ITEMS





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Poisons DMG de scène ; Basic Poison PHB, doses possédées et enduction d’arme absents.


- **Règles concernées** : Kit, poisoner's.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 1 unités rattachées à ce lot.


- **Outils existants à compléter** : `expose_affliction`.


- **Noms envisagés dans l’audit** : `coat_weapon_with_poison`, `use_poison_dose`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Relais immédiat après gel A8 — 2 novembre** : agent proprietes_armes, nouveau privé distinct. Contrat ciblé Basic Poison PHB : dose réellement possédée, vraie action d’enduction, arme/projectiles sélectionnés, durée source, vraie sauvegarde CON et dégâts poison, défenses et provenance conservées. Aucun poison ni état poisoned gratuit ; vérifier le texte ciblé avant de fixer les détails d’usage. Aucun outil de ce nouveau lot encore déclaré livré.





- **Gel poison de base et validation intégrée en cours** : `output/mcp-basic-poison-work-20261102`, compilation0 et293cas distincts signalés par l’agent, dont25nouveaux. Dose entière possédée, action réelle, arme tranchante/perforante ou1–3projectiles réellement choisis, CON10 puis1d4poison et60secondes de puissance. Aucun poisoned ; dégâts séparés de l’attaque sans critique/KO hérités, interprétation annoncée. Fichiers `lib/basic-poison-state.ts`, `lib/activity-preflight.ts`, `mcp-server/basic-poison.ts`, `basic-poison-hits.ts`, outils dédiés et25tests. La cohorte W14 expose réellement coat_weapon_with_poison et le domaine basic_poison ;25/25mécaniques et le parcours API/SQL passent. Une erreur initiale de collecte provenait du helper copié depuis le futur lot huile ; retour au helper exact du gel poison, sans assertion modifiée. Suite complète W14 lancée sur642entrées figées ; aucune publication anticipée. Fabrication et autres poisons restent distincts. Agent réaffecté à l’huile puis aux équipements au sol.





- **Validation et publication W14 du 2 novembre** :1925/1925tests, TypeScript/build0, mock30/30 (neuf scénarios,71appels,0$, objectifs OK),208outils réellement exposés. Les642entrées figées et1049binaires publiés concordent ; [rapport permanent W14](rules-audit/validation-wave14-2026-11-02.json). Ce lot sort du travail actif dans son périmètre livré ; ses limites spécifiques ci-dessus et les autres lots de catalogue restent distincts. Les sources des agents suivantes ne sont pas couvertes par cette livraison.





### PHB-LIGHT-GEAR





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — validate_wave3.


- **Constat de l’audit initial** : Lanternes, huile, réservoirs et recharges non implémentés.


- **Règles concernées** : Lantern, bullseye ; Lantern, hooded.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 2 unités rattachées à ce lot.


- **Outils existants à compléter** : `manage_light_source`, `use_item`.


- **Prochaine étape concrète** : Le sous-lot lampes/lanternes est livré ; garder les refus de recharge et les sources exactes. Les extensions d’obscurité et de sens restent suivies dans PHB-LIGHT-SENSES.





- **Avancée du 31 octobre — W3** : Raccord livré : lampes et lanternes réellement tenables, huile possédée consommée, réservoir de six heures, capot, orientation explicite du cône, objets déposés et extinction/expiration persistantes. [Catalogue](../lib/srd/equipment.ts), [état](../lib/lighting-state.ts), [lumière](../lib/lighting.ts), [moteur](../mcp-server/lighting.ts), [outil](../mcp-server/tools/lighting-tools.ts), [guide](lighting-and-vision.md). Dix tests préparés dans [lantern-oil.test.cjs](../tests/lantern-oil.test.cjs) ; collecte ciblée centrale réussie ; régression complète W3 réussie dans son instantané final. Aucun combustible gratuit, aucune orientation déduite du déplacement, aucune obscurité magique créée.





- **Validation W3 finale** : compilation et TypeScript en sortie 0 ; **1 065/1 065 tests**, aucun échec/ignoré/annulé (exit 0, 292 609,8517 ms) ; playtest **30/30 tours, neuf scénarios, 97 appels mock et 0 $** (exit 0, 16 000 ms). listTools confirme **125 outils**, dont les huit nouveaux (exit 0). Les collectes ciblées 110/110, compatibilité 119/119 et dernières fixtures 26/26 ont passé. Attestation de l’instantané final W3 uniquement : [rapport et empreintes](rules-audit/validation-wave3-2026-10-31.json). Les travaux W4 ultérieurs sont exclus.





### PHB-DOWNTIME





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Outil réel et maîtrises configurées ; pas fabrication/réparation de PV ni expertise universelle d’outil.


- **Règles concernées** : Tools ; Alchemist's supplies ; Brewer's supplies ; Calligrapher's supplies ; Carpenter's tools ; Cartographer's tools ; Cobbler's tools ; Cook's utensils ; Glassblower's tools ; Jeweler's tools ; Leatherworker's tools ; Mason's tools ; Painter's supplies ; Potter's tools ; Smith's tools ; Tinker's tools ; Weaver's tools ; Woodcarver's tools ; Disguise Kit ; Forgery kit ; Dice set ; Dragonchess set ; Playing card set ; Three-Dragon Ante set ; et 21 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 45 unités rattachées à ce lot.


- **Outils existants à compléter** : `resolve_tool_check`, `spend_currency`, `advance_time`.


- **Noms envisagés dans l’audit** : `start_downtime_activity`, `resolve_downtime_activity`, `inspect_downtime`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Fabrication ordinaire standard2014 gelée W20** : start/work/complete_day/cancel/inspect_ordinary_crafting, outil possédé et maîtrise réelle, matériaux physiques de moitié du progrès, huit heures réellement effectuées et5gp/jour, travail conservé à minuit, masse restante inconnue sans nouvelle pesée, objet final laissé physiquement à l’atelier avant vraie prise. Les99/99B ci-dessous incluent8nouveaux cas crafting et le parcours Basic Poison sur20jours réels. Aucun apprentissage, profession, recherche ou récupération n’est acquis par ce gel. B immédiatement réaffecté à Training dans un nouveau privé, source ciblée et contrat à établir ; pas de variante XGE.





- **Training W21 gelé et réaffecté** : output/mcp-wave21-b-training-20261102, build/typesMCP+Next0,33/33 (32813,8089ms),6nouveaux publics. Deux vrais parcours250dates×8h/paiements réels : langue→SQL/replay ; outil réellement prêté sans acquisition→maîtrise→vrai achat distinct→préconditioncraft. Jours incomplets conservés sans crédit, refus professeur/paiement/souffle/faussehistoire avant coût/dé, pause/reprise sans reset. Outils start_training/work_training/cancel_training/inspect_training. Parent2API/SQL et contexte langues actuelles verts dans16/16W17 ; le personnage et sonID restent fixes. [Guide](training.md), documentation playable-characters actualisée. B immédiatement réaffecté à la récolte DMG ; autres activités d’intermède ouvertes.





### PHB-VEHICLES





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Montures/véhicules, contrôle et capacité de transport non modélisés.


- **Règles concernées** : Mounts and Vehicles ; Vehicle Proficiency ; Mounts and Other Animals ; Tack, Harness, and Drawn Vehicles ; Waterborne Vehicles.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 5 unités rattachées à ce lot.


- **Dépendances** : [PHB-ENCUMBRANCE](#phb-encumbrance) ; [PHB-MOVEMENT-MODES](#phb-movement-modes).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CHECK-MODES





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — validate_wave3.


- **Constat de l’audit initial** : Aide en combat et jets explicites ; tests passifs/de groupe et entraide générale hors combat incomplets.


- **Règles concernées** : Passive Checks ; Working Together ; Group Checks.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 3 unités rattachées à ce lot.


- **Outils existants à compléter** : `roll_ability_check`, `combat_action`.


- **Noms envisagés dans l’audit** : `resolve_passive_check`, `resolve_group_check`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Prochaine étape concrète** : Étendre les contextes et acteurs non modélisés seulement avec leurs données réelles ; garder séparées la valeur du test et les découvertes/conséquences résolues par les outils dédiés.





- **Avancée du 31 octobre — W3** : Raccord livré : resolve_passive_check, resolve_group_check et provide_check_help ; schéma persistant, aide limitée à l’aptitude/compétence exacte et vrais jets passant par le moteur. [État](../lib/check-mode-state.ts), [résolveur](../mcp-server/check-modes.ts), [outils](../mcp-server/tools/check-mode-tools.ts), [raccord des tests](../mcp-server/ability-check.ts), [guide](check-modes.md). Quatorze tests préparés dans [check-modes.test.cjs](../tests/check-modes.test.cjs), TypeScript et syntaxe réussis, collecte ciblée centrale réussie ; régression complète W3 réussie dans son instantané final. Hors combat seulement ; pas de groupe imaginaire, de découverte automatique, de conséquence de danger ni de maîtrise PNJ inventée.








- **Validation W3 finale** : compilation et TypeScript en sortie 0 ; **1 065/1 065 tests**, aucun échec/ignoré/annulé (exit 0, 292 609,8517 ms) ; playtest **30/30 tours, neuf scénarios, 97 appels mock et 0 $** (exit 0, 16 000 ms). listTools confirme **125 outils**, dont les huit nouveaux (exit 0). Les collectes ciblées 110/110, compatibilité 119/119 et dernières fixtures 26/26 ont passé. Attestation de l’instantané final W3 uniquement : [rapport et empreintes](rules-audit/validation-wave3-2026-10-31.json). Les travaux W4 ultérieurs sont exclus.





### PHB-ENCUMBRANCE





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — transport physique.


- **Constat de l’audit initial** : Poids des pièces rapporté seulement ; pas masse/capacité de portage ou traction autoritaire.


- **Règles concernées** : Lifting and Carrying.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 1 unités rattachées à ce lot.


- **Outils existants à compléter** : `pick_up_item`, `drop_item`, `move_token`.


- **Noms envisagés dans l’audit** : `inspect_carrying_capacity`, `carry_creature`, `drag_object`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Reprise W10 après objets** : taille joueur et masses d'instances absentes du modèle constatées ponctuellement, sans les inventer. Contrat en cours : capacité standard STR×15/×30 et taille sourcée, masses exactes/catégories publiées, pièces50/livre, quantités réelles, données manquantes signalées. Suivi physique explicitement établi par le MJ avant gardes de prise/déplacement ; les anciens états sans données sont déclarés non résolus, pas conformes. Aucune variante d'encombrement adoptée par défaut ; corps et objets tractés exigent leurs vraies masses et attaches.


- **Complément W11 acquisition — ciblé** : trésors, repaires et change prévalident maintenant les vrais objets/quantités et la bourse projetée avant coûts/propriété ; dépenses allégeantes toujours possibles. Masse d'un précieux réellement préparé déclarable avant collecte, contexte d'un coffre plein invalidé quand il est réellement vidé. Build privé,37/37 tests puis dernier cas actualisé1/1 réussis ; la récupération des munitions possède son appel d'acquisition avant minute,24/24 cas ciblés verts avec ce raccord. Cette nouvelle tranche n'est pas incluse par transitivité dans l'attestation W10. Agent réaffecté au transport physique corps/objets, contrat sourcé avec prise, mains réservées et paire atomique ; pas seulement une évaluation de charge.


- **Complément W11 transport physique du 2 novembre — validation ciblée** : `preview_handled_load`, `begin_handling_load`, `move_handled_load` et `release_handled_load` utilisent la vraie charge, sa forme, les mains réservées et deux destinations explicitement choisies. Prise existante ou saisie réelle d'une cible incapable d'agir, charge volontaire avec adjudication annoncée, objets et cadavres réels ; mouvement apparié, réactions et libération aux ruptures effectives. Compilation privée réussie et 67/67 tests ciblés, dont 15 nouveaux. [Guide physique](physical-handling.md), `mcp-server/physical-handling.ts`, `tests/physical-handling.test.cjs`. Portage limité au joueur sur la carte active, sans verticalité, vol, activation d'archives ni transfert de carte ; inventaires de corps non inventés. Agent réaffecté au voyage puis à l'orientation.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-INITIATIVE-POLICY





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : initiative_2014 et coordination.


- **Constat de l’audit initial** : d20 DEX appliqué ; initiative relancée chaque round par invariant projet, contrairement à l’ordre PHB conservé.


- **Règles concernées** : Initiative.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 2 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.


- **Révalidation ciblée du 31 octobre — décision confirmée comme nécessaire** : le PHB conserve l'ordre d'initiative de la rencontre ; le moteur relance par round conformément à l'invariant projet AGENTS.md. Cette divergence doit rester identifiée comme choix produit, pas comme conformité PHB acquise ni comme correctif à appliquer sans décision. [Preuve PHB](rules-audit/revalidation-phb-2026-10-31.md#chapitre-9--combat). Aucun changement de règle ou de statut effectué.





- **Décision utilisateur du 1er novembre — poursuite complète** : règles standard D&D 2014 par défaut, explicitement choisies par l’utilisateur ; initiative conservée pendant tout le combat. La décision de principe est actée, le raccord effectif reste à réaliser/valider. Les variantes ne sont pas activées par défaut, et les options d’une autre édition ne deviennent pas des règles 2014. Les règles maison antérieures ne constituent pas une conformité PHB acquise.


- **Avancée W10** : ordre conservé aux frontières de round et après pause nutrition ; groupes identiques issus de sources réellement épinglées partagent un vrai jet. `enter_combat.tieOrder` arbitre explicitement les égalités, sinon l'ordre des participants fourni par le MJ s'applique. `start_encounter` ne force plus le joueur en premier ; les consignes du MJ et `next_turn` suivent 2014. Première tranche privée 75/75 ; tranche groupes 83/89 puis reprise des six cas dont la fixture dépendait des anciens jets individuels 6/6. Ces exécutions sont distinctes ; validation intégrée et fixtures d'entrée de rencontre restent en cours.





- **Validation intégrée W10** : TypeScript complet,1523/1523 tests et30/30 tours mock réussis dans l’instantané r2 ;141 outils uniques. Voir le [rapport W10](rules-audit/validation-wave10-2026-11-01.json). Cette clôture concerne le sous-périmètre décrit ; les limites et dépendances ci-dessus restent autoritaires.





### PHB-TRAVEL





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — voyage et orientation.


- **Constat de l’audit initial** : Temps et carte tactique présents ; allure, ordre de marche, orientation, tâches et fatigue des voyages non automatisés.


- **Règles concernées** : Adventuring ; Time ; Movement ; Speed ; Travel Pace ; Difficult Terrain ; Activity While Traveling ; Marching Order ; Stealth ; Noticing Threats ; Other Activities ; Splitting Up the Party ; The Environment ; Between Adventures.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 15 unités rattachées à ce lot.


- **Outils existants à compléter** : `move_token`, `advance_time`.


- **Noms envisagés dans l’audit** : `start_journey`, `advance_journey`, `inspect_journey`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Dépendances** : [PHB-EXHAUSTION](#phb-exhaustion) ; [PHB-SURVIVAL](#phb-survival).


- **Avancée W11 voyage du 2 novembre — validation ciblée** : `inspect_travel`, `begin_travel_tracking`, `create_travel_route`, `advance_travel`, `resolve_forced_march` et `abandon_travel_route` suivent le joueur à pied, les trois échelles exactes d'allure, les terrains et la marche forcée. Époque commune de 24h explicitement établie, vraie sauvegarde CON puis épuisement, jets tenus persistés, frontières nutritionnelles et inscription de la vraie marche dans les repos. Distance narrative distincte du pion et de toute arrivée spatiale. Compilation privée réussie : 14 nouveaux cas puis 42 régressions dans une exécution distincte ; [guide voyage](travel.md), `lib/travel-state.ts`, `mcp-server/travel.ts`, `tests/travel.test.cjs`. Groupes, montures, véhicules, météo et allures magiques restent ouverts. L'orientation est en cours avec TRAVEL-SURVIVAL, sans la déclarer déjà validée.


- **Orientation W11 gelée ensuite** : `resolve_travel_navigation` et `advance_navigation_search` ajoutés et classés dans l'application ; neuf nouveaux cas, quatorze voyages et quatorze contrôles génériques passent dans leurs collectes privées distinctes avec compilation0. Un ancien test d'Inspiration à0PV a été adapté au vrai checkpoint puis au prochain tour par l'agent du cycle joueur, son cas ciblé passe séparément. Détails et limites sous TRAVEL-SURVIVAL. Le budget applicatif des segments répétés d'un même voyage reste à tester/raccorder ; aucun déplacement de pion automatique ajouté.


- **Raccord applicatif W12 des segments achevé** : les appels explicitement choisis d'un même `journeyId` partagent leur action d'exploration ; sauvegardes de marche forcée toujours choisies par l'IA et résolues avant la suite. Nouveau trajet et repos sans rapport restent des actions distinctes. Deux tests réels MCP/route/SQL passent avec TypeScript Next0 dans `output/mcp-wave12-app-20261102/travel-api-r2.log` : segments successifs/rejeu/fin sans téléportation, puis neuvième/dixième heures avec leurs vrais dés et épuisement. Ce privé utilise en lecture seule le moteur W11 figé ; seule l'API est modifiée, aucune compilation du moteur partagé. L'ancien raccord applicatif ci-dessus est résolu dans ce périmètre ; la full W11 en cours ne certifie pas cette évolution W12.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-MOVEMENT-MODES


<!-- BEGIN:W21-PUBLISHED-PHB-MOVEMENT-MODES -->


- **Raccord publié W21 — mêmes budgets, frontières d’opportunité exactes** : le vrai vol natif W20 et les parcours au sol qui le croisent conservent leur budget commun et leur coût antérieur. L’interruption n’ajoute pas de case ni de mouvement payé après la vraie frontière ; route et progression restent persistées. Voir [PHB-ADVANCED-COMBAT](#phb-advanced-combat) et [guide](native-flight-opportunities.md). Cette publication n’ajoute ni fouissement ni nouveau mode de déplacement ; les frontières XY non représentables refusent avant coût.


<!-- END:W21-PUBLISHED-PHB-MOVEMENT-MODES -->








- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — raccord des modes de déplacement.


- **Constat de l’audit initial** : Déplacement horizontal ; modes escalade/nage/ramper et coûts non complets.


- **Règles concernées** : Special Types of Movement ; Climbing, Swimming, and Crawling ; Using Different Speeds ; Being Prone ; Flying Movement ; Creature Size ; Size Categories ; Space ; Squeezing into a Smaller Space.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 9 unités rattachées à ce lot.


- **Prochaine étape concrète** : Représenter surfaces et altitudes autoritaires avant nage/escalade et vol vertical, puis traiter squeezing, gabarits multicases et alternance de vitesses sans inférence narrative.





- **Avancée du 31 octobre — relais W3** : helpers livrés dans [lib/movement-modes.ts](../lib/movement-modes.ts) et [mcp-server/movement-modes.ts](../mcp-server/movement-modes.ts), avec neuf tests préparés dans [movement-modes.test.cjs](../tests/movement-modes.test.cjs) et [guide](movement-modes.md). Raccord parent écrit dans navigation et combat_action(stand_up). Ramper et terrain difficile ajoutent chacun leur supplément à la vraie distance, y compris la diagonale alternée ; se relever coûte moitié vitesse ajustée avant Dash, avec arrondi explicite de la grille. TypeScript sans émission et syntaxe ont passé ; ces raccords sont inclus dans les 110 tests ciblés W3 réussis. Ils restent hors de l’attestation W2.





- **Reste connu** : nage/escalade publique sans surfaces/altitudes autoritaires, vol vertical, squeezing, gabarits multicases et alternance de plusieurs vitesses restent à traiter. Aucun relief, poids ou contexte aquatique n’est inventé.





- **Validation W3 finale** : compilation et TypeScript en sortie 0 ; **1 065/1 065 tests**, aucun échec/ignoré/annulé (exit 0, 292 609,8517 ms) ; playtest **30/30 tours, neuf scénarios, 97 appels mock et 0 $** (exit 0, 16 000 ms). listTools confirme **125 outils**, dont les huit nouveaux (exit 0). Les collectes ciblées 110/110, compatibilité 119/119 et dernières fixtures 26/26 ont passé. Attestation de l’instantané final W3 uniquement : [rapport et empreintes](rules-audit/validation-wave3-2026-10-31.json). Les travaux W4 ultérieurs sont exclus.





- **Gel nage/escalade C et raccords parent** : output/mcp-special-movement-20261102, build/typecheckMCP+Next0,186/186 dont23nouveaux. Cinq outils record_movement_medium/inspect_special_movement/move_by_climbing_or_swimming/continue_special_movement/complete_locomotion_fall, mêmes coordonnées réelles et budget partagé. Le parent ajoute garde positive de temps et repos sansappui, puis garde centrale autresacteurs/actions/tours ;5nouveaux tests de frontières verts (eau+suspension au début/avance/fin de repos, NPCcheck refusé avant dé, chute exacte encore résoluble). Ces5cas sont inclus dans16/16 puis68/68W17, pas dans l’ancien186. Les2API réels marche/nage/marche et escalade/hauteur sont en cours ; contexte dynamique actuel transmet Z/milieu plutôt qu’un retour implicite au sol. C immédiatement réaffecté Underwater, [guide](special-movement.md).





### PHB-VERTICAL-MOVEMENT





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Saut et élan réels ; pas altitude, rebords ou atterrissage à toute géométrie.


- **Règles concernées** : Jumping.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 1 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Relais du 2 novembre** : Après gel grimoire, agent réaffecté immédiatement. Contrat ciblé PHB5289–5301 validé : vrai saut direct, longueurs/hauteurs et élan de pas réels, coûts exacts, surfaces/appuis/vides et obstacles établis, tests source Athletics/Acrobatics et reprises. Nouveau privé `output/mcp-jumping-current-20261102`, premier état physique écrit ; aucun saut nouveau déclaré livré. Schéma de hauteur/surface à partager avec PHB-SPELL-AREAS, sans moteur vertical parallèle.





- **Progression ciblée suivante** : privé `output/mcp-jumping-oil-20261102`, compilation0 et31/31sauts/contacts signalés par C. Vrai élan mesuré, coûts fractionnaires, rebords/appuis, tests tenus, opportunités et réception/chute ; contacts huile à la marche, transport réel, déplacement forcé, réception/vol natif et retour de carte. Publication par petits raccords et tests intégrés encore à faire. Les volumes B partagent la même hauteur physique, sans seconde altitude parallèle.





- **Gel sauts C et raccord applicatif** : `output/mcp-jumping-oil-20261102`, TypeScript complet0/build0,35nouveaux cas ; dernière collecte54/54 (35sauts,16huile,3vol), précédente96/96 distincte à ne pas additionner. Les seuls raccords source sauts ont été publiés dans ROOT, sans compilation partagée. Modules actual-jump, movement-continuation, physical-ground-movement, outils vertical-tools et35tests jumping. Le parent prépare classement API, marche d’élan+saut, reprise du même jumpId et résolution auxiliaire de chute, domaine jumping et deux tests API/SQL dans `output/mcp-jumping-api-20261102`. Agent C immédiatement réaffecté aux contacts/arrêts Gear puis nage/escalade ; nouveau privé `output/mcp-ground-contacts-c-20261102`, gel sauts intact. Aucun binaire des sauts déclaré livré globalement.





- **Raccord API sauts vérifié** : `output/mcp-jumping-api-20261102`, TypeScript/build0,3/3API (13532,4868ms),18cas distincts API/frontières/navigation vérifiés via les collectes séparées. Un défaut réel de budget applicatif a été corrigé : une marche d’élan suivie du saut compte comme un mouvement composé, permettant une seule action associée ; un déplacement furtif ne donne pas un second mouvement. Le même jumpId conserve son jet/Inspiration/SQL et sa reprise, sans appel fabriqué. Les fixtures finales gardent les deux vrais dés de désavantage et le seul dé retenu, sans assertion affaiblie. Mock sortie0 :30/30tours, neuf scénarios,71appels,0$, objectifsOK (18259ms). [Rapport borné API sauts](rules-audit/validation-jumping-api-2026-11-02.json). Validation globale dans la nouvelle cohorte W15 en préparation, aucun remplacement du moteur W14 par un WIP.





- **Correctif élan indépendant prêt** : `output/mcp-jump-footwork-fix-20261102`, build0 et41/41 (6nouveaux+35sauts). Invalidation réelle au début du tour, passage prone/incapacité/KO, et témoin phase/combatGeneration empêchent de réutiliser un ancien élan après lever, soin ou autre rencontre. Anciens caches lisibles mais insuffisants pour attribuer un nouvel élan. Quatre petits fichiers de raccord et tests/footwork-lifecycle, sans Gear ; TypeScript final annoncé en cours, fusion après terminal de W15r2 puis nouvelle preuve bornée.





- **Publication W15r3 du 2 novembre** :2012/2012tests, TypeScript/build0, mock30/30 (neuf scénarios,71appels,0$, objectifsOK),222outils réellement exposés. Les700entrées figées et1142binaires publiés concordent ; [rapport permanent](rules-audit/validation-wave15-2026-11-02.json). Cette tranche sort du travail actif dans son périmètre livré ; les limites de transport vertical, géométrie réellement inconnue et les prochains contacts Gear restent ouverts dans leurs propres lots. Aucun travail Root postérieur n’est déclaré validé par transitivité.





### PHB-ENVIRONMENT





<!-- BEGIN:W22-BRIDGE-PHB-ENVIRONMENT -->


- **Raccord W22 confirmé dans son seul périmètre** : Raccord XGE sur le socle PHB de chute conservé par défaut : seules les options explicitement adoptées avant la cause changent la procédure. Vrai départ natif W20 et source de vitesse/position, première tranche500pieds et fins réelles ultérieures ; chute haute hors initiative d’abord refusée, entrée réelle explicitement choisie possible sans déplacement ni dette effacée. Les voies générique/native ne peuvent achever gratuitement un curseur actif, refus runtime avant coût/dé. Les gardes des anciens compléteurs saut/locomotion sont seulement vérifiées au code dans cette tranche ; aucun départ positif saut/loco/météo ni physique universelle livré. Colonne/support d’origine conservés, reprise refusée si un changement réel la rend inexécutable, aucune redirection automatique. Cadavre engagé : créneau physique passif seulement, pas nouveaux droits de jeu. Le statut et les autres limites PHB-ENVIRONMENT restent partiels. Les limites existantes restent valables ; aucun lot entier supplémentaire n’est déclaré terminé.


<!-- END:W22-BRIDGE-PHB-ENVIRONMENT -->


- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — chute standard.


- **Constat de l’audit initial** : Chute de fosse de10 pieds seulement ; pas chute générale par hauteur/plafond20d6 et géométrie verticale.


- **Règles concernées** : Falling.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 1 unités rattachées à ce lot.


- **Outils existants à compléter** : `interact_trap`.


- **Noms envisagés dans l’audit** : `resolve_fall`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Avancée W10** : source PHB ligne5360 consultée ponctuellement. `resolve_fall` résout un atterrissage établi par le MJ, distance réelle explicite : 1d6 par tranche complète de10pieds, plafond20d6, vrai dégât contondant, défenses et PV temporaires, prone si dégâts reçus avec immunités d'états. Reçus persistés/idempotents ; aucun mouvement, altitude ou temps inventé. Modules et dix tests publics écrits, validation en attente. La géométrie verticale et les options Xanathar restent distinctes et ouvertes.


- **Validation ciblée W10 chute** : build privé réussi, dix tests MCP publics réussis après remplacement de la seule fixture d'immunité par le vrai profil enregistré will_o_wisp. Sont vérifiés seuils/plafond, refus pré-dés, reçus/hydratation, résistance et PV temporaires, immunité prone et vrai dégât à0PV. Classification décision MJ et documentation ajoutées ; validation intégrée avec le reste de W10 encore attendue.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Validation intégrée W10** : TypeScript complet,1523/1523 tests et30/30 tours mock réussis dans l’instantané r2 ;141 outils uniques. Voir le [rapport W10](rules-audit/validation-wave10-2026-11-01.json). Cette clôture concerne le sous-périmètre décrit ; les limites et dépendances ci-dessus restent autoritaires.





### PHB-SURVIVAL





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — nutrition, forage et eau située.


- **Constat de l’audit initial** : Réserves, privation de nourriture/eau, respiration et suffocation absentes.


- **Règles concernées** : Suffocating ; Food and Water ; Food ; Water.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 4 unités rattachées à ce lot.


- **Dépendances** : [PHB-EXHAUSTION](#phb-exhaustion).


- **Intégration courante — W4-NUTRITION** : personnage unique aux besoins standard explicitement établis, historique initial réel, rations de deux livres et outres de quatre pintes possédées ; contenus partiels, outre vide conservée, reçus et remplacement strict. Journées de 24 heures, faim selon CON, eau/température, sauvegarde CON et effets réels d’épuisement. L’ordre simultané non fixé par la source demande un arbitrage explicite.


- **Outils effectifs** : `inspect_survival`, `begin_nutrition_tracking`, `consume_provisions`, `resolve_survival_day` ; raccords de `advance_time`, `advance_game_time`, des vrais tours et de `take_rest`. Aucun appel MCP n’est fabriqué par le serveur.


- **Raccord forage W12 gelé** : aliments gagnés réellement consommables en demi-livres, eau des récipients possédés en quarts de pinte, capacités PHB et masses actuelles exactes, anciens apports conservés sans refaire le plein. Collecte et consommation distinctes, aucun certificat de pureté inventé ; compilation privée0 et 66/66 ciblés dont 12 nouveaux, avec nutrition/portage/acquisitions/voyage/orientation. [Guide forage](foraging.md). Périmètre désormais inclus dans la W12 publiée :1780/1780, mock30/30, TypeScript/build0 et184outils vérifiés.


- **Relais W12 eau située — contrat approuvé, code en cours** : source canonique sur vrai objet de scène et fait/provenance établis, réserve finie ou permanence explicitement adjudiquée, sans recharge par nonce. Remplir/transvaser entre vrais récipients possédés ou déposés à portée unobstruée ; conserver volumes/dangers et prévalider les masses futures avant coûts. Mains, durée et coût interaction/action adjudiqués avec raison, aucune cadence RAW inventée ; en combat, opération instantanée du vrai tour ou refus d'un travail long non représenté. Hors combat, temps réel et activité light/strenuous selon opération. Le parent a fourni `recordRestMeasuredActivityInterval` : intervalle réel ou opération instantanée attestée, sans faux temps ; tests eau/repos à effectuer. Purification et détection automatique restent hors de cette tranche.


- **Gel eau après ce contrat** : `inspect_water_sources`, `establish_water_source`, `fill_water_container`, `transfer_water` intégrés ; build0 et **61/61 ciblés**, dont11nouveaux, forage/nutrition/portage/repos. Les trois cas repos demandés passent : light60s admissible, strenuous instantané interrompt réellement, trou d'historique refusé avant eau/temps. Stocks/dangers/masses conservés, mains/coûts/portée testés ; ancienne mesure d'objet-source invalidée après prélèvement. [Guide eau](water-sources.md), modules water-sources/state/tools, `tests/water-sources.test.cjs`, privé `output/mcp-wave12-water-current-20261102` figé. Quatre tests API réels voyage/forage/eau/SQL et TypeScript Next0 passent dans `output/mcp-wave12-resource-api-20261102/provisions-api.log` : marche/forage/collecte liés au vrai trajet, remplissage, transfert ultérieur, rejeu sans eau/temps doublés et refus d'une autre action. Supports `foraging`/`water_sources` et consignes préparés ; global W12 validé et publié :1780/1780 et mock30/30, rapport W12 en tête du registre. Agent immédiatement réaffecté à la météo sous TRAVEL-SURVIVAL.


- **Récupération et temps** : le vrai repos long retire au plus un niveau lorsque les apports le permettent, avant les soins au maximum de PV restauré. Absence de suivi, apports insuffisants et provenance inconnue non satisfaite restent bloqués. Les échéances refusent avant coûts/dés ; un vrai pas de combat de six secondes peut suspendre le round avec reprise persistée après l’événement quotidien et avant initiative.


- **Fichiers** : [état](../lib/survival-state.ts), [résolveur](../mcp-server/survival.ts), [précontrôle temporel](../mcp-server/time-preflight.ts), [outils](../mcp-server/tools/survival-tools.ts), [guide](survival-nutrition.md).


- **Tests ajoutés** : [nutrition](../tests/survival-nutrition.test.cjs), [cycle](../tests/survival-lifecycle.test.cjs), [route/SQL](../tests/dm-survival-routing.test.cjs), [atomicité](../tests/survival-preflight-atomicity.test.cjs) ; 27 déclarations réparties 14/7/2/4. Les totaux globaux sont ceux des résumés Node, sans déduction entre instantanés.


- **Validation W4** : TypeScript final sortie 0 ; **1 094/1 094 tests**, sortie 0 ; **30/30 tours mock**, neuf scénarios, 97 appels, 0 $, sortie 0 ; **129 outils MCP**, quatre nutrition présents, aucun argument public de contournement. Première collecte 84/86 conservée, puis retest 11/11 et suite complète acceptée. [Rapport et empreintes](rules-audit/validation-wave4-2026-10-31.json) de l’instantané corrigé `output/mcp-wave4-final-20261031` : 37 entrées source/tests inchangées, 23 binaires et 13 artefacts.


- **Découvertes corrigées pendant le lot** : compteur saturé à 20 000 avec `foodDebtAtLeast` (« au moins »), remis à zéro seulement après vraie alimentation complète ; restauration de `currentTurn: null` permise uniquement avec le témoin exact de pause nutrition/combat, rejets des témoins étrangers et des mutations de PV dues. Provenance : vérification ciblée de `lib/survival-state.ts`, `mcp-server/survival.ts`, `mcp-server/game-state.ts` et `mcp-server/tools/player-tools.ts` pendant l’implémentation ; aucun nouvel audit des livres. La préparation Identify tient compte de la vraie recharge d’aube avant son D20 de contrôle, sans changer l’assertion.


- **Reste connu / prochaine étape** : respiration/suffocation, besoins non standard/raciaux, nourriture magique, contamination, achats/récolte, eau située et remplissage des récipients, réserves de groupe/PNJ, consommation en combat. Ne pas marquer PHB-REST-LIFECYCLE ou PHB-TRAVEL livrés à partir de cette seule tranche.


- **Préférence produit du 31 octobre — nutrition après décès** : l'utilisateur indique explicitement que la suspension du suivi nutritionnel d'un mort n'est pas un besoin à poursuivre. Ce point est retiré des recommandations et du travail restant de PHB-SURVIVAL ; ne pas le rouvrir automatiquement. Le code déjà livré n'est pas supprimé. La sonde brute reste une archive factuelle ; seul l'horodatage manquant de Consume Life reste un raccord distinct de [MM-POWERS](#mm-powers), utile à l'éligibilité de Revivify.





- **Reprise W10 du 1er novembre** : lot attribué à respiration depuis ce registre, sans nouvel audit. Contrat et implémentation en cours ; seules les validations réellement obtenues seront consignées avant livraison.


- **Avancée W10 — suffocation** : état et reçus, outils `inspect_breathing`/`set_breathing_context`, réserve CON, grâce en rounds, effondrement réel non-dégât, verrous soins/stabilité et réconciliation documentée des sauvegardes branchés. Le joueur effondré hors combat obtient des événements temporels exacts, conservés après retour à l'air tant qu'il reste mourant ; cinq scénarios MCP publics réussis avec build privé. Le réveil stable PNJ bloqué sous suffocation est repris à la vraie heure du retour d'air, sans nouveau d4 ni soin rétroactif. Essais PNJ/unitaires en cours ; correction de l'inscription explicite au combat d'un corps stable ayant un contexte respiratoire réel, puis validation intégrée à poursuivre.





- **Validation intégrée W10** : TypeScript complet,1523/1523 tests et30/30 tours mock réussis dans l’instantané r2 ;141 outils uniques. Voir le [rapport W10](rules-audit/validation-wave10-2026-11-01.json). Cette clôture concerne le sous-périmètre décrit ; les limites et dépendances ci-dessus restent autoritaires.





### PHB-LIGHT-SENSES





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — validate_wave3.


- **Constat de l’audit initial** : Lumière normale et darkvision source ; pas tous équipements/sens, obscurité magique ou attribution raciale libre.


- **Règles concernées** : Vision and Light ; Blindsight ; Darkvision ; Truesight ; Unseen Attackers and Targets.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 5 unités rattachées à ce lot.


- **Prochaine étape concrète** : Raccorder les avantages/désavantages de combat aux facettes de perception lorsque requis, puis représenter contact/vibrations, obscurité magique et autres occultations avant leurs effets.





- **Avancée du 31 octobre — W3** : Raccord livré : inspect_creature_senses et canSee délégué aux profils natifs réels. Violet Fungus : blindsight 30 pieds et cécité au-delà ; Grick : darkvision 60 pieds. [Profils partagés](../lib/creature-senses.ts), [résolveur](../mcp-server/senses.ts), [outil](../mcp-server/tools/sense-tools.ts), [raccord](../mcp-server/monster-perception.ts), [guide](creature-senses.md). Huit tests préparés dans [creature-senses.test.cjs](../tests/creature-senses.test.cjs), TypeScript et syntaxe réussis, collecte ciblée centrale réussie ; régression complète W3 réussie dans son instantané final. Murs et couverture totale conservés ; pas de sens racial déduit, de tremorsense sans contact modélisé, ni d’obscurité magique/brouillard révélés par inspection. Les effets des états blinded/invisible sur les jets restent distincts de la perception.








- **Validation W3 finale** : compilation et TypeScript en sortie 0 ; **1 065/1 065 tests**, aucun échec/ignoré/annulé (exit 0, 292 609,8517 ms) ; playtest **30/30 tours, neuf scénarios, 97 appels mock et 0 $** (exit 0, 16 000 ms). listTools confirme **125 outils**, dont les huit nouveaux (exit 0). Les collectes ciblées 110/110, compatibilité 119/119 et dernières fixtures 26/26 ont passé. Attestation de l’instantané final W3 uniquement : [rapport et empreintes](rules-audit/validation-wave3-2026-10-31.json). Les travaux W4 ultérieurs sont exclus.





### PHB-SOCIAL-POLICY





- **État** : Livré partiellement. **Priorité** : decision. **Responsable** : Coordination — intégration, déplacements et validation.


- **Constat de l’audit initial** : Empathie et conséquences de campagne ; cette règle projet n’est pas toute la procédure PHB/DMG de disposition.


- **Règles concernées** : Social Interaction ; Roleplaying ; Descriptive Approach to Roleplaying ; Active Approach to Roleplaying ; Results of Roleplaying ; Ability Checks.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 6 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Décision utilisateur du 1er novembre — poursuite complète** : règles standard D&D 2014 par défaut, explicitement choisies par l’utilisateur ; initiative conservée pendant tout le combat. La décision de principe est actée, le raccord effectif reste à réaliser/valider. Les variantes ne sont pas activées par défaut, et les options d’une autre édition ne deviennent pas des règles 2014. Les règles maison antérieures ne constituent pas une conformité PHB acquise.





- **Relais après gel météo B — 2 novembre** : nouveau privé `output/mcp-wave15-b-social-20261102`, partagé avec l’autre entrée sociale du même mécanisme. Contrat standard2014 : vraies attitudes MJ, conversation et participants choisis, demande exacte et risque/sacrifice réels, tables DMG et reprise des dés ; aucun secret, acte de volonté, ordre, quête ou récompense exécuté automatiquement. [Choix remplacé le 2 novembre : seule la procédure 2014 est conservée] ; répétition décidée par le MJ, sans relance par nonce. Aucun outil social nouveau encore déclaré livré.





- **Validation et publication W14 du 2 novembre** :1925/1925tests, TypeScript/build0, mock30/30 (neuf scénarios,71appels,0$, objectifs OK),208outils réellement exposés. Les642entrées figées et1049binaires publiés concordent ; [rapport permanent W14](rules-audit/validation-wave14-2026-11-02.json). Ce lot sort du travail actif dans son périmètre livré ; ses limites spécifiques ci-dessus et les autres lots de catalogue restent distincts. Les sources des agents suivantes ne sont pas couvertes par cette livraison.





### PHB-REST-LIFECYCLE





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — périodes de repos validées W11.


- **Constat de l’audit initial** : DV/ressources réels ; sommeil, privation, armure et interruptions générales incomplets ; repos traversant poison dû refusé sans continuation partielle.


- **Règles concernées** : Resting ; Short Rest ; Long Rest.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 3 unités rattachées à ce lot.


- **Dépendances** : [PHB-EXHAUSTION](#phb-exhaustion) ; [PHB-SURVIVAL](#phb-survival).


- **Démarrage W11 sans audit** : source PHB lignes5489–5509 et helpers `shortRest`/`longRest` lus ponctuellement. Nouveau noyau `lib/rest-state.ts` : périodes et segments datés contigus, sommeil/light/activité intense, garde des durées réelles, reçus d'activité immuables et éligibilité sans bénéfice. Compilation isolée et huit tests de règles réussis (`tests/rest-period.test.cjs`, sortie0). Ce noyau n'est pas encore un outil de jeu : restent les appels MCP et le temps réel, les interruptions/continuations, les vrais coûts et bénéfices des repos existants. L'accumulation des activités intenses dans la période explicitement enregistrée est marquée comme interprétation, pas comme clarification publiée ; aucun historique ni intervalle rétroactif n'est inventé.


- **Avancée W11 repos du 2 novembre** : sept outils enregistrés : `inspect_rest`, `begin_rest`, `advance_rest`, `record_rest_activity`, `finish_rest`, `abandon_rest`, `spend_rest_hit_die`. Sommeil réel avec unconscious et chute des objets tenus, bénéfices seulement à l'achèvement éligible, aucun temps payé une seconde fois ; les repos atomiques existants et l'étude d'objet magique passent par ces mêmes périodes. DV additionnels choisis un par un au même véritable achèvement, reçus distincts, aucune seconde heure ni nouveau renouvellement de ressources ; Chant de repos une seule fois et seulement si un DV rend effectivement des PV. Activités et temps externes doivent être constatés depuis le vrai checkpoint ; marcher inscrit son intervalle intense mesuré. Compilation privée réussie, 21/21 cas repos dans une collecte de 66/67 ; seul échec externe : ancienne fixture d'anneau/sauvegarde de mort, corrigée et validée séparément par l'agent du cycle joueur. `lib/rest-state.ts`, `mcp-server/resting.ts`, `mcp-server/tools/rest-tools.ts`, `tests/rest-lifecycle.test.cjs`. Le budget applicatif des DV successifs est raccordé et son TypeScript passe ; test route/persistance et validation globale restent à faire. Aucune livraison complète W11 revendiquée.


- **Validation applicative W11 suivante** : `tests/dm-rest-lifecycle.test.cjs` confirme repos enregistré et atomique, DV successifs après résultats, rejeu sans double dépense, refus d'une action sans rapport, arguments IA transmis exactement et état SQL identique au moteur. 23/23 repos+règles+API passent dans `output/mcp-wave11-rest-current-20261101/rest-api-r5.log`. Puis TypeScript complet0, compilation0 et 65/65 cas combinés repos/incantations/API/consignes/frontière IA passent dans `rest-casting-r6.log`. [Guide repos](rest-lifecycle.md), domaine `get_rules_support(rests)` et consignes mis à jour. Ces preuves ciblées ne remplacent pas la full W11 et le playtest à venir.


- **Dernier raccord W11 de rejeu** : les activités et observations d'une période clôturée se rejouent depuis son vrai reçu, même après hydratation et début d'un autre repos, sans changer temps/bénéfices/période courante ; nouvel événement sur ancien repos toujours refusé. Ce cas et les suites repos/API/rituels/voyage/orientation/Inspiration passent 59/59 après build privé0 (`rest-final-r7.log`). La copie parent est ensuite figée pour typecheck/full/playtest W11 ; les sources W12 simultanées forage/catalogue-filet/nat20 ne sont pas incluses par transitivité.


- **Première full W11 et corrections** : 1679 tests,1672 réussis/7 échecs Node (quatre cas racines avec sous-cas/parents), sortie1. Deux vrais raccords corrigés : le jet de mort PNJ ne satisfait pas un plan joueur de même nom malgré son coût0 ; le repos atomique renvoie et conserve les vraies récupérations survenues pendant son activité, sans deuxième résolution. Deux anciennes fixtures adaptées sans affaiblir les assertions : checkpoint puis vrai début de tour pour la sauvegarde sous épuisement, corps réellement mort pour le rollback d'entrée de rencontre (vivant0 est désormais admissible). TypeScript complet0, build0 puis les neuf cas/sous-cas ciblés passent dans `w11-corrections-r2.log`. Après terminaison de la r1, seuls ces correctifs et fixtures sont reportés dans la copie ; fullr2 puis mock lancés séquentiellement, résultat encore en attente. La copie W11 reste distincte des nouveaux travaux W12.


- **Validation finale W11** : la r2 passe **1679/1679**, TypeScript complet0, build0 et mock30/30, neuf scénarios/97appels/0$. Inventaire169outils et six nouveaux domaines contrôlés,889binaires exacts publiés, nouveau processus ROOT vérifié ; [rapport final](rules-audit/validation-wave11-2026-11-02.json). Repos segmentés/atomiques et études partagent leurs vraies périodes, sans deuxième durée ni perte de résultats de récupération. Les variantes non adoptées, nouvelles fiches et limites des autres lots ne sont pas déclarées implémentées par cette preuve.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-COMBAT-CORE





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Base du tour résolue pour les profils ; ce groupe comprend aussi des exceptions/lacunes détaillées dans leurs propres lignes.


- **Règles concernées** : Combat ; Combat Step by Step ; The Order of Combat ; Your Turn ; Bonus Actions ; Other Activity on Your Turn ; Interacting with Objects Around You ; Reactions ; Movement and Position ; Breaking Up Your Move ; Moving between Attacks ; Difficult Terrain ; Moving around Other Creatures ; Actions in Combat ; Attack ; Dash ; Disengage ; Dodge ; Making an Attack ; Attack Rolls ; Modifiers to the Roll ; Rolling 1 or 20 ; Ranged Attacks in Close Combat ; Melee Attacks ; et 4 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 28 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-SURPRISE





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — validation W6.


- **Constat de l’audit initial** : Cas d’embuscades autorées ; surprise générale et restriction de tous participants non complètes.


- **Règles concernées** : Surprise.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 1 unités rattachées à ce lot.








- **Livraison W5 du 31 octobre** : Décision MJ explicite, validée avant phase/initiative et persistée avec carte/génération et fin individuelle du premier tour. Mouvement/action/bonus et réaction restent verrouillés jusqu’à la vraie fin, après sauvegardes et réactions tenues. Les slots KO réellement traversés acquittent la surprise sans inventer de tour, réaction ni dé ; cas de fin de roster et joueur seul actif couverts. Voir [surprise.md](surprise.md).


- **Outils/raccords W5 validés** : enter_combat (surprise: {surprisedIds, reason}), next_turn, contrôles centraux.


- **Preuve finale W5** : 1 201/1 201 tests, TypeScript complet et 30/30 tours mock passent ; [rapport borné et empreintes](rules-audit/validation-wave5-2026-10-31.json).








- **Livraison W6 du 1er novembre** : inspect_encounter({encounterId}) expose au MJ le roster exact avec monsterIndex zéro-based, carte, alerte et état du preset, sans mutation/découverte du joueur. start_encounter accepte surprise:{playerSurprised,surprisedMonsterIndices,reason} pour ce preset, validé avant visite/mouvement/spawn/phase/dés ; ambush ou awareness ambushing et roster remplacé sont incompatibles. Les mêmes restrictions W5 du premier tour sont réutilisées. Dix tests moteur, cinquante régressions et deux tests de routage confirment lecture sans action consommée, résolution planifiée non satisfaite et arguments exacts, puis passent dans la suite intégrée. Voir [surprise.md](surprise.md).


- **Outils/raccords W6 validés** : inspect_encounter, start_encounter(surprise), enter_combat ; tools/phase-tools.ts, surprise.ts, lib/surprise-state.ts, registration index et classement documentaire route/planner.


- **Reste / prochaine étape** : Le champ de surprise de start_encounter reste réservé aux presets exacts sans remplacement ni embuscade préparée ; les acteurs préparés autrement utilisent enter_combat avec leurs IDs explicites. Aucune surprise inférée de prose ni changement du choix produit initiative relancée par round. Les références inspectées restent confidentielles au MJ.


- **Preuve finale W6** : 73/73 ciblés puis **1 274/1 274 tests**, TypeScript complet, playtest **30/30 tours**, neuf scénarios, 97 appels mock et 0 $, tous sortie 0 ; **131 outils** vérifiés. [Rapport et empreintes W6](rules-audit/validation-wave6-2026-11-01.json).





### PHB-ACTION-EXTENSIONS





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Résolveurs atomiques bornés aux actions/objets suivis ; pas effet libre ou découverte automatique.


- **Règles concernées** : Help ; Hide ; Ready ; Search ; Use an Object ; Improvising an Action.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 6 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-TWO-WEAPON





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Off-hand présent, sans attaque bonus deux armes/prérequis/modificateur de dégâts.


- **Règles concernées** : Two-Weapon Fighting.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 1 unités rattachées à ce lot.


- **Outils existants à compléter** : `resolve_player_attack`, `equip_item`.


- **Dépendances** : [PHB-WEAPONS](#phb-weapons).


- **Intégration courante — W2-TWO-WEAPON** : Deux instances légères, témoin Attaquer, bonus unique, modificateurs et style acquis, lancers physiques, reprises persistées ; aucun équipement/style/don gratuit.


- **Avancées vérifiées dans le lot** : Témoin persisté d’une vraie action Attaquer, deux instances légères précises, autre main et action bonus unique ; un échec primaire peut qualifier. Modificateur positif retiré sauf style Deux armes acquis, modificateur négatif conservé. Les lancers déplacent les instances physiques ; les reprises bardiques ne relancent pas le d20. Duel compte les deux mains et la catégorie d’arme de mêlée, même lancée : après le premier lancer, il peut reconnaître la seule arme encore tenue.


- **Outils effectifs** : `resolve_two_weapon_attack`.


- **Fichiers** : [lib/two-weapon-state.ts](../lib/two-weapon-state.ts), [mcp-server/two-weapon.ts](../mcp-server/two-weapon.ts), [mcp-server/tools/two-weapon-tools.ts](../mcp-server/tools/two-weapon-tools.ts), [tests/two-weapon.test.cjs](../tests/two-weapon.test.cjs), [tests/two-weapon-integration.test.cjs](../tests/two-weapon-integration.test.cjs), [docs/two-weapon-fighting.md](../docs/two-weapon-fighting.md).


- **Raccords et tests complémentaires** : [mcp-server/hero-combat.ts](../mcp-server/hero-combat.ts), [mcp-server/equipment.ts](../mcp-server/equipment.ts), [mcp-server/tools/combat-tools.ts](../mcp-server/tools/combat-tools.ts), [mcp-server/tools/object-tools.ts](../mcp-server/tools/object-tools.ts), [tests/two-weapon-dueling.test.cjs](../tests/two-weapon-dueling.test.cjs), [tests/dm-priority-wave2.test.cjs](../tests/dm-priority-wave2.test.cjs).


- **Validation W2** : TypeScript réussi (exit 0), régression finale **999/999 tests**, aucun échec ni test ignoré (exit 0, 459 359,6621 ms). Validation sur l’instantané isolé output/mcp-priority-wave2-20261031, qui précède les raccords W3 et les modes de déplacement en cours ; ces derniers ne sont pas attestés par ce résultat. Les 67 tests ciblés, les 12 scénarios de transport et le précédent playtest mock 30/30 avaient aussi passé. Le playtest final a réussi **30/30 tours, 9 scénarios, 97 appels mock et 0 $** (exit 0) ; listTools a confirmé **117 outils** (exit 0). Preuves et empreintes : [rapport W2](rules-audit/validation-wave2-2026-10-31.json).


- **Reste connu** : L’attaque bonus vise actuellement une créature active. Une attaque primaire contre un objet préparé peut qualifier, mais l’attaque bonus contre un objet reste à raccorder. Aucun équipement, style ou don Dual Wielder n’est accordé gratuitement.


- **Prochaine étape concrète** : Raccorder une attaque bonus contre un objet préparé en partageant ses coûts/dégâts autoritaires ; conserver les témoins, mains et reprises existants.





### PHB-GRAPPLE-TRANSPORT





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — intégration, déplacements et validation.


- **Constat de l’audit initial** : Agripper/bousculer/échapper pour le joueur ; PNJ et transport non complets.


- **Règles concernées** : Grappling ; Escaping a Grapple ; Moving a Grappled Target ; Shoving a Creature.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 4 unités rattachées à ce lot.


- **Outils existants à compléter** : `combat_action`, `move_token`.


- **Noms envisagés dans l’audit** : `move_grappled_creature`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Dépendances** : [PHB-ENCUMBRANCE](#phb-encumbrance) ; [PHB-MOVEMENT-MODES](#phb-movement-modes).


- **Intégration courante — W2-GRAPPLE-TRANSPORT** : Prise existante, deux destinations, chemins joints, demi-vitesse/exception taille, budget et réactions ; pas encumbrance générale, gabarits multicases, prises multiples ou transfert inter-cartes.


- **Avancées vérifiées dans le lot** : Prise réelle dans l’état, détenteur/cible et deux destinations explicites ; chemins joints, demi-vitesse et exception de deux tailles, budget et pas atomiques. Le corps forcé ne provoque pas d’attaque d’opportunité ; la continuation garde les destinations et les dés tenus. Le détenteur exact, joueur ou monstre, peut utiliser combat_action(release_grapple) sans action, sans soin ni réveil de sa victime. Une victime vivante à 0 PV reste transportable si sa prise existe.


- **Outils effectifs** : `preview_grapple_transport`, `move_grappled_creature`.


- **Fichiers** : [mcp-server/grapple-transport.ts](../mcp-server/grapple-transport.ts), [mcp-server/tools/grapple-transport-tools.ts](../mcp-server/tools/grapple-transport-tools.ts), [tests/grapple-transport.test.cjs](../tests/grapple-transport.test.cjs), [tests/dm-priority-wave2.test.cjs](../tests/dm-priority-wave2.test.cjs), [docs/grapple-transport.md](../docs/grapple-transport.md).


- **Raccords et tests complémentaires** : [mcp-server/navigation.ts](../mcp-server/navigation.ts), [mcp-server/hero-movement.ts](../mcp-server/hero-movement.ts), [mcp-server/game-state.ts](../mcp-server/game-state.ts), [mcp-server/combat-actions.ts](../mcp-server/combat-actions.ts), [mcp-server/tools/hero-tools.ts](../mcp-server/tools/hero-tools.ts), [mcp-server/tools/map-tools.ts](../mcp-server/tools/map-tools.ts).


- **Validation W2** : TypeScript réussi (exit 0), régression finale **999/999 tests**, aucun échec ni test ignoré (exit 0, 459 359,6621 ms). Validation sur l’instantané isolé output/mcp-priority-wave2-20261031, qui précède les raccords W3 et les modes de déplacement en cours ; ces derniers ne sont pas attestés par ce résultat. Les 67 tests ciblés, les 12 scénarios de transport et le précédent playtest mock 30/30 avaient aussi passé. Le playtest final a réussi **30/30 tours, 9 scénarios, 97 appels mock et 0 $** (exit 0) ; listTools a confirmé **117 outils** (exit 0). Preuves et empreintes : [rapport W2](rules-audit/validation-wave2-2026-10-31.json).


- **Reste connu** : Gabarits actuels d’une cellule, pas de poids/encumbrance générale, port de cadavre, prises multiples transportées, déplacement préparé conjoint ni transfert inter-cartes. Les prises réelles doivent être libérées ou échappées avant voyage ; l’ancien marqueur isolé doit garder le refus historique d’immobilité. Le correctif de compatibilité d’escalier est validé par les 999 tests de la vague W2.


- **Prochaine étape concrète** : Poursuivre les dépendances de portage/poids et de modes de déplacement avant tout gabarit multicase, prise multiple ou transport inter-cartes ; ne pas élargir implicitement le sous-lot livré.





### PHB-COVER





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Rayon géométrique présent ; pas demi/trois-quarts abri +2/+5 CA et JS DEX ni procédure générale d’abri.


- **Règles concernées** : Cover.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 1 unités rattachées à ce lot.


- **Outils existants à compléter** : `resolve_player_attack`, `cast_spell`, `resolve_saving_throw`.


- **Noms envisagés dans l’audit** : `inspect_cover`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Intégration courante — W2-COVER** : Couverture directionnelle déclarée +2/+5 CA/DEX, totale, vraies origines et Sacred Flame ; pas géométrie3D, pourcentages pixel ou propagation totale autour des coins.


- **Avancées vérifiées dans le lot** : Déclarations ancrées à une origine acteur ou cellule et aux positions réelles ; seul le plus fort bonus +2/+5 s’applique à la CA et aux sauvegardes de DEX. Origines de zone et d’Arme spirituelle distinctes du lanceur, exception de sauvegarde de Sacred Flame. Couverture totale contrôlée avant tout dé/coût, y compris toute la liste de multiattaque et le dé de son nombre aléatoire.


- **Outils effectifs** : `configure_cover`, `inspect_cover`.


- **Fichiers** : [lib/cover-state.ts](../lib/cover-state.ts), [mcp-server/cover.ts](../mcp-server/cover.ts), [mcp-server/tools/cover-tools.ts](../mcp-server/tools/cover-tools.ts), [tests/cover.test.cjs](../tests/cover.test.cjs), [tests/cover-action-preflight.test.cjs](../tests/cover-action-preflight.test.cjs), [docs/cover.md](../docs/cover.md).


- **Raccords et tests complémentaires** : [mcp-server/hero-combat.ts](../mcp-server/hero-combat.ts), [mcp-server/hero-spells.ts](../mcp-server/hero-spells.ts), [mcp-server/monster-rules.ts](../mcp-server/monster-rules.ts), [mcp-server/tools/combat-tools.ts](../mcp-server/tools/combat-tools.ts), [mcp-server/tools/hero-tools.ts](../mcp-server/tools/hero-tools.ts), [tests/dm-priority-wave2.test.cjs](../tests/dm-priority-wave2.test.cjs).


- **Validation W2** : TypeScript réussi (exit 0), régression finale **999/999 tests**, aucun échec ni test ignoré (exit 0, 459 359,6621 ms). Validation sur l’instantané isolé output/mcp-priority-wave2-20261031, qui précède les raccords W3 et les modes de déplacement en cours ; ces derniers ne sont pas attestés par ce résultat. Les 67 tests ciblés, les 12 scénarios de transport et le précédent playtest mock 30/30 avaient aussi passé. Le playtest final a réussi **30/30 tours, 9 scénarios, 97 appels mock et 0 $** (exit 0) ; listTools a confirmé **117 outils** (exit 0). Preuves et empreintes : [rapport W2](rules-audit/validation-wave2-2026-10-31.json).


- **Reste connu** : La géométrie 3D et les pourcentages d’image ne sont pas calculés. Les propagations de zones à travers une couverture totale ou autour des coins non modélisés sont refusées. Une origine de projectile de piège absente n’est pas inventée.


- **Prochaine étape concrète** : Compléter les origines et géométries explicitement représentées avant d’autoriser la propagation des zones autour des coins ou en 3D ; garder les refus avant coûts/dés.





- **Correctif ciblé W3 — origine explicite** : une origine acteur inconnue ou une cellule hors carte pouvait donner silencieusement zéro bonus de DEX. assertCoverOriginKnown vérifie désormais les arguments explicites avant le jet, sans choisir d’origine par défaut et en conservant l’absence d’origine quand aucune couverture ne l’exige. Fichiers : [résolveur](../mcp-server/cover.ts), [trois tests nouveaux](../tests/cover-origin-validation.test.cjs), [guide](cover.md). Les trois tests ont passé dans la régression finale W3 **1 065/1 065**, ainsi que TypeScript et le playtest 30/30 (sorties 0). Provenance : constat ciblé de cover_origin_validation pendant le raccord, sans audit global. Preuves : [rapport W3](rules-audit/validation-wave3-2026-10-31.json).





### PHB-DAMAGE-EXTENSIONS





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Coordination — cycles à 0 PV et plafonds de soin.


- **Constat de l’audit initial** : Dégâts/soins/mort/JS réels ; tous effets spéciaux et exceptions de créatures nécessitent leur résolveur.


- **Règles concernées** : Hit Points ; Damage Rolls ; Critical Hits ; Damage Types ; Damage Resistance and Vulnerability ; Healing ; Dropping to 0 Hit Points ; Instant Death ; Falling Unconscious ; Death Saving Throws ; Stabilizing a Creature ; Monsters and Death.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 12 unités rattachées à ce lot.


- **Découverte locale W10 / reprise W11** : source PHB ligne6095 déjà utilisée pour la suffocation : la récupération naturelle d'une créature stable à0PV après1d4heures ne possédait pas de délai joueur, contrairement aux PNJ. Agent respiration réaffecté à ce raccord : vrai événement de stabilité daté et d4 unique, annulation aux changements réels, retour1PV à l'heure réelle, verrou sansair conservé. Les anciens états stables sans horodatage/dé restent lisibles mais non résolus ; aucun historique ni délai redémarré au chargement. Modules/tests en préparation, aucune livraison de ce nouveau sous-lot revendiquée.


- **Avancée W11 joueur stable — ciblée** : `inspect_player_recovery` enregistré ; minuteur et d4 réels branchés sur les transitions, annulations, horloge et retour d'air. Quinze nouveaux tests (sept unitaires/huit MCP) et cinq cas moteur ciblés réussissent après build privé ; les24 régressions précédentes restent une exécution distincte. Guide [récupération joueur](player-stable-recovery.md). Les classifications/support ont suivi ; la validation globale W11 reste à effectuer. Agent immédiatement réaffecté au cycle joueur mourant général et à l'entrée en combat à0PV vivant.


- **Prochaine borne constatée localement W11** : l'entrée dans un nouveau combat appelle encore `assertAlive` sur le joueur à0PV ; le test de récupération joueur utilise donc un slot réellement établi avant sa chute, sans élargir silencieusement cette politique. Les sauvegardes temporelles joueur hors combat restent actuellement réservées à l'épisode réel de suffocation (`roll_death_save`), contrairement au cycle PNJ général. Après le minuteur de stabilité, traiter ces deux raccords du cycle joueur général depuis de vrais épisodes, sans reconstruire de jets legacy.


- **Complément W11 cycle général du 2 novembre — validation ciblée** : `inspect_player_life` et `checkpoint_player_dying`, épisodes réels de chute et de retour à l'instabilité, sauvegardes explicites hors combat et au vrai début de tour. Une véritable entrée en combat à0PV vivant est permise, sans action physique ; `roll_death_save` ne consomme aucune action et ne peut être escamoté avec `skipAction`. Legacy sans historique : observation présente puis prochaine frontière, jamais de jet passé reconstruit. Adaptateur de suffocation, compteurs, reçus et fermeture aux soins/stabilité/mort conservés. Compilation privée réussie ; 31/31 cas publics, 6/6 moteur/anneau et 19/19 unitaires dans leurs collectes distinctes. [Guide cycle joueur](player-life.md), `lib/player-life-state.ts`, `mcp-server/player-life.ts`, `tests/player-life.test.cjs`. L'ancienne borne ci-dessus est donc résolue dans ce sous-périmètre ; classification/support applicatifs et suite intégrée W11 restent à terminer.


- **Découverte locale et relais W11** : pendant ce raccord, les chemins de 20 naturel joueur (`game-state.ts`) et PNJ (`npc-life-tools.ts`) affectaient directement 1PV sans appliquer `afflictionHealingLimit` (`afflictions.ts`). Agent immédiatement réaffecté à la source exacte et au raccord des interdictions de soin, sans audit global ; aucune correction ou clarification non vérifiée n'est déclarée livrée.


- **Contrat du relais W11 — source ciblée** : *Pale Tincture*, `rules/books/dmg-2014.md:8579`, interdit de soigner ses dégâts par tout moyen jusqu'à sa fin. Même garde à raccorder au 20 naturel et au réveil naturel PNJ constaté dans ce lot. Si aucun PV ne peut être regagné, aucun soin différé n'est stocké ; le 20 vaut un succès et trois succès peuvent stabiliser, interprétation explicitement annoncée de cette intersection, sans attribution à un errata. Fin/cure/suspension conservent le comportement du helper existant. Code et tests encore en cours.


- **Gel W12 après ce contrat** : 20 naturel joueur/PNJ et réveil naturel PNJ appliquent le vrai plafond, sans PV différé ; réveil empêché conserve d4/date, reprend une seule fois à la levée effectivement datée de la restriction. Source helper `lib/affliction-healing.ts`, états npc-life/nonlethal, afflictions, vrais chemins GS/PNJ/horloge. Nouveau constat reproduit dans `finishExhaustionHpChange` : un changement non fatal de maximum tuait un PNJ vivant0 ; correction bornée préserve épisode/compteurs/échéances, niveau6 ou maximum fatal enregistre une vraie mort même déjà0, retrait ultérieur sans résurrection. Build privé0 ; 12/12 nouveaux publics et 43 cas exhaustion/Inspiration verts dans leurs collectes, dont une fixture ancienne remplacée par le vrai checkpoint/tours puis rejouée1/1. Cohorte initiale119 : les deux sous-cas repos manquant le résultat `naturalRecoveries` restent au parent et sont traités avec W11, sans assouplir les assertions. `tests/death-save-healing-caps.test.cjs`, note [cycle joueur](player-life.md). Privé final `output/mcp-wave10-breathing-current-20261101` gelé ; source ROOT W12 conservée, aucun dist partagé modifié. Include explicite du nouveau helper ajouté par le parent conformément au guide. Agent immédiatement réaffecté aux portes secrètes/dissimulées ; validation intégrée W12 terminée :1780/1780, mock30/30 et publication vérifiée, rapport en tête du registre.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-NONLETHAL





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : nonlethal_attacks.


- **Constat de l’audit initial** : Monstre à 0 PV déclaré mort ; choix assommer sur attaque de mêlée absent.


- **Règles concernées** : Knocking a Creature Out.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 1 unités rattachées à ce lot.


- **Outils existants à compléter** : `resolve_player_attack`, `resolve_attack`.








- **Livraison W5 du 31 octobre** : Choix explicite avant la vraie attaque physique de mêlée du joueur. Seul l’impact réel à 0 PV produit monster.knockout stable horodaté, vivant/inconscient/prone, sans timestamp de mort. Corps conservé, XP une fois, place d’initiative sauvegardée sans tour/jet actif ; soin réel réactive sa place future sans tour rétroactif. Coûts, témoins, réactions, séquences et reprises conservent le choix exact. Dangers incompatibles et dégâts ultérieurs refusent avant dés/coûts. Voir [nonlethal-attacks.md](nonlethal-attacks.md).


- **Outils/raccords W5 validés** : resolve_player_attack, resolve_attack, resolve_player_multiattack, resolve_two_weapon_attack (nonlethal: true).


- **Preuve finale W5** : 1 201/1 201 tests, TypeScript complet et 30/30 tours mock passent ; [rapport borné et empreintes](rules-audit/validation-wave5-2026-10-31.json).











- **Livraison W6 du 1er novembre** : Le vrai KO stable tire une fois son d4 de récupération après stabilisation effective, puis persiste recovery.hours/wakeAt. Les horloges et repos rendent 1 PV à cette échéance réelle, y compris après un saut ou dans les archives sans activation. Les frontières pierre/KO sont traitées chronologiquement ; naturalRecoveries indique si une autre source conserve l’inconscience à cet instant. Ni relève, ni équipement, ni tour rétroactif ne sont ajoutés. Les 57 cas ciblés et 115 régressions préliminaires sont désormais complétés par la validation globale W6. Guides : [nonlethal-recovery.md](nonlethal-recovery.md), [nonlethal-attacks.md](nonlethal-attacks.md).


- **Outils/raccords W6 validés** : Quatre attaques existantes, advance_time, advance_game_time, take_rest et les vraies transitions de round ; état lib/nonlethal-state.ts et résolution mcp-server/nonlethal.ts.


- **Reste / prochaine étape** : Les autres profils d’attaques de sorts de mêlée devront d’abord être intégrés explicitement au catalogue depuis leurs fiches, dans la continuité du lot `PHB-SPELL-CATALOG`, avant de raccorder leur choix KO ; W9 n’active aucun autre sort ni accès de classe. Les attaques non létales des monstres, tirs, lancers, sauvegardes et dégâts automatiques restent hors du choix livré. Le choix non létal demeure réservé au joueur et à une cible réelle active vivante avec des PV positifs lorsque `nonlethal:true`. Sur une véritable frappe Arme spirituelle, le champ absent ou `false` conserve les dégâts W7 vers un PNJ suivi vivant à 0 PV ; cela ne modifie pas la borne positive préexistante des attaques en réaction W8. Arme spirituelle se lance en action bonus et ne devient pas éligible à Ready ; sa frappe directe ne possède pas de fenêtre Bardic/jet tenu et W9 n’en ajoute aucune. Les reprises déjà présentes ailleurs gardent le choix original, sans argument tardif de réécriture. Les refus de KO initial devant certains dangers récurrents, les anciens KO sans dé enregistré, les bornes de soin/réveil hors roster et les limites du cycle PNJ W7 restent applicables : statistiques réelles, politique MJ préalable ou épisode KO réel, témoins dus explicites, reçus conservés jusqu’à 256 et archives limitées à leur comptabilité autorisée, sans attaque ni soin public distant, présence ou initiative inventée.


- **Preuve finale W6** : 73/73 ciblés puis **1 274/1 274 tests**, TypeScript complet, playtest **30/30 tours**, neuf scénarios, 97 appels mock et 0 $, tous sortie 0 ; **131 outils** vérifiés. [Rapport et empreintes W6](rules-audit/validation-wave6-2026-11-01.json).





- **Livraison W7 du 1er novembre** : Cycle réel des PNJ à 0 PV pour les `MonsterState` existants. `configure_npc_death_saves({entityId,eventId,reason})` déclare une politique MJ immuable avant la blessure létale ; les monstres ordinaires gardent leur mort à 0 PV par défaut. Un vrai KO ouvre son épisode stable sans activer cette politique pour les blessures futures. Les dégâts reçus après les défenses, même absorbés par des PV temporaires, provoquent un échec à 0 PV, ou deux en cas de critique ; zéro ajusté ne modifie rien. Les dégâts massifs, trois succès/échecs, 1/20 naturels, la stabilisation Médecine, les soins et la mort réelle horodatée sont résolus par le moteur. Une stabilisation générique tire son seul d4 de récupération sans faux témoin d’attaque KO ; nouveaux dégâts et soins annulent le timer devenu caduc. Le regain de 1 PV n’efface pas une autre inconscience, ne relève ni ne rééquipe. Les XP d’un adversaire éligible ne sont attribués qu’une fois ; la chute d’un allié explicite n’en rapporte pas.


- **Outils/raccords W7** : Nouvel outil `configure_npc_death_saves` ; `roll_death_save({entityId,eventId})` exige le témoin moteur exact de l’épisode dû, avec le fonctionnement joueur inchangé lorsque `entityId` est omis. `combat_action({action:'stabilize',actorId,targetId})` résout Médecine DD 10 et l’action du véritable aidant. État/validation dans `lib/npc-life-state.ts`, cœur `mcp-server/npc-life.ts`, événements/reçus/reprises dans `mcp-server/tools/npc-life-tools.ts` et raccords HP/dégâts/soins/tours/roster/horloge. Le batch s’arrête devant un jet PNJ dû, puis le modèle choisit explicitement sa résolution et la reprise nécessaire ; aucune action MCP n’est fabriquée. Une chute après le vrai début du tour n’accorde pas de sauvegarde rétroactive. Hors combat et dans les archives, l’horloge ne franchit pas la prochaine frontière de six secondes sans le jet explicite ; le jet archivé ne crée ni présence, ni action, ni tour, ni rang. Guides : [npc-death-saves.md](npc-death-saves.md), [nonlethal-attacks.md](nonlethal-attacks.md), [nonlethal-recovery.md](nonlethal-recovery.md).


- **Preuve finale W7 r2** : **83/83 ciblés**, **1 331/1 331 tests**, compilation et TypeScript complets, **30/30 tours mock**, neuf scénarios, 97 appels mock et **0 $**, tous sortie 0 ; **132 outils** et fidélité des sources/configurations/tests confirmés. Le moteur partagé correspond aux **721 binaires** privés validés. [Rapport et empreintes W7](rules-audit/validation-wave7-2026-11-01.json). Les preuves préliminaires restent distinctes.





- **Livraison W8 du 1er novembre** : Le choix KO s’étend aux véritables attaques physiques de mêlée du joueur en opportunité et à la libération d’une attaque préparée. `resolve_reaction({pendingId,choice:'opportunity_attack',weaponOrSpell,nonlethal:true})` sélectionne l’intention avant le jet de la fenêtre de mouvement réellement proposée ; `resolve_readied_action({readyId,choice:'execute',triggerObserved,targetId,nonlethal:true})` la sélectionne à la libération de l’arme préparée, sans modifier la préparation. Les autres usages du champ, y compris `false` sur une branche non admissible ou un dé déjà tenu, refusent avant dés/coûts. Les reprises conservent la même intention, arme, cible et témoin d’attaque. Un KO en opportunité arrête le déplacement avant la sortie de portée et conserve la case du corps. Une attaque préparée paie son action à la préparation, puis sa seule réaction à la libération ; aucune Attaque supplémentaire, action Attaquer ou éligibilité bonus à deux armes n’est accordée. Les conséquences KO/stabilité/récupération/cycle PNJ restent celles de W7.


- **Outils/raccords W8** : Deux schémas d’outils existants étendus, sans nouvel outil : `resolve_reaction` dans `mcp-server/tools/hero-tools.ts` et `resolve_readied_action` dans `mcp-server/combat-actions.ts`. Le cœur `heroAttack` et ses commandes tenues existantes conservent le booléen. Raccords de guidage dans `lib/dm/prompts.ts` et `mcp-server/toolkit-support.ts`, guide [nonlethal-reactions.md](nonlethal-reactions.md). Le motif textuel du refus conservateur devant certains dangers initiaux a été corrigé sans élargir leur admissibilité ni retirer la prise en charge W7 des dégâts ultérieurs.


- **Preuve finale W8** : **72/72 ciblés**, **1 365/1 365 tests**, compilation et TypeScript complets, **30/30 tours mock**, neuf scénarios, 97 appels mock et **0 $**, tous sortie 0 ; **132 outils**, nouveaux schémas optionnels et fidélité des sources/configurations/tests confirmés. Le moteur partagé correspond aux **721 binaires** privés validés. [Rapport et empreintes W8](rules-audit/validation-wave8-2026-11-01.json). Les preuves isolées se recoupent et ne s’additionnent pas.





- **Livraison W9 du 1er novembre** : Le choix KO s’étend à l’attaque de sort de mêlée réellement implémentée d’Arme spirituelle, au lancement initial, par un véritable parchemin admissible et lors d’une frappe répétée. `cast_spell({spellId:'spiritual-weapon',slotLevel,toCell,targetId,nonlethal:true})`, `use_spell_scroll({itemId,toCell,targetId,nonlethal:true})` et `use_subclass_feature({featureId:'spiritual_weapon',effectId,targetId,toCell?,nonlethal:true})` portent chacun leur propre choix de frappe. Le champ du parchemin est au premier niveau ; il n’existe pas d’objet `spellArguments`. Le booléen et le témoin d’attaque ne deviennent pas des préférences durables de l’effet. Les vraies validations de lanceur, cible, source, portée et KO précèdent dés, coût, création ou déplacement. Les autres usages du champ refusent même `false` : autre sort/capacité, création ou déplacement sans attaque, cible non unique ou préparation de sort.


- **Outils/raccords W9** : Trois booléens optionnels sur les outils existants, sans nouvel outil ni profil de sort/créature : `cast_spell`, `use_spell_scroll`, `use_subclass_feature`. Six sources : `mcp-server/hero-spells.ts`, `mcp-server/tools/hero-tools.ts`, `mcp-server/tools/combat-tools.ts`, `mcp-server/tools/spell-scroll-tools.ts`, `mcp-server/toolkit-support.ts`, `lib/dm/prompts.ts`. Le cœur attribue à chaque frappe son UUID réel, transmis au KO stable et à son unique d4 de récupération. Le lancement ordinaire paie son slot et son action bonus ; le parchemin paie son action bonus et consomme la feuille, sans slot ; la frappe répétée utilise l’action bonus sans nouveau slot, action Attaquer ou témoin à deux armes. La source SRD épinglée classe cette attaque comme mêlée à cinq pieds de l’arme ; la distance du lanceur ou les dégâts de force ne déterminent pas l’admissibilité. Guide : [nonlethal-melee-spells.md](nonlethal-melee-spells.md).


- **Raccord de source découvert pendant W9** : Un vrai parchemin d’Arme spirituelle de niveau 2 doit utiliser le bonus d’attaque +5 de sa source, pour la frappe initiale et les répétitions de son effet (Spell Scroll, source locale page 242). Le diagnostic ciblé a confirmé l’ancien +7 issu de l’aptitude/maîtrise du lecteur. L’effet nouvellement créé depuis le parchemin validé conserve maintenant `scrollAttackBonus` et `scrollItemId` dans ses données persistées existantes, sans nouveau schéma Zod ; les frappes réutilisent ce bonus sans changer le modificateur d’aptitude réel des dégâts. L’incantation ordinaire reste inchangée, sans nouvelle fenêtre de réaction, avantage ou critique. Aucune provenance ni bonus de parchemin n’est inventé pour un ancien effet sans ce témoin. Le ciblé C-r2 et l’instantané complet r2 valident ce raccord ; ils ne constituent pas une attestation globale des changements training concurrents de ROOT.


- **Preuve finale W9 r2, périmètre figé** : **97/97 ciblés**, **1 408/1 408 tests**, compilation MCP et TypeScript complet, **30/30 tours mock**, neuf scénarios, 97 appels mock et **0 $**, tous ces contrôles sortie 0 ; **132 outils** et **721 binaires** vérifiés. La parité du ROOT courant est confirmée seulement pour le moteur/configurations/binaires. La fidélité globale ROOT reste **fausse** à cause des changements concurrents app/training/tests hors lot ; un contrôle applicatif séparé passe 15/15, sans certifier toute l’application courante. Aucun build ROOT supplémentaire ni rollback de ces changements. [Rapport et empreintes W9](rules-audit/validation-wave9-2026-11-01.json).





### PHB-TEMP-HP





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : hp=current/max, sans réserve temporaire, absorption centrale ou choix de remplacement/non-cumul.


- **Règles concernées** : Temporary Hit Points.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 1 unités rattachées à ce lot.


- **Outils existants à compléter** : `cast_spell`, `use_subclass_feature`.


- **Noms envisagés dans l’audit** : `resolve_temporary_hp`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Intégration courante — W2-TEMP-HP** : Réserve distincte, choix garder/remplacer, absorption après défenses, concentration/dégâts à0PV, durée et repos ; sources de distribution explicites, pas tous les sorts/capacités du catalogue.


- **Avancées vérifiées dans le lot** : Réserve persistée distincte des PV et du maximum, choix explicite garder/remplacer, reçus de source, absorption après résistances/immunités. Les dégâts reçus restent disponibles pour la concentration et les effets ; les PV temporaires ne soignent ni ne réveillent. Les expirations et le repos long respectent la durée de la source.


- **Outils effectifs** : `grant_temporary_hp`, `inspect_temporary_hp`.


- **Fichiers** : [lib/temporary-hp-state.ts](../lib/temporary-hp-state.ts), [mcp-server/temporary-hp.ts](../mcp-server/temporary-hp.ts), [mcp-server/tools/temporary-hp-tools.ts](../mcp-server/tools/temporary-hp-tools.ts), [tests/temporary-hp.test.cjs](../tests/temporary-hp.test.cjs), [docs/temporary-hp.md](../docs/temporary-hp.md).


- **Raccords et tests complémentaires** : [mcp-server/monster-rules.ts](../mcp-server/monster-rules.ts), [mcp-server/hero-rules.ts](../mcp-server/hero-rules.ts), [mcp-server/game-state.ts](../mcp-server/game-state.ts), [lib/dm-tool-state.ts](../lib/dm-tool-state.ts), [tests/dm-priority-wave2.test.cjs](../tests/dm-priority-wave2.test.cjs).


- **Validation W2** : TypeScript réussi (exit 0), régression finale **999/999 tests**, aucun échec ni test ignoré (exit 0, 459 359,6621 ms). Validation sur l’instantané isolé output/mcp-priority-wave2-20261031, qui précède les raccords W3 et les modes de déplacement en cours ; ces derniers ne sont pas attestés par ce résultat. Les 67 tests ciblés, les 12 scénarios de transport et le précédent playtest mock 30/30 avaient aussi passé. Le playtest final a réussi **30/30 tours, 9 scénarios, 97 appels mock et 0 $** (exit 0) ; listTools a confirmé **117 outils** (exit 0). Preuves et empreintes : [rapport W2](rules-audit/validation-wave2-2026-10-31.json).


- **Reste connu** : Les outils consignent une source explicite du MJ ; ils ne créent pas gratuitement un sort ou une capacité. L’intégration de toutes les sources de distribution reste dans les lots de sorts/capacités correspondants.


- **Prochaine étape concrète** : Raccorder les sources particulières de sorts/capacités dans leurs lots dédiés avec leurs vrais coûts et déclencheurs ; le réservoir commun est livré.





### PHB-ADVANCED-COMBAT


<!-- BEGIN:W21-PUBLISHED-PHB-ADVANCED-COMBAT -->


- **Publication W21 — opportunités PHB sur le vol réel** : PHB5675–5681, 4096, 5927–5941 ; deux outils `record_spatial_opportunity_geometry` et `inspect_spatial_opportunities`, domaine `spatial_opportunities`. Points corporels/arme réellement observés, vue, hostilité, réaction et portées propres à chaque arme ; ordre des sources simultanées choisi explicitement. Route IA originale immuable, précontrôle entier avant coût, progression et coût partiels jusqu’à la frontière exactement représentable, réaction explicitement choisie puis reprise avec mêmes d20/rayons/CON et reçus à travers SQL/nouveau processus. La correction gardée `spatial-weapon.ts` complète le pont scoped/held omis du premier paquet, sans nouvelle règle ni refus assoupli. [Guide](native-flight-opportunities.md), [validation W21](rules-audit/validation-wave21-2026-11-04.json).


- **Limites / prochain travail concret** : XY autoritaire entier, Z mesuré et métrique 3D déjà décidée ; une frontière exigeant XY fractionnaire refuse toute la route avant coût, sans arrondi ni waypoint inventé. Swallow reste prioritaire, les corps avalés ne deviennent pas des origines/cibles extérieures. Vol joueur/magique, passagers, nouveaux pouvoirs MM et traits/circonstances décisifs non représentés restent hors périmètre. Étendre une représentation PHB décisive seulement après contrat explicite ; aucun nouveau trait MM n’est lancé.


<!-- END:W21-PUBLISHED-PHB-ADVANCED-COMBAT -->








- **Historique W21 avant publication** : C raccorde les opportunités au vrai trajet 3D W20, source PHB5935–5941 et décision utilisateur « frontières représentables exactement ». Premier noyau géométrique 4/4 ; progression partielle/réactions/SQL publics en cours. Route IA originale conservée, portées propres aux armes, refus des frontières XY intermédiaires avant coût. Aucun nouveau pouvoir/statbloc MM ni fouissement dans ce lot.





- **Publication W20 — vol natif borné** : trajectoires XYZ mesurées, métrique euclidienne choisie par l’utilisateur, vitesse native et budget partagé avec la marche selon PHB5699–5703 ; chute non-hover selon PHB5731–5733. Géométrie réelle d’arme/cible et reçus tenus traversent API/SQL. La marche conserve son coût antérieur. Containment prime sur exposition extérieure et altitude propre. Validation intégrée **2 471/2 471**, mock **30/30** ; [rapport W20](rules-audit/validation-wave20-2026-11-04.json), [guide](native-flight.md). Prochaine tranche concrète : représenter les réactions 3D décisives avant de les autoriser ; vol magique/joueur, passagers et PNJ réactifs restent hors périmètre.





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Coordination — sous-eau W18 publié.


- **Publication W18 finale** : TypeScript/build 0, 2 337/2 337, mock 30/30, 275 outils et concordance complète des binaires/sources ; [rapport](rules-audit/validation-wave18-2026-11-04.json). Le combat sous l'eau décrit ci-dessous est livré dans son périmètre, avec ses limites explicites ; les montures et autres déplacements restent des lots suivants.


- **Tranche du 4 novembre** : `record_underwater_context`, `inspect_underwater_context`, `resolve_start_turn_fire` et raccords de véritables armes/portées, respiration et résistance au feu des corps/objets complètement immergés. Sources PHB6151–6159, observations physiques persistées et vrais jets tenus, aucun souffle/vitesse/eau/extinction créé. Le gel C fusionné sur W17 passe TypeScript/build 0 et 25/25 ; la reprise parent après correction legacy passe 65/65 (avec chevauchement, à ne pas additionner). Guide [underwater-combat.md](underwater-combat.md), modules `lib/underwater-{state,rules}.ts`, `mcp-server/underwater.ts`, `fire-damage-preflight.ts` et outils associés. Les séquences entières refusent leurs contextes manquants avant le premier dé/coût, y compris avant le dé de nombre de coups ; une attaque ancienne sans profil SRD conserve sa référence explicite sans arme canonique inventée. La full W18 r2 est en cours, pas encore publiée. Montures, transport de passagers et déplacement 3D sous l'eau restent hors de cette tranche.


- **Constat de l’audit initial** : Montures contrôlées/indépendantes et restrictions de combat sous-marin absentes.


- **Règles concernées** : Mounted Combat ; Mounting and Dismounting ; Controlling a Mount ; Underwater Combat.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 4 unités rattachées à ce lot.


- **Dépendances** : [PHB-MOVEMENT-MODES](#phb-movement-modes).


- **Prochaine étape concrète** : Étendre seulement une représentation PHB décisive hors de cette tranche exacte après choix explicite, sans nouveau pouvoir MM ni coordonnées inventées.





### PHB-CASTING-TIME





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — incantations longues et application.


- **Constat de l’audit initial** : Longues durées hors combat avancées en bloc ; pas continuation/interruption complète d’incantation longue.


- **Règles concernées** : Casting Time ; Longer Casting Times.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 2 unités rattachées à ce lot.


- **Démarrage W11 du 2 novembre — en cours** : agent des propriétés d'armes réaffecté aux longues incantations et rituels du catalogue actuel. État persistant, travail et temps réels, concentration, interruption sans emplacement perdu, composantes et cibles explicites ; un rituel n'est pas amélioré par un emplacement supérieur. Outils écrits `get_casting`, `continue_casting`, `finish_casting`, `cancel_casting`, démarrage depuis `cast_spell` ou Identify réellement choisi. Première vérification TypeScript privée réussie ; tests et anciennes fixtures en cours de correction, sans livraison revendiquée. Raccords applicatifs et support à suivre après gel.


- **Gel ciblé et raccord applicatif W11** : source finale compilée0 dans `output/mcp-casting-20261102`, 19/19 nouveaux cas, 119/119 régressions sorts/objets/parchemins/réactions et 16/16 niveaux7/nutrition passent dans leurs collectes distinctes. L'application autorise les vrais appels choisis de travail/fin d'une même incantation ; aucune cible, durée ou action MCP n'est fabriquée. Deux tests route+SQL vérifient rituel complet en un message et reprise persistée sur le suivant, puis refus d'une action sans rapport ; ils passent dans la collecte parent65/65, avec TypeScript complet et build0. [Guide incantation](casting-time.md), domaine `casting_time`, consignes et guide personnages mis à jour. Longs parchemins, nouvelles capacités/fiches/sorts PNJ restent ouverts ; aucune histoire legacy reconstruite. Agent immédiatement réaffecté au catalogue standard et aux armes spéciales restantes.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CASTING-COMPONENTS





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — validate_wave3.


- **Constat de l’audit initial** : Matériaux canoniques et composants de certains sorts vérifiés ; mains libres, parole/silence et toutes composantes non universels.


- **Règles concernées** : Components ; Verbal (V) ; Somatic (S) ; Material (M).


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 4 unités rattachées à ce lot.


- **Outils existants à compléter** : `cast_spell`.


- **Prochaine étape concrète** : Représenter les symboles portés ou inscrits sur bouclier et les mains/inventaires individuels PNJ ; corriger explicitement l’identifiant canonique de la perle déjà consigné avant de prétendre ce kit réconcilié.





- **Avancée du 31 octobre — W3** : Raccord livré : inspect_spell_components, set_spell_component_constraint et V/S/M avant coûts/dés/réactions, mains et focus exacts, contrainte factuelle avec source, blocage par armure, Mage Armor lit l’armure réellement portée. [État](../lib/spell-component-state.ts), [résolveur](../mcp-server/spell-components.ts), [outils](../mcp-server/tools/spell-component-tools.ts), [sorts](../mcp-server/hero-spells.ts), [réactions](../mcp-server/tools/hero-tools.ts), [guide](spell-components.md). Douze tests préparés dans [spell-components.test.cjs](../tests/spell-components.test.cjs), TypeScript et syntaxe réussis, collecte ciblée centrale réussie ; régression complète W3 réussie dans son instantané final. Identify exige la perle canonique et une vraie sacoche explicitement choisie pour sa composante non coûteuse ; symboles portés/inscrits sur bouclier, mains/inventaire individuel PNJ et aires dynamiques de Silence restent non projetés. Aucun équipement n’est créé par le contrôle.





- **Règle native MM confirmée** : Introduction « Equipment », ligne 416 : les monstres ont les composantes requises pour leurs sorts du bloc. Cette garantie bornée est appliquée uniquement aux sorts natifs réellement listés ; elle ne crée pas d’objet transférable ni de kit joueur. Les contraintes factuelles restent effectives.





- **Écart ciblé restant** : le kit wizard niveau 7 conserve identify_pearl sans equipmentId identification_pearl, alors que le validateur préexistant exige ce dernier identifiant ; constat consigné pendant le raccord, sans réécriture implicite du kit. Provenance : [guide de composants](spell-components.md), section des limites.





- **Validation W3 finale** : compilation et TypeScript en sortie 0 ; **1 065/1 065 tests**, aucun échec/ignoré/annulé (exit 0, 292 609,8517 ms) ; playtest **30/30 tours, neuf scénarios, 97 appels mock et 0 $** (exit 0, 16 000 ms). listTools confirme **125 outils**, dont les huit nouveaux (exit 0). Les collectes ciblées 110/110, compatibilité 119/119 et dernières fixtures 26/26 ont passé. Attestation de l’instantané final W3 uniquement : [rapport et empreintes](rules-audit/validation-wave3-2026-10-31.json). Les travaux W4 ultérieurs sont exclus.





### PHB-SPELL-AREAS





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Zones de certains sorts ; pas toute volumétrie3D, altitude ou cylindre généralisé.


- **Règles concernées** : Areas of Effect ; Cone ; Cube ; Cylinder ; Line ; Sphere.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 6 unités rattachées à ce lot.


- **Outils existants à compléter** : `cast_spell`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Relais du 2 novembre** : Après gel social standard63/63, agent réaffecté immédiatement. Contrat ciblé cône/cube/cylindre/ligne/sphère à préparer depuis le passagePHB nommé ; vraie origine, volume, couverture et cibles sourcées, sans zone choisie implicitement ni refus global de toute altitude. Coordination avec les surfaces/hauteurs de PHB-VERTICAL-MOVEMENT, nouveau privé distinct ; aucun outil de zone nouveau déclaré livré.





- **Constat ciblé pendant le raccord des zones** : les vraies créatures cachées sur la carte ne doivent pas être exclues d’un volume par le filtre de ciblage direct visible. B a trouvé un défaut supplémentaire : le lecteur persistedConditionTarget n’incluait pas les vrais state.npcs, et la garde afflictionHealingLimit pouvait effacer une variation de PV pourtant calculée pour un PNJ. Helper physique interne carte/statblock et bookkeeping PNJ raccordés, sans découverte, enrôlement ni accès distant ; tests dédiés en cours dans la cohorte zones. Ce constat provient de cette implémentation ciblée, pas d’un nouvel audit.





- **Gel zones B final et relais immédiat** : `output/mcp-wave16-b-spell-areas-20261102`, buildMCP0/Next0, dernière collecte25/25 (15nouveaux+10cover),107autres régressions vertes dans l’exécution précédente ; la façade de test recevant server.tool du saut C a été corrigée et rejouée. Six profils dont vrai cylindre Flame Strike par parchemin de clerc, lectureDD15 et sauvegardesDD17, dégâts feu/radiant dans un seul événement PV/concentration. Corps caché blessé sans découverte/enrôlement ; tests0PV, radiant/Robustesse et arrondis. Nouveaux modules spell-area-geometry/state/physics, vertical-barrier-state/barriers, spell-areas et outils dédiés ; source littérale/licence archivées. Aucune copie aveugle des communs A/C. B réaffecté à la collecte partielle Gear, gel immobile. Parent prépare domaine spell_areas, lectures documentaires, consigne et deux parcours API/SQL dans W15.





- **Raccord applicatif zones vérifié avec W15** : inspect_spell_area et inspect_vertical_barriers classés en lectures confidentielles ; déclarations de géométrie auxiliaires sans mouvement/découverte, lancements par les voies existantes. Domaine spell_areas et consigne explicite sur origines/orientations/supports, corps cachés et dégâts simultanés. Deux vraies API/SQL Colonne de flamme (succès et lecture ratée) passent parmi79/79ciblés avec TypeScript/build0. Origine et sélection area sont transmises sans réécriture ; parchemin consommé une fois, emplacements/PV joueur/position préservés, dé suivant intact. Suite complète W15 en cours sur698entrées figées ; aucune attestation globale des zones anticipée.





- **Publication W15r3 du 2 novembre** :2012/2012tests, TypeScript/build0, mock30/30 (neuf scénarios,71appels,0$, objectifsOK),222outils réellement exposés. Les700entrées figées et1142binaires publiés concordent ; [rapport permanent](rules-audit/validation-wave15-2026-11-02.json). Cette tranche sort du travail actif dans son périmètre livré ; les limites de transport vertical, géométrie réellement inconnue et les prochains contacts Gear restent ouverts dans leurs propres lots. Aucun travail Root postérieur n’est déclaré validé par transitivité.





### PHB-SPELLS-0-4





- **Dépendance découverte pendant W35 — Fracassement, recette XGE différée.** PHB 2014, lignes12502–12512 : les corps inorganiques ont le désavantage au CON et les objets non magiques non portés dans la zone prennent aussi les dégâts. La revue ciblée de `planSpellArea`/`spellAreaCreatures` et `resolveDamageSpell` constate seulement les corps ordinaires, sans résolution des objets ni contexte de désavantage inorganique et sans garde préalable pour ces branches. Ne pas ouvrir la recette de parchemin à partir du seul profil de catalogue. Cette correction reste une future tranche PHB distincte ; aucune extension PHB n’est réalisée dans W35.





<!-- BEGIN:W25-PUBLISHED-PHB-SPELLS-0-4 -->


- **W25 — Alarme mentale livrée partiellement.** PHB 2014, lignes 7737–7748. Porte existante ou cube de 5 pieds au sol, choix explicite des exemptions, vraie incantation ou rituel, huit heures après résolution. Le moteur produit les pings du lanceur en portée à partir des trajets et contacts représentés. Le signal peut réveiller un dormeur naturel. Le registre du signal ne contient pas l’identité de l’intrus. Le cube est utilisable par le magicien Fey déjà publié. La preuve de porte utilise une fixture de connaissance du sort. [Guide Alarme](alarm-spell.md).


- **Suite concrète.** Représenter les autres volumes et contacts d’Alarme, puis le signal audible avec sa propagation. Reprendre les autres sorts du lot avec leurs sources propres.


<!-- END:W25-PUBLISHED-PHB-SPELLS-0-4 -->





<!-- BEGIN:W24-PUBLISHED-PHB-SPELLS-0-4 -->


- **Publication W24 — périmètre partiel** : Lumière seulement : objet de scène existant mesuré, explicitement touché, aucune dimension supérieure à10pieds ;20pieds de lumière vive puis20faible pendant1heure, couleur choisie et source attachée au même objet physique. Couverture opaque complète bloque les rayons sans renouveler la durée ; manipulation avec coût MJ réel, fin volontaire avec action, nouveau lancer termine la génération précédente. Ready conserve sa vraie préparation et ne réactive pas une ancienne source après un lancer plus récent, y compris SQL/redémarrage. Les mêmes sources alimentent éclairage, vision, Perception et attaques. Observations XGE originales sans identité/nom/cible cachée révélés rétrospectivement. Anciens effets sans objet conservés comme histoire, sans lumière gratuite au lanceur ni migration d’objet. Source : PHB2014, Lumière, rules/books/phb-2014.md11009–11020 ; règles de composantes et éclairage déjà publiées. Décision utilisateur du5novembre2026 : objets de scène mesurés d’abord ; les coûts de manipulation restent des choix explicites du MJ, pas un tarif RAW inventé.. [Validation commune W24](rules-audit/validation-wave24-2026-11-05.json).


- **Limites / prochain travail concret** : Objets d’inventaire et objets hostiles tenus/portés avec sauvegardeDEX reportés, refus avant coûts ; aucun objet, possession ou jet fictif. Géométrie actuelle au sol, toucher et projection lumineuse représentés seulement ; hauteur/intérieur/inconnue et fragments d’objet détruit restent sans origine optique inventée. Aucun producteur natif, baguette ou parchemin de tour de magie ajouté ; le catalogue existant niveaux1–5 refuse Light. Son ancien message mentionnant1–4 reste une divergence de formulation ciblée, pas une extension du catalogue. Les autres sorts du lot PHB-SPELLS-0-4 et les limites préexistantes de perception sans sélection explicite ne sont pas déclarés achevés. Reprendre le prochain sous-lot PHB-SPELLS-0-4 décrit au suivi ; étendre Lumière aux objets d’inventaire et à la possession hostile seulement avec représentation physique, coûts et sauvegarde réels.


- **Preuves et recouvrement** : [light-handoff-final.md](../output/mcp-phb-light-20261105/light-handoff-final.md), [light-source-manifest.json](../output/mcp-phb-light-20261105/light-source-manifest.json), [light-evidence-index.json](../output/mcp-phb-light-20261105/light-evidence-index.json), [light-spell.md](../output/mcp-phb-light-20261105/docs/light-spell.md), [w24-light-integrated-source-proof.json](../output/mcp-wave24-integrated-20261105/w24-light-integrated-source-proof.json), [w24-light-training-regional-review.json](../output/mcp-wave24-integrated-20261105/w24-light-training-regional-review.json). Nouveaux privés, capture propre au lot : 19/19 ; Ciblés/croisés communs finaux, recouvrants : 151/151. Les validations privées et croisées sont propres à leur capture et recouvrent la validation commune ; aucun cumul artificiel avec la full.


<!-- END:W24-PUBLISHED-PHB-SPELLS-0-4 -->


<!-- BEGIN:W24-DEPENDENCY-HISTORY-PHB-SPELLS-0-4 -->


Historique de préparation, décision ou dépendance W24 : ce contenu conserve exactement son étape et ses limites d’origine, antérieures à la publication vérifiée ci-dessus. Ses formulations « en cours », « non livré » ou « reste à faire » sont historiques.





- **Limite ponctuelle W24 — non livrée** : `supportedScrollSpell` (`lib/srd/spell-scrolls.ts:12–17`) accepte les niveaux1–5, exclut les tours de magie. La vraie préparation de parchemin Light refuse avant coût ; aucune baguette ni incantation native Light publiée ne justifie une preuve positive. W24 conserve cette limite et n’étend pas ces catalogues pour sa fixture.


<!-- END:W24-DEPENDENCY-HISTORY-PHB-SPELLS-0-4 -->





<!-- BEGIN:W24-DECISION-HISTORY-PHB-SPELLS-0-4 -->


Historique de préparation, décision ou dépendance W24 : ce contenu conserve exactement son étape et ses limites d’origine, antérieures à la publication vérifiée ci-dessus. Ses formulations « en cours », « non livré » ou « reste à faire » sont historiques.





- **Décision W24 — implémentation en cours, non livrée** : Utilisateur : première tranche Lumière sur objets de scène existants réellement mesurés, éclairage suivant leur déplacement. Inventaire et possession hostile restent reportés et refusés avant coût ; aucune fausse sauvegarde ou cible implicite.


<!-- END:W24-DECISION-HISTORY-PHB-SPELLS-0-4 -->





<!-- BEGIN:W24-PREPARATION-HISTORY-PHB-SPELLS-0-4 -->


Historique de préparation, décision ou dépendance W24 : ce contenu conserve exactement son étape et ses limites d’origine, antérieures à la publication vérifiée ci-dessus. Ses formulations « en cours », « non livré » ou « reste à faire » sont historiques.





- **Préparation W24 — non livrée** : Contrat W24 en préparation — Lumière : PHB2014 local11009–11020 et éclairage/composantes nécessaires. Objet touché explicitement choisi, dimensions, illumination attachée et fin du sort ; ne plus utiliser son repli implicite vers le lanceur. Les autres sorts du lot restent hors périmètre.


<!-- END:W24-PREPARATION-HISTORY-PHB-SPELLS-0-4 -->





<!-- BEGIN:W23-TARGETED-LIGHT-LIMIT -->


- **Découverte ponctuelle W23 — hors périmètre livré** : vérification du producteur de perception : `mcp-server/hero-spells.ts:146–147` conserve `Light` parmi les replis de cible vers le lanceur. Le PHB2014 (`rules/books/phb-2014.md:11009–11020`) demande un objet touché explicitement choisi, avec ses dimensions et son éclairage. Une preuve de composantes Light ne certifie donc ni ses cibles ni ses effets ; le croisement W23 utilise Mage Armor avec `targetId:player` explicite. Compléter cette mécanique Light dans ce lot reste à faire, sans nouvel audit global.


<!-- END:W23-TARGETED-LIGHT-LIMIT -->





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Effet réellement enregistré ; sous-ensemble de niveaux/cibles/composantes du moteur. Limité aux profils et choix exacts supportés.


- **Règles concernées** : Acid Splash ; Aid ; Alarm ; Alter Self ; Animal Friendship ; Animal Messenger ; Animate Dead ; Arcane Eye ; Arcane Lock ; Armor of Agathys ; Arms of Hadar ; Augury ; Aura of Life ; Aura of Purity ; Aura of Vitality ; Bane ; Banishment ; Barkskin ; Beacon of Hope ; Beast Sense ; Bestow Curse ; Blade Ward ; Bless ; Blight ; et 209 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 233 unités rattachées à ce lot.


- **Outils existants à compléter** : `cast_spell`, `use_narrative_spell_effect`, `use_spell_scroll`.


- **Travail restant** : Reprendre le prochain sous-lot PHB-SPELLS-0-4 décrit au suivi ; étendre Lumière aux objets d’inventaire et à la possession hostile seulement avec représentation physique, coûts et sauvegarde réels.





### PHB-SPELLS-5-9





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Fiche Animal Shapes consultable ; aucun SpellSpec/résolveur pour animal-shapes. Importer source autorisée si nécessaire puis ajouter effet/coûts/continuations/tests.


- **Règles concernées** : Animal Shapes ; Animate Objects ; Antilife Shell ; Antimagic Field ; Antipathy/Sympathy ; Arcane Gate ; Astral Projection ; Awaken ; Banishing Smite ; Bigby's Hand ; Blade Barrier ; Chain Lightning ; Circle of Death ; Circle of Power ; Clone ; Cloudkill ; Commune ; Commune with Nature ; Cone of Cold ; Conjure Celestial ; Conjure Elemental ; Conjure Fey ; Conjure Volley ; Contact Other Plane ; et 104 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 128 unités rattachées à ce lot.


- **Outils existants à compléter** : `cast_spell`, `use_narrative_spell_effect`, `use_spell_scroll`.


- **Dépendances** : [PHB-PROGRESSION](#phb-progression).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### PHB-CONDITION-SEMANTICS





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — conditions livrées W5–W7.


- **Constat de l’audit initial** : Condition typée et interactions principales ; chaque cause/durée/fin doit avoir une résolution effective.


- **Règles concernées** : Conditions ; Blinded ; Charmed ; Deafened ; Frightened ; Grappled ; Incapacitated ; Invisible ; Paralyzed ; Petrified ; Poisoned ; Prone ; Restrained ; Stunned ; Unconscious.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 15 unités rattachées à ce lot.


- **Révalidation ciblée du 31 octobre — conséquences manquantes** : l'entrée dans unconscious et les passages à 0 PV ne déclenchent actuellement ni prone ni chute des objets réellement tenus ; cela peut préserver les mains et éviter le coût ultérieur du lever. Sous petrified, les dégâts/immunités sont partiellement résolus, mais les poisons/maladies déjà présents ne sont pas suspendus par le système d'afflictions. Les suspendre n'est pas les guérir. Ces constats statiques et leurs sources exactes figurent dans la [revalidation PHB](rules-audit/revalidation-phb-2026-10-31.md#phb-condition-semantics--contrôle-des-conséquences). Prochaine tranche : transitions centrales idempotentes, conservation des objets portés, reprise des afflictions après dépétrification et round-trips.














- **Livraison W5 du 31 octobre** : L’entrée réelle dans unconscious applique prone et dépose les objets des mains du joueur, conserve le bouclier et ne rééquipe ni ne relève au réveil. La pétrification suspend les 15 afflictions structurées et leurs effets liés ; reprise atomique avec identifiants préservés et échéance réelle du dernier fournisseur, même après saut de temps. Historique de pause strict et refus des anciens ancrages inconnus. Voir [unconscious-transition.md](unconscious-transition.md) et [petrified-afflictions.md](petrified-afflictions.md).


- **Outils/raccords W5 validés** : apply_condition, update_hp, cast_spell et transitions centrales.


- **Preuve finale W5** : 1 201/1 201 tests, TypeScript complet et 30/30 tours mock passent ; [rapport borné et empreintes](rules-audit/validation-wave5-2026-10-31.json).











- **Livraison W6 du 1er novembre** : Les effets sprite-poison/sprite-sleep d’une cible active sous pierre se suspendent/reprennent avec identifiants, symptômes et délais réels conservés. Les nouveaux sommeils possèdent un lien spritePoisonId réel ; une cure autorisée choisit l’afflictionId exact même suspendu, sans guérir d’autres sources ni faire réapparaître le poison à la sortie. Dégâts et réveil manuel ne contournent pas la pause. Les 15 nouveaux cas et 56 régressions passent, puis la suite intégrée W6 confirme le raccord avec les récupérations KO. Voir [petrified-afflictions.md](petrified-afflictions.md).


- **Outils/raccords W6 validés** : apply_condition, resolve_monster_action, wake_sleeping_creature, cast_spell(afflictionId) ; mcp-server/petrified-sprite-effects.ts, monster-rules.ts et hooks GS/horloges.


- **Reste / prochaine étape** : Inventaires physiques des mains PNJ. Les actions publiques de cure, exposition, attaque ou déplacement conservent leur ciblage actif ; une archive ne devient pas une cible à portée. Les événements de poison demandant une sauvegarde restent explicites et soumis à leur éligibilité existante ; aucune sauvegarde de poison hors carte n’est fabriquée. L’exception de jet de mort PNJ archivé suit seulement son propre événement dû. Un historique de pause ancien inconnu ou un appariement ambigu conserve son refus sans ancrage rétroactif. Les autres conditions non couvertes par ces raccords restent soumises aux limites consignées dans le lot.


- **Preuve finale W6** : 73/73 ciblés puis **1 274/1 274 tests**, TypeScript complet, playtest **30/30 tours**, neuf scénarios, 97 appels mock et 0 $, tous sortie 0 ; **131 outils** vérifiés. [Rapport et empreintes W6](rules-audit/validation-wave6-2026-11-01.json).





- **Livraison W7 du 1er novembre** : La fin du dernier fournisseur réel de pétrification et la reprise des afflictions/symptômes sont résolues également pour un acteur retiré ou sauvegardé sur un autre étage de la même partie. Le résolveur interne retrouve la référence persistée réelle, ignore le cache périmé de la carte courante et conserve les identifiants, durées restantes et échéances de source. Les fournisseurs concurrents maintiennent la condition jusqu’à leur propre fin ; l’horloge relit ses frontières après chaque événement afin de traiter les effets repris dans le même saut. La fin de pierre et le retrait des symptômes ne modifient ni PV, vie, KO ni compteurs de sauvegarde. Une inconscience due aux 0 PV demeure ; un symptôme réellement rétabli peut appliquer prone sans inventaire PNJ, rééquipement ou activation. Un lanceur vivant archivé reste une source réelle de concentration, sans portée spatiale inventée. Voir [petrified-afflictions.md](petrified-afflictions.md).


- **Outils/raccords W7** : Expirations des fournisseurs héroïques/de monstres et horloges existantes ; `mcp-server/persisted-conditions.ts`, `removeHeroEffect`/`endEffect`, reprise des afflictions structurées et des effets sprite. Aucun nouvel outil de ciblage distant. Les vrais passages d’étage, retraites, caches courants, grands sauts, fournisseurs concurrents et croisements PNJ à 0 PV sont couverts par les tests dédiés et combinés.


- **Preuve finale W7 r2** : **83/83 ciblés**, **1 331/1 331 tests**, compilation et TypeScript complets, **30/30 tours mock**, neuf scénarios, 97 appels mock et **0 $**, tous sortie 0 ; **132 outils** et fidélité des sources/configurations/tests confirmés. Le moteur partagé correspond aux **721 binaires** privés validés. [Rapport et empreintes W7](rules-audit/validation-wave7-2026-11-01.json). Les preuves préliminaires restent distinctes.





### PHB-EXHAUSTION





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Token exhaustion seulement : pas compteur0–6, effets cumulés, récupération nourriture/eau ni mort à6.


- **Règles concernées** : Exhaustion.


- **Archive détaillée** : [phb-2014](rules-audit/phb-2014.md), [unités JSON](rules-audit/phb-2014.json) ; 1 unités rattachées à ce lot.


- **Outils existants à compléter** : `take_rest`, `roll_ability_check`, `resolve_saving_throw`, `move_token`.


- **Noms envisagés dans l’audit** : `inspect_survival`, `resolve_exhaustion_event`. Ce sont des propositions ; les outils effectivement retenus ci-dessous priment.


- **Intégration courante — W1-EXHAUSTION** : Niveaux0–6, effets réels, maxHP/Aid/Drain, mort/résurrection, reçus idempotents ; récupération alimentaire apportée par W4, refusée sans apports vérifiés.


- **Outils effectifs** : `inspect_exhaustion`, `add_exhaustion`, `remove_exhaustion`.


- **Fichiers** : [lib/exhaustion.ts](../lib/exhaustion.ts), [lib/exhaustion-state.ts](../lib/exhaustion-state.ts), [mcp-server/exhaustion.ts](../mcp-server/exhaustion.ts), [mcp-server/tools/exhaustion-tools.ts](../mcp-server/tools/exhaustion-tools.ts), [tests/exhaustion.test.cjs](../tests/exhaustion.test.cjs).


- **Validation** : TypeScript OK ; 942/942 tests ; 30/30 tours mock ; 42 fichiers identiques à la copie validée.


- **Complément validé W4** : récupération d’un niveau au vrai repos long selon les apports quantifiés du personnage ; sans suivi ou sans apports suffisants, elle reste bloquée. TypeScript, 1 094/1 094 tests et 30/30 tours mock passent dans l’instantané W4 ; voir PHB-SURVIVAL et son rapport.


- **Reste connu** : besoins non standard et nutrition PNJ non projetés ; dangers toujours événements explicites du MJ. L’ancien booléen d’épuisement reste non résolu ; Death Ward au niveau 6 exige arbitrage. L’expiration d’Aid tient compte des acteurs actifs/archivés/retirés ; les autres effets temporisés hors carte ne sont pas généralisés.





### DMG-RENOWN


<!-- BEGIN:W21-PUBLISHED-DMG-RENOWN -->


- **Publication W21 — première comptabilité Renown DMG optionnelle** : DMG694–737, adoption explicite, organisations/appartenances déjà réellement établies, départ0 sans rang ni histoire chiffrée reconstruite. Six outils `adopt_renown`, `record_renown_organization`, `award_renown`, `lose_renown`, `set_renown_rank`, `inspect_renown`, domaine `renown`. Accomplissement réellement terminé et occurrence source originale explicitement choisis : +1 intérêts, +2 mission assignée/bénéfice direct ; offense grave avec perte choisie et plancher0 ; promotion/retrait de titre distincts et explicites, vrais seuils/niveau/prérequis. Scores/rangs dérivés du ledger, provenance/commandes/séquence conservées à SQL ; même occurrence par organisation non recomptée sous un nouveau nonce, même appartenance non dupliquée par alias. Aucun rang automatique, attitude, avantage, argent, ressource, temps ou action joueur accordés. [Guide](renown.md), [validation W21](rules-audit/validation-wave21-2026-11-04.json).


- **Limites / prochain travail concret** : membres déjà établis et comptabilité hors combat sont les bornes de cette procédure, pas des exigences RAW universelles ; l’exemple d’adhésion après1point reste distinct. Piety, gains de downtime, marques de prestige et bénéfices concrets restent à implémenter séparément. Une décision administrative Renown ne périme pas le checkpoint physique du même repos ; vrai changement corporel exige toujours son observation (croisement durable SQL). Suite : choisir l’un de ces sous-périmètres DMG/Xanathar avant activation, sans promotion ou bénéfice implicite.


<!-- END:W21-PUBLISHED-DMG-RENOWN -->








- **Historique W21 avant publication** : contrat DMG694–737 accepté pour règle optionnelle à adoption explicite et appartenances déjà établies. Nouveau privé output/mcp-dmg-renown-20261104 depuis le gel Trade Goods, sans le modifier. Points dérivés du registre, fait/occurrence non recompté par nouveau nonce, commandes et rangs protégés dès premier SQL ; seuils/niveau/prérequis et promotion/retrait restent explicitement choisis. Piety, gains de downtime, marques de prestige et avantages mécaniques sont hors de cette tranche. L’absence de suivi avant adhésion est une limite d’outil, pas une exigence générale du DMG.





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Renown ; Gaining Renown ; Benefits of Renown ; Examples of Faction Ranks ; Losing Renown ; Piety ; Marks of Prestige ; Letters of Recommendation ; Medals ; Parcels of Land ; Special Favors ; Special Rights ; Strongholds ; Titles.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 14 unités rattachées à ce lot.


- **Prochaine étape concrète** : Sélectionner séparément Piety, downtime, marque de prestige ou bénéfice concret avec ses véritables prérequis/coûts ; la comptabilité membre-only ci-dessus est livrée.





### DMG-RESURRECTION





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Bringing Back the Dead.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 1 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DMG-CALENDAR





<!-- BEGIN:W22-PUBLISHED-DMG-CALENDAR -->


- **Publication W22 — périmètre partiel** : Trois outils configure_campaign_calendar, record_calendar_reference, inspect_campaign_calendar et domaine campaign_calendar. Définition MJ explicite custom fixe ou Harptos opt-in, date actuelle exacte et phase Shieldmeet fournie ; ancre immuable sur le vrai temps moteur. Projection pure et références datées/périodiques sans conséquence automatique. Commandes/provenance dès premier SQL, ordre JSONB accepté, modifications isolées et rejeux par nouveau nonce refusés. Administration conserve le checkpoint d’un vrai repos, les ancres nutrition/sommeil et les calendarDay de travail déjà choisis. Le croisement commun réellement exécuté avec une chute native active conserve tout le curseur et son échéance à la lecture, puis laisse la vraie frontière choisie progresser ; aucune cadence calendaire ou horloge de500pieds/6secondes ajoutée. Source : DMG1122–1180, Tracking Time/Basics/cycles/observances/Fantastic Events et table Harptos complète ; empreinte fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1. [Validation commune W22](rules-audit/validation-wave22-2026-11-04.json).


- **Limites / prochain travail concret** : Jour d’affichage de86400secondes explicitement adopté : convention du moteur, pas rotation imposée par DMG à tous les mondes. Aucun calendrier/date d’aventure ou phase absolue implicitement fournis. Configuration unique immuable ; custom années fixes,1–32segments de1–1000jours ; années1à1000000 ;128références, période entière optionnelle1à1000000jours. Projection hors bornes sans overflow/reset. Pas de calendrier grégorien variable, astronomie, effet/événement automatique, temps/repos/crédit/dette/nutrition/sommeil/recharge ou ressource donnés. Bookkeeping hors combat = limite de cette tranche, pas nouvelle règle RAW universelle. Choisir une éventuelle extension calendaire ou procédure d’événement dans un lot distinct explicitement demandé ; ne pas élargir le calendrier par narration.


- **Preuves et recouvrement** : `output/mcp-dmg-calendar-20261104/calendar-handoff-20261104.md`, `output/mcp-dmg-calendar-20261104/calendar-final-validation.json`, `output/mcp-wave22-integrated-20261104/w22-targeted-final.log`. calendarPrivate : 23/23; calendarIntegrated : 13/13; finalTargeted : 61/61. Les cohortes propres au lot sont incluses ou recouvrent la validation commune ; aucun cumul artificiel avec la full.


<!-- END:W22-PUBLISHED-DMG-CALENDAR -->


- **Historique de validation avant publication W22** : gel privé calendrier 16 fichiers (8 nouveaux, 8 régionaux), source DMG1122–1180 et parseur global inchangé. Types MCP/Next et build MCP privés en sortie0, 23/23 ciblés dont13 nouveaux, mock30/30 neuf scénarios/71appels/0USD. Le parent confirme exhaustivement les16 vrais changements, applique le paquet avec sauvegarde, puis obtient types MCP/Next0, buildMCP0 et13/13 tests propres sur W22 (44 557,5225ms). Les cohortes se recouvrent. Vrai repos/nutrition/sommeil et nouvelle-process SQL couverts sans rebase, borne de dates sans overflow. Handoff et empreintes : `output/mcp-dmg-calendar-20261104/calendar-handoff-20261104.md`. Les autres couches W22, full/mock et publication restent à fermer ; W21 demeure publiée.





- **Historique de préparation W22, antérieur à la publication** : B prépare dans `output/mcp-dmg-calendar-20261104` DMG1122–1183 : adoption et date d’ancrage explicites, projection depuis le temps moteur existant, observances/cycles référentiels ; aucun saut d’horloge, calendrier ou événement mécanique déduit implicitement. Les règles Harptos et les choix de phase restent distincts des conventions produit.





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Tracking Time ; The Basics ; Physical Cycles ; Religious Observances ; Civic Observances ; Fantastic Events ; The Calendar of Harptos.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 7 unités rattachées à ce lot.


- **Travail restant** : Choisir une éventuelle extension calendaire ou procédure d’événement dans un lot distinct explicitement demandé ; ne pas élargir le calendrier par narration.





### CHARACTER-PROGRESSION





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Starting at Higher Level ; Starting Equipment ; Flavors of Fantasy.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 3 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DMG-PLANAR-TRAVEL





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Planar Travel ; Planar Portals ; Spells ; Plane Shift ; Gate.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 5 unités rattachées à ce lot.


- **Dépendances** : [PHB-SPELL-CATALOG](#phb-spell-catalog) ; [MOVEMENT-3D](#movement-3d).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DMG-PLANAR-HAZARDS





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Astral Plane ; Astral Projection ; Color Pools ; Astral Color Pools ; Psychic Wind ; Psychic Wind Effects ; Astral Plane Encounters ; Ethereal Plane ; Border Ethereal ; Deep Ethereal ; Ethereal Curtains ; Ether Cyclones ; Ethereal Plane Encounters.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 14 unités rattachées à ce lot.


- **Dépendances** : [DMG-PLANAR-TRAVEL](#dmg-planar-travel) ; [DISEASE-MADNESS](#disease-madness).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DMG-ADVENTURE-PROCEDURE





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Location Based Adventures ; 1. Identify the Party's Goals ; Dungeon Goals ; Wilderness Goals ; Other Goals.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 5 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### ENCOUNTER-BUDGET





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — validation W5.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Creating Encounters ; Character Objectives ; Sample Objectives ; Creating a Combat Encounter ; Combat Encounter Difficulty ; XP Thresholds by Character Level ; Challenge Rating ; Evaluating Encounter Difficulty ; Encounter Multipliers ; Party Size ; Multipart Encounters ; Building Encounters on a Budget ; The Adventuring Day ; Adventuring Day XP ; Modifying Encounter Difficulty.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 15 unités rattachées à ce lot.


- **Dépendances** : [MONSTER-CATALOG](#monster-catalog).











- **Livraison W5 du 31 octobre** : Outil lecture seule enregistré et exposé à l’agent : niveau réel du seul personnage, groupes planifiés ou hostiles actifs, XP source, contribution explicite au multiplicateur et ajustement petite partie jusqu’à ×5. Seuils et référence journalière sont sourcés ; aucun acteur créé ni XP attribué. Voir [encounter-budget.md](encounter-budget.md).


- **Outils/raccords W5 validés** : assess_encounter_budget.


- **Reste / prochaine étape** : Le suivi de journée et les vagues ne sont pas un registre actif ; ressources, terrain, tactiques et compagnons ne sont pas chiffrés. Le calcul ne garantit pas un affrontement équitable en solo.


- **Preuve finale W5** : 1 201/1 201 tests, TypeScript complet et 30/30 tours mock passent ; [rapport borné et empreintes](rules-audit/validation-wave5-2026-10-31.json).





### ENCOUNTER-RANDOM





<!-- BEGIN:W33-PUBLISHED-ENCOUNTER-RANDOM -->


- **W33 — Cadence générale, tranche préparée.** DMG 3157–3168. Deux outils de configuration/inspection lient carte actuelle qualifiée, cadence 1 h ou 4–8 h, première frontière future et `check_random_encounter` explicite. Aucun dé, occurrence, acteur ou scène automatique ; le d20 existant 18+ n’est pas une nouvelle livraison. [Guide](random-encounters.md), guide multi-cartes maintenu.


- **Preuves privées et limite.** 8 scénarios publics, cohorte 72 verte ; arrêt avant combat/carte, contrôle déjà dû d’abord. Pas de rattrapage, pause/reprise, bord 6 s ou cadence jour/repos. [Rapport commun W33 à produire](rules-audit/validation-wave33-2026-11-07.json).


- **Suite concrète.** Représenter une fréquence jour/repos ou le raccord combat dans une tranche choisie, sans occurrence ou déplacement inféré.


<!-- END:W33-PUBLISHED-ENCOUNTER-RANDOM -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Random Encounters ; Triggering Random Encounters ; Checking for Random Encounters ; Creating Random Encounter Tables ; Assemble Your Encounters ; Probabilities ; Sylvan Forest Encounters ; Random Encounter Challenge.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 8 unités rattachées à ce lot.


- **Dépendances** : [ENCOUNTER-BUDGET](#encounter-budget) ; [TRAVEL-SURVIVAL](#travel-survival).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Tranche commencée le 2 novembre — source ponctuelle DMG3131–3220** : le texte de Checking for Random Encounters, Probabilities et la table Sylvan Forest est consulté sans nouvel audit. Défaut concret : readRollableTable acceptait seulement un dé simple et refusait le vrai d12+d8 de cette table. Nouveau module `mcp-server/source-table-dice.ts`, raccords rules-library/rules-tools et trois tests ciblés écrits : somme de vrais dés, plage2–20, combinaisons exactes1/96 aux extrêmes et8/96 pour10, refus avant dés, aucun acteur/combat/coût/temps créé. Les tableaux simples gardent leur procédure, sommes bornées à quatre dés sources sans expressions imbriquées. Validation dans `output/mcp-random-encounters-20261102` en cours ; ce code est exclu de W15 déjà figée. [Guide et étapes restantes](random-encounters.md).


- **Prochain travail concret** : contrôles d20 explicites avec rencontre18+, ou décision MJ sans dé, contexte/fréquence de campagne non activés implicitement, reçus persistés de contrôles/tirages et nouveau tirage explicitement motivé si contexte incompatible. Les créatures/pouvoirs manquants restent documentaires, la mise en scène et le combat ne sont jamais fabriqués par le serveur. Le tirage composé seul ne clôt pas ce lot.





- **Tirage composé validé, lot toujours en cours** : `output/mcp-random-encounters-20261102`, TypeScript/build0,21/21tables/trésor/bibliothèque, puis3/3après ajout du domaine random_encounters ; les reprises ne s’additionnent pas. Les vrais d12+d8 de la forêt donnent2/20aux extrêmes et10au centre avec1/96ou8/96combinaisons, sans changer l’état et sans sous-tirage implicite. Mock sortie0 :30/30tours, neuf scénarios,71appels,0$, objectifsOK (23445ms). [Rapport borné tables composées](rules-audit/validation-random-tables-2026-11-02.json). Ce code est prêt pour une prochaine cohorte, exclu de W15 figée ; les contrôles/tirages persistés ci-dessus restent à réaliser.





- **Contrôles/tirages persistés codés et ciblés verts** : nouveau privé `output/mcp-random-encounter-ledger-20261102` depuis W15r3 validée, sans Gear actif ni préparation de danger. Nouveaux outils check_random_encounter, draw_random_encounter, inspect_random_encounters ; état partagé random-encounter-state et hooks locaux Zod/GS/index/include. D20non modifié18+ ou décision MJ sans dé, contexte réel de partie/carte/salle ; chaque reprise conserve méthode/dés, nouveau tirage motivé lié au dernier même-check, histoire paginée, refus scène changée/donnée future/chaîne de tirages corrompue. Aucun acteur, intervalle, ressource, découverte ou combat créé. TypeScript/build0 et **28/28 ciblés** (28428,8967ms) après correction réelle de reprise : le DTO interne ne transmet pas adventureId, donc le validateur compare désormais à l’ADVENTURE_ID autoritaire du processus, avec refus des enregistrements étrangers, sans assouplir l’invariant. Un ancien test de support a été mis à jour pour les nouveaux contrôles réellement présents ; première collecte24/27, sa portée n’est pas étendue. Deux vrais parcours API/SQL (SRD/legacy) sont en cours ; contrôle mock et intégration globale restent à faire.





- **Complément ENCOUNTER-RANDOM du 2 novembre, validation bornée terminée** : le privé `output/mcp-random-encounter-ledger-20261102` passe aussi2/2API/SQL (9957,0931ms),5/5frontièresIA/vocabulaire (15542,8977ms), puis mock30/30, neuf scénarios,71appels,0$, objectifsOK (29760ms). Les appels choisis restent identiques, l'inspection ne débite pas l'action du personnage et un vrai jet ultérieur est encore possible ; une deuxième action sans rapport est refusée avant dé. Les contrôles/tirages traversent SQL sur personnage SRD et legacy sans créer de héros. [Guide actualisé](random-encounters.md) et [rapport borné](rules-audit/validation-random-encounters-2026-11-02.json). Les tables de campagne et la mise en scène explicite restent à poursuivre ; aucune publication du prochain moteur partagé n'est encore revendiquée.





- **Tables propres à la campagne — tranche suivante en cours** : nouveaux modules random-encounter-table-state et random-encounter-tables, outils create_random_encounter_table/inspect_random_encounter_tables. Identités campaign: immuables, thème et portée aventure/carte réelle choisis, dés structurés et plages complètes sans chevauchement ; probabilités exactes reprises dans draw_random_encounter. Aucun contenu rédigé par le MJ présenté comme texte du livre, aucun acteur/indice/récompense/combat créé. Source ponctuelle DMG3167–3184 Creating Random Encounter Tables/Assemble Your Encounters. Nouveau privé output/mcp-campaign-encounter-tables-20261102 depuis les sources W16 figées, hors du gel W16 ; typecheck MCP déjà vert, compilation et six nouveaux tests publics en cours. Aucun nouvel audit.





- **Tables de campagne, validation bornée terminée** : output/mcp-campaign-encounter-tables-20261102, TypeScript/build0,18/18initiaux puis26/26finaux (70102,9971ms), dont7nouveaux cas moteur et4API/SQL livre/campagne×SRD/legacy. Mock30/30, neuf scénarios,71appels,0$, objectifsOK (49072ms). Inventaire froid240outils uniques, les2nouveaux outils présents et2domaines lus réellement. Plages/dés, immutabilité, vraie carte, origine campaign_authored, SQL/reprises et inspection paginée sont vérifiés ; les noms hérités ne deviennent pas des tables. [Rapport borné](rules-audit/validation-campaign-encounter-tables-2026-11-02.json), [guide](random-encounters.md). Ce sous-lot est prêt pour une prochaine cohorte, explicitement exclu de W16 live. La mise en scène/les quantités restent des appels choisis par l’IA avec les outils réels, sans parseur de texte ni capacité de créature inventée.





### NPC-COMPANIONS





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Creating Nonplayer Characters ; Designing NPCs ; Quick NPCs ; Detailed NPCs ; Occupation and History ; Appearance ; NPC Appearance ; Abilities ; NPC Abilities ; NPC Low Abilities ; Talent ; NPC Talents ; Mannerism ; NPC Mannerisms ; Interactions with Others ; NPC Interaction Traits ; Useful Knowledge ; Ideal ; Good Ideals ; Evil Ideals ; Lawful Ideals ; Chaotic Ideals ; Neutral Ideals ; Other Ideals ; et 18 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 42 unités rattachées à ce lot.


- **Dépendances** : [MONSTER-CATALOG](#monster-catalog) ; [DOWNTIME-ECONOMY](#downtime-economy).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Réparation ciblée du socle de création, pas recrutement de compagnon complet** : le test Gear aidant a prouvé que create_npc matérialisait seulement kind/PV au lieu du bloc SRD choisi, empêchant une participation physique/combat. Nouveau createNpcState et hydrateNpcStatBlocks pour les sources improvisées conservées ;3tests publics/SQL verts W17 : acteur capable aidant joueur0PV, ancienne fiche>0PV restaurée sans soin/révélation/activation, ancienne0PV sans témoin conservée inconnue. Accompagnement, contrôle et partage de rôles restent les travaux propres de ce lot ; migration par observation réelle des anciens0PV non structurés reste à faire, provenance de ce constat = ces reproductions exactes, aucun audit.





### CHARACTER-OPTIONS





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Villainous Class Options ; Cleric: Death Domain ; Paladin: Oathbreaker ; Creating New Character Options ; Creating a Race or Subrace ; Cosmetic Alterations ; Creating a New Subrace ; Example Subrace: Eladrin ; Creating a New Race ; Example Race: Aasimar ; Modifying a Class ; Changing Proficiencies ; Changing Spell Lists ; Restricting Class Access ; Substituting Class Features ; Creating New Class Options ; Variant: Spell Points ; Spell Point Cost ; Spell Points by Level ; Creating a Background ; Step 1. Root It in Your World ; Step 2. Suggest Personal Characteristics ; Step 3. Assign Proficiencies or Languages ; Step 4. Include Starting Equipment ; et 1 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 25 unités rattachées à ce lot.


- **Dépendances** : [CHARACTER-PROGRESSION](#character-progression).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DMG-DUNGEON-GENERATION





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Mapping a Dungeon ; Dungeon Features ; Walls ; Doors ; Sounds ; Appendix A: Random Dungeons ; Starting Area ; Passages ; Passage ; Passage Width ; Door Type ; Beyond a Door ; Chambers ; Chamber ; Chamber Exits ; Exit Location ; Exit Type ; Stairs ; Connecting Areas ; Stocking a Dungeon ; Chamber Purpose ; Dungeon: Death Trap ; Dungeon: Lair ; Dungeon: Maze ; et 36 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 64 unités rattachées à ce lot.


- **Dépendances** : [TRAPS-EXTENSION](#traps-extension) ; [ENCOUNTER-BUDGET](#encounter-budget) ; [MAGIC-ITEMS-CATALOG](#magic-items-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DOORS-DISCOVERY





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — découverte et projection des portes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Secret Doors ; Concealed Doors.


- **Démarrage W12 depuis le registre** : DMG lignes4090–4102 consultées ponctuellement. Contrat approuvé : métadonnées sur porte réellement existante et DD/provenance explicites ; Perception passive/active pour secret, indices seulement en passif concealed puis révélation physique du bon cache sans dé, Investigation séparée si mécanisme non évident. Portée/vue/éclairage et vrais coûts contrôlés, découverte distincte d'ouverture/serrure/piège, reçus et jets tenus persistés. Outils figés proposés `configure_hidden_door`, `inspect_hidden_doors`, `resolve_door_discovery` ; `dmTools.doorDiscovery`, présentation et chemins joueur filtrés sans nouvelle géométrie ni restriction NPC globale. Code/tests en cours, aucun résultat livré revendiqué.


- **Limite de confidentialité constatée localement** : `app/api/dm/route.ts` transmet actuellement le GameState intégral et les tests vérifient son égalité SQL. Ce lot masque la présentation et le contexte perçu, en conservant la référence MJ ; cela ne protège pas les définitions contre l'inspection technique du transport client. Une vraie projection publique du GameState demande un raccord transverse distinct, à traiter sans casser l'autorité serveur. Aucune protection supplémentaire non implémentée n'est déclarée acquise.


- **Gel portes après ce démarrage** : trois outils enregistrés, découverte/révélation/mécanisme persistants, vrai passif/recherche/jet tenu, ouverture/serrure/piège distincts. Contrôles, connexions perçues, chemins joueur, ASCII et masque MapFog filtrés ; rayons physiques/NPC et géométrie préservés. Le même trait mural couvre les vrais murs et les seuils inconnus, sans icône réservée au secret ; un dessin arbitraire ailleurs sur l'asset reste une limite artistique documentée. Build et TypeScript complet0, **12nouveaux publics/SQL/SSR/legacy +103régressions** verts dans leurs collectes, `output/mcp-wave13-b-doors-20261102` figé. A7 vérifié dans ce socle (18fichiers propres identiques,5communs inspectés et hooks préservés). Correctif de validation : employer la véritable aventure canonique au spawn lorsque le schéma entrant n'a pas adventureId, sans bascule ni mutation. [Guide portes](door-discovery.md). API/classifications préparées ; global de la cohorte encore à faire. Agent immédiatement réaffecté à perception/flammes du groupe météo.


- **Raccord API et cohorte W12** : configuration exclue du plan d'action, inspection confidentielle documentaire, méthode passive non consommatrice du budget joueur mais bien persistée ; les autres méthodes restent de vraies actions. `tests/dm-door-discovery.test.cjs` vérifie les appels exacts, aucune ouverture/destination fabriquée, passif sans dé ni action, vrai test joueur encore disponible et seconde action refusée, état SQL identique. Ce nouveau cas passe dans les18/18 de `w12-api-r2.log` après les51/51 mécaniques, avec TypeScript/build0 ; inventaire184 et domaine `hidden_doors` réellement consulté dans `w12-tools-r2.json`. Full W12 à1780/1780 et mock30/30 terminés en sortie0 ;949fichiers compilés publiés et184outils vérifiés dans un nouveau processus, rapport W12 en tête du registre.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 2 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### ENVIRONMENT-STRUCTURES





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Portcullises.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 1 unités rattachées à ce lot.


- **Dépendances** : [MOVEMENT-3D](#movement-3d).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### LIGHTING-EXTENSION





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Darkness and Light.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 1 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### TRAVEL-SURVIVAL





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : initiative_2014 + respiration — météo/exposition/perception.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Air Quality ; Wilderness ; Travel-Montage Approach ; Hour-by-Hour Approach ; Mapping a Wilderness ; Movement on the Map ; Wilderness Features ; Monster Lairs ; Monuments ; Ruins ; Settlements ; Strongholds ; Weird Locales ; Wilderness Survival ; Weather ; Wind ; Precipitation ; Extreme Cold ; Extreme Heat ; Strong Wind ; Heavy Precipitation ; High Altitude ; Wilderness Hazards ; Desecrated Ground ; et 19 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 46 unités rattachées à ce lot.


- **Dépendances** : [PHB-EXHAUSTION](#phb-exhaustion).


- **Forage W12 gelé après orientation** : `inspect_foraging`, `resolve_foraging`, `register_water_container`, `collect_forage` intégrés. Vrais intervalles voyage non réutilisables, Survie DD10/15/20, puis deux vrais d6+SAG après succès final ; stock local avant acquisition, aliments consommables et eau vers capacités exactes, portage projeté avant mutation. Compilation privée0 et **66/66 ciblés**, dont 12 nouveaux, dans `output/mcp-wave11-travel-current-20261102` désormais utilisé pour W12. Sources ponctuelles : DMG p.111, capacités PHB p.153, Food/Water p.185. Modules `lib/foraging-state.ts`, `mcp-server/foraging.ts`, `mcp-server/tools/foraging-tools.ts`, `tests/foraging.test.cjs`, extensions survival/carrying/travel et [guide](foraging.md). Application/support et intégration W12 validés et publiés :1780/1780, mock30/30,184outils réels ; voir rapport W12 en tête du registre. Agent immédiatement réaffecté aux sources d'eau/remplissage/transvasement sous PHB-SURVIVAL ; groupe, conservation, purification et autres dangers restent ouverts. Le démarrage historique décrit ensuite est dépassé par ce gel.


- **Relais météo du 2 novembre — en cours** : source ciblée DMG4294–4316, froid/chaleur/vent/précipitations/haute altitude. C : vraies expositions/équipement/adaptation sourcés, événements horaires explicites et épuisement, accès réel à eau, dose30jours et marche effective×2 sans distance/position inventée ; épisode chaleur conservé sans reset par nonce, clôture réelle documentée comme interprétation. Vrai contexte aérien/hauteur et atterrissage/chute dus, aucune exemption magique/hover inventée ni faux atterrissage. B : perceptionSense sight/hearing/other explicite, vrai obscurcissement physique/LOS/passif/jet tenu et flammes ouvertes/carburant, protection de lampe inconnue établie par vrai fait d'instance. A : vent/hauteur dans les vrais contextes d'armes/Reach tenus. Répartition coordonnée sur leurs fichiers ; aucun jet météo/save automatique, aucune dissipation de magie non représentée ni géométrie narrative. Code/tests en cours, aucun gel global météo revendiqué ; privés de portes/eau/A7 restent immuables.


- **Avancée météo ciblée suivante** : A compile0 et passe7/7 vent/hauteur/jet tenu/MistyStep ; fichiers transmis à C avant poursuite des improvisées/argenture, A7 inchangé. B raccorde le vrai sens de Perception et `set_light_weather_protection` (fait d'instance/source existant), sans mur physique ni magie dissipée. C termine événements thermiques, altitude/vol et tick de combat : pause au premier vrai événement, curseur et reste de six secondes conservés, reprise moteur du même appel après résolution explicitement choisie. La cadence et la chronologie restent à tester ensemble ; aucun succès global météo déclaré.


- **Démarrage W11 orientation du 2 novembre — en cours** : consultation ciblée DMG p.111, DD de terrain 5/10/15 et modificateur réel d'allure ±5. État de perte d'orientation commun à tous les trajets, vrai test puis 1d6 heures de recherche en cas d'échec avant nouvel essai, mains et aides réellement établies sans déduction du nom d'un objet. Recherche par vraie marche, temps/nutrition/marche forcée/repos communs, distance de route inchangée ; aucune direction ni position inventée. Deux outils en cours : `resolve_travel_navigation`, `advance_navigation_search`, inspection via `inspect_travel`. Le contrat est approuvé, code et tests restent à valider ; la navigation maritime ne devient pas utilisable sans vrai navire pris en charge. Autres dangers/météo/forage restent ouverts.


- **Gel orientation et relais** : compilation privée0 ; 9/9 orientation, 14/14 voyages puis 14/14 checks génériques passent dans leurs exécutions distinctes. Le seul écart de la cohorte33 concernait une ancienne fixture de sauvegarde de mort, corrigée et rejouée séparément. Échec d'orientation et délai1d6 conservés, vraie recherche contre attente, changement de route sans reset, avantage visuel sourcé et refus aveuglé avant dé. Fichiers : `mcp-server/travel-navigation.ts`, extensions travel/state/tools/ability-check et `tests/travel-navigation.test.cjs`. Domaine support `travel` et documentation actualisés. Agent immédiatement réaffecté au forage sur les vrais intervalles voyage à allure normale/lente, sans durée ni fréquence supplémentaire inventée : deux vrais d6+SAG après succès, nourriture consommable et eau vers les contenants possédés à capacité source, acquisition/portage projetés avant mutation et reçus non réutilisables. Code en cours ; ce forage n'est pas déclaré livré.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Validation et publication W14 du 2 novembre** :1925/1925tests, TypeScript/build0, mock30/30 (neuf scénarios,71appels,0$, objectifs OK),208outils réellement exposés. Les642entrées figées et1049binaires publiés concordent ; [rapport permanent W14](rules-audit/validation-wave14-2026-11-02.json). Ce lot sort du travail actif dans son périmètre livré ; ses limites spécifiques ci-dessus et les autres lots de catalogue restent distincts. Les sources des agents suivantes ne sont pas couvertes par cette livraison.





### ENVIRONMENT-HAZARDS





<!-- BEGIN:W37-PUBLISHED-ENVIRONMENT-HAZARDS -->


- **W37.** DMG2014 glace glissante : une vraie case entrée par Shove Aside conserve sa source et son contact forcé. L’IA résout explicitement le test DEX(Acrobatics) et sa condition à terre, sans dépenser un mouvement volontaire ni supprimer le coût du concours initial. Une entrée par vrai corps et vrai tour conserve sa preuve SQL/rejeu. Les trajectoires et contacts simultanés non représentés refusent avant dés/coûts ; glace mince/charges et autres déplacements forcés restent reportés. [Guide](slippery-ice.md).


<!-- END:W37-PUBLISHED-ENVIRONMENT-HAZARDS -->





<!-- BEGIN:W30-PUBLISHED-ENVIRONMENT-HAZARDS -->


- **W42 — Diagonales bornées à 45° intégrées le 9 novembre 2026.** Première entrée unique sur le bord de la haie pour la cellule choisie par l’agent ; supports secs coplanaires, dégagements de coin et témoins de reprise contrôlés avant coût. Consommateurs et schéma alignés, cardinaux conservés. Types/build et 55 ciblés antérieurs verts, une sonde SQL distincte ; full interrompue et mock non lancé sur instruction utilisateur. Publication sans nouvelle exécution ; fournisseur LLM et allègement de prompt parallèles conservés, non couverts par ces preuves. [Rapport W42](rules-audit/validation-wave42-diagonal-2026-11-09.json).

- **W30 — Tirs et lancers contre les ronces-lames.** DMG 2014, lignes 4346–4350. Une face explicitement choisie reçoit le vrai projectile ou l'arme lancée. Le rayon cardinal sec et coplanaire exige des supports mesurés jusqu'à la cible. Les portées, les dépenses, les immunités et la couverture existantes restent appliquées. La couverture peut désigner la seconde case de la haie. Les refus de diagonale, hauteur, support manquant ou obstacle intermédiaire précèdent les dépenses et les dés. [Guide Ronces-lames](razorvine.md).


- **Découverte ciblée W30.** La lecture de `object-weapon-attacks.ts` et `cover.ts` a révélé des usages de l'ancre de l'objet alors qu'une autre face était choisie. W30 raccorde la face effective à la couverture, au vent, aux flammes et au dépôt du projectile. Cette correction provient du lot, sans nouvel audit global.


- **Suite concrète.** Représenter les autres rayons, formes et contacts automatiques. La glace mince attend toujours le suivi automatique des charges.


<!-- END:W30-PUBLISHED-ENVIRONMENT-HAZARDS -->





<!-- BEGIN:W29-PUBLISHED-ENVIRONMENT-HAZARDS -->


- **W29 — Ronces-lames.** DMG 2014, lignes 4346–4350. La haie mesurée de 10 par 10 par 5 pieds utilise sa CA 11, ses 25 PV et les immunités du livre. Sous initiative active, un contact direct attesté et à portée donne un jet de DEX DD 10 à la première occurrence du tour. Un échec inflige 1d10 dégâts tranchants. [Guide Ronces-lames](razorvine.md).


- **Suite concrète.** Autres formes de ronces-lames, contacts de traversée et tirs sur d’autres pentes, coins de haie ambigus ou reliefs restent à traiter. La glace mince attend le suivi automatique des charges réelles. Tirs cardinaux W30 et diagonales bornées W42 déjà intégrés.


<!-- END:W29-PUBLISHED-ENVIRONMENT-HAZARDS -->





<!-- BEGIN:W28-PUBLISHED-ENVIRONMENT-HAZARDS -->


- **W28 — Glace glissante.** DMG 2014, lignes 4352–4354. Un pas sur un support glacé réellement mesuré coûte du terrain difficile. À la première entrée du tour, un test de DEX (Acrobaties) DD 10 décide si la créature tombe à terre. L’utilisateur réserve la résolution aux déplacements avec initiative active. Le pas et le jet en attente sont conservés lors de la reprise. [Guide Glace glissante](slippery-ice.md).


- **Suite concrète.** Raccorder les entrées forcées et les autres modes de mouvement à leur géométrie, puis représenter séparément la glace mince et sa charge.


<!-- END:W28-PUBLISHED-ENVIRONMENT-HAZARDS -->





<!-- BEGIN:W27-PUBLISHED-ENVIRONMENT-HAZARDS -->


- **W27 — Sol profané sur les surfaces publiques mesurées.** DMG 2014, lignes 4328–4334. Avantage aux sauvegardes des morts-vivants déjà publiés lorsqu’ils reposent sur la zone, y compris à terre selon la décision utilisateur. La Détection du mal et du bien existante lit une présence tant que la concentration tient. Une fiole réelle purifie un carré de dix pieds, avec une action en combat ou une durée choisie par le MJ hors combat. Le reçu conserve la fiole consommée et les cases exactes après reprise. Les contrôles couvrent la correction du fait de scène, un jet tenu et l’interruption par la teinture pâle. [Guide Sol profané](desecrated-ground.md).


- **Suite concrète.** Représenter les passages à travers des matériaux mesurés, les surfaces profanées secrètes et la purification par Hallow.


<!-- END:W27-PUBLISHED-ENVIRONMENT-HAZARDS -->





<!-- BEGIN:W26-PUBLISHED-ENVIRONMENT-HAZARDS -->


- **W26 — Eau glaciale livrée pour le joueur.** DMG 2014, lignes 4336–4338. Milieu de nage mesuré et froid explicitement qualifié, tolérance égale au score de CON de l'entrée en minutes, puis un CON DD 10 par minute complète supplémentaire. Un échec ajoute un niveau d’épuisement. L'utilisateur compte la vraie nage de surface et renouvelle la tolérance après une sortie physique vérifiée. Les événements gardent l'horloge et le reliquat du round, ainsi que leur reçu après sauvegarde. [Guide Eau glaciale](frigid-water.md).


- **Suite concrète.** Étendre à d'autres corps ou à d'autres dangers physiques quand le moteur représente leurs positions et les échéances nécessaires. La résistance issue de la pétrification et la reprise d’un dé tenu sont relues en source pour cette tranche.


<!-- END:W26-PUBLISHED-ENVIRONMENT-HAZARDS -->





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Dungeon Hazards ; Improvising Damage ; Damage Severity and Level.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 4 unités rattachées à ce lot.


- **Dépendances** : [TRAVEL-SURVIVAL](#travel-survival).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DMG-URBAN-EVENTS





<!-- BEGIN:W29-PUBLISHED-DMG-URBAN-EVENTS -->


- **W29 — Dé d’occurrence et contrôles diurnes distincts.** DMG 2014, lignes 3157–3163 et 4647–4672. En mode d20, 18 ou plus ouvre le d12+d8. Un résultat inférieur conserve seulement le dé d’occurrence. Le MJ garde le choix direct et peut contrôler à nouveau le même jour après un vrai instant local ultérieur attesté. Le moteur conserve les anciens reçus W28 et le comportement de reprise de la route DM. [Guide Rencontres urbaines](urban-encounters.md).


- **Suite concrète.** Étendre les cadences de campagne et traiter séparément les événements urbains réellement décidés.


<!-- END:W29-PUBLISHED-DMG-URBAN-EVENTS -->





<!-- BEGIN:W28-PUBLISHED-DMG-URBAN-EVENTS -->


- **W28 — Rencontres urbaines.** DMG 2014, lignes 3157–3163 et 4647–4672. Deux heures locales choisies par le MJ déterminent la phase. La nuit conserve la date de son début. Le MJ choisit la présence ou l’absence d’une rencontre et confirme la sortie nocturne. En cas de présence, les deux dés de la table donnent une proposition documentaire. La relance justifiée conserve ses faces et son reçu dans la même scène et au même instant. [Guide Rencontres urbaines](urban-encounters.md).


- **Suite concrète.** Raccorder le contrôle d’occurrence d20 déjà publié au registre urbain et permettre plusieurs contrôles diurnes réellement distincts.


<!-- END:W28-PUBLISHED-DMG-URBAN-EVENTS -->





- **État** : Livré partiellement. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Settlement ; Random Settlements ; Race Relations ; Ruler's Status ; Notable Traits ; Known For Its... ; Current Calamity ; Random Buildings ; Building Type ; Residence ; Religious Building ; Tavern ; Tavern Name Generator ; Warehouse ; Shop ; Mapping a Settlement ; Urban Encounters ; Law and Order ; Trials ; Sentences ; Random Urban Encounters ; Animals on the Loose ; Announcement ; Brawl ; et 16 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 41 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MOVEMENT-3D





- **État** : À faire. **Priorité** : P1. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Unusual Environments ; Underwater ; Random Undersea Encounters ; Swimming ; Underwater Visibility ; Underwater Encounter Distance ; The Sea ; Navigation ; Shipwrecks ; Random Encounters at Sea ; Weather at Sea ; Visibility ; Owning a Ship ; Airborne and Waterborne Vehicles ; The Sky.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 17 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### TRAPS-EXTENSION





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Traps ; Traps in Play ; Triggering a Trap ; Detecting and Disabling a Trap ; Trap Effects ; Trap Save DCs and Attack Bonuses ; Damage Severity by Level ; Complex Traps ; Sample Traps.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 9 unités rattachées à ce lot.


- **Dépendances** : [ENVIRONMENT-HAZARDS](#environment-hazards).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DMG-CAMPAIGN-TRACKING





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Between Adventures ; Linking Adventures ; Using an Overarching Story ; Example 1: The Quest of Many Parts ; Example 2: Agents of X ; Planting Adventure Seeds ; Foreshadowing ; Campaign Tracking.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 8 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DOWNTIME-ECONOMY





<!-- BEGIN:W33-PUBLISHED-DOWNTIME-ECONOMY -->


- **W33 — Rites sacrés, tranche préparée.** DMG 5217–5223, dépendances PHB existantes. Vrais faits de piété/temple/accès/rôle, dix dates 8 h non consécutives, unique 2 d 6 puis Inspiration aux vrais débuts de date. Fin du dixième bloc à minuit incluse. Détenu ou réservé plafonne sans cumul/report ; les reçus source du projet ne saturent pas les 256 octrois MJ. Aucun double crédit avec Service. [Guide](sacred-rites.md), [Inspiration](dm-inspiration.md).


- **Preuves privées et limite.** 5 scénarios publics et 33 voisins verts, SQL/POST/carte/réservation/registre 256 réels ; même site, un cycle inachevé,16 cycles et pas de chevauchement de bénéfices représenté. Sacrifices facultatifs/multi-temples restent distincts. [Rapport commun W33 à produire](rules-audit/validation-wave33-2026-11-07.json).


- **Raccord documentaire exploratoire.** 1 régression POST supplémentaire reproduit une narration de jeu indue avant correctif puis passe après le seul classement documentaire de `inspect_sacred_rites` dans le preview commun. Les deux croisements Service/Rites et Cadence/Rites/Charme passent aussi dans le preview après correction de l’attente CJS du registre discrétionnaire. Ces trois tests ne valent ni validation complète ni publication de W33.


- **Suite concrète.** Choisir sacrifice physique ou pratique fractionnée/multi-temples ; les autres activités DOWNTIME-ECONOMY restent ouvertes.


<!-- END:W33-PUBLISHED-DOWNTIME-ECONOMY -->





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : respiration — commerce et fabrication ordinaire2014.


- **Relais après transvasements — 2 novembre** : source ciblée PHB5525–5537 et DMG8621–8633. Achat depuis de vrais objets confiés au stock d'un PNJ marchand réellement présent, prix/monnaies explicitement choisis, transfert des mêmes instances après capacité/temps ; aucun vendeur, marchandise ou monnaie créé par débit. Fabrication ordinaire nonmagique avec recette source, outil possédé et maîtrise réelle, ingrédients physiques identifiés de moitié du prix, travail réel8heures et progression source5gp/jour. Aucun travail déjà effectué n'est effacé au passage de minuit. Poisoner's kit exigé pour Basic Poison selon DMG ; autres poisons avec autorisation MJ explicite et matériaux réels. Code/tests en cours dans un nouveau privé, pas de variante XGE activée. Magie, aides, entretien/profession et autres activités restent ouverts ; ce sous-lot ne clôt pas toute l'entrée.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Recurring Expenses ; Maintenance Costs ; Businesses ; Garrisons ; Downtime Activities ; More Downtime Activities ; Downtime Activity: Building a Stronghold ; Building a Stronghold ; Downtime Activity: Carousing ; Carousing ; Downtime Activity: Crafting a Magic Item ; Crafting Magic Items ; Magic Item Formulas ; Downtime Activity: Gaining Renown ; Downtime Activity: Performing Sacred Rites ; Downtime Activity: Running a Business ; Running a Business ; Downtime Activity: Selling Magic Items ; Salable Magic Items ; Selling a Magic Item ; Downtime Activity: Sowing Rumors ; Sowing Rumors ; Downtime Activity: Training to Gain Levels ; Training to Gain Levels ; et 4 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 28 unités rattachées à ce lot.


- **Dépendances** : [DMG-CALENDAR](#dmg-calendar).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Raccord applicatif commerce/fabrication préparé, non validé** : achat et work_ordinary_crafting classés actions principales ; préparation de stock/offre et démarrage/finalisation/annulation de projet auxiliaires selon contrat moteur. Inspection en lecture, continuation seulement du même projectId explicitement choisi, arguments jamais réécrits. Les tests API attendent le gel cohérent B ; ce code ROOT est hors W16 et hors des26cas de la copie campagne.





- **Gel W20 B et relais immédiat confirmés** : output/mcp-wave20-b-downtime-economy-20261102 immobile, buildMCP0/typecheckMCP+Next0,99/99cohorte (110026,1987ms),14nouveaux publics :6commerce+8craft. Parcours réel stock→achat kit/matières→fabrication, Basic Poison20×8h avec attentes→vraie dose→coat existant, SQL/masses/minuit/coûts/identités testés. Propres : merchant-state, ordinary-crafting-state, runtimes/outils/tests associés et docs/downtime-economy.md ; petits hooks dmTools/GS/index/include, catalogue14IDs poison et raw_crafting_materials sans prix/masse/recette par défaut,2hunks de masse restante. La capture A poisons n’est pas gelée/certifiée par ces99cas ; ses14IDs statiques seulement sont nécessaires au commerce/craft. Nouveau privé parent output/mcp-economy-api-20261102 pour2parcours API/SQL et budget du même projectId, vérifications en cours sans modifier W20 ni W16. B travaille déjà sur Training, sans attente de la validation parent.





- **Correction de conformité prioritaire après lecture ponctuelle PHB5525 — W20r2 en cours** : la règle générale exige au moins8heures DANS CHAQUE JOUR compté. La consigne parent précédente de conserver les heures ne devait pas créditer4hjourA+4hjourB comme un jour de progrès. Les99cas W20 restent une preuve historique bornée et ne prouvent pas la conformité du crédit interjours ; aucun de ces binaires n’est publié. B conserve le gel W20 et prépare un correctif autonome : tous les segments historiques conservés, seuls les jours avec8h réelles propres sont crédités, complément du jourB autorisé jusqu’à8hB une seule fois. Les2parcours API parent concernent4h+4h dans une même journée, pas cette frontière. Training suspendu avant code jusqu’à ce correctif puis250jours admissibles distincts, jamais250blocs répartis sur des journées incomplètes. Source exacte : PHB5525, pas nouvel audit ni règle inventée.





- **API économie vérifiée dans sa portée exacte** : output/mcp-economy-api-20261102, TypeScript/build0,2/2API initiaux (23698,7597ms),7/7API+frontièresIA/vocabulaire (53958,5322ms), puis2/2 avec assertion explicite des deux4h dans le même jour (7067,1303ms). Mock30/30, neuf scénarios,71appels,0$, objectifsOK (19689ms). Neuf outils et domaine economy lus réellement. Achat/monnaie/temps/instances et projet/travail/objet au sol/pas de prise gratuite traversent SQL, appels strictement choisis par l’IA. [Rapport borné](rules-audit/validation-economy-api-2026-11-02.json). Le défaut interjours de W20 n’est pas couvert ni rendu conforme par ces tests : correction autonome B en cours avant livraison plus large. Aucun binaire économie ou poison WIP publié.





- **Correction W20r2 et API vérifiées** : gel output/mcp-wave20r2-b-crafting-days-20261102 immobile, buildMCP/Next0,15/15 puis1/1lot mono-recette5sorties (16cas distincts,22895,231ms et3455,6232ms). Les jours incomplets ne se cumulent plus ; quatre heuresA+quatre heuresB refusent, huit heuresB seules créditentB unefois, historique12h intact. calendarDay passé est explicitement choisi et le reçu tardif garde sa date travaillée. Parent output/mcp-economy-api-r2-20261102 : typecheck complet/build0,24/24 dont3API/SQL (26219,3789ms), mock30/30,71appels,0$,objectifsOK (17492ms). [Rapport conforme aux journées](rules-audit/validation-economy-days-api-2026-11-02.json). W20 historique non conforme aux crédits interjours reste intact ; il n’est jamais publié comme RAW. Multi-recettes/assistants restent ouverts, aucun prorata horaire inventé.





### TREASURE-CATALOG





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Treasure ; Types of Treasure ; Coins ; Gemstones ; Art Objects ; Magic Items ; Random Treasure ; Treasure Tables ; Using the Treasure Hoard Tables ; Treasure Hoard: Challenge 0—4 ; Treasure Hoard: Challenge 5—10 ; Treasure Hoard: Challenge 11—16 ; Treasure Hoard: Challenge 17+ ; Random Magic Items ; Magic Item Table A ; Magic Item Table B ; Magic Item Table C ; Magic Item Table D ; Magic Item Table E ; Magic Item Table F ; Magic Item Table G ; Magic Item Table H ; Magic Item Table I.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 23 unités rattachées à ce lot.


- **Dépendances** : [MAGIC-ITEMS-CATALOG](#magic-items-catalog) ; [DOWNTIME-ECONOMY](#downtime-economy).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MAGIC-ITEMS-CATALOG





- **État** : À faire. **Priorité** : P1. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Magic Items ; Identifying a Magic Item ; Variant: More Difficult Identification ; Magic Item Categories ; Armor ; Potions ; Variant: Mixing Potions ; Potion Miscibility ; Rings ; Rods ; Staffs ; Wands ; Variant: Wands That Don't Recharge ; Weapons ; Wondrous Items ; Magic Items A-Z.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 16 unités rattachées à ce lot.


- **Dépendances** : [PHB-SPELL-CATALOG](#phb-spell-catalog) ; [MOVEMENT-3D](#movement-3d).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MAGIC-ATTUNEMENT-NPC





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Attunement.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 1 unités rattachées à ce lot.


- **Dépendances** : [NPC-COMPANIONS](#npc-companions).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MAGIC-CURSED-ITEMS





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Cursed Items.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 1 unités rattachées à ce lot.


- **Dépendances** : [MAGIC-ITEMS-CATALOG](#magic-items-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### SCROLLS-EXTENSION





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Scrolls ; Spell Scroll ; Variant: Scroll Mishaps.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 3 unités rattachées à ce lot.


- **Dépendances** : [PHB-SPELL-CATALOG](#phb-spell-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DMG-OPTIONAL-RULES





<!-- BEGIN:W37-PUBLISHED-DMG-OPTIONAL-RULES -->


- **W37.** DMG2014 9242–9246 : cleaving:true adopte explicitement une vraie attaque de mêlée ordinaire, origine pleine à0PV, pas nécessairement morte. Le curseur conserve d20/dommages/coût initiaux puis chaque victime ou arrêt explicitement choisis, selon convention utilisateur distincte du RAW. Un raté admissible termine, une secondaire préblessée reçoit puis termine, sans nouveau dé/modificateur/attaque. Source, réactions, cycle de vie, budgets et SQL/rejeux restent liés. Première tranche létale/coplanaire/SmallMedium/transparente ; aucun pouvoir de monstre ajouté. [Guide](dmg-cleaving.md).


<!-- END:W37-PUBLISHED-DMG-OPTIONAL-RULES -->





- **Préparation ciblée Disarm, source seule.** DMG2014 9212–9217 ; contrat R2 SHA `79d5cf4f01bb81f4044573b8df95339c966187cad345e7c6d53bd636d4f7690b`, peer SHA `3c0c310eb844daba0b7b6664694ee76d018c52cb443a286e8633743b4408d03c`. Sens PJ→PNJ non qualifiable sans instance tenue PNJ ; ne pas déduire un objet du nom d’une attaque. Sens inverse borné possible en source : le bandit manuel a déjà une attaque Scimitar explicitement classée Melee Weapon Attack, et le PJ possède une arme tenue à une main et un producteur interne de chute réelle. Une attaque ordinaire de ce bandit dépense son action une fois ; aucun profil ni pouvoir de monstre ajouté. Décision utilisateur du 8 novembre 2026 reçue : comparer les totaux opposés ; ni 1 ni 20 naturel ne tranche automatiquement, et une égalité conserve l’objet. Exemple20+3 contre27 : désarmement raté. Cette convention vise uniquement Disarm, sans généraliser les combats de fosse ni modifier les autres attaques. Provenance `output/dmg-disarm-user-decision.json`, SHA `6af3a8d9ce80570fae75c7b9861fffa3730dc11c69b493fe0719f07292b9ef06`. Aucun code, jet, coût ou désarmement exécuté.





<!-- BEGIN:W36-PUBLISHED-DMG-OPTIONAL-RULES -->


- **W36.** DMG2014 9193–9195 et9232–9234 : Tumble choisit action entière ou bonus et vraie route de trois cases, avec DEX(Acrobatics) opposés et aucun bonus de taille. Échec Overrun peut précéder Tumble si son autre coût reste réellement disponible ; leurs registres, choix, permissions et reçus sont distincts. Traversée mesurée, vraies OA avant entrée et progrès déjà engagé persistent par SQL sans rollback, dé ou paiement neuf au rejeu. Bornes actuelles de géométrie sèche coplanaire Small/Medium, sorties libres et fenêtres représentées conservées ; aucun remplacement d’Extra Attack, Disengage ou pouvoir ajouté. [Guide](dmg-tumble.md).


<!-- END:W36-PUBLISHED-DMG-OPTIONAL-RULES -->





<!-- BEGIN:W35-PUBLISHED-DMG-OPTIONAL-RULES -->


- **W35.** DMG2014 9193–9195 et9224–9226 : Overrun est choisi via combat_action avec cible, action ou bonus et route réelle de trois cases cardinales. Vrais STR(Athletics) opposés conservés, avantage/désavantage de taille du mobile, coût entier distinct d’Extra Attack même en échec/égalité ; victoire autorise un passage ce tour. Milieu hostile difficile et sortie libre mesurés ; vraies OA avant entrée, réactions imbriquées et mort conservent dégâts/coûts/SQL sans nouvelle attaque, rollback global ou case médiane persistée. Borne actuelle : PJ Small/Medium au sol sec coplanaire, une salle, une tentative par adversaire/tour ; autres gabarits, eau/vol/transport/poursuite et frontières médianes non représentées restent refusés avant coût/dé. Aucun pouvoir de monstre ajouté ; autres variantes partielles. [Guide](dmg-overrun.md).


<!-- END:W35-PUBLISHED-DMG-OPTIONAL-RULES -->





<!-- BEGIN:W34-PUBLISHED-DMG-OPTIONAL-RULES -->


- **W34.** DMG2014 9193–9195 et9228–9230 : seule Shove Aside est choisie explicitement via combat_action(shove,aside,targetId,defenseSkill,toCell). Vrai concours Athletics désavantagé, avantage réel annulant ce désavantage, égalité sans déplacement et exactement une attaque remplacée. Déplacement cardinal5pieds mesuré dans la portée corporelle représentée5pieds, sol sec soutenu coplanaire ; fenêtres tenues, corps/portes/obstacles, SQL et coûts revalidés avant reprise. Glace forcée et ronces non représentées refusent avant dés/coûts. Les autres variantes de ce poste restent ouvertes, sans nouveau pouvoir de monstre. [Guide](dmg-shove-aside.md).


<!-- END:W34-PUBLISHED-DMG-OPTIONAL-RULES -->





- **État** : Livré partiellement. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Scroll Mishap ; Resolution and Consequences ; Success at a Cost ; Degrees of Failure ; Critical Success or Failure ; Dungeon Master's Workshop ; Ability Options ; Proficiency Dice ; Skill Variants ; Ability Check Proficiency ; Ability Check Proficiency by Class ; Background Proficiency ; Personality Trait Proficiency ; Hero Points ; New Ability Scores: Honor and Sanity ; Honor Score ; Sanity Score ; Adventuring Options ; Fear and Horror ; Fear ; Horror ; Healing ; Healer's Kit Dependency ; Healing Surges ; et 39 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 66 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MAGIC-EQUIPMENT-SLOTS





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Wearing and Wielding Items ; Multiple Items of the Same Kind ; Paired Items.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 3 unités rattachées à ce lot.


- **Dépendances** : [MAGIC-ITEMS-CATALOG](#magic-items-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MAGIC-ITEM-EDGE-RULES





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Coordination — validation W5.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Activating an Item ; Command Word ; Consumables ; Magic Item Formulas ; Spells ; Charges.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 6 unités rattachées à ce lot.


- **Dépendances** : [MAGIC-ITEMS-CATALOG](#magic-items-catalog).


- **Révalidation du 31 octobre — mot de commande, défaut reproduit** : la Perle de puissance ne consulte que effects('silence','player') dans [magic-item-tools.ts](../mcp-server/tools/magic-item-tools.ts#L110), tandis que les nouveaux faits silenced/gagged sont stockés dans dmTools.spellComponents.constraints. La [sonde MCP commandWordSilence](../output/rules-revalidation-20261031/probes.json) confirme un succès indu sous un fait silenced établi : emplacement de niveau1 passé de 3 à 4, charge de 1 à 0. Le mot de commande audible doit lire les faits de parole pertinents avant charge/action/restauration d'emplacement. [Règle et analyse DMG](rules-audit/revalidation-dmg-2026-10-31.md#constat-de-raccord--mot-de-commande-et-silence). Ajouter une régression positive après retrait du silence et traiter aussi le bâillon quand il empêche effectivement de prononcer le mot ; ce dernier cas n'a pas été exécuté par la sonde.











- **Livraison W5 du 31 octobre** : La Perle exige une parole audible avant charges/ressources : bâillon, contrainte de silence et effet silence actif sont vérifiés ; surdité et mains liées ne bloquent pas à elles seules le mot. Les baguettes gardent leur exemption de composants. Voir [spell-components.md](spell-components.md).


- **Outils/raccords W5 validés** : use_magic_item, inspect_spell_components, set_spell_component_constraint.


- **Reste / prochaine étape** : Étendre seulement les autres mécanismes/objets effectivement sourcés ; ce correctif ne constitue pas un catalogue général ni une zone dynamique Silence.


- **Preuve finale W5** : 1 201/1 201 tests, TypeScript complet et 30/30 tours mock passent ; [rapport borné et empreintes](rules-audit/validation-wave5-2026-10-31.json).





### OBJECT-DAMAGE





<!-- BEGIN:W22-BRIDGE-OBJECT-DAMAGE -->


- **Raccord W22 confirmé dans son seul périmètre** : Vraies attaques source contre objet, y compris ranged avec lanceur réellement acheté et munition exacte, portée/longue portée, couverture directionnelle, mur/ligne de vue, Loading et économies réelles. Adamantium critique seulement après vrai coup au but contre objet, sans critique de créature, magie ou dés inventés. Un projectile consommé une seule fois conserve provenance/SQL/reçus ; l’arc ordinaire ne reçoit pas le matériau. Origine joueur sur support réellement mesuré20pieds, corps/standing observés et objet sansZfictif : PHYSICAL_HEIGHT_POINT_GEOMETRY_REQUIRED avant munition/action/temps/dé, état complet et marker19 inchangés dans un nouveau processus SQL. Le coplanaire réussi et ce refus sont deux témoins distincts, non un rayon3D généralisé. Les limites existantes restent valables ; aucun lot entier supplémentaire n’est déclaré terminé.


<!-- END:W22-BRIDGE-OBJECT-DAMAGE -->


- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : initiative_2014 réaffecté — objets.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Magic Item Resilience ; Objects ; Statistics for Objects ; Armor Class ; Object Armor Class ; Hit Points ; Object Hit Points ; Huge and Gargantuan Objects ; Objects and Damage Types ; Damage Threshold.


- **Reprise W10** : agent réaffecté après initiative et cycle joueur suffocation. Contrat : helper commun des vrais dégâts d'arme contre objets préparés, immunités poison/psychic, profils de dégâts/seuil explicitement établis par le MJ, tables exactes de matériaux. Pas de dégâts libres ni propriétés déduites du texte ; objets gigantesques et sections physiques restent une borne à consigner. Code/tests en préparation, aucune validation encore revendiquée.


- **Avancée ciblée W10** : helper et profils persistés raccordés dans `interact_object`, matériaux DMG complétés, immunités poison/psychic, résistances/vulnérabilités et seuil appliqués au coup réel. Résilience magique uniquement explicitement établie pour un objet de scène. Build privé réussi, dix nouveaux tests et treize régressions objets/deux armes verts. La liste d'armes d'une fixture élargie était obsolète, déjà corrigée par le lot munitions. Ordre seuil après modifications explicitement marqué comme interprétation moteur dans le résultat, pas comme précision publiée du DMG. Validation intégrée et limites objets géants/sorts/artéfacts restent ouvertes.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 10 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Validation intégrée W10** : TypeScript complet,1523/1523 tests et30/30 tours mock réussis dans l’instantané r2 ;141 outils uniques. Voir le [rapport W10](rules-audit/validation-wave10-2026-11-01.json). Cette clôture concerne le sous-périmètre décrit ; les limites et dépendances ci-dessus restent autoritaires.





### MAGIC-MINOR-PROPERTIES





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Special Features ; Who Created It or Was Intended to Use It? ; What Is a Detail from Its History? ; What Minor Property Does It Have ; What Quirk Does It Have.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 5 unités rattachées à ce lot.


- **Dépendances** : [MAGIC-ITEMS-CATALOG](#magic-items-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MAGIC-SENTIENT-ARTIFACTS





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Sentient Magic Items ; Creating Sentient Magic Items ; Abilities ; Communication ; Sentient Magic Item Communication ; Senses ; Sentient Magic Item Senses ; Alignment ; Sentient Magic Item Alignment ; Characteristics ; Special Purpose ; Sentient Special Purpose ; Conflict ; Sample Sentient Items ; Blackrazor ; Moonblade ; Moonblade Properties ; Wave ; Whelm ; Artifacts ; Artifact Properties ; Minor Beneficial Properties ; Major Beneficial Properties ; Minor Detrimental Properties ; et 11 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 35 unités rattachées à ce lot.


- **Dépendances** : [MAGIC-ITEMS-CATALOG](#magic-items-catalog) ; [PHB-SPELL-CATALOG](#phb-spell-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DMG-SPECIAL-REWARDS





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Other Rewards ; Supernatural Gifts ; Blessings ; Blessing of Health ; Blessing of Protection ; Blessing of Magic Resistance ; Blessing of Understanding ; Blessing of Valhalla ; Blessing of Weapon Enhancement ; Blessing of Wound Closure ; Charms ; Charm of Animal Conjuring ; Charm of Darkvision ; Charm of Feather Falling ; Charm of Heroism ; Charm of Restoration ; Charm of the Slayer ; Charm of Vitality ; Training ; Epic Boons ; Alternatives to Epic Boons.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 21 unités rattachées à ce lot.


- **Dépendances** : [CHARACTER-PROGRESSION](#character-progression) ; [MAGIC-ITEMS-CATALOG](#magic-items-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### ABILITY-EDGE-RULES





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Using Ability Scores ; Ability Checks ; Multiple Ability Checks ; Contests ; Intelligence Check vs. Wisdom Check ; Attack Rolls ; Saving Throws ; Difficulty Class ; Typical DCs ; Variant: Automatic Success ; Proficiency ; Skills ; Tools ; Saving Throws and Attack Rolls ; Advantage and Disadvantage.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 17 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DM-INSPIRATION





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Ajouter une réserve InspirationMJ2014, octroi explicite et consommation avant jet pour avantage ; aucun parseur d’intention ni récompense automatique.


- **Règles concernées** : Inspiration ; Awarding Inspiration ; When Do You Award Inspiration? ; Tracking Inspiration ; Ignoring Inspiration ; Variant: Only Players Award Inspiration.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 6 unités rattachées à ce lot.


- **Intégration courante — W1-DM-INSPIRATION** : Réserve unique du MJ, choix du prochain type de jet avant les dés ; distinct de Bardic et bonusRP ; sans transfert autrePJ.


- **Outils effectifs** : `grant_inspiration`, `spend_inspiration`.


- **Fichiers** : [lib/dm-inspiration-state.ts](../lib/dm-inspiration-state.ts), [mcp-server/dm-inspiration.ts](../mcp-server/dm-inspiration.ts), [mcp-server/tools/dm-inspiration-tools.ts](../mcp-server/tools/dm-inspiration-tools.ts), [tests/dm-inspiration.test.cjs](../tests/dm-inspiration.test.cjs).


- **Validation** : TypeScript OK ; 942/942 tests ; 30/30 tours mock ; 42 fichiers identiques à la copie validée.


- **Reste connu** : One SRD player: no transfer to another player character. Pre-roll reservation only, no retrospective alteration of held results or 2024 reroll. Bardic Inspiration and numerical house roleplay bonus retain separate state.





### SOCIAL-DMG-REACTIONS





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Social Interaction ; Resolving Interactions ; 1. Starting Attitude ; 2. Conversation ; 3. Charisma Check ; Conversation Reaction ; 4. Repeat? ; Roleplaying ; Being the NPC ; Using Your Voice ; Using Your Face and Arms ; Engaging the Players.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 12 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Relais après gel météo B — 2 novembre** : nouveau privé `output/mcp-wave15-b-social-20261102`, partagé avec l’autre entrée sociale du même mécanisme. Contrat standard2014 : vraies attitudes MJ, conversation et participants choisis, demande exacte et risque/sacrifice réels, tables DMG et reprise des dés ; aucun secret, acte de volonté, ordre, quête ou récompense exécuté automatiquement. [Choix remplacé le 2 novembre : seule la procédure 2014 est conservée] ; répétition décidée par le MJ, sans relance par nonce. Aucun outil social nouveau encore déclaré livré.





- **Validation et publication W14 du 2 novembre** :1925/1925tests, TypeScript/build0, mock30/30 (neuf scénarios,71appels,0$, objectifs OK),208outils réellement exposés. Les642entrées figées et1049binaires publiés concordent ; [rapport permanent W14](rules-audit/validation-wave14-2026-11-02.json). Ce lot sort du travail actif dans son périmètre livré ; ses limites spécifiques ci-dessus et les autres lots de catalogue restent distincts. Les sources des agents suivantes ne sont pas couvertes par cette livraison.





### COMBAT-EDGE-RULES





- **État** : À faire. **Priorité** : P1. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Combat ; Tracking Monster Hit Points ; Using and Tracking Conditions ; Monsters and Critical Hits ; Adjudicating Reaction Timing.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 5 unités rattachées à ce lot.


- **Dépendances** : [CONTRACT-INITIATIVE](#contract-initiative).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### CONTRACT-INITIATIVE





- **État** : Livré partiellement. **Priorité** : P0. **Responsable** : Coordination — intégration, déplacements et validation.


- **Constat de l’audit initial** : Arbitrer et documenter initiative standard ou contrat projet relancé par round ; ne pas modifier automatiquement l’invariant imposé par CLAUDE.md.


- **Règles concernées** : Tracking Initiative ; Hidden List ; Visible List ; Index Cards.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 4 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Décision utilisateur du 1er novembre — poursuite complète** : règles standard D&D 2014 par défaut, explicitement choisies par l’utilisateur ; initiative conservée pendant tout le combat. La décision de principe est actée, le raccord effectif reste à réaliser/valider. Les variantes ne sont pas activées par défaut, et les options d’une autre édition ne deviennent pas des règles 2014. Les règles maison antérieures ne constituent pas une conformité PHB acquise.





- **Validation intégrée W10** : TypeScript complet,1523/1523 tests et30/30 tours mock réussis dans l’instantané r2 ;141 outils uniques. Voir le [rapport W10](rules-audit/validation-wave10-2026-11-01.json). Cette clôture concerne le sous-périmètre décrit ; les limites et dépendances ci-dessus restent autoritaires.





### SPELL-AREAS-EXTENSION





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Adjudicating Areas of Effect ; Targets in Areas of Effect.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 2 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MASS-COMBAT-SIEGE





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Handling Mobs ; Mob Attacks ; Siege Equipment ; Ballista ; Cannon ; Suspended Cauldron ; Mangonel ; Ram ; Siege Tower ; Trebuchet.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 10 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### COVER-TARGETING





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Using Miniatures ; Tactical Maps ; Creature Size on Squares and Hexes ; Creature Size and Space ; Areas of Effect ; Line of Sight ; Cover ; Optional Rule: Flanking ; Optional Rule: Facing.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 9 unités rattachées à ce lot.


- **Dépendances** : [MOVEMENT-3D](#movement-3d).


- **Intégration courante — W2-COVER** : Couverture directionnelle déclarée +2/+5 CA/DEX, totale, vraies origines et Sacred Flame ; pas géométrie3D, pourcentages pixel ou propagation totale autour des coins.


- **Avancées vérifiées dans le lot** : Le sous-ensemble 2D de couverture directionnelle est raccordé aux attaques, sauvegardes de DEX et origines réelles des effets. La prévalidation complète des multiattaques empêche un refus après le premier coup ou après le tirage du nombre d’attaques.


- **Outils effectifs** : `configure_cover`, `inspect_cover`.


- **Fichiers** : [lib/cover-state.ts](../lib/cover-state.ts), [mcp-server/cover.ts](../mcp-server/cover.ts), [mcp-server/tools/cover-tools.ts](../mcp-server/tools/cover-tools.ts), [tests/cover.test.cjs](../tests/cover.test.cjs), [tests/cover-action-preflight.test.cjs](../tests/cover-action-preflight.test.cjs), [docs/cover.md](../docs/cover.md).


- **Raccords et tests complémentaires** : [mcp-server/hero-combat.ts](../mcp-server/hero-combat.ts), [mcp-server/hero-spells.ts](../mcp-server/hero-spells.ts), [mcp-server/monster-rules.ts](../mcp-server/monster-rules.ts), [mcp-server/tools/combat-tools.ts](../mcp-server/tools/combat-tools.ts).


- **Validation W2** : TypeScript réussi (exit 0), régression finale **999/999 tests**, aucun échec ni test ignoré (exit 0, 459 359,6621 ms). Validation sur l’instantané isolé output/mcp-priority-wave2-20261031, qui précède les raccords W3 et les modes de déplacement en cours ; ces derniers ne sont pas attestés par ce résultat. Les 67 tests ciblés, les 12 scénarios de transport et le précédent playtest mock 30/30 avaient aussi passé. Le playtest final a réussi **30/30 tours, 9 scénarios, 97 appels mock et 0 $** (exit 0) ; listTools a confirmé **117 outils** (exit 0). Preuves et empreintes : [rapport W2](rules-audit/validation-wave2-2026-10-31.json).


- **Reste connu** : Les gabarits multicases, la géométrie 3D et la propagation non représentée autour des coins restent ouverts. Les options Flanking/Facing ne sont pas activées par cette intégration et exigent leur décision propre.


- **Prochaine étape concrète** : Poursuivre MOVEMENT-3D pour les gabarits et la géométrie nécessaires ; Flanking/Facing restent des options à décider séparément.





### EFFECT-STACKING





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Combining Game Effects.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 1 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### DMG-CHASES





<!-- BEGIN:W32-PUBLISHED-DMG-CHASES -->


- **W32 — Table sauvage partielle.** DMG 2014, 8243–8257. `begin_chase` choisit wilderness sans garde urbain ; les mêmes initiative, Dash, fatigue, curseurs et dés originaux sont conservés. Lignes 1/2/4 : vrais tests DD10 et terrain qualifié ; ligne 5 : CON10, aveuglement et demi-vitesse jusqu’à la vraie fin du tour ; ligne 8 : DEX10 et un événement de dégâts à deux composantes 1d4. Lignes 3/6/7/9/10 persistent en attente sans relance ni acteur inventé. [Guide Poursuites](chases.md).


- **Découvertes et correctifs.** Navigation, profil de mouvement et vitesse effective appliquent le même facteur, Dash inclus. Un KO vivant à 0 PV garde son fournisseur et sa fenêtre ; le vrai décès ferme aussi l’historique, y compris avant une vraie Revivification. Provenance : `lib/navigation.ts`, `lib/movement-modes.ts`, `lib/chase-state.ts`, `mcp-server/chases.ts` et les parcours publics de `tests/dmg-wilderness-chases.test.cjs`. Une autre source d’aveuglement n’est pas effacée.


- **Preuves et limites.** Sol coplanaire réel, route cardinale simple ; [validation commune W32](rules-audit/validation-wave32-2026-11-07.json). Après arrêt, un effet de poussière encore lié au tour d’un vivant exige cette fin de tour avant départ de carte ou d’initiative. Les guides poursuites et multi-cartes sont maintenus ensemble.


- **Suite concrète.** Reprendre une ligne différée avec tous ses prérequis physiques, ou les vrais repos des autres corps, ou les poursuites multiples/séparées ; aucune capacité ou fiche de monstre nouvelle n’est déclarée livrée.


- **R2 — KO avant le prochain tour.** Deux probes publics ont révélé que le slot d’un vivant stabilisé à 0 PV pouvait être sauté avant la fin de sa poussière. Le prédicat passif ciblé garde ce vrai créneau dans l’initiative, sans action ni nouveau dé de poursuite. Les deux régressions publiques PNJ/PJ couvrent SQL avant/après, action refusée et autre cécité préservée. La full r1 a été annulée ; seule la validation complète r2 du rapport ci-dessus peut attester la livraison.


<!-- END:W32-PUBLISHED-DMG-CHASES -->





<!-- BEGIN:W24-PUBLISHED-DMG-CHASES -->


- **Publication W24 — périmètre partiel** : Procédure urbaine DMG2014 explicitement adoptée : vrais corps manuels sur le sol coplanaire représenté de la carte actuelle, initiative et budgets conservés ; une poursuite, un quarry et1–12poursuivants, sans distance abstraite ni déplacement déduit du texte. Chaque vrai Dash commun coûte son action ; seuil signé exact3+modificateur CON sans minimum ajouté, au plus un test de caractéristique CON DD10 par Dash réellement excédentaire à la fin du tour. Tous les tests déjà dus se règlent avant clôture, y compris après épuisement5 ; les séquences non représentables après mort sont refusées avant nouvelle dette. Le vrai d20 de chaque participant affecte le SUIVANT dans l’ordre.11–20 : aucune complication ; les dix lignes1–10 exigent leurs vrais faits, routes et choix imprimés. Leurs terrains, prone, dégâts, pièce choisie, jets tenus, reçus et curseurs survivent à SQL et à un nouveau processus. La vitre3 est un objet réel persistant, transparence choisie et empreinte complète prévalidée, sans traverser corps ou murs. La ligne9 utilise uniquement le corps et la lance réels préqualifiés avant combat, et son événement borné DMG+3/1d6+1 : seuil de20ft réellement parcourus sur le propre tour, portée, vue/couverture, réaction et dé réels. Aucun profil Guard ni attaque générale supplémentaire. Échappée seulement après les vrais tours du round ; vue continue fait échouer sans dé, sinon Discrétion strictement supérieure au plus haut vrai passif. Les participants ne produisent pas d’OA entre eux ; les extérieurs gardent les leurs. Fatigue de poursuite attribuée séparément : récupération DMG certifiée par les vrais repos courts/longs enregistrés du joueur, sans créer repos, soin ou nutrition par attente/formation. Les autres retraits de source restent des décisions MJ explicites distinctes. Le conflit du vrai long repos armuré sous option XGE exige un arbitrage MJ local avant bénéfices. Le défaut de perte/relance des CON sous refus DeathWard est fermé par un préflight conservateur avant le Dash risqué, premier CON ou ressources de reprise. Trois régressions durables prouvent admission avant coût, ancienne dette réellement capturée R7/SQL et jeton PHB conservés, puis reprise après décision MJ distincte sur une autre source ; aucun remboursement/reroll implicite ni arbitrage Ward inventé. Source : DMG2014 Chases8167–8276, table urbaine8228–8241 et Objects7880–7918 ; PHB2014 actions/Dash, initiative, caractéristiques, épuisement, repos et réactions existants ; XGE972–978 seulement pour le conflit d’armure explicitement adopté. Décisions utilisateur du5novembre2026 conservées dans le guide : table urbaine officielle et reprise persistée, arbitrage explicite sans priorité inventée, événement de garde borné et qualifié ; aucune nouvelle capacité MM. Gel initial A :26/26nouveaux et110/110compatibilité ; correctif sur copie commune :3/3nouveaux,26/26poursuites et110/110compatibilité, typesMCP/Next/build0 et sources/binaires liés exactement. Ces captures se recouvrent entre elles et avec la validation commune, sans cumul. Le probeMCP avec seul contexteapp synchronisé et la fixtureR7 sont des captures publiques à provenanceSHA, sans état mécanique inventé.. [Validation commune W24](rules-audit/validation-wave24-2026-11-05.json).


- **Limites / prochain travail concret** : Table wilderness/custom, poursuites multiples/séparées/rôles inversés, transitions de carte, vol/hauteurs/sauts/nage/escalade et contrôleurs PNJ réactifs restent hors tranche ; les géométries inconnues ne sont pas projetées sur un sol fictif. Ces bornes moteur ne sont pas des interdictions RAW. Aucune action hors tour ni activation d’un acteur non courant n’est accordée. Les sorts et ressources d’un wizard ou d’une autre classe restent leurs producteurs publiés et leurs budgets propres : la procédure Chase n’ajoute aucun sort, crédit ou contrôleur. Aucun appel de jeu serveur ne termine automatiquement les événements. Le rôle de garde et sa lance dédiée ne créent ni statbloc Guard, butin, objet joueur, stock ou attaque générale. La vitre ne crée que le verre fragile source déjà représenté ; aucune autre matière ni loot. Les contextes chiens/bagarre/mendiant restent les événements environnementaux imprimés, pas de nouvelles fiches MM. Fatigue des PNJ persistée, mais leurs périodes de repos ne sont pas représentées. La récupération d’un vrai long repos armuré exige la décision locale sur son intervalle actuel ; aucune priorité globale XGE/DMG, repos rétroactif ou réduction automatique des autres sources. CON puis complication est l’ordre explicite de cette tranche ; primitives de concentration synchrones existantes, aucune file générale XGE de fenêtres d’événements simultanés revendiquée. Le préflight Ward ne résout pas l’arbitrage RAW DeathWard/épuisement6 et ne termine pas gratuitement le sort. Il refuse les engagements non représentables avant coût/dé ; une ancienne dette reste conservée jusqu’à un changement de source réellement choisi. Le garde d’introduction d’une nouvelle Ward et le garde d’un ancien CON tenu avec bonus Bardic sont SOURCE-REVUS seulement, sans preuve runtime revendiquée. Le Cleric courant ayant déjà pris ses deux Dash ne dispose pas d’une troisième action ; aucun nouveau contexte ne contourne cette limite. Aucun producteur publié n’a fourni ici une vraie capture Bardic-Ward : le jeton PHB réellement testé donne l’avantage, pas un dé Bardic ni un pending fabriqué. Reprendre ensuite une procédure expressément choisie déjà notée au guide : vraie période de repos d’autres corps, table wilderness avec ses prérequis physiques déjà représentés, ou séparation/poursuites multiples. Les fenêtres générales déjà enregistrées restent un travail distinct ; aucune nouvelle capacité MM ou couverture fictive d’un bonus tenu n’est ajoutée.


- **Preuves et recouvrement** : [chases.md](../output/mcp-dmg-chases-20261105/docs/chases.md), [chases-handoff-final.md](../output/mcp-dmg-chases-20261105/chases-handoff-final.md), [chases-validation-final.json](../output/mcp-dmg-chases-20261105/chases-validation-final.json), [chases-freeze-index-final.json](../output/mcp-dmg-chases-20261105/chases-freeze-index-final.json), [chases-regional-manifest-r4.json](../output/mcp-dmg-chases-20261105/chases-regional-manifest-r4.json), [w24-chases-integrated-source-proof.json](../output/mcp-wave24-integrated-20261105/w24-chases-integrated-source-proof.json), [glass-footprint-source-review-r2.json](../output/mcp-w24-chase-glass-review-20261105/glass-footprint-source-review-r2.json), [chase-ward-source-trace-r1.json](../output/mcp-w24-chase-ward-source-review-20261105/chase-ward-source-trace-r1.json), [chase-ward-review-conclusion-r1.json](../output/mcp-w24-chase-ward-source-review-20261105/chase-ward-review-conclusion-r1.json), [probe-evidence-index.json](../output/mcp-w24-chase-ward-probe-20261105/probe-evidence-index.json), [chase-ward-regressions-index.json](../output/mcp-w24-chase-ward-capture-20261105/chase-ward-regressions-index.json), [wardfix-handoff-final-r1.md](../output/mcp-w24-chase-ward-fix-20261105/wardfix-handoff-final-r1.md), [wardfix-validation-final-r1.json](../output/mcp-w24-chase-ward-fix-20261105/wardfix-validation-final-r1.json), [wardfix-freeze-index-final-r1.json](../output/mcp-w24-chase-ward-fix-20261105/wardfix-freeze-index-final-r1.json), [chases.md](../output/mcp-w24-chase-ward-fix-20261105/docs/chases.md), [w24-wardfix-integrated-source-proof.json](../output/mcp-wave24-integrated-20261105/w24-wardfix-integrated-source-proof.json), [w24-final-source-notices-proof.json](../output/mcp-wave24-integrated-20261105/w24-final-source-notices-proof.json). Nouveaux privés, capture propre au lot : 26/26 ; Régressions Ward du correctif, capture commune distincte et recouvrante : 3/3 ; Ciblés/croisés communs finaux, recouvrants : 151/151. Les validations privées et croisées sont propres à leur capture et recouvrent la validation commune ; aucun cumul artificiel avec la full.


<!-- END:W24-PUBLISHED-DMG-CHASES -->


<!-- BEGIN:W24-DEPENDENCY-HISTORY-DMG-CHASES -->


Historique de préparation, décision ou dépendance W24 : ce contenu conserve exactement son étape et ses limites d’origine, antérieures à la publication vérifiée ci-dessus. Ses formulations « en cours », « non livré » ou « reste à faire » sont historiques.





- **Dépendance ponctuelle W24 — non livrée** : la vraie préparation publique Guard refuse MONSTER_UNKNOWN ; le profil et sa Spear native supposés disponibles ne le sont pas. Provenance : `getMonsterRecord` (`lib/srd/monsters.ts:22`) et test public privé de la ligne urbaine9 (`rules/books/dmg-2014.md:8239`). Décision utilisateur explicite reçue : événement DMG strictement borné sur vrai PNJ/lance explicitement qualifiés, +3/1d6+1 de cette seule table, sans modifier son profil général ou le catalogue MM. Aucun acteur/objet ou butin gratuit.


- **Découverte ciblée W24 avant gel — vitre Large** : le nouveau producteur urbain3 doit vérifier toute son emprise2×2 et ses quatre liaisons internes avant création, pas seulement son origine/trajet. La première fermeture pouvait encore omettre les occupations pendingEncounterActors/guardianOccupied avec grid.free(cell,false) ; la grille physique et la garde explicite du corps affecté sont requises ensemble. Correctif et régressions privés en cours, rien de ce sous-cas n’est encore livré. Provenances : DMG2014 Objects7880–7918/table urbaine8233, mcp-server/chases.ts120–132 et lib/navigation.ts133–139, revue ciblée indépendante C du nouveau producteur. Le raccord optique proposé conserve séparément l’objet émetteur Lumière et les objets explicitement transparents blocksSight=false, sans retirer leurs obstacles physiques.


<!-- END:W24-DEPENDENCY-HISTORY-DMG-CHASES -->





<!-- BEGIN:W24-DECISION-HISTORY-DMG-CHASES -->


Historique de préparation, décision ou dépendance W24 : ce contenu conserve exactement son étape et ses limites d’origine, antérieures à la publication vérifiée ci-dessus. Ses formulations « en cours », « non livré » ou « reste à faire » sont historiques.





- **Décision W24 — implémentation en cours, non livrée** : Utilisateur : table urbaine officielle sur carte réelle et reprise persistée, sans relancer le résultat. Qualifier la conséquence physique par voie publique ; garde source préexistante si un tiers ne peut être préparé pendant le combat. En conflit avec le sommeil en armure XGE, arbitrage explicite avant le vrai repos du joueur, aucune priorité inventée. Récupération PNJ non représentée à ne pas simuler.


- **Complément utilisateur confirmé** : « Oui, événement DMG borné et qualifié » pour la ligne9 ; PNJ/lance réels, aucun nouveau profil MM ni changement de statistiques générales.


<!-- END:W24-DECISION-HISTORY-DMG-CHASES -->





<!-- BEGIN:W24-PREPARATION-HISTORY-DMG-CHASES -->


Historique de préparation, décision ou dépendance W24 : ce contenu conserve exactement son étape et ses limites d’origine, antérieures à la publication vérifiée ci-dessus. Ses formulations « en cours », « non livré » ou « reste à faire » sont historiques.





- **Préparation W24 — non livrée** : Contrat W24 en préparation : DMG2014 local8167 et sous-sections. Poursuite sur positions/initiative réelles, fatigue de Dash, échappée et complications à qualifier ; première tranche bornée à définir avant code, sans ignorer silencieusement les règles non représentées ni ajouter de capacité MM.


<!-- END:W24-PREPARATION-HISTORY-DMG-CHASES -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Chases ; Beginning a Chase ; Running the Chase ; Dashing ; Spells and Attacks ; Ending a Chase ; Escape Factors ; Chase Complications ; Urban Chase Complications ; Wilderness Chase Complications ; Designing Your Own Chase Tables ; Splitting Up ; Mapping the Chase ; Role Reversal.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 14 unités rattachées à ce lot.


- **Dépendances** : [PHB-EXHAUSTION](#phb-exhaustion) ; [MOVEMENT-3D](#movement-3d).


- **Travail restant** : Reprendre ensuite une procédure expressément choisie déjà notée au guide : vraie période de repos d’autres corps, table wilderness avec ses prérequis physiques déjà représentés, ou séparation/poursuites multiples. Les fenêtres générales déjà enregistrées restent un travail distinct ; aucune nouvelle capacité MM ou couverture fictive d’un bonus tenu n’est ajoutée.





### DISEASE-MADNESS





<!-- BEGIN:W31-PUBLISHED-DISEASE-MADNESS -->


- **W31 — Fièvre hilare.** DMG 2014, lignes 8418–8428 et table de folie indéfinie 8685–8700. Qualification réelle humanoïde/gnome, nouveau cas PNJ actuel, incubation unique de 1d4 heures, symptômes avec un niveau d'épuisement protégé, contagion au vrai début de tour à dix pieds d'un porteur en crise et sauvegardes conservées. Les crises, leurs répétitions, le rétablissement au vrai long repos et le trait officiel de folie restent liés à leurs événements d'origine. [Guide Fièvre hilare](cackle-fever.md).


- **Décisions W31.** Crises après incubation, répétition au DD exact de la crise, nouveau stress externe raté redémarrant une minute sans récursion des dégâts propres. Trois échecs cumulés de rétablissement produisent un trait de jeu de rôle persistant, sans action ni condition inventée. La guérison de cette folie attend son sort source actif.


- **Limites et suite concrète.** Hôtes et fenêtres physiques doivent être représentés. Reprendre les batches interrompus, les conséquences hors carte et les véritables repos PNJ dans des tranches distinctes ; les autres folies et leur guérison restent séparées.


- **Choix imprimés et limites supplémentaires.** Les sauvegardes de fin de tour et de rétablissement sont facultatives et exigent un choix explicite de tentative ou de refus, conservé après SQL sans dé ni échec inventé. Un repos avec co-infection active fièvre hilare/peste des égouts est refusé avant temps ou bénéfices, faute de procédure commune de récupération représentée. La validation d’épuisement reconnaît les vrais PNJ existants à profil statistique dans `lib/exhaustion.ts`, sans création ni enrôlement de corps.


<!-- END:W31-PUBLISHED-DISEASE-MADNESS -->





<!-- BEGIN:W25-PUBLISHED-DISEASE-MADNESS -->


- **W25 — Peste des égouts livrée partiellement.** DMG 2014, lignes 8430–8440. Contact explicite du PJ avec une souillure au sol, CON DD 11 et incubation de 1d4 jours. Symptômes, épuisement, soins réduits par dés de vie et zéro PV récupéré au long repos symptomatique. Le moteur applique d’abord la récupération du repos selon la décision utilisateur, puis le jet de maladie. Une réussite guérit si elle ramène elle-même l’épuisement sous 1. La frontière d’incubation est conservée pendant le repos et dans le tick de combat. [Guide Peste des égouts](sewer-plague.md).


- **Suite concrète.** Représenter d’autres hôtes ou modes de transmission, ou implémenter Cackle Fever comme procédure distincte. La folie reste une autre tranche.


<!-- END:W25-PUBLISHED-DISEASE-MADNESS -->





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Diseases ; Sample Diseases ; Cackle Fever ; Sewer Plague ; Madness ; Going Mad ; Madness Effects ; Short-Term Madness ; Long-Term Madness ; Indefinite Madness ; Curing Madness.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 11 unités rattachées à ce lot.


- **Dépendances** : [PHB-EXHAUSTION](#phb-exhaustion) ; [EFFECT-STACKING](#effect-stacking).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.


- **Révalidation ciblée du 31 octobre — prérequis disponible** : l'épuisement et la nutrition W4 sont maintenant réels. Cackle Fever et Sewer Plague ont des sources locales DMG/SRD, mais le catalogue d'afflictions ne comprend toujours que Sight Rot comme maladie. Le manque est donc l'implémentation sourcée incubation/contagion/sauvegardes/rétablissement, non une absence générale de source ou d'épuisement. La folie reste une tranche distincte à effet/durée/guérison persistés. [Preuves et priorités DMG](rules-audit/revalidation-dmg-2026-10-31.md). Ce constat ne marque ni ce lot ni ses autres dépendances livrés.





### NPC-AFFLICTIONS





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Sight Rot.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 1 unités rattachées à ce lot.


- **Dépendances** : [NPC-COMPANIONS](#npc-companions).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### POISONS-PLAYER-USE





- **État courant après publication W18 du 4 novembre** : livré partiellement, noyau cinq outils, contamination nutrition/volumes et récolte réelle désormais publiés avec TypeScript/build 0, 2 337/2 337, mock 30/30 et 275 outils réels. [Rapport W18](rules-audit/validation-wave18-2026-11-04.json). Les passages de préparation ci-dessous restent les preuves historiques des tranches et ne sont plus des blocages de livraison. Mélanges de doses, puissance fractionnée, contamination de points d'eau et autres limites des guides demeurent distincts ; aucun effet non pris en charge n'est déclaré fidèle.





- **Reprise du 4 novembre — publication et raccord nutrition** : le noyau cinq outils et les quatre profils sources sont désormais publiés dans W17 (rapport ci-dessus, 263 outils), toujours sans leurs riders natifs. La cohorte privée W18 conserve récolte/nutrition/vie actuelle et exclut les hooks natifs laissés incomplets à la reprise. Compilation et **19/19 tests ciblés nutrition** en sortie 0 (38 980,048 ms) : 14 mécaniques, deux stdio/SQL et trois nouveaux vrais parcours API. `inspect_poison_nutrition` est documentaire ; `adjudicate_poison_portion` reste une décision MJ auxiliaire avant la véritable action de consommation/transfert. La route transmet les arguments exacts, refuse une deuxième action et conserve l'ingestion déjà débitée pendant la CON/Inspiration entre messages et SQL. Une portion sans décision de dose entière est refusée avant débit/dé, puis la même action peut être résolue après la décision explicite. Fichiers : `tests/dm-poison-nutrition.test.cjs`, `app/api/dm/route.ts`, `lib/dm/prompts.ts`, domaine `poison_nutrition` de `toolkit-support.ts` dans `output/mcp-wave18-integrated-20261104`. Récolte/API vie, riders natifs et sous-eau ne sont pas couverts par ces 19 tests ; validation intégrée encore à faire. Limites de puissance fractionnée/mélanges et contamination des sources conservées dans [poison-nutrition.md](poison-nutrition.md).





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Coordination — noyau, nutrition et récolte W18 publiés.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Poisons ; Contact ; Ingested ; Inhaled ; Injury ; Sample Poisons ; Purchasing Poison ; Crafting and Harvesting Poison.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 9 unités rattachées à ce lot.


- **Dépendances** : [DOWNTIME-ECONOMY](#downtime-economy) ; [PHB-GEAR](#phb-gear), [PHB-POISON-ITEMS](#phb-poison-items).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





- **Relais immédiat après gel Gear — 2 novembre** : A prend un nouveau privé distinct, sources ciblées DMG8451–8631 et14profils déjà présents dans AFFLICTIONS. Doses réellement possédées, quantité entière et masse inconnue tant que non mesurée ; ingestion entière observée, contact sur vrai objet/peau, inhalation vrai cube5ft/corps physiques sans exemption d’apnée, blessure seulement sur vrai dégât tranchant/perforant, source/enduit et lavages conservés. Réutiliser les CON/afflictions, projectiles/fronde, Ready/OA et continuations d’origine. Récolte seulement de vrais corps sources morts/incapacités, durée1d6minutes puis INT Nature20/kit selon source, dose réelle sur succès et vraie exposition si échec5+. Aucun poison, vendeur, ingrédient ou historique n’est inventé.


- **Conventions annoncées avant code** : action d’application et6secondes réelles hors combat sont une adjudication, le DMG ne fixe pas ce temps. Première procédure une dose sur un objet ;1projectile n’est pas déclaré plafond RAW, ni3du Basic Poison transféré implicitement. Répartition entre plusieurs objets : arbitrage MJ explicite et enregistré de quantité/potence/expositions, sans multiplier gratuitement une dose ; consigner toute limite non résolue. Achat/fabrication dépendent de DOWNTIME-ECONOMY encore à réaliser, et ne sont pas clos par cette tranche.





- **Noyau A gelé, relais permanent** : output/mcp-player-poisons-20261102, build/typesMCP+sourcesNext0 (pas app),217cas distincts validés :215/217 initiaux puis reprise59/59 après seuls2codes attendus de frontière respiration corrigés, sans toucher les assertions état/sentinelles.35nouveaux (34directs+1vrai stdio/SQL),5outils inspect/prepare/expose/release_inhaled/wash_player_poison. Préparation/gaz/lavage = vraie actionjoueur ou6s ; exposition = événement physique déjà réel sans action supplémentaire ni feeding gratuit. Wounds/projectiles/fronde/Ready/OA/deuxmains/pièges, CONtenues, immunitécondition distincte des dégâts, vrai lavage/eauquantifiée, PNJcachés/0PV vivants et tours présents couverts dans leurs limites. W17 typecheck complet/build0 et68/68incluant35nouveauxpois verts,3API propres encore en cours. A immédiatement réaffecté catalogue4 puis contamination volumes ; B à récolte. [Guide](player-poisons.md).





- **Catalogue de récolte4 sourcé, gel et nouvelle réaffectation** : quatre fiches étaient présentes dans le MM local mais absentes du catalogue moteur : CarrionCrawler2134, PurpleWorm16274, Wyvern19508, GiantPoisonousSnake21495. Pas de source manquante/internet requis. output/mcp-harvest-creatures-20261102, build/typesMCP+sourcesNext0,63cas (17nouveaux +35pois +11bestiary), chaque corps réel/poisonabilité/stat et refus avant dés/costs testés. Supplément harvest-creatures.ts/json séparé du snapshotAPI31, merge monsters.ts ; riders natifs non implémentés explicitement refusés (poison/paralysie/swallow, Multiattack/auto concernées entières), jamais attaque simplifiée déclarée fidèle. Bitecrawler/wyvern et Clawswyvern ordinaires restent sourcés. [Guide](harvest-creatures.md). B débloqué écrit récolte5outils dans nouveauprivé ; réserve finie observée/adjudication annoncée, borne restante non relevée, pas RAW1dose/corps ni recharge parnonce/temps. A a ensuite été immédiatement réaffecté contamination de vrais aliments/liquides, procédure entière sans prorata ni portion/dose créée ; ces deuxWIP sont hors W17 tant que non gelés.





### XP-ADVANCEMENT





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Experience Points ; Absent Characters ; Noncombat Challenges ; Milestones ; Level Advancement without XP ; Session-Based Advancement ; Story-Based Advancement.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 7 unités rattachées à ce lot.


- **Dépendances** : [CHARACTER-PROGRESSION](#character-progression).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### CREATOR-WORKSHOP





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Creating a Monster ; Modifying a Monster ; Switching Weapons ; Adding a Special Trait ; Creating Quick Monster Stats ; Monster Statistics by Challenge Rating ; Step 1. Expected Challenge Rating ; Step 2. Basic Statistics ; Step 3. Adjust Statistics ; Step 4. Final Challenge Rating ; Experience Points by Challenge Rating ; Creating a Monster Stat Block ; Step 1. Name ; Step 2. Size ; Step 3. Type ; Step 4. Alignment ; Step 5. Ability Scores and Modifiers ; Step 6. Expected Challenge Rating ; Step 7. Armor Class ; Step 8. Hit Points ; Hit Dice by Size ; Step 9. Damage Vulnerabilities, Resistances, and Immunities ; Effective Hit Points Based on Resistances and Immunities ; Step 10. Attack Bonuses ; et 23 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 49 unités rattachées à ce lot.


- **Dépendances** : [MONSTER-CATALOG](#monster-catalog) ; [MAGIC-ITEMS-CATALOG](#magic-items-catalog) ; [PHB-SPELL-CATALOG](#phb-spell-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MONSTER-CATALOG





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Appendix B: Monster Lists ; Monsters by Environment ; Monsters by Challenge Rating.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 3 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### ENVIRONMENT-MAP-IMPORT





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Compléter le résolveur et son état autoritaire pour ce périmètre, avec coûts, refus atomiques et tests.


- **Règles concernées** : Appendix C: Maps.


- **Archive détaillée** : [dmg-2014](rules-audit/dmg-2014.md), [unités JSON](rules-audit/dmg-2014.json) ; 1 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-EFFECT-ORDER





- **État** : À faire. **Priorité** : P1. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : File persistante des effets simultanés, ordre explicitement choisi par le contrôleur, aucune fin de tour MCP fabriquée.


- **Règles concernées** : Combining Different Effects ; Reaction Timing ; Concentration ; Simultaneous Effects.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 4 unités rattachées à ce lot.


- **Dépendances** : `PHB-event-order`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.


- **Révalidation ciblée du 31 octobre — règle générale toujours ouverte** : les débuts/fins de tour, réactions connues et ordre nourriture/eau explicitement arbitré sont des chemins spécifiques, pas une file générale persistée des effets simultanés avec choix du contrôleur. [Matrice Xanathar](rules-audit/revalidation-xge-2026-10-31.md). Préserver les continuations existantes et ne fabriquer aucun appel MCP pour conclure un tour.





### XGE-TEMP-HP





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Réserve de PV temporaires avec choix entre réserves, absorption avant PV, pas de cumul et réactions persistées.


- **Règles concernées** : Temporary Hit Points.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 1 unités rattachées à ce lot.


- **Dépendances** : `PHB-hp-effects`.


- **Intégration courante — W2-TEMP-HP** : Réserve distincte, choix garder/remplacer, absorption après défenses, concentration/dégâts à0PV, durée et repos ; sources de distribution explicites, pas tous les sorts/capacités du catalogue.


- **Avancées vérifiées dans le lot** : Le même moteur de réserve que PHB-TEMP-HP assure non-cumul, choix de remplacement, absorption avant les PV réels et conservation des réactions déjà tenues. La sauvegarde de concentration utilise les dégâts reçus, même lorsqu’ils sont absorbés.


- **Outils effectifs** : `grant_temporary_hp`, `inspect_temporary_hp`.


- **Fichiers** : [lib/temporary-hp-state.ts](../lib/temporary-hp-state.ts), [mcp-server/temporary-hp.ts](../mcp-server/temporary-hp.ts), [mcp-server/tools/temporary-hp-tools.ts](../mcp-server/tools/temporary-hp-tools.ts), [tests/temporary-hp.test.cjs](../tests/temporary-hp.test.cjs), [docs/temporary-hp.md](../docs/temporary-hp.md).


- **Raccords et tests complémentaires** : [mcp-server/monster-rules.ts](../mcp-server/monster-rules.ts), [mcp-server/hero-rules.ts](../mcp-server/hero-rules.ts), [tests/dm-priority-wave2.test.cjs](../tests/dm-priority-wave2.test.cjs).


- **Validation W2** : TypeScript réussi (exit 0), régression finale **999/999 tests**, aucun échec ni test ignoré (exit 0, 459 359,6621 ms). Validation sur l’instantané isolé output/mcp-priority-wave2-20261031, qui précède les raccords W3 et les modes de déplacement en cours ; ces derniers ne sont pas attestés par ce résultat. Les 67 tests ciblés, les 12 scénarios de transport et le précédent playtest mock 30/30 avaient aussi passé. Le playtest final a réussi **30/30 tours, 9 scénarios, 97 appels mock et 0 $** (exit 0) ; listTools a confirmé **117 outils** (exit 0). Preuves et empreintes : [rapport W2](rules-audit/validation-wave2-2026-10-31.json).


- **Reste connu** : Les sources particulières de sorts et capacités ne sont pas accordées par cette infrastructure. Leurs coûts et déclencheurs restent à implémenter dans leurs lots dédiés ; aucune option n’est adoptée implicitement.


- **Prochaine étape concrète** : Réutiliser la réserve livrée pour les capacités particulières de Xanathar lorsque leur source et leur catalogue actif sont disponibles, sans octroi gratuit.





### XGE-SLEEP


<!-- BEGIN:W21-PUBLISHED-XGE-SLEEP -->


- **Publication W21 — sommeil naturel et choix XGE explicites** : XGE962–984, socle PHB5495–5509 conservé par défaut. Sept outils `configure_sleep_rules`, `begin_natural_sleep`, `end_natural_sleep`, `shake_natural_sleeper`, `report_sleep_noise`, `resolve_sleep_deprivation`, `inspect_sleep`, domaine `sleep`. Sources naturelles distinctes : vrais dégâts reçus, y compris absorbés par PV temporaires, réveillent ; zéro après immunité ne réveille pas. Une vraie secousse paie une action du bon acteur et applique le déclencheur chimique déjà modélisé autorisant cette action (Ether/Drow, pas Taggit), sans neutraliser poisoned ; le bruit ne retire que le naturel. Perception auditive, source, silence et seuils sont qualifiés explicitement. Armure et privation exigent une adoption structurée antérieure à l’intervalle ; aucune activation par chargement. Toute portion medium/heavy adoptée conserve son vrai objet et limite au quart des DV dépensés, minimum un plafonné au dépensé, sans réduction d’épuisement. Privation OFF par absence, ancre présente, CON10 puis +5 par24h, coûts/résultats tenus et reçus anti-rejeu conservés. Vrai long repos admissible terminé explicitement à la frontière24h avant CON ; repos seulement commencé ne l’efface pas. Nutrition simultanée : premier résolveur explicitement choisi, autre événement toujours dû, jet tenu à finir d’abord ; aucune file générale XGE ni appel serveur fabriqué. [Guide](xge-sleep.md), [repos](rest-lifecycle.md), [validation W21](rules-audit/validation-wave21-2026-11-04.json).


- **Corrections prouvées / limites / prochain travail concret** : champs d’adoption liés à leur commande originale et compteur aux seules périodes réellement résolues, sans désactivation/réadoption effaçant la dette. Checkpoint de repos canonique sur les mêmes valeurs SQL ; ancien brut seulement s’il reste prouvé, jamais effacé/rebasé. Mort/0PV clôt le bookkeeping naturel sans soin ni prétendu réveil. Profil joueur SRD requis ; direct reactive_npc et nouveau branchement npc_action de réveil reportés faute de témoin authored/SRD réel. Contact/chuchotement coplanaires à hauteurs connues ; noncoplanaire, source sonore nonacteur et acoustique intérieure Swallow non représentés refusent avant coût. Le double avalement réel prouve que partager la projection du ver ne donne pas une distance intérieure. Suite : contrôleur authored/SRD compatible ou géométrie réellement représentée avec son contrat, sans inventer acteur, sort ou capacité MM.


<!-- END:W21-PUBLISHED-XGE-SLEEP -->








- **Historique W21 avant publication** : A reprend les passages XGE962–984 dans output/mcp-xge-sleep-20261104, après report explicite de Tunneler. Préparation source 5/5 ; raccords publics en construction. Politiques optionnelles explicites avant intervalle, privation OFF par absence ; fournisseurs naturels séparés, seuils auditifs sourcés, véritables portions de sommeil en armure et quart des HD dépensés. Adoption, échéances, états tenus et reçus restent persistants sans reprise du passé. Résultats complets/API/SQL avant intégration.





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Étendre take_rest : sommeil naturel, réveil bruit/contact/dégâts, récupération en armure et option privation avec échéances persistées.


- **Règles concernées** : Sleep ; Waking Someone ; Sleeping in Armor ; Going without a Long Rest.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 4 unités rattachées à ce lot.


- **Dépendances** : [PHB-EXHAUSTION](#phb-exhaustion) ; `PHB-time-ledger`.


- **Prochaine étape concrète** : Conserver les refus des anciens profils, PNJ réactifs et géométries non représentées ; reprendre un raccord authored/SRD ou physique concret quand son contrat est choisi. Aucun changement implicite de politique adoptée.


- **Révalidation ciblée du 31 octobre — frontière avec W4** : la récupération alimentaire et l'épuisement existent ; ils n'implémentent pas le sommeil naturel, le réveil par bruit/contact/dégâts, les conséquences de l'armure pendant le sommeil ou la privation de repos. wake_sleeping_creature vise le sommeil de poison de sprite et ne couvre pas à lui seul ces règles. [Source et preuves Xanathar](rules-audit/revalidation-xge-2026-10-31.md). La nutrition n'achève donc pas ce lot par transitivité.





### XGE-FALLING





<!-- BEGIN:W22-PUBLISHED-XGE-FALLING -->


- **Publication W22 — périmètre partiel** : Cinq outils configure_falling_rules, begin_xge_fall, resolve_xge_fall_descent, arrest_xge_fall et inspect_xge_falling ; domaine xge_falling. Deux choix structurés indépendants, OFF par défaut, adoptés avant leur cause : cadence de chute500 et option des créatures volantes. Seul un vrai corps natif W20 déjà effectivement en vol et privé de maintien peut démarrer le curseur livré, avec support inférieur réel, même XY et colonne entière qualifiée. Première tranche instantanée au plus500pieds, suivantes seulement aux fins des vrais tours ultérieurs de ce corps ; une cause pendant le tour d’autrui compte sa première prochaine occurrence propre, même dans le même round. La descente déclarée ferme ensuite actions/mouvement, puis next_turn/pass_turn demeure un choix distinct de l’agent. Réduction de distance avant impact par vraie vitesse de vol actuelle et redressement admissible à moitié de cette vitesse depuis le budget partagé, sans donner d’action ou de vitesse. Un seul propriétaire physique Z, containment prioritaire. Impact unique via le pipeline existant de dégâts/défenses/PV temporaires/concentration, plafond source20d6 et vraies règles0PV/pétrification conservés. Source : XGE 944–960 (empreinte 519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf), PHB 2014 Falling 5360 et Flying Movement 5731–5733 ; anciens corps natifs W20 uniquement, aucun pouvoir/profil MM nouveau. [Validation commune W22](rules-audit/validation-wave22-2026-11-04.json).


- **Limites / prochain travail concret** : Curseur initial validé uniquement pour vol natif W20 réel. Pas de départ arbitraire par initialZFeet, saut, escalade/natation, vol météo, nouveau vol joueur/magique ou profil MM. Aucun témoin positif de ces départs exclus. Les anciens compléteurs et resolve_fall restent gardés avant mutation/dé ; générique et natif sont testés en runtime, gardes saut/locomotion vérifiées au code seulement dans ce lot. actual-jump.ts et weather-flight.ts sont restaurés octet-exact W21 et exclus du paquet A. Choix utilisateur : chute de plus de500pieds hors vrais tours refusée avant la première descente, tout coût ou dé. Le MJ peut choisir explicitement enter_combat ou un start_encounter admissible : exception d’entrée seulement pour le vrai fall-due natif exact sous cadence500 déjà adoptée avant la cause, sans déplacement d’entrée ni contournement des autres dettes/gardes. La provenance préinitiative conservée compte correctement la première fin propre ultérieure même si le corps ouvre l’initiative au compteur0. Première adoption tardive sur une chute déjà physiquement déclenchée refusée. Aucun combat, appel MCP, tour ou500pieds/6secondes fabriqué. Un cadavre engagé garde seulement son créneau de descente physique, convention bornée de représentation : aucun droit d’action, nouvelle sauvegarde, soin ou relance d’initiative. run_monster_turns/next_turn retournent l’événement explicite avant une action/recharge, sans le résoudre automatiquement. Cadavre arrivé au support : aucun dé/dégât de créature ; éventuels dégâts d’objet non résolus. Vivant0PV : vraie sauvegarde explicitement résolue une seule fois. Colonne fixe, supports/corps réellement mesurés et dangers décisifs préflightés avant chaque tranche. Changement réel de géométrie persistant pouvant rendre la reprise refusée si la colonne d’origine est devenue inexécutable ; aucune redirection automatique livrée. Pas de collisions universelles entre créatures ni de nouvelle prise en charge Feather Fall. Un avalé dérive XYZ de son hôte sans exposition extérieure, air ou dégâts autonomes inventés. Le croisement commun calendrier/chute native est passé dans la cohorte61/61 : inspect_campaign_calendar conserve intégralement état, curseur, horloge et échéance, y compris SQL/nouveau processus ; seules les vraies résolutions et frontières de tours font avancer leur propre procédure. C ne reçoit ni tireur PNJ ni vol/chute joueur de A, ses rayons objet restant bornés à la géométrie coplanaire qualifiée. Choisir séparément un adaptateur de départ physique supplémentaire ou une vraie procédure de collision/redirection sur contrat explicite ; ne pas ouvrir ces cas par altitude ou curseur injectés.


- **Preuves et recouvrement** : `output/mcp-xge-falling-20261104/xge-falling-handoff-final.md`, `output/mcp-xge-falling-20261104/xge-falling-validation-sealed.json`, `output/mcp-xge-falling-20261104/xge-falling-sealed-tests.log`, `output/mcp-xge-falling-20261104/xge-falling-mock-sealed.json`, `output/mcp-w22-falling-review-20261104/falling-final-limits-fragment.md`, `output/mcp-w22-falling-review-20261104/falling-final-artifact-index.json`, `output/mcp-wave22-integrated-20261104/w22-targeted-final.log`. fallingPrivate : 82/82; finalTargeted : 61/61. Les cohortes propres au lot sont incluses ou recouvrent la validation commune ; aucun cumul artificiel avec la full.


<!-- END:W22-PUBLISHED-XGE-FALLING -->


- **Gel et fusion W22 — chute native, non publiée** : A fige32fichiers/82opérations,21modifiés+11nouveaux,1539binaires privés et310outils uniques. TypesMCP/Next/build0,82/82finaux (22nouveaux+60anciens,54 910,5329ms), mock30/30 neuf scénarios/71appels/0USD (34 047ms). Le parent vérifie exhaustivement les1010entrées de base et tous les nouveaux fichiers puis applique les32fichiers sur Calendar+Adamantine avec ancres gardées. Reprise horscombat fermée : refus avant première descente, puis enter_combat explicitement choisi et seul fall-due natif éligible ; provenance préinitiative garantit première vraie fin propre même au compteur0, sans déplacement à l’entrée ni autre dette contournée. Départs de curseur natifs W20 seulement ; autres modes refusés, pas de nouveau pouvoirMM. Les annonces93/78/79 sont historiques et recouvrantes ;82sealed est la preuve privée finale. Types/ciblés/croisements/full/mock communs restent nécessaires. Handoff : `output/mcp-xge-falling-20261104/xge-falling-handoff-final.md`.





- **Chronologie d’adoption W22 — nouveau diagnostic avant gel** : `configure_falling_rules` acceptait une première adoption après un vrai `apply_condition(prone)` sur un natif à100pieds, faute de curseur déjà créé. `xge-falling-policy-late-before.log` prouve une acceptation avant correctif, pas une validation. La première adoption consulte désormais la chute physique déjà due (`nativeFlightFallIssue`) ; elle refuse avant coût, la vraie chute précédente doit finir sous PHB, puis l’adoption ne porte que sur le futur. La régression finale vérifie l’ancien impact100pieds/10d6 et sa conservation SQL/rejeu. Paquet final régénéré avant fusion parent.





- **Clôture W22 en cours — défauts nouveaux ciblés, non publiée** : le premier contrôle de fin de tour marquait une dernière descente avant son impact ; la garde lit désormais uniquement les reçus effectivement commis. Un vrai décès après la première descente puis SQL/nouveau processus a aussi révélé un second filtre post-effets qui retirait encore le corps de l’ordre ; les filtres de reprise round/météo/nutrition conservent seulement son créneau de descente physique, sans droit d’action ni nouvelle sauvegarde. Les témoins publics 0PV avec vrai death save, pétrification/SQL, refus des anciens accès, observation de support et fin de combat sont en clôture. L’agent annonce93/93 runtime avant une dernière correction de forme TypeScript du retour startCombat ; émission propre, types complets et ciblés finaux restent nécessaires. Les départs highfall jump/loco sans témoin ne sont pas revendiqués. Provenance : agent A, journaux `output/mcp-xge-falling-20261104/xge-falling-cohort-r2.log` et cohortes suivantes ; ce ne sont pas des preuves de la full commune.





- **Historique de préparation W22, antérieur à la publication** : A prépare dans `output/mcp-xge-falling-20261104` les options XGE944–960, chacune désactivée par défaut et adoptée explicitement. Cadence 500 pieds initiale puis fin des tours ultérieurs, vraies altitudes, vitesse de vol actuelle, reprise et demi-vitesse pour redressement seront reliées aux mécanismes existants avant validation. Aucun nouveau pouvoir MM.





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Chute/altitude avec dégâts et plafond source ; adoption séparée des options500pieds et réduction par vitesse de vol.


- **Règles concernées** : Falling ; Rate of Falling ; Flying Creatures and Falling.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 3 unités rattachées à ce lot.


- **Dépendances** : [PHB-VERTICAL-MOVEMENT](#phb-vertical-movement).


- **Travail restant** : Choisir séparément un adaptateur de départ physique supplémentaire ou une vraie procédure de collision/redirection sur contrat explicite ; ne pas ouvrir ces cas par altitude ou curseur injectés.





### XGE-ADAMANTINE





<!-- BEGIN:W22-PUBLISHED-XGE-ADAMANTINE -->


- **Publication W22 — périmètre partiel** : Trois outils prepare_adamantine_stock, prepare_phb_launcher_stock et inspect_adamantine, domaine adamantine. Stock initial réellement possédé par un marchand capable, version déjà fabriquée d’une arme de mêlée ou lot entier de dix projectiles ; offre source et paiement réel exigés, aucune transformation gratuite d’un objet possédé. Vrai coup au but contre un objet seulement devient critique avec l’arme ou le projectile matériel exact ; d20, dés source, portée/longue portée, Loading, mains, ligne de vue/couverture, météo/eau et budgets restent effectifs. Aucun critique automatique sur une créature ou coup garanti. Le métal reste attaché aux unités réelles pendant tir, fronde, déchargement, récupération et custody, sans diffusion au lanceur ni restauration d’une dose de poison. Les témoins API/SQL passent dans de nouveaux processus ; ItemSchema conserve le tag et les reçus d’achat sont de vrais snapshots immuables, non les quantités vivantes ensuite tirées. Source : XGE986–992, supplément de500po par arme de mêlée ou dix munitions, et profils/prix/masse PHB2014 ; empreinte XGE519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf. [Validation commune W22](rules-audit/validation-wave22-2026-11-04.json).


- **Limites / prochain travail concret** : Rayons d’attaque contre objet actuellement connus, coplanaires, dans une même salle/carte. Origine réellement surélevée, aérienne ou non résolue refusée avant munition, d20 et action ; aucun objetZ, point anatomique, rayon3D arbitraire ou tir inter-salles inventé. Le joueur réel observé sur support20pieds refuse atomiquement ; cela ne constitue pas un curseur de chute ou vol natif inventé pour ce joueur. Le matériau ne donne ni magie, touche automatique, contournement d’immunité, nouveaux dégâts personnalisés, critique de créature ni nouveau pouvoir/statbloc MM. Les dés tenus et l’Inspiration originelle restent ceux du vrai jet. Transformation/fabrication/service de revêtement d’un équipement ordinaire déjà possédé reportés par choix utilisateur. Pas de prime individuelle de50po par munition, prix de lot partiel, split/merge de vente, achat-retour depuis custody ou argent initial de marchand ; dénominations et temps de remise réellement choisis, aucune masse déduite du prix. La masse imprimée–de la fronde reste inconnue, pas zéro. Revente limitée à l’instance intacte ou lot originel entier inchangé, à la moitié de sa valeur source complète, sur vraie offre/acheteur/réserve finie. Les anciennes opérations silvering et Basic Poison qui scindent une pile refusent ces instances avant dose/paiement/action/temps ; les procédures compatibles à identité unique restent distinctes. Histoire terminée conservée ; liens réellement actifs ne sont pas purgés par transfert. Choisir séparément une éventuelle transformation/service ou géométrie physique supplémentaire sur nouveau contrat explicite ; ne pas attribuer le matériau ou un prix partiel par fait narratif.


- **Preuves et recouvrement** : `output/mcp-xge-adamantine-20261104/ADAMANTINE-HANDOFF-20261104.md`, `output/mcp-xge-adamantine-20261104/adamantine-checks.json`, `output/mcp-xge-adamantine-20261104/adamantine-freeze-proof.json`, `output/mcp-xge-adamantine-20261104/adamantine-source-manifest.json`, `output/mcp-w22-calendar-adamantine-witness-r2-20261104/ca-witness-handoff.json`, `output/mcp-w22-calendar-adamantine-witness-r2-20261104/ca-integrity-after-r2.json`, `output/mcp-w22-calendar-adamantine-witness-20261104/ca-integrity-after-r1.json`. calendarAdamantineIntegrated : 36/36; independentPublicLauncher : 1/1; independentObjectHeight : 1/1; finalTargeted : 61/61. Les cohortes propres au lot sont incluses ou recouvrent la validation commune ; aucun cumul artificiel avec la full.


<!-- END:W22-PUBLISHED-XGE-ADAMANTINE -->


- **Avancée W22 vérifiée — commerce fusionné, non publié** : gel C44fichiers/93régions (28existants,16nouveaux),1026entrées et1555binaires stables ; types MCP/Next0, build0,23/23nouveaux (39 012,0606ms),216/216voisins (81 018,3691ms), mock30/30 neuf scénarios/71appels/0USD (24 298ms), log+exit et résumé dérivé explicitement distingués d’un rapport natif. Trois nouveaux outils : `prepare_adamantine_stock`, `prepare_phb_launcher_stock`, `inspect_adamantine`, domaine `adamantine`. Le parent compare exhaustivement les44changements, applique le paquet gardé et vérifie les44sorties attendues, dont7mixtes préservant Calendar. Assemblage Calendar+C : typesMCP/Next0, build0 et36/36tests propres (48 830,4612ms), cohortes recouvrantes. Le témoin de hauteur indépendant passe1/1 ; celui d’achat API ferme une hypothèse erronée de bourseinitiale dans son harnais, sans modifier de fonds. A, croisements finaux, full/mock communs et publication restent à fermer. [Handoff](../output/mcp-xge-adamantine-20261104/ADAMANTINE-HANDOFF-20261104.md).





- **Clôture SQL W22 — défauts réels nouveaux, non publiée** : la restauration publique possède un second ItemSchema dans `player-tools.ts`, qui supprimait le témoin de matière ; il est raccordé au même état réel. Le parcours achat de dix flèches → tir → SQL a aussi exposé un alias de référence dans `purchaseTradeOffer` : `offer.result.items` partageait les objets d’inventaire, donc le tir réécrivait la quantité du reçu d’achat et provoquait `MERCHANT_STATE_MISMATCH`. Le transfert doit désormais stocker un instantané profond du reçu, sans réécrire les anciens reçus. Source/provenance : agent C, vrais outils stdio/SQL et `merchant-trade.ts` ; types MCP/Next r5 privés verts, ciblés après correction et gel commun encore requis.





- **Historique de préparation W22, antérieur à la publication** : C prépare dans `output/mcp-xge-adamantine-20261104` XGE986–992 : instance/munition réellement faite ou revêtue, critique seulement sur un vrai coup au but contre objet, surcharge 500 po par arme de mêlée ou dix projectiles. Pas de dégâts personnalisés ni de métal attribué à des instances voisines ; lots partiels et prix non sourcés refusés tant que leur contrat n’est pas établi.





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Matériau réel arme/munition, critique sur coup au but contre objet, coût source ; pas de customDamageDice de substitution.


- **Règles concernées** : Adamantine Weapons.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 1 unités rattachées à ce lot.


- **Dépendances** : [PHB-GEAR](#phb-gear).


- **Travail restant** : Choisir séparément une éventuelle transformation/service ou géométrie physique supplémentaire sur nouveau contrat explicite ; ne pas attribuer le matériau ou un prix partiel par fait narratif.





### XGE-KNOTS





<!-- BEGIN:W23-PUBLISHED-XGE-KNOTS -->


- **Publication W23 — périmètre partiel** : Option explicitement adoptée avant la tentative, désactivée par absence. configure_knot_rules, tie_knot, resolve_knot et inspect_knots utilisent le vrai joueur : INT(Escamotage) pour nouer et dénouer, DEX(Acrobaties) pour sortir de sa boucle qualifiée. Le total final du premier jet est le DD exact, avec maîtrise/expertise et dés tenus réels, sans override public général. La même corde PHB réellement achetée passe dans une seule custody de nœud : boucle permise sur le joueur ou corde seule au sol. Masse, identité, carte, tentatives et coûts survivent aux voyages réels et à SQL. Glisser laisse le nœud intact au sol choisi ; dénouer restitue la même corde. Aucun état, malus de mains/déplacement ni liberté contre une autre source n’est automatiquement accordé. Décision utilisateur conservée : durée réelle choisie par le MJ hors combat, une action improvisée explicitement choisie dans cette tranche en combat. Prévalidation de source, mains, destination, géométrie et temps avant dés/coûts. Le fait permanent qualifiant un jet tenu est protégé avant remplacement/suppression/éviction ; les faits sans lien et les historiques achevés restent modifiables. Source : Xanathar Tying Knots, fichier local994–1000 ; PHB2014 compétences/aptitude différente4943–4947 et cordes4226–4227/4319–4321. Empreintes et passages dans la provenance du gel. Le livre ne fixe ni durée ni action pour ces manipulations.. [Validation commune W23](rules-audit/validation-wave23-2026-11-05.json).


- **Limites / prochain travail concret** : Jets du joueur seulement ; pas de ligotage hostile, autre corps, charge, suspension, condition entravé automatique ou géométrie intérieure/élevée inventée. Aucune qualification par simple nom de la corde narrative ancienne ; ni division/assemblage de corde, ni dégâts/rupture de l’objet. Les 2 PV et le DD de rupture imprimés restent documentaires. Bornes moteur conservatrices : 256 nœuds, 1024 tentatives, 2048 reçus ; pas de réécriture/annulation/requalification générale d’un contexte tenu devenu différent. Ajouter une procédure sourcée de dégâts/rupture sur cette instance physique de corde, avec véritable cible objet et conservation de custody ; distinguer cette destruction du dénouage et de la sortie de boucle.


- **Preuves et recouvrement** : [knots-handoff-final.md](../output/mcp-xge-knots-20261105/knots-handoff-final.md), [knots-validation-sealed.json](../output/mcp-xge-knots-20261105/knots-validation-sealed.json), [knots-source-provenance.json](../output/mcp-xge-knots-20261105/knots-source-provenance.json), [w23-knots-integrated-source-proof.json](../output/mcp-wave23-integrated-20261105/w23-knots-integrated-source-proof.json). . Les validations privées et croisées sont propres à leur capture et recouvrent la validation commune ; aucun cumul artificiel avec la full.


<!-- END:W23-PUBLISHED-XGE-KNOTS -->


<!-- BEGIN:W23-PREPARATION-HISTORY-XGE-KNOTS -->


Ces notes sont historiques et antérieures à la publication W23 vérifiée ci-dessus ; leurs indications temporelles décrivent uniquement leur étape d’origine.





- **Historique de préparation W23 — non livrée** : source ciblée `rules/books/xge.md:994–1000`, avec corde PHB réelle et acquisition marchande si nécessaire. Décision utilisateur : coût en temps/action explicitement choisi par le MJ, aucun état « entravé » automatique. Le total INT(Escamotage) sera le DD exact, sans conversion à DEX ni DD minimal inventé ; dénouage INT(Escamotage), sortie DEX(Acrobaties).


<!-- END:W23-PREPARATION-HISTORY-XGE-KNOTS -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Après adoption, persister DD du nœud INT(Escamotage), dénouage INT(Escamotage) et évasion DEX(Acrobaties), vraie corde.


- **Règles concernées** : Tying Knots.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 1 unités rattachées à ce lot.


- **Dépendances** : [PHB-CHECK-MODES](#phb-check-modes).


- **Travail restant** : Ajouter une procédure sourcée de dégâts/rupture sur cette instance physique de corde, avec véritable cible objet et conservation de custody ; distinguer cette destruction du dénouage et de la sortie de boucle.





### XGE-TOOL-DETAILS





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Obtenir fiches officielles absentes ; distinguer usages narratifs et effets métier, sans fabriquer/soigner/réparer sur simple jet générique.


- **Règles concernées** : Tool Proficiencies ; Tools and Skills Together ; Added Benefit ; Tool Descriptions ; Components ; Skills ; Special Use ; Sample DCs ; Tools List ; Homebrew: Tool Uses — exemples d'utilisation inventés.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 10 unités rattachées à ce lot.


- **Dépendances** : `SOURCE-XGE-TOOLS`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-SPELL-PERCEPTION





<!-- BEGIN:W23-PUBLISHED-XGE-SPELL-PERCEPTION -->


- **Publication W23 — périmètre partiel** : Clarification Perceiving a Caster at Work raccordée aux producteurs réels cast_spell, cast_creature_spell, Ready, incantations longues, baguettes et parchemins pris en charge. spellObservers choisit explicitement les corps et canaux ; inspect_spellcasting_perception lit leur instantané initial. Cette clarification n’exige pas d’adoption optionnelle ; absence de suivi ne signifie pas incantation imperceptible. Composantes réellement requises V/S/M, mains, focus/sacoche, sens et géométrie sont vérifiés avant coûts. La vue observateur ne révèle ni nom/niveau du sort, cible cachée, coordonnées, phase actuelle ou réussite future. Audibilité verbale seule ne donne aucune identité de voix ; attribution visuelle seulement si la source a réellement été vue. Les traces initiales survivent aux interruptions, à la préparation puis au relâchement de Ready et aux reprises SQL, sans deuxième incantation ou paiement. Elles ne réservent pas à vie l’équipement ordinaire. Le chemin Contresort explicitement suivi du joueur demande perception réelle et source visuelle qualifiée. Source : Xanathar local1087–1093 ; procédures effectives PHB/DMG2014 de composantes, incantations et exemptions d’objets déjà intégrées. L’identification officielle local1095+ manque : le remplacement est explicitement maison, et la source officielle consultée n’a pas fourni le texte. Aucun DD10 maison n’est implémenté comme RAW.. [Validation commune W23](rules-audit/validation-wave23-2026-11-05.json).


- **Limites / prochain travail concret** : Identification officielle non implémentée, en attente de texte primaire accessible et d’une adoption distincte de cette option. Première tranche de corps externes coplanaires connus à Z0 ; géométrie élevée, intérieur, audition non qualifiée et détail par sens non visuel refusés avant coûts. Aucun rayon d’ouïe ou nouveau sens/capacité de monstre. Le chemin hérité de Contresort sans observateur joueur explicitement capturé conserve sa limite de visibilité seule. Propres incantations Contresort/Bouclier et autres wrappers sans spellObservers non instrumentés ; aucun observateur hérité automatiquement. Les premiers essais Light sont historiques et ne certifient pas ses cibles/effets ; les preuves matérielles finales utilisent Mage Armor préparé avec cible explicite et vraie sacoche. Obtenir la fiche officielle d’identification ; instrumenter séparément les incantations de réaction déjà prises en charge et leur perception, puis traiter les sens/géométries supplémentaires avec qualifications propres.


- **Preuves et recouvrement** : [spell-perception-handoff-final.md](../output/mcp-xge-spell-perception-20261105/spell-perception-handoff-final.md), [spell-perception-freeze-proof.json](../output/mcp-xge-spell-perception-20261105/spell-perception-freeze-proof.json), [spell-perception-final-validation.json](../output/mcp-xge-spell-perception-20261105/spell-perception-final-validation.json), [candidate-perception-27-source-proof.json](../output/mcp-w23-perception-integration-review-20261105/candidate-perception-27-source-proof.json), [world-facts-nullish-parent-fix-review-20261105.json](../output/mcp-w23-perception-integration-review-20261105/world-facts-nullish-parent-fix-review-20261105.json). . Les validations privées et croisées sont propres à leur capture et recouvrent la validation commune ; aucun cumul artificiel avec la full.


<!-- END:W23-PUBLISHED-XGE-SPELL-PERCEPTION -->


<!-- BEGIN:W23-PREPARATION-HISTORY-XGE-SPELL-PERCEPTION -->


Ces notes sont historiques et antérieures à la publication W23 vérifiée ci-dessus ; leurs indications temporelles décrivent uniquement leur étape d’origine.





- **Historique de préparation W23 — non livrée** : première tranche limitée à `Perceiving a Caster at Work`, `rules/books/xge.md:1087–1093`, raccordée aux incantations effectives et à leurs composantes réellement requises. Identification officielle absente de l’export local (1095–1107, remplacement explicitement maison) et non obtenue auprès de la source officielle consultée : ce sous-périmètre reste bloqué source ; aucun DD10 maison présenté comme RAW.


<!-- END:W23-PREPARATION-HISTORY-XGE-SPELL-PERCEPTION -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Perception de composantes et attribution du lanceur ; Identify a Spell maison uniquement après adoption, réaction atomique distincte de Contresort.


- **Règles concernées** : Spellcasting ; Perceiving a Caster at Work ; Identifying a Spell ; Homebrew: Identify a Spell — identifier un sort.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 4 unités rattachées à ce lot.


- **Dépendances** : [PHB-CASTING-COMPONENTS](#phb-casting-components) ; `PHB-event-order`.


- **Travail restant** : Obtenir la fiche officielle d’identification ; instrumenter séparément les incantations de réaction déjà prises en charge et leur perception, puis traiter les sens/géométries supplémentaires avec qualifications propres.





### XGE-INVALID-TARGET





<!-- BEGIN:W33-PUBLISHED-XGE-INVALID-TARGET -->


- **W33 — Charme-personne, tranche préparée.** XGE 1109–1113. `cast_spell` accepte une adoption MJ par lancement de niveau 1 et un eventId exact ; coûts normaux, résultat apparent commun à une vraie WIS réussie et à un mauvais type réel, sans faux jet ou raison d’invalidité. Défaut strict conservé ; cible absente/non représentée refusée avant coût. R4 corrige le legacy sans dmTools, ancien gel/probe préservés. [Guide](xge-invalid-spell-targets.md).


- **Preuves privées et limite.** 6 scénarios publics, cohorte 50 verte, SQL/rejeu réels ; autres sorts/upcast/Ready/items/scrolls reportés. [Rapport commun W33 à produire](rules-audit/validation-wave33-2026-11-07.json).


- **Suite concrète.** Sélectionner explicitement la prochaine famille de sorts ou voie de lancement avant d’étendre l’option.


<!-- END:W33-PUBLISHED-XGE-INVALID-TARGET -->





- **État** : Livré partiellement. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Décider adoption de la variante : cible invalide dépense le slot et reste confidentielle. Prévalidation stricte actuelle est un choix différent, pas un bug à changer sans décision.


- **Règles concernées** : Invalid Spell Targets.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 1 unités rattachées à ce lot.


- **Dépendances** : `POLICY-optional-rules`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-AOE-OPTIONS





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Choisir/enregistrer méthode gabarit OU jetons et tester toute forme ; ne pas confondre avec géométrie actuelle de centres.


- **Règles concernées** : Areas of Effect on a Grid ; Template Method ; Making a Template ; Using a Template ; Token Method ; Using Tokens ; Circles ; Cones ; Lines.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 9 unités rattachées à ce lot.


- **Dépendances** : `POLICY-optional-rules`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-ENCOUNTER





<!-- BEGIN:W36-PUBLISHED-XGE-ENCOUNTER -->


- **W36.** Xanathar 1257–1259 : les profils publiés de FP inférieur à la plus petite colonne du vrai palier disposent du ratio distinct 1:12, avec provenance propre. Aucune colonne imprimée, cellule vide, classe, acteur, XP ou capacité de monstre inventée. Référence confidentielle de planification, sans effet, sélection ou garantie de difficulté. Les blancs, FP supérieurs hors table et profils inconnus restent indéterminés ou refusés. [Guide](xge-encounter.md).


<!-- END:W36-PUBLISHED-XGE-ENCOUNTER -->





<!-- BEGIN:W26-PUBLISHED-XGE-ENCOUNTER -->


- **W26 — Avis de rencontre livré partiellement.** Xanathar, lignes 1207–1255. La ligne des quatre tables Multiple Monsters est lue pour le niveau réel du personnage. Le MJ choisit les groupes à évaluer. L'outil donne leurs fractions exactes et laisse le total indéterminé si un FP manque. La lecture documentaire conserve l'état de la session. [Guide Rencontres](xge-encounter.md).


- **Suite concrète.** Traiter les monstres faibles hors colonnes et les groupes de plusieurs personnages seulement avec leurs entrées réelles. La table de légendaire demande quatre à six personnages.


<!-- END:W26-PUBLISHED-XGE-ENCOUNTER -->





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : evaluate_encounter : participants, niveaux/FP réels, ratios et table source. Ne pas extrapoler silencieusement les tables4–6PJ à la session solo.


- **Règles concernées** : Encounter Building ; Step 1: Assess the Characters ; Step 2: Choose Encounter Size ; Step 3: Determine Numbers and Challenge Ratings ; Solo Monster Challenge Rating ; Multiple Monsters: 1st-5th Level ; Multiple Monsters: 6th-10th Level ; Multiple Monsters: 11th-15th Level ; Multiple Monsters: 16th-20th Level ; Weak Monsters and High-Level Characters ; Step 4: Select Monsters ; Terrain and Traps ; Quick Matchups.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 14 unités rattachées à ce lot.


- **Dépendances** : `PHB-party-scope` ; [MM-CATALOG](#mm-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-RANDOM-ENCOUNTERS





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Obtenir tables absentes par environnement/palier, tirage préparatoire puis activation explicite de monstres réellement supportés.


- **Règles concernées** : Random Encounters: A World of Possibilities ; Flight, or Fight, or..?.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 2 unités rattachées à ce lot.


- **Dépendances** : `SOURCE-XGE-ENCOUNTERS` ; [XGE-ENCOUNTER](#xge-encounter).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-SIMPLE-TRAPS





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Étendre create_trap/interact_trap : herse, explosion de feu, filet, lame, sommeil des âges ; compléter taille, perception passive, contournements et victimes.


- **Règles concernées** : Traps Revisited ; Simple Traps ; Elements of a Simple Trap ; Level and Threat ; Trigger ; Effect ; Countermeasures ; Running a Simple Trap ; Making Traps Meaningful ; Example Simple Traps ; Bear Trap ; Crossbow Trap ; Falling Portcullis ; Fiery Blast Trap ; Net Trap ; Pit Trap ; Poison Needle Trap ; Scything Blade Trap ; Sleep of Ages Trap ; Designing Simple Traps ; Purpose ; Alarm ; Delay ; Restrain ; et 9 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 60 unités rattachées à ce lot.


- **Dépendances** : [PHB-VERTICAL-MOVEMENT](#phb-vertical-movement) ; [PHB-EXHAUSTION](#phb-exhaustion).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-COMPLEX-TRAPS





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Compléter sphère (impacts, dissipation des runes, insertion initiative), ajouter Voie des lames et Tempête empoisonnée avec modèles propres.


- **Règles concernées** : Complex Traps ; Describing a Complex Trap ; Level and Threat ; Trigger ; Initiative ; Active Elements ; Dynamic Elements ; Constant Elements ; Countermeasures ; Running a Complex Trap ; Experience for Complex Traps ; Complex Trap Experience Awards ; Example Complex Traps ; Path of Blades ; Whirling Blades (Initiative 20) ; Crushing Pillars (Initiative 10) ; Rune of Fear (Initiative 10) ; Blades Accelerate ; Rune's Defense ; Whirling Blades ; Rune of Fear ; Crushing Pillars ; Poisoned Tempest ; Locked Doors (Initiative 20) ; et 21 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 67 unités rattachées à ce lot.


- **Dépendances** : `PHB-event-order` ; [PHB-VERTICAL-MOVEMENT](#phb-vertical-movement) ; [OBJECT-DAMAGE](#object-damage).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-DOWNTIME-LEDGER





<!-- BEGIN:W23-PUBLISHED-XGE-DOWNTIME-LEDGER -->


- **Publication W23 — périmètre partiel** : Fondation persistante limitée à la véritable activité Work : adopt_xge_downtime, start_downtime_work, work_downtime et inspect_xge_downtime conservent emploi, employeur existant, lieu, outil réel, segments de temps et décisions explicites. Les cinq journées distinctes de huit heures sont effectivement parcourues via l’horloge moteur, avec progression discontinue et reprise SQL dès le premier stade. Les intersections physiques des segments partagent le budget représenté avec artisanat/formation dans les deux sens. Aucun ancien calendarDay n’est réécrit ; époque moteur fixe0 et journées de86400secondes indépendantes des libellés du calendrier. Les gardes de repos, nutrition, respiration et événements dus restent applicables. Les faits d’emploi permanents non liés à un objet sont protégés pendant le projet actif, ainsi que le choix de complication pendant son jet tenu. Cela n’empêche ni modification d’un autre fait ni purge physique/mortalité. Les résultats, coûts, complications et reçus restent uniques. Source : Xanathar Downtime Revisited1910–1995, dont activités et résolution1977–1995 ; Work2495–2522. PHB2014 et DMG2014 Between Adventures pour les procédures existantes et le train de vie.. [Validation commune W23](rules-audit/validation-wave23-2026-11-05.json).


- **Limites / prochain travail concret** : Work uniquement ; aucun framework universel d’activités/rivaux ni automatisation de plans de rival. Budget partagé représenté de huit heures, un emploi ouvert, 64 projets, 1024 segments, 4096 reçus et 16 décisions/complications : limites moteur annoncées, pas maxima RAW universels. Pas de travail à distance ni de journée reconstruite depuis une date affichée. Projet retardé au-delà de dix dates suivies soumis à arbitrage explicite, prolongation bornée à365dates. Réutiliser cette fondation pour le lot XGE-DOWNTIME-TRAINING, avec contrat d’activité, coûts, durée, choix de formation et complications propres, sans remplacer silencieusement la formation PHB existante.


- **Preuves et recouvrement** : [DOWNTIME-WORK-HANDOFF-FINAL-20261105.md](../output/mcp-xge-downtime-20261105/DOWNTIME-WORK-HANDOFF-FINAL-20261105.md), [downtime-work-handoff.json](../output/mcp-xge-downtime-20261105/downtime-work-handoff.json), [downtime-final-integrity.json](../output/mcp-xge-downtime-20261105/downtime-final-integrity.json), [w23-work-integrated-source-proof.json](../output/mcp-wave23-integrated-20261105/w23-work-integrated-source-proof.json). . Les validations privées et croisées sont propres à leur capture et recouvrent la validation commune ; aucun cumul artificiel avec la full.


<!-- END:W23-PUBLISHED-XGE-DOWNTIME-LEDGER -->


<!-- BEGIN:W23-WORK-MERGE-HISTORY-XGE-DOWNTIME-LEDGER -->


Ces notes sont historiques et antérieures à la publication W23 vérifiée ci-dessus ; leurs indications temporelles décrivent uniquement leur étape d’origine.





- **Historique de validation avant publication W23 — non publiée** : gel Work R2 immuable, 20/20 nouveaux tests privés (17 moteur/SQL et 3 POST), types MCP/Next et build MCP sortie 0. Les 19 fichiers du payload sont fusionnés dans la copie commune et vérifiés octet pour octet avant les autres gels. Le ciblé privé antérieur 40/40 recouvre 19 nouveaux cas et 21 compatibilités : ne pas additionner les cohortes. Horloge physique, droits non monétaires et arbitrages restent bornés au guide `xge-downtime-work.md`. Validation commune finale/full/mock et publication encore à faire.


<!-- END:W23-WORK-MERGE-HISTORY-XGE-DOWNTIME-LEDGER -->





<!-- BEGIN:W23-PREPARATION-HISTORY-XGE-DOWNTIME-LEDGER -->


Ces notes sont historiques et antérieures à la publication W23 vérifiée ci-dessus ; leurs indications temporelles décrivent uniquement leur étape d’origine.





- **Historique de préparation W23 — non livrée** : source ciblée Xanathar1910–1916/1977–1995 ; première activité réelle Work, efforts de huit heures sur cinq jours distincts, discontinue et persistée, sans double crédit ni remise à zéro de l’horloge/repos/nutrition. Décision utilisateur : couvrir dès W23 les arbitrages MJ explicites lorsque le projet dépasse deux fois sa durée normale.


<!-- END:W23-PREPARATION-HISTORY-XGE-DOWNTIME-LEDGER -->





- **État** : Livré partiellement. **Priorité** : P1. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Projets persistés : jours8h, workweeks5jours, coûts, progression discontinue, complications et rival établi ; reçus uniques, pas de récompense avant résolution.


- **Règles concernées** : Downtime Revisited ; Rivals ; Creating a Rival ; Rival ; Goals ; Assets ; Plans ; Downtime Activities ; Resolving Activities ; Complications ; Example Downtime Activities.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 11 unités rattachées à ce lot.


- **Dépendances** : `PHB-time-ledger` ; `currency-wallet`.


- **Travail restant** : Réutiliser cette fondation pour le lot XGE-DOWNTIME-TRAINING, avec contrat d’activité, coûts, durée, choix de formation et complications propres, sans remplacer silencieusement la formation PHB existante.





### XGE-DOWNTIME-MARKET





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Recherche vendeur/acheteur, stocks/offres/prix et transferts atomiques ; chercher, accepter et acheter/vendre restent distincts.


- **Règles concernées** : Buying a Magic Item ; Resources ; Resolution ; Buying Magic Items ; Magic Item Price ; Complications ; Magic Item Purchase Complications ; Selling a Magic Item ; Magic Item Base Prices ; Magic Item Offer ; Magic Item Sale Complications.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 14 unités rattachées à ce lot.


- **Dépendances** : [XGE-DOWNTIME-LEDGER](#xge-downtime-ledger) ; [MAGIC-ITEMS-CATALOG](#magic-items-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-DOWNTIME-CRAFT





<!-- BEGIN:W32-PUBLISHED-XGE-DOWNTIME-CRAFT -->


- **W32 — Potions de soins supérieurs et suprêmes.** Xanathar 1987–1989, 1991–1995 et 2208–2217. Quatre outils génériques de démarrage, travail, arbitrage et abandon conservent les recettes majeures existantes. Quinze / vingt dates réelles de huit heures et 1 000 / 10 000 po produisent une dose physique unique ; ramassage et consommation restent explicites, avec les profils officiels SRD 2014 déjà publiés 8d4+8 / 10d4+20. Les fiches détaillées manquent dans la transcription DMG fournie, sans profil inventé. [Guide Brassage](xge-healing-potion-brewing.md).


- **Décisions W32.** Paiement total initial, abandon sans remboursement automatique ; après trente / quarante dates, vraie complication supplémentaire, échéance finie et suppléments cumulés plafonnés au coût initial de la recette. Les anciens projets majeurs restent à leur plafond de 100 po et conservent leurs reçus sans champ par défaut ajouté.


- **Preuves et limites.** Vrais efforts, fournitures, objets, soins, SQL, rejeux et ancien moteur W31 couverts ; [validation commune W32](rules-audit/validation-wave32-2026-11-07.json). Blocs continus, site initial, un projet inachevé et bornes techniques du guide demeurent.


- **Suite concrète.** Formules, ingrédients et coopération de fabrication magique générique dans une tranche propre ; ne pas déduire une recette ni une matière depuis un fait narratif.


<!-- END:W32-PUBLISHED-XGE-DOWNTIME-CRAFT -->





<!-- BEGIN:W31-PUBLISHED-XGE-DOWNTIME-CRAFT -->


- **W31 — Arbitrage du retard de la potion majeure.** Xanathar, lignes 1989 et 1991–1995. `adjudicate_xge_greater_healing_delay` conserve un vrai projet inachevé déjà hors délai, une décision et une complication réellement introduites au site d'origine, une échéance finie et les pièces réellement payées. L'arbitrage ne crée ni journée, ni temps écoulé, ni potion. Les vrais efforts reprennent ensuite jusqu'à la cinquième journée. [Guide Brassage](xge-healing-potion-brewing.md).


- **Décision W31.** Suppléments discrétionnaires de zéro à 100 po cumulées pour toute la vie du projet, soit 200 po au total maximum ; aucun nouveau doublement implicite en cas de retard répété. L'absence de conséquence mécanique non résolue est explicitement attestée, sans événement ou PNJ fabriqué par le moteur.


- **Suite concrète.** Représenter les potions supérieures et suprêmes, leurs vrais efforts, puis les autres fabrications avec formules et ingrédients réels.


<!-- END:W31-PUBLISHED-XGE-DOWNTIME-CRAFT -->





<!-- BEGIN:W30-PUBLISHED-XGE-DOWNTIME-CRAFT -->


- **W30 — Potion de soins majeurs.** Xanathar, lignes 1983–1989 et 2208–2217. Un projet conserve l'achat initial de 100 po de fournitures, la vraie trousse maîtrisée et cinq journées distinctes de huit heures au même lieu mesuré. Le registre partagé refuse le réemploi d'une journée ou des fournitures. La cinquième journée produit une seule potion physique avec le profil de soins majeurs déjà publié. Les identifiants réservés, les coûts, les efforts, l'abandon et la consommation survivent à SQL. [Guide Brassage](xge-healing-potion-brewing.md).


- **Décision utilisateur W30.** Paiement initial et abandon sans remboursement automatique. Au-delà de dix dates depuis le premier effort, le projet reste en attente d'un futur arbitrage explicite avant nouvel effort.


- **Suite concrète.** Implémenter l'arbitrage de retard, les potions supérieures et suprêmes, puis les autres fabrications avec leurs formules et ingrédients réels.


<!-- END:W30-PUBLISHED-XGE-DOWNTIME-CRAFT -->





<!-- BEGIN:W27-PUBLISHED-XGE-DOWNTIME-CRAFT -->


- **W27 — Potion de soins normale.** Xanathar, lignes 2208–2217. Maîtrise de l’herboristerie, trousse possédée, lot de fournitures attesté, paiement exact de 25 po et huit heures sur une date du registre partagé. La dose apparaît au lieu de travail puis suit les outils de ramassage et d’utilisation existants. Les contrôles incluent un changement de jour, la reprise SQL et un vrai franchissement de recharge sans aube durant le brassage. La première copie refusait une reprise après un nouveau jour, puis une reprise après réutilisation de l’identifiant d’une potion consommée. Les deux scénarios passent sur le candidat publié. [Guide Brassage](xge-healing-potion-brewing.md).


- **Suite concrète.** Représenter les semaines des potions supérieures et leurs profils, puis les formules et ingrédients des autres objets magiques.


<!-- END:W27-PUBLISHED-XGE-DOWNTIME-CRAFT -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Fabrication avec matériaux/maîtrises/temps réels ; formules/exotique/coopération pour magie ; potion de soins selon table spéciale.


- **Règles concernées** : Crafting an Item ; Resources and Resolution ; Crafting Magic Items ; Magic Item Ingredients ; Magic Item Crafting Time and Cost ; Complications ; Crafting Complications ; Brewing Potions of Healing ; Potion of Healing Creation.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 9 unités rattachées à ce lot.


- **Dépendances** : [XGE-DOWNTIME-LEDGER](#xge-downtime-ledger) ; [PHB-GEAR](#phb-gear) ; [MAGIC-ITEMS-CATALOG](#magic-items-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-DOWNTIME-SCROLL





<!-- BEGIN:W35-PUBLISHED-XGE-DOWNTIME-SCROLL -->


- **W35.** XGE1987–1989 et2406–2415 : les ressources communes du niveau2 sont mutualisées, trois dates de huit heures et250po, avec la convention utilisateur de paiement initial, abandon et dépassement déjà choisie pour ce niveau. Seule Pas brumeux demeure admise ; aucun nouveau sort, objet, outil, reçu ou migration. Les prérequis, composants et résolveurs de chaque futur sort restent distincts. Hold Person sans résolveur actif et branches objet/inorganique de Shatter restent hors périmètre. [Guide](xge-spell-scroll-scribing.md).


<!-- END:W35-PUBLISHED-XGE-DOWNTIME-SCROLL -->





<!-- BEGIN:W34-PUBLISHED-XGE-DOWNTIME-SCROLL -->


- **W34.** XGE1987–1989 et2402–2435, DMG2014 5827–5847 : quatre outils représentent un vrai projet de Pas brumeux, Arcanes/sort/fournitures réels,250po au démarrage, trois dates8h au site initial, puis parchemin physique ramassé/utilisé séparément. Au-delà de six dates : complication réelle, échéance finie et suppléments cumulés<=250po, sans remboursement automatique. Aucun V/S de lancement pendant l’écriture ni jet de semaine pour trois jours. Autres sorts, composants coûteux/consommés et complications de semaine complète restent à intégrer. [Guide](xge-spell-scroll-scribing.md).


<!-- END:W34-PUBLISHED-XGE-DOWNTIME-SCROLL -->





<!-- BEGIN:W28-PUBLISHED-XGE-DOWNTIME-SCROLL -->


- **W28 — Transcription de parchemins.** Xanathar, lignes 1983–1988 et 2402–2435. Rayon de givre coûte 15 po et son parchemin produit l’effet d’un lanceur de niveau 1. Projectile magique et Armure du mage coûtent 25 po. Le personnage doit maîtriser les Arcanes, connaître ou avoir préparé le sort, fournir ses composants et consacrer huit heures mesurées. Le résultat physique utilise le registre existant. Le croisement vérifie la recharge, le refus d’un second bloc de travail sur la même date et la non-réutilisation des fournitures après reprise SQL. [Guide Transcription](xge-spell-scroll-scribing.md).


- **Suite concrète.** Représenter les sorts et composants spécifiques supplémentaires, les travaux de plusieurs jours et les complications par semaine complète.


<!-- END:W28-PUBLISHED-XGE-DOWNTIME-SCROLL -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : scribe_spell_scroll : Arcanes maîtrisé, sort connu/préparé, composantes, coût et durée sources. Création MJ et copie vers grimoire ne couvrent pas cette activité.


- **Règles concernées** : Scribing a Spell Scroll ; Resources ; Spell Scroll Costs ; Complications ; Scribe a Scroll Complications.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 5 unités rattachées à ce lot.


- **Dépendances** : [XGE-DOWNTIME-LEDGER](#xge-downtime-ledger) ; `spell-scrolls`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-DOWNTIME-RESEARCH





<!-- BEGIN:W25-PUBLISHED-XGE-DOWNTIME-RESEARCH -->


- **W25 — Recherche livrée partiellement.** Xanathar, lignes 2365–2400 et 1910–1995. Adoption explicite, accès local qualifié, cinq dates de huit heures dans le registre partagé et dépenses réelles à partir de 50 po. Le vrai test d’INT conserve son jet et le résultat de complication. Après résolution, le MJ choisit les assertions gagnées d’un profil déjà publié. [Guide Recherche](xge-research.md).


- **Suite concrète.** Représenter une autorité de révélation pour les vérités sur lieux, personnes et objets. Raccorder les arbitrages de retard et les conséquences des complications à des faits et événements réels.


<!-- END:W25-PUBLISHED-XGE-DOWNTIME-RESEARCH -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Temps/coût/INT réels et bibliothèque ; révéler seulement des faits autorés éligibles, pas inventer vérité/mot de passe de quête.


- **Règles concernées** : Research ; Resources ; Resolution ; Research Outcomes ; Complications ; Research Complications.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 6 unités rattachées à ce lot.


- **Dépendances** : [XGE-DOWNTIME-LEDGER](#xge-downtime-ledger) ; `quest-discovery-boundary`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-DOWNTIME-TRAINING





<!-- BEGIN:W24-PUBLISHED-XGE-DOWNTIME-TRAINING -->


- **Publication W24 — périmètre partiel** : Alternative XGE explicitement adoptée, neuf outils publics et registre persistant dès le premier accord SQL : une langue ou maîtrise d’outil canonique inconnue, avec instructeur réellement établi/qualifié/volontaire, matériel réel et acquisition finale après tous prérequis. PHB250jours reste distinct par défaut. Dix semaines moins le modificateur positif d’INT, cinq dates réelles de huit heures par semaine,25po en pièces choisies avant le premier effort de chaque bloc. INT initiale conservée, prépaiement sans prorata/remboursement implicite et refus de durée nonpositive sont des conventions explicitement approuvées utilisateur puis MJ, pas du RAW caché. Budget physique partagé Work/craft/PHBtraining ; calendrier, attente et paiement ne donnent pas d’effort. Chance10pourcent toutes les cinquante dates d’instruction XGE globales, table/MJ et conséquences originales séparées ; recherche réelle de cinq dates après disparition, nouveau professeur qualifié et historique des frais conservés. Vrais POST, SQL et nouveaux processus :19/19nouveaux,41/41compat, typesMCP/Next0/buildMCP0 privés. Parent19fichiers/24régions et revue7fichiers communs avec Lumière ; ces cohortes ne s’additionnent pas à la full commune. Source : Xanathar’s Guide to Everything, source locale rules/books/xge.md : Downtime Revisited1910–1995 et Training2476–2493, sectionxge:233 ; empreinte retenue dès l’adoption. PHB2014 : langues2866–2907, outils4373et suivantes, temps mort/formation5525–5572. Le parcours PHB250jours à1po/jour reste distinct et inchangé par défaut.. [Validation commune W24](rules-audit/validation-wave24-2026-11-05.json).


- **Limites / prochain travail concret** : Un cours XGE inachevé même en pause, reprise du même sujet sous son IDoriginal, aucune conversion PHB. Budget8h/date : limite de tranche, pas maximum RAW universel. Géométrie, appui, portée, qualification, horloge/repos/nutrition/respiration sont vérifiés avant le prochain effort/coût. Aucun professeur, kit, argent, niveau/classe/identité, nourriture/soin/repos créé ; pas de prorata, remboursement ou transfert automatique des pièces entre enseignants. Le remplaçant accepte explicitement le reliquat prépayé ; seuls les prochains frais lui sont versés. Disparition du service d’enseignement explicitement qualifiée, sans PNJ déplacé/caché/créé ; cinq dates réelles de recherche sans instruction, frais pédagogiques ni compteur de complication, puis un autre professeur réellement qualifié. Les autres conséquences et rivaux sont des décisions/faits réels, sans attitude/quête/effet automatique ni jet pédagogique/Inspiration de table. Arbitrages de retard bornés, faits et frais discrétionnaires payables explicitement choisis, zéro permis ; aucun doublement RAW ou dette pour simple validation administrative tardive. Bornes64cours/8192événements-reçus/4096segments/32accords-décisions/128transitions/échéance365dates : refus avant mutation sans effacer l’histoire. Compléter, sur un cas physique réellement établi aujourd’hui refusé, les modalités d’enseignement hors appui représenté et les interruptions hors bornes conservatrices, en conservant le cours, les frais et les efforts originaux ; garder la formation PHB et les autres activités XGE séparées.


- **Preuves et recouvrement** : [XGE-TRAINING-HANDOFF-FINAL-20261105.json](../output/mcp-xge-training-20261105/XGE-TRAINING-HANDOFF-FINAL-20261105.json), [XGE-TRAINING-HANDOFF-FINAL-20261105.md](../output/mcp-xge-training-20261105/XGE-TRAINING-HANDOFF-FINAL-20261105.md), [xge-training-source-proof.json](../output/mcp-xge-training-20261105/xge-training-source-proof.json), [xge-training.md](../output/mcp-xge-training-20261105/docs/xge-training.md), [xge-training-final-exhaustiveness.json](../output/mcp-xge-training-20261105/xge-training-final-exhaustiveness.json), [w24-training-integrated-source-proof.json](../output/mcp-wave24-integrated-20261105/w24-training-integrated-source-proof.json), [w24-light-training-regional-review.json](../output/mcp-wave24-integrated-20261105/w24-light-training-regional-review.json). Nouveaux privés, capture propre au lot : 19/19 ; Ciblés/croisés communs finaux, recouvrants : 151/151. Les validations privées et croisées sont propres à leur capture et recouvrent la validation commune ; aucun cumul artificiel avec la full.


<!-- END:W24-PUBLISHED-XGE-DOWNTIME-TRAINING -->


<!-- BEGIN:W24-DECISION-HISTORY-XGE-DOWNTIME-TRAINING -->


Historique de préparation, décision ou dépendance W24 : ce contenu conserve exactement son étape et ses limites d’origine, antérieures à la publication vérifiée ci-dessus. Ses formulations « en cours », « non livré » ou « reste à faire » sont historiques.





- **Décision W24 — implémentation en cours, non livrée** : Utilisateur : durée fixée avec INT réelle initiale, paiement25po au premier effort de chaque bloc5jours, sans prorata/remboursement automatique ; refus avant coût si durée calculée nulle/négative. Conventions MJ explicites, pas règles imprimées inventées ; semaine de recherche d’instructeur réellement parcourue sans frais d’enseignement automatiques.


<!-- END:W24-DECISION-HISTORY-XGE-DOWNTIME-TRAINING -->





<!-- BEGIN:W24-PREPARATION-HISTORY-XGE-DOWNTIME-TRAINING -->


Historique de préparation, décision ou dépendance W24 : ce contenu conserve exactement son étape et ses limites d’origine, antérieures à la publication vérifiée ci-dessus. Ses formulations « en cours », « non livré » ou « reste à faire » sont historiques.





- **Préparation W24 — non livrée** : Contrat W24 en préparation : Xanathar2476–2493 et fondation1910–1995 ; formation réelle langue/outil avec instructeur, coûts, temps, complications et acquisition finale, sans remplacer la formation PHB par défaut ni créditer d’effort passé.


<!-- END:W24-PREPARATION-HISTORY-XGE-DOWNTIME-TRAINING -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Instructeur, langue/outil, durée réduite par INT, coût ; maîtrise acquise à achèvement sans changer identité de session.


- **Règles concernées** : Training ; Resources ; Complications ; Training Complications.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 4 unités rattachées à ce lot.


- **Dépendances** : [XGE-DOWNTIME-LEDGER](#xge-downtime-ledger) ; [PHB-PROGRESSION](#phb-progression).


- **Travail restant** : Compléter, sur un cas physique réellement établi aujourd’hui refusé, les modalités d’enseignement hors appui représenté et les interruptions hors bornes conservatrices, en conservant le cours, les frais et les efforts originaux ; garder la formation PHB et les autres activités XGE séparées.





### XGE-DOWNTIME-WORK





<!-- BEGIN:W23-PUBLISHED-XGE-DOWNTIME-WORK -->


- **Publication W23 — périmètre partiel** : resolve_downtime_work emploie le vrai test choisi dans les cinq modes source : STR Athlétisme, DEX Acrobaties, INT outil possédé, CHA Représentation ou CHA instrument possédé. Dé tenu/Inspiration, chance de complication10% par semaine et choix distinct d’une ligne ou d’un d6 sont conservés avant tout gain. adjudicate_downtime_work couvre les choix utilisateur : chaque réduction sous le bas du tableau demande sa décision MJ liée à la complication ; retard exige nouvelle échéance, complication supplémentaire et pièces de coût discrétionnaire explicitement choisies, éventuellement zéro. Aucun plancher, tarif imprimé ou doublement automatique inventé. settle_downtime_work attribue une seule fois le résultat final : droit non monétaire daté sur sept jours, sans équivalent en espèces, et25po uniquement pour la catégorie finale correspondante. Dénominations reçues exactes et charge de monnaie projetée vérifiées avant crédit. Aucun repas, eau, soin, repos ou remboursement rétroactif automatique. Les complications conservent faits et acteurs déjà établis, sans créer PNJ, attitude ou rival. La réputation de paresse désavantage les six prochaines semaines Work représentées, pas sa semaine source ; la septième n’est plus affectée. L’annulation n’efface pas les efforts, dépenses ou complications. Source : Xanathar Work/Wages/Complications2495–2522 ; PHB2014 Lifestyle Expenses4540–4573/5511–5529 et DMG2014 Between Adventures4981–4987. Décisions utilisateur du5novembre : droit daté7jours et arbitrages explicites dèsW23.. [Validation commune W23](rules-audit/validation-wave23-2026-11-05.json).


- **Limites / prochain travail concret** : Le droit de train de vie est enregistré ; sa consommation dans les dépenses futures reste à intégrer. Aucune conversion en nourriture/objets/argent équivalent. Annulation après effort réel sous réputation de paresse, y compris projet source avec complication supplémentaire6, refusée avant mutation : comptabilité générale des abandons partiels non représentée. Employeur, lieu et outils réels requis ; aucun nouveau revenu ou résultat depuis un jet générique, une prose ou un remplacement d’état. Raccorder la consommation future du droit daté à des dépenses/services effectivement fournis, sans réécrire les dettes passées ; étendre ensuite les abandons partiels sous réputation avec un décompte d’effort réellement consacré.


- **Preuves et recouvrement** : [DOWNTIME-WORK-HANDOFF-FINAL-20261105.md](../output/mcp-xge-downtime-20261105/DOWNTIME-WORK-HANDOFF-FINAL-20261105.md), [downtime-work-handoff.json](../output/mcp-xge-downtime-20261105/downtime-work-handoff.json), [downtime-final-integrity.json](../output/mcp-xge-downtime-20261105/downtime-final-integrity.json), [w23-work-integrated-source-proof.json](../output/mcp-wave23-integrated-20261105/w23-work-integrated-source-proof.json). . Les validations privées et croisées sont propres à leur capture et recouvrent la validation commune ; aucun cumul artificiel avec la full.


<!-- END:W23-PUBLISHED-XGE-DOWNTIME-WORK -->


<!-- BEGIN:W23-WORK-MERGE-HISTORY-XGE-DOWNTIME-WORK -->


Ces notes sont historiques et antérieures à la publication W23 vérifiée ci-dessus ; leurs indications temporelles décrivent uniquement leur étape d’origine.





- **Historique de validation avant publication W23 — non publiée** : gel Work R2 immuable, 20/20 nouveaux tests privés (17 moteur/SQL et 3 POST), types MCP/Next et build MCP sortie 0. Les 19 fichiers du payload sont fusionnés dans la copie commune et vérifiés octet pour octet avant les autres gels. Le ciblé privé antérieur 40/40 recouvre 19 nouveaux cas et 21 compatibilités : ne pas additionner les cohortes. Horloge physique, droits non monétaires et arbitrages restent bornés au guide `xge-downtime-work.md`. Validation commune finale/full/mock et publication encore à faire.


<!-- END:W23-WORK-MERGE-HISTORY-XGE-DOWNTIME-WORK -->





<!-- BEGIN:W23-PREPARATION-HISTORY-XGE-DOWNTIME-WORK -->


Ces notes sont historiques et antérieures à la publication W23 vérifiée ci-dessus ; leurs indications temporelles décrivent uniquement leur étape d’origine.





- **Historique de préparation W23 — non livrée** : source ciblée Xanathar2495–2522, PHB2014 Lifestyle Expenses et DMG2014 Between Adventures. Décisions utilisateur : droit non monétaire daté sur sept jours, sans argent équivalent ni nourriture/soins/remboursement rétroactifs automatiques ; couvrir dès W23 par décision explicite MJ la baisse d’un résultat déjà « pauvre ». Aucun gain avant résolution unique et traitement des complications ; aucun plancher ou tarif inventé implicitement.


<!-- END:W23-PREPARATION-HISTORY-XGE-DOWNTIME-WORK -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Salaire source et train de vie, choix réel de test/outil ; un jet générique ou un paiement ne crée pas de revenu.


- **Règles concernées** : Work ; Resources ; Resolution ; Wages ; Complications ; Work Complications.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 6 unités rattachées à ce lot.


- **Dépendances** : [XGE-DOWNTIME-LEDGER](#xge-downtime-ledger) ; [PHB-ECONOMY](#phb-economy).


- **Travail restant** : Raccorder la consommation future du droit daté à des dépenses/services effectivement fournis, sans réécrire les dettes passées ; étendre ensuite les abandons partiels sous réputation avec un décompte d’effort réellement consacré.





### XGE-DOWNTIME-SOCIAL





<!-- BEGIN:W35-PUBLISHED-XGE-DOWNTIME-SOCIAL -->


- **W35.** XGE2086 et2088–2096 : renew_xge_carousing_contact lie un nouveau gain allié non affecté/non spécifié d’une vraie semaine ultérieure à une seule nouvelle promesse d’un allié nommé consommé, même personne, classe initiale/actuelle et zone. Convention utilisateur distincte du texte imprimé ; anciens reçus immuables. Les cinq efforts suivent causalement l’aide consommée, avec égalité de worldTime permise sans seconde artificielle. Une nouvelle aide réelle distincte confirmée reste nécessaire ; aucune attitude, aide, information, dépense ou durée automatique. Renouvellement hostile et changements de classe/zone restent ouverts. [Guide](xge-carousing.md).


<!-- END:W35-PUBLISHED-XGE-DOWNTIME-SOCIAL -->





<!-- BEGIN:W34-PUBLISHED-XGE-DOWNTIME-SOCIAL -->


- **W34.** XGE2059–2137 et1987–1989 : sept outils Carousing qualifient lieu/hôte/milieu social/accessibilité réels, cinq dates8h,10/50/250po entiers au premier effort. Vrai CHA(Persuasion), tout total<=5 hostile selon décision utilisateur ; résultats conservés en attente d’affectation si plafond plein. Seuls les alliés non spécifiés sont globalement plafonnés1+CHA(min1), les nommés/hostiles hors plafond. Vrais PNJ, classe et lien raisonnable sont explicitement qualifiés ; consommation après aide/obstacle réellement établi, sans effet ni attitude automatique. Complications d8 documentaires ; retards, renouvellement nommé, accès noble/déguisement et variations de cap non représentées restent bornés ou reportés. [Guide](xge-carousing.md).


<!-- END:W34-PUBLISHED-XGE-DOWNTIME-SOCIAL -->





<!-- BEGIN:W33-PUBLISHED-XGE-DOWNTIME-SOCIAL -->


- **W33 — Service religieux au temple, tranche préparée.** XGE 1987–1989 et 2333–2363. Cinq dates réelles 8 h, test choisi Religion/Persuasion, faveurs 0/1/2 sous plafond global réel et demande/acceptation explicites avant consommation d’une promesse. Complications documentaires, sans secret ou effet automatique. Convention utilisateur : total<=10, y compris 0/négatif, donne zéro faveur avec vrai jet/complication. [Guide](xge-religious-service.md).


- **Preuves privées et limite.** 9 tests =6 publics+3 compléments contrôlés (réserve 1, INT basse 2), cohorte 84 verte ; ces compléments ne prouvent ni octroi public de réserve ni producteur de baisse d’INT. Temple seulement, remise de sort/prosélytisme et retard à compléter. [Rapport commun W33 à produire](rules-audit/validation-wave33-2026-11-07.json).


- **Suite concrète.** Arbitrage réel du retard, parcours de prosélytisme ou producteur physique de service clérical et tarif explicite.


<!-- END:W33-PUBLISHED-XGE-DOWNTIME-SOCIAL -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Carousing/service religieux : contacts/faveurs autorés et complications ; empathie/confiance existantes ne sont pas ces récompenses.


- **Règles concernées** : Carousing ; Resources ; Resolution ; Complications ; Lower-Class Carousing Complications ; Middle-Class Carousing Complications ; Upper-Class Carousing Complications ; Religious Service ; Religious Service Complications.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 14 unités rattachées à ce lot.


- **Dépendances** : [XGE-DOWNTIME-LEDGER](#xge-downtime-ledger) ; `social-state`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-DOWNTIME-RISK





<!-- BEGIN:W32-PUBLISHED-XGE-DOWNTIME-RISK -->


- **W32 — Combats de fosse.** Xanathar 1987 et 2292–2321. Six outils conservent le vrai lieu, son promoteur et les participants qualifiés, cinq dates de huit heures, trois DD distincts 5+2d10, FOR(Athlétisme), DEX(Acrobaties) et CON avec le plus grand dé de vie réel sans le dépenser. Les prix 0/50/100/200 po sont reçus une fois en vraies pièces ; complication 10 % et exemple d6 restent documentaires. Aucune blessure, dette, personne ou attitude ne vient du libellé. [Guide Fosse](xge-pit-fighting.md).


- **Décision W32.** Une arme réellement tenue peut remplacer un des deux tests de compétence ; 1 naturel échoue, 20 naturel réussit et les vraies caractéristiques de l’arme s’appliquent, sans dégâts, cible physique ou dépense de munition. Filets, lances et armes improvisées restent refusés avant dé dans cette tranche.


- **Preuves et limites.** Vrais POST, SQL, réactions tenues, DD et bonus de dé de vie conservés ; [validation commune W32](rules-audit/validation-wave32-2026-11-07.json). Profils mono-classe représentés seulement, cinq dates dans une fenêtre technique de dix dates et arbitrage futur en cas de retard.


- **Suite concrète.** Arbitrage du retard et conséquences de complications réellement jouées, puis crime dans une tranche séparée ; les combats à mort restent le combat normal.


- **Périmètre des preuves.** Les neuf tests nouveaux comprennent sept parcours publics et deux compléments contrôlés de réserve bardique ; ces derniers ne prétendent pas démontrer l’octroi public de cette réserve.


<!-- END:W32-PUBLISHED-XGE-DOWNTIME-RISK -->





<!-- BEGIN:W29-PUBLISHED-XGE-DOWNTIME-RISK -->


- **W29 — Jeux d’argent.** Xanathar, lignes 1983–1988 et 2261–2290. Cinq blocs de huit heures sur de vraies dates, mise de 10 à 1 000 po, trois DD distincts à 5 + 2d10 et tests de Sagesse ou Charisme. Un jeu de dés ou d’échecs draconiques possédé et maîtrisé peut remplacer les compétences choisies, avec la même caractéristique. La chance de complication et l’exemple éventuel sont conservés. Deux réussites rendent 150 % de la mise au total selon la décision utilisateur. Zéro réussite crée une dette égale à la mise perdue. Le remboursement explicite transfère de vraies pièces au créancier. Le croisement vérifie le budget de journée partagé et la date d’un contrôle urbain après une vraie avance. [Guide Jeux d’argent](xge-gambling.md).


- **Suite concrète.** Étendre les arbitrages d’une semaine étalée, les mises majorées, les conséquences jouées des complications, le crime et les combats de fosse.


<!-- END:W29-PUBLISHED-XGE-DOWNTIME-RISK -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Crime, jeu, fosse : séries de jets, DD/choix exacts, enjeux/dettes/amendes/gains et complications, sans action déduite du texte.


- **Règles concernées** : Crime ; Resources ; Resolution ; Loot Value ; Complications ; Crime Complications ; Gambling ; Gambling Results ; Gambling Complications ; Pit Fighting ; Pit Fighting Results ; Pit Fighting Complications.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 18 unités rattachées à ce lot.


- **Dépendances** : [XGE-DOWNTIME-LEDGER](#xge-downtime-ledger) ; `currency-debt-ledger`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-DOWNTIME-RELAX





<!-- BEGIN:W26-PUBLISHED-XGE-DOWNTIME-RELAX -->


- **W26 — Détente livrée partiellement.** Xanathar, lignes 1983–1988 et 2323–2331. Sept dates consécutives de huit heures mesurées avec train de vie payé et budget partagé. L'avantage s'applique aux récupérations de peste des égouts et de teinture pâle à l'échéance qualifiée, y compris au vrai repos dans la première. À la fin exacte, le choix utilisateur lève durablement le blocage de soins d'une dose active de teinture pâle. Ses futurs dégâts restent et deviennent soignables. La première copie acceptait une demande une seconde après le bord. La régression R2 prouve son refus atomique. [Guide Détente](xge-relaxation.md).


- **Suite concrète.** Étendre les modes de couverture du train de vie et les effets curables lorsque leur provenance physique et mécanique est représentée. La tranche R2 couvre le paiement direct et un verrou de soins précis.


<!-- END:W26-PUBLISHED-XGE-DOWNTIME-RELAX -->





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Semaine de détente, train de vie requis et seuls effets curables source ; pas de retrait arbitraire de malédiction.


- **Règles concernées** : Relaxation ; Resources ; Resolution ; Complications.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 4 unités rattachées à ce lot.


- **Dépendances** : [XGE-DOWNTIME-LEDGER](#xge-downtime-ledger) ; [PHB-EXHAUSTION](#phb-exhaustion), [DISEASE-MADNESS](#disease-madness).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-ITEM-DISTRIBUTION





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Après adoption, budgets mineurs/majeurs par palier/rareté débités à acquisition réelle ; pas sur un tirage ou objet seulement placé.


- **Règles concernées** : Awarding Magic Items ; Distribution by Rarity ; Magic Items Awarded by Tier ; By Tier ; By Rarity ; Magic Items Awarded by Rarity - Minor ; Magic Items Awarded by Rarity - Major ; Minor and Major Items ; Behind the Design: Magic Item Distribution ; Choosing Items Level by Level ; Choosing Items Piecemeal ; Overstocking an Adventure ; Are Magic Items Necessary in a Campaign?.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 13 unités rattachées à ce lot.


- **Dépendances** : [MAGIC-ITEMS-CATALOG](#magic-items-catalog) ; `POLICY-optional-rules`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-RECHARGE-CALENDAR





<!-- BEGIN:W31-PUBLISHED-XGE-RECHARGE-CALENDAR -->


- **W31 — Autre heure sur un monde avec aube.** Xanathar, lignes 2620–2626. `adopt_xge_item_recharge_time` choisit une référence physique de vingt-quatre heures pour des instances rechargeables explicitement sélectionnées sur la carte actuelle qualifiée avec aube. Les objets non sélectionnés et les autres cartes gardent leur politique existante. Aucune charge à l'adoption, au déplacement, au rejeu ou à la restauration ; seul le temps réellement écoulé traite la prochaine frontière future. [Guide Recharge](xge-recharge-calendar.md).


- **Décision W31.** Convention locale à la carte, sans rattrapage au retour. Les conflits avec une carte sans aube sont refusés dans les deux sens avant effet et les anciens reçus W30 sont conservés.


- **Suite concrète.** Étendre les décisions de changement d'horaire ou les cadres physiques supplémentaires seulement avec leurs références et choix explicites, sans rebaser les anciennes acquisitions.


<!-- END:W31-PUBLISHED-XGE-RECHARGE-CALENDAR -->





<!-- BEGIN:W30-PUBLISHED-XGE-RECHARGE-CALENDAR -->


- **W30 — Plusieurs cartes du même plan sans aube.** Xanathar, lignes 2620–2626, et contexte planaire DMG 2014, lignes 1459–1483. `bind_xge_recharge_plane_map` rattache une carte actuelle explicitement qualifiée par un vrai fait local au plan nommé de la carte d'origine. Le cycle initial reste immuable. Aucun escalier, déplacement, rattachement ou rejeu ne recharge instantanément ni ne rattrape une échéance passée. Les objets portés et au sol gardent leur vraie localisation, avec trajets sur trois cartes, reprise SQL et POST vérifiés. [Guide Recharge](xge-recharge-calendar.md).


- **Suite concrète.** Représenter un autre horaire choisi dans un lieu où l'aube existe. Les bornes hors combat et de capacité restent des limites moteur documentées.


<!-- END:W30-PUBLISHED-XGE-RECHARGE-CALENDAR -->





<!-- BEGIN:W27-PUBLISHED-XGE-RECHARGE-CALENDAR -->


- **W27 — Recharge locale sans aube.** Xanathar, lignes 2620–2626. Le MJ qualifie une carte réelle et y choisit une référence de 24 heures. Les objets portés suivent la carte du personnage et les objets au sol gardent la leur. Seul le temps écoulé franchit une échéance. Les autres cartes conservent leur aube existante. [Guide Recharge](xge-recharge-calendar.md).


- **Suite concrète.** Étendre à plusieurs cartes rattachées au même plan et représenter un autre horaire choisi dans un lieu où l’aube existe.


<!-- END:W27-PUBLISHED-XGE-RECHARGE-CALENDAR -->





- **État** : Livré partiellement. **Priorité** : P3. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Choisir explicitement heure de recharge toutes24h sur plan sans aube ; conserver calendrier actuel sans adoption.


- **Règles concernées** : Recharging without a Dawn.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 1 unités rattachées à ce lot.


- **Dépendances** : [DMG-CALENDAR](#dmg-calendar) ; `POLICY-optional-rules`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-SUBCLASSES





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Obtenir fiches finales2014, ajouter profils/classes/capacités et validations ;31noms lus ne deviennent pas sous-classes actives.


- **Règles concernées** : Character Options ; Subclasses ; Barbarian — Path of the Ancestral Guardian ; Barbarian — Path of the Storm Herald ; Barbarian — Path of the Zealot ; Bard — College of Glamour ; Bard — College of Swords ; Bard — College of Whispers ; Cleric — Forge Domain ; Cleric — Grave Domain ; Druid — Circle of Dreams ; Druid — Circle of the Shepherd ; Fighter — Arcane Archer ; Fighter — Cavalier ; Fighter — Samurai ; Monk — Way of the Drunken Master ; Monk — Way of the Kensei ; Monk — Way of the Sun Soul ; Paladin — Oath of Conquest ; Paladin — Oath of Redemption ; Ranger — Gloom Stalker ; Ranger — Horizon Walker ; Ranger — Monster Slayer ; Rogue — Inquisitive ; et 9 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 33 unités rattachées à ce lot.


- **Dépendances** : `SOURCE-XGE-SUBCLASSES` ; [PHB-PROGRESSION](#phb-progression).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-RACIAL-FEATS





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent A — personnage, survie et PV temporaires.


- **Constat de l’audit initial** : Fiches finales et prérequis raciaux après adoption des dons ;20associations du tableau correspondent à15dons uniques.


- **Règles concernées** : Racial Feats ; Dragonborn — Dragon Fear ; Dragonborn — Dragon Hide ; Dwarf — Dwarven Fortitude ; Dwarf — Squat Nimbleness ; Elf — Elven Accuracy ; Elf (drow) — Drow High Magic ; Elf (high) — Fey Teleportation ; Elf (wood) — Wood Elf Magic ; Gnome — Fade Away ; Gnome — Squat Nimbleness ; Half-elf — Elven Accuracy ; Half-elf — Prodigy ; Half-orc — Orcish Fury ; Half-orc — Prodigy ; Halfling — Bountiful Luck ; Halfling — Second Chance ; Halfling — Squat Nimbleness ; Human — Prodigy ; Tiefling — Flames of Phlegethos ; Tiefling — Infernal Constitution.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 22 unités rattachées à ce lot.


- **Dépendances** : `SOURCE-XGE-FEATS` ; [PHB-RACIAL-TRAITS](#phb-racial-traits) ; `POLICY-optional-rules`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-SPELL-CATALOG





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Fiches2014 et errata puis sorts/listes de classe avec effets réels ; aucune substitution2024 ni promesse automatique de95sorts.


- **Règles concernées** : Spells.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 1 unités rattachées à ce lot.


- **Dépendances** : `SOURCE-XGE-SPELLS` ; [PHB-SPELL-CATALOG](#phb-spell-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-COMMON-ITEMS





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Obtenir48fiches annoncées puis propriétés actives testées ;11modèles DMG/SRD ne couvrent pas le catalogue XGE.


- **Règles concernées** : Common Magic Items ; Magic Item Tables.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 2 unités rattachées à ce lot.


- **Dépendances** : `SOURCE-XGE-ITEMS` ; [MAGIC-ITEMS-CATALOG](#magic-items-catalog).


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### XGE-SHARED-CAMPAIGN





- **État** : À faire. **Priorité** : P3. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Session reste aventure+personnage fixe ; cadre inter-sessions partagé exige décision produit et ledger séparé, jamais switch en partie.


- **Règles concernées** : Shared Campaigns ; Combat Encounters ; Rewards ; Character Creation ; Player's Handbook plus One ; Ability Scores ; Starting Equipment ; Variant Rules.


- **Archive détaillée** : [xge](rules-audit/xge.md), [unités JSON](rules-audit/xge.json) ; 8 unités rattachées à ce lot.


- **Dépendances** : `POLICY-product-shared-campaign` ; `SOURCE-XGE-SHARED-VARIANTS`.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MM-POWERS


<!-- BEGIN:W21-PUBLISHED-MM-POWERS -->


- **Report utilisateur conservé après W21** : aucune nouvelle capacité/statbloc MM dans cette vague. Tunneler/fouissement reste reporté, brouillon source et4/4 prérequis purs non livrés ; aucun rider, mouvement ou outil activé. Les profils/pouvoirs W20 déjà publiés ne servent que de fixtures/contrats existants pour les règles PHB. Ne pas relancer un prochain lot MM sans reprise explicite de cette priorité.


<!-- END:W21-PUBLISHED-MM-POWERS -->








- **Publication W18–W20 du 4 novembre** : venins natifs W18 et Wyvern Bite+Stinger W19 sont livrés ; W20 ajoute les outils Swallow et les alternatives Wyvern avec Claws conditionnées au vrai vol. MM16300–16301 : DEX19, aveuglement/entrave/couverture totale, événement commun 6d6 acide (interprétation simultanée PHB6002), 30 dégâts par un même occupant durant un vrai tour, CON21 puis rejet de tous dans les sorties explicitement choisies ; mort : sa seule entrave retirée, sortie pour 20 pieds de mouvement et à terre. Containment sans carte intérieure, adjacence de sortie et verrou de clôture sont des conventions/limites explicites, pas des exigences supplémentaires prétendues du MM. Observations/historiques gardent leurs vrais corps inactifs aux transitions carte/reddition/SQL, sans nouveau ciblage actif. Validation intégrée **2 471/2 471**, mock **30/30** ; [rapport W20](rules-audit/validation-wave20-2026-11-04.json), [guide](purple-worm-swallow.md). Prochain périmètre concret : autres pouvoirs MM, dont Tunneler/fouissement actuellement refusés ; aucune généralisation à tous les avalements.





- **Tranche venins natifs du 4 novembre — capture W18** : les quatre riders sourcés sont intégrés : Bite du serpent géant (CON11/3d6), Stinger de Wyvern (CON15/7d6), Tail Stinger du ver pourpre (CON19/12d6), Tentacles du charognard (CON13, poison/paralysie et sauvegardes de fin de tour explicites). Aucun poison possédé créé/consommé et aucun doublement critique des dés du venin sur sauvegarde ; blessure et CON originelles conservées dans `native-poison-state.ts`/`native-poison.ts`, y compris les réactions, hydratation et SQL. Crawler Multiattack pris en charge ; les autres riders incomplets restent refusés avant les coûts/dés. Preuve privée 31/31 ; cohorte intégrée 117/117 avant le seul correctif legacy sous-eau (les passes ne s'additionnent pas). La full W18 corrigée reste en cours. Hors de cette capture : vrai gel Wyvern Bite+Stinger 46/46, en préparation W19 ; Swallow est maintenant en travail séparé, avec le contrat de relation interne explicitement choisi par l'utilisateur le 4 novembre. [Profils et couverture](harvest-creatures.md).





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Coordination — validation W5.


- **Constat de l’audit initial** : Ajouter un résolveur source pour chaque trait/pouvoir encore documentaire, avec arguments explicites et refus avant mutation.


- **Règles concernées** : Modifying Creatures ; Special Traits ; Actions ; Melee and Ranged Attacks ; Multiattack ; Ammunition ; Reactions ; Limited Usage ; Grapple Rules for Monsters ; Variant: Demonic Cambions ; Variant: Infernal Cambions ; Variant: Demon Summoning ; Variant: Summon Demon (1/Day) ; Variant: Quasit Familiar ; Variant: Devil Summoning ; Variant: Summon Devil (1/Day) ; Variant: Bone Devil Polearm ; Variant: Rope of Entanglement ; Variant: Ice Devil Spear ; Variant: Imp Familiar ; Variant: Dragons as Innate Spellcasters ; Variant: Drider Spellcasting ; Dryad ; Variant: Drow Magic Armor and Weapons ; et 76 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [mm-2014](rules-audit/mm-2014.md), [unités JSON](rules-audit/mm-2014.json) ; 323 unités rattachées à ce lot.


- **Révalidation du 31 octobre — horodatage de Consume Life** : la capacité tue réellement le joueur sur son échec CON, mais laisse hero.corpseTimes.player absent à la sérialisation. [Reproduction MCP isolée](../output/rules-revalidation-20261031/probes.json), branche [Consume Life](../mcp-server/tools/monster-power-tools.ts#L86), contrôles de résurrection [Revivify](../mcp-server/hero-spells.ts#L161). Établir l'horodatage de mort permet au résolveur de vérifier la fenêtre de résurrection ; aucun soin/résurrection implicite n'est proposé. Le suivi nutritionnel après décès est explicitement hors besoin produit retenu et ne fait pas partie de ce correctif. Les pouvoirs déjà fonctionnels restent distingués des capacités documentaires.








- **Livraison W5 du 31 octobre** : Une mort Consume Life réellement établie reçoit son instant moteur une seule fois, y compris t=0 ; une CON réussie ne crée aucun timestamp. Une vraie mort de source retire l’exception KO. Le raccord sert les fenêtres de résurrection sans soin implicite ni nouveau travail nutritionnel. Voir [unconscious-transition.md](unconscious-transition.md).


- **Outils/raccords W5 validés** : use_monster_power (Consume Life), recordActualDeath.


- **Reste / prochaine étape** : Les autres capacités encore source-reference-only restent à intégrer depuis leurs fiches ; ce correctif ne livre pas tout le catalogue des pouvoirs.


- **Preuve finale W5** : 1 201/1 201 tests, TypeScript complet et 30/30 tours mock passent ; [rapport borné et empreintes](rules-audit/validation-wave5-2026-10-31.json).





### MM-CATALOG





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent C — sources, procédures MJ et couverture.


- **Constat de l’audit initial** : Importer des fiches explicitement validées, sans statistiques de substitution ; réconcilier variantes/doublons et édition avant activation.


- **Règles concernées** : Statistics ; Type ; Hit Points ; Hit Dice by Size ; Proficiency Bonus by Challenge Rating ; Armor, Weapon, and Tool Proficiencies ; Experience Points by Challenge Rating ; Equipment ; Aarakocra ; Actions ; Aboleth ; Deva ; Planetar ; Solar ; Animated Armor ; Flying Sword ; Rug of Smothering ; Ankheg ; Azer ; Banshee ; Basilisk ; Behir ; Beholder ; Death Tyrant ; et 1034 autres unités déjà répertoriées dans la matrice liée.


- **Archive détaillée** : [mm-2014](rules-audit/mm-2014.md), [unités JSON](rules-audit/mm-2014.json) ; 9536 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





**Entrées de catalogue identifiées** : Aarakocra ; Aboleth ; Deva ; Planetar ; Solar ; Animated Armor ; Flying Sword ; Rug of Smothering ; Ankheg ; Azer ; Banshee ; Basilisk ; Behir ; Beholder ; Death Tyrant ; Spectator ; Needle Blight ; Twig Blight ; Vine Blight ; Bugbear ; Bugbear Chief ; Bulette ; Bullywug ; Cambion ; Carrion Crawler ; Cave Bear ; Centaur ; Chimera ; Chuul ; Cloaker ; Cockatrice ; Couatl ; Crawling Claw ; Cyclops ; Darkmantle ; Death Knight ; Deep Gnome (Svirfneblin) ; Demilich ; Balor ; Barlgura ; Chasme ; Dretch ; Glabrezu ; Goristro ; Hezrou ; Manes ; Marilith ; Nalfeshnee ; Quasit ; Shadow Demon ; Vrock ; Yochlol ; Barbed Devil ; Bearded Devil ; Bone Devil ; Chain Devil ; Erinyes ; Horned Devil ; Ice Devil ; Imp ; Lemure ; Pit Fiend ; Spined Devil ; Allosaurus ; Ankylosaurus ; Plesiosaurus ; Pteranodon ; Triceratops ; Tyrannosaurus Rex ; Displacer Beast ; Doppelganger ; Adult Blue Dracolich ; Dragon Turtle ; Young Red Shadow Dragon ; Ancient Black Dragon ; Adult Black Dragon ; Young Black Dragon ; Black Dragon Wyrmling ; Ancient Blue Dragon ; Adult Blue Dragon ; Young Blue Dragon ; Blue Dragon Wyrmling ; Ancient Green Dragon ; Adult Green Dragon ; Young Green Dragon ; Green Dragon Wyrmling ; Ancient Red Dragon ; Adult Red Dragon ; Young Red Dragon ; Red Dragon Wyrmling ; Ancient White Dragon ; Adult White Dragon ; Young White Dragon ; White Dragon Wyrmling ; Ancient Brass Dragon ; Adult Brass Dragon ; Young Brass Dragon ; Brass Dragon Wyrmling ; Ancient Bronze Dragon ; Adult Bronze Dragon ; Young Bronze Dragon ; Bronze Dragon Wyrmling ; Ancient Copper Dragon ; Adult Copper Dragon ; Young Copper Dragon ; Copper Dragon Wyrmling ; Ancient Gold Dragon ; Adult Gold Dragon ; Young Gold Dragon ; Gold Dragon Wyrmling ; Ancient Silver Dragon ; Adult Silver Dragon ; Young Silver Dragon ; Silver Dragon Wyrmling ; Drider ; Duergar ; Air Elemental ; Earth Elemental ; Fire Elemental ; Water Elemental ; Drow ; Drow Elite Warrior ; Drow Mage ; Drow Priestess of Lolth ; Empyrean ; Ettercap ; Ettin ; Faerie Dragon (Red) ; Faerie Dragon (Orange) ; Faerie Dragon (Yellow) ; Faerie Dragon (Green) ; Faerie Dragon (Blue) ; Faerie Dragon (Indigo) ; Faerie Dragon (Violet) ; Flameskull ; Flumph ; Fomorian ; Gas Spore ; Shrieker ; Galeb Duhr ; Gargoyle ; Dao ; Djinni ; Efreeti ; Marid ; Ghoul ; Ghast ; Cloud Giant ; Fire Giant ; Frost Giant ; Hill Giant ; Stone Giant ; Storm Giant ; Gibbering Mouther ; Githyanki Warrior ; Githyanki Knight ; Githzerai Monk ; Githzerai Zerth ; Gnoll ; Gnoll Pack Lord ; Gnoll Fang of Yeenoghu ; Goblin Boss ; Clay Golem ; Flesh Golem ; Iron Golem ; Stone Golem ; Gorgon ; Grell ; Grick Alpha ; Griffon ; Grimlock ; Green Hag ; Night Hag ; Sea Hag ; Half-Red Dragon Veteran ; Harpy ; Hell Hound ; Helmed Horror ; Hippogriff ; Hobgoblin Captain ; Hobgoblin Warlord ; Homunculus ; Hook Horror ; Hydra ; Intellect Devourer ; Invisible Stalker ; Jackalwere ; Kenku ; Kobold ; Winged Kobold ; Kraken ; Kuo-toa ; Kuo-toa Archpriest ; Kuo-toa Monitor ; Kuo-toa Whip ; Lamia ; Lich ; Lizardfolk ; Lizardfolk Shaman ; Lizard King ; Lizard Queen ; Werebear ; Wereboar ; Wererat ; Weretiger ; Werewolf ; Magmin ; Manticore ; Medusa ; Dust Mephit ; Ice Mephit ; Magma Mephit ; Mud Mephit ; Smoke Mephit ; Steam Mephit ; Merfolk ; Merrow ; Mimic ; Mind Flayer ; Mind Flayer Arcanist ; Minotaur ; Monodrone ; Duodrone ; Tridrone ; Quadrone ; Pentadrone ; Mummy ; Mummy Lord ; Myconid Sprout ; Myconid Adult ; Myconid Sovereign ; Quaggoth Spore Servant ; Bone Naga (Guardian) ; Bone Naga (Spirit) ; Guardian Naga ; Spirit Naga ; Nightmare ; Nothic ; Ogre ; Half-Ogre (Ogrillon) ; Oni ; Black Pudding ; Gelatinous Cube ; Gray Ooze ; Ochre Jelly ; Orc ; Orc War Chief ; Orc Eye of Gruumsh ; Orog ; Otyugh ; Owlbear ; Pegasus ; Peryton ; Piercer ; Pixie ; Pseudodragon ; Purple Worm ; Quaggoth ; Quaggoth Thonot ; Rakshasa ; Remorhaz ; Young Remorhaz ; Revenant ; Roc ; Roper ; Rust Monster ; Sahuagin ; Sahuagin Priestess ; Sahuagin Baron ; Fire Snake ; Salamander ; Scarecrow ; Shadow ; Shambling Mound ; Shield Guardian ; Minotaur Skeleton ; Warhorse Skeleton ; Slaad Tadpole ; Red Slaad ; Blue Slaad ; Green Slaad ; Gray Slaad ; Death Slaad ; Specter ; Poltergeist ; Androsphinx ; Gynosphinx ; Stirge ; Succubus ; Incubus ; Swarm of Beetles ; Swarm of Centipedes ; Swarm of Spiders ; Swarm of Wasps ; Tarrasque ; Thri-kreen ; Treant ; Troglodyte ; Troll ; Umber Hulk ; Unicorn ; Vampire Spawn ; Vampire ; Vampire Spellcaster ; Vampire Warrior ; Water Weird ; Wraith ; Wyvern ; Xorn ; Yeti ; Abominable Yeti ; Yuan-ti Abomination ; Yuan-ti Malison (Type 1) ; Yuan-ti Malison (Type 2) ; Yuan-ti Malison (Type 3) ; Yuan-ti Pureblood ; Arcanaloth ; Mezzoloth ; Nycaloth ; Ultroloth ; Ogre Zombie ; Beholder Zombie ; Ape ; Axe Beak ; Baboon ; Badger ; Bat ; Black Bear ; Blood Hawk ; Boar ; Brown Bear ; Camel ; Cat ; Constrictor Snake ; Crab ; Crocodile ; Death Dog ; Deer ; Dire Wolf ; Draft Horse ; Eagle ; Elephant ; Elk ; Flying Snake ; Frog ; Giant Ape ; Giant Badger ; Giant Bat ; Giant Boar ; Giant Centipede ; Giant Constrictor Snake ; Giant Crab ; Giant Crocodile ; Giant Eagle ; Giant Elk ; Giant Fire Beetle ; Giant Goat ; Giant Hyena ; Giant Lizard ; Giant Octopus ; Giant Owl ; Giant Poisonous Snake ; Giant Rat ; Giant Scorpion ; Giant Sea Horse ; Giant Shark ; Giant Spider ; Giant Toad ; Giant Vulture ; Giant Wasp ; Giant Weasel ; Giant Wolf Spider ; Goat ; Hawk ; Hunter Shark ; Hyena ; Jackal ; Killer Whale ; Lion ; Lizard ; Mammoth ; Mastiff ; Mule ; Octopus ; Owl ; Panther ; Phase Spider ; Poisonous Snake ; Polar Bear ; Pony ; Quipper ; Raven ; Reef Shark ; Rhinoceros ; Riding Horse ; Saber-Toothed Tiger ; Scorpion ; Sea Horse ; Spider ; Swarm of Bats ; Swarm of Insects ; Swarm of Poisonous Snakes ; Swarm of Quippers ; Swarm of Rats ; Swarm of Ravens ; Tiger ; Vulture ; Warhorse ; Weasel ; Winter Wolf ; Worg ; Acolyte ; Archmage ; Assassin ; Bandit Captain ; Berserker ; Druid ; Gladiator ; Guard ; Priest ; Scout ; Spy ; Tribal Warrior.





### MM-MOVEMENT


<!-- BEGIN:W21-PUBLISHED-MM-MOVEMENT -->


- **Report utilisateur conservé après W21** : pas de fouissement/Tunneler ni de nouveau mode MM livré. Le contrat futur de corridors physiques mesurés sur la carte actuelle sans carte souterraine séparée est conservé, sans poursuite active. Les opportunités W21 relèvent du PHB sur le vol W20 déjà publié, pas d’une nouvelle capacité de créature. Ne pas reprendre le brouillon MM sans demande explicite.


<!-- END:W21-PUBLISHED-MM-MOVEMENT -->








- **Publication W20 — vol natif** : vitesses sources des vrais individus, atterrissage/chute sur support mesuré, pas de dimensions anatomiques ou plafond inférés. Un vol terminé peut atterrir, marcher, être archivé puis revenir après SQL/redémarrage sans rejouer son déplacement. Bite+Stinger reste légal au sol ; Claws+Stinger ou Bite+Claws devient permis dans le vrai vol représenté. [Rapport intégré W20](rules-audit/validation-wave20-2026-11-04.json), **2 471/2 471**, mock **30/30**. Restent ouverts les modes de mouvement non représentés et les limites du [guide](native-flight.md).





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Coordination — validation W5.


- **Constat de l’audit initial** : Déplacement vertical, vol/nage/creusement et géométrie adaptée, sans téléportation implicite.


- **Règles concernées** : Size ; Size Categories ; Speed ; Burrow ; Climb ; Fly ; Swim.


- **Archive détaillée** : [mm-2014](rules-audit/mm-2014.md), [unités JSON](rules-audit/mm-2014.json) ; 49 unités rattachées à ce lot.


- **Révalidation du 31 octobre — impact sur les créatures actives** : [probe MCP](../output/rules-revalidation-20261031/probes.json) : ghost expose walk=0/fly=40/hover=true, mais preview_navigation renvoie ACTOR_IMMOBILE car le plan utilise seulement la vitesse de marche. Le will_o_wisp expose également walk=0/fly=50 ; l'absence de mode résolu concerne donc déjà le catalogue actif, pas seulement de futures fiches. Prochaine tranche : mode choisi explicitement et géométrie autoritaire adaptée (pas une substitution silencieuse de fly à walk), puis nage/escalade/creusement, altitude et empreintes multicases. Seul le fantôme a fait l'objet d'une reproduction de déplacement dans ce contrôle.








- **Livraison W5 du 31 octobre** : Vol natif stationnaire choisi explicitement pour ghost/will_o_wisp sans marche : projection horizontale sur la carte active, vitesse source, budgets, murs/portes/occupants et continuation d’opportunité persistée. Pas de substitution automatique de marche en vol. Voir [hover-flight.md](hover-flight.md).


- **Outils/raccords W5 validés** : preview_navigation, move_token (movementMode: fly).


- **Reste / prochaine étape** : Altitude, profils combinant marche/vol, chute, nage/escalade/creusement et empreintes restent ouverts. Vol préparé/transport refusé ; run_monster_turns conserve sa navigation au sol.


- **Preuve finale W5** : 1 201/1 201 tests, TypeScript complet et 30/30 tours mock passent ; [rapport borné et empreintes](rules-audit/validation-wave5-2026-10-31.json).





### MM-SENSES





- **État** : Livré partiellement. **Priorité** : P2. **Responsable** : Coordination — revalidation des sens natifs W3.


- **Constat de l’audit initial** : Vision aveugle/véritable, perception des vibrations et conditions sensorielles source.


- **Règles concernées** : Skills ; Senses ; Blindsight ; Darkvision ; Tremorsense ; Truesight ; Telepathy.


- **Archive détaillée** : [mm-2014](rules-audit/mm-2014.md), [unités JSON](rules-audit/mm-2014.json) ; 49 unités rattachées à ce lot.


- **Intégration actuelle revalidée** : inspect_creature_senses et canSee exploitent les profils natifs du catalogue, les portées, murs et couverture totale, darkvision et blindsight ; la visibilité bornée de truesight et l'effet See Invisibility structuré sont pris en compte. Aucune capacité raciale n'est créée. [Profils et limites](../lib/creature-senses.ts), [raccord de perception](../mcp-server/monster-perception.ts), [guide W3](creature-senses.md). Ce travail existant justifie le statut partiel du lot ; son extension reste ouverte.


- **Reste / prochaine étape** : tremorsense sans contact/substance/vibrations, révélation d'illusions/formes/plans de truesight, télépathie et occultations non lumineuses restent à modéliser. Les interactions entre sens et modificateurs de conditions doivent être vérifiées selon leurs sources2014 ; un score de visibilité ne suffit pas à déclarer toute interaction conforme.


- **Validation retenue** : W3 a livré ce sous-périmètre avec ses tests de sens dans l'instantané attesté ; la présente mise à jour est une relecture ciblée de statut, pas une nouvelle exécution de ces tests. Les preuves W3/W4 et leurs limites restent inchangées.





### MM-RECONCILE





- **État** : À faire. **Priorité** : P2. **Responsable** : Coordination — intégration, déplacements et validation.


- **Constat de l’audit initial** : Réconcilier source fournie / SRD2014 / éventuels doublons, sans écraser un invariant projet.


- **Règles concernées** : Challenge ; Experience Points ; Hit Points ; Initiative.


- **Archive détaillée** : [mm-2014](rules-audit/mm-2014.md), [unités JSON](rules-audit/mm-2014.json) ; 128 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MM-SPELLS





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Listes exactes, emplacements, composants et réactions des lanceurs non-joueurs.


- **Règles concernées** : Innate Spellcasting ; Spellcasting.


- **Archive détaillée** : [mm-2014](rules-audit/mm-2014.md), [unités JSON](rules-audit/mm-2014.json) ; 8 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





### MM-LEGENDARY





- **État** : À faire. **Priorité** : P2. **Responsable** : Agent B — combat, magie et deux armes.


- **Constat de l’audit initial** : Budgets et fenêtres explicites d’actions légendaires, résistances légendaires, repaire et effets régionaux.


- **Règles concernées** : Legendary Creatures ; Legendary Actions ; A Legendary Creature's Lair ; Lair Actions ; Regional Effects ; Additional Lair Actions ; Additional Regional Effects.


- **Archive détaillée** : [mm-2014](rules-audit/mm-2014.md), [unités JSON](rules-audit/mm-2014.json) ; 168 unités rattachées à ce lot.


- **Travail à réaliser** : implémenter le périmètre identifié avec état persistant, arguments explicites et validations avant mutation. Préparer les cas de réussite, refus, coûts et reprise qui correspondent aux règles nommées ; consigner ici le résultat et les limites après le lot.





## Prérequis explicites et décisions





| Identifiant | Nature | État | Responsable | À résoudre |


|---|---|---|---|---|


| SOURCE-XGE-TOOLS | source_access | source_needed | Agent C — sources, procédures MJ et couverture | Source détaillée absente de l’export ; accès officiel recherché et documenté, sans invention. |


| POLICY-optional-rules | policy | decision_required | Coordination — intégration, déplacements et validation | Choix produit/option à expliciter ; aucune adoption automatique. |


| PHB-party-scope | design_prerequisite | design_needed | Coordination — intégration, déplacements et validation | Contrat ou donnée manquante à spécifier avant le lot dépendant ; ce nom ne désigne pas un outil déjà implémenté. |


| SOURCE-XGE-ENCOUNTERS | source_access | source_needed | Agent C — sources, procédures MJ et couverture | Source détaillée absente de l’export ; accès officiel recherché et documenté, sans invention. |


| currency-debt-ledger | design_prerequisite | design_needed | Coordination — intégration, déplacements et validation | Contrat ou donnée manquante à spécifier avant le lot dépendant ; ce nom ne désigne pas un outil déjà implémenté. |


| SOURCE-XGE-SUBCLASSES | source_access | source_needed | Agent C — sources, procédures MJ et couverture | Source détaillée absente de l’export ; accès officiel recherché et documenté, sans invention. |


| SOURCE-XGE-FEATS | source_access | source_needed | Agent C — sources, procédures MJ et couverture | Source détaillée absente de l’export ; accès officiel recherché et documenté, sans invention. |


| SOURCE-XGE-SPELLS | source_access | source_needed | Agent C — sources, procédures MJ et couverture | Source détaillée absente de l’export ; accès officiel recherché et documenté, sans invention. |


| SOURCE-XGE-ITEMS | source_access | source_needed | Agent C — sources, procédures MJ et couverture | Source détaillée absente de l’export ; accès officiel recherché et documenté, sans invention. |


| POLICY-product-shared-campaign | policy | decision_required | Coordination — intégration, déplacements et validation | Choix produit/option à expliciter ; aucune adoption automatique. |


| SOURCE-XGE-SHARED-VARIANTS | source_access | source_needed | Agent C — sources, procédures MJ et couverture | Source détaillée absente de l’export ; accès officiel recherché et documenté, sans invention. |





## Journal des mises à jour





- **1er novembre 2026 — contrôles W10 et relais** : typecheck complet de l'instantané intégré r1 réussi. Premier passage global :1484tests,1472réussis/12échecs,595575ms, sortie1 ; ce n'est pas une validation complète. Les douze scénarios ont ensuite été corrigés pour les vrais jets d'initiative2014 et leurs reprises ciblées ont passé7/7 puis5/5 (exécutions séparées). La première commande parent de reprise exécutée depuis le mauvais dossier est exclue ; la reprise correcte utilise le dossier privé avec pg-mem. Agents réaffectés vers récupération des munitions, portage et récupération naturelle du joueur. Aucun audit global ni reconstruction du registre.


- **1er novembre 2026 — clarification du chantier W10** : les noms historiques pétrification/vol ont été remplacés par armes, respiration et initiative ; ces noms ne signifiaient pas des fonctions bloquées. Correction concrète du décompte somatique validée par reprise ciblée. Les raccords et validations sont regroupés par périmètre cohérent ; la suffocation, les munitions et la conformité d'initiative restent en cours, sans déclaration de livraison globale.


- **1er novembre 2026 — poursuite complète W10** : objectif continu de traitement du registre avec trois agents réaffectés ; décision utilisateur explicite des règles D&D 2014 standard par défaut, initiative conservée. Quatre entrées en cours, deux décisions de principe remises en travail avec politique actée. Aucune source manquante inventée ni audit relancé.





- **1er novembre 2026 — livraison W9 bornée** : Arme spirituelle non létale initiale/répétée/parchemin, correctif du bonus source +5 et relais des agents. **97/97 ciblés**, **1 408/1 408 tests** de l’instantané r2, TypeScript, playtest **30/30**, **132 outils** et **721 binaires MCP actuels identiques**. Compatibilité applicative séparée 15/15 ; changements concurrents training exclus, fidélité globale ROOT laissée fausse, sans rollback ni nouveau build ROOT. [Rapport W9](rules-audit/validation-wave9-2026-11-01.json). Aucun nouvel audit.





- **1er novembre 2026 — lancement W9** : attaques de sorts de mêlée non létales depuis PHB-NONLETHAL, périmètre déterminé par le vrai catalogue et source locale ciblée ; Arme spirituelle initiale/répétée/parchemin, sans nouveau sort. Agents répartis, base W8 comparée avant édition ; aucun nouvel audit.





- **1er novembre 2026 — livraison W8** : opportunités et attaques préparées non létales intégrées depuis PHB-NONLETHAL, avec relais des agents. **72/72 ciblés**, **1 365/1 365 tests**, TypeScript, playtest **30/30** et **132 outils** ; moteur partagé identique aux **721 binaires** validés. [Rapport W8](rules-audit/validation-wave8-2026-11-01.json). Borne préexistante de cible à PV positifs en réaction documentée ; aucun nouvel audit global.





- **1er novembre 2026 — lancement W8** : reprise ciblée des opportunités et attaques préparées non létales depuis PHB-NONLETHAL ; contrats, fichiers distincts et tests croisés répartis entre les trois agents. Base W7 r2 comparée avant édition ; aucun nouvel audit.





- **1er novembre 2026 — livraison W7** : deux entrées du registre avancées dans leurs périmètres, relais des agents, **83/83 ciblés**, **1 331/1 331 tests**, TypeScript, playtest **30/30** et **132 outils**. Sources finales figées et moteur partagé identique aux **721 binaires** validés. [Rapport W7](rules-audit/validation-wave7-2026-11-01.json). Premier gel pré-guidance conservé séparément ; aucun nouvel audit global.





- **1er novembre 2026 — lancement W7** : reprise des deux suites explicitement demandées, contrats et fichiers répartis, validation croisée confiée au troisième agent. Base comparée au W6 validé avant les modifications. Aucun audit global.





- **1er novembre 2026 — livraison W6** : quatre entrées avancées depuis le suivi, avec relais des agents, 73 ciblés puis 1 274/1 274 tests, TypeScript, playtest 30/30 et 131 outils. Le moteur partagé correspond aux 705 binaires privés validés. [Rapport W6](rules-audit/validation-wave6-2026-11-01.json). La limite des fournisseurs de pierre hors carte est conservée avec sa provenance ciblée ; aucun nouvel audit global ni reconstruction du registre.





- **1er novembre 2026 — lancement W6** : choix de trois tranches prioritaires depuis les restes W5 du registre ; contrats et ownership répartis entre agents, copie de base isolée avant modifications. Aucun nouvel audit.





- **31 octobre 2026 — livraison W5** : relais continu des agents, huit entrées du registre avancées dans leurs périmètres bornés, 1 201/1 201 tests, 30/30 tours mock et 130 outils. Le [rapport W5](rules-audit/validation-wave5-2026-10-31.json) relie sources/tests/binaires et essais corrigés. Les prochaines tranches restent dans leurs fiches ; le registre conserve 147 lots, sans reconstruction depuis les anciens audits.





- **31 octobre 2026 — création du registre** : reprise des 147 lots et des 11 prérequis des audits existants, sans nouvel audit. La première vague est livrée dans son périmètre ; les quatre lots prioritaires suivants sont intégrés et en validation finale. Le guide joueur développé est conservé dans [player-rules-reference.md](player-rules-reference.md), avec un socle compact dans les prompts.





## Comment reprendre sans refaire l’audit





1. Choisir un identifiant de l’index et lire sa fiche.


2. Confirmer les dépendances depuis ce registre, puis attribuer des fichiers distincts aux agents.


3. Consulter seulement les passages de règle et le code nécessaires à ce lot.


4. Implémenter et tester ; mettre immédiatement à jour la fiche, l’index, les limites et le journal.


5. Ajouter un travail réellement nouveau seulement s’il apparaît pendant l’implémentation d’un lot, avec motif et provenance. Ne pas reconstruire le backlog par un nouveau balayage des livres.





### 2026-10-31 — Retrait de la Crypte du catalogue


- Demande utilisateur : enlever la campagne de la crypte.


- lib/adventures.ts : catalogue public sans Tide Crypt ; registre interne conservé pour les sessions existantes et les tests moteur.


- Vérifications lancées : npm run typecheck, npm test, npm run playtest:mock (résultats dans removal-*.log).








### 2026-10-31 — Figurines du plateau (présentation uniquement)


- Demande utilisateur : modèles 3D low-poly adaptés, pions historiques conservés sans correspondance pertinente.


- Intégrés : `components/Miniature.tsx`, raccord des trois familles de pions dans `components/Battlemap.tsx`, registre visuel fermé `lib/miniatures.ts`, huit GLB locaux CC0 dans `public/miniatures/` avec provenance `CREDITS.md`. Aucun outil ni état mécanique MCP modifié.


- Héros : guerrier, magicien, clerc ; barde sans modèle pertinent conserve les initiales. Créatures : gobelin, squelette, chauve-souris, bandit, éclaireur, garde, chevalier, mage, prêtre. PNJ : types explicites garde/chevalier/mage/prêtre ; les autres conservent leur pion. Aucun choix fondé sur un nom propre.


- Rendu fixe depuis les modèles 3D, posture Idle quand disponible, images mises en cache ; clics, PV, couleurs de disposition et indicateurs de tour conservés. Pion initial pendant le chargement, en cas d'erreur ou sans WebGL.


- Vérifications : `npm run typecheck` réussi ; 2 tests figurines + 2 tests anti-fuites réussis ; 10 tests catalogue/géométrie réussis ; rendu navigateur des huit GLB vérifié visuellement.


- `npm test` lancé puis interrompu après 785 réussites et 45 échecs mécaniques, alors qu'une autre suite complète tournait également dans le workspace. Journal : `output/miniatures-validation-20261031/npm-test-interrupted.log`. Le cas d'armure STR/DEX échoué dans cette exécution passe isolément (1/1), voir `armor-isolated.log`. La suite globale n'est donc PAS validée ; le parallélisme peut contribuer aux échecs, sans attribution générale démontrée.


- Limites : figurines fixes, sans rotation interactive ni animation ; pas de substitution approximative pour les êtres fantastiques ou les personnages sans modèle pertinent. Prochain contrôle : relancer la suite globale sur un workspace stable, sans suites concurrentes.





### 2026-10-31 — Remplacement visuel par des sculptures réalistes


- Demande utilisateur : passer au style réaliste, conserver les pions sans correspondance, rester exclusivement sur les visuels pendant les travaux moteur.


- État courant : cette entrée remplace les choix low-poly de l'entrée précédente. Quatre modèles Sloyd CC BY 4.0 retenus après téléchargement et contrôle visuel : Warrior (TopoGriffin), Wise Man (VertexZhi), Goblin Warrior (a Sloyd creator), Wolf (CamExtrude). Proportions/poses des autres candidats écartées si trop cartoon ; les fichiers Quaternius sont conservés en archive, sans correspondance active.


- `lib/miniatures.ts` : guerrier et magicien jouables ; gobelins, loups et loups sanguinaires, gardes, chevaliers et mages ; PNJ garde/chevalier/mage/érudit/ermite. Clerc, barde et autres protagonistes sans sculpture réaliste adaptée restent en initiales. Aucun changement des fiches ou des données moteur.


- `public/miniatures/realistic/` : quatre GLB originaux, empreintes SHA-256 et provenance dans `sources.json`, quatre portraits transparents PNG de 192 px (70 099 octets au total). `components/Miniature.tsx` affiche ces rendus locaux : aucun GLB, WebGL ou bibliothèque 3D chargé en partie ; initiales pendant le chargement ou en cas d'erreur, changement de modèle sans ancien portrait persistant.


- Attribution : `public/miniatures/credits.html`, lien visible sur le plateau dans `components/Battlemap.tsx` ; `CREDITS.md` et `docs/playable-characters.md` actualisés. Les pages source Sloyd annoncent explicitement CC BY 4.0 et fournissent le texte d'attribution, conservé dans la provenance. Les modèles provenant de TerrainTale n'ont pas été utilisés car la redistribution des personnages n'était pas assez explicite dans leur manifeste.


- Vérifications réussies : `npm run typecheck:next` ; 3 tests figurines (replis, sélection réaliste, intégrité/licences/PNG) + 2 tests anti-fuites ; contrôle navigateur du vrai composant React (chargement, repli sur image absente, changement de modèle, clic parent, absence de requêtes GLB/Three), capture inspectée : `output/miniatures-validation-20261031/realistic-board.png`. `git diff --check` sans erreur sur ce périmètre.


- La suite moteur et le playtest n'ont pas été relancés conformément à la demande explicite de rester sur les visuels pendant les travaux parallèles. Prochain travail visuel : compléter les sculptures réalistes manquantes, notamment clerc, barde, créatures végétales et protagonistes féeriques, sans substitutions approximatives.





### 2026-10-31 — Sept sculptures réalistes supplémentaires, dont les deux classes manquantes


- Demande utilisateur : poursuivre la recherche et l'intégration du clerc, du barde et des protagonistes manquants, exclusivement dans les visuels.


- Source primaire : API publique Printables (métadonnées, licence, auteur et liens de téléchargement effectivement obtenus sans connexion). Teirale : clerc féminine avec masse/bouclier, modèle 77928, fichier 346821 ; barde féminine avec instrument, modèle 84666, fichier 373460. MZ4250 : Dryad 14688/198927, Satyr Updated 72195/319482, Hobgoblin 14705/55285, Treant Updated 74772/332506, Skeleton Updated 72589/321956. Les sept licences vérifiées sont « Creative Commons — Attribution » ; sources, auteurs et empreintes conservés dans `public/miniatures/realistic/sources.json` et les crédits publics.


- Les STL ont été convertis en GLB, orientés, simplifiés à environ 30 000 triangles et dotés d'un matériau de résine teintée ; portraits PNG transparents de 192 px. Les GLB originaux précédents restent inchangés. L'angle de la barde a été choisi après comparaison de quatre vues pour montrer son instrument. Aucun STL lourd ni calcul 3D n'est chargé pendant la partie.


- `lib/miniatures.ts` : les quatre héros ont désormais leur sculpture ; ajout des hobgobelins, satyres, squelettes et arbres éveillés. `adventures/grammys-country-apple-pie/miniatures.ts` : correspondance visuelle des dryades, uniquement pour cette aventure, sans import par le moteur ni par map.ts. `components/Battlemap.tsx` transmet l'identifiant d'aventure aux seules fonctions de sélection visuelle. Aucun fichier, outil, état ou argument du moteur modifié.


- Catalogue actif : 11 sculptures, 207 034 octets de portraits PNG au total. `public/miniatures/credits.html`, `CREDITS.md` et `docs/playable-characters.md` actualisés. Les personnages particuliers sans modèle réellement adapté gardent les initiales (fantômes humains, protagonistes féeriques spécifiques, etc.).


- Vérifications réussies : `npm run typecheck:next` ; 4 tests figurines + 2 anti-fuites ; contrôle navigateur du vrai composant React avec 11 portraits, les nouveaux héros, la sélection d'aventure, le repli inconnu/image absente, le changement d'image, les clics parents et l'absence de téléchargement GLB/Three. Captures inspectées : `output/miniatures-validation-20261031/new-sculptures.png`, `bard-angles.png`, `expanded-realistic-board.png`. `git diff --check` sans erreur dans les fichiers modifiés de ce périmètre.


- Conformément à la demande, aucune recompilation/exécution du moteur ni suite mécanique/playtest relancée. Prochain travail visuel possible : fantômes humains, arbustes et champignons animés, grenouilles et PNJ féeriques particuliers ; conserver le repli tant que la silhouette, la licence et le fichier ne sont pas vérifiés.





### 2026-10-31 — Fantômes, champignons et PNJ féeriques ; image de Sarah préservée


- Demande utilisateur : poursuivre les figurines réalistes manquantes sans toucher au moteur. Correction explicite reçue pendant le lot : Sarah doit garder l'image fournie par l'utilisateur, sans remplacement par une sculpture.


- Sources vérifiées via l'API publique Printables, toutes « Creative Commons — Attribution » : MZ4250, Fungi for Tabletop Gaming 49023/fichier 200896 (champignon violet exact), Ghosts Updated 51686/218343 (fantôme humain masculin), Leprechaun 151686/624457 (farfadet), Bard Collection 59744/256059 (gnome barde féminine à l'accordéon) ; Schlossbauer, Awakened shrub 112010/462957. Goblin civil Sloyd CC BY 4.0, source `goblin-jbwryson`, lien et attribution publiés sur sa page. Le fantôme féminin a été évalué puis exclu à la demande de conserver Sarah telle quelle.


- Sept nouveaux visuels actifs : fantôme, champignon violet, arbuste éveillé, variante de cet arbuste en pot en terre cuite, farfadet, ménestrelle gnome et gobelin civil. STL convertis/simplifiés, orientation corrigée selon chaque source, résine teintée, portraits transparents fixes de 192 px. La variante en pot réutilise l'arbuste de Schlossbauer avec un pot ajouté ; provenance, adaptation et empreintes conservées dans `public/miniatures/realistic/sources.json`. Crédits publics et CREDITS.md actualisés.


- `adventures/fey-shadow-fair/miniatures.ts` : identité visuelle explicite de Barnabé (en pot), Mirabelle, Maître Filou, Nicodème, Pipotin et Théophile. Les autres personnages particuliers gardent les pions existants : guenon musicienne, mime, têtes de pierre, baronne grenouille, danseuse d'ombre, tenancière et Prince.


- `adventures/sarah-of-yellowcrest-manor/miniatures.ts` réserve explicitement Sarah et le groupe final avec une valeur nulle : aucune substitution 3D, y compris par le fantôme générique. L'image utilisateur `public/adventures/sarah-of-yellowcrest-manor/sarahs-ghost.webp` et sa déclaration `npcOverlays` dans definition.ts sont conservées sans modification. Aucun modèle féminin de remplacement n'est livré.


- `lib/miniatures.ts` et `components/Battlemap.tsx` : sélection exclusivement visuelle par type, aventure et identifiant d'acteur déjà présent ; l'identité sociale permet de conserver la même figurine entre PNJ et combat. Aucune interprétation de texte, règle, appel MCP, état mécanique ou contenu de scénario modifié. Catalogue actif : 18 visuels ; les portraits seuls sont chargés en partie.


- Vérifications réussies : `npm run typecheck:next` ; 5 tests figurines (identités, isolation des aventures, exclusion explicite de Sarah, intégrité/licences/portraits) + 2 anti-fuites ; contrôle navigateur du vrai composant React pour les 18 portraits, replis, changement de modèle et clics, sans chargement GLB/WebGL. Capture finale inspectée : `output/miniatures-validation-20261031/fey-realistic-board.png` ; essais de sculptures archivés dans `fey-sculptures-candidates.png` (contient le candidat féminin ensuite écarté). Suite moteur/playtest non relancée conformément au périmètre demandé.


- Prochain travail visuel : chercher des sculptures réellement adaptées aux personnages particuliers encore sans correspondance, plutôt que réutiliser un humain, une grenouille ou un fantôme générique pour leur donner arbitrairement une apparence.





### 2026-10-31 — Halfeline de Teirale choisie pour la ménestrelle de la foire


- Demande utilisateur : intégrer la halfeline de Teirale pour les forains auxquels elle correspond, sans toucher au moteur ni à l'image de Sarah.


- Choix visuel limité à Mirabelle, la ménestrelle : `adventures/fey-shadow-fair/miniatures.ts` utilise désormais `realistic/halfling-bard`. C'est une représentation visuelle de la petite musicienne, choisie par l'utilisateur ; sa description de gnome et toutes les données du scénario restent inchangées. Les gobelins civils, la guenon musicienne et les autres forains ne sont pas remplacés par cette halfeline.


- Modèle « Bard - Female - halfling » de Teirale, Printables 77921, fichier 346792 : GLB dérivé et PNG transparent de 192 px transférés depuis les candidats vérifiés vers `public/miniatures/realistic/halfling-bard.*`. Licence CC BY 4.0, source et empreintes dans `sources.json`, attribution visible dans `credits.html` et CREDITS.md. L'ancien modèle de Mirabelle et sa provenance sont conservés dans `output/halfling-candidates/previous-gnome-bard.*`, hors catalogue actif. Catalogue actif toujours à 18 visuels.


- Seuls le choix visuel, son identifiant typé, la provenance, les crédits et l'attente du test existant ont changé. Aucune modification de composant de jeu, de map.ts, de prompt, de règle, d'outil ou de fichier moteur.


- Vérifications réussies : `npm run typecheck:next` ; 5 tests figurines + 2 anti-fuites ; navigateur sur le vrai composant React avec vérification de l'URL du nouveau portrait de Mirabelle, clics, chargement, changement de modèle et replis. Capture inspectée : `output/miniatures-validation-20261031/halfling-integrated-board.png`. `git diff --check` sans erreur sur le périmètre.


- Les empreintes de l'image utilisateur de Sarah, de sa définition de scène et de son exclusion des figurines ont été comparées avant/après : les trois fichiers sont inchangés. Suite moteur et playtest non relancés, conformément au périmètre demandé.





### 2026-10-31 — Recherche ciblée : mime, Madame Bougie, Baronne et Prince


- Recherche uniquement, sans modification du catalogue actif, du moteur ou de Sarah. Candidats et décisions conservés dans `output/fey-character-candidates/`.


- Meilleur candidat : « Mime » d'EdwinD, remix d'un modèle MZ4250, Printables 483779, licence Attribution vérifiée via API publique. Fichier sans ailes 2083909 téléchargé ; dérivé GLB de 30 000 triangles et aperçu PNG rendus puis inspectés. Provenance et empreintes dans le manifeste de recherche ; pas encore intégré au jeu.


- Candle Lady écartée après inspection (buste sans tête). Trois grenouilles royales écartées (trop stylisées/humanoïdes ou diorama). Esprit sylvestre cornu JoePrimal : piste seulement, style encore éloigné ; aucun téléchargement authentifié. Fairy King Truesdale écarté : personnage de franchise. Prochain choix concret : intégrer le mime avec attribution EdwinD et MZ4250 ; poursuivre la recherche pour les trois autres sans remplacement arbitraire.


- Validation limitée aux téléchargements, provenance et rendu du candidat ; aucun code applicatif modifié, aucune suite moteur exécutée.








### 2 novembre 2026 — Retrait du planner : un agent MJ unique





- **Statut : livré dans le périmètre demandé**, sans vérification live payante.


- Provenance : demande utilisateur explicite de supprimer le planner ; choix confirmé d’un seul agent MJ avec contrôles MCP, sans vérificateur IA ni essais live payants. Aucun audit des règles ni reconstruction des 147 lots.


- Intégration : suppression de `lib/dm/planner.ts`, de la pré-passe `dm.plan`, de ses directives/forçages et des options `LLM_PLANNER_ENABLED`/`DM_PLANNER_MODEL`. `app/api/dm/route.ts` transmet directement le message au MJ ; ce modèle choisit chaque appel MCP et ses arguments. Le modèle de compression reste indépendant ; Runpod ne requiert plus de modèle planner.


- Contexte : les exemples locaux des quatre aventures deviennent `promptGuidance.actionExamples`, injectés dans le système statique du MJ. Les consignes d’outils dédiés, d’ambiguïté, de changements certains et de refus sont portées par le MJ ; carte, état et résultats restent autoritaires et le préfixe de cache reste stable.


- Protections conservées : aucun appel de jeu fabriqué par le serveur, arguments transmis intacts, économie d’action, refus et checkpoints, reprise de combat par l’agent, mémoire bloquée après échec/refus/trajet incomplet, prose anticipant les résultats écartée. Sans résolution de jeu et sans réponse finale, la stagnation termine avec un message explicite d’action non résolue.


- Outillage : fixtures et générateur d’entraînement adaptés au flux sans classifieur (une réponse textuelle seule peut constituer un scénario), documentation et tests migrés ; ancien guide planner marqué comme archive. Les traces historiques ne sont pas supprimées.


- Contrôles intermédiaires : 61/62 tests ciblés réussis ; seule une attente ajoutée au test de coffre (`closed` + `locked`, pas un état `locked`) a été corrigée. Le playtest initial n’a pas démarré : compilation bloquée par une erreur préexistante de nullabilité dans `travel.ts`, corrigée ensuite dans les travaux concurrents. Validation finale en cours sur un instantané isolé, avec binaire MCP propre.


- Limite explicite : sans classifieur, aucune validation serveur ne peut certifier qu’un outil omis dans la prose correspondait à une intention mécanique. Le choix sémantique et l’usage d’un outil atomique restent au MJ et à ses consignes ; les validations locales/mock ne mesurent pas la qualité d’un modèle réel.


- Générateurs vérifiés : `scripts/generate-training-dataset.cjs`, `scripts/training/pilot.json` et `scripts/training/mcp-rule-research-v1.json` ne produisent plus `dm.plan`/`decide_action`. Le pilote exécute huit scénarios et exporte **17 exemples** (13 train, 4 validation). La recherche de règles exécute 16 scénarios : **61 réponses**, dont **45 cibles MCP** et 16 textes exclus ; aucune exclusion planner. Les cinq tests du générateur passent dans la revalidation ciblée : requêtes/cibles et traces exactes, schémas, chronologie, refus d'un résultat attendu faux, séparation des splits et zéro accès réseau. Les archives antérieures ne sont pas réécrites.


- Validation finale, sur copie isolée pour protéger le binaire des compilations concurrentes : **`npm run typecheck` réussi**, compilation MCP réussie, **121/121 tests ciblés** puis **10/10 tests du mock et des frontières IA/MCP**. **`npm run playtest:mock` réussi : 30/30 tours, neuf scénarios, 71 appels mock, moyenne 2,3667/tour, coût estimé 0 $**, contrôles MCP/état/SQL/narration/fin des tours validés. Journaux dans `output/planner-removal/` : `final-typecheck.log`, `current-retests.log`, `final-mock-tests.log`, `final-playtest.log`. `git diff --check` réussi sur le périmètre du retrait.


- Suite complète exécutée : **1 830/1 838 réussites** sur le premier instantané pris pendant les travaux concurrents. Les huit échecs portaient sur la fixture de Perception passive (collection `monsters` manquante, complétée dans ce lot), l'hydratation du test d'argenture et six cas météo. Les corrections de ces derniers existaient ensuite dans le workspace ; les fichiers concernés ont été revalidés avec succès dans les 121 tests ci-dessus. **La suite globale n'a pas été relancée intégralement après ce rafraîchissement** : ces résultats ne certifient pas tous les autres changements concurrents. Provenance et détails : `isolated-tests.log`, `passive-retest.log`, `current-retests.log`.


- Raccord avec l'évolution concurrente du social : le mock et le playtest actuels utilisent la procédure standard 2014, avec conversation persistée et sans création d'empathie maison implicite ; le test de campagne conserve l'opt-in explicite `campaign_empathy`. Les assertions de scénario lisent les véritables reçus et l'unique journal `Interaction sociale`, sans modifier les règles du moteur. Découverte du dernier playtest : le faux fournisseur pouvait ouvrir une autre conversation après `end_combat` et dépasser son budget d'appels. Corrigé dans `lib/dm/mock-llm.ts` : narration après `end_combat`/`run_monster_turns`, sans nouvelle interaction issue de l'ancien message. Régression : une interaction et cinq appels pour la paix réussie ; aucun parseur ni appel fabriqué ajouté au serveur live.


- Limite restante et prochain contrôle possible : évaluer qualitativement les choix d'outils du modèle réel dans un lot live séparé, seulement lorsqu'il sera explicitement autorisé. Le présent lot n'entraîne aucun modèle et ne prétend pas mesurer cette qualité. Aucun appel live autorisé ni effectué.


- Traçabilité : `output/planner-removal/validation-report.json` et `current-tested-source-hashes.json` décrivent exactement la copie testée. En fin de contrôle, trois fichiers avaient encore évolué dans les travaux concurrents : `app/api/dm/route.ts` (budgets et outils de grimoires/social), `lib/dm/prompts.ts` (consignes correspondantes) et `scripts/playtest.cjs` (une assertion). Ces changements ultérieurs ne réintroduisent pas le planner, mais ne sont pas couverts par les résultats de la copie figée ; ne pas présenter ceux-ci comme une certification globale du workspace courant.





### 2 novembre 2026 — Annexe documentaire 5e.tools pour Sarah





- Provenance : demande utilisateur de récupérer les blocs de statistiques et compléments des PNJ, puis de les ajouter en fin du Markdown de campagne. Aucun audit de règles ni modification de la mécanique.


- Intégration : `scripts/import-5etools-campaign.cjs`, manifeste `adventures/sarah-of-yellowcrest-manor/5etools-import.json`, annexe finale balisée de `adventure-module.md`. Dépôt public 5etools 2014 lié depuis le site, version figée `v1.221.2` ; quatre JSON en cache local `.data/5etools-campaign/`, URL et SHA-256 dans l’annexe. Onze entrées PNJ, douze profils référencés par le chapitre, dont Faerl et le grell original. Statistiques de référence conservées, compléments narratifs français synthétisés et reliés aux passages source ; aucun profil de PNJ manquant inventé.


- Limites explicites : le manifeste contient des synthèses relues, pas une traduction automatique exhaustive ; les blocs spécifiques non SRD ont une synthèse mécanique. Les profils n’activent aucun pouvoir ni événement MCP et ne remplacent pas les adaptations solo existantes. Le titre documentaire `## Bestiaire` permet au parseur existant d’exclure l’annexe des prompts de jeu et des sections de salle.


- Vérifications : passages ciblés 5/5 réussis (idempotence, conservation du document, refus des marqueurs corrompus/profils absents, CLI hors ligne, exclusion des prompts). Import réel exécuté puis `--offline --check` réussi ; TypeScript complet réussi. Suite générale interrompue à la demande explicite de l’utilisateur, qui réserve cette conversation aux stat blocks ; aucun playtest lancé. Comparaison documentaire du chapitre original aux titres de l’annexe : douze profils distincts dans chaque ensemble, aucun profil manquant ; Ashlan est explicitement non combattant sans bloc propre. Aucun résultat de suite complète n’est revendiqué.


- Prochain travail concret : utiliser `node scripts/import-5etools-campaign.cjs --offline --write` pour régénérer cette annexe ; toute intégration mécanique de ces profils exige un lot distinct avec validation des capacités, sans substitution implicite.





### 2 novembre 2026 — Fiches de tous les PNJ et groupes à effectif décroissant





- Provenance : demande utilisateur d’une fiche mécanique pour chaque PNJ, étendue explicitement aux quatre campagnes ; demande supplémentaire de profils spécifiques pour les pions collectifs, inspirés des essaims, dont les pertes réduisent progressivement l’effectif. Aucun audit global.


- Données : 34 entrées PNJ dans les quatre `map.ts`, plus le témoin des donjons générés. Profils MM/SRD 2014 explicités ; Ape, Gargoyle, Shadow et Archmage ajoutés depuis leurs quatre endpoints 2014 dans `lib/srd/monsters.json`, réponses et empreintes conservées. Bestiaires structurés complétés et documents régénérés. `scripts/list-npc-stat-blocks.cjs --write` produit la liste complète `docs/npc-stat-blocks.md`, avec les acteurs des rencontres déjà profilés.


- État : `lib/npc-stat-blocks.ts`, types et amorçage partagé initialisent PV, CA, caractéristiques, attaque, mouvements et instantané publié sourcé. La synchronisation publique complète les anciens états sans restaurer leurs blessures/positions ; les restaurations internes restent inchangées. Schémas MCP étendus pour conserver les champs. PNJ révélé sur la carte active consultable par `get_monster_stat_block({monsterId})` et ciblable par les résolveurs ; inscription au combat uniquement via `enter_combat` explicitement choisi. Acteur de combat et pion partagent leurs données vivantes, reliées au chargement. Le contexte local fournit fiches et effectifs sans injecter tous les acteurs au système statique.


- Groupes maison `shared-hp-attrition-v1` : trois Têtes Jacassantes sur base Gargoyle (156 PV), cinq captifs sur base Commoner (20 PV), cinq esprits finaux sur base Ghost (225 PV). Une tranche entière de PV individuels perdue retire un membre capable d’agir ; dés et bonus de dégâts multipliés par l’effectif restant. Soins et PV temporaires refusés ; KO collectifs refusés faute d’épisodes individuels. Aucune immunité d’essaim supplémentaire inventée, aucune victime nommée désignée ni mort individuelle déduite d’une perte d’effectif. Les anciennes blessures de groupe dont le maximum est incompatible exigent une migration explicite, sans effectif reconstruit au hasard.


- Vérifications et limites : aucune suite ni playtest exécuté, conformément à l’instruction utilisateur. TypeScript complet réussi dans son premier passage ; les erreurs transitoires des travaux concurrents poison/combat ont ensuite disparu sans modification de ces fichiers par ce lot. Compilation MCP finale réussie en sortie0 (`output/npc-stat-blocks-build-complete.log`) et catalogue régénéré depuis les 34 états initialisés compilés. Les réponses de dégâts portent aussi l’effectif avant/après et les pertes de membres. Aucun résultat de validation comportementale n’est revendiqué. Les nouvelles affectations de profil ne rendent pas automatiquement tous leurs pouvoirs exécutables ; les limites `engineSupport` restent applicables. Aucun processus de partie ouverte arrêté.


- Prochain travail concret : recharger les parties avec un nouveau processus moteur pour bénéficier de l’hydratation ; traiter explicitement les anciennes blessures collectives incompatibles et les anciens PNJ à0PV sans état de vie, refusés sans reconstruction arbitraire. Vérifications comportementales dans une autre conversation si demandées, sans lancer de tests ici.








### Retrait du système relationnel maison — 2 novembre 2026





Demande explicite de l’utilisateur : supprimer le modèle d’empathie personnalisé


et conserver exclusivement les interactions sociales D&D 2014. Ce choix remplace


les anciennes mentions d’une option de campagne dans PHB-SOCIAL-POLICY et


SOCIAL-DMG-REACTIONS ; aucun nouvel audit ni scanner des livres exécuté.





Retrait des scores/types initiaux, calculs de variation et de DD, outil


`record_social_interaction`, sélecteur `configure_social_policy`, prompts,


narration et branche mock correspondants. Profils et contenus des quatre


aventures nettoyés ; personnalités, motivations, goûts, restrictions et identités


entre scènes conservés. Les six outils standard restent dans le catalogue.


Les frontières SQL et MCP retirent les anciens champs/sélections inutilisées ;


les anciens jets soumis à une autre règle ne sont jamais recalculés et restent


refusés par la validation. Fichiers : `lib/social.ts`,


`lib/social-interaction-state.ts`, `lib/session-store.ts`,


`mcp-server/social.ts`, `mcp-server/social-interactions.ts`, outils, prompts,


mock, profils d’aventures, tests sociaux et `scripts/playtest.cjs`.





Validation intermédiaire : `npm run typecheck` en sortie 0. Lot ciblé : 85/86,


avec un seul échec de comparaison JSON/`undefined` dans une fixture de


personnalités, corrigé avant la suite complète ; suite complète et playtest mock


en cours. Trois erreurs de compilation hors social ont été rencontrées : import


`inspectExhaustion` depuis le mauvais module dans `basic-poison-hits.ts`, puis


narrowing `isError` inconnu dans la multiattaque, et passage d’un `AttackResult`


à un paramètre `Record<string, unknown>` du poison ; corrections minimales appliquées


pour rendre la validation possible. Aucun résultat global final revendiqué ici.





Constat pendant la régression complète : le cas de refus de Charme-personne


(`tests/charm-person.test.cjs`) copiait une fiche mécanique dans sa cible dite


sans fiche ; fixture corrigée en retirant `statBlock`. Il révèle ensuite que


`charmTarget` acceptait le pion collectif comme un seul humanoïde après l'ajout


des fiches PNJ. Garde ciblé ajouté avant toute dépense dans


`mcp-server/charm-person.ts`, conformément au contrat de test existant ; aucun


membre de groupe choisi automatiquement. Reprise et validation finale à suivre.





Suite complète initiale : **1 887/1 891 réussites**, quatre échecs, aucun skip


ou annulation, 1 310 981 ms. Outre Charme-personne décrit ci-dessus :


`round-events.test.cjs` construisait un PNJ sans sa fiche ensuite ajoutée par


l’hydratation (comparaison corrigée pour vérifier tous les champs sauvegardés


tout en autorisant cet enrichissement de fiche) ;


`srd-bestiaries.test.cjs` attendait encore 27 entrées au lieu des 31 après les


quatre ajouts PNJ (assertion mise à 31, toutes les vérifications numériques et


d’empreintes conservées) ; `yellowcrest-social-personalities.test.cjs` comparait


aussi les nouvelles références de lore propres à chaque scène au lieu de la


seule personnalité/contraintes partagées (comparaison de tous les champs sociaux


sauf ce lore de scène). Ces évolutions PNJ/lore étaient présentes dans l’arbre


partagé pendant le lot ; aucun import ni contenu sourcé n’a été régénéré ici.


Les occurrences naturelles d’« empathized » dans les citations de campagne sont


conservées ; le verrou porte sur les champs et outils du modèle mécanique retiré.


Reprise finale des douze suites concernées, TypeScript et playtest en cours.








**Retrait livré — validation finale** : `npm run typecheck` puis compilation MCP


terminent en sortie 0 (`output/social-standard2014-typecheck-final.log`,


`output/social-standard2014-build-final.log`). Les douze suites concernées donnent


**113/114** réussites ; le seul échec restant dans cette reprise était la fixture


de blessure de PNJ, dont la tentative de remplacement par une fiche complète ne


testait plus le même cas legacy. Cette tentative a été retirée : la fixture


legacy est conservée et chaque champ sauvegardé est comparé après hydratation,


sans interdire les nouveaux champs mécaniques. Reprise complète de ce fichier :


**5/5**, sortie 0 (`output/social-standard2014-round-events-final.log`). Les quatre


échecs de la suite globale initiale ont donc tous une reprise réussie ; aucune


seconde suite globale entièrement verte n’est revendiquée. Le résultat des


onze autres suites reste celui de la reprise de douze fichiers, sans addition


artificielle des cas rejoués (`output/social-standard2014-targeted-final.log`).





`npm run playtest:mock` termine en sortie 0 : **30/30 tours, neuf scénarios,


71 appels mock, 2,3667 appels/tour et 0 $**, objectifs OK


(`output/social-standard2014-playtest.log`). Le dialogue utilise les outils


standard et persiste sa conversation sans duplication. Catalogue et prompts


verrouillés sans les anciens outils/champs ; seuls le lecteur de compatibilité


et les tests négatifs connaissent encore les anciennes clés. Les quatre


artefacts compilés orphelins de l’ancien outil ont également été retirés.


`git diff --check` est réussi sur les fichiers concernés.





Limite conservée : un ancien reçu de jet soumis à une autre règle n’est jamais


réécrit rétroactivement ; sa validation reste refusée. Les anciennes parties ne


contenant que les scores ou des sélections inutilisées sont nettoyées au


chargement, sans perte de personnalité ni dé supplémentaire. Aucun scanner ni


audit global des livres n’a été exécuté. Prochain travail social : maintenir ce


seul contrat 2014 ; aucune variante relationnelle maison à réintroduire.





### 2 novembre 2026 — Dossiers narratifs complets des PNJ de Sarah, injectés localement





- Provenance : demande utilisateur de récupérer toutes les informations supplémentaires disponibles sur 5e.tools, de les rattacher aux profils et de les transmettre dynamiquement au MJ ; instruction explicite de ne lancer aucun test. Aucun audit des règles.


- Sources et import : cinq JSON du dépôt public 5etools 2014, version figée v1.221.2, récupérés explicitement. Nouvelle recette npcLore dans adventures/sarah-of-yellowcrest-manor/5etools-import.json ; scripts/import-5etools-npc-lore.cjs génère npc-lore.json. 24 dossiers, 153 paragraphes du chapitre reliés aux identités/sections, plus les compléments du bestiaire : celui de Faerl et neuf archétypes MM utilisés. Paragraphes complets conservés, dont listes, savoir/ignorance, apparence, histoire, réactions, secrets, traits/idéaux/liens/défauts ; références, pages, identifiants et SHA-256 conservés. Portraits crédités référencés, sans téléchargement ni modification des visuels utilisateur.


- Raccord : SocialLoreSchema dans lib/social.ts ; type d'acteur explicite pour les correspondances. lib/context-loader.ts charge les dossiers côté serveur et enrichit les profils après le filtre spatial de lib/dm/local-bestiary.ts. Bindings des 14 pions/alias et cinq types de rencontres. Faerl et Vecken réutilisent leurs identités ; captifs et esprits finaux réunissent leurs membres. Les personnalités sources complètent les champs fixes sans effacer les tirages sauvegardés. loreRef relie l'acteur au dossier ; les passages communs sont dédupliqués entre dossiers locaux.


- Confidentialité et mécanique : aucun import de npc-lore.json dans social.ts, map.ts, le moteur partagé ou le client. Le bloc statique et les annexes documentaires ne servent pas à injecter ce casting. Les notes distinguent sources papier, adaptations solo et état courant ; aucune révélation, connaissance du joueur, récompense, possession, capacité, troupe ou action MCP ne découle automatiquement d'un texte importé. Les paragraphes génériques de bestiaire ne sont pas des faits individuels acquis.


- Limites de la source explicites : archiviste et cordonnier sont des rôles anonymes adaptés ; la gardienne des sépultures n'a aucun supplément individuel sur 5e.tools et conserve son profil de campagne. Les quatre captifs et les enfants Yellowcrest n'ont pas de biographies individuelles supplémentaires inventées. Les mentions de Yacken et Sirok restent dans les dossiers pertinents, sans création de nouveaux pions.


- Validation : npm run typecheck réussi (MCP et Next, sans émission), sortie0 dans output/npc-lore-typecheck-final.log ; import réel avec --refresh --write, régénération hors ligne et inspection des couvertures/bindings. Aucune suite de tests, aucun playtest, aucun appel LLM ni outil de jeu exécuté pour cette évolution. Aucune recompilation du dist partagé ni interruption de partie pendant les validations concurrentes.


- Suite concrète : recharger le contexte de l'application après régénération (invalidateContextCache ou redémarrage) ; les autres aventures restent sans dossier narratif importé tant qu'un contenu propre n'est pas demandé.





### 2 novembre 2026 — Grammy : deux pâtissiers visibles depuis le quai





- Provenance : demande utilisateur de remplacer l'embuscade du sol de la boulangerie par deux gobelins qui essaient de faire des tartes aux pommes en se chamaillant, visibles depuis le quai de chargement. Aucun audit ni scanner.


- Contenu : `adventures/grammys-country-apple-pie/map.ts` conserve l'identifiant `bakery_floor_goblins`, avec deux gobelins SRD aux plans de travail (7,5) et (7,6). Accroches des salles 7/8 et module narratif alignés : à découvert, observation depuis la porte ouverte selon la ligne de vue, dialogue possible ; aucune attaque automatique à l'entrée ou au toucher des ustensiles. Le MJ choisit toujours explicitement un éventuel combat. Bestiaire régénéré depuis son JSON, effectif et XP actualisés. Attentes des tests et du harnais mock ramenées de six à cinq personnalités tirées.


- Vérification géométrique : les deux positions sont visibles depuis le seuil du quai (5,6) via `playerSeesCell`, sans déplacement dans la salle 8.


- Validation générale tentée dans `output/grammy-baking-goblins-20261102` : `npm run typecheck` et `npm test` bloquent sur la syntaxe du chantier concurrent `mcp-server/ground-gear-contacts.ts:90` (TS1005, accolade fermante attendue). Le playtest npm rencontre la même erreur ; une copie de binaires lancée avant la fin de cette compilation a aussi causé un EBUSY dans le privé. Cette copie a été refaite après la fin de la commande. Aucun fichier de ce chantier concurrent ni moteur partagé modifié.


- Vérifications ciblées terminées : moteur compilé de l'instantané W15 existant, avec uniquement la carte Grammy retranspilée dans le privé ; tests du module, transport MCP, surprise, personnalités, réactions, mock et moteur, puis playtest direct sans recompilation. Résultats : 131/131 tests ciblés (194349 ms), sortie 0 ; playtest direct 30/30 tours, neuf scénarios, 71 appels mock, 0 $, objectifs OK (44281 ms), sortie 0. Journaux : targeted.log et playtest-validated-engine.log dans le privé. git diff --check réussi sur les fichiers concernés. Le contrôle Next séparé bloque aussi sur TS1005 dans ground-gear-contacts.ts. Cette validation bornée ne certifie pas les sources moteur concurrentes du ROOT.


- Limite : une rencontre déjà engagée et sauvegardée conserve ses participants ; aucun état de partie existante n'est réécrit. Prochain travail concret : relancer les validations générales sur les sources du chantier concurrent une fois compilables.


