import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testSemasiAc, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTASYON_YAZMA_ISLEMLERI } from '#paylasilan/islemler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { eksikKayitIslemi } from './kurallar.ts';
import { uclar } from './uclar.ts';

// 3165 a: istasyonlar.yaz sekiz eyleme bölündü. Ölçülen: (B1) göç rolü, kişiye verilen eki ve kişiden alınanı kopyalar, bugün eski
// işlemi olan hiçbir rol ve kişi yetki kaybetmez; (B2) hiçbir uç eski işleme bağlı kalmaz, her yazma ucu tek eylem ister;
// (B4) rol x uç tablosu bölünmeden önce ve sonra aynıdır; yalnız bir eylemi olan kişi ötekinde 403 alır.
const PAROLA = 'dogru-parola-1';
const GERCEK_KLASOR = fileURLToPath(new URL('../../gocler/', import.meta.url));
const GOC_ADI = '20261113135701_kisiler_istasyon_eylemleri.sql';
const ESKI = 'istasyonlar.yaz';
const YENI: readonly string[] = ISTASYON_YAZMA_ISLEMLERI;

type Yetki = string | { biri: readonly string[] };
const ucYetkisi = (u: (typeof uclar)[number]): Yetki => u.yetki as Yetki;
const yetkiListesi = (y: Yetki): readonly string[] => (typeof y === 'string' ? [y] : y.biri);
// Bölünmeden önce her yazma ucu (ve iki yazma öncesi okuma) yalnız eski işlemi isterdi; okumalar eski işlemi "biri" listesinde taşırdı.
const eskiYetki = (y: Yetki): Yetki => {
  const liste = yetkiListesi(y).filter((i) => !YENI.includes(i));
  const yeniyiTasir = yetkiListesi(y).some((i) => YENI.includes(i));
  if (!yeniyiTasir) return y;
  const eski = [...new Set([ESKI, ...liste])];
  return eski.length === 1 ? ESKI : { biri: eski };
};
const izinli = (y: Yetki, islemler: ReadonlySet<string>): boolean => yetkiListesi(y).some((i) => islemler.has(i));

describe('istasyon eylemlerine bölme (saf)', () => {
  test('B2: hiçbir uç eski işlemi istemez; bir eylem isteyen her uç tam bir eylem ister (Excel toplu kayıt ve kişi listesi hariç)', () => {
    const eylemli = uclar.filter((u) => yetkiListesi(ucYetkisi(u)).some((i) => YENI.includes(i) || i === ESKI));
    for (const u of uclar) assert.equal(yetkiListesi(ucYetkisi(u)).includes(ESKI), false, `${u.yontem} ${u.yol}`);
    const yazma = eylemli.filter((u) => u.yontem === 'POST');
    // 38 uç yalnız istasyonlar.yaz isterdi, biri onu Arkon amiriyle; makine durumunun iki ucu onu durum işlemiyle birlikte kabul ederdi.
    assert.equal(yazma.length, 41);
    for (const u of yazma) {
      const eylemler = yetkiListesi(ucYetkisi(u)).filter((i) => YENI.includes(i));
      if (u.yol === '/istasyonlar/toplu-kaydet') assert.deepEqual(eylemler, ['istasyonlar.is-merkezi-yaz', 'istasyonlar.istasyon-yaz', 'istasyonlar.makine-yaz']);
      else assert.equal(eylemler.length, 1, `${u.yol}: ${eylemler.join(', ')}`);
    }
    // Her eylem en az bir ucu açar: boş eylem kişiye verilip hiçbir şey yaptırmasın.
    for (const e of YENI) assert.equal(yazma.some((u) => yetkiListesi(ucYetkisi(u)).includes(e)), true, e);
  });

  test('Excel ve şablon: satırdaki her kayıt türü kendi eylemini ister', () => {
    assert.equal(eksikKayitIslemi(YENI, ['is-merkezi', 'istasyon', 'makine']), null);
    assert.equal(eksikKayitIslemi(['istasyonlar.istasyon-yaz'], ['istasyon']), null);
    assert.equal(eksikKayitIslemi(['istasyonlar.istasyon-yaz'], ['istasyon', 'makine']), 'istasyonlar.makine-yaz');
    assert.equal(eksikKayitIslemi([ESKI], ['is-merkezi']), 'istasyonlar.is-merkezi-yaz', 'eski işlem toplu kaydı açmaz');
  });
});

