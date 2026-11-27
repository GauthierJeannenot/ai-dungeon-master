# Portées des armes à distance — tranche W6

**Complément W10 en validation** : les armes enregistrées à munitions exigent
désormais une pile réellement possédée, quantité connue et `ammunitionItemId`
explicite. Les arbalètes légère (80/320 pieds) et de poing (30/120 pieds) sont
ajoutées avec Loading : un tir par véritable action ou réaction. La prise
effective et versatile sont raccordées. Aucun stock n'est accordé aux anciens
objets ; la récupération monopièce est maintenant raccordée : vraie minute,
moitié du total expensé pendant la bataille, reçu unique et composition mixte
explicitement arbitrée par le MJ. La recherche multi-pièces reste distincte. Les
paragraphes ci-dessous décrivent la portée de la livraison historique W6.

Cette tranche de PHB-WEAPONS utilise les armes déjà enregistrées. Les sources ciblées sont `rules/books/phb-2014.md` : table des armes autour des lignes 4028–4042, propriétés Range et Thrown autour de 4090–4096, et combat à distance aux lignes 5911–5925. Aucun nouvel audit ou ajout de catalogue n'est effectué.

| Usage choisi explicitement | Portée normale | Portée longue |
|---|---:|---:|
| Arc court (`shortbow`) | 80 pieds / 16 cases | 320 pieds / 64 cases |
| Dague lancée (`dagger`, `attackMode: "thrown"`) | 20 pieds / 4 cases | 60 pieds / 12 cases |
| Hache de main lancée (`handaxe`, `attackMode: "thrown"`) | 20 pieds / 4 cases | 60 pieds / 12 cases |

Le registre immuable conserve ces deux bornes. L'attaque au-delà de la portée normale a un désavantage ; au-delà de la portée longue elle est refusée avant tout dé, coût, dégât ou dépôt de l'arme physique. Une arme de mêlée reste à une case sans choix explicite de lancer. Les portées ne sont jamais déduites du message du joueur. Les profils de monstres conservent leurs propres portées sourcées ; aucun profil supplémentaire n'est fabriqué.

Une attaque à distance subit aussi le désavantage lorsqu'un véritable hostile est à une case du tireur, peut le voir et n'est pas incapable d'agir. Il peut s'agir d'un autre acteur que la cible. La faction existante, les conditions réelles, les murs, la couverture directionnelle et les sens du voisin sont utilisés. Un allié, un voisin aveuglé qui ne voit pas le tireur ou un acteur incapacitated/paralyzed/petrified/stunned/unconscious ne provoque pas ce malus. Les autres causes d'avantage et désavantage continuent de s'annuler selon la procédure de d20 existante, sans addition de désavantages.

`resolve_player_attack`, `resolve_player_multiattack`, `resolve_two_weapon_attack` et les attaques traitées par `heroAttack` lisent ces règles. La procédure historique `resolve_attack` reçoit les portées de l'arc court et le même contrôle de proximité ; elle refuse les substitutions de portée d'une arme enregistrée. Le lancer explicite reste réservé au profil SRD qui représente la véritable arme tenue. `interact_object` accepte toujours seulement les armes de mêlée : le tir contre un objet n'est pas ajouté dans cette tranche.

Les résultats d'une attaque à distance exposent `rangedContext` : `normalRangeCells`, `longRangeCells`, `distanceCells`, `rangeBand`, `longRangeDisadvantage`, `proximityDisadvantage` et `nearbyHostileIds`. Ce relevé accompagne le jet tenu et sa continuation après hydratation ; une réaction ne relance pas le d20 ni ne remplace les choix de l'attaque. Il permet au modèle de raconter les motifs effectivement résolus.

Les munitions, loading, heavy/reach/versatile/special, armes supplémentaires, attaques de sort à distance et changement de la représentation des mains restent des lots distincts. Cette tranche ne prétend pas les implémenter. Aucun nouvel état persistant, outil MCP ni paramètre interprétant le texte du joueur n'est ajouté.

Fichiers : `lib/srd/weapons.ts`, `mcp-server/equipment.ts`, `mcp-server/ranged-weapon-rules.ts`, `mcp-server/hero-combat.ts` et `mcp-server/tools/combat-tools.ts`. Les tests dédiés `tests/ranged-weapons.test.cjs` passent par les callbacks MCP réellement enregistrés sur une carte de test explicite et par un vrai processus MCP stdio. Ils couvrent les bornes, les refus sans mutation/dé, le lancer explicite, la proximité selon perception et incapacités, l'annulation avec avantage, le jet tenu/restauré et la prévalidation de la séquence entière. La validation après compilation se déroule exclusivement dans une copie privée basée sur W6 ; les résultats chiffrés sont reportés au coordinateur et au registre canonique.

Validation privée ciblée : les 21 tests dédiés et les 27 tests existants de pouvoirs de monstres passent après la compilation finale ; le typecheck moteur + Next passe. Un passage de 119 régressions classes/attaques/couverture/deux armes/KO passe également, avant le dernier raccord limité au préflight de l'Attaque supplémentaire historique ; ce raccord est couvert dans le test dédié final. Les empreintes et journaux se trouvent dans `output/mcp-wave6-weapons-current-20261101`. La validation intégrée de toute W6 reste centralisée par le coordinateur.
