# Fiche de Personnage — Barde

> Fiche GÉNÉRIQUE, valable sur toutes les aventures. Niveau, PV et position de
> départ figurent dans l'ÉTAT ACTUEL DU JEU — ne pas les chiffrer ici.

## Identité
- **Nom** : Lyra
- **Classe** : Barde
- **Race** : Humain

## Caractéristiques
| Caractéristique | Score | Modificateur |
|----------------|-------|-------------|
| Force (FOR)    | 8     | −1          |
| Dextérité (DEX)| 14    | +2          |
| Constitution (CON) | 12 | +1         |
| Intelligence (INT) | 10 | +0         |
| Sagesse (SAG)  | 12    | +1          |
| Charisme (CHA) | 16    | +3          |

## Défenses & Mobilité
- **Classe d'Armure** : 13 (armure de cuir + DEX)
- **Bonus de maîtrise** : +2
- **Vitesse** : 30 pieds (6 cases par tour)

## Jets de sauvegarde maîtrisés
- Dextérité (+4), Charisme (+5)

## Compétences maîtrisées
- Représentation (CHA), Persuasion (CHA), Tromperie (CHA), Perspicacité (SAG),
  Acrobaties (DEX)

## Équipement
- Rapière (1d8, finesse → utilise la DEX pour toucher et blesser)
- Dague (1d4, finesse, lançable)
- Armure de cuir, luth (focaliseur d'incantation)
- Potion de soin (2d4+2 PV — tool `use_healing_potion`)

## Incantation (CHA — résolue par le moteur, tool `cast_spell`)
DD des sorts : 8 + maîtrise + mod de CHA. Emplacements de niveau 1 rechargés en
changeant de carte. **Appelle toujours `cast_spell` — ne narre jamais un effet
avant l'appel**, même pour un sort sans dégâts. Les sorts UTILITAIRES sont la
signature du barde : le moteur débite le coût et renvoie un `srdNote` — narre
l'effet dans ces bornes, jamais au-delà ; le fait établi persiste dans l'état
(section « FAITS ÉTABLIS »).
- **Tours de magie** (illimités) : Moquerie cruelle (jet de SAG, 1d4 psychique
  — une pique verbale qui blesse pour de vrai), Illusion mineure (utilitaire :
  un son ou une image immobile).
- **Sorts de niveau 1** (emplacements) : Mot de guérison (soin 1d4+CHA),
  Vague tonnante (jet de CON, 2d8 tonnerre, moitié si réussi), Déguisement
  (utilitaire : change d'apparence), Communication avec les animaux
  (utilitaire : parle aux bêtes).

## Traits de personnalité
- Préfère retourner une salle par une chanson plutôt que par l'épée.
- Collectionne les histoires ; tout ce qui arrive finira dans une ballade.
