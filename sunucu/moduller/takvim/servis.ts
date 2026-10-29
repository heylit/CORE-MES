import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { TakvimCevabi, TakvimKaydi, TakvimKaynagi, TakvimSorgusu } from '#paylasilan/sozlesme/takvim.ts';
import { takvimKayitlari as denetimler } from '../denetim-hazirlik/disari.ts';
import { takvimKayitlari as vergiler } from '../finans/disari.ts';
import { resmiTatilGunleri, takvimKayitlari as izinler } from '../ik/disari.ts';
import { takvimKayitlari as kalibrasyonlar } from '../kalibrasyon/disari.ts';
import { takvimKayitlari as satinAlmalar } from '../satin-alma/disari.ts';
import { takvimKayitlari as sevkler } from '../sevkiyat/disari.ts';
import { takvimKayitlari as siparisler } from '../siparisler/disari.ts';
import { takvimKayitlari as emirler } from '../uretim-emirleri/disari.ts';
import { takvimKayitlari as duruslar } from '../vardiya/disari.ts';
import { butunIzinleriGorurMu, gorulenKaynaklar, kayitlariSirala } from './kurallar.ts';

type Okuyucu = (db: Db, baslangic: string, bitis: string, kullanici: Kullanici) => Promise<TakvimKaydi[]>;

// Bağlı kaynaklar; bağlanmayanlar kurallar.ts'deki KAYNAK_YETKILERI'nde bagli: false.
const OKUYUCULAR: Partial<Record<TakvimKaynagi, Okuyucu>> = {
  'siparis': (db, b, e) => siparisler(db, b, e),
  // Emir kaynağı başlangıcı ve teslimi birlikte verir; iki kaynak aynı işlemle açıldığından her biri kendi payını alır.
  'emir-plan': async (db, b, e) => (await emirler(db, b, e)).filter((x) => x.kaynak === 'emir-plan'),
  'emir-bitis': async (db, b, e) => (await emirler(db, b, e)).filter((x) => x.kaynak === 'emir-bitis'),
  'sevk': (db, b, e) => sevkler(db, b, e),
  'satin-alma': (db, b, e) => satinAlmalar(db, b, e),
  'kalibrasyon': (db, b, e) => kalibrasyonlar(db, b, e),
  'denetim': (db, b, e) => denetimler(db, b, e),
  'izin': (db, b, e, k) => izinler(db, b, e, butunIzinleriGorurMu(k.islemler) ? null : k.id),
  'vergi': (db, b, e) => vergiler(db, b, e),
  'planli-durus': (db, b, e) => duruslar(db, b, e),
};

// Yalnız okur (1161 a). Okuma yetkisi olmayan kaynak hiç okunmaz; tatiller herkese açıktır (vardiya takvimi gibi).
export async function takvim(db: Db, kullanici: Kullanici, sorgu: TakvimSorgusu): Promise<TakvimCevabi> {
  const { okunan, bekleyen } = gorulenKaynaklar(kullanici.islemler);
  const kayitlar: TakvimKaydi[] = [];
  for (const k of okunan) {
    const oku = OKUYUCULAR[k];
    if (oku) kayitlar.push(...await oku(db, sorgu.baslangic, sorgu.bitis, kullanici));
  }
  return {
    kaynaklar: okunan,
    bekleyenler: bekleyen,
    kayitlar: kayitlariSirala(kayitlar),
    tatiller: await resmiTatilGunleri(db, sorgu.baslangic, sorgu.bitis),
  };
}
