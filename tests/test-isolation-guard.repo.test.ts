import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  CLEANUP_RELATIONS,
  describeFindings,
  describeUnsupported,
  FIXTURES_ROOT,
  fixtureSources,
  scanRepository,
  scanSource,
  testSources,
} from "./support/isolation-guard";

/**
 * Repository half of the isolation guard.
 *
 * Two things are asserted here:
 *
 *   1. the real `tests/` tree contains no confirmed unscoped query and no
 *      Prisma access the guard could not resolve;
 *   2. the guard actually makes the guarantees that (1) relies on. A scanner
 *      that silently ignores a call would satisfy (1) vacuously, so every
 *      documented bypass from the security audit is replayed against a
 *      realistic multi-scope fixture and its finding is counted.
 *
 * Detection rules are unit-tested in `test-isolation-guard.test.ts`.
 */

describe("test isolation guard — the real suites", () => {
  it("has integration suites to scan", () => {
    assert.ok(testSources().length > 0, "no test sources found under tests/");
  });

  it("contains no confirmed unscoped query", () => {
    const { violations } = scanRepository();
    if (violations.length > 0) assert.fail(describeFindings(violations));
  });

  it("contains no unresolved Prisma access", () => {
    const { unsupported } = scanRepository();
    if (unsupported.length > 0) assert.fail(describeUnsupported(unsupported));
  });

  it("keeps exemptions exact and explicit", () => {
    const { exemptions } = scanRepository();
    assert.deepEqual(
      exemptions.map((exemption) => `${exemption.file}:${exemption.line}`),
      ["tests/supervisor-scope.test.ts:93"],
      "the only reviewed exemption is the seeded-institution read in supervisor-scope"
    );
  });
});

describe("test isolation guard — guarantees it relies on", () => {
  /**
   * One fixture exercising every bypass the audit confirmed, plus the
   * behaviours the guard must not lose: import aliasing, assignment-only
   * binding, multi-hop chains, lexical shadowing, nested scopes, spread
   * arguments and runtime SQL.
   */
  const fixture = [
    /* 1 */ 'import { prisma as importedClient } from "@/lib/prisma";',
    /* 2 */ "const hop1 = prisma;",
    /* 3 */ "const hop2 = hop1;",
    /* 4 */ "let assigned;",
    /* 5 */ "assigned = importedClient;",
    /* 6 */ "function shadowed() {",
    /* 7 */ "  const hop2 = { enrollment: {} };",
    /* 8 */ "  return hop2.enrollment.findMany();",
    /* 9 */ "}",
    /* 10 */ "async function scoped() {",
    /* 11 */ "  const inner = hop2;",
    /* 12 */ "  await inner.student.count({ where: { id: { startsWith: PREFIX } } });",
    /* 13 */ "}",
    /* 14 */ "await hop2.student.count();",
    /* 15 */ "await assigned.institution.deleteMany();",
    /* 16 */ "await prisma.student.findMany({ ...opts });",
    /* 17 */ "await prisma.$executeRaw(sql);",
    /* 18 */ "await prisma.student.findMany({ where: { OR: [], AND: [] } });",
  ].join("\n");

  const result = scanSource(fixture, "fixture.ts");

  it("detects the multi-hop alias call", () => {
    assert.ok(
      result.violations.some(
        (violation) => violation.line === 14 && violation.operation === "count"
      ),
      "expected the hop2 chain to resolve to the client"
    );
  });

  it("detects the assignment-only alias and the imported alias", () => {
    assert.ok(
      result.violations.some(
        (violation) => violation.line === 15 && violation.operation === "deleteMany"
      ),
      "expected `let assigned; assigned = importedClient;` to resolve to the client"
    );
  });

  it("resolves lexical shadowing instead of inheriting the outer alias", () => {
    const onShadowedLine = result.violations.filter((violation) => violation.line === 8);
    assert.deepEqual(onShadowedLine, [], "the local hop2 is a plain object, not the client");
  });

  it("keeps a scoped call inside a nested function clean", () => {
    const onScopedLine = result.violations.filter((violation) => violation.line === 12);
    assert.deepEqual(onScopedLine, []);
  });

  it("reports spread arguments and runtime SQL as unresolved", () => {
    const reasons = result.unsupported.map((finding) => finding.line).sort((a, b) => a - b);
    assert.deepEqual(reasons, [16, 17]);
  });

  it("flags combined empty logical operators", () => {
    assert.ok(result.violations.some((violation) => violation.line === 18));
  });

  it("accounts for every Prisma-shaped access in the fixture", () => {
    // 3 confirmed violations (14, 15, 18) and 2 unresolved (16, 17). Nothing
    // may disappear silently — this is the assertion that fails if the guard
    // regresses to ignoring a form.
    assert.equal(result.violations.length, 3);
    assert.equal(result.unsupported.length, 2);
    assert.equal(result.exemptions.length, 0);
  });
});

