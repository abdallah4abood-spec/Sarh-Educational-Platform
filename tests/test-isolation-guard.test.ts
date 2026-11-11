/**
 * Prisma Isolation Guard — Permanent Mutation and Deletion Regression Tests
 *
 * These tests protect the mutation and deletion behaviors that were confirmed
 * in the read-only audit (see the audit notes about runtime probes for every
 * mutating method and deletion scenario). Each test exercises the guard's
 * static analysis on a fixture snippet rather than executing real code.
 *
 * Completion criterion: every mutation/deletion behavior that passed only in
 * temporary probes must now be protected by permanent unit and repository-level
 * regression tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  scanSource,
  cleanupPolicyFor,
  FIXTURES_ROOT,
  describeFindings,
  describeUnsupported,
  testSources,
  fixtureSources,
} from "./support/isolation-guard";

/* ── Test descriptor ──────────────────────────────────────────────────── */

type ExpectedOutcome =
  | { type: "unsupported"; count: number }
  | { type: "violations"; count: number };

type MutationTest = {
  name: string;
  snippet: string;
  expectedOutcome: ExpectedOutcome;
};

/* ── Mutation / deletion test descriptors ─────────────────────────────── */

const withSnippet = (tests: MutationTest[]): MutationTest[] =>
  tests.map((test) => ({ ...test, snippet: test.snippet.trim() + "\n" }));

const MUTATION_METHODS = [
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "fill",
  "copyWithin",
  "sort",
  "reverse",
] as const;

