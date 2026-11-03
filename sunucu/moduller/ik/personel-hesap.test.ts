import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { IkGirisKartlariCevabi, IkHesapRolleriCevabi, IkIseAlCevabi, IkIstasyonUyumsuzluklariCevabi } from '#paylasilan/sozlesme/ik.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { personelKartSahibi } from '../nizamiye/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ilkAtamaGunu, ilkIstasyonHatasi } from './kurallar.ts';

// 1925 a: İK yeni personeli tek adımda işe alır (kart, kişi, PIN'li hesap, giriş kartı); rol yetki dağıtmayan rollerden. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('1928 a ilk istasyon kuralları (saf)', () => {
  test('istasyon yoksa ya da başka iş merkezindeyse hata; aynı iş merkezinde kabul', () => {
    assert.match(ilkIstasyonHatasi(undefined, 1) ?? '', /bulunamadı/);
    assert.match(ilkIstasyonHatasi({ isMerkeziId: 2 }, 1) ?? '', /iş merkezinde/);
    assert.match(ilkIstasyonHatasi({ isMerkeziId: 2 }, null) ?? '', /iş merkezinde/);
    assert.equal(ilkIstasyonHatasi({ isMerkeziId: 1 }, 1), null);
  });
  test('atama ileri işe giriş gününde başlar; bugün ya da geçmişte ise bugün (boş)', () => {
    assert.equal(ilkAtamaGunu('2026-12-01', '2026-11-03'), '2026-12-01');
    assert.equal(ilkAtamaGunu('2026-11-03', '2026-11-03'), undefined);
    assert.equal(ilkAtamaGunu('2020-01-06', '2026-11-03'), undefined);
    assert.equal(ilkAtamaGunu(undefined, '2026-11-03'), undefined);
  });
});

