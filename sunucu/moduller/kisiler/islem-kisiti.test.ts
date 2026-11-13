import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KisiEkIslemleriCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kisilerinIslemleri, kisilerinRolIslemleri, rolAl, rolAta, yoneticiOlustur } from './disari.ts';
import { ILETILER } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
const YOL = '/kisiler/:id/islem-kisiti-degistir';

describe('rolden gelen işlemi kişiden alma: POST /kisiler/:id/islem-kisiti-degistir (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yoneticiCerezi = '';
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = async (kod: string): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!rol) throw new Error(`rol yok: ${kod}`);
    return rol.id;
  };
  async function girisYap(rolKodu: string): Promise<{ id: number; cerez: string }> {
    const kullaniciAdi = `k${(sayac += 1)}-${rolKodu.replaceAll('_', '-')}`;
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (yoneticiId === 0) yoneticiId = yeni;
      if (hedefRol !== yoneticiRolu) {
        await rolAta(db, yoneticiId, yeni, hedefRol);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { id, cerez: String(c.headers['set-cookie']).split(';')[0] ?? '' };
  }
  const baslik = (cerez: string | null): Record<string, string> => (cerez === null ? {} : { cookie: cerez });
  const kisitla = (cerez: string | null, kisi: number, islem: string, alindi: boolean): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api/kisiler/${kisi}/islem-kisiti-degistir`, headers: baslik(cerez), payload: { islem, alindi } });
  const ekVer = (kisi: number, islem: string, verildi: boolean): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api/kisiler/${kisi}/ek-islem-degistir`, headers: baslik(yoneticiCerezi), payload: { islem, verildi } });
  const satiri = async (kisi: number): Promise<KisiEkIslemleriCevabi['kisiler'][number] | undefined> =>
    ((await app.inject({ method: 'GET', url: '/api/kisi-ek-islemleri', headers: baslik(yoneticiCerezi) })).json() as KisiEkIslemleriCevabi)
      .kisiler.find((k) => k.id === kisi);
  const oturumIslemleri = async (cerez: string): Promise<string[]> =>
    ((await app.inject({ method: 'GET', url: '/api/oturum', headers: { cookie: cerez } })).json() as { kullanici: { islemler: string[] } }).kullanici.islemler;
  const firmalar = async (cerez: string): Promise<number> =>
    (await app.inject({ method: 'GET', url: '/api/musteri-tedarikci/firmalar', headers: { cookie: cerez } })).statusCode;
  const satirSayisi = async (islem: string): Promise<number> =>
    (await vt().tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM kisi_islem_kisiti WHERE islem = $1', [islem]))?.sayi ?? -1;
  const ret = (c: LightMyRequestResponse): { durum: number; mesaj: unknown } => ({ durum: c.statusCode, mesaj: (c.json() as { mesaj?: unknown }).mesaj });

  before(async () => {
    ortam = await testVeritabaniKur('kisit');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiCerezi = (await girisYap('yonetici')).cerez;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('KS-11: yönetici rolden gelen işlemi tek kişiden alır; açık oturumda hemen geçerli, sunucu ucu kapanır; aynı roldeki öteki kişi etkilenmez; geri verince açılır', async () => {
    const depocu = await girisYap('depo');
    const oteki = await girisYap('depo');
    assert.ok((await oturumIslemleri(depocu.cerez)).includes('musteri-tedarikci.oku'));
    assert.equal(await firmalar(depocu.cerez), 200);

    for (let i = 0; i < 2; i += 1) assert.equal((await kisitla(yoneticiCerezi, depocu.id, 'musteri-tedarikci.oku', true)).statusCode, 200);
    const satir = await satiri(depocu.id);
    assert.deepEqual(satir?.alinan, ['musteri-tedarikci.oku']);
    assert.ok(satir?.roldenGelen.includes('musteri-tedarikci.oku'), 'ekran "rolde var, bu kişiden alındı" diyebilsin: rolden gelen kısıtsız listelenir');
    assert.ok(!(await oturumIslemleri(depocu.cerez)).includes('musteri-tedarikci.oku'), 'açık oturumun işlem listesinden düşer');
    assert.equal(await firmalar(depocu.cerez), 403, 'uç aynı listeyle denetler');
    assert.ok((await oturumIslemleri(depocu.cerez)).includes('stok.giris'), 'yalnız alınan işlem düşer');
    assert.equal(await firmalar(oteki.cerez), 200, 'rol değişmedi: aynı roldeki öteki kişi yapmaya devam eder');
    assert.deepEqual((await satiri(oteki.id))?.alinan, []);

    const harita = await vt().tx((db) => kisilerinIslemleri(db));
    assert.ok(!harita.get(depocu.id)?.includes('musteri-tedarikci.oku'), 'işlemi taşıyan kişiler listesinden de düşer (bildirim alıcıları)');
    assert.ok(harita.get(oteki.id)?.includes('musteri-tedarikci.oku'));
    const rolden = await vt().tx((db) => kisilerinRolIslemleri(db));
    assert.ok(!rolden.get(depocu.id)?.includes('musteri-tedarikci.oku'), 'rolden çözülen yetki de kısıtı aşmaz');
    assert.ok(!(await vt().tx((db) => kisilerinRolIslemleri(db, depocu.id))).get(depocu.id)?.includes('musteri-tedarikci.oku'));

    const kayit = await vt().tek<{ alan_id: number; alindi: Date }>("SELECT alan_id, alindi FROM kisi_islem_kisiti WHERE kisi_id = $1 AND islem = 'musteri-tedarikci.oku'", [depocu.id]);
    assert.equal(kayit?.alan_id, yoneticiId, 'alan oturumdan');
    assert.ok(kayit?.alindi instanceof Date);

    for (let i = 0; i < 2; i += 1) assert.equal((await kisitla(yoneticiCerezi, depocu.id, 'musteri-tedarikci.oku', false)).statusCode, 200);
    assert.equal(await firmalar(depocu.cerez), 200);
    assert.deepEqual((await satiri(depocu.id))?.alinan, []);
    assert.equal(await satirSayisi('musteri-tedarikci.oku'), 0);

    const kayitlar = await vt().sorgu<{ kisi_id: number; govde: { islem: string; alindi: boolean } }>(
      'SELECT kisi_id, govde FROM denetim_kaydi WHERE yol = $1 ORDER BY id', [YOL]);
    assert.equal(kayitlar.length, 4, 'her komut denetime düşer');
    assert.deepEqual(kayitlar.map((k) => [k.kisi_id, k.govde.islem, k.govde.alindi]), [
      [yoneticiId, 'musteri-tedarikci.oku', true], [yoneticiId, 'musteri-tedarikci.oku', true], [yoneticiId, 'musteri-tedarikci.oku', false], [yoneticiId, 'musteri-tedarikci.oku', false],
    ]);
  });

  test('KS-11: bayraklı kişi, devredilmez, kayıtsız ve rolde olmayan işlem alınmaz (422); olmayan kişi 404; satır yazılmaz', async () => {
    assert.deepEqual(ret(await kisitla(yoneticiCerezi, yoneticiId, 'musteri-tedarikci.oku', true)), { durum: 422, mesaj: ILETILER.bayrakliKisit }, 'yönetici kendini de kısıtlayamaz');
    const baskaYonetici = await girisYap('yonetici');
    assert.deepEqual(ret(await kisitla(yoneticiCerezi, baskaYonetici.id, 'musteri-tedarikci.oku', true)), { durum: 422, mesaj: ILETILER.bayrakliKisit });

    const yonetenRol = await vt().tx(async (db) => {
      const r = await db.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('kisit_rol_yoneten', 'Rol Yöneten') RETURNING id");
      await db.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'kisiler.rol-yonet'), ($1, 'kisiler.oku')", [r?.id]);
      return r?.id ?? 0;
    });
    assert.ok(yonetenRol > 0);
    const yoneten = await girisYap('kisit_rol_yoneten');
    assert.deepEqual(ret(await kisitla(yoneticiCerezi, yoneten.id, 'kisiler.rol-yonet', true)), { durum: 422, mesaj: ILETILER.devredilmezKisit });
    assert.deepEqual(ret(await kisitla(yoneticiCerezi, yoneten.id, 'yok.boyle', true)), { durum: 422, mesaj: ILETILER.islemKayitsiz });
    assert.deepEqual(ret(await kisitla(yoneticiCerezi, yoneten.id, 'musteri-tedarikci.oku', true)), { durum: 422, mesaj: ILETILER.kisitRoldeYok }, 'rolünde olmayan işlem alınmaz');
    assert.equal((await kisitla(yoneticiCerezi, 2147483000, 'musteri-tedarikci.oku', true)).statusCode, 404);
    const sayi = await vt().tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM kisi_islem_kisiti');
    assert.equal(sayi?.sayi, 0);

    // Bayraksız rol yöneten ne alır ne geri verir; rol yönetmeyen ve oturumsuz uca giremez.
    const depocu = await girisYap('depo');
    assert.deepEqual(ret(await kisitla(yoneten.cerez, depocu.id, 'musteri-tedarikci.oku', true)), { durum: 403, mesaj: ILETILER.kisitYetkisiz });
    assert.equal((await kisitla(yoneticiCerezi, depocu.id, 'musteri-tedarikci.oku', true)).statusCode, 200);
    assert.deepEqual(ret(await kisitla(yoneten.cerez, depocu.id, 'musteri-tedarikci.oku', false)), { durum: 403, mesaj: ILETILER.kisitYetkisiz }, 'geri vermek yetki vermektir');
    assert.deepEqual(ret(await kisitla(depocu.cerez, depocu.id, 'musteri-tedarikci.oku', false)).durum, 403, 'kısıtlı kişi kendi kısıtını kaldıramaz');
    assert.equal(await satirSayisi('musteri-tedarikci.oku'), 1);
    const mudur = await girisYap('mudur');
    assert.equal((await kisitla(mudur.cerez, depocu.id, 'stok.giris', true)).statusCode, 403);
    assert.equal((await kisitla(null, depocu.id, 'stok.giris', true)).statusCode, 401);
    assert.equal(await satirSayisi('stok.giris'), 0);
  });

  test('KS-11: pasif ya da girişsiz kişiden alınmaz (422); var olan kısıt pasifte korunur ve kaldırılabilir', async () => {
    const kisi = await girisYap('depo');
    assert.equal((await kisitla(yoneticiCerezi, kisi.id, 'stok.sayim', true)).statusCode, 200);
    await vt().sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [kisi.id]);
    assert.deepEqual(ret(await kisitla(yoneticiCerezi, kisi.id, 'stok.giris', true)), { durum: 422, mesaj: ILETILER.kisitKullaniciDegil });
    assert.equal(await satirSayisi('stok.sayim'), 1, 'pasife almada rolleri gibi korunur');
    await vt().sorgu('UPDATE kisi SET aktif = true WHERE id = $1', [kisi.id]);
    assert.ok(!(await vt().tx((db) => kisilerinIslemleri(db))).get(kisi.id)?.includes('stok.sayim'), 'aktif yapılınca kısıt yürürlüktedir');
    await vt().sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [kisi.id]);
    assert.equal((await kisitla(yoneticiCerezi, kisi.id, 'stok.sayim', false)).statusCode, 200, 'pasif kişide kaldırılabilir');
    assert.equal(await satirSayisi('stok.sayim'), 0);

    const girissiz = await vt().tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Girişsiz Deneme') RETURNING id");
    assert.deepEqual(ret(await kisitla(yoneticiCerezi, girissiz?.id ?? 0, 'stok.giris', true)), { durum: 422, mesaj: ILETILER.kisitKullaniciDegil });
  });

  test('KS-11: kısıt ek işlemi de bastırır; ek yeniden verilince kısıt kalkar; kısıtlı kişi bütün yetkili role geçerse kısıt etkisizdir', async () => {
    const depocu = await girisYap('depo');
    // Rolde de ek olarak da olan işlem: kısıt ikisini birlikte kapatır.
    assert.equal((await ekVer(depocu.id, 'musteri-tedarikci.oku', true)).statusCode, 200);
    assert.equal((await kisitla(yoneticiCerezi, depocu.id, 'musteri-tedarikci.oku', true)).statusCode, 200);
    assert.equal(await firmalar(depocu.cerez), 403, 'kısıt kazanır');
    assert.deepEqual((await satiri(depocu.id))?.ek, ['musteri-tedarikci.oku']);

    assert.equal((await ekVer(depocu.id, 'musteri-tedarikci.oku', false)).statusCode, 200);
    assert.equal(await firmalar(depocu.cerez), 403, 'ek kalkınca kısıt yerinde kalır');
    assert.equal((await ekVer(depocu.id, 'musteri-tedarikci.oku', true)).statusCode, 200);
    assert.deepEqual((await satiri(depocu.id))?.alinan, [], 'ek vermek kısıtı kaldırır');
    assert.equal(await firmalar(depocu.cerez), 200);

    assert.equal((await kisitla(yoneticiCerezi, depocu.id, 'stok.giris', true)).statusCode, 200);
    await vt().tx(async (db) => { await rolAta(db, yoneticiId, depocu.id, await rolId('yonetici')); });
    assert.ok((await oturumIslemleri(depocu.cerez)).includes('stok.giris'), 'bütün yetkili rol kısıtlanmaz');
    assert.ok((await vt().tx((db) => kisilerinIslemleri(db))).get(depocu.id)?.includes('stok.giris'));
    assert.equal((await kisitla(yoneticiCerezi, depocu.id, 'stok.giris', false)).statusCode, 200, 'kalan satır kaldırılabilir');
  });

  test('göç: kisi_islem_kisiti biçimsiz işlemi ve olmayan kişiyi reddeder; kişi silinince satır da gider', async () => {
    const kisi = await vt().tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Kısıt Göç Deneme') RETURNING id");
    const id = kisi?.id ?? 0;
    await assert.rejects(vt().sorgu("INSERT INTO kisi_islem_kisiti (kisi_id, islem, alan_id) VALUES ($1, 'Biçimsiz', $2)", [id, yoneticiId]), /kisi_islem_kisiti_bicim/);
    await assert.rejects(vt().sorgu("INSERT INTO kisi_islem_kisiti (kisi_id, islem, alan_id) VALUES (2147483000, 'musteri-tedarikci.oku', $1)", [yoneticiId]), /kisi_islem_kisiti_kisi_fk/);
    await assert.rejects(vt().sorgu("INSERT INTO kisi_islem_kisiti (kisi_id, islem, alan_id) VALUES ($1, 'musteri-tedarikci.oku', 2147483000)", [id]), /kisi_islem_kisiti_alan_fk/);
    await vt().sorgu("INSERT INTO kisi_islem_kisiti (kisi_id, islem, alan_id) VALUES ($1, 'musteri-tedarikci.oku', $2)", [id, yoneticiId]);
    await assert.rejects(vt().sorgu("INSERT INTO kisi_islem_kisiti (kisi_id, islem, alan_id) VALUES ($1, 'musteri-tedarikci.oku', $2)", [id, yoneticiId]), /kisi_islem_kisiti_pk/);
    await vt().sorgu('DELETE FROM kisi WHERE id = $1', [id]);
    const kalan = await vt().tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM kisi_islem_kisiti WHERE kisi_id = $1', [id]);
    assert.equal(kalan?.sayi, 0);
  });
});
