# Fiche de personnage — Aldric, Magicien, niveau 3

Sous-classe : École d’Évocation. Humain. Profil générique, indépendant de l’aventure.
**22 PV**, CA 12, maîtrise +2, vitesse 30 pieds. Les PV conservent le calibrage solo historique ; l’état sauvegardé fait autorité.

## Caractéristiques

| Caractéristique | Score | Modificateur |
|---|---:|---:|
| Force (FOR) | 8 | -1 |
| Dextérité (DEX) | 14 | +2 |
| Constitution (CON) | 12 | +1 |
| Intelligence (INT) | 16 | +3 |
| Sagesse (SAG) | 12 | +1 |
| Charisme (CHA) | 10 | +0 |

Sauvegardes maîtrisées : Intelligence (INT), Sagesse (SAG).
Compétences : Arcanes, Investigation, Histoire, Perspicacité.

## Capacités

Incantation ; Récupération arcanique ; Savant de l’évocation ; Sculpture des sorts.
take_rest : récupération arcanique de 2 niveaux d’emplacements au plus, une fois par jour, lors d’un repos court. Sculpture des sorts : évocations de zone, cibles explicitement choisies. Pas de Tours de magie puissants.

## Équipement

- Bâton — Arme de mêlée simple
- Dague — Finesse (DEX)
- Grimoire — Recueil de sorts arcaniques
- Potion de soin — Restaure 2d4+2 HP
- Sacoche à composantes — Composantes usuelles sans coût ; ne remplace pas les matériaux coûteux.
- Perle d’identification — Perle de 100 po, non consommée.
- Encre d’écriture illusoire — Encre de 10 po, consommée.
- Poudre de jade de bouche magique — Poudre de 10 po, consommée.
- Poudre de rubis — Poudre de 50 po, consommée.
- Corde de chanvre — 15 m, pour Corde enchantée.

## Incantation

**Règle maison autorisée : répertoire connu/préparé et tours de magie élargis au-delà du maximum habituel.** Aucun sort de niveau 3 ou plus. Emplacements normaux de niveau 3 : **4 de niveau 1 et 2 de niveau 2**. DD 13, attaque magique +5. Recharge par repos long ; changer de carte ne recharge pas ces profils.

Aptitude : Intelligence (INT). cast_spell obligatoire avant toute narration. Emplacement supérieur choisi explicitement. Rituels uniquement si la source le prévoit, hors combat (+10 minutes), sans emplacement ; grimoire possédé pour le magicien.

Pour les nouveaux sorts narratifs, fournir `narrative` (image, message, objet, aura ou question choisis). Effets localisés : `toCell` ; Message et Messager animal : `targetId` exact. Composantes coûteuses : `materialItemId` possédé. Respecter `srdNote` : aucune réussite sociale automatique, découverte inventée ou modification implicite de PV, porte ou inventaire.

Concentration unique et durées suivies dans hero.effects. end_concentration pour arrêter. use_narrative_spell_effect : déplacer Image silencieuse (action), Lumières dansantes ou Serviteur invisible (action bonus). Invisibilité cesse pour une cible qui attaque ou lance un sort ; ne rend pas automatiquement caché.

### Tours de magie

