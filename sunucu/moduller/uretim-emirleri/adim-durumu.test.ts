import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { HAZIRLIK_MADDELERI, adimDurumuCevabi, adimDurumuTerminalCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimDurumuCevabi, AdimDurumuTerminalCevabi, HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { adimTedarikCozucusu, elleOnayliMaddeler, emirBaslat, uretimEmriAc } from './disari.ts';
import type { EmirTedarikSatiri } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { hazirlikCozucusuKaydet } from './hazirlik.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';
import { ADIM_KAPALI_EMIR, EMIR_BEKLEMEDE, EMIR_BEKLEMEDE_STATU } from './kurallar.ts';
import type { HazirlikBilgisi } from './kurallar.ts';
import { isEmriKilitle } from './sorgular.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

// 2893: Adım Durumu okuması, elle statü ve elle hazırlık onayı (2893-1 a yetki, 2893-2 b başlatmayı açar, 2893-3 b terminal okuması).
describe('uretim-emirleri adım durumu (2893, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let sayac = 0;
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
  async function makineKur(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`ADM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`ADI${sayac}`, `Deneme ${sayac}`, im?.id]);
    if (!ist) throw new Error('istasyon kurulamadı');
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi ON CONFLICT DO NOTHING', [ist.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`ADMK${sayac}`, 'Tezgah', ist.id]);
    if (!m) throw new Error('makine kurulamadı');
    return m.id;
  }
  const adim = (sira: number, makineId: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = async (): Promise<{ id: number; ie: number[] }> => {
    const m = await makineKur();
    const r = await o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
      malzemeNo: urunNo, adet: 4, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: [adim(1, m), adim(2, m)], projeId,
    }));
    return { id: r.uretimEmriId, ie: r.isEmriIdleri };
  };
  const oku = async (id: number, kisi = 'planlama_proje'): Promise<AdimDurumuCevabi> => {
    const c = await istek<AdimDurumuCevabi>(kisi, 'GET', `/adimli-emirler/${id}/adim-durumu`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return adimDurumuCevabi.parse(c.govde);
  };
  const baslat = async (id: number, isEmriId: number): Promise<Cevap<Hata>> => {
    try {
      await o().vt.tx((db) => emirBaslat(db, kim('operator'), id, undefined, undefined, isEmriId));
      return { durum: 200, govde: { kod: '', mesaj: '' } };
    } catch (h) {
      if (h instanceof UygulamaHatasi) return { durum: h.durum, govde: h.govde() as Hata };
      throw h;
    }
  };

  // Kayıtlı gerçek çözücüler (yayın, rota, makine...) test boyunca kaldırılır: her test yalnız kendi koyduğu maddeyi görür.
  const gercekCozuculer = new Map<HazirlikMaddesi, HazirlikCozucusu | null>();
  before(async () => {
    for (const m of HAZIRLIK_MADDELERI) gercekCozuculer.set(m, hazirlikCozucusuKaydet(m, null));
    ortam = await testVeritabaniKur('uretim_adim_durumu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.ADIM', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const r of ['planlama_proje', 'operator', 'kalite', 'mudur']) await kisiEkle(r, r);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('AD-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('AD-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ad-dnm-1', 'mamul', 'AD-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'ad-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => {
    for (const [m, c] of gercekCozuculer) hazirlikCozucusuKaydet(m, c);
    await ortam?.kaldir();
  });

  test('statü sistemden türer; elle statü yalnız yetkiliye, sistem statüsü değişince düşer; terminal kişisiz okur', async () => {
    const { id, ie } = await ac();
    const [ie1 = 0, ie2 = 0] = ie;
    const durumlar = new Map<HazirlikMaddesi, HazirlikBilgisi>([['cnc', { durum: 'suruyor', secildi: true }]]);
    const cozucu: HazirlikCozucusu = async (_db, idler) => new Map(idler.filter((x) => x === ie1).map((x) => [x, durumlar.get('cnc')!]));
    const onceki = hazirlikCozucusuKaydet('cnc', cozucu);
    try {
      const d = await oku(id);
      assert.deepEqual(d.adimlar.map((a) => [a.opNo, a.sistemStatusu]), [[10, 'program'], [20, 'onceki']]);
      assert.deepEqual(d.adimlar[0]?.nedenler, ['CNC kurulumu (NC) eksik']);
      assert.equal(d.adimlar[0]?.maddeler.find((m) => m.madde === 'cnc')?.hal, 'eksik');
      assert.equal((await istek('operator', 'GET', `/adimli-emirler/${id}/adim-durumu`)).durum, 403, 'operatör ayrıntıyı okumaz');

      const yaz = (govde: unknown, kisi = 'planlama_proje', isEmriId = ie1) =>
        istek<AdimDurumuCevabi & Hata>(kisi, 'POST', `/adimli-emirler/${id}/is-emirleri/${isEmriId}/statu-yaz`, govde);
      const govde = { statu: 'siparis', not: 'Tedarikçi bekleniyor', sistemStatusu: 'program' };
      assert.equal((await yaz(govde, 'operator')).durum, 403, 'operatör yazmaz (2893-3 b)');
      assert.equal((await yaz(govde, 'kalite')).durum, 403, 'kalite yazmaz (2893-1 a)');
      assert.equal((await yaz({ ...govde, sistemStatusu: 'baslayabilir' })).durum, 409, 'eski görüntüye göre yazılmaz');
      assert.equal((await yaz({ ...govde, statu: 'yok' })).durum, 400);
      for (const statu of ['bitti', 'uretimde', 'duraklatildi', 'durdu', 'baslayabilir']) {
        assert.equal((await yaz({ ...govde, statu }, 'mudur')).durum, 400, `${statu} sistemden gelir, elle yazılmaz`);
      }
      assert.equal((await yaz(govde, 'planlama_proje', 2_000_000_000)).durum, 404, 'başka emrin iş emri');
      const yazildi = await yaz(govde, 'mudur');
      assert.equal(yazildi.durum, 200, JSON.stringify(yazildi.govde));
      assert.deepEqual([yazildi.govde.adimlar[0]?.elle?.statu, yazildi.govde.adimlar[0]?.elle?.kisiAdi, yazildi.govde.adimlar[0]?.elle?.not],
        ['siparis', 'Deneme mudur', 'Tedarikçi bekleniyor']);
      assert.equal(yazildi.govde.adimlar[0]?.sistemStatusu, 'program', 'sistemin dediği kalır');

      const t = await istek<AdimDurumuTerminalCevabi>('operator', 'GET', `/adimli-emirler/${id}/adim-durumu/terminal`);
      assert.equal(t.durum, 200, JSON.stringify(t.govde));
      assert.deepEqual(adimDurumuTerminalCevabi.parse(t.govde).adimlar.map((a) => [a.opNo, a.statu, a.elle]), [[10, 'siparis', true], [20, 'onceki', false]]);
      assert.equal(JSON.stringify(t.govde).includes('Deneme mudur'), false, 'terminalde kişi yok');

      durumlar.set('cnc', { durum: 'tamam', secildi: true });
      const sonra = await oku(id);
      assert.deepEqual([sonra.adimlar[0]?.sistemStatusu, sonra.adimlar[0]?.elle], ['baslayabilir', null], 'sistem statüsü değişince elle statü düşer');
      assert.deepEqual(sonra.adimlar[0]?.gecmis.map((g) => [g.olay, g.deger]), [['statu', 'siparis']], 'geçmiş silinmez');
      assert.equal((await istek(`planlama_proje`, 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/statu-kaldir`, {})).durum, 409, 'açık elle statü yok');

      assert.equal((await yaz({ statu: 'talep', not: null, sistemStatusu: 'onceki' }, 'planlama_proje', ie2)).durum, 200);
      for (const kisi of ['operator', 'kalite']) {
        assert.equal((await istek(kisi, 'POST', `/adimli-emirler/${id}/is-emirleri/${ie2}/statu-kaldir`, {})).durum, 403, `${kisi} kaldırmaz`);
      }
      const kaldir = await istek<AdimDurumuCevabi>('planlama_proje', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie2}/statu-kaldir`, {});
      assert.equal(kaldir.durum, 200, JSON.stringify(kaldir.govde));
      assert.equal(kaldir.govde.adimlar[1]?.elle, null);
      assert.deepEqual(kaldir.govde.adimlar[1]?.gecmis.map((g) => g.olay), ['statu-kaldir', 'statu']);
      await assert.rejects(o().sahip.sorgu("UPDATE uretim_emirleri_adim_statusu SET aciklama = 'x'"), /yalnız ekleme/);
    } finally {
      hazirlikCozucusuKaydet('cnc', onceki);
    }
  });

  test('2893-2 b: elle onay durduran maddede gerekçeyle başlatmayı açar; sürüm değişince düşer; kaldırınca yeniden eksik', async () => {
    const { id, ie } = await ac();
    const [ie1 = 0] = ie;
    const durumlar = new Map<HazirlikMaddesi, HazirlikBilgisi>([
      ['cnc', { durum: 'suruyor', secildi: true, surum: 'P1' }], ['cizim', { durum: 'suruyor', secildi: true, surum: '7@a' }],
    ]);
    const cozucu = (m: HazirlikMaddesi): HazirlikCozucusu => async (_db, idler) =>
      new Map(idler.filter((x) => x === (m === 'cnc' ? ie1 : id)).map((x) => [x, durumlar.get(m)!]));
    const onceki = (['cnc', 'cizim'] as const).map((m) => [m, hazirlikCozucusuKaydet(m, cozucu(m))] as const);
    const onayla = (govde: unknown, kisi = 'planlama_proje') =>
      istek<AdimDurumuCevabi & Hata>(kisi, 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/hazirlik-onayla`, govde);
    try {
      assert.equal((await baslat(id, ie1)).durum, 409);
      assert.equal((await onayla({ madde: 'cnc', gerekce: null, sistemHali: 'eksik' })).durum, 400, 'durduran maddede gerekçe zorunlu');
      assert.equal((await onayla({ madde: 'cnc', gerekce: '   ', sistemHali: 'eksik' })).durum, 400, 'boş gerekçe');
      assert.equal((await onayla({ madde: 'cnc', gerekce: 'kısa', sistemHali: 'eksik' })).durum, 400, 'beş karakterden kısa gerekçe');
      assert.equal((await onayla({ madde: 'cnc', gerekce: 'Program elde denendi', sistemHali: 'tamam' })).durum, 409, 'eski hâl');
      assert.equal((await onayla({ madde: 'cnc', gerekce: 'Program elde denendi', sistemHali: 'eksik' }, 'kalite')).durum, 403);
      assert.equal((await onayla({ madde: 'rota', gerekce: null, sistemHali: 'eksik' })).durum, 409, 'çözücüsüz madde bilinmiyor: eksik görüntüye göre onaylanmaz');
      const cnc = await onayla({ madde: 'cnc', gerekce: 'Program elde denendi', sistemHali: 'eksik' });
      assert.equal(cnc.durum, 200, JSON.stringify(cnc.govde));
      assert.deepEqual(cnc.govde.adimlar[0]?.onaylar.map((x) => [x.madde, x.gerekce, x.sistemHali, x.kisiAdi]), [['cnc', 'Program elde denendi', 'eksik', 'Deneme planlama_proje']]);
      assert.deepEqual(cnc.govde.adimlar[0]?.maddeler.find((m) => m.madde === 'cnc'), { madde: 'cnc', hal: 'muaf', ham: 'eksik' });
      assert.equal((await onayla({ madde: 'cnc', gerekce: 'Yine', sistemHali: 'muaf' })).durum, 409, 'onaylı madde yeniden onaylanmaz');
      assert.equal(cnc.govde.adimlar[0]?.sistemStatusu, 'cizim', 'CNC artık eksik değil, sıradaki eksik çizim');

      const cizimde = await baslat(id, ie1);
      assert.equal(cizimde.durum, 409, 'onay yalnız kendi maddesini açar');
      assert.match(cizimde.govde.mesaj, /Çizim revizyonu/);
      assert.equal((await onayla({ madde: 'cizim', gerekce: 'Müşteri eski revizyonla onay verdi', sistemHali: 'eksik' })).durum, 200);
      assert.deepEqual(await o().vt.okumaTx((db) => elleOnayliMaddeler(db, [ie1])), new Map([[ie1, new Map([['cnc', 'P1'], ['cizim', '7@a']])]]), 'Arkon kapısı onaylanan sürümü okur');

      durumlar.set('cizim', { durum: 'suruyor', secildi: true, surum: '7@b' });
      assert.equal((await baslat(id, ie1)).durum, 409, 'onaydan sonra yeni revizyon yayınlandı: onay geçmez (Atölye, 2893)');
      assert.equal((await oku(id)).adimlar[0]?.maddeler.find((m) => m.madde === 'cizim')?.hal, 'eksik');
      durumlar.set('cizim', { durum: 'suruyor', secildi: true, surum: '7@a' });

      for (const kisi of ['operator', 'kalite']) {
        assert.equal((await istek(kisi, 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/hazirlik-onay-kaldir`, { madde: 'cnc' })).durum, 403, `${kisi} onay kaldırmaz`);
      }
      const kaldir = await istek<AdimDurumuCevabi>('planlama_proje', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/hazirlik-onay-kaldir`, { madde: 'cnc' });
      assert.equal(kaldir.durum, 200, JSON.stringify(kaldir.govde));
      assert.equal(kaldir.govde.adimlar[0]?.maddeler.find((m) => m.madde === 'cnc')?.hal, 'eksik', 'onay kalkınca yeniden eksik');
      assert.equal((await istek('planlama_proje', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/hazirlik-onay-kaldir`, { madde: 'cnc' })).durum, 409, 'açık onay yok');
      assert.equal((await baslat(id, ie1)).durum, 409);
      assert.equal((await onayla({ madde: 'cnc', gerekce: 'Yeniden denendi', sistemHali: 'eksik' })).durum, 200);
      const basladi = await baslat(id, ie1);
      assert.equal(basladi.durum, 200, JSON.stringify(basladi.govde));
      assert.equal((await oku(id)).adimlar[0]?.sistemStatusu, 'uretimde');
      await assert.rejects(o().sahip.sorgu("UPDATE uretim_emirleri_hazirlik_onayi SET gerekce = 'x'"), /yalnız ekleme/);
    } finally {
      for (const [m, c] of onceki) hazirlikCozucusuKaydet(m, c);
    }
  });

  test('uyaran maddede gerekçe gerekmez; biten ya da iptal emirde yazılmaz', async () => {
    const { id, ie } = await ac();
    const [ie1 = 0] = ie;
    const onceki = hazirlikCozucusuKaydet('malzeme', async (_db, idler) => new Map(idler.map((x) => [x, { durum: 'yok' as const, secildi: true }])));
    try {
      const r = await istek<AdimDurumuCevabi>('planlama_proje', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/hazirlik-onayla`, { madde: 'malzeme', gerekce: null, sistemHali: 'eksik' });
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
      // Güncel sistem statüsüyle gönderilir: 409 yalnız kapalı emir korumasından gelebilir.
      const sistemStatusu = r.govde.adimlar[0]?.sistemStatusu;
      assert.equal(sistemStatusu, 'baslayabilir');
      await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [id]);
      const kapali = await istek<Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/statu-yaz`, { statu: 'talep', not: null, sistemStatusu });
      assert.deepEqual([kapali.durum, kapali.govde.mesaj], [409, ADIM_KAPALI_EMIR]);
      const onayKapali = await istek<Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/hazirlik-onay-kaldir`, { madde: 'malzeme' });
      assert.deepEqual([onayKapali.durum, onayKapali.govde.mesaj], [409, ADIM_KAPALI_EMIR]);
    } finally {
      hazirlikCozucusuKaydet('malzeme', onceki);
    }
  });

  test('D2: girdisine açık talep olan adım "talep", fason talebi bekleyen adım "talep"; terminal no ve termini okur, fiyat yok', async () => {
    const { id, ie } = await ac();
    const [ie1 = 0, ie2 = 0] = ie;
    await o().sahip.sorgu('INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar) VALUES ($1, $2, 2)', [ie1, urunNo]);
    const cagri: [number[], number[]][] = [];
    const satirlar: EmirTedarikSatiri[] = [
      { uretimEmriId: id, isEmriId: null, malzemeNo: urunNo, asama: 'talep', talepNo: 'ST-2099-001', siparisNo: null, termin: null },
      { uretimEmriId: id, isEmriId: null, malzemeNo: urunNo, asama: 'siparis', talepNo: 'ST-2099-002', siparisNo: 'SP-2099-001', termin: '2099-03-01' },
      { uretimEmriId: id, isEmriId: null, malzemeNo: urunNo + 999_999, asama: 'talep', talepNo: 'ST-2099-003', siparisNo: null, termin: null },
      { uretimEmriId: null, isEmriId: ie2, malzemeNo: null, asama: 'talep', talepNo: 'ST-2099-004', siparisNo: null, termin: null },
    ];
    const oncekiTedarik = adimTedarikCozucusu(async (_db, emirler, isEmirleri) => { cagri.push([[...emirler], [...isEmirleri]]); return satirlar; });
    const oncekiMalzeme = hazirlikCozucusuKaydet('malzeme', async (_db, idler) => new Map(idler.filter((x) => x === ie1).map((x) => [x, { durum: 'yok' as const, secildi: true }])));
    try {
      const d = await oku(id);
      assert.deepEqual(cagri.at(-1), [[id], [ie1, ie2]]);
      assert.deepEqual(d.adimlar.map((a) => [a.opNo, a.sistemStatusu]), [[10, 'talep'], [20, 'talep']]);
      assert.deepEqual(d.adimlar[0]?.tedarik.map((x) => x.talepNo), ['ST-2099-001', 'ST-2099-002'], 'başka malzemenin talebi adıma eşlenmez');
      assert.deepEqual(d.adimlar[0]?.nedenler, ['Malzeme eksik', 'Talep ST-2099-001 siparişe dönmedi', 'Sipariş SP-2099-001 bekleniyor (termin 2099-03-01)']);
      assert.deepEqual(d.adimlar[1]?.tedarik, [{ asama: 'talep', fason: true, talepNo: 'ST-2099-004', siparisNo: null, termin: null }]);
      const t = await istek<AdimDurumuTerminalCevabi>('operator', 'GET', `/adimli-emirler/${id}/adim-durumu/terminal`);
      assert.equal(t.durum, 200, JSON.stringify(t.govde));
      const terminal = adimDurumuTerminalCevabi.parse(t.govde);
      assert.deepEqual(terminal.adimlar[0]?.tedarik.map((x) => [x.talepNo, x.siparisNo, x.termin]), [['ST-2099-001', null, null], ['ST-2099-002', 'SP-2099-001', '2099-03-01']]);
      assert.equal(/fiyat|tutar|tedarikci/i.test(JSON.stringify(t.govde)), false, 'terminalde fiyat ve tedarikçi yok');

      // Atölye N1: malzeme yerindeyken açık talep ayrıntıda görünür, terminalde görünmez.
      hazirlikCozucusuKaydet('malzeme', async (_db, idler) => new Map(idler.map((x) => [x, { durum: 'tamam' as const, secildi: true }])));
      assert.deepEqual((await oku(id)).adimlar.map((a) => [a.sistemStatusu, a.tedarik.length]), [['baslayabilir', 2], ['talep', 1]]);
      const malzemeli = adimDurumuTerminalCevabi.parse((await istek('operator', 'GET', `/adimli-emirler/${id}/adim-durumu/terminal`)).govde);
      assert.deepEqual(malzemeli.adimlar.map((a) => [a.statu, a.tedarik.length]), [['baslayabilir', 0], ['talep', 1]]);
      hazirlikCozucusuKaydet('malzeme', async (_db, idler) => new Map(idler.filter((x) => x === ie1).map((x) => [x, { durum: 'yok' as const, secildi: true }])));

      satirlar.splice(0, 1);
      assert.equal((await oku(id)).adimlar[0]?.sistemStatusu, 'siparis', 'yalnız sipariş bekleniyor');
      satirlar.splice(0, 1);
      assert.equal((await oku(id)).adimlar[0]?.sistemStatusu, 'malzeme', 'açık tedarik yok');
      adimTedarikCozucusu(null);
      assert.deepEqual((await oku(id)).adimlar.map((a) => [a.sistemStatusu, a.tedarik]), [['malzeme', []], ['onceki', []]], 'satın alma bağlı değilse tedarik boş');
    } finally {
      adimTedarikCozucusu(oncekiTedarik);
      hazirlikCozucusuKaydet('malzeme', oncekiMalzeme);
    }
  });

  test('3050 a: beklemedeki emirde adımlar "Beklemede"; terminal nedeni okur; elle statü ve başlatma reddedilir; yetki emri yazabilende', async () => {
    const { id, ie } = await ac();
    const [ie1 = 0] = ie;
    const yetkisiz = await istek<Hata>('operator', 'POST', `/uretim-emirleri/${id}/beklet`, { neden: 'malzeme' });
    assert.equal(yetkisiz.durum, 403);
    const b = await istek('planlama_proje', 'POST', `/uretim-emirleri/${id}/beklet`, { neden: 'malzeme', not: 'Deneme notu' });
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const d = await oku(id);
    assert.equal(d.durum, 'planli', 'emrin durumu değişmez');
    assert.deepEqual(d.adimlar.map((a) => a.sistemStatusu), ['beklemede', 'beklemede']);
    assert.equal(d.adimlar[0]?.nedenler[0], 'Emir beklemede: Malzeme bekleniyor');
    const t = await istek<AdimDurumuTerminalCevabi>('operator', 'GET', `/adimli-emirler/${id}/adim-durumu/terminal`);
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const terminal = adimDurumuTerminalCevabi.parse(t.govde);
    assert.equal(terminal.bekletme, 'Malzeme bekleniyor');
    assert.deepEqual(terminal.adimlar.map((a) => a.statu), ['beklemede', 'beklemede']);
    const elle = await istek<Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/statu-yaz`, { statu: 'talep', not: null, sistemStatusu: 'beklemede' });
    assert.deepEqual([elle.durum, elle.govde.mesaj], [409, EMIR_BEKLEMEDE_STATU]);
    const basla = await baslat(id, ie1);
    assert.deepEqual([basla.durum, basla.govde.mesaj], [409, EMIR_BEKLEMEDE]);
    const k = await istek('planlama_proje', 'POST', `/uretim-emirleri/${id}/bekletme-kaldir`);
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    assert.notEqual((await oku(id)).adimlar[0]?.sistemStatusu, 'beklemede');
    const t2 = adimDurumuTerminalCevabi.parse((await istek('operator', 'GET', `/adimli-emirler/${id}/adim-durumu/terminal`)).govde);
    assert.equal(t2.bekletme, null);
    assert.equal((await baslat(id, ie1)).durum, 200);
  });

  test('isEmriKilitle yalnız emrin kendi iş emrini bulur', async () => {
    const a = await ac();
    const b = await ac();
    const [a1 = 0] = a.ie;
    const [b1 = 0] = b.ie;
    assert.equal(await o().vt.tx((db) => isEmriKilitle(db, a1, a.id)), true);
    assert.equal(await o().vt.tx((db) => isEmriKilitle(db, b1, a.id)), false, 'başka emrin iş emri');
    assert.equal(await o().vt.tx((db) => isEmriKilitle(db, 2_000_000_000, a.id)), false);
  });
});
