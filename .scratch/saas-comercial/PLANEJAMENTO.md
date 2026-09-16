# SaaS comercial — planejamento

Escrito em 16/09/2026, a partir do pedido: *"criar fluxo de entrada do
cliente contratante, criar o banco unificando as empresas, estruture tudo
que precisa para eu começar a comercializar"*.

Este documento tem três partes:

1. **O que já existe** — e é mais do que a conversa sugeria
2. **O que falta para vender** — em ordem de bloqueio
3. **As pendências do sistema atual** — o que corrigir antes de convidar
   um segundo cliente

---

## 1. O que já existe

### O banco já é multiempresa

O pedido foi "criar o banco unificando as empresas". **Ele já está feito.**
Não é uma adaptação a fazer; é o desenho desde o primeiro commit.

| Peça | Estado |
|---|---|
| `organizacoes` — a empresa contratante | existe |
| `operacoes` — unidade de negócio dentro dela | existe, 3 cadastradas |
| `membros` + papéis (proprietário/admin/editor/leitor) | existe |
| `membros_operacoes` — acesso a operações específicas | existe |
| `operacao_id` em toda tabela de dado | existe |
| RLS **forçado** em todas elas | existe |
| `integracoes` por operação e conta de canal | existe |
| Cofre de segredos (Supabase Vault + `SECURITY DEFINER`) | existe |

O que há hoje é **um SaaS com uma organização cadastrada** — a Probel, com
3 operações e 3 usuários. Não existe um "sistema da Probel" para converter.

Isso muda o tamanho do trabalho: o que falta não é arquitetura de dados, é
**porta de entrada e cobrança**.

### Sobre duplicar o projeto

**Não dupliquei.** Existe um repositório, uma branch `main`.

E acho que não se deve duplicar — a razão está em
`docs/adr/0001-nao-duplicar-o-projeto.md`. Resumo: duplicar o repo não
isola o que dá medo (os dois apontariam para o **mesmo banco**, e é a
migração que quebra, não o código), e cria duas cópias divergindo para
sempre.

A proposta no lugar: **uma branch `saas`, um banco de desenvolvimento
separado, um deploy de prévia**. Isso isola de verdade, e sem o dia de
"juntar as duas versões".

**Esta é uma decisão sua.** Se preferir duplicar mesmo assim, eu duplico —
só queria que a escolha fosse informada.

---

## 2. O que falta para vender

Em ordem de bloqueio: cada item destrava o seguinte.

### Bloqueador 1 — O cliente não consegue entrar sozinho

Hoje a tela de login diz: *"Peça a quem administra a operação — contas são
criadas por dentro do sistema"*. Não existe cadastro; alguém cria a conta
no banco à mão.

**O que construir:**

- Página de cadastro: e-mail, senha, nome da empresa
- Ao confirmar, criar numa transação: `organizacao` + `operacao` padrão +
  `membro` como `proprietario`
- Convite de outros membros por e-mail, com papel
- Página de aceite de convite

**A parte que exige cuidado:** criar organização é a única escrita do
sistema que **não** acontece dentro de um tenant — ela cria o tenant. A RLS
não protege aqui, porque ainda não há linha para proteger. Precisa ser uma
função no banco (`SECURITY DEFINER`), com o cuidado de não deixar ninguém
criar organização para outra pessoa.

**Tamanho:** 2 a 3 dias.

### Bloqueador 2 — O cliente não consegue conectar o Mercado Livre dele

Hoje o token vem de variável de ambiente (`MELI_REFRESH_TOKEN`) — uma por
instalação. Com dois clientes, o segundo usaria a conta do primeiro.

A infraestrutura certa **já existe**: `integracoes` guarda por operação e
conta, e o cofre guarda o segredo. O que falta é o caminho do meio.

**O que construir:**

- Botão "Conectar Mercado Livre" → OAuth do Meli
- Rota de retorno que grava o refresh token no cofre, ligado à `integracao`
- `refreshDe()` passa a ler do cofre, não do ambiente
- Tela de integrações mostrando o que está conectado e desde quando

**O que isso também conserta:** a sincronização automática está parada
desde 14/09 justamente porque depende dessas variáveis. Este item
desbloqueia o SaaS **e** conserta a operação de hoje.

**Tamanho:** 3 a 4 dias.

### Bloqueador 3 — Não há cobrança

**O que construir:**

- `planos` e `assinaturas` (organização, plano, status, vigência)
- Integração com um gateway — Stripe ou Asaas; Asaas é mais comum no Brasil
- Webhook que atualiza o status da assinatura
- Bloqueio suave: assinatura vencida vira leitura, não porta fechada
- Trial de N dias sem cartão

**Decisão de produto que só você responde:** cobrar por operação, por
usuário, por volume de pedido, ou fixo? Isso muda o schema, então vale
decidir antes de escrever a tabela.

**Tamanho:** 4 a 5 dias, depois da decisão.

