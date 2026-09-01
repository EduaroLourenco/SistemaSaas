import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * O arquivo da importação, venha ele por onde vier.
 *
 * ── Por que há dois caminhos ──
 *
 * A Vercel corta o corpo de qualquer requisição em 4,5 MB, e o limite não
 * é configurável. Uma listagem de pedidos de um período longo passa disso
 * com folga — a de 01/09 tem 19 MB — e a requisição morre antes de chegar
 * ao código, com um "Request Entity Too Large" que o navegador tenta ler
 * como JSON e falha.
 *
 * Então o arquivo grande não passa pelo servidor: o navegador o envia
 * direto ao Storage do Supabase, e aqui só chega o caminho. O limite do
 * bucket é 50 MB, e o RLS decide quem pode escrever — a mesma trava das
 * tabelas, aplicada a arquivo.
 *
 * O caminho direto continua existindo para arquivo pequeno, que é a
 * maioria: uma viagem a menos, sem lixo no Storage para limpar depois.
 */

export type ArquivoLido =
  | { buffer: Buffer; nome: string; origem: "direto" | "storage" }
  | { erro: string };

const BUCKET = "importacoes";

export async function lerArquivoEnviado(form: FormData): Promise<ArquivoLido> {
  const caminho = form.get("caminho");

  if (typeof caminho === "string" && caminho) {
    const sb = await clienteServidor();
    const { data, error } = await sb.storage.from(BUCKET).download(caminho);

    if (error || !data) {
      return {
        erro:
          `Não consegui ler o arquivo enviado (${caminho}). ` +
          (error?.message ?? "arquivo não encontrado no armazenamento."),
      };
    }

    return {
      buffer: Buffer.from(await data.arrayBuffer()),
      // O nome real vem no formulário: o caminho carrega um carimbo de
      // tempo para não colidir, e mostrá-lo na tela seria ruído.
      nome: String(form.get("nome") ?? caminho.split("/").pop() ?? "arquivo.xlsx"),
      origem: "storage",
    };
  }

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) {
    return { erro: "Nenhum arquivo enviado." };
  }

  return {
    buffer: Buffer.from(await arquivo.arrayBuffer()),
    nome: arquivo.name,
    origem: "direto",
  };
}

/**
 * Apaga o arquivo depois de processado.
 *
 * O Storage aqui é passagem, não arquivo morto: o que importa é o dado
 * que entrou nas tabelas. Guardar cada planilha de 19 MB encheria o
 * bucket em semanas, e ninguém iria olhar para elas.
 *
 * A falha é engolida de propósito — arquivo órfão é sujeira, não erro. A
 * importação já terminou, e derrubá-la aqui seria desfazer o que deu
 * certo por causa do que não importa.
 */
export async function descartarDoStorage(caminho: string): Promise<void> {
  try {
    const sb = await clienteServidor();
    await sb.storage.from(BUCKET).remove([caminho]);
  } catch {
    /* ignora */
  }
}
