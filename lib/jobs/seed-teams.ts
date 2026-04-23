import { ImportRunStatus, ImportRunType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { seedTeams } from "@/prisma/seed";

export async function runSeedTeams() {
  const run = await prisma.importRun.create({
    data: { type: ImportRunType.SEED_TEAMS, status: ImportRunStatus.SUCCESS },
  });
  try {
    await seedTeams();
    await prisma.importRun.update({
      where: { id: run.id },
      data: { completedAt: new Date(), message: "Teams seeded" },
    });
    return { ok: true };
  } catch (error) {
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        status: ImportRunStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Unknown",
      },
    });
    throw error;
  }
}
