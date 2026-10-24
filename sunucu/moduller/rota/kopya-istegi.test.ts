import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir } from '#cekirdek/zamanlayici.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AdimGirdisi, KomutCevabi, KopyaIstegiCevabi, RevizyonAyrintisi, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { isler } from './isler.ts';

const PAROLA = 'dogru-parola-1';

// Kart #500: yeni kartta "reçete ve rotayı şu üründen al". Kart yazan (kalite: malzemeler.yaz var, rota.yaz yok) ve rota yazan ister;
// kopya her zaman taslaktır, ilerletmek rota.yaz, yürürlüğe almak rota.onayla ister.
describe('rota kopya isteği (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c: Record<'yonetici' | 'kartOnaycisi' | 'planlama' | 'mudur' | 'kalite' | 'operator', string> = {
    yonetici: '', kartOnaycisi: '', planlama: '', mudur: '', kalite: '', operator: '',
  };
  let tipler: SeceneklerCevabi['operasyonTipleri'] = [];
  let makine = 0;
  let hammadde = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, kimlik: string | null = randomUUID()) =>
    app.inject({
      method: yontem, url: `/api${url}`, payload: payload as object | undefined,
      headers: { cookie: cerez, ...(yontem === 'POST' && kimlik !== null ? { [ISTEK_KIMLIGI_BASLIGI]: kimlik } : {}) },
    });

  async function tamam<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const cevap = await istek(cerez, yontem, url, payload);
    assert.equal(cevap.statusCode, 200, `${yontem} ${url}: ${cevap.body}`);
    return cevap.json();
  }

  async function kisiEkle(kullaniciAdi: string, rolId: number): Promise<number> {
    return vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, id, rolId);
      for (const rol of kisi.roller) if (rol.id !== rolId) await rolAl(db, yoneticiId, id, rol.id);
      return id;
    });
  }
  const kisiId = (kullaniciAdi: string) => vt().tx(async (db) => (await db.tek<{ id: number }>('SELECT id FROM kisi WHERE ad = $1', [`Deneme ${kullaniciAdi}`]))!.id);

  // Kart malzemeler modülünün kendi uçlarıyla açılır; 'onayda' kart sonra onayla() ile kullanıma girer (kartı açan onaylayamaz).
  async function kartAc(tur: 'mamul' | 'hammadde', durum: 'aktif' | 'onayda', ops: { no: number; kod: string; ad: string }[] = []) {
    const kimlik = `rk${++sayac}`;
    const zorunlu = tur === 'hammadde' ? { grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 + sayac } } : { g: { ad: `Deneme mamul ${sayac}` } };
    const kod = `${tur === 'hammadde' ? 'HM' : 'MM'}-RKI-00001`;
    const govde = (d: string, surum: number | null) => ({
      kayit: { id: kimlik, tur, fam: 'metal', com: { kod, ad: `Deneme ${tur} ${sayac}`, birim: 'adet' }, ...(ops.length > 0 ? { ops } : {}), onay: { durum: d }, ...zorunlu },
      ozet: { stok_kodu: kod, tur, onay_durumu: d, benzersiz_anahtar: `${tur}|${kimlik}`, mukerrer_gerekcesi: null },
      surum,
    });
    const r = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('taslak', null));
    const g = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('onayda', r.surum));
    const onayla = async () => { await tamam(c.kartOnaycisi, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('aktif', g.surum)); };
    if (durum === 'aktif') await onayla();
    const no = (await vt().tx((db) => db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik])))!.no;
    return { no, onayla };
  }

  const tip = (kod: string): number => {
    const t = tipler.find((x) => x.kod === kod);
    if (!t) throw new Error(`Operasyon tipi yok: ${kod}`);
    return t.id;
  };
  const adim = (ad: string, opNo: number | null = null): AdimGirdisi => ({
    opNo, operasyonTipiId: tip('TRN'), ad, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 30, birimSureDk: 2,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
    adaylar: [], bilesenler: [{ malzemeId: hammadde, miktar: 1, fireYuzde: 0 }], yanUrunler: [],
  });
  const komut = (id: number, ad: string, govde: Record<string, unknown>, cerez: string) => istek(cerez, 'POST', `/rota/revizyonlar/${id}/${ad}`, govde);
  const kopyaIste = (hedef: number, kaynakUrunId: number, cerez = c.kalite, kimlik: string | null = randomUUID()) =>
    istek(cerez, 'POST', `/rota/urunler/${hedef}/kopya-iste`, { kaynakUrunId }, kimlik);
  const revizyonlar = (urun: number) => vt().tx((db) => db.sorgu<{ id: number; durum: string; acan: number; kaynak: number | null }>(
    'SELECT id, durum, acan_kisi_id AS acan, kaynak_revizyon_id AS kaynak FROM rota_revizyonu WHERE malzeme_id = $1 ORDER BY id', [urun]));
  const istekler = (hedef: number) => vt().tx((db) => db.sorgu<{ kaynak: number; isteyen: number }>(
    'SELECT kaynak_malzeme_id AS kaynak, isteyen_kisi_id AS isteyen FROM rota_kopya_istegi WHERE hedef_malzeme_id = $1', [hedef]));
  const adimlar = async (id: number) => (await tamam<RevizyonAyrintisi>(c.planlama, 'GET', `/rota/revizyonlar/${id}`)).adimlar.map((a) => [a.opNo, a.ad]);

  // Kaynak: OP 10 ve OP 20'li yürürlükteki rota.
  async function kaynakUrun(): Promise<{ urun: number; revizyon: number }> {
    const { no } = await kartAc('mamul', 'aktif');
    const { id } = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/urunler/${no}/taslak-ac`, { kaynak: { tur: 'bos' } });
    const k = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/kaydet`, { surum: 1, aciklama: null, adimlar: [adim('Torna'), adim('Freze')] });
    const g = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/onaya-gonder`, { surum: k.surum });
    await tamam(c.mudur, 'POST', `/rota/revizyonlar/${id}/onayla`, { surum: g.surum, yururlugeAl: true });
    return { urun: no, revizyon: id };
  }

  before(async () => {
    ortam = await testVeritabaniKur('rota_kopya');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await girisCerezi('yonetici');
    // Rol x işlem satırları teslimle girmez: rota.test.ts ile aynı öneri dağılımı test veritabanına yazılır.
    await ortam.vt.tx((db) => db.sorgu(
      `INSERT INTO rol_islemi (rol_id, islem)
       SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem FROM (VALUES ('planlama_proje', 'rota.yaz'), ('mudur', 'rota.onayla')) AS m (kod, islem)
       ON CONFLICT DO NOTHING`,
    ));
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kart Onaycısı', kullaniciAdi: 'kartonay', parola: PAROLA }));
    c.kartOnaycisi = await girisCerezi('kartonay');
    const roller = ((await istek(c.yonetici, 'GET', '/roller')).json() as { roller: { id: number; ad: string }[] }).roller;
    const rol = (ad: string): number => {
      const r = roller.find((x) => x.ad === ad);
      if (!r) throw new Error(`Rol yok: ${ad}`);
      return r.id;
    };
    for (const [ad, rolAdi] of [['planlama', 'Planlama ve Proje'], ['mudur', 'Müdür'], ['kalite', 'Kalite'], ['operator', 'Operatör']] as const) {
      await kisiEkle(ad, rol(rolAdi));
      c[ad] = await girisCerezi(ad);
    }
    tipler = (await tamam<SeceneklerCevabi>(c.operator, 'GET', '/rota/secenekler')).operasyonTipleri;
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RK-IM', ad: 'Deneme merkez', aciklama: null });
    const istasyon = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RK-A', ad: 'Deneme A', isMerkeziId: merkez.id })).id;
    makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RK-MA', ad: 'Deneme makine A', istasyonId: istasyon })).id;
    hammadde = (await kartAc('hammadde', 'aktif')).no;
  });

  after(async () => { await ortam?.kaldir(); });

  test('RT-80: kullanımdaki karta kart yazan kopya ister; kaynağın yürürlükteki rotası taslak açılır, kaynak değişmez; açan isteyendir', async () => {
    const kaynak = await kaynakUrun();
    const { no: hedef } = await kartAc('mamul', 'aktif');
    const r = await kopyaIste(hedef, kaynak.urun);
    assert.equal(r.statusCode, 200, r.body);
    const cevap = r.json<KopyaIstegiCevabi>();
    assert.equal(cevap.durum, 'acildi');
    assert.equal(cevap.revizyon?.durum, 'taslak');
    const [rev, ...fazla] = await revizyonlar(hedef);
    assert.equal(fazla.length, 0);
    assert.deepEqual([rev?.durum, rev?.acan, rev?.kaynak], ['taslak', await kisiId('kalite'), kaynak.revizyon]);
    assert.deepEqual(await adimlar(rev!.id), [[10, 'Torna'], [20, 'Freze']]);
    assert.deepEqual((await revizyonlar(kaynak.urun)).map((x) => x.durum), ['yururlukte']);
    assert.equal((await istekler(hedef)).length, 0);
  });

  test('RT-80: kart onayda iken istek bekler; kart onaylanınca iş taraması karttaki operasyonlar yerine kaynaktan açar; istek silinir', async () => {
    const kaynak = await kaynakUrun();
    const yeni = await kartAc('mamul', 'onayda', [{ no: 10, kod: 'BM', ad: 'Karttaki muayene' }]);
    const r = await kopyaIste(yeni.no, kaynak.urun);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json<KopyaIstegiCevabi>(), { durum: 'bekliyor', revizyon: null });
    assert.deepEqual(await istekler(yeni.no), [{ kaynak: kaynak.urun, isteyen: await kisiId('kalite') }]);
    assert.equal(await isiBirKezCalistir(vt(), isler[0]!), 'tamam');
    assert.equal((await revizyonlar(yeni.no)).length, 0, 'kart onaylanmadan taslak açılmaz');

    await yeni.onayla();
    assert.equal(await isiBirKezCalistir(vt(), isler[0]!), 'tamam');
    const [rev, ...fazla] = await revizyonlar(yeni.no);
    assert.equal(fazla.length, 0);
    assert.deepEqual([rev?.durum, rev?.acan, rev?.kaynak], ['taslak', await kisiId('kalite'), kaynak.revizyon]);
    assert.deepEqual(await adimlar(rev!.id), [[10, 'Torna'], [20, 'Freze']]);
    assert.equal((await istekler(yeni.no)).length, 0);
  });

  test('RT-80: aynı karta yeni istek öncekinin yerine geçer; Reçete ve Rota açılışındaki tarama da isteği açar', async () => {
    const ilk = await kaynakUrun();
    const ikinci = await kaynakUrun();
    const yeni = await kartAc('mamul', 'onayda');
    assert.equal((await kopyaIste(yeni.no, ilk.urun)).statusCode, 200);
    assert.equal((await kopyaIste(yeni.no, ikinci.urun, c.planlama)).statusCode, 200);
    assert.deepEqual(await istekler(yeni.no), [{ kaynak: ikinci.urun, isteyen: await kisiId('planlama') }]);
    await yeni.onayla();
    assert.ok((await tamam<{ acilan: number }>(c.planlama, 'POST', '/rota/karttan-taslaklar')).acilan >= 1);
    assert.deepEqual((await revizyonlar(yeni.no)).map((x) => [x.durum, x.kaynak]), [['taslak', ikinci.revizyon]]);
  });

  test('RT-80: açılamayan istek silinir; kartın operasyonları varsa ilk taslak onlardan açılır', async () => {
    const yururluksuz = (await kartAc('mamul', 'aktif')).no;
    const yeni = await kartAc('mamul', 'onayda', [{ no: 10, kod: 'TRN', ad: 'Karttaki torna' }]);
    // Uç yürürlükte rotası olmayan kaynağı kabul etmez; sonradan rotasını yitirmiş kaynağın yerine istek doğrudan yazılır.
    await vt().tx((db) => db.sorgu('INSERT INTO rota_kopya_istegi (hedef_malzeme_id, kaynak_malzeme_id, isteyen_kisi_id) VALUES ($1, $2, $3)', [yeni.no, yururluksuz, yoneticiId]));
    await yeni.onayla();
    assert.equal(await isiBirKezCalistir(vt(), isler[0]!), 'tamam');
    const [rev] = await revizyonlar(yeni.no);
    assert.equal(rev?.kaynak, null);
    assert.deepEqual(await adimlar(rev!.id), [[10, 'Karttaki torna']]);
    assert.equal((await istekler(yeni.no)).length, 0);
  });

  test('RT-80: kopya taslağını kart yazan ilerletemez; onaya rota.yaz gönderir, yürürlüğe rota.onayla alır', async () => {
    const kaynak = await kaynakUrun();
    const { no: hedef } = await kartAc('mamul', 'aktif');
    const { revizyon } = (await kopyaIste(hedef, kaynak.urun)).json<KopyaIstegiCevabi>();
    const id = revizyon!.id;
    assert.equal((await komut(id, 'kaydet', { surum: 1, aciklama: null, adimlar: [adim('Torna', 10)] }, c.kalite)).statusCode, 403);
    assert.equal((await komut(id, 'onaya-gonder', { surum: 1 }, c.kalite)).statusCode, 403);
    const g = await komut(id, 'onaya-gonder', { surum: 1 }, c.planlama);
    assert.equal(g.statusCode, 200, g.body);
    const surum = g.json<KomutCevabi>().surum;
    assert.equal((await komut(id, 'onayla', { surum, yururlugeAl: true }, c.planlama)).statusCode, 403);
    assert.equal((await komut(id, 'onayla', { surum, yururlugeAl: true }, c.kalite)).statusCode, 403);
    const o = await komut(id, 'onayla', { surum, yururlugeAl: true }, c.mudur);
    assert.equal(o.statusCode, 200, o.body);
    assert.equal(o.json<KomutCevabi>().durum, 'yururlukte');
  });

  test('RT-80: reddedilenler: yetkisiz rol 403, kimliksiz istek 400, kaynak kendisi ya da yürürlükte rotasız 400, rotası olan kart 409, mamul olmayan kart 422', async () => {
    const kaynak = await kaynakUrun();
    const { no: hedef } = await kartAc('mamul', 'onayda');
    assert.equal((await kopyaIste(hedef, kaynak.urun, c.operator)).statusCode, 403);
    assert.equal((await kopyaIste(hedef, kaynak.urun, c.kalite, null)).statusCode, 400);
    assert.equal((await kopyaIste(hedef, hedef)).statusCode, 400);
    const rotasiz = (await kartAc('mamul', 'aktif')).no;
    assert.equal((await kopyaIste(hedef, rotasiz)).statusCode, 400);
    assert.equal((await kopyaIste(kaynak.urun, (await kaynakUrun()).urun)).statusCode, 409);
    assert.equal((await kopyaIste(hammadde, kaynak.urun)).statusCode, 422);
    assert.equal((await kopyaIste(999_999_999, kaynak.urun)).statusCode, 404);
    assert.equal((await istekler(hedef)).length, 0);
  });
});
