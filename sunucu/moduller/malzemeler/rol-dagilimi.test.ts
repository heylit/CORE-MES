import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi, KatalogKartlariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

type Nesne = Record<string, unknown>;
interface Oturum { id: number; cerez: string; islemler: string[] }

// Onaylı rol dağılımı (kart #163): yetkiler yalnız göçlerden gelir, sınama hiçbir role işlem eklemez.
// Gövdeler köprünün gönderdiği biçimdedir (`katalog-onay-baglama.test.ts` ile aynı): özet `onay_durumu` = kayıttaki `onay.durum`.
describe('Malzemeler rol dağılımı (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string): Promise<Oturum> {
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedefRol !== yoneticiRolu) {
        await rolAta(db, yoneticiId, yeni, hedefRol);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { id, cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', islemler: c.json().kullanici.islemler as string[] };
  }
  const gonder = async (o: Oturum, url: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: o.cerez }, payload: (await surumlu(vt(), url, govde)) as object });
  const oku = (o: Oturum): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: '/api/malzeme-katalogu-kartlari', headers: { cookie: o.cerez } });

  interface Kart { kimlik: string; surum: number | null; stokKodu: string | null }
  const yeniKart = (): Kart => ({ kimlik: `rol${++sayac}`, surum: null, stokKodu: null });
  const govde = (k: Kart, durum: string): { kayit: Nesne; ozet: Nesne; surum: number | null } => {
    const kod = k.stokKodu ?? 'HM-ROL-00001';
    return {
      kayit: { id: k.kimlik, tur: 'hammadde', fam: 'metal', com: { kod, ad: `Rol kart ${k.kimlik}`, birim: 'adet' }, opts: { koruma: ['Koruyucu folyo'] }, onay: { durum } },
      ozet: { stok_kodu: kod, tur: 'hammadde', onay_durumu: durum, benzersiz_anahtar: `HM|metal|${k.kimlik}`, mukerrer_gerekcesi: null },
      surum: k.surum,
    };
  };
  const kaydetYolu = (k: Kart): string => `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`;
  // Başarılı yazmadan sonra sürümü ve sunucunun verdiği stok kodunu karta işler (köprü de böyle yapar).
  async function kaydet(o: Oturum, k: Kart, durum: string): Promise<number> {
    const c = await gonder(o, kaydetYolu(k), govde(k, durum));
    if (c.statusCode === 200) {
      const r = c.json() as KatalogKartiKaydetCevabi;
      k.surum = r.surum;
      k.stokKodu = r.stok_kodu;
    }
    return c.statusCode;
  }
  const durumu = async (k: Kart): Promise<string | null> =>
    (await vt().tek<{ onay_durumu: string }>('SELECT onay_durumu FROM malzeme_katalog_karti WHERE kimlik = $1', [k.kimlik]))?.onay_durumu ?? null;
  // Başkasının açıp onaya gönderdiği kart: dört göz kuralı onaylayanı engellemez, ölçülen yalnız yetkidir.
  async function onayBekleyenKart(gonderen: Oturum): Promise<Kart> {
    const k = yeniKart();
    assert.equal(await kaydet(gonderen, k, 'onayda'), 200);
    return k;
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemerol');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = (await girisYap('r-yonetici', 'yonetici')).id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('satın alma kart açar, onaylayamaz; kalite başkasının gönderdiği kartı onaylar', async () => {
    const satinAlma = await girisYap('r-satin-alma', 'satin_alma');
    const kalite = await girisYap('r-kalite', 'kalite');
    const k = yeniKart();
    assert.equal(await kaydet(satinAlma, k, 'onayda'), 200);
    assert.equal(await durumu(k), 'onayda');

    const baskasi = await onayBekleyenKart(await girisYap('r-depo', 'depo'));
    const red = await gonder(satinAlma, kaydetYolu(baskasi), govde(baskasi, 'aktif'));
    assert.deepEqual({ durum: red.statusCode, kod: red.json().kod }, { durum: 403, kod: 'YETKI_YOK' }, red.body);
    assert.equal(await durumu(baskasi), 'onayda');

    assert.equal(await kaydet(kalite, k, 'aktif'), 200);
    assert.equal(await durumu(k), 'aktif');
  });

  // Kart #713 (kullanıcı kararı 12.10.2026): operatör malzeme sayfasını görmez.
  test('operatör listeyi okuyamaz, yazamaz', async () => {
    const operator = await girisYap('r-operator', 'operator');
    const liste = await oku(operator);
    assert.equal(liste.statusCode, 403, liste.body);

    const yeni = yeniKart();
    const red = await gonder(operator, kaydetYolu(yeni), govde(yeni, 'onayda'));
    assert.deepEqual({ durum: red.statusCode, kod: red.json().kod }, { durum: 403, kod: 'YETKI_YOK' }, red.body);
    assert.equal(await durumu(yeni), null);
    const sablon = await gonder(operator, '/malzeme-katalogu-sablonlari/rol-s1/kaydet', { sablon: { id: 'rol-s1', ad: 'Rol şablon' } });
    assert.equal(sablon.statusCode, 403, sablon.body);
  });

  // Kart #229 (kullanıcı kararı M1): tanım ve ayar yetkisi planlama, müdür ve yöneticide.
  test('ayarı planlama, müdür ve bayraklı rol değiştirir: öteki yazan ve onaylayan roller ile operatör 403', async () => {
    const yol = '/malzeme-katalogu-ayarlari/malzeme/kaydet';
    for (const kod of ['satin_alma', 'kalite', 'depo', 'cam', 'operator']) {
      const c = await gonder(await girisYap(`r-ayar-${kod.replaceAll('_', '-')}`, kod), yol, { deger: { x: 1 } });
      assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum: 403, kod: 'YETKI_YOK' }, `${kod}: ${c.body}`);
    }
    for (const kod of ['planlama_proje', 'mudur', 'yonetici']) {
      const kabul = await gonder(await girisYap(`r-ayar-${kod.replaceAll('_', '-')}`, kod), yol, { deger: { x: 1 } });
      assert.equal(kabul.statusCode, 200, `${kod}: ${kabul.body}`);
    }
  });

  // Onaylı dağılım (kullanıcı kararı 07.10.2026). Bayraklı rol satır taşımaz, kayıtlı her işlemi alır.
  const HIC = { sayfa: false, yaz: 403, onayla: 403, ayar: 403 };
  const YAZAR = { sayfa: true, yaz: 200, onayla: 403, ayar: 403 };
  const ONAYCI = { sayfa: true, yaz: 200, onayla: 200, ayar: 403 };
  const DAGILIM: Record<string, typeof HIC> = {
    yonetici: { sayfa: true, yaz: 200, onayla: 200, ayar: 200 },
    mudur: { ...ONAYCI, ayar: 200 },
    kalite: ONAYCI,
    planlama_proje: { ...YAZAR, ayar: 200 },
    cam: YAZAR,
    satin_alma: YAZAR,
    satis: HIC,
    depo: YAZAR,
    operator: HIC,
    insan_kaynaklari: HIC,
    muhasebe_finans: HIC,
    idari_isler: HIC,
    bakim: HIC,
    sevkiyat: HIC,
    vardiya_sorumlusu: HIC,
    guvenlik_gorevlisi: HIC,
  };

  test('her rol: sayfa, kart açma, onaylama ve ayar onaylı dağılımdaki gibidir; okuma yalnız sayfası olan role açık', async () => {
    assert.deepEqual(
      (await vt().sorgu<{ kod: string }>('SELECT kod FROM rol ORDER BY kod')).map((r) => r.kod),
      Object.keys(DAGILIM).sort(),
    );
    const gonderen = await girisYap('r-gonderen', 'satin_alma');
    for (const [kod, beklenen] of Object.entries(DAGILIM)) {
      const o = await girisYap(`r-her-${kod.replaceAll('_', '-')}`, kod);
      const bekleyen = await onayBekleyenKart(gonderen);
      const alinan = {
        sayfa: o.islemler.includes('sayfa.malzemeler'),
        yaz: await kaydet(o, yeniKart(), 'onayda'),
        onayla: await kaydet(o, bekleyen, 'aktif'),
        ayar: (await gonder(o, '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { x: 2 } })).statusCode,
      };
      assert.deepEqual(alinan, beklenen, kod);
      assert.equal(await durumu(bekleyen), beklenen.onayla === 200 ? 'aktif' : 'onayda', kod);
      assert.equal((await oku(o)).statusCode, beklenen.sayfa ? 200 : 403, kod);
    }
  });

  test('rol satırları: malzeme işlemleri onaylı listedir; tanım ve ayar işlemi yalnız müdür ve planlamada', async () => {
    const satirlar = (await vt().sorgu<{ kod: string; islem: string }>(
      "SELECT r.kod, ri.islem FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE ri.islem LIKE '%malzemeler%'",
    )).map((s) => `${s.kod}:${s.islem}`).sort();
    // Önce verilenler gelir: boş tabloda aşağıdaki yokluk kendiliğinden geçerdi.
    assert.deepEqual(satirlar, [
      'cam:malzemeler.yaz', 'cam:sayfa.malzemeler',
      'depo:malzemeler.yaz', 'depo:sayfa.malzemeler',
      'kalite:malzemeler.onayla', 'kalite:malzemeler.yaz', 'kalite:sayfa.malzemeler',
      'mudur:malzemeler.onayla', 'mudur:malzemeler.tanim-yaz', 'mudur:malzemeler.yaz', 'mudur:sayfa.malzemeler',
      'planlama_proje:malzemeler.tanim-yaz', 'planlama_proje:malzemeler.yaz', 'planlama_proje:sayfa.malzemeler',
      'satin_alma:malzemeler.yaz', 'satin_alma:sayfa.malzemeler',
    ]);
  });
});
