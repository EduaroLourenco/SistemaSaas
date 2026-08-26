# Ligar o Mercado Livre

Tempo estimado: 15 minutos.

> **Não mexa na aplicação que já existe.** Ela é usada pelos seus agentes
> atuais, e trocar o secret dela derrubaria todos de uma vez. O que vamos
> fazer é criar uma aplicação **nova**, só para esta plataforma.

---

## Por que uma aplicação separada

Cada aplicação tem seu próprio `appId` e `clientSecret`. Isso significa que:

- **A aplicação atual continua intacta.** Seus agentes seguem rodando sem
  saber que esta existe.
- **Se um dia esta plataforma vazar credencial, você revoga só ela.** Sem
  parar nada mais.
- **Dá para ver quem consumiu o quê.** O painel do Mercado Livre mostra
  chamadas por aplicação, então o consumo desta não se mistura com o dos
  agentes.

Aplicação por sistema é a regra. Compartilhar credencial entre sistemas é
o que transforma um problema pequeno numa parada geral.

---

## Passo 1 — Criar a aplicação

1. Entre em [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br)
   → **Suas aplicações** → **Criar aplicação**.
2. Preencha:

| Campo | O que pôr |
|---|---|
| Nome | `Plataforma — painel interno` |
| Descrição curta | Painel de indicadores e análise de anúncios |
| **URI de redirect** | `http://localhost:8080/callback` |
| Tópicos de notificação | pode deixar em branco por enquanto |

3. Nas permissões, marque **leitura** (`read`) e **offline_access**.

O `offline_access` é o que dá o *refresh token* — sem ele o acesso morre em
seis horas e você teria que refazer o login toda vez.

4. Guarde o **App ID** e o **Client Secret** que aparecerem. O secret só é
   exibido uma vez; salve num gerenciador de senhas.

---

## Passo 2 — Autorizar nas DUAS contas

Este é o passo que costuma ser feito pela metade.

O token do Mercado Livre é **por conta de vendedor**. Uma autorização não
enxerga os pedidos da outra — não existe token que cubra as duas. A mesma
aplicação precisa ser autorizada duas vezes, uma em cada conta.

**Conta de São Paulo (pronta entrega):**

1. Faça login no Mercado Livre com essa conta.
2. No terminal, dentro da pasta do CLI:

```bash
npm run cli -- init --appId SEU_APP_ID --clientSecret SEU_SECRET --redirectUri http://localhost:8080/callback
```

```bash
npm run cli -- login
```

3. O navegador abre, você autoriza, e o CLI captura o código sozinho —
   ele sobe um servidor local na porta 8080. Guarde o `refresh_token` que
   aparecer.

**Segunda conta (venda a prazo):**

4. **Saia** do Mercado Livre e entre com a segunda conta.
5. Rode `npm run cli -- login` de novo.
6. Guarde o segundo `refresh_token`.

O `appId` e o `clientSecret` são os mesmos nas duas. Muda só o refresh
token.

> Se o `login` ficar parado esperando, o URI de redirect da aplicação não
> está como `http://localhost:8080/callback`. Corrija no painel e repita.

---

## Passo 3 — Configurar a plataforma

Crie o arquivo `.env.local` na raiz de `Desktop/plataforma`:

```bash
MELI_APP_ID=id_da_aplicacao_nova
MELI_CLIENT_SECRET=secret_da_aplicacao_nova
MELI_REFRESH_TOKEN=refresh_token_da_conta_sao_paulo
MELI_REFRESH_TOKEN_2=refresh_token_da_segunda_conta
```

Reinicie o servidor. Pronto.

Se você ligar só uma conta, a outra continua entrando por planilha e o
sistema avisa qual está faltando, em vez de quebrar.

---

## Passo 4 — Conferir

Chame `/api/diagnostico/historico` no navegador. Ela sonda de verdade
quanto de passado cada endpoint devolve — pedidos e visitas, em janelas de
1, 3, 6, 12, 18, 24 e 36 meses atrás.

Serve para você não descobrir depois que a análise de um ano não tinha
como existir.

Um aviso que a própria resposta traz: cada sonda olha **um dia**. Total
zero pode ser dia sem venda, não falta de histórico. Valor acima de zero é
que prova acesso àquele período.

---

## Sobre a credencial que veio no zip

O pacote `Meli+` que você enviou trazia a pasta `.meli/` com o
`clientSecret` da aplicação **antiga** e um `refresh_token`. O
`.gitignore` estava certo — nada disso foi para o Git — mas os valores
saíram da sua máquina.

Criar a aplicação nova **não resolve isso**. Resolve o futuro; o que
vazou continua válido.

O que dá para fazer sem derrubar os agentes:

**O `clientSecret` sozinho não abre nada.** Para ler dado é preciso o par
secret + refresh token. Então basta invalidar o refresh token que vazou.

**Refazer o login da aplicação antiga naquela conta** costuma emitir um
refresh token novo e derrubar o anterior. Você atualiza o agente com o
token novo e o que vazou morre. O secret não muda, então nada mais é
afetado.

**Confirme em vez de confiar.** Depois de refazer o login, teste o token
antigo uma vez. Se ainda funcionar, a única saída é revogar a autorização
da aplicação naquela conta — e aí todos os agentes que usam aquela conta
precisam ser reautorizados.

Não é urgência de pânico. É higiene, e o custo de fazer agora é bem menor
que o de descobrir depois.

---

## O que a plataforma consulta

Com as duas contas ligadas, estas rotas passam a devolver dado real. Todas
aceitam `?conta=principal` ou `?conta=segunda`.

| Rota | O que traz |
|---|---|
| `/api/vendas/pedidos?de=&ate=` | Pedidos consolidados por dia e por anúncio, com preço pago |
| `/api/anuncios/visitas?de=&ate=` | Visitas por anúncio |
| `/api/anuncios/catalogo` | Seus anúncios com preço, tipo, status e estoque |
| `/api/anuncios/precos` | Retrato do preço da vitrine (o botão "Atualizar preços") |
| `/api/monitoramento/frete` | Frete por anúncio e CEP |
| `/api/monitoramento/concorrentes` | Preço de concorrente na busca do canal |
| `/api/diagnostico/historico` | Até onde vai o histórico de cada endpoint |

**O que não vem por API:** promoções (a Central de Promoções continua por
planilha), preço ideal e Fórmula base (cálculo seu), e histórico do preço
da vitrine — a API só devolve o preço de agora, e é por isso que o retrato
semanal existe.
