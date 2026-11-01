import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import { z } from 'zod';
import { kayitNoktasi } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uc, uclariKaydet } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import {
  KOMUT_ISLEMI, emirBaslat, emirBitir, emirDevam, emirDuraklat, emirDurdur, emirHurdalari, emirIdleri, emirlerinIsEmriIdleri, emirMalzemeleri, emirOzeti, emirSayim, kararliSayimiSonuclandir, takvimKayitlari,
} from './disari.ts';
import { BASLAMAMIS_EMIR, KAPSAM_DISI } from './kurallar.ts';
import { emirAc } from './servis.ts';
import { uclar } from './uclar.ts';

class DisIsReddi extends Error {}

describe('uretim-emirleri dışa açık komutlar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let operator: Kullanici;
  let kisitli: Kullanici;
  let depocu: Kullanici;
  let durusId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const sahip = (): TestVeritabani['sahip'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.sahip;
  };

  // Kullanıcı gerçek yükleyiciden gelir: işlem listesi rolün veritabanındaki işlemleridir, elle kurulmaz.
  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<Kullanici> {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const kullanici = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (kullanici === null) throw new Error('kullanıcı yüklenemedi');
    return kullanici;
  }

  async function istasyonKur(): Promise<{ istasyonId: number; isMerkeziId: number }> {
    sayac += 1;
    const im = await sahip().tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`DIM${sayac}`, 'Deneme Merkezi']);
    const ist = await sahip().tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`DIS${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id],
    );
    if (!im || !ist) throw new Error('istasyon kurulamadı');
    // UE20: başlatan istasyonda yetkin olmalı; testin kişileri her yeni istasyonda yetkindir. 'kisitli' yetkin değildir: yetkinlik iş
    // merkezi kapsamını genişletir, kapsam reddi başka türlü sınanamaz.
    await sahip().sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi IS DISTINCT FROM 'kisitli'", [ist.id]);
    return { istasyonId: ist.id, isMerkeziId: im.id };
  }

  async function planliEmir(): Promise<{ id: number; emirNo: string; istasyonId: number; isMerkeziId: number }> {
    const yer = await istasyonKur();
    const { emir } = await vt().tx((db) => emirAc(db, yoneticiId, { parcaNo: 'P-1', parcaAd: 'Deneme Parçası', adet: 10, istasyonId: yer.istasyonId }));
    return { id: emir.id, emirNo: emir.emirNo, ...yer };
  }

  const durum = async (id: number) => (await vt().tek<{ durum: string }>('SELECT durum FROM uretim_emri WHERE id = $1', [id]))?.durum;
  const satirSayisi = async (tablo: 'uretim_sayimi' | 'uretim_kaydi', emirId: number) =>
    (await vt().tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${tablo} WHERE emir_id = $1`, [emirId]))?.n;
  const saglamToplami = async (emirId: number) =>
    (await vt().tek<{ s: number }>("SELECT COALESCE(sum(adet), 0)::int AS s FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'saglam'", [emirId]))?.s;

  const reddi = async (is: Promise<unknown>): Promise<UygulamaHatasi> => {
    const hata: unknown = await is.then(() => null, (h: unknown) => h);
    assert.ok(hata instanceof UygulamaHatasi, `UygulamaHatasi beklenirdi: ${String(hata)}`);
    return hata;
  };

  // 327 a: ilk sağlam sayım karar bekler; sağlamı sınayan test ilk parçayı onaylar.
  const ilkParcaOnay = (db: Db, emirId: number) => kararliSayimiSonuclandir(db, yoneticiId, emirId, 'onay');

  before(async () => {
    ortam = await testVeritabaniKur('ue_disari');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    operator = await kisiEkle('operator', 'operator');
    kisitli = await kisiEkle('kisitli', 'operator');
    depocu = await kisiEkle('depocu', 'depo');
    durusId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ('DT-D1', 'Deneme duruşu', 'plansiz', 901) RETURNING id",
    ))!.id;
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('komutlar çağıranın transaction\'ında koşar: akış tek transaction\'da ilerler, emir özeti ara durumu görür, bitince kalıcıdır', async () => {
    const emir = await planliEmir();
    await vt().tx(async (db) => {
      assert.deepEqual(await emirOzeti(db, emir.id), { id: emir.id, emirNo: emir.emirNo, durum: 'planli', istasyonId: emir.istasyonId });
      await emirBaslat(db, operator, emir.id);
      assert.equal((await emirOzeti(db, emir.id))?.durum, 'basladi');
      // Yazı henüz onaylanmadı: başka bağlantı emri planlı görür.
      assert.equal(await durum(emir.id), 'planli');
      await emirSayim(db, operator, emir.id, { tur: 'saglam', adet: 3 });
      await ilkParcaOnay(db, emir.id);
      await emirDuraklat(db, operator, emir.id);
      await emirDevam(db, operator, emir.id);
      await emirDurdur(db, operator, emir.id, durusId);
      await emirDevam(db, operator, emir.id);
      const son = await emirSayim(db, operator, emir.id, { tur: 'saglam', adet: -1 });
      assert.equal(son.emir.canli?.saglam, 2);
      const biten = await emirBitir(db, operator, emir.id, undefined);
      assert.equal(biten.emir.durum, 'bitti');
      assert.equal(biten.emir.saglamAdet, 2);
    });
    assert.equal(await durum(emir.id), 'bitti');
    assert.equal(await saglamToplami(emir.id), 2);
  });

  test('335: emir hurdası mamul ve yarı mamul kartıyla, düzeltmeler düşülmüş net adet ve kart birimiyle döner; kartsız ve başka türde kart dönmez', async () => {
    const neden = (await sahip().tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('DH-335', 'Çapak', 961) RETURNING id"))!.id;
    await sahip().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('DH-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = async (tur: 'mamul' | 'yarimamul' | 'hammadde', birim: string | null) => {
      sayac += 1;
      return (await sahip().tek<{ no: number; kod: string }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, $2, 'DH-', $3, 'aktif', $4, $5, $5) RETURNING no, stok_kodu AS kod`,
        [`dh-${sayac}`, tur, sayac, JSON.stringify({ id: `dh-${sayac}`, com: { ad: `Deneme ${tur}`, ...(birim ? { birim } : {}) } }), yoneticiId],
      ))!;
    };
    const kartli = async (k: { no: number } | null, hurdalar: number[]) => {
      const e = await planliEmir();
      await vt().tx(async (db) => {
        await emirBaslat(db, operator, e.id);
        for (const adet of hurdalar) await emirSayim(db, operator, e.id, { tur: 'hurda', adet, hurdaNedeniId: neden });
      });
      // Kart sayımdan sonra bağlanır: kartlı emir rotasız başlatılamaz, kart yalnız okunan bilgidir.
      if (k) await sahip().sorgu('UPDATE uretim_emri SET malzeme_no = $2 WHERE id = $1', [e.id, k.no]);
      return e.id;
    };
    const mamul = await kart('mamul', 'ADET');
    const yari = await kart('yarimamul', null);
    const a = await kartli(mamul, [3, 2, -1]);
    const b = await kartli(yari, []);
    const c = await kartli(await kart('hammadde', 'KG'), [1]);
    const d = await kartli(null, [1]);

    const sonuc = await vt().tx((db) => emirHurdalari(db, [a, b, c, d, 999999]));
    assert.deepEqual(sonuc, [
      { uretimEmriId: a, malzemeId: mamul.no, stokKodu: mamul.kod, tur: 'mamul', birim: 'ADET', hurdaAdet: 4 },
      { uretimEmriId: b, malzemeId: yari.no, stokKodu: yari.kod, tur: 'yarimamul', birim: null, hurdaAdet: 0 },
    ]);
    assert.deepEqual(await vt().tx((db) => emirHurdalari(db, [])), []);
  });

  test('dış transaction geri alınınca başlatma ve sayım da geri alınır', async () => {
    const emir = await planliEmir();
    await assert.rejects(
      vt().tx(async (db) => {
        await emirBaslat(db, operator, emir.id);
        await emirSayim(db, operator, emir.id, { tur: 'saglam', adet: 4 });
        const c = await ilkParcaOnay(db, emir.id);
        // Önce yazının gerçekten yapıldığı görülür; yoksa aşağıdaki yokluk boş yere geçerdi.
        assert.equal(c.emir.canli?.saglam, 4);
        throw new DisIsReddi('üst modül vazgeçti');
      }),
      DisIsReddi,
    );
    assert.equal(await durum(emir.id), 'planli');
    assert.equal(await satirSayisi('uretim_sayimi', emir.id), 0);
    assert.equal(await satirSayisi('uretim_kaydi', emir.id), 0);
  });

  test('kapsam: iş merkezi kısıtı dışındaki kişinin komutu YETKI_YOK ile reddedilir, yazı olmaz; kapsama alınınca aynı çağrı geçer', async () => {
    const emir = await planliEmir();
    const baska = await istasyonKur();
    await vt().tx((db) => emirBaslat(db, operator, emir.id));
    await sahip().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisitli.id, baska.isMerkeziId]);
    try {
      const hata = await reddi(vt().tx((db) => emirSayim(db, kisitli, emir.id, { tur: 'saglam', adet: 1 })));
      assert.equal(hata.kod, 'YETKI_YOK');
      assert.equal(hata.message, KAPSAM_DISI);
      assert.equal(await satirSayisi('uretim_sayimi', emir.id), 0);

      await sahip().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisitli.id, emir.isMerkeziId]);
      await vt().tx(async (db) => { await emirSayim(db, kisitli, emir.id, { tur: 'saglam', adet: 1 }); await ilkParcaOnay(db, emir.id); });
      assert.equal(await saglamToplami(emir.id), 1);
    } finally {
      await sahip().sorgu('DELETE FROM kisi_is_merkezi WHERE kisi_id = $1', [kisitli.id]);
    }
  });

  test('kural reddi UygulamaHatasi fırlatır; kayıt noktasında koşan ret çağıranın önceki ve sonraki yazısını bozmaz', async () => {
    const kendi = await planliEmir();
    const planli = await planliEmir();
    const sonuc = await vt().tx(async (db: Db) => {
      await emirBaslat(db, operator, kendi.id);
      const ic = await kayitNoktasi(db, () => emirSayim(db, operator, planli.id, { tur: 'saglam', adet: 1 }));
      await emirSayim(db, operator, kendi.id, { tur: 'saglam', adet: 5 });
      await ilkParcaOnay(db, kendi.id);
      return ic;
    });
    assert.equal(sonuc.tamam, false);
    if (sonuc.tamam) return;
    assert.ok(sonuc.hata instanceof UygulamaHatasi);
    assert.equal(sonuc.hata.kod, 'CAKISMA');
    assert.equal(sonuc.hata.message, BASLAMAMIS_EMIR);
    assert.equal(await durum(kendi.id), 'basladi');
    assert.equal(await saglamToplami(kendi.id), 5);
    assert.equal(await satirSayisi('uretim_sayimi', planli.id), 0);
  });

  test('emir kimlikleri numaradan: bulunamayan numara haritada yok; boş dizide boş harita', async () => {
    const [a, b] = [await planliEmir(), await planliEmir()];
    const harita = await vt().okumaTx((db) => emirIdleri(db, [a.emirNo, b.emirNo, a.emirNo, 'YOK-0000']));
    assert.deepEqual([...harita].sort(), [[a.emirNo, a.id], [b.emirNo, b.id]].sort());
    assert.equal((await vt().okumaTx((db) => emirIdleri(db, []))).size, 0);
  });

  test('1379 a: emrin bütün iş emirleri bitmiş ve fason dahil sırayla döner; iş emirsiz emir haritada yok, boş dizide boş harita', async () => {
    const [a, b] = [await planliEmir(), await planliEmir()];
    const firma = (await sahip().tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Fasoncu 1379', 'tedarikci', $1) RETURNING id", [yoneticiId]))!.id;
    const ekle = async (sira: number, durum: string, fason: number | null) => (await sahip().tek<{ id: number }>(
      `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, durum, fason_firma_id, baslama, bitis, saglam_adet)
       VALUES ($1, $2, $3, (SELECT min(id) FROM istasyonlar_operasyon_tipi), 'Deneme', $4::text, $5,
               CASE WHEN $4::text = 'tamam' THEN now() - interval '1 hour' END, CASE WHEN $4::text = 'tamam' THEN now() END, CASE WHEN $4::text = 'tamam' THEN 10 END)
       RETURNING id`, [a.id, sira, sira * 10, durum, fason]))!.id;
    const ikinci = await ekle(2, 'bekliyor', firma);
    const ilk = await ekle(1, 'tamam', null);
    const harita = await vt().okumaTx((db) => emirlerinIsEmriIdleri(db, [a.id, b.id, a.id]));
    assert.deepEqual([...harita], [[a.id, [ilk, ikinci]]]);
    assert.equal((await vt().okumaTx((db) => emirlerinIsEmriIdleri(db, []))).size, 0);
  });

  test('1714: emrin malzemesi ve üst emri toplu okunur; olmayan kimlik haritada yok, boş dizide boş harita', async () => {
    const [a, b] = [await planliEmir(), await planliEmir()];
    const db = (await sahip().sorgu<{ id: number; malzemeNo: number | null; ustEmirId: number | null }>(
      'SELECT id, malzeme_no AS "malzemeNo", ust_emir_id AS "ustEmirId" FROM uretim_emri WHERE id = ANY($1::int[]) ORDER BY id', [[a.id, b.id]]));
    const harita = await vt().okumaTx((t) => emirMalzemeleri(t, [b.id, a.id, a.id, 2_000_000_000]));
    assert.deepEqual([...harita].sort(([x], [y]) => x - y), db.map((r) => [r.id, { malzemeNo: r.malzemeNo, ustEmirId: r.ustEmirId }]));
    assert.equal((await vt().okumaTx((t) => emirMalzemeleri(t, []))).size, 0);
  });

  test('emir özeti: olmayan kimlikte null döner, hata vermez', async () => {
    const emir = await planliEmir();
    assert.equal((await emirOzeti(vt(), emir.id))?.id, emir.id);
    assert.equal(await emirOzeti(vt(), 2_000_000_000), null);
  });

  test('emir özeti kilit almaz: salt okunur transaction\'da okunur (satır kilidi orada reddedilir)', async () => {
    const emir = await planliEmir();
    await assert.rejects(vt().okumaTx((db) => db.sorgu('SELECT 1 FROM uretim_emri WHERE id = $1 FOR UPDATE', [emir.id])), { code: '25006' });
    assert.equal((await vt().okumaTx((db) => emirOzeti(db, emir.id)))?.emirNo, emir.emirNo);
  });

  const yazilar = async (emirId: number) =>
    vt().tek(
      `SELECT (SELECT durum FROM uretim_emri WHERE id = $1) AS durum,
              (SELECT count(*)::int FROM uretim_kaydi WHERE emir_id = $1) AS kayit,
              (SELECT count(*)::int FROM uretim_sayimi WHERE emir_id = $1) AS sayim,
              (SELECT count(*)::int FROM uretim_olayi WHERE emir_id = $1) AS olay`, [emirId]);

  test('işlem: uçların aradığı işlemi taşımayan kullanıcının altı komutu da YETKI_YOK alır ve yazı olmaz; işlemi olanın aynı çağrısı geçer', async () => {
    // Dışa açık komutun aradığı işlem, ucu kalan tek terminal komutunun (duraklat) işlemidir; öbür beşinin ucu yoktur (238 H3).
    const komutUclari = uclar.filter((u) => /\/uretim-emirleri\/:id\/(baslat|bitir|sayim|duraklat|devam|durdur)$/.test(u.yol));
    assert.deepEqual(komutUclari.map((u) => [u.yol, u.yetki]), [['/uretim-emirleri/:id/duraklat', KOMUT_ISLEMI]]);
    // Yükleyici gerçekten ayırıyor: yoksa aşağıdaki retler boş listeden doğardı.
    assert.equal(operator.islemler.includes(KOMUT_ISLEMI), true);
    assert.equal(depocu.islemler.includes(KOMUT_ISLEMI), false);
    assert.equal(depocu.islemler.length > 0, true);

    const emir = await planliEmir();
    const adimlar: [string, (db: Db, kim: Kullanici) => Promise<unknown>][] = [
      ['başlat', (db, kim) => emirBaslat(db, kim, emir.id)],
      ['sayım', (db, kim) => emirSayim(db, kim, emir.id, { tur: 'saglam', adet: 2 })],
      ['duraklat', (db, kim) => emirDuraklat(db, kim, emir.id)],
      ['devam', (db, kim) => emirDevam(db, kim, emir.id)],
      ['durdur', (db, kim) => emirDurdur(db, kim, emir.id, durusId)],
      ['bitir', (db, kim) => emirBitir(db, kim, emir.id)],
    ];
    for (const [ad, komut] of adimlar) {
      const once = await yazilar(emir.id);
      const hata = await reddi(vt().tx((db) => komut(db, depocu)));
      assert.equal(hata.kod, 'YETKI_YOK', ad);
      // Kapsam reddi değil: kişinin iş merkezi kısıtı yok, eksik olan işlemdir.
      assert.notEqual(hata.message, KAPSAM_DISI, ad);
      assert.deepEqual(await yazilar(emir.id), once, ad);
      await vt().tx((db) => komut(db, operator));
      assert.notDeepEqual(await yazilar(emir.id), once, ad);
    }
    assert.equal(await durum(emir.id), 'bitti');
  });

  test('uç katmanından: tekrar korumalı yazma ucunun işleyicisi alt komutun reddini kayıt noktasında tutar, kendi komutu ve saklı cevap kalır', async () => {
    const kendi = await planliEmir();
    const planli = await planliEmir();
    await vt().tx((db) => emirBaslat(db, operator, kendi.id));
    let kosma = 0;
    const app = Fastify();
    uclariKaydet(app, [uc({
      yontem: 'POST', yol: '/deneme/yansit', yetki: KOMUT_ISLEMI, tekrarKorumali: true,
      cevap: z.object({ reddedildi: z.boolean(), neden: z.string().nullable() }),
      isle: async ({ db, kullanici }) => {
        kosma += 1;
        await emirSayim(db, kullanici, kendi.id, { tur: 'saglam', adet: 3 });
        await ilkParcaOnay(db, kendi.id);
        const alt = await kayitNoktasi(db, () => emirSayim(db, kullanici, planli.id, { tur: 'saglam', adet: 1 }));
        await emirSayim(db, kullanici, kendi.id, { tur: 'saglam', adet: 4 });
        return { reddedildi: !alt.tamam, neden: alt.tamam ? null : alt.hata.message };
      },
    })], { vt: vt(), kimlik: async () => operator, tekrar: tekrarDeposu });
    try {
      const basliklar = { 'istek-kimligi': '6f1b2c3d-0000-4000-8000-00000000d211' };
      const ilk = await app.inject({ method: 'POST', url: '/api/deneme/yansit', headers: basliklar });
      assert.deepEqual([ilk.statusCode, ilk.json()], [200, { reddedildi: true, neden: BASLAMAMIS_EMIR }]);
      assert.equal(await saglamToplami(kendi.id), 7);
      assert.equal(await satirSayisi('uretim_sayimi', planli.id), 0);
      const yine = await app.inject({ method: 'POST', url: '/api/deneme/yansit', headers: basliklar });
      assert.deepEqual([yine.statusCode, yine.json()], [200, { reddedildi: true, neden: BASLAMAMIS_EMIR }]);
      assert.equal(kosma, 1);
      assert.equal(await saglamToplami(kendi.id), 7);
    } finally {
      await app.close();
    }
  });

  test('891 takvim: planlı başlangıç ve teslim aralıktaysa ayrı kayıt; taslak, iptal ve aralık dışı gelmez; başlayan emrin başlangıcı biter', async () => {
    const tarihle = async (baslangic: string | null, teslim: string | null, durumu = 'planli') => {
      const e = await planliEmir();
      await sahip().sorgu(
        `UPDATE uretim_emri SET baslangic = $2::date, teslim = $3::date, durum = $4,
           baslama = CASE WHEN $4 = 'basladi' THEN now() END, iptal = CASE WHEN $4 = 'iptal' THEN now() END WHERE id = $1`,
        [e.id, baslangic, teslim, durumu]);
      return e;
    };
    const iki = await tarihle('2031-03-05', '2031-03-20');
    const teslimde = await tarihle('2031-02-20', '2031-03-10', 'basladi');
    await tarihle('2031-03-05', '2031-03-06', 'iptal');
    await tarihle('2031-03-05', '2031-03-06', 'taslak');
    await tarihle('2031-01-01', '2031-02-01');
    const l = (await vt().tx((db) => takvimKayitlari(db, '2031-03-01', '2031-03-31'))).filter((k) => [String(iki.id), String(teslimde.id)].includes(k.kimlik));
    assert.deepEqual(l.map((k) => [k.kimlik, k.kaynak, k.tarih, k.durum, k.bitti]), [
      [String(iki.id), 'emir-plan', '2031-03-05', 'Planlı', false],
      [String(iki.id), 'emir-bitis', '2031-03-20', 'Planlı', false],
      [String(teslimde.id), 'emir-bitis', '2031-03-10', 'Başladı', false],
    ]);
    assert.equal(l[0]?.no, iki.emirNo);
    assert.equal(l[0]?.ilgili, 'Deneme Parçası');
    const hepsi = await vt().tx((db) => takvimKayitlari(db, '2031-03-01', '2031-03-31'));
    assert.equal(hepsi.length, 3, 'iptal, taslak ve aralık dışı emir gelmez');
  });
});
