import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { ayarOku } from '#cekirdek/ayar.ts';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { sifirlamaHazirla, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kisiBayrakliMi, kisileriListele, kisiVarMi, rolAl as disariRolAl, rolAta as disariRolAta, yoneticiOlustur } from './disari.ts';
import { rolAl, rolAta } from './servis.ts';
import { ILETILER } from './kurallar.ts';

// Testin bağlandığı havuzun boyutu ortamdan gelir (TMIV2_PG_HAVUZ).
const HAVUZ_BOYUTU = ayarOku().pg.havuzBoyutu;

const PAROLA = 'dogru-parola-1';

interface Ortam {
  vt: () => TestVeritabani['vt'];
  app: () => FastifyInstance;
  adminId: () => number;
  dosyaKur: () => Promise<void>;
  kur: () => Promise<void>;
  kaldir: () => Promise<void>;
  dosyaKaldir: () => Promise<void>;
  rolId: (kod: string) => Promise<number>;
  kisiEkle: (kullaniciAdi: string, rolKodu: string, aktor?: number) => Promise<number>;
  girissizEkle: (ad: string) => Promise<number>;
  cerez: (kullaniciAdi: string) => Promise<string>;
  istek: (cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown) => Promise<LightMyRequestResponse>;
}

function ortamKur(onek: string): Ortam {
  let ortam: TestVeritabani | undefined;
  let uygulama: FastifyInstance | undefined;
  let sifirla: (() => Promise<void>) | undefined;
  let yonetici = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const app = (): FastifyInstance => {
    if (!uygulama) throw new Error('Uygulama kurulmadı.');
    return uygulama;
  };

  const rolId = async (kod: string): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!rol) throw new Error(`rol yok: ${kod}`);
    return rol.id;
  };

  // Kişi yönetici rolüyle doğar; istenen rol, uygulamanın kendi atama ve alma işleviyle verilir.
  const kisiEkle = async (kullaniciAdi: string, rolKodu: string, aktor?: number): Promise<number> => {
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    return vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA });
      if (hedefRol !== yoneticiRolu) {
        await rolAta(db, aktor ?? yonetici, id, hedefRol);
        await rolAl(db, aktor ?? yonetici, id, yoneticiRolu);
      }
      return id;
    });
  };

  const girissizEkle = async (ad: string): Promise<number> => {
    const satir = await vt().tek<{ id: number }>('INSERT INTO kisi (ad) VALUES ($1) RETURNING id', [ad]);
    if (!satir) throw new Error('kişi eklenemedi');
    return satir.id;
  };

  const cerez = async (kullaniciAdi: string): Promise<string> => {
    const cevap = await app().inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  };

// Kişi komutu sürümü okunan kayıttan alır (ekranın yaptığı gibi); sürümü sınayan test gövdeye kendisi yazar.
  const istek: Ortam['istek'] = async (cerezi, yontem, url, govde) => {
    const hedef = /^\/kisiler\/(\d+)\/[a-z-]+$/.exec(url);
    let yuk = govde;
    if (yontem === 'POST' && hedef && typeof govde === 'object' && govde !== null && !('surum' in govde)) {
      const satir = await vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [Number(hedef[1])]);
      yuk = { ...govde, surum: satir?.surum ?? 1 };
    }
    return app().inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerezi }, ...(yuk === undefined ? {} : { payload: yuk as object }) });
  };

  return {
    vt, app, rolId, kisiEkle, girissizEkle, cerez, istek,
    adminId: () => yonetici,
    // Göçler dosya başına bir kez uygulanır; her test göç sonrası duruma döndürülmüş şemayla ve yeni uygulamayla başlar.
    async dosyaKur() {
      ortam = await testVeritabaniKur(onek);
      sifirla = await sifirlamaHazirla(ortam);
    },
    async kur() {
      if (!ortam || !sifirla) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
      await sifirla();
      uygulama = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
      yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    },
    async kaldir() {
      await uygulama?.close();
      uygulama = undefined;
    },
    async dosyaKaldir() {
      await ortam?.kaldir();
    },
  };
}

function hataGovdesi(kod: string, mesaj: string) {
  return (hata: unknown): boolean => {
    assert.ok(hata instanceof UygulamaHatasi, `uygulama hatası beklenirdi: ${String(hata)}`);
    assert.deepEqual(hata.govde(), { kod, mesaj });
    return true;
  };
}

