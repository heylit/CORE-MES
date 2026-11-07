import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { SAYFA_ISLEMLERI } from '#paylasilan/sayfalar.ts';
import { ayarOku } from '#cekirdek/ayar.ts';
import { izinYok, testSemasiAc, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uc, uclariKaydet } from '#cekirdek/uc.ts';
import { isiBirKezCalistir, modulIsleriniKesfet } from '#cekirdek/zamanlayici.ts';
import { hataYonetiminiKur, uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from './disari.ts';
import { CEREZ_ADI, beklemeIletisi } from './kurallar.ts';
import { denemeKilidiAl } from './sorgular.ts';
import { oturumUclari } from './uclar.ts';
import { ROL_KODLARI, ROL_MATRISI, YALNIZ_YONETICIDE, YONETICI_ROLU, rolunIslemleri, rollerinIslemleri } from '../../../araclar/yetki-beklentisi.ts';
import type { RolKodu } from '../../../araclar/yetki-beklentisi.ts';

// Testin bağlandığı havuzun boyutu ortamdan gelir (TMIV2_PG_HAVUZ).
const HAVUZ_BOYUTU = ayarOku().pg.havuzBoyutu;

const PAROLA = 'dogru-parola-1';

describe('oturum (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  // Bekleme testleri saati elinde tutar: süre geçmesi beklenmez, kalan süre tam değerle ölçülür.
  let saatliApp: FastifyInstance;
  let saat = new Date();
  const ilerle = (sn: number): void => { saat = new Date(saat.getTime() + sn * 1000); };

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const sahip = (): TestVeritabani['sahip'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.sahip;
  };

  // Her test kendi cihazından girer: cihaz başına sınır (soru 66) öbür testlerin hatalı denemelerini saymasın.
  let testIpSayaci = 0;
  let cihazIp = '10.250.0.0';
  beforeEach(() => {
    testIpSayaci += 1;
    cihazIp = `10.250.${testIpSayaci >> 8}.${testIpSayaci & 255}`;
  });

  const giris = (kullaniciAdi: string, parola: string, ip = cihazIp) =>
    app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola }, remoteAddress: ip });

  const saatliGiris = (kullaniciAdi: string, parola: string, ip = cihazIp) =>
    saatliApp.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola }, remoteAddress: ip });

  const beklet = (sn: number): string => beklemeIletisi(sn);

  const cerez = (cevap: { headers: Record<string, unknown> }): string => {
    const baslik = String(cevap.headers['set-cookie'] ?? '');
    return baslik.split(';')[0] ?? '';
  };

  const ben = async (cerezi: string) =>
    (await app.inject({ method: 'GET', url: '/api/oturum', headers: { cookie: cerezi } })).json().kullanici;

  const rolId = async (kod: string): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!rol) throw new Error(`rol yok: ${kod}`);
    return rol.id;
  };

  // Yönetici olmayan yolu sınar: kişi oluşturulur, rolü verilen rolle değiştirilir.
  async function kisiEkle(kullaniciAdi: string, rolKodu = 'operator'): Promise<number> {
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA }));
    await vt().sorgu('UPDATE kisi_rolu SET rol_id = $2 WHERE kisi_id = $1', [id, await rolId(rolKodu)]);
    return id;
  }

  const HATALI_ILETI = 'Kullanıcı adı, PIN ya da parola hatalı.';

  async function hataliDene(kullaniciAdi: string, ip?: string): Promise<void> {
    const cevap = await saatliGiris(kullaniciAdi, 'yanlis-parola', ip);
    assert.equal(cevap.statusCode, 401);
    assert.equal(cevap.json().mesaj, HATALI_ILETI);
  }

  // Art arda hatalı deneme; sonuncusu taze kalır, öncekilerin beklemesi dolmuştur.
  async function hataliSeri(kullaniciAdi: string, kez: number, ip?: string): Promise<void> {
    for (let i = 0; i < kez; i += 1) {
      if (i > 0) ilerle(100);
      await hataliDene(kullaniciAdi, ip);
    }
  }

  // Eşzamanlı deneme sayısı havuzu aşmalıdır; havuz ortamdan geldiği için sayı ondan türetilir.
  const ES_ZAMANLI = Math.max(20, HAVUZ_BOYUTU + 10);
  const SURUYOR = { durum: 429, kod: 'COK_ISTEK', mesaj: 'Aynı anda başka bir giriş denemesi sürüyor. Birazdan yeniden deneyin.' };

  // Bağlantılar sırayla açılırsa eşzamanlı istekler kendiliğinden sıraya girer, kilit ölçülmez.
  const havuzPidleri = async (): Promise<number[]> =>
    (await Promise.all(Array.from({ length: HAVUZ_BOYUTU }, () => vt().tek<{ pid: number }>('SELECT pg_backend_pid() AS pid FROM pg_sleep(0.05)'))))
      .map((s) => s?.pid ?? 0);
  const havuzuIsit = async (): Promise<void> => { await havuzPidleri(); };

  // Havuzun bütün yerleri aynı anda alınabiliyor; hiçbir bağlantıda açık transaction ya da tutulan kilit kalmamış.
  async function havuzBosta(): Promise<void> {
    const pidler = await havuzPidleri();
    assert.equal(new Set(pidler).size, HAVUZ_BOYUTU, JSON.stringify(pidler));
    assert.deepEqual(
      await vt().sorgu("SELECT pid, state FROM pg_stat_activity WHERE pid = ANY($1::int[]) AND pid <> pg_backend_pid() AND state <> 'idle'", [pidler]),
      [],
    );
    assert.deepEqual(await vt().sorgu("SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND pid = ANY($1::int[])", [pidler]), []);
  }

  function sureIcinde<T>(is: Promise<T>, ms: number): Promise<T> {
    let zamanlayici: NodeJS.Timeout | undefined;
    const doldu = new Promise<never>((_coz, reddet) => {
      zamanlayici = setTimeout(() => { reddet(new Error(`İstekler ${ms} ms içinde cevaplanmadı: süren denemeyi bekliyorlar`)); }, ms);
    });
    return Promise.race([is, doldu]).finally(() => { clearTimeout(zamanlayici); });
  }

  const sonuclar = async (kullaniciAdi: string): Promise<string[]> =>
    (await vt().sorgu<{ sonuc: string }>('SELECT sonuc FROM giris_denemesi WHERE kullanici_adi = $1 ORDER BY id', [kullaniciAdi]))
      .map((s) => s.sonuc);

  before(async () => {
    ortam = await testVeritabaniKur('oturum');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    saatliApp = Fastify();
    hataYonetiminiKur(saatliApp);
    uclariKaydet(saatliApp, oturumUclari(() => saat), { vt: ortam.vt, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('doğru parola oturum açar: çerez HttpOnly, anahtarın yalnız özeti saklanır', async () => {
    const cevap = await giris('  Yonetici ', PAROLA);
    assert.equal(cevap.statusCode, 200);
    assert.equal(cevap.json().kullanici.ad, 'Deneme Yönetici');

    const baslik = String(cevap.headers['set-cookie']);
    assert.match(baslik, new RegExp(`^${CEREZ_ADI}=[A-Za-z0-9_-]{43}; Path=/; Max-Age=604800; HttpOnly; SameSite=Strict$`));
    const anahtar = cerez(cevap).split('=')[1] ?? '';
    const sakli = await vt().sorgu<{ anahtar_ozeti: string }>('SELECT anahtar_ozeti FROM oturum');
    assert.equal(sakli.some((s) => s.anahtar_ozeti === anahtar), false);

    assert.equal((await ben(cerez(cevap))).ad, 'Deneme Yönetici');
  });

  test('oturumsuz istekte kullanıcı null döner; uydurma ya da bozuk çerez kimlik vermez', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/api/oturum' })).json().kullanici, null);
    assert.equal(await ben(`${CEREZ_ADI}=uydurma`), null);
    assert.equal(await ben(`${CEREZ_ADI}=`), null);
  });

  test('bütün işlemler bayraklı rol kayıtlı her işleme sahiptir; role satır yazılmış olması gerekmez', async () => {
    assert.equal(ISLEMLER.length > 0, true);
    assert.deepEqual((await giris('yonetici', PAROLA)).json().kullanici.islemler, [...ISLEMLER]);
    assert.deepEqual(await vt().sorgu('SELECT 1 FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE r.yonetici'), []);

    // Bayrak kalkınca aynı kişi yalnız rolün satırlarını alır: yetkiyi veren bayraktır, rolün adı değil.
    await kisiEkle('bayraksiz', 'yonetici');
    assert.deepEqual((await giris('bayraksiz', PAROLA)).json().kullanici.islemler, [...ISLEMLER]);
    await vt().sorgu("UPDATE rol SET yonetici = false WHERE kod = 'yonetici'");
    try {
      assert.deepEqual((await giris('bayraksiz', PAROLA)).json().kullanici.islemler, []);
    } finally {
      await vt().sorgu("UPDATE rol SET yonetici = true WHERE kod = 'yonetici'");
    }
  });

  // Onaylı matris tek dosyadadır (araclar/yetki-beklentisi.ts); bayraklı rol kayıtlı bütün işlemleri alır.
  const MUDUR_SAYFALARI = rolunIslemleri('mudur').filter((i) => i.startsWith('sayfa.'));

  const girisIslemleri = async (kullaniciAdi: string): Promise<string[]> => {
    const cevap = await giris(kullaniciAdi, PAROLA);
    assert.equal(cevap.statusCode, 200, cevap.body);
    return (cevap.json().kullanici.islemler as string[]).sort();
  };

  test('onaylı matris: her rol girişte tam olarak kendi işlemlerini alır; roller ve adları onaylı listedir', async () => {
    assert.deepEqual(
      await vt().sorgu('SELECT kod, ad, yonetici FROM rol ORDER BY kod'),
      [{ kod: YONETICI_ROLU.kod, ad: YONETICI_ROLU.ad, yonetici: true }, ...Object.entries(ROL_MATRISI).map(([kod, r]) => ({ kod, ad: r.ad, yonetici: false }))]
        .sort((a, b) => a.kod.localeCompare(b.kod)),
    );
    // Giriş kayıtsız işlemi süzer; fazla ya da kayıtsız satır yalnız tabloda görünür. Bayraklı role satır yazılmaz.
    const satirlar = (await vt().sorgu<{ kod: string; islem: string }>('SELECT r.kod, ri.islem FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id'))
      .map((s) => `${s.kod}:${s.islem}`).sort();
    const onayli = ROL_KODLARI.filter((kod) => kod !== YONETICI_ROLU.kod)
      .flatMap((kod) => rolunIslemleri(kod).map((islem) => `${kod}:${islem}`)).sort();
    assert.deepEqual(satirlar, onayli);
    for (const kod of ROL_KODLARI) {
      for (const islem of rolunIslemleri(kod)) assert.equal((ISLEMLER as readonly string[]).includes(islem), true, islem);
    }
    for (const kod of ROL_KODLARI) {
      const kullaniciAdi = `matris-${kod.replaceAll('_', '-')}`;
      await kisiEkle(kullaniciAdi, kod);
      const alinan = await girisIslemleri(kullaniciAdi);
      assert.deepEqual(alinan, rolunIslemleri(kod), kod);
      for (const islem of alinan) assert.equal((ISLEMLER as readonly string[]).includes(islem), true, `${kod}: ${islem}`);
      if (kod !== 'yonetici') {
        for (const islem of YALNIZ_YONETICIDE) assert.equal(alinan.includes(islem), false, `${kod}: ${islem}`);
      } else {
        // Önce kayıtlı oldukları görülür: kayıtsız işlem hiçbir rolde olmazdı ve yukarıdaki yokluk kendiliğinden geçerdi.
        for (const islem of YALNIZ_YONETICIDE) assert.equal(alinan.includes(islem), true, `${kod}: ${islem}`);
      }
    }
  });

  test('müdür onaylı sayfalarını görür, sonradan eklenen sayfayı rol satırı girilince; kişi yazamaz, rol yönetemez, parola değiştiremez; sistem ayrıntısı müdüre 403, yöneticiye 200', async () => {
    await kisiEkle('mudur1', 'mudur');
    const mudur = await giris('mudur1', PAROLA);
    const islemler = mudur.json().kullanici.islemler as string[];
    const sayfalari = (liste: string[]): string[] => liste.filter((i) => i.startsWith('sayfa.')).sort();
    assert.deepEqual(sayfalari(islemler), [...MUDUR_SAYFALARI].sort());
    // Sayfa listesi büyüyünce müdür kendiliğinden görmez: görünürlük rol satırıyla gelir.
    const sonradan = SAYFA_ISLEMLERI.find((s) => !MUDUR_SAYFALARI.includes(s));
    if (!sonradan) throw new Error('onaylı listenin dışında sayfa yok: bu test hiçbir şey ölçmez');
    const mudurRolu = await rolId('mudur');
    await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [mudurRolu, sonradan]);
    try {
      assert.deepEqual(sayfalari(await girisIslemleri('mudur1')), [...MUDUR_SAYFALARI, sonradan].sort());
    } finally {
      await vt().sorgu('DELETE FROM rol_islemi WHERE rol_id = $1 AND islem = $2', [mudurRolu, sonradan]);
    }
    assert.deepEqual(sayfalari(await girisIslemleri('mudur1')), [...MUDUR_SAYFALARI].sort());
    // Önce verilenler gelir: boş listede aşağıdaki yokluklar kendiliğinden geçerdi.
    for (const islem of ['kisiler.oku', 'denetim.oku', 'sayfa.personel']) assert.equal(islemler.includes(islem), true, islem);
    for (const islem of ['kisiler.yaz', 'kisiler.rol-yonet', 'kisiler.parola-degistir', 'saglik.ayrinti-oku']) {
      assert.equal(islemler.includes(islem), false, islem);
    }
    const ayrinti = (cerezi: string) => app.inject({ method: 'GET', url: '/api/saglik/ayrinti', headers: { cookie: cerezi } });
    assert.equal((await ayrinti(cerez(mudur))).statusCode, 403);
    assert.equal((await ayrinti(cerez(await giris('yonetici', PAROLA)))).statusCode, 200);
  });

  test('emir açma, rotadan emre kopyalama ve terminalde üretim işlemleri: onaylı rol 200, öteki rol 403; biri ötekinin yerine geçmez', async () => {
    // Modülün uçları henüz yok; rol satırı aynı işlemi isteyen deneme ucuyla, gerçek girişle ölçülür.
    const deneme = Fastify();
    hataYonetiminiKur(deneme);
    const tamam = z.object({ tamam: z.boolean() });
    uclariKaydet(deneme, [
      uc({ yontem: 'POST', yol: '/deneme/emir-yaz', yetki: 'uretim-emirleri.yaz', cevap: tamam, isle: async () => ({ tamam: true }) }),
      uc({ yontem: 'POST', yol: '/deneme/uret', yetki: 'terminal.uret', cevap: tamam, isle: async () => ({ tamam: true }) }),
      uc({ yontem: 'POST', yol: '/deneme/emre-kopyala', yetki: 'rota.emre-kopyala', cevap: tamam, isle: async () => ({ tamam: true }) }),
    ], { vt: vt(), kimlik: kimlikCozucu(vt()), denetle: denetimYaz });
    const durum = (kod: RolKodu, islem: Islem): number => (rolunIslemleri(kod).includes(islem) ? 200 : 403);
    const BEKLENEN = Object.fromEntries((['yonetici', 'mudur', 'planlama_proje', 'operator', 'kalite', 'cam'] as const).map((kod) =>
      [kod, { yaz: durum(kod, 'uretim-emirleri.yaz'), uret: durum(kod, 'terminal.uret'), kopya: durum(kod, 'rota.emre-kopyala') }]));
    // Altı rol üç işlemin ikisini de, yokluğunu da taşır: dağılım bozulursa ölçüm tek yönlü kalmasın.
    assert.deepEqual(new Set(Object.values(BEKLENEN).flatMap((b) => [b.yaz, b.uret, b.kopya])), new Set([200, 403]));
    try {
      for (const [kod, beklenen] of Object.entries(BEKLENEN)) {
        const kullaniciAdi = `uretim-${kod.replaceAll('_', '-')}`;
        await kisiEkle(kullaniciAdi, kod);
        const cerezi = cerez(await giris(kullaniciAdi, PAROLA));
        const dene = async (yol: string): Promise<number> =>
          (await deneme.inject({ method: 'POST', url: `/api/deneme/${yol}`, headers: { cookie: cerezi } })).statusCode;
        assert.deepEqual({ yaz: await dene('emir-yaz'), uret: await dene('uret'), kopya: await dene('emre-kopyala') }, beklenen, kod);
      }
    } finally {
      await deneme.close();
    }
  });

  test('depo rolü stok, malzeme ve sevkiyat sayfalarını açar, malzeme kartı yazar; ek rol olarak alan kişi rollerinin birleşimini alır', async () => {
    await kisiEkle('depocu', 'depo');
    const depo = rolunIslemleri('depo');
    for (const islem of ['sayfa.stok', 'sayfa.malzemeler', 'sayfa.sevkiyat', 'malzemeler.yaz']) assert.equal(depo.includes(islem as Islem), true, islem);
    assert.deepEqual(await girisIslemleri('depocu'), depo);

    const operator = await kisiEkle('operator-depocu', 'operator');
    await vt().sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2)', [operator, await rolId('depo')]);
    assert.deepEqual(
      await girisIslemleri('operator-depocu'),
      rollerinIslemleri('operator', 'depo'),
    );

    const cam = await kisiEkle('cam-satinalmaci', 'cam');
    await vt().sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2), ($1, $3)', [cam, await rolId('satin_alma'), await rolId('depo')]);
    assert.deepEqual(
      await girisIslemleri('cam-satinalmaci'),
      rollerinIslemleri('cam', 'satin_alma', 'depo'),
    );
  });

  test('kişinin yetkisi rollerinin birleşimidir; kayıtlı olmayan işlem kullanıcıya geçmez', async () => {
    const id = await kisiEkle('cokrollu');
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('ek_rol', 'Ek Rol')");
    const ek = await rolId('ek_rol');
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'denetim.oku'), ($1, 'sayfa.terminal'), ($1, 'eski.islem')", [ek]);
    const al = async (): Promise<string[]> => ((await giris('cokrollu', PAROLA)).json().kullanici.islemler as string[]).sort();

    const OPERATOR = rolunIslemleri('operator');
    assert.deepEqual(await al(), OPERATOR);
    await vt().sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2)', [id, ek]);
    assert.deepEqual(await al(), ['denetim.oku', ...OPERATOR].sort());
  });

  test('açılış sayfası rolden gelir: finans, satın alma ve depoda kendi panosu, satışta siparişler, operatörde ana sayfa; bütün rolleri aynı sayfayı söyleyen kişide geçerli, boş ya da farklı rol ana sayfada bırakır; biçimsiz yol reddedilir', async () => {
    assert.deepEqual(
      await vt().sorgu('SELECT kod, acilis_sayfasi FROM rol WHERE acilis_sayfasi IS NOT NULL ORDER BY kod'),
      [
        { kod: 'depo', acilis_sayfasi: '/stok' },
        { kod: 'guvenlik_gorevlisi', acilis_sayfasi: '/nizamiye' },
        { kod: 'muhasebe_finans', acilis_sayfasi: '/finans' },
        { kod: 'satin_alma', acilis_sayfasi: '/satin-alma' },
        { kod: 'satis', acilis_sayfasi: '/siparisler' },
      ],
    );
    const acilis = async (kullaniciAdi: string): Promise<unknown> => (await giris(kullaniciAdi, PAROLA)).json().kullanici.acilisSayfasi;
    const id = await kisiEkle('acilis-op');
    assert.equal(await acilis('acilis-op'), null);
    await kisiEkle('acilis-mudur', 'mudur');
    assert.equal(await acilis('acilis-mudur'), null);

    await vt().sorgu("INSERT INTO rol (kod, ad, acilis_sayfasi) VALUES ('acilis_ayni', 'Aynı Açılış', '/uretim-terminali'), ('acilis_ayni2', 'Aynı Açılış 2', '/uretim-terminali'), ('acilis_baska', 'Başka Açılış', '/kuyruk')");
    // Girişi olan kişi rolsüz kalamaz: önce yeni roller, sonra operatör çıkar.
    await vt().sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2), ($1, $3)', [id, await rolId('acilis_ayni'), await rolId('acilis_ayni2')]);
    await vt().sorgu('DELETE FROM kisi_rolu WHERE kisi_id = $1 AND rol_id = $2', [id, await rolId('operator')]);
    assert.equal(await acilis('acilis-op'), '/uretim-terminali');
    await vt().sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2)', [id, await rolId('acilis_baska')]);
    assert.equal(await acilis('acilis-op'), null);
    await vt().sorgu('DELETE FROM kisi_rolu WHERE kisi_id = $1 AND rol_id = $2', [id, await rolId('acilis_baska')]);
    await vt().sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2)', [id, await rolId('mudur')]);
    assert.equal(await acilis('acilis-op'), null);
    // Açık oturumun cevabı da aynı sayfayı taşır.
    assert.equal((await ben(cerez(await giris('acilis-mudur', PAROLA)))).acilisSayfasi, null);

    for (const yol of ['uretim-terminali', '/', '/Terminal', '/a//b', '/a/', 'javascript:alert(1)']) {
      await assert.rejects(
        vt().sorgu("UPDATE rol SET acilis_sayfasi = $1 WHERE kod = 'acilis_ayni'", [yol]),
        (h: { constraint?: string }) => h.constraint === 'rol_acilis_sayfasi_bicimi',
        yol,
      );
    }
  });

  test('yanlış parola ve olmayan kullanıcı aynı cevabı alır; deneme reddedilse de kaydedilir', async () => {
    await kisiEkle('yanlisci');
    const yanlis = await giris('yanlisci', 'yanlis-parola');
    const olmayan = await giris('boyle-biri-yok', 'yanlis-parola');
    assert.equal(yanlis.statusCode, 401);
    assert.equal(olmayan.statusCode, 401);
    assert.deepEqual(yanlis.json(), olmayan.json());
    assert.equal(yanlis.headers['set-cookie'], undefined);
    assert.deepEqual(await sonuclar('boyle-biri-yok'), ['hatali']);
  });

  test('saat verilmeyince veritabanı saati kullanılır: kayıt şimdiki zamanı taşır, taze hatalı seri bekletir', async () => {
    await kisiEkle('gercek-saat');
    await giris('gercek-saat', 'yanlis-parola');
    assert.deepEqual(
      await vt().sorgu("SELECT zaman <= now() AND zaman > now() - interval '1 minute' AS simdi FROM giris_denemesi WHERE kullanici_adi = 'gercek-saat'"),
      [{ simdi: true }],
    );
    // Altı hatalı denemenin beklemesi 32 sn: testin kendi süresi bunu tüketmez, sayı ölçülmez.
    await vt().sorgu("INSERT INTO giris_denemesi (kullanici_adi, sonuc, ip) SELECT 'gercek-saat', 'hatali', $1 FROM generate_series(1, 5)", [cihazIp]);
    const erken = await giris('gercek-saat', PAROLA);
    assert.equal(erken.statusCode, 401);
    assert.match(erken.json().mesaj, /^Çok sık deneme: hatalı denemeden sonra kısa bekleme kilidi var\. \d+ sn sonra yeniden deneyin; bu sürede doğru PIN ya da parola da kabul edilmez\.$/);
  });

  test('hatalı denemeden sonra bekleme dolmadan doğru parola da reddedilir ve kalan süreyi söyler; eşiğin altında hesap kilitlenmez, süre dolunca girer', async () => {
    await kisiEkle('bekleyen');
    assert.equal((await saatliGiris('bekleyen', PAROLA)).statusCode, 200);

    // Dördüncü hatalı denemenin beklemesi 8 sn: 1, 2, 4, 8.
    await hataliSeri('bekleyen', 4);
    const erken = await saatliGiris('bekleyen', PAROLA);
    assert.equal(erken.statusCode, 401);
    assert.equal(erken.json().mesaj, beklet(8));
    assert.equal(erken.headers['set-cookie'], undefined);

    ilerle(6);
    assert.equal((await saatliGiris('bekleyen', PAROLA)).json().mesaj, beklet(2));
    ilerle(1);
    assert.equal((await saatliGiris('bekleyen', PAROLA)).json().mesaj, beklet(1));
    // Bekleme sırasında reddedilen üç deneme sayılmadı: süre 8 sn'de kaldı.
    ilerle(1);
    assert.equal((await saatliGiris('bekleyen', PAROLA)).statusCode, 200);
    // Bekleme sırasında reddedilen deneme kayda da girmez.
    assert.deepEqual(await sonuclar('bekleyen'), ['basarili', 'hatali', 'hatali', 'hatali', 'hatali', 'basarili']);
  });

  test('bekleme reddi kullanıcı adının var olup olmadığını ele vermez: olmayan ad aynı cevabı alır, kayıt yazılmaz', async () => {
    await kisiEkle('var-olan');
    // İki seri aynı saatte yürür: son hatalı denemeleri aynı anda, kalan süreleri eşittir.
    for (let i = 0; i < 4; i += 1) {
      if (i > 0) ilerle(100);
      await hataliDene('var-olan', '10.0.1.1');
      await hataliDene('hic-olmayan', '10.0.1.1');
    }
    const var_ = await saatliGiris('var-olan', PAROLA, '10.0.1.1');
    const yok = await saatliGiris('hic-olmayan', PAROLA, '10.0.1.1');
    assert.equal(var_.statusCode, 401);
    assert.deepEqual(var_.json(), { kod: 'OTURUM_YOK', mesaj: beklet(8) });
    assert.deepEqual({ durum: yok.statusCode, govde: yok.json() }, { durum: var_.statusCode, govde: var_.json() });
    assert.deepEqual(await sonuclar('hic-olmayan'), ['hatali', 'hatali', 'hatali', 'hatali']);
  });

  test('bekleme 60 sn üst sınırını aşmaz: yedinci hatalı denemede de dokuzuncuda da 60 sn', async () => {
    await kisiEkle('ust-sinir');
    // Sınır olmasaydı yedinci denemenin beklemesi 64 sn olurdu.
    await hataliSeri('ust-sinir', 7);
    assert.equal((await saatliGiris('ust-sinir', PAROLA)).json().mesaj, beklet(60));
    ilerle(100);
    // Onuncu hatalı deneme hesabı kilitler (hesap-kilidi.test.ts); seri ondan önce kesilir.
    await hataliSeri('ust-sinir', 2);
    assert.equal((await saatliGiris('ust-sinir', PAROLA)).json().mesaj, beklet(60));
    ilerle(59);
    assert.equal((await saatliGiris('ust-sinir', PAROLA)).json().mesaj, beklet(1));
    ilerle(1);
    assert.equal((await saatliGiris('ust-sinir', PAROLA)).statusCode, 200);
  });

  test('doğru giriş hatalı deneme sayacını sıfırlar: sonraki bekleme baştan başlar', async () => {
    await kisiEkle('sayac');
    await hataliSeri('sayac', 3);
    ilerle(100);
    assert.equal((await saatliGiris('sayac', PAROLA)).statusCode, 200);

    await hataliSeri('sayac', 3);
    // Sıfırlanmasaydı altıncı hatalı denemenin beklemesi 32 sn olurdu.
    assert.equal((await saatliGiris('sayac', PAROLA)).json().mesaj, beklet(4));
    ilerle(4);
    assert.equal((await saatliGiris('sayac', PAROLA)).statusCode, 200);
  });

  test('bekleme kullanıcı adı ve cihaz çiftine özeldir: başka cihaz ve başka kullanıcı beklemez', async () => {
    await kisiEkle('cihaz');
    await kisiEkle('cihaz-komsu');
    await hataliSeri('cihaz', 4, '10.0.0.1');

    assert.equal((await saatliGiris('cihaz', PAROLA, '10.0.0.1')).json().mesaj, beklet(8));
    assert.equal((await saatliGiris('cihaz', PAROLA, '10.0.0.2')).statusCode, 200);
    assert.equal((await saatliGiris('cihaz-komsu', PAROLA, '10.0.0.1')).statusCode, 200);
    // Başka cihazdaki doğru giriş bu cihazın beklemesini silmez.
    assert.equal((await saatliGiris('cihaz', PAROLA, '10.0.0.1')).json().mesaj, beklet(8));
  });

  test('aynı çiftten havuzdan fazla eşzamanlı deneme beklemeyi atlatamaz ve havuzu doldurmaz: yalnız biri parolaya bakar, başka cihazdan başka kullanıcı girer', async () => {
    await kisiEkle('yarisan');
    await kisiEkle('yarisan-komsu');
    await hataliSeri('yarisan', 4);
    ilerle(100);
    await havuzuIsit();
    assert.equal(ES_ZAMANLI > HAVUZ_BOYUTU, true);
    const komsu = saatliGiris('yarisan-komsu', PAROLA, '10.0.1.2');
    const cevaplar = await Promise.all(Array.from({ length: ES_ZAMANLI }, () => saatliGiris('yarisan', 'yanlis-parola')));
    assert.equal((await komsu).statusCode, 200);

    // Parolaya bakan tek deneme hatalı cevabı alır; ötekiler ya o sürerken (429) ya da bittikten sonra (bekleme) reddedilir.
    const govdeler = cevaplar.map((c) => ({ durum: c.statusCode, ...(c.json() as { kod: string; mesaj: string }) }));
    assert.equal(govdeler.filter((g) => g.mesaj === HATALI_ILETI).length, 1, JSON.stringify(govdeler));
    for (const govde of govdeler) {
      assert.equal(
        [{ durum: 401, kod: 'OTURUM_YOK', mesaj: HATALI_ILETI }, { durum: 401, kod: 'OTURUM_YOK', mesaj: beklet(16) }, SURUYOR]
          .some((beklenen) => JSON.stringify(beklenen) === JSON.stringify(govde)),
        true,
        JSON.stringify(govde),
      );
    }
    assert.deepEqual(await sonuclar('yarisan'), ['hatali', 'hatali', 'hatali', 'hatali', 'hatali']);
    await havuzBosta();
  });

  test('süren deneme varken aynı cihazdan gelen havuzdan fazla istek beklemeden 429 alır: kişi kaydına ve parolaya bakılmaz, kayıt yazılmaz, olmayan ad ve başka kullanıcı ayırt edilmez; başka cihaz etkilenmez', async () => {
    await kisiEkle('suren');
    await kisiEkle('suren-komsu');
    await havuzuIsit();
    const istekler: Array<ReturnType<typeof saatliGiris>> = [];
    try {
      // Süren deneme: cihazın kilidini tutan açık transaction. İstekler o bitmeden cevaplanmalıdır.
      await vt().tx(async (db) => {
        assert.equal(await denemeKilidiAl(db, '10.0.2.1'), true);
        for (let i = 0; i < ES_ZAMANLI; i += 1) istekler.push(saatliGiris('suren', i % 2 === 0 ? PAROLA : 'yanlis-parola', '10.0.2.1'));
        istekler.push(saatliGiris('suren-olmayan', PAROLA, '10.0.2.1'));
        istekler.push(saatliGiris('suren-komsu', PAROLA, '10.0.2.1'));
        istekler.push(saatliGiris('suren', PAROLA, '10.0.2.2'));
        const cevaplar = await sureIcinde(Promise.all(istekler), 3000);
        const baskaCihaz = cevaplar.pop();
        assert.equal(baskaCihaz?.statusCode, 200);
        for (const cevap of cevaplar) {
          assert.deepEqual({ durum: cevap.statusCode, ...(cevap.json() as object) }, SURUYOR);
          assert.equal(cevap.headers['set-cookie'], undefined);
        }
        assert.equal(cevaplar.length, ES_ZAMANLI + 2);

        // Kişi tablosu kilitliyken de 429 hemen döner: o yol kişi kaydını okumaz, parolayı doğrulayamaz.
        await db.sorgu('LOCK TABLE kisi IN ACCESS EXCLUSIVE MODE');
        const kilitliyken = [
          ...Array.from({ length: ES_ZAMANLI }, (_bos, i) => saatliGiris('suren', i % 2 === 0 ? PAROLA : 'yanlis-parola', '10.0.2.1')),
          saatliGiris('suren-olmayan', PAROLA, '10.0.2.1'),
        ];
        istekler.push(...kilitliyken);
        for (const cevap of await sureIcinde(Promise.all(kilitliyken), 3000)) {
          assert.deepEqual({ durum: cevap.statusCode, ...(cevap.json() as object) }, SURUYOR);
        }
      });
    } finally {
      await Promise.allSettled(istekler);
    }
    // Kayıt düzeni çalışıyor (giren istek yazdı); 429 alan isteklerin hiçbiri yazmadı.
    assert.deepEqual(await sonuclar('suren-komsu'), []);
    assert.deepEqual(
      await vt().sorgu("SELECT kullanici_adi, ip, sonuc FROM giris_denemesi WHERE kullanici_adi IN ('suren', 'suren-olmayan') ORDER BY id"),
      [{ kullanici_adi: 'suren', ip: '10.0.2.2', sonuc: 'basarili' }],
    );
    await havuzBosta();
    // Süren deneme bitince aynı cihaz girer: 429 hesabı kilitlemez, bekleme de başlatmaz.
    assert.equal((await saatliGiris('suren', PAROLA, '10.0.2.1')).statusCode, 200);
    assert.equal((await saatliGiris('suren-komsu', PAROLA, '10.0.2.1')).statusCode, 200);
  });

  test('deneme kilidi şemaya özeldir: aynı veritabanındaki başka şemada süren aynı cihaz bu şemaya 429 verdirmez; aynı şemadaki verdirir', async () => {
    const baska = await testSemasiAc('oturum_baska');
    try {
      assert.notEqual(baska.sema, ortam?.sema);
      await baska.vt.tx(async (baskaDb) => {
        assert.equal(await denemeKilidiAl(baskaDb, '10.0.3.1'), true);
        const cevap = await sureIcinde(Promise.resolve(saatliGiris('sema-ortak', 'yanlis-parola', '10.0.3.1')), 3000);
        assert.deepEqual({ durum: cevap.statusCode, mesaj: cevap.json().mesaj }, { durum: 401, mesaj: HATALI_ILETI });
        await vt().tx(async (db) => {
          assert.equal(await denemeKilidiAl(db, '10.0.3.1'), true);
          const ayniSema = await sureIcinde(Promise.resolve(saatliGiris('sema-ortak', 'yanlis-parola', '10.0.3.1')), 3000);
          assert.deepEqual({ durum: ayniSema.statusCode, ...(ayniSema.json() as object) }, SURUYOR);
        });
      });
    } finally {
      await baska.kaldir();
    }
  });

  test('1373 a: bir yıldan eski deneme kaydı parolaya bakılan giriş denemesinde silinir, bekleme reddinde silinmez; 31 günlük ve yenisi kalır; silme zaman indeksiyle bulur', async () => {
    await hataliSeri('temizlik-bekleyen', 4);
    // Silmeyi veritabanı kendi saatiyle de denetler; test saati ondan ileridedir. Eski satır veritabanı
    // saatine göre eski (iki saate göre de eski), yeni satır test saatine göre yeni (iki saate göre de yeni) kurulur.
    await vt().sorgu(
      `INSERT INTO giris_denemesi (kullanici_adi, sonuc, ip, zaman) VALUES
         ('eski-kayit', 'hatali', '10.0.0.9', now() - interval '365 days 1 hour'),
         ('orta-kayit', 'hatali', '10.0.0.9', now() - interval '31 days'),
         ('yeni-kayit', 'hatali', '10.0.0.9', $1::timestamptz - interval '364 days 23 hours')`,
      [saat],
    );
    assert.deepEqual(await sonuclar('eski-kayit'), ['hatali']);
    // Bekleme reddi hiçbir şey yazmaz: temizlik de o istekte koşmaz.
    assert.equal((await saatliGiris('temizlik-bekleyen', PAROLA)).json().mesaj, beklet(8));
    assert.deepEqual(await sonuclar('eski-kayit'), ['hatali']);
    await hataliDene('temizlik-tetikleyen');
    assert.deepEqual(await sonuclar('eski-kayit'), []);
    assert.deepEqual(await sonuclar('orta-kayit'), ['hatali']);
    assert.deepEqual(await sonuclar('yeni-kayit'), ['hatali']);

    const indeks = await vt().sorgu(
      `SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
        WHERE i.indrelid = 'giris_denemesi'::regclass AND a.attname = 'zaman'`,
    );
    assert.equal(indeks.length, 1);
  });

  test('398 a: zamanlanmış iş, kapanışının üzerinden 30 gün geçen oturumun yalnız adresini ve tarayıcısını boşaltır; satır ve öbür alanlar kalır, genç oturum değişmez; giriş temizlik yapmaz', async () => {
    const tanim = (await modulIsleriniKesfet()).find((i) => i.ad === 'oturum-cihaz-temizligi');
    if (!tanim) throw new Error('iş yok');
    assert.equal(tanim.aralikMs, 60 * 60 * 1000);
    const kisiId = await kisiEkle('cihaz-temizligi');
    // Kapanış anı: kapatıldıysa kapandi, kapatılmadıysa hareketsizlik ya da azami sürenin dolduğu an.
    await vt().sorgu(
      `INSERT INTO oturum (anahtar_ozeti, kisi_id, acildi, son_gorulme, kapandi, ip, tarayici) VALUES
         ('temizlik-kapali-eski', $1, now() - interval '40 days', now() - interval '31 days', now() - interval '30 days 1 hour', '192.0.2.21', 'Deneme/1'),
         ('temizlik-suresi-dolmus', $1, now() - interval '40 days', now() - interval '30 days 13 hours', NULL, '192.0.2.22', 'Deneme/2'),
         ('temizlik-kapali-genc', $1, now() - interval '35 days', now() - interval '30 days', now() - interval '29 days 23 hours', '192.0.2.23', 'Deneme/3'),
         ('temizlik-acik', $1, now(), now(), NULL, '192.0.2.24', 'Deneme/4')`,
      [kisiId],
    );
    const oku = () => vt().sorgu<{ ozet: string; kisi: number; acildi: string; kapandi: string | null; ip: string | null; tarayici: string | null }>(
      `SELECT anahtar_ozeti AS ozet, kisi_id AS kisi, acildi::text AS acildi, kapandi::text AS kapandi, ip, tarayici
         FROM oturum WHERE anahtar_ozeti LIKE 'temizlik-%' ORDER BY anahtar_ozeti`,
    );
    const once = await oku();
    // Giriş oturum tablosuna eski satırlar için dokunmaz: girişin kilit sırası değişmez.
    await hataliDene('cihaz-temizligi-tetikleyen');
    assert.deepEqual(await oku(), once);
    assert.equal(await isiBirKezCalistir(vt(), tanim), 'tamam');
    const sonra = await oku();
    assert.equal(sonra.length, 4);
    assert.deepEqual(sonra.map((o) => [o.ozet, o.ip, o.tarayici]), [
      ['temizlik-acik', '192.0.2.24', 'Deneme/4'],
      ['temizlik-kapali-eski', null, null],
      ['temizlik-kapali-genc', '192.0.2.23', 'Deneme/3'],
      ['temizlik-suresi-dolmus', null, null],
    ]);
    assert.deepEqual(sonra.map(({ ozet, kisi, acildi, kapandi }) => ({ ozet, kisi, acildi, kapandi })),
      once.map(({ ozet, kisi, acildi, kapandi }) => ({ ozet, kisi, acildi, kapandi })));
  });

  test('temizlik saklama süresi dolmamış satıra dokunmaz: sınırdaki genç satır varken giriş veritabanı korumasına takılmaz, eski satır silinir', async () => {
    await kisiEkle('sinirdaki');
    // Temizlik genç satıra uzansaydı veritabanı silmeyi reddeder, giriş 500 dönerdi. Genç satır silinemediği için
    // dosyanın sonuna dek kalır: test saatine bir saat pay bırakılır, yoksa sonraki saatli girişler ona takılır.
    await vt().sorgu(
      `INSERT INTO giris_denemesi (kullanici_adi, sonuc, ip, zaman) VALUES
         ('sinir-eski', 'hatali', '10.0.4.1', now() - interval '365 days 1 minute'),
         ('sinir-genc', 'hatali', '10.0.4.1', $1::timestamptz - interval '29 days 23 hours')`,
      [saat],
    );
    await assert.rejects(
      vt().sorgu("DELETE FROM giris_denemesi WHERE kullanici_adi = 'sinir-genc'"),
      /giris_denemesi tablosundan yalnız 30 günden eski satır silinir/,
    );

    // Üretim yolu: saat verilmez, temizlik ve koruma aynı veritabanı saatine bakar.
    const hatali = await giris('sinirdaki', 'yanlis-parola', '10.0.4.2');
    assert.deepEqual({ durum: hatali.statusCode, mesaj: hatali.json().mesaj }, { durum: 401, mesaj: HATALI_ILETI });
    assert.deepEqual(await sonuclar('sinir-eski'), []);
    assert.deepEqual(await sonuclar('sinir-genc'), ['hatali']);

    assert.equal((await giris('sinirdaki', PAROLA, '10.0.4.3')).statusCode, 200);
    assert.equal((await saatliGiris('sinirdaki', PAROLA, '10.0.4.4')).statusCode, 200);
    assert.deepEqual(await sonuclar('sinir-genc'), ['hatali']);
    assert.deepEqual(await sonuclar('sinirdaki'), ['hatali', 'basarili', 'basarili']);
  });

  test('çıkış oturumu kapatır ve çerezi siler', async () => {
    const cerezi = cerez(await giris('yonetici', PAROLA));
    const cikis = await app.inject({ method: 'POST', url: '/api/oturum/cikis', headers: { cookie: cerezi } });
    assert.equal(cikis.statusCode, 204);
    assert.match(String(cikis.headers['set-cookie']), new RegExp(`^${CEREZ_ADI}=; Path=/; Max-Age=0;`));
    assert.equal(await ben(cerezi), null);
  });

  test('çıkış başkasının oturumunu kapatamaz: çerezsiz ya da bilinmeyen çerezle çıkış açık oturuma dokunmaz', async () => {
    const acik = cerez(await giris('yonetici', PAROLA));
    const cerezsiz = await app.inject({ method: 'POST', url: '/api/oturum/cikis' });
    assert.equal(cerezsiz.statusCode, 204);
    const yabanci = await app.inject({ method: 'POST', url: '/api/oturum/cikis', headers: { cookie: `${CEREZ_ADI}=bilinmeyen-anahtar` } });
    assert.equal(yabanci.statusCode, 204);
    assert.notEqual(await ben(acik), null);
  });

  test('8 saat hareketsiz kalan ve 7 günü dolan oturum geçersizdir (2226-3)', async () => {
    const bosta = cerez(await giris('yonetici', PAROLA));
    const eski = cerez(await giris('yonetici', PAROLA));
    const sonIki = await vt().sorgu<{ id: number }>('SELECT id FROM oturum ORDER BY id DESC LIMIT 2');
    const [eskiId, bostaId] = sonIki.map((s) => s.id);

    await vt().sorgu("UPDATE oturum SET son_gorulme = now() - interval '7 hours 59 minutes' WHERE id = $1", [bostaId]);
    assert.notEqual(await ben(bosta), null);
    const tazelendi = await vt().tek<{ taze: boolean }>("SELECT son_gorulme > now() - interval '1 minute' AS taze FROM oturum WHERE id = $1", [bostaId]);
    assert.equal(tazelendi?.taze, true);

    await vt().sorgu("UPDATE oturum SET son_gorulme = now() - interval '8 hours 1 minute' WHERE id = $1", [bostaId]);
    assert.equal(await ben(bosta), null);

    await vt().sorgu("UPDATE oturum SET acildi = now() - interval '7 days 1 minute' WHERE id = $1", [eskiId]);
    assert.equal(await ben(eski), null);
  });

  test('pasife alınan kişi giremez ve açık oturumu düşer', async () => {
    const id = await kisiEkle('pasif');
    const cerezi = cerez(await giris('pasif', PAROLA));
    assert.notEqual(await ben(cerezi), null);
    await vt().sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [id]);
    assert.equal(await ben(cerezi), null);
    assert.equal((await giris('pasif', PAROLA)).statusCode, 401);
  });

  test('denetim: giriş komutu parolasız kaydedilir; kayıt değiştirilemez ve silinemez', async () => {
    await giris('yonetici', PAROLA);
    const kayit = await vt().tek<{ id: number; yol: string; govde: Record<string, unknown> }>(
      "SELECT id, yol, govde FROM denetim_kaydi WHERE yol = '/oturum/giris' ORDER BY id DESC LIMIT 1",
    );
    assert.equal(kayit?.yol, '/oturum/giris');
    assert.deepEqual(kayit?.govde, { kullaniciAdi: 'yonetici', parola: '[gizli]' });

    const tumu = await vt().tek<{ metin: string }>('SELECT string_agg(govde::text, \' \') AS metin FROM denetim_kaydi');
    assert.equal(tumu?.metin.includes(PAROLA), false);

    await assert.rejects(vt().sorgu('UPDATE denetim_kaydi SET yol = $1 WHERE id = $2', ['/baska', kayit?.id]), /yalnız ekleme/);
    await assert.rejects(vt().sorgu('DELETE FROM denetim_kaydi WHERE id = $1', [kayit?.id]), /yalnız ekleme/);
    // Uygulama kullanıcısını boşaltmadan yetki alıkoyar; tetikleyici, hakkı olan sahibi de durdurur.
    await assert.rejects(vt().sorgu('TRUNCATE denetim_kaydi'), izinYok);
    await assert.rejects(sahip().sorgu('TRUNCATE denetim_kaydi'), /yalnız ekleme/);
  });

  test('veritabanı kısıtları: giriş bilgisi yarım olamaz, kullanıcı adı tekrar edemez', async () => {
    await assert.rejects(vt().sorgu("INSERT INTO kisi (ad, kullanici_adi) VALUES ('Yarım', 'yarim')"), /kisi_giris_butun/);
    await assert.rejects(
      vt().tx((db) => yoneticiOlustur(db, { ad: 'İkinci', kullaniciAdi: 'YONETICI', parola: PAROLA })),
      /kullanılıyor/,
    );
    await vt().sorgu("INSERT INTO kisi (ad) VALUES ('Hesapsız Personel')");
  });

  test('girişi olan kişinin en az bir rolü olur: rolsüz hesap açılamaz, son rol alınamaz; fazlası alınabilir', async () => {
    const rolsuz = (hata: unknown): boolean => {
      assert.deepEqual(
        { kod: (hata as { code?: unknown }).code, kisit: (hata as { constraint?: unknown }).constraint },
        { kod: '23514', kisit: 'kisi_giris_rol_ister' },
        String(hata),
      );
      return true;
    };
    await assert.rejects(vt().sorgu("INSERT INTO kisi (ad, kullanici_adi, parola_ozeti) VALUES ('Rolsüz', 'rolsuz', 'x')"), rolsuz);
    assert.deepEqual(await vt().sorgu("SELECT 1 FROM kisi WHERE kullanici_adi = 'rolsuz'"), []);

    // Aynı transaction içinde kişi önce, rolü sonra yazılabilir.
    const operator = await rolId('operator');
    const id = await vt().tx(async (db) => {
      const kisi = await db.tek<{ id: number }>("INSERT INTO kisi (ad, kullanici_adi, parola_ozeti) VALUES ('Sıralı', 'sirali', 'x') RETURNING id");
      if (!kisi) throw new Error('kişi eklenemedi');
      await db.sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2)', [kisi.id, operator]);
      return kisi.id;
    });

    await assert.rejects(vt().sorgu('DELETE FROM kisi_rolu WHERE kisi_id = $1', [id]), rolsuz);
    await vt().sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2)', [id, await rolId('planlama_proje')]);
    await vt().sorgu('DELETE FROM kisi_rolu WHERE kisi_id = $1 AND rol_id = $2', [id, operator]);
    await assert.rejects(vt().sorgu('DELETE FROM kisi_rolu WHERE kisi_id = $1', [id]), rolsuz);
    assert.equal((await vt().sorgu('SELECT 1 FROM kisi_rolu WHERE kisi_id = $1', [id])).length, 1);

    // Girişi olmayan personel rol istemez; giriş verilince ister.
    const personel = await vt().tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Rolsüz Personel') RETURNING id");
    await assert.rejects(
      vt().sorgu("UPDATE kisi SET kullanici_adi = 'sonradan', parola_ozeti = 'x' WHERE id = $1", [personel?.id]),
      rolsuz,
    );
    // Boşaltma satır tetikleyicisini atlar; ayrıca reddedilir, roller yerinde kalır.
    const oncesi = (await vt().sorgu('SELECT 1 FROM kisi_rolu')).length;
    await assert.rejects(vt().sorgu('TRUNCATE kisi_rolu'), izinYok);
    await assert.rejects(sahip().sorgu('TRUNCATE kisi_rolu'), rolsuz);
    assert.equal(oncesi > 0, true);
    assert.equal((await vt().sorgu('SELECT 1 FROM kisi_rolu')).length, oncesi);

    // Kişi silinince rolleri de gider; kural silinen kişiyi aramaz.
    await vt().sorgu('DELETE FROM kisi WHERE id = $1', [id]);
  });
});
