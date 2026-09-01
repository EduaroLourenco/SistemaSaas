"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import { Input, Select, Field } from "@/components/ui/controls";
import { money, pct, count } from "@/lib/format";
import { precoParaMargem, margemDoPreco } from "@/lib/dados/formula-preco";
import type { DadosPrecoAlvo, TipoAnuncio } from "@/lib/dados/preco-alvo";
import { AlertCircle, ArrowRight, Save, Plus, Trash2, Loader2 } from "lucide-react";

/**
 * Preço-alvo: o preço que fecha a margem que se quer.
 *
 * ── Por que a margem-alvo é uma por tipo ──
 *
 * No Mercado Livre o mesmo produto vive em clássico (11,5%) e premium
 * (16,5%). Para a mesma margem de 20%, um produto de R$ 1.111 de custo
 * precisa sair a R$ 1.852 no clássico e R$ 2.021 no premium — R$ 168 de
 * diferença.
 *
 * E a margem que se QUER de cada um também difere: premium custa cinco
 * pontos a mais e, nos dados desta operação, converte pior (0,73% contra
 * 0,88%). Forçar uma margem só para os dois esconderia essa decisão.
 *
 * ── A conta roda no navegador ──
 *
 * `formula-preco.ts` não depende de servidor, então mexer no campo de
 * margem recalcula a coluna inteira sem ida ao banco. É a mesma função
 * que o servidor usa — não uma reimplementação para a tela.
 */

const ROTULO: Record<string, string> = {
  classico: "Clássico",
  premium: "Premium",
  outro: "Outro",
};

const rotuloTipo = (t: TipoAnuncio | null) =>
  t == null ? "Alíquota única" : (ROTULO[t] ?? t);

