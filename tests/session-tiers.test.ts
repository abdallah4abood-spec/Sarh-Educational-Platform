import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { Role } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { userHasInstitutionPortalGrant } from "@/lib/institution-access";
import { prisma } from "@/lib/prisma";
import { effectiveRoles } from "@/lib/roles";

/**
 * D5 — session tiers (test-first).
 *
 * The tests drive the **existing** NextAuth seam: `authOptions.callbacks.jwt`.
 * NextAuth calls that callback on every session read (`getServerSession` /
 * `GET /api/auth/session`) with **no** `trigger`, and on
 * `useSession().update()` with `trigger: "update"`. Verified in
 * `node_modules/next-auth/core/routes/session.js`:
 *
 *   const token = await callbacks.jwt({
 *     token: decodedToken,
 *     ...(isUpdate && { trigger: "update" }),
 *     session: newSession,
 *   });
 *
 * That is why the callback is the right place to test the D5 rule: it is the
 * one place where the cookie's claims are rebuilt. It is also the place where
 * the rule is missing today — with no `user` in the payload the callback
 * returns the decoded token untouched, so the tiers never refresh.
 *
 * WHAT CANNOT BE TESTED HERE (recorded in
 * `docs/testing/d5-teacher-scope-contract.md`):
 *   • whether the rebuilt token is actually written back to the session cookie.
 *     On the RSC path NextAuth's `setCookie` is a no-op
 *     (`next-auth/next/index.js`), so only `POST /api/auth/session` emits
 *     `Set-Cookie`. No HTTP harness exists in this project; this needs a
 *     manual or integration check during D5.
 *   • `resolveTeacherScope` — the function does not exist yet. No placeholder
 *     import is added.
 *
 * Fixtures are prefixed `d5-tier-` and are created and removed by this file
 * only. The suite refuses to run with `NODE_ENV=production`.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "session-tier tests write fixtures; refusing to run with NODE_ENV=production"
  );
}

const PREFIX = "d5-tier-";
const id = (name: string) => `${PREFIX}${name}`;

const ids = {
  parentTeacher: id("parent-teacher"),
  parentTeacherLapsed: id("parent-teacher-lapsed"),
  teacherLapsed: id("teacher-lapsed"),
  secretary: id("secretary"),
  centerAdmin: id("center-admin"),
  lapsedAdmin: id("lapsed-admin"),
  owner: id("owner"),
  multi: id("multi"),
  instA: id("inst-a"),
  instB: id("inst-b"),
} as const;

type JwtCallback = NonNullable<NonNullable<typeof authOptions.callbacks>["jwt"]>;

const jwtCallback: JwtCallback = (() => {
  const callback = authOptions.callbacks?.jwt;
  if (!callback) {
    throw new Error("authOptions.callbacks.jwt is required for these tests");
  }
  return callback;
})();

type JwtArgs = Parameters<JwtCallback>[0];

function makeToken(patch: Record<string, unknown>): JwtArgs["token"] {
  return patch as JwtArgs["token"];
}

/**
 * Run the real callback the way NextAuth would.
 *
 * `trigger` omitted = a normal session read; `"update"` = `useSession().update()`.
 */
async function refresh(params: {
  token: JwtArgs["token"];
  trigger?: "update";
  session?: Record<string, unknown>;
}): Promise<JwtArgs["token"]> {
  return jwtCallback({
    token: params.token,
    trigger: params.trigger,
    session: params.session,
  } as JwtArgs);
}

function rolesOf(token: JwtArgs["token"]): Role[] {
  return (token.roles ?? []) as Role[];
}

