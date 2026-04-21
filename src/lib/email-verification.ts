import { createHash, randomBytes } from "crypto";
import type { AppLocale } from "@/i18n/config";
import { prisma } from "@/lib/db";
import { emailVerificationHtml, sendMail } from "@/lib/mailer";
import { pickByIsEn } from "@/lib/i18n/pick";
import { ensurePersonalProjectForUser } from "@/lib/actions/projects";

const TOKEN_TTL_HOURS = 24;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getBaseUrl(): string {
  const configured = process.env.NEXTAUTH_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "http://localhost:3000";
}

function buildVerificationUrl(token: string, locale: AppLocale): string {
  const langPrefix = locale === "en" ? "/en" : "";
  return `${getBaseUrl()}${langPrefix}/verify-email?token=${encodeURIComponent(token)}`;
}

export async function createEmailVerificationToken({
  userId,
  email,
  name,
  inviteToken,
  locale,
}: {
  userId: string;
  email: string;
  name: string;
  inviteToken?: string;
  locale: AppLocale;
}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.deleteMany({
    where: { userId, usedAt: null },
  });
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      inviteToken: inviteToken || null,
      expiresAt,
    },
  });

  const isEn = locale === "en";
  const verifyUrl = buildVerificationUrl(token, locale);
  await sendMail({
    to: email,
    subject: pickByIsEn(isEn, "Confirmez votre adresse email", "Confirm your email address"),
    html: emailVerificationHtml({ locale, name, verifyUrl }),
    text: [
      pickByIsEn(isEn, `Bonjour ${name},`, `Hi ${name},`),
      "",
      pickByIsEn(
        isEn,
        "Confirmez votre adresse email pour finaliser la création de votre compte Task App :",
        "Confirm your email address to finish creating your Task App account:"
      ),
      verifyUrl,
      "",
      pickByIsEn(
        isEn,
        "Ce lien est valable 24 heures. Si vous n'avez pas demandé la création de ce compte, ignorez cet email.",
        "This link is valid for 24 hours. If you did not request this account, ignore this email."
      ),
    ].join("\n"),
  });
}

export async function verifyEmailToken(token: string): Promise<{
  ok: boolean;
  reason?: "missing" | "invalid" | "expired";
  nextPath?: string;
}> {
  const cleanToken = token.trim();
  if (!cleanToken) return { ok: false, reason: "missing" };

  const tokenRow = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(cleanToken) },
    include: { user: { select: { id: true, email: true, emailVerifiedAt: true } } },
  });

  if (!tokenRow || tokenRow.usedAt) return { ok: false, reason: "invalid" };
  if (tokenRow.expiresAt < new Date()) return { ok: false, reason: "expired" };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: tokenRow.userId },
      data: { emailVerifiedAt: tokenRow.user.emailVerifiedAt ?? new Date() },
    });
    await tx.emailVerificationToken.update({
      where: { id: tokenRow.id },
      data: { usedAt: new Date() },
    });
  });

  await ensurePersonalProjectForUser(tokenRow.userId);

  let nextPath = "/";
  if (tokenRow.inviteToken) {
    const invitation = await prisma.projectInvitation.findUnique({
      where: { token: tokenRow.inviteToken },
      include: { project: { select: { isPersonal: true } } },
    });
    if (
      invitation &&
      !invitation.acceptedAt &&
      invitation.expiresAt > new Date() &&
      !invitation.project.isPersonal &&
      invitation.email.toLowerCase() === tokenRow.user.email.toLowerCase()
    ) {
      const existingMember = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: invitation.projectId,
            userId: tokenRow.userId,
          },
        },
      });
      if (!existingMember) {
        await prisma.projectMember.create({
          data: {
            projectId: invitation.projectId,
            userId: tokenRow.userId,
            role: invitation.role,
          },
        });
      }
      await prisma.projectInvitation.update({
        where: { token: tokenRow.inviteToken },
        data: { acceptedAt: new Date() },
      });
      nextPath = `/projects/${invitation.projectId}`;
    }
  }

  return { ok: true, nextPath };
}
