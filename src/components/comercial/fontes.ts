import { Bricolage_Grotesque, Caveat, Instrument_Sans } from "next/font/google";

/** Fontes só do site comercial: o sistema continua com Inter. */
export const fonteTitulo = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--gz-f-titulo", display: "swap" });
export const fonteTexto = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--gz-f-texto", display: "swap" });
export const fonteCaneta = Caveat({ subsets: ["latin"], weight: ["500", "700"], variable: "--gz-f-caneta", display: "swap" });
export const fontesSite = `${fonteTitulo.variable} ${fonteTexto.variable} ${fonteCaneta.variable}`;
