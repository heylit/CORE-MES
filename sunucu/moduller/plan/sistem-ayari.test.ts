import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { PlanSistemAyarlariCevabi, PlanSistemAyariSatiri } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// Planlama ayarları sayfasının sistem bölümü (3561; 3557 c, 3560): planlama müdürü yalnız ufku ve dilimi değiştirir, plan. dışı anahtara
// ve dört göze dokunamaz; üretim müdürü okur ama yazamaz. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): sistem ayarları', () => {
  const { c, istek, tamam, kisiEkle, girisCerezi } = planTestOrtami();
  const cerez: Record<'plMudur' | 'uMudur', string> = { plMudur: '', uMudur: '' };
  before(async () => {
    const roller = ((await istek(c.yonetici, 'GET', '/roller')).json() as { roller: { id: number; ad: string }[] }).roller;
    const rol = (ad: string): number => roller.find((x) => x.ad === ad)!.id;
    await kisiEkle('plmudur', rol('Planlama Müdürü'));
    await kisiEkle('umudur', rol('Üretim Müdürü'));
    cerez.plMudur = await girisCerezi('plmudur');
    cerez.uMudur = await girisCerezi('umudur');
  });
  const oku = (k: string) => tamam<PlanSistemAyarlariCevabi>(k, 'GET', '/plan/sistem-ayarlari');
  const satir = (l: PlanSistemAyarlariCevabi, anahtar: string): PlanSistemAyariSatiri => l.ayarlar.find((x) => x.ayar.anahtar === anahtar)!;
  const yaz = (k: string, anahtar: string, deger: unknown, beklenen: unknown) => istek(k, 'POST', `/plan/sistem-ayarlari/${anahtar}/degistir`, { deger, beklenen });

  test('okuma yalnız beş plan. ayarını verir; planlama sayfasını gören herkes okur, görmeyen okuyamaz', async () => {
    for (const k of [cerez.plMudur, cerez.uMudur, c.planlama, c.yonetici]) {
      assert.deepEqual((await oku(k)).ayarlar.map((x) => x.ayar.anahtar),
        ['plan.dort-goz', 'plan.motor-ufuk-gun', 'plan.motor-dilim-dk', 'plan.tipli-girdi', 'plan.bakim-girdisi']);
    }
    assert.equal((await istek(c.operator, 'GET', '/plan/sistem-ayarlari')).statusCode, 403);
    const ufuk = satir(await oku(cerez.plMudur), 'plan.motor-ufuk-gun');
    assert.deepEqual([ufuk.ayar.deger, ufuk.guncelleyen, ufuk.zaman], [120, null, null], 'hiç yazılmamış ayar varsayılandadır, değiştireni yoktur');
  });

  test('3560: planlama müdürü ufku ve dilimi değiştirir; kimin ne zaman değiştirdiği okunur; eski değerle yazma 409', async () => {
    const yeni = await yaz(cerez.plMudur, 'plan.motor-ufuk-gun', 90, 120);
    assert.equal(yeni.statusCode, 200, yeni.body);
    const s = yeni.json<PlanSistemAyariSatiri>();
    assert.deepEqual([s.ayar.deger, s.guncelleyen], [90, 'Deneme plmudur']);
    assert.ok(s.zaman !== null);
    assert.equal(satir(await oku(c.yonetici), 'plan.motor-ufuk-gun').guncelleyen, 'Deneme plmudur');
    assert.equal((await yaz(cerez.plMudur, 'plan.motor-dilim-dk', '30', '15')).statusCode, 200);
    assert.equal((await yaz(cerez.plMudur, 'plan.motor-ufuk-gun', 100, 120)).statusCode, 409, 'okunan değer eskidir');
    assert.equal(satir(await oku(c.yonetici), 'plan.motor-ufuk-gun').ayar.deger, 90);
    assert.equal((await yaz(cerez.plMudur, 'plan.motor-ufuk-gun', 500, 90)).statusCode, 400, 'sınır dışı');
    // Yönetici de yazar ve değerleri başlangıca döndürür (öteki testler varsayılanı bekler).
    assert.equal((await yaz(c.yonetici, 'plan.motor-ufuk-gun', 120, 90)).statusCode, 200);
    assert.equal((await yaz(c.yonetici, 'plan.motor-dilim-dk', '15', '30')).statusCode, 200);
  });

  test('3560: dört göz, tipli girdi ve bakım girdisi yönetici kapısında kalır; planlama ve üretim müdürü yazamaz, değer değişmez', async () => {
    for (const [anahtar, deger, beklenen] of [['plan.dort-goz', true, false], ['plan.tipli-girdi', true, false], ['plan.bakim-girdisi', false, true]] as const) {
      for (const k of [cerez.plMudur, cerez.uMudur, c.planlama, c.mudur]) assert.equal((await yaz(k, anahtar, deger, beklenen)).statusCode, 403, `${anahtar}`);
    }
    for (const k of [cerez.uMudur, c.planlama, c.mudur]) assert.equal((await yaz(k, 'plan.motor-ufuk-gun', 100, 120)).statusCode, 403, 'ufuk');
    const l = await oku(c.yonetici);
    assert.deepEqual(['plan.dort-goz', 'plan.tipli-girdi', 'plan.bakim-girdisi'].map((a) => satir(l, a).ayar.deger), [false, false, true]);
    // Yönetici dört göze yazar ve geri alır.
    assert.equal((await yaz(c.yonetici, 'plan.dort-goz', true, false)).statusCode, 200);
    assert.equal((await yaz(c.yonetici, 'plan.dort-goz', false, true)).statusCode, 200);
  });

  test('D2: yalnız plan. anahtarları; başka modülün ayarına bu uçtan yazılmaz, ayarlar.yaz hiçbir planlama rolünde yoktur', async () => {
    for (const anahtar of ['kabuk.karsilama', 'plan.yok', 'atolye.kroki-saydamligi']) {
      assert.equal((await yaz(cerez.plMudur, anahtar, true, false)).statusCode, 400, anahtar);
      assert.equal((await yaz(c.yonetici, anahtar, true, false)).statusCode, 400, `yönetici ${anahtar}`);
    }
    assert.equal((await istek(cerez.plMudur, 'GET', '/ayarlar')).statusCode, 403, 'genel liste planlama müdürüne açılmaz');
    assert.equal((await istek(cerez.plMudur, 'POST', '/ayarlar/plan.motor-ufuk-gun/degistir', { deger: 100, beklenen: 120 })).statusCode, 403);
  });
});
