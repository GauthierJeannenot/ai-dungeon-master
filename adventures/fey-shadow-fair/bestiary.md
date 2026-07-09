# Bestiaire & notes de maîtrise — La Foire du Voleur d'Ombres

> Source : SRD 5.1 / Monster Manual 2025, reskins féeriques. Le moteur applique
> les stats ; ces blocs servent la narration, les DDs annexes et le ton.

## Calibrage du module

- **Niveau du joueur : 3.** Règle d'or des DD : 13-15 en cas d'hésitation.
- ⚠️ **Tous les combats sont évitables — et un peu honteux.** Chaque rencontre
  se désamorce par l'humour, le jeu ou la politesse : **CHA ou SAG DD 12-13** +
  un geste dans le ton (rire de soi, accepter la danse, jouer le jeu). Propose
  TOUJOURS cette voie avant et PENDANT le combat.
- Les créatures d'ici ne veulent pas tuer : elles jouent. Une créature à terre
  de honte (désamorcée) vaut les mêmes XP qu'une créature vaincue.

---

## 🎪 CRÉATURES DE LA FOIRE (carte 1)

### Tire-gousset gobelin — Gobelin Minion · CR 1/8 · XP 25
*(engine : `goblin_minion`)*
- **CA** 13 · **HP** 3 · **Vitesse** 30 pieds
- **ATT** : Canif de voleur +3, 1d4+1 tranchants
- **Fuite de gueux** *(réaction)* : si son compère tombe, détale de 15 pieds gratuitement
- *Comportement* : détrousse avec fierté professionnelle, fuit si l'autre tombe. Rendre la bourse volée les vexe profondément.

### Croupier gobelin / Péagiste zélé — Gobelin Warrior · CR 1/4 · XP 50
*(engine : `goblin`)*
- **CA** 15 (gilet à sequins + plateau de jeu en bouclier) · **HP** 7 · **Vitesse** 30 pieds
- **ATT** : Cimeterre +4, 1d6+2 tranchants
- **Fuite Agile** : Désengagement ou Se cacher comme action bonus
- *Comportement* : défend sa baraque (ou son pont) comme un fonds de commerce. Négociable à coups de poinçons de billet ou de bonne blague.

### Videur satyre — Satyre · CR 1/2 · XP 100
*(engine : `satyr`)*
- **CA** 14 (armure de cuir) · **HP** 31 · **Vitesse** 40 pieds
- **Résistance à la magie** : Avantage sur JS contre sorts
- **ATT** : Épée courte +5, 1d6+3 perforants OU Coup de tête +3, 2d4+1 contondants
- *Comportement* : menace en vers de mirliton — rimer avec lui (CHA DD 12) vaut un laissez-passer.

### Brigand à mirliton — Gobelin Minion · CR 1/8 · XP 25
*(engine : `goblin_minion`)*
- **CA** 13 · **HP** 3 · **Vitesse** 30 pieds
- **ATT** : Rapière de carnaval +3, 1d4+1 perforants
- *Comportement* : plus de fanfare que de mordant — son mirliton annonce chaque attaque une seconde à l'avance.

### Loup savant échappé — Loup · CR 1/4 · XP 50
*(engine : `wolf`)*
- **CA** 13 · **HP** 11 · **Vitesse** 40 pieds
- **Tactiques de meute** : Avantage sur attaque si allié à 5 pieds de la cible
- **ATT** : Morsure +4, 2d4+2 perforants · JS FOR DD 11 ou tombe Prone
- *Comportement* : veut un cerceau, pas un mollet. Lui tendre n'importe quoi de rond (SAG Dressage DD 10) le fait redevenir artiste.

### Le Grand Flan — Zombie · CR 1/4 · XP 50
*(engine : `zombie`, hpOverride 16)*
- **CA** 8 · **HP** 16 · **Vitesse** 20 pieds
- **Immunités** : poison, épuisé, charmé, effrayé, empoisonné
- **ATT** : Gifle gélatineuse +3, 1d6+1 contondants
- **Résistance des morts-vivants** : si réduit à 0 PV → JS CON DD 5 + dégâts reçus → reste à 1 PV (1×/tour)
- *Comportement* : dessert de concours animé par dépit. Lent, digne, profondément vexé. Le complimenter sur sa tenue (CHA DD 12) le fait trembloter d'aise.

