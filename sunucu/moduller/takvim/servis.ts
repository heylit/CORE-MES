import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { GECIKEN_GERI_GUN } from '#paylasilan/sozlesme/takvim.ts';
import type { TakvimCevabi, TakvimGecikenCevabi, TakvimKaydi, TakvimKaynagi, TakvimSorgusu } from '#paylasilan/sozlesme/takvim.ts';
import { takvimKayitlari as denetimler } from '../denetim-hazirlik/disari.ts';
import { takvimKayitlari as vergiler } from '../finans/disari.ts';
import { resmiTatilGunleri, takvimKayitlari as izinler } from '../ik/disari.ts';
import { takvimKayitlari as kalibrasyonlar } from '../kalibrasyon/disari.ts';
import { takvimKayitlari as satinAlmalar } from '../satin-alma/disari.ts';
import { takvimKayitlari as sevkler } from '../sevkiyat/disari.ts';
import { takvimKayitlari as siparisler } from '../siparisler/disari.ts';
import { takvimKayitlari as emirler } from '../uretim-emirleri/disari.ts';
import { takvimKayitlari as duruslar } from '../vardiya/disari.ts';
import { butunIzinleriGorurMu, gecikenAraligi, gorulenKaynaklar, kayitlariSirala } from './kurallar.ts';

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
async function oku(db: Db, kullanici: Kullanici, kaynaklar: readonly TakvimKaynagi[], baslangic: string, bitis: string): Promise<TakvimKaydi[]> {
  const kayitlar: TakvimKaydi[] = [];
  for (const k of kaynaklar) {
    const okuyucu = OKUYUCULAR[k];
    if (okuyucu) kayitlar.push(...await okuyucu(db, baslangic, bitis, kullanici));
  }
  return kayitlar;
}

export async function takvim(db: Db, kullanici: Kullanici, sorgu: TakvimSorgusu): Promise<TakvimCevabi> {
  const { okunan, bekleyen } = gorulenKaynaklar(kullanici.islemler);
  const kayitlar = await oku(db, kullanici, okunan, sorgu.baslangic, sorgu.bitis);
  return {
    kaynaklar: okunan,
    bekleyenler: bekleyen,
    kayitlar: kayitlariSirala(kayitlar),
    tatiller: await resmiTatilGunleri(db, sorgu.baslangic, sorgu.bitis),
  };
}

// Bugünden önceki kapanmamış kayıtlar (1816); kaynak yetkisi takvim okumasıyla aynıdır.
export async function gecikenler(db: Db, kullanici: Kullanici, bugun: string): Promise<TakvimGecikenCevabi> {
  const { baslangic, bitis } = gecikenAraligi(bugun, GECIKEN_GERI_GUN);
  const kayitlar = await oku(db, kullanici, gorulenKaynaklar(kullanici.islemler).okunan, baslangic, bitis);
  return { kayitlar: kayitlariSirala(kayitlar.filter((k) => !k.bitti && k.tarih < bugun)) };
}
