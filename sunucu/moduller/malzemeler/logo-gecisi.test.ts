import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { LogoGecisCevabi, LogoGeriAlCevabi, LogoTopluCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
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
  let sayac = 0;
  // Taslak kodu önekteki sıradan gelir; Logo kopyasındaki kart dönen kodla kurulur.
  async function taslakAc(kod: string): Promise<{ kimlik: string; kod: string; surum: number }> {
    const kimlik = `lgg${++sayac}`;
    const url = `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
    const govde = {
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod, ad: `CORE ${kimlik}`, birim: 'kg' }, onay: { durum: 'taslak' } },
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
    logoEslemeYaziciCozucusu(async () => { throw new Error('toplu işlem kod eşlemesi yazmaz'); });
    logoTmiKodCozucusu(async () => new Map());
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
    assert.deepEqual({ ...l.sayilar, kararBekleyen: undefined }, { toplam: 3, stoklu: 2, yeni: 2, bagsiz: 1, bagli: 0, kullanimDisi: 1, kullanilan: null, kararBekleyen: undefined });
    assert.deepEqual([l.suzgec, l.kullanim, l.kartlar[0]?.kullanimNedenleri], ['stoklu', false, null], 'kullanım izi okunmadan süzgeç stoğu olanlar');
    const yeni = await tamam<LogoGecisCevabi>('GET', '/malzeme-logo-gecisi?suzgec=yeni&ara=LGY-00002', undefined, okuyucuCerezi);
    assert.deepEqual(yeni.kartlar.map((k) => k.kod), ['HM-LGY-00002']);
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
    assert.deepEqual(s.basarili, [{ logoKayitNo: 210, kod: b.kod, stokKodu: b.kod }], JSON.stringify(s.atlanan));
    assert.deepEqual(s.atlanan.map((x) => [x.kod, x.neden]), [[c.kod, 'Birim farklı; tek tek bağlayın.']]);
    assert.deepEqual({ ...(await kartSatiri(b.kimlik)), surum: undefined }, { kod: b.kod, logo: '210', gonderim: 'gonderildi', set: '06', surum: undefined });
    assert.equal((await kartSatiri(c.kimlik))?.logo, null);

    assert.equal((await istek('POST', '/malzeme-logo-gecisi/geri-al', { islem: s.islem }, ikinciCerez)).statusCode, 404, 'başkasının işlemi geri alınmaz');
    const g = await tamam<LogoGeriAlCevabi>('POST', '/malzeme-logo-gecisi/geri-al', { islem: s.islem });
    assert.deepEqual(g, { geriAlinan: 1, atlanan: [] });
    const sonra = await kartSatiri(b.kimlik);
    assert.deepEqual({ ...sonra, surum: undefined }, { ...once, surum: undefined });
    assert.equal(sonra!.surum, once!.surum + 2, 'bağlama ve geri alma sürüm artırır');
    assert.equal((await istek('POST', '/malzeme-logo-gecisi/geri-al', { islem: s.islem })).statusCode, 404, 'ikinci kez geri alınmaz');
  });

  test('LGG-4 toplu al ve geri al: karşılığı olan uyan kod taslak açılır; kod türe uymayan ve karşılıksız atlanır; geri almada taslak silinir', async () => {
    ayna.push(kart(220, 'HM-LGZ-00020'), kart(221, 'SR-LGZ-00021'), kart(222, 'HM-LGZ-00022', { birimSeti: '99' }));
    const s = await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-al', {
      kartlar: [{ logoKayitNo: 220, surum: null }, { logoKayitNo: 221, surum: null }, { logoKayitNo: 222, surum: null }], tur: null, birim: null,
    });
    assert.deepEqual(s.basarili, [{ logoKayitNo: 220, kod: 'HM-LGZ-00020', stokKodu: 'HM-LGZ-00020' }]);
    assert.deepEqual(s.atlanan.map((x) => [x.kod, x.neden]), [
      ['SR-LGZ-00021', 'Logo kodu seçilen türün koduna uymuyor; tek tek alın.'],
      ['HM-LGZ-00022', 'Birimin Logo karşılığı yok; birimi seçin ya da tek tek alın.'],
    ]);
    assert.deepEqual({ ...(await kartSatiri('logo-220')), surum: undefined }, { kod: 'HM-LGZ-00020', logo: '220', gonderim: 'gonderildi', set: '06', surum: undefined });
    assert.equal(await kartSatiri('logo-221'), null);

    const g = await tamam<LogoGeriAlCevabi>('POST', '/malzeme-logo-gecisi/geri-al', { islem: s.islem });
    assert.deepEqual(g, { geriAlinan: 1, atlanan: [] });
    assert.equal(await kartSatiri('logo-220'), null, 'alınan taslak silindi');
    assert.equal(await vt().tek("SELECT 1 FROM malzeme_logo_gecis_izi"), null, 'iz kalmadı');
    // Birim seçilirse karşılıksız kart da alınır; yeniden almak mümkün.
    const t = await tamam<LogoTopluCevabi>('POST', '/malzeme-logo-gecisi/toplu-al', { kartlar: [{ logoKayitNo: 220, surum: null }, { logoKayitNo: 222, surum: null }], tur: null, birim: 'kg' });
    assert.deepEqual(t.basarili.map((x) => x.kod), ['HM-LGZ-00020', 'HM-LGZ-00022']);
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

  test('LGG-6 gövde: aynı kart iki kez ya da 200\'den fazla kart reddedilir', async () => {
    const r1 = await istek('POST', '/malzeme-logo-gecisi/toplu-al', { kartlar: [{ logoKayitNo: 220, surum: null }, { logoKayitNo: 220, surum: null }], tur: null, birim: null });
    assert.equal(r1.statusCode, 400, r1.body);
    const cok = Array.from({ length: 201 }, (_, i) => ({ logoKayitNo: 10_000 + i, surum: null }));
    assert.equal((await istek('POST', '/malzeme-logo-gecisi/toplu-al', { kartlar: cok, tur: null, birim: null })).statusCode, 400);
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