function ler(s: string): number | null {
  const limpo = s.trim().replace(/[R$%\s]/g, "");
  if (!limpo) return null;
  const v = parseFloat(
    limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo
  );
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export default function PrecoAlvoCliente({ dados }: { dados: DadosPrecoAlvo }) {
  const router = useRouter();
  const { linhas, comissoes, canais, canalId, tipos } = dados;

  /* Margem-alvo por tipo, independente. */
  const [alvos, setAlvos] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(tipos.map((t) => [t ?? "", "20"]))
  );
  const [busca, setBusca] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const comissoesDoCanal = comissoes.filter((c) => c.canalId === canalId);
  const [editando, setEditando] = React.useState(false);
  const [rascunho, setRascunho] = React.useState(comissoesDoCanal);
  const [apagar, setApagar] = React.useState<string[]>([]);

  const visiveis = React.useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return linhas;
    return linhas.filter(
      (l) => l.sku.toLowerCase().includes(t) || l.titulo.toLowerCase().includes(t)
    );
  }, [linhas, busca]);

  const calculaveis = visiveis.filter((l) => !l.faltando.length);

  async function salvarComissoes() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/comissoes-canal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          comissoes: rascunho.map((c) => ({
            ...(String(c.id).startsWith("novo-") ? {} : { id: c.id }),
            canalId: c.canalId,
            tipo: c.tipo,
            comissao: c.comissao,
            vigenciaInicio: c.vigenciaInicio,
          })),
          apagar,
        }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? `Falha ao gravar (HTTP ${r.status})`);
        return;
      }
      router.refresh();
      setEditando(false);
    } catch {
      setErro("Sem conexão — nada foi gravado.");
    } finally {
      setSalvando(false);
    }
  }

  const th = "px-2.5 py-2 text-[11px] font-semibold text-ink-3 whitespace-nowrap";
  const td = "px-2.5 py-2 border-b border-line";

  return (
    <>
      <PageHeader
        title="Preço-alvo"
        breadcrumb="Anúncios"
        description="O preço que fecha a margem que você quer"
      />

      <PageBody>
        {erro && (
          <Panel className="px-4 py-3 mb-3 flex items-start gap-2.5 border-down/30">
            <AlertCircle className="w-4 h-4 text-down shrink-0 mt-0.5" />
            <p className="text-[13px] text-ink-2">{erro}</p>
          </Panel>
        )}

        {/* ── Canal e margens-alvo ── */}
        <Panel className="p-4 mb-3">
          <div className="flex items-end gap-3 flex-wrap">
            <Field label="Canal">
              <Select
                value={canalId ?? ""}
                onChange={(e) => router.push(`/anuncios/preco-alvo?canal=${e.target.value}`)}
              >
                {canais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Field>

            {tipos.map((t) => {
              const chave = t ?? "";
              const aliq = comissoesDoCanal.find((c) => (c.tipo ?? "") === chave);
              return (
                <Field
                  key={chave}
                  label={`Margem em ${rotuloTipo(t)}`}
                  hint={aliq ? `comissão ${pct(aliq.comissao, 2)}` : undefined}
                >
                  <Input
                    inputMode="decimal"
                    value={alvos[chave] ?? ""}
                    onChange={(e) =>
                      setAlvos({ ...alvos, [chave]: e.target.value })
                    }
                    className="w-24"
                  />
                </Field>
              );
            })}

            <div className="flex-1" />
            <Button onClick={() => setEditando((v) => !v)}>
              {editando ? "Fechar" : "Comissões do canal"}
            </Button>
          </div>

          {!tipos.length && (
            <p className="text-[12.5px] text-ink-2 mt-3 leading-relaxed">
              Este canal não tem alíquota cadastrada, então não há como calcular
              preço. Clique em <span className="font-medium">Comissões do canal</span>{" "}
              e informe a taxa que ele cobra.
            </p>
          )}
        </Panel>

        {/* ── Cadastro de alíquota ── */}
        {editando && (
          <Panel className="p-4 mb-3">
            <p className="text-[13px] font-semibold text-ink mb-1">
              Comissões de {canais.find((c) => c.id === canalId)?.nome}
            </p>
            <p className="text-[11.5px] text-ink-3 mb-3 max-w-2xl leading-relaxed">
              Deixe o tipo em branco quando o canal cobra uma taxa só. Para
              registrar um reajuste, adicione uma linha nova com a data em que
              ele passou a valer — assim o preço de antes continua sendo
              comparado com a taxa daquela época.
            </p>

            <table className="w-full border-collapse max-w-2xl">
              <thead className="bg-panel-2">
                <tr>
                  <th className={`${th} text-left`}>Tipo de anúncio</th>
                  <th className={`${th} text-right w-[110px]`}>Comissão %</th>
                  <th className={`${th} text-left w-[150px]`}>Vale a partir de</th>
                  <th className={`${th} w-[40px]`} />
                </tr>
              </thead>
              <tbody>
                {rascunho.map((c, i) => (
                  <tr key={c.id}>
                    <td className={td}>
                      <Select
                        value={c.tipo ?? ""}
                        onChange={(e) => {
                          const v = (e.target.value || null) as TipoAnuncio | null;
                          setRascunho((a) =>
                            a.map((x, j) => (j === i ? { ...x, tipo: v } : x))
                          );
                        }}
                      >
                        <option value="">Alíquota única</option>
                        <option value="classico">Clássico</option>
                        <option value="premium">Premium</option>
                      </Select>
                    </td>
                    <td className={td}>
                      <Input
                        inputMode="decimal"
                        value={String(c.comissao).replace(".", ",")}
                        onChange={(e) => {
                          const v = ler(e.target.value) ?? 0;
                          setRascunho((a) =>
                            a.map((x, j) => (j === i ? { ...x, comissao: v } : x))
                          );
                        }}
                      />
                    </td>
                    <td className={td}>
                      <Input
                        type="date"
                        value={c.vigenciaInicio}
                        onChange={(e) =>
                          setRascunho((a) =>
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
                          if (!String(c.id).startsWith("novo-")) {
                            setApagar((a) => [...a, c.id]);
                          }
                          setRascunho((a) => a.filter((_, j) => j !== i));
                        }}
                        className="text-ink-3 hover:text-down transition-colors"
                        aria-label="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center gap-2 mt-3">
              <Button
                onClick={() =>
                  setRascunho((a) => [
                    ...a,
                    {
                      id: `novo-${a.length}`,
                      canalId: canalId ?? "",
                      canalNome: "",
                      tipo: null,
                      comissao: 0,
                      vigenciaInicio: new Date().toISOString().slice(0, 10),
                    },
                  ])
                }
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </Button>
              <Button variant="primary" disabled={salvando} onClick={salvarComissoes}>
                {salvando ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Gravando
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Gravar
                  </>
                )}
              </Button>
            </div>
          </Panel>
        )}

        {/* ── Tabela ── */}
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-line flex-wrap">
            <Input
              placeholder="Buscar SKU ou título"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-xs"
            />
            <span className="text-[12px] text-ink-3 num">
              {count(calculaveis.length)} de {count(visiveis.length)} com custo
              completo
            </span>
            <div className="flex-1" />
            <Link
              href="/financeiro/custos"
              className="inline-flex items-center gap-1 text-[12px] text-brand hover:underline"
            >
              Preencher custos
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead className="bg-panel-2">
                <tr>
                  <th className={`${th} text-left`} rowSpan={2}>
                    SKU
                  </th>
                  <th className={`${th} text-right`} rowSpan={2}>
                    Custo
                  </th>
                  <th className={`${th} text-right`} rowSpan={2}>
                    Frete
                  </th>
                  {tipos.map((t) => (
                    <th
                      key={t ?? ""}
                      className={`${th} text-center border-l border-line`}
                      colSpan={3}
                    >
                      {rotuloTipo(t)}
                    </th>
                  ))}
                </tr>
                <tr>
                  {tipos.map((t) => (
                    <React.Fragment key={t ?? ""}>
                      <th className={`${th} text-right border-l border-line`}>
                        Hoje
                      </th>
                      <th className={`${th} text-right`}>Margem</th>
                      <th className={`${th} text-right`}>Alvo</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.slice(0, 200).map((l) => (
                  <tr key={l.produtoId} className="hover:bg-panel-2/50">
                    <td className={td}>
                      <p className="num text-[12.5px] text-ink font-medium">{l.sku}</p>
                      <p className="text-[11px] text-ink-3 truncate max-w-[220px]">
                        {l.titulo}
                      </p>
                    </td>
                    <td className={`${td} text-right`}>
                      <span className="num text-[12.5px] text-ink-2">
                        {l.mercadoria != null
                          ? money(l.mercadoria + (l.embalagem ?? 0))
                          : "—"}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      {l.frete != null ? (
                        <div className="flex flex-col items-end leading-tight">
                          <span className="num text-[12.5px] text-ink-2">
                            {money(l.frete)}
                          </span>
                          <span className="text-[10px] text-ink-3">
                            {l.freteOrigem === "praticado" ? "medido" : "tabela"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-ink-3">—</span>
                      )}
                    </td>

                    {l.cenarios.map((c) => {
                      const chave = c.tipo ?? "";
                      const alvoPct = ler(alvos[chave] ?? "") ?? 20;

                      const podeCalcular = !l.faltando.length;
                      const alvo = podeCalcular
                        ? precoParaMargem(
                            {
                              mercadoria: l.mercadoria!,
                              embalagem: l.embalagem!,
                              frete: l.frete!,
                              comissaoPct: c.comissaoPct,
                              impostoPct: l.impostoPct!,
                            },
                            alvoPct
                          )
                        : null;

                      // Verde quando o preço de hoje já entrega o alvo:
                      // é o par que se lê junto, não dois números soltos.
                      const noAlvo =
                        c.atual != null && c.atual.margemPct >= alvoPct;

                      return (
                        <React.Fragment key={chave}>
                          <td className={`${td} text-right border-l border-line`}>
                            <span className="num text-[12.5px] text-ink">
                              {c.precoAtual != null ? money(c.precoAtual) : "—"}
                            </span>
                          </td>
                          <td className={`${td} text-right`}>
                            {c.atual ? (
                              <span
                                className={`num text-[12.5px] font-medium ${
                                  noAlvo ? "text-up" : "text-down"
                                }`}
                              >
                                {pct(c.atual.margemPct, 1)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-ink-3">—</span>
                            )}
                          </td>
                          <td className={`${td} text-right`}>
                            {alvo?.ok ? (
                              <div className="flex flex-col items-end leading-tight">
                                <span className="num text-[12.5px] font-semibold text-ink">
                                  {money(alvo.preco)}
                                </span>
                                {c.precoAtual != null && (
                                  <span
                                    className={`num text-[10.5px] ${
                                      alvo.preco > c.precoAtual
                                        ? "text-down"
                                        : "text-up"
                                    }`}
                                  >
                                    {alvo.preco > c.precoAtual ? "+" : ""}
                                    {money(alvo.preco - c.precoAtual)}
                                  </span>
                                )}
                              </div>
                            ) : alvo ? (
                              <span
                                className="text-[10.5px] text-down leading-tight block max-w-[130px]"
                                title={alvo.motivo}
                              >
                                margem impossível
                              </span>
                            ) : (
                              <span
                                className="text-[10.5px] text-ink-3 leading-tight block max-w-[130px]"
                                title={l.faltando.join(", ")}
                              >
                                falta {l.faltando[0]}
                              </span>
                            )}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}

                {!visiveis.length && (
                  <tr>
                    <td
                      colSpan={3 + tipos.length * 3}
                      className="px-3 py-8 text-center text-[13px] text-ink-3"
                    >
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {visiveis.length > 200 && (
            <p className="px-3 py-2 text-[11.5px] text-ink-3 border-t border-line">
              Mostrando os 200 de maior faturamento. Use a busca para chegar aos
              demais.
            </p>
          )}
        </Panel>

        <Panel className="p-4 mt-3">
          <p className="text-[12px] font-semibold text-ink mb-1.5">
            Como o preço é calculado
          </p>
          <p className="num text-[12.5px] text-ink-2 mb-2">
            preço = (mercadoria + embalagem + frete) ÷ (1 − comissão − imposto −
            margem)
          </p>
          <p className="text-[11.5px] text-ink-3 leading-relaxed max-w-2xl">
            Comissão, imposto e margem são percentuais do próprio preço, então a
            conta se resolve — não se marca em cima do custo. Marcar por cima
            (custo ÷ 0,80 para 20%) entrega{" "}
            <span className="num text-ink-2">3,7%</span> de margem real neste
            exemplo, não 20%.
          </p>
          <p className="text-[11.5px] text-ink-3 leading-relaxed max-w-2xl mt-1.5">
            O juro de parcelamento fica de fora do alvo: só se sabe depois da
            venda, quando o comprador escolhe parcelar. Ele entra na margem
            medida, em Financeiro — e é lá que a diferença entre o alvo e o
            realizado aparece.
          </p>
        </Panel>
      </PageBody>
    </>
  );
}
