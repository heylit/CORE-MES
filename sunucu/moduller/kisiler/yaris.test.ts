import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { yoneticiOlustur } from './disari.ts';
import { parolaOzetle } from './parola.ts';
import { baskasininParolasiniDegistir, hesapAc, kisiAktifYap, kisiEkle, kisiPasifeAl } from './servis.ts';
import { oturumlariGecersizKil, parolaYaz } from './sorgular.ts';

const PAROLA = 'dogru-parola-1';
const YENI = 'yeni-parola-9';
const GIRIS_IP = '10.0.1.1';
const DEGISIM_IP = '10.0.1.2';

// Yarış, oturum tablosuna yazımı test durdurarak sahnelenir (okuma sürer): giriş kişi satırını paylaşımlı kilitler, oturumu yazarken
// bekler; değişim o sırada başlar. Hiçbir adımda sabit bekleme yoktur; bekleyenler pg_blocking_pids ile görülür.
describe('değişim ile eşzamanlı giriş (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let uygulama: FastifyInstance | undefined;
  let adminId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const app = (): FastifyInstance => {
    if (!uygulama) throw new Error('Uygulama kurulmadı.');
    return uygulama;
  };

  beforeEach(async () => {
    ortam = await testVeritabaniKur('kisiler_yaris');
    uygulama = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    adminId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
  });
  afterEach(async () => {
    await uygulama?.close();
    await ortam?.kaldir();
  });

  const hedefKisi = async (): Promise<{ id: number; ad: string }> => {
    const ad = `yarisci-${++sayac}`;
    const operator = (await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'"))?.id ?? 0;
    const id = await vt().tx(async (db) => {
      const yeni = await kisiEkle(db, { ad: `Kişi ${ad}` });
      await hesapAc(db, adminId, yeni, { kullaniciAdi: ad, parola: PAROLA, rolId: operator });
      return yeni;
    });
    return { id, ad };
  };

  const girisYap = (kullaniciAdi: string, parola: string, ip = GIRIS_IP): Promise<LightMyRequestResponse> =>
    app().inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola }, remoteAddress: ip });
  const cerezi = (cevap: LightMyRequestResponse): string => String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  const acikMi = async (cerez: string): Promise<boolean> =>
    (await app().inject({ method: 'GET', url: '/api/oturum', headers: { cookie: cerez } })).json().kullanici !== null;

  const pidAl = async (db: { tek: <T>(sql: string) => Promise<T | null> }): Promise<number> =>
    (await db.tek<{ pid: number }>('SELECT pg_backend_pid() AS pid'))?.pid ?? 0;

  // engelleyenPid'in beklettiği, sorgusu parçayı içeren bağlantıyı bulur (yalnız bu pid'e daralır; başka şema ve test karışmaz).
  const bekleyeniBul = async (engelleyenPid: number, parca: string): Promise<number> => {
    const sinir = Date.now() + 15000;
    while (Date.now() < sinir) {
      const satirlar = await vt().sorgu<{ pid: number; query: string }>(
        'SELECT pid, query FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
        [engelleyenPid],
      );
      const bulunan = satirlar.find((s) => s.query.includes(parca));
      if (bulunan) return bulunan.pid;
      await new Promise((coz) => setTimeout(coz, 25));
    }
    throw new Error(`"${parca}" ${engelleyenPid} numaralı bağlantıyı beklemedi`);
  };

  interface Sahne {
    // Giriş oturum yazımında bekler, kişi satırını paylaşımlı tutar.
    giris: Promise<LightMyRequestResponse>;
    girisPid: number;
    birak: () => Promise<void>;
  }

  // Giriş yarım kalır: oturum tablosu test tarafından kilitli. Dönüşte giriş kişi satırını FOR SHARE tutuyor.
  const yarimGiris = async (kullaniciAdi: string, parola: string): Promise<Sahne> => {
    let birakIc: () => void = () => undefined;
    const tutulan = new Promise<void>((coz) => { birakIc = coz; });
    let kilitHazir: (pid: number) => void = () => undefined;
    const hazir = new Promise<number>((coz) => { kilitHazir = coz; });
    const kilit = vt().tx(async (db) => {
      await db.sorgu('LOCK TABLE oturum IN SHARE MODE');
      kilitHazir(await pidAl(db));
      await tutulan;
    });
    const kilitPid = await hazir;
    // birak her yolda çağrılabilir (tekrarı zararsız): kilidi tutan transaction hata yolunda da kapanır.
    const birak = async (): Promise<void> => { birakIc(); await kilit; };
    const giris = girisYap(kullaniciAdi, parola);
    try {
      const girisPid = await bekleyeniBul(kilitPid, 'INSERT INTO oturum');
      return { giris, girisPid, birak };
    } catch (hata) {
      await birak();
      await giris.catch(() => undefined);
      throw hata;
    }
  };

  // Değişim transaction'ı girişten ÖNCE açılır (başlangıç saati eskidir) ama kişi satırına girişten sonra dokunur.
  const gecikmeliDegisim = <T>(is: (db: Parameters<Parameters<TestVeritabani['vt']['tx']>[0]>[0]) => Promise<T>) => {
    let basla: () => void = () => undefined;
    const izin = new Promise<void>((coz) => { basla = coz; });
    let pidHazir: (pid: number) => void = () => undefined;
    const pid = new Promise<number>((coz) => { pidHazir = coz; });
    const sonuc = vt().tx(async (db) => {
      pidHazir(await pidAl(db));
      await izin;
      return is(db);
    });
    return { sonuc, basla, pid };
  };

  const yarisiYurut = async (
    hedef: { ad: string },
    degisim: ReturnType<typeof gecikmeliDegisim>,
    parola: string,
  ): Promise<LightMyRequestResponse> => {
    await degisim.pid;
    const sahne = await yarimGiris(hedef.ad, parola);
    degisim.basla();
    try {
      // Değişim, girişin kişi satırı kilidini bekler: sıraya girmiştir ve girişin commit'inden sonra çalışır.
      await bekleyeniBul(sahne.girisPid, 'UPDATE kisi');
    } finally {
      await sahne.birak();
      await degisim.sonuc.catch(() => undefined);
    }
    const cevap = await sahne.giris;
    await degisim.sonuc;
    return cevap;
  };

  test('başkasının parolası değişirken açılan giriş: oturum, değişimden sonra geçersizdir; yeni parola geçerli, eskisi değil', { timeout: 45000 }, async () => {
    const hedef = await hedefKisi();
    const degisim = gecikmeliDegisim((db) => baskasininParolasiniDegistir(db, adminId, hedef.id, YENI));
    const cevap = await yarisiYurut(hedef, degisim, PAROLA);

    assert.equal(cevap.statusCode, 200, 'giriş değişimden önce görülen parolayla tamamlandı');
    assert.equal(await acikMi(cerezi(cevap)), false, 'eski parolayla açılan oturum değişimden sonra yaşamamalı');
    assert.equal((await girisYap(hedef.ad, YENI)).statusCode, 200);
  });

  test('pasife alma sürerken açılan giriş: yeniden aktif yapılınca o çerez geri çalışmaz', { timeout: 45000 }, async () => {
    const hedef = await hedefKisi();
    const degisim = gecikmeliDegisim((db) => kisiPasifeAl(db, adminId, hedef.id));
    const cevap = await yarisiYurut(hedef, degisim, PAROLA);
    assert.equal(cevap.statusCode, 200);

    await vt().tx((db) => kisiAktifYap(db, adminId, hedef.id));
    assert.equal(await acikMi(cerezi(cevap)), false);
    assert.equal((await girisYap(hedef.ad, PAROLA, '10.0.1.3')).statusCode, 200, 'yeni giriş yeniden aktif kişide çalışır');
  });

  test('kendi parolasını değiştirirken eski parolayla açılan başka giriş kapanır; değiştirenin oturumu kalır', { timeout: 45000 }, async () => {
    const hedef = await hedefKisi();
    const simdiki = cerezi(await girisYap(hedef.ad, PAROLA, '10.0.1.4'));
    const sahne = await yarimGiris(hedef.ad, PAROLA);

    const degisim = app().inject({
      method: 'POST', url: '/api/hesabim/parola-degistir',
      payload: { eskiParola: PAROLA, yeniParola: YENI }, headers: { cookie: simdiki }, remoteAddress: DEGISIM_IP,
    });
    try {
      await bekleyeniBul(sahne.girisPid, 'UPDATE kisi');
    } finally {
      await sahne.birak();
      await degisim.catch(() => undefined);
    }
    const cevap = await sahne.giris;
    assert.equal((await degisim).statusCode, 200);

    assert.equal(cevap.statusCode, 200);
    assert.equal(await acikMi(cerezi(cevap)), false, 'bekleyen girişin oturumu kapanmalı');
    assert.equal(await acikMi(simdiki), true);
  });

  test('değişim sürerken başlayan giriş değişimin bitmesini bekler: yeni parolayla tamamlanan giriş çalışır, eski parolayla olan reddedilir', { timeout: 45000 }, async () => {
    const hedef = await hedefKisi();
    const ozet = await parolaOzetle(YENI);
    let girisler: Promise<LightMyRequestResponse>[] = [];
    let ikisiBeklesin: () => void = () => undefined;
    const beklediler = new Promise<void>((coz) => { ikisiBeklesin = coz; });
    let hazirOl: (pid: number) => void = () => undefined;
    const hazir = new Promise<number>((coz) => { hazirOl = coz; });
    // Değişim iki adımdır: parola yazılır (satır kilitlenir), ardından geçersiz kılma zamanı yazılır. Girişler iki adımın
    // arasında başlar, ilkinin kilidinde bekler ve ikincisinden SONRA tamamlanır.
    const degisim = vt().tx(async (db) => {
      assert.equal(await parolaYaz(db, hedef.id, ozet), true);
      hazirOl(await pidAl(db));
      await beklediler;
      await oturumlariGecersizKil(db, hedef.id);
    });
    const degisimPid = await hazir;
    try {
      girisler = [girisYap(hedef.ad, YENI, '10.0.1.5'), girisYap(hedef.ad, PAROLA, '10.0.1.6')];
      // İkisi de kişi satırında bekler; bekleyen sayısı iki olana dek beklenir.
      const sinir = Date.now() + 15000;
      let bekleyen = 0;
      while (bekleyen < 2 && Date.now() < sinir) {
        bekleyen = (await vt().sorgu('SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))', [degisimPid])).length;
        if (bekleyen < 2) await new Promise((coz) => setTimeout(coz, 25));
      }
      assert.equal(bekleyen, 2, 'girişler değişimin kilidini beklemedi');
    } finally {
      ikisiBeklesin();
    }
    await degisim;
    const [yeni, eski] = await Promise.all(girisler);
    assert.equal(yeni?.statusCode, 200, yeni?.body);
    assert.equal(await acikMi(cerezi(yeni as LightMyRequestResponse)), true, 'değişimden sonra tamamlanan giriş çalışmalı');
    assert.equal(eski?.statusCode, 401);
  });
});
