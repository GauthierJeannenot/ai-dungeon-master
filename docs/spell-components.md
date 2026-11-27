# Composantes des sorts — PHB 2014

Le précontrôle V/S/M ne lance aucun dé et ne dépense aucun emplacement,
action, matériau, charge ou temps. Le moteur l'appelle avant ces coûts
et avant l'ouverture d'une réaction, après avoir identifié un sort supporté.

Source ponctuellement consultée : `rules/books/phb-2014.md`, lignes 6259–6277
(Components, Verbal, Somatic, Material). Métadonnées des seuls sorts
enregistrés : `spellRules` dans `lib/srd/hero-spells.ts`, registres JSON déjà
épinglés ; aucun balayage de livre ou nouvel audit global.
Le passage Equipment de l'introduction du Monster Manual 2014 (lignes 409–416)
garantit les composantes matérielles nécessaires aux sorts du bloc natif.
Identify est vérifié dans le PHB, entrée du sort (ligne 10770 et suivantes).

## Contrat de raccord réalisé

Ces contrôles, schémas et transmissions sont raccordés dans la vague W3 validée.

- `assertSpellComponents({spellId, casterId?, focusItemId?, materialItemId?})`
  valide l'état moteur courant et lève le premier refus mécanique.
- `inspectSpellComponents(state, input)` retourne la même lecture sans mutation,
  avec tous les problèmes, composantes, contraintes et nombre de mains libres.
- `SpellComponentStateSchema.optional()` sous
  `DmToolStateSchema.spellComponents` pour le round-trip autoritaire.
- `registerSpellComponentTools` et `focusItemId` au schéma
  de `cast_spell` ainsi qu'à `HeroSpellInput`. Le transmettre sans sélection
  automatique de source.
- Dans `cast5eSpell`, précontrôle avant toute mutation/dé/réaction, uniquement
  au début réel de l'incantation. Une reprise de réaction ou libération d'un
  sort préparé ne relance pas ses composantes ni ses coûts.
- Shield et Counterspell : précontrôle de la réaction avant paiement, puis
  conservation de la continuation et du jet déjà suspendu.
- `componentExemption` est réservé au code moteur après validation réelle
  d'un objet magique ou parchemin. Ne jamais l'exposer dans un schéma MCP.
  Les exemptions existantes des objets/parchemins sont conservées ; cet
  argument ne valide pas l'existence ou l'usage de l'objet.
- Les vrais instruments/focaliseurs sont tenables dans `equip_item` avec
  les coûts d'interaction et contrôles de capacité déjà existants. Le helper
  ne dessine ni n'équipe un objet à la place de l'agent.

## Comportement

V est bloqué seulement par une contrainte établie `gagged` ou `silenced`.
L'état sourd, le texte du joueur et un effet libre non typé ne créent pas un
silence. `set_spell_component_constraint` est une décision MJ explicite avec
ID et source factuelle : plusieurs faits coexistent et se retirent séparément.
Ce n'est pas un lancement gratuit de Silence, une aire automatique ou une
manœuvre gratuite du joueur. `hands-bound` signifie les deux mains liées.

S requiert une main libre. Le loadout réel tient compte des armes, du bouclier,
des objets tenus et des agrippements actifs. Le moteur conserve sa convention
actuelle d'occupation des armes à deux mains ; le changement de prise pour
tenir une telle arme à une main n'est pas modélisé ici.

M ordinaire exige `focusItemId` exact, possédé : une vraie sacoche requiert une
main libre pour y accéder ; un vrai focaliseur de classe doit déjà être tenu.
Un magicien utilise `arcane_focus`, un clerc `holy_symbol`, un barde un
instrument enregistré. L'ID d'équipement enregistré prévaut sur le nom libre.
Une main tenant le composant/focaliseur peut fournir S pour ce même sort S+M.
Un sort S seul, y compris Counterspell, ne bénéficie pas de cette exception.

Les composants coûteux/consommés déjà enregistrés utilisent `materialItemId`
exact, leur contrôle spécifique actuel et l'accès par une main. La sacoche
ou le focaliseur ne les remplace pas. Le helper ne consomme aucun objet et ne
duplique pas la validation de valeur ou le débit existants. Identify conserve
sa perle enregistrée non consommée ; Revivify conserve ses vrais diamants
consommés. Identify demande aussi `focusItemId` vers une vraie sacoche : elle
fournit uniquement la plume de hibou ordinaire, et ne remplace jamais la perle.
L'outil `identify_magic_item(method=spell)` transmet ces deux sources exactes.

