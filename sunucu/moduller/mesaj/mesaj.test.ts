import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { KURULUM_ISARETI, ORNEK_KANAL } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

interface Belge { yol: string; kimlik: string; veri: Record<string, unknown>; surum: number }

describe('mesaj belge deposu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let yazar = '';
  let yazarId = 0;
  let ikinciYazar = '';
  let ikinciYazarId = 0;
  let okur = '';
  let yetkisiz = '';
  let sayac = 0;
  // Her test kendi koleksiyonunda çalışır; ötekinin bıraktığına yaslanmaz.
  const yeniKoleksiyon = (): string => `deneme${String(++sayac)}`;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez }, payload: payload as object | undefined });

  // Kişi yönetici rolüyle doğar; istenen işlemleri taşıyan geçici rol uygulamanın atama işleviyle verilir.
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
      return yeni;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }

  const yaz = (cerez: string, govde: Record<string, unknown>) => istek(cerez, 'POST', '/mesaj/belge/yaz', govde);
  const sorgu = async (cerez: string, koleksiyon: string, ek = ''): Promise<Belge[]> => {
    const cevap = await istek(cerez, 'GET', `/mesaj/sorgu?koleksiyon=${encodeURIComponent(koleksiyon)}${ek}`);
    assert.equal(cevap.statusCode, 200, cevap.body);
    return (cevap.json() as { belgeler: Belge[] }).belgeler;
  };
  const damga = async (): Promise<number> => ((await istek(yonetici, 'GET', '/mesaj/damga')).json() as { damga: number }).damga;

  before(async () => {
    ortam = await testVeritabaniKur('mesaj');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
    ({ cerez: yazar, id: yazarId } = await islemliKisi('yazar', ['mesaj.yaz']));
    ({ cerez: ikinciYazar, id: ikinciYazarId } = await islemliKisi('yazar2', ['mesaj.yaz']));
    ({ cerez: okur } = await islemliKisi('okur', ['mesaj.oku']));
    ({ cerez: yetkisiz } = await islemliKisi('yetkisiz', ['sayfa.mesaj']));
  });

  after(async () => { await ortam?.kaldir(); });

  test('BD-01: yazılan belge aynen okunur; tam yazma gövdeyi değiştirir; her yazma damgayı ilerletir', async () => {
    const k = yeniKoleksiyon();
    const once = await damga();
    const ilk = await yaz(yazar, { yol: `${k}/b1`, kip: 'tam', veri: { ad: 'bir', ic: { x: 1 } } });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const ikinci = await yaz(yazar, { yol: `${k}/b1`, kip: 'tam', veri: { ad: 'iki' } });
    const belge = (ikinci.json() as { belge: Belge }).belge;
    assert.deepEqual({ ...belge, surum: 0 }, { yol: `${k}/b1`, kimlik: 'b1', veri: { ad: 'iki' }, surum: 0 });
    assert.equal(belge.surum > once, true);
    assert.equal(await damga(), belge.surum);
    const okunan = await istek(okur, 'GET', `/mesaj/belge?yol=${k}/b1`);
    assert.deepEqual((okunan.json() as { belge: Belge }).belge, belge);
  });

  test('BD-02: birleştirme iç içe alanı korur; olmayan belgeye birleştirme 404', async () => {
    const k = yeniKoleksiyon();
    await yaz(yazar, { yol: `${k}/b1`, kip: 'tam', veri: { rx: { a: 1 }, t: 'x' } });
    const cevap = await yaz(yazar, { yol: `${k}/b1`, kip: 'birlestir', veri: { rx: { b: 2 } } });
    assert.deepEqual((cevap.json() as { belge: Belge }).belge.veri, { rx: { a: 1, b: 2 }, t: 'x' });
    const yok = await yaz(yazar, { yol: `${k}/yok`, kip: 'birlestir', veri: { a: 1 } });
    assert.equal(yok.statusCode, 404);
    assert.deepEqual(await sorgu(okur, k).then((l) => l.map((b) => b.kimlik)), ['b1']);
  });

  test('BD-03: sürüm beklenen değilse yazma 409 ve belge değişmez; null beklenen yalnız yeni belgede geçer', async () => {
    const k = yeniKoleksiyon();
    const ilk = await yaz(yazar, { yol: `${k}/b1`, kip: 'tam', veri: { v: 1 }, beklenenSurum: null });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const surum = (ilk.json() as { belge: Belge }).belge.surum;
    assert.equal((await yaz(yazar, { yol: `${k}/b1`, kip: 'tam', veri: { v: 2 }, beklenenSurum: null })).statusCode, 409);
    assert.equal((await yaz(yazar, { yol: `${k}/b1`, kip: 'tam', veri: { v: 3 }, beklenenSurum: surum - 1 })).statusCode, 409);
    assert.equal((await yaz(yazar, { yol: `${k}/b1`, kip: 'tam', veri: { v: 4 }, beklenenSurum: surum })).statusCode, 200);
    assert.deepEqual((await sorgu(okur, k)).map((b) => b.veri), [{ v: 4 }]);
  });

  test('BD-04: sorgu koşulu, sırası ve sınırı sunucuda uygulanır; alt koleksiyon üst koleksiyona karışmaz', async () => {
    const k = yeniKoleksiyon();
    for (const [id, ts] of [['a', 3], ['b', 1], ['c', 2]] as const) await yaz(yazar, { yol: `${k}/${id}`, kip: 'tam', veri: { ts, tur: id === 'b' ? 'x' : 'y' } });
    await yaz(yazar, { yol: `${k}/a/alt/z`, kip: 'tam', veri: { ts: 0 } });
    const sira = encodeURIComponent(JSON.stringify({ alan: 'ts', yon: 'desc' }));
    const filtre = encodeURIComponent(JSON.stringify([{ alan: 'tur', islec: '==', deger: 'y' }]));
    assert.deepEqual((await sorgu(okur, k, `&sira=${sira}&sinir=2`)).map((b) => b.kimlik), ['a', 'c']);
    assert.deepEqual((await sorgu(okur, k, `&filtreler=${filtre}`)).map((b) => b.kimlik), ['a', 'c']);
    assert.deepEqual((await sorgu(okur, `${k}/a/alt`)).map((b) => b.kimlik), ['z']);
  });

  test('BD-05: silme belgeyi kaldırır, damgayı ilerletir; ikinci silme silmedi der', async () => {
    const k = yeniKoleksiyon();
    await yaz(yazar, { yol: `${k}/b1`, kip: 'tam', veri: {} });
    const once = await damga();
    const sil = await istek(yazar, 'POST', '/mesaj/belge/sil', { yol: `${k}/b1` });
    assert.deepEqual(sil.json(), { silindi: true, damga: once + 1 });
    assert.equal((await istek(yazar, 'POST', '/mesaj/belge/sil', { yol: `${k}/b1` }).then((c) => c.json() as { silindi: boolean })).silindi, false);
    assert.deepEqual(await sorgu(okur, k), []);
  });

  test('BD-06: kişiye özel alan başkasına kapalı (okuma ve yazma 403), sahibine açık', async () => {
    const yol = `data/users/${String(yazarId)}/prefs`;
    assert.equal((await yaz(yazar, { yol, kip: 'tam', veri: { tema: 'koyu' } })).statusCode, 200);
    assert.equal((await yaz(yonetici, { yol, kip: 'tam', veri: { tema: 'acik' } })).statusCode, 403);
    assert.equal((await istek(yonetici, 'GET', `/mesaj/belge?yol=${yol}`)).statusCode, 403);
    assert.equal((await istek(yonetici, 'GET', '/mesaj/sorgu?koleksiyon=data')).statusCode, 200);
    const kendi = await istek(yazar, 'GET', `/mesaj/belge?yol=${yol}`);
    assert.deepEqual((kendi.json() as { belge: Belge }).belge.veri, { tema: 'koyu' });
  });

  test('BD-07: yazma mesaj.yaz ister, okuma mesaj.oku ya da yaz ister; sayfa işlemi yalnız kimliği okur', async () => {
    const k = yeniKoleksiyon();
    assert.equal((await yaz(okur, { yol: `${k}/b1`, kip: 'tam', veri: {} })).statusCode, 403);
    assert.equal((await yaz(yetkisiz, { yol: `${k}/b1`, kip: 'tam', veri: {} })).statusCode, 403);
    assert.equal((await istek(yetkisiz, 'GET', `/mesaj/sorgu?koleksiyon=${k}`)).statusCode, 403);
    assert.equal((await istek(okur, 'GET', `/mesaj/sorgu?koleksiyon=${k}`)).statusCode, 200);
    const ben = (await istek(yetkisiz, 'GET', '/mesaj/ben')).json() as { yazabilir: boolean; yonetici: boolean };
    assert.deepEqual([ben.yazabilir, ben.yonetici], [false, false]);
    assert.equal((await istek(yazar, 'GET', '/mesaj/ben').then((c) => c.json() as { yazabilir: boolean })).yazabilir, true);
  });

  test('BD-08: kilit başkasına geçerliyken verilmez, aynı sahibe yeniden verilir; kilit gövdesi belgeye birleşir', async () => {
    const yol = `${yeniKoleksiyon()}/is1`;
    const al = (sahip: string, veri?: Record<string, unknown>) =>
      istek(yazar, 'POST', '/mesaj/belge/kilitle', { yol, sahip, sureMs: 30_000, ...(veri ? { veri } : {}) }).then((c) => c.json() as { alindi: boolean; bitis: string | null });
    assert.equal((await al('sekme-1', { durum: 'isleniyor' })).alindi, true);
    const baskasi = await al('sekme-2');
    assert.equal(baskasi.alindi, false);
    assert.equal(typeof baskasi.bitis, 'string');
    assert.equal((await al('sekme-1')).alindi, true);
    const okunan = await istek(yazar, 'GET', `/mesaj/belge?yol=${yol}`);
    assert.deepEqual((okunan.json() as { belge: Belge }).belge.veri, { durum: 'isleniyor' });
  });

  test('BD-09: geçersiz yol (tek parçalı belge, izinsiz karakter) 400 ile döner', async () => {
    assert.equal((await yaz(yazar, { yol: 'tek', kip: 'tam', veri: {} })).statusCode, 400);
    assert.equal((await yaz(yazar, { yol: 'a/b c', kip: 'tam', veri: {} })).statusCode, 400);
    assert.equal((await istek(okur, 'GET', '/mesaj/sorgu?koleksiyon=a/b')).statusCode, 400);
  });

  test('BD-10: ek yüklenir ve aynı içerikle okunur; olmayan ek 404', async () => {
    const icerik = Buffer.from('deneme içerik');
    const yukle = await istek(yazar, 'POST', '/mesaj/ekler/yukle', { ad: 'not.txt', tur: 'text/plain', veri: icerik.toString('base64') });
    assert.equal(yukle.statusCode, 200, yukle.body);
    const ek = yukle.json() as { id: string; boyut: number };
    assert.match(ek.id, /^[0-9a-f]{32}$/);
    assert.equal(ek.boyut, icerik.length);
    const oku = (await istek(okur, 'GET', `/mesaj/ekler/${ek.id}`)).json() as { veri: string; tur: string };
    assert.deepEqual([Buffer.from(oku.veri, 'base64').toString(), oku.tur], ['deneme içerik', 'text/plain']);
    assert.equal((await istek(okur, 'GET', `/mesaj/ekler/${'0'.repeat(32)}`)).statusCode, 404);
  });

  test('BD-11: kurulum yönetim ister; işaret belgesi yokken başlangıç belgelerini bir kez kurar', async () => {
    assert.equal((await istek(yazar, 'POST', '/mesaj/kurulum')).statusCode, 403);
    const ilk = (await istek(yonetici, 'POST', '/mesaj/kurulum')).json() as { kurulan: number };
    const ikinci = (await istek(yonetici, 'POST', '/mesaj/kurulum')).json() as { kurulan: number };
    assert.equal(ikinci.kurulan, 0);
    const ben = (await istek(yonetici, 'GET', '/mesaj/ben')).json() as { kurulumGerekli: boolean; yonetici: boolean };
    assert.deepEqual([ben.kurulumGerekli, ben.yonetici], [false, true]);
    if (KURULUM_ISARETI === null) assert.equal(ilk.kurulan, 0);
    else {
      assert.equal(ilk.kurulan > 0, true);
      assert.equal((await istek(yonetici, 'GET', `/mesaj/belge?yol=${KURULUM_ISARETI}`).then((c) => c.json() as { belge: Belge | null })).belge !== null, true);
    }
  });

  test('BD-12: oda o an açık olanları durumlarıyla döner', async () => {
    const durum = encodeURIComponent(JSON.stringify({ yaziyor: 'genel' }));
    await istek(yazar, 'GET', `/mesaj/oda?durum=${durum}`);
    const esler = ((await istek(okur, 'GET', '/mesaj/oda')).json() as { esler: { kisiId: number; durum: Record<string, unknown> }[] }).esler;
    assert.deepEqual(esler.find((e) => e.kisiId === yazarId)?.durum, { yaziyor: 'genel' });
  });

  test('BD-13: gönderen oturumdaki kişidir; başkası adına ileti ve okundu işareti 403', async () => {
    const kanal = yeniKoleksiyon();
    const ben = String(yazarId);
    assert.equal((await yaz(yazar, { yol: `channels/${kanal}/msgs/m1`, kip: 'tam', veri: { by: ben, text: 'merhaba', kind: 'msg', rx: {} } })).statusCode, 200);
    const sahte = await yaz(yazar, { yol: `channels/${kanal}/msgs/m2`, kip: 'tam', veri: { by: String(yoneticiId), text: 'müdür adına', kind: 'msg', rx: {} } });
    assert.equal(sahte.statusCode, 403);
    assert.equal((await istek(yazar, 'GET', `/mesaj/belge?yol=channels/${kanal}/msgs/m2`).then((c) => c.json() as { belge: Belge | null })).belge, null);
    const duyuru = `duyurular/${kanal}`;
    assert.equal((await yaz(yazar, { yol: duyuru, kip: 'tam', veri: { by: ben, text: 'duyuru', cid: kanal, mid: null, ack: {} } })).statusCode, 200);
    assert.equal((await yaz(ikinciYazar, { yol: duyuru, kip: 'birlestir', veri: { ack: { [String(ikinciYazarId)]: String(ikinciYazarId) } } })).statusCode, 200);
    assert.equal((await yaz(ikinciYazar, { yol: duyuru, kip: 'birlestir', veri: { ack: { [String(yoneticiId)]: String(yoneticiId) } } })).statusCode, 403);
  });

  test('BD-16 (311 a): üretim girişi ve sipariş adedi 403; sipariş boş adetle açılır, durumu yazılır', async () => {
    const ben = String(yazarId);
    const siparis = `orders/${yeniKoleksiyon()}`;
    assert.equal((await yaz(yazar, { yol: siparis, kip: 'tam', veri: { no: '1', target: 10, qty: {}, by: ben, status: 'sirada' } })).statusCode, 200);
    assert.equal((await yaz(yazar, { yol: `${siparis}/giris/e1`, kip: 'tam', veri: { qty: 5, note: '', by: ben, ts: 1 } })).statusCode, 403);
    assert.equal((await yaz(yazar, { yol: siparis, kip: 'birlestir', veri: { qty: { [ben]: 5 } } })).statusCode, 403);
    assert.equal((await yaz(yonetici, { yol: siparis, kip: 'birlestir', veri: { qty: { [ben]: 5 } } })).statusCode, 403);
    assert.equal((await yaz(yazar, { yol: siparis, kip: 'birlestir', veri: { status: 'uretimde' } })).statusCode, 200);
    assert.equal((await istek(yazar, 'GET', `/mesaj/belge?yol=${siparis}/giris/e1`).then((c) => c.json() as { belge: Belge | null })).belge, null);
  });

  test('BD-14: başkasının iletisi yalnız sahibince ya da yöneticice düzenlenir ve silinir; tepki herkese açık', async () => {
    const yol = `channels/${yeniKoleksiyon()}/msgs/m1`;
    await yaz(yazar, { yol, kip: 'tam', veri: { by: String(yazarId), text: 'asıl', kind: 'msg', rx: {} } });
    const benim = String(ikinciYazarId);
    assert.equal((await yaz(ikinciYazar, { yol, kip: 'birlestir', veri: { rx: { c_tamam: { [benim]: benim } } } })).statusCode, 200);
    assert.equal((await yaz(ikinciYazar, { yol, kip: 'birlestir', veri: { text: 'değişti', edited: 1 } })).statusCode, 403);
    assert.equal((await yaz(ikinciYazar, { yol, kip: 'birlestir', veri: { deleted: true, text: '', att: null } })).statusCode, 403);
    assert.equal((await yaz(ikinciYazar, { yol, kip: 'tam', veri: { by: benim, text: 'devraldım', kind: 'msg' } })).statusCode, 403);
    assert.equal((await istek(ikinciYazar, 'POST', '/mesaj/belge/sil', { yol })).statusCode, 403);
    const okunan = (await istek(okur, 'GET', `/mesaj/belge?yol=${yol}`).then((c) => c.json() as { belge: Belge })).belge.veri;
    assert.deepEqual([okunan.text, okunan.rx], ['asıl', { c_tamam: { [benim]: benim } }]);
    assert.equal((await yaz(yazar, { yol, kip: 'birlestir', veri: { text: 'düzeltildi', edited: 2 } })).statusCode, 200);
    assert.equal((await istek(yonetici, 'POST', '/mesaj/belge/sil', { yol }).then((c) => c.json() as { silindi: boolean })).silindi, true);
  });

  test('BD-18 (225 a): başkasının siparişi, uyarısı ve kanalı yalnız sahibince ya da yöneticice değişir, sipariş durumu herkese açık; okundu yalnız kişinin kendisine', async () => {
    const ben = String(yazarId);
    const oteki = String(ikinciYazarId);
    const ek = yeniKoleksiyon();
    const siparis = `orders/${ek}`;
    const kural = `kurallar/${ek}`;
    const kanal = `channels/${ek}`;
    assert.equal((await yaz(yazar, { yol: siparis, kip: 'tam', veri: { no: '1', target: 10, qty: {}, by: ben, status: 'sirada' } })).statusCode, 200);
    assert.equal((await yaz(yazar, { yol: kural, kip: 'tam', veri: { type: 'task_late', cid: ek, params: {}, on: true, by: ben } })).statusCode, 200);
    assert.equal((await yaz(yazar, { yol: kanal, kip: 'tam', veri: { name: ek, topic: 'konu', createdBy: ben, lastBy: ben, lastAt: 1 } })).statusCode, 200);

    assert.equal((await yaz(ikinciYazar, { yol: siparis, kip: 'birlestir', veri: { status: 'hazir', last: { by: oteki, t: 'durumu değiştirdi' } } })).statusCode, 200);
    assert.equal((await yaz(ikinciYazar, { yol: siparis, kip: 'birlestir', veri: { customer: 'baska', status: 'sevk' } })).statusCode, 403);
    assert.equal((await yaz(ikinciYazar, { yol: kural, kip: 'birlestir', veri: { on: false } })).statusCode, 403);
    assert.equal((await yaz(ikinciYazar, { yol: kanal, kip: 'birlestir', veri: { name: 'baska', topic: 'değişti' } })).statusCode, 403);
    for (const yol of [siparis, kural, kanal]) assert.equal((await istek(ikinciYazar, 'POST', '/mesaj/belge/sil', { yol })).statusCode, 403, yol);
    assert.equal((await yaz(ikinciYazar, { yol: kanal, kip: 'birlestir', veri: { lastAt: 2, lastBy: oteki, lastText: 'merhaba' } })).statusCode, 200);

    const okunan = async (yol: string) => (await istek(okur, 'GET', `/mesaj/belge?yol=${yol}`).then((c) => c.json() as { belge: Belge })).belge.veri;
    assert.deepEqual([(await okunan(siparis)).status, (await okunan(siparis)).customer], ['hazir', undefined]);
    assert.equal((await okunan(kural)).on, true);
    assert.deepEqual([(await okunan(kanal)).name, (await okunan(kanal)).lastBy], [ek, oteki]);

    assert.equal((await yaz(yazar, { yol: siparis, kip: 'birlestir', veri: { status: 'uretimde' } })).statusCode, 200);
    assert.equal((await yaz(yonetici, { yol: kural, kip: 'birlestir', veri: { on: false } })).statusCode, 200);
    assert.equal((await yaz(yonetici, { yol: kanal, kip: 'birlestir', veri: { topic: 'yönetici' } })).statusCode, 200);
    assert.equal((await istek(yazar, 'POST', '/mesaj/belge/sil', { yol: siparis })).statusCode, 200);
    assert.equal((await istek(yonetici, 'POST', '/mesaj/belge/sil', { yol: kanal })).statusCode, 200);

    assert.equal((await yaz(yazar, { yol: `okuma/${ben}`, kip: 'tam', veri: { c: { [ek]: 1 } } })).statusCode, 200);
    assert.equal((await yaz(ikinciYazar, { yol: `okuma/${ben}`, kip: 'tam', veri: { c: { [ek]: 9 } } })).statusCode, 403);
    assert.equal((await yaz(yonetici, { yol: `okuma/${ben}`, kip: 'birlestir', veri: { c: { [ek]: 9 } } })).statusCode, 403);
    assert.equal((await istek(ikinciYazar, 'POST', '/mesaj/belge/sil', { yol: `okuma/${ben}` })).statusCode, 403);
    assert.deepEqual((await okunan(`okuma/${ben}`)).c, { [ek]: 1 });
  });

  test('BD-15: örnek veri kisiler zinciriyle kanal ve iki ileti kurar, başlangıç kanallarını kurmaz; ikinci koşu yüklü der', async () => {
    for (const yol of ['channels/genel', 'channels/duyurular']) await istek(yonetici, 'POST', '/mesaj/belge/sil', { yol });
    const liste = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'kisiler' || t.modul === 'mesaj');
    const secenek = { ortam: 'test' as const, bildir: () => undefined };
    assert.deepEqual(await ornekVeriYukle(vt(), liste, secenek), { durum: 'yuklendi', moduller: ['kisiler', 'mesaj'] });
    const iletiler = await sorgu(okur, `${ORNEK_KANAL}/msgs`);
    assert.deepEqual(iletiler.map((b) => b.kimlik), ['ORN-m1', 'ORN-m2']);
    assert.notEqual(iletiler[0]?.veri.by, iletiler[1]?.veri.by);
    const kanal = (await istek(okur, 'GET', `/mesaj/belge?yol=${ORNEK_KANAL}`).then((c) => c.json() as { belge: Belge })).belge.veri;
    assert.deepEqual([kanal.lastBy, kanal.lastText], [iletiler[1]?.veri.by, iletiler[1]?.veri.text]);
    assert.deepEqual((await sorgu(okur, 'channels')).map((b) => b.kimlik), ['ORN-uretim']);
    assert.deepEqual(await ornekVeriYukle(vt(), liste, secenek), { durum: 'yuklu', moduller: ['kisiler', 'mesaj'] });
  });
  test('BD-17 (312 b): kişi ve emir bağları yabancı anahtar; boş şemada doğrulanmış', async () => {
    const satirlar = await vt().sorgu<{ ad: string }>(
      `SELECT c.conrelid::regclass || '.' || a.attname || ' ' || c.confrelid::regclass || ' ' || c.convalidated AS ad
         FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.connamespace = current_schema()::regnamespace AND c.conname = ANY($1::text[]) ORDER BY 1`,
      [['mesaj_belge_olusturan_kisi_id_fk', 'mesaj_belge_guncelleyen_kisi_id_fk', 'mesaj_ek_yukleyen_kisi_id_fk']],
    );
    assert.deepEqual(satirlar.map((s) => s.ad), ['mesaj_belge.olusturan_kisi_id kisi true', 'mesaj_belge.guncelleyen_kisi_id kisi true', 'mesaj_ek.yukleyen_kisi_id kisi true'].sort());
  });
});
