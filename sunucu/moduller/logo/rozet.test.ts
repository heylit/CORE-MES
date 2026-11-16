import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { LogoRozetCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { belgeRozetDurumu } from './kurallar.ts';

// 3344: Logo'ya gidiş rozeti. Giden kutusu satırları testte doğrudan yazılır; Logo'ya istek yoktur. Veri uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('belge rozeti kuralı (3344)', () => {
  const g = (ek: Partial<Parameters<typeof belgeRozetDurumu>[0] & object> = {}) =>
    ({ sonSonuc: null, sonrakiDeneme: null, sonHata: null, logoKayitNo: null, ...ek });
  test('RZ-1 sıra: Logo kaydı, bağlı kart, bekleme, giden kutusu; iz yoksa rozet yok', () => {
    assert.deepEqual(belgeRozetDurumu(g({ sonSonuc: 'gonderildi', logoKayitNo: '41' }), { durum: 'kart-bekliyor', ileti: 'x' }, null),
      { durum: 'logoda', kayitNo: '41', neden: null });
    assert.deepEqual(belgeRozetDurumu(null, null, '77'), { durum: 'logoda', kayitNo: '77', neden: null });
    assert.deepEqual(belgeRozetDurumu(g(), { durum: 'proje-bekliyor', ileti: 'ORN.PRJ bekliyor' }, null),
      { durum: 'proje-bekliyor', kayitNo: null, neden: 'ORN.PRJ bekliyor' });
    assert.deepEqual(belgeRozetDurumu(g(), null, null), { durum: 'sirada', kayitNo: null, neden: null });
    assert.deepEqual(belgeRozetDurumu(g({ sonSonuc: 'reddedildi', sonHata: 'Logo reddetti.' }), null, null),
      { durum: 'durdu', kayitNo: null, neden: 'Logo reddetti.' });
    assert.deepEqual(belgeRozetDurumu(g({ sonSonuc: 'ulasilamadi', sonHata: 'Ulaşılamadı.', sonrakiDeneme: new Date() }), null, null),
      { durum: 'yeniden-denenecek', kayitNo: null, neden: 'Ulaşılamadı.' });
    assert.equal(belgeRozetDurumu(null, null, null), null);
  });
});

describe('Logo rozet ucu (3344, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerez = new Map<string, string>();
  let yoneticiId = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function girisliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const kod = `gecici_rz_${kullaniciAdi.replace(/-/g, '_')}`;
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, islem]);
    await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, kisi, rol.id);
      await rolAl(db, yoneticiId, kisi, yoneticiRolu.id);
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  const oku = async (kim: string, sorgu: string) => {
    const c = await app.inject({ method: 'GET', url: `/api/logo/belge-durumlari?${sorgu}`, headers: { cookie: cerez.get(kim) ?? '' } });
    return { durum: c.statusCode, govde: c.json<LogoRozetCevabi>() };
  };

  before(async () => {
    ortam = await testVeritabaniKur('logorozet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'rz-yonetici', parola: PAROLA }));
    await girisliKisi('rz-satis', ['siparisler.oku']);
    await girisliKisi('rz-satinalma', ['satin-alma.oku']);
    const ekle = (tur: string, no: number, kolon: string, deger: string) =>
      vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no${kolon}) VALUES ($1, $2${deger})`, [tur, no]);
    await ekle('siparisler-teklifi', 1, ", son_deneme, son_sonuc, logo_kayit_no", ", now(), 'gonderildi', '9001'");
    await ekle('siparisler-teklifi', 2, ', niyet_zamani', ', now()');
    await ekle('siparisler-teklifi', 3, ', son_deneme, son_sonuc, son_hata', ", now(), 'reddedildi', 'Deneme ret'");
    await ekle('siparisler-siparisi', 4, ", son_deneme, son_sonuc, logo_kayit_no", ", now(), 'gonderildi', '9004'");
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('RZ-2 tür kendi giden satırlarını okur; izi olmayan belge listede yok', async () => {
    const t = await oku('rz-satis', 'tur=teklif&id=1,2,3,4,5');
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    assert.deepEqual(t.govde.durumlar, [
      { id: 1, durum: 'logoda', kayitNo: '9001', neden: null },
      { id: 2, durum: 'sirada', kayitNo: null, neden: null },
      { id: 3, durum: 'durdu', kayitNo: null, neden: 'Deneme ret' },
    ]);
    const s = await oku('rz-satis', 'tur=satis-siparisi&id=1,4');
    assert.deepEqual(s.govde.durumlar, [{ id: 4, durum: 'logoda', kayitNo: '9004', neden: null }]);
  });

  test('RZ-3 yetki türe göre; oturumsuz 401; sınırı aşan ve bozuk kimlik 400', async () => {
    assert.equal((await oku('rz-satinalma', 'tur=teklif&id=1')).durum, 403);
    assert.equal((await oku('rz-satis', 'tur=satin-alma-siparisi&id=1')).durum, 403);
    assert.equal((await oku('rz-satinalma', 'tur=satin-alma-siparisi&id=1')).durum, 200);
    assert.equal((await oku('yok', 'tur=teklif&id=1')).durum, 401);
    assert.equal((await oku('rz-satis', `tur=teklif&id=${Array.from({ length: 201 }, (_, i) => i + 1).join(',')}`)).durum, 400);
    assert.equal((await oku('rz-satis', 'tur=teklif&id=1,x')).durum, 400);
  });
});
