import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Test Isolation Guard — implementation.
 *
 * `node --test` runs every file in `tests/` as a concurrent process against one
 * shared PostgreSQL database, so only a fixture-scoped filter is trustworthy:
 * a table-wide read, count, update or delete touches rows another file is using
 * (or deleting) at the same moment.
 *
 * The scanner parses each file with the TypeScript compiler API already in the
 * project's devDependencies and resolves every receiver through a **lexical
 * scope model**: module, function, block, catch and loop scopes, with every
 * binding form (`var`/`let`/`const`, parameters, destructuring, rest elements)
 * attached to the scope that owns it. Identifier references resolve to the
 * nearest enclosing declaration, so a local that shadows an outer alias never
 * inherits it.
 *
 * Three outcomes are kept deliberately distinct:
 *   • violations  — a confirmed unscoped query;
 *   • exemptions  — a confirmed unscoped query carrying an explicit
 *                   `isolation-guard: allow` directive in a comment;
 *   • unsupported — the analysis could not prove the call is scoped. This is a
 *                   diagnostic, not a pass: a spread argument, a runtime-built
 *                   SQL string, a filter value that may be `undefined`, or a
 *                   binding whose identity cannot be established.
 *
 * Still a file-local static analysis, not a type checker: a client passed in
 * from another module with a name the guard cannot recognise stays outside what
 * it can prove, and such aliases are reported rather than assumed safe.
 */

export const MODEL_OPERATIONS = [
  "count",
  "create",
  "createMany",
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "aggregate",
  "groupBy",
  "deleteMany",
  "updateMany",
  "update",
  "upsert",
  "createMany",
  "delete",
] as const;
export type ModelOperation = (typeof MODEL_OPERATIONS)[number];

export const RAW_OPERATIONS = [
  "$queryRaw",
  "$queryRawUnsafe",
  "$executeRaw",
  "$executeRawUnsafe",
] as const;
export type RawOperation = (typeof RAW_OPERATIONS)[number];

export type Operation = ModelOperation | RawOperation;

export type Finding = {
  file: string;
  line: number;
  operation: Operation;
  reason: string;
  text: string;
};

export type UnsupportedFinding = {
  file: string;
  line: number;
  /** Present when the unresolved access is a call to a known operation. */
  operation?: Operation;
  reason: string;
  text: string;
};

export type ScanResult = {
  violations: Finding[];
  exemptions: Finding[];
  unsupported: UnsupportedFinding[];
};

/**
 * Repository-only extras. `scanSource` stays file-local; `scanRepository` may
 * consult exported declarations in other repository files to justify a called
 * function's return value.
 */
export type ScanOptions = {
  externalReturnIsDefined?: (
    specifier: string,
    imported: string,
    fromFile: string
  ) => boolean;
};

export const DIRECTIVE = /isolation-guard:\s*allow\b/;

const GUIDANCE: Record<Operation, string> = {
  count: "count      → scope to this suite's rows, e.g. { where: { id: { startsWith: PREFIX } } }",
  findMany: "findMany   → filter the read to this suite's rows; `take`/`orderBy`/`select` do not isolate",
  findFirst: "findFirst  → filter the read to this suite's rows; `take`/`orderBy`/`select` do not isolate",
  findFirstOrThrow:
    "findFirstOrThrow → filter the read to this suite's rows; a limit or ordering is not isolation",
  findUnique: "findUnique → the unique filter must name this suite's row",
  findUniqueOrThrow:
    "findUniqueOrThrow → the unique filter must name this suite's row",
  aggregate: "aggregate  → scope the aggregation to this suite's rows with a fixture filter",
  groupBy: "groupBy    → scope the grouping to this suite's rows with a fixture filter",
  updateMany: "updateMany → always pass a fixture filter; an empty where rewrites every row",
  deleteMany: "deleteMany → a table-wide delete destroys other suites' fixtures; always filter",
  $queryRaw: "$queryRaw   → the SQL must carry a WHERE clause in its own text",
  $queryRawUnsafe:
    "$queryRawUnsafe → cannot be verified statically; build the query with Prisma.sql instead",
  $executeRaw: "$executeRaw → the SQL must carry a WHERE clause in its own text",
  $executeRawUnsafe:
    "$executeRawUnsafe → cannot be verified statically; build the query with Prisma.sql instead",
  create: "create     → scope the data payload to this suite's rows; the `data` must reference fixture-scoped values; no where clause applies to CREATE",
  createMany: "createMany → same as create; scope the data payload to fixture rows; no where clause applies",
  update: "update     → always pass a fixture filter in the `where` clause; empty where rewrites every row; matches updateMany pattern",
  upsert: "upsert     → always pass a fixture filter in the `where` clause to identify the target row; matches updateMany pattern",
  delete: "delete     → always pass a fixture filter in the `where` clause; table-wide delete destroys other suites' fixtures; matches deleteMany pattern",
};

/* ------------------------------------------------------------------ */
/* Module identity                                                     */
/* ------------------------------------------------------------------ */

/**
 * The project's one Prisma client instance lives in `src/lib/prisma.ts` and is
 * imported through the `@/lib/prisma` alias (or a relative path that resolves
 * to the same file). Identity is resolved from the importing file's directory,
 * not guessed from a path suffix: a test helper called `prisma.ts` is not the
 * production singleton, and `@prisma/client` exports the class, not an
 * instance, so neither is treated as a client.
 */
const PRISMA_MODULE = "src/lib/prisma";

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}

/** Resolve a module specifier to a repository-relative path, when possible. */
function modulePath(specifier: string, file: string): string | undefined {
  const clean = specifier.replace(/\.(ts|tsx|js|mjs|cjs|jsx)$/, "");
  if (clean.startsWith("@/")) return path.posix.join("src", clean.slice(2));
  if (clean.startsWith(".")) {
    const from = path.posix.dirname(toPosix(file));
    return path.posix.normalize(path.posix.join(from, clean));
  }
  return undefined;
}

function isPrismaModule(specifier: string, file: string): boolean {
  return modulePath(specifier, file) === PRISMA_MODULE;
}

/* ------------------------------------------------------------------ */
/* Small syntax helpers                                                */
/* ------------------------------------------------------------------ */

function staticText(expr: ts.Expression | undefined): string | undefined {
  if (!expr) return undefined;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  if (ts.isTemplateExpression(expr)) {
    return expr.head.text + expr.templateSpans.map((span) => span.literal.text).join("");
  }
  if (ts.isParenthesizedExpression(expr)) return staticText(expr.expression);
  return undefined;
}

function stringKey(expr: ts.Expression | undefined): string | undefined {
  if (!expr) return undefined;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  // `ops[0]` and `{ 0: fn }` use a numeric key; its text is the index.
  if (ts.isNumericLiteral(expr)) return expr.text;
  if (ts.isParenthesizedExpression(expr)) return stringKey(expr.expression);
  return undefined;
}

function nameOf(node: ts.PropertyName | ts.BindingName | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node)) return stringKey(node.expression);
  return undefined;
}

const TABLE_REFERENCE = /\b(FROM|INTO|UPDATE|DELETE|INSERT|TRUNCATE|DROP|ALTER|MERGE)\b/i;
const WHERE_CLAUSE = /\bWHERE\b/i;

/** A predicate that is true for every row. */
const TAUTOLOGY = /^(?:1\s*=\s*1|'1'\s*=\s*'1'|true)$/i;

function normalisePredicate(text: string): string {
  let value = text.trim();
  while (value.startsWith("(") && value.endsWith(")")) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function isTautology(text: string): boolean {
  return TAUTOLOGY.test(normalisePredicate(text));
}

/**
 * `WHERE 1=1 OR ...` is always true; `WHERE TRUE AND ...` reduces to the
 * remaining conjuncts. A real-looking condition elsewhere must not launder a
 * tautological disjunct.
 */
function whereIsTautological(clause: string): boolean {
  const trimmed = clause.replace(/;\s*$/, "").trim();
  if (trimmed.length === 0) return true;

  const disjuncts = trimmed.split(/\bOR\b/i);
  if (disjuncts.some(isTautology)) return true;

  const conjuncts = trimmed.split(/\bAND\b/i);
  return conjuncts.every(isTautology);
}

export function isModelOperation(value: string): value is ModelOperation {
  return (MODEL_OPERATIONS as readonly string[]).includes(value);
}

export function isRawOperation(value: string): value is RawOperation {
  return (RAW_OPERATIONS as readonly string[]).includes(value);
}

/** A member name that denotes a guarded Prisma operation, if any. */
function operationNamed(member: string | undefined): Operation | undefined {
  if (!member) return undefined;
  if (isModelOperation(member) || isRawOperation(member)) return member;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Pass 1 — scope tree                                                 */
/* ------------------------------------------------------------------ */

type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration;

const FUNCTION_LIKE = (node: ts.Node): node is FunctionLike =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

type Binding =
  | { kind: "client" }
  | { kind: "delegate"; model: string }
  /**
   * An operation detached from its delegate, e.g. `const fn = prisma.model.count`.
   *
   * `model` is the delegate the operation came from, when the reference was
   * taken from one. It survives aliasing and containers so a later invocation —
   * `fn(...)`, `fn.call(...)`, `ops.run.apply(...)` — can be judged against the
   * same model's cleanup policy. Raw operations taken from the client, and
   * references whose delegate is not statically known, carry no model.
   */
  | { kind: "operationRef"; operation: Operation; model?: string }
  /**
   * A local object/array literal holding operation references, e.g.
   * `const ops = { run: prisma.model.count }` or `const ops = [fn]`.
   *
   * Only statically named entries are stored. `open` means a spread or a
   * computed key makes the remaining keys unknowable, `mutated` means a member
   * was assigned after the literal was created, and `name` is the variable the
   * container was bound to (used in diagnostics).
   */
  | {
      kind: "container";
      entries: Map<string, Binding>;
      holdsOperation: boolean;
      /** The literal itself writes an operation reference (already reported). */
      directReference: boolean;
      open?: boolean;
      mutated?: boolean;
      name?: string;
    }
  | { kind: "namespace"; module: string }
  | { kind: "nonClient" }
  | {
      kind: "unknown";
      reason: string;
      prismaRelated?: boolean;
      /** The binding is an alias of a Prisma operation that was reassigned. */
      operationAlias?: boolean;
    }
  | { kind: "none" };

type Declaration =
  | { type: "import"; name: string; module: string; imported: string }
  /**
   * `const { count = fallback } = source`: the default only applies when the
   * property is `undefined`, so when `source` is a Prisma delegate the binding
   * may still be the operation. `detached` carries that possible origin while
   * `initializer`/writes keep the ordinary fallback value semantics.
   */
  | {
      type: "variable";
      name: string;
      initializer: ts.Expression | null;
      detached?: { source: ts.Expression; model: string };
    }
  | { type: "parameter"; name: string; node?: ts.ParameterDeclaration }
  | { type: "opaque"; name: string; node?: ts.SignatureDeclaration }
  | { type: "destructured"; name: string; model: string; source: ts.Expression }
  | { type: "element"; name: string }
  | { type: "pattern"; name: string };

type Write = { expr: ts.Expression; scope: Scope };

type ScopeKind = "module" | "function" | "block";

class Scope {
  readonly parent: Scope | null;
  readonly kind: ScopeKind;
  readonly declarations: Declaration[] = [];
  readonly children: Scope[] = [];
  readonly resolved = new Map<string, Binding>();
  readonly resolving = new Set<string>();

  constructor(parent: Scope | null, kind: ScopeKind) {
    this.parent = parent;
    this.kind = kind;
    parent?.children.push(this);
  }

  /**
   * Declare a binding. Repeated `var` (or repeated `let`) declarations of the
   * same name are **one** binding in JavaScript, so the existing declaration is
   * returned and the caller attaches the new initializer to it. Declaring a
   * second `Declaration` object would let the last one win and silently hide
   * the earlier write.
   */
  declare(declaration: Declaration): Declaration {
    if (declaration.type === "variable") {
      const existing = this.declarations.find(
        (candidate) => candidate.type === "variable" && candidate.name === declaration.name
      );
      if (existing) return existing;
    }
    this.declarations.push(declaration);
    return declaration;
  }

  declarationFor(name: string): Declaration | undefined {
    for (let i = this.declarations.length - 1; i >= 0; i -= 1) {
      if (this.declarations[i].name === name) return this.declarations[i];
    }
    return undefined;
  }

  nearestFunction(): Scope {
    let scope: Scope = this;
    while (scope.kind === "block" && scope.parent) scope = scope.parent;
    return scope;
  }
}

type ScopeModel = {
  root: Scope;
  nodeScope: Map<ts.Node, Scope>;
  writes: Map<Declaration, Write[]>;
  /** `ops[0] = f` / `ops.run = f`: names whose members are assigned. */
  memberWrites: Map<Scope, Set<string>>;
  /** Callback parameters of a `prisma.$transaction(…)` proven to be clients. */
  transactionParams: Set<ts.Node>;
  /** Named function declarations, used to inline statically-called helpers. */
  namedFunctions: Map<string, ts.FunctionDeclaration>;
};

function buildScopeModel(sourceFile: ts.SourceFile): ScopeModel {
  const nodeScope = new Map<ts.Node, Scope>();
  const root = new Scope(null, "module");
  const writes = new Map<Declaration, Write[]>();
  const memberWrites = new Map<Scope, Set<string>>();
  const transactionParams = new Set<ts.Node>();
  const namedFunctions = new Map<string, ts.FunctionDeclaration>();
  const assignments: Array<{ name: string; expr: ts.Expression; scope: Scope }> = [];

  const addWrite = (declaration: Declaration, write: Write) => {
    const list = writes.get(declaration) ?? [];
    list.push(write);
    writes.set(declaration, list);
  };

  const addMemberWrite = (scope: Scope, name: string) => {
    const names = memberWrites.get(scope) ?? new Set<string>();
    names.add(name);
    memberWrites.set(scope, names);
  };

  /**
   * Register every name a binding pattern introduces. `kind` decides which
   * declaration type is created: a `variable` declaration can resolve to a
   * client only through destructuring from the client; a parameter or a plain
   * pattern is an opaque value and must never inherit the implicit client.
   */
  const declarePattern = (
    name: ts.BindingName,
    target: Scope,
    source: ts.Expression | null,
    kind: "variable" | "parameter" | "pattern",
    sourceScope: Scope,
    parameterNode?: ts.ParameterDeclaration
  ): void => {
    if (ts.isIdentifier(name)) {
      if (kind === "variable") {
        const declaration = target.declare({
          type: "variable",
          name: name.text,
          initializer: source,
        });
        if (source) addWrite(declaration, { expr: source, scope: sourceScope });
        return;
      }
      target.declare(
        kind === "parameter"
          ? { type: "parameter", name: name.text, node: parameterNode }
          : { type: "pattern", name: name.text }
      );
      return;
    }

    if (ts.isObjectBindingPattern(name)) {
      for (const element of name.elements) {
        if (ts.isOmittedExpression(element)) continue;

        if (element.dotDotDotToken) {
          declarePattern(element.name, target, null, kind === "variable" ? "pattern" : kind, sourceScope);
          continue;
        }

        const nested = ts.isObjectBindingPattern(element.name) || ts.isArrayBindingPattern(element.name);
        if (nested) {
          declarePattern(element.name, target, null, kind === "variable" ? "pattern" : kind, sourceScope);
          continue;
        }

        const property = element.propertyName
          ? nameOf(element.propertyName)
          : ts.isIdentifier(element.name)
            ? element.name.text
            : undefined;

        if (kind === "variable" && source && property) {
          // A default value is a defined fallback for an absent property, but
          // it does not prove which value won: `{ count = fallback }` keeps the
          // operation when the property is present, so the possible origin is
          // recorded and the resolver reports it instead of guessing.
          if (element.initializer) {
            const local = element.name as ts.Identifier;
            const declaration = target.declare({
              type: "variable",
              name: local.text,
              initializer: element.initializer,
              detached: { source, model: property },
            });
            addWrite(declaration, { expr: element.initializer, scope: sourceScope });
            continue;
          }
          // `const { student: pupils } = db` keeps the property name in the
          // declaration: the resolver decides later whether `db` is the client.
          target.declare({
            type: "destructured",
            name: (element.name as ts.Identifier).text,
            model: property,
            source,
          });
          continue;
        }

        declarePattern(
          element.name,
          target,
          element.initializer ?? null,
          kind === "variable" ? "variable" : kind,
          sourceScope
        );
      }
      return;
    }

    // Array binding pattern: the elements have no property identity, so they
    // are opaque values, never delegates. A positional element of an array
    // **literal** is a value, not a lookup, so it counts as defined; anything
    // else (an iterable, a call) keeps the cautious `pattern` treatment.
    const literalArray =
      source !== null &&
      ts.isArrayLiteralExpression(
        ts.isAsExpression(source) || ts.isSatisfiesExpression(source)
          ? source.expression
          : source
      );
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue;
      if (element.dotDotDotToken) {
        declarePattern(element.name, target, null, kind === "variable" ? "pattern" : kind, sourceScope);
        continue;
      }
      if (ts.isObjectBindingPattern(element.name) || ts.isArrayBindingPattern(element.name)) {
        declarePattern(element.name, target, null, kind === "variable" ? "pattern" : kind, sourceScope);
        continue;
      }
      if (kind === "variable" && literalArray) {
        target.declare({ type: "element", name: (element.name as ts.Identifier).text });
        continue;
      }
      declarePattern(
        element.name,
        target,
        element.initializer ?? null,
        kind === "variable" ? "variable" : kind,
        sourceScope
      );
    }
  };

  const declareVariables = (declaration: ts.VariableDeclaration, scope: Scope): void => {
    const list = ts.isVariableDeclarationList(declaration.parent) ? declaration.parent : undefined;
    const hoisted = list ? (list.flags & ts.NodeFlags.BlockScoped) === 0 : false;
    const target = hoisted ? scope.nearestFunction() : scope;

    // `for (const [a, b] of [[1, 2]])`: the source of the tuple is the loop
    // iterable, not the declaration, which has no initializer.
    let source = declaration.initializer ?? null;
    if (!source && list) {
      const owner = list.parent;
      if (ts.isForOfStatement(owner) || ts.isForInStatement(owner)) source = owner.expression;
    }

    declarePattern(declaration.name, target, source, "variable", scope);
  };

  const walk = (node: ts.Node, scope: Scope): void => {
    if (ts.isImportDeclaration(node) && node.importClause) {
      const module = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : "";
      const clause = node.importClause;
      if (clause.name) {
        scope.declare({
          type: "import",
          name: clause.name.text,
          module,
          imported: "default",
        });
      }
      const named = clause.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          scope.declare({
            type: "import",
            name: element.name.text,
            module,
            imported: (element.propertyName ? nameOf(element.propertyName) : element.name.text) ?? element.name.text,
          });
        }
      } else if (named && ts.isNamespaceImport(named)) {
        scope.declare({
          type: "import",
          name: named.name.text,
          module,
          imported: "*",
        });
      }
      return;
    }

    if (FUNCTION_LIKE(node)) {
      if (ts.isFunctionDeclaration(node) && node.name) {
        scope.declare({ type: "opaque", name: node.name.text, node });
        namedFunctions.set(node.name.text, node);
      }
      const fnScope = new Scope(scope, "function");
      if (ts.isFunctionExpression(node) && node.name) {
        fnScope.declare({ type: "opaque", name: node.name.text, node });
      }
      // Parameters belong to the function scope, and their initializers are
      // evaluated in that same scope — a call in a default value must see the
      // shadowing parameter, not the module.
      for (const parameter of node.parameters) {
        declarePattern(parameter.name, fnScope, null, "parameter", fnScope, parameter);
        walk(parameter.name, fnScope);
        // A default initializer is evaluated in the function scope, so a call
        // in it must see the parameters that shadow the module bindings.
        if (parameter.initializer) walk(parameter.initializer, fnScope);
      }
      if (node.body) walk(node.body, fnScope);
      return;
    }

    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      if (node.name) scope.declare({ type: "opaque", name: node.name.text });
      // Class members are function-likes; walk them in the class's own scope.
      const classScope = new Scope(scope, "block");
      ts.forEachChild(node, (child) => walk(child, classScope));
      return;
    }

    nodeScope.set(node, scope);

    if (ts.isBlock(node)) {
      const blockScope = new Scope(scope, "block");
      ts.forEachChild(node, (child) => walk(child, blockScope));
      return;
    }

    if (ts.isCatchClause(node)) {
      const catchScope = new Scope(scope, "block");
      if (node.variableDeclaration) {
        declarePattern(node.variableDeclaration.name, catchScope, null, "pattern", catchScope);
        walk(node.variableDeclaration.name, catchScope);
      }
      ts.forEachChild(node, (child) => walk(child, catchScope));
      return;
    }

    if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isCaseBlock(node)
    ) {
      const loopScope = new Scope(scope, "block");
      ts.forEachChild(node, (child) => walk(child, loopScope));
      return;
    }

    if (ts.isVariableDeclaration(node)) {
      declareVariables(node, scope);
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      assignments.push({ name: node.left.text, expr: node.right, scope });
    }

    // `ops[0] = f` / `ops.run = f` / `ops[key] += f`: the container's own
    // binding is untouched, but its contents are no longer the literal's.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      const target = memberTarget(node.left);
      if (target) addMemberWrite(scope, target);
    }

    // `ops.push(f)` and the other mutating array methods rewrite the container
    // in place, so its literal entries are no longer trustworthy either.
    if (ts.isCallExpression(node) && isMutatingMethodCall(node.expression)) {
      const callee = unwrapMember(node.expression);
      const target = callee ? memberWriteRoot(callee.expression) : undefined;
      if (target) addMemberWrite(scope, target);
    }

    // `delete ops.run` removes an entry the literal advertised.
    if (ts.isDeleteExpression(node)) {
      const target = memberTarget(node.expression);
      if (target) addMemberWrite(scope, target);
    }

    ts.forEachChild(node, (child) => walk(child, scope));
  };

  walk(sourceFile, root);
  nodeScope.set(sourceFile, root);

  // Attach assignments to their declaring scope, so `let db; db = prisma;` is a
  // single, provable write.
  for (const assignment of assignments) {
    let scope: Scope | null = assignment.scope;
    let target: Declaration | undefined;
    while (scope) {
      target = scope.declarationFor(assignment.name);
      if (target) break;
      scope = scope.parent;
    }
    if (!target) continue;
    addWrite(target, { expr: assignment.expr, scope: assignment.scope });
  }

  // `const alias = ops; delete alias.run` deletes from the container `ops`
  // itself. A member write recorded against the alias must reach every name in
  // its alias chain, otherwise `ops.run()` afterwards would still be reported
  // as a confirmed unscoped query instead of the ambiguous container it has
  // actually become.
  const aliasNamesOf = (scope: Scope, name: string): string[] => {
    const chain: string[] = [];
    const seen = new Set<string>([name]);
    let currentScope: Scope | null = scope;
    let declaration: Declaration | undefined;
    while (currentScope && !declaration) {
      declaration = currentScope.declarationFor(name);
      currentScope = currentScope.parent;
    }

    let cursor = declaration;
    while (cursor && cursor.type === "variable") {
      const list = writes.get(cursor) ?? [];
      if (list.length !== 1) break;
      const expr = list[0].expr;
      if (!ts.isIdentifier(expr)) break;
      const next = expr.text;
      if (seen.has(next)) break;
      seen.add(next);
      chain.push(next);

      let owner: Scope | null = list[0].scope;
      let nextDeclaration: Declaration | undefined;
      while (owner && !nextDeclaration) {
        nextDeclaration = owner.declarationFor(next);
        owner = owner.parent;
      }
      cursor = nextDeclaration;
    }
    return chain;
  };

  const memberWriteSnapshot = [...memberWrites.entries()].flatMap(([scope, names]) =>
    [...names].map((name) => ({ scope, name }))
  );
  for (const record of memberWriteSnapshot) {
    for (const alias of aliasNamesOf(record.scope, record.name)) {
      const names = memberWrites.get(record.scope) ?? new Set<string>();
      names.add(alias);
      memberWrites.set(record.scope, names);
    }
  }

  return { root, nodeScope, writes, memberWrites, transactionParams, namedFunctions };
}

