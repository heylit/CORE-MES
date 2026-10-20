import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { FasonSureleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { fasonSuresiTahminleri } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const yakin = (gercek: number | null, beklenen: number): void => {
  assert.ok(gercek !== null && Math.abs(gercek - beklenen) < 1e-6, `${String(gercek)} ~ ${beklenen}`);
};

describe('satin-alma fason süresi tahmini ve grafik ucu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let cerezYonetici = '';
  let cerezOperator = '';
  let firmaId = 0;
  let digerFirmaId = 0;
  let malzemeNo = 0;
  let tipId = 0;

  const giris = async (k: string): Promise<string> => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const al = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });

  // Fason iş emri: gidiş "basla" gün önce, dönüş sure gün sonra. İki INSERT ayrı deyimdir; her birinin now()'u ayrı olur
  // ve aradaki geçen süre sonuca karışırdı. Bu yüzden ikisi de aynı sabit andan hesaplanır, süre tam çıkar.
  const an = new Date().toISOString();
  async function fasonIsEmri(adet: number, basla: number, sure: number, terminGun: number | null, firma = firmaId): Promise<void> {
    const sahip = ortam!.sahip;
    const n = Math.random().toString(36).slice(2, 10).toUpperCase();
    const im = await sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`FM${n}`, 'Deneme Merkezi']);
    const ist = await sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`FI${n}`, 'Deneme istasyon', im!.id]);
    const e = await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum, malzeme_no) VALUES ('P-FS', 'Deneme', $1, $2, $3, 'planli', $4) RETURNING id",
      [adet, ist!.id, yoneticiId, malzemeNo]);
    const ie = await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, fason_firma_id, termin_gun) VALUES ($1, 1, 10, $2, 'Deneme fason', $3, $4) RETURNING id",
      [e!.id, tipId, firma, terminGun]);
    await sahip.sorgu(
      "INSERT INTO uretim_emirleri_fason_hareketi (is_emri_id, yon, adet, kisi_id, zaman) VALUES ($1, 'gidis', $2, $3, $5::timestamptz - make_interval(days => $4))", [ie!.id, adet, yoneticiId, basla, an]);
    await sahip.sorgu(
      "INSERT INTO uretim_emirleri_fason_hareketi (is_emri_id, yon, adet, hurda_adet, kisi_id, zaman) VALUES ($1, 'donus', $2, 0, $3, $5::timestamptz - make_interval(days => $4))", [ie!.id, adet, yoneticiId, basla - sure, an]);
  }

  before(async () => {
    ortam = await testVeritabaniKur('satin_alma_fason');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    cerezYonetici = await giris('yonetici');
    const rol = (await ortam.vt.tx((db) => db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'")))!;
    await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme operatör', kullaniciAdi: 'operator', parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
    });
    cerezOperator = await giris('operator');
    const ekle = async (ad: string): Promise<number> => {
      const r = await app.inject({ method: 'POST', url: '/api/musteri-tedarikci/firmalar/ekle', payload: { ad, tur: 'tedarikci' }, headers: { cookie: cerezYonetici, 'istek-kimligi': crypto.randomUUID() } });
      assert.equal(r.statusCode, 200, r.body);
      return (r.json() as { firma: { id: number } }).firma.id;
    };
    firmaId = await ekle('Deneme Fason A');
    digerFirmaId = await ekle('Deneme Fason B');
    const ayar = await app.inject({ method: 'POST', url: '/api/malzeme-katalogu-ayarlari/genel/kaydet', payload: { deger: { onayAkisi: false } }, headers: { cookie: cerezYonetici, 'istek-kimligi': crypto.randomUUID() } });
    assert.equal(ayar.statusCode, 200, ayar.body);
    const kart = await app.inject({
      method: 'POST', url: '/api/malzeme-katalogu-kartlari/fs-kart-1/kaydet', headers: { cookie: cerezYonetici, 'istek-kimligi': crypto.randomUUID() },
      payload: { kayit: { id: 'fs-kart-1', tur: 'hammadde', fam: 'metal', com: { kod: 'HM-SAT-00001', ad: 'Deneme mil', birim: 'adet' }, onay: { durum: 'aktif' } }, ozet: { benzersiz_anahtar: 'hammadde|fason-sure|fs-kart-1', mukerrer_gerekcesi: null }, surum: null },
    });
    assert.equal(kart.statusCode, 200, kart.body);
    malzemeNo = (await ortam.sahip.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kimlik = 'fs-kart-1'"))!.no;
    tipId = (await ortam.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('geçmiş yokken tahmin null, uç boş listeler döner', async () => {
    assert.deepEqual(await ortam!.vt.tx((db) => fasonSuresiTahminleri(db, [{ malzemeNo, operasyonTipiId: tipId, firmaId, adet: 10 }])), [null]);
    assert.deepEqual(await ortam!.vt.tx((db) => fasonSuresiTahminleri(db, [])), []);
    const r = await al(cerezYonetici, '/satin-alma-fason-sureleri');
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json(), { sureler: [], terminUyumu: [] });
  });

  test('gerçek gidiş ve dönüşten tahmin: aynı adet ortalaması, ara adet, yalnız bir yan; operasyonsuz, başka firma ve başka malzeme null; sıra korunur', async () => {
    await fasonIsEmri(10, 30, 4, 3);
    await fasonIsEmri(10, 20, 6, 10);
    await fasonIsEmri(30, 40, 8, null);
    const sonuc = await ortam!.vt.tx((db) => fasonSuresiTahminleri(db, [
      { malzemeNo, operasyonTipiId: tipId, firmaId, adet: 10 },
      { malzemeNo, operasyonTipiId: tipId, firmaId, adet: 20 },
      { malzemeNo, operasyonTipiId: null, firmaId, adet: 10 },
      { malzemeNo, operasyonTipiId: tipId, firmaId: digerFirmaId, adet: 10 },
      { malzemeNo: malzemeNo + 100000, operasyonTipiId: tipId, firmaId, adet: 10 },
      { malzemeNo, operasyonTipiId: tipId, firmaId, adet: 60 },
    ]));
    assert.equal(sonuc.length, 6);
    yakin(sonuc[0]!, 5);
    yakin(sonuc[1]!, 6.5);
    assert.deepEqual(sonuc.slice(2, 5), [null, null, null]);
    yakin(sonuc[5]!, 8);
    assert.deepEqual(await ortam!.vt.tx((db) => fasonSuresiTahminleri(db, [{ malzemeNo, operasyonTipiId: null, firmaId, adet: 10 }])), [null]);
  });

  test('uç: kırılım ortalaması ve adları, firma bazında termin uyumu (termin günü olmayan dışarıda), sonGun süzgeci; yetki ve oturum', async () => {
    const r = await al(cerezYonetici, '/satin-alma-fason-sureleri');
    assert.equal(r.statusCode, 200, r.body);
    const g = r.json() as FasonSureleriCevabi;
    assert.deepEqual(g.sureler.map((s) => [s.malzemeNo, s.operasyonTipiId, s.firmaId, s.adet, s.ornekSayisi, s.firmaAdi, s.malzemeAdi]), [
      [malzemeNo, tipId, firmaId, 30, 1, 'Deneme Fason A', 'Deneme mil'], [malzemeNo, tipId, firmaId, 10, 2, 'Deneme Fason A', 'Deneme mil'],
    ]);
    assert.ok(g.sureler.every((s) => typeof s.operasyonAdi === 'string'));
    yakin(g.sureler[0]!.ortalamaSureGun, 8);
    yakin(g.sureler[1]!.ortalamaSureGun, 5);
    assert.equal(g.terminUyumu.length, 1);
    const u = g.terminUyumu[0]!;
    assert.deepEqual([u.firmaId, u.firmaAdi, u.ornekSayisi, u.gecKalanSayisi], [firmaId, 'Deneme Fason A', 2, 1]);
    yakin(u.ortalamaFarkGun, -1.5);

    const son25 = (await al(cerezYonetici, '/satin-alma-fason-sureleri?sonGun=25')).json() as FasonSureleriCevabi;
    assert.deepEqual(son25.sureler.map((s) => [s.adet, s.ornekSayisi]), [[10, 1]]);
    yakin(son25.sureler[0]!.ortalamaSureGun, 6);
    assert.deepEqual(son25.terminUyumu.map((t) => [t.ornekSayisi, t.gecKalanSayisi]), [[1, 0]]);
    yakin(son25.terminUyumu[0]!.ortalamaFarkGun, -4);
    assert.deepEqual((await al(cerezYonetici, '/satin-alma-fason-sureleri?sonGun=5')).json(), { sureler: [], terminUyumu: [] });
    assert.equal((await al(cerezYonetici, '/satin-alma-fason-sureleri?sonGun=0')).statusCode, 400);
    assert.equal((await al(cerezOperator, '/satin-alma-fason-sureleri')).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/satin-alma-fason-sureleri' })).statusCode, 401);
  });
});
