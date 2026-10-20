import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { ornekFirmaNo } from '../musteri-tedarikci/disari.ts';
import * as servis from './servis.ts';

// Yalnız bu modülün gerektirdiği zincir yüklenir; başka modüllerin örnek verisi bu testin konusu değildir.
async function zincir(modul: string): Promise<OrnekVeriTanimi[]> {
  const hepsi = new Map((await modulOrnekVerileriniKesfet()).map((t) => [t.modul, t]));
  const secilen = new Map<string, OrnekVeriTanimi>();
  const ekle = (ad: string): void => {
    const t = hepsi.get(ad);
    if (!t || secilen.has(ad)) return;
    secilen.set(ad, t);
    t.gerekir.forEach(ekle);
  };
  ekle(modul);
  return [...secilen.values()];
}

describe('sevkiyat: örnek veri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  before(async () => { ortam = await testVeritabaniKur('sevkiyat_ornek'); });
  after(async () => { await ortam?.kaldir(); });

  test('zincirle yüklenir: bir araç, iki müşteri firmasına bağlı nokta, Mil teslimatı günün listesinde tamamlandı; ikinci koşu yüklü döner', async () => {
    const liste = await zincir('sevkiyat');
    const secenek = { ortam: 'test' as const, bildir: () => undefined };
    const ilk = await ornekVeriYukle(vt(), liste, secenek);
    assert.equal(ilk.durum, 'yuklendi');
    assert.ok(ilk.moduller.indexOf('sevkiyat') > ilk.moduller.indexOf('uretim-emirleri'));

    const db = vt();
    assert.deepEqual((await servis.araclariListele(db)).map((a) => [a.ad, a.tur, a.aktif]), [['ORNEK Kamyonet', 'kamyonet', true]]);
    const { noktalar } = await servis.noktalariListele(db);
    const firmalar = [await ornekFirmaNo(db, 'musteriA'), await ornekFirmaNo(db, 'musteriB')];
    assert.deepEqual(noktalar.map((n) => [n.tur, n.firmaId]), firmalar.map((f) => ['musteri', f]));

    const gun = (await db.tek<{ tarih: string }>('SELECT tarih::text FROM sevkiyat_isi'))!.tarih;
    const plan = await servis.gunPlani(db, gun, async () => null);
    assert.deepEqual(plan.isler.map((i) => [i.tur, i.durum, i.birakisNoktasiId, i.belgeNo]), [['teslimat', 'tamamlandi', noktalar[0]!.id, 'ORN-IRS-0001']]);
    assert.deepEqual(plan.bekleyen, [], 'kapanan iş plana bekleyen olarak düşmez');

    const ikinci = await ornekVeriYukle(vt(), liste, secenek);
    assert.equal(ikinci.durum, 'yuklu');
    assert.equal((await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM sevkiyat_isi'))?.n, 1);
  });
});
