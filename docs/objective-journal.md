# Objectifs révélés par les conversations

Le journal est commun à toutes les campagnes, y compris celles qui n’ont pas
encore de métadonnées de dialogue. Le MJ choisit les propositions des PNJ et les
appels MCP ; le moteur valide les sources et les conditions, puis conserve
l’événement dans `GameState.objectiveJournal`. Aucun texte joueur n’est analysé
pour déclencher une quête.

## Objectifs prévus dans un module

Un objectif existant de `mapQuests` peut déclarer un libellé public et les PNJ
qui peuvent le proposer :

```ts
dialogue: {
  npcIds: ['existing_npc_id'],
  label: 'Retrouver le document demandé',
}
```

Cette donnée reste dans `adventures/<id>/map.ts`. Les conditions `check` et le
statut `required` de l’aventure ne changent pas. Le journal public ne connaît
cet objectif qu’après `record_objective_dialogue` avec ses `mapId/objectiveId`
exacts et un PNJ source autorisé. La confiance, une rencontre ou une visite ne
produisent aucune révélation automatique. Le MJ respecte également les secrets,
le mutisme et les préalables narratifs du module ; le moteur ne lit pas le sens
des répliques pour vérifier ces choix.

Les conditions internes des actes continuent de contrôler les sorties pour
préserver les scénarios et les anciennes parties. Elles sont distinctes du
journal de propositions connues. Une ancienne partie sans journal n’invente
aucun historique de conversations.

## Quêtes inventées, réutilisables partout

Le même outil accepte `generated` avec `id`, `mapId`, `label` et de une à quatre
conditions `checks` explicites, toutes nécessaires. Aucune donnée propre à une
campagne n’est codée dans le moteur, le prompt générique ou le composant.

Les conditions supportées sont : objet physique exact actuellement représenté
(inventaire ou sol), salle visitée, disposition d’un PNJ existant, arrivée
attestée d’un compagnon dans une salle, indice autoré révélé, issue réelle
d’une rencontre autorée parmi les résultats choisis. Les identifiants doivent
exister ; un simple déclenchement de rencontre ne vaut pas victoire.

Ces quêtes sont toujours optionnelles. Leur création ne crée pas d’objet,
d’acteur, de carte, d’indice, de combat, de récompense ou de règle. Une nouvelle
créature ou un nouvel objet doit d’abord être établi par son outil dédié.
Les prédicats libres, scripts et accomplissements déclarés uniquement dans la
narration ne sont pas acceptés.

## Enregistrement et lecture

`record_objective_dialogue` requiert un `eventId` stable, un `npcId` exact,
`communication` (`speech`, `writing` ou `gesture`), le propos réellement
communiqué dans `statement` et au moins une sélection `authored` ou `generated`.
La communication et la révélation sont un seul événement moteur : il ne faut
pas fabriquer une ancienne conversation ni exiger un jet d’influence pour une
simple proposition. Le PNJ doit être visible, présent et capable de participer.
Un PNJ qui refuse d’être influencé peut néanmoins proposer une mission.

L’événement conserve source, lieu, heure et arguments exacts. Un rejeu identique
ne crée rien ; un même ID avec d’autres arguments refuse. La capacité reste
bornée à 64 communications, 64 quêtes inventées et 128 objectifs connus sans
éviction de l’historique. Aucun dé, temps ou budget d’action n’est consommé.

`inspect_objectives({mapId?})` lit seulement les objectifs déjà communiqués.
Le composant `ObjectiveJournal` utilise cette même vue publique. Une proposition
n’engage pas le personnage : le joueur décide de la poursuivre, sans acceptation
ou récompense automatique. « Conditions remplies » décrit uniquement l’état
moteur ; posséder un objet ne signifie pas l’avoir livré ou avoir été payé.

## Persistance, voyage et contexte

Les conditions suivent l’état courant : perdre l’objet demandé peut rendre une
condition fausse avant le départ. Une vraie transition irréversible archive les
objectifs de l’acte quitté, avant le transfert des objets et des compagnons.
Les escaliers aller-retour n’archivent pas le journal. Les objectifs déjà
annoncés pour un acte futur restent actifs. SQL et l’hydratation conservent les
communications et les instantanés ; une divergence de schéma ou de témoin refuse
avant mutation. Ces témoins sont des contrôles de cohérence, pas une signature
cryptographique.

Le système permanent n’accumule pas le manuel de cette fonctionnalité.
`lib/dm/objective-context.ts` donne au MJ les propositions des PNJ réellement
présents et le journal connu. Les possibilités non révélées restent une
référence privée du MJ. La procédure spécialisée est dans
`lib/dm/rule-guides.json`, domaine `objectives`, consultable dynamiquement via
`get_rules_support({domain: 'objectives'})`. Les schémas des deux outils sont
immédiatement disponibles dans le catalogue commun.

Tests : `tests/objective-dialogue.test.cjs` (moteur réel, SQL, voyage, refus,
réutilisation inter-campagnes, confidentialité du rendu) et
`tests/dm-objective-dialogue.test.cjs` (frontière IA/MCP et route réelle sans
appel LLM payant). Ces tests ne mesurent pas la qualité du modèle en partie.
