import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { aramaSade, basDeseni, icindeDeseni, type KayitTuru } from '#paylasilan/kayit-aramasi.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { KAYIT_ARAMA_EN_COK_SONUC, kayitYoluMu, type KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import { hataliCevabi, type HataliKaydiOzeti } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { kayitAramaKaynaklari } from './disari.ts';
import { hataliAramaSonuclari, kayitYoluParcasi, ncrAramaSonucu } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

const hataliKaydi = (id: number, emirNo: string, parcaNo: string, parcaAd: string): HataliKaydiOzeti => ({
  id, uretimEmri: { id, emirNo, parcaNo, parcaAd }, isEmri: { id: id + 100, opNo: 20, ad: 'Frezeleme' }, hedefEmir: { id, emirNo },
  kaliteIsEmriId: id + 200, reworkIsEmriId: null, hurdaNedeni: { id: 1, kod: 'TK', ad: 'Takım kırılması' }, adet: 2, aciklama: null,
  kisi: { id: 1, ad: null }, zaman: '2026-10-29T08:00:00.000Z', karar: null, kararKisi: null, kararZamani: null, kararNotu: null, ncrKimlik: null,
});

describe('Kalite Merkezi Ctrl K arama kuralları (1238)', () => {
  test('KM-A1 kayıt yolu: kimlikteki : @ + | kodlanır, yol kabuğun adres denetiminden geçer', () => {
    assert.equal(kayitYoluParcasi('a:b@c+d|e~f.g_h-i'), 'a%3Ab%40c%2Bd%7Ce~f.g_h-i');
    assert.equal(kayitYoluParcasi('ç'), '%C3%A7');
    const s = ncrAramaSonucu({ kimlik: 'n:1|2', no: null, parcaNo: null, parcaAdi: null, durum: null, arsiv: false });
    assert.ok(kayitYoluMu(s.yol), s.yol);
    assert.deepEqual([s.baslik, s.aciklama], ['n:1|2', null]);
  });

  test('KM-A2 NCR sonucu: numara başlıkta, parça, durum ve arşiv açıklamada; kaydı Uygunsuzluklar görünümünde açar', () => {
    const s = ncrAramaSonucu({ kimlik: 'ncr-1', no: ' NCR-26-0007 ', parcaNo: 'P-10', parcaAdi: 'Flanş', durum: 'Açık', arsiv: true });
    assert.deepEqual(s, {
      anahtar: 'ncr-1', baslik: 'NCR-26-0007', aciklama: 'P-10 Flanş · Açık · Arşivde', yol: '/kalite-merkezi/uygunsuzluklar?ac=ncr-1',
    });
  });

  test('KM-A3 hatalı parça: emir no, parça no ya da adda geçen metin bulunur (Türkçe harf duyarsız); emir no tam, sonra baştan tutan önce; sınır uygulanır', () => {
    const kayitlar = [hataliKaydi(1, 'XUE-100', 'P-1', 'Mil'), hataliKaydi(2, 'UE-1001', 'P-2', 'Işık tutucu'), hataliKaydi(3, 'UE-100', 'P-3', 'Gövde')];
    assert.deepEqual(hataliAramaSonuclari(kayitlar, 'ue-100', 5).map((s) => s.anahtar), ['3', '2', '1']);
    assert.deepEqual(hataliAramaSonuclari(kayitlar, 'ışık', 5).map((s) => s.anahtar), ['2']);
    assert.deepEqual(hataliAramaSonuclari(kayitlar, 'IŞIK', 5).map((s) => s.anahtar), ['2'], 'Türkçe büyük harf eşleşir');
    assert.deepEqual(hataliAramaSonuclari(kayitlar, 'gövde', 5)[0], {
      anahtar: '3', baslik: 'UE-100', aciklama: 'OP20 · P-3 Gövde · 2 adet · Takım kırılması · Karar bekliyor', yol: '/kalite-merkezi',
    });
    assert.equal(hataliAramaSonuclari(kayitlar, 'UE', 1).length, 1);
    assert.deepEqual(hataliAramaSonuclari(kayitlar, 'yok', 5), []);
  });
});

