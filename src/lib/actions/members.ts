"use server";

import { revalidatePath, prisma, requireAdmin, requireMember, notifyUser } from "./_helpers";
import { sendMail, invitationEmailHtml } from "@/lib/mailer";
import { isSuperAdminUserId } from "@/lib/super-admin";

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
  inviterName = "Un membre de l'équipe"
) {
  await requireAdmin(projectId);
  const normalizedEmail = email.toLowerCase().trim();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });
  if (!project) throw new Error("Projet introuvable");

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existingUser) {
    // Déjà membre ?
    const existingMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: existingUser.id } },
    });
    if (existingMember) throw new Error("Cet utilisateur est déjà membre du projet");

    // Invitation déjà envoyée ?
    const existingInvitation = await prisma.projectInvitation.findUnique({
      where: { projectId_email: { projectId, email: normalizedEmail } },
    });
    if (existingInvitation && !existingInvitation.acceptedAt) {
      throw new Error("Une invitation est déjà en attente pour cet email");
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
      throw new Error("Une invitation est déjà en attente pour cet email");
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

  // L'envoi d'email est non-fatal : l'invitation est créée même si le mail échoue
  try {
    await sendMail({
      to: normalizedEmail,
      subject: `Invitation à rejoindre « ${project.name} »`,
      html: invitationEmailHtml({
        projectName: project.name,
        inviterName,
        inviteUrl,
        hasAccount: !!existingUser,
      }),
      text: `${inviterName} vous invite à rejoindre le projet « ${project.name} ».\n\nAccédez à l'invitation : ${inviteUrl}\n\nCe lien est valable 7 jours.`,
    });
  } catch (mailError) {
    console.error("⚠️  Échec envoi email invitation (invitation créée quand même) :", mailError);
  }

  // Si l'utilisateur a déjà un compte : lui envoyer aussi une notification in-app
  if (existingUser) {
    await prisma.notification.create({
      data: {
        userId: existingUser.id,
        type: "INVITATION",
        message: `${inviterName} vous invite à rejoindre le projet « ${project.name} »`,
        projectId,
      },
    });
  }

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
    include: { project: { select: { id: true, name: true } } },
  });

  if (!invitation) throw new Error("Invitation introuvable");
  if (invitation.acceptedAt) throw new Error("Invitation déjà acceptée");
  if (invitation.expiresAt < new Date()) throw new Error("Invitation expirée");

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
  return invitation.project.id;
}

export async function declineInvitation(token: string) {
  await prisma.projectInvitation.update({
    where: { token },
    data: { acceptedAt: new Date() }, // on marque comme "traitée"
  });
  revalidatePath("/");
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
}

export async function removeMember(projectId: string, userId: string) {
  await requireAdmin(projectId);
  if (isSuperAdminUserId(userId)) {
    throw new Error("Impossible de retirer le super-admin global.");
  }
  return prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function updateMemberRole(projectId: string, userId: string, role: "ADMIN" | "MEMBER") {
  await requireAdmin(projectId);
  if (isSuperAdminUserId(userId)) {
    throw new Error("Le super-admin global conserve toujours ses droits.");
  }

  // Prevent demoting the last admin (including self-demotion)
  if (role === "MEMBER") {
    const adminCount = await prisma.projectMember.count({
      where: { projectId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      throw new Error("Impossible de rétrograder le dernier administrateur du projet.");
    }
  }

  return prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { role },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
  });
}
