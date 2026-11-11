import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { geriBildirimListeCevabi, menuTercihiCevabi, miniPanoCevabi, profilCevabi, temaCevabi } from '#paylasilan/sozlesme/profil.ts';
import type { ProfilCevabi } from '#paylasilan/sozlesme/profil.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('profil ve şikayet/istek/öneri kutusu (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek<T = unknown>(ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown, kimlik: string | null = randomUUID()): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = ad === null ? {} : { cookie: cerezler.get(ad) ?? '' };
    if (yontem === 'POST' && kimlik !== null) basliklar[ISTEK_KIMLIGI_BASLIGI] = kimlik;
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
    kisiler.set(kullaniciAdi, id);
    await giris(kullaniciAdi);
  }

  const gonder = (ad: string, govde: unknown, kimlik?: string | null) => istek<Record<string, unknown>>(ad, 'POST', '/profil/geri-bildirim-gonder', govde, kimlik);
  const profil = async (ad: string): Promise<ProfilCevabi> => {
    const c = await istek<unknown>(ad, 'GET', '/profil');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return profilCevabi.parse(c.govde);
  };

  before(async () => {
    ortam = await testVeritabaniKur('profil');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    await kisiEkle('operator', 'operator');
    await kisiEkle('cam', 'cam');
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('profil oturum ister; İK kaydı olmayan kişide İK alanları null, sıfır uydurulmaz', async () => {
    assert.equal((await istek(null, 'GET', '/profil')).durum, 401);
    const p = await profil('cam');
    assert.equal(p.kisi.id, kisiler.get('cam'));
    assert.equal(p.kisi.ad, 'Deneme cam');
    assert.equal(p.personel, null);
    assert.equal(p.izin, null);
    assert.equal(p.izinler, null);
    assert.equal(p.fazlaMesai, null);
    assert.deepEqual(p.geriBildirimler, []);
    assert.equal(p.geriBildirimOkur, false);
  });

  test('PRF: gönderilen kayıt yazanın profilinde görünür; kişi ve zaman sunucudan, başkasının profilinde görünmez', async () => {
    const c = await gonder('operator', { konu: 'uygulama', tur: 'oneri', metin: '  Terminalde yazı biraz daha büyük olsun.  ' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde['metin'], 'Terminalde yazı biraz daha büyük olsun.');
    assert.equal(c.govde['konu'], 'uygulama');
    assert.equal(typeof c.govde['gonderildi'], 'string');
    const satir = await o().sahip.tek<{ kisi_id: number }>('SELECT kisi_id FROM profil_geri_bildirim WHERE id = $1', [c.govde['id']]);
    assert.equal(satir?.kisi_id, kisiler.get('operator'));

    const p = await profil('operator');
    assert.deepEqual(p.geriBildirimler.map((g) => g.id), [c.govde['id']]);
    assert.equal((await profil('cam')).geriBildirimler.some((g) => g.id === c.govde['id']), false);
  });

  test('gövde başka kişiyi seçemez; geçersiz konu, tür ve kısa metin reddedilir', async () => {
    assert.equal((await gonder('cam', { konu: 'sirket', tur: 'istek', metin: 'Yemekhane saatleri', kisiId: kisiler.get('operator') })).durum, 400);
    assert.equal((await gonder('cam', { konu: 'diger', tur: 'istek', metin: 'Yemekhane saatleri' })).durum, 400);
    assert.equal((await gonder('cam', { konu: 'sirket', tur: 'tebrik', metin: 'Yemekhane saatleri' })).durum, 400);
    assert.equal((await gonder('cam', { konu: 'sirket', tur: 'istek', metin: '  ab ' })).durum, 400);
    assert.equal((await gonder('cam', { konu: 'sirket', tur: 'istek', metin: 'x'.repeat(2001) })).durum, 400);
    assert.equal((await gonder('cam', { konu: 'sirket', tur: 'sikayet', metin: 'x'.repeat(2000) })).durum, 200);
  });

  test('oturumsuz gönderilemez; aynı istek kimliğiyle yinelenen gönderim ikinci kayıt açmaz', async () => {
    assert.equal((await istek(null, 'POST', '/profil/geri-bildirim-gonder', { konu: 'sirket', tur: 'oneri', metin: 'Oturumsuz deneme' })).durum, 401);
    const once = (await profil('cam')).geriBildirimler.length;
    const kimlik = randomUUID();
    const ilk = await gonder('cam', { konu: 'sirket', tur: 'oneri', metin: 'Servis saatleri vardiyaya uysun.' }, kimlik);
    const ikinci = await gonder('cam', { konu: 'sirket', tur: 'oneri', metin: 'Servis saatleri vardiyaya uysun.' }, kimlik);
    assert.equal(ilk.durum, 200);
    assert.equal(ikinci.durum, 200);
    assert.equal(ikinci.govde['id'], ilk.govde['id']);
    assert.equal((await profil('cam')).geriBildirimler.length, once + 1);
  });

  test('gönderilen kayıt değişmez ve silinmez (yalnız ekleme)', async () => {
    const c = await gonder('operator', { konu: 'sirket', tur: 'istek', metin: 'Değişmeyecek kayıt.' });
    await assert.rejects(o().sahip.sorgu("UPDATE profil_geri_bildirim SET metin = 'başka' WHERE id = $1", [c.govde['id']]), /yalnız ekleme/);
    await assert.rejects(o().sahip.sorgu('DELETE FROM profil_geri_bildirim WHERE id = $1', [c.govde['id']]), /yalnız ekleme/);
  });

  test('başkalarının yazdıklarını yalnız profil.geri-bildirim-oku okur; liste yazanın adını ve süzgeci verir', async () => {
    assert.equal((await istek('operator', 'GET', '/profil/geri-bildirimler')).durum, 403);
    assert.equal((await istek('cam', 'GET', '/profil/geri-bildirimler')).durum, 403);
    const c = await istek<unknown>('yonetici', 'GET', '/profil/geri-bildirimler?tur=oneri&konu=uygulama');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const liste = geriBildirimListeCevabi.parse(c.govde);
    assert.ok(liste.satirlar.length >= 1);
    assert.ok(liste.satirlar.every((s) => s.tur === 'oneri' && s.konu === 'uygulama'));
    assert.ok(liste.satirlar.some((s) => s.kisiAdi === 'Deneme operator'));
    assert.equal((await profil('yonetici')).geriBildirimOkur, true);
  });

  test('İK kartına bağlı kişi kendi kartını, iznini ve fazla mesaisini görür; ücret ve kimlik alanı dönmez', async () => {
    const operatorId = kisiler.get('operator')!;
    const im = await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('PRF1', 'Merkez') RETURNING id");
    // Kayıtlar İK'nın kendi ucundan girer (yönetici bütün İK işlemlerine sahiptir).
    const ik = async (alan: string, govde: Record<string, unknown>) => {
      const c = await istek('yonetici', 'POST', `/ik/${alan}/${String(govde['id'])}/kaydet`, { govde, surum: null });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    };
    await ik('departmanlar', { id: 'dept_uretim', kind: 'dept', ad: 'Üretim' });
    await ik('personel', { id: 'emp_sef', kind: 'emp', ad: 'Deneme', soyad: 'Şef', isMerkeziId: im!.id });
    await ik('personel', {
      id: 'emp_op', kind: 'emp', ad: 'Deneme', soyad: 'Operatör', isMerkeziId: im!.id, kisiId: operatorId, pozisyon: 'CNC operatörü',
      departmanId: 'dept_uretim', yoneticiId: 'emp_sef', iseGiris: '2024-03-01', telefon: '0500 000 00 01', tckn: '10000000146', brutMaas: 50000,
    });
    const c = await istek<Record<string, unknown>>('operator', 'GET', '/profil');
    assert.equal(c.durum, 200);
    const personel = c.govde['personel'] as Record<string, unknown>;
    assert.equal(personel['ad'], 'Deneme Operatör');
    assert.equal(personel['pozisyon'], 'CNC operatörü');
    assert.equal(personel['departman'], 'Üretim');
    assert.equal(personel['yonetici'], 'Deneme Şef');
    assert.equal(personel['iseGiris'], '2024-03-01');
    assert.equal(personel['telefon'], '0500 000 00 01');
    assert.equal(personel['adres'], null);
    for (const gizli of ['tckn', 'brutMaas', 'iban', 'banka']) assert.equal(gizli in personel, false, gizli);
    const p = profilCevabi.parse(c.govde);
    assert.notEqual(p.izin, null);
    assert.deepEqual(p.izinler, []);
    assert.deepEqual(p.fazlaMesai?.satirlar, []);
    assert.equal(p.fazlaMesai?.toplamSaat, null);
    // Başka kişinin profili İK kartını almaz.
    assert.equal((await profil('cam')).personel, null);
  });

  const temaSec = (ad: string | null, govde: unknown) => istek<Record<string, unknown>>(ad, 'POST', '/profil/tema-sec', govde);
  const tema = async (ad: string) => {
    const c = await istek<unknown>(ad, 'GET', '/profil/tema');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return temaCevabi.parse(c.govde);
  };

  test('PRF-5: tema oturum ister; kaydı olmayan kişide null ve sürüm 0, tema uydurulmaz', async () => {
    assert.equal((await istek(null, 'GET', '/profil/tema')).durum, 401);
    assert.equal((await temaSec(null, { tema: 'gun', surum: 0 })).durum, 401);
    assert.deepEqual(await tema('operator'), { tema: null, surum: 0 });
  });

  test('PRF-5: tema seçimi sürümle yazılır; eski sürüm ve ikinci ilk seçim reddedilir, kişiler birbirini etkilemez', async () => {
    const ilk = await temaSec('cam', { tema: 'kontrast', surum: 0 });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.deepEqual(ilk.govde, { tema: 'kontrast', surum: 1 });
    assert.equal((await temaSec('cam', { tema: 'gun', surum: 0 })).durum, 409);
    assert.deepEqual((await temaSec('cam', { tema: 'gun', surum: 1 })).govde, { tema: 'gun', surum: 2 });
    assert.equal((await temaSec('cam', { tema: 'dark', surum: 1 })).durum, 409);
    assert.deepEqual(await tema('cam'), { tema: 'gun', surum: 2 });
    assert.deepEqual(await tema('yonetici'), { tema: null, surum: 0 });
  });

  test('PRF-5: tema gövdesi başka kişiyi seçemez; geçersiz tema ve sürüm reddedilir', async () => {
    assert.equal((await temaSec('operator', { tema: 'dark', surum: 0, kisiId: kisiler.get('cam') })).durum, 400);
    assert.equal((await temaSec('operator', { tema: 'cam', surum: 0 })).durum, 400);
    assert.equal((await temaSec('operator', { tema: 'dark', surum: -1 })).durum, 400);
    assert.equal((await temaSec('operator', { tema: 'dark' })).durum, 400);
    assert.deepEqual(await tema('operator'), { tema: null, surum: 0 });
    await assert.rejects(o().sahip.sorgu("INSERT INTO profil_tema_tercihi (kisi_id, tema) VALUES ($1, 'mor')", [kisiler.get('operator')]), /profil_tema_tercihi_tema_gecerli/);
  });

  const miniPanoSec = (ad: string | null, govde: unknown) => istek<Record<string, unknown>>(ad, 'POST', '/profil/mini-pano-sec', govde);
  const miniPano = async (ad: string) => {
    const c = await istek<unknown>(ad, 'GET', '/profil/mini-pano');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return miniPanoCevabi.parse(c.govde);
  };

  test('PRF-6: mini pano seçimi oturum ister; kaydı olmayan kişide hepsi açık, öneri kapalı, sürüm 0', async () => {
    assert.equal((await istek(null, 'GET', '/profil/mini-pano')).durum, 401);
    assert.equal((await miniPanoSec(null, { kapali: [], acilistaOner: true, surum: 0 })).durum, 401);
    assert.deepEqual(await miniPano('operator'), { kapali: [], acilistaOner: false, surum: 0 });
  });

  test('PRF-6: mini pano seçimi sürümle yazılır; eski sürüm ve ikinci ilk seçim reddedilir, kişiler birbirini etkilemez', async () => {
    const ilk = await miniPanoSec('cam', { kapali: ['uretim', 'satin-alma'], acilistaOner: true, surum: 0 });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.deepEqual(ilk.govde, { kapali: ['satin-alma', 'uretim'], acilistaOner: true, surum: 1 });
    assert.equal((await miniPanoSec('cam', { kapali: [], acilistaOner: false, surum: 0 })).durum, 409);
    assert.deepEqual((await miniPanoSec('cam', { kapali: [], acilistaOner: false, surum: 1 })).govde, { kapali: [], acilistaOner: false, surum: 2 });
    assert.equal((await miniPanoSec('cam', { kapali: ['uretim'], acilistaOner: false, surum: 1 })).durum, 409);
    assert.deepEqual(await miniPano('cam'), { kapali: [], acilistaOner: false, surum: 2 });
    assert.deepEqual(await miniPano('yonetici'), { kapali: [], acilistaOner: false, surum: 0 });
  });

  test('PRF-6: mini pano gövdesi başka kişiyi seçemez; biçimsiz, yinelenen ve sınırı aşan anahtar reddedilir', async () => {
    const yanlis = async (govde: unknown) => assert.equal((await miniPanoSec('operator', govde)).durum, 400, JSON.stringify(govde));
    await yanlis({ kapali: [], acilistaOner: false, surum: 0, kisiId: kisiler.get('cam') });
    await yanlis({ kapali: ['Satin_Alma'], acilistaOner: false, surum: 0 });
    await yanlis({ kapali: ['a', 'a'], acilistaOner: false, surum: 0 });
    await yanlis({ kapali: Array.from({ length: 51 }, (_, i) => `p${String(i)}`), acilistaOner: false, surum: 0 });
    await yanlis({ kapali: [], acilistaOner: false, surum: -1 });
    await yanlis({ kapali: [], surum: 0 });
    assert.deepEqual(await miniPano('operator'), { kapali: [], acilistaOner: false, surum: 0 });
    await assert.rejects(
      o().sahip.sorgu('INSERT INTO profil_mini_pano_tercihi (kisi_id, kapali) VALUES ($1, $2)', [kisiler.get('operator'), Array.from({ length: 51 }, (_, i) => `p${String(i)}`)]),
      /profil_mini_pano_tercihi_kapali_sinir/,
    );
  });

  const menuSec = (ad: string | null, govde: unknown) => istek<Record<string, unknown>>(ad, 'POST', '/profil/menu-sec', govde);
  const menu = async (ad: string) => {
    const c = await istek<unknown>(ad, 'GET', '/profil/menu');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return menuTercihiCevabi.parse(c.govde);
  };

  test('PRF-7: sık kullanılanlar oturum ister; kaydı olmayan kişide liste boş, sürüm 0', async () => {
    assert.equal((await istek(null, 'GET', '/profil/menu')).durum, 401);
    assert.equal((await menuSec(null, { sayfalar: ['/cizimler'], surum: 0 })).durum, 401);
    assert.deepEqual(await menu('operator'), { sayfalar: [], surum: 0 });
  });

  test('PRF-7: sık kullanılanlar seçilen sırayla, sürümle yazılır; eski sürüm ve ikinci ilk seçim reddedilir, kişiler birbirini etkilemez', async () => {
    const ilk = await menuSec('cam', { sayfalar: ['/cizimler', '/malzemeler'], surum: 0 });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.deepEqual(ilk.govde, { sayfalar: ['/cizimler', '/malzemeler'], surum: 1 });
    assert.equal((await menuSec('cam', { sayfalar: [], surum: 0 })).durum, 409);
    assert.deepEqual((await menuSec('cam', { sayfalar: ['/malzemeler', '/cizimler'], surum: 1 })).govde, { sayfalar: ['/malzemeler', '/cizimler'], surum: 2 });
    assert.equal((await menuSec('cam', { sayfalar: [], surum: 1 })).durum, 409);
    assert.deepEqual(await menu('cam'), { sayfalar: ['/malzemeler', '/cizimler'], surum: 2 });
    assert.deepEqual(await menu('yonetici'), { sayfalar: [], surum: 0 });
  });

  test('PRF-9: liste kişinin açabildiği sayfalara süzülür; açamadığı sayfa kaydedilmez, yetkisi kalkan sayfa okurken dönmez', async () => {
    const once = await menu('cam');
    const c = await menuSec('cam', { sayfalar: ['/finans', '/recete-rota'], surum: once.surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(c.govde, { sayfalar: ['/recete-rota'], surum: once.surum + 1 });
    const satir = await o().sahip.tek<{ sayfalar: string[] }>('SELECT sayfalar FROM profil_menu_tercihi WHERE kisi_id = $1', [kisiler.get('cam')]);
    assert.deepEqual(satir?.sayfalar, ['/recete-rota']);
    await o().sahip.sorgu("UPDATE profil_menu_tercihi SET sayfalar = '{/finans,/recete-rota}' WHERE kisi_id = $1", [kisiler.get('cam')]);
    assert.deepEqual((await menu('cam')).sayfalar, ['/recete-rota']);
  });

  test('PRF-8: menü gövdesi başka kişiyi seçemez; bilinmeyen, biçimsiz, yinelenen ve sınırı aşan sayfa reddedilir', async () => {
    const yanlis = async (govde: unknown) => assert.equal((await menuSec('operator', govde)).durum, 400, JSON.stringify(govde));
    await yanlis({ sayfalar: [], surum: 0, kisiId: kisiler.get('cam') });
    await yanlis({ sayfalar: ['/olmayan-sayfa'], surum: 0 });
    await yanlis({ sayfalar: ['stok'], surum: 0 });
    await yanlis({ sayfalar: ['/stok', '/stok'], surum: 0 });
    await yanlis({ sayfalar: Array.from({ length: 11 }, (_, i) => `/s${String(i)}`), surum: 0 });
    await yanlis({ sayfalar: [], surum: -1 });
    await yanlis({ sayfalar: [] });
    assert.deepEqual(await menu('operator'), { sayfalar: [], surum: 0 });
    await assert.rejects(
      o().sahip.sorgu('INSERT INTO profil_menu_tercihi (kisi_id, sayfalar) VALUES ($1, $2)', [kisiler.get('operator'), Array.from({ length: 11 }, (_, i) => `/s${String(i)}`)]),
      /profil_menu_tercihi_sayfalar_sinir/,
    );
  });
});
