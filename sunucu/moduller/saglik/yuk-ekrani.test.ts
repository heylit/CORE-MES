import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur, uygulamaKur } from '#cekirdek/uygulama.ts';
import type { TakilmaAni, TekrarSerisi } from '#cekirdek/istek-izleme.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { disBaglantilar } from './dis-baglanti.ts';
import { mesguUclariOzetle, sorguMetniniTemizle, yukAnligiYap, yukDakikasiHesapla } from './kurallar.ts';
import { vtSuAnOku } from './sorgular.ts';
import { suAnTopla } from './su-an.ts';
import { YukToplayici } from './yuk.ts';
import type { YukKaynagi } from './yuk.ts';
import { saglikUclari } from './uclar.ts';

const PAROLA = 'dogru-parola-1';
const dk = 60_000;

describe('yük kuralları (saf)', () => {
  test('sorgu metni: tırnaklı değer ve sayı maskelenir, boşluk teke iner, uzun metin kısalır', () => {
    assert.equal(sorguMetniniTemizle("UPDATE   kisi SET ad = 'Gizli Ad', no = 42 WHERE id = $1"), 'UPDATE kisi SET ad = ?, no = ? WHERE id = $1');
    assert.equal(sorguMetniniTemizle("SELECT 'it''s'"), 'SELECT ?');
    const uzun = sorguMetniniTemizle(`SELECT ${'a, '.repeat(200)}b`);
    assert.equal(uzun.length, 120);
    assert.ok(uzun.endsWith('…'));
  });

  test('anlıktan fark: dakika farkı uç başına; sayaç geri giderse o uç yok sayılır; istek almayan uç görünmez', () => {
    const sayac = (yol: string, sayi: number, toplamMs: number) => ({ yontem: 'GET', yol, sayi, toplamMs });
    const boyut = (yol: string, istek: number, sorgu: number, bayt: number, boyutlu: number, cakisma: number) => ({ yontem: 'GET', yol, toplamBayt: bayt, sayi: boyutlu, istek, toplamSorgu: sorgu, cakisma });
    const a = yukAnligiYap([sayac('/a', 10, 1000), sayac('/b', 5, 500)], [boyut('/a', 10, 30, 1000, 10, 1), boyut('/b', 5, 5, 0, 0, 0)]);
    const b = yukAnligiYap([sayac('/a', 14, 1800), sayac('/b', 5, 500), sayac('/c', 2, 40)], [boyut('/a', 14, 50, 1800, 14, 1), boyut('/b', 5, 5, 0, 0, 0), boyut('/c', 2, 2, 20, 2, 0)]);
    const fark = yukDakikasiHesapla(a, b, 123);
    assert.deepEqual(fark.uclar.map((u) => [u.yol, u.istek, u.toplamMs, u.toplamSorgu, u.toplamBayt, u.cakisma]), [['/a', 4, 800, 20, 800, 0], ['/c', 2, 40, 2, 20, 0]]);
    const geri = yukDakikasiHesapla(b, a, 5);
    assert.deepEqual(geri.uclar, [], 'sayaç geriye gittiyse (yeniden açılış) negatif uydurulmaz');
  });

  test('en meşgul: toplam süreye göre sıralı; ortalama ve sorgu/istek hesaplanır; boyutu bilinmeyen uçta cevap boyutu null; dönem dışı dakika sayılmaz', () => {
    const u = (yol: string, istek: number, ms: number, sorgu: number, bayt: number, boyutlu: number, c: number) => ({ yontem: 'GET', yol, istek, toplamMs: ms, toplamSorgu: sorgu, toplamBayt: bayt, boyutluCevap: boyutlu, cakisma: c });
    const dakikalar = [
      { an: 1000, uclar: [u('/eski', 100, 99_999, 0, 0, 0, 0)] },
      { an: 5000, uclar: [u('/plan', 1, 20_000, 8, 400, 1, 1), u('/liste', 100, 40_000, 3100, 9600, 100, 0)] },
      { an: 6000, uclar: [u('/plan', 1, 22_000, 8, 420, 1, 3), u('/saglik', 800, 9_000, 800, 0, 0, 0)] },
    ];
    const o = mesguUclariOzetle(dakikalar, 2000);
    assert.deepEqual(o.map((x) => x.yol), ['/plan', '/liste', '/saglik']);
    assert.deepEqual(o[1], { yontem: 'GET', yol: '/liste', istek: 100, toplamMs: 40_000, ortMs: 400, sorguIstekBasina: 31, ortCevapBayt: 96, cakisma409: 0 });
    assert.deepEqual({ ort: o[0]?.ortMs, c: o[0]?.cakisma409, s: o[0]?.sorguIstekBasina, b: o[0]?.ortCevapBayt }, { ort: 21_000, c: 4, s: 8, b: 410 });
    assert.equal(o[2]?.ortCevapBayt, null);
  });
});

