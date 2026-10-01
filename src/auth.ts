import type { NextAuthOptions, DefaultSession } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { getServerSession } from "next-auth";
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export type { Session } from "next-auth";

// ── Type Augmentation ──────────────────────────────────────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: {
    // JWT strategy required for Edge middleware compatibility
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    /**
     * On first sign-in, PrismaAdapter creates the User + Account rows.
     * We copy the PostgreSQL User.id into the JWT so it's available everywhere.
     */
    async jwt({ token, user }) {
      if (user?.id) {
        // First login: user object has the newly created/found PG user id
        token.userId = user.id;
      }

      // Fallback: if token.userId is somehow absent (e.g. token pre-migration),
      // look up by email to get the current PG UUID.
      if (!token.userId && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true },
        });
        if (dbUser) token.userId = dbUser.id;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        // Always use the PostgreSQL UUID from the JWT, never a client-supplied value
        // Never fall back to Google's subject (`token.sub`): library ownership
        // must always use the PostgreSQL User.id.
        session.user.id = token.userId ?? "";
      }
      return session;
    },
  },
};

/**
 * Server-side session helper.
 * Returns null if the user is not authenticated.
 */
export async function auth() {
  return getServerSession(authOptions);
}

export default NextAuth(authOptions);
