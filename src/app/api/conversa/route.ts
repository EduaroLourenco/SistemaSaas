import type OpenAI from "openai";
import { executar } from "@/lib/ia/ferramentas";
import {
  clienteIa,
  modeloAtual,
  perfilAtual,
  FERRAMENTAS_PROTOCOLO,
  ProvedorNaoConfigurado,
  explicarFalha,
  vaiPassarSozinho,
} from "@/lib/ia/provedor";

export const runtime = "nodejs";
// O laço pode levar várias rodadas de consulta antes da resposta final.
export const maxDuration = 300;

/**
 * Conversa sobre a operação, com acesso real aos dados.
 *
 * O modelo não recebe os dados no prompt — recebe ferramentas e decide o
 * que consultar. São 6.500 pedidos: não cabem no contexto, e resumi-los
 * antes seria escolher pelo modelo o que ele pode olhar.
 *
 * O laço roda no servidor e transmite eventos para a tela: cada consulta
 * aparece enquanto acontece. Chat que fica em branco por vinte segundos
 * parece travado, e a pessoa recarrega no meio do raciocínio.
 *
 * Qual IA responde é decidido em `provedor.ts`, por variável de ambiente.
 * Esta rota não sabe nem precisa saber.
 */

function hojeBr(): string {
  const agora = new Date();
  return `${agora.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })} (${agora.toISOString().slice(0, 10)})`;
}

const SISTEMA_BASE = `Você é o analista da operação de e-commerce desta plataforma.
Fala português do Brasil, direto, sem jargão de consultoria.

COMO TRABALHAR

Consulte antes de responder. Você tem ferramentas que leem o banco de verdade.
Nunca estime, arredonde de cabeça ou invente um número: se não consultou, não sabe.
Quando não souber o que existe, comece por contexto_operacao.

Uma pergunta quase nunca se responde com uma consulta só. "Por que caiu?" pede
o que caiu, quando, e o que mudou junto. Cruze antes de concluir.

O QUE ESTES DADOS NÃO TÊM

Custo de produto não está cadastrado. Então MARGEM E LUCRO NÃO SÃO CALCULÁVEIS.
Se perguntarem, diga isso — não substitua margem por receita nem por "receita
menos comissão", que é outra coisa.

Visitas e conversão existem só para o Mercado Livre. Nenhum outro canal exporta
esse dado. Conversão de Magalu ou VTEX não é zero: é desconhecida.

Períodos podem estar fora da análise (excluídos por decisão do usuário). As
ferramentas já os descartam. Se um resultado mencionar exclusão, diga.

COMO RESPONDER

Comece pela conclusão, depois o número que a sustenta. Não descreva a tabela
que consultou — interprete.

Diga o tamanho. "Caiu" sem número é impressão, não análise.

Separe o que o dado mostra do que você está supondo. "A conversão caiu 40%" é
dado. "Provavelmente é preço" é hipótese, e precisa ser dita como tal.

Quando um número parecer estranho — um dia com 10x o normal, uma taxa absurda —
desconfie em voz alta e sugira conferir a origem, em vez de tratar como fato.

Seja breve. Duas ou três frases resolvem a maioria das perguntas. Só alongue
quando a pessoa pedir profundidade.`;

