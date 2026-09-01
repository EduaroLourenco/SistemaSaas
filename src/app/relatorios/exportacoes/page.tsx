"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Download, Loader2, AlertCircle, Package, Sparkles } from "lucide-react";

/**
 * Exportações.
 *
 * A versão anterior tinha seis botões que não faziam nada e tamanhos
 * escritos à mão no código ("~2,4 MB", "~480 KB"). Botão de download que
 * não baixa é pior que a ausência dele: a pessoa clica, nada acontece, e
 * fica sem saber se o problema é o arquivo ou a conexão.
 *
 * Agora cada botão chama /api/exportar e o arquivo vem montado do banco.
 * Não há tamanho estimado porque o tamanho depende do que existe no
 * período — número inventado num rótulo é do mesmo tipo que o resto que
 * saiu do sistema.
 */

type Formato = {
  id: string;
  titulo: string;
  descricao: string;
  extensao: "CSV" | "XLSX";
};

const FORMATOS: Formato[] = [
  {
    id: "vendas_diarias",
    titulo: "Lançamentos diários",
    descricao:
      "Uma linha por canal por dia, com visitas, receita, pedidos, mídia, cancelamentos, ticket, ACOS e ROAS.",
    extensao: "CSV",
  },
  {
    id: "consolidado_mensal",
    titulo: "Consolidado mensal",
    descricao:
      "Uma linha por canal por mês, com ticket, conversão e TACOS já calculados.",
    extensao: "CSV",
  },
  {
    id: "desempenho_anuncios",
    titulo: "Desempenho de anúncios",
    descricao:
      "Histórico semanal por anúncio: visitas, unidades, receita, preço pago, comissão real e conversão.",
    extensao: "XLSX",
  },
  {
    id: "historico_promocoes",
    titulo: "Histórico de promoções",
    descricao:
      "Cada decisão com os quatro preços — ofertado pelo canal, tabela, piso e com desconto extra.",
    extensao: "CSV",
  },
];

