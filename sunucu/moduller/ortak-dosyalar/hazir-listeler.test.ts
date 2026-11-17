import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { HAZIR_DOSYA_SINIRI, HAZIR_KAYIT_SINIRI } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import type { HazirDosyalarCevabi, HazirKayitlarCevabi, Klasor, OrtakDosya, YetkiCevabi } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { kablola, sunucununBaglari } from '../../kablolama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { aramaUyar, hazirSaglayiciKaydet, type HazirSaglayici } from './hazir-listeler.ts';

// Kart 3390 (3390 a): hazır listeler. Risk K1: liste ve satır yalnız kaydı okuyabilene, grup yalnız kaynağı okuyabilene; kaydın klasör
// grubu klasör düzeyiyle süzülür, indirme kaynağın ucundandır. Gerçek uçlar, gerçek PostgreSQL; ORN- veri.
const PAROLA = 'dogru-parola-1';
interface Oturum { cerez: string; id: number }
const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(600)]);
const ozetOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

describe('hazır listeler (kart 3390; gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Oturum;
  let okuyan: Oturum;
  let okumayan: Oturum;
  let gizliOkuyan: Oturum;
  const rolId = new Map<string, number>();
  let sayac = 0;
  let siparisKlasoru: Klasor;
  let siparisDosyasi: OrtakDosya;
  // Sahte kaynak: 'cizim' grubu yalnız `sayfa.cizimler` olan kişiye gelir (sağlayıcının K1 süzmesi).
  let kayitSayisi = 3;
  let dosyaSayisi = 1;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const gonder = (o: Oturum, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: o.cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
  const oku = (o: Oturum, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: o.cerez } });

  async function rolAc(kod: string, islemler: readonly string[]): Promise<void> {
    const r = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    assert.ok(r);
    for (const i of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [r.id, i]);
    rolId.set(kod, r.id);
  }
  async function girisYap(rolKodu: string): Promise<Oturum> {
    const kullaniciAdi = `hazir-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
      await rolAta(db, yonetici.id, yeni, rolId.get(rolKodu) ?? 0);
      await rolAl(db, yonetici.id, yeni, yon?.id ?? 0);
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  async function yukle(o: Oturum, klasorId: number, ad: string): Promise<OrtakDosya> {
    const icerik = pdf();
    const ozet = ozetOf(icerik);
    const p = await app.inject({
      method: 'POST', url: `/api/dosyalar/${ozet}/parca`, payload: { sira: 0, toplam: 1, veri: icerik.toString('base64') }, headers: { cookie: o.cerez },
    });
    assert.equal(p.statusCode, 200, p.body);
    const c = await gonder(o, `/ortak-dosyalar/klasorler/${klasorId}/yukle`, { ad, ozet });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<OrtakDosya>();
  }

  const sahte: HazirSaglayici = {
    okuma: ['sayfa.uretim-emirleri'],
    kayitlar: (_db, ara, sinir) => Promise.resolve(Array.from({ length: kayitSayisi }, (_, i) => ({
      anahtar: String(i + 1), no: `ORN-UE-${String(i + 1).padStart(4, '0')}`, baslik: i === 0 ? 'ORN Flanş' : 'ORN Mil', alt: null,
    })).filter((k) => aramaUyar(ara, k.no, k.baslik)).slice(0, sinir)),
    kayit: (_db, k, anahtar) => Promise.resolve(anahtar !== '1' ? null : {
      kayit: { anahtar: '1', no: 'ORN-UE-0001', baslik: 'ORN Flanş', alt: null },
      kayitYolu: '/uretim-emirleri/1',
      gruplar: islemVarMi(k, 'sayfa.cizimler')
        ? [{ kaynak: 'cizim', dosyalar: Array.from({ length: dosyaSayisi }, (_, i) => ({
          ad: `ORN-PRC-${String(i)}.pdf`, dosyaTuru: 'pdf', bilgi: 'Rev A', zaman: null, ac: '/cizimler/belge/1', indir: `/cizimler/1/revizyonlar/${String(i + 1)}/dosya`,
        })) }]
        : [],
      klasorler: [{ tur: 'siparis', id: 900001 }],
    }),
  };

  before(async () => {
    ortam = await testVeritabaniKur('ortak_dosyalar_hazir');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kablola();
    const ilkId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'hazir-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'hazir-yonetici', parola: PAROLA } });
    yonetici = { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id: ilkId };
    await rolAc('deneme_okuyan', ['sayfa.ortak-dosyalar', 'sayfa.uretim-emirleri', 'sayfa.cizimler']);
    await rolAc('deneme_okumayan', ['sayfa.ortak-dosyalar']);
    await rolAc('deneme_gizli', ['sayfa.ortak-dosyalar', 'sayfa.uretim-emirleri']);
    okuyan = await girisYap('deneme_okuyan');
    okumayan = await girisYap('deneme_okumayan');
    gizliOkuyan = await girisYap('deneme_gizli');
    // Kaydın sipariş klasörü: sistem klasörü gibi kaynak taşır; okuyan görür, gizli rol görmez.
    const ust = await gonder(yonetici, '/ortak-dosyalar/klasorler', { ustId: null, ad: 'ORN Siparişler' });
    assert.equal(ust.statusCode, 200, ust.body);
    siparisKlasoru = ust.json<Klasor>();
    await ortam.sahip.sorgu("UPDATE ortak_dosyalar_klasor SET kaynak_tur = 'siparis', kaynak_id = 900001 WHERE id = $1", [siparisKlasoru.id]);
    const once = (await oku(yonetici, `/ortak-dosyalar/klasorler/${siparisKlasoru.id}/yetki`)).json<YetkiCevabi>();
    const y = await gonder(yonetici, `/ortak-dosyalar/klasorler/${siparisKlasoru.id}/yetki`, {
      surum: once.surum, ozelYetki: true, satirlar: [{ rolId: rolId.get('deneme_okuyan') ?? 0, duzey: 'gorur' }],
    });
    assert.equal(y.statusCode, 200, y.body);
    const alt = await gonder(yonetici, '/ortak-dosyalar/klasorler', { ustId: siparisKlasoru.id, ad: 'Teklif' });
    assert.equal(alt.statusCode, 200, alt.body);
    siparisDosyasi = await yukle(yonetici, alt.json<Klasor>().id, 'ORN-SS-0001_Teklif_r1.pdf');
    // Görünür kökün altındaki görünmeyen klasör: dosyası listeye sızmamalı (ADR 0030 5).
    const gizli = (await gonder(yonetici, '/ortak-dosyalar/klasorler', { ustId: siparisKlasoru.id, ad: 'Gizli' })).json<Klasor>();
    const gy = (await oku(yonetici, `/ortak-dosyalar/klasorler/${gizli.id}/yetki`)).json<YetkiCevabi>();
    assert.equal((await gonder(yonetici, `/ortak-dosyalar/klasorler/${gizli.id}/yetki`, { surum: gy.surum, ozelYetki: true, satirlar: [] })).statusCode, 200);
    await yukle(yonetici, gizli.id, 'ORN-gizli.pdf');
    hazirSaglayiciKaydet('uretim-emri', sahte);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('HL-1 kaydı okuma işlemi olmayan kişi listeyi ve kaydı göremez (404, varlık sızmaz)', async () => {
    assert.equal((await oku(okumayan, '/ortak-dosyalar/hazir/uretim-emri')).statusCode, 404);
    assert.equal((await oku(okumayan, '/ortak-dosyalar/hazir/uretim-emri/1')).statusCode, 404);
    assert.equal((await oku(okuyan, '/ortak-dosyalar/hazir/bilinmeyen')).statusCode, 400);
  });

  test('HL-2 liste tr-TR harfle aranır; sınırı aşan liste "daha" der, sayı uydurmaz', async () => {
    const c = await oku(okuyan, `/ortak-dosyalar/hazir/uretim-emri?ara=${encodeURIComponent('FLANŞ')}`);
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<HazirKayitlarCevabi>().kayitlar.map((k) => k.no), ['ORN-UE-0001']);
    kayitSayisi = HAZIR_KAYIT_SINIRI + 5;
    const uzun = (await oku(okuyan, '/ortak-dosyalar/hazir/uretim-emri')).json<HazirKayitlarCevabi>();
    assert.equal(uzun.kayitlar.length, HAZIR_KAYIT_SINIRI);
    assert.equal(uzun.daha, true);
    kayitSayisi = 3;
  });

  test('HL-3 kaydın dosyaları: kaynak grubu ve görünür klasör grubu; indirme klasör dosyasının kendi ucundan', async () => {
    const c = await oku(okuyan, '/ortak-dosyalar/hazir/uretim-emri/1');
    assert.equal(c.statusCode, 200, c.body);
    const r = c.json<HazirDosyalarCevabi>();
    assert.deepEqual(r.gruplar.map((g) => g.kaynak), ['cizim', 'klasor']);
    const klasor = r.gruplar.find((g) => g.kaynak === 'klasor');
    assert.deepEqual(klasor?.dosyalar.map((d) => [d.ad, d.bilgi, d.dosyaTuru]), [['ORN-SS-0001_Teklif_r1.pdf', 'Teklif', 'pdf']]);
    const indir = await oku(okuyan, klasor?.dosyalar[0]?.indir ?? '');
    assert.equal(indir.statusCode, 200);
    assert.ok(klasor?.dosyalar[0]?.indir.includes(`/dosyalar/${String(siparisDosyasi.id)}/`));
    assert.equal(r.kesildi, false);
    assert.deepEqual(r.klasor, { tur: 'siparis', id: siparisKlasoru.id });
    assert.equal((await oku(okuyan, '/ortak-dosyalar/hazir/uretim-emri/2')).statusCode, 404);
  });

  test('HL-4 kaynağı okumayan kişiye grup gelmez; klasörü görmeyene klasör grubu gelmez (Risk K1, ADR 0030 5)', async () => {
    const c = await oku(gizliOkuyan, '/ortak-dosyalar/hazir/uretim-emri/1');
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<HazirDosyalarCevabi>().gruplar, []);
    assert.equal(c.json<HazirDosyalarCevabi>().klasor, null);
  });

  test('HL-5 toplam satır sınırı aşılınca liste kesilir ve kesildiği söylenir', async () => {
    dosyaSayisi = HAZIR_DOSYA_SINIRI + 3;
    const r = (await oku(okuyan, '/ortak-dosyalar/hazir/uretim-emri/1')).json<HazirDosyalarCevabi>();
    assert.equal(r.gruplar.reduce((t, g) => t + g.dosyalar.length, 0), HAZIR_DOSYA_SINIRI);
    assert.equal(r.kesildi, true);
    dosyaSayisi = 1;
  });

  test('HL-6 gerçek sağlayıcılar: satın almayı okumayan siparişi göremez; olmayan kayıt 404', async () => {
    assert.equal((await oku(okuyan, '/ortak-dosyalar/hazir/satin-alma-siparisi')).statusCode, 404);
    const c = await oku(yonetici, '/ortak-dosyalar/hazir/satin-alma-siparisi');
    assert.equal(c.statusCode, 200, c.body);
    assert.equal((await oku(yonetici, '/ortak-dosyalar/hazir/satin-alma-siparisi/ORN-YOK-1')).statusCode, 404);
    // kablola() bir kez kurar; sahte sağlayıcının yerine gerçeği, bağın kendisi yeniden kurar.
    for (const b of sunucununBaglari()) if (b.ad.endsWith('-> ortak dosyalar hazır liste')) b.kur();
    assert.equal((await oku(yonetici, '/ortak-dosyalar/hazir/uretim-emri/abc')).statusCode, 404);
    assert.equal((await oku(yonetici, '/ortak-dosyalar/hazir/uretim-emri/999999')).statusCode, 404);
    assert.equal((await oku(yonetici, '/ortak-dosyalar/hazir/uretim-emri')).statusCode, 200);
  });
});
