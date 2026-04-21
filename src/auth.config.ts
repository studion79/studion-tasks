import type { NextAuthConfig } from "next-auth";

// Edge-compatible config (no Prisma, no bcrypt)
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicHealthApi =
        nextUrl.pathname === "/api/health" || nextUrl.pathname === "/api/health/live";
      const isAuthPage =
        nextUrl.pathname === "/login" ||
        nextUrl.pathname === "/register" ||
        nextUrl.pathname === "/verify-email" ||
        /^\/(fr|en)\/(login|register|verify-email)$/.test(nextUrl.pathname);
      if (isPublicHealthApi) return true;
      if (isAuthPage) return true;
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
  providers: [], // Providers added in auth.ts
};
