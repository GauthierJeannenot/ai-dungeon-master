# characters/ — catalogue GLOBAL des personnages jouables

Catalogue de personnages prétirés (inspirés du SRD 5.1, CC-BY-4.0), **orthogonal
aux aventures** : un personnage se joue sur n'importe quel module. Miroir de
`adventures/<id>/`. Conception : docs/playable-characters.md (IMPLÉMENTÉ).

**Zéro vocabulaire de module ici.** `characters/` est global : aucun nom propre
d'aventure (Grammy, verger, crypte, foire…) dans un `sheet.ts` ou un
`character-sheet.md`. L'accroche narrative liant un personnage à une aventure
vit dans `adventures/<id>/definition.ts` (`characterHooks`), pas ici. Vérifié
par tests/character-registry.test.cjs.

## Anatomie d'un personnage `characters/<id>/`

| Fichier | Rôle | Consommé par |
|---|---|---|
| `sheet.ts` | Données MOTEUR+APP : un `CharacterTemplate` (stats, CA, kit, PV en formule, capacités, sorts) | moteur MCP **et** app (compilé par mcp-server) |
| `character-sheet.md` | Fiche prompt GÉNÉRIQUE (identité, stats, compétences, kit, capacités avec leur tool, traits — **sans niveau ni PV chiffrés**) | context-loader |

- `sheet.ts` est importé par `lib/character-registry.ts` : rien d'app-only
  (pas de fs, next, logger).
- Le PERSONNAGE apporte : classe, stats, CA, vitesse, kit d'équipement, PV
  (formule `base + perLevel × (niveau − 1)`), capacités, sorts. L'AVENTURE
  n'apporte que le niveau, la position de départ et d'éventuels objets propres
  (`initialPlayer.extraInventory`).

## Invariants (moteur seul juge — anti-triche)

- Les mécaniques de classe sont appliquées par le MOTEUR (`cast_spell`,
  `use_class_feature`, attaque sournoise auto), jamais déclarées par le LLM.
- N'utiliser QUE des armes de `lib/srd/weapons.ts`, des sorts de
  `lib/srd/spells.ts` et des compétences de `lib/srd/skills.ts` (ids anglais).
  Besoin d'une nouvelle arme/d'un nouveau sort ? On étend le registre (+ son
  test), pas le personnage en douce — comme le bestiaire `MONSTER_TEMPLATES`.
- Rétrocompat : le guerrier (`fighter`) est le personnage par défaut et reste
  byte-identique à l'ancien héros (stats/CA/kit) — les sessions legacy sans
  `characterId` retombent dessus.

## Ajouter un personnage

1. Créer `characters/<id>/` : `sheet.ts` (un `CharacterTemplate` complet) et
   `character-sheet.md` (fiche prompt générique, **sans niveau/PV chiffrés,
   sans vocabulaire de module**).
2. N'employer que des ids connus des registres `lib/srd/`. Une nouvelle
   capacité de classe = nouvelle variante `ClassFeatureId` (lib/types.ts +
   lib/character-registry.ts) + logique MOTEUR (validation + effet + test dans
   tests/mcp-characters.test.cjs) + mention dans la fiche. Jamais une capacité
   « narrative » que seul le LLM appliquerait.
3. Enregistrer dans `lib/character-registry.ts` (`CHARACTERS` + `CHARACTER_ORDER`)
   et l'ajouter au `include` de `mcp-server/tsconfig.json` si besoin (le glob
   `characters/**/sheet.ts` le couvre déjà).
4. `npm run build:mcp` puis `npm test` : tests/character-registry.test.cjs
   boucle sur tout le catalogue (stats bornées, armes/sorts du registre,
   formule PV, anti-fuite). Ne pas affaiblir un invariant pour faire passer un
   personnage — corriger la donnée.
5. Optionnel : une accroche `characterHooks['<id>']` par aventure existante
   (côté `adventures/<a>/definition.ts` — le vocabulaire de module vit LÀ).
6. Sélecteur landing (`components/landing/CharacterPicker.tsx`) : alimenté
   automatiquement par `listCharacters()`. Vérifier une partie en `npm run dev`
   (spawn, fiche dans le prompt, sorts/capacités jouables).
