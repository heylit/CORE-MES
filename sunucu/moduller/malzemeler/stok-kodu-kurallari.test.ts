import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi, KatalogKartlariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { katalogKodOneki, katalogOnekiTureUyarMi, katalogStokKodu, katalogStokKoduSigarMi } from './kurallar.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

type Nesne = Record<string, unknown>;
interface Oturum { id: number; cerez: string }

// Kart #230. Ekranın (`katalog.html` `kodOnek`, `KOD_DESEN`) standart kod yapısı: `<TÜR>-<3 harf ya da rakam grup>-<sıra>`.
// TÜR: HM, YM, MM, SF, DB. Grup: kullanıcının yazdığı grubun ilk 3 harfi, tür tablosundaki kod ya da 'GEN'; kısaysa X ile 3'e tamamlanır.
const EKRANIN_URETTIKLERI: { tur: string; onek: string }[] = [
  { tur: 'hammadde', onek: 'HM-PAS-' }, { tur: 'hammadde', onek: 'HM-TNG-' }, { tur: 'hammadde', onek: 'HM-GEN-' },
  { tur: 'yarimamul', onek: 'YM-TAL-' }, { tur: 'yarimamul', onek: 'YM-GEN-' },
  { tur: 'mamul', onek: 'MM-ABX-' }, { tur: 'mamul', onek: 'MM-GEN-' },
  { tur: 'sarf', onek: 'SF-KYN-' }, { tur: 'sarf', onek: 'SF-KXX-' },
  { tur: 'demirbas', onek: 'DB-MAK-' }, { tur: 'demirbas', onek: 'DB-BIL-' }, { tur: 'hammadde', onek: 'HM-1A2-' },
];

test('MKK-1 (kart #230): kod öneki yalnız ekranın ürettiği biçimdir: tür-grup(3)-sayı', () => {
  for (const { tur, onek } of EKRANIN_URETTIKLERI) {
    assert.equal(katalogKodOneki(`${onek}00042`), onek, onek);
    assert.equal(katalogOnekiTureUyarMi(onek, tur), true, `${onek} ${tur}`);
  }
  assert.equal(katalogKodOneki('hm-pas-7'), 'HM-PAS-');
  for (const kod of ['ABC-00001', 'ÖZEL KOD', 'HM-PA-00001', 'HM-PASX-00001', 'HM-PAS-', 'HM-PAS-00012-2x1000', 'HM-PAS-AB-00001', 'XX-PAS-00001', null]) {
    assert.equal(katalogKodOneki(kod), null, String(kod));
  }
  assert.equal(katalogOnekiTureUyarMi('HM-PAS-', 'sarf'), false);
  assert.equal(katalogOnekiTureUyarMi('SF-KYN-', 'hammadde'), false);
});

test('Kural 3 (kart #230): stok kodu en çok 24 karakter; sıra 99999\'u aşınca yeniden denetlenir', () => {
  assert.equal(katalogStokKoduSigarMi('HM-PAS-', 99_999), true);
  assert.equal(katalogStokKoduSigarMi('A'.repeat(19), 99_999), true, '19 + 5 = 24');
  assert.equal(katalogStokKoduSigarMi('A'.repeat(20), 1), false, '20 + 5 = 25');
  assert.equal(katalogStokKoduSigarMi('A'.repeat(18), 100_000), true, '18 + 6 = 24');
  assert.equal(katalogStokKoduSigarMi('A'.repeat(19), 100_000), false, '19 + 6 = 25');
  assert.equal(katalogStokKodu('HM-PAS-', 100_000).length, 13);
});

test('Kural 3 (kart #230): önek, en büyük sıra numarasıyla bile sınırı aşmıyorsa kabul edilir; sınır tek yerde, önek kabulünde', () => {
  // En büyük sıra `int` (10 hane): 7 + 10 = 17. Sınır enjekte edilince önek kabulü onu uygular.
  assert.equal(katalogKodOneki('HM-PAS-1', 17), 'HM-PAS-');
  assert.equal(katalogKodOneki('HM-PAS-1', 16), null);
  assert.equal(katalogKodOneki('HM-PAS-1'), 'HM-PAS-');
  assert.equal(katalogStokKoduSigarMi('HM-PAS-', 2_147_483_647), true);
  assert.equal(katalogStokKoduSigarMi('HM-PAS-', 2_147_483_647, 16), false);
});

