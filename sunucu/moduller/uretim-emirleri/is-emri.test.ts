import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { ZodError } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { adimliBitenlerCevabi, adimliEmirCevabi, hazirlikCevabi, adimliListeCevabi, adimliOzetCevabi, emirCevabi, ozetCevabi, durusDagilimiCevabi, emirlerCevabi, izlemeListeCevabi, gunlukUretimCevabi, partiBolCevabi, sonOlaylarCevabi, refakatKartiCevabi, sayimGovdesi, sureOzetiCevabi, siradakiFasonCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimliBitenlerCevabi, AdimliEmirAyrintisi, EmirTuru, HazirlikCevabi, HazirlikMaddesi, AdimliListeCevabi, DurusDagilimiCevabi, Emir, EmirAyrintiCevabi, GunlukUretimCevabi, OzetCevabi, PartiBolCevabi, RefakatKartiCevabi, SureOzetiCevabi, SiradakiFasonCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import {
  acikEmir, acikEmirler, adimKararSayaclari, aralikAdetleri, emirBaslat, emirBitir, emirDevam, emirDurdur, emirSayim, kararliSayimiSonuclandir, gunlukAralikAdetleri, kisininGunlukIsEmirleri, katilimSureleri, makineSureleri, emirAkisKaydi, emirDurumlari, emirIptalEt, emirMalzemeIhtiyaci, emirNolari, emirOzeti, emirPlanBilgisiYaz, emirPlanaAl, fasonGecmisi, fasonHareketiOzeti, fasonIsEmirleri, isEmirleriniYenile, isEmriKaynagiYaz, isEmriOzeti,
  isEmriSureOzeti,
  acikIsEmirleri, acikIsEmri, bitenEmirler, bitenIsEmirleri, calismayaGecisAnlari, emirDilimi, istasyonDurusSureleri, fasonDonusuKaydet, isEmriPlanBilgileri, kirilimStandartSureleri, kisininHurdaNedenleri, kisininIsEmirleri, partiKomutuReddi, refakatKarti, standartSureler, planlanacakIsEmirleri, rotasizIsEmirleri, saglamSayimDinle, kaliteKarariDinle, hazirlikTamamlandiDinle, sonGirisler, uretimEmriAc, uretimEmriOzeti,
} from './disari.ts';
import { emirIptalDinle, fasonGonderimleri, isEmriKontrolListesi, refakatKartiSayimlari } from './disari.ts';
import type { EmirIptalOlayi, IsEmriGirdisi, SayimKirilimi } from './disari.ts';
import {
  ADIMLI_IPTAL_DURUMU, AYAR_PLANLI_DEGIL, AYAR_YINELENDI, BIRLESTIRME_ALT_PARTILI, BIRLESTIRME_KOK, BIRLESME_BEKLENIYOR, BIRLESME_GELMEDI, BIRLESTIRME_EK_ADIM, BOLME_ADET, BOLME_BASLAMIS, BOLME_URETILMIS, EK_ADIM_KALDIR_BASLAMIS, EK_ADIM_KOLDA, EK_ADIM_ROTA,
  FASON_DISARIDA, FASON_DONUS_ASIMI, FASON_GIDIS_ASIMI, FASON_KAYNAGI_SABIT, FASON_SIRASI_DEGIL, FASON_TERMINSIZ,
  ISTASYONSUZ_ADIM, KAYNAK_BEKLEYENDE, KOL_ONCEKI_BITMEDI, PLANA_AL_DURUMU, REFAKAT_IPTAL, TERMIN_FASON_DISI,
  BILESEN_GECERSIZ, IS_EMRI_BAGLI_KAYIT, IS_EMRI_MALIYETI_DONDURULMUS, IS_EMRI_SIPARISE_BAGLI, IS_EMRI_STOK_HAREKETLI, IS_EMRI_YOK, ROTALI_EMIR_ADIMI, ROTASIZ_ADIM_BASLAMIS, ROTASIZ_EMIR_KAPALI,
} from './kurallar.ts';
import { hazirlikCozucusuKaydet } from './hazirlik.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

describe('uretim-emirleri iş emirli emir (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  let tipId = 0;
  let firmaId = 0;
  let urunNo = 0;
  // Emrin kaynak rota revizyonu gerçek satırdır (278 a); iptal durumunda açılır ki testin rotalarıyla tekil dizinlere çarpmasın.
  let rev1 = 0;
  let rev2 = 0;
  let hammaddeNo = 0;
  let sayac = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  // 327 a: ilk sağlam sayım kalite kararını bekler; sağlam akışı ölçen testler önce ilk parçayı onaylar.
  const ilkParcaOnay = (id: number) => o().vt.tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
  const kim = (ad: string): Kullanici => {
    const k = kullanicilar.get(ad);
    if (k === undefined) throw new Error(`kişi yok: ${ad}`);
    return k;
  };

  async function istek<T = unknown>(ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown, istekKimligi?: string): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = {};
    if (ad !== null) basliklar.cookie = cerezler.get(ad) ?? '';
    if (istekKimligi !== undefined) basliklar[ISTEK_KIMLIGI_BASLIGI] = istekKimligi;
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    kullanicilar.set(kullaniciAdi, k);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
  }

  // Stok, adımın girdisi istasyonda yokken başlatmayı durdurur (kart #1289): bu dosya stoğu sınamaz, girdiyi istasyona doğrudan koyar.
  async function istasyondaStok(istasyonId: number, malzemeNo: number, miktar: string): Promise<void> {
    const k = await o().sahip.tek<{ id: number }>(
      `INSERT INTO stok_konum (depo_id, kod, tur, ad, istasyon_id) SELECT id, 'IST-' || $1::int, 'istasyon', 'Deneme', $1::int FROM stok_depo WHERE kod = 'ANA'
       ON CONFLICT ON CONSTRAINT stok_konum_istasyon_tek DO UPDATE SET ad = stok_konum.ad RETURNING id`, [istasyonId]);
    await o().sahip.sorgu('INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($1, $2, $3, now())', [malzemeNo, k!.id, miktar]);
  }

  async function istasyonKur(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`IEM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`IEI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id],
    );
    if (!ist) throw new Error('istasyon kurulamadı');
    // UE20: başlatan istasyonda yetkin olmalı; testin kişileri her yeni istasyonda yetkindir.
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist.id]);
    return ist.id;
  }
  async function makineKur(istasyonId: number): Promise<number> {
    sayac += 1;
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`IEMK${sayac}`, 'Tezgah', istasyonId]);
    if (!m) throw new Error('makine kurulamadı');
    return m.id;
  }
  async function kartKur(tur: 'mamul' | 'hammadde' | 'ticari_mal'): Promise<number> {
    sayac += 1;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('IE-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'IE-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`ie-dnm-${sayac}`, tur, sayac, JSON.stringify({ id: `ie-dnm-${sayac}`, com: { ad: `Deneme ${tur} ${sayac}` } }), yoneticiId],
    );
    if (!r) throw new Error('kart kurulamadı');
    return r.no;
  }

  const adim = (sira: number, kaynak: IsEmriGirdisi['kaynak'], ek: Partial<IsEmriGirdisi> = {}): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak,
    ayarSuresiDk: kaynak?.tur === 'fason' ? null : '10', birimSureDk: kaynak?.tur === 'fason' ? null : '1.5',
    terminGun: kaynak?.tur === 'fason' ? 5 : null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], ...ek,
  });

  async function ac(isEmirleri: IsEmriGirdisi[], ek: { taslak?: boolean; adet?: number; projeId?: number | null; emirTuru?: EmirTuru } = {}) {
    return o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
      malzemeNo: urunNo, adet: ek.adet ?? 10, teslim: null, kaynakRotaRevizyonId: rev1, isEmirleri, ...(ek.taslak ? { taslak: true } : {}),
      projeId: ek.projeId === undefined ? denemeProjeId : ek.projeId, ...(ek.emirTuru ? { emirTuru: ek.emirTuru } : {}),
    }));
  }
  const ayrinti = async (id: number): Promise<AdimliEmirAyrintisi> => {
    const c = await istek<{ emir: AdimliEmirAyrintisi }>('planlama_proje', 'GET', `/adimli-emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    adimliEmirCevabi.parse(c.govde);
    return c.govde.emir;
  };
  const red = async (is: Promise<unknown>, ileti: string): Promise<void> => {
    await assert.rejects(is, (h: unknown) => h instanceof UygulamaHatasi && h.message === ileti);
  };
  const yetkisiz = (h: unknown): boolean => h instanceof UygulamaHatasi && h.kod === 'YETKI_YOK';
  // Başlatma, devam, durdurma, bitirme ve sayımın ekranı Arkon'dur ve disari.ts'ten girer (Arkon sayımı sözleşmeden geçirir);
  // test bunları operatörün yetkisiyle kendi işleminde çağırır, hatayı uç cevabı gibi okur. Öbür terminal komutları uçtadır.
  const terminal = async (yol: string, govde?: unknown, kisi = 'operator'): Promise<Cevap<{ emir: Emir } & Hata>> => {
    const [, kimlik, komut] = /^\/(\d+)\/([a-z-]+)$/.exec(yol) ?? [];
    if (komut === undefined || !['baslat', 'devam', 'durdur', 'bitir', 'sayim'].includes(komut)) {
      return istek<{ emir: Emir } & Hata>(kisi, 'POST', `/uretim-emirleri${yol}`, govde, randomUUID());
    }
    const id = Number(kimlik);
    const g = (govde ?? {}) as { makineIdleri?: number[]; durusNedeniId?: number; saglamAdet?: number };
    try {
      const sonuc = await o().vt.tx((db) => {
        const k = kim(kisi);
        if (komut === 'baslat') return emirBaslat(db, k, id, g.makineIdleri);
        if (komut === 'devam') return emirDevam(db, k, id, g.makineIdleri);
        if (komut === 'durdur') return emirDurdur(db, k, id, g.durusNedeniId ?? 0);
        if (komut === 'bitir') return emirBitir(db, k, id, g.saglamAdet);
        return emirSayim(db, k, id, sayimGovdesi.parse(govde));
      });
      return { durum: 200, govde: JSON.parse(JSON.stringify(sonuc)) as { emir: Emir } & Hata };
    } catch (h) {
      if (h instanceof UygulamaHatasi) return { durum: h.durum, govde: h.govde() as { emir: Emir } & Hata };
      if (h instanceof ZodError) return { durum: 400, govde: { mesaj: h.issues[0]?.message ?? '' } as { emir: Emir } & Hata };
      throw h;
    }
  };

  before(async () => {
    ortam = await testVeritabaniKur('uretim_is_emri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.ISEMRI', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator'], ['depo', 'depo']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('IE-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    firmaId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fason', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    urunNo = await kartKur('mamul');
    rev1 = (await o().sahip.tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', $3, 'iptal', $2, $2, now()) RETURNING id", [urunNo, yoneticiId, 'ZZ']))!.id;
    rev2 = (await o().sahip.tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', $3, 'iptal', $2, $2, now()) RETURNING id", [urunNo, yoneticiId, 'ZY']))!.id;
    hammaddeNo = await kartKur('hammadde');
  });
  after(async () => { await ortam?.kaldir(); });

  test('açma: iş emirleri sırayla yazılır, emrin istasyonu ilk iş emrininkidir, kontrol listesi iş emrinindir', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const { uretimEmriId, isEmriIdleri } = await ac([
      adim(2, { tur: 'fason', id: firmaId }),
      adim(1, { tur: 'makine', id: makine }, { kontrolListesi: [{ ad: 'Ölçü al', aciklama: null }], bilesenler: [{ malzemeNo: hammaddeNo, miktar: '2.5' }] }),
    ]);
    assert.equal(isEmriIdleri.length, 2);
    const e = await ayrinti(uretimEmriId);
    assert.equal(e.durum, 'planli');
    assert.deepEqual(e.isEmirleri.map((i) => [i.opNo, i.sira, i.kaynak?.tur]), [[10, 1, 'makine'], [20, 2, 'fason']]);
    assert.equal(e.isEmirleri[0]?.istasyon?.id, ist);
    assert.equal(e.isEmirleri[1]?.istasyon, null, 'fason iş emrinin istasyonu yoktur');
    assert.equal(e.isEmirleri[1]?.terminGun, 5);
    assert.equal(e.isEmirleri[0]?.bilesenler[0]?.malzeme.id, hammaddeNo);
    assert.deepEqual(await emirMalzemeIhtiyaci(o().vt, uretimEmriId), [{ malzemeNo: hammaddeNo, opNo: 10, brut: '25.0000' }], '10 adet x 2.5');
    assert.equal(await emirMalzemeIhtiyaci(o().vt, 2147483647), null);
    assert.deepEqual(e.isEmirleri[1]?.fason, { gonderilen: 0, donenSaglam: 0, donenHurda: 0, hareketler: [] });
    assert.equal(e.siradaki?.opNo, 10);
    assert.equal((await emirOzeti(o().vt, uretimEmriId))?.istasyonId, ist);
    const tek = await acikEmir(o().vt, uretimEmriId);
    assert.deepEqual(tek, (await acikEmirler(o().vt)).find((x) => x.id === uretimEmriId), 'tek okuma listedeki biçimle aynıdır');
    assert.equal(tek?.malzemeNo, urunNo, 'açık emir ürünün malzeme kartını taşır');
    assert.equal(await acikEmir(o().vt, 2147483647), null);
    assert.deepEqual((await acikEmirler(o().vt)).filter((x) => x.istasyon.id === ist).map((x) => x.id), [uretimEmriId], 'emir ilk adımın istasyonuna düşer');
    const liste = await istek<{ emirler: unknown[] }>('planlama_proje', 'GET', '/adimli-emirler');
    adimliListeCevabi.parse(liste.govde);
  });

  test('açma reddi: yetkisiz kişi, mamul olmayan kart, fasonda süre, makinede termin, yinelenen op', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const temel = { malzemeNo: urunNo, adet: 5, teslim: null, kaynakRotaRevizyonId: rev1 };
    await assert.rejects(o().vt.tx((db) => uretimEmriAc(db, kim('operator'), { ...temel, isEmirleri: [adim(1, null)] })), yetkisiz);
    await red(o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), { ...temel, malzemeNo: hammaddeNo, isEmirleri: [adim(1, null)] })),
      'Üretim emri yalnız kullanımdaki mamul ya da yarı mamul kartına açılır.');
    await red(ac([adim(1, { tur: 'fason', id: firmaId }, { birimSureDk: '2' })]), FASON_TERMINSIZ);
    await red(ac([adim(1, { tur: 'makine', id: makine }, { terminGun: 3 })]), TERMIN_FASON_DISI);
    await red(ac([adim(1, null), adim(2, null, { opNo: 10 })]), 'Aynı operasyon numarası iki iş emrinde olamaz.');
    // İzinli karşılık: aynı girdiler düzeltilince açılır.
    assert.ok((await ac([adim(1, { tur: 'makine', id: makine }), adim(2, { tur: 'fason', id: firmaId })])).uretimEmriId > 0);
  });

  test('terminal: iş emri biter, emir sıradakine geçer; sayaç iş emri başına sıfırdan başlar; fason operatörle başlamaz; son iş emri emri bitirir', async () => {
    const ist1 = await istasyonKur();
    const ist3 = await istasyonKur();
    const m1 = await makineKur(ist1);
    const m3 = await makineKur(ist3);
    const { uretimEmriId: id, isEmriIdleri } = await ac([
      adim(1, { tur: 'makine', id: m1 }, { kontrolListesi: [{ ad: 'Çapak al', aciklama: null }] }),
      adim(2, { tur: 'fason', id: firmaId }),
      adim(3, { tur: 'makine', id: m3 }, { kontrolListesi: [{ ad: 'Son kontrol', aciklama: null }, { ad: 'Paketle', aciklama: null }] }),
    ], { adet: 10 });
    const [ie1, ie2, ie3] = isEmriIdleri as [number, number, number];
    // Arkon paketi (istek 11, 12): kontrol listesi iş emrinden, istasyon plan satırından okunur.
    const liste = await o().vt.tx((db) => isEmriKontrolListesi(db, [ie1, ie2, ie3, ie3]));
    assert.deepEqual([...liste.keys()].sort((x, y) => x - y), [ie1, ie3], 'listesi olmayan iş emri haritada yok');
    assert.deepEqual(liste.get(ie3), [{ sira: 1, ad: 'Son kontrol', aciklama: null }, { sira: 2, ad: 'Paketle', aciklama: null }]);
    assert.equal((await o().vt.tx((db) => isEmriKontrolListesi(db, []))).size, 0);
    const planSatirlari = (await o().vt.tx((db) => planlanacakIsEmirleri(db))).filter((i) => i.uretimEmriId === id);
    assert.deepEqual(planSatirlari.map((i) => [i.id, i.istasyonId]), [[ie1, ist1], [ie3, ist3]], 'fason plana girmez; makine adımı iş emrinin istasyonuyla');

    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    const ayr1 = await istek<{ adimlar: { ad: string }[] }>('operator', 'GET', `/uretim-emirleri/${id}`);
    assert.deepEqual(ayr1.govde.adimlar.map((a) => a.ad), ['Çapak al'], 'kontrol listesi çalışan iş emrinindir');
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 9 })).durum, 200);
    await ilkParcaOnay(id);
    const bitir1 = await terminal(`/${id}/bitir`, {});
    assert.equal(bitir1.durum, 200, JSON.stringify(bitir1.govde));
    emirCevabi.parse(bitir1.govde);
    assert.equal(bitir1.govde.emir.istasyon.id, ist1, 'cevap bitirildiği istasyondaki hâldir');
    let e = await ayrinti(id);
    assert.equal(e.durum, 'basladi', 'bir iş emri bitti, emir üretimdedir');
    assert.deepEqual(e.isEmirleri.map((i) => [i.durum, i.saglamAdet]), [['tamam', 9], ['bekliyor', null], ['bekliyor', null]]);
    // Deneme "sonraki adımın hedefi hurdayı düşmüyor": OP1 10'dan 9 sağlam verdi, sonraki adımlar 9 parça işler (fason adım arada bitmemiş).
    const adimAdedi = async () => (await o().vt.tx((db) => planlanacakIsEmirleri(db))).find((i) => i.id === ie3)?.adimAdedi;
    assert.equal(await adimAdedi(), 9);
    // Deneme H3: izleme listesi, ayrıntı ve akış da ilk adım başlayınca "basladi" der; sağlam adet son biten adımdan gelir.
    const izlenen = async (durum = '') => (await istek<{ emirler: { id: number; durum: string; baslama: string | null; saglamAdet: number | null }[] }>(
      'planlama_proje', 'GET', `/uretim-emirleri?istasyonsuz=1${durum}`)).govde.emirler.find((x) => x.id === id);
    const izleme = await izlenen();
    assert.deepEqual(izleme && [izleme.durum, izleme.saglamAdet, izleme.baslama !== null], ['basladi', 9, true]);
    assert.ok(await izlenen('&durum=basladi'), 'durum süzgeci görünen durumla süzer');
    assert.equal(await izlenen('&durum=planli'), undefined);
    const tek = await istek<{ emir: { durum: string; saglamAdet: number | null } }>('planlama_proje', 'GET', `/uretim-emirleri/${id}`);
    assert.deepEqual([tek.govde.emir.durum, tek.govde.emir.saglamAdet], ['basladi', 9]);
    const akisKaydi = await emirAkisKaydi(o().vt, id);
    assert.deepEqual(akisKaydi && [akisKaydi.emir.durum, akisKaydi.emir.baslama !== null], ['basladi', true]);
    assert.equal((await emirOzeti(o().vt, id))?.istasyonId, ist1, 'satırda istasyon yoksa son başlamış iş emrinin istasyonu');
    assert.ok(!(await acikEmirler(o().vt)).some((x) => x.istasyon.id === ist1), 'biten adımın istasyonundan düşer');
    assert.equal((await terminal(`/${id}/baslat`)).govde.mesaj, ISTASYONSUZ_ADIM, 'sıradaki fason: terminal başlatamaz');
    const hareketsiz = (await fasonIsEmirleri(o().vt)).find((x) => x.isEmriId === ie2);
    assert.deepEqual(hareketsiz && [hareketsiz.ilkGidis, hareketsiz.termin, hareketsiz.gonderilen, hareketsiz.donen, hareketsiz.hurda], [null, null, null, null, null]);
    assert.deepEqual(hareketsiz && [hareketsiz.adet, hareketsiz.terminGun, hareketsiz.teslim, typeof hareketsiz.malzemeNo], [10, 5, null, 'number'], 'ön talep için emir adedi ve fason günü');
    // Sevkiyat Tüm işler (960) fason gidiş adayı: sırası gelmiş, önceki adımın 9 sağlamı gidebilir; fason olmayan iş emri haritada sırasız.
    const gonderim = () => o().vt.tx((db) => fasonGonderimleri(db, [{ isEmriId: ie2, uretimEmriId: id, adet: 10 }, { isEmriId: ie3, uretimEmriId: id, adet: 10 }]));
    assert.deepEqual((await gonderim()).get(ie2), { siradaki: true, gonderilebilir: 9, gonderilen: 0 });
    assert.equal((await gonderim()).get(ie3)?.siradaki, false);

    // Fason: kısmi gidiş ve dönüş ayrı satırlardır; toplamlar aşılamaz. Depo kaydeder; operatör kaydedemez.
    const fasonKisi = (kisi: string, yol: string, govde?: unknown, ik = randomUUID()) =>
      istek<{ emir: AdimliEmirAyrintisi; hareketId: number } & Hata>(kisi, 'POST', `/adimli-emirler/${id}/is-emirleri/${ie2}/${yol}`, govde, ik);
    const fason = (yol: string, govde?: unknown, ik = randomUUID()) => fasonKisi('depo', yol, govde, ik);
    assert.equal((await fasonKisi('operator', 'fason-gidis', { adet: 1 })).durum, 403);
    // Kart #97: panelin "Fasona gönder" bölümü sıradaki fason iş emrini okur; yalnız gönderebilen okur.
    const siradaki = async (kisi = 'depo') => istek<SiradakiFasonCevabi>(kisi, 'GET', `/adimli-emirler/${id}/siradaki-fason`);
    assert.equal((await siradaki('operator')).durum, 403);
    const s0 = await siradaki();
    assert.equal(s0.durum, 200, JSON.stringify(s0.govde));
    assert.deepEqual(siradakiFasonCevabi.parse(s0.govde).fason, {
      uretimEmriId: id, emirNo: e.emirNo, isEmriId: ie2, opNo: 20, ad: e.isEmirleri[1]!.ad, firma: s0.govde.fason!.firma,
      gonderilen: 0, donenSaglam: 0, donenHurda: 0, gonderilebilir: 9,
    });
    assert.ok(s0.govde.fason!.firma, 'fason firmasının adı okunur');
    assert.equal((await istek('depo', 'GET', '/adimli-emirler/2147483647/siradaki-fason')).durum, 404);
    assert.equal((await istek('depo', 'GET', `/adimli-emirler/${id}`)).durum, 200, 'depo fason için emri okur');
    assert.equal((await fason('fason-gidis', { adet: 10 })).govde.mesaj, FASON_GIDIS_ASIMI, 'önceki iş emrinden 9 sağlam çıktı');
    const tekrar = randomUUID();
    const g1 = await fason('fason-gidis', { adet: 5 }, tekrar);
    assert.equal(g1.durum, 200, JSON.stringify(g1.govde));
    assert.equal((await fason('fason-gidis', { adet: 5 }, tekrar)).govde.hareketId, g1.govde.hareketId, 'aynı istek kimliği ikinci kez yazmaz');
    assert.equal((await fason('fason-gidis', { adet: 4 })).durum, 200);
    assert.deepEqual((await gonderim()).get(ie2), { siradaki: true, gonderilebilir: 9, gonderilen: 9 });
    // Dönüş yalnız mal kabulden girer (kullanıcı kararı 15.10, "Kalksın"): eski uç yoktur, kayıt stokun çağırdığı yoldan yazılır.
    assert.equal((await fason('fason-donus', { saglamAdet: 1, hurdaAdet: 0 })).durum, 404, 'Dış operasyonlardan dönüş ucu kaldırıldı');
    const donus = (saglam: number, hurda: number) => o().vt.tx((db) => fasonDonusuKaydet(db, yoneticiId, id, ie2, saglam, hurda));
    await assert.rejects(donus(9, 1), { message: FASON_DONUS_ASIMI });
    const d1 = await donus(4, 1);
    assert.equal((await fason('fason-tamamla')).govde.mesaj, FASON_DISARIDA);
    await donus(4, 0);
    e = await ayrinti(id);
    const f = e.isEmirleri[1]?.fason;
    assert.deepEqual([f?.gonderilen, f?.donenSaglam, f?.donenHurda, f?.hareketler.length], [9, 8, 1, 4]);
    const hareket = await fasonHareketiOzeti(o().vt, d1.hareketId);
    assert.deepEqual(hareket && [hareket.uretimEmriId, hareket.firmaId, hareket.yon, hareket.adet, hareket.hurdaAdet], [id, firmaId, 'donus', 4, 1]);
    const disarida = (await fasonIsEmirleri(o().vt)).find((x) => x.isEmriId === ie2);
    assert.deepEqual(disarida && [disarida.uretimEmriId, disarida.emirNo, disarida.opNo, disarida.firmaId, disarida.gonderilen, disarida.donen, disarida.hurda, disarida.planlananGidis],
      [id, e.emirNo, 20, firmaId, 9, 8, 1, null]);
    const ilkGun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(disarida!.ilkGidis!));
    const beklenenTermin = new Date(`${ilkGun}T00:00:00Z`);
    beklenenTermin.setUTCDate(beklenenTermin.getUTCDate() + 5);
    assert.equal(disarida?.termin, beklenenTermin.toISOString().slice(0, 10), 'termin: ilk gidiş günü + termin günü');
    assert.ok(disarida?.ilkDonus && disarida.sonDonus && disarida.ilkDonus <= disarida.sonDonus);
    // Fason geçmişi (satın alma süre tahmini): gidişi ve dönüşü olan iş emri; adet gönderilen toplam, süre ilk gidişten son dönüşe.
    const gecmis = (await fasonGecmisi(o().vt, { firmaId })).find((x) => x.isEmriId === ie2);
    assert.deepEqual(gecmis && [gecmis.firmaId, gecmis.adet, gecmis.terminGun, gecmis.ilkGidis === disarida.ilkGidis, gecmis.sonDonus === disarida.sonDonus], [firmaId, 9, 5, true, true]);
    assert.equal(typeof gecmis?.operasyonTipiId, 'number');
    assert.equal((await fasonGecmisi(o().vt, { firmaId: firmaId + 100000 })).some((x) => x.isEmriId === ie2), false, 'firma süzgeci');
    assert.equal((await fasonGecmisi(o().vt)).some((x) => x.isEmriId === ie3), false, 'fason olmayan iş emri gelmez');
    assert.equal((await fason('fason-tamamla')).durum, 200);
    assert.equal((await fasonIsEmirleri(o().vt)).some((x) => x.isEmriId === ie2), false, 'tamamlanan fason listede kalmaz');
    e = await ayrinti(id);
    assert.deepEqual([e.isEmirleri[1]?.durum, e.isEmirleri[1]?.saglamAdet], ['tamam', 8]);
    assert.equal(await adimAdedi(), 8, 'fasondan 8 sağlam döndü');
    assert.equal(e.siradaki?.id, ie3);
    assert.equal(siradakiFasonCevabi.parse((await siradaki()).govde).fason, null, 'sırada fason yoksa boş');

    // Son iş emri: sayaç sıfırdan başlar, bitince emir biter.
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    // Bulgu 15.2: emrin başlaması ilk iş emrinin başlamasıdır; sonraki iş emrinin başlatılması onu ezmez.
    const zamanlar = await o().vt.tek<{ emir: Date; ilk: Date; son: Date }>(
      `SELECT e.baslama AS emir, i1.baslama AS ilk, i3.baslama AS son FROM uretim_emri e, uretim_emirleri_is_emri i1, uretim_emirleri_is_emri i3
        WHERE e.id = $1 AND i1.id = $2 AND i3.id = $3`, [id, ie1, ie3]);
    assert.ok(zamanlar);
    assert.equal(zamanlar.emir.getTime(), zamanlar.ilk.getTime());
    assert.ok(zamanlar.son.getTime() >= zamanlar.ilk.getTime());
    const canli = (await istek<{ emir: Emir }>('operator', 'GET', `/uretim-emirleri/${id}`)).govde.emir.canli;
    assert.equal(canli?.saglam, 0, 'yeni iş emrinin sayacı sıfırdır');
    assert.equal(canli?.calisma, 'calisiyor');
    assert.equal((await terminal(`/${id}/duraklat`)).durum, 200);
    assert.equal((await terminal(`/${id}/devam`)).durum, 200);
    const son = await terminal(`/${id}/bitir`, { saglamAdet: 7 });
    assert.equal(son.govde.emir.durum, 'bitti');
    assert.equal(son.govde.emir.saglamAdet, 7);
    e = await ayrinti(id);
    assert.equal(e.durum, 'bitti');
    assert.equal(await acikEmir(o().vt, id), null, 'bitmiş emir açık değildir');
    assert.equal(e.tamamAdim, 3);
    assert.ok((await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_kaydi WHERE is_emri_id = $1', [ie1]))!.n === 2);
    assert.equal((await fason('fason-gidis', { adet: 1 })).durum, 409, 'bitmiş emirde fason yazılmaz');

    // Akış Süresi okuması (kart #1338): aynı akışın bütün zaman damgaları.
    const akis = await emirAkisKaydi(o().vt, id);
    assert.ok(akis);
    assert.deepEqual([akis.emir.id, akis.emir.emirNo, akis.emir.malzemeNo, akis.emir.adet, akis.emir.durum, akis.emir.teslim], [id, e.emirNo, urunNo, 10, 'bitti', null]);
    assert.ok(akis.emir.acilma <= akis.emir.baslama! && akis.emir.baslama! <= akis.emir.bitis!);
    assert.deepEqual(akis.isEmirleri.map((i) => [i.id, i.opNo, i.sira, i.fasonFirmaId, i.terminGun, i.durum, i.birimSureDk, i.ayarSuresiDk, i.bagimlilik, i.devirAdedi]), [
      [ie1, 10, 1, null, null, 'tamam', '1.5000', '10.00', 'bekleyen', null], [ie2, 20, 2, firmaId, 5, 'tamam', null, null, 'bekleyen', null],
      [ie3, 30, 3, null, null, 'tamam', '1.5000', '10.00', 'bekleyen', null],
    ]);
    assert.ok(akis.isEmirleri.every((i) => i.baslama !== null && i.bitis !== null));
    assert.deepEqual(akis.olaylar.filter((x) => x.olay === 'baslat' || x.olay === 'bitir').map((x) => [x.isEmriId, x.olay]),
      [[ie1, 'baslat'], [ie1, 'bitir'], [ie3, 'baslat'], [ie3, 'bitir']]);
    assert.deepEqual(akis.olaylar.filter((x) => x.isEmriId === ie3).map((x) => [x.olay, x.durusNedeniId]),
      [['baslat', null], ['duraklat', null], ['devam', null], ['bitir', null]], 'iki defter zaman sırasıyla birleşir');
    assert.equal(akis.olaylar.find((x) => x.isEmriId === ie1)?.istasyonId, ist1);
    assert.equal(akis.olaylar.find((x) => x.isEmriId === ie3)?.istasyonId, ist3);
    assert.ok(akis.olaylar.every((x, i, d) => i === 0 || d[i - 1]!.zaman <= x.zaman), 'olaylar zaman sırasında');
    assert.deepEqual(akis.sayimlar[0] && [akis.sayimlar[0].isEmriId, akis.sayimlar[0].tur, akis.sayimlar[0].adet, akis.sayimlar[0].duzeltme], [ie1, 'saglam', 9, true], 'ilk sayım kalite onayıyla sağlama geçer');
    assert.equal(akis.sayimlar.filter((x) => x.isEmriId === ie3 && x.tur === 'saglam').reduce((t, x) => t + x.adet, 0), 7);
    assert.deepEqual([...new Set(akis.sayimlar.map((x) => x.refakatPartisiId))], [null], 'kartsız sayımın kartı yok (kart #708)');
    assert.ok([...akis.olaylar, ...akis.sayimlar].every((x) => Number.isInteger(x.kisiId) && x.kisiId > 0), 'her olay ve sayım yazanını taşır (kart #708)');
    assert.ok(akis.sayimlar.every((x) => (x.tur === 'hurda') === (x.hurdaNedeniId !== null)), 'hurda sayımı nedenini taşır');
    assert.deepEqual(akis.fason.map((x) => [x.isEmriId, x.yon, x.adet, x.hurdaAdet]),
      [[ie2, 'gidis', 5, null], [ie2, 'gidis', 4, null], [ie2, 'donus', 4, 1], [ie2, 'donus', 4, 0]]);
    assert.equal(await emirAkisKaydi(o().vt, 2147483647), null);
  });

  test('744 a: ilk parça adım başınadır; Op10 onayı Op20 sayımını açmaz, karar yalnız kendi adımının bekleyenini kapatır; gerekmeyen adım kilitsizdir', async () => {
    const m1 = await makineKur(await istasyonKur());
    const m2 = await makineKur(await istasyonKur());
    const { uretimEmriId: id, isEmriIdleri } = await ac([adim(1, { tur: 'makine', id: m1 }), adim(2, { tur: 'makine', id: m2 })], { adet: 10 });
    const [ie1, ie2] = isEmriIdleri as [number, number];
    const say = (adet: number, ilkParca?: 'gerekli' | 'gerekmez') =>
      o().vt.tx((db) => emirSayim(db, kim('operator'), id, { tur: 'saglam', adet }, ilkParca === undefined ? {} : { ilkParca }));
    const bekleyen = async () => (await o().vt.tx((db) => adimKararSayaclari(db, [id]))).get(id)?.map((x) => [x.isEmriId, x.opNo, x.kararBekliyor]);
    const karar = (isEmriId: number) => o().vt.tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay', isEmriId));

    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    await say(3, 'gerekli');
    assert.deepEqual(await bekleyen(), [[ie1, 10, 3]], 'Op10 ilk parçası kararı bekler');
    assert.equal((await karar(ie1)).adet, 3);
    await say(1, 'gerekli');
    assert.deepEqual(await bekleyen(), [[ie1, 10, 0]], 'onaylı adımda sayım sağlamdır');
    assert.equal((await terminal(`/${id}/bitir`, {})).durum, 200);

    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    await say(2, 'gerekli');
    assert.deepEqual(await bekleyen(), [[ie1, 10, 0], [ie2, 20, 2]], 'Op20 kendi ilk parça kararını bekler: Op10 onayı açmaz');
    assert.equal((await karar(ie1)).adet, 0, 'Op10 kararı Op20 bekleyenine dokunmaz');
    assert.deepEqual(await bekleyen(), [[ie1, 10, 0], [ie2, 20, 2]]);
    await say(1, 'gerekmez');
    assert.deepEqual(await bekleyen(), [[ie1, 10, 0], [ie2, 20, 2]], 'ilk parça gerekmeyen adımda sayım sağlamdır');
    await say(1);
    assert.deepEqual(await bekleyen(), [[ie1, 10, 0], [ie2, 20, 2]], 'gereksinim verilmezse eski davranış: emrin sağlamı varsa sağlamdır');
    assert.equal((await karar(ie2)).adet, 2);
    assert.deepEqual(await bekleyen(), [[ie1, 10, 0], [ie2, 20, 0]]);
    assert.equal((await o().vt.tx((db) => adimKararSayaclari(db, []))).size, 0);
  });

  test('ayar ve süre özeti: ayar planlı işte bir kez yazılır, başlatma kapatır; özet hazırlık, birim süre ve 1\'er dizisini verir', async () => {
    const ist1 = await istasyonKur();
    const ist2 = await istasyonKur();
    const { uretimEmriId: id, isEmriIdleri } = await ac([
      adim(1, { tur: 'makine', id: await makineKur(ist1) }), adim(2, { tur: 'fason', id: firmaId }), adim(3, { tur: 'makine', id: await makineKur(ist2) }),
    ]);
    const [ie1, ie2] = isEmriIdleri as [number, number, number];
    const ozet = (ie: number, emir = id) => istek<SureOzetiCevabi & Hata>('planlama_proje', 'GET', `/adimli-emirler/${emir}/is-emirleri/${ie}/sure-ozeti`);

    const ayar = await terminal(`/${id}/ayar`);
    assert.equal(ayar.durum, 200, JSON.stringify(ayar.govde));
    assert.deepEqual([ayar.govde.emir.durum, ayar.govde.emir.canli], ['planli', null], 'ayar emri başlatmaz');
    assert.equal((await terminal(`/${id}/ayar`)).govde.mesaj, AYAR_YINELENDI);
    const once = await ozet(ie1);
    assert.equal(once.durum, 200);
    assert.deepEqual([once.govde.hazirlikDk, once.govde.brutBirimDk, once.govde.tekliOrtalamaDk], [null, null, null], 'başlamamış iş ölçülmez');

    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${id}/ayar`)).govde.mesaj, AYAR_PLANLI_DEGIL);
    // İlk parça onayı düzeltme satırıdır ve diziyi keser: dizi onaydan sonraki 1'erlerle ölçülür.
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 1 })).durum, 200);
    await ilkParcaOnay(id);
    for (const adet of [1, 1, 1, 3, 1]) assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet })).durum, 200);
    assert.equal((await terminal(`/${id}/duraklat`)).durum, 200);
    const canli = (await istek<{ emir: Emir }>('operator', 'GET', `/uretim-emirleri/${id}`)).govde.emir.canli;
    assert.equal(canli?.calisma, 'durakli', 'çalışma hâli ayardan değil son duruş olayından türer');
    assert.equal((await terminal(`/${id}/devam`)).durum, 200);
    const kayitlar = await istek<{ kayitlar: { olay: string }[] }>('operator', 'GET', `/uretim-emirleri/${id}`);
    assert.deepEqual(kayitlar.govde.kayitlar.slice(0, 2).map((k) => k.olay), ['ayar', 'baslat']);

    const c = await ozet(ie1);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    sureOzetiCevabi.parse(c.govde);
    assert.deepEqual([c.govde.saglam, c.govde.hurda], [8, 0]);
    assert.ok(c.govde.hazirlikDk !== null && c.govde.hazirlikDk >= 0);
    assert.ok(c.govde.brutBirimDk !== null && c.govde.netBirimDk !== null && c.govde.netBirimDk <= c.govde.brutBirimDk);
    assert.equal(c.govde.tekliAraliklarDk.length, 2, 'toplu sayım diziyi keser, ardındaki ilk 1\'lik aralık sayılmaz');
    const disaridan = await isEmriSureOzeti(o().vt, ie1);
    assert.deepEqual([disaridan.saglam, disaridan.hazirlikDk, disaridan.tekliAraliklarDk], [c.govde.saglam, c.govde.hazirlikDk, c.govde.tekliAraliklarDk]);
    assert.equal((await ozet(ie1, 2147483647)).durum, 404, 'iş emri başka emrin değil');
    assert.equal((await istek('operator', 'GET', `/adimli-emirler/${id}/is-emirleri/${ie1}/sure-ozeti`)).durum, 403);

    assert.equal((await terminal(`/${id}/bitir`, {})).durum, 200);
    assert.equal((await terminal(`/${id}/ayar`)).govde.mesaj, ISTASYONSUZ_ADIM, 'sıradaki iş fason: ayar yok');
    assert.deepEqual((await ozet(ie2)).govde.tekliAraliklarDk, []);
    await assert.rejects(o().sahip.sorgu(
      "INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, zaman) VALUES ($1, $2, $3, 'baslat', now())", [id, yoneticiId, ist1],
    ), /uretim_olayi_olay_degeri/, 'kısıt yalnız ayarı ekler');
  });

  test('açık iş emirleri (266 a): planlı ve başlamış emrin bitmemiş iş emirleri; taslak, iptal ve biten iş emri yok; tek okuma olmayanda null', async () => {
    const ist = await istasyonKur();
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: await makineKur(ist) }), adim(2, { tur: 'fason', id: firmaId })], { adet: 7 });
    const { uretimEmriId: taslak } = await ac([adim(1, { tur: 'makine', id: await makineKur(ist) })], { taslak: true });
    const { uretimEmriId: iptal } = await ac([adim(1, { tur: 'makine', id: await makineKur(ist) })]);
    assert.equal((await istek('planlama_proje', 'POST', `/adimli-emirler/${iptal}/iptal`, { surum: (await ayrinti(iptal)).surum }, randomUUID())).durum, 200);
    const oku = async () => (await o().vt.okumaTx((db) => acikIsEmirleri(db))).filter((x) => [id, taslak, iptal].includes(x.uretimEmriId));
    const e = await ayrinti(id);
    const [ie1, ie2] = e.isEmirleri.map((x) => x.id);
    assert.deepEqual(await oku(), [
      { id: ie1, uretimEmriId: id, emirNo: e.emirNo, parcaNo: e.urun.kod, parcaAd: e.urun.ad, adet: 7, opNo: 10, ad: 'Adım 1', durum: 'bekliyor', istasyonId: ist },
      { id: ie2, uretimEmriId: id, emirNo: e.emirNo, parcaNo: e.urun.kod, parcaAd: e.urun.ad, adet: 7, opNo: 20, ad: 'Adım 2', durum: 'bekliyor', istasyonId: null },
    ]);
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await o().vt.okumaTx((db) => acikIsEmri(db, ie1!)))?.durum, 'calisiyor');
    assert.equal((await terminal(`/${id}/bitir`, {})).durum, 200);
    assert.deepEqual((await oku()).map((x) => x.id), [ie2], 'biten iş emri düşer');
    assert.equal(await o().vt.okumaTx((db) => acikIsEmri(db, ie1!)), null);
    assert.equal(await o().vt.okumaTx((db) => acikIsEmri(db, 2_000_000_000)), null);
  });

  test('denetim #14, 120-122 a, 264 a: eksik hazırlık iş emrini durdurur; CNC ve özel proses yalnız müdürün gerekçeli muafiyetiyle geçer; çizim ve kalibrasyon muaf tutulamaz', async () => {
    const ist = await istasyonKur();
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: await makineKur(ist) })], { adet: 4 });
    const durumlar = new Map<HazirlikMaddesi, { durum: 'yok' | 'suruyor' | 'tamam'; secildi: boolean }>([
      ['cnc', { durum: 'suruyor', secildi: true }], ['cizim', { durum: 'suruyor', secildi: true }], ['kalibrasyon', { durum: 'tamam', secildi: true }],
    ]);
    const ie1 = (await ayrinti(id)).isEmirleri[0]!.id;
    // CNC iş emri başınadır (266 a): çözücüsü iş emri kimliği alır, ötekiler üretim emri kimliği.
    const cozucu = (m: HazirlikMaddesi): HazirlikCozucusu => async (_db, idler) =>
      new Map(idler.filter((x) => x === (m === 'cnc' ? ie1 : id)).map((x) => [x, durumlar.get(m)!]));
    const onceki = (['cnc', 'cizim', 'kalibrasyon', 'ozel-proses'] as const).map((m) => [m, hazirlikCozucusuKaydet(m, m === 'ozel-proses' ? null : cozucu(m))] as const);
    const muafiyet = (govde: unknown, kisi = 'mudur') => istek<HazirlikCevabi & Hata>(kisi, 'POST', `/adimli-emirler/${id}/hazirlik-muafiyeti`, govde);
    const oku = async () => (await istek<HazirlikCevabi>('planlama_proje', 'GET', `/adimli-emirler/${id}/hazirlik`)).govde;
    try {
      if (!kullanicilar.has('mudur')) await kisiEkle('mudur', 'mudur');
      const ret = await terminal(`/${id}/baslat`);
      assert.deepEqual([ret.durum, ret.govde.mesaj], [409, 'Hazırlık eksik: CNC kurulumu (NC), Çizim revizyonu. Tamamlanmadan başlamaz.']);
      hazirlikCevabi.parse(await oku());
      assert.deepEqual((await oku()).maddeler.map((m) => [m.madde, m.durum, m.muafTutulur]),
        [['cnc', 'eksik', true], ['cizim', 'eksik', false], ['kalibrasyon', 'tamam', false], ['ozel-proses', 'bilinmiyor', true]]);

      assert.equal((await muafiyet({ madde: 'cnc', isEmriId: null, gerekce: 'Program elde denendi' }, 'planlama_proje')).durum, 403, 'yalnız müdür');
      assert.equal((await muafiyet({ madde: 'cizim', isEmriId: null, gerekce: 'Deneme' })).durum, 400, 'çizim muaf tutulamaz (121 a)');
      assert.equal((await muafiyet({ madde: 'kalibrasyon', isEmriId: null, gerekce: 'Deneme' })).durum, 400, 'kalibrasyon muaf tutulamaz (121 a)');
      assert.equal((await muafiyet({ madde: 'cnc', isEmriId: null, gerekce: '  ' })).durum, 400, 'gerekçe zorunlu');
      assert.equal((await muafiyet({ madde: 'cnc', isEmriId: 2_000_000_000, gerekce: 'Deneme' })).durum, 400, 'başka emrin iş emri');
      const verildi = await muafiyet({ madde: 'cnc', isEmriId: ie1, gerekce: 'Program elde denendi' });
      assert.equal(verildi.durum, 200, JSON.stringify(verildi.govde));
      assert.deepEqual(verildi.govde.muafiyetler.map((x) => [x.madde, x.isEmriId, x.kisiAdi, x.gerekce]), [['cnc', ie1, 'Deneme mudur', 'Program elde denendi']]);
      assert.equal(verildi.govde.maddeler.find((m) => m.madde === 'cnc')?.durum, 'muaf', 'iş emrinin muafiyeti emir görünümünde de görünür');
      assert.equal((await muafiyet({ madde: 'cnc', isEmriId: ie1, gerekce: 'Yine' })).durum, 409, 'aynı madde bir kez');
      await assert.rejects(o().sahip.sorgu("UPDATE uretim_emirleri_hazirlik_muafiyeti SET gerekce = 'x'"), /yalnız ekleme/);

      const cizimde = await terminal(`/${id}/baslat`);
      assert.deepEqual([cizimde.durum, cizimde.govde.mesaj], [409, 'Hazırlık eksik: Çizim revizyonu. Tamamlanmadan başlamaz.'], 'muafiyet yalnız kendi maddesini geçer');
      durumlar.set('cizim', { durum: 'tamam', secildi: true });
      durumlar.set('kalibrasyon', { durum: 'yok', secildi: false });
      assert.equal((await terminal(`/${id}/baslat`)).durum, 200, 'seçilmeyen madde aranmaz; çizim tamam, CNC muaf');
      assert.equal((await muafiyet({ madde: 'ozel-proses', isEmriId: null, gerekce: 'Deneme' })).durum, 200, 'başlamış emirde de verilir');
    } finally {
      for (const [m, c] of onceki) hazirlikCozucusuKaydet(m, c);
    }
  });

  test('refakat kartı: okuma yetkisi olan basar, olmayan alamaz; QR yalnız kimlik; alt parti üst emri gösterir; iptal emirde basılmaz', async () => {
    const ist = await istasyonKur();
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: await makineKur(ist) }), adim(2, { tur: 'fason', id: firmaId })], { adet: 10 });
    const kart = (emir: number, kisi = 'planlama_proje') => istek<RefakatKartiCevabi & Hata>(kisi, 'GET', `/adimli-emirler/${emir}/refakat-karti`);

    const c = await kart(id);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    refakatKartiCevabi.parse(c.govde);
    const e = await ayrinti(id);
    assert.deepEqual([c.govde.qr, c.govde.emirNo, c.govde.adet, c.govde.urun.ad], [`UE:${id}`, e.emirNo, 10, e.urun.ad]);
    assert.deepEqual(c.govde.parti, { ustEmirNo: null, bolunmeSira: null });
    assert.deepEqual(c.govde.adimlar.map((a) => [a.opNo, a.yer, a.fason]), [[10, `Deneme İstasyonu ${sayac - 1}`, false], [20, 'Deneme Fason', true]]);
    assert.equal((await kart(id, 'operator')).durum, 403, 'okuma yetkisi olmayan basamaz');
    assert.equal((await istek('depo', 'GET', `/adimli-emirler/${id}/refakat-karti`)).durum, 200, 'fason işlemli depo okur');
    assert.deepEqual(await o().vt.okumaTx((db) => refakatKarti(db, id)), c.govde, 'Etiket Merkezi dışa açık okumayla aynı kartı alır');
    await assert.rejects(o().vt.okumaTx((db) => refakatKarti(db, 2_000_000_000)), { kod: 'BULUNAMADI' });

    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 9 })).durum, 200);
    const b = await istek<PartiBolCevabi & Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/bol`,
      { adimSira: 2, adet: 4, surum: (await ayrinti(id)).surum }, randomUUID());
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const alt = await kart(b.govde.altEmirId);
    assert.deepEqual([alt.govde.qr, alt.govde.adet, alt.govde.parti], [`UE:${b.govde.altEmirId}`, 4, { ustEmirNo: e.emirNo, bolunmeSira: 2 }]);

    const { uretimEmriId: iptalId } = await ac([adim(1, null)]);
    const ip = await istek('planlama_proje', 'POST', `/adimli-emirler/${iptalId}/iptal`, { surum: (await ayrinti(iptalId)).surum }, randomUUID());
    assert.equal(ip.durum, 200, JSON.stringify(ip.govde));
    assert.deepEqual([(await kart(iptalId)).durum, (await kart(iptalId)).govde.mesaj], [409, REFAKAT_IPTAL]);
    assert.equal((await kart(2147483647)).durum, 404);
  });

  test('fason sırası: önceki iş emri bitmeden gidiş yazılmaz; fason olmayan iş emrine gidiş yazılmaz', async () => {
    const ist = await istasyonKur();
    const { uretimEmriId: id, isEmriIdleri } = await ac([adim(1, { tur: 'makine', id: await makineKur(ist) }), adim(2, { tur: 'fason', id: firmaId })]);
    const [ie1, ie2] = isEmriIdleri as [number, number];
    const gidis = (ie: number) => istek<Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie}/fason-gidis`, { adet: 1 }, randomUUID());
    assert.equal((await gidis(ie2)).govde.mesaj, FASON_SIRASI_DEGIL);
    assert.equal((await gidis(ie1)).govde.mesaj, 'Bu iş emri fason değil; gidiş ve dönüş yalnız fason iş emrinde yazılır.');
    assert.equal((await istek('planlama_proje', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie2}/fason-gidis`, { adet: 1 })).durum, 400, 'istek kimliği zorunlu');
    assert.equal((await istek('operator', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie2}/fason-gidis`, { adet: 1 }, randomUUID())).durum, 403);
  });

  test('denetim #31, 647 a: adımın sağlamı önceki adımın sağlamını aşınca uyarır, reddetmez (sayım, ayarlama, bitirme); ilk adımda üst sınır yok', async () => {
    const ist1 = await istasyonKur();
    const ist2 = await istasyonKur();
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: await makineKur(ist1) }), adim(2, { tur: 'makine', id: await makineKur(ist2) })], { adet: 10 });
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 12 })).durum, 200, 'ilk adım emir adedini aşabilir');
    await ilkParcaOnay(id);
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: -8 })).durum, 200);
    assert.equal((await terminal(`/${id}/bitir`, {})).durum, 200);
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    const uyari = (c: { govde: unknown }) => (c.govde as { uyari?: string | null }).uyari ?? null;
    const asim = await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 5 });
    assert.equal(asim.durum, 200, 'OP10 4 sağlam verdi; aşım reddedilmez');
    assert.match(uyari(asim) ?? '', /sayılan 5, önceki adımdan gelen 4; 1 fazla \(OP 20\)/);
    assert.equal(uyari(await terminal(`/${id}/sayim`, { tur: 'saglam', adet: -3 })), null, 'düşürmek serbest ve uyarısız');
    assert.equal(uyari(await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 2 })), null, 'sınırın içinde uyarı yok');
    assert.match(uyari(await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 1 })) ?? '', /1 fazla/);
    const e = await ayrinti(id);
    assert.equal(e.isEmirleri[1]?.eksik, -1, 'eksi bakiye OP20 kartında');
    const bitir = await terminal(`/${id}/bitir`, { saglamAdet: 4 });
    assert.equal(bitir.durum, 200);
    assert.deepEqual((await ayrinti(id)).isEmirleri.map((i) => i.saglamAdet), [4, 4]);
  });

  test('#1185: kaynağı atanmamış adımlı emir salt okunur listede ve ayrıntıda görünür; istasyonsuz=1 verilmezse listeye girmez', async () => {
    const { uretimEmriId: id } = await ac([adim(1, null), adim(2, null)]);
    const liste = async (sorgu: string) => izlemeListeCevabi.parse((await istek('planlama_proje', 'GET', `/uretim-emirleri${sorgu}`)).govde).emirler;
    const hepsi = await liste('?istasyonsuz=1');
    const emir = hepsi.find((e) => e.id === id);
    assert.ok(emir, 'kaynaksız emir izleme listesinde');
    assert.equal(emir.istasyon, null);
    assert.ok((await liste(`?istasyonsuz=1&durum=${emir.durum}`)).some((e) => e.id === id));
    assert.ok(!(await liste('')).some((e) => e.id === id), 'Atölye, Stok ve Arkon okumaları istasyonlu kalır');
    assert.ok(!(await liste(`?durum=${emir.durum}`)).some((e) => e.id === id));
    const detay = await istek<{ emir: { id: number; istasyon: unknown } }>('planlama_proje', 'GET', `/uretim-emirleri/${id}`);
    assert.equal(detay.durum, 200, JSON.stringify(detay.govde));
    assert.equal(detay.govde.emir.istasyon, null);
  });

  test('kaynak: tezgahsız iş emrine makine atanınca emir o istasyonun terminaline düşer; başlamış ve fason iş emri değişmez; eski sürüm 409', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const { uretimEmriId: id } = await ac([adim(1, null), adim(2, { tur: 'fason', id: firmaId })]);
    let e = await ayrinti(id);
    assert.equal((await terminal(`/${id}/baslat`)).govde.mesaj, ISTASYONSUZ_ADIM);
    const yaz = (opNo: number, kaynak: unknown, surum: number) =>
      istek<{ emir: AdimliEmirAyrintisi } & Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/adim-kaynagi`, { opNo, kaynak, surum });
    assert.equal((await yaz(10, { tur: 'makine', id: makine }, e.surum + 5)).durum, 409, 'eski sürüm');
    assert.equal((await yaz(20, { tur: 'makine', id: makine }, e.surum)).govde.mesaj, FASON_KAYNAGI_SABIT);
    assert.equal((await istek('operator', 'POST', `/adimli-emirler/${id}/adim-kaynagi`, { opNo: 10, kaynak: null, surum: e.surum })).durum, 403);
    const c = await yaz(10, { tur: 'makine', id: makine }, e.surum);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.emir.siradaki?.istasyon?.id, ist);
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    e = await ayrinti(id);
    assert.equal((await yaz(10, null, e.surum)).govde.mesaj, KAYNAK_BEKLEYENDE);
  });

  test('plana al ve iptal: taslak plana alınır, planlı tekrar alınmaz; iş emri başlamış emir iptal edilmez (yeni ve eski uçta)', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const { uretimEmriId: taslak } = await ac([adim(1, { tur: 'makine', id: makine })], { taslak: true });
    let e = await ayrinti(taslak);
    assert.equal(e.durum, 'taslak');
    assert.ok(!(await acikEmirler(o().vt)).some((x) => x.id === taslak), 'taslak terminale düşmez');
    const planaAl = (id: number, surum: number) => istek<{ emir: AdimliEmirAyrintisi } & Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/plana-al`, { surum });
    assert.equal((await planaAl(taslak, e.surum)).govde.emir.durum, 'planli');
    e = await ayrinti(taslak);
    assert.equal((await planaAl(taslak, e.surum)).govde.mesaj, PLANA_AL_DURUMU);

    const iptal = (id: number, surum: number) => istek<{ emir: AdimliEmirAyrintisi } & Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/iptal`, { surum });
    assert.equal((await terminal(`/${taslak}/baslat`)).durum, 200);
    assert.equal((await uretimEmriOzeti(o().vt, taslak))?.saglamAdet, null, 'bitmemiş emirde sağlam yok');
    assert.equal((await terminal(`/${taslak}/bitir`, {})).durum, 200);
    e = await ayrinti(taslak);
    assert.equal(e.durum, 'bitti');
    const sonIs = e.isEmirleri.at(-1)?.saglamAdet;
    assert.ok(typeof sonIs === 'number');
    assert.equal((await uretimEmriOzeti(o().vt, taslak))?.saglamAdet, sonIs, 'bitmiş emrin sağlamı son iş emrinden');
    assert.equal((await iptal(taslak, e.surum)).govde.mesaj, ADIMLI_IPTAL_DURUMU);

    const { uretimEmriId: iki } = await ac([adim(1, { tur: 'makine', id: makine }), adim(2, { tur: 'makine', id: makine })]);
    assert.equal((await terminal(`/${iki}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${iki}/bitir`, {})).durum, 200);
    e = await ayrinti(iki);
    assert.equal((await iptal(iki, e.surum)).govde.mesaj, ADIMLI_IPTAL_DURUMU);

    const { uretimEmriId: uc } = await ac([adim(1, { tur: 'makine', id: makine })]);
    e = await ayrinti(uc);
    assert.equal((await iptal(uc, e.surum)).govde.emir.durum, 'iptal');
  });

  // 281 a: iş emirsiz emrin iptal yolu kalkınca (238 H3) iptal olayı yalnız bu yoldan çıkar; dinleyenler (bugün stok) onu buradan alır.
  test('iptal olayı: iş emirli emrin iptali olayı bir kez, iptal edenle verir; reddedilen iptal (yetkisiz, başlamış, eski sürüm) olay vermez', async () => {
    const gelen: EmirIptalOlayi[] = [];
    const birak = emirIptalDinle(async (_db, olay) => { gelen.push(olay); });
    try {
      const ist = await istasyonKur();
      const makine = await makineKur(ist);
      const iptalEt = (kisi: string, id: number, surum: number) => istek<{ emir: AdimliEmirAyrintisi } & Hata>(kisi, 'POST', `/adimli-emirler/${id}/iptal`, { surum });
      const olaylari = (id: number) => gelen.filter((g) => g.uretimEmriId === id);

      const { uretimEmriId: planli } = await ac([adim(1, { tur: 'makine', id: makine })]);
      const surum = (await ayrinti(planli)).surum;
      assert.equal((await iptalEt('operator', planli, surum)).durum, 403, 'yetkisiz iptal');
      assert.equal((await iptalEt('planlama_proje', planli, surum + 1)).durum, 409, 'eski sürüm');
      assert.deepEqual(olaylari(planli), [], 'reddedilen iptal olay vermez');
      assert.equal((await iptalEt('planlama_proje', planli, surum)).govde.emir.durum, 'iptal');
      assert.deepEqual(olaylari(planli), [{ uretimEmriId: planli, kisiId: kim('planlama_proje').id }]);

      const { uretimEmriId: baslamis } = await ac([adim(1, { tur: 'makine', id: makine })]);
      assert.equal((await terminal(`/${baslamis}/baslat`)).durum, 200);
      assert.equal((await iptalEt('planlama_proje', baslamis, (await ayrinti(baslamis)).surum)).govde.mesaj, ADIMLI_IPTAL_DURUMU);
      assert.deepEqual(olaylari(baslamis), [], 'başlamış emir iptal edilmez, olay yok');
    } finally {
      birak();
    }
  });

  test('plan: planlanacak iş emirleri fasonsuz ve bitmemiştir, öncelik ve tarih taşır, taslak istenirse gelir; kaynak ve plan bilgisi yazılır; işlemsiz kişi reddedilir', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const { uretimEmriId: id, isEmriIdleri } = await ac([adim(1, null), adim(2, { tur: 'fason', id: firmaId }), adim(3, null)]);
    const [ie1, , ie3] = isEmriIdleri as [number, number, number];
    const kendi = (await o().vt.tx((db) => planlanacakIsEmirleri(db))).filter((i) => i.uretimEmriId === id);
    assert.deepEqual(kendi.map((i) => [i.id, i.kaynak, i.durum, i.malzemeNo]), [[ie1, null, 'planli', urunNo], [ie3, null, 'planli', urunNo]]);
    await assert.rejects(o().vt.tx((db) => isEmriKaynagiYaz(db, kim('operator'), ie1, { tur: 'makine', id: makine })), yetkisiz);
    // Yalnız canlıya alma işlemi olan kişi kaynak yazar; aynı kişi emir açamaz.
    const canliyaAlan: Kullanici = { id: kim('operator').id, ad: 'Canlıya alan', islemler: ['plan.canliya-al'] };
    await o().vt.tx((db) => isEmriKaynagiYaz(db, canliyaAlan, ie3, { tur: 'makine', id: makine }));
    assert.equal((await isEmriOzeti(o().vt, ie3))?.istasyonId, ist, 'canlıya alan kaynak yazar');
    await assert.rejects(o().vt.tx((db) => uretimEmriAc(db, canliyaAlan, {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 1, teslim: null, kaynakRotaRevizyonId: rev1, isEmirleri: [adim(1, null)],
    })), yetkisiz, 'canlıya alma emir açtırmaz');
    await o().vt.tx((db) => isEmriKaynagiYaz(db, kim('planlama_proje'), ie1, { tur: 'makine', id: makine }));
    assert.equal((await isEmriOzeti(o().vt, ie1))?.istasyonId, ist);
    assert.equal((await ayrinti(id)).siradaki?.istasyon?.id, ist, 'sıradaki iş emrine atanan kaynak emri o istasyona düşürür');
    await o().vt.tx((db) => emirPlanBilgisiYaz(db, kim('planlama_proje'), id, { oncelik: 1, baslangic: '2026-11-01', teslim: '2026-11-20' }));
    await red(o().vt.tx((db) => emirPlanBilgisiYaz(db, kim('planlama_proje'), id, { teslim: '2026-10-01' })), 'Teslim başlangıçtan önce olamaz.');
    const oz = await uretimEmriOzeti(o().vt, id);
    assert.deepEqual(oz && [oz.oncelik, oz.baslangic, oz.teslim, oz.siradakiIsEmriId], [1, '2026-11-01', '2026-11-20', ie1]);
    assert.equal((await emirNolari(o().vt, [id])).get(id), oz && (await ayrinti(id)).emirNo);
    const plandaki = (await o().vt.tx((db) => planlanacakIsEmirleri(db))).find((i) => i.id === ie1);
    assert.deepEqual(plandaki && [plandaki.oncelik, plandaki.baslangic, plandaki.teslim], [1, '2026-11-01', '2026-11-20']);
    const { uretimEmriId: taslak } = await ac([adim(1, null)], { taslak: true });
    assert.equal((await o().vt.tx((db) => planlanacakIsEmirleri(db))).some((i) => i.uretimEmriId === taslak), false, 'taslak varsayılan olarak planlanmaz');
    const taslakIsleri = (await o().vt.tx((db) => planlanacakIsEmirleri(db, { taslakDahil: true }))).filter((i) => i.uretimEmriId === taslak);
    assert.deepEqual(taslakIsleri.map((i) => [i.durum, i.oncelik, i.baslangic]), [['taslak', 3, null]], 'istenirse taslak da gelir');
    const durumlar = await emirDurumlari(o().vt, [id, id, 2147483647]);
    assert.deepEqual([...durumlar], [[id, 'planli']], 'yinelenen tek, olmayan kimlik haritada yok');
    assert.equal((await emirDurumlari(o().vt, [])).size, 0);
    await assert.rejects(o().vt.tx((db) => emirPlanaAl(db, kim('operator'), id)), yetkisiz);
    await o().vt.tx((db) => emirIptalEt(db, kim('planlama_proje'), id));
    assert.equal((await o().vt.tx((db) => planlanacakIsEmirleri(db))).some((i) => i.uretimEmriId === id), false, 'iptal emir planlanmaz');
  });

  test('emirlere uygula: başlamış iş emri korunur, bekleyen güncellenir ya da çıkar, yenisi eklenir', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: makine }), adim(2, null), adim(3, null)]);
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    const sonuc = await o().vt.tx((db) => isEmirleriniYenile(db, kim('planlama_proje'), id, {
      kaynakRotaRevizyonId: rev2,
      isEmirleri: [adim(1, { tur: 'makine', id: makine }, { ad: 'Değişti' }), adim(2, null, { ad: 'Yeni ad' }), adim(4, null)],
    }));
    assert.deepEqual(sonuc.degisenler, ['OP 30 çıkarıldı', 'OP 40 eklendi']);
    const e = await ayrinti(id);
    assert.deepEqual(e.isEmirleri.map((i) => [i.opNo, i.sira, i.ad, i.durum]), [[10, 1, 'Adım 1', 'calisiyor'], [20, 2, 'Yeni ad', 'bekliyor'], [40, 3, 'Adım 4', 'bekliyor']]);
    assert.equal(e.kaynakRotaRevizyonId, 2);
  });

  test('279 a: iş emri silinince canlı plan satırı ve parçaları da silinir; kalan iş emrinin plan satırı kalır', async () => {
    const mk = { tur: 'makine' as const, id: await makineKur(await istasyonKur()) };
    const { uretimEmriId: id, isEmriIdleri } = await ac([adim(1, mk), adim(2, mk)]);
    const [ie1, ie2] = isEmriIdleri as [number, number];
    const kisi = kim('planlama_proje').id;
    for (const ie of [ie1, ie2]) {
      await o().sahip.sorgu("INSERT INTO plan_yerlesimi (is_emri_id, kisi_id, baslangic, bitis, yazan_kisi_id) VALUES ($1, $2, now(), now() + interval '1 hour', $2)", [ie, kisi]);
      await o().sahip.sorgu('INSERT INTO plan_yerlesim_parcasi (is_emri_id, parca_no, adet) VALUES ($1, 1, 5), ($1, 2, 5)', [ie]);
    }
    await o().vt.tx((db) => isEmirleriniYenile(db, kim('planlama_proje'), id, { kaynakRotaRevizyonId: rev2, isEmirleri: [adim(1, mk)] }));
    const say = async (tablo: string, ie: number) => Number((await o().sahip.tek<{ n: string }>(`SELECT count(*) AS n FROM ${tablo} WHERE is_emri_id = $1`, [ie]))!.n);
    assert.deepEqual([await say('plan_yerlesimi', ie2), await say('plan_yerlesim_parcasi', ie2)], [0, 0], 'çıkan adımın plan satırı artık kalmaz');
    assert.deepEqual([await say('plan_yerlesimi', ie1), await say('plan_yerlesim_parcasi', ie1)], [1, 2]);
    await assert.rejects(o().sahip.sorgu("INSERT INTO plan_yerlesimi (is_emri_id, kisi_id, baslangic, bitis, yazan_kisi_id) VALUES ($1, $2, now(), now() + interval '1 hour', $2)", [ie2, kisi]),
      /plan_yerlesimi_is_emri/, 'olmayan iş emrine plan satırı yazılmaz');
  });

  test('emirlere uygula (soru 76): bekleyen iş emrinin işaretsiz kontrol listesi silinip yeniden yazılır; işaretli liste korunur', async () => {
    const ist = await istasyonKur();
    const mk = { tur: 'makine' as const, id: await makineKur(ist) };
    const liste = (ad: string) => ({ kontrolListesi: [{ ad, aciklama: null }] });
    const { uretimEmriId: id, isEmriIdleri } = await ac([adim(1, mk, liste('Çapak al')), adim(2, mk, liste('Ölçü al')), adim(3, mk, liste('Paketle'))]);
    const [ie1, ie2] = isEmriIdleri as [number, number, number];
    const listeler = async () => (await o().sahip.sorgu<{ isEmriId: number; ad: string }>(
      'SELECT is_emri_id AS "isEmriId", ad FROM emir_adimi WHERE emir_id = $1 ORDER BY is_emri_id, sira', [id],
    )).map((m) => [m.isEmriId, m.ad]);
    const uygula = (isEmirleri: IsEmriGirdisi[]) => o().vt.tx((db) => isEmirleriniYenile(db, kim('planlama_proje'), id, { kaynakRotaRevizyonId: rev2, isEmirleri }));

    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    const kisi = (await o().sahip.tek<{ id: number }>('SELECT id FROM kisi ORDER BY id LIMIT 1'))!.id;
    await o().sahip.sorgu("INSERT INTO emir_adimi_olayi (adim_id, kisi_id, olay) SELECT id, $2, 'tamamla' FROM emir_adimi WHERE is_emri_id = $1", [ie1, kisi]);
    const sonuc = await uygula([adim(1, mk, liste('Çapak al')), adim(2, mk, { ...liste('Yeni ölçü'), ad: 'Yeni ad' })]);
    assert.deepEqual(sonuc.degisenler, ['OP 30 çıkarıldı']);
    assert.deepEqual(await listeler(), [[ie1, 'Çapak al'], [ie2, 'Yeni ölçü']], 'başlamış iş emrinin işaretli listesi kalır; bekleyenin listesi yenilenir, çıkanın listesi gider');
    assert.deepEqual((await ayrinti(id)).isEmirleri.map((i) => [i.opNo, i.ad]), [[10, 'Adım 1'], [20, 'Yeni ad']]);

    const sil = (kosul: string, deger: number) => o().vt.tx((db) => db.sorgu(`DELETE FROM emir_adimi WHERE ${kosul} = $1`, [deger]));
    await assert.rejects(sil('is_emri_id', ie1), /yalnız ekleme/, 'başlamış iş emrinin listesi silinmez');
    await o().sahip.sorgu("INSERT INTO emir_adimi_olayi (adim_id, kisi_id, olay) SELECT id, $2, 'tamamla' FROM emir_adimi WHERE is_emri_id = $1", [ie2, kisi]);
    await assert.rejects(sil('is_emri_id', ie2), /yalnız ekleme/, 'işaretli bekleyen liste silinmez');
    await red(uygula([adim(1, mk, liste('Çapak al'))]), 'Kontrol listesi işaretlenmiş iş emri değiştirilemez.');
    assert.deepEqual(await listeler(), [[ie1, 'Çapak al'], [ie2, 'Yeni ölçü']], 'reddedilen uygulama hiçbir şeyi değiştirmez');
    await assert.rejects(o().vt.tx((db) => db.sorgu('UPDATE emir_adimi SET ad = ad WHERE is_emri_id = $1', [ie2])), /yalnız ekleme/, 'liste güncellenmez');

    const { uretimEmriId: emirListeli } = await ac([adim(1, null)]);
    await o().sahip.sorgu("INSERT INTO emir_adimi (emir_id, sira, ad) VALUES ($1, 99, 'Emrin maddesi')", [emirListeli]);
    await assert.rejects(sil('emir_id', emirListeli), /yalnız ekleme/, 'iş emirsiz emrin listesi silinmez');
  });

  test('emirlere uygula (KD-043): kol ve açık kolu olan üst değişmez; kol katılınca üste uygulanır', async () => {
    const ist = await istasyonKur();
    const mk = { tur: 'makine' as const, id: await makineKur(ist) };
    const rota = [adim(1, mk), adim(2, mk), adim(3, mk)];
    const { uretimEmriId: id } = await ac(rota, { adet: 10 });
    const b = await istek<PartiBolCevabi & Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/bol`, { adimSira: 2, adet: 4, surum: (await ayrinti(id)).surum, birlesmeOpNo: 30 }, randomUUID());
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const kol = b.govde.altEmirId;
    const uygula = (emirId: number) => o().vt.tx((db) => isEmirleriniYenile(db, kim('planlama_proje'), emirId, { kaynakRotaRevizyonId: rev2, isEmirleri: [...rota, adim(4, mk)] }));

    assert.deepEqual((await uygula(kol)).degisenler, ['Bölünmüş parti değiştirilmedi']);
    assert.deepEqual((await ayrinti(kol)).isEmirleri.map((i) => i.opNo), [20], 'kola bölünmeden önceki ve birleşmeden sonraki adım girmez');
    assert.deepEqual((await uygula(id)).degisenler, ['Bölünmüş parti değiştirilmedi']);
    assert.deepEqual((await ayrinti(id)).isEmirleri.map((i) => i.opNo), [10, 20, 30]);

    // Kolun son adımında üste katılması (UE-PB4) burada doğrudan yazılır; akışı "parti kolu" testi sınar.
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now(), birlestigi_emir_id = $2 WHERE id = $1", [kol, id]);
    assert.deepEqual((await uygula(id)).degisenler, ['OP 40 eklendi'], 'kol katılınca üst yeniden rotayla güncellenir');
  });

  test('parti bölme ve birleştirme: alt parti kalan adımları taşır, yeniden bölünür, birleşir; malzeme toplamı değişmez', async () => {
    const ist = await istasyonKur();
    const [m1, m2] = [await makineKur(ist), await makineKur(ist)];
    const { uretimEmriId: id } = await ac([
      adim(1, { tur: 'makine', id: m1 }, { bilesenler: [{ malzemeNo: hammaddeNo, miktar: '2' }] }),
      adim(2, { tur: 'makine', id: m2 }, { kontrolListesi: [{ ad: 'Ölçü al', aciklama: null }], adaylar: [{ kaynak: { tur: 'makine', id: m1 }, ayarSuresiDk: null, birimSureDk: null }] }),
      adim(3, { tur: 'fason', id: firmaId }),
    ], { adet: 10 });
    const bol = (emir: number, govde: unknown, kisi = 'planlama_proje', ik: string | null = randomUUID()) =>
      istek<PartiBolCevabi & Hata>(kisi, 'POST', `/adimli-emirler/${emir}/bol`, govde, ik ?? undefined);
    const birlestir = (hedef: number, govde: unknown) => istek<{ emir: AdimliEmirAyrintisi } & Hata>('planlama_proje', 'POST', `/adimli-emirler/${hedef}/birlestir`, govde, randomUUID());
    const ihtiyac = async (emir: number) => (await emirMalzemeIhtiyaci(o().vt, emir))?.map((m) => [m.opNo, m.brut]);

    let e = await ayrinti(id);
    await istasyondaStok(ist, hammaddeNo, '20');
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 9 })).durum, 200);
    e = await ayrinti(id);
    assert.deepEqual(e.parti, { ustEmirId: null, bolunmeSira: null, altEmirIdleri: [], birlestigiEmirId: null, birlesmeOpNo: null });
    assert.equal((await bol(id, { adimSira: 2, adet: 4, surum: e.surum }, 'operator')).durum, 403);
    assert.equal((await bol(id, { adimSira: 2, adet: 4, surum: e.surum }, 'planlama_proje', null)).durum, 400, 'istek kimliği zorunlu');
    assert.equal((await bol(id, { adimSira: 2, adet: 4, surum: e.surum - 1 })).durum, 409, 'eski sürüm');
    const asim = await bol(id, { adimSira: 2, adet: 9, surum: e.surum });
    assert.deepEqual([asim.durum, asim.govde.mesaj], [400, BOLME_ADET], 'önceki adımdan 9 sağlam çıktı; üstte en az bir kalır');

    const b1 = await bol(id, { adimSira: 2, adet: 4, surum: e.surum });
    assert.equal(b1.durum, 200, JSON.stringify(b1.govde));
    partiBolCevabi.parse(b1.govde);
    const alt = b1.govde.altEmirId;
    assert.deepEqual([b1.govde.emir.adet, b1.govde.emir.parti?.altEmirIdleri], [6, [alt]]);
    const a = await ayrinti(alt);
    assert.deepEqual([a.adet, a.durum, a.parti?.ustEmirId, a.parti?.bolunmeSira, a.urun.id], [4, 'planli', id, 2, urunNo]);
    assert.deepEqual(a.isEmirleri.map((i) => [i.opNo, i.durum, i.kaynak?.tur ?? null]), [[20, 'bekliyor', null], [30, 'bekliyor', 'fason']], 'bölünen adım atamasız, fason kalır');
    assert.equal(a.isEmirleri[0]?.adaylar.length, 1, 'adaylar taşınır');
    const liste = await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM emir_adimi WHERE emir_id = $1', [alt]);
    assert.equal(liste?.n, 1, 'kontrol listesi taşınır');
    assert.deepEqual(await ihtiyac(id), [[10, '20.0000']], 'üst, bölünmeden önceki adımı 10 adet için yaptı');
    assert.deepEqual(await ihtiyac(alt), [], 'alt parti yalnız kendi adımlarını sayar');
    assert.equal((await o().vt.tx((db) => planlanacakIsEmirleri(db))).find((i) => i.uretimEmriId === alt)?.ustEmirId, id, 'plan alt partiyi ayrı emir olarak alır');

    e = await ayrinti(id);
    assert.equal((await bol(id, { adimSira: 2, adet: 5, surum: e.surum })).govde.mesaj, BOLME_ADET, 'aynı sıradan bölünen 4 elde kalandan düşer');
    const b2 = await bol(id, { adimSira: 2, adet: 2, surum: e.surum });
    assert.equal(b2.durum, 200, JSON.stringify(b2.govde));
    const kardes = b2.govde.altEmirId;
    const b3 = await bol(alt, { adimSira: 2, adet: 1, surum: (await ayrinti(alt)).surum });
    assert.equal(b3.durum, 200, JSON.stringify(b3.govde));
    const torun = b3.govde.altEmirId;
    assert.deepEqual(await ihtiyac(id), [[10, '20.0000']], 'torun dahil bütün partiler üstün ilk adımında sayılır');
    const listeCevap = await istek<AdimliListeCevabi>('planlama_proje', 'GET', '/adimli-emirler');
    adimliListeCevabi.parse(listeCevap.govde);
    assert.deepEqual(listeCevap.govde.emirler.find((x) => x.id === alt)?.parti, { ustEmirId: id, bolunmeSira: 2, altEmirIdleri: [torun], birlestigiEmirId: null, birlesmeOpNo: null });

    // Birleştirme: kök birleşmez; alt partisi olan önce onları alır; torun üstüne, kardeşler birbirine, alt parti üstüne.
    const surum = async (x: number) => (await ayrinti(x)).surum;
    assert.equal((await birlestir(alt, { kaynakEmirId: id, surum: await surum(alt), kaynakSurum: await surum(id) })).govde.mesaj, BIRLESTIRME_KOK);
    assert.equal((await birlestir(id, { kaynakEmirId: alt, surum: await surum(id), kaynakSurum: await surum(alt) })).govde.mesaj, BIRLESTIRME_ALT_PARTILI);
    assert.equal((await birlestir(alt, { kaynakEmirId: torun, surum: await surum(alt), kaynakSurum: 99 })).durum, 409, 'kaynağın eski sürümü');
    const k1 = await birlestir(alt, { kaynakEmirId: torun, surum: await surum(alt), kaynakSurum: await surum(torun) });
    assert.equal(k1.durum, 200, JSON.stringify(k1.govde));
    assert.deepEqual([k1.govde.emir.adet, k1.govde.emir.parti?.altEmirIdleri, k1.govde.emir.parti?.birlestigiEmirId], [4, [], null]);
    const kapanan = await ayrinti(torun);
    assert.deepEqual([kapanan.durum, kapanan.parti?.birlestigiEmirId], ['iptal', alt], 'birleşen parti katıldığı emri gösterir');
    assert.equal((await birlestir(alt, { kaynakEmirId: kardes, surum: await surum(alt), kaynakSurum: await surum(kardes) })).durum, 200);
    assert.equal((await birlestir(id, { kaynakEmirId: alt, surum: await surum(id), kaynakSurum: await surum(alt) })).durum, 200);
    e = await ayrinti(id);
    assert.deepEqual([e.adet, e.parti?.altEmirIdleri], [10, []]);
    assert.deepEqual(await ihtiyac(id), [[10, '20.0000']], 'birleşmeden sonra da aynı');
    assert.equal((await o().vt.tx((db) => planlanacakIsEmirleri(db))).some((i) => i.uretimEmriId === alt), false, 'birleşen parti planlanmaz');
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emri SET bolunme_sira = NULL WHERE id = $1', [alt]), /uretim_emri_bolunme_tutarli/);
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emri SET ust_emir_id = id, bolunme_sira = 1 WHERE id = $1', [alt]), /uretim_emri_kendine_bagli_degil/);
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emri SET birlestigi_emir_id = $2 WHERE id = $1', [id, alt]), /uretim_emri_birlesen_iptal/, 'iptal olmayan emir birleşmiş sayılmaz');
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emri SET birlestigi_emir_id = id WHERE id = $1', [torun]), /uretim_emri_birlesen_iptal/, 'kendine birleşmez');
  });

  test('Soru 132, 136 a: kartın sayılanı adımda tükettiğidir; girdili adımda sınır verilen bölü girdi, sonraki adımda önceki adımın kartlı sağlamı', async () => {
    const ist1 = await istasyonKur();
    const ist2 = await istasyonKur();
    const { uretimEmriId: id } = await ac([
      adim(1, { tur: 'makine', id: await makineKur(ist1) }, { bilesenler: [{ malzemeNo: hammaddeNo, miktar: '2.5' }] }),
      adim(2, { tur: 'makine', id: await makineKur(ist2) }),
    ], { adet: 10 });
    const kartAc = async (sira: number) => {
      const lot = (await o().sahip.tek<{ id: number }>(
        'INSERT INTO stok_parti (malzeme_id, tedarikci_parti_no, acan_kisi_id, lot_no) VALUES ($1, $2, $3, $4) RETURNING id', [hammaddeNo, `TP-S-${id}-${sira}`, yoneticiId, `LT-S-${id}-${sira}`]))!.id;
      return (await o().sahip.tek<{ id: number }>(
        'INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id) VALUES ($1, $2, $3, $4, $5) RETURNING id', [id, sira, hammaddeNo, lot, yoneticiId]))!.id;
    };
    const a = await kartAc(1);
    const b = await kartAc(2);
    const [ie1, ie2] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira', [id])).map((r) => r.id);
    const say = (isEmriId: number | undefined, istasyonId: number, tur: string, adet: number, kart: number) => o().sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman, is_emri_id, refakat_partisi_id)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 = 'hurda' THEN (SELECT min(id) FROM hurda_nedeni) END, false, now(), $6, $7)`,
      [id, yoneticiId, istasyonId, tur, adet, isEmriId, kart]);
    const oku = async (istasyonId: number | null) => Object.fromEntries([...(await o().vt.tx((db) => refakatKartiSayimlari(db, id, istasyonId, [
      { id: a, malzemeNo: hammaddeNo, verilen: '12.500' },
      { id: b, malzemeNo: hammaddeNo, verilen: '5' },
      { id: 999999, malzemeNo: null, verilen: '0' },
    ]))).entries()].map(([k, v]) => [k === a ? 'a' : k === b ? 'b' : 'istisna', [v.sayilan, v.sinir]]));

    assert.deepEqual(await oku(ist1), { a: [0, 5], b: [0, 2], istisna: [0, null] }, '12,5 / 2,5 = 5; 5 / 2,5 = 2; malzemesiz kartta sınır yok');
    await say(ie1, ist1, 'saglam', 3, a);
    await say(ie1, ist1, 'hurda', 1, a);
    await say(ie1, ist1, 'karar_bekliyor', 1, a);
    await say(ie1, ist1, 'saglam', 3, b);
    assert.deepEqual(await oku(ist1), { a: [5, 5], b: [3, 2], istisna: [0, null] }, 'hurda ve karar bekleyen de tüketir; sınır aşılınca da sayılan yazılır');
    assert.deepEqual(await oku(null), await oku(ist1), 'istasyonsuz okuma terminaldeki adımdır');
    await say(ie2, ist2, 'saglam', 2, a);
    assert.deepEqual(await oku(ist2), { a: [2, 3], b: [0, 3], istisna: [0, 0] }, 'ikinci adımda sınır önceki adımın kartlı sağlamı');
    assert.equal((await o().vt.tx((db) => refakatKartiSayimlari(db, id, ist1, []))).size, 0);
  });

  test('kart #125, Soru 121 a: çalışan adımda yalnız üretilmemiş adet bölünür, bitmiş adımdan bölünmez; sayım refakat partisini taşır', async () => {
    const ist = await istasyonKur();
    const mk = { tur: 'makine' as const, id: await makineKur(ist) };
    const { uretimEmriId: id } = await ac([adim(1, mk), adim(2, mk), adim(3, mk)], { adet: 10 });
    const bol = async (adimSira: number, adet: number) => istek<PartiBolCevabi & Hata>(
      'planlama_proje', 'POST', `/adimli-emirler/${id}/bol`, { adimSira, adet, surum: (await ayrinti(id)).surum }, randomUUID());
    // Kart stoktadır (kart #123); sayım kartın emrin ve açık olduğunu stokta denetletir (kart #126).
    const lot = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO stok_parti (malzeme_id, tedarikci_parti_no, acan_kisi_id, lot_no) VALUES ($1, $2, $3, $4) RETURNING id', [hammaddeNo, `TP-${id}`, yoneticiId, `LT-UE-${id}`]))!.id;
    const kart = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id) VALUES ($1, 1, $2, $3, $4) RETURNING id', [id, hammaddeNo, lot, yoneticiId]))!.id;
    const saglamPartileri: (number | null)[] = [];
    const kararPartileri: (number | null)[] = [];
    const birak = [
      saglamSayimDinle(async (_db, olay) => { saglamPartileri.push(olay.refakatPartisiId); }),
      kaliteKarariDinle(async (_db, olay) => { kararPartileri.push(olay.refakatPartisiId); }),
    ];
    try {
      assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
      assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 3, refakatPartisiId: kart })).durum, 200);
      await ilkParcaOnay(id);
      assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 1 })).durum, 200);
      assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 1, refakatPartisiId: 0 })).durum, 400, 'parti kimliği pozitif');
    } finally {
      for (const b of birak) b();
    }
    const satirlar = await o().vt.sorgu<{ tur: string; adet: number; p: number | null }>(
      'SELECT tur, adet, refakat_partisi_id AS p FROM uretim_sayimi WHERE emir_id = $1 ORDER BY id', [id]);
    assert.deepEqual(satirlar.map((r) => [r.tur, r.adet, r.p]), [['karar_bekliyor', 3, kart], ['karar_bekliyor', -3, kart], ['saglam', 3, kart], ['saglam', 1, null]],
      'karar satırları sayımın partisinde kalır');
    assert.deepEqual([saglamPartileri, kararPartileri], [[kart, null], [kart]]);

    // Adım 1 çalışıyor, 4 adet sayıldı: üretilmemiş 6 adet bölünür, üretilen üstte kalır.
    const fazla = await bol(1, 7);
    assert.deepEqual([fazla.durum, fazla.govde.mesaj], [400, BOLME_URETILMIS]);
    const b = await bol(1, 6);
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    assert.equal(b.govde.emir.adet, 4);
    const kol = await ayrinti(b.govde.altEmirId);
    assert.deepEqual([kol.adet, kol.parti?.bolunmeSira, kol.isEmirleri.map((i) => [i.opNo, i.durum])], [6, 1, [[10, 'bekliyor'], [20, 'bekliyor'], [30, 'bekliyor']]]);
    const bitti = await terminal(`/${id}/bitir`, {});
    assert.equal(bitti.durum, 200, JSON.stringify(bitti.govde));
    assert.deepEqual((await bol(1, 1)).govde.mesaj, BOLME_BASLAMIS, 'bitmiş adımdan bölünmez');
  });

  test('parti kolu: önceki adım bitmeden bölünür, rework adımıyla yürür, bekleyen birleşme adımında üstü bekletir, son adımında üste katılır', async () => {
    const ist = await istasyonKur();
    const [m1, m2] = [await makineKur(ist), await makineKur(ist)];
    const mk = (id: number) => ({ tur: 'makine' as const, id });
    const { uretimEmriId: id } = await ac([adim(1, mk(m1)), adim(2, mk(m1)), adim(3, mk(m2)), adim(4, mk(m2))], { adet: 10 });
    const yaz = <T = { emir: AdimliEmirAyrintisi } & Hata>(yol: string, govde: unknown) => istek<T>('planlama_proje', 'POST', `/adimli-emirler/${yol}`, govde, randomUUID());
    const rework = { oncekiOpNo: null, opNo: 15, tur: 'rework', ad: 'Rework', operasyonTipiId: tipId, kaynak: mk(m1), ayarSuresiDk: '5', birimSureDk: '2', terminGun: null, aciklama: 'Çapak' };

    const b = await yaz<PartiBolCevabi & Hata>(`${id}/bol`, { adimSira: 2, adet: 3, surum: (await ayrinti(id)).surum, birlesmeOpNo: 30, ekAdimlar: [rework] });
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const kol = b.govde.altEmirId;
    let k = await ayrinti(kol);
    assert.deepEqual(k.parti?.birlesmeOpNo, 30);
    assert.deepEqual(k.isEmirleri.map((i) => [i.sira, i.opNo, i.tur, i.ekAciklama]), [[1, 15, 'rework', 'Çapak'], [2, 20, 'rota', null]], 'kol birleşme adımına kadar taşır, rework önde');
    // 697: Reçete ve Rota durum anahtarını rotadaki yerle kurar; ek adımı dilimdeki türden tanır.
    const dilim = (await o().vt.tx((db) => emirDilimi(db))).find((e) => e.id === kol);
    assert.deepEqual(dilim?.isEmirleri.map((i) => [i.sira, i.opNo, i.tur]), [[1, 15, 'rework'], [2, 20, 'rota']]);
    assert.equal(b.govde.emir.adet, 7);
    const ustNo = (await ayrinti(id)).emirNo;
    assert.equal(k.emirNo, `${ustNo}/1`, 'kol üstün numarasını ve kaçıncı kol olduğunu taşır');

    const parti = (isEmriId: number, komut: 'baslat' | 'bitir') => o().vt.tx((db) => partiKomutuReddi(db, isEmriId, komut));
    assert.equal(await parti(k.isEmirleri[0]!.id, 'baslat'), KOL_ONCEKI_BITMEDI, 'terminal kaydı (Arkon) yazmadan önce aynı kuralı sorar');
    assert.equal(await parti(k.isEmirleri[0]!.id, 'bitir'), null, 'bitirmede kol kuralı sorulmaz');
    assert.equal((await o().vt.tx((db) => planlanacakIsEmirleri(db))).find((i) => i.id === k.isEmirleri[0]!.id)?.ekAciklama, 'Çapak', 'plan ek adımın açıklamasını taşır');
    assert.deepEqual([(await terminal(`/${kol}/baslat`)).govde.mesaj], [KOL_ONCEKI_BITMEDI], 'üstte bölünme adımından önceki adım bitmedi');
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 10 })).durum, 200);
    assert.equal((await terminal(`/${kol}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${kol}/bitir`, { saglamAdet: 3 })).durum, 200);
    k = await ayrinti(kol);
    await o().vt.tx((db) => isEmriKaynagiYaz(db, kim('planlama_proje'), k.isEmirleri[1]!.id, mk(m1)));

    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 7 })).durum, 200);
    const bekle = await terminal(`/${id}/baslat`);
    assert.deepEqual([bekle.durum, bekle.govde.mesaj], [409, BIRLESME_BEKLENIYOR], 'bekleyen birleşme adımı kol gelmeden başlamaz');
    assert.equal(await parti((await ayrinti(id)).isEmirleri.find((i) => i.opNo === 30)!.id, 'baslat'), BIRLESME_BEKLENIYOR);
    assert.equal((await yaz(`${kol}/birlesme-plani`, { birlesmeOpNo: null, surum: (await ayrinti(kol)).surum })).durum, 200, 'plan kaldırılabilir');
    assert.deepEqual((await ayrinti(kol)).isEmirleri.map((i) => i.opNo), [15, 20, 30, 40], 'plan kalkınca kalan adımlar kola döner');
    const ilerledi = await yaz(`${kol}/birlesme-plani`, { birlesmeOpNo: 20, surum: (await ayrinti(kol)).surum });
    assert.equal(ilerledi.durum, 400, 'birleşme adımı bölünme adımından sonra olmalı');
    assert.equal((await yaz(`${kol}/birlesme-plani`, { birlesmeOpNo: 30, surum: (await ayrinti(kol)).surum })).durum, 200);
    assert.deepEqual((await ayrinti(kol)).isEmirleri.map((i) => i.opNo), [15, 20]);

    assert.equal((await terminal(`/${kol}/baslat`)).durum, 200);
    const katil = await terminal(`/${kol}/bitir`, { saglamAdet: 3 });
    assert.equal(katil.durum, 200, JSON.stringify(katil.govde));
    k = await ayrinti(kol);
    assert.deepEqual([k.durum, k.parti?.birlestigiEmirId], ['iptal', id], 'kol son adımında üste katılır');
    assert.equal((await ayrinti(id)).adet, 10, 'kolun adedi üste döner');
    assert.equal((await yaz(`${kol}/birlesme-plani`, { birlesmeOpNo: null, surum: k.surum })).durum, 409, 'katılmış kolun planı değişmez');

    // Birleşme adımında elde kalan: üstün 7 sağlamı ve kolun getirdiği 3. Gelen sayılmasaydı 9 bölünemezdi.
    const b2 = await yaz<PartiBolCevabi & Hata>(`${id}/bol`, { adimSira: 3, adet: 9, surum: (await ayrinti(id)).surum });
    assert.equal(b2.durum, 200, JSON.stringify(b2.govde));
    assert.equal((await ayrinti(b2.govde.altEmirId)).emirNo, `${ustNo}/2`, 'katılan kolun numarası yeniden verilmez');
    const geri = await yaz(`${id}/birlestir`, { kaynakEmirId: b2.govde.altEmirId, surum: (await ayrinti(id)).surum, kaynakSurum: (await ayrinti(b2.govde.altEmirId)).surum });
    assert.equal(geri.durum, 200, JSON.stringify(geri.govde));
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200, 'kol katılınca birleşme adımı başlar');
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emri SET birlesme_op_no = 30 WHERE id = $1', [id]), /uretim_emri_birlesme_kolda/);
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emri SET birlesme_op_no = 0 WHERE id = $1', [kol]), /uretim_emri_birlesme_op_pozitif/);
  });

  test('283 a: kollardaki hurda ana emrin ayrıntısında ayrı satırdır, ana emrin hurdasına karışmaz; kolu olmayan emirde yoktur', async () => {
    const mk = (id: number) => ({ tur: 'makine' as const, id });
    const [m1, m2] = [await makineKur(await istasyonKur()), await makineKur(await istasyonKur())];
    const { uretimEmriId: id } = await ac([adim(1, mk(m1)), adim(2, mk(m2))], { adet: 10 });
    const neden = (await o().sahip.tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('IE-H283', 'Çapak', 952) RETURNING id"))!.id;
    const b = await istek<PartiBolCevabi & Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/bol`, { adimSira: 2, adet: 3, surum: (await ayrinti(id)).surum }, randomUUID());
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const kol = b.govde.altEmirId;
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'hurda', adet: 1, hurdaNedeniId: neden })).durum, 200);
    assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 9 })).durum, 200);
    await o().vt.tx(async (db) => isEmriKaynagiYaz(db, kim('planlama_proje'), (await ayrinti(kol)).isEmirleri[0]!.id, mk(m2)));
    assert.equal((await terminal(`/${kol}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${kol}/sayim`, { tur: 'hurda', adet: 2, hurdaNedeniId: neden })).durum, 200);
    const ust = await istek<EmirAyrintiCevabi>('planlama_proje', 'GET', `/uretim-emirleri/${id}`);
    assert.equal(ust.durum, 200, JSON.stringify(ust.govde));
    assert.equal(ust.govde.kolHurdasi, 2, 'yalnız kolun hurdası; ana emrin 1 hurdası katılmaz');
    const { uretimEmriId: kolsuz } = await ac([adim(1, mk(m1))], { adet: 4 });
    assert.equal((await istek<EmirAyrintiCevabi>('planlama_proje', 'GET', `/uretim-emirleri/${kolsuz}`)).govde.kolHurdasi, null);
  });

  test('ek adım ve akışlı birleşme: kolda rework konur ve kaldırılır, rota adımı çıkmaz; akışlı adım başlar ama kol gelmeden bitmez', async () => {
    const ist = await istasyonKur();
    const m = await makineKur(ist);
    const mk = { tur: 'makine' as const, id: m };
    // Kol başka istasyonda çalışır: bir istasyonda aynı anda tek iş başlar.
    const mk2 = { tur: 'makine' as const, id: await makineKur(await istasyonKur()) };
    const { uretimEmriId: id } = await ac([adim(1, mk), adim(2, mk), adim(3, mk, { bagimlilik: 'akisli', devirAdedi: 1 })], { adet: 6 });
    assert.deepEqual((await emirAkisKaydi(o().vt, id))?.isEmirleri.map((i) => [i.opNo, i.bagimlilik, i.devirAdedi]),
      [[10, 'bekleyen', null], [20, 'bekleyen', null], [30, 'akisli', 1]], 'akış bağımlılığı ve devir adedini okur');
    const yaz = (yol: string, govde: unknown, kisi = 'planlama_proje', ik: string | null = randomUUID()) =>
      istek<{ emir: AdimliEmirAyrintisi } & Hata>(kisi, 'POST', `/adimli-emirler/${yol}`, govde, ik ?? undefined);
    const ek = (oncekiOpNo: number | null, opNo: number, tur = 'tamir') => ({
      oncekiOpNo, opNo, tur, ad: 'Ek', operasyonTipiId: tipId, kaynak: mk2, ayarSuresiDk: null, birimSureDk: '1', terminGun: null,
    });
    const surum = async (x: number) => (await ayrinti(x)).surum;

    assert.equal((await yaz(`${id}/ek-adim`, { ...ek(10, 15), surum: await surum(id) })).govde.mesaj, EK_ADIM_KOLDA, 'kök emre ek adım konmaz');
    const b = await istek<PartiBolCevabi & Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/bol`, { adimSira: 2, adet: 2, surum: await surum(id), birlesmeOpNo: 30 }, randomUUID());
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const kol = b.govde.altEmirId;
    assert.equal((await yaz(`${kol}/ek-adim`, { ...ek(20, 25), surum: await surum(kol) }, 'operator')).durum, 403);
    assert.equal((await yaz(`${kol}/ek-adim`, { ...ek(20, 25), surum: await surum(kol) }, 'planlama_proje', null)).durum, 400, 'istek kimliği zorunlu');
    assert.equal((await yaz(`${kol}/ek-adim`, { ...ek(20, 25), surum: (await surum(kol)) - 1 })).durum, 409, 'eski sürüm');
    assert.equal((await yaz(`${kol}/ek-adim`, { ...ek(20, 20), surum: await surum(kol) })).durum, 400, 'op tekil olmalı');
    const eklendi = await yaz(`${kol}/ek-adim`, { ...ek(20, 25), surum: await surum(kol) });
    assert.equal(eklendi.durum, 200, JSON.stringify(eklendi.govde));
    assert.deepEqual(eklendi.govde.emir.isEmirleri.map((i) => [i.opNo, i.tur]), [[20, 'rota'], [25, 'tamir']]);
    assert.equal((await yaz(`${kol}/ek-adim-kaldir`, { opNo: 20, surum: await surum(kol) })).govde.mesaj, EK_ADIM_ROTA);
    assert.equal((await yaz(`${kol}/ek-adim-kaldir`, { opNo: 25, surum: await surum(kol) })).durum, 200);
    assert.equal((await yaz(`${kol}/ek-adim`, { ...ek(20, 25, 'rework'), surum: await surum(kol) })).durum, 200);

    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 6 })).durum, 200);
    const kolIsleri = (await ayrinti(kol)).isEmirleri;
    await o().vt.tx((db) => isEmriKaynagiYaz(db, kim('planlama_proje'), kolIsleri[0]!.id, mk2));
    assert.equal((await terminal(`/${kol}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${kol}/bitir`, { saglamAdet: 2 })).durum, 200);
    assert.equal((await terminal(`/${kol}/baslat`)).durum, 200);
    assert.equal((await yaz(`${kol}/ek-adim-kaldir`, { opNo: 25, surum: await surum(kol) })).govde.mesaj, EK_ADIM_KALDIR_BASLAMIS);
    const kaynak = await yaz(`${id}/birlestir`, { kaynakEmirId: kol, surum: await surum(id), kaynakSurum: await surum(kol) });
    assert.equal(kaynak.govde.mesaj, BIRLESTIRME_EK_ADIM, 'bitmemiş rework adımlı kol elle birleşmez');

    const ub = await terminal(`/${id}/baslat`);
    assert.equal(ub.durum, 200, JSON.stringify(ub.govde));
    assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 4 })).durum, 200);
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200, 'akışlı birleşme adımı gelen kadarla başlar');
    const erken = await terminal(`/${id}/bitir`, { saglamAdet: 4 });
    assert.deepEqual([erken.durum, erken.govde.mesaj], [409, BIRLESME_GELMEDI], 'kol gelmeden birleşme adımı bitmez');
    const birlesme = (await ayrinti(id)).isEmirleri.find((i) => i.opNo === 30)!.id;
    assert.equal(await o().vt.tx((db) => partiKomutuReddi(db, birlesme, 'bitir')), BIRLESME_GELMEDI, 'terminal kaydı (Arkon) yazmadan önce aynı kuralı sorar');
    assert.equal(await o().vt.tx((db) => partiKomutuReddi(db, birlesme, 'baslat')), null, 'başlamış adımda başlatma kuralı sorulmaz');
    assert.equal((await terminal(`/${kol}/bitir`, { saglamAdet: 2 })).durum, 200);
    assert.equal((await ayrinti(kol)).parti?.birlestigiEmirId, id);
    const fazla = await terminal(`/${id}/bitir`, { saglamAdet: 7 });
    assert.equal(fazla.durum, 200, JSON.stringify(fazla.govde));
    assert.match((fazla.govde as { uyari?: string }).uyari ?? '', /gelen 6; 1 fazla/, 'birleşme adımının girdisi iki taraftan gelendir (4 + 2); aşım uyarıdır (647 a)');
    assert.equal((await ayrinti(id)).durum, 'bitti');
    await assert.rejects(o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET tur = 'baska' WHERE uretim_emri_id = $1", [id]), /uretim_emirleri_is_emri_tur/);
    await assert.rejects(o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET ek_aciklama = 'x' WHERE uretim_emri_id = $1", [id]), /uretim_emirleri_is_emri_ek_aciklama_ekte/);
  });

  test('UE-RA-0..3: rotasız emir ayar açıkken malzemeli ve adımsız açılır; adımı eklenir, düzenlenir, silinir; rotalı emirde ve başlamış adımda reddedilir', async () => {
    const m = await makineKur(await istasyonKur());
    const ticari = await kartKur('ticari_mal');
    const ac2 = (govde: unknown, kisi = 'planlama_proje', ik: string | null = randomUUID()) =>
      istek<{ uretimEmriId: number } & Hata>(kisi, 'POST', '/adimli-emirler/rotasiz', govde, ik ?? undefined);
    const yaz = (yol: string, govde: unknown, ik: string | null = randomUUID()) =>
      istek<{ emir: AdimliEmirAyrintisi } & Hata>('planlama_proje', 'POST', `/adimli-emirler/${yol}`, govde, ik ?? undefined);
    const surum = async (x: number) => (await ayrinti(x)).surum;
    const adimGovdesi = (oncekiOpNo: number | null, opNo: number, ek: Record<string, unknown> = {}) => ({
      oncekiOpNo, opNo, ad: `Adım ${opNo}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: m }, ayarSuresiDk: '5', birimSureDk: '2', terminGun: null, ...ek,
    });

    // Varsayılan kapalıdır (denetim #27): ayar satırı yokken de reddedilir.
    try {
      for (const deger of [null, 'false']) {
        await o().sahip.sorgu("DELETE FROM ayar WHERE anahtar = 'uretim-emirleri.rotasiz-emir'");
        if (deger !== null) await o().sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.rotasiz-emir', $1, $2)", [deger, yoneticiId]);
        const kapali = await ac2({ projeId: denemeProjeId, malzemeNo: urunNo, adet: 3, teslim: null });
        assert.deepEqual([kapali.durum, kapali.govde.mesaj], [409, ROTASIZ_EMIR_KAPALI], String(deger));
      }
    } finally {
      await o().sahip.sorgu("UPDATE ayar SET deger = 'true' WHERE anahtar = 'uretim-emirleri.rotasiz-emir'");
    }
    assert.equal((await ac2({ projeId: denemeProjeId, malzemeNo: urunNo, adet: 3, teslim: null }, 'operator')).durum, 403);
    assert.equal((await ac2({ projeId: denemeProjeId, malzemeNo: urunNo, adet: 3, teslim: null }, 'planlama_proje', null)).durum, 400, 'istek kimliği zorunlu');
    assert.equal((await ac2({ projeId: denemeProjeId, malzemeNo: hammaddeNo, adet: 3, teslim: null })).durum, 400, 'yalnız mamul ya da yarı mamul');
    const acilan = await ac2({ projeId: denemeProjeId, malzemeNo: urunNo, adet: 3, teslim: null, aciklama: 'Rotasız deneme' });
    assert.equal(acilan.durum, 200, JSON.stringify(acilan.govde));
    const id = acilan.govde.uretimEmriId;
    const bos = await ayrinti(id);
    assert.deepEqual([bos.urun.id, bos.kaynakRotaRevizyonId, bos.isEmirleri.length, bos.durum], [urunNo, null, 0, 'planli']);

    // UE-RA-1: ekleme
    const bilesen = [{ malzemeId: hammaddeNo, miktar: 2.5, fireYuzde: 5 }];
    assert.equal((await yaz(`${id}/adim-ekle`, { ...adimGovdesi(null, 10), surum: await surum(id) }, null)).durum, 400, 'istek kimliği zorunlu');
    assert.equal((await yaz(`${id}/adim-ekle`, { ...adimGovdesi(null, 10), surum: (await surum(id)) + 1 })).durum, 409, 'eski sürüm');
    const ticariRet = await yaz(`${id}/adim-ekle`, { ...adimGovdesi(null, 10, { bilesenler: [{ malzemeId: ticari, miktar: 1, fireYuzde: 0 }] }), surum: await surum(id) });
    assert.deepEqual([ticariRet.durum, ticariRet.govde.mesaj], [400, BILESEN_GECERSIZ], 'ticari mal girdi olmaz');
    const ikiKez = await yaz(`${id}/adim-ekle`, { ...adimGovdesi(null, 10, { bilesenler: [...bilesen, ...bilesen] }), surum: await surum(id) });
    assert.equal(ikiKez.durum, 400, 'aynı malzeme iki kez bileşen olmaz');
    const s0 = await surum(id);
    const ilk = await yaz(`${id}/adim-ekle`, { ...adimGovdesi(null, 10, { bilesenler: bilesen, aciklama: 'Çapak al' }), surum: s0 });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.ok(ilk.govde.emir.surum > s0, 'sürüm artar');
    assert.deepEqual(ilk.govde.emir.isEmirleri.map((i) => [i.opNo, i.tur, i.ekAciklama, i.kaynak?.id]), [[10, 'ek', 'Çapak al', m]]);
    assert.deepEqual(ilk.govde.emir.isEmirleri[0]?.bilesenler.map((b) => [b.malzeme.id, b.miktar, b.fireYuzde]), [[hammaddeNo, '2.5000', '5.00']]);
    assert.equal((await yaz(`${id}/adim-ekle`, { ...adimGovdesi(10, 10), surum: await surum(id) })).durum, 400, 'op tekil');
    assert.equal((await yaz(`${id}/adim-ekle`, { ...adimGovdesi(10, 20), surum: await surum(id) })).durum, 200);
    const basa = await yaz(`${id}/adim-ekle`, { ...adimGovdesi(null, 5), surum: await surum(id) });
    assert.deepEqual(basa.govde.emir.isEmirleri.map((i) => [i.opNo, i.sira]), [[5, 1], [10, 2], [20, 3]], 'arkadakiler kayar');
    assert.equal(basa.govde.emir.siradaki?.opNo, 5);
    const dilim = (await o().vt.tx((db) => emirDilimi(db))).find((e) => e.id === id);
    assert.equal(dilim?.kaynakRotaRevizyonId, null, 'rotasız emir dilimde görünür');
    assert.deepEqual(dilim?.isEmirleri.map((i) => [i.opNo, i.ad, i.operasyonTipiId, i.kaynak?.tur, i.ayarSuresiDk, i.birimSureDk, i.bilesenler.length]),
      [[5, 'Adım 5', tipId, 'makine', '5.00', '2.0000', 0], [10, 'Adım 10', tipId, 'makine', '5.00', '2.0000', 1], [20, 'Adım 20', tipId, 'makine', '5.00', '2.0000', 0]]);
    assert.deepEqual(dilim?.isEmirleri[1]?.bilesenler, [{ malzemeId: hammaddeNo, miktar: '2.5000', fireYuzde: '5.00' }]);
    // Kart #1257: rotasız emrin adımları plana girmez; Arkon Hazırlık onları plan satırı biçiminde okur.
    const hazirlik = (await o().vt.tx((db) => rotasizIsEmirleri(db))).filter((i) => i.uretimEmriId === id);
    assert.deepEqual(hazirlik.map((i) => [i.opNo, i.kaynakRotaRevizyonId, i.kaynak?.id, i.durum]), [[5, null, m, 'planli'], [10, null, m, 'planli'], [20, null, m, 'planli']]);
    assert.equal((await o().vt.tx((db) => planlanacakIsEmirleri(db))).some((i) => i.uretimEmriId === id), false, 'plan rotasız adımı almaz');

    // UE-RA-2: düzenleme
    const ad = await yaz(`${id}/adim-duzenle`, { opNo: 10, ad: 'Taşlama', surum: await surum(id) });
    assert.equal(ad.durum, 200, JSON.stringify(ad.govde));
    const on = ad.govde.emir.isEmirleri.find((i) => i.opNo === 10);
    assert.deepEqual([on?.ad, on?.ekAciklama, on?.bilesenler.length, on?.birimSureDk, on?.kaynak?.id], ['Taşlama', 'Çapak al', 1, '2.0000', m], 'verilmeyen alan kalır');
    const temiz = await yaz(`${id}/adim-duzenle`, { opNo: 10, bilesenler: [], aciklama: null, kaynak: null, surum: await surum(id) });
    const on2 = temiz.govde.emir.isEmirleri.find((i) => i.opNo === 10);
    assert.deepEqual([on2?.ekAciklama, on2?.bilesenler.length, on2?.kaynak], [null, 0, null], 'bileşen listesi yerine geçer');
    assert.equal((await yaz(`${id}/adim-duzenle`, { opNo: 99, ad: 'Yok', surum: await surum(id) })).govde.mesaj, IS_EMRI_YOK);
    assert.equal((await yaz(`${id}/adim-duzenle`, { opNo: 10, terminGun: 3, surum: await surum(id) })).durum, 400, 'makine adımına termin girmez');

    // Başlamış adım değişmez.
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await yaz(`${id}/adim-duzenle`, { opNo: 5, ad: 'X', surum: await surum(id) })).govde.mesaj, ROTASIZ_ADIM_BASLAMIS);
    assert.equal((await yaz(`${id}/adim-sil`, { opNo: 5, surum: await surum(id) })).govde.mesaj, ROTASIZ_ADIM_BASLAMIS);

    // UE-RA-3: silme; son adım da silinir.
    const sil = await yaz(`${id}/adim-sil`, { opNo: 10, surum: await surum(id) });
    assert.deepEqual(sil.govde.emir.isEmirleri.map((i) => [i.opNo, i.sira]), [[5, 1], [20, 2]]);
    const tek = (await ac2({ projeId: denemeProjeId, malzemeNo: urunNo, adet: 1, teslim: null })).govde.uretimEmriId;
    assert.equal((await yaz(`${tek}/adim-ekle`, { ...adimGovdesi(null, 10), surum: await surum(tek) })).durum, 200);
    const sonAdim = await yaz(`${tek}/adim-sil`, { opNo: 10, surum: await surum(tek) });
    assert.deepEqual([sonAdim.durum, sonAdim.govde.emir?.isEmirleri.length], [200, 0], 'rotasız emir adımsız kalabilir');

    // 143 a: başka modülün kaydına bağlı iş emri silinmez; kullanıcı ham hata yerine nedenini görür. Bağı kuran tablo burada
    // aynı kısıt adıyla taklit edilir (satın alma siparişi kurmak testin konusu değil).
    const bagli = (await o().sahip.tek<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 AND op_no = 20', [id]))!.id;
    await o().sahip.sorgu(`CREATE TABLE deneme_siparis_bagi (is_emri_id int CONSTRAINT satin_alma_siparis_satiri_is_emri REFERENCES uretim_emirleri_is_emri,
      baska_is_emri_id int CONSTRAINT deneme_bilinmeyen_bag REFERENCES uretim_emirleri_is_emri,
      hareket_is_emri_id int CONSTRAINT stok_hareketi_is_emri_id_fkey REFERENCES uretim_emirleri_is_emri,
      defter_is_emri_id int CONSTRAINT proje_maliyet_defteri_is_emri REFERENCES uretim_emirleri_is_emri)`);
    try {
      await o().sahip.sorgu('INSERT INTO deneme_siparis_bagi (is_emri_id) VALUES ($1)', [bagli]);
      const siparisli = await yaz(`${id}/adim-sil`, { opNo: 20, surum: await surum(id) });
      assert.deepEqual([siparisli.durum, siparisli.govde.kod, siparisli.govde.mesaj], [409, 'BAGIMLI_KAYIT', IS_EMRI_SIPARISE_BAGLI]);
      await o().sahip.sorgu('UPDATE deneme_siparis_bagi SET is_emri_id = NULL, baska_is_emri_id = $1', [bagli]);
      const baskasi = await yaz(`${id}/adim-sil`, { opNo: 20, surum: await surum(id) });
      assert.deepEqual([baskasi.durum, baskasi.govde.kod, baskasi.govde.mesaj], [409, 'BAGIMLI_KAYIT', IS_EMRI_BAGLI_KAYIT]);
      // 192 a: stok hareketi yalnız eklenir, bağı boşaltılamaz; hareketi olan iş emri silinmez. Taklit, stoktaki gerçek kısıdın adını taşır.
      const stokBagi = await o().sahip.tek<{ conname: string }>(`SELECT conname FROM pg_constraint
        WHERE conrelid = 'stok_hareketi'::regclass AND confrelid = 'uretim_emirleri_is_emri'::regclass AND contype = 'f'`);
      assert.equal(stokBagi?.conname, 'stok_hareketi_is_emri_id_fkey');
      await o().sahip.sorgu('UPDATE deneme_siparis_bagi SET baska_is_emri_id = NULL, hareket_is_emri_id = $1', [bagli]);
      const hareketli = await yaz(`${id}/adim-sil`, { opNo: 20, surum: await surum(id) });
      assert.deepEqual([hareketli.durum, hareketli.govde.kod, hareketli.govde.mesaj], [409, 'BAGIMLI_KAYIT', IS_EMRI_STOK_HAREKETLI]);
      // 199 a: maliyeti dondurulmuş iş emri proje maliyet defterinde kalır; silinmez.
      const defterBagi = await o().sahip.tek<{ conname: string }>(`SELECT conname FROM pg_constraint
        WHERE conrelid = 'proje_maliyet_defteri'::regclass AND confrelid = 'uretim_emirleri_is_emri'::regclass AND contype = 'f'`);
      assert.equal(defterBagi?.conname, 'proje_maliyet_defteri_is_emri');
      await o().sahip.sorgu('UPDATE deneme_siparis_bagi SET hareket_is_emri_id = NULL, defter_is_emri_id = $1', [bagli]);
      const defterli = await yaz(`${id}/adim-sil`, { opNo: 20, surum: await surum(id) });
      assert.deepEqual([defterli.durum, defterli.govde.kod, defterli.govde.mesaj], [409, 'BAGIMLI_KAYIT', IS_EMRI_MALIYETI_DONDURULMUS]);
      await o().sahip.sorgu('DELETE FROM deneme_siparis_bagi');
      assert.deepEqual((await yaz(`${id}/adim-sil`, { opNo: 20, surum: await surum(id) })).govde.emir.isEmirleri.map((i) => i.opNo), [5], 'bağ kalkınca silinir');
    } finally {
      await o().sahip.sorgu('DROP TABLE deneme_siparis_bagi');
    }

    // Rotalı emrin adımları rotadan gelir.
    const { uretimEmriId: rotali } = await ac([adim(1, { tur: 'makine', id: m })]);
    assert.equal((await yaz(`${rotali}/adim-ekle`, { ...adimGovdesi(10, 15), surum: await surum(rotali) })).govde.mesaj, ROTALI_EMIR_ADIMI);
    assert.equal((await yaz(`${rotali}/adim-duzenle`, { opNo: 10, ad: 'X', surum: await surum(rotali) })).govde.mesaj, ROTALI_EMIR_ADIMI);
    assert.equal((await yaz(`${rotali}/adim-sil`, { opNo: 10, surum: await surum(rotali) })).govde.mesaj, ROTALI_EMIR_ADIMI);
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emri SET malzeme_no = NULL, istasyon_id = 1 WHERE id = $1', [rotali]), /uretim_emri_rota_malzemeli/);
  });

  test('sağlam sayım olayı (#1289): iş emirli emirde olay sayımın bağlandığı çalışan iş emrini taşır', async () => {
    const ist = await istasyonKur();
    const { uretimEmriId: id, isEmriIdleri } = await ac([adim(1, { tur: 'makine', id: await makineKur(ist) })]);
    const gelen: (number | null)[] = [];
    const birak = saglamSayimDinle(async (_db, olay) => { gelen.push(olay.isEmriId); });
    try {
      assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
      assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 2 })).durum, 200);
    } finally {
      birak();
    }
    assert.deepEqual(gelen, [isEmriIdleri[0]]);
  });

  test('hazırlık tamamlandı olayı (233): emir başına bir kez, ilk iş emri başlarken; reddedilen başlatma ve sonraki adım olay vermez', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: makine }), adim(2, { tur: 'makine', id: makine })], { adet: 5 });
    const gelen: number[] = [];
    const birak = hazirlikTamamlandiDinle(async (_db, olay) => { gelen.push(olay.uretimEmriId); });
    try {
      assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
      assert.notEqual((await terminal(`/${id}/baslat`)).durum, 200, 'çalışan emir yeniden başlamaz');
      assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 5 })).durum, 200);
      assert.equal((await terminal(`/${id}/baslat`)).durum, 200, 'ikinci adım başlar');
    } finally {
      birak();
    }
    assert.deepEqual(gelen, [id]);
  });

  test('biten iş emirleri (borç 90): pencerede biten iş emri sağlamı ve istasyonuyla gelir; istasyon süzgeci ve pencere dışı', async () => {
    const ist = await istasyonKur();
    const baska = await istasyonKur();
    const makine = await makineKur(ist);
    const { uretimEmriId: id, isEmriIdleri } = await ac([adim(1, { tur: 'makine', id: makine }), adim(2, { tur: 'fason', id: firmaId })], { adet: 5 });
    const bas = new Date(Date.now() - 3_600_000).toISOString();
    const bit = new Date(Date.now() + 3_600_000).toISOString();
    const oku = (istasyonlar: number[] | null, b = bas, s = bit) => o().vt.tx((db) => bitenIsEmirleri(db, b, s, istasyonlar));
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.deepEqual((await oku([ist])), [], 'çalışan iş emri biten değildir');
    assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 4 })).durum, 200);
    const [satir, ...fazla] = await oku([ist]);
    assert.deepEqual(fazla, []);
    assert.deepEqual(satir && { ...satir, bitis: typeof satir.bitis }, { isEmriId: isEmriIdleri[0], uretimEmriId: id, istasyonId: ist, saglamAdet: 4, bitis: 'string' });
    assert.ok(satir && Date.parse(satir.bitis) >= Date.parse(bas) && Date.parse(satir.bitis) < Date.parse(bit), 'bitiş penceredeki zamandır');
    assert.ok((await oku(null)).some((x) => x.isEmriId === isEmriIdleri[0]), 'süzgeçsiz bütün istasyonlar');
    assert.deepEqual(await oku([baska]), [], 'başka istasyon süzülür');
    assert.deepEqual(await oku([ist], bit, new Date(Date.now() + 7_200_000).toISOString()), [], 'pencere dışı gelmez');
  });

  test('Saat okumaları: biten emir istasyonu son bitirme kaydından gelir; istasyon duruşu yalnız durdur, pencereyle kesilir; çalışmaya son geçiş', async () => {
    const ist = await istasyonKur();
    const baska = await istasyonKur();
    const { uretimEmriId: id, isEmriIdleri } = await ac([adim(1, { tur: 'makine', id: await makineKur(ist) })]);
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    const neden = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ('SA-D1', 'Saat duruşu', 'plansiz', 963) RETURNING id"))!.id;
    const kisi = kim('operator').id;
    const T = Date.now();
    const dk = (n: number) => new Date(T - n * 60_000).toISOString();
    const olay = (istasyon: number, tur: string, n: number) => o().sahip.sorgu(
      'INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, durus_nedeni_id, zaman, is_emri_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, kisi, istasyon, tur, tur === 'durdur' ? neden : null, dk(n), isEmriIdleri[0]]);
    await olay(ist, 'durdur', 30);
    await olay(ist, 'devam', 10);
    await olay(ist, 'duraklat', 8);
    await olay(ist, 'devam', 5);
    const pencere = [dk(25), new Date(T).toISOString()] as const;
    const durus = await o().vt.tx((db) => istasyonDurusSureleri(db, [ist, baska], ...pencere));
    assert.deepEqual([...durus], [[ist, 900]], 'duruş 30-10 dk önce; pencere 25 dk önce başlar; duraklatma sayılmaz; duruşsuz istasyon yok');
    const gecis = async () => [...await o().vt.tx((db) => calismayaGecisAnlari(db, [id, 999_999]))].map(([e, an]) => [e, Date.parse(an)]);
    assert.ok(Date.parse(dk(5)) < (await gecis())[0]![1]!, 'başlatma son devamdan sonra: son geçiş başlatmadır');
    // Gelecek zamanlı olay yazılmaz: son olaylar listesi (fabrika haritası) zamana göre süzer.
    await olay(ist, 'devam', 0);
    assert.deepEqual(await gecis(), [[id, T]], 'başlatmadan sonraki devam; kayıtsız emir haritada yok');

    assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 10 })).durum, 200);
    const genis = [new Date(T - 3_600_000).toISOString(), new Date(T + 3_600_000).toISOString()] as const;
    const biten = await o().vt.tx((db) => bitenEmirler(db, [ist], ...genis));
    assert.deepEqual(biten.map((b) => [b.id, b.istasyonId]), [[id, ist]], 'bitişte emrin istasyonu boşalsa da istasyon bitirme kaydından');
    assert.deepEqual(await o().vt.tx((db) => bitenEmirler(db, [baska], ...genis)), []);
  });

  test('kişinin özeti (#1295): iş listesi, hurda nedenleri, standart süre ve iş emri plan bilgisi; veri yoksa boş', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const { uretimEmriId: id, isEmriIdleri } = await ac([adim(1, { tur: 'makine', id: makine }), adim(2, { tur: 'fason', id: firmaId })]);
    const neden = (await o().sahip.tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('IE-H1', 'Ölçü dışı', 951) RETURNING id"))!.id;
    const kisiId = kim('operator').id;
    const bas = new Date(Date.now() - 3_600_000).toISOString();
    const bit = new Date(Date.now() + 3_600_000).toISOString();
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 4 })).durum, 200);
    await ilkParcaOnay(id);
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'hurda', adet: 2, hurdaNedeniId: neden })).durum, 200);
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'hurda', adet: -1, hurdaNedeniId: neden })).durum, 200);

    const isler = await o().vt.tx((db) => kisininIsEmirleri(db, kisiId, bas, bit));
    const bu = isler.filter((i) => i.uretimEmriId === id);
    assert.equal(bu.length, 1, 'yalnız sayımı ya da katılımı olan iş emri');
    assert.deepEqual(
      { ...bu[0], saniye: typeof bu[0]?.saniye },
      {
        isEmriId: isEmriIdleri[0], uretimEmriId: id, emirNo: bu[0]?.emirNo, urun: { malzemeNo: urunNo, parcaNo: bu[0]?.urun.parcaNo, parcaAd: bu[0]?.urun.parcaAd },
        opNo: 10, adimAdi: 'Adım 1', istasyonId: ist, makineId: makine, durum: 'calisiyor', saglam: 4, hurda: 1, saniye: 'number', birimSureDk: '1.5000', adet: 10,
      },
    );
    // Paylaşılan veritabanında başka testlerin hurdası da bu kişiye yazılır; yalnız bu testin nedeni ölçülür.
    assert.deepEqual((await o().vt.tx((db) => kisininHurdaNedenleri(db, kisiId, bas, bit))).filter((h) => h.hurdaNedeniId === neden), [{ hurdaNedeniId: neden, kod: 'IE-H1', ad: 'Ölçü dışı', adet: 1 }]);
    const standart = await o().vt.tx((db) => standartSureler(db, [kisiId, kisiId, 2147483647], bas, bit));
    assert.ok(standart.has(kisiId) && !standart.has(2147483647), 'sağlamı olmayan kişi haritada yoktur');
    assert.ok((standart.get(kisiId)?.standartSaniye ?? 0) >= 360, '4 adet x 1,5 dk = 360 sn (başka testlerin sayımı da girebilir)');
    const plan = await o().vt.tx((db) => isEmriPlanBilgileri(db, [...isEmriIdleri, 2147483647]));
    assert.deepEqual([...plan.keys()].sort(), [...isEmriIdleri].sort());
    assert.deepEqual(plan.get(isEmriIdleri[0]!), { uretimEmriId: id, opNo: 10, adet: 10, ayarSureDk: '10.00', birimSureDk: '1.5000', kaynak: { tur: 'makine', id: makine }, istasyonId: ist });
    assert.deepEqual(plan.get(isEmriIdleri[1]!)?.kaynak, { tur: 'fason', id: firmaId });

    const once = new Date(Date.now() - 7_200_000).toISOString();
    assert.deepEqual(await o().vt.tx((db) => kisininIsEmirleri(db, kisiId, once, bas)), [], 'penceresinde kaydı olmayan kişi boş');
    assert.deepEqual(await o().vt.tx((db) => kisininHurdaNedenleri(db, kisiId, once, bas)), []);
    assert.equal((await o().vt.tx((db) => standartSureler(db, [kisiId], once, bas))).size, 0);
    assert.equal((await o().vt.tx((db) => standartSureler(db, [], bas, bit))).size, 0);
  });

  test('emir türü: açarken seçilir, verilmezse seri; kol üstün türünü alır ya da bölerken değişir; listede ve planda görünür', async () => {
    const ist = await istasyonKur();
    const mk = { tur: 'makine' as const, id: await makineKur(ist) };
    const { uretimEmriId: seri } = await ac([adim(1, mk)]);
    assert.equal((await ayrinti(seri)).emirTuru, 'seri', 'verilmezse seri');
    const { uretimEmriId: id } = await o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev1, isEmirleri: [adim(1, mk), adim(2, mk)], emirTuru: 'fai',
    }));
    assert.equal((await ayrinti(id)).emirTuru, 'fai');
    await red(o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 1, teslim: null, kaynakRotaRevizyonId: rev1, isEmirleri: [adim(1, mk)], emirTuru: 'baska' as never,
    })), 'Emir türü listede yok.');

    const bol = (govde: unknown) => istek<PartiBolCevabi & Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/bol`, govde, randomUUID());
    const k1 = await bol({ adimSira: 2, adet: 2, surum: (await ayrinti(id)).surum });
    assert.equal(k1.durum, 200, JSON.stringify(k1.govde));
    assert.equal((await ayrinti(k1.govde.altEmirId)).emirTuru, 'fai', 'kol üstün türünü alır');
    const k2 = await bol({ adimSira: 2, adet: 2, surum: (await ayrinti(id)).surum, emirTuru: 'numune' });
    assert.equal((await ayrinti(k2.govde.altEmirId)).emirTuru, 'numune', 'bölerken seçilen tür');
    assert.equal((await bol({ adimSira: 2, adet: 1, surum: (await ayrinti(id)).surum, emirTuru: 'baska' })).durum, 400);
    assert.equal((await ayrinti(id)).emirTuru, 'fai', 'üstün türü değişmez');

    const liste = await istek<AdimliListeCevabi>('planlama_proje', 'GET', '/adimli-emirler');
    assert.equal(liste.govde.emirler.find((x) => x.id === k2.govde.altEmirId)?.emirTuru, 'numune');
    const plan = await o().vt.tx((db) => planlanacakIsEmirleri(db));
    assert.equal(plan.find((i) => i.uretimEmriId === id)?.emirTuru, 'fai');
    await assert.rejects(o().sahip.sorgu("UPDATE uretim_emri SET emir_turu = 'baska' WHERE id = $1", [id]), /uretim_emri_emir_turu/);
  });

  test('proje: emir yalnız aktif projeyle açılır (224: seri emir projesiz açılmaz, stoğa üretim açılır), numara proje ve parça kodunu taşır; liste yalnız o projenin emirlerini verir, kol üstün projesini taşır', async () => {
    const ist = await istasyonKur();
    const mk = { tur: 'makine' as const, id: await makineKur(ist) };
    const proje = async (kod: string, durum = 'aktif'): Promise<number> => {
      const r = await o().sahip.tek<{ id: number }>('INSERT INTO projeler_proje (kod, ad, durum, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING id', [kod, `Deneme ${kod}`, durum, yoneticiId]);
      if (!r) throw new Error('proje kurulamadı');
      return r.id;
    };
    const [pa, pb, iptal] = [await proje('PRJA'), await proje('PRJB'), await proje('PRJX', 'iptal')];
    const [{ uretimEmriId: a }, { uretimEmriId: b }, { uretimEmriId: projesiz }] = [await ac([adim(1, mk), adim(2, mk)], { projeId: pa }), await ac([adim(1, mk)], { projeId: pb }), await ac([adim(1, mk)], { projeId: null, emirTuru: 'stok' })];
    await red(ac([adim(1, mk)], { projeId: null }), 'Üretim emri bir projeyle açılmalı.');
    await red(ac([adim(1, mk)], { projeId: iptal }), 'Proje bulunamadı ya da aktif değil.');
    await red(ac([adim(1, mk)], { projeId: 999999 }), 'Proje bulunamadı ya da aktif değil.');

    const parca = (await o().sahip.tek<{ parca_no: string }>('SELECT parca_no FROM uretim_emri WHERE id = $1', [a]))?.parca_no;
    assert.ok(parca);
    assert.match((await ayrinti(a)).emirNo, new RegExp(`(^|-)PRJA-${parca}-\\d{2}-\\d{2}-\\d{3}$`), 'numara: firma, proje, parça, yıl, ay, sayaç');
    assert.match((await ayrinti(projesiz)).emirNo, new RegExp(`(^|-)${parca}-\\d{2}-\\d{2}-\\d{3}$`));
    assert.ok(!(await ayrinti(projesiz)).emirNo.includes('PRJ'), 'projesiz emirde proje alanı düşer');
    const sayaclar = await Promise.all([a, b, projesiz].map(async (id) => Number((await ayrinti(id)).emirNo.slice(-3))));
    const [ilk = 0] = sayaclar;
    assert.deepEqual(sayaclar, [ilk, ilk + 1, ilk + 2], 'sayaç her emirde bir ilerler, reddedilen emir sayaç yakmaz');

    const kol = await istek<PartiBolCevabi & Hata>('planlama_proje', 'POST', `/adimli-emirler/${a}/bol`, { adimSira: 2, adet: 2, surum: (await ayrinti(a)).surum }, randomUUID());
    assert.equal(kol.durum, 200, JSON.stringify(kol.govde));
    const liste = await istek<AdimliListeCevabi>('planlama_proje', 'GET', `/adimli-emirler?projeId=${pa}`);
    assert.equal(liste.durum, 200);
    assert.deepEqual(liste.govde.emirler.map((e) => [e.id, e.projeId]).sort(), [[a, pa], [kol.govde.altEmirId, pa]].sort());
    assert.deepEqual((await istek<AdimliListeCevabi>('planlama_proje', 'GET', `/adimli-emirler?projeId=${pb}`)).govde.emirler.map((e) => e.id), [b]);
    const hepsi = (await istek<AdimliListeCevabi>('planlama_proje', 'GET', '/adimli-emirler')).govde.emirler;
    assert.equal(hepsi.find((e) => e.id === projesiz)?.projeId, null, 'süzgeçsiz liste projesiz emri de verir');
    assert.equal((await istek('planlama_proje', 'GET', '/adimli-emirler?projeId=0')).durum, 400);
    assert.equal((await istek('operator', 'GET', `/adimli-emirler?projeId=${pa}`)).durum, 403);
  });

  test('adımlı liste: varsayılan açık emirler; bitenler ayrı, sayfalı ve süzgeçli (kart #1323)', async () => {
    const mk = { tur: 'makine' as const, id: await makineKur(await istasyonKur()) };
    const [{ uretimEmriId: acik }, { uretimEmriId: biten }, { uretimEmriId: iptal }] = [await ac([adim(1, mk)]), await ac([adim(1, mk)]), await ac([adim(1, mk)])];
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'bitti', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [biten]);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [iptal]);
    const idler = async (yol: string) => (await istek<AdimliListeCevabi>('planlama_proje', 'GET', yol)).govde.emirler.map((e) => e.id);
    const varsayilan = await idler('/adimli-emirler');
    assert.ok(varsayilan.includes(acik));
    assert.ok(!varsayilan.includes(biten) && !varsayilan.includes(iptal), 'varsayılan liste biten ve iptal emri vermez');
    const hepsi = await idler('/adimli-emirler?kapsam=hepsi');
    assert.ok([acik, biten, iptal].every((id) => hepsi.includes(id)), 'kapsam=hepsi hepsini verir');

    const sayfa = async (sorgu: string) => {
      const c = await istek<AdimliBitenlerCevabi>('planlama_proje', 'GET', `/adimli-emirler/bitenler?${sorgu}`);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return adimliBitenlerCevabi.parse(c.govde);
    };
    const tum = await sayfa('sayfaBoyu=200');
    assert.ok(!tum.satirlar.some((e) => e.id === acik), 'açık emir bitenlerde yok');
    assert.ok(tum.satirlar.every((e) => e.durum === 'bitti' || e.durum === 'iptal'));
    const ilk = await sayfa('sayfaBoyu=1');
    assert.deepEqual([ilk.satirlar.length, ilk.toplam], [1, tum.toplam]);
    assert.equal(ilk.satirlar[0]?.id, Math.max(...tum.satirlar.map((e) => e.id)), 'en yeni önce');
    assert.deepEqual((await sayfa('sayfaBoyu=200&durum=iptal')).satirlar.map((e) => e.id).includes(biten), false, 'durum süzer');
    const no = (await ayrinti(biten)).emirNo;
    assert.deepEqual((await sayfa(`ara=${encodeURIComponent(no)}`)).satirlar.map((e) => e.id), [biten], 'arama emir numarasıyla süzer');
    assert.equal((await istek('operator', 'GET', '/adimli-emirler/bitenler')).durum, 403);
  });

  test('ana sayfa özeti: planlanacak taslak, açık emir, kişinin kuyruğu ve bugünkü sağlam sayımı; liste yetkisi yoksa emir sayısı verilmez', async () => {
    await kisiEkle('pano_op', 'operator');
    const ozet = async (ad: string): Promise<OzetCevabi> => {
      const c = await istek<OzetCevabi>(ad, 'GET', '/uretim-emirleri/ozet');
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return ozetCevabi.parse(c.govde);
    };
    assert.equal((await istek(null, 'GET', '/uretim-emirleri/ozet')).durum, 401);
    assert.deepEqual(await ozet('pano_op'), { planlanacak: null, acik: null, kuyrugum: 0, bugunSaglam: null, asamalar: null }, 'sayımı olmayan gün sıfır değil, veri yok');
    const once = await ozet('planlama_proje');
    assert.ok(once.planlanacak !== null && once.acik !== null);

    const ist = await istasyonKur();
    const m = await makineKur(ist);
    const kisi = { tur: 'kisi' as const, id: kim('pano_op').id };
    await ac([adim(1, kisi)], { taslak: true });
    assert.equal((await ozet('pano_op')).kuyrugum, 0, 'taslak emir kuyruğa girmez');
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: m }), adim(2, kisi)]);
    const sonra = await ozet('planlama_proje');
    assert.equal(sonra.planlanacak, once.planlanacak + 1);
    assert.equal(sonra.acik, once.acik + 1);
    assert.equal((await ozet('pano_op')).kuyrugum, 1);

    const op = (yol: string, govde?: unknown) => terminal(`/${id}${yol}`, govde, 'pano_op');
    assert.equal((await op('/baslat')).durum, 200);
    assert.equal((await op('/sayim', { tur: 'saglam', adet: 5 })).durum, 200);
    await ilkParcaOnay(id);
    assert.equal((await op('/sayim', { tur: 'saglam', adet: 2 })).durum, 200);
    assert.equal((await op('/sayim', { tur: 'saglam', adet: -1 })).durum, 200);
    assert.equal((await ozet('pano_op')).bugunSaglam, 6, 'düzeltme net adede girer');
    assert.equal((await ozet('planlama_proje')).bugunSaglam, null, 'başkasının sayımı sayılmaz');
    // Tesis gece yarısından bir dakika önce: UTC günüyle aynı gün olabilir, tesis gününde dündür.
    await o().sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, duzeltme, zaman)
       VALUES ($1, $2, $3, 'saglam', 100, false,
         (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') - interval '1 minute')`,
      [id, kim('pano_op').id, ist],
    );
    assert.equal((await ozet('pano_op')).bugunSaglam, 6, 'dünkü sayım bugüne girmez');

    const { uretimEmriId: iptalEdilecek } = await ac([adim(1, kisi)]);
    assert.equal((await ozet('pano_op')).kuyrugum, 2);
    const iptal = await istek<Hata>('planlama_proje', 'POST', `/adimli-emirler/${iptalEdilecek}/iptal`, { surum: (await ayrinti(iptalEdilecek)).surum });
    assert.equal(iptal.durum, 200, JSON.stringify(iptal.govde));
    assert.equal((await ozet('pano_op')).kuyrugum, 1, 'iptal edilen emir kuyruktan çıkar');
    assert.equal((await ozet('planlama_proje')).acik, once.acik + 1);
  });

  test('panel: aşama sayıları, günlük üretim serisi ve duruş nedeni başına süre; liste okuyamayan alamaz', async () => {
    const asama = async () => {
      const c = await istek<OzetCevabi>('planlama_proje', 'GET', '/uretim-emirleri/ozet');
      const a = ozetCevabi.parse(c.govde).asamalar;
      assert.ok(a);
      return a;
    };
    const gunluk = async (gun?: number) => {
      const c = await istek<GunlukUretimCevabi>('planlama_proje', 'GET', `/uretim-emirleri/gunluk-uretim${gun === undefined ? '' : `?gun=${gun}`}`);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return gunlukUretimCevabi.parse(c.govde).gunler;
    };
    const dagilim = async (gun: number) => {
      const c = await istek<DurusDagilimiCevabi>('planlama_proje', 'GET', `/uretim-emirleri/durus-dagilimi?gun=${gun}`);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return durusDagilimiCevabi.parse(c.govde).nedenler;
    };
    const bugun = async () => (await o().vt.tek<{ g: string }>("SELECT to_char(current_date, 'YYYY-MM-DD') AS g"))!.g;

    const a0 = await asama();
    assert.equal(a0.kaliteBekleyen, null, 'modülde kalite durumu yok, sıfır uydurulmaz');
    const ist = await istasyonKur();
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: await makineKur(ist) })]);
    assert.equal((await asama()).planda, a0.planda + 1);
    const gBugun = await bugun();
    const once = (await gunluk()).find((g) => g.gun === gBugun) ?? { saglam: 0, hurda: 0 };

    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    let a = await asama();
    assert.deepEqual([a.planda, a.uretimde], [a0.planda, a0.uretimde + 1]);
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 4 })).durum, 200);
    await ilkParcaOnay(id);
    const neden = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ('PN-D1', 'Panel duruşu', 'plansiz', 961) RETURNING id"))!.id;
    assert.equal((await terminal(`/${id}/durdur`, { durusNedeniId: neden })).durum, 200);
    a = await asama();
    assert.deepEqual([a.uretimde, a.duraklatilmis], [a0.uretimde, a0.duraklatilmis + 1], 'durmuş iş duraklatılmış sayılır');
    const suren = (await dagilim(14)).find((n) => n.neden.id === neden);
    assert.deepEqual([suren?.neden.ad, suren?.adet], ['Panel duruşu', 1], 'süren duruş şimdiye kadar sayılır');
    assert.equal((await terminal(`/${id}/devam`)).durum, 200);
    assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 4 })).durum, 200);
    assert.equal((await asama()).buHaftaBiten, a0.buHaftaBiten + 1);

    const sonra = (await gunluk()).find((g) => g.gun === gBugun);
    assert.equal(sonra?.saglam, once.saglam + 4);
    // Pencerenin dışında kalan eski sayım ve duruş: 10 gün önce, 30 dakikalık duruş.
    const hurdaNedeni = (await o().sahip.tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('PN-H1', 'Panel hurdası', 961) RETURNING id"))!.id;
    await o().sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman)
       VALUES ($1, $2, $3, 'hurda', 3, $4, false, (current_date - 10)::timestamptz + interval '9 hours')`,
      [id, yoneticiId, ist, hurdaNedeni],
    );
    await o().sahip.sorgu(
      `INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, durus_nedeni_id, zaman) VALUES
         ($1, $2, $3, 'durdur', $4, (current_date - 10)::timestamptz + interval '10 hours'),
         ($1, $2, $3, 'devam', NULL, (current_date - 10)::timestamptz + interval '10 hours 30 minutes')`,
      [id, yoneticiId, ist, neden],
    );
    const onGunOnce = (await o().vt.tek<{ g: string }>("SELECT to_char(current_date - 10, 'YYYY-MM-DD') AS g"))!.g;
    assert.equal((await gunluk(14)).find((g) => g.gun === onGunOnce)?.hurda, 3);
    assert.equal((await gunluk(10)).some((g) => g.gun === onGunOnce), false, 'pencere bugün dahil N gündür');
    const gunler = (await gunluk(14)).map((g) => g.gun);
    assert.deepEqual(gunler, [...gunler].sort(), 'günler sıralıdır');
    const uzun = (await dagilim(14)).find((n) => n.neden.id === neden);
    const kisa = (await dagilim(7)).find((n) => n.neden.id === neden);
    assert.equal(uzun?.adet, 2);
    assert.ok(uzun !== undefined && kisa !== undefined && Math.abs(uzun.dakika - kisa.dakika - 30) < 0.01, 'eski duruş 30 dakikadır ve kısa pencereye girmez');

    assert.equal((await istek('operator', 'GET', '/uretim-emirleri/gunluk-uretim')).durum, 403);
    assert.equal((await istek('operator', 'GET', '/uretim-emirleri/durus-dagilimi')).durum, 403);
    assert.equal((await istek('planlama_proje', 'GET', '/uretim-emirleri/gunluk-uretim?gun=0')).durum, 400);
    assert.equal((await istek('planlama_proje', 'GET', '/uretim-emirleri/durus-dagilimi?gun=367')).durum, 400);
  });

  test('makine kilidi: seçim yoksa iş emrinin makinesi tutulur; aynı istasyonda iki makinede iki iş, aynı makinede ikincisi 409', async () => {
    const ist = await istasyonKur();
    const m1 = await makineKur(ist);
    const m2 = await makineKur(ist);
    const { uretimEmriId: a } = await ac([adim(1, { tur: 'makine', id: m1 })]);
    const { uretimEmriId: b } = await ac([adim(1, { tur: 'makine', id: m2 })]);
    const { uretimEmriId: c } = await ac([adim(1, { tur: 'makine', id: m1 })]);
    assert.equal((await terminal(`/${a}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${b}/baslat`)).durum, 200, 'aynı istasyonda başka makinede');
    const red = await terminal(`/${c}/baslat`);
    assert.equal(red.durum, 409);
    const acik = await o().vt.sorgu<{ makine: number; emir: number }>(
      'SELECT makine_id AS makine, emir_id AS emir FROM uretim_emirleri_makine_kullanimi WHERE bitis IS NULL AND makine_id = ANY($1::int[]) ORDER BY makine_id',
      [[m1, m2]],
    );
    assert.deepEqual(acik, [{ makine: m1, emir: a }, { makine: m2, emir: b }].sort((x, y) => x.makine - y.makine));
    assert.equal((await terminal(`/${a}/duraklat`)).durum, 200);
    assert.equal((await terminal(`/${c}/baslat`)).durum, 200, 'duraklatılan iş makineyi bırakır');
  });

  test('anomali okumaları: istasyon ve kişi başına aralık adedi ve son giriş; girişi olmayan haritada yok', async () => {
    const ist = await istasyonKur();
    const bos = await istasyonKur();
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: await makineKur(ist) })]);
    const hurdaNedeni = (await o().sahip.tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('AN-H1', 'Anomali hurdası', 963) RETURNING id"))!.id;
    const yaz = (tur: 'saglam' | 'hurda', adet: number, zaman: string, duzeltme = false) => o().sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
      [id, yoneticiId, ist, tur, adet, tur === 'hurda' ? hurdaNedeni : null, duzeltme, zaman],
    );
    await yaz('saglam', 5, '2026-03-02T07:30:00+03:00');
    await yaz('saglam', 4, '2026-03-02T09:00:00+03:00');
    await yaz('saglam', -1, '2026-03-02T09:10:00+03:00', true);
    await yaz('hurda', 2, '2026-03-02T10:00:00+03:00');
    await yaz('saglam', 7, '2026-03-02T16:00:00+03:00');

    const aralik = await aralikAdetleri(o().vt, 'istasyon', [ist, bos, ist], '2026-03-02T08:00:00+03:00', '2026-03-02T16:00:00+03:00');
    assert.deepEqual([...aralik], [[ist, { saglam: 3, hurda: 2 }]], 'yarı açık aralık, düzeltme net; girişi olmayan istasyon yok');
    const kisi = await aralikAdetleri(o().vt, 'kisi', [yoneticiId], '2026-03-02T00:00:00+03:00', '2026-03-03T00:00:00+03:00');
    assert.deepEqual(kisi.get(yoneticiId), { saglam: 15, hurda: 2 });
    assert.equal((await aralikAdetleri(o().vt, 'istasyon', [], '2026-03-02T00:00:00+03:00', '2026-03-03T00:00:00+03:00')).size, 0);

    const son = await sonGirisler(o().vt, 'istasyon', [ist, bos]);
    assert.equal(son.has(bos), false, 'girişi olmayan istasyonda boş');
    assert.equal(new Date(son.get(ist)!).getTime(), new Date('2026-03-02T16:00:00+03:00').getTime());
    assert.ok((await sonGirisler(o().vt, 'kisi', [yoneticiId])).has(yoneticiId));
  });

  test('anomali okumaları: kişi başına katılım ve makine başına kullanım süresi pencereyle kırpılır; açık aralık şimdiye kadar sürer', async () => {
    const ist = await istasyonKur();
    const m1 = await makineKur(ist);
    const m2 = await makineKur(ist);
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: m1 })]);
    const katilim = (giris: string, cikis: string | null) => o().sahip.sorgu(
      `INSERT INTO uretim_emirleri_katilim (emir_id, kisi_id, istasyon_id, giris, cikis, kapanis)
       VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6)`,
      [id, yoneticiId, ist, giris, cikis, cikis === null ? null : 'duraklat'],
    );
    const kullanim = (makine: number, baslama: string, bitis: string | null) => o().sahip.sorgu(
      `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, istasyon_id, makine_id, kisi_id, baslama, bitis, kapatan_id)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7)`,
      [id, ist, makine, yoneticiId, baslama, bitis, bitis === null ? null : yoneticiId],
    );
    await katilim('2026-03-03T07:00:00+03:00', '2026-03-03T09:00:00+03:00');
    await katilim('2026-03-03T10:00:00+03:00', null);
    await kullanim(m1, '2026-03-03T08:30:00+03:00', '2026-03-03T09:00:00+03:00');
    await kullanim(m1, '2026-03-03T12:00:00+03:00', '2026-03-03T13:00:00+03:00');
    await kullanim(m2, '2026-03-03T06:00:00+03:00', '2026-03-03T07:00:00+03:00');

    const pencere = ['2026-03-03T08:00:00+03:00', '2026-03-03T11:00:00+03:00'] as const;
    const kisi = await katilimSureleri(o().vt, [yoneticiId, -1, yoneticiId], ...pencere);
    assert.deepEqual([...kisi], [[yoneticiId, 7200]], 'kırpılan kapalı aralık 1 saat, açık aralık pencere sonuna kadar 1 saat; çalışmayan kişi yok');
    const makine = await makineSureleri(o().vt, [m1, m2], ...pencere);
    assert.deepEqual([...makine], [[m1, 1800]], 'pencere dışındaki kullanım sayılmaz; kullanımı olmayan makine yok');
    assert.equal((await makineSureleri(o().vt, [], ...pencere)).size, 0);
    assert.equal((await katilimSureleri(o().vt, [yoneticiId], '2026-03-01T00:00:00+03:00', '2026-03-02T00:00:00+03:00')).size, 0);
  });

  test('anomali okumaları: makine kırılımı sayımı, zamanında emrin o makinedeki açık kullanımına yazar', async () => {
    const ist = await istasyonKur();
    const m1 = await makineKur(ist);
    const m2 = await makineKur(ist);
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: m1 })]);
    const hurdaNedeni = (await o().sahip.tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('AN-H2', 'Makine hurdası', 964) RETURNING id"))!.id;
    const kullanim = (makine: number, baslama: string, bitis: string) => o().sahip.sorgu(
      `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, istasyon_id, makine_id, kisi_id, baslama, bitis, kapatan_id)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $4)`,
      [id, ist, makine, yoneticiId, baslama, bitis],
    );
    const yaz = (tur: 'saglam' | 'hurda', adet: number, zaman: string) => o().sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7::timestamptz)`,
      [id, yoneticiId, ist, tur, adet, tur === 'hurda' ? hurdaNedeni : null, zaman],
    );
    await kullanim(m1, '2026-03-04T08:30:00+03:00', '2026-03-04T09:00:00+03:00');
    await kullanim(m1, '2026-03-04T12:00:00+03:00', '2026-03-04T13:00:00+03:00');
    await kullanim(m2, '2026-03-04T06:00:00+03:00', '2026-03-04T07:00:00+03:00');
    await yaz('saglam', 3, '2026-03-04T08:45:00+03:00');
    await yaz('saglam', 2, '2026-03-04T09:00:00+03:00');
    await yaz('saglam', 5, '2026-03-04T10:00:00+03:00');
    await yaz('hurda', 1, '2026-03-04T12:30:00+03:00');

    const adet = await aralikAdetleri(o().vt, 'makine', [m1, m2], '2026-03-04T08:00:00+03:00', '2026-03-04T13:00:00+03:00');
    assert.deepEqual([...adet], [[m1, { saglam: 10, hurda: 1 }]], 'bitişteki sayım dahil; kullanım dışı (duraklatılmış) sayım son kapanan kullanıma düşer (#26); sayımı olmayan makine yok');
    const son = await sonGirisler(o().vt, 'makine', [m1, m2]);
    assert.equal(son.has(m2), false);
    assert.equal(new Date(son.get(m1)!).getTime(), new Date('2026-03-04T12:30:00+03:00').getTime());
  });

  test('denetim #26: aynı işlem iki makinede sürerken sayım makinelere paylaşılır (toplam bir kez); duraklatılmış işte girilen sayım son makinelerine düşer', async () => {
    const ist = await istasyonKur();
    const m1 = await makineKur(ist);
    const m2 = await makineKur(ist);
    const { uretimEmriId: id, isEmriIdleri } = await ac([adim(1, { tur: 'makine', id: m1 })]);
    const op10 = isEmriIdleri[0]!;
    for (const m of [m1, m2]) {
      await o().sahip.sorgu(
        `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama, bitis, kapatan_id)
         VALUES ($1, $2, $3, $4, $5, '2026-03-06T08:00:00+03:00', '2026-03-06T10:00:00+03:00', $5)`,
        [id, op10, ist, m, yoneticiId],
      );
    }
    const yaz = (adet: number, zaman: string) => o().sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, duzeltme, zaman, is_emri_id)
       VALUES ($1, $2, $3, 'saglam', $4, $4 < 0, $5::timestamptz, $6)`,
      [id, yoneticiId, ist, adet, zaman, op10],
    );
    const ara = async (bas: string, son: string) => aralikAdetleri(o().vt, 'makine', [m1, m2], bas, son);
    const ikisi = (a: Map<number, { saglam: number }>) => [a.get(m1)?.saglam ?? 0, a.get(m2)?.saglam ?? 0];
    await yaz(5, '2026-03-06T09:00:00+03:00');
    assert.deepEqual(ikisi(await ara('2026-03-06T08:00:00+03:00', '2026-03-06T09:30:00+03:00')), [3, 2], 'artan küçük kimliğe; toplam girilen adet');
    await yaz(1, '2026-03-06T09:40:00+03:00');
    assert.deepEqual(ikisi(await ara('2026-03-06T09:30:00+03:00', '2026-03-06T10:00:00+03:00')), [1, 0]);
    await yaz(-1, '2026-03-06T09:50:00+03:00');
    assert.deepEqual(ikisi(await ara('2026-03-06T09:45:00+03:00', '2026-03-06T10:00:00+03:00')), [-1, 0], 'eksi düzeltme de aynı makineden düşer');
    await yaz(4, '2026-03-06T10:30:00+03:00');
    assert.deepEqual(ikisi(await ara('2026-03-06T10:00:00+03:00', '2026-03-06T12:00:00+03:00')), [2, 2], 'duraklatılmış işin sayımı son makinelerine');
    const gunluk = await gunlukAralikAdetleri(o().vt, 'makine', [m1, m2], ['2026-03-06T00:00:00+03:00', '2026-03-07T00:00:00+03:00']);
    assert.deepEqual(gunluk.map((g) => [...g.values()].reduce((t, a) => t + a.saglam, 0)), [9], 'gün kırılımında toplam girilen sayımların toplamıdır');
  });

  test('anomali okumaları: makine kırılımında sayım yalnız kendi iş emrinin makinesine düşer', async () => {
    const ist = await istasyonKur();
    const m1 = await makineKur(ist);
    const m2 = await makineKur(ist);
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: m1 }), adim(2, { tur: 'makine', id: m2 })]);
    const isEmri = async (sira: number) =>
      (await o().vt.tek<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 AND sira = $2', [id, sira]))!.id;
    const op10 = await isEmri(1);
    const op20 = await isEmri(2);
    const kullanim = (isEmriId: number, makine: number) => o().sahip.sorgu(
      `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama, bitis, kapatan_id)
       VALUES ($1, $2, $3, $4, $5, '2026-03-05T08:00:00+03:00', '2026-03-05T12:00:00+03:00', $5)`,
      [id, isEmriId, ist, makine, yoneticiId],
    );
    const yaz = (isEmriId: number, adet: number, zaman: string) => o().sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, duzeltme, zaman, is_emri_id)
       VALUES ($1, $2, $3, 'saglam', $4, false, $5::timestamptz, $6)`,
      [id, yoneticiId, ist, adet, zaman, isEmriId],
    );
    await kullanim(op10, m1);
    await kullanim(op20, m2);
    await yaz(op10, 4, '2026-03-05T09:00:00+03:00');
    await yaz(op20, 7, '2026-03-05T10:00:00+03:00');

    const adet = await aralikAdetleri(o().vt, 'makine', [m1, m2], '2026-03-05T08:00:00+03:00', '2026-03-05T12:00:00+03:00');
    assert.deepEqual(adet.get(m1), { saglam: 4, hurda: 0 }, 'OP20 sayımı OP10 makinesine yazılmaz');
    assert.deepEqual(adet.get(m2), { saglam: 7, hurda: 0 }, 'OP10 sayımı OP20 makinesine yazılmaz');
    const son = await sonGirisler(o().vt, 'makine', [m1, m2]);
    assert.equal(new Date(son.get(m1)!).getTime(), new Date('2026-03-05T09:00:00+03:00').getTime());
    assert.equal(new Date(son.get(m2)!).getTime(), new Date('2026-03-05T10:00:00+03:00').getTime());
  });

  test('anomali okumaları: iş emri kırılımlı sayım (önceki günler dahil) ve istasyon, makine, iş emri başına standart süre', async () => {
    const ist = await istasyonKur();
    const m1 = await makineKur(ist);
    const m2 = await makineKur(ist);
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: m1 }), adim(2, { tur: 'makine', id: m2 })]);
    const isEmri = async (sira: number) =>
      (await o().vt.tek<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 AND sira = $2', [id, sira]))!.id;
    const op10 = await isEmri(1);
    const op20 = await isEmri(2);
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET birim_sure_dk = CASE WHEN id = $1 THEN 2 ELSE NULL END WHERE id IN ($1, $2)", [op10, op20]);
    await o().sahip.sorgu(
      `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama, bitis, kapatan_id)
       VALUES ($1, $2, $4, $5, $7, '2026-03-05T08:00:00+03:00', '2026-03-06T17:00:00+03:00', $7),
              ($1, $3, $4, $6, $7, '2026-03-06T08:00:00+03:00', '2026-03-06T17:00:00+03:00', $7)`,
      [id, op10, op20, ist, m1, m2, yoneticiId],
    );
    const yaz = (isEmriId: number, tur: 'saglam' | 'hurda', adet: number, zaman: string) => o().sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman, is_emri_id)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 = 'hurda' THEN (SELECT min(id) FROM hurda_nedeni) END, false, $6::timestamptz, $7)`,
      [id, yoneticiId, ist, tur, adet, zaman, isEmriId],
    );
    await yaz(op10, 'saglam', 6, '2026-03-05T10:00:00+03:00');
    await yaz(op10, 'saglam', 4, '2026-03-06T09:00:00+03:00');
    await yaz(op10, 'hurda', 1, '2026-03-06T09:30:00+03:00');
    await yaz(op20, 'saglam', 3, '2026-03-06T11:00:00+03:00');
    const gunBasi = '2026-03-06T00:00:00+03:00';
    const gunSonu = '2026-03-07T00:00:00+03:00';

    const bugun = await aralikAdetleri(o().vt, 'is_emri', [op10, op20], gunBasi, gunSonu);
    assert.deepEqual([...bugun].sort((a, b) => a[0] - b[0]), [[op10, { saglam: 4, hurda: 1 }], [op20, { saglam: 3, hurda: 0 }]]);
    const once = await aralikAdetleri(o().vt, 'is_emri', [op10, op20], '-infinity', gunBasi);
    assert.deepEqual([...once], [[op10, { saglam: 6, hurda: 0 }]], 'kalan adet tavanı: önceki günlerin sağlamı; sayımı olmayan iş emri yok');
    assert.equal(new Date((await sonGirisler(o().vt, 'is_emri', [op10])).get(op10)!).getTime(), new Date('2026-03-06T09:30:00+03:00').getTime());

    const oku = (kirilim: 'istasyon' | 'makine' | 'is_emri', idler: number[]) =>
      o().vt.tx((db) => kirilimStandartSureleri(db, kirilim, idler, gunBasi, gunSonu));
    assert.deepEqual((await oku('istasyon', [ist])).get(ist), { standartSaniye: 480, suresizSaglam: 3 }, '4 x 2 dk; OP20 birim süresiz');
    const makine = await oku('makine', [m1, m2, m2]);
    assert.deepEqual(makine.get(m1), { standartSaniye: 480, suresizSaglam: 0 }, 'OP20 sayımı OP10 makinesine düşmez');
    assert.deepEqual(makine.get(m2), { standartSaniye: 0, suresizSaglam: 3 });
    assert.deepEqual((await oku('is_emri', [op10])).get(op10), { standartSaniye: 480, suresizSaglam: 0 }, 'dünkü 6 adet pencere dışında');
    assert.equal((await oku('makine', [])).size, 0);
  });

  test('fabrika haritası: canlı emirde çalışan iş emri ve bütün makinelerin son olayları; liste okuyamayan alamaz', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: makine }), adim(2, { tur: 'makine', id: makine })]);
    const canli = async () => {
      const c = await istek('planlama_proje', 'GET', '/uretim-emirleri?durum=basladi');
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return emirlerCevabi.parse(c.govde).emirler.find((e) => e.id === id)?.canli;
    };
    const olaylar = async (sorgu = '') => {
      const c = await istek('planlama_proje', 'GET', `/uretim-emirleri/son-olaylar${sorgu}`);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return sonOlaylarCevabi.parse(c.govde).olaylar;
    };
    const baslangic = (await olaylar('?sayi=1'))[0]?.zaman;

    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    const isEmri = (await o().vt.tek<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 AND sira = 1', [id]))!.id;
    assert.deepEqual((await canli())?.isEmri, { id: isEmri, opNo: 10, ad: 'Adım 1', makineId: makine });
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 2 })).durum, 200);
    await ilkParcaOnay(id);
    const neden = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ('HR-D1', 'Harita duruşu', 'plansiz', 962) RETURNING id"))!.id;
    assert.equal((await terminal(`/${id}/durdur`, { durusNedeniId: neden })).durum, 200);
    assert.equal((await canli())?.isEmri?.id, isEmri, 'durmuş iş emri hâlâ çalışan iş emridir');

    const tumu = await olaylar(baslangic === undefined ? '' : `?sonra=${encodeURIComponent(baslangic)}`);
    const bu = tumu.filter((x) => x.emir.id === id);
    assert.deepEqual(bu.map((x) => x.olay), ['durdur', 'kalite_onay', 'baslat'], 'yeniden eskiye; ilk parça onayı kalite kararıdır (504 a)');
    assert.deepEqual(bu[0]?.durusNedeni, { id: neden, ad: 'Harita duruşu' });
    assert.equal(bu[1]?.adet, 2);
    for (const x of bu) {
      assert.deepEqual(x.makine, { id: makine, ad: 'Tezgah' });
      assert.deepEqual(x.isEmri, { id: isEmri, opNo: 10, ad: 'Adım 1' });
      assert.equal(x.istasyon.id, ist);
    }
    assert.equal(new Set(tumu.map((x) => x.id)).size, tumu.length, 'kimlikler tekildir');
    assert.deepEqual(await olaylar(`?sonra=${encodeURIComponent(bu[0]!.zaman)}`), [], 'son olaydan sonrası boştur');
    assert.equal((await olaylar('?sayi=2')).length, 2);

    assert.equal((await terminal(`/${id}/devam`)).durum, 200);
    assert.equal((await terminal(`/${id}/bitir`, { saglamAdet: 2 })).durum, 200);
    assert.equal((await canli())?.isEmri ?? null, null, 'adımlar arasında çalışan iş emri yoktur');

    assert.equal((await istek('operator', 'GET', '/uretim-emirleri/son-olaylar')).durum, 403);
    assert.equal((await istek('planlama_proje', 'GET', '/uretim-emirleri/son-olaylar?sayi=0')).durum, 400);
    assert.equal((await istek('planlama_proje', 'GET', '/uretim-emirleri/son-olaylar?sonra=2026-10-13')).durum, 400, 'saat dilimsiz an reddedilir');
  });

  // Operatörün hurdasını kalıcı bırakır: kişinin hurda nedenlerini sayan testlerden sonra koşar.
  test('canlı hurda emrin bütün iş emirlerinin toplamıdır; sağlam terminalin iş emrinden gelir (deneme: başlıkta hurda 0)', async () => {
    const ist1 = await istasyonKur();
    const ist2 = await istasyonKur();
    const m1 = await makineKur(ist1);
    const m2 = await makineKur(ist2);
    const neden = (await o().sahip.tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('IE-H0', 'Adım hurdası', 950) RETURNING id"))!.id;
    const { uretimEmriId: id } = await ac([adim(1, { tur: 'makine', id: m1 }), adim(2, { tur: 'makine', id: m2 })], { adet: 20 });
    const canli = async () => (await istek<{ emir: Emir }>('planlama_proje', 'GET', `/uretim-emirleri/${id}`)).govde.emir.canli;
    const listede = async () => (await istek<{ emirler: Emir[] }>('planlama_proje', 'GET', '/uretim-emirleri')).govde.emirler.find((e) => e.id === id)?.canli;

    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'saglam', adet: 19 })).durum, 200);
    await ilkParcaOnay(id);
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'hurda', adet: 1, hurdaNedeniId: neden })).durum, 200);
    assert.equal((await terminal(`/${id}/bitir`, {})).durum, 200);
    assert.equal((await terminal(`/${id}/baslat`)).durum, 200);
    let c = await canli();
    assert.deepEqual(c && [c.saglam, c.hurda], [0, 1], 'ikinci adım sıfırdan sayar, birinci adımın hurdası emirde kalır');
    assert.equal((await listede())?.hurda, 1, 'liste de aynı toplamı verir');
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'hurda', adet: 1, hurdaNedeniId: neden })).durum, 200);
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'hurda', adet: -1 })).durum, 200);
    assert.equal((await terminal(`/${id}/sayim`, { tur: 'hurda', adet: -1 })).durum, 409, 'düzeltme yalnız bu adımın hurdasını geri alır');
    const son = await terminal(`/${id}/bitir`, { saglamAdet: 19 });
    assert.equal(son.govde.emir.durum, 'bitti');
    c = await canli();
    assert.deepEqual(c && [c.saglam, c.hurda], [19, 1], 'bitmiş emirde sağlam son adımın, hurda bütün adımların');
  });

  test('adımlı emir özeti: listenin gösterdiği durumla sayar (iş emri başlamış planlı emir başladı); geciken açık ve teslimi geçmiş; biten arşiv dışı (arşiv adımsızdır, listeye girmez)', async () => {
    await kisiEkle('ozet_op', 'operator');
    const kisi = { tur: 'kisi' as const, id: kim('ozet_op').id };
    await ac([adim(1, kisi)], { taslak: true });
    const { uretimEmriId: gecikmis } = await ac([adim(1, kisi)]);
    const { uretimEmriId: baslamis } = await ac([adim(1, { tur: 'makine', id: await makineKur(await istasyonKur()) }), adim(2, kisi)]);
    const { uretimEmriId: biten } = await ac([adim(1, kisi)]);
    await o().vt.tx((db) => emirBaslat(db, kim('ozet_op'), baslamis));
    await o().sahip.sorgu("UPDATE uretim_emri SET teslim = current_date - 3 WHERE id = $1", [gecikmis]);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'bitti', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [biten]);

    const acikListe = (await istek<AdimliListeCevabi>('planlama_proje', 'GET', '/adimli-emirler')).govde.emirler;
    const hepsi = (await istek<AdimliListeCevabi>('planlama_proje', 'GET', '/adimli-emirler?kapsam=hepsi')).govde.emirler;
    assert.equal(acikListe.find((e) => e.id === baslamis)?.durum, 'basladi');
    const bugun = tesisGunu(Date.now());
    const acik = acikListe.filter((e) => !e.arsiv && ['taslak', 'planli', 'basladi'].includes(e.durum));
    const say = (d: string) => acik.filter((e) => e.durum === d).length;
    const beklenen = {
      taslak: say('taslak'), planli: say('planli'), basladi: say('basladi'), acik: acik.length,
      geciken: acik.filter((e) => e.teslim !== null && e.teslim < bugun).length,
      biten: hepsi.filter((e) => !e.arsiv && e.durum === 'bitti').length,
    };
    assert.ok(beklenen.taslak > 0 && beklenen.planli > 0 && beklenen.basladi > 0 && beklenen.geciken > 0 && beklenen.biten > 0);
    const c = await istek('planlama_proje', 'GET', '/adimli-emirler/ozet');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(adimliOzetCevabi.parse(c.govde), beklenen);
    assert.equal((await istek('operator', 'GET', '/adimli-emirler/ozet')).durum, 403);
    assert.equal((await istek(null, 'GET', '/adimli-emirler/ozet')).durum, 401);
    // 288 a: planı gören (vardiya sorumlusu, plan.oku) ana sayfanın sayılarını okur; emir listesi ve ayrıntısı kapalı kalır.
    await kisiEkle('ozet_vs', 'vardiya_sorumlusu');
    assert.deepEqual(adimliOzetCevabi.parse((await istek('ozet_vs', 'GET', '/adimli-emirler/ozet')).govde), beklenen);
    assert.equal((await istek('ozet_vs', 'GET', '/adimli-emirler')).durum, 403);
    assert.equal((await istek('ozet_vs', 'GET', `/adimli-emirler/${String(baslamis)}`)).durum, 403);
  });

  test('okuma yetkisi: sayfası ya da işlemi olmayan kişi (operatör) iş emirli listeyi okuyamaz, girişsiz 401', async () => {
    assert.equal((await istek('operator', 'GET', '/adimli-emirler')).durum, 403);
    assert.equal((await istek(null, 'GET', '/adimli-emirler')).durum, 401);
    assert.equal((await istek('planlama_proje', 'GET', '/adimli-emirler?arsiv=true')).durum, 200);
  });

  // Arkon Özetim gün başına okuyordu (yük testi 2026-10-18): gün kırılımlı okuma, her aralıkta tek tek okumayla aynı cevabı verir.
  // Önceki testlerin bütün sayım ve katılım satırları üzerinde, gece yarısını aşan ve açık katılımla.
  test('gün kırılımlı sayım ve kişi işleri tek tek okumayla aynıdır; tek sorgu', async () => {
    const vt = o().vt;
    const ornek = await o().sahip.tek<{ emir_id: number; is_emri_id: number | null; kisi_id: number; istasyon_id: number }>(
      'SELECT emir_id, is_emri_id, kisi_id, istasyon_id FROM uretim_sayimi WHERE is_emri_id IS NOT NULL ORDER BY id LIMIT 1',
    );
    assert.ok(ornek, 'önceki testlerin sayımı olmalı');
    await o().sahip.sorgu(
      `INSERT INTO uretim_emirleri_katilim (emir_id, is_emri_id, kisi_id, istasyon_id, giris, cikis, kapanis)
       VALUES ($1, $2, $3, $4, '2026-03-03T23:30:00+03:00', '2026-03-04T00:30:00+03:00', 'ayril')`,
      [ornek.emir_id, ornek.is_emri_id, ornek.kisi_id, ornek.istasyon_id],
    );
    await o().sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman, is_emri_id)
       VALUES ($1, $2, $3, 'saglam', 2, NULL, false, '2026-03-04T00:00:00+03:00', $4), ($1, $2, $3, 'saglam', -1, NULL, true, '2026-03-03T23:59:59.999+03:00', $4)`,
      [ornek.emir_id, ornek.kisi_id, ornek.istasyon_id, ornek.is_emri_id],
    );
    const gun = (t: string): string => `${t}T00:00:00+03:00`;
    const bugun = Date.now();
    const sinirlar = [
      ...['2026-02-28', '2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-08'].map(gun),
      new Date(bugun - 86_400_000).toISOString(), new Date(bugun - 3_600_000).toISOString(), new Date(bugun + 3_600_000).toISOString(),
    ];
    const kimlikler = async (sutun: string, tablo = 'uretim_sayimi'): Promise<number[]> =>
      (await o().sahip.sorgu<{ id: number }>(`SELECT DISTINCT ${sutun} AS id FROM ${tablo} WHERE ${sutun} IS NOT NULL ORDER BY 1`)).map((r) => r.id);
    const kirilimlar: [SayimKirilimi, number[]][] = [
      ['istasyon', await kimlikler('istasyon_id')], ['kisi', await kimlikler('kisi_id')], ['is_emri', await kimlikler('is_emri_id')],
      ['makine', await kimlikler('makine_id', 'uretim_emirleri_makine_kullanimi')],
    ];
    await vt.tx(async (db) => {
      let sorgu = 0;
      const sayan: Db = { sorgu: (m, p) => { sorgu += 1; return db.sorgu(m, p); }, tek: (m, p) => { sorgu += 1; return db.tek(m, p); } };
      for (const [kirilim, idler] of kirilimlar) {
        assert.ok(idler.length > 0, kirilim);
        sorgu = 0;
        const toplu = await gunlukAralikAdetleri(sayan, kirilim, idler, sinirlar);
        assert.equal(sorgu, 1, kirilim);
        const tek: Map<number, unknown>[] = [];
        for (let g = 0; g + 1 < sinirlar.length; g += 1) tek.push(await aralikAdetleri(db, kirilim, idler, sinirlar[g]!, sinirlar[g + 1]!));
        assert.deepEqual(toplu, tek, kirilim);
        assert.ok(toplu.some((m) => m.size > 0), `${kirilim}: en az bir aralıkta sayım`);
      }
      for (const kisiId of await kimlikler('kisi_id', 'uretim_emirleri_katilim')) {
        sorgu = 0;
        const toplu = await kisininGunlukIsEmirleri(sayan, kisiId, sinirlar);
        assert.equal(sorgu, 1);
        const tek: unknown[] = [];
        for (let g = 0; g + 1 < sinirlar.length; g += 1) tek.push(await kisininIsEmirleri(db, kisiId, sinirlar[g]!, sinirlar[g + 1]!));
        assert.deepEqual(toplu, tek, `kişi ${kisiId}`);
      }
      const gece = (await kisininGunlukIsEmirleri(db, ornek.kisi_id, sinirlar)).slice(3, 5);
      assert.ok(gece.every((g) => g.some((i) => i.uretimEmriId === ornek.emir_id && i.saniye === 1800)), 'gece yarısını aşan katılım iki güne bölünür');
      assert.deepEqual(await gunlukAralikAdetleri(db, 'kisi', [ornek.kisi_id], sinirlar.slice(0, 1)), [], 'tek sınır aralık kurmaz');
      assert.deepEqual(await kisininGunlukIsEmirleri(db, ornek.kisi_id, []), []);
      assert.deepEqual(await gunlukAralikAdetleri(db, 'kisi', [], sinirlar), sinirlar.slice(1).map(() => new Map()));
    });
  });
});
