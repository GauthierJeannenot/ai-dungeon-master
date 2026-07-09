# Bestiaire & notes de maîtrise — La Crypte des Marées

> Source : Monster Manual 2025 (XMM). Les créatures de la crypte réutilisent
> des blocs standards, reskinnés pour le tombeau marin (le moteur applique les
> stats ; ces notes servent la narration).

## Calibrage du module

- **Niveau du joueur : 2.** Règle d'or des DD : 13-15 en cas d'hésitation.
- Budget XP (1 joueur niveau 2) : faible 100 XP · modérée 200 XP · haute 300 XP.
  2 Squelettes (100 XP) = faible ; 1 Noyé + 1 Squelette = modérée ; le Gardien
  Noyé seul = rencontre de boss → **à désamorcer en priorité**.
- ⚠️ **La marée qui remonte est la vraie horloge du module** : rappelle-la, ne
  la transforme pas en piège mortel arbitraire. Un repos long dans la crypte
  signifie que la mer a refermé la chaussée — gère la tension en conséquence.
- Ici, l'énigme des cloches et la marée valent mieux que des dalles piégées.
- ⚠️ Tous les combats sont évitables : propose TOUJOURS la voie du respect
  rituel avant de faire couler le sang.

## Comportement des morts de la crypte

Les morts-vivants d'ici ne haïssent pas les vivants : **ils protègent leur
Gardienne**. Ils n'attaquent que si on les profane, on les menace, ou on tente
de voler la Flamme sans permission.

### Désamorcer un affrontement
- **CHA ou SAG DD 13** + un geste de respect crédible (reposer une arme, s'agenouiller, prononcer le nom de Morgane, présenter le Médaillon).
- Réussite → les morts se rangent, se rendorment, ou s'inclinent. Un combat déjà engagé peut cesser.
- L'**Écho de la Gardienne** (salle 8), une fois révélée, sert de médiatrice : sa présence facilite tous les tests sociaux.

### Tactiques si le combat éclate malgré tout
- Les morts encerclent lentement (vitesse réduite dans l'eau) plutôt que de charger.
- Ils cessent le combat dès qu'un geste de respect crédible est posé (JS SAG DD 13 pour « entendre » l'apaisement).

### Descriptions qualitatives des HP (adaptées au module)
| État | Description |
|------|-------------|
| > 75% HP | "se tient droit dans l'eau noire", "impassible", "à peine entamé" |
| 50–75% | "des éclats d'os tombent", "vacille légèrement", "une plaie qui ne saigne pas" |
| 25–50% | "sérieusement disloqué", "ploie", "de l'eau de mer suinte de ses blessures" |
| < 25% | "sur le point de retourner à l'écume", "chancelant", "près de s'effondrer" |

---

## 🔵 GARDES DE LA CRYPTE

### Marin squelette — Squelette · CR 1/4 · XP 50
*(engine : `skeleton`)*
- **CA** 13 (restes de ciré et d'os) · **HP** 13 (2d8+4) · **Vitesse** 30 pieds
- **Vulnérabilité** : dégâts contondants (×2)
- **Immunités** : poison, épuisé, empoisonné
- **ATT** : Sabre d'abordage +4, 1d6+2 tranchants OU Arc court +4, 1d6+2 perforants
- *Comportement* : sanglés dans leur uniforme d'un siècle, ils montent la garde sans haine. Se rendorment si on les apaise.

### Marin noyé — Noyé · CR 1/4 · XP 50
*(engine : `zombie`, reskin marin noyé)*
- **CA** 8 · **HP** 18 (3d8+3) · **Vitesse** 20 pieds
- **Immunités** : poison, épuisé, charmé, effrayé, empoisonné
- **ATT** : Poing gonflé d'eau +3, 1d6+1 contondants
- **Résistance des morts-vivants** : si réduit à 0 PV → JS CON DD 5 + dégâts reçus → reste à 1 PV (1×/tour)
- *Comportement* : lents, silencieux, les chairs gonflées de sel. Ne poursuivent pas hors de leur salle.

### Le Gardien Noyé — Capitaine mort-vivant · boss narratif
*(engine : `hobgoblin_captain`, HP réduit à 33 via hpOverride)*
- **CA** 17 (grand uniforme gonflé d'eau) · **HP** 33 · **Vitesse** 30 pieds
- **ATT** (Multiattaque 2×) : Sabre de capitaine +4, 2d6+2 tranchants
- **Avantage martial** : +3d6 dégâts si un allié mort est à 5 pieds de la cible (1×/tour)
- **Leadership** *(réaction, recharge 5-6)* : un marin allié qui rate une attaque peut relancer le dé
- *Comportement* : **loyal jusqu'à l'absurde**. Il n'attaque pas d'emblée — il attend de savoir qui vous êtes. Reconnaît le Médaillon, s'incline devant l'Écho révélée, et s'effondre en écume s'il est apaisé (DD 13 CHA avec l'Écho présente). Le combat direct est un échec de mise en scène, pas une victoire.

---

## ⚪ AUTRES CRÉATURES (rencontres optionnelles)

### Loup des grèves — Loup · CR 1/4 · XP 50
*(engine : `wolf`)*
- **CA** 13 · **HP** 11 (2d8+2) · **Vitesse** 40 pieds
- **Tactiques de meute** : Avantage sur attaque si allié à 5 pieds de la cible
- **ATT** : Morsure +4, 2d4+2 perforants · JS FOR DD 11 ou tombe Prone
- *Usage* : charognards de la grève, avant la descente — évitables en tenant la lanterne haut.

### Pillard de tempête — Bandit · CR 1/8 · XP 25
*(engine : `bandit`)*
- **CA** 12 · **HP** 11 (2d8+2) · **Vitesse** 30 pieds
- **ATT** : Coutelas +3, 1d6+1 tranchants OU Arbalète légère +3, 1d8+1 perforants
- *Usage* : naufrageurs venus piller l'épave avant vous — les seuls vrais vivants hostiles du module.
