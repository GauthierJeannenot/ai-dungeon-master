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

Placez votre image dans `/public/battlemap.jpg`. En l'absence du fichier, un fond sombre est affiché.

### 3. Fichiers de contexte (optionnel)

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
```

`APP_LOG_LEVEL=debug` est deja la valeur par defaut en `NODE_ENV=production`. Passez `APP_LOG_INCLUDE_TEXT=false` si vous voulez masquer les textes narratifs/messages joueur et ne garder que les longueurs.

Lecture via Railway CLI :

```bash
railway logs
railway logs | grep 'ai-dm:dm.request'
railway logs | grep 'dm-'
railway logs | grep 'mcp.tool'
```

Les logs incluent notamment `requestId`, `sessionId`, appels Anthropic, usage tokens/cout estime, appels MCP, erreurs de regles, resume compact du `GameState`, persistance session et durees. Les valeurs ressemblant a des secrets/tokens sont masquees automatiquement.
