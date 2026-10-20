import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KisiEkIslemleriCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kisilerinIslemleri, rolAl, rolAta, yoneticiOlustur } from './disari.ts';
import { ILETILER } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
const YOL = '/kisiler/:id/ek-islem-degistir';

describe('kişiye ek işlem: GET /kisi-ek-islemleri, POST /kisiler/:id/ek-islem-degistir (gerçek PostgreSQL, gerçek giriş)', () => {
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
    const kullaniciAdi = `e${(sayac += 1)}-${rolKodu.replaceAll('_', '-')}`;
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
  const degistir = (cerez: string | null, kisi: number, islem: string, verildi: boolean): Promise<LightMyRequestResponse> =>
    app.inject({
      method: 'POST', url: `/api/kisiler/${kisi}/ek-islem-degistir`, headers: cerez === null ? {} : { cookie: cerez }, payload: { islem, verildi },
    });
  const liste = (cerez: string | null): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: '/api/kisi-ek-islemleri', headers: cerez === null ? {} : { cookie: cerez } });
  const oturumIslemleri = async (cerez: string): Promise<string[]> =>
    ((await app.inject({ method: 'GET', url: '/api/oturum', headers: { cookie: cerez } })).json() as { kullanici: { islemler: string[] } }).kullanici.islemler;
  const satirSayisi = async (islem: string): Promise<number> =>
    (await vt().tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM kisi_islemi WHERE islem = $1', [islem]))?.sayi ?? -1;

  before(async () => {
    ortam = await testVeritabaniKur('ekislem');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiCerezi = (await girisYap('yonetici')).cerez;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('KS-4: yönetici kişiye rolünde olmayan sayfa ve işlemi verir; açık oturumda hemen geçerli, sunucu ucu da açılır; alınca kapanır', async () => {
    const depocu = await girisYap('depo');
    assert.equal((await app.inject({ method: 'GET', url: '/api/ayarlar', headers: { cookie: depocu.cerez } })).statusCode, 403);
    assert.ok(!(await oturumIslemleri(depocu.cerez)).includes('sayfa.ayarlar'));

    for (const islem of ['sayfa.ayarlar', 'ayarlar.yaz']) {
      for (let i = 0; i < 2; i += 1) assert.equal((await degistir(yoneticiCerezi, depocu.id, islem, true)).statusCode, 200);
    }
    const cevap = (await liste(yoneticiCerezi)).json() as KisiEkIslemleriCevabi;
    const satir = cevap.kisiler.find((k) => k.id === depocu.id);
    assert.deepEqual(satir?.ek, ['ayarlar.yaz', 'sayfa.ayarlar']);
    assert.match(satir?.kullaniciAdi ?? '', /^e\d+-depo$/, 'kişi seçiminde kullanıcı adı görünür');
    assert.ok(satir?.roldenGelen.includes('stok.giris'));
    assert.ok(!satir?.roldenGelen.includes('ayarlar.yaz'), 'rolden gelen ek işlemi içermez');
    assert.deepEqual(cevap.devredilmez, ['kisiler.rol-yonet', 'kisiler.parola-degistir', 'guvenlik.oku', 'guvenlik.yonet']);
    assert.ok((await oturumIslemleri(depocu.cerez)).includes('sayfa.ayarlar'));
    assert.equal((await app.inject({ method: 'GET', url: '/api/ayarlar', headers: { cookie: depocu.cerez } })).statusCode, 200);
    assert.ok((await vt().tx((db) => kisilerinIslemleri(db))).get(depocu.id)?.includes('ayarlar.yaz'), 'dışa açık işlem haritası da ek işlemi taşır');
    const veren = await vt().tek<{ veren_id: number }>("SELECT veren_id FROM kisi_islemi WHERE kisi_id = $1 AND islem = 'ayarlar.yaz'", [depocu.id]);
    assert.equal(veren?.veren_id, yoneticiId, 'veren oturumdan');

    for (let i = 0; i < 2; i += 1) assert.equal((await degistir(yoneticiCerezi, depocu.id, 'ayarlar.yaz', false)).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/ayarlar', headers: { cookie: depocu.cerez } })).statusCode, 403);
    // Rolden gelen işlem ek işlemle alınmaz: ek satırı olmayan işlemi "almak" rol yetkisine dokunmaz.
    assert.equal((await degistir(yoneticiCerezi, depocu.id, 'stok.giris', false)).statusCode, 200);
    assert.ok((await oturumIslemleri(depocu.cerez)).includes('stok.giris'));

    const kayitlar = await vt().sorgu<{ govde: { islem: string; verildi: boolean } }>('SELECT govde FROM denetim_kaydi WHERE yol = $1 ORDER BY id', [YOL]);
    assert.equal(kayitlar.length, 7, 'her komut denetime düşer');
  });

  test('KS-4: bayraklı kişi, kayıtsız işlem ve devredilmez işlemin verilmesi 422; olmayan kişi 404; satır yazılmaz', async () => {
    const bayrakli = await degistir(yoneticiCerezi, yoneticiId, 'stok.giris', true);
    assert.deepEqual({ durum: bayrakli.statusCode, mesaj: bayrakli.json().mesaj }, { durum: 422, mesaj: ILETILER.bayrakliEkIslem });
    const kisi = await girisYap('operator');
    const kayitsiz = await degistir(yoneticiCerezi, kisi.id, 'yok.boyle', true);
    assert.deepEqual({ durum: kayitsiz.statusCode, mesaj: kayitsiz.json().mesaj }, { durum: 422, mesaj: ILETILER.islemKayitsiz });
    for (const islem of ['kisiler.rol-yonet', 'kisiler.parola-degistir', 'guvenlik.oku', 'guvenlik.yonet']) {
      const c = await degistir(yoneticiCerezi, kisi.id, islem, true);
      assert.deepEqual({ durum: c.statusCode, mesaj: c.json().mesaj }, { durum: 422, mesaj: ILETILER.devredilmezIslem }, islem);
      assert.equal(await satirSayisi(islem), 0);
    }
    // Daha önce elle yazılmış devredilmez satır alınabilir.
    await vt().sorgu("INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'kisiler.parola-degistir', $2)", [kisi.id, yoneticiId]);
    assert.equal((await degistir(yoneticiCerezi, kisi.id, 'kisiler.parola-degistir', false)).statusCode, 200);
    assert.equal(await satirSayisi('kisiler.parola-degistir'), 0);
    assert.equal((await degistir(yoneticiCerezi, 2147483000, 'stok.giris', true)).statusCode, 404);
    assert.equal(await satirSayisi('yok.boyle'), 0);
  });

  test('KS-4: pasif ya da girişsiz kişiye ek işlem verilmez (422); var olan satır pasifte korunur ve alınabilir', async () => {
    const kisi = await girisYap('operator');
    assert.equal((await degistir(yoneticiCerezi, kisi.id, 'sayfa.stok', true)).statusCode, 200);
    await vt().sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [kisi.id]);
    const pasif = await degistir(yoneticiCerezi, kisi.id, 'stok.giris', true);
    assert.deepEqual({ durum: pasif.statusCode, mesaj: pasif.json().mesaj }, { durum: 422, mesaj: ILETILER.ekIslemKullaniciDegil });
    assert.equal(await satirSayisi('stok.giris'), 0);
    assert.equal(await satirSayisi('sayfa.stok'), 1, 'pasife almada rolleri gibi korunur');
    assert.equal((await degistir(yoneticiCerezi, kisi.id, 'sayfa.stok', false)).statusCode, 200, 'pasif kişiden alınabilir');
    assert.equal(await satirSayisi('sayfa.stok'), 0);

    const girissiz = await vt().tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Girişsiz Deneme') RETURNING id");
    const c = await degistir(yoneticiCerezi, girissiz?.id ?? 0, 'stok.giris', true);
    assert.deepEqual({ durum: c.statusCode, mesaj: c.json().mesaj }, { durum: 422, mesaj: ILETILER.ekIslemKullaniciDegil });
    assert.equal(await satirSayisi('stok.giris'), 0);
  });

  test('KS-4: rol yöneten ama bayraksız kişi kendine ya da başkasına ek işlem veremez (403); rol yönetmeyen listeyi de okuyamaz; oturumsuz 401', async () => {
    const yonetenRol = await vt().tx(async (db) => {
      const r = await db.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('ek_rol_yoneten', 'Rol Yöneten') RETURNING id");
      await db.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'kisiler.rol-yonet'), ($1, 'kisiler.oku')", [r?.id]);
      return r?.id ?? 0;
    });
    assert.ok(yonetenRol > 0);
    const yoneten = await girisYap('ek_rol_yoneten');
    assert.equal((await liste(yoneten.cerez)).statusCode, 200, 'rol yöneten listeyi okur');
    const kendine = await degistir(yoneten.cerez, yoneten.id, 'ayarlar.yaz', true);
    assert.deepEqual({ durum: kendine.statusCode, mesaj: kendine.json().mesaj }, { durum: 403, mesaj: ILETILER.ekIslemYetkisiz });
    const depocu = await girisYap('depo');
    assert.equal((await degistir(yoneten.cerez, depocu.id, 'ayarlar.yaz', true)).statusCode, 403);
    assert.equal(await satirSayisi('ayarlar.yaz'), 0);

    const mudur = await girisYap('mudur');
    assert.equal((await liste(mudur.cerez)).statusCode, 403);
    assert.equal((await degistir(mudur.cerez, depocu.id, 'stok.sayim', true)).statusCode, 403);
    assert.equal((await liste(null)).statusCode, 401);
    assert.equal((await degistir(null, depocu.id, 'stok.sayim', true)).statusCode, 401);
  });
});
