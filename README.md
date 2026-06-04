# AI Dungeon Master

Application web de jeu de rôle D&D 5e avec un Dungeon Master IA (Claude) comme narrateur et arbitre de règles. Interface battlemap interactive avec chat latéral. Un serveur MCP TypeScript gère tous les calculs mécaniques.

## Stack

- **Frontend** : Next.js 16, TypeScript, Tailwind CSS
- **IA** : Anthropic SDK avec `claude-haiku-4-5`
- **MCP** : `@modelcontextprotocol/sdk` — game engine déterministe

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

### 2. Battlemap (optionnel)

Placez votre image dans `/public/battlemap.png`. En l'absence du fichier, un fond sombre est affiché.

### 3. Cout LLM et tests sans appels payants

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
| `LLM_REPLAY_FALLBACK_TO_MOCK=true` | En replay, bascule sur le mock si une cassette manque |
| `LLM_MAX_CALLS_PER_REQUEST=10` | Coupe une requete trop bavarde |
| `LLM_MAX_CALLS_PER_SESSION=0` | Budget live par session (`0` = illimite) |
| `LLM_PROMPT_CACHE_ENABLED=true` | Active les breakpoints de prompt caching Anthropic |
| `LLM_PROMPT_CACHE_TTL=5m` | TTL du cache prompt (`5m` par defaut, `1h` possible pour longs playtests) |
| `LLM_MODULE_CONTEXT_MAX_CHARS=6500` | Limite le contexte du module envoye au LLM |
| `LLM_FINAL_NARRATION_MAX_TOKENS=180` | Plafond de sortie pour les narrations finales breves |

En mode live, la route DM reduit aussi le cout sans passer en mock :

- actions evidentes de combat/deplacement par coordonnees/passage de tour resolues cote moteur avant Anthropic
- tools MCP filtres selon la phase et l'intention au lieu d'envoyer tous les schemas a chaque appel
- director local pour narrer les mutations mecaniques simples sans appel final a Claude
- memoire de scene compacte dans `gameState.sceneMemory` pour porter les consequences sans repayer tout l'historique
- prompt caching sur les blocs systeme statiques et les schemas tools selectionnes
- mini budget visible en jeu: cout partie/tour, appels LLM, cache lu/ecrit et source narrative
- narration finale avec prompt court specialise et reponses visees a 1-2 phrases
- correction serveur directe des narrations qui contredisent l'etat moteur, sans retry LLM supplementaire

### 4. Fichiers de contexte (optionnel)

Les quatre fichiers dans `/context/` sont pré-remplis avec une aventure complète :

- `context/player-character.md` — Fiche, stats, équipement et historique du joueur
- `context/player-rules.md` — Règles et capacités côté joueur
- `context/dm-rules.md` — Tables de monstres, règles de combat
- `context/adventure-module.md` — Carte des salles, monstres, trésors, triggers

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

## Déploiement (free tier)

> ⚠️ **Vercel / Netlify non compatibles** — le serveur MCP tourne comme processus enfant persistant (stdio), incompatible avec les fonctions serverless.

### Architecture de déploiement

```
GitHub repo
    │
    ├── Push sur main
    │       │
    │       ├── GitHub Actions CI → type-check + build
    │       │
    │       └── Auto-deploy → Railway ou Render
    │
    └── Serveur persistant Node.js
            ├── Next.js (app + API routes)
            └── MCP server (processus enfant, spawné par l'API)
```

---

### Option A — Railway (recommandé)

**Avantages** : pas de mise en veille, meilleure DX, `railway.json` inclus  
**Coût** : $5 de crédits gratuits à l'inscription (≈ 2-3 mois pour un petit projet)

#### 1. Créer le projet Railway

```bash
# Installer Railway CLI
npm install -g @railway/cli

# Se connecter
railway login

# Lier le repo courant à un projet Railway (crée le projet si besoin)
railway init
```

#### 2. Configurer les variables d'environnement

```bash
railway variables set ANTHROPIC_API_KEY=sk-ant-ta-vraie-cle
railway variables set NODE_ENV=production
```

#### 3. Premier déploiement

```bash
railway up
```

#### 4. Activer l'auto-deploy GitHub

Dans le dashboard Railway → ton projet → **Settings → Source** → connecte ton repo GitHub → branche `main`.

À partir de là, chaque `git push origin main` déclenche un redéploiement automatique.

#### 5. Activer le déploiement via GitHub Actions (optionnel)

Si tu veux un pipeline CI qui valide avant de déployer :

1. Dans Railway → Settings → Tokens → **Create token**
2. Dans GitHub → Settings → Secrets → `RAILWAY_TOKEN` → colle le token
3. Le workflow `.github/workflows/deploy-railway.yml` se déclenche automatiquement sur push main

---

### Option B — Render (gratuit permanent)

