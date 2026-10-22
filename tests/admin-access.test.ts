import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { hasLiveSuperAdmin, requireLiveSuperAdmin } from "@/lib/admin-access";
import { prisma } from "@/lib/prisma";

/**
 * Phase 4 — platform administration must not outlive the database grant.
 *
 * The guard is exercised with a session object that still claims SUPER_ADMIN
 * after the User row has been demoted. That is the exact stale-JWT case a
 * 30-day session could otherwise keep alive.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "admin-access tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

const PREFIX = "p4-test-";
let primaryAdminId: string;
let secondaryGrantId: string;

function staleSession(id: string) {
  return {
    user: {
      id,
      // Deliberately stale claims: the guard must ignore them.
      role: "SUPER_ADMIN" as const,
      roles: ["SUPER_ADMIN" as const],
    },
  };
}

before(async () => {
  const primary = await prisma.user.create({
    data: {
      fullName: `${PREFIX}primary-admin`,
      email: `${PREFIX}primary-admin@sarh.test`,
      passwordHash: `${PREFIX}not-a-real-hash`,
      role: "SUPER_ADMIN",
      roles: [],
      emailVerified: new Date(),
    },
    select: { id: true },
  });
  primaryAdminId = primary.id;

  const secondary = await prisma.user.create({
    data: {
      fullName: `${PREFIX}secondary-grant`,
      email: `${PREFIX}secondary-grant@sarh.test`,
      passwordHash: `${PREFIX}not-a-real-hash`,
      role: "PARENT",
      roles: ["SUPER_ADMIN"],
      emailVerified: new Date(),
    },
    select: { id: true },
  });
  secondaryGrantId = secondary.id;
});

after(async () => {
  await prisma.user.deleteMany({
    where: { email: { startsWith: PREFIX } },
  });

  assert.equal(
    await prisma.user.count({ where: { email: { startsWith: PREFIX } } }),
    0,
    "admin-access fixtures were not cleaned up"
  );
});

describe("platform-admin access is read live from PostgreSQL", () => {
  it("allows a current SUPER_ADMIN", async () => {
    assert.equal(await hasLiveSuperAdmin(staleSession(primaryAdminId).user), true);
  });

  it("honours an explicit roles[] grant", async () => {
    assert.equal(await hasLiveSuperAdmin(staleSession(secondaryGrantId).user), true);
  });

  it("denies a removed SUPER_ADMIN even when the session still claims it", async () => {
    await prisma.user.update({
      where: { id: primaryAdminId },
      data: { role: "PARENT", roles: [] },
    });

    try {
      assert.equal(await hasLiveSuperAdmin(staleSession(primaryAdminId).user), false);

      const denied = await requireLiveSuperAdmin(staleSession(primaryAdminId));
      assert.ok(denied, "the route guard must return a denial response");
      assert.equal(denied.status, 403);
      assert.equal(((await denied.json()) as { code: string }).code, "FORBIDDEN");
    } finally {
      await prisma.user.update({
        where: { id: primaryAdminId },
        data: { role: "SUPER_ADMIN", roles: [] },
      });
    }
  });

  it("denies after the explicit roles[] grant is removed", async () => {
    await prisma.user.update({
      where: { id: secondaryGrantId },
      data: { roles: [] },
    });

    try {
      assert.equal(await hasLiveSuperAdmin(staleSession(secondaryGrantId).user), false);
    } finally {
      await prisma.user.update({
        where: { id: secondaryGrantId },
        data: { roles: ["SUPER_ADMIN"] },
      });
    }
  });

  it("fails closed for a missing session or unknown account", async () => {
    const anonymous = await requireLiveSuperAdmin(null);
    assert.ok(anonymous);
    assert.equal(anonymous.status, 401);

    assert.equal(
      await hasLiveSuperAdmin({
        id: `${PREFIX}does-not-exist`,
        role: "SUPER_ADMIN",
        roles: ["SUPER_ADMIN"],
      }),
      false
    );
  });
});
