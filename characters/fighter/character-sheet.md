# Fiche de Personnage — Guerrier

> Fiche GÉNÉRIQUE du personnage, valable sur toutes les aventures. Le niveau, les
> points de vie et la position de départ dépendent de l'aventure et figurent dans
> l'ÉTAT ACTUEL DU JEU (bloc dynamique) — ne pas les chiffrer ici.

## Identité
- **Nom** : Héros
- **Classe** : Guerrier
- **Race** : Humain

## Caractéristiques
| Caractéristique | Score | Modificateur |
|----------------|-------|-------------|
| Force (FOR)    | 16    | +3          |
| Dextérité (DEX)| 12    | +1          |
| Constitution (CON) | 14 | +2         |
| Intelligence (INT) | 10 | +0         |
| Sagesse (SAG)  | 12    | +1          |
| Charisme (CHA) | 10    | +0          |

## Défenses & Mobilité
- **Classe d'Armure** : 16 (cotte de mailles + bouclier)
- **Bonus de maîtrise** : +2
- **Vitesse** : 30 pieds (6 cases par tour)

## Jets de sauvegarde maîtrisés
- Force (+5), Constitution (+4)

## Compétences maîtrisées
- Athlétisme (FOR), Intimidation (CHA), Perception (SAG), Histoire (INT)

## Équipement
- Épée longue (1d8 tranchants, mêlée — dégâts +3 grâce à la FOR)
- Deux haches de main (1d6, mêlée ou lancer)
- Bouclier et cotte de mailles (inclus dans la CA)
- Potion de soin (2d4+2 PV, action pour boire — tool `use_healing_potion`)

## Capacités de classe (résolues par le moteur — appelle toujours le tool)
- **Second souffle** : action bonus, récupère 1d10 + niveau PV, une fois par carte.
  Utilise le tool `use_class_feature({ featureId: "second_wind" })` — ne narre
  jamais le soin avant l'appel.

## Traits de personnalité
- Direct et sans détour, peu de patience pour la ruse ou la duplicité.
- Protège les innocents ; loyauté absolue envers ses compagnons de combat.
- Méfiant envers la magie et le surnaturel.
