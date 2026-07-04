# Faire payer un module — guide pratique (monétisation)

> **Public** : quiconque veut rendre un module d'aventure payant (achat unique
> d'accès), changer son prix, ou tester le parcours d'achat.
> **Références code** : lib/adventures.ts (registre + prix),
> lib/module-access.ts (entitlements), app/api/stripe/ (checkout + webhook),
> app/api/dm/route.ts (garde serveur), lib/CLAUDE.md (invariants monétisation).
> **Module payant de référence** : `tide-crypt` (5 €).

## Les deux axes de monétisation (orthogonaux — ne pas les confondre)

| Axe | Quoi | Où |
|---|---|---|
| **Tokens** | 1 message au DM = 1 token. Invité : `GUEST_MESSAGE_LIMIT` messages gratuits (défaut 5, cookie httpOnly). Connecté : solde de tokens (bonus `SIGNUP_BONUS_TOKENS` au premier login, défaut 10 ; packs Stripe de lib/token-packages.ts). | lib/credits-store.ts, lib/entitlements.ts |
| **Accès module** | Achat **unique et définitif** par compte connecté (ex. Tide Crypt 5 €). Table `module_entitlements`. | lib/module-access.ts, lib/adventures.ts |

Posséder un module ne dispense PAS de consommer un token par message : les deux
axes se cumulent. Un module gratuit (Grammy's, fey-shadow-fair) ne consomme que
des tokens.

## Rendre un module payant : la modification, en entier

Tout se passe dans `lib/adventures.ts` — **deux entrées à ajouter**, rien
d'autre à coder :

```ts
const REQUIRES_ENTITLEMENT: Record<string, boolean> = {
  'tide-crypt': true,
  'mon-nouveau-module': true,        // ← 1. le module devient payant
}
const MODULE_PRICE_CENTS: Record<string, number> = {
  'tide-crypt': 500,
  'mon-nouveau-module': 700,         // ← 2. son prix, en CENTIMES d'euro
}
```

- La clé est le **slug** du module (« exploitation »), jamais du vocabulaire
  narratif — verrouillé par tests/no-module-leaks.test.cjs.
- `AVAILABILITY[id]` doit être `true` : `available` (« publié / bientôt ») et
  `requiresEntitlement` (« gratuit / payant ») sont deux axes indépendants,
  mais un module payant non publié n'est ni jouable ni achetable
  (`requirePurchasableModule` lève).
- Aucun produit à créer dans le dashboard Stripe : le checkout envoie le prix
  en `price_data` inline. `MODULE_PRICE_CENTS` est la **source de vérité
  unique** du prix (relu par `requirePurchasableModule` à chaque checkout).
- Rien à toucher dans `adventures/<id>/` ni côté moteur MCP : la monétisation
  est invisible du contenu et du moteur.

Validation : `npm run typecheck` + `npm test` (tests/module-access.test.cjs et
tests/stripe-webhook.test.cjs tournent sur pg-mem, aucun appel payant).

## Ce qui se déclenche tout seul une fois ces deux lignes posées

1. **Landing** (app/page.tsx) : le module non possédé affiche
   `BuyModuleButton` (prix formaté, « Se connecter pour acheter » si anonyme) ;
   possédé → bouton jouer. `ownedModules` vient de `getOwnedModules`.
2. **Page de jeu** (app/game/page.tsx) : vérifie `ownedModules` via `/api/me`
   avant de démarrer — purement indicatif (confort UX).
3. **Garde serveur AUTORITAIRE** (app/api/dm/route.ts) : tout message vers un
   module `requiresEntitlement` sans compte → 402 + log
   `dm.module.login_required` ; avec compte mais sans achat → 402 + log
   `dm.module.purchase_required`. Dans les deux cas le token déjà débité est
   remboursé (`refundDebit`) avant le `return`. L'UI ne protège rien ; c'est
   cette garde qui fait foi.
4. **Checkout** (`POST /api/stripe/checkout` `{ moduleId }`) : 401 non
   connecté, 503 Stripe non configuré, 400 module inconnu/non payant, 409 déjà
   possédé ; sinon création d'une session Stripe avec
   `metadata: { userId, kind: 'module', moduleId }` et log
   `stripe.checkout.created`.
5. **Webhook** (`POST /api/stripe/webhook`, event
   `checkout.session.completed`) : signature vérifiée
   (`STRIPE_WEBHOOK_SECRET`), `payment_status === 'paid'` exigé, puis
   `grantModuleAccess` → log `stripe.webhook.module_granted`. **Jamais de
   crédit sur la seule `success_url`** (falsifiable).
6. **Idempotence** : l'octroi est idempotent par `event.id` Stripe (garde
   SELECT-puis-INSERT transactionnelle sur `stripe_events`) ET par
   `(user, module)` (`ON CONFLICT DO NOTHING` sur `module_entitlements`). Un
   webhook rejoué log `module_access.grant.duplicate_event` et ne fait rien.

Chaîne complète :

