# Fiche de Personnage — Roublard

> Fiche GÉNÉRIQUE, valable sur toutes les aventures. Niveau, PV et position de
> départ figurent dans l'ÉTAT ACTUEL DU JEU — ne pas les chiffrer ici.

## Identité
- **Nom** : Ombre
- **Classe** : Roublard
- **Race** : Humain

## Caractéristiques
| Caractéristique | Score | Modificateur |
|----------------|-------|-------------|
| Force (FOR)    | 10    | +0          |
| Dextérité (DEX)| 16    | +3          |
| Constitution (CON) | 12 | +1         |
| Intelligence (INT) | 13 | +1         |
| Sagesse (SAG)  | 12    | +1          |
| Charisme (CHA) | 14    | +2          |

## Défenses & Mobilité
- **Classe d'Armure** : 14 (armure de cuir + DEX)
- **Bonus de maîtrise** : +2
- **Vitesse** : 30 pieds (6 cases par tour)

## Jets de sauvegarde maîtrisés
- Dextérité (+5), Intelligence (+3)

## Compétences maîtrisées
- Discrétion (DEX, **expertise** +7), Escamotage (DEX, **expertise** +7),
  Acrobaties (DEX), Perception (SAG), Persuasion (CHA)

## Équipement
- Rapière (1d8, finesse → utilise la DEX pour toucher et blesser)
- Deux dagues (1d4, finesse, lançables)
- Arc court (1d6, à distance → DEX)
- Armure de cuir, outils de voleur
- Potion de soin (2d4+2 PV — tool `use_healing_potion`)

## Capacités de classe (résolues par le moteur — appelle toujours le tool)
- **Attaque sournoise** : +dés de dégâts (⌈niveau/2⌉ d6) avec une arme de finesse
  ou à distance, quand le roublard est caché/invisible OU qu'un allié est au
  contact de la cible. **Automatique** : `resolve_player_attack` l'applique seul
  quand les conditions sont réunies — ne la demande jamais en paramètre.
- **Ruse** : action bonus. `use_class_feature({ featureId: "cunning_action",
  option: "hide" })` pour se cacher (jet de Discrétion → invisible), ou
  `option: "dash"` pour doubler le mouvement du tour.

## Traits de personnalité
- Observe avant d'agir ; frappe une fois, au bon moment.
- Préfère l'ombre et la parole habile à l'affrontement direct.
