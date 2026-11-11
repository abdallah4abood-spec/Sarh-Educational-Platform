/** Temporary: snapshot this round's rows, then delete only qa44-* fixtures. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const invitations = await prisma.staffInvitation.findMany({
    where: { email: { startsWith: "qa44-" } },
    select: {
      id: true, email: true, role: true, status: true, institutionId: true,
      createdAt: true, expiresAt: true, acceptedAt: true, revokedAt: true,
      tokenHash: true, invitedById: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const ids = invitations.map((row) => row.id);
  const audit = await prisma.auditLog.findMany({
    where: { entityId: { in: ids } },
    select: { action: true, actorRole: true, institutionId: true, metadata: true },
    orderBy: { createdAt: "asc" },
  });

  const auditText = JSON.stringify(audit);
  const hashLeak = /sha256:/.test(auditText);
  const tokenLikeValues = invitations
    .map((row) => row.tokenHash)
    .filter((value) => auditText.includes(value));

  const fixtures = await prisma.user.findMany({
    where: { email: { startsWith: "qa44-" } },
    select: { id: true, email: true, role: true, roles: true },
  });

  const protectedAccount = await prisma.user.findUnique({
    where: { email: "mverify-teacher@test.local" },
    select: {
      id: true, role: true, emailVerified: true,
      staffRoles: { select: { role: true, status: true, institutionId: true } },
    },
  });
  const protectedInvitations = await prisma.staffInvitation.findMany({
    where: { email: "mverify-teacher@test.local" },
    select: { status: true, role: true, institutionId: true, acceptedAt: true },
  });

  const summary = {
    capturedAt: new Date().toISOString(),
    invitations: invitations.map((row) => ({
      email: row.email,
      role: row.role,
      status: row.status,
      institutionId: row.institutionId,
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt,
      revokedAt: row.revokedAt,
      hashPrefixShape: row.tokenHash.slice(0, 7),
      hashLength: row.tokenHash.length,
    })),
    audit: {
      rows: audit.length,
      actions: audit.map((row) => row.action),
      actorRoles: [...new Set(audit.map((row) => row.actorRole))],
      metadataKeys: [...new Set(audit.flatMap((row) => Object.keys(row.metadata ?? {})))].sort(),
      containsHashOrToken: hashLeak || tokenLikeValues.length > 0,
    },
    fixtures: fixtures.map((row) => ({ email: row.email, role: row.role, roles: row.roles })),
    protectedAccount,
    protectedInvitations,
  };
  console.log(JSON.stringify(summary, null, 2));

  const fs = await import("node:fs/promises");
  await fs.writeFile("dev-artifacts/qa44-final-state.json", JSON.stringify(summary, null, 2));

  /* cleanup: only this round's rows */
  if (ids.length) await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  if (ids.length) await prisma.staffInvitation.deleteMany({ where: { id: { in: ids } } });
  const userIds = fixtures.map((row) => row.id);
  if (userIds.length) {
    await prisma.staffMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: "qa44-" } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  const left = {
    invitations: await prisma.staffInvitation.count({ where: { email: { startsWith: "qa44-" } } }),
    users: await prisma.user.count({ where: { email: { startsWith: "qa44-" } } }),
    audit: await prisma.auditLog.count({ where: { entityId: { in: ids } } }),
  };
  console.log("AFTER_CLEANUP", JSON.stringify(left));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
