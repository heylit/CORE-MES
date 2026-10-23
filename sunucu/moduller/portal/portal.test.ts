import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { AZAMI_EK_BAYT } from '#paylasilan/sozlesme/portal.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { firmaOzeti, ornekFirmaNo } from '../musteri-tedarikci/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { KURULUM_ISARETI } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

interface Belge { yol: string; kimlik: string; veri: Record<string, unknown>; surum: number }

describe('portal belge deposu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let yazar = '';
  let yazarId = 0;
  let okur = '';
  let yetkisiz = '';
  let sayac = 0;
  // Her test kendi koleksiyonunda çalışır; ötekinin bıraktığına yaslanmaz.
  const yeniKoleksiyon = (): string => `deneme${String(++sayac)}`;
  // Teklif talebi Siparişler'de açılır (soru 148): müşteri finans firmasına bağlı, en az bir kalem.
  let firmaKodu = '';
  const talep = (ek: Record<string, unknown> = {}) => ({ title: 'x', customerId: firmaKodu, items: [{ name: 'Kalem', qty: 1, unit: 'adet' }], ...ek });

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

  const yaz = (cerez: string, govde: Record<string, unknown>) => istek(cerez, 'POST', '/portal/belge/yaz', govde);
  const sorgu = async (cerez: string, koleksiyon: string, ek = ''): Promise<Belge[]> => {
    const cevap = await istek(cerez, 'GET', `/portal/sorgu?koleksiyon=${encodeURIComponent(koleksiyon)}${ek}`);
    assert.equal(cevap.statusCode, 200, cevap.body);
    return (cevap.json() as { belgeler: Belge[] }).belgeler;
  };
  const damga = async (): Promise<number> => ((await istek(yonetici, 'GET', '/portal/damga')).json() as { damga: number }).damga;

  before(async () => {
    ortam = await testVeritabaniKur('portal');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const hepsi = await modulOrnekVerileriniKesfet();
    await ornekVeriYukle(ortam.vt, hepsi.filter((t) => t.modul === 'kisiler' || t.modul === 'musteri-tedarikci'), { ortam: 'test', bildir: () => undefined });
    firmaKodu = (await ortam.vt.tx(async (db) => firmaOzeti(db, (await ornekFirmaNo(db, 'musteriA')) ?? 0)))?.kod ?? '';
    assert.ok(firmaKodu !== '');
    yonetici = await girisCerezi('yonetici');
    ({ cerez: yazar, id: yazarId } = await islemliKisi('yazar', ['portal.yaz']));
    ({ cerez: okur } = await islemliKisi('okur', ['portal.oku']));
    ({ cerez: yetkisiz } = await islemliKisi('yetkisiz', ['sayfa.portal']));
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
    const okunan = await istek(okur, 'GET', `/portal/belge?yol=${k}/b1`);
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
    const sil = await istek(yazar, 'POST', '/portal/belge/sil', { yol: `${k}/b1` });
    assert.deepEqual(sil.json(), { silindi: true, damga: once + 1 });
    assert.equal((await istek(yazar, 'POST', '/portal/belge/sil', { yol: `${k}/b1` }).then((c) => c.json() as { silindi: boolean })).silindi, false);
    assert.deepEqual(await sorgu(okur, k), []);
  });

  test('BD-06: kişiye özel alan başkasına kapalı (okuma ve yazma 403), sahibine açık', async () => {
    const yol = `data/users/${String(yazarId)}/prefs`;
    assert.equal((await yaz(yazar, { yol, kip: 'tam', veri: { tema: 'koyu' } })).statusCode, 200);
    assert.equal((await yaz(yonetici, { yol, kip: 'tam', veri: { tema: 'acik' } })).statusCode, 403);
    assert.equal((await istek(yonetici, 'GET', `/portal/belge?yol=${yol}`)).statusCode, 403);
    assert.equal((await istek(yonetici, 'GET', '/portal/sorgu?koleksiyon=data')).statusCode, 200);
    const kendi = await istek(yazar, 'GET', `/portal/belge?yol=${yol}`);
    assert.deepEqual((kendi.json() as { belge: Belge }).belge.veri, { tema: 'koyu' });
  });

  test('BD-07: yazma portal.yaz ister, okuma portal.oku ya da yaz ister; sayfa işlemi yalnız kimliği okur', async () => {
    const k = yeniKoleksiyon();
    assert.equal((await yaz(okur, { yol: `${k}/b1`, kip: 'tam', veri: {} })).statusCode, 403);
    assert.equal((await yaz(yetkisiz, { yol: `${k}/b1`, kip: 'tam', veri: {} })).statusCode, 403);
    assert.equal((await istek(yetkisiz, 'GET', `/portal/sorgu?koleksiyon=${k}`)).statusCode, 403);
    assert.equal((await istek(okur, 'GET', `/portal/sorgu?koleksiyon=${k}`)).statusCode, 200);
    const ben = (await istek(yetkisiz, 'GET', '/portal/ben')).json() as { yazabilir: boolean; yonetici: boolean };
    assert.deepEqual([ben.yazabilir, ben.yonetici], [false, false]);
    assert.equal((await istek(yazar, 'GET', '/portal/ben').then((c) => c.json() as { yazabilir: boolean })).yazabilir, true);
  });

  test('BD-08: kilit başkasına geçerliyken verilmez, aynı sahibe yeniden verilir; kilit gövdesi belgeye birleşir', async () => {
    const yol = `${yeniKoleksiyon()}/is1`;
    const al = (sahip: string, veri?: Record<string, unknown>) =>
      istek(yazar, 'POST', '/portal/belge/kilitle', { yol, sahip, sureMs: 30_000, ...(veri ? { veri } : {}) }).then((c) => c.json() as { alindi: boolean; bitis: string | null });
    assert.equal((await al('sekme-1', { durum: 'isleniyor' })).alindi, true);
    const baskasi = await al('sekme-2');
    assert.equal(baskasi.alindi, false);
    assert.equal(typeof baskasi.bitis, 'string');
    assert.equal((await al('sekme-1')).alindi, true);
    const okunan = await istek(yazar, 'GET', `/portal/belge?yol=${yol}`);
    assert.deepEqual((okunan.json() as { belge: Belge }).belge.veri, { durum: 'isleniyor' });
  });

  test('BD-09: geçersiz yol (tek parçalı belge, izinsiz karakter) 400 ile döner', async () => {
    assert.equal((await yaz(yazar, { yol: 'tek', kip: 'tam', veri: {} })).statusCode, 400);
    assert.equal((await yaz(yazar, { yol: 'a/b c', kip: 'tam', veri: {} })).statusCode, 400);
    assert.equal((await istek(okur, 'GET', '/portal/sorgu?koleksiyon=a/b')).statusCode, 400);
  });

  test('BD-10: ek yüklenir ve aynı içerikle okunur; olmayan ek 404', async () => {
    const icerik = Buffer.from('deneme içerik');
    const yukle = await istek(yazar, 'POST', '/portal/ekler/yukle', { ad: 'not.txt', tur: 'text/plain', veri: icerik.toString('base64') });
    assert.equal(yukle.statusCode, 200, yukle.body);
    const ek = yukle.json() as { id: string; boyut: number };
    assert.match(ek.id, /^[0-9a-f]{32}$/);
    assert.equal(ek.boyut, icerik.length);
    const oku = (await istek(okur, 'GET', `/portal/ekler/${ek.id}`)).json() as { veri: string; tur: string };
    assert.deepEqual([Buffer.from(oku.veri, 'base64').toString(), oku.tur], ['deneme içerik', 'text/plain']);
    assert.equal((await istek(okur, 'GET', `/portal/ekler/${'0'.repeat(32)}`)).statusCode, 404);
  });

  test('BD-10b: ek en çok 700 KB; sınırdaki yüklenir, bir bayt fazlası anlaşılır iletiyle 400 alır', async () => {
    const yukle = (n: number) => istek(yazar, 'POST', '/portal/ekler/yukle', { ad: 'buyuk.bin', tur: 'application/octet-stream', veri: Buffer.alloc(n, 1).toString('base64') });
    const kabul = await yukle(AZAMI_EK_BAYT);
    assert.equal(kabul.statusCode, 200, kabul.body.slice(0, 200));
    const red = await yukle(AZAMI_EK_BAYT + 1);
    assert.equal(red.statusCode, 400, red.body.slice(0, 200));
    assert.match((red.json() as { mesaj: string }).mesaj, /700 KB/);
  });

  test('BD-11: kurulum yönetim ister; işaret belgesi yokken başlangıç belgelerini bir kez kurar', async () => {
    assert.equal((await istek(yazar, 'POST', '/portal/kurulum')).statusCode, 403);
    const ilk = (await istek(yonetici, 'POST', '/portal/kurulum')).json() as { kurulan: number };
    const ikinci = (await istek(yonetici, 'POST', '/portal/kurulum')).json() as { kurulan: number };
    assert.equal(ikinci.kurulan, 0);
    const ben = (await istek(yonetici, 'GET', '/portal/ben')).json() as { kurulumGerekli: boolean; yonetici: boolean };
    assert.deepEqual([ben.kurulumGerekli, ben.yonetici], [false, true]);
    if (KURULUM_ISARETI === null) assert.equal(ilk.kurulan, 0);
    else {
      assert.equal(ilk.kurulan > 0, true);
      assert.equal((await istek(yonetici, 'GET', `/portal/belge?yol=${KURULUM_ISARETI}`).then((c) => c.json() as { belge: Belge | null })).belge !== null, true);
    }
  });

  test('BD-13: kişi kendi firma kullanıcısını bir kez kurar; okuyan ve yazan kurabilir, portal işlemi olmayan 403', async () => {
    const benOku = async (cerez: string) => (await istek(cerez, 'GET', '/portal/ben')).json() as { portalKullanicisi: boolean };
    assert.equal((await benOku(yazar)).portalKullanicisi, false);
    const ilk = await istek(yazar, 'POST', '/portal/ben/hazirla');
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.deepEqual(ilk.json(), { kuruldu: true });
    assert.deepEqual((await istek(yazar, 'POST', '/portal/ben/hazirla')).json(), { kuruldu: false });
    assert.equal((await benOku(yazar)).portalKullanicisi, true);
    const belge = (await istek(yazar, 'GET', `/portal/belge?yol=${encodeURIComponent(`users/tmi-${String(yazarId)}`)}`)).json() as
      { belge: { veri: { partyId: string; name: string } } | null };
    assert.deepEqual([belge.belge?.veri.partyId, belge.belge?.veri.name], ['firm', 'Deneme yazar']);
    assert.equal((await istek(okur, 'POST', '/portal/ben/hazirla')).statusCode, 200);
    assert.equal((await istek(yetkisiz, 'POST', '/portal/ben/hazirla')).statusCode, 403);
  });

  test('BD-15: portal rolü TMI rolünden gelir; prototipten rol değiştiren yazma reddedilir, açılışta TMI rolüne döner', async () => {
    const yol = `users/tmi-${String(yoneticiId)}`;
    assert.equal((await istek(yonetici, 'POST', '/portal/ben/hazirla')).statusCode, 200);
    const oku = async () => ((await istek(yonetici, 'GET', `/portal/belge?yol=${encodeURIComponent(yol)}`)).json() as
      { belge: { veri: { role: string; tmiIzinler: string[] }; surum: number } }).belge;
    const ilk = await oku();
    assert.deepEqual([ilk.veri.role, ilk.veri.tmiIzinler], ['Genel müdür', ['*']]);
    const red = await yaz(yonetici, { yol, veri: { role: 'Muhasebe' }, kip: 'birlestir' });
    assert.equal(red.statusCode, 403, red.body);
    const ad = await yaz(yonetici, { yol, veri: { phone: '05000000000' }, kip: 'birlestir' });
    assert.equal(ad.statusCode, 200, ad.body);
    // Kural gelmeden önce düşürülmüş rol (eski kayıt) açılışta TMI rolüne döner.
    await vt().sorgu(`UPDATE portal_belge SET veri = jsonb_set(veri, '{role}', '"Muhasebe"') WHERE yol = $1`, [yol]);
    assert.equal((await istek(yonetici, 'POST', '/portal/ben/hazirla')).statusCode, 200);
    assert.equal((await oku()).veri.role, 'Genel müdür');

    // Bölüm yetkisi rol matrisinden gelir: yalnız finans bölümü olan kişi finans izinleriyle, tam yetkisiz açılır.
    const finansci = await islemliKisi('portalfinans', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.finans']);
    assert.equal((await istek(finansci.cerez, 'POST', '/portal/ben/hazirla')).statusCode, 200);
    const fYol = `users/tmi-${String(finansci.id)}`;
    const f = ((await istek(finansci.cerez, 'GET', `/portal/belge?yol=${encodeURIComponent(fYol)}`)).json() as
      { belge: { veri: { role: string; tmiIzinler: string[] } } }).belge.veri;
    assert.equal(f.role, 'Finans müdürü');
    assert.ok(f.tmiIzinler.includes('finance') && !f.tmiIzinler.includes('*') && !f.tmiIzinler.includes('purchase'));
  });

  test('BD-18: müdür rolündeki kişinin portal unvanı "Müdür"dür; eski "Satın alma müdürü" kaydı açılışta düzelir (kart #1163)', async () => {
    // Rolün işlemleri göçlerden gelir (dört bölüm); test kendi rolünü kurmaz.
    const mudurRol = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'mudur'");
    assert.ok(mudurRol);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Müdür', kullaniciAdi: 'portalmudur18', parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, mudurRol.id);
      for (const r of kisi.roller) if (r.id !== mudurRol.id) await rolAl(db, yoneticiId, yeni, r.id);
      return yeni;
    });
    const cerez = await girisCerezi('portalmudur18');
    const yol = `users/tmi-${String(id)}`;
    const oku = async () => ((await istek(cerez, 'GET', `/portal/belge?yol=${encodeURIComponent(yol)}`)).json() as
      { belge: { veri: { role: string; tmiRoller: string[]; unvan: string } } }).belge.veri;
    assert.equal((await istek(cerez, 'POST', '/portal/ben/hazirla')).statusCode, 200);
    const ilk = await oku();
    assert.equal(ilk.role, 'Müdür');
    // Görevi olmayan kişide unvan rol adıdır; prototip unvanı değiştiremez; kişi kartına görev girilince sonraki açılışta o görünür.
    assert.equal(ilk.unvan, 'Müdür');
    assert.equal((await yaz(cerez, { yol, veri: { unvan: 'Genel müdür' }, kip: 'birlestir' })).statusCode, 403);
    await vt().sorgu("UPDATE kisi SET gorev = 'Fabrika müdürü' WHERE id = $1", [id]);
    assert.equal((await istek(cerez, 'POST', '/portal/ben/hazirla')).statusCode, 200);
    assert.equal((await oku()).unvan, 'Fabrika müdürü');
    assert.deepEqual([...ilk.tmiRoller].sort(), ['Finans müdürü', 'Kalite mühendisi', 'Satın alma müdürü', 'Satış müdürü']);
    // Kart #1007 öncesi yazılmış kayıt: tek bölüm adı unvan olarak kalmışsa açılışta TMI rolüne döner.
    await vt().sorgu(`UPDATE portal_belge SET veri = jsonb_set(veri, '{role}', '"Satın alma müdürü"') WHERE yol = $1`, [yol]);
    assert.equal((await istek(cerez, 'POST', '/portal/ben/hazirla')).statusCode, 200);
    assert.equal((await oku()).role, 'Müdür');
  });

  test('BD-16: bölüm izni sunucuda uygulanır (KD-063); yalnız satın alma bölümü olan kişi satış ve finans kaydına yazamaz', async () => {
    const alici = await islemliKisi('portalalici', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satinalma']);
    const bolumsuz = await islemliKisi('portalbolumsuz', ['sayfa.portal', 'portal.oku', 'portal.yaz']);
    const kod = (r: { statusCode: number }) => r.statusCode;
    assert.equal(kod(await yaz(alici.cerez, { yol: 'rfqs/bd16', kip: 'tam', veri: { title: 'x' } })), 200);
    assert.equal(kod(await yaz(alici.cerez, { yol: 'orders/bd16', kip: 'tam', veri: { type: 'purchase' } })), 200);
    // Yalnız kalite bölümü olan kişi menüde gördüğü satış siparişini açamaz, satış teklifine yazamaz.
    const kaliteci = await islemliKisi('portalkalite', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.kalite']);
    assert.equal(kod(await yaz(kaliteci.cerez, { yol: 'orders/bd16s', kip: 'tam', veri: { type: 'sales' } })), 403);
    assert.equal(kod(await yaz(kaliteci.cerez, { yol: 'requests/bd16k', kip: 'tam', veri: talep() })), 403);
    assert.equal(kod(await yaz(kaliteci.cerez, { yol: 'ncrs/bd16', kip: 'tam', veri: { title: 'x' } })), 200);
    assert.equal(kod(await yaz(alici.cerez, { yol: 'requests/bd16', kip: 'tam', veri: talep() })), 403);
    assert.equal(kod(await yaz(alici.cerez, { yol: 'payments/bd16', kip: 'tam', veri: { amount: 1 } })), 403);
    assert.equal(kod(await yaz(alici.cerez, { yol: 'settings/main', kip: 'birlestir', veri: { rules: {} } })), 403);
    assert.equal(kod(await istek(alici.cerez, 'POST', '/portal/belge/kilitle', { yol: 'requests/bd16b', sahip: 's', sureMs: 1000 })), 403);
    assert.equal(kod(await istek(bolumsuz.cerez, 'POST', '/portal/belge/sil', { yol: 'rfqs/bd16' })), 403);
    // Bölüm izni olmayan kişi bölümsüz koleksiyona (mesaj, bildirim) ve kendi kullanıcısına yazar; başka firma kullanıcısına yazamaz.
    assert.equal(kod(await yaz(bolumsuz.cerez, { yol: 'messages/bd16', kip: 'tam', veri: { text: 'x' } })), 200);
    assert.equal(kod(await yaz(bolumsuz.cerez, { yol: `users/tmi-${String(yoneticiId)}`, kip: 'birlestir', veri: { phone: '1' } })), 403);
    assert.equal(kod(await yaz(yonetici, { yol: 'requests/bd16', kip: 'tam', veri: talep() })), 200);
  });

  test('BD-25: satın alma teslimi portalda alınmaz (238, H1); satın almacı ve tam yetki reddedilir, sevk ve fatura yazılır, eski teslim kalır', async () => {
    const alici = await islemliKisi('portalalici25', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satinalma', 'satin-alma.onayla']);
    const kod = (r: { statusCode: number }) => r.statusCode;
    const yolda = { id: 'd1', status: 'in_transit', qtys: [5] };
    const alindi = { ...yolda, status: 'received', acceptedQtys: [5], rejectedQtys: [0] };
    assert.equal(kod(await yaz(alici.cerez, { yol: 'orders/bd25', kip: 'tam', veri: { type: 'purchase', deliveries: [yolda] } })), 200);
    const red = await yaz(alici.cerez, { yol: 'orders/bd25', kip: 'birlestir', veri: { deliveries: [alindi] } });
    assert.equal(red.statusCode, 403, red.body);
    assert.match(red.body, /Mal kabul/);
    assert.equal(kod(await yaz(yonetici, { yol: 'orders/bd25', kip: 'birlestir', veri: { deliveries: [alindi] } })), 403);
    assert.equal(kod(await istek(yonetici, 'POST', '/portal/belge/kilitle', { yol: 'orders/bd25', sahip: 's', sureMs: 1000, veri: { deliveries: [alindi] } })), 403);
    assert.equal(kod(await yaz(yonetici, { yol: 'orders/bd25b', kip: 'tam', veri: { type: 'purchase', deliveries: [alindi] } })), 403);
    const okunan = await istek(alici.cerez, 'GET', '/portal/belge?yol=orders%2Fbd25');
    assert.deepEqual((okunan.json() as { belge: Belge }).belge.veri['deliveries'], [yolda]);
    assert.equal(kod(await yaz(alici.cerez, { yol: 'orders/bd25', kip: 'birlestir', veri: { invoices: [{ no: 'F1' }] } })), 200);
    // Satış siparişinin sevkiyatı (müşteri teslimi) bu kurala girmez.
    assert.equal(kod(await yaz(yonetici, { yol: 'orders/bd25s', kip: 'tam', veri: { type: 'sales', deliveries: [alindi] } })), 200);
  });

  test('BD-17: kalite satış ve satın alma kayıtlarını okuyamaz (kart #1162); liste süzülür, tek kayıt 403; bölümü okur', async () => {
    const satici = await islemliKisi('portalsatici17', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satis', 'siparisler.yaz']);
    const alici = await islemliKisi('portalalici17', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satinalma']);
    const kaliteci = await islemliKisi('portalkalite17', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.kalite']);
    const kod = (r: { statusCode: number }) => r.statusCode;
    const oku = (cerez: string, yol: string) => istek(cerez, 'GET', `/portal/belge?yol=${encodeURIComponent(yol)}`);
    assert.equal(kod(await yaz(satici.cerez, { yol: 'requests/bd17', kip: 'tam', veri: talep() })), 200);
    assert.equal(kod(await yaz(satici.cerez, { yol: 'orders/bd17s', kip: 'tam', veri: { type: 'sales' } })), 200);
    assert.equal(kod(await yaz(alici.cerez, { yol: 'orders/bd17a', kip: 'tam', veri: { type: 'purchase' } })), 200);
    assert.equal(kod(await yaz(alici.cerez, { yol: 'rfqs/bd17', kip: 'tam', veri: { title: 'x' } })), 200);

    assert.equal(kod(await oku(kaliteci.cerez, 'requests/bd17')), 403);
    assert.equal(kod(await oku(kaliteci.cerez, 'rfqs/bd17')), 403);
    assert.equal(kod(await oku(kaliteci.cerez, 'orders/bd17s')), 403);
    assert.equal(kod(await oku(kaliteci.cerez, 'orders/bd17a')), 200);
    assert.deepEqual(await sorgu(kaliteci.cerez, 'requests'), []);
    assert.deepEqual((await sorgu(kaliteci.cerez, 'orders')).map((b) => b.kimlik).filter((k) => k.startsWith('bd17')), ['bd17a']);
    // Kalite var olan siparişe yazamaz (önceki teslim alma izni kaldırıldı).
    assert.equal(kod(await yaz(kaliteci.cerez, { yol: 'orders/bd17s', kip: 'birlestir', veri: { note: 'x' } })), 403);
    assert.equal(kod(await yaz(kaliteci.cerez, { yol: 'orders/bd17a', kip: 'birlestir', veri: { note: 'x' } })), 403);

    assert.equal(kod(await oku(satici.cerez, 'requests/bd17')), 200);
    assert.equal(kod(await oku(satici.cerez, 'orders/bd17s')), 200);
    assert.equal(kod(await oku(alici.cerez, 'rfqs/bd17')), 200);
    assert.equal(kod(await yaz(alici.cerez, { yol: 'orders/bd17a', kip: 'birlestir', veri: { note: 'x' } })), 200);
    assert.deepEqual((await sorgu(satici.cerez, 'requests')).map((b) => b.kimlik).filter((k) => k === 'bd17'), ['bd17']);
    assert.equal(kod(await oku(yonetici, 'orders/bd17s')), 200);
  });

  test('BD-14: belgeye yalnız oturumdaki kişinin kimliği yeni yazılır; başkası adına geçmiş, onay ve kayıt reddedilir', async () => {
    const ben = `tmi-${String(yazarId)}`;
    const baskasi = `tmi-${String(yoneticiId)}`;
    assert.equal((await istek(yonetici, 'POST', '/portal/ben/hazirla')).statusCode, 200);
    const yol = `${yeniKoleksiyon()}/bd14`;
    const ilk = await yaz(yazar, { yol, kip: 'tam', veri: { status: 'pending', requestedBy: ben, history: [{ by: 'firm', u: ben, text: 'açıldı' }] } });
    assert.equal(ilk.statusCode, 200, ilk.body);
    // Var olan başka kişi kimliği korunarak yeniden yazılabilir; yeni eklenen kayıt başkası adına olamaz.
    for (const veri of [
      { status: 'approved', requestedBy: ben, steps: [{ status: 'approved', u: baskasi }], history: [{ by: 'firm', u: ben, text: 'açıldı' }] },
      { status: 'pending', requestedBy: ben, history: [{ by: 'firm', u: ben, text: 'açıldı' }, { by: 'firm', u: baskasi, text: 'onaylandı' }] },
      { status: 'pending', requestedBy: baskasi, history: [{ by: 'firm', u: ben, text: 'açıldı' }] },
    ]) {
      const r = await yaz(yazar, { yol, kip: 'tam', veri });
      assert.equal(r.statusCode, 403, `${JSON.stringify(veri)} -> ${r.body}`);
    }
    const birlestir = await yaz(yazar, { yol, kip: 'birlestir', veri: { doneBy: baskasi } });
    assert.equal(birlestir.statusCode, 403, birlestir.body);
    const kendiVerisi = { status: 'approved', createdBy: 'firm', requestedBy: ben, steps: [{ status: 'approved', u: ben }], history: [{ by: 'firm', u: ben, text: 'açıldı' }, { by: 'firm', u: ben, text: 'onaylandı' }] };
    const kendi = await yaz(yazar, { yol, kip: 'tam', veri: kendiVerisi });
    assert.equal(kendi.statusCode, 200, kendi.body);
    // Onay kaydında aynı gövde reddedilir: yazan kendi onayını genel yazmayla veremez (kart #1583).
    const onay = await yaz(yazar, { yol: 'approvals/bd14', kip: 'tam', veri: kendiVerisi });
    assert.equal(onay.statusCode, 403, onay.body);
  });

  test('BD-20: onay kararı yalnız onay ucundan; genel yazma kararı ve onay bekleyen kaydın durumunu değiştiremez (kart #1583)', async () => {
    const acan = await islemliKisi('onayacan', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satinalma']);
    const uzman = await islemliKisi('onayuzman', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satinalma']);
    const mudur = await islemliKisi('onaymudur', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satinalma', 'satin-alma.onayla']);
    for (const k of [acan.cerez, mudur.cerez, yonetici]) assert.equal((await istek(k, 'POST', '/portal/ben/hazirla')).statusCode, 200);
    const acanId = `tmi-${String(acan.id)}`;
    const karar = (cerez: string, kimlik: string, govde: Record<string, unknown>) => istek(cerez, 'POST', `/portal/onaylar/${kimlik}/karar`, govde);
    const okuOnay = async (kimlik: string): Promise<Record<string, unknown>> =>
      ((await istek(yonetici, 'GET', `/portal/belge?yol=approvals/${kimlik}`)).json() as { belge: Belge }).belge.veri;

    assert.equal((await yaz(acan.cerez, { yol: 'orders/o1583', kip: 'tam', veri: { type: 'purchase', no: 'SA-1583', approvalState: 'pending' } })).statusCode, 200);
    const onay = {
      kind: 'po', refCol: 'orders', refId: 'o1583', no: 'ONY-1583', amount: 300000, requestedBy: acanId, at: '2026-10-16T10:00:00.000Z', status: 'pending',
      steps: [{ role: 'Satın alma müdürü', status: 'pending' }, { role: 'Genel müdür', status: 'pending' }],
      history: [{ at: '2026-10-16T10:00:00.000Z', by: 'firm', u: acanId, text: 'Onaya gönderildi' }],
    };
    // Açılış: kararlı adım, onaylı durum ya da başkası adına açılış reddedilir.
    for (const veri of [
      { ...onay, status: 'approved' },
      { ...onay, steps: [{ role: 'Satın alma müdürü', status: 'approved', u: acanId }] },
      { ...onay, requestedBy: `tmi-${String(mudur.id)}` },
    ]) assert.equal((await yaz(acan.cerez, { yol: 'approvals/ap1583x', kip: 'tam', veri })).statusCode, 403, JSON.stringify(veri));
    const ac = await yaz(acan.cerez, { yol: 'approvals/ap1583', kip: 'tam', veri: onay });
    assert.equal(ac.statusCode, 200, ac.body);

    // Genel yazma kararı taklit edemez; onay yetkisi olan da edemez. Onay kaydı silinemez.
    const sahte = { ...onay, steps: [{ role: 'Satın alma müdürü', status: 'approved', u: `tmi-${String(mudur.id)}` }, { role: 'Genel müdür', status: 'pending' }] };
    assert.equal((await yaz(mudur.cerez, { yol: 'approvals/ap1583', kip: 'tam', veri: sahte })).statusCode, 403);
    assert.equal((await yaz(acan.cerez, { yol: 'approvals/ap1583', kip: 'birlestir', veri: { status: 'approved' } })).statusCode, 403);
    assert.equal((await istek(acan.cerez, 'POST', '/portal/belge/kilitle', { yol: 'approvals/ap1583', sahip: 'x', veri: { status: 'approved' } })).statusCode, 403);
    assert.equal((await istek(acan.cerez, 'POST', '/portal/belge/sil', { yol: 'approvals/ap1583' })).statusCode, 403);
    // Onay bekleyen siparişin durumu genel yazmayla değişmez; karara bağlı olmayan alan değişir.
    assert.equal((await yaz(acan.cerez, { yol: 'orders/o1583', kip: 'birlestir', veri: { approvalState: 'approved' } })).statusCode, 403);
    assert.equal((await yaz(acan.cerez, { yol: 'orders/o1583', kip: 'birlestir', veri: { approvalState: null } })).statusCode, 403);
    assert.equal((await yaz(acan.cerez, { yol: 'orders/o1583', kip: 'birlestir', veri: { note: 'not' } })).statusCode, 200);

    // Açan kendi onayını, onay yetkisi olmayan müdür adımını veremez.
    assert.equal((await karar(acan.cerez, 'ap1583', { onay: true })).statusCode, 403);
    assert.equal((await karar(uzman.cerez, 'ap1583', { onay: true })).statusCode, 403);
    assert.equal((await karar(okur, 'ap1583', { onay: true })).statusCode, 403);
    assert.equal((await karar(mudur.cerez, 'yok1583', { onay: true })).statusCode, 404);

    const ilk = await karar(mudur.cerez, 'ap1583', { onay: true, not: 'uygun' });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const sonra = await okuOnay('ap1583');
    const adim = (sonra['steps'] as Record<string, unknown>[])[0] ?? {};
    assert.equal(sonra['status'], 'pending');
    assert.equal(adim['status'], 'approved');
    assert.equal(adim['u'], `tmi-${String(mudur.id)}`);
    assert.ok(Math.abs(Date.parse(String(adim['at'])) - Date.now()) < 60_000, 'zaman sunucudan');
    // İkinci adım genel müdürün; müdür veremez. Onay hâlâ bekliyor: sipariş onaylanamaz.
    assert.equal((await karar(mudur.cerez, 'ap1583', { onay: true })).statusCode, 403);
    assert.equal((await yaz(acan.cerez, { yol: 'orders/o1583', kip: 'birlestir', veri: { approvalState: 'approved' } })).statusCode, 403);

    // Ret gerekçe ister; reddedilen onay siparişi yalnız "reddedildi" yapar.
    assert.equal((await karar(yonetici, 'ap1583', { onay: false })).statusCode, 400);
    assert.equal((await karar(yonetici, 'ap1583', { onay: false, not: 'bütçe yok' })).statusCode, 200);
    assert.equal((await okuOnay('ap1583'))['status'], 'rejected');
    assert.equal((await karar(yonetici, 'ap1583', { onay: true })).statusCode, 409);
    assert.equal((await yaz(acan.cerez, { yol: 'orders/o1583', kip: 'birlestir', veri: { approvalState: 'approved' } })).statusCode, 403);
    assert.equal((await yaz(acan.cerez, { yol: 'orders/o1583', kip: 'birlestir', veri: { approvalState: 'rejected' } })).statusCode, 200);
  });

  test('BD-21: iskonto onayına bağlı teklif onay karara bağlanmadan bekleyen onaydan çıkamaz (kart #1583)', async () => {
    // Satış müdürü kendi iskontosunu onaya göndermez (autoSkip); iki bölümlü "Müdür" gönderir.
    const satici = await islemliKisi('onaysatici', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satis', 'portal.finans', 'siparisler.yaz']);
    assert.equal((await istek(satici.cerez, 'POST', '/portal/ben/hazirla')).statusCode, 200);
    const ben = `tmi-${String(satici.id)}`;
    assert.equal((await yaz(satici.cerez, { yol: 'requests/r1583', kip: 'tam', veri: talep({ no: 'TT-1583', status: 'new', pendingApproval: 'ad1583', versions: [] }) })).statusCode, 200);
    const onay = {
      kind: 'discount', refCol: 'requests', refId: 'r1583', requestedBy: ben, at: '2026-10-16T10:00:00.000Z', status: 'pending',
      payload: { version: { prices: [1], discount: 30 } }, steps: [{ role: 'Satış müdürü', status: 'pending' }], history: [],
    };
    assert.equal((await yaz(satici.cerez, { yol: 'approvals/ad1583', kip: 'tam', veri: onay })).statusCode, 200);
    const surumlu = { no: 'TT-1583', status: 'quoted', pendingApproval: null, versions: [{ v: 1, prices: [1], discount: 30 }] };
    assert.equal((await yaz(satici.cerez, { yol: 'requests/r1583', kip: 'tam', veri: surumlu })).statusCode, 403);
    assert.equal((await istek(yonetici, 'POST', '/portal/onaylar/ad1583/karar', { onay: true })).statusCode, 200);
    const sonra = await yaz(satici.cerez, { yol: 'requests/r1583', kip: 'tam', veri: surumlu });
    assert.equal(sonra.statusCode, 200, sonra.body);
  });

  test('BD-24: onay adımlarını sunucu hesaplar; onay gerektiren kayıt onaysız ve düşük tutarlı onayla geçemez (B8)', async () => {
    const uzman = await islemliKisi('b8uzman', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satinalma']);
    const mudur = await islemliKisi('b8mudur', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satis', 'portal.finans']);
    for (const k of [uzman.cerez, mudur.cerez, yonetici]) assert.equal((await istek(k, 'POST', '/portal/ben/hazirla')).statusCode, 200);
    const uzmanId = `tmi-${String(uzman.id)}`;
    const kod = (r: { statusCode: number }) => r.statusCode;
    const karar = (kimlik: string) => istek(yonetici, 'POST', `/portal/onaylar/${kimlik}/karar`, { onay: true });
    // Satın alma limitleri tanımsız: satın almanın varsayılanları (50 000 / 250 000).
    const siparis = (tutar: number, ek: Record<string, unknown> = {}) => ({ type: 'purchase', no: 'SA-B8', items: [{ name: 'Mil', qty: 1, price: tutar }], ...ek });
    const onay = (refId: string, tutar: number, roller: string[]) => ({
      kind: 'po', refCol: 'orders', refId, no: 'ONY-B8', amount: tutar, requestedBy: uzmanId, at: '2026-10-23T10:00:00.000Z', status: 'pending',
      steps: roller.map((role) => ({ role, status: 'pending' })), history: [],
    });

    // Onaysız yazı: büyük sipariş onaya gitmeden kaydedilmez; genel müdür onaya göndermez (prototipin autoSkip kuralı).
    assert.equal(kod(await yaz(uzman.cerez, { yol: 'orders/b8a', kip: 'tam', veri: siparis(300000) })), 403);
    assert.equal(kod(await yaz(uzman.cerez, { yol: 'orders/b8a', kip: 'tam', veri: siparis(300000, { approvalState: 'approved' }) })), 403);
    assert.equal(kod(await yaz(uzman.cerez, { yol: 'orders/b8k', kip: 'tam', veri: siparis(40000) })), 200);
    assert.equal(kod(await yaz(yonetici, { yol: 'orders/b8y', kip: 'tam', veri: siparis(300000) })), 200);

    // Açılış: zincir sunucunun hesabıyla aynı olmalı.
    const eksik = await yaz(uzman.cerez, { yol: 'approvals/b8a', kip: 'tam', veri: onay('b8a', 300000, ['Satın alma müdürü']) });
    assert.equal(eksik.statusCode, 403);
    assert.match(eksik.body, /Satın alma müdürü → Genel müdür/);
    assert.equal(kod(await yaz(uzman.cerez, { yol: 'approvals/b8a', kip: 'tam', veri: onay('b8a', 40000, ['Satın alma müdürü']) })), 403);
    assert.equal(kod(await yaz(uzman.cerez, { yol: 'approvals/b8a', kip: 'tam', veri: onay('b8a', 300000, ['Satın alma müdürü', 'Genel müdür']) })), 200);
    assert.equal(kod(await yaz(uzman.cerez, { yol: 'orders/b8a', kip: 'tam', veri: siparis(300000, { approvalState: 'pending' }) })), 200);

    // Etki: düşük tutarla açılıp onaylanan onay büyütülmüş siparişi onaylatmaz; tutarı uyan sipariş onaylanır.
    assert.equal(kod(await yaz(uzman.cerez, { yol: 'approvals/b8b', kip: 'tam', veri: onay('b8b', 60000, ['Satın alma müdürü']) })), 200);
    assert.equal(kod(await yaz(uzman.cerez, { yol: 'orders/b8b', kip: 'tam', veri: siparis(60000, { approvalState: 'pending' }) })), 200);
    assert.equal(kod(await karar('b8b')), 200);
    const buyutulmus = await yaz(uzman.cerez, { yol: 'orders/b8b', kip: 'tam', veri: siparis(300000, { approvalState: 'approved' }) });
    assert.equal(buyutulmus.statusCode, 403);
    assert.match(buyutulmus.body, /Genel müdür/);
    assert.equal(kod(await yaz(uzman.cerez, { yol: 'orders/b8b', kip: 'tam', veri: siparis(60000, { approvalState: 'approved' }) })), 200);

    // Giden ödeme limit üstündeyse onaysız gönderilmez; onaya bekletilerek yazılır.
    const odeme = (durum: string) => ({ direction: 'out', status: durum, amount: 200000, partyId: 's1' });
    assert.equal(kod(await yaz(mudur.cerez, { yol: 'payments/b8', kip: 'tam', veri: odeme('sent') })), 403);
    assert.equal(kod(await yaz(mudur.cerez, { yol: 'payments/b8', kip: 'tam', veri: odeme('awaiting') })), 200);
  });

  test('BD-22: fiyat ve maliyet yalnız fiyat ve finans yetkisiyle görünür (karar 180); fiyatsız yazı gizli değeri silmez', async () => {
    const tam = await islemliKisi('fiyattam', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satis', 'siparisler.fiyat-oku', 'finans.oku']);
    const sevk = await islemliKisi('fiyatsevk', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satis']);
    const alici = await islemliKisi('fiyatalici', ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.satinalma']);
    const kod = (r: { statusCode: number }) => r.statusCode;
    const oku = async (cerez: string, yol: string) => {
      const cevap = await istek(cerez, 'GET', `/portal/belge?yol=${encodeURIComponent(yol)}`);
      return { durum: cevap.statusCode, veri: cevap.statusCode === 200 ? (cevap.json() as { belge: Belge }).belge.veri : null };
    };
    const siparis = { type: 'sales', no: 'SS-22', items: [{ name: 'Mil', qty: 4, price: 30 }], invoices: [{ no: 'F1', amount: 144 }], deliveries: [] };
    assert.equal(kod(await yaz(tam.cerez, { yol: 'orders/bd22', kip: 'tam', veri: siparis })), 200);
    assert.equal(kod(await yaz(tam.cerez, { yol: 'contracts/bd22', kip: 'tam', veri: { title: 'x', lines: [{ price: 5 }] } })), 200);
    assert.equal(kod(await yaz(tam.cerez, { yol: 'catalog/bd22', kip: 'tam', veri: { side: 'sales', name: 'Mil', price: 30 } })), 200);
    assert.equal(kod(await yaz(yonetici, { yol: 'payments/bd22', kip: 'tam', veri: { amount: 144 } })), 200);

    assert.deepEqual((await oku(tam.cerez, 'orders/bd22')).veri, siparis);
    const gizli = await oku(sevk.cerez, 'orders/bd22');
    assert.deepEqual(gizli.veri, { ...siparis, items: [{ name: 'Mil', qty: 4, price: null }], invoices: [] });
    assert.deepEqual((await oku(alici.cerez, 'orders/bd22')).veri?.['items'], [{ name: 'Mil', qty: 4, price: null }]);
    for (const yol of ['contracts/bd22', 'catalog/bd22', 'payments/bd22']) assert.equal((await oku(sevk.cerez, yol)).durum, 403, yol);
    assert.equal((await oku(tam.cerez, 'contracts/bd22')).durum, 200);
    assert.ok(!(await sorgu(sevk.cerez, 'catalog')).some((b) => b.kimlik === 'bd22'));
    assert.ok(!(await sorgu(sevk.cerez, 'contracts')).some((b) => b.kimlik === 'bd22'));

    // Sevk eden gördüğü fiyatsız belgeyi teslimle bütün yazar: fiyat ve fatura yerinde kalır, cevapta yine gizlidir.
    const sevkYazisi = await yaz(sevk.cerez, { yol: 'orders/bd22', kip: 'tam', veri: { ...gizli.veri, deliveries: [{ qtys: [4] }] } });
    assert.equal(kod(sevkYazisi), 200, sevkYazisi.body);
    assert.deepEqual((sevkYazisi.json() as { belge: Belge }).belge.veri['items'], [{ name: 'Mil', qty: 4, price: null }]);
    assert.deepEqual((await oku(tam.cerez, 'orders/bd22')).veri, { ...siparis, deliveries: [{ qtys: [4] }] });
  });

  test('BD-19: sipariş onay eşikleri satın alma limit tablosundan okunur; belgedeki eski değer ve tablo boşken satın almanın varsayılanı gelir', async () => {
    const yol = 'settings/main';
    await vt().sorgu('DELETE FROM portal_belge WHERE yol = $1', [yol]);
    await vt().sorgu('DELETE FROM satin_alma_onay_limiti');
    assert.equal((await yaz(yonetici, { yol, kip: 'tam', veri: { rules: { poMgr: 250000, poGM: 1000000, payFin: 150000 } } })).statusCode, 200);
    const oku = async (): Promise<Record<string, unknown>> => {
      const cevap = await istek(yonetici, 'GET', `/portal/belge?yol=${yol}`);
      assert.equal(cevap.statusCode, 200, cevap.body);
      const liste = (await sorgu(yonetici, 'settings')).find((b) => b.yol === yol);
      const tek = (cevap.json() as { belge: Belge }).belge.veri['rules'] as Record<string, unknown>;
      assert.deepEqual(liste?.veri['rules'], tek);
      return tek;
    };
    assert.deepEqual(await oku(), { payFin: 150000, poMgr: 50000, poGM: 250000 });
    await vt().sorgu(`INSERT INTO satin_alma_onay_limiti (sira, azami_tutar, seviye) VALUES (1, 50000, 'A'), (2, 250000, 'B'), (3, 1000000, 'C'), (4, NULL, 'D')`);
    assert.deepEqual(await oku(), { payFin: 150000, poMgr: 50000, poGM: 250000 });
    await vt().sorgu('UPDATE satin_alma_onay_limiti SET azami_tutar = 60000 WHERE sira = 1');
    assert.equal(((await oku())['poMgr']), 60000);
    await vt().sorgu('DELETE FROM satin_alma_onay_limiti');
  });

  test('BD-12: oda o an açık olanları durumlarıyla döner', async () => {
    const durum = encodeURIComponent(JSON.stringify({ yaziyor: 'genel' }));
    await istek(yazar, 'GET', `/portal/oda?durum=${durum}`);
    const esler = ((await istek(okur, 'GET', '/portal/oda')).json() as { esler: { kisiId: number; durum: Record<string, unknown> }[] }).esler;
    assert.deepEqual(esler.find((e) => e.kisiId === yazarId)?.durum, { yaziyor: 'genel' });
  });

  test('BD-21: kişiler, oda, damga ve ek okuması portal işlemi olmayana 403; ek yükleme yalnız portal.yaz ile', async () => {
    for (const url of ['/portal/kisiler', '/portal/oda', '/portal/damga', `/portal/ekler/${'0'.repeat(32)}`]) {
      assert.equal((await istek(yetkisiz, 'GET', url)).statusCode, 403, url);
    }
    const kisiler = await istek(okur, 'GET', '/portal/kisiler');
    assert.equal(kisiler.statusCode, 200, kisiler.body);
    assert.ok((kisiler.json() as { kisiler: unknown[] }).kisiler.length > 0);
    const ek = { ad: 'not.txt', tur: 'text/plain', veri: Buffer.from('x').toString('base64') };
    assert.equal((await istek(okur, 'POST', '/portal/ekler/yukle', ek)).statusCode, 403);
    assert.equal((await istek(yetkisiz, 'POST', '/portal/ekler/yukle', ek)).statusCode, 403);
  });
  test('BD-23 (312 b): kişi, teklif ve sipariş bağları yabancı anahtar; boş şemada doğrulanmış', async () => {
    const satirlar = await vt().sorgu<{ ad: string }>(
      `SELECT c.conrelid::regclass || '.' || a.attname || ' ' || c.confrelid::regclass || ' ' || c.convalidated AS ad
         FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.connamespace = current_schema()::regnamespace AND c.conname = ANY($1::text[]) ORDER BY 1`,
      [['portal_belge_olusturan_kisi_id_fk', 'portal_belge_guncelleyen_kisi_id_fk', 'portal_ek_yukleyen_kisi_id_fk', 'portal_siparis_bagi_teklif_id_fk', 'portal_siparis_bagi_siparis_id_fk']],
    );
    assert.deepEqual(satirlar.map((s) => s.ad), ['portal_belge.olusturan_kisi_id kisi true', 'portal_belge.guncelleyen_kisi_id kisi true', 'portal_ek.yukleyen_kisi_id kisi true', 'portal_siparis_bagi.teklif_id siparisler_teklif true', 'portal_siparis_bagi.siparis_id siparisler_siparis true'].sort());
  });
});
