import type { Db } from '#cekirdek/db.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { AyniDosyaYeri } from '#paylasilan/sozlesme/dosya.ts';
import { ayniDosyaCizimYeri } from './kurallar.ts';
import { taslagiGorur } from './servis.ts';
import * as sorgular from './sorgular.ts';

// Aynı dosya uyarısı (kart 3468-1). Merkez Ortak Dosyalar'ı ithal etmez: onun yerlerini veren kaynak sunucu/kablolama.ts'te
// iki modülün disari.ts'inden kurulur (hazır listelerdeki kalıp). Her kaynak yalnız kişinin görebildiği yeri verir.
export type AyniDosyaKaynagi = (db: Db, kullanici: Kullanici, ozet: string) => Promise<AyniDosyaYeri[]>;

// Çizimleri okuyabilen ya da yazabilen kişi çizimdeki kopyayı görür; uçtaki okuma yetkisiyle aynı liste ve yazma. Taslak revizyonu
// yalnız yazan ve yayınlayan görür (1885 b, `taslagiGorur`); okura taslağın adı ve durumu da gösterilmez.
export const AYNI_DOSYA_YETKISI = ['sayfa.cizimler', 'belge-merkezi.oku', 'belge-merkezi.yaz'] as const satisfies readonly Islem[];

let digerKaynak: AyniDosyaKaynagi | null = null;
export function ayniDosyaKaynagiKaydet(k: AyniDosyaKaynagi): void { digerKaynak = k; }

export const cizimdekiYerler: AyniDosyaKaynagi = async (db, kullanici, ozet) => {
  if (!AYNI_DOSYA_YETKISI.some((i) => islemVarMi(kullanici, i))) return [];
  const taslak = taslagiGorur(kullanici);
  return (await sorgular.ozetliRevizyonlar(db, ozet)).filter((r) => taslak || r.durum !== 'taslak').map(ayniDosyaCizimYeri);
};

export async function ayniDosyaYerleri(db: Db, kullanici: Kullanici, ozet: string): Promise<AyniDosyaYeri[]> {
  const ortak = digerKaynak === null ? [] : await digerKaynak(db, kullanici, ozet);
  return [...await cizimdekiYerler(db, kullanici, ozet), ...ortak];
}
