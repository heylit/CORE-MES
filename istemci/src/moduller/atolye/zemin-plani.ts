import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { Taslak } from './duzenleyici-durumu.ts';
import { fabrikaTaslagiKur, kapsamKutusu, taslakKur } from './duzenleyici-durumu.ts';
import type { GorunumKutusu } from './PlanCizimi.tsx';

// Salt okunur iki boyutlu plan: taslak, görünüm kutusu ve anahtar çevirisi. Taslakta raf ve alan anahtarı yereldir
// (taslak bölüm sırasıyla kurulur); dışarıya kayıtlı kimlikli anahtar (raf:12, alan:7) verilir. İstasyon, makine ve bölüm
// anahtarı zaten kimliklidir. Saf: Sahne3B'nin iki boyutlu planı ve dışarıya açılan fabrika zemini (#114) aynısını kullanır.
export interface ZeminPlani {
  taslak: Taslak;
  kutu: GorunumKutusu;
  kayitli: (anahtar: string) => string | null;
  taslakta: (kayitli: string) => string;
}

export function zeminPlaniKur(yerlesimler: readonly YerlesimCevabi[], fabrika: boolean): ZeminPlani {
  const taslak = fabrika ? fabrikaTaslagiKur(yerlesimler) : taslakKur(yerlesimler[0] as YerlesimCevabi);
  const k = kapsamKutusu(taslak);
  const pay = Math.max(1.5, Math.max(k.x1 - k.x0, k.z1 - k.z0) * 0.05) + (fabrika ? 2.5 : 0);
  const kayitliAlanlar = yerlesimler.flatMap((y) => y.alanlar);
  const rafAnahtari = new Map(taslak.raflar.map((r) => [r.anahtar, `raf:${r.id ?? 0}`]));
  const alanAnahtari = new Map(taslak.alanlar.map((a, i) => [a.anahtar, `alan:${kayitliAlanlar[i]?.id ?? 0}`]));
  const geri = new Map([...rafAnahtari, ...alanAnahtari].map(([a, b]) => [b, a]));
  return {
    taslak,
    kutu: { x: k.x0 - pay, y: k.z0 - pay, g: k.x1 - k.x0 + pay * 2, d: k.z1 - k.z0 + pay * 2 },
    kayitli: (anahtar) => rafAnahtari.get(anahtar) ?? alanAnahtari.get(anahtar) ?? (/^(istasyon|makine|bolum):/.test(anahtar) ? anahtar : null),
    taslakta: (kayitli) => geri.get(kayitli) ?? kayitli,
  };
}