describe('Malzemeler stok kodu kuralları (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yazar: Oturum;
  let onayci: Oturum;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string): Promise<Oturum> {
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
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
  const gonder = async (o: Oturum, url: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: o.cerez }, payload: (await surumlu(vt(), url, govde)) as object });
  const durumu = (c: LightMyRequestResponse): { durum: number; kod?: string } =>
    ({ durum: c.statusCode, ...(c.statusCode === 200 ? {} : { kod: c.json().kod as string }) });

  // Ekranın gönderdiği gövde: kayıt (tür, com.kod, onay) ve özet (stok_kodu, tur, onay_durumu, anahtar).
  interface Kart { kimlik: string; tur: string; kod: string; surum: number | null }
  const yeniKart = (tur: string, kod: string): Kart => ({ kimlik: `sk${++sayac}`, tur, kod, surum: null });
  interface Ek { kayitTuru?: string; ozetTuru?: string; kod?: string; anahtar?: string | null; koruma?: string }
  const govde = (k: Kart, durum: string, ek: Ek = {}): { kayit: Nesne; ozet: Nesne; surum: number | null } => {
    const tur = ek.ozetTuru ?? k.tur;
    const kod = ek.kod ?? k.kod;
    return {
      kayit: { id: k.kimlik, tur: ek.kayitTuru ?? tur, fam: 'metal', com: { kod, ad: `Kod kart ${k.kimlik}`, birim: 'adet' }, opts: { koruma: [ek.koruma ?? 'Koruyucu folyo'] }, onay: { durum } },
      ozet: { stok_kodu: kod, tur, onay_durumu: durum, benzersiz_anahtar: ek.anahtar === undefined ? `${tur}|${k.kimlik}` : ek.anahtar, mukerrer_gerekcesi: null },
      surum: k.surum,
    };
  };
  const yol = (k: Kart): string => `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`;
  async function kaydet(o: Oturum, k: Kart, durum: string, ek: Ek = {}): Promise<KatalogKartiKaydetCevabi> {
    const c = await gonder(o, yol(k), govde(k, durum, ek));
    assert.equal(c.statusCode, 200, c.body);
    const r = c.json() as KatalogKartiKaydetCevabi;
    k.surum = r.surum;
    k.kod = r.stok_kodu;
    if (ek.ozetTuru) k.tur = ek.ozetTuru;
    return r;
  }
  const satir = (k: Kart) => vt().tek<{ tur: string; onek: string; stok_kodu: string; onay_durumu: string; icerik_kodu: string }>(
    "SELECT tur, onek, stok_kodu, onay_durumu, kayit -> 'com' ->> 'kod' AS icerik_kodu FROM malzeme_katalog_karti WHERE kimlik = $1", [k.kimlik]);
  const sirasiVar = async (onek: string): Promise<boolean> =>
    (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM malzeme_katalog_kod_sirasi WHERE onek = $1', [onek]))!.n > 0;

  before(async () => {
    ortam = await testVeritabaniKur('malzemestokkodu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = (await girisYap('k-yonetici', 'yonetici')).id;
    yazar = await girisYap('k-yazar', 'satin_alma');
    onayci = await girisYap('k-onayci', 'kalite');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('Kural 1: ekranın ürettiği her önek kabul edilir; sunucu kendi sırasını verir, gelen sayı yok sayılır, kod karta da yazılır', async () => {
    for (const { tur, onek } of EKRANIN_URETTIKLERI) {
      const k = yeniKart(tur, `${onek}00042`);
      const r = await kaydet(yazar, k, 'taslak');
      assert.equal(r.stok_kodu, `${onek}00001`, onek);
      assert.equal((await satir(k))?.icerik_kodu, `${onek}00001`);
    }
    const ikinci = yeniKart('hammadde', 'HM-PAS-99999');
    assert.equal((await kaydet(yazar, ikinci, 'taslak')).stok_kodu, 'HM-PAS-00002');
  });

  test('Kural 1: serbest, eksik, uzun ya da türe ters önek 400 olur; sıra tablosuna satır açılmaz', async () => {
    const kotuler: [string, string][] = [
      ['hammadde', 'ABC-00001'], ['hammadde', 'ÖZEL KOD'], ['hammadde', 'HM-PA-00001'], ['hammadde', 'HM-RED4-00001'],
      ['hammadde', 'HM-RED-'], ['hammadde', 'HM-RED-00012-2x1000'], ['sarf', 'HM-RED-00001'], ['hammadde', 'SF-RED-00001'],
    ];
    for (const [tur, kod] of kotuler) {
      const k = yeniKart(tur, kod);
      assert.deepEqual(durumu(await gonder(yazar, yol(k), govde(k, 'taslak'))), { durum: 400, kod: 'DOGRULAMA' }, kod);
    }
    assert.equal(await sirasiVar('HM-RED-'), false);
    assert.equal(await sirasiVar('SF-RED-'), false);
  });

  const koruma = (k: Kart): Promise<unknown> =>
    vt().tek<{ k: unknown }>("SELECT kayit -> 'opts' -> 'koruma' -> 0 AS k FROM malzeme_katalog_karti WHERE kimlik = $1", [k.kimlik]).then((x) => x?.k);

  // Kullanıcı kartı 17.10.2026 ("Yenilensin"): hiç aktif olmamış taslakta önek (grup, çeşit, kategori) değişince yeni kod verilir;
  // ekran yeni öneki gösterir, sunucu eskisini tutarsa kayıttan sonra kod geri dönerdi. Aktif olmuş kartın kodu değişmez.
  test('Kural 1a (kullanıcı kartı 17.10): hiç aktif olmamış taslakta önek değişince yeni önekle yeni kod verilir; aynı önekte kod aynı kalır', async () => {
    const t = yeniKart('hammadde', 'HM-KYT-00001');
    await kaydet(yazar, t, 'taslak');
    const ayni = await kaydet(yazar, t, 'taslak', { kod: 'HM-KYT-00077' });
    assert.equal(ayni.stok_kodu, 'HM-KYT-00001', 'aynı önekte gelen sayı yok sayılır');
    const r = await kaydet(yazar, t, 'taslak', { kod: 'HM-BSK-00077' });
    assert.equal(r.stok_kodu, 'HM-BSK-00001');
    assert.deepEqual(await satir(t), { tur: 'hammadde', onek: 'HM-BSK-', stok_kodu: 'HM-BSK-00001', onay_durumu: 'taslak', icerik_kodu: 'HM-BSK-00001' });
    // Taslaktan onaya giden yazımda da (ekranın tek yolu) yeni önek alınır.
    const o = yeniKart('hammadde', 'HM-KYG-00001');
    await kaydet(yazar, o, 'taslak');
    assert.equal((await kaydet(yazar, o, 'onayda', { kod: 'HM-KYH-00001' })).stok_kodu, 'HM-KYH-00001');
  });

  test('Kural 1a (kullanıcı kartı 17.10): taslakta geçersiz ya da türe ters önek kodu değiştirmez ve kaydı reddetmez; bir kez aktif olmuş taslağın kodu değişmez', async () => {
    const t = yeniKart('hammadde', 'HM-KYK-00001');
    await kaydet(yazar, t, 'taslak');
    for (const kod of ['ÖZEL KOD', 'SF-KYK-00001']) {
      const c = await gonder(yazar, yol(t), govde(t, 'taslak', { kod }));
      assert.equal(c.statusCode, 200, c.body);
      t.surum = (c.json() as KatalogKartiKaydetCevabi).surum;
      assert.equal((await satir(t))?.stok_kodu, 'HM-KYK-00001', kod);
    }
    assert.equal(await sirasiVar('SF-KYK-'), false);

    const a = yeniKart('hammadde', 'HM-KYL-00001');
    await kaydet(yazar, a, 'onayda');
    await kaydet(onayci, a, 'aktif');
    await kaydet(onayci, a, 'taslak');
    const c = await gonder(onayci, yol(a), govde(a, 'taslak', { kod: 'HM-KYM-00001' }));
    assert.equal(c.statusCode, 200, c.body);
    assert.equal((await satir(a))?.stok_kodu, 'HM-KYL-00001', 'aktif olmuş kartın kodu değişmez');
    assert.equal(await sirasiVar('HM-KYM-'), false);
  });

  test('Kural 1: kayıtlı kartta gelen kod yok sayılır (onaydakinde, akış kapalı aktifte); içerik kaydedilir, kod aynı kalır', async () => {
    // Ekranın "Otomatiğe dön" yolu: onaydaki kartta sınıf değişir, yeni önekli kod gelir; içerik değişikliği kaybolmaz.
    const o = yeniKart('hammadde', 'HM-KYO-00001');
    await kaydet(yazar, o, 'onayda');
    const c = await gonder(yazar, yol(o), govde(o, 'onayda', { kod: 'HM-KYN-00001', koruma: 'Yeni koruma' }));
    assert.equal(c.statusCode, 200, c.body);
    assert.equal((c.json() as KatalogKartiKaydetCevabi).stok_kodu, 'HM-KYO-00001');
    assert.equal(await koruma(o), 'Yeni koruma');
    assert.equal((await satir(o))?.icerik_kodu, 'HM-KYO-00001');

    const yonetici = await girisYap('k-yonetici-ayar', 'yonetici');
    const ayar = (acik: boolean): Promise<LightMyRequestResponse> => gonder(yonetici, '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: acik } });
    const a = yeniKart('hammadde', 'HM-KYA-00001');
    await kaydet(yazar, a, 'onayda');
    await kaydet(onayci, a, 'aktif');
    assert.equal((await ayar(false)).statusCode, 200);
    try {
      const r = await gonder(yazar, yol(a), govde(a, 'aktif', { kod: 'HM-KYB-00001', koruma: 'Akış kapalı' }));
      assert.equal(r.statusCode, 200, r.body);
      assert.equal((r.json() as KatalogKartiKaydetCevabi).stok_kodu, 'HM-KYA-00001');
      assert.equal(await koruma(a), 'Akış kapalı');
      assert.equal((await satir(a))?.icerik_kodu, 'HM-KYA-00001');
    } finally {
      assert.equal((await ayar(true)).statusCode, 200);
    }
  });

  test('Kural 2: taslakta tür değişince yeni türün önekiyle yeni kod verilir; eski kod başka karta gitmez, sırada delik kalır', async () => {
    const k = yeniKart('hammadde', 'HM-TRD-00001');
    await kaydet(yazar, k, 'taslak');
    assert.equal(k.kod, 'HM-TRD-00001');
    const r = await kaydet(yazar, k, 'taslak', { ozetTuru: 'sarf', kod: 'SF-TRD-00033' });
    assert.equal(r.stok_kodu, 'SF-TRD-00001');
    assert.deepEqual(await satir(k), { tur: 'sarf', onek: 'SF-TRD-', stok_kodu: 'SF-TRD-00001', onay_durumu: 'taslak', icerik_kodu: 'SF-TRD-00001' });
    const baska = yeniKart('hammadde', 'HM-TRD-00001');
    assert.equal((await kaydet(yazar, baska, 'taslak')).stok_kodu, 'HM-TRD-00002', 'eski kod yeniden verilmez');
    const kayitlar = (await vt().sorgu<{ stok_kodu: string }>('SELECT stok_kodu FROM malzeme_katalog_karti')).map((x) => x.stok_kodu);
    assert.equal(new Set(kayitlar).size, kayitlar.length, 'aynı kod iki karta verilmez');
  });

  test('Kural 2: tür değişiminde yeni önek türe uymalı (gövdedeki tür sarf, kod HM- ise 400); kart değişmez', async () => {
    const k = yeniKart('hammadde', 'HM-TUY-00001');
    await kaydet(yazar, k, 'taslak');
    const c = await gonder(yazar, yol(k), govde(k, 'taslak', { ozetTuru: 'sarf', kod: 'HM-TUY-00001' }));
    assert.deepEqual(durumu(c), { durum: 400, kod: 'DOGRULAMA' });
    assert.equal((await satir(k))?.tur, 'hammadde');
  });

  test('Kural 2: taslak dışında (onayda, aktif, pasif) tür ve kod kilitli: tür değiştirme isteği 422 alır', async () => {
    const onayda = yeniKart('hammadde', 'HM-KLT-00001');
    await kaydet(yazar, onayda, 'onayda');
    const aktif = yeniKart('hammadde', 'HM-KLT-00001');
    await kaydet(yazar, aktif, 'onayda');
    await kaydet(onayci, aktif, 'aktif');
    const pasif = yeniKart('hammadde', 'HM-KLT-00001');
    await kaydet(yazar, pasif, 'onayda');
    await kaydet(onayci, pasif, 'aktif');
    await kaydet(onayci, pasif, 'pasif');
    for (const [k, durum, kullanici] of [[onayda, 'onayda', yazar], [aktif, 'aktif', onayci], [pasif, 'pasif', onayci]] as [Kart, string, Oturum][]) {
      const onceki = await satir(k);
      const c = await gonder(kullanici, yol(k), govde(k, durum, { ozetTuru: 'sarf', kod: 'SF-KLT-00001' }));
      assert.deepEqual(durumu(c), { durum: 422, kod: 'GECERSIZ' }, durum);
      assert.deepEqual(await satir(k), onceki, durum);
    }
    assert.equal(await sirasiVar('SF-KLT-'), false, 'reddedilen istek sıra tüketmez');
  });

  test('Kural 2: eski durum taslaksa tür değişimi yeni durumdan bağımsızdır: taslak -> onayda ile aynı yazımda yeni türün koduyla (ekranın tek yolu)', async () => {
    const k = yeniKart('hammadde', 'HM-CKS-00001');
    await kaydet(yazar, k, 'taslak');
    const r = await kaydet(yazar, k, 'onayda', { ozetTuru: 'sarf', kod: 'SF-CKS-00001' });
    assert.equal(r.stok_kodu, 'SF-CKS-00001');
    assert.deepEqual(await satir(k), { tur: 'sarf', onek: 'SF-CKS-', stok_kodu: 'SF-CKS-00001', onay_durumu: 'onayda', icerik_kodu: 'SF-CKS-00001' });
    // Onaya çıktıktan sonra yeniden değişmez.
    assert.deepEqual(durumu(await gonder(yazar, yol(k), govde(k, 'onayda', { ozetTuru: 'mamul', kod: 'MM-CKS-00001' }))), { durum: 422, kod: 'GECERSIZ' });
  });

  test('Kural 2: bir kez aktif olmuş kart taslağa çekilse de tür ve kod kilitli kalır; hiç aktif olmamış taslak (onaydan dönen dahil) serbest', async () => {
    const aktifOlmus = yeniKart('hammadde', 'HM-AKT-00001');
    await kaydet(yazar, aktifOlmus, 'onayda');
    await kaydet(onayci, aktifOlmus, 'aktif');
    await kaydet(onayci, aktifOlmus, 'taslak');
    assert.equal((await satir(aktifOlmus))?.onay_durumu, 'taslak');
    assert.deepEqual(durumu(await gonder(yazar, yol(aktifOlmus), govde(aktifOlmus, 'taslak', { ozetTuru: 'sarf', kod: 'SF-AKT-00001' }))), { durum: 422, kod: 'GECERSIZ' });
    assert.equal((await satir(aktifOlmus))?.stok_kodu, 'HM-AKT-00001');
    // Gelen farklı kod yok sayılır, içerik kaydedilir.
    assert.equal((await gonder(yazar, yol(aktifOlmus), govde(aktifOlmus, 'taslak', { kod: 'HM-AKY-00001' }))).statusCode, 200);
    assert.equal((await satir(aktifOlmus))?.stok_kodu, 'HM-AKT-00001');
    assert.equal(await sirasiVar('SF-AKT-'), false);

    // Pasif de "aktif olmuş" sayılır (göç doldurması gibi): hiç aktif olmamış taslak → pasif → taslak sonrası kilitli.
    const pasifOlmus = yeniKart('hammadde', 'HM-PSF-00001');
    await kaydet(yazar, pasifOlmus, 'taslak');
    await kaydet(onayci, pasifOlmus, 'pasif');
    await kaydet(onayci, pasifOlmus, 'taslak');
    assert.equal((await satir(pasifOlmus))?.onay_durumu, 'taslak');
    assert.deepEqual(durumu(await gonder(yazar, yol(pasifOlmus), govde(pasifOlmus, 'taslak', { ozetTuru: 'sarf', kod: 'SF-PSF-00001' }))), { durum: 422, kod: 'GECERSIZ' });
    assert.equal(await sirasiVar('SF-PSF-'), false);

    const reddedilmis = yeniKart('hammadde', 'HM-RDD-00001');
    await kaydet(yazar, reddedilmis, 'onayda');
    await kaydet(onayci, reddedilmis, 'taslak');
    const r = await kaydet(yazar, reddedilmis, 'taslak', { ozetTuru: 'sarf', kod: 'SF-RDD-00001' });
    assert.equal(r.stok_kodu, 'SF-RDD-00001');
  });

  test('Kural 4: benzersiz anahtar zorunluluğu yeni türe göre denetlenir (iki yönde)', async () => {
    const m = yeniKart('mamul', 'MM-ANH-00001');
    await kaydet(yazar, m, 'taslak', { anahtar: null });
    assert.deepEqual(durumu(await gonder(yazar, yol(m), govde(m, 'taslak', { ozetTuru: 'hammadde', kod: 'HM-ANH-00001', anahtar: null }))), { durum: 400, kod: 'DOGRULAMA' });
    assert.equal((await satir(m))?.tur, 'mamul');
    const h = yeniKart('hammadde', 'HM-ANI-00001');
    await kaydet(yazar, h, 'taslak');
    assert.equal((await kaydet(yazar, h, 'taslak', { ozetTuru: 'mamul', kod: 'MM-ANI-00001', anahtar: null })).stok_kodu, 'MM-ANI-00001');
    assert.equal((await satir(h))?.tur, 'mamul');
  });

  test('Kural 2: eşzamanlı tür değişimlerinde ve yeni kartlarda aynı kod iki karta verilmez', async () => {
    const kartlar = Array.from({ length: 6 }, () => yeniKart('hammadde', 'HM-ESZ-00001'));
    for (const k of kartlar) await kaydet(yazar, k, 'taslak');
    const yeniler = Array.from({ length: 4 }, () => yeniKart('sarf', 'SF-ESZ-00001'));
    const sonuc = await Promise.all([
      ...kartlar.map((k) => gonder(yazar, yol(k), govde(k, 'taslak', { ozetTuru: 'sarf', kod: 'SF-ESZ-00001' }))),
      ...yeniler.map((k) => gonder(yazar, yol(k), govde(k, 'taslak'))),
    ]);
    assert.deepEqual(sonuc.map((c) => c.statusCode), Array(10).fill(200));
    const kodlar = (await vt().sorgu<{ stok_kodu: string }>("SELECT stok_kodu FROM malzeme_katalog_karti WHERE onek = 'SF-ESZ-'")).map((x) => x.stok_kodu);
    assert.equal(kodlar.length, 10);
    assert.equal(new Set(kodlar).size, 10);
  });

  test('Tetikleyici: taslakta tür, önek ve sıra değişir; açan kişi ve sayı kimliği hiçbir durumda; taslak dışında hepsi kilitli', async () => {
    const t = yeniKart('hammadde', 'HM-TTK-00001');
    await kaydet(yazar, t, 'taslak');
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SF-TTK-', 5) ON CONFLICT DO NOTHING");
    await vt().sorgu("UPDATE malzeme_katalog_karti SET tur = 'sarf', onek = 'SF-TTK-', sira_no = 6 WHERE kimlik = $1", [t.kimlik]);
    assert.equal((await satir(t))?.stok_kodu, 'SF-TTK-00006');
    await assert.rejects(
      vt().sorgu('UPDATE malzeme_katalog_karti SET acan_kisi_id = $2 WHERE kimlik = $1', [t.kimlik, onayci.id]),
      (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_degismez',
    );
    await assert.rejects(
      vt().sorgu('UPDATE malzeme_katalog_karti SET no = no + 1000 WHERE kimlik = $1', [t.kimlik]),
      (e: { code?: string }) => e.code === '428C9',
    );
    // Bir kez aktif olmuş kart taslağa dönse de tetikleyici kilitler; işaret geri alınamaz.
    const a = yeniKart('hammadde', 'HM-TTK-00001');
    await kaydet(yazar, a, 'onayda');
    await kaydet(onayci, a, 'aktif');
    await kaydet(onayci, a, 'taslak');
    await assert.rejects(
      vt().sorgu("UPDATE malzeme_katalog_karti SET tur = 'sarf', onek = 'SF-TTK-', sira_no = 8 WHERE kimlik = $1", [a.kimlik]),
      (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_degismez',
    );
    await vt().sorgu('UPDATE malzeme_katalog_karti SET aktif_oldu = false WHERE kimlik = $1', [a.kimlik]);
    assert.equal((await vt().tek<{ aktif_oldu: boolean }>('SELECT aktif_oldu FROM malzeme_katalog_karti WHERE kimlik = $1', [a.kimlik]))?.aktif_oldu, true);
    // Servis dışı INSERT ile aktif (ya da pasif) açılan kart da işaretlenir; sonra taslağa çekilince tür kilitli.
    for (const durum of ['aktif', 'pasif']) {
      const kimlik = `sk-ins-${durum}`;
      await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-INS-', 0) ON CONFLICT DO NOTHING");
      await vt().sorgu(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, 'hammadde', 'HM-INS-', $2, $3, $4, $5, $5)`,
        [kimlik, durum === 'aktif' ? 1 : 2, durum, { id: kimlik }, yazar.id],
      );
      assert.equal((await vt().tek<{ aktif_oldu: boolean }>('SELECT aktif_oldu FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))?.aktif_oldu, true, durum);
      await vt().sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'taslak' WHERE kimlik = $1", [kimlik]);
      await assert.rejects(
        vt().sorgu("UPDATE malzeme_katalog_karti SET tur = 'sarf', onek = 'SF-TTK-', sira_no = 9 WHERE kimlik = $1", [kimlik]),
        (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_degismez',
        durum,
      );
    }
    const o = yeniKart('hammadde', 'HM-TTK-00001');
    await kaydet(yazar, o, 'onayda');
    await assert.rejects(
      vt().sorgu("UPDATE malzeme_katalog_karti SET tur = 'sarf' WHERE kimlik = $1", [o.kimlik]),
      (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_degismez',
    );
    // Tetikleyici eski duruma bakar: hiç aktif olmamış taslaktan çıkarken aynı UPDATE'te tür değişimi geçer (ekranın tek yolu, servis de izin verir).
    const c = yeniKart('hammadde', 'HM-TTK-00001');
    await kaydet(yazar, c, 'taslak');
    await vt().sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'onayda', tur = 'mamul', onek = 'SF-TTK-', sira_no = 7 WHERE kimlik = $1", [c.kimlik]);
    assert.equal((await satir(c))?.tur, 'mamul');
  });

  test('Kural 3 (kart #232): veritabanı 24 karakteri aşan stok kodunu reddeder (kısıt); tam 24 karakterlik kod kabul edilir, kod değişimi yeni kodu 24 ile sınırlı verir', async () => {
    const ekle = (kimlik: string, onek: string) => vt().sorgu(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', $2, 1, 'taslak', $3, $4, $4)`,
      [kimlik, onek, { id: kimlik, tur: 'hammadde', com: { kod: `${onek}00001`, ad: 'Uzun kod' }, onay: { durum: 'taslak' } }, yazar.id],
    );
    const uzun = 'HM-ABCDEFGHIJKLMNOPQRSTU-';
    await vt().sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 1)', [uzun]);
    assert.ok(`${uzun}00001`.length > 24);
    await assert.rejects(ekle(`sk-uzun${++sayac}`, uzun), (h: { constraint?: string }) => h.constraint === 'malzeme_katalog_karti_stok_kodu_24');
    const sinirda = 'HM-ABCDEFGHIJKLMNO-';
    await vt().sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 1)', [sinirda]);
    const kimlik = `sk-uzun${++sayac}`;
    await ekle(kimlik, sinirda);
    const eski = `${sinirda}00001`;
    assert.equal(eski.length, 24);
    const liste = await app.inject({ method: 'GET', url: '/api/malzeme-katalogu-kartlari?sayfaBoyu=500', headers: { cookie: yazar.cerez } });
    assert.equal(liste.statusCode, 200);
    assert.ok((liste.json() as KatalogKartlariCevabi).satirlar.some((x) => x.kimlik === kimlik && x.kayit !== null));
    const k: Kart = { kimlik, tur: 'hammadde', kod: eski, surum: 1 };
    assert.equal((await kaydet(yazar, k, 'taslak')).stok_kodu, eski);
    const r = await kaydet(yazar, k, 'taslak', { ozetTuru: 'sarf', kod: 'SF-UZN-00001' });
    assert.equal(r.stok_kodu, 'SF-UZN-00001');
    assert.ok(r.stok_kodu.length <= 24);
  });
});
