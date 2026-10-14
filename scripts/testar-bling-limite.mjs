import assert from 'node:assert/strict';
import {criarLeitorBling, esperaPedida} from '../src/lib/bling/limite.ts';

function cenario() {
  let tempo = 0;
  const pausas = [];
  const ler = criarLeitorBling({
    agora: () => tempo,
    dormir: async ms => {pausas.push(ms); tempo += ms;},
    aleatorio: () => 0,
  });
  return {ler, pausas, agora: () => tempo};
}
const ok = () => Response.json({data: []});
const limite = (headers = {}, description = 'O limite de requisições por segundo foi atingido') =>
  Response.json({error: {description}}, {status: 429, headers});

// Concorrência real de promises: cada janela móvel de 1s fica dentro da cota.
{
  const c = cenario(), inicios = [], ordem = [];
  let ativas = 0, maxAtivas = 0;
  await Promise.all(Array.from({length: 9}, (_, i) => c.ler('empresa-a', '/pedidos/vendas', async () => {
    ordem.push(i);
    return async () => {
      inicios.push(c.agora());
      maxAtivas = Math.max(maxAtivas, ++ativas);
      await Promise.resolve();
      ativas--;
      return ok();
    };
  })));
  assert.equal(maxAtivas, 1, 'Pedidos da mesma conta não saem simultaneamente');
  assert.deepEqual(ordem, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  for (const inicio of inicios) assert.ok(inicios.filter(t => t >= inicio && t < inicio + 1000).length <= 3);
}

// Uma conta lenta não interrompe a consulta de outra empresa.
{
  const c = cenario();
  let liberar, concluiuA = false;
  const a = c.ler('a', '/depositos', async () => () => new Promise(resolve => {liberar = resolve;}))
    .then(() => {concluiuA = true;});
  const b = await c.ler('b', '/depositos', async () => async () => ok());
  assert.equal(b.status, 200);
  assert.equal(concluiuA, false);
  liberar(ok());
  await a;
}

// Retry-After pausa também as chamadas que já estavam aguardando na conta.
{
  const c = cenario(), inicios = [];
  let preparacoes = 0;
  const preparar = async () => {
    preparacoes++;
    return async () => {
      inicios.push(c.agora());
      return inicios.length === 1 ? limite({'Retry-After': '7'}) : ok();
    };
  };
  const resultados = await Promise.all([
    c.ler('a', '/pedidos/vendas', preparar),
    c.ler('a', '/estoques/saldos/1', preparar),
  ]);
  assert.ok(resultados.every(r => r.ok));
  assert.ok(inicios[1] - inicios[0] >= 7000, 'Não tenta antes do prazo pedido pelo servidor');
  assert.ok(inicios[2] - inicios[1] >= 400, 'Estoque não dispara junto com a repetição de pedidos');
  assert.equal(preparacoes, 2, 'Repetir uma leitura não renova o token');
}

// Datas HTTP, diferença entre relógios e cabeçalhos ausentes/inválidos.
{
  const servidor = Date.UTC(2030, 0, 1, 12);
  const data = new Date(servidor + 12000).toUTCString();
  assert.equal(esperaPedida(new Headers({'retry-after': data}), servidor), 12000);
  assert.equal(esperaPedida(new Headers({'retry-after': data, date: new Date(servidor).toUTCString()}), servidor - 3600000), 12000);
  assert.equal(esperaPedida(new Headers({'retry-after': '120'}), servidor), 120000);
  assert.equal(esperaPedida(new Headers({'retry-after': 'inválido'}), servidor), null);
  assert.equal(esperaPedida(new Headers(), servidor), null);
}

// Sem Retry-After, as pausas crescem até a leitura ser aceita.
{
  const c = cenario(), inicios = [];
  const r = await c.ler('a', '/pedidos/vendas', async () => async () => {
    inicios.push(c.agora());
    return inicios.length < 4 ? limite() : ok();
  });
  assert.equal(r.status, 200);
  const pausas = inicios.slice(1).map((t, i) => t - inicios[i]);
  assert.ok(pausas[0] >= 2000 && pausas[1] > pausas[0] && pausas[2] > pausas[1]);
}

// Uma recusa persistente termina como falha; nunca vira atualização concluída.
{
  const c = cenario();
  let chamadas = 0;
  await assert.rejects(() => c.ler('a', '/pedidos/vendas', async () => async () => {
    chamadas++;
    return limite();
  }), /leitura ficou pendente.*Atualizar agora/);
  assert.ok(chamadas <= 5);
  assert.ok(c.agora() <= 45000);
}

// Pausa longa é preservada, não reduzida ao tempo disponível da função.
{
  const c = cenario();
  let chamadas = 0;
  const preparar = async () => async () => {chamadas++; return limite({'retry-after': '120'});};
  await assert.rejects(() => c.ler('a', '/pedidos/vendas', preparar), /120 segundos/);
  await assert.rejects(() => c.ler('a', '/depositos', preparar), /120 segundos/);
  assert.equal(chamadas, 1, 'Outra etapa não insiste durante a pausa longa');
  assert.equal(c.agora(), 0, 'Não prende a função por dois minutos');
}

// Cota diária não é tratada como uma pausa de segundos e não repete a chamada.
{
  const c = cenario();
  let chamadas = 0;
  await assert.rejects(() => c.ler('a', '/pedidos/vendas', async () => async () => {
    chamadas++;
    return limite({}, 'Limite de requisições diárias atingido');
  }), /limite diário/);
  assert.equal(chamadas, 1);
}

// Falha de rede ou de autorização não deixa a fila presa nem aciona repetição 429.
{
  const c = cenario();
  const falha = c.ler('a', '/pedidos/vendas', async () => async () => {throw new Error('rede indisponível');});
  const depois = c.ler('a', '/depositos', async () => async () => Response.json({}, {status: 403}));
  await assert.rejects(() => falha, /rede indisponível/);
  assert.equal((await depois).status, 403);
}
console.log('OK: fila concorrente, contas independentes, pausa compartilhada, Retry-After, tentativas limitadas, cota diária e recuperação após falhas.');
