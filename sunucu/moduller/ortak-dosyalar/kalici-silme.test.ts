import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type {
  ArsivCevabi, AyarlarCevabi, DosyaListesiCevabi, DosyalarCevabi, GecmisCevabi, Klasor, OrtakDosya, SecimCevabi, YetkiCevabi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kayitKlasoruAc, kokAc } from './kayit-klasorleri.ts';
import {
  ILETILER, kayitSecimiCoz, musteriTuruMu, secimReddi, silmeAdiUyarMi, silmeGeriCekebilirMi, silmeOnaylayabilirMi,
} from './kurallar.ts';

// Kart 3443 (3443 a; ADR 0030 madde 6): dosyanın müşterisi ve projesi, arşivdeki dosyanın kalıcı silinmesi ve dört göz.
// Kurallar OD-30..33 (KURAL-TEST.md). Firma ve proje satırları ORN- uydurma verisidir.

const PAROLA = 'dogru-parola-1';
const AYAR = 'ortak-dosyalar.silme-dort-goz';
interface Oturum { cerez: string; id: number }
const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(1200)]);
const ozetOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

describe('OD-30..33 saf kurallar', () => {
  test('OD-30 müşteri yalnız müşteri ya da ikisi türü; proje seçilen müşterinin olmalı, müşteri boşsa projeninki', () => {
    assert.equal(musteriTuruMu('musteri'), true);
    assert.equal(musteriTuruMu('ikisi'), true);
    assert.equal(musteriTuruMu('tedarikci'), false);
    assert.equal(secimReddi({ firmaTuru: 'tedarikci', firmaId: 1, projeFirmaId: undefined }), 'musteriDegil');
    assert.equal(secimReddi({ firmaTuru: 'musteri', firmaId: 1, projeFirmaId: 2 }), 'projeMusteriUyusmuyor');
    assert.equal(secimReddi({ firmaTuru: 'musteri', firmaId: 1, projeFirmaId: null }), 'projeMusteriUyusmuyor');
    assert.equal(secimReddi({ firmaTuru: 'musteri', firmaId: 1, projeFirmaId: 1 }), null);
    assert.equal(secimReddi({ firmaTuru: null, firmaId: null, projeFirmaId: 7 }), null);
  });

  test('OD-31 kayda bağlı zincir: firma, sipariş ya da proje klasörü varsa seçim klasördendir; yoksa serbest', () => {
    assert.equal(kayitSecimiCoz([{ kaynakTur: null, kaynakId: null }]), null);
    assert.equal(kayitSecimiCoz([{ kaynakTur: 'kok', kaynakId: null }]), null);
    assert.deepEqual(kayitSecimiCoz([{ kaynakTur: 'kok', kaynakId: null }, { kaynakTur: 'firma', kaynakId: 4 }, { kaynakTur: 'siparis', kaynakId: 9 }]), { firmaId: 4, projeId: null });
    assert.deepEqual(kayitSecimiCoz([{ kaynakTur: 'firmasiz-projeler', kaynakId: null }, { kaynakTur: 'proje', kaynakId: 3 }, { kaynakTur: null, kaynakId: null }]), { firmaId: null, projeId: 3 });
  });

  test('OD-32 yazılan ad dosya adıyla aynı (harf duyarsız, kenar boşluğu sayılmaz); OD-33 kendi isteği onaylanmaz, yalnız isteyen geri çeker', () => {
    assert.equal(silmeAdiUyarMi('  ORN-İŞ.pdf ', 'orn-iş.pdf'), true);
    assert.equal(silmeAdiUyarMi('ORN-is.pdf', 'ORN-iş.pdf'), false);
    assert.equal(silmeOnaylayabilirMi(1, 1), false);
    assert.equal(silmeOnaylayabilirMi(1, 2), true);
    assert.equal(silmeGeriCekebilirMi(1, 1), true);
    assert.equal(silmeGeriCekebilirMi(1, 2), false);
  });
});