/**
 * Array methods that rewrite the receiver. Only these are treated as
 * mutations; `map`, `find`, `includes` and friends leave the array alone.
 */
const MUTATING_ARRAY_METHODS = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "fill",
  "copyWithin",
  "sort",
  "reverse",
]);

/** The member access inside expression wrappers, if there is one. */
function unwrapMember(
  expr: ts.Expression
): ts.PropertyAccessExpression | ts.ElementAccessExpression | undefined {
  let node: ts.Expression = expr;
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    node = node.expression;
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return node;
  return undefined;
}

function isMutatingMethodCall(callee: ts.Expression): boolean {
  const name = mutatingMethodName(callee);
  return name !== undefined && MUTATING_ARRAY_METHODS.has(name);
}

/** The documented mutating method a call names, if it names one at all. */
function mutatingMethodName(callee: ts.Expression): string | undefined {
  const member = unwrapMember(callee);
  if (!member) return undefined;
  return ts.isPropertyAccessExpression(member)
    ? ts.isIdentifier(member.name)
      ? member.name.text
      : undefined
    : stringKey(member.argumentExpression);
}

/** The receiver of a member access, but only when it really is one. */
function memberTarget(expr: ts.Expression): string | undefined {
  const member = unwrapMember(expr);
  if (!member) return undefined;
  return memberWriteRoot(member);
}

/** The variable a member assignment targets: `ops` in `ops[key] = …`. */
function memberWriteRoot(left: ts.Expression): string | undefined {
  let node: ts.Expression = left;
  while (true) {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      node = node.expression;
      continue;
    }
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      node = node.expression;
      continue;
    }
    return ts.isIdentifier(node) ? node.text : undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Pass 2 — binding resolution                                         */
/* ------------------------------------------------------------------ */

/**
 * How confidently a filter value is known to be something other than
 * `undefined`. Prisma omits `undefined` filter values, so a predicate whose
 * value can be `undefined` restricts nothing.
 */
type ValueVerdict = "defined" | "maybe" | "none" | "unknown";

type Resolver = {
  resolveName: (scope: Scope | null, name: string) => Binding | undefined;
  resolveExpression: (expr: ts.Expression | undefined, scope: Scope) => Binding;
  /** A computed key proven static by its binding history, if any. */
  keyText: (expr: ts.Expression | undefined, scope: Scope) => string | undefined;
  singleWrite: (scope: Scope | null, name: string) => Write | undefined;
  valueVerdict: (expr: ts.Expression | undefined, scope: Scope) => ValueVerdict;
};

/** Methods whose result is `T | undefined` often enough to treat as a maybe. */
const LOOKUP_MEMBERS = new Set(["find", "findLast", "at", "pop", "shift"]);

/**
 * A return-type annotation only proves a value when it cannot include
 * `undefined`/`void`/`any`/`unknown`. `Promise<T>` is unwrapped because the
 * call sites that matter are awaited.
 */
function typeIsDefined(type: ts.TypeNode | undefined): boolean {
  if (!type) return false;

  if (ts.isParenthesizedTypeNode(type)) return typeIsDefined(type.type);

  if (ts.isTypeReferenceNode(type)) {
    const name = ts.isIdentifier(type.typeName) ? type.typeName.text : undefined;
    if ((name === "Promise" || name === "PromiseLike") && type.typeArguments?.length === 1) {
      return typeIsDefined(type.typeArguments[0]);
    }
    return false;
  }

  if (ts.isUnionTypeNode(type)) return type.types.every(typeIsDefined);
  if (ts.isIntersectionTypeNode(type)) return type.types.every(typeIsDefined);
  if (ts.isArrayTypeNode(type) || ts.isTupleTypeNode(type) || ts.isTypeLiteralNode(type)) {
    return true;
  }
  if (ts.isLiteralTypeNode(type)) return true;

  switch (type.kind) {
    case ts.SyntaxKind.StringKeyword:
    case ts.SyntaxKind.NumberKeyword:
    case ts.SyntaxKind.BooleanKeyword:
    case ts.SyntaxKind.BigIntKeyword:
    case ts.SyntaxKind.SymbolKeyword:
    case ts.SyntaxKind.ObjectKeyword:
      return true;
    default:
      return false;
  }
}

