import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { POST } from "@/app/api/auth/signup/route";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PUBLIC_SIGNUP_ROLE, SELF_SERVICE_ROLES } from "@/lib/roles";

/**
 * Phase 3B — no public self-assignment of privileged roles.
 *
 * The endpoint is exercised directly (a `Request` in, a `Response` out) so the
 * assertions are about what the *server* decides, not about a form. Every
 * refusal also checks the database: a 403 that still created an account would
 * otherwise pass as "denied".
 *
 * Requirements: `DATABASE_URL` from the project's `.env` (Prisma's own
 * convention) and a reachable database. Accounts created here carry the
 * `p3b-test-` prefix and are deleted afterwards; the suite refuses to run with
 * `NODE_ENV=production` because it writes rows.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "signup-role tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

const PREFIX = "p3b-test-";
const PASSWORD = "Passw0rd!";

const roleByEmail = new Map<string, string>();

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface SignupBody {
  success: boolean;
  code?: string;
  user?: { id: string; email: string; role: string };
}

/** One public sign-up attempt, with the shared valid fields filled in. */
async function signup(
  slug: string,
  overrides: Record<string, unknown> = {}
): Promise<{ status: number; body: SignupBody }> {
  const email = `${PREFIX}${slug}@sarh.test`;
  roleByEmail.set(email, slug);
  const response = await POST(
    makeRequest({
      fullName: `Phase 3B ${slug}`,
      email,
      password: PASSWORD,
      acceptedTerms: true,
      ...overrides,
    })
  );
  return { status: response.status, body: (await response.json()) as SignupBody };
}

async function userByEmail(slug: string) {
  return prisma.user.findUnique({
    where: { email: `${PREFIX}${slug}@sarh.test` },
    select: { id: true, role: true, roles: true },
  });
}

before(async () => {
  // A staff account granted out of band, the way a seed or an administrative
  // grant creates one. The public endpoint must neither recreate nor alter it.
  await prisma.user.create({
    data: {
      fullName: `${PREFIX}existing-teacher`,
      email: `${PREFIX}existing-teacher@sarh.test`,
      passwordHash: "p3b-test-not-a-real-hash",
      role: "TEACHER",
      roles: [],
      emailVerified: new Date(),
    },
  });
});

after(async () => {
  await prisma.verificationToken.deleteMany({
    where: { identifier: { startsWith: PREFIX } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });

  const residue = await Promise.all([
    prisma.user.count({ where: { email: { startsWith: PREFIX } } }),
    prisma.verificationToken.count({
      where: { identifier: { startsWith: PREFIX } },
    }),
  ]);
  assert.deepEqual(residue, [0, 0], "test fixtures were not cleaned up");
});

describe("public sign-up cannot assign a privileged tier", () => {
  it("refuses a self-declared SUPERVISOR", async () => {
    const { status, body } = await signup("supervisor", { role: "SUPERVISOR" });
    assert.equal(status, 403);
    assert.equal(body.code, "ROLE_REQUIRES_INVITATION");
    assert.equal(await userByEmail("supervisor"), null);
  });

  it("refuses SUPER_ADMIN — it is not even a representable request", async () => {
    const { status, body } = await signup("platform-admin", {
      role: "SUPER_ADMIN",
    });
    assert.equal(status, 400);
    assert.equal(body.code, "INVALID_INPUT");
    assert.equal(await userByEmail("platform-admin"), null);
  });

  it("refuses TEACHER and INSTITUTION_TEACHER without a grant", async () => {
    const teacher = await signup("teacher", { role: "TEACHER" });
    assert.equal(teacher.status, 403);
    assert.equal(teacher.body.code, "ROLE_REQUIRES_INVITATION");
    assert.equal(await userByEmail("teacher"), null);

    const institution = await signup("institution", {
      role: "INSTITUTION_TEACHER",
    });
    assert.equal(institution.status, 403);
    assert.equal(institution.body.code, "ROLE_REQUIRES_INVITATION");
    assert.equal(await userByEmail("institution"), null);
  });

  it("publishes exactly one self-service tier", () => {
    assert.deepEqual(SELF_SERVICE_ROLES, [PUBLIC_SIGNUP_ROLE]);
    assert.equal(PUBLIC_SIGNUP_ROLE, "PARENT");
  });
});

describe("the sanctioned paths still work", () => {
  it("creates the general account when no tier is requested", async () => {
    const { status, body } = await signup("parent");
    assert.equal(status, 201);
    assert.equal(body.user?.role, "PARENT");

    const stored = await userByEmail("parent");
    assert.ok(stored, "the account should exist");
    assert.equal(stored.role, "PARENT");
    assert.deepEqual(stored.roles, [], "no secondary tiers are granted");
  });

  it("ignores an explicit PARENT role in the body (same grant)", async () => {
    const { status, body } = await signup("parent-explicit", {
      role: "PARENT",
    });
    assert.equal(status, 201);
    assert.equal(body.user?.role, "PARENT");
  });

  it("leaves an out-of-band staff grant intact and refuses to touch it", async () => {
    const before = await userByEmail("existing-teacher");
    assert.equal(before?.role, "TEACHER");

    const { status, body } = await signup("existing-teacher", {
      role: "SUPERVISOR",
    });
    assert.equal(status, 403);
    assert.equal(body.code, "ROLE_REQUIRES_INVITATION");

    const retry = await signup("existing-teacher", { role: "PARENT" });
    assert.equal(retry.status, 409);
    assert.equal(retry.body.code, "EMAIL_IN_USE");

    const unchanged = await userByEmail("existing-teacher");
    assert.equal(unchanged?.role, "TEACHER");
    assert.equal(unchanged?.id, before?.id);
  });

  it("cannot escalate a session to a tier the account does not hold", async () => {
    const jwt = authOptions.callbacks?.jwt as unknown as (args: {
      token: Record<string, unknown>;
      trigger: string;
      session: unknown;
    }) => Promise<Record<string, unknown>>;
    assert.equal(typeof jwt, "function");

    const parentToken = {
      role: "PARENT",
      roles: ["PARENT"],
      activeRole: "PARENT",
    };
    const escalated = await jwt({
      token: { ...parentToken },
      trigger: "update",
      session: { activeRole: "SUPERVISOR" },
    });
    assert.equal(escalated.activeRole, "PARENT");

    const teacherToken = {
      role: "TEACHER",
      roles: ["TEACHER", "SUPERVISOR"],
      activeRole: "TEACHER",
    };
    const switched = await jwt({
      token: { ...teacherToken },
      trigger: "update",
      session: { activeRole: "SUPERVISOR" },
    });
    assert.equal(switched.activeRole, "SUPERVISOR");
  });
});
