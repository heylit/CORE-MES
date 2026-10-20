import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { firmaOzeti, ornekFirmaNo } from '../musteri-tedarikci/disari.ts';
import type { OrnekFirmaAnahtari } from '../musteri-tedarikci/disari.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import { KURULUM_ISARETI, ornekFirmaBelgesi, sonParca, ustYolu } from './kurallar.ts';
import type { BaslangicBelgesi, OrnekFirma } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Finansın örnek firmalarının portal kartları; kayıt kişisi örnek yöneticidir. Firma finansındır; portal yalnız kendi kartını yazar.
const KURUCU_KULLANICI = 'ornek.yonetici';
const ORNEK_ONEKI = 'ORN-';
const PORTAL_FIRMALARI: readonly OrnekFirmaAnahtari[] = ['musteriA', 'tedarikciA'];

async function ornekFirmalar(db: Db): Promise<OrnekFirma[]> {
  const sonuc: OrnekFirma[] = [];
  for (const anahtar of PORTAL_FIRMALARI) {
    const no = await ornekFirmaNo(db, anahtar);
    const f = no === null ? null : await firmaOzeti(db, no);
    if (f === null || f.kod === null) throw new Error(`Portal örnek verisi finansın örnek firmasını bulamadı: ${anahtar}`);
    sonuc.push({ kod: f.kod, ad: f.ad, tur: f.tur === 'tedarikci' ? 'supplier' : 'customer', il: f.il, adres: f.adres, vadeGunu: f.vadeGunu });
  }
  return sonuc;
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'portal',
  gerekir: ['kisiler', 'finans'],
  yukluMu: (db) => sorgular.onekliBelgeVarMi(db, 'parties', ORNEK_ONEKI),
  yukle: async (db, baglam) => {
    // Örnek veri kurulum yapmaz (MODUL-ISTEKLERI, KD-066): portal yetkili kişinin ilk açılışında kurulur.
    if (KURULUM_ISARETI !== null && (await sorgular.varOlanYollar(db, [KURULUM_ISARETI])).length === 0) {
      baglam.bildir('portal: kurulum yapılmamış, örnek firma kartları atlandı');
      return;
    }
    const kisiId = await kisiNoKullaniciAdindan(db, KURUCU_KULLANICI);
    if (kisiId === null) throw new Error(`Portal örnek verisi ${KURUCU_KULLANICI} kişisini bulamadı.`);
    const belgeler: BaslangicBelgesi[] = (await ornekFirmalar(db)).map((f) => ornekFirmaBelgesi(f, baglam.an.getTime()));
    const varOlan = new Set(await sorgular.varOlanYollar(db, belgeler.map((b) => b.yol)));
    for (const b of belgeler) {
      if (varOlan.has(b.yol)) continue;
      await sorgular.belgeYaz(db, { yol: b.yol, ust: ustYolu(b.yol), kimlik: sonParca(b.yol), veri: b.veri, kisiId });
    }
  },
});
