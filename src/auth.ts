import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/user";

export type { Session } from "next-auth";

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

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: googleClientId || "",
      clientSecret: googleClientSecret || "",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        await connectDB();
        const userEmail = user.email?.toLowerCase();

        if (!userEmail) {
          return token;
        }

        const existingUser = await User.findOne({ email: userEmail });

        if (!existingUser) {
          const createdUser = await User.create({
            name: user.name,
            email: userEmail,
            image: user.image,
          });

          token.userId = String(createdUser._id);
        } else {
          token.userId = String(existingUser._id);
        }
      }

      if (!token.userId && token.email) {
        await connectDB();
        const existingUser = await User.findOne({ email: token.email.toLowerCase() });

        if (existingUser) {
          token.userId = String(existingUser._id);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string | "";
        session.user.name = session.user.name || "Teacher";
        session.user.email = session.user.email || "";
        session.user.image = session.user.image || null;
      }

      return session;
    },
  },
};

export async function auth() {
  return getServerSession(authOptions);
}

export default NextAuth(authOptions);