/**
 * `CLEANUP_RELATIONS` is the only hand-written cleanup metadata in the guard:
 * it says which foreign keys a dependent row is removed by when its parent is
 * deleted. Metadata that drifts from `prisma/schema.prisma` would either grant
 * an identity the database does not guarantee (a wrong `cascade: true`) or
 * withhold one it does, so it is re-derived here and compared entry for entry.
 *
 * The comparison is total in both directions: an entry the schema does not
 * have fails, and a schema relation the table omits also fails — an omitted
 * relation is silently unproven rather than evaluated.
 */
describe("test isolation guard — cleanup metadata matches the schema", () => {
  const camel = (name: string) => name[0].toLowerCase() + name.slice(1);

  type SchemaRelation = { model: string; name: string; target: string; field: string; cascade: boolean };

  const schemaRelations = (): SchemaRelation[] => {
    const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const found: SchemaRelation[] = [];
    let model: string | undefined;

    for (const raw of schema.split("\n")) {
      const line = raw.trim();
      const start = line.match(/^model\s+(\w+)\s*\{/);
      if (start) {
        model = camel(start[1]);
        continue;
      }
      if (line === "}") {
        model = undefined;
        continue;
      }
      if (!model || line.startsWith("//") || line.startsWith("@@")) continue;

      // `name Type?[] @relation("Label", fields: [fk], references: [id], …)`
      const relation = line.match(/^(\w+)\s+(\w+)\??(?:\[\])?\s+@relation\((.*)\)$/);
      if (!relation) continue;
      const field = relation[3].match(/fields:\s*\[(\w+)\]/);
      if (!field) continue;

      found.push({
        model,
        name: relation[1],
        target: camel(relation[2]),
        field: field[1],
        cascade: /onDelete:\s*Cascade/.test(relation[3]),
      });
    }

    return found;
  };

  const relations = schemaRelations();

  it("finds the to-one relations the schema declares", () => {
    assert.ok(
      relations.length >= 20,
      `schema relation parser found only ${relations.length} relations`
    );
  });

  it("declares exactly the schema's relations, with the schema's cascade", () => {
    const expected = relations
      .map((relation) =>
        `${relation.model}.${relation.name}(${relation.field})->${relation.target}` +
        (relation.cascade ? " cascade" : "")
      )
      .sort();

    const actual = Object.entries(CLEANUP_RELATIONS)
      .flatMap(([model, entries]) =>
        Object.entries(entries).map(
          ([name, info]) =>
            `${model}.${name}(${info.field})->${info.target}` + (info.cascade ? " cascade" : "")
        )
      )
      .sort();

    assert.deepEqual(actual, expected);
  });

  it("treats only onDelete: Cascade as removal evidence", () => {
    // `SetNull` and `Restrict` both leave the dependent row behind, so the
    // cascade flag must be false for every relation that is not Cascade.
    for (const relation of relations) {
      if (relation.cascade) continue;
      const entry = CLEANUP_RELATIONS[relation.model]?.[relation.name];
      assert.equal(
        entry?.cascade,
        false,
        `${relation.model}.${relation.name} must not claim cascade removal`
      );
    }
  });
});

/**
 * The adversarial fixtures are real repository files, so a binding form that
 * the scanner stops modelling shows up as a missing or extra finding here —
 * the repository test cannot pass because a form was never looked at.
 */
describe("test isolation guard — adversarial fixtures", () => {
  const scanFixture = (name: string) => {
    const full = path.join(FIXTURES_ROOT, name);
    const relative = path.relative(process.cwd(), full).split(path.sep).join("/");
    return scanSource(readFileSync(full, "utf8"), relative);
  };

  const confirmed = (name: string) =>
    scanFixture(name).violations.map((finding) => `${finding.operation} ${finding.text}`);

  const unresolved = (name: string) =>
    scanFixture(name).unsupported.map((finding) => finding.text);

  it("scans every fixture and keeps the fixtures out of the real-suite scan", () => {
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

  it("fails closed on ownership writes the file cannot prove it cleans", () => {
    const result = scanFixture("unproven-write.ts");

    // No case here is a proven violation: the file's cleanup covers students
    // and users, so an enrollment or class write is unproven, not unsafe.
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.exemptions, []);

    assert.deepEqual(
      result.unsupported.map((finding) => `${finding.line} ${finding.operation} ${finding.reason}`),
      [
        "20 update no proven fixture cleanup for `enrollment` in this file, so the `data` payload cannot be shown to stay inside the fixture (`institutionId`)",
        "34 upsert no proven fixture cleanup for `enrollment` in this file, so the `data` payload cannot be shown to stay inside the fixture (`institutionId`)",
        "47 update no proven fixture cleanup for `schoolClass` in this file, and the `data` payload contains a spread or computed key that may change identity fields",
      ]
    );

    // The descriptive enrollment update on line 27 stays accepted: it names no
    // ownership column and its `where` is already proved restrictive.
    assert.ok(
      result.unsupported.every((finding) => finding.line !== 27),
      "a descriptive update must not be reported"
    );
  });

  it("applies isolation rules inside transaction callbacks", () => {
    assert.deepEqual(confirmed("transactions.ts"), [
      "findMany return tx.student.findMany();",
      "deleteMany return alias.student.deleteMany();",
      "findMany prisma.student.findMany(),",
    ]);

    assert.deepEqual(unresolved("transactions.ts"), [
      "return tx.student.findMany();",
      "return tx.student.findMany();",
    ]);

    const reasons = scanFixture("transactions.ts").unsupported.map(
      (finding) => finding.reason
    );
    assert.ok(reasons.every((reason) => /is a parameter/.test(reason)));
    assert.deepEqual(scanFixture("transactions.ts").exemptions, []);
  });

  it("flags every undefined-valued predicate and no more", () => {
    assert.deepEqual(confirmed("undefined-filters.ts"), [
      'deleteMany return prisma.student.deleteMany({ where: { id: undefined } });',
      'deleteMany return prisma.student.deleteMany({ where: { id: { equals: undefined } } });',
      'deleteMany return prisma.student.deleteMany({ where: { id: { in: undefined } } });',
      'deleteMany return prisma.student.deleteMany({ where: { OR: [{ id: undefined }] } });',
      'deleteMany return prisma.student.deleteMany({ where: { AND: [{ id: undefined }] } });',
      'deleteMany return prisma.student.deleteMany({ where: { NOT: [{ id: undefined }] } });',
    ]);

    assert.deepEqual(unresolved("undefined-filters.ts"), [
      'return prisma.student.deleteMany({ where: { id } });',
      'return prisma.student.deleteMany({ where: { id: ids[0] } });',
    ]);

    const reasons = scanFixture("undefined-filters.ts").unsupported.map((finding) => finding.reason);
    assert.ok(reasons.every((reason) => /may be `undefined`/.test(reason)));
    assert.deepEqual(scanFixture("undefined-filters.ts").exemptions, []);
  });

  it("resolves parameter, destructuring and namespace scopes", () => {
    assert.deepEqual(confirmed("scope.ts"), [
      'findMany return prismaModule.prisma.student.findMany({});',
      'findMany return prismaModule.default.student.findMany({});',
      'findMany return db.student.findMany({});',
    ]);

    assert.deepEqual(unresolved("scope.ts"), [
      'export function defaultParameter(prisma: any, x = prisma.student.findMany({})) {',
      'return prisma.student.findMany({});',
      'return client.student.findMany({});',
      'return prisma.student.findMany({});',
      'return prisma.student.findMany({});',
    ]);

    const reasons = scanFixture("scope.ts").unsupported.map((finding) => finding.reason);
    assert.ok(reasons.every((reason) => /is a parameter/.test(reason)));
  });

  it("merges repeated var declarations into one ambiguous binding", () => {
    assert.deepEqual(confirmed("duplicate-var.ts"), [
      'findMany return handle.student.findMany({});',
    ]);
    assert.deepEqual(unresolved("duplicate-var.ts"), [
      'return db.student.findMany({});',
      'return client.student.findMany({});',
    ]);
  });

  it("reports only delegate-shaped or Prisma-named unknowns", () => {
    assert.deepEqual(confirmed("receivers.ts"), []);
    assert.deepEqual(unresolved("receivers.ts"), [
      'return client.student.findMany({});',
      'return db.findMany();',
    ]);
    assert.deepEqual(confirmed("fixtures-support.ts"), []);
    assert.deepEqual(unresolved("fixtures-support.ts"), []);
  });

  it("analyses extracted operation references instead of losing them", () => {
    const result = scanFixture("operation-references.ts");

    assert.deepEqual(
      result.violations.map((finding) => `${finding.operation} ${finding.text}`),
      [
        "findFirst return fn();",
        "findFirst return findFirst({ where: {} });",
        "count return tally({ where: {} });",
        'groupBy return second({ by: ["id"] });',
        "aggregate return fn({ where: {} });",
        '$executeRaw return raw`DELETE FROM "Student"`;',
      ]
    );

    assert.deepEqual(
      result.unsupported.map((finding) => `${finding.reason} :: ${finding.text}`),
      [
        "Prisma operation `findUniqueOrThrow` is used as a value, so its call site cannot be analysed :: return run(prisma.student.findUniqueOrThrow);",
        "Prisma operation `count` is used as a value, so its call site cannot be analysed :: return prisma.student.count;",
        "Prisma operation `deleteMany` escapes through an alias, so its call site cannot be analysed :: return run(fn);",
        "`fn` is an alias of a Prisma operation that is reassigned :: return fn({ where: {} });",
      ]
    );

    // `scopedThroughAlias` resolves the alias and accepts its fixture filter:
    // extraction must not turn a correctly scoped call into a finding.
    const lines = readFileSync(
      path.join(FIXTURES_ROOT, "operation-references.ts"),
      "utf8"
    ).split("\n");
    const scopedLine = lines.findIndex((line) => line.includes('fn({ where: { id: "s1" } })')) + 1;
    assert.ok(scopedLine > 0, "the scoped call line must exist in the fixture");
    assert.deepEqual(
      [...result.violations, ...result.unsupported]
        .filter((finding) => finding.line === scopedLine)
        .map((finding) => finding.text),
      []
    );
    assert.equal(result.exemptions.length, 0);
  });

  it("judges `.call`/`.apply` invocations with the original operation", () => {
    const result = scanFixture("prototype-invocations.ts");

    // Each invocation is judged by the operation the reference was extracted
    // from, never by the `thisArg`: an empty filter, a missing filter or a
    // missing argument list is the same finding it would be for a direct call.
    assert.deepEqual(
      result.violations.map((finding) => `${finding.line} ${finding.operation} ${finding.reason}`),
      [
        "23 findFirst empty `where: {}` filter",
        "28 count no arguments at all",
        "34 findFirst empty `where: {}` filter",
        "39 count no arguments at all",
        "44 findFirst empty `where: {}` filter",
        "49 count no arguments at all",
        "61 update no `where` filter",
        "73 findFirst no arguments at all",
        "96 update no `where` filter",
        "102 $executeRaw raw SQL without a WHERE clause",
        // The same invocation reached through a bracket key, parentheses and a
        // comma expression is judged identically.
        "124 findFirst empty `where: {}` filter",
        "129 findFirst empty `where: {}` filter",
        "134 findFirst empty `where: {}` filter",
        "140 findFirst empty `where: {}` filter",
      ]
    );

    assert.deepEqual(
      result.unsupported.map((finding) => `${finding.line} ${finding.operation} ${finding.reason}`),
      [
        "55 findFirst the `call` argument list contains a spread, so the query arguments cannot be resolved",
        "78 findFirst `.apply` is called without an argument array, so the query arguments cannot be resolved",
        "90 findFirst the `.apply` argument array is not statically known, so the query arguments cannot be resolved",
        // Storing the method instead of invoking it loses the operation, so it
        // is reported rather than becoming a later silent call.
        "145 findFirst Prisma operation `findFirst` is read through `call`, so the later invocation cannot be analysed",
        "150 findFirst Prisma operation `findFirst` is read through `apply`, so the later invocation cannot be analysed",
      ]
    );
    assert.equal(result.exemptions.length, 0);

    // The correctly scoped `.call` and the alias-held `.apply` argument array
    // are foundings-free: recognising the invocation must not turn a scoped
    // query into a finding, and the ordinary receivers must stay silent.
    for (const marker of [
      'fn.call(prisma.student, { where: { id: "p4-s1" } })',
      "fn.apply(prisma.student, more)",
      "repository.findFirst.call(repository, {})",
      "stats.count.apply(stats, [])",
      "add.call(null, 1)",
    ]) {
      const lines = readFileSync(
        path.join(FIXTURES_ROOT, "prototype-invocations.ts"),
        "utf8"
      ).split("\n");
      const line = lines.findIndex((text) => text.includes(marker)) + 1;
      assert.ok(line > 0, `the \`${marker}\` line must exist in the fixture`);
      assert.deepEqual(
        [...result.violations, ...result.unsupported]
          .filter((finding) => finding.line === line)
          .map((finding) => finding.reason),
        [],
        `\`${marker}\` must stay silent`
      );
    }
  });

  it("keeps destructuring defaults and dynamic keys from hiding an operation", () => {
    const result = scanFixture("dynamic-references.ts");

    // The two container entries in this fixture are direct references in a
    // variable-bound literal, so their calls are analysed; everything the
    // guard cannot prove is unsupported rather than dropped. `callForm()` is an
    // invocation through `Function.prototype.call`, judged with the original
    // `findFirst` operation, so its empty filter is a confirmed violation.
    assert.deepEqual(
      result.violations.map((finding) => `${finding.line} ${finding.operation} ${finding.reason}`),
      [
        "56 count no arguments at all",
        "61 findFirst no arguments at all",
        '65 findFirst empty `where: {}` filter',
      ]
    );
    assert.equal(result.exemptions.length, 0);

    assert.deepEqual(
      result.unsupported.map((finding) => `${finding.line} ${finding.reason} :: ${finding.text}`),
      [
        "19 `count` is destructured from a Prisma operation with a default value, so its identity is ambiguous :: return count();",
        "24 `first` is destructured from a Prisma operation with a default value, so its identity is ambiguous :: return first({ where: {} });",
        '29 `raw` is destructured from a Prisma operation with a default value, so its identity is ambiguous :: return raw`DELETE FROM "Student"`;',
        "40 dynamic Prisma operation name cannot be resolved :: return fn();",
        "46 dynamic Prisma operation name cannot be resolved :: return second({ where: {} });",
        "51 dynamic Prisma operation name cannot be resolved :: return run(fn);",
        "69 Prisma operation `findFirst` is used as a value, so its call site cannot be analysed :: return prisma.student.findFirst.bind(prisma.student);",
        "73 dynamic Prisma operation name cannot be resolved :: return (prisma.student as any)[method]();",
        "77 dynamic Prisma operation name cannot be resolved :: return run((prisma.student as any)[method]);",
      ]
    );

    // The unrelated destructuring default in the same file must stay silent:
    // no finding may land on it.
    const lines = readFileSync(path.join(FIXTURES_ROOT, "dynamic-references.ts"), "utf8").split(
      "\n"
    );
    const unrelated = lines.findIndex((line) => line.includes("id = \"unknown\"")) + 1;
    assert.ok(unrelated > 0, "the unrelated default line must exist in the fixture");
    assert.deepEqual(
      result.unsupported.filter((finding) => finding.line === unrelated),
      []
    );
  });

  it("follows operation references stored in local containers", () => {
    const result = scanFixture("containers.ts");

    assert.deepEqual(
      result.violations.map(
        (finding) => `${finding.line} ${finding.operation} ${finding.reason}`
      ),
      [
        "14 count no arguments at all",
        "20 findFirst empty `where: {}` filter",
        "26 count no arguments at all",
        "31 findFirst empty `where: {}` filter",
        "31 count no arguments at all",
        '37 $executeRaw raw SQL without a WHERE clause',
        "60 count no arguments at all",
        "72 count no arguments at all",
        "79 count no arguments at all",
      ]
    );

    assert.deepEqual(
      result.unsupported.map((finding) => `${finding.line} ${finding.reason}`),
      [
        "49 container `ops` is mutated after initialization, so its contents cannot be analysed",
        "54 dynamic key into a Prisma operation container cannot be resolved",
        "66 container `ops` holding a Prisma operation escapes, so its call sites cannot be analysed",
      ]
    );
    assert.equal(result.exemptions.length, 0);

    // `scopedThroughContainer` is correctly scoped and must stay clean.
    const lines = readFileSync(path.join(FIXTURES_ROOT, "containers.ts"), "utf8").split("\n");
    const scoped = lines.findIndex((line) => line.includes('ops.fn({ where: { id: "s1" } })')) + 1;
    assert.ok(scoped > 0, "the scoped container call must exist in the fixture");
    assert.deepEqual(
      [...result.violations, ...result.unsupported].filter((finding) => finding.line === scoped),
      []
    );
  });

  it("keeps conditional provenance and diagnoses what it cannot prove", () => {
    const result = scanFixture("conditionals.ts");

    assert.deepEqual(
      result.violations.map((finding) => `${finding.line} ${finding.operation} ${finding.reason}`),
      ["25 findFirst empty `where: {}` filter"]
    );

    assert.deepEqual(
      result.unsupported.map((finding) => `${finding.line} ${finding.reason}`),
      [
        "18 initialised from a conditional whose branches may hold a Prisma operation",
        "32 initialised from a conditional whose branches may hold a Prisma operation",
        "37 initialised from a conditional whose branches may hold a Prisma operation",
        "43 initialised from a conditional whose branches may hold a Prisma operation",
        "50 initialised from a conditional whose branches may hold a Prisma operation",
        "55 initialised from a conditional whose branches may hold a Prisma operation",
        "61 `ops` is an alias of a Prisma operation that is reassigned",
      ]
    );
    assert.equal(result.exemptions.length, 0);

    // The unrelated conditional in the same fixture must stay silent.
    const lines = readFileSync(path.join(FIXTURES_ROOT, "conditionals.ts"), "utf8").split("\n");
    const unrelated = lines.findIndex((line) => line.includes("repository.count")) + 1;
    assert.ok(unrelated > 0, "the unrelated conditional must exist in the fixture");
    assert.deepEqual(
      [...result.violations, ...result.unsupported].filter(
        (finding) => finding.line === unrelated || finding.line === unrelated + 1
      ),
      []
    );
  });

  it("resolves const keys and leaves dynamic keys unsupported", () => {
    const result = scanFixture("static-keys.ts");

    assert.deepEqual(
      result.violations.map((finding) => `${finding.line} ${finding.operation} ${finding.reason}`),
      [
        "14 count no arguments at all",
        "20 findFirst empty `where: {}` filter",
        "25 count no arguments at all",
        "30 count no arguments at all",
        "37 findFirst empty `where: {}` filter",
        "58 count no arguments at all",
      ]
    );

    assert.deepEqual(
      result.unsupported.map((finding) => `${finding.line} ${finding.reason}`),
      [
        "44 dynamic Prisma operation name cannot be resolved",
        "48 dynamic Prisma operation name cannot be resolved",
      ]
    );
    assert.equal(result.exemptions.length, 0);
  });

  it("rejects a trivially true WHERE and keeps constant SQL analysable", () => {
    const result = scanFixture("sql.ts");
    assert.deepEqual(
      result.violations.map((finding) => finding.text),
      ['return prisma.$executeRaw`DELETE FROM "Student" WHERE 1=1`;']
    );
    assert.match(result.violations[0].reason, /trivially true/);
    assert.deepEqual(
      result.unsupported.map((finding) => finding.text),
      ["return prisma.$executeRaw(sql as unknown as TemplateStringsArray);"]
    );
    assert.equal(result.exemptions.length, 0);
  });

  it("exempts a comment directive but not the same text in a string", () => {
    const result = scanFixture("exemptions.ts");
    assert.deepEqual(
      result.violations.map((finding) => finding.text),
      ['return prisma.user.count(); // "isolation-guard: allow" is data, not a directive']
    );
    assert.deepEqual(
      result.exemptions.map((finding) => finding.operation),
      ["count"]
    );
    assert.equal(result.unsupported.length, 0);
  });
});
