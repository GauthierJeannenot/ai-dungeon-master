# lib/ — couche partagée app (stores, auth, monétisation, registre)

## Deux couches de registre d'aventure — ne pas les fusionner

- `lib/adventure-map.ts` : types + registre des DONNÉES MOTEUR
  (`getAdventureMap`, `seedAdventureNpcs`, `describeRoomHooks`,
  `isKnownAdventureId`…). Importable par le serveur MCP (compilé dans son
  dist) — donc RIEN d'app-only ici (pas de fs, pas de next, pas de logger).
  Les accesseurs prennent `adventureId` en DERNIER argument optionnel (défaut
  Grammy's) : ne pas casser cette signature.
- `lib/adventures.ts` : registre APP complet (definition.ts + map +
  disponibilité). Importé par des composants client → rien de serveur non
  plus. `requireAvailableAdventure` = démarrage d'une partie (lève si inconnu
  ou verrouillé) ; `getAdventureDefinition` = lecture fail-safe (défaut).
- `lib/player-template.ts` : gabarit héros PARTAGÉ app + moteur — modifier ici,
  jamais dupliquer.

## Stores à double backend (fichier ↔ Postgres)

`session-store.ts` et `credits-store.ts` routent vers `*-db.ts` quand
`DATABASE_URL` est définie (`isDatabaseEnabled()`), sinon fichiers `.data/`.
**Toute évolution de schéma se fait dans LES DEUX backends** + la migration
additive dans `lib/db.ts` (`ADDITIVE_MIGRATIONS_SQL`, même mécanique que
`owner_id`/`adventure_id`) + le round-trip testé dans tests/db-stores.test.cjs
(pg-mem). Les données legacy sans le nouveau champ doivent rester lisibles
(normalisation avec défauts, cf. `normalizeStoredSession`).

## Monétisation & anti-abus (consommé par app/api/dm/route.ts)

- Ordre immuable : rate-limit IP → budget global journalier → débit
  (token utilisateur ou message invité) → travail LLM. Un `return` d'erreur
  serveur APRÈS le débit doit rembourser (`refundDebit`) — les `return` ne
  passent pas par le `catch`.
- `lib/entitlements.ts` tire next-auth + next/headers : ne l'importer que
  PARESSEUSEMENT et seulement si `MONETIZATION_ENABLED !== 'false'` (les
  tests/scripts Node n'ont pas le runtime Next).
- Idempotence Stripe : le webhook crédite par event id (table
  `stripe_events` / `processedEventIds`) — préserver cette clé lors de tout
  changement.
- `session-lock.ts` sérialise les requêtes d'une même session (le moteur MCP
  est un process à état) : tout nouveau point d'entrée qui mute une session
  doit prendre le verrou.

## mcp-client.ts

- Cache de clients par sessionId (TTL 30 min, max 25) ; l'`ADVENTURE_ID` du
  process enfant est fixé AU SPAWN — le premier appel MCP d'une requête doit
  donc déjà connaître l'aventure résolue.
- Ne jamais réutiliser un client pour une autre aventure : session ↔ aventure
  est un invariant (409 côté route).

## Logs

`server-logger.ts` : logs JSON structurés `[ai-dm:<event>]`, secrets masqués
automatiquement. Utiliser `logEvent(level, 'domaine.action', meta)` — pas de
`console.log` dans du code serveur partagé. `summarizeGameState` pour logger
un état sans le dump complet.
