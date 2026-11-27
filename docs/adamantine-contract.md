# XGE Adamantine — contrat avant code W22

Base exacte publiée W21 :1010sources/1519binaires,305outils,2566tests. Les empreintes ont été vérifiées et toutes les sources archivées dans adamantine-baseline-source.zip avant première modification applicative. Toute différence finale sera calculée contre l’ensemble des1010sources et tous les nouveaux fichiers, sans liste manuelle susceptible d’omettre un raccord.

Sources relues : XGE fourni986–992, Adamantine Weapons ; PHB2014 Ammunition4082 et Critical Hits6004–6008 ; DMG2014 Statistics for Objects, Objects and Damage Types7921–7927. Aucune reconstruction de backlog ou nouvelle capacité MM.

## Circuit produit fixé par l’utilisateur

Décision transmise par le parent : VENDRE LES VERSIONS DÉJÀ FABRIQUÉES ; TRANSFORMATION REPORTÉE. Un nouveau stock initial réel est défini made|coated dès sa première origine, pour une vraie arme de mêlée canonique ou un lot de10munitions. Il reste sous garde du vrai marchand et ne peut être ramassé gratuitement. L’achat existant paie la version normale plus500gp, avec monnaie, portée, custody, mains, capacité, durée d’échange réelle et reçus. Le témoin source précède acquisition et tout tir.

Aucune qualification par simple nouveau fait ne transforme une arme/munition ordinaire déjà possédée, déposée, utilisée ou historiquement enregistrée. Un identifiant ou nonce nouveau ne réécrit pas cette provenance. Aucun service/coating payant actif n’est créé ; le surcoût500gp ne devient pas un temps, un métier ou une recette de fabrication RAW.

La matière suit l’instance et ses vrais projectiles consommés, réservés, retrouvés et transférés. Le lanceur ne transmet pas sa matière à une flèche ordinaire. Le stock initial comprend exactement une arme ou10munitions ; la tarification d’un lot partiel est refusée avant coût, sans inventer50gp/unité. Aucune magie, propriété d’armure ou autre statistique n’est accordée.

## Attaques réellement résolues

Le code initial interact_object refuse les tirs et ammunitionItemId : cette garde n’est pas simplement retirée. Une vraie branche ranged-object sera construite avec arme/munition exactes, stock compté, mains/Loading, portée normale/longue, couverture/visibilité, contexte physique et eau/vent représentés, vrais jets, dépenses même sur raté, défenses d’objet, économie Attaquer et continuation d20/Inspiration.

Après un vrai HIT seulement, une arme de mêlée adamantine ou la vraie munition adamantine tirée rend ce hit critique. Nat1 reste raté ; les dés source sont doublés une seule fois et les modificateurs restent simples. Aucun customDamageDice de substitution ni bonus contre créature ou propriété attribuée à une autre instance. Les immunités poison/psychique, résistances/vulnérabilités, seuil de dégâts et PV d’objet restent les résolveurs DMG existants. Une immunité ou un seuil peut donner0dégât malgré un vrai hit critique.

Le rayon/arme/munition original et le d20 tenu sont conservés avant la réponse d’Inspiration. Paiement, projectile, action et dégâts ne se rejouent pas après SQL/nouveauprocess/retry. Toute géométrie ou combinaison décisive non représentée refuse avant dés/coûts plutôt que d’inventer une portée, une capacité, un contact ou un ciblage.

## Intégration et validation

Nouveaux source/witness/state/runtime/tools et guide ; raccords Item et tous schémas stricts, cartographie propriété ammo/chargement/expenditure/récupération, stock/achat/revente et validation SQL ; extraction du vrai résolveur d’attaque d’objet et branche ranged, handler toolkit_attack existant pour le jet tenu ; contexts/support/prompt/index/tsconfig. Guide Next local lu avant code app/libdm. Le parent tient le suivi canonique ; fragment privé seulement.

Tests ciblés de matière initiale, vrais prix/custody/instance, normal/nat1/crit/defenses, munition exacte consommée, Loading/mains/portées/couverture et refus avant dés/coûts, Inspiration/reprise, récupération sans diffusion de matière, SQL JSONB et nouveauprocess, vraie POST agent. Sous-ensembles d’outils et unicité, aucun total mondial fixé dans les tests. Typecheck MCP+Next, buildMCP, régressions pertinentes et mock si prompt ; full commune parent. Aucun build/écriture ROOT ou autre privé.

## Dépendance PHB autorisée ensuite

Le parent a établi l’absence d’acquisition publique des sept lanceurs dans W21. `prepare_phb_launcher_stock` crée seulement leur vrai stock initial marchand ordinaire ; achat, paiement et équipement restent réels. Le lanceur est désormais acheté dans les témoins courants. Les premières preuvesr1 conditionnelles restent conservées et ne sont pas présentées comme cette fermeture publique.
