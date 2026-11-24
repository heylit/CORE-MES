import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { ErpKoduDoldurCevabi, ErpKoduOzetiCevabi, LogoGecisCevabi, LogoGeriAlCevabi, LogoTopluCevabi, LogoyaGonderCevabi, LogoGecisKartiCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { logoAynaOzetiCozucusu, logoEslemeYaziciCozucusu, logoKartAynasiCozucusu, logoTmiKodCozucusu } from './disari.ts';
import type { LogoAynaKarti } from './disari.ts';
import { logoGecisAdayligi, logoKullanimEsigi, logoKullanimNedenleri } from './kurallar.ts';
import { tamGovde } from './test-kart.ts';

const PAROLA = 'dogru-parola-1';

describe('Logo geçişi toplu adaylık kuralı (3068 a)', () => {
  const tmi = { birim: 'kg', onayDurumu: 'taslak' };
  const karsilik = [{ tmiDegeri: 'kg', logoDegeri: '06' }];
  const aday = (o: Partial<Parameters<typeof logoGecisAdayligi>[0]>) =>
    logoGecisAdayligi({ durum: 'bagsiz', aktif: true, koduUyar: true, logoBirimSeti: '06', tmi, birimKarsiliklari: karsilik, ...o });

  test('LGG-1 toplu bağlama yalnız aynı kod ve aynı birimde; toplu alma yalnız uyan kodlu yeni kartta; ötekiler karar nedeniyle döner', () => {
    assert.deepEqual(aday({}), { topluBaglanir: true, topluAlinir: false, kararNedeni: null });
    assert.deepEqual(aday({ logoBirimSeti: 'KG', tmi: { birim: 'kg', onayDurumu: 'taslak' }, birimKarsiliklari: [] }), { topluBaglanir: true, topluAlinir: false, kararNedeni: null }, 'harf farkı');
    assert.equal(aday({ logoBirimSeti: '07' }).kararNedeni, 'birim-farki');
    assert.equal(aday({ logoBirimSeti: null }).kararNedeni, 'birim-farki');
    assert.equal(aday({ tmi: { birim: 'kg', onayDurumu: 'iptal' } }).kararNedeni, 'iptal-kart');
    assert.equal(aday({ aktif: false }).kararNedeni, 'kullanim-disi');
    assert.deepEqual(aday({ durum: 'yeni', tmi: null }), { topluBaglanir: false, topluAlinir: true, kararNedeni: null });
    assert.equal(aday({ durum: 'yeni', tmi: null, koduUyar: false }).kararNedeni, 'kod-eslenecek');
    assert.deepEqual(aday({ durum: 'bagli' }), { topluBaglanir: false, topluAlinir: false, kararNedeni: null });
    assert.deepEqual(aday({ durum: 'kod-cakismasi' }), { topluBaglanir: false, topluAlinir: false, kararNedeni: null }, '3629: kod çakışmasında toplu işlem yok');
  });
});

describe('Logo geçişi kullanım ölçütü (3079 a)', () => {
  test('LGG-8 eşik bugünden 12 ay önce, ay sonu taşmaz; nedenler stok > 0, eşikten bu yana hareket, açık sipariş; iz yoksa yalnız stok', () => {
    assert.equal(logoKullanimEsigi('2026-11-12'), '2025-11-12');
    assert.equal(logoKullanimEsigi('2024-02-29'), '2023-02-28');
    assert.equal(logoKullanimEsigi('2026-01-31'), '2025-01-31');
    const esik = '2025-11-12';
    assert.deepEqual(logoKullanimNedenleri({ stok: '3', sonHareket: '2025-11-12', acikSiparis: true }, esik), ['stok', 'hareket', 'siparis']);
    assert.deepEqual(logoKullanimNedenleri({ stok: '0', sonHareket: '2025-11-11', acikSiparis: false }, esik), []);
    assert.deepEqual(logoKullanimNedenleri({ stok: '-1', sonHareket: null, acikSiparis: null }, esik), []);
    assert.deepEqual(logoKullanimNedenleri({ stok: '0.5', sonHareket: null, acikSiparis: null }, esik), ['stok']);
  });
});

describe('Logo geçişi: liste, toplu bağla ve al, geri al (3068 a; gerçek PostgreSQL, sahte ayna)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let okuyucuCerezi = '';
  let ikinciCerez = '';
  type AynaSatiri = LogoAynaKarti & { stok: string | null; sonHareket: string | null; acikSiparis: boolean | null };
  const ayna: AynaSatiri[] = [];
  const eslemeler = new Map<string, string>();
  // 3079 a: kullanım izinin son tam turu; null iken izi okunmamış sayılır.
  let kullanimTamam: string | null = null;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = cerez) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c, 'istek-kimligi': randomUUID() }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const tamam = async <T>(yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = cerez): Promise<T> => {
    const r = await istek(yontem, yol, govde, c);
    assert.equal(r.statusCode, 200, `${yol}: ${r.body}`);
    return r.json() as T;
  };
  const kart = (ref: number, kod: string, ek: Partial<AynaSatiri> = {}): AynaSatiri => ({
    logoKayitNo: ref, kod, ad: `Logo ${kod}`, aciklama2: null, aciklama3: null, kartTuru: 10, birimSeti: '06', aktif: true,
    sonOkuma: '2026-11-12T06:00:00.000Z', stok: '5', sonHareket: null, acikSiparis: null, ...ek,
  });
  const kartSatiri = (kimlik: string) => vt().tek<{ kod: string; logo: string | null; gonderim: string | null; set: string | null; surum: number }>(
    `SELECT stok_kodu AS kod, logo_kayit_no AS logo, logo_gonderim_durumu AS gonderim, logo_birim_seti AS set, surum FROM malzeme_katalog_karti WHERE kimlik = $1`,
    [kimlik],
  );
  // 3474-3: kartın "Eski / ERP kodu" alanı.
  const erpKodu = async (kimlik: string): Promise<string | null> =>
    (await vt().tek<{ e: string | null }>("SELECT kayit -> 'com' ->> 'eskiKod' AS e FROM malzeme_katalog_karti WHERE kimlik = $1", [kimlik]))?.e ?? null;
  let sayac = 0;
  // Taslak kodu önekteki sıradan gelir; Logo kopyasındaki kart dönen kodla kurulur.
  async function taslakAc(kod: string, eskiKod?: string): Promise<{ kimlik: string; kod: string; surum: number }> {
    const kimlik = `lgg${++sayac}`;
    const url = `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
    const govde = {
      kayit: {
        id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod, ad: `CORE ${kimlik}`, birim: 'kg', ...(eskiKod === undefined ? {} : { eskiKod }) }, onay: { durum: 'taslak' },
      },
      ozet: { benzersiz_anahtar: `hammadde|metal|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
    };
    const r = await tamam<{ stok_kodu: string; surum: number }>('POST', url, tamGovde(url, govde));
    return { kimlik, kod: r.stok_kodu, surum: r.surum };
  }
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };

  before(async () => {
    ortam = await testVeritabaniKur('malzemelogogecis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Gecis', kullaniciAdi: 'lgg-yonetici', parola: PAROLA }));
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Ikinci', kullaniciAdi: 'lgg-ikinci', parola: PAROLA }));
    const opId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Okuyucu', kullaniciAdi: 'lgg-okuyucu', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('lggokuyucu', 'Okuyucu')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.malzemeler' FROM rol WHERE kod = 'lggokuyucu'");
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'lggokuyucu') WHERE kisi_id = $1", [opId]);
    cerez = await giris('lgg-yonetici');
    ikinciCerez = await giris('lgg-ikinci');
    okuyucuCerezi = await giris('lgg-okuyucu');
    logoKartAynasiCozucusu(async (_db, o) => ayna
      .filter((k) => k.logoKayitNo > o.sonra && (o.kodlar === undefined || o.kodlar.includes(k.kod)))
      .sort((a, b) => a.logoKayitNo - b.logoKayitNo).slice(0, o.sinir));
    logoAynaOzetiCozucusu(async (_db, o) => ({
      kartlar: ayna.filter((k) => o.ara === undefined || k.kod.toLowerCase().includes(o.ara.toLowerCase()))
        .map((k) => ({ logoKayitNo: k.logoKayitNo, kod: k.kod, aktif: k.aktif, stok: k.stok, sonHareket: k.sonHareket, acikSiparis: k.acikSiparis })),
      okuma: { acik: false, suruyor: false, okunan: ayna.length, sonTamam: null },
      kullanim: { acik: false, sonTamam: kullanimTamam },
      arama: { acik: false },
    }));
    // Eşleme logo modülünde değişmez bir tablodur; burada bellekte tutulur (3316 a: toplu alma da eşleme yazar).
    logoEslemeYaziciCozucusu(async (_db, e) => {
      if (eslemeler.has(e.logoKodu)) throw new Error('eşleme değişmez');
      eslemeler.set(e.logoKodu, e.stokKodu);
    });
    logoTmiKodCozucusu(async (_db, kodlar) => new Map([...eslemeler].filter(([l]) => kodlar.includes(l))));
    await vt().sorgu("INSERT INTO logo_birim_seti (kod, elle, ekleyen_kisi_id) SELECT '06', true, (SELECT min(id) FROM kisi) ON CONFLICT (kod) DO NOTHING");
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: '06' });
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'hammadde', logoDegeri: '10' });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('LGG-2 liste: açılışta stoğu olanlar; süzgeç sayıları bütün kopyadan; okuyan da görür, toplu işleyemez', async () => {
    const a = await taslakAc('HM-LGG-00001');
    ayna.push(kart(201, a.kod), kart(202, 'HM-LGY-00002', { stok: null }), kart(203, 'HM-LGY-00003', { aktif: false }));
    const l = await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi', undefined, okuyucuCerezi);
    assert.deepEqual(l.kartlar.map((k) => [k.kod, k.durum, k.topluBaglanir, k.topluAlinir]), [[a.kod, 'bagsiz', true, false], ['HM-LGY-00003', 'yeni', false, false]]);
    assert.deepEqual({ ...l.sayilar, kararBekleyen: undefined }, { toplam: 3, stoklu: 2, yeni: 2, bagsiz: 1, bagli: 0, kodCakismasi: 0, kullanimDisi: 1, kullanilan: null, kararBekleyen: undefined });
    assert.deepEqual([l.suzgec, l.kullanim, l.kartlar[0]?.kullanimNedenleri], ['stoklu', false, null], 'kullanım izi okunmadan süzgeç stoğu olanlar');
    const yeni = await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi?suzgec=yeni&ara=LGY-00002', undefined, okuyucuCerezi);
    assert.deepEqual(yeni.kartlar.map((k) => k.kod), ['HM-LGY-00002']);
    // 3319: katalogdaki canlı aramanın bulduğu kayıtlar süzgeçsiz gelir (stoksuz ve kullanım dışı da); bozuk liste reddedilir.
    const istenen = await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi?suzgec=stoklu&kayitlar=202,203,999', undefined, okuyucuCerezi);
    assert.deepEqual(istenen.kartlar.map((k) => [k.kod, k.durum, k.aktif]), [['HM-LGY-00002', 'yeni', true], ['HM-LGY-00003', 'yeni', false]]);
    assert.equal(istenen.uyan, 2);
    assert.equal((await istek('GET', '/malzeme-logo-gecisi?kayitlar=1,x', undefined, okuyucuCerezi)).statusCode, 400);
    assert.equal((await istek('GET', `/malzeme-logo-gecisi?kayitlar=${Array.from({ length: 21 }, (_, i) => i + 1).join(',')}`, undefined, okuyucuCerezi)).statusCode, 400, 'en çok 20');
    const r = await istek('POST', '/malzeme-logo-gecisi/toplu-bagla', { kartlar: [{ logoKayitNo: 201, surum: a.surum }] }, okuyucuCerezi);
    assert.equal(r.statusCode, 403);
    assert.equal((await kartSatiri(a.kimlik))?.logo, null);
  });

  test('LGG-3 toplu bağla ve geri al: uygun kart bağlanır, birimi farklı atlanır; geri almada bağ boşalır ve önceki gönderim durumu döner', async () => {
    const b = await taslakAc('HM-LGG-00010');
    const c = await taslakAc('HM-LGG-00011');
    ayna.push(kart(210, b.kod), kart(211, c.kod, { birimSeti: '07' }));
    const once = await kartSatiri(b.kimlik);
    const s = await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-bagla', { kartlar: [{ logoKayitNo: 210, surum: b.surum }, { logoKayitNo: 211, surum: c.surum }] });
    assert.equal(s.tur, 'bagla');
    assert.deepEqual(s.basarili, [{ logoKayitNo: 210, kod: b.kod, stokKodu: b.kod, erp: 'yazildi', mevcutErpKodu: null }], JSON.stringify(s.atlanan));
    assert.equal(await erpKodu(b.kimlik), b.kod, '3474-3: bağlanan kartın ERP kodu Logo kodu');
    assert.deepEqual(s.atlanan.map((x) => [x.kod, x.neden]), [[c.kod, 'Birim farklı; tek tek bağlayın.']]);
    assert.deepEqual({ ...(await kartSatiri(b.kimlik)), surum: undefined }, { kod: b.kod, logo: '210', gonderim: 'gonderildi', set: '06', surum: undefined });
    assert.equal((await kartSatiri(c.kimlik))?.logo, null);

    assert.equal((await istek('POST', '/malzeme-logo-gecisi/geri-al', { islem: s.islem }, ikinciCerez)).statusCode, 404, 'başkasının işlemi geri alınmaz');
    const g = await tamam<LogoGeriAlCevabi>('POST', '/malzeme-logo-gecisi/geri-al', { islem: s.islem });
    assert.deepEqual(g, { geriAlinan: 1, atlanan: [] });
    const sonra = await kartSatiri(b.kimlik);
    assert.deepEqual({ ...sonra, surum: undefined }, { ...once, surum: undefined });
    assert.equal(sonra!.surum, once!.surum + 3, 'bağlama, ERP kodu ve geri alma sürüm artırır');
    assert.equal(await erpKodu(b.kimlik), null, 'geri almada bağlamanın yazdığı ERP kodu silinir');
    assert.equal((await istek('POST', '/malzeme-logo-gecisi/geri-al', { islem: s.islem })).statusCode, 404, 'ikinci kez geri alınmaz');
  });

  test('LGG-4 toplu al ve geri al (3316 a): karşılığı olan uyan kod CORE\'un kendi koduyla taslak açılır, Logo kodu eşlenir; kod türe uymayan ve karşılıksız atlanır; geri almada taslak silinir, yeniden alınca eşlemedeki kod gelir', async () => {
    ayna.push(kart(220, 'HM-LGZ-00020'), kart(221, 'SR-LGZ-00021'), kart(222, 'HM-LGZ-00022', { birimSeti: '99' }));
    const s = await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-al', {
      kartlar: [{ logoKayitNo: 220, surum: null }, { logoKayitNo: 221, surum: null }, { logoKayitNo: 222, surum: null }], tur: null, birim: null,
    });
    assert.deepEqual(s.basarili, [{ logoKayitNo: 220, kod: 'HM-LGZ-00020', stokKodu: 'HM-LGZ-00021', erp: 'yazildi', mevcutErpKodu: null }]);
    assert.equal(await erpKodu('logo-220'), 'HM-LGZ-00020', '3474-3: alınan kartın ERP kodu Logo kodu');
    assert.equal(eslemeler.get('HM-LGZ-00020'), 'HM-LGZ-00021');
    assert.deepEqual(s.atlanan.map((x) => [x.kod, x.neden]), [
      ['SR-LGZ-00021', 'Logo kodu seçilen türün koduna uymuyor; tek tek alın.'],
      ['HM-LGZ-00022', 'Birimin Logo karşılığı yok; birimi seçin ya da tek tek alın.'],
    ]);
    assert.deepEqual({ ...(await kartSatiri('logo-220')), surum: undefined }, { kod: 'HM-LGZ-00021', logo: '220', gonderim: 'gonderildi', set: '06', surum: undefined });
    assert.equal(await kartSatiri('logo-221'), null);

    const g = await tamam<LogoGeriAlCevabi>('POST', '/malzeme-logo-gecisi/geri-al', { islem: s.islem });
    assert.deepEqual(g, { geriAlinan: 1, atlanan: [] });
    assert.equal(await kartSatiri('logo-220'), null, 'alınan taslak silindi');
    assert.equal(await vt().tek("SELECT 1 FROM malzeme_logo_gecis_izi"), null, 'iz kalmadı');
    // 3316 Test T1: eşlenmiş kart başka türle yeniden alınamaz; eşlemedeki kod korunur, taslak açılmaz.
    const baskaTur = await istek('POST', '/malzeme-logo-kartlari/220/al', { tur: 'mamul', birim: 'kg', onek: null });
    assert.equal(baskaTur.statusCode, 422, baskaTur.body);
    assert.match(baskaTur.body, /daha önce HM-LGZ-00021 koduyla eşlendi/);
    assert.equal(await kartSatiri('logo-220'), null, 'taslak açılmadı');
    // Birim seçilirse karşılıksız kart da alınır; yeniden almak mümkün.
    const t = await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-al', { kartlar: [{ logoKayitNo: 220, surum: null }, { logoKayitNo: 222, surum: null }], tur: null, birim: 'kg' });
    assert.deepEqual(t.basarili.map((x) => [x.kod, x.stokKodu]), [['HM-LGZ-00020', 'HM-LGZ-00021'], ['HM-LGZ-00022', 'HM-LGZ-00023']], 'geri alınan kart eşlemedeki koduyla döner');
  });

  test('LGG-5 geri alma sonradan değişen kartı atlar; koruma tetiği geri alma dışında Logo kaydını boşaltmaya ve silmeye izin vermez', async () => {
    const d = await taslakAc('HM-LGG-00030');
    ayna.push(kart(230, d.kod));
    const s = await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-bagla', { kartlar: [{ logoKayitNo: 230, surum: d.surum }] });
    await vt().sorgu("UPDATE malzeme_katalog_karti SET aciklama_2 = 'sonra', surum = surum + 1 WHERE kimlik = $1", [d.kimlik]);
    const g = await tamam<LogoGeriAlCevabi>('POST', '/malzeme-logo-gecisi/geri-al', { islem: s.islem });
    assert.deepEqual(g, { geriAlinan: 0, atlanan: [{ stokKodu: d.kod, neden: 'Kart işlemden sonra değişti.' }] });
    assert.equal((await kartSatiri(d.kimlik))?.logo, '230');
    await assert.rejects(vt().sorgu("UPDATE malzeme_katalog_karti SET logo_kayit_no = NULL, logo_gonderim_durumu = 'bekliyor' WHERE kimlik = $1", [d.kimlik]), /gönderim kaydı değişmez/);
    await assert.rejects(vt().sorgu('DELETE FROM malzeme_katalog_karti WHERE kimlik = $1', [d.kimlik]), /silinmez/);
    // Ayar başka kartın kimliğini taşıyorsa da gevşemez.
    await assert.rejects(vt().tx(async (db) => {
      await db.sorgu("SELECT set_config('tmiv2.logo_gecis_geri_al', 'baska-kart', true)");
      await db.sorgu('DELETE FROM malzeme_katalog_karti WHERE kimlik = $1', [d.kimlik]);
    }), /silinmez/);
  });

  test('LGG-11 (3629) kod çakışması: aynı kodlu kart başka Logo kaydına bağlıysa satır "kod-cakismasi" olur, toplu işleme girmez, toplu bağlama nedenini yazar; sayaç ve karar bekleyen artar', async () => {
    const t = await taslakAc('HM-LGC-00001');
    const onceki = (await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi?suzgec=yeni')).sayilar; // sayfa satırları birim farkını da sayar; ikisinde de yeni süzgeci
    ayna.push(kart(9301, t.kod));
    await vt().sorgu("UPDATE malzeme_katalog_karti SET logo_kayit_no = '9300', logo_gonderim_durumu = 'gonderildi', logo_gonderim_zamani = now() WHERE kimlik = $1", [t.kimlik]);
    const l = await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi?suzgec=kod-cakismasi');
    const sonra = (await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi?suzgec=yeni')).sayilar;
    assert.deepEqual(l.kartlar.map((k) => [k.kod, k.durum, k.topluBaglanir, k.topluAlinir, k.kararNedeni]), [[t.kod, 'kod-cakismasi', false, false, null]]);
    assert.equal(l.sayilar.kodCakismasi, 1);
    assert.equal(sonra.kararBekleyen, onceki.kararBekleyen + 1, 'kod çakışması karar bekleyen sayar');
    assert.equal(sonra.bagsiz, onceki.bagsiz, 'çakışan satır bağsız sayılmaz');
    const s = await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-bagla', { kartlar: [{ logoKayitNo: 9301, surum: (await kartSatiri(t.kimlik))!.surum }] });
    assert.deepEqual(s.basarili, []);
    assert.deepEqual(s.atlanan.map((x) => [x.kod, x.neden]), [[t.kod, "Kart zaten Logo kaydı 9300'ya bağlı."]]);
  });

  test('LGG-6 gövde: aynı kart iki kez ya da 200\'den fazla kart reddedilir', async () => {
    const r1 = await istek('POST', '/malzeme-logo-gecisi/toplu-al', { kartlar: [{ logoKayitNo: 220, surum: null }, { logoKayitNo: 220, surum: null }], tur: null, birim: null });
    assert.equal(r1.statusCode, 400, r1.body);
    const cok = Array.from({ length: 201 }, (_, i) => ({ logoKayitNo: 10_000 + i, surum: null }));
    assert.equal((await istek('POST', '/malzeme-logo-gecisi/toplu-al', { kartlar: cok, tur: null, birim: null })).statusCode, 400);
  });

  test('LGG-9 ERP kodu (3474-3): dolu ve farklı ERP kodu ezilmez, sonuçta döner, geri almada kalır; aynı ERP kodlu başka kart varsa alınan kartta boş kalır', async () => {
    const e = await taslakAc('HM-LGE-00001', 'ORN-ESKI-1');
    ayna.push(kart(901, e.kod));
    const s = await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-bagla', { kartlar: [{ logoKayitNo: 901, surum: e.surum }] });
    assert.deepEqual(s.basarili.map((x) => [x.erp, x.mevcutErpKodu]), [['farkli', 'ORN-ESKI-1']]);
    assert.equal(await erpKodu(e.kimlik), 'ORN-ESKI-1');
    assert.deepEqual(await tamam<LogoGeriAlCevabi>('POST', '/malzeme-logo-gecisi/geri-al', { islem: s.islem }), { geriAlinan: 1, atlanan: [] });
    assert.equal(await erpKodu(e.kimlik), 'ORN-ESKI-1', 'kullanıcının kodu geri almada da kalır');

    await taslakAc('HM-LGE-00010', 'hm-lge-00902 ');
    ayna.push(kart(902, 'HM-LGE-00902'));
    const a = await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-al', { kartlar: [{ logoKayitNo: 902, surum: null }], tur: null, birim: null });
    assert.deepEqual(a.basarili.map((x) => [x.kod, x.erp]), [['HM-LGE-00902', 'mukerrer']], JSON.stringify(a.atlanan));
    assert.equal(await erpKodu('logo-902'), null, 'aynı ERP kodu ikinci karta yazılmaz (harf ve boşluk farkı sayılmaz)');

    // Alan bağdan önce Logo koduyla zaten aynıysa (harf farkı sayılmaz) bağlama yazmaz; geri alma kullanıcının değerini silmez.
    const ayni = await taslakAc('HM-LGE-00003');
    const harf = await taslakAc('HM-LGE-00005');
    await vt().sorgu("UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{com,eskiKod}', to_jsonb(stok_kodu)) WHERE kimlik = $1", [ayni.kimlik]);
    await vt().sorgu("UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{com,eskiKod}', to_jsonb(lower(stok_kodu))) WHERE kimlik = $1", [harf.kimlik]);
    ayna.push(kart(903, ayni.kod), kart(905, harf.kod));
    const b = await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-bagla', {
      kartlar: [{ logoKayitNo: 903, surum: (await kartSatiri(ayni.kimlik))!.surum }, { logoKayitNo: 905, surum: (await kartSatiri(harf.kimlik))!.surum }],
    });
    assert.deepEqual(b.basarili.map((x) => [x.logoKayitNo, x.erp]), [[903, 'ayni'], [905, 'ayni']]);
    await tamam('POST', '/malzeme-logo-gecisi/geri-al', { islem: b.islem });
    assert.equal(await erpKodu(ayni.kimlik), ayni.kod, 'bağlamanın yazmadığı değer geri almada kalır');
    assert.equal(await erpKodu(harf.kimlik), harf.kod.toLowerCase());

    // İptal kartın ERP kodu bağlanan karta yazımı engellemez.
    const yeni = await taslakAc('HM-LGE-00004');
    const iptal = await taslakAc('HM-LGE-00011');
    await vt().sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'iptal', kayit = jsonb_set(kayit, '{com,eskiKod}', to_jsonb($2::text)) WHERE kimlik = $1", [iptal.kimlik, yeni.kod]);
    ayna.push(kart(904, yeni.kod));
    const c = await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-bagla', { kartlar: [{ logoKayitNo: 904, surum: yeni.surum }] });
    assert.deepEqual(c.basarili.map((x) => x.erp), ['yazildi'], JSON.stringify(c.atlanan));
    assert.equal(await erpKodu(yeni.kimlik), yeni.kod);
  });

  test('LGG-10 Eksik ERP kodlarını doldur (3474-3): yalnız boş alan yazılır; farklı olan listelenir, okumada olmayan ve mükerrer atlanır; ikinci kez yazacak bir şey kalmaz; okuyan çalıştıramaz', async () => {
    ayna.length = 0;
    const bos = await taslakAc('HM-LGD-00001');
    const farkli = await taslakAc('HM-LGD-00002', 'ORN-ELLE-2');
    const kayip = await taslakAc('HM-LGD-00003');
    const mukerrer = await taslakAc('HM-LGD-00004');
    await taslakAc('HM-LGD-00005', 'ORN-LOGO-4');
    ayna.push(kart(1001, bos.kod), kart(1002, farkli.kod), kart(1003, kayip.kod), kart(1004, mukerrer.kod));
    await tamam('POST', '/malzeme-logo-gecisi/toplu-bagla', { kartlar: [bos, farkli, kayip, mukerrer].map((k, i) => ({ logoKayitNo: 1001 + i, surum: k.surum })) });
    // Bugün bağlı ve alanı boş kartlar: bağlama 3474-3'ten önce yapılmış gibi alan boşaltılır; Logo'daki kod sonradan değişmiş sayılır.
    await vt().sorgu("UPDATE malzeme_katalog_karti SET kayit = kayit #- '{com,eskiKod}' WHERE kimlik = ANY($1)", [[bos.kimlik, kayip.kimlik, mukerrer.kimlik]]);
    ayna.splice(ayna.findIndex((k) => k.logoKayitNo === 1003), 1);
    // Logo'daki kodun başında ve sonunda boşluk olsa da aynı kodlu kart mükerrer sayılır.
    ayna.splice(ayna.findIndex((k) => k.logoKayitNo === 1004), 1, kart(1004, ' ORN-LOGO-4 '));
    // İptal edilmiş bağlı karta yazılmaz.
    const iptal = await taslakAc('HM-LGD-00006');
    ayna.push(kart(1006, iptal.kod));
    await tamam('POST', '/malzeme-logo-gecisi/toplu-bagla', { kartlar: [{ logoKayitNo: 1006, surum: iptal.surum }] });
    await vt().sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'iptal', kayit = kayit #- '{com,eskiKod}' WHERE kimlik = $1", [iptal.kimlik]);
    const once = (await kartSatiri(bos.kimlik))!.surum;

    const bosOnce = (await tamam<ErpKoduOzetiCevabi>('GET', '/malzeme-logo-gecisi/erp-kodlari', undefined, okuyucuCerezi)).bos;
    assert.ok(bosOnce >= 3, 'onaydaki sayı: bağlı ve ERP kodu boş kartlar');
    assert.equal((await istek('POST', '/malzeme-logo-gecisi/erp-kodlari-doldur', undefined, okuyucuCerezi)).statusCode, 403);
    const d = await tamam<ErpKoduDoldurCevabi>('POST', '/malzeme-logo-gecisi/erp-kodlari-doldur');
    assert.equal(d.doldurulan, 1);
    assert.deepEqual(d.yazilan.filter((x) => x.stokKodu.startsWith('HM-LGD')), [{ kimlik: bos.kimlik, stokKodu: bos.kod, erpKodu: bos.kod }]);
    assert.deepEqual(d.farkli.filter((x) => x.stokKodu.startsWith('HM-LGD')), [{ kimlik: farkli.kimlik, stokKodu: farkli.kod, erpKodu: 'ORN-ELLE-2', logoKodu: farkli.kod }]);
    assert.equal((await tamam<ErpKoduOzetiCevabi>('GET', '/malzeme-logo-gecisi/erp-kodlari')).bos, bosOnce - 1);
    assert.deepEqual(d.atlanan.filter((x) => x.stokKodu.startsWith('HM-LGD')).map((x) => [x.stokKodu, x.neden]), [
      [kayip.kod, 'Logo okumasında yok; okuma bitince yeniden deneyin.'],
      [mukerrer.kod, 'ORN-LOGO-4 ERP kodu başka kartta var.'],
    ]);
    assert.equal(await erpKodu(bos.kimlik), bos.kod);
    assert.equal((await kartSatiri(bos.kimlik))!.surum, once + 1, 'doldurma sürümü artırır');
    assert.equal(await erpKodu(farkli.kimlik), 'ORN-ELLE-2', 'dolu alan ezilmez');
    assert.equal(await erpKodu(mukerrer.kimlik), null);
    assert.equal(await erpKodu(iptal.kimlik), null, 'iptal karta yazılmaz');

    const ikinci = await tamam<ErpKoduDoldurCevabi>('POST', '/malzeme-logo-gecisi/erp-kodlari-doldur');
    assert.equal(ikinci.doldurulan, 0);
    assert.ok(ikinci.ayni >= 1);
  });

  test('LGG-11 CORE açıklamalarını Logo\'ya gönder (3632): ayar kapalıyken 422 ve kuyruğa girmez; açıkken kart ad güncellemesi kuyruğuna girer, değeri ve sürümü değişmez; gidecek değeri olmayan, bağsız ve eski sürümlü kart atlanır; okuyan 403', async () => {
    const guncelleme = (kimlik: string) => vt().tek<{ durum: string | null; surum: number }>(
      'SELECT logo_guncelleme_durumu AS durum, surum FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]);
    const a = await taslakAc('HM-LGG-00040');
    const b = await taslakAc('HM-LGG-00041');
    const bagsiz = await taslakAc('HM-LGG-00042');
    ayna.push(
      kart(240, a.kod, { ad: 'ORN Logo adi', aciklama2: 'ORN Logo iki', aciklama3: 'ORN Logo uc' }),
      kart(241, b.kod, { ad: `CORE ${b.kimlik}`, aciklama3: 'ORN Logo uc' }),
      kart(242, bagsiz.kod),
    );
    await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-bagla', { kartlar: [{ logoKayitNo: 240, surum: a.surum }, { logoKayitNo: 241, surum: b.surum }] });
    // Fixture: açıklamalar kart sihirbazında girilmiş gibi yazılır; B'de yalnız Açıklama 3 farklı ve CORE'da boştur.
    await vt().sorgu("UPDATE malzeme_katalog_karti SET aciklama_1 = 'ORN CORE bir', aciklama_2 = 'ORN CORE iki', aciklama_3 = NULL WHERE kimlik = $1", [a.kimlik]);
    const surumA = (await guncelleme(a.kimlik))!.surum;
    const surumB = (await guncelleme(b.kimlik))!.surum;

    const liste = async (): Promise<LogoGecisCevabi> => tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi?suzgec=tumu');
    const satir = async (ref: number) => (await liste()).kartlar.find((k) => k.logoKayitNo === ref)!;
    let l = await liste();
    assert.deepEqual(l.logoyaGonderim, { acik: false, neden: 'Sistem Ayarları\'nda "Logo bağlantısı" kapalı' });
    assert.deepEqual((await satir(240)).logoyaGonder, { gonderilebilir: true, durum: null, hata: null });
    assert.equal((await satir(241)).logoyaGonder.gonderilebilir, false, 'CORE boşsa gidecek değer yok: Logo\'daki metin silinmez');
    assert.equal((await satir(242)).logoyaGonder.gonderilebilir, false, 'bağsız kart gönderilemez');

    const kapali = await istek('POST', '/malzeme-logo-gecisi/logoya-gonder', { kartlar: [{ logoKayitNo: 240, surum: surumA }] });
    assert.equal(kapali.statusCode, 422, kapali.body);
    assert.match(kapali.body, /Logo bağlantısı/);
    assert.equal((await guncelleme(a.kimlik))!.durum, null, 'kapalıyken kuyruğa girmez');

    await tamam('POST', '/ayarlar/logo.baglanti/degistir', { deger: true });
    l = await liste();
    assert.deepEqual(l.logoyaGonderim, { acik: false, neden: 'Sistem Ayarları\'nda "Logo: malzeme adı güncellemesi" kapalı' });
    await tamam('POST', '/ayarlar/logo.malzeme-guncelleme-gonderimi/degistir', { deger: true });
    assert.deepEqual((await liste()).logoyaGonderim, { acik: true, neden: null });

    assert.equal((await istek('POST', '/malzeme-logo-gecisi/logoya-gonder', { kartlar: [{ logoKayitNo: 240, surum: surumA }] }, okuyucuCerezi)).statusCode, 403, 'yetkisiz kullanıcı');
    assert.equal((await guncelleme(a.kimlik))!.durum, null);

    const r = await tamam<LogoyaGonderCevabi>('POST', '/malzeme-logo-gecisi/logoya-gonder', {
      kartlar: [{ logoKayitNo: 240, surum: surumA }, { logoKayitNo: 241, surum: surumB }, { logoKayitNo: 242, surum: 1 }, { logoKayitNo: 999, surum: 1 }],
    });
    assert.deepEqual(r.kuyrugaAlinan, [{ logoKayitNo: 240, kod: a.kod, stokKodu: a.kod }]);
    assert.deepEqual(r.atlanan.map((x) => [x.logoKayitNo, x.neden]), [
      [241, 'Gönderilecek fark yok.'], [242, 'Kart Logo kaydına bağlı değil.'], [999, 'Logo kartı okunan listede yok; Logo malzeme okumasını bekleyin.'],
    ]);
    assert.deepEqual(await guncelleme(a.kimlik), { durum: 'bekliyor', surum: surumA }, 'sürüm artmaz, kart değeri değişmez');
    assert.equal((await guncelleme(b.kimlik))!.durum, null);
    assert.deepEqual((await satir(240)).logoyaGonder.durum, 'bekliyor');

    // Eski sürümle ikinci istek kuyruğu bozmaz.
    await vt().sorgu("UPDATE malzeme_katalog_karti SET logo_guncelleme_durumu = NULL, logo_guncelleme_zamani = NULL WHERE kimlik = $1", [a.kimlik]);
    const eski = await tamam<LogoyaGonderCevabi>('POST', '/malzeme-logo-gecisi/logoya-gonder', { kartlar: [{ logoKayitNo: 240, surum: surumA - 1 }] });
    assert.deepEqual([eski.kuyrugaAlinan.length, eski.atlanan.length], [0, 1]);
    assert.equal((await guncelleme(a.kimlik))!.durum, null);
    // Aynı kart iki kez seçilmiş gövde reddedilir.
    assert.equal((await istek('POST', '/malzeme-logo-gecisi/logoya-gonder', { kartlar: [{ logoKayitNo: 240, surum: surumA }, { logoKayitNo: 240, surum: surumA }] })).statusCode, 400);
  });

  test('LGG-12 katalog kartı (3632): bağlı kartta Logo açıklama farkı ve gönderim durumu gelir; bağsız kartta satır yok; okuyan da görür', async () => {
    const a = await taslakAc('HM-LGG-00050');
    const bagsiz = await taslakAc('HM-LGG-00051');
    ayna.push(kart(250, a.kod, { ad: 'ORN Logo adi', aciklama2: 'ORN Logo iki' }), kart(251, bagsiz.kod));
    await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-bagla', { kartlar: [{ logoKayitNo: 250, surum: a.surum }] });
    await vt().sorgu("UPDATE malzeme_katalog_karti SET aciklama_1 = 'ORN CORE bir', aciklama_2 = NULL WHERE kimlik = $1", [a.kimlik]);
    const r = await tamam<LogoGecisKartiCevabi>('GET', `/malzeme-logo-gecisi/kart/${a.kimlik}`, undefined, okuyucuCerezi);
    assert.equal(r.satir?.logoKayitNo, 250);
    assert.deepEqual(r.satir?.farklar, [{ alan: 'aciklama_1', logo: 'ORN Logo adi', tmi: 'ORN CORE bir' }, { alan: 'aciklama_2', logo: 'ORN Logo iki', tmi: null }]);
    assert.deepEqual(r.satir?.logoyaGonder, { gonderilebilir: true, durum: null, hata: null });
    assert.equal(typeof r.logoyaGonderim.acik, 'boolean');
    assert.equal((await tamam<LogoGecisKartiCevabi>('GET', `/malzeme-logo-gecisi/kart/${bagsiz.kimlik}`)).satir, null);
  });

  test('LGG-7 Kullanılanlar (3079 a): iz okununca açılış süzgeci; stok, son 12 ayda hareket ya da açık sipariş; neden satırda; 12 aydan eski hareket saymaz', async () => {
    ayna.length = 0;
    const bugun = new Date().toISOString().slice(0, 10);
    const yil = Number(bugun.slice(0, 4));
    const yeni = `${yil}-01-01` > bugun ? `${yil - 1}-12-31` : `${yil}-01-01`;
    ayna.push(
      kart(701, 'HM-LGK-00001', { stok: '0', sonHareket: yeni }),
      kart(702, 'HM-LGK-00002', { stok: null, acikSiparis: true }),
      kart(703, 'HM-LGK-00003', { stok: null, sonHareket: `${yil - 2}-01-01`, acikSiparis: false }),
      kart(704, 'HM-LGK-00004', { stok: '2', sonHareket: null, acikSiparis: false }),
      kart(705, 'HM-LGK-00005', { stok: null }),
    );
    kullanimTamam = '2026-11-12T07:00:00.000Z';
    try {
      const l = await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi');
      assert.deepEqual([l.suzgec, l.kullanim, l.sayilar.kullanilan, l.sayilar.stoklu], ['kullanilan', true, 3, 1]);
      assert.deepEqual(l.kartlar.map((k) => [k.kod, k.kullanimNedenleri]), [
        ['HM-LGK-00001', ['hareket']], ['HM-LGK-00002', ['siparis']], ['HM-LGK-00004', ['stok']],
      ]);
      assert.equal(l.kartlar[0]?.sonHareket, yeni);
      const tumu = await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi?suzgec=tumu');
      assert.deepEqual(tumu.kartlar.find((k) => k.kod === 'HM-LGK-00003')?.kullanimNedenleri, [], '12 aydan eski hareket kullanım sayılmaz');
      assert.equal(tumu.suzgec, 'tumu');
      const stoklu = await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi?suzgec=stoklu');
      assert.deepEqual(stoklu.kartlar.map((k) => k.kod), ['HM-LGK-00004']);
    } finally {
      kullanimTamam = null;
    }
  });
});
