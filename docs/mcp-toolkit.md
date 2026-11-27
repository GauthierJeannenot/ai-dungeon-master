# Outils MJ — lots PHB / DMG / Xanathar

Suivi du travail identifié et des prochaines intégrations : [registre canonique](suivi-integration-mcp.md), mis à jour au fil des lots sans nouvel audit global.

Les outils ci-dessous sont enregistrés dans le processus MCP de chaque session.
L'IA choisit leurs arguments. Le serveur ne déduit aucune action du texte joueur
et ne fabrique aucun appel de jeu. `get_rules_support({domain?})` donne les
sources, capacités et limites exactes de chaque domaine.

Combats de fosse non létaux de Xanathar : les six outils `*_xge_pit_fighting` mesurent une vraie semaine, ses trois tests, son bonus de CON et son prix explicite. Voir [la procédure et ses limites](xge-pit-fighting.md).

Sociabilité de Xanathar : huit outils Carousing, dépenses réelles, contacts nommés ou non spécifiés et consommations persistées. Voir [la procédure et les conventions utilisateur](xge-carousing.md).

Service religieux de Xanathar : les outils `*_xge_religious_service` et `spend_xge_religious_favor` mesurent la semaine réelle, son test et ses promesses globalement plafonnées. Voir [la procédure](xge-religious-service.md).

### Raccords W10 en validation

- `resolve_fall` applique les dégâts d'une chute terminée établie explicitement
  par le MJ, avec distance réelle et reçu idempotent. Aucune altitude ou
  variante Xanathar n'est déduite : voir [chutes](falling.md).
- `inspect_breathing` lit les échéances ; `set_breathing_context` établit un
  fait physique du MJ. Les effondrements, sauvegardes dues et verrous de soin
  restent au moteur : voir [respiration](breathing.md).
- `create_ammunition` prépare une pile comptée au sol hors combat. Les tirs
  demandent sa possession et `ammunitionItemId` exact ; Loading suit une
  véritable action, et un jet suspendu conserve sa dépense. Aucun stock ancien
  ou reprise gratuite n'est inventé.
- `recover_ammunition` recherche les vrais projectiles d'une bataille achevée
  en une minute effective : moitié du total expensé, une seule recherche,
  champ de bataille entier dans la même pièce. Une composition mixte exige
  les quantités explicitement arbitrées par le MJ, jamais une priorité de prix.
  La recherche traversant plusieurs pièces reste un travail distinct.
- `inspect_carrying_capacity` et `assess_handling_load` évaluent la charge
  standard. `set_carrying_context` et `declare_physical_weight` établissent
  les faits physiques manquants, sans transport ni transformation : voir
  [portage](carrying.md). Les gardes de prise/déplacement sont réelles une fois
  le suivi établi ; les autres gains sont le raccord suivant.
- L'initiative standard 2014 reste conservée pendant la rencontre ;
  `enter_combat.tieOrder` permet l'arbitrage explicite des égalités. Les groupes
  de monstres identiques sourcés partagent un vrai jet. Consulter le
  [suivi](suivi-integration-mcp.md) pour les validations et limites restantes.

Les extensions suivantes complètent les trois premiers lots, avec leurs limites
et leurs tests propres :

| Domaine | Guide |
|---|---|
| Parchemins : lecture, activation, copie réelle | [Parchemins SRD](mcp-spell-scrolls.md) |
| Lumière, combustible, vision, perception visuelle | [Éclairage et vision](lighting-and-vision.md) |
| Trésors de repaire, gemmes, objets d'art | [Repaire et valeurs](treasure-hoards.md) |
| Poisons persistants et pourriture oculaire | [Afflictions](persistent-afflictions.md) |
| Malédictions par de vrais sorts | [Malédictions](curses.md) |
| Sphère complexe, impulsions et contre-mesures | [Pièges complexes](complex-traps.md) |
| Réserve de PV temporaires et absorption | [PV temporaires](temporary-hp.md) |
| Couverture directionnelle et origines réelles | [Couverture](cover.md) |
| Attaque bonus avec deux armes physiques | [Combat à deux armes](two-weapon-fighting.md) |
| Déplacement conjoint pendant une prise | [Transport en prise](grapple-transport.md) |

Les nouveaux états restent dans la même session. Une inspection ou la lecture
d'un parchemin ne satisfait pas une activation ou collecte prévue. Les outils
atomiques refusent un jet générique préalable à leur propre résolution.
Les événements MJ (contamination, poison dû, impulsion de piège) restent
explicitement demandés par l'agent ; aucun appel de jeu n'est fabriqué côté route.

## Consultation, improvisation et plans

