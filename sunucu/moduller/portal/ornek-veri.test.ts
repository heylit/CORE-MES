import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import { KURULUM_ISARETI, portalKullaniciYolu } from './kurallar.ts';
import { kurulum } from './servis.ts';
import { koleksiyonBelgeleri, varOlanYollar } from './sorgular.ts';

describe('portal örnek verisi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let zincir: OrnekVeriTanimi[] = [];

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  before(async () => {
    ortam = await testVeritabaniKur('portal_ornek');
    // Gerekir zinciri keşiften kurulur: portal ve gerektirdikleri (başka modülün dosyası ithal edilmez).
    const hepsi = await modulOrnekVerileriniKesfet();
    const adla = new Map(hepsi.map((t) => [t.modul, t]));
    const gerekli = new Set<string>();
    const ekle = (ad: string): void => {
      if (gerekli.has(ad)) return;
      const t = adla.get(ad);
      if (!t) throw new Error(`Örnek veri bulunamadı: ${ad}`);
      gerekli.add(ad);
      for (const g of t.gerekir) ekle(g);
    };
    ekle('portal');
    zincir = hepsi.filter((t) => gerekli.has(t.modul));
  });
  after(async () => { await ortam?.kaldir(); });

  test('kurulum yapılmamışsa kurmaz, kartları atlar; kurulumdan sonra kartları yükler ve ikinci koşu yüklü döner', async () => {
    const satirlar: string[] = [];
    await ornekVeriYukle(vt(), zincir, { ortam: 'test', bildir: (s) => satirlar.push(s) });
    assert.ok(satirlar.includes('portal: kurulum yapılmamış, örnek firma kartları atlandı'), satirlar.join('\n'));
    const kisiId = await vt().tx((db) => kisiNoKullaniciAdindan(db, 'ornek.yonetici'));
    assert.ok(kisiId !== null);
    const yollar = [KURULUM_ISARETI ?? '', portalKullaniciYolu(kisiId)];
    assert.deepEqual(await vt().tx((db) => varOlanYollar(db, yollar)), []);
    assert.deepEqual(await vt().tx((db) => koleksiyonBelgeleri(db, 'parties')), []);

    // Portal yetkili kişinin ilk açılışında kurulur (uç: /portal/kurulum).
    await vt().tx((db) => kurulum(db, { id: kisiId, ad: 'Örnek Yönetici', islemler: ['portal.yonet'] }));
    const ilk = await ornekVeriYukle(vt(), zincir, { ortam: 'test', bildir: () => undefined });
    assert.ok(ilk.moduller.includes('portal'));
    // Kartlar finansın örnek firmalarıdır: hem müşteri hem tedarikçi vardır, kimlikler ORN- önekli.
    const firmalar = await vt().tx((db) => koleksiyonBelgeleri(db, 'parties'));
    assert.ok(firmalar.length > 0 && firmalar.every((f) => f.kimlik.startsWith('ORN-')));
    assert.deepEqual([...new Set(firmalar.map((f) => f.veri['type']))].sort(), ['customer', 'supplier']);

    const ikinci = await ornekVeriYukle(vt(), zincir, { ortam: 'test', bildir: () => undefined });
    assert.equal(ikinci.durum, 'yuklu');
    assert.ok(ikinci.moduller.includes('portal'));
  });
});
