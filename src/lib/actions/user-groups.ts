"use server";

import { prisma, getAuthUserId } from "./_helpers";

export async function listUserGroups() {
  await getAuthUserId();
  return prisma.userGroup.findMany({ orderBy: { name: "asc" } });
}

export async function createUserGroup(name: string, emails: string[]) {
  await getAuthUserId();
  if (!name.trim()) throw new Error("Le nom du groupe est requis");
  const clean = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (clean.length === 0) throw new Error("Au moins un email est requis");
  return prisma.userGroup.create({
    data: { name: name.trim(), emails: JSON.stringify(clean) },
  });
}

export async function updateUserGroup(id: string, name: string, emails: string[]) {
  await getAuthUserId();
  if (!name.trim()) throw new Error("Le nom du groupe est requis");
  const clean = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  return prisma.userGroup.update({
    where: { id },
    data: { name: name.trim(), emails: JSON.stringify(clean) },
  });
}

export async function deleteUserGroup(id: string) {
  await getAuthUserId();
  return prisma.userGroup.delete({ where: { id } });
}
