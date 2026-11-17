import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { geometriKalibrasyonCevabi, geometriSureCevabi } from '#paylasilan/sozlesme/geometri.ts';
import type { GeometriKalibrasyonCevabi, GeometriSureCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { talasliAdimCozucusu } from './disari.ts';
import type { TalasliRotaAdimi } from './servis.ts';
import { kalibrasyonOnbellegiSifirla, kalibrasyonOnbellegiTemizle } from './servis.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';

// Süre kalibrasyonu ucu (3321-3): altı örnek malzemeye aynı küp modeli bağlanır (aynı geometri, aynı başlangıç tahmini T (3363)); ölçümler
// rota çözücüsünden T'nin katları olarak verilir. Gerçek PostgreSQL, gerçek giriş.
const yakin = (x: number | null | undefined, beklenen: number, m = ''): void =>
  assert.ok(x != null && Math.abs(x - beklenen) <= Math.abs(beklenen) * 1e-3, `${m} ${String(x)} != ${String(beklenen)}`);

describe('geometri süre kalibrasyonu ucu (3321-3; gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  const parcalar: { malzemeNo: number; revizyonId: number }[] = [];

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = cerez): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object | undefined });
  const tamam = (r: LightMyRequestResponse): unknown => { assert.equal(r.statusCode, 200, r.body); return r.json(); };
  const kalibrasyon = async (): Promise<GeometriKalibrasyonCevabi> => { kalibrasyonOnbellegiTemizle(); return geometriKalibrasyonCevabi.parse(tamam(await istek('GET', '/geometri/kalibrasyon'))); };
  const sure = async (revizyonId: number, sorgu = ''): Promise<GeometriSureCevabi> => {
    kalibrasyonOnbellegiTemizle();
    return geometriSureCevabi.parse(tamam(await istek('GET', `/geometri/sure-tahmini/${String(revizyonId)}${sorgu}`)));
  };
  const adim = (olcumOrtancaDk: number | null, makineKod: string | null = null, opNo = 10, hammaddeNolari: number[] = []): TalasliRotaAdimi => ({
    opNo, ad: 'Frezeleme', islemDk: 1, olcumOrtancaDk, olcumAdedi: olcumOrtancaDk === null ? 0 : 5, makineId: null, makineKod, islemTuru: 'Frezeleme', hammaddeNolari,
  });
  const hamGet = async (): Promise<GeometriKalibrasyonCevabi> => geometriKalibrasyonCevabi.parse(tamam(await istek('GET', '/geometri/kalibrasyon')));

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
    ortam = await testVeritabaniKur('geometri_kalibrasyon');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const secilen = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'malzemeler' || t.modul === 'kisiler');
    assert.equal((await ornekVeriYukle(ortam.vt, secilen, { ortam: 'test', bildir: () => undefined })).durum, 'yuklendi');
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerez = String(r.headers['set-cookie']).split(';')[0] ?? '';
    const icerik = Buffer.from('ISO-10303-21;\n/* kup.step */\nEND-ISO-10303-21;\n');
    const ozet = createHash('sha256').update(icerik).digest('hex');
    tamam(await istek('POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }));
    const nolar = (await o().sahip.sorgu<{ no: number }>('SELECT no FROM malzeme_katalog_karti ORDER BY no LIMIT 6')).map((x) => x.no);
    assert.equal(nolar.length, 6, 'örnek veride en az altı kart');
    for (const malzemeNo of nolar) {
      const c = tamam(await istek('POST', `/cizimler/malzemeler/${String(malzemeNo)}/belge-ekle`, { ad: 'Model kup', tur: '3b-model', ozet, dosyaAdi: 'kup.step' })) as
        { belgeler: { id: number; ad: string; surum: number; revizyonlar: { id: number }[] }[] };
      const b = c.belgeler.find((x) => x.ad === 'Model kup');
      assert.ok(b);
      const revizyonId = b.revizyonlar[0]?.id ?? 0;
      tamam(await istek('POST', `/cizimler/${String(b.id)}/revizyonlar/${String(revizyonId)}/yayinla`, { surum: b.surum }));
      await o().sahip.sorgu(
        `INSERT INTO geometri_analiz (revizyon_id, belge_id, ozet, motor, kutu_x_mm, kutu_y_mm, kutu_z_mm, obb_a_mm, obb_b_mm, obb_c_mm, cap_mm, obb_yon,
           hacim_mm3, alan_mm2, govde_sayisi, kapali, ucgen_sayisi, hesap_suresi_ms)
         VALUES ($1, $2, $3, 'deneme', 40, 20, 10, 40, 20, 10, 22.3607, '{1,0,0,0,1,0,0,0,1}', 8000, 2800, 1, true, 12, 1)`,
        [revizyonId, b.id, ozet],
      );
      parcalar.push({ malzemeNo, revizyonId });
    }
  });

  after(async () => { talasliAdimCozucusu(null); await ortam?.kaldir(); });

  test('GEO-KU1 ölçümü eksik parça sayılır, kalibrasyona girmez; 5 parçadan az kalibresiz, süre kalibresiz kalır', async () => {
    const onceki = talasliAdimCozucusu(async () => [adim(null)]);
    try {
      const k = await kalibrasyon();
      assert.deepEqual([k.asama, k.n, k.olcumuEksik, k.carpan, k.parcalar], ['kalibresiz', 0, 6, null, []]);
      assert.deepEqual(k.esikler, { tek: 5, grup: 20, regresyon: 40 });
      const s = await sure(parcalar[0]!.revizyonId);
      assert.deepEqual([s.kalibre, s.kalibrasyon], [false, null]);
    } finally {
      talasliAdimCozucusu(onceki);
    }
  });

  test('GEO-KU2 altı ölçülü parçada tek çarpan (ortanca oran); süre kalibre, aralık en küçük ve en büyük artıktan (geniş)', async () => {
    const onceki = talasliAdimCozucusu(null);
    try {
      talasliAdimCozucusu(async () => [adim(null)]);
      const t = (await sure(parcalar[0]!.revizyonId)).onsel!.ortaDk;
      assert.ok(t > 0);
      const oranlar = [1.8, 1.9, 2, 2, 2.2, 2.5];
      const olcum = new Map(parcalar.map((p, i) => [p.malzemeNo, t * oranlar[i]!]));
      // Ölçüm parçanın bütün talaşlı adımlarının toplamıdır: iki adım %40 ve %60.
      talasliAdimCozucusu(async (_db, malzemeNo) => {
        const o = olcum.get(malzemeNo) ?? null;
        return [adim(o === null ? null : o * 0.4, 'ORN-CNC-01', 10), adim(o === null ? null : o * 0.6, 'ORN-CNC-02', 20)];
      });
      const k = await kalibrasyon();
      for (const [i, p] of parcalar.entries()) yakin(k.parcalar.find((x) => x.malzemeNo === p.malzemeNo)?.olcumDk, t * oranlar[i]!, 'ölçüm adımların toplamı');
      assert.deepEqual([k.asama, k.n, k.olcumuEksik, k.disarida, k.gruplar, k.regresyon], ['tek', 6, 0, 0, [], null]);
      yakin(k.carpan, 2, 'çarpan');
      assert.equal(k.parcalar.length, 6);
      assert.deepEqual(k.parcalar[0]!.gruplar, { malzeme: null, tezgah: 'ORN-CNC-01', islem: 'Frezeleme', geometri: 'prizmatik' }, 'sınıfsız parçada malzeme grubu bilinmez; küp prizmatik');
      yakin(k.parcalar[0]!.kalibreDk, 2 * t, 'parçanın kalibre süresi');
      const s = await sure(parcalar[0]!.revizyonId);
      assert.equal(s.kalibre, true);
      assert.ok(s.kalibrasyon !== null);
      assert.deepEqual([s.kalibrasyon.asama, s.kalibrasyon.n, s.kalibrasyon.genis, s.kalibrasyon.regresyon], ['tek', 6, true, false]);
      yakin(s.kalibrasyon.ortaDk, 2 * t, 'orta');
      yakin(s.kalibrasyon.altDk, 1.8 * t, 'alt');
      yakin(s.kalibrasyon.ustDk, 2.5 * t, 'üst');
      yakin(s.onsel?.ortaDk, t, 'başlangıç tahmini değişmez');
    } finally {
      talasliAdimCozucusu(onceki);
    }
  });

  test('GEO-KU3 dışarıda bırakılan parça kalibrasyona girmez, listede işaretli kalır; geri al geri katar; yetki geometri.kalibrasyon', async () => {
    const onceki = talasliAdimCozucusu(null);
    try {
      talasliAdimCozucusu(async () => [adim(null)]);
      const t = (await sure(parcalar[0]!.revizyonId)).onsel!.ortaDk;
      const oranlar = [1.8, 1.9, 2, 2, 2.2, 5];
      const olcum = new Map(parcalar.map((p, i) => [p.malzemeNo, t * oranlar[i]!]));
      talasliAdimCozucusu(async (_db, malzemeNo) => [adim(olcum.get(malzemeNo) ?? null)]);
      const aykiri = parcalar[5]!.malzemeNo;
      const okur = await islemliKisi('kalokur', ['sayfa.geometri', 'geometri.oku']);
      assert.equal((await istek('POST', `/geometri/kalibrasyon/${String(aykiri)}/disarida-birak`, { neden: null }, okur)).statusCode, 403);
      const muhendis = await islemliKisi('kalmuh', ['sayfa.geometri', 'geometri.oku', 'geometri.kalibrasyon']);
      const k = geometriKalibrasyonCevabi.parse(tamam(await istek('POST', `/geometri/kalibrasyon/${String(aykiri)}/disarida-birak`, { neden: 'Ölçüm aykırı' }, muhendis)));
      assert.deepEqual([k.n, k.disarida], [5, 1]);
      const p = k.parcalar.find((x) => x.malzemeNo === aykiri);
      assert.deepEqual(p && [p.disarida, p.disaridaNedeni], [true, 'Ölçüm aykırı']);
      const satir = await o().sahip.tek<{ neden: string; kisi: string }>(
        'SELECT d.neden, k.ad AS kisi FROM geometri_kalibrasyon_disarida d JOIN kisi k ON k.id = d.kisi_id WHERE d.malzeme_no = $1', [aykiri]);
      assert.deepEqual(satir, { neden: 'Ölçüm aykırı', kisi: 'Deneme kalmuh' });
      const ikinci = geometriKalibrasyonCevabi.parse(tamam(await istek('POST', `/geometri/kalibrasyon/${String(aykiri)}/disarida-birak`, { neden: '' })));
      assert.equal(ikinci.parcalar.find((x) => x.malzemeNo === aykiri)?.disaridaNedeni, null, 'tekrar bırakmak nedeni günceller; boş neden null');
      assert.equal((await istek('POST', '/geometri/kalibrasyon/999999/disarida-birak', { neden: null })).statusCode, 404);
      assert.equal((await istek('POST', `/geometri/kalibrasyon/${String(aykiri)}/disarida-birak`, { neden: 'x'.repeat(201) })).statusCode, 400);
      const geri = geometriKalibrasyonCevabi.parse(tamam(await istek('POST', `/geometri/kalibrasyon/${String(aykiri)}/geri-al`, undefined, muhendis)));
      assert.deepEqual([geri.n, geri.disarida], [6, 0]);
      assert.equal((await istek('POST', `/geometri/kalibrasyon/${String(aykiri)}/geri-al`, undefined, okur)).statusCode, 403);
      assert.equal((await app.inject({ method: 'GET', url: '/api/geometri/kalibrasyon' })).statusCode, 401);
    } finally {
      talasliAdimCozucusu(onceki);
    }
  });

  test('GEO-KU4 dışarıda bırak ve geri al önbelleği temizler: hemen sonraki okuma yeni sonucu döner', async () => {
    const onceki = talasliAdimCozucusu(null);
    try {
      talasliAdimCozucusu(async () => [adim(null)]);
      const t = (await sure(parcalar[0]!.revizyonId)).onsel!.ortaDk;
      const olcum = new Map(parcalar.map((p, i) => [p.malzemeNo, t * (1.5 + i / 10)]));
      talasliAdimCozucusu(async (_db, malzemeNo) => [adim(olcum.get(malzemeNo) ?? null)]);
      kalibrasyonOnbellegiSifirla();
      assert.equal((await hamGet()).n, 6);
      assert.equal((await hamGet()).n, 6, 'ikinci okuma önbellekten');
      const no = parcalar[2]!.malzemeNo;
      tamam(await istek('POST', `/geometri/kalibrasyon/${String(no)}/disarida-birak`, { neden: null }));
      assert.deepEqual([(await hamGet()).n, (await hamGet()).disarida], [5, 1], 'bırakmadan sonra eski önbellek dönmez');
      kalibrasyonOnbellegiSifirla();
      assert.equal((await hamGet()).n, 5);
      tamam(await istek('POST', `/geometri/kalibrasyon/${String(no)}/geri-al`));
      assert.equal((await hamGet()).n, 6, 'geri almadan sonra eski önbellek dönmez');
    } finally {
      talasliAdimCozucusu(onceki);
    }
  });

  test('GEO-KU5 kalibresiz tahmin rotadaki hammaddenin kalitesi ve sınıfıyla (ekranın varsayılan malzemesi)', async () => {
    const onceki = talasliAdimCozucusu(null);
    try {
      const cubuk = (await o().vt.tx((db) => ornekMalzemeNo(db, 'cubuk')))!;
      await o().sahip.sorgu(`UPDATE malzeme_katalog_karti SET kayit = kayit || '{"cls":"islah"}' WHERE no = $1`, [cubuk]);
      talasliAdimCozucusu(async () => [adim(null)]);
      const rev = parcalar[0]!.revizyonId;
      const duz = (await sure(rev)).onsel!.ortaDk;
      const malzemeli = (await sure(rev, '?kalite=C45&sinif=metal%2Fislah')).onsel!.ortaDk;
      assert.notEqual(malzemeli, duz, 'malzeme tahmini değiştirir');
      talasliAdimCozucusu(async () => [adim(10, null, 10, [cubuk])]);
      const k = await kalibrasyon();
      for (const p of k.parcalar) yakin(p.tahminDk, malzemeli, 'tahmin rotadaki hammaddeyle');
      assert.ok(k.parcalar.every((p) => p.gruplar.malzeme === 'P'), 'malzeme grubu sınıfın ISO grubu');
    } finally {
      talasliAdimCozucusu(onceki);
    }
  });
});

const PAROLA = 'Deneme-Parola-12345';
