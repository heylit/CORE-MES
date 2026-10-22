import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { operatorOzetiCevabi } from '#paylasilan/sozlesme/arkon.ts';
import type { OperatorOzetiCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { operatorOzeti } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const SAAT = 3_600_000;

interface Cevap<T = unknown> { durum: number; govde: T }

describe('arkon operatör özeti (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  let yonetici = '';
  let sayac = 0;
  let gunBasi = 0;
  let simdi = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const sahip = (): TestVeritabani['sahip'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.sahip;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function istek<T = unknown>(cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`,
      headers: { ...(cerez ? { cookie: cerez } : {}), ...(yontem === 'POST' && (yol === '/uretim-emirleri' || yol.endsWith('/sayim')) ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }

  async function kisiKur(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const gecici = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]);
    if (!yoneticiRolu || !gecici) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici.id, islem]);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, gecici.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }

  interface Ortam { merkezId: number; istasyonId: number; makineler: number[] }

  // Tüm hafta, tüm gün açık tek vardiya: net aktif süre gün başından şimdiye kadar geçen süredir.
  async function ortamKur(makineSayisi: number, aralik: { vardiya: boolean } = { vardiya: true }): Promise<Ortam> {
    const merkez = await istek<{ id: number }>(yonetici, 'POST', '/is-merkezleri', { kod: `AM${(sayac += 1)}`, ad: 'Anomali merkezi' });
    const ist = await istek<{ id: number }>(yonetici, 'POST', '/istasyonlar', { kod: `AI${(sayac += 1)}`, ad: 'Anomali istasyonu', isMerkeziId: merkez.govde.id, tip: 'talasli' });
    assert.equal(ist.durum, 200, JSON.stringify(ist.govde));
    const makineler: number[] = [];
    for (let i = 0; i < makineSayisi; i += 1) {
      makineler.push((await sahip().tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`AK${(sayac += 1)}`, 'Tezgah', ist.govde.id]))!.id);
    }
    if (aralik.vardiya) {
      const vardiya = (await sahip().tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ($1, '00:00', '23:59') RETURNING id", [`Gün ${(sayac += 1)}`]))!.id;
      await sahip().sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) SELECT $1, g, $2 FROM generate_series(1, 7) g', [merkez.govde.id, vardiya]);
    }
    return { merkezId: merkez.govde.id, istasyonId: ist.govde.id, makineler };
  }

  // Tek adımlı rotalı emir (adım makinede) ve canlı planda `bas`-`bit` saatleri arasına yerleşimi.
  async function isEmriKur(makineId: number, secenek: { adet?: number; birimSureDk: string; bas: number; bit: number }): Promise<{ emirId: number; isEmriId: number }> {
    sayac += 1;
    const tip = (await sahip().tek<{ id: number }>('INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, $2, $3) RETURNING id', [`AT${sayac}`, 'Deneme tipi', 'TAL']))!.id;
    await sahip().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ANM-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = (await sahip().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'ANM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`anm-${sayac}`, sayac, JSON.stringify({ id: `anm-${sayac}`, com: { ad: `Anomali ${sayac}` } }), yoneticiId],
    ))!.no;
    await sahip().sorgu("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2)", [kart, yoneticiId]);
    const revizyon = (await sahip().tek<{ id: number }>("SELECT id FROM rota_revizyonu WHERE malzeme_id = $1 AND harf = 'A'", [kart]))!.id;
    const { uretimEmriId } = await vt().tx(async (db) => uretimEmriAc(db, (await kullaniciYukle(db, yoneticiId))!, {
      projeId: denemeProjeId, malzemeNo: kart, adet: secenek.adet ?? 500, teslim: null, kaynakRotaRevizyonId: revizyon,
      isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: makineId }, ayarSuresiDk: '0', birimSureDk: secenek.birimSureDk,
        terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      }],
    }));
    const isEmriId = (await sahip().tek<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1', [uretimEmriId]))!.id;
    await sahip().sorgu(
      `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, kisi_id, baslangic, bitis, yazan_kisi_id)
       VALUES ($1, $2, NULL, to_timestamp($3::double precision / 1000), to_timestamp($4::double precision / 1000), $5)`,
      [isEmriId, makineId, gunBasi + secenek.bas * SAAT, gunBasi + secenek.bit * SAAT, yoneticiId],
    );
    return { emirId: uretimEmriId, isEmriId };
  }

  const kisiAta = (makineId: number, kisiId: number): Promise<unknown> => sahip().sorgu(
    "INSERT INTO makine_kisi (makine_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2000-01-01', 50)", [makineId, kisiId]);

  // Sayım defteri yalnız eklenir; testte zamanı seçmek için sahip bağlantısıyla doğrudan yazılır (gün başından `saat` saat sonra).
  const sayimYaz = (emirId: number, kisiId: number, istasyonId: number, saat: number, adet: number): Promise<unknown> => sahip().sorgu(
    `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, zaman)
     VALUES ($1, $2, $3, 'saglam', $4, to_timestamp($5::double precision / 1000))`, [emirId, kisiId, istasyonId, adet, gunBasi + saat * SAAT]);

  const ozet = async (cerez: string | null, sorgu = ''): Promise<Cevap<OperatorOzetiCevabi>> => istek<OperatorOzetiCevabi>(cerez, 'GET', `/arkon/operator-ozeti${sorgu}`);
  const hesapla = (kisiId: number, sorgu: Parameters<typeof operatorOzeti>[2] = { donem: 'gun' }): Promise<OperatorOzetiCevabi> =>
    vt().tx(async (db) => operatorOzeti(db, (await kullaniciYukle(db, kisiId))!, sorgu, simdi));
  const isMerkeziKisitla = (kisiId: number, merkezId: number): Promise<unknown> =>
    sahip().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisiId, merkezId]);

  before(async () => {
    ortam = await testVeritabaniKur('arkonozet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ARKON.OO', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    yonetici = await girisCerezi('yonetici');
    gunBasi = tesisGunBasi(tesisGunu(Date.now()));
    simdi = gunBasi + 10 * SAAT;
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('operatör yalnız kendi özetini görür: başkası 403, cevapta başka kişinin adı yok; Arkon operatörü ya da amiri olmayan 403, oturumsuz 401', async () => {
    const o = await ortamKur(1);
    const ben = await kisiKur(`ozop${(sayac += 1)}`, ['arkon.operator', 'sayfa.uretim-terminali']);
    const komsu = await kisiKur(`ozop${(sayac += 1)}`, ['arkon.operator', 'sayfa.uretim-terminali']);
    await kisiAta(o.makineler[0]!, ben.id);
    await kisiAta(o.makineler[0]!, komsu.id);
    const ie = await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 0, bit: 23 });
    const hurdaNedeni = (await sahip().tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('OZ-H1', 'Deneme hurdası', 901) RETURNING id"))!.id;
    // Sayım günün ortasına yazılır ve sayılar sabit "şimdi" ile okunur: uç gerçek saati kullanır, gece yarısından hemen sonra
    // "şimdiden bir dakika önce" dünün gününe düşüyordu.
    await sahip().sorgu(`INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, zaman) VALUES
      ($1, $2, $4, 'saglam', 18, NULL, $6), ($1, $2, $4, 'hurda', 2, $5, $6), ($1, $3, $4, 'saglam', 99, NULL, $6)`,
    [ie.emirId, ben.id, komsu.id, o.istasyonId, hurdaNedeni, new Date(gunBasi + 2 * SAAT)]);
    const hesap = await hesapla(ben.id);
    assert.deepEqual([hesap.kisi.id, hesap.saglam, hesap.hurda, hesap.kalite], [ben.id, 18, 2, 0.9]);

    const kendi = await ozet(ben.cerez);
    assert.equal(kendi.durum, 200, JSON.stringify(kendi.govde));
    assert.equal(operatorOzetiCevabi.safeParse(kendi.govde).success, true);
    assert.equal(kendi.govde.kisi.id, ben.id);
    assert.deepEqual(kendi.govde.ekip, [], 'operatöre kişi listesi gelmez');
    assert.deepEqual(kendi.govde.yetkiler.makineler.map((m) => m.id), [o.makineler[0]], 'makine ataması yetkili makinedir');
    assert.deepEqual(kendi.govde.yetkiler.istasyonlar, [], 'istasyon ataması yok');
    await sahip().sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2)', [ben.id, o.istasyonId]);
    assert.deepEqual((await ozet(ben.cerez)).govde.yetkiler.istasyonlar.map((i) => i.id), [o.istasyonId], 'Reçete ve Rota yetkinliği de yetkili istasyondur');
    // Soru 30: istasyon ataması olmayan kişi takvimi makine atamasının istasyonundan alır; İK kaydı yoksa fazla mesai ve izin boştur.
    assert.ok(kendi.govde.mesailer !== null && kendi.govde.mesailer.length > 0, 'makine ataması mesai takvimi verir');
    assert.deepEqual([kendi.govde.fazlaMesai, kendi.govde.izinler], [null, null], 'İK kaydı yoksa boş, sıfır uydurulmaz');
    assert.ok(typeof kendi.govde.emekVerimi.mesaiSn === 'number' && typeof kendi.govde.emekVerimi.oran === 'number', 'makine atamasının takvimiyle emek verimi hesaplanır');
    assert.equal(JSON.stringify(kendi.govde).includes(`ozop${sayac}`), false);

    assert.equal((await ozet(ben.cerez, `?kisiId=${komsu.id}`)).durum, 403);
    assert.equal((await ozet(ben.cerez, `?kisiId=${ben.id}`)).durum, 200);
    const kalite = await kisiKur(`ozkl${(sayac += 1)}`, ['arkon.kalite', 'sayfa.uretim-terminali']);
    assert.equal((await ozet(kalite.cerez)).durum, 403);
    assert.equal((await ozet(null)).durum, 401);
    const sayfasiz = await kisiKur(`ozss${(sayac += 1)}`, ['arkon.operator']);
    assert.equal((await ozet(sayfasiz.cerez)).durum, 403, 'Üretim Terminali sayfası olmayan okuyamaz');
    assert.equal((await ozet(ben.cerez, '?donem=yil')).durum, 400);
  });

  test('mesai Vardiya takviminden 7 gün; fazla mesai ve izin İK kaydından: toplam, yıllık sınır, bekleyen; reddedilen izin gelmez', async () => {
    const o = await ortamKur(0);
    const ben = await kisiKur(`ozop${(sayac += 1)}`, ['arkon.operator', 'sayfa.uretim-terminali']);
    await sahip().sorgu("INSERT INTO istasyon_kisi (istasyon_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2000-01-01', 100)", [o.istasyonId, ben.id]);
    const bugun = tesisGunu(simdi);
    const ileri = (gun: number): string => tesisGunu(tesisGunBasi(bugun) + (gun * 24 + 12) * SAAT);
    const personel = (await sahip().tek<{ no: number }>(
      `INSERT INTO ik_personel (kimlik, ad, soyad, kisi_id, is_merkezi_id, ise_giris, dogum_tarihi, olusturan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'Deneme', 'Personel', $2, $4, '2020-01-15', '1990-05-01', $3, $3) RETURNING no`, [`emp_oz${sayac}`, ben.id, yoneticiId, o.merkezId]))!.no;
    const devam = (n: number, saat: number, onay: string): Promise<unknown> => sahip().sorgu(
      `INSERT INTO ik_devam (kimlik, personel_no, tarih, tur, saat, onay, olusturan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, $3, 'Fazla mesai', $4, $5, $6, $6)`, [`att_oz${sayac}_${n}`, personel, bugun, saat, onay, yoneticiId]);
    await devam(1, 3, 'Onaylandı');
    await devam(2, 2, 'Beklemede');
    const izin = (n: number, durum: string): Promise<unknown> => sahip().sorgu(
      `INSERT INTO ik_izin (kimlik, personel_no, tur, baslangic, bitis, gun, durum, olusturan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'Yıllık izin', $3, $4, 2, $5, $6, $6)`, [`leave_oz${sayac}_${n}`, personel, ileri(10), ileri(11), durum, yoneticiId]);
    await izin(1, 'Beklemede');
    await izin(2, 'Reddedildi');

    const c = await hesapla(ben.id);
    assert.deepEqual(operatorOzetiCevabi.safeParse(c).error?.issues, undefined);
    assert.deepEqual(c.mesailer?.map((m) => m.tarih), Array.from({ length: 7 }, (_, i) => ileri(i)));
    assert.ok(c.mesailer?.every((m) => m.baslangic !== null && m.dakika > 0), 'tüm hafta açık vardiya');
    assert.deepEqual(
      [c.fazlaMesai?.aySaat, c.fazlaMesai?.yilSaat, c.fazlaMesai?.bekleyenSaat, c.fazlaMesai?.yillikSinirSaat, c.fazlaMesai?.satirlar.length],
      [5, 5, 2, 270, 2],
    );
    assert.deepEqual(c.izinler?.yaklasan, [{ tur: 'Yıllık izin', baslangic: ileri(10), bitis: ileri(11), gun: 2, durum: 'Beklemede' }]);
    assert.equal(typeof c.izinler?.kalanGun, 'number');
    assert.equal(c.izinler?.bekleyenGun, 2);
    // Gün boyu vardiya, sayım yok: mesai gün başından şimdiye (10 saat) + onaylı fazla mesai (3 saat; bekleyen 2 saat girmez), standart 0,
    // oran 0 (boş değil: mesai biliniyor). Hesap Anomali ile ortak (`emekVerimleri`).
    assert.deepEqual(c.emekVerimi, { oran: 0, standartSn: 0, mesaiSn: 13 * 3600 });
  });

  test('amir yalnız kendi iş merkezindeki kişileri salt okur; başka iş merkezindeki 403', async () => {
    const a = await ortamKur(1);
    const b = await ortamKur(1);
    const amir = await kisiKur(`ozam${(sayac += 1)}`, ['arkon.amir', 'sayfa.uretim-terminali']);
    await isMerkeziKisitla(amir.id, a.merkezId);
    const buradaki = await kisiKur(`ozop${(sayac += 1)}`, ['arkon.operator', 'sayfa.uretim-terminali']);
    const oradaki = await kisiKur(`ozop${(sayac += 1)}`, ['arkon.operator', 'sayfa.uretim-terminali']);
    await kisiAta(a.makineler[0]!, buradaki.id);
    await kisiAta(b.makineler[0]!, oradaki.id);

    const kendi = await ozet(amir.cerez);
    assert.equal(kendi.durum, 200, JSON.stringify(kendi.govde));
    const ekip = kendi.govde.ekip.map((k) => k.id);
    assert.ok(ekip.includes(buradaki.id));
    assert.equal(ekip.includes(oradaki.id), false);
    const izin = await ozet(amir.cerez, `?kisiId=${buradaki.id}&donem=hafta`);
    assert.equal(izin.durum, 200, JSON.stringify(izin.govde));
    assert.equal(izin.govde.kisi.id, buradaki.id);
    assert.equal(izin.govde.donem, 'hafta');
    assert.equal((await ozet(amir.cerez, `?kisiId=${oradaki.id}`)).durum, 403);
    // Başka iş merkezindeki operatör amirin kişisini de göremez.
    const oradakiCerez = await girisCerezi(`ozop${sayac}`);
    assert.equal((await ozet(oradakiCerez, `?kisiId=${buradaki.id}`)).durum, 403);
  });

  test('kaydı olmayan kişide sayılar boş, sıfır uydurulmaz; son 7 gün boş, rozet yok, başarı yok', async () => {
    const kisi = await kisiKur(`ozbos${(sayac += 1)}`, ['arkon.operator']);
    for (const donem of ['gun', 'hafta', 'ay'] as const) {
      const s = await hesapla(kisi.id, { donem });
      assert.deepEqual([s.saglam, s.hurda, s.kalite, s.calismaSn, s.saatlikSaglam, s.basari, s.ekipOrtalamasi], [null, null, null, null, null, null, null], donem);
      assert.equal(s.gunler.length, 7);
      assert.ok(s.gunler.every((g) => g.saglam === null && g.hurda === null));
      assert.deepEqual(s.rozetler, []);
      assert.equal(s.bitis, tesisGunu(simdi));
    }
  });

  test('başarı plana göre (bugün); isimsiz ekip ortalaması aynı iş merkezinde en az 3 kişiyle gelir, 2 kişide boş', async () => {
    const o = await ortamKur(3);
    const kisiler = [];
    for (const m of o.makineler) {
      const k = await kisiKur(`ozek${(sayac += 1)}`, ['arkon.operator']);
      await kisiAta(m, k.id);
      kisiler.push({ ...k, ie: await isEmriKur(m, { birimSureDk: '2', bas: 8, bit: 12 }) });
    }
    // 8:00-10:00 = 120 dk: makine başına beklenen 60.
    const uret = [30, 60, 45];
    for (const [i, k] of kisiler.entries()) await sayimYaz(k.ie.emirId, k.id, o.istasyonId, 9, uret[i]!);
    const s = await hesapla(kisiler[0]!.id);
    assert.deepEqual(s.basari, { uretilen: 30, beklenen: 60, oran: 0.5, eksikGun: 0, standartla: 0 });
    assert.equal(s.ekipOrtalamasi, 0.75, '(0.5 + 1 + 0.75) / 3');
    assert.equal(JSON.stringify(s).includes(`ozek${sayac}`), false, 'ekipten ad gelmez');
    const hafta = await hesapla(kisiler[0]!.id, { donem: 'hafta' });
    assert.deepEqual(hafta.basari, s.basari, 'haftanın öteki günlerinde kayıt yok');
    assert.equal(hafta.ekipOrtalamasi, null, 'ekip ortalaması yalnız bugün');

    await sahip().sorgu('DELETE FROM makine_kisi WHERE kisi_id = $1', [kisiler[2]!.id]);
    assert.equal((await hesapla(kisiler[0]!.id)).ekipOrtalamasi, null, '2 kişi: ortalama gösterilmez');
  });

  test('geçmiş gün plana göre beklenir; dönemin işleri, hurda nedenleri ve standart verim gelir', async () => {
    const o = await ortamKur(1);
    const k = await kisiKur(`ozgc${(sayac += 1)}`, ['arkon.operator']);
    await kisiAta(o.makineler[0]!, k.id);
    // Dün 08:00-12:00 planlı, birim süre 2 dk: dünün beklenen adedi 240 / 2 = 120.
    const ie = await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: -16, bit: -12 });
    const neden = (await sahip().tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('OZ-H2', 'Ölçü dışı', 902) RETURNING id"))!.id;
    await sahip().sorgu(`INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, zaman) VALUES
      ($1, $2, $3, $4, 'saglam', 50, NULL, to_timestamp($5::double precision / 1000)),
      ($1, $2, $3, $4, 'hurda', 2, $6, to_timestamp($7::double precision / 1000))`,
    [ie.emirId, ie.isEmriId, k.id, o.istasyonId, gunBasi - 15 * SAAT, neden, gunBasi + 9 * SAAT]);
    await sahip().sorgu(`INSERT INTO uretim_emirleri_katilim (emir_id, is_emri_id, kisi_id, istasyon_id, giris, cikis, kapanis) VALUES
      ($1, $2, $3, $4, to_timestamp($5::double precision / 1000), to_timestamp($6::double precision / 1000), 'ayril')`, [ie.emirId, ie.isEmriId, k.id, o.istasyonId, gunBasi - 16 * SAAT, gunBasi - 14 * SAAT]);

    const s = await hesapla(k.id, { donem: 'ay' });
    const dun = s.gunler.find((g) => g.tarih === tesisGunu(gunBasi - SAAT))!;
    assert.deepEqual([dun.saglam, dun.beklenen], [50, 120]);
    const bugun = await hesapla(k.id, { donem: 'gun' });
    assert.deepEqual(bugun.hurdaNedenleri, [{ kod: 'OZ-H2', ad: 'Ölçü dışı', adet: 2 }]);
    assert.equal(bugun.isler.length, 1, 'bugün yalnız hurda girdi');
    assert.deepEqual([bugun.isler[0]!.saglam, bugun.isler[0]!.hurda], [null, 2]);
    if (tesisGunu(gunBasi - SAAT).slice(0, 7) === tesisGunu(gunBasi).slice(0, 7)) {
      // Dün bu aydaysa: ayın başarısı dünün planıyla gelir (bugün planı yok), işi ve standart verimi dönemde görünür.
      assert.deepEqual(s.basari, { uretilen: 50, beklenen: 120, oran: 0.42, eksikGun: 0, standartla: 0 }, 'bugünün planı 0: yerleşim dün bitti');
      assert.equal(s.isler[0]?.saglam, 50);
      assert.equal(s.isler[0]?.saniye, 7200);
      assert.deepEqual(s.verim, { oran: 0.83, suresizSaglam: 0 }, '50 x 2 dk = 100 dk / 120 dk');
    }
  });
});