function createResolver(
  model: ScopeModel,
  sourceFileName: string,
  options: ScanOptions
): Resolver {
  const operationHolding = (binding: Binding): boolean =>
    binding.kind === "operationRef" ||
    (binding.kind === "unknown" && binding.operationAlias === true) ||
    (binding.kind === "container" && binding.holdsOperation);

  const unwrap = (expr: ts.Expression): ts.Expression => {
    let node = expr;
    while (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      node = node.expression;
    }
    return node;
  };

  /**
   * `const ops = { run: fn }` / `const ops = [fn]`.
   *
   * The literal's static keys are resolved like any other expression, so an
   * identifier entry keeps the operation provenance it already had. Anything
   * that hides a key (spread, computed name) marks the container `open`
   * instead of being guessed at.
   */
  const buildContainer = (
    expr: ts.ObjectLiteralExpression | ts.ArrayLiteralExpression,
    scope: Scope
  ): Binding => {
    const entries = new Map<string, Binding>();
    let holdsOperation = false;
    let directReference = false;
    let open = false;

    const addBinding = (key: string | undefined, binding: Binding) => {
      if (operationHolding(binding)) holdsOperation = true;
      if (binding.kind === "container" && binding.directReference) directReference = true;
      if (key === undefined) {
        open = true;
        return;
      }
      entries.set(key, binding);
    };

    const addExpression = (key: string | undefined, value: ts.Expression) => {
      const inner = unwrap(value);
      const binding = resolveExpression(value, scope);
      // A reference written directly in the literal is already reported where it
      // appears; only references reached through an alias need the escape note.
      if (
        (ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner)) &&
        resolveExpression(inner, scope).kind === "operationRef"
      ) {
        directReference = true;
      }
      addBinding(key, binding);
    };

    if (ts.isArrayLiteralExpression(expr)) {
      expr.elements.forEach((element, index) => {
        if (ts.isOmittedExpression(element)) return;
        if (ts.isSpreadElement(element)) {
          addBinding(undefined, resolveExpression(element.expression, scope));
          return;
        }
        addExpression(String(index), element);
      });
    } else {
      for (const property of expr.properties) {
        if (ts.isSpreadAssignment(property)) {
          addBinding(undefined, resolveExpression(property.expression, scope));
          continue;
        }
        if (ts.isShorthandPropertyAssignment(property)) {
          addExpression(property.name.text, property.name);
          continue;
        }
        if (ts.isPropertyAssignment(property)) {
          addExpression(nameOf(property.name), property.initializer);
          continue;
        }
        // Methods and accessors are ordinary values, never operations.
        addBinding(nameOf(property.name), { kind: "nonClient" });
      }
    }

    return { kind: "container", entries, holdsOperation, directReference, open };
  };

  const containerLookup = (
    base: Extract<Binding, { kind: "container" }>,
    key: string
  ): Binding => {
    const label = base.name ?? "container";
    if (base.mutated && base.holdsOperation) {
      return {
        kind: "unknown",
        reason: `container \`${label}\` is mutated after initialization, so its contents cannot be analysed`,
        operationAlias: true,
      };
    }
    const entry = base.entries.get(key);
    if (entry) return entry;
    if (base.open && base.holdsOperation) {
      return {
        kind: "unknown",
        reason: `container \`${label}\` has a spread, so its properties cannot be resolved`,
        operationAlias: true,
      };
    }
    return { kind: "none" };
  };

  /**
   * A string/numeric key whose entire write history proves one literal value.
   * Any second write (or a non-literal initializer) makes the key dynamic
   * again, so `const key = "count"` resolves while `key = next()` does not.
   */
  const resolvingKeys = new Set<Declaration>();
  const keyText = (
    expr: ts.Expression | undefined,
    scope: Scope,
    depth = 0
  ): string | undefined => {
    if (!expr || depth > 8) return undefined;

    const literal = stringKey(expr);
    if (literal !== undefined) return literal;

    if (
      ts.isAsExpression(expr) ||
      ts.isSatisfiesExpression(expr) ||
      ts.isNonNullExpression(expr) ||
      ts.isTypeAssertionExpression(expr)
    ) {
      return keyText(expr.expression, scope, depth + 1);
    }

    if (ts.isIdentifier(expr)) {
      const found = findDeclaration(scope, expr.text);
      if (!found || found.declaration.type !== "variable") return undefined;
      if (resolvingKeys.has(found.declaration)) return undefined;

      const writes = model.writes.get(found.declaration) ?? [];
      if (writes.length !== 1) return undefined;

      resolvingKeys.add(found.declaration);
      try {
        return keyText(writes[0].expr, writes[0].scope, depth + 1);
      } finally {
        resolvingKeys.delete(found.declaration);
      }
    }

    return undefined;
  };

  const resolveExpression = (expr: ts.Expression | undefined, scope: Scope): Binding => {
    if (!expr) return { kind: "none" };

    if (
      ts.isParenthesizedExpression(expr) ||
      ts.isAsExpression(expr) ||
      ts.isNonNullExpression(expr) ||
      ts.isTypeAssertionExpression(expr) ||
      ts.isSatisfiesExpression(expr)
    ) {
      return resolveExpression(expr.expression, scope);
    }

    if (ts.isAwaitExpression(expr)) return resolveExpression(expr.expression, scope);

    if (ts.isIdentifier(expr)) {
      return resolveName(scope, expr.text) ?? { kind: "none" };
    }

    if (ts.isPropertyAccessExpression(expr)) {
      const base = resolveExpression(expr.expression, scope);
      const member = ts.isIdentifier(expr.name) ? expr.name.text : undefined;

      if (base.kind === "namespace") {
        if (member === "default" || member === "prisma") return { kind: "client" };
        return {
          kind: "unknown",
          reason: `\`${member ?? "?"}\` is not a known Prisma client export of "${base.module}"`,
          prismaRelated: true,
        };
      }

      // `ops.run` / `ops[0]`: the container was built from a literal, so the
      // entry's own binding is the answer.
      if (base.kind === "container" && member) return containerLookup(base, member);

      // `prisma.model.count` / `prisma.$executeRaw`: the member is an operation
      // detached from a known client or delegate. Model names are capitalised
      // and operations are camelCase or `$`-prefixed, so the two never collide.
      const operation = operationNamed(member);
      if (operation && (base.kind === "client" || base.kind === "delegate")) {
        return {
          kind: "operationRef",
          operation,
          model: base.kind === "delegate" ? base.model : undefined,
        };
      }

      if (base.kind === "client" && member) return { kind: "delegate", model: member };
      if (base.kind === "unknown") return base;
      return base.kind === "none" ? { kind: "none" } : { kind: "nonClient" };
    }

    if (ts.isElementAccessExpression(expr)) {
      const base = resolveExpression(expr.expression, scope);
      const member = keyText(expr.argumentExpression, scope);

      if (base.kind === "container") {
        if (member !== undefined) return containerLookup(base, member);
        return base.holdsOperation
          ? {
              kind: "unknown",
              reason: `dynamic key into a Prisma operation container cannot be resolved`,
              operationAlias: true,
            }
          : { kind: "nonClient" };
      }

      const operation = operationNamed(member);
      if (operation && (base.kind === "client" || base.kind === "delegate")) {
        return {
          kind: "operationRef",
          operation,
          model: base.kind === "delegate" ? base.model : undefined,
        };
      }

      if (base.kind === "client") {
        return member
          ? { kind: "delegate", model: member }
          : {
              kind: "unknown",
              reason: "dynamic model key cannot be resolved",
              prismaRelated: true,
              operationAlias: true,
            };
      }

      // `prisma.student[method]`: the delegate is proven, so the result is a
      // *possible* operation even though its name is unknown. Keeping the
      // provenance means a later alias call is reported instead of ignored.
      if (!member && base.kind === "delegate") {
        return {
          kind: "unknown",
          reason: "dynamic Prisma operation name cannot be resolved",
          operationAlias: true,
        };
      }

      return base.kind === "unknown" ? base : { kind: "nonClient" };
    }

    if (ts.isCallExpression(expr) || ts.isNewExpression(expr)) {
      return { kind: "unknown", reason: "initialised by a call, so its value is not known" };
    }

    if (ts.isConditionalExpression(expr)) {
      const whenTrue = resolveExpression(expr.whenTrue, scope);
      const whenFalse = resolveExpression(expr.whenFalse, scope);

      // Branches that mean the same thing keep their provenance: the value is
      // one of them at runtime, but both answer the same way.
      if (bindingsAgree(whenTrue, whenFalse)) return whenTrue;

      // Otherwise a branch that may hold an operation stays a *possible*
      // operation. Neither branch wins, so a later call is unsupported instead
      // of being analysed as a confirmed query.
      if (operationHolding(whenTrue) || operationHolding(whenFalse)) {
        return {
          kind: "unknown",
          reason: "initialised from a conditional whose branches may hold a Prisma operation",
          operationAlias: true,
        };
      }

      return { kind: "unknown", reason: "initialised from a conditional" };
    }

    if (ts.isObjectLiteralExpression(expr) || ts.isArrayLiteralExpression(expr)) {
      return buildContainer(expr, scope);
    }

    if (
      ts.isStringLiteral(expr) ||
      ts.isNoSubstitutionTemplateLiteral(expr) ||
      ts.isTemplateExpression(expr) ||
      ts.isNumericLiteral(expr) ||
      expr.kind === ts.SyntaxKind.TrueKeyword ||
      expr.kind === ts.SyntaxKind.FalseKeyword ||
      expr.kind === ts.SyntaxKind.NullKeyword
    ) {
      return { kind: "nonClient" };
    }

    return { kind: "nonClient" };
  };

  /**
   * Whether two branches denote the same thing. Stricter than `sameBinding`
   * for literals: two containers agree only when every statically known entry
   * agrees, and two unknowns only when their reason agrees.
   */
  const bindingsAgree = (a: Binding, b: Binding): boolean => {
    if (a.kind !== b.kind) return false;
    if (a.kind === "delegate" && b.kind === "delegate") return a.model === b.model;
    if (a.kind === "operationRef" && b.kind === "operationRef") {
      // Two delegates that expose the same operation name are different
      // queries: `prisma.student.count` and `prisma.teacher.count` must not
      // merge into one anonymous operation.
      return a.operation === b.operation && a.model === b.model;
    }
    if (a.kind === "container" && b.kind === "container") {
      if (a.open !== b.open || a.holdsOperation !== b.holdsOperation) return false;
      if (a.entries.size !== b.entries.size) return false;
      for (const [key, value] of a.entries) {
        const other = b.entries.get(key);
        if (!other || !bindingsAgree(value, other)) return false;
      }
      return true;
    }
    if (a.kind === "unknown" && b.kind === "unknown") return a.reason === b.reason;
    return true;
  };

  const sameBinding = (a: Binding, b: Binding): boolean => {
    if (a.kind !== b.kind) return false;
    if (a.kind === "delegate" && b.kind === "delegate") return a.model === b.model;
    if (a.kind === "operationRef" && b.kind === "operationRef") {
      return a.operation === b.operation && a.model === b.model;
    }
    // Two separately written literals are different objects, even when they
    // look alike: only the same resolved container can be trusted.
    if (a.kind === "container" && b.kind === "container") return a === b;
    return true;
  };

  const compute = (scope: Scope, declaration: Declaration): Binding => {
    if (declaration.type === "import") {
      if (!isPrismaModule(declaration.module, sourceFileName)) {
        return { kind: "unknown", reason: `imported from "${declaration.module}"` };
      }
      if (declaration.imported === "*") {
        return { kind: "namespace", module: declaration.module };
      }
      if (declaration.imported === "default" || declaration.imported === "prisma") {
        return { kind: "client" };
      }
      return {
        kind: "unknown",
        reason: `"${declaration.imported}" is not a Prisma client export of "${declaration.module}"`,
        prismaRelated: true,
      };
    }

    if (declaration.type === "parameter") {
      // The callback of a proven `prisma.$transaction(…)` receives a client
      // bound to that transaction, so the same isolation rules apply through
      // it. Any other parameter stays an unknown value.
      if (declaration.node && model.transactionParams.has(declaration.node)) {
        return { kind: "client" };
      }
      return { kind: "unknown", reason: `\`${declaration.name}\` is a parameter` };
    }

    if (declaration.type === "opaque") return { kind: "nonClient" };

    if (declaration.type === "pattern" || declaration.type === "element") {
      return { kind: "nonClient" };
    }

    if (declaration.type === "destructured") {
      const base = resolveExpression(declaration.source, scope);
      // `const { findFirst } = prisma.student` detaches the operation, just as
      // `const findFirst = prisma.student.findFirst` does.
      const detached = operationNamed(declaration.model);
      if (detached && (base.kind === "client" || base.kind === "delegate")) {
        return {
          kind: "operationRef",
          operation: detached,
          model: base.kind === "delegate" ? base.model : undefined,
        };
      }
      if (base.kind === "client") return { kind: "delegate", model: declaration.model };
      if (base.kind === "namespace") {
        if (declaration.model === "default" || declaration.model === "prisma") {
          return { kind: "client" };
        }
        return {
          kind: "unknown",
          reason: `"${declaration.model}" is not a known Prisma client export of "${base.module}"`,
          prismaRelated: true,
        };
      }
      if (base.kind === "unknown") return base;
      return { kind: "nonClient" };
    }

    // A destructured default on a Prisma delegate is ambiguous: the operation
    // wins when the property exists, the fallback when it does not. Only the
    // delegate case is ambiguous — an ordinary object keeps its value
    // semantics through the writes registered below.
    if (declaration.detached) {
      const base = resolveExpression(declaration.detached.source, scope);
      const detached = operationNamed(declaration.detached.model);
      if (detached && (base.kind === "client" || base.kind === "delegate")) {
        return {
          kind: "unknown",
          reason: `\`${declaration.name}\` is destructured from a Prisma operation with a default value, so its identity is ambiguous`,
          operationAlias: true,
        };
      }
    }

    const list = model.writes.get(declaration) ?? [];
    if (list.length === 0) {
      return { kind: "unknown", reason: `\`${declaration.name}\` is declared without a value` };
    }

    const results = list.map((write) => resolveExpression(write.expr, write.scope));
    const first = results[0];
    if (results.every((binding) => sameBinding(binding, first))) return first;

    // An operation alias that is later reassigned cannot be proven to be the
    // operation any more. Say so explicitly instead of resolving to whichever
    // write happened to be processed last.
    if (
      results.some(
        (binding) =>
          binding.kind === "operationRef" ||
          (binding.kind === "container" && binding.holdsOperation) ||
          (binding.kind === "unknown" && binding.operationAlias)
      )
    ) {
      return {
        kind: "unknown",
        reason: `\`${declaration.name}\` is an alias of a Prisma operation that is reassigned`,
        operationAlias: true,
      };
    }

    return {
      kind: "unknown",
      reason: `\`${declaration.name}\` is reassigned with a different value`,
    };
  };

  /**
   * Whether a member of `name` is assigned anywhere in the scope or a nested
   * one. A container is analysed from its literal, so a later `ops[0] = …`
   * means its contents are no longer knowable.
   */
  const memberAssigned = (scope: Scope, name: string): boolean => {
    if (model.memberWrites.get(scope)?.has(name)) return true;
    return scope.children.some((child) => memberAssigned(child, name));
  };

  const resolveDeclaration = (scope: Scope, declaration: Declaration): Binding => {
    const cached = scope.resolved.get(declaration.name);
    if (cached) return cached;

    if (scope.resolving.has(declaration.name)) {
      return { kind: "unknown", reason: `cyclic alias chain at \`${declaration.name}\`` };
    }

    scope.resolving.add(declaration.name);
    const binding = compute(scope, declaration);
    scope.resolving.delete(declaration.name);

    // Only a variable can be mutated through its own members; a container built
    // inline has no name to assign through.
    if (binding.kind === "container" && declaration.type === "variable") {
      // An alias shares the container object, so keep the name it was built
      // with; the first binding is the one diagnostics should mention.
      if (!binding.name) binding.name = declaration.name;
      if (memberAssigned(scope, declaration.name)) binding.mutated = true;
    }

    scope.resolved.set(declaration.name, binding);
    return binding;
  };

  const resolveName = (scope: Scope | null, name: string): Binding | undefined => {
    for (let current = scope; current; current = current.parent) {
      const declaration = current.declarationFor(name);
      if (declaration) return resolveDeclaration(current, declaration);
    }
    // An unbound `prisma` is the conventional implicit import.
    return name === "prisma" ? { kind: "client" } : undefined;
  };

  const singleWrite = (scope: Scope | null, name: string): Write | undefined => {
    let current: Scope | null = scope;
    while (current) {
      const declaration = current.declarationFor(name);
      if (declaration) {
        if (declaration.type !== "variable") return undefined;
        const list = model.writes.get(declaration) ?? [];
        return list.length === 1 ? list[0] : undefined;
      }
      current = current.parent;
    }
    return undefined;
  };

  const findDeclaration = (
    scope: Scope | null,
    name: string
  ): { scope: Scope; declaration: Declaration } | undefined => {
    for (let current = scope; current; current = current.parent) {
      const declaration = current.declarationFor(name);
      if (declaration) return { scope: current, declaration };
    }
    return undefined;
  };

  const justifying = new Set<ts.Node>();

  const signatureIsDefined = (
    declaration: ts.SignatureDeclaration,
    depth: number
  ): boolean => {
    if (declaration.type) return typeIsDefined(declaration.type);

    // Call/construct/index signatures have no body; only function-like
    // declarations do, so narrow before reading it.
    const body = "body" in declaration ? declaration.body : undefined;
    if (!body || justifying.has(declaration)) return false;

    justifying.add(declaration);
    try {
      if (!ts.isBlock(body)) {
        return (
          valueVerdict(body, model.nodeScope.get(body) ?? model.root, depth + 1) === "defined"
        );
      }

      const returns: ts.Expression[] = [];
      let bareReturn = false;

      const collect = (child: ts.Node) => {
        if (FUNCTION_LIKE(child)) return; // returns inside a nested function are not this one's
        if (ts.isReturnStatement(child)) {
          if (child.expression) returns.push(child.expression);
          else bareReturn = true;
          return;
        }
        ts.forEachChild(child, collect);
      };
      ts.forEachChild(body, collect);

      // A body that can fall off its end returns `undefined`. Only a body that
      // always ends in `return`/`throw` is safe to judge from its returns.
      const last = body.statements[body.statements.length - 1];
      if (!last || (!ts.isReturnStatement(last) && !ts.isThrowStatement(last))) {
        return false;
      }

      if (bareReturn || returns.length === 0) return false;
      return returns.every(
        (expr) =>
          valueVerdict(expr, model.nodeScope.get(expr) ?? model.root, depth + 1) === "defined"
      );
    } finally {
      justifying.delete(declaration);
    }
  };

  /** Built-ins whose return type cannot be `undefined`. */
  const DEFINED_MEMBER_CALLS: Record<string, ReadonlySet<string>> = {
    Date: new Set(["now"]),
    crypto: new Set(["randomUUID"]),
    Math: new Set(["random", "floor", "trunc", "round", "abs", "min", "max"]),
  };
  const DEFINED_GLOBALS = new Set(["String", "Number", "Boolean", "BigInt"]);

  /** Array/String methods that always return a value (never `undefined`). */
  const DEFINED_METHODS = new Set([
    "map",
    "filter",
    "slice",
    "concat",
    "flat",
    "flatMap",
    "sort",
    "reverse",
    "join",
  ]);

  /**
   * A call is only a proven value when its declaration justifies it: a local
   * return annotation, a local body whose returns are all values, a repository
   * export with such an annotation, or a known built-in. Anything else is
   * treated as possibly `undefined` and reported as unsupported.
   */
  const isJustifiedCall = (callee: ts.Expression, scope: Scope, depth: number): boolean => {
    if (ts.isIdentifier(callee)) {
      const found = findDeclaration(scope, callee.text);
      if (!found) return DEFINED_GLOBALS.has(callee.text);

      const declaration = found.declaration;
      if (declaration.type === "opaque" && declaration.node) {
        return signatureIsDefined(declaration.node, depth);
      }
      if (declaration.type === "variable") {
        const writes = model.writes.get(declaration) ?? [];
        if (writes.length !== 1) return false;
        const expr = writes[0].expr;
        if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
          return signatureIsDefined(expr, depth);
        }
        return false;
      }
      if (declaration.type === "import") {
        if (declaration.imported === "*") return false;
        return (
          options.externalReturnIsDefined?.(declaration.module, declaration.imported, sourceFileName) ??
          false
        );
      }
      return false;
    }

    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
      if (DEFINED_METHODS.has(callee.name.text)) return true;
      if (ts.isIdentifier(callee.expression)) {
        return DEFINED_MEMBER_CALLS[callee.expression.text]?.has(callee.name.text) ?? false;
      }
    }

    return false;
  };

  /**
   * Values are treated as defined unless the syntax shows they can be
   * `undefined`: a literal `undefined`, array indexing, an optional chain, an
   * array lookup such as `.find()`, an object-valued binding, or an identifier
   * whose whole write history is one of those. Calls are justified only by
   * their declaration (see `isJustifiedCall`).
   */
  const valueVerdict = (
    expr: ts.Expression | undefined,
    scope: Scope,
    depth = 0
  ): ValueVerdict => {
    if (!expr || depth > 6) return "maybe";

    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr)) {
      return valueVerdict(expr.expression, scope, depth + 1);
    }
    if (ts.isSatisfiesExpression(expr) || ts.isTypeAssertionExpression(expr)) {
      return valueVerdict(expr.expression, scope, depth + 1);
    }
    // `!` is erased at runtime, so it does not make a lookup defined.
    if (ts.isNonNullExpression(expr)) return valueVerdict(expr.expression, scope, depth + 1);
    if (ts.isAwaitExpression(expr)) return valueVerdict(expr.expression, scope, depth + 1);

    if (ts.isIdentifier(expr)) {
      if (expr.text === "undefined" && !findDeclaration(scope, "undefined")) return "none";
      const found = findDeclaration(scope, expr.text);
      // An undeclared identifier is a global or a snippet constant; the guard
      // does not claim it can be `undefined`.
      if (!found) return "defined";
      return declarationVerdict(found.scope, found.declaration, depth + 1);
    }

    if (ts.isPropertyAccessExpression(expr)) {
      return expr.questionDotToken ? "maybe" : "defined";
    }

    // `ids[0]` is the canonical "may be undefined" lookup.
    if (ts.isElementAccessExpression(expr)) return "maybe";

    if (ts.isCallExpression(expr)) {
      if (expr.questionDotToken) return "maybe";
      const callee = expr.expression;
      if (ts.isPropertyAccessExpression(callee) && LOOKUP_MEMBERS.has(callee.name.text)) {
        return "maybe";
      }
      return isJustifiedCall(callee, scope, depth) ? "defined" : "maybe";
    }

    if (ts.isNewExpression(expr)) return "defined";

    if (ts.isVoidExpression(expr)) return "none";

    if (ts.isConditionalExpression(expr)) {
      const whenTrue = valueVerdict(expr.whenTrue, scope, depth + 1);
      const whenFalse = valueVerdict(expr.whenFalse, scope, depth + 1);
      if (whenTrue === "none" || whenFalse === "none") return "maybe";
      if (whenTrue === "defined" && whenFalse === "defined") return "defined";
      return whenTrue === "unknown" || whenFalse === "unknown" ? "unknown" : "maybe";
    }

    if (ts.isBinaryExpression(expr)) {
      if (expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
        const left = valueVerdict(expr.left, scope, depth + 1);
        const right = valueVerdict(expr.right, scope, depth + 1);
        if (left === "none") return right;
        if (left === "defined") return "defined";
        if (left === "maybe" || right === "maybe") return "maybe";
        return "unknown";
      }
      if (
        expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        expr.operatorToken.kind === ts.SyntaxKind.BarBarToken
      ) {
        const left = valueVerdict(expr.left, scope, depth + 1);
        const right = valueVerdict(expr.right, scope, depth + 1);
        if (left === "defined" && right === "defined") return "defined";
        return "maybe";
      }
      return "defined";
    }

    if (
      ts.isObjectLiteralExpression(expr) ||
      ts.isArrayLiteralExpression(expr) ||
      ts.isFunctionExpression(expr) ||
      ts.isArrowFunction(expr) ||
      ts.isClassExpression(expr) ||
      ts.isStringLiteral(expr) ||
      ts.isNoSubstitutionTemplateLiteral(expr) ||
      ts.isTemplateExpression(expr) ||
      ts.isNumericLiteral(expr) ||
      ts.isBigIntLiteral(expr) ||
      expr.kind === ts.SyntaxKind.TrueKeyword ||
      expr.kind === ts.SyntaxKind.FalseKeyword ||
      expr.kind === ts.SyntaxKind.NullKeyword
    ) {
      return "defined";
    }

    return "maybe";
  };

  const declarationVerdict = (
    scope: Scope,
    declaration: Declaration,
    depth: number
  ): ValueVerdict => {
    if (declaration.type === "import" || declaration.type === "opaque") return "defined";
    if (declaration.type === "parameter") return "maybe";
    if (declaration.type === "pattern") return "maybe";
    if (declaration.type === "destructured") return "maybe";
    if (declaration.type === "element") return "defined";

    const list = model.writes.get(declaration) ?? [];
    if (list.length === 0) return "maybe";

    // A binding that holds an object is a filter object, not a proven scalar
    // predicate: `const filter = { id: undefined }` must not look restrictive.
    if (list.some((write) => ts.isObjectLiteralExpression(write.expr))) return "maybe";

    const verdicts = list.map((write) => valueVerdict(write.expr, write.scope, depth + 1));
    if (verdicts.some((verdict) => verdict === "none")) return "maybe";
    if (verdicts.some((verdict) => verdict === "unknown")) return "unknown";
    if (verdicts.every((verdict) => verdict === "defined")) return "defined";
    return "maybe";
  };

  return {
    resolveName,
    resolveExpression,
    keyText: (expr, scope) => keyText(expr, scope),
    singleWrite,
    valueVerdict,
  };
}

