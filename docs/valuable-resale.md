# Gemmes, joaillerie et objets d'art — pleine valeur réelle

Source locale : **PHB 2014, Selling Treasure, `rules/books/phb-2014.md:3913`**. Gemmes, joaillerie et objets d'art conservent leur pleine valeur sur le marché ; ils peuvent être échangés contre des pièces ou employés comme moyens d'échange. Le même passage laisse au MJ la recherche éventuelle d'un acheteur dans une grande communauté pour les trésors particulièrement précieux. La condition générale d'un acheteur réellement intéressé reste celle de la ligne `3907`.

Cette tranche réalise seulement la **vente contre de vraies pièces disponibles** de valeurs physiques déjà possédées et inscrites dans le registre source. Le troc et les autres moyens d'échange ne sont pas ajoutés implicitement. Elle réutilise le transfert et les limites financières de [la revente ordinaire](merchant-resale.md).

## Qualification explicite d'un bien existant

`create_valuable_resale_offer` demande les identifiants exacts, le `registeredKind` déjà conservé (`gem` ou `art`), la confirmation actuelle de leur identité et vraie valeur inscrites, leur état matériel inchangé et les faits physiques de qualification et d'acceptation auprès du véritable acheteur. Le montant explicitement choisi doit être la somme **entière** des `valueGp × 100` déjà établis. Il ne devient pas le demi-prix des armes ou armures.

Le moteur exige :

- La même instance dans l'inventaire, `equipmentId: valuable`, quantité individuelle réelle et projection physique cohérente avec son registre.
- Son `dmTools.valuables[id]` préexistant et le même repaire original dans `dmTools.hoards`, réellement collecté et contenant cet identifiant.
- La catégorie et valeur structurées antérieures, ainsi que la table d'identité DMG exacte, son empreinte et ses références. La table concernée est relue depuis ces métadonnées ; aucun nouveau dé de trésor ou d'estimation n'est lancé.
- L'identité source inchangée et l'accord réel de l'acheteur. Une simple proposition de prix, un identifiant copié ou un objet narratif nommé « diamant » n'établit aucune valeur, pureté ou propriété de composante.

La joaillerie est prise en charge **lorsqu'elle est déjà inscrite comme objet d'art source**. Exemple effectivement testé : la bague « Gold ring set with bloodstones » du tableau DMG `250 gp Art Objects`, `rules/books/dmg-2014.md:5659` et suivantes. Sa règle découle du `kind: art` et de sa provenance retenus ; son nom n'est pas analysé pour choisir une catégorie. Les bijoux arbitraires sans ce registre ne sont pas qualifiés par leur texte.

La préparation ne crée ni valeur, gemme, achat, monnaie, pureté, masse, propriété magique, connaissance de composante ou jet d'estimation. Elle ne transfère pas le bien et ne consomme pas l'action majeure du personnage.

## Le même transfert et les mêmes fonds réels

`sell_to_merchant` termine ensuite cette offre, explicitement marquée `registered_valuable_full`. Il conserve les règles existantes de marchand présent, visible, capable et à portée, mains, faits inchangés, temps réel choisi, échéances, états associés et charge future avec la masse des pièces reçues. **Six secondes dans les fixtures sont un arbitrage explicite, pas une durée RAW obligatoire** ; l'argument `workSeconds` reste choisi et justifié.

Le marchand verse seulement les dénominations qu'il a réellement reçues d'achats antérieurs du joueur, moins ses versements de revente déjà effectués. Les ventes ordinaires à moitié prix et celles de valeurs à plein prix dépensent la **même réserve finie**. Aucun fonds initial/extérieur, change automatique, crédit ou prix accepté ne fabrique les pièces manquantes.

La même instance quitte l'inventaire et rejoint la garde persistée du même marchand. Son véritable enregistrement de valeur, repaire collecté, identité source, acceptation et mesure physique restent conservés, y compris après SQL et répétition exacte de l'événement. Le chargement refuse un changement de valeur, d'empreinte, d'origine ou de procédure de prix. `inspect_valuables` ne présente ensuite plus cet objet comme possédé par le personnage ; une nouvelle collecte du même repaire ne le redonne pas.

## État associé et limites

Seule la **provenance historique exacte `valuables`/`hoards`**, vérifiée et conservée, est exemptée du refus d'association utilisé pour la revente ordinaire. Les autres suivis restent soumis à leurs propres gardes : un vrai enduit de poison sur une gemme, une réservation ou un autre état physique non transférable est refusé avant coût et demeure intact. Le registre de valeur et les mesures ne sont jamais purgés pour permettre une vente.

Le tableau de valeur ne publie aucune masse universelle : une masse inconnue ne devient pas zéro, le prix et la pureté ne servent pas à la calculer. Une mesure réellement déclarée reste attachée au même exemplaire après transfert. Le portage futur évalue les véritables pièces et les objets restant réellement possédés.

Restent hors périmètre : qualification ou estimation de bijoux/gemmes sans registre source, matière ou état matériel modifiés nécessitant une nouvelle vraie évaluation, troc, monnaie de substitution, pureté ou propriétés de composante, marchands/inventaires externes, fonds marchands initiaux, transport d'états associés non transférables et rachat au joueur depuis cette nouvelle garde. Aucune disponibilité générale du marché ou acceptation d'un acheteur n'est promise par la règle de pleine valeur.

Les parcours ciblés utilisent de vraies créations/collectes de repaires, de vrais achats finançant le marchand, des ventes en stdio et API/SQL, et un dé sentinelle conservé. La bague source, deux gemmes distinctes, les propriétés falsifiées, les refus et la cohabitation des deux procédures de prix sont vérifiés sans appel LLM payant.
