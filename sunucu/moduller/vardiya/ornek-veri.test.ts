import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Veritabani } from '#cekirdek/db.ts';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import { planliDuruslarinHepsi } from './disari.ts';
import { takvim } from './servis.ts';

// Başka modülün ornek-veri.ts'i ithal edilmez (sınır kuralı); çekirdek keşfiyle bulunur.
let zincir: OrnekVeriTanimi[] = [];
before(async () => {
  zincir = (await modulOrnekVerileriniKesfet()).filter((t) => ['kisiler', 'istasyonlar', 'vardiya'].includes(t.modul));
});
const secenek = { ortam: 'test' as const, an: new Date('2026-10-13T06:00:00Z'), bildir: () => undefined };

describe('vardiya örnek verisi', { timeout: 90_000 }, () => {
  let vt: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;
  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı.');
    return vt;
  };

  before(async () => {
    const ortam = await testVeritabaniKur('vardiya_ornek');
    ({ vt, kaldir } = ortam);
    // Elle girilmiş gün (fikstür): örnek veri üstüne yazmamalı.
    await ortam.sahip.sorgu("INSERT INTO vardiya_takvim_gunu (tarih, tur, ad) VALUES ('2026-12-31', 'kapali', 'Elle girilen')");
  });
  after(async () => { await kaldir?.(); });

  test('var olan takvim günü korunur; vardiyalar, haftalık düzen, kişi vardiyaları ve bakım duruşu yazılır', async () => {
    assert.equal((await ornekVeriYukle(acik(), zincir, secenek)).durum, 'yuklendi');

    const t = await acik().tx((db) => takvim(db));
    assert.deepEqual(t.vardiyalar.map((v) => [v.ad, v.netDakika]).sort(), [['Örnek Akşam', 450], ['Örnek Gündüz', 450]]);
    assert.deepEqual(t.gunler, [{ tarih: '2026-12-31', tur: 'kapali', ad: 'Elle girilen' }]);
    const merkez = new Map(t.isMerkezleri.map((m) => [m.kod, m]));
    assert.equal(t.matris.filter((x) => x.isMerkeziId === merkez.get('ORN-TAL')!.id).length, 11);
    assert.equal(t.matris.filter((x) => x.isMerkeziId === merkez.get('ORN-MON')!.id).length, 5);
    assert.equal(t.kisiVardiyalari.length, 3);

    const duruslar = await acik().tx((db) => planliDuruslarinHepsi(db));
    assert.equal(duruslar.length, 1);
    assert.equal(duruslar[0]!.baslik, 'Örnek periyodik bakım');
    assert.equal(Date.parse(duruslar[0]!.baslangic), Date.parse('2026-10-14T05:00:00Z'));
  });

  test('ikinci koşu bir şey yazmaz', async () => {
    assert.equal((await ornekVeriYukle(acik(), zincir, secenek)).durum, 'yuklu');
    const t = await acik().tx((db) => takvim(db));
    assert.equal(t.vardiyalar.length, 2);
  });
});

describe('vardiya örnek verisi, boş takvim', { timeout: 90_000 }, () => {
  let vt: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;

  before(async () => {
    ({ vt, kaldir } = await testVeritabaniKur('vardiya_ornek_tatil'));
  });
  after(async () => { await kaldir?.(); });

  test('boş takvime kapalı gün eklenmez (takvim kurulumun parçası; tatiller İK\'dan gelir)', async () => {
    if (!vt) throw new Error('Test veritabanı açılamadı.');
    assert.equal((await ornekVeriYukle(vt, zincir, secenek)).durum, 'yuklendi');
    assert.deepEqual((await vt.tx((db) => takvim(db))).gunler, []);
  });
});
