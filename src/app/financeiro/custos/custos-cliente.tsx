"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, Badge } from "@/components/ui/primitives";
import { Tabs, Input, Select, Field } from "@/components/ui/controls";
import { money, pct, count } from "@/lib/format";
import { Save, Plus, Trash2, Loader2, AlertCircle, Check } from "lucide-react";
import type {
  CustoSku,
  FaixaFrete,
  DespesaCanal,
  CanalSimples,
  NaturezaCusto,
} from "@/lib/dados/custos";

/**
 * A tela de custo.
 *
 * ── O que ela mostra em cada linha ──
 *
 * O de TABELA e o PRATICADO, lado a lado, nunca um no lugar do outro. A
 * diferença entre eles é o achado: tarifa de tabela 11,5% com praticada
 * 7,4% é campanha com redução funcionando.
 *
 * ── E o que ela se recusa a mostrar ──
 *
 * Margem, enquanto faltar qualquer componente. Em vez do número, a linha
 * diz o que falta. Assumir custo zero devolveria uma margem otimista e
 * plausível — o pior resultado possível, porque quem decide preço com ela
 * erra para baixo e não descobre.
 */

type Aba = "sku" | "frete" | "canal";

const NATUREZAS: { valor: NaturezaCusto; rotulo: string; ajuda: string }[] = [
  { valor: "fixa_recorrente", rotulo: "Fixa recorrente", ajuda: "Todo mês, mesmo valor" },
  { valor: "variavel_recorrente", rotulo: "Variável recorrente", ajuda: "Todo mês, valor muda" },
  { valor: "variavel_avulsa", rotulo: "Variável avulsa", ajuda: "Não estava previsto" },
];

/* ── Números em português ────────────────────────────────────────── */

function texto(v: number | null): string {
  if (v == null) return "";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** Devolve `null` para campo vazio — vazio é um valor, não zero. */
function ler(s: string): number | null {
  const limpo = s.trim().replace(/[R$\s]/g, "");
  if (!limpo) return null;
  const normal = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = parseFloat(normal);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/* ── Célula editável ─────────────────────────────────────────────── */

function Celula({
  valor,
  onChange,
  sufixo,
}: {
  valor: number | null;
  onChange: (v: number | null) => void;
  sufixo?: string;
}) {
  const [rascunho, setRascunho] = React.useState<string | null>(null);
  const mostrado = rascunho ?? texto(valor);

  return (
    <div className="relative">
      <input
        value={mostrado}
        inputMode="decimal"
        placeholder="—"
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={() => {
          if (rascunho !== null) onChange(ler(rascunho));
          setRascunho(null);
        }}
        className="num w-full h-8 px-2 pr-6 text-right text-[13px] text-ink bg-transparent border border-line rounded-r1 placeholder:text-ink-3 focus:border-brand focus:bg-panel transition-colors"
      />
      {sufixo && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10.5px] text-ink-3 pointer-events-none">
          {sufixo}
        </span>
      )}
    </div>
  );
}

/** Tabela x praticado, na mesma célula. */
function Par({
  tabela,
  praticado,
  formato,
}: {
  tabela: number | null;
  praticado: number | null;
  formato: (v: number) => string;
}) {
  if (tabela == null && praticado == null) {
    return <span className="text-ink-3 text-[12px]">—</span>;
  }
  // Praticado abaixo da tabela é bom em custo: pagou menos que o previsto.
  const melhor = tabela != null && praticado != null && praticado < tabela;
  const pior = tabela != null && praticado != null && praticado > tabela;

  return (
    <div className="flex flex-col items-end leading-tight">
      <span
        className={`num text-[13px] font-medium ${
          praticado == null
            ? "text-ink-3"
            : melhor
              ? "text-up"
              : pior
                ? "text-down"
                : "text-ink"
        }`}
      >
        {praticado != null ? formato(praticado) : "—"}
      </span>
      <span className="num text-[10.5px] text-ink-3">
        {tabela != null ? formato(tabela) : "sem tabela"}
      </span>
    </div>
  );
}

