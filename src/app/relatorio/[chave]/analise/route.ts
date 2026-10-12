import { clientePrivilegiado } from '@/lib/supabase/privilegiado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Snapshot separado do painel. A mesma chave existente resolve uma única operação. */
export async function GET(_request: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params;
  if (!/^[a-f0-9]{64}$/i.test(chave)) return new Response(null, { status: 404 });
  const sb = clientePrivilegiado();
  const { data, error } = await sb.rpc('operacao_por_chave_relatorio', { p_chave: chave });
  if (error) return new Response('Não foi possível consultar o relatório.', { status: 503 });
  const op = Array.isArray(data) ? data[0]?.operacao_id : data?.operacao_id;
  if (!op || !/^[a-f0-9-]{36}$/i.test(op)) return new Response(null, { status: 404 });
  const { data: arquivo, error: falha } = await sb.storage.from('relatorios-privados').download(`${op}/analise.html`);
  if (falha || !arquivo) return new Response('Relatório ainda não disponível para esta operação.', { status: 404 });
  return new Response(await arquivo.text(), { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  } });
}