describe('istasyon eylemlerine bölme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function rolluKisi(kullaniciAdi: string, islemler: readonly string[]): Promise<number> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`gecici_${kullaniciAdi.replace('.', '_')}`]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol kurulamadı');
    await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT $1, unnest($2::text[])', [rol.id, [...islemler]]);
    return vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rol.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
  }
  const yaz = async (cerez: string, yol: string, govde: unknown): Promise<number> =>
    (await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez, 'istek-kimligi': randomUUID() }, ...(govde === undefined ? {} : { payload: govde as object }) })).statusCode;

  before(async () => {
    ortam = await testVeritabaniKur('istbolme');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('B1: yerleşik rollerde eski işlemi taşıyan her rol sekiz eylemi de taşır; eylemi olup eski işlemi olmayan rol yok', async () => {
    const satirlar = await vt().sorgu<{ kod: string; islemler: string[] }>(
      'SELECT r.kod, array_agg(ri.islem ORDER BY ri.islem) AS islemler FROM rol r JOIN rol_islemi ri ON ri.rol_id = r.id GROUP BY r.kod');
    const eskili = satirlar.filter((r) => r.islemler.includes(ESKI));
    assert.equal(eskili.length > 0, true);
    for (const r of satirlar) {
      const yeni = r.islemler.filter((i) => YENI.includes(i));
      assert.deepEqual(yeni, r.islemler.includes(ESKI) ? [...YENI].sort() : [], r.kod);
    }
  });

  test('B4: yerleşik her rol için rol x uç tablosu bölünmeden önce ve sonra aynıdır', async () => {
    const satirlar = await vt().sorgu<{ kod: string; islemler: string[] }>(
      'SELECT r.kod, coalesce(array_agg(ri.islem) FILTER (WHERE ri.islem IS NOT NULL), ARRAY[]::text[]) AS islemler FROM rol r LEFT JOIN rol_islemi ri ON ri.rol_id = r.id WHERE NOT r.yonetici GROUP BY r.kod');
    let karsilastirilan = 0;
    for (const r of satirlar) {
      const islemler = new Set(r.islemler);
      for (const u of uclar) {
        const y = ucYetkisi(u);
        if (!yetkiListesi(y).some((i) => YENI.includes(i))) continue;
        assert.equal(izinli(y, islemler), izinli(eskiYetki(y), islemler), `${r.kod}: ${u.yontem} ${u.yol}`);
        karsilastirilan += 1;
      }
    }
    assert.equal(karsilastirilan > 0, true);
  });

  test('B4: yalnız bir eylemi olan kişi o eylemin ucunu geçer, ötekinde 403 alır; yalnız eski işlemi olan hiçbir yazma ucunu geçemez', async () => {
    await rolluKisi('ornek.istasyon', ['istasyonlar.istasyon-yaz']);
    await rolluKisi('ornek.aparat', ['istasyonlar.aparat-yaz']);
    await rolluKisi('ornek.eski', [ESKI]);
    const istasyoncu = await girisCerezi('ornek.istasyon');
    const aparatci = await girisCerezi('ornek.aparat');
    const eskici = await girisCerezi('ornek.eski');
    const merkez = await app.inject({ method: 'POST', url: '/api/is-merkezleri', headers: { cookie: await girisCerezi('yonetici') },
      payload: { kod: 'ORN-IM', ad: 'Deneme merkez', aciklama: null } });
    assert.equal(merkez.statusCode, 200);
    const isMerkeziId = (merkez.json() as { id: number }).id;
    const istasyon = (kod: string) => ({ kod, ad: 'Deneme', isMerkeziId, tip: 'talasli', kapasiteKaynagi: 'makine' });
    assert.equal(await yaz(aparatci, '/istasyonlar', istasyon('ORN-I1')), 403);
    assert.equal(await yaz(eskici, '/istasyonlar', istasyon('ORN-I1')), 403);
    assert.equal(await yaz(istasyoncu, '/istasyonlar', istasyon('ORN-I1')), 200);
    assert.equal(await yaz(istasyoncu, '/is-merkezleri', { kod: 'ORN-IM2', ad: 'Deneme', aciklama: null }), 403);
    assert.equal(await yaz(eskici, '/is-merkezleri', { kod: 'ORN-IM2', ad: 'Deneme', aciklama: null }), 403);
    assert.equal(await yaz(istasyoncu, '/tesis-sablonu/uygula', undefined), 403, 'şablon iş merkezi de açar');
    // Excel: istasyon satırı geçer, aynı dosyada iş merkezi satırı varsa hiçbiri yazılmaz.
    const satir = (n: number, kayit: 'is-merkezi' | 'istasyon') => (kayit === 'is-merkezi'
      ? { kayit, islem: 'ekle', satir: n, kod: `ORN-IM${n}`, ad: 'Deneme', aciklama: null }
      : { kayit, islem: 'ekle', satir: n, kod: `ORN-X${n}`, ad: 'Deneme', isMerkeziKodu: 'ORN-IM', tip: 'talasli', kapasiteKaynagi: 'makine' });
    assert.equal(await yaz(istasyoncu, '/istasyonlar/toplu-kaydet', { satirlar: [satir(2, 'istasyon'), satir(3, 'is-merkezi')] }), 403);
    assert.equal((await vt().sorgu("SELECT 1 FROM istasyon WHERE kod = 'ORN-X2'")).length, 0, 'reddedilen dosyadan satır yazılmaz');
    assert.equal(await yaz(istasyoncu, '/istasyonlar/toplu-kaydet', { satirlar: [satir(2, 'istasyon')] }), 200);
  });
});

