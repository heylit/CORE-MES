import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { SatinAlmaEkiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';

// 533 a: eski planlama sayfası açık sipariş gelişlerini ve tedarik terminlerini bu uçtan alır; sunucu birleştirmesiyle aynı ek.
// Malzemeyi okuyamayan ikisini de, açık siparişi okuyamayan siparişleri null alır. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const YOL = '/api/plan/satin-alma-eki';

describe('Planlama satın alma eki ucu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let no = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    return girisCerezi(kullaniciAdi);
  }
  const oku = async (cerez?: string) => {
    const c = await app.inject({ method: 'GET', url: YOL, headers: cerez ? { cookie: cerez } : {} });
    return { kod: c.statusCode, govde: c.statusCode === 200 ? (c.json() as SatinAlmaEkiCevabi) : null };
  };

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_satin_alma_eki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SE-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const r = await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('se-dnm-1', 'hammadde', 'SE-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'se-dnm-1', com: { ad: 'Deneme cubuk' } }), yoneticiId],
    );
    no = r?.no ?? 0;
  });
  after(async () => { await ortam?.kaldir(); });

  test('SAE-01: girilen termin eke gelir; açık sipariş okuyan liste alır, okumayan null alır', async () => {
    const yonetici = await girisCerezi('yonetici');
    const yaz = await app.inject({
      method: 'POST', url: '/api/satin-alma-tedarik-terminleri/kaydet', headers: { cookie: yonetici, 'istek-kimligi': crypto.randomUUID() },
      payload: { malzemeNo: no, termin: '2026-11-20', aciklama: 'Deneme', surum: null },
    });
    assert.equal(yaz.statusCode, 200, yaz.body);
    const tam = await oku(yonetici);
    assert.equal(tam.kod, 200);
    assert.deepEqual(tam.govde?.tedarikTerminleri?.find((t) => t.kod === String(no)), { kod: String(no), termin: '2026-11-20', surum: 1, aciklama: 'Deneme' });
    assert.deepEqual(tam.govde?.acikSiparisler, []);
    const planci = await oku(await islemliKisi('planci', ['recete-rota.oku', 'sayfa.malzemeler']));
    assert.equal(planci.govde?.acikSiparisler, null);
    assert.equal(planci.govde?.tedarikTerminleri?.find((t) => t.kod === String(no))?.termin, '2026-11-20');
  });

  test('SAE-02: malzemeyi okuyamayan ikisini de null alır; reçete okuması olmayan 403, oturumsuz 401', async () => {
    assert.deepEqual((await oku(await islemliKisi('okur', ['recete-rota.oku']))).govde, { acikSiparisler: null, tedarikTerminleri: null });
    assert.equal((await oku(await islemliKisi('ilgisiz', ['stok.oku']))).kod, 403);
    assert.equal((await oku()).kod, 401);
  });
});
