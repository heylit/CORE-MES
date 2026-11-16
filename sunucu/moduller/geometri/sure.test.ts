import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { geometriSureCevabi } from '#paylasilan/sozlesme/geometri.ts';
import type { GeometriHamCevabi, GeometriSureCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { talasliAdimCozucusu } from './disari.ts';
import { delikDk, kabaHiziCm3Dk, kienzleKc, rotaToplamlari, sureTahmini } from './kurallar.ts';

// Talaştan kaba süre (kart 3278). Saf kural: elle hesaplanmış değerlerle; uç: gerçek PostgreSQL, analiz satırı elle (agirlik.test.ts gibi).
const yakin = (x: number, beklenen: number, m = ''): void => assert.ok(Math.abs(x - beklenen) < 1e-3, `${m} ${String(x)} != ${String(beklenen)}`);

describe('geometri: talaştan süre kuralları (3278)', () => {
  test('GEO-SU1 kaba hız güç sınırından: P 7,5 kW x 0,8 x 60000 / 1950; alt 0,3 katı; alüminyum çelikten hızlı, süper alaşım yavaş', () => {
    const p = kabaHiziCm3Dk('P');
    yakin(p.ust, 184.6154);
    yakin(p.alt, 55.3846);
    assert.ok(kabaHiziCm3Dk('N').ust > p.ust && kabaHiziCm3Dk('S').ust < p.ust);
  });

  test('GEO-SU2 matkap: boy / (f x n) + konumlama; küçük çapta ilerleme 0,05 mm/dev altına inmez', () => {
    yakin(delikDk('P', { capMm: 6, derinlikMm: 10 }), 10 / (0.09 * (80_000 / (Math.PI * 6))) + 0.1);
    yakin(delikDk('P', { capMm: 2, derinlikMm: 5 }), 5 / (0.05 * (80_000 / (Math.PI * 2))) + 0.1);
  });

  test('GEO-SU3 talaş yoksa sonuç yok (sıfır uydurulmaz); delik tanınmadıysa delik kalemi yazılmaz; orta geometrik ortalama', () => {
    assert.equal(sureTahmini({ iso: 'P', hamHacimMm3: 8000, parcaHacimMm3: 8000, alanMm2: 2800, delikler: [] }), null);
    const t = sureTahmini({ iso: 'P', hamHacimMm3: 14_784, parcaHacimMm3: 8000, alanMm2: 2800, delikler: null });
    assert.ok(t);
    assert.deepEqual(t.kalemler.map((k) => k.kalem), ['kaba', 'finis']);
    yakin(t.talasMm3, 6784);
    yakin(t.kalemler[0]!.altDk, 6.784 / 184.6154);
    yakin(t.kalemler[1]!.ustDk, 28 / 20);
    yakin(t.ortaDk, Math.sqrt(t.altDk * t.ustDk));
  });

  test('GEO-SU4 delik hacmi kabadan düşülür, delik kalemi adediyle gelir; çapı ya da derinliği sıfır delik sayılmaz', () => {
    const t = sureTahmini({ iso: 'P', hamHacimMm3: 14_784, parcaHacimMm3: 8000, alanMm2: 2800,
      delikler: [{ capMm: 6, derinlikMm: 10 }, { capMm: 0, derinlikMm: 10 }] });
    assert.ok(t);
    const kaba = t.kalemler.find((k) => k.kalem === 'kaba')!, delik = t.kalemler.find((k) => k.kalem === 'delik')!;
    yakin(kaba.altDk, (6784 - Math.PI * 9 * 10) / 1000 / 184.6154);
    assert.equal(delik.adet, 1);
    yakin(delik.altDk, delikDk('P', { capMm: 6, derinlikMm: 10 }) * 0.7);
    yakin(delik.ustDk, delikDk('P', { capMm: 6, derinlikMm: 10 }) * 1.5);
  });
  test('GEO-SU15 (3321-2) Kienzle kc = kc1 x hm^-mc; kaba hız kc ve tezgâh gücüyle; verilmezse grubun ortalaması ve 7,5 kW', () => {
    assert.equal(kienzleKc(2450, 0.23), 4161);
    assert.equal(kienzleKc(1900, 0.24), 3302);
    assert.equal(kienzleKc(1000, 0.25, 1), 1000);
    yakin(kabaHiziCm3Dk('P', 3302, 15).ust, 15 * 0.8 * 60_000 / 3302);
    yakin(kabaHiziCm3Dk('M', 1970).ust, 7.5 * 0.8 * 60_000 / 1970 * 0.8);
    const varsayilan = sureTahmini({ iso: 'P', hamHacimMm3: 14_784, parcaHacimMm3: 8000, alanMm2: 2800, delikler: null })!;
    const guclu = sureTahmini({ iso: 'P', hamHacimMm3: 14_784, parcaHacimMm3: 8000, alanMm2: 2800, delikler: null, kc: 1950, gucKw: 15 })!;
    yakin(guclu.kalemler[0]!.altDk * 2, varsayilan.kalemler[0]!.altDk, 'iki kat güç kabayı yarıya indirir');
    yakin(guclu.kalemler[1]!.altDk, varsayilan.kalemler[1]!.altDk, 'finiş güçten bağımsız');
  });

  test('GEO-SU11 rota toplamları: teorik toplam dolu adımlardan, boş adım eksik der; ölçüm toplamı ölçülü adımlardan; adım yoksa null', () => {
    const a = (opNo: number, islemDk: number | null, olcumOrtancaDk: number | null) => ({ opNo, ad: `OP ${opNo}`, islemDk, olcumOrtancaDk, olcumAdedi: olcumOrtancaDk === null ? 0 : 3 });
    assert.deepEqual(rotaToplamlari([]), { adimlar: [], islemToplamDk: null, olcumToplamDk: null, eksik: false });
    const t = rotaToplamlari([a(10, 2.5, 3), a(20, null, null), a(30, 1.25, null)]);
    assert.deepEqual([t.islemToplamDk, t.olcumToplamDk, t.eksik, t.adimlar.length], [3.75, 3, true, 3]);
    assert.deepEqual([rotaToplamlari([a(10, 2, null)]).olcumToplamDk, rotaToplamlari([a(10, 2, null)]).eksik], [null, false]);
  });
});

const PAROLA = 'dogru-parola-1';

describe('geometri süre tahmini ucu (3278; gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  let model = { revizyonId: 0, belgeId: 0, ozet: '' };

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = cerez): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object | undefined });
  const tamam = (r: LightMyRequestResponse): unknown => { assert.equal(r.statusCode, 200, r.body); return r.json(); };
  const yol = (sorgu = ''): string => `/geometri/sure-tahmini/${String(model.revizyonId)}${sorgu}`;
  const sure = async (sorgu = '', c = cerez): Promise<GeometriSureCevabi> => geometriSureCevabi.parse(tamam(await istek('GET', yol(sorgu), undefined, c)));

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  }

  before(async () => {
    ortam = await testVeritabaniKur('geometri_sure');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const secilen = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'malzemeler' || t.modul === 'kisiler');
    assert.equal((await ornekVeriYukle(ortam.vt, secilen, { ortam: 'test', bildir: () => undefined })).durum, 'yuklendi');
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerez = String(r.headers['set-cookie']).split(';')[0] ?? '';
    const mil = (await o().vt.tx((db) => ornekMalzemeNo(db, 'mil')))!;
    const icerik = Buffer.from('ISO-10303-21;\n/* kup.step */\nEND-ISO-10303-21;\n');
    const ozet = createHash('sha256').update(icerik).digest('hex');
    tamam(await istek('POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }));
    const c = tamam(await istek('POST', `/cizimler/malzemeler/${String(mil)}/belge-ekle`, { ad: 'Model kup', tur: '3b-model', ozet, dosyaAdi: 'kup.step' })) as
      { belgeler: { id: number; ad: string; surum: number; revizyonlar: { id: number }[] }[] };
    const b = c.belgeler.find((x) => x.ad === 'Model kup');
    assert.ok(b);
    model = { revizyonId: b.revizyonlar[0]?.id ?? 0, belgeId: b.id, ozet };
    tamam(await istek('POST', `/cizimler/${String(b.id)}/revizyonlar/${String(model.revizyonId)}/yayinla`, { surum: b.surum }));
  });

  after(async () => { await ortam?.kaldir(); });

  test('GEO-SU5 analiz yokken süre gelmez, neden söylenir; ISO verilmezse P ve kaynağı varsayılan', async () => {
    const r = await sure('?payMm=2');
    assert.deepEqual([r.neden, r.altDk, r.kalemler, r.iso, r.isoKaynagi, r.oneri, r.kalibre], ['analiz-yok', null, [], 'P', 'varsayilan', true, false]);
    // kablolama.ts bağı test koşusunda kurulur (araclar/kablolama-yukle.ts): gerçek rota okunur, örnek milin yürürlükte rotası yok.
    assert.equal(r.rota.durum, 'rota-yok');
  });

  test('GEO-SU6 stok yoksa ham kutu + paydır; talaş, kaba ve finiş aralığı; tanıma yoksa delik kalemi yok', async () => {
    // Sürecin yazacağı satır 40x20x10 kutunun ölçüleriyle konur.
    await o().sahip.sorgu(
      `INSERT INTO geometri_analiz (revizyon_id, belge_id, ozet, motor, kutu_x_mm, kutu_y_mm, kutu_z_mm, obb_a_mm, obb_b_mm, obb_c_mm, cap_mm, obb_yon,
         hacim_mm3, alan_mm2, govde_sayisi, kapali, ucgen_sayisi, hesap_suresi_ms)
       VALUES ($1, $2, $3, 'deneme', 40, 20, 10, 40, 20, 10, 22.3607, '{1,0,0,0,1,0,0,0,1}', 8000, 2800, 1, true, 12, 1)`,
      [model.revizyonId, model.belgeId, model.ozet],
    );
    const r = await sure('?payMm=2&kalite=YOK&iso=P');
    assert.deepEqual([r.neden, r.hamKaynagi, r.hamKodu, r.hamHacimMm3, r.parcaHacimMm3, r.isoKaynagi, r.ozellikOkundu],
      [null, 'kutu', null, 44 * 24 * 14, 8000, 'istek', false]);
    yakin(r.talasMm3 ?? 0, 6784);
    assert.deepEqual(r.kalemler.map((k) => k.kalem), ['kaba', 'finis']);
    yakin(r.altDk ?? 0, 6.784 / 184.6154 + 28 / 80);
    yakin(r.ustDk ?? 0, 6.784 / 55.3846 + 28 / 20);
    const n = await sure('?payMm=2&kalite=YOK&iso=N');
    assert.deepEqual([n.iso, n.isoKaynagi], ['N', 'istek']);
    assert.ok((n.altDk ?? Infinity) < (r.altDk ?? 0) && (n.ustDk ?? Infinity) < (r.ustDk ?? 0), 'alüminyum çelikten kısa sürer');
    const stoklu = await sure('?payMm=2');
    assert.equal(stoklu.hamKaynagi, 'stok', 'örnek veride sığan çubuk var');
    assert.ok(stoklu.hamKodu !== null && (stoklu.talasMm3 ?? 0) > 0);
  });

  test('GEO-SU7 tanınan delik kalemi gelir, adediyle; geçersiz ISO 400', async () => {
    await o().sahip.sorgu(`INSERT INTO geometri_yuz (revizyon_id, sira, tur, ters, alan_mm2, motor) VALUES ($1, 1, 'silindir', true, 188.5, 'deneme')`, [model.revizyonId]);
    await o().sahip.sorgu(
      `INSERT INTO geometri_ozellik (revizyon_id, sira, tur, cap_mm, derinlik_mm, gecis, yuzler, motor) VALUES ($1, 1, 'delik', 6, 10, true, '{1}', 'deneme')`,
      [model.revizyonId],
    );
    const r = await sure('?payMm=2&kalite=YOK');
    assert.equal(r.ozellikOkundu, true);
    assert.deepEqual(r.kalemler.map((k) => [k.kalem, k.adet]), [['kaba', null], ['finis', null], ['delik', 1]]);
    assert.equal((await istek('GET', yol('?iso=X'))).statusCode, 400);
  });

  test('GEO-SU8 ağ kapalı değilse (hacim yok) süre gelmez; ham yine söylenir', async () => {
    await o().sahip.sorgu('UPDATE geometri_analiz SET hacim_mm3 = NULL, kapali = false WHERE revizyon_id = $1', [model.revizyonId]);
    const r = await sure('?payMm=2&kalite=YOK');
    assert.deepEqual([r.neden, r.hamKaynagi, r.talasMm3, r.altDk], ['hacim-yok', 'kutu', null, null]);
    await o().sahip.sorgu('UPDATE geometri_analiz SET hacim_mm3 = 8000, kapali = true WHERE revizyon_id = $1', [model.revizyonId]);
  });

  test('GEO-SU10 parça hamdan büyükse (talaş yok) süre gelmez, sıfır uydurulmaz', async () => {
    await o().sahip.sorgu('UPDATE geometri_analiz SET hacim_mm3 = 20000 WHERE revizyon_id = $1', [model.revizyonId]);
    const r = await sure('?payMm=2&kalite=YOK');
    assert.deepEqual([r.neden, r.hamHacimMm3, r.parcaHacimMm3, r.talasMm3, r.kalemler, r.altDk, r.ortaDk, r.ustDk],
      ['talas-yok', 44 * 24 * 14, 20000, null, [], null, null, null]);
    await o().sahip.sorgu('UPDATE geometri_analiz SET hacim_mm3 = 8000 WHERE revizyon_id = $1', [model.revizyonId]);
  });

  test('GEO-SU12 rota karşılaştırması: bağ yoksa rota-bagli-degil, rota yoksa rota-yok; varsa talaşlı adımlar ve toplamlar; analiz olmasa da gelir', async () => {
    const onceki = talasliAdimCozucusu(null);
    try {
      assert.deepEqual((await sure('?payMm=2')).rota, { durum: 'rota-bagli-degil', adimlar: [], islemToplamDk: null, olcumToplamDk: null, eksik: false });
      let istenen: number | null = null;
      talasliAdimCozucusu(async (_db, malzemeNo) => { istenen = malzemeNo; return null; });
      assert.equal((await sure('?payMm=2')).rota.durum, 'rota-yok');
      assert.equal(istenen, await o().vt.tx((db) => ornekMalzemeNo(db, 'mil')), 'çözücü modelin malzemesiyle çağrılır');
      const adimlar = [
        { opNo: 10, ad: 'Tornalama', islemDk: 4.5, olcumOrtancaDk: 5, olcumAdedi: 5 },
        { opNo: 20, ad: 'Frezeleme', islemDk: null, olcumOrtancaDk: null, olcumAdedi: 0 },
      ];
      const ek = { makineId: null, makineKod: null, islemTuru: null, hammaddeNolari: [] };
      talasliAdimCozucusu(async () => adimlar.map((a) => ({ ...a, ...ek })));
      const r = await sure('?payMm=2&kalite=YOK');
      assert.deepEqual(r.rota, { durum: 'bagli', adimlar, islemToplamDk: 4.5, olcumToplamDk: 5, eksik: true });
      assert.equal(r.neden, null, 'rota tahmini değiştirmez');
      await o().sahip.sorgu('UPDATE geometri_analiz SET hacim_mm3 = NULL, kapali = false WHERE revizyon_id = $1', [model.revizyonId]);
      assert.deepEqual([(await sure('?payMm=2&kalite=YOK')).neden, (await sure('?payMm=2&kalite=YOK')).rota.durum], ['hacim-yok', 'bagli']);
      await o().sahip.sorgu('UPDATE geometri_analiz SET hacim_mm3 = 8000, kapali = true WHERE revizyon_id = $1', [model.revizyonId]);
    } finally {
      talasliAdimCozucusu(onceki);
    }
  });

  test('GEO-SU13 (3321-2) sınıftan ISO grubu ve Kienzle kc; elle başka grup seçilirse grubun ortalaması; tabloda olmayan sınıf varsayılan', async () => {
    const p = await sure('?payMm=2&kalite=YOK');
    assert.deepEqual([p.iso, p.isoKaynagi, p.sinif, p.sinifIso, p.kc.kaynak, p.kc.degerNmm2], ['P', 'varsayilan', null, null, 'iso', 1950]);
    const islah = await sure('?payMm=2&kalite=YOK&sinif=metal/islah');
    // kc = 1900 x 0,1^-0,24 = 3302 N/mm²: ısılah çeliği ortalama P'den (1950) yavaş.
    assert.deepEqual([islah.iso, islah.isoKaynagi, islah.sinif, islah.sinifIso, islah.kc], ['P', 'sinif', 'metal/islah', 'P',
      { degerNmm2: 3302, kc1: 1900, mc: 0.24, hmMm: 0.1, kaynak: 'kienzle' }]);
    assert.ok((islah.altDk ?? 0) > (p.altDk ?? Infinity), 'ıslah çeliği ortalama çelikten uzun sürer');
    const al = await sure('?payMm=2&kalite=YOK&sinif=metal/aluminyum');
    assert.deepEqual([al.iso, al.isoKaynagi, al.kc.degerNmm2], ['N', 'sinif', 1245]);
    const elle = await sure('?payMm=2&kalite=YOK&sinif=metal/islah&iso=M');
    assert.deepEqual([elle.iso, elle.isoKaynagi, elle.sinifIso, elle.kc.kaynak, elle.kc.degerNmm2], ['M', 'istek', 'P', 'iso', 1970]);
    const ayni = await sure('?payMm=2&kalite=YOK&sinif=metal/islah&iso=P');
    assert.deepEqual([ayni.isoKaynagi, ayni.kc.kaynak], ['istek', 'kienzle'], 'elle seçilen grup sınıfınkiyle aynıysa Kienzle kalır');
    const bilinmez = await sure('?payMm=2&kalite=YOK&sinif=kompozit/karbon');
    assert.deepEqual([bilinmez.iso, bilinmez.isoKaynagi, bilinmez.sinif, bilinmez.kc.kaynak], ['P', 'varsayilan', null, 'iso']);
    const mg = await sure('?payMm=2&kalite=YOK&sinif=metal/magnezyum');
    assert.deepEqual([mg.iso, mg.isoKaynagi, mg.kc.kaynak], ['N', 'sinif', 'iso'], 'katsayısı bilinmeyen sınıfta grup gelir, kc grubun');
    assert.equal((await istek('GET', yol('?sinif=metal'))).statusCode, 400);
  });

  test('GEO-SU14 (3321-2) tezgâh gücü ilk talaşlı adımın makinesinin demirbaş kartından; yoksa 7,5 kW; ham seçilen formdan', async () => {
    const onceki = talasliAdimCozucusu(null);
    try {
      const yok = await sure('?payMm=2&kalite=YOK');
      assert.deepEqual(yok.tezgah, { gucKw: 7.5, kaynak: 'varsayilan', makineKod: null });
      const makineId = (await o().sahip.tek<{ id: number }>(`INSERT INTO makine (kod, ad) VALUES ('ORN-CNC-02', 'Örnek tezgâh') RETURNING id`))!.id;
      const adim = { opNo: 10, ad: 'Frezeleme', islemDk: 4, olcumOrtancaDk: null, olcumAdedi: 0, makineId, makineKod: 'ORN-CNC-02', islemTuru: null, hammaddeNolari: [] };
      talasliAdimCozucusu(async () => [adim]);
      const gucsuz = await sure('?payMm=2&kalite=YOK');
      assert.deepEqual(gucsuz.tezgah, { gucKw: 7.5, kaynak: 'varsayilan', makineKod: 'ORN-CNC-02' }, 'demirbaş kartı yoksa varsayılan, makine yazılır');
      const kimlik = (await o().sahip.tek<{ kimlik: string }>('SELECT kimlik FROM malzeme_katalog_karti ORDER BY no LIMIT 1'))!.kimlik;
      await o().sahip.sorgu('INSERT INTO malzemeler_demirbas_teknik (kart_kimlik, makine_id, is_mili_gucu_kw, guncelleyen_kisi_id) VALUES ($1, $2, 15, $3)', [kimlik, makineId, yoneticiId]);
      const r = await sure('?payMm=2&kalite=YOK');
      assert.deepEqual(r.tezgah, { gucKw: 15, kaynak: 'demirbas', makineKod: 'ORN-CNC-02' });
      assert.ok((r.kalemler[0]?.altDk ?? Infinity) < (yok.kalemler[0]?.altDk ?? 0), 'güçlü tezgâhta kaba kısa');
      await o().sahip.sorgu('DELETE FROM malzemeler_demirbas_teknik WHERE makine_id = $1', [makineId]);
      // Ham: form verilirse o formdaki öneri, yoksa ilk öneri.
      const ilk = await sure('?payMm=2');
      assert.equal(ilk.hamKaynagi, 'stok');
      const ham = tamam(await istek('GET', `/geometri/ham-onerisi/${String(model.revizyonId)}?payMm=2`)) as GeometriHamCevabi;
      assert.equal(ilk.hamFormu, ham.oneriler[0]?.form ?? null);
      // İkinci formda öneri olsun diye başka bir hammadde kartı geçici olarak sığan bir bloğa çevrilir (sonra geri yazılır).
      const ilkForm = ham.oneriler[0]?.form;
      assert.ok(ilkForm !== undefined && ilkForm !== 'blok');
      const kart = (await o().sahip.tek<{ no: number; kayit: unknown }>(
        `SELECT no, kayit FROM malzeme_katalog_karti WHERE onay_durumu = 'aktif' AND tur = 'hammadde' AND no <> $1 ORDER BY no LIMIT 1`, [ham.oneriler[0]!.malzemeNo]))!;
      await o().sahip.sorgu(`UPDATE malzeme_katalog_karti SET kayit = kayit || '{"form":"blok","dims":{"a":60,"b":40,"h":30}}' WHERE no = $1`, [kart.no]);
      try {
        const ham2 = tamam(await istek('GET', `/geometri/ham-onerisi/${String(model.revizyonId)}?payMm=2`)) as GeometriHamCevabi;
        const blok = ham2.oneriler.find((x) => x.form === 'blok');
        assert.ok(blok, 'blok önerisi gelir');
        assert.equal((await sure('?payMm=2')).hamFormu, ham2.oneriler[0]?.form, 'form verilmezse ilk öneri');
        const s2 = await sure('?payMm=2&form=blok');
        assert.deepEqual([s2.hamFormu, s2.hamKodu, s2.hamHacimMm3], ['blok', blok.kod, blok.hamHacimMm3], 'tahmin istenen formun hamından');
        assert.notEqual(s2.talasMm3, ilk.talasMm3, 'form değişince talaş ve süre değişir');
      } finally {
        await o().sahip.sorgu('UPDATE malzeme_katalog_karti SET kayit = $2 WHERE no = $1', [kart.no, kart.kayit]);
      }
    } finally {
      talasliAdimCozucusu(onceki);
    }
  });

  test('GEO-SU16 (3321-2) Ham kartının varsayılan malzemesi rotadaki ilk talaşlı adımın aktif hammadde girdisinden; mamul girdi sayılmaz', async () => {
    const onceki = talasliAdimCozucusu(null);
    const ham = async (): Promise<GeometriHamCevabi> => tamam(await istek('GET', `/geometri/ham-onerisi/${String(model.revizyonId)}?payMm=2`)) as GeometriHamCevabi;
    try {
      assert.equal((await ham()).rotaMalzemesi, null, 'rota bağı yoksa null');
      const [mil, cubuk] = await o().vt.tx(async (db) => [(await ornekMalzemeNo(db, 'mil'))!, (await ornekMalzemeNo(db, 'cubuk'))!]);
      const adim = (opNo: number, hammaddeNolari: number[]) => ({ opNo, ad: `OP ${String(opNo)}`, islemDk: 1, olcumOrtancaDk: null, olcumAdedi: 0, makineId: null, makineKod: null, islemTuru: null, hammaddeNolari });
      talasliAdimCozucusu(async () => [adim(10, [mil]), adim(20, [mil, cubuk])]);
      const r = (await ham()).rotaMalzemesi;
      assert.deepEqual(r && [r.malzemeNo, r.kalite, r.aile, r.kaliteKodu, r.sinif, r.opNo], [cubuk, 'C45', 'metal', 'C45', null, 20],
        'sınıfı yazılmamış kartta sinif null (ekran kalite tablosundan bulur)');
      await o().sahip.sorgu(`UPDATE malzeme_katalog_karti SET kayit = kayit || '{"cls":"islah"}' WHERE no = $1`, [cubuk]);
      assert.equal((await ham()).rotaMalzemesi?.sinif, 'metal/islah');
      talasliAdimCozucusu(async () => [adim(10, [mil])]);
      assert.equal((await ham()).rotaMalzemesi, null, 'hammadde girdisi yoksa null');
    } finally {
      talasliAdimCozucusu(onceki);
    }
  });

  test('GEO-SU9 yetki: geometri.oku olan görür; işlemsiz 403, oturumsuz 401', async () => {
    const okur = await islemliKisi('sureokur', ['sayfa.geometri', 'geometri.oku']);
    assert.equal((await sure('?payMm=2', okur)).neden, null);
    const sayfaci = await islemliKisi('surepasif', ['sayfa.geometri']);
    assert.equal((await istek('GET', yol(), undefined, sayfaci)).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: `/api${yol()}` })).statusCode, 401);
  });
});
