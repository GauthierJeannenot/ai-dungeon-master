# Fiche de personnage — Lyra, Barde, niveau 3

Sous-classe : Collège du Savoir. Humain. Profil générique, indépendant de l’aventure.
**28 PV**, CA 13, maîtrise +2, vitesse 30 pieds. Les PV conservent le calibrage solo historique ; l’état sauvegardé fait autorité.

## Caractéristiques

| Caractéristique | Score | Modificateur |
|---|---:|---:|
| Force (FOR) | 8 | -1 |
| Dextérité (DEX) | 14 | +2 |
| Constitution (CON) | 12 | +1 |
| Intelligence (INT) | 10 | +0 |
| Sagesse (SAG) | 12 | +1 |
| Charisme (CHA) | 16 | +3 |

Sauvegardes maîtrisées : Dextérité (DEX), Charisme (CHA).
Compétences : Représentation, Persuasion, Tromperie, Perspicacité, Acrobaties, Arcanes, Histoire, Investigation.
Expertises : Persuasion, Perspicacité.

## Capacités

Incantation ; Touche-à-tout ; Inspiration bardique (d6) ; Chant reposant (d6) ; Mots cinglants.
use_subclass_feature : Inspiration bardique d6 sur une autre créature qui entend à 18 m, 3 utilisations par repos long. resolve_reaction pour Mots cinglants (d6). Chant reposant d6 avec des dés de vie. Pas de Source d’inspiration, Contre-charme ou Secrets magiques.

## Équipement

- Rapière — Arme de finesse (DEX)
- Dague — Finesse, lançable
- Armure de cuir — CA 11 + DEX (incluse dans la CA)
- Luth — Focaliseur d'incantation et gagne-pain
- Potion de soin — Restaure 2d4+2 HP
- Perle d’identification — Perle de 100 po, non consommée.
- Encre d’écriture illusoire — Encre de 10 po, consommée.
- Poudre de jade de bouche magique — Poudre de 10 po, consommée.

## Incantation

**Règle maison autorisée : répertoire connu/préparé et tours de magie élargis au-delà du maximum habituel.** Aucun sort de niveau 3 ou plus. Emplacements normaux de niveau 3 : **4 de niveau 1 et 2 de niveau 2**. DD 13, attaque magique +5. Recharge par repos long ; changer de carte ne recharge pas ces profils.

Aptitude : Charisme (CHA). cast_spell obligatoire avant toute narration. Emplacement supérieur choisi explicitement. Rituels uniquement si la source le prévoit, hors combat (+10 minutes), sans emplacement ; grimoire possédé pour le magicien.

Pour les nouveaux sorts narratifs, fournir `narrative` (image, message, objet, aura ou question choisis). Effets localisés : `toCell` ; Message et Messager animal : `targetId` exact. Composantes coûteuses : `materialItemId` possédé. Respecter `srdNote` : aucune réussite sociale automatique, découverte inventée ou modification implicite de PV, porte ou inventaire.

Concentration unique et durées suivies dans hero.effects. end_concentration pour arrêter. use_narrative_spell_effect : déplacer Image silencieuse (action), Lumières dansantes ou Serviteur invisible (action bonus). Invisibilité cesse pour une cible qui attaque ou lance un sort ; ne rend pas automatiquement caché.

### Tours de magie

| Sort / ID MCP | Portée | Durée / concentration | Rituel | Effet et limites |
|---|---|---|---|---|
| Moquerie cruelle / `vicious-mockery` | 60 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Illusion mineure / `minor-illusion` | 30 pieds | 1 minute | non | Crée un SON ou l'IMAGE IMMOBILE d'un objet (cube de 1,5 m) pendant 1 min ; ni lumière, ni odeur, ni effet physique — le toucher ou une Investigation réussie la perce. |
| Lumière / `light` | 0 pieds | 1 hour | non | Fait luire un objet (rayon ~6 m de lumière vive) pendant 1 h, ou éteint une lumière ; pas de dégât. |
| Main du mage / `mage-hand` | 30 pieds | 1 minute | non | Main spectrale, 1 minute, objet de 5 kg au plus ; aucune attaque ni activation magique. Les changements réels d’inventaire ou de porte exigent toujours leurs outils dédiés, la description seule ne les résout pas. |
| Réparation / `mending` | 0 pieds | Instantaneous | non | Incantation de 1 minute : répare une cassure ou déchirure de 30 cm au plus d’un objet touché ; ne restitue aucune propriété magique et ne soigne pas une créature. |
| Prestidigitation / `prestidigitation` | 10 pieds | 1 hour | non | Effet sensoriel anodin, allumer/éteindre une petite flamme, nettoyer/salir un objet de 30 cm, saveur/température/couleur ou marque pendant 1 heure. Au plus trois effets non instantanés. Aucun dégât, état, objet de valeur ou avantage automatique. |
| Message / `message` | 120 pieds | 1 round | non | Murmure à une créature précise dans les 36 m ; elle seule entend et peut répondre en chuchotant. Pas de lecture des pensées ni de réponse forcée. Les obstacles épais, le plomb ou un silence magique bloquent le message ; aucun secret inventé. |
| Lumières dansantes / `dancing-lights` | 120 pieds | Up to 1 minute / concentration | non | Jusqu’à quatre lumières faibles, chacune éclairant sur 3 m, pendant 1 minute avec concentration. Elles restent à 6 m les unes des autres ; déplacement ultérieur par action bonus. Aucun dégât ni aveuglement. |

