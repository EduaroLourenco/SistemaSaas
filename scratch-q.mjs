import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const c = l.trim(), i = c.indexOf("=");
  if (i > 0 && !c.startsWith("#") && !process.env[c.slice(0, i)]) process.env[c.slice(0, i)] = c.slice(i + 1).trim();
}
const U = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: K, authorization: `Bearer ${K}` };
const get = async (p) => (await fetch(`${U}/rest/v1/${p}`, { headers: { ...h, Prefer: "count=exact" } }));

const uma = await (await get("anuncios?select=*&limit=1")).json();
console.log("colunas de anuncios:\n  " + Object.keys(uma[0]).join(", "));

const conta = async (filtro) => {
  const r = await get(`anuncios?select=id&limit=1&${filtro}`);
  return r.headers.get("content-range")?.split("/")[1];
};
console.log("\ntotal de anúncios:            " + (await conta("")));
console.log("com status preenchido:        " + (await conta("status=not.is.null")));
console.log("com estoque preenchido:       " + (await conta("estoque=not.is.null")));
const vals = await (await get("anuncios?select=status&status=not.is.null&limit=1000")).json();
const hist = new Map();
for (const v of vals) hist.set(v.status, (hist.get(v.status) ?? 0) + 1);
console.log("valores de status:            " + [...hist].map(([k, n]) => `${k}×${n}`).join(", "));
