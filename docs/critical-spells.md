# Concentration et recouvrement d’Aide — DMG 2014 / Xanathar

Xanathar, `Concentration` (lignes 84–86), termine la concentration précédente
dès le début d’un nouveau sort exigeant la concentration. Les admissions de
cible, composantes, ressources et contexte restent vérifiées avant cet
engagement. La perception et Contresort sont planifiés sur une projection pure
de la fin de l’ancien groupe : un lanceur sous sa propre Grande invisibilité
peut donc redevenir visible avant la nouvelle fenêtre.

Une fenêtre réelle conserve un marqueur interne lié réciproquement à la
commande du sort tenu. L’ancienne concentration est déjà terminée ; SQL et la
reprise ne la rétablissent pas. La réaction conserve ses coûts existants,
les emplacements/actions du sort original sont engagés une seule fois à sa
reprise, et une réaction refusée ne restaure pas l’ancien effet. Ce marqueur
n’est ni un argument du joueur ni un appel MCP supplémentaire. Ready et les
incantations longues conservent leurs producteurs de concentration existants.
Une ancienne fenêtre importée sans marqueur reste historique : sa reprise
termine l’ancienne concentration au commit actuel, sans prétendre reconstruire
un commencement passé qui n’avait pas été enregistré.

Le DMG, `Combining Game Effects` (8163–8165), et Xanathar, `Combining Different
Effects` (60–62), ne cumulent pas les bénéfices d’effets portant le même nom.
Cette tranche conserve toutes les instances et échéances d’Aide, mais une
seule contribution maximale par cible. Un effet moins puissant peut redevenir
actif si le plus puissant expire et que sa propre durée n’est pas écoulée.
La primitive d’épuisement conserve la base de PV maximum avant sa division.

Convention explicite confirmée par l’utilisateur pour les PV courants : un
nouvel Aide plus puissant accorde seulement la différence positive de
puissance active ; un lancement égal ou plus faible soigne zéro. Une
expiration ou réactivation ne soigne jamais. Une baisse de maximum borne les
PV courants à ce nouveau maximum. Par exemple, Aide +5 puis Aide +10 accorde
seulement +5 supplémentaires ; la réactivation ultérieure du +5 n’accorde
aucun soin. Les coûts des deux lancements restent réels.

Les anciennes instances sont conservées sans migration à la restauration ;
elles reçoivent leur provenance legacy et leur contribution normalisée lors
d’un véritable changement d’Aide. Identité, source, durée et données
antérieures ne sont pas réécrites. Ce lot n’est pas un résolveur universel de
cumul d’effets, d’événements simultanés ou de nouvelles capacités de monstres.

Validation ciblée à constater sur les sources et binaires privés définitifs :
MCP public, SQL/rejeu/refus, POST aux arguments exacts, Aide sous épuisement,
Ready/incantation longue, compatibilité et sonde réelle W37 vers SQL. Aucune
suite complète privée ; la suite commune attend le lot entier.