describe('Kalite Merkezi Ctrl K arama kaynakları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let operator: Kullanici;
  let planlama: Kullanici;
  let kaliteci: Kullanici;
  let okuyucu: Kullanici;
  let karar: Kullanici;
  let tipId = 0;
  let urunNo = 0;
  let revizyonId = 0;
  let projeId = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function giris(kullaniciAdi: string): Promise<void> {
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    cerezler.set(kullaniciAdi, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }

  // Yalnız verilen rolü taşıyan kişi (yeni kişinin varsayılan rolleri alınır).
  async function kisi(kullaniciAdi: string, rolId: number): Promise<Kullanici> {
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kayit = await rolAta(db, yoneticiId, yeni, rolId);
      for (const r of kayit.roller) if (r.id !== rolId) await rolAl(db, yoneticiId, yeni, r.id);
      return kullaniciYukle(db, yeni);
    });
    await giris(kullaniciAdi);
    return k!;
  }
  const rol = async (kod: string): Promise<number> => (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function islemliRol(kod: string, islemler: readonly string[]): Promise<number> {
    const r = await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    for (const islem of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [r!.id, islem]);
    return r!.id;
  }

  // Çekirdeğin genel arama ucu kaynağı yalnız kişide `yetki` işlemlerinden biri varsa çağırır; burada aynı kapı uygulanır.
  const kaynak = (tur: KayitTuru) => kayitAramaKaynaklari.find((k) => k.tur === tur)!;
  async function bulunan(k: Kullanici, tur: KayitTuru, q: string, sinir = KAYIT_ARAMA_EN_COK_SONUC): Promise<KayitAramaSonucu[] | null> {
    const kk = kaynak(tur);
    if (!kk.yetki.some((i) => k.islemler.includes(i))) return null;
    const sonuclar = await o().vt.tx((db) => kk.ara(db, { q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: k }));
    for (const s of sonuclar) assert.ok(kayitYoluMu(s.yol), s.yol);
    return [...sonuclar];
  }
  const ncrYaz = (kimlik: string, govde: Record<string, unknown>) => o().vt.tx((db) => sorgular.yaz(db, 'ncr', kimlik, govde, yoneticiId));

  async function hataliEmir(): Promise<{ emirNo: string; kayitId: number }> {
    const im = await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('KMA', 'Deneme Merkezi') RETURNING id");
    const ist = await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('KMAI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]);
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('KMAM', 'Tezgah', $1) RETURNING id", [ist?.id]);
    const { uretimEmriId } = await o().vt.tx((db) => uretimEmriAc(db, planlama, {
      projeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyonId,
      isEmirleri: [1, 2].map((sira) => ({
        sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine' as const, id: m!.id }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      })),
    }));
    await o().vt.tx((db) => emirBaslat(db, operator, uretimEmriId));
    const r = await app.inject({
      method: 'POST', url: `/api/uretim-emirleri/${uretimEmriId}/hatali`,
      headers: { cookie: cerezler.get('operator') ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
      payload: { hurdaNedeniKodu: 'KMA-TK', adet: 1, aciklama: 'uç kırıldı' },
    });
    assert.equal(r.statusCode, 200, r.body);
    const emir = await o().vt.tek<{ emirNo: string }>('SELECT emir_no AS "emirNo" FROM uretim_emri WHERE id = $1', [uretimEmriId]);
    return { emirNo: emir!.emirNo, kayitId: hataliCevabi.parse(r.json()).kayitId };
  }

  before(async () => {
    ortam = await testVeritabaniKur('km_arama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('KALITE.AR', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    operator = await kisi('operator', await rol('operator'));
    planlama = await kisi('planlama', await rol('planlama_proje'));
    kaliteci = await kisi('kaliteci', await rol('kalite'));
    okuyucu = await kisi('okuyucu', await islemliRol('test_km_okuyucu', ['kalite-merkezi.oku']));
    karar = await kisi('karar', await islemliRol('test_km_karar', ['kalite-merkezi.onayla']));
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KMA-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('KMA-TK', 'Deneme takım kırılması', 900)");
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KMA-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kma-dnm-1', 'mamul', 'KMA-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kma-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId],
    ))!.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('KM-A5 NCR: no, parça, lot ya da emirde geçen metinle bulunur; no tam, sonra baştan tutan önce; silinmiş yok; % ve _ joker değil', async () => {
    await ncrYaz('ncr-a1', { no: 'NCR-26-0010', parcaNo: 'DNM-77', parcaAdi: 'Deneme flanş', lot: 'LOT-A', emir: '', durum: 'Açık' });
    await ncrYaz('ncr-a2', { no: 'NCR-26-001', parcaNo: 'DNM-78', parcaAdi: 'Deneme mil', lot: '', emir: 'UE-DNM-5', durum: 'Kapalı', arsiv: true });
    await ncrYaz('ncr-a3', { no: 'X-NCR-26-001', parcaNo: 'DNM-79', parcaAdi: '%_ işaretli', lot: '', emir: '', durum: 'Açık' });
    const surum = await ncrYaz('ncr-sil', { no: 'NCR-26-0011', parcaNo: 'DNM-80' });
    await o().vt.tx((db) => sorgular.sil(db, 'ncr', 'ncr-sil', yoneticiId, surum));

    const no = await bulunan(kaliteci, 'ncr', 'ncr-26-001');
    assert.deepEqual(no?.map((s) => s.anahtar), ['ncr-a2', 'ncr-a1', 'ncr-a3']);
    assert.deepEqual(no?.[0], {
      anahtar: 'ncr-a2', baslik: 'NCR-26-001', aciklama: 'DNM-78 Deneme mil · Kapalı · Arşivde', yol: '/kalite-merkezi/uygunsuzluklar?ac=ncr-a2',
    });
    assert.deepEqual((await bulunan(kaliteci, 'ncr', 'lot-a'))?.map((s) => s.anahtar), ['ncr-a1']);
    assert.deepEqual((await bulunan(kaliteci, 'ncr', 'DENEME FLANŞ'))?.map((s) => s.anahtar), ['ncr-a1'], 'Türkçe büyük harf eşleşir');
    assert.deepEqual((await bulunan(kaliteci, 'ncr', 'İŞARETLİ'))?.map((s) => s.anahtar), ['ncr-a3'], 'İ ve i eşleşir');
    assert.deepEqual((await bulunan(kaliteci, 'ncr', 'ue-dnm'))?.map((s) => s.anahtar), ['ncr-a2']);
    assert.deepEqual(await bulunan(kaliteci, 'ncr', 'DNM-80'), [], 'silinmiş NCR bulunmaz');
    assert.deepEqual((await bulunan(kaliteci, 'ncr', '%_'))?.map((s) => s.anahtar), ['ncr-a3'], 'joker karakter düz metin');
    assert.equal((await bulunan(kaliteci, 'ncr', 'NCR-26', 2))?.length, 2, 'sınır uygulanır');
  });

  test('KM-A5 NCR araması kısmi trigram indeksini kullanır (sorgu ifadesi göçteki ifadeyle aynı)', async () => {
    // Küçük tabloda tam tarama ucuzdur; yeterli satır ve istatistikle trigram indeksini seçtiği denenir, satırlar geri alınır.
    let plan: { 'QUERY PLAN': string }[] = [];
    await assert.rejects(o().sahip.tx(async (db) => {
      await db.sorgu(
        `INSERT INTO kalite_merkezi_belge (koleksiyon, kimlik, govde, degistiren_id)
         SELECT 'ncr', 'plan-' || i, jsonb_build_object('no', 'PLN-' || i, 'parcaAdi', md5(i::text)), $1 FROM generate_series(1, 3000) i`,
        [yoneticiId],
      );
      // GIN bekleyen listesi (fastupdate) dolu kalırsa planlayıcı indeksi pahalı sayar; canlıda autovacuum boşaltır.
      await db.sorgu("SELECT gin_clean_pending_list('kalite_merkezi_belge_ncr_arama_trgm')");
      await db.sorgu('ANALYZE kalite_merkezi_belge');
      plan = await db.sorgu<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT kimlik FROM kalite_merkezi_belge WHERE koleksiyon = 'ncr' AND govde IS NOT NULL AND ${sorgular.NCR_ARAMA_METNI} LIKE '%flans%'`,
      );
      throw new Error('geri al');
    }), /geri al/);
    assert.match(plan.map((s) => s['QUERY PLAN']).join('\n'), /kalite_merkezi_belge_ncr_arama_trgm/);
  });

  test('KM-A6 yetki: NCR kaynağı okuma, hatalı parça kaynağı karar yetkisi ister; ikisi de yoksa hiçbiri çağrılmaz; kararlı kayıt bulunmaz', async () => {
    assert.deepEqual(kaynak('ncr').yetki, ['kalite-merkezi.oku']);
    assert.deepEqual(kaynak('hatali').yetki, ['kalite-merkezi.onayla']);
    const { emirNo, kayitId } = await hataliEmir();
    await ncrYaz('ncr-h1', { no: 'NCR-26-0500', parcaNo: '', parcaAdi: '', lot: '', emir: emirNo, durum: 'Açık' });

    const hatali = await bulunan(kaliteci, 'hatali', emirNo);
    assert.deepEqual(hatali?.map((s) => [s.anahtar, s.baslik, s.yol]), [[String(kayitId), emirNo, '/kalite-merkezi']]);
    assert.deepEqual((await bulunan(kaliteci, 'ncr', emirNo))?.map((s) => s.anahtar), ['ncr-h1']);
    assert.deepEqual((await bulunan(okuyucu, 'ncr', emirNo))?.map((s) => s.anahtar), ['ncr-h1']);
    assert.equal(await bulunan(okuyucu, 'hatali', emirNo), null, 'okuma yetkisi hatalı parçayı görmez');
    assert.deepEqual((await bulunan(karar, 'hatali', emirNo))?.map((s) => s.anahtar), [String(kayitId)]);
    assert.equal(await bulunan(karar, 'ncr', emirNo), null, 'yalnız karar yetkisi NCR görmez');
    assert.equal(await bulunan(operator, 'ncr', emirNo), null);
    assert.equal(await bulunan(operator, 'hatali', emirNo), null);

    const r = await app.inject({
      method: 'POST', url: `/api/kalite-merkezi/hatali/${kayitId}/karar`,
      headers: { cookie: cerezler.get('kaliteci') ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
      payload: { karar: 'hurda', ncrKimlik: 'ncr-h2', ncrNo: 'NCR-26-0501', ciddiyet: 'Minör' },
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(await bulunan(kaliteci, 'hatali', emirNo), [], 'karar verilmiş kayıt bekleyen değildir');
  });
});
