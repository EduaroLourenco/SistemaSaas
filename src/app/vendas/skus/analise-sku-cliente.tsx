"use client";

import { SelectRecorte } from "@/components/ui/select-recorte";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import { Tabs, Input, Select, Segmented } from "@/components/ui/controls";
import {
  BarraFiltros,
  Filtro,
  FiltroAcoes,
  FiltroDivisor,
} from "@/components/layout/barra-filtros";
import { money, moneyShort, pct, count } from "@/lib/format";
import { Download, Loader2, AlertCircle } from "lucide-react";
import type { DadosAnaliseSku, LinhaSku } from "@/lib/dados/analise-sku";

/**
 * Análise de SKU: o que vendeu, onde e quando.
 *
 * ── A pergunta que ela responde ──
 *
 * "Qual o papel deste produto em cada canal?" — que é diferente de "qual
 * produto vende mais". O PA65751 fatura R$ 228 mil no Mercado Livre e
 * R$ 11 mil na loja própria: o mesmo item é âncora num lugar e cauda no
 * outro, e nenhum ranking geral mostra isso.
 *
 * ── Unidade ou receita, na mesma tabela ──
 *
 * As duas leituras discordam de propósito, e a discordância é o achado:
 * um SKU pode liderar em unidades e sumir em receita. O botão troca a
 * métrica sem mudar as linhas nem a ordem, para que a comparação seja
 * entre as duas leituras do MESMO recorte.
 *
 * ── A curva é do recorte ──
 *
 * Filtrar por canal recalcula A, B e C dentro dele. É o que permite ver
 * que um SKU curva A no Meli é curva C na loja própria — fixar a
 * classificação no produto responderia sempre a mesma coisa.
 */

