# Météo : perception, visibilité et flammes physiques

Le moteur applique les faits de météo explicitement établis par le MJ. La source de ce lot est `rules/books/dmg-2014.md:4302–4312` (Strong Wind et Heavy Precipitation). Le vent fort gêne l'ouïe et éteint les flammes ouvertes ; les fortes pluies et chutes de neige obscurcissent légèrement la zone et gênent la vue. La forte pluie gêne aussi l'ouïe et éteint les flammes ouvertes. Une tempête de sable doit être établie explicitement. Le brouillard physique est distinct de la connaissance de la carte et des effets magiques non pris en charge.

## Choix du sens

Les véritables tests de Perception peuvent préciser `perceptionSense: sight | hearing | other`. Ce choix est obligatoire avant tout dé lorsque la météo établie peut modifier un sens. Un intitulé narratif n'est jamais interprété pour choisir ce sens. Les anciens appels restent compatibles hors météo pertinente ; `sightBased` contradictoire avec le sens choisi est refusé. Les procédures réellement visuelles, telles que la recherche d'une porte cachée ou `resolve_visual_perception`, transmettent elles-mêmes leur sens explicite.

Le désavantage météorologique se combine avec les autres causes dans la règle ordinaire d'avantage/désavantage, sans cumul supplémentaire. La Perception passive applique une seule correction de cinq points, ou l'annulation ordinaire par un avantage. Un sens inutilisable entraîne un échec automatique, même contre DD 0, sans d20 ni consommation d'Inspiration. La surdité empêche une recherche fondée sur l'ouïe (PHB, Deafened). Les sens natifs réellement documentés, notamment la vision aveugle, restent applicables.

Le sens accompagne les tests de groupe, les aides et les continuations suspendues. Une aide pour écouter n'aide pas un autre test sensoriel. La reprise conserve les dés déjà lancés et le sens d'origine, y compris après persistance SQL. Un résultat automatique ne peut devenir un succès par une reprise générique.

## Visibilité et présentation

Le brouillard physique dense bloque la vue ordinaire et la vision véritable, sans transformer son volume en mur physique. La portée physique, les collisions et la connaissance `fogOfWar` restent distinctes. La vue réelle est utilisée par les procédures qui l'exigent. Le brouillard léger et les précipitations fortes donnent une obscuration légère.

La présentation normale de la carte masque les positions fraîches des PNJ et monstres que le brouillard physique dense empêche effectivement le joueur de percevoir. Les pions redeviennent visibles quand le même sens permet de les voir ; les salles visitées et souvenirs cartographiques ne sont pas réécrits. Ce filtre respecte les sens natifs de l'observateur. Il ne constitue pas une frontière de confidentialité contre l'inspection technique : le transport actuel transmet encore l'état complet, comme décrit dans `door-discovery.md`.

## Flammes et combustible

L'extinction concerne une véritable source physique allumée et exposée : tenue, au sol, ou effectivement déplacée. Une torche et une chandelle sont ouvertes ; une lanterne fermée documentée est protégée. Une lampe simple dont la protection est inconnue exige un fait MJ par instance, via `set_light_weather_protection`, avant une exposition ambiguë. L'outil exige un objet réel et un fait déjà enregistré ; il ne crée ni lampe, ni protection. Un objet emballé ou éteint ne bloque pas une transition météorologique.

Le combustible est arrêté à l'instant réel d'extinction. Une ancienne torche allumée représentée par son effet historique est convertie avec sa durée restante, jamais avec une nouvelle heure gratuite. Les sources magiques ne sont pas dissipées. Les mutations sensibles disposent d'un précontrôle avant leurs coûts ou dés ; la décision est appliquée au véritable mouvement ou changement d'inventaire.

Le raccord des lancers expose `captureWeatherThrownFlame` avant le dé et `commitWeatherThrownFlame` après le transfert réel. Le plan conserve le trajet choisi, les contextes météorologiques traversés et l'identité de la source. Son reçu utilise l'identifiant autoritaire de l'attaque. Une reprise ne relit pas une météo ultérieure et n'éteint pas une nouvelle flamme rallumée au même instant. Aucune trajectoire ni attaque n'est choisie par ce helper.

Ce lot ne généralise pas les incendies narratifs ni les dégâts de feu. Les effets thermiques, le vol et les échéances d'exposition sont traités par les procédures météo séparées.
