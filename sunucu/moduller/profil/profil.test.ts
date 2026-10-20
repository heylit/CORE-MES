import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { geriBildirimListeCevabi, profilCevabi } from '#paylasilan/sozlesme/profil.ts';
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
});
