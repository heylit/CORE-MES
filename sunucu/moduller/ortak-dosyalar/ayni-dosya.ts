import type { Db } from '#cekirdek/db.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { AyniDosyaYeri } from '#paylasilan/sozlesme/dosya.ts';
import { ayniDosyaKlasorYeri } from './kurallar.ts';
import { gorunumKur } from './servis.ts';
import * as s from './sorgular.ts';

// Aynı dosya uyarısı (kart 3468-1). Bu modül Çizim Merkezi'ni ithal etmez: onun yerlerini veren kaynak sunucu/kablolama.ts'te
// kurulur. Görünmeyen klasördeki kopya ne adıyla ne sayısıyla döner (ADR 0030, görünürlük; hazır listeler K1 ile aynı).
export type AyniDosyaKaynagi = (db: Db, kullanici: Kullanici, ozet: string) => Promise<AyniDosyaYeri[]>;

let digerKaynak: AyniDosyaKaynagi | null = null;
export function ayniDosyaKaynagiKaydet(k: AyniDosyaKaynagi): void { digerKaynak = k; }

export const klasordekiYerler: AyniDosyaKaynagi = async (db, kullanici, ozet) => {
  if (!islemVarMi(kullanici, 'sayfa.ortak-dosyalar')) return [];
  const satirlar = await s.ozetliSurumler(db, ozet);
  if (satirlar.length === 0) return [];
  const g = await gorunumKur(db, kullanici);
  return satirlar
    .filter((r) => g.gorunur(r.klasorId))
    .map((r) => ayniDosyaKlasorYeri(r, klasorAdlari(g.klasorler, r.klasorId)));
};

function klasorAdlari(klasorler: ReadonlyMap<number, s.KlasorSatiri>, id: number): string[] {
  const adlar: string[] = [];
  const gorulen = new Set<number>();
  let k = klasorler.get(id);
  while (k !== undefined && !gorulen.has(k.id)) {
    adlar.unshift(k.ad);
    gorulen.add(k.id);
    k = k.ustId === null ? undefined : klasorler.get(k.ustId);
  }
  return adlar;
}

export async function ayniDosyaYerleri(db: Db, kullanici: Kullanici, ozet: string): Promise<AyniDosyaYeri[]> {
  const cizim = digerKaynak === null ? [] : await digerKaynak(db, kullanici, ozet);
  return [...await klasordekiYerler(db, kullanici, ozet), ...cizim];
}
