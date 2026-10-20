import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ornekVeriTanimi, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kisiNoKullaniciAdindan, yoneticiOlustur } from '../kisiler/disari.ts';
import { alanlar, gozBul, gozler } from './disari.ts';
import { ornekVeri } from './ornek-veri.ts';
import { salonEkle, salonlar } from './servis.ts';

// Zincirin kisiler halkası: örnek veri ornek.planlama kişisiyle kaydeder (kisiler payının sağladığı hesap).
const kisiler = ornekVeriTanimi({
  modul: 'kisiler',
  gerekir: [],
  yukluMu: async (db) => (await kisiNoKullaniciAdindan(db, 'ornek.planlama')) !== null,
  yukle: async (db, b) => { await yoneticiOlustur(db, { ad: 'Ornek Planlama', kullaniciAdi: 'ornek.planlama', parola: b.parolaUret() }); },
});

describe('atolye örnek verisi (gerçek PostgreSQL)', { timeout: 60_000 }, () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  before(async () => { ortam = await testVeritabaniKur('atolye_ornek'); });
  after(async () => { await ortam?.kaldir(); });

  test('iki bölüm yan yana, depo rafları gözleriyle kurulur; var olan bölüme binmez; ikinci koşu yüklü der', async () => {
    const elle = await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: 'Elle Yonetici', kullaniciAdi: 'elle', parola: 'dogru-parola-1' });
      return salonEkle(db, { kod: 'ELLE', ad: 'Elle girilen', genislik: 20, derinlik: 60, hucreBoyu: 4 }, kisi);
    });
    const secenek = { ortam: 'gelistirme' as const, parolaUret: () => 'ornek-parola-1', bildir: () => undefined };
    assert.deepEqual(await ornekVeriYukle(vt(), [ornekVeri, kisiler], secenek), { durum: 'yuklendi', moduller: ['kisiler', 'atolye'] });

    const liste = await vt().tx((db) => salonlar(db));
    const uretim = liste.find((s) => s.kod === 'ORN-URT');
    const depo = liste.find((s) => s.kod === 'ORN-DEP');
    if (!uretim || !depo) throw new Error('örnek bölümler yok');
    assert.ok(Number(uretim.fabrika.x) >= Number(elle.fabrika.x) + 20, 'elle girilen bölümün sağında');
    assert.equal(Number(depo.fabrika.x), Number(uretim.fabrika.x) + 40, 'depo üretimin sağ duvarına dayanır');
    assert.equal(depo.fabrika.z, uretim.fabrika.z);

    const depoGozleri = await vt().tx((db) => gozler(db, depo.id));
    assert.equal(depoGozleri.length, 3 * 4 * 2 * 2 + 4 * 5 * 3);
    assert.equal((await vt().tx((db) => gozBul(db, 'ORNK-04-5-3')))?.salonId, depo.id);
    const turler = (await vt().tx((db) => alanlar(db, depo.id))).map((a) => a.tur).sort();
    assert.deepEqual(turler, ['depo_zemini', 'kabul', 'sevkiyat', 'yuruyus_yolu']);
    assert.ok((await vt().tx((db) => alanlar(db, uretim.id))).some((a) => a.tur === 'uretim_cikisi'));
    // Numune teslimi kutuyu adıyla bulur ve yalnız ara alanı kabul eder (kullanıcı kararı 125 a).
    assert.ok((await vt().tx((db) => alanlar(db, uretim.id))).some((a) => a.tur === 'ara_alan' && a.ad === 'Kalite numune'));

    assert.deepEqual(await ornekVeriYukle(vt(), [ornekVeri, kisiler], secenek), { durum: 'yuklu', moduller: ['kisiler', 'atolye'] });
    assert.equal((await vt().tx((db) => salonlar(db))).length, 3);
  });
});