- `consult_rules` recherche et lit les quatre livres fournis et le supplément
  officiel `srd-5.1-2014`, avec provenance et pagination bornée. Les tables
  Markdown indexées ont un `tableId` ; thèmes disponibles : `npc`, `adventure`,
  `dungeon`, `life`, `treasure`, `names` et `trinkets`. Une page SRD extraite
  n’est pas automatiquement une table de tirage. Voir [la bibliothèque](rules-library.md).
- `roll_table({tableId,dieColumn?})` valide le dé et toutes les plages avant le
  tirage. Il retourne le dé, la ligne source et sa provenance. Les colonnes
  ambiguës/incomplètes sont refusées ; aucun sous-tirage n'est automatique.
- `create_npc` prépare hors combat un PNJ avec identifiant unique, case libre,
  bloc SRD local, disposition, visibilité et personnalité confidentielle.
  Il ne devient pas automatiquement un combattant ni une récompense/quête.
- `inspect_scene` lit cinq objets, pièges ou PNJ improvisés de la salle/map
  actuelle, sans en faire une découverte du personnage.
- `generate_dungeon` assemble les tuiles au crayon à partir d'une graine,
  dimensions et quantité explicites. `validate_dungeon` vérifie bornes,
  unicité des cases, rotations, raccords réciproques, connexité et entrée/objectif.
  La sortie fournit un lien de prévisualisation. `install_dungeon` permet
  ensuite d'ajouter explicitement une carte jouable dans la même session,
  reliée à la quête principale ; voir [le guide](playable-random-dungeons.md).
  L'aventure/personnage fixés au spawn ne changent jamais.

Les créations maison demandées par l'utilisateur sont identifiées dans les MD
par `Homebrew:` et `[CRÉATION MAISON]`, dans les réponses par `source.origin`.
Les empreintes originales et courantes sont conservées dans le manifeste.
Les exemples d'usages d'outils et la règle maison d'identification de sorts
restent des options documentaires, sans effet moteur implicite.

## Actions PHB et réactions

`combat_action` garde Foncer, Se désengager et Esquiver, et ajoute :

| Action | Résolution |
|---|---|
| `grapple` | Main libre, cible au contact et d'au plus une taille supérieure ; Athlétisme opposé à un choix explicite Athlétisme/Acrobaties. Remplace une attaque, conserve Attaque supplémentaire. |
| `shove` | Même opposition ; choix explicite entre à terre et une case cinq pieds directement à l'opposé. Géométrie/occupation validées avant le dé. |
| `escape_grapple` | Action et compétence choisie contre une prise contestée suivie dans les effets ; les prises spéciales de monstres gardent leur outil. |
| `release_grapple` | `actorId` désigne le détenteur exact, joueur ou monstre ; `effectId` vise sa prise active dans `hero.effects` ou `monsterEffects`. Libère sans action ni soin ; aucun contournement d’une activation de PNJ réactif. |
| `help` | Allié, tâche/compétence ou ennemi précis ; avantage sur le premier jet correspondant, jusqu'au prochain tour du joueur. |
| `hide` | Refus en pleine vue ; vrai test de Discrétion, état suivi et fin lors d'une attaque ou d'une ligne de vue retrouvée. |
| `stand_up` | Moitié de la vitesse en déplacement, sans action ; refus si déplacement insuffisant ou vitesse nulle. |
| `stabilize` | Acteur explicite au contact, Médecine DD10, joueur vivant instable à 0 PV ; une action, aucun soin. |
| `ready` | Attaque, déplacement ou sort d'une action avec déclencheur perceptible décrit explicitement. |

`resolve_readied_action` exige la préparation exacte et l'événement observé.
L'IA juge le déclencheur ; aucun analyseur de texte ne le fait côté serveur.
L'attaque est unique, même avec Attaque supplémentaire. Le déplacement emploie
un budget distinct de réaction et peut être interrompu par une opportunité.
Le sort paie à la préparation, exige la concentration et réutilise ses cibles
ou zone explicitement préparées ; pas de deuxième emplacement à la libération.
Expiration/perte de concentration n'en rembourse pas le coût.

Les continuations de jets sont persistées. Inspiration bardique, Mots cinglants
et Bouclier reprennent les mêmes dés avant d'appliquer l'effet. Une égalité
de contestation conserve la situation précédente. `preview_grapple_transport`
puis `move_grappled_creature` déplacent une vraie prise avec deux destinations
explicites, budget réduit selon les tailles sources et réactions persistées.
Le `move_token` ordinaire du détenteur refuse de transporter implicitement la
cible ; relâcher la prise permet la navigation normale. Voir [le guide](grapple-transport.md).

## Objets, équipement et pièges

