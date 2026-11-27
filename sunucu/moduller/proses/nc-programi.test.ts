import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { prosesParcaCevabi, type NcProgramEkleGovdesi, type ProsesParcaCevabi } from '#paylasilan/sozlesme/proses.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// 3800 dilim 1: NC/CAM program kaydı, takım listesi, aparat ve teknik resim revizyonu kapsamı. Yazma yalnız proses.nc-yaz ile.
describe('proses: NC/CAM programı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let parca = 0;
  let makine = 0;
  let takim = 0;
  let aparat = 0;
  let belgeId = 0;
  const cerez: Record<string, string> = {};

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerez[kim] ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function tamam<T>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<T> {
    const c = await istek<T>(kim, yontem, yol, govde);
    assert.equal(c.durum, 200, `${yontem} ${yol}: ${JSON.stringify(c.govde)}`);
    return c.govde;
  }
  async function giris(ad: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez[ad] = String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function kisi(ad: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    await o().vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol!.id);
      for (const r of k.roller) if (r.id !== rol!.id) await rolAl(db, yoneticiId, id, r.id);
    });
    await giris(ad);
  }
  async function kart(kimlik: string, tur: string, sira: number): Promise<number> {
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'ORN-NC-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [kimlik, tur, sira, JSON.stringify({ id: kimlik, com: { ad: `ORN ${kimlik}` } }), yoneticiId],
    ))!.no;
  }
  async function revizyonYayinla(sira: number, antet: string, zaman: string): Promise<void> {
    const ozet = randomUUID().replaceAll('-', '').padEnd(64, '0');
    await o().sahip.sorgu('INSERT INTO dosya (ozet, boyut, tur, ilk_yukleyen_id) VALUES ($1, 1, $2, $3)', [ozet, 'pdf', yoneticiId]);
    const rev = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO belge_merkezi_revizyon (belge_id, sira, ozet, dosya_turu, "not", antet_rev, yukleyen_id) VALUES ($1, $2, $3, 'pdf', NULL, $4, $5) RETURNING id`,
      [belgeId, sira, ozet, antet, yoneticiId]))!.id;
    await o().sahip.sorgu('INSERT INTO belge_merkezi_onizleme (revizyon_id, kare, ozet, kisi_id) VALUES ($1, 0, $2, $3)', [rev, ozet, yoneticiId]);
    await o().sahip.sorgu("UPDATE belge_merkezi_revizyon SET durum = 'eski' WHERE belge_id = $1 AND durum = 'yayinda'", [belgeId]);
    await o().sahip.sorgu("UPDATE belge_merkezi_revizyon SET durum = 'yayinda', yayinlayan_id = $2, yayinlandi = $3::timestamptz WHERE id = $1", [rev, yoneticiId, zaman]);
  }
  const oku = async (kim: string, rev?: string): Promise<ProsesParcaCevabi> =>
    prosesParcaCevabi.parse(await tamam(kim, 'GET', `/proses/parca?malzemeNo=${String(parca)}${rev === undefined ? '' : `&rev=${rev}`}`));
  const program = (ek: Partial<NcProgramEkleGovdesi> = {}): NcProgramEkleGovdesi => ({
    malzemeNo: parca, opNo: 10, revizyonKodu: null, ad: 'ORN1042_OP10.H', kontrol: 'heidenhain', makineId: makine, camYazilimi: 'ORN-CAM',
    camDosyasi: 'ORN-1042.cam', sifirNoktasi: 'Preset 1 üst yüzey', cevrimSuresiDk: 14.2, durum: 'onayli', aciklama: null,
    takimlar: [{ tNo: '4', malzemeId: takim, tutucu: 'ORN-TUT-SK40', cikintiMm: 32, islem: 'Finiş' }],
    aparatlar: [{ malzemeId: aparat, aciklama: 'Dişli çene' }],
    ...ek,
  });

  before(async () => {
    ortam = await testVeritabaniKur('proses_nc');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    await kisi('mudur', 'uretim_muduru');
    await kisi('proses', 'proses_muhendisi');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-NC-', 0) ON CONFLICT (onek) DO NOTHING");
    parca = await kart('nc-parca', 'mamul', 1);
    takim = await kart('nc-takim', 'sarf', 2);
    aparat = await kart('nc-aparat', 'demirbas', 3);
    const tip = (await tamam<{ operasyonTipleri: { id: number }[] }>('yonetici', 'GET', '/rota/secenekler')).operasyonTipleri[0]!.id;
    const merkez = await tamam<{ id: number }>('yonetici', 'POST', '/is-merkezleri', { kod: 'NC-IM', ad: 'Deneme merkez', aciklama: null });
    const istasyon = (await tamam<{ id: number }>('yonetici', 'POST', '/istasyonlar', { kod: 'NC-I', ad: 'Deneme istasyon', isMerkeziId: merkez.id })).id;
    makine = (await tamam<{ id: number }>('yonetici', 'POST', '/makineler', { kod: 'ORN-5X-01', ad: 'Deneme 5 eksen', istasyonId: istasyon })).id;
    const adim = {
      opNo: null, operasyonTipiId: tip, ad: 'Freze', kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 30, birimSureDk: 2, bagimlilik: 'bekleyen', devirAdedi: null,
      firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true, adaylar: [], bilesenler: [], yanUrunler: [],
    };
    const { id } = await tamam<{ id: number }>('yonetici', 'POST', `/rota/urunler/${String(parca)}/taslak-ac`, { kaynak: { tur: 'bos' } });
    await tamam('yonetici', 'POST', `/rota/revizyonlar/${String(id)}/kaydet`, { surum: 1, aciklama: null, adimlar: [adim] });
    belgeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO belge_merkezi_belge (ad, tur, olusturan_id) VALUES ('ORN-RES-1042', 'teknik-resim', $1) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO belge_merkezi_bag (belge_id, hedef_modul, hedef_id, ekleyen_id) VALUES ($1, 'malzemeler', $2, $3)", [belgeId, parca, yoneticiId]);
    await revizyonYayinla(1, 'B', '2026-10-02T08:00:00Z');
    await revizyonYayinla(2, 'C', '2026-11-20T08:00:00Z');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yetki: proses mühendisi okur ama yazamaz (403); üretim müdürü yazar; program halkaları ve kartlarıyla okunur', async () => {
    const red = await istek('proses', 'POST', '/proses/nc-programlari/ekle', program());
    assert.equal(red.durum, 403, JSON.stringify(red.govde));
    const bos = await oku('proses');
    assert.deepEqual([bos.revizyonlar.map((r) => [r.kod, r.durum]), bos.seciliRevizyon, bos.ncProgramlari], [[['C', 'yayinda'], ['B', 'eski']], 'C', []]);
    assert.equal(bos.halkalar.find((h) => h.anahtar === 'nc')?.durum, 'yok');

    const e = await tamam<{ id: number; surum: number }>('mudur', 'POST', '/proses/nc-programlari/ekle', program());
    const d = await oku('proses');
    assert.equal(d.ncProgramlari.length, 1);
    const p = d.ncProgramlari[0]!;
    assert.deepEqual([p.id, p.revizyonKodu, p.makine?.kod, p.cevrimSuresiDk, p.genelYerine], [e.id, null, 'ORN-5X-01', '14.20', false]);
    assert.deepEqual(p.takimlar.map((t) => [t.tNo, t.kart.id, t.cikintiMm]), [['T4', takim, '32.00']]);
    assert.deepEqual(p.aparatlar.map((a) => [a.kart.id, a.aciklama]), [[aparat, 'Dişli çene']]);
    assert.deepEqual(Object.fromEntries(d.halkalar.filter((h) => ['nc', 'takim', 'baglama'].includes(h.anahtar)).map((h) => [h.anahtar, h.durum])),
      { nc: 'tamam', takim: 'tamam', baglama: 'tamam' });
  });

  test('revizyon kapsamı: Rev B özel programı Rev B\'de genelin yerine geçer, Rev C\'de görünmez; bilinmeyen revizyon 400', async () => {
    const yanlis = await istek('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ revizyonKodu: 'Z' }));
    assert.equal(yanlis.durum, 400, JSON.stringify(yanlis.govde));
    await tamam('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ revizyonKodu: 'b', ad: '1042B_OP10.H', durum: 'taslak', takimlar: [], aparatlar: [] }));
    const b = await oku('yonetici', 'B');
    assert.deepEqual(b.ncProgramlari.map((p) => [p.ad, p.revizyonKodu]), [['1042B_OP10.H', 'B']], 'kod parçanın revizyon yazımıyla kaydedilir');
    assert.deepEqual(Object.fromEntries(b.halkalar.filter((h) => ['nc', 'takim', 'baglama'].includes(h.anahtar)).map((h) => [h.anahtar, h.durum])),
      { nc: 'eksik', takim: 'eksik', baglama: 'eksik' });
    const c = await oku('yonetici', 'C');
    assert.deepEqual(c.ncProgramlari.map((p) => [p.ad, p.genelYerine]), [['ORN1042_OP10.H', true]]);
  });

  test('kaydetme sürümle: eski sürüm 409; takım listesi yeniden yazılır; eski yapılan program halkayı boşaltır', async () => {
    const id = (await oku('yonetici', 'C')).ncProgramlari[0]!.id;
    const g = { ...program({ takimlar: [{ tNo: 'T1', malzemeId: takim, tutucu: null, cikintiMm: null, islem: 'Kaba' }, { tNo: 'T7', malzemeId: takim, tutucu: null, cikintiMm: 40, islem: null }] }) };
    const { malzemeNo: _m, opNo: _o, ...govde } = g;
    const k = await tamam<{ surum: number }>('mudur', 'POST', `/proses/nc-programlari/${String(id)}/kaydet`, { ...govde, surum: 1 });
    assert.equal(k.surum, 2);
    const eski = await istek('mudur', 'POST', `/proses/nc-programlari/${String(id)}/kaydet`, { ...govde, surum: 1 });
    assert.equal(eski.durum, 409, JSON.stringify(eski.govde));
    assert.deepEqual((await oku('yonetici', 'C')).ncProgramlari[0]!.takimlar.map((t) => t.tNo), ['T1', 'T7']);
    await tamam('mudur', 'POST', `/proses/nc-programlari/${String(id)}/kaydet`, { ...govde, durum: 'eski', surum: 2 });
    const c = await oku('yonetici', 'C');
    assert.deepEqual([c.ncProgramlari.map((p) => p.durum), c.halkalar.find((h) => h.anahtar === 'nc')?.durum], [['eski'], 'yok']);
  });

  test('kurallar veritabanında: aynı ad 409, aynı T no 409, olmayan operasyon 409, aparat demirbaş değilse 400', async () => {
    await tamam('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ ad: 'ORN-AYNI.H' }));
    const ayni = await istek('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ ad: 'orn-ayni.h' }));
    assert.equal(ayni.durum, 409, JSON.stringify(ayni.govde));
    const t = await istek('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ ad: 'ORN-T.H', takimlar: [
      { tNo: 'T1', malzemeId: takim, tutucu: null, cikintiMm: null, islem: null }, { tNo: '1', malzemeId: takim, tutucu: null, cikintiMm: null, islem: null }] }));
    assert.equal(t.durum, 409, JSON.stringify(t.govde));
    const op = await istek('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ ad: 'ORN-OP.H', opNo: 990 }));
    assert.equal(op.durum, 409, JSON.stringify(op.govde));
    const ap = await istek('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ ad: 'ORN-AP.H', aparatlar: [{ malzemeId: takim, aciklama: null }] }));
    assert.equal(ap.durum, 400, JSON.stringify(ap.govde));
    const yok = await istek('yonetici', 'POST', '/proses/nc-programlari/999999/kaydet', { ...program(), surum: 1 });
    assert.equal(yok.durum, 404, JSON.stringify(yok.govde));
    const mamul = await istek('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ ad: 'ORN-MAMUL.H', takimlar: [{ tNo: 'T2', malzemeId: parca, tutucu: null, cikintiMm: null, islem: null }] }));
    assert.equal(mamul.durum, 400, `mamul kartı takım olamaz: ${JSON.stringify(mamul.govde)}`);
    const tezgah = await istek('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ ad: 'ORN-TZ.H', makineId: 999999 }));
    assert.equal(tezgah.durum, 400, JSON.stringify(tezgah.govde));
    const parcaYok = await istek('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ ad: 'ORN-PY.H', malzemeNo: 999999 }));
    assert.equal(parcaYok.durum, 404, JSON.stringify(parcaYok.govde));
  });

  test('eski programı canlandırma: aynı adlı geçerli program varsa 409', async () => {
    const e = await tamam<{ id: number }>('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ ad: 'ORN-CAN.H', durum: 'eski' }));
    await tamam('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ ad: 'ORN-CAN.H' }));
    const { malzemeNo: _m, opNo: _o, ...govde } = program({ ad: 'ORN-CAN.H', durum: 'taslak' });
    const can = await istek('yonetici', 'POST', `/proses/nc-programlari/${String(e.id)}/kaydet`, { ...govde, surum: 1 });
    assert.equal(can.durum, 409, JSON.stringify(can.govde));
  });

  test('teknik resimden kalkan revizyonun programı revizyonu değişmeden kaydedilir ve eski yapılır; başka revizyona taşınamaz', async () => {
    const { id } = await tamam<{ id: number }>('yonetici', 'POST', '/proses/nc-programlari/ekle', program({ revizyonKodu: 'B', ad: 'ORN-KALKAN.H' }));
    await o().sahip.sorgu("UPDATE belge_merkezi_revizyon SET antet_rev = 'B1' WHERE belge_id = $1 AND antet_rev = 'B'", [belgeId]);
    const { malzemeNo: _m, opNo: _o, ...govde } = program({ revizyonKodu: 'B', ad: 'ORN-KALKAN.H', durum: 'eski' });
    await tamam('yonetici', 'POST', `/proses/nc-programlari/${String(id)}/kaydet`, { ...govde, surum: 1 });
    const tasi = await istek('yonetici', 'POST', `/proses/nc-programlari/${String(id)}/kaydet`, { ...govde, revizyonKodu: 'Z', surum: 2 });
    assert.equal(tasi.durum, 400, JSON.stringify(tasi.govde));
  });
});
