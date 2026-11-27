# Fiche de personnage — Séréna, Clerc, niveau 3

Sous-classe : Domaine de la Vie. Humain. Profil générique, indépendant de l’aventure.
**32 PV**, CA 16, maîtrise +2, vitesse 30 pieds. Les PV conservent le calibrage solo historique ; l’état sauvegardé fait autorité.

## Caractéristiques

| Caractéristique | Score | Modificateur |
|---|---:|---:|
| Force (FOR) | 14 | +2 |
| Dextérité (DEX) | 10 | +0 |
| Constitution (CON) | 14 | +2 |
| Intelligence (INT) | 10 | +0 |
| Sagesse (SAG) | 16 | +3 |
| Charisme (CHA) | 12 | +1 |

Sauvegardes maîtrisées : Sagesse (SAG), Charisme (CHA).
Compétences : Médecine, Perspicacité, Religion, Persuasion.

## Capacités

Incantation ; Disciple de la Vie ; Canalisation divine (1).
use_subclass_feature : Renvoi des morts-vivants ou Préservation de la vie (15 PV à distribuer, plafond moitié des PV max). Une canalisation par repos court ou long. Disciple de la Vie : soins par sort +2+niveau d’emplacement. Pas de destruction des morts-vivants ni de Guérisseur béni.

## Équipement

- Masse d'armes — Arme de mêlée (FOR)
- Bouclier — Bouclier standard (inclus dans la CA)
- Chemise d'écailles — CA 14 de base (incluse dans la CA)
- Symbole sacré — Focaliseur divin pour incanter
- Potion de soin — Restaure 2d4+2 HP
- Jetons divinatoires — Valeur 25 po ; conservés après Augure.
- Poudre de rubis — Valeur 50 po ; consommée par Flamme éternelle.

## Incantation

**Règle maison autorisée : répertoire connu/préparé et tours de magie élargis au-delà du maximum habituel.** Aucun sort de niveau 3 ou plus. Emplacements normaux de niveau 3 : **4 de niveau 1 et 2 de niveau 2**. DD 13, attaque magique +5. Recharge par repos long ; changer de carte ne recharge pas ces profils.

Aptitude : Sagesse (SAG). cast_spell obligatoire avant toute narration. Emplacement supérieur choisi explicitement. Rituels uniquement si la source le prévoit, hors combat (+10 minutes), sans emplacement ; grimoire possédé pour le magicien.

Pour les nouveaux sorts narratifs, fournir `narrative` (image, message, objet, aura ou question choisis). Effets localisés : `toCell` ; Message et Messager animal : `targetId` exact. Composantes coûteuses : `materialItemId` possédé. Respecter `srdNote` : aucune réussite sociale automatique, découverte inventée ou modification implicite de PV, porte ou inventaire.

Concentration unique et durées suivies dans hero.effects. end_concentration pour arrêter. use_narrative_spell_effect : déplacer Image silencieuse (action), Lumières dansantes ou Serviteur invisible (action bonus). Invisibilité cesse pour une cible qui attaque ou lance un sort ; ne rend pas automatiquement caché.

### Tours de magie

| Sort / ID MCP | Portée | Durée / concentration | Rituel | Effet et limites |
|---|---|---|---|---|
| Flamme sacrée / `sacred-flame` | 60 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Thaumaturgie / `thaumaturgy` | 30 pieds | 1 minute | non | Menue manifestation de pouvoir divin : voix tonnante, tremblement bref, flammes qui vacillent — effet sensoriel, aucun dégât ni contrainte mécanique. |
| Lumière / `light` | 0 pieds | 1 hour | non | Fait luire un objet (rayon ~6 m de lumière vive) pendant 1 h, ou éteint une lumière ; pas de dégât. |
| Réparation / `mending` | 0 pieds | Instantaneous | non | Incantation de 1 minute : répare une cassure ou déchirure de 30 cm au plus d’un objet touché ; ne restitue aucune propriété magique et ne soigne pas une créature. |

### Sorts de niveau 1

