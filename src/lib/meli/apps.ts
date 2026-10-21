import "server-only";

/**
 * As duas aplicações do Mercado Livre, e por que são duas.
 *
 * ── A razão ──
 *
 * No Mercado Livre a permissão é configurada NA APLICAÇÃO, no DevCenter,
 * e não pedida na hora em que o vendedor autoriza. Uma aplicação é, por
 * isso, um nível de permissão para todo mundo que conectar nela: não dá
 * para pedir só leitura a um cliente e escrita a outro usando a mesma.
 *
 * Então são duas. A de LEITURA é a que já existia e continua respondendo
 * por todos os painéis; quem só quer ver número conecta ela e pronto. A
 * de ESCRITA só é conectada por quem quiser que o sistema altere coisas
 * no canal, e pede exatamente duas permissões — publicidade e promoções.
 * "Publicação e sincronização", que daria poder de mudar preço e pausar
 * anúncio, ficou deliberadamente de fora.
 *
 * ── Por que não uma aplicação só, com escrita ──
 *
 * A de leitura é a MESMA aplicação dos agentes que o Eduardo já rodava
 * antes desta plataforma. Pedir escrita nela obrigaria a reautorizar, o
 * que rotaciona o refresh token e derruba os agentes — e faria todo
 * cliente conceder escrita mesmo sem querer usar.
 *
 * ── Como a separação viaja ──
 *
 * As duas usam o MESMO endereço de retorno (`/api/meli/callback`), que
 * está cadastrado nas duas aplicações. Quem diz qual delas está no ar é
 * o `state` do OAuth, que já carregava um nonce e a conta. No cofre, o
 * que separa é o `provedor`: `mercado_livre` e `mercado_livre_escrita`
 * são duas linhas de `integracoes` para a mesma conta de canal, com
 * tokens independentes.
 */

export type App = "leitura" | "escrita";

export type DadosApp = {
  app: App;
  appId: string | undefined;
  segredo: string | undefined;
  /** Chave do provedor no cofre. Separa os tokens das duas aplicações. */
  provedor: string;
  /** Para a mensagem de erro dizer qual variável falta. */
  variaveis: string;
};

export function dadosDoApp(app: App): DadosApp {
  if (app === "escrita") {
    return {
      app,
      appId: process.env.MELI_ESCRITA_APP_ID,
      segredo: process.env.MELI_ESCRITA_SECRET,
      provedor: "mercado_livre_escrita",
      variaveis: "MELI_ESCRITA_APP_ID e MELI_ESCRITA_SECRET",
    };
  }
  return {
    app,
    appId: process.env.MELI_APP_ID,
    segredo: process.env.MELI_CLIENT_SECRET,
    provedor: "mercado_livre",
    variaveis: "MELI_APP_ID e MELI_CLIENT_SECRET",
  };
}

/**
 * Lê o nome da aplicação de um texto qualquer (query, state) sem confiar
 * nele. Só "escrita" é escrita; qualquer outra coisa é leitura, que é o
 * lado que não altera nada.
 */
export function appDe(valor: string | null | undefined): App {
  return valor === "escrita" ? "escrita" : "leitura";
}

/** A aplicação de escrita está configurada neste servidor? */
export function escritaConfigurada() {
  const d = dadosDoApp("escrita");
  return Boolean(d.appId && d.segredo);
}