L'armure ou le bouclier non maîtrisé bloque toute véritable incantation,
y compris Shield, Counterspell et les sorts d'objets/parchemins, avant paiement.
Une activation d'objet qui n'incante aucun sort reste distincte. Mage Armor
lit l'emplacement d'armure réel : une armure de rechange dans le sac ne l'interdit
pas. La garde de feu alchimique des longues incantations et copies est vérifiée
avant de dépenser des pièces ou des composantes.

## Limites explicites

### Parole et mots de commande

Le contrôle pur `audibleSpeechStatus` lit les faits de bâillon/silence de
`dmTools.spellComponents.constraints` et les anciens effets `silence` encore
actifs sur l'acteur. Il est partagé entre les composantes V et les activations
qui exigent réellement une parole audible, actuellement la Perle de puissance
(DMG 2014, Command Word, source locale ligne 5915 ; Perle SRD page 232).

La Perle refuse avec `COMMAND_WORD_INAUDIBLE` avant de dépenser action,
utilisation ou emplacement récupéré. Chaque fait est indépendant : retirer
un bâillon ne retire pas un autre silence. Les mains liées et la surdité
ne sont pas du silence et ne bloquent pas à elles seules ce mot de commande.
L'expiration d'un ancien effet est lue à l'horloge réelle.

Cela ne rend pas toute activation d'objet verbale : les baguettes supportées
ne gagnent aucun mot de commande absent de leur source. Les exemptions V/S/M
des sorts effectivement lancés depuis un objet/parchemin validé restent
distinctes du prérequis d'activation de cet objet. Aucun sort Silence ou aire
de silence n'est créé par ce contrôle.

`tests/command-word-constraints.test.cjs` prépare huit cas : parole pure,
ancien silence, refus sous bâillon/silence, faits multiples, expiration,
surdité/mains liées et baguette sans activation parlée. Syntaxe et TypeScript
sans émission sont vérifiés ; la validation MCP relève du prochain instantané
central. Ces ajouts ne sont pas couverts par l'attestation W3 citée plus bas.

Les PNJ n'ont pas d'inventaire matériel ni de loadout de mains projetés.
Pour un sort exactement présent dans le trait `Spellcasting` de leur fiche
native, le moteur conserve la capacité native d'incantation et applique la
garantie de matériaux du Monster Manual. Cette garantie ne crée aucun objet,
butin ou focaliseur transférable et ne s'étend jamais au joueur. Les contraintes
de bâillon, silence ou mains liées restent applicables. L'inspecteur retourne
la provenance `nativeSpellcasting`. Un sort S/M sans cette capacité native
retourne `SPELL_COMPONENT_ACTOR_UNSUPPORTED` ; le registre des sorts réellement
exécutables reste lui-même limité par le moteur. Aucun contournement général
`Innate Spellcasting` n'est activé par ce lot.

Les symboles sacrés portés visiblement ou inscrits sur un bouclier ne sont
pas représentés par l'état actuel : seul le symbole réel tenu est supporté.
Les ingrédients individuels non coûteux, anatomies alternatives, composantes
supprimées par une aptitude, métamagie et aires dynamiques de Silence ne sont
pas modélisés. Aucun fait de ce type n'est déduit de la classe, race ou prose.

Écart ciblé préexistant : le kit wizard niveau 7 contient `identify_pearl`
sans `equipmentId: identification_pearl`, tandis que l'incantation existante
exige déjà ce dernier identifiant canonique. Ce lot ne réécrit pas le kit.

Les tests `tests/spell-components.test.cjs` couvrent le contrat pur, les
sources exactes, les mains, S seul/S+M, les contraintes V, les matériaux
coûteux, les limites PNJ et les refus/round-trips MCP avant coûts ou RNG.
Les douze tests du domaine ont réussi dans la collecte ciblée W3 de 110 tests,
dont les réactions refusées sans coût et Mage Armor avec une armure de rechange.
La collecte distincte de compatibilité des anciens scénarios magiques a aussi
réussi **119/119** tests ; ces nombres portent sur plusieurs domaines.

Validation : [W3 sur instantané gelé](rules-audit/validation-wave3-2026-10-31.json) — suite **1 065/1 065**, playtest mock **30/30**, **125 outils**. Le [suivi canonique](suivi-integration-mcp.md#phb-casting-components) décrit l'état courant et les limites ; les ajouts W4 sont hors de cette preuve.