/* ------------------------------------------------------------------ */
/* Pass 3 — filter and SQL analysis                                    */
/* ------------------------------------------------------------------ */

type WhereVerdict =
  | { kind: "restrictive" }
  | { kind: "conditional"; reason: string }
  | { kind: "empty"; reason: string }
  | { kind: "unknown"; reason: string };

const LOGICAL = new Set(["OR", "AND", "NOT"]);

function analyzeWhere(
  value: ts.Expression,
  resolver: Resolver,
  scope: Scope,
  depth = 0
): WhereVerdict {
  // Wrappers do not change the value: `where: (filter as any)` is the same
  // filter object.
  let expr: ts.Expression = value;
  while (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isSatisfiesExpression(expr) ||
    ts.isNonNullExpression(expr) ||
    ts.isTypeAssertionExpression(expr)
  ) {
    expr = expr.expression;
  }

  // `const filter = { id: … }; findMany({ where: filter })` proves exactly what
  // the inline literal proves, but only when the binding has one write: a
  // reassigned filter may hold anything by the time the query runs.
  if (ts.isIdentifier(expr)) {
    if (depth >= 8) {
      return { kind: "unknown", reason: "`where` alias chain is too deep to analyse" };
    }
    const write = resolver.singleWrite(scope, expr.text);
    if (!write) {
      return { kind: "unknown", reason: "`where` is not a literal object" };
    }
    return analyzeWhere(write.expr, resolver, write.scope, depth + 1);
  }

  if (!ts.isObjectLiteralExpression(expr)) {
    return { kind: "unknown", reason: "`where` is not a literal object" };
  }
  if (expr.properties.length === 0) {
    return { kind: "empty", reason: "empty `where: {}` filter" };
  }
  return analyzeFilterObject(expr, resolver, scope, "`where`");
}

/**
 * A predicate object is restrictive only if at least one of its conditions
 * provably restricts. `undefined` predicate values (directly, as a shorthand,
 * through an operator object, or nested in `OR`/`AND`/`NOT`) are omitted by
 * Prisma, so they contribute nothing to the filter.
 */
function analyzeFilterObject(
  object: ts.ObjectLiteralExpression,
  resolver: Resolver,
  scope: Scope,
  label: string
): WhereVerdict {
  if (object.properties.length === 0) {
    return { kind: "empty", reason: `${label} is an empty object` };
  }

  let definite = false;
  let conditional: WhereVerdict | null = null;
  let unknown: WhereVerdict | null = null;
  let empty: WhereVerdict | null = null;

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      unknown = { kind: "unknown", reason: `${label} contains a spread` };
      continue;
    }

    const key = nameOf(property.name);
    if (!key) {
      unknown = { kind: "unknown", reason: `${label} uses a computed key` };
      continue;
    }

    if (LOGICAL.has(key)) {
      const verdict = analyzeLogical(key, property, resolver, scope, label);
      if (verdict.kind === "restrictive") definite = true;
      else if (verdict.kind === "conditional") conditional ??= verdict;
      else if (verdict.kind === "unknown") unknown ??= verdict;
      else empty ??= verdict;
      continue;
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      const verdict = contribution(resolver.valueVerdict(property.name, scope));
      if (verdict === "definite") definite = true;
      else if (verdict === "conditional") {
        conditional ??= {
          kind: "conditional",
          reason: `${label}.${key} may be \`undefined\`, so it does not restrict the query`,
        };
      } else if (verdict === "unknown") {
        unknown ??= { kind: "unknown", reason: `${label}.${key} cannot be analysed` };
      }
      continue;
    }

    if (!ts.isPropertyAssignment(property)) {
      unknown = { kind: "unknown", reason: `${label} has an unanalysable property \`${key}\`` };
      continue;
    }

    const initializer = property.initializer;

    if (ts.isObjectLiteralExpression(initializer)) {
      if (initializer.properties.length === 0) continue; // `id: {}` restricts nothing
      const nested = analyzeFilterObject(initializer, resolver, scope, `${label}.${key}`);
      if (nested.kind === "restrictive") definite = true;
      else if (nested.kind === "conditional") conditional ??= nested;
      else if (nested.kind === "unknown") unknown ??= nested;
      else empty ??= nested;
      continue;
    }

    const verdict = contribution(resolver.valueVerdict(initializer, scope));
    if (verdict === "definite") definite = true;
    else if (verdict === "conditional") {
      conditional ??= {
        kind: "conditional",
        reason: `${label}.${key} may be \`undefined\`, so it does not restrict the query`,
      };
    } else if (verdict === "unknown") {
      unknown ??= { kind: "unknown", reason: `${label}.${key} cannot be analysed` };
    }
  }

  if (unknown) return unknown;
  if (definite) return { kind: "restrictive" };
  if (conditional) return conditional;
  return empty ?? { kind: "empty", reason: `${label} has no effective conditions` };
}

function contribution(verdict: ValueVerdict): "definite" | "conditional" | "unknown" | "none" {
  if (verdict === "defined") return "definite";
  if (verdict === "maybe") return "conditional";
  if (verdict === "unknown") return "unknown";
  return "none";
}

function analyzeLogical(
  key: string,
  property: ts.ObjectLiteralElementLike,
  resolver: Resolver,
  scope: Scope,
  parentLabel: string
): WhereVerdict {
  if (!ts.isPropertyAssignment(property)) {
    return { kind: "unknown", reason: `\`${key}\` is not a plain assignment` };
  }

  const value = property.initializer;
  const label = `\`${key}\``;

  const ineffective = (shape: string): WhereVerdict => ({
    kind: "empty",
    reason: `ineffective \`where\` (\`${key}: ${shape}\`)`,
  });

  if (ts.isArrayLiteralExpression(value)) {
    if (value.elements.length === 0) return ineffective("[]");

    let definite = false;
    let empty = false;
    let conditional: WhereVerdict | null = null;
    let unknown: WhereVerdict | null = null;

    for (const element of value.elements) {
      if (!ts.isObjectLiteralExpression(element)) {
        unknown ??= { kind: "unknown", reason: `${label} contains a non-literal entry` };
        continue;
      }
      const verdict = analyzeFilterObject(element, resolver, scope, `${label} entry`);
      if (verdict.kind === "restrictive") definite = true;
      else if (verdict.kind === "empty") empty = true;
      else if (verdict.kind === "conditional") conditional ??= verdict;
      else unknown ??= verdict;
    }

    if (unknown) return unknown;

    if (key === "OR") {
      // `OR: [{}]` matches every row; so does any branch that may be empty.
      if (empty) return ineffective("[{}]");
      if (conditional) return conditional;
      return definite ? { kind: "restrictive" } : ineffective("[]");
    }

    if (key === "AND") {
      // One always-true branch plus one restrictive branch still restricts.
      if (definite) return { kind: "restrictive" };
      if (conditional) return conditional;
      return ineffective("[{}]");
    }

    if (key === "NOT") {
      if (definite) return { kind: "restrictive" };
      if (conditional) return conditional;
      return ineffective("[{}]");
    }

    return { kind: "restrictive" };
  }

  if (ts.isObjectLiteralExpression(value)) {
    if (value.properties.length === 0) return ineffective("{}");
    return analyzeFilterObject(value, resolver, scope, `${parentLabel}.${key}`);
  }

  return { kind: "unknown", reason: `${label} is not a literal array or object` };
}

type ArgumentVerdict =
  | { kind: "ok" }
  | { kind: "violation"; reason: string }
  | { kind: "unsupported"; reason: string };

type AnalysisVerdict =
  | { kind: "ok" }
  | { kind: "violation"; reason: string }
  | { kind: "unsupported"; reason: string };

/* ------------------------------------------------------------------ */
/* Pass 3b — static evaluation of write payloads                       */
/* ------------------------------------------------------------------ */

/**
 * Operations whose Prisma API has no `where` clause. They are judged by their
 * `data` payload instead; every other operation is judged by its filter.
 */
const CREATE_OPERATIONS = new Set<ModelOperation>(["create", "createMany"]);

/* ------------------------------------------------------------------ */
/* Per-file fixture cleanup policy                                     */
/* ------------------------------------------------------------------ */

export type RelationInfo = {
  /** Foreign-key column on this model. */
  field: string;
  target: string;
  /** `onDelete: Cascade` in `prisma/schema.prisma`. */
  cascade: boolean;
};

/**
 * To-one relations transcribed from `prisma/schema.prisma`; the repository test
 * re-reads the schema so an entry cannot drift silently. Only `cascade: true`
 * relations can stand in for a dependent model's own cleanup — every other
 * referential action either leaves the row behind or blocks the parent delete,
 * so those entries prove ownership only and are never removal evidence.
 */
export const CLEANUP_RELATIONS: Record<string, Record<string, RelationInfo>> = {
  institution: {
    owner: { field: "ownerId", target: "user", cascade: false },
  },
  student: {
    parent: { field: "parentId", target: "user", cascade: false },
  },
  studentGuardian: {
    student: { field: "studentId", target: "student", cascade: true },
    user: { field: "userId", target: "user", cascade: false },
  },
  studentJoinCode: {
    student: { field: "studentId", target: "student", cascade: true },
    institution: { field: "institutionId", target: "institution", cascade: false },
    createdBy: { field: "createdById", target: "user", cascade: false },
    redeemedBy: { field: "redeemedById", target: "user", cascade: false },
  },
  studentGuardianEvent: {
    student: { field: "studentId", target: "student", cascade: true },
    link: { field: "linkId", target: "studentGuardian", cascade: false },
    guardian: { field: "guardianId", target: "user", cascade: false },
    institution: { field: "institutionId", target: "institution", cascade: false },
  },
  studentGuardianGrant: {
    link: { field: "linkId", target: "studentGuardian", cascade: true },
    institution: { field: "institutionId", target: "institution", cascade: true },
  },
  enrollment: {
    student: { field: "studentId", target: "student", cascade: false },
    institution: { field: "institutionId", target: "institution", cascade: false },
    class: { field: "classId", target: "schoolClass", cascade: false },
  },
  dailyLog: {
    student: { field: "studentId", target: "student", cascade: false },
    institution: { field: "institutionId", target: "institution", cascade: false },
  },
  paymentTransaction: {
    user: { field: "userId", target: "user", cascade: false },
    institution: { field: "institutionId", target: "institution", cascade: false },
  },
  quiz: {
    author: { field: "authorId", target: "user", cascade: false },
  },
  schoolClass: {
    institution: { field: "institutionId", target: "institution", cascade: false },
    teacher: { field: "teacherId", target: "user", cascade: false },
  },
  timetableSlot: {
    teacher: { field: "teacherId", target: "user", cascade: false },
    class: { field: "classId", target: "schoolClass", cascade: false },
  },
  staffMember: {
    user: { field: "userId", target: "user", cascade: false },
    institution: { field: "institutionId", target: "institution", cascade: false },
  },
  // Phase 4.4: an invitation follows its centre. `AuditLog` is deliberately
  // absent — it declares no relations at all (plain actor/entity id columns),
  // because an audit row must survive the deletion of what it describes.
  staffInvitation: {
    institution: { field: "institutionId", target: "institution", cascade: true },
  },
  lessonPlan: {
    author: { field: "authorId", target: "user", cascade: false },
    institution: { field: "institutionId", target: "institution", cascade: false },
    class: { field: "classId", target: "schoolClass", cascade: false },
    reviewer: { field: "reviewerId", target: "user", cascade: false },
  },
  teacherEvaluation: {
    teacher: { field: "teacherId", target: "user", cascade: false },
    supervisor: { field: "supervisorId", target: "user", cascade: false },
  },
  qualitySignal: {
    scopeOwner: { field: "scopeOwnerId", target: "user", cascade: false },
  },
  announcement: {
    institution: { field: "institutionId", target: "institution", cascade: false },
  },
  message: {
    fromUser: { field: "fromUserId", target: "user", cascade: false },
    toUser: { field: "toUserId", target: "user", cascade: false },
  },
  subjectPerformance: {
    institution: { field: "institutionId", target: "institution", cascade: false },
    student: { field: "studentId", target: "student", cascade: false },
  },
  activityEvent: {
    actor: { field: "actorId", target: "user", cascade: false },
    institution: { field: "institutionId", target: "institution", cascade: false },
  },
  directoryChecklistItem: {
    institution: { field: "institutionId", target: "institution", cascade: false },
  },
};

