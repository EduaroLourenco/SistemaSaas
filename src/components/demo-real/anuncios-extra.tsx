"use client";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { DemoState } from "@/lib/demo/store";
import { getAnunciosExtraFixture } from "@/lib/demo/fixtures-anuncios-extra";
const esperando=()=> <div className="gerizo-demo-loading" role="status">Preparando esta tela do Gerizo…</div>;
const carregar=(loader:()=>Promise<unknown>)=>dynamic<Record<string,unknown>>(()=>loader().then(m=>(m as {default:ComponentType<Record<string,unknown>>}).default),{ssr:false,loading:esperando});
export const ANUNCIOS_EXTRA_DEMO:Record<string,ComponentType<Record<string,unknown>>>= {
 "/anuncios/catalogo":carregar(()=>import("@/app/anuncios/catalogo/catalogo-cliente")),
 "/anuncios/tipo":carregar(()=>import("@/app/anuncios/tipo/tipo-cliente")),
 "/anuncios/preco-performance":carregar(()=>import("@/app/anuncios/preco-performance/performance-cliente")),
 "/anuncios/preco-alvo":carregar(()=>import("@/app/anuncios/preco-alvo/preco-alvo-cliente")),
 "/monitoramento/precos":carregar(()=>import("@/app/monitoramento/precos/precos-cliente")),
 "/monitoramento/fretes":carregar(()=>import("@/app/monitoramento/fretes/page")),
};
export function AnunciosExtraDemo({pathname,query,estado}:{pathname:string;query:URLSearchParams;estado?:DemoState}){
 const Tela=ANUNCIOS_EXTRA_DEMO[pathname],props=getAnunciosExtraFixture(pathname,query,estado);
 return Tela&&props?<Tela {...props}/>:null;
}
