import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { adimliAyrinti } from './is-emri-servis.ts';

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

describe('uretim-emirleri: örnek veri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  before(async () => { ortam = await testVeritabaniKur('uretim_emirleri_ornek'); });
  after(async () => { await ortam?.kaldir(); });

  test('zincirle yüklenir: Mil 20 bitti, Flanş 50 OP10 bitti OP20 sürüyor, Burç 30 planlı; iş emirleri rotadan; ikinci koşu yüklü döner', async () => {
    const liste = await zincir('uretim-emirleri');
    const secenek = { ortam: 'test' as const, bildir: () => undefined };
    const ilk = await ornekVeriYukle(vt(), liste, secenek);
    assert.equal(ilk.durum, 'yuklendi');
    assert.ok(ilk.moduller.includes('uretim-emirleri'));

    const db = vt();
    const emri = async (anahtar: 'mil' | 'flans' | 'burc') => {
      const urunId = await ornekMalzemeNo(db, anahtar);
      assert.ok(urunId !== null);
      const satir = await db.tek<{ id: number }>('SELECT id FROM uretim_emri WHERE malzeme_no = $1', [urunId]);
      assert.ok(satir, `${anahtar} emri yok`);
      return adimliAyrinti(db, satir.id);
    };
    const mil = await emri('mil');
    assert.deepEqual([mil.durum, mil.adet, mil.isEmirleri.map((i) => [i.durum, i.saglamAdet])], ['bitti', 20, [['tamam', 20], ['tamam', 20]]]);
    const flans = await emri('flans');
    assert.equal(flans.durum, 'basladi');
    assert.deepEqual(flans.isEmirleri.map((i) => i.durum), ['tamam', 'calisiyor', 'bekliyor', 'bekliyor']);
    assert.equal(flans.isEmirleri[2]?.fason !== null, true, 'Flanş ısıl işlem adımı fason');
    const burc = await emri('burc');
    assert.deepEqual([burc.durum, burc.adet, burc.isEmirleri.length], ['planli', 30, 2]);
    assert.ok([mil, flans, burc].every((e) => e.kaynakRotaRevizyonId !== null));

    const ikinci = await ornekVeriYukle(vt(), liste, secenek);
    assert.equal(ikinci.durum, 'yuklu');
    assert.equal((await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))?.n, 3);
  });
});
