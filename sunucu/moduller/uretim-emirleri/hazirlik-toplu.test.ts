import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { hazirlikOzetiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { hazirlik, hazirlikCozucusuKaydet, hazirliklar, muafiyetVer } from './hazirlik.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';
import type { HazirlikBilgisi } from './kurallar.ts';

// 2227: Üretim Hazırlık listesi birçok emrin hazırlığını tek okumada alır. Cevap emir başına tek emir okumasıyla aynıdır;
// çözücü emir sayısı kadar değil bir kez sorulur. Yetki tek emir okumasıyla aynıdır: emri gören okur, görmeyen okuyamaz.
// Kişi, parça ve emir verisi uydurmadır.
describe('uretim-emirleri toplu hazırlık (2227, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let revId = 0;
  let makineId = 0;
  const PAROLA = 'dogru-parola-1';
  const kisiler = new Map<string, Kullanici>();
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): Kullanici => {
    const k = kisiler.get(ad);
    if (k === undefined) throw new Error(`kişi yok: ${ad}`);
    return k;
  };
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
    kisiler.set(kullaniciAdi, k);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
  }
  const oku = async (ad: string, yol: string) => {
    const c = await app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const adim = (sira: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const emirAc = async (adimSayisi: number) => o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
    malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revId, projeId, isEmirleri: Array.from({ length: adimSayisi }, (_, i) => adim(i + 1)),
  }));

  before(async () => {
    ortam = await testVeritabaniKur('uretim_hazirlik_toplu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.HZT', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await kisiEkle('planlama_proje', 'planlama_proje');
    await kisiEkle('mudur', 'mudur');
    await kisiEkle('cam', 'cam');
    await kisiEkle('operator', 'operator');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('HZT-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HZT-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('hzt-dnm-1', 'mamul', 'HZT-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'hzt-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    revId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('HZTM', 'Deneme Merkezi') RETURNING id");
    const istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('HZTI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('HZT1', 'Tezgah', $1) RETURNING id", [istasyonId]))!.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('toplu cevap emir başına tek okumayla aynıdır; çözücü bir kez sorulur; bilinmeyen emir cevapta yoktur', async () => {
    const a = await emirAc(2);
    const b = await emirAc(1);
    const [a1, a2] = a.isEmriIdleri;
    const cnc = new Map<number, HazirlikBilgisi>([[a1!, { durum: 'tamam', secildi: true }], [a2!, { durum: 'yok', secildi: true }]]);
    const cagrilar: Record<string, number> = {};
    const cozucu = (m: HazirlikMaddesi): HazirlikCozucusu => async (_db, idler) => {
      cagrilar[m] = (cagrilar[m] ?? 0) + 1;
      return m === 'cnc' ? new Map(idler.flatMap((x) => (cnc.has(x) ? [[x, cnc.get(x)!] as const] : [])))
        : new Map(idler.map((x) => [x, { durum: x === b.uretimEmriId ? 'suruyor' : 'tamam', secildi: true } as const]));
    };
    const onceki = (['cnc', 'cizim'] as const).map((m) => [m, hazirlikCozucusuKaydet(m, cozucu(m))] as const);
    try {
      await o().vt.tx((db) => muafiyetVer(db, kim('mudur'), a.uretimEmriId, { madde: 'cnc', isEmriId: a2!, gerekce: 'Program elde denendi' }));
      const tekA = await o().vt.okumaTx((db) => hazirlik(db, a.uretimEmriId));
      const tekB = await o().vt.okumaTx((db) => hazirlik(db, b.uretimEmriId));
      for (const k of Object.keys(cagrilar)) delete cagrilar[k];
      const toplu = await o().vt.okumaTx((db) => hazirliklar(db, [b.uretimEmriId, a.uretimEmriId, a.uretimEmriId, 2147480000]));
      assert.deepEqual(cagrilar, { cnc: 1, cizim: 1 }, 'çözücü emir sayısı kadar değil bir kez sorulur');
      assert.deepEqual([...toplu.keys()].sort((x, y) => x - y), [a.uretimEmriId, b.uretimEmriId].sort((x, y) => x - y), 'bilinmeyen emir yok; tekrar eden tek');
      assert.deepEqual(toplu.get(a.uretimEmriId), tekA);
      assert.deepEqual(toplu.get(b.uretimEmriId), tekB);
      assert.deepEqual(tekA.isEmirleri.map((s) => s.maddeler.find((m) => m.madde === 'cnc')?.durum), ['tamam', 'muaf'], 'muafiyet yalnız kendi emrinin satırında');
      assert.equal(tekB.maddeler.find((m) => m.madde === 'cizim')?.durum, 'eksik');
      assert.equal(tekA.maddeler.find((m) => m.madde === 'cizim')?.durum, 'tamam', 'öteki emrin eksiği bu emre geçmez');
    } finally {
      for (const [m, c] of onceki) hazirlikCozucusuKaydet(m, c);
    }
  });

  test('emri gören (CAM) okur, görmeyen (operatör) okuyamaz; yetki tek emir okumasıyla aynı; sorgu sınırı', async () => {
    const e = await emirAc(1);
    const izinli = await oku('cam', `/adimli-emirler/hazirlik-ozeti?emirler=${String(e.uretimEmriId)}`);
    assert.equal(izinli.durum, 200, JSON.stringify(izinli.govde));
    assert.deepEqual(hazirlikOzetiCevabi.parse(izinli.govde).emirler.map((x) => x.emirId), [e.uretimEmriId]);
    const red = await oku('operator', `/adimli-emirler/hazirlik-ozeti?emirler=${String(e.uretimEmriId)}`);
    assert.equal(red.durum, 403, JSON.stringify(red.govde));
    assert.equal((await oku('operator', `/adimli-emirler/${String(e.uretimEmriId)}/hazirlik`)).durum, 403, 'tek emir okumasında da aynı');
    const cok = Array.from({ length: 101 }, (_, i) => String(i + 1)).join(',');
    assert.equal((await oku('cam', `/adimli-emirler/hazirlik-ozeti?emirler=${cok}`)).durum, 400, 'en çok 100 emir');
    assert.equal((await oku('cam', '/adimli-emirler/hazirlik-ozeti?emirler=1,x')).durum, 400);
  });
});
