import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { ornekFirmaNo } from '../musteri-tedarikci/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { yururluktekiRevizyon } from './disari.ts';
import { revizyonOku, urunRevizyonlari } from './sorgular.ts';

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

describe('rota: örnek veri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  before(async () => { ortam = await testVeritabaniKur('rota_ornek'); });
  after(async () => { await ortam?.kaldir(); });

  test('zincirle yüklenir: üç mamulün yürürlükte Rev A rotası, Flanş fasonlu, onaylayan hazırlayandan farklı; ikinci koşu yüklü döner', async () => {
    const liste = await zincir('rota');
    const secenek = { ortam: 'test' as const, bildir: () => undefined };
    const ilk = await ornekVeriYukle(vt(), liste, secenek);
    assert.equal(ilk.durum, 'yuklendi');
    assert.ok(ilk.moduller.includes('rota'));

    const db = vt();
    const adimSayilari: Record<string, number> = {};
    for (const anahtar of ['mil', 'flans', 'burc'] as const) {
      const urunId = await ornekMalzemeNo(db, anahtar);
      assert.ok(urunId !== null, `${anahtar} kartı yok`);
      const revizyonlar = await urunRevizyonlari(db, urunId);
      assert.equal(revizyonlar.length, 1);
      assert.equal(revizyonlar[0]!.harf, 'A');
      assert.equal(revizyonlar[0]!.durum, 'yururlukte');
      const rota = await yururluktekiRevizyon(db, urunId);
      assert.ok(rota);
      adimSayilari[anahtar] = rota.adimlar.length;

      const satir = await revizyonOku(db, rota.id);
      assert.ok(satir?.gonderenKisiId && satir.onaylayanKisiId);
      assert.notEqual(satir.onaylayanKisiId, satir.gonderenKisiId);
      assert.notEqual(satir.onaylayanKisiId, satir.acanKisiId);
      assert.equal(satir.dortGozsuzOnay, false);

      const fasonlar = rota.adimlar.filter((a) => a.fason !== null);
      if (anahtar === 'flans') {
        assert.equal(fasonlar.length, 1);
        assert.equal(fasonlar[0]!.fason?.firmaId, await ornekFirmaNo(db, 'fason'));
        assert.equal(fasonlar[0]!.kaynak, null);
        assert.equal(fasonlar[0]!.ayarSuresiDk, null);
      } else {
        assert.equal(fasonlar.length, 0);
      }
      assert.ok(rota.adimlar.filter((a) => a.fason === null).every((a) => a.kaynak?.tur === 'makine' && a.birimSureDk !== null));
    }
    assert.deepEqual(adimSayilari, { mil: 2, flans: 4, burc: 2 });

    const ikinci = await ornekVeriYukle(vt(), liste, secenek);
    assert.equal(ikinci.durum, 'yuklu');
    assert.ok(ikinci.moduller.includes('rota'));
    const milId = await ornekMalzemeNo(db, 'mil');
    assert.equal((await urunRevizyonlari(db, milId!)).length, 1);
  });
});