/**
 * What one file's own cleanup deletes, per column.
 *
 * `values` are exact matches, `prefixes` are `startsWith` matches, and
 * `fixture` allows a `create` result from the same file to stand in for a
 * pointer at a row that file removes. Everything here is derived from the
 * file's own `delete`/`deleteMany` predicates; no column is inherited from
 * another file and no column is assumed merely because the schema has it.
 */
type CleanupEvidence = {
  values: Set<string>;
  prefixes: Set<string>;
  fixture: boolean;
};

type CleanupPolicy = Map<string, Map<string, CleanupEvidence>>;

const newEvidence = (): CleanupEvidence => ({
  values: new Set<string>(),
  prefixes: new Set<string>(),
  fixture: false,
});

function evidencePresent(evidence: CleanupEvidence): boolean {
  return evidence.values.size > 0 || evidence.prefixes.size > 0;
}

function mergeEvidence(into: CleanupEvidence, from: CleanupEvidence): boolean {
  let changed = false;
  for (const value of from.values) {
    if (!into.values.has(value)) {
      into.values.add(value);
      changed = true;
    }
  }
  for (const prefix of from.prefixes) {
    if (!into.prefixes.has(prefix)) {
      into.prefixes.add(prefix);
      changed = true;
    }
  }
  if (from.fixture && !into.fixture) {
    into.fixture = true;
    changed = true;
  }
  return changed;
}

function addEvidence(
  policy: CleanupPolicy,
  modelName: string,
  field: string,
  evidence: CleanupEvidence
): boolean {
  if (!evidencePresent(evidence)) return false;
  const fields = policy.get(modelName) ?? new Map<string, CleanupEvidence>();
  const current = fields.get(field) ?? newEvidence();
  const changed = mergeEvidence(current, evidence);
  fields.set(field, current);
  policy.set(modelName, fields);
  return changed;
}

/** `{ where: { … } }` → the `where` initializer. */
function objectField(
  object: ts.ObjectLiteralExpression,
  key: string
): ts.Expression | undefined {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (nameOf(property.name) !== key) continue;
    return property.initializer;
  }
  return undefined;
}

function addStaticPrefix(
  evidence: CleanupEvidence,
  expression: ts.Expression,
  scope: Scope,
  resolver: Resolver,
  model: ScopeModel
): void {
  const value = evaluateStatic(expression, scope, resolver, model, {
    bindings: new Map(),
    depth: 0,
  });
  if ((value.kind === "string" || value.kind === "stringPrefix") && value.value.length > 0) {
    evidence.prefixes.add(value.value);
  }
}

function addStaticValue(
  evidence: CleanupEvidence,
  expression: ts.Expression,
  scope: Scope,
  resolver: Resolver,
  model: ScopeModel
): void {
  const value = evaluateStatic(expression, scope, resolver, model, {
    bindings: new Map(),
    depth: 0,
  });
  if (value.kind === "string" && value.value.length > 0) evidence.values.add(value.value);
  else if (value.kind === "stringPrefix" && value.value.length > 0) {
    evidence.prefixes.add(value.value);
  }
}

/** How one Prisma filter value restricts rows (`startsWith`, `equals`, `in`). */
function predicateEvidence(
  expression: ts.Expression,
  scope: Scope,
  resolver: Resolver,
  model: ScopeModel
): CleanupEvidence {
  const evidence = newEvidence();
  const node = unwrapExpression(expression);

  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const key = nameOf(property.name);
      if (key === "startsWith") {
        addStaticPrefix(evidence, property.initializer, scope, resolver, model);
      } else if (key === "equals") {
        addStaticValue(evidence, property.initializer, scope, resolver, model);
      } else if (key === "in") {
        const list = evaluateStatic(property.initializer, scope, resolver, model, {
          bindings: new Map(),
          depth: 0,
        });
        if (list.kind === "array" && !list.open) {
          for (const element of list.elements) {
            if (element.kind === "string" && element.value.length > 0) {
              evidence.values.add(element.value);
            } else if (element.kind === "stringPrefix" && element.value.length > 0) {
              evidence.prefixes.add(element.value);
            }
          }
        }
      }
    }
    return evidence;
  }

  addStaticValue(evidence, node, scope, resolver, model);
  return evidence;
}

function mergeField(
  found: Map<string, CleanupEvidence>,
  field: string,
  evidence: CleanupEvidence
): void {
  if (!evidencePresent(evidence)) return;
  const current = found.get(field) ?? newEvidence();
  mergeEvidence(current, evidence);
  found.set(field, current);
}

/**
 * Columns a single `delete`/`deleteMany` predicate removes rows by.
 *
 * Logical `OR`/`AND` branches are unioned (either branch removes the row) and
 * `NOT` is ignored, because exclusions prove nothing about removal. A to-one
 * relation filter proves the foreign key only when the nested filter is itself
 * cleanup-scoped: `{ parent: { email: { startsWith: P } } }` really does remove
 * the dependent rows, so their `parentId` column is a removal key.
 */
function collectCleanup(
  expression: ts.Expression,
  modelName: string,
  scope: Scope,
  resolver: Resolver,
  model: ScopeModel
): Map<string, CleanupEvidence> {
  const found = new Map<string, CleanupEvidence>();
  const node = unwrapExpression(expression);
  if (!ts.isObjectLiteralExpression(node)) return found;

  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = nameOf(property.name);
    if (!key) continue;

    if (key === "OR" || key === "AND") {
      const inner = unwrapExpression(property.initializer);
      const branches = ts.isArrayLiteralExpression(inner)
        ? inner.elements.filter((element): element is ts.Expression => !ts.isSpreadElement(element))
        : [inner];
      for (const branch of branches) {
        for (const [field, evidence] of collectCleanup(branch, modelName, scope, resolver, model)) {
          mergeField(found, field, evidence);
        }
      }
      continue;
    }

    if (key === "NOT") continue;

    if (key === "is") {
      for (const [field, evidence] of collectCleanup(
        property.initializer,
        modelName,
        scope,
        resolver,
        model
      )) {
        mergeField(found, field, evidence);
      }
      continue;
    }

    const relation = CLEANUP_RELATIONS[modelName]?.[key];
    if (relation) {
      const nested = collectCleanup(property.initializer, relation.target, scope, resolver, model);
      const inherited = newEvidence();
      for (const evidence of nested.values()) mergeEvidence(inherited, evidence);
      if (evidencePresent(inherited)) {
        // The filter reaches rows this file created, so a same-file `create`
        // result pointing at one of them is proven too.
        inherited.fixture = true;
        mergeField(found, relation.field, inherited);
      }
      continue;
    }

    mergeField(found, key, predicateEvidence(property.initializer, scope, resolver, model));
  }

  return found;
}

/** True when a filter constrains `id` in a form this analysis cannot resolve. */
function constrainsUnresolvedId(expression: ts.Expression): boolean {
  const node = unwrapExpression(expression);
  if (!ts.isObjectLiteralExpression(node)) return false;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = nameOf(property.name);
    if (key === "id") return true;
    if (key === "OR" || key === "AND") {
      const inner = unwrapExpression(property.initializer);
      const branches = ts.isArrayLiteralExpression(inner)
        ? inner.elements.filter((element): element is ts.Expression => !ts.isSpreadElement(element))
        : [inner];
      if (branches.some(constrainsUnresolvedId)) return true;
    }
  }
  return false;
}

/**
 * The cleanup policy of one source file: which models, and which columns, this
 * file's own teardown provably removes rows by.
 *
 * Only `delete`/`deleteMany` predicates prove removal. Two inferences are
 * allowed, and both are stated here so they can be tested:
 *
 *   • cascade — a dependent row whose relation declares `onDelete: Cascade` is
 *     removed along with the parent row that the same file cleans;
 *   • collected ids — a suite that selects rows with a scoped predicate and
 *     then deletes exactly that list by an id expression it does not resolve
 *     (`deleteMany({ where: { id: { in: collected } } })`) has deleted the rows
 *     its own read matched.
 *
 * Nothing else grants identity. A model with no entry is unproven, and a column
 * is never accepted because it exists in the schema.
 */
function buildCleanupPolicy(
  sourceFile: ts.SourceFile,
  model: ScopeModel,
  resolver: Resolver
): CleanupPolicy {
  const policy: CleanupPolicy = new Map();
  const collectedIdDeletes = new Set<string>();
  const scopedReads = new Map<string, Map<string, CleanupEvidence>>();

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const operation = node.expression.name.text;
      const argument = node.arguments[0];
      if (argument && ts.isObjectLiteralExpression(argument)) {
        const scope = model.nodeScope.get(node) ?? model.root;
        const receiver = resolver.resolveExpression(node.expression.expression, scope);
        const where = objectField(argument, "where");
        if (receiver.kind === "delegate" && where) {
          if (operation === "deleteMany" || operation === "delete") {
            const fields = collectCleanup(where, receiver.model, scope, resolver, model);
            for (const [field, evidence] of fields) {
              addEvidence(policy, receiver.model, field, evidence);
            }
            if (fields.size === 0 && constrainsUnresolvedId(where)) {
              collectedIdDeletes.add(receiver.model);
            }
          } else if (operation === "findMany" || operation === "findFirst") {
            const fields = collectCleanup(where, receiver.model, scope, resolver, model);
            if (fields.size > 0) scopedReads.set(receiver.model, fields);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  for (const modelName of collectedIdDeletes) {
    if (policy.has(modelName)) continue;
    const fields = scopedReads.get(modelName);
    if (!fields) continue;
    for (const [field, evidence] of fields) addEvidence(policy, modelName, field, evidence);
  }

  let changed = true;
  let passes = 0;
  while (changed && passes <= Object.keys(CLEANUP_RELATIONS).length) {
    changed = false;
    passes += 1;
    for (const [modelName, relations] of Object.entries(CLEANUP_RELATIONS)) {
      for (const relation of Object.values(relations)) {
        if (!relation.cascade) continue;
        const target = policy.get(relation.target);
        if (!target) continue;
        const inherited = newEvidence();
        for (const evidence of target.values()) mergeEvidence(inherited, evidence);
        if (!evidencePresent(inherited)) continue;
        inherited.fixture = true;
        if (addEvidence(policy, modelName, relation.field, inherited)) changed = true;
      }
    }
  }

  return policy;
}

type CleanupMatch = "match" | "unknown" | "mismatch";

/** Does a write value provably fall inside what this file's cleanup removes? */
function matchesCleanup(value: StaticValue, evidence: CleanupEvidence): CleanupMatch {
  if (value.kind === "fixture") return evidence.fixture ? "match" : "unknown";
  if (value.kind === "unknown") return "unknown";

  if (value.kind === "string") {
    if (evidence.values.has(value.value)) return "match";
    for (const prefix of evidence.prefixes) {
      if (prefix.length > 0 && value.value.startsWith(prefix)) return "match";
    }
    return "mismatch";
  }

  if (value.kind === "stringPrefix") {
    for (const prefix of evidence.prefixes) {
      if (prefix.length > 0 && value.value.startsWith(prefix)) return "match";
    }
    return "unknown";
  }

  return "mismatch";
}

/**
 * A value resolved from a write payload. Only what the analysis needs is
 * modelled: strings get compared against the file's fixture prefixes, objects
 * and arrays are inspected per field / per record, and a value produced by a
 * `create` in the same module is a fixture-owned row.
 */
type StaticValue =
  | { kind: "string"; value: string }
  /**
   * A string whose *prefix* is known but whose tail is dynamic, e.g.
   * `` `${PREFIX}${label}` ``. Safe to judge against a fixture prefix when the
   * known part already starts with one.
   */
  | { kind: "stringPrefix"; value: string }
  /** Statically known, but not a string (number, boolean, Date, null, …). */
  | { kind: "scalar" }
  | {
      kind: "object";
      entries: Map<string, { value: StaticValue; tainted: boolean }>;
      /** A spread or computed key made some keys unknowable. */
      open: boolean;
    }
  | { kind: "array"; elements: StaticValue[]; open: boolean }
  | { kind: "function"; node: ts.FunctionLikeDeclaration }
  | { kind: "fixture" }
  | { kind: "unknown" };

const UNKNOWN_VALUE: StaticValue = { kind: "unknown" };

type EvalContext = {
  /** Parameters of an inlined helper, by name. */
  bindings: Map<string, StaticValue>;
  depth: number;
};

const MAX_EVAL_DEPTH = 20;

type WriteContext = {
  model: ScopeModel;
  modelName?: string;
  /** This file's own cleanup policy — the only source of identity truth. */
  policy: CleanupPolicy;
};

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** The single value a function-like returns, when it is statically reachable. */
function returnedExpression(node: ts.FunctionLikeDeclaration): ts.Expression | undefined {
  const body = node.body;
  if (!body) return undefined;
  if (!ts.isBlock(body)) return body;
  const returns = body.statements.filter(ts.isReturnStatement);
  if (returns.length !== 1 || !returns[0].expression) return undefined;
  return returns[0].expression;
}

/**
 * Resolve a `data` expression without executing it: literals, constant
 * templates, multi-hop `const` aliases (through the scope model's unique-write
 * lookup, so a reassigned binding is not assumed), object/array literals,
 * spreads of resolved values, object properties, inline local helpers called
 * with constant arguments, `.map` over a resolved array, and Prisma `create`
 * results.
 *
 * Anything else — a runtime call, an import, a reassigned variable — is
 * `unknown`, never silently safe.
 */
function evaluateStatic(
  expression: ts.Expression,
  scope: Scope,
  resolver: Resolver,
  model: ScopeModel,
  context: EvalContext
): StaticValue {
  if (context.depth > MAX_EVAL_DEPTH) return UNKNOWN_VALUE;

  const node = unwrapExpression(expression);
  const next = (bindings: Map<string, StaticValue>): EvalContext => ({
    bindings,
    depth: context.depth + 1,
  });

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: "string", value: node.text };
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return { kind: "function", node };
  }

  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const part = evaluateStatic(span.expression, scope, resolver, model, next(context.bindings));
      if (part.kind === "string" || part.kind === "stringPrefix") {
        value += part.value;
      } else {
        // Everything before this span is still a proven prefix of the result.
        return value.length > 0 ? { kind: "stringPrefix", value } : UNKNOWN_VALUE;
      }
      value += span.literal.text;
    }
    return { kind: "string", value };
  }

  if (ts.isIdentifier(node)) {
    const bound = context.bindings.get(node.text);
    if (bound) return bound;

    // A unique write is a provable value; a reassigned or assigned-only
    // binding is not, and `singleWrite` returns undefined for those.
    const write = resolver.singleWrite(scope, node.text);
    if (write) {
      return evaluateStatic(write.expr, write.scope, resolver, model, next(context.bindings));
    }

    const named = model.namedFunctions.get(node.text);
    if (named) return { kind: "function", node: named };

    return UNKNOWN_VALUE;
  }

  if (
    ts.isNumericLiteral(node) ||
    ts.isBigIntLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.UndefinedKeyword ||
    ts.isNewExpression(node)
  ) {
    return { kind: "scalar" };
  }

  if (ts.isObjectLiteralExpression(node)) {
    const entries = new Map<string, { value: StaticValue; tainted: boolean }>();
    let open = false;

    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = evaluateStatic(property.expression, scope, resolver, model, next(context.bindings));
        if (spread.kind === "object") {
          for (const [key, entry] of spread.entries) {
            entries.set(key, { value: entry.value, tainted: entry.tainted || spread.open });
          }
          if (spread.open) {
            open = true;
            for (const entry of entries.values()) entry.tainted = true;
          }
        } else {
          // An unresolvable spread may add or override any key, including an
          // identity field written earlier in the same literal.
          open = true;
          for (const entry of entries.values()) entry.tainted = true;
        }
        continue;
      }

      if (ts.isComputedPropertyName(property.name)) {
        open = true;
        for (const entry of entries.values()) entry.tainted = true;
        continue;
      }

      const key = nameOf(property.name);
      if (!key) {
        open = true;
        for (const entry of entries.values()) entry.tainted = true;
        continue;
      }

      let value: StaticValue = UNKNOWN_VALUE;
      if (ts.isPropertyAssignment(property)) {
        value = evaluateStatic(property.initializer, scope, resolver, model, next(context.bindings));
      } else if (ts.isShorthandPropertyAssignment(property)) {
        value = evaluateStatic(property.name, scope, resolver, model, next(context.bindings));
      }
      entries.set(key, { value, tainted: false });
    }

    return { kind: "object", entries, open };
  }

  if (ts.isArrayLiteralExpression(node)) {
    const elements: StaticValue[] = [];
    let open = false;

    for (const element of node.elements) {
      if (ts.isOmittedExpression(element)) {
        elements.push(UNKNOWN_VALUE);
        continue;
      }
      if (ts.isSpreadElement(element)) {
        const spread = evaluateStatic(element.expression, scope, resolver, model, next(context.bindings));
        if (spread.kind === "array") {
          elements.push(...spread.elements);
          if (spread.open) open = true;
        } else {
          open = true;
          elements.push(UNKNOWN_VALUE);
        }
        continue;
      }
      elements.push(evaluateStatic(element, scope, resolver, model, next(context.bindings)));
    }

    return { kind: "array", elements, open };
  }

  if (ts.isPropertyAccessExpression(node)) {
    const target = evaluateStatic(node.expression, scope, resolver, model, next(context.bindings));
    if (target.kind === "fixture") return { kind: "fixture" };
    if (target.kind === "object") {
      const entry = target.entries.get(node.name.text);
      if (!entry) return UNKNOWN_VALUE;
      return entry.tainted ? UNKNOWN_VALUE : entry.value;
    }
    return UNKNOWN_VALUE;
  }

  if (ts.isElementAccessExpression(node)) {
    const target = evaluateStatic(node.expression, scope, resolver, model, next(context.bindings));
    const key = resolver.keyText(node.argumentExpression, scope);
    if (!key) return UNKNOWN_VALUE;
    if (target.kind === "fixture") return { kind: "fixture" };
    if (target.kind === "object") {
      const entry = target.entries.get(key);
      if (!entry) return UNKNOWN_VALUE;
      return entry.tainted ? UNKNOWN_VALUE : entry.value;
    }
    return UNKNOWN_VALUE;
  }

  if (ts.isAwaitExpression(node)) {
    return evaluateStatic(node.expression, scope, resolver, model, next(context.bindings));
  }

  if (ts.isCallExpression(node)) {
    // `ARRAY.map(callback)` over a statically known array: evaluate one record
    // per element with the callback parameters bound.
    if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map") {
      const receiver = evaluateStatic(
        node.expression.expression,
        scope,
        resolver,
        model,
        next(context.bindings)
      );
      const callback = node.arguments[0];
      if (
        receiver.kind === "array" &&
        !receiver.open &&
        callback &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      ) {
        const elements = receiver.elements.map((element, index) => {
          const target = returnedExpression(callback);
          if (!target) return UNKNOWN_VALUE;
          const bindings = new Map<string, StaticValue>();
          callback.parameters.forEach((parameter, position) => {
            if (!ts.isIdentifier(parameter.name)) return;
            bindings.set(
              parameter.name.text,
              position === 0 ? element : { kind: "scalar" }
            );
          });
          const bodyScope = model.nodeScope.get(target) ?? scope;
          return evaluateStatic(target, bodyScope, resolver, model, {
            bindings,
            depth: context.depth + 1,
          });
        });
        return { kind: "array", elements, open: false };
      }
      return UNKNOWN_VALUE;
    }

    // A local helper called with statically known arguments, e.g.
    // `const id = (name: string) => `${PREFIX}${name}``.
    const direct = evaluateStatic(node.expression, scope, resolver, model, next(context.bindings));
    if (direct.kind === "function") {
      const target = returnedExpression(direct.node);
      if (!target) return UNKNOWN_VALUE;
      const bindings = new Map<string, StaticValue>();
      direct.node.parameters.forEach((parameter, position) => {
        if (!ts.isIdentifier(parameter.name)) return;
        const argument = node.arguments[position];
        bindings.set(
          parameter.name.text,
          argument
            ? evaluateStatic(argument, scope, resolver, model, next(context.bindings))
            : UNKNOWN_VALUE
        );
      });
      const bodyScope = model.nodeScope.get(target) ?? scope;
      return evaluateStatic(target, bodyScope, resolver, model, {
        bindings,
        depth: context.depth + 1,
      });
    }

    // A Prisma create returns a row this module just created: its id (and any
    // relation to it) is fixture-owned by construction.
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "create"
    ) {
      return { kind: "fixture" };
    }

    return UNKNOWN_VALUE;
  }

  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = evaluateStatic(node.left, scope, resolver, model, next(context.bindings));
      const right = evaluateStatic(node.right, scope, resolver, model, next(context.bindings));
      if (left.kind === "string" && right.kind === "string") {
        return { kind: "string", value: left.value + right.value };
      }
      if (left.kind === "string" || left.kind === "stringPrefix") {
        return left.value.length > 0 ? { kind: "stringPrefix", value: left.value } : UNKNOWN_VALUE;
      }
      return UNKNOWN_VALUE;
    }
    return { kind: "scalar" };
  }

  return UNKNOWN_VALUE;
}

