// Pré-carregado apenas nas regressões isoladas. Nenhum teste pode abrir rede.
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
const blocked = () => { throw new Error("Rede externa bloqueada pela execução offline do redesign."); };
globalThis.fetch = blocked;
net.connect = blocked;
net.createConnection = blocked;
net.Socket.prototype.connect = blocked;
tls.connect = blocked;
http.request = blocked;
http.get = blocked;
https.request = blocked;
https.get = blocked;
syncBuiltinESMExports();
