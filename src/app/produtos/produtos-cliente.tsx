"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, ArrowRight } from "lucide-react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import { SeletorCanais } from "@/components/ui/seletor-canais";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { csvProdutosPrecos, filtrarCurvaProdutos, type CurvaPrecos, type DadosProdutosPrecos, type LinhaPrecos, type CelulaPrecos } from "@/lib/produtos-precos";
import { count, money } from "@/lib/format";

const controle = "min-h-11 max-w-full rounded-r1 border border-line bg-panel px-3 text-sm text-ink";
const dataBr = (v: string) => v.split("-").reverse().join("/");
const semDado = <span className="whitespace-nowrap text-xs font-normal text-ink-3">Sem dado</span>;

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Vitrine({ valor }: { valor?: CelulaPrecos["vitrine"] }) {
  if (!valor) return semDado;
  const data = valor.de === valor.ate ? dataBr(valor.ate) : `${dataBr(valor.de)} a ${dataBr(valor.ate)}`;
  return <div title={`Última leitura da API · ${data} · ${valor.anuncios} anúncio(s) ativo(s)`}>
    <span className="num block whitespace-nowrap">{money(valor.min)}</span>
    {valor.max !== valor.min && <span className="num block whitespace-nowrap text-xs text-ink-2">a {money(valor.max)}</span>}
    <span className="mt-0.5 block text-[10px] font-normal text-ink-3">{valor.de === valor.ate ? dataBr(valor.ate) : "leituras em datas diferentes"}</span>
  </div>;
}

