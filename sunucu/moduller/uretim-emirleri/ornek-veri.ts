import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import type { OrnekMalzemeAnahtari } from '../malzemeler/disari.ts';
import { isEmriKaynagi, yururluktekiRevizyon } from '../rota/disari.ts';
import { uretimEmriAc } from './is-emri-servis.ts';
import type { IsEmriGirdisi } from './is-emri-servis.ts';
import { emirBaslat, emirBitir } from './servis.ts';
import { malzemeninEmirSayisi } from './sorgular.ts';

const ACAN = 'ornek.planlama';
const OPERATOR = 'ornek.operator1';

// Bitirilen adım sayısı ve son adımın başlatılıp başlatılmadığı emrin hikâyedeki yerini verir (PLAN bölüm 4).
interface OrnekEmir { urun: OrnekMalzemeAnahtari; adet: number; biten: number; sonrakiniBaslat: boolean }
// Örnek emirler stoğa üretimdir: proje siparişle açılır (224) ve örnek sipariş yoktur.
const EMIRLER: readonly OrnekEmir[] = [
  { urun: 'mil', adet: 20, biten: Number.POSITIVE_INFINITY, sonrakiniBaslat: false },
  { urun: 'flans', adet: 50, biten: 1, sonrakiniBaslat: true },
  { urun: 'burc', adet: 30, biten: 0, sonrakiniBaslat: false },
];

async function kisiAl(db: Db, kullaniciAdi: string): Promise<number> {
  const id = await kisiNoKullaniciAdindan(db, kullaniciAdi);
  if (id === null) throw new Error(`Üretim emirleri örnek verisi ${kullaniciAdi} hesabını bulamadı (kisiler örnek verisi önce yüklenir).`);
  return id;
}

async function urunAl(db: Db, anahtar: OrnekMalzemeAnahtari): Promise<number> {
  const id = await ornekMalzemeNo(db, anahtar);
  if (id === null) throw new Error(`Üretim emirleri örnek verisi örnek malzeme kartını bulamadı: ${anahtar} (malzemeler örnek verisi önce yüklenir).`);
  return id;
}

// Rotadaki "emre kopya" ile aynı girdi: her rota adımı bir iş emri; örnek rotada talimat yok, kontrol listesi boş.
async function rotadanIsEmirleri(db: Db, urunId: number, anahtar: OrnekMalzemeAnahtari): Promise<{ revizyonId: number; isEmirleri: IsEmriGirdisi[] }> {
  const rota = await yururluktekiRevizyon(db, urunId);
  if (rota === null) throw new Error(`Üretim emirleri örnek verisi yürürlükte rota bulamadı: ${anahtar} (rota örnek verisi önce yüklenir).`);
  return {
    revizyonId: rota.id,
    isEmirleri: rota.adimlar.map((a) => ({
      sira: a.sira, opNo: a.opNo, ad: a.ad, operasyonTipiId: a.operasyonTipiId,
      ...isEmriKaynagi(a), ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk,
      terminGun: a.fason?.terminGun ?? null, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, talimatSurumu: a.talimatSurumu, kontrolListesi: [],
    })),
  };
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'uretim-emirleri',
  gerekir: ['rota', 'kisiler', 'istasyonlar'],
  // Örnek mamullerden birinin emri varsa yüklüdür.
  yukluMu: async (db) => {
    for (const e of EMIRLER) {
      const urunId = await ornekMalzemeNo(db, e.urun);
      if (urunId !== null && (await malzemeninEmirSayisi(db, urunId)) > 0) return true;
    }
    return false;
  },
  // Emir rotadan açılır ve terminal komutlarıyla ilerler: kurallar, sayaç ve kayıtlar gerçek akıştaki gibi yazılır.
  yukle: async (db) => {
    const acan: Kullanici = { id: await kisiAl(db, ACAN), ad: ACAN, islemler: ['uretim-emirleri.yaz'] };
    const operator = await kisiAl(db, OPERATOR);
    for (const e of EMIRLER) {
      const urunId = await urunAl(db, e.urun);
      const { revizyonId, isEmirleri } = await rotadanIsEmirleri(db, urunId, e.urun);
      const { uretimEmriId } = await uretimEmriAc(db, acan, {
        malzemeNo: urunId, adet: e.adet, teslim: null, kaynakRotaRevizyonId: revizyonId, isEmirleri, aciklama: 'Örnek emir', emirTuru: 'stok',
      });
      const biten = Math.min(e.biten, isEmirleri.length);
      for (let i = 0; i < biten; i += 1) {
        await emirBaslat(db, operator, uretimEmriId);
        await emirBitir(db, operator, uretimEmriId, e.adet);
      }
      if (e.sonrakiniBaslat && biten < isEmirleri.length) await emirBaslat(db, operator, uretimEmriId);
    }
  },
});