function sistema(): string {
  return `${SISTEMA_BASE}

DATA DE HOJE: ${hojeBr()}
Use isto para resolver "última semana", "este mês", "ontem". Se o período que a
pessoa pediu não tiver dado, diga qual período existe em vez de responder vazio.`;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type MensagemEntrada = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  let historico: MensagemEntrada[];
  try {
    const corpo = await req.json();
    historico = (corpo.mensagens ?? []) as MensagemEntrada[];
    if (!Array.isArray(historico) || !historico.length) {
      return Response.json({ erro: "Nenhuma mensagem." }, { status: 400 });
    }
  } catch {
    return Response.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  let ia: OpenAI;
  try {
    ia = clienteIa();
  } catch (e) {
    // Falta de chave é configuração, não falha de execução: responde JSON
    // com o passo a seguir, em vez de abrir um fluxo que só erra.
    return Response.json(
      {
        erro: explicarFalha(e),
        codigo: e instanceof ProvedorNaoConfigurado ? "sem_chave" : "erro",
      },
      { status: 503 }
    );
  }

  const codificador = new TextEncoder();

  const fluxo = new ReadableStream({
    async start(controle) {
      const enviar = (evento: Record<string, unknown>) => {
        controle.enqueue(codificador.encode(`data: ${JSON.stringify(evento)}\n\n`));
      };

      const mensagens: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: sistema() },
        ...historico.map((m) => ({ role: m.role, content: m.content })),
      ];

      try {
        // Teto de rodadas: sem ele, um modelo que insista em consultar
        // rodaria até o timeout sem nada aparecer na tela.
        for (let rodada = 0; rodada < 8; rodada++) {
          let texto = "";
          /*
           * Os fragmentos de chamada chegam picados — o nome num pedaço,
           * os argumentos em vários outros. O `index` é o que costura de
           * volta; sem ele, duas chamadas paralelas viram uma só com os
           * argumentos embaralhados.
           */
          const emMontagem = new Map<
            number,
            { id: string; nome: string; args: string }
          >();

          for (let tentativa = 0; ; tentativa++) {
            try {
              texto = "";
              emMontagem.clear();

              const stream = await ia.chat.completions.create({
                model: modeloAtual(),
                messages: mensagens,
                tools: FERRAMENTAS_PROTOCOLO,
                stream: true,
              });

              for await (const pedaco of stream) {
                const delta = pedaco.choices[0]?.delta;
                if (!delta) continue;

                if (delta.content) {
                  texto += delta.content;
                  enviar({ tipo: "texto", texto: delta.content });
                }

                for (const tc of delta.tool_calls ?? []) {
                  const atual =
                    emMontagem.get(tc.index) ?? { id: "", nome: "", args: "" };
                  if (tc.id) atual.id = tc.id;
                  if (tc.function?.name) atual.nome = tc.function.name;
                  if (tc.function?.arguments) atual.args += tc.function.arguments;
                  emMontagem.set(tc.index, atual);
                }
              }
              break;
            } catch (e) {
              // Só repete enquanto nada foi transmitido: depois que o
              // texto começou a sair, repetir costuraria duas respostas.
              if (!vaiPassarSozinho(e) || tentativa >= 3 || texto !== "") throw e;

              const espera = 2000 * Math.pow(2, tentativa) + 1000;
              enviar({
                tipo: "aguardando",
                mensagem: `${perfilAtual().nome} ocupado. Tentando de novo em ${Math.round(
                  espera / 1000
                )}s…`,
              });
              await dormir(espera);
            }
          }

          const chamadas = [...emMontagem.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, c]) => c)
            .filter((c) => c.nome);

          if (!chamadas.length) {
            enviar({ tipo: "fim" });
            break;
          }

          mensagens.push({
            role: "assistant",
            content: texto || null,
            tool_calls: chamadas.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.nome, arguments: c.args || "{}" },
            })),
          });

          const resultados = await Promise.all(
            chamadas.map(async (c) => {
              let entrada: Record<string, unknown> = {};
              try {
                entrada = c.args ? JSON.parse(c.args) : {};
              } catch {
                // JSON quebrado é falha do modelo, não do banco. Volta
                // como erro para ele corrigir na rodada seguinte.
                return {
                  role: "tool" as const,
                  tool_call_id: c.id,
                  content: `Argumentos inválidos: ${(c.args ?? "").slice(0, 200)}`,
                };
              }

              enviar({ tipo: "consulta", nome: c.nome, entrada });
              try {
                const saida = await executar(c.nome, entrada);
                return {
                  role: "tool" as const,
                  tool_call_id: c.id,
                  content: JSON.stringify(saida),
                };
              } catch (e) {
                // Devolvido como erro, não descartado: sem a resposta o
                // modelo fica esperando e a conversa trava.
                return {
                  role: "tool" as const,
                  tool_call_id: c.id,
                  content: `Erro: ${
                    e instanceof Error ? e.message : "falha na consulta"
                  }`,
                };
              }
            })
          );

          mensagens.push(...resultados);
        }
      } catch (e) {
        enviar({ tipo: "erro", mensagem: explicarFalha(e) });
      } finally {
        controle.close();
      }
    },
  });

  return new Response(fluxo, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
