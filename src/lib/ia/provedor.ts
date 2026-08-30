import "server-only";
import OpenAI from "openai";
import { FERRAMENTAS } from "./ferramentas";

/**
 * De qual IA a plataforma fala — configurável, não fixo no código.
 *
 * Este arquivo existe porque a rota já foi reescrita três vezes: Claude,
 * depois Gemini, agora Groq. O padrão comum entre eles não é o SDK, é o
 * PROTOCOLO: Groq, DeepSeek, OpenRouter, Together, Qwen e o próprio
 * OpenAI falam todos o mesmo dialeto de `chat/completions`.
 *
 * Falando o protocolo em vez do SDK de um fornecedor, trocar de provedor
 * vira mudar duas variáveis de ambiente. A próxima troca não precisa de
 * mim.
 *
 * A exceção é o Claude, que tem formato próprio de ferramentas — para
 * voltar a ele o caminho é a API compatível ou um adaptador. Fica
 * registrado para quem procurar depois.
 */

export type Perfil = {
  nome: string;
  baseURL: string;
  /** Nome da variável de ambiente que guarda a chave. */
  variavelChave: string;
  modeloPadrao: string;
  /** Onde pegar a chave — vai para a mensagem de erro. */
  ondePegar: string;
  gratuito: boolean;
};

/**
 * Perfis conhecidos. O usuário escolhe por `IA_PROVEDOR`.
 *
 * Modelos e limites mudam o tempo todo, e o padrão de cada um pode sair
 * do ar. Quando isso acontece a mensagem de erro diz onde ver a lista
 * atual, em vez de deixar um 404 sem explicação.
 */
export const PERFIS: Record<string, Perfil> = {
  groq: {
    nome: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    variavelChave: "GROQ_API_KEY",
    // Escolhido por teste, não por reputação: entre os disponíveis, foi o
    // único que resolveu "a receita caiu?" numa consulta só e com o número
    // na resposta. O qwen 27b usou data em formato brasileiro num campo
    // que pede aaaa-mm-dd — no sistema real voltaria vazio.
    modeloPadrao: "openai/gpt-oss-120b",
    ondePegar: "console.groq.com/keys",
    gratuito: true,
  },
  deepseek: {
    nome: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    variavelChave: "DEEPSEEK_API_KEY",
    modeloPadrao: "deepseek-chat",
    ondePegar: "platform.deepseek.com",
    gratuito: false,
  },
  openrouter: {
    nome: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    variavelChave: "OPENROUTER_API_KEY",
    modeloPadrao: "meta-llama/llama-3.3-70b-instruct",
    ondePegar: "openrouter.ai/keys",
    gratuito: false,
  },
};

export class ProvedorNaoConfigurado extends Error {
  constructor(public readonly perfil: Perfil) {
    super(
      `Falta a chave do ${perfil.nome}. Pegue em ${perfil.ondePegar}, ` +
        `coloque em ${perfil.variavelChave} no .env.local e reinicie o servidor.`
    );
    this.name = "ProvedorNaoConfigurado";
  }
}

export function perfilAtual(): Perfil {
  const escolhido = (process.env.IA_PROVEDOR || "groq").toLowerCase();
  return PERFIS[escolhido] ?? PERFIS.groq;
}

export function modeloAtual(): string {
  return process.env.IA_MODELO || perfilAtual().modeloPadrao;
}

export function clienteIa(): OpenAI {
  const perfil = perfilAtual();
  const chave = process.env[perfil.variavelChave];
  if (!chave) throw new ProvedorNaoConfigurado(perfil);

  return new OpenAI({
    apiKey: chave,
    baseURL: perfil.baseURL,
    // Uma pergunta com várias consultas pode passar de um minuto.
    timeout: 120_000,
    maxRetries: 0, // a retentativa é nossa, com aviso na tela
  });
}

/**
 * As mesmas ferramentas, no formato do protocolo.
 *
 * `ferramentas.ts` não muda: os esquemas já são JSON Schema, que é o que
 * este formato pede. Foi por isso que a lógica de consulta ficou separada
 * desde o começo.
 */
export const FERRAMENTAS_PROTOCOLO = FERRAMENTAS.map((f) => ({
  type: "function" as const,
  function: {
    name: f.name,
    description: f.description,
    parameters: f.input_schema as Record<string, unknown>,
  },
}));

/** Traduz a falha para algo acionável, em vez do erro cru do provedor. */
export function explicarFalha(e: unknown): string {
  if (e instanceof ProvedorNaoConfigurado) return e.message;

  const perfil = perfilAtual();
  const bruto = e instanceof Error ? e.message : String(e);

  if (/401|invalid.*api.*key|authentication|unauthorized/i.test(bruto)) {
    return (
      `A chave do ${perfil.nome} foi recusada. Confira ` +
      `${perfil.variavelChave} no .env.local — ela vem de ${perfil.ondePegar}.`
    );
  }
  if (/429|rate.?limit|quota|too many requests/i.test(bruto)) {
    return perfil.gratuito
      ? `Limite da camada gratuita do ${perfil.nome} atingido. Ela conta por minuto ` +
          "e por dia — espere um pouco e pergunte de novo."
      : `Limite de chamadas do ${perfil.nome} atingido. Espere um instante.`;
  }
  if (/insufficient|balance|credit|payment/i.test(bruto)) {
    return `Saldo do ${perfil.nome} esgotado. Recarregue em ${perfil.ondePegar}.`;
  }
  if (/404|not found|does not exist|decommissioned|model_not_found/i.test(bruto)) {
    return (
      `O modelo "${modeloAtual()}" não existe no ${perfil.nome} — o catálogo muda. ` +
      `Veja os disponíveis em ${perfil.ondePegar} e ajuste IA_MODELO no .env.local.`
    );
  }
  if (/50[023]|overloaded|unavailable|high demand/i.test(bruto)) {
    return (
      `O ${perfil.nome} está sobrecarregado agora — passa sozinho. Já tentei ` +
      "algumas vezes. Espere um minuto; não é a sua pergunta que está errada."
    );
  }
  return bruto.slice(0, 300);
}

/** Falhas que passam sozinhas e merecem nova tentativa. */
export function vaiPassarSozinho(e: unknown): boolean {
  if (e instanceof ProvedorNaoConfigurado) return false;
  const s = e instanceof Error ? e.message : String(e);
  // Chave errada e modelo inexistente ficam de fora: repetir não conserta,
  // só atrasa a mensagem que explica o que fazer.
  return /429|rate.?limit|50[023]|overloaded|unavailable|high demand|ECONNRESET|ETIMEDOUT/i.test(s);
}
