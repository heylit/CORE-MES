import type { Db } from '#cekirdek/db.ts';
import type { KayitAramaKaynagi } from '#paylasilan/kayit-aramasi.ts';
import { seriKayitAra } from './servis.ts';

// Genel arama (Ctrl K): seri no. Sayfayı gören arar; yol Seri izleme ekranıdır, okuma yetkisi sayfanınkiyle aynı.
export const kayitAramaKaynaklari: readonly KayitAramaKaynagi<Db>[] = [
  { tur: 'seri', yetki: ['sayfa.markalama'], ara: (db, istek) => seriKayitAra(db, istek.q, istek.sinir) },
];
export { malzemeKartiIzleri } from './sorgular.ts';