`create_scene_object` prépare hors combat conteneur, levier ou obstacle dans
une salle existante. CA de matériau et PV moyens taille/résilience viennent du
DMG ; les DD serrure/forçage sont explicitement autorés. Un levier peut piloter
une porte autorée de la même map. Un obstacle intact bloque réellement sa case
ou ses 2×2 cases pour une grande taille.

`interact_object` inspecte, ouvre/ferme, active/désactive, crochette, force ou
attaque l'objet exact. Une manipulation ordinaire utilise la première interaction
d'objet gratuite du tour, puis une action. Forçage/crochetage font leur propre
jet atomique. Attaquer remplace une attaque. Les contenus PHB préparés (trousse,
antitoxine, torche, outils de voleur) deviennent des objets au sol une seule
fois, puis sont repris par `pick_up_item`. Une prose de module n'est jamais
convertie automatiquement en objet mécanique.

`equip_item` active un équipement explicite pour la session. CA, mains, armes,
désavantage de discrétion et style Duel suivent le port réel. Porter dans
l'inventaire n'est alors plus équiper. Les anciennes sessions conservent leur
comportement jusqu'à la première opération explicite. Dessiner/ranger une arme
emploie une interaction ; le bouclier une action ; une armure le temps PHB hors
combat. Armures sans maîtrise et pénalités de Force non représentées sont refusées.
Tous les prérequis somatiques et propriétés d'équipement ne sont pas complétés.

`use_item` prend en charge trousse (dix usages, stabilisation sans soin ni jet),
antitoxine (avantage contre le poison une heure, sans guérison) et torche (durée
et éclairage réels via `manage_light_source` ; voir [éclairage](lighting-and-vision.md)).
Potions de soin : outil existant. Harmonisation et activation utilisent les
outils du lot objets magiques ci-dessous ; les parchemins ont leur
[guide propre](mcp-spell-scrolls.md).

`create_trap` prépare un modèle simple de Xanathar : `bear`, `crossbow`, `pit`
ou `poison_needle`. DD, attaques, dégâts et seuils de déclenchement sur échec
sont fixes et sourcés. L'aiguille exige un conteneur verrouillé à la même case.
`interact_trap` recherche, désamorce, déclenche un événement explicite ou libère
une victime de mâchoires. Les seuils d'échec déclenchent leurs conséquences
dans la même action ; Bouclier/Inspiration peuvent suspendre la résolution.
Une répétition ne déclenche pas une deuxième fois un piège déjà utilisé.

Un conteneur piégé signale un événement non résolu : l'agent choisit explicitement
`interact_trap` et la victime avant de réévaluer l'ouverture. Aucun déplacement
ni texte ne lance automatiquement cet outil. Joueur et combattants moteur sont
pris en charge ; PNJ narratifs, pièges complexes, réarmement et géométrie verticale
de sortie de fosse restent hors couverture. Chute/sauvegarde/dégâts sont résolus.

## Persistance et validation

`GameState.dmTools` est validé par Zod et conservé par `replace_game_state` et
la session Postgres, sous forme JSON. Il porte objets, pièges, personnalités, équipement et
usages d'objets. Les continuations sont dans `hero.pending`. La projection MJ
locale filtre les autres maps et limite les aperçus. Une création identique
est idempotente sans réinitialiser PV, contenu ou visibilité ; d'autres données
sur le même identifiant sont refusées.

La route traite consultation, tirage, inspection et plans comme références,
sans accomplissement du plan mécanique. Les interactions ont leurs checkpoints.
Un jet générique préalable ne remplace pas un résolveur atomique planifié.
Les heuristiques de test restent exclusivement dans `mock-llm.ts`.
Les tests `mcp-toolkit-*`, `dm-toolkit` et `homebrew-library` couvrent sources,
coûts, sauvegarde/reprise, refus sans mutation, réactions et frontière agent.

## Deuxième lot — butins, monnaies et maîtrises d'outils

Ce lot enregistre cinq nouveaux outils MCP. Le choix et tous les arguments
restent ceux de l'IA ; aucun message joueur n'est analysé côté serveur.

| Outil | Résolution moteur |
|---|---|
| `create_treasure` | Prépare hors combat un butin de pièces avec ID, description et case explicites. `mode: individual` tire le d100 puis les dés de pièces des tables individuelles du DMG (FP 0–4, 5–10, 11–16, 17+), avec multiplicateurs ; `mode: authored` exige les pièces fixées par le MJ. Les modes sont exclusifs. |
| `collect_treasure` | Transfère une fois ce butin vers la bourse, au contact dans la salle/map courante. Un `containerId` explicite lie le butin à un conteneur de la même case ; il doit être ouvert ou détruit. Aucune fouille, ouverture ni résolution de piège implicite. En combat SRD, première interaction gratuite, puis une action. |
| `spend_currency` | Débite hors combat les dénominations réellement disponibles, avec motif et `transactionId`. Aucun rendu de monnaie automatique, achat, service ou nouvel objet. |
| `exchange_currency` | Après un échange établi par le MJ dans le motif, échange hors combat deux ensembles explicites de pièces de valeur strictement identique. Aucune valeur arrondie, aucun marchand ou stock inventé. |
| `resolve_tool_check` | Un test du joueur SRD avec un outil réellement possédé. Caractéristique, DD et tâche sont explicitement choisis. Maîtrises d'outil/compétence viennent de la fiche, sans cumul ; expertise de compétence conservée si applicable. Une action en combat ; Inspiration/Mots cinglants reprennent le même dé après hydratation. |

