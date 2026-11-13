import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { arsivOnizlemeCevabi, arsiveAlCevabi, hataliCevabi, kapanisCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { ArsivOnizlemeCevabi, KapanisCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, emirIptalDinle, emirSayim, fasonDonusuKaydet, kararliSayimiSonuclandir, planlanacakIsEmirleri, uretimEmriAc } from './disari.ts';
import { hataliKarariVer, hataliKaydi, hataliKayitlari } from './hatali-parca.ts';
import { fasonGidis } from './is-emri-servis.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { ACIK_DEGIL, ARSIV_BASLAMAMIS, ARSIV_FASONDA, ARSIV_HATALI_ACIK, ARSIV_GIRIS, ARSIV_YARI_MAMUL, HATALI_ARSIVDE_REWORK } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('2721 başlamış emri arşive alma (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yonetici: Kullanici;
  let firma = 0;
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
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);


  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  // Roller K2'de tanımlanır; burada yalnız işlemleriyle deneme rolü kurulur.
  async function kisiEkle(kullaniciAdi: string, islemler: readonly string[], rolKodu?: string): Promise<void> {
    const rol = rolKodu
      ? await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])
      : await o().sahip.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`kp_${kullaniciAdi}`]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    for (const islem of islemler) await o().sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, islem]);
    const k = await tx(async (db) => {
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

  async function makine(tip = 'talasli'): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`ARM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ($1, $2, $3, $4) RETURNING id', [`ARI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id, tip]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi ON CONFLICT DO NOTHING', [ist]);
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`ARMK${sayac}`, 'Tezgah', ist]))!.id;
  }

  const adim = (sira: number, m: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: m },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = async (adet: number, makineler: number[]): Promise<{ id: number; adimlar: number[] }> => {
    const r = await tx((db) => uretimEmriAc(db, kim('planlama'), {
      malzemeNo: urunNo, adet, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: makineler.map((m, i) => adim(i + 1, m)), projeId,
    }));
    return { id: r.uretimEmriId, adimlar: r.isEmriIdleri };
  };
  const op = (): Kullanici => kim('operator');


  const onizle = async (id: number, ad = 'planlama'): Promise<ArsivOnizlemeCevabi> => {
    const c = await istek(ad, 'GET', `/adimli-emirler/${id}/arsiv-onizleme`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return arsivOnizlemeCevabi.parse(c.govde);
  };
  const arsivle = (id: number, govde: Record<string, unknown>, ad = 'planlama'): Promise<Cevap<{ mesaj?: string }>> =>
    istek<{ mesaj?: string }>(ad, 'POST', `/adimli-emirler/${id}/arsive-al`, govde);
  const sayi = async (sql: string, id: number): Promise<number> => (await o().sahip.tek<{ n: number }>(sql, [id]))!.n;
  const acikKullanim = (id: number): Promise<number> =>
    sayi('SELECT count(*)::int AS n FROM uretim_emirleri_makine_kullanimi WHERE emir_id = $1 AND bitis IS NULL', id);
  const acikKatilim = (id: number): Promise<number> => sayi('SELECT count(*)::int AS n FROM uretim_emirleri_katilim WHERE emir_id = $1 AND cikis IS NULL', id);
  const sayimlar = (id: number): Promise<number> => sayi('SELECT count(*)::int AS n FROM uretim_sayimi WHERE emir_id = $1', id);
  // OP 10 başlamış, ilk parça sayılmış (karar bekliyor), OP 20 bekliyor.
  async function baslamisEmir(): Promise<number> {
    const { id } = await ac(5, [await makine(), await makine()]);
    await tx((db) => emirBaslat(db, op(), id));
    await tx((db) => emirSayim(db, op(), id, { tur: 'saglam', adet: 1 }));
    return id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('uretim_arsiv');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    firma = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.ARSIV', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await kisiEkle('planlama', [], 'planlama_proje');
    await kisiEkle('operator', [], 'operator');
    await kisiEkle('okuyucu', ['uretim-emirleri.kapanis-oku']);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('AR-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('AR-TK', 'Deneme takım kırılması', 900)");
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('AR-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ar-dnm-1', 'mamul', 'AR-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ar-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    await makine('kalite');
  });
  after(async () => {
    await ortam?.kaldir();
  });

  test('önizleme: çalışan adım ve operatörü, karar bekleyen, uyarı cümleleri; başlamamış emirde engel ve komut reddi', async () => {
    const id = await baslamisEmir();
    const p = await onizle(id);
    assert.equal(p.engel, null);
    assert.deepEqual(p.calisan, [{ opNo: 10, ad: 'Adım 1', operator: 'Deneme operator' }]);
    assert.deepEqual([p.saglam, p.hurda, p.kararBekleyen, p.hataliAcik, p.fasonda], [null, 0, 1, 0, []]);
    assert.equal(p.uyarilar[0], ARSIV_GIRIS);
    assert.equal(p.uyarilar.at(-1), ARSIV_YARI_MAMUL);
    assert.ok(p.uyarilar.some((u) => /OP 10 çalışıyor \(Deneme operator\)/.test(u)), JSON.stringify(p.uyarilar));
    const bos = await ac(2, [await makine()]);
    const pb = await onizle(bos.id);
    assert.equal(pb.engel, ARSIV_BASLAMAMIS);
    const r = await arsivle(bos.id, { surum: pb.surum, onay: true });
    assert.equal(r.durum, 409, JSON.stringify(r.govde));
    assert.equal(r.govde.mesaj, ARSIV_BASLAMAMIS);
  });

  test('gövde, sürüm ve yetki: onaysız 400, eski sürüm 409, operatör 403; hiçbiri emri değiştirmez', async () => {
    const id = await baslamisEmir();
    const { surum } = await onizle(id);
    assert.equal((await arsivle(id, { surum })).durum, 400);
    assert.equal((await arsivle(id, { surum: surum + 1, onay: true })).durum, 409);
    assert.equal((await arsivle(id, { surum, onay: true }, 'operator')).durum, 403);
    assert.equal((await istek('operator', 'GET', `/adimli-emirler/${id}/arsiv-onizleme`)).durum, 403);
    assert.equal(await acikKullanim(id), 1);
    assert.equal((await onizle(id)).surum, surum);
  });

  test('arşive alma: iş durur (kullanım, katılım kapanır, duraklat olayı), sayım kalır, emir iptal, iptal olayı yayılır, kapanış açık; plan ve terminal dışı', async () => {
    const id = await baslamisEmir();
    const once = await sayimlar(id);
    const olaylar: number[] = [];
    const birak = emirIptalDinle((_db, olay) => { olaylar.push(olay.uretimEmriId); return Promise.resolve(); });
    try {
      const { surum } = await onizle(id);
      const r = await arsivle(id, { surum, onay: true });
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
      const c = arsiveAlCevabi.parse(r.govde);
      assert.deepEqual([c.emir.id, c.emir.durum, c.emir.surum > surum], [id, 'iptal', true]);
    } finally {
      birak();
    }
    assert.deepEqual(olaylar, [id], 'stok rezerveyi ve depo isteklerini iptal olayından kaldırır');
    assert.deepEqual([await acikKullanim(id), await acikKatilim(id), await sayimlar(id)], [0, 0, once]);
    assert.equal(await sayi("SELECT count(*)::int AS n FROM uretim_olayi WHERE emir_id = $1 AND olay = 'duraklat'", id), 1);
    assert.equal(await sayi("SELECT count(*)::int AS n FROM uretim_olayi WHERE emir_id = $1 AND olay = 'durdur'", id), 0, 'duruş sayılmaz');
    const k = await istek('okuyucu', 'GET', `/adimli-emirler/${id}/kapanis`);
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    const kp: KapanisCevabi = kapanisCevabi.parse(k.govde);
    assert.equal(kp.maddeler.find((m) => m.madde === 'is-emirleri')?.durum, 'eksik');
    assert.equal((await tx((db) => planlanacakIsEmirleri(db))).some((i) => i.uretimEmriId === id), false, 'eksik iş ve plan hesabından düşer');
    await assert.rejects(tx((db) => emirSayim(db, op(), id, { tur: 'saglam', adet: 1 })), (h: unknown) => h instanceof UygulamaHatasi);
    const karar = await tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
    assert.equal(karar.adet, 1, 'kalite kararı arşivde de verilir');
    const sonra = await onizle(id);
    assert.equal(sonra.saglam, 1, 'T-2721-1: sağlam sayımdan okunur (emrin saglam_adet sütunu başlamışta boş)');
    assert.ok(sonra.uyarilar.includes('Sayılanlar kalır: sağlam 1 (OP 10), hurda 0.'), JSON.stringify(sonra.uyarilar));
    const ikinci = await arsivle(id, { surum: (await onizle(id)).surum, onay: true });
    assert.equal(ikinci.durum, 409, 'arşivdeki emir yeniden arşive alınmaz');
  });

  test('3165 a, 3207 a: üretim emri yazımı sekiz eylemdir; tek eylemi olan yalnız onu yapar, eski toplu anahtar hiçbirini açmaz', async () => {
    await kisiEkle('bekleten', ['uretim-emirleri.beklet']);
    await kisiEkle('iptalci', ['uretim-emirleri.iptal']);
    await kisiEkle('eskiyaz', ['uretim-emirleri.yaz']);
    const { id } = await ac(3, [await makine()]);
    const neden = { neden: 'malzeme' };
    for (const ad of ['iptalci', 'eskiyaz']) assert.equal((await istek(ad, 'POST', `/uretim-emirleri/${id}/beklet`, neden)).durum, 403, ad);
    const b = await istek('bekleten', 'POST', `/uretim-emirleri/${id}/beklet`, neden);
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const { surum } = await onizle(id);
    for (const ad of ['bekleten', 'eskiyaz']) assert.equal((await istek(ad, 'POST', `/adimli-emirler/${id}/iptal`, { surum })).durum, 403, ad);
    assert.equal((await onizle(id)).surum, surum, 'reddedilen iptal emri değiştirmez');
    const i = await istek('iptalci', 'POST', `/adimli-emirler/${id}/iptal`, { surum });
    assert.equal(i.durum, 200, JSON.stringify(i.govde));
  });

  test('3207 a: plana alma uçta ve serviste aynı eylemdir; yalnız düzenleyen 403 alır, yalnız plana alan yetkiden geçer', async () => {
    await kisiEkle('planaalan', ['uretim-emirleri.plana-al']);
    await kisiEkle('duzenleyen', ['uretim-emirleri.duzenle']);
    const { id } = await ac(3, [await makine()]);
    const { surum } = await onizle(id);
    assert.equal((await istek('duzenleyen', 'POST', `/adimli-emirler/${id}/plana-al`, { surum })).durum, 403);
    // Emrin durumu plana almaya uymayabilir (409/422); ölçülen yalnız yetki: servis içindeki denetim de 403 vermez.
    const p = await istek('planaalan', 'POST', `/adimli-emirler/${id}/plana-al`, { surum });
    assert.notEqual(p.durum, 403, JSON.stringify(p.govde));
  });

  test('kısıt uretim_emri_durum_alanlari: iptal emirde başlama kalabilir, bitiş ve sağlam adet olamaz', async () => {
    const id = await baslamisEmir();
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [id]);
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emri SET bitis = now() WHERE id = $1', [id]), /uretim_emri_durum_alanlari/);
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emri SET saglam_adet = 1 WHERE id = $1', [id]), /uretim_emri_durum_alanlari/);
  });

  test('2721 2/3 b: fasonda parça arşive almayı durdurmaz, uyarı olur; arşivden sonra dönüş yazılır, yeni gidiş yazılmaz', async () => {
    const m = await makine();
    const fasonAdim: IsEmriGirdisi = { ...adim(1, m), kaynak: { tur: 'fason', id: firma }, ayarSuresiDk: null, birimSureDk: null, terminGun: 2 };
    const r = await tx((db) => uretimEmriAc(db, kim('planlama'), {
      malzemeNo: urunNo, adet: 5, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: [fasonAdim, adim(2, m)], projeId,
    }));
    const [ie1] = r.isEmriIdleri as [number];
    const id = r.uretimEmriId;
    await tx((db) => fasonGidis(db, yonetici, id, ie1, 3));
    const p = await onizle(id);
    assert.equal(p.engel, null);
    assert.deepEqual(p.fasonda, [{ opNo: 10, adet: 3 }]);
    assert.ok(p.uyarilar.includes(ARSIV_FASONDA), JSON.stringify(p.uyarilar));
    assert.equal((await arsivle(id, { surum: p.surum, onay: true })).durum, 200);
    await tx((db) => fasonDonusuKaydet(db, yoneticiId, id, ie1, 2, 1));
    assert.deepEqual((await onizle(id)).fasonda, [], 'dönen ve firmada hurda düşer');
    await assert.rejects(tx((db) => fasonGidis(db, yonetici, id, ie1, 1)), (h: unknown) => h instanceof UygulamaHatasi && h.message === ACIK_DEGIL);
  });

  const emirSatiri = async (id: number): Promise<{ durum: string; adet: number }> =>
    (await o().sahip.tek<{ durum: string; adet: number }>('SELECT durum, adet FROM uretim_emri WHERE id = $1', [id]))!;
  const hatali = async (id: number, ie: number, adet: number) =>
    hataliCevabi.parse((await istek('operator', 'POST', `/uretim-emirleri/${id}/hatali`, { isEmriId: ie, hurdaNedeniKodu: 'AR-TK', adet })).govde);
  const karar = (kayitId: number, k: 'hurda' | 'red' | 'kabul' | 'rework') =>
    tx((db) => hataliKarariVer(db, yonetici, kayitId, { karar: k, not: k === 'kabul' ? 'Deneme kabul notu' : null, ncrKimlik: null }));

  test('2731 b: kararsız hatalı kayıt arşivi durdurmaz; kolu emirle arşive gider, arşivde hurda ve kabul verilir, rework kapalı', async () => {
    const { id, adimlar: [ie1] } = await ac(5, [await makine(), await makine()]);
    await tx((db) => emirBaslat(db, op(), id));
    const h1 = await hatali(id, ie1!, 1);
    const h2 = await hatali(id, ie1!, 1);
    assert.equal(h1.kolAcildi && h2.kolAcildi, true);
    const p = await onizle(id);
    assert.deepEqual([p.hataliAcik, p.engel], [2, null]);
    assert.equal((await tx((db) => hataliKaydi(db, h1.kayitId)))?.arsivde, false, '2757: arşivden önce');
    assert.ok(p.uyarilar.includes(ARSIV_HATALI_ACIK(2)), JSON.stringify(p.uyarilar));
    const r = await arsivle(id, { surum: p.surum, onay: true });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    for (const kol of [h1.hedefEmir.id, h2.hedefEmir.id]) assert.equal((await emirSatiri(kol)).durum, 'iptal', 'hatalı kolu emirle arşive gider');
    const kokAdet = (await emirSatiri(id)).adet;
    const liste = await tx((db) => hataliKayitlari(db, { acik: true, emirId: id }));
    assert.deepEqual(liste.map((k) => k.arsivde), [true, true], '2757: kolu arşivdeki kayıt arsivde taşır');
    await assert.rejects(karar(h1.kayitId, 'rework'), (e: unknown) => e instanceof UygulamaHatasi && e.message === HATALI_ARSIVDE_REWORK);
    assert.equal((await karar(h1.kayitId, 'hurda')).kayit.karar, 'hurda');
    assert.equal((await karar(h2.kayitId, 'kabul')).kayit.karar, 'kabul');
    assert.deepEqual(await emirSatiri(id), { durum: 'iptal', adet: kokAdet }, 'kol katılmaz, emir bitmez');
    for (const kol of [h1.hedefEmir.id, h2.hedefEmir.id]) assert.equal((await emirSatiri(kol)).durum, 'iptal', 'kol bitmez');
    assert.equal((await onizle(id)).hataliAcik, 0);
  });

  test('2731 b: adımdaki bütün parça hatalıysa (kolsuz) arşivde red verilir; arşivsiz iptal emirde karar kapalı kalır', async () => {
    const { id, adimlar: [ie1] } = await ac(1, [await makine(), await makine()]);
    await tx((db) => emirBaslat(db, op(), id));
    const h = await hatali(id, ie1!, 1);
    assert.equal(h.kolAcildi, false);
    const p = await onizle(id);
    assert.equal((await arsivle(id, { surum: p.surum, onay: true })).durum, 200);
    assert.equal((await tx((db) => hataliKaydi(db, h.kayitId)))?.arsivde, true, '2757: kolsuz arşiv');
    assert.equal((await karar(h.kayitId, 'red')).kayit.karar, 'red');
    assert.equal((await emirSatiri(id)).durum, 'iptal');
    const { id: k, adimlar: [ie] } = await ac(1, [await makine(), await makine()]);
    await tx((db) => emirBaslat(db, op(), k));
    const h3 = await hatali(k, ie!, 1);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now(), bitis = NULL, saglam_adet = NULL WHERE id = ANY($1::int[])", [[k, h3.hedefEmir.id]]);
    assert.equal((await tx((db) => hataliKaydi(db, h3.kayitId)))?.arsivde, false, '2757: kapanışsız iptal arşiv değildir');
    await assert.rejects(karar(h3.kayitId, 'hurda'), (e: unknown) => e instanceof UygulamaHatasi && e.message === ACIK_DEGIL, 'kapanışsız iptal arşiv değildir');
  });
});
