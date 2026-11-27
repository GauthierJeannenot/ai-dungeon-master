# Combat sous l’eau — D&D 2014

Source ciblée : `rules/books/phb-2014.md:6151–6159`, chapitre Underwater Combat. Ce lot ne crée aucun bassin, corps, déplacement, équipement ni pouvoir.

## Procédure et outils

1. `record_movement_medium` consigne l’eau réellement présente : carte/salle/cases, fond, surface, fait physique et provenance. La consigner ne déplace personne.
2. `record_underwater_context` associe un fait réel à un corps/objet précis et à son état d’immersion complète. Une éventuelle `weaponAttack` qualifie séparément l’attaque exacte, sa cible, son arme réellement tenue et son mode. Le contexte respiratoire déjà établi est requis pour un vivant entièrement immergé qui ne possède pas une vraie physiologie permettant de respirer cette eau.
3. Le modèle choisit ensuite l’appel d’attaque, de sort ou d’interaction habituel avec tous ses arguments. Le moteur applique les règles depuis les témoins physiques. Une qualification inconnue n’est refusée que si elle change réellement cette résolution.
4. `inspect_underwater_context` lit les observations actuelles, les arrivées qualifiées et l’éventuel événement de feu déjà dû. Aucun dé, coût, mouvement, souffle ni découverte n’est accordé.

Une observation est une préparation du MJ sans action du joueur, temps ni dé. `forPosition` qualifie seulement une géométrie d’arrivée explicitement observée ; elle ne choisit aucun trajet et ne déplace rien. Une nouvelle nonce ne peut faire émerger ou immerger un corps inchangé dans la même eau. Position, posture, mesures ou eau modifiées invalident les témoins incompatibles. Les observations et reçus sont bornés, conservés et validés à la restauration.

## Règles résolues

- Une attaque d’arme de mêlée effectuée sous l’eau subit le désavantage sans vitesse de nage réelle. Dague, javeline, épée courte, lance et trident gardent leurs exceptions imprimées. Les vitesses natives viennent du catalogue ; l’observation ne crée aucune vitesse magique.
- Une attaque d’arme à distance sous l’eau rate automatiquement au-delà de sa portée normale. Elle ne lance aucun dé d’attaque, bonus ou réaction d’amélioration, mais paie sa vraie action, sa munition ou son lancer physique. Dans la portée normale, arbalètes, filet, javeline, lance, trident et fléchette gardent leurs exceptions imprimées ; les autres ont le désavantage. Les attaques de sort ne deviennent pas des attaques d’arme.
- Un corps ou objet entièrement immergé a résistance au feu. Le paquet applique une seule résistance, y compris s’il possède déjà cette résistance ou la résistance de pétrification. Les autres types et les immunités gardent leurs règles. Un simple marqueur d’eau ou une nage de surface n’accorde pas une immersion complète.
- Un jet tenu conserve le contexte d’origine, ses dés et son arme exacte pendant les réactions et la persistance. Aucune nouvelle observation ne remplace le contexte d’un jet déjà lancé.

Les liaisons des armes de créature sont explicites vers les noms d’actions publiés déjà présents au catalogue ; aucun nom narratif ou message du joueur n’est analysé pour sélectionner une exception.

## Feu déjà dû au début d’un tour

Le feu grégeois conserve son vrai contact et son événement `${combatGeneration}:${turnCounter}:${entityId}`. Si le contexte physique de son paquet est décisif mais inconnu, aucun dé ni dégât n’est consommé. Avant l’ouverture d’un prochain tour, le préflight refuse le passage tant que son contexte manque. Un tour déjà ouvert peut aussi conserver son événement dû, qui bloque les nouvelles actions, mouvements, tours et sauts de temps.

Après qualification physique explicite, le modèle appelle `resolve_start_turn_fire({entityId,eventId})` pour ce seul événement déjà dû. Le moteur ne relance ni initiative ni tour, n’avance pas l’horloge et ne paie aucune action supplémentaire. Un reçu persistant rend les reprises idempotentes. Ce n’est pas une attaque ou un tour fabriqué côté serveur ; le serveur transmet l’appel structuré choisi par le modèle. Le feu n’est pas automatiquement éteint par une observation d’eau.

## Limites et conventions

La ligne de cases et la qualification physique explicite sont des conventions de géométrie du moteur, pas une formule balistique officielle. Les mesures manquantes d’anatomie restent inconnues. Le lot ne fournit ni déplacement 3D sous l’eau, ni transport de passager, ni source magique de vitesse de nage, ni respiration aquatique, ni lavage automatique de poison. Les procédures existantes de déplacement, respiration, eau et effets conservent leurs propres prérequis. L’état technique intégral reste la frontière de transport existante ; une préparation confidentielle n’est pas une connaissance automatiquement acquise du joueur.

Les validations ciblées et intégrées sont consignées dans `docs/suivi-integration-mcp.md` ; une validation privée ne publie pas à elle seule le moteur partagé.