### Reflet désobligeant — Bandit · CR 1/8 · XP 25
*(engine : `bandit`)*
- **CA** 12 · **HP** 11 · **Vitesse** 30 pieds
- **ATT** : Copie de votre propre coup +3, 1d6+1
- *Comportement* : copie les gestes du héros, en pire. Faire un geste ridicule ASSUMÉ (CHA DD 12) le force à l'imiter — et à se briser de honte.

### Champignon moqueur — Champignon Violet · CR 1/4 · XP 50
*(engine : `violet_fungus`)*
- **CA** 5 · **HP** 18 · **Vitesse** 5 pieds
- **Fausse apparence** : immobile = un champignon ordinaire (qui ricane)
- **ATT** : Touche pourrie +2, 1d8 nécrotiques, JS CON DD 10 ou impossibilité de récupérer des PV jusqu'au repos long
- *Comportement* : ricane, très lent. On peut simplement… marcher plus vite que lui.

---

## 🌳 CRÉATURES DU BOIS-RICANANT (carte 2)

### Grenouille de bal — Grenouille géante · CR 1/4 · XP 50
*(engine : `giant_frog`)*
- **CA** 11 · **HP** 18 · **Vitesse** 30 pieds (+ nage 30 pieds)
- **ATT** : Morsure +3, 1d6+1 perforants · la cible est agrippée (évasion DD 11)
- *Comportement* : offensée, pas maligne. Une révérence dans les règles (CHA DD 12) transforme l'assaut en menuet.

### Chien-clin — Chien esquiveur · CR 1/4 · XP 50
*(engine : `blink_dog`)*
- **CA** 13 · **HP** 22 · **Vitesse** 40 pieds
- **ATT** : Morsure +3, 1d6+1 perforants
- **Téléportation** *(recharge 4-6)* : se téléporte jusqu'à 40 pieds, avant ou après son attaque
- *Comportement* : joue, ne tue jamais. Jouer le jeu (se cacher, lancer un bâton) en fait des alliés qui annoncent « l'Invité Qui Joue » à la Cour.

### Ombre-cotillon / Lutin duelliste — Sprite · CR 1/4 · XP 50
*(engine : `sprite`)*
- **CA** 15 · **HP** 2 · **Vitesse** 10 pieds (vol 40 pieds)
- **ATT** : Épingle à cotillon +6, 1 perforant + JS CON DD 10 ou empoisonné 1 min
- **Invisibilité** *(action)* : disparaît dans un froissement de confettis
- *Comportement* : 2 PV — danse en attaquant (ombre-cotillon) ou salue avant chaque botte, très théâtral (lutin duelliste). Accepter la danse ou le duel POUR RIRE les désamorce aussitôt.

### Feu follet majordome — Feu follet · CR 2 · XP 450
*(engine : `will_o_wisp`, hpOverride 18)*
- **CA** 19 · **HP** 18 · **Vitesse** vol 50 pieds
- **Immunités** : foudre, poison ; résistances aux dégâts physiques non magiques
- **ATT** : Décharge +4, 2d8 foudre
- **Invisibilité** *(action)* : s'éteint poliment
- *Comportement* : annonce les coups qu'il porte (« Monsieur est servi : foudre. »). Le traiter avec les égards dus à son rang (CHA DD 13) le fait passer à votre service.

---

## 🐿 ALLIÉ POSSIBLE

### Barnabé — Arbuste éveillé · CR 0 · XP 10
*(engine : `awakened_shrub`, compagnon potentiel — voir salle 3 et la transition)*
- **CA** 9 · **HP** 10 · **Vitesse** 20 pieds
- **Vulnérabilité** : dégâts de feu (×2)
- **ATT** : Griffure de branches +1, 1d4−1 tranchants
- *Comportement* : mascotte comique, jamais une menace. S'émerveille de tout, se trompe de direction avec assurance, peut servir de numéro devant le Prince.
