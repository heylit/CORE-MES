import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { kablola } from '../../kablolama.ts';
import { kisiVardiyasiGetir, puantajGetir, veriGetir } from './servis.ts';

// Puantajın vardiya planı Vardiya modülünden gerçek bağla gelir. Örnek tesiste kişi istasyona, makineye ya da ekibe atanır;
// üçünde de kişinin planı bulunmalıdır (deneme bulgusu 6: makine ve ekip atamalı kişide plan boş geliyordu).
describe('İK puantaj: vardiya planı gerçek bağla, istasyon, makine ve ekip atamalı kişide', () => {
  let ortam: TestVeritabani | undefined;
  before(async () => {
    ortam = await testVeritabaniKur('ik_puantaj_vardiya');
    const liste = (await modulOrnekVerileriniKesfet()).filter((t) => ['kisiler', 'istasyonlar', 'vardiya', 'ik'].includes(t.modul));
    assert.equal((await ornekVeriYukle(ortam.vt, liste, { ortam: 'test', bildir: () => undefined })).durum, 'yuklendi');
    kablola();
  });
  after(async () => { await ortam?.kaldir(); });

  test('örnek kişilerin hepsinde ayın planı dolu gelir', async () => {
    const ay = tesisGunu(new Date()).slice(0, 7);
    const sonuc = await ortam!.vt.tx(async (db) => {
      const yon = (await kullaniciYukle(db, (await kisiNoKullaniciAdindan(db, 'ornek.yonetici'))!))!;
      const personel = new Map<number, string>();
      for (const k of (await veriGetir(db, yon)).kayitlar) {
        if (k.tur === 'emp' && typeof k.govde['kisiId'] === 'number') personel.set(k.govde['kisiId'], k.kimlik);
      }
      const plan: Record<string, boolean> = {};
      for (const ad of ['ornek.operator2', 'ornek.operator1', 'ornek.operator3', 'ornek.kalite']) {
        const kimlik = personel.get((await kisiNoKullaniciAdindan(db, ad))!);
        assert.ok(kimlik, `${ad} İK personeli değil`);
        const p = (await puantajGetir(db, yon, ay, kimlik)).kisiler[0]!.plan;
        plan[ad] = p !== null && p.some((g) => g.dakika > 0);
      }
      return plan;
    });
    // operator2 istasyona, operator1 ve operator3 makineye, kalite ekibe atanmış.
    assert.deepEqual(sonuc, { 'ornek.operator2': true, 'ornek.operator1': true, 'ornek.operator3': true, 'ornek.kalite': true });
  });

  test('soru 75: kişi sayfasının Vardiya bölümü gerçek bağla dolu gelir; saatler SS:DD', async () => {
    const vardiya = await ortam!.vt.tx(async (db) => {
      const yon = (await kullaniciYukle(db, (await kisiNoKullaniciAdindan(db, 'ornek.yonetici'))!))!;
      const kisiId = await kisiNoKullaniciAdindan(db, 'ornek.operator2');
      const k = (await veriGetir(db, yon)).kayitlar.find((x) => x.tur === 'emp' && x.govde['kisiId'] === kisiId)!;
      return (await kisiVardiyasiGetir(db, yon, k.kimlik)).vardiya;
    });
    assert.ok(vardiya, 'istasyona atanmış kişinin vardiyası bulunmalı');
    const saatler = vardiya.hafta.flatMap((h) => h.vardiyalar);
    assert.ok(saatler.length > 0, 'haftada en az bir vardiya');
    for (const v of saatler) assert.match(`${v.baslangic} ${v.bitis}`, /^\d\d:\d\d \d\d:\d\d$/);
  });
});
