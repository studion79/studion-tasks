"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./_helpers";

export async function registerUser(
  email: string,
  name: string,
  password: string,
  inviteToken?: string
) {
  if (!email.trim() || !name.trim() || password.length < 6) {
    throw new Error("Données invalides");
  }
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new Error("Un compte existe déjà avec cet email");
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, name: name.trim(), password: hash },
  });

  // Si un token d'invitation est fourni, on accepte automatiquement
  if (inviteToken) {
    const invitation = await prisma.projectInvitation.findUnique({
      where: { token: inviteToken },
    });
    if (invitation && !invitation.acceptedAt && invitation.expiresAt > new Date()) {
      await prisma.projectMember.create({
        data: { projectId: invitation.projectId, userId: user.id, role: invitation.role },
      });
      await prisma.projectInvitation.update({
        where: { token: inviteToken },
        data: { acceptedAt: new Date() },
      });
      redirect(`/projects/${invitation.projectId}`);
    }
  }

  redirect("/login?registered=1");
}