```
Landing → BuyModuleButton → POST /api/stripe/checkout { moduleId }
  → redirection Stripe Checkout (paiement)
  → Stripe POST /api/stripe/webhook (checkout.session.completed)
      → grantModuleAccess(userId, moduleId)  [module_entitlements]
  → retour /?checkout=success (informatif seulement)
  → /api/dm : hasModuleAccess(userId, moduleId) → la partie démarre
```

## Prérequis d'environnement

- `MONETIZATION_ENABLED` ≠ `'false'` (défaut : actif). `false` est réservé aux
  tests/scripts hors runtime Next — la garde module ne s'applique alors pas.
- `DATABASE_URL` (Postgres) — la table `module_entitlements` est créée par
  `DB_SCHEMA_SQL` (lib/db.ts), aucune migration manuelle.
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — sinon checkout/webhook
  répondent 503 et le bouton d'achat est désactivé (`paymentsEnabled`).
- `APP_BASE_URL` en production : les URLs de redirection Stripe ne doivent pas
  dépendre du header `origin` du client.
- Auth NextAuth opérationnelle (l'achat est réservé aux connectés).

Au démarrage, `config.check.ok` (logs) récapitule l'état :
`monetizationEnabled`, `databaseEnabled`, `paymentsEnabled`.

## Tester le parcours d'achat en local

État constaté sur la partie locale du 2026-07-04 (`.data/logs/server.jsonl`) :
la monétisation tourne (`config.check.ok` avec `monetizationEnabled: true`,
`paymentsEnabled: true` ; `credits.signup_bonus.granted` 10 tokens ; débits de
tokens en jeu), mais **aucun** événement `stripe.checkout.*`,
`stripe.webhook.*` ni `dm.module.*` : le parcours d'achat de module n'a encore
jamais été exercé localement. Pour le couvrir :

1. **Clés de test** : `STRIPE_SECRET_KEY=sk_test_…` dans `.env.local`.
2. **Webhook local** — Stripe ne peut pas joindre localhost ; utiliser la CLI :
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   et copier le `whsec_…` affiché dans `STRIPE_WEBHOOK_SECRET` (relancer le
   dev server après).
3. **Refus avant achat (à tester exprès)** : connecté mais sans achat, envoyer
   un message sur le module payant → 402, log `dm.module.purchase_required`,
   et vérifier que le solde de tokens est INTACT (remboursement).
4. **Achat** : bouton « Acheter » sur la landing → Checkout Stripe, carte de
   test `4242 4242 4242 4242` (date future, CVC libre).
5. **Logs attendus**, dans l'ordre : `stripe.checkout.created` (kind: module)
   → `stripe.webhook.module_granted` → la partie démarre sur le module.
6. **Vérification base** :
   ```sql
   SELECT * FROM module_entitlements WHERE module_id = '<id>';
   SELECT * FROM stripe_events ORDER BY created_at DESC LIMIT 3;
   ```
7. **Idempotence** : rejouer l'événement (`stripe events resend <event_id>`)
   → log `module_access.grant.duplicate_event`, aucune ligne en plus.

## Invariants à ne pas casser (lib/CLAUDE.md + AGENTS.md)

- **Ordre immuable dans la route DM** : rate-limit IP → budget global → débit
  → gardes/travail. Tout `return` d'erreur APRÈS le débit rembourse via
  `refundDebit` (les `return` ne passent pas par le `catch`) — la garde module
  le fait déjà deux fois ; tout nouveau `return` inséré après le débit doit
  faire pareil.
- **La garde serveur fait foi** : ne jamais « débloquer » un module côté UI ou
  client ; l'UI n'est qu'indicative.
- **Jamais créditer/octroyer sur la `success_url`** : seul le webhook signé
  accorde l'accès.
- **Préserver la garde `stripe_events`** dans tout refactor de
  `grantModuleAccess`/`addPurchasedCredits` (Stripe REJOUE les webhooks).
- **Imports paresseux** : `lib/entitlements` (next-auth/next/headers) et
  `lib/module-access` ne sont importés que sous `MONETIZATION_ENABLED` — ne
  pas les rendre eagers (les tests/scripts Node n'ont pas le runtime Next).
- **Zéro fuite inter-modules** : clés par slug uniquement dans
  `REQUIRES_ENTITLEMENT`/`MODULE_PRICE_CENTS`.

## Cas de gestion courants

- **Changer le prix** : modifier `MODULE_PRICE_CENTS` — effet immédiat sur les
  checkouts suivants ; les accès déjà accordés ne sont pas affectés.
- **Repasser un module en gratuit** : retirer ses deux entrées. Les lignes
  `module_entitlements` existantes deviennent simplement inertes (aucun
  nettoyage requis).
- **Offrir l'accès à un compte** (support/geste commercial) : appeler
  `grantModuleAccess(userId, moduleId, { eventId: 'manual:<motif>-<date>',
  source: 'manual' })` — l'`eventId` doit être unique (même table d'idempotence
  que Stripe).
- **Lancer un module payant** : le créer gratuit d'abord (playtests), puis
  ajouter les deux entrées au moment du lancement — aucune donnée à migrer.
