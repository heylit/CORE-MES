import type { Db } from '#cekirdek/db.ts';
import type { KayitAramaKaynagi } from '#paylasilan/kayit-aramasi.ts';
import type { Kayit, Statu } from '#paylasilan/sozlesme/recete-rota.ts';
import { rotaAra } from './arama.ts';
import { statuListesi } from './servis.ts';

// Stok üretim sayımında adımın statüsünü ve çıktı kartını bunlarla çözer; stok bu modülü ithal edemez, bağı sunucu/kablolama.ts kurar.
export { adimCiktisi, adimStatusu } from './servis.ts';
import { kayitGetir } from './sorgular.ts';

// Bağlamada (Aşama 2) başka modül bu modülün kaydını yalnız buradan okur; yazma dışarı açılmaz. Prototipin durumu
// `recete-rota-motoru-v1` anahtarındadır (alanları ORTAKLIK-recete-rota.md'de).
export const DURUM_ANAHTARI = 'recete-rota-motoru-v1';

export async function receteRotaDurumu(db: Db): Promise<Kayit | null> {
  return kayitGetir(db, DURUM_ANAHTARI);
}

// Rotanın statülü adımlarından açılan statü tanımları (ad, renk, tür, malzeme no); statülü stok bunlara bağlanır (kart #1108).
export async function receteRotaStatuleri(db: Db): Promise<Statu[]> {
  return statuListesi(db);
}

// Planlama ve motoru plan modülündedir (658 b); bu modül planı yalnız besler. Plan bağlı durumu (sahip modüllerin okumaları prototipin `st`
// biçiminde), aktif malzemeleri ve okuma kapsamını buradan alır; planın alanlarını (ayar, canlı özeti, başlamış adımlar) kendisi ekler.
// Kayıt biçimi denetimleri planlama kaydının yazımında da aynıdır.
export { aktifMalzemeListesi, durumVeEmirler, KAYNAK_OKUMA } from './servis.ts';
export { degerBicimeUyarMi, degerCokBuyukMu, nulKarakteriVarMi, surumUyarMi } from './kurallar.ts';
export type { EmirKaydi } from './kurallar.ts';

// Genel aramanın rota kaynağı (kart #1241). Çekirdek kaynağı yalnız Reçete ve Rota'yı okuyabilene çağırır; malzeme ve rota okuması
// rotaAra içinde ayrıca istenir.
export const kayitAramaKaynaklari: readonly KayitAramaKaynagi<Db>[] = [
  { tur: 'rota', yetki: ['sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz'], ara: rotaAra },
];
