# Multiempresa: o que falta para vender a plataforma

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

O banco já faz o trabalho: `convidar_membro`, `aceitar_convite` e
`convite_por_token` existem desde a migração 20. Nenhuma tela as chama, e
a tabela `convites` só ficou pronta hoje.

Falta a tela de equipe e a página que aceita o convite pelo token.

## Fase 4 — cobrança

Não existe nada: nem plano, nem assinatura, nem limite de uso. Fica para
quando houver quem cobrar — construir antes é desenhar no escuro.

## Ordem e porquê

As três primeiras fases são o mínimo para um cliente piloto, e nessa
ordem: sem a Fase 1 o segundo cliente lê os dados do primeiro; sem a Fase 2
cada cadastro depende de nós; sem a Fase 3 só o dono entra.

A Fase 1 é a única que mexe em código que já roda em produção todo dia.
As outras duas acrescentam tela sobre banco que já existe.
