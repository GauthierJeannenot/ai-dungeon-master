# Bestiaire & notes de maîtrise — Grammy's Country Apple Pie

> Source : Monster Manual 2025 (XMM). Le moteur applique les stats ; ces blocs
> servent la narration, les DDs annexes et le comportement des créatures.

## Calibrage du module

- **Niveau du joueur : 1.** Règle d'or des DD : 17-18 en cas d'hésitation.
- Budget XP (1 joueur niveau 1) : faible 50 XP · modérée 75 XP · haute 100 XP.
  2 gobelins warriors (100 XP) = déjà dangereux pour un joueur solo.

---

## 🔴 ENNEMIS DE L'AVENTURE

### Gobelin Minion — CR 1/8 · XP 25 *(nouveau MM 2025)*
- **CA** 13 · **HP** 3 (1d6) · **Vitesse** 30 pieds
- FOR −1, DEX +2, CON +0, INT +0, SAG −1, CHA −1
- **ATT** : Cimeterre +4, 1d6+2 tranchants
- **Fuite de gueux** : si allié tue une cible, peut se déplacer de 15 pieds gratuitement (réaction)
- *Usage dans l'aventure* : gobelins de base facilement éliminés, chair à canon

### Gobelin Warrior — CR 1/4 · XP 50
- **CA** 15 (armure de cuir + bouclier) · **HP** 7 (2d6) · **Vitesse** 30 pieds
- FOR −1, DEX +2, CON +0, INT +0, SAG −1, CHA −1
- **ATT** : Cimeterre +4, 1d6+2 tranchants OU Arc court +4, portée 80/320, 1d6+2 perforants
- **Fuite Agile** : Désengagement ou Se cacher comme action bonus chaque tour
- *Usage* : gobelins patrouille (salle 7), gobelins boulangerie (salle 8)

### Gobelin Boss — CR 1 · XP 200
- **CA** 17 (armure de mailles + bouclier) · **HP** 21 (6d6) · **Vitesse** 30 pieds
- FOR +0, DEX +2, CON +0, INT +0, SAG −1, CHA +0
- **ATT** (Multiattaque 2×) : Cimeterre +4, 1d6+2 tranchants
- **Rediriger l'attaque** *(réaction)* : quand ciblé par une attaque, désigne un gobelin adjacent — c'est lui qui reçoit l'attaque à la place
- **Fuite Agile** : Désengagement ou Se cacher comme action bonus
- *Usage* : Chef Grukk (HP réduit à 18 via hpOverride dans le module)

### Hobgoblin Warrior — CR 1/2 · XP 100
- **CA** 18 (cotte de mailles + bouclier) · **HP** 11 (2d8+2) · **Vitesse** 30 pieds
- FOR +1, DEX +1, CON +1, INT +0, SAG +0, CHA −1
- **ATT** : Épée longue +3, 1d8+1 tranchants (ou 1d10+1 à deux mains) OU Arc long +3, portée 150/600, 1d8+1 perforants
- **Avantage martial** : +2d6 dégâts supplémentaires si un allié est à 5 pieds de la cible (1×/tour)
- *Usage* : base de Chef Grukk

### Hobgoblin Captain — CR 3 · XP 700
- **CA** 17 (demi-armure) · **HP** 52 (8d8+16) · **Vitesse** 30 pieds
- FOR +2, DEX +2, CON +2, INT +1, SAG +0, CHA +1
- **ATT** (Multiattaque 2×) : Espadon +4, 2d6+2 tranchants
- **Avantage martial** : +3d6 dégâts si allié à 5 pieds (1×/tour)
- **Leadership** *(réaction, recharge 5-6)* : un allié qui rate un jet d'attaque peut relancer le dé
- *Note* : trop puissant pour niv.1 en combat direct — pour des rencontres futures

---

## 🟣 PNJ NON HOSTILES (AVENTURE)