Les calculs utilisent uniquement des entiers en cuivre : pc 1, pa 10, pe 50,
po 100, pp 1 000. Les profils SRD commencent avec leurs 250 po existantes
dans cette bourse unique ; les autres profils n'obtiennent aucune pièce nouvelle.
L'ancienne réserve `hero.gold` est migrée une seule fois, en préservant les
pièces déjà acquises. Les descriptions d'inventaire, récompenses et quêtes
ne sont jamais converties en richesse. La copie de sorts débite cette même
bourse avec des dénominations explicites (`paid`).
Le poids des pièces (50 pièces par livre) est indiqué, sans charge automatique.
Préparation et collecte sont distinctes : un résultat de `roll_table` ne
crédite aucune pièce. Le moteur lit et valide les formules du MD contrôlé par
SHA-256, avant le moindre dé ; il ne recopie pas une interprétation du LLM.

`GameState.dmTools.treasures`, `wallet` et `currencyTransactions` sont
optionnels pour garder les sauvegardes du premier lot lisibles. Les butins
restent liés à leur map/salle ; la bourse accompagne le personnage. Les mêmes
IDs de butin ou de transaction rejoués avec les mêmes arguments ne relancent
aucun dé et ne redonnent/débitent aucune pièce. Un changement d'arguments est
refusé. Limites : 64 butins, 512 reçus conservés et un milliard de pièces par
dénomination. Aucun reçu n'est effacé pour autoriser un nouveau paiement.
`inspect_scene({category: "treasures"})` pagine les seules références locales
confidentielles ; ce n'est pas une découverte du joueur.

Les conteneurs peuvent maintenant fournir les 37 types d'outils PHB (y compris
instruments/jeux spécifiques) et les fournitures du premier lot. Leurs
`equipmentId` canoniques permettent de reprendre puis utiliser l'outil réel.
Les véhicules restent exclus. Le registre copie `CharacterTemplate.toolProficiencies`
vers le joueur initial ; le barde de niveau 7 choisit explicitement luth, flûte
et tambour, avec le seul luth possédé au départ. Aucune maîtrise n'est déduite
de la classe ou ajoutée rétroactivement à une sauvegarde.

`relatedSkill` doit être une compétence canonique de la caractéristique choisie.
L'option Xanathar `useXanatharAdvantage: true` n'est appliquée qu'à ce test et
nécessite les deux maîtrises réelles. Les exemples maison de DD restent des
propositions à choisir explicitement. Les outils de voleur utilisent toujours
`interact_door`, `interact_object` ou `interact_trap`, et l'influence sociale
son jet ciblé. Le test d'outil générique ne crée ni objet/soin/poison, ni points
de réparation, ni monnaie ou découverte automatique. L'échec conserve les
informations conditionnées à la réussite confidentielles.

Hors couverture de ce deuxième lot : trésors de repaire, gemmes/objets d'art,
commerces, fabrication et identification de sorts. Les outils
de ce lot n'automatisent aucun de ces effets. `get_rules_support` expose les
domaines `treasure` et `tool_checks` avec ces limites.

## Troisième lot — objets magiques

Six outils permettent au MJ de préparer puis résoudre les objets magiques des
profils SRD, dans la même session. Les règles générales viennent du DMG fourni ;
les fiches individuelles absentes de cet export sont tirées du
[SRD 5.1 officiel (2014)](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf).
Les passages sources, pages et empreintes sont conservés dans
`lib/srd/magic-items-sources.json`, avec attribution CC BY 4.0 dans le fichier
`magic-items.LICENSE.txt`. Aucune puissance d'objet n'est inventée.

