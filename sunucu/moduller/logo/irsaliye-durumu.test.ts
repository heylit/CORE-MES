import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { OLCUM_DURUMU } from './irsaliye-etiket-esleme.ts';
import type { OlcumDurumu } from './irsaliye-etiket-esleme.ts';
import { irsaliyeAyariniDegistir } from './irsaliye-ayari.ts';
import { gonderimDurumu, irsaliyeGonderimDurumlari } from './irsaliye-durumu.ts';
import * as s from './sorgular.ts';

const TAM: OlcumDurumu = { satinAlmaEtiketleriOlculdu: true, satisEtiketleriOlculdu: true, konsinyeOlculdu: true, durumKodlariOnaylandi: true, eIrsaliyeUreticisiBelli: true, teyitKalkti: true };

test('gonderimDurumu: kayıt no gitti, niyet sırada, belirsiz belirsiz, diğer sonuçlar hata, hiçbiri gitmedi', () => {
  const g = { logoKayitNo: null, niyetZamani: null, sonSonuc: null };
  assert.equal(gonderimDurumu(g), 'gitmedi');
  assert.equal(gonderimDurumu({ ...g, niyetZamani: new Date() }), 'sirada');
  assert.equal(gonderimDurumu({ ...g, logoKayitNo: '501', sonSonuc: 'gonderildi' }), 'gitti');
  assert.equal(gonderimDurumu({ ...g, niyetZamani: new Date(), sonSonuc: 'belirsiz' }), 'belirsiz');
  assert.equal(gonderimDurumu({ ...g, sonSonuc: 'reddedildi' }), 'hata');
  assert.equal(gonderimDurumu({ ...g, sonSonuc: 'ulasilamadi' }), 'hata');
});

describe('Logo irsaliye gönderim durumu (3694, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  before(async () => {
    ortam = await testVeritabaniKur('logoirsaliyedurumu');
    kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'id-yonetici', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });
  afterEach(() => { mock.restoreAll(); });
  beforeEach(async () => {
    await vt().sorgu('DELETE FROM logo_irsaliye_giden');
    await vt().sorgu("DELETE FROM ayar WHERE anahtar = 'logo.sevk-irsaliyesi'");
  });

  test('kapalıyken acik=false ve satır dönmez; açıkken satırlar durumla döner, hata metninden kimlik silinir', async () => {
    await vt().tx((db) => s.niyetYaz(db, 'satis-irsaliyesi', 7, new Date('2026-11-25T09:00:00Z')));
    await vt().tx((db) => s.denemeYaz(db, 'konsinye-irsaliyesi', 8, {
      zaman: new Date('2026-11-25T09:00:00Z'), sonuc: 'reddedildi', hata: 'Şoför 10000000146 geçersiz', logoKayitNo: null, niyetZamani: null, sonrakiDeneme: null, basarili: false,
    }));
    await vt().tx((db) => s.denemeYaz(db, 'satis-irsaliyesi', 9, {
      zaman: new Date('2026-11-25T09:00:00Z'), sonuc: 'gonderildi', hata: null, logoKayitNo: '501', niyetZamani: null, sonrakiDeneme: null, basarili: true,
    }));
    assert.deepEqual(await vt().tx((db) => irsaliyeGonderimDurumlari(db, [7, 8, 9])), { acik: false, satirlar: [] });
    for (const [k, v] of Object.entries(TAM) as [keyof OlcumDurumu, boolean][]) mock.property(OLCUM_DURUMU, k, v);
    await vt().tx((db) => irsaliyeAyariniDegistir(db, kisiId, 'logo.sevk-irsaliyesi', true, false));
    const c = await vt().tx((db) => irsaliyeGonderimDurumlari(db, [7, 8, 9, 10]));
    assert.equal(c.acik, true);
    assert.deepEqual(c.satirlar.map((x) => [x.belgeNo, x.durum, x.kayitNo]), [[7, 'sirada', null], [8, 'hata', null], [9, 'gitti', '501']]);
    assert.equal(c.satirlar[1]?.hata, 'Şoför [gizlendi] geçersiz');
    assert.deepEqual(await vt().tx((db) => irsaliyeGonderimDurumlari(db, [])), { acik: true, satirlar: [] });
  });

  test('N2: yalnız satın alma irsaliyesi ayarı açıkken sevk durumu açık sayılmaz', async () => {
    await vt().sorgu("DELETE FROM ayar WHERE anahtar IN ('logo.sevk-irsaliyesi', 'logo.satin-alma-irsaliyesi')");
    for (const [k, v] of Object.entries(TAM) as [keyof OlcumDurumu, boolean][]) mock.property(OLCUM_DURUMU, k, v);
    await vt().tx((db) => irsaliyeAyariniDegistir(db, kisiId, 'logo.satin-alma-irsaliyesi', true, false));
    assert.deepEqual(await vt().tx((db) => irsaliyeGonderimDurumlari(db, [7])), { acik: false, satirlar: [] });
    await vt().sorgu("DELETE FROM ayar WHERE anahtar = 'logo.satin-alma-irsaliyesi'");
  });
});
