const bcrypt = require('bcryptjs');
const { PrismaLibSql } = require('@prisma/adapter-libsql');
const { PrismaClient } = require('../src/generated/prisma');

const dbPath = '/Users/felixbrossard/Documents/00_PROJETS/10_STUDIO_N/01_SOCIÉTÉ/TASK_APP_GPT/artifacts/task-app-demo-industrie-etudiant.db';
const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = 'contact@studio-n.fr';
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const hash = await bcrypt.hash('DemoTask2026!', 10);
    user = await prisma.user.create({
      data: {
        email,
        name: 'Contact STUDIO-N',
        password: hash,
      },
    });
  }

  const projects = await prisma.project.findMany({
    where: {
      name: {
        in: [
          'Programme Industrie 4.0 - Ligne Assemblage',
          'Revision Examens - Etudiant Ingenieur',
        ],
      },
    },
    select: {
      id: true,
      name: true,
      columns: { where: { type: 'OWNER' }, select: { id: true } },
      groups: {
        select: {
          id: true,
          tasks: {
            where: { archivedAt: null, parentId: null },
            orderBy: { createdAt: 'asc' },
            select: { id: true, title: true },
          },
        },
      },
    },
  });

  const summary = [];

  for (const project of projects) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      update: {},
      create: { projectId: project.id, userId: user.id, role: 'MEMBER' },
    });

    const ownerColId = project.columns[0]?.id;
    if (!ownerColId) continue;

    const allTasks = project.groups.flatMap((g) => g.tasks);
    const tasksToAssign = allTasks.slice(0, 3);

    for (const task of tasksToAssign) {
      await prisma.taskFieldValue.upsert({
        where: { taskId_columnId: { taskId: task.id, columnId: ownerColId } },
        update: { value: user.id },
        create: { taskId: task.id, columnId: ownerColId, value: user.id },
      });
    }

    summary.push({
      project: project.name,
      assigned: tasksToAssign.map((t) => t.title),
    });
  }

  console.log(JSON.stringify({ userId: user.id, email: user.email, projectsProcessed: projects.length, summary }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
