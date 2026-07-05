# Personnages jouables & classes (SRD 5) — conception (IMPLÉMENTÉ)

> **Statut : IMPLÉMENTÉ (les 5 phases).** Ce document reste la référence de
> conception ; si une décision change, METTRE À JOUR ce document dans le même
> commit (docs/ a déjà divergé du code — ne pas recommencer). Le joueur choisit
> son personnage (classe, stats, équipement, capacités) au démarrage d'une
> partie, sur n'importe quelle aventure. Catalogue : `characters/<id>/`
> (fighter/rogue/wizard/cleric). Registres : `lib/character-registry.ts` +
> `lib/srd/{weapons,spells,skills}.ts`. Tests : tests/character-registry.test.cjs,
> tests/mcp-characters.test.cjs, plus les 400/409 de tests/dm-adventure-selection
> et le round-trip character_id de tests/db-stores.

## Objectif

Aujourd'hui il n'existe qu'UN héros : un Guerrier figé dans
`lib/player-template.ts` (`BASE_PLAYER`), dont seuls le niveau, les PV,
la position et l'inventaire varient par aventure (`initialPlayer` de
`adventures/<id>/map.ts`), et dont la fiche prompt (`player-character.md`)
est dupliquée par aventure.

Cible : un **catalogue de personnages prétirés** inspirés du SRD 5 (Guerrier,
Roublard, Magicien, Clerc), jouables sur **toutes** les aventures. Le joueur
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
   de sorts, sorts connus, économie d'action bonus, conditions d'attaque
   sournoise : tout est validé par le moteur à partir de faits de `GameState`
   — jamais déclaré par le LLM ni par le client (anti-triche/anti-injection,
   invariant n°1).
5. **Rétrocompatibilité totale sur le Guerrier.** Le personnage par défaut
   (`fighter`) reprend exactement `BASE_PLAYER` actuel : mêmes stats, mêmes
   PV par aventure, même inventaire. Sessions legacy (GameState sans
   `characterId`) = guerrier. Les nombres du `playtest:mock` (23 tours,
   ratio ≈ 0,348) doivent rester comparables avant/après.
6. **Les mécaniques nouvelles sont un sous-ensemble SRD fermé et vérifiable.**
   Pas de concentration, pas de réactions, pas de repos long/court (les
   ressources se rechargent au `travel_to_map` — repos narratif entre maps).
   Chaque sort/capacité du registre a un effet d'une liste fermée que le
   moteur sait résoudre. On étend par ajout de variantes, jamais par du flou.
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

export type CharacterClassId = 'fighter' | 'rogue' | 'wizard' | 'cleric'

