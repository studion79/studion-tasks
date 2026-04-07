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
      const isAuthPage =
        nextUrl.pathname === "/login" ||
        nextUrl.pathname === "/register" ||
        /^\/(fr|en)\/(login|register)$/.test(nextUrl.pathname);
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
