/**
 * Read-only verification that a `pg_dump -Fc` restore is faithful.
 *
 * Usage: node scripts/verify-restore.mjs <restoredDatabase> [sourceDatabase]
 *
 * Compares table / column / index / enum / constraint counts, the full column
 * list, and the exact row count of every public table. It never prints the
 * connection string, only the database names it was asked to compare.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const restored = process.argv[2];
if (!restored) {
  console.error("usage: node scripts/verify-restore.mjs <restoredDatabase> [sourceDatabase]");
  process.exit(2);
}

const env = fs.readFileSync(".env", "utf8");
const url = env.match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)/m);
if (!url) {
  console.error("DATABASE_URL not found in .env");
  process.exit(2);
}
const password = new URL(url[1]).password;
const source = process.argv[3] ?? new URL(url[1]).pathname.replace(/^\//, "");

function q(db, sql) {
  return execFileSync(
    "psql",
    ["-w", "-h", "localhost", "-p", "5432", "-U", "postgres", "-d", db, "-At", "-c", sql],
    { env: { ...process.env, PGPASSWORD: password }, encoding: "utf8" }
  )
    .replace(/[\r\n]+$/, "")
    .trim();
}

const counts = (db) => ({
  tables: q(db, "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"),
  columns: q(db, "select count(*) from information_schema.columns where table_schema='public'"),
  indexes: q(db, "select count(*) from pg_indexes where schemaname='public'"),
  enums: q(db, "select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'"),
  constraints: q(db, "select count(*) from information_schema.table_constraints where constraint_schema='public'"),
});

const columnList = (db) =>
  q(db, "select table_name||'.'||column_name||':'||data_type from information_schema.columns where table_schema='public' order by table_name, column_name");

const indexList = (db) =>
  q(db, "select indexname||'|'||indexdef from pg_indexes where schemaname='public' order by indexname");

const tableNames = (db) =>
  q(db, "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

const a = counts(source);
const b = counts(restored);
console.log(`source=${source} ${JSON.stringify(a)}`);
console.log(`restore=${restored} ${JSON.stringify(b)}`);
const countKeys = ["tables", "columns", "indexes", "enums", "constraints"];
console.log(`counts_match=${countKeys.every((k) => a[k] === b[k])}`);
console.log(`columns_match=${columnList(source) === columnList(restored)}`);
console.log(`indexes_match=${indexList(source) === indexList(restored)}`);

let mismatches = 0;
for (const table of tableNames(source)) {
  const from = q(source, `select count(*) from "${table}"`);
  const to = q(restored, `select count(*) from "${table}"`);
  if (from !== to) {
    mismatches += 1;
    console.log(`ROWDIFF ${table} source=${from} restore=${to}`);
  }
}
console.log(`exact_row_mismatches=${mismatches}`);
const totalExpr = tableNames(source)
  .map((t) => `(select count(*) from "${t}")`)
  .join(" + ");
console.log(`total_rows=${q(source, `select ${totalExpr}`)}`);
console.log(`total_rows_restore=${q(restored, `select ${totalExpr}`)}`);
process.exit(mismatches === 0 ? 0 : 1);