describe('kalıcı silme, dört göz, müşteri ve proje (kart 3443; gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Oturum;
  let birinci: Oturum;
  let ikinci: Oturum;
  let gorur: Oturum;
  const rolId = new Map<string, number>();
  let sayac = 0;
  let klasor: Klasor;
  let gizli: Klasor;
  let musteri: number;
  let baskaMusteri: number;
  let tedarikci: number;
  let proje: number;
  let baskaProje: number;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const gonder = (o: Oturum, yol: string, govde: unknown = {}): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: o.cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
  const oku = (o: Oturum, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: o.cerez } });

  async function rolAc(kod: string): Promise<void> {
    const r = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    assert.ok(r);
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'sayfa.ortak-dosyalar')", [r.id]);
    rolId.set(kod, r.id);
  }
  async function girisYap(rolKodu: string): Promise<Oturum> {
    const kullaniciAdi = `silme-${(sayac += 1)}`;
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
  async function klasorAc(ustId: number | null, ad: string): Promise<Klasor> {
    const c = await gonder(yonetici, '/ortak-dosyalar/klasorler', { ustId, ad });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<Klasor>();
  }
  async function yetkiVer(klasorId: number, satirlar: Record<string, 'gorur' | 'ekler' | 'yonetir'>): Promise<void> {
    const once = (await oku(yonetici, `/ortak-dosyalar/klasorler/${klasorId}/yetki`)).json<YetkiCevabi>();
    const c = await gonder(yonetici, `/ortak-dosyalar/klasorler/${klasorId}/yetki`, {
      surum: once.surum, ozelYetki: true, satirlar: Object.entries(satirlar).map(([kod, duzey]) => ({ rolId: rolId.get(kod) ?? 0, duzey })),
    });
    assert.equal(c.statusCode, 200, c.body);
  }
  async function yukle(o: Oturum, klasorId: number, ad: string, ek: Record<string, unknown> = {}): Promise<LightMyRequestResponse> {
    const icerik = pdf();
    const ozet = ozetOf(icerik);
    const p = await app.inject({
      method: 'POST', url: `/api/dosyalar/${ozet}/parca`, payload: { sira: 0, toplam: 1, veri: icerik.toString('base64') }, headers: { cookie: o.cerez },
    });
    assert.equal(p.statusCode, 200, p.body);
    return gonder(o, `/ortak-dosyalar/klasorler/${klasorId}/yukle`, { ad, ozet, ...ek });
  }
  // Yüklenip arşive kaldırılmış dosya; dönen satır arşivdeki sürümüyle.
  async function arsivdeDosya(ad: string, k: Klasor = klasor): Promise<OrtakDosya> {
    const y = await yukle(yonetici, k.id, ad);
    assert.equal(y.statusCode, 200, y.body);
    const d = y.json<OrtakDosya>();
    const a = await gonder(yonetici, `/ortak-dosyalar/klasorler/${k.id}/dosyalar/${d.id}/arsivle`, { surum: d.surum });
    assert.equal(a.statusCode, 200, a.body);
    return a.json<OrtakDosya>();
  }
  const yol = (d: OrtakDosya, eylem: string): string => `/ortak-dosyalar/klasorler/${d.klasorId}/dosyalar/${d.id}/${eylem}`;
  async function dortGoz(acik: boolean): Promise<void> {
    const c = await gonder(yonetici, `/ayarlar/${AYAR}/degistir`, { deger: acik });
    assert.equal(c.statusCode, 200, c.body);
    // Arşiv ekranı düğmeyi bu alana göre seçer.
    assert.equal((await oku(birinci, '/ortak-dosyalar/arsiv')).json<ArsivCevabi>().silmeDortGoz, acik);
  }
  const arsivdeki = async (o: Oturum, onayBekleyen = false): Promise<OrtakDosya[]> =>
    (await oku(o, `/ortak-dosyalar/arsiv${onayBekleyen ? '?onayBekleyen=true' : ''}`)).json<ArsivCevabi>().dosyalar;
  const dosyaVarMi = async (id: number): Promise<boolean> => (await vt().tek('SELECT 1 FROM ortak_dosyalar_dosya WHERE id = $1', [id])) !== null;

  before(async () => {
    ortam = await testVeritabaniKur('ortak_dosyalar_silme');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const ilkId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'silme-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'silme-yonetici', parola: PAROLA } });
    yonetici = { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id: ilkId };
    await rolAc('deneme_birinci');
    await rolAc('deneme_ikinci');
    await rolAc('deneme_gorur');
    birinci = await girisYap('deneme_birinci');
    ikinci = await girisYap('deneme_ikinci');
    gorur = await girisYap('deneme_gorur');
    klasor = await klasorAc(null, 'Teknik');
    gizli = await klasorAc(null, 'Yönetim');
    await yetkiVer(klasor.id, { deneme_birinci: 'yonetir', deneme_ikinci: 'yonetir', deneme_gorur: 'gorur' });
    const firma = async (ad: string, tur: string) =>
      (await vt().tek<{ id: number }>('INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ($1, $2, $3) RETURNING id', [ad, tur, ilkId]))!.id;
    musteri = await firma('ORN Musteri A', 'musteri');
    baskaMusteri = await firma('ORN Musteri B', 'ikisi');
    tedarikci = await firma('ORN Tedarik', 'tedarikci');
    const prj = async (kod: string, firmaId: number) =>
      (await vt().tek<{ id: number }>('INSERT INTO projeler_proje (kod, ad, firma_id, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING id', [kod, 'Deneme proje', firmaId, ilkId]))!.id;
    proje = await prj('ORN.PRJ1', musteri);
    baskaProje = await prj('ORN.PRJ2', baskaMusteri);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('OD-30 yüklemede müşteri ve proje: doğrulanır, müşteri boşsa projeninki yazılır, yeni sürüm değiştirmez; Son eklenenler süzülür', async () => {
    const tedarikciRet = await yukle(birinci, klasor.id, 'ORN-a.pdf', { firmaId: tedarikci });
    assert.equal(tedarikciRet.statusCode, 400, tedarikciRet.body);
    assert.match(tedarikciRet.body, new RegExp(ILETILER.musteriDegil));
    const uyumsuz = await yukle(birinci, klasor.id, 'ORN-a.pdf', { firmaId: musteri, projeId: baskaProje });
    assert.equal(uyumsuz.statusCode, 400, uyumsuz.body);
    assert.equal((await yukle(birinci, klasor.id, 'ORN-a.pdf', { firmaId: 999999 })).statusCode, 400);
    assert.equal((await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM ortak_dosyalar_dosya WHERE ad = 'ORN-a.pdf'"))?.n, 0);

    const a = await yukle(birinci, klasor.id, 'ORN-a.pdf', { firmaId: musteri, projeId: proje });
    assert.equal(a.statusCode, 200, a.body);
    assert.deepEqual([a.json<OrtakDosya>().firma?.ad, a.json<OrtakDosya>().proje?.kod], ['ORN Musteri A', 'ORN.PRJ1']);
    const b = await yukle(birinci, klasor.id, 'ORN-b.pdf', { firmaId: null, projeId: baskaProje });
    assert.equal(b.statusCode, 200, b.body);
    assert.equal(b.json<OrtakDosya>().firma?.id, baskaMusteri);
    const yeniSurum = await yukle(birinci, klasor.id, 'ORN-a.pdf', { firmaId: baskaMusteri, projeId: null });
    assert.equal(yeniSurum.statusCode, 200, yeniSurum.body);
    assert.equal(yeniSurum.json<OrtakDosya>().firma?.id, musteri);
    assert.equal(yeniSurum.json<OrtakDosya>().surumSirasi, 2);

    const suzulen = (await oku(birinci, `/ortak-dosyalar/son-eklenenler?firmaId=${musteri}`)).json<DosyaListesiCevabi>().dosyalar.map((d) => d.ad);
    assert.deepEqual(suzulen, ['ORN-a.pdf']);
    const projeyle = (await oku(birinci, `/ortak-dosyalar/son-eklenenler?projeId=${baskaProje}`)).json<DosyaListesiCevabi>().dosyalar.map((d) => d.ad);
    assert.deepEqual(projeyle, ['ORN-b.pdf']);
    const liste = (await oku(gorur, `/ortak-dosyalar/klasorler/${klasor.id}/dosyalar`)).json<DosyalarCevabi>();
    assert.equal(liste.kayitSecimi, null);
    assert.equal(liste.dosyalar.find((d) => d.ad === 'ORN-b.pdf')?.proje?.kod, 'ORN.PRJ2');
  });

  test('OD-30 seçici: yalnız müşteri ve ikisi türü etkin firmalar; projeler müşteriye göre süzülür; sayfasız kişi 403', async () => {
    const m = (await oku(gorur, '/ortak-dosyalar/secim/musteriler?q=ORN')).json<SecimCevabi>();
    assert.deepEqual(m.sonuclar.map((x) => x.ad).sort(), ['ORN Musteri A', 'ORN Musteri B']);
    const p = (await oku(gorur, `/ortak-dosyalar/secim/projeler?firmaId=${musteri}`)).json<SecimCevabi>();
    assert.deepEqual(p.sonuclar.map((x) => x.kod), ['ORN.PRJ1']);
    // Önce proje seçilirse müşteri dolsun diye projenin müşterisi `ust`te gelir.
    assert.equal(p.sonuclar[0]?.ust?.id, musteri);
    const ara = (await oku(gorur, '/ortak-dosyalar/secim/projeler?q=prj2')).json<SecimCevabi>();
    assert.deepEqual(ara.sonuclar.map((x) => x.kod), ['ORN.PRJ2']);
    const r = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('deneme_sayfasiz', 'deneme_sayfasiz') RETURNING id");
    rolId.set('deneme_sayfasiz', r!.id);
    const sayfasiz = await girisYap('deneme_sayfasiz');
    assert.equal((await oku(sayfasiz, '/ortak-dosyalar/secim/musteriler')).statusCode, 403);
  });

  test('OD-31 kayda bağlı klasörde müşteri ve proje klasörden yazılır; gönderilen değer yok sayılır', async () => {
    const kok = await vt().tx((db) => kokAc(db, { id: yonetici.id, islemler: [] } as never));
    assert.ok(kok.kok);
    const z = { tur: 'proje' as const, firma: { id: musteri, kod: null, ad: 'ORN Musteri A' }, siparis: null, proje: { id: proje, kod: 'ORN.PRJ1', ad: 'Deneme proje' } };
    assert.ok((await vt().tx((db) => kayitKlasoruAc(db, yonetici.id, z))).tamam);
    const pk = await vt().tek<{ id: number }>("SELECT id FROM ortak_dosyalar_klasor WHERE kaynak_tur = 'proje' AND kaynak_id = $1", [proje]);
    assert.ok(pk);
    const liste = (await oku(yonetici, `/ortak-dosyalar/klasorler/${pk.id}/dosyalar`)).json<DosyalarCevabi>();
    assert.deepEqual(liste.kayitSecimi, { firma: { id: musteri, ad: 'ORN Musteri A' }, proje: { id: proje, kod: 'ORN.PRJ1', ad: 'Deneme proje' } });
    const y = await yukle(yonetici, pk.id, 'ORN-kayitli.pdf', { firmaId: baskaMusteri, projeId: baskaProje });
    assert.equal(y.statusCode, 200, y.body);
    assert.deepEqual([y.json<OrtakDosya>().firma?.id, y.json<OrtakDosya>().proje?.id], [musteri, proje]);
  });

  test('OD-34 kalıcı silme (dört göz kapalı): yalnız arşivde, Yönetir ister, ad yazılır; sürümler ve bağlar kalkar, defter ve denetim kalır', async () => {
    const y = await yukle(birinci, klasor.id, 'ORN-sil.pdf');
    const etkin = y.json<OrtakDosya>();
    const arsivde = await gonder(birinci, yol(etkin, 'kalici-sil'), { surum: etkin.surum, ad: etkin.ad });
    assert.equal(arsivde.statusCode, 409, arsivde.body);
    assert.match(arsivde.body, new RegExp(ILETILER.silmeArsivde));
    const d = await arsivdeDosya('ORN-sil-2.pdf');
    const surumId = (await vt().tek<{ id: number }>('SELECT id FROM ortak_dosyalar_surum WHERE dosya_id = $1', [d.id]))!.id;
    assert.equal((await gonder(gorur, yol(d, 'kalici-sil'), { surum: d.surum, ad: d.ad })).statusCode, 403);
    assert.equal((await gonder(birinci, `/ortak-dosyalar/klasorler/${gizli.id}/dosyalar/${d.id}/kalici-sil`, { surum: d.surum, ad: d.ad })).statusCode, 404);
    const yanlisAd = await gonder(birinci, yol(d, 'kalici-sil'), { surum: d.surum, ad: 'baska.pdf' });
    assert.equal(yanlisAd.statusCode, 400, yanlisAd.body);
    assert.equal((await gonder(birinci, yol(d, 'kalici-sil'), { surum: d.surum + 5, ad: d.ad })).statusCode, 409);
    assert.equal(await dosyaVarMi(d.id), true);

    const c = await gonder(birinci, yol(d, 'kalici-sil'), { surum: d.surum, ad: ` ${d.ad.toLocaleUpperCase('tr-TR')} ` });
    assert.equal(c.statusCode, 204, c.body);
    assert.equal(await dosyaVarMi(d.id), false);
    assert.equal((await vt().tek('SELECT 1 FROM ortak_dosyalar_surum WHERE dosya_id = $1', [d.id])), null);
    assert.equal((await vt().tek("SELECT 1 FROM dosya_bagi WHERE modul = 'ortak-dosyalar' AND kayit = $1", [String(surumId)])), null);
    const defter = await vt().tek<{ durum: string; dort_goz: boolean; sonuclayan_kisi_id: number; surum_sayisi: number }>(
      'SELECT durum, dort_goz, sonuclayan_kisi_id, surum_sayisi FROM ortak_dosyalar_silme WHERE dosya_id = $1', [d.id],
    );
    assert.deepEqual(defter, { durum: 'silindi', dort_goz: false, sonuclayan_kisi_id: birinci.id, surum_sayisi: 1 });
    const iz = await vt().tek<{ ek: unknown }>("SELECT govde->'_ek' AS ek FROM denetim_kaydi WHERE yol LIKE '%kalici-sil' AND kisi_id = $1 ORDER BY id DESC LIMIT 1", [birinci.id]);
    assert.match(JSON.stringify(iz?.ek), /kalici-sil/);
    assert.match(JSON.stringify(iz?.ek), /"islem":"kaldir"/);
    const gecmis = (await oku(gorur, `/ortak-dosyalar/klasorler/${klasor.id}/gecmis`)).json<GecmisCevabi>().olaylar;
    assert.ok(gecmis.some((o) => o.olay === 'silindi' && o.dosyaAdi === 'ORN-sil-2.pdf'));
    // Aynı adla yeniden yükleme yeni dosyadır.
    assert.equal((await yukle(birinci, klasor.id, 'ORN-sil-2.pdf')).json<OrtakDosya>().surumSirasi, 1);
  });

  test('OD-35 aynı içerik başka bağda kalır: silinen dosyanın içeriği başka dosyada kullanılıyorsa dosya deposundan düşmez', async () => {
    const icerik = pdf();
    const ozet = ozetOf(icerik);
    await app.inject({ method: 'POST', url: `/api/dosyalar/${ozet}/parca`, payload: { sira: 0, toplam: 1, veri: icerik.toString('base64') }, headers: { cookie: yonetici.cerez } });
    const a = (await gonder(yonetici, `/ortak-dosyalar/klasorler/${klasor.id}/yukle`, { ad: 'ORN-ortak-1.pdf', ozet })).json<OrtakDosya>();
    const b = await gonder(yonetici, `/ortak-dosyalar/klasorler/${klasor.id}/yukle`, { ad: 'ORN-ortak-2.pdf', ozet });
    assert.equal(b.statusCode, 200, b.body);
    const ar = (await gonder(yonetici, yol(a, 'arsivle'), { surum: a.surum })).json<OrtakDosya>();
    assert.equal((await gonder(yonetici, yol(ar, 'kalici-sil'), { surum: ar.surum, ad: ar.ad })).statusCode, 204);
    const baglar = await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM dosya_bagi WHERE ozet = $1', [ozet]);
    assert.equal(baglar?.n, 1);
    const indir = await oku(yonetici, `/ortak-dosyalar/klasorler/${klasor.id}/dosyalar/${b.json<OrtakDosya>().id}/surumler/1/dosya`);
    assert.equal(indir.statusCode, 200);
  });

  test('OD-36 dört göz açık: doğrudan silme 409; istek, kendi isteği onaylanamaz, ikinci kişi ad yazarak siler; ret ve geri çekme', async () => {
    // K1: ayarı Yönetir düzeyi değil, ayar yazma işlemi değiştirir.
    assert.equal((await gonder(birinci, `/ayarlar/${AYAR}/degistir`, { deger: true })).statusCode, 403);
    await dortGoz(true);
    assert.equal((await oku(yonetici, '/ortak-dosyalar/ayarlar')).json<AyarlarCevabi>().silmeDortGoz, true);
    const d = await arsivdeDosya('ORN-dort-goz.pdf');
    const dogrudan = await gonder(birinci, yol(d, 'kalici-sil'), { surum: d.surum, ad: d.ad });
    assert.equal(dogrudan.statusCode, 409, dogrudan.body);
    assert.match(dogrudan.body, new RegExp(ILETILER.silmeDortGozAcik));
    assert.equal((await gonder(gorur, yol(d, 'silme-iste'), { surum: d.surum })).statusCode, 403);

    const istek = await gonder(birinci, yol(d, 'silme-iste'), { surum: d.surum });
    assert.equal(istek.statusCode, 200, istek.body);
    assert.equal(istek.json<OrtakDosya>().silmeIstegi?.kendi, true);
    assert.equal((await gonder(ikinci, yol(d, 'silme-iste'), { surum: d.surum })).statusCode, 409);
    const bekleyen = await arsivdeki(ikinci, true);
    assert.deepEqual(bekleyen.map((x) => [x.ad, x.silmeIstegi?.kendi]), [['ORN-dort-goz.pdf', false]]);

    const kendi = await gonder(birinci, yol(d, 'silme-onayla'), { surum: d.surum, ad: d.ad });
    assert.equal(kendi.statusCode, 403, kendi.body);
    assert.match(kendi.body, new RegExp(ILETILER.silmeKendiIstegi));
    assert.equal((await gonder(gorur, yol(d, 'silme-onayla'), { surum: d.surum, ad: d.ad })).statusCode, 403);
    assert.equal((await gonder(ikinci, yol(d, 'silme-onayla'), { surum: d.surum, ad: 'yanlis.pdf' })).statusCode, 400);
    assert.equal((await gonder(ikinci, yol(d, 'silme-geri-cek'), { surum: d.surum })).statusCode, 403);
    const onay = await gonder(ikinci, yol(d, 'silme-onayla'), { surum: d.surum, ad: d.ad });
    assert.equal(onay.statusCode, 204, onay.body);
    assert.equal(await dosyaVarMi(d.id), false);
    const defter = await vt().tek<{ durum: string; isteyen_kisi_id: number; sonuclayan_kisi_id: number }>(
      'SELECT durum, isteyen_kisi_id, sonuclayan_kisi_id FROM ortak_dosyalar_silme WHERE dosya_id = $1', [d.id],
    );
    assert.deepEqual(defter, { durum: 'silindi', isteyen_kisi_id: birinci.id, sonuclayan_kisi_id: ikinci.id });

    const r = await arsivdeDosya('ORN-ret.pdf');
    assert.equal((await gonder(birinci, yol(r, 'silme-iste'), { surum: r.surum })).statusCode, 200);
    const ret = await gonder(ikinci, yol(r, 'silme-reddet'), { surum: r.surum });
    assert.equal(ret.statusCode, 200, ret.body);
    assert.equal(ret.json<OrtakDosya>().silmeIstegi, null);
    assert.equal((await gonder(birinci, yol(r, 'silme-iste'), { surum: r.surum })).statusCode, 200);
    assert.equal((await gonder(birinci, yol(r, 'silme-geri-cek'), { surum: r.surum })).statusCode, 200);
    assert.equal(await dosyaVarMi(r.id), true);
    const gecmis = (await oku(gorur, `/ortak-dosyalar/klasorler/${klasor.id}/gecmis`)).json<GecmisCevabi>().olaylar.map((o) => o.olay);
    for (const o of ['silme-istendi', 'silindi', 'silme-reddedildi', 'silme-geri-cekildi'] as const) assert.ok(gecmis.includes(o), o);
    await dortGoz(false);
  });

  test('OD-37 istek beklerken: arşivden geri alma isteği düşürür; ayar kapatılınca açık istek kalır, doğrudan silme 409, onay sürer', async () => {
    await dortGoz(true);
    const g = await arsivdeDosya('ORN-geri.pdf');
    assert.equal((await gonder(birinci, yol(g, 'silme-iste'), { surum: g.surum })).statusCode, 200);
    const cik = await gonder(ikinci, yol(g, 'arsivden-cikar'), { surum: g.surum });
    assert.equal(cik.statusCode, 200, cik.body);
    assert.equal(cik.json<OrtakDosya>().silmeIstegi, null);
    assert.equal((await vt().tek<{ durum: string }>('SELECT durum FROM ortak_dosyalar_silme WHERE dosya_id = $1', [g.id]))?.durum, 'dustu');

    const k = await arsivdeDosya('ORN-kapat.pdf');
    assert.equal((await gonder(birinci, yol(k, 'silme-iste'), { surum: k.surum })).statusCode, 200);
    await dortGoz(false);
    const dogrudan = await gonder(ikinci, yol(k, 'kalici-sil'), { surum: k.surum, ad: k.ad });
    assert.equal(dogrudan.statusCode, 409, dogrudan.body);
    assert.match(dogrudan.body, new RegExp(ILETILER.silmeIstegiVar));
    assert.equal((await gonder(birinci, yol(k, 'silme-iste'), { surum: k.surum })).statusCode, 409);
    assert.equal((await gonder(ikinci, yol(k, 'silme-onayla'), { surum: k.surum, ad: k.ad })).statusCode, 204);
  });

  test('OD-38 kısıtlar: açık istek tekil, dört gözde isteyen onaylayamaz, tek kişi silmesi kendisi', async () => {
    const ekle = (sql: string) => vt().sorgu(sql, [klasor.id, yonetici.id, birinci.id]).then(() => null, (h: { constraint?: string }) => h.constraint ?? 'hata');
    assert.equal(await ekle("INSERT INTO ortak_dosyalar_silme (klasor_id, dosya_id, dosya_adi, dosya_surumu, dort_goz, isteyen_kisi_id, durum, sonuclayan_kisi_id, sonuc_zamani) VALUES ($1, 900, 'x', 1, true, $2, 'silindi', $2, now()) RETURNING $3::int"), 'ortak_dosyalar_silme_dort_goz');
    assert.equal(await ekle("INSERT INTO ortak_dosyalar_silme (klasor_id, dosya_id, dosya_adi, dosya_surumu, dort_goz, isteyen_kisi_id, durum, sonuclayan_kisi_id, sonuc_zamani) VALUES ($1, 901, 'x', 1, false, $2, 'silindi', $3, now())"), 'ortak_dosyalar_silme_tek_kisi');
    assert.equal(await ekle("INSERT INTO ortak_dosyalar_silme (klasor_id, dosya_id, dosya_adi, dosya_surumu, dort_goz, isteyen_kisi_id, durum) VALUES ($1, 902, 'x', 1, true, $2, 'acik') RETURNING $3::int"), null);
    assert.equal(await ekle("INSERT INTO ortak_dosyalar_silme (klasor_id, dosya_id, dosya_adi, dosya_surumu, dort_goz, isteyen_kisi_id, durum) VALUES ($1, 902, 'x', 1, true, $3, 'acik') RETURNING $2::int"), 'ortak_dosyalar_silme_acik_tekil');
  });
});