| Outil | Résolution moteur |
|---|---|
| `inspect_magic_items` | Sans ID : catalogue confidentiel. Avec `itemId` : uniquement propriétés identifiées et charges connues. Lecture sans action ni découverte. |
| `create_magic_item` | Prépare hors combat une instance physique au sol, avec modèle, ID, apparence et case explicites. Ni acquisition ni identification ; ramassage séparé. Les répétitions identiques ne rechargent ni ne recréent un objet détruit/consommé. |
| `identify_magic_item` | `study` : un repos court entier, propriétés seulement. `taste` : reconnaître une potion sans la consommer ni se soigner. `spell` : véritable Identification, sort connu/préparé ou rituel autorisé, perle canonique réutilisable de 100 po et durée/coût réels ; révèle aussi les charges restantes. |
| `attune_magic_item` | Harmonisation ou rupture volontaire par un repos court distinct de l'étude, avec bénéfices de repos explicites. Trois liens maximum, pas deux exemplaires identiques, prérequis réels de lanceur de sorts. Apprend les propriétés et charges ; aucune substitution implicite d'un quatrième lien. |
| `wear_magic_item` | Porte/retire un anneau ou une cape ; interaction d'objet gratuite puis action en combat. Une cape maximum. Le port et l'harmonisation sont distincts. Armes/baguettes/boucliers passent par `equip_item`. |
| `use_magic_item` | Active une baguette tenue avec charges explicites, une perle harmonisée sur un emplacement dépensé explicite, ou une potion consommée sur une cible explicite au contact. Résout les coûts, dés, effets et réactions réels. |

Catalogue initial : anneau et cape de protection (+1 CA et sauvegardes chacun),
épée longue +1 (attaque/dégâts et dégâts magiques), bouclier +1 (bonus magique
ajouté au +2 ordinaire), baguettes de Projectiles magiques et de Boules de feu,
perle de puissance et quatre potions de soins (2d4+2, 4d4+4, 8d4+8, 10d4+20).
L'arme exacte doit être tenue, y compris pour une attaque préparée ou d'opportunité.
Porter un objet dans l'inventaire ne donne aucun bonus de protection.

Les baguettes ont sept charges, récupèrent 1d6+1 charges dépensées à l'aube et
risquent leur destruction sur un d20 de 1 après la dernière charge. Le sort
déjà lancé se résout même si la baguette se détruit. Boule de feu utilise DD 15,
niveau 3 pour une charge puis +1 niveau par charge supplémentaire ; Projectiles
magiques commence au niveau 1. Aucun emplacement, composant ou connaissance du
sort n'est exigé du personnage. Portée, sauvegardes, résistances, action et
réactions utilisent le moteur de sorts existant, y compris après sauvegarde
d'une réaction en attente. La perle restaure une fois par aube un emplacement
réellement dépensé ; elle n'augmente jamais son maximum.

Convention d'horloge : le temps zéro est juste après une aube ; les suivantes
sont les multiples de 86 400 secondes. Un repos n'ajoute pas une recharge hors
franchissement de cette limite. Une lecture ne lance aucun dé. Les charges
inconnues restent confidentielles ; une recharge d'objet non harmonisé invalide
leur ancienne connaissance. Les objets pleins ne consomment pas de dés inutiles.

`dmTools.magicItems` conserve propriétés connues, connaissance des charges,
réserve réelle, lien, port, éloignement et état actif/consommé/détruit.
L'éloignement au-delà de 100 pieds pendant 24 heures, la mort et la perte d'un
prérequis rompent le lien. Déposer un objet coupe immédiatement son port actif,
sans rompre à lui seul l'harmonisation. Les états terminaux restent conservés
pour empêcher les doubles consommations/recréations (64 instances maximum).

Limites exposées par `get_rules_support({domain:"magic_items"})` : harmonisation
du joueur seulement, pas d'artefacts/malédictions/parchemins, de fabrication,
prix/commerce ou distribution automatique des trésors. Projectiles magiques
vise une seule cible, sans répartition des projectiles. La perle gère les
emplacements dépensés de niveaux 1–3, sans conversion d'un emplacement supérieur.
Le silence empêche le mot de commande de la perle seulement s'il existe comme
effet moteur. Les propriétés absentes de ce catalogue ne sont jamais simulées
par une narration ou un jet générique.

## Lots prioritaires : PV temporaires, couverture, deux armes et prises

- `grant_temporary_hp` / `inspect_temporary_hp` : une réserve distincte, choix
  garder/remplacer, absorption après défenses, durée et reçus persistants.
  Voir [PV temporaires](temporary-hp.md).
- `configure_cover` / `inspect_cover` : déclarations directionnelles du MJ,
  +2/+5 à la CA et aux sauvegardes de DEX, couverture totale et origines réelles
  des attaques/zones. Voir [couverture](cover.md).
- `resolve_two_weapon_attack` : témoin d'une vraie action Attaquer, autre arme
  légère réellement tenue, action bonus et reprise sans nouveau dé. Le style
  s'applique seulement s'il appartient à la fiche ; aucun profil n'est modifié.
  Voir [combat à deux armes](two-weapon-fighting.md).
