// Örnek fabrika haritası: üretim bölümü ve yanında depo; depo raflarının gözleri stok örnek verisinin konumudur.
import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { fabrikaKayitGovdesi } from '#paylasilan/sozlesme/atolye.ts';
import type { SalonOzeti } from '#paylasilan/sozlesme/atolye.ts';
import { kisiKullaniciAdi, kisileriListele } from '../kisiler/disari.ts';
import { fabrikaKaydet, salonEkle, salonlar } from './servis.ts';

const ONEK = 'ORN-';
const KAYDEDEN = 'ornek.planlama';

// Raf kodu tiresizdir (göz adresinin ayracı); ORN ile başlar ki örnek olduğu okunsun.
const palet = (kod: string, ad: string, x: number) => ({
  id: null, kod, ad, tur: 'palet', bolmeSayisi: 3, katSayisi: 4, gozSayisi: 2,
  bolmeGenisligi: 2.7, derinlik: 1.1, yukseklik: 5, x, z: 2, donus: 0, aktif: true,
});

async function kaydedenKisi(db: Db): Promise<number> {
  for (const k of await kisileriListele(db)) {
    if (k.aktif && (await kisiKullaniciAdi(db, k.id)) === KAYDEDEN) return k.id;
  }
  throw new Error(`Atölye örnek verisi ${KAYDEDEN} kişisini bulamadı (kisiler örnek verisi önce yüklenmeli).`);
}

const yerlesimGovdesi = (s: SalonOzeti) => ({
  surum: s.surum,
  salon: { kod: s.kod, ad: s.ad, genislik: Number(s.genislik), derinlik: Number(s.derinlik), hucreBoyu: Number(s.hucreBoyu), giris: null },
  istasyonYerleri: [],
  duvarlar: [],
});

export const ornekVeri = ornekVeriTanimi({
  modul: 'atolye',
  gerekir: ['kisiler'],
  yukluMu: async (db) => (await salonlar(db)).some((s) => s.kod.startsWith(ONEK)),
  yukle: async (db) => {
    const kisiId = await kaydedenKisi(db);
    // salonEkle yeni bölümü var olanların sağına koyar; depo üretimin sağ duvarına dayanır ki ortak duvardan geçilsin.
    const uretim = await salonEkle(db, { kod: 'ORN-URT', ad: 'Ornek Uretim Bolumu', genislik: 40, derinlik: 24, hucreBoyu: 4 }, kisiId);
    const depo = await salonEkle(db, { kod: 'ORN-DEP', ad: 'Ornek Depo', genislik: 30, derinlik: 24, hucreBoyu: 4 }, kisiId);
    const x = Number(uretim.fabrika.x);
    const z = Number(uretim.fabrika.z);
    await fabrikaKaydet(db, fabrikaKayitGovdesi.parse({
      bolumler: [
        {
          salonId: uretim.id, fabrika: { x, z, donus: 0 },
          yerlesim: {
            ...yerlesimGovdesi(uretim),
            raflar: [],
            alanlar: [
              { tur: 'yuruyus_yolu', ad: 'Ana yol', x: 20, z: 12, donus: 0, genislik: 38, derinlik: 3, kapi: null },
              { tur: 'uretim_cikisi', ad: 'Uretim cikisi', x: 34, z: 20, donus: 0, genislik: 6, derinlik: 4, kapi: null },
              { tur: 'karantina', ad: 'Karantina', x: 6, z: 20, donus: 0, genislik: 6, derinlik: 4, kapi: null },
              // İlk parça numunesi bu kutuya teslim edilir; teslim kutuyu adıyla bulur (kullanıcı kararı 125 a).
              { tur: 'ara_alan', ad: 'Kalite numune', x: 20, z: 20, donus: 0, genislik: 6, derinlik: 4, kapi: null },
            ],
            gecisler: [
              { tur: 'kepenk', kenar: 'on', ofset: -10, genislik: 4 },
              { tur: 'kapi', kenar: 'sag', ofset: 0, genislik: 2 },
            ],
          },
        },
        {
          salonId: depo.id, fabrika: { x: x + Number(uretim.genislik), z, donus: 0 },
          yerlesim: {
            ...yerlesimGovdesi(depo),
            raflar: [
              palet('ORNA', 'Palet rafi A', 6),
              palet('ORNB', 'Palet rafi B', 16),
              {
                id: null, kod: 'ORNK', ad: 'Kucuk parca rafi', tur: 'kucuk_parca', bolmeSayisi: 4, katSayisi: 5, gozSayisi: 3,
                bolmeGenisligi: 1, derinlik: 0.6, yukseklik: 2.5, x: 26, z: 2, donus: 0, aktif: true,
              },
            ],
            alanlar: [
              { tur: 'yuruyus_yolu', ad: 'Depo yolu', x: 15, z: 10, donus: 0, genislik: 28, derinlik: 3, kapi: null },
              { tur: 'kabul', ad: 'Mal kabul', x: 5, z: 20, donus: 0, genislik: 6, derinlik: 4, kapi: null },
              { tur: 'depo_zemini', ad: 'Zemin stogu', x: 15, z: 20, donus: 0, genislik: 8, derinlik: 4, kapi: null },
              { tur: 'sevkiyat', ad: 'Sevkiyat hazirlik', x: 25, z: 20, donus: 0, genislik: 6, derinlik: 4, kapi: null },
            ],
            gecisler: [{ tur: 'kepenk', kenar: 'on', ofset: 5, genislik: 4 }],
          },
        },
      ],
    }), kisiId);
  },
});
