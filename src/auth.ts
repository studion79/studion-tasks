import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import {
  SUPER_ADMIN_FAKE_ID,
  getSuperAdminUsername,
  hasSuperAdminPasswordConfigured,
  isSuperAdminIdentifier,
  isSuperAdminUserId,
} from "@/lib/super-admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      // Keep existing edge-safe behavior from authConfig first.
      const baseToken = (authConfig.callbacks?.jwt
        ? await authConfig.callbacks.jwt(params as never)
        : params.token) ?? params.token;
      if (!baseToken) return params.token;
      const tokenWithFlags = baseToken as typeof params.token & { isSuperAdmin?: boolean };
      if (params.user && isSuperAdminUserId(params.user.id)) {
        tokenWithFlags.isSuperAdmin = true;
      }
      return tokenWithFlags;
    },
    async session(params) {
      // Start from existing session callback behavior (it sets user.id).
      const baseSession = authConfig.callbacks?.session
        ? await authConfig.callbacks.session(params as never)
        : params.session;

      const userId = params.token?.id as string | undefined;
      if (!userId) return baseSession;
      if (!baseSession.user) return baseSession;
      const sessionUser = baseSession.user as typeof baseSession.user & { isSuperAdmin?: boolean };
      if (params.token?.isSuperAdmin) {
        sessionUser.isSuperAdmin = true;
      }

      if (isSuperAdminUserId(userId)) {
        sessionUser.name = "Admin";
        sessionUser.email = getSuperAdminUsername();
        sessionUser.image = null;
        return baseSession;
      }

      // Refresh profile fields from DB so avatar/name updates are visible after refresh.
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, avatar: true },
      });
      if (!dbUser) return baseSession;

      sessionUser.name = dbUser.name;
      sessionUser.email = dbUser.email;
      sessionUser.image = dbUser.avatar;
      return baseSession;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Identifier", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const identifier = String(credentials?.email ?? "").trim();
        const password = String(credentials?.password ?? "");
        if (!identifier || !password) return null;

        if (isSuperAdminIdentifier(identifier)) {
          if (!hasSuperAdminPasswordConfigured()) return null;
          let valid = false;
          if (process.env.SUPERADMIN_PASSWORD_HASH) {
            valid = await bcrypt.compare(password, process.env.SUPERADMIN_PASSWORD_HASH);
          } else if (process.env.SUPERADMIN_PASSWORD) {
            valid = password === process.env.SUPERADMIN_PASSWORD;
          }
          if (!valid) return null;
          return {
            id: SUPER_ADMIN_FAKE_ID,
            email: getSuperAdminUsername(),
            name: "Admin",
            image: null,
          };
        }

        const user = await prisma.user.findUnique({
          where: { email: identifier.toLowerCase() },
        });
        if (!user) return null;
        if (!user.emailVerifiedAt) return null;
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.avatar };
      },
    }),
  ],
});
