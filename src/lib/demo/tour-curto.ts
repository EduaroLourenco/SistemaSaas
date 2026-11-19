import type { AlvoTourReal, PassoTourReal } from "./tour";
export type PassoVisual = PassoTourReal & { demonstrar?: AlvoTourReal[] };
type Ajuste = Partial<PassoVisual>;
const botao = (texto:string):AlvoTourReal => ({seletor:"#conteudo button",texto});
const abaAutomacoes = (texto:string):AlvoTourReal => ({seletor:'#conteudo [data-gerizo-tour="abas-automacoes"] button',texto});
const ajustes:Record<string,Ajuste> = {
 "resultado-dia":{titulo:"Quanto entrou no dia?",descricao:"Receita, meta e pedidos mostram o resultado da data escolhida.",experimentar:"Toque em outro dia para comparar.",alvo:{seletor:'#conteudo [data-gerizo-tour="resultado-dia"]'}},
 "calendario-dia":{titulo:"Volte para qualquer dia",descricao:"Cada dia abre seu resultado, canais e produtos.",experimentar:"Escolha uma data no calendário.",alvo:{seletor:'#conteudo [data-gerizo-tour="calendario-dia"]'}},
 "ritmo-semanal":{titulo:"Como está a semana?",descricao:"Veja o ritmo das vendas. A semana atual ainda está em andamento.",experimentar:"Compare com uma semana fechada."},
 "semanas-comparar":{titulo:"Compare as semanas",descricao:"Receita, pedidos e visitas ajudam a entender o que mudou.",experimentar:"Abra uma semana para ver o detalhe.",demonstrar:[botao("Semana a semana")],alvo:{seletor:"dialog[open] table, dialog[open] [role=region]"}},
 "buscar-produto":{titulo:"Ache um produto",descricao:"Busque pelo nome ou pelo SKU.",experimentar:"Experimente buscar Mesa."},
 "produto-recortes":{titulo:"Acompanhe o mesmo SKU",descricao:"Preço, vendas e conversão mostram como o produto mudou.",experimentar:"Troque a métrica ou o período."},
 "sinais-queda":{titulo:"Por onde começar?",descricao:"Os sinais separam queda de visitas, preço e falta de estoque.",experimentar:"Abra um produto para investigar."},
 "evidencia-queda":{titulo:"Veja o que mudou",descricao:"Compare preço, visitas e estoque antes de decidir.",experimentar:"Toque nos gráficos para ver os valores.",demonstrar:[{seletor:"#conteudo li > button[aria-expanded=false]"},botao("Evolução")],alvo:{seletor:"#conteudo .recharts-wrapper"}},
 "anuncios-resultado":{titulo:"O resultado de cada anúncio",descricao:"Visitas mostram interesse. Conversão mostra quanto virou venda.",experimentar:"No detalhe, compare Desempenho e Preços.",alvo:{seletor:'#conteudo .ads-inspector:has(.ads-identity), #conteudo .ads-list'}},
 "anuncios-comparar":{titulo:"Clássico ou Premium?",descricao:"Compare o mesmo produto nos dois formatos.",experimentar:"Confira visitas, conversão e tarifa."},
 "midia-margem":{titulo:"Quanto sobra depois da mídia?",descricao:"O investimento em anúncios entra na leitura da margem.",experimentar:"Confira o período e os custos apurados."},
 "midia-anuncio":{titulo:"Qual anúncio merece atenção?",descricao:"Compare o investimento com o resultado de cada item.",experimentar:"Toque em O que fazer para ver as oportunidades.",alvo:{seletor:'#conteudo [data-gerizo-tour="midia-anuncios"]'}},
 "campanhas-abertas":{titulo:"Veja as ofertas abertas",descricao:"Cada campanha mostra prazo e produtos convidados.",experimentar:"Abra uma campanha para conhecer os itens.",demonstrar:[abaAutomacoes("Promoções")],alvo:{seletor:"#conteudo .auto-lista"}},
 "revisar-proposta":{titulo:"O desconto cabe no preço?",descricao:"Confira a proposta e o piso antes de aprovar.",experimentar:"Compare o preço pedido com o seu mínimo.",demonstrar:[abaAutomacoes("Promoções"),{seletor:"#conteudo button.auto-linha"}],alvo:{seletor:'#conteudo [data-gerizo-tour="proposta-promocao"]'}},
 "fila-aprovacao":{titulo:"As decisões ficam juntas",descricao:"A fila reúne os produtos que precisam de revisão.",experimentar:"Escolha um item para conferir.",demonstrar:[abaAutomacoes("Fila")],alvo:{seletor:'#conteudo [data-gerizo-tour="fila-aprovacao"]'}},
 "ordem-regras":{titulo:"Seu critério vira uma regra",descricao:"A primeira regra que combinar com o item decide a sugestão.",experimentar:"Veja a ordem dos critérios."},
 "editar-regra":{titulo:"Escolha quando participar",descricao:"Você define as condições e a ação sugerida.",experimentar:"Abra uma regra para conhecer os campos."},
 "subir-planilha":{titulo:"Traga a planilha de promoção",descricao:"O Gerizo lê as ofertas e organiza a análise.",experimentar:"Baixe a planilha de exemplo e escolha o arquivo."},
 "piso-planilha":{titulo:"Defina o preço mínimo",descricao:"Use sua referência de preço, margem ou os dois critérios.",experimentar:"Escolha a regra antes de processar."},
 "resultado-planilha":{titulo:"Entenda cada decisão",descricao:"Veja quem participa, quem ficou de fora e o motivo.",experimentar:"Processe o exemplo e abra a conferência."},
 "rodadas-campanha":{titulo:"Acompanhe a campanha",descricao:"Os itens continuam ligados à rodada em que foram analisados.",experimentar:"Abra uma campanha processada."},
 "memoria-produto":{titulo:"O histórico ajuda na próxima oferta",descricao:"As rodadas guardam preço, piso e motivo de cada decisão.",experimentar:"Compare as propostas deste produto.",demonstrar:[{seletor:"#conteudo button.promo-product"}],alvo:{seletor:"dialog[open] .promo-prices, dialog[open] .promo-detail"}},
 "cadastro-custo":{titulo:"Quanto custa este produto?",descricao:"Mercadoria, embalagem e impostos compõem o custo por SKU.",experimentar:"Altere um custo e salve no exemplo."},
 "frete-comissao":{titulo:"O canal já trouxe estes valores",descricao:"Frete e comissão praticados vêm das vendas disponíveis.",experimentar:"Compare o praticado com a tabela."},
 "faixas-frete":{titulo:"Veja o frete por faixa",descricao:"Peso e tabela ajudam a preencher as referências do frete.",experimentar:"Confira a faixa de um produto.",demonstrar:[botao("Frete")],alvo:{seletor:"#conteudo table, #conteudo .finance-registry"}},
 "resultado-cobertura":{titulo:"O que ficou para a operação?",descricao:"O resultado considera os custos que foram apurados.",experimentar:"Confira também a cobertura dos custos."},
 "dre-composicao":{titulo:"Para onde vai a receita?",descricao:"A DRE separa custos da venda e despesas da operação.",experimentar:"Acompanhe as linhas até o resultado.",alvo:{seletor:"#conteudo .finance-statement"}},
 "dre-mensal":{titulo:"Compare a composição do resultado",descricao:"Veja os valores e quanto representam da receita.",experimentar:"Compare os meses disponíveis.",demonstrar:[botao("Demonstrativo mês a mês")],alvo:{seletor:"dialog[open] table"}},
 "campanha-plano":{titulo:"Organize a próxima campanha",descricao:"Datas, produtos e ações ficam no mesmo plano.",experimentar:"Selecione uma campanha.",demonstrar:[{seletor:'#conteudo button[aria-controls="st-campaign-navigation"][aria-expanded=false]'}],alvo:{seletor:"#conteudo .st-project-list"}},
 "quadro-plano":{titulo:"O que está em andamento?",descricao:"O quadro organiza as ações pela situação.",experimentar:"Abra uma ação para conhecer a ficha.",demonstrar:[{seletor:'#conteudo button[aria-controls="st-campaign-navigation"][aria-expanded=true]'},{seletor:'#conteudo [aria-label="Visualizações do planejamento"] button',texto:"Quadro"}],alvo:{seletor:"#conteudo .st-board"}},
 "mapa-plano":{titulo:"Enxergue as relações",descricao:"O mapa liga a campanha às ações do time.",experimentar:"Explore a campanha e suas ações.",demonstrar:[{seletor:'#conteudo [aria-label="Visualizações do planejamento"] button',texto:"Mapa"}],alvo:{seletor:"#conteudo .st-map-wrap"}},
 "prioridade-envios":{titulo:"O que precisa sair hoje?",descricao:"Prazo e situação ajudam a priorizar os pedidos.",experimentar:"Selecione um envio do exemplo."},
 "documentos-envios":{titulo:"Prepare a separação",descricao:"Revise os pedidos antes de gerar os documentos.",experimentar:"Abra a revisão dos pedidos selecionados."},
 "precos-canais":{demonstrar:[botao("Preços")]},
 "cotacao-preco":{demonstrar:[botao("Cotação")]},
 "cancelamentos-sku":{demonstrar:[botao("Por SKU")]},
};
export const passoVisual = (passo:PassoTourReal):PassoVisual => ({...passo,...ajustes[passo.id]});
