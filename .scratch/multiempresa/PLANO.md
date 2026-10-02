# Multiempresa: o que falta para vender a plataforma

> **Andamento** — Fase 1 e Fase 2 feitas e commitadas (`fcbf774`, `63b58ab`).
> Fase 3 escrita, e depende de rodar `db/22_equipe.sql`. Fase 4 (cobrança)
> segue fora de escopo. O que ficou pendente do seu lado está no fim.

## O estado de hoje

O cadastro funciona. `/cadastro` cria o usuário, `/comecar` chama
`criar_organizacao` e monta organização, operação e membro proprietário
numa transação só. O isolamento também: cada tabela carrega `operacao_id`
e as políticas `pode_ver_operacao` / `pode_editar_operacao` filtram tudo.
Quem entra sem `membros` vê telas vazias — é o RLS funcionando, e é por
isso que `/comecar` existe.

O que impede vender é mais estreito do que parecia.

## O bloqueio: credencial de canal é global

```ts
export type Conta = "principal" | "segunda";
```

Esse apelido resolve credencial por variável de ambiente:
`MELI_REFRESH_TOKEN` e `MELI_REFRESH_TOKEN_2`. Uma segunda empresa que
clicasse em "Conectar" hoje entraria na conta do Mercado Livre da Probel.
A VTEX é igual, por `VTEX_ACCOUNT` / `VTEX_APP_KEY` / `VTEX_APP_TOKEN`.

O raio da mudança é menor do que o grep sugere. `Conta` aparece em 25
arquivos, mas em `src/lib/dados/*` é outra coisa — um tipo local, a forma
da linha de `contas_canal`, ou o recorte de tela de `src/lib/recorte.ts`.
O apelido de credencial é importado em três lugares e usado em dois
módulos:

| arquivo | assinaturas que pedem `Conta` |
|---|---|
| `src/lib/meli/cliente.ts` | 15 |
| `src/lib/meli/ads.ts` | 6 |
| `src/app/api/meli/conectar` e `/callback` | 2 |

### O que NÃO muda

`MELI_APP_ID` e `MELI_CLIENT_SECRET` continuam globais, e está certo: são
credenciais do *aplicativo*, não do vendedor. Um aplicativo do Mercado
Livre atende muitos vendedores — cada um autoriza por OAuth e devolve o
próprio refresh token. É o que torna a Fase 1 pequena.

### O cofre está encanado, mas vazio

`integracoes` tem `operacao_id`, `conta_canal_id` (migração 19),
`credencial_ref` apontando para o Vault do Supabase, e `config` jsonb. O
`tokens.ts` já sabe gravar e ler de lá. Falta o cliente parar de perguntar
ao ambiente e passar a perguntar ao banco.

Duas coisas que o banco contou quando fui olhar:

As duas integrações do Meli **já têm `conta_canal_id`** preenchido
(`a37f9d9b…` São Paulo, `a730ac84…` a prazo). A chave de busca pode virar
esse id direto, sem migração de dados e sem caminho de compatibilidade.

Mas `credencial_ref` está **nulo nas duas**: o cofre nunca guardou um
token. A produção inteira roda com a semente do ambiente. Isso é o motivo
de a sincronização agendada nunca ter se sustentado — e some quando o
`CRON_SECRET` entrar e a primeira renovação gravar no cofre.

### O defeito que eu achei e não era

Eu tinha anotado `unique (canal_id, nome)` em `contas_canal` como furo
multiempresa. Não é: `canais` também carrega `operacao_id`, então um
`canal_id` já pertence a uma operação só e duas empresas nunca disputam o
mesmo nome. Fica registrado para ninguém "consertar" depois.

## Fase 1 — credencial por empresa

O trabalho que destrava a venda.

1. `Conta` deixa de ser apelido e passa a ser o `conta_canal_id` (uuid).
   Onde hoje se escreve `"principal"`, passa a ir o id da conta.
2. `accessToken()` resolve pela linha de `integracoes` daquela conta, sem
   tocar em `process.env`.
3. `CONTAS` sai do código. A lista de contas vem do banco, por operação.
4. `conectar` e `callback` passam a receber `conta_canal_id` e gravar o
   token na integração certa.
5. VTEX: credenciais saem do ambiente para `integracoes.config` mais o
   Vault, no mesmo desenho do Meli.
