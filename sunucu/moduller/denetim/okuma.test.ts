import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { kayitIcerigiCevabi, kayitListesiCevabi, kayitSatiri } from '#paylasilan/sozlesme/denetim.ts';
import type { KayitIcerigiCevabi, KayitListesiCevabi, SuzgecSecenekleriCevabi } from '#paylasilan/sozlesme/denetim.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { denetimYaz } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const GIZLI_DEGER = 'cok-gizli-deger-7';

interface Cevap<T> { durum: number; govde: T }

describe('denetim okuma (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let mudur = '';
  let operator = '';
  let yoneticiId = 0;
  let mudurId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function oku<T>(cerez: string, yol: string): Promise<Cevap<T>> {
    const cevap = await app.inject({ method: 'GET', url: `/api${yol}`, headers: cerez ? { cookie: cerez } : {} });
    return { durum: cevap.statusCode, govde: cevap.json() as T };
  }

  // Gerçek rol göçünden gelen rolle kurulur: müdürün `denetim.oku` taşıdığı da böylece ölçülür.
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<number> {
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    if (!yoneticiRolu || !rol) throw new Error(`rol yok: ${rolKodu}`);
    return vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rol.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
  }

  const ekle = (kisiId: number | null, yontem: string, yol: string, parametre: unknown, govde: unknown, zaman: string): Promise<{ id: number } | null> =>
    vt().tek<{ id: number }>(
      'INSERT INTO denetim_kaydi (zaman, kisi_id, yontem, yol, parametre, govde) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING id',
      [zaman, kisiId, yontem, yol, JSON.stringify(parametre), JSON.stringify(govde)],
    );

  let eskiId = 0;

  before(async () => {
    ortam = await testVeritabaniKur('denetim_okuma');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    mudurId = await rolluKisi('mudur1', 'mudur');
    await rolluKisi('operator1', 'operator');
    yonetici = await girisCerezi('yonetici');
    mudur = await girisCerezi('mudur1');
    operator = await girisCerezi('operator1');
    // Sabit geçmiş: girişlerin ve rol komutlarının yazdığı satırlar bugündedir, bunlar 2020'de.
    await ekle(mudurId, 'POST', '/uretim-emirleri/:id/adimlar/:adimId/tamamla', { id: 41, adimId: 3 }, { adet: 5 }, '2020-03-01T10:00:00+00:00');
    await ekle(yoneticiId, 'POST', '/malzeme-katalogu-kartlari/:kimlik/kaydet', { kimlik: 'MK-9' }, { ad: 'Deneme malzeme' }, '2020-03-02T10:00:00+00:00');
    // Maskeleme kuralı genişlemeden önce yazılmış gibi: gizli adlı alanlar açık duruyor.
    eskiId = (await ekle(yoneticiId, 'POST', '/deneme/:token/:id', { token: GIZLI_DEGER, id: 8 }, { pin: GIZLI_DEGER, not: 'görünür' }, '2020-03-03T10:00:00+00:00'))?.id ?? 0;
    await ekle(null, 'POST', '/oturum/giris', null, { kullaniciAdi: 'x', parola: '[gizli]' }, '2020-03-04T10:00:00+00:00');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  const tarihte = (gun: string) => `/denetim-kayitlari?baslangic=${gun}&bitis=${gun}`;

  test('liste: denetim.oku taşıyan müdür görür; operatör 403, oturumsuz 401', async () => {
    const m = await oku<KayitListesiCevabi>(mudur, '/denetim-kayitlari?baslangic=2020-01-01&bitis=2020-12-31');
    assert.equal(m.durum, 200, JSON.stringify(m.govde));
    assert.equal(m.govde.toplam, 4);
    assert.equal((await oku(operator, '/denetim-kayitlari')).durum, 403);
    assert.equal((await oku(operator, '/denetim-kayitlari/suzgecler')).durum, 403);
    assert.equal((await oku('', '/denetim-kayitlari')).durum, 401);
  });

  test('gövde ucu: müdür 403, operatör 403; yönetici gövdeyi ve bütün parametreleri okur', async () => {
    assert.equal((await oku(mudur, `/denetim-kayitlari/${eskiId}/govde`)).durum, 403);
    assert.equal((await oku(operator, `/denetim-kayitlari/${eskiId}/govde`)).durum, 403);
    const y = await oku<KayitIcerigiCevabi>(yonetici, `/denetim-kayitlari/${eskiId}/govde`);
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    assert.deepEqual(y.govde, { id: eskiId, parametre: { token: '[gizli]', id: 8 }, govde: { pin: '[gizli]', not: 'görünür' } });
    assert.equal(JSON.stringify(y.govde).includes(GIZLI_DEGER), false);
    assert.equal((await oku(yonetici, '/denetim-kayitlari/999999999/govde')).durum, 404);
  });

  test('liste satırı gövde ve parametre taşımaz; yalnız tam sayı kimlikler döner (DNT-01)', async () => {
    const y = await oku<KayitListesiCevabi>(yonetici, '/denetim-kayitlari?baslangic=2020-01-01&bitis=2020-12-31');
    assert.equal(y.durum, 200);
    const metin = JSON.stringify(y.govde);
    for (const yasak of [GIZLI_DEGER, 'Deneme malzeme', 'MK-9', 'adet', '"govde"', '"parametre"']) assert.equal(metin.includes(yasak), false, yasak);
    assert.deepEqual(y.govde.satirlar.map((s) => Object.keys(s).sort()), y.govde.satirlar.map(() => ['id', 'kimlikler', 'kisiAd', 'kisiId', 'modul', 'yetki', 'yol', 'yontem', 'zaman']));
    assert.deepEqual(y.govde.satirlar.map((s) => ({ yol: s.yol, kimlikler: s.kimlikler, kisiAd: s.kisiAd })), [
      { yol: '/oturum/giris', kimlikler: {}, kisiAd: null },
      { yol: '/deneme/:token/:id', kimlikler: { id: 8 }, kisiAd: 'Deneme Yönetici' },
      { yol: '/malzeme-katalogu-kartlari/:kimlik/kaydet', kimlikler: {}, kisiAd: 'Deneme Yönetici' },
      { yol: '/uretim-emirleri/:id/adimlar/:adimId/tamamla', kimlikler: { id: 41, adimId: 3 }, kisiAd: 'Deneme mudur1' },
    ]);
  });

  test('şema: liste cevabında gövde ve parametre alanı yoktur; gövde ucunun şemasında vardır', () => {
    assert.deepEqual(Object.keys(kayitSatiri.shape).sort(), ['id', 'kimlikler', 'kisiAd', 'kisiId', 'modul', 'yetki', 'yol', 'yontem', 'zaman']);
    assert.deepEqual(Object.keys(kayitListesiCevabi.shape).sort(), ['satirlar', 'sayfa', 'sayfaBoyu', 'toplam']);
    // Şema fazla alanı atar: işleyici yanlışlıkla gövde koysa da istemciye gitmez.
    const satir = { id: 1, zaman: '2020-03-01T10:00:00+00:00', kisiId: null, kisiAd: null, yontem: 'POST', yol: '/x', modul: null, yetki: null, kimlikler: {}, govde: { a: 1 }, parametre: { b: 2 } };
    assert.deepEqual(Object.keys(kayitSatiri.parse(satir)).sort(), ['id', 'kimlikler', 'kisiAd', 'kisiId', 'modul', 'yetki', 'yol', 'yontem', 'zaman']);
    assert.deepEqual(Object.keys(kayitIcerigiCevabi.shape).sort(), ['govde', 'id', 'parametre']);
  });

  test('süzgeç: kişi, tarih aralığı (iki uç dahil) ve komut; yeni kayıt üstte', async () => {
    const kisi = await oku<KayitListesiCevabi>(mudur, `/denetim-kayitlari?kisi=${mudurId}&baslangic=2020-01-01&bitis=2020-12-31`);
    assert.deepEqual(kisi.govde.satirlar.map((s) => s.yol), ['/uretim-emirleri/:id/adimlar/:adimId/tamamla']);
    const aralik = await oku<KayitListesiCevabi>(mudur, '/denetim-kayitlari?baslangic=2020-03-02&bitis=2020-03-03');
    assert.deepEqual(aralik.govde.satirlar.map((s) => s.yol), ['/deneme/:token/:id', '/malzeme-katalogu-kartlari/:kimlik/kaydet']);
    assert.equal((await oku<KayitListesiCevabi>(mudur, tarihte('2020-03-05'))).govde.toplam, 0);
    const yol = encodeURIComponent('/malzeme-katalogu-kartlari/:kimlik/kaydet');
    const komut = await oku<KayitListesiCevabi>(mudur, `/denetim-kayitlari?yontem=POST&yol=${yol}`);
    assert.deepEqual(komut.govde.satirlar.map((s) => s.zaman.slice(0, 4)), ['2020']);
    assert.equal((await oku<KayitListesiCevabi>(mudur, `/denetim-kayitlari?yontem=DELETE&yol=${yol}`)).govde.toplam, 0);
    const ters = await oku<{ kod: string }>(mudur, '/denetim-kayitlari?baslangic=2020-03-03&bitis=2020-03-02');
    assert.equal(ters.durum, 400);
    assert.equal((await oku(mudur, '/denetim-kayitlari?kisi=2147483648')).durum, 400);
  });

  // 1371 a: ekran işlemi yetki adıyla, modülü adıyla gösterir; modülü boş eski satır süzgeçte seçilmez.
  test('modül ve yetki: satırda döner; modül süzgeci ve seçeneği; tanımsız modül adı 400', async () => {
    await vt().sorgu(
      `INSERT INTO denetim_kaydi (zaman, kisi_id, yontem, yol, parametre, govde, modul, yetki)
       VALUES ('2019-05-01T10:00:00+00:00', $1, 'POST', '/is-emirleri/:id/bitir', '{"id":7}', '{}', 'uretim-emirleri', 'uretim-emirleri.yaz')`,
      [mudurId],
    );
    const m = await oku<KayitListesiCevabi>(mudur, '/denetim-kayitlari?modul=uretim-emirleri&bitis=2019-12-31');
    assert.equal(m.durum, 200, JSON.stringify(m.govde));
    assert.deepEqual(m.govde.satirlar.map((s) => ({ modul: s.modul, yetki: s.yetki, kimlikler: s.kimlikler })), [
      { modul: 'uretim-emirleri', yetki: 'uretim-emirleri.yaz', kimlikler: { id: 7 } },
    ]);
    const eski = await oku<KayitListesiCevabi>(mudur, '/denetim-kayitlari?baslangic=2020-03-01&bitis=2020-03-01');
    assert.deepEqual(eski.govde.satirlar.map((s) => [s.modul, s.yetki]), [[null, null]]);
    const secenek = await oku<SuzgecSecenekleriCevabi>(mudur, '/denetim-kayitlari/suzgecler');
    assert.ok(secenek.govde.moduller.includes('uretim-emirleri'));
    assert.equal((await oku(mudur, "/denetim-kayitlari?modul=x'or")).durum, 400);
    assert.equal((await oku(operator, '/denetim-kayitlari?modul=uretim-emirleri')).durum, 403);
  });

  test('sayfalama: sayfa boyu ve sayfa uygulanır, toplam bütün süzgeç sonucudur', async () => {
    const s1 = await oku<KayitListesiCevabi>(mudur, '/denetim-kayitlari?baslangic=2020-01-01&bitis=2020-12-31&sayfaBoyu=3');
    const s2 = await oku<KayitListesiCevabi>(mudur, '/denetim-kayitlari?baslangic=2020-01-01&bitis=2020-12-31&sayfaBoyu=3&sayfa=2');
    assert.deepEqual([s1.govde.satirlar.length, s1.govde.toplam, s2.govde.satirlar.length, s2.govde.sayfa], [3, 4, 1, 2]);
    assert.equal(s2.govde.satirlar[0]?.yol, '/uretim-emirleri/:id/adimlar/:adimId/tamamla');
  });

  test('süzgeç seçenekleri: deftere düşmüş kişiler adıyla ve komutlar; okuma ucu deftere satır yazmaz', async () => {
    const once = (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM denetim_kaydi'))?.n;
    const s = await oku<SuzgecSecenekleriCevabi>(mudur, '/denetim-kayitlari/suzgecler');
    assert.equal(s.durum, 200);
    assert.ok(s.govde.kisiler.some((k) => k.id === mudurId && k.ad === 'Deneme mudur1'));
    assert.ok(s.govde.komutlar.some((k) => k.yontem === 'POST' && k.yol === '/malzeme-katalogu-kartlari/:kimlik/kaydet'));
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM denetim_kaydi'))?.n, once);
  });

  // Kullanıcı kararı N4: ek gövdenin parçasıdır; yalnız `denetim.govde-oku` olan görür, liste cevabında yer almaz.
  test('denetim eki: gövdede `_ek` olarak maskeli yazılır; liste göstermez, müdür gövde ucunda 403, yönetici görür', async () => {
    const ek = [{ teklif: 12, kalem: 'K-1', onceki: '10.50', yeni: '11.00', paraBirimi: 'TRY', miktar: 3, tedarikci: 7, parola: GIZLI_DEGER }];
    const yaz = (yol: string, govde: unknown) =>
      vt().tx((db) => denetimYaz(db, { kisiId: yoneticiId, yontem: 'POST', yol, parametre: { id: 5 }, govde, ek }));
    await yaz('/ekli/:id/fiyat', { not: 'görünür' });
    await yaz('/ekli/:id/dizi', [1, 2]);
    await yaz('/ekli/:id/cakisan', { _ek: 'gövdenin kendi alanı' });
    const kayitlar = await vt().sorgu<{ id: number; yol: string }>("SELECT id, yol FROM denetim_kaydi WHERE yol LIKE '/ekli/%' ORDER BY id");
    const idsi = (yol: string): number => kayitlar.find((k) => k.yol === yol)?.id ?? 0;
    const maskeliEk = [{ ...ek[0], parola: '[gizli]' }];

    const liste = await oku<KayitListesiCevabi>(mudur, '/denetim-kayitlari?yol=/ekli/:id/fiyat');
    assert.equal(liste.durum, 200);
    assert.equal(liste.govde.toplam, 1);
    for (const yasak of ['_ek', 'K-1', '10.50', GIZLI_DEGER]) assert.equal(JSON.stringify(liste.govde).includes(yasak), false, yasak);

    assert.equal((await oku(mudur, `/denetim-kayitlari/${idsi('/ekli/:id/fiyat')}/govde`)).durum, 403);
    const govdesi = async (yol: string): Promise<unknown> =>
      (await oku<KayitIcerigiCevabi>(yonetici, `/denetim-kayitlari/${idsi(yol)}/govde`)).govde.govde;
    assert.deepEqual(await govdesi('/ekli/:id/fiyat'), { not: 'görünür', _ek: maskeliEk });
    // Düz nesne olmayan ya da kendisi `_ek` taşıyan gövde ezilmez, `_govde` altına alınır.
    assert.deepEqual(await govdesi('/ekli/:id/dizi'), { _govde: [1, 2], _ek: maskeliEk });
    assert.deepEqual(await govdesi('/ekli/:id/cakisan'), { _govde: { _ek: 'gövdenin kendi alanı' }, _ek: maskeliEk });
    const tumu = await vt().tek<{ metin: string }>("SELECT string_agg(govde::text, ' ') AS metin FROM denetim_kaydi WHERE yol LIKE '/ekli/%'");
    assert.equal(tumu?.metin.includes(GIZLI_DEGER), false);
  });

  // Maskeye sonradan eklenen kişisel alanlar: kuraldan önce açık yazılmış satır da gövde ucunda kapalı döner; satır değişmez.
  test('eski satırdaki IBAN, maaş, kan grubu, engel durumu, adres, telefon ve doğum tarihi okurken gizlenir', async () => {
    const acikGovde = {
      govde: {
        ad: 'Ayşe', iban: 'TR00 0000 0000 0000 0000 0000 07', brutMaas: 45000, kanGrubu: '0 Rh+', engelDurumu: 'Yok',
        adres: 'Deneme mahallesi 1', telefon: '0000 000 00 00', dogumTarihi: '1990-01-01',
      },
      surum: 1,
    };
    const satir = await ekle(yoneticiId, 'POST', '/ik/personel/:kimlik/kaydet', { kimlik: 'emp_eski' }, acikGovde, '2019-06-01T10:00:00+00:00');
    const y = await oku<KayitIcerigiCevabi>(yonetici, `/denetim-kayitlari/${satir?.id ?? 0}/govde`);
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    assert.deepEqual(y.govde.govde, {
      govde: {
        ad: 'Ayşe', iban: '[gizli]', brutMaas: '[gizli]', kanGrubu: '[gizli]', engelDurumu: '[gizli]',
        adres: '[gizli]', telefon: '[gizli]', dogumTarihi: '[gizli]',
      },
      surum: 1,
    });
    const ham = await vt().tek<{ govde: unknown }>('SELECT govde FROM denetim_kaydi WHERE id = $1', [satir?.id ?? 0]);
    assert.deepEqual(ham?.govde, acikGovde);
  });
});
