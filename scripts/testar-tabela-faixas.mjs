// node scripts/testar-tabela-faixas.mjs — confere o leitor da tabela por faixa.
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { lerTabelaFaixas, faixaDe } from "../src/lib/planilhas/tabela-faixas.ts";

assert.equal(faixaDe("20,5%"), 0.205);
assert.equal(faixaDe(0.045), 0.045);
assert.equal(faixaDe(16.5), 0.165);
assert.equal(faixaDe("SKU"), null);

const wb = new ExcelJS.Workbook();
const fluxo = wb.addWorksheet("Probel (Fluxo)");
fluxo.addRow(["SKU", "Nome", "4,5%", "15,5%", "16,5%", "17,5%"]);
fluxo.addRow(["pa1", "Colchão", 100, 130, 120, 125]); // 15,5% fora de ordem
const ant = wb.addWorksheet("Probel (Antecipado)");
ant.addRow(["SKU", 0.045, 0.165]);
ant.addRow(["PA1", 90, 110]);

const f = lerTabelaFaixas(wb, "fluxo");
assert.deepEqual([...f.get("PA1")], [[0.045, 100], [0.155, 110], [0.165, 120], [0.175, 125]]);
assert.deepEqual([...lerTabelaFaixas(wb, "antecipado").get("PA1")], [[0.045, 90], [0.165, 110]]);

const so = new ExcelJS.Workbook();
so.addWorksheet("Tabela").addRow(["SKU", "10%", "12%"]);
const soAnt = new ExcelJS.Workbook();
soAnt.addWorksheet("X (Antecipado)").addRow(["SKU", "10%", "12%"]);
assert.throws(() => lerTabelaFaixas(soAnt, "fluxo"), /nenhuma de Fluxo/);
so.getWorksheet("Tabela").addRow(["BF1", 50, 55]);
assert.equal(lerTabelaFaixas(so, "fluxo").get("BF1").get(0.12), 55);
console.log("ok");
