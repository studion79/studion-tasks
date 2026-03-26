#!/usr/bin/env node
/**
 * Ajoute membres + invitation de test au projet "Lancement Produit v2.0"
 */
const { createClient } = require("@libsql/client");
const path = require("path");
const bcrypt = require("bcryptjs");

const client = createClient({
  url: "file:" + path.resolve(__dirname, "../prisma/dev.db"),
});

async function main() {
  const felixId = "cmn56icph000076vwmt16f949";
  const projectId = "cmn6psbyr0000bpvw5tffcvx7";
  const hash = await bcrypt.hash("password123", 10);
  const now = new Date().toISOString();

  // ── 1. Créer 3 faux membres ──────────────────────────────────────────────
  const fakeUsers = [
    { name: "Jeanne Martin",   email: "jeanne@studio-n.fr" },
    { name: "Thomas Durand",   email: "thomas@studio-n.fr" },
    { name: "Sophie Laurent",  email: "sophie@studio-n.fr" },
  ];

  const userIds = [];
  for (const u of fakeUsers) {
    const existing = await client.execute({
      sql: "SELECT id FROM User WHERE email = ?",
      args: [u.email],
    });
    if (existing.rows.length > 0) {
      const uid = String(existing.rows[0].id);
      userIds.push(uid);
      console.log("✓ Utilisateur déjà présent:", u.name);
    } else {
      const uid = "usr" + Math.random().toString(36).slice(2, 14);
      await client.execute({
        sql: "INSERT INTO User (id, name, email, password, createdAt) VALUES (?, ?, ?, ?, ?)",
        args: [uid, u.name, u.email, hash, now],
      });
      userIds.push(uid);
      console.log("✓ Utilisateur créé:", u.name);
    }
  }

  // ── 2. Ajouter Felix comme ADMIN ─────────────────────────────────────────
  try {
    await client.execute({
      sql: "INSERT INTO ProjectMember (id, projectId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)",
      args: ["pm" + Math.random().toString(36).slice(2, 12), projectId, felixId, "ADMIN", now],
    });
    console.log("✓ Felix ajouté comme ADMIN");
  } catch (e) {
    console.log("ℹ  Felix déjà membre");
  }

  // ── 3. Ajouter les 3 autres comme MEMBER ────────────────────────────────
  for (let i = 0; i < userIds.length; i++) {
    try {
      await client.execute({
        sql: "INSERT INTO ProjectMember (id, projectId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)",
        args: ["pm" + Math.random().toString(36).slice(2, 12), projectId, userIds[i], "MEMBER", now],
      });
      console.log("✓ Membre ajouté:", fakeUsers[i].name);
    } catch (e) {
      console.log("ℹ  Déjà membre:", fakeUsers[i].name);
    }
  }

  // ── 4. Créer un projet de test pour l'invitation ─────────────────────────
  const proj2Id = "proj" + Math.random().toString(36).slice(2, 14);
  try {
    await client.execute({
      sql: "INSERT INTO Project (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
      args: [proj2Id, "Refonte Site Web", "Projet de test — invitation", now, now],
    });
    console.log("✓ Projet test créé:", proj2Id);
  } catch (e) {
    // Si déjà existant, récupérer l'id
    const existing = await client.execute({
      sql: "SELECT id FROM Project WHERE name = 'Refonte Site Web'",
    });
    if (existing.rows.length > 0) {
      proj2Id = String(existing.rows[0].id);
    }
  }

  // ── 5. Invitation de test pour Felix ────────────────────────────────────
  const token = "testinvite" + Math.random().toString(36).slice(2, 16);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Supprimer les anciennes invitations pendantes pour ce projet
  await client.execute({
    sql: "DELETE FROM ProjectInvitation WHERE email = ? AND acceptedAt IS NULL",
    args: ["felix@studio-n.fr"],
  });

  await client.execute({
    sql: "INSERT INTO ProjectInvitation (id, projectId, email, token, role, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: ["inv" + Math.random().toString(36).slice(2, 12), proj2Id, "felix@studio-n.fr", token, "MEMBER", expiresAt, now],
  });

  console.log("✓ Invitation de test créée");
  console.log("  URL:", `http://localhost:3000/invite/${token}`);
  console.log("\n✅ Terminé !");
}

main()
  .catch((e) => { console.error("❌ Erreur:", e); process.exit(1); })
  .finally(() => client.close());
