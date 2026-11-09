import type { PlanlamaCalismasi } from '../../tipler.ts';
import { ornekCalisma } from '../ornek.ts';

// Örnek çalışma (motor/ornek.ts) uydurmadır; her adımı tek tezgâh yapar. Tezgâh 1'in yaptığı adımları tezgâh 2 de yapabilir hale gelir.
export const ikiTezgahli = (): PlanlamaCalismasi => {
  const c = ornekCalisma();
  for (const u of c.D.urunler) {
    for (const a of (u.rota ?? []) as { tezgahlar?: { id: string }[] }[]) {
      if (a.tezgahlar?.some((t) => t.id === '1')) a.tezgahlar.push({ id: '2', ayar: 30, cevrim: 4.5 } as { id: string });
    }
  }
  return c;
};
