import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { registrarInteresse, listarInteresses } from "@/lib/interesses";
import { clienteServidor } from "@/lib/supabase/servidor";
import { idsValidos } from "@/lib/comercial/modulos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const tentativas = new Map<string, { inicio: number; total: number }>();

function limite(req: Request) {
  const agora = Date.now();
  for (const [k, v] of tentativas) if (agora-v.inicio > 15*60_000) tentativas.delete(k);
  const origem = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const chave = createHash("sha256").update(origem).digest("hex");
  const atual = tentativas.get(chave) ?? { inicio: agora, total: 0 };
  atual.total += 1;
  if (tentativas.size < 2000 || tentativas.has(chave)) tentativas.set(chave, atual);
  return atual.total <= 8;
}

export async function POST(req: Request) {
  const origem = req.headers.get("origin");
  if (origem && origem !== new URL(req.url).origin) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  if (!limite(req)) return NextResponse.json({ erro: "Muitas tentativas. Aguarde alguns minutos para tentar novamente." }, { status: 429 });
  const texto = await req.text();
  if (texto.length > 4000) return NextResponse.json({ erro: "Dados muito extensos." }, { status: 413 });
  let corpo: Record<string, unknown>;
  try { corpo = JSON.parse(texto); if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) throw new Error(); }
  catch { return NextResponse.json({ erro: "Confira o nome e o telefone." }, { status: 400 }); }
  if (corpo.website) return NextResponse.json({ ok: true });
  const nome = typeof corpo.nome === "string" ? corpo.nome.trim().replace(/\s+/g," ") : "";
  const telefone = typeof corpo.telefone === "string" ? corpo.telefone.replace(/\D/g,"") : "";
  if (nome.length < 2 || nome.length > 100 || telefone.length < 10 || telefone.length > 15 || /^(\d)\1+$/.test(telefone)) return NextResponse.json({ erro: "Informe seu nome e um telefone com DDD." }, { status: 400 });
  const empresa = typeof corpo.empresa === "string" ? corpo.empresa.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  const modulos = idsValidos(corpo.modulos);
  try { await registrarInteresse(nome, telefone, { ...(empresa ? { empresa } : {}), ...(modulos.length ? { modulos } : {}) }); return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } }); }
  catch { return NextResponse.json({ erro: "Não foi possível registrar agora. Seus dados continuam no formulário; tente novamente em instantes." }, { status: 503 }); }
}

export async function GET(req: Request) {
  const sb = await clienteServidor({ todasOperacoes: true });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const { data: admin } = await sb.rpc("eh_admin_plataforma");
  if (admin !== true) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });
  try {
    const contatos = await listarInteresses();
    if (new URL(req.url).searchParams.get("formato") === "csv") {
      const celula = (v: string) => `"${(/^[=+\-@]/.test(v) ? "'"+v : v).replaceAll('"','""')}"`;
      const csv = "\uFEFFNome;Telefone;Recebido em\r\n"+contatos.map(c => [c.nome,c.telefone,c.criadoEm].map(celula).join(";")).join("\r\n");
      return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="interessados-gerizo.csv"', "cache-control": "private, no-store" } });
    }
    return NextResponse.json({ contatos }, { headers: { "cache-control": "private, no-store" } });
  } catch { return NextResponse.json({ erro: "Não foi possível consultar os interessados." }, { status: 503 }); }
}