describe('yük toplayıcı', () => {
  const tekrar = (sayi: number, durum: number, sonAn: number): TekrarSerisi => ({ kisiId: 12, yontem: 'POST', adres: '/plan/hesapla', sayi, hatali: durum >= 400 ? sayi - 1 : 0, cakisma: 0, sonDurum: durum, sonHata: durum >= 400 ? 'Önceki çözüm sürüyor' : null, ilkAn: sonAn - 1000, sonAn });
  const takilma = (an: number): TakilmaAni => ({ an, takilmaMs: 640.4, suren: [{ yontem: 'POST', adres: '/plan/hesapla', kisiId: 12, sureMs: 38_040 }], sonBiten: null });

  function kaynakKur() {
    let an = Date.parse('2026-11-24T10:00:00.000Z');
    const durum = { sayac: [] as ReturnType<typeof yukAnligiYap>, tekrar: [] as TekrarSerisi[], takilma: [] as TakilmaAni[] };
    const k: YukKaynagi = {
      simdi: () => an,
      anlik: () => durum.sayac,
      tekrarlar: () => durum.tekrar.splice(0),
      takilmalar: () => durum.takilma.splice(0),
      ekranlar: () => [{ ekran: 'kokpit', istekDk: 42, kisiSayisi: 6 }],
      esik: () => ({ tekrarEsik: 3, tekrarPencereMs: 120_000, takilmaEsikMs: 200 }),
    };
    return { k, durum, ilerle: (ms: number) => { an += ms; }, an: () => an };
  }

  test('ilk tur yalnız taban alır; sonraki tur farkı yazar; okuma tamamlanmamış dakikayı da katar; açılıştan kısa dönemde başlangıç açılıştır', () => {
    const { k, durum, ilerle } = kaynakKur();
    const t = new YukToplayici(k);
    const mk = (istek: number, ms: number) => [{ yontem: 'GET', yol: '/a', istek, toplamMs: ms, toplamSorgu: istek * 2, toplamBayt: istek * 10, boyutluCevap: istek, cakisma: 0 }];
    durum.sayac = mk(0, 0);
    t.tur();
    ilerle(dk);
    durum.sayac = mk(10, 1000);
    t.tur();
    ilerle(30_000);
    durum.sayac = mk(14, 1600);
    const o = t.oku('24s');
    assert.equal(o.baslangic, t.sunucuAcilis());
    assert.deepEqual(o.mesguUclar.map((x) => [x.yol, x.istek, x.toplamMs, x.sorguIstekBasina, x.ortCevapBayt]), [['/a', 14, 1600, 2, 10]]);
    assert.deepEqual(o.ekranlar, [{ ekran: 'kokpit', istekDk: 42, kisiSayisi: 6 }]);
    assert.equal(o.takilmaEsikMs, 200);
    assert.deepEqual(o.tekrarEsik, { kez: 3, saniye: 120 });
  });

  test('tekrar serisi aynı pencerede tek kayıt; hatalı olan üstte; takılma kaydı iki kez sayılmaz; dönem dışı kayıt görünmez', () => {
    const { k, durum, ilerle, an } = kaynakKur();
    const t = new YukToplayici(k);
    const sonAn = an();
    durum.tekrar = [tekrar(3, 200, sonAn), { ...tekrar(5, 409, sonAn + 1000), kisiId: 7 }];
    durum.takilma = [takilma(sonAn)];
    t.tur();
    durum.tekrar = [tekrar(4, 200, sonAn + 2000)];
    const o = t.oku('24s');
    assert.deepEqual(o.tekrarlar.map((x) => [x.kisiId, x.kez, x.sonDurum]), [[7, 5, 409], [12, 4, 200]]);
    assert.equal(o.takilmalar.length, 1);
    assert.deepEqual({ ms: o.takilmalar[0]?.takilmaMs, sn: o.takilmalar[0]?.suren[0]?.sureSn }, { ms: 640, sn: 38 });
    assert.equal(t.oku('24s').takilmalar.length, 1, 'ikinci okuma kaydı yeniden eklemez');
    ilerle(2 * 60 * dk);
    assert.equal(t.oku('1s').tekrarlar.length, 0, 'bir saatten eski kayıt 1 saatlik dönemde görünmez');
    assert.equal(t.oku('24s').tekrarlar.length, 2);
  });
});