### Mac le Tréant — Awakened Tree · CR 2 · XP 450
*(Pommier animé par Grammy. Utilise les stats d'Awakened Tree, pas du Treant CR 9)*
- **CA** 13 (armure naturelle) · **HP** 59 (7d12+14) · **Vitesse** 20 pieds
- FOR +4, DEX −2, CON +2, INT +0, SAG +0, CHA −2
- **Vulnérabilité** : dégâts de feu (×2)
- **Fausse apparence** : immobile, ressemble à un pommier ordinaire
- **ATT** : Coup +6, 3d6+4 contondants
- *Comportement* : indifférent si ignoré, bienveillant si approché avec respect, hostile si attaqué ou si le verger est menacé
- *Interaction* : DD 12 Persuasion → révèle les dryades. Peut parler Commun et Sylvain.
- *Note narrative* : un Treant complet (CR 9) serait une menace existentielle pour un joueur niv.1 — Mac est un "jeune" tréant ou un pommier éveillé

### Dryade — CR 1 · XP 200 *(×3 dans le verger)*
- **CA** 11 (armure naturelle) · **HP** 22 (5d8) · **Vitesse** 30 pieds
- FOR +0, DEX +1, CON +0, INT +2, SAG +2, CHA +5
- **Compétences** : Nature +4, Perception +4, Discrétion +5
- **Résistance à la magie** : Avantage sur JS contre sorts
- **ATT** : Gourdin +2 (ou +6 avec Poigne du druide — Sylvestre), 1d4 (ou 1d8+3)
- **Charme féerique** *(action)* : JS SAG DD 14 ou charmé 24h — traite la dryade comme amie de confiance
- **Pas des arbres** *(déplacement)* : entre dans un arbre, ressort d'un autre arbre à 60 pieds (1×/déplacement)
- **Sorts innés** : Façonnage du bois, Enchevêtrement (3/jour), Baies bienfaisantes (3/jour), Hérissons (1/jour)
- *Comportement* : facétieuses et protectrices du verger. Testent le joueur avant d'aider.
- *Interaction* : DD 13 Perception pour repérer, DD 14 CHA pour leur parler sans qu'elles fuient

---

## ⚪ AUTRES CRÉATURES

### Zombie / Champignon Violet — CR 1/4 · XP 50
*(Champignon Violet utilise stats Zombie avec modifications thématiques)*
- **CA** 8 · **HP** 18 (3d8+3) · **Vitesse** 20 pieds (5 pieds pour le champignon)
- FOR +1, DEX −2, CON +1, INT −4, SAG −2, CHA −3
- **Immunités** : poison, épuisé, charmé, effrayé, empoisonné
- **ATT** : Coup +3, 1d6+1 contondants
- **Résistance des morts-vivants** : si réduit à 0 PV → JS CON DD 5 + dégâts reçus → reste à 1 PV (1×/tour)
- *Champignon Violet* : ATT Touche corrosive +2, 1d8 nécrotiques, JS CON DD 10 ou ne peut récupérer de PV jusqu'au prochain repos long

### Champignon Violet pur — CR 1/4 · XP 50
- **CA** 5 · **HP** 18 (4d8) · **Vitesse** 5 pieds
- FOR −4, DEX −5, CON +0, INT −5, SAG −4, CHA −5
- **Fausse apparence** : immobile = impossible à distinguer d'un champignon ordinaire
- **Multiattaque** : 1d4 attaques de Touche pourrie
- **ATT** : Touche pourrie +2, 1d8 nécrotiques, JS CON DD 10 ou impossibilité de récupérer des PV jusqu'au repos long

### Squelette — CR 1/4 · XP 50
- **CA** 13 (restes d'armure) · **HP** 13 (2d8+4) · **Vitesse** 30 pieds
- FOR +0, DEX +2, CON +2, INT −2, SAG −1, CHA −3
- **Vulnérabilité** : dégâts contondants (×2)
- **Immunités** : poison, épuisé, empoisonné
- **ATT** : Épée courte +4, 1d6+2 perforants OU Arc court +4, portée 80/320, 1d6+2 perforants

### Loup — CR 1/4 · XP 50
- **CA** 13 (armure naturelle) · **HP** 11 (2d8+2) · **Vitesse** 40 pieds
- FOR +1, DEX +2, CON +1, INT −4, SAG +1, CHA −2
- **Compétences** : Perception +3, Discrétion +4
- **Tactiques de meute** : Avantage sur attaque si allié à 5 pieds de la cible
- **ATT** : Morsure +4, 2d4+2 perforants · JS FOR DD 11 ou tombe Prone

### Bandit — CR 1/8 · XP 25
- **CA** 12 (armure de cuir) · **HP** 11 (2d8+2) · **Vitesse** 30 pieds
- FOR +0, DEX +1, CON +1, INT +0, SAG +0, CHA +0
- **ATT** : Cimeterre +3, 1d6+1 tranchants OU Arbalète légère +3, portée 80/320, 1d8+1 perforants