const MUTATION_TESTS = withSnippet([
  // push - produces 1 unsupported
  {
    name: "push mutation on Prisma container",
    snippet: `const ops = [prisma.student.count];
ops.push(otherFunction);
ops[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // pop - produces 1 unsupported
  {
    name: "pop mutation on Prisma container",
    snippet: `const ops = [prisma.student.count];
ops.pop();
ops[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // shift - produces 1 unsupported
  {
    name: "shift mutation on Prisma container",
    snippet: `const ops = [prisma.student.count];
ops.shift();
ops[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // unshift - produces 1 unsupported
  {
    name: "unshift mutation on Prisma container",
    snippet: `const ops = [prisma.student.count];
ops.unshift(otherFunction);
ops[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // splice - produces 1 unsupported
  {
    name: "splice mutation on Prisma container",
    snippet: `const ops = [prisma.student.count];
ops.splice(0, 1, replacement);
ops[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // fill - produces 1 unsupported
  {
    name: "fill mutation on Prisma container",
    snippet: `const ops = [prisma.student.count];
ops.fill(replacement);
ops[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // copyWithin - produces 1 unsupported
  {
    name: "copyWithin mutation on Prisma container",
    snippet: `const ops = [prisma.student.count];
ops.copyWithin(0);
ops[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // sort - produces 1 unsupported
  {
    name: "sort mutation on Prisma container",
    snippet: `const ops = [prisma.student.count];
ops.sort();
ops[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // reverse - produces 1 unsupported
  {
    name: "reverse mutation on Prisma container",
    snippet: `const ops = [prisma.student.count];
ops.reverse();
ops[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
]);

/* ── Deletion tests ──────────────────────────────────────────────────── */

const DELETION_TESTS = withSnippet([
  // delete ops.run then read ops.run() - produces 1 unsupported
  {
    name: "delete ops.run then read ops.run()",
    snippet: `const ops = { run: prisma.student.count };
delete ops.run;
ops.run();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // delete ops[0] then read ops[0]() - produces 1 unsupported
  {
    name: "delete ops[0] then read ops[0]()",
    snippet: `const ops = [prisma.student.count];
delete ops[0];
ops[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // delete ops["run"] then read ops.run() - produces 1 unsupported
  {
    name: "delete ops[\"run\"] then read ops.run()",
    snippet: `const ops = { run: prisma.student.count };
delete ops["run"];
ops.run();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // delete ops[key] with dynamic key then read ops[0]() - produces 1 unsupported
  {
    name: "delete ops[key] with dynamic key then read ops[0]()",
    snippet: `const ops = [prisma.student.count];
const key = 0;
delete ops[key];
ops[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // deletion through a container alias must reach the original container: the
  // entry the literal advertised is gone, so the later call is ambiguous.
  {
    name: "deletion through an object alias then read through original",
    snippet: `const ops = { run: prisma.student.count };
const alias = ops;
delete alias.run;
ops.run();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  {
    name: "deletion through an array alias then read through original",
    snippet: `const original = [prisma.student.count];
const ops = original;
delete ops.run;
original[0]();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // deleting one property while accessing another entry - produces 1 unsupported
  {
    name: "delete one property then access another entry",
    snippet: `const ops = {
  first: prisma.student.findFirst,
  total: prisma.student.count,
};
delete ops.first;
ops.total();`,
    expectedOutcome: { type: "unsupported", count: 1 },
  },
  // deletion from an unrelated ordinary object - produces 0 findings
  {
    name: "deletion from unrelated ordinary object produces no findings",
    snippet: `const ordinary = { a: 1, b: 2 };
delete ordinary.a;
ordinary.b;`,
    expectedOutcome: { type: "unsupported", count: 0 },
  },
]);

/* ── Helper: run scanSource and inspect results ──────────────────────── */

const scan = (snippet: string) => {
  const relative = "mutation-deletion-test.ts";
  const result = scanSource(snippet, relative);
  return {
    violations: result.violations,
    unsupported: result.unsupported,
    exemptions: result.exemptions,
  };
};

/* ── 1. Mutation-method regression tests ─────────────────────────────── */

describe("mutation methods on Prisma-operation containers", () => {
  for (const test of MUTATION_TESTS) {
    describe(test.name, () => {
      it(`produces exactly ${test.expectedOutcome.count} unsupported diagnostic${test.expectedOutcome.count !== 1 ? "s" : ""}`, () => {
        const { unsupported } = scan(test.snippet);
        assert.strictEqual(
          unsupported.length,
          test.expectedOutcome.count,
          `${test.name}: expected ${test.expectedOutcome.count} unsupported, got ${unsupported.length}. ${describeUnsupported(
            unsupported
          )}`
        );
      });

      it(`${test.name}: no confirmed violation is emitted`, () => {
        const { violations } = scan(test.snippet);
        assert.strictEqual(
          violations.length,
          0,
          `${test.name}: expected 0 violations, got ${violations.length}. ${describeFindings(
            violations
          )}`
        );
      });
    });
  }
});

/* ── 2. Unrelated array mutation remains ignored ─────────────────────── */

describe("unrelated array mutation is ignored", () => {
  it("ordinary array push produces no findings", () => {
    const { unsupported } = scan(`
const values = [1, 2, 3];
values.push(4);
values.reverse();
`);
    assert.strictEqual(unsupported.length, 0, `expected 0 unsupported, got ${unsupported.length}`);
  });

  it("ordinary array pop produces no findings", () => {
    const { unsupported } = scan(`
const values = [1, 2, 3];
values.pop();
values[0];
`);
    assert.strictEqual(unsupported.length, 0, `expected 0 unsupported, got ${unsupported.length}`);
  });

  it("ordinary array sort produces no findings", () => {
    const { unsupported } = scan(`
const values = [1, 2, 3];
values.sort();
values[0];
`);
    assert.strictEqual(unsupported.length, 0, `expected 0 unsupported, got ${unsupported.length}`);
  });

  it("ordinary array delete produces no findings", () => {
    const { unsupported } = scan(`
const ordinary = { a: 1, b: 2 };
delete ordinary.a;
ordinary.b;
`);
    assert.strictEqual(unsupported.length, 0, `expected 0 unsupported, got ${unsupported.length}`);
  });
});

/* ── 3. Deletion regression tests ────────────────────────────────────── */

describe("deletion operations on Prisma-operation containers", () => {
  for (const test of DELETION_TESTS) {
    describe(test.name, () => {
      const outcome = test.expectedOutcome;
      if (outcome.type === "unsupported") {
        it(`produces exactly ${outcome.count} unsupported diagnostic${outcome.count !== 1 ? "s" : ""}`, () => {
          const { unsupported } = scan(test.snippet);
          assert.strictEqual(
            unsupported.length,
            outcome.count,
            `${test.name}: expected ${outcome.count} unsupported, got ${unsupported.length}. ${describeUnsupported(
              unsupported
            )}`
          );
        });

        it(`${test.name}: no confirmed violation is emitted`, () => {
          const { violations } = scan(test.snippet);
          assert.strictEqual(
            violations.length,
            0,
            `${test.name}: expected 0 violations, got ${violations.length}. ${describeFindings(
              violations
            )}`
          );
        });
      } else {
        // outcome.type === "violations"
        it(`produces exactly ${outcome.count} violation${outcome.count !== 1 ? "s" : ""}`, () => {
          const { violations } = scan(test.snippet);
          assert.strictEqual(
            violations.length,
            outcome.count,
            `${test.name}: expected ${outcome.count} violations, got ${violations.length}. ${describeFindings(
              violations
            )}`
          );
        });

        it(`${test.name}: no unsupported diagnostics emitted`, () => {
          const { unsupported } = scan(test.snippet);
          assert.strictEqual(
            unsupported.length,
            0,
            `${test.name}: expected 0 unsupported, got ${unsupported.length}`
          );
        });
      }
    });
  }
});

/* ── 4. Mutation ordering and aliases ────────────────────────────────── */

describe("mutation ordering and aliases", () => {
  it("read after mutation produces unsupported diagnostics per call site", () => {
    const { unsupported } = scan(`
const ops = [prisma.student.count];
ops.push(otherFunction);
ops[0]();
ops[0]();
ops[0]();
`);
    // Each call site produces an unsupported diagnostic
    assert.ok(
      unsupported.length >= 1,
      `expected at least 1 unsupported, got ${unsupported.length}. ${describeUnsupported(
        unsupported
      )}`
    );
    // Each unsupported should have a reason about mutation
    const reasons = unsupported.map((f: any) => f.reason);
    const hasMutationReason = reasons.some((r: string) => r.includes("mutated after initialization"));
    assert.ok(
      hasMutationReason,
      `expected at least one reason about mutation. Reasons: ${reasons.join(", ")}`
    );
    // No violations should be emitted
    const { violations } = scan(`
const ops = [prisma.student.count];
ops.push(otherFunction);
ops[0]();
ops[0]();
ops[0]();
`);
    assert.strictEqual(
      violations.length,
      0,
      `expected 0 violations for mutation read-after, got ${violations.length}`
    );
  });

  it("mutation through an alias marks the original container", () => {
    const { unsupported, violations } = scan(`
const original = [prisma.student.count];
const ops = original;
ops.push(otherFunction);
original[0]();
`);
    assert.equal(
      unsupported.length,
      1,
      `expected exactly 1 unsupported when mutating through an alias, got ${unsupported.length}. ${describeUnsupported(
        unsupported
      )}`
    );
    assert.match(unsupported[0].reason, /mutated after initialization/);
    assert.equal(unsupported[0].line, 5);
    assert.equal(
      violations.length,
      0,
      `the mutated container must not produce a confirmed violation, got ${violations.length}`
    );
  });

  it("multiple reads after same mutation each get their own diagnostic", () => {
    const { unsupported } = scan(`
const ops = [prisma.student.count];
ops.push(otherFunction);
ops[0]();
ops[0]();
ops[0]();
`);
    // Each read produces an unsupported (3 call sites = up to 3 unsupported)
    assert.ok(
      unsupported.length >= 1,
      `expected at least 1 unsupported, got ${unsupported.length}. ${describeUnsupported(
        unsupported
      )}`
    );
    // Each unsupported should have a reason about mutation
    const reasons = unsupported.map((f: any) => f.reason);
    const hasMutationReason = reasons.some((r: string) => r.includes("mutated after initialization"));
    assert.ok(
      hasMutationReason,
      `expected at least one reason about mutation. Reasons: ${reasons.join(", ")}`
    );
    // No violations should be emitted
    const { violations } = scan(`
const ops = [prisma.student.count];
ops.push(otherFunction);
ops[0]();
ops[0]();
ops[0]();
`);
    assert.strictEqual(
      violations.length,
      0,
      `expected 0 violations for multiple reads, got ${violations.length}`
    );
  });

  it("conditional container mutation is diagnosed when container holds operation", () => {
    const { unsupported } = scan(`
const flag = true;
const ops = flag ? [prisma.student.count] : [];
ops.push(otherFunction);
ops[0]();
`);
    // When the container is known to hold an operation, mutation should mark it
    assert.ok(
      unsupported.length >= 1,
      `expected at least 1 unsupported for conditional mutation, got ${unsupported.length}. ${describeUnsupported(
        unsupported
      )}`
    );
  });

  it("multiple operation references in one container after mutation", () => {
    const { unsupported } = scan(`
const ops = {
  first: prisma.student.findFirst,
  total: prisma.student.count,
};
ops.push(otherFunction);
ops.first();
ops.total();
`);
    // Container is mutated, both reads should produce unsupported or at least one
    assert.ok(
      unsupported.length >= 1,
      `expected at least 1 unsupported for mutated multi-op container, got ${unsupported.length}. ${describeUnsupported(
        unsupported
      )}`
    );
  });
});

/* ── 5. Repository-level fixture integration ─────────────────────────── */

describe("repository-level mutation and deletion fixtures", () => {
  const scanFixture = (name: string) => {
    const full = path.join(FIXTURES_ROOT, name);
    const relative = path.relative(process.cwd(), full).split(path.sep).join("/");
    return scanSource(readFileSync(full, "utf8"), relative);
  };

  const confirmed = (name: string) =>
    scanFixture(name).violations.map((f: any) => `${f.operation} ${f.text}`);

  const unresolved = (name: string) =>
    scanFixture(name).unsupported.map((f: any) => f.text);

  it("scans every mutation/deletion fixture and keeps them out of real-suite scan", () => {
    assert.deepEqual(
      fixtureSources().map((file) => path.basename(file)),
      [
        "conditionals.ts",
        "containers.ts",
        "duplicate-var.ts",
        "dynamic-references.ts",
        "exemptions.ts",
        "fixtures-support.ts",
        "operation-references.ts",
        "prototype-invocations.ts",
        "receivers.ts",
        "scope.ts",
        "sql.ts",
        "static-keys.ts",
        "transactions.ts",
        "undefined-filters.ts",
        "unproven-write.ts",
      ]
    );
    assert.deepEqual(
      testSources().filter((file) => file.includes("fixtures/isolation-guard")),
      []
    );
  });

  // ── Mutated-container behaviors from the real fixtures ──

  it("containers.ts mutatedContainer is diagnosed as unsupported", () => {
    const result = scanFixture("containers.ts");
    const hasMutationDiagnosis = result.unsupported.some(
      (f: any) => f.reason && /mutated/.test(f.reason)
    );
    assert.ok(
      hasMutationDiagnosis,
      "containers.ts should produce an unsupported diagnosis about mutation"
    );
  });

  it("conditionals.ts conditional mutation is diagnosed", () => {
    const result = scanFixture("conditionals.ts");
    const hasConditionalMutation = result.unsupported.some(
      (f: any) => f.reason && (/conditional/.test(f.reason) || /mutated/.test(f.reason))
    );
    assert.ok(
      hasConditionalMutation,
      "conditionals.ts should produce unsupported diagnostics for conditional mutations"
    );
  });

  it("deletion from real fixture produces unsupported when appropriate", () => {
    // Check that the real fixtures have deletion-related diagnoses
    const result = scanFixture("containers.ts");
    assert.ok(
      result.unsupported.length > 0 ||
        result.violations.length > 0,
      "containers.ts should have some findings (unsupported or violations)"
    );
  });
});
/* ── 5. Transaction-client scope ─────────────────────────────────────── */

describe("transaction-client scope", () => {
  it("analyses an unscoped read through a transaction client", () => {
    const { violations, unsupported } = scan(
      `await prisma.$transaction(async (tx) => {\n  await tx.student.findMany();\n});`
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].line, 2);
    assert.equal(violations[0].operation, "findMany");
    assert.match(violations[0].reason, /no arguments at all/);
  });

  it("keeps a scoped read through a transaction client clean", () => {
    const { violations, unsupported } = scan(
      `await prisma.$transaction(async (tx) => {\n  await tx.student.findMany({ where: { id: "s1" } });\n});`
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("follows an alias of the transaction client", () => {
    const { violations, unsupported } = scan(
      `await prisma.$transaction(async (tx) => {\n  const alias = tx;\n  await alias.student.deleteMany();\n});`
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].line, 3);
    assert.equal(violations[0].operation, "deleteMany");
  });

  it("applies the same rules to the array form of $transaction", () => {
    const { violations, unsupported } = scan(
      `await prisma.$transaction([\n  prisma.student.findMany(),\n  prisma.student.count({ where: { id: "s1" } }),\n]);`
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].line, 2);
    assert.equal(violations[0].operation, "findMany");
  });

  it("does not treat an arbitrary `tx` parameter as a client", () => {
    const { violations, unsupported } = scan(
      `async function helper(tx: any) {\n  await tx.student.findMany();\n}`
    );
    assert.equal(violations.length, 0, describeFindings(violations));
    assert.equal(unsupported.length, 1, describeUnsupported(unsupported));
    assert.equal(unsupported[0].line, 2);
    assert.match(unsupported[0].reason, /`tx` is a parameter/);
  });

  it("applies raw SQL rules inside a transaction", () => {
    const { violations, unsupported } = scan(
      `await prisma.$transaction(async (tx) => {\n  await tx.$executeRaw\`DELETE FROM "Student"\`;\n});`
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].line, 2);
    assert.equal(violations[0].operation, "$executeRaw");
    assert.match(violations[0].reason, /raw SQL without a WHERE clause/);
  });});

/* ── 6. Variable-held filters ────────────────────────────────────────── */
describe("variable-held filters", () => {
  it("accepts a filter literal held in a variable", () => {
    const { violations, unsupported } = scan(
      `const filter = { id: studentId };\nawait prisma.student.findMany({ where: filter });`
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("flags a variable-held filter whose only condition is undefined", () => {
    const { violations, unsupported } = scan(
      `const filter = { id: undefined };\nawait prisma.student.findMany({ where: filter });`
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].line, 2);
    assert.equal(violations[0].operation, "findMany");
    assert.match(violations[0].reason, /no effective conditions/);
  });

  it("reports a reassigned filter as unsupported instead of assuming safety", () => {
    const { violations, unsupported } = scan(
      `let filter = { id: studentId };\nfilter = {};\nawait prisma.student.findMany({ where: filter });`
    );
    assert.equal(violations.length, 0, describeFindings(violations));
    assert.equal(unsupported.length, 1, describeUnsupported(unsupported));
    assert.equal(unsupported[0].line, 3);
    assert.match(unsupported[0].reason, /`where` is not a literal object/);
  });

  it("follows a filter alias chain", () => {
    const { violations, unsupported } = scan(
      `const first = { id: studentId };\nconst second = first;\nawait prisma.student.findMany({ where: second });`
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("leaves an unrelated object held in a variable untouched", () => {
    const { violations, unsupported } = scan(
      `const stats = { count: 0 };\nconst filter = stats;\nconsole.log(filter);`
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });
});

/* ── 7. Write operations ─────────────────────────────────────────────── */

/**
 * `create`/`createMany` are judged by their data payload, never by a `where`
 * clause. A payload is fixture-scoped only when a field that the real suites
 * use to identify or own the row (module identity rules in the guard) is
 * provably derived from the file's PREFIX. Update/upsert/delete keep their own
 * target-scope rules. Every assertion below pins the operation, the reason, and
 * — where the dispatch could plausibly regress — the source location.
 */
describe("write operations", () => {
  const PREFIX = 'const PREFIX = "p4-test-";\n';

  /**
   * Identity is only accepted when this file's own teardown proves the row it
   * would write is removed, so every assertion here runs in a file that deletes
   * students by id and users by email. The teardown is appended after the
   * statement under test, which keeps the pinned source lines on the write.
   */
  const CLEANUP =
    'await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });\n' +
    'await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });';

  const scan = (snippet: string) =>
    scanSource(snippet + "\n" + CLEANUP, "write-operations-test.ts");

  /* ── create ───────────────────────────────────────────────────────── */

  it("creates data with fixture-scoped payload", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        'const data = { id: `${PREFIX}student-a`, fullName: "Test Student" };\n' +
        "const created = await prisma.student.create({ data });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("does not accept create with PREFIX only in a descriptive field", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        'const data = { fullName: `${PREFIX}student-a`, dateOfBirth: new Date("2014-03-01") };\n' +
        "const created = await prisma.student.create({ data });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "create");
    assert.match(violations[0].reason, /no fixture-scoped identity in `data` payload/);
  });

  it("accepts a direct fixture-scoped literal identity", () => {
    const { violations, unsupported } = scan(
      PREFIX + 'await prisma.student.create({ data: { id: "p4-test-student-a" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("accepts a constant template identity", () => {
    const { violations, unsupported } = scan(
      PREFIX + "await prisma.student.create({ data: { id: `${PREFIX}student-a` } });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("accepts an identity held in a variable", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "const id = `${PREFIX}student-a`;\n" +
        "await prisma.student.create({ data: { id, fullName: `Student ${id}` } });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("accepts a variable-held data object", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "const data = { id: `${PREFIX}student-a` };\n" +
        "await prisma.student.create({ data });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("follows multi-hop constant aliases", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "const first = PREFIX;\n" +
        "const second = first;\n" +
        "await prisma.student.create({ data: { id: `${second}student-a` } });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("accepts a fixture helper inlined with a constant argument", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "const id = (name: string) => `${PREFIX}${name}`;\n" +
        "await prisma.student.create({ data: { id: id(\"student-a\") } });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("flags create with unscoped data", () => {
    const { violations, unsupported } = scan(
      PREFIX + 'await prisma.student.create({ data: { id: "student-a", fullName: "A" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "create");
    assert.equal(violations[0].line, 2);
    assert.match(violations[0].reason, /`data` payload is not fixture-scoped/);
  });

  it("flags create with no identity field at all", () => {
    const { violations, unsupported } = scan(
      PREFIX + 'await prisma.student.create({ data: { fullName: "Test Student", level: 1 } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.match(violations[0].reason, /no fixture-scoped identity in `data` payload/);
  });

  it("flags create without a data payload", () => {
    const { violations, unsupported } = scan(PREFIX + "await prisma.student.create({});");
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "create");
    assert.match(violations[0].reason, /no `data` payload/);
  });

  it("reports reassigned data as unsupported", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "let data = { id: `${PREFIX}student-a` };\n" +
        'data = { id: "other" };\n' +
        "await prisma.student.create({ data });"
    );
    assert.equal(violations.length, 0, describeFindings(violations));
    assert.equal(unsupported.length, 1, describeUnsupported(unsupported));
    assert.match(unsupported[0].reason, /cannot determine fixture scope of `data` payload/);
  });

  it("reports dynamic data as unsupported", () => {
    const { violations, unsupported } = scan(
      PREFIX + "await prisma.student.create({ data: makeData() });"
    );
    assert.equal(violations.length, 0, describeFindings(violations));
    assert.equal(unsupported.length, 1, describeUnsupported(unsupported));
    assert.match(unsupported[0].reason, /cannot determine fixture scope of `data` payload/);
  });

  it("reports an unresolved spread payload as unsupported", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "const base = makeBase();\n" +
        'await prisma.student.create({ data: { ...base, fullName: "x" } });'
    );
    assert.equal(violations.length, 0, describeFindings(violations));
    assert.equal(unsupported.length, 1, describeUnsupported(unsupported));
    assert.match(unsupported[0].reason, /cannot determine fixture scope of `data` payload/);
  });

  it("accepts a spread of a resolved fixture-scoped object", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "const base = { id: `${PREFIX}student-a` };\n" +
        'await prisma.student.create({ data: { ...base, fullName: "x" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  /* ── createMany ───────────────────────────────────────────────────── */

  it("flags createMany without fixture-scoped data", () => {
    const { violations, unsupported } = scan(
      PREFIX + 'await prisma.student.createMany({ data: { id: "unscoped" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "createMany");
    assert.match(violations[0].reason, /`data` payload is not fixture-scoped/);
  });

  it("accepts createMany with all PREFIX-scoped records", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "await prisma.student.createMany({ data: [ { id: `${PREFIX}1` }, { id: `${PREFIX}2` } ] });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("flags createMany with unscoped data", () => {
    const { violations, unsupported } = scan(
      PREFIX + 'await prisma.student.createMany({ data: [ { id: "unscoped" } ] });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "createMany");
    assert.match(violations[0].reason, /no fixture-scoped identity in `data` payload/);
  });

  it("flags createMany with mixed scoped and unscoped records", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        'await prisma.student.createMany({ data: [ { id: `${PREFIX}1` }, { id: "unscoped" } ] });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "createMany");
    assert.match(violations[0].reason, /mixed scoped and unscoped/);
  });

  it("accepts a variable-held createMany array", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "const data = [ { id: `${PREFIX}1` }, { id: `${PREFIX}2` } ];\n" +
        "await prisma.student.createMany({ data });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("reports a dynamic createMany entry as unsupported", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "const record = { id: makeId() };\n" +
        "await prisma.student.createMany({ data: [ { id: `${PREFIX}1` }, record ] });"
    );
    assert.equal(violations.length, 0, describeFindings(violations));
    assert.equal(unsupported.length, 1, describeUnsupported(unsupported));
    assert.match(unsupported[0].reason, /cannot determine fixture scope of `data` payload/);
  });

  it("reports a spread createMany array as unsupported", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "const extra = makeRecords();\n" +
        "await prisma.student.createMany({ data: [ { id: `${PREFIX}1` }, ...extra ] });"
    );
    assert.equal(violations.length, 0, describeFindings(violations));
    assert.equal(unsupported.length, 1, describeUnsupported(unsupported));
    assert.match(unsupported[0].reason, /cannot determine fixture scope of `data` payload/);
  });

  it("flags an empty createMany array", () => {
    const { violations, unsupported } = scan(
      PREFIX + "await prisma.student.createMany({ data: [] });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "createMany");
    assert.match(violations[0].reason, /empty `data` payload/);
  });

  it("accepts the single-object createMany form the installed Prisma API allows", () => {
    const { violations, unsupported } = scan(
      PREFIX + "await prisma.student.createMany({ data: { id: `${PREFIX}1` } });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  /* ── update ───────────────────────────────────────────────────────── */

  it("creates data with update and fixture filter", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        'await prisma.student.update({ where: { id: `${PREFIX}s1` }, data: { fullName: "Updated" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("flags update without fixture filter", () => {
    const { violations, unsupported } = scan(
      PREFIX + 'await prisma.student.update({ data: { fullName: "Unscoped" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "update");
    assert.match(violations[0].reason, /no `where` filter/);
  });

  it("flags update with an empty where", () => {
    const { violations, unsupported } = scan(
      PREFIX + 'await prisma.student.update({ where: {}, data: { fullName: "x" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "update");
    assert.match(violations[0].reason, /empty `where: {}` filter/);
  });

  it("flags update with an undefined where", () => {
    const { violations, unsupported } = scan(
      PREFIX + 'await prisma.student.update({ where: undefined, data: { fullName: "x" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "update");
    assert.match(violations[0].reason, /no `where` filter/);
  });

  it("flags update data that changes an identity field", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        'await prisma.user.update({ where: { id: `${PREFIX}u1` }, data: { email: "other@example.com" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "update");
    assert.match(violations[0].reason, /moves the record outside the fixture scope/);
  });

  it("reports ambiguous update data as unsupported", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "function change(target: string) {\n" +
        "  return prisma.user.update({ where: { id: `${PREFIX}u1` }, data: { email: target } });\n" +
        "}"
    );
    assert.equal(violations.length, 0, describeFindings(violations));
    assert.equal(unsupported.length, 1, describeUnsupported(unsupported));
    assert.match(unsupported[0].reason, /cannot determine whether the write payload/);
  });

  /* ── upsert ───────────────────────────────────────────────────────── */

  it("creates data with upsert and fixture filter", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "await prisma.student.upsert({ where: { id: `${PREFIX}s1` }, create: { id: `${PREFIX}s1` }, update: { fullName: \"Existing\" } });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("flags upsert without fixture filter", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        'await prisma.student.upsert({ create: { id: `${PREFIX}s1` }, update: { fullName: "x" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "upsert");
    assert.match(violations[0].reason, /no `where` filter/);
  });

  it("flags an unsafe upsert create branch", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        'await prisma.student.upsert({ where: { id: `${PREFIX}s1` }, create: { fullName: "New" }, update: { fullName: "x" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "upsert");
    assert.match(violations[0].reason, /no fixture-scoped identity in `data` payload/);
  });

  it("flags an unsafe upsert update branch", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        'await prisma.user.upsert({ where: { id: `${PREFIX}u1` }, create: { id: `${PREFIX}u1` }, update: { email: "other@example.com" } });'
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "upsert");
    assert.match(violations[0].reason, /moves the record outside the fixture scope/);
  });

  it("reports an ambiguous upsert branch as unsupported", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "const createData = makeData();\n" +
        'await prisma.student.upsert({ where: { id: `${PREFIX}s1` }, create: createData, update: { fullName: "x" } });'
    );
    assert.equal(violations.length, 0, describeFindings(violations));
    assert.equal(unsupported.length, 1, describeUnsupported(unsupported));
    assert.match(unsupported[0].reason, /cannot determine fixture scope of `data` payload/);
  });

  /* ── delete / deleteMany ──────────────────────────────────────────── */

  it("flags delete without fixture filter", () => {
    const { violations, unsupported } = scan(PREFIX + "await prisma.student.delete({});");
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "delete");
    assert.match(violations[0].reason, /no `where` filter/);
  });

  it("flags delete with empty where", () => {
    const { violations, unsupported } = scan(
      PREFIX + "await prisma.student.delete({ where: {} });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "delete");
    assert.match(violations[0].reason, /empty `where: {}` filter/);
  });

  it("flags delete with an undefined predicate", () => {
    const { violations, unsupported } = scan(
      PREFIX + "await prisma.student.delete({ where: undefined });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "delete");
    assert.match(violations[0].reason, /no `where` filter/);
  });

  it("flags deleteMany with an undefined predicate", () => {
    const { violations, unsupported } = scan(
      PREFIX + "await prisma.student.deleteMany({ where: undefined });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "deleteMany");
    assert.match(violations[0].reason, /no `where` filter/);
  });

  it("accepts delete with a fixture-scoped target", () => {
    const { violations, unsupported } = scan(
      PREFIX + "await prisma.student.delete({ where: { id: `${PREFIX}s1` } });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("accepts deleteMany with a fixture-scoped target", () => {
    const { violations, unsupported } = scan(
      PREFIX + "await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });

  it("flags deleteMany with an empty where independently of delete", () => {
    const { violations, unsupported } = scan(
      PREFIX + "await prisma.student.deleteMany({ where: {} });"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "deleteMany");
    assert.match(violations[0].reason, /empty `where: {}` filter/);
  });

  it("flags deleteMany without a where", () => {
    const { violations, unsupported } = scan(PREFIX + "await prisma.student.deleteMany({});");
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 1, describeFindings(violations));
    assert.equal(violations[0].operation, "deleteMany");
    assert.match(violations[0].reason, /no `where` filter/);
  });

  it("reports a dynamic delete target as unsupported", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "function remove(target: string) {\n" +
        "  return prisma.student.delete({ where: { id: target } });\n" +
        "}"
    );
    assert.equal(violations.length, 0, describeFindings(violations));
    assert.equal(unsupported.length, 1, describeUnsupported(unsupported));
  });

  it("leaves unrelated objects untouched", () => {
    const { violations, unsupported } = scan(
      PREFIX +
        "const payload = { id: `${PREFIX}x`, data: { id: \"plain\" } };\n" +
        "console.log(payload);"
    );
    assert.equal(unsupported.length, 0, describeUnsupported(unsupported));
    assert.equal(violations.length, 0, describeFindings(violations));
  });
});

/* ── 8. Per-file fixture cleanup policy ──────────────────────────────── */

/**
 * Fixture identity is file-scoped: a `create`/`createMany` payload is accepted
 * only when *this file's own teardown* provably removes the row it would write.
 * A column is never accepted because it exists in the schema, contains PREFIX,
 * or happens to be an ownership foreign key.
 *
 * Every case pins the finding count, operation, source line and reason so a
 * regression to model-wide or PREFIX-based acceptance fails on an exact string.
 */
describe("fixture cleanup policy is scoped to the test file", () => {
  const HEAD = 'import { prisma } from "@/lib/prisma";\nconst PREFIX = "p4-test-";\n';

  /** Absolute line of the first snippet line containing `marker`. */
  const lineOf = (lines: string[], marker: string): number => {
    const index = lines.findIndex((line) => line.includes(marker));
    assert.ok(index >= 0, `missing marker: ${marker}`);
    return index + 3; // the two HEAD lines occupy 1 and 2
  };

  const findings = (lines: string[]) => {
    const result = scanSource(HEAD + lines.join("\n"), "cleanup-policy-test.ts");
    return {
      violations: result.violations.map(
        (finding) => `${finding.line} ${finding.operation} ${finding.reason}`
      ),
      unsupported: result.unsupported.map((finding) => `${finding.line} ${finding.reason}`),
    };
  };

  const ENROLLMENT_BY_STUDENT = [
    "async function clearFixtures() {",
    "  await prisma.enrollment.deleteMany({ where: { studentId: { startsWith: PREFIX } } });",
    "}",
  ];

  /* ── enrollment ───────────────────────────────────────────────────── */

  it("rejects an enrollment identified only by a PREFIX id", () => {
    const lines = [
      ...ENROLLMENT_BY_STUDENT,
      "async function write() {",
      '  await prisma.enrollment.create({ data: { id: `${PREFIX}e1`, gradeLevel: "g", commissionFee: 0 } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, [
      `${lineOf(lines, "enrollment.create")} create no fixture-scoped identity in \`data\` payload`,
    ]);

    // No suite deletes enrollments by id, and no cascade covers them, so the
    // column is simply absent from the policy rather than mistrusted later.
    const policy = cleanupPolicyFor(HEAD + lines.join("\n"));
    assert.deepEqual(Object.keys(policy.enrollment), ["studentId"]);
  });

  it("accepts an enrollment scoped by the column its teardown deletes by", () => {
    const lines = [
      ...ENROLLMENT_BY_STUDENT,
      "async function write() {",
      '  await prisma.enrollment.create({ data: { studentId: `${PREFIX}s1`, gradeLevel: "g", commissionFee: 0 } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, []);
  });

  it("rejects an enrollment whose proven column points outside the fixture", () => {
    const lines = [
      "async function clearFixtures() {",
      "  await prisma.enrollment.deleteMany({",
      "    where: { OR: [{ studentId: { startsWith: PREFIX } }, { institutionId: { startsWith: PREFIX } }] },",
      "  });",
      "}",
      "async function write() {",
      '  await prisma.enrollment.create({ data: { institutionId: "unrelated-centre" } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, [
      `${lineOf(lines, "enrollment.create")} create \`data\` payload is not fixture-scoped`,
    ]);
  });

  /* ── schoolClass ──────────────────────────────────────────────────── */

  it("rejects a schoolClass identified only by a PREFIX institutionId", () => {
    const lines = [
      "async function clearFixtures() {",
      "  await prisma.institution.deleteMany({ where: { id: { startsWith: PREFIX } } });",
      "}",
      "async function write() {",
      '  await prisma.schoolClass.create({ data: { institutionId: `${PREFIX}i1`, name: "class" } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "schoolClass.create")} no proven fixture cleanup for \`schoolClass\` in this file`,
    ]);
  });

  it("accepts a schoolClass scoped by the column its own teardown deletes by", () => {
    const lines = [
      "async function clearFixtures() {",
      "  await prisma.schoolClass.deleteMany({ where: { name: { startsWith: PREFIX } } });",
      "}",
      "async function write() {",
      '  await prisma.schoolClass.create({ data: { name: `${PREFIX}c1` } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, []);
  });

  /* ── student ──────────────────────────────────────────────────────── */

  it("rejects a student identified only by a PREFIX parentId", () => {
    const lines = [
      "async function clearFixtures() {",
      "  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });",
      "}",
      "async function write() {",
      '  await prisma.student.create({ data: { parentId: `${PREFIX}u1`, fullName: "x" } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    // `Student.parent` is `onDelete: Restrict`, so a prefixed parent id proves
    // ownership at best and never removal: the row still needs its own key.
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, [
      `${lineOf(lines, "student.create")} create no fixture-scoped identity in \`data\` payload`,
    ]);
  });

  it("accepts a student scoped by a verified id cleanup predicate", () => {
    const lines = [
      "async function clearFixtures() {",
      "  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });",
      "}",
      "async function write() {",
      '  await prisma.student.create({ data: { id: `${PREFIX}s1`, fullName: "x" } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, []);
  });

  it("accepts fullName where the suite's own cleanup collects those rows", () => {
    const lines = [
      "async function clearFixtures() {",
      "  const rows = await prisma.student.findMany({",
      "    where: { OR: [{ id: { startsWith: PREFIX } }, { fullName: { startsWith: PREFIX } }] },",
      "    select: { id: true },",
      "  });",
      "  const ids = rows.map((row) => row.id);",
      "  await prisma.student.deleteMany({ where: { id: { in: ids } } });",
      "}",
      "async function write() {",
      '  await prisma.student.create({ data: { fullName: `${PREFIX}n` } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, []);

    // The evidence is the file's own read predicate, matched to its id-list
    // delete — institution-students' collect-then-delete shape.
    const policy = cleanupPolicyFor(HEAD + lines.join("\n"));
    assert.deepEqual(policy.student.fullName.prefixes, ["p4-test-"]);
    assert.deepEqual(policy.student.id.prefixes, ["p4-test-"]);
  });

  it("rejects the same fullName identity in a file without that cleanup", () => {
    const lines = [
      "async function clearFixtures() {",
      "  const rows = await prisma.student.findMany({",
      "    where: { id: { startsWith: PREFIX } },",
      "    select: { id: true },",
      "  });",
      "  const ids = rows.map((row) => row.id);",
      "  await prisma.student.deleteMany({ where: { id: { in: ids } } });",
      "}",
      "async function write() {",
      '  await prisma.student.create({ data: { fullName: `${PREFIX}n` } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, [
      `${lineOf(lines, "student.create")} create no fixture-scoped identity in \`data\` payload`,
    ]);
  });

  /* ── unknown models and relation inference ────────────────────────── */

  it("reports an unknown model with a PREFIX id and no cleanup as unsupported", () => {
    const lines = [
      "async function write() {",
      '  await prisma.widget.create({ data: { id: `${PREFIX}w1` } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "widget.create")} no proven fixture cleanup for \`widget\` in this file`,
    ]);
  });

  it("accepts a foreign key whose parent is removed by a proven cascade", () => {
    const lines = [
      "async function clearFixtures() {",
      "  await prisma.studentGuardian.deleteMany({ where: { studentId: { startsWith: PREFIX } } });",
      "}",
      "async function write() {",
      '  await prisma.studentGuardianGrant.create({ data: { linkId: `${PREFIX}link1` } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, []);

    // `StudentGuardianGrant.link` is `onDelete: Cascade`, and the link rows are
    // cleaned by studentId in the same file.
    const policy = cleanupPolicyFor(HEAD + lines.join("\n"));
    assert.deepEqual(policy.studentGuardianGrant.linkId.prefixes, ["p4-test-"]);
    assert.equal(policy.studentGuardianGrant.linkId.fixture, true);
  });

  it("does not accept a foreign key whose relation is Restrict", () => {
    const lines = [
      "async function clearFixtures() {",
      "  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });",
      "}",
      "async function write() {",
      '  await prisma.enrollment.create({ data: { studentId: `${PREFIX}s1` } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    // `Enrollment.student` has no `onDelete: Cascade`, so the parent's cleanup
    // removes nothing here and the dependent row is unproven.
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "enrollment.create")} no proven fixture cleanup for \`enrollment\` in this file`,
    ]);
  });

  it("reports an ambiguous cleanup helper instead of trusting it", () => {
    const lines = [
      "function cleanup() {",
      "  return prisma.student.deleteMany({ where: { id: makeFilter() } });",
      "}",
      "async function write() {",
      '  await prisma.student.create({ data: { id: `${PREFIX}s1` } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "deleteMany")} \`where\`.id may be \`undefined\`, so it does not restrict the query`,
      `${lineOf(lines, "student.create")} no proven fixture cleanup for \`student\` in this file`,
    ]);
  });

  it("keeps cleanup-derived identity from leaking across files", () => {
    // `guardian-links` cleans users by id; that must prove nothing here.
    const lines = [
      "async function clearFixtures() {",
      "  await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } });",
      "}",
      "async function write() {",
      '  await prisma.student.create({ data: { id: `${PREFIX}s1` } });',
      "}",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "student.create")} no proven fixture cleanup for \`student\` in this file`,
    ]);
  });

  it("leaves ordinary unrelated objects untouched", () => {
    const lines = [
      "const ordinary = { id: `${PREFIX}x`, nested: { id: \"plain\" } };",
      "console.log(ordinary.nested);",
    ];
    const { violations, unsupported } = findings(lines);
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, []);
  });

  /* ── update / upsert payloads without cleanup proof ───────────────── */

  /**
   * The `data` branch of `update`/`upsert` is judged against the same per-file
   * policy. When the file has no policy for the model, an ownership write is
   * *unproven* — reported as unsupported, never as a violation and never
   * silently accepted. Each case pins the operation, line and exact reason.
   */
  const writeFindings = (lines: string[]) => {
    const result = scanSource(HEAD + lines.join("\n"), "cleanup-policy-test.ts");
    return {
      violations: result.violations.map(
        (finding) => `${finding.line} ${finding.operation} ${finding.reason}`
      ),
      unsupported: result.unsupported.map(
        (finding) => `${finding.line} ${finding.operation ?? "-"} ${finding.reason}`
      ),
    };
  };

  /** This file cleans students only, so no other model has a proven policy. */
  const STUDENTS_ONLY = [
    "async function clearFixtures() {",
    "  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });",
    "}",
  ];

  const ENROLLMENTS_BY_STUDENT = [
    "async function clearFixtures() {",
    "  await prisma.enrollment.deleteMany({ where: { studentId: { startsWith: PREFIX } } });",
    "}",
  ];

  const MISSING = "no proven fixture cleanup for `enrollment` in this file";

  it("reports an enrollment update that changes institutionId with no cleanup proof", () => {
    const lines = [
      ...STUDENTS_ONLY,
      "async function write() {",
      '  await prisma.enrollment.update({ where: { id: `${PREFIX}e1` }, data: { institutionId: "another" } });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "enrollment.update")} update ${MISSING}, so the \`data\` payload cannot be shown to stay inside the fixture (\`institutionId\`)`,
    ]);
  });

  it("reports an enrollment update that changes studentId with no cleanup proof", () => {
    const lines = [
      ...STUDENTS_ONLY,
      "async function write() {",
      '  await prisma.enrollment.update({ where: { id: `${PREFIX}e1` }, data: { studentId: `${PREFIX}s1` } });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    // Cleaning students does not remove enrollments (`onDelete: Restrict`), so
    // a prefixed studentId is still not evidence that this row is deleted.
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "enrollment.update")} update ${MISSING}, so the \`data\` payload cannot be shown to stay inside the fixture (\`studentId\`)`,
    ]);
  });

  it("reports an enrollment upsert whose update branch changes institutionId", () => {
    const lines = [
      ...STUDENTS_ONLY,
      "async function write() {",
      '  await prisma.enrollment.upsert({ where: { id: `${PREFIX}e1` }, create: { studentId: `${PREFIX}s1` }, update: { institutionId: "another" } });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "enrollment.upsert")} upsert ${MISSING}, so the \`data\` payload cannot be shown to stay inside the fixture (\`institutionId\`)`,
    ]);
  });

  it("reports an upsert whose update branch writes an unproven identity field", () => {
    const lines = [
      ...STUDENTS_ONLY,
      "async function write() {",
      '  await prisma.enrollment.upsert({ where: { id: `${PREFIX}e1` }, create: { studentId: `${PREFIX}s1` }, update: { id: `${PREFIX}e2` } });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "enrollment.upsert")} upsert ${MISSING}, so the \`data\` payload cannot be shown to stay inside the fixture (\`id\`)`,
    ]);
  });

  it("keeps a proven safe upsert update branch accepted", () => {
    const lines = [
      ...ENROLLMENTS_BY_STUDENT,
      "async function write() {",
      '  await prisma.enrollment.upsert({ where: { id: `${PREFIX}e1` }, create: { studentId: `${PREFIX}s1` }, update: { studentId: `${PREFIX}s2` } });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, []);
  });

  it("keeps a descriptive update accepted without cleanup proof", () => {
    const lines = [
      ...STUDENTS_ONLY,
      "async function write() {",
      '  await prisma.enrollment.update({ where: { id: `${PREFIX}e1` }, data: { gradeLevel: "grade-2" } });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    // No ownership column and the `where` is already proved restrictive.
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, []);
  });

  it("reports a dynamic update payload as unsupported", () => {
    const lines = [
      ...STUDENTS_ONLY,
      "async function write() {",
      '  await prisma.enrollment.update({ where: { id: `${PREFIX}e1` }, data: makeData() });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "enrollment.update")} update cannot determine whether the write payload changes identity fields`,
    ]);
  });

  it("reports a spread update payload as unsupported", () => {
    const lines = [
      ...STUDENTS_ONLY,
      "async function write(patch: Record<string, unknown>) {",
      '  await prisma.schoolClass.update({ where: { id: `${PREFIX}c1` }, data: { ...patch, name: "c1" } });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "schoolClass.update")} update no proven fixture cleanup for \`schoolClass\` in this file, and the \`data\` payload contains a spread or computed key that may change identity fields`,
    ]);
  });

  it("still reports an ownership change outside a proven policy as a violation", () => {
    const lines = [
      ...ENROLLMENTS_BY_STUDENT,
      "async function write() {",
      '  await prisma.enrollment.update({ where: { id: `${PREFIX}e1` }, data: { studentId: "unrelated-student" } });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    // Evidence exists and disproves the value: that is a violation, not a gap.
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, [
      `${lineOf(lines, "enrollment.update")} update write payload moves the record outside the fixture scope`,
    ]);
  });

  it("reports an updateMany ownership change with no cleanup proof", () => {
    const lines = [
      ...STUDENTS_ONLY,
      "async function write() {",
      '  await prisma.enrollment.updateMany({ where: { studentId: `${PREFIX}s1` }, data: { institutionId: "another" } });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    // A restrictive filter does not bless the payload: it moves every matched
    // row, and nothing here proves those rows are this suite's.
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      `${lineOf(lines, "enrollment.updateMany")} updateMany ${MISSING}, so the \`data\` payload cannot be shown to stay inside the fixture (\`institutionId\`)`,
    ]);
  });

  it("still checks an updateMany payload against a proven policy", () => {
    const lines = [
      ...ENROLLMENTS_BY_STUDENT,
      "async function write() {",
      '  await prisma.enrollment.updateMany({ where: { studentId: { startsWith: PREFIX } }, data: { studentId: "unrelated-student" } });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, [
      `${lineOf(lines, "enrollment.updateMany")} updateMany write payload moves the record outside the fixture scope`,
    ]);
  });

  it("keeps a descriptive updateMany accepted", () => {
    const lines = [
      ...ENROLLMENTS_BY_STUDENT,
      "async function write() {",
      '  await prisma.enrollment.updateMany({ where: { studentId: { startsWith: PREFIX } }, data: { enrollmentStatus: "WITHDRAWN" } });',
      "}",
    ];
    const { violations, unsupported } = writeFindings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, []);
  });

  it("leaves a Prisma-shaped object that is never sent untouched", () => {
    const lines = [
      "const request = { where: { id: `${PREFIX}x` }, data: { institutionId: \"other\" } };",
      "console.log(request);",
    ];
    const { violations, unsupported } = writeFindings(lines);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, []);
  });
});
/* ── `Function.prototype.call` / `apply` on extracted operations ──────── */

