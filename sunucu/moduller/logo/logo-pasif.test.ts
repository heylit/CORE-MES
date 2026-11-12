import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { ArsivKartlariCevabi, LogoDurumuCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { logoyaPasifGidecekMalzemeler, malzemeLogoPasifSonucu, malzemeLogoSonucu } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { malzemeTuru, yeniSurecBellegi } from './servis.ts';
import { denemeYaz, kopruListesiniYaz } from './sorgular.ts';
import type { TurOrtami, TurSonucu } from './servis.ts';

const PAROLA = 'dogru-parola-1';

interface KartDurumu { onay: string; gonderim: string | null; kayitNo: string | null; pasif: string | null; pasifHata: string | null; silen: number }

// 2114b (2114-2 teyit, 2114-7, ADR 0017 eki 8): Logo'ya gönderilmiş kart silinince Logo'da kullanım dışı bırakılır; sahte köprüyle uçtan uca.
describe('Logo\'ya gönderilmiş kartın Logo\'da pasife alınması (2114b, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  let kopru: SahteKopru;
  let sayac = 0;
  let simdi = Date.parse('2026-11-05T10:00:00Z');
  // Hiç değiştirilmemiş kurulumda ayarın değeri; before() sonra açar.
  let ilkPasifAyari: unknown;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerez }, ...(govde === undefined ? {} : { payload: govde as object }) });
  async function tamam<T>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<T> {
    const c = await istek(yontem, yol, govde);
    assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
    return c.json() as T;
  }
  const baglanti = (deger: boolean) => tamam('POST', '/ayarlar/logo.baglanti/degistir', { deger });
  const ortamKur = (): TurOrtami => ({
    kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 }), bellek: yeniSurecBellegi(), saat: () => new Date(simdi),
    malzemePasif: { gidecekler: logoyaPasifGidecekMalzemeler, sonuc: malzemeLogoPasifSonucu },
  });
  const tur = (): Promise<TurSonucu> => malzemeTuru(vt(), ortamKur());
  const durum = async (no: number): Promise<KartDurumu> => (await vt().tek<KartDurumu>(
    `SELECT onay_durumu AS onay, logo_gonderim_durumu AS gonderim, logo_kayit_no AS "kayitNo", logo_pasif_durumu AS pasif,
            logo_pasif_hata AS "pasifHata", guncelleyen_kisi_id AS silen
       FROM malzeme_katalog_karti WHERE no = $1`, [no]))!;

  // Onay akışı kapalı: kart doğrudan aktif açılır; TMI'nin Logo'da açtığı sayılır (sahte köprüde de kaydı vardır, gönderim izi "gonderildi").
  // `iz` başka verilirse kart Logo'da bulunmuş ("zaten-vardi") ya da izsiz (Logo'dan "Al"/"Bağla" ile gelmiş gibi) olur.
  async function logodakiKart(iz: 'gonderildi' | 'zaten-vardi' | null = 'gonderildi'): Promise<{ no: number; kimlik: string; kod: string; ref: number }> {
    const kimlik = `lsl${++sayac}`;
    await tamam('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod: 'HM-LSL-00001', ad: `Pasif deneme ${kimlik}`, birim: 'kg' }, onay: { durum: 'aktif' },
        grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 + sayac } },
      ozet: { benzersiz_anahtar: `hammadde|metal|${kimlik}`, mukerrer_gerekcesi: null },
      surum: null,
    });
    const k = (await vt().tek<{ no: number; kod: string }>('SELECT no, stok_kodu AS kod FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!;
    const ref = 50_000 + sayac;
    kopru.kartlar.set(k.kod, ref);
    await vt().tx(async (db) => {
      await malzemeLogoSonucu(db, k.no, { kayitNo: String(ref) });
      if (iz !== null) {
        await denemeYaz(db, 'malzeme', k.no, { zaman: new Date(simdi), sonuc: iz, hata: null, logoKayitNo: String(ref), niyetZamani: null, sonrakiDeneme: null, basarili: true });
      }
    });
    return { ...k, kimlik, ref };
  }

  before(async () => {
    ortam = await testVeritabaniKur('logopasif');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Logo pasif', kullaniciAdi: 'lsl-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lsl-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await tamam('POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'hammadde', logoDegeri: '10' });
    await tamam('POST', '/logo/birim-setleri/ekle', { kod: '06', ad: null });
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: '06' });
    await baglanti(true);
    ilkPasifAyari = await vt().tx((db) => sistemAyariOku(db, 'logo.malzeme-pasif-gonderimi'));
    await tamam('POST', '/ayarlar/logo.malzeme-pasif-gonderimi/degistir', { deger: true });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  // Gün ilerler; birim seti listesi o saatte okunmuş sayılır ki tur liste okumadan kuyruğa geçsin.
  const gunIlerle = async (): Promise<void> => {
    simdi += 24 * 3600_000;
    await vt().tx((db) => kopruListesiniYaz(db, kopru.birimSetleri.map((b) => ({ kod: b.code, ad: b.name })), new Date(simdi)));
  };
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    await gunIlerle();
  });
  afterEach(async () => { await kopru.kapat(); });

  const deactivate = () => kopru.istekler.filter((i) => i.yontem === 'POST' && i.yol.endsWith('/deactivate'));

  test('bağlantı kapalıyken istenmez; açıkken kart pasif bekler, tur Logo\'da kullanım dışı bırakır, kart Arşiv\'e düşer, Logo alanları kalır', async () => {
    const k = await logodakiKart();
    await baglanti(false);
    try {
      const c = await istek('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`);
      assert.equal(c.statusCode, 422, c.body);
      assert.match(c.json().mesaj as string, /bağlantısı kapalı/);
    } finally {
      await baglanti(true);
    }
    assert.deepEqual(await tamam('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`), { id: k.kimlik, logodaPasifeAliniyor: true });
    assert.deepEqual(await durum(k.no), { onay: 'pasif', gonderim: 'gonderildi', kayitNo: String(k.ref), pasif: 'bekliyor', pasifHata: null, silen: yoneticiId });
    assert.equal((await istek('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`)).statusCode, 422, 'bekleyen istek yinelenmez');
    const logoDurumu = await tamam<LogoDurumuCevabi>('GET', '/malzeme-logo-durumu');
    assert.equal(logoDurumu.kartlar.find((x) => x.id === k.no)?.pasif?.durum, 'bekliyor');

    assert.deepEqual(await tur(), { tur: 'pasif-niyet', no: k.no }, 'önce niyet');
    assert.equal(deactivate().length, 0, 'niyet turunda istek yok');
    assert.ok((await vt().tek<{ n: boolean }>("SELECT niyet_zamani IS NOT NULL AS n FROM logo_giden WHERE belge_turu = 'malzeme' AND belge_no = $1 AND islem = 'pasif'", [k.no]))?.n);
    assert.deepEqual(await tur(), { tur: 'pasif', no: k.no, sonuc: 'gonderildi' });
    assert.deepEqual(deactivate().map((i) => [i.yol, i.govde]), [[`/api/Material/${k.ref}/deactivate`, { code: k.kod }]]);
    assert.equal(kopru.istekler.some((i) => i.yontem === 'DELETE'), false, 'Logo\'dan silme isteği yok');
    assert.deepEqual(kopru.pasifKartlar, [k.kod]);
    assert.equal(kopru.kartlar.get(k.kod), k.ref, 'kart Logo\'da durur');
    assert.deepEqual(await durum(k.no), { onay: 'iptal', gonderim: 'gonderildi', kayitNo: String(k.ref), pasif: 'tamam', pasifHata: null, silen: yoneticiId });
    const giden = await vt().tek<{ son_sonuc: string; logo_kayit_no: string }>(
      "SELECT son_sonuc, logo_kayit_no, niyet_zamani FROM logo_giden WHERE belge_turu = 'malzeme' AND belge_no = $1 AND islem = 'pasif'", [k.no]);
    assert.deepEqual(giden, { son_sonuc: 'gonderildi', logo_kayit_no: String(k.ref), niyet_zamani: null });
    const gonderim = await vt().tek<{ son_sonuc: string }>("SELECT son_sonuc FROM logo_giden WHERE belge_turu = 'malzeme' AND belge_no = $1 AND islem = 'gonder'", [k.no]);
    assert.deepEqual(gonderim, { son_sonuc: 'gonderildi' }, 'gönderim izi ayrı satırdır ve değişmez');
    const arsiv = await tamam<ArsivKartlariCevabi>('GET', '/malzeme-arsivi');
    assert.equal(arsiv.kartlar.find((x) => x.kimlik === k.kimlik)?.logoyaGitti, true, 'Logo\'da duran kart kalıcı silinmez');
    assert.equal((await tamam<LogoDurumuCevabi>('GET', '/malzeme-logo-durumu')).kartlar.some((x) => x.id === k.no), false, 'silinen kart Logo durumunda görünmez');
    await assert.rejects(vt().sorgu('DELETE FROM malzeme_katalog_karti WHERE no = $1', [k.no]), /silinmez/, 'tetik Logo kartını korur');
    const istekSayisi = kopru.istekler.length;
    assert.deepEqual(await tur(), { tur: 'bos' });
    assert.equal(kopru.istekler.length, istekSayisi, 'kuyruk boş, istek yok');
  });

  test('Logo reddederse kart pasif kalır, neden görünür ve yeniden denenmez; kullanıcı yeniden isteyebilir', async () => {
    const k = await logodakiKart();
    kopru.senaryo = 'dogrulama';
    await tamam('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`);
    assert.deepEqual(await tur(), { tur: 'pasif-niyet', no: k.no }, 'önce niyet');
    assert.deepEqual(await tur(), { tur: 'pasif', no: k.no, sonuc: 'reddedildi' });
    const d = await durum(k.no);
    assert.deepEqual({ onay: d.onay, kayitNo: d.kayitNo, pasif: d.pasif }, { onay: 'pasif', kayitNo: String(k.ref), pasif: 'reddedildi' });
    assert.match(d.pasifHata ?? '', /Logo'da pasife alma/);
    assert.equal((await tamam<LogoDurumuCevabi>('GET', '/malzeme-logo-durumu')).kartlar.find((x) => x.id === k.no)?.pasif?.hata, d.pasifHata);
    await gunIlerle();
    assert.deepEqual(await tur(), { tur: 'bos' }, 'ret kalıcı');
    kopru.senaryo = 'basari';
    await tamam('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`);
    assert.deepEqual({ pasif: (await durum(k.no)).pasif, hata: (await durum(k.no)).pasifHata }, { pasif: 'bekliyor', hata: null }, 'yeniden istenince ret metni silinir');
    await gunIlerle();
    assert.deepEqual(await tur(), { tur: 'pasif-niyet', no: k.no }, 'önce niyet');
    assert.deepEqual(await tur(), { tur: 'pasif', no: k.no, sonuc: 'gonderildi' });
    assert.deepEqual({ onay: (await durum(k.no)).onay, pasif: (await durum(k.no)).pasif }, { onay: 'iptal', pasif: 'tamam' });
  });

  test('ulaşılamayan köprü yeniden denenir; Logo\'da bulunamayan kart kalıcı ret olur, kart pasif kalır', async () => {
    const k = await logodakiKart();
    await tamam('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`);
    const kapali = await sahteKopruAc();
    const adres = kapali.adres;
    await kapali.kapat();
    assert.deepEqual(await tur(), { tur: 'pasif-niyet', no: k.no }, 'önce niyet');
    const r = await malzemeTuru(vt(), { ...ortamKur(), kopru: kopruIstemcisiKur({ adres, anahtar: kopru.anahtar }, { sureMs: 5000 }) });
    assert.deepEqual(r, { tur: 'pasif', no: k.no, sonuc: 'ulasilamadi' });
    assert.equal((await durum(k.no)).pasif, 'hata');
    assert.deepEqual(await tur(), { tur: 'bos' }, 'geri çekilme dolmadan denenmez');
    kopru.kartlar.delete(k.kod);
    await gunIlerle();
    assert.deepEqual(await tur(), { tur: 'pasif-niyet', no: k.no }, 'önce niyet');
    assert.deepEqual(await tur(), { tur: 'pasif', no: k.no, sonuc: 'reddedildi' });
    const d = await durum(k.no);
    assert.deepEqual({ onay: d.onay, pasif: d.pasif, kayitNo: d.kayitNo }, { onay: 'pasif', pasif: 'reddedildi', kayitNo: String(k.ref) });
    assert.match(d.pasifHata ?? '', /Card not found/);
  });

  test('3073 a: kendi ayarı kapalıyken TMI\'nin açtığı kart silinmez (ileti ayarı söyler) ve sıradaki istek gitmez, birikir; açılınca gider', async () => {
    const ayar = (deger: boolean) => tamam('POST', '/ayarlar/logo.malzeme-pasif-gonderimi/degistir', { deger });
    assert.equal(ilkPasifAyari, false, 'yeni kurulumda kapalı başlar (3073 a)');
    const k = await logodakiKart();
    const sirada = await logodakiKart();
    assert.deepEqual(await tamam('POST', `/malzeme-katalogu-kartlari/${sirada.kimlik}/iptal`), { id: sirada.kimlik, logodaPasifeAliniyor: true });
    await ayar(false);
    try {
      const c = await istek('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`);
      assert.equal(c.statusCode, 422, c.body);
      assert.match(c.json().mesaj as string, /Logo: silinen kartı Logo'da kullanım dışı bırakma/);
      assert.deepEqual(await durum(k.no), { onay: 'aktif', gonderim: 'gonderildi', kayitNo: String(k.ref), pasif: null, pasifHata: null, silen: yoneticiId });
      assert.deepEqual(await tur(), { tur: 'bos' }, 'kapalıyken sıradaki istek alınmaz');
      assert.equal(deactivate().length, 0);
      assert.equal((await durum(sirada.no)).pasif, 'bekliyor', 'istek birikir');
      // Logo'dan gelen kart ayardan bağımsız yalnız TMI'de silinir.
      const gelen = await logodakiKart(null);
      assert.deepEqual(await tamam('POST', `/malzeme-katalogu-kartlari/${gelen.kimlik}/iptal`), { id: gelen.kimlik, logodaPasifeAliniyor: false });
    } finally {
      await ayar(true);
    }
    assert.deepEqual(await tur(), { tur: 'pasif-niyet', no: sirada.no });
    assert.deepEqual(await tur(), { tur: 'pasif', no: sirada.no, sonuc: 'gonderildi' });
    assert.deepEqual(deactivate().map((i) => i.yol), [`/api/Material/${sirada.ref}/deactivate`]);
  });

  test('3070: TMI\'nin açmadığı Logo kartı (izsiz ya da Logo\'da bulunmuş) silinince yalnız TMI\'de iptal olur; Logo\'ya istek gitmez', async () => {
    for (const iz of [null, 'zaten-vardi'] as const) {
      const k = await logodakiKart(iz);
      assert.deepEqual(await tamam('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`), { id: k.kimlik, logodaPasifeAliniyor: false }, String(iz));
      assert.deepEqual(await durum(k.no), { onay: 'iptal', gonderim: 'gonderildi', kayitNo: String(k.ref), pasif: null, pasifHata: null, silen: yoneticiId });
    }
    assert.deepEqual(await tur(), { tur: 'bos' });
    assert.equal(deactivate().length, 0, 'Logo\'ya pasife alma isteği yok');
    // Aynı kart TMI'nin açtığı kartsa istek yazılır (sınır yalnız gönderim izidir).
    const benim = await logodakiKart('gonderildi');
    assert.deepEqual(await tamam('POST', `/malzeme-katalogu-kartlari/${benim.kimlik}/iptal`), { id: benim.kimlik, logodaPasifeAliniyor: true });
    assert.equal((await durum(benim.no)).pasif, 'bekliyor');
    assert.deepEqual(await tur(), { tur: 'pasif-niyet', no: benim.no });
    assert.deepEqual(await tur(), { tur: 'pasif', no: benim.no, sonuc: 'gonderildi' });
    assert.deepEqual(deactivate().map((i) => i.yol), [`/api/Material/${benim.ref}/deactivate`], 'yalnız TMI\'nin açtığı kart');
  });

  test('3070 v2: ölçütten önce kuyruğa girmiş istek Logo\'dan gelen kartta gönderilmez, kalıcı reddedilir', async () => {
    const k = await logodakiKart('gonderildi');
    assert.deepEqual(await tamam('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`), { id: k.kimlik, logodaPasifeAliniyor: true });
    // Ölçütten önce yazılmış istek: kartın gönderim izi yok (Logo'dan "Al"/"Bağla" ile gelmiş).
    await vt().sorgu('DELETE FROM logo_giden WHERE belge_no = $1 AND islem = \'gonder\'', [k.no]);
    const once = deactivate().length;
    assert.deepEqual(await tur(), { tur: 'pasif', no: k.no, sonuc: 'reddedildi' });
    assert.equal(deactivate().length, once, 'Logo\'ya pasife alma isteği gitmez');
    const d = await durum(k.no);
    assert.equal(d.pasif, 'reddedildi');
    assert.match(d.pasifHata ?? '', /Logo'dan alındı ya da bağlandı/);
    assert.deepEqual(await tur(), { tur: 'bos' }, 'yeniden denenmez');
  });

  test('TMI\'de kullanılan Logo kartı silinmez ve pasife alma isteği yazılmaz', async () => {
    const k = await logodakiKart();
    await vt().sorgu('INSERT INTO satin_alma_tedarik_termini (malzeme_no) VALUES ($1)', [k.no]);
    const c = await istek('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`);
    assert.equal(c.statusCode, 409, c.body);
    assert.deepEqual(await durum(k.no), { onay: 'aktif', gonderim: 'gonderildi', kayitNo: String(k.ref), pasif: null, pasifHata: null, silen: yoneticiId });
    await assert.rejects(vt().sorgu('DELETE FROM malzeme_katalog_karti WHERE no = $1', [k.no]), /silinmez/, 'tetik Logo kartını korur');
  });

  test('gönderim yarışı: istek yoldayken silinen kartın Logo sonucu gelince Logo\'daki kart da pasife alınmak üzere sıraya girer', async () => {
    const kimlik = `lsl${++sayac}`;
    await tamam('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod: 'HM-LSL-00001', ad: `Yarış ${kimlik}`, birim: 'kg' }, onay: { durum: 'aktif' },
        grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 + sayac } },
      ozet: { benzersiz_anahtar: `hammadde|metal|${kimlik}`, mukerrer_gerekcesi: null },
      surum: null,
    });
    const k = (await vt().tek<{ no: number; kod: string }>('SELECT no, stok_kodu AS kod FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!;
    assert.deepEqual(await tamam('POST', `/malzeme-katalogu-kartlari/${kimlik}/iptal`), { id: kimlik, logodaPasifeAliniyor: false });
    kopru.kartlar.set(k.kod, 60_001);
    await vt().tx(async (db) => {
      await malzemeLogoSonucu(db, k.no, { kayitNo: '60001' });
      await denemeYaz(db, 'malzeme', k.no, { zaman: new Date(simdi), sonuc: 'gonderildi', hata: null, logoKayitNo: '60001', niyetZamani: null, sonrakiDeneme: null, basarili: true });
    });
    assert.deepEqual(await durum(k.no), { onay: 'iptal', gonderim: 'gonderildi', kayitNo: '60001', pasif: 'bekliyor', pasifHata: null, silen: yoneticiId });
    assert.deepEqual(await tur(), { tur: 'pasif-niyet', no: k.no }, 'önce niyet');
    assert.deepEqual(await tur(), { tur: 'pasif', no: k.no, sonuc: 'gonderildi' });
    assert.deepEqual(await durum(k.no), { onay: 'iptal', gonderim: 'gonderildi', kayitNo: '60001', pasif: 'tamam', pasifHata: null, silen: yoneticiId });
  });

  test('Arşiv\'den geri getirilen kart pasif döner; yeniden silinince Logo\'da zaten kullanım dışı olduğu için hemen onaylanır', async () => {
    const k = await logodakiKart();
    await tamam('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`);
    await tur();
    assert.deepEqual(await tur(), { tur: 'pasif', no: k.no, sonuc: 'gonderildi' });
    await tamam('POST', `/malzeme-arsivi/${k.kimlik}/geri-getir`);
    assert.deepEqual({ onay: (await durum(k.no)).onay, pasif: (await durum(k.no)).pasif }, { onay: 'pasif', pasif: 'tamam' });
    assert.equal((await tamam<LogoDurumuCevabi>('GET', '/malzeme-logo-durumu')).kartlar.find((x) => x.id === k.no)?.pasif?.durum, 'tamam');
    assert.deepEqual(await tamam('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`), { id: k.kimlik, logodaPasifeAliniyor: true });
    await gunIlerle();
    assert.deepEqual(await tur(), { tur: 'pasif-niyet', no: k.no });
    assert.deepEqual(await tur(), { tur: 'pasif', no: k.no, sonuc: 'gonderildi' });
    assert.equal(deactivate().length, 2, 'ikinci istek de gider; yardımcı zaten kullanım dışı kartta yazmaz');
    assert.deepEqual(kopru.pasifKartlar, [k.kod]);
    assert.equal((await durum(k.no)).onay, 'iptal');
  });
});
