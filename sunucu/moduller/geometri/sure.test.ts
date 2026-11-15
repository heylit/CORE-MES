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
import type { GeometriSureCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { talasliAdimCozucusu } from './disari.ts';
import { delikDk, kabaHiziCm3Dk, rotaToplamlari, sureTahmini } from './kurallar.ts';

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
      talasliAdimCozucusu(async () => adimlar);
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

  test('GEO-SU9 yetki: geometri.oku olan görür; işlemsiz 403, oturumsuz 401', async () => {
    const okur = await islemliKisi('sureokur', ['sayfa.geometri', 'geometri.oku']);
    assert.equal((await sure('?payMm=2', okur)).neden, null);
    const sayfaci = await islemliKisi('surepasif', ['sayfa.geometri']);
    assert.equal((await istek('GET', yol(), undefined, sayfaci)).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: `/api${yol()}` })).statusCode, 401);
  });
});
