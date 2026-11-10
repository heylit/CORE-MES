import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { aramaSade, basDeseni, icindeDeseni, KAYIT_TURLERI } from '#paylasilan/kayit-aramasi.ts';
import { kayitYoluMu } from '#paylasilan/sayfa-tanimi.ts';
import { birimAyrintisiCevabi, birimSemasi, emirOzetiCevabi, tanimSemasi } from '#paylasilan/sozlesme/markalama.ts';
import type { MarkalamaBirimi, MarkalamaTanimi } from '#paylasilan/sozlesme/markalama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { kayitAramaKaynaklari } from './disari.ts';

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

  // Göçlerin kurduğu yerleşik rol: rol matrisinin markalama satırları (2730-1 a+c) gerçek rolle ölçülür.
  async function yerlesikRolluKisi(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    assert.ok(rol, rolKodu);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await o().vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rol.id);
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
    const ist = await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ($1, $2, $3, 'markalama') RETURNING id", [`MKI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]);
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`MKK${sayac}`, 'Lazer', ist?.id]))!.id;
  }

  async function malzemeBelgesi(malzemeNo: number): Promise<number> {
    const b = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO belge_merkezi_belge (ad, tur, olusturan_id) VALUES ('Deneme model', 'teknik-resim', $1) RETURNING id", [yoneticiId]))!.id;
    await o().sahip.sorgu(
      "INSERT INTO belge_merkezi_bag (belge_id, hedef_modul, hedef_id, ekleyen_id) VALUES ($1, 'malzemeler', $2, $3)", [b, malzemeNo, yoneticiId]);
    return b;
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
    // 2036 a: seri yalnız markalama istasyonunda verilir; testler son kurulan markalama istasyonunu kullanır.
    const ist = await o().sahip.tek<{ id: number }>("SELECT id FROM istasyon WHERE tip = 'markalama' AND aktif ORDER BY id DESC LIMIT 1");
    return istek<MarkalamaBirimi>(ad, 'POST', '/markalama/birimler/markala', { tanimId, uretimEmriId, istasyonId: ist?.id ?? null, sonuc }, kimlik);
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

  test('MRK-U16, 2730-1 a+c: yerleşik operatör markalamayı okuyamaz ve seri veremez; Markalama Görevlisi okur, tanım yazar, seri verir, durum yazamaz', async () => {
    await yerlesikRolluKisi('gercek-operator', 'operator');
    await yerlesikRolluKisi('gercek-gorevli', 'markalama_gorevlisi');
    const m = await malzemeAc();
    const t = await tanimAc(m);
    const emir = await emirAc(m);
    assert.equal((await istek('gercek-operator', 'GET', '/markalama/tanimlar')).durum, 403);
    assert.equal((await istek('gercek-operator', 'GET', `/markalama/tanimlar/${t.id}/onizleme?emirId=${emir}`)).durum, 403);
    assert.equal((await markala('gercek-operator', t.id, emir)).durum, 403);
    assert.equal((await istek('gercek-operator', 'POST', '/markalama/birimler/dogrula', { tanimId: t.id, seriNo: 'YOK-1' })).durum, 403);
    assert.equal((await istek('gercek-gorevli', 'GET', '/markalama/tanimlar')).durum, 200);
    const yeni = await istek('gercek-gorevli', 'POST', '/markalama/tanimlar/ekle', {
      malzemeId: await malzemeAc(), opNo: 40, seriSablonu: '{PARCA}-{SEQ}', alanlar: [seriAlani],
    });
    assert.equal(yeni.durum, 200, JSON.stringify(yeni.govde));
    const b = await markala('gercek-gorevli', t.id, emir);
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    assert.equal((await istek('gercek-gorevli', 'POST', '/markalama/birimler/dogrula', { tanimId: t.id, seriNo: b.govde.seriNo })).durum, 200);
    const durum = await istek('gercek-gorevli', 'POST', `/markalama/birimler/${b.govde.id}/durum`, { komut: 'red', aciklama: 'deneme', surum: b.govde.surum });
    assert.equal(durum.durum, 403);
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
    const belge = await malzemeBelgesi(m);
    const t = await tanimAc(m, { yer, yuzey: 'Flanş üst yüzü' }, { model: { belgeId: belge, revizyon: 'C' } });
    assert.deepEqual(t.alanlar[0]?.yer, yer);
    assert.deepEqual(t.model, { belgeId: belge, revizyon: 'C' });
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

  test('MRK-U8, 2036 a: model malzemeye bağlı belge, istasyon zorunlu, kayıtlı, aktif ve markalama tipinde olmalı; yüzey yönü sıfır olamaz', async () => {
    const m = await malzemeAc();
    const ekle = (govde: Record<string, unknown>) => istek<{ alan?: string }>('yonetici', 'POST', '/markalama/tanimlar/ekle', {
      malzemeId: m, opNo: 40, seriSablonu: '{PARCA}-{SEQ}', alanlar: [seriAlani], ...govde,
    });
    const baskaBelge = await malzemeBelgesi(await malzemeAc());
    const bagsiz = await ekle({ model: { belgeId: baskaBelge, revizyon: 'A' } });
    assert.equal(bagsiz.durum, 400, 'başka malzemenin belgesi');
    assert.equal(bagsiz.govde.alan, 'model');
    const sifir = await ekle({ alanlar: [{ ...seriAlani, yer: { merkez: [0, 0, 0], normal: [0, 0, 0], enMm: 5, boyMm: 2, aciDerece: 0 } }] });
    assert.equal(sifir.durum, 400);
    assert.equal(sifir.govde.alan, 'alanlar.0.yer.normal');
    const t = tanimSemasi.parse((await ekle({})).govde);
    const emir = await emirAc(m);
    const makine = await o().sahip.tek<{ istasyonId: number }>('SELECT istasyon_id AS "istasyonId" FROM makine ORDER BY id DESC LIMIT 1');
    const istasyonlu = (istasyonId: number) => istek<MarkalamaBirimi>('operator', 'POST', '/markalama/birimler/markala', { tanimId: t.id, uretimEmriId: emir, istasyonId, sonuc: 'iyi' });
    assert.equal((await istasyonlu(2147483647)).durum, 400, 'olmayan istasyon');
    const istasyonsuz = await istek<{ alan?: string }>('operator', 'POST', '/markalama/birimler/markala', { tanimId: t.id, uretimEmriId: emir, sonuc: 'iyi' });
    assert.equal(istasyonsuz.durum, 400, '2036 a: istasyonsuz seri verilmez');
    assert.equal(istasyonsuz.govde.alan, 'istasyonId');
    const im = await o().sahip.tek<{ id: number }>("SELECT is_merkezi_id AS id FROM istasyon WHERE id = $1", [makine!.istasyonId]);
    const torna = await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ('MKTORNA', 'Deneme torna', $1, 'talasli') RETURNING id", [im!.id]);
    assert.equal((await istasyonlu(torna!.id)).durum, 400, '2036 a: markalama tipi olmayan istasyon');
    const iyi = await istasyonlu(makine!.istasyonId);
    assert.equal(iyi.durum, 200, JSON.stringify(iyi.govde));
    assert.equal(iyi.govde.istasyonId, makine!.istasyonId);
    await o().sahip.sorgu('UPDATE istasyon SET aktif = false WHERE id = $1', [makine!.istasyonId]);
    assert.equal((await istasyonlu(makine!.istasyonId)).durum, 400, 'pasif istasyon');
    // Bağı sonradan kalkan modelli tanımın başka alanı kaydedilebilir.
    const belge = await malzemeBelgesi(m);
    const modelli = tanimSemasi.parse((await ekle({ opNo: 41, seriSablonu: 'M{PARCA}-{SEQ}', model: { belgeId: belge, revizyon: 'A' } })).govde);
    await o().sahip.sorgu("DELETE FROM belge_merkezi_bag WHERE belge_id = $1", [belge]);
    const k = await istek('yonetici', 'POST', `/markalama/tanimlar/${modelli.id}/kaydet`, {
      seriSablonu: '{PARCA}-{SEQ:6}', alanlar: [seriAlani], model: modelli.model, surum: modelli.surum,
    });
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
  });

  test('MRK-U9: veritabanında sıfıra yuvarlanan ölçü ve 80 karakteri aşan seri no alan adıyla reddedilir', async () => {
    const m = await malzemeAc();
    const ekle = (govde: Record<string, unknown>) => istek<{ alan?: string; mesaj?: string }>('yonetici', 'POST', '/markalama/tanimlar/ekle', {
      malzemeId: m, opNo: 60, seriSablonu: '{PARCA}-{SEQ}', alanlar: [seriAlani], ...govde,
    });
    const kucuk = await ekle({ alanlar: [{ ...seriAlani, yaziYuksekligiMm: 0.001 }] });
    assert.equal(kucuk.durum, 400, JSON.stringify(kucuk.govde));
    assert.equal(kucuk.govde.alan, 'alanlar.0.yaziYuksekligiMm');
    const uzak = await ekle({ alanlar: [{ ...seriAlani, yer: { merkez: [1e9, 0, 0], normal: [0, 0, 1], enMm: 5, boyMm: 2, aciDerece: 0 } }] });
    assert.equal(uzak.durum, 400);
    assert.equal(uzak.govde.alan, 'alanlar.0.yer.merkez');
    const t0 = await tanimAc(m);
    const kod = t0.malzemeKodu ?? '';
    const kat = Math.floor(76 / kod.length);
    const sablon = '{PARCA}'.repeat(kat) + 'X'.repeat(76 - kat * kod.length) + '{SEQ:4}';
    assert.ok(sablon.length <= 60, sablon);
    assert.equal((await ekle({ opNo: 61, seriSablonu: `${sablon}X` })).durum, 400, 'kayıtta 81 karakter');
    const t = tanimSemasi.parse((await ekle({ opNo: 62, seriSablonu: sablon, baslangicSirasi: 9999 })).govde);
    const emir = await emirAc(m);
    const ilk = await markala('operator', t.id, emir);
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.equal(ilk.govde.seriNo.length, 80);
    const ist = await o().sahip.tek<{ id: number }>("SELECT id FROM istasyon WHERE tip = 'markalama' AND aktif ORDER BY id DESC LIMIT 1");
    const tasan = await istek<{ mesaj?: string }>('operator', 'POST', '/markalama/birimler/markala', { tanimId: t.id, uretimEmriId: emir, istasyonId: ist!.id, sonuc: 'iyi' });
    assert.equal(tasan.durum, 422);
    assert.match(tasan.govde.mesaj ?? '', /80 karakteri aşıyor/);
  });

  test('MRK-U10: başlamış sayaçta başlangıç sırası ileri alınırsa sayaç taşınır, geri alınırsa reddedilir', async () => {
    const m = await malzemeAc();
    const t = await tanimAc(m);
    const emir = await emirAc(m);
    for (let i = 0; i < 3; i += 1) await markala('operator', t.id, emir);
    const kaydet = (baslangicSirasi: number, surum: number, ek: Record<string, unknown> = {}) => istek<MarkalamaTanimi & { alan?: string }>(
      'yonetici', 'POST', `/markalama/tanimlar/${t.id}/kaydet`, { seriSablonu: t.seriSablonu, alanlar: [seriAlani], baslangicSirasi, surum, ...ek },
    );
    const geri = await kaydet(3, t.surum);
    assert.equal(geri.durum, 400, JSON.stringify(geri.govde));
    assert.equal(geri.govde.alan, 'baslangicSirasi');
    const ileri = await kaydet(1000, t.surum);
    assert.equal(ileri.durum, 200, JSON.stringify(ileri.govde));
    const kod = t.malzemeKodu ?? '';
    const on = await istek<{ numaralar: string[] }>('operator', 'GET', `/markalama/tanimlar/${t.id}/onizleme?emirId=${emir}`);
    assert.equal(on.govde.numaralar[0], `${kod}-01000`);
    assert.equal((await markala('operator', t.id, emir)).govde.seriNo, `${kod}-01000`);
    // Emir kapsamında sayaç emir başınadır: değişiklik reddedilmez, yeni emirde geçer.
    const emirli = await kaydet(500, ileri.govde.surum, { seriSablonu: '{PARCA}-{EMIR}-{SEQ}', sayacKapsami: 'emir' });
    assert.equal(emirli.durum, 200, JSON.stringify(emirli.govde));
  });

  test('MRK-U11: emirsiz önizlemede emir no yer tutucusuyla gösterilir, emirli önizleme emrin numarasını taşır', async () => {
    const m = await malzemeAc();
    const t = await tanimAc(m, {}, { seriSablonu: '{PARCA}-{EMIR}-{SEQ:3}', sayacKapsami: 'emir' });
    const kod = t.malzemeKodu ?? '';
    const emirsiz = await istek<{ numaralar: string[] }>('yonetici', 'GET', `/markalama/tanimlar/${t.id}/onizleme`);
    assert.equal(emirsiz.durum, 200, JSON.stringify(emirsiz.govde));
    assert.deepEqual(emirsiz.govde.numaralar, [`${kod}-{EMIR}-001`, `${kod}-{EMIR}-002`, `${kod}-{EMIR}-003`]);
    const emir = await emirAc(m);
    const ilk = (await markala('operator', t.id, emir)).govde;
    const emirNo = birimAyrintisiCevabi.parse((await istek('yonetici', 'GET', `/markalama/birimler/${ilk.id}`)).govde).emirNo;
    const emirli = await istek<{ numaralar: string[] }>('yonetici', 'GET', `/markalama/tanimlar/${t.id}/onizleme?emirId=${emir}`);
    assert.equal(emirli.govde.numaralar[0], `${kod}-${emirNo}-002`);
    assert.equal((await istek<{ numaralar: string[] }>('yonetici', 'GET', `/markalama/tanimlar/${t.id}/onizleme`)).govde.numaralar[0], `${kod}-{EMIR}-001`, 'yeni emir baştan başlar');
  });

  test('MRK-U12: pasif tanım seri vermez ve geri etkinleşir; sürüm ve yetki denetlenir', async () => {
    const m = await malzemeAc();
    const t = await tanimAc(m);
    const emir = await emirAc(m);
    const aktiflik = (aktif: boolean, surum: number, ad = 'yonetici') => istek<MarkalamaTanimi>(ad, 'POST', `/markalama/tanimlar/${t.id}/aktiflik`, { aktif, surum });
    assert.equal((await aktiflik(false, t.surum, 'operator')).durum, 403);
    const pasif = await aktiflik(false, t.surum);
    assert.equal(pasif.durum, 200, JSON.stringify(pasif.govde));
    assert.equal(pasif.govde.aktif, false);
    assert.equal((await aktiflik(true, t.surum)).durum, 409, 'eski sürüm');
    const red = await istek<{ mesaj?: string }>('operator', 'POST', '/markalama/birimler/markala', { tanimId: t.id, uretimEmriId: emir, sonuc: 'iyi' });
    assert.equal(red.durum, 422);
    assert.match(red.govde.mesaj ?? '', /pasif/);
    const liste = (await istek<{ tanimlar: MarkalamaTanimi[] }>('operator', 'GET', `/markalama/tanimlar?malzemeId=${m}`)).govde.tanimlar;
    assert.deepEqual(liste.map((x) => [x.id, x.aktif]), [[t.id, false]], 'pasif tanım listede kalır');
    const etkin = await aktiflik(true, pasif.govde.surum);
    assert.equal(etkin.govde.aktif, true);
    assert.equal((await markala('operator', t.id, emir)).durum, 200);
  });

  test('MRK-U13: seri parçasıyla arama, tanım süzgeci, olay kişi adı ve hurda nedeni; olmayan emrin özeti 404', async () => {
    const m = await malzemeAc();
    const t = await tanimAc(m);
    const t2 = tanimSemasi.parse((await istek('yonetici', 'POST', '/markalama/tanimlar/ekle', {
      malzemeId: m, opNo: 70, seriSablonu: 'B{PARCA}-{SEQ:5}', alanlar: [seriAlani],
    })).govde);
    const emir = await emirAc(m);
    const a = (await markala('operator', t.id, emir)).govde;
    await markala('operator', t.id, emir);
    await markala('operator', t2.id, emir);
    const ara = async (q: string) => (await istek<{ birimler: MarkalamaBirimi[] }>('kalite', 'GET', `/markalama/birimler?${q}`)).govde.birimler;
    const parca = a.seriNo.slice(2, 10).toLowerCase();
    assert.equal((await ara(`seriNo=${encodeURIComponent(parca)}&emirId=${emir}`)).length, 3, 'parça, harften bağımsız');
    assert.equal((await ara(`seriNo=${encodeURIComponent(a.seriNo)}`))[0]?.id, a.id, 'tam eşleşme önde');
    assert.deepEqual((await ara('seriNo=%25')).length, 0, 'joker karakter kaçırılır');
    assert.equal((await ara(`emirId=${emir}&tanimId=${t.id}`)).length, 2);
    const oz = emirOzetiCevabi.parse((await istek('kalite', 'GET', `/markalama/emirler/${emir}/ozet?tanimId=${t2.id}`)).govde);
    assert.deepEqual(oz.sayilar, { saglam: 1, red: 0, rework: 0, hurda: 0 });
    assert.equal((await istek('kalite', 'GET', '/markalama/emirler/2147483647/ozet')).durum, 404);
    const neden = await o().vt.tek<{ id: number; kod: string; ad: string }>('SELECT id, kod, ad FROM hurda_nedeni ORDER BY id LIMIT 1');
    const h = await istek<MarkalamaBirimi>('kalite', 'POST', `/markalama/birimler/${a.id}/durum`, { komut: 'hurda', hurdaNedeniId: neden!.id, surum: a.surum });
    assert.equal(h.durum, 200, JSON.stringify(h.govde));
    const ayr = birimAyrintisiCevabi.parse((await istek('kalite', 'GET', `/markalama/birimler/${a.id}`)).govde);
    assert.deepEqual(ayr.olaylar.map((x) => x.kisiAd), ['Deneme operator', 'Deneme kalite']);
    assert.equal(ayr.olaylar[1]?.hurdaNedeni, `${neden!.kod} · ${neden!.ad}`);
  });

  test('MRK-U14: genel arama seri noyu parçasından bulur; tam eşleşme önde, yol Seri izleme', async () => {
    const [kaynak] = kayitAramaKaynaklari;
    assert.ok(kaynak);
    assert.equal(KAYIT_TURLERI[kaynak.tur].modul, 'markalama');
    assert.deepEqual(kaynak.yetki, ['sayfa.markalama']);
    const m = await malzemeAc();
    const t = await tanimAc(m);
    const emir = await emirAc(m);
    const a = (await markala('operator', t.id, emir)).govde;
    await markala('operator', t.id, emir);
    const ara = (q: string) => o().vt.tx((db) => kaynak.ara(db, {
      q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir: 10, kullanici: { id: yoneticiId, islemler: [] },
    }));
    const tam = await ara(a.seriNo.toLowerCase());
    assert.equal(tam[0]?.baslik, a.seriNo);
    assert.ok(tam.every((x) => kayitYoluMu(x.yol)), JSON.stringify(tam));
    assert.equal(tam[0]?.yol, `/markalama/izleme?seri=${encodeURIComponent(a.seriNo)}`);
    assert.match(tam[0]?.aciklama ?? '', /Sağlam/);
    assert.ok((await ara(a.seriNo.slice(0, -2))).length >= 2, 'parça');
    assert.equal((await ara('%%')).length, 0, 'joker karakter kaçırılır');
  });

  test('MRK-U15: aynı malzemede aynı şablonlu ikinci tanım eklenemez ve kayıtta o şablona çevrilemez; pasif tanım da sayılır', async () => {
    const m = await malzemeAc();
    const ilk = await tanimAc(m);
    const ekle = (govde: Record<string, unknown>) => istek<{ alan?: string; mesaj?: string }>('yonetici', 'POST', '/markalama/tanimlar/ekle', {
      malzemeId: m, opNo: 70, seriSablonu: '{PARCA}-{SEQ:5}', sayacKapsami: 'malzeme', alanlar: [seriAlani], ...govde,
    });
    const ayni = await ekle({});
    assert.equal(ayni.durum, 400, JSON.stringify(ayni.govde));
    assert.equal(ayni.govde.alan, 'seriSablonu');
    assert.match(ayni.govde.mesaj ?? JSON.stringify(ayni.govde), /op 40.*düzenleyin/);
    const ikinci = tanimSemasi.parse((await ekle({ seriSablonu: 'B{PARCA}-{SEQ:5}' })).govde);
    const kaydet = (seriSablonu: string, surum: number) => istek<{ alan?: string }>('yonetici', 'POST', `/markalama/tanimlar/${ikinci.id}/kaydet`, {
      seriSablonu, sayacKapsami: 'malzeme', alanlar: [seriAlani], surum,
    });
    const cevir = await kaydet('{PARCA}-{SEQ:5}', ikinci.surum);
    assert.equal(cevir.durum, 400);
    assert.equal(cevir.govde.alan, 'seriSablonu');
    const kendi = await kaydet('B{PARCA}-{SEQ:5}', ikinci.surum);
    assert.equal(kendi.durum, 200, 'kendi şablonunu yeniden kaydetmek engellenmez');
    const pasif = await istek('yonetici', 'POST', `/markalama/tanimlar/${ilk.id}/aktiflik`, { aktif: false, surum: ilk.surum });
    assert.equal(pasif.durum, 200);
    assert.equal((await ekle({ opNo: 71 })).durum, 400, 'pasif tanımın şablonu da dolu');
    assert.equal((await istek('yonetici', 'POST', '/markalama/tanimlar/ekle', {
      malzemeId: await malzemeAc(), opNo: 70, seriSablonu: '{PARCA}-{SEQ:5}', alanlar: [seriAlani],
    })).durum, 200, 'başka malzemede aynı şablon serbest');
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
