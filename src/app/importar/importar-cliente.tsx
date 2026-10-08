"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, PanelHeader, Button, Badge } from "@/components/ui/primitives";
import { FileDrop } from "@/components/ui/controls";
import { Leitura, TudoCerto, ErroComSaida } from "@/components/ui/leitura";
import { Metrica } from "@/components/ui/metrica";
import { count } from "@/lib/format";
import { clienteNavegador } from "@/lib/supabase/navegador";
import {
  FileSpreadsheet,
  Loader2,
  Plug,
  Database,
  PenLine,
  ArrowRight,
  BookOpen,
  ShieldAlert,
  CalendarDays,
  Upload,
} from "lucide-react";

/**
 * Uma tela para as três planilhas.
 *
 * O formato é detectado pela estrutura do arquivo, não pelo nome — nome é
 * a primeira coisa que muda ("Relatorio (1).xlsx") e uma regra baseada
 * nele falha meses depois, quando ninguém lembra que a regra existia.
 *
 * A tela nunca importa direto. Primeiro mostra o que ACONTECERIA: quantas
 * linhas, qual período, quais canais reconhecidos, o que ficou de fora.
 * Importação que só conta o estrago depois é importação que se desfaz na
 * mão.
 */

type Previa = {
  tipo: "desempenho" | "pedidos" | "catalogo" | "vendas_ml" | "ads_ml" | "desconhecido";
  evidencia: string;
  nomeArquivo: string;
  jaImportado: { em: string; linhas: number } | null;
  periodo: { inicio: string | null; fim: string | null };
  linhas: number;
  novas: number;
  atualizadas: number;
  reconhecidos: {
    canal: string;
    conta: string;
    linhas: number;
    mostrarConta: boolean;
  }[];
  naoReconhecidos: { marketplace: string; conta: string; linhas: number }[];
  orfaos: { descricao: string; exemplos: string[]; total: number }[];
  avisos: string[];
  contasDisponiveis: { id: string; nome: string }[];
};

const ROTULO: Record<Previa["tipo"], string> = {
  desempenho: "Desempenho de anúncios",
  pedidos: "Pedidos",
  catalogo: "Catálogo de anúncios",
  vendas_ml: "Vendas e tarifas do Mercado Livre",
  ads_ml: "Anúncios patrocinados (Ads)",
  desconhecido: "Formato não reconhecido",
};

const OQUE_ALIMENTA: Record<string, string> = {
  desempenho: "visitas, vendas e conversão por anúncio",
  pedidos: "faturamento, comissão e frete por canal e por SKU",
  catalogo: "preço de vitrine, tarifa, tipo e estoque dos anúncios",
  vendas_ml:
    "a tarifa que o Meli cobrou de verdade, o desconto de campanha e o juro do parcelamento",
  ads_ml:
    "investimento, cliques e ACOS por anúncio e por campanha de Product Ads",
};

function dataBr(iso: string | null) {
  return iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "—";
}

/**
 * Acima disto o arquivo não passa pelo servidor.
 *
 * A Vercel corta o corpo da requisição em 4,5 MB e o limite não é
 * configurável. Fica bem abaixo porque o `multipart` embrulha o arquivo
 * e o que trafega é maior que ele.
 */
const LIMITE_DIRETO = 3 * 1024 * 1024;

/**
 * Sobe ao Storage e devolve o caminho.
 *
 * A primeira pasta é o id da operação — é o que o RLS lê para decidir se
 * você pode escrever. Caminho fora desse formato é recusado pelo banco,
 * não por uma checagem daqui que alguém poderia esquecer.
 */
async function enviarAoStorage(
  arquivo: File,
  operacaoId: string
): Promise<string> {
  const sb = clienteNavegador();
  const carimbo = Date.now();
  const limpo = arquivo.name.replace(/[^A-Za-z0-9._-]+/g, "_");
  const caminho = `${operacaoId}/${carimbo}-${limpo}`;

  const { error } = await sb.storage
    .from("importacoes")
    .upload(caminho, arquivo, { upsert: false });

  if (error) throw new Error(`Falha ao enviar o arquivo: ${error.message}`);
  return caminho;
}

