"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./_helpers";
import { formatUserDisplayName } from "@/lib/name-format";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { pickByIsEn } from "@/lib/i18n/pick";
import type { AppLocale } from "@/i18n/config";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function registerUser(
  email: string,
  name: string,
  password: string,
  inviteToken?: string,
  locale: AppLocale = "fr"
) {
  const normalizedName = formatUserDisplayName(name);
  const isEn = locale === "en";
  const normalizedEmail = email.toLowerCase().trim();
  if (!isValidEmail(normalizedEmail) || !normalizedName || password.length < 6) {
    throw new Error(pickByIsEn(isEn, "Données invalides.", "Invalid data."));
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, emailVerifiedAt: true },
  });
  if (existing?.emailVerifiedAt) {
    throw new Error(pickByIsEn(isEn, "Un compte existe déjà avec cet email.", "An account already exists with this email."));
  }

  const hash = await bcrypt.hash(password, 10);
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name: normalizedName, password: hash },
      })
    : await prisma.user.create({
        data: { email: normalizedEmail, name: normalizedName, password: hash, emailVerifiedAt: null },
      });

  try {
    await createEmailVerificationToken({
      userId: user.id,
      email: normalizedEmail,
      name: normalizedName,
      inviteToken,
      locale,
    });
  } catch (error) {
    if (!existing) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
    console.error("[auth] email verification send failed", error);
    throw new Error(pickByIsEn(isEn, "Impossible d'envoyer l'email de confirmation.", "Unable to send the confirmation email."));
  }

  redirect("/login?verification=sent");
}
