import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type { KmDegisiklikCevabi, KmDosyaCevabi, KmOzetCevabi, KmSurumCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ozet as disaridanOzet } from './disari.ts';

const PAROLA = 'dogru-parola-1';
type Yontem = 'GET' | 'POST';

// Kalite yazar ve onaylar, müdür onaylar ama kayıt yazmaz (kullanıcı kararları 139 a, 160 a); satırlar göçte de vardır.
const ROL_ISLEMLERI: [string, string[]][] = [
  ['kalite', ['kalite-merkezi.oku', 'kalite-merkezi.yaz']],
  // Müdürde onay var, kayıt yazma yok: onay ucu içeriği de yazdığı için ikisini birlikte ister.
  ['mudur', ['kalite-merkezi.oku', 'kalite-merkezi.onayla']],
];

describe('Kalite Merkezi (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const c: Record<'yon' | 'kal' | 'mud' | 'opr', string> = { yon: '', kal: '', mud: '', opr: '' };
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerezi: string, yontem: Yontem, url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerezi }, ...(govde === undefined ? {} : { payload: govde as object }) });
  async function tamam<T>(cerezi: string, yontem: Yontem, url: string, govde?: unknown): Promise<T> {
    const r = await istek(cerezi, yontem, url, govde);
    assert.equal(r.statusCode, 200, `${yontem} ${url}: ${r.body}`);
    return r.json() as T;
  }
  async function ret(durum: number, kod: string, cerezi: string, yontem: Yontem, url: string, govde?: unknown): Promise<void> {
    const r = await istek(cerezi, yontem, url, govde);
    assert.deepEqual({ durum: r.statusCode, kod: (r.json() as { kod?: string }).kod }, { durum, kod }, `${yontem} ${url}: ${r.body}`);
  }
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string, aktor?: number): Promise<{ id: number; cerez: string }> {
    const yoneticiRolu = await rolId('yonetici');
    const hedef = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedef !== yoneticiRolu && aktor !== undefined) {
        await rolAta(db, aktor, yeni, hedef);
        await rolAl(db, aktor, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return { id, cerez: String(r.headers['set-cookie']).split(';')[0] ?? '' };
  }
  const yaz = (cerezi: string, koleksiyon: string, kimlik: string, govde: Record<string, unknown>, surum: number | null = null) =>
    tamam<KmSurumCevabi>(cerezi, 'POST', `/kalite-merkezi/kayitlar/${koleksiyon}/${kimlik}/yaz`, { govde, surum });
  const onayla = (cerezi: string, koleksiyon: string, kimlik: string, govde: Record<string, unknown>, surum: number | null = null) =>
    tamam<KmSurumCevabi>(cerezi, 'POST', `/kalite-merkezi/kayitlar/${koleksiyon}/${kimlik}/onayla`, { govde, surum });
  const sil = (cerezi: string, koleksiyon: string, kimlik: string, surum: number | null) =>
    tamam<KmSurumCevabi>(cerezi, 'POST', `/kalite-merkezi/kayitlar/${koleksiyon}/${kimlik}/sil`, { surum });
  const akis = (cerezi: string, sonra = 0) => tamam<KmDegisiklikCevabi>(cerezi, 'GET', `/kalite-merkezi/degisiklikler?sonra=${sonra}`);
  const govdesi = (a: KmDegisiklikCevabi, koleksiyon: string, kimlik: string) =>
    a.degisiklikler.filter((d) => d.koleksiyon === koleksiyon && d.kimlik === kimlik).map((d) => d.govde);

  before(async () => {
    ortam = await testVeritabaniKur('kalite_merkezi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    for (const [rol, islemler] of ROL_ISLEMLERI) {
      for (const islem of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ((SELECT id FROM rol WHERE kod = $1), $2) ON CONFLICT DO NOTHING', [rol, islem]);
    }
    const yon = await girisYap('km-yon', 'yonetici');
    c.yon = yon.cerez;
    for (const [k, ad, rol] of [['kal', 'km-kal', 'kalite'], ['mud', 'km-mud', 'mudur'], ['opr', 'km-opr', 'operator']] as const) {
      c[k] = (await girisYap(ad, rol, yon.id)).cerez;
    }
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('yetki: okuma okuma işlemini, yazma yazma işlemini ister; işlemi olmayan rol iki uçtan da 403 alır', async () => {
    await ret(403, 'YETKI_YOK', c.opr, 'GET', '/kalite-merkezi/degisiklikler');
    await ret(403, 'YETKI_YOK', c.opr, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_y1/yaz', { govde: { no: 'NCR-1' }, surum: null });
    await ret(403, 'YETKI_YOK', c.mud, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_y1/yaz', { govde: { no: 'NCR-1' }, surum: null });
    await yaz(c.kal, 'ncr', 'ncr_y1', { no: 'NCR-1' });
    assert.deepEqual(govdesi(await akis(c.mud), 'ncr', 'ncr_y1'), [{ no: 'NCR-1' }]);
    await ret(401, 'OTURUM_YOK', '', 'GET', '/kalite-merkezi/degisiklikler');
  });

  // 320 a: kapanışın parti listesi onay işlemiyle açılır; parti başına miktar onay ucundan servise gider.
  test('kısmi serbest bırakma: parti listesi onay yetkisi ister; onay ucu miktarları işler, NCR\'nin olmayan partisi kapanışı yazdırmaz', async () => {
    await ret(403, 'YETKI_YOK', c.opr, 'GET', '/kalite-merkezi/ncr/ncr_kb1/karantina-partileri');
    assert.deepEqual(await tamam(c.mud, 'GET', '/kalite-merkezi/ncr/ncr_kb1/karantina-partileri'), { partiler: [] });
    const n = await yaz(c.kal, 'ncr', 'ncr_kb1', { no: 'NCR-KB1', durum: 'Açık' });
    await ret(400, 'DOGRULAMA', c.yon, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_kb1/onayla', {
      govde: { no: 'NCR-KB1', durum: 'Kapalı', mrb: 'Tamir' }, surum: n.surum, serbestMiktarlar: [{ partiId: 999999, miktar: '1' }],
    });
    assert.deepEqual(govdesi(await akis(c.kal), 'ncr', 'ncr_kb1'), [{ no: 'NCR-KB1', durum: 'Açık' }]);
  });

  test('değişiklik akışı: kayıt olduğu gibi döner, her yazma sürümü artırır, sonraki sürümler yalnız yenileri verir, silinen gövdesiz gelir', async () => {
    const ilk = await yaz(c.kal, 'parca', 'p_a1', { parcaNo: 'DENEME-1', ad: 'Mil', liste: [1, 2, { x: null }] });
    const ikinci = await yaz(c.kal, 'parca', 'p_a1', { parcaNo: 'DENEME-1', ad: 'Mil rev B' }, ilk.surum);
    assert.ok(ikinci.surum > ilk.surum);
    const tum = await akis(c.kal);
    assert.deepEqual(govdesi(tum, 'parca', 'p_a1'), [{ parcaNo: 'DENEME-1', ad: 'Mil rev B' }]);
    assert.equal(tum.surum, ikinci.surum);
    const baska = await yaz(c.kal, 'dev', 'd_a1', { kod: 'CHZ-1' });
    const yeni = await akis(c.kal, ikinci.surum);
    assert.deepEqual(yeni.degisiklikler, [{ koleksiyon: 'dev', kimlik: 'd_a1', govde: { kod: 'CHZ-1' }, surum: baska.surum }]);
    assert.equal(yeni.surum, baska.surum);
    const silindi = await sil(c.yon, 'dev', 'd_a1', baska.surum);
    assert.deepEqual((await akis(c.kal, baska.surum)).degisiklikler, [{ koleksiyon: 'dev', kimlik: 'd_a1', govde: null, surum: silindi.surum }]);
    // Olmayan kaydı silmek satır açmaz, akışı değiştirmez.
    const bos = await sil(c.yon, 'dev', 'olmayan', null);
    assert.equal(bos.surum, silindi.surum);
    assert.deepEqual((await akis(c.kal, silindi.surum)).degisiklikler, []);
    assert.equal((await akis(c.kal, silindi.surum)).surum, silindi.surum);
  });

  test('beklenen sürüm: zorunlu; arada yazılan ya da silinen kayıt 409 alır ve ezilmez; yok bilinen kayıt doluysa 409; olmayan sürümlü kayıt 404', async () => {
    await ret(400, 'DOGRULAMA', c.kal, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_s1/yaz', { govde: { no: 'NCR-S1' } });
    await ret(400, 'DOGRULAMA', c.kal, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_s1/sil');
    const ilk = await yaz(c.kal, 'ncr', 'ncr_s1', { no: 'NCR-S1', durum: 'Açık' });
    // İki kişi aynı sürümü açtı: önce kaydeden kazanır, ikincisi 409 alır, birincinin yazdığı yerinde kalır.
    const birinci = await yaz(c.kal, 'ncr', 'ncr_s1', { no: 'NCR-S1', durum: 'DÖF açıldı' }, ilk.surum);
    await ret(409, 'CAKISMA', c.yon, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_s1/yaz', { govde: { no: 'NCR-S1', durum: 'MRB değerlendirmesinde' }, surum: ilk.surum });
    await ret(409, 'CAKISMA', c.yon, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_s1/sil', { surum: ilk.surum });
    // Kaydı yok sanan (null) dolu kayda yazamaz ve silemez.
    await ret(409, 'CAKISMA', c.yon, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_s1/yaz', { govde: { no: 'başka' }, surum: null });
    await ret(409, 'CAKISMA', c.yon, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_s1/sil', { surum: null });
    assert.deepEqual(govdesi(await akis(c.kal), 'ncr', 'ncr_s1'), [{ no: 'NCR-S1', durum: 'DÖF açıldı' }]);
    const r = await istek(c.yon, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_s1/yaz', { govde: { no: 'x' }, surum: ilk.surum });
    assert.match((r.json() as { mesaj: string }).mesaj, /siz açtıktan sonra değiştirildi/);
    // Silinen kayda eski sürümle yazılamaz; silindiği bilinerek (null) yeniden açılabilir.
    const silindi = await sil(c.yon, 'ncr', 'ncr_s1', birinci.surum);
    await ret(409, 'CAKISMA', c.yon, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_s1/yaz', { govde: { no: 'eski' }, surum: birinci.surum });
    const yeniden = await yaz(c.yon, 'ncr', 'ncr_s1', { no: 'NCR-S1', durum: 'Açık' });
    assert.ok(yeniden.surum > silindi.surum);
    await ret(404, 'BULUNAMADI', c.kal, 'POST', '/kalite-merkezi/kayitlar/ncr/hic_yok/yaz', { govde: { no: 'x' }, surum: ilk.surum });
    await ret(404, 'BULUNAMADI', c.yon, 'POST', '/kalite-merkezi/kayitlar/ncr/hic_yok/sil', { surum: ilk.surum });
  });

  test('beklenen sürüm, eşzamanlı: aynı sürümle 6 yazmadan yalnız biri geçer, ötekiler 409', async () => {
    const ilk = await yaz(c.kal, 'capa', 'capa_es', { no: 'DOF-ES', sira: -1 });
    const cevaplar = await Promise.all(Array.from({ length: 6 }, (_, i) =>
      istek(c.kal, 'POST', '/kalite-merkezi/kayitlar/capa/capa_es/yaz', { govde: { no: 'DOF-ES', sira: i }, surum: ilk.surum })));
    const durumlar = cevaplar.map((r) => r.statusCode).sort();
    assert.deepEqual(durumlar, [200, 409, 409, 409, 409, 409]);
    const kazanan = cevaplar.findIndex((r) => r.statusCode === 200);
    assert.deepEqual(govdesi(await akis(c.kal), 'capa', 'capa_es'), [{ no: 'DOF-ES', sira: kazanan }]);
  });

  test('değişiklik izi: ilk yazım kabul, aynı kimliğe ikinci yazım 409, silme 403; satır veritabanında da değişmez', async () => {
    await yaz(c.kal, 'iz', 'iz_1', { islem: 'kayıt', col: 'ncr' });
    await ret(409, 'CAKISMA', c.kal, 'POST', '/kalite-merkezi/kayitlar/iz/iz_1/yaz', { govde: { islem: 'değişti' }, surum: null });
    await ret(403, 'YETKI_YOK', c.kal, 'POST', '/kalite-merkezi/kayitlar/iz/iz_1/sil', { surum: null });
    await assert.rejects(vt().sorgu("UPDATE kalite_merkezi_belge SET govde = '{}' WHERE koleksiyon = 'iz' AND kimlik = 'iz_1'"), /değiştirilemez/);
    await assert.rejects(vt().sorgu("DELETE FROM kalite_merkezi_belge WHERE koleksiyon = 'iz' AND kimlik = 'iz_1'"), /değiştirilemez/);
    assert.deepEqual(govdesi(await akis(c.kal), 'iz', 'iz_1'), [{ islem: 'kayıt', col: 'ncr' }]);
  });

  test('biçim: tanınmayan koleksiyon, bozuk kimlik ve nesne olmayan gövde 400; kısıt da veritabanında durur', async () => {
    await ret(400, 'DOGRULAMA', c.kal, 'POST', '/kalite-merkezi/kayitlar/kisi/k1/yaz', { govde: {}, surum: null });
    await ret(400, 'DOGRULAMA', c.kal, 'POST', `/kalite-merkezi/kayitlar/ncr/${encodeURIComponent('a b')}/yaz`, { govde: {}, surum: null });
    await ret(400, 'DOGRULAMA', c.kal, 'POST', '/kalite-merkezi/kayitlar/ncr/n1/yaz', { govde: [1, 2], surum: null });
    const kisi = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'km-kal'"))!.id;
    await assert.rejects(
      vt().sorgu("INSERT INTO kalite_merkezi_belge (koleksiyon, kimlik, govde, degistiren_id) VALUES ('ncr', 'a/b', '{}', $1)", [kisi]),
      /kalite_merkezi_belge_kimlik_bicimi/,
    );
    await assert.rejects(
      vt().sorgu("INSERT INTO kalite_merkezi_belge (koleksiyon, kimlik, govde, degistiren_id) VALUES ('ncr', 'n9', '[1]', $1)", [kisi]),
      /kalite_merkezi_belge_govde_nesne/,
    );
  });

  test('geri yükleme: ayrı işlem ister; son parçaya kadar eski kayıt silinmez, son parça yedekte olmayanı siler, iz korunur, yedekteki iz alınmaz', async () => {
    await yaz(c.kal, 'iz', 'iz_gy', { islem: 'önce' });
    await yaz(c.kal, 'sup', 's_eski', { ad: 'Eski tedarikçi' });
    const govde = { baslangic: null, son: false, belgeler: [{ koleksiyon: 'sup', kimlik: 's_yeni', govde: { ad: 'Yeni' } }, { koleksiyon: 'iz', kimlik: 'iz_gy', govde: { islem: 'sahte' } }] };
    await ret(403, 'YETKI_YOK', c.kal, 'POST', '/kalite-merkezi/geri-yukle', govde);
    const ilk = await tamam<{ baslangic: number }>(c.yon, 'POST', '/kalite-merkezi/geri-yukle', govde);
    // Sonraki parça gelmeden (düşen geri yükleme) eski kayıt yerinde durur.
    assert.deepEqual(govdesi(await akis(c.kal), 'sup', 's_eski'), [{ ad: 'Eski tedarikçi' }]);
    // Geri yükleme sürerken başkasının yazdığı kayıt son parçada silinmez.
    await yaz(c.kal, 'sup', 's_arada', { ad: 'Arada' });
    await tamam(c.yon, 'POST', '/kalite-merkezi/geri-yukle', { baslangic: ilk.baslangic, son: true, belgeler: [{ koleksiyon: 'ncr', kimlik: 'n_yeni', govde: { no: 'NCR-9' } }] });
    const a = await akis(c.kal);
    const dolu = a.degisiklikler.filter((d) => d.govde !== null).map((d) => `${d.koleksiyon}/${d.kimlik}`).sort();
    assert.deepEqual(dolu.filter((k) => !k.startsWith('iz/')), ['ncr/n_yeni', 'sup/s_arada', 'sup/s_yeni']);
    assert.deepEqual(govdesi(a, 'iz', 'iz_gy'), [{ islem: 'önce' }]);
    assert.deepEqual(govdesi(a, 'sup', 's_eski'), [null]);
  });

  test('dosya: ortak depoya yüklenen içerik uygulamanın dosya kimliğine bağlanır, ikili döner, yeniden bağlama eskisini kaldırır, silinince 404', async () => {
    const yukle = async (cerezi: string, icerik: Buffer): Promise<string> => {
      const ozet = createHash('sha256').update(icerik).digest('hex');
      await tamam(cerezi, 'POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
      return ozet;
    };
    const pdf = Buffer.from('%PDF-1.4\n% deneme resmi\n%%EOF\n');
    const ozet = await yukle(c.kal, pdf);
    await ret(403, 'YETKI_YOK', c.mud, 'POST', '/kalite-merkezi/dosyalar/f_1/bagla', { ozet, ad: 'resim.pdf' });
    const bag = await tamam<KmDosyaCevabi>(c.kal, 'POST', '/kalite-merkezi/dosyalar/f_1/bagla', { ozet, ad: 'resim.pdf' });
    assert.deepEqual(bag, { kimlik: 'f_1', ozet, boyut: pdf.length, tur: 'pdf' });
    const oku = await istek(c.mud, 'GET', '/kalite-merkezi/dosyalar/f_1');
    assert.equal(oku.statusCode, 200);
    assert.deepEqual(oku.rawPayload, pdf);
    await ret(403, 'YETKI_YOK', c.opr, 'GET', '/kalite-merkezi/dosyalar/f_1');
    const step = Buffer.from('ISO-10303-21;\nHEADER;\nENDSEC;\nEND-ISO-10303-21;\n');
    const ozet2 = await yukle(c.kal, step);
    await tamam(c.kal, 'POST', '/kalite-merkezi/dosyalar/f_1/bagla', { ozet: ozet2, ad: 'model.stp' });
    assert.deepEqual((await istek(c.kal, 'GET', '/kalite-merkezi/dosyalar/f_1')).rawPayload, step);
    // Başkasının yüklediği içerik bağlanamaz (özeti bilmek yetmez).
    await ret(400, 'DOGRULAMA', c.yon, 'POST', '/kalite-merkezi/dosyalar/f_2/bagla', { ozet: ozet2, ad: 'kopya.stp' });
    await tamam(c.kal, 'POST', '/kalite-merkezi/dosyalar/f_1/sil');
    await ret(404, 'BULUNAMADI', c.kal, 'GET', '/kalite-merkezi/dosyalar/f_1');
  });

  test('eşzamanlı yazmalar: her yazma ayrı sürüm alır ve akış sürüm sırasıyla gelir', async () => {
    const once = (await akis(c.kal)).surum;
    const cevaplar = await Promise.all(Array.from({ length: 8 }, (_, i) => yaz(c.kal, 'lot', `l_${i}`, { no: i })));
    const surumler = cevaplar.map((r) => r.surum);
    assert.equal(new Set(surumler).size, 8);
    const a = await akis(c.kal, once);
    assert.deepEqual(a.degisiklikler.map((d) => d.kimlik).sort(), Array.from({ length: 8 }, (_, i) => `l_${i}`).sort());
    assert.equal(a.surum, Math.max(...surumler));
  });

  // Yazanlar tabloyu kilitler (tek sıra). 100 kişinin aynı anda yazıp akışı okuması: hepsi geçer, sürümler tekil, akış tam;
  // süreler tanı satırına yazılır (ölçüm, eşik değil: makineden makineye değişir).
  test('100 eşzamanlı yazma ve okuma: hepsi geçer, sürümler tekil, akış eksiksiz; süre ölçülür', async (t) => {
    const once = (await akis(c.kal)).surum;
    const sureler: number[] = [];
    const basla = performance.now();
    const cevaplar = await Promise.all(Array.from({ length: 100 }, async (_, i) => {
      const t0 = performance.now();
      const r = await yaz(c.kal, 'lot', `yuz_${i}`, { no: i, not: 'x'.repeat(2000) });
      await akis(c.kal, once);
      sureler.push(performance.now() - t0);
      return r.surum;
    }));
    const toplam = performance.now() - basla;
    assert.equal(new Set(cevaplar).size, 100);
    const a = await akis(c.kal, once);
    assert.equal(a.degisiklikler.filter((d) => d.kimlik.startsWith('yuz_')).length, 100);
    assert.deepEqual(a.degisiklikler.map((d) => d.surum), [...a.degisiklikler.map((d) => d.surum)].sort((x, y) => x - y));
    sureler.sort((x, y) => x - y);
    const yuzde = (p: number): number => Math.round(sureler[Math.min(sureler.length - 1, Math.floor(sureler.length * p))]!);
    t.diagnostic(`100 kişi yaz+oku: toplam ${Math.round(toplam)} ms, kişi başı p50 ${yuzde(0.5)} ms, p95 ${yuzde(0.95)} ms, en çok ${yuzde(1)} ms`);
  });

  test('özet: açık uygunsuzluk "Kapalı" dışındaki dolu ncr kayıtlarıdır; okuma işlemi ister; disari.ts aynı sayıyı verir', async () => {
    await ret(403, 'YETKI_YOK', c.opr, 'GET', '/kalite-merkezi/ozet');
    await ret(401, 'OTURUM_YOK', '', 'GET', '/kalite-merkezi/ozet');
    const once = (await tamam<KmOzetCevabi>(c.mud, 'GET', '/kalite-merkezi/ozet')).acikUygunsuzluk;
    const oz1 = await yaz(c.kal, 'ncr', 'ncr_oz1', { no: 'NCR-OZ1', durum: 'Açık' });
    await yaz(c.kal, 'ncr', 'ncr_oz2', { no: 'NCR-OZ2', durum: 'DÖF açıldı' });
    await yaz(c.kal, 'ncr', 'ncr_oz3', { no: 'NCR-OZ3' });
    await onayla(c.yon, 'ncr', 'ncr_oz4', { no: 'NCR-OZ4', durum: 'Kapalı' });
    const oz5 = await yaz(c.kal, 'ncr', 'ncr_oz5', { no: 'NCR-OZ5', durum: 'Açık' });
    await sil(c.yon, 'ncr', 'ncr_oz5', oz5.surum);
    await yaz(c.kal, 'capa', 'capa_oz1', { no: 'DOF-OZ1', durum: 'Açık' });
    const sonra = await tamam<KmOzetCevabi>(c.mud, 'GET', '/kalite-merkezi/ozet');
    assert.equal(sonra.acikUygunsuzluk - once, 3);
    await onayla(c.yon, 'ncr', 'ncr_oz1', { no: 'NCR-OZ1', durum: 'Kapalı' }, oz1.surum);
    assert.equal((await tamam<KmOzetCevabi>(c.yon, 'GET', '/kalite-merkezi/ozet')).acikUygunsuzluk - once, 2);
    assert.deepEqual(await disaridanOzet(vt()), { acikUygunsuzluk: once + 2 });
  });

  // Kart #1583 ("Reddetsin"): onay ve kapanış genel kayıt yazmasıyla değişmez; onay ucu kendi işlemiyle yazar, kişi ve gün sunucudan.
  test('onay alanları: genel yazma onayı, kapanışı ve tedarikçi onayını reddeder, kayıt eski hâlinde kalır; serbest adımlar yazılır', async () => {
    const onayRet = async (koleksiyon: string, kimlik: string, govde: Record<string, unknown>, surum: number | null, alanlar: string[]) => {
      const r = await istek(c.kal, 'POST', `/kalite-merkezi/kayitlar/${koleksiyon}/${kimlik}/yaz`, { govde, surum });
      assert.equal(r.statusCode, 403, r.body);
      assert.deepEqual(r.json(), {
        kod: 'YETKI_YOK', mesaj: 'Onay ve kapanış alanları kayıt yazmayla değişmez; onay yetkisiyle kaydedilir.', alan: 'onay', ayrinti: { alanlar },
      });
    };
    // Form: dolduran taslak tutar ve onaya gönderir; onaylanmış ya da onaylayanı yazılmış form genel yazmayla girmez.
    const taslak = await yaz(c.kal, 'frm', 'frm_o1', { kod: 'F1', durum: 'Taslak', dolduran: 'Deneme' });
    const gonderildi = await yaz(c.kal, 'frm', 'frm_o1', { kod: 'F1', durum: 'Onay bekliyor', dolduran: 'Deneme' }, taslak.surum);
    await onayRet('frm', 'frm_o1', { kod: 'F1', durum: 'Onaylandı', dolduran: 'Deneme', onaylayan: 'Sahte', onayTarih: '2020-01-01' }, gonderildi.surum,
      ['durum', 'onaylayan', 'onayTarih']);
    await onayRet('frm', 'frm_o1', { kod: 'F1', durum: 'Taslak', dolduran: 'Deneme', onaylayan: 'Sahte', onayNot: 'iade' }, gonderildi.surum,
      ['onaylayan', 'onayNot']);
    await onayRet('frm', 'frm_o2', { kod: 'F2', durum: 'Onaylandı', dolduran: 'Deneme' }, null, ['durum']);
    // Uygunsuzluk ve DÖF: kapanmamış durumlar arasında yürür; kapatmak da yeniden açmak da onaydır.
    const ncr = await yaz(c.kal, 'ncr', 'ncr_o1', { no: 'NCR-O1', durum: 'Açık' });
    const mrb = await yaz(c.kal, 'ncr', 'ncr_o1', { no: 'NCR-O1', durum: 'MRB değerlendirmesinde' }, ncr.surum);
    await onayRet('ncr', 'ncr_o1', { no: 'NCR-O1', durum: 'Kapalı' }, mrb.surum, ['durum']);
    await onayRet('ncr', 'ncr_o2', { no: 'NCR-O2', durum: 'Kapalı' }, null, ['durum']);
    await onayRet('capa', 'capa_o1', { no: 'DOF-O1', durum: 'Kapalı' }, null, ['durum']);
    await onayRet('sup', 'sup_o1', { kod: 'TED-1', onay: 'Onaylı' }, null, ['onay']);
    const ted = await yaz(c.kal, 'sup', 'sup_o2', { kod: 'TED-2' });
    await onayRet('sup', 'sup_o2', { kod: 'TED-2', onay: 'Aday' }, ted.surum, ['onay']);
    // Onay alanı olmayan koleksiyonda aynı adlı alan serbesttir (iş emri kopyası).
    await yaz(c.kal, 'emir', 'emir_o1', { no: 'E1', durum: 'Kapalı' });
    const a = await akis(c.kal);
    assert.deepEqual(govdesi(a, 'frm', 'frm_o1'), [{ kod: 'F1', durum: 'Onay bekliyor', dolduran: 'Deneme' }]);
    assert.deepEqual(govdesi(a, 'ncr', 'ncr_o1'), [{ no: 'NCR-O1', durum: 'MRB değerlendirmesinde' }]);
    assert.deepEqual([govdesi(a, 'frm', 'frm_o2'), govdesi(a, 'ncr', 'ncr_o2'), govdesi(a, 'capa', 'capa_o1'), govdesi(a, 'sup', 'sup_o1')], [[], [], [], []]);
    assert.deepEqual(govdesi(a, 'sup', 'sup_o2'), [{ kod: 'TED-2' }]);
  });

  test('onay ucu: onay ve kayıt yazma işlemini ister; onaylayan ve gün sunucudan yazılır; değer uygulamanın seçeneklerinden olmalı', async () => {
    const t = await yaz(c.kal, 'frm', 'frm_o3', { kod: 'F3', durum: 'Onay bekliyor', dolduran: 'Deneme' });
    const onayGovdesi = { govde: { kod: 'F3', durum: 'Onaylandı', dolduran: 'Deneme', onaylayan: 'Sahte', onayTarih: '2020-01-01', onayNot: 'uygun' }, surum: t.surum };
    const yol = '/kalite-merkezi/kayitlar/frm/frm_o3/onayla';
    // Kayıt yazıp onay işlemi olmayan kişi: hiçbir rolde bu ikili yok, ek işlemle verilir.
    const yonId = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'km-yon'"))!.id;
    const yazan = await girisYap('km-yazan', 'operator', yonId);
    await vt().sorgu("INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'kalite-merkezi.oku', $2), ($1, 'kalite-merkezi.yaz', $2)", [yazan.id, yonId]);
    await ret(403, 'YETKI_YOK', yazan.cerez, 'POST', yol, onayGovdesi);
    await ret(403, 'YETKI_YOK', c.mud, 'POST', yol, onayGovdesi);
    await ret(403, 'YETKI_YOK', c.opr, 'POST', yol, onayGovdesi);
    await ret(401, 'OTURUM_YOK', '', 'POST', yol, onayGovdesi);
    await ret(400, 'DOGRULAMA', c.yon, 'POST', yol, { ...onayGovdesi, govde: { ...onayGovdesi.govde, durum: 'Onaylı say' } });
    await ret(400, 'DOGRULAMA', c.yon, 'POST', '/kalite-merkezi/kayitlar/cizim/c_o1/onayla', { govde: { durum: 'Kapalı' }, surum: null });
    const bugun = (await vt().tek<{ g: string }>("SELECT to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS g"))!.g;
    const onay = await tamam<KmSurumCevabi>(c.yon, 'POST', yol, onayGovdesi);
    assert.ok(onay.surum > t.surum);
    assert.deepEqual(govdesi(await akis(c.kal), 'frm', 'frm_o3'), [
      { kod: 'F3', durum: 'Onaylandı', dolduran: 'Deneme', onaylayan: 'Deneme km-yon', onayTarih: bugun, onayNot: 'uygun' },
    ]);
    // Onaylanan form genel yazmayla geri taslağa dönmez; onaylı içerik deftere tam girer (ne onaylandığı izlenir).
    await ret(403, 'YETKI_YOK', c.kal, 'POST', '/kalite-merkezi/kayitlar/frm/frm_o3/yaz', {
      govde: { kod: 'F3', durum: 'Taslak', dolduran: 'Deneme', onaylayan: 'Deneme km-yon', onayTarih: bugun, onayNot: 'uygun' }, surum: onay.surum,
    });
    const [d] = await vt().sorgu<{ govde: Record<string, unknown> }>(
      "SELECT govde FROM denetim_kaydi WHERE yol = '/kalite-merkezi/kayitlar/:koleksiyon/:kimlik/onayla' AND parametre->>'kimlik' = 'frm_o3' ORDER BY id DESC LIMIT 1",
    );
    assert.deepEqual(d?.govde, onayGovdesi);
    // Kapanış ve tedarikçi onayı aynı uçtan; beklenen sürüm kuralı aynıdır.
    const n = await yaz(c.kal, 'ncr', 'ncr_o3', { no: 'NCR-O3', durum: 'Açık' });
    await tamam(c.yon, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_o3/onayla', { govde: { no: 'NCR-O3', durum: 'Kapalı' }, surum: n.surum });
    await ret(409, 'CAKISMA', c.yon, 'POST', '/kalite-merkezi/kayitlar/ncr/ncr_o3/onayla', { govde: { no: 'NCR-O3', durum: 'Açık' }, surum: n.surum });
    await tamam(c.yon, 'POST', '/kalite-merkezi/kayitlar/sup/sup_o3/onayla', { govde: { kod: 'TED-3', onay: 'Onaylı' }, surum: null });
    const a = await akis(c.kal);
    assert.deepEqual([govdesi(a, 'ncr', 'ncr_o3'), govdesi(a, 'sup', 'sup_o3')], [[{ no: 'NCR-O3', durum: 'Kapalı' }], [{ kod: 'TED-3', onay: 'Onaylı' }]]);
  });

  // Kullanıcı kararı 16.10.2026 ("Kilitle"): onaylı form değişmez ve silinmez; değişiklik onay geri alınarak yapılır.
  test('onaylı form kilidi: yazma, onay ucu ve silme reddedilir; aynı gövde yeniden yazılır; onay geri alınınca form düzenlenir', async () => {
    const t = await yaz(c.kal, 'frm', 'frm_k1', { kod: 'FK', durum: 'Onay bekliyor', dolduran: 'Deneme', cevaplar: { a: 1 } });
    const onay = await onayla(c.yon, 'frm', 'frm_k1', { kod: 'FK', durum: 'Onaylandı', dolduran: 'Deneme', cevaplar: { a: 1 } }, t.surum);
    const onayli = govdesi(await akis(c.kal), 'frm', 'frm_k1')[0]!;
    const kilit = 'Onaylanmış form değiştirilemez ve silinemez; önce onayı geri alın.';
    const kilitRet = async (yol: string, govde: unknown) => {
      const r = await istek(c.yon, 'POST', `/kalite-merkezi/kayitlar/frm/frm_k1/${yol}`, govde);
      assert.deepEqual({ durum: r.statusCode, govde: r.json() }, { durum: 409, govde: { kod: 'CAKISMA', mesaj: kilit } }, r.body);
    };
    await kilitRet('yaz', { govde: { ...onayli, cevaplar: { a: 2 } }, surum: onay.surum });
    await kilitRet('onayla', { govde: { ...onayli, cevaplar: { a: 2 } }, surum: onay.surum });
    await kilitRet('onayla', { govde: { ...onayli, onayNot: 'sonradan' }, surum: onay.surum });
    await kilitRet('sil', { surum: onay.surum });
    // Alan sırası farklı aynı gövde değişiklik değildir (uygulama kaydı yayarak yeniden yazar).
    const ayni = await yaz(c.kal, 'frm', 'frm_k1', Object.fromEntries(Object.entries(onayli).reverse()), onay.surum);
    const gerial = await onayla(c.yon, 'frm', 'frm_k1', { ...onayli, durum: 'Taslak', onayNot: 'düzeltilecek' }, ayni.surum);
    const duzeltildi = await yaz(c.kal, 'frm', 'frm_k1', { ...govdesi(await akis(c.kal), 'frm', 'frm_k1')[0]!, cevaplar: { a: 2 } }, gerial.surum);
    assert.ok(duzeltildi.surum > gerial.surum);
    assert.deepEqual((govdesi(await akis(c.kal), 'frm', 'frm_k1')[0] as { durum: string; cevaplar: unknown }).cevaplar, { a: 2 });
  });

  // Kullanıcı kararı 17.10.2026 ("Eklensin"): onaylı formun onayı yalnız onay işlemiyle geri alınır; geri alan ve saat sunucudan.
  test('onay geri alma: onay işlemi ister, yalnız onaylı formda ve beklenen sürümle; form taslağa döner, geri alan ve saat yazılır', async () => {
    const t = await yaz(c.kal, 'frm', 'frm_g1', { kod: 'FG', durum: 'Onay bekliyor', dolduran: 'Deneme', cevaplar: { a: 1 } });
    const onay = await onayla(c.yon, 'frm', 'frm_g1', { kod: 'FG', durum: 'Onaylandı', dolduran: 'Deneme', cevaplar: { a: 1 } }, t.surum);
    const yol = '/kalite-merkezi/formlar/frm_g1/onay-geri-al';
    await ret(403, 'YETKI_YOK', c.opr, 'POST', yol, { surum: onay.surum });
    await ret(401, 'OTURUM_YOK', '', 'POST', yol, { surum: onay.surum });
    await ret(400, 'DOGRULAMA', c.yon, 'POST', yol, {});
    await ret(409, 'CAKISMA', c.yon, 'POST', yol, { surum: t.surum });
    await ret(404, 'BULUNAMADI', c.yon, 'POST', '/kalite-merkezi/formlar/frm_yok/onay-geri-al', { surum: onay.surum });
    // Müdürde onay işlemi var: kayıt yazma olmadan da geri alır (düğme onay yetkisi olana görünür).
    const once = Date.now();
    const geri = await tamam<KmSurumCevabi>(c.mud, 'POST', yol, { surum: onay.surum });
    assert.ok(geri.surum > onay.surum);
    const g = govdesi(await akis(c.kal), 'frm', 'frm_g1')[0] as Record<string, unknown>;
    assert.deepEqual({ ...g, guncelleme: undefined, onayGeriAlmaZamani: undefined }, {
      kod: 'FG', durum: 'Taslak', dolduran: 'Deneme', cevaplar: { a: 1 }, onayGeriAlan: 'Deneme km-mud', guncelleme: undefined, onayGeriAlmaZamani: undefined,
    });
    assert.match(String(g.onayGeriAlmaZamani), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.ok(Date.parse(String(g.guncelleme)) >= once - 1000);
    // Onaylı olmayan formda geri alınacak onay yok; geri alma alanları genel yazmayla ve onay ucuyla uydurulamaz.
    await ret(409, 'CAKISMA', c.yon, 'POST', yol, { surum: geri.surum });
    await ret(403, 'YETKI_YOK', c.kal, 'POST', '/kalite-merkezi/kayitlar/frm/frm_g1/yaz', { govde: { ...g, onayGeriAlan: 'Sahte' }, surum: geri.surum });
    const yeniden = await onayla(c.yon, 'frm', 'frm_g1', { ...g, durum: 'Onaylandı', onayGeriAlan: 'Sahte', onayGeriAlmaZamani: '2020-01-01 00:00' }, geri.surum);
    const son = govdesi(await akis(c.kal), 'frm', 'frm_g1')[0] as Record<string, unknown>;
    assert.ok(yeniden.surum > geri.surum);
    assert.deepEqual([son.durum, son.onaylayan, son.onayGeriAlan, son.onayGeriAlmaZamani], ['Onaylandı', 'Deneme km-yon', 'Deneme km-mud', g.onayGeriAlmaZamani]);
    // Geri alma tam denetimde: kim, hangi form, hangi sürüm.
    const [d] = await vt().sorgu<{ kisi: boolean; govde: unknown; parametre: unknown }>(
      "SELECT kisi_id IS NOT NULL AS kisi, govde, parametre FROM denetim_kaydi WHERE yol = '/kalite-merkezi/formlar/:kimlik/onay-geri-al' ORDER BY id DESC LIMIT 1",
    );
    assert.deepEqual(d, { kisi: true, govde: { surum: onay.surum }, parametre: { kimlik: 'frm_g1' } });
  });

  // KM-K85 (kullanıcı kararı 85) ve KM-K88 (262 a, 19.10.2026): kalibrasyonu geçersiz cihazla ölçüm sunucuda reddedilir; geçerliliği
  // yalnız kalibrasyon modülü verir (cihaz kodu = alet numarası). Uygulamanın kendi kalibrasyon tarihi sayılmaz.
  test('KM-K85 geçersiz cihaz: kalibrasyonda süresi dolmuş, kullanım dışı, kaydı olmayan ya da eşi olmayan cihazla yeni ölçüm 400; geçerli cihaz ve eski ölçüm yazılır', async () => {
    const bugun = tesisGunu(Date.now());
    const ikiYilOnce = `${Number(bugun.slice(0, 4)) - 2}${bugun.slice(4)}`;
    const { turler: [tur] } = await tamam<{ turler: { id: number }[] }>(c.yon, 'GET', '/olcu-aleti-turleri');
    const alet = (no: string, tarih?: string) => tamam<{ id: number }>(c.yon, 'POST', '/olcu-aletleri', {
      no, turId: tur!.id, periyotGun: 365, ...(tarih ? { ilkKalibrasyon: { tarih, sonuc: 'uygun' } } : {}),
    });
    await alet('K85-1', bugun);
    const eskiAlet = await alet('K85-2', bugun);
    await alet('K85-3', ikiYilOnce);
    const disi = await alet('K85-4', bugun);
    await tamam(c.yon, 'POST', `/olcu-aletleri/${disi.id}/kullanim-disi`, { neden: 'Kırık' });
    await alet('K85-5');
    // Uygulamanın tarihi ve bayrağı kalibrasyonun tersini söyler; sayılmaz.
    await yaz(c.kal, 'dev', 'dev_k85_gecerli', { kod: 'k85-1 ', ad: 'Kumpas', sonKal: ikiYilOnce, periyot: 12, kullanimDisi: true });
    await yaz(c.kal, 'dev', 'dev_k85_eski', { kod: 'K85-2', ad: 'Mikrometre', sonKal: bugun, periyot: 12 });
    await yaz(c.kal, 'dev', 'dev_k85_dolmus', { kod: 'K85-3', ad: 'Komparatör', sonKal: bugun, periyot: 12 });
    await yaz(c.kal, 'dev', 'dev_k85_disi', { kod: 'K85-4', ad: 'Mastar', sonKal: bugun, periyot: 12 });
    await yaz(c.kal, 'dev', 'dev_k85_kayitsiz', { kod: 'K85-5', ad: 'Mastar', sonKal: bugun, periyot: 12 });
    await yaz(c.kal, 'dev', 'dev_k85_essiz', { kod: 'K85-9', ad: 'Mastar', sonKal: bugun, periyot: 12 });
    const kar = (cihaz: string, olcum: string) => ({ balon: 1, ad: 'Çap', tip: 'Değişken', nominal: '10', alt: '0.1', ust: '0.1', olcum, cihaz });
    const yol = (kimlik: string) => `/kalite-merkezi/kayitlar/insp/${kimlik}/yaz`;
    for (const cihaz of ['dev_k85_dolmus', 'dev_k85_disi', 'dev_k85_kayitsiz', 'dev_k85_essiz', 'dev_k85_yok']) {
      const r = await istek(c.kal, 'POST', yol('insp_k85_red'), { govde: { no: 'MUA-K85', chars: [kar('dev_k85_gecerli', '10'), kar(cihaz, '10.01')] }, surum: null });
      assert.equal(r.statusCode, 400, `${cihaz}: ${r.body}`);
      assert.deepEqual(r.json(), { kod: 'DOGRULAMA', mesaj: 'Kalibrasyonu geçersiz cihazla ölçüm kaydedilemez.', alan: 'cihaz', ayrinti: { cihazlar: [cihaz] } });
    }
    assert.deepEqual(govdesi(await akis(c.kal), 'insp', 'insp_k85_red'), [], 'reddedilen muayene yazılmaz');
    // Geçerli cihazla ölçüm yazılır; alet kalibrasyonda sonradan kullanım dışı kalınca eski ölçüm aynen kalarak kayıt düzenlenir, yeni değer reddedilir.
    const ilk = await yaz(c.kal, 'insp', 'insp_k85', { no: 'MUA-K85', chars: [kar('dev_k85_eski', '10.02')] });
    await tamam(c.yon, 'POST', `/olcu-aletleri/${eskiAlet.id}/kullanim-disi`, { neden: 'Düşürüldü' });
    const duzeltme = await yaz(c.kal, 'insp', 'insp_k85', { no: 'MUA-K85', not: 'açıklama eklendi', chars: [kar('dev_k85_eski', '10.02')] }, ilk.surum);
    await ret(400, 'DOGRULAMA', c.kal, 'POST', yol('insp_k85'), { govde: { no: 'MUA-K85', chars: [kar('dev_k85_eski', '10.05')] }, surum: duzeltme.surum });
    await yaz(c.kal, 'insp', 'insp_k85', { no: 'MUA-K85', chars: [kar('dev_k85_gecerli', '10.05')] }, duzeltme.surum);
    // Cihazsız (nitel) ya da değersiz satır cihaz denetimine girmez.
    await yaz(c.kal, 'insp', 'insp_k85_nitel', { no: 'MUA-K85N', chars: [{ ...kar('', 'Uygun'), tip: 'Nitel' }, kar('dev_k85_dolmus', '')] });
  });

  // 329 a: ölçü aletlerinin tek kaynağı Kalibrasyon; cihaz listesi ondan salt okunur gelir, eski `dev` kayıtları silinmez.
  test('329 a ölçü aletleri: liste Kalibrasyon kayıtlarını verir, okuma yetkisi ister; eski dev kayıtları ve ölçüm bağları durur', async () => {
    await ret(403, 'YETKI_YOK', c.opr, 'GET', '/kalite-merkezi/olcu-aletleri');
    await ret(401, 'OTURUM_YOK', '', 'GET', '/kalite-merkezi/olcu-aletleri');
    const bugun = tesisGunu(Date.now());
    const ikiYilOnce = `${Number(bugun.slice(0, 4)) - 2}${bugun.slice(4)}`;
    const { turler: [tur] } = await tamam<{ turler: { id: number }[] }>(c.yon, 'GET', '/olcu-aleti-turleri');
    const alet = (no: string, ek: Record<string, unknown>) => tamam<{ id: number }>(c.yon, 'POST', '/olcu-aletleri', { no, turId: tur!.id, periyotGun: 90, ...ek });
    const bagli = await alet('L329-1', { ad: 'Kumpas 150', yer: 'CNC-1', olcmeAraligi: '0-150', ilkKalibrasyon: { tarih: bugun, sonuc: 'uygun', sertifikaNo: 'SRT-1' } });
    const yeni = await alet('L329-2', { ilkKalibrasyon: { tarih: bugun, sonuc: 'uygun' } });
    const dolmus = await alet('L329-3', { ilkKalibrasyon: { tarih: ikiYilOnce, sonuc: 'uygun' } });
    // Eski kayıtlar: biri alete kodla bağlanır, öteki Kalibrasyonda yok.
    const eski = await yaz(c.kal, 'dev', 'dev_l329_bagli', { kod: 'l329-1 ', ad: 'Eski ad', marka: 'Eski marka', sonKal: bugun, periyot: 12 });
    await yaz(c.kal, 'dev', 'dev_l329_yetim', { kod: 'L329-YOK', ad: 'Eski mastar', sonKal: bugun, periyot: 12 });

    const liste = (await tamam<{ cihazlar: { kimlik: string; govde: Record<string, unknown> }[] }>(c.kal, 'GET', '/kalite-merkezi/olcu-aletleri')).cihazlar;
    const bul = (kimlik: string) => liste.find((l) => l.kimlik === kimlik)?.govde;
    assert.equal(bul('dev_l329_bagli')?.['kod'], 'L329-1', 'eski kimlik korunur, değerler Kalibrasyondandır');
    assert.deepEqual(
      [bul('dev_l329_bagli')?.['ad'], bul('dev_l329_bagli')?.['lokasyon'], bul('dev_l329_bagli')?.['aralik'], bul('dev_l329_bagli')?.['sertifika'], bul('dev_l329_bagli')?.['marka']],
      ['Kumpas 150', 'CNC-1', '0-150', 'SRT-1', undefined],
    );
    assert.equal(bul('dev_l329_bagli')?.['periyot'], 3, '90 gün / 30');
    assert.equal(bul(`kal-${yeni.id}`)?.['kod'], 'L329-2');
    assert.equal(bul(`kal-${yeni.id}`)?.['ad'], '', 'karşılığı olmayan alan boş');
    assert.equal(bul(`kal-${dolmus.id}`)?.['sonKal'], ikiYilOnce);
    assert.equal(bul('dev_l329_yetim')?.['sonKal'], '', 'Kalibrasyonda karşılığı olmayan eski cihaz kanıtsız');
    assert.equal(bul('dev_l329_yetim')?.['ad'], 'Eski mastar', 'eski kayıt silinmez');
    assert.equal(liste.some((l) => l.kimlik === `kal-${bagli.id}`), false, 'bağlanan alet iki kez listelenmez');

    // Eski kayıtlar olduğu gibi duruyor.
    const kayitlar = await akis(c.kal);
    assert.deepEqual(govdesi(kayitlar, 'dev', 'dev_l329_bagli'), [{ kod: 'l329-1 ', ad: 'Eski ad', marka: 'Eski marka', sonKal: bugun, periyot: 12 }]);
    assert.ok(eski.surum > 0);

    // Ölçüm cihazı kimliğiyle bağlıdır: eski kimlik de, kal- kimliği de Kalibrasyonun kararıyla yazılır.
    const kar = (cihaz: string) => ({ balon: 1, ad: 'Çap', tip: 'Değişken', nominal: '10', alt: '0.1', ust: '0.1', olcum: '10.01', cihaz });
    const yol = (kimlik: string) => `/kalite-merkezi/kayitlar/insp/${kimlik}/yaz`;
    await yaz(c.kal, 'insp', 'insp_l329_eski', { no: 'MUA-L329A', chars: [kar('dev_l329_bagli')] });
    await yaz(c.kal, 'insp', 'insp_l329_yeni', { no: 'MUA-L329B', chars: [kar(`kal-${yeni.id}`)] });
    for (const cihaz of [`kal-${dolmus.id}`, 'kal-999999', 'dev_l329_yetim']) {
      const r = await istek(c.kal, 'POST', yol('insp_l329_red'), { govde: { no: 'MUA-L329R', chars: [kar(cihaz)] }, surum: null });
      assert.equal(r.statusCode, 400, `${cihaz}: ${r.body}`);
      assert.deepEqual((r.json() as { ayrinti: unknown }).ayrinti, { cihazlar: [cihaz] });
    }
  });

  // Kullanıcı kararı 16.10.2026 ("Gövdesiz"): kaydın içeriği ve fotoğrafı denetim defterine kopyalanmaz; kim, ne zaman, hangi kayıt kalır.
  test('denetim: yazma ve geri yükleme satırı kişi, kayıt ve sürümü taşır; kaydın içeriği deftere girmez', async () => {
    const gizli = `FOTO-${'x'.repeat(2000)}`;
    const ilk = await yaz(c.kal, 'ncr', 'ncr_dn1', { no: 'NCR-DN1', foto: gizli });
    await yaz(c.kal, 'ncr', 'ncr_dn1', { no: 'NCR-DN1', foto: gizli }, ilk.surum);
    const satirlar = await vt().sorgu<{ kisi: boolean; parametre: Record<string, unknown>; govde: Record<string, unknown>; metin: string }>(
      `SELECT kisi_id IS NOT NULL AS kisi, parametre, govde, row_to_json(d)::text AS metin FROM denetim_kaydi d
        WHERE yol = '/kalite-merkezi/kayitlar/:koleksiyon/:kimlik/yaz' AND parametre->>'kimlik' = 'ncr_dn1' ORDER BY id`,
    );
    assert.deepEqual(satirlar.map((d) => [d.kisi, d.parametre, Object.keys(d.govde).sort(), d.govde['_secilen']]), [
      [true, { koleksiyon: 'ncr', kimlik: 'ncr_dn1' }, ['_ozet', '_secilen'], { surum: null }],
      [true, { koleksiyon: 'ncr', kimlik: 'ncr_dn1' }, ['_ozet', '_secilen'], { surum: ilk.surum }],
    ]);
    assert.equal(satirlar.some((d) => d.metin.includes('FOTO-') || d.metin.includes('NCR-DN1')), false);

    await tamam(c.yon, 'POST', '/kalite-merkezi/geri-yukle', { baslangic: null, son: false, belgeler: [{ koleksiyon: 'ncr', kimlik: 'ncr_dn2', govde: { no: 'NCR-DN2', foto: gizli } }] });
    const [geri] = await vt().sorgu<{ govde: Record<string, unknown>; metin: string }>(
      "SELECT govde, row_to_json(d)::text AS metin FROM denetim_kaydi d WHERE yol = '/kalite-merkezi/geri-yukle' ORDER BY id DESC LIMIT 1",
    );
    assert.deepEqual(geri?.govde['_secilen'], { baslangic: null, son: false, belge: 1 });
    assert.equal(geri?.metin.includes('FOTO-'), false);
  });
});