export default function Exportacoes() {
  const [baixando, setBaixando] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  async function exportar(formato: Formato) {
    return baixarDe(`/api/exportar?formato=${formato.id}`, formato.id, `${formato.id}.csv`);
  }

  async function baixarDe(rota: string, id: string, nomePadrao: string) {
    setBaixando(id);
    setErro(null);
    try {
      const r = await fetch(rota);
      if (!r.ok) {
        const corpo = await r.json().catch(() => ({}));
        setErro(corpo.erro ?? `Falha ao gerar (HTTP ${r.status})`);
        return;
      }

      /*
       * O nome vem do cabeçalho do servidor, não montado aqui: assim o
       * arquivo baixado e o que o servidor registrou têm o mesmo nome.
       */
      const cd = r.headers.get("content-disposition") ?? "";
      const nome = cd.match(/filename="([^"]+)"/)?.[1] ?? nomePadrao;

      const blob = await r.blob();
      if (blob.size === 0) {
        setErro("O arquivo veio vazio — não há dados no período.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Sem revoke, cada download deixa o arquivo inteiro na memória da aba.
      URL.revokeObjectURL(url);
    } catch {
      setErro("Sem conexão — nada foi baixado.");
    } finally {
      setBaixando(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Exportações"
        breadcrumb="Relatórios"
        description="Gere um arquivo com o que está no banco"
      />

      <PageBody>
        {/* O pacote fica antes da lista: é o que a maioria quer quando
            chega aqui, e os arquivos avulsos são o caso específico. */}
        <Panel className="p-4 mb-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-2 mb-1.5">
                <Package className="w-4 h-4 text-brand shrink-0" strokeWidth={2} />
                <p className="text-[14px] font-semibold text-ink">
                  Pacote completo da operação
                </p>
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                  <Sparkles className="w-3 h-3" strokeWidth={2} />
                  para IA
                </span>
              </span>
              <p className="text-[12.5px] text-ink-2 leading-relaxed max-w-xl">
                Um zip com seis CSVs — pedidos, itens, anúncios, desempenho
                semanal, KPIs diários e o de/para dos canais. Já com as
                exclusões de análise aplicadas, então bate com o que as telas
                mostram.
              </p>
              <p className="text-[11.5px] text-ink-3 leading-relaxed max-w-xl mt-1.5">
                Vem em formato de máquina — vírgula, decimal com ponto, data
                aaaa-mm-dd. E um <span className="num">LEIA-ME.md</span> que diz
                o que os dados <span className="font-medium text-ink-2">não</span>{" "}
                permitem concluir: margem não é calculável sem custo, e visita
                fora do Mercado Livre é desconhecida, não zero. Sem isso, quem
                analisar inventa os dois.
              </p>
            </div>
            <Button
              variant="primary"
              disabled={baixando !== null}
              onClick={() => baixarDe("/api/exportar/pacote", "pacote", "operacao.zip")}
              className="shrink-0 max-sm:w-full max-sm:h-11"
            >
              {baixando === "pacote" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Montando
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" strokeWidth={2.25} />
                  Baixar pacote
                </>
              )}
            </Button>
          </div>
        </Panel>

        {/* Evolução por anúncio: a planilha que responde "por que caiu"
            sem precisar cruzar três exportações à mão. */}
        <Panel className="p-4 mb-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink mb-1.5">
                Evolução semanal por anúncio
              </p>
              <p className="text-[12.5px] text-ink-2 leading-relaxed max-w-xl">
                Uma linha por anúncio por semana: SKU, MLB, visitas, vendas,
                conversão, preço praticado e comissão. Quanto vendeu, a quanto,
                e quanto custou.
              </p>
              <p className="text-[11.5px] text-ink-3 leading-relaxed max-w-xl mt-1.5">
                A comissão vem em duas colunas —{" "}
                <span className="font-medium text-ink-2">tarifa de tabela</span>{" "}
                e <span className="font-medium text-ink-2">tarifa cobrada</span>.
                Elas discordam quando houve redução por campanha, e a diferença
                entre as duas é o que a campanha economizou. A cobrada só existe
                onde o canal informou.
              </p>
            </div>
            <Button
              variant="default"
              disabled={baixando !== null}
              onClick={() =>
                baixarDe("/api/exportar/evolucao", "evolucao", "evolucao-anuncios.csv")
              }
              className="shrink-0 max-sm:w-full max-sm:h-11"
            >
              {baixando === "evolucao" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Montando
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" strokeWidth={2.25} />
                  Baixar CSV
                </>
              )}
            </Button>
          </div>
        </Panel>

        {erro && (
          <Panel className="px-4 py-3 flex items-start gap-2.5 border-down/30">
            <AlertCircle className="w-4 h-4 text-down shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-ink-2">{erro}</p>
          </Panel>
        )}

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Formatos disponíveis"
            hint="o arquivo é montado na hora, com tudo que existe no banco"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-line">
            {FORMATOS.map((f) => (
              <div key={f.id} className="bg-panel p-4 flex flex-col gap-3">
                <span>
                  <span className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13.5px] font-semibold text-ink">
                      {f.titulo}
                    </span>
                    <Badge tone="neutral">{f.extensao}</Badge>
                  </span>
                  <p className="text-[12.5px] text-ink-2 leading-relaxed">
                    {f.descricao}
                  </p>
                </span>
                <Button
                  variant="primary"
                  className="self-start"
                  onClick={() => exportar(f)}
                  disabled={baixando !== null}
                >
                  {baixando === f.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Gerando
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Exportar
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="px-4 py-3">
          <p className="text-[12.5px] text-ink-2 leading-relaxed">
            <span className="font-semibold text-ink">Exportação agendada: </span>
            ainda não existe. Precisa de um processo rodando fora da requisição
            e de envio de e-mail configurado — hoje o SMTP do projeto é o
            compartilhado do Supabase, que não entrega de forma confiável.
          </p>
        </Panel>
      </PageBody>
    </>
  );
}
