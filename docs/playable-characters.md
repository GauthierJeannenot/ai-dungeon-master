# Personnages jouables & classes (SRD 5) — conception (IMPLÉMENTÉ)

Affichage du plateau : les quatre profils fighter, wizard, cleric et bard
disposent de figurines réalistes CC BY 4.0 (`public/miniatures/realistic/`).
Le guerrier et le magicien utilisent les modèles Sloyd précédents ; la clerc
avec masse et bouclier et la barde avec instrument utilisent les sculptures
féminines de Teirale publiées sur Printables. Aucun kit ni profil n'est modifié.
Les crédits des auteurs sont accessibles depuis le plateau. La sélection
visuelle `lib/miniatures.ts` ne modifie pas les fiches ni les règles. Des PNG
transparents pré-rendus évitent de charger les GLB et WebGL pendant la partie ;
un échec d'image conserve les initiales. PV, couleurs et clics restent disponibles.

État de livraison, validations exécutées et travail restant : [registre canonique des intégrations MCP](suivi-integration-mcp.md). Ce guide décrit le périmètre technique ; les anciennes matrices d’audit ne sont pas le suivi courant.

## Profils de niveau 3 et répertoire narratif élargi

La campagne `fey-shadow-fair` démarre au niveau 3. Les quatre profils
`characters/<id>/level3.ts` et leurs `character-sheet-level3.md` sont sélectionnés
par le registre et le chargeur de contexte pour ce niveau, sans identifiant de
personnage supplémentaire. Aperçu, prompt et moteur utilisent les mêmes données.
Les niveaux 1–2 et 7 restent distincts ; aucune sauvegarde existante n'est réécrite.

| Personnage | PV solo conservés | CA | Répertoire (tours / sorts) | Capacités de niveau 3 |
|---|---:|---:|---:|---|
| Guerrier | 36 | 16 | — | Champion, Duel, critique 19–20, Sursaut, Second souffle ; une attaque |
| Barde | 28 | 13 | 8 / 20 | Savoir, expertises, Mots cinglants, inspiration d6 (3 / repos long) |
| Magicien | 22 | 12 | 8 / 25 | Évocation, sculpture, récupération de 2 niveaux d'emplacements par jour |
| Clerc | 32 | 16 | 4 / 19 | Vie, soins renforcés, canalisation (1 / repos court ou long), réserve de 15 PV |

**Règle maison demandée :** ces trois incantateurs disposent volontairement de
plus de sorts connus/préparés et de tours de magie que le maximum SRD habituel.
Le grimoire du magicien contient ce répertoire et tous ces sorts sont disponibles.
Le moteur garde les emplacements normaux : **4 de niveau 1, 2 de niveau 2**,
DD 13, attaque +5, aucun sort de niveau 3 ou plus. La préparation après repos
respecte ce plafond de niveau et autorise à nouveau le répertoire élargi.
Les PV gardent le calibrage solo préexistant, distinct des moyennes SRD.
Les dés de vie et ressources suivent maintenant le niveau réel. Recharge par
repos ; changer de carte ne restaure pas les ressources des profils SRD.
Leur bourse commence vide, sans les 250 po du profil de niveau 7 ; les composantes
coûteuses possédées sont indiquées individuellement dans les kits.

Vingt sorts supplémentaires sont jouables via `cast_spell` : Prestidigitation,
Message, Lumières dansantes, Alarme, Serviteur invisible, Disque flottant,
Écriture illusoire, Image silencieuse, Bouche magique, Localisation d'objet,
Détection du mal et du bien, Détection du poison et des maladies, Purification
de nourriture et d'eau, Augure, Messager animal, Corde enchantée, Aura magique
trompeuse, Détection de l'invisibilité, Flamme éternelle et Invisibilité.
Les sorts existants complètent le répertoire selon la liste de chaque classe.
Les rituels du barde sont aussi permis (sort connu avec étiquette rituel).

Pour les sorts portant `narrativeTarget`, le modèle choisit une description
`narrative`, ainsi qu'un `toCell` pour un effet localisé ou un `targetId` pour
un effet sur une créature. Le moteur valide tout avant débit : connaissance,
budget d'action, portée et chemin, cible, composantes ordinaires ou coûteuses,
temps d'incantation, rituel et emplacement. Les matériaux consommés disparaissent ;
perle d'identification et jetons d'augure sont conservés. Les répétitions d'Augure
utilisent un dé moteur et un compteur remis à zéro au repos long.

