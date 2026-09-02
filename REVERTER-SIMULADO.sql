-- Apaga os custos SIMULADOS semeados para testar a análise de margem.
-- Só toca no que tem o carimbo; custo digitado de verdade não é afetado.
update produtos
   set custo_unitario = null, embalagem = null,
       aliquota_impostos = null, peso_kg = null, custo_atualizado_em = null
 where custo_atualizado_em = '1999-01-01T00:00:00Z';

delete from faixas_frete where observacao = 'SIMULADO';
