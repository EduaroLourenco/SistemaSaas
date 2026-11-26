"use client";
import { gerizoReload } from "@/lib/demo/runtime";
import { gerizoFetch } from "@/lib/demo/runtime";


import { SelectRecorte } from "@/components/ui/select-recorte";
import type { GrupoRecorte } from "@/lib/recorte";
import * as React from "react";
import { useNavegacaoSuave, BarraCarregando } from "@/components/ui/navegacao-suave";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { FinanceNav } from "@/components/financeiro/nav";
import { Button, Panel, Badge } from "@/components/ui/primitives";
import { Tabs, Input, Select, Field } from "@/components/ui/controls";
import { money, pct, count } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { CadastroProdutos } from "./cadastro-produtos";
import {
  Save, Plus, Trash2, Loader2, AlertCircle, Check, ArrowDownToLine,
} from "lucide-react";
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
  disabled,
  rotulo,
}: {
  valor: number | null;
  onChange: (v: number | null) => void;
  sufixo?: string;
  disabled?: boolean;
  rotulo?: string;
}) {
  const [rascunho, setRascunho] = React.useState<string | null>(null);
  const mostrado = rascunho ?? texto(valor);

  return (
    <div className="relative">
      <input
        disabled={disabled}
        aria-label={rotulo}
        value={mostrado}
        inputMode="decimal"
        placeholder="—"
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={() => {
          if (rascunho !== null) onChange(ler(rascunho));
          setRascunho(null);
        }}
        className="num w-full h-8 px-2 pr-6 text-right text-[14px] text-ink bg-transparent border border-line rounded-r1 placeholder:text-ink-3 focus:border-brand focus:bg-panel transition-colors"
      />
      {sufixo && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[12px] text-ink-3 pointer-events-none">
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
        className={`num text-[14px] font-medium ${
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
      <span className="num text-[12px] text-ink-3">
        {tabela != null ? formato(tabela) : "sem tabela"}
      </span>
    </div>
  );
}

type CampoEditavel =
  | "custoMercadoria"
  | "embalagem"
  | "aliquotaImpostos"
  | "margemMinimaPct"
  | "pesoKg";

const ROTULO_CAMPO: Record<CampoEditavel, string> = {
  custoMercadoria: "Mercadoria",
  embalagem: "Embalagem",
  aliquotaImpostos: "Impostos %",
  pesoKg: "Peso (kg)",
  margemMinimaPct: "Margem mínima %",
};

export default function CustosCliente({
  linhas,
  faixas,
  completos,
  despesas,
  canais,
  opcoes,
  adsPorMes,
  inicio,
  fim,
  canalId,
  margemConfiguravel = false,
}: {
  linhas: CustoSku[];
  faixas: FaixaFrete[];
  completos: number;
  despesas: DespesaCanal[];
  canais: CanalSimples[];
  opcoes: GrupoRecorte[];
  adsPorMes: { competencia: string; canalNome: string; valor: number }[];
  inicio: string;
  fim: string;
  canalId: string;
  margemConfiguravel?: boolean;
}) {
  /* A navegação entra numa transição: a tela antiga fica visível e
     interativa enquanto a nova carrega, em vez de congelar inteira. */
  const { navegar: navegarSuave, carregando: atualizando } = useNavegacaoSuave();

  /*
   * O recorte vai para a URL, e a página recarrega do servidor.
   *
   * Filtrar aqui na tela seria mais rápido de escrever e errado: o
   * praticado sai de `margem.ts`, que recorta por pedido. Refazer esse
   * recorte no navegador criaria uma segunda implementação da mesma
   * regra, e as duas divergiriam na primeira mudança.
   */
  function aplicarRecorte(campo: "inicio" | "fim" | "canal", valor: string) {
    const q = new URLSearchParams({ inicio, fim });
    if (canalId) q.set("canal", canalId);
    if (valor) q.set(campo, valor);
    else q.delete(campo);
    navegarSuave("/financeiro/custos?" + q.toString());
  }

  /* ── Seleção e preenchimento em lote ── */

  const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());
  const [campoLote, setCampoLote] =
    React.useState<CampoEditavel>("custoMercadoria");
  const [valorLote, setValorLote] = React.useState("");

  function alternar(id: string) {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }
  const [aba, setAba] = React.useState<Aba>("sku");
  const [skuTabelaMobile, setSkuTabelaMobile] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [salvo, setSalvo] = React.useState(false);

  /* ── SKU ── */

  const [edicoes, setEdicoes] = React.useState<
    Map<string, Partial<Record<CampoEditavel, number | null>>>
  >(new Map());
  const [busca, setBusca] = React.useState("");
  const [soIncompletos, setSoIncompletos] = React.useState(false);

  function editar(
    id: string,
    campo: CampoEditavel,
    v: number | null
  ) {
    setEdicoes((m) => {
      const novo = new Map(m);
      novo.set(id, { ...(novo.get(id) ?? {}), [campo]: v });
      return novo;
    });
    setSalvo(false);
  }

  const valorDe = (l: CustoSku, campo: CampoEditavel) => {
    const e = edicoes.get(l.produtoId);
    return e && campo in e ? e[campo]! : l[campo] ?? null;
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
  /*
   * 50 SKUs por página: a lista inteira fazia a tela passar de 19 mil
   * pixels (21 telas de rolagem). Só a apresentação pagina — selecionar
   * "todos" e editar em lote continuam valendo para a lista filtrada toda.
   */
  const { visible: paginaSkus, pagination: paginacaoSkus } = usePagination(visiveis, 50);

  async function salvarSku() {
    if (!edicoes.size) return;
    setSalvando(true);
    setErro(null);
    try {
      // A rota aceita até 500 por chamada; "aplicar a todos" passa disso,
      // então manda em pacotes, um depois do outro.
      const todas = [...edicoes.entries()].map(([produtoId, campos]) => ({ produtoId, ...campos }));
      let gravados = 0;
      for (let i = 0; i < todas.length; i += 500) {
        const r = await gerizoFetch("/api/custos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ edicoes: todas.slice(i, i + 500) }),
        });
        const corpo = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = corpo.erro ?? `Falha ao gravar (HTTP ${r.status})`;
          setErro(gravados ? `${msg} — ${gravados} de ${todas.length} já tinham sido gravados.` : msg);
          if (gravados) gerizoReload();
          return;
        }
        gravados += Math.min(500, todas.length - i);
      }
      setSalvo(true);
      // Recarrega para que a margem apareça recalculada pelo servidor —
      // refazer a conta aqui criaria uma segunda implementação dela.
      gerizoReload();
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
      const r = await gerizoFetch("/api/custos/faixas", {
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
      gerizoReload();
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
      const r = await gerizoFetch("/api/custos/canal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpoEnvio),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo.erro ?? `Falha ao gravar (HTTP ${r.status})`);
        return;
      }
      gerizoReload();
    } catch {
      setErro("Sem conexão — nada foi gravado.");
    } finally {
      setSalvando(false);
    }
  }

  /* ══ Render ══ */

  const th = "px-2 py-2 text-[12px] font-semibold text-ink-3 whitespace-nowrap";
  const td = "px-2 py-1.5 border-b border-line align-middle";

  return (
    <>
      <PageHeader
        title="Custos"
        actions={<CadastroProdutos aoMudar={setAviso} />}
      />

      <BarraCarregando ativo={atualizando} />
      <PageBody className="finance-page">
        <FinanceNav />
        {aviso && (
          <Panel className="px-4 py-3 mb-3 border-brand/30">
            <p className="text-[14px] text-ink">{aviso}</p>
          </Panel>
        )}
        {linhas.length === 0 && (
          <Panel className="p-5 mb-3">
            <p className="text-[15px] font-semibold text-ink">Nenhum produto cadastrado ainda</p>
            <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-ink-2">
              Comece por <strong>Trazer produtos</strong>: cria um produto para cada SKU que já foi anunciado ou
              vendido. Depois <strong>Baixar planilha</strong>, preencha custo, embalagem, imposto e peso, e{" "}
              <strong>Subir planilha</strong>. Produto que nunca vendeu entra por <strong>Novo produto</strong>.
            </p>
          </Panel>
        )}
        <section className="finance-cost-summary" aria-label="Cobertura dos custos por SKU">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-[14px] text-ink-2 mb-2">SKUs com margem calculável</p>
              <strong className="text-ink">
                {count(completos)}</strong>
                <span className="ml-2 text-[20px] text-ink-3 font-normal">
                  {" "}de {count(linhas.length)}
                </span>
            </div>
            <p className="text-[14px] text-ink-2 leading-relaxed max-w-lg">
              Em cada célula: em cima o <span className="font-medium text-ink">praticado</span> (o que a venda revelou),
              embaixo o <span className="text-ink-3">de tabela</span>. Faltando um custo, a margem fica vazia e a coluna diz
              o que falta.
            </p>
          </div>
        </section>

        {erro && (
          <Panel className="px-4 py-3 mb-3 flex items-start gap-2.5 border-down/30">
            <AlertCircle className="w-4 h-4 text-down shrink-0 mt-0.5" />
            <p className="text-[14px] text-ink-2">{erro}</p>
          </Panel>
        )}

        {/*
          O recorte vale para o PRATICADO, não para o cadastro.
          Mercadoria, embalagem, alíquota e peso são do produto e não mudam
          com o período; comissão, frete e preço médio mudam.
        */}
        <div className="finance-cost-controls" aria-label="Recorte do custo praticado">
          <label>De
          <Input
            type="date"
            value={inicio}
            onChange={(e) => aplicarRecorte("inicio", e.target.value)}
            className="w-[150px]"
          />
          </label><label>Até
          <Input
            type="date"
            value={fim}
            onChange={(e) => aplicarRecorte("fim", e.target.value)}
            className="w-[150px]"
          />
          </label><label>Canal<SelectRecorte
            grupos={opcoes}
            valor={canalId}
            onChange={(v) => aplicarRecorte("canal", v)}
            className="w-[240px]"
          /></label>
          <small>
            O recorte muda o praticado. O cadastro é do produto e não muda.
          </small>
        </div>

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
                <button type="button" aria-pressed={skuTabelaMobile} onClick={() => setSkuTabelaMobile((v) => !v)} className="min-h-11 rounded-r1 border border-line-2 px-3 text-[14px] text-ink-2 md:hidden">{skuTabelaMobile ? "Ver lista" : "Ver tabela"}</button>
                <Button
                  onClick={() =>
                    setSelecionados((s) =>
                      s.size === visiveis.length
                        ? new Set()
                        : new Set(visiveis.map((l) => l.produtoId))
                    )
                  }
                >
                  {selecionados.size === visiveis.length && visiveis.length > 0
                    ? "Limpar seleção"
                    : "Selecionar todos"}
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

              {selecionados.size > 0 && (
                /*
                  O "arrastar" do Excel, adaptado à web.
                  Arrastar alça exige mouse e não funciona no celular; marcar
                  linhas e aplicar de uma vez faz o mesmo trabalho e ainda
                  deixa escolher linhas que não são vizinhas.
                */
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line bg-brand-wash flex-wrap">
                  <ArrowDownToLine className="w-4 h-4 text-brand shrink-0" />
                  <span className="text-[14px] text-ink">
                    <b className="num">{selecionados.size}</b> selecionado
                    {selecionados.size > 1 ? "s" : ""} · preencher
                  </span>
                  <Select
                    value={campoLote}
                    onChange={(e) => setCampoLote(e.target.value as CampoEditavel)}
                    className="w-[150px]"
                  >
                    {(Object.keys(ROTULO_CAMPO) as CampoEditavel[]).map((c) => (
                      <option key={c} value={c} disabled={c === "margemMinimaPct" && !margemConfiguravel}>
                        {ROTULO_CAMPO[c]}
                      </option>
                    ))}
                  </Select>
                  <span className="text-[14px] text-ink-2">com</span>
                  <Input
                    inputMode="decimal"
                    placeholder="valor"
                    value={valorLote}
                    onChange={(e) => setValorLote(e.target.value)}
                    className="w-[120px]"
                  />
                  <Button
                    variant="primary"
                    disabled={valorLote.trim() === ""}
                    onClick={() => {
                      // Mesma leitura da célula: aceita "18%", "1.055,50", "R$ 10".
                      const v = ler(valorLote.replace("%", ""));
                      if (v == null) {
                        setErro(`"${valorLote}" não é um número.`);
                        return;
                      }
                      setErro(null);
                      for (const id of selecionados) editar(id, campoLote, v);
                      setValorLote("");
                    }}
                  >
                    Aplicar aos {selecionados.size}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      // Apagar é uma ação legítima: devolve a margem ao
                      // estado "não calculável", que é a verdade enquanto o
                      // custo não se sabe.
                      for (const id of selecionados) editar(id, campoLote, null);
                    }}
                  >
                    Apagar
                  </Button>
                  <Button variant="ghost" onClick={() => setSelecionados(new Set())}>
                    Cancelar
                  </Button>
                </div>
              )}

              {!skuTabelaMobile && <div className="divide-y divide-line md:hidden">{paginaSkus.map((l) => <article key={l.produtoId} className="p-4">
                <div className="flex items-start gap-3"><input type="checkbox" aria-label={`Selecionar ${l.sku}`} checked={selecionados.has(l.produtoId)} onChange={() => alternar(l.produtoId)} className="mt-1" /><div className="min-w-0"><h3 className="text-[16px] font-semibold leading-6 text-ink [overflow-wrap:anywhere]">{l.titulo || l.sku}</h3><p className="mt-1 font-mono text-[12px] text-ink-3">{l.sku}</p></div></div>
                <dl className="mt-4 grid grid-cols-2 gap-4 text-[14px]"><div><dt className="text-[12px] text-ink-3">Margem realizada</dt><dd className={cn("num mt-1 font-semibold", l.margemUnidade != null && l.margemUnidade < 0 ? "text-down" : "text-ink")}>{l.margemUnidade == null ? "—" : money(l.margemUnidade)}</dd><p className="mt-1 text-[12px] text-ink-3">{l.margemPct == null ? `Falta ${l.faltando.join(", ")}` : pct(l.margemPct, 1)}</p></div><div><dt className="text-[12px] text-ink-3">Preço médio vendido</dt><dd className="num mt-1 font-semibold text-ink">{l.precoMedio == null ? "—" : money(l.precoMedio)}</dd><p className="mt-1 text-[12px] text-ink-3">{count(l.unidades)} unidades</p></div></dl>
                <details className="mt-4 border-t border-line"><summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-medium text-brand">Editar custos do produto</summary><div className="grid grid-cols-2 gap-4 pb-3">{(Object.keys(ROTULO_CAMPO) as CampoEditavel[]).map((campo) => <label key={campo} className="min-w-0 text-[14px] text-ink-2"><span className="mb-2 block">{ROTULO_CAMPO[campo]}</span><Celula valor={valorDe(l, campo)} rotulo={`${ROTULO_CAMPO[campo]} de ${l.sku}`} sufixo={campo === "pesoKg" ? "kg" : campo === "aliquotaImpostos" || campo === "margemMinimaPct" ? "%" : undefined} disabled={campo === "margemMinimaPct" && !margemConfiguravel} onChange={(v) => editar(l.produtoId, campo, v)} /></label>)}</div><Button variant="primary" disabled={!edicoes.size || salvando} onClick={salvarSku} className="mb-3 w-full">{salvando ? "Gravando…" : "Gravar alterações"}</Button></details>
              </article>)}</div>}
              <div className={cn("finance-table overflow-x-auto", !skuTabelaMobile && "hidden md:block")} role="region" aria-label="Tabela completa de custos por SKU" tabIndex={0}>
                <table className="w-full border-collapse min-w-[1100px]">
                  <thead className="bg-panel-2">
                    <tr>
                      <th className={`${th} w-[34px] text-center sticky left-0 bg-panel-2 z-10`}>
                        <input
                          type="checkbox"
                          aria-label="Selecionar todos"
                          checked={selecionados.size === visiveis.length && visiveis.length > 0}
                          onChange={() =>
                            setSelecionados((s) =>
                              s.size === visiveis.length
                                ? new Set()
                                : new Set(visiveis.map((l) => l.produtoId))
                            )
                          }
                        />
                      </th>
                      <th className={`${th} text-left`}>
                        SKU
                      </th>
                      <th className={`${th} text-right`}>Vendido</th>
                      <th className={`${th} text-right`}>Preço médio</th>
                      <th className={`${th} text-right`}>Comissão do canal</th>
                      <th className={`${th} text-right`}>Comissão % (anúncio)</th>
                      <th className={`${th} text-right`} title="Frete do vendedor como o canal cobrou. No Meli, abaixo de R$ 79 é o custo de envio que substituiu a taxa fixa em 03/2026.">Frete R$</th>
                      <th className={`${th} text-right`} title="Ads do Mercado Livre na janela de 30 dias que o canal entrega">Ads</th>
                      <th className={`${th} text-right w-[92px]`}>Mercadoria</th>
                      <th className={`${th} text-right w-[86px]`}>Embalagem</th>
                      <th className={`${th} text-right w-[80px]`}>Impostos</th>
                      <th className={`${th} text-right w-[80px]`}>Peso</th>
                      <th className={`${th} text-right w-[110px]`} title="Opcional: usada nas promoções por margem. Vazio herda a regra da campanha.">Mínima desejada</th>
                      <th className={`${th} text-right`}>Margem realizada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginaSkus.map((l) => (
                      <tr
                        key={l.produtoId}
                        className={cn(
                          "hover:bg-panel-2/50",
                          selecionados.has(l.produtoId) && "bg-brand-wash/60"
                        )}
                      >
                        <td className={`${td} text-center sticky left-0 bg-panel z-10`}>
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${l.sku}`}
                            checked={selecionados.has(l.produtoId)}
                            onChange={() => alternar(l.produtoId)}
                          />
                        </td>
                        <td className={td}>
                          <p className="num text-[14px] text-ink font-medium">
                            {l.sku}
                          </p>
                          <p className="text-[12px] text-ink-3 break-words max-w-[240px]">
                            {l.titulo}
                          </p>
                        </td>
                        <td className={`${td} text-right`}>
                          <p className="num text-[14px] text-ink-2">
                            {l.unidades ? count(l.unidades) : "—"}
                          </p>
                          {l.receita > 0 && (
                            <p className="num text-[12px] text-ink-3">
                              {money(l.receita)}
                            </p>
                          )}
                        </td>
                        <td className={`${td} text-right`}>
                          <span className="num text-[14px] text-ink-2">
                            {l.precoMedio != null ? money(l.precoMedio) : "—"}
                          </span>
                        </td>
                        <td className={`${td} text-right`}>
                          {/*
                            A alíquota cadastrada para o CANAL, não para o
                            anúncio. Quando as duas divergem, é sinal de
                            anúncio fora da tarifa que se supunha pagar.
                          */}
                          <span className="num text-[14px] text-ink-2">
                            {l.comissaoCanal != null ? pct(l.comissaoCanal, 2) : "—"}
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
                          {l.frete.praticado != null && l.precoMedio != null && l.precoMedio < 79 && (
                            <span className="block text-[11px] text-ink-3">custo abaixo de R$ 79</span>
                          )}
                        </td>
                        <td className={`${td} text-right`}>
                          {l.ads?.investimento ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span className="num text-[14px] text-ink-2">{l.ads.tacosPct != null ? pct(l.ads.tacosPct, 1) : "sem venda"}</span>
                              <span className="num text-[12px] text-ink-3">{money(l.ads.investimento)}</span>
                            </div>
                          ) : (
                            <span className="text-[12px] text-ink-3">sem Ads</span>
                          )}
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
                          <Celula valor={valorDe(l, "margemMinimaPct")} sufixo="%" disabled={!margemConfiguravel} rotulo={`Margem mínima de ${l.sku}`} onChange={(v) => editar(l.produtoId, "margemMinimaPct", v)} />
                        </td>
                        <td className={`${td} text-right`}>
                          {l.margemUnidade != null ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span
                                className={`num text-[14px] font-semibold ${
                                  l.margemUnidade >= 0 ? "text-up" : "text-down"
                                }`}
                              >
                                {money(l.margemUnidade)}
                              </span>
                              <span className="num text-[12px] text-ink-3">
                                {pct(l.margemPct ?? 0, 1)}
                              </span>
                              {/* ponytail: margem do recorte menos TACoS da janela do Meli; períodos diferentes, aproximação */}
                              {l.ads?.tacosPct != null && l.margemPct != null && (
                                <span className={`num text-[12px] ${l.margemPct - l.ads.tacosPct >= 0 ? "text-ink-2" : "text-down"}`}>
                                  {pct(l.margemPct - l.ads.tacosPct, 1)} após Ads
                                </span>
                              )}
                            </div>
                          ) : (
                            /* O que falta, nomeado. Um "—" aqui faria a
                               pessoa procurar defeito na tela em vez de
                               preencher o campo que resolve. */
                            <span className="text-[12px] text-ink-3 leading-tight block max-w-[150px]">
                              falta {l.faltando.join(", ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...paginacaoSkus} />
              <p className="px-4 py-3 text-xs text-ink-3">{margemConfiguravel ? "Margem mínima é opcional (0 a 60%). Vazio usa a regra da campanha nas promoções por margem." : "Margem mínima por produto: disponível após a atualização do banco (db/38)."}</p>
            </>
          )}

          {/* ══ Frete por faixa de peso ══ */}
          {aba === "frete" && (
            <div className="p-4">
              <p className="text-[14px] text-ink-2 leading-relaxed max-w-2xl mb-3">
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
              <p className="text-[14px] text-ink-2 leading-relaxed max-w-2xl mb-3">
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
                          <td className={`${td} num text-[14px] text-ink-2`}>
                            {d.competencia.slice(0, 7).split("-").reverse().join("/")}
                          </td>
                          <td className={`${td} text-[14px] text-ink-2`}>
                            {d.canalNome ?? "Todos"}
                          </td>
                          <td className={td}>
                            <Badge tone={d.natureza === "variavel_avulsa" ? "warn" : "neutral"}>
                              {NATUREZAS.find((n) => n.valor === d.natureza)?.rotulo ??
                                d.natureza}
                            </Badge>
                          </td>
                          <td className={`${td} text-[14px] text-ink`}>{d.descricao}</td>
                          <td className={`${td} text-right num text-[14px] text-ink`}>
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
                  <p className="text-[12px] text-ink-3 mb-2 max-w-2xl">
                    API quando conectada; nos demais canais, importação ou lançamento diário. Não cadastre o mesmo gasto novamente como despesa.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {adsPorMes.slice(0, 12).map((a, i) => (
                      <div
                        key={`${a.competencia}-${a.canalNome}-${i}`}
                        className="px-2.5 py-1.5 rounded-r1 border border-line"
                      >
                        <p className="text-[12px] text-ink-3">
                          {a.competencia.slice(0, 7).split("-").reverse().join("/")} ·{" "}
                          {a.canalNome}
                        </p>
                        <p className="num text-[14px] text-ink font-medium">
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
