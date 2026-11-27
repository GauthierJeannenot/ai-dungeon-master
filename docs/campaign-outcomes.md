# Issues de campagne — DMG 2014

Le DMG, *Heroes Who Matter* (2373–2375), prévoit plusieurs issues possibles.
*Dungeon Goals* (2453–2474) distingue notamment sauvetage, fuite, pourparlers et
combat. *Campaign Tracking* (5046–5072) demande de conserver la continuité des
faits et les notes de campagne. Ces passages fondent le suivi ; ils ne
prescrivent ni les noms d’outils ni un nouveau tarif, jet ou effet de quête.

Une rencontre auteur déclarée dans `campaignTracking`, ou utilisée par une
condition `encounterOutcome`, conserve son vrai
engagement : identifiants des acteurs, indices auteur, profils déjà publiés,
hostilité effective, carte, génération et date. Son démarrage ne complète pas
l’objectif. Le véritable `end_combat` conserve une clôture avant le retrait des
acteurs. Le MJ choisit ensuite explicitement `record_campaign_outcome` sur cet
identifiant de clôture ; le texte `reason` n’est jamais interprété.

Une victoire exige les adversaires réellement morts ou à zéro PV. Un KO peut
donc suffire : aucun meurtre n’est imposé. Reddition et accord sont des
décisions narratives explicites du MJ concernant les vrais survivants, sans
jet universel ou état magique créé. La première capture est bornée aux corps
réellement assommés et vivants, adjacents au joueur capable qui est désigné
gardien ; ce reçu n’ajoute ni liens, ni transport, ni garde automatique future.

Une fuite consignée exige une clôture forcée explicite et le déplacement réel
du joueur, ou des survivants adverses, hors de la salle de confrontation.
C’est une frontière technique de cette tranche, pas une règle générale de
distance de fuite. Le MJ reste celui qui décide de la clôture ; une poursuite,
réaction ou conséquence physique en attente conserve ses gardes existantes.

Décision utilisateur : quitter l’acte du temple après une vraie fuite est
autorisé si l’urne est réellement récupérée. Le reçu garde cette issue et ses
conséquences d’échec ; ni Viallis, ni son culte, ni un rituel ne sont déclarés
vaincus par cette fuite. Les noms et choix admissibles propres à Sarah restent
dans ses données auteur. Le moteur générique ne connaît aucun secret du module.

Les trois objectifs d'objet de Sarah exigent l'identifiant auteur exact avec
`strictmatch: 'id'`. Un autre objet réellement possédé portant le même nom ne
remplace pas le journal, l'urne ou le tome. Les autres modules conservent leur
vérification historique tant qu'ils ne choisissent pas cette identité stricte.

SQL et le rejeu conservent un seul résultat immuable par clôture, sans nouveau
dé, coût, soin, XP, objet ou récompense. Les départs enregistrent les identifiants
des issues réellement utilisées. Le registre ne se réinitialise jamais lors
d’un repos ou du début d’un cycle d’activité.

Les anciennes sauvegardes sans registre restent inchangées au chargement.
`encountersTriggered` signifie seulement « engagé ». Une ancienne rencontre
encore réellement présente dans l’initiative peut être observée à sa clôture
actuelle ; sa date de début passée reste inconnue. Un ancien combat déjà fini,
ou des corps absents, ne sont pas reconstruits. Les anciennes cartes déjà
quittées conservent leurs résultats historiques sans migration implicite.

Le sauvetage civil dépend du registre d’escorte et de sa véritable arrivée
sûre qualifiée, intégré séparément : une disposition `helpful` n’est pas une
preuve de déplacement ou de sauvetage. Cette tranche ne fabrique aucune
escorte, attaque de civil, serrure, propriété, monnaie ou récompense.
