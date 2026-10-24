import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { anomaliCevabi, anomaliIstatistikCevabi } from '#paylasilan/sozlesme/arkon.ts';
import type { AnomaliCevabi, AnomaliIstatistikCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, emirSayim, kararliSayimiSonuclandir, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { gunEkle } from './kurallar.ts';
import { anomaliGunuKaydet, anomaliler } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const SAAT = 3_600_000;

interface Cevap<T = unknown> { durum: number; govde: T }

describe('arkon üretim anomalisi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  let yonetici = '';
  let hazirlik = '';
  let operator = '';
  let rolsuz = '';
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

  // Başlatma ve sayımın HTTP ucu yok (238 H3); terminal bunları uretim-emirleri/disari.ts ile yapar.
  const yoneticiyle = <T>(is: (db: Db, k: Kullanici) => Promise<T>): Promise<T> =>
    vt().tx(async (db) => is(db, (await kullaniciYukle(db, yoneticiId))!));
  async function istek<T = unknown>(cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`,
      headers: { ...(cerez ? { cookie: cerez } : {}), ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
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

  const kisiAta = (makineId: number, kisiId: number, yuzde = 50): Promise<unknown> => sahip().sorgu(
    "INSERT INTO makine_kisi (makine_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2000-01-01', $3)", [makineId, kisiId, yuzde]);

  // Sayım defteri yalnız eklenir; testte zamanı seçmek için sahip bağlantısıyla doğrudan yazılır (gün başından `saat` saat sonra).
  // Testteki emirler tek adımlıdır: sayım emrin tek iş emrine yazılır.
  const sayimYaz = (emirId: number, kisiId: number, istasyonId: number, saat: number, adet: number): Promise<unknown> => sahip().sorgu(
    `INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, zaman)
     VALUES ($1, (SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1), $2, $3, 'saglam', $4, to_timestamp($5::double precision / 1000))`,
    [emirId, kisiId, istasyonId, adet, gunBasi + saat * SAAT]);

  async function hesapla(esikler?: Parameters<typeof anomaliler>[2]): Promise<AnomaliCevabi> {
    return vt().tx(async (db) => anomaliler(db, (await kullaniciYukle(db, yoneticiId))!, esikler, simdi));
  }

  before(async () => {
    ortam = await testVeritabaniKur('arkonanom');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ARKON.AA', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    yonetici = await girisCerezi('yonetici');
    hazirlik = (await kisiKur('hz1', ['arkon.hazirlik', 'sayfa.arkon'])).cerez;
    operator = (await kisiKur('op1', ['arkon.operator', 'sayfa.arkon', 'terminal.uret'])).cerez;
    rolsuz = (await kisiKur('rs1', ['sayfa.arkon'])).cerez;
    gunBasi = tesisGunBasi(tesisGunu(Date.now()));
    // Tesis gününün 10:00'u: vardiya gün boyu açıksa 10 saat net aktif süre geçmiştir.
    simdi = gunBasi + 10 * SAAT;
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('uç: yetkili 200 ve sözleşmeye uyar; arkon.hazirlik olmayan Arkon rollüsü ve rolsüz 403; oturumsuz 401', async () => {
    const yonetici200 = await istek<AnomaliCevabi>(yonetici, 'GET', '/arkon/anomaliler');
    assert.equal(yonetici200.durum, 200, JSON.stringify(yonetici200.govde));
    assert.equal(anomaliCevabi.safeParse(yonetici200.govde).success, true);
    const hazirlik200 = await istek<AnomaliCevabi>(hazirlik, 'GET', '/arkon/anomaliler');
    assert.equal(hazirlik200.durum, 200, JSON.stringify(hazirlik200.govde));
    assert.equal(hazirlik200.govde.tarih, tesisGunu(Date.now()));
    assert.equal((await istek(operator, 'GET', '/arkon/anomaliler')).durum, 403);
    assert.equal((await istek(rolsuz, 'GET', '/arkon/anomaliler')).durum, 403);
    assert.equal((await istek(null, 'GET', '/arkon/anomaliler')).durum, 401);
  });

  test('uç: sayfayı gören üç işlemden biri yeter (hazırlık, planlama, yönetici); hiçbiri olmayan 403', async () => {
    for (const islem of ['arkon.hazirlik', 'arkon.planlama', 'arkon.yonetici']) {
      const kisi = await kisiKur(`gorur${(sayac += 1)}`, [islem, 'sayfa.arkon']);
      const cevap = await istek<AnomaliCevabi>(kisi.cerez, 'GET', '/arkon/anomaliler');
      assert.equal(cevap.durum, 200, `${islem}: ${JSON.stringify(cevap.govde)}`);
      assert.equal(anomaliCevabi.safeParse(cevap.govde).success, true);
    }
    for (const islem of ['arkon.operator', 'arkon.kalite', 'arkon.bakim']) {
      const kisi = await kisiKur(`gormez${(sayac += 1)}`, [islem, 'sayfa.arkon']);
      assert.equal((await istek(kisi.cerez, 'GET', '/arkon/anomaliler')).durum, 403, islem);
    }
  });

  test('eşikler Ayarlar\'dan okunur: varsayılan 60 dk ve %0; değişen değer cevaba yansır, boş eşik kuralı kapatır, sınır dışı değer yazılmaz', async () => {
    const oku = async () => (await istek<AnomaliCevabi>(hazirlik, 'GET', '/arkon/anomaliler')).govde.esikler;
    assert.deepEqual(await oku(), { girisYokDk: 60, adetToleransYuzde: 0 });
    const yaz = (anahtar: string, deger: unknown) => istek(yonetici, 'POST', `/ayarlar/${anahtar}/degistir`, { deger });
    try {
      assert.equal((await yaz('arkon.anomali-giris-yok-dk', 90)).durum, 200);
      assert.equal((await yaz('arkon.anomali-adet-tolerans-yuzde', null)).durum, 200);
      assert.deepEqual(await oku(), { girisYokDk: 90, adetToleransYuzde: null });
      assert.equal((await yaz('arkon.anomali-giris-yok-dk', 0)).durum, 400, 'alt sınırın altı');
      assert.equal((await yaz('arkon.anomali-adet-tolerans-yuzde', 101)).durum, 400, 'üst sınırın üstü');
      assert.deepEqual(await oku(), { girisYokDk: 90, adetToleransYuzde: null });
      // Ayarı yazma yetkisi Arkon hazırlığında yoktur.
      assert.equal((await istek(hazirlik, 'POST', '/ayarlar/arkon.anomali-giris-yok-dk/degistir', { deger: 5 })).durum, 403);
    } finally {
      await yaz('arkon.anomali-giris-yok-dk', 60);
      await yaz('arkon.anomali-adet-tolerans-yuzde', 0);
    }
    assert.deepEqual(await oku(), { girisYokDk: 60, adetToleransYuzde: 0 });
  });

  test('plan yoksa boş döner: istasyon, makine ve kişi satırı yok; toplam oran null (sıfıra bölünmez)', async () => {
    await ortamKur(1);
    const s = await hesapla();
    const ben = s.istasyonlar.filter((i) => i.ad === 'Anomali istasyonu');
    assert.deepEqual(ben, [], 'canlı planda yerleşimi olmayan istasyon listede yok');
    assert.equal(s.toplam.oran, null);
  });

  test('AR-AN-2/3/4: planlanan sürede hiç üretilmediyse istasyon ve makine işaretlenir; beklenen = net süre / birim süre; oran 0', async () => {
    const o = await ortamKur(2);
    await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await isEmriKur(o.makineler[1]!, { birimSureDk: '4', bas: 8, bit: 12 });
    const s = await hesapla();
    const ist = s.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    // 8:00-10:00 = 120 dk net aktif: 120/2 = 60 ve 120/4 = 30.
    assert.equal(ist.beklenen, 90);
    assert.equal(ist.uretilen, 0, 'başlamamış iş emrinde üretim sıfırdır');
    assert.equal(ist.oran, 0);
    assert.equal(ist.adetEksik, true);
    assert.equal(ist.kapasiteKaynagi, 'makine');
    assert.equal(ist.girisYokDk, 120, 'bugün hiç giriş yok: planlı pencerenin 8-10 arası 120 dk');
    assert.equal(ist.girisYok, true);
    const m = s.makineler.filter((x) => o.makineler.includes(x.makineId));
    assert.deepEqual(m.map((x) => [x.beklenen, x.uretilen, x.fark, x.durum]), [[60, 0, -60, 'isaret'], [30, 0, -30, 'isaret']]);
    // Kaynak istasyonlar modülünün toplu okumasından gelir (kapasiteKaynaklari): istasyon başına okuma yok.
    await vt().sorgu("UPDATE istasyon SET kapasite_kaynagi = 'insan' WHERE id = $1", [o.istasyonId]);
    assert.equal((await hesapla()).istasyonlar.find((i) => i.istasyonId === o.istasyonId)?.kapasiteKaynagi, 'insan');
  });

  test('AR-AN-2/3: o gün başlayan işin sağlam sayımı istasyonun ve makinenin üretilenidir; yeterliyse işaret yok, oran bulunur; tolerans ve kapalı kural', async () => {
    const o = await ortamKur(1);
    const ie = await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await yoneticiyle((db, k) => emirBaslat(db, k, ie.emirId));
    await yoneticiyle((db, k) => emirSayim(db, k, ie.emirId, { tur: 'saglam', adet: 45 }));
    // 327 a: ilk parça onaylanana kadar sağlam sayım karar bekler.
    await vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, ie.emirId, 'onay'));
    const eksik = await hesapla();
    const ist = eksik.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    assert.deepEqual([ist.beklenen, ist.uretilen, ist.oran, ist.adetEksik], [60, 45, 0.75, true]);
    assert.deepEqual(eksik.makineler.filter((m) => m.makineId === o.makineler[0]).map((m) => [m.uretilen, m.durum]), [[45, 'isaret']]);
    // Tolerans %25: hedef 45, tam eşit olduğu için eksik değil.
    const toleransli = await hesapla({ girisYokDk: 60, adetToleransYuzde: 25 });
    assert.equal(toleransli.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!.adetEksik, false);
    // Boş tolerans kuralı kapatır: hüküm yok, makine "bilinmiyor".
    const kapali = await hesapla({ girisYokDk: null, adetToleransYuzde: null });
    assert.equal(kapali.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!.adetEksik, null);
    assert.equal(kapali.makineler.find((m) => m.makineId === o.makineler[0])!.durum, 'bilinmiyor');
    assert.deepEqual(kapali.esikler, { girisYokDk: null, adetToleransYuzde: null });
  });

  test('istasyon ve makinenin üretileni günün net sayımıdır; başka gün başlamış işte dünkü sayım bugüne girmez, makine sayımı açık kullanımından bulunur', async () => {
    const o = await ortamKur(1);
    const ie = await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await yoneticiyle((db, k) => emirBaslat(db, k, ie.emirId));
    await sahip().sorgu("UPDATE uretim_emirleri_is_emri SET baslama = baslama - interval '2 days' WHERE id = $1", [ie.isEmriId]);
    await sahip().sorgu("UPDATE uretim_emirleri_makine_kullanimi SET baslama = baslama - interval '2 days' WHERE emir_id = $1", [ie.emirId]);
    await sayimYaz(ie.emirId, yoneticiId, o.istasyonId, 9, 40);
    await sayimYaz(ie.emirId, yoneticiId, o.istasyonId, -5, 400);
    const s = await hesapla();
    const ist = s.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    assert.equal(ist.beklenen, 60);
    assert.equal(ist.uretilen, 40, 'dünkü 400 adet bugüne girmez');
    assert.equal(ist.oran, 0.67);
    assert.equal(ist.adetEksik, true);
    const m = s.makineler.find((x) => x.makineId === o.makineler[0])!;
    assert.deepEqual([m.beklenen, m.uretilen, m.fark, m.durum], [60, 40, -20, 'isaret'], 'makine: dünkü 400 girmez, iş emri sayacı kullanılmaz');
  });

  test('AR-AN-1: son girişten beri planlı net aktif süre eşiğe varırsa işaret; giriş yeni, eşik boş ya da plan henüz başlamamışsa işaret yok', async () => {
    const o = await ortamKur(1);
    const ie = await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    const oku = async (esikler?: Parameters<typeof anomaliler>[2]) => (await hesapla(esikler)).istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    await sayimYaz(ie.emirId, yoneticiId, o.istasyonId, 9.5, 1);
    const yeni = await oku();
    assert.deepEqual([yeni.girisYokDk, yeni.girisYok], [30, false], 'son giriş 9:30, şimdi 10:00');
    await sayimYaz(ie.emirId, yoneticiId, o.istasyonId, 8.5, 1);
    assert.equal((await oku()).girisYokDk, 30, 'en son giriş sayılır');
    const o2 = await ortamKur(1);
    const ie2 = await isEmriKur(o2.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await sayimYaz(ie2.emirId, yoneticiId, o2.istasyonId, 8.5, 1);
    const eski = (await hesapla()).istasyonlar.find((i) => i.istasyonId === o2.istasyonId)!;
    assert.deepEqual([eski.girisYokDk, eski.girisYok], [90, true], 'son giriş 8:30: 90 dk');
    const sinirda = (await hesapla({ girisYokDk: 90, adetToleransYuzde: 0 })).istasyonlar.find((i) => i.istasyonId === o2.istasyonId)!;
    assert.equal(sinirda.girisYok, true, 'eşik dahil');
    const yuksek = (await hesapla({ girisYokDk: 91, adetToleransYuzde: 0 })).istasyonlar.find((i) => i.istasyonId === o2.istasyonId)!;
    assert.equal(yuksek.girisYok, false);
    const kapali = (await hesapla({ girisYokDk: null, adetToleransYuzde: 0 })).istasyonlar.find((i) => i.istasyonId === o2.istasyonId)!;
    assert.equal(kapali.girisYok, null, 'boş eşik kuralı kapatır');
    assert.equal(kapali.girisYokDk, 90);
    const dunku = await ortamKur(1);
    const ie3 = await isEmriKur(dunku.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await sayimYaz(ie3.emirId, yoneticiId, dunku.istasyonId, -3, 5);
    const dun = (await hesapla()).istasyonlar.find((i) => i.istasyonId === dunku.istasyonId)!;
    assert.deepEqual([dun.girisYokDk, dun.girisYok], [120, true], 'dünkü giriş bugünü kısaltmaz: planlı 8-10');
    const gelecek = await ortamKur(1);
    await isEmriKur(gelecek.makineler[0]!, { birimSureDk: '2', bas: 14, bit: 16 });
    const sonra = (await hesapla()).istasyonlar.find((i) => i.istasyonId === gelecek.istasyonId)!;
    assert.deepEqual([sonra.girisYokDk, sonra.girisYok], [0, false], 'plan henüz başlamadı');
    const vardiyasiz = await ortamKur(1, { vardiya: false });
    await isEmriKur(vardiyasiz.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    const net = (await hesapla()).istasyonlar.find((i) => i.istasyonId === vardiyasiz.istasyonId)!;
    assert.deepEqual([net.girisYokDk, net.girisYok], [0, false], 'vardiya yok: net aktif süre yok');
  });

  test('birim süresi bilinmeyen iş emri istasyon beklenenini bilinmez yapar (sıfır uydurulmaz)', async () => {
    const o = await ortamKur(2);
    await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    const bilinmeyen = await isEmriKur(o.makineler[1]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await sahip().sorgu('UPDATE uretim_emirleri_is_emri SET birim_sure_dk = NULL WHERE id = $1', [bilinmeyen.isEmriId]);
    const s = await hesapla();
    const ist = s.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    assert.equal(ist.beklenen, null);
    assert.equal(ist.adetEksik, null);
    assert.deepEqual(s.makineler.filter((m) => o.makineler.includes(m.makineId)).map((m) => m.beklenen), [60, null]);
  });

  test('vardiyası olmayan kaynakta net süre yoktur: beklenen sıfır; yerleşim bugünden sonraysa beklenen sıfır', async () => {
    const vardiyasiz = await ortamKur(1, { vardiya: false });
    await isEmriKur(vardiyasiz.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    const gelecek = await ortamKur(1);
    await isEmriKur(gelecek.makineler[0]!, { birimSureDk: '2', bas: 14, bit: 16 });
    const s = await hesapla();
    assert.equal(s.istasyonlar.find((i) => i.istasyonId === vardiyasiz.istasyonId)!.beklenen, 0);
    assert.equal(s.istasyonlar.find((i) => i.istasyonId === gelecek.istasyonId)!.beklenen, 0);
    assert.equal(s.istasyonlar.find((i) => i.istasyonId === gelecek.istasyonId)!.adetEksik, false, 'planda henüz bir şey yok: eksik değil');
  });

  test('AR-AN-4: çok makineli kişide beklenen makinelerinin toplamıdır; izinli kişi beklenene girmez', async () => {
    const o = await ortamKur(2);
    const e1 = await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await isEmriKur(o.makineler[1]!, { birimSureDk: '4', bas: 8, bit: 12 });
    const ikisi = await kisiKur(`cokmak${(sayac += 1)}`, ['sayfa.arkon']);
    const izinli = await kisiKur(`izinli${(sayac += 1)}`, ['sayfa.arkon']);
    await kisiAta(o.makineler[0]!, ikisi.id);
    await kisiAta(o.makineler[1]!, ikisi.id);
    const once = await hesapla();
    const kisi = once.kisiler!.find((k) => k.kisiId === ikisi.id)!;
    assert.deepEqual([kisi.beklenen, kisi.uretilen, kisi.durum], [90, 0, 'isaret'], 'iki makinenin beklenenleri toplanır; girişi olmayan kişinin üretileni 0');
    // Kişinin üretileni kendi girdiği günün net sayımıdır (başkasının girişi ve dünkü giriş sayılmaz).
    await sayimYaz(e1.emirId, ikisi.id, o.istasyonId, 9, 70);
    await sayimYaz(e1.emirId, ikisi.id, o.istasyonId, -2, 300);
    await sayimYaz(e1.emirId, yoneticiId, o.istasyonId, 9.5, 11);
    const girdi = (await hesapla()).kisiler!.find((k) => k.kisiId === ikisi.id)!;
    assert.deepEqual([girdi.beklenen, girdi.uretilen, girdi.fark, girdi.durum], [90, 70, -20, 'isaret']);
    await sayimYaz(e1.emirId, ikisi.id, o.istasyonId, 9.8, 20);
    assert.equal((await hesapla()).kisiler!.find((k) => k.kisiId === ikisi.id)!.durum, 'normal', '90 üretildi: eksik yok');
    // İzinli kişi yalnız ikinci makinede çalışıyor; iznindeyken o makine beklenene girmez.
    const o2 = await ortamKur(1);
    await isEmriKur(o2.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await kisiAta(o2.makineler[0]!, izinli.id);
    const personel = (await sahip().tek<{ no: number }>("INSERT INTO ik_personel (kimlik, ad, soyad, kisi_id, is_merkezi_id, olusturan_kisi_id, guncelleyen_kisi_id) VALUES ($1, 'Deneme', 'Personel', $2, $3, $4, $4) RETURNING no", [`izn-${sayac}`, izinli.id, o2.merkezId, yoneticiId]))!.no;
    await sahip().sorgu(
      `INSERT INTO ik_izin (kimlik, personel_no, tur, baslangic, bitis, durum, olusturan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'Yıllık izin', $3::date, $3::date, 'Onaylandı', $4, $4)`, [`izn-${sayac}`, personel, tesisGunu(Date.now()), yoneticiId]);
    const sonra = await hesapla();
    const ist = sonra.istasyonlar.find((i) => i.istasyonId === o2.istasyonId)!;
    assert.equal(ist.beklenen, 0, 'tek kişi izinli: makine beklenene girmez');
    assert.equal(ist.adetEksik, false);
    assert.deepEqual(sonra.makineler.find((m) => m.makineId === o2.makineler[0])!.durum, 'izinli');
    const izinliSatir = sonra.kisiler!.find((k) => k.kisiId === izinli.id)!;
    assert.deepEqual([izinliSatir.beklenen, izinliSatir.durum], [0, 'izinli']);
    // Karşı örnek: izin iptal edilince aynı veri yeniden beklenir.
    await sahip().sorgu('UPDATE ik_izin SET iptal = true, surum = surum + 1 WHERE personel_no = $1', [personel]);
    const iptal = await hesapla();
    assert.equal(iptal.istasyonlar.find((i) => i.istasyonId === o2.istasyonId)!.beklenen, 60);
  });

  test('veri kapsamı: iş merkezi kısıtlı kişi yalnız kendi merkezinin istasyon, makine ve kişi satırlarını görür; kısıtsız kişi hepsini', async () => {
    const icerde = await ortamKur(1);
    const disarda = await ortamKur(1);
    await isEmriKur(icerde.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await isEmriKur(disarda.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    const kisitli = await kisiKur(`kapsamli${(sayac += 1)}`, ['arkon.hazirlik', 'sayfa.arkon']);
    await sahip().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisitli.id, icerde.merkezId]);
    const okunan = (await istek<AnomaliCevabi>(kisitli.cerez, 'GET', '/arkon/anomaliler')).govde;
    assert.deepEqual(okunan.istasyonlar.map((i) => i.istasyonId), [icerde.istasyonId]);
    assert.deepEqual(okunan.makineler.map((m) => m.makineId), icerde.makineler);
    // Uç gerçek saatle çalışır (beklenen saate göre değişir): toplam yalnız kapsamdaki tek istasyonun satırıdır.
    assert.equal(okunan.toplam.beklenen, okunan.istasyonlar[0]!.beklenen);
    assert.equal(okunan.toplam.uretilen, okunan.istasyonlar[0]!.uretilen);
    const hepsi = (await istek<AnomaliCevabi>(hazirlik, 'GET', '/arkon/anomaliler')).govde;
    const kimlikler = hepsi.istasyonlar.map((i) => i.istasyonId);
    assert.ok(kimlikler.includes(icerde.istasyonId) && kimlikler.includes(disarda.istasyonId));
  });

  test('AR-AN-3: toplam oran yalnız ikisi de bilinen istasyonlarla kurulur', async () => {
    const s = await hesapla();
    const bilinen = s.istasyonlar.filter((i) => i.beklenen !== null && i.uretilen !== null);
    const beklenen = bilinen.reduce((t, i) => t + (i.beklenen ?? 0), 0);
    assert.ok(Math.abs(s.toplam.beklenen - beklenen) < 0.05, `${s.toplam.beklenen} ${beklenen}`);
    assert.equal(s.toplam.uretilen, bilinen.reduce((t, i) => t + (i.uretilen ?? 0), 0));
    assert.equal(s.toplam.oran === null, s.toplam.beklenen === 0);
  });

  /* ---------------- gün kaydı ve istatistik (kart #1306) ---------------- */

  const kaydet = (an: number = simdi): Promise<void> => vt().tx((db) => anomaliGunuKaydet(db, an));

  test('kişi kırılımı yalnız arkon.anomali-kisi ile gelir: yönetici görür; hazırlık bugünde ve istatistikte null alır', async () => {
    const o = await ortamKur(1);
    await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    const ki = await kisiKur(`kisi${(sayac += 1)}`, ['sayfa.arkon']);
    await kisiAta(o.makineler[0]!, ki.id);
    const yon = (await istek<AnomaliCevabi>(yonetici, 'GET', '/arkon/anomaliler')).govde;
    assert.ok(Array.isArray(yon.kisiler) && yon.kisiler.some((k) => k.kisiId === ki.id));
    const hz = await istek<AnomaliCevabi>(hazirlik, 'GET', '/arkon/anomaliler');
    assert.equal(hz.durum, 200);
    assert.equal(hz.govde.kisiler, null, 'hazırlık kişi satırlarını görmez');
    assert.ok(hz.govde.istasyonlar.some((i) => i.istasyonId === o.istasyonId), 'istasyonu görür');
    // İşlem kişiye verilince görür (yönetici dışındaki ek yetki).
    const ekli = await kisiKur(`kisiek${(sayac += 1)}`, ['arkon.hazirlik', 'arkon.anomali-kisi', 'sayfa.arkon']);
    assert.ok(Array.isArray((await istek<AnomaliCevabi>(ekli.cerez, 'GET', '/arkon/anomaliler')).govde.kisiler));
    await kaydet();
    const yol = `/arkon/anomali-istatistik?donem=hafta&tarih=${tesisGunu(simdi)}`;
    const ist = await istek<AnomaliIstatistikCevabi>(hazirlik, 'GET', yol);
    assert.equal(ist.durum, 200, JSON.stringify(ist.govde));
    assert.equal(anomaliIstatistikCevabi.safeParse(ist.govde).success, true);
    assert.equal(ist.govde.kisiler, null);
    assert.ok(ist.govde.istasyonlar.some((i) => i.istasyonId === o.istasyonId));
    const yonIst = (await istek<AnomaliIstatistikCevabi>(yonetici, 'GET', yol)).govde;
    assert.ok(yonIst.kisiler?.some((k) => k.kisiId === ki.id), 'yönetici kişi satırını görür');
    assert.equal((await istek(operator, 'GET', yol)).durum, 403);
    assert.equal((await istek(null, 'GET', yol)).durum, 401);
    assert.equal((await istek(hazirlik, 'GET', '/arkon/anomali-istatistik?donem=yil&tarih=2026-10-14')).durum, 400);
    assert.equal((await istek(hazirlik, 'GET', '/arkon/anomali-istatistik?donem=gun&tarih=14.10.2026')).durum, 400);
  });

  test('kişinin beklenen adedi makinedeki payıdır: aynı makinede tam zamanlı iki kişiden her biri yarısıyla ölçülür', async () => {
    const o = await ortamKur(1);
    await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    const a = await kisiKur(`pay${(sayac += 1)}`, ['sayfa.arkon']);
    const b = await kisiKur(`pay${(sayac += 1)}`, ['sayfa.arkon']);
    await kisiAta(o.makineler[0]!, a.id, 100);
    await kisiAta(o.makineler[0]!, b.id, 100);
    const s = await hesapla();
    assert.equal(s.makineler.find((m) => m.makineId === o.makineler[0])!.beklenen, 60);
    assert.deepEqual(s.kisiler!.filter((k) => k.kisiId === a.id || k.kisiId === b.id).map((k) => k.beklenen), [30, 30]);
  });

  test('gün kaydı: plandan düşen iş emrinin o güne kadarki beklenen adedi kayıttan kalır; kaydı yoksa düşer', async () => {
    const o = await ortamKur(1);
    const ie = await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await kaydet();
    const gun = await sahip().tek<{ durum: string }>('SELECT durum FROM arkon_anomali_gunu WHERE tarih = $1::date', [tesisGunu(simdi)]);
    assert.equal(gun?.durum, 'acik');
    await sahip().sorgu('DELETE FROM plan_yerlesimi WHERE is_emri_id = $1', [ie.isEmriId]);
    const s = await hesapla();
    const ist = s.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    assert.deepEqual([ist.beklenen, ist.adetEksik], [60, true], 'biten iş: sabahki beklenen kaybolmaz');
    assert.equal(s.makineler.find((m) => m.makineId === o.makineler[0])!.beklenen, 60);
    // Karşı örnek: kayıt alınmadan plandan düşen iş hesaba girmez.
    const o2 = await ortamKur(1);
    const ie2 = await isEmriKur(o2.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await sahip().sorgu('DELETE FROM plan_yerlesimi WHERE is_emri_id = $1', [ie2.isEmriId]);
    assert.equal((await hesapla()).istasyonlar.some((i) => i.istasyonId === o2.istasyonId), false);
  });

  test('gün kaydı: gün içinde biten iş emrinin bugünkü sağlamı beklenenin altında sayılmaz; bitmemişse kayıttaki beklenen kalır', async () => {
    const o = await ortamKur(1);
    const ie = await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await kaydet();
    await sayimYaz(ie.emirId, yoneticiId, o.istasyonId, 9, 70);
    await sahip().sorgu('DELETE FROM plan_yerlesimi WHERE is_emri_id = $1', [ie.isEmriId]);
    assert.equal((await hesapla()).makineler.find((m) => m.makineId === o.makineler[0])!.beklenen, 60, 'bitmemiş: kayıttaki beklenen');
    await sahip().sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = to_timestamp($2::double precision / 1000), bitis = to_timestamp($3::double precision / 1000), saglam_adet = 70 WHERE id = $1", [ie.isEmriId, gunBasi + 8 * SAAT, gunBasi + 10 * SAAT]);
    const s = await hesapla();
    assert.equal(s.makineler.find((m) => m.makineId === o.makineler[0])!.beklenen, 70);
    const ist = s.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    assert.deepEqual([ist.beklenen, ist.uretilen, ist.adetEksik], [70, 70, false]);
  });

  test('gün kapanışı: açık gün kapanış anından sonra kesinleşir; kesin günün kaydı ve satırları değişmez, açık güne yazılır', async () => {
    const dun = gunEkle(tesisGunu(simdi), -1);
    await sahip().sorgu("INSERT INTO arkon_anomali_gunu (tarih, durum, hesaplama) VALUES ($1::date, 'acik', now()) ON CONFLICT (tarih) DO NOTHING", [dun]);
    await kaydet();
    const kapanan = await sahip().tek<{ durum: string; kapanis: string | null }>('SELECT durum, kapanis::text AS kapanis FROM arkon_anomali_gunu WHERE tarih = $1::date', [dun]);
    assert.equal(kapanan?.durum, 'kesin');
    assert.notEqual(kapanan?.kapanis, null);
    await assert.rejects(
      vt().sorgu("INSERT INTO arkon_anomali_satiri (tarih, kirilim, kimlik, beklenen) VALUES ($1::date, 'istasyon', 999999, 5)", [dun]),
      /arkon_anomali_satiri_kesin_degismez|Kesinleşmiş/,
    );
    await assert.rejects(vt().sorgu("UPDATE arkon_anomali_gunu SET hesaplama = now() WHERE tarih = $1::date", [dun]), /Kesinleşmiş/);
    await assert.rejects(vt().sorgu('DELETE FROM arkon_anomali_gunu WHERE tarih = $1::date', [dun]), /Kesinleşmiş/);
    // Karşı örnek: bugünkü açık güne satır yazılır ve kaldırılır.
    await vt().sorgu("INSERT INTO arkon_anomali_satiri (tarih, kirilim, kimlik, beklenen) VALUES ($1::date, 'istasyon', 999999, 5)", [tesisGunu(simdi)]);
    await vt().sorgu("DELETE FROM arkon_anomali_satiri WHERE tarih = $1::date AND kimlik = 999999", [tesisGunu(simdi)]);
    // Bugün kapanmaz.
    assert.equal((await sahip().tek<{ durum: string }>('SELECT durum FROM arkon_anomali_gunu WHERE tarih = $1::date', [tesisGunu(simdi)]))?.durum, 'acik');
  });

  test('AR-AN-9: beklenenin tavanı kalan adettir: önceki günlerin sağlamı düşülür', async () => {
    const o = await ortamKur(1);
    const ie = await isEmriKur(o.makineler[0]!, { adet: 50, birimSureDk: '2', bas: 8, bit: 12 });
    const once = (await hesapla()).istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    assert.equal(once.beklenen, 50, 'süre 60 adet ederdi; tavan iş emrinin adedi');
    await sayimYaz(ie.emirId, yoneticiId, o.istasyonId, -5, 40);
    const sonra = (await hesapla()).istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    assert.deepEqual([sonra.beklenen, sonra.uretilen], [10, 0], 'dün 40 üretildi: bugün en çok kalan 10 beklenir');
    await sayimYaz(ie.emirId, yoneticiId, o.istasyonId, 9, 10);
    const biten = (await hesapla()).istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    assert.deepEqual([biten.beklenen, biten.uretilen, biten.adetEksik], [10, 10, false], 'kalanı bitiren istasyon eksik sayılmaz');
  });

  test('AR-AN-10: plana girmemiş işin sayımı plan dışıdır, orana girmez; yalnız plan dışı üreten istasyon da satır alır; istatistikte kalır', async () => {
    const o = await ortamKur(2);
    const planli = await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    const disi = await isEmriKur(o.makineler[1]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await sahip().sorgu('DELETE FROM plan_yerlesimi WHERE is_emri_id = $1', [disi.isEmriId]);
    await sayimYaz(planli.emirId, yoneticiId, o.istasyonId, 9, 30);
    await sayimYaz(disi.emirId, yoneticiId, o.istasyonId, 9.5, 25);
    const s = await hesapla();
    const ist = s.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    assert.deepEqual([ist.beklenen, ist.uretilen, ist.planDisi, ist.oran, ist.adetEksik], [60, 30, 25, 0.5, true], 'plan dışı 25 adet açığı gizlemez');
    assert.ok(s.toplam.planDisi >= 25);
    // Hiç planı olmayan istasyon: bütün sayımı plan dışı, beklenen 0.
    const yalniz = await ortamKur(1);
    const ie = await isEmriKur(yalniz.makineler[0]!, { birimSureDk: '2', bas: 8, bit: 12 });
    await sahip().sorgu('DELETE FROM plan_yerlesimi WHERE is_emri_id = $1', [ie.isEmriId]);
    await sayimYaz(ie.emirId, yoneticiId, yalniz.istasyonId, 9, 12);
    const y = (await hesapla()).istasyonlar.find((i) => i.istasyonId === yalniz.istasyonId)!;
    assert.deepEqual([y.beklenen, y.uretilen, y.planDisi, y.oran], [0, 0, 12, null]);
    // Gün kaydı istasyonun bütün sayımını tutar; istatistik plan dışını iş emri satırlarından ayırır.
    await kaydet();
    const v = (await istek<AnomaliIstatistikCevabi>(yonetici, 'GET', `/arkon/anomali-istatistik?donem=gun&tarih=${tesisGunu(simdi)}`)).govde;
    assert.equal(anomaliIstatistikCevabi.safeParse(v).success, true);
    const kayitli = v.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    assert.deepEqual([kayitli.beklenen, kayitli.uretilen, kayitli.planDisi], [60, 30, 25]);
    assert.deepEqual([v.istasyonlar.find((i) => i.istasyonId === yalniz.istasyonId)!.planDisi], [12]);
    assert.ok((v.gunler[0]?.planDisi ?? 0) >= 37);
  });

  test('AR-AN-12: emek verimi standart süre / vardiya mesaisidir; üç makineye bakan kişide makine başına payın üç katı; izinli gün mesaiye girmez', async () => {
    const o = await ortamKur(3);
    const kisi = await kisiKur(`emek${(sayac += 1)}`, ['sayfa.arkon']);
    await sahip().sorgu("INSERT INTO istasyon_kisi (istasyon_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2000-01-01', 100)", [o.istasyonId, kisi.id]);
    for (const makineId of o.makineler) {
      const ie = await isEmriKur(makineId, { birimSureDk: '2', bas: 0, bit: 12 });
      await kisiAta(makineId, kisi.id, 33);
      // 30 adet x 2 dk = 1 saat standart; sayım iş emrine bağlı.
      await sahip().sorgu(
        `INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, zaman)
         VALUES ($1, $2, $3, $4, 'saglam', 30, to_timestamp($5::double precision / 1000))`, [ie.emirId, ie.isEmriId, kisi.id, o.istasyonId, gunBasi + 9 * SAAT]);
    }
    const satir = (await hesapla()).kisiler!.find((k) => k.kisiId === kisi.id)!;
    // Mesai 00:00-10:00 = 10 saat; her makine 1 saat standart (makine başına 0,1), kişi 3 saat.
    assert.equal(satir.emekVerimi, 0.3);
    assert.equal(anomaliCevabi.safeParse(await hesapla()).success, true);
    // Hazırlık kişi kırılımını (emek verimi dahil) görmez.
    const hz = await istek<AnomaliIstatistikCevabi>(hazirlik, 'GET', `/arkon/anomali-istatistik?donem=gun&tarih=${tesisGunu(simdi)}`);
    assert.equal(hz.govde.kisiler, null);
    // İK'nın onaylı fazla mesaisi paydaya girer (2 saat): 3 / 12; onaylanmamış satır girmez.
    const personel = (await sahip().tek<{ no: number }>("INSERT INTO ik_personel (kimlik, ad, soyad, kisi_id, is_merkezi_id, olusturan_kisi_id, guncelleyen_kisi_id) VALUES ($1, 'Deneme', 'Personel', $2, $3, $4, $4) RETURNING no", [`emk-${sayac}`, kisi.id, o.merkezId, yoneticiId]))!.no;
    for (const [kimlik, onay] of [[`fm-${sayac}`, 'Onaylandı'], [`fmb-${sayac}`, 'Beklemede']] as const) {
      await sahip().sorgu(
        `INSERT INTO ik_devam (kimlik, personel_no, tarih, tur, saat, onay, olusturan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, $2, $3::date, 'Fazla mesai', 2, $4, $5, $5)`, [kimlik, personel, tesisGunu(simdi), onay, yoneticiId]);
    }
    assert.equal((await hesapla()).kisiler!.find((k) => k.kisiId === kisi.id)!.emekVerimi, 0.25);
    // Aynı gün Vardiya'da planlı fazla mesai varsa (takvimde) İK saati ayrıca eklenmez: plan esastır. Plan 23:59'da başlar, şimdiye kadarki mesaiyi değiştirmez.
    const plan = (await sahip().tek<{ id: number }>(
      "INSERT INTO vardiya_fazla_mesai (tarih, baslangic, bitis, kapsam, is_merkezi_id, yazan_id) VALUES ($1::date, '23:59', '00:00', 'is-merkezi', $2, $3) RETURNING id",
      [tesisGunu(simdi), o.merkezId, yoneticiId]))!.id;
    await sahip().sorgu('INSERT INTO vardiya_fazla_mesai_kisi (fazla_mesai_id, kisi_id) VALUES ($1, $2)', [plan, kisi.id]);
    assert.equal((await hesapla()).kisiler!.find((k) => k.kisiId === kisi.id)!.emekVerimi, 0.3, 'çift sayım yok');
    // İzinli gün: mesai yok, emek verimi boş (sıfıra bölünmez).
    await sahip().sorgu(
      `INSERT INTO ik_izin (kimlik, personel_no, tur, baslangic, bitis, durum, olusturan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'Yıllık izin', $3::date, $3::date, 'Onaylandı', $4, $4)`, [`emk-${sayac}`, personel, tesisGunu(simdi), yoneticiId]);
    assert.equal((await hesapla()).kisiler!.find((k) => k.kisiId === kisi.id)!.emekVerimi, null);
  });

  test('istatistik: hafta toplamı Σ üretilen / Σ beklenen, performans Σ standart / Σ çalışılan; kaydı olmayan gün boş', async () => {
    const o = await ortamKur(1);
    // Geçmiş bir hafta (2024-01-01 Pazartesi): iş bu kadar geriye bakmaz, satırlar elle kurulur.
    for (const [tarih, beklenen, uretilen, isaret, std, cal] of [['2024-01-01', 100, 90, false, 3600, 4000], ['2024-01-03', 10, 0, true, 1800, 2000]] as const) {
      await sahip().sorgu("INSERT INTO arkon_anomali_gunu (tarih, durum, hesaplama) VALUES ($1::date, 'acik', now())", [tarih]);
      await sahip().sorgu(
        `INSERT INTO arkon_anomali_satiri (tarih, kirilim, kimlik, istasyon_id, beklenen, uretilen, hurda, isaret) VALUES ($1::date, 'istasyon', $2, $2, $3, $4, 1, $5)`,
        [tarih, o.istasyonId, beklenen, uretilen, isaret]);
      // İstasyonun üretileni plandaki iş emrinin sayımıdır (AR-AN-10); bütün sayım planlı.
      await sahip().sorgu(
        `INSERT INTO arkon_anomali_satiri (tarih, kirilim, kimlik, istasyon_id, kaynak_tur, kaynak_id, beklenen, uretilen) VALUES ($1::date, 'is_emri', 1, $2, 'makine', $3, $4, $5)`,
        [tarih, o.istasyonId, o.makineler[0], beklenen, uretilen]);
      await sahip().sorgu(
        `INSERT INTO arkon_anomali_satiri (tarih, kirilim, kimlik, istasyon_id, standart_sn, calisilan_sn) VALUES ($1::date, 'kisi', $2, $3, $4, $5)`,
        [tarih, yoneticiId, o.istasyonId, std, cal]);
      await sahip().sorgu("UPDATE arkon_anomali_gunu SET durum = 'kesin', kapanis = now() WHERE tarih = $1::date", [tarih]);
    }
    const v = (await istek<AnomaliIstatistikCevabi>(yonetici, 'GET', '/arkon/anomali-istatistik?donem=hafta&tarih=2024-01-03')).govde;
    assert.deepEqual([v.bas, v.bit, v.gunler.length, v.toplam.kayitliGun], ['2024-01-01', '2024-01-07', 7, 2]);
    assert.equal(v.toplam.oran, 0.82, '90 / 110; günlük oranların ortalaması 0,45 olurdu');
    assert.deepEqual([v.toplam.beklenen, v.toplam.uretilen, v.toplam.hurda, v.toplam.performans, v.toplam.planDisi], [110, 90, 2, 0.9, 0]);
    const ist = v.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
    assert.deepEqual([ist.isaretliGun, ist.gun, ist.oran], [1, 2, 0.82]);
    const sali = v.gunler.find((g) => g.tarih === '2024-01-02')!;
    assert.deepEqual([sali.durum, sali.beklenen, sali.oran], [null, null, null], 'kaydı olmayan gün sıfır sayılmaz');
    assert.deepEqual(v.gunler.find((g) => g.tarih === '2024-01-03')!.isaretliIstasyon, 1);
    const ay = (await istek<AnomaliIstatistikCevabi>(yonetici, 'GET', '/arkon/anomali-istatistik?donem=ay&tarih=2024-01-20')).govde;
    assert.deepEqual([ay.bas, ay.bit, ay.gunler.length, ay.toplam.kayitliGun], ['2024-01-01', '2024-01-31', 31, 2]);
  });

  test('Terminal kural 5/5: gece vardiyasının gece yarısından sonraki sayımı başladığı güne yazılır; gün vardiya bitince kapanır, kesin gün değişmez', async () => {
    // Diğer testlerin günlerine dokunmasın diye on gün ileride kurulur; plan sonda kaldırılır (sınır canlı plandaki kaynaklardan okunur).
    const ileri = 10 * 24;
    const gun = gunEkle(tesisGunu(gunBasi), 10);
    const ertesi = gunEkle(gun, 1);
    const o = await ortamKur(1, { vardiya: false });
    const gece = (await sahip().tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ($1, '22:00', '06:00') RETURNING id", [`Gece ${(sayac += 1)}`]))!.id;
    await sahip().sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) SELECT $1, g, $2 FROM generate_series(1, 7) g', [o.merkezId, gece]);
    const ie = await isEmriKur(o.makineler[0]!, { birimSureDk: '2', bas: ileri + 22, bit: ileri + 30 });
    try {
      await sayimYaz(ie.emirId, yoneticiId, o.istasyonId, ileri + 23, 4);
      await sayimYaz(ie.emirId, yoneticiId, o.istasyonId, ileri + 26, 10);
      const gece02 = gunBasi + (ileri + 26) * SAAT;
      const s = await vt().tx(async (db) => anomaliler(db, (await kullaniciYukle(db, yoneticiId))!, undefined, gece02));
      assert.equal(s.tarih, gun, 'vardiya sürerken etkin gün başladığı gündür');
      const ist = s.istasyonlar.find((i) => i.istasyonId === o.istasyonId)!;
      assert.equal(ist.uretilen, 14, 'gece yarısından önceki ve sonraki sayım aynı günde');
      assert.equal(ist.beklenen, 120, '22:00-02:00 dört saat / 2 dk');

      await kaydet(gece02);
      const kayit = (t: string) => sahip().tek<{ durum: string }>('SELECT durum FROM arkon_anomali_gunu WHERE tarih = $1::date', [t]);
      assert.equal((await kayit(gun))?.durum, 'acik');
      assert.equal(await kayit(ertesi), null, 'takvimde ertesi gün olsa da kayıt açılmaz');
      // Takvim gününün bitişinden gecikme kadar sonra: vardiya 06:00'ya sürdüğü için gün kapanmaz.
      await kaydet(gunBasi + (ileri + 24) * SAAT + 2 * SAAT + 1);
      assert.equal((await kayit(gun))?.durum, 'acik', 'gece vardiyası bitmeden gün kapanmaz');
      // Vardiya bittikten (06:00) gecikme kadar sonra kesinleşir; sayım penceresi 06:00'da biter.
      await sayimYaz(ie.emirId, yoneticiId, o.istasyonId, ileri + 31, 7);
      await kaydet(gunBasi + (ileri + 30) * SAAT + 2 * SAAT);
      assert.equal((await kayit(gun))?.durum, 'kesin');
      const satir = await sahip().tek<{ uretilen: number }>(
        "SELECT uretilen FROM arkon_anomali_satiri WHERE tarih = $1::date AND kirilim = 'istasyon' AND kimlik = $2", [gun, o.istasyonId]);
      assert.equal(satir?.uretilen, 14, '06:00 sonrası sayım ertesi güne kalır');
      // Kesin gün sonraki koşularda yeniden yazılmaz.
      await sayimYaz(ie.emirId, yoneticiId, o.istasyonId, ileri + 27, 5);
      await kaydet(gunBasi + (ileri + 34) * SAAT);
      assert.equal((await sahip().tek<{ uretilen: number }>(
        "SELECT uretilen FROM arkon_anomali_satiri WHERE tarih = $1::date AND kirilim = 'istasyon' AND kimlik = $2", [gun, o.istasyonId]))?.uretilen, 14);
    } finally {
      await sahip().sorgu('DELETE FROM plan_yerlesimi WHERE is_emri_id = $1', [ie.isEmriId]);
    }
  });
});
