# Corps naturels nÃ©cessaires Ã  la rÃ©colte

Le supplÃ©ment `lib/srd/harvest-creatures.json` conserve quatre fiches des livres fournis, sÃ©parÃ©ment des 31 rÃ©fÃ©rences API dÃ©jÃ  figÃ©es. `lib/srd/monsters.ts` expose les deux catalogues par le mÃªme accÃ¨s ; aucun tÃ©lÃ©chargement ni crÃ©ation de monstre n'a lieu lors d'une lecture.

| Type exact | Passage MM local | Corps | PV / CA | DÃ©placements publiÃ©s |
| --- | --- | --- | --- | --- |
| `carrion_crawler` | 2134â€“2167 | Grande monstruositÃ© | 51 / 13 | marche 30, escalade 30 pieds |
| `purple_worm` | 16274â€“16307 | TrÃ¨s grande monstruositÃ© (Gargantuan) | 247 / 18 | marche 50, fouissement 30 pieds |
| `wyvern` | 19508â€“19539 | Grand dragon | 110 / 13 | marche 20, vol 80 pieds |
| `giant_poisonous_snake` | 21495â€“21517 | BÃªte moyenne | 11 / 14 | marche 30, nage 30 pieds |

Les tailles anglaises du bloc source sont conservÃ©es exactement pour les calculs. Les caractÃ©ristiques, DD, bonus d'attaque, maÃ®trises publiÃ©es, sens et descriptions originales restent disponibles. Aucun des quatre blocs ne reÃ§oit une immunitÃ© au poison ou Ã  l'Ã©tat empoisonnÃ© du seul fait qu'il produit du venin. La lecture d'un profil ne crÃ©e ni poison, ni incapacitÃ©, ni fraÃ®cheur, ni rÃ©serve disponible.

Les vrais corps peuvent Ãªtre crÃ©Ã©s par les outils existants et subir leurs vrais effets/conditions. L'agent choisit explicitement les actions. Une observation de rÃ©colte doit encore Ã©tablir le vrai individu mort/incapable, son accessibilitÃ© et la disponibilitÃ© corporelle ; ces fiches ne fixent pas arbitrairement une dose par corps ou une recharge.

## Actions actuellement fidÃ¨les

La morsure isolÃ©e du charognard utilise son vÃ©ritable +4, sa portÃ©e de cinq pieds et ses 2d4+2 perforants. La morsure et les griffes isolÃ©es de la wyverne utilisent leurs profils distincts publiÃ©s.

Les tentacules du charognard résolvent leurs dégâts de poison au toucher, puis CON 13, empoisonnement/paralysie pendant une minute et sauvegardes de fin de tour explicitement demandées. Sa Multiattack exige la sélection explicite de la séquence complète tentacules/morsure.

L'aiguillon du ver pourpre (CON 19, 12d6), celui de la wyverne (CON 15, 7d6) et la morsure du serpent venimeux géant (CON 11, 3d6) appliquent leur vrai venin, moitié sur réussite. Le jet du venin soumis à sauvegarde reste distinct des dés critiques de l'arme. Antitoxine, protection, défenses typées et immunités d'état restent leurs mécanismes existants. Une immunité à l'état empoisonné ne supprime pas les dégâts de venin.

Les appels ne donnent aucun flacon ni réserve récoltée. Chaque vrai coup conserve un témoin natif, un reçu de livraison et sa continuation de CON/Inspiration dans l'état persistant. Les anciens profils dépourvus d'état SRD et les groupes sont refusés avant dé/action pour ces actions, sans en retirer le venin. Une ancienne attaque tenue sans témoin natif n'est jamais complétée rétroactivement.

La morsure du ver pourpre résout ses vrais dégâts, DEX 19, ingestion, aveuglement/entrave, couverture totale extérieure, acide 6d6 au début du tour du ver, CON 21 en fin du tour qualifiant, rejet de tous les corps et sortie du cadavre pour 20 pieds de mouvement. La relation intérieure sans carte et le transport avec le ver ont été explicitement autorisés par l’utilisateur le 4 novembre 2026 ; toutes les cases de sortie restent choisies par l’agent. Sa Multiattack exige l’ordre complet explicitement sélectionné : un aiguillon ultérieur ne peut pas traverser le propre corps du ver pour toucher une cible désormais avalée, et aucune autre cible n’est inventée. Voir `purple-worm-swallow.md`.

Reste **référencée mais refusée mécaniquement**, avant d20, coût ou déplacement dépendant : la substitution par les griffes dans la Multiattack de la wyverne, conditionnée au vrai vol. Sa séquence ordinaire Bite + Stinger est exécutable dans l’ordre choisi, pour une seule action ; voir `wyvern-multiattack.md`.

Spider Climb et Tunneler restent des capacitÃ©s de rÃ©fÃ©rence lorsque leur procÃ©dure physique complÃ¨te n'est pas reprÃ©sentÃ©e ; leur texte ne donne pas une traversÃ©e de plafond/roche ou un tunnel gratuit. Les vrais modes de dÃ©placement et sens conservent Ã©galement les limites dÃ©jÃ  dÃ©clarÃ©es par leurs moteurs respectifs.