| Sort / ID MCP | Portée | Durée / concentration | Rituel | Effet et limites |
|---|---|---|---|---|
| Soins / `cure-wounds` | 5 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Éclair traçant / `guiding-bolt` | 120 pieds | 1 round | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Création d'eau / `create-water` | 30 pieds | Instantaneous | non | Crée jusqu'à ~40 L d'eau propre dans un récipient ou en pluie sur un cube de 9 m, OU éteint des flammes sur un cube de 9 m. Pas de dégât, pas de noyade. |
| Mot de guérison / `healing-word` | 60 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Bénédiction / `bless` | 30 pieds | Up to 1 minute / concentration | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Détection de la magie / `detect-magic` | 0 pieds | Up to 10 minutes / concentration | oui | Pendant 10 minutes avec concentration, ressent la magie dans les 9 m. Une action permet de voir les auras des créatures/objets visibles et leur école éventuelle. Ne révèle pas les propriétés, les pièges non magiques ou une solution inconnue. Pierre de 30 cm, métal de 2,5 cm, plomb ou bois/terre de 90 cm bloquent. |
| Détection du mal et du bien / `detect-evil-and-good` | 0 pieds | Up to 10 minutes / concentration | non | Pendant 10 minutes avec concentration, ressent présence et position des aberrations, célestes, élémentaires, fées, fiélons et morts-vivants à 9 m, et lieux consacrés/profanés. Ne détecte ni alignement, mensonge ni intention ; pierre de 30 cm, métal de 2,5 cm, plomb ou bois/terre de 90 cm bloquent. |
| Détection du poison et des maladies / `detect-poison-and-disease` | 0 pieds | Up to 10 minutes / concentration | oui | Pendant 10 minutes avec concentration, détecte et identifie poisons, créatures venimeuses et maladies à 9 m. Pierre de 30 cm, métal de 2,5 cm, plomb ou bois/terre de 90 cm bloquent. Ne soigne ni ne purifie ; ne révèle que les éléments établis de la scène. |
| Purification de nourriture et d’eau / `purify-food-and-drink` | 10 pieds | Instantaneous | oui | Purifie nourriture et boissons non magiques dans une sphère de 1,5 m de rayon au point choisi : retire poisons et maladies. Ne crée pas de nourriture, ne soigne pas un consommateur et ne dissipe pas un enchantement. |

### Sorts de niveau 2

| Sort / ID MCP | Portée | Durée / concentration | Rituel | Effet et limites |
|---|---|---|---|---|
| Augure / `augury` | 0 pieds | Instantaneous | oui | Après 1 minute, présage favorable, défavorable, les deux ou aucun pour une action précise envisagée dans les 30 prochaines minutes. Ne prédit pas les circonstances futures nouvelles. Répétitions avant repos long : 25 % de risque cumulatif de réponse aléatoire, voir oracleReliable. Jetons divinatoires de 25 po requis, conservés. |
| Localisation d’objet / `locate-object` | 0 pieds | Up to 10 minutes / concentration | non | Pendant 10 minutes avec concentration, indique la direction d’un objet familier décrit dans les 300 m, ou le plus proche d’un type choisi. Un objet précis doit avoir été vu de près ; le plomb bloque. Ne révèle ni nom du voleur, ni trajet, ni contenu secret ; absence d’objet connu ne permet pas d’en inventer un. |
| Flamme éternelle / `continual-flame` | 5 pieds | Until dispelled | non | Flamme sur un objet touché, jusqu’à dissipation : lumière vive sur 6 m puis faible sur 6 m, sans chaleur ni consommation d’oxygène. Peut être cachée, pas étouffée. Ne brûle ni ne blesse et ne devient pas une torche physique dans l’inventaire. Poudre de rubis de 50 po consommée. |
| Préservation des morts / `gentle-repose` | 0 pieds | 10 days | oui | Préserve un cadavre touché de la décomposition et empêche sa transformation en mort-vivant pendant 10 jours ; ne ressuscite pas et ne libère pas une âme. Les deux pièces sur les yeux doivent rester en place. |
| Prière de guérison / `prayer-of-healing` | 0 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Restauration partielle / `lesser-restoration` | 0 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Arme spirituelle / `spiritual-weapon` | 60 pieds | 1 minute | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Aide / `aid` | 30 pieds | 8 hours | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Protection contre le poison / `protection-from-poison` | 5 pieds | 1 hour | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Cécité/Surdité / `blindness-deafness` | 30 pieds | 1 minute | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
