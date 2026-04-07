"use server";

import {
  revalidatePath,
  prisma,
  requireAdmin,
  requireMember,
  notifyUser,
  emitProjectChanged,
  emitAdminDataChanged,
} from "./_helpers";
import { sendMail, invitationEmailHtml } from "@/lib/mailer";
import { isSuperAdminUserId } from "@/lib/super-admin";
import { getUserLocale } from "@/lib/i18n/server";

export async function getProjectMembers(projectId: string) {
  await requireMember(projectId);
  return prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function inviteMember(
  projectId: string,
  email: string,
  inviterName = "A team member"
) {
  const inviterUserId = await requireMember(projectId);
  const normalizedEmail = email.toLowerCase().trim();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, isPersonal: true },
  });
  if (!project) throw new Error("Project not found.");
  if (project.isPersonal) {
    throw new Error("FORBIDDEN_INVITE_PERSONAL_PROJECT");
  }

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existingUser) {
    // Déjà membre ?
    const existingMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: existingUser.id } },
    });
    if (existingMember) throw new Error("This user is already a project member.");

    // Invitation déjà envoyée ?
    const existingInvitation = await prisma.projectInvitation.findUnique({
      where: { projectId_email: { projectId, email: normalizedEmail } },
    });
    if (existingInvitation && !existingInvitation.acceptedAt) {
      throw new Error("An invitation is already pending for this email.");
    }
    // Recréer l'invitation si elle a déjà été acceptée ou expirée
    if (existingInvitation) {
      await prisma.projectInvitation.delete({
        where: { projectId_email: { projectId, email: normalizedEmail } },
      });
    }
  } else {
    // Pas de compte : vérifier invitation en attente
    const existingInvitation = await prisma.projectInvitation.findUnique({
      where: { projectId_email: { projectId, email: normalizedEmail } },
    });
    if (existingInvitation && !existingInvitation.acceptedAt) {
      throw new Error("An invitation is already pending for this email.");
    }
    if (existingInvitation) {
      await prisma.projectInvitation.delete({
        where: { projectId_email: { projectId, email: normalizedEmail } },
      });
    }
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours
  const invitation = await prisma.projectInvitation.create({
    data: { projectId, email: normalizedEmail, expiresAt },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/invite/${invitation.token}`;
  const invitationLocale = existingUser
    ? await getUserLocale(existingUser.id)
    : await getUserLocale(inviterUserId);
  const inviterLabel = invitationLocale === "en"
    ? "A team member"
    : inviterName;
  const inviteSubject = invitationLocale === "en"
    ? `Invitation to join "${project.name}"`
    : `Invitation à rejoindre « ${project.name} »`;
  const inviteText = invitationLocale === "en"
    ? `${inviterLabel} invited you to join project "${project.name}".\n\nOpen invitation: ${inviteUrl}\n\nThis link is valid for 7 days.`
    : `${inviterName} vous invite à rejoindre le projet « ${project.name} ».\n\nAccédez à l'invitation : ${inviteUrl}\n\nCe lien est valable 7 jours.`;

  // L'envoi d'email est non-fatal : l'invitation est créée même si le mail échoue
  try {
    await sendMail({
      to: normalizedEmail,
      subject: inviteSubject,
      html: invitationEmailHtml({
        locale: invitationLocale,
        projectName: project.name,
        inviterName,
        inviteUrl,
        hasAccount: !!existingUser,
      }),
      text: inviteText,
    });
  } catch (mailError) {
    console.error("Invitation email sending failed (invitation still created):", mailError);
  }

  // Si l'utilisateur a déjà un compte : lui envoyer aussi une notification in-app
  if (existingUser) {
    const memberLocale = await getUserLocale(existingUser.id);
    const invitationNotif = memberLocale === "en"
      ? `${inviterName} invited you to join project "${project.name}"`
      : `${inviterName} vous invite à rejoindre le projet « ${project.name} »`;
    await notifyUser(
      existingUser.id,
      "INVITATION",
      invitationNotif,
      undefined,
      projectId
    );
  }
  emitProjectChanged(projectId);
  emitAdminDataChanged();
  return invitation;
}

export async function getPendingInvitations(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  return prisma.projectInvitation.findMany({
    where: {
      email: normalizedEmail,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { project: { select: { id: true, name: true, description: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInvitationByToken(token: string) {
  return prisma.projectInvitation.findUnique({
    where: { token },
    include: { project: { select: { id: true, name: true } } },
  });
}

export async function acceptInvitation(token: string, userId: string) {
  const invitation = await prisma.projectInvitation.findUnique({
    where: { token },
    include: { project: { select: { id: true, name: true, isPersonal: true } } },
  });

  if (!invitation) throw new Error("Invitation not found.");
  if (invitation.acceptedAt) throw new Error("Invitation already accepted.");
  if (invitation.expiresAt < new Date()) throw new Error("Invitation expired.");
  if (invitation.project.isPersonal) throw new Error("FORBIDDEN_INVITE_PERSONAL_PROJECT");

  // Vérifier si déjà membre
  const existingMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: invitation.projectId, userId } },
  });

  if (!existingMember) {
    await prisma.projectMember.create({
      data: { projectId: invitation.projectId, userId, role: invitation.role },
    });
  }

  await prisma.projectInvitation.update({
    where: { token },
    data: { acceptedAt: new Date() },
  });

  revalidatePath("/");
  revalidatePath(`/projects/${invitation.projectId}`);
  emitProjectChanged(invitation.projectId);
  emitAdminDataChanged();
  return invitation.project.id;
}

export async function declineInvitation(token: string) {
  const invitation = await prisma.projectInvitation.findUnique({
    where: { token },
    select: { projectId: true },
  });
  await prisma.projectInvitation.update({
    where: { token },
    data: { acceptedAt: new Date() }, // on marque comme "traitée"
  });
  revalidatePath("/");
  if (invitation?.projectId) {
    emitProjectChanged(invitation.projectId);
    emitAdminDataChanged();
  }
}

export async function getProjectInvitations(projectId: string) {
  return prisma.projectInvitation.findMany({
    where: { projectId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

export async function cancelInvitation(invitationId: string) {
  const inv = await prisma.projectInvitation.findUnique({ where: { id: invitationId } });
  if (inv) await requireAdmin(inv.projectId);
  await prisma.projectInvitation.delete({ where: { id: invitationId } });
  if (inv) {
    emitProjectChanged(inv.projectId);
    emitAdminDataChanged();
  }
}

export async function removeMember(projectId: string, userId: string) {
  await requireAdmin(projectId);
  const projectRows = await prisma.$queryRawUnsafe<Array<{ isPersonal: number }>>(
    `SELECT "isPersonal" FROM "Project" WHERE "id" = ? LIMIT 1`,
    projectId
  );
  if (!projectRows[0]) throw new Error("Project not found.");
  if (Boolean(projectRows[0].isPersonal)) {
    throw new Error("FORBIDDEN_INVITE_PERSONAL_PROJECT");
  }
  if (isSuperAdminUserId(userId)) {
    throw new Error("Cannot remove global super admin.");
  }
  const deleted = await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });
  emitProjectChanged(projectId);
  emitAdminDataChanged();
  return deleted;
}

export async function updateMemberRole(projectId: string, userId: string, role: "ADMIN" | "MEMBER") {
  await requireAdmin(projectId);
  const projectRows = await prisma.$queryRawUnsafe<Array<{ isPersonal: number }>>(
    `SELECT "isPersonal" FROM "Project" WHERE "id" = ? LIMIT 1`,
    projectId
  );
  if (!projectRows[0]) throw new Error("Project not found.");
  if (Boolean(projectRows[0].isPersonal)) {
    throw new Error("FORBIDDEN_INVITE_PERSONAL_PROJECT");
  }
  if (isSuperAdminUserId(userId)) {
    throw new Error("Global super admin always keeps admin rights.");
  }

  // Prevent demoting the last admin (including self-demotion)
  if (role === "MEMBER") {
    const adminCount = await prisma.projectMember.count({
      where: { projectId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      throw new Error("Cannot demote the last project administrator.");
    }
  }

  const updated = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { role },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
  });
  emitProjectChanged(projectId);
  emitAdminDataChanged();
  return updated;
}
