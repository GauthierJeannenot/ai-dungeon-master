# Récompenses physiques autorées — Sarah

Ce lot conserve les récompenses originales de CM, chapitre9, sections28f,2b0,
2ba,2c4,2c8,2d3 (pp104,110–113), version locale figée v1.221.2. Ce contenu
d’aventure n’est pas une nouvelle règle du DMG ni un pouvoir de monstre.
Les montants entiers d’origine sont conservés pour le héros seul, par décision
explicite de l’utilisateur. Les effets pris aux prisonniers demeurent leur
propriété jusqu’à un véritable transfert explicite établi par le MJ.

`inspect_adventure_rewards` expose au MJ les définitions de la carte courante.
Cette lecture ne découvre rien et ne donne aucun objet au personnage.
`prepare_adventure_reward` exige une vraie fouille, l’accès physique au contenu
et son fait situé. Le contenu d’un coffre verrouillé exige d’abord l’ouverture
effective de ce coffre. Les biens portés par un ennemi demandent leur issue
réelle lorsque le texte conditionne cette récompense, et leur source corporelle encore présente ; la fuite du joueur,
un simple combat déclenché ou une ancienne photographie de corps ne suffisent
pas. Aucun corps disparu n’est recréé pour permettre le pillage.

La préparation matérialise les objets au sol et la monnaie non collectée.
`pick_up_item`, `collect_treasure`, `identify_magic_item`, `read_spell_scroll`,
`attune_magic_item` et les usages restent distincts. Chaque source possède un
reçu unique et des liens inverses, conservés après dépôt, collection,
consommation ou SQL. La valeur nominale d’un médaillon ou bracelet demeure
une propriété de son instance ; aucune conversion automatique en pièces.
La collection B6 vaut300po seulement pour un véritable acheteur avisé :
l’offre qualifie explicitement ce fait, puis la vente utilise la même caisse
marchande finie que les autres reventes. Un don à Candlekeep ne crée pas
automatiquement de faveurs. L’hospitalité d’Old Fargo et l’amitié éventuelle
de Vecken restent conditionnelles à leurs actes réels ; aucune guérison,
nuitée passée ou ressource n’est créditée par le texte de conclusion.

## Mini-catalogue2014

Les sources complètes des deux nouveaux objets sont les fiches officielles
SRD5.1 (même PDF WotC et SHA que le catalogue existant), contreparties des
fiches DMG2014. Elles sont conservées dans `lib/srd/magic-items-sources.json`.
La potion de soins supérieurs était déjà prise en charge :8d4+8, rare,
consommation physique et action réelles.

Le **carillon d’ouverture**, DMG158/SRD213–214, est rare, sans harmonisation,
long d’environ1pied et pesant1livre. Une action vers un objet à120pieds ouvre
une serrure ou un loquet si le son l’atteint ; si aucun ne reste, l’objet
s’ouvre. Dix usages, puis le tube est fissuré et inutile, sans recharge.
`use_chime_of_opening` exige l’instance réellement tenue, un coffre préparé
avec son verrou réel, un fait sonore situé et un événement unique.
Un son réellement bloqué dépense l’usage sans ouvrir. Cette tranche borne
les cibles aux contenants à verrou simple représenté, sur le niveau actuel
et dans la même salle avec une ligne physique qualifiée. Elle refuse avant
coût les portes sans vraie représentation de serrure, les mécanismes
composites et les verrous magiques. Elle ne télécommande pas une porte
simplement parce que son nom ressemble à un objet ouvrable.

La **robe aux couleurs scintillantes**, DMG194/SRD238, est très rare,
requiert l’harmonisation, possède3charges et récupère1d3charges dépensées
à l’aube réelle applicable. Portée et harmonisée, une action/charge active
sa lumière vive30pieds puis faible30pieds supplémentaires. Les créatures
qui voient réellement le porteur ont le désavantage contre lui ; celles
dans sa lumière vive qui le voient à l’activation font WIS15, sinon sont
étourdies jusqu’à la fin de l’effet. Les cibles physiques sont capturées
à l’activation ; leurs vrais dés et éventuelles fenêtres bardiques persistent.
L’effet ne demande pas de concentration.