function payloadExpression(
  properties: Map<string, ts.ObjectLiteralElementLike>,
  key: string
): ts.Expression | undefined {
  const property = properties.get(key);
  if (!property) return undefined;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  if (ts.isPropertyAssignment(property)) return property.initializer;
  return undefined;
}

/** `{ kind: "ok" }` / violation / unsupported for one create record. */
function analyzeRecord(record: StaticValue, context: WriteContext): AnalysisVerdict {
  if (record.kind !== "object") return { kind: "unsupported", reason: "cannot determine fixture scope of `data` payload" };
  if (record.entries.size === 0) {
    return { kind: "violation", reason: "empty data record" };
  }

  const fields = context.modelName ? context.policy.get(context.modelName) : undefined;
  if (!fields || fields.size === 0) {
    // Nothing in this file proves the model is cleaned at all, so its rows
    // cannot be attributed to this suite whatever the payload looks like.
    return {
      kind: "unsupported",
      reason: `no proven fixture cleanup for \`${context.modelName ?? "this model"}\` in this file`,
    };
  }

  const identity = [...fields.keys()].filter((field) => record.entries.has(field)).sort();

  if (identity.length === 0) {
    // A spread of an unresolvable value may still add a cleanup-proven field.
    if (record.open) {
      return { kind: "unsupported", reason: "cannot determine fixture scope of `data` payload" };
    }
    return { kind: "violation", reason: "no fixture-scoped identity in `data` payload" };
  }

  let ambiguous = false;
  for (const field of identity) {
    const entry = record.entries.get(field);
    if (!entry || entry.tainted) {
      ambiguous = true;
      continue;
    }
    const verdict = matchesCleanup(entry.value, fields.get(field) as CleanupEvidence);
    if (verdict === "match") return { kind: "ok" };
    if (verdict === "unknown") ambiguous = true;
  }

  if (ambiguous) {
    return { kind: "unsupported", reason: "cannot determine fixture scope of `data` payload" };
  }

  return { kind: "violation", reason: "`data` payload is not fixture-scoped" };
}

/** Analyze a resolved `data` value, per record for createMany. */
function analyzeDataValue(
  data: StaticValue,
  operation: "create" | "createMany",
  context: WriteContext
): AnalysisVerdict {
  if (data.kind === "unknown") {
    return { kind: "unsupported", reason: "cannot determine fixture scope of `data` payload" };
  }

  if (operation === "create") {
    if (data.kind !== "object") {
      return { kind: "violation", reason: "`data` payload is not a record" };
    }
    return analyzeRecord(data, context);
  }

  // Prisma's `createMany` accepts `Input | Input[]`; both shapes are valid and
  // both are analysed per record.
  if (data.kind === "object") return analyzeRecord(data, context);

  if (data.kind !== "array") {
    return { kind: "violation", reason: "`data` payload is not a record or array of records" };
  }

  if (data.elements.length === 0) {
    return { kind: "violation", reason: "empty `data` payload" };
  }

  if (data.open) {
    return { kind: "unsupported", reason: "cannot determine fixture scope of `data` payload" };
  }

  let accepted = 0;
  let violations = 0;
  let ambiguous = false;

  for (const element of data.elements) {
    const verdict = analyzeRecord(element, context);
    if (verdict.kind === "ok") accepted += 1;
    else if (verdict.kind === "violation") violations += 1;
    else ambiguous = true;
  }

  if (violations > 0) {
    if (accepted > 0) {
      return { kind: "violation", reason: "mixed scoped and unscoped records in `data` array" };
    }
    return { kind: "violation", reason: "no fixture-scoped identity in `data` payload" };
  }

  if (ambiguous) {
    return { kind: "unsupported", reason: "cannot determine fixture scope of `data` payload" };
  }

  return { kind: "ok" };
}

/** Judge the `data` payload of `create` / `createMany`. */
function analyzeCreateArguments(
  argument: ts.ObjectLiteralExpression,
  resolver: Resolver,
  scope: Scope,
  operation: "create" | "createMany",
  context: WriteContext | undefined
): ArgumentVerdict {
  if (!context) return { kind: "unsupported", reason: "cannot determine fixture scope of `data` payload" };

  const data = payloadExpression(
    new Map(
      argument.properties
        .filter(
          (property): property is ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
            ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)
        )
        .map((property) => [nameOf(property.name) ?? "", property] as const)
    ),
    "data"
  );

  if (!data) return { kind: "violation", reason: "no `data` payload" };

  const value = evaluateStatic(data, scope, resolver, context.model, {
    bindings: new Map(),
    depth: 0,
  });

  return analyzeDataValue(value, operation, context);
}

/**
 * Update data may not move a row out of the suite's scope. Only identity fields
 * are inspected: `{ fullName: … }` or `{ role: … }` cannot change ownership.
 */
/**
 * Every model in `prisma/schema.prisma` declares `id`, so the primary key is an
 * identity column without needing a per-model table.
 */
const PRIMARY_KEY_FIELD = "id";

/**
 * The columns of `modelName` whose value decides which fixture row a record
 * belongs to: the primary key, plus the foreign keys transcribed into
 * `CLEANUP_RELATIONS` (whose completeness is asserted against
 * `prisma/schema.prisma` by the repository test).
 *
 * `undefined` means this module has no field metadata for the model at all —
 * `user` declares no to-one relation, and an unknown model has nothing — so no
 * field's ownership semantics can be established and none may be classified as
 * descriptive.
 */
function ownershipFieldsOf(modelName: string | undefined): Set<string> | undefined {
  if (!modelName) return undefined;
  const relations = CLEANUP_RELATIONS[modelName];
  if (!relations) return undefined;

  const fields = new Set<string>([PRIMARY_KEY_FIELD]);
  for (const relation of Object.values(relations)) fields.add(relation.field);
  return fields;
}

/**
 * The verdict for a write `data` payload when this file has no cleanup policy
 * for the model.
 *
 * Missing cleanup evidence is not a proven violation, so this never reports a
 * violation. It also never blesses an ownership write: with no policy there is
 * nothing that shows the row stays inside the fixture, so the write is
 * reported as unsupported instead of silently accepted.
 *
 * A change that touches no ownership column is left alone. The `where` clause
 * has already been proved restrictive by the caller, which is the same bar a
 * read or delete in this file has to clear, so a purely descriptive update on
 * an independently scoped row keeps its current verdict.
 */
function unprovenWriteVerdict(
  value: StaticValue,
  modelName: string | undefined
): ArgumentVerdict | undefined {
  if (value.kind !== "object") return undefined;

  const missing = `no proven fixture cleanup for \`${modelName ?? "this model"}\` in this file`;

  if (value.open) {
    return {
      kind: "unsupported",
      reason: `${missing}, and the \`data\` payload contains a spread or computed key that may change identity fields`,
    };
  }

  const ownership = ownershipFieldsOf(modelName);
  if (!ownership) {
    // Not one field can be classified — including `id` — so the payload as a
    // whole is unprovable rather than descriptive.
    if (value.entries.size === 0) return undefined;
    return {
      kind: "unsupported",
      reason: `${missing}, so the \`data\` payload cannot be shown to change only descriptive fields`,
    };
  }

  const touched = [...value.entries.keys()].filter((field) => ownership.has(field)).sort();
  if (touched.length === 0) return undefined;

  return {
    kind: "unsupported",
    reason: `${missing}, so the \`data\` payload cannot be shown to stay inside the fixture (${touched
      .map((field) => `\`${field}\``)
      .join(", ")})`,
  };
}

function analyzeWriteData(
  properties: Map<string, ts.ObjectLiteralElementLike>,
  context: WriteContext | undefined,
  resolver: Resolver,
  scope: Scope,
  key: string
): ArgumentVerdict | undefined {
  if (!context) return undefined;
  const expression = payloadExpression(properties, key);
  if (!expression) return undefined;

  const value = evaluateStatic(expression, scope, resolver, context.model, {
    bindings: new Map(),
    depth: 0,
  });

  if (value.kind === "unknown") {
    return {
      kind: "unsupported",
      reason: "cannot determine whether the write payload changes identity fields",
    };
  }
  if (value.kind !== "object") return undefined;

  const fields = context.modelName ? context.policy.get(context.modelName) : undefined;
  if (!fields || fields.size === 0) return unprovenWriteVerdict(value, context.modelName);

  let ambiguous = false;
  let unsafe = false;
  for (const [field, evidence] of fields) {
    const entry = value.entries.get(field);
    if (!entry) continue;
    if (entry.tainted) {
      ambiguous = true;
      continue;
    }
    const verdict = matchesCleanup(entry.value, evidence);
    if (verdict === "unknown") ambiguous = true;
    if (verdict === "mismatch") unsafe = true;
  }

  if (unsafe) {
    return {
      kind: "violation",
      reason: "write payload moves the record outside the fixture scope",
    };
  }
  if (ambiguous) {
    return {
      kind: "unsupported",
      reason: "cannot determine whether the write payload changes identity fields",
    };
  }
  return undefined;
}

/**
 * Judge a Prisma model operation.
 *
 * Dispatch is by operation, never by the presence of `where`: read operations
 * and `update`/`updateMany`/`upsert`/`delete`/`deleteMany` are judged by their
 * filter, `create`/`createMany` by their data payload, and upsert by all three
 * of `where`, `create` and `update`.
 */
function analyzeArguments(
  argument: ts.Expression | undefined,
  resolver: Resolver,
  scope: Scope,
  operation?: ModelOperation,
  context?: WriteContext
): ArgumentVerdict {
  if (!argument) return { kind: "violation", reason: "no arguments at all" };
  if (!ts.isObjectLiteralExpression(argument)) {
    return { kind: "unsupported", reason: "query arguments are not a literal object" };
  }
  if (argument.properties.length === 0) {
    // An empty argument list is a missing filter for every operation except
    // create, where it is a missing payload.
    if (operation && CREATE_OPERATIONS.has(operation)) {
      return { kind: "violation", reason: "no `data` payload" };
    }
    return { kind: "violation", reason: "no `where` filter" };
  }

  let spread = false;
  const properties = new Map<string, ts.ObjectLiteralElementLike>();

  for (const property of argument.properties) {
    if (ts.isSpreadAssignment(property)) {
      spread = true;
      continue;
    }
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      const key = nameOf(property.name);
      if (key) properties.set(key, property);
    }
  }

  if (spread) {
    return {
      kind: "unsupported",
      reason: "arguments contain a spread that may add or override fields",
    };
  }

  if (operation && CREATE_OPERATIONS.has(operation)) {
    return analyzeCreateArguments(
      argument,
      resolver,
      scope,
      operation === "createMany" ? "createMany" : "create",
      context
    );
  }

  const where = properties.get("where");
  if (!where) {
    return { kind: "violation", reason: "no `where` filter" };
  }

  if (ts.isShorthandPropertyAssignment(where)) {
    return { kind: "unsupported", reason: "`where` is a shorthand variable" };
  }

  const whereValue = (where as ts.PropertyAssignment).initializer;
  const bare = unwrapExpression(whereValue);
  // `where: undefined` / `where: null` is a missing filter, not an unprovable one.
  if (
    bare.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(bare) && bare.text === "undefined" && !resolver.singleWrite(scope, "undefined"))
  ) {
    return { kind: "violation", reason: "no `where` filter" };
  }

  const verdict = analyzeWhere(whereValue, resolver, scope);
  if (verdict.kind === "empty") return { kind: "violation", reason: verdict.reason };
  if (verdict.kind === "conditional") return { kind: "unsupported", reason: verdict.reason };
  if (verdict.kind !== "restrictive") return { kind: "unsupported", reason: verdict.reason };

  // `updateMany` writes the same `data` shape to every row its filter matches,
  // so an ownership change there moves every matched row just as an `update`
  // does; a safe `where` alone must not bless the payload.
  if (operation === "update" || operation === "updateMany" || operation === "upsert") {
    const dataVerdict = analyzeWriteData(
      properties,
      context,
      resolver,
      scope,
      operation === "upsert" ? "update" : "data"
    );
    if (dataVerdict) return dataVerdict;
  }

  if (operation === "upsert") {
    const create = payloadExpression(properties, "create");
    if (!create) return { kind: "violation", reason: "no `create` payload" };
    if (!context) {
      return { kind: "unsupported", reason: "cannot determine fixture scope of `data` payload" };
    }
    const value = evaluateStatic(create, scope, resolver, context.model, {
      bindings: new Map(),
      depth: 0,
    });
    const createVerdict = analyzeDataValue(value, "create", context);
    if (createVerdict.kind !== "ok") return createVerdict;
  }

  return { kind: "ok" };
}

/**
 * Establishes a SQL string's static text. A `const` initialised once from a
 * literal or a template is analysable; anything composed by a call is not.
 */
function constantSql(
  expr: ts.Expression | undefined,
  resolver: Resolver,
  scope: Scope,
  depth = 0
): string | undefined {
  if (!expr || depth > 4) return undefined;

  const direct = staticText(expr);
  if (direct !== undefined) return direct;

  if (ts.isIdentifier(expr)) {
    const write = resolver.singleWrite(scope, expr.text);
    if (!write) return undefined;
    return constantSql(write.expr, resolver, write.scope, depth + 1);
  }

  return undefined;
}

/**
 * A WHERE clause is necessary but not sufficient: `WHERE 1=1` restricts
 * nothing, and a tautology joined by `OR` makes the whole clause true. Only
 * obvious tautologies are rejected; real SQL is not fully parsed here.
 */
function sqlScope(sql: string): { ok: true } | { ok: false; reason: string } {
  if (!TABLE_REFERENCE.test(sql)) return { ok: true };
  if (!WHERE_CLAUSE.test(sql)) return { ok: false, reason: "raw SQL without a WHERE clause" };

  const where = /\bWHERE\b([\s\S]*)$/i.exec(sql);
  if (where && whereIsTautological(where[1])) {
    return { ok: false, reason: "raw SQL WHERE clause is trivially true" };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Scanning                                                            */
/* ------------------------------------------------------------------ */

type Receiver =
  | { kind: "model"; model: string }
  | { kind: "unsupported"; reason: string }
  | { kind: "ignore" };

const PRISMA_LIKE_NAME = /prisma/i;
const PRISMA_LIKE_ALIAS = new Set(["db", "client", "tx", "database", "dbs", "prismadb", "delegate"]);
const QUERY_ARGUMENT_KEYS = new Set([
  "where",
  "data",
  "select",
  "include",
  "orderBy",
  "cursor",
  "take",
  "skip",
  "distinct",
  "omit",
  "_count",
]);

function rootName(expr: ts.Expression): string | undefined {
  let current: ts.Expression = expr;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : undefined;
}

function hasQueryShape(node: ts.CallExpression): boolean {
  const argument = node.arguments[0];
  if (!argument || !ts.isObjectLiteralExpression(argument)) return false;
  return argument.properties.some((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      return false;
    }
    const key = nameOf(property.name);
    return key !== undefined && QUERY_ARGUMENT_KEYS.has(key);
  });
}

/**
 * An unresolved receiver is only assumed to be Prisma when there is evidence:
 * a Prisma-like binding name or a Prisma-shaped query argument. Otherwise an
 * ordinary object that happens to have a `count()` method would produce a
 * diagnostic for every unrelated test helper.
 */
function plausiblePrisma(
  receiver: ts.Expression,
  binding: Extract<Binding, { kind: "unknown" }>,
  node: ts.CallExpression
): boolean {
  if (binding.prismaRelated) return true;

  // `x.model.findMany()` is delegate-shaped even when `x` is unknowable;
  // `stats.count()` is just a method call on a value.
  if (ts.isPropertyAccessExpression(receiver) || ts.isElementAccessExpression(receiver)) {
    return true;
  }

  const name = rootName(receiver);
  if (name && (PRISMA_LIKE_NAME.test(name) || PRISMA_LIKE_ALIAS.has(name))) return true;
  return hasQueryShape(node);
}

/**
 * Strip string and template literals from one source line so a directive that
 * only appears inside a string cannot exempt a query.
 */
function stripLiterals(line: string): string {
  let output = "";
  let index = 0;
  while (index < line.length) {
    const char = line[index];
    if (char === '"' || char === "'" || char === "`") {
      index += 1;
      while (index < line.length) {
        if (line[index] === "\\") {
          index += 2;
          continue;
        }
        if (line[index] === char) {
          index += 1;
          break;
        }
        index += 1;
      }
      output += " ";
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}

