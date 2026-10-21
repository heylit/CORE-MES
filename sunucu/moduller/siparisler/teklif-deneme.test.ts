import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { PlanTaslaklariCevabi, TeklifAyrintisi, TerminDenemesiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { satisTaslagiKilitleri, teklifDenemeCozucusu } from './disari.ts';
import type { TeklifDenemeGirdisi, TeklifDenemeSonucu } from './disari.ts';
import { DENENECEK_KALEM_YOK, ONAYLANACAK_ISKONTO_YOK, TERMIN_DENEMESI_YOK } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
const GECERLILIK = '2099-06-30';
const PLAN_TERMINI = '2099-07-14';

// Motor Reçete ve Rota'dadır; burada sözleşmesine uyan sahte çözücü kaydedilir. Kayıtsız yol ayrıca denenir.
describe('siparisler teklif termin ve fiyat denemesi (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let operator = '';
  let planlama = { cerez: '', id: 0 };
  let sayac = 0;
  let musteriId = 0;
  let mamulNo = 0;
  const istekler: TeklifDenemeGirdisi[] = [];
  let geciktirir = false;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  // Motorun (Reçete ve Rota teklifDene) biçimiyle cevap verir: kalemler sırayla, anlar tesis anı.
  function sahteCozucu(_db: unknown, _k: unknown, istek: TeklifDenemeGirdisi): Promise<TeklifDenemeSonucu> {
    istekler.push(istek);
    return Promise.resolve({
      kalemler: istek.kalemler.map((k) => ({
        tamam: true, bitis: '2099-07-10T16:00:00+03:00', planTermini: PLAN_TERMINI, malzemeTl: 100,
        malzeme: [{ gelis: '2099-07-03T08:00:00+03:00' }, { gelis: null }],
        satinalma: [{ kod: 'HM-DENEME', miktar: 12.5, birim: 'kg', gelis: '2099-07-03T08:00:00+03:00' }],
        islemler: [{
          adim: `${k.malzemeNo}.10`, makineId: 'T1', fason: false, baslangic: '2099-07-08T08:00:00+03:00', bitis: '2099-07-10T16:00:00+03:00',
          ayarSaat: 1, islemeSaat: 2, tl: 250,
        }],
        eksik: [],
      })),
      kayan: istek.istenenTermin === null ? [] : [{
        siparis: 'p-1', emirNo: 'S-DENEME', once: '2099-07-01T10:00:00+03:00', sonra: geciktirir ? '2099-07-04T10:00:00+03:00' : '2099-07-02T10:00:00+03:00',
        termin: '2099-07-02T23:00:00+03:00',
      }],
    });
  }

  async function girisYap(rolKodu: string | null): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `tdeneme-${(sayac += 1)}`;
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
        await rolAl(db, yoneticiId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  // Onaylı matristen bağımsız: yalnız verilen işlemleri taşıyan deneme rolü.
  async function rolluGiris(islemler: string[]): Promise<string> {
    const kod = `tdeneme_rol_${(sayac += 1)}`;
    await o().sahip.sorgu('INSERT INTO rol (kod, ad) VALUES ($1, $1)', [kod]);
    await o().sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT (SELECT id FROM rol WHERE kod = $1), unnest($2::text[])', [kod, islemler]);
    return (await girisYap(kod)).cerez;
  }

  const gonder = (cerez: string, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });

  async function teklifAc(kartsiz = true): Promise<TeklifAyrintisi> {
    const satirlar = [{ malzemeNo: mamulNo, tanim: 'Deneme parça A', miktar: '10' }];
    if (kartsiz) satirlar.push({ malzemeNo: null as unknown as number, tanim: 'Kartı açılmamış parça', miktar: '5' });
    const c = await gonder(yonetici, '/siparisler/teklifler/ekle', { firmaId: musteriId, baslik: 'Deneme talebi', satirlar });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<TeklifAyrintisi>();
  }
  async function komut(t: Pick<TeklifAyrintisi, 'id' | 'surum'>, yol: string, govde: Record<string, unknown>, beklenen = 200, cerez = yonetici): Promise<TeklifAyrintisi> {
    const c = await gonder(cerez, `/siparisler/teklifler/${t.id}/${yol}`, { surum: t.surum, ...govde });
    assert.equal(c.statusCode, beklenen, c.body);
    return c.json<TeklifAyrintisi>();
  }
  const fiyatlar = (t: TeklifAyrintisi) => t.satirlar.map((s) => ({ satirId: s.id, birimFiyat: '5' }));
  const satisSurumu = (t: TeklifAyrintisi, istenenTermin: string | null = null, ek: Record<string, unknown> = {}) =>
    ({ fiyatlar: fiyatlar(t), gecerlilik: GECERLILIK, planTaslagi: { karOrani: '25', istenenTermin }, ...ek });
  const taslaklar = async (t: { id: number }, cerez = yonetici) => {
    const c = await oku(cerez, `/siparisler/teklifler/${t.id}/plan-taslaklari`);
    assert.equal(c.statusCode, 200, c.body);
    return c.json<PlanTaslaklariCevabi>().taslaklar;
  };
  const kilitli = async (t: { id: number }) => (await o().vt.tx((db) => satisTaslagiKilitleri(db))).filter((k) => k.teklifId === t.id);

  before(async () => {
    ortam = await testVeritabaniKur('siparisler_teklif_deneme');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const y = await girisYap(null);
    yonetici = y.cerez;
    yoneticiId = y.id;
    operator = (await girisYap('operator')).cerez;
    planlama = await girisYap('planlama_proje');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('TDN-', 0) ON CONFLICT (onek) DO NOTHING");
    mamulNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('tdn-1', 'mamul', 'TDN-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'tdn-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    const f = await gonder(yonetici, '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Firma TDN', tur: 'musteri' });
    assert.equal(f.statusCode, 200, f.body);
    musteriId = f.json<{ firma: { id: number } }>().firma.id;
    // 1000 TL / 100 saat: makine saatine 10 TL genel gider.
    await ortam.sahip.sorgu(
      "INSERT INTO finans_genel_gider_orani (gecerlilik_baslangic, aylik_genel_gider, aylik_makine_saati, amortisman_dahil, olusturan_id) VALUES ('2000-01-01', 1000, 100, false, $1)",
      [yoneticiId],
    );
  });
  beforeEach(() => { teklifDenemeCozucusu(sahteCozucu); istekler.length = 0; geciktirir = false; });
  after(async () => { teklifDenemeCozucusu(null); await app?.close(); await ortam?.kaldir(); });

  test('motor kayıtsızken: deneme "cozucu-yok" der, plan taslaklı sürüm 422; elle sürüm termin tarihiyle verilir', async () => {
    teklifDenemeCozucusu(null);
    let t = await teklifAc();
    const d = await oku(yonetici, `/siparisler/teklifler/${t.id}/termin-denemesi?gecerlilik=${GECERLILIK}`);
    assert.equal(d.statusCode, 200, d.body);
    assert.deepEqual([d.json<TerminDenemesiCevabi>().durum, d.json<TerminDenemesiCevabi>().termin], ['cozucu-yok', null]);
    const red = await gonder(yonetici, `/siparisler/teklifler/${t.id}/surum-ver`, { surum: t.surum, ...satisSurumu(t) });
    assert.equal(red.statusCode, 422, red.body);
    assert.equal(red.json<{ mesaj: string }>().mesaj, TERMIN_DENEMESI_YOK);
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t), terminTarihi: '2099-08-01' });
    assert.deepEqual([t.durum, t.surumler[0]?.terminTarihi], ['verildi', '2099-08-01']);
    assert.deepEqual(await taslaklar(t), []);
  });

  test('TKL-13 deneme: kartlı kalemler tek denemede; kartsız plansız; termin, gün, satın alma; maliyet yetkiye göre', async () => {
    const t = await teklifAc();
    const c = await oku(yonetici, `/siparisler/teklifler/${t.id}/termin-denemesi?gecerlilik=${GECERLILIK}`);
    assert.equal(c.statusCode, 200, c.body);
    const d = c.json<TerminDenemesiCevabi>();
    assert.deepEqual(istekler.map((i) => [i.kalemler.length, i.gecerlilik, i.istenenTermin, i.taslakId]), [[1, GECERLILIK, null, null]]);
    assert.deepEqual([d.durum, d.planSurumu, d.termin, d.terminGun, d.satinalmaGerekli, d.onayGerekli], ['hazir', null, PLAN_TERMINI, 14, true, false]);
    assert.deepEqual(d.kalemler.map((k) => [k.plansiz, k.yerlesti]), [[false, true], [true, false]]);
    // 100 malzeme + 250 işlem (ayar dahil) + 3 saat x 10 genel gider; malzeme gelişi en geç bilinen geliştir.
    assert.deepEqual([d.maliyetToplami, d.kalemler[0]?.birimMaliyet, d.genelGiderSaatBasi, d.kalemler[0]?.dokum?.length], ['380.00', '38.0000', '10.00', 3]);
    assert.equal(d.kalemler[0]?.malzemeGelisi, '2099-07-03T08:00:00+03:00');
    const fiyatli = await rolluGiris(['siparisler.oku', 'siparisler.termin-dene', 'siparisler.fiyat-oku']);
    const f = (await oku(fiyatli, `/siparisler/teklifler/${t.id}/termin-denemesi`)).json<TerminDenemesiCevabi>();
    assert.deepEqual([f.termin, f.maliyetToplami, f.kalemler[0]?.dokum, f.genelGiderSaatBasi], [PLAN_TERMINI, '380.00', null, null]);
    const fiyatsiz = await rolluGiris(['siparisler.oku', 'siparisler.termin-dene']);
    const s = (await oku(fiyatsiz, `/siparisler/teklifler/${t.id}/termin-denemesi`)).json<TerminDenemesiCevabi>();
    assert.deepEqual([s.termin, s.maliyetToplami, s.kalemler[0]?.birimMaliyet, s.kalemler[0]?.dokum], [PLAN_TERMINI, null, null, null]);
    const kartsiz = await gonder(yonetici, '/siparisler/teklifler/ekle', { firmaId: musteriId, baslik: 'Kartsız', satirlar: [{ malzemeNo: null, tanim: 'x', miktar: '1' }] });
    const k = kartsiz.json<TeklifAyrintisi>();
    const kd = (await oku(yonetici, `/siparisler/teklifler/${k.id}/termin-denemesi`)).json<TerminDenemesiCevabi>();
    assert.deepEqual([kd.durum, kd.termin, kd.kalemler[0]?.plansiz], ['hazir', null, true]);
    const kred = await gonder(yonetici, `/siparisler/teklifler/${k.id}/deneme-taslagi`, { karOrani: '20' });
    assert.equal(kred.json<{ mesaj: string }>().mesaj, DENENECEK_KALEM_YOK);
  });

  test('TKL-09 yetki: deneme ve deneme taslağı termin-dene ister (403); plan taslaklı sürüm termin-dene ister; termin onayı plan.yaz; olmayan teklif 404', async () => {
    const t = await teklifAc();
    for (const cerez of [operator, planlama.cerez]) {
      assert.equal((await oku(cerez, `/siparisler/teklifler/${t.id}/termin-denemesi`)).statusCode, 403);
      assert.equal((await gonder(cerez, `/siparisler/teklifler/${t.id}/deneme-taslagi`, { karOrani: '20' })).statusCode, 403);
    }
    assert.equal((await oku(operator, `/siparisler/teklifler/${t.id}/plan-taslaklari`)).statusCode, 403);
    const fiyatYazar = await rolluGiris(['siparisler.oku', 'siparisler.yaz', 'siparisler.fiyat-oku']);
    const r = await gonder(fiyatYazar, `/siparisler/teklifler/${t.id}/surum-ver`, { surum: t.surum, ...satisSurumu(t) });
    assert.equal(r.statusCode, 403, r.body);
    assert.equal((await gonder(fiyatYazar, `/siparisler/teklifler/${t.id}/termin-onayla`, { surum: t.surum })).statusCode, 403);
    assert.equal(istekler.length, 0);
    assert.equal((await oku(yonetici, '/siparisler/teklifler/2147483000/termin-denemesi')).statusCode, 404);
    assert.equal((await oku(yonetici, '/siparisler/teklifler/2147483000/plan-taslaklari')).statusCode, 404);
    assert.equal((await gonder(yonetici, '/siparisler/teklifler/2147483000/deneme-taslagi', { karOrani: '20' })).statusCode, 404);
    assert.equal((await gonder(planlama.cerez, '/siparisler/teklifler/2147483000/termin-onayla', { surum: 1 })).statusCode, 404);
  });

  test('gövde: plan taslağı geçerlilik ister, termin elle girilmez; kâr yüzdedir (400)', async () => {
    const t = await teklifAc();
    await komut(t, 'surum-ver', satisSurumu(t, null, { gecerlilik: null }), 400);
    await komut(t, 'surum-ver', satisSurumu(t, null, { terminTarihi: '2099-08-01' }), 400);
    await komut(t, 'surum-ver', satisSurumu(t, null, { planTaslagi: { karOrani: '-5' } }), 400);
    assert.equal(istekler.length, 0);
  });

  test('TKL-17 (45 a, 49) arkaya ekleme: satış taslağı planda yer tutar; aynı terminle yeni sürümde yeri sabit, yeniden denenmez', async () => {
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', satisSurumu(t));
    assert.deepEqual([t.durum, t.surumler[0]?.terminTarihi], ['verildi', PLAN_TERMINI]);
    let l = await taslaklar(t);
    assert.deepEqual(l.map((x) => [x.tur, x.gorunum, x.surumNo, x.termin, x.karOrani, x.maliyetToplami]), [['satis', 'satis', 1, PLAN_TERMINI, '25.00', '380.00']]);
    const ilk = l[0]!.id;
    const k = await kilitli(t);
    assert.deepEqual(k.map((x) => [x.taslakId, x.gecerlilik, x.kalemler.map((m) => m.malzemeNo), x.kilitler.map((m) => m.tezgah)]), [[ilk, GECERLILIK, [mamulNo], ['T1']]]);
    t = await komut(t, 'revizyon-iste', { not: 'Fiyat yüksek' });
    t = await komut(t, 'surum-ver', satisSurumu(t, null, { gecerlilik: '2099-07-31', planTaslagi: { karOrani: '20', istenenTermin: null } }));
    assert.equal(istekler.length, 1);
    l = await taslaklar(t);
    assert.deepEqual(l.map((x) => [x.id, x.gorunum, x.surumNo, x.gecerlilik, x.karOrani]), [[ilk, 'satis', 2, '2099-07-31', '20.00']]);
    assert.equal(t.surumler[1]?.terminTarihi, PLAN_TERMINI);
    // Fiyatı görmeyen taslağı görür, kârı ve maliyeti görmez.
    assert.deepEqual((await taslaklar(t, planlama.cerez)).map((x) => [x.gorunum, x.karOrani, x.maliyetToplami]), [['satis', null, null]]);
  });

  test('TKL-15 (48 b, 63 b) başka termin: yeniden yerleşir, eski yer kalkar; geciktiriyorsa plancı onayı bekler, bildirim gider; onaya kadar yer tutar', async () => {
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', satisSurumu(t));
    const ilk = (await taslaklar(t))[0]!.id;
    geciktirir = true;
    t = await komut(t, 'surum-ver', satisSurumu(t, '2099-07-05'));
    assert.deepEqual(istekler.map((i) => [i.istenenTermin, i.taslakId]), [[null, null], ['2099-07-05', String(ilk)]]);
    // 49: yer tutan taslak motora kilitli iş olarak gider: kalem termini ve adım başına makine ile başlangıç.
    const kilitliTaslak = istekler[1]?.taslaklar.find((x) => x.id === String(ilk));
    assert.deepEqual(kilitliTaslak?.kalemler.map((k) => [k.termin, k.yerlesim]), [[PLAN_TERMINI, { [`${mamulNo}.10`]: { makineId: 'T1', baslangic: '2099-07-08T08:00:00+03:00' } }]]);
    assert.deepEqual([t.durum, t.surumler[1]?.terminTarihi], ['onay-bekliyor', '2099-07-05']);
    const l = await taslaklar(t);
    assert.deepEqual(l.map((x) => [x.gorunum, x.onayGerekli, x.gecikenSayisi]), [['onay-bekliyor', true, 1], ['kalkti', false, 0]]);
    assert.equal((await kilitli(t)).length, 1);
    const bildirim = await o().sahip.sorgu<{ baslik: string }>(
      "SELECT baslik FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = 'siparisler.termin-onay-bekliyor' AND yol = $2", [planlama.id, `/siparisler/teklifler/${t.id}`]);
    assert.deepEqual(bildirim, [{ baslik: `Termin onayı bekleyen teklif: ${t.no}` }]);
    await komut(t, 'kabul', { surumNo: 2 }, 422);
    const iskonto = await gonder(yonetici, `/siparisler/teklifler/${t.id}/iskonto-onayla`, { surum: t.surum });
    assert.equal(iskonto.json<{ mesaj: string }>().mesaj, ONAYLANACAK_ISKONTO_YOK);
    assert.equal((await gonder(operator, `/siparisler/teklifler/${t.id}/termin-onayla`, { surum: t.surum })).statusCode, 403);
    await komut({ ...t, surum: t.surum - 1 }, 'termin-onayla', {}, 409, planlama.cerez);
    t = await komut(t, 'termin-onayla', {}, 200, planlama.cerez);
    assert.equal(t.durum, 'verildi');
    const onayli = (await taslaklar(t))[0]!;
    assert.deepEqual([onayli.gorunum, onayli.onaylayan?.startsWith('Deneme tdeneme-'), onayli.onayAni !== null], ['satis', true, true]);
    await komut(t, 'termin-onayla', {}, 422, planlama.cerez);
  });

  test('TKL-15 iskonto ve termin onayı birlikte: ikisi de verilmeden teklif müşteriye gitmez', async () => {
    let t = await teklifAc();
    geciktirir = true;
    t = await komut(t, 'surum-ver', satisSurumu(t, '2099-07-05', { iskontoOrani: '15' }));
    assert.equal(t.durum, 'onay-bekliyor');
    t = await komut(t, 'iskonto-onayla', {});
    assert.equal(t.durum, 'onay-bekliyor');
    t = await komut(t, 'termin-onayla', {}, 200, planlama.cerez);
    assert.equal(t.durum, 'verildi');
    let u = await teklifAc();
    u = await komut(u, 'surum-ver', satisSurumu(u, '2099-07-05', { iskontoOrani: '15' }));
    u = await komut(u, 'termin-onayla', {}, 200, planlama.cerez);
    assert.equal(u.durum, 'onay-bekliyor');
    u = await komut(u, 'iskonto-onayla', {});
    assert.equal(u.durum, 'verildi');
  });

  test('TKL-17 (49) geçerlilik geçince yer kalkar, "satış denemesi" olarak kalır; elle sürüm ve red yeri kaldırır; deneme taslağı yer tutmaz', async () => {
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', satisSurumu(t));
    await o().sahip.sorgu("UPDATE siparisler_teklif_plan_taslagi SET gecerlilik = current_date - 1 WHERE teklif_id = $1", [t.id]);
    assert.deepEqual((await taslaklar(t)).map((x) => x.gorunum), ['satis-deneme']);
    assert.deepEqual(await kilitli(t), []);
    // Geçmiş taslak aynı terminle de yeniden denenir; eskisi satış denemesi olarak kalır.
    t = await komut(t, 'surum-ver', satisSurumu(t));
    assert.equal(istekler.length, 2);
    assert.deepEqual((await taslaklar(t)).map((x) => x.gorunum), ['satis', 'satis-deneme']);
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t), terminTarihi: '2099-08-01' });
    assert.deepEqual((await taslaklar(t)).map((x) => x.gorunum), ['kalkti', 'satis-deneme']);
    t = await komut(t, 'surum-ver', satisSurumu(t));
    assert.equal((await kilitli(t)).length, 1);
    t = await komut(t, 'reddet', { not: 'Müşteri vazgeçti' });
    assert.deepEqual(await kilitli(t), []);
    const d = await gonder(yonetici, `/siparisler/teklifler/${t.id}/deneme-taslagi`, { karOrani: '30', istenenTermin: '2099-07-20' });
    assert.equal(d.statusCode, 200, d.body);
    assert.deepEqual(d.json<PlanTaslaklariCevabi>().taslaklar.map((x) => [x.tur, x.gorunum, x.karOrani]).slice(0, 1), [['deneme', 'deneme', '30.00']]);
    assert.deepEqual(await kilitli(t), []);
  });

  test('plan taslağı veritabanında da tutarlıdır: deneme yer tutmaz, teklif başına tek yer, bekleyen onaysızdır', async () => {
    const t = await teklifAc(false);
    await komut(t, 'surum-ver', satisSurumu(t));
    const ekle = (tur: string, durum: string, surum: string, ek = '') => o().sahip.sorgu(
      `INSERT INTO siparisler_teklif_plan_taslagi (teklif_id, surum_id, tur, durum, gecerlilik, kar_orani, kalemler, kayanlar, kilitler, olusturan_id${ek ? ', onay_gerekli' : ''})
       VALUES ($1, ${surum}, $2, $3, '2099-06-30', 10, '[]', '[]', '[]', $4${ek})`, [t.id, tur, durum, yoneticiId]);
    const surum = `(SELECT id FROM siparisler_teklif_surumu WHERE teklif_id = ${t.id} LIMIT 1)`;
    await assert.rejects(ekle('deneme', 'kalkti', 'NULL'), (h: { constraint?: string }) => h.constraint === 'siparisler_teklif_plan_taslagi_deneme');
    await assert.rejects(ekle('satis', 'aktif', surum), (h: { constraint?: string }) => h.constraint === 'siparisler_teklif_plan_taslagi_tek_yer');
    await assert.rejects(ekle('satis', 'onay-bekliyor', surum), (h: { constraint?: string }) => h.constraint === 'siparisler_teklif_plan_taslagi_bekleyen');
  });
  test('65 a satış rolü: teklifi dener, termin ve maliyet toplamını görür, dökümü görmez; plan taslaklı sürüm verir; müdür dökümü görür', async () => {
    const satis = await girisYap('satis');
    let t = await teklifAc();
    const d = (await oku(satis.cerez, `/siparisler/teklifler/${t.id}/termin-denemesi`)).json<TerminDenemesiCevabi>();
    assert.deepEqual([d.termin, d.maliyetToplami, d.kalemler[0]?.dokum, d.genelGiderSaatBasi], [PLAN_TERMINI, '380.00', null, null]);
    t = await komut(t, 'surum-ver', satisSurumu(t), 200, satis.cerez);
    assert.deepEqual([t.durum, t.surumler[0]?.toplam !== null], ['verildi', true]);
    assert.deepEqual((await taslaklar(t, satis.cerez)).map((x) => [x.gorunum, x.karOrani]), [['satis', '25.00']]);
    assert.equal((await gonder(satis.cerez, `/siparisler/teklifler/${t.id}/termin-onayla`, { surum: t.surum })).statusCode, 403);
    assert.equal((await oku(satis.cerez, '/musteri-tedarikci/firmalar/secim')).statusCode, 200);
    const mudur = await girisYap('mudur');
    assert.equal((await oku(mudur.cerez, `/siparisler/teklifler/${t.id}/termin-denemesi`)).json<TerminDenemesiCevabi>().kalemler[0]?.dokum?.length, 3);
  });
});
