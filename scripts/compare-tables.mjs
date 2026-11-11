/**
 * Read-only per-table content comparison between two databases.
 *
 * Usage: node scripts/compare-tables.mjs <dbA> <dbB>
 * Prints one line per differing table, then the totals. No connection
 * string or row content is printed — only table names and hashes.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const [dbA, dbB] = process.argv.slice(2);
if (!dbA || !dbB) {
  console.error("usage: node scripts/compare-tables.mjs <dbA> <dbB>");
  process.exit(2);
}

const url = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)/m);
const password = new URL(url[1]).password;

function q(db, sql) {
  return execFileSync(
    "psql",
    ["-w", "-h", "localhost", "-p", "5432", "-U", "postgres", "-d", db, "-At", "-c", sql],
    { env: { ...process.env, PGPASSWORD: password }, encoding: "utf8" }
  )
    .replace(/[\r\n]+$/, "")
    .trim();
}

const tables = q(
  dbA,
  "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name <> '_prisma_migrations' order by 1"
)
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

let differing = 0;
for (const table of tables) {
  const sql = `select count(*)||':'||md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from "${table}" t`;
  const a = q(dbA, sql);
  const b = q(dbB, sql);
  if (a !== b) {
    differing += 1;
    console.log(`DIFF ${table} ${a} vs ${b}`);
  }
}
console.log(`tables_compared=${tables.length} differing=${differing}`);
process.exit(differing === 0 ? 0 : 1);
