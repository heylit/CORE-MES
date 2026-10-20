import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

type Nesne = Record<string, unknown>;

// Kart onay durumu ve benzersiz anahtar kuralları (kart #163): her gövde köprünün (`kopru.ts`) ve prototipin (`katalog.html`
// `Store.put`, `onayAta`, `onayUygula`, `talepOlustur`) gönderdiği biçimdedir: özet `onay_durumu` = kayıttaki `onay.durum`.
describe('Malzeme kataloğu onay bağlamaları (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let onayci = '';
  let onayci2 = '';
  let yazar = '';
  let yazar2 = '';
  let tanimYazar = '';
  let tanimOnayci = '';
  let sorumlu = { id: 0, cerez: '' };
  let yazarId = 0;
  let onayciId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (cerezi: string, url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cerezi }, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, govde)) as object }) });
  async function tamam<T>(cerezi: string, url: string, govde?: unknown): Promise<T> {
    const c = await istek(cerezi, url, govde);
    assert.equal(c.statusCode, 200, `POST ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function ret(durum: number, kod: string, cerezi: string, url: string, govde?: unknown): Promise<LightMyRequestResponse> {
    const c = await istek(cerezi, url, govde);
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum, kod }, `POST ${url}: ${c.body}`);
    return c;
  }
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string, aktor?: number): Promise<{ id: number; cerez: string }> {
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedefRol !== yoneticiRolu && aktor !== undefined) {
        await rolAta(db, aktor, yeni, hedefRol);
        await rolAl(db, aktor, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { id, cerez: String(c.headers['set-cookie']).split(';')[0] ?? '' };
  }

  // Bir kartın yaşam öyküsünü tutar; `govde` köprünün göndereceği gövdeyi kurar (kayıt, özet, sürüm).
  let sayac = 0;
  // `rev`: ekran değişiklik geçmişini her kayıtta baştan gönderir.
  interface Kart { kimlik: string; surum: number | null; icerik: Nesne; onay: Nesne; stokKodu: string | null; rev?: unknown }
  interface Ek { tur?: string; kod?: string; anahtar?: string | null; gerekce?: string | null; kimlik?: string }
  const yeni = (ek: Ek = {}): Kart & { ek: Ek } => {
    const kimlik = ek.kimlik ?? `onb${++sayac}`;
    return {
      kimlik, surum: null, stokKodu: null, ek,
      icerik: { id: kimlik, tur: ek.tur ?? 'hammadde', fam: 'metal', com: { kod: ek.kod ?? 'HM-ONY-00001', ad: `Onay kart ${kimlik}`, birim: 'adet' }, opts: { koruma: ['Koruyucu folyo'] } },
      onay: { durum: 'taslak' },
    };
  };
  type K = ReturnType<typeof yeni>;
  const ozetKayit = (k: K, durum: string, ekKayit: Nesne = {}): { kayit: Nesne; ozet: Nesne } => ({
    kayit: { ...k.icerik, ...(k.rev === undefined ? {} : { rev: k.rev }), ...(k.stokKodu ? { com: { ...(k.icerik['com'] as Nesne), kod: k.stokKodu } } : {}), ...ekKayit, onay: { ...k.onay, durum, ...(ekKayit['onay'] as Nesne | undefined) } },
    ozet: {
      stok_kodu: k.stokKodu ?? k.ek.kod ?? 'HM-ONY-00001', tur: k.ek.tur ?? 'hammadde', onay_durumu: durum,
      benzersiz_anahtar: k.ek.anahtar === undefined ? `HM|metal|${k.kimlik}` : k.ek.anahtar, mukerrer_gerekcesi: k.ek.gerekce ?? null,
    },
  });
  const govde = (k: K, durum: string, ekKayit: Nesne = {}, ozetEk: Nesne = {}) => {
    const g = ozetKayit(k, durum, ekKayit);
    return { kayit: g.kayit, ozet: { ...g.ozet, ...ozetEk }, surum: k.surum };
  };
  const yol = (k: K): string => `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`;
  // Başarılı yazmadan sonra kartın sürümünü ve stok kodunu ve onay kaydını günceller (köprü ve prototip de böyle yapar).
  async function kaydet(cerez: string, k: K, durum: string, ekKayit: Nesne = {}, ozetEk: Nesne = {}): Promise<KatalogKartiKaydetCevabi> {
    const g = govde(k, durum, ekKayit, ozetEk);
    const r = await tamam<KatalogKartiKaydetCevabi>(cerez, yol(k), g);
    k.surum = r.surum;
    k.stokKodu = r.stok_kodu;
    k.icerik = { ...k.icerik, ...Object.fromEntries(Object.entries(ekKayit).filter(([a]) => a !== 'onay' && a !== 'talep' && a !== 'rev' && a !== 'updatedAt')) };
    k.onay = g.kayit['onay'] as Nesne;
    if (ekKayit['rev'] !== undefined) k.rev = ekKayit['rev'];
    return r;
  }
  const reddedilir = (durum: number, kod: string, cerez: string, k: K, d: string, ekKayit: Nesne = {}, ozetEk: Nesne = {}): Promise<LightMyRequestResponse> =>
    ret(durum, kod, cerez, yol(k), govde(k, d, ekKayit, ozetEk));
  const satir = (k: K) => vt().tek<{ onay_durumu: string; surum: number; benzersiz_anahtar: string | null }>(
    'SELECT onay_durumu, surum, benzersiz_anahtar FROM malzeme_katalog_karti WHERE kimlik = $1', [k.kimlik]);
  const akisAyari = (acik: boolean): Promise<unknown> => tamam(onayci, '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: acik } });

  // Prototipin yolu: yeni kart (onay akışı açıkken) onaya düşer, başka onaycı onaylar.
  async function aktifKart(ek: Ek = {}): Promise<K> {
    const k = yeni(ek);
    await kaydet(yazar, k, 'onayda');
    await kaydet(onayci2, k, 'aktif');
    return k;
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemeonay');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    // Yazma ve onay yetkileri rol göçünden gelir: satın alma ve depo yazar, kalite onaylar.
    const ilk = await girisYap('o-onayci', 'yonetici');
    onayci = ilk.cerez;
    onayciId = ilk.id;
    onayci2 = (await girisYap('o-onayci-iki', 'yonetici')).cerez;
    const y1 = await girisYap('o-yazar', 'satin_alma', ilk.id);
    yazar = y1.cerez;
    yazarId = y1.id;
    yazar2 = (await girisYap('o-yazar-iki', 'depo', ilk.id)).cerez;
    sorumlu = await girisYap('o-sorumlu', 'kalite', ilk.id);
    // Yalnız tanım yazma yetkisi olan kullanıcı (ayar ucu): hiçbir rol `tanim-yaz` taşımaz; malzeme işlemi olmayan bir role burada eklenir.
    const bos = (await ortam.vt.tek<{ kod: string }>(
      "SELECT kod FROM rol r WHERE NOT yonetici AND NOT EXISTS (SELECT 1 FROM rol_islemi ri WHERE ri.rol_id = r.id AND ri.islem LIKE '%malzemeler%') ORDER BY kod LIMIT 1",
    ))!.kod;
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'malzemeler.tanim-yaz' FROM rol WHERE kod = $1", [bos]);
    tanimYazar = (await girisYap('o-tanim', bos, ilk.id)).cerez;
    // Tanım ve onay işlemlerini birlikte taşıyan, bayraksız kişi (müdür ya da iki rollü kişi gibi; ekranda 'yonetici' rolüne düşer).
    const ikili = await girisYap('o-tanim-onay', bos, ilk.id);
    await ortam.vt.tx(async (db) => rolAta(db, ilk.id, ikili.id, (await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'kalite'"))!.id));
    tanimOnayci = ikili.cerez;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  /* ---------------- prototipin meşru akışları: bağlamalardan sonra da çalışır ---------------- */

  test('Kabul: yeni kart onaya düşer, başka onaycı onaylar; açan yazar olsa da onay verilir', async () => {
    const k = await aktifKart();
    assert.equal((await satir(k))?.onay_durumu, 'aktif');
  });

  test('Kabul: onaycı reddeder (onayda -> taslak), yazar düzeltip yeniden onaya gönderir, başka onaycı onaylar', async () => {
    const k = yeni();
    await kaydet(yazar, k, 'onayda');
    await kaydet(onayci, k, 'taslak', { onay: { red: { neden: 'Ölçü yanlış' } } });
    assert.equal((await satir(k))?.onay_durumu, 'taslak');
    await kaydet(yazar, k, 'onayda');
    await kaydet(onayci2, k, 'aktif');
    assert.equal((await satir(k))?.onay_durumu, 'aktif');
  });

  test('Kabul: aktif kartı düzenle -> onaya düşer -> onayla; değişiklik talebi (aktif kalır, içerik değişmez) -> onaycı uygular', async () => {
    const k = await aktifKart();
    // Onay akışı açıkken prototip aktif kartı doğrudan değiştirmez: `talepOlustur` kartı aktif bırakıp `talep` ekler.
    await kaydet(yazar, k, 'aktif', {
      talep: { id: 't1', durum: 'beklemede', yeni: { ...k.icerik, opts: { koruma: ['Başka folyo'] } }, farklar: [{ f: 'Koruma' }], by: 1, t: 5 },
      rev: [{ t: 5, ch: [{ f: 'Değişiklik talebi' }] }], updatedAt: 5,
    });
    assert.equal((await satir(k))?.onay_durumu, 'aktif');
    // Onaycı talebi uygular: içerik değişir, talep kalkar (aktif -> aktif, onay yetkisiyle).
    await kaydet(onayci, k, 'aktif', { opts: { koruma: ['Başka folyo'] }, rev: [{ t: 5, ch: [{ f: 'Değişiklik talebi' }] }, { t: 6 }], updatedAt: 6 });
    // Ekran aktif kartı kendi başına onaya düşürmez (kart kullanımdan düşerdi): yazma yetkilisi için ret, onaycı için geçerli.
    await reddedilir(403, 'YETKI_YOK', yazar, k, 'onayda', { opts: { koruma: ['Üçüncü folyo'] }, onay: { degisiklik: true } });
    await reddedilir(403, 'YETKI_YOK', yazar, k, 'onayda');
    assert.equal((await satir(k))?.onay_durumu, 'aktif');
    await kaydet(onayci, k, 'onayda', { opts: { koruma: ['Üçüncü folyo'] }, onay: { degisiklik: true } });
    await kaydet(onayci2, k, 'aktif');
    assert.equal((await satir(k))?.onay_durumu, 'aktif');
  });

  test('Kabul: pasife al / aktif yap (onaycı); aktif yap onay akışında önce onaya düşer', async () => {
    const k = await aktifKart();
    await reddedilir(403, 'YETKI_YOK', yazar, k, 'pasif');
    await kaydet(onayci, k, 'pasif', { onay: { pasif: { neden: 'Kullanım dışı' } } });
    await kaydet(onayci, k, 'onayda');
    await kaydet(onayci2, k, 'aktif');
    assert.equal((await satir(k))?.onay_durumu, 'aktif');
  });

  test('Kabul: taslak iptal; mükerrer + gerekçe; onay akışı kapalıyken doğrudan aktif ve aktif kartın düzenlenmesi', async () => {
    const t = yeni();
    await kaydet(yazar, t, 'onayda');
    await kaydet(onayci, t, 'taslak');
    await tamam(yazar, `/malzeme-katalogu-kartlari/${t.kimlik}/iptal`);

    const a = yeni({ anahtar: 'HM|metal|ayni-onay' });
    await kaydet(yazar, a, 'onayda');
    const b = yeni({ anahtar: 'HM|metal|ayni-onay' });
    await reddedilir(409, 'CAKISMA', yazar, b, 'onayda');
    const c = yeni({ anahtar: 'HM|metal|ayni-onay', gerekce: 'Müşteriye özel ayrı kart' });
    await kaydet(yazar, c, 'onayda');

    await akisAyari(false);
    try {
      const d = yeni();
      await kaydet(yazar, d, 'aktif');
      await kaydet(yazar, d, 'aktif', { opts: { koruma: ['Akış kapalıyken düzenlendi'] } });
      assert.equal((await satir(d))?.onay_durumu, 'aktif');
    } finally {
      await akisAyari(true);
    }
  });

  /* ---------------- 1. aktif ya da onaydaki kart taslağa çekilemez ---------------- */

  test('1: yazma yetkilisi aktif kartı da onaydaki kartı da taslağa çekemez; onaycı çekebilir', async () => {
    const aktif = await aktifKart();
    await reddedilir(403, 'YETKI_YOK', yazar, aktif, 'taslak');
    const bekleyen = yeni();
    await kaydet(yazar, bekleyen, 'onayda');
    await reddedilir(403, 'YETKI_YOK', yazar, bekleyen, 'taslak');
    assert.equal((await satir(bekleyen))?.onay_durumu, 'onayda');
    await kaydet(onayci, bekleyen, 'taslak');
    assert.equal((await satir(bekleyen))?.onay_durumu, 'taslak');
  });

  /* ---------------- 2. aktif kart onaysız değişmez ---------------- */

  test('2: onay yetkisi olmayan aktif kartın içeriğini ya da benzersiz anahtarını değiştirip aktif bırakamaz', async () => {
    const k = await aktifKart({ anahtar: 'HM|metal|iki-anahtar' });
    await reddedilir(403, 'YETKI_YOK', yazar, k, 'aktif', { opts: { koruma: ['Sessiz değişiklik'] } });
    await reddedilir(403, 'YETKI_YOK', yazar, k, 'aktif', {}, { benzersiz_anahtar: 'HM|metal|baska' });
    await reddedilir(403, 'YETKI_YOK', yazar, k, 'aktif', { fam: 'plastik' });
    assert.deepEqual(await satir(k), { onay_durumu: 'aktif', surum: k.surum, benzersiz_anahtar: 'HM|metal|iki-anahtar' });
    // Onaycı kendi yetkisiyle yazar; yazar değişmemiş kartı (yalnız talep/rev/updatedAt farkıyla) yeniden gönderebilir.
    await kaydet(onayci, k, 'aktif', { opts: { koruma: ['Onaylı değişiklik'] } });
    await kaydet(yazar, k, 'aktif', { rev: [{ t: 1 }], updatedAt: 1 });
  });

  /* ---------------- 3. görünen onay durumu sütunla tutarlı ---------------- */

  test('3: kayıttaki onay durumu özetle ya da sütunla tutarsızsa ya da hiç yoksa 400', async () => {
    const k = yeni();
    const sahteAktif = govde(k, 'taslak', { onay: { durum: 'aktif', onay: { byAd: 'Sahte onaylayan' } } });
    await ret(400, 'DOGRULAMA', yazar, yol(k), sahteAktif);
    const onaysiz = govde(k, 'aktif');
    delete (onaysiz.kayit as Nesne)['onay'];
    await ret(400, 'DOGRULAMA', onayci, yol(k), onaysiz);
    const yanlisTur = govde(k, 'onayda');
    (yanlisTur.kayit as Nesne)['onay'] = 'aktif';
    await ret(400, 'DOGRULAMA', yazar, yol(k), yanlisTur);
    await kaydet(yazar, k, 'onayda');
    await ret(400, 'DOGRULAMA', yazar, yol(k), govde(k, 'onayda', { onay: { durum: 'aktif' } }));
    assert.equal((await satir(k))?.onay_durumu, 'onayda');
  });

  /* ---------------- 4. dört göz: onay adımı atlanmaz ---------------- */

  test('4: onay akışı açıkken aktife yalnız onaydan geçilir (yeni kart, taslak, pasif doğrudan aktif olamaz)', async () => {
    const yenik = yeni();
    await reddedilir(422, 'GECERSIZ', onayci, yenik, 'aktif');
    const t = yeni();
    await kaydet(onayci, t, 'taslak');
    await reddedilir(422, 'GECERSIZ', onayci, t, 'aktif');
    await kaydet(onayci, t, 'onayda');
    await kaydet(onayci2, t, 'aktif');
    await kaydet(onayci, t, 'pasif');
    await reddedilir(422, 'GECERSIZ', onayci2, t, 'aktif');
  });

  test('4: dört göz açıkken kartı açan kişi, onaya başkası göndermiş olsa da, onaylayamaz', async () => {
    const k = yeni();
    await kaydet(onayci, k, 'taslak');
    await kaydet(yazar, k, 'onayda');
    await reddedilir(403, 'YETKI_YOK', onayci, k, 'aktif');
    await kaydet(onayci2, k, 'aktif');
    assert.equal((await satir(k))?.onay_durumu, 'aktif');
  });

  test('4: onay akışı kapalıyken bugünkü davranış kalır (taslaktan, pasiften doğrudan aktif; onaycı yeni kartı aktif açar)', async () => {
    await akisAyari(false);
    try {
      const t = yeni();
      await kaydet(onayci, t, 'taslak');
      await kaydet(onayci, t, 'aktif');
      await kaydet(onayci, t, 'pasif');
      await kaydet(onayci, t, 'aktif');
      const n = yeni();
      await kaydet(onayci, n, 'aktif');
      await kaydet(onayci, n, 'aktif', { opts: { koruma: ['x'] } });
    } finally {
      await akisAyari(true);
    }
  });

  /* ---------------- çekirdek kalıplarından güvenlik ve tutarlılık olanlar ---------------- */

  test('MKK-10: hammadde ve sarf kartında benzersiz anahtar zorunlu; diğer türlerde ekran anahtarı üretemeyebilir (null kabul)', async () => {
    await reddedilir(400, 'DOGRULAMA', yazar, yeni({ anahtar: null }), 'onayda');
    await reddedilir(400, 'DOGRULAMA', yazar, yeni({ anahtar: '   ' }), 'onayda');
    await reddedilir(400, 'DOGRULAMA', yazar, yeni({ tur: 'sarf', kod: 'SF-KYN-00001', anahtar: null }), 'onayda');
    await kaydet(yazar, yeni({ tur: 'mamul', kod: 'MM-URN-00001', anahtar: null }), 'onayda');
    await kaydet(yazar, yeni({ tur: 'demirbas', kod: 'DB-OLC-00001', anahtar: null }), 'onayda');
  });

  test('MKK-10: gerekçesiz mükerrer 409; gerekçe en az 10 karakter (kullanıcı kararı 16.10.2026), kısası 400', async () => {
    const a = yeni({ anahtar: 'HM|metal|gerekce' });
    await kaydet(yazar, a, 'onayda');
    await reddedilir(409, 'CAKISMA', yazar, yeni({ anahtar: 'HM|metal|gerekce', gerekce: null }), 'onayda');
    await reddedilir(409, 'CAKISMA', yazar, yeni({ anahtar: 'HM|metal|gerekce', gerekce: '   ' }), 'onayda');
    await reddedilir(400, 'DOGRULAMA', yazar, yeni({ anahtar: 'HM|metal|gerekce', gerekce: 'x' }), 'onayda');
    await kaydet(yazar, yeni({ anahtar: 'HM|metal|gerekce', gerekce: 'Ayrı kart gerekli' }), 'onayda');
  });

  test('MKK-1: stok kodu öneki başka türün önekiyle başlarsa 400 (sıra tablosuna satır açılmaz); serbest önek 400, elle yazılan tür-grup kodunun sayısı yok sayılır', async () => {
    const k = yeni({ tur: 'hammadde', kod: 'SF-UYD-00001' });
    await reddedilir(400, 'DOGRULAMA', yazar, k, 'onayda');
    const s = yeni({ tur: 'sarf', kod: 'HM-UYD-00001' });
    await reddedilir(400, 'DOGRULAMA', yazar, s, 'onayda');
    assert.equal((await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM malzeme_katalog_kod_sirasi WHERE onek IN ('SF-UYD-', 'HM-UYD-')"))?.n, 0);
    await kaydet(yazar, yeni({ tur: 'sarf', kod: 'SF-UYD-00001' }), 'onayda');
    // Ekranda malzeme kodu elle yazılabilir (kodIn) ama serbest önek geçmez (kart #230): yalnız tür-grup öneki, sayı yok sayılır.
    await reddedilir(400, 'DOGRULAMA', yazar, yeni({ kod: 'ABC-00001' }), 'onayda');
    assert.equal((await kaydet(yazar, yeni({ kod: 'HM-ELL-99999' }), 'onayda')).stok_kodu, 'HM-ELL-00001');
  });

  test('Yeni kart doğrudan pasif açılamaz (onay yetkisi olsa da)', async () => {
    await reddedilir(422, 'GECERSIZ', yazar, yeni(), 'pasif');
    await reddedilir(422, 'GECERSIZ', onayci, yeni(), 'pasif');
  });

  test('`kayit.com` nesne değilse 400 (stok kodu karta basılamaz)', async () => {
    for (const com of ['metin', null, ['x'], 5]) {
      const k = yeni();
      const g = govde(k, 'onayda');
      (g.kayit as Nesne)['com'] = com;
      await ret(400, 'DOGRULAMA', yazar, yol(k), g);
    }
    const k2 = yeni();
    const g2 = govde(k2, 'onayda');
    delete (g2.kayit as Nesne)['com'];
    await ret(400, 'DOGRULAMA', yazar, yol(k2), g2);
  });

  /* ---------------- test boşlukları ---------------- */

  test('MKK-2: tür, açan kişi ve önek tetikleyiciyle değişmez (her sütun ayrı sınanır)', async () => {
    const k = await aktifKart();
    const dene = async (kolon: string, deger: unknown) => assert.rejects(
      vt().sorgu(`UPDATE malzeme_katalog_karti SET ${kolon} = $2 WHERE kimlik = $1`, [k.kimlik, deger]),
      (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_degismez', kolon,
    );
    await dene('tur', 'sarf');
    await dene('acan_kisi_id', onayciId);
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-BSK-', 0) ON CONFLICT DO NOTHING");
    await dene('onek', 'HM-BSK-');
  });

  test('MKK-10: yarış katmanı: aynı anahtarlı iki kart, servisi atlayan doğrudan yazmada bile dizinle engellenir (gerekçeli ve pasif olan geçer)', async () => {
    const k = await aktifKart({ anahtar: 'HM|metal|dizin' });
    const kisi = (await vt().tek<{ id: number }>('SELECT acan_kisi_id AS id FROM malzeme_katalog_karti WHERE kimlik = $1', [k.kimlik]))!.id;
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-DZN-', 0) ON CONFLICT DO NOTHING");
    const ekle = (kimlik: string, sira: number, durum: string, gerekce: string | null) => vt().sorgu(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, benzersiz_anahtar, mukerrer_gerekcesi, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'HM-DZN-', $2, 'HM|metal|dizin', $3, $4, '{}'::jsonb, $5, $5)`,
      [kimlik, sira, gerekce, durum, kisi],
    );
    await assert.rejects(ekle('dizin-a', 1, 'taslak', null), (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_anahtar_tek');
    await ekle('dizin-b', 2, 'taslak', 'Ayrı müşteri');
    await ekle('dizin-c', 3, 'pasif', null);
  });

  test('MKK-10: aynı anahtarlı iki kart eşzamanlı yazılırsa biri 409 alır', async () => {
    const [a, b] = [yeni({ anahtar: 'HM|metal|yaris' }), yeni({ anahtar: 'HM|metal|yaris' })] as [K, K];
    const sonuc = await Promise.all([a, b].map((k) => istek(yazar, yol(k), govde(k, 'onayda'))));
    assert.deepEqual(sonuc.map((c) => c.statusCode).sort(), [200, 409], sonuc.map((c) => c.body).join(' | '));
  });

  // Ön denetim kaydedilmemiş kartı göremez; yarışı dizin tutar. Kaybeden genel "aynı bilgilerle kayıt var" değil, kartın iletisini almalı.
  test('MKK-10: anahtar dizinine takılan kayıt kartın iletisiyle 409 alır; tutan kart kaydedilmeden önce ön denetimi geçmiş olsa bile', async () => {
    const anahtar = 'HM|metal|yaris-ileti';
    const k = yeni({ anahtar });
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-YRI-', 0) ON CONFLICT DO NOTHING");
    const { bekleyen } = await vt().tx(async (db) => {
      await db.sorgu(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, benzersiz_anahtar, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ('yaris-tutan', 'hammadde', 'HM-YRI-', 1, $1, 'taslak', '{}'::jsonb, $2, $2)`,
        [anahtar, onayciId],
      );
      const pid = (await db.tek<{ pid: number }>('SELECT pg_backend_pid() AS pid'))!.pid;
      const bekleyen = istek(yazar, yol(k), govde(k, 'taslak'));
      // İstek tutan transaction'ın kilidini beklemeye başlamadan bırakılırsa yarış oluşmaz; test bunu açıkça bekler.
      let bekliyor = false;
      for (let i = 0; i < 200 && !bekliyor; i++) {
        const n = await vt().tek<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_locks l WHERE l.locktype = 'transactionid' AND NOT l.granted
              AND l.transactionid = (SELECT backend_xid FROM pg_stat_activity WHERE pid = $1)`, [pid]);
        bekliyor = (n?.n ?? 0) > 0;
        if (!bekliyor) await new Promise((r) => setTimeout(r, 25));
      }
      assert.equal(bekliyor, true, 'istek anahtar dizininde beklemeye girmedi');
      return { bekleyen };
    });
    const c = await bekleyen;
    assert.deepEqual(
      { durum: c.statusCode, ...(c.json() as Nesne) },
      { durum: 409, kod: 'CAKISMA', mesaj: 'Bu malzemenin kartı az önce başka biri tarafından açıldı. Listeyi yenileyip mevcut kartı kullan ya da gerekçe yaz.', alan: 'ozet.benzersiz_anahtar' },
    );
    assert.equal(await satir(k), null);
  });

  test('MKK-7: aynı sürümle eşzamanlı iki yazmadan biri geçer, öteki 409 alır', async () => {
    const k = await aktifKart();
    const sonuc = await Promise.all([
      istek(onayci, yol(k), govde(k, 'aktif', { opts: { koruma: ['A'] } })),
      istek(onayci2, yol(k), govde(k, 'aktif', { opts: { koruma: ['B'] } })),
    ]);
    assert.deepEqual(sonuc.map((c) => c.statusCode).sort(), [200, 409], sonuc.map((c) => c.body).join(' | '));
    assert.equal((await satir(k))?.surum, (k.surum ?? 0) + 1);
  });

  /* ---------------- denetim turu 1 (kart #163): yan yoldan dolanma ---------------- */

  const kayitOku = async (k: K): Promise<Nesne> => (await vt().tek<{ kayit: Nesne }>('SELECT kayit FROM malzeme_katalog_karti WHERE kimlik = $1', [k.kimlik]))!.kayit;
  const onayAlani = async (k: K, alan: string): Promise<Nesne> => ((await kayitOku(k))['onay'] as Nesne)[alan] as Nesne;
  const dortGozAyari = (deger: boolean): Promise<unknown> => tamam(onayci, '/ayarlar/malzemeler.dort-goz/degistir', { deger });

  test('MKK-12: yazma yetkilisi aktif kartı içerik ve anahtar değiştirerek onaya düşüremez (akış açık ya da kapalı); onaycı düşürebilir', async () => {
    const k = await aktifKart();
    await reddedilir(403, 'YETKI_YOK', yazar, k, 'onayda', { opts: { koruma: ['Sessiz'] } }, { benzersiz_anahtar: 'HM|metal|sessiz' });
    assert.equal((await satir(k))?.onay_durumu, 'aktif');
    await akisAyari(false);
    try {
      await reddedilir(403, 'YETKI_YOK', yazar, k, 'onayda', { opts: { koruma: ['Sessiz'] } });
    } finally {
      await akisAyari(true);
    }
    await kaydet(sorumlu.cerez, k, 'onayda', { opts: { koruma: ['Onaylı değişiklik'] } });
  });

  test('MKK-4: dört göz açıkken onaylayan içeriği, anahtarı ya da gerekçeyi değiştirip onaylayamaz; ekranın onayla gövdesi geçer (yönetici olmayan onaycıyla)', async () => {
    const k = yeni();
    await kaydet(yazar, k, 'onayda');
    await reddedilir(403, 'YETKI_YOK', sorumlu.cerez, k, 'aktif', { opts: { koruma: ['Gizli değişiklik'] } });
    await reddedilir(403, 'YETKI_YOK', sorumlu.cerez, k, 'aktif', {}, { benzersiz_anahtar: 'HM|metal|gizli' });
    await reddedilir(403, 'YETKI_YOK', sorumlu.cerez, k, 'aktif', {}, { mukerrer_gerekcesi: 'sonradan' });
    assert.equal((await satir(k))?.onay_durumu, 'onayda');
    // `onayUygula('onayla')` yalnız onay, rev ve updatedAt'ı değiştirir.
    await kaydet(sorumlu.cerez, k, 'aktif', { rev: [{ t: 9, ch: [{ f: 'Onay durumu' }] }], updatedAt: 9 });
    assert.equal((await satir(k))?.onay_durumu, 'aktif');
    // Dört göz kapalıyken onaylayan içeriği de belirleyebilir (ayar kapalıyken bugünkü davranış).
    const d = yeni();
    await kaydet(yazar, d, 'onayda');
    await dortGozAyari(false);
    try {
      await kaydet(sorumlu.cerez, d, 'aktif', { opts: { koruma: ['Dört göz kapalı'] } });
    } finally {
      await dortGozAyari(true);
    }
  });

  test('MKK-4: onaydaki kartın içeriğini değiştiren onaycı kartın göndereni olur ve kendi değişikliğini onaylayamaz', async () => {
    const k = yeni();
    await kaydet(yazar, k, 'onayda');
    await kaydet(sorumlu.cerez, k, 'onayda', { opts: { koruma: ['Onaycı düzeltti'] } });
    const g = await vt().tek<{ gonderen_kisi_id: number }>('SELECT gonderen_kisi_id FROM malzeme_katalog_karti WHERE kimlik = $1', [k.kimlik]);
    assert.equal(g?.gonderen_kisi_id, sorumlu.id);
    await reddedilir(403, 'YETKI_YOK', sorumlu.cerez, k, 'aktif');
    await kaydet(onayci2, k, 'aktif');
    // İçeriği değiştirmeyen yeniden gönderim göndereni değiştirmez.
    const d = yeni();
    await kaydet(yazar, d, 'onayda');
    await kaydet(sorumlu.cerez, d, 'onayda', { rev: [{ t: 3 }] });
    assert.equal((await vt().tek<{ gonderen_kisi_id: number }>('SELECT gonderen_kisi_id FROM malzeme_katalog_karti WHERE kimlik = $1', [d.kimlik]))?.gonderen_kisi_id, yazarId);
  });

  test('MKK-15: değişiklik talebini yazanı ve zamanı sunucu basar; talebi yalnız sahibi ya da onaycı değiştirir ya da kaldırır', async () => {
    const k = await aktifKart();
    const talep = { id: 't1', durum: 'beklemede', yeni: { ...k.icerik }, farklar: [{ f: 'Sahte fark' }], by: 999, byAd: 'Sahte', t: 1 };
    const rev1 = { t: 1, ch: [{ f: 'Değişiklik talebi' }] };
    await kaydet(yazar, k, 'aktif', { talep, rev: [rev1], updatedAt: 1 });
    const basili = (await kayitOku(k))['talep'] as Nesne;
    assert.deepEqual({ by: basili['by'], byAd: basili['byAd'], tamSayi: typeof basili['t'] === 'number' && (basili['t'] as number) > 1e12 }, { by: yazarId, byAd: 'Deneme o-yazar', tamSayi: true });
    const talepli = { talep, rev: [rev1], updatedAt: 1 };
    await reddedilir(403, 'YETKI_YOK', yazar2, k, 'aktif', { rev: [rev1], updatedAt: 1 });
    await reddedilir(403, 'YETKI_YOK', yazar2, k, 'aktif', { ...talepli, talep: { ...talep, yeni: { ...k.icerik, fam: 'plastik' } } });
    await kaydet(yazar, k, 'aktif', { talep: { ...talep, by: 5 }, rev: [rev1], updatedAt: 2 });
    assert.equal(((await kayitOku(k))['talep'] as Nesne)['by'], yazarId, 'değişmemiş talebin kayıtlı damgası korunur');
    await kaydet(yazar, k, 'aktif', { rev: [rev1], updatedAt: 3 });
    assert.equal((await kayitOku(k))['talep'], undefined, 'sahibi geri çekebilir');
    await kaydet(yazar, k, 'aktif', { talep, rev: [rev1], updatedAt: 4 });
    await kaydet(sorumlu.cerez, k, 'aktif', { rev: [rev1], updatedAt: 5 });
    assert.equal((await kayitOku(k))['talep'], undefined, 'onaycı reddedebilir');
  });

  test('MKK-15: değişiklik geçmişi (rev) yalnız sona eklenir; ekranın 30 kayıtlık penceresi kayar', async () => {
    const k = await aktifKart();
    // Ekran her kaydetmede sona TEK kayıt ekler (`withRev`); kayıtlar ayırt edilebilsin diye `n` alanı taşır.
    const r = (n: number): Nesne => ({ n });
    const saklanan = async (): Promise<Nesne[]> => (await kayitOku(k))['rev'] as Nesne[];
    const sahteler = { by: 999, byAd: 'Sahte kişi', t: 1 };
    const kopya: Nesne[] = [{ ...r(1), ...sahteler }];
    await kaydet(yazar, k, 'aktif', { rev: kopya });
    let gecmis = await saklanan();
    assert.deepEqual({ n: gecmis[0]!['n'], by: gecmis[0]!['by'], byAd: gecmis[0]!['byAd'], tamSayi: (gecmis[0]!['t'] as number) > 1e12 },
      { n: 1, by: yazarId, byAd: 'Deneme o-yazar', tamSayi: true }, 'eklenen kaydın kişisini ve zamanını sunucu basar');
    // Onaycı da yazar adına kayıt ekleyemez.
    kopya.push({ ...r(2), by: yazarId, byAd: 'Deneme o-yazar', t: 2 });
    await kaydet(onayci, k, 'aktif', { rev: kopya });
    gecmis = await saklanan();
    assert.deepEqual([gecmis[0]!['by'], gecmis[1]!['by'], gecmis[1]!['byAd']], [yazarId, onayciId, 'Deneme o-onayci'], 'kayıtlı kayıt korunur, yenisi yazanın adına');
    // Geçmişi silme saldırısı: on yazma da reddedilir, geçmiş korunur.
    for (let i = 0; i < 10; i++) await reddedilir(403, 'YETKI_YOK', yazar, k, 'aktif', { rev: [r(100 + i)] });
    await reddedilir(403, 'YETKI_YOK', yazar, k, 'aktif', { rev: [] });
    await reddedilir(403, 'YETKI_YOK', yazar, k, 'aktif', { rev: [r(2)] });
    await reddedilir(403, 'YETKI_YOK', yazar, k, 'aktif', { rev: [r(1), r(9), r(2)] });
    await reddedilir(403, 'YETKI_YOK', yazar, k, 'aktif', { rev: [r(1), r(2), r(3), r(4)] });
    assert.equal((await saklanan()).length, 2);
    // 30 kayıtlık pencere: tek kayıt eklenirken baştan tek kayıt düşer; fazlası reddedilir.
    for (let i = 3; i <= 30; i++) { kopya.push(r(i)); await kaydet(onayci, k, 'aktif', { rev: kopya }); }
    assert.equal((await saklanan()).length, 30);
    kopya.push(r(31));
    await kaydet(onayci, k, 'aktif', { rev: kopya.slice(-30) });
    assert.deepEqual((await saklanan()).map((e) => e['n']), Array.from({ length: 30 }, (_, i) => i + 2));
    await reddedilir(403, 'YETKI_YOK', onayci, k, 'aktif', { rev: [...kopya.slice(-28), r(40), r(41)] });
    await reddedilir(403, 'YETKI_YOK', onayci, k, 'aktif', { rev: [...kopya.slice(-30), r(42)] });
  });

  test('MKK-15: yeni kartın geçmişi dizi ve en çok bir kayıt olmalı; kaydın kişisini sunucu basar', async () => {
    const eksik = yeni();
    await ret(400, 'DOGRULAMA', yazar, yol(eksik), govde(eksik, 'onayda', { rev: 'sahte' }));
    const cok = yeni();
    await ret(400, 'DOGRULAMA', yazar, yol(cok), govde(cok, 'onayda', { rev: [{ n: 1 }, { n: 2 }] }));
    const k = yeni();
    await kaydet(yazar, k, 'onayda', { rev: [{ n: 1, yeni: true, by: 999, byAd: 'Sahte', t: 1 }] });
    const e = ((await kayitOku(k))['rev'] as Nesne[])[0]!;
    assert.deepEqual({ yeni: e['yeni'], by: e['by'], byAd: e['byAd'] }, { yeni: true, by: yazarId, byAd: 'Deneme o-yazar' });
  });

  test('MKK-9: onay akışı ayarını yalnız onay yetkisi olan açıp kapatabilir (tanim-yaz tek başına yetmez)', async () => {
    const yol2 = '/malzeme-katalogu-ayarlari/genel/kaydet';
    await ret(403, 'YETKI_YOK', tanimYazar, yol2, { deger: { onayAkisi: false } });
    await tamam(tanimYazar, yol2, { deger: { onayAkisi: true, dortGoz: true } });
    await tamam(tanimYazar, '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { x: 1 } });
    await akisAyari(false);
    try {
      await ret(403, 'YETKI_YOK', tanimYazar, yol2, { deger: { onayAkisi: true } });
      await tamam(tanimYazar, yol2, { deger: { onayAkisi: false } });
    } finally {
      await akisAyari(true);
    }
  });

  test('MKK-9: onay akışını yalnız bayraklı yönetici açıp kapatır; tanım ve onay işlemlerini birlikte taşıyan bayraksız kişi 403, öteki ayarları yazar', async () => {
    const yol2 = '/malzeme-katalogu-ayarlari/genel/kaydet';
    await ret(403, 'YETKI_YOK', tanimOnayci, yol2, { deger: { onayAkisi: false } });
    await tamam(tanimOnayci, yol2, { deger: { onayAkisi: true, dortGoz: true } });
    await tamam(tanimOnayci, '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { x: 2 } });
    await tamam(onayci, yol2, { deger: { onayAkisi: false } });
    try {
      await ret(403, 'YETKI_YOK', tanimOnayci, yol2, { deger: { onayAkisi: true } });
      await tamam(tanimOnayci, yol2, { deger: { onayAkisi: false } });
    } finally {
      await tamam(onayci, yol2, { deger: { onayAkisi: true } });
    }
  });

  test('MKK-6: onay yetkisi olmayan yalnız kendi açtığı, hiç onaylanmamış taslağı iptal eder', async () => {
    const kendi = yeni();
    await kaydet(yazar, kendi, 'taslak');
    const baskasi = yeni();
    await kaydet(yazar2, baskasi, 'taslak');
    await ret(403, 'YETKI_YOK', yazar, `/malzeme-katalogu-kartlari/${baskasi.kimlik}/iptal`);
    await tamam(yazar, `/malzeme-katalogu-kartlari/${kendi.kimlik}/iptal`);
    // Bir zamanlar aktif olmuş kart, kendi açtığı olsa da, taslağa dönünce yazar iptal edemez; onaycı edebilir.
    const eskiAktif = await aktifKart();
    await kaydet(sorumlu.cerez, eskiAktif, 'onayda');
    await kaydet(onayci2, eskiAktif, 'taslak');
    await ret(403, 'YETKI_YOK', yazar, `/malzeme-katalogu-kartlari/${eskiAktif.kimlik}/iptal`);
    await tamam(sorumlu.cerez, `/malzeme-katalogu-kartlari/${eskiAktif.kimlik}/iptal`);
    await tamam(sorumlu.cerez, `/malzeme-katalogu-kartlari/${baskasi.kimlik}/iptal`);
  });

  test('MKK-10: gerekçeli mükerrer kartta değişiklik talebi uygulanır (anahtar aynıysa kayıtlı gerekçe korunur)', async () => {
    const a = await aktifKart({ anahtar: 'HM|metal|talepli' });
    const b = yeni({ anahtar: 'HM|metal|talepli', gerekce: 'Müşteriye özel ayrı kart' });
    await kaydet(yazar, b, 'onayda');
    await kaydet(onayci2, b, 'aktif');
    const talep = { id: 't1', durum: 'beklemede', yeni: { ...b.icerik, opts: { koruma: ['Yeni'] } }, farklar: [{ f: 'Koruma' }] };
    await kaydet(yazar, b, 'aktif', { talep, rev: [{ n: 1 }] });
    // `talepUygula` `mukerrerOnay`'ı geri koymaz: özet gerekçesi boş gelir.
    await kaydet(sorumlu.cerez, b, 'aktif', { opts: { koruma: ['Yeni'] }, rev: [{ n: 1 }, { n: 2 }] }, { mukerrer_gerekcesi: null });
    const s = await vt().tek<{ mukerrer_gerekcesi: string | null }>('SELECT mukerrer_gerekcesi FROM malzeme_katalog_karti WHERE kimlik = $1', [b.kimlik]);
    assert.equal(s?.mukerrer_gerekcesi, 'Müşteriye özel ayrı kart');
    // Anahtar değişirse gerekçe korunmaz: gerekçesiz mükerrer 409.
    assert.equal(a.ek.anahtar, 'HM|metal|talepli');
    await aktifKart({ anahtar: 'HM|metal|diger' });
    await reddedilir(409, 'CAKISMA', sorumlu.cerez, b, 'aktif', {}, { mukerrer_gerekcesi: null, benzersiz_anahtar: 'HM|metal|diger' });
  });

  test('MKK-15: talep uygulanınca onaylayan sunucudan basılır (istemcinin yazdığı yok sayılır)', async () => {
    const k = await aktifKart();
    const ilkOnay = await onayAlani(k, 'onay');
    const talep = { id: 't1', durum: 'beklemede', yeni: { ...k.icerik, opts: { koruma: ['Talep'] } }, farklar: [{ f: 'Koruma' }] };
    await kaydet(yazar, k, 'aktif', { talep, rev: [{ n: 1 }] });
    assert.deepEqual(await onayAlani(k, 'onay'), ilkOnay, 'talep göndermek onaylayanı değiştirmez');
    await kaydet(sorumlu.cerez, k, 'aktif', { opts: { koruma: ['Talep'] }, rev: [{ n: 1 }, { n: 2 }], onay: { onay: { by: 999, byAd: 'Sahte', t: 1 } } });
    const o = await onayAlani(k, 'onay');
    assert.deepEqual({ by: o['by'], byAd: o['byAd'] }, { by: sorumlu.id, byAd: 'Deneme o-sorumlu' });
    // Talep reddi (içerik aynı): onaylayan değişmez.
    await kaydet(yazar, k, 'aktif', { talep: { ...talep, id: 't2' }, rev: [{ n: 1 }, { n: 2 }, { n: 3 }] });
    await kaydet(onayci, k, 'aktif', { rev: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }] });
    assert.equal((await onayAlani(k, 'onay'))['by'], sorumlu.id);
  });

  test('MKK-15: kim onayladı, gönderdi, reddetti, pasife aldı bilgisini sunucu yazar; geçiş olmayan yazmada kayıtlı değer korunur', async () => {
    const sahte = (ad: string) => ({ by: 999, byAd: ad, t: 1 });
    const kim = (ad: string, id: number) => ({ by: id, byAd: ad });
    const ozetle = (n: Nesne) => ({ by: n['by'], byAd: n['byAd'], tamSayi: typeof n['t'] === 'number' && (n['t'] as number) > 1e12 });
    const k = yeni();
    await kaydet(yazar, k, 'onayda', { onay: { talep: sahte('Sahte gönderen') } });
    assert.deepEqual(ozetle(await onayAlani(k, 'talep')), { ...kim('Deneme o-yazar', yazarId), tamSayi: true });
    await kaydet(onayci, k, 'taslak', { onay: { red: { ...sahte('Sahte reddeden'), neden: 'Ölçü yanlış' } } });
    const red = await onayAlani(k, 'red');
    assert.deepEqual({ ...ozetle(red), neden: red['neden'] }, { ...kim('Deneme o-onayci', onayciId), tamSayi: true, neden: 'Ölçü yanlış' });
    await kaydet(yazar, k, 'onayda');
    await kaydet(onayci2, k, 'aktif', { onay: { onay: sahte('Sahte onaylayan') } });
    const onayan = await onayAlani(k, 'onay');
    assert.equal(onayan['byAd'], 'Deneme o-onayci-iki');
    assert.equal(typeof onayan['by'], 'number');
    assert.notEqual(onayan['by'], 999);
    // Aktif -> aktif (geçiş yok): istemcinin gönderdiği onay damgası yok sayılır.
    await kaydet(onayci, k, 'aktif', { opts: { koruma: ['y'] }, onay: { onay: sahte('Başka onaylayan') } });
    assert.deepEqual(await onayAlani(k, 'onay'), onayan);
    await kaydet(onayci, k, 'pasif', { onay: { pasif: { ...sahte('Sahte pasifleyen'), neden: 'Kullanım dışı' } } });
    const pasif = await onayAlani(k, 'pasif');
    assert.deepEqual({ ...ozetle(pasif), neden: pasif['neden'] }, { ...kim('Deneme o-onayci', onayciId), tamSayi: true, neden: 'Kullanım dışı' });
    // Onay akışı kapalıyken de: doğrudan aktif kartı açan kişi onaylayan olarak yazılır.
    await akisAyari(false);
    try {
      const d = yeni();
      await kaydet(yazar, d, 'aktif', { onay: { onay: sahte('Sahte') } });
      assert.deepEqual(ozetle(await onayAlani(d, 'onay')), { ...kim('Deneme o-yazar', yazarId), tamSayi: true });
    } finally {
      await akisAyari(true);
    }
  });

  test('MKK-14, MKK-13: kayıttaki tür özetle aynı olmalı; aktif kartta gerekçe, pasif kartta içerik yazma yetkisiyle değişmez', async () => {
    const y = yeni();
    await reddedilir(400, 'DOGRULAMA', yazar, y, 'onayda', { tur: 'sarf' });
    const a = await aktifKart();
    await reddedilir(400, 'DOGRULAMA', yazar, a, 'aktif', { tur: 'sarf' });
    await reddedilir(403, 'YETKI_YOK', yazar, a, 'aktif', {}, { mukerrer_gerekcesi: 'sonradan yazıldı' });
    const p = await aktifKart();
    await kaydet(sorumlu.cerez, p, 'pasif');
    await reddedilir(403, 'YETKI_YOK', yazar, p, 'pasif', { opts: { koruma: ['Sessiz'] } });
    await kaydet(yazar, p, 'pasif', { rev: [{ t: 1 }] });
    await kaydet(sorumlu.cerez, p, 'pasif', { opts: { koruma: ['Onaycı düzeltti'] } });
  });
});
