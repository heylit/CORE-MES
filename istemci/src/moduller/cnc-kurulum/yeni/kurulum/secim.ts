import type { EmirSecenegi, KurulumDurumu } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { byId, toolById, tools } from '../secici.ts';
import { seciliEmir, secimIsaretle, secimIsaretleri } from '../veri.ts';
import { GENEL_ADIM, K, adimdanAyrilinca, kurulumYenile } from './satirlar.ts';

// Kurulumun üretim emri, adımların "seçildi" işaretleri ve "Kurulum tamam" (bugün çerçeve köprüsünde: cerceve-kopru.ts 239-836).
// Köprü kartı DOM'dan okurdu; burada aynı liste çark adımlarından kurulur: kurulum kartında görünen her adım gerekir, boş cep gerekmez.

export const operasyon = (e: EmirSecenegi): string => `${e.emirNo} · OP${String(e.opNo)} ${e.ad}`;
export const etiket = (e: EmirSecenegi): string => `${operasyon(e)} · ${e.parcaNo} ${e.parcaAd} · ${String(e.adet)} adet · ${e.istasyon}`;

// Seçili emrin "kurulum tamam" kaydı hazırlık okumasıyla gelir.
export const S = {
  kurulum: null as KurulumDurumu | null,
  isaretleyebilir: false,
};

export function kurulumKaydi(k: KurulumDurumu | null): void { S.kurulum = k; kurulumYenile(); }

export function isaretler(): Record<string, unknown> { return secimIsaretleri(); }

export function isaretle(anahtar: string): void {
  if (!S.isaretleyebilir || anahtar === '' || seciliEmir() === null) return;
  const a = isaretler();
  if (a[anahtar] === true) return;
  secimIsaretle(anahtar);
}

export function isaretlemeyiKur(acik: boolean): void {
  S.isaretleyebilir = acik;
  adimdanAyrilinca(acik ? isaretle : null);
}

export interface Gereken { anahtar: string; ad: string; deger: string }

// Kurulum kartındaki satırlar (prototip sheetHTML 17720-17746): genel adımlar, dolu cepler ve bulunulan cep, ölçüm ve sarf.
export function gerekenler(): Gereken[] {
  const liste: Gereken[] = [], arr = tools();
  for (let i = 0; i < GENEL_ADIM; i++) {
    const d = K.defs[i]; if (!d || d.type !== 'single') continue;
    liste.push({ anahtar: d.key, ad: d.title, deger: byId(d.options, d.get())?.name ?? '—' });
  }
  for (let p = 0; p < arr.length; p++) {
    const t = toolById(arr[p] ?? 'empty');
    if (t.kind === 'empty') continue;
    liste.push({ anahtar: `T${String(p + 1)}`, ad: `T${String(p + 1).padStart(2, '0')}`, deger: t.name });
  }
  for (const d of K.defs.slice(GENEL_ADIM + arr.length)) {
    if (d.type === 'multi') liste.push({ anahtar: d.key, ad: d.title, deger: `${String(d.list().length)} kalem` });
  }
  return liste;
}

export interface TamamDurumu { secilen: number; toplam: number; hazir: boolean }

// Bulunulan adım "Kurulum tamam" ile seçilmiş sayılır (son adımdan sonraki adım yoktur).
export function tamamDurumu(): TamamDurumu {
  const liste = gerekenler(), a = isaretler(), simdiki = K.defs[K.active]?.key ?? '';
  const secilen = liste.filter((g) => a[g.anahtar] === true || g.anahtar === simdiki).length;
  return { secilen, toplam: liste.length, hazir: seciliEmir() !== null && liste.length > 0 && secilen === liste.length };
}

// Son kartın yazısındaki sayı (bulunulan adım sayılmaz; köprüde de öyle).
export function isaretliSayisi(): { secilen: number; toplam: number } {
  const liste = gerekenler(), a = isaretler();
  return { secilen: liste.filter((g) => a[g.anahtar] === true).length, toplam: liste.length };
}

export function saat(zaman: string, saatDilimi?: string): string {
  const t = new Date(zaman);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: saatDilimi });
}
