# Récolter un poison réel — D&D 2014

Source consultée : `rules/books/dmg-2014.md:8626–8633`, **Crafting and Harvesting Poison**. Une véritable créature venimeuse morte ou neutralisée peut fournir une dose après **1d6 minutes**, puis **Intelligence (Nature) DD20**. La maîtrise du matériel d’empoisonneur peut remplacer l’absence de maîtrise de Nature. Réussite : une dose ; échec : aucune ; échec de cinq points ou davantage : exposition au véritable poison de la créature.

Le moteur ne déduit ni victime, ni récipient, ni dose, ni quantité extractible depuis le texte du joueur. L’IA choisit explicitement les outils et leurs arguments ; le moteur valide la réalité mécanique. Aucun appel n’est fabriqué pour finir le travail, lancer le jet, choisir une réaction ou ramasser la dose.

## Procédure livrée

1. `observe_poison_harvest_source` constate une **réserve finie réellement accessible**, sur un individu présent, mort ou réellement incapable, avec observation physique actuelle. Les seuls profils raccordés sont `carrion_crawler`, `purple_worm`, `giant_poisonous_snake`, `wyvern`, associés à leurs quatre poisons DMG exacts. Un groupe, une archive, un autre profil ou une matière organique transformée par pétrification ne fournit pas un faux corps récoltable.
2. `begin_poison_harvest` réserve l’observation et une **vraie fiole vide possédée**, choisit l’identité neuve de la future dose et sa cellule de dépôt explicite et accessible, puis conserve **le premier 1d6**. Ni temps, ni travail, ni dose ne sont accordés au début. Un nouvel identifiant ne remplace pas ce dé.
3. `work_poison_harvest` avance uniquement l’intervalle de travail réellement confirmé, après précontrôles de capacité, mains, corps, fiole, événements et horloge. Les segments de repos sont enregistrés avec leur classification explicite. Le temps d’attente ne vaut pas travail. Une véritable fin d’incapacité, récupération ou échéance d’affliction du corps impose d’arrêter avant cette transition ; aucune incapacité future n’est inventée.
4. `resolve_poison_harvest` lance Nature DD20 lorsque travail **et** temps réel sont dus. La fiche détermine maîtrise et expertise. Le kit facultativement choisi doit réellement être possédé et maîtrisé ; il ne s’ajoute pas à Nature. Sans l’une de ces maîtrises, le test reste possible sans ce bonus, avec les règles générales déjà présentes.
5. Le véritable contrôle de Nature, son éventuelle Inspiration, puis l’éventuel véritable CON du poison peuvent être suspendus et repris. La garde de réaction vérifie le contexte avant tout dé facultatif. La résolution de l’exposition déjà engagée conserve son résultat même si le personnage perd sa capacité ou meurt ; elle ne relance ni Nature ni CON.

`inspect_poison_harvest` lit uniquement réserves, durées, travail et états réels. L’inspection n’accorde pas d’initiative, d’action, de temps ou de dose.

## Fiole, dose et provenance

Le template PHB `vial` représente une fiole vide réellement préparée ou acquise ; son entrée de catalogue ne la donne pas. La table ne publie pas sa masse : le moteur ne lui attribue aucun poids par défaut.

Une réussite retire l’instance vide et dépose **le même récipient physique rempli**, avec une identité nouvelle de dose canonique (`poison_<templateId>`), quantité1. L’instance originale complète de la fiole et son identifiant physique restent dans la provenance de l’essai. L’ancienne mesure de la fiole vide ne devient pas celle de la dose remplie. Le récipient n’est pas dupliqué, la dose n’est pas placée gratuitement dans l’inventaire et sa masse ne vaut pas zéro. Le ramassage explicite reste soumis au portage et aux éventuelles mesures réelles nécessaires.

Un échec laisse le récipient existant ; les véritables conséquences de l’exposition peuvent naturellement le faire tomber si son porteur devient inconscient. L’exposition utilise la source naturelle du noyau poisons : aucun coup, jet d’attaque, dégât perforant de morsure/dard, enduit ou dose consommée n’est fabriqué. Exemple : l’échec sur le vrai serpent expose au CON11 et aux3d6 poison, avec demi-dégâts en cas de réussite du CON, sans ajouter sa morsure.

## Arbitrages annoncés et limites

Le DMG ne fixe pas le nombre de doses restantes d’un corps, un taux de renouvellement, la conservation d’un cadavre, la capacité d’un récipient ou une règle universelle de nouvelle tentative. **La réserve finie, l’accessibilité organique et l’adéquation de la fiole sont des faits physiques explicitement adjudiqués par le MJ**, pas une règle publiée « une dose par corps ».

Le moteur conserve une borne maximale décroissante : chaque réussite la réduit d’une dose. Après échec, la disponibilité devient inconnue jusqu’à une véritable nouvelle observation, liée au dernier essai et à un nouveau fait. Elle ne peut jamais augmenter par nouveau nonce, changement de texte ou temps écoulé. Une quantité inconnue refuse précisément la nouvelle extraction ; aucune réserve infinie ou destruction totale après échec n’est inventée. Une nouvelle production biologique, une régénération de venin ou de nouvelles matières après épuisement restent non représentées.

Cette première procédure couvre le personnage joueur **hors combat**, avec une fiole vide réelle et un dépôt au niveau réellement accessible. La collecte pendant l’initiative, les autres contenants, la récolte par un autre acteur, un travail sur un corps déplacé/transformé entre ses observations ou une anatomie verticale inaccessible ne sont pas silencieusement complétés. Les durées et le travail déjà enregistrés restent conservés ; aucun nouveau jet de durée ne contourne un essai non résolu.

La validation de chargement vérifie durées, reçus, segments, travail, réserve, origine du résultat et contexte des jets tenus. Les tests publics couvrent les quatre vrais profils, un vrai cadavre issu du moteur de dégâts, réussite/échecs, CON avec dégâts complets/demi-dégâts, mains/kit, anti-renouvellement, horloges, SQL et reprises d’Inspiration ; un parcours complet utilise le véritable serveur stdio.
