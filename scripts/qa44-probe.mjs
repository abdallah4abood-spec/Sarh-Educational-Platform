/** Temporary probe #2: redirect markers and data leakage in the demoted response. */
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const PASSWORD = "Parent123!";
const prisma = new PrismaClient();
const cookies = new Map();

function store(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");

async function main() {
  await prisma.user.deleteMany({ where: { email: "qa44-probe@test.local" } });
  await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json" },
    body: JSON.stringify({
      fullName: "probe",
      email: "qa44-probe@test.local",
      password: PASSWORD,
      acceptedTerms: true,
    }),
  });
  const user = await prisma.user.update({
    where: { email: "qa44-probe@test.local" },
    data: { emailVerified: new Date(), role: "SUPER_ADMIN", roles: ["SUPER_ADMIN"] },
    select: { id: true },
  });
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
  store(csrf);
  const login = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin: BASE,
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body: new URLSearchParams({
      csrfToken: (await csrf.json()).csrfToken,
      identifier: "qa44-probe@test.local",
      password: PASSWORD,
      json: "true",
    }),
  });
  store(login);

  await prisma.user.update({ where: { id: user.id }, data: { role: "PARENT", roles: [] } });

  const after = await fetch(`${BASE}/admin/institutions/seed-inst-1/staff`, {
    headers: { cookie: cookieHeader() }, redirect: "manual",
  });
  const body = await after.text();
  const markers = {
    metaRefresh: /http-equiv="refresh"/i.test(body),
    nextRedirectMeta: /__next-page-redirect/.test(body),
    nextRedirectVar: /NEXT_REDIRECT/.test(body),
    locationReplace: /location\.(replace|href)/.test(body),
    refreshUrlRoot: /content="0;\s*url=\/"/i.test(body),
    signInText: body.includes("تسجيل الدخول"),
    ownerName: body.includes("مركز النور للتحضير والتوجيهي"),
    invitationEmails: /qa44-[a-z-]+@test\.local/.test(body),
    staffTableRows: (body.match(/<tr/g) ?? []).length,
  };
  console.log("status", after.status, "len", body.length);
  console.log(JSON.stringify(markers, null, 2));
  const idx = body.search(/http-equiv="refresh"|__next-page-redirect|NEXT_REDIRECT/);
  if (idx >= 0) console.log("marker context:", body.slice(Math.max(0, idx - 160), idx + 200).replace(/\s+/g, " "));

  await prisma.staffMember.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