Les effets sont persistés dans `hero.effects` avec durée, concentration, carte,
position et description interprétée ; ils reviennent tels quels après hydratation.
Le texte créatif reste une donnée, jamais une instruction ou une modification
de PV, inventaire, porte ou état. Les connaissances révélées et conséquences
de scène restent bornées par `srdNote` et les éléments établis : aucune persuasion
automatique, aucun secret inventé, aucune alarme déclenchée sans événement réel.
`use_narrative_spell_effect` déplace explicitement une Image silencieuse (action),
des Lumières dansantes ou un Serviteur invisible (action bonus), sans autre sort
ni nouvel emplacement. Les autres mutations passent par les outils dédiés.
Prestidigitation exige aussi `effectDurationSeconds` (0, 12 ou 3600 selon
l'effet choisi). Trois effets durables au plus ; un quatrième est refusé
jusqu'à expiration ou `dismiss_prestidigitation({effectId})`, qui dépense
une action. Le moteur ne choisit jamais à la place du joueur un effet à supprimer.
Le catalogue commun inclut le rat SRD (`rat`, bête Très Petite), utilisable
comme messager uniquement s'il est effectivement présent et visible.
Invisibilité applique un état mécanique et cesse lorsque la cible attaque ou
incante ; Détection de l'invisibilité permet de la voir à travers un chemin
visible. Aucun de ces sorts ne traverse un mur ou ne rend automatiquement caché.

Sources épinglées : `lib/srd/narrative-spell-sources.json` (réponses API 2014,
URL, empreinte SHA-256) et [SRD 5.1 officiel](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf).
Attribution : `lib/srd/narrative-spells.LICENSE.txt`. Les lectures réseau ont lieu
uniquement lors de l'ajout des données, jamais pendant le jeu ou les tests.

Les objets d'aventure peuvent maintenant être placés au sol via le champ
optionnel `AdventureMapData.groundItems`. Ils amorcent `droppedItems` dans
le moteur et son miroir initial client ; ils ne font pas partie du kit global
du personnage. `pick_up_item` les acquiert à portée, et les dépôts/reprises
ultérieurs conservent leurs emplacements entre cartes et après hydratation.
Le module `sarah-of-yellowcrest-manor` utilise ce mécanisme pour trois objets
de quête. Son niveau 7 sélectionne maintenant les profils dédiés décrits ci-dessous.

## Deuxième action exceptionnelle (règle maison)

Une action du personnage par défaut n'impose aucun quota d'événements au MJ.
Celui-ci peut exceptionnellement accorder une deuxième action avec l'outil MCP
`grant_player_action({reason})`, après la première action, si une circonstance
établie le justifie. Ce choix n'est jamais automatique. L'outil autorise l'action ;
le modèle doit encore sélectionner son outil de résolution et respecter une
décision réellement exprimée par le joueur. L'octroi est borné à une fois par
message, et à une fois par tour de combat même après sauvegarde/rechargement.
Il ne rétablit ni déplacement, ni action bonus, ni ressources de classe et ne
permet pas de troisième action par répétition de cette exception. En combat,
il renouvelle seulement le crédit d'action consommé, y compris sur les profils
SRD 2014 ; réactions suspendues et action initiale inachevée restent bloquantes.
L'état interne `dmActionAllowance` est initialisé à la synchronisation du message,
puis l'octroi et sa justification sont sauvegardés par le moteur et dans le journal.

## Bonus de roleplay (règle maison)

Par défaut, le MJ n'accorde aucun bonus. Il peut récompenser avec parcimonie
une idée qui aide concrètement l'action tentée à partir des faits établis :
+1 pour une idée utile, +2 pour une trouvaille particulièrement pertinente,
+3 pour une idée exceptionnelle, +4 ou +5 pour un cas extraordinaire et
extrêmement rare. Une action ordinaire, une belle description, la politesse
ou une précaution générique ne suffisent pas. Le MJ choisit le montant ; le
serveur n'interprète pas le message du joueur pour l'attribuer. Il transmet
`roleplayBonus` et une justification `roleplayReason` dans `roll_ability_check`,
`resolve_player_attack` ou `resolve_attack` ; `resolve_player_multiattack`
accepte ces champs par attaque, évaluée séparément. Sans récompense, les champs
sont omis. La justification précise le bénéfice concret et le montant retenu.
Une idée répétée exige un apport nouveau ; un bénéfice déjà traduit par un
avantage, un DD réduit ou un autre effet mécanique ne donne pas une seconde
récompense. Le bonus ne sert ni à compenser un mauvais jet ni à assurer un succès.
Le moteur valide les bornes et la justification avant les dés ou les coûts,
ajoute le bonus au jet (jamais aux dégâts) et le restitue dans le résultat et
le journal, y compris après une réaction suspendue/sauvegardée. Ce bonus
remplace l'avantage accordé pour le roleplay ; les avantages/désavantages des
règles et des circonstances continuent de s'appliquer indépendamment. Une
attaque garde ses règles de critique et d'échec sur le dé naturel.

## Prétirés de niveau 7 — SRD 2014 (31 octobre 2026)

Les IDs restent `fighter`, `bard`, `wizard`, `cleric`. Au niveau exactement 7,
`getCharacterTemplate(id, level)` sélectionne `characters/<id>/level7.ts` et
`buildPlayerState` crée un profil `ruleset: "srd2014"` avec sous-classe.
Les autres niveaux et les sauvegardes historiques gardent leur ancien contrat.
Les outils exigeant `GameState.hero` ne sont exposés au DM que pour les
profils `srd2014`, y compris dans la liste de choix du planner.
**Démarrer une nouvelle partie** pour bénéficier des nouvelles capacités ;
aucune transformation du personnage ou de l’aventure d’une session existante.

| Profil | Sous-classe | PV standard | CA | Capacités jusqu’au niveau 7 |
|---|---|---|---|---|
| Darian | Champion | 67 | 18 | Duel, critique 19–20, Athlète remarquable, deux attaques, Sursaut, Second souffle |
| Lyra | Collège du Savoir | 45 | 14 | Inspiration d8 ×4, Source d’inspiration, Mots cinglants, Chant reposant, Contre-charme, expertise, trois compétences, deux Secrets magiques |
| Aldric | Évocation | 37 | 12 | Récupération arcanique, Érudit en évocation, Sculpture des sorts, Tour de magie puissant, grimoire et rituels |
| Séréna | Vie | 52 | 18 | Armures lourdes, huit sorts de domaine, Disciple de la Vie, Guérisseur béni, Canalisation ×2, Préservation de la vie, Renvoi et Destruction FP 1/2 |

Maîtrise +3 ; attaque magique +7, DD 15, emplacements 4/3/3/1 pour les trois
incantateurs. Les PV suivent le maximum au premier niveau puis les valeurs
fixes SRD. Les augmentations de caractéristiques sont déjà incluses.
Les fiches `character-sheet-level7.md` sont injectées dans le prompt et
l’aperçu utilise les mêmes profils que le moteur.

Les règles et outils sont détaillés dans [level7-srd2014.md](level7-srd2014.md).
Le barde niveau 7 connaît également `charm-person` (Charme-personne) en bonus
explicitement demandé : ses dix sorts ordinaires et ses deux Secrets magiques
restent inchangés (treize sorts). Les profils historiques restent inchangés.
`cast_spell` résout portée de 30 pieds, cibles humanoïdes explicites, sauvegarde
SAG et surincantation, puis inscrit un `WorldFact` nommant cible et lanceur.
Le fait survit aux changements de salle/carte et à l’hydratation ; un effet
horodaté le met à jour après une heure, dissipation ou fin causée par le
lanceur/ses compagnons via les outils d’attaque et de dégâts. Le fait final
rappelle que la cible sait avoir été charmée. Aucun changement permanent de
disposition ni révélation d’indice n’en découle. Les PNJ narratifs utilisent
un `AdventureNpcSpec.statBlock` SRD autoré (ou leur `reactive.combatTemplate`
ou leur `kind` s’il correspond exactement à un bloc SRD) pour la sauvegarde ;
un PNJ sans bloc connu est refusé avant tout coût, sans statistiques inventées.
Un pion représentant plusieurs personnes ne reçoit pas de bloc individuel :
il faut des cibles individuelles pour éviter de charmer tout un groupe avec
un emplacement de niveau 1.
`GameState.hero` conserve dés de vie, réactions, concentration, effets avec
expiration, décisions suspendues et ressources de repos. Il est validé par
`HeroStateSchema`, hydraté par MCP et persisté avec le reste du GameState.
Une fenêtre de réaction est une décision explicite : le serveur ne la refuse
ni ne la joue automatiquement. Un jet suspendu n’est jamais relancé.

Pour ces profils, **un changement de carte ne recharge aucune ressource**.
`take_rest` applique les vrais repos ; `advance_time` et les durées de voyage
autorées font expirer les effets sans conférer de repos. Les destinations,
les cibles, les allocations de soin et les créatures protégées par Sculpture
sont toujours choisies par l’agent, puis validées par le moteur.

Sources : [SRD 5.1 officiel](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf),
snapshots API 2014 avec SHA-256 dans `lib/srd/level7-sources.json` et
`lib/srd/subclass-sources.json`, attribution dans `lib/srd/level7.LICENSE.txt`.
Le SRD officiel prime sur les erreurs de l’API communautaire.

## Référence historique des profils v1

La suite de ce document décrit les profils historiques des autres niveaux.
Ses exclusions « v1 » (repos, réactions, concentration, zones et rituels) et
sa recharge par carte ne s’appliquent **pas** aux profils `srd2014` ci-dessus.

> **Statut : IMPLÉMENTÉ (les 5 phases).** Ce document reste la référence de
> conception ; si une décision change, METTRE À JOUR ce document dans le même
> commit (docs/ a déjà divergé du code — ne pas recommencer). Le joueur choisit
> son personnage (classe, stats, équipement, capacités) au démarrage d'une
> partie, sur n'importe quelle aventure. Catalogue : `characters/<id>/`
> (fighter/bard/wizard/cleric — le roublard v1 a été RETIRÉ avec ses mécaniques
> moteur sneak_attack/cunning_action, remplacé par le barde).
> Registres : `lib/character-registry.ts` +
> `lib/srd/{weapons,spells,skills}.ts`. Tests : tests/character-registry.test.cjs,
> tests/mcp-characters.test.cjs, plus les 400/409 de tests/dm-adventure-selection
> et le round-trip character_id de tests/db-stores.

## Objectif

### Création d'eau : interprétation narrative libre (30 octobre 2026)

L'IA interprète l'utilisation de l'eau dans le contexte de la scène, puis
décrit librement la conséquence dans l'appel `cast_spell`. Aucun menu
`container`/`rain`/`extinguish` n'est proposé à l'agent :

```json
{"spellId":"create-water","waterEffect":{"description":"L'eau a rincé la boue des bottes et laissé une flaque brune près du banc.","cell":{"x":5,"y":13}}}
```

La case est illustrative ; l'IA choisit la localisation réelle de l'effet.
Le moteur valide le schéma, la case dans la salle actuelle, la portée, le sort
connu, le tour et l'emplacement AVANT tout débit. Une cible ennemie
supplémentaire est refusée ; les autres sorts refusent `waterEffect`.
Ni le serveur ni le moteur n'analysent le message du joueur pour choisir
ou réécrire l'effet. L'IA reste responsable de l'interprétation sémantique
et du respect des bornes SRD (environ 40 L, zone de 9 m, pas de dégâts ni
de noyade). Le moteur ne prétend pas prouver ces limites à partir d'un texte
libre : aucune nouvelle simulation de liquides ou validation LLM n'est ajoutée.

Après un lancer réussi, le moteur enregistre le texte exact dans un `WorldFact`
avec `basis: "ai_interpretation"`, `roomId`, `mapId`, `waterEffect` et
`expires: "never"`. Le résultat fournit ce fait, les limites `srdNote`, un
résumé et les `narrationFacts`. La conséquence n'est publiée qu'après ce retour.
Ce texte reste une donnée narrative : il ne retire aucun objet, ne change
aucun PV, condition ou état de porte et n'exécute aucune instruction. Ces
mutations nécessitent les outils mécaniques dédiés ; leur état fait autorité
en cas de conflit. Les descriptions libres sont citées comme données dans
les prompts, et leur origine IA est explicitée au narrateur.

Les faits durables survivent aux changements de salle/map, au round-trip MCP,
à la compression de l'historique et à la sauvegarde Postgres, sans éviction
par les huit faits transitoires. Ils sont rappelés dans « FAITS ÉTABLIS »
uniquement dans leur salle/map, avec la case de l'effet. Ils relatent l'action
accomplie sans garantir que de l'eau restera éternellement présente. Les
anciens faits à modes restent lisibles dans les sauvegardes, sans conversion
ni modification de leur texte ; ces modes ne sont plus acceptés pour un
nouveau lancer. Les faits historiques sans `waterEffect` gardent leurs règles.

### Équipement déposé (octobre 2026)

L'IA décrit désormais le placement librement dans le même appel que le dépôt :

```json
{"itemId":"longsword","nearEntityId":"mac","description":"L'épée repose au pied de Mac, contre ses racines."}
```

L'exemple appartient au module où cette entité existe ; aucun nom de module
n'est inscrit dans les couches partagées. `nearEntityId` désigne une entité
visible exacte, dans la même salle/map et à une case au plus sans obstacle.
Le joueur doit l'approcher via un appel IA explicite si elle est plus loin.
L'objet reste sur la case du joueur adjacent au repère. Le moteur sauvegarde
un instantané `anchor: { entityId, name, position }`, la `description` libre
et la position au sol : si le PNJ se déplace, l'objet ne le suit pas et n'est
pas transféré dans son inventaire. Pour un décor sans entité, l'IA peut fournir
`toCell`, également à une case au plus, sans obstacle et dans la même salle.
`toCell` et `nearEntityId` sont exclusifs. Sans ces deux champs, le dépôt reste
aux pieds du joueur (compatibilité des anciens appels).

Le dépôt enregistre aussi un `WorldFact` durable lié par `subjectItemId`.
Lorsqu'une description est fournie, elle est conservée exactement avec
`basis: "ai_interpretation"` et `narrativeEffect: { description, cell }`.
Le résumé mécanique confirme séparément l'objet, sa position et son absence
de l'inventaire. À la reprise, tous les faits liés à l'ancien dépôt sont
supprimés, puis un fait de reprise transitoire est ajouté. Un nouveau dépôt
remplace cette mémoire par le nouvel emplacement. Dépôt/reprise mettent à
jour inventaire, CA et mémoire ensemble, après validation ; un refus ne
produit aucun fait ni coût. Les descriptions/repères survivent au round-trip
MCP et Postgres. Les anciennes sauvegardes sans ces champs restent lisibles.

`drop_item` retire un objet de l'inventaire et conserve son objet complet,
sa map, sa salle et sa case dans `GameState.droppedItems` (clé = `item.id`).
`pick_up_item` exige la même map, la même salle et une distance d'au plus une
case. Ces opérations consomment l'action en combat ; en exploration, un seul
déplacement peut accompagner une interaction. Le bonus de CA d'une armure
ou d'un bouclier est retiré au dépôt et rétabli à la reprise. Les attaques
avec une arme connue exigent sa présence dans l'inventaire ; sans arme, une
attaque sans arme explicitée reste possible. L'inventaire vivant prime sur
le kit initial de la fiche, et les objets déposés restent dans le contexte
après compression. Les anciens états sans `droppedItems` utilisent `{}`.

### Mémoire des autres actions du joueur

`record_scene_fact({ description, cell, replaceFactId? })` étend la mémoire narrative aux
conséquences certaines du roleplay et aux résultats déjà résolus par leurs
outils. Il n'impose aucun menu d'actions. L'IA choisit le texte et sa case ;
le moteur valide la localisation dans la salle/map actuelle et enregistre
un fait durable avec `basis: "ai_interpretation"` et `narrativeEffect`.
Il est transmis au narrateur dans le même `tool_result`, sauvegardé avec
l'état et rappelé seulement dans sa scène. Cet outil ne consomme pas une
deuxième action et ne résout aucune règle : ni jet, ni PV, ni inventaire,
ni condition, ni porte. L'IA doit attendre la résolution mécanique avant de
mémoriser sa conséquence ; le moteur ne valide pas sémantiquement un texte
libre. Dépôt/reprise utilisent leurs outils dédiés avec `description`, pour
que la mémoire soit liée à l'objet et effacée lors de sa récupération.
Une hypothèse ou une intention non résolue ne constitue pas un fait acquis.
Si une nouvelle action modifie un fait déjà mémorisé (par exemple effacer une
marque), l'IA fournit son ID dans `replaceFactId` ; les IDs figurent dans le
contexte des faits. Le moteur valide que le fait existe dans cette scène,
qu'il est narratif et sans lien d'emplacement d'objet, avant de le remplacer.
Un identifiant invalide ou un fait d'inventaire est refusé sans mutation.

L’agent choisit explicitement `weaponOrSpell` et une cible (`targetId`, nom/type
exact, ou `targetHint` explicite pour une attaque). Un sort offensif exige une
cible ; aucun ennemi « le plus proche » n'est choisi si elle manque. Pas de
première arme portée ni d'attaque sans arme implicite. Les registres acceptent
un id ou un libellé exact normalisé, jamais une phrase par inclusion. Les
cibles ambiguës sont refusées, y compris les égalités de distance d'un hint.
Les effets sans cible ennemie (soin personnel, utilitaire) conservent la cible
définie par la règle SRD. Les aptitudes, maîtrises et coûts sont dérivés par le
moteur après le choix de l'action : ce sont des règles, pas des intentions.


Aujourd'hui il n'existe qu'UN héros : un Guerrier figé dans
`lib/player-template.ts` (`BASE_PLAYER`), dont seuls le niveau, les PV,
la position et l'inventaire varient par aventure (`initialPlayer` de
`adventures/<id>/map.ts`), et dont la fiche prompt (`player-character.md`)
est dupliquée par aventure.