/**
 * Descobre a operação pelo servidor, não por conta própria.
 *
 * A regra é "a que tem mais canais", e já mordeu uma vez: pegar a
 * primeira em ordem alfabética levava a uma operação sem canal nenhum, e
 * toda importação era recusada por "canal desconhecido". Mantendo a regra
 * num lugar só, front e back não discordam.
 */
async function descobrirOperacao(): Promise<string | null> {
  try {
    const r = await fetch("/api/operacao");
    if (!r.ok) return null;
    return (await r.json()).id ?? null;
  } catch {
    return null;
  }
}

function safeJson(t: string): { erro?: string } | null {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** De onde o dado já entra — contado no servidor, sob RLS. */
export type Origens = { contasApi: number; erpConectado: boolean };
export type Importacao = {
  id: string;
  tipo: string;
  nome_arquivo: string;
  linhas_lidas: number;
  linhas_validas: number;
  status: "na_fila" | "executando" | "concluida" | "falhou";
  erro: string | null;
  criado_em: string;
};

const TIPO_IMPORTACAO: Record<string, string> = {
  desempenho_anuncios: "Desempenho",
  pedidos: "Pedidos",
  catalogo: "Catálogo",
  preco_ideal: "Tabela de preços",
  promocoes: "Promoções",
  consolidado: "Consolidado",
};
const SITUACAO: Record<Importacao["status"], { rotulo: string; tom: "up" | "down" | "info" | "neutral" }> = {
  concluida: { rotulo: "Concluída", tom: "up" },
  falhou: { rotulo: "Falhou", tom: "down" },
  executando: { rotulo: "Processando", tom: "info" },
  na_fila: { rotulo: "Na fila", tom: "neutral" },
};

export default function ImportarCliente({ origens, recentes }: { origens: Origens; recentes: Importacao[] }) {
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [previa, setPrevia] = React.useState<Previa | null>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<{ msg: string; tec?: string } | null>(
    null
  );
  const [conta, setConta] = React.useState("");
  const [caminho, setCaminho] = React.useState<string | null>(null);
  const [operacaoId, setOperacaoId] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [gravando, setGravando] = React.useState(false);
  const [feito, setFeito] = React.useState<{
    criadas: number;
    atualizadas: number;
    ignoradas: number;
    avisos: string[];
  } | null>(null);

  async function analisar(f: File) {
    setArquivo(f);
    setPrevia(null);
    setErro(null);
    setFeito(null);
    setConta("");
    setCaminho(null);
    setCarregando(true);

    try {
      const fd = new FormData();
      let caminhoUsado: string | null = null;

      if (f.size > LIMITE_DIRETO) {
        // Grande demais para o corpo da requisição: vai direto ao
        // Storage, e o servidor recebe só o endereço.
        setEnviando(true);
        const op = operacaoId ?? (await descobrirOperacao());
        if (!op) {
          setErro({ msg: "Não consegui identificar a operação para enviar o arquivo." });
          return;
        }
        caminhoUsado = await enviarAoStorage(f, op);
        setCaminho(caminhoUsado);
        setEnviando(false);
        fd.append("caminho", caminhoUsado);
        fd.append("nome", f.name);
      } else {
        fd.append("arquivo", f);
      }

      const res = await fetch("/api/importar/previa", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        // 413 não devolve JSON: a plataforma corta antes do código rodar.
        const texto = await res.text();
        setErro({
          msg:
            res.status === 413
              ? "O arquivo passou do limite da plataforma. Tente de novo — ele será enviado por outro caminho."
              : (safeJson(texto)?.erro ?? `O servidor respondeu ${res.status}.`),
          tec: texto.slice(0, 200),
        });
        return;
      }

      const json = await res.json();
      setOperacaoId(json.operacaoId ?? null);
      setPrevia(json.previa as Previa);
    } catch (e) {
      setErro({
        msg: "Não consegui falar com o servidor.",
        tec: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setEnviando(false);
      setCarregando(false);
    }
  }

  async function gravarAgora() {
    if (!arquivo || !previa) return;
    setGravando(true);
    setErro(null);
    try {
      const fd = new FormData();
      // Reaproveita o que já subiu na prévia: enviar 19 MB duas vezes
      // seria puro desperdício de espera.
      if (caminho) {
        fd.append("caminho", caminho);
        fd.append("nome", arquivo.name);
      } else {
        fd.append("arquivo", arquivo);
      }
      if (conta) fd.append("conta", conta);
      const res = await fetch("/api/importar/gravar", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setErro({ msg: json.erro ?? `O servidor respondeu ${res.status}.` });
        return;
      }
      setFeito(json.resultado);
    } catch (e) {
      setErro({
        msg: "A gravação não completou.",
        tec: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setGravando(false);
    }
  }

  const bloqueado =
    !!previa &&
    (previa.tipo === "desconhecido" ||
      previa.naoReconhecidos.length > 0 ||
      (previa.tipo === "desempenho" && !previa.periodo.inicio));

  /*
   * Layout da referência aprovada de Importar: as origens do dado em
   * cartões, o fluxo de planilha com o guia ao lado e o histórico real
   * embaixo. O fluxo em si (prévia antes de gravar, erro com saída,
   * resultado) é o mesmo de antes, só mudou de lugar.
   */
  const cartoes = [
    {
      icone: Plug,
      titulo: "Conexões por API",
      texto: "Mercado Livre, loja e Google Analytics, atualizados sozinhos.",
      estado: origens.contasApi
        ? `${origens.contasApi} conectada${origens.contasApi > 1 ? "s" : ""}`
        : "Nenhuma conectada",
      ok: origens.contasApi > 0,
      acao: "Gerenciar conexões",
      href: "/integracoes/canais",
      tom: "bg-brand-wash text-brand",
    },
    {
      icone: Database,
      titulo: "ERP",
      texto: "Pedidos de todos os canais vindos do sistema de gestão.",
      estado: origens.erpConectado ? "Bling conectado" : "Não conectado",
      ok: origens.erpConectado,
      acao: origens.erpConectado ? "Ver lojas" : "Conectar ERP",
      href: "/integracoes/canais?aba=erp",
      tom: "bg-info-wash text-info",
    },
    {
      icone: FileSpreadsheet,
      titulo: "Planilha",
      texto: "Desempenho, pedidos, catálogo e tabela de preços.",
      estado: "Pronto para importar",
      ok: true,
      acao: "Importar planilha",
      href: "#importar-planilha",
      tom: "bg-up-wash text-up",
    },
    {
      icone: PenLine,
      titulo: "Lançamentos manuais",
      texto: "Visitas e investimento em ADS que nenhuma planilha traz.",
      estado: "Disponível",
      ok: true,
      acao: "Novo lançamento",
      href: "/vendas/lancamentos",
      tom: "bg-warn-wash text-warn",
    },
  ];

  const passos: [string, string][] = [
    ["Use a exportação original", "Sem abas removidas nem linhas apagadas no topo: é pela estrutura que o arquivo é reconhecido."],
    ["Não precisa dizer qual é", "Desempenho de anúncios, listagem de pedidos, catálogo e tabela de preços: o formato sai do próprio arquivo."],
    ["Confira a prévia", "Nada é gravado antes de você ver o que entra, o período e o que não foi reconhecido."],
    ["Arquivo grande também vai", "Envie a planilha completa. Aguarde o envio terminar para conferir a prévia."],
  ];

  return (
    <>
      <PageHeader
        title="Importar dados"
        breadcrumb="Dados"
        description="Conecte seus canais ou envie uma planilha"
      />

      <PageBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {cartoes.map((c) => (
            <Panel key={c.titulo} className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-r2", c.tom)}>
                  <c.icone className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-ink">{c.titulo}</span>
                  <span className="block text-[12.5px] text-ink-2 leading-snug">{c.texto}</span>
                </span>
              </div>
              <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <span className={cn("h-2 w-2 rounded-full", c.ok ? "bg-up" : "bg-line-2")} />
                {c.estado}
              </span>
              <Link
                href={c.href}
                className="mt-auto inline-flex min-h-11 md:min-h-9 items-center justify-center gap-1.5 rounded-r1 border border-line-2 bg-panel text-[13px] font-medium text-brand hover:bg-brand-wash"
              >
                {c.acao}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Panel>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
          <div id="importar-planilha" className="lg:col-span-2 flex flex-col gap-3 min-w-0 scroll-mt-20">
          <Panel className="p-4">
            <FileDrop
              hint="Arraste a planilha ou clique para escolher"
              accept=".xlsx, .xls"
              onFiles={(fs) => fs[0] && analisar(fs[0])}
              files={arquivo ? [{ name: arquivo.name, size: arquivo.size }] : []}
              onRemove={() => {
                setArquivo(null);
                setPrevia(null);
                setErro(null);
              }}
            />
            <p className="text-[12px] text-ink-3 mt-2.5 leading-relaxed">
              Não precisa dizer qual é: o formato sai da estrutura do arquivo.
              Nada é gravado antes de você conferir a prévia.
            </p>
          </Panel>

          {carregando && (
            <Panel className="p-6">
              <div className="flex flex-col items-center gap-1.5 text-ink-2">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[13px]">
                    {enviando ? "Enviando o arquivo…" : "Lendo a planilha…"}
                  </span>
                </span>
                {enviando && (
                  <span className="text-[12px] text-ink-3 text-center max-w-sm">
                    Mantenha esta página aberta até o envio terminar.
                  </span>
                )}
              </div>
            </Panel>
          )}

          {erro && (
            <ErroComSaida
              titulo="A leitura falhou"
              causa={erro.msg}
              passo="Confira se o arquivo é a exportação original, sem abas removidas nem linhas apagadas no topo."
              detalheTecnico={erro.tec}
              onTentarDeNovo={() => arquivo && analisar(arquivo)}
            />
          )}

          {previa && (
            <Resultado
              previa={previa}
              bloqueado={bloqueado}
              conta={conta}
              onConta={setConta}
              gravando={gravando}
              feito={feito}
              onGravar={gravarAgora}
            />
          )}

          </div>

          <Panel className="p-4 flex flex-col gap-3 bg-up-wash/35 border-up/15">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-r2 bg-up-wash text-up">
                <BookOpen className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-ink">Guia rápido</span>
                <span className="block text-[12px] text-ink-3">Para a importação sair certa na primeira vez</span>
              </span>
            </div>
            <ol className="flex flex-col gap-3">
              {passos.map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-up-wash text-[12px] font-semibold text-up">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">{t}</span>
                    <span className="block text-[12.5px] text-ink-2 leading-snug">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader title="Últimas importações" hint="as oito mais recentes desta empresa" />
          {recentes.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-ink-3">Nenhuma planilha importada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] font-semibold text-ink-2">
                    <th className="px-5 py-2">Arquivo</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Linhas</th>
                    <th className="px-3 py-2">Situação</th>
                    <th className="px-5 py-2 text-right">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {recentes.map((i) => (
                    <tr key={i.id} className="border-t border-line">
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-2 min-w-0">
                          <FileSpreadsheet className="h-4 w-4 shrink-0 text-up" />
                          <span className="truncate max-w-[340px]" title={i.nome_arquivo}>
                            {i.nome_arquivo}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone="neutral">{TIPO_IMPORTACAO[i.tipo] ?? i.tipo}</Badge>
                      </td>
                      <td className="num px-3 py-2.5 text-right text-ink-2">
                        {count(i.linhas_validas)}
                        {i.linhas_lidas > i.linhas_validas && (
                          <span className="text-ink-3"> de {count(i.linhas_lidas)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span title={i.erro ?? undefined}>
                          <Badge tone={SITUACAO[i.status]?.tom ?? "neutral"}>
                            {SITUACAO[i.status]?.rotulo ?? i.status}
                          </Badge>
                        </span>
                      </td>
                      <td className="num px-5 py-2.5 text-right text-ink-3 whitespace-nowrap">
                        {new Date(i.criado_em).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </PageBody>
    </>
  );
}

function Resultado({
  previa,
  bloqueado,
  conta,
  onConta,
  gravando,
  feito,
  onGravar,
}: {
  previa: Previa;
  bloqueado: boolean;
  conta: string;
  onConta: (v: string) => void;
  gravando: boolean;
  feito: { criadas: number; atualizadas: number; ignoradas: number; avisos: string[] } | null;
  onGravar: () => void;
}) {
  // O catálogo não diz de que conta veio. Sem escolha, não grava.
  const precisaConta = previa.tipo === "catalogo" && previa.contasDisponiveis.length > 0;
  const podeGravar = !bloqueado && (!precisaConta || !!conta) && !feito;
  const umDia =
    previa.periodo.inicio &&
    previa.periodo.inicio === previa.periodo.fim;

  return (
    <>
      <Panel className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3.5">
          <div className="min-w-0">
            <span className="flex items-center gap-2 mb-1">
              <Badge tone={previa.tipo === "desconhecido" ? "down" : "brand"}>
                {ROTULO[previa.tipo]}
              </Badge>
              {previa.jaImportado && <Badge tone="warn">Já importado</Badge>}
            </span>
            <p className="text-[12px] text-ink-3 leading-relaxed">
              {previa.evidencia}
            </p>
          </div>
        </div>

        {previa.tipo !== "desconhecido" && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-3.5 border-b border-line">
              <Metrica rotulo="Linhas lidas" valor={count(previa.linhas)} />
              <Metrica
                rotulo="Novas"
                valor={count(Math.max(0, previa.novas))}
                detalhe="entram pela primeira vez"
              />
              <Metrica
                rotulo="Atualizadas"
                valor={count(previa.atualizadas)}
                detalhe="sobrescrevem o que existe"
              />
              <Metrica
                rotulo="Período"
                valor={
                  umDia
                    ? dataBr(previa.periodo.inicio)
                    : `${dataBr(previa.periodo.inicio)}`
                }
                detalhe={
                  umDia
                    ? "dia único"
                    : previa.periodo.fim
                    ? `até ${dataBr(previa.periodo.fim)}`
                    : "sem data"
                }
              />
            </div>

            <div className="pt-3.5">
              <Leitura
                tom={bloqueado ? "atencao" : "bom"}
                titulo={bloqueado ? "Bloqueado" : "Pronto para importar"}
              >
                {bloqueado ? (
                  <>
                    A importação não pode seguir como está. Resolvido o que
                    está marcado abaixo, ela libera — nada foi gravado.
                  </>
                ) : (
                  <>
                    Este arquivo alimenta{" "}
                    <span className="font-semibold text-ink">
                      {OQUE_ALIMENTA[previa.tipo]}
                    </span>
                    .{" "}
                    {previa.atualizadas > 0 ? (
                      <>
                        <span className="num">{count(previa.atualizadas)}</span>{" "}
                        linhas já existem e serão sobrescritas, não somadas —
                        reimportar o mesmo período é seguro.
                      </>
                    ) : (
                      <>Todas as linhas são novas.</>
                    )}
                  </>
                )}
              </Leitura>
            </div>
          </>
        )}
      </Panel>

      {previa.reconhecidos.length > 0 && (
        <Panel className="p-4">
          <p className="label mb-2.5">Canais reconhecidos</p>
          <div className="flex flex-col gap-1.5">
            {previa.reconhecidos.map((r) => (
              <div
                key={`${r.canal}-${r.conta}`}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0"
              >
                <span className="text-[13px] text-ink min-w-0 truncate">
                  {r.canal}
                  {/* A conta só aparece onde há mais de uma. Repeti-la em
                      canal de conta única sugeria que os canais
                      compartilhavam algo. */}
                  {r.mostrarConta && (
                    <span className="text-ink-3"> · {r.conta}</span>
                  )}
                </span>
                <span className="num text-[12px] text-ink-2 shrink-0">
                  {count(r.linhas)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {previa.naoReconhecidos.length > 0 && (
        <Panel className="p-4 border-down/30">
          <span className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-down" strokeWidth={2.25} />
            <p className="text-[13px] font-semibold text-ink">
              Canais sem apelido cadastrado
            </p>
          </span>
          <p className="text-[12px] text-ink-2 leading-relaxed mb-3">
            Estes nomes não casam com nenhum canal. A importação fica parada
            aqui de propósito: gravar na conta errada não muda o total, e o
            erro só apareceria quando alguém comparasse conta a conta com o
            painel do canal.
          </p>
          <div className="flex flex-col gap-1.5">
            {previa.naoReconhecidos.map((n) => (
              <div
                key={`${n.marketplace}-${n.conta}`}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0"
              >
                <span className="num text-[12.5px] text-ink min-w-0 truncate">
                  {n.marketplace}
                  {n.conta && <span className="text-ink-3"> / {n.conta}</span>}
                </span>
                <span className="num text-[12px] text-down shrink-0">
                  {count(n.linhas)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {previa.orfaos.map((o) => (
        <Panel key={o.descricao} className="p-4">
          <p className="label mb-1.5">{o.descricao}</p>
          <p className="text-[13px] text-ink mb-1.5">
            <span className="num font-semibold">{count(o.total)}</span> sem
            correspondência
          </p>
          <p className="num text-[12px] text-ink-3 break-all">
            {o.exemplos.join(", ")}
            {o.total > o.exemplos.length && ` e mais ${o.total - o.exemplos.length}`}
          </p>
        </Panel>
      ))}

      {previa.avisos.length > 0 && (
        <div className="flex flex-col gap-2">
          {previa.avisos.map((a, i) => (
            <Leitura key={i} tom="atencao" titulo="Atenção">
              {a}
            </Leitura>
          ))}
        </div>
      )}

      {previa.jaImportado && (
        <Leitura tom="neutro" titulo="Este arquivo já entrou">
          <CalendarDays className="w-3 h-3 inline -mt-px mr-1" />
          Importado em{" "}
          <span className="num">
            {new Date(previa.jaImportado.em).toLocaleString("pt-BR")}
          </span>
          , com <span className="num">{count(previa.jaImportado.linhas)}</span>{" "}
          linhas. Subir de novo sobrescreve pelo mesmo conteúdo — inofensivo,
          mas provavelmente desnecessário.
        </Leitura>
      )}

      {feito && (
        <Panel className="p-4">
          <Leitura tom="bom" titulo="Importado">
            <span className="num">{count(feito.criadas)}</span> linhas gravadas
            {feito.atualizadas > 0 && (
              <>
                , <span className="num">{count(feito.atualizadas)}</span>{" "}
                sobrescritas
              </>
            )}
            {feito.ignoradas > 0 && (
              <>
                , <span className="num">{count(feito.ignoradas)}</span> de fora
              </>
            )}
            . Subir este mesmo arquivo de novo não duplica nada.
          </Leitura>
          {feito.avisos.map((a, i) => (
            <p key={i} className="text-[12px] text-warn mt-2 leading-relaxed">
              {a}
            </p>
          ))}
        </Panel>
      )}

      {previa.tipo !== "desconhecido" && !feito && (
        <Panel className="p-4">
          {precisaConta && (
            <div className="mb-3.5">
              <p className="label mb-1.5">De qual conta é este catálogo?</p>
              <p className="text-[12px] text-ink-2 leading-relaxed mb-2">
                O arquivo não carrega essa informação, e as duas contas do
                Mercado Livre vendem coisas diferentes. Escolher errado aqui
                mistura os anúncios das duas.
              </p>
              <div className="flex flex-col gap-1.5">
                {previa.contasDisponiveis.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 text-[13px] text-ink cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="conta-catalogo"
                      value={c.id}
                      checked={conta === c.id}
                      onChange={(e) => onConta(e.target.value)}
                      className="accent-[var(--brand)]"
                    />
                    {c.nome}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[12px] text-ink-3 leading-relaxed max-w-md">
              {bloqueado
                ? "Resolva o que está marcado acima para liberar."
                : precisaConta && !conta
                ? "Escolha a conta para liberar."
                : "Grava sobrescrevendo o que já existe. Reimportar o mesmo período é seguro."}
            </p>
            <Button
              variant="primary"
              disabled={!podeGravar || gravando}
              onClick={onGravar}
              className="max-sm:w-full max-sm:h-11"
            >
              {gravando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Gravando
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" strokeWidth={2.25} />
                  Importar
                </>
              )}
            </Button>
          </div>
        </Panel>
      )}

      {!bloqueado && previa.tipo !== "desconhecido" && previa.avisos.length === 0 && (
        <Panel>
          <TudoCerto
            titulo="Nada pendente neste arquivo"
            detalhe="Todos os canais reconhecidos, período identificado e nenhum órfão."
          />
        </Panel>
      )}
    </>
  );
}