export function scanSource(source: string, file: string, options: ScanOptions = {}): ScanResult {
  const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const model = buildScopeModel(sourceFile);
  const resolver = createResolver(model, file, options);

  // Recognise transaction clients before the analysis resolves any binding:
  // only a callback handed to a *proven* Prisma client's `$transaction` gets
  // the client identity, so `function f(tx) { tx.student.count() }` is still an
  // unknown parameter rather than an assumed transaction.
  const markTransactionClients = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.name) &&
      node.expression.name.text === "$transaction"
    ) {
      const scope = model.nodeScope.get(node) ?? model.root;
      const binding = resolver.resolveExpression(node.expression.expression, scope);
      if (binding.kind === "client") {
        const callback = node.arguments[0];
        if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
          const parameter = callback.parameters[0];
          if (parameter && ts.isIdentifier(parameter.name)) {
            model.transactionParams.add(parameter);
          }
        }
      }
    }
    ts.forEachChild(node, markTransactionClients);
  };
  markTransactionClients(sourceFile);

  // Cleanup evidence is derived from this file only, once transaction clients
  // are known (teardown may run inside `$transaction`).
  const policy = buildCleanupPolicy(sourceFile, model, resolver);

  const lines = source.split("\n");

  const violations: Finding[] = [];
  const exemptions: Finding[] = [];
  const unsupported: UnsupportedFinding[] = [];
  const seen = new Set<number>();

  const lineOf = (node: ts.Node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const textOf = (line: number) => (lines[line - 1] ?? "").trim();

  const hasDirective = (line: number) => {
    const text = lines[line - 1];
    return text !== undefined && DIRECTIVE.test(stripLiterals(text));
  };

  const record = (node: ts.Node, operation: Operation, reason: string) => {
    const start = node.getStart(sourceFile);
    if (seen.has(start)) return;
    seen.add(start);

    const line = lineOf(node);
    const finding: Finding = { file, line, operation, reason, text: textOf(line) };
    (hasDirective(line) || hasDirective(line - 1) ? exemptions : violations).push(finding);
  };

  const recordUnsupported = (node: ts.Node, reason: string, operation?: Operation) => {
    const start = node.getStart(sourceFile);
    if (seen.has(start)) return;
    seen.add(start);

    const line = lineOf(node);
    unsupported.push({ file, line, reason, text: textOf(line), ...(operation ? { operation } : {}) });
  };

  const classify = (receiver: ts.Expression, scope: Scope, node: ts.CallExpression): Receiver => {
    const binding = resolver.resolveExpression(receiver, scope);
    if (binding.kind === "delegate") return { kind: "model", model: binding.model };
    if (binding.kind === "unknown" && plausiblePrisma(receiver, binding, node)) {
      return { kind: "unsupported", reason: binding.reason };
    }
    return { kind: "ignore" };
  };

  const examineModelCall = (node: ts.CallExpression, operation: ModelOperation, receiver: ts.Expression) => {
    const scope = model.nodeScope.get(node) ?? model.root;
    const classified = classify(receiver, scope, node);
    if (classified.kind === "unsupported") {
      recordUnsupported(node, classified.reason);
      return;
    }
    if (classified.kind !== "model") return;

    const verdict = analyzeArguments(node.arguments[0], resolver, scope, operation, {
      model,
      modelName: classified.model,
      policy,
    });
    if (verdict.kind === "violation") record(node, operation, verdict.reason);
    else if (verdict.kind === "unsupported") recordUnsupported(node, verdict.reason, operation);
  };

  const examineRawCall = (
    node: ts.Node,
    operation: RawOperation,
    receiver: ts.Expression,
    argument: ts.Expression | undefined
  ) => {
    const scope = model.nodeScope.get(node) ?? model.root;
    const binding = resolver.resolveExpression(receiver, scope);

    if (binding.kind === "unknown") {
      if (plausiblePrisma(receiver, binding, node as ts.CallExpression)) {
        recordUnsupported(node, binding.reason);
      }
      return;
    }
    if (binding.kind !== "client" && binding.kind !== "namespace") return;

    if (operation.endsWith("Unsafe")) {
      record(node, operation, "raw unsafe SQL cannot be verified statically");
      return;
    }

    const sql = constantSql(argument, resolver, scope);
    if (sql === undefined) {
      recordUnsupported(node, "raw SQL is composed at runtime, so its scope cannot be verified");
      return;
    }

    const verdict = sqlScope(sql);
    if (!verdict.ok) record(node, operation, verdict.reason);
  };

  /**
   * A call through an extracted operation reference. The receiver was proven by
   * the resolver, so only the arguments are judged — the same rules a direct
   * call would use.
   */
  const examineDetachedCall = (
    node: ts.CallExpression,
    operation: Operation,
    options: { model?: string; arguments?: readonly ts.Expression[] } = {}
  ) => {
    const scope = model.nodeScope.get(node) ?? model.root;
    // `.call`/`.apply` supply the Prisma argument list themselves (the `thisArg`
    // is not one), so it is passed in rather than read off the call node.
    const argument = options.arguments ? options.arguments[0] : node.arguments[0];

    if (isRawOperation(operation)) {
      if (operation.endsWith("Unsafe")) {
        record(node, operation, "raw unsafe SQL cannot be verified statically");
        return;
      }

      const sql = constantSql(argument, resolver, scope);
      if (sql === undefined) {
        recordUnsupported(node, "raw SQL is composed at runtime, so its scope cannot be verified");
        return;
      }

      const verdict = sqlScope(sql);
      if (!verdict.ok) record(node, operation, verdict.reason);
      return;
    }

    // A detached operation keeps its delegate: `prisma.student.create` resolves
    // to an operation reference carrying that model, so aliasing and containers
    // do not lose it. A receiver in the call itself is the fallback shape.
    let modelName = options.model;
    if (!modelName && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = resolver.resolveExpression(node.expression.expression, scope);
      if (receiver.kind === "delegate") modelName = receiver.model;
    }

    const verdict = analyzeArguments(argument, resolver, scope, operation, {
      model,
      modelName,
      policy,
    });
    if (verdict.kind === "violation") record(node, operation, verdict.reason);
    else if (verdict.kind === "unsupported") recordUnsupported(node, verdict.reason, operation);
  };

  /**
   * The elements of a statically known argument array, following one binding at
   * a time for `.apply`. An array this analysis cannot enumerate — a spread, a
   * hole, a call result, a reassigned binding — makes the query arguments
   * unknowable, and `undefined` says exactly that.
   */
  const resolveArgumentArray = (
    expression: ts.Expression | undefined,
    scope: Scope,
    depth = 0
  ): readonly ts.Expression[] | undefined => {
    if (!expression || depth > 8) return undefined;

    const node = unwrapExpression(expression);
    if (ts.isArrayLiteralExpression(node)) {
      if (
        node.elements.some(
          (element) => ts.isSpreadElement(element) || ts.isOmittedExpression(element)
        )
      ) {
        return undefined;
      }
      return node.elements as readonly ts.Expression[];
    }

    if (ts.isIdentifier(node)) {
      const write = resolver.singleWrite(scope, node.text);
      if (!write) return undefined;
      return resolveArgumentArray(write.expr, write.scope, depth + 1);
    }

    return undefined;
  };

  /**
   * `fn.call(client, args)` / `fn.apply(client, [args])` where `fn` resolves to
   * a Prisma operation reference.
   *
   * `Function.prototype.call`/`apply` are recognised **only** on a receiver with
   * proven Prisma operation provenance, so `repository.findFirst.call(…)` and
   * `stats.count.apply(…)` stay ordinary method calls. The supplied `thisArg` is
   * never treated as evidence of anything: provenance comes from the reference,
   * which is why `fn.call(undefined)` is still a Prisma invocation.
   *
   * Returns whether the call was handled, so the caller does not analyse the
   * same invocation twice.
   */
  const examinePrototypeInvocation = (node: ts.CallExpression, scope: Scope): boolean => {
    const callee = prototypeCallee(node.expression);
    if (!callee) return false;

    const method = ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : resolver.keyText(callee.argumentExpression, scope);
    if (method !== "call" && method !== "apply") return false;

    const receiver = resolver.resolveExpression(callee.expression, scope);

    // A reference that may be an operation but was reassigned cannot be judged;
    // reporting it keeps `.call` from becoming a silent escape hatch.
    if (receiver.kind === "unknown" && receiver.operationAlias) {
      recordUnsupported(node, receiver.reason);
      return true;
    }
    if (receiver.kind !== "operationRef") return false;

    if (node.arguments.some((argument) => ts.isSpreadElement(argument))) {
      recordUnsupported(
        node,
        `the \`${method}\` argument list contains a spread, so the query arguments cannot be resolved`,
        receiver.operation
      );
      return true;
    }

    if (method === "call") {
      // `thisArg` is argument 0; everything after it is the Prisma argument list.
      examineDetachedCall(node, receiver.operation, {
        model: receiver.model,
        arguments: node.arguments.slice(1),
      });
      return true;
    }

    const arrayArgument = node.arguments[1];
    if (!arrayArgument) {
      recordUnsupported(
        node,
        "`.apply` is called without an argument array, so the query arguments cannot be resolved",
        receiver.operation
      );
      return true;
    }

    const elements = resolveArgumentArray(arrayArgument, scope);
    if (!elements) {
      recordUnsupported(
        node,
        "the `.apply` argument array is not statically known, so the query arguments cannot be resolved",
        receiver.operation
      );
      return true;
    }

    examineDetachedCall(node, receiver.operation, {
      model: receiver.model,
      arguments: elements,
    });
    return true;
  };

  /** A tagged template through a detached raw operation, e.g. `ops[0]` …`. */
  const examineDetachedTag = (node: ts.TaggedTemplateExpression, operation: Operation) => {
    if (operation.endsWith("Unsafe")) {
      record(node, operation, "raw unsafe SQL cannot be verified statically");
      return;
    }
    const template = node.template;
    const sql = ts.isNoSubstitutionTemplateLiteral(template)
      ? template.text
      : template.head.text + template.templateSpans.map((span) => span.literal.text).join("");
    const verdict = sqlScope(sql);
    if (!verdict.ok) record(node, operation, verdict.reason);
  };

  /**
   * The member access a call ultimately invokes: `(fn.call)(…)` and
   * `(0, fn.call)(…)` both denote `fn.call`, and `fn["call"]` names the same
   * method. `undefined` means the callee is not a member access at all.
   */
  const prototypeCallee = (
    expression: ts.Expression
  ): ts.PropertyAccessExpression | ts.ElementAccessExpression | undefined => {
    let callee: ts.Expression = expression;
    while (true) {
      if (
        ts.isParenthesizedExpression(callee) ||
        ts.isAsExpression(callee) ||
        ts.isSatisfiesExpression(callee) ||
        ts.isNonNullExpression(callee) ||
        ts.isTypeAssertionExpression(callee)
      ) {
        callee = callee.expression;
        continue;
      }
      // A comma expression's value is its last operand.
      if (
        ts.isBinaryExpression(callee) &&
        callee.operatorToken.kind === ts.SyntaxKind.CommaToken
      ) {
        callee = callee.right;
        continue;
      }
      break;
    }
    if (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) {
      return callee;
    }
    return undefined;
  };

  /**
   * Whether a node is the function a surrounding call invokes, ignoring
   * parentheses, casts and comma selection (`(0, fn.call)(…)`).
   */
  const isInvokedCallee = (node: ts.Node): boolean => {
    let callee: ts.Node = node;
    while (true) {
      const parent = callee.parent;
      if (
        ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isSatisfiesExpression(parent) ||
        ts.isNonNullExpression(parent) ||
        ts.isTypeAssertionExpression(parent)
      ) {
        callee = parent;
        continue;
      }
      if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.CommaToken) {
        // The left operand of a comma expression is discarded, not called.
        if (parent.left === callee) return false;
        callee = parent;
        continue;
      }
      return ts.isCallExpression(parent) && parent.expression === callee;
    }
  };

  const visit = (node: ts.Node) => {
    /**
     * An operation named through a property or bracket access whose receiver is
     * a proven client/delegate, used as a value instead of being called here.
     *
     * `const fn = …` and `fn = …` are followed by the resolver, so the alias
     * call is diagnosed where it happens; every other escape — an argument, a
     * return, a property value, a conditional branch — cannot be followed and
     * is reported. A callee is skipped: the direct-call paths already analyse
     * it, and reporting it here would double every ordinary query.
     */
    const noteDetachedReference = (
      reference: ts.PropertyAccessExpression | ts.ElementAccessExpression
    ) => {
      // `(prisma.student as any)[method]` and `prisma.student?.findFirst` are
      // wrapped in a parenthesised/as/optional expression: the decision belongs
      // to the outermost wrapper, otherwise a cast would look like an escape.
      let outer: ts.Node = reference;
      while (
        ts.isParenthesizedExpression(outer.parent) ||
        ts.isAsExpression(outer.parent) ||
        ts.isSatisfiesExpression(outer.parent) ||
        ts.isNonNullExpression(outer.parent) ||
        ts.isTypeAssertionExpression(outer.parent)
      ) {
        outer = outer.parent;
      }
      const parent = outer.parent;

      if (ts.isCallExpression(parent) && parent.expression === outer) return;
      if (ts.isTaggedTemplateExpression(parent) && parent.tag === outer) return;
      if (
        ts.isVariableDeclaration(parent) &&
        parent.initializer === outer &&
        ts.isIdentifier(parent.name)
      ) {
        return;
      }
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === outer &&
        ts.isIdentifier(parent.left)
      ) {
        return;
      }
      // A reference on the left of an assignment is a write target (stubbing
      // `prisma.student.findMany = …`), not a query being executed.
      if (ts.isBinaryExpression(parent) && parent.left === outer) return;
      // `delete ops.run` removes an entry instead of reading it, so it changes
      // the container like an assignment does; the access that follows carries
      // the diagnostic, and the delete itself must not report a second one.
      if (ts.isDeleteExpression(parent)) return;

      // `fn.call(…)` / `fn.apply(…)` on a proven reference is an invocation,
      // analysed at the call site, not an escape of the reference.
      if (
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === outer &&
        ts.isIdentifier(parent.name) &&
        (parent.name.text === "call" || parent.name.text === "apply")
      ) {
        return;
      }

      // `const ops = { run: prisma.student.count }`: the container is followed
      // through the variable, so the storage site is not an escape. An inline
      // literal (`run({ run: … })`) still reports at the reference.
      let contained: ts.Node = outer;
      let followed = false;
      while (true) {
        const containerParent = contained.parent;
        if (
          ts.isPropertyAssignment(containerParent) ||
          ts.isShorthandPropertyAssignment(containerParent) ||
          ts.isSpreadAssignment(containerParent) ||
          ts.isObjectLiteralExpression(containerParent) ||
          ts.isArrayLiteralExpression(containerParent) ||
          ts.isConditionalExpression(containerParent)
        ) {
          contained = containerParent;
          continue;
        }
        followed =
          ts.isVariableDeclaration(containerParent) &&
          containerParent.initializer === contained &&
          ts.isIdentifier(containerParent.name);
        break;
      }
      if (followed) return;

      const scope = model.nodeScope.get(reference) ?? model.root;
      const binding = resolver.resolveExpression(reference, scope);

      // A dynamic key keeps a *possible* operation as `unknown` with
      // `operationAlias`; when it escapes inline (an argument, a return, a
      // container) the resolver never sees an identifier to judge, so the
      // reference itself is reported.
      if (binding.kind === "unknown" && binding.operationAlias) {
        recordUnsupported(reference, binding.reason);
        return;
      }
      if (binding.kind !== "operationRef") return;

      recordUnsupported(
        reference,
        `Prisma operation \`${binding.operation}\` is used as a value, so its call site cannot be analysed`
      );
    };

    /**
     * A documented mutating array method called on something that may hold a
     * Prisma operation. The container is marked mutated; the diagnostic belongs
     * to the later read that needs the entries.
     */
    const isContainerMutationCall = (callee: ts.Expression, scope: Scope): boolean => {
      const name = mutatingMethodName(callee);
      if (!name || !MUTATING_ARRAY_METHODS.has(name)) return false;
      const member = unwrapMember(callee);
      if (!member) return false;
      const receiver = resolver.resolveExpression(member.expression, scope);
      if (receiver.kind === "container") return !receiver.entries.has(name);
      return receiver.kind === "unknown" && (receiver.operationAlias ?? false);
    };

    /** An alias whose own value escapes, so the eventual call cannot be judged. */
    const escapedAlias = (expr: ts.Expression): string | undefined => {
      const scope = model.nodeScope.get(expr) ?? model.root;
      const binding = resolver.resolveExpression(expr, scope);
      if (binding.kind === "operationRef") {
        return `Prisma operation \`${binding.operation}\` escapes through an alias, so its call site cannot be analysed`;
      }
      if (binding.kind === "unknown" && binding.operationAlias) return binding.reason;
      if (binding.kind === "container" && binding.holdsOperation) {
        return `container \`${binding.name ?? "container"}\` holding a Prisma operation escapes, so its call sites cannot be analysed`;
      }
      return undefined;
    };

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const ancestorScope = model.nodeScope.get(node) ?? model.root;
      const method = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : resolver.keyText(node.argumentExpression, ancestorScope);

      // `.call`/`.apply` read off a proven operation reference — in property or
      // bracket form — is only safe when the surrounding call is the invocation
      // itself. Storing the method (`const c = fn.call`) loses the operation, so
      // it is reported rather than left as a silent way to call it later.
      if ((method === "call" || method === "apply") && !isInvokedCallee(node)) {
        const owner = resolver.resolveExpression(node.expression, ancestorScope);
        if (owner.kind === "operationRef") {
          recordUnsupported(
            node,
            `Prisma operation \`${owner.operation}\` is read through \`${method}\`, so the later invocation cannot be analysed`,
            owner.operation
          );
        } else if (owner.kind === "unknown" && owner.operationAlias) {
          recordUnsupported(node, owner.reason);
        }
      }

      noteDetachedReference(node);
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const scope = model.nodeScope.get(node) ?? model.root;

      // Resolving the callee as a whole covers identifiers, detached aliases and
      // container entries (`ops.run`, `ops[0]`) with one rule: the receiver is
      // proven, so only the arguments need judging.
      const resolved = resolver.resolveExpression(callee, scope);
      // `fn.call(…)` resolves to nothing useful as a whole, so it is recognised
      // from its receiver before the ordinary operation dispatch.
      const invoked = examinePrototypeInvocation(node, scope);

      if (invoked) {
        // Judged above with the original operation; nothing left to dispatch.
      } else if (resolved.kind === "operationRef") {
        examineDetachedCall(node, resolved.operation, { model: resolved.model });
      } else if (resolved.kind === "unknown" && resolved.operationAlias) {
        // `ops.push(f)` is the mutation itself, not a query through the
        // container: the entry read that follows carries the diagnostic, so a
        // single mutation must not be reported twice.
        if (!isContainerMutationCall(callee, scope)) recordUnsupported(node, resolved.reason);
      } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
        const operation = callee.name.text;
        if (isModelOperation(operation)) examineModelCall(node, operation, callee.expression);
        else if (isRawOperation(operation)) {
          examineRawCall(node, operation, callee.expression, node.arguments[0]);
        }
      } else if (ts.isElementAccessExpression(callee)) {
        const operation = resolver.keyText(callee.argumentExpression, scope);
        if (operation && isModelOperation(operation)) {
          examineModelCall(node, operation, callee.expression);
        } else if (operation && isRawOperation(operation)) {
          examineRawCall(node, operation, callee.expression, node.arguments[0]);
        } else if (!operation) {
          // `prisma.student[method]()` with an unresolved receiver: report the
          // dynamic name instead of ignoring the call.
          const binding = resolver.resolveExpression(callee.expression, scope);
          if (
            (binding.kind === "client" || binding.kind === "delegate") &&
            plausiblePrisma(
              callee.expression,
              { kind: "unknown", reason: "dynamic method name" },
              node
            )
          ) {
            recordUnsupported(node, "dynamic method name cannot be resolved");
          }
        }
      }

      // An operation alias, or a container holding one, handed to another
      // function can be called anywhere. A handled `.call`/`.apply` is not an
      // escape: its arguments were already judged as query arguments.
      for (const argument of invoked ? [] : node.arguments) {
        if (ts.isIdentifier(argument) || ts.isConditionalExpression(argument)) {
          const escaped = escapedAlias(argument);
          if (escaped) recordUnsupported(argument, escaped);
          continue;
        }
        if (ts.isObjectLiteralExpression(argument) || ts.isArrayLiteralExpression(argument)) {
          const binding = resolver.resolveExpression(argument, scope);
          // A literal that writes the reference directly is already reported at
          // the reference; only alias-built literals need the escape note.
          if (binding.kind === "container" && binding.holdsOperation && !binding.directReference) {
            recordUnsupported(
              argument,
              "container holding a Prisma operation escapes, so its call sites cannot be analysed"
            );
          }
        }
      }
    }

    if (ts.isReturnStatement(node) && node.expression) {
      if (ts.isIdentifier(node.expression) || ts.isConditionalExpression(node.expression)) {
        const escaped = escapedAlias(node.expression);
        if (escaped) recordUnsupported(node.expression, escaped);
      } else if (
        ts.isObjectLiteralExpression(node.expression) ||
        ts.isArrayLiteralExpression(node.expression)
      ) {
        const binding = resolver.resolveExpression(
          node.expression,
          model.nodeScope.get(node) ?? model.root
        );
        if (binding.kind === "container" && binding.holdsOperation && !binding.directReference) {
          recordUnsupported(
            node.expression,
            "container holding a Prisma operation escapes, so its call sites cannot be analysed"
          );
        }
      }
    }

    if (ts.isTaggedTemplateExpression(node)) {
      const tag = node.tag;
      const scope = model.nodeScope.get(node) ?? model.root;
      // `prisma.$executeRaw`…``, `raw`…`` and `ops[0]`…`` all resolve to the
      // same detached raw operation, so one rule covers every tag shape.
      const resolved = resolver.resolveExpression(tag, scope);

      if (resolved.kind === "operationRef" && isRawOperation(resolved.operation)) {
        examineDetachedTag(node, resolved.operation);
      } else if (resolved.kind === "unknown" && resolved.operationAlias) {
        recordUnsupported(node, resolved.reason);
      } else if (
        ts.isPropertyAccessExpression(tag) &&
        ts.isIdentifier(tag.name) &&
        isRawOperation(tag.name.text)
      ) {
        // An unresolved receiver still names the operation explicitly.
        const binding = resolver.resolveExpression(tag.expression, scope);
        if (
          binding.kind === "unknown" &&
          plausiblePrisma(tag.expression, binding, node as unknown as ts.CallExpression)
        ) {
          recordUnsupported(node, binding.reason);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return { violations, exemptions, unsupported };
}

/* ------------------------------------------------------------------ */
/* Repository scan                                                     */
/* ------------------------------------------------------------------ */

const GUARD_PATHS = new Set([
  "tests/support/isolation-guard.ts",
  "tests/test-isolation-guard.test.ts",
  "tests/test-isolation-guard.repo.test.ts",
]);

const FIXTURE_PREFIX = "tests/fixtures/isolation-guard/";

export const TESTS_ROOT = path.join(process.cwd(), "tests");
export const FIXTURES_ROOT = path.join(TESTS_ROOT, "fixtures", "isolation-guard");

function relativePath(full: string): string {
  return path.relative(process.cwd(), full).split(path.sep).join("/");
}

function listTypeScript(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScript(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(full);
  }
  return files.sort();
}

/**
 * The real suites, excluding the guard's own files (by exact repository path,
 * not basename) and the adversarial fixtures, which contain deliberately
 * unsafe code and are asserted separately.
 */
export function testSources(root: string = TESTS_ROOT): string[] {
  return listTypeScript(root).filter((full) => {
    const relative = relativePath(full);
    if (GUARD_PATHS.has(relative)) return false;
    if (relative.startsWith(FIXTURE_PREFIX)) return false;
    return true;
  });
}

/** The fixtures the repository test asserts against, in stable order. */
export function fixtureSources(root: string = FIXTURES_ROOT): string[] {
  return listTypeScript(root);
}

function resolveModuleFile(module: string): string | undefined {
  const base = path.join(process.cwd(), module);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Repository-only lookups for imported helpers: a function whose exported
 * return type proves a value can justify a call in a filter. `scanSource`
 * itself stays file-local and never reads other files.
 */
function createExternalReturnResolver(): NonNullable<
  ScanOptions["externalReturnIsDefined"]
> {
  const cache = new Map<string, ts.SourceFile | null>();

  const read = (full: string): ts.SourceFile | undefined => {
    if (cache.has(full)) return cache.get(full) ?? undefined;
    let sourceFile: ts.SourceFile | null = null;
    try {
      sourceFile = ts.createSourceFile(
        full,
        readFileSync(full, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        full.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
    } catch {
      sourceFile = null;
    }
    cache.set(full, sourceFile);
    return sourceFile ?? undefined;
  };

  return (specifier, imported, fromFile) => {
    const module = modulePath(specifier, fromFile);
    if (!module) return false;
    const full = resolveModuleFile(module);
    if (!full) return false;
    const sourceFile = read(full);
    if (!sourceFile) return false;

    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === imported) {
        return typeIsDefined(statement.type);
      }
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== imported) continue;
        const initializer = declaration.initializer;
        if (!initializer) continue;
        if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
          return typeIsDefined(initializer.type);
        }
      }
    }
    return false;
  };
}