describe('şu an ve dış bağlantılar (kaynaklı)', () => {
  test('süren istekten kendi ucu çıkar; plan hesapları sırayla; veritabanı okunamazsa null ve ekranın geri kalanı düşmez; sorgu metni maskelenir', async () => {
    const plan = { motor: { calisan: 1, toplam: 4, zamanAsimi: 0, bellek: 0, hata: 0, sonSureMs: 21_000, enUzunSureMs: 38_000 }, degerlendirme: { calisan: 0, toplam: 0, zamanAsimi: 0, bellek: 0, hata: 0, sonSureMs: null, enUzunSureMs: null }, teklif: { calisan: 0, toplam: 0, zamanAsimi: 0, bellek: 0, hata: 0, sonSureMs: null, enUzunSureMs: null }, yillik: { calisan: 0, toplam: 2, zamanAsimi: 2, bellek: 1, hata: 0, sonSureMs: 60_000, enUzunSureMs: 60_000 } };
    const kaynak = {
      simdi: () => Date.parse('2026-11-24T12:00:00.000Z'),
      suren: () => [{ yontem: 'POST', adres: '/plan/hesapla', kisiId: 12, sureMs: 38_040 }, { yontem: 'GET', adres: '/saglik/su-an', kisiId: 1, sureMs: 2 }],
      plan: () => plan,
      oturum: () => Promise.resolve(14),
      vt: () => Promise.resolve({ baglanti: 9, azami: 40, kilitler: [{ sorgu: "UPDATE uretim_emirleri SET not = 'gizli' WHERE id = 7", bekletenIslem: 4412, beklemeSn: 4.26 }, { sorgu: null, bekletenIslem: 7, beklemeSn: 1 }] }),
      bellek: () => ({ yiginBayt: 1_600_000_000, yiginSiniriBayt: 2_000_000_000, rssBayt: 2_000_000_000 }),
      acilis: () => '2026-11-24T00:14:00.000Z',
    };
    const o = await suAnTopla({} as never, kaynak);
    assert.deepEqual(o.surenIstekler, [{ yontem: 'POST', adres: '/plan/hesapla', kisiId: 12, sureSn: 38 }]);
    assert.deepEqual(o.planHesaplari.map((p) => [p.tur, p.calisan, p.zamanAsimi, p.bellekAsimi]), [['motor', 1, 0, 0], ['degerlendirme', 0, 0, 0], ['teklif', 0, 0, 0], ['yillik', 0, 2, 1]]);
    assert.deepEqual({ oturum: o.acikOturum, vt: o.veritabani }, { oturum: 14, vt: { baglanti: 9, azami: 40, kilitBekleyen: 2 } });
    assert.deepEqual(o.kilitler.map((l) => [l.sorgu, l.bekletenIslem, l.beklemeSn]), [['UPDATE uretim_emirleri SET not = ? WHERE id = ?', 4412, 4.3], ['Görünmeyen sorgu', 7, 1]]);
    const bozuk = await suAnTopla({} as never, { ...kaynak, vt: () => Promise.reject(new Error('düştü')), oturum: () => Promise.reject(new Error('düştü')) });
    assert.deepEqual({ oturum: bozuk.acikOturum, vt: bozuk.veritabani, kilit: bozuk.kilitler }, { oturum: null, vt: null, kilit: [] });
    assert.equal(bozuk.planHesaplari.length, 4);
  });

  test('dış bağlantılar: açık/kapalı yalnız bildirenlerden; bildirmeyen "bilinmiyor"; ölçülmeyen alan null', () => {
    const b = disBaglantilar({ smartes: () => true, logo: () => false, etiketYazicisi: () => true });
    assert.deepEqual(b.map((x) => [x.anahtar, x.durum]), [['smartes', 'calisiyor'], ['logo', 'kapali'], ['tezgah', 'bilinmiyor'], ['eposta', 'bilinmiyor'], ['etiket-yazicisi', 'calisiyor']]);
    assert.deepEqual(disBaglantilar({ smartes: () => null, logo: () => null, etiketYazicisi: () => null }).filter((x) => x.durum === 'bilinmiyor').length, 5, 'okuyucu bağlı değilse beş bağlantı da bilinmiyor');
    assert.ok(b.every((x) => x.sonBasari === null && x.sonHata === null && x.bekleyen === null && x.yenidenDenenen === null));
  });
});

