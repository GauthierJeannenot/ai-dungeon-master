import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github'
import PostgresAdapter from '@auth/pg-adapter'
import { getAuthDbClient } from './db'

// Auth.js (NextAuth v5) — OAuth 2.0, persistance Postgres unique.
// Utilisateurs/comptes/sessions vivent dans les tables Auth.js
// (@auth/pg-adapter, stratégie "database"). DATABASE_URL est requise (voir
// lib/config-check.ts : fatal en production sans elle).
//
// Variables d'environnement attendues (voir .env.example) :
//   AUTH_SECRET          — `npx auth secret` pour en générer un
//   AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET  — OAuth Google Cloud Console
//   AUTH_GITHUB_ID / AUTH_GITHUB_SECRET  — OAuth GitHub Developer Settings
//   DATABASE_URL         — Postgres (obligatoire)
//
// session.userId = users.id (clé stable du solde de tokens, indépendante du
// provider OAuth).

declare module 'next-auth' {
  interface Session {
    userId: string
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Railway termine le TLS en amont — on fait confiance à l'hôte proxy.
  trustHost: true,
  adapter: PostgresAdapter(getAuthDbClient()),
  session: { strategy: 'database' },
  providers: [Google, GitHub],
  callbacks: {
    session({ session, user }) {
      // Stratégie "database" → `user` vient de la table users.
      session.userId = String(user.id)
      return session
    },
  },
})
