// Örnek depo: birkaç konum ve raf, partili mal kabul girişleri, bir taşıma ve farklı durumlarda malzeme istekleri.
// Kartlar malzemeler örnek verisinindir, istasyonlar istasyonlar örnek verisinindir; burada yalnız stok kayıtları açılır
// ve hepsi servis komutlarıyla yazılır (parti, bakiye ve istek kuralları gerçek yazımdaki gibi işler).
import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { MalzemeIstegi } from '#paylasilan/sozlesme/stok.ts';
import { aktifIstasyonlar } from '../istasyonlar/disari.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import type { OrnekMalzemeAnahtari } from '../malzemeler/disari.ts';
import * as servis from './servis.ts';
import * as sorgular from './sorgular.ts';

const ZEMIN_1 = 'ORN-ZEMIN-1';
const ZEMIN_2 = 'ORN-ZEMIN-2';
const ARA_ALAN = 'ORN-ARA';
const RAF = 'OA';
const DEPOCU = 'ornek.depo';
const ISTEYEN_1 = 'ornek.operator1';
const ISTEYEN_2 = 'ornek.operator2';
const ISTASYON = 'ORN-TORNA-1';

async function kullanici(db: Db, kullaniciAdi: string): Promise<Kullanici> {
  const no = await kisiNoKullaniciAdindan(db, kullaniciAdi);
  const k = no === null ? null : await kullaniciYukle(db, no);
  if (!k) throw new Error(`Stok örnek verisi ${kullaniciAdi} hesabını bulamadı (kisiler örnek verisi önce yüklenir).`);
  return k;
}

async function kart(db: Db, anahtar: OrnekMalzemeAnahtari): Promise<number> {
  const no = await ornekMalzemeNo(db, anahtar);
  if (no === null) throw new Error(`Stok örnek verisi "${anahtar}" örnek kartını bulamadı (malzemeler örnek verisi önce yüklenir).`);
  return no;
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'stok',
  gerekir: ['istasyonlar', 'kisiler', 'malzemeler'],
  yukluMu: async (db) => (await sorgular.tumKonumKodlari(db)).includes(ZEMIN_1),
  yukle: async (db) => {
    const depocu = await kullanici(db, DEPOCU);
    const isteyen1 = await kullanici(db, ISTEYEN_1);
    const isteyen2 = await kullanici(db, ISTEYEN_2);
    const istasyon = (await aktifIstasyonlar(db)).find((i) => i.kod === ISTASYON);
    if (!istasyon) throw new Error(`Stok örnek verisi ${ISTASYON} istasyonunu bulamadı (istasyonlar örnek verisi önce yüklenir).`);
    const cubuk = await kart(db, 'cubuk');
    const levha = await kart(db, 'levha');
    const yag = await kart(db, 'kesme-yagi');
    const mil = await kart(db, 'mil');
    const flans = await kart(db, 'flans');

    const zemin1 = (await servis.konumAc(db, { tur: 'depo_zemini', kod: ZEMIN_1, ad: 'Örnek zemin 1' })).konum.id;
    const zemin2 = (await servis.konumAc(db, { tur: 'depo_zemini', kod: ZEMIN_2, ad: 'Örnek zemin 2' })).konum.id;
    const araAlan = (await servis.konumAc(db, { tur: 'ara_alan', kod: ARA_ALAN, ad: 'Örnek ara alan' })).konum.id;
    const raf = (await servis.rafAc(db, {
      kod: RAF, tur: 'palet', numaralama: 'sirali', ilkBolme: 1, bolmeSayisi: 2, katSayisi: 2, bolmeGenislikM: '2.7', derinlikM: '1.1', katAraligiM: '1.5',
    })).raf;
    const goz = (await servis.rafMatrisi(db, raf.id)).gozler[0];
    if (!goz) throw new Error('Stok örnek rafı göz üretmedi.');

    // Çubuk ve levha lotludur (parti zorunlu); yağ sarftır, partisiz girer. Mil ve flansın stoğu yoktur. Örnekte sipariş yok: "diğer" girişi (soru 104 a).
    await servis.malKabulYap(db, depocu, {
      tur: 'diger', irsaliyeNo: 'ORN-IRS-1',
      satirlar: [
        { malzemeId: cubuk, miktar: '500', konumId: zemin1, parti: { tedarikciPartiNo: 'ORN-L1', dokumNo: 'ORN-D1' } },
        { malzemeId: cubuk, miktar: '300', konumId: goz.konumId, parti: { tedarikciPartiNo: 'ORN-L2', dokumNo: 'ORN-D2' } },
        { malzemeId: levha, miktar: '200', konumId: zemin2, parti: { tedarikciPartiNo: 'ORN-L3' } },
        { malzemeId: yag, miktar: '120', konumId: zemin1 },
      ],
    }, () => undefined);
    await servis.malKabulYap(db, depocu, {
      tur: 'diger', irsaliyeNo: 'ORN-IRS-2',
      satirlar: [{ malzemeId: levha, miktar: '80', konumId: zemin2, parti: { tedarikciPartiNo: 'ORN-L4' } }],
    }, () => undefined);
    await servis.tasimaYap(db, depocu.id, { malzemeId: yag, kaynakKonumId: zemin1, hedefKonumId: araAlan, miktar: '20', aciklama: 'Örnek taşıma' });

    // İstekler: çubuk yeterli (açık); mil ve flans yok (stok yok); biri hazırlanır, biri teslim edilir, biri iptal olur.
    const ac = async (k: Kullanici, kimlik: string, malzemeId: number, miktar: string, istasyonId: number | null, not: string): Promise<MalzemeIstegi> =>
      (await servis.genelIstekAc(db, k, { malzemeId, miktar, istasyonId, not, kaynakKimligi: kimlik })).istek;
    await ac(isteyen1, 'ornek-istek-1', cubuk, '40', istasyon.id, 'Örnek: vardiya başı çubuk');
    await ac(isteyen1, 'ornek-istek-2', flans, '10', istasyon.id, 'Örnek: stokta olmayan parça');
    await ac(isteyen2, 'ornek-istek-3', mil, '5', null, 'Örnek: stokta olmayan parça');
    const hazir = await ac(isteyen1, 'ornek-istek-4', levha, '25', istasyon.id, 'Örnek: hazırlanan istek');
    await servis.malzemeIstegiGecir(db, depocu.id, hazir.id, 'hazirla', { surum: hazir.surum });
    const teslim = await ac(isteyen1, 'ornek-istek-5', yag, '5', istasyon.id, 'Örnek: teslim edilen istek');
    await servis.malzemeIstegiGecir(db, depocu.id, teslim.id, 'teslim', { surum: teslim.surum, karsilanan: '5' });
    const iptal = await ac(isteyen2, 'ornek-istek-6', cubuk, '15', null, 'Örnek: iptal edilen istek');
    await servis.malzemeIstegiGecir(db, depocu.id, iptal.id, 'iptal', { surum: iptal.surum });
  },
});
