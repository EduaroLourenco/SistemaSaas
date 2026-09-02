import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";

/**
 * Guarda temporária do .zip gerado pelo processamento de promoções.
 *
 * ── Por que saiu da memória ──
 *
 * A versão anterior guardava o buffer num `Map` do processo, com uma nota
 * dizendo que isso não sobrevive a restart nem funciona com mais de uma
 * instância. Funcionava no servidor de desenvolvimento e quebrava em
 * produção — que é onde o usuário está.
 *
 * Na Vercel cada requisição pode cair numa instância diferente: o
 * processamento guardava o pacote na instância A e o clique em baixar
 * chegava na B, que não tinha nada. A resposta 404 vinha em JSON, e o
 * `<a download>` salvava o próprio erro como arquivo — daí o
 * `pac_xxx.json` aparecendo na pasta de downloads.
 *
 * Cada deploy também zerava a memória, e o sistema recebeu vários deploys
 * por dia. O pacote sumia entre processar e baixar sem nada explicar.
 *
 * ── Agora ──
 *
 * O zip vai para o bucket `exportacoes` do Storage, que já existia para
 * isso. Sobrevive a restart, é o mesmo para todas as instâncias, e o RLS
 * decide quem lê — a mesma trava das tabelas, aplicada a arquivo.
 *
 * ── A operação vai no caminho, e isso é obrigatório ──
 *
 * A política do Storage exige que a PRIMEIRA pasta seja o id da operação:
 * ela chama `operacao_do_caminho(name)` e pergunta se o usuário pode
 * editar aquela operação. Um caminho sem a pasta devolve nulo, a checagem
 * falha, e o upload volta com "new row violates row-level security
 * policy" — que foi exatamente o que aconteceu.
 *
 * Guardar e buscar resolvem a operação do mesmo jeito, então o par sempre
 * casa. Não é decoração: é o que impede alguém de baixar o pacote de
 * outra operação trocando o id na URL.
 *
 * ── Por que apaga depois de baixar ──
 *
 * O pacote é passagem, não arquivo morto: o que interessa fica no
 * histórico de processamento, no banco. Guardar cada zip encheria o
 * bucket, e ninguém volta para baixar o mesmo pacote duas vezes — quem
 * precisa de novo processa de novo, que leva segundos.
 */

const BUCKET = "exportacoes";
const PREFIXO = "pacotes";

/** Coerente com o texto que a tela mostra ao usuário. */
export const VALIDADE_MS = 15 * 60 * 1000;

function caminho(operacaoId: string, id: string) {
  return `${operacaoId}/${PREFIXO}/${id}.zip`;
}

/** A operação do usuário, ou um erro que diz o que fazer. */
async function operacaoOuErro(): Promise<string> {
  const op = await operacaoPadrao();
  if (!op) {
    throw new Error(
      "Nenhuma operação acessível — não há onde guardar o pacote."
    );
  }
  return op.id;
}

export async function guardarPacote(buffer: Buffer): Promise<string> {
  const sb = await clienteServidor();
  const operacaoId = await operacaoOuErro();
  const id = `pac_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const { error } = await sb.storage
    .from(BUCKET)
    .upload(caminho(operacaoId, id), buffer, {
      contentType: "application/zip",
      upsert: false,
    });

  if (error) {
    throw new Error(
      `Não consegui guardar o pacote processado: ${error.message}`
    );
  }

  // Sem esperar: pacote velho é sujeira, não erro. Falhar a limpeza não
  // pode derrubar um processamento que deu certo.
  void limpar(sb, operacaoId).catch(() => {});

  return id;
}

export async function pegarPacote(id: string): Promise<Buffer | null> {
  // Id vem da URL. Sem esta checagem, "../" no meio dele sairia da pasta
  // de pacotes e alcançaria outros arquivos do bucket.
  if (!/^pac_[a-z0-9]+_[a-z0-9]+$/i.test(id)) return null;

  const sb = await clienteServidor();
  const operacaoId = await operacaoOuErro();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .download(caminho(operacaoId, id));
  if (error || !data) return null;

  return Buffer.from(await data.arrayBuffer());
}

export async function descartarPacote(id: string): Promise<void> {
  if (!/^pac_[a-z0-9]+_[a-z0-9]+$/i.test(id)) return;
  try {
    const sb = await clienteServidor();
    const operacaoId = await operacaoOuErro();
    await sb.storage.from(BUCKET).remove([caminho(operacaoId, id)]);
  } catch {
    /* arquivo órfão é sujeira, não erro */
  }
}

type Sb = Awaited<ReturnType<typeof clienteServidor>>;

/** Apaga o que passou da validade. */
async function limpar(sb: Sb, operacaoId: string): Promise<void> {
  const pasta = `${operacaoId}/${PREFIXO}`;
  const { data } = await sb.storage.from(BUCKET).list(pasta, { limit: 100 });
  if (!data?.length) return;

  const corte = Date.now() - VALIDADE_MS;
  const velhos = data
    .filter((f) => {
      const criado = f.created_at ? Date.parse(f.created_at) : NaN;
      return Number.isFinite(criado) && criado < corte;
    })
    .map((f) => `${pasta}/${f.name}`);

  if (velhos.length) await sb.storage.from(BUCKET).remove(velhos);
}
