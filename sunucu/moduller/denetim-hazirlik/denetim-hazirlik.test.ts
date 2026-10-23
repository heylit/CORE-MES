import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { AZAMI_EK_BAYT } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { KURULUM_ISARETI } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

interface Belge { yol: string; kimlik: string; veri: Record<string, unknown>; surum: number }

describe('denetim-hazirlik belge deposu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let yazar = '';
  let yazarId = 0;
  let ikinciYazar = '';
  let okur = '';
  let yetkisiz = '';
  let sayac = 0;
  // Uç yalnız prototipin kaydına açıktır (`yerel/kalite-denetim*`); her test kendi anahtarında çalışır, ötekinin bıraktığına yaslanmaz.
  const yeniBelge = (): string => `yerel/kalite-denetim-t${String(++sayac)}`;

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

  const yaz = (cerez: string, govde: Record<string, unknown>) => istek(cerez, 'POST', '/denetim-hazirlik/belge/yaz', govde);
  const sorgu = async (cerez: string, koleksiyon: string, ek = ''): Promise<Belge[]> => {
    const cevap = await istek(cerez, 'GET', `/denetim-hazirlik/sorgu?koleksiyon=${encodeURIComponent(koleksiyon)}${ek}`);
    assert.equal(cevap.statusCode, 200, cevap.body);
    return (cevap.json() as { belgeler: Belge[] }).belgeler;
  };
  const damga = async (): Promise<number> => ((await istek(yonetici, 'GET', '/denetim-hazirlik/damga')).json() as { damga: number }).damga;

  before(async () => {
    ortam = await testVeritabaniKur('denetim_hazirlik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
    ({ cerez: yazar, id: yazarId } = await islemliKisi('yazar', ['denetim-hazirlik.yaz']));
    ({ cerez: ikinciYazar } = await islemliKisi('ikinci_yazar', ['denetim-hazirlik.yaz']));
    ({ cerez: okur } = await islemliKisi('okur', ['denetim-hazirlik.oku']));
    ({ cerez: yetkisiz } = await islemliKisi('yetkisiz', ['sayfa.denetim-hazirlik']));
  });

  after(async () => { await ortam?.kaldir(); });

  test('BD-01: yazılan belge aynen okunur; tam yazma gövdeyi değiştirir; her yazma damgayı ilerletir', async () => {
    const yol = yeniBelge();
    const once = await damga();
    const ilk = await yaz(yazar, { yol, kip: 'tam', veri: { ad: 'bir', ic: { x: 1 } } });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const ikinci = await yaz(yazar, { yol, kip: 'tam', veri: { ad: 'iki' } });
    const belge = (ikinci.json() as { belge: Belge }).belge;
    assert.deepEqual({ ...belge, surum: 0 }, { yol, kimlik: yol.split('/')[1], veri: { ad: 'iki' }, surum: 0 });
    assert.equal(belge.surum > once, true);
    assert.equal(await damga(), belge.surum);
    const okunan = await istek(okur, 'GET', `/denetim-hazirlik/belge?yol=${yol}`);
    assert.deepEqual((okunan.json() as { belge: Belge }).belge, belge);
  });

  test('BD-02: birleştirme iç içe alanı korur; olmayan belgeye birleştirme 404', async () => {
    const yol = yeniBelge();
    await yaz(yazar, { yol, kip: 'tam', veri: { rx: { a: 1 }, t: 'x' } });
    const cevap = await yaz(yazar, { yol, kip: 'birlestir', veri: { rx: { b: 2 } } });
    assert.deepEqual((cevap.json() as { belge: Belge }).belge.veri, { rx: { a: 1, b: 2 }, t: 'x' });
    const yokYol = yeniBelge();
    const yok = await yaz(yazar, { yol: yokYol, kip: 'birlestir', veri: { a: 1 } });
    assert.equal(yok.statusCode, 404);
    assert.equal((await istek(okur, 'GET', `/denetim-hazirlik/belge?yol=${yokYol}`).then((c) => c.json() as { belge: Belge | null })).belge, null);
  });

  test('BD-03: sürüm beklenen değilse yazma 409 ve belge değişmez; null beklenen yalnız yeni belgede geçer', async () => {
    const yol = yeniBelge();
    const ilk = await yaz(yazar, { yol, kip: 'tam', veri: { v: 1 }, beklenenSurum: null });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const surum = (ilk.json() as { belge: Belge }).belge.surum;
    assert.equal((await yaz(yazar, { yol, kip: 'tam', veri: { v: 2 }, beklenenSurum: null })).statusCode, 409);
    assert.equal((await yaz(yazar, { yol, kip: 'tam', veri: { v: 3 }, beklenenSurum: surum - 1 })).statusCode, 409);
    assert.equal((await yaz(yazar, { yol, kip: 'tam', veri: { v: 4 }, beklenenSurum: surum })).statusCode, 200);
    assert.deepEqual((await istek(okur, 'GET', `/denetim-hazirlik/belge?yol=${yol}`).then((c) => c.json() as { belge: Belge })).belge.veri, { v: 4 });
  });

  test('BD-04: sorgu koşulu, sırası ve sınırı sunucuda uygulanır', async () => {
    const grup = yeniBelge();
    for (const [id, ts] of [['a', 3], ['b', 1], ['c', 2]] as const) await yaz(yazar, { yol: `${grup}${id}`, kip: 'tam', veri: { ts, grup, tur: id === 'b' ? 'x' : 'y' } });
    const kimlik = (k: string): string => k.slice(-1);
    const sira = encodeURIComponent(JSON.stringify({ alan: 'ts', yon: 'desc' }));
    const grubu = encodeURIComponent(JSON.stringify([{ alan: 'grup', islec: '==', deger: grup }]));
    const filtre = encodeURIComponent(JSON.stringify([{ alan: 'grup', islec: '==', deger: grup }, { alan: 'tur', islec: '==', deger: 'y' }]));
    assert.deepEqual((await sorgu(okur, 'yerel', `&filtreler=${grubu}&sira=${sira}&sinir=2`)).map((b) => kimlik(b.kimlik)), ['a', 'c']);
    assert.deepEqual((await sorgu(okur, 'yerel', `&filtreler=${filtre}`)).map((b) => kimlik(b.kimlik)), ['a', 'c']);
  });

  test('BD-05: silme belgeyi kaldırır, damgayı ilerletir; ikinci silme silmedi der', async () => {
    const yol = yeniBelge();
    await yaz(yazar, { yol, kip: 'tam', veri: {} });
    const once = await damga();
    const sil = await istek(yazar, 'POST', '/denetim-hazirlik/belge/sil', { yol });
    assert.deepEqual(sil.json(), { silindi: true, damga: once + 1 });
    assert.equal((await istek(yazar, 'POST', '/denetim-hazirlik/belge/sil', { yol }).then((c) => c.json() as { silindi: boolean })).silindi, false);
    assert.equal((await istek(okur, 'GET', `/denetim-hazirlik/belge?yol=${yol}`).then((c) => c.json() as { belge: Belge | null })).belge, null);
  });

  test('BD-06: kişiye özel alan başkasına kapalı (okuma ve yazma 403), sahibine açık', async () => {
    const kok = `data/users/${String(yazarId)}/yerel/anahtarlar`;
    const yol = `${kok}/kalite-denetim-tercih`;
    assert.equal((await yaz(yazar, { yol, kip: 'tam', veri: { tema: 'koyu' } })).statusCode, 200);
    assert.equal((await yaz(yonetici, { yol, kip: 'tam', veri: { tema: 'acik' } })).statusCode, 403);
    assert.equal((await istek(yonetici, 'GET', `/denetim-hazirlik/belge?yol=${yol}`)).statusCode, 403);
    assert.equal((await istek(yonetici, 'GET', `/denetim-hazirlik/sorgu?koleksiyon=${kok}`)).statusCode, 403);
    const kendi = await istek(yazar, 'GET', `/denetim-hazirlik/belge?yol=${yol}`);
    assert.deepEqual((kendi.json() as { belge: Belge }).belge.veri, { tema: 'koyu' });
    assert.deepEqual((await sorgu(yazar, kok)).map((b) => b.kimlik), ['kalite-denetim-tercih']);
  });

  test('BD-07: yazma denetim-hazirlik.yaz ister, okuma denetim-hazirlik.oku ya da yaz ister; sayfa işlemi yalnız kimliği okur', async () => {
    const yol = yeniBelge();
    assert.equal((await yaz(okur, { yol, kip: 'tam', veri: {} })).statusCode, 403);
    assert.equal((await yaz(yetkisiz, { yol, kip: 'tam', veri: {} })).statusCode, 403);
    assert.equal((await istek(yetkisiz, 'GET', '/denetim-hazirlik/sorgu?koleksiyon=yerel')).statusCode, 403);
    assert.equal((await istek(okur, 'GET', '/denetim-hazirlik/sorgu?koleksiyon=yerel')).statusCode, 200);
    const ben = (await istek(yetkisiz, 'GET', '/denetim-hazirlik/ben')).json() as { yazabilir: boolean; yonetici: boolean };
    assert.deepEqual([ben.yazabilir, ben.yonetici], [false, false]);
    assert.equal((await istek(yazar, 'GET', '/denetim-hazirlik/ben').then((c) => c.json() as { yazabilir: boolean })).yazabilir, true);
  });

  test('BD-08: kilit başkasına geçerliyken verilmez, aynı sahibe yeniden verilir; kilit gövdesi belgeye birleşir', async () => {
    const yol = yeniBelge();
    const al = (sahip: string, veri?: Record<string, unknown>) =>
      istek(yazar, 'POST', '/denetim-hazirlik/belge/kilitle', { yol, sahip, sureMs: 30_000, ...(veri ? { veri } : {}) }).then((c) => c.json() as { alindi: boolean; bitis: string | null });
    assert.equal((await al('sekme-1', { durum: 'isleniyor' })).alindi, true);
    const baskasi = await al('sekme-2');
    assert.equal(baskasi.alindi, false);
    assert.equal(typeof baskasi.bitis, 'string');
    assert.equal((await al('sekme-1')).alindi, true);
    const okunan = await istek(yazar, 'GET', `/denetim-hazirlik/belge?yol=${yol}`);
    assert.deepEqual((okunan.json() as { belge: Belge }).belge.veri, { durum: 'isleniyor' });
  });

  test('BD-09: geçersiz yol (tek parçalı belge, izinsiz karakter) 400 ile döner', async () => {
    assert.equal((await yaz(yazar, { yol: 'tek', kip: 'tam', veri: {} })).statusCode, 400);
    assert.equal((await yaz(yazar, { yol: 'a/b c', kip: 'tam', veri: {} })).statusCode, 400);
    assert.equal((await istek(okur, 'GET', '/denetim-hazirlik/sorgu?koleksiyon=a/b')).statusCode, 400);
  });

  test('BD-10: ek yüklenir ve aynı içerikle okunur; olmayan ek 404', async () => {
    const icerik = Buffer.from('deneme içerik');
    const yukle = await istek(yazar, 'POST', '/denetim-hazirlik/ekler/yukle', { ad: 'not.txt', tur: 'text/plain', veri: icerik.toString('base64') });
    assert.equal(yukle.statusCode, 200, yukle.body);
    const ek = yukle.json() as { id: string; boyut: number };
    assert.match(ek.id, /^[0-9a-f]{32}$/);
    assert.equal(ek.boyut, icerik.length);
    const oku = (await istek(okur, 'GET', `/denetim-hazirlik/ekler/${ek.id}`)).json() as { veri: string; tur: string };
    assert.deepEqual([Buffer.from(oku.veri, 'base64').toString(), oku.tur], ['deneme içerik', 'text/plain']);
    assert.equal((await istek(okur, 'GET', `/denetim-hazirlik/ekler/${'0'.repeat(32)}`)).statusCode, 404);
  });

  test('BD-10b: ek en çok 700 KB; sınırdaki yüklenir, bir bayt fazlası anlaşılır iletiyle 400 alır', async () => {
    const yukle = (n: number) => istek(yazar, 'POST', '/denetim-hazirlik/ekler/yukle', { ad: 'buyuk.bin', tur: 'application/octet-stream', veri: Buffer.alloc(n, 1).toString('base64') });
    const kabul = await yukle(AZAMI_EK_BAYT);
    assert.equal(kabul.statusCode, 200, kabul.body.slice(0, 200));
    const red = await yukle(AZAMI_EK_BAYT + 1);
    assert.equal(red.statusCode, 400, red.body.slice(0, 200));
    assert.match((red.json() as { mesaj: string }).mesaj, /700 KB/);
  });

  test('BD-11: kurulum yönetim ister; işaret belgesi yokken başlangıç belgelerini bir kez kurar', async () => {
    assert.equal((await istek(yazar, 'POST', '/denetim-hazirlik/kurulum')).statusCode, 403);
    const ilk = (await istek(yonetici, 'POST', '/denetim-hazirlik/kurulum')).json() as { kurulan: number };
    const ikinci = (await istek(yonetici, 'POST', '/denetim-hazirlik/kurulum')).json() as { kurulan: number };
    assert.equal(ikinci.kurulan, 0);
    const ben = (await istek(yonetici, 'GET', '/denetim-hazirlik/ben')).json() as { kurulumGerekli: boolean; yonetici: boolean };
    assert.deepEqual([ben.kurulumGerekli, ben.yonetici], [false, true]);
    if (KURULUM_ISARETI === null) assert.equal(ilk.kurulan, 0);
    else {
      assert.equal(ilk.kurulan > 0, true);
      assert.equal((await istek(yonetici, 'GET', `/denetim-hazirlik/belge?yol=${KURULUM_ISARETI}`).then((c) => c.json() as { belge: Belge | null })).belge !== null, true);
    }
  });

  test('BD-12: oda o an açık olanları durumlarıyla döner', async () => {
    const durum = encodeURIComponent(JSON.stringify({ yaziyor: 'genel' }));
    await istek(yazar, 'GET', `/denetim-hazirlik/oda?durum=${durum}`);
    const esler = ((await istek(okur, 'GET', '/denetim-hazirlik/oda')).json() as { esler: { kisiId: number; durum: Record<string, unknown> }[] }).esler;
    assert.deepEqual(esler.find((e) => e.kisiId === yazarId)?.durum, { yaziyor: 'genel' });
  });

  test('BD-13: ortak kayıt (yerel) bütün yazarlara açık', async () => {
    const ortak = yeniBelge();
    assert.equal((await yaz(yazar, { yol: ortak, kip: 'tam', veri: { deger: '1' } })).statusCode, 200);
    assert.equal((await yaz(ikinciYazar, { yol: ortak, kip: 'tam', veri: { deger: '2' } })).statusCode, 200);
  });

  test('BD-15 (B7): genel depo ucu prototip kaydı dışındaki yola yazmaz, silmez, kilitlemez ve okumaz (403)', async () => {
    const yasak = ['deneme/b1', 'yerel/baska-anahtar', `${yeniBelge()}/alt/b1`, `data/users/${String(yazarId)}/prefs`, `data/users/${String(yazarId)}/yerel/anahtarlar/baska`];
    for (const yol of yasak) {
      const cevaplar = [
        await yaz(yazar, { yol, kip: 'tam', veri: { deger: 'x' } }),
        await istek(yazar, 'POST', '/denetim-hazirlik/belge/sil', { yol }),
        await istek(yazar, 'POST', '/denetim-hazirlik/belge/kilitle', { yol, sahip: 's', sureMs: 30_000 }),
        await istek(yazar, 'GET', `/denetim-hazirlik/belge?yol=${yol}`),
      ];
      assert.deepEqual(cevaplar.map((c) => c.statusCode), [403, 403, 403, 403], yol);
    }
    for (const koleksiyon of ['deneme', 'data', `${yeniBelge()}/alt`, `data/users/${String(yazarId)}/baska/anahtarlar`]) {
      assert.equal((await istek(yazar, 'GET', `/denetim-hazirlik/sorgu?koleksiyon=${koleksiyon}`)).statusCode, 403, koleksiyon);
    }
    const izinli = yeniBelge();
    assert.equal((await yaz(yazar, { yol: izinli, kip: 'tam', veri: { deger: 'x' } })).statusCode, 200);
  });
  test('BD-16 (226 a): ortak kaydı silen ya da boşaltan yazma ve silme yönetim ister; olağan düzenleme yazara açık', async () => {
    const depo = (profiller: Record<string, unknown>) => ({ deger: JSON.stringify({ active: Object.keys(profiller)[0], order: Object.keys(profiller), data: profiller }) });
    const dolu = { profile: { firma: 'Deneme A' }, audits: [], pw: {} };
    const bos = { profile: { firma: '' }, audits: [], pw: {} };
    const yol = yeniBelge();
    const sil = (cerez: string) => istek(cerez, 'POST', '/denetim-hazirlik/belge/sil', { yol });
    const oku = async (): Promise<Belge | null> => ((await istek(okur, 'GET', `/denetim-hazirlik/belge?yol=${yol}`)).json() as { belge: Belge | null }).belge;

    assert.equal((await yaz(yazar, { yol, kip: 'tam', veri: depo({ a: dolu }) })).statusCode, 200);
    assert.equal((await yaz(yazar, { yol, kip: 'tam', veri: depo({ a: dolu, b: bos }) })).statusCode, 200, 'profil ekleme');
    assert.equal((await yaz(yazar, { yol, kip: 'birlestir', veri: depo({ a: { ...dolu, audits: [{ id: 'd1' }] }, b: bos }) })).statusCode, 200, 'düzenleme');
    const once = await oku();

    const reddedilen = [
      await yaz(yazar, { yol, kip: 'tam', veri: depo({ a: dolu }) }),
      await yaz(yazar, { yol, kip: 'tam', veri: depo({ a: bos, b: bos }) }),
      await yaz(yazar, { yol, kip: 'birlestir', veri: { deger: '{bozuk' } }),
      await istek(yazar, 'POST', '/denetim-hazirlik/belge/kilitle', { yol, sahip: 's', sureMs: 30_000, veri: depo({ x: bos }) }),
      await sil(yazar),
    ];
    assert.deepEqual(reddedilen.map((c) => c.statusCode), [403, 403, 403, 403, 403]);
    assert.match(reddedilen[0]?.body ?? '', /yalnız yönetici/);
    assert.deepEqual(await oku(), once, 'reddedilen istek kaydı değiştirmez');

    assert.equal((await yaz(yonetici, { yol, kip: 'tam', veri: depo({ a: dolu }) })).statusCode, 200, 'yönetici profil siler');
    assert.equal((await yaz(yonetici, { yol, kip: 'tam', veri: depo({ x: bos }) })).statusCode, 200, 'yönetici sıfırlar');
    assert.equal((await sil(yonetici)).statusCode, 200, 'yönetici tümünü siler');
    assert.equal(await oku(), null);
  });

  // 329 a: ölçü aletlerinin tek kaynağı Kalibrasyon; prototipin cihaz listesi ondan salt okunur gelir.
  test('329 a ölçü aletleri: liste Kalibrasyon kayıtlarını verir; okuma yetkisi ister, yazma ucu yok', async () => {
    assert.equal((await istek(yetkisiz, 'GET', '/denetim-hazirlik/olcu-aletleri')).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/denetim-hazirlik/olcu-aletleri' })).statusCode, 401);
    const bugun = ((await vt().tek<{ g: string }>('SELECT current_date::text AS g'))!).g;
    const turler = (await istek(yonetici, 'GET', '/olcu-aleti-turleri')).json() as { turler: { id: number }[] };
    const olustur = await istek(yonetici, 'POST', '/olcu-aletleri', {
      no: 'dh329-1', turId: turler.turler[0]!.id, periyotGun: 90, yer: 'CNC-1', olcmeAraligi: '0-150',
      ilkKalibrasyon: { tarih: bugun, sonuc: 'uygun', sertifikaNo: 'SRT-329', aciklama: 'sapma yok' },
    });
    assert.equal(olustur.statusCode, 200, olustur.body);
    const kimlik = (olustur.json() as { id: number }).id;
    const liste = await istek(okur, 'GET', '/denetim-hazirlik/olcu-aletleri');
    assert.equal(liste.statusCode, 200, liste.body);
    const satir = (liste.json() as { aletler: { id: string; [a: string]: unknown }[] }).aletler.find((a) => a.id === `kal-${String(kimlik)}`);
    assert.ok(satir, 'alet listede');
    assert.deepEqual([satir.no, satir.yer, satir.aralik, satir.per, satir.last, satir.cert, satir.res, satir.st], ['DH329-1', 'CNC-1', '0-150', 3, bugun, 'SRT-329', 'uygun', 'aktif']);
    assert.equal(typeof satir.nx, 'string');
    assert.notEqual(satir.nx, '', 'vade Kalibrasyondan gelir');
    for (const alan of ['marka', 'seri', 'coz', 'sorumlu', 'lab', 'kabul']) assert.equal(alan in satir, false, alan);
    assert.equal((await istek(okur, 'POST', '/denetim-hazirlik/olcu-aletleri', {})).statusCode, 404, 'yazma ucu yok');
  });
  test('BD-14 (312 b): kişi ve emir bağları yabancı anahtar; boş şemada doğrulanmış', async () => {
    const satirlar = await vt().sorgu<{ ad: string }>(
      `SELECT c.conrelid::regclass || '.' || a.attname || ' ' || c.confrelid::regclass || ' ' || c.convalidated AS ad
         FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.connamespace = current_schema()::regnamespace AND c.conname = ANY($1::text[]) ORDER BY 1`,
      [['denetim_hazirlik_belge_olusturan_kisi_id_fk', 'denetim_hazirlik_belge_guncelleyen_kisi_id_fk', 'denetim_hazirlik_ek_yukleyen_kisi_id_fk']],
    );
    assert.deepEqual(satirlar.map((s) => s.ad), ['denetim_hazirlik_belge.olusturan_kisi_id kisi true', 'denetim_hazirlik_belge.guncelleyen_kisi_id kisi true', 'denetim_hazirlik_ek.yukleyen_kisi_id kisi true'].sort());
  });
});
