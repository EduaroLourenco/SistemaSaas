begin;

alter table public.produtos
  add column if not exists margem_minima_pct numeric(5,2)
  check (margem_minima_pct between 0 and 60);

comment on column public.produtos.margem_minima_pct is
  'Margem mínima opcional nas promoções por margem. NULL herda a regra da campanha; zero é válido.';

notify pgrst, 'reload schema';
commit;
