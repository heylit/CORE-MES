import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { birimAyrintisiCevabi, birimSemasi, emirOzetiCevabi, tanimSemasi } from '#paylasilan/sozlesme/markalama.ts';
import type { MarkalamaBirimi, MarkalamaTanimi } from '#paylasilan/sozlesme/markalama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('markalama (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerezler = new Map<string, string>();
  let tipId = 0;
  let projeId = 0;
  let sayac = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown, kimlik?: string): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = kimlik ?? randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  // Yalnız verilen işlemleri taşıyan geçici rol; yerleşik rollerin markalama işlemi yoktur (Aşama 1: yalnız yönetici).
  async function islemliKisi(kullaniciAdi: string, islemler: readonly string[]): Promise<void> {
    const rol = await o().sahip.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await o().sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await o().vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rol?.id ?? 0);
      await rolAl(db, yoneticiId, id, yoneticiRolu?.id ?? 0);
    });
    await giris(kullaniciAdi);
  }

  async function malzemeAc(): Promise<number> {
    sayac += 1;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('MK-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'MK-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`mk-dnm-${sayac}`, sayac, JSON.stringify({ id: `mk-dnm-${sayac}`, com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
  }

  async function makineKur(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`MKM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`MKI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]);
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`MKK${sayac}`, 'Lazer', ist?.id]))!.id;
  }

  async function emirAc(malzemeNo: number): Promise<number> {
    const revizyonId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [malzemeNo, yoneticiId]))!.id;
    const makineId = await makineKur();
    return o().vt.tx(async (db) => {
      const k = await kullaniciYukle(db, yoneticiId);
      if (k === null) throw new Error('yönetici yüklenemedi');
      const e = await uretimEmriAc(db, k, {
        malzemeNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyonId, projeId,
        isEmirleri: [{
          sira: 1, opNo: 40, ad: 'Markalama', operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId }, ayarSuresiDk: '5',
          birimSureDk: '1', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
        }],
      });
      return e.uretimEmriId;
    });
  }

  const seriAlani = { ad: 'Seri no', icerik: 'seri', yontem: 'lazer', kodTuru: 'datamatrix', yaziYuksekligiMm: 3 };

  async function tanimAc(malzemeId: number, alanlar: Record<string, unknown> = {}, ek: Record<string, unknown> = {}): Promise<MarkalamaTanimi> {
    const c = await istek('yonetici', 'POST', '/markalama/tanimlar/ekle', {
      malzemeId, opNo: 40, seriSablonu: '{PARCA}-{SEQ:5}', alanlar: [{ ...seriAlani, ...alanlar }], ...ek,
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return tanimSemasi.parse(c.govde);
  }

  async function markala(ad: string, tanimId: number, uretimEmriId: number, sonuc = 'iyi', kimlik?: string): Promise<Cevap<MarkalamaBirimi>> {
    return istek<MarkalamaBirimi>(ad, 'POST', '/markalama/birimler/markala', { tanimId, uretimEmriId, sonuc }, kimlik);
  }

  before(async () => {
    ortam = await testVeritabaniKur('markalama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    await islemliKisi('operator', ['sayfa.markalama', 'markalama.seri-ver']);
    await islemliKisi('kalite', ['sayfa.markalama', 'markalama.durum-yaz']);
    await islemliKisi('yetkisiz', []);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('MK-T', 'Deneme markalama', 'MRK') RETURNING id"))!.id;
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('MRK.1', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('MRK-U1: sayfası olmayan okuyamaz ve yazamaz; işlemi olmayan tanım yazamaz', async () => {
    const m = await malzemeAc();
    assert.equal((await istek('yetkisiz', 'GET', '/markalama/tanimlar')).durum, 403);
    const govde = { malzemeId: m, opNo: 40, seriSablonu: '{PARCA}-{SEQ}', alanlar: [seriAlani] };
    assert.equal((await istek('yetkisiz', 'POST', '/markalama/tanimlar/ekle', govde)).durum, 403);
    assert.equal((await istek('operator', 'POST', '/markalama/tanimlar/ekle', govde)).durum, 403);
    assert.equal((await istek('operator', 'GET', '/markalama/tanimlar')).durum, 200);
    assert.equal((await istek('yonetici', 'POST', '/markalama/tanimlar/ekle', govde)).durum, 200);
  });

  test('MRK-U2: tanım şablonu, adım tekilliği ve sürüm denetlenir; 3B yer saklanır', async () => {
    const m = await malzemeAc();
    const kotu = await istek<{ hata?: { alan?: string } }>('yonetici', 'POST', '/markalama/tanimlar/ekle', {
      malzemeId: m, opNo: 40, seriSablonu: '{YY}-{SEQ}', alanlar: [seriAlani],
    });
    assert.equal(kotu.durum, 400, JSON.stringify(kotu.govde));
    assert.equal((await istek('yonetici', 'POST', '/markalama/tanimlar/ekle', {
      malzemeId: 2147483647, opNo: 40, seriSablonu: '{PARCA}-{SEQ}', alanlar: [seriAlani],
    })).durum, 400, 'olmayan malzeme');
    const yer = { merkez: [-62, -31.5, 18], normal: [0, 0, 1], enMm: 42, boyMm: 8, aciDerece: 17 };
    const t = await tanimAc(m, { yer, yuzey: 'Flanş üst yüzü' }, { model: { belgeId: 5, revizyon: 'C' } });
    assert.deepEqual(t.alanlar[0]?.yer, yer);
    assert.deepEqual(t.model, { belgeId: 5, revizyon: 'C' });
    assert.ok(t.malzemeKodu?.startsWith('MK-DNM-'), 'kod malzemeden okunur');
    const ikinci = await istek('yonetici', 'POST', '/markalama/tanimlar/ekle', { malzemeId: m, opNo: 40, seriSablonu: '{PARCA}-{SEQ}', alanlar: [seriAlani] });
    assert.equal(ikinci.durum, 409);
    const kaydet = (surum: number) => istek('yonetici', 'POST', `/markalama/tanimlar/${t.id}/kaydet`, {
      seriSablonu: '{PARCA}-{YY}-{SEQ:4}', sayacKapsami: 'yil', alanlar: [seriAlani, { ad: 'Revizyon', icerik: 'sabit', sabitMetin: 'C', yontem: 'nokta_vurus' }], surum,
    });
    const k = await kaydet(t.surum);
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    const yeni = tanimSemasi.parse(k.govde);
    assert.equal(yeni.surum, t.surum + 1);
    assert.deepEqual(yeni.alanlar.map((a) => a.ad), ['Seri no', 'Revizyon']);
    assert.equal(yeni.alanlar[0]?.yer, null, 'kaydette verilmeyen yer boşalır');
    assert.equal((await kaydet(t.surum)).durum, 409, 'eski sürüm');
  });

  test('MRK-U7: yazı yüksekliği, derinliği ve tipi ayrı saklanır; ikisi de boş olabilir; 0 ve boş op no alan adıyla reddedilir', async () => {
    const m = await malzemeAc();
    const t = await tanimAc(m, { yaziYuksekligiMm: 0.5, yaziDerinligiMm: 0.05, yaziTipi: 'gotik' });
    assert.deepEqual(
      [t.alanlar[0]?.yaziYuksekligiMm, t.alanlar[0]?.yaziDerinligiMm, t.alanlar[0]?.yaziTipi], [0.5, 0.05, 'gotik'],
    );
    const bos = await tanimAc(await malzemeAc(), { yaziYuksekligiMm: null });
    assert.deepEqual([bos.alanlar[0]?.yaziYuksekligiMm, bos.alanlar[0]?.yaziDerinligiMm, bos.alanlar[0]?.yaziTipi], [null, null, null]);
    const ekle = (govde: Record<string, unknown>) => istek<{ mesaj?: string }>('yonetici', 'POST', '/markalama/tanimlar/ekle', {
      malzemeId: m, opNo: 50, seriSablonu: '{PARCA}-{SEQ}', alanlar: [seriAlani], ...govde,
    });
    const sifir = await ekle({ alanlar: [{ ...seriAlani, yaziDerinligiMm: 0 }] });
    assert.equal(sifir.durum, 400);
    assert.match(JSON.stringify(sifir.govde), /Yazı derinliği 0'dan büyük olmalı/);
    assert.equal((await ekle({ alanlar: [{ ...seriAlani, yaziDerinligiMm: 10.5 }] })).durum, 400, 'derinlik sınırı');
    assert.equal((await ekle({ alanlar: [{ ...seriAlani, yaziTipi: 'bilinmeyen' }] })).durum, 400, 'listede olmayan yazı tipi');
    const op = await ekle({ opNo: 0 });
    assert.equal(op.durum, 400);
    assert.match(JSON.stringify(op.govde), /Rota operasyon no 0'dan büyük olmalı/);
  });

  test('MRK-U3: seri sunucuda sıralı verilir; önizleme sayacı tüketmez; yinelenen istek ikinci numara yakmaz', async () => {
    const m = await malzemeAc();
    const t = await tanimAc(m);
    const emir = await emirAc(m);
    const on = await istek<{ numaralar: string[] }>('operator', 'GET', `/markalama/tanimlar/${t.id}/onizleme?emirId=${emir}`);
    assert.equal(on.durum, 200, JSON.stringify(on.govde));
    const kod = t.malzemeKodu ?? '';
    assert.deepEqual(on.govde.numaralar, [`${kod}-00001`, `${kod}-00002`, `${kod}-00003`]);
    const emirler = await istek<{ emirler: { id: number }[] }>('operator', 'GET', `/markalama/tanimlar/${t.id}/emirler`);
    assert.deepEqual(emirler.govde.emirler.map((e) => e.id), [emir], 'yalnız tanımın malzemesinin açık emri');
    const kimlik = randomUUID();
    const a = await markala('operator', t.id, emir, 'iyi', kimlik);
    assert.equal(a.durum, 200, JSON.stringify(a.govde));
    const tekrar = await markala('operator', t.id, emir, 'iyi', kimlik);
    assert.equal(tekrar.govde.seriNo, a.govde.seriNo, 'aynı istek kimliği ilk cevabı döner');
    const b = await markala('operator', t.id, emir, 'hatali');
    const c = await markala('operator', t.id, emir);
    assert.deepEqual([a, b, c].map((x) => birimSemasi.parse(x.govde).seriNo), [`${kod}-00001`, `${kod}-00002`, `${kod}-00003`]);
    assert.deepEqual([a, b, c].map((x) => x.govde.durum), ['saglam', 'hurda', 'saglam'], 'hatalı markalanan numara yanar');
    assert.equal((await markala('kalite', t.id, emir)).durum, 403);
    // Başka malzemenin emrinde ve seri alanı olmayan tanımda seri verilmez.
    const baskaEmir = await emirAc(await malzemeAc());
    assert.equal((await markala('operator', t.id, baskaEmir)).durum, 422);
    const m2 = await malzemeAc();
    const sabit = await tanimAc(m2, { ad: 'Rev', icerik: 'sabit', sabitMetin: 'C' });
    assert.equal((await markala('operator', sabit.id, await emirAc(m2))).durum, 422);
  });

  test('MRK-U4: doğrulama yalnız bu tanımın sağlam birimini kabul eder, yinelenen okutma olay yazmaz', async () => {
    const m = await malzemeAc();
    const t = await tanimAc(m);
    const emir = await emirAc(m);
    const iyi = (await markala('operator', t.id, emir)).govde;
    const hurda = (await markala('operator', t.id, emir, 'hatali')).govde;
    const d = await istek<MarkalamaBirimi>('operator', 'POST', '/markalama/birimler/dogrula', { tanimId: t.id, seriNo: iyi.seriNo });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.ok(d.govde.dogrulamaZamani);
    assert.equal((await istek('operator', 'POST', '/markalama/birimler/dogrula', { tanimId: t.id, seriNo: iyi.seriNo })).durum, 200);
    assert.equal((await istek('operator', 'POST', '/markalama/birimler/dogrula', { tanimId: t.id, seriNo: hurda.seriNo })).durum, 422);
    assert.equal((await istek('operator', 'POST', '/markalama/birimler/dogrula', { tanimId: t.id, seriNo: 'YOK-1' })).durum, 404);
    assert.equal((await istek('yetkisiz', 'POST', '/markalama/birimler/dogrula', { tanimId: t.id, seriNo: iyi.seriNo })).durum, 403);
    const ayr = birimAyrintisiCevabi.parse((await istek('operator', 'GET', `/markalama/birimler/${iyi.id}`)).govde);
    assert.deepEqual(ayr.olaylar.map((x) => x.olay), ['markalandi', 'dogrulandi']);
    assert.ok(ayr.emirNo, 'emir no okunur ad olarak gelir');
  });

  test('MRK-U5: red, rework, kabul ve hurda geçişi; geçersiz geçiş, eksik neden ve eski sürüm reddedilir', async () => {
    const m = await malzemeAc();
    const t = await tanimAc(m);
    const emir = await emirAc(m);
    let b = (await markala('operator', t.id, emir)).govde;
    const durum = (komut: string, ek: Record<string, unknown> = {}, ad = 'kalite') =>
      istek<MarkalamaBirimi>(ad, 'POST', `/markalama/birimler/${b.id}/durum`, { komut, surum: b.surum, ...ek });
    assert.equal((await durum('rework')).durum, 409, 'sağlam birime rework verilmez');
    assert.equal((await durum('red', {}, 'operator')).durum, 403);
    let c = await durum('red', { aciklama: 'Ölçü dışı' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const eski = b;
    b = c.govde;
    assert.equal((await istek('kalite', 'POST', `/markalama/birimler/${b.id}/durum`, { komut: 'rework', surum: eski.surum })).durum, 409, 'eski sürüm');
    c = await durum('rework'); b = c.govde;
    assert.equal(b.durum, 'rework');
    c = await durum('kabul'); b = c.govde;
    assert.equal(b.durum, 'saglam');
    assert.equal((await durum('hurda')).durum, 400, 'hurda nedeni zorunlu');
    assert.equal((await durum('red', { hurdaNedeniId: 1 })).durum, 400, 'neden yalnız hurdada');
    const neden = await o().vt.tek<{ id: number }>('SELECT id FROM hurda_nedeni ORDER BY id LIMIT 1');
    assert.ok(neden, 'göçle gelen hurda nedeni var');
    c = await durum('hurda', { hurdaNedeniId: neden.id }); b = c.govde;
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal((await durum('kabul')).durum, 409, 'hurda son durumdur');
    const ayr = birimAyrintisiCevabi.parse((await istek('kalite', 'GET', `/markalama/birimler/${b.id}`)).govde);
    assert.deepEqual(ayr.olaylar.map((x) => x.olay), ['markalandi', 'red', 'rework', 'kabul', 'hurda']);
    assert.equal(ayr.olaylar[4]?.hurdaNedeniId, neden.id);
    await markala('operator', t.id, emir);
    const oz = emirOzetiCevabi.parse((await istek('kalite', 'GET', `/markalama/emirler/${emir}/ozet`)).govde);
    assert.deepEqual(oz.sayilar, { saglam: 1, red: 0, rework: 0, hurda: 1 });
    const liste = (await istek<{ birimler: MarkalamaBirimi[] }>('kalite', 'GET', `/markalama/birimler?seriNo=${encodeURIComponent(b.seriNo)}`)).govde;
    assert.deepEqual(liste.birimler.map((x) => x.id), [b.id]);
  });

  test('MRK-U6: birim olay defteri yalnız eklenir', async () => {
    const m = await malzemeAc();
    const t = await tanimAc(m);
    await markala('operator', t.id, await emirAc(m));
    await assert.rejects(o().vt.sorgu("UPDATE markalama_birim_olayi SET olay = 'kabul'"));
    await assert.rejects(o().vt.sorgu('DELETE FROM markalama_birim_olayi'));
  });
});
