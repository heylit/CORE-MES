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
import { HAZIRLIK_MADDELERI, adimDurumuCevabi, adimMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimDurumuCevabi, AdimMatrisiCevabi, HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { bekleyeniSil } from './is-emri-servis.ts';
import { hazirlik, hazirlikCozucusuKaydet } from './hazirlik.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';
import { hazirlikSablonuOzel, hazirlikSablonuOzelYaz, hazirlikSablonuYaz, sablonGerekmezMaddeleri } from './hazirlik-sablonu.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

// 3741: operasyon (iş emri) düzeyinde şablon farkı ve şablon dışı madde. Adlar uydurmadır.
describe('uretim-emirleri OP düzeyinde hazırlık farkı (3741, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let makineId = 0;
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
  const adim = (sira: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = async (): Promise<{ id: number; ie: [number, number] }> => {
    const r = await o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
      malzemeNo: urunNo, adet: 4, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: [adim(1), adim(2)], projeId,
    }));
    return { id: r.uretimEmriId, ie: [r.isEmriIdleri[0] ?? 0, r.isEmriIdleri[1] ?? 0] };
  };
  const matris = async (kisi = 'planlama_proje'): Promise<AdimMatrisiCevabi> => {
    const c = await istek<AdimMatrisiCevabi>(kisi, 'GET', '/adimli-emirler/adim-matrisi');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return adimMatrisiCevabi.parse(c.govde);
  };
  const fark = (id: number, ie: number, govde: unknown, kisi = 'mudur') => istek<AdimDurumuCevabi & Hata>(kisi, 'POST', `/adimli-emirler/${id}/is-emirleri/${ie}/sablon-farki`, govde);
  const don = (id: number, ie: number, madde: string, kisi = 'mudur') => istek<AdimDurumuCevabi & Hata>(kisi, 'POST', `/adimli-emirler/${id}/is-emirleri/${ie}/sablon-farki-kaldir`, { madde });
  const kapali = async (ie: number[]) => o().vt.okumaTx((db) => sablonGerekmezMaddeleri(db, ie));

  const gercekCozuculer = new Map<HazirlikMaddesi, HazirlikCozucusu | null>();
  before(async () => {
    for (const m of HAZIRLIK_MADDELERI) gercekCozuculer.set(m, hazirlikCozucusuKaydet(m, null));
    ortam = await testVeritabaniKur('uretim_hazirlik_op');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.OPF', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const r of ['planlama_proje', 'operator', 'kalite', 'mudur']) await kisiEkle(r, r);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('OPF-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('OPF-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('opf-dnm-1', 'mamul', 'OPF-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'opf-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('OPFM', 'Deneme Merkezi') RETURNING id");
    const ist = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('OPFI', 'Deneme', $1) RETURNING id", [im?.id]))!.id;
    await ortam.sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi ON CONFLICT DO NOTHING', [ist]);
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('OPF1', 'Tezgah', $1) RETURNING id", [ist]))!.id;
    // Tür şablonu: aparat kapalı (gerekmez), ölçü aleti açık.
    await ortam.vt.tx((db) => hazirlikSablonuYaz(db, kim('mudur'), String(tipId), {
      satirlar: [{ madde: 'aparat', gerekli: false, rolId: null, gun: 0 }, { madde: 'olcu-aleti', gerekli: true, rolId: null, gun: 0 }], beklenenSurum: null, gerekce: null,
    }));
  });
  after(async () => {
    for (const [m, c] of gercekCozuculer) hazirlikCozucusuKaydet(m, c);
    await ortam?.kaldir();
  });

  test('OP farkı yalnız o OP\'yi değiştirir; emir ve tür aynı kalır; Şablona dön farkı kaldırır; iz kim, ne zaman, gerekçe', async () => {
    const { id, ie } = await ac();
    assert.ok((await kapali(ie)).get(ie[0])?.has('aparat'), 'tür şablonu aparatı kapatmış');
    assert.equal((await matris()).emirler.find((e) => e.emirId === id)?.adimlar[0]?.sablondanFark, 0);
    const c = await fark(id, ie[0], { madde: 'aparat', gerekli: true, gerekce: 'Bu OP aparatla çalışır' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const d = adimDurumuCevabi.parse(c.govde);
    assert.deepEqual(d.adimlar[0]?.sablonFarklari.map((x) => [x.madde, x.gerekli, x.kisiAdi, x.gerekce]), [['aparat', true, 'Deneme mudur', 'Bu OP aparatla çalışır']]);
    assert.ok(d.adimlar[0]?.sablonFarklari[0]?.an);
    assert.deepEqual(d.adimlar[1]?.sablonFarklari, []);
    const h = await kapali(ie);
    assert.equal(h.get(ie[0])?.has('aparat'), false, 'OP 1 aparatı gerekli sayar');
    assert.equal(h.get(ie[1])?.has('aparat'), true, 'OP 2 türün şablonunu izler');
    const emirFarki = await o().vt.okumaTx((db) => hazirlikSablonuOzel(db, id));
    assert.deepEqual(emirFarki.farklar, [], 'emir düzeyi fark listesine OP farkı karışmaz');
    assert.equal((await matris()).emirler.find((e) => e.emirId === id)?.adimlar[0]?.sablondanFark, 1);
    assert.equal((await matris()).emirler.find((e) => e.emirId === id)?.adimlar[1]?.sablondanFark, 0);
    const deftere = await o().sahip.sorgu<{ emri_id: number; is_emri_id: number | null; kisi_id: number; gerekce: string | null }>(
      'SELECT emri_id, is_emri_id, kisi_id, gerekce FROM uretim_emirleri_hazirlik_sablonu_ozel WHERE emri_id = $1', [id]);
    assert.deepEqual(deftere.map((x) => [x.is_emri_id, x.kisi_id, x.gerekce]), [[ie[0], kim('mudur').id, 'Bu OP aparatla çalışır']]);

    const geri = await don(id, ie[0], 'aparat');
    assert.equal(geri.durum, 200, JSON.stringify(geri.govde));
    assert.deepEqual(adimDurumuCevabi.parse(geri.govde).adimlar[0]?.sablonFarklari, []);
    assert.equal((await kapali(ie)).get(ie[0])?.has('aparat'), true, 'şablona dönüldü');
    assert.equal((await don(id, ie[0], 'aparat')).durum, 404, 'farkı olmayan maddede dönüş yazılmaz');
    const satir = await o().sahip.tek<{ say: number }>('SELECT count(*)::int AS say FROM uretim_emirleri_hazirlik_sablonu_ozel WHERE emri_id = $1', [id]);
    assert.equal(satir?.say, 2, 'defter yalnız eklenir: yaz ve sil satırı');
  });

  test('öncelik: OP farkı > emir farkı > tür şablonu', async () => {
    const { id, ie } = await ac();
    await o().vt.tx((db) => hazirlikSablonuOzelYaz(db, kim('mudur'), id, 'olcu-aleti', { gerekli: false, gerekce: 'Bu emirde ölçü aleti yok' }));
    let h = await kapali(ie);
    assert.deepEqual([h.get(ie[0])?.has('olcu-aleti'), h.get(ie[1])?.has('olcu-aleti')], [true, true], 'emir farkı iki OP\'yi de kapatır');
    assert.equal((await fark(id, ie[1], { madde: 'olcu-aleti', gerekli: true, gerekce: 'Son kontrol ölçü ister' })).durum, 200);
    h = await kapali(ie);
    assert.deepEqual([h.get(ie[0])?.has('olcu-aleti'), h.get(ie[1])?.has('olcu-aleti')], [true, false], 'OP farkı emir farkını geçer');
    assert.equal((await don(id, ie[1], 'olcu-aleti')).durum, 200);
    h = await kapali(ie);
    assert.equal(h.get(ie[1])?.has('olcu-aleti'), true, 'OP farkı kalkınca emir farkı geçerli');
  });

  test('durduran madde OP\'de kapatılamaz; gerekçe zorunlu; olmayan madde, başka emrin iş emri ve biten OP reddedilir', async () => {
    const { id, ie } = await ac();
    const diger = await ac();
    const durduran = await fark(id, ie[0], { madde: 'cnc', gerekli: false, gerekce: 'Programsız' });
    assert.equal(durduran.durum, 400, JSON.stringify(durduran.govde));
    assert.equal((await fark(id, ie[0], { madde: 'aparat', gerekli: true, gerekce: '  ' })).durum, 400, 'gerekçe boş olamaz');
    assert.equal((await fark(id, ie[0], { madde: 'aparat', gerekli: true })).durum, 400, 'gerekçe yok');
    assert.equal((await fark(id, ie[0], { madde: 'yok-madde', gerekli: false, gerekce: 'x' })).durum, 400, 'madde tanımı yok');
    assert.equal((await fark(id, diger.ie[0], { madde: 'aparat', gerekli: true, gerekce: 'x' })).durum, 404, 'iş emri bu emrin değil');
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 4 WHERE id = $1", [ie[1]]);
    assert.equal((await fark(id, ie[1], { madde: 'aparat', gerekli: true, gerekce: 'x' })).durum, 409, 'biten OP değişmez');
    const sayi = await o().sahip.tek<{ say: number }>('SELECT count(*)::int AS say FROM uretim_emirleri_hazirlik_sablonu_ozel WHERE emri_id = $1', [id]);
    assert.equal(sayi?.say, 0, 'reddedilen hiçbir şey yazmaz');
  });

  test('yetki: şablon yazma yetkisi olmayan yazamaz (kabul ve red birlikte); okuma yetkisiz değildir', async () => {
    const { id, ie } = await ac();
    const govde = { madde: 'aparat', gerekli: true, gerekce: 'Yetki denemesi' };
    for (const kisi of ['operator', 'kalite']) {
      assert.equal((await fark(id, ie[0], govde, kisi)).durum, 403, `${kisi} yazamaz`);
      assert.equal((await don(id, ie[0], 'aparat', kisi)).durum, 403, `${kisi} kaldıramaz`);
    }
    assert.ok(kim('mudur').islemler.includes('projeler.sablon-yaz'));
    const yz = await fark(id, ie[0], govde, 'mudur'); assert.equal(yz.durum, 200, JSON.stringify(yz.govde));
    assert.equal((await istek('operator', 'GET', `/adimli-emirler/${id}/adim-durumu`)).durum, 403, 'okuma yetkisi ayrıdır');
  });

  test('şablon dışı madde: liste-ekle ile OP\'ye eklenir, matriste farka girer, başlatmayı durdurmaz', async () => {
    const { id, ie } = await ac();
    // Çözücü kayıtlı olsun ki başlatma kapısı gerçekten sorulsun; ekli madde yalnız uyaran "talimat" maddesine girer.
    const onceki = hazirlikCozucusuKaydet('cnc', async (_db, idler) => new Map(idler.map((x) => [x, { durum: 'tamam', secildi: true } as const])));
    const oncekiTalimat = hazirlikCozucusuKaydet('talimat', gercekCozuculer.get('talimat') ?? null);
    try {
      const ekle = await istek<AdimDurumuCevabi & Hata>('mudur', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie[0]}/liste-ekle`, { ad: 'Özel pabuç kontrolü', asama: 'hazirlik' });
      assert.equal(ekle.durum, 200, JSON.stringify(ekle.govde));
      const madde = adimDurumuCevabi.parse(ekle.govde).adimlar[0]!.liste.at(-1)!;
      assert.deepEqual([madde.ad, madde.asama, madde.tamam, madde.eklenme !== null], ['Özel pabuç kontrolü', 'hazirlik', false, true]);
      assert.equal((await matris()).emirler.find((e) => e.emirId === id)?.adimlar[0]?.sablondanFark, 1, 'elle eklenen madde farka girer');
      const ozet = await o().vt.okumaTx((db) => hazirlik(db, id));
      assert.equal(ozet.isEmirleri[0]?.maddeler.find((x) => x.madde === 'talimat')?.durum, 'eksik', 'hazırlık özetinde talimat maddesi eksik görünür');
      // Başlatma kapısı değişmez: elle madde tamamlanmadan da OP başlar (talimat maddesi uyarır, durdurmaz).
      try {
        await o().vt.tx((db) => emirBaslat(db, kim('operator'), id, undefined, undefined, ie[0]));
      } catch (h) {
        assert.fail(`başlatma elle maddeyle durmamalı: ${h instanceof UygulamaHatasi ? h.message : String(h)}`);
      }
      const kaldir = await istek<AdimDurumuCevabi & Hata>('mudur', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie[0]}/liste-kaldir`, { adimId: madde.adimId });
      assert.equal(kaldir.durum, 200, JSON.stringify(kaldir.govde));
      assert.equal((await matris()).emirler.find((e) => e.emirId === id)?.adimlar[0]?.sablondanFark, 0, 'kaldırılan madde farktan düşer');
    } finally { hazirlikCozucusuKaydet('cnc', onceki); hazirlikCozucusuKaydet('talimat', oncekiTalimat); }
  });

  test('göç: var olan emir düzeyi satır is_emri_id boş kalır ve emir düzeyi olarak okunur', async () => {
    const { id, ie } = await ac();
    const kisiId = kim('mudur').id;
    await o().sahip.sorgu(
      "INSERT INTO uretim_emirleri_hazirlik_sablonu_ozel (emri_id, madde, olay, gerekli, kisi_id, gerekce) VALUES ($1, 'olcu-aleti', 'yaz', false, $2, 'eski kayıt')", [id, kisiId]);
    const eski = await o().sahip.tek<{ is_emri_id: number | null }>('SELECT is_emri_id FROM uretim_emirleri_hazirlik_sablonu_ozel WHERE emri_id = $1', [id]);
    assert.equal(eski?.is_emri_id, null);
    const h = await kapali(ie);
    assert.deepEqual([h.get(ie[0])?.has('olcu-aleti'), h.get(ie[1])?.has('olcu-aleti')], [true, true], 'eski satır bütün OP\'lerde geçerli');
  });

  // Risk R1: FK yok; fark almış bekleyen OP silinebilir, defter satırı kalır ama okunmaz.
  test('fark almış bekleyen OP silinebilir; silindikten sonra okuma etkilenmez', async () => {
    const { id, ie } = await ac();
    assert.equal((await fark(id, ie[0], { madde: 'olcu-aleti', gerekli: false, gerekce: 'Birinci OP ölçüsüz' })).durum, 200);
    assert.equal((await fark(id, ie[1], { madde: 'aparat', gerekli: true, gerekce: 'İkinci OP aparatlı' })).durum, 200);
    await o().vt.tx((db) => bekleyeniSil(db, ie[1]));
    const var_ = await o().sahip.tek<{ say: number }>('SELECT count(*)::int AS say FROM uretim_emirleri_is_emri WHERE id = $1', [ie[1]]);
    assert.equal(var_?.say, 0, 'OP silindi');
    const defter = await o().sahip.tek<{ say: number }>('SELECT count(*)::int AS say FROM uretim_emirleri_hazirlik_sablonu_ozel WHERE is_emri_id = $1', [ie[1]]);
    assert.equal(defter?.say, 1, 'defter yalnız eklenir, satır kalır');
    const d = await istek<AdimDurumuCevabi>('planlama_proje', 'GET', `/adimli-emirler/${id}/adim-durumu`);
    assert.equal(d.durum, 200);
    const ad = adimDurumuCevabi.parse(d.govde);
    assert.deepEqual(ad.adimlar.map((a) => a.isEmriId), [ie[0]]);
    assert.deepEqual(ad.adimlar[0]?.sablonFarklari.map((x) => x.madde), ['olcu-aleti'], 'kalan OP farkı aynen okunur');
    const h = await kapali([ie[0]]);
    assert.equal(h.get(ie[0])?.has('olcu-aleti'), true);
    const m = (await matris()).emirler.find((e) => e.emirId === id);
    assert.deepEqual(m?.adimlar.map((a) => [a.isEmriId, a.sablondanFark]), [[ie[0], 1]]);
  });
});
