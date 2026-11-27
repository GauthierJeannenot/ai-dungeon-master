# Multiattaque de la wyverne

Source ciblée : `rules/books/mm-2014.md:19530`, bloc intégral et empreinte déjà conservés dans `lib/srd/harvest-creatures.json`. Le moteur lit cette source existante ; aucun catalogue ni audit global n'est reconstruit.

`resolve_monster_action` et `npc_action` exigent une cible et une séquence complète explicites : `Bite` et `Stinger`, dans l'ordre choisi par l'agent. Les deux attaques coûtent une seule action. Le venin de l'aiguillon reste CON 15, 7d6 de poison, moitié sur réussite ; son jet et une éventuelle Inspiration conservent leurs continuations natives existantes. Toutes les portées et réserves possibles sont vérifiées avant le premier dé.

La source autorise également de remplacer une seule de ces attaques par `Claws` pendant le vol. Cette branche reste refusée avant dés/action avec `WYVERN_FLYING_MULTIATTACK_UNSUPPORTED`. La vitesse de vol publiée ne prouve pas que la wyverne vole actuellement. Le moteur courant ne fournit pas de vol natif non stationnaire ni de portée d'arme en 3D examinée : `navigationActor(..., 'fly')` est borné au vol stationnaire sans marche ; `weatherHeightCombatIssue` refuse une altitude aérienne connue et `physicalHeightCombatIssue` refuse une hauteur physique inconnue ou différente. Aucun témoin fictif ou aplatissement du combat n'est ajouté.

Cette limite a été relevée pendant l'intégration du choix conditionnel de la source, dans `lib/navigation.ts`, `lib/weather-state.ts:143` et `lib/jumping-state.ts:159`. Le prochain lot concret est le vol non stationnaire avec hauteur et portée physiques, avant d'activer le remplacement par les griffes. La morsure et la Multiattack du ver pourpre avec ingestion restent hors périmètre.
