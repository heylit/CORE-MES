import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { kmGirisBekleyenCevabi, kmGirisCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { KmGirisKaydi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { malKabulCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { GIRIS_NCR_KAYNAGI } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

// 1246 (1247 d, 1251 a, 1252, 1253 a): kartı GKK isteyen satın alma lotu karantinaya karar bekliyor girer; GKK kabul ve hatalı verir,
// hatalının kalite kararı NCR açar ve kabul, şartlı kabul ya da tedarikçiye iade yazar. Her kural için izinli ve reddedilen durum.
describe('Kalite Merkezi giriş kontrolü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sira = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function giris(kullaniciAdi: string): Promise<void> {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerezler.set(kullaniciAdi, String(r.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function kisi(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
    });
    await giris(kullaniciAdi);
  }

  const istek = (ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) => app.inject({
    method: yontem, url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
    ...(govde === undefined ? {} : { payload: govde as object }),
  });

  async function kart(tur: 'hammadde' | 'sarf', gkk: boolean | null = null): Promise<number> {
    sira += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, gkk_gerekli)
       VALUES ($1, $2, 'GKK-DNM-', $3, 'aktif', $4, $5, $5, $6) RETURNING no`,
      [`gkk-dnm-${sira}`, tur, sira, JSON.stringify({ id: `gkk-dnm-${sira}`, com: { ad: `Deneme ${tur} ${sira}` } }), yoneticiId, gkk],
    ))!.no;
  }

  async function siparisSatiri(miktar: string): Promise<number> {
    sira += 1;
    const [t, kl, tk] = [randomUUID(), randomUUID(), randomUUID()];
    const s = o().sahip;
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi')",
      [t, 80000 + sira, yoneticiId]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad) VALUES ($1, $2, 1, 'Deneme kalem')", [t, kl]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, tedarikci_adi) VALUES ($1, $2, 'TRY', current_date, 'Deneme Tedarikçi')", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    return (await s.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, $4, 'adet') RETURNING id",
      [t, tk, kl, miktar]))!.id;
  }

  const malKabul = async (malzemeId: number, miktar: string) =>
    istek('yonetici', 'POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId, miktar, siparisSatirId: await siparisSatiri(miktar) }] });

  async function kabulEt(malzemeId: number, miktar: string): Promise<KmGirisKaydi> {
    const r = await malKabul(malzemeId, miktar);
    assert.equal(r.statusCode, 200, r.body);
    const no = malKabulCevabi.parse(r.json()).belge.no;
    const k = (await bekleyenler()).find((x) => x.malKabulNo === no);
    assert.ok(k, 'GKK satırı bekleyenlerde');
    return k;
  }

  const bekleyenler = async (): Promise<KmGirisKaydi[]> => {
    const r = await istek('kaliteci', 'GET', '/kalite-merkezi/giris/bekleyenler');
    assert.equal(r.statusCode, 200, r.body);
    return kmGirisBekleyenCevabi.parse(r.json()).kayitlar;
  };

  // Partinin bakiyesi konum türü ve kalite durumuna göre: 'karantina:red' -> '3.000'.
  const bakiye = async (partiId: number): Promise<Record<string, string>> => Object.fromEntries((await o().sahip.sorgu<{ a: string; m: string }>(
    `SELECT k.tur || ':' || b.kalite_durumu AS a, sum(b.miktar)::text AS m FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
      WHERE b.parti_id = $1 AND b.miktar <> 0 GROUP BY 1 ORDER BY 1`, [partiId])).map((r) => [r.a, r.m]));

  before(async () => {
    ortam = await testVeritabaniKur('km_giris_kontrolu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    await kisi('kaliteci', 'kalite');
    await kisi('operator', 'operator');
    await kisi('planlama', 'planlama_proje');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('GKK-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kabul: GKK kartı karantina konumu yoksa girmez; varsa karar bekliyor girer, GKK\'sız kart ve sarf serbest girer', async () => {
    await o().sahip.sorgu("UPDATE stok_konum SET aktif = false WHERE tur = 'karantina'");
    const ham = await kart('hammadde');
    const yok = await malKabul(ham, '5');
    assert.equal(yok.statusCode, 400, yok.body);
    assert.match(yok.json().mesaj, /Karantina konumu yok/);
    await o().sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, 'KRN-GKK', 'karantina' FROM stok_depo WHERE kod = 'ANA'");

    const k = await kabulEt(ham, '5');
    assert.deepEqual([k.durum, k.miktar, k.tedarikciAdi, k.kabulMiktar], ['gkk_bekliyor', '5', 'Deneme Tedarikçi', null]);
    assert.deepEqual(await bakiye(k.partiId), { 'karantina:karar_bekliyor': '5.000' });

    for (const [m, gkk] of [[await kart('hammadde', false), false], [await kart('sarf'), null]] as const) {
      const r = await malKabul(m, '2');
      assert.equal(r.statusCode, 200, `${gkk}: ${r.body}`);
      const no = malKabulCevabi.parse(r.json()).belge.no;
      assert.ok(!(await bekleyenler()).some((x) => x.malKabulNo === no));
      const kalite = await o().sahip.tek<{ k: string; t: string }>(
        `SELECT b.kalite_durumu AS k, s.tur AS t FROM stok_mal_kabul_satiri ms JOIN stok_mal_kabul mk ON mk.id = ms.mal_kabul_id
           JOIN stok_bakiye b ON b.malzeme_id = ms.malzeme_id JOIN stok_konum s ON s.id = b.konum_id WHERE mk.no = $1`, [no]);
      assert.deepEqual([kalite?.k, kalite?.t], ['serbest', 'kabul']);
    }
  });

  test('GKK: kabul ve hatalı toplamı bekleyene eşittir; yetkisiz 403; kabul mal kabul alanına serbest, hatalı karantinada red; ikinci kez 409', async () => {
    const k = await kabulEt(await kart('hammadde'), '10');
    const yol = `/kalite-merkezi/giris/${k.malKabulSatirId}/gkk`;
    assert.equal((await istek('operator', 'POST', yol, { kabul: '7', hatali: '3' })).statusCode, 403);
    const eksik = await istek('kaliteci', 'POST', yol, { kabul: '5', hatali: '4' });
    assert.equal(eksik.statusCode, 400, eksik.body);
    assert.match(eksik.json().mesaj, /bekleyen miktara eşit/);
    assert.equal((await istek('kaliteci', 'POST', yol, { kabul: '0', hatali: '0' })).statusCode, 400);
    assert.deepEqual(await bakiye(k.partiId), { 'karantina:karar_bekliyor': '10.000' });

    const r = await istek('kaliteci', 'POST', yol, { kabul: '7', hatali: '3', not: 'yüzey çizik' });
    assert.equal(r.statusCode, 200, r.body);
    const c = kmGirisCevabi.parse(r.json()).kayit;
    assert.deepEqual([c.durum, c.kabulMiktar, c.hataliMiktar, c.gkkKisiAd], ['karar_bekliyor', '7.000', '3.000', 'Deneme kaliteci']);
    assert.deepEqual(await bakiye(k.partiId), { 'kabul:serbest': '7.000', 'karantina:red': '3.000' });
    assert.equal((await istek('kaliteci', 'POST', yol, { kabul: '0', hatali: '3' })).statusCode, 409);
    assert.ok((await bekleyenler()).some((x) => x.malKabulSatirId === k.malKabulSatirId && x.durum === 'karar_bekliyor'));
  });

  test('karar: GKK\'sız ya da hatalısız satırda 409; şartlı kabul şart ister; red NCR açar ve tedarikçiye iade çıkışı yazar', async () => {
    const k = await kabulEt(await kart('hammadde'), '4');
    const karar = (id: number, g: object) => istek('kaliteci', 'POST', `/kalite-merkezi/giris/${id}/karar`, { ncrKimlik: `ncr-gkk-${id}`, ncrNo: `NCR-GKK-${id}`, ciddiyet: 'Majör', ...g });
    assert.equal((await karar(k.malKabulSatirId, { karar: 'red' })).statusCode, 409, 'GKK verilmeden');

    const temiz = await kabulEt(await kart('hammadde'), '2');
    assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${temiz.malKabulSatirId}/gkk`, { kabul: '2', hatali: '0' })).statusCode, 200);
    assert.equal((await karar(temiz.malKabulSatirId, { karar: 'kabul' })).statusCode, 409, 'hatalısız');
    assert.ok(!(await bekleyenler()).some((x) => x.malKabulSatirId === temiz.malKabulSatirId), 'hatalısız GKK kapanır');

    assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${k.malKabulSatirId}/gkk`, { kabul: '1', hatali: '3' })).statusCode, 200);
    const sartsiz = await karar(k.malKabulSatirId, { karar: 'sartli_kabul' });
    assert.equal(sartsiz.statusCode, 400, sartsiz.body);
    assert.equal(sartsiz.json().alan, 'not');

    const r = await karar(k.malKabulSatirId, { karar: 'red', not: 'ölçü dışı' });
    assert.equal(r.statusCode, 200, r.body);
    const c = kmGirisCevabi.parse(r.json()).kayit;
    assert.deepEqual([c.durum, c.karar, c.ncrNo], ['kapandi', 'red', `NCR-GKK-${k.malKabulSatirId}`]);
    assert.deepEqual(await bakiye(k.partiId), { 'kabul:serbest': '1.000' });
    const iade = await o().sahip.tek<{ m: string; n: string }>(
      "SELECT miktar::text AS m, cikis_nedeni AS n FROM stok_hareketi WHERE parti_id = $1 AND tur = 'cikis'", [k.partiId]);
    assert.deepEqual([iade?.m, iade?.n], ['3.000', 'tedarikci_iade']);
    const ncr = await o().vt.tx((db) => sorgular.kayitGovdesi(db, 'ncr', `ncr-gkk-${k.malKabulSatirId}`));
    assert.deepEqual([ncr?.kaynak, ncr?.durum, ncr?.mrb, ncr?.miktar, ncr?.lot], [GIRIS_NCR_KAYNAGI, 'Açık', 'Tedarikçiye iade', 3, '']);
    assert.equal((await karar(k.malKabulSatirId, { karar: 'kabul' })).statusCode, 409, 'ikinci karar');
    assert.ok(!(await bekleyenler()).some((x) => x.malKabulSatirId === k.malKabulSatirId));
  });

  test('karar: şartlı kabul hatalıyı mal kabul alanına şartlı geçirir ve NCR\'yi kapatır; GKK verilen belge düzeltilemez; elle iade çıkışı yok', async () => {
    const k = await kabulEt(await kart('hammadde'), '2');
    assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${k.malKabulSatirId}/gkk`, { kabul: '0', hatali: '2' })).statusCode, 200);
    const r = await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${k.malKabulSatirId}/karar`, {
      karar: 'sartli_kabul', ncrKimlik: 'ncr-gkk-sartli', ncrNo: 'NCR-GKK-S', ciddiyet: 'Minör', not: 'yalnız kaba işlemede',
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(await bakiye(k.partiId), { 'kabul:sartli': '2.000' });
    const ncr = await o().vt.tx((db) => sorgular.kayitGovdesi(db, 'ncr', 'ncr-gkk-sartli'));
    assert.deepEqual([ncr?.durum, ncr?.mrb, ncr?.mrbGerekce], ['Kapalı', 'Şartlı kabul', 'yalnız kaba işlemede']);

    const belge = await o().sahip.tek<{ id: number; m: number }>(
      'SELECT m.id, s.malzeme_id AS m FROM stok_mal_kabul m JOIN stok_mal_kabul_satiri s ON s.mal_kabul_id = m.id WHERE s.id = $1', [k.malKabulSatirId]);
    const d = await istek('yonetici', 'POST', `/stok/mal-kabuller/${belge!.id}/duzelt`, { satirlar: [{ malzemeId: belge!.m, miktar: '1' }] });
    assert.equal(d.statusCode, 409, d.body);
    assert.match(d.json().mesaj, /giriş kontrolü kararı/);

    const elle = await istek('yonetici', 'POST', '/stok/cikis', { malzemeId: belge!.m, konumId: 1, miktar: '1', cikisNedeni: 'tedarikci_iade' });
    assert.equal(elle.statusCode, 400, elle.body);
    assert.equal(elle.json().alan, 'cikisNedeni');
  });
  test('rezerve: karantinadaki GKK lotu bekleyen emre ayrılmaz; GKK kabulünde serbest kalan miktar emre ayrılır', async () => {
    const hm = await kart('hammadde');
    sira += 1;
    const ym = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'yarimamul', 'GKK-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`gkk-dnm-${sira}`, sira, JSON.stringify({ id: `gkk-dnm-${sira}`, com: { ad: 'Deneme yarı mamul' } }), yoneticiId],
    ))!.no;
    const s = o().sahip;
    const im = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('GKKIM', 'Deneme Merkezi') RETURNING id"))!.id;
    const ist = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('GKKIS', 'Deneme istasyon', $1) RETURNING id", [im]))!.id;
    const makine = (await s.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('GKKM', 'Tezgah', $1) RETURNING id", [ist]))!.id;
    const tip = (await s.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('GKK-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    const proje = (await s.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('KALITE.GKK', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    const revizyon = (await s.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'yarimamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [ym, yoneticiId]))!.id;
    const planlamaId = (await s.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'planlama'"))!.id;
    const emir = await o().vt.tx(async (db) => (await uretimEmriAc(db, (await kullaniciYukle(db, planlamaId))!, {
      projeId: proje, malzemeNo: ym, adet: 2, teslim: null, kaynakRotaRevizyonId: revizyon, stoktanRezerve: true,
      isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '2' }],
      }],
    })).uretimEmriId);
    const ayrilan = async () => (await s.sorgu<{ m: string }>('SELECT miktar::text AS m FROM stok_rezerve WHERE malzeme_id = $1 AND uretim_emri_id = $2', [hm, emir])).map((x) => Number(x.m));

    const k = await kabulEt(hm, '5');
    assert.deepEqual(await ayrilan(), [], 'karar bekleyen lot ayrılmaz');
    assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${k.malKabulSatirId}/gkk`, { kabul: '3', hatali: '2' })).statusCode, 200);
    assert.deepEqual(await ayrilan(), [3], 'serbest kalan kabul miktarı emre ayrılır, hatalı ayrılmaz');
  });
});
