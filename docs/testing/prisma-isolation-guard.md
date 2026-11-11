# Prisma Test Isolation Guard

Static analysis for the Sarh integration test suite. It reads every test file under
`tests/`, proves whether each Prisma call is scoped to the rows that file created, and
fails the build when it can find a query that is not.

| | |
|---|---|
| Implementation | [`tests/support/isolation-guard.ts`](../../tests/support/isolation-guard.ts) |
| Unit / regression tests | [`tests/test-isolation-guard.test.ts`](../../tests/test-isolation-guard.test.ts) |
| Repository scan + fixtures | [`tests/test-isolation-guard.repo.test.ts`](../../tests/test-isolation-guard.repo.test.ts) |
| Adversarial fixtures | [`tests/fixtures/isolation-guard/`](../../tests/fixtures/isolation-guard) |
| Prisma schema it mirrors | [`prisma/schema.prisma`](../../prisma/schema.prisma) |

---

## Contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [Architecture](#2-architecture)
3. [Prisma operation policies](#3-prisma-operation-policies)
4. [Fixture identity and cleanup policy](#4-fixture-identity-and-cleanup-policy)
5. [Value and expression analysis](#5-value-and-expression-analysis)
6. [Transactions](#6-transactions)
7. [Containers and extracted operations](#7-containers-and-extracted-operations)
8. [Raw SQL](#8-raw-sql)
9. [Diagnostics and exemptions](#9-diagnostics-and-exemptions)
10. [Limitations](#10-limitations)
11. [Developer maintenance guide](#11-developer-maintenance-guide)
12. [Running and verifying the guard](#12-running-and-verifying-the-guard)

---

## 1. Purpose and scope

### 1.1 Why the guard exists

`npm test` runs every file in `tests/` as its own `node:test` process, and all of those
processes share **one PostgreSQL database** ([`prisma/schema.prisma`](../../prisma/schema.prisma),
`provider = "postgresql"`). There is no per-worker schema and no truncation between files.
Two suites therefore run against the same tables at the same time.

That makes every query whose reach is the whole table a genuine data race:

- `prisma.student.findMany()` can read rows another suite is still building;
- `prisma.student.count()` can count another suite's fixtures;
- `prisma.student.deleteMany({})` deletes another suite's rows mid-run;
- `prisma.enrollment.update({ where: { id } , data: { institutionId: other } })` can move a
  row out of the scope its owner expects.

The suite cannot be made safe by "being careful" in review, because the unsafe shape is
ordinary Prisma. The guard turns that rule into a checked invariant: **every Prisma read,
write, delete and raw statement in a test file must be provably limited to the rows that
same file created and will delete.**

### 1.2 What it does and does not guarantee

**It guarantees, statically:**

- Every Prisma call whose receiver it can resolve is classified as scoped, unscoped, or
  unproven. Nothing is skipped silently for a form it models.
- A call that is not provably scoped produces a diagnostic in one of two buckets:
  a **violation** (confirmed unsafe) or **unsupported** (the analysis could not decide).
- Both buckets fail the repository test. `unsupported` is not a pass.

**It assumes, about this repository:**

- The only Prisma client instance is `src/lib/prisma.ts`, imported as `@/lib/prisma` or a
  relative path that resolves to it (`PRISMA_MODULE`, `isPrismaModule`).
- Test files clean up what they create in their own file (a `beforeEach`/`after`/`clearFixtures`
  style teardown calling `deleteMany` with a fixture prefix).
- Fixture rows are identifiable by a prefix or by the concrete ids the file used.

**It does not provide:**

- runtime isolation — it never touches a database, never opens a transaction and never
  checks a row count;
- a replacement for correct cleanup — it verifies that a suite *filters*, not that the
  filter matches anything;
- full Prisma typing — it is AST analysis, not the TypeScript type checker (see
  [Limitations](#10-limitations)).

**Conservatively diagnosed only:** cross-module helper returns, runtime-built payloads,
operation references stored in containers that are later mutated, and any receiver whose
identity cannot be established from the file. Those are reported as `unsupported` rather
than guessed in either direction.

### 1.3 Files scanned, and files excluded

`testSources()` walks `tests/`, keeps `.ts`/`.tsx`, and excludes by **exact repository
path** (never by basename):

| Excluded | Why |
|---|---|
| `tests/support/isolation-guard.ts` | the analyser itself |
| `tests/test-isolation-guard.test.ts` | unit tests containing unsafe snippets as strings |
| `tests/test-isolation-guard.repo.test.ts` | repository assertions |
| `tests/fixtures/isolation-guard/**` | deliberate adversarial code, asserted separately |

Currently there are **11 real suites** and **14 fixtures**. Application code under `src/`
is not scanned — the guard is about test isolation, not production queries.

### 1.4 How it participates in `npm test`

The `test` script in [`package.json`](../../package.json) lists every suite explicitly and
runs the guard's two files last (abridged here — the real line also names the eight other
suites):

```json
"test": "node --import tsx --test tests/supervisor-scope.test.ts ... tests/test-isolation-guard.test.ts tests/test-isolation-guard.repo.test.ts"
```

The repository test is what fails a pull request: it scans all 11 real suites and asserts
zero violations, zero unsupported findings, and exactly one reviewed exemption.

---

## 2. Architecture

The guard is one file with a deliberately linear pipeline. Everything is derived from the
TypeScript compiler API (`import ts from "typescript"`, already a devDependency); the
TypeChecker is never used.

```
source text
   │
   ├─ ts.createSourceFile            → AST
   ├─ buildScopeModel                → lexical scope tree + writes + named functions
   ├─ createResolver                 → Binding resolution (client / delegate / operationRef …)
   ├─ markTransactionClients         → which callback parameters are transaction clients
   ├─ buildCleanupPolicy             → per-file cleanup evidence
   │
   ├─ visit(AST)                     → per-call-site analysis
   │     ├─ analyzeWhere / analyzeFilterObject      (filter scope)
   │     ├─ analyzeWriteData / analyzeRecord        (write payload identity)
   │     ├─ constantSql / sqlScope                  (raw SQL)
   │     ├─ examinePrototypeInvocation              (`.call` / `.apply`)
   │     └─ record / recordUnsupported              (diagnostics)
   │
   └─ ScanResult { violations, exemptions, unsupported }
```

### 2.1 Scope model — `buildScopeModel`

Builds a `Scope` tree (`module`, `function`, `block`) and maps every node to its owning
scope (`model.nodeScope`). Every binding form is declared on the scope that owns it:
`var`/`let`/`const`, parameters, destructuring, rest elements, catch parameters, loop
bindings and imports.

Two details matter:

- Repeated `var`/`let` declarations of one name are **one** binding (`Scope.declare`),
  so the last initializer cannot silently hide earlier writes.
- `model.writes` keeps the full assignment history per declaration, and
  `model.memberWrites` records names whose members were assigned (`ops.run = f`).
- `model.namedFunctions` indexes function declarations so a statically-called local helper
  can be inlined.

### 2.2 Binding resolution — `createResolver`

`resolveExpression(expr, scope)` returns a `Binding`:

| Binding | Meaning |
|---|---|
| `client` | the Prisma client singleton, a proven alias, or a transaction callback parameter |
| `delegate` | a model delegate: `prisma.student` |
| `operationRef` | one operation detached from its delegate: `const c = prisma.student.count` |
| `container` | a local object/array literal holding operation references |
| `namespace` | a module namespace import that re-exports Prisma |
| `nonClient` | proven *not* to be Prisma (an unrelated object) |
| `unknown` | identity could not be established, with a `reason` |
| `none` | no binding at all |

Resolution follows imports (`modulePath`/`isPrismaModule`), aliases, assignment history,
destructuring and `var` merging. `resolveExpression` on an unknown binding is what produces
most `unsupported` findings.

`resolver.valueVerdict()` is a second, narrower question used by filter analysis: *is this
value certainly not `undefined`?* It returns `defined` / `maybe` / `none` / `unknown`, so a
predicate that might be `undefined` can be rejected.

### 2.3 Transaction pre-pass — `markTransactionClients`

Runs before any binding resolution (it must, because the resolver consults its result). A
callback parameter is recorded in `model.transactionParams` **only** when it is the first
parameter of a callback handed to `$transaction` on a receiver already proven to be a
`client`. A parameter merely *named* `tx` is never assumed to be a transaction client.

### 2.4 Filter analysis — `analyzeWhere` / `analyzeFilterObject` / `analyzeLogical`

Answers one question: does this `where` object provably restrict?

- Wrappers (`as`, `satisfies`, `!`, parenthesised) are unwrapped.
- A single-assignment identifier alias is followed (depth limit 8); a reassigned one is
  `unknown`.
- Non-literal `where` → `unknown`.
- `{}` → `empty`.
- Otherwise each property contributes: a value that is `defined` is **definite**; a value
  that `may be undefined` is **conditional** (Prisma drops `undefined` predicates);
  an unanalysable one is **unknown**; an empty nested object contributes nothing.
- `OR` with any empty branch is ineffective (`OR: [{}]` matches everything); `AND` is
  restrictive if one branch is; `NOT` is judged like `AND`.

One definite condition is enough for `restrictive`. Any `unknown` dominates. The guard does
not check uniqueness, so `findUnique({ where: { id } })` is judged by the same rule as
`findMany` — a defined predicate.

### 2.5 Write-payload analysis — `analyzeCreateArguments` / `analyzeDataValue` / `analyzeRecord` / `analyzeWriteData`

For `create`/`createMany` the payload must carry **fixture identity**: at least one column
that this file's own teardown deletes by, holding a value that matches that evidence.

For `update`/`updateMany`/`upsert` the payload must **not move the record out of scope**:
any column named in the file's cleanup policy is compared against its evidence, and a
mismatch is a violation. The payload is never required to *set* identity — only to not
break it.

`unprovenWriteVerdict` is the fail-closed branch used when the file has no policy for the
model (see [§4.6](#46-when-there-is-no-policy)).

### 2.6 Raw SQL — `constantSql` / `sqlScope`

`constantSql` establishes the literal text of a template or of a single-assignment alias
(depth 4). `sqlScope` then requires a `WHERE` clause whenever the text names a table, and
rejects a trivial one. See [§8](#8-raw-sql).

### 2.7 Cleanup policy — `buildCleanupPolicy`

Derives `model → column → evidence` from the file's own `delete`/`deleteMany` predicates,
then closes over `CLEANUP_RELATIONS` cascades. See [§4](#4-fixture-identity-and-cleanup-policy).

### 2.8 Diagnostics — `record` / `recordUnsupported`

`record` produces a `Finding` and routes it to `violations` or `exemptions` depending on
whether the line (or the line above) carries the `isolation-guard: allow` directive.
`recordUnsupported` produces an `UnsupportedFinding`, optionally carrying the `operation`.
Both deduplicate by node start position (`seen`), so one call site yields at most one
finding.

---

## 3. Prisma operation policies

Dispatch is by **operation name**, never by the presence of `where`. The operation sets are
`MODEL_OPERATIONS` and `RAW_OPERATIONS`; `isModelOperation` / `isRawOperation` gate the
dispatch and `CREATE_OPERATIONS` (`create`, `createMany`) marks the payload-judged pair.

### 3.1 Read operations

| Operation | Examined | Scoped when | Violation | Unsupported | Analyzer |
|---|---|---|---|---|---|
| `findMany` | `where` | filter is `restrictive` | no `where`; empty `{}`; `where: undefined`/`null`; ineffective `OR`/`AND` | non-literal `where`; spread; computed key; `undefined`-able predicate | `analyzeWhere` |
| `findFirst` | `where` | same | same | same | `analyzeWhere` |
| `findFirstOrThrow` | `where` | same | same | same | `analyzeWhere` |
| `findUnique` | `where` | same | same | same | `analyzeWhere` |
| `findUniqueOrThrow` | `where` | same | same | same | `analyzeWhere` |
| `count` | `where` | same | same | same | `analyzeWhere` |
| `aggregate` | `where` | same | same | same | `analyzeWhere` |
| `groupBy` | `where` | same | same | same | `analyzeWhere` |

`take`, `skip`, `orderBy`, `select`, `cursor`, `distinct` and `include` do **not** isolate:
`findMany({ take: 1 })` is still a table-wide read. Only `where` is judged.

### 3.2 Create operations

| Operation | Examined | Scoped when | Violation | Unsupported | Analyzer |
|---|---|---|---|---|---|
| `create` | `data` | a cleanup-proven column holds a matching value (or a same-file `create` result) | no `data`; empty record; no proven identity; value outside scope; payload not an object | payload unresolvable; model unproven; spread hides keys | `analyzeCreateArguments` |
| `createMany` | `data` (object or array) | every record individually satisfies the above | any record unscoped; mixed array; non-object/array payload; empty array | any record ambiguous; array `open`; model unproven | `analyzeDataValue` |

**Why no `where`:** Prisma's create API has no `where` clause. The only way a new row can be
attributable is through the values written into it, so create is judged by `data` alone. The
guard distinguishes the two by `CREATE_OPERATIONS` before it ever looks for `where` — this is
why `create({ data })` is never reported as "missing where".

### 3.3 Update operations

| Operation | Examined | Scoped when | Violation | Unsupported | Analyzer |
|---|---|---|---|---|---|
| `update` | `where` + `data` | filter restrictive **and** payload does not contradict a cleanup-proven column | missing/empty/ineffective `where`; payload moves a proven column out of scope | non-literal `where`; unresolvable or ambiguous payload; ownership column with no policy | `analyzeArguments` → `analyzeWhere` then `analyzeWriteData` |
| `updateMany` | `where` + `data` | same | same | same | same |

`updateMany` writes the same payload to every matched row, so a restrictive filter does not
bless the payload: it is checked exactly like `update`.

### 3.4 Upsert

`upsert` is three independent checks on one call:

| Branch | Requirement | On failure |
|---|---|---|
| `where` | must be restrictive | violation / unsupported per `analyzeWhere` |
| `update` | payload must not move a proven column out of scope | violation (mismatch) / unsupported (unproven) |
| `create` | payload must carry fixture identity | violation / unsupported per `analyzeDataValue` |

A safe `where` never blesses an unprovable `update` or `create` branch; each is judged on its
own evidence. A missing `update` branch is not a violation (Prisma's own types require it),
and a missing `create` branch is a violation — `no `create` payload``.

### 3.5 Delete operations

| Operation | Examined | Scoped when | Violation | Unsupported | Analyzer |
|---|---|---|---|---|---|
| `delete` | `where` | filter is restrictive | no `where`; empty `{}`; `where: undefined` | non-literal `where` | `analyzeWhere` |
| `deleteMany` | `where` | filter is restrictive | no `where`; empty `{}`; ineffective `OR` | non-literal `where` | `analyzeWhere` |

Delete is filtered-only. Its `data` (which does not exist in the API) is never analysed, and
a delete is not required to carry fixture identity — the filter *is* the scope.

### 3.6 Raw SQL operations

| Operation | Examined | Accepted when | Violation | Unsupported | Analyzer |
|---|---|---|---|---|---|
| `$queryRaw` | tag / argument text | text names no table, or names one **and** has a non-trivial `WHERE` | no `WHERE`; trivially true `WHERE` | text composed at runtime | `constantSql` + `sqlScope` |
| `$executeRaw` | same | same | same | same | same |
| `$queryRawUnsafe` | — | never | always (`raw unsafe SQL cannot be verified statically`) | — | `examineRawCall` |
| `$executeRawUnsafe` | — | never | always | — | `examineRawCall` |

`$transaction` itself is not an operation: it is handled as transaction provenance
([§6](#6-transactions)) and never judged as a query.

Every row above describes the *analyzer*, not the call syntax. A direct call
(`prisma.student.findMany({…})`), a call through an extracted reference (`fn({…})`, `ops[0](…)`)
and an invocation through `.call`/`.apply` all reach the same per-operation analyzer
([§7.1](#71-functionprototypecall-and-apply)), so no operation gets a weaker rule by being
invoked indirectly.

---

## 4. Fixture identity and cleanup policy

### 4.1 The evidence chain

```
test file
   └─ its own delete/deleteMany predicates
        └─ model → column → { exact values, prefixes, fixture-pointer }
             └─ write validation (create identity, update ownership)
```

A column counts as **fixture identity for that file only** because that file's own teardown
removes rows by it. There is no global model → identity table; the guard deliberately never
accepts a column because it exists in the schema.

### 4.2 Direct cleanup predicates

`collectCleanup` reads one filter object and returns whatever it proves gets deleted:

- `where: { id: { startsWith: PREFIX } }` → `user.id` evidence `prefix("p3a-test-")`
- `where: { email: { startsWith: PREFIX } }` → `user.email` prefix
- `where: { id: { in: [a, b] } }` → `id` values `{a, b}`
- `OR: [...]` / `AND: [...]` branches are unioned; `NOT` is ignored (exclusions prove nothing)
- a relation filter is mapped to its foreign key when the nested filter is itself
  cleanup-scoped: `where: { parent: { email: { startsWith: PREFIX } } }` on `student`
  proves `student.parentId` (relation name and FK column come from `CLEANUP_RELATIONS`)

### 4.3 `CLEANUP_RELATIONS`

A hand-written transcription of `prisma/schema.prisma`'s to-one relations:

```ts
studentGuardianGrant: {
  link:        { field: "linkId",        target: "studentGuardian", cascade: true },
  institution: { field: "institutionId", target: "institution",      cascade: true },
},
enrollment: {
  student:     { field: "studentId",     target: "student",     cascade: false },
  institution: { field: "institutionId", target: "institution", cascade: false },
  class:       { field: "classId",       target: "schoolClass", cascade: false },
},
```

It exists for exactly two reasons:

1. to translate a relation filter (`parent: { email: … }`) into the FK column it constrains;
2. to propagate removal through **`onDelete: Cascade`** (below).

The repository test re-reads the schema and asserts the table is equal in **both**
directions — every `@relation(… fields: […])` present, every entry real, `field`/`target`
matching, and `cascade` true only where the schema says `onDelete: Cascade`:

```
it("declares exactly the schema's relations, with the schema's cascade")
it("treats only onDelete: Cascade as removal evidence")
```

### 4.4 Cascade versus Restrict

| Referential action | Removal evidence? | Consequence |
|---|---|---|
| `onDelete: Cascade` | **yes** — deleting the parent deletes the row | the FK column inherits the parent's proven columns |
| `onDelete: SetNull` | no — the row survives with a null FK | FK column proves ownership only |
| `onDelete: Restrict` (and the default) | no — and the parent delete is blocked rather than propagating | FK column proves **nothing** about removal |

This is why `enrollment.studentId` does not become valid just because `student` is cleaned:
`Enrollment.student` has no cascade, so the enrollment row survives. The same rule rejects
`schoolClass.institutionId` and `student.parentId` as sole identity evidence.

Cascades currently in the schema: `studentGuardian.student`, `studentJoinCode.student`,
`studentGuardianEvent.student`, `studentGuardianGrant.link`, `studentGuardianGrant.institution`.

### 4.5 Collect-then-delete

Some suites cannot clean by prefix because the code under test generates ids. They read the
rows with a scoped predicate and delete exactly what they read:

```ts
const rows = await prisma.student.findMany({
  where: { OR: [{ id: { startsWith: PREFIX } }, { fullName: { startsWith: namePrefix } }] },
  select: { id: true },
});
const ids = rows.map((row) => row.id);
await prisma.student.deleteMany({ where: { id: { in: ids } } });
```

`buildCleanupPolicy` recognises this: when a `deleteMany` constrains `id` in a form the
analysis cannot resolve (`constrainsUnresolvedId`), the file's scoped reads supply the
evidence. That is how `tests/institution-students.test.ts` legitimately proves
`student.fullName` — the column its own read collects on — and why the same
`fullName` payload is *not* accepted in a file without that read.

### 4.6 When there is no policy

Three outcomes depending on the model and the payload:

| Situation | Result |
|---|---|
| `create`/`createMany`, model unproven | **unsupported** — `no proven fixture cleanup for `<model>` in this file` |
| `update`/`updateMany`/`upsert` payload names an ownership column (`id` or a `CLEANUP_RELATIONS` FK) | **unsupported**, naming the columns |
| `update`/`updateMany`/`upsert` payload names only non-ownership columns | accepted — the `where` was already proved restrictive, which is the same bar a read or delete clears |
| payload is an unresolvable spread or computed key | **unsupported** — it may carry an ownership column |
| model absent from `CLEANUP_RELATIONS` entirely (`user`, or a model that does not exist) | **unsupported** for any non-empty payload — not one field, including `id`, can be classified |

No case in this table is ever reported as a violation: missing evidence means *unproven*, and
an invented violation would be as wrong as a silent pass.

### 4.7 Evidence is never shared between files

Each `scanSource` call builds a fresh policy from that file alone. `tests/guardian-links.test.ts`
cleaning users by `id` proves nothing for a `student` create in another suite, and the unit
test `"keeps cleanup-derived identity from leaking across files"` pins exactly that.

A consequence worth knowing: a suite that creates a row and forgets to clean that model will
now see `unsupported` findings. That is intentional — the guard is pointing at a real
missing teardown.

---

## 5. Value and expression analysis

`evaluateStatic` turns an expression into a `StaticValue`. It is deliberately small and
bounded (`MAX_EVAL_DEPTH = 20`).

### 5.1 Supported

| Form | Example |
|---|---|
| string literal | `"p4-test-student-a"` |
| no-substitution template | `` `p4-test-student-a` `` |
| template with a constant prefix | `` `${PREFIX}student-${suffix}` `` → prefix `p4-test-student-` |
| constant `PREFIX` | `const PREFIX = "p4-test-"` |
| multi-hop alias | `const first = PREFIX; const second = first` |
| lexical shadowing | an inner `const hop2` overrides the outer alias in its scope |
| assignment history | one write is followed; a reassigned binding is `unknown` |
| object / array literal | `{ id: … }`, `[{ … }, { … }]` |
| static spread | `{ ...constObject }` spreads resolvable entries |
| `.map()` over a known array | one record per element, callback parameters bound |
| local helper inlined with constant args | `const id = (n) => `${PREFIX}${n}`` |
| `as` / `satisfies` / `!` / parentheses | unwrapped |

### 5.2 Accepted

```ts
const PREFIX = "p4-test-";
await prisma.student.create({ data: { id: `${PREFIX}student-a` } });
```

### 5.3 Violation

```ts
const PREFIX = "p4-test-";
// The prefix is present, but only in a descriptive column: nothing this file
// deletes by is set, so the row cannot be attributed to the suite.
await prisma.student.create({ data: { fullName: `${PREFIX}student-a` } });
// → create: no fixture-scoped identity in `data` payload
```

### 5.4 Unsupported

```ts
await prisma.student.create({ data: buildStudent(PREFIX) });
// → unsupported: cannot determine fixture scope of `data` payload
```

### 5.5 Why finding `PREFIX` is not enough

Ownership is a property of *column × value × this file's teardown*, not of a substring. A
`PREFIX` in `fullName` says nothing about which rows `clearFixtures()` deletes; a `PREFIX` in
`institutionId` says nothing when the relation is `Restrict`; and a `PREFIX` in a field this
file cleans by is exactly what proves the row is safe. The guard therefore matches values
against evidence, never against the string `PREFIX`, and never resolves types with the
TypeChecker — a `data` object annotated as `Prisma.StudentCreateInput` is analysed by its
literal contents, not its declared type.

---

## 6. Transactions

`prisma.$transaction(cb)` is handled as provenance, not as a query.

- **Callback form.** `markTransactionClients` marks the first parameter of the callback
  **only** when the `$transaction` receiver resolves to a `client`. The resolver then treats
  that parameter as `client`, so `tx.student.count()` gets the same rules as
  `prisma.student.count()`.
- **Aliases of a transaction client.** `const inner = tx` resolves through the ordinary
  scope/binding machinery.
- **Array form.** `prisma.$transaction([prisma.a.count(), …])` contains ordinary model calls;
  each element is analysed independently and the array itself is not a query. An unscoped
  element is flagged on its own line.
- **Unsupported parameters.** A parameter merely *named* `tx` is **not** a transaction
  client: `function helper(tx) { tx.student.count() }` is reported as an unresolved parameter.
  This is the fixture `tests/fixtures/isolation-guard/transactions.ts` asserts.
- Teardown inside a transaction still counts as cleanup evidence, because
  `buildCleanupPolicy` runs after the transaction pre-pass.

---

## 7. Containers and extracted operations

Operations detached from their delegate are followed so the call site is judged, not the
storage site.

```
const count = prisma.student.count;          // operationRef
const ops   = { a: prisma.student.count };   // container
const list  = [prisma.student.findMany];     // container
```

Recognised patterns:

- variable aliases (`const c = prisma.student.count`), single-assignment only;
- containers of any nesting: object literals, arrays, nested literals
  (`{ inner: { run: … } }`, `[prisma.student.count]`);
- statically named keys, read as `ops.a`, `ops["a"]`, `ops.inner.run`, `list[0]`;
- a dynamic key (`ops[key]`) cannot be resolved → `dynamic key into a Prisma operation
  container cannot be resolved`; a dynamic method name (`prisma.student[method]()`) →
  `dynamic Prisma operation name cannot be resolved`;
- conditional references (`const op = flag ? a : b`) — resolve to a *possible* operation and
  are reported as `unsupported`;
- detached calls (`c({ where })`, `ops.a({ where })`, `` ops[0]`…` ``) — the receiver is
  proven and only the arguments are judged;
- `Function.prototype.call`/`apply` on such a reference — see 7.1.

Mutations change the container's trustworthiness:

| Mutation | Effect |
|---|---|
| `ops.a = f`, `ops[key] = f` | `mutated` — later reads through it are unsupported |
| `delete ops.a` | `mutated` — the entry's origin is gone |
| `ops.push(f)`, `pop`, `shift`, `unshift`, `splice`, `fill`, `copyWithin`, `sort`, `reverse` (`MUTATING_ARRAY_METHODS`) | `mutated` |

Escape diagnostics. Anything that hands an operation reference or a container holding one to
code the guard cannot follow is reported rather than assumed:

- an argument: `consume(ops)` → `container `ops` holding a Prisma operation escapes…`
- a return value
- a property value in an inline literal
- an alias handed onward: `Prisma operation `count` escapes through an alias…`
- an operation used as a value anywhere else: `Prisma operation `count` is used as a value,
  so its call site cannot be analysed`

Storage is not an escape. `const fn = prisma.student.count` and `fn = prisma.student.count`
are followed to the call; only a literal that is *not* bound to a variable (`run({ run: … })`)
reports at the reference.

The conservative consequence: a container that is mutated or escapes is not partially
trusted. Its later call sites become `unsupported` even if they happen to be scoped.

### 7.1 `Function.prototype.call` and `apply`

An extracted operation can be executed without being called directly. `examinePrototypeInvocation`
recognises `.call`/`.apply` **only** when the receiver resolves to a proven `operationRef`
(directly, through an alias, or through a container entry), then hands the invocation to the
same analyzer a direct call would use — `examineDetachedCall` with the reference's own
operation and model.

```ts
const fn = prisma.student.findFirst;
fn.call(prisma.student, { where: { id: studentId } });   // accepted — id filter is fixture scope
fn.call(prisma.student, { where: {} });                 // violation — empty `where: {}` filter
fn.call(prisma.student);                                // violation — no arguments at all

const ops = { run: prisma.student.count };
ops.run.call(prisma.student);                           // violation — count takes no arguments

const args = [{ where: {} }];
const fn2 = prisma.student.findFirst;
fn2.apply(prisma.student, args);                        // violation — empty filter inside the array
```

| Shape | Behaviour |
|---|---|
| `fn.call(thisArg, …args)` | `thisArg` is argument 0 and is **never** a query argument; `…args` is the Prisma argument list. `fn.call(client)` and `fn.call(undefined)` are zero-argument queries |
| `fn.apply(thisArg, [a, b])` | array elements are flattened into the Prisma argument list (`resolveArgumentArray`); `.apply(client, [])` is a zero-argument query |
| `.call` with a spread (`fn.call(client, ...args)`) | `unsupported` — ``the `call` argument list contains a spread…`` |
| `.apply` without an argument array | `unsupported` — `` `.apply` is called without an argument array… `` |
| `.apply` with a non-literal array, a hole, a spread, a call result or a reassigned binding | `unsupported` — ``the `.apply` argument array is not statically known…`` |
| `fn["call"](…)`, `(fn.call)(…)`, `(0, fn.call)(…)` | the same invocation, judged the same way — `prototypeCallee` resolves the member through the brackets, parentheses and comma selection |
| storing the method (`const c = fn.call; c(…)`) or reading a discarded comma operand (`(fn.call, other)(…)`) | `unsupported` — ``Prisma operation `x` is read through `call`, so the later invocation cannot be analysed`` |

Provenance is taken from the reference, not from `thisArg`: `fn.call(undefined)` is still a
`count` query, and `repository.findFirst.call(repository, {})` stays an ordinary method call
because `repository.findFirst` resolved to nothing Prisma-shaped. The reference itself is no
longer reported as an escape — the invocation is judged once, at the call site.

A `.call`/`.apply` member that is read but not invoked is the one shape that cannot be judged:
the operation survives into a value the resolver does not track, so the read is reported
(`isInvokedCallee` decides). Bracket keys are resolved with `resolver.keyText`, so
`fn[method](…)` with a runtime `method` falls back to the dynamic-method rule instead.

`.bind()` is unchanged: a bound operation is still reported as an escape
(``Prisma operation `x` is used as a value, so its call site cannot be analysed``) because the
returned function can be invoked anywhere, and the guard does not follow bound call sites.

---

## 8. Raw SQL

Static inspection of the SQL text, not a SQL parser. Both the tagged form
(`` prisma.$queryRaw`…` ``, including a tag reached through an alias or a container,
`examineDetachedTag`) and a plain string argument are handled by the same `sqlScope`.

| Situation | Result |
|---|---|
| text names no table (e.g. `` `SELECT 1` ``) | accepted — there is nothing table-wide to leak |
| names a table and has `WHERE` | accepted unless the clause is trivial |
| names a table, no `WHERE` | violation — `raw SQL without a WHERE clause` |
| `WHERE` is `1=1`, `'1'='1'`, or `true` | violation — `raw SQL WHERE clause is trivially true` |
| argument composed at runtime (`buildSql()`) | unsupported — `raw SQL is composed at runtime…` |
| `$queryRawUnsafe` / `$executeRawUnsafe`, any argument | violation — `raw unsafe SQL cannot be verified statically` |

Table detection uses `TABLE_REFERENCE` (`FROM|INTO|UPDATE|DELETE|INSERT|TRUNCATE|DROP|ALTER|MERGE`);
the warm-up case (`SELECT 1`) passes because it names no table, not through an exemption list.
A constant SQL string is followed through one `const` alias (depth 4) and through
`${PREFIX}`-style template spans, whose literal parts are concatenated — a template span value
is not interpreted, so a dynamic id interpolated into SQL is only as trustworthy as the
surrounding text.

---

## 9. Diagnostics and exemptions

### 9.1 The four outcomes

| Outcome | Meaning | Fails the build? |
|---|---|---|
| **accepted** | proved scoped | no |
| **violation** | confirmed unscoped: table-wide read/write/delete, missing filter, unsafe SQL, payload outside scope | **yes** |
| **unsupported** | analysis could not prove scope (spread, runtime payload, dynamic alias, unproven model) | **yes** |
| **exemption** | a violation carrying a reviewed `isolation-guard: allow` directive | not counted as a violation; asserted exactly |

### 9.2 The directive

```ts
// isolation-guard: allow shared-seed-read — seeded institutions are shared baseline data
const institutions = await prisma.institution.findMany({ orderBy: { createdAt: "asc" }, take: 2 });
```

Rules, as implemented:

- `DIRECTIVE = /isolation-guard:\s*allow\b/` must be in a **comment on the query's line or
  the line immediately above**;
- string and template literals are stripped before matching (`stripLiterals`), so the text
  `"isolation-guard: allow"` inside a string is data, not a directive;
- the reason after `allow` is free text; keep it factual and specific.

### 9.3 The one exemption in this repository

`tests/supervisor-scope.test.ts:93` — the `before()` block reads two seeded institutions.
The seed is the only source of the real tenant topology, and the read shares baseline data
rather than rewriting it. The repository test pins the exemption list **exactly**:

```ts
assert.deepEqual(
  exemptions.map((exemption) => `${exemption.file}:${exemption.line}`),
  ["tests/supervisor-scope.test.ts:93"],
  "the only reviewed exemption is the seeded-institution read in supervisor-scope"
);
```

Adding an exemption therefore requires updating that assertion too — deliberately, so a new
exemption cannot slip in unnoticed.

### 9.4 Adding an exemption safely

1. Prove the query really cannot be scoped (shared seed, a table that only contains baseline
   data, an unavoidable platform-level read).
2. Put the directive on the query line or the line directly above, with a concrete reason.
3. Update the pinned exemption list in the repository test.
4. Explain in the pull request why the data is genuinely shared.

Never add a directive to silence `unsupported` — unsupported means *the analysis could not
tell*, and the fix is to make the call analysable (a literal `where`, a single-assignment
alias, a constant SQL string). Never exempt a table-wide delete or a payload write.

---

## 10. Limitations

These are real and known. Each yields `unsupported` unless noted — none is a silent
*acceptance* of a proven-unsafe query.

| Limitation | Behaviour |
|---|---|
| No TypeChecker | annotations, generics and inferred types are ignored; only literal structure is analysed |
| `.bind()` on an extracted operation (`const c = prisma.student.count.bind(prisma.student)`) | reported as an escape → `unsupported`; the bound call site itself is not followed |
| `.apply()` with a runtime-built argument array | `unsupported` — the query arguments cannot be reconstructed |
| Cross-module helper returns | only `undefined`-ness of an exported helper's return type is resolved (`createExternalReturnResolver`), and only during the repository scan |
| Runtime-built payloads / arrays built by a non-`.map` call | `unsupported` |
| Class methods and helper functions called with non-constant arguments | not inlined → `unsupported` |
| Containers that are mutated or escape | every later read is `unsupported` |
| `where` alias chains deeper than 8, static evaluation deeper than 20, SQL aliases deeper than 4 | `unsupported` |
| A model missing from `CLEANUP_RELATIONS` | all of its ownership fields are unclassifiable → `unsupported`; the schema-consistency test is what keeps the table complete |
| SQL semantics | no join/CTE/subquery reasoning: a `WHERE` on an unrelated condition still satisfies `sqlScope` |
| Runtime isolation | none — a scoped filter is verified syntactically, not against the database |

`unsupported` is preferred over acceptance because the two errors are not symmetric: a false
acceptance silently reintroduces the cross-suite race the guard exists to prevent, while a
false `unsupported` is a visible, fixable complaint that a human resolves in one edit.

---

## 11. Developer maintenance guide

### 11.1 New Prisma model used in tests

1. Add or extend that suite's teardown (`deleteMany` by a fixture prefix, or collect-then-delete).
2. If the model has no teardown, expect `unsupported` — that is the guard reporting a real gap.
3. Add a unit test in `tests/test-isolation-guard.test.ts` pinning what the new policy accepts
   and rejects.

### 11.2 New relation in `prisma/schema.prisma`

Add the entry to `CLEANUP_RELATIONS` in `tests/support/isolation-guard.ts` with the exact
`field`, `target` and `cascade` flag. Until you do, the repository test fails in
`test isolation guard — cleanup metadata matches the schema`, on the case
`declares exactly the schema's relations, with the schema's cascade`.

That test is the reason the table cannot drift: it re-parses every
`@relation(… fields: […])` from the schema and compares both directions.

### 11.3 New cleanup strategy

`buildCleanupPolicy` understands two shapes beyond direct predicates: cascade inheritance and
collect-then-delete. If a suite invents a third (say, cleaning from an id returned by a
helper), do **not** widen acceptance by adding the column to some table — extend
`buildCleanupPolicy`/`collectCleanup` so the new shape is *derived*, then test both the
positive and the negative case.

### 11.4 New Prisma operation used in tests

1. Add it to `MODEL_OPERATIONS` or `RAW_OPERATIONS`.
2. Add a branch in `analyzeArguments` describing which arguments it has (`where`, `data`,
   `create`/`update`, none). Never infer the branch from the presence of `where`.
3. Decide the failure modes: violation for a confirmed gap, unsupported for an unprovable one.
4. Add `GUIDANCE` text so `describeFindings` tells the reader how to fix it.

### 11.5 New operation-reference pattern

Add it to `resolveExpression` (or the container machinery) so the reference resolves to
`operationRef`/`container`; otherwise the call falls through as an ordinary method call and is
skipped. A new *invocation* shape (as `.call`/`.apply` were) belongs in `visit`'s call dispatch,
resolving the receiver and reusing `examineDetachedCall` — do not reimplement the per-operation
rules. Pin the pattern in `tests/fixtures/isolation-guard/` and assert the exact findings in the
repository test.

### 11.6 Checklist before opening a pull request

1. **Inspect `prisma/schema.prisma`** — the model, its relations, and each `onDelete` action.
2. **Inspect the real suite's setup and teardown** — what does it actually delete, by which column?
3. **Update cleanup evidence** — usually the suite's own teardown, not the guard.
4. **Add unit regression tests** for the new accept/reject boundary, pinning outcome counts,
   operation, line and reason.
5. **Add repository coverage** when a new fixture or scan-shape is involved (the pinned
   fixture list must be updated too).
6. **Run the checks** — guard unit, guard repository, full `npm test`, `npm run typecheck`,
   `npm run lint`.

### 11.7 Why the schema-consistency test exists

`CLEANUP_RELATIONS` is the only hand-written metadata in the guard. Without a check it could
claim `cascade: true` for a `Restrict` relation and silently hand a model an identity the
database does not guarantee. The test converts that risk into a build failure by re-deriving
the truth from the schema.

---

## 12. Running and verifying the guard

Commands are the project's own scripts; run them from the repository root.

```bash
# Guard unit / regression tests
node --import tsx --test tests/test-isolation-guard.test.ts

# Repository scan + adversarial fixtures
node --import tsx --test tests/test-isolation-guard.repo.test.ts

# Full project suite (includes both guard files)
npm test

# Types
npm run typecheck

# Lint
npm run lint
```

Reference counts at the time of writing (informational — they change as tests are added):

| Check | Result |
|---|---|
| Guard unit tests | 173 passing |
| Repository integration tests | 29 passing |
| Full `npm test` | 332 passing, 0 failing |
| `npm run typecheck` | clean |
| `npm run lint` | exit 0, 2 pre-existing warnings in `src/` |
| Real-suite scan | 0 violations, 0 unsupported, 1 exemption (`tests/supervisor-scope.test.ts:93`) |

To inspect what the guard currently derives for a file, use the exported helpers:

```ts
import { readFileSync } from "node:fs";

import { cleanupPolicyFor, scanRepository, testSources } from "./support/isolation-guard";

// model → column → { values, prefixes, fixture }
console.log(cleanupPolicyFor(readFileSync(testSources()[0], "utf8")));

// the real-suite scan
const { violations, unsupported, exemptions } = scanRepository();
```

A failing run prints the file, line, operation and reason for each finding
(`describeFindings` / `describeUnsupported`), plus remediation guidance per operation. Read the
reason literally: `may be \`undefined\`` means Prisma will drop that predicate; `no proven
fixture cleanup for `x` in this file` means that file's teardown does not cover `x`.
