import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi, LogoDurumuCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { logoyaGuncellemeGidecekMalzemeler, malzemeLogoGuncellemeSonucu, malzemeLogoSonucu } from './disari.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

interface GuncellemeSatiri { durum: string | null; hata: string | null; zaman: boolean }

describe('Logo kartının ad güncellemesi (kart #783, S4 b, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: yonetici }, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, govde)) as object }) });
  async function tamam<T>(yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await istek(yontem, url, govde);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function hataKodu(is: (db: Db) => Promise<unknown>): Promise<string> {
    try {
      await vt().tx(is);
    } catch (h) {
      if (h instanceof UygulamaHatasi) return h.kod;
      throw h;
    }
    return 'HATA_YOK';
  }

  // Onay akışı kapalı: kart doğrudan aktif açılır.
  let sayac = 0;
  const govde = (kimlik: string, ad: string, surum: number | null) => ({
    kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod: 'HM-LGO-00001', ad, birim: 'kg' }, onay: { durum: 'aktif' } },
    ozet: { benzersiz_anahtar: `hammadde|metal|${kimlik}`, mukerrer_gerekcesi: null },
    surum,
  });
  const adYaz = async (k: { kimlik: string; surum: number }, ad: string): Promise<void> => {
    k.surum = (await tamam<KatalogKartiKaydetCevabi>('POST', `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`, govde(k.kimlik, ad, k.surum))).surum;
  };
  async function kartAc(kayitNo: string | null): Promise<{ kimlik: string; no: number; surum: number }> {
    const kimlik = `lag${++sayac}`;
    const r = await tamam<KatalogKartiKaydetCevabi>('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde(kimlik, `Deneme ${kimlik}`, null));
    const no = (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
    if (kayitNo !== null) await vt().tx((db) => malzemeLogoSonucu(db, no, { kayitNo }));
    return { kimlik, no, surum: r.surum };
  }
  const guncelleme = (kimlik: string): Promise<GuncellemeSatiri | null> => vt().tek<GuncellemeSatiri>(
    `SELECT logo_guncelleme_durumu AS durum, logo_guncelleme_hata AS hata, logo_guncelleme_zamani IS NOT NULL AS zaman
       FROM malzeme_katalog_karti WHERE kimlik = $1`, [kimlik]);
  const kuyruk = () => vt().tx((db) => logoyaGuncellemeGidecekMalzemeler(db, 500));

  before(async () => {
    ortam = await testVeritabaniKur('malzemelogoad');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Logo ad', kullaniciAdi: 'lag-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lag-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await tamam('POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'hammadde', logoDegeri: '10' });
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: 'KG' });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('Logo kaydı olan kartın adı değişince aynı yazımda "bekliyor" olur; aynı ad, boşluk farkı ve Logo kaydı olmayan kart güncelleme açmaz', async () => {
    const k = await kartAc('LG-AD-1');
    assert.deepEqual(await guncelleme(k.kimlik), { durum: null, hata: null, zaman: false });
    await adYaz(k, `Deneme ${k.kimlik}`);
    await adYaz(k, `  Deneme ${k.kimlik}  `);
    assert.deepEqual(await guncelleme(k.kimlik), { durum: null, hata: null, zaman: false }, 'ad aynı kaldı');
    await adYaz(k, 'Deneme yeni ad');
    assert.deepEqual(await guncelleme(k.kimlik), { durum: 'bekliyor', hata: null, zaman: true });
    const kayitsiz = await kartAc(null);
    await adYaz(kayitsiz, 'Deneme başka ad');
    assert.deepEqual(await guncelleme(kayitsiz.kimlik), { durum: null, hata: null, zaman: false }, 'ilk gönderim zaten güncel adı götürür');
    assert.equal((await kuyruk()).some((x) => x.no === kayitsiz.no), false);
  });

  test('kuyruk en eski güncellemeden başlar, sınırı uygular; sonuç "gonderildi" ya da "hata" yazar, gönderilen kuyruktan çıkar', async () => {
    const a = await kartAc('LG-AD-2');
    const b = await kartAc('LG-AD-3');
    await adYaz(b, 'Deneme b yeni');
    await adYaz(a, 'Deneme a yeni');
    const sira = (await kuyruk()).filter((x) => x.no === a.no || x.no === b.no);
    assert.deepEqual(sira.map((x) => x.no), [b.no, a.no]);
    assert.deepEqual(sira[1], { no: a.no, stokKodu: sira[1]!.stokKodu, ad: 'Deneme a yeni', logoKayitNo: 'LG-AD-2', durum: 'bekliyor', tur: 'hammadde', hizmetYonu: null });
    assert.equal((await vt().tx((db) => logoyaGuncellemeGidecekMalzemeler(db, 1))).length, 1);
    await assert.rejects(vt().tx((db) => logoyaGuncellemeGidecekMalzemeler(db, 0)));

    await vt().tx((db) => malzemeLogoGuncellemeSonucu(db, b.no, { ad: 'Deneme b yeni', hata: '  Logo kapalı  ' }));
    assert.deepEqual(await guncelleme(b.kimlik), { durum: 'hata', hata: 'Logo kapalı', zaman: true });
    assert.equal((await kuyruk()).find((x) => x.no === b.no)?.durum, 'hata', 'hatalı güncelleme yeniden denenir');
    await vt().tx((db) => malzemeLogoGuncellemeSonucu(db, b.no, { ad: 'Deneme b yeni', tamam: true }));
    assert.deepEqual(await guncelleme(b.kimlik), { durum: 'gonderildi', hata: null, zaman: true });
    assert.equal((await kuyruk()).some((x) => x.no === b.no), false);
    assert.equal(await hataKodu((db) => malzemeLogoGuncellemeSonucu(db, b.no, { ad: 'Deneme b yeni', tamam: true })), 'GECERSIZ', 'kuyrukta olmayan kart');
    await adYaz(b, 'Deneme b üçüncü');
    assert.equal((await guncelleme(b.kimlik))?.durum, 'bekliyor', 'gönderilmiş güncelleme yeni ad değişiminde yeniden açılır');

    const durum = await tamam<LogoDurumuCevabi>('GET', '/malzeme-logo-durumu');
    assert.deepEqual(durum.kartlar.find((x) => x.id === a.no)?.guncelleme?.durum, 'bekliyor');
    assert.equal(durum.kartlar.find((x) => x.id === b.no)?.guncelleme?.hata, null);
  });

  test('ad gönderim sırasında yine değiştiyse sonuç yazılmaz, güncelleme bekliyor kalır; boş hata ve olmayan kart reddedilir', async () => {
    const k = await kartAc('LG-AD-4');
    await adYaz(k, 'Deneme ilk değişim');
    const gonderilen = (await kuyruk()).find((x) => x.no === k.no)!.ad;
    await adYaz(k, 'Deneme ikinci değişim');
    await vt().tx((db) => malzemeLogoGuncellemeSonucu(db, k.no, { ad: gonderilen, tamam: true }));
    assert.equal((await guncelleme(k.kimlik))?.durum, 'bekliyor');
    assert.equal((await kuyruk()).find((x) => x.no === k.no)?.ad, 'Deneme ikinci değişim');
    assert.equal(await hataKodu((db) => malzemeLogoGuncellemeSonucu(db, k.no, { ad: 'Deneme ikinci değişim', hata: '   ' })), 'DOGRULAMA');
    assert.equal((await guncelleme(k.kimlik))?.durum, 'bekliyor');
    assert.equal(await hataKodu((db) => malzemeLogoGuncellemeSonucu(db, 999_999, { ad: null, tamam: true })), 'BULUNAMADI');
  });

  test('kısıt: Logo kaydı olmayan kartta güncelleme durumu, zamansız durum ve hatasız "hata" yazılamaz', async () => {
    const kayitsiz = await kartAc(null);
    const kayitli = await kartAc('LG-AD-5');
    const ret = (kimlik: string, set: string) => assert.rejects(
      vt().sorgu(`UPDATE malzeme_katalog_karti SET ${set} WHERE kimlik = $1`, [kimlik]),
      (h: { constraint?: string }) => h.constraint === 'malzeme_katalog_karti_logo_guncelleme_butun',
    );
    await ret(kayitsiz.kimlik, `logo_guncelleme_durumu = 'bekliyor', logo_guncelleme_zamani = now()`);
    await ret(kayitli.kimlik, `logo_guncelleme_durumu = 'bekliyor'`);
    await ret(kayitli.kimlik, `logo_guncelleme_durumu = 'hata', logo_guncelleme_zamani = now()`);
    await ret(kayitli.kimlik, `logo_guncelleme_durumu = 'gonderildi', logo_guncelleme_zamani = now(), logo_guncelleme_hata = 'x'`);
    await assert.rejects(
      vt().sorgu(`UPDATE malzeme_katalog_karti SET logo_guncelleme_durumu = 'hata', logo_guncelleme_zamani = now(), logo_guncelleme_hata = '  ' WHERE kimlik = $1`, [kayitli.kimlik]),
      (h: { constraint?: string }) => h.constraint === 'malzeme_katalog_karti_logo_guncelleme_hata_dolu',
    );
    await vt().sorgu(`UPDATE malzeme_katalog_karti SET logo_guncelleme_durumu = 'hata', logo_guncelleme_zamani = now(), logo_guncelleme_hata = 'x' WHERE kimlik = $1`, [kayitli.kimlik]);
    assert.deepEqual(await guncelleme(kayitli.kimlik), { durum: 'hata', hata: 'x', zaman: true });
  });
});
