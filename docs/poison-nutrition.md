# Doses ingérées et quantités réellement suivies

Source : DMG 2014 fourni, Poisons/Ingested, lignes 8451–8470. La dose entière doit être avalée pour produire son effet. Le texte laisse au MJ les effets d'une dose partielle ; ce moteur n'en invente ni la puissance, ni un prorata de dégâts.

`prepare_player_poison` peut désormais associer une vraie dose possédée à une ration, une nourriture réellement collectée ou une quantité d'eau présente dans un vrai récipient. L'action complète/six secondes et les mains de préparation sont conservées. Aucun aliment, liquide, volume ou récipient n'est créé. Une outre vide n'est pas un volume empoisonnable.

`inspect_poison_nutrition` lit les identités des doses, ressources et arbitrages. `adjudicate_poison_portion` enregistre une décision physique du MJ avant un appel exact de consommation/transvasement : la dose **entière** se trouve dans la portion sélectionnée, ou elle reste dans le reliquat réel. Cet enregistrement exige un fait de scène, la quantité actuelle et l'identifiant de l'opération future. Il ne découpe aucun aliment, ne verse rien et ne consomme aucune action à la place du véritable geste.

Les unités de cet arbitrage sont les demi-livres de nourriture et les quarts de pinte d'eau. `consume_provisions` conserve ses unités existantes : demi-livres pour les aliments, pintes pour l'eau. Aucun choix n'est inféré du récit.

## Consommation et transfert

- Consommer tout le support encore contaminé transmet la dose entière et ses vrais DD/effets. Une consommation partielle exige un arbitrage explicite. Si la dose entière reste dans le reliquat, seule la nourriture/eau choisie est débitée ; aucun jet de poison n'est fait.
- La nourriture/eau et l'apport nutritionnel sont débités une fois dans la véritable consommation, avant la CON. Une CON tenue conserve cette ingestion, ses dés et son reçu après SQL/hydratation. La reprise ne crée ni repas, ni dose, ni second apport. Midnight Tears exige le véritable prochain minuit avant tout débit et conserve son effet retardé.
- Un transfert complet transporte la même dose vers le vrai récipient choisi. Un transfert partiel exige la disposition explicite de la dose entière. Les récipients et quantités d'eau restent ceux du moteur d'eau, avec leurs vrais coûts, mains et durée. L'ancien support ne conserve pas une deuxième application.
- Ajouter de l'eau réellement acquise/remplie à un récipient contaminé augmente son vrai volume et conserve une dose entière. Cela ne neutralise, ne lave et ne réduit pas arbitrairement la puissance. Le remplissage d'une source finie et la collecte d'eau de forage gardent leurs vrais débits/provenances.
- Un arbitrage devient inutilisable lorsque sa quantité, ses acteurs physiques ou l'opération exacte changent. Le même appel terminé rejoue son reçu ; un nouvel identifiant ne réutilise pas une ancienne décision.

Les opérations suivent les restrictions existantes : `consume_provisions` reste une consommation explicite du joueur capable hors combat, sans geste de nourrir de force ni durée universelle inventée. Les outils d'eau paient leurs manipulations réellement choisies. Aucune suspension nutritionnelle supplémentaire des morts n'est ajoutée.

## Limites explicites

Une dose réellement répartie entre plusieurs portions, une puissance fractionnée ou un mélange de deux doses actives nécessite une procédure distincte ; ces cas sont refusés avant les débits et les dés. L'arbitrage de dose entière ne peut pas affirmer qu'une fraction de dose homogène est une dose complète.

La contamination de l'ensemble d'un point d'eau situé, fini ou permanent, n'est pas déduite d'une fiole. Sa concentration/répartition demanderait une procédure de source physique distincte. Une déclaration de registre ne supprime pas une application déjà présente. L'eau réellement empoisonnée n'est pas silencieusement jetée ou purifiée en servant à laver une autre surface.

Deux surfaces distinctes intérieur/extérieur d'un même récipient ne partagent pas gratuitement deux applications sous une seule identité de surface. Le transfert qui écraserait une application de contact déjà présente est refusé. Les ressources actuellement possédées ou déposées conservent leur suivi ; le transfert d'une ressource contaminée vers un stock de marchand non représenté par ce suivi reste à raccorder.