| Sort / ID MCP | Portée | Durée / concentration | Rituel | Effet et limites |
|---|---|---|---|---|
| Rayon de givre / `ray-of-frost` | 60 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Lumière / `light` | 0 pieds | 1 hour | non | Fait luire un objet (rayon ~6 m de lumière vive) pendant 1 h, ou éteint une lumière ; pas de dégât. |
| Illusion mineure / `minor-illusion` | 30 pieds | 1 minute | non | Crée un SON ou l'IMAGE IMMOBILE d'un objet (cube de 1,5 m) pendant 1 min ; ni lumière, ni odeur, ni effet physique — le toucher ou une Investigation réussie la perce. |
| Main du mage / `mage-hand` | 30 pieds | 1 minute | non | Main spectrale, 1 minute, objet de 5 kg au plus ; aucune attaque ni activation magique. Les changements réels d’inventaire ou de porte exigent toujours leurs outils dédiés, la description seule ne les résout pas. |
| Réparation / `mending` | 0 pieds | Instantaneous | non | Incantation de 1 minute : répare une cassure ou déchirure de 30 cm au plus d’un objet touché ; ne restitue aucune propriété magique et ne soigne pas une créature. |
| Prestidigitation / `prestidigitation` | 10 pieds | 1 hour | non | Effet sensoriel anodin, allumer/éteindre une petite flamme, nettoyer/salir un objet de 30 cm, saveur/température/couleur ou marque pendant 1 heure. Au plus trois effets non instantanés. Aucun dégât, état, objet de valeur ou avantage automatique. |
| Message / `message` | 120 pieds | 1 round | non | Murmure à une créature précise dans les 36 m ; elle seule entend et peut répondre en chuchotant. Pas de lecture des pensées ni de réponse forcée. Les obstacles épais, le plomb ou un silence magique bloquent le message ; aucun secret inventé. |
| Lumières dansantes / `dancing-lights` | 120 pieds | Up to 1 minute / concentration | non | Jusqu’à quatre lumières faibles, chacune éclairant sur 3 m, pendant 1 minute avec concentration. Elles restent à 6 m les unes des autres ; déplacement ultérieur par action bonus. Aucun dégât ni aveuglement. |

### Sorts de niveau 1

| Sort / ID MCP | Portée | Durée / concentration | Rituel | Effet et limites |
|---|---|---|---|---|
| Projectile magique / `magic-missile` | 120 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Mains brûlantes / `burning-hands` | 15 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Bouclier / `shield` | 0 pieds | 1 round | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Armure du mage / `mage-armor` | 5 pieds | 8 hours | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Charme-personne / `charm-person` | 30 pieds | 1 hour | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Déguisement / `disguise-self` | 0 pieds | 1 hour | non | Change l'apparence du lanceur (visage, vêtements, ±30 cm de taille) pendant 1 h ; purement visuel — le toucher ou une Investigation réussie perce l'illusion. |
| Compréhension des langues / `comprehend-languages` | 0 pieds | 1 hour | oui | Pendant 1 heure, comprend le sens littéral des langues entendues et des textes touchés ; ne parle pas les langues et ne déchiffre ni codes ni glyphes magiques. |
| Détection de la magie / `detect-magic` | 0 pieds | Up to 10 minutes / concentration | oui | Pendant 10 minutes avec concentration, ressent la magie dans les 9 m. Une action permet de voir les auras des créatures/objets visibles et leur école éventuelle. Ne révèle pas les propriétés, les pièges non magiques ou une solution inconnue. Pierre de 30 cm, métal de 2,5 cm, plomb ou bois/terre de 90 cm bloquent. |
| Identification / `identify` | 5 pieds | Instantaneous | oui | Après 1 minute de contact avec un objet, apprend ses propriétés magiques, leur utilisation, l’harmonisation requise, charges et sorts actifs éventuels ; sur une créature touchée, identifie les sorts actifs. Ne révèle pas généralement une malédiction ou un secret historique. Perle de 100 po requise, non consommée. |
| Alarme / `alarm` | 30 pieds | 8 hours | oui | Après 1 minute d’incantation, surveille une porte, fenêtre ou zone de 6 m de côté pendant 8 heures. Choisir les créatures exemptées et une alarme mentale (jusqu’à 1,5 km) ou audible. Ne piège, ne blesse et ne révèle pas automatiquement les intrus ; le déclenchement reste un événement de scène à établir. |
| Serviteur invisible / `unseen-servant` | 60 pieds | 1 hour | oui | Force informe pendant 1 heure : tâches simples et non combattantes, FOR 2, CA 10, 1 PV. Ne peut attaquer ; disparaît à 0 PV ou au-delà de 18 m du lanceur. Commande par action bonus. Toute modification réelle d’inventaire, porte ou objet exige son outil dédié. |
| Disque flottant / `floating-disk` | 30 pieds | 1 hour | oui | Disque horizontal de 90 cm, à 90 cm du sol, porte 250 kg pendant 1 heure et suit le lanceur à 6 m. Ne vole pas au-dessus des fosses de plus de 3 m ; disparaît si séparé de plus de 30 m. Ne transporte pas automatiquement un pion, ne change ni inventaire ni carte. |
| Écriture illusoire / `illusory-script` | 5 pieds | 10 days | oui | Après 1 minute, inscrit sur un support touché un texte lisible par les lecteurs désignés pendant 10 jours ; les autres voient une écriture inconnue ou un autre texte choisi. Vision véritable perce la tromperie. Encre de 10 po consommée ; aucun faux document ne garantit la persuasion. |
| Image silencieuse / `silent-image` | 60 pieds | Up to 10 minutes / concentration | non | Image visuelle dans un cube de 4,5 m, 10 minutes avec concentration. Ni son, ni odeur, ni matière ; interaction physique révèle l’illusion, Investigation contre le DD du lanceur peut la percer. La déplacer exige une action. Ne bloque pas mécaniquement les mouvements ni la visibilité. |