**Avantages** : free tier sans limite de temps (750h/mois)  
**Inconvénient** : mise en veille après 15 min d'inactivité (cold start ~30 sec)

#### 1. Créer le service

1. Ouvre [render.com](https://render.com) → New → **Web Service**
2. Connecte ton repo GitHub
3. Render détecte automatiquement `render.yaml` → configuration appliquée

#### 2. Variables d'environnement

Dans le dashboard Render → ton service → **Environment** :
```
ANTHROPIC_API_KEY = sk-ant-ta-vraie-cle
```

#### 3. Auto-deploy

Activé par défaut (`autoDeploy: true` dans `render.yaml`). Chaque push sur la branche configurée redéploie.

---

### Option C — Koyeb (free tier permanent, sans mise en veille)

**Avantages** : 2 instances gratuites permanentes, pas de mise en veille  
**Coût** : gratuit

1. Ouvre [koyeb.com](https://koyeb.com) → Create App → **GitHub**
2. Sélectionne ton repo
3. Build command : `npm ci && npm run build`
4. Start command : `npm start`
5. Port : `3000`
6. Variables : `ANTHROPIC_API_KEY`, `NODE_ENV=production`

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

Cette persistance fichier permet de reprendre une partie apres redemarrage du processus Node tant que le stockage local est conserve. Sur un deploiement multi-instance ou avec disque ephemere, migrez cette interface vers Redis, Postgres ou un stockage equivalent.

### Logs de production Railway

L'application emet des logs structures JSON sur stdout/stderr avec le prefixe `[ai-dm:<event>]`. Railway les capture automatiquement dans les logs runtime du service.

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
APP_LOG_PERSIST_MAX_BYTES=20000000
APP_DEBUG_LOG_PUBLIC_READ=true
```

En debug live, les textes narratifs/messages joueur sont inclus par defaut pour faciliter la correlation avec le chat. Remettez `APP_LOG_INCLUDE_TEXT=false` apres la session si vous voulez masquer les textes et ne garder que les longueurs.

Les logs sont conserves a trois niveaux :

- stdout/stderr Railway, avec le prefixe `[ai-dm:<event>]`
- buffer memoire rapide, utile pendant que le process tourne
- fichier JSONL local (`.data/logs/server.jsonl` en local, `/data/ai-dungeon-master/logs/server.jsonl` si un volume Railway est deja monte sur `/data`)

Sans aucune configuration Railway/GitHub supplementaire, le navigateur garde aussi une boite noire de playtest dans `localStorage` et la republie au serveur via `/api/debug/client-logs`. Apres un redeploiement, il suffit de rafraichir ou de rejouer depuis le meme navigateur pour revoir les dernieres actions sous l'evenement `client.blackbox.entry` dans `/api/debug/logs`.

Si vous avez deja un volume Railway monte ailleurs que `/data`, `APP_LOG_PERSIST_DIR=/chemin/du/volume` permet de forcer le repertoire. Ce n'est pas requis pour la boite noire navigateur.

Lecture via Railway CLI :

```bash
railway logs
railway logs | grep 'ai-dm:dm.request'
railway logs | grep 'dm-'
railway logs | grep 'mcp.tool'
```

Lecture via endpoint HTTP protege :

```bash
railway variables set APP_DEBUG_LOG_TOKEN=un-token-long-aleatoire

curl -H "Authorization: Bearer un-token-long-aleatoire" \
  "https://votre-app.railway.app/api/debug/logs?limit=100"

curl -H "Authorization: Bearer un-token-long-aleatoire" \
  "https://votre-app.railway.app/api/debug/logs?event=dm.request"

curl -X DELETE -H "Authorization: Bearer un-token-long-aleatoire" \
  "https://votre-app.railway.app/api/debug/logs"
```

L'endpoint `GET /api/debug/logs` retourne les logs persistants si le fichier JSONL existe, sinon les logs recents gardes en memoire par le process Node. Pendant le debug live, la lecture est publique par defaut pour permettre une surveillance externe sans acces Railway; remettez `APP_DEBUG_LOG_PUBLIC_READ=false` ou retirez ce mode apres la session. `DELETE /api/debug/logs` reste protege par `APP_DEBUG_LOG_TOKEN` et efface a la fois le buffer memoire et le fichier JSONL local. Utilisez de preference le header `Authorization: Bearer ...`. Le parametre `?token=` est desactive par defaut; activez-le seulement pour depannage manuel avec `APP_DEBUG_LOG_TOKEN_QUERY_ENABLED=true`, car il peut fuiter dans des historiques navigateur/proxy.

Les logs incluent notamment `requestId`, `sessionId`, appels Anthropic, usage tokens/cout estime, appels MCP, erreurs de regles, resume compact du `GameState`, persistance session et durees. Les valeurs ressemblant a des secrets/tokens sont masquees automatiquement.