Cible : un **catalogue de personnages prétirés** inspirés du SRD 5 (Guerrier,
Barde, Magicien, Clerc), jouables sur **toutes** les aventures. Le joueur
choisit son personnage au lancement d'une partie ; ce choix est figé pour
toute la session, comme l'aventure. Le moteur MCP applique les mécaniques de
classe (attaques selon l'arme, sorts, ressources) — le LLM ne fait que narrer.

## Décisions de conception

1. **Prétirés, pas de créateur de personnage.** v1 = catalogue fermé de
   personnages complets (classe + stats + équipement + capacités). Un
   « character builder » (répartition de stats, choix de sorts) est hors
   périmètre — le modèle de données ne doit pas l'interdire (un personnage
   est une DONNÉE, pas du code).
2. **Le catalogue est GLOBAL, orthogonal aux aventures.** Un nouveau dossier
   racine `characters/<id>/` (miroir de `adventures/<id>/`), contenu SRD
   générique : **zéro vocabulaire de module** dedans (le verrou
   no-module-leaks s'applique moralement ; l'accroche narrative
   personnage×aventure vit côté aventure, voir « Prompts »).
3. **Une session = une aventure + UN personnage, pour toujours.** Extension de
   l'invariant n°3 d'AGENTS.md : le personnage se choisit au spawn du process
   moteur (`CHARACTER_ID`, miroir exact d'`ADVENTURE_ID`) ; un `characterId`
   différent sur une session existante est un **409**. Jamais de changement de
   personnage en cours de partie.
4. **Le moteur MCP est le seul juge des mécaniques de classe.** Emplacements
   de sorts, sorts connus, économie d'action bonus : tout est validé par le
   moteur à partir de faits de `GameState`
   — jamais déclaré par le LLM ni par le client (anti-triche/anti-injection,
   invariant n°1).
5. **Rétrocompatibilité des profils historiques.** Le catalogue v1 reprenait
   l’ancien `BASE_PLAYER` pour `fighter` : mêmes statistiques, PV par aventure
   et inventaire. Les sessions legacy sans `characterId` restent associées au
   guerrier. Ce contrat historique ne décrit pas les nouveaux
   profils SRD de niveau 3 et 7, détaillés plus haut. Le playtest actuel doit
   réussir selon les seuils de `scripts/CLAUDE.md`.
6. **Les mécaniques nouvelles sont un sous-ensemble SRD fermé et vérifiable.**
   Les profils SRD disposent de concentration, réactions et repos résolus par
   leurs outils ; changer de carte ne restaure pas leurs ressources. Les
   anciennes limitations du catalogue v1 restent de l’historique, sans migration
   implicite des sauvegardes.
   Chaque sort/capacité du registre utilise une résolution mécanique fermée
   que le moteur sait appliquer. Les conséquences purement narratives de
   Création d'eau sont interprétées librement par l'IA dans les limites du
   sort, puis mémorisées avec cette provenance ; elles ne remplacent aucune
   résolution mécanique.
7. **PV rééquilibrés pour le jeu solo, déclarés par le personnage.** Le
   précédent existe : le Guerrier a 20 PV au niveau 1 (SRD : 12) car il joue
   sans groupe. Chaque personnage déclare `hp: { base, perLevel }` ; l'aventure
   ne déclare plus que le **niveau** (PV = `base + perLevel × (niveau − 1)` —
   vérification : Grammy N1 = 20, Tide Crypt N2 = 28 avec le guerrier actuel).
8. **Les effets utilitaires laissent des faits de monde PORTÉS PAR L'ÉTAT,
   pas par l'historique** (décision utilisateur, 2026-07-05). Un sort sans
   résolution mécanique enregistre un `WorldFact` dans GameState (moteur seul
   producteur), injecté dans le prompt dynamique tant qu'il vit ; expiration
   vérifiable (salle/carte/jamais). La compression d'historique ne peut donc
   pas les perdre — elle ne sert de filet que pour la couleur narrée hors
   tools. On ne ressuscite PAS `world.fictionFacts` (pipeline cible non
   implémenté) : champ dédié maigre.

## Vue d'ensemble

```
characters/<id>/            # NOUVEAU — un dossier par personnage (miroir adventures/)
  sheet.ts                  # données MOTEUR+APP : CharacterTemplate (compilé par mcp-server)
  character-sheet.md        # fiche prompt (générique, sans niveau/PV chiffrés)
  CLAUDE.md                 # guide local (créé en phase 1, contenu en annexe)

lib/character-registry.ts   # NOUVEAU — registre partagé app+moteur (miroir adventure-map.ts)
lib/srd/weapons.ts          # NOUVEAU — registre d'armes SRD (remplace WEAPON_DAMAGE + ATTACK_RANGE_CELLS)
lib/srd/spells.ts           # NOUVEAU — registre de sorts SRD (effets fermés)
lib/player-template.ts      # DEVIENT un ré-export du template 'fighter' (compat), puis supprimé
```

Le flux existant `adventureId` est dupliqué à l'identique pour `characterId` :

```
landing (choix aventure + personnage)
  → /game?adventure=<a>&character=<c>
  → DMRequest.characterId (honoré à la CRÉATION de session uniquement, sinon 409)
  → session store (colonne character_id, migration additive)
  → mcp-client spawn env CHARACTER_ID (figé au spawn, comme ADVENTURE_ID)
  → mcp-server/character.ts (ACTIVE_CHARACTER_ID lu UNE fois)
  → game-state.ts buildInitialPlayer(template personnage × deltas aventure)
```

## Modèle de données

### `lib/character-registry.ts` — types et registre

```ts
import type { EntityStats, Item } from './types'

export type CharacterClassId = 'fighter' | 'bard' | 'wizard' | 'cleric'

// Capacités de classe que le MOTEUR sait appliquer. Liste fermée.
export type ClassFeatureId =
  | 'second_wind'      // action bonus : soin 1d10+niveau, ressource 1/carte
  | 'spellcasting'     // active cast_spell + emplacements

export interface CharacterTemplate {
  id: string                       // slug stable, ex. 'fighter'
  name: string                     // nom affiché, ex. 'Héros'
  class: string                    // libellé FR pour PlayerState.class, ex. 'Guerrier'
  classId: CharacterClassId
  stats: EntityStats
  ac: number                       // CA équipée (armure du kit incluse)
  speed: number
  proficiencyBonus: number         // niveau 1-4 : +2 (le niveau vient de l'aventure)
  hp: { base: number; perLevel: number }   // décision n°7 (équilibrage solo)
  savingThrowProficiencies: Array<keyof EntityStats>
  skillProficiencies: string[]     // ids canoniques (lib/srd/skills, voir Moteur)
  expertise?: string[]             // compétences à double maîtrise (aucun prétiré v1)
  inventory: Item[]                // kit de classe (armes/armure/outils) — PAS les objets de quête
  features: ClassFeatureId[]
  spellcasting?: {
    ability: keyof EntityStats     // int (magicien), wis (clerc)
    cantrips: string[]             // ids de lib/srd/spells.ts
    knownSpells: string[]          // sorts de niveau 1 connus/préparés
    slots: { level1: number }      // v1 : uniquement des emplacements de niveau 1
  }
}

export const DEFAULT_CHARACTER_ID = 'fighter'

export function getCharacterTemplate(characterId?: string): CharacterTemplate  // fail-safe → fighter
export function isKnownCharacterId(id: string | null | undefined): boolean
export function listCharacters(): CharacterTemplate[]
```

Contraintes identiques à `lib/adventure-map.ts` : importable par le serveur MCP
(**rien d'app-only** : pas de fs, pas de next, pas de logger) ; ajouter les
nouveaux fichiers partagés au `include` de `mcp-server/tsconfig.json`.

### `lib/srd/weapons.ts` — source unique des armes

Remplace les deux tables dupliquées `WEAPON_DAMAGE` et `ATTACK_RANGE_CELLS`
de `mcp-server` (combat-tools.ts / rules.ts) :

```ts
export interface WeaponSpec {
  id: string                 // clé normalisée ('longsword', 'rapier', 'shortbow'…)
  label: string              // FR ('épée longue') — sert aussi au matching des items d'inventaire
  damageDie: string          // '1d8' (sans modificateur : le moteur l'ajoute)
  rangeCells: number         // 1 = mêlée ; >1 = portée en cases
  properties: Array<'finesse' | 'ranged' | 'light' | 'twoHanded' | 'thrown'>
}
```

L'aptitude d'attaque est DÉRIVÉE par le moteur, jamais passée en paramètre :
`ranged` → DEX ; `finesse` → max(FOR, DEX) ; sinon FOR. Une arme absente du
registre = mêlée FOR 1d4 (comportement dégradé actuel, conservé).

### `lib/srd/spells.ts` — sorts à effets fermés

```ts
export type SpellEffect =
  | { kind: 'attack_roll'; damage: string }                            // ex. rayon de givre
  | { kind: 'save'; ability: keyof EntityStats; damage: string; halfOnSave: boolean }  // mains brûlantes
  | { kind: 'auto_hit'; damage: string }                               // touche auto : projectile magique = '3d4+3' (les 3 dards agrégés, cible unique — pas de répartition v1)
  | { kind: 'heal'; amount: string }                                   // soins
  | { kind: 'condition'; condition: Condition; save: keyof EntityStats } // v2 si besoin
  // Sort UTILITAIRE sans résolution mécanique (create water, lumière,
  // thaumaturgie…) : le moteur débite le COÛT (connaissance, action,
  // emplacement), le LLM narre l'effet fictionnel dans les bornes de srdNote.
  // `fact` (optionnel) : trace mémorielle enregistrée par le moteur dans
  // GameState.worldFacts et injectée au prompt dynamique tant qu'elle vit.
  | { kind: 'utility'; srdNote: string; fact?: { text: string; expires: 'room' | 'map' } }

export interface SpellSpec {
  id: string                 // 'magic-missile'
  label: string              // 'Projectile magique'
  level: 0 | 1               // 0 = tour de magie (sans emplacement)
  rangeCells: number
  target: 'enemy' | 'self' | 'any'
  effect: SpellEffect
}
```

Exclusions v1 assumées : sorts à concentration (bénédiction…), à réaction
(bouclier), à zone multi-cibles (une seule cible par lancer, même pour mains
brûlantes — simplification solo), rituels.

### `lib/srd/skills.ts` — compétences canoniques

Table SRD id→(label FR, aptitude). `skillProficiencies`/`expertise` du
personnage stockent les **id anglais** (`'athletics'`), jamais les labels FR
(comme le registre d'armes). Le catalogue ci-dessous nomme les compétences en
français par lisibilité : à la transcription en `sheet.ts`, prendre l'id.

```ts
export interface SkillSpec {
  id: string                 // 'athletics', 'stealth', 'arcana'…
  label: string              // 'Athlétisme'
  ability: keyof EntityStats // aptitude par défaut du jet
}
// 18 compétences SRD. v1 : au minimum celles citées dans le catalogue —
// athletics(str), intimidation(cha), perception(wis), history(int),
// stealth(dex), acrobatics(dex), sleightOfHand(dex), persuasion(cha),
// arcana(int), investigation(int), insight(wis), medicine(wis), religion(int).
```

### `lib/types.ts` — extensions d'état

```ts
export interface PlayerState {
  // … champs existants inchangés …
  // Tous OPTIONNELS : les états legacy (guerrier sans ces champs) restent lisibles.
  characterId?: string                                  // slug du catalogue (défaut : fighter)
  savingThrowProficiencies?: Array<keyof EntityStats>
  skillProficiencies?: string[]
  expertise?: string[]
  features?: ClassFeatureId[]
  spellSlots?: { level1: { current: number; max: number } }
  knownSpells?: string[]                                // cantrips + niveau 1 confondus
  resources?: Record<string, { current: number; max: number }>  // ex. second_wind
}

export interface GameState {
  // … champs existants inchangés …
  characterId?: string           // miroir d'adventureId : figé à la création, round-trippé
  bonusActionUsed?: Record<string, boolean>   // économie d'action bonus (nouvelle)
  worldFacts?: WorldFact[]       // faits de monde produits par le MOTEUR (voir cast_spell utility)
}

// Fait de monde établi mécaniquement (v1 : uniquement par cast_spell utility).
// Champ DÉDIÉ et volontairement maigre : ne PAS ressusciter world.fictionFacts
// (le moteur « world » a été retiré ; fictionFacts est typé mais rien ne le
// produit — AGENTS.md). Porté par l'état, donc immunisé contre la compression
// d'historique par construction.
export interface WorldFact {
  id: string
  text: string                   // injectable tel quel dans le prompt dynamique
  source: string                 // ex. 'cast_spell:create-water'
  mapId: string
  roomId?: string                // requis si expires === 'room'
  expires: 'room' | 'map' | 'never'
}
```

⚠️ Invariant mcp-server/CLAUDE.md : **tout nouveau champ de GameState doit
survivre à `replaceState`** — ajouter `characterId`, `bonusActionUsed` et
`worldFacts` explicitement dans `mcp-server/game-state.ts#replaceState` (même
mécanique que `adventureId`/`npcs`), et les champs joueur doivent survivre
tels quels (ils sont déjà portés par `player`, copié en bloc).

### Répartition aventure ↔ personnage

`adventures/<id>/map.ts` — `initialPlayer` change de forme :

```ts
// AVANT : initialPlayer: Pick<PlayerState, 'level' | 'hp' | 'inventory'>
// APRÈS :
initialPlayer: {
  level: number            // seul réglage de puissance par aventure
  extraInventory?: Item[]  // objets PROPRES à l'aventure (potions offertes, objet de quête)
}
```

Le personnage apporte : classe, stats, CA, vitesse, kit d'équipement, PV
(formule), capacités, sorts. L'aventure apporte : niveau, position de départ,
objets additionnels. `player-character.md` par aventure est **supprimé**
(remplacé par `characters/<id>/character-sheet.md` + accroche, voir Prompts) —
mettre à jour `adventures/CLAUDE.md` et le README dans le même commit.

## Moteur MCP

### Spawn et état initial

- `mcp-server/character.ts` (miroir de `adventure.ts`) : `ACTIVE_CHARACTER_ID`
  lu UNE fois depuis `process.env.CHARACTER_ID`, défaut `fighter`. Jamais de
  changement pendant la vie du process.
- `game-state.ts#buildInitialPlayer` fusionne :

```ts
const tpl = getCharacterTemplate(ACTIVE_CHARACTER_ID)
const map = getAdventureMap(ACTIVE_ADVENTURE_ID)
const level = map.initialPlayer.level
const maxHp = tpl.hp.base + tpl.hp.perLevel * (level - 1)
return {
  id: 'player',
  name: tpl.name, class: tpl.class, characterId: tpl.id,
  level, hp: { current: maxHp, max: maxHp },
  ac: tpl.ac, stats: { ...tpl.stats }, speed: tpl.speed,
  proficiencyBonus: tpl.proficiencyBonus,
  deathSaves: { successes: 0, failures: 0 }, conditions: [],
  position: { ...map.startCell },
  inventory: [...clone(tpl.inventory), ...clone(map.initialPlayer.extraInventory ?? [])],
  savingThrowProficiencies: tpl.savingThrowProficiencies,
  skillProficiencies: tpl.skillProficiencies, expertise: tpl.expertise,
  features: tpl.features,
  spellSlots: tpl.spellcasting && {
    level1: { current: tpl.spellcasting.slots.level1, max: tpl.spellcasting.slots.level1 },
  },
  knownSpells: tpl.spellcasting && [...tpl.spellcasting.cantrips, ...tpl.spellcasting.knownSpells],
  resources: seedResources(tpl.features),   // ex. { second_wind: { current: 1, max: 1 } }
}
```

### Attaques : aptitude dérivée de l'arme

`resolve_attack`/`resolve_player_attack` (combat-tools.ts) remplacent le
`strMod` codé en dur par la dérivation du registre d'armes (voir
`lib/srd/weapons.ts`). Le matching arme ↔ inventaire se fait sur le `label`
normalisé (comme le matching de cible existant). Les monstres gardent leur
`attackBonus`/`damageDice` propres — rien ne change pour eux.

### Économie d'action bonus

Nouvelle mécanique parallèle à `actionUsed` : `bonusActionUsed`
(reset dans `resetTurnEconomy`, consommée par `second_wind`).
Hors combat, non contrainte (comme l'action).

### Nouveau tool `cast_spell`

```
cast_spell({ spellId | spellName, targetId?, targetName?, slotLevel? })
```

Validations moteur (dans l'ordre, mêmes conventions RuleViolation) :
sort connu (`knownSpells`) → phase/tour/action disponible (les sorts coûtent
l'ACTION) → cible à portée (`rangeCells`, mêmes règles que validateAttack) →
emplacement disponible si niveau ≥ 1 (`SPELL_SLOTS_EXHAUSTED`) — les tours de
magie n'en consomment pas. Résolution selon `effect.kind` :

- `attack_roll` : d20 + bonus d'aptitude magique + maîtrise vs CA (réutilise
  la mécanique resolve_attack, critique inclus).
- `save` : le moteur jette la sauvegarde de la CIBLE contre
  DD = 8 + maîtrise + mod d'aptitude ; dégâts pleins ou moitié.
- `auto_hit` : dégâts directs (projectile magique).
- `heal` : `updatePlayerHP` (ou cible) — refusé sur un joueur mort
  (règle PLAYER_DEAD existante).
- `utility` : aucun dé. Le moteur débite le coût et renvoie
  `{ effect: 'utility', srdNote }` — la narration du DM est bornée par le
  `srdNote` du registre (voir ci-dessous).

Sortie JSON structurée avec `mechanicalSummary` (même format que
AttackResult) ; passe par `dice.ts` (déterminisme `AI_DM_TEST_DICE_SEQUENCE`).

#### Sorts utilitaires (`kind: 'utility'`) — frontière moteur/fiction

Un sort sans effet mécanique direct (create water, lumière, thaumaturgie) a
quand même un COÛT vérifiable : sort connu, tour du joueur, action, emplacement
si niveau ≥ 1. C'est exactement la partie trichable, donc la partie que le
moteur juge. L'invariant reste « pas de RÉSULTAT MÉCANIQUE sans tool », pas
« pas de narration sans dés » : une fois le coût débité, l'effet fictionnel
relève de la narration libre — comme un dialogue sans enjeu aujourd'hui.

Règles de frontière :

- **`srdNote` borne la narration.** Il est renvoyé dans le résultat du tool
  (donc dans le contexte du DM au moment de narrer) : « crée jusqu'à 40 litres
  d'eau à 9 m, ou éteint une flamme de la taille d'un feu de camp ». Pas de
  lac, pas de noyade de gobelin.
- **Conséquence mécanique = tools existants, décidés par le MODULE.** Si
  l'eau créée doit éteindre le brasier qui bloque un passage, c'est le module
  qui le déclare dans ses données (roomHooks, use_object, trigger_room_event,
  DC) ; `cast_spell(utility)` puis le tool d'état s'enchaînent dans le même
  tour. `cast_spell` ne mute JAMAIS le monde lui-même — sinon le sort
  utilitaire devient une porte d'injection vers des mutations arbitraires.
- **Persistance : des FAITS DE MONDE portés par l'état, pas par
  l'historique.** Un sort utilitaire dont l'effet doit être retenu déclare
  `fact` dans le registre ; `cast_spell` enregistre alors un `WorldFact` dans
  `GameState.worldFacts` (moteur seul producteur). Comme il vit dans l'état
  round-trippé, il est **immunisé contre la compression d'historique par
  construction** — le résumé LLM peut perdre la phrase, le fait reste. Cycle
  de vie vérifiable par le moteur, jamais par le LLM :
  - `expires: 'room'` → purgé quand le joueur quitte la salle (eau au sol) ;
  - `expires: 'map'` → purgé au `travel_to_map` (lumière sur le bâton) ;
  - `expires: 'never'` → survit tant que la partie vit (rare, à justifier).
  - Plafond : ~8 faits actifs, FIFO (comme le combatLog borné).
  Injection : le bloc dynamique du prompt gagne une section « FAITS ÉTABLIS »
  listant les faits actifs de la carte courante (quelques lignes, borné).
  Un module qui veut en plus CONDITIONNER sa mécanique à un effet utilitaire
  (puzzle « éteignez le feu ») passe toujours par son état propre
  (sceneMemory, flags de quête) — les worldFacts sont de la mémoire
  narrative, pas des conditions de quête.
- **Filet côté compression** : le prompt de compression (lib/dm/history.ts)
  est instruit de préserver les faits durables établis dans la narration
  (ceux narrés « gratuitement », hors tools, n'ont pas de WorldFact). Filet
  best-effort — la garantie dure, ce sont les worldFacts.
- **Mode de défaillance résiduel** : le DM narre un sort sans appeler
  `cast_spell` (lancer gratuit). Mitigations : règle prompt « TOUT sort →
  cast_spell, même utilitaire », exemples planner, chemin couvert par le mock.
  Dégât borné si ça passe quand même : de la couleur gratuite — ni dégâts, ni
  PV, ni déplacement (les ressources qui comptent restent moteur-only).

### Nouveau tool `use_class_feature`

```
use_class_feature({ featureId: 'second_wind' })
```

- `second_wind` : guerrier uniquement (`features`), ressource disponible,
  action bonus libre → soin 1d10+niveau, décrémente la ressource.
- Recharge : `applyMapTravel` remet toutes les `resources` et les
  `spellSlots` à leur max (décision n°6).
- Historique : `cunning_action` (dash/hide) et l'attaque sournoise
  automatique ont été RETIRÉS avec le roublard (remplacé par le barde) — le
  budget `dashUsed` du GameState a disparu avec eux. Les réintroduire =
  nouvelle variante `ClassFeatureId` + logique moteur + tests, comme toute
  capacité.

### Jets de compétence : maîtrise décidée par le moteur

`roll_ability_check` accepte aujourd'hui `proficient`/`expertise` déclarés
par le LLM (triche possible). Cible : un paramètre `skill?` (id canonique —
nouvelle table `lib/srd/skills.ts` : id, label FR, aptitude) ; si fourni, le
moteur dérive maîtrise/expertise de `skillProficiencies`/`expertise` du
joueur et IGNORE les flags déclarés. Les flags restent acceptés sans `skill`
(compat mock/tests existants).

## Route DM, persistance, client

Chaque point est le miroir exact du traitement `adventureId` existant :

1. **`DMRequest.characterId`** (lib/types.ts) — validation cheap AVANT débit :
   id fourni mais inconnu → 400 (comme `isKnownAdventureId`).
2. **Résolution** (app/api/dm/route.ts) : session existante → le
   `characterId` stocké fait foi, mismatch → **409** ; nouvelle session →
   `body.characterId ?? DEFAULT_CHARACTER_ID`.
3. **Session store** (lib/session-store.ts) : colonne `character_id` — SQL
   dans `DB_SCHEMA_SQL` + migration ADDITIVE dans `ADDITIVE_MIGRATIONS_SQL` +
   `COALESCE` à l'upsert (même mécanique qu'`adventure_id`) + round-trip
   pg-mem dans tests/db-stores.test.cjs. Lignes legacy sans le champ →
   `undefined` → guerrier.
4. **mcp-client.ts** : `getMCPClient(sessionId, adventureId, characterId)` —
   `childEnv.CHARACTER_ID` au premier spawn uniquement. Le premier appel MCP
   d'une requête doit connaître le personnage résolu (même contrainte que
   l'aventure).
5. **Client** (app/game/page.tsx) : paramètre `?character=<id>` ; clés
   sessionStorage préfixées `ai-dm:<adventureId>:<characterId>:` (deux
   personnages sur la même aventure dans le même onglet = deux parties
   isolées ; prévoir la migration de lecture des anciennes clés sans
   characterId → guerrier). `buildInitialGameState(adventureId, characterId)`
   construit le miroir optimiste depuis le template.
6. **Landing** (components/landing) : sur la carte d'une aventure, un
   sélecteur de personnage (les 4 du catalogue, avec classe + résumé una
   ligne) avant « Jouer ». Défaut : guerrier — le lien actuel sans
   `?character=` reste valide. Le **survol** d'une classe affiche un aperçu
   détaillé de sa fiche (popover) : stats, CA/PV/vitesse, sauvegardes,
   compétences, capacités, sorts, équipement.
7. **Fiche de personnage** (components/CharacterSheet.tsx +
   CharacterSheetModal.tsx, modèle de vue lib/character-sheet-view.ts) :
   composant présentiel PARTAGÉ landing (aperçu depuis un `CharacterTemplate`)
   et jeu (modale depuis le `PlayerState` live — PV courants, emplacements de
   sort restants, ressources, conditions). En jeu, un clic sur le pion joueur
   de la battlemap (ou sur son aperçu de survol) ouvre la modale. Le modèle de
   vue résout les ids SRD (sorts, compétences) en libellés FR ; aucun
   vocabulaire de module (composant global).

Monétisation : les personnages sont **gratuits** v1. L'axe « personnage
payant » (entitlement par characterId) est possible plus tard — ne pas le
préparer maintenant.

## Prompts & LLM

1. **`loadContextFiles(adventureId, characterId)`** (lib/context-loader.ts) :
   `playerCharacter` = `characters/<characterId>/character-sheet.md`
   (+ l'accroche aventure, ci-dessous). Cache par clé composite
   `adventureId::characterId`. Un characterId CONNU sans fiche = erreur
   (jamais de repli silencieux sur un autre personnage) ; inconnu = fail-safe
   guerrier.
2. **Accroche personnage×aventure** : `definition.ts` gagne un champ optionnel
   `characterHooks?: Record<string, string>` (clé = characterId) — 2-3
   phrases liant CE personnage à CETTE aventure (l'équivalent de la section
   « Histoire » du player-character.md actuel). Injectée sous la fiche dans
   le prompt statique. Sans accroche : la fiche seule suffit.
3. **Fiches sans chiffres de progression** : `character-sheet.md` ne contient
   NI niveau NI PV chiffrés (ils varient par aventure et sont déjà dans le
   bloc dynamique via `serializeGameState`). La fiche décrit identité, stats,
   compétences, équipement, capacités de classe (avec leur mode d'emploi
   côté DM : « Second souffle = tool use_class_feature »), traits.
4. **Système permanent** : le prompt dépend de l’aventure et du personnage,
   sans état volatil. Le cache de préfixe éventuel est géré côté vLLM. Les
   schémas disponibles suivent la phase moteur et les choix de découverte du MJ.
5. **Procédures du DM** : placer les nouvelles consignes spécialisées dans
   `lib/dm/rule-guides.json`, avec leurs domaines et outils exacts. Le MJ les
   lit via `get_rules_support({domain})` et charge les schémas manquants avec
   `discover_tools`. Aucun nouveau manuel de mécanique dans le système permanent ;
   le contrat commun exige déjà de résoudre l’effet par outil avant narration.
6. **Classifieur** (planner.ts) : exemples génériques « je lance un projectile
   magique sur le gobelin » → cast_spell ; l'enum des tools par phase inclut
   les nouveaux (cast_spell/use_class_feature exposés en combat ET en
   exploration, comme use_healing_potion).
7. **Mock LLM** (lib/dm/llm.ts) : étendre les regex du mock — « je lance
   <sort> » → cast_spell, « second souffle » → use_class_feature — pour que
   tests et playtest couvrent les nouveaux tools sans appel payant.
8. **Playtest** : le scénario Grammy scripté joue le guerrier par défaut →
   `npm run playtest:mock` doit réussir, avec les seuils actuels décrits dans
   `scripts/CLAUDE.md`. Les résultats de chaque vague sont conservés dans le
   registre canonique ; les anciens chiffres du pipeline supprimé ne sont
   plus des critères de validation.

## Catalogue v1 (SRD 5, niveau de référence 1, équilibrage solo)

PV : `base` équilibré solo (~×1,7 SRD, précédent : guerrier 20). Le SRD 5.1
est publié sous licence CC-BY-4.0 : ajouter l'attribution dans le README.

| | `fighter` Guerrier | `bard` Barde | `wizard` Magicien | `cleric` Clerc |
|---|---|---|---|---|
| Nom | Héros | Lyra | Aldric | Séréna |
| FOR/DEX/CON | 16/12/14 | 8/14/12 | 8/14/12 | 14/10/14 |
| INT/SAG/CHA | 10/12/10 | 10/12/16 | 16/12/10 | 10/16/12 |
| CA | 16 (cotte + bouclier) | 13 (cuir + DEX) | 12 (10+DEX) | 16 (écailles + bouclier) |
| PV base/perLevel | 20 / +8 | 16 / +6 | 12 / +5 | 18 / +7 |
| Sauvegardes | FOR, CON | DEX, CHA | INT, SAG | SAG, CHA |
| Compétences | athlétisme, intimidation, perception, histoire | représentation, persuasion, tromperie, perspicacité, acrobaties | arcanes, investigation, histoire, perspicacité | médecine, perspicacité, religion, persuasion |
| Kit | épée longue, bouclier, cotte de mailles, hache de main ×2, potion, pack | rapière, dague, cuir, luth (focaliseur), potion | bâton, dague, grimoire, potion, pack | masse d'armes, bouclier, écailles, symbole sacré, potion, pack |
| Capacités | second_wind | spellcasting | spellcasting | spellcasting |
| Sorts (tours) | — | moquerie cruelle (save SAG 1d4), illusion mineure (utilitaire → WorldFact salle) | rayon de givre (1d8), lumière (utilitaire) | flamme sacrée (save DEX 1d8), thaumaturgie (utilitaire) |
| Sorts (niv. 1) | — | mot de guérison (soin 1d4+CHA), vague tonnante (save CON 2d8 ½), déguisement (utilitaire → WorldFact carte), communication avec les animaux (utilitaire → WorldFact carte) | projectile magique (auto 3d4+3), mains brûlantes (save DEX 3d6 ½) | soins (1d8+SAG), éclair traçant/guiding bolt (attaque 4d6), création d'eau (utilitaire → WorldFact) |
| Emplacements niv. 1 | — | 3 | 3 | 3 |

Le barde est le personnage « narratif » du catalogue : la moitié de son kit
est faite de sorts UTILITAIRES (illusion mineure, déguisement, communication
avec les animaux) — le moteur débite le coût et pose un WorldFact, le DM narre
dans les bornes du `srdNote` (voir « Sorts utilitaires » ci-dessus).
Le guerrier est byte-identique à l'existant : `BASE_PLAYER`
devient `characters/fighter/sheet.ts` et `lib/player-template.ts` un ré-export
de transition (supprimé quand plus aucun import ne le référence).

Armes du registre v1 : longsword, shortsword, rapier (finesse), dagger
(finesse, thrown 4), handaxe (thrown 4), shortbow (ranged 16), mace,
quarterstaff, greataxe, greatsword, unarmed — soit l'union des deux tables
actuelles + rapier/shortbow.

## Compatibilité ascendante (verrous)

- GameState sans `characterId` (toutes les sessions actuelles) → guerrier,
  partout où l'id est résolu (replaceState, route, session store, prompts).
- PlayerState sans les nouveaux champs → aucune capacité spéciale, attaques
  FOR : comportement actuel à l'identique.
- `adventures/<id>/player-character.md` supprimés — leur contenu migre vers
  `characters/fighter/character-sheet.md` (fiche) + `characterHooks.fighter`
  (Histoire). Le prompt statique du couple Grammy×guerrier changera donc de
  quelques octets : commit dédié, mesuré au playtest (lib/dm/CLAUDE.md).
- `initialPlayer.hp`/`inventory` disparaissent de map.ts : adapter les 3
  aventures dans la même phase (le niveau reproduit les PV actuels via la
  formule ; l'inventaire actuel devient kit guerrier + `extraInventory`).

## Hors périmètre v1 (explicitement)

Création/personnalisation de personnage ; montée de niveau en cours de partie ;
multiclasse ; races (tous humains v1 — champ possible plus tard) ; réactions,
concentration, sorts de zone, rituels ; repos courts/longs (recharge =
changement de map) ; personnages payants ; plus de 4 classes.

## Plan d'implémentation par phases

Chaque phase laisse `npm run typecheck` + `npm test` verts et se committe
séparément.

1. **Catalogue + registres (aucun changement de comportement).**
   `characters/fighter/` + les 3 autres `sheet.ts`, `lib/character-registry.ts`,
   `lib/srd/weapons.ts` (+ bascule des deux tables mcp-server dessus),
   `lib/srd/spells.ts`, `lib/srd/skills.ts`, extensions de types. Ajouter au
   `include` de mcp-server/tsconfig.json. Test : tests/character-registry.test.cjs
   (boucle catalogue : stats bornées 3-20, armes du kit connues du registre,
   sorts connus du registre, formule PV cohérente, ids uniques, zéro
   vocabulaire de module dans characters/).
2. **Moteur.** `mcp-server/character.ts`, buildInitialPlayer fusionné,
   round-trip replaceState (characterId, bonusActionUsed, worldFacts),
   aptitude d'attaque par arme, économie bonus action, `cast_spell` (y
   compris production des WorldFacts), `use_class_feature`, recharge au
   travel_to_map, purge des worldFacts (sortie de
   salle / travel_to_map / plafond FIFO), `skill` sur roll_ability_check.
   Tests moteur dédiés (dés seedés) : un test par validation refusée + un
   par effet de sort + cycle de vie complet
   d'un WorldFact (création, survie au round-trip, purge).
3. **Route + persistance + client.** DMRequest.characterId, 400/409,
   migration `character_id`, mcp-client (spawn env), page de jeu
   (?character=, clés sessionStorage, miroir optimiste), sélecteur landing.
   Tests : db-stores round-trip, route 409 (même pattern que le 409 aventure).
4. **Prompts + contenu.** character-sheet.md ×4, characterHooks des 3
   aventures, migration/suppression des player-character.md, context-loader
   composite, instructions DM + planner + mock LLM, section « FAITS
   ÉTABLIS » du bloc dynamique (worldFacts de la carte courante) et
   instruction de préservation des faits durables dans le prompt de
   compression (lib/dm/history.ts). Validation : `npm run playtest:mock`
   avant/après (nombres stables), tests context-loader (erreur si fiche
   manquante, fail-safe id inconnu).
5. **Docs.** Passer ce document en « IMPLÉMENTÉ », mettre à jour AGENTS.md
   (invariant n°3 : « une session = une aventure + un personnage »),
   adventures/CLAUDE.md (anatomie sans player-character.md), README,
   characters/CLAUDE.md.

## Équipement explicite et actions PHB complémentaires

Le premier lot [outils MJ](mcp-toolkit.md) ajoute `equip_item`, `use_item` et
les actions complémentaires de `combat_action`, dont préparation et opposition
agrippement/bousculade. `PlayerState.toolProficiencies` conserve les maîtrises
d'outils configurées explicitement. `Item.equipmentId` identifie le modèle
publié d'un objet individuel. Après la première opération d'équipement explicite,
port, mains libres, CA et armes suivent `GameState.dmTools.loadout`. Porter
une armure dans l'inventaire ne l'équipe plus. Les anciennes sessions gardent
leur comportement jusqu'à cette opération. Voir le document lié pour les coûts,
sources et limites, notamment transport d'une cible agrippée, éclairage et
activation d'objets magiques.

Le deuxième lot ajoute `resolve_tool_check` et la bourse persistée dans
`GameState.dmTools.wallet` (voir le même guide). Le registre transmet les
`CharacterTemplate.toolProficiencies` explicites au joueur initial. Le profil
du barde de niveau 7 précise luth, flûte et tambour ; seul le luth est possédé
au départ. Les anciennes sauvegardes ne reçoivent aucune maîtrise ni pièce
implicitement. Le prompt dynamique présente les maîtrises configurées.

La monnaie mécanique est unique : `dmTools.wallet`. Les profils SRD de niveau 7
y commencent avec leurs 250 po existantes. Au chargement SQL et à l'hydratation
MCP, une ancienne réserve `hero.gold` est ajoutée une seule fois aux pièces
déjà présentes, puis supprimée ; une bourse vide ne se recharge pas. Les autres
profils démarrent sans monnaie nouvelle. `copy_spell_to_book` exige désormais
`paid` (dénominations explicites) pour le coût exact de copie : validation de
source, possession du grimoire et fonds avant tout débit ou temps écoulé.
Paiements, trésors et étude utilisent ainsi la même bourse. Aucun rendu de
monnaie implicite n'est effectué pour la copie.

Les [grimoires physiques et leurs travaux de copie](spellbooks.md) conservent
désormais chaque vraie instance séparément. Plusieurs livres personnels peuvent
fournir ensemble la préparation, et un nouveau volume peut réellement fournir
un rituel. Sauvegarde/remplacement, fournisseurs ou stocks réels d'encres,
paiement unique et segments de travail persistés sont résolus par MCP ; les
sorts non préparés d'un livre perdu ne sont jamais recréés depuis l'ancienne liste.

Les profils SRD peuvent acquérir les 11 objets magiques pris en charge dans
`lib/srd/magic-items.ts`. Leurs instances et connaissances sont persistées dans
`dmTools.magicItems` : aucune modification du kit initial, ni harmonisation
automatique. Les bonus de CA/sauvegarde passent par les effets réellement actifs
et les armes +1 par l'instance tenue. Une baguette lance son sort sans exiger de
sort connu ou d'emplacement du personnage ; les prérequis d'harmonisation restent
ceux du catalogue. Voir [le troisième lot MCP](mcp-toolkit.md#troisième-lot--objets-magiques).

Les extensions du même guide ajoutent les parchemins de niveaux 1–4 compatibles
avec la liste de classe, avec DD/attaque fixes et consommation réelle ; la copie
par le magicien conserve ses coûts, temps et test d'Arcanes. Lecture et copie
ne préparent aucun sort. Bestow Curse et Remove Curse sont enregistrés dans le
SRD mais ne sont jamais accordés automatiquement aux fiches : connaissance ou
préparation réelle restent nécessaires. Les afflictions persistantes suivent le
personnage, y compris leur limite de soins et leur traitement. L'éclairage ne
confère aucune vision dans le noir à partir d'une classe ou d'une description.

L'Inspiration du MJ 2014 est persistée séparément de l'Inspiration bardique et
du bonus de roleplay : un seul crédit, réservé avant le prochain vrai jet de la
catégorie explicitement choisie. Octroi et dépense ne donnent aucune action.
Les profils SRD suivent aussi les six niveaux d'épuisement 2014, avec leurs
désavantages, vitesse et maximum de PV réels. Aid et Drain modifient le maximum
avant sa division ; retrouver un maximum ne soigne pas. La récupération au
repos long reste bloquée sans suivi nourriture/eau. Un ancien état booléen sans
niveau exige une clarification, jamais un niveau déduit. Voir
[Inspiration du MJ](dm-inspiration.md) et [épuisement](exhaustion.md).

Les [PV temporaires](temporary-hp.md) suivent une réserve séparée dans
`dmTools.temporaryHp` ; ils ne modifient ni le kit, ni les PV maximum, ni les
sorts connus. Leurs sorts sources ne sont pas accordés par l'outil d'octroi MJ.
Le [combat à deux armes](two-weapon-fighting.md) utilise deux instances équipées
et un témoin de l'action Attaquer. `two_weapon_fighting` n'est reconnu que si la
fiche le possède, sans octroi aux profils existants ; le bonus contre des objets
reste à raccorder. Duel, lorsqu'il est acquis, compte les armes des deux mains
et suit leur catégorie de mêlée, même si l'arme est lancée.
La [couverture](cover.md) reste attachée à l'origine et aux positions déclarées,
sans déduction automatique depuis les figurines ou calcul 3D de silhouette.
Les [prises réelles](grapple-transport.md) peuvent transporter les deux corps
sur une carte, avec demi-vitesse, exception de taille et réactions persistées.
Leur détenteur exact, joueur ou monstre, peut relâcher son effet sans action ni
soin. Aucun poids général, gabarit multicases ou transfert de prise entre
cartes n'est accordé par ce lot.
Les [rappels joueur développés](player-rules-reference.md), avec leurs sources
officielles, sont conservés séparément du socle compact chargé dans le prompt.

## Guide : ajouter un personnage (checklist cible pour characters/CLAUDE.md)

1. Créer `characters/<id>/` : `sheet.ts` (un `CharacterTemplate` complet) et
   `character-sheet.md` (fiche prompt : identité, stats, sauvegardes,
   compétences, équipement, capacités avec leur tool, traits — SANS niveau ni
   PV chiffrés, SANS vocabulaire d'aucun module).
2. N'utiliser QUE des armes de `lib/srd/weapons.ts` et des sorts de
   `lib/srd/spells.ts`. Besoin d'une nouvelle arme/d'un nouveau sort ? On
   étend le registre (et ses tests), pas le personnage en douce — comme le
   bestiaire MONSTER_TEMPLATES.
3. Nouvelle capacité de classe = nouvelle variante `ClassFeatureId` + logique
   MOTEUR (validation + effet + test) + mention dans la fiche. Jamais une
   capacité « narrative » que seul le LLM appliquerait.
4. Enregistrer dans `lib/character-registry.ts`, puis `npm run build:mcp` et
   `npm test` (la boucle tests/character-registry.test.cjs valide le nouveau
   venu automatiquement — ne pas affaiblir un invariant pour faire passer un
   personnage, corriger la donnée).
5. Optionnel : une accroche `characterHooks['<id>']` par aventure existante
   (2-3 phrases, côté `adventures/<a>/definition.ts` — le vocabulaire de
   module vit LÀ, pas dans characters/).
6. Ajouter le personnage au sélecteur de la landing (si le registre ne
   l'alimente pas déjà automatiquement) et vérifier une partie en
   `npm run dev` (spawn, fiche dans le prompt, sorts jouables).

### Composantes et équipement effectif

Les personnages conservent leur kit publié. Les incantations utilisent les mains du loadout réel et une source matérielle explicitement choisie avec focusItemId (sacoche possédée ou focaliseur de classe réellement tenu). Une arme ou un bouclier peut nécessiter d'être rangé par equip_item avant une composante somatique ; aucun objet porté dans le sac ne devient automatiquement tenu. inspect_spell_components explique ces prérequis sans incanter. Les pénalités d'armure proviennent des maîtrises de la fiche fixe ; aucune maîtrise ou exemption raciale n'est ajoutée par la classe supposée. Voir [composantes](spell-components.md) et [armure](armor-penalties.md).

La nutrition standard peut être suivie explicitement avec begin_nutrition_tracking ; ce choix établit des faits connus sans créer de provisions ni reconstruire les anciens repas. Le personnage consomme les contenus exacts de rations et d'outres réellement possédées ; les besoins raciaux ne sont jamais déduits de sa classe. Le raccord temps/repos est suivi dans le [registre canonique](suivi-integration-mcp.md) et détaillé dans [nutrition](survival-nutrition.md).

### Maîtrise des armes — correction W5

Le bonus de maîtrise des attaques d'arme dépend de la classe fixe du registre : guerrier simple/martial, clerc armes simples, barde armes simples et exceptions publiées, magicien liste publiée. Possession et équipement ne confèrent aucune maîtrise. Les frappes sans arme gardent leur maîtrise et les profils de monstres leurs bonus source ; les attaques de sorts restent distinctes. Les anciennes fiches sans characterId conservent le profil historique de guerrier, tandis qu'un identifiant inconnu n'accorde aucune maîtrise d'arme implicite. Aucun équipement, don ou trait racial n'est ajouté. Voir [maîtrises](weapon-proficiency.md) et le [registre canonique](suivi-integration-mcp.md) pour la validation.

### Portées des armes — W6

Le catalogue existant distingue les portées normale et longue : arc court
80/320 pieds, dague et hache de main lancées 20/60 pieds. Le lancer reste
explicitement choisi ; la portée de mêlée demeure de 5 pieds. Le moteur
résout le désavantage à longue portée et celui d'un tir à proximité d'un
hostile capable de voir le tireur et non neutralisé. Ces règles ne donnent
ni arme, ni munition, ni maîtrise supplémentaire. Voir
[ranged-weapons.md](ranged-weapons.md) pour le périmètre et ses limites.

### Attaque de sort de mêlée non létale — W9

Le choix explicite de KO ne change ni fiche, ni sorts connus/préparés, ni kit.
Dans le catalogue actuel, seule Arme spirituelle effectue cette attaque : frappe
initiale ou répétée, ou vrai parchemin admissible à la classe. Ses coûts bonus,
composantes et cibles réelles restent exigés. Aucun autre sort de mêlée ou
pouvoir de monstre n’est activé implicitement. Voir
[nonlethal-melee-spells.md](nonlethal-melee-spells.md) et le suivi MCP.

### Prise et munitions — W10

Tenir une arme occupe une main ; une véritable attaque à deux mains exige
l'autre main libre. `weaponHands: 2` utilise le dé alternatif publié d'une
arme polyvalente et supprime Duel pour cette attaque. Une main disponible
peut servir aux composantes somatiques entre les attaques, sans ranger
automatiquement l'arme.

Les armes à munitions exigent désormais une pile réellement possédée, sa
quantité et `ammunitionItemId` choisi explicitement. Le catalogue ajoute les
arbalètes légère et de poing ; cela ne les donne à aucun personnage. Les
anciens objets sans quantité ne reçoivent aucun stock supposé. Loading limite
chaque instance à un tir par véritable action ou réaction, pas par tour ; une
nouvelle action doit être effectivement disponible. Les fiches et leurs kits
restent les sources de possession et de maîtrise.

### Repos, cycle à 0 PV et transport — W11

Les repos fragmentables utilisent leurs véritables segments d'activité et de
sommeil. `finish_rest` ne repaie pas la durée déjà accomplie ; les DV peuvent
être choisis successivement au même achèvement avec `spend_rest_hit_die`.
Le sommeil dépose les objets réellement tenus et interrompt la concentration ;
le réveil ne relève ni ne rééquipe le personnage. Les études et harmonisations
utilisent aussi ce cycle. Voir [repos](rest-lifecycle.md).

Un joueur vivant à 0 PV peut entrer dans le combat choisi explicitement, sans
action physique. Sa sauvegarde contre la mort, au véritable événement dû,
ne consomme pas son action ; une ancienne sauvegarde sans historique demande
une observation présente. Aucun jet passé n'est inventé. Voir
[cycle joueur](player-life.md) et [récupération stable](player-stable-recovery.md).

Heavy utilise la taille Small effectivement établie, Reach la portée de l'arme
réellement choisie ; possession et maîtrise restent distinctes. Le transport
physique réserve ses vraies mains et déplace ensemble le joueur et une charge
réelle vers deux destinations explicites. Il n'accorde aucun équipement ni
modification de fiche. Voir [transport](physical-handling.md) et
[voyage à pied](travel.md).

Les longues incantations et rituels des sorts déjà accessibles conservent leur
vraie concentration et leur travail explicite entre les messages. L'emplacement
et l'effet n'arrivent qu'après `finish_casting` ; ni le simple démarrage ni une
attente ne terminent le sort. Une interruption repart de zéro et un rituel
n'autorise pas l'amélioration par emplacement supérieur. Voir
[incantations longues](casting-time.md).

### Catalogue et ressources — cohorte suivante

Le catalogue standard référence les37armes physiques sans les donner au
personnage. Finesse permet un choix explicite d'aptitude par frappe, conservé
pendant les décisions suspendues ; une sarbacane n'invente pas de dé de dégâts.
La lance et le filet utilisent leurs vraies portées, mains, coûts et procédures.
Voir [armes standard](standard-weapons.md).

Le forage produit des ressources réellement gagnées et collectées, puis
consommées séparément. L'eau remplit uniquement les récipients possédés ou
atteignables à capacité connue, avec vrais stocks, volumes et masses ; aucun
contenant ni repas n'est créé par une déclaration. Voir [forage](foraging.md)
et [eau située](water-sources.md). Les portes cachées ont leur découverte
persistante, distincte d'une ouverture ou d'une neutralisation de piège ; voir
[découverte des portes](door-discovery.md).

### Exposition météo — intégration en cours

Le froid et la chaleur lisent les défenses réelles, les vêtements réellement possédés et portés, et l’accès effectif à l’eau. Aucun équipement ni adaptation n’est déduit d’une classe ou d’un nom. Les sauvegardes de CON dues restent distinctes des actions du personnage et des jets de mort ; un corps vivant stable à0PV effectue encore son vrai CON. Les faits et inspections météo sont auxiliaires ; porter un vêtement et se déplacer verticalement suivent leurs vrais coûts. Ce lot ne donne aucun pouvoir de vol au joueur. Voir [météo et exposition](weather.md) et le suivi pour la validation courante.

## Apprentissage standard2014 en cours de partie

Le personnage et son characterId restent fixes. `start_training` et `work_training` suivent un professeur réel, le paiement effectif de1po par vrai jour enseigné et250journées distinctes comprenant chacune8heures. Seul le dernier travail réellement accompli ajoute une langue à `PlayerState.languages` ou une maîtrise à `PlayerState.toolProficiencies`, sans kit, niveau ou expertise gratuit. Les segments partiels, frais et pauses restent dans `dmTools.training` ; ils survivent à la sauvegarde SQL sans effacer les jours incomplets ni les créditer à tort. Le contexte dynamique du MJ transmet les langues et maîtrises actuelles, sans réécrire la fiche initiale mise en cache. Les conditions et bornes complètes sont décrites dans [training.md](training.md) ; la preuve de livraison intégrée est tenue par le suivi MCP canonique.

### Options de sommeil et renommée de faction

Les choix structurés de `configure_sleep_rules` adoptent les options Xanathar
avant les intervalles concernés. La récupération en armure lit les portions
réellement dormies et les dés de vie réellement dépensés. La privation utilise
son ancre conservée et les véritables repos achevés. Voir [sommeil](xge-sleep.md).

La renommée optionnelle du DMG appartient au même personnage dans la même
session, avec un suivi séparé par organisation. Les rangs demandent les seuils,
le niveau réel et les prérequis déclarés ; promotion et retrait sont explicites.
Les ressources, maîtrises, avantages et attitudes suivent leurs procédures
propres. Voir [renommée](renown.md).

<!-- BEGIN:W22-GEAR-AND-OPTIONAL-PHYSICS -->
### Équipement acquis et options W22

Les lanceurs ordinaires peuvent être préparés comme stock initial réel chez un
marchand par `prepare_phb_launcher_stock`, aux prix PHB des sept profils pris en
charge. Offre, achat, paiement, mains et équipement restent des procédures
explicites sur les mêmes instances ; la préparation ne donne rien au personnage.
Les [versions en adamantium](adamantine.md) déjà fabriquées gardent leur
provenance de matière à l'achat, au tir et à la récupération. Un coup au but
contre un objet utilise les vrais dés critiques ; le lanceur ordinaire ne devient
pas adamantin. La transformation d'un équipement possédé est reportée, de même
que les tarifs de lots partiels non représentés. Aucun profil ni personnage de
session n'est remplacé pour acquérir ces objets.

Les [options de chute XGE](xge-falling.md), désactivées par défaut, n'accordent
aucune vitesse de vol au personnage. Les départs de curseur non représentés
restent refusés ; le catalogue de personnages et les capacités de monstres
conservent leur périmètre publié. Le [calendrier](campaign-calendar.md) est une
projection administrative : il ne donne ni repos, maîtrise, recharge ni ressource.
<!-- END:W22-GEAR-AND-OPTIONAL-PHYSICS -->

<!-- BEGIN:W23-SOURCED-PLAYER-PROCEDURES -->
### Nœuds, incantations perçues et travail entre aventures

Les [nœuds optionnels de Xanathar](knots.md) utilisent la vraie corde PHB
entière acquise par le personnage. La corde narrative ancienne de sa fiche
n'est pas convertie en équipement physique qualifié. Après adoption explicite,
le joueur emploie INT(Escamotage) pour nouer/dénouer et DEX(Acrobaties) pour
sortir de sa boucle qualifiée ; le DD conserve le total final du premier jet.
Durée hors combat et action improvisée en combat sont des choix MJ explicites,
sans durée RAW inventée ni état « entravé » automatique. La corde garde une
seule possession et sa masse réelle ; aucun personnage de session ne change.

La [perception des incantations](spell-perception.md) concerne les
observateurs explicitement choisis sur les producteurs réellement pris en
charge. Les composantes effectives, les sens et la géométrie qualifient un
instantané initial, sans nom/niveau du sort ni cible cachée. Entendre seulement
une incantation n'accorde aucune identité de voix ou position cachée. La lecture
ultérieure ne révèle pas la réussite ou l'annulation après le départ d'un
observateur. Identifier le sort reste bloqué faute de fiche officielle locale ;
la proposition maison de l'export n'est pas activée.

Le [travail optionnel entre aventures](xge-downtime-work.md) conserve l'emploi,
les outils réels et cinq journées distinctes de huit heures réellement passées.
Le budget représenté de huit heures est partagé avec artisanat/formation ;
c'est une limite du moteur, pas un maximum universel RAW. Le règlement unique
conserve les complications et arbitrages MJ. Le train de vie est un droit non
monétaire sur sept jours datés, sans provisions, soins, repos ou remboursement
rétroactifs automatiques ; sa consommation en dépenses futures reste à intégrer.
Seul le résultat final correspondant donne les 25 po et leurs pièces choisies.
<!-- END:W23-SOURCED-PLAYER-PROCEDURES -->

<!-- BEGIN:W24-LIGHT-TRAINING-CHASES -->
### Lumière physique, formation Xanathar et poursuites urbaines

[Lumière](light-spell.md) exige un objet de scène existant, touché et mesuré,
sans dimension supérieure à dix pieds. Sa lumière suit cet objet réel pendant
une heure : vingt pieds vifs puis vingt pieds faibles supplémentaires. Une
couverture opaque complète bloque la lumière sans renouveler sa durée. Refaire
le sort ou le terminer avec son action clôt l'ancien ; une ancienne préparation
Ready ne peut pas recréer sa source après un nouveau lancer. Les objets
d'inventaire et ceux tenus ou portés par un hostile restent hors de cette tranche.

La [formation optionnelle Xanathar](xge-training.md) conserve son adoption
explicite, le véritable instructeur et le sujet canonique du cours. La durée
utilise l'INT réelle initiale selon la convention MJ approuvée ; les blocs de
cinq vraies journées d'instruction sont payés 25 po au premier effort, sans
prorata ou remboursement automatique. Les jours de recherche d'un instructeur
disparu sont distincts de l'instruction. La maîtrise finale nécessite ses vrais
efforts et la résolution des complications dues ; elle ne change ni personnage,
classe, aventure ou équipement. La formation PHB par défaut reste distincte.

Les poursuites urbaines du DMG demandent un choix explicite, des participants
existants et l'initiative réelle. Les Dash effectivement utilisés déterminent
les tests de CON et la fatigue propre à la poursuite. Le résultat de complication
conservé touche le participant suivant ; aucune relance ou suppression ne remplace
sa qualification physique. L'attaque de garde de la ligne 9 reste un événement
DMG borné sur un vrai PNJ qualifié et sa lance réelle, sans nouveau profil MM.
La récupération DMG est certifiée après un vrai repos représenté du joueur ;
les autres retraits de source restent des décisions MJ explicites distinctes. Le
conflit avec le sommeil en armure XGE exige l'arbitrage explicite du MJ prévu.
<!-- END:W24-LIGHT-TRAINING-CHASES -->