export function scanRepository(root: string = TESTS_ROOT): ScanResult & { files: string[] } {
  const files = testSources(root);
  const violations: Finding[] = [];
  const exemptions: Finding[] = [];
  const unsupported: UnsupportedFinding[] = [];
  const externalReturnIsDefined = createExternalReturnResolver();

  for (const full of files) {
    const relative = relativePath(full);
    const result = scanSource(readFileSync(full, "utf8"), relative, {
      externalReturnIsDefined,
    });
    violations.push(...result.violations);
    exemptions.push(...result.exemptions);
    unsupported.push(...result.unsupported);
  }

  return { violations, exemptions, unsupported, files };
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

/**
 * The cleanup policy a single source file proves, exposed for tests and
 * reporting: model → column → the exact values and prefixes the file's own
 * teardown deletes by, plus whether a same-file `create` result is accepted.
 */
export function cleanupPolicyFor(
  source: string
): Record<string, Record<string, { values: string[]; prefixes: string[]; fixture: boolean }>> {
  const sourceFile = ts.createSourceFile(
    "cleanup-policy.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const model = buildScopeModel(sourceFile);
  const resolver = createResolver(model, "cleanup-policy.ts", {});
  const policy = buildCleanupPolicy(sourceFile, model, resolver);

  const view: Record<string, Record<string, { values: string[]; prefixes: string[]; fixture: boolean }>> = {};
  for (const [modelName, fields] of policy) {
    view[modelName] = {};
    for (const [field, evidence] of fields) {
      view[modelName][field] = {
        values: [...evidence.values].sort(),
        prefixes: [...evidence.prefixes].sort(),
        fixture: evidence.fixture,
      };
    }
  }
  return view;
}

export function describeFindings(findings: Finding[]): string {
  const operations = [...new Set(findings.map((finding) => finding.operation))].sort();

  return [
    "CONFIRMED unscoped Prisma queries in integration suites:",
    ...findings.map(
      (finding) =>
        `  ${finding.file}:${finding.line}  ${finding.operation} — ${finding.reason}\n      ${finding.text}`
    ),
    "",
    "Integration suites share one PostgreSQL database and run as concurrent",
    "processes, so a table-wide query races (or deletes) the fixtures other files",
    "own. Filter every read, count, update and delete by the rows this suite",
    "created.",
    "",
    "Guidance:",
    ...operations.map((operation) => `  ${GUIDANCE[operation]}`),
  ].join("\n");
}

export function describeUnsupported(findings: UnsupportedFinding[]): string {
  return [
    "UNRESOLVED Prisma access — the guard could not prove these are scoped:",
    ...findings.map(
      (finding) =>
        `  ${finding.file}:${finding.line}${finding.operation ? `  ${finding.operation}` : ""} — ${
          finding.reason
        }\n      ${finding.text}`
    ),
    "",
    "This is not a pass. Resolve the binding (a literal `where`, a constant SQL",
    "string, a single-valued alias) or add an `isolation-guard: allow` directive",
    "with a documented reason.",
  ].join("\n");
}
