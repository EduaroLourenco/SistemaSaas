"use client";

import * as React from "react";
import Link from "next/link";

/* Passar o mouse de relance pelo menu não deve ir ao banco. */
const INTENCAO_MS = 120;

/** Link do menu: repousar o mouse já prepara a tela inteira. */
export function LinkRapido(props: React.ComponentProps<typeof Link>) {
  const [preparar, setPreparar] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Link
      {...props}
      prefetch={preparar ? true : null}
      onMouseEnter={() => {
        timer.current = setTimeout(() => setPreparar(true), INTENCAO_MS);
      }}
      onMouseLeave={() => clearTimeout(timer.current)}
    />
  );
}
