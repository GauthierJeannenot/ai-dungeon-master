# AI Dungeon Master

Application web de jeu de rôle D&D 5e avec un Dungeon Master IA (Claude) comme narrateur et arbitre de règles. Landing page avec choix de modules d'aventure, interface battlemap interactive avec chat latéral. Un serveur MCP TypeScript gère tous les calculs mécaniques.

## Stack

- **Frontend** : Next.js 16, TypeScript, Tailwind CSS
- **IA** : Anthropic SDK — Haiku 4.5 (classifieur d'intention) + Sonnet (narration)
- **MCP** : `@modelcontextprotocol/sdk` — game engine déterministe
- **Auth** : NextAuth v5 (OAuth 2.0 Google/GitHub) — sessions Postgres via
  `@auth/pg-adapter`, ou JWT sans base
- **Persistance** : Postgres (`DATABASE_URL`) pour auth, sessions de jeu et
  crédits ; repli fichiers `.data/` sans DB
- **Paiement** : Stripe Checkout + webhook (achat de tokens)

## Modules d'aventure

L'app est multi-modules : la landing propose plusieurs aventures, une partie =
un module choisi. Le moteur MCP, les prompts, la battlemap et les textes sont
paramétrés par `adventureId`.

| Couche | Où |
|---|---|
| Données de carte (rooms, rencontres, PNJ, hooks, startCell, joueur) | `adventures/<id>/map.ts` + registre `lib/adventure-map.ts` (importable par le moteur MCP) |
| Contexte narratif (markdown) | `adventures/<id>/*.md`, chargé par `lib/context-loader.ts` (repli sur le module par défaut pour les règles génériques) |
| Contenu app (landing, welcome, battlemap, placeholders, prompts) | `adventures/<id>/definition.ts` (`AdventureContent`), agrégé par `lib/adventures.ts` |
| Battlemap pixel art | `public/battlemaps/<id>.png` |
| Moteur | un process MCP par session, spawné avec `ADVENTURE_ID` (`mcp-server/adventure.ts`) |
| Persistance | colonne `game_sessions.adventure_id` ; l'aventure de la session fait foi (bascule interdite → 409) |

### Ajouter un module d'aventure

1. `adventures/<id>/adventure-module.md` (format « ## Salle N » + « Point d'entrée »), `player-character.md`, et `map.ts` (exporter un `AdventureMapData` : rooms, entryCells, encounters — **types de monstres existants du moteur uniquement**, npcs, aliases, transitions, roomHooks, startCell, initialPlayer). Règles propres facultatives (`player-rules.md`, `dm-rules.md`) sinon repli automatique.
2. `adventures/<id>/definition.ts` : exporter un `AdventureContent` (meta landing, `welcomeMessage`, `chatPlaceholders`, `roomStatusHints`, et surtout `promptGuidance` — le vocabulaire du module injecté dans les prompts DM ; **aucun terme d'un autre module**).
3. Battlemap 17×15 : dupliquer `scripts/generate-battlemap-grammys-country-apple-pie.cjs` → `scripts/generate-battlemap-<id>.cjs`, sortie `public/battlemaps/<id>.png`.
4. Enregistrer la carte dans `lib/adventure-map.ts` (`ADVENTURE_MAPS`), importer la définition dans `lib/adventures.ts` et l'ajouter à `AVAILABILITY`.
5. Les tests `tests/adventure-modules.test.cjs` (cohérence) et `tests/no-module-leaks.test.cjs` (aucune fuite de vocabulaire inter-module) couvrent automatiquement le nouveau module. `npm test` doit rester vert.

Détail complet du câblage : [docs/multi-adventure-architecture.md](docs/multi-adventure-architecture.md).

## Base de données (production)

Définir `DATABASE_URL` bascule TOUTE la persistance sur Postgres :

| Donnée | Sans DATABASE_URL | Avec DATABASE_URL |
|---|---|---|
| Auth (users, comptes OAuth, sessions) | JWT (cookie signé, rien côté serveur) | Tables Auth.js (`users`, `accounts`, `sessions`) |
| Sessions de jeu | `.data/sessions/*.json` | Table `game_sessions` (JSONB) |
| Crédits & quota invité | `.data/credits/*.json` | Tables `user_credits`, `stripe_events`, `guest_usage` (SQL atomique, multi-instance safe) |

```bash
npm run db:migrate   # applique le schéma (idempotent — aussi fait au 1er accès)
npm run db:import    # importe les données .data/ existantes vers Postgres
```

⚠️ En mode Postgres, l'identifiant utilisateur devient `users.id` (au lieu de
`provider:accountId` en mode JWT) : les soldes acquis en mode JWT ne suivent
pas automatiquement — voir l'en-tête de `scripts/db-import-file-stores.cjs`.
`DATABASE_SSL=require` pour un Postgres managé exposé en TLS.

## Monétisation

- **Un token = un message envoyé au DM.** Le débit se fait côté serveur AVANT
  l'appel LLM, avec remboursement automatique en cas d'erreur serveur.
- **Visiteur anonyme** : `GUEST_MESSAGE_LIMIT` messages gratuits (5 par défaut)
  sur *Grammy's Country Apple Pie*, suivis via un cookie invité httpOnly +
  compteur serveur (`.data/credits/`).
- **Utilisateur connecté** : solde de tokens (`SIGNUP_BONUS_TOKENS` offerts au
  premier login) rechargeable via Stripe. Les packs sont définis dans
  [lib/token-packages.ts](lib/token-packages.ts) ; le crédit est effectué par
  le webhook `checkout.session.completed` (idempotent par event id).
- Configuration Stripe : voir les commentaires `TO DO remplir les informations
  bancaires pour le paiement` dans [.env.example](.env.example) et
  [lib/stripe.ts](lib/stripe.ts).
- `MONETIZATION_ENABLED=false` coupe le débit/quota (tests, dev hors runtime Next).

**Mes parties** : la landing liste les parties en cours du joueur (`GET /api/sessions`,
scoped par propriétaire) avec reprise multi-appareils. « Reprendre » ouvre
`/game?adventure=<id>&session=<sid>` ; sur un appareil neuf (sessionStorage vide),
la page réhydrate l'état et l'historique depuis `GET /api/sessions/<sid>`
(vérifié en appartenance). Connecté = parties du compte ; invité = parties du
cookie invité.

## Battlemap

Chaque module a sa battlemap `public/battlemaps/<id>.png`, générée en pixel art,
exactement alignée sur la grille de jeu (17×15 cases) et les zones de
`adventures/<id>/map.ts` :

```bash
node scripts/generate-battlemap-grammys-country-apple-pie.cjs
node scripts/generate-battlemap-tide-crypt.cjs
```

À relancer si les zones de salles du module changent.

## Prérequis

- Node.js 20+
- Une clé API Anthropic

## Installation

```bash
npm install
```

## Configuration

### 1. Clé API

Éditez `.env.local` et remplacez `your_key_here` par votre clé Anthropic :

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Authentification & paiements

```env
AUTH_SECRET=...            # npx auth secret
AUTH_GOOGLE_ID=...         # Google Cloud Console → OAuth credentials
AUTH_GOOGLE_SECRET=...
AUTH_GITHUB_ID=...         # GitHub → Settings → Developer settings → OAuth Apps
AUTH_GITHUB_SECRET=...
STRIPE_SECRET_KEY=...      # TO DO remplir les informations bancaires pour le paiement (dashboard Stripe)
STRIPE_WEBHOOK_SECRET=...  # webhook checkout.session.completed → /api/stripe/webhook
```

Sans clés Stripe, l'app fonctionne : les boutons d'achat affichent « paiements
non configurés » et le reste (auth, quota invité, jeu) est opérationnel.

### 3. Battlemap (générée)

Les battlemaps `public/battlemaps/<id>.png` sont produites par
`node scripts/generate-battlemap-<id>.cjs` (pixel art aligné sur la grille
17×15). Vous pouvez les remplacer par toute image respectant ce ratio ; en
l'absence du fichier, un fond sombre est affiché.

### 4. Cout LLM et tests sans appels payants

Par defaut, l'application utilise le LLM en live. Pour tester les regles, les deplacements et la boucle de combat sans cout Anthropic :

```env
LLM_MODE=mock
ALLOW_PAID_LLM=false
```

Modes disponibles :

| Variable | Effet |
|----------|-------|
| `LLM_MODE=live` | Appels Anthropic normaux |
| `LLM_MODE=mock` | Reponses deterministes locales, sans appel payant |
| `LLM_MODE=record` | Appels live + sauvegarde des reponses dans `.data/llm-cassettes/` |
| `LLM_MODE=replay` | Rejoue les cassettes, sans appel payant |
| `NARRATION_MODE=quality` | Mode par defaut: le moteur resout les faits, puis le LLM ecrit la reponse visible |
| `NARRATION_MODE=budget` | Mode economie: garde les narrations locales quand elles sont considerees sures |
| `LLM_REPLAY_FALLBACK_TO_MOCK=true` | En replay, bascule sur le mock si une cassette manque |
| `LLM_MAX_CALLS_PER_REQUEST=10` | Coupe une requete trop bavarde |
| `LLM_MAX_CALLS_PER_SESSION=0` | Budget live par session (`0` = illimite) |
| `LLM_PROMPT_CACHE_ENABLED=true` | Active les breakpoints de prompt caching Anthropic |
| `LLM_PROMPT_CACHE_TTL=5m` | TTL du cache prompt (`5m` par defaut, `1h` possible pour longs playtests) |
| `LLM_SHORT_NARRATION_MAX_TOKENS=220` | Sortie courte pour les narrations mecaniques ou contraintes |
| `LLM_RICH_NARRATION_MAX_TOKENS=420` | Sortie plus large pour scenes sociales/ouvertes |
| `LLM_MODULE_CONTEXT_MAX_CHARS=6500` | Limite le contexte du module envoye au LLM |
| `LLM_FINAL_NARRATION_MAX_TOKENS=180` | Plafond de sortie pour les narrations finales breves |

En mode live, la route DM reduit aussi le cout sans passer en mock :

- actions evidentes de combat/deplacement par coordonnees/passage de tour resolues cote moteur avant Anthropic
- tools MCP filtres selon la phase et l'intention au lieu d'envoyer tous les schemas a chaque appel
- director local pour produire des beats/fallbacks; en `NARRATION_MODE=quality`, Claude reprend la voix finale visible apres les mutations moteur
- memoire de scene compacte dans `gameState.sceneMemory` pour porter les consequences sans repayer tout l'historique
- prompt caching sur les blocs systeme statiques et les schemas tools selectionnes
- mini budget visible en jeu: cout partie/tour, appels LLM, cache lu/ecrit, source narrative et route LLM
- narration finale avec prompt court specialise et reponses visees a 1-2 phrases
- correction serveur directe des narrations qui contredisent l'etat moteur, sans retry LLM supplementaire

Playtest cout/qualite :

```bash
npm run playtest:mock
node scripts/playtest.cjs --mode replay --narration-mode quality --report .data/playtest-reports/replay.json
node scripts/playtest.cjs --mode live --narration-mode quality --allow-paid --report .data/playtest-reports/live.json
```

Le playtest agrège appels LLM, cout estime, routes `none/short/rich/blocked`, source narrative, tools, violations de seuils, part de narrateur LLM et formulations robotiques interdites (`[Mock]`, coordonnees visibles, phrases generiques type "decor se replace"). Les seuils sont configurables via `PLAYTEST_MAX_COST_USD`, `PLAYTEST_MIN_LLM_NARRATOR_RATIO`, `PLAYTEST_MIN_DIRECTOR_LOCAL_RATIO`, `PLAYTEST_MAX_AVERAGE_LLM_CALLS` et `PLAYTEST_MAX_SIMPLE_TURN_LLM_CALLS`.

> ⚠️ L'estimateur de coût facture désormais chaque appel au tarif de SON modèle
> (Haiku 1/5, Sonnet 3/15 $/MTok…) au lieu de tout facturer au tarif Haiku —
> recalibrez `PLAYTEST_MAX_COST_USD` en conséquence. Analyse complète et pistes
> d'optimisation (dont l'évaluation de headroom-ai) :
> [docs/cost-optimization.md](docs/cost-optimization.md).

### 5. Modules d'aventure

Chaque module vit dans son dossier `adventures/<id>/` :

- `adventures/<id>/adventure-module.md` — Carte des salles, monstres, trésors, triggers
- `adventures/<id>/player-character.md` — Fiche, stats, équipement du joueur
- `adventures/<id>/player-rules.md` — Règles côté joueur *(optionnel : repli sur celles du module par défaut)*
- `adventures/<id>/dm-rules.md` — Tables de monstres, règles de combat *(optionnel : repli sur le module par défaut)*
- `adventures/<id>/map.ts` — Données typées (salles, rencontres, PNJ, hooks, `startCell`, joueur initial)

Deux modules livrés : `grammys-country-apple-pie` (par défaut) et `tide-crypt`.
Voir [« Ajouter un module d'aventure »](#ajouter-un-module-daventure) plus bas.

## Lancement

```bash
npm run build:mcp   # compile le serveur MCP (une seule fois)
npm run dev         # lance Next.js + MCP server en parallèle
```

Ouvrez http://localhost:3000

## Tools MCP disponibles

Le serveur MCP valide les règles critiques avant de muter l'état : tour courant en combat, entités vivantes, portée d'attaque, occupation des cases, budget de déplacement par tour et conditions de fin de combat.

| Tool | Description |
|------|-------------|
| `get_game_state` | État complet du jeu |
| `move_token` | Déplace un token sur la grille |
| `update_hp` | Modifie les HP d'une entité |
| `get_entity_stats` | Stats complètes d'une entité |
| `roll_dice` | Lance des dés (notation XdY+Z) |
| `resolve_attack` | Attaque complète (to-hit + dégâts + HP) |
| `resolve_saving_throw` | Jet de sauvegarde |
| `apply_condition` | Applique une condition D&D 5e |
| `enter_combat` | Lance le combat avec initiative |
| `start_encounter` | Déplace le joueur si besoin, spawn les monstres et lance le combat en une seule opération |
| `next_turn` | Passe au combattant suivant |
| `end_combat` | Termine le combat, distribue XP |
| `spawn_monster` | Fait apparaître un monstre |
| `trigger_room_event` | Déclenche un événement de salle |
| `add_to_log` | Ajoute une entrée au journal |

## Monstres disponibles

`goblin_minion`, `goblin`, `goblin_boss`, `hobgoblin`, `hobgoblin_captain`, `skeleton`, `zombie`, `violet_fungus`, `wolf`, `bandit`, `dryad`, `awakened_tree`

---

## Déploiement — Railway

> ⚠️ **Vercel / Netlify non compatibles** — le serveur MCP tourne comme processus enfant persistant (stdio), incompatible avec les fonctions serverless.

### Architecture de déploiement

```
GitHub repo
    │
    ├── Push sur master
    │       │
    │       ├── GitHub Actions CI → type-check + tests + build
    │       │
    │       └── Auto-deploy → Railway (service Node + Postgres)
    │
    └── Serveur persistant Node.js
            ├── Next.js (app + API routes)
            ├── MCP server (processus enfant, spawné par l'API)
            └── Postgres (auth, sessions de jeu, crédits)
```

### Mise en place

1. [railway.app](https://railway.app) → New Project → **Deploy from GitHub repo** (le `Dockerfile` est détecté, sinon build Nixpacks : `npm ci && npm run build` / `npm start`).
2. Ajouter un service **PostgreSQL** au projet, puis référencer sa variable dans le service web : `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
3. Renseigner les variables du service web :

```
ANTHROPIC_API_KEY   = sk-ant-...          # clé réelle
DATABASE_URL        = ${{Postgres.DATABASE_URL}}
AUTH_SECRET         = <npx auth secret>
AUTH_URL            = https://<votre-domaine-railway>
AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET       # OAuth Google
AUTH_GITHUB_ID / AUTH_GITHUB_SECRET       # OAuth GitHub
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET # paiements (optionnel au début)
LLM_MODE            = live
NARRATION_MODE      = quality
```

4. Premier déploiement : le schéma Postgres s'applique automatiquement au premier accès (ou `railway run npm run db:migrate`).
5. Sécurité par défaut en production : `/api/debug/logs` exige un Bearer token (`APP_DEBUG_LOG_TOKEN`), les logs ne sont pas persistés sur disque, le rate-limit et le plafond journalier sont actifs (`DM_RATE_LIMIT_PER_MINUTE`, `DM_DAILY_GLOBAL_MESSAGE_LIMIT`).

---

### CI — GitHub Actions

Le workflow `.github/workflows/ci.yml` se déclenche sur chaque push et PR :

| Étape | Description |
|-------|-------------|
| `tsc -p mcp-server/tsconfig.json --noEmit` | Type-check strict du serveur MCP |
| `npm run build:mcp` | Compile le serveur MCP |
| `tsc --noEmit` | Type-check Next.js |
| `next build` | Build de production complet |

Aucune clé Anthropic réelle n'est nécessaire pour le CI — une clé placeholder est utilisée (la clé n'est pas lue au build time).

---

### Note sur la persistance d'état

Chaque onglet de navigateur possède son propre `sessionId`. L'état de jeu, l'historique et le résumé de session sont persistés côté serveur dans `.data/sessions/` par défaut, avec possibilité de changer l'emplacement via :

```
GAME_SESSION_STORE_DIR=/chemin/vers/sessions
```

Cette persistance fichier permet de reprendre une partie apres redemarrage du processus Node tant que le stockage local est conserve. **Sur un deploiement multi-instance ou avec disque ephemere, definissez `DATABASE_URL`** : les sessions de jeu (ainsi que l'auth et les credits) basculent alors sur Postgres — voir la section « Base de données » plus haut.

### Logs de production

L'application emet des logs structures JSON sur stdout/stderr avec le prefixe `[ai-dm:<event>]`. L'hebergeur les capture normalement dans les logs runtime du service.

Variables utiles :

```env
APP_LOG_LEVEL=debug
APP_LOG_INCLUDE_TEXT=true
APP_LOG_STRING_LIMIT=800
APP_LOG_ARRAY_LIMIT=30
APP_LOG_OBJECT_KEY_LIMIT=80
APP_LOG_BUFFER_ENABLED=true
APP_LOG_BUFFER_LIMIT=1000
APP_LOG_PERSIST_ENABLED=true
APP_LOG_PERSIST_DIR=/tmp/ai-dm/logs
APP_LOG_PERSIST_MAX_BYTES=20000000
APP_DEBUG_LOG_PUBLIC_READ=true
```

En debug live, les textes narratifs/messages joueur sont inclus par defaut pour faciliter la correlation avec le chat. Remettez `APP_LOG_INCLUDE_TEXT=false` apres la session si vous voulez masquer les textes et ne garder que les longueurs.

Les logs sont conserves a trois niveaux :

- stdout/stderr hebergeur, avec le prefixe `[ai-dm:<event>]`
- buffer memoire rapide, utile pendant que le process tourne
- fichier JSONL local (`.data/logs/server.jsonl` en local, ou le chemin `APP_LOG_PERSIST_DIR` configure par l'hebergeur)

Sans aucune configuration hebergeur/GitHub supplementaire, le navigateur garde aussi une boite noire de playtest dans `localStorage` et la republie au serveur via `/api/debug/client-logs`. Les entrees recentes restent dans le navigateur meme apres une sync reussie, afin qu'un simple refresh puisse les republier si l'hebergeur a perdu le buffer serveur. Apres un redeploiement, il suffit de rafraichir ou de rejouer depuis le meme navigateur pour revoir les dernieres actions sous l'evenement `client.blackbox.entry` dans `/api/debug/logs`.

En production, la persistance fichier des logs est coupee par defaut (stdout est capture par Railway) ; la boite noire navigateur aide a republier les derniers tours apres refresh/redeploy.

Lecture via hebergeur : utilisez l'onglet Logs (Observability) du service Railway.

Lecture via endpoint HTTP protege :

```bash
# Exemple: configurez APP_DEBUG_LOG_TOKEN dans l'hebergeur.

curl -H "Authorization: Bearer un-token-long-aleatoire" \
  "https://votre-app.example.com/api/debug/logs?limit=100"

curl -H "Authorization: Bearer un-token-long-aleatoire" \
  "https://votre-app.example.com/api/debug/logs?event=dm.request"

curl -X DELETE -H "Authorization: Bearer un-token-long-aleatoire" \
  "https://votre-app.example.com/api/debug/logs"
```

L'endpoint `GET /api/debug/logs` retourne les logs persistants si le fichier JSONL existe, sinon les logs recents gardes en memoire par le process Node. Pendant le debug live, la lecture est publique par defaut pour permettre une surveillance externe sans acces hebergeur; remettez `APP_DEBUG_LOG_PUBLIC_READ=false` ou retirez ce mode apres la session. `DELETE /api/debug/logs` reste protege par `APP_DEBUG_LOG_TOKEN` et efface a la fois le buffer memoire et le fichier JSONL local. Utilisez de preference le header `Authorization: Bearer ...`. Le parametre `?token=` est desactive par defaut; activez-le seulement pour depannage manuel avec `APP_DEBUG_LOG_TOKEN_QUERY_ENABLED=true`, car il peut fuiter dans des historiques navigateur/proxy.

Les logs incluent notamment `requestId`, `sessionId`, appels Anthropic, usage tokens/cout estime, appels MCP, erreurs de regles, resume compact du `GameState`, persistance session et durees. Les valeurs ressemblant a des secrets/tokens sont masquees automatiquement.

Chaque tour DM produit aussi un `TurnTrace` canonique sous l'evenement `dm.turn.trace`. Il regroupe l'input brut, l'intent, l'actionPlan, la resolution de cible, les appels d'outils executes ou bloques, les `EngineEvent`, le diff monde, les reactions ennemies derivees, les facts narratifs detectes, les contradictions restantes et la narration finale. Pour ne lire que ces traces :

```bash
curl "https://votre-app.example.com/api/debug/logs?traces=true&limit=100"
curl "https://votre-app.example.com/api/debug/logs?traces=true&sessionId=ma-session&limit=100"
```

Pour transformer des logs ou traces exportees en regression locale :

```bash
node scripts/replay-session-log.cjs --input logs.json --output tests/fixtures/ma-session-regression.json
node scripts/replay-session-log.cjs --input logs.jsonl --playtest --mode mock --narration-mode quality
```
