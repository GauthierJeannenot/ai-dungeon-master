# Pénalités d’armure — PHB 2014

Le port d’une armure ou d’un bouclier non maîtrisé est autorisé. L’objet
continue de protéger selon sa CA normale, mais impose le désavantage aux tests
de caractéristique, jets de sauvegarde et attaques utilisant la Force ou la
Dextérité, et interdit d’incanter des sorts. Plusieurs objets non maîtrisés
n’ajoutent pas plusieurs désavantages. L’avantage annule normalement le
désavantage. Les jets de Constitution, les caractéristiques mentales et les
sauvegardes contre la mort ne reçoivent pas ce désavantage d’armure.

La cotte de mailles exige Force 13 ; les attelles et le harnois exigent Force
15 pour éviter une réduction de vitesse de 10 pieds. La broigne n’impose
aucun seuil de Force. Cette réduction est indépendante de la maîtrise : un
guerrier peut être ralenti par une armure qu’il maîtrise. La vitesse de base
persistée reste intacte ; la vitesse effective est calculée avant les
multiplicateurs d’épuisement et de Foncer.

## Sources et périmètre

- [PHB 2014, chapitre 5, Armor and Shields](../rules/books/phb-2014.md) :
  table des armures et paragraphes Armor Proficiency, Heavy Armor, Stealth,
  Shields (lignes 3917–3956 dans le document importé).
- Même livre, tableau des classes, chapitre 3 (lignes 851–865) : guerrier,
  barde, clerc, magicien.
- [SRD 5.1 2014, Life Domain, Bonus Proficiency](../rules/supplements/srd-5.1-2014.md) :
  maîtrise des armures lourdes du domaine de la Vie.

Le calcul utilise les profils réellement enregistrés : guerrier (toutes
armures et boucliers), barde (armures légères), magicien (aucune), clerc
(armures légères/intermédiaires et boucliers, plus lourdes avec `subclassId=life`).
L’absence historique de `characterId` conserve le contrat du guerrier legacy.
Les libellés libres de classe, de nom ou de description ne donnent aucune
maîtrise. Les profils de départ sont inchangés.

Les objets portés sont ceux des emplacements d’armure et de bouclier du
`dmTools.loadout` explicite. Un objet de rechange rangé dans l’inventaire
n’impose aucune pénalité. Sans loadout, la même inférence historique que
`equipment.currentLoadout()` s’applique ; elle ne crée aucun nouvel état.
`equipmentId` permet de reconnaître plusieurs exemplaires physiques d’une
même armure. Retirer l’armure supprime immédiatement les pénalités dérivées.

La propriété de discrétion de certaines armures reste indépendante de leur
maîtrise et conserve son traitement existant. Les monstres n’ont pas de
loadout d’armure structuré ; leurs maîtrises ne sont pas inventées. L’exception
de vitesse des nains ne peut pas être déduite des profils actuels : il n’existe
pas de trait racial structuré dans leur état. Un futur profil qui la possède
doit l’exposer explicitement avant son automatisation.

## Raccords moteur

`lib/armor-penalties.ts` est un module pur, partagé, sans mutation :

- `armorPenalties(state)` inspecte les objets portés, les maîtrises, le blocage
  d’incantation et le malus de vitesse.
- `armorRollDisadvantage(state, entityId, ability)` reçoit la caractéristique
  effectivement choisie pour le jet, y compris la Dextérité d’initiative.
  Une caractéristique absente ne devient jamais arbitrairement Force.
- `armorSpellcastingBlocked(state, entityId)` sert au contrôle avant toute
  dépense de sort : emplacement, action, réaction, charge, composante ou
  parchemin. Une simple activation magique qui n’incante aucun sort n’est
  pas bloquée par cette règle.
- `armorAdjustedSpeed(state, entityId, speed)` applique la réduction une fois
  à la vitesse avant les multiplicateurs, avec un minimum de zéro.

`equip_item` conserve les contrôles de propriété, d’emplacement, de mains et
de temps d’enfilage/retrait ; les refus `ARMOR_PROFICIENCY_UNSUPPORTED` et
`ARMOR_SPEED_PENALTY_UNSUPPORTED` ont été supprimés.

Les tests de `tests/armor-penalties.test.cjs` couvrent les dérivations pures et
des appels MCP réels : équipement accepté, CA conservée, jets physiques,
absence de malus mental/Constitution, annulation par l’avantage, blocage de
sort transactionnel, bouclier, Force insuffisante, hydratation et retrait.
Ils ont réussi avec le build de l’instantané W3 validé.

## Raccord central de la vague 3

Les jets communs reçoivent désormais la caractéristique effective : initiative,
sauvegardes, armes contre créatures et objets, consommables offensifs et tests
de caractéristique. Le calcul de navigation et `effectiveSpeed` appliquent la
pénalité avant l’épuisement et Foncer, sans changer la vitesse de base.
Le contrôle des incantations est raccordé dans le lot composantes voisin.
Les dix tests du domaine ont réussi dans la collecte ciblée W3 de 110 tests.

Validation : [W3 sur instantané gelé](rules-audit/validation-wave3-2026-10-31.json) — suite **1 065/1 065**, playtest mock **30/30**, **125 outils**. Le [suivi canonique](suivi-integration-mcp.md#phb-armor-penalties) décrit l'état courant et les limites ; les ajouts W4 sont hors de cette preuve.