describe('şu an, yük ve dış bağlantı uçları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let uyg: FastifyInstance;
  let yonetici = '';
  let izleyen = '';
  const acik = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam; };

  before(async () => {
    ortam = await testVeritabaniKur('saglikyuk');
    const tam = await uygulamaKur({ vt: acik().vt, ayar: acik().ayar, kimlik: kimlikCozucu(acik().vt) });
    await acik().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const id = await acik().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'izleyen', parola: PAROLA }));
    await acik().vt.sorgu("INSERT INTO rol (kod, ad) VALUES ('izleyen', 'İzleyen')");
    await acik().vt.sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'izleyen') WHERE kisi_id = $1", [id]);
    const giris = async (kullaniciAdi: string): Promise<string> => {
      const c = await tam.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
      assert.equal(c.statusCode, 200, c.body);
      return String(c.headers['set-cookie'] ?? '').split(';')[0] ?? '';
    };
    yonetici = await giris('yonetici');
    izleyen = await giris('izleyen');
    await tam.close();
    uyg = Fastify();
    hataYonetiminiKur(uyg);
    const toplayici = new YukToplayici({
      simdi: () => Date.now(), anlik: () => [], tekrarlar: () => [], takilmalar: () => [], ekranlar: () => [], esik: () => ({ tekrarEsik: 3, tekrarPencereMs: 120_000, takilmaEsikMs: 200 }),
    });
    uclariKaydet(uyg, saglikUclari(30, {
      ayarOku: () => ({ commit: null, ortam: 'test' }), gitOku: async () => null, yuk: toplayici,
      disBaglanti: { smartes: () => false, logo: () => false, etiketYazicisi: () => false },
    }), { vt: acik().vt, kimlik: kimlikCozucu(acik().vt) });
  });
  after(async () => {
    await uyg.close();
    await ortam?.kaldir();
  });

  test('üç uç: kimliksiz 401, saglik.ayrinti-oku olmayana 403, yöneticiye sözleşmeye uyan cevap', async () => {
    for (const yol of ['/api/saglik/su-an', '/api/saglik/yuk', '/api/saglik/dis-baglantilar']) {
      assert.equal((await uyg.inject({ method: 'GET', url: yol })).statusCode, 401, yol);
      assert.equal((await uyg.inject({ method: 'GET', url: yol, headers: { cookie: izleyen } })).statusCode, 403, yol);
      const c = await uyg.inject({ method: 'GET', url: yol, headers: { cookie: yonetici } });
      assert.equal(c.statusCode, 200, `${yol} ${c.body}`);
    }
    const su = (await uyg.inject({ method: 'GET', url: '/api/saglik/su-an', headers: { cookie: yonetici } })).json();
    assert.ok(su.veritabani.baglanti >= 1 && su.veritabani.azami >= su.veritabani.baglanti);
    assert.equal(typeof su.acikOturum, 'number');
    assert.equal(su.planHesaplari.length, 4);
    assert.equal((await uyg.inject({ method: 'GET', url: '/api/saglik/yuk?donem=7g', headers: { cookie: yonetici } })).statusCode, 400);
    assert.equal((await uyg.inject({ method: 'GET', url: '/api/saglik/yuk?donem=1s', headers: { cookie: yonetici } })).json().donem, '1s');
    assert.deepEqual((await uyg.inject({ method: 'GET', url: '/api/saglik/dis-baglantilar', headers: { cookie: yonetici } })).json().baglantilar.map((b: { durum: string }) => b.durum), ['kapali', 'kapali', 'bilinmiyor', 'bilinmiyor', 'kapali']);
  });

  test('kilit beklemesi gerçek veritabanında görülür: bekleten işlem numarası ve parametresiz sorgu metni', async () => {
    const vt = acik().vt;
    const sahip = acik().sahip;
    await sahip.sorgu('CREATE TABLE kilit_denemesi (id int PRIMARY KEY, ad text)');
    await sahip.sorgu("INSERT INTO kilit_denemesi VALUES (1, 'a')");
    await sahip.sorgu('GRANT SELECT, UPDATE ON kilit_denemesi TO tmiv2_uygulama');
    let birak = (): void => undefined;
    const tutulan = new Promise<void>((coz) => { birak = coz; });
    let kilitlendi = (): void => undefined;
    const hazir = new Promise<void>((coz) => { kilitlendi = coz; });
    const tutan = vt.tx(async (db) => {
      await db.sorgu("UPDATE kilit_denemesi SET ad = 'b' WHERE id = 1");
      kilitlendi();
      await tutulan;
    });
    await hazir;
    const bekleyen = vt.tx((db) => db.sorgu("UPDATE kilit_denemesi SET ad = 'c' WHERE id = 1"));
    const kendi = async (): Promise<NonNullable<Awaited<ReturnType<typeof vtSuAnOku>>>['kilitler']> =>
      ((await vtSuAnOku(vt))?.kilitler ?? []).filter((k) => (k.sorgu ?? '').includes('kilit_denemesi'));
    let kilitler = await kendi();
    for (let i = 0; i < 50 && kilitler.length === 0; i += 1) {
      await new Promise((coz) => setTimeout(coz, 100));
      kilitler = await kendi();
    }
    birak();
    await Promise.all([tutan, bekleyen]);
    assert.equal(kilitler.length, 1);
    assert.ok((kilitler[0]?.bekletenIslem ?? 0) > 0);
    assert.match(sorguMetniniTemizle(kilitler[0]?.sorgu ?? ''), /^UPDATE kilit_denemesi SET ad = \$?\??\d*\s?\??/);
  });
});