describe('rol atama (gerçek PostgreSQL, gerçek giriş)', () => {
  const o = ortamKur('kisiler_rol');
  before(o.dosyaKur);
  beforeEach(o.kur);
  afterEach(o.kaldir);
  after(o.dosyaKaldir);

  const roller = async (cerezi: string, kisiId: number): Promise<string[]> => {
    const cevap = await o.istek(cerezi, 'GET', '/kisiler');
    assert.equal(cevap.statusCode, 200, cevap.body);
    const kisi = (cevap.json().kisiler as { id: number; roller: { ad: string }[] }[]).find((k) => k.id === kisiId);
    assert.ok(kisi, 'kişi listede yok');
    return kisi.roller.map((r) => r.ad).sort();
  };

  test('M8: kişi ve rol listesi kisiler.oku ister; yetkisiz 403, oturumsuz 401; parola cevapta yok, kullanıcı adı yalnız rol yönetene', async () => {
    const operatorId = await o.kisiEkle('oku-operator', 'operator');
    await o.kisiEkle('oku-planlamaci', 'planlama_proje');
    const yoneticiCerezi = await o.cerez('yonetici');

    for (const url of ['/kisiler', '/roller']) {
      assert.equal((await o.app().inject({ method: 'GET', url: `/api${url}` })).statusCode, 401);
      assert.equal((await o.istek(await o.cerez('oku-operator'), 'GET', url)).statusCode, 403, url);
      assert.equal((await o.istek(await o.cerez('oku-planlamaci'), 'GET', url)).statusCode, 200, url);
      assert.equal((await o.istek(yoneticiCerezi, 'GET', url)).statusCode, 200, url);
    }

    const cevap = await o.istek(yoneticiCerezi, 'GET', '/kisiler');
    const kisi = (cevap.json().kisiler as Record<string, unknown>[]).find((k) => k.id === operatorId);
    assert.ok(kisi);
    assert.deepEqual(Object.keys(kisi).sort(), ['ad', 'aktif', 'girisVar', 'gorev', 'id', 'kullaniciAdi', 'pinVar', 'roller', 'sicilNo', 'surum']);
    assert.doesNotMatch(cevap.body, /parola|ozet|scrypt/);
    assert.equal(kisi.girisVar, true);
    assert.equal(kisi.kullaniciAdi, 'oku-operator');

    const okuyucu = await o.istek(await o.cerez('oku-planlamaci'), 'GET', '/kisiler');
    assert.ok((okuyucu.json().kisiler as { kullaniciAdi: unknown }[]).every((k) => k.kullaniciAdi === null));
    assert.doesNotMatch(okuyucu.body, /parola|ozet|scrypt|oku-operator|oku-planlamaci/);
  });

  test('"bütün işlemler" bayrağı yalnız kisiler.rol-yonet sahibine döner; yalnız kisiler.oku sahibi tam yetkili rolü çıkaramaz', async () => {
    await o.kisiEkle('bayrak-oku', 'planlama_proje');
    const okuyucu = await o.cerez('bayrak-oku');
    const yonetici = await o.cerez('yonetici');
    const bayraklar = (cevap: { json: () => unknown }, alan: 'roller' | 'kisiler'): unknown[] => {
      const govde = cevap.json() as Record<string, { yonetici?: unknown; roller?: { yonetici: unknown }[] }[]>;
      const satirlar = govde[alan] ?? [];
      return alan === 'roller' ? satirlar.map((r) => r.yonetici) : satirlar.flatMap((k) => (k.roller ?? []).map((r) => r.yonetici));
    };

    // Kabul: rol yönetici bayrağı görür; bayraklı rol true, ötekiler false.
    const rolleri = bayraklar(await o.istek(yonetici, 'GET', '/roller'), 'roller');
    assert.ok(rolleri.includes(true) && rolleri.includes(false));
    assert.ok(bayraklar(await o.istek(yonetici, 'GET', '/kisiler'), 'kisiler').includes(true));

    // Red: yalnız okuyan hiçbir rolde ayrım göremez; bütün değerler aynı (null).
    const okuyucuRoller = bayraklar(await o.istek(okuyucu, 'GET', '/roller'), 'roller');
    assert.equal(okuyucuRoller.length, rolleri.length);
    assert.ok(okuyucuRoller.every((b) => b === null));
    const okuyucuKisiler = bayraklar(await o.istek(okuyucu, 'GET', '/kisiler'), 'kisiler');
    assert.ok(okuyucuKisiler.length > 0 && okuyucuKisiler.every((b) => b === null));
  });

  test('RA1: pasif kişiye rol atanabilir', async () => {
    const hedef = await o.kisiEkle('pasif-hedef', 'depo');
    await o.vt().sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [hedef]);
    const cevap = await o.istek(await o.cerez('yonetici'), 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: await o.rolId('operator') });
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual(cevap.json().roller.map((r: { ad: string }) => r.ad).sort(), ['Depo', 'Operatör']);
    assert.equal(cevap.json().aktif, false);
  });

  test('M1: rol atama ve alma yalnız kisiler.rol-yonet ile; yetkisiz 403 ve durum değişmez, yetkili 200', async () => {
    await o.kisiEkle('oku-operator', 'operator');
    await o.kisiEkle('oku-planlamaci', 'planlama_proje');
    const hedef = await o.kisiEkle('m1-hedef', 'depo');
    const operatorRolu = await o.rolId('operator');
    const yoneticiCerezi = await o.cerez('yonetici');
    for (const kullaniciAdi of ['oku-operator', 'oku-planlamaci']) {
      const cerezi = await o.cerez(kullaniciAdi);
      assert.equal((await o.istek(cerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: operatorRolu })).statusCode, 403);
      assert.equal((await o.istek(cerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: await o.rolId('depo') })).statusCode, 403);
    }
    assert.equal((await o.app().inject({ method: 'POST', url: `/api/kisiler/${hedef}/rol-ata`, payload: { rolId: operatorRolu } })).statusCode, 401);
    assert.deepEqual(await roller(yoneticiCerezi, hedef), ['Depo']);

    assert.equal((await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: operatorRolu })).statusCode, 200);
    assert.deepEqual(await roller(yoneticiCerezi, hedef), ['Depo', 'Operatör']);
    assert.equal((await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: operatorRolu })).statusCode, 200);
    assert.deepEqual(await roller(yoneticiCerezi, hedef), ['Depo']);
  });

  test('M2: kişi birden çok rol alır; aynı rol ikinci kez atanamaz', async () => {
    const hedef = await o.kisiEkle('m2-hedef', 'depo');
    const yoneticiCerezi = await o.cerez('yonetici');
    const ata = (rol: string) => o.rolId(rol).then((rolId) => o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId }));

    assert.equal((await ata('operator')).statusCode, 200);
    assert.equal((await ata('kalite')).statusCode, 200);
    assert.deepEqual(await roller(yoneticiCerezi, hedef), ['Depo', 'Kalite', 'Operatör']);

    const ikinci = await ata('operator');
    assert.equal(ikinci.statusCode, 409);
    assert.deepEqual(ikinci.json(), { kod: 'CAKISMA', mesaj: ILETILER.zatenVar });
    assert.deepEqual(await roller(yoneticiCerezi, hedef), ['Depo', 'Kalite', 'Operatör']);
  });

  test('M3: girişi olan kişinin son rolü alınamaz (422, sözleşmedeki ileti); rolü kalır', async () => {
    const hedef = await o.kisiEkle('m3-hedef', 'operator');
    const yoneticiCerezi = await o.cerez('yonetici');
    const cevap = await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: await o.rolId('operator') });
    assert.equal(cevap.statusCode, 422);
    assert.deepEqual(cevap.json(), { kod: 'GECERSIZ', mesaj: 'Girişi olan kişinin en az bir rolü olmalı.' });
    assert.deepEqual(await roller(yoneticiCerezi, hedef), ['Operatör']);

    // İkinci rol varken aynı rol alınabilir: kural son rolü korur, rolü değil.
    await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: await o.rolId('depo') });
    assert.equal((await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: await o.rolId('operator') })).statusCode, 200);
    assert.deepEqual(await roller(yoneticiCerezi, hedef), ['Depo']);
  });

  test('P2: girişi olmayan kişiye rol atanır ve son rolü de alınabilir', async () => {
    const hedef = await o.girissizEkle('Girişsiz Personel');
    const yoneticiCerezi = await o.cerez('yonetici');
    assert.deepEqual(await roller(yoneticiCerezi, hedef), []);
    assert.equal((await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: await o.rolId('operator') })).statusCode, 200);
    assert.deepEqual(await roller(yoneticiCerezi, hedef), ['Operatör']);
    const liste = (await o.istek(yoneticiCerezi, 'GET', '/kisiler')).json().kisiler as { id: number; girisVar: boolean }[];
    assert.equal(liste.find((k) => k.id === hedef)?.girisVar, false);
    assert.equal((await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: await o.rolId('operator') })).statusCode, 200);
    assert.deepEqual(await roller(yoneticiCerezi, hedef), []);
  });

  test('M5: rol değişikliği açık oturumda sonraki istekte geçerli olur; oturum kapanmaz', async () => {
    const hedef = await o.kisiEkle('m5-hedef', 'operator');
    const hedefCerezi = await o.cerez('m5-hedef');
    const yoneticiCerezi = await o.cerez('yonetici');
    const islemler = async (): Promise<string[]> => {
      const cevap = await o.istek(hedefCerezi, 'GET', '/oturum');
      assert.equal(cevap.statusCode, 200);
      return (cevap.json().kullanici.islemler as string[]).sort();
    };

    const OPERATOR = [
      'arkon.operator', 'ik.bordro-gordum', 'ik.izin-talep', 'mesaj.oku', 'mesaj.yaz', 'sayfa.ik-islemlerim', 'sayfa.kuyruk', 'sayfa.mesaj', 'sayfa.terminal', 'sayfa.uretim-terminali', 'stok.istek', 'terminal.uret',
      'sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.hazirlik-onayla', 'cnc-kurulum.takim-degistir', 'uretim-emirleri.ara-istasyon',
      'sayfa.idari-isler', 'idari-isler.talep-ac', 'idari-isler.arac-talebi-ac',
    ].sort();
    assert.deepEqual(await islemler(), OPERATOR);
    assert.equal((await o.istek(hedefCerezi, 'GET', '/kisiler')).statusCode, 403);

    await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: await o.rolId('planlama_proje') });
    assert.ok((await islemler()).includes('kisiler.oku'));
    assert.equal((await o.istek(hedefCerezi, 'GET', '/kisiler')).statusCode, 200);

    await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: await o.rolId('planlama_proje') });
    assert.deepEqual(await islemler(), OPERATOR);
    assert.equal((await o.istek(hedefCerezi, 'GET', '/kisiler')).statusCode, 403);
  });

  test('M6: başarılı atama ve alma denetim kaydına düşer; reddedilen komut kayıt bırakmaz', async () => {
    const hedef = await o.kisiEkle('m6-hedef', 'depo');
    const yoneticiCerezi = await o.cerez('yonetici');
    const kayitlar = () => o.vt().sorgu<{ kisi_id: number; yontem: string; yol: string; parametre: unknown; govde: unknown }>(
      'SELECT kisi_id, yontem, yol, parametre, govde FROM denetim_kaydi WHERE yol LIKE $1 ORDER BY id',
      ['/kisiler/:id/rol-%'],
    );
    const onceki = (await kayitlar()).length;
    const operatorRolu = await o.rolId('operator');
    const surum = (await o.vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [hedef]))?.surum ?? 0;

    await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: operatorRolu });
    await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: operatorRolu });
    const yeni = (await kayitlar()).slice(onceki);
    assert.deepEqual(yeni, [
      { kisi_id: o.adminId(), yontem: 'POST', yol: '/kisiler/:id/rol-ata', parametre: { id: hedef }, govde: { rolId: operatorRolu, surum } },
      { kisi_id: o.adminId(), yontem: 'POST', yol: '/kisiler/:id/rol-al', parametre: { id: hedef }, govde: { rolId: operatorRolu, surum: surum + 1 } },
    ]);

    // Reddedilen komut (son rol) deftere yazılmaz.
    const red = await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: await o.rolId('depo') });
    assert.equal(red.statusCode, 422);
    assert.equal((await kayitlar()).length, onceki + 2);
  });

  test('bulunamayan kişi ya da rol 404; geçersiz gövde ve parametre 400', async () => {
    const yoneticiCerezi = await o.cerez('yonetici');
    const operatorRolu = await o.rolId('operator');
    assert.equal((await o.istek(yoneticiCerezi, 'POST', '/kisiler/999999/rol-ata', { rolId: operatorRolu })).statusCode, 404);
    assert.equal((await o.istek(yoneticiCerezi, 'POST', `/kisiler/${o.adminId()}/rol-ata`, { rolId: 999999 })).statusCode, 404);
    assert.equal((await o.istek(yoneticiCerezi, 'POST', `/kisiler/${o.adminId()}/rol-ata`, {})).statusCode, 400);
    assert.equal((await o.istek(yoneticiCerezi, 'POST', '/kisiler/abc/rol-ata', { rolId: operatorRolu })).statusCode, 400);
    // Kişide olmayan rol alınamaz.
    const hedef = await o.kisiEkle('yok-hedef', 'depo');
    assert.equal((await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: operatorRolu })).statusCode, 404);
  });

  test('P3: bayraksız ama kisiler.rol-yonet verilmiş kişi bayraklı rolü atayamaz ve alamaz; bayraksız rolü atar ve alır', async () => {
    // Geçici rol: bayraksız, işlem satırıyla rol yönetimi yetkisi verir.
    const gecici = await o.vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_rol_yonetimi', 'Geçici Rol Yönetimi') RETURNING id");
    assert.ok(gecici);
    await o.vt().sorgu(
      "INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'kisiler.rol-yonet'), ($1, 'kisiler.oku')",
      [gecici.id],
    );
    const yetkili = await o.kisiEkle('p3-yetkili', 'operator');
    await o.vt().tx((db) => rolAta(db, o.adminId(), yetkili, gecici.id));
    const yetkiliCerezi = await o.cerez('p3-yetkili');
    assert.equal(await o.vt().tx((db) => kisiBayrakliMi(db, yetkili)), false);
    assert.ok(((await o.istek(yetkiliCerezi, 'GET', '/oturum')).json().kullanici.islemler as string[]).includes('kisiler.rol-yonet'));

    const hedef = await o.kisiEkle('p3-hedef', 'depo');
    const baskasi = await o.kisiEkle('p3-baskasi', 'yonetici');
    const yoneticiRolu = await o.rolId('yonetici');

    const atama = await o.istek(yetkiliCerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: yoneticiRolu });
    assert.equal(atama.statusCode, 403);
    assert.deepEqual(atama.json(), { kod: 'YETKI_YOK', mesaj: ILETILER.bayrakliYetkisiz });
    const alma = await o.istek(yetkiliCerezi, 'POST', `/kisiler/${baskasi}/rol-al`, { rolId: yoneticiRolu });
    assert.equal(alma.statusCode, 403);
    assert.deepEqual(alma.json(), { kod: 'YETKI_YOK', mesaj: ILETILER.bayrakliYetkisiz });
    const yoneticiCerezi = await o.cerez('yonetici');
    assert.deepEqual(await roller(yoneticiCerezi, hedef), ['Depo']);
    assert.deepEqual(await roller(yoneticiCerezi, baskasi), ['Yönetici']);

    // Bayraksız rol aynı kişiyle atanır ve alınır.
    const operatorRolu = await o.rolId('operator');
    assert.equal((await o.istek(yetkiliCerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: operatorRolu })).statusCode, 200);
    assert.equal((await o.istek(yetkiliCerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: operatorRolu })).statusCode, 200);

    // Bayraklı kişi bayraklı rolü atar ve alır.
    assert.equal((await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: yoneticiRolu })).statusCode, 200);
    assert.equal((await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: yoneticiRolu })).statusCode, 200);
  });

  test('KS-3: dışa açık rolAta ve rolAl eylemi yapanın kisiler.rol-yonet işlemini sorar; yoksa ya da aktör pasifse 403 ve durum değişmez', async () => {
    const hedef = await o.kisiEkle('ks3-hedef', 'depo');
    const operator = await o.kisiEkle('ks3-operator', 'operator');
    const operatorRolu = await o.rolId('operator');
    const depoRolu = await o.rolId('depo');
    const surum = async (): Promise<number> => (await o.vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [hedef]))?.surum ?? 0;
    const once = await surum();

    const yetkisiz = hataGovdesi('YETKI_YOK', ILETILER.rolYonetimiYetkisiz);
    await assert.rejects(o.vt().tx((db) => disariRolAta(db, operator, hedef, operatorRolu)), yetkisiz);
    await assert.rejects(o.vt().tx((db) => disariRolAl(db, operator, hedef, depoRolu)), yetkisiz);
    assert.deepEqual(await roller(await o.cerez('yonetici'), hedef), ['Depo']);
    assert.equal(await surum(), once);

    // Bayraklı ama pasif aktör kullanıcı sayılmaz: işlemi yoktur.
    const pasif = await o.kisiEkle('ks3-pasif', 'yonetici');
    await o.vt().sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [pasif]);
    await assert.rejects(o.vt().tx((db) => disariRolAta(db, pasif, hedef, operatorRolu)), yetkisiz);

    // Yetkili aktörde geçer ve sürüm artar.
    await o.vt().tx((db) => disariRolAta(db, o.adminId(), hedef, operatorRolu));
    await o.vt().tx((db) => disariRolAl(db, o.adminId(), hedef, operatorRolu));
    assert.equal(await surum(), once + 2);
  });

  test('KS-1: rol komutu beklenen sürümü taşır; eski sürüm 409 ve rol değişmez, güncel sürüm 200 ve sürüm artar', async () => {
    const hedef = await o.kisiEkle('ks1-rol', 'depo');
    const yoneticiCerezi = await o.cerez('yonetici');
    const operatorRolu = await o.rolId('operator');
    const surum = (await o.vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [hedef]))?.surum ?? 0;

    const eski = await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: operatorRolu, surum: surum - 1 });
    assert.equal(eski.statusCode, 409, eski.body);
    assert.equal(eski.json().ayrinti?.neden, 'eski-surum');
    assert.deepEqual(await roller(yoneticiCerezi, hedef), ['Depo']);

    const guncel = await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-ata`, { rolId: operatorRolu, surum });
    assert.equal(guncel.statusCode, 200, guncel.body);
    assert.equal(guncel.json().surum, surum + 1);
    const yine = await o.istek(yoneticiCerezi, 'POST', `/kisiler/${hedef}/rol-al`, { rolId: operatorRolu, surum });
    assert.equal(yine.statusCode, 409, yine.body);
    const surumsuz = await o.app().inject({ method: 'POST', url: `/api/kisiler/${hedef}/rol-al`, headers: { cookie: yoneticiCerezi }, payload: { rolId: operatorRolu } });
    assert.equal(surumsuz.statusCode, 400, surumsuz.body);
  });

  test('disari: kisiVarMi aktif, pasif ve girişsiz kişiye doğru; olmayan kimliğe yanlış', async () => {
    const aktif = await o.kisiEkle('varmi-aktif', 'operator');
    const pasif = await o.kisiEkle('varmi-pasif', 'operator');
    await o.vt().sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [pasif]);
    const girissiz = await o.girissizEkle('Varmı Girişsiz');
    for (const id of [aktif, pasif, girissiz]) assert.equal(await o.vt().tx((db) => kisiVarMi(db, id)), true, String(id));
    assert.equal(await o.vt().tx((db) => kisiVarMi(db, 999999)), false);
  });

  test('disari: kisileriListele yalnız id, ad, aktif verir; kisiBayrakliMi bayrağa bakar', async () => {
    const operator = await o.kisiEkle('disari-operator', 'operator');
    const liste = await o.vt().tx((db) => kisileriListele(db));
    assert.ok(liste.length >= 2);
    assert.deepEqual(Object.keys(liste[0] ?? {}).sort(), ['ad', 'aktif', 'id']);
    assert.ok(liste.some((k) => k.id === operator && k.aktif));
    assert.equal(await o.vt().tx((db) => kisiBayrakliMi(db, operator)), false);
    assert.equal(await o.vt().tx((db) => kisiBayrakliMi(db, o.adminId())), true);
  });
});

// Komutlar belirli bir noktaya (SQL öneki) geldiklerinde ötekini kısa süre beklerler: kilit yoksa ikisi de
// aynı eski durumu görüp ilerler. Kilit varsa biri kilitte bekler, bekleme süresi dolunca devam eder.
function bariyerKur(onek: string): { sarmala: (db: Db) => Db; varanlar: () => number } {
  let gelen = 0;
  let ac: () => void = () => undefined;
  const acildi = new Promise<void>((coz) => { ac = coz; });
  const bariyer = async (): Promise<void> => {
    gelen += 1;
    if (gelen >= 2) ac();
    await Promise.race([acildi, new Promise<void>((coz) => setTimeout(coz, 500))]);
  };
  const sarmala = (db: Db): Db => ({
    sorgu: async <T>(sql: string, p?: readonly unknown[]) => db.sorgu<T>(sql, p),
    tek: async <T>(sql: string, p?: readonly unknown[]) => {
      const satir = await db.tek<T>(sql, p);
      if (sql.startsWith(onek)) await bariyer();
      return satir;
    },
  });
  return { sarmala, varanlar: () => gelen };
}

describe('bayraklı rol güvencesi (gerçek PostgreSQL)', () => {
  const o = ortamKur('kisiler_bayrak');
  before(o.dosyaKur);
  beforeEach(o.kur);
  afterEach(o.kaldir);
  after(o.dosyaKaldir);

  const kalanBayrakli = async (): Promise<number> =>
    (await o.vt().tek<{ n: number }>(
      `SELECT count(*)::int AS n FROM kisi k WHERE k.aktif AND k.kullanici_adi IS NOT NULL
          AND EXISTS (SELECT 1 FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id WHERE kr.kisi_id = k.id AND r.yonetici)`,
    ))?.n ?? -1;

  const gecici = async (kod: string, bayrakli: boolean): Promise<number> => {
    const rol = await o.vt().tek<{ id: number }>('INSERT INTO rol (kod, ad, yonetici) VALUES ($1, $1, $2) RETURNING id', [kod, bayrakli]);
    assert.ok(rol);
    return rol.id;
  };

  const atama = (aktor: number, kisi: number, rol: number) => o.vt().tx((db) => rolAta(db, aktor, kisi, rol));
  const alma = (aktor: number, kisi: number, rol: number) => o.vt().tx((db) => rolAl(db, aktor, kisi, rol));
  const havuzuIsit = async (): Promise<void> => {
    await Promise.all(Array.from({ length: HAVUZ_BOYUTU }, () => o.vt().sorgu('SELECT pg_sleep(0.05)')));
  };

  test('M4: son bayraklı kişinin rolü alınamaz; pasif ve girişsiz bayraklı kalan sayılmaz; kalan varsa alınır', async () => {
    const yoneticiRolu = await o.rolId('yonetici');
    const operatorRolu = await o.rolId('operator');
    const admin = o.adminId();
    // Yöneticinin ikinci rolü olur ki bayraklı rol alınınca "son rol" kuralı araya girmesin.
    await atama(admin, admin, operatorRolu);
    const pasif = await o.kisiEkle('pasif-bayrakli', 'yonetici');
    await o.vt().sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [pasif]);
    await atama(admin, await o.girissizEkle('Girişsiz Bayraklı'), yoneticiRolu);
    assert.equal(await kalanBayrakli(), 1);

    // Eylemi yapan sayılmayan biri olunca (pasif) tek sayılan kişi korunur.
    await assert.rejects(alma(pasif, admin, yoneticiRolu), hataGovdesi('GECERSIZ', ILETILER.sonBayrakli));
    assert.equal(await o.vt().tx((db) => kisiBayrakliMi(db, admin)), true);

    // Pasif kişi aktifleşince sayılır: artık kalan var, alma geçer.
    await o.vt().sorgu('UPDATE kisi SET aktif = true WHERE id = $1', [pasif]);
    await alma(pasif, admin, yoneticiRolu);
    assert.equal(await o.vt().tx((db) => kisiBayrakliMi(db, admin)), false);
    assert.equal(await kalanBayrakli(), 1);
  });

  test('M4: iki ayrı bayraklı rol varken bir bayraklı rolü alınan kişi öteki bayraklı rolüyle kalan sayılır', async () => {
    const yoneticiRolu = await o.rolId('yonetici');
    const ikinciBayrakli = await gecici('gecici_bayrakli', true);
    const admin = o.adminId();
    await atama(admin, admin, await o.rolId('operator'));
    await atama(admin, admin, ikinciBayrakli);
    const pasif = await o.kisiEkle('pasif-eylemci', 'yonetici');
    await o.vt().sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [pasif]);

    // Admin hâlâ ikinci bayraklı rolüyle sayılır: ilk bayraklı rol alınır.
    await alma(pasif, admin, yoneticiRolu);
    assert.equal(await kalanBayrakli(), 1);
    // Şimdi tek bayraklı rolü bu: alınamaz.
    await assert.rejects(alma(pasif, admin, ikinciBayrakli), hataGovdesi('GECERSIZ', ILETILER.sonBayrakli));
    assert.equal(await o.vt().tx((db) => kisiBayrakliMi(db, admin)), true);
  });

  test('P1: kişi kendi bayraklı rolünü alamaz (422); başka bir bayraklı kişi alır', async () => {
    const yoneticiRolu = await o.rolId('yonetici');
    const admin = o.adminId();
    const ikinci = await o.kisiEkle('ikinci-bayrakli', 'yonetici');
    await atama(admin, ikinci, await o.rolId('operator'));
    assert.equal(await kalanBayrakli(), 2);

    const ikinciCerezi = await o.cerez('ikinci-bayrakli');
    const kendi = await o.istek(ikinciCerezi, 'POST', `/kisiler/${ikinci}/rol-al`, { rolId: yoneticiRolu });
    assert.equal(kendi.statusCode, 422);
    assert.deepEqual(kendi.json(), { kod: 'GECERSIZ', mesaj: ILETILER.kendiBayrakli });
    assert.equal(await kalanBayrakli(), 2);

    const baskasi = await o.istek(await o.cerez('yonetici'), 'POST', `/kisiler/${ikinci}/rol-al`, { rolId: yoneticiRolu });
    assert.equal(baskasi.statusCode, 200, baskasi.body);
    assert.equal(await kalanBayrakli(), 1);
    assert.equal(await o.vt().tx((db) => kisiBayrakliMi(db, admin)), true);
  });

  test('P3: bayraksız ama kisiler.rol-yonet olan kişi kendine hiçbir rol atayamaz; bayraklı kişinin bayraksız rolünü alabilir', async () => {
    const yoneticiRolu = await o.rolId('yonetici');
    const operatorRolu = await o.rolId('operator');
    const admin = o.adminId();
    const yonetimRolu = await gecici('gecici_rol_yonetimi', false);
    await o.vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'kisiler.rol-yonet')", [yonetimRolu]);
    const yetkili = await o.kisiEkle('p3-yetkili', 'operator');
    await atama(admin, yetkili, yonetimRolu);
    const bayrakli = await o.kisiEkle('p3-bayrakli', 'yonetici');
    await atama(admin, bayrakli, operatorRolu);
    const cerezi = await o.cerez('p3-yetkili');

    const kendine = await o.istek(cerezi, 'POST', `/kisiler/${yetkili}/rol-ata`, { rolId: yoneticiRolu });
    assert.equal(kendine.statusCode, 403);
    assert.equal(await o.vt().tx((db) => kisiBayrakliMi(db, yetkili)), false);

    // KD-073: rol yönetme yetkisiyle kendine bayraksız rol de atanamaz; yetki genişlemez.
    const satinAlmaRolu = await o.rolId('satin_alma');
    const kendineBayraksiz = await o.istek(cerezi, 'POST', `/kisiler/${yetkili}/rol-ata`, { rolId: satinAlmaRolu });
    assert.equal(kendineBayraksiz.statusCode, 403);
    assert.deepEqual(kendineBayraksiz.json(), { kod: 'YETKI_YOK', mesaj: ILETILER.kendiRol });
    assert.ok(!((await o.istek(cerezi, 'GET', '/oturum')).json().kullanici.islemler as string[]).includes('satin-alma.oku'));
    assert.equal((await o.istek(await o.cerez('yonetici'), 'POST', `/kisiler/${yetkili}/rol-ata`, { rolId: satinAlmaRolu })).statusCode, 200);

    const al = await o.istek(cerezi, 'POST', `/kisiler/${bayrakli}/rol-al`, { rolId: operatorRolu });
    assert.equal(al.statusCode, 200, al.body);
    assert.equal(await o.vt().tx((db) => kisiBayrakliMi(db, bayrakli)), true);
  });

  test('eşzamanlı iki alma: iki bayraklı kişi birbirinin rolünü aynı anda alırsa biri başarır, biri reddedilir; bayraklı kişi kalır', async () => {
    const yoneticiRolu = await o.rolId('yonetici');
    const operatorRolu = await o.rolId('operator');
    const admin = o.adminId();
    const x = await o.kisiEkle('yarisan-x', 'yonetici');
    const y = await o.kisiEkle('yarisan-y', 'yonetici');
    await atama(admin, x, operatorRolu);
    await atama(admin, y, operatorRolu);
    await atama(admin, admin, operatorRolu);
    await alma(x, admin, yoneticiRolu);
    assert.equal(await kalanBayrakli(), 2);
    await havuzuIsit();

    const { sarmala, varanlar } = bariyerKur('SELECT count(*)::int AS sayi');
    const sonuclar = await Promise.allSettled([
      o.vt().tx((db) => rolAl(sarmala(db), x, y, yoneticiRolu)),
      o.vt().tx((db) => rolAl(sarmala(db), y, x, yoneticiRolu)),
    ]);
    assert.equal(varanlar(), 2, 'bariyer iki komutta da tetiklenmedi: sorgu metni değişmiş olabilir');
    assert.equal(sonuclar.filter((s) => s.status === 'fulfilled').length, 1, JSON.stringify(sonuclar));
    const red = sonuclar.find((s) => s.status === 'rejected');
    assert.ok(red?.status === 'rejected' && red.reason instanceof UygulamaHatasi);
    assert.equal(await kalanBayrakli(), 1);
  });

  test('eşzamanlı iki alma, aynı bağ: biri başarır, öbürü "kişide rol yok" 404 alır', async () => {
    const yoneticiRolu = await o.rolId('yonetici');
    const operatorRolu = await o.rolId('operator');
    const admin = o.adminId();
    const hedef = await o.kisiEkle('ayni-hedef', 'yonetici');
    await atama(admin, hedef, operatorRolu);
    const ikinci = await o.kisiEkle('ayni-ikinci', 'yonetici');
    await havuzuIsit();

    // İki eylemci de bağı var görüp kilide gelir; kilitte bekleyen, öncekinin silmesinden sonra bağı bulamaz.
    const { sarmala, varanlar } = bariyerKur('SELECT 1 AS var FROM kisi_rolu');
    const sonuclar = await Promise.allSettled([
      o.vt().tx((db) => rolAl(sarmala(db), admin, hedef, yoneticiRolu)),
      o.vt().tx((db) => rolAl(sarmala(db), ikinci, hedef, yoneticiRolu)),
    ]);
    assert.equal(varanlar(), 2, 'bariyer iki komutta da tetiklenmedi: sorgu metni değişmiş olabilir');
    assert.equal(sonuclar.filter((s) => s.status === 'fulfilled').length, 1, JSON.stringify(sonuclar));
    const red = sonuclar.find((s) => s.status === 'rejected');
    assert.ok(red?.status === 'rejected');
    hataGovdesi('BULUNAMADI', ILETILER.rolYok)(red.reason);
  });
});
