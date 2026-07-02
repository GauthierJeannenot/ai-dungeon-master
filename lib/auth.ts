import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github'
import PostgresAdapter from '@auth/pg-adapter'
import { isDatabaseEnabled, getAuthDbClient } from './db'

// Auth.js (NextAuth v5) — OAuth 2.0. Deux modes selon DATABASE_URL :
//   - présente → utilisateurs/comptes/sessions persistés en Postgres
//     (@auth/pg-adapter, stratégie "database"). Mode production recommandé.
//   - absente  → sessions JWT sans base (cookie signé par AUTH_SECRET),
//     comme le POC d'origine. Pratique en dev.
//
// Variables d'environnement attendues (voir .env.example) :
//   AUTH_SECRET          — `npx auth secret` pour en générer un
//   AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET  — OAuth Google Cloud Console
//   AUTH_GITHUB_ID / AUTH_GITHUB_SECRET  — OAuth GitHub Developer Settings
//   DATABASE_URL         — active la persistance Postgres
//
// session.userId (clé du solde de tokens) :
//   - mode Postgres → users.id (stable, indépendant du provider)
//   - mode JWT      → `provider:providerAccountId`
// ⚠️ Basculer d'un mode à l'autre change les clés : les soldes du mode JWT ne
// suivent pas automatiquement (voir scripts/db-import-file-stores.cjs).

declare module 'next-auth' {
  interface Session {
    userId: string
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Railway termine le TLS en amont — on fait confiance à l'hôte proxy.
  trustHost: true,
  ...(isDatabaseEnabled()
    ? {
        adapter: PostgresAdapter(getAuthDbClient()),
        session: { strategy: 'database' as const },
      }
    : {
        session: { strategy: 'jwt' as const },
      }),
  providers: [Google, GitHub],
  callbacks: {
    jwt({ token, account }) {
      // Mode JWT uniquement : fige l'identifiant stable au premier sign-in.
      if (account) {
        token.userId = `${account.provider}:${account.providerAccountId}`
      }
      return token
    },
    session({ session, token, user }) {
      // Stratégie "database" → `user` vient de la table users ; "jwt" → token.
      if (user?.id != null) {
        session.userId = String(user.id)
      } else if (typeof token?.userId === 'string') {
        session.userId = token.userId
      } else {
        session.userId = `jwt:${token?.sub}`
      }
      return session
    },
  },
})
