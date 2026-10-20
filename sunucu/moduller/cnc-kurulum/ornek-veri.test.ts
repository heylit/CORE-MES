import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Veritabani } from '#cekirdek/db.ts';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import { cncKurulumDurumu, DURUM_ANAHTARI } from './disari.ts';
import { ORNEK_DURUM, ORNEK_YAZAN } from './ornek-veri.ts';
import { kayitGuncelle } from './sorgular.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';

describe('cnc-kurulum örnek verisi', { timeout: 60_000 }, () => {
  let vt: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;
  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı.');
    return vt;
  };
  const satirlar: string[] = [];
  const secenek = { ortam: 'test' as const, bildir: (satir: string) => { satirlar.push(satir); } };

  // Kişiler örnek verisi keşifle alınır (başka modülün yalnız disari.ts'i ithal edilir).
  let liste: OrnekVeriTanimi[] = [];
  before(async () => {
    ({ vt, kaldir } = await testVeritabaniKur('cnc_kurulum_ornek'));
    liste = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'kisiler' || t.modul === 'cnc-kurulum');
  });
  after(async () => { await kaldir?.(); });

  test('kişilerden sonra örnek kurulum kaydı tek anahtara json olarak girer', async () => {
    assert.deepEqual(await ornekVeriYukle(acik(), liste, secenek), { durum: 'yuklendi', moduller: ['kisiler', 'cnc-kurulum'] });
    const kayit = await acik().tx((db) => cncKurulumDurumu(db));
    assert.equal(kayit?.bicim, 'json');
    assert.deepEqual(kayit?.deger, ORNEK_DURUM);
  });

  test('ikinci koşu bir şey yazmaz', async () => {
    const once = await acik().tx((db) => cncKurulumDurumu(db));
    assert.deepEqual(await ornekVeriYukle(acik(), liste, secenek), { durum: 'yuklu', moduller: ['kisiler', 'cnc-kurulum'] });
    assert.equal((await acik().tx((db) => cncKurulumDurumu(db)))?.surum, once?.surum);
  });

  // Sayfa açıldığında prototip kendi boş durumunu kaydeder; örnek o kaydın üstüne yazmaz, yine de yüklü sayılır.
  test('örnek olmayan kayıt varken koşu yüklü der, kayda dokunmaz', async () => {
    const bos = { meta: { part: '', prog: '', op: '', stock: '' } };
    await acik().tx(async (db) => {
      const kisiId = await kisiNoKullaniciAdindan(db, ORNEK_YAZAN);
      await kayitGuncelle(db, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: bos, kisiId: kisiId ?? 0 });
    });
    const once = await acik().tx((db) => cncKurulumDurumu(db));
    assert.deepEqual(await ornekVeriYukle(acik(), liste, secenek), { durum: 'yuklu', moduller: ['kisiler', 'cnc-kurulum'] });
    const sonra = await acik().tx((db) => cncKurulumDurumu(db));
    assert.equal(sonra?.surum, once?.surum);
    assert.deepEqual(sonra?.deger, bos);
  });
});
