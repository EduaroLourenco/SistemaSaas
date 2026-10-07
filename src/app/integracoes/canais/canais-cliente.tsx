"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { Cadastro, type Coluna, type CampoForm } from "@/components/financeiro/cadastro";
import type { Canal, ContaCanal, Erp } from "@/lib/dados/canais";
import { ErpPainel } from "./erp-painel";

/** Canais que a plataforma lê por API. O resto entra por planilha. */
const COM_API = new Set(["mercado_livre", "vtex"]);

const TIPOS = [
  { valor: "marketplace", rotulo: "Marketplace" },
  { valor: "loja_propria", rotulo: "Loja própria" },
  { valor: "atacado", rotulo: "Atacado" },
  { valor: "outro", rotulo: "Outro" },
];

export default function CanaisCliente({
  canais,
  contas,
  erp,
  abaInicial,
  faltaMigracao,
}: {
  canais: Canal[];
  contas: ContaCanal[];
  erp: Erp | null;
  abaInicial: "contas" | "canais" | "erp";
  faltaMigracao: string | null;
}) {
  const [aba, setAba] = React.useState<"contas" | "canais" | "erp">(abaInicial);

  const quando = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso))
      : null;

  /* ── Contas de canal ──────────────────────────────────────── */

  const camposConta: CampoForm[] = [
    {
      chave: "canalId",
      rotulo: "Canal",
      tipo: "select",
      obrigatorio: true,
      largo: true,
      opcoes: canais
        .filter((c) => c.ativo)
        .map((c) => ({ valor: c.id, rotulo: c.nome })),
      dica: "Não achou o canal? Cadastre-o na aba Canais primeiro.",
    },
    {
      chave: "nome",
      rotulo: "Nome da conta",
      tipo: "texto",
      obrigatorio: true,
      largo: true,
      dica: 'Como você chama esta conta. Ex.: "São Paulo — pronta entrega".',
    },
    {
      chave: "identificador",
      rotulo: "Id do vendedor no canal",
      tipo: "texto",
      dica:
        "No Mercado Livre deixe em branco: a conexão preenche sozinha, e é " +
        "ela que impede o catálogo de uma conta cair na outra.",
    },
    {
      chave: "apelidos",
      rotulo: "Apelidos nas planilhas",
      tipo: "texto",
      largo: true,
      dica: "Separados por vírgula. Como esta conta aparece nos arquivos importados.",
    },
    { chave: "reputacao", rotulo: "Reputação", tipo: "texto", dica: "verde, amarelo…" },
    { chave: "fulfillment", rotulo: "Opera no Full", tipo: "booleano" },
    {
      chave: "padrao",
      rotulo: "Conta padrão do canal",
      tipo: "booleano",
      dica: "Só uma por canal. É a que as telas escolhem quando ninguém diz qual.",
    },
    { chave: "ativa", rotulo: "Ativa", tipo: "booleano", padrao: true },
  ];

  const colunasConta: Coluna<ContaCanal>[] = [
    {
      chave: "nome",
      titulo: "Conta",
      render: (c) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-ink font-medium truncate">{c.nome}</span>
          <span className="text-[12px] text-ink-3">{c.canalNome}</span>
        </div>
      ),
    },
    {
      chave: "identificador",
      titulo: "Id no canal",
      render: (c) =>
        c.identificador ? (
          <span className="num text-[12.5px] text-ink-2">{c.identificador}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      chave: "apelidos",
      titulo: "Apelidos",
      render: (c) =>
        c.apelidos.length ? (
          <span className="text-[12px] text-ink-2 truncate">{c.apelidos.join(", ")}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      chave: "conexao",
      titulo: "API",
      render: (c) => {
        /*
         * O GA4 mede o SITE, então vale para toda loja própria — VTEX ou
         * não. Fica numa linha à parte porque é outra integração: a loja
         * pode ter pedido por planilha e visita pelo Google ao mesmo tempo.
         */
        const ga4 = c.canalTipo === "loja_propria" && (
          <div className="flex flex-col gap-0.5 items-start mt-1.5 pt-1.5 border-t border-line w-full">
            <span className="text-[12px] text-ink-3">Google Analytics</span>
            {c.ga4 && (
              <Badge tone={c.ga4.erro ? "down" : c.ga4.conectada && c.ga4.propriedade ? "up" : "warn"}>
                {c.ga4.erro
                  ? "Com erro"
                  : !c.ga4.conectada
                    ? "Não conectado"
                    : c.ga4.propriedade ?? "Falta escolher a propriedade"}
              </Badge>
            )}
            <a
              href={`/api/ga4/conectar?conta=${c.id}`}
              className="text-[12px] font-medium text-brand hover:underline"
            >
              {c.ga4?.conectada ? "Reconectar" : "Conectar Google Analytics"}
            </a>
            {quando(c.ga4?.sincronizadaEm ?? null) && (
              <span className="num text-[12px] text-ink-3">sync {quando(c.ga4?.sincronizadaEm ?? null)}</span>
            )}
          </div>
        );
        if (!COM_API.has(c.canalCodigo)) {
          return (
            <div className="flex flex-col items-start">
              <span className="text-[12px] text-ink-3">por planilha</span>
              {ga4}
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-0.5 items-start">
            <Badge tone={c.ultimoErro ? "down" : c.conectada ? "up" : "neutral"}>
              {c.ultimoErro ? "Com erro" : c.conectada ? "Conectada" : "Não conectada"}
            </Badge>
            {c.canalCodigo === "mercado_livre" && (
              <Link
                href={`/api/meli/conectar?conta=${c.id}`}
                className="text-[12px] font-medium text-brand hover:underline"
              >
                {c.conectada ? "Reconectar" : "Conectar"}
              </Link>
            )}
            {quando(c.sincronizadaEm) && (
              <span className="num text-[12px] text-ink-3">
                sync {quando(c.sincronizadaEm)}
              </span>
            )}
            {ga4}
          </div>
        );
      },
    },
    {
      chave: "situacao",
      titulo: "Situação",
      render: (c) => (
        <div className="flex items-center gap-1.5">
          {c.padrao && <Badge tone="neutral">Padrão</Badge>}
          {c.fulfillment && <Badge tone="neutral">Full</Badge>}
          {!c.ativa && <Badge tone="warn">Inativa</Badge>}
        </div>
      ),
    },
  ];

  /* ── Canais ───────────────────────────────────────────────── */

  const camposCanal: CampoForm[] = [
    {
      chave: "nome",
      rotulo: "Nome",
      tipo: "texto",
      obrigatorio: true,
      largo: true,
      dica: 'Como aparece nas telas. Ex.: "Mercado Livre".',
    },
    {
      chave: "codigo",
      rotulo: "Código",
      tipo: "texto",
      obrigatorio: true,
      dica:
        "Sem espaço nem acento: mercado_livre, magalu, shopee. É por ele que a " +
        "plataforma sabe se o canal tem API.",
    },
    { chave: "tipo", rotulo: "Tipo", tipo: "select", obrigatorio: true, opcoes: TIPOS },
    {
      chave: "apelidos",
      rotulo: "Apelidos nas planilhas",
      tipo: "texto",
      largo: true,
      dica: "Separados por vírgula. O que não casar com nenhum apelido é recusado na importação, nunca jogado em Outros.",
    },
    { chave: "ordem", rotulo: "Ordem", tipo: "numero", dica: "Posição nas listas." },
    {
      chave: "corSerie",
      rotulo: "Cor",
      tipo: "numero",
      dica: "1 a 10 — a cor deste canal nos gráficos.",
    },
    { chave: "ativo", rotulo: "Ativo", tipo: "booleano", padrao: true },
  ];

  const contasPorCanal = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contas) m.set(c.canalId, (m.get(c.canalId) ?? 0) + 1);
    return m;
  }, [contas]);

  const colunasCanal: Coluna<Canal>[] = [
    {
      chave: "nome",
      titulo: "Canal",
      render: (c) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-ink font-medium truncate">{c.nome}</span>
          <span className="num text-[12px] text-ink-3">{c.codigo}</span>
        </div>
      ),
    },
    {
      chave: "tipo",
      titulo: "Tipo",
      render: (c) => (
        <span className="text-[12.5px] text-ink-2">
          {TIPOS.find((t) => t.valor === c.tipo)?.rotulo ?? c.tipo}
        </span>
      ),
    },
    {
      chave: "api",
      titulo: "API",
      render: (c) =>
        COM_API.has(c.codigo) ? (
          <Badge tone="up">Lê por API</Badge>
        ) : (
          <span className="text-[12px] text-ink-3">por planilha</span>
        ),
    },
    {
      chave: "contas",
      titulo: "Contas",
      numerica: true,
      render: (c) => {
        const n = contasPorCanal.get(c.id) ?? 0;
        return n > 0 ? (
          <span className="num text-ink-2">{n}</span>
        ) : (
          <span className="text-ink-3">—</span>
        );
      },
    },
    {
      chave: "ativo",
      titulo: "Situação",
      render: (c) =>
        c.ativo ? (
          <span className="text-ink-3 text-[12px]">Ativo</span>
        ) : (
          <Badge tone="warn">Inativo</Badge>
        ),
    },
  ];

  const abas = (
    <div className="flex items-center gap-1 p-0.5 rounded-r2 border border-line bg-panel w-fit">
      {(
        [
          ["contas", `Contas de venda (${contas.length})`],
          ["canais", `Canais (${canais.length})`],
          ["erp", "ERP"],
        ] as const
      ).map(([chave, rotulo]) => (
        <button
          key={chave}
          type="button"
          onClick={() => setAba(chave)}
          className={
            "px-3 py-1.5 rounded-r1 text-[12.5px] font-medium transition-colors " +
            (aba === chave
              ? "bg-brand/10 text-brand"
              : "text-ink-2 hover:text-ink hover:bg-line/40")
          }
        >
          {rotulo}
        </button>
      ))}
    </div>
  );

  if (aba === "erp") {
    return (
      <div className="flex flex-col gap-4">
        {abas}
        <ErpPainel erp={erp} contas={contas} quando={quando} />
      </div>
    );
  }

  if (aba === "canais") {
    return (
      <Cadastro<Canal>
        recurso="canais"
        titulo="Canais"
        singular="Canal"
        linhas={canais}
        colunas={colunasCanal}
        campos={camposCanal}
        faltaMigracao={faltaMigracao}
        busca={(c) => `${c.nome} ${c.codigo} ${c.apelidos.join(" ")}`}
        paraForm={(c) => ({
          nome: c.nome,
          codigo: c.codigo,
          tipo: c.tipo,
          apelidos: c.apelidos.join(", "),
          ordem: c.ordem,
          corSerie: c.corSerie,
          ativo: c.ativo,
        })}
        vazio={{
          titulo: "Nenhum canal",
          descricao: "Cadastre onde a empresa vende; depois as contas de cada canal.",
        }}
        resumo={abas}
      />
    );
  }

  return (
    <Cadastro<ContaCanal>
      recurso="contas-canal"
      titulo="Contas de venda"
      singular="Conta"
      linhas={contas}
      colunas={colunasConta}
      campos={camposConta}
      faltaMigracao={faltaMigracao}
      busca={(c) =>
        `${c.nome} ${c.canalNome} ${c.identificador ?? ""} ${c.apelidos.join(" ")}`
      }
      paraForm={(c) => ({
        canalId: c.canalId,
        nome: c.nome,
        identificador: c.identificador,
        apelidos: c.apelidos.join(", "),
        reputacao: c.reputacao,
        fulfillment: c.fulfillment,
        padrao: c.padrao,
        ativa: c.ativa,
      })}
      vazio={{
        titulo: "Nenhuma conta de venda",
        descricao:
          "Um canal pode ter mais de uma conta. Separá-las é o que permite ver margem por conta.",
      }}
      resumo={abas}
    />
  );
}