// Capacités de classe que le MOTEUR sait appliquer. Liste fermée.
export type ClassFeatureId =
  | 'second_wind'      // action bonus : soin 1d10+niveau, ressource 1/carte
  | 'sneak_attack'     // passif : dés bonus si conditions vérifiables (voir Moteur)
  | 'cunning_action'   // action bonus : dash (×2 mouvement) ou hide
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
  expertise?: string[]             // compétences à double maîtrise (roublard)
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
(reset dans `resetTurnEconomy`, consommée par `second_wind` et
`cunning_action`). Hors combat, non contrainte (comme l'action).

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
use_class_feature({ featureId: 'second_wind' | 'cunning_action', option?: 'dash' | 'hide' })
```

- `second_wind` : guerrier uniquement (`features`), ressource disponible,
  action bonus libre → soin 1d10+niveau, décrémente la ressource.
- `cunning_action` : roublard, action bonus libre. `dash` = double le budget
  de mouvement du tour (crédite `movementUsed` négatif ou relève le plafond —
  implémentation : plafond dynamique `speedCells × (dashed ? 2 : 1)`).
  `hide` = jet de Discrétion (DEX, maîtrise/expertise du personnage) contre
  DD 12 fixe v1 ; succès → condition `invisible` sur le joueur.
- Recharge : `applyMapTravel` remet toutes les `resources` et les
  `spellSlots` à leur max (décision n°6).

### Attaque sournoise (roublard)

Appliquée AUTOMATIQUEMENT par `resolve_player_attack` (jamais un paramètre
LLM) quand TOUTES ces conditions vérifiables sont vraies : l'attaquant a
`sneak_attack` ; l'arme est `finesse` ou `ranged` ; et le joueur a la
condition `invisible` (posée par `cunning_action:hide` ou un
`apply_condition` moteur) **ou** un PNJ/monstre non hostile au joueur est
adjacent à la cible (compagnon au contact). Effet : +1d6 aux dégâts (niveaux
1-2), la condition `invisible` est consommée par l'attaque.

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
   `?character=` reste valide.

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
4. **Cache Anthropic** : une variante de cache par (aventure × personnage ×
   phase) est VOULUE — même logique que par module. Le prompt statique reste
   byte-stable pour une session donnée.
5. **Grille de décision du DM** (prompts.ts) : ajouter aux INSTRUCTIONS
   CRITIQUES la ligne « lancer un sort → `cast_spell` ; capacité de classe
   (second souffle, ruse) → `use_class_feature` — ne JAMAIS narrer l'effet
   avant le tool ». Formulation générique (aucun nom de module), donc pas de
   nouveau champ promptGuidance.
6. **Classifieur** (planner.ts) : exemples génériques « je lance un projectile
   magique sur le gobelin » → cast_spell ; l'enum des tools par phase inclut
   les nouveaux (cast_spell/use_class_feature exposés en combat ET en
   exploration, comme use_healing_potion).
7. **Mock LLM** (lib/dm/llm.ts) : étendre les regex du mock — « je lance
   <sort> » → cast_spell, « second souffle » → use_class_feature — pour que
   tests et playtest couvrent les nouveaux tools sans appel payant.
8. **Playtest** : le scénario Grammy scripté joue le guerrier par défaut →
   `npm run playtest:mock` avant/après, comparer les NOMBRES (23 tours,
   ratio ≈ 0,348) — ils ne doivent pas bouger.

## Catalogue v1 (SRD 5, niveau de référence 1, équilibrage solo)

PV : `base` équilibré solo (~×1,7 SRD, précédent : guerrier 20). Le SRD 5.1
est publié sous licence CC-BY-4.0 : ajouter l'attribution dans le README.

| | `fighter` Guerrier | `rogue` Roublard | `wizard` Magicien | `cleric` Clerc |
|---|---|---|---|---|
| Nom | Héros | Ombre | Aldric | Séréna |
| FOR/DEX/CON | 16/12/14 | 10/16/12 | 8/14/12 | 14/10/14 |
| INT/SAG/CHA | 10/12/10 | 13/12/14 | 16/12/10 | 10/16/12 |
| CA | 16 (cotte + bouclier) | 14 (cuir) | 12 (10+DEX) | 16 (écailles + bouclier) |
| PV base/perLevel | 20 / +8 | 16 / +6 | 12 / +5 | 18 / +7 |
| Sauvegardes | FOR, CON | DEX, INT | INT, SAG | SAG, CHA |
| Compétences | athlétisme, intimidation, perception, histoire | discrétion*, acrobaties, perception, escamotage*, persuasion | arcanes, investigation, histoire, perspicacité | médecine, perspicacité, religion, persuasion |
| Kit | épée longue, bouclier, cotte de mailles, hache de main ×2, potion, pack | rapière, dague ×2, arc court + flèches, cuir, outils de voleur, potion, pack | bâton, dague, grimoire, potion, pack | masse d'armes, bouclier, écailles, symbole sacré, potion, pack |
| Capacités | second_wind | sneak_attack, cunning_action, expertise* | spellcasting | spellcasting |
| Sorts (tours) | — | — | rayon de givre (1d8), lumière (utilitaire) | flamme sacrée (save DEX 1d8), thaumaturgie (utilitaire) |
| Sorts (niv. 1) | — | — | projectile magique (auto 3d4+3), mains brûlantes (save DEX 3d6 ½) | soins (1d8+SAG), éclair traçant/guiding bolt (attaque 4d6), création d'eau (utilitaire → WorldFact) |
| Emplacements niv. 1 | — | — | 3 | 3 |

(* = expertise). Le guerrier est byte-identique à l'existant : `BASE_PLAYER`
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
   compris production des WorldFacts), `use_class_feature`, attaque
   sournoise, recharge au travel_to_map, purge des worldFacts (sortie de
   salle / travel_to_map / plafond FIFO), `skill` sur roll_ability_check.
   Tests moteur dédiés (dés seedés) : un test par validation refusée + un
   par effet de sort + sneak attack (les 2 chemins) + cycle de vie complet
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
