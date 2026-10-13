type Filtros = { canais: string; janela: string; de: string; ate: string };

/** Trocar uma seleção preserva as demais; só outro canal reinicia o relatório. */
export function atualizarFiltrosTrafego(atual: Filtros, mudar: Partial<Filtros>) {
  const proximo = { ...atual, ...mudar };
  if (mudar.canais !== undefined && mudar.canais !== atual.canais && mudar.janela === undefined) {
    proximo.janela = "";
  }
  return proximo;
}

export function urlTrafego(atual: Filtros, mudar: Partial<Filtros>) {
  const proximo = atualizarFiltrosTrafego(atual, mudar);
  const q = new URLSearchParams();
  for (const chave of ["canais", "janela", "de", "ate"] as const) {
    if (proximo[chave]) q.set(chave, proximo[chave]);
  }
  return `/anuncios/trafego-pago?${q}`;
}

function dataValida(iso?: string): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export function periodoTrafego(pedido: { de?: string; ate?: string } | undefined, ultimoDia: string) {
  const fim = dataValida(pedido?.ate) ? pedido.ate : ultimoDia;
  const inicio = new Date(`${fim}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 29);
  const de = dataValida(pedido?.de) ? pedido.de : inicio.toISOString().slice(0, 10);
  return de <= fim ? { de, ate: fim } : { de: fim, ate: de };
}

/** O relatório é indivisível: comparar sua janela exata, nunca rateá-lo por mês. */
export function conferirInvestimento(
  diariasDoRecorte: { data: string; investimento_ads: string | number | null; conta_canal_id?: string | null }[],
  inicio: string,
  fim: string,
  relatorio: number,
  contasEsperadas = 1
) {
  const dias = diariasDoRecorte.filter((d) => d.data.slice(0, 10) >= inicio && d.data.slice(0, 10) <= fim && d.investimento_ads != null);
  const diasRegistrados = new Set(dias.map((d) => d.data.slice(0, 10))).size;
  const diasEsperados = Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86_400_000) + 1;
  return {
    inicio, fim, relatorio,
    diario: dias.length ? Number(dias.reduce((s, d) => s + (Number(d.investimento_ads) || 0), 0).toFixed(2)) : null,
    diasRegistrados, diasEsperados,
    registrosRegistrados: new Set(dias.map((d) => `${d.conta_canal_id ?? ""}|${d.data.slice(0, 10)}`)).size,
    registrosEsperados: diasEsperados * contasEsperadas,
  };
}
