import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { CANLI_RED, modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import * as servis from './servis.ts';

const ZINCIR = ['istasyonlar', 'kisiler', 'malzemeler', 'stok'];

describe('stok örnek verisi (gerçek PostgreSQL)', { timeout: 120_000 }, () => {
  let ortam: TestVeritabani | undefined;
  let liste: OrnekVeriTanimi[] = [];
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const secenek = { ortam: 'gelistirme' as const, parolaUret: () => 'ornek-parola-1', bildir: () => undefined };

  before(async () => {
    ortam = await testVeritabaniKur('stok_ornek');
    liste = (await modulOrnekVerileriniKesfet()).filter((t) => ZINCIR.includes(t.modul));
  });
  after(async () => { await ortam?.kaldir(); });

  test('canlı ortamda yüklenmez', async () => {
    await assert.rejects(() => ornekVeriYukle(vt(), liste, { ...secenek, ortam: 'canli' }), { message: CANLI_RED });
  });

  test('boş veritabanına yüklenir: stok, parti, konum ve farklı durumlu istekler gelir; ikinci koşu yüklü der', async () => {
    const sonuc = await ornekVeriYukle(vt(), liste, secenek);
    assert.equal(sonuc.durum, 'yuklendi');
    assert.ok(sonuc.moduller.includes('stok'));

    const stok = await vt().tx((db) => servis.malzemeListesi(db, { sayfa: 1, sayfaBoyu: 50, yon: 'artan' as const }));
    const toplamlar = new Map(stok.satirlar.map((s) => [s.ad, s.toplam]));
    assert.equal(toplamlar.get('ORNEK Yuvarlak çubuk Ø50'), '800');
    assert.equal(toplamlar.get('ORNEK Sac levha 10 mm'), '280');
    assert.equal(toplamlar.get('ORNEK Kesme yağı'), '120');
    const cubuk = stok.satirlar.find((s) => s.ad === 'ORNEK Yuvarlak çubuk Ø50');
    assert.equal(cubuk?.konumSayisi, 2);

    const konumlar = await vt().tx((db) => servis.konumListesi(db, { sayfa: 1, sayfaBoyu: 200, yon: 'artan' as const }));
    assert.ok(['ORN-ZEMIN-1', 'ORN-ZEMIN-2', 'ORN-ARA'].every((kod) => konumlar.satirlar.some((k) => k.kod === kod)));
    assert.ok(konumlar.satirlar.some((k) => k.kod.startsWith('OA') && k.tur === 'raf_gozu'));

    const partiler = await vt().tx((db) => servis.partiListesi(db, { sayfa: 1, sayfaBoyu: 50, yon: 'artan' as const }));
    assert.ok(partiler.satirlar.length >= 4);

    const hareketler = await vt().tx((db) => servis.hareketListesi(db, { sayfa: 1, sayfaBoyu: 50, yon: 'artan' as const }));
    assert.ok(hareketler.satirlar.filter((h) => h.tur === 'giris').length >= 5);

    const kisi = await vt().tx((db) => kisiNoKullaniciAdindan(db, 'ornek.operator1'));
    assert.ok(kisi !== null);
    const istekler = await vt().tx((db) => servis.malzemeIstekleriListesi(db, kisi!, { sayfa: 1, sayfaBoyu: 50, yon: 'artan' as const }));
    const durumlar = new Set(istekler.satirlar.map((i) => i.durum));
    for (const d of ['acik', 'stok_yok', 'hazirlaniyor', 'teslim']) assert.ok(durumlar.has(d as never), `istek durumu yok: ${d}`);

    const ikinci = await ornekVeriYukle(vt(), liste, secenek);
    assert.equal(ikinci.durum, 'yuklu');
    assert.equal((await vt().tx((db) => servis.hareketListesi(db, { sayfa: 1, sayfaBoyu: 50, yon: 'artan' as const }))).satirlar.length, hareketler.satirlar.length);
    assert.equal((await vt().tx((db) => servis.malzemeIstekleriListesi(db, kisi!, { sayfa: 1, sayfaBoyu: 50, yon: 'artan' as const }))).satirlar.length, istekler.satirlar.length);
  });
});
