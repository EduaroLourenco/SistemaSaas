"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Badge, Button, Panel, PanelHeader } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { Select } from "@/components/ui/controls";
import { count, money, moneyShort, pct } from "@/lib/format";
import {
  CAMPOS_LANCAMENTO,
  MESES_LONGOS,
  type CampoLancamento,
} from "@/mock/lancamentos";
import type { DadosLancamentos, LancamentoDia } from "@/lib/dados/vendas";

/** O canal é o id vindo do banco, ou "todos". */
type CanalLancamentoId = string;
import { RotateCcw } from "lucide-react";

/* ══ Números da grade ════════════════════════════════════════
   A grade digita em português: "1.284,50" entra e sai igual.
   Só aqui o texto vira número — em nenhum outro ponto da tela.
   ══════════════════════════════════════════════════════════ */

type TipoCampo = "inteiro" | "moeda";

function formatarEdicao(v: number, tipo: TipoCampo): string {
  if (!v) return "";
  return tipo === "moeda"
    ? v.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : String(Math.round(v));
}

function lerNumero(texto: string, tipo: TipoCampo): number {
  let s = texto.trim().replace(/[R$\s]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  const v = Number.parseFloat(s);
  if (!Number.isFinite(v) || v < 0) return 0;
  return tipo === "moeda" ? Math.round(v * 100) / 100 : Math.round(v);
}

/* ══ Colunas ═════════════════════════════════════════════════ */

type ColunaCampo = {
  campo: CampoLancamento;
  titulo: string;
  tipo: TipoCampo;
  largura: number;
};

const COLUNAS: ColunaCampo[] = [
  { campo: "visitas", titulo: "Visitas", tipo: "inteiro", largura: 112 },
  { campo: "receita", titulo: "Receita", tipo: "moeda", largura: 140 },
  { campo: "pedidos", titulo: "Pedidos", tipo: "inteiro", largura: 104 },
  { campo: "ads", titulo: "ADS", tipo: "moeda", largura: 124 },
  { campo: "pedidosCancelados", titulo: "Ped. cancel.", tipo: "inteiro", largura: 112 },
  { campo: "valorCancelado", titulo: "Valor cancel.", tipo: "moeda", largura: 132 },
];

const LARGURA_DATA = 104;
const LARGURA_MINIMA =
  LARGURA_DATA + COLUNAS.reduce((t, c) => t + c.largura, 0) + 140 + 112;

/* ══ Estado de cada célula ═══════════════════════════════════ */

type EstadoCelula = "original" | "salvo" | "rascunho";

const chave = (
  canal: CanalLancamentoId,
  mes: number,
  dia: number,
  campo: CampoLancamento
) => `${canal}|${mes}|${dia}|${campo}`;

type Linha = {
  base: LancamentoDia;
  valores: Record<CampoLancamento, number>;
  estados: Record<CampoLancamento, EstadoCelula>;
  receitaLiquida: number;
  pedidosLiquidos: number;
  ticket: number;
};

/* ══ Peças locais ════════════════════════════════════════════ */

function Vazio() {
  return <span className="text-ink-3">—</span>;
}

/** Célula digitável. Guarda o próprio texto para não brigar com o teclado. */
function CelulaNumerica({
  valor,
  tipo,
  rotulo,
  registrar,
  aoConfirmar,
  aoMover,
}: {
  valor: number;
  tipo: TipoCampo;
  rotulo: string;
  registrar: (el: HTMLInputElement | null) => void;
  aoConfirmar: (v: number) => void;
  aoMover: (passo: number) => void;
}) {
  const [texto, setTexto] = React.useState(() => formatarEdicao(valor, tipo));

  /* valor mudou por fora (descarte, troca de mês) → reescreve o campo */
  React.useEffect(() => {
    setTexto(formatarEdicao(valor, tipo));
  }, [valor, tipo]);

  function confirmar() {
    const v = lerNumero(texto, tipo);
    setTexto(formatarEdicao(v, tipo));
    if (v !== valor) aoConfirmar(v);
  }

  return (
    <input
      ref={registrar}
      value={texto}
      aria-label={rotulo}
      inputMode="decimal"
      autoComplete="off"
      placeholder="—"
      onChange={(e) => setTexto(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "ArrowDown") {
          e.preventDefault();
          confirmar();
          aoMover(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          confirmar();
          aoMover(-1);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setTexto(formatarEdicao(valor, tipo));
          e.currentTarget.blur();
        }
      }}
      className="num w-full h-11 md:h-[30px] px-2 text-right text-[13px] text-ink bg-transparent border border-transparent rounded-r1 placeholder:text-ink-3 focus:border-brand focus:bg-panel transition-colors"
    />
  );
}

/** Confirmação curta — folha embaixo no mobile, caixa central no desktop. */
function Confirmacao({
  titulo,
  descricao,
  rotuloAcao,
  aoCancelar,
  aoConfirmar,
}: {
  titulo: string;
  descricao: string;
  rotuloAcao: string;
  aoCancelar: () => void;
  aoConfirmar: () => void;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") aoCancelar();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aoCancelar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      <div
        className="absolute inset-0"
        style={{ background: "var(--veil)" }}
        onClick={aoCancelar}
      />
      <div
        className="relative w-full sm:max-w-sm bg-panel border border-line rounded-t-r3 sm:rounded-r2 p-4"
        style={{
          boxShadow: "var(--sh-3)",
          paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
        }}
      >
        <p className="text-[14px] font-semibold text-ink">{titulo}</p>
        <p className="text-[12px] text-ink-2 mt-1.5 leading-relaxed">
          {descricao}
        </p>
        <div className="flex gap-2 mt-4">
          <Button className="flex-1 h-11 md:h-8" onClick={aoCancelar}>
            Manter
          </Button>
          <Button
            variant="danger"
            className="flex-1 h-11 md:h-8"
            onClick={aoConfirmar}
          >
            {rotuloAcao}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ══ Tela ════════════════════════════════════════════════════ */

export default function VendasLancamentos({ dados }: { dados: DadosLancamentos }) {
  const {
    ano: ANO,
    mesAtual: MES_ATUAL,
    diaAtual: DIA_ATUAL,
    serie,
  } = dados;

  const CANAIS_LANCAMENTO = React.useMemo(
    () => [
      // "Todos" não grava: um número lançado no consolidado não teria a que
      // canal pertencer, e a linha do banco é por conta de vendedor.
      { id: "todos", nome: "Todos os canais", contaCanalId: undefined },
      ...dados.canais.map((c) => ({
        id: c.id,
        nome: c.nome,
        contaCanalId: c.contaCanalId,
      })),
    ],
    [dados.canais]
  );
  const lancamentosDoMes = React.useCallback(
    (canal: CanalLancamentoId, mes: number): LancamentoDia[] => serie[canal]?.[mes] ?? [],
    [serie]
  );
  const metaDoMes = React.useCallback(
    (canal: CanalLancamentoId, mes: number) =>
      (serie[canal]?.[mes] ?? []).reduce((t, d) => t + d.metaDia, 0),
    [serie]
  );

  const [mes, setMes] = React.useState(MES_ATUAL);
  const [canal, setCanal] = React.useState<CanalLancamentoId>("ml");

  /** Já gravado no servidor — a linha de base depois de salvar. */
  const [salvos, setSalvos] = React.useState<Record<string, number>>({});
  /** Ainda só na tela — é o que o rodapé conta. */
  const [rascunho, setRascunho] = React.useState<Record<string, number>>({});

  const [confirmando, setConfirmando] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);

  const inputs = React.useRef(new Map<string, HTMLInputElement>());

  React.useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 2600);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const dias = React.useMemo(() => lancamentosDoMes(canal, mes), [canal, mes]);
  const meta = React.useMemo(() => metaDoMes(canal, mes), [canal, mes]);
  const nomeCanal =
    CANAIS_LANCAMENTO.find((c) => c.id === canal)?.nome ?? "Canal";

  /* ── linhas com valor efetivo e estado de cada célula ────── */

  const linhas = React.useMemo<Linha[]>(() => {
    return dias.map((base) => {
      const valores = {} as Record<CampoLancamento, number>;
      const estados = {} as Record<CampoLancamento, EstadoCelula>;

      for (const campo of CAMPOS_LANCAMENTO) {
        const k = chave(canal, mes, base.dia, campo);
        const salvo = salvos[k];
        const draft = rascunho[k];
        if (draft !== undefined) {
          valores[campo] = draft;
          estados[campo] = "rascunho";
        } else if (salvo !== undefined) {
          valores[campo] = salvo;
          estados[campo] = "salvo";
        } else {
          valores[campo] = base[campo];
          estados[campo] = "original";
        }
      }

      const receitaLiquida = valores.receita - valores.valorCancelado;
      const pedidosLiquidos = valores.pedidos - valores.pedidosCancelados;

      return {
        base,
        valores,
        estados,
        receitaLiquida,
        pedidosLiquidos,
        ticket: pedidosLiquidos > 0 ? receitaLiquida / pedidosLiquidos : 0,
      };
    });
  }, [dias, canal, mes, salvos, rascunho]);

  /* ── totais do mês ───────────────────────────────────────── */

  const total = React.useMemo(() => {
    const soma = {
      visitas: 0,
      receita: 0,
      pedidos: 0,
      ads: 0,
      pedidosCancelados: 0,
      valorCancelado: 0,
    } as Record<CampoLancamento, number>;

    let diasComMovimento = 0;
    for (const l of linhas) {
      for (const campo of CAMPOS_LANCAMENTO) soma[campo] += l.valores[campo];
      if (l.valores.receita > 0 || l.valores.pedidos > 0) diasComMovimento += 1;
    }

    const receitaLiquida = soma.receita - soma.valorCancelado;
    const pedidosLiquidos = soma.pedidos - soma.pedidosCancelados;

    return {
      ...soma,
      receitaLiquida,
      pedidosLiquidos,
      ticket: pedidosLiquidos > 0 ? receitaLiquida / pedidosLiquidos : 0,
      tacos: soma.receita > 0 ? (soma.ads / soma.receita) * 100 : 0,
      conversao: soma.visitas > 0 ? (soma.pedidos / soma.visitas) * 100 : 0,
      diasComMovimento,
      atingimento: meta > 0 ? (receitaLiquida / meta) * 100 : 0,
    };
  }, [linhas, meta]);

  const sparkReceita = React.useMemo(
    () =>
      linhas
        .filter((l) => l.valores.receita > 0)
        .map((l) => Math.round(l.valores.receita)),
    [linhas]
  );

  /* ── contagens de alteração ──────────────────────────────── */

  const pendentesTotal = Object.keys(rascunho).length;
  const prefixoAtual = `${canal}|${mes}|`;
  const pendentesAqui = Object.keys(rascunho).filter((k) =>
    k.startsWith(prefixoAtual)
  ).length;
  const pendentesFora = pendentesTotal - pendentesAqui;
  const salvosAqui = Object.keys(salvos).filter((k) =>
    k.startsWith(prefixoAtual)
  ).length;

  /* ── ações ───────────────────────────────────────────────── */

  function editar(dia: number, campo: CampoLancamento, valor: number) {
    const k = chave(canal, mes, dia, campo);
    const original =
      salvos[k] !== undefined
        ? salvos[k]
        : dias.find((d) => d.dia === dia)?.[campo] ?? 0;

    setRascunho((r) => {
      const proximo = { ...r };
      if (valor === original) delete proximo[k];
      else proximo[k] = valor;
      return proximo;
    });
  }

  const [gravando, setGravando] = React.useState(false);

  /**
   * Grava no banco.
   *
   * Antes isto só mexia em estado do React: o usuário digitava, via
   * "salvo", e perdia tudo ao recarregar. A tela existe justamente para
   * preencher o que a planilha não trouxe — perder o que foi digitado é o
   * pior desfecho possível dela.
   */
  async function salvar() {
    if (pendentesTotal === 0 || gravando) return;

    // As chaves do rascunho são "canal|mes|dia|campo". Reagrupa por dia,
    // porque a gravação é uma linha por dia.
    const porDia = new Map<string, Record<string, number>>();
    for (const [k, valor] of Object.entries(rascunho)) {
      const [canalK, mesK, diaK, campo] = k.split("|");
      const conta = CANAIS_LANCAMENTO.find((c) => c.id === canalK)?.contaCanalId;
      if (!conta) continue;
      const data = `${ANO}-${String(Number(mesK) + 1).padStart(2, "0")}-${String(diaK).padStart(2, "0")}`;
      const chaveDia = `${conta}|${data}`;
      const at = porDia.get(chaveDia) ?? {};
      // "ads" na tela é "investimentoAds" na rota.
      at[campo === "ads" ? "investimentoAds" : campo] = valor;
      porDia.set(chaveDia, at);
    }

    const edicoes = [...porDia.entries()].map(([k, campos]) => {
      const [contaCanalId, data] = k.split("|");
      return { contaCanalId, data, ...campos };
    });

    if (!edicoes.length) {
      setAviso("Escolha um canal com conta cadastrada para gravar");
      return;
    }

    setGravando(true);
    try {
      const r = await fetch("/api/lancamentos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edicoes }),
      });
      const corpo = await r.json();
      if (!r.ok) {
        setAviso(corpo.erro ?? "Não foi possível gravar");
        return;
      }
      setSalvos((s) => ({ ...s, ...rascunho }));
      setRascunho({});
      setAviso(
        `${edicoes.length} ${edicoes.length === 1 ? "dia gravado" : "dias gravados"}`
      );
    } catch {
      // Falha de rede não pode limpar o rascunho: o que foi digitado
      // continua na tela para tentar de novo.
      setAviso("Sem conexão — nada foi gravado, os valores seguem aqui");
    } finally {
      setGravando(false);
    }
  }

  function descartarRascunho() {
    if (pendentesTotal === 0) return;
    setRascunho({});
    setAviso("Alterações descartadas");
  }

  /** Volta o mês inteiro do canal aos números de origem. */
  function descartarMes() {
    setRascunho((r) => {
      const p = { ...r };
      for (const k of Object.keys(p)) if (k.startsWith(prefixoAtual)) delete p[k];
      return p;
    });
    setSalvos((s) => {
      const p = { ...s };
      for (const k of Object.keys(p)) if (k.startsWith(prefixoAtual)) delete p[k];
      return p;
    });
    setConfirmando(false);
    setAviso("Valores de origem restaurados");
  }

  function mover(dia: number, campo: CampoLancamento, passo: number) {
    const alvo = inputs.current.get(`${dia + passo}|${campo}`);
    if (alvo) {
      alvo.focus();
      alvo.select();
    }
  }

  const alteradoNoMes = pendentesAqui + salvosAqui;

  /* ── classes de fundo por linha e por célula ─────────────── */

  const fundoLinha = (l: Linha) => (l.base.fimDeSemana ? "bg-panel-2" : "bg-panel");

  /** Fundo da célula: só a alteração ainda não salva ganha lavagem. */
  const fundoCelula = (l: Linha, campo: CampoLancamento) =>
    l.estados[campo] === "rascunho" ? "bg-brand-wash" : fundoLinha(l);

  /**
   * Barra à esquerda da célula. Vai por estilo em vez de classe porque as
   * três variantes disputam a mesma propriedade — deixar a cascata decidir
   * pintava a barra errada dependendo da ordem do CSS gerado.
   */
  const corBarra = (l: Linha, campo: CampoLancamento) => {
    const estado = l.estados[campo];
    if (estado === "rascunho") return "var(--brand)";
    if (estado === "salvo") return "var(--info)";
    return "transparent";
  };

  return (
    <>
      <PageHeader
        title="Lançamentos"
        breadcrumb="Vendas"
        description="Um dia por linha. Digite o que veio da origem — o resto se recalcula sozinho."
        actions={
          <Button
            onClick={() => setConfirmando(true)}
            disabled={alteradoNoMes === 0}
            className="h-8"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Descartar alterações do mês</span>
            <span className="sm:hidden">Descartar mês</span>
          </Button>
        }
        filters={
          <>
            <div className="w-[148px] shrink-0">
              <Select
                aria-label="Mês"
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
              >
                {MESES_LONGOS.map((m, i) => (
                  <option key={m} value={i}>
                    {m} de {ANO}
                  </option>
                ))}
              </Select>
            </div>

            <div className="w-[176px] shrink-0">
              <Select
                aria-label="Canal"
                value={canal}
                onChange={(e) =>
                  setCanal(e.target.value as CanalLancamentoId)
                }
              >
                {CANAIS_LANCAMENTO.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </div>

            <span className="text-[12px] text-ink-3 shrink-0 hidden md:block">
              {alteradoNoMes > 0 ? (
                <>
                  <span className="num">{count(alteradoNoMes)}</span> célula
                  {alteradoNoMes === 1 ? "" : "s"} fora do valor de origem
                </>
              ) : (
                "Todos os valores deste mês vêm da origem"
              )}
            </span>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Receita bruta do mês"
            value={total.receita > 0 ? money(total.receita) : "—"}
            hint={`meta ${moneyShort(meta)}`}
            spark={sparkReceita.length > 1 ? sparkReceita : undefined}
          />
          <StatTile
            label="Receita líquida"
            value={total.receitaLiquida > 0 ? money(total.receitaLiquida) : "—"}
            delta={meta > 0 ? total.atingimento - 100 : undefined}
            hint="da meta do mês"
          />
          <StatTile
            label="Pedidos líquidos"
            value={count(total.pedidosLiquidos)}
            hint={`${count(total.pedidosCancelados)} cancelados · ticket ${
              total.ticket > 0 ? money(total.ticket) : "—"
            }`}
          />
          <StatTile
            label="TACOS"
            value={total.receita > 0 ? pct(total.tacos, 2) : "—"}
            inverse
            hint={`ADS ${moneyShort(total.ads)} sobre a receita`}
          />
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader
            title={`${MESES_LONGOS[mes]} · ${nomeCanal}`}
            hint={`${dias.length} dias · ${total.diasComMovimento} com movimento`}
            action={
              aviso ? (
                <Badge tone="up">{aviso}</Badge>
              ) : (
                <span className="num text-[12px] text-ink-3">
                  {mes === MES_ATUAL ? `lançado até ${DIA_ATUAL}` : ""}
                </span>
              )
            }
          />

          {/* legenda das marcações da grade */}
          <div className="flex items-center gap-4 px-4 h-8 border-b border-line overflow-x-auto">
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-brand" />
              <span className="text-[11px] text-ink-2 whitespace-nowrap">
                não salvo
              </span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-info" />
              <span className="text-[11px] text-ink-2 whitespace-nowrap">
                salvo, diferente da origem
              </span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-panel-2 border border-line-2" />
              <span className="text-[11px] text-ink-2 whitespace-nowrap">
                fim de semana
              </span>
            </span>
            <span className="text-[11px] text-ink-3 whitespace-nowrap shrink-0 ml-auto hidden lg:block">
              Enter ou seta desce para o dia seguinte
            </span>
          </div>

          {/* grade — aqui o rolamento lateral é intencional */}
          <div className="overflow-auto max-h-[62vh]">
            <table
              className="w-full border-separate border-spacing-0 text-[13px]"
              style={{ minWidth: LARGURA_MINIMA }}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    style={{ width: LARGURA_DATA, minWidth: LARGURA_DATA }}
                    className="sticky top-0 left-0 z-30 bg-panel-3 h-9 px-3 text-left font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap border-b border-r border-line"
                  >
                    Data
                  </th>
                  {COLUNAS.map((c) => (
                    <th
                      key={c.campo}
                      scope="col"
                      style={{
                        width: c.largura,
                        minWidth: c.largura,
                        borderLeftColor: "transparent",
                      }}
                      className="sticky top-0 z-20 bg-panel-3 h-9 px-3 text-right font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap border-b border-l-2 border-line"
                    >
                      {c.titulo}
                    </th>
                  ))}
                  <th
                    scope="col"
                    style={{ width: 140, minWidth: 140 }}
                    className="sticky top-0 z-20 bg-panel-3 h-9 px-3 text-right font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap border-b border-l border-line"
                  >
                    Receita líq.
                  </th>
                  <th
                    scope="col"
                    style={{ width: 112, minWidth: 112 }}
                    className="sticky top-0 z-20 bg-panel-3 h-9 px-3 text-right font-semibold text-[11px] uppercase tracking-[0.04em] text-ink-3 whitespace-nowrap border-b border-line"
                  >
                    Ticket
                  </th>
                </tr>
              </thead>

              <tbody>
                {linhas.map((l) => {
                  const fundo = fundoLinha(l);
                  return (
                    <tr key={l.base.data}>
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 ${fundo} px-3 text-left font-normal border-b border-r border-line`}
                      >
                        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                          <span className="num text-[13px] text-ink font-medium">
                            {String(l.base.dia).padStart(2, "0")}/
                            {String(mes + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={
                              "text-[11px] " +
                              (l.base.fimDeSemana ? "text-warn" : "text-ink-3")
                            }
                          >
                            {l.base.rotuloDiaSemana}
                          </span>
                        </span>
                      </th>

                      {COLUNAS.map((c) => (
                        <td
                          key={c.campo}
                          style={{ borderLeftColor: corBarra(l, c.campo) }}
                          className={`px-1 border-b border-l-2 ${fundoCelula(l, c.campo)}`}
                        >
                          <CelulaNumerica
                            valor={l.valores[c.campo]}
                            tipo={c.tipo}
                            rotulo={`${c.titulo} em ${l.base.dia}/${mes + 1}`}
                            registrar={(el) => {
                              const k = `${l.base.dia}|${c.campo}`;
                              if (el) inputs.current.set(k, el);
                              else inputs.current.delete(k);
                            }}
                            aoConfirmar={(v) => editar(l.base.dia, c.campo, v)}
                            aoMover={(passo) => mover(l.base.dia, c.campo, passo)}
                          />
                        </td>
                      ))}

                      <td
                        className={`px-3 text-right border-b border-l border-line ${fundo}`}
                      >
                        {l.receitaLiquida !== 0 ? (
                          <span
                            className={
                              "num " +
                              (l.receitaLiquida < 0
                                ? "text-down font-semibold"
                                : "text-ink")
                            }
                          >
                            {money(l.receitaLiquida)}
                          </span>
                        ) : (
                          <Vazio />
                        )}
                      </td>

                      <td className={`px-3 text-right border-b border-line ${fundo}`}>
                        {l.ticket > 0 ? (
                          <span className="num text-ink-2">{money(l.ticket)}</span>
                        ) : (
                          <Vazio />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <th
                    scope="row"
                    className="sticky bottom-0 left-0 z-30 bg-panel-3 px-3 h-11 md:h-9 text-left border-t border-r border-line"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink">
                      Total
                    </span>
                  </th>
                  {COLUNAS.map((c) => (
                    <td
                      key={c.campo}
                      style={{ borderLeftColor: "transparent" }}
                      className="sticky bottom-0 z-20 bg-panel-3 px-3 text-right border-t border-l-2 border-line"
                    >
                      <span className="num text-[13px] font-semibold text-ink">
                        {c.tipo === "moeda"
                          ? money(total[c.campo])
                          : count(total[c.campo])}
                      </span>
                    </td>
                  ))}
                  <td className="sticky bottom-0 z-20 bg-panel-3 px-3 text-right border-t border-l border-line">
                    <span className="num text-[13px] font-semibold text-ink">
                      {money(total.receitaLiquida)}
                    </span>
                  </td>
                  <td className="sticky bottom-0 z-20 bg-panel-3 px-3 text-right border-t border-line">
                    <span className="num text-[13px] font-semibold text-ink">
                      {total.ticket > 0 ? money(total.ticket) : "—"}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 h-auto py-2.5 border-t border-line">
            <span className="text-[11px] text-ink-3">
              Conversão do mês{" "}
              <span className="num text-ink-2">
                {total.visitas > 0 ? pct(total.conversao, 2) : "—"}
              </span>
            </span>
            <span className="text-[11px] text-ink-3">
              TACOS{" "}
              <span className="num text-ink-2">
                {total.receita > 0 ? pct(total.tacos, 2) : "—"}
              </span>
            </span>
            <span className="text-[11px] text-ink-3">
              Cancelamento{" "}
              <span className="num text-ink-2">
                {total.receita > 0
                  ? pct((total.valorCancelado / total.receita) * 100, 2)
                  : "—"}
              </span>
            </span>
            <span className="text-[11px] text-ink-3">
              Atingimento{" "}
              <span className="num text-ink-2">
                {meta > 0 ? pct(total.atingimento, 1) : "—"}
              </span>
            </span>
          </div>
        </Panel>

        {/* barra de alterações — acompanha a rolagem */}
        {pendentesTotal > 0 && (
          <div className="sticky bottom-[72px] md:bottom-4 z-30">
            <div
              className="panel panel-2 flex items-center gap-2 md:gap-3 px-3 py-2"
              style={{ boxShadow: "var(--sh-3)" }}
            >
              <span className="w-2 h-2 rounded-full bg-warn shrink-0" />
              <span className="min-w-0 flex-1 text-[13px] text-ink truncate">
                <span className="num font-semibold">{count(pendentesTotal)}</span>{" "}
                {pendentesTotal === 1
                  ? "alteração não salva"
                  : "alterações não salvas"}
                {pendentesFora > 0 && (
                  <span className="text-ink-3 hidden sm:inline">
                    {" "}
                    · <span className="num">{count(pendentesFora)}</span> em
                    outro mês ou canal
                  </span>
                )}
              </span>
              <Button
                className="h-11 md:h-8 shrink-0"
                onClick={descartarRascunho}
                disabled={gravando}
              >
                Descartar
              </Button>
              <Button
                variant="primary"
                className="h-11 md:h-8 shrink-0"
                onClick={salvar}
                disabled={gravando}
              >
                {gravando ? "Gravando…" : "Salvar"}
              </Button>
            </div>
          </div>
        )}
      </PageBody>

      {confirmando && (
        <Confirmacao
          titulo="Descartar alterações do mês?"
          descricao={`${alteradoNoMes} ${
            alteradoNoMes === 1 ? "célula volta" : "células voltam"
          } ao valor de origem em ${MESES_LONGOS[mes]} de ${ANO}, no canal ${nomeCanal}. Não dá para desfazer.`}
          rotuloAcao="Descartar"
          aoCancelar={() => setConfirmando(false)}
          aoConfirmar={descartarMes}
        />
      )}
    </>
  );
}
