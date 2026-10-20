import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { adimliEmirCevabi, fasonFirmalariCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimliEmirAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { planlanacakIsEmirleri, uretimEmriAc } from './disari.ts';
import type { FasonTahmini, IsEmriGirdisi } from './disari.ts';
import {
  URETIM_YERI_BASLAMIS, URETIM_YERI_FASON_EKSIK, URETIM_YERI_FASON_HAREKETI, URETIM_YERI_IC_EKSIK, FASON_VARSAYILAN_GUN, fasonBeklemesi, uretimYeriIhlali,
} from './kurallar.ts';

// UE-URY: açılmış emirde başlamamış adım içeriye ya da fasona alınır; rota değişmez, kim ve ne zaman kaydedilir. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

describe('UE-URY kuralı (saf)', () => {
  const bekleyen = { durum: 'bekliyor' as const, fasonHareketiVar: false };
  test('izinli: bekleyen adım firmalı ve terminli fasona, firmasız ve terminsiz içeriye alınır', () => {
    assert.equal(uretimYeriIhlali(bekleyen, { yer: 'fason', firmaId: 4, terminGun: 3 }), null);
    assert.equal(uretimYeriIhlali(bekleyen, { yer: 'ic', firmaId: null, terminGun: null }), null);
    // Termin isteğe bağlı (kullanıcı kararı): firmasız fason reddedilir, terminsiz fason geçer; girilen termin 1-365 olmalı.
    assert.equal(uretimYeriIhlali(bekleyen, { yer: 'fason', firmaId: 4, terminGun: null }), null);
    assert.equal(uretimYeriIhlali(bekleyen, { yer: 'fason', firmaId: 4, terminGun: 0 }), URETIM_YERI_FASON_EKSIK);
  });
  test('reddedilen: başlamış ya da bitmiş adım, fasona gönderimi olan adım, eksik ya da fazla alan', () => {
    assert.equal(uretimYeriIhlali({ durum: 'calisiyor', fasonHareketiVar: false }, { yer: 'ic', firmaId: null, terminGun: null }), URETIM_YERI_BASLAMIS);
    assert.equal(uretimYeriIhlali({ durum: 'tamam', fasonHareketiVar: false }, { yer: 'fason', firmaId: 4, terminGun: 3 }), URETIM_YERI_BASLAMIS);
    assert.equal(uretimYeriIhlali({ durum: 'bekliyor', fasonHareketiVar: true }, { yer: 'ic', firmaId: null, terminGun: null }), URETIM_YERI_FASON_HAREKETI);
    assert.equal(uretimYeriIhlali(bekleyen, { yer: 'fason', firmaId: null, terminGun: 3 }), URETIM_YERI_FASON_EKSIK);
    assert.equal(uretimYeriIhlali(bekleyen, { yer: 'ic', firmaId: 4, terminGun: null }), URETIM_YERI_IC_EKSIK);
  });
  test('plan beklemesi: adımın hemen önündeki bitmemiş fason adımların süresi toplanır (termin, yoksa tahmin, yoksa 7 gün); araya iç adım girince sayım durur', () => {
    const x = (sira: number, fasonFirmaId: number | null, terminGun: number | null, durum = 'bekliyor') => ({ sira, fasonFirmaId, terminGun, durum });
    const adimlar = [x(1, 7, 9), x(2, null, null), x(3, 7, 2), x(4, 8, null), x(5, 7, 3, 'tamam'), x(6, 8, 4), x(7, null, null)];
    assert.equal(fasonBeklemesi(adimlar, 7), 4 + FASON_VARSAYILAN_GUN + 2);
    // Tahmin yalnız termini girilmemiş adıma uygulanır; tahmin de yoksa varsayılan.
    assert.equal(fasonBeklemesi(adimlar, 7, (f) => (f.fasonFirmaId === 8 ? 3.5 : null)), 4 + 3.5 + 2);
    assert.equal(fasonBeklemesi(adimlar, 7, () => null), 4 + FASON_VARSAYILAN_GUN + 2);
    assert.equal(fasonBeklemesi(adimlar, 2), 9);
    assert.equal(fasonBeklemesi(adimlar, 1), 0);
  });
  test('plan beklemesi: gönderilmiş fason adımda termin ilk gidişten sayılır; geçen gün düşülür, termini geçen beklemez', () => {
    // Yazılım değerlendirmesi P6: termin 7 gün, parça 6 gün önce gitti; sonraki adım şimdi + 7 gün bekliyordu, doğrusu 1 gün.
    const simdi = Date.parse('2026-10-17T12:00:00Z');
    const gitti = (gunOnce: number) => new Date(simdi - gunOnce * 86_400_000).toISOString();
    const x = (sira: number, terminGun: number | null, baslama: string | null) => ({ sira, fasonFirmaId: 7, terminGun, durum: baslama ? 'calisiyor' : 'bekliyor', baslama });
    assert.equal(fasonBeklemesi([x(1, 7, gitti(6)), { sira: 2, fasonFirmaId: null, terminGun: null, durum: 'bekliyor' }], 2, undefined, simdi), 1);
    assert.equal(fasonBeklemesi([x(1, 7, gitti(9))], 2, undefined, simdi), 0);
    assert.equal(fasonBeklemesi([x(1, 7, gitti(6)), x(2, 3, null)], 3, undefined, simdi), 1 + 3, 'gönderilmemiş fason tam sayılır');
    assert.equal(fasonBeklemesi([x(1, null, gitti(2))], 2, undefined, simdi), FASON_VARSAYILAN_GUN - 2, 'termin yoksa varsayılandan düşülür');
    assert.equal(fasonBeklemesi([x(1, 7, gitti(6))], 2), 7, 'şimdi verilmezse düşülmez');
  });
});

describe('UE-URY emirde adımın üretim yeri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  let tipId = 0;
  let varsayilanIstasyon = 0;
  let firmaId = 0;
  let fasonOlmayanFirmaId = 0;
  let urunNo = 0;
  // Emrin kaynak rota revizyonu gerçek satırdır (278 a).
  let rev = 0;
  let sayac = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown, istekKimligi?: string): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '' };
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

  async function istasyonKur(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`URYM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`URYI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]);
    if (!ist) throw new Error('istasyon kurulamadı');
    // UE20: başlatan istasyonda yetkin olmalı; testin kişileri her yeni istasyonda yetkindir.
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist.id]);
    return ist.id;
  }
  async function makineKur(istasyonId: number): Promise<number> {
    sayac += 1;
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`URYK${sayac}`, 'Tezgah', istasyonId]);
    if (!m) throw new Error('makine kurulamadı');
    return m.id;
  }

  const adim = (sira: number, kaynak: IsEmriGirdisi['kaynak']): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak,
    ayarSuresiDk: kaynak?.tur === 'fason' ? null : '10.00', birimSureDk: kaynak?.tur === 'fason' ? null : '1.5000',
    terminGun: kaynak?.tur === 'fason' ? 5 : null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = async (isEmirleri: IsEmriGirdisi[]): Promise<number> => {
    const k = kullanicilar.get('planlama_proje');
    if (k === undefined) throw new Error('kişi yok');
    return (await o().vt.tx((db) => uretimEmriAc(db, k, { projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri }))).uretimEmriId;
  };
  const ayrinti = async (id: number): Promise<AdimliEmirAyrintisi> => {
    const c = await istek<{ emir: AdimliEmirAyrintisi }>('planlama_proje', 'GET', `/adimli-emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return adimliEmirCevabi.parse(c.govde).emir;
  };
  const yerYaz = (kisi: string, id: number, govde: Record<string, unknown>) =>
    istek<{ emir: AdimliEmirAyrintisi } & Hata>(kisi, 'POST', `/adimli-emirler/${id}/uretim-yeri`, govde);

  before(async () => {
    ortam = await testVeritabaniKur('uretim_yeri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.YER', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
    varsayilanIstasyon = await istasyonKur();
    tipId = (await ortam.sahip.tek<{ id: number }>(
      `INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup, varsayilan_ayar_dk, varsayilan_birim_dk, varsayilan_istasyon_id)
       VALUES ('URY-T', 'Deneme tipi', 'TAL', 7, 2, $1) RETURNING id`, [varsayilanIstasyon]))!.id;
    firmaId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fason', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    fasonOlmayanFirmaId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Tedarik', 'tedarikci', $1, false) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('URY-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ury-1', 'mamul', 'URY-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'ury-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', $3, 'iptal', $2, $2, now()) RETURNING id", [urunNo, yoneticiId, 'ZZ']))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli: içerideki adım fasona alınır (istasyon ve süre kalkar, plandan düşer); geri alınınca makine, istasyon ve süreler döner; kim ve ne zaman görünür', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const id = await ac([adim(1, { tur: 'makine', id: makine }), adim(2, { tur: 'makine', id: makine }), adim(3, { tur: 'makine', id: makine })]);
    let e = await ayrinti(id);
    assert.equal(e.isEmirleri[1]?.uretimYeriDegisimi, null);
    const c = await yerYaz('planlama_proje', id, { opNo: 20, yer: 'fason', firmaId, terminGun: 4, surum: e.surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    e = c.govde.emir;
    const op20 = e.isEmirleri[1];
    assert.deepEqual([op20?.kaynak?.tur, op20?.kaynak?.id, op20?.istasyon, op20?.ayarSuresiDk, op20?.birimSureDk, op20?.terminGun], ['fason', firmaId, null, null, null, 4]);
    assert.equal(op20?.uretimYeriDegisimi?.yer, 'fason');
    assert.equal(op20?.uretimYeriDegisimi?.kisi.ad, 'Deneme planlama_proje');
    assert.ok(op20?.uretimYeriDegisimi && Date.parse(op20.uretimYeriDegisimi.zaman) > 0);
    assert.equal(e.isEmirleri[0]?.kaynak?.tur, 'makine', 'öteki adım değişmez');
    const planda = (await planlanacakIsEmirleri(o().vt)).filter((i) => i.uretimEmriId === id).map((i) => [i.opNo, i.fasonBekleGun]);
    assert.deepEqual(planda, [[10, 0], [30, 4]], 'fason adım atölye kapasitesinden düşer; sonraki adım termin kadar bekler');

    const geri = await yerYaz('planlama_proje', id, { opNo: 20, yer: 'ic', firmaId: null, terminGun: null, surum: e.surum });
    assert.equal(geri.durum, 200, JSON.stringify(geri.govde));
    const g20 = geri.govde.emir.isEmirleri[1];
    assert.deepEqual([g20?.kaynak?.tur, g20?.kaynak?.id, g20?.istasyon?.id, g20?.ayarSuresiDk, g20?.birimSureDk, g20?.terminGun], ['makine', makine, ist, '10.00', '1.5000', null]);
    assert.equal(g20?.uretimYeriDegisimi?.yer, 'ic');
    const kayit = await o().sahip.sorgu<{ n: string }>('SELECT count(*)::text AS n FROM uretim_emirleri_uretim_yeri_degisimi WHERE is_emri_id = $1', [g20?.id]);
    assert.equal(kayit[0]?.n, '2', 'her değişim ayrı satır');
  });

  test('CA-2: termini girilmemiş fason adımın süresi verilen tahminden (satın alma geçmişi) gelir; tahmin yoksa 7 gün', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const id = await ac([adim(1, { tur: 'makine', id: makine }), adim(2, { tur: 'makine', id: makine }), adim(3, { tur: 'makine', id: makine })]);
    const e = await ayrinti(id);
    const c = await yerYaz('planlama_proje', id, { opNo: 20, yer: 'fason', firmaId, terminGun: null, surum: e.surum });
    assert.equal(c.durum, 200, JSON.stringify(c));
    const bekleme = async (fasonTahmini?: FasonTahmini) =>
      (await planlanacakIsEmirleri(o().vt, fasonTahmini ? { fasonTahmini } : {})).filter((i) => i.uretimEmriId === id).map((i) => [i.opNo, i.fasonBekleGun]);
    assert.deepEqual(await bekleme(), [[10, 0], [30, 7]], 'tahmin verilmezse varsayılan');
    const sorulan: unknown[] = [];
    assert.deepEqual(await bekleme(async (q) => { sorulan.push(...q); return q.map(() => 3); }), [[10, 0], [30, 3]]);
    assert.deepEqual(sorulan.filter((x) => (x as { firmaId: number }).firmaId === firmaId).map((x) => {
      const y = x as { malzemeNo: number; adet: number; operasyonTipiId: number | null };
      return [y.malzemeNo, y.adet, typeof y.operasyonTipiId];
    }), [[urunNo, e.adet, 'number']], 'malzeme, operasyon ve adetle sorulur');
    assert.deepEqual(await bekleme(async (q) => q.map(() => null)), [[10, 0], [30, 7]], 'veri yoksa 7 gün');
  });

  test('izinli: termin girilmeden fasona alınır (kullanıcı kararı "İsteğe bağlı"); defter terminsiz kaydı tutar, sonraki adım 7 gün bekler', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const id = await ac([adim(1, { tur: 'makine', id: makine }), adim(2, { tur: 'makine', id: makine })]);
    const e = await ayrinti(id);
    const c = await yerYaz('planlama_proje', id, { opNo: 10, yer: 'fason', firmaId, terminGun: null, surum: e.surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual([c.govde.emir.isEmirleri[0]?.kaynak?.tur, c.govde.emir.isEmirleri[0]?.terminGun], ['fason', null]);
    const planda = (await planlanacakIsEmirleri(o().vt)).filter((i) => i.uretimEmriId === id).map((i) => [i.opNo, i.fasonBekleGun]);
    assert.deepEqual(planda, [[20, 7]]);
    const defter = await o().sahip.sorgu<{ termin: number | null }>(
      'SELECT yeni_termin_gun AS termin FROM uretim_emirleri_uretim_yeri_degisimi WHERE is_emri_id = $1', [c.govde.emir.isEmirleri[0]?.id]);
    assert.deepEqual(defter, [{ termin: null }]);
    await assert.rejects(o().sahip.sorgu(
      'INSERT INTO uretim_emirleri_uretim_yeri_degisimi (is_emri_id, yeni_termin_gun, kisi_id, zaman) VALUES ($1, 5, $2, now())',
      [c.govde.emir.isEmirleri[0]?.id, yoneticiId]), /uretim_emirleri_uretim_yeri_degisimi_termin_fasonda/);
  });

  test('izinli: rotadan fason gelen adım içeri alınınca operasyon tipinin varsayılan istasyonu ve süreleri yazılır; ilk adımsa emir o istasyona düşer', async () => {
    const id = await ac([adim(1, { tur: 'fason', id: firmaId })]);
    const e = await ayrinti(id);
    const c = await yerYaz('planlama_proje', id, { opNo: 10, yer: 'ic', firmaId: null, terminGun: null, surum: e.surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const a = c.govde.emir.isEmirleri[0];
    assert.deepEqual([a?.kaynak, a?.istasyon?.id, a?.ayarSuresiDk, a?.birimSureDk, a?.terminGun], [null, varsayilanIstasyon, '7.00', '2.0000', null]);
    assert.equal(c.govde.emir.siradaki?.istasyon?.id, varsayilanIstasyon);
  });

  test('reddedilen: operatör yetkisiz, eski sürüm, fason işaretsiz firma, eksik ya da fazla alan, başlamış adım', async () => {
    const ist = await istasyonKur();
    const makine = await makineKur(ist);
    const id = await ac([adim(1, { tur: 'makine', id: makine }), adim(2, { tur: 'makine', id: makine })]);
    const e = await ayrinti(id);
    const fasona = { opNo: 10, yer: 'fason', firmaId, terminGun: 3, surum: e.surum };
    assert.equal((await yerYaz('operator', id, fasona)).durum, 403);
    assert.equal((await yerYaz('planlama_proje', id, { ...fasona, surum: e.surum + 7 })).durum, 409, 'eski sürüm');
    assert.equal((await yerYaz('planlama_proje', id, { ...fasona, firmaId: fasonOlmayanFirmaId })).govde.mesaj, 'Fason firma bulunamadı, pasif ya da fason işaretli değil.');
    assert.equal((await yerYaz('planlama_proje', id, { ...fasona, firmaId: null })).govde.mesaj, URETIM_YERI_FASON_EKSIK);
    assert.equal((await yerYaz('planlama_proje', id, { ...fasona, yer: 'ic' })).govde.mesaj, URETIM_YERI_IC_EKSIK);
    assert.equal((await yerYaz('planlama_proje', id, { ...fasona, terminGun: 400 })).durum, 400, 'termin 1-365');
    const basla = await istek<Hata>('operator', 'POST', `/uretim-emirleri/${id}/baslat`, undefined, randomUUID());
    assert.equal(basla.durum, 200, JSON.stringify(basla.govde));
    const sonra = await ayrinti(id);
    const r = await yerYaz('planlama_proje', id, { ...fasona, surum: sonra.surum });
    assert.deepEqual([r.durum, r.govde.mesaj], [409, URETIM_YERI_BASLAMIS]);
    assert.equal((await ayrinti(id)).isEmirleri[0]?.kaynak?.tur, 'makine', 'reddedilen istek bir şey değiştirmez');
    // İzinli karşılık: aynı emirde başlamamış adım fasona alınır.
    assert.equal((await yerYaz('planlama_proje', id, { ...fasona, opNo: 20, surum: sonra.surum })).durum, 200);
  });

  test('fason firma listesi emri yazana açılır, operatöre kapalı; yalnız fason işaretli aktif firmalar', async () => {
    const c = await istek<unknown>('planlama_proje', 'GET', '/adimli-emirler/fason-firmalari');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const ids = fasonFirmalariCevabi.parse(c.govde).firmalar.map((f) => f.id);
    assert.ok(ids.includes(firmaId));
    assert.ok(!ids.includes(fasonOlmayanFirmaId));
    assert.equal((await istek('operator', 'GET', '/adimli-emirler/fason-firmalari')).durum, 403);
  });

  test('değişim defteri yalnız eklenir', async () => {
    await assert.rejects(o().sahip.sorgu('DELETE FROM uretim_emirleri_uretim_yeri_degisimi'));
  });
});