Deux **conventions explicites de l’utilisateur**, distinctes du texte imprimé,
sont retenues dans chaque reçu : le porteur est exclu des sauvegardes de sa
robe ; l’initiative est conservée jusqu’à la vraie fin de son prochain tour
avant `end_combat`, même forcé. Aucun délai universel12secondes ni effacement
à la sortie du combat ne remplace cette frontière. Cette activation exige
donc l’initiative active. Les sens non visuels ne donnent pas gratuitement
la perception des couleurs ; les hauteurs non qualifiées sont refusées.
Si le porteur meurt réellement après l’activation, l’initiative garde seulement
son emplacement initial pour cette échéance déjà acquise. Le passage est
passif : aucun `startHeroTurn`, nouvelle réaction, crédit d’action, ressource
ou réanimation ne lui est accordé. La frontière réelle suivante termine
l’effet et ses étourdissements, puis permet de clore l’initiative. Ce n’est
pas un tour agissant du mort et aucun délai12secondes n’est substitué.

Le **parchemin de Contresort** B12 est de niveau3, peu commun, DD15/attaque+7
selon DMG5827–5847. Il se lit seulement avec la vraie liste de classe. Son
usage réutilise `resolve_reaction` pour une réelle incantation adverse
observée à60pieds, avec `scrollItemId` explicite déjà tenu et lisible.
Aucun sort connu/préparé ni emplacement utilisateur n’est requis ; la
réaction et le parchemin se dépensent une fois. Cette première tranche
refuse un lecteur qui ne peut normalement lancer aucun sort de niveau3,
avant dé/coût : elle n’invente pas une seconde fenêtre de test de lecture
au milieu de cette réaction. Les autres réactions par parchemin ne sont
pas implicitement admises. Un appel d’action ordinaire refuse Contresort.

Le **parchemin de Téléportation** B7 reste le vrai objet de niveau7,
très rare, DD18/attaque+10 : acquisition, conservation, lecture de classe
et SQL sont représentées. Son lancement est explicitement indisponible
dans ce lot : destination/familiarité/incidents ne sont pas implémentés.
Le refus précède action, dé et consommation. Aucune fuite automatique de
Viallis, Téléportation de remplacement ou réduction du niveau n’est offerte.

Ce lot n’intègre ni tout le catalogue DMG, ni une capacité de monstre,
ni une vente automatique, ni un inventaire virtuel complet de PNJ.

La poche de Faerl (CM28f, second paragraphe) ne dépend pas d’une victoire sur ses gardes : elle suit son vrai porteur révélé et présent, faerl_city ou faerl_village, avec un seul reçu faerl_personal. Une fouille réelle de corps KO ou une véritable remise est nécessaire. Le coffre du coche (premier paragraphe) conserve au contraire ses conditions imprimées et son ouverture effective. Les objets portés de Viallis suivent sa vraie position corporelle après un déplacement réellement résolu ; un snapshot de clôture ne le matérialise pas.

Le coffre CM28f exige désormais un résultat explicite victory du vrai engagement de gardes et actualOwnerEscapePreventedConfirmed:true, en plus du vrai porteur, de la remise/fouille réelle et du coffre effectivement ouvert. Cette attestation porte sur la condition imprimée ; elle ne transforme aucune fuite ou négociation en victoire. La poche demeure indépendante de cette condition.

Raccord de frontière passive : tous les filtres de la même initiative (y compris reprise météo/nutrition) conservent seulement le créneau source acquis de la robe. Le passage du corps mort ne réinitialise ni son économie de mouvement/action ni ses ressources de tour ; il termine uniquement cet effet à la vraie frontière suivante.

Limite physique de cette première préparation au sol : fouille et remise des biens portés refusent un porteur dont la hauteur est inconnue, qui est en vol, ou qui se trouve à un Z différent de0. Sa hauteur réelle est conservée dans le reçu historique ; aucune projection XY ne fait tomber son corps ou ses objets. Le contrôle négatif de hauteur est pur sur clones illégaux, jamais un vol ou import positif fabriqué.

Limite de revente des armes B8 : après un véritable transfert des victimes, ces exemplaires peuvent être acquis, transportés, déposés et utilisés. Leur revente ordinaire demeure refusée avant coût par les gardes de provenance et de garde marchande ; ces liens inverses ne sont pas encore raccordés pour les équipements autorés. Ne jamais effacer le reçu ou ses références pour contourner ce refus. Les valeurs d’art et la collection B6 ont leur propre qualification de pleine valeur ; cette limite ne donne ni argent, ni accord marchand automatique, et ne bloque aucune quête de Sarah.