### Sorts de niveau 1

| Sort / ID MCP | Portée | Durée / concentration | Rituel | Effet et limites |
|---|---|---|---|---|
| Mot de guérison / `healing-word` | 60 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Soins / `cure-wounds` | 5 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Vague tonnante / `thunderwave` | 15 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Charme-personne / `charm-person` | 30 pieds | 1 hour | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Déguisement / `disguise-self` | 0 pieds | 1 hour | non | Change l'apparence du lanceur (visage, vêtements, ±30 cm de taille) pendant 1 h ; purement visuel — le toucher ou une Investigation réussie perce l'illusion. |
| Communication avec les animaux / `speak-with-animals` | 0 pieds | 10 minutes | oui | Comprend les bêtes et se fait comprendre d'elles pendant 10 min ; leur savoir reste celui d'une bête, et leur attitude reste la leur (aucun contrôle). |
| Compréhension des langues / `comprehend-languages` | 0 pieds | 1 hour | oui | Pendant 1 heure, comprend le sens littéral des langues entendues et des textes touchés ; ne parle pas les langues et ne déchiffre ni codes ni glyphes magiques. |
| Détection de la magie / `detect-magic` | 0 pieds | Up to 10 minutes / concentration | oui | Pendant 10 minutes avec concentration, ressent la magie dans les 9 m. Une action permet de voir les auras des créatures/objets visibles et leur école éventuelle. Ne révèle pas les propriétés, les pièges non magiques ou une solution inconnue. Pierre de 30 cm, métal de 2,5 cm, plomb ou bois/terre de 90 cm bloquent. |
| Identification / `identify` | 5 pieds | Instantaneous | oui | Après 1 minute de contact avec un objet, apprend ses propriétés magiques, leur utilisation, l’harmonisation requise, charges et sorts actifs éventuels ; sur une créature touchée, identifie les sorts actifs. Ne révèle pas généralement une malédiction ou un secret historique. Perle de 100 po requise, non consommée. |
| Serviteur invisible / `unseen-servant` | 60 pieds | 1 hour | oui | Force informe pendant 1 heure : tâches simples et non combattantes, FOR 2, CA 10, 1 PV. Ne peut attaquer ; disparaît à 0 PV ou au-delà de 18 m du lanceur. Commande par action bonus. Toute modification réelle d’inventaire, porte ou objet exige son outil dédié. |
| Écriture illusoire / `illusory-script` | 5 pieds | 10 days | oui | Après 1 minute, inscrit sur un support touché un texte lisible par les lecteurs désignés pendant 10 jours ; les autres voient une écriture inconnue ou un autre texte choisi. Vision véritable perce la tromperie. Encre de 10 po consommée ; aucun faux document ne garantit la persuasion. |
| Image silencieuse / `silent-image` | 60 pieds | Up to 10 minutes / concentration | non | Image visuelle dans un cube de 4,5 m, 10 minutes avec concentration. Ni son, ni odeur, ni matière ; interaction physique révèle l’illusion, Investigation contre le DD du lanceur peut la percer. La déplacer exige une action. Ne bloque pas mécaniquement les mouvements ni la visibilité. |

### Sorts de niveau 2

| Sort / ID MCP | Portée | Durée / concentration | Rituel | Effet et limites |
|---|---|---|---|---|
| Bouche magique / `magic-mouth` | 30 pieds | Until dispelled | oui | Après 1 minute, enchante un objet non porté : message de 25 mots au plus durant au plus 10 minutes, déclenché par une circonstance visuelle ou audible à 9 m définie à l’incantation. Choisir usage unique ou répétitif ; dure jusqu’à dissipation. Ne détecte pas les pensées ni les secrets. Poudre de jade de 10 po consommée. |
| Localisation d’objet / `locate-object` | 0 pieds | Up to 10 minutes / concentration | non | Pendant 10 minutes avec concentration, indique la direction d’un objet familier décrit dans les 300 m, ou le plus proche d’un type choisi. Un objet précis doit avoir été vu de près ; le plomb bloque. Ne révèle ni nom du voleur, ni trajet, ni contenu secret ; absence d’objet connu ne permet pas d’en inventer un. |
| Messager animal / `animal-messenger` | 30 pieds | 24 hours | oui | Une bête de taille Très Petite visible transmet au plus 25 mots à un destinataire décrit dans un lieu déjà visité. Voyage pendant 24 heures (80 km en vol, 40 km autrement) ; +48 heures par emplacement supérieur. Ne téléporte pas le message, ne garantit pas la livraison et ne contrôle pas une autre catégorie de créature. |
| Invisibilité / `invisibility` | 5 pieds | Up to 1 hour / concentration | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Détection de l’invisibilité / `see-invisibility` | 0 pieds | 1 hour | non | Pendant 1 heure, voit créatures et objets invisibles comme visibles et perçoit le plan Éthéré de façon translucide. Ne traverse ni mur ni porte et ne révèle pas les pensées ou les créatures cachées derrière un obstacle. |
| Fracassement / `shatter` | 60 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Restauration partielle / `lesser-restoration` | 0 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Cécité/Surdité / `blindness-deafness` | 30 pieds | 1 minute | non | Résolution mécanique par le moteur (cible et paramètres explicites). |

Prestidigitation : choisir effectDurationSeconds (0 = instantané, 12 = babiole/image jusqu’au prochain tour, 3600 = effet d’une heure). Au plus trois effets durables ; dismiss_prestidigitation avec l’effet exact dépense une action pour le supprimer.