export default function ProdutosCliente({ dados }: { dados: DadosProdutosPrecos }) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [busca, setBusca] = React.useState("");
  const [semVenda, setSemVenda] = React.useState(false);
  const [ordem, setOrdem] = React.useState("sku");
  const [datas, setDatas] = React.useState({ de: dados.de, ate: dados.ate });
  const [pendente, transicao] = React.useTransition();
  const [exportando, setExportando] = React.useState(false);
  const [erroExportacao, setErroExportacao] = React.useState("");
  const recorteUrl = parametros.get("canais") ?? "";
  const selecionados = React.useMemo(() => [...new Set(recorteUrl.split(",").filter(id => dados.colunas.some(c => c.id === id)))], [recorteUrl, dados.colunas]);
  const colunas = React.useMemo(() => dados.colunas.filter(c => selecionados.length ? selecionados.includes(c.id) : !c.contaId), [dados.colunas, selecionados]);
  const curvaUrl = parametros.get("curva") ?? "";
  const curva: CurvaPrecos | "" = curvaUrl === "A" || curvaUrl === "B" || curvaUrl === "C" ? curvaUrl : "";
  const canalCurva = dados.colunas.find(c => c.id === parametros.get("canalCurva"));

  function mudarCurva(novaCurva: string, canal: string) {
    const q = new URLSearchParams(parametros.toString());
    if (novaCurva) q.set("curva", novaCurva); else q.delete("curva");
    if (canal) q.set("canalCurva", canal); else q.delete("canalCurva");
    window.history.pushState(null, "", `/produtos${q.size ? `?${q}` : ""}`);
  }

  function mudarCanais(canais: string[]) {
    const q = new URLSearchParams(parametros.toString());
    if (canais.length) q.set("canais", canais.join(",")); else q.delete("canais");
    // Os canais já vieram no recorte: trocar colunas é imediato e conserva a URL.
    window.history.pushState(null, "", `/produtos${q.size ? `?${q}` : ""}`);
  }
  function aplicarPeriodo() {
    const q = new URLSearchParams(parametros.toString());
    q.set("de", datas.de); q.set("ate", datas.ate);
    transicao(() => router.push(`/produtos?${q}`, { scroll: false }));
  }
  const linhas = React.useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const maior = (l: LinhaPrecos, campo: "unidades" | "vendido") => Math.max(-1, ...colunas.map(c => l.canais[c.id]?.[campo] ?? -1));
    const naCurva = filtrarCurvaProdutos(dados.linhas, curva, canalCurva ? [canalCurva.id] : colunas.map(c => c.id));
    return naCurva.filter(l => (!semVenda || colunas.every(c => !l.canais[c.id]?.unidades)) &&
      `${l.sku} ${l.titulo} ${l.codigos.join(" ")}`.toLocaleLowerCase("pt-BR").includes(termo))
      .sort((a, b) => (ordem === "unidades" ? maior(b, "unidades") - maior(a, "unidades") : ordem === "preco" ? maior(b, "vendido") - maior(a, "vendido") : 0) ||
        a.sku.localeCompare(b.sku, "pt-BR", { numeric: true }) || a.titulo.localeCompare(b.titulo, "pt-BR"));
  }, [dados.linhas, busca, semVenda, ordem, colunas, curva, canalCurva]);
  const { visible, pagination } = usePagination(linhas);
  function exportar() {
    baixar(new Blob([csvProdutosPrecos(linhas, colunas)], { type: "text/csv;charset=utf-8;" }), `produtos-precos-${dados.de}-${dados.ate}.csv`);
  }
  async function exportarExcel() {
    setExportando(true); setErroExportacao("");
    try {
      // Carrega o gerador apenas no download, usando o mesmo recorte da tabela.
      const { planilhaProdutosPrecos } = await import("@/lib/planilhas/produtos-precos");
      const wb = planilhaProdutosPrecos(linhas, colunas, {
        de: dados.de, ate: dados.ate, busca, semVenda, curva,
        canalCurva: canalCurva?.nome ?? "qualquer canal exibido",
      });
      const buffer = await wb.xlsx.writeBuffer();
      baixar(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `produtos-precos-${dados.de}-${dados.ate}.xlsx`);
    } catch {
      setErroExportacao("Não foi possível gerar o Excel. Tente baixar novamente.");
    } finally {
      setExportando(false);
    }
  }
  function historico(sku: string) {
    const q = new URLSearchParams({ sku, de: dados.de, ate: dados.ate, nivel: "produto" });
    if (selecionados.length) q.set("canais", selecionados.join(","));
    return `/vendas/queda?${q}`;
  }

  return <>
    <PageHeader title="Produtos e preços" breadcrumb="Catálogo" description="Compare o mesmo SKU entre canais."
      actions={<>
        <Button disabled={pendente || exportando || !linhas.length || !colunas.length} onClick={exportarExcel} aria-busy={exportando}><Download size={15} />{exportando ? "Gerando Excel…" : "Baixar Excel"}</Button>
        <Button disabled={pendente || !linhas.length || !colunas.length} onClick={exportar} title="Baixar os mesmos dados em CSV">CSV</Button>
      </>}
      filters={<div className="flex max-w-full flex-wrap items-end gap-3">
        <label className="min-w-0 text-xs text-ink-3">De<input aria-label="Data inicial" className={`${controle} mt-1 block`} type="date" max={datas.ate} value={datas.de} onChange={e => setDatas({ ...datas, de: e.target.value })} /></label>
        <label className="min-w-0 text-xs text-ink-3">Até<input aria-label="Data final" className={`${controle} mt-1 block`} type="date" min={datas.de} value={datas.ate} onChange={e => setDatas({ ...datas, ate: e.target.value })} /></label>
        <Button className="min-h-11" disabled={pendente || !datas.de || !datas.ate || datas.de > datas.ate} onClick={aplicarPeriodo}>{pendente ? "Carregando…" : "Aplicar período"}</Button>
      </div>} />
    <PageBody>
      <div role="group" aria-label="Canais na tabela" className="flex max-w-full flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink-2">Canais na tabela</span>
        <div className="max-w-full"><SeletorCanais grupos={dados.opcoes} selecionados={selecionados} aoAplicar={mudarCanais} /></div>
      </div>
      {erroExportacao && <p role="alert" className="text-sm text-down">{erroExportacao}</p>}
      <Panel className="min-w-0 overflow-hidden" aria-busy={pendente}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <input className={`${controle} w-full sm:w-64`} aria-label="Buscar produto" placeholder="Buscar SKU, produto ou anúncio" value={busca} onChange={e => setBusca(e.target.value)} />
          <label className="flex min-h-11 items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={semVenda} onChange={e => setSemVenda(e.target.checked)} />Sem venda no período</label>
          <select className={`${controle} sm:ml-auto`} aria-label="Ordenar produtos" value={ordem} onChange={e => setOrdem(e.target.value)}>
            <option value="sku">Ordenar por SKU</option><option value="unidades">Mais unidades no canal</option><option value="preco">Maior preço vendido</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-ink-2">Curva
            <select aria-label="Filtrar curva ABC" className={controle} value={curva} onChange={e => mudarCurva(e.target.value, canalCurva?.id ?? "")}>
              <option value="">Todas</option><option value="A">Curva A</option><option value="B">Curva B</option><option value="C">Curva C</option>
            </select>
          </label>
          <label className="order-2 flex w-full min-w-0 max-w-full items-center gap-2 text-xs text-ink-2 sm:order-1 sm:w-auto">No canal
            <select aria-label="Canal da curva ABC" className={`${controle} min-w-0 flex-1 sm:max-w-80`} value={canalCurva?.id ?? ""} onChange={e => mudarCurva(curva, e.target.value)}>
              <option value="">Qualquer canal exibido</option>
              {dados.colunas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          {curva && <button className="order-1 ml-auto min-h-11 px-2 text-xs font-medium text-brand hover:underline sm:order-2 sm:ml-0" onClick={() => mudarCurva("", "")}>Limpar curva</button>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-ink-3" aria-live="polite">
          <span>{count(linhas.length)} SKUs · {colunas.length} {colunas.length === 1 ? "canal" : "canais"} · {dataBr(dados.de)} a {dataBr(dados.ate)}{curva ? ` · Curva ${curva} em ${canalCurva?.nome ?? "qualquer canal exibido"}` : ""}</span>
          <span className="inline-flex items-center gap-1">Deslize para comparar <ArrowRight size={13} /></span>
        </div>
        <div className={`max-h-[70vh] overflow-auto ${pendente ? "opacity-60" : ""}`} tabIndex={0} role="region" aria-label="Comparação de preços por SKU e canal">
          <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
            <caption className="sr-only">Preço médio vendido, curva ABC por faturamento e unidades no período; preço de vitrine na última leitura da API. Valores ausentes aparecem como Sem dado.</caption>
            <thead className="sticky top-0 z-20 bg-panel-2">
              <tr>
                <th rowSpan={2} scope="col" className="sticky left-0 z-30 w-36 min-w-36 max-w-36 border-b border-r border-line bg-panel-2 px-3 py-3 text-left font-semibold text-ink sm:w-56 sm:min-w-56 sm:max-w-56">SKU / Produto</th>
                {colunas.map(c => <th key={c.id} colSpan={3} scope="colgroup" className="min-w-[324px] border-b border-r border-line px-4 py-3 text-left font-semibold text-ink sm:text-center"><span className="sticky left-40 block w-fit max-w-40 sm:static sm:mx-auto sm:max-w-none">{c.nome}</span></th>)}
              </tr>
              <tr>{colunas.map(c => <React.Fragment key={c.id}>
                <th scope="col" className="min-w-28 border-b border-line px-3 pb-2 pt-1 text-right text-xs font-medium text-ink-2" title="Valor dos itens vendidos dividido pelas unidades; exclui pedidos cancelados.">Vendido (médio)</th>
                <th scope="col" className="min-w-32 border-b border-line px-3 pb-2 pt-1 text-right text-xs font-medium text-ink-2" title="Última leitura da API. Anúncios ativos com preços diferentes aparecem em faixa.">Vitrine</th>
                <th scope="col" className="min-w-24 border-b border-r border-line px-3 pb-2 pt-1 text-right text-xs font-medium text-ink-2">Unidades</th>
              </React.Fragment>)}</tr>
            </thead>
            <tbody>{visible.map(l => <tr key={l.chave} className="group">
              <th scope="row" className="sticky left-0 z-10 w-36 min-w-36 max-w-36 border-b border-r border-line bg-panel px-3 py-3 text-left align-top font-normal group-hover:bg-panel-2 sm:w-56 sm:min-w-56 sm:max-w-56">
                {l.sku ? <Link href={historico(l.sku)} prefetch={false} className="block break-words font-semibold text-brand hover:underline" title="Abrir histórico e estoques deste SKU">{l.sku}</Link> : <span className="font-semibold text-ink-2">Sem SKU</span>}
                <span className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-3" title={l.titulo}>{l.titulo}</span>
              </th>
              {colunas.map(c => {
                const d = l.canais[c.id];
                return <React.Fragment key={c.id}>
                  <td className="num border-b border-line px-3 py-3 text-right align-top font-medium text-ink group-hover:bg-panel-2">
                    {d?.vendido == null ? semDado : <span className="whitespace-nowrap">{money(d.vendido)}</span>}
                    {d?.curva && <div className="mt-1" title={`Curva ${d.curva} pelo faturamento em ${c.nome}, no período selecionado.`}><Badge tone={d.curva === "A" ? "brand" : d.curva === "B" ? "info" : "neutral"} className="min-h-5 px-1.5 text-[10px]">Curva {d.curva}</Badge></div>}
                  </td>
                  <td className="border-b border-line px-3 py-3 text-right align-top text-ink-2 group-hover:bg-panel-2"><Vitrine valor={d?.vitrine} /></td>
                  <td className="num border-b border-r border-line px-3 py-3 text-right align-top text-ink-2 group-hover:bg-panel-2">{d?.unidades == null ? semDado : count(d.unidades)}</td>
                </React.Fragment>;
              })}
            </tr>)}</tbody>
          </table>
          {(!linhas.length || !colunas.length) && <p className="p-6 text-sm text-ink-3">{!colunas.length ? "Nenhum canal disponível nesta empresa." : "Nenhum produto neste filtro."}</p>}
        </div>
        <Pagination {...pagination} />
      </Panel>
      <p className="text-xs leading-relaxed text-ink-3">Vendido e unidades: período selecionado. Curva por faturamento do canal: A até atingir 80%, B até 95%, C o restante. Sem faturamento conhecido, sem curva. Vitrine: última leitura da API. Sem informação ou sem venda: Sem dado.</p>
    </PageBody>
  </>;
}