export default function CustosCliente({
  linhas,
  faixas,
  completos,
  despesas,
  canais,
  adsPorMes,
}: {
  linhas: CustoSku[];
  faixas: FaixaFrete[];
  completos: number;
  despesas: DespesaCanal[];
  canais: CanalSimples[];
  adsPorMes: { competencia: string; canalNome: string; valor: number }[];
}) {
  const [aba, setAba] = React.useState<Aba>("sku");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [salvo, setSalvo] = React.useState(false);

  /* ── SKU ── */

  const [edicoes, setEdicoes] = React.useState<
    Map<string, Partial<Record<"custoMercadoria" | "embalagem" | "aliquotaImpostos" | "pesoKg", number | null>>>
  >(new Map());
  const [busca, setBusca] = React.useState("");
  const [soIncompletos, setSoIncompletos] = React.useState(false);

  function editar(
    id: string,
    campo: "custoMercadoria" | "embalagem" | "aliquotaImpostos" | "pesoKg",
    v: number | null
  ) {
    setEdicoes((m) => {
      const novo = new Map(m);
      novo.set(id, { ...(novo.get(id) ?? {}), [campo]: v });
      return novo;
    });
    setSalvo(false);
  }

  const valorDe = (l: CustoSku, campo: "custoMercadoria" | "embalagem" | "aliquotaImpostos" | "pesoKg") => {
    const e = edicoes.get(l.produtoId);
    return e && campo in e ? e[campo]! : l[campo];
  };

  const visiveis = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (soIncompletos && !l.faltando.length) return false;
      if (!termo) return true;
      return (
        l.sku.toLowerCase().includes(termo) ||
        l.titulo.toLowerCase().includes(termo)
      );
    });
  }, [linhas, busca, soIncompletos]);

  async function salvarSku() {
    if (!edicoes.size) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/custos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          edicoes: [...edicoes.entries()].map(([produtoId, campos]) => ({
            produtoId,
            ...campos,
          })),
        }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? `Falha ao gravar (HTTP ${r.status})`);
        return;
      }
      setSalvo(true);
      // Recarrega para que a margem apareça recalculada pelo servidor —
      // refazer a conta aqui criaria uma segunda implementação dela.
      window.location.reload();
    } catch {
      setErro("Sem conexão — nada foi gravado.");
    } finally {
      setSalvando(false);
    }
  }

  /* ── Faixas de frete ── */

  type FaixaEdit = FaixaFrete & { novo?: boolean };
  const [faixasEdit, setFaixasEdit] = React.useState<FaixaEdit[]>(faixas);
  const [apagarFaixas, setApagarFaixas] = React.useState<string[]>([]);

  async function salvarFaixas() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/custos/faixas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          faixas: faixasEdit.map((f) => ({
            ...(f.novo ? {} : { id: f.id }),
            canalId: f.canalId,
            pesoMin: f.pesoMin,
            pesoMax: f.pesoMax,
            valor: f.valor,
            vigenciaInicio: f.vigenciaInicio,
          })),
          apagar: apagarFaixas,
        }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? `Falha ao gravar (HTTP ${r.status})`);
        return;
      }
      window.location.reload();
    } catch {
      setErro("Sem conexão — nada foi gravado.");
    } finally {
      setSalvando(false);
    }
  }

  /* ── Despesas de canal ── */

  const [nova, setNova] = React.useState({
    canalId: "",
    natureza: "fixa_recorrente" as NaturezaCusto,
    descricao: "",
    valor: "",
    competencia: new Date().toISOString().slice(0, 8) + "01",
  });

  async function salvarDespesa(apagar?: string) {
    setSalvando(true);
    setErro(null);
    try {
      const corpoEnvio = apagar
        ? { apagar: [apagar] }
        : {
            despesas: [
              {
                canalId: nova.canalId || null,
                natureza: nova.natureza,
                descricao: nova.descricao,
                valor: ler(nova.valor) ?? 0,
                competencia: nova.competencia,
              },
            ],
          };
      const r = await fetch("/api/custos/canal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpoEnvio),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? `Falha ao gravar (HTTP ${r.status})`);
        return;
      }
      window.location.reload();
    } catch {
      setErro("Sem conexão — nada foi gravado.");
    } finally {
      setSalvando(false);
    }
  }

  /* ══ Render ══ */

  const th = "px-2 py-2 text-[11px] font-semibold text-ink-3 whitespace-nowrap";
  const td = "px-2 py-1.5 border-b border-line align-middle";

  return (
    <>
      <PageHeader
        title="Custos"
        breadcrumb="Financeiro"
        description="O que falta para fechar margem"
      />

      <PageBody>
        <Panel className="p-4 mb-3">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-[22px] font-semibold text-ink num leading-none">
                {count(completos)}
                <span className="text-[13px] text-ink-3 font-normal">
                  {" "}de {count(linhas.length)}
                </span>
              </p>
              <p className="text-[11.5px] text-ink-3 mt-1">
                SKUs com margem calculável
              </p>
            </div>
            <p className="text-[12.5px] text-ink-2 leading-relaxed max-w-lg">
              Cada custo aparece em duas linhas na mesma célula: em cima o{" "}
              <span className="font-medium text-ink">praticado</span>, que a
              venda revelou; embaixo o{" "}
              <span className="text-ink-3">de tabela</span>, que vale antes de
              existir venda. Enquanto faltar qualquer componente, a margem não
              é calculada — a coluna diz o que falta em vez de chutar zero.
            </p>
          </div>
        </Panel>

        {erro && (
          <Panel className="px-4 py-3 mb-3 flex items-start gap-2.5 border-down/30">
            <AlertCircle className="w-4 h-4 text-down shrink-0 mt-0.5" />
            <p className="text-[13px] text-ink-2">{erro}</p>
          </Panel>
        )}

        <Panel className="overflow-hidden">
          <Tabs
            tabs={[
              { value: "sku" as const, label: "Por SKU", count: linhas.length },
              { value: "frete" as const, label: "Frete por peso", count: faixas.length },
              { value: "canal" as const, label: "Custos do canal", count: despesas.length },
            ]}
            value={aba}
            onChange={setAba}
          />

          {/* ══ Por SKU ══ */}
          {aba === "sku" && (
            <>
              <div className="flex items-center gap-2 p-3 border-b border-line flex-wrap">
                <Input
                  placeholder="Buscar SKU ou título"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  variant={soIncompletos ? "primary" : "default"}
                  onClick={() => setSoIncompletos((v) => !v)}
                >
                  Só os incompletos
                </Button>
                <span className="text-[12px] text-ink-3 num">
                  {count(visiveis.length)} linhas
                </span>
                <div className="flex-1" />
                {edicoes.size > 0 && (
                  <span className="text-[12px] text-ink-2 num">
                    {count(edicoes.size)} alterado{edicoes.size > 1 ? "s" : ""}
                  </span>
                )}
                <Button
                  variant="primary"
                  disabled={!edicoes.size || salvando}
                  onClick={salvarSku}
                >
                  {salvando ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Gravando
                    </>
                  ) : salvo ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Gravado
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Gravar custos
                    </>
                  )}
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[1100px]">
                  <thead className="bg-panel-2">
                    <tr>
                      <th className={`${th} text-left sticky left-0 bg-panel-2 z-10`}>
                        SKU
                      </th>
                      <th className={`${th} text-right`}>Vendido</th>
                      <th className={`${th} text-right`}>Preço médio</th>
                      <th className={`${th} text-right`}>Comissão %</th>
                      <th className={`${th} text-right`}>Frete R$</th>
                      <th className={`${th} text-right`}>Juros R$</th>
                      <th className={`${th} text-right w-[92px]`}>Mercadoria</th>
                      <th className={`${th} text-right w-[86px]`}>Embalagem</th>
                      <th className={`${th} text-right w-[80px]`}>Impostos</th>
                      <th className={`${th} text-right w-[80px]`}>Peso</th>
                      <th className={`${th} text-right`}>Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((l) => (
                      <tr key={l.produtoId} className="hover:bg-panel-2/50">
                        <td className={`${td} sticky left-0 bg-panel z-10`}>
                          <p className="num text-[12.5px] text-ink font-medium">
                            {l.sku}
                          </p>
                          <p className="text-[11px] text-ink-3 truncate max-w-[240px]">
                            {l.titulo}
                          </p>
                        </td>
                        <td className={`${td} text-right`}>
                          <p className="num text-[12.5px] text-ink-2">
                            {l.unidades ? count(l.unidades) : "—"}
                          </p>
                          {l.receita > 0 && (
                            <p className="num text-[10.5px] text-ink-3">
                              {money(l.receita)}
                            </p>
                          )}
                        </td>
                        <td className={`${td} text-right`}>
                          <span className="num text-[12.5px] text-ink-2">
                            {l.precoMedio != null ? money(l.precoMedio) : "—"}
                          </span>
                        </td>
                        <td className={`${td} text-right`}>
                          <Par
                            tabela={l.comissao.tabela}
                            praticado={l.comissao.praticado}
                            formato={(v) => pct(v, 2)}
                          />
                        </td>
                        <td className={`${td} text-right`}>
                          <Par
                            tabela={l.frete.tabela}
                            praticado={l.frete.praticado}
                            formato={money}
                          />
                        </td>
                        <td className={`${td} text-right`}>
                          <span className="num text-[12.5px] text-ink-2">
                            {l.jurosUnidade != null ? money(l.jurosUnidade) : "—"}
                          </span>
                        </td>
                        <td className={td}>
                          <Celula
                            valor={valorDe(l, "custoMercadoria")}
                            onChange={(v) => editar(l.produtoId, "custoMercadoria", v)}
                          />
                        </td>
                        <td className={td}>
                          <Celula
                            valor={valorDe(l, "embalagem")}
                            onChange={(v) => editar(l.produtoId, "embalagem", v)}
                          />
                        </td>
                        <td className={td}>
                          <Celula
                            valor={valorDe(l, "aliquotaImpostos")}
                            onChange={(v) => editar(l.produtoId, "aliquotaImpostos", v)}
                            sufixo="%"
                          />
                        </td>
                        <td className={td}>
                          <Celula
                            valor={valorDe(l, "pesoKg")}
                            onChange={(v) => editar(l.produtoId, "pesoKg", v)}
                            sufixo="kg"
                          />
                        </td>
                        <td className={`${td} text-right`}>
                          {l.margemUnidade != null ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span
                                className={`num text-[13px] font-semibold ${
                                  l.margemUnidade >= 0 ? "text-up" : "text-down"
                                }`}
                              >
                                {money(l.margemUnidade)}
                              </span>
                              <span className="num text-[10.5px] text-ink-3">
                                {pct(l.margemPct ?? 0, 1)}
                              </span>
                            </div>
                          ) : (
                            /* O que falta, nomeado. Um "—" aqui faria a
                               pessoa procurar defeito na tela em vez de
                               preencher o campo que resolve. */
                            <span className="text-[10.5px] text-ink-3 leading-tight block max-w-[150px]">
                              falta {l.faltando.join(", ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ══ Frete por faixa de peso ══ */}
          {aba === "frete" && (
            <div className="p-4">
              <p className="text-[12.5px] text-ink-2 leading-relaxed max-w-2xl mb-3">
                O frete de partida, antes de existir venda. Faixa sem canal vale
                para todos; onde o canal tem tabela própria, a linha específica
                ganha da geral. Assim que houver pedido com frete informado, a
                coluna do SKU passa a mostrar o praticado por cima deste valor.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[620px]">
                  <thead className="bg-panel-2">
                    <tr>
                      <th className={`${th} text-left`}>Canal</th>
                      <th className={`${th} text-right w-[110px]`}>De (kg)</th>
                      <th className={`${th} text-right w-[110px]`}>Até (kg)</th>
                      <th className={`${th} text-right w-[120px]`}>Valor</th>
                      <th className={`${th} text-left w-[130px]`}>Vigência</th>
                      <th className={`${th} w-[44px]`} />
                    </tr>
                  </thead>
                  <tbody>
                    {faixasEdit.map((f, i) => (
                      <tr key={f.id}>
                        <td className={td}>
                          <Select
                            value={f.canalId ?? ""}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              setFaixasEdit((a) =>
                                a.map((x, j) => (j === i ? { ...x, canalId: v } : x))
                              );
                            }}
                          >
                            <option value="">Todos os canais</option>
                            {canais.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome}
                              </option>
                            ))}
                          </Select>
                        </td>
                        {(["pesoMin", "pesoMax", "valor"] as const).map((campo) => (
                          <td className={td} key={campo}>
                            <Celula
                              valor={f[campo]}
                              onChange={(v) =>
                                setFaixasEdit((a) =>
                                  a.map((x, j) =>
                                    j === i ? { ...x, [campo]: v ?? 0 } : x
                                  )
                                )
                              }
                            />
                          </td>
                        ))}
                        <td className={td}>
                          <Input
                            type="date"
                            value={f.vigenciaInicio}
                            onChange={(e) =>
                              setFaixasEdit((a) =>
                                a.map((x, j) =>
                                  j === i ? { ...x, vigenciaInicio: e.target.value } : x
                                )
                              )
                            }
                          />
                        </td>
                        <td className={`${td} text-center`}>
                          <button
                            onClick={() => {
                              if (!f.novo) setApagarFaixas((a) => [...a, f.id]);
                              setFaixasEdit((a) => a.filter((_, j) => j !== i));
                            }}
                            className="text-ink-3 hover:text-down transition-colors"
                            aria-label="Remover faixa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <Button
                  onClick={() =>
                    setFaixasEdit((a) => [
                      ...a,
                      {
                        id: `novo-${a.length}-${a.reduce((s, x) => s + x.pesoMax, 0)}`,
                        canalId: null,
                        canalNome: null,
                        pesoMin: a.length ? a[a.length - 1].pesoMax : 0,
                        pesoMax: 0,
                        valor: 0,
                        vigenciaInicio: new Date().toISOString().slice(0, 10),
                        novo: true,
                      },
                    ])
                  }
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar faixa
                </Button>
                <div className="flex-1" />
                <Button variant="primary" disabled={salvando} onClick={salvarFaixas}>
                  {salvando ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Gravando
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Gravar faixas
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ══ Custos do canal ══ */}
          {aba === "canal" && (
            <div className="p-4">
              <p className="text-[12.5px] text-ink-2 leading-relaxed max-w-2xl mb-3">
                Despesa de canal separada por como se comporta no tempo. A
                distinção decide o que dá para projetar: a fixa entra inteira na
                previsão do mês que vem, a variável recorrente entra pela média,
                e a avulsa não entra — por definição.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end mb-4">
                <Field label="Canal" className="md:col-span-1">
                  <Select
                    value={nova.canalId}
                    onChange={(e) => setNova({ ...nova, canalId: e.target.value })}
                  >
                    <option value="">Todos</option>
                    {canais.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Natureza" className="md:col-span-1">
                  <Select
                    value={nova.natureza}
                    onChange={(e) =>
                      setNova({ ...nova, natureza: e.target.value as NaturezaCusto })
                    }
                  >
                    {NATUREZAS.map((n) => (
                      <option key={n.valor} value={n.valor}>
                        {n.rotulo}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Descrição" className="md:col-span-2">
                  <Input
                    value={nova.descricao}
                    placeholder="Mensalidade da plataforma"
                    onChange={(e) => setNova({ ...nova, descricao: e.target.value })}
                  />
                </Field>
                <Field label="Valor">
                  <Input
                    inputMode="decimal"
                    value={nova.valor}
                    placeholder="0,00"
                    onChange={(e) => setNova({ ...nova, valor: e.target.value })}
                  />
                </Field>
                <Field label="Competência">
                  <Input
                    type="date"
                    value={nova.competencia}
                    onChange={(e) => setNova({ ...nova, competencia: e.target.value })}
                  />
                </Field>
              </div>

              <Button
                variant="primary"
                disabled={salvando || !nova.descricao.trim() || !ler(nova.valor)}
                onClick={() => salvarDespesa()}
                className="mb-4"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Gravando
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Lançar despesa
                  </>
                )}
              </Button>

              {despesas.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[620px]">
                    <thead className="bg-panel-2">
                      <tr>
                        <th className={`${th} text-left`}>Competência</th>
                        <th className={`${th} text-left`}>Canal</th>
                        <th className={`${th} text-left`}>Natureza</th>
                        <th className={`${th} text-left`}>Descrição</th>
                        <th className={`${th} text-right`}>Valor</th>
                        <th className={`${th} w-[44px]`} />
                      </tr>
                    </thead>
                    <tbody>
                      {despesas.map((d) => (
                        <tr key={d.id}>
                          <td className={`${td} num text-[12.5px] text-ink-2`}>
                            {d.competencia.slice(0, 7).split("-").reverse().join("/")}
                          </td>
                          <td className={`${td} text-[12.5px] text-ink-2`}>
                            {d.canalNome ?? "Todos"}
                          </td>
                          <td className={td}>
                            <Badge tone={d.natureza === "variavel_avulsa" ? "warn" : "neutral"}>
                              {NATUREZAS.find((n) => n.valor === d.natureza)?.rotulo ??
                                d.natureza}
                            </Badge>
                          </td>
                          <td className={`${td} text-[12.5px] text-ink`}>{d.descricao}</td>
                          <td className={`${td} text-right num text-[12.5px] text-ink`}>
                            {money(d.valor)}
                          </td>
                          <td className={`${td} text-center`}>
                            <button
                              onClick={() => salvarDespesa(d.id)}
                              className="text-ink-3 hover:text-down transition-colors"
                              aria-label="Remover despesa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Mídia não se digita aqui: já entra todo dia pela tela de
                  Lançamentos. Redigitá-la criaria duas versões do mesmo
                  número, sem como decidir qual vale. */}
              {adsPorMes.length > 0 && (
                <div className="mt-5">
                  <p className="text-[12px] font-semibold text-ink mb-1">
                    Mídia (Ads)
                  </p>
                  <p className="text-[11.5px] text-ink-3 mb-2 max-w-2xl">
                    Vem da tela de Lançamentos, onde o gasto do dia anterior é
                    preenchido. Não se digita aqui para não existirem duas
                    versões do mesmo número.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {adsPorMes.slice(0, 12).map((a, i) => (
                      <div
                        key={`${a.competencia}-${a.canalNome}-${i}`}
                        className="px-2.5 py-1.5 rounded-r1 border border-line"
                      >
                        <p className="text-[10.5px] text-ink-3">
                          {a.competencia.slice(0, 7).split("-").reverse().join("/")} ·{" "}
                          {a.canalNome}
                        </p>
                        <p className="num text-[13px] text-ink font-medium">
                          {money(a.valor)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