type Aba = "mes" | "canal" | "periodo" | "curva";
type Metrica = "receita" | "unidades";

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const rotuloMes = (m: string) =>
  `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

/**
 * Os atalhos de comparação.
 *
 * Todos comparam a janela atual com a IMEDIATAMENTE anterior do mesmo
 * tamanho — que é a única comparação que isola o efeito do tempo. Contra
 * "o mesmo mês do ano passado" entra sazonalidade junto, e aí duas coisas
 * mudaram e nenhuma explicação é limpa.
 */
const ATALHOS = [
  { dias: 7, rotulo: "7 × 7" },
  { dias: 30, rotulo: "30 × 30" },
  { dias: 90, rotulo: "90 × 90" },
] as const;

/** Volta `dias` dias de uma data ISO, sem passar por fuso. */
function menos(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

const TOM_CURVA: Record<LinhaSku["curva"], "up" | "warn" | "neutral"> = {
  A: "up",
  B: "warn",
  C: "neutral",
};

/**
 * A variação entre a janela atual e a anterior.
 *
 * Três casos que um "%" sozinho contaria errado:
 *
 * - **Não vendia e passou a vender.** Dividir por zero dá infinito; a
 *   tela mostra "novo", que é o que aconteceu.
 * - **Vendia e parou.** −100% é verdade, mas "parou" é a palavra que faz
 *   alguém abrir o anúncio.
 * - **Não vendeu em nenhuma das duas.** Não é 0% de variação, é ausência
 *   — e fica em traço para não competir com as linhas que têm o que dizer.
 */
function Variacao({ agora, antes }: { agora: number; antes: number }) {
  if (!agora && !antes) return <span className="text-[11px] text-ink-3">—</span>;
  if (!antes) {
    return (
      <span className="text-[11px] font-medium text-up">novo</span>
    );
  }
  if (!agora) {
    return <span className="text-[11px] font-medium text-down">parou</span>;
  }
  const d = ((agora - antes) / antes) * 100;
  const tom = d > 2 ? "text-up" : d < -2 ? "text-down" : "text-ink-3";
  return (
    <span className={`num text-[12px] font-medium ${tom}`}>
      {d > 0 ? "+" : ""}
      {d.toFixed(0)}%
    </span>
  );
}

export default function AnaliseSkuCliente({ dados }: { dados: DadosAnaliseSku }) {
  const router = useRouter();
  const { linhas, meses, canais, periodo, limites, totais, concentracao } = dados;

  const [aba, setAba] = React.useState<Aba>("mes");
  const [metrica, setMetrica] = React.useState<Metrica>("receita");
  const [busca, setBusca] = React.useState("");
  const [curva, setCurva] = React.useState<"" | "A" | "B" | "C">("");
  const [filtro, setFiltro] = React.useState({
    de: periodo.inicio,
    ate: periodo.fim,
    canal: dados.canalId ?? "",
  });

  /** Mexeram no recorte desde a última carga? Só então "Aplicar" faz algo. */
  const sujo =
    filtro.de !== periodo.inicio ||
    filtro.ate !== periodo.fim ||
    filtro.canal !== (dados.canalId ?? "");

  /*
   * As comparações já aplicadas, no formato da URL. Sai de `dados`, e não
   * de estado local, porque quem manda é o servidor — ele agregou por
   * elas.
   */
  const comparacoes = dados.periodos.slice(1);
  const cmp = comparacoes.map((c) => `${c.inicio}~${c.fim}`).join(",");

  const [baixando, setBaixando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  /**
   * Exporta o recorte APLICADO, não o rascunho dos campos.
   *
   * `periodo` e `canalId` vêm do servidor e descrevem o que está na
   * tela; `filtro` é o que a pessoa está digitando e pode ainda não ter
   * sido aplicado. Exportar o rascunho entregaria uma planilha diferente
   * da tabela que a pessoa está olhando.
   */
  async function exportar() {
    setBaixando(true);
    setErro(null);
    try {
      const q = new URLSearchParams({ de: periodo.inicio, ate: periodo.fim });
      if (dados.canalId) q.set("canal", dados.canalId);

      const r = await fetch(`/api/exportar/skus?${q}`);
      if (!r.ok) {
        const corpo = await r.json().catch(() => ({}));
        setErro(corpo.erro ?? `Falha ao gerar (HTTP ${r.status})`);
        return;
      }

      // O nome vem do servidor: assim o arquivo baixado e o que o
      // servidor montou têm o mesmo nome, com o recorte dentro dele.
      const cd = r.headers.get("content-disposition") ?? "";
      const nome = cd.match(/filename="([^"]+)"/)?.[1] ?? "skus.xlsx";

      const blob = await r.blob();
      if (blob.size === 0) {
        setErro("O arquivo veio vazio.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Sem conexão — nada foi baixado.");
    } finally {
      setBaixando(false);
    }
  }

  function aplicar() {
    const q = new URLSearchParams({ de: filtro.de, ate: filtro.ate });
    if (filtro.canal) q.set("canal", filtro.canal);
    // A comparação sobrevive à troca de período principal: quem montou
    // três janelas não quer perdê-las ao corrigir uma data.
    if (cmp) q.set("cmp", cmp);
    router.push(`/vendas/skus?${q}`);
  }

  /**
   * Aplica um atalho: a janela atual passa a ser os últimos N dias, e a
   * anterior de mesmo tamanho vira a comparação.
   *
   * A âncora é o ÚLTIMO DIA COM VENDA, não hoje. Pedido chega com atraso
   * de importação, e ancorar em hoje faria "7 × 7" devolver uma semana
   * pela metade contra uma inteira — e a queda seria do arquivo.
   */
  function atalho(dias: number) {
    const fim = limites.fim;
    const de = menos(fim, dias - 1);
    const cmpFim = menos(de, 1);
    const cmpDe = menos(cmpFim, dias - 1);
    const q = new URLSearchParams({ de, ate: fim, cmp: `${cmpDe}~${cmpFim}` });
    if (filtro.canal) q.set("canal", filtro.canal);
    router.push(`/vendas/skus?${q}`);
  }

  /** Tira todas as comparações e volta a uma janela só. */
  function limparComparacao() {
    const q = new URLSearchParams({ de: periodo.inicio, ate: periodo.fim });
    if (dados.canalId) q.set("canal", dados.canalId);
    router.push(`/vendas/skus?${q}`);
  }

  const visiveis = React.useMemo(() => {
    const t = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (curva && l.curva !== curva) return false;
      if (!t) return true;
      return (
        l.sku.toLowerCase().includes(t) || l.titulo.toLowerCase().includes(t)
      );
    });
  }, [linhas, busca, curva]);

  /** O valor de uma célula, na métrica escolhida. */
  const valor = (c: { receita: number; unidades: number } | undefined) =>
    c ? (metrica === "receita" ? c.receita : c.unidades) : 0;

  const formatar = (v: number) =>
    metrica === "receita" ? moneyShort(v) : count(v);

  /* O maior valor da tabela dá a escala do sombreado das células. */
  const maximo = React.useMemo(() => {
    let m = 0;
    const chaves = aba === "canal" ? canais.map((c) => c.id) : meses;
    for (const l of visiveis.slice(0, 200)) {
      for (const k of chaves) {
        const v = valor(
          aba === "canal"
            ? l.porCanal[k]
            : aba === "periodo"
              ? l.porPeriodo[k]
              : l.porMes[k]
        );
        if (v > m) m = v;
      }
    }
    return m;
  }, [visiveis, aba, meses, canais, metrica]);

  const th = "px-2.5 py-2 text-[11px] font-semibold text-ink-3 whitespace-nowrap";
  const td = "px-2.5 py-1.5 border-b border-line";

  const colunas =
    aba === "canal"
      ? canais.map((c) => ({ chave: c.id, rotulo: c.nome }))
      : aba === "periodo"
        ? dados.periodos.map((p, i) => ({ chave: String(i), rotulo: p.rotulo }))
        : meses.map((m) => ({ chave: m, rotulo: rotuloMes(m) }));

  return (
    <>
      <PageHeader
        title="Análise de SKU"
        breadcrumb="Vendas"
        description="Desempenho por produto, período e canal"
        filters={
          <BarraFiltros>
            <Filtro rotulo="De">
              <Input
                type="date"
                className="w-[148px]"
                value={filtro.de}
                min={limites.inicio}
                max={limites.fim}
                onChange={(e) => setFiltro({ ...filtro, de: e.target.value })}
              />
            </Filtro>
            <Filtro rotulo="Até">
              <Input
                type="date"
                className="w-[148px]"
                value={filtro.ate}
                min={filtro.de}
                max={limites.fim}
                onChange={(e) => setFiltro({ ...filtro, ate: e.target.value })}
              />
            </Filtro>
            <Filtro rotulo="Canal">
              <SelectRecorte
                grupos={dados.opcoes}
                valor={filtro.canal}
                onChange={(v) => setFiltro({ ...filtro, canal: v })}
                className="w-[220px]"
              />
            </Filtro>
            <Button variant="primary" disabled={!sujo} onClick={aplicar}>
              Aplicar
            </Button>

            <FiltroDivisor />

            {/*
              Os atalhos montam as duas janelas de uma vez — a atual e a
              anterior de mesmo tamanho. É o gesto que a pessoa quer
              ("como estamos contra o mês passado?") em um clique, em vez
              de quatro campos de data preenchidos à mão sem errar.
            */}
            <Filtro rotulo="Comparar com o anterior">
              <div className="flex items-center gap-1 p-0.5 rounded-r1 bg-panel-3 border border-line">
                {ATALHOS.map((a) => (
                  <button
                    key={a.dias}
                    onClick={() => atalho(a.dias)}
                    className="h-6 px-2.5 rounded-[4px] text-[12px] font-medium text-ink-3 hover:bg-panel hover:text-ink transition-colors whitespace-nowrap"
                  >
                    {a.rotulo}
                  </button>
                ))}
                {comparacoes.length > 0 && (
                  <button
                    onClick={limparComparacao}
                    title="Voltar a um período só"
                    className="h-6 px-2 rounded-[4px] text-[12px] text-ink-3 hover:bg-panel hover:text-ink transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            </Filtro>

            <FiltroDivisor />

            {/*
              Medir por receita ou por unidade não recarrega nada — é
              recorte de leitura, não de consulta. Fica depois do divisor
              para não parecer que precisa de "Aplicar".
            */}
            <Filtro rotulo="Medir por">
              <Segmented
                options={[
                  { value: "receita" as const, label: "Receita" },
                  { value: "unidades" as const, label: "Unidades" },
                ]}
                value={metrica}
                onChange={setMetrica}
              />
            </Filtro>

            <FiltroAcoes>
              <Button disabled={baixando} onClick={exportar}>
                {baixando ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Montando
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" strokeWidth={2.25} />
                    Exportar Excel
                  </>
                )}
              </Button>
            </FiltroAcoes>
          </BarraFiltros>
        }
      />

      <PageBody>
        {erro && (
          <Panel className="px-4 py-3 mb-3 flex items-start gap-2.5 border-down/30">
            <AlertCircle className="w-4 h-4 text-down shrink-0 mt-0.5" />
            <p className="text-[13px] text-ink-2">{erro}</p>
          </Panel>
        )}

        {/* ── Resumo ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { r: "SKUs com venda", v: count(totais.skus) },
            { r: "Receita", v: moneyShort(totais.receita) },
            { r: "Unidades", v: count(totais.unidades) },
            {
              r: "Metade da receita",
              v: `${count(concentracao.metade)} SKUs`,
              nota: `${count(concentracao.oitenta)} fazem 80%`,
            },
          ].map((k) => (
            <Panel key={k.r} className="p-3">
              <p className="text-[11px] text-ink-3 mb-1">{k.r}</p>
              <p className="num text-[18px] font-semibold text-ink leading-none">
                {k.v}
              </p>
              {k.nota && (
                <p className="num text-[11px] text-ink-3 mt-1.5">{k.nota}</p>
              )}
            </Panel>
          ))}
        </div>

        <Panel className="overflow-hidden">
          <Tabs
            tabs={[
              { value: "mes" as const, label: "Por mês", count: meses.length },
              { value: "canal" as const, label: "Por canal", count: canais.length },
              {
                value: "periodo" as const,
                label: "Comparar períodos",
                count: dados.periodos.length,
              },
              { value: "curva" as const, label: "Curva ABC" },
            ]}
            value={aba}
            onChange={setAba}
          />

          <div className="flex items-center gap-2 p-3 border-b border-line flex-wrap">
            <Input
              placeholder="Buscar SKU ou título"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-xs"
            />
            <Segmented
              options={[
                { value: "" as const, label: "Todas" },
                { value: "A" as const, label: "A" },
                { value: "B" as const, label: "B" },
                { value: "C" as const, label: "C" },
              ]}
              value={curva}
              onChange={setCurva}
            />
            <span className="num text-[12px] text-ink-3">
              {count(visiveis.length)} SKUs
            </span>
          </div>

          <div className="overflow-x-auto max-h-[640px]">
            <table className="w-full border-collapse min-w-[760px]">
              <thead className="bg-panel-2 sticky top-0 z-10">
                <tr>
                  <th className={`${th} text-left sticky left-0 bg-panel-2 z-20`}>
                    SKU
                  </th>
                  <th className={`${th} text-right`}>Total</th>
                  {aba !== "curva" &&
                    colunas.map((c) => (
                      <th key={c.chave} className={`${th} text-right`}>
                        {c.rotulo}
                      </th>
                    ))}
                  {aba === "periodo" && comparacoes.length > 0 && (
                    <th className={`${th} text-right border-l border-line-2`}>
                      Variação
                    </th>
                  )}
                  {aba === "curva" && (
                    <>
                      <th className={`${th} text-right`}>Unidades</th>
                      <th className={`${th} text-right`}>Preço médio</th>
                      <th className={`${th} text-right`}>Canais</th>
                      <th className={`${th} text-right`}>Participação</th>
                      <th className={`${th} text-right`}>Acumulado</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {visiveis.slice(0, 200).map((l) => (
                  <tr key={l.sku} className="hover:bg-panel-2/50">
                    <td className={`${td} sticky left-0 bg-panel z-10`}>
                      <div className="flex items-center gap-1.5">
                        <Badge tone={TOM_CURVA[l.curva]}>{l.curva}</Badge>
                        <span className="num text-[12.5px] text-ink font-medium">
                          {l.sku}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-3 truncate max-w-[230px]">
                        {l.titulo}
                      </p>
                    </td>
                    <td className={`${td} text-right num text-[12.5px] text-ink font-medium`}>
                      {formatar(metrica === "receita" ? l.receita : l.unidades)}
                    </td>

                    {aba !== "curva" &&
                      colunas.map((c) => {
                        const cel =
                          aba === "canal"
                            ? l.porCanal[c.chave]
                            : aba === "periodo"
                              ? l.porPeriodo[c.chave]
                              : l.porMes[c.chave];
                        const v = valor(cel);
                        // Sombreado proporcional: com 9 meses e 10 canais,
                        // o olho não acha o pico lendo número por número.
                        const forca = maximo > 0 ? v / maximo : 0;
                        return (
                          <td
                            key={c.chave}
                            className={`${td} text-right`}
                            style={
                              v > 0
                                ? { background: `color-mix(in srgb, var(--brand) ${Math.round(forca * 22)}%, transparent)` }
                                : undefined
                            }
                          >
                            {v > 0 ? (
                              <span className="num text-[12px] text-ink-2">
                                {formatar(v)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-ink-3">—</span>
                            )}
                          </td>
                        );
                      })}

                    {aba === "periodo" && comparacoes.length > 0 && (
                      <td className={`${td} text-right border-l border-line-2`}>
                        <Variacao
                          agora={valor(l.porPeriodo["0"])}
                          antes={valor(l.porPeriodo["1"])}
                        />
                      </td>
                    )}
                    {aba === "curva" && (
                      <>
                        <td className={`${td} text-right num text-[12px] text-ink-2`}>
                          {count(l.unidades)}
                        </td>
                        <td className={`${td} text-right num text-[12px] text-ink-2`}>
                          {l.precoMedio != null ? money(l.precoMedio) : "—"}
                        </td>
                        <td className={`${td} text-right num text-[12px] text-ink-2`}>
                          {count(l.canais)}
                        </td>
                        <td className={`${td} text-right num text-[12px] text-ink-2`}>
                          {pct(l.participacao, 2)}
                        </td>
                        <td className={`${td} text-right num text-[12px] text-ink-3`}>
                          {pct(l.acumulado, 1)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visiveis.length > 200 && (
            <p className="px-3 py-2 text-[11.5px] text-ink-3 border-t border-line">
              Mostrando os 200 de maior receita. Use a busca ou o filtro de
              curva para chegar aos demais.
            </p>
          )}
        </Panel>

        <Panel className="p-4 mt-3">
          <p className="text-[12px] font-semibold text-ink mb-1.5">
            Como ler a curva
          </p>
          <p className="text-[11.5px] text-ink-3 leading-relaxed max-w-2xl">
            <span className="text-ink-2 font-medium">A</span> são os SKUs que
            somam até 80% da receita do recorte,{" "}
            <span className="text-ink-2 font-medium">B</span> vão até 95%, e{" "}
            <span className="text-ink-2 font-medium">C</span> é a cauda. Ela é
            recalculada dentro do filtro: um produto pode ser A no Mercado Livre
            e C na loja própria, e é essa diferença que diz o papel dele em cada
            canal.
          </p>
        </Panel>
      </PageBody>
    </>
  );
}