describe('istasyon eylemleri göçü var olan veritabanında (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';
  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  before(async () => {
    ortam = await testSemasiAc('istgoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-istgoc-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('B1: eski işlemi taşıyan rol, kişiye verilen ek ve kişiden alınan sekiz eyleme kopyalanır; kimse kaybetmez, alınan geri gelmez', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.indexOf(GOC_ADI);
    assert.equal(sira > 0, true, 'göç bulunamadı');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));
    const { ayar, sema, vt } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    // Göçten önceki durum: rol satırı yerleşik müdürlerden gelir; kişi eki ve kısıtı yöneticinin ekranından verilmiş gibi kurulur.
    const veren = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Veren') RETURNING id");
    const ekli = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Ekli') RETURNING id");
    const kisitli = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kısıtlı') RETURNING id");
    if (!veren || !ekli || !kisitli) throw new Error('kişi eklenemedi');
    await vt.sorgu('INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, $2, $3)', [ekli.id, ESKI, veren.id]);
    await vt.sorgu('INSERT INTO kisi_islem_kisiti (kisi_id, islem, alan_id) VALUES ($1, $2, $3)', [kisitli.id, ESKI, veren.id]);
    const rolOnce = await vt.sorgu<{ rol_id: number }>('SELECT rol_id FROM rol_islemi WHERE islem = $1 ORDER BY rol_id', [ESKI]);
    assert.equal(rolOnce.length > 0, true);

    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));

    for (const { rol_id } of rolOnce) {
      const satir = await vt.sorgu<{ islem: string }>('SELECT islem FROM rol_islemi WHERE rol_id = $1 AND islem LIKE $2 ORDER BY islem', [rol_id, 'istasyonlar.%']);
      for (const e of [ESKI, ...YENI]) assert.equal(satir.some((x) => x.islem === e), true, `rol ${rol_id}: ${e}`);
    }
    const ekler = await vt.sorgu<{ islem: string; veren_id: number }>('SELECT islem, veren_id FROM kisi_islemi WHERE kisi_id = $1 ORDER BY islem', [ekli.id]);
    assert.deepEqual(ekler.map((e) => e.islem), [ESKI, ...YENI].sort());
    assert.equal(ekler.every((e) => e.veren_id === veren.id), true, 'veren korunur');
    const alinan = await vt.sorgu<{ islem: string }>('SELECT islem FROM kisi_islem_kisiti WHERE kisi_id = $1 ORDER BY islem', [kisitli.id]);
    assert.deepEqual(alinan.map((e) => e.islem), [ESKI, ...YENI].sort(), 'alınan yetki bölünmeyle geri gelmez');
    // Eski işlem silinmez (ayrı kart); başka işlem satırına dokunulmaz.
    assert.deepEqual(await vt.sorgu<{ rol_id: number }>('SELECT rol_id FROM rol_islemi WHERE islem = $1 ORDER BY rol_id', [ESKI]), rolOnce);
  });
});
