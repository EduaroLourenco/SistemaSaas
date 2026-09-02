"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import { Tabs, Input, Select, Field, Segmented } from "@/components/ui/controls";
import { money, moneyShort, pct, count } from "@/lib/format";
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

type Aba = "mes" | "canal" | "curva";
type Metrica = "receita" | "unidades";

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const rotuloMes = (m: string) =>
  `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

const TOM_CURVA: Record<LinhaSku["curva"], "up" | "warn" | "neutral"> = {
  A: "up",
  B: "warn",
  C: "neutral",
};

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

  function aplicar() {
    const q = new URLSearchParams({ de: filtro.de, ate: filtro.ate });
    if (filtro.canal) q.set("canal", filtro.canal);
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
        const v = valor(aba === "canal" ? l.porCanal[k] : l.porMes[k]);
        if (v > m) m = v;
      }
    }
    return m;
  }, [visiveis, aba, meses, canais, metrica]);

  const th = "px-2.5 py-2 text-[11px] font-semibold text-ink-3 whitespace-nowrap";
  const td = "px-2.5 py-1.5 border-b border-line";

  const colunas = aba === "canal"
    ? canais.map((c) => ({ chave: c.id, rotulo: c.nome }))
    : meses.map((m) => ({ chave: m, rotulo: rotuloMes(m) }));

  return (
    <>
      <PageHeader
        title="Análise de SKU"
        breadcrumb="Vendas"
        description="Desempenho por produto, período e canal"
      />

      <PageBody>
        {/* ── Recorte ── */}
        <Panel className="p-3 mb-3">
          <div className="flex items-end gap-2 flex-wrap">
            <Field label="De">
              <Input
                type="date"
                value={filtro.de}
                min={limites.inicio}
                max={limites.fim}
                onChange={(e) => setFiltro({ ...filtro, de: e.target.value })}
              />
            </Field>
            <Field label="Até">
              <Input
                type="date"
                value={filtro.ate}
                min={filtro.de}
                max={limites.fim}
                onChange={(e) => setFiltro({ ...filtro, ate: e.target.value })}
              />
            </Field>
            <Field label="Canal">
              <Select
                value={filtro.canal}
                onChange={(e) => setFiltro({ ...filtro, canal: e.target.value })}
              >
                <option value="">Todos os canais</option>
                {canais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="primary" onClick={aplicar}>
              Aplicar
            </Button>
            <div className="flex-1" />
            <Segmented
              options={[
                { value: "receita" as const, label: "Receita" },
                { value: "unidades" as const, label: "Unidades" },
              ]}
              value={metrica}
              onChange={setMetrica}
            />
          </div>
        </Panel>

        {/* ── Resumo ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
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
                        const cel = aba === "canal" ? l.porCanal[c.chave] : l.porMes[c.chave];
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
