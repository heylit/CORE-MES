import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { HAZIRLIK_MADDELERI, hazirlikCevabi, hazirlikMaddeleriCevabi, hazirlikUyarirMi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { HazirlikMaddeleriCevabi, HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { hazirlik, hazirlikCozucusuKaydet, hazirlikDenetimi, isEmriHazirliklari } from './hazirlik.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';
import { DURDURAN_KAPANMAZ, MADDE_DEGISTI, ozelMaddeKodu } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('uretim-emirleri hazırlık maddesi kodu (3396)', () => {
  test('özel madde kodu harflidir: 1 a, 26 z, 27 aa, 702 zz', () => {
    assert.equal(ozelMaddeKodu(1), 'ozel-a');
    assert.equal(ozelMaddeKodu(26), 'ozel-z');
    assert.equal(ozelMaddeKodu(27), 'ozel-aa');
    assert.equal(ozelMaddeKodu(702), 'ozel-zz');
    assert.throws(() => ozelMaddeKodu(0));
  });
});

// 3396 a: madde listesi veride; durduran üç madde kapanmaz (Risk K1), tablo okunamasa da durduran durdurur (Risk K2).
describe('uretim-emirleri hazırlık maddeleri (3396, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let makineId = 0;
  let istasyonId = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): Kullanici => {
    const k = kullanicilar.get(ad);
    if (k === undefined) throw new Error(`kişi yok: ${ad}`);
    return k;
  };
  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  // Tek işlemli kişi: rol yerine yalnız verilen işlem (uç yetkisi işlemi arar, rol dağılımı 3396-2'de).
  async function kisiEkle(kullaniciAdi: string, rolKodu: string, ekIslem: string | null = null): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    if (ekIslem !== null) await o().sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rol.id, ekIslem]);
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
  const adim = (sira: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const emirAc = () => o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
    malzemeNo: urunNo, adet: 3, teslim: null, kaynakRotaRevizyonId: rev, projeId, isEmirleri: [adim(1)],
  }));
  const liste = async (ad = 'planlama_proje'): Promise<HazirlikMaddeleriCevabi> => {
    const c = await istek<HazirlikMaddeleriCevabi>(ad, 'GET', '/hazirlik-maddeleri');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return hazirlikMaddeleriCevabi.parse(c.govde);
  };
  const madde = async (kod: string) => {
    const m = (await liste()).maddeler.find((x) => x.kod === kod);
    if (m === undefined) throw new Error(`madde yok: ${kod}`);
    return m;
  };

  const gercekCozuculer = new Map<HazirlikMaddesi, HazirlikCozucusu | null>();
  before(async () => {
    for (const m of HAZIRLIK_MADDELERI) gercekCozuculer.set(m, hazirlikCozucusuKaydet(m, null));
    ortam = await testVeritabaniKur('uretim_hazirlik_maddeleri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.HZM', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await kisiEkle('planlama_proje', 'planlama_proje');
    await kisiEkle('ayarci', 'kalite', 'uretim-emirleri.hazirlik-ayar');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('HZM-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HZM-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('hzm-dnm-1', 'mamul', 'HZM-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'hzm-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('HZMM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('HZMI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('HZM1', 'Tezgah', $1) RETURNING id", [istasyonId]))!.id;
  });
  after(async () => {
    for (const [m, c] of gercekCozuculer) hazirlikCozucusuKaydet(m, c);
    await ortam?.kaldir();
  });

  test('tohum satırları kod listesiyle aynıdır: 12 sistem maddesi, durduran yalnız CNC, çizim, terminal (Risk K2 eşleşme)', async () => {
    const v = await liste();
    assert.deepEqual(v.maddeler.map((m) => m.kod), [...HAZIRLIK_MADDELERI]);
    assert.ok(v.maddeler.every((m) => m.sistem && m.acik));
    assert.deepEqual(v.maddeler.filter((m) => m.durduran).map((m) => m.kod), HAZIRLIK_MADDELERI.filter((m) => !hazirlikUyarirMi(m)));
    assert.equal(v.yazabilir, false, 'planlama ayar yazamaz');
    assert.equal((await liste('ayarci')).yazabilir, true);
  });

  test('yazma yalnız hazirlik-ayar işlemiyle: planlama 403, ayarcı adı ve sırayı değiştirir, sürüm tutmazsa 409', async () => {
    const m = await madde('aparat');
    const govde = { ad: 'Aparat ve fikstür', kisa: 'Aparat', sira: 15, acik: true, surum: m.surum };
    assert.equal((await istek('planlama_proje', 'POST', '/hazirlik-maddeleri/aparat/degistir', govde)).durum, 403);
    assert.equal((await istek('planlama_proje', 'POST', '/hazirlik-maddeleri/ozel-ekle', { ad: 'X', kisa: 'X', sira: 1, acik: true })).durum, 403);
    const c = await istek<HazirlikMaddeleriCevabi>('ayarci', 'POST', '/hazirlik-maddeleri/aparat/degistir', govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const v = hazirlikMaddeleriCevabi.parse(c.govde);
    assert.equal(v.maddeler.find((x) => x.kod === 'aparat')?.ad, 'Aparat ve fikstür');
    assert.equal(v.maddeler.findIndex((x) => x.kod === 'aparat'), 1, 'sıra 15 ile CNC ile çizim arasına girer');
    const eski = await istek<{ mesaj: string }>('ayarci', 'POST', '/hazirlik-maddeleri/aparat/degistir', govde);
    assert.equal(eski.durum, 409);
    assert.equal(eski.govde.mesaj, MADDE_DEGISTI);
  });

  test('durduran madde kapatılamaz: uç 400, doğrudan UPDATE kısıta, DELETE tetikleyiciye takılır (Risk K1)', async () => {
    for (const kod of ['cnc', 'cizim', 'yayin']) {
      const m = await madde(kod);
      const c = await istek<{ mesaj: string }>('ayarci', 'POST', `/hazirlik-maddeleri/${kod}/degistir`, { ad: m.ad, kisa: m.kisa, sira: m.sira, acik: false, surum: m.surum });
      assert.equal(c.durum, 400, kod);
      assert.equal(c.govde.mesaj, DURDURAN_KAPANMAZ);
      await assert.rejects(o().sahip.sorgu('UPDATE uretim_emirleri_hazirlik_maddesi SET acik = false WHERE kod = $1', [kod]), /durduran_kilit/);
      await assert.rejects(o().sahip.sorgu('UPDATE uretim_emirleri_hazirlik_maddesi SET durduran = false WHERE kod = $1', [kod]), /hazirlik_maddesi_durduran/);
    }
    await assert.rejects(o().sahip.sorgu("UPDATE uretim_emirleri_hazirlik_maddesi SET durduran = true WHERE kod = 'malzeme'"), /hazirlik_maddesi_durduran/);
    await assert.rejects(o().sahip.sorgu("DELETE FROM uretim_emirleri_hazirlik_maddesi WHERE kod = 'rota'"), /silinmez/);
  });

  test('kapalı uyaran madde emirde gerekmez olur; durduran madde tablo ne derse desin başlatmayı durdurur', async () => {
    const { uretimEmriId: id, isEmriIdleri: [ie1 = 0] } = await emirAc();
    const eksik: HazirlikCozucusu = async (_db, idler) => new Map(idler.map((x) => [x, { durum: 'yok', secildi: true } as const]));
    const onceki = (['malzeme', 'cnc'] as const).map((m) => [m, hazirlikCozucusuKaydet(m, eksik)] as const);
    try {
      const m = await madde('malzeme');
      assert.equal((await istek('ayarci', 'POST', '/hazirlik-maddeleri/malzeme/degistir', { ad: m.ad, kisa: m.kisa, sira: m.sira, acik: false, surum: m.surum })).durum, 200);
      const v = hazirlikCevabi.parse(await o().vt.okumaTx((db) => hazirlik(db, id)));
      assert.equal(v.maddeler.find((x) => x.madde === 'malzeme')?.durum, 'gerekmez');
      assert.equal(v.isEmirleri[0]?.maddeler.find((x) => x.madde === 'malzeme')?.durum, 'gerekmez');
      assert.equal((await o().vt.okumaTx((db) => isEmriHazirliklari(db, id, [ie1]))).get(ie1)?.get('malzeme')?.hal, 'gerekmez');
      assert.equal(v.maddeler.find((x) => x.madde === 'cnc')?.durum, 'eksik');

      // Kısıtı aşan bozuk satır (doğrudan yazılmış) bile durduranı kapatmaz: kural koddaki listeye bakar.
      await o().sahip.sorgu('ALTER TABLE uretim_emirleri_hazirlik_maddesi DROP CONSTRAINT uretim_emirleri_hazirlik_maddesi_durduran_kilit');
      try {
        await o().sahip.sorgu("UPDATE uretim_emirleri_hazirlik_maddesi SET acik = false WHERE kod = 'cnc'");
        const olay = { uretimEmriId: id, isEmriId: ie1, istasyonId, kisiId: yoneticiId };
        assert.match(String(await o().vt.okumaTx((db) => hazirlikDenetimi(db, olay))), /CNC kurulumu/);
      } finally {
        await o().sahip.sorgu("UPDATE uretim_emirleri_hazirlik_maddesi SET acik = true WHERE kod = 'cnc'");
        await o().sahip.sorgu('ALTER TABLE uretim_emirleri_hazirlik_maddesi ADD CONSTRAINT uretim_emirleri_hazirlik_maddesi_durduran_kilit CHECK (NOT durduran OR acik)');
      }
    } finally {
      for (const [k, c] of onceki) hazirlikCozucusuKaydet(k, c);
    }
  });

  test('özel madde eklenir: kod ozel-<harf>, sistem değil, durduran değil, iş emri başına', async () => {
    const c = await istek<HazirlikMaddeleriCevabi>('ayarci', 'POST', '/hazirlik-maddeleri/ozel-ekle', { ad: 'Boya onayı', kisa: 'Boya', sira: 130, acik: true });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const ozel = hazirlikMaddeleriCevabi.parse(c.govde).maddeler.filter((m) => !m.sistem);
    assert.equal(ozel.length, 1);
    assert.match(ozel[0]?.kod ?? '', /^ozel-[a-z]+$/);
    assert.deepEqual([ozel[0]?.durduran, ozel[0]?.isEmriDuzeyi], [false, true]);
    assert.equal((await istek('ayarci', 'POST', '/hazirlik-maddeleri/ozel-ekle', { ad: ' ', kisa: 'B', sira: 1, acik: true })).durum, 400);
    assert.equal((await istek('ayarci', 'POST', '/hazirlik-maddeleri/yok-madde/degistir', { ad: 'A', kisa: 'A', sira: 1, acik: true, surum: 1 })).durum, 400);
    await assert.rejects(o().sahip.sorgu("INSERT INTO uretim_emirleri_hazirlik_maddesi (kod, ad, kisa, sira) VALUES ('ozel-1', 'X', 'X', 1)"), /ozel_kod/);
  });
});
