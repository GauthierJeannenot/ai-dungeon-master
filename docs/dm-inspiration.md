# Inspiration du MJ — D&D 5e 2014

`grant_inspiration` et `spend_inspiration` résolvent l'inspiration du MJ décrite dans le PHB 2014, chapitre 4 (« Inspiration »), et le DMG 2014, chapitre 8 (« Using Inspiration »). Sources locales : `rules/books/phb-2014.md` et `rules/books/dmg-2014.md`. Ce mécanisme donne l'avantage à un jet d'attaque, de caractéristique ou de sauvegarde. La sauvegarde contre la mort appartient à la dernière catégorie.

L'IA prend les décisions de MJ : elle choisit explicitement un événement et sa raison, puis la catégorie de jet avant que le dé soit lancé. Aucun texte du joueur, repos, déplacement, résultat naturel de 20 ou heuristique du serveur ne déclenche à lui seul de récompense discrétionnaire. Les bénéfices source réellement acquis, tels les rites sacrés du DMG, conservent leur propre procédure datée.

| Outil | Arguments | Résultat |
| --- | --- | --- |
| `grant_inspiration` | `eventId`, `reason` | Accorde une réserve, au maximum une. Un événement déjà traité est rejouable sans nouveau gain. |
| `spend_inspiration` | `spendId`, `rollKind: attack/check/save` | Réserve cette capacité pour le prochain vrai d20 du joueur dans la catégorie choisie. L'outil ne lance aucun dé. |

Exemple : l'IA accorde `grant_inspiration({eventId:"ideal-risque-pont",reason:"Le personnage protège son rival malgré le risque établi."})`, puis choisit `spend_inspiration({spendId:"pont-athletisme",rollKind:"check"})`. Elle appelle ensuite le résolveur de l'action réelle avec ses arguments explicites. La préparation d'inspiration ne remplit jamais une attaque, un test ou une sauvegarde planifiée.

L'état persistant `dmTools.dmInspiration` contient une réserve booléenne, au plus une préparation, et les reçus d'attribution/dépense. Une réserve et une préparation ne peuvent pas coexister : réserver utilise déjà l'unique capacité. Une nouvelle attribution discrétionnaire pendant une préparation est refusée. Un don quotidien de rites déjà acquis est plutôt conservé comme plafonné, sans retirer cette préparation. Une attribution supplémentaire lorsqu'une réserve est détenue est mémorisée comme plafonnée ; rejouer cet événement après dépense ne donne donc pas un nouveau jeton. Un identifiant réutilisé avec une autre raison ou catégorie est refusé. Les historiques sont bornés à 256 reçus chacun et ne sont pas effacés pour permettre une réattribution.

Le premier d20 validé correspondant au joueur et à la catégorie bénéficie de l'avantage et marque le reçu comme consommé. L'avantage ne se cumule pas : une autre source d'avantage conserve deux dés. Avantage et désavantage s'annulent selon la règle habituelle ; la dépense reste effective. Les choix invalides avant le jet, les autres acteurs, les autres catégories, un échec automatique sans dé et `roll_dice` conservent la préparation. L'inspiration ne modifie ni le bonus numérique du jet ni les dégâts.

L'inspiration bardique conserve son dé et ses fenêtres de réaction propres. Le bonus numérique de rôleplay existant conserve également son état distinct. Dès qu'un résultat est tenu en attente d'une réaction, les deux outils d'inspiration du MJ refusent un nouveau choix : aucune modification rétroactive du d20. La reprise réutilise le dé tenu ; elle ne consomme pas à nouveau le reçu. Réserve et préparation survivent à l'hydratation et aux repos. Le repos seul n'accorde aucune Inspiration ; un vrai début de date franchi pendant ce repos peut en revanche traiter un don de rites déjà acquis.

Le périmètre actuel est le personnage joueur d'une fiche SRD 2014. Le transfert à un autre PJ, permis par le PHB mais sans second PJ dans l'architecture actuelle, reste à intégrer si les sessions deviennent multijoueurs. Aucune annulation ou réaffectation de préparation n'est exposée : la catégorie explicitement choisie reste réservée au prochain d20 correspondant. Les règles d'inspiration héroïque 2024, dont la relance, ne sont pas utilisées.

## Contrat des hooks moteur

`dmInspirationReady(entityId, kind)` est une lecture pure pour les métadonnées d'avantage. `rollWithDmInspiration(entityId, kind, modifier, advantage, disadvantage)` remplace l'appel d20 uniquement après les validations de l'action et à l'emplacement du vrai jet. Le helper associe l'avantage, lance le dé puis consomme la préparation. Il ne doit pas entourer une reprise de résultat tenu, un échec automatique, un dé de dégâts ou un jet documentaire.

Les sites concernés sont les tests partagés de caractéristique, attaques d'arme/objet et de sort, sauvegardes partagées et sauvegardes contre la mort. Les jets d'un autre acteur passent leur propre identifiant et n'utilisent jamais la réserve du joueur. Le schéma optionnel permet de charger les anciennes sauvegardes sans fabriquer de réserve.

`tests/dm-inspiration.test.cjs` couvre les plafonds et rejeux, le refus atomique des choix invalides, les dés consommés, l'annulation avantage/désavantage, les catégories et acteurs distincts, les sauvegardes automatiques et contre la mort, l'hydratation et les reprises bardiques, les repos et les invariants du schéma.

Le chemin source des [rites sacrés](sacred-rites.md) réutilise la même acquisition interne de l'unique capacité détenue ou réservée. Ses reçus datés restent dans le projet des rites, sans fabriquer d'octroi manuel et sans saturer les256reçus discrétionnaires. Une fois le bénéfice acquis, un registre manuel rempli ne bloque ni ses frontières quotidiennes ni l'horloge. Aucun don source ne remplace la catégorie déjà préparée, et la fin du bénéfice ne révoque pas le jeton déjà gagné.