### Bloqueador 4 — Limites e isolamento de custo

Um cliente sincronizando 50 mil anúncios não pode derrubar a sincronização
dos outros. Hoje o cron roda tudo em série, sem teto.

**O que construir:**

- Fila por organização, não uma varredura só
- Teto de chamadas por organização por dia
- Registro de uso por organização (para cobrar por volume, se for o caso)

**Tamanho:** 2 a 3 dias. **Pode esperar o segundo ou terceiro cliente** —
não bloqueia o primeiro.

---

## 3. Ordem sugerida

| # | O quê | Dias | Destrava |
|---|---|---|---|
| 0 | Branch `saas` + banco de desenvolvimento | 0,5 | trabalhar sem medo |
| 1 | OAuth do Meli por organização | 3–4 | **conserta a sync parada hoje** |
| 2 | Fluxo de entrada + convites | 2–3 | o cliente entra sozinho |
| 3 | Planos e assinatura | 4–5 | cobrar |
| 4 | Limites por organização | 2–3 | o segundo cliente |

O item 1 vem antes do 2 de propósito: ele é o único que **melhora o sistema
de hoje** enquanto constrói o de amanhã. A sincronização está parada há dois
dias por causa dele.

Total até o primeiro cliente pagante: **cerca de 10 a 12 dias** de
trabalho.

---

## 4. O que só você pode responder

1. **Duplicar ou isolar por ambiente?** (ver o ADR)
2. **Cobrar por quê** — operação, usuário, volume ou fixo?
3. **Quanto?** — muda o que é plano básico e o que é avançado
4. **Trial com ou sem cartão?**
5. **Quem é o primeiro cliente além da Probel?** Um cliente real conhecido
   vale mais que dez suposições sobre o que o mercado quer.

---

## 5. Pendências do sistema atual

O que precisa ser corrigido, melhorado ou feito antes de convidar alguém de
fora. Um cliente novo encontra os mesmos defeitos que a Probel aprendeu a
contornar.

### Travado em você — nada avança sem isso

| O quê | Por quê |
|---|---|
| `CRON_SECRET` na Vercel | sem ele a sincronização automática está **desligada** |
| `MELI_APP_ID`, `MELI_CLIENT_SECRET`, `MELI_REFRESH_TOKEN` na Vercel | o sistema não recebe dado desde **14/09** |
| `MELI_REFRESH_TOKEN_2` — autorização **nova** da conta a prazo | não use o token da pasta de APIs; ele rotaciona e quebra suas automações |
| Rodar `db/18_promocao_multicanal.sql` | `promocao_canais` não existe; as telas de Promoções falham |
| Token cru da Vtrina (`x-access-token`) | o salvo está criptografado para outro usuário do Windows |

### Defeito de dado — o mais grave da lista

**A planilha e a API da VTEX discordam sobre cancelamento.** O banco diz
9% em setembro na Loja própria; a API, consultada direto, diz **51% na
semana de 08 a 14/09** (204 de 401 pedidos). Uma das duas fontes está
errada, e a decisão de preço depende disso.

### Custos que travam o Financeiro

Dos 142 produtos, **zero** têm custo de mercadoria, embalagem ou alíquota
de imposto. Por isso a margem cobre 0% da receita e a linha de Resultado
não existe.

Começar pela curva A resolve a maior parte — não precisa dos 142.

### As três propostas aguardando sua decisão

Estão em `https://claude.ai/artifact/MHzB2e8WDPmMaKo8WSj3fA`:

1. **Alertas** — hoje toda regra olha a operação inteira somada, e no
   consolidado um canal quebrando é diluído por outro. Casas Bahia
   cancelou 100% dos pedidos de agosto e ninguém foi avisado.
2. **Promoções** — unificar as quatro abas numa só, organizada por
   campanha, com o "depois da campanha" que hoje não existe em lugar
   nenhum.
3. **Apresentação** — o roteiro é fixo; deveria mudar com o que aconteceu
   no período.

### Já resolvido

34 dos 37 itens da revisão tela a tela. O que sobrou são as três propostas
acima, que dependem da sua decisão.

---

## 6. Riscos

**O maior:** o sistema está sem dado novo desde 14/09 e ninguém foi
avisado por ele mesmo — eu descobri conferindo à mão. Antes de vender para
alguém, o sistema precisa saber dizer quando parou de receber. É o
Bloqueador 1 da proposta de Alertas.

**O segundo:** custo por SKU é digitação, e nenhuma API tem. Um cliente
novo vai chegar na mesma parede, e a tela precisa deixar claro desde o
primeiro dia que a margem depende dele preencher aquilo.

**O terceiro:** hoje existe uma organização. Nenhuma linha de RLS foi
testada com duas. Antes do primeiro cliente, criar uma organização de
mentira no banco de desenvolvimento e **tentar ver o dado da outra** — se
conseguir, é falha grave, e é melhor descobrir agora.