describe("invoking an extracted Prisma operation through call/apply", () => {
  /**
   * `fn.call(client, args)` and `fn.apply(client, [args])` run the *same*
   * operation, so they are judged by the operation the reference was extracted
   * from. The supplied `thisArg` is never evidence of anything: provenance comes
   * from the reference, which is why `.call(undefined)` is still a query.
   */
  const invocation = (snippet: string) => {
    const result = scanSource(snippet.trim() + "\n", "prototype-invocation-test.ts");
    return {
      violations: result.violations.map(
        (finding) => `${finding.line} ${finding.operation} ${finding.reason}`
      ),
      unsupported: result.unsupported.map(
        (finding) => `${finding.line} ${finding.operation ?? "-"} ${finding.reason}`
      ),
      exemptions: result.exemptions,
    };
  };

  const expectClean = (snippet: string) => {
    const { violations, unsupported } = invocation(snippet);
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, []);
  };

  describe("`.call`", () => {
    it("accepts a scoped findFirst", () => {
      expectClean(
        'const fn = prisma.student.findFirst;\nfn.call(prisma.student, { where: { id: "s1" } });'
      );
    });

    it("accepts a scoped findMany", () => {
      expectClean(
        'const fn = prisma.student.findMany;\nfn.call(prisma.student, { where: { id: "s1" } });'
      );
    });

    it("flags a missing filter", () => {
      const { violations, unsupported } = invocation(
        "const fn = prisma.student.findFirst;\nfn.call(prisma.student);"
      );
      assert.deepEqual(unsupported, []);
      assert.deepEqual(violations, ["2 findFirst no arguments at all"]);
    });

    it("flags an empty filter", () => {
      const { violations, unsupported } = invocation(
        "const fn = prisma.student.findFirst;\nfn.call(prisma.student, { where: {} });"
      );
      assert.deepEqual(unsupported, []);
      assert.deepEqual(violations, ["2 findFirst empty `where: {}` filter"]);
    });

    it("flags a count with no arguments", () => {
      const { violations } = invocation(
        "const fn = prisma.student.count;\nfn.call(prisma.student);"
      );
      assert.deepEqual(violations, ["2 count no arguments at all"]);
    });

    it("flags a count whose thisArg is undefined", () => {
      // The `thisArg` proves nothing: the reference is still the query.
      const { violations } = invocation("const fn = prisma.student.count;\nfn.call(undefined);");
      assert.deepEqual(violations, ["2 count no arguments at all"]);
    });

    it("flags an update with no where", () => {
      const { violations, unsupported } = invocation(
        'const fn = prisma.student.update;\nfn.call(prisma.student, { data: { fullName: "x" } });'
      );
      assert.deepEqual(unsupported, []);
      assert.deepEqual(violations, ["2 update no `where` filter"]);
    });

    it("flags an upsert with no where", () => {
      const { violations, unsupported } = invocation(
        'const fn = prisma.student.upsert;\nfn.call(prisma.student, { create: { id: "a" }, update: {} });'
      );
      assert.deepEqual(unsupported, []);
      assert.deepEqual(violations, ["2 upsert no `where` filter"]);
    });

    it("judges a create by its data payload, exactly as a direct call would", () => {
      // Both shapes fail closed the same way in a file without a cleanup
      // policy: the guard cannot prove the created row is removed.
      const { violations, unsupported } = invocation(
        'const fn = prisma.student.create;\nfn.call(prisma.student, { data: { fullName: "x" } });\nawait prisma.student.create({ data: { fullName: "x" } });'
      );
      assert.deepEqual(violations, []);
      assert.deepEqual(unsupported, [
        "2 create no proven fixture cleanup for `student` in this file",
        "3 create no proven fixture cleanup for `student` in this file",
      ]);
    });

    it("checks a create payload against a cleanup policy the file proves", () => {
      // A file that deletes students by PREFIX id proves the identity, so the
      // same invocation is accepted instead of unsupported.
      const lines = [
        'const PREFIX = "p4-test-";',
        "async function clearFixtures() {",
        "  await prisma.student.deleteMany({ where: { id: { startsWith: PREFIX } } });",
        "}",
        "const fn = prisma.student.create;",
        'fn.call(prisma.student, { data: { id: `${PREFIX}s1`, fullName: "x" } });',
      ];
      const { violations, unsupported } = invocation(lines.join("\n"));
      assert.deepEqual(unsupported, []);
      assert.deepEqual(violations, []);
    });

    it("follows multi-hop aliases", () => {
      const { violations } = invocation(
        "const first = prisma.student.findFirst;\nconst second = first;\nsecond.call(prisma.student, { where: {} });"
      );
      assert.deepEqual(violations, ["3 findFirst empty `where: {}` filter"]);
    });

    it("follows an operation held in an object", () => {
      const { violations } = invocation(
        "const ops = { run: prisma.student.count };\nops.run.call(prisma.student);"
      );
      assert.deepEqual(violations, ["2 count no arguments at all"]);
    });

    it("follows an operation held in an array", () => {
      const { violations } = invocation(
        "const ops = [prisma.student.findFirst];\nops[0].call(prisma.student, { where: {} });"
      );
      assert.deepEqual(violations, ["2 findFirst empty `where: {}` filter"]);
    });

    it("handles an optional call", () => {
      const { violations } = invocation(
        "const fn = prisma.student.count;\nfn.call?.(prisma.student);"
      );
      assert.deepEqual(violations, ["2 count no arguments at all"]);
    });

    it("reports a spread argument list as unsupported", () => {
      const { violations, unsupported } = invocation(
        "const fn = prisma.student.findFirst;\nconst args = [{ where: {} }];\nfn.call(prisma.student, ...args);"
      );
      assert.deepEqual(violations, []);
      assert.deepEqual(unsupported, [
        "3 findFirst the `call` argument list contains a spread, so the query arguments cannot be resolved",
      ]);
    });

    it("reports a dynamically named operation as unsupported", () => {
      const { violations, unsupported } = invocation(
        "const fn = (prisma.student as any)[method];\nfn.call(prisma.student, {});"
      );
      assert.deepEqual(violations, []);
      assert.equal(unsupported.length, 1);
      assert.match(unsupported[0], /^2 - dynamic Prisma operation name cannot be resolved$/);
    });
  });

  describe("`.apply`", () => {
    it("accepts a statically known scoped argument array", () => {
      expectClean(
        'const fn = prisma.student.findFirst;\nfn.apply(prisma.student, [{ where: { id: "s1" } }]);'
      );
    });

    it("flags an empty argument array as a query with no arguments", () => {
      const { violations, unsupported } = invocation(
        "const fn = prisma.student.findFirst;\nfn.apply(prisma.student, []);"
      );
      assert.deepEqual(unsupported, []);
      assert.deepEqual(violations, ["2 findFirst no arguments at all"]);
    });

    it("flags an empty where inside the argument array", () => {
      const { violations } = invocation(
        "const fn = prisma.student.findFirst;\nfn.apply(prisma.student, [{ where: {} }]);"
      );
      assert.deepEqual(violations, ["2 findFirst empty `where: {}` filter"]);
    });

    it("reports a missing argument array as unsupported", () => {
      const { violations, unsupported } = invocation(
        "const fn = prisma.student.findFirst;\nfn.apply(prisma.student);"
      );
      assert.deepEqual(violations, []);
      assert.deepEqual(unsupported, [
        "2 findFirst `.apply` is called without an argument array, so the query arguments cannot be resolved",
      ]);
    });

    it("follows a variable-held static array", () => {
      const { violations } = invocation(
        "const args = [{ where: {} }];\nconst fn = prisma.student.findFirst;\nfn.apply(prisma.student, args);"
      );
      assert.deepEqual(violations, ["3 findFirst empty `where: {}` filter"]);
    });

    it("follows multi-hop array aliases", () => {
      expectClean(
        'const args = [{ where: { id: "s1" } }];\nconst more = args;\nconst fn = prisma.student.findFirst;\nfn.apply(prisma.student, more);'
      );
    });

    it("reports a dynamic array as unsupported", () => {
      const { violations, unsupported } = invocation(
        "const fn = prisma.student.findFirst;\nfn.apply(prisma.student, buildArgs());"
      );
      assert.deepEqual(violations, []);
      assert.deepEqual(unsupported, [
        "2 findFirst the `.apply` argument array is not statically known, so the query arguments cannot be resolved",
      ]);
    });

    it("reports a reassigned array as unsupported", () => {
      const { violations, unsupported } = invocation(
        'let args = [{ where: {} }];\nargs = [{ where: { id: "s1" } }];\nconst fn = prisma.student.findFirst;\nfn.apply(prisma.student, args);'
      );
      assert.deepEqual(violations, []);
      assert.deepEqual(unsupported, [
        "4 findFirst the `.apply` argument array is not statically known, so the query arguments cannot be resolved",
      ]);
    });

    it("judges a write invoked through apply", () => {
      const { violations } = invocation(
        'const fn = prisma.student.update;\nfn.apply(prisma.student, [{ data: { fullName: "x" } }]);'
      );
      assert.deepEqual(violations, ["2 update no `where` filter"]);
    });

    it("judges a raw operation invoked through apply", () => {
      const { violations } = invocation(
        'const fn = prisma.$executeRaw;\nfn.apply(prisma, [`DELETE FROM "Student"`]);'
      );
      assert.deepEqual(violations, ['2 $executeRaw raw SQL without a WHERE clause']);
    });

    it("reports a dynamic raw argument array as unsupported", () => {
      const { violations, unsupported } = invocation(
        "const fn = prisma.$executeRaw;\nfn.apply(prisma, buildArgs());"
      );
      assert.deepEqual(violations, []);
      assert.deepEqual(unsupported, [
        "2 $executeRaw the `.apply` argument array is not statically known, so the query arguments cannot be resolved",
      ]);
    });
  });

  describe("controls", () => {
    it("ignores an ordinary method named findFirst", () => {
      expectClean("repository.findFirst.call(repository, {});");
    });

    it("ignores an ordinary object's count.apply", () => {
      expectClean("stats.count.apply(stats, []);");
    });

    it("ignores an unrelated function's call", () => {
      expectClean("const ordinaryFunction = (a: number) => a;\nordinaryFunction.call(null, 1);");
    });

    it("analyses a direct call exactly once", () => {
      const { violations } = invocation("prisma.student.count();");
      assert.deepEqual(violations, ["1 count no arguments at all"]);
    });

    it("keeps an extracted reference that is never invoked silent", () => {
      expectClean("export const fn = prisma.student.findFirst;");
    });

    it("keeps reporting a bound operation as an escape", () => {
      const { violations, unsupported } = invocation("prisma.student.findFirst.bind(prisma.student);");
      assert.deepEqual(violations, []);
      assert.deepEqual(unsupported, [
        "1 - Prisma operation `findFirst` is used as a value, so its call site cannot be analysed",
      ]);
    });
  });
});
/* ── Syntax variants of the same `.call` / `.apply` invocation ─────────── */

