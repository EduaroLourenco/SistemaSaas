import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const c = l.trim(), i = c.indexOf("=");
  if (i > 0 && !c.startsWith("#") && !process.env[c.slice(0, i)]) process.env[c.slice(0, i)] = c.slice(i + 1).trim();
}
const U = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: K, authorization: `Bearer ${K}` };
const IMP = "123c2f3c-c4ed-48ba-b4c4-753d78265946";
const get = async (p) => (await fetch(`${U}/rest/v1/${p}`, { headers: h })).json();
const procs = await get(`processamentos_promocao?operacao_id=eq.${IMP}&select=*&limit=3`);
console.log(JSON.stringify(procs, null, 1).slice(0, 2500));