- `preview_grapple_transport` / `move_grappled_creature` : prise réelle,
  destinations explicites des deux corps, trajectoire commune et réactions.
  Voir [transport en prise](grapple-transport.md).

Les domaines `temporary_hp`, `cover`, `two_weapon_fighting` et
`grapple_transport` de `get_rules_support` exposent leurs limites. Les
préparatifs du MJ sont sauvegardés sans satisfaire une action planifiée.

## Première vague issue de l’audit chapitre par chapitre

Le [registre canonique](suivi-integration-mcp.md) décrit les intégrations
effectives, leurs validations et le travail restant. Les anciennes matrices
d’audit sont des archives et ne fixent plus ces statuts. Le complément SRD 5.1 de
2014 est accessible via `consult_rules` avec `book: "srd-5.1-2014"` : cette
lecture ne crée aucun effet mécanique.

`inspect_exhaustion`, `add_exhaustion` et `remove_exhaustion` suivent les six
niveaux cumulatifs de 2014 et leurs effets réels ; les mutations sont des
événements explicites du MJ avec reçu persistant. Sans suivi de nourriture/eau,
le repos long ne certifie pas la récupération d’un niveau. Voir
[les limites et interactions](exhaustion.md).

`grant_inspiration` et `spend_inspiration` séparent l’octroi explicite du MJ
et la réservation avant le prochain vrai D20 de la catégorie choisie. Leur
état est sauvegardé, sans action accordée ni résolution de l’action planifiée.
Voir [Inspiration du MJ](dm-inspiration.md) ; les domaines `exhaustion` et
`dm_inspiration` de `get_rules_support` exposent ces limites au modèle.

## Vague W3 — raccord et validation

Le registre canonique suit séparément les raccords et leurs tests. Les nouveaux domaines de get_rules_support sont armor_penalties, weapon_consumables, check_modes, spell_components et creature_senses ; lighting inclut maintenant les lanternes à huile réelles. Les guides détaillés sont [armure](armor-penalties.md), [consommables](weapon-consumables.md), [tests](check-modes.md), [composants](spell-components.md), [sens](creature-senses.md) et [éclairage](lighting-and-vision.md).

Les inspections sont documentaires. Les contraintes de composantes sont des faits établis du MJ, sauvegardés sans résoudre l'action planifiée. Les attaques de consommables et tests de groupe consomment le budget du personnage selon leur acteur réel. Aucun équipement ou pouvoir n'est accordé par consultation.

## Mots de commande — correction de raccord

