import type { ComissaoCanal } from "@/lib/dados/preco-alvo";
import { corpoDemo, demoJson } from "./http";
import { getDemoState, updateDemoState } from "./store";
import { DEMO_HOJE, DEMO_SINCRONIZADO, canaisDemo, contasDemo, mlbDemo, moedaDemo, movimentosDemo, produtosDemo } from "./fixtures-base";
import { catalogoAnunciosExtraDemo, comissoesAnunciosExtraDemo, janelaAnunciosExtraDemo, performanceAnunciosExtraDemo, type EstadoAnunciosExtraDemo } from "./fixtures-anuncios-extra";

const canal = canaisDemo[0];
const registros = (valor: unknown): Record<string, unknown>[] => Array.isArray(valor) ? valor.filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)) : [];
const metodos = (permitidos: string[]) => { const resposta = demoJson({ erro: "Ação indisponível neste endereço do exemplo." }, 405); resposta.headers.set("allow", permitidos.join(", ")); return resposta; };
const csv = (valor: unknown) => {
  const texto = String(valor ?? "");
  return `"${(/^[=+@\-\t\r]/.test(texto) ? "'" + texto : texto).replaceAll('"', '""')}"`;
};
const snapshot = () => catalogoAnunciosExtraDemo(getDemoState());
const anuncioApi = (item: ReturnType<typeof snapshot>["itens"][number]) => ({
  mlb: item.mlb, titulo: item.titulo, sku: item.sku, preco: item.precoAtual,
  precoOriginal: null, status: item.status === "ativo" ? "active" : item.status === "pausado" ? "paused" : "closed",
  tipo: item.tipo === "Premium" ? "gold_pro" : "gold_special", disponivel: item.estoque,
  vendidos: movimentosDemo.filter(m => m.sku === item.sku).reduce((s, m) => s + m.quantidade, 0),
});

