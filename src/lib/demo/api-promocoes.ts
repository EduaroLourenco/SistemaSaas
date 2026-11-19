import { demoJson, corpoDemo } from "./http";
import { getDemoState, updateDemoState, type DemoState } from "./store";
import { automacoesDemo, regrasDemo, filaDemo, itensPromocaoDemo, contagemPromocaoDemo, formulaBaseDemo, planilhaPromocaoDemoLinhas } from "./fixtures-promocoes";
import { contasDemo, produtosDemo, mlbDemo, DEMO_HOJE, moedaDemo } from "./fixtures-base";
import { avaliarItem, type Regra } from "@/lib/planilhas/avaliar-regras";
import { paraRegra } from "@/lib/planilhas/item-para-regra";
import { corpoDoAceite, type PedidoDeAceite } from "@/lib/planilhas/corpo-promocao";
import { pisoDoItem, precoProposto, faixaDoPreco } from "@/lib/planilhas/piso-promocao";
import { processItem, getPrecoTabela, precoPiso, precoComExtra, norm, type FormulaBaseData, type RegraPreco } from "@/lib/planilhas/motor-promocoes";
import type { LinhaProcessada } from "@/lib/planilhas/processar";
import type { LinhaFila } from "@/lib/dados/fila-aprovacao";
import type { ItemHistorico, CampanhaResumo } from "@/lib/dados/promocoes";
import type ExcelJS from "exceljs";

type Configuracao = { piso?: { usarComoPiso: boolean; toleranciaPct: number }; folgas?: Record<string, number> };
type Pacote = { linhas: LinhaProcessada[]; arquivos: { nome: string; campanha: string; linhas: number }[]; livros: { nome: string; livro: ExcelJS.Workbook }[]; descontoExtra: number };
const pacotes = new Map<string, Pacote>();
const uuid = () => `demo-${crypto.randomUUID()}`;
const erro = (mensagem: string, status = 400) => demoJson({ erro: mensagem }, status);
const numero = (v: unknown, padrao = 0) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : padrao; };
const array = (v: unknown) => Array.isArray(v) ? v : [];
const config = () => getDemoState().promocoes as DemoState["promocoes"] & Configuracao;
const regras = () => (getDemoState().regras ?? regrasDemo) as Regra[];
const fila = () => (getDemoState().promocoes.fila ?? filaDemo.linhas) as LinhaFila[];
const contaValida = (conta: unknown) => contasDemo.some(c => c.id === conta && c.canalCodigo === "mercado_livre");

function respostaArquivo(bytes: Uint8Array | ArrayBuffer, nome: string, tipo: string) {
  const buffer = bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes).buffer;
  return new Response(buffer, { headers: { "content-type": tipo, "content-disposition": `attachment; filename="${nome.replace(/["\r\n]/g, "")}"`, "cache-control": "no-store", "x-gerizo-demo": "local" } });
}