Le raccord ultérieur des mots de commande partage les faits de parole déjà
établis avec les composantes V : une Perle de puissance est refusée sous
bâillon/silence avant charge ou action. Les anciens effets de silence restent
effectifs ; surdité et mains liées ne sont pas du silence. Cela n'ajoute aucun
mot de commande aux baguettes dont la source n'en exige pas. Voir
[parole et mots de commande](spell-components.md#parole-et-mots-de-commande)
et le [registre canonique](suivi-integration-mcp.md#magic-item-edge-rules)
pour la validation propre de ce raccord.

## Nutrition — tranche W4

inspect_survival, begin_nutrition_tracking, consume_provisions et resolve_survival_day séparent lecture, faits initiaux du MJ, consommation réelle et effets d'une journée écoulée. Les réserves sont quantifiées par instance possédée, avec reçus et reprise de la sauvegarde de CON. Le domaine nutrition expose les limites ; le [guide](survival-nutrition.md) et le [registre](suivi-integration-mcp.md) distinguent raccord et validation. Aucun kit, remplissage d'outre ni repas passé n'est créé automatiquement.

## Tranches W5 — combat et préparation

| Domaine | Résolution et guide |
|---|---|
| Maîtrises d’armes | Bonus de maîtrise dérivé de la classe réelle et de la catégorie de l’arme ; posséder une arme ne donne pas sa maîtrise. Les attaques ordinaires, bonus et contre les objets partagent cette règle. Voir [maîtrises](weapon-proficiency.md). |
| Entrée en inconscience | Passage central : à terre et lâcher des véritables objets tenus, sans retirer l’armure ni le bouclier portés. Un soin ne relève ni ne rééquipe. Voir [inconscience](unconscious-transition.md). |
| Parole audible | Composantes V et Perle de puissance partagent les contraintes établies de silence/bâillon ; refus avant action/charge. Voir [parole et mots de commande](spell-components.md#parole-et-mots-de-commande). |
| Budget de rencontre | `assess_encounter_budget` lit les XP source et le niveau réel du seul joueur. Le MJ choisit types/quantités ou acteurs actifs et `countsForMultiplier`. Aucun dé, apparition, XP accordé, repos ni garantie d’équilibre. Voir [budget](encounter-budget.md). |
| Vol explicite borné | `preview_navigation` et `move_token` acceptent `movementMode: "fly"` pour les seuls profils natifs à marche nulle et vol stationnaire (`ghost`, `will_o_wisp`). Projection horizontale, collisions et opportunités réelles ; pas d’altitude, traversée des murs, vol préparé ou transport agrippé. Voir [vol](hover-flight.md). |
| Pétrification et afflictions | Les 15 afflictions structurées existantes sont suspendues puis reprises avec leurs échéances et effets liés ; les nouvelles expositions respectent l’immunité. Les historiques inconnus refusent la transition. W6 ajoute le raccord distinct `sprite-poison` / `sprite-sleep` sur cibles actives, décrit ci-dessous. Voir [pétrification](petrified-afflictions.md). |
| Assommer | `nonlethal: true` est un choix explicite avant une vraie attaque de mêlée du joueur ; à 0 PV, cible vivante, inconsciente et stable, corps conservé. Attaque simple, Extra Attack et autre arme bonus conservent dés/coûts/reprises. Voir [KO et limites](nonlethal-attacks.md). |
| Surprise | `enter_combat` reçoit une décision explicite `surprise: {surprisedIds, reason}` sur les participants exacts. Aucun jet/détecteur de texte supplémentaire. Déplacement, action, bonus et réaction restent bloqués jusqu’à la fin du premier tour ; `next_turn` peut terminer ce tour sans action. Voir [surprise](surprise.md), notamment les rencontres prédéfinies et leurs embuscades distinctes. |

Exemple documentaire, sans création de monstre ni mutation :

```json
{"mode":"planned","groups":[{"monsterType":"goblin","count":2,"countsForMultiplier":true}]}
```

Ces arguments s’adressent à `assess_encounter_budget`. Pour assommer, l’agent
peut appeler `resolve_player_attack` avec
`{"targetId":"goblin_123","weaponOrSpell":"unarmed","nonlethal":true}`
si cet identifiant est réellement présent et à portée. Le moteur valide la
cible, la mêlée et l’immunité avant les dés.

Le KO justifie un épisode vivant à 0 PV ; W7 lui ajoute le cycle explicite de
sauvegardes contre la mort décrit ci-dessous. Les gardes de dangers persistants
restent celles du [guide KO](nonlethal-attacks.md). W6 ajoute la véritable récupération après 1d4
heures ; les anciens KO sans témoin de dé conservent le refus de première
heure, avec une réserve conservatrice explicitée pour les tours/batches. Le soin réel
réveille dans la place future du roster conservé ; un ancien KO absent du
roster d’une nouvelle rencontre reste soignable en exploration, mais son soin
dans cette rencontre est refusé sans inventer de rang. Les choix KO pour sorts
de mêlée, attaques d’opportunité et attaques préparées ne sont pas exposés.
Les codes de refus et le détail des frontières sont dans le
[guide KO](nonlethal-attacks.md).

## W6 — récupération, sprite, portées et rencontres

- **Récupération stable** : le vrai passage à 0 PV stable tire une seule fois
  `1d4` heures et persiste `knockout.recovery`. À l'échéance réelle, le corps
  regagne exactement 1 PV, sans lever, équipement ou tour gratuit ; une autre
  source peut conserver son inconscience. Les résultats de temps/repos
  exposent `naturalRecoveries`, notamment `unconsciousRetained`, évalué à cette
  échéance. Les archives récupèrent sans activation. Les anciens KO sans dé
  refusent toujours une traversée de leur première heure possible ; un KO de
  la carte courante absent du roster d'un autre combat refuse soin ou échéance
  pendant celui-ci, sans rang inventé. Voir [récupération KO](nonlethal-recovery.md).
- **Sprite pendant la pierre** : les deux effets conservent source, ID et
  temps restant pendant la suspension, sans réveil par dégât ou action avant
  reprise. Lesser Restoration (`condition: "poisoned"`) et Protection from
  Poison peuvent neutraliser une source suspendue via son `afflictionId`
  exact ; le sommeil associé exige un lien réel ou une paire ancienne unique,
  sinon la cure refuse avant coût. Les autres poisons restent présents. La
  conservation d'archives validée en W6 ne traitait pas encore la fin d'un
  fournisseur de pierre sur une cible archivée ; W7 apporte ce raccord décrit
  ci-dessous. Voir [contrats de suspension](petrified-afflictions.md#w6--poison-et-sommeil-du-sprite).
- **Portées et proximité** : arc court 80/320 pieds ; dague et hache de main
  lancées explicitement, 20/60 pieds. La longue portée impose le désavantage,
  au-delà le refus précède dés/coûts. Un hostile voisin impose le malus de
  proximité seulement s'il voit le tireur et peut agir. `rangedContext`
  conserve les raisons du jet, y compris pendant une réaction tenue. Aucun
  stock de munitions, chargement, attaque de sort à distance ou tir contre un
  objet n'est ajouté. Voir [armes à distance](ranged-weapons.md).
- **Inspection et surprise d'un preset** : `inspect_encounter({encounterId})`
  lit le roster exact et ses indices zéro-based sur la carte courante, y
  compris un donjon installé. Cette référence est confidentielle au MJ : ni
  découverte du personnage, déplacement, spawn, dé, coût ou début de combat.
  Le schéma W6 de `start_encounter` accepte
  `surprise: {playerSurprised, surprisedMonsterIndices, reason}` pour ce seul
  `encounterId`, sans remplacement `monsters` ni embuscade préparée. Les
  contrôles précèdent mouvement/spawn/initiative et la restriction reste liée
  à la fin individuelle du premier tour. La décision ne vient d'aucun parseur
  de texte ; l'initiative standard 2014 conserve son ordre pendant la rencontre. Voir [surprise](surprise.md).

La validation finale W6 du **1er novembre 2026** est achevée : **73/73 ciblés,
1274/1274 tests complets**, TypeScript et build sortie 0, playtest mock
**30/30 tours**, neuf scénarios, 97 appels mock et 0 $. Les 131 outils réels
et la publication ROOT ont été comparés aux manifestes privés. Voir le
[rapport W6](rules-audit/validation-wave6-2026-11-01.json).

## W7 — PNJ à 0 PV et échéances hors carte

- **Cycle de vie des PNJ** : `configure_npc_death_saves({entityId, eventId,
  reason})` enregistre le choix immuable du MJ pour une créature réellement
  présente, vivante et à PV positifs, avant sa blessure létale. Les monstres
  ordinaires meurent toujours à 0 PV par défaut ; un vrai KO non létal justifie
  son épisode courant sans attribuer ce choix à tous les PNJ. L'état
  `npcLife` conserve l'épisode et les reçus. Sur appel explicite du MJ,
  `roll_death_save` résout seulement l'événement exact réellement dû, avec
  ses arguments explicites ; le serveur ne fabrique pas cet appel. Un reçu
  résolu ne relance pas le dé. Les dégâts, soins, stabilité et récupération
  suivent ce cycle. Un jet de mort dû peut concerner un corps archivé sans le
  remettre sur la carte ; ce bookkeeping n'autorise aucune attaque, cure ou
  exposition à distance. Les états anciens sans provenance ni dé de
  récupération gardent leurs refus, sans migration inventée. Voir
  [cycle KO et limites](nonlethal-attacks.md) et [récupération](nonlethal-recovery.md).
- **Fin de pierre hors carte** : le dernier fournisseur héroïque ou de monstre
  termine à son heure réelle sur la référence persistée dans un autre étage
  ou `retiredMonsters`. Les afflictions structurées et le poison/sommeil du
  sprite reprennent leurs IDs et leur durée restante ; les frontières sont
  relues après chaque événement, y compris lorsqu'un symptôme restauré expire
  avant la fin du même saut. Les autres fournisseurs conservent leurs
  conditions ; l'inconscience à 0 PV ne disparaît pas lors de cette seule
  suppression. Ni token, position, initiative, PV ou carte active ne sont
  ajoutés. Les actions publiques restent limitées aux acteurs actifs et les
  sauvegardes de poison restent explicites selon leur procédure existante.
  Un historique de pause inconnu refuse avant mutation. Voir
  [pétrification archivée](petrified-afflictions.md#w7--échéances-et-conditions-des-acteurs-archivés)
  et [passages entre cartes](multi-map-adventures.md).

Les preuves W7 restent distinctes de W6 : le lot pétrification hors carte valide
**12/12 cas dédiés puis 96/96 régressions** dans sa copie privée, avec TypeScript
et build sortie 0. Cette preuve bornée exclut le nouveau cycle PNJ développé
en parallèle ; la validation intégrée W7 est encore à exécuter. Voir son
[résumé borné](../output/mcp-wave7-archived-stone-current-20261101/validation-summary.json)
et le [suivi canonique](suivi-integration-mcp.md).


## Journal de quêtes communiquées

`record_objective_dialogue` enregistre la proposition réelle d’un PNJ et
révèle des objectifs autorés ou crée des quêtes optionnelles vérifiables ;
`inspect_objectives` lit seulement les propositions connues. Ce système commun
aux campagnes ne change pas leurs conditions de sortie, ne fait aucun jet et
n’accorde ni acceptation ni récompense. Procédure dynamique : domaine
`objectives` de `get_rules_support`. Voir [le contrat](objective-journal.md).
