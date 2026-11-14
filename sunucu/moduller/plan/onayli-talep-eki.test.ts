import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { SatinAlmaEkiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';

// 3256-2: Planlama ve Kokpit'in okuduğu satın alma eki onaylı, siparişi verilmemiş talebi açık sipariş satırı olarak taşır (numara talep no).
// Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const YOL = '/api/plan/satin-alma-eki';
const GUN = 86_400_000;

describe('Planlama satın alma eki onaylı talep (3256-2, gerçek PostgreSQL)', () => {
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
  const oku = async (cerez: string) => {
    const c = await app.inject({ method: 'GET', url: YOL, headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200, c.body);
    return c.json() as SatinAlmaEkiCevabi;
  };
  async function onayliTalep(sira: number, terminGun: number | null, birim = 'kg'): Promise<string> {
    const s = ortam!.sahip;
    const [t, kl, katalog, tk] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'onayda')",
      [t, 83000 + sira, yoneticiId]);
    await s.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, no]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id, miktar, birim) VALUES ($1, $2, 1, 'Deneme çubuk', $3, 25, $4)", [t, kl, katalog, birim]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, termin_gun) VALUES ($1, $2, 'TRY', current_date, $3)", [t, tk, terminGun]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, current_date)", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_onay (id, talep_id, kisi_id, sonuc) VALUES ($1, $2, $3, 'onay')", [randomUUID(), t, yoneticiId]);
    return (await s.tek<{ no: string }>('SELECT no FROM satin_alma_talep WHERE id = $1', [t]))!.no;
  }

  before(async () => {
    ortam = await testVeritabaniKur('plan_onayli_talep_eki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('OE-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    no = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('oe-dnm-1', 'hammadde', 'OE-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'oe-dnm-1', com: { ad: 'Deneme cubuk', birim: 'kg' } }), yoneticiId]))!.no;
  });
  after(async () => { await ortam?.kaldir(); });

  test('OTE-01: onaylı talep eke gelecek malzeme olarak gelir; tarih bugün + termin günü, termin günü yoksa boş; birimi farklı kalem gelmez', async () => {
    const yonetici = await girisCerezi('yonetici');
    assert.deepEqual((await oku(yonetici)).acikSiparisler, [], 'onaylı talep yokken liste boş');
    const termini = await onayliTalep(1, 10);
    const terminsiz = await onayliTalep(2, null);
    await onayliTalep(3, 5, 'adet');
    const once = tesisGunu(Date.now());
    const l = (await oku(yonetici)).acikSiparisler;
    const sonra = tesisGunu(Date.now());
    const gun = (g: string, n: number) => new Date(Date.parse(`${g}T00:00:00Z`) + n * GUN).toISOString().slice(0, 10);
    assert.ok(once === sonra, 'gün dönümünde koşmadı');
    assert.deepEqual(l, [
      { kod: String(no), miktar: 25, tarih: gun(once, 10), siparisNo: termini },
      { kod: String(no), miktar: 25, tarih: null, siparisNo: terminsiz },
    ]);
  });

  test('OTE-02: açık sipariş okuması olmayan onaylı talebi de görmez (yetki değişmedi)', async () => {
    const planci = await oku(await islemliKisi('planci', ['recete-rota.oku', 'sayfa.malzemeler']));
    assert.equal(planci.acikSiparisler, null);
  });
});