/** Arquivo pequeno, válido e editável. O processamento lê de fato as células recebidas. */
export async function planilhaPromocaoExemploDemo() {
  const { default: Excel } = await import("exceljs");
  const livro = new Excel.Workbook();
  livro.creator = "Gerizo · Demonstração";
  const aba = livro.addWorksheet("Campanha de exemplo");
  const cabecalhos = Object.keys(planilhaPromocaoDemoLinhas[0]);
  aba.addRow(cabecalhos);
  planilhaPromocaoDemoLinhas.forEach(linha => aba.addRow(cabecalhos.map(c => linha[c as keyof typeof linha])));
  aba.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  aba.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7045D1" } };
  aba.columns.forEach((c, i) => { c.width = i === 2 ? 42 : 22; });
  const sobre = livro.addWorksheet("Leia antes");
  sobre.addRow(["Demonstração Gerizo — dados fictícios"]);
  sobre.addRow(["Edite os preços desta campanha e use a tela Processar planilha para conferir as decisões."]);
  sobre.addRow(["Os SKUs e anúncios precisam pertencer a este cenário. Nenhum arquivo ou aceite é enviado a uma loja."]);
  return respostaArquivo(await livro.xlsx.writeBuffer() as unknown as Uint8Array, "gerizo-promocoes-exemplo.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

const textoCelula = (celula: ExcelJS.Cell) => celula.text.trim();
const chave = (v: string) => norm(v).replace(/[^a-z0-9]/g, "");

async function processarArquivo(arquivo: File, base: FormulaBaseData, extra: number) {
  const { default: Excel } = await import("exceljs");
  const livro = new Excel.Workbook();
  await livro.xlsx.load(await arquivo.arrayBuffer() as never);
  let aba: ExcelJS.Worksheet | undefined;
  let colunas: Record<string, number> = {};
  let cabecalho = 0;
  for (const candidata of livro.worksheets) {
    for (let i = 1; i <= Math.min(candidata.rowCount, 15); i++) {
      const mapa: Record<string, number> = {};
      candidata.getRow(i).eachCell((c, n) => { mapa[chave(textoCelula(c))] = n; });
      if (mapa.mlb && mapa.sku && (mapa.precoproposto || mapa.precofinal)) { aba = candidata; colunas = mapa; cabecalho = i; break; }
    }
    if (aba) break;
  }
  if (!aba) throw new Error(`O arquivo ${arquivo.name} não tem as colunas MLB, SKU e Preço proposto. Baixe a planilha de exemplo desta demonstração.`);
  if (aba.rowCount > 150) throw new Error("Use a planilha de exemplo com até 149 produtos nesta demonstração.");
  const colunaAcao = colunas.acao || colunas.oquevocequerfazercomesteanuncio || aba.columnCount + 1;
  const colunaPreco = colunas.precoaplicado || aba.columnCount + (colunaAcao > aba.columnCount ? 2 : 1);
  const colunaMotivo = aba.columnCount + 3;
  aba.getRow(cabecalho).getCell(colunaAcao).value = "Ação";
  aba.getRow(cabecalho).getCell(colunaPreco).value = "Preço aplicado";
  aba.getRow(cabecalho).getCell(colunaMotivo).value = "Motivo da decisão";
  const linhas: LinhaProcessada[] = [];
  const tolerancia = base.regra?.toleranciaPct ?? (base.regra?.comoUsar === "piso" ? 0 : 5);
  const { ofertaJaFechada } = await import("@/lib/planilhas/processar");
  for (let indice = cabecalho + 1; indice <= aba.rowCount; indice++) {
    const row = aba.getRow(indice);
    const ler = (...campos: string[]) => { const pos = campos.map(c => colunas[c]).find(Boolean); return pos ? textoCelula(row.getCell(pos)) : ""; };
    const mlb = ler("mlb").toUpperCase();
    const sku = ler("sku").toUpperCase();
    if (!mlb && !sku) continue;
    const p = produtosDemo.find((p, i) => p.sku === sku && mlbDemo(i) === mlb);
    if (!p) throw new Error(`Linha ${indice}: use somente os SKUs e anúncios fictícios da planilha de exemplo. Nenhum dado deste arquivo foi enviado.`);
    const original = numero(ler("precooriginal", "precocheio"), p.preco);
    const proposto = numero(ler("precoproposto", "precofinal"));
    let reducao = numero(ler("reducaodetarifa", "reducaodatarifa"));
    if (reducao > 1) reducao /= 100;
    const campanha = ler("campanha") || "Campanha de demonstração";
    const status = ler("status", "situacao");
    const fechada = ofertaJaFechada(status);
    const resultado = processItem(mlb, sku, reducao || null, proposto || null, original || null, base, "Participar", "Não participar", extra);
    const entrada = base.baseMlb.get(mlb);
    const cheia = entrada?.padrao ?? (p.tipo === "premium" ? .165 : .115);
    const tabela = resultado.tabelaCalculada ?? getPrecoTabela(base, sku, mlb, Math.max(0, cheia - reducao)) ?? 0;
    const piso = precoPiso(tabela, tolerancia / 100);
    const aprovado = fechada || resultado.action === "Participar";
    const precoOferta = fechada ? proposto || original : (resultado.newPrice ?? proposto) || null;
    const motivo = fechada ? "Oferta já fechada: a demonstração preservou esta linha." : resultado.pendencia;
    const tags: LinhaProcessada["tags"] = [];
    if (fechada) tags.push("participando");
    if (tabela > proposto) tags.push("tabela_acima_ml");
    if (tabela > original) tags.push("tabela_acima_original");
    if (!aprovado && proposto && Math.abs(proposto - piso) <= 100) tags.push("quase");
    if (aprovado && proposto > piso) tags.push("folga");
    const linha: LinhaProcessada = {
      id: `${arquivo.name}:${aba.name}:${indice}`, linha: indice, arquivo: arquivo.name, aba: aba.name,
      colunaAcao: aba.getColumn(colunaAcao).letter, colunaPreco: aba.getColumn(colunaPreco).letter,
      acaoPositiva: "Participar", acaoNegativa: "Não participar", editavel: !fechada,
      mlb, sku, titulo: ler("titulo") || p.titulo, campanha,
      tipoAnuncio: p.tipo === "premium" ? "Premium" : "Clássico", tipoCampanha: reducao ? "Com Redução" : "Sem Redução",
      precoOriginal: original, precoPropostoML: proposto || null, precoOferta,
      precoTabela: tabela, precoPiso: piso, precoComExtra: reducao ? null : precoComExtra(tabela, extra, tolerancia / 100),
      reducaoTarifa: reducao ? `${moedaDemo(reducao * 100)}%` : "—", desconto: original ? (1 - (precoOferta ?? original) / original) * 100 : null,
      folga: proposto ? moedaDemo(proposto - piso) : null, decisao: fechada ? "Participando" : resultado.action,
      aprovado, recalculado: !fechada && resultado.newPrice != null, motivo, tags,
    };
    if (!fechada) {
      row.getCell(colunaAcao).value = linha.decisao;
      if (linha.precoOferta != null) row.getCell(colunaPreco).value = linha.precoOferta;
      row.getCell(colunaMotivo).value = motivo;
    }
    linhas.push(linha);
  }
  if (!linhas.length) throw new Error("A planilha não contém linhas de produtos para processar.");
  return { livro, linhas, campanha: linhas[0].campanha };
}

function baseComCustos(regra: RegraPreco, fonte = formulaBaseDemo): FormulaBaseData {
  const custos = new Map(fonte.custos ?? formulaBaseDemo.custos);
  const alteracoes = getDemoState().custos;
  produtosDemo.forEach(p => {
    const a = alteracoes[p.id]; const c = custos.get(p.sku);
    if (!a || !c) return;
    custos.set(p.sku, { ...c,
      mercadoria: numero(a.custoMercadoria ?? a.custoProduto ?? a.mercadoria, c.mercadoria),
      embalagem: numero(a.custoEmbalagem ?? a.embalagem, c.embalagem),
      impostoPct: numero(a.aliquotaImpostos ?? a.impostoPct, c.impostoPct),
      margemMinimaPct: a.margemMinimaPct == null ? c.margemMinimaPct : numero(a.margemMinimaPct),
    });
  });
  return { ...fonte, custos, regra };
}

async function processar(req: Request) {
  const corpo = await corpoDemo(req);
  const arquivos = (Array.isArray(corpo.planilha) ? corpo.planilha : [corpo.planilha]).filter((f): f is File => f instanceof File);
  if (!arquivos.length) return erro("Escolha a planilha de exemplo para processar.");
  if (arquivos.length > 3 || arquivos.some(f => f.size > 2_000_000 || !f.name.toLowerCase().endsWith(".xlsx"))) return erro("Nesta demonstração, use até três arquivos XLSX de até 2 MB.");
  let fonte = formulaBaseDemo;
  if (corpo.formulaBase instanceof File && corpo.formulaBase.size) {
    if (corpo.formulaBase.size > 2_000_000) return erro("Use uma Fórmula base de até 2 MB nesta demonstração.");
    const { lerFormulaBase } = await import("@/lib/planilhas/formula-base");
    fonte = await lerFormulaBase(await corpo.formulaBase.arrayBuffer() as never);
  }
  const modo = corpo.regra === "margem" || corpo.regra === "maior" ? corpo.regra : "tabela";
  const regra: RegraPreco = { modo, margemMinima: Math.min(60, Math.max(0, numero(corpo.margemMinima))), comoUsar: corpo.comoUsar === "piso" ? "piso" : "alvo", toleranciaPct: Math.min(50, Math.max(0, numero(corpo.toleranciaPct, 5))), reescrever: corpo.reescrever === "1" };
  const base = baseComCustos(regra, fonte);
  const extra = Math.min(.5, Math.max(0, numero(corpo.descontoExtra)));
  const pacote: Pacote = { linhas: [], arquivos: [], livros: [], descontoExtra: extra };
  for (const arquivo of arquivos) {
    const r = await processarArquivo(arquivo, base, extra);
    pacote.linhas.push(...r.linhas); pacote.arquivos.push({ nome: arquivo.name, campanha: r.campanha, linhas: r.linhas.length }); pacote.livros.push({ nome: arquivo.name, livro: r.livro });
  }
  const id = uuid(); guardarPacote(id, pacote);
  const quando = new Date().toISOString();
  const participam = pacote.linhas.filter(l => l.aprovado).length;
  const historico: ItemHistorico[] = pacote.linhas.map(l => ({ id: uuid(), processamentoId: id, mlb: l.mlb, sku: l.sku, titulo: l.titulo, campanha: l.campanha, tipoAnuncio: l.tipoAnuncio === "Premium" ? "Premium" : "Clássico", tipoCampanha: l.tipoCampanha, precoOfertadoML: l.precoPropostoML, precoTabela: l.precoTabela, precoPiso: l.precoPiso, precoComExtra: l.precoComExtra, reducaoTarifa: l.reducaoTarifa, aprovado: l.aprovado, motivo: l.motivo || null, tags: l.tags, data: DEMO_HOJE, curva: "—", precoPraticado: l.precoOriginal }));
  const nomes = [...new Set(pacote.linhas.map(l => l.campanha))];
  const campanhas: CampanhaResumo[] = nomes.map(nome => { const linhas = pacote.linhas.filter(l => l.campanha === nome); return { id: uuid(), nome, temReducao: linhas.some(l => l.tipoCampanha === "Com Redução"), ativa: true, inicio: DEMO_HOJE, fim: "2026-11-30", itens: linhas.length, participam: linhas.filter(l => l.aprovado).length, fora: linhas.filter(l => !l.aprovado).length, ultimoProcessamento: DEMO_HOJE }; });
  updateDemoState(s => { s.promocoes.processamentos = [{ id, quando, lidos: pacote.linhas.length, aprovados: participam, reprovados: pacote.linhas.length - participam, descontoExtra: extra, arquivos: arquivos.map(f => f.name), status: "concluido" }, ...s.promocoes.processamentos].slice(0, 20); s.promocoes.historico = [...historico, ...s.promocoes.historico].slice(0, 180); s.promocoes.campanhas = [...campanhas, ...s.promocoes.campanhas].slice(0, 30); });
  const porTag = (tag: LinhaProcessada["tags"][number]) => pacote.linhas.filter(l => l.tags.includes(tag));
  return demoJson({ id, gravacao: { processamentoId: id, campanhas: campanhas.length, itens: pacote.linhas.length, ofertas: pacote.linhas.length, semAnuncio: 0 }, erroGravacao: null, resumoBase: { itens: base.baseMlb.size, precosPorSku: base.precosSKU.size, precosPorMlb: base.precosMLB.size }, origemBase: corpo.formulaBase instanceof File ? "Fórmula base lida do arquivo nesta demonstração" : "Referências fictícias do cenário Atlas Casa", regra: { ...regra, custosUsados: base.custos?.size ?? 0, custosIncompletos: 0 }, arquivos: pacote.arquivos, resumo: { lidos: pacote.linhas.length, participam, fora: pacote.linhas.length - participam, pendencias: pacote.linhas.filter(l => l.motivo).length, recalculados: pacote.linhas.filter(l => l.recalculado).length, revisar: pacote.linhas.filter(l => l.tags.length).length }, revisao: { tabela_acima_ml: porTag("tabela_acima_ml"), tabela_acima_original: porTag("tabela_acima_original"), quase: porTag("quase"), folga: porTag("folga"), nao_alteradas: porTag("participando") }, linhas: pacote.linhas });
}

function guardarPacote(id: string, pacote: Pacote) { pacotes.set(id, pacote); while (pacotes.size > 5) pacotes.delete(pacotes.keys().next().value!); }
async function baixar(id: string) {
  const pacote = pacotes.get(id);
  if (!pacote) return erro("O pacote desta demonstração expirou. Processe a planilha de exemplo novamente.", 404);
  const { default: Zip } = await import("jszip"); const zip = new Zip();
  for (const arquivo of pacote.livros) zip.file(`demonstracao_processado_${arquivo.nome}`, await arquivo.livro.xlsx.writeBuffer() as unknown as Uint8Array);
  zip.file("LEIA-ME-DEMONSTRACAO.txt", "Arquivo gerado localmente com dados fictícios para demonstrar o Gerizo. Nenhum aceite foi enviado a um marketplace.");
  return respostaArquivo(await zip.generateAsync({ type: "uint8array" }), "gerizo-promocoes-demonstracao.zip", "application/zip");
}

function gerarFila(corpo: Record<string, unknown>) {
  const promocao = automacoesDemo.promocoes.find(p => p.codigo === corpo.promocao && p.contaId === corpo.conta);
  if (!promocao) return erro("Campanha fictícia não encontrada.", 404);
  const folga = config().folgas?.[promocao.tipo] ?? 0;
  const linhas: LinhaFila[] = itensPromocaoDemo.itens.map(i => {
    const produto = produtosDemo.find(p => p.sku === i.sku);
    const piso = pisoDoItem(i, itensPromocaoDemo.bandas);
    const preco = precoProposto(i, piso, folga, ["DEAL", "SELLER_CAMPAIGN", "PRICE_DISCOUNT"].includes(promocao.tipo));
    const resultado = avaliarItem(paraRegra({ ...i, contaCanalId: promocao.contaId, tipoCampanha: promocao.tipo, nomeCampanha: promocao.nome, familia: produto?.categoria ?? null, catalogo: "não", unidades30: 32, unidades90: 96, visitas30: 2300, faixaQueSobra: faixaDoPreco(i, itensPromocaoDemo.bandas, preco), acos: 14, investimento30: 480, margemPct: 22 }), regras());
    return { id: uuid(), contaCanalId: promocao.contaId, promocao: promocao.codigo, tipoPromocao: promocao.tipo, mlb: i.mlb, titulo: i.titulo, sku: i.sku, decisao: preco == null ? "conferir" : resultado.decisao, precoProposto: preco, precoCanal: i.precoCanal, pisoNaHora: piso, folgaUsada: folga, faixaResultante: faixaDoPreco(i, itensPromocaoDemo.bandas, preco), motivo: preco == null ? "Preço ou referência insuficiente para aprovar." : resultado.motivo, regraNome: resultado.regraNome, prazo: promocao.prazo, criadaEm: new Date().toISOString() };
  });
  updateDemoState(s => { s.promocoes.fila = [...linhas, ...fila().filter(l => l.promocao !== promocao.codigo)].slice(0, 180); });
  return demoJson({ decididos: linhas.length, semPreco: linhas.filter(l => l.precoProposto == null).length });
}

/** Todos os ramos são locais. Caminho não reconhecido retorna null, nunca usa fetch. */
export async function apiPromocoesDemo(req: Request): Promise<Response | null> {
  const url = new URL(req.url); const path = url.pathname;
  if (!path.startsWith("/api/automacoes/") && !path.startsWith("/api/promocoes/") && path !== "/api/demo/planilha-promocoes") return null;
  try {
    if (path === "/api/demo/planilha-promocoes" && req.method === "GET") return planilhaPromocaoExemploDemo();
    if (path === "/api/promocoes/processar" && req.method === "POST") return await processar(req);
    if (path.startsWith("/api/promocoes/baixar/") && req.method === "GET") return baixar(path.split("/").at(-1) ?? "");
    if (path === "/api/promocoes/piso") {
      if (req.method === "GET") return demoJson(config().piso ?? { usarComoPiso: false, toleranciaPct: 5 });
      const corpo = await corpoDemo(req); const toleranciaPct = numero(corpo.toleranciaPct, -1);
      if (typeof corpo.usarComoPiso !== "boolean" || toleranciaPct < 0 || toleranciaPct > 50) return erro("Informe uma tolerância de 0 a 50%.");
      const piso = { usarComoPiso: corpo.usarComoPiso, toleranciaPct };
      updateDemoState(s => { (s.promocoes as typeof s.promocoes & Configuracao).piso = piso; }); return demoJson(piso);
    }
    if (path === "/api/automacoes/contagem" && req.method === "GET") return demoJson(contagemPromocaoDemo);
    if (path === "/api/automacoes/itens" && req.method === "GET") {
      if (!contaValida(url.searchParams.get("conta"))) return erro("Conta fictícia não encontrada.", 404);
      return demoJson(itensPromocaoDemo);
    }
    const corpo = await corpoDemo(req);
    if (path === "/api/automacoes/folga") {
      const folga = numero(corpo.folga, NaN); if (!Number.isFinite(folga) || folga < 0 || folga > 50) return erro("Use uma folga de 0 a 50%.");
      updateDemoState(s => { const p = s.promocoes as typeof s.promocoes & Configuracao; p.folgas = { ...p.folgas, [String(corpo.tipo ?? "*")]: folga }; }); return demoJson({ ok: true });
    }
    if (path === "/api/automacoes/regras") {
      let atuais = structuredClone(regras());
      if (corpo.acao === "apagar") atuais = atuais.filter(r => r.id !== corpo.id);
      else if (corpo.acao === "reordenar") { const ids = array(corpo.ids).map(String); atuais = atuais.map(r => ({ ...r, ordem: ids.includes(r.id) ? ids.indexOf(r.id) : r.ordem })).sort((a, b) => a.ordem - b.ordem); }
      else {
        if (!corpo.regra || typeof corpo.regra !== "object") return erro("Informe a regra.");
        const recebida = corpo.regra as Regra; const id = recebida.id || uuid();
        const regra = { ...recebida, id, nome: String(recebida.nome ?? "Nova regra").trim().slice(0, 100), condicoes: array(recebida.condicoes), ordem: numero(recebida.ordem, atuais.length) } as Regra;
        atuais = [...atuais.filter(r => r.id !== id), regra]; updateDemoState(s => { s.regras = atuais; }); return demoJson({ id });
      }
      updateDemoState(s => { s.regras = atuais; }); return demoJson({ ok: true });
    }
    if (path === "/api/automacoes/fila") {
      if (corpo.acao !== "decidir") return gerarFila(corpo);
      if (!["aprovada", "descartada"].includes(String(corpo.estado))) return erro("Escolha aprovar ou descartar.");
      const ids = array(corpo.ids).map(String); const atuais = fila(); const mudadas = atuais.filter(l => ids.includes(l.id)).length;
      updateDemoState(s => { s.promocoes.fila = atuais.map(l => ids.includes(l.id) ? { ...l, decisao: String(corpo.estado) } : l); }); return demoJson({ mudadas });
    }
    if (path === "/api/automacoes/revisar" || path === "/api/automacoes/enviar") {
      if (!contaValida(corpo.conta)) return erro("Conta fictícia não encontrada.", 404);
      const itens = array(corpo.itens) as PedidoDeAceite[]; if (!itens.length) return erro("Selecione os itens para revisar.");
      const linhas = itens.map(p => { const r = corpoDoAceite(p); return "erro" in r ? { mlb: p.mlb, vai: false, motivo: r.erro } : { mlb: p.mlb, vai: true, metodo: "POST", caminho: `/seller-promotions/items/${p.mlb}?app_version=v2`, corpo: r.corpo }; });
      if (path.endsWith("/revisar")) return demoJson({ conta: contasDemo[0].nome, escritaConectada: true, vao: linhas.filter(l => l.vai).length, ficam: linhas.filter(l => !l.vai).length, linhas });
      if (corpo.confirmar !== true) return erro("Confirme a simulação de envio.");
      const resultados = linhas.map(l => ({ mlb: l.mlb, ok: l.vai, erro: l.vai ? undefined : l.motivo, preco: itens.find(i => i.mlb === l.mlb)?.preco ?? null }));
      const aprovados = resultados.filter(r => r.ok).map(r => r.mlb);
      updateDemoState(s => { s.promocoes.fila = fila().map(l => aprovados.includes(l.mlb) ? { ...l, decisao: "enviada" } : l); });
      return demoJson({ conta: contasDemo[0].nome, entraram: aprovados.length, recusados: resultados.length - aprovados.length, resultados, demonstracao: true });
    }
    if (path === "/api/promocoes/ajustar") {
      const antigo = pacotes.get(String(corpo.id ?? "")); if (!antigo) return erro("Processe a planilha de exemplo novamente.", 404);
      for (const ajuste of array(corpo.ajustes) as Record<string, unknown>[]) {
        const linha = antigo.linhas.find(l => l.arquivo === ajuste.arquivo && l.aba === ajuste.aba && l.linha === numero(ajuste.linha));
        if (!linha?.editavel) continue;
        const acao = String(ajuste.acao ?? linha.decisao); linha.decisao = acao; linha.aprovado = acao === linha.acaoPositiva;
        const aba = antigo.livros.find(l => l.nome === linha.arquivo)?.livro.getWorksheet(linha.aba);
        if (aba) { aba.getCell(linha.colunaAcao + linha.linha).value = acao; if (ajuste.preco != null && linha.aprovado) aba.getCell(linha.colunaPreco + linha.linha).value = numero(ajuste.preco); }
      }
      const id = uuid(); guardarPacote(id, antigo); pacotes.delete(String(corpo.id)); return demoJson({ id });
    }
    if (path === "/api/promocoes/limpar") return demoJson({ ok: true, demonstracao: true });
    return erro("Esta ação ainda não faz parte do cenário de promoções.", 404);
  } catch (e) { return erro(e instanceof Error ? e.message : "Não foi possível executar este exemplo."); }
}