/** Respostas locais para as telas reais: nenhuma consulta ao canal ou à empresa do usuário. */
export async function apiAnunciosExtraDemo(req: Request): Promise<Response | null> {
  const url = new URL(req.url), path = url.pathname, q = url.searchParams;
  const proprios = ["/api/anuncios/catalogo", "/api/anuncios/precos", "/api/anuncios/visitas", "/api/comissoes-canal", "/api/exportar/preco", "/api/meli/sincronizar"];
  if (!proprios.includes(path) && !path.startsWith("/api/monitoramento/")) return null;
  const conta = q.get("conta");
  if (conta && ![contasDemo[0].id, `conta:${contasDemo[0].id}`, "principal", "atlas-casa"].includes(conta)) return demoJson({ erro: "Esta demonstração possui apenas a conta fictícia Atlas Casa." }, 404);

  if (path === "/api/anuncios/catalogo") {
    if (req.method !== "GET") return metodos(["GET"]);
    const filtro = ["active", "paused", "closed"].includes(q.get("status") ?? "") ? q.get("status")! : "todos";
    const itens = snapshot().itens.map(anuncioApi).filter(i => filtro === "todos" || i.status === filtro);
    return demoJson({ filtro, total: itens.length, comErro: 0, resumo: { ativos: itens.filter(i => i.status === "active").length, pausados: itens.filter(i => i.status === "paused").length, precoMedio: itens.length ? moedaDemo(itens.reduce((s, i) => s + i.preco, 0) / itens.length) : null }, itens });
  }

  if (path === "/api/meli/sincronizar") {
    if (req.method !== "POST") return null;
    const corpo = await corpoDemo(req);
    if (!corpo.etapas || typeof corpo.etapas !== "object" || !(corpo.etapas as Record<string, unknown>).catalogo) return null;
    updateDemoState(s => { const estado = s as EstadoAnunciosExtraDemo; estado.anunciosExtras = { ...estado.anunciosExtras, sincronizadoEm: DEMO_SINCRONIZADO }; });
    return demoJson({ ok: true, demonstracao: true, catalogo: { lidos: snapshot().itens.length, atualizados: snapshot().itens.length }, sincronizadoEm: DEMO_SINCRONIZADO });
  }

  if (path === "/api/anuncios/precos") {
    if (req.method !== "POST") return metodos(["POST"]);
    const corpo = await corpoDemo(req);
    const ids = Array.isArray(corpo.mlbs) ? [...new Set(corpo.mlbs.map(v => String(v).trim().toUpperCase()).filter(v => /^MLB\d+$/.test(v)))] : [];
    if (!ids.length) return demoJson({ erro: "Selecione ao menos um anúncio do exemplo." }, 400);
    const itens = snapshot().itens;
    const precos = ids.map(mlb => {
      const item = itens.find(i => i.mlb === mlb);
      return item ? anuncioApi(item) : { mlb, preco: null, precoOriginal: null, status: null, tipo: null, disponivel: null, vendidos: null, erro: "Anúncio fora do cenário fictício." };
    });
    updateDemoState(s => {
      const estado = s as EstadoAnunciosExtraDemo;
      estado.anunciosExtras = { ...estado.anunciosExtras, sincronizadoEm: DEMO_SINCRONIZADO, precos: { ...estado.anunciosExtras?.precos, ...Object.fromEntries(precos.filter(p => p.preco !== null).map(p => [p.mlb, p.preco!])) } };
    });
    return demoJson({ pedidos: ids.length, recebidos: precos.length, comErro: precos.filter(p => "erro" in p).length, precos });
  }

  if (path === "/api/anuncios/visitas") {
    if (req.method !== "GET") return metodos(["GET"]);
    const periodo = janelaAnunciosExtraDemo(q);
    if (periodo.inicio > periodo.fim) return demoJson({ erro: "A data inicial precisa vir antes da final." }, 400);
    const ids = (q.get("mlbs") ?? "").split(",").map(v => v.trim().toUpperCase()).filter(Boolean);
    const linhas = movimentosDemo.filter(m => m.data >= periodo.inicio && m.data <= periodo.fim).flatMap(m => {
      const indice = produtosDemo.findIndex(p => p.sku === m.sku);
      const principais = indice < 2 ? Math.round(m.visitas * .62) : m.visitas;
      return [{ mlb: mlbDemo(indice), data: m.data, visitas: principais }, ...(indice < 2 ? [{ mlb: mlbDemo(indice + 6), data: m.data, visitas: m.visitas - principais }] : [])];
    }).filter(m => !ids.length || ids.includes(m.mlb));
    const porAnuncio = new Map<string, number>(), porDia = new Map<string, number>();
    for (const l of linhas) { porAnuncio.set(l.mlb, (porAnuncio.get(l.mlb) ?? 0) + l.visitas); porDia.set(l.data, (porDia.get(l.data) ?? 0) + l.visitas); }
    const consultados = ids.length ? ids : snapshot().itens.map(i => i.mlb);
    const falharam = consultados.filter(id => !snapshot().itens.some(i => i.mlb === id));
    const somaDosAnuncios = linhas.reduce((s, l) => s + l.visitas, 0);
    const totalDaConta = movimentosDemo.filter(m => m.data >= periodo.inicio && m.data <= periodo.fim).reduce((s, m) => s + m.visitas, 0);
    return demoJson({ periodo: { de: periodo.inicio, ate: periodo.fim }, anunciosConsultados: consultados.length, falharam, somaDosAnuncios, totalDaConta, itens: [...porAnuncio].map(([mlb, visitas]) => ({ mlb, visitas })).sort((a, b) => b.visitas - a.visitas), porDia: [...porDia].map(([data, visitas]) => ({ data, visitas })).sort((a, b) => a.data.localeCompare(b.data)) });
  }

  if (path === "/api/comissoes-canal") {
    if (req.method === "GET") return demoJson(comissoesAnunciosExtraDemo(getDemoState()));
    if (req.method !== "POST") return metodos(["GET", "POST"]);
    const corpo = await corpoDemo(req), recebidas = registros(corpo.comissoes), apagar = Array.isArray(corpo.apagar) ? corpo.apagar.map(String) : [];
    if (!recebidas.length && !apagar.length) return demoJson({ erro: "Nenhuma alíquota alterada." }, 400);
    if (recebidas.some(c => c.canalId !== canal.id || (c.tipo != null && !["classico", "premium", "outro"].includes(String(c.tipo))) || typeof c.comissao !== "number" || !Number.isFinite(c.comissao) || c.comissao < 0 || c.comissao >= 100 || (c.vigenciaInicio != null && (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.vigenciaInicio)) || !Number.isFinite(Date.parse(String(c.vigenciaInicio))))))) return demoJson({ erro: "Confira o canal, a data e as alíquotas entre 0 e 100%." }, 400);
    const atuais = comissoesAnunciosExtraDemo(getDemoState()).filter(c => !apagar.includes(c.id));
    const novas: ComissaoCanal[] = recebidas.map(c => ({ id: c.id ? String(c.id) : crypto.randomUUID(), canalId: canal.id, canalNome: canal.nome, tipo: c.tipo == null ? null : c.tipo as ComissaoCanal["tipo"], comissao: Number(c.comissao), vigenciaInicio: String(c.vigenciaInicio ?? DEMO_HOJE) }));
    const unificadas = [...atuais.filter(c => !novas.some(n => n.id === c.id)), ...novas];
    const chaves = unificadas.map(c => `${c.canalId}:${c.tipo}:${c.vigenciaInicio}`);
    if (new Set(chaves).size !== chaves.length) return demoJson({ erro: "Já existe uma alíquota desse tipo na mesma data. Mude a vigência para registrar um reajuste." }, 400);
    updateDemoState(s => { s.comissoes = unificadas; const estado = s as EstadoAnunciosExtraDemo; estado.anunciosExtras = { ...estado.anunciosExtras, comissoesConfiguradas: true }; });
    return demoJson({ ok: true, gravadas: novas.length, apagadas: apagar.length });
  }

  if (path === "/api/exportar/preco") {
    if (req.method !== "GET") return metodos(["GET"]);
    const dados = performanceAnunciosExtraDemo(q, getDemoState());
    const cabecalho = ["SKU", "Produto", "Preço vitrine", "Preço médio vendido", "Unidades", "Receita", "Melhor faixa por receita diária", "Receita diária nessa faixa", "Início", "Fim"];
    const linhas = dados.linhas.map(l => [l.sku, l.titulo, l.precoVitrine, l.precoPeriodo, l.unidades, l.receita, l.melhorReceita?.preco, l.melhorReceita?.receitaDia, dados.periodo.inicio, dados.periodo.fim]);
    return new Response("\uFEFF" + [cabecalho, ...linhas].map(l => l.map(csv).join(";")).join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="performance-precos-demonstracao.csv"', "cache-control": "no-store", "x-gerizo-demo": "local" } });
  }

  if (path === "/api/monitoramento/concorrentes") {
    if (req.method !== "GET") return metodos(["GET"]);
    const termo = (q.get("termo") ?? "").trim();
    if (termo.length < 3) return demoJson({ erro: "Informe pelo menos três caracteres para buscar." }, 400);
    const resultados = snapshot().itens.filter(i => `${i.sku} ${i.titulo}`.toLocaleLowerCase("pt-BR").includes(termo.toLocaleLowerCase("pt-BR"))).map(i => ({ mlb: i.mlb, titulo: i.titulo, preco: i.precoAtual, vendedor: "Atlas Casa", vendedorId: null, meu: true, vendidos: anuncioApi(i).vendidos, freteGratis: i.freteGratis, link: `/demonstracao/sistema/anuncios/catalogo?q=${encodeURIComponent(i.mlb)}` })).sort((a, b) => a.preco - b.preco);
    return demoJson({ termo, encontrados: resultados.length, concorrentes: 0, seusAnuncios: resultados.length, resumo: { menor: null, maior: null, mediana: null, seuPreco: q.has("meuPreco") && Number.isFinite(Number(q.get("meuPreco"))) ? Number(q.get("meuPreco")) : null, maisBaratosQueVoce: null }, resultados, demonstracao: true });
  }
  // Frete por CEP requer uma conexão real. O exemplo não produz cotação ou prazo fictício.
  return demoJson({ erro: "A consulta ao vivo de frete e concorrência não está conectada na empresa fictícia.", demonstracao: true }, 501);
}
