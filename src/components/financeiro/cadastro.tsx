"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Panel, Button, Badge, EmptyState } from "@/components/ui/primitives";
import { Sheet, Input, Select, Field } from "@/components/ui/controls";
import { Plus, Pencil, Trash2, AlertTriangle, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lista + formulário, para os quatro cadastros do financeiro.
 *
 * Categorias, fornecedores, funcionários e contas têm a mesma mecânica:
 * ver, criar, editar, apagar. O que muda é a lista de campos e as colunas
 * da tabela — e é só isso que cada tela declara.
 *
 * O formulário fica numa folha lateral, não numa página nova: quem
 * cadastra fornecedor cadastra seis seguidos, e voltar para a lista a
 * cada um dobra o número de cliques.
 */

export type TipoCampo =
  | "texto"
  | "numero"
  | "dinheiro"
  | "data"
  | "select"
  | "booleano"
  | "textarea";

export type CampoForm = {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  /** Ocupa a linha inteira do formulário. */
  largo?: boolean;
  obrigatorio?: boolean;
  dica?: string;
  opcoes?: { valor: string; rotulo: string }[];
  /** Sugestão inicial num registro novo. */
  padrao?: string | number | boolean;
  /** Esconde o campo conforme o que já foi preenchido. */
  visivel?: (v: Registro) => boolean;
};

export type Coluna<T> = {
  chave: string;
  titulo: string;
  /** Alinha à direita e usa fonte tabular. */
  numerica?: boolean;
  largura?: number;
  render: (linha: T) => React.ReactNode;
};

export type Registro = Record<string, unknown>;

type Props<T extends { id: string }> = {
  recurso: string;
  titulo: string;
  /** Singular, para os textos de botão e confirmação. */
  singular: string;
  linhas: T[];
  colunas: Coluna<T>[];
  campos: CampoForm[];
  /** Converte a linha carregada nos valores do formulário. */
  paraForm: (linha: T) => Registro;
  /** Texto pesquisável da linha. */
  busca: (linha: T) => string;
  vazio: { titulo: string; descricao: string };
  faltaMigracao?: string | null;
  /** Renderizado acima da tabela — totais, filtros extras. */
  resumo?: React.ReactNode;
  /** Campo extra no rodapé da folha, ao lado dos botões. */
  extraFooter?: (v: Registro, set: (k: string, valor: unknown) => void) => React.ReactNode;
  /** Corpo do POST, quando a tela precisa mandar algo além dos campos. */
  aoGravar?: (v: Registro) => Record<string, unknown>;
};

export function Cadastro<T extends { id: string }>({
  recurso,
  titulo,
  singular,
  linhas,
  colunas,
  campos,
  paraForm,
  busca,
  vazio,
  faltaMigracao,
  resumo,
  extraFooter,
  aoGravar,
}: Props<T>) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState<null | { id?: string }>(null);
  const [valores, setValores] = React.useState<Registro>({});
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [confirmar, setConfirmar] = React.useState<T | null>(null);
  const [filtro, setFiltro] = React.useState("");

  const visiveis = React.useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter((l) => busca(l).toLowerCase().includes(q));
  }, [linhas, filtro, busca]);

  function novo() {
    const iniciais: Registro = {};
    for (const c of campos) {
      if (c.padrao !== undefined) iniciais[c.chave] = c.padrao;
    }
    setValores(iniciais);
    setErro(null);
    setAviso(null);
    setAberto({});
  }

  function editar(linha: T) {
    setValores(paraForm(linha));
    setErro(null);
    setAviso(null);
    setAberto({ id: linha.id });
  }

  function set(chave: string, valor: unknown) {
    setValores((v) => ({ ...v, [chave]: valor }));
  }

  async function gravar() {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const dados = aoGravar ? aoGravar(valores) : valores;
      const r = await fetch(`/api/financeiro/${recurso}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: aberto?.id, dados, replicar: valores.__replicar === true }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j.erro ?? "Não consegui gravar.");
        return;
      }
      if (j.aviso) {
        setAviso(j.aviso);
        router.refresh();
        return;
      }
      setAberto(null);
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(linha: T, comFilhas: boolean) {
    setSalvando(true);
    try {
      const q = new URLSearchParams({ id: linha.id });
      if (comFilhas) q.set("filhas", "1");
      const r = await fetch(`/api/financeiro/${recurso}?${q}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) {
        setErro(j.erro ?? "Não consegui apagar.");
        return;
      }
      setConfirmar(null);
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {faltaMigracao && (
        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-r2 border border-warn/40 bg-warn/10">
          <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-ink-2 leading-relaxed">{faltaMigracao}</p>
        </div>
      )}

      {resumo}

      <Panel>
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
            <Input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder={`Buscar ${singular.toLowerCase()}`}
              className="pl-8"
            />
          </div>
          <span className="text-[11px] text-ink-3 num">
            {visiveis.length} {visiveis.length === 1 ? "linha" : "linhas"}
          </span>
          <div className="ml-auto">
            <Button onClick={novo}>
              <Plus className="w-3.5 h-3.5" />
              Novo
            </Button>
          </div>
        </div>

        {visiveis.length === 0 ? (
          <div className="p-6">
            <EmptyState title={vazio.titulo} description={vazio.descricao} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  {colunas.map((c) => (
                    <th
                      key={c.chave}
                      className={cn(
                        "label px-3 py-2 font-medium whitespace-nowrap",
                        c.numerica ? "text-right" : "text-left"
                      )}
                      style={c.largura ? { width: c.largura } : undefined}
                    >
                      {c.titulo}
                    </th>
                  ))}
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-line last:border-0 hover:bg-panel-2 transition-colors"
                  >
                    {colunas.map((c) => (
                      <td
                        key={c.chave}
                        className={cn(
                          "px-3 py-2 align-middle",
                          c.numerica ? "text-right num whitespace-nowrap" : ""
                        )}
                      >
                        {c.render(l)}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => editar(l)}
                          title="Editar"
                          className="w-7 h-7 flex items-center justify-center rounded-r1 text-ink-3 hover:bg-panel-3 hover:text-ink transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmar(l)}
                          title="Apagar"
                          className="w-7 h-7 flex items-center justify-center rounded-r1 text-ink-3 hover:bg-down/15 hover:text-down transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {aberto && (
        <Sheet
          title={aberto.id ? `Editar ${singular.toLowerCase()}` : `Nova ${singular.toLowerCase()}`}
          subtitle={titulo}
          onClose={() => setAberto(null)}
          width="560px"
          footer={
            <>
              <Button variant="primary" onClick={gravar} disabled={salvando}>
                {salvando ? "Gravando…" : "Gravar"}
              </Button>
              <Button onClick={() => setAberto(null)}>Cancelar</Button>
              {extraFooter?.(valores, set)}
            </>
          }
        >
          <div className="p-4 grid grid-cols-2 gap-3">
            {campos
              .filter((c) => !c.visivel || c.visivel(valores))
              .map((c) => (
                <Field
                  key={c.chave}
                  label={c.obrigatorio ? `${c.rotulo} *` : c.rotulo}
                  hint={c.dica}
                  className={c.largo ? "col-span-2" : ""}
                >
                  <CampoEntrada
                    campo={c}
                    valor={valores[c.chave]}
                    onChange={(v) => set(c.chave, v)}
                  />
                </Field>
              ))}

            {erro && (
              <p className="col-span-2 text-[12px] text-down leading-relaxed">{erro}</p>
            )}
            {aviso && (
              <p className="col-span-2 text-[12px] text-warn leading-relaxed">{aviso}</p>
            )}
          </div>
        </Sheet>
      )}

      {confirmar && (
        <Sheet
          title={`Apagar ${singular.toLowerCase()}?`}
          onClose={() => setConfirmar(null)}
          width="420px"
          footer={
            <>
              <Button variant="danger" onClick={() => apagar(confirmar, true)} disabled={salvando}>
                {salvando ? "Apagando…" : "Apagar"}
              </Button>
              <Button onClick={() => setConfirmar(null)}>Cancelar</Button>
            </>
          }
        >
          <div className="p-4 flex flex-col gap-2">
            <p className="text-[13px] text-ink leading-relaxed">
              {busca(confirmar).split("\n")[0]}
            </p>
            <p className="text-[12px] text-ink-3 leading-relaxed">
              Isso não pode ser desfeito. Se houver ocorrências futuras geradas por
              recorrência, as que ainda não foram pagas somem junto; as pagas ficam,
              porque já aconteceram.
            </p>
            {erro && <p className="text-[12px] text-down">{erro}</p>}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function CampoEntrada({
  campo,
  valor,
  onChange,
}: {
  campo: CampoForm;
  valor: unknown;
  onChange: (v: unknown) => void;
}) {
  if (campo.tipo === "select") {
    return (
      <Select
        value={(valor as string) ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">—</option>
        {campo.opcoes?.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </Select>
    );
  }

  if (campo.tipo === "booleano") {
    return (
      <Select
        value={valor === false ? "nao" : "sim"}
        onChange={(e) => onChange(e.target.value === "sim")}
      >
        <option value="sim">Sim</option>
        <option value="nao">Não</option>
      </Select>
    );
  }

  if (campo.tipo === "textarea") {
    return (
      <textarea
        value={(valor as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="px-2.5 py-1.5 rounded-r1 border border-line bg-panel text-[13px] text-ink w-full resize-y focus:border-brand transition-colors"
      />
    );
  }

  return (
    <Input
      type={campo.tipo === "data" ? "date" : campo.tipo === "texto" ? "text" : "number"}
      inputMode={campo.tipo === "dinheiro" ? "decimal" : undefined}
      step={campo.tipo === "dinheiro" ? "0.01" : campo.tipo === "numero" ? "1" : undefined}
      value={(valor as string | number) ?? ""}
      onChange={(e) =>
        onChange(
          campo.tipo === "texto" || campo.tipo === "data"
            ? e.target.value
            : e.target.value === ""
              ? null
              : Number(e.target.value)
        )
      }
    />
  );
}

/** Etiqueta de situação, igual nas quatro telas. */
export function StatusBadge({ status }: { status: string }) {
  const mapa: Record<string, { rotulo: string; tom: "up" | "down" | "warn" | "neutral" }> = {
    previsto: { rotulo: "Previsto", tom: "neutral" },
    em_aberto: { rotulo: "Em aberto", tom: "warn" },
    pago: { rotulo: "Pago", tom: "up" },
    atrasado: { rotulo: "Atrasado", tom: "down" },
    cancelado: { rotulo: "Cancelado", tom: "neutral" },
  };
  const m = mapa[status] ?? { rotulo: status, tom: "neutral" as const };
  return <Badge tone={m.tom}>{m.rotulo}</Badge>;
}
