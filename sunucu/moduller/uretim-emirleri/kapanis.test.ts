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
import { DIS_KAPANIS_MADDELERI, adimliEmirCevabi, bitenEmirlerCevabi, hataliCevabi, kapanisCevabi, kapanisListeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { DisKapanisMaddesi, KapanisCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, emirBitir, emirSayim, kapanisSonuclari, kararliSayimiSonuclandir, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi, KapanisCozucusu } from './disari.ts';
import { hataliKarariVer } from './hatali-parca.ts';
import { kapanisCozucusuKaydet } from './kapanis.ts';
import { KAPANIS_EKSIK, KAPANIS_KILITLI, KAPANIS_MUAF_EKSIK_DEGIL, KAPANIS_ONAY_VERILMIS, KAPANIS_TAMAM, KAPANIS_TAMAM_DEGIL, KAPANIS_YOK, KAPAT_DURMADI } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('uretim-emirleri onaylı kapanış (1072 a, 1074-1080, 1064; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Kullanici;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let sayac = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  // Testin dış madde çözücüleri; kablolama.ts'in koyduğu çözücüler sonda geri yüklenir.
  const eksikOlcum = new Set<number>();
  const onceki = new Map<DisKapanisMaddesi, KapanisCozucusu | null>();

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
  const red = async (is: Promise<unknown>, ileti: string): Promise<void> => {
    await assert.rejects(is, (h: unknown) => h instanceof UygulamaHatasi && h.message === ileti);
  };

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
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KPM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ($1, $2, $3, $4) RETURNING id', [`KPI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id, tip]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi ON CONFLICT DO NOTHING', [ist]);
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`KPMK${sayac}`, 'Tezgah', ist]))!.id;
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
  // Tek adımlı emri ilk parça onayıyla sonuna kadar üretir; emir biter ve kapanış açılır.
  async function bitmisEmir(adet = 3): Promise<number> {
    const { id } = await ac(adet, [await makine()]);
    await tx((db) => emirBaslat(db, op(), id));
    await tx((db) => emirSayim(db, op(), id, { tur: 'saglam', adet: 1 }));
    await tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
    await tx((db) => emirSayim(db, op(), id, { tur: 'saglam', adet: adet - 1 }));
    await tx((db) => emirBitir(db, op(), id));
    return id;
  }
  const oku = async (id: number, ad = 'okuyucu'): Promise<KapanisCevabi> => {
    const c = await istek(ad, 'GET', `/adimli-emirler/${id}/kapanis`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return kapanisCevabi.parse(c.govde);
  };
  const komut = async (ad: string, id: number, eylem: string, govde: Record<string, unknown>): Promise<Cevap<{ mesaj?: string }>> =>
    istek<{ mesaj?: string }>(ad, 'POST', `/adimli-emirler/${id}/kapanis/${eylem}`, govde);
  const basarili = async (ad: string, id: number, eylem: string, govde: Record<string, unknown>): Promise<KapanisCevabi> => {
    const c = await komut(ad, id, eylem, govde);
    assert.equal(c.durum, 200, `${eylem}: ${JSON.stringify(c.govde)}`);
    return kapanisCevabi.parse(c.govde);
  };
  const reddedilen = async (ad: string, id: number, eylem: string, govde: Record<string, unknown>, durum: number, mesaj?: string): Promise<void> => {
    const c = await komut(ad, id, eylem, govde);
    assert.equal(c.durum, durum, `${eylem}: ${JSON.stringify(c.govde)}`);
    if (mesaj !== undefined) assert.equal(c.govde.mesaj, mesaj);
  };
  const hal = (k: KapanisCevabi, madde: string) => k.maddeler.find((m) => m.madde === madde)?.durum;

  before(async () => {
    ortam = await testVeritabaniKur('uretim_kapanis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.KAPANIS', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await kisiEkle('planlama', [], 'planlama_proje');
    await kisiEkle('operator', [], 'operator');
    await kisiEkle('kalite', ['uretim-emirleri.kapanis-kalite']);
    await kisiEkle('mudur', ['uretim-emirleri.kapanis-onay']);
    await kisiEkle('ikili', ['uretim-emirleri.kapanis-kalite', 'uretim-emirleri.kapanis-onay']);
    await kisiEkle('okuyucu', ['uretim-emirleri.kapanis-oku']);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KP-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('KP-TK', 'Deneme takım kırılması', 900)");
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KP-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kp-dnm-1', 'mamul', 'KP-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kp-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    await makine('kalite');
    // Ölçüm eksik işaretli emirde eksik, öbür dış maddeler tamam; kayıtsız madde (çözücü null) bilinmiyor olur.
    for (const m of DIS_KAPANIS_MADDELERI) {
      onceki.set(m, kapanisCozucusuKaydet(m, (_db, id) => Promise.resolve(
        m === 'ncr' ? null : m === 'olcum' && eksikOlcum.has(id) ? { durum: 'eksik', ayrinti: 'ölçüm raporu yok' } : { durum: 'tamam', ayrinti: null })));
    }
  });
  after(async () => {
    for (const [m, c] of onceki) kapanisCozucusuKaydet(m, c);
    await ortam?.kaldir();
  });

  test('emir bitince kapanış açılır; kendi maddeleri tamam, ölçüm tamam, NCR bilinmiyor; okuma yetkisi', async () => {
    const id = await bitmisEmir();
    const k = await oku(id);
    assert.deepEqual([k.asama, k.sonuc, k.eski, k.saglamAdet, k.onaylar.kalite, k.onaylar.mudur], ['onay', null, false, 3, null, null]);
    assert.deepEqual(k.maddeler.map((m) => [m.madde, m.durum]), [
      ['is-emirleri', 'tamam'], ['ilk-parca', 'tamam'], ['hatali', 'tamam'], ['olcum', 'tamam'], ['izlenebilirlik', 'tamam'],
      ['fason', 'gerekmez'], ['stok', 'tamam'], ['sevkiyat', 'tamam'], ['ncr', 'bilinmiyor'],
    ]);
    // Planlama rolü kapanışı okur (1078 a); operatör okumaz.
    for (const ad of ['kalite', 'mudur', 'planlama']) assert.equal((await istek(ad, 'GET', `/adimli-emirler/${id}/kapanis`)).durum, 200, ad);
    assert.equal((await istek('operator', 'GET', `/adimli-emirler/${id}/kapanis`)).durum, 403);
    const liste = await istek('okuyucu', 'GET', '/kapanislar?asama=onay');
    assert.equal(liste.durum, 200, JSON.stringify(liste.govde));
    const satir = kapanisListeCevabi.parse(liste.govde).satirlar.find((s) => s.uretimEmriId === id);
    assert.deepEqual([satir?.asama, satir?.bekleyenOnaylar, satir?.eksikMadde], ['onay', ['kalite', 'mudur'], 0]);
    const acik = await ac(2, [await makine()]);
    assert.equal((await istek('okuyucu', 'GET', `/adimli-emirler/${acik.id}/kapanis`)).durum, 404, KAPANIS_YOK);
  });

  test('UE-KP4: sırasız iki onay; müdür ret onayları düşürür; tamamlanınca emir kilitlenir (1080 a) ve sonuç görünür', async () => {
    const id = await bitmisEmir();
    let k = await basarili('mudur', id, 'mudur-onay', { surum: (await oku(id)).surum });
    assert.equal(k.onaylar.mudur?.kisiId, kim('mudur').id, 'müdür önce onaylayabilir');
    await reddedilen('mudur', id, 'mudur-onay', { surum: k.surum }, 409, KAPANIS_ONAY_VERILMIS);
    await reddedilen('kalite', id, 'mudur-onay', { surum: k.surum }, 403);
    await reddedilen('mudur', id, 'kalite-onay', { surum: k.surum }, 403);
    await reddedilen('kalite', id, 'kalite-onay', { surum: k.surum - 1 }, 409);
    await reddedilen('kalite', id, 'kalite-ret', { surum: k.surum, gerekce: ' ' }, 400);
    k = await basarili('kalite', id, 'kalite-ret', { surum: k.surum, gerekce: 'ölçüm tekrar edilecek' });
    assert.deepEqual([k.asama, k.onaylar.kalite, k.onaylar.mudur], ['onay', null, null], 'ret verilmiş onayları düşürür');
    k = await basarili('kalite', id, 'kalite-onay', { surum: k.surum, not: 'tamam' });
    k = await basarili('mudur', id, 'mudur-onay', { surum: k.surum });
    assert.deepEqual([k.asama, k.sonuc], ['tamam', 'tamamlandi']);
    assert.deepEqual(k.defter.map((d) => d.olay), ['mudur_onay', 'kalite_ret', 'kalite_onay', 'mudur_onay', 'tamamlandi']);
    assert.equal(k.defter[1]?.gerekce, 'ölçüm tekrar edilecek');
    await reddedilen('kalite', id, 'kalite-ret', { surum: k.surum, gerekce: 'geç kaldı' }, 409, KAPANIS_TAMAM);
    await red(tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay')), KAPANIS_KILITLI);
    assert.equal((await tx((db) => kapanisSonuclari(db, [id]))).get(id), 'tamamlandi');
    const izleme = await istek('planlama', 'GET', '/uretim-emirleri/bitenler?istasyonsuz=1');
    assert.equal(izleme.durum, 200, JSON.stringify(izleme.govde));
    const biten = bitenEmirlerCevabi.parse(izleme.govde).satirlar.find((e) => e.id === id);
    assert.equal(biten?.kapanisSonucu, 'tamamlandi');
  });

  test('1077 b: iki işlemi olan aynı kişi iki onayı da verir', async () => {
    const id = await bitmisEmir();
    const k1 = await basarili('ikili', id, 'kalite-onay', { surum: (await oku(id)).surum });
    const k2 = await basarili('ikili', id, 'mudur-onay', { surum: k1.surum });
    assert.deepEqual([k2.asama, k2.onaylar.kalite?.kisiId, k2.onaylar.mudur?.kisiId], ['tamam', kim('ikili').id, kim('ikili').id]);
  });

  test('UE-KP5 ve 1076 a: eksik madde onayı durdurur; yalnız müdür ve yalnız eksik maddeyi muaf tutar; geri açılınca muafiyet yeni turda yok', async () => {
    const id = await bitmisEmir();
    eksikOlcum.add(id);
    let k = await oku(id);
    assert.deepEqual([k.asama, hal(k, 'olcum')], ['belge', 'eksik']);
    await reddedilen('kalite', id, 'kalite-onay', { surum: k.surum }, 409, KAPANIS_EKSIK);
    await reddedilen('kalite', id, 'muaf', { surum: k.surum, madde: 'olcum', gerekce: 'rapor kağıtta' }, 403);
    await reddedilen('mudur', id, 'muaf', { surum: k.surum, madde: 'stok', gerekce: 'deneme' }, 409, KAPANIS_MUAF_EKSIK_DEGIL);
    await reddedilen('mudur', id, 'geri-ac', { surum: k.surum, gerekce: 'deneme' }, 409, KAPANIS_TAMAM_DEGIL);
    k = await basarili('mudur', id, 'muaf', { surum: k.surum, madde: 'olcum', gerekce: 'rapor kağıtta, arşivde' });
    assert.deepEqual([k.asama, hal(k, 'olcum'), k.muafiyetler.map((m) => m.madde)], ['onay', 'muaf', ['olcum']]);
    k = await basarili('kalite', id, 'kalite-onay', { surum: k.surum });
    k = await basarili('mudur', id, 'mudur-onay', { surum: k.surum });
    assert.equal(k.asama, 'tamam');
    await reddedilen('kalite', id, 'geri-ac', { surum: k.surum, gerekce: 'deneme' }, 403);
    k = await basarili('mudur', id, 'geri-ac', { surum: k.surum, gerekce: 'müşteri ölçüm raporu istedi' });
    assert.deepEqual([k.asama, k.sonuc, k.onaylar.kalite, k.onaylar.mudur, hal(k, 'olcum'), k.muafiyetler], ['belge', null, null, null, 'eksik', []]);
    assert.equal(k.defter.at(-1)?.olay, 'geri_acildi');
    eksikOlcum.delete(id);
    assert.equal((await oku(id)).asama, 'onay');
  });

  test('1064 ve 1079 a: duran emri planlama kapatır; emir sağlamsız biter, stok ve sevk aranmaz, iki onayla "saglamsiz" olur', async () => {
    const [a, b] = [await makine(), await makine()];
    const { id, adimlar: [ie1] } = await ac(1, [a, b]);
    const surum0 = adimliEmirCevabi.parse((await istek('planlama', 'GET', `/adimli-emirler/${id}`)).govde).emir.surum;
    const erken = await istek<{ mesaj?: string }>('planlama', 'POST', `/adimli-emirler/${id}/kapat`, { surum: surum0 });
    assert.deepEqual([erken.durum, erken.govde.mesaj], [409, KAPAT_DURMADI]);
    await tx((db) => emirBaslat(db, op(), id));
    const h = hataliCevabi.parse((await istek('operator', 'POST', `/uretim-emirleri/${id}/hatali`, { isEmriId: ie1, hurdaNedeniKodu: 'KP-TK', adet: 1 })).govde);
    await tx((db) => hataliKarariVer(db, yonetici, h.kayitId, { karar: 'red', not: null, ncrKimlik: null }));
    const surum = adimliEmirCevabi.parse((await istek('planlama', 'GET', `/adimli-emirler/${id}`)).govde).emir.surum;
    assert.equal((await istek('kalite', 'POST', `/adimli-emirler/${id}/kapat`, { surum })).durum, 403);
    assert.equal((await istek('planlama', 'POST', `/adimli-emirler/${id}/kapat`, { surum: surum - 1 })).durum, 409);
    const kapat = await istek('planlama', 'POST', `/adimli-emirler/${id}/kapat`, { surum });
    assert.equal(kapat.durum, 200, JSON.stringify(kapat.govde));
    const emir = await o().sahip.tek<{ durum: string; saglam: number }>('SELECT durum, saglam_adet AS saglam FROM uretim_emri WHERE id = $1', [id]);
    assert.deepEqual(emir, { durum: 'bitti', saglam: 0 });
    const kalan = await o().sahip.sorgu<{ durum: string }>('SELECT durum FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira', [id]);
    assert.ok(kalan.every((x) => x.durum === 'tamam'), 'bekleyen adımlar kalkar');
    let k = await oku(id);
    assert.deepEqual([k.asama, hal(k, 'stok'), hal(k, 'sevkiyat'), hal(k, 'hatali')], ['onay', 'gerekmez', 'gerekmez', 'tamam']);
    k = await basarili('ikili', id, 'kalite-onay', { surum: k.surum });
    k = await basarili('ikili', id, 'mudur-onay', { surum: k.surum });
    assert.deepEqual([k.asama, k.sonuc], ['tamam', 'saglamsiz']);
  });

  test('eski kapanış (göç dolumu): onaysız tamam, maddeleri okunmaz; müdür geri açınca eski olmaktan çıkar', async () => {
    const id = await bitmisEmir();
    await o().sahip.sorgu("UPDATE uretim_emirleri_kapanis SET durum = 'tamam', eski = true, tamamlanma = now() WHERE uretim_emri_id = $1", [id]);
    const k = await oku(id);
    assert.deepEqual([k.asama, k.sonuc, k.eski, k.maddeler, k.onaylar.kalite, k.onaylar.mudur], ['tamam', 'tamamlandi', true, [], null, null]);
    const g = await basarili('mudur', id, 'geri-ac', { surum: k.surum, gerekce: 'eski emir yeniden incelenecek' });
    assert.deepEqual([g.eski, g.asama], [false, 'onay']);
  });
});