### Sorts de niveau 2

| Sort / ID MCP | Portée | Durée / concentration | Rituel | Effet et limites |
|---|---|---|---|---|
| Bouche magique / `magic-mouth` | 30 pieds | Until dispelled | oui | Après 1 minute, enchante un objet non porté : message de 25 mots au plus durant au plus 10 minutes, déclenché par une circonstance visuelle ou audible à 9 m définie à l’incantation. Choisir usage unique ou répétitif ; dure jusqu’à dissipation. Ne détecte pas les pensées ni les secrets. Poudre de jade de 10 po consommée. |
| Localisation d’objet / `locate-object` | 0 pieds | Up to 10 minutes / concentration | non | Pendant 10 minutes avec concentration, indique la direction d’un objet familier décrit dans les 300 m, ou le plus proche d’un type choisi. Un objet précis doit avoir été vu de près ; le plomb bloque. Ne révèle ni nom du voleur, ni trajet, ni contenu secret ; absence d’objet connu ne permet pas d’en inventer un. |
| Corde enchantée / `rope-trick` | 5 pieds | 1 hour | non | Une corde touchée de 18 m au plus s’élève vers un abri extradimensionnel pour huit créatures Moyennes ou plus petites pendant 1 heure. Entrée par escalade, aucune attaque ni sort à travers l’ouverture ; tout tombe à la fin. Ne déplace pas automatiquement les pions, ne change pas de carte et ne rend pas un repos instantané. |
| Aura magique trompeuse / `arcanists-magic-aura` | 5 pieds | 24 hours | non | Objet non porté ou créature consentante touchée, pendant 24 heures : choisir une aura magique fausse ou masquer le type/alignement aux divinations. Ne change pas la vraie nature, les statistiques ou les immunités. Trente incantations quotidiennes identiques peuvent pérenniser l’aura ; pas de permanence accordée par un seul appel. |
| Invisibilité / `invisibility` | 5 pieds | Up to 1 hour / concentration | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Détection de l’invisibilité / `see-invisibility` | 0 pieds | 1 hour | non | Pendant 1 heure, voit créatures et objets invisibles comme visibles et perçoit le plan Éthéré de façon translucide. Ne traverse ni mur ni porte et ne révèle pas les pensées ou les créatures cachées derrière un obstacle. |
| Flamme éternelle / `continual-flame` | 5 pieds | Until dispelled | non | Flamme sur un objet touché, jusqu’à dissipation : lumière vive sur 6 m puis faible sur 6 m, sans chaleur ni consommation d’oxygène. Peut être cachée, pas étouffée. Ne brûle ni ne blesse et ne devient pas une torche physique dans l’inventaire. Poudre de rubis de 50 po consommée. |
| Préservation des morts / `gentle-repose` | 0 pieds | 10 days | oui | Préserve un cadavre touché de la décomposition et empêche sa transformation en mort-vivant pendant 10 jours ; ne ressuscite pas et ne libère pas une âme. Les deux pièces sur les yeux doivent rester en place. |
| Pas brumeux / `misty-step` | 30 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Fracassement / `shatter` | 60 pieds | Instantaneous | non | Résolution mécanique par le moteur (cible et paramètres explicites). |
| Cécité/Surdité / `blindness-deafness` | 30 pieds | 1 minute | non | Résolution mécanique par le moteur (cible et paramètres explicites). |

Prestidigitation : choisir effectDurationSeconds (0 = instantané, 12 = babiole/image jusqu’au prochain tour, 3600 = effet d’une heure). Au plus trois effets durables ; dismiss_prestidigitation avec l’effet exact dépense une action pour le supprimer.