describe('İK işe alma: personel, hesap ve kart tek adımda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let ikci = '';
  let personelci = '';
  let im1 = 0;
  let im2 = 0;
  let isciRolu = 0;
  let rolYoneten = 0;
  let yoneticiRolu = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const oku = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  const yaz = (cerez: string, url: string, payload: object) => app.inject({ method: 'POST', url: `/api${url}`, payload, headers: { cookie: cerez } });
  const rolAc = async (kod: string, islemler: string[]): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol!.id, islem]);
    return rol!.id;
  };

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const rolId = await rolAc(`test_${kullaniciAdi}`, islemler);
    const id = await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, kisi, rolId);
      for (const r of k.roller) if (r.id !== rolId) await rolAl(db, yoneticiId, kisi, r.id);
      return kisi;
    });
    await vt().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [id, im1]);
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    return { cerez: String(cevap.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  const personel = (kimlik: string, ek: Record<string, unknown> = {}) =>
    ({ id: kimlik, kind: 'emp', ad: 'Yeni', soyad: 'Deneme', pozisyon: 'Ayarcı', iseGiris: '2026-11-03', isMerkeziId: im1, ...ek });
  const iseAl = (cerez: string, kimlik: string, ek: Record<string, unknown> = {}, govdeEki: Record<string, unknown> = {}) =>
    yaz(cerez, `/ik/personel/${kimlik}/ise-al`, { govde: personel(kimlik, govdeEki), rolId: isciRolu, ...ek });
  const sayilar = async () => (await ortam!.sahip.tek<{ kisi: number; personel: number }>(
    'SELECT (SELECT count(*)::int FROM kisi) AS kisi, (SELECT count(*)::int FROM ik_personel) AS personel',
  ))!;
  const hesap = (kisiId: number) => ortam!.sahip.tek<{ kullanici_adi: string; pin_var: boolean; pin_belirlenecek: boolean; roller: number[] }>(
    `SELECT kullanici_adi, pin_ozeti IS NOT NULL AS pin_var, pin_belirlenecek,
            (SELECT array_agg(rol_id ORDER BY rol_id) FROM kisi_rolu WHERE kisi_id = k.id) AS roller
       FROM kisi k WHERE id = $1`, [kisiId]);

  before(async () => {
    ortam = await testVeritabaniKur('ik_ise_alma');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    [im1, im2] = (await vt().sorgu<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IAM1', 'Merkez 1'), ('IAM2', 'Merkez 2') RETURNING id"))
      .map((m) => m.id) as [number, number];
    isciRolu = await rolAc('test_isci', ['sayfa.ik-islemlerim', 'ik.izin-talep']);
    rolYoneten = await rolAc('test_rol_yoneten', ['kisiler.oku', 'kisiler.rol-yonet']);
    yoneticiRolu = (await vt().tek<{ id: number }>("SELECT id FROM rol WHERE yonetici ORDER BY id LIMIT 1"))!.id;
    ikci = (await islemliKisi('ikci', ['sayfa.ik', 'ik.oku', 'ik.personel-yaz', 'ik.hesap-ac'])).cerez;
    personelci = (await islemliKisi('personelci', ['sayfa.ik', 'ik.oku', 'ik.personel-yaz'])).cerez;
  });

  after(async () => { await ortam?.kaldir(); });

  test('izinli: kart, kişi, PIN\'li hesap ve giriş kartı tek istekte; PIN geçici, kart ve PIN denetim kaydında görünmez', async () => {
    const cevap = await iseAl(ikci, 'emp_ia_1', { kartNo: '0007123456' });
    assert.equal(cevap.statusCode, 200, cevap.body);
    const c = cevap.json<IkIseAlCevabi>();
    assert.ok(c.hesap !== null);
    assert.equal(c.hesap.kullaniciAdi, 'yeni.deneme');
    assert.match(c.hesap.pin, /^[0-9]{6}$/);
    assert.equal(c.kayit.govde['kisiId'], c.hesap.kisiId);
    assert.equal(c.kart?.kartSon4, '3456');
    assert.deepEqual(await hesap(c.hesap.kisiId), { kullanici_adi: 'yeni.deneme', pin_var: true, pin_belirlenecek: true, roller: [isciRolu] });
    assert.equal(await vt().tx((db) => personelKartSahibi(db, '0007123456')), c.hesap.kisiId);
    const denetim = JSON.stringify(await ortam!.sahip.sorgu("SELECT govde FROM denetim_kaydi WHERE yol LIKE '/ik/personel/%/ise-al'"));
    assert.doesNotMatch(denetim, /7123456/);
    assert.doesNotMatch(denetim, new RegExp(c.hesap.pin));
  });

  test('aynı adlı ikinci personelin kullanıcı adı sayıyla ayrılır; kartsız işe alma kart vermez', async () => {
    const c = (await iseAl(ikci, 'emp_ia_2')).json<IkIseAlCevabi>();
    assert.equal(c.hesap?.kullaniciAdi, 'yeni.deneme2');
    assert.equal(c.kart, null);
  });

  test('reddedilen: hesap açma işlemi olmayan İK kullanıcısı 403 alır, hiçbir şey yazılmaz', async () => {
    const once = await sayilar();
    assert.equal((await iseAl(personelci, 'emp_ia_3')).statusCode, 403);
    assert.equal((await oku(personelci, '/ik/hesap-rolleri')).statusCode, 403);
    assert.deepEqual(await sayilar(), once);
  });

  test('reddedilen: yetki dağıtan ya da bütün yetkileri veren rol verilemez; kart da kişi de yazılmaz', async () => {
    const once = await sayilar();
    for (const rolId of [rolYoneten, yoneticiRolu]) assert.equal((await iseAl(ikci, 'emp_ia_4', { rolId })).statusCode, 403);
    assert.deepEqual(await sayilar(), once);
    const { roller } = (await oku(ikci, '/ik/hesap-rolleri')).json<IkHesapRolleriCevabi>();
    assert.ok(roller.some((r) => r.id === isciRolu));
    assert.ok(!roller.some((r) => r.id === rolYoneten || r.id === yoneticiRolu));
  });

  test('reddedilen: kart başka kişideyse personel, kişi ve hesap da yazılmaz; var olan kayda işe alma 409', async () => {
    const once = await sayilar();
    assert.equal((await iseAl(ikci, 'emp_ia_5', { kartNo: '0007123456' })).statusCode, 409);
    assert.deepEqual(await sayilar(), once);
    assert.equal((await iseAl(ikci, 'emp_ia_1')).statusCode, 409);
  });

  test('kart listesi kapsamdaki personelin kartını son dört haneyle verir; başka iş merkezindeki görünmez', async () => {
    const uzak = (await iseAl(ikci, 'emp_ia_6', { kartNo: '0007999911' }, { ad: 'Uzak', isMerkeziId: im1 })).json<IkIseAlCevabi>();
    await vt().sorgu('UPDATE ik_personel SET is_merkezi_id = $1, surum = surum + 1 WHERE kimlik = $2', [im2, 'emp_ia_6']);
    const cevap = await oku(ikci, '/ik/giris-kartlari');
    assert.equal(cevap.statusCode, 200, cevap.body);
    const { kartlar } = cevap.json<IkGirisKartlariCevabi>();
    assert.deepEqual(kartlar.map((k) => [k.personel, k.kartSon4]), [['emp_ia_1', '3456']]);
    assert.ok(!kartlar.some((k) => k.kisiId === uzak.hesap?.kisiId));
    assert.doesNotMatch(cevap.body, /7123456/);
  });
  // 1928 a: ilk istasyon kaydın iş merkezinden; tam atama işe giriş gününden (geçmişse bugünden). Ayrışınca kişi kartı uyarır.
  const istasyonAc = async (kod: string, isMerkeziId: number, aktif = true) => (await ortam!.sahip.tek<{ id: number }>(
    'INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $1, $2, $3) RETURNING id', [kod, isMerkeziId, aktif]))!.id;
  const atamalari = (kisiId: number) => ortam!.sahip.sorgu<{ istasyon_id: number; baslangic: string; yuzde: string }>(
    "SELECT istasyon_id, to_char(baslangic, 'YYYY-MM-DD') AS baslangic, yuzde::text FROM istasyon_kisi WHERE kisi_id = $1 AND iptal_zamani IS NULL", [kisiId]);

  test('1928 a izinli: ilk istasyon işe giriş gününden tam atanır; seçenekler aktif istasyonları iş merkeziyle verir', async () => {
    const ist = await istasyonAc('TIA1', im1);
    const pasif = await istasyonAc('TIA0', im1, false);
    const secenek = (await oku(ikci, '/ik/hesap-rolleri')).json<IkHesapRolleriCevabi>();
    assert.ok(secenek.istasyonlar.some((i) => i.id === ist && i.isMerkeziId === im1));
    assert.ok(!secenek.istasyonlar.some((i) => i.id === pasif));
    const cevap = await iseAl(ikci, 'emp_ia_7', { istasyonId: ist }, { ad: 'Ileri', iseGiris: '2099-01-02' });
    assert.equal(cevap.statusCode, 200, cevap.body);
    const kisiId = cevap.json<IkIseAlCevabi>().hesap!.kisiId;
    assert.deepEqual(await atamalari(kisiId), [{ istasyon_id: ist, baslangic: '2099-01-02', yuzde: '100.00' }]);
  });

  test('1928 a reddedilen: başka iş merkezinin ya da pasif istasyon 400; personel, kişi ve atama yazılmaz', async () => {
    const uzak = await istasyonAc('TIA2', im2);
    const pasif = (await ortam!.sahip.tek<{ id: number }>("SELECT id FROM istasyon WHERE kod = 'TIA0'"))!.id;
    for (const istasyonId of [uzak, pasif]) {
      const once = await sayilar();
      const cevap = await iseAl(ikci, 'emp_ia_8', { istasyonId }, { ad: 'Yanlis' });
      assert.equal(cevap.statusCode, 400, cevap.body);
      assert.deepEqual(await sayilar(), once);
    }
  });

  test('1928 a: asıl istasyonu başka iş merkezine geçen personel uyarı listesinde; uyumlu olan yok', async () => {
    const ist = await istasyonAc('TIA3', im1);
    const c = (await iseAl(ikci, 'emp_ia_9', { istasyonId: ist }, { ad: 'Kayan' })).json<IkIseAlCevabi>();
    assert.ok(c.hesap);
    const liste = async () => (await oku(ikci, '/ik/istasyon-uyumsuzluklari')).json<IkIstasyonUyumsuzluklariCevabi>().uyumsuzluklar;
    assert.ok(!(await liste()).some((u) => u.personel === 'emp_ia_9'));
    await ortam!.sahip.sorgu('UPDATE istasyon SET is_merkezi_id = $1 WHERE id = $2', [im2, ist]);
    assert.deepEqual((await liste()).filter((u) => u.personel === 'emp_ia_9'), [{ personel: 'emp_ia_9', istasyon: 'TIA3', istasyonIsMerkezi: 'Merkez 2' }]);
  });
});
