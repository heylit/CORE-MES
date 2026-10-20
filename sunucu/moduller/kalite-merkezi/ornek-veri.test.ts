import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Veritabani } from '#cekirdek/db.ts';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import { malzemeOzeti, ornekMalzemeNo } from '../malzemeler/disari.ts';
import { degisiklikler } from './servis.ts';

describe('kalite-merkezi örnek verisi', { timeout: 60_000 }, () => {
  let vt: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;
  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı.');
    return vt;
  };
  const secenek = { ortam: 'test' as const, parolaUret: () => 'ornek-parola-uzun-123', bildir: () => {} };
  // Başka modülün örnek verisi yalnız keşifle alınır (modül sınırı); gerekir zinciri kisiler ve malzemelerdir.
  const ZINCIR = ['kisiler', 'malzemeler', 'kalite-merkezi'];
  const liste = async () => (await modulOrnekVerileriniKesfet()).filter((t) => ZINCIR.includes(t.modul));

  before(async () => {
    ({ vt, kaldir } = await testVeritabaniKur('kalite_merkezi_ornek'));
  });
  after(async () => { await kaldir?.(); });

  test('gerekir zinciriyle 3 parça, 2 muayene (kabul ve ret), 1 uygunsuzluk ve ona bağlı DÖF girer; parça no malzeme kartının kodu', async () => {
    assert.deepEqual(await ornekVeriYukle(acik(), await liste(), secenek), { durum: 'yuklendi', moduller: ['kisiler', 'malzemeler', 'kalite-merkezi'] });
    const { degisiklikler: kayitlar } = await acik().tx((db) => degisiklikler(db, 0));
    const say = (k: string) => kayitlar.filter((d) => d.koleksiyon === k && d.govde !== null).length;
    assert.deepEqual([say('parca'), say('insp'), say('ncr'), say('capa')], [3, 2, 1, 1]);
    const milKodu = await acik().tx(async (db) => (await malzemeOzeti(db, (await ornekMalzemeNo(db, 'mil'))!))!.kod);
    const parcaNolari = kayitlar.filter((d) => d.koleksiyon === 'parca').map((d) => d.govde!.parcaNo);
    assert.ok(parcaNolari.includes(milKodu));
    assert.deepEqual(kayitlar.filter((d) => d.koleksiyon === 'insp').map((d) => d.govde!.sonuc).sort(), ['Kabul', 'Ret']);
    const dof = kayitlar.find((d) => d.koleksiyon === 'capa')!;
    const ncr = kayitlar.find((d) => d.koleksiyon === 'ncr')!;
    assert.equal(dof.govde!.ncrRef, ncr.kimlik);
  });

  test('ikinci koşu bir şey yazmaz', async () => {
    const once = (await acik().tx((db) => degisiklikler(db, 0))).surum;
    assert.equal((await ornekVeriYukle(acik(), await liste(), secenek)).durum, 'yuklu');
    assert.equal((await acik().tx((db) => degisiklikler(db, 0))).surum, once);
  });
});