6. Os scripts de `scripts/local/` passam a receber o id em vez do apelido.

### A semente do ambiente morre devagar

`MELI_REFRESH_TOKEN` existe para a produção falar com o Meli sem ninguém
refazer a autorização. Num SaaS ela não tem como existir — não há variável
de ambiente por cliente.

Então ela não morre de uma vez: a busca principal passa a ser o cofre, e a
semente fica como recurso de quem ainda não tem token gravado, achada pelo
apelido que já está em `config.conta` na própria linha que acabamos de ler.
Nenhuma consulta a mais, e ela se apaga sozinha na primeira renovação que
gravar no cofre.

## Fase 2 — cadastrar canal pela tela

Não existe nenhuma tela que escreva em `contas_canal`: as contas de hoje
foram inseridas direto no banco. Sem isso o cliente não consegue dizer
"tenho uma conta Magalu", e cada cadastro vira trabalho manual nosso.

Tela de lista e formulário, com o botão de conectar do canal que tiver API.

## Fase 3 — convidar equipe

O banco já fazia metade: `convidar_membro`, `aceitar_convite` e
`convite_por_token` existem desde a migração 20, e nenhuma tela as chamava.

A outra metade faltava inteira, e não é comodidade. `membros` só tem
política de leitura — nenhuma tela conseguia mudar papel nem apagar a linha
de quem saiu da empresa, ou seja, **ex-funcionário continuaria entrando**.

Isso não se resolve com política de UPDATE/DELETE solta: a tela mandaria o
id e o banco obedeceria, inclusive para rebaixar o último proprietário e
deixar a empresa sem ninguém que possa administrar. Por isso
`db/22_equipe.sql` põe as travas dentro das funções:

- só proprietário ou administrador mexe em membro;
- ninguém rebaixa nem remove o último proprietário;
- administrador não promove alguém a proprietário;
- reconvidar substitui o convite pendente, porque `convites` tem
  `unique (organizacao_id, email)` e a segunda tentativa para o mesmo
  e-mail falharia — que é exatamente o que se faz quando o prazo venceu.

Remover um membro **mantém o que ele lançou**. Apagar lançamento junto
reescreveria o histórico financeiro de quem só saiu da empresa.

### Não há envio de e-mail

Convidar devolve um link, e quem convidou manda pelo canal que já usa. É
de propósito: a plataforma mandar mensagem em nome de alguém é outra
decisão, com domínio e remetente a configurar, e o link copiável resolve
hoje.

## Fase 4 — cobrança

Não existe nada: nem plano, nem assinatura, nem limite de uso. Fica para
quando houver quem cobrar — construir antes é desenhar no escuro.

## Do seu lado

Três coisas que só você destrava, em ordem de urgência:

**1. Rodar `db/22_equipe.sql`** no SQL Editor do Supabase. Sem ela a tela de
Equipe abre mas avisa que falta a migração.

**2. As credenciais do Meli estão VAZIAS no `.env.local`.** As quatro
variáveis existem como chave sem valor:

```
MELI_APP_ID=
MELI_CLIENT_SECRET=
MELI_REFRESH_TOKEN=
MELI_REFRESH_TOKEN_2=
```

É por isso que `credencial_ref` está nulo nas duas integrações: sem
`MELI_CLIENT_SECRET` nenhuma renovação jamais pôde acontecer. A plataforma
nunca falou com o Mercado Livre por conta própria — só os scripts locais,
com os tokens emprestados das suas pastas.

Isso deixa de importar quando o aplicativo novo existir: você cria, eu ponho
`MELI_APP_ID` e `MELI_CLIENT_SECRET` na Vercel, e aí a conexão pela tela
grava no cofre. A partir daí a semente do ambiente não é mais necessária.

**3. `CRON_SECRET` na Vercel**, para a sincronização agendada deixar de
responder 503.

## Ordem e porquê

As três primeiras fases são o mínimo para um cliente piloto, e nessa
ordem: sem a Fase 1 o segundo cliente lê os dados do primeiro; sem a Fase 2
cada cadastro depende de nós; sem a Fase 3 só o dono entra.

A Fase 1 é a única que mexe em código que já roda em produção todo dia.
As outras duas acrescentam tela sobre banco que já existe.