async function clearFixtures() {
  await prisma.staffMember.deleteMany({
    where: { user: { email: { startsWith: PREFIX } } },
  });
  await prisma.institution.deleteMany({
    where: { id: { in: [ids.instA, ids.instB] } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function createUser(
  key: keyof typeof ids,
  label: string,
  role: Role,
  roles: Role[] = []
): Promise<void> {
  await prisma.user.create({
    data: {
      id: ids[key],
      fullName: `${PREFIX}${label}`,
      email: `${PREFIX}${label}@sarh.test`,
      passwordHash: "d5-tier-not-a-real-hash",
      role,
      roles,
      emailVerified: new Date(),
    },
  });
}

describe("D5 — session tiers", () => {
  before(async () => {
    await clearFixtures();

    await createUser("parentTeacher", "parent-teacher", "PARENT");
    await createUser("parentTeacherLapsed", "parent-teacher-lapsed", "PARENT");
    await createUser("teacherLapsed", "teacher-lapsed", "TEACHER");
    await createUser("secretary", "secretary", "PARENT");
    await createUser("centerAdmin", "center-admin", "PARENT");
    await createUser("lapsedAdmin", "lapsed-admin", "PARENT");
    await createUser("owner", "owner", "PARENT");
    await createUser("multi", "multi", "PARENT");

    await prisma.institution.createMany({
      data: [
        {
          id: ids.instA,
          name: `${PREFIX}مركز-أ`,
          type: "EDUCATIONAL_CENTER",
          address: "عنوان أ",
          zone: "غزة",
          ownerId: ids.owner,
        },
        {
          id: ids.instB,
          name: `${PREFIX}مركز-ب`,
          type: "EDUCATIONAL_CENTER",
          address: "عنوان ب",
          zone: "غزة",
          ownerId: ids.owner,
        },
      ],
    });

    await prisma.staffMember.createMany({
      data: [
        {
          userId: ids.parentTeacher,
          institutionId: ids.instA,
          title: "معلمة",
          role: "TEACHER",
          subjects: [],
          status: "ACTIVE",
        },
        {
          userId: ids.parentTeacherLapsed,
          institutionId: ids.instA,
          title: "معلمة سابقة",
          role: "TEACHER",
          subjects: [],
          status: "INACTIVE",
        },
        {
          userId: ids.teacherLapsed,
          institutionId: ids.instA,
          title: "معلمة سابقة",
          role: "TEACHER",
          subjects: [],
          status: "INACTIVE",
        },
        {
          userId: ids.secretary,
          institutionId: ids.instA,
          title: "سكرتيرة",
          role: "SECRETARY",
          subjects: [],
          status: "ACTIVE",
        },
        {
          userId: ids.centerAdmin,
          institutionId: ids.instA,
          title: "مديرة المركز",
          role: "CENTER_ADMIN",
          subjects: [],
          status: "ACTIVE",
        },
        {
          userId: ids.lapsedAdmin,
          institutionId: ids.instA,
          title: "مديرة سابقة",
          role: "CENTER_ADMIN",
          subjects: [],
          status: "INACTIVE",
        },
        {
          userId: ids.multi,
          institutionId: ids.instA,
          title: "معلمة",
          role: "TEACHER",
          subjects: [],
          status: "ACTIVE",
        },
        {
          userId: ids.multi,
          institutionId: ids.instB,
          title: "معلمة",
          role: "TEACHER",
          subjects: [],
          status: "ACTIVE",
        },
      ],
    });
  });

  after(async () => {
    await clearFixtures();

    const residue = await Promise.all([
      prisma.user.count({ where: { email: { startsWith: PREFIX } } }),
      prisma.staffMember.count({
        where: { user: { email: { startsWith: PREFIX } } },
      }),
      prisma.institution.count({ where: { id: { startsWith: PREFIX } } }),
    ]);
    assert.deepEqual(residue, [0, 0, 0], "test fixtures were not cleaned up");
  });

  describe("tier composition is additive and order-stable", () => {
    it("merges the primary role with stored tiers without duplicates", () => {
      assert.deepEqual(effectiveRoles("PARENT", ["TEACHER"]), [
        "PARENT",
        "TEACHER",
      ]);
      assert.deepEqual(effectiveRoles("TEACHER", ["PARENT"]), [
        "TEACHER",
        "PARENT",
      ]);
      assert.deepEqual(effectiveRoles("PARENT", ["PARENT", "PARENT"]), [
        "PARENT",
      ]);
      assert.deepEqual(effectiveRoles("PARENT", []), ["PARENT"]);
      assert.deepEqual(effectiveRoles(null, undefined), []);
    });
  });

  describe("database grants that must not change", () => {
    it("does not open the institution portal for a TEACHER membership", async () => {
      assert.equal(await userHasInstitutionPortalGrant(ids.parentTeacher), false);
    });

    it("opens the institution portal for an ACTIVE CENTER_ADMIN membership", async () => {
      assert.equal(await userHasInstitutionPortalGrant(ids.centerAdmin), true);
    });

    it("closes it again when that membership is INACTIVE", async () => {
      assert.equal(await userHasInstitutionPortalGrant(ids.lapsedAdmin), false);
    });

    it("opens it for the institution owner, who has no membership row", async () => {
      assert.equal(await userHasInstitutionPortalGrant(ids.owner), true);
      assert.equal(
        await prisma.staffMember.count({ where: { userId: ids.owner } }),
        0
      );
    });

    it("does not treat SECRETARY as an institution-portal grant", async () => {
      assert.equal(await userHasInstitutionPortalGrant(ids.secretary), false);
    });
  });

  /*
   * Expected to FAIL against the current implementation: the callback returns
   * the decoded token unchanged when there is no `user` payload, so no tier is
   * ever recomputed after sign-in.
   */
  describe("D5 requirement: tiers are recomputed from live memberships", () => {
    it("adds TEACHER on a normal session read for an ACTIVE membership", async () => {
      const token = await refresh({
        token: makeToken({
          sub: ids.parentTeacher,
          id: ids.parentTeacher,
          role: "PARENT",
          roles: ["PARENT"],
          activeRole: "PARENT",
        }),
      });

      assert.deepEqual(
        rolesOf(token).sort(),
        ["PARENT", "TEACHER"],
        "an ACTIVE TEACHER membership did not add the TEACHER tier on refresh"
      );
      assert.equal(token.role, "PARENT", "the primary role must stay untouched");
    });

    it("lets an account that just gained the tier switch to it", async () => {
      const token = await refresh({
        token: makeToken({
          sub: ids.parentTeacher,
          id: ids.parentTeacher,
          role: "PARENT",
          roles: ["PARENT"],
          activeRole: "PARENT",
        }),
        trigger: "update",
        session: { activeRole: "TEACHER" },
      });

      assert.equal(
        token.activeRole,
        "TEACHER",
        "an account holding a live TEACHER membership could not activate it"
      );
    });

    it("emits the tier once when the account has two ACTIVE memberships", async () => {
      const token = await refresh({
        token: makeToken({
          sub: ids.multi,
          id: ids.multi,
          role: "PARENT",
          roles: ["PARENT"],
          activeRole: "PARENT",
        }),
      });

      assert.equal(
        rolesOf(token).filter((role) => role === "TEACHER").length,
        1,
        "two memberships produced a duplicated tier"
      );
    });

    it("keeps the existing INSTITUTION_TEACHER grant on refresh", async () => {
      const token = await refresh({
        token: makeToken({
          sub: ids.centerAdmin,
          id: ids.centerAdmin,
          role: "PARENT",
          roles: ["PARENT"],
          activeRole: "PARENT",
        }),
      });

      assert.ok(
        rolesOf(token).includes("INSTITUTION_TEACHER"),
        "the CENTER_ADMIN portal grant stopped being derived from the database"
      );
    });

    it("drops a membership-derived TEACHER tier once the membership lapses", async () => {
      // Stale cookie: it still claims TEACHER although the membership is
      // INACTIVE. The account's stored role is PARENT, so nothing else keeps
      // the tier alive.
      const stale = makeToken({
        sub: ids.parentTeacherLapsed,
        id: ids.parentTeacherLapsed,
        role: "PARENT",
        roles: ["PARENT", "TEACHER"],
        activeRole: "TEACHER",
      });

      const onRead = await refresh({ token: { ...stale } });
      assert.deepEqual(
        rolesOf(onRead),
        ["PARENT"],
        "a stale JWT kept a TEACHER tier with no ACTIVE membership behind it"
      );

      const onUpdate = await refresh({
        token: { ...stale },
        trigger: "update",
        session: { activeRole: "TEACHER" },
      });
      assert.ok(
        !rolesOf(onUpdate).includes("TEACHER"),
        "useSession().update() kept a revoked TEACHER tier"
      );
      assert.notEqual(
        onUpdate.activeRole,
        "TEACHER",
        "the active tier must normalize away when its claim is revoked"
      );
      assert.equal(onUpdate.activeRole, "PARENT");
    });

    it("keeps a stored TEACHER role when only the membership lapses", async () => {
      // `User.role = TEACHER` is a stored tier, not a membership claim. D5 is
      // additive: recomputation must not silently rewrite the account's role.
      // Access to teacher *data* is still denied — see
      // `tests/teacher-scope.test.ts` ("no ACTIVE staff membership").
      const token = await refresh({
        token: makeToken({
          sub: ids.teacherLapsed,
          id: ids.teacherLapsed,
          role: "TEACHER",
          roles: ["TEACHER"],
          activeRole: "TEACHER",
        }),
      });

      assert.deepEqual(rolesOf(token), ["TEACHER"]);
      assert.equal(token.role, "TEACHER");
    });
  });

  describe("client input can never grant a tier", () => {
    it("ignores an activeRole the database does not grant", async () => {
      const token = await refresh({
        token: makeToken({
          sub: ids.parentTeacher,
          id: ids.parentTeacher,
          role: "PARENT",
          roles: ["PARENT"],
          activeRole: "PARENT",
        }),
        trigger: "update",
        session: { activeRole: "SUPER_ADMIN" },
      });

      assert.notEqual(token.activeRole, "SUPER_ADMIN");
      assert.ok(!rolesOf(token).includes("SUPER_ADMIN"));
    });

    it("ignores an institution tier requested without a grant", async () => {
      const token = await refresh({
        token: makeToken({
          sub: ids.parentTeacher,
          id: ids.parentTeacher,
          role: "PARENT",
          roles: ["PARENT"],
          activeRole: "PARENT",
        }),
        trigger: "update",
        session: { activeRole: "INSTITUTION_TEACHER" },
      });

      assert.notEqual(token.activeRole, "INSTITUTION_TEACHER");
    });

    it("never gives SECRETARY a TEACHER tier", async () => {
      const token = await refresh({
        token: makeToken({
          sub: ids.secretary,
          id: ids.secretary,
          role: "PARENT",
          roles: ["PARENT"],
          activeRole: "PARENT",
        }),
        trigger: "update",
        session: { activeRole: "TEACHER" },
      });

      assert.ok(!rolesOf(token).includes("TEACHER"));
      assert.notEqual(token.activeRole, "TEACHER");
    });

    it("leaves User.role and User.roles untouched after repeated updates", async () => {
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: ids.parentTeacher },
        select: { role: true, roles: true },
      });

      for (const activeRole of [
        "SUPER_ADMIN",
        "INSTITUTION_TEACHER",
        "SUPERVISOR",
      ]) {
        await refresh({
          token: makeToken({
            sub: ids.parentTeacher,
            id: ids.parentTeacher,
            role: "PARENT",
            roles: ["PARENT"],
            activeRole: "PARENT",
          }),
          trigger: "update",
          session: { activeRole },
        });
      }

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: ids.parentTeacher },
        select: { role: true, roles: true },
      });

      assert.deepEqual(after, before);
      assert.equal(after.role, "PARENT");
      assert.deepEqual(after.roles, []);
    });
  });
});