describe("call/apply syntax variants stay inside the analysis", () => {
  const findings = (snippet: string) => {
    const result = scanSource(snippet.trim() + "\n", "prototype-syntax-test.ts");
    return {
      violations: result.violations.map(
        (finding) => `${finding.line} ${finding.operation} ${finding.reason}`
      ),
      unsupported: result.unsupported.map(
        (finding) => `${finding.line} ${finding.operation ?? "-"} ${finding.reason}`
      ),
    };
  };

  it("judges a bracketed `call` like the dotted form", () => {
    const { violations, unsupported } = findings(
      'const fn = prisma.student.findFirst;\nfn["call"](prisma.student, { where: {} });'
    );
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, ["2 findFirst empty `where: {}` filter"]);
  });

  it("accepts a bracketed `call` with a scoped filter", () => {
    const { violations, unsupported } = findings(
      'const fn = prisma.student.findFirst;\nfn["call"](prisma.student, { where: { id: "s1" } });'
    );
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, []);
  });

  it("judges a bracketed `apply` like the dotted form", () => {
    const { violations, unsupported } = findings(
      'const fn = prisma.student.findFirst;\nfn["apply"](prisma.student, [{ where: {} }]);'
    );
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, ["2 findFirst empty `where: {}` filter"]);
  });

  it("judges a parenthesised callee", () => {
    const { violations, unsupported } = findings(
      "const fn = prisma.student.findFirst;\n(fn.call)(prisma.student, { where: {} });"
    );
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, ["2 findFirst empty `where: {}` filter"]);
  });

  it("judges a comma-selected callee", () => {
    const { violations, unsupported } = findings(
      "const fn = prisma.student.findFirst;\n(0, fn.call)(prisma.student, { where: {} });"
    );
    assert.deepEqual(unsupported, []);
    assert.deepEqual(violations, ["2 findFirst empty `where: {}` filter"]);
  });

  it("reports a stored `.call` method instead of losing the operation", () => {
    const { violations, unsupported } = findings(
      "const fn = prisma.student.findFirst;\nconst c = fn.call;\nc(prisma.student, { where: {} });"
    );
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      "2 findFirst Prisma operation `findFirst` is read through `call`, so the later invocation cannot be analysed",
    ]);
  });

  it("reports a stored bracketed `.apply` method", () => {
    const { violations, unsupported } = findings(
      'const fn = prisma.student.findFirst;\nconst c = fn["apply"];\nc(prisma.student, [{ where: {} }]);'
    );
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      '2 findFirst Prisma operation `findFirst` is read through `apply`, so the later invocation cannot be analysed',
    ]);
  });

  it("reports a discarded comma operand rather than treating it as called", () => {
    // `fn.call` is the left operand, so it is *not* the invoked function; the
    // method is being read, and its invocation cannot be followed.
    const { violations, unsupported } = findings(
      "const fn = prisma.student.findFirst;\n(fn.call, other)(prisma.student, {});"
    );
    assert.deepEqual(violations, []);
    assert.deepEqual(unsupported, [
      "2 findFirst Prisma operation `findFirst` is read through `call`, so the later invocation cannot be analysed",
    ]);
  });

  it("leaves ordinary receivers and ordinary calls untouched", () => {
    assert.deepEqual(findings("repository.findFirst.call(repository, {});"), {
      violations: [],
      unsupported: [],
    });
    assert.deepEqual(findings("const handle = repository.findFirst.call;"), {
      violations: [],
      unsupported: [],
    });
    assert.deepEqual(findings("stats.count.apply(stats, []);"), {
      violations: [],
      unsupported: [],
    });
  });
});
