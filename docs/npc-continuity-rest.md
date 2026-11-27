# Continuité des PNJ et repos réellement observés

Cette tranche conserve un vrai PNJ et sa maladie lors d'une séparation explicite, et représente un long repos PNJ prospectif sur la carte active. Elle ne crée aucun compagnon, PNJ, comportement autonome ou repos passé.

Sources : DMG 2014, `rules/books/dmg-2014.md:3538–3542` (NPC Party Members) et `8418–8428` (Cackle Fever). Le long repos reprend la fondation PHB 2014 déjà utilisée, `rules/books/phb-2014.md:5501–5509` : huit heures, dont six de sommeil, au plus deux d'activité légère, un PV au début et un bénéfice par vingt-quatre heures. Ces passages ne définissent pas une simulation automatique des PNJ hors carte.

## Séparation et retour

`declare_npc_separation` exige un vrai individu adjacent et visible, une décision locale durable et l'identifiant exact d'une transition existante. La préparation ne déplace personne. Le vrai `travel_to_map` conserve le corps sur sa carte, son infection, son dé initial et l'échéance initiale d'incubation. Un marqueur réciproque sur le PNJ protège ce suivi si le nouveau registre disparaît lors d'un import.

La décision utilisateur choisit la séparation déclarée : aucune activité, rencontre, source de stress, guérison ou période de repos n'est supposée pendant l'absence. L'incubation n'est pas suspendue ni décalée. Les échéances d'un PNJ réellement séparé ne bloquent plus les actions du personnage sur une autre carte. Au vrai retour, une incubation échue exige `resolve_cackle_fever_onset` avant toute nouvelle action ou avance de temps : le symptôme conserve son échéance d'origine et s'applique au corps réel à l'instant du retour. Aucun jet de maladie n'est relancé et aucun repos rétrospectif n'est accordé.

Les compagnons des transitions autorées gardent leur fonctionnement actuel. Aucun compagnon libre ni case d'arrivée PNJ choisie implicitement n'est ajouté. Une crise de rire en cours et un repos PNJ encore observé doivent être terminés ou abandonnés avant la perte d'observation. Les autres états physiques non représentés gardent leurs refus existants.

## Long repos sur la carte active

`begin_npc_rest` lie le vrai PNJ à un accord local durable, sans avancer le temps. `advance_npc_rest` exécute une durée explicite de sommeil naturel ou d'activité légère, avec précontrôle des échéances. Le sommeil utilise sa vraie source d'inconscience : il peut faire lâcher les objets tenus et terminer la concentration ; le réveil ne relève ni ne rééquipe le corps. Chaque intervalle de sommeil et son registre de repos possèdent un lien réciproque.

`finish_npc_rest` exige les vraies durées et la fenêtre de vingt-quatre heures. Il restaure les PV permis et conserve son reçu unique. Si le PNJ est infecté, un événement DMG 8428 est retenu ; le MJ choisit séparément `resolve_cackle_fever_event` avec `attemptSave:true` ou `false`. Un succès réduit le DD par le vrai d6, trois échecs cumulés gardent la vraie folie officielle, un refus du jet ne consomme aucun dé. Les rejeux et SQL conservent les résultats.

Les bénéfices du personnage, dés de vie PNJ, emplacements de sorts et ressources de classe PNJ ne sont pas créés. La récupération nutritionnelle d'épuisement reste non représentée pour les PNJ ; le niveau protégé par la fièvre reste en place tant que sa vraie maladie persiste. Une autre affliction active ou une fatigue de poursuite exige sa propre procédure et refuse avant temps : ce lot ne remplace pas le privé historique de repos court de poursuite.

Cette première représentation exige le même PNJ réel et le même observateur adjacent. Une activité extérieure, une blessure, une incapacité, un changement de corps ou une observation perdue invalide la période : `abandon_npc_rest` conserve le vrai temps et les intervalles sans bénéfice. Une nouvelle période commence au présent. Aucune lacune n'est convertie en sommeil ; l’apparition explicite des symptômes conserve uniquement un checkpoint parfaitement frais avant cet événement zéro-temps, avec observation réciproque liée à son vrai reçu d’épuisement. Aucune autre blessure, lacune, activité ou modification n’est ainsi requalifiée, et aucun intervalle supplémentaire n’est crédité. Les limites de 128 périodes et 512 intervalles sont techniques, pas des règles imprimées.

`inspect_npc_rest` est documentaire et ne fait progresser aucune horloge. La route transmet uniquement les commandes structurées choisies par le modèle ; elle ne fabrique aucun appel pour déplacer, faire dormir ou soigner un PNJ.
