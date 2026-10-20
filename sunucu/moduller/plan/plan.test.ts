import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, mock, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ESKI_SURUM_NEDENI } from '#paylasilan/hata.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import type { CanliYerlesimCevabi, KarsilastirmaCevabi, MotorYerlesimiCevabi, OnizlemeCevabi, PlanCevabi, SenaryolarCevabi, SiparisBandiCevabi } from '#paylasilan/sozlesme/plan.ts';
import type {
  AdimGirdisi, AgacCevabi, KomutCevabi, KullanimCevabi, RevizyonAyrintisi, RotaListesiCevabi, SeceneklerCevabi, TalimatlarCevabi, UrunRevizyonlariCevabi,
} from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import type { Db } from '#cekirdek/db.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { isEmriTahminiMaliyetleri, uretimEmriMalzemeMaliyetleri } from '../proje-maliyet/disari.ts';
import { canliOzeti, canliSira, karRiskiOraniGun, kuyruguSirala, malzemeMaliyetiCozucusu, musteriSinifiCozucusu, tahminiMaliyetCozucusu } from './disari.ts';
import { acilSiparisOnaylandi, menuSayaclari, oner, plan as planServisi } from './servis.ts';
import { PERSONEL_TANIMSIZ } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

interface Rol { id: number; ad: string }
type Cerez = string;

describe('plan (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  const c: Record<'yonetici' | 'kartOnaycisi' | 'planlama' | 'planlama2' | 'mudur' | 'kalite' | 'cam' | 'operator', Cerez> = {
    yonetici: '', kartOnaycisi: '', planlama: '', planlama2: '', mudur: '', kalite: '', cam: '', operator: '',
  };
  let tipler: SeceneklerCevabi['operasyonTipleri'] = [];
  let istasyonA = 0;
  let istasyonB = 0;
  let makineA = 0;
  let makineB = 0;
  let operatorId = 0;
  // Onaya giden rotanın ilk adımında giren olmalı (#1372): örnek adımlar bu hammaddeyi tüketir.
  let ortakHammadde = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  // Her yazma isteği yeni bir istek kimliği taşır (tekrar korumalı uçlar onu ister); tekrar testi kimliği kendisi verir.
  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, kimlik: string | null = randomUUID()) =>
    app.inject({
      method: yontem, url: `/api${url}`, payload: payload as object | undefined,
      headers: { cookie: cerez, ...(yontem === 'POST' && kimlik !== null ? { [ISTEK_KIMLIGI_BASLIGI]: kimlik } : {}) },
    });

  async function tamam<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const cevap = await istek(cerez, yontem, url, payload);
    assert.equal(cevap.statusCode, 200, `${yontem} ${url}: ${cevap.body}`);
    return cevap.json();
  }

  async function kisiEkle(kullaniciAdi: string, rolId: number): Promise<void> {
    await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, id, rolId);
      for (const rol of kisi.roller) if (rol.id !== rolId) await rolAl(db, yoneticiId, id, rol.id);
    });
  }

  // Kart malzemeler modülünün kendi uçlarıyla açılır ve onaylanır (dört göz ayarı testte kapalı). Kartın sayı kimliği (`no`)
  // test kurulumunda veritabanından okunur: malzemeler modülü bugün onu uçta vermiyor.
  async function kartAc(tur: 'mamul' | 'yarimamul' | 'hammadde', durum: 'aktif' | 'taslak' = 'aktif'): Promise<number> {
    const kimlik = `rt${++sayac}`;
    const kod = `${tur === 'hammadde' ? 'HM' : tur === 'mamul' ? 'MM' : 'YM'}-RTA-00001`;
    const govde = (d: string, surum: number | null) => ({
      kayit: { id: kimlik, tur, fam: 'metal', com: { kod, ad: `Deneme ${tur} ${sayac}`, birim: 'adet' }, onay: { durum: d } },
      ozet: { stok_kodu: kod, tur, onay_durumu: d, benzersiz_anahtar: `${tur}|${kimlik}`, mukerrer_gerekcesi: null },
      surum,
    });
    const r = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('taslak', null));
    if (durum === 'aktif') {
      const g = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('onayda', r.surum));
      await tamam(c.kartOnaycisi, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('aktif', g.surum));
    }
    const satir = await vt().tx((db) => db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]));
    return satir!.no;
  }
  const mamulAc = (): Promise<number> => kartAc('mamul');
  const hammaddeAc = (): Promise<number> => kartAc('hammadde');

  const tip = (kod: string): number => {
    const t = tipler.find((x) => x.kod === kod);
    if (!t) throw new Error(`Operasyon tipi yok: ${kod}`);
    return t.id;
  };

  const yeniAdim = (p: Partial<AdimGirdisi> = {}): AdimGirdisi => ({
    opNo: null, operasyonTipiId: tip('TRN'), ad: 'Deneme adım', kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: 2,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
    adaylar: [], bilesenler: ortakHammadde ? [{ malzemeId: ortakHammadde, miktar: 1, fireYuzde: 0 }] : [], yanUrunler: [], ...p,
  });

  // Ayrıntıdan kaydet gövdesine: ekran da aynı dönüşümü yapar.
  const govdeye = (a: RevizyonAyrintisi['adimlar'][number]): AdimGirdisi => ({
    opNo: a.opNo, operasyonTipiId: a.operasyonTipi.id, ad: a.ad, kaynak: a.kaynak ? { tur: a.kaynak.tur, id: a.kaynak.id } : null,
    ayarSuresiDk: a.ayarSuresiDk === null ? null : Number(a.ayarSuresiDk), birimSureDk: a.birimSureDk === null ? null : Number(a.birimSureDk),
    bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, firePayiYuzde: Number(a.firePayiYuzde), makineKullanimi: a.makineKullanimi,
    enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar,
    adaylar: a.adaylar.map((x) => ({ kaynak: { tur: x.kaynak.tur, id: x.kaynak.id }, ayarSuresiDk: x.ayarSuresiDk === null ? null : Number(x.ayarSuresiDk), birimSureDk: x.birimSureDk === null ? null : Number(x.birimSureDk) })),
    bilesenler: a.bilesenler.map((b) => ({ malzemeId: b.malzeme.id, miktar: Number(b.miktar), fireYuzde: Number(b.fireYuzde) })),
    yanUrunler: a.yanUrunler.map((y) => ({ malzemeId: y.malzeme.id, miktar: Number(y.miktar) })),
  });

  const ayrinti = (id: number, cerez = c.planlama) => tamam<RevizyonAyrintisi>(cerez, 'GET', `/rota/revizyonlar/${id}`);
  const taslakAc = (urun: number, kaynak: Record<string, unknown> = { tur: 'bos' }, cerez = c.planlama) =>
    istek(cerez, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak });
  const kaydet = (id: number, surum: number, adimlar: AdimGirdisi[], cerez = c.planlama, aciklama: string | null = null) =>
    istek(cerez, 'POST', `/rota/revizyonlar/${id}/kaydet`, { surum, aciklama, adimlar });
  const komut = (id: number, ad: string, govde: Record<string, unknown>, cerez: Cerez) => istek(cerez, 'POST', `/rota/revizyonlar/${id}/${ad}`, govde);

  // Taslak açar, adımları kaydeder, onaya gönderir, müdüre onaylatıp yürürlüğe alır.
  async function yururlugeAlinmisRota(urun: number, adimlar: AdimGirdisi[]): Promise<number> {
    const ac = await taslakAc(urun);
    assert.equal(ac.statusCode, 200, ac.body);
    const { id } = ac.json<KomutCevabi>();
    const k = await kaydet(id, 1, adimlar);
    assert.equal(k.statusCode, 200, k.body);
    const g = await komut(id, 'onaya-gonder', { surum: k.json<KomutCevabi>().surum }, c.planlama);
    assert.equal(g.statusCode, 200, g.body);
    const o = await komut(id, 'onayla', { surum: g.json<KomutCevabi>().surum, yururlugeAl: true }, c.mudur);
    assert.equal(o.statusCode, 200, o.body);
    return id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('plan');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('PLAN.DENEME', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    c.yonetici = await girisCerezi('yonetici');
    // Rol x işlem satırları teslimle girmez (şartname): önerilen dağılım test veritabanına burada yazılır (UYGULA.md'deki öneri göçüyle aynı).
    await ortam.vt.tx((db) => db.sorgu(
      `INSERT INTO rol_islemi (rol_id, islem)
       SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem FROM (VALUES
         ('planlama_proje', 'rota.yaz'), ('planlama_proje', 'rota.talimat-yaz'), ('planlama_proje', 'rota.emre-kopyala'),
         ('mudur', 'rota.onayla'), ('cam', 'rota.talimat-yaz'),
         ('planlama_proje', 'plan.yaz'), ('planlama_proje', 'plan.kilitle'), ('planlama_proje', 'plan.studyo'), ('planlama_proje', 'plan.canliya-al'),
         ('mudur', 'plan.kilitle'), ('mudur', 'plan.studyo'), ('mudur', 'plan.canliya-al'),
         -- Önizleme iki işlemden birini ister; tek işlemle kabul bu iki rolle ölçülür.
         ('kalite', 'rota.emre-kopyala'), ('cam', 'plan.yaz'),
         -- Kapalı gün canlıya vardiya yazma da ister: kalitede plan.canliya-al var, vardiya.yaz yok.
         ('kalite', 'plan.canliya-al')) AS m (kod, islem)
       ON CONFLICT DO NOTHING`,
    ));
    // Malzeme kartını açan onaylayamaz (malzemeler modülünün kuralı): kartı ikinci bir yönetici onaylar.
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kart Onaycısı', kullaniciAdi: 'kartonay', parola: PAROLA }));
    c.kartOnaycisi = await girisCerezi('kartonay');
    const roller = ((await istek(c.yonetici, 'GET', '/roller')).json() as { roller: Rol[] }).roller;
    const rol = (ad: string): number => {
      const r = roller.find((x) => x.ad === ad);
      if (!r) throw new Error(`Rol yok: ${ad}`);
      return r.id;
    };
    const kullanicilar = [['planlama', 'Planlama ve Proje'], ['planlama2', 'Planlama ve Proje'], ['mudur', 'Müdür'], ['kalite', 'Kalite'], ['cam', 'CAM'], ['operator', 'Operatör']] as const;
    for (const [ad, rolAdi] of kullanicilar) {
      await kisiEkle(ad, rol(rolAdi));
      c[ad] = await girisCerezi(ad);
    }
    tipler = (await tamam<SeceneklerCevabi>(c.operator, 'GET', '/rota/secenekler')).operasyonTipleri;
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-IM', ad: 'Deneme merkez', aciklama: null });
    istasyonA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-A', ad: 'Deneme A', isMerkeziId: merkez.id })).id;
    istasyonB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-B', ad: 'Deneme B', isMerkeziId: merkez.id })).id;
    makineA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MA', ad: 'Deneme makine A', istasyonId: istasyonA })).id;
    makineB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MB', ad: 'Deneme makine B', istasyonId: istasyonB })).id;
    operatorId = (await vt().tx((db) => db.tek<{ id: number }>("SELECT id FROM kisi WHERE ad = 'Deneme operator'")))!.id;    ortakHammadde = await hammaddeAc();
  });

  after(async () => { await ortam?.kaldir(); });

  // Rota yürürlüğe alınır ve emre kopyalanır (uretim-emirleri): her adımı bir iş emri olur.
  async function isEmirleriAc(adimlar: AdimGirdisi[], adet = 10, teslim: string | null = null, ek: Record<string, unknown> = {}): Promise<number[]> {
    const urun = await mamulAc();
    const id = await yururlugeAlinmisRota(urun, adimlar);
    return (await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${id}/emre-kopyala`, { projeId: denemeProjeId, adet, teslim, ...ek })).isEmriIdleri;
  }
  const isEmriDurumu = (id: number, durum: 'bekliyor' | 'calisiyor') => vt().tx((db) => db.sorgu(
    'UPDATE uretim_emirleri_is_emri SET durum = $2, baslama = CASE WHEN $2 = \'calisiyor\' THEN now() END WHERE id = $1', [id, durum]));
  const isEmriMakinesi = async (id: number) =>
    (await vt().tx((db) => db.tek<{ makine_id: number | null }>('SELECT makine_id FROM uretim_emirleri_is_emri WHERE id = $1', [id])))?.makine_id;
  const planOku = (taslak?: number, cerez = c.planlama) => tamam<PlanCevabi>(cerez, 'GET', `/plan${taslak ? `?taslak=${taslak}` : ''}`);
  const yer = (p: PlanCevabi, isEmriId: number) => p.yerlesimler.find((y) => y.isEmriId === isEmriId)!;
  const tg = (p: PlanCevabi) => ({ id: p.taslak!.id, surum: p.taslak!.surum });
  // Yeni taslak açıp motora önerdirir (P6: canlıdayken yapılan işlem kullanıcıya taslak açar).
  const taslaktaOner = (cerez = c.planlama) => tamam<PlanCevabi>(cerez, 'POST', '/plan/oner', { taslak: null });
  const isEmriKomutu = (p: PlanCevabi, isEmriId: number, ad: string, govde: Record<string, unknown> = {}, cerez = c.planlama) =>
    istek(cerez, 'POST', `/plan/is-emirleri/${isEmriId}/${ad}`, { taslak: tg(p), ...govde });

  test('P1, PL-01, PL-02, P6: öner yeni taslağa yerleştirir, canlı değişmez; aynı kaynakta üst üste binmez, bekleyen adım öncül bitince başlar', async () => {
    const [a1, a2] = await isEmirleriAc([yeniAdim(), yeniAdim({ kaynak: { tur: 'kisi', id: operatorId } })]);
    const [b1] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    assert.equal(p.taslakAcildi, true);
    assert.deepEqual([p.personelYuku, p.gostergeler.personelGun], [[], null], 'kişisi bağlı iş merkezi yokken personel verisi uydurulmaz');
    assert.ok(p.taslak && p.taslak.benim && p.taslak.degisiklikSayisi === 1);
    const y1 = yer(p, a1!), y2 = yer(p, a2!), y3 = yer(p, b1!);
    assert.deepEqual([y1.kaynak, y2.kaynak], [{ tur: 'makine', id: makineA }, { tur: 'kisi', id: operatorId }]);
    assert.ok(Date.parse(y2.baslangic) >= Date.parse(y1.bitis));
    const ayni = [y1, y3].sort((x, y) => Date.parse(x.baslangic) - Date.parse(y.baslangic));
    assert.ok(Date.parse(ayni[1]!.baslangic) >= Date.parse(ayni[0]!.bitis));
    const canli = await planOku();
    assert.equal(canli.taslak, null);
    assert.equal(canli.yerlesimler.some((y) => y.isEmriId === a1), false);
    assert.equal(p.gostergeler.yerlesen >= 3, true);
    assert.equal(p.emirler.some((e) => e.yerlesen === 2 && !e.engelli), true);
    // İkinci yazma aynı taslağa: sürüm denetlenir; başkasının taslağına yazılamaz.
    assert.equal((await istek(c.planlama, 'POST', '/plan/oner', { taslak: { id: p.taslak!.id, surum: p.taslak!.surum + 3 } })).statusCode, 409);
    assert.equal((await istek(c.mudur, 'POST', '/plan/oner', { taslak: tg(p) })).statusCode, 403);
    // Yazma yetkisi olan başka planlamacı da başkasının taslağına yazamaz (yetki katmanı değil, taslak sahipliği).
    assert.equal((await istek(c.planlama2, 'POST', '/plan/oner', { taslak: tg(p) })).statusCode, 403);
    const p2 = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    assert.equal(p2.taslakAcildi, false);
    assert.equal(p2.taslak!.id, p.taslak!.id);
  });

  test('P5 ret: çakışma, yetkisiz rol, pasif makine; izinli taşıma geçer, canlıya alınca makine iş emrine yazılır (P3)', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const y = yer(p, i1!);
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: y.baslangic }, c.operator)).statusCode, 403);
    const baska = p.yerlesimler.find((x) => x.isEmriId !== i1 && x.kaynak.tur === 'makine' && x.kaynak.id === makineA)!;
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: baska.baslangic })).statusCode, 409);
    const pasif = await tamam<{ id: number; surum: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-MP', ad: 'Deneme pasif', istasyonId: istasyonB });
    await tamam(c.yonetici, 'POST', `/makineler/${pasif.id}/guncelle`, { kod: 'PL-MP', ad: 'Deneme pasif', istasyonId: istasyonB, aktif: false, surum: pasif.surum });
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: pasif.id }, baslangic: y.baslangic })).statusCode, 422);
    const ileri = new Date(Date.parse(y.baslangic) + 30 * 24 * 3600_000).toISOString();
    const r = await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: ileri });
    assert.equal(r.statusCode, 200, r.body);
    const t = r.json<PlanCevabi>();
    assert.deepEqual(yer(t, i1!).kaynak, { tur: 'makine', id: makineB });
    assert.ok(yer(t, i1!).uyarilar.some((u) => /rotadaki/.test(u)), 'aday dışı kaynak uyarısı');
    assert.equal(await isEmriMakinesi(i1!), makineA, 'taslak iş emrine yazmaz');
    const s = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${t.taslak!.id}/canliya-al`, { surum: t.taslak!.surum, cakismalariKabul: true });
    assert.equal(s.senaryolar.find((x) => x.id === t.taslak!.id)?.durum, 'canliya_alindi');
    assert.deepEqual(yer(await planOku(), i1!).kaynak, { tur: 'makine', id: makineB });
    assert.equal(await isEmriMakinesi(i1!), makineB);
  });

  test('demo 2.16: emrin ilk adımı bitince ya da çalışırken bekleyen adımı başlamış sayılmaz, taşınır ve sıralanır; çalışan adım taşınmaz', async () => {
    const [i1, i2] = await isEmirleriAc([yeniAdim(), yeniAdim()]);
    let p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    await isEmriDurumu(i1!, 'calisiyor');
    p = await planOku();
    assert.equal(yer(p, i1!).durum, 'basladi', 'çalışan adım');
    assert.equal(yer(p, i2!).durum, 'planli', 'aynı emrin bekleyen adımı');
    p = await taslaktaOner();
    const ileri = new Date(Date.parse(yer(p, i2!).baslangic) + 30 * 24 * 3600_000).toISOString();
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: yer(p, i1!).kaynak, baslangic: ileri })).statusCode, 409);
    const r = await isEmriKomutu(p, i2!, 'tasi', { kaynak: yer(p, i2!).kaynak, baslangic: ileri });
    assert.equal(r.statusCode, 200, r.body);
    await vt().tx((db) => db.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', bitis = now(), saglam_adet = 10 WHERE id = $1", [i1]));
    p = r.json<PlanCevabi>();
    assert.equal(yer(await planOku(p.taslak!.id), i2!).durum, 'planli', 'ilk adım bitince de');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('A4 (3b): çalışan işin önüne iş konur ve canlıya alınınca canlıda arkaya kayar; dondurulmuş çalışan işin önüne konamaz', async () => {
    const m = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-M3B', ad: 'Deneme 3b', istasyonId: istasyonB });
    const kaynak = { tur: 'makine' as const, id: m.id };
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak })]);
    const [j1] = await isEmirleriAc([yeniAdim({ kaynak })]);
    let p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    const [once, sonra] = [i1!, j1!].sort((x, y) => Date.parse(yer(p, x).baslangic) - Date.parse(yer(p, y).baslangic)) as [number, number];
    await isEmriDurumu(once, 'calisiyor');
    p = await taslaktaOner();
    assert.equal(yer(p, once).durum, 'basladi');
    assert.equal((await isEmriKomutu(p, once, 'tasi', { kaynak, baslangic: yer(p, sonra).bitis })).statusCode, 409, 'çalışan iş başka yere taşınmaz');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak, isEmriIdleri: [sonra, once] });
    assert.ok(Date.parse(yer(p, once).baslangic) >= Date.parse(yer(p, sonra).bitis), 'taslakta çalışan iş arkaya kaydı');
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    const canli = await planOku();
    assert.ok(Date.parse(yer(canli, once).baslangic) >= Date.parse(yer(canli, sonra).bitis), 'canlıda çalışan iş arkaya kaydı');
    assert.deepEqual([yer(canli, sonra).elleSira, yer(canli, once).elleSira], [1, 2]);
    assert.equal(await isEmriMakinesi(once), m.id, 'çalışan işin makinesi değişmez');

    // Dondurulmuş çalışan iş: önüne iş konamaz. Dondurma canlıya alınmaz; eşzamanlı test dosyaları aynı canlı planı okur.
    await isEmriDurumu(once, 'bekliyor');
    p = await taslaktaOner();
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/dondur', { taslak: tg(p) });
    const ilk = [once, sonra].sort((x, y) => Date.parse(yer(p, x).baslangic) - Date.parse(yer(p, y).baslangic)) as [number, number];
    assert.equal(yer(p, ilk[0]).dondurulmus, true, 'yakın iş donduruldu');
    await isEmriDurumu(ilk[0], 'calisiyor');
    assert.equal((await istek(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak, isEmriIdleri: [ilk[1], ilk[0]] })).statusCode, 409);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    await isEmriDurumu(ilk[0], 'bekliyor');
  });

  test('denetim #23: çalışan iş gerçek başlangıcından şimdi + kalan adedin süresine uzanır (ayar düşülür)', async () => {
    const m = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-M23', ad: 'Deneme 23', istasyonId: istasyonB });
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: m.id } })]);
    const p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    await vt().tx(async (db) => {
      await db.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = now() - interval '2 hours' WHERE id = $1", [i1]);
      await db.sorgu(
        `INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, zaman)
         SELECT uretim_emri_id, id, $2, $3, 'saglam', t.adet, now() FROM uretim_emirleri_is_emri, (VALUES (4), (2)) AS t(adet) WHERE id = $1`,
        [i1, operatorId, istasyonB]);
    });
    const simdi = Date.now();
    const y = yer(await planOku(), i1!);
    assert.equal(y.durum, 'basladi');
    const dakika = (t: string) => (Date.parse(t) - simdi) / 60_000;
    assert.ok(Math.abs(dakika(y.baslangic) + 120) < 2, `başlangıç gerçek: ${y.baslangic}`);
    // Kalan 10 - 6 = 4 adet x 2 dk; ayar (30 dk) düşülür.
    assert.ok(Math.abs(dakika(y.bitis) - 8) < 2, `bitiş şimdi + kalan: ${y.bitis}`);
    await isEmriDurumu(i1!, 'bekliyor');
  });

  test('denetim #23: tahmini bitişi geçmişte kalan çalışan işten sonra o makinedeki iş geçmişe yerleşmez', async () => {
    const m = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-M23G', ad: 'Deneme 23 geç', istasyonId: istasyonB });
    const kaynak = { tur: 'makine' as const, id: m.id };
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak })]);
    const [j1] = await isEmirleriAc([yeniAdim({ kaynak })]);
    let p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    const calisan = Date.parse(yer(p, i1!).baslangic) <= Date.parse(yer(p, j1!).baslangic) ? i1! : j1!;
    const sonraki = calisan === i1 ? j1! : i1!;
    // Son sayım 4 saat önce: kalan 9 x 2 dk o andan sayılınca tahmini bitiş geçmişte kalır.
    await vt().tx(async (db) => {
      await db.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = now() - interval '5 hours' WHERE id = $1", [calisan]);
      await db.sorgu(
        `INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, zaman)
         SELECT uretim_emri_id, id, $2, $3, 'saglam', 1, now() - interval '4 hours' FROM uretim_emirleri_is_emri WHERE id = $1`,
        [calisan, operatorId, istasyonB]);
    });
    const simdi = Date.now();
    p = await taslaktaOner();
    assert.ok(Date.parse(yer(p, calisan).bitis) < simdi, `çalışan işin tahmini bitişi geçmişte: ${yer(p, calisan).bitis}`);
    assert.ok(Date.parse(yer(p, sonraki).baslangic) >= simdi - 60_000, `sonraki iş geçmişe yerleşmedi: ${yer(p, sonraki).baslangic}`);
    assert.ok(Date.parse(yer(await planOku(p.taslak!.id), sonraki).baslangic) >= simdi - 60_000, 'okumada da');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    await isEmriDurumu(calisan, 'bekliyor');
  });

  test('P5 ret: kilitli ve başlamış iş taşınmaz ve kaldırılamaz; kilit yalnız plan.kilitle ile, kilit açılınca kaldırılır', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    assert.equal((await isEmriKomutu(p, i1!, 'kilitle', {}, c.operator)).statusCode, 403);
    p = (await isEmriKomutu(p, i1!, 'kilitle')).json<PlanCevabi>();
    let y = yer(p, i1!);
    assert.equal(y.kilitli, true);
    const ileri = new Date(Date.parse(y.baslangic) + 60 * 24 * 3600_000).toISOString();
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: ileri })).statusCode, 409);
    assert.equal((await isEmriKomutu(p, i1!, 'kaldir')).statusCode, 409);
    // PL-08: motor kilitliyi yerinde bırakır.
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    assert.equal(yer(p, i1!).baslangic, y.baslangic);
    p = (await isEmriKomutu(p, i1!, 'kilidi-ac')).json<PlanCevabi>();
    y = yer(p, i1!);
    await isEmriDurumu(i1!, 'calisiyor');
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: ileri })).statusCode, 409);
    assert.equal((await isEmriKomutu(p, i1!, 'kaldir')).statusCode, 409);
    await isEmriDurumu(i1!, 'bekliyor');
    const r = await isEmriKomutu(p, i1!, 'kaldir');
    assert.equal(r.statusCode, 200, r.body);
    assert.ok(r.json<PlanCevabi>().yerlesmemis.some((x) => x.isEmriId === i1));
  });

  test('dondurulmuş bölge ve ayar (PL-07): dondur yakın işleri sabitler, tek tek ya da toptan çözülür; ayar taslağa yazılır', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const ilkAyar = (await planOku()).ayar;
    let p = await taslaktaOner();
    assert.equal(p.ayar.dondurmaGun, 2);
    assert.equal((await istek(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, tamponGun: 1.25 } })).statusCode, 400);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, kural: 'edd', tamponGun: 1.5 } });
    assert.equal(p.ayar.kural, 'edd');
    assert.equal((await planOku()).ayar.kural, 'oncelik', 'canlı ayar değişmez');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/dondur', { taslak: tg(p) });
    const y = yer(p, i1!);
    assert.equal(y.dondurulmus, true);
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: new Date(Date.parse(y.baslangic) + 86_400_000).toISOString() })).statusCode, 409);
    p = (await isEmriKomutu(p, i1!, 'dondurmayi-kaldir')).json<PlanCevabi>();
    assert.equal(yer(p, i1!).dondurulmus, false);
    assert.equal((await isEmriKomutu(p, i1!, 'dondurmayi-kaldir')).statusCode, 409);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/dondurmayi-kaldir', { taslak: tg(p) });
    assert.equal(p.yerlesimler.some((x) => x.dondurulmus), false);
    // Taslağın ayarı canlıya almayla canlıya geçer; sonraki testler için ilk ayar yeni taslakla geri alınır.
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    assert.deepEqual((await planOku()).ayar, { ...ilkAyar, kural: 'edd', tamponGun: 1.5 });
    const geri = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: null, ayar: ilkAyar });
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${geri.taslak!.id}/canliya-al`, { surum: geri.taslak!.surum, cakismalariKabul: true });
    assert.deepEqual((await planOku()).ayar, ilkAyar);
  });

  test('P5 ret: kapsam dışı istasyonun kaynağı yazılamaz ve listede görünmez; uyarı: teslim gecikmesi', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()], 10, '2020-01-01');
    const p = await taslaktaOner();
    const y = yer(p, i1!);
    assert.ok(y.uyarilar.some((u) => /Teslim/.test(u)));
    assert.ok(p.gostergeler.geciken >= 1);
    const baska = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'PL-K', ad: 'Deneme kapsam', aciklama: null });
    const planlamaId = (await vt().tx((db) => db.tek<{ id: number }>("SELECT id FROM kisi WHERE ad = 'Deneme planlama'")))!.id;
    await tamam(c.yonetici, 'POST', `/kisi-is-merkezleri/${planlamaId}/belirle`, { isMerkeziIdleri: [baska.id] });
    try {
      assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: y.baslangic })).statusCode, 403);
      assert.equal((await planOku(p.taslak!.id)).yerlesimler.length, 0);
    } finally {
      await tamam(c.yonetici, 'POST', `/kisi-is-merkezleri/${planlamaId}/belirle`, { isMerkeziIdleri: [] });
    }
  });

  test('kuyruk sırası (KY-03): aynı kaynaktaki işler verilen sırayla arka arkaya dizilir ve elle sıra alır; yanlış kaynak reddedilir', async () => {
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineB } })]);
    const [i2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineB } })]);
    const [a1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    const [a2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    let p = await taslaktaOner();
    const kuyruk = p.yerlesimler.filter((x) => x.isEmriId === i1 || x.isEmriId === i2);
    const ters = [...kuyruk].sort((a, b) => Date.parse(b.baslangic) - Date.parse(a.baslangic)).map((x) => x.isEmriId);
    assert.equal((await istek(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: { tur: 'makine', id: makineA }, isEmriIdleri: ters })).statusCode, 400);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: { tur: 'makine', id: makineB }, isEmriIdleri: ters });
    const yeni = ters.map((id) => yer(p, id));
    assert.ok(Date.parse(yeni[1]!.baslangic) >= Date.parse(yeni[0]!.bitis));
    assert.deepEqual(yeni.map((x) => x.elleSira), [1, 2]);
    // Motor elle sırayı korur; "Elle sıraları sil" sonra kural sırası.
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    assert.ok(Date.parse(yer(p, ters[0]!).baslangic) < Date.parse(yer(p, ters[1]!).baslangic));
    // Plan sırasına dön (tek kuyruk): yalnız o makinenin elle sırası kalkar; elle sırası olmayan kuyrukta 409.
    const kuyrukDon = (pp: PlanCevabi, id: number) => istek(c.planlama, 'POST', '/plan/kuyruk/plan-sirasina-don', { taslak: tg(pp), kaynak: { tur: 'makine', id } });
    assert.equal((await kuyrukDon(p, makineA)).statusCode, 409);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: { tur: 'makine', id: makineA }, isEmriIdleri: [a2!, a1!] });
    p = (await kuyrukDon(p, makineB)).json<PlanCevabi>();
    assert.deepEqual(ters.map((id) => yer(p, id).elleSira), [null, null]);
    assert.deepEqual([a2!, a1!].map((id) => yer(p, id).elleSira), [1, 2], 'başka kuyruğun elle sırası kalır');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: { tur: 'makine', id: makineB }, isEmriIdleri: ters });
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/elle-siralari-sil', { taslak: tg(p) });
    assert.equal(p.yerlesimler.some((x) => x.elleSira !== null), false);
    const k = await tamam<KarsilastirmaCevabi>(c.planlama, 'GET', `/plan/karsilastir?taslak=${p.taslak!.id}`);
    assert.deepEqual(k.secenekler.map((x) => x.kural), ['oncelik', 'edd', 'cr', 'spt', 'fifo']);
  });

  test('FIFO kuralı: ayar taslağa yazılır, tanımsız kural reddedilir, canlı ayar satırı değişmez; kısıt beş değeri kabul eder', async () => {
    const ilkAyar = (await planOku()).ayar;
    const p = await taslaktaOner();
    const f = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, kural: 'fifo' } });
    assert.equal(f.ayar.kural, 'fifo');
    assert.equal((await istek(c.planlama, 'POST', '/plan/ayar', { taslak: tg(f), ayar: { ...f.ayar, kural: 'lifo' } })).statusCode, 400);
    assert.deepEqual((await planOku()).ayar, ilkAyar, 'canlı ayar değişmez');
    const kural = (tablo: string) => ortam!.vt.tx((db) => db.sorgu<{ kural: string }>(`SELECT kural FROM ${tablo}`));
    assert.deepEqual((await kural('plan_ayari')).map((x) => x.kural), [ilkAyar.kural], 'göçten sonra mevcut satır aynı');
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu(`UPDATE plan_ayari SET kural = 'lifo'`)), /plan_ayari_kural/);
    await ortam!.sahip.tx((db) => db.sorgu(`UPDATE plan_ayari SET kural = 'fifo'`));
    await ortam!.sahip.tx((db) => db.sorgu(`UPDATE plan_ayari SET kural = $1`, [ilkAyar.kural]));
    assert.deepEqual((await planOku()).ayar, ilkAyar);
  });

  test('P4, P6 stüdyo: değişiklik defteri, tek değişikliği kaldırma, hızlı deneme canlıya alınmaz, canlı değişince onay, vazgeç', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    assert.equal((await istek(c.operator, 'POST', '/plan/senaryolar', { ad: 'Deneme' })).statusCode, 403);
    let l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: 'Deneme senaryo', aciklama: 'not' });
    let s = l.senaryolar.find((x) => x.ad === 'Deneme senaryo')!;
    let p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: { id: s.id, surum: s.surum } });
    const y = yer(p, i1!);
    const ileri = new Date(Date.parse(y.baslangic) + 90 * 24 * 3600_000).toISOString();
    p = (await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: ileri })).json<PlanCevabi>();
    l = await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar');
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.deepEqual(s.degisiklikler.map((d) => d.tur), ['oner', 'tasi']);
    assert.ok(s.etki && s.etki.tarihiDegisenEmirler.length > 0);
    // Taşımayı kaldır: iş emri canlıdaki hâline (yerleşmemiş) döner.
    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/degisiklikler/${s.degisiklikler[1]!.id}/kaldir`, { surum: s.surum });
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.equal(s.degisiklikler.length, 1);
    assert.equal(yer(await planOku(s.id), i1!), undefined);
    // Hızlı dene: kapalı gün benzetilir; canlıya alınabilir ama vardiya yazma yetkisi de ister (kalitede yok).
    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur: 'gun', surum: s.surum });
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.equal(s.bekleyenler.length, 0);
    {
      const r = await istek(c.kalite, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
      assert.equal(r.statusCode, 403);
      assert.match(r.body, /vardiya yazma yetkisi/);
    }
    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/degisiklikleri-at`, { surum: s.surum });
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.equal(s.degisiklikler.length, 0);
    // Canlı değişir (başka taslak canlıya alınır): onaysız canlıya alma reddedilir, yetkisiz rol reddedilir.
    const baska = await taslaktaOner();
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${baska.taslak!.id}/canliya-al`, { surum: baska.taslak!.surum, cakismalariKabul: true });
    l = await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar');
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.equal(s.canliDegisti, true);
    assert.equal((await istek(c.planlama, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum })).statusCode, 409);
    assert.equal((await istek(c.operator, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true })).statusCode, 403);
    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/canliyi-al`, { surum: s.surum });
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.equal(s.canliDegisti, false);
    const kopya = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/cogalt`)).senaryolar.find((x) => x.ad === 'Deneme senaryo (kopya)');
    assert.ok(kopya);
    assert.equal((await istek(c.planlama2, 'POST', `/plan/senaryolar/${s.id}/vazgec`, { surum: s.surum })).statusCode, 403, 'başkasının senaryosu');
    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/vazgec`, { surum: s.surum });
    assert.equal(l.senaryolar.find((x) => x.id === s.id)?.durum, 'vazgecildi');
    assert.equal((await istek(c.planlama, 'POST', '/plan/oner', { taslak: { id: s.id, surum: s.surum + 1 } })).statusCode, 409);
  });

  test('#262: bölünmüş alt parti planda ayrı emirdir ve üst emrini taşır; bölünmemiş emirde üst boş', async () => {
    const [ilk, ikinci] = await isEmirleriAc([yeniAdim(), yeniAdim({ kaynak: { tur: 'makine', id: makineB } })], 10);
    await vt().tx((db) => db.sorgu(
      "UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [ilk]));
    const ustId = (await vt().tx((db) => db.tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [ikinci])))!.id;
    const ust = await tamam<{ emir: { surum: number } }>(c.planlama, 'GET', `/adimli-emirler/${ustId}`);
    const { altEmirId } = await tamam<{ altEmirId: number }>(c.planlama, 'POST', `/adimli-emirler/${ustId}/bol`, { adimSira: 2, adet: 4, surum: ust.emir.surum });
    // Üst emrin kalan adımı çalışıyor ve canlıda yeri yok: öneri onu yerleştirmez, yerleşmemiş satırından gelir.
    await isEmriDurumu(ikinci!, 'calisiyor');
    const p = await taslaktaOner();
    const emir = (id: number) => p.emirler.find((x) => x.uretimEmriId === id)!;
    assert.deepEqual([emir(ustId).ustEmirId, emir(altEmirId).ustEmirId, emir(altEmirId).adet], [null, ustId, 4]);
    // Yerleşim ve yerleşmemiş satırı ayrı yollardan gelir; ikisi de üst emri taşır.
    assert.equal(p.yerlesimler.find((y) => y.uretimEmriId === altEmirId)?.ustEmirId, ustId, 'yerleşim satırı');
    const ustIsi = p.yerlesmemis.find((y) => y.uretimEmriId === ustId);
    assert.ok(ustIsi, 'üst emrin adımı bu kurulumda yerleşmemiş gelir');
    assert.equal(ustIsi.ustEmirId, null);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('B7: kol üstün önceki adımını, üstün birleşme adımı kolun son adımını bekler; adım kolların adediyle sürer', async () => {
    const [a, b, son] = await isEmirleriAc([yeniAdim(), yeniAdim({ kaynak: { tur: 'makine', id: makineB } }), yeniAdim()], 10);
    const satir = (id: number) => vt().tx((db) => db.tek<{ emir: number; op: number }>(
      'SELECT uretim_emri_id AS emir, op_no AS op FROM uretim_emirleri_is_emri WHERE id = $1', [id]));
    const { emir: ustId } = (await satir(a!))!;
    const ust = await tamam<{ emir: { surum: number } }>(c.planlama, 'GET', `/adimli-emirler/${ustId}`);
    const opB = (await satir(b!))!.op;
    const rework = { oncekiOpNo: opB, opNo: opB + 1, tur: 'rework', ad: 'Deneme rework', operasyonTipiId: tip('TRN'), kaynak: { tur: 'makine', id: makineB },
      ayarSuresiDk: '10', birimSureDk: '1', terminGun: null };
    const { altEmirId } = await tamam<{ altEmirId: number }>(c.planlama, 'POST', `/adimli-emirler/${ustId}/bol`,
      { adimSira: 2, adet: 4, birlesmeOpNo: (await satir(son!))!.op, ekAdimlar: [rework], surum: ust.emir.surum });
    const p = await taslaktaOner();
    const kol = p.yerlesimler.filter((y) => y.uretimEmriId === altEmirId).sort((x, y) => x.opNo - y.opNo);
    assert.deepEqual(kol.map((y) => y.tur), ['rota', 'rework'], 'kol birleşme adımını taşımaz; ek adım türüyle gelir');
    const dk = (y: { baslangic: string; bitis: string }) => (Date.parse(y.bitis) - Date.parse(y.baslangic)) / 60_000;
    // Ayar + adet x birim: bölünmeden önceki ve birleşme adımı 10, üstün kalan adımı 6, kol 4 adet işler.
    assert.deepEqual([dk(yer(p, a!)), dk(yer(p, b!)), dk(kol[0]!), dk(kol[1]!), dk(yer(p, son!))], [50, 42, 38, 14, 50]);
    assert.ok(Date.parse(kol[0]!.baslangic) >= Date.parse(yer(p, a!).bitis), 'kol üstün önceki adımını bekler');
    assert.ok(Date.parse(yer(p, son!).baslangic) >= Date.parse(kol[1]!.bitis), 'birleşme adımı kolun son adımını bekler');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('#1372: kural gelmeden onaylanmış, ilk adımı girensiz rotadan açılan emir plana alınmaz, uyarıyla nedeni gösterilir', async () => {
    const urun = await mamulAc();
    const rev = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim()]);
    const [ilk] = (await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 10, teslim: null })).isEmriIdleri;
    // Eski onaylı rota: yürürlükteki içerik tetikleyiciyle korunur; tetikleyici yalnız bu silmede kapatılır.
    await ortam!.sahip.tx(async (db) => {
      await db.sorgu('ALTER TABLE rota_bileseni DISABLE TRIGGER USER');
      await db.sorgu('DELETE FROM rota_bileseni WHERE adim_id IN (SELECT id FROM rota_adimi WHERE revizyon_id = $1)', [rev]);
      await db.sorgu('ALTER TABLE rota_bileseni ENABLE TRIGGER USER');
    });
    const p = await taslaktaOner();
    assert.equal(yer(p, ilk!), undefined);
    assert.ok(p.uyarilar.some((u) => /plana alınmadı\. Rotada girdi eksik \(OP 10: giren \(hammadde ya da yarı mamul\) seçilmeli\)\.$/.test(u)), p.uyarilar.join(' | '));
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('emir önceliği ve başlangıcı plana gelir; taslak emir yalnız "taslak emirleri de planla" ayarıyla, uyarıyla yerleşir', async () => {
    const [acil] = await isEmirleriAc([yeniAdim()], 10, null, { oncelik: 1, baslangic: '2026-11-02' });
    const [tas] = await isEmirleriAc([yeniAdim()], 10, null, { taslak: true });
    let p = await taslaktaOner();
    const e = p.emirler.find((x) => x.uretimEmriId === yer(p, acil!).uretimEmriId)!;
    assert.equal(e.oncelik, 1);
    assert.ok(Date.parse(yer(p, acil!).baslangic) >= tesisGunBasi('2026-11-02'), 'emir başlangıcının tesis 00:00\'ından önce başlamaz');
    assert.equal(yer(p, tas!), undefined, 'taslak emir varsayılan olarak plana girmez');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, taslakEmirler: true } });
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    assert.ok(yer(p, tas!).uyarilar.some((u) => /Taslak emir/.test(u)));
    assert.equal(yer(await planOku(), tas!), undefined, 'canlı değişmez');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('196 a: sıra elle > teslim > öncelik; öncelik siparişin gecikme bedelinden çıkar: aynı teslimde cezalı büyük siparişin emri önce', async () => {
    const [a] = await isEmirleriAc([yeniAdim()], 10, '2030-01-10');
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-01-10');
    const [erken] = await isEmirleriAc([yeniAdim()], 10, '2030-01-09');
    const [acil] = await isEmirleriAc([yeniAdim()], 10, '2030-01-11', { oncelik: 1 });
    // b'nin emri günlük %1 cezalı 2.400.000 TL'lik satıra bağlanır: 1 saat gecikme 1.000 TL, taban 150 TL. Bağın kuralı uretim-emirleri'nde sınanır.
    await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 196', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const sp = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani, gecikme_ceza_orani)
        VALUES ('SS-2030-196', 'onayli', $1, current_date, current_date + 30, 20, $2, $2, now(), 1) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 240000) RETURNING id', [sp, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
    });
    const p = await taslaktaOner();
    assert.equal(p.ayar.kural, 'oncelik');
    const bas = (id: number | undefined) => Date.parse(yer(p, id!).baslangic);
    assert.ok(bas(b) < bas(a), 'aynı teslimde bedeli yüksek emir önce');
    assert.ok(bas(erken) < bas(a) && bas(a) < bas(acil), 'teslim öncelikten önce gelir: elle acil emir, teslimi erken emirlerin arkasında');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('denetim #21, 203 a: öncelik kuralında plan TL toplamıyla iyileşir: teslimi erken ama ucuz emir, pahalı geciken emrin arkasına geçer', async () => {
    // İkisi de gecikmiş (teslimleri geçmişte), aynı makinede 50'şer dakika. Kural teslimi erken A'yı öne alır; A taban (150 TL/sa), B Yüksek
    // öncelikli (300 TL/sa). Arkada kalan 50 dakika fazla gecikir: B önde olunca toplam 125 TL düşer.
    const gun = (fark: number) => new Date(Date.now() + fark * 86_400_000).toISOString().slice(0, 10);
    const [a] = await isEmirleriAc([yeniAdim()], 10, gun(-3));
    const [b] = await isEmirleriAc([yeniAdim()], 10, gun(-2), { oncelik: 1 });
    const p = await taslaktaOner();
    const bas = (id: number | undefined) => Date.parse(yer(p, id!).baslangic);
    assert.ok(bas(b) < bas(a), 'pahalı geciken emir önce');
    const ekran = await tamam<MotorYerlesimiCevabi>(c.planlama, 'GET', `/plan/motor-yerlesimi?taslak=${String(p.taslak!.id)}`);
    const ekranBas = (id: number | undefined) => Date.parse(ekran.yerlesimler.find((y) => y.isEmriId === id)!.baslangic);
    assert.ok(ekranBas(b) < ekranBas(a), 'ekranın motor yerleşimi de aynı sırayı görür');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('265 a: müşteri sınıfı çözücüden okunur; A sınıfı müşterinin emri aynı teslimde öne geçer; çözücü kayıtsızken sınıf yok', async () => {
    const [a] = await isEmirleriAc([yeniAdim()], 10, '2030-02-10');
    const [x] = await isEmirleriAc([yeniAdim()], 10, '2030-02-10');
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-02-10');
    // b fiyatsız bir satıra bağlanır: bedeli tabanda (150), A sınıfıyla 225 olur; ortanca 150'nin 1,5 katı, yani Yüksek.
    const firma = await ortam!.sahip.tx(async (db) => {
      const f = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 265', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const sp = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-265', 'onayli', $1, current_date, current_date + 30, 20, $2, $2, now()) RETURNING id`, [f, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar) VALUES ($1, 1, $2, 10) RETURNING id', [sp, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
      return f;
    });
    const bas = (p: PlanCevabi, id: number | undefined) => Date.parse(yer(p, id!).baslangic);
    let p = await taslaktaOner();
    assert.ok(bas(p, a) < bas(p, x) && bas(p, x) < bas(p, b), 'sınıfsız: eşitlikte emir numarası');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    let istenen: number[] = [];
    musteriSinifiCozucusu(async (_db, idler) => { istenen = [...idler]; return new Map(idler.map((id) => [id, id === firma ? 'A' as const : null])); });
    try {
      p = await taslaktaOner();
      assert.ok(bas(p, b) < bas(p, a), 'A sınıfı müşterinin emri öne geçer');
      assert.ok(istenen.includes(firma));
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    } finally {
      musteriSinifiCozucusu(null);
    }
  });

  test('6a: elle çarpan siparişe gerekçeyle yazılır; plan.yaz 0,5-2, siparisler.onayla 3e kadar; çarpan öncelik çarpanının yerine bedele girer', async () => {
    const [a] = await isEmirleriAc([yeniAdim()], 10, '2030-02-10');
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-02-10');
    const sp = await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 6a', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-601', 'onayli', $1, current_date, current_date + 30, 20, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 1) RETURNING id', [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
      return id;
    });
    const bas = (p: PlanCevabi, id: number | undefined) => Date.parse(yer(p, id!).baslangic);
    let p = await taslaktaOner();
    assert.ok(bas(p, a) < bas(p, b), 'çarpansız iki emir de taban bedelde, eşitlikte emir numarası');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });

    const yol = `/plan/siparisler/${sp}/carpan`;
    assert.equal((await istek(c.planlama, 'POST', yol, { carpan: 2.5, gerekce: 'Müşteri hattı durdu' })).statusCode, 403, 'planlama 2nin üstüne çıkamaz');
    assert.equal((await istek(c.planlama, 'POST', yol, { carpan: 1.5, gerekce: '  ' })).statusCode, 400, 'gerekçe zorunlu');
    assert.equal((await istek(c.planlama, 'POST', yol, { carpan: 0.4, gerekce: 'Düşük' })).statusCode, 400);
    assert.equal((await istek(c.mudur, 'POST', yol, { carpan: 3.5, gerekce: 'Çok acil' })).statusCode, 400);
    assert.equal((await istek(c.kalite, 'POST', yol, { carpan: 1, gerekce: 'Deneme' })).statusCode, 403);
    assert.equal((await istek(c.planlama, 'POST', '/plan/siparisler/999999/carpan', { carpan: 1, gerekce: 'Deneme' })).statusCode, 404);
    await tamam(c.planlama, 'POST', yol, { carpan: 2, gerekce: 'Teslim öne alındı' });
    const son = await tamam<{ siparisId: number; gecerli: { carpan: number; gerekce: string } | null; gecmis: { carpan: number; gerekce: string; kisiId: number }[] }>(
      c.mudur, 'POST', yol, { carpan: 3, gerekce: 'Müşteri hattı durdu' });
    assert.deepEqual(son.gecerli && { carpan: son.gecerli.carpan, gerekce: son.gecerli.gerekce }, { carpan: 3, gerekce: 'Müşteri hattı durdu' });
    assert.deepEqual(son.gecmis.map((x) => x.carpan), [3, 2], 'geçmiş yeniden eskiye, silinmez');
    const okunan = await tamam<typeof son>(c.mudur, 'GET', yol);
    assert.equal((await tamam<typeof son>(c.planlama, 'GET', yol)).gecmis.length, 2);
    for (const kim of [c.kalite, c.operator]) assert.equal((await istek(kim, 'GET', yol)).statusCode, 403, '237 a: gerekçe ticari bilgi, yalnız planı yazan, ayarı yapan ya da fiyat gören okur');
    assert.deepEqual(okunan.gecmis.map((x) => x.gerekce), ['Müşteri hattı durdu', 'Teslim öne alındı']);
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_siparis_carpani SET carpan = 1')), /yalnız ekleme/);

    p = await taslaktaOner();
    assert.ok(bas(p, b) < bas(p, a), 'çarpan 3: siparişin emri bedelde öne geçer');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('6b: bedel ayarı plan ayarında; varsayılanlar kodun değerleri, sınıf eşikleri ayardan; 237 a: yalnız planı yazan, ayarı yapan ya da fiyat gören okur', async () => {
    for (const kim of [c.kalite, c.operator]) assert.equal((await istek(kim, 'GET', '/plan/bedel-ayari')).statusCode, 403);
    assert.deepEqual(await tamam(c.mudur, 'GET', '/plan/bedel-ayari'),
      { tabanBedelSaat: 150, finansmanOraniGun: null, karRiskiOraniGun: 0.3, yuksekEsigi: 1.5, dusukEsigi: 0.6, yuksekCarpani: 2, normalCarpani: 1, dusukCarpani: 0.5, sinifACarpani: 1.5, sinifBCarpani: 1, sinifCCarpani: 0.7 });
    const [a] = await isEmirleriAc([yeniAdim()], 10, '2030-03-10');
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-03-10');
    const sp = await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 6b', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-602', 'onayli', $1, current_date, current_date + 30, 20, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 1) RETURNING id', [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
      return id;
    });
    await tamam(c.mudur, 'POST', `/plan/siparisler/${sp}/carpan`, { carpan: 3, gerekce: 'Eşik denemesi' });
    // 306 a: çarpan kartı siparişin emirlerinin bedelini, bandını ve bant sınırlarını (TL) gösterir.
    const { bant } = await tamam<SiparisBandiCevabi>(c.planlama, 'GET', `/plan/siparisler/${sp}/bant`);
    assert.ok(bant);
    assert.equal(bant.emirler.length, 1);
    assert.deepEqual([bant.emirler[0]!.bedel, bant.emirler[0]!.sinif], [450, 'yuksek']);
    assert.ok(Math.abs(bant.yuksekSiniri / bant.dusukSiniri - 1.5 / 0.6) < 1e-9, JSON.stringify(bant));
    assert.ok(bant.emirler[0]!.bedel >= bant.yuksekSiniri);
    const satirsiz = (await ortam!.sahip.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id)
      SELECT 'SS-2030-699', 'taslak', firma_id, current_date, current_date + 30, 20, olusturan_id FROM siparisler_siparis WHERE id = $1 RETURNING id`, [sp]))!.id;
    assert.equal((await tamam<SiparisBandiCevabi>(c.planlama, 'GET', `/plan/siparisler/${satirsiz}/bant`)).bant, null, 'planda emri olmayan siparişte bant yok');
    for (const kim of [c.kalite, c.operator]) assert.equal((await istek(kim, 'GET', `/plan/siparisler/${sp}/bant`)).statusCode, 403, 'bedel TL, çarpanı okuyan okur');
    assert.equal((await istek(c.planlama, 'GET', '/plan/siparisler/999999/bant')).statusCode, 404);
    const bas = (p: PlanCevabi, id: number | undefined) => Date.parse(yer(p, id!).baslangic);
    let p = await taslaktaOner();
    assert.ok(bas(p, b) < bas(p, a), 'varsayılan eşiklerde çarpanlı sipariş Yüksek, diğeri Düşük');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    // Çarpanlı emrin bedeli 450, diğer emirler tabanda (150, ortanca): eşikler 4 ve 0,4 olunca ikisi de Normal, eşitlikte emir numarası.
    await ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_ayari SET yuksek_esigi = 4, dusuk_esigi = 0.4'));
    try {
      p = await taslaktaOner();
      assert.ok(bas(p, a) < bas(p, b), 'eşikler ayardan okunur');
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    } finally {
      await ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_ayari SET yuksek_esigi = 1.5, dusuk_esigi = 0.6'));
    }
  });

  test('220 a: motor yerleşimi yazmadan döner; plan ekranını açan okur, açamayan okuyamaz (232 a); öner aynı yerleri yazar', async () => {
    const [a1, a2] = await isEmirleriAc([yeniAdim(), yeniAdim()], 10, '2030-05-10');
    const surum = (await istek(c.kalite, 'GET', '/plan/surum')).json<{ planSurumu: number }>().planSurumu;
    const m = await tamam<MotorYerlesimiCevabi>(c.kalite, 'GET', '/plan/motor-yerlesimi');
    assert.equal((await istek(c.kalite, 'GET', '/plan/surum')).json<{ planSurumu: number }>().planSurumu, surum, 'okumak canlıyı değiştirmez');
    const satir = (id: number | undefined) => m.yerlesimler.find((y) => y.isEmriId === id)!;
    assert.equal(satir(a1).sabit, false);
    assert.ok(Date.parse(satir(a1).bitis) <= Date.parse(satir(a2).baslangic), 'rota sırası');
    assert.equal(typeof satir(a1).emirNo, 'string');
    assert.deepEqual(m.ekranYerlesimi[`${satir(a1).emirNo}|${String(satir(a1).opNo)}`], [{ makineId: satir(a1).kaynak.id, baslangic: satir(a1).baslangic }], 'ekran anahtarı canlı kuyruktaki gibi');
    const p = await taslaktaOner();
    try {
      // Motor "şimdi"den sayar: iki çağrı arasındaki saniyeler dışında aynı yer ve kaynak.
      for (const id of [a1, a2]) {
        assert.deepEqual(yer(p, id!).kaynak, satir(id).kaynak);
        assert.ok(Math.abs(Date.parse(yer(p, id!).baslangic) - Date.parse(satir(id).baslangic)) < 60_000, 'öner motorun yerini yazar');
      }
    } finally {
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    }
    assert.deepEqual(m.uyarilar, [], 'kısıt kapalıyken uyarı yok');
    // 307 a: kısıt açıkken personel verisi olan iş merkezi yoksa motor sınırlamaz; ekran bunu uyarıdan bilir.
    const q = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: null, ayar: { ...p.ayar, personelKisiti: true } });
    try {
      const mk = await tamam<MotorYerlesimiCevabi>(c.planlama, 'GET', `/plan/motor-yerlesimi?taslak=${String(q.taslak!.id)}`);
      assert.deepEqual(mk.uyarilar, q.personelYuku.length === 0 ? [PERSONEL_TANIMSIZ] : []);
    } finally {
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${q.taslak!.id}/vazgec`, { surum: q.taslak!.surum });
    }
    assert.equal((await istek(c.kalite, 'GET', '/plan/motor-yerlesimi?taslak=999999')).statusCode, 404);
    assert.equal((await istek(c.operator, 'GET', '/plan/motor-yerlesimi')).statusCode, 403, 'plan ekranını açamayan okuyamaz');
  });

  test('6c: planın TL toplamını yalnız fiyatı gören görür (180); finansman oranı toplamı artırır; karşılaştırma her kuralın toplamını verir', async () => {
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-04-10');
    await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 6c', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-603', 'onayli', $1, current_date, current_date + 30, 20, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 240000) RETURNING id', [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
    });
    // Yönetici bütün işlemleri alır (fiyat-oku dahil); planlama fiyatı görmez.
    const p = await taslaktaOner(c.yonetici);
    const q = await taslaktaOner();
    try {
      assert.equal(q.gostergeler.maliyetTl, null, 'planlama fiyatı görmez');
      const k = await tamam<KarsilastirmaCevabi>(c.planlama, 'GET', `/plan/karsilastir?taslak=${q.taslak!.id}`);
      assert.ok(k.secenekler.every((x) => x.maliyetTl === null), 'planlamaya karşılaştırmada da TL yok');
      const once = p.gostergeler.maliyetTl;
      assert.equal(typeof once, 'number');
      await ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_ayari SET finansman_orani_gun = 0.12'));
      assert.ok((await planOku(p.taslak!.id, c.yonetici)).gostergeler.maliyetTl! > once!, '2.400.000 TL satır bitişine kadar finansman öder');
      const ky = await tamam<KarsilastirmaCevabi>(c.yonetici, 'GET', `/plan/karsilastir?taslak=${p.taslak!.id}`);
      assert.ok(ky.secenekler.every((x) => typeof x.maliyetTl === 'number'));
    } finally {
      await tamam(c.yonetici, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: (await planOku(p.taslak!.id, c.yonetici)).taslak!.surum });
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${q.taslak!.id}/vazgec`, { surum: q.taslak!.surum });
      await ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_ayari SET finansman_orani_gun = NULL'));
    }
  });

  test('284 a: gecikme cezası sipariş satırının termininden işler, emrin tesliminden değil', async () => {
    const gun = (fark: number) => new Date(Date.now() + fark * 86_400_000).toISOString().slice(0, 10);
    // Emrin teslimi ileride, satırın termini iki gün önce geçti: günlük %1 cezalı 2.400.000 TL'lik satır saatte 1.000 TL öder.
    const [b] = await isEmirleriAc([yeniAdim()], 10, gun(30));
    await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 284', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani, gecikme_ceza_orani)
        VALUES ('SS-2030-284', 'onayli', $1, current_date - 10, current_date + 30, 20, $2, $2, now(), 1) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, termin) VALUES ($1, 1, $2, 10, 240000, current_date - 2) RETURNING id', [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
    });
    const p = await taslaktaOner(c.yonetici);
    try {
      assert.ok(p.gostergeler.maliyetTl! > 24_000, `geçen termin cezalı: ${String(p.gostergeler.maliyetTl)}`);
    } finally {
      await tamam(c.yonetici, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
      // Geciken cezalı satır sonraki testlerin TL toplamına girmesin.
      await ortam!.sahip.tx((db) => db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = NULL WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $1)', [b]));
    }
  });

  test('6c, 227 a: kâr riski Proje maliyet çözücülerinin katkı payıyla işler; malzeme katkıdan düşülür; çözücü kayıtsızken işlemez', async () => {
    // Termini geçmiş (284 a: ceza satırın termininden), cezasız 2.400.000 TL satır: gecikme saatinde taban 150 TL, katkı payı 2.400.000 − 400.000 ile kâr riski saatte 250 TL.
    const [g] = await isEmirleriAc([yeniAdim()], 10, '2020-01-10');
    await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 6c-k', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-604', 'onayli', $1, '2020-01-01', current_date + 30, 20, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [g!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>("INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, termin) VALUES ($1, 1, $2, 10, 240000, '2020-01-10') RETURNING id", [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, g]);
    });
    malzemeMaliyetiCozucusu(null);
    const p = await taslaktaOner(c.yonetici);
    try {
      const once = p.gostergeler.maliyetTl!;
      const toplam = async () => (await planOku(p.taslak!.id, c.yonetici)).gostergeler.maliyetTl;
      tahminiMaliyetCozucusu(async (_db, idler) => new Map(idler.map((id) => [id, id === g ? 400000 : null])));
      assert.equal(await toplam(), once, 'malzeme çözücüsü kayıtsızken katkı bilinmez');
      malzemeMaliyetiCozucusu(async (_db, idler) => new Map(idler.map((id) => [id, 0])));
      const sonra = (await toplam())!;
      assert.ok(sonra > once, 'katkı payı bilinen geciken satırda kâr riski tabanı aşar');
      malzemeMaliyetiCozucusu(async (_db, idler) => new Map(idler.map((id) => [id, 2_000_000])));
      assert.equal(await toplam(), once, 'malzeme katkıdan düşülür: katkı sıfırsa kâr riski tabanı aşmaz');
      malzemeMaliyetiCozucusu(async (_db, idler) => new Map(idler.map((id) => [id, 0])));
      tahminiMaliyetCozucusu(async (_db, idler) => new Map(idler.map((id) => [id, null])));
      assert.equal(await toplam(), once, 'maliyeti bilinmeyen satırda kâr riski yok');
      assert.equal(await ortam!.sahip.tx((db) => karRiskiOraniGun(db)), 0.3, 'kâr riski oranı plan bedel ayarından');
    } finally {
      tahminiMaliyetCozucusu(isEmriTahminiMaliyetleri);
      malzemeMaliyetiCozucusu(uretimEmriMalzemeMaliyetleri);
      await tamam(c.yonetici, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: (await planOku(p.taslak!.id, c.yonetici)).taslak!.surum });
    }
  });

  test('225: aynı satıra bağlı emir satırın birim fiyatıyla kendi adedi kadar tutar taşır; satırın tamamı her emre yazılmaz', async () => {
    // Termini geçmiş (284 a), günde %1 cezalı satır; emir 10 adet. Satır 10 adetse emir tutarın tamamını, 20 adetse yarısını taşır.
    const [g] = await isEmirleriAc([yeniAdim()], 10, '2020-01-10');
    const satirId = await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 225', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani, gecikme_ceza_orani)
        VALUES ('SS-2030-605', 'onayli', $1, '2020-01-01', current_date + 30, 20, $2, $2, now(), 1) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [g!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>("INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, termin) VALUES ($1, 1, $2, 10, 240000, '2020-01-10') RETURNING id", [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, g]);
      return satir;
    });
    const p = await taslaktaOner(c.yonetici);
    try {
      const tam = p.gostergeler.maliyetTl!;
      await ortam!.sahip.tx((db) => db.sorgu('UPDATE siparisler_siparis_satiri SET miktar = 20, birim_fiyat = 120000 WHERE id = $1', [satirId]));
      const yarim = (await planOku(p.taslak!.id, c.yonetici)).gostergeler.maliyetTl!;
      assert.ok(yarim < tam, 'aynı satır tutarında emrin payı yarıya iner, ceza da iner');
    } finally {
      await tamam(c.yonetici, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: (await planOku(p.taslak!.id, c.yonetici)).taslak!.surum });
    }
  });

  test('210 a, denetim #21: bedel ayarını yalnız plan.bedel-ayari değiştirir (müdür); planlama değiştiremez; değerler sınırlıdır; çarpansız gövde çarpanları korur', async () => {
    const varsayilan = { tabanBedelSaat: 150, finansmanOraniGun: null, karRiskiOraniGun: 0.3, yuksekEsigi: 1.5, dusukEsigi: 0.6, yuksekCarpani: 2, normalCarpani: 1, dusukCarpani: 0.5, sinifACarpani: 1.5, sinifBCarpani: 1, sinifCCarpani: 0.7 };
    const yeni = { tabanBedelSaat: 200, finansmanOraniGun: 0.14, karRiskiOraniGun: 0.25, yuksekEsigi: 1.8, dusukEsigi: 0.5 };
    const carpanlar = { yuksekCarpani: 3, normalCarpani: 1.2, dusukCarpani: 0.4, sinifACarpani: 2, sinifBCarpani: 1.1, sinifCCarpani: 0.6 };
    assert.equal((await istek(c.planlama, 'POST', '/plan/bedel-ayari', yeni)).statusCode, 403);
    assert.equal((await istek(c.mudur, 'POST', '/plan/bedel-ayari', { ...yeni, dusukEsigi: 1.2 })).statusCode, 400);
    assert.equal((await istek(c.mudur, 'POST', '/plan/bedel-ayari', { ...yeni, tabanBedelSaat: 0 })).statusCode, 400);
    assert.equal((await istek(c.mudur, 'POST', '/plan/bedel-ayari', { ...yeni, sinifCCarpani: 0 })).statusCode, 400);
    assert.equal((await istek(c.mudur, 'POST', '/plan/bedel-ayari', { ...yeni, yuksekCarpani: 6 })).statusCode, 400);
    try {
      assert.deepEqual(await tamam(c.mudur, 'POST', '/plan/bedel-ayari', { ...yeni, ...carpanlar }), { ...yeni, ...carpanlar });
      assert.deepEqual(await tamam(c.mudur, 'POST', '/plan/bedel-ayari', { ...yeni, tabanBedelSaat: 250 }), { ...yeni, ...carpanlar, tabanBedelSaat: 250 },
        'çarpanları göstermeyen ekranın gövdesi çarpanları değiştirmez');
      assert.deepEqual(await tamam(c.cam, 'GET', '/plan/bedel-ayari'), { ...yeni, ...carpanlar, tabanBedelSaat: 250 });
    } finally {
      await tamam(c.mudur, 'POST', '/plan/bedel-ayari', varsayilan);
    }
    assert.deepEqual(await tamam(c.planlama, 'GET', '/plan/bedel-ayari'), varsayilan);
  });

  test('282 a: personel kısıtı açıkken kişi-dakikası dolan güne aynı merkezde yeni iş konmaz, ertesi uygun güne kayar; kapalıyken aynı gün', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-IM282', ad: 'Personel merkezi', aciklama: null });
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-282', ad: 'Deneme 282', isMerkeziId: merkez.id })).id;
    const m1 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-M282A', ad: 'Deneme 282 A', istasyonId: ist })).id;
    const m2 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-M282B', ad: 'Deneme 282 B', istasyonId: ist })).id;
    const kisi = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme personelci', kullaniciAdi: 'personelci', parola: PAROLA }));
    // Kişi %10 atanır: günde 144 kişi-dakikası; ilk iş (30 + 10 × 2 = 50 dk, operatör 3) 150 ister ve günü doldurur.
    await tamam(c.yonetici, 'POST', `/istasyonlar/${ist}/kisiler/ata`, { kisiId: kisi, yuzde: '10.00' });
    await tamam(c.yonetici, 'POST', `/istasyonlar/${ist}/plan-ayari`, { verimYuzde: 100, operatorIhtiyaci: 3, surum: 0 });
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: m1 } })]);
    const [i2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: m2 } })]);
    let p = await taslaktaOner();
    const gun = (x: PlanCevabi, id: number) => tesisGunu(Date.parse(yer(x, id).baslangic));
    assert.equal(gun(p, i2!), gun(p, i1!), 'kısıt kapalıyken iki makine aynı gün');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, personelKisiti: true } });
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    assert.ok(gun(p, i2!) > gun(p, i1!), `dolu günden sonra: ${gun(p, i1!)} / ${gun(p, i2!)}`);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('PL-03, PL-04, PL-09: vardiyalı makine yalnız çalışma aralığında çalışır; kişi kısıtı yükü; kapalı gün canlıya vardiya yetkisiyle yazılır', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-IM2', ad: 'Vardiyalı merkez', aciklama: null });
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-C', ad: 'Deneme C', isMerkeziId: merkez.id })).id;
    const makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MC', ad: 'Deneme makine C', istasyonId: ist })).id;
    const v = await tamam<{ vardiyalar: { id: number; ad: string }[] }>(c.yonetici, 'POST', '/vardiyalar', { ad: 'RT sabah', baslangic: '08:00', bitis: '12:00', molalar: [], aktif: true });
    const vardiya = v.vardiyalar.find((x) => x.ad === 'RT sabah')!.id;
    for (let gun = 1; gun <= 7; gun++) await tamam(c.yonetici, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkez.id, gun, vardiyaId: vardiya, acik: true });
    const kisi = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme vardiyaci', kullaniciAdi: 'vardiyaci', parola: PAROLA }));
    // Kart #1324: kişi iş merkezinde istasyon atamasının yüzdesi kadar sayılır.
    await tamam(c.yonetici, 'POST', `/istasyonlar/${ist}/kisiler/ata`, { kisiId: kisi, yuzde: '50.00' });
    await tamam(c.yonetici, 'POST', `/istasyonlar/${ist}/plan-ayari`, { verimYuzde: 100, operatorIhtiyaci: 10, surum: 0 });

    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makine } })]);
    let p = await taslaktaOner();
    const y = yer(p, i1!);
    const bugun = tesisGunu(Date.now());
    const bitis = tesisGunu(Date.now() + 30 * 24 * 3600_000);
    const t = (await tamam<{ takvim: { araliklar: { baslangic: string; bitis: string }[] } }>(c.planlama, 'GET',
      `/calisma-takvimi?tur=makine&id=${makine}&baslangic=${bugun}&bitis=${bitis}`)).takvim.araliklar.map((a) => [Date.parse(a.baslangic), Date.parse(a.bitis)]);
    const [a, z] = [Date.parse(y.baslangic), Date.parse(y.bitis)];
    assert.ok(t.some(([x, w]) => x! <= a && a < w!), 'başlangıç vardiya içinde');
    const calisan = t.reduce((top, [x, w]) => top + Math.max(0, Math.min(w!, z) - Math.max(x!, a)), 0) / 60_000;
    assert.equal(Math.round(calisan), 30 + 10 * 2, 'süre yalnız çalışma aralıklarında geçer');
    // Z4: vardiya bitimine on dakika kala elle taşınan iş gece çalışmaz; kalan süresi ertesi vardiyada sürer.
    const [x0, w0] = t.find(([x]) => x! > Date.now() + 3600_000)!;
    const tasindi = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${i1!}/tasi`, {
      taslak: tg(p), kaynak: { tur: 'makine', id: makine }, baslangic: new Date(w0! - 10 * 60_000).toISOString(),
    });
    const [ta, tz] = [Date.parse(yer(tasindi, i1!).baslangic), Date.parse(yer(tasindi, i1!).bitis)];
    assert.equal(ta, w0! - 10 * 60_000);
    assert.ok(x0! < ta && tz > w0!, 'vardiya sonunu aşar');
    assert.equal(Math.round(t.reduce((top, [x, w]) => top + Math.max(0, Math.min(w!, tz) - Math.max(x!, ta)), 0) / 60_000), 50, 'yalnız çalışma aralığında 50 dakika');
    p = tasindi;

    // PL-09: iş merkezinde %50 atanmış bir kişi (240 dakikanın yarısı), istasyon on operatör ister: ihtiyaç kapasiteyi aşar; kısıt
    // kapalıyken sınırlı gün sayılmaz.
    const py = p.personelYuku.find((x) => x.isMerkeziId === merkez.id)!;
    assert.equal(Math.max(...py.kapasite), 120);
    assert.equal(py.ihtiyac.reduce((x, w) => x + w, 0), 500);
    assert.equal(p.gostergeler.personelGun, 0);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, personelKisiti: true } });
    assert.ok(p.gostergeler.personelGun! >= 1);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });


    // Tek tanım: makine ataması da kişi payıdır; %25 makineye atanan kişi kapasiteye 240 dakikanın çeyreğini ekler.
    const makineci = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme makineci', kullaniciAdi: 'makineci', parola: PAROLA }));
    await tamam(c.yonetici, 'POST', `/makineler/${makine}/kisiler/ata`, { kisiId: makineci, yuzde: '25.00' });
    p = await taslaktaOner();
    assert.equal(Math.max(...p.personelYuku.find((x) => x.isMerkeziId === merkez.id)!.kapasite), 180);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    // Kapalı gün denemesi: vardiya yazması olmayan kalite canlıya alamaz, müdür alır ve gün vardiya takvimine yazılır.
    let s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: 'Kapalı gün', aciklama: null })).senaryolar.find((x) => x.ad === 'Kapalı gün')!;
    s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur: 'gun', surum: s.surum })).senaryolar.find((x) => x.id === s.id)!;
    const tarih = s.degisiklikler.find((d) => d.tur === 'gun_kapat')!.ozet.slice(0, 10);
    {
      const r = await istek(c.kalite, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
      assert.equal(r.statusCode, 403);
      assert.match(r.body, /vardiya yazma yetkisi/);
    }
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
    const gunu = async (t: string) => (await tamam<{ gunler: { tarih: string; tur: string; ad: string | null }[] }>(c.planlama, 'GET', '/vardiya-takvimi')).gunler.find((g) => g.tarih === t);
    assert.deepEqual(await gunu(tarih), { tarih, tur: 'kapali', ad: 'Plan stüdyosu' });
    await tamam(c.yonetici, 'POST', `/takvim-gunleri/${tarih}/kaldir`);
    // O gün takvimde zaten tatilse üstüne yazılmaz.
    s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: 'Tatilli gün', aciklama: null })).senaryolar.find((x) => x.ad === 'Tatilli gün')!;
    s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur: 'gun', surum: s.surum })).senaryolar.find((x) => x.id === s.id)!;
    const tatil = s.degisiklikler.find((d) => d.tur === 'gun_kapat')!.ozet.slice(0, 10);
    await tamam(c.yonetici, 'POST', '/takvim-gunleri', { tarih: tatil, tur: 'tatil', ad: 'Deneme bayram' });
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
    assert.deepEqual(await gunu(tatil), { tarih: tatil, tur: 'tatil', ad: 'Deneme bayram' });
    await tamam(c.yonetici, 'POST', `/takvim-gunleri/${tatil}/kaldir`);
  });

  test('PL-04: vardiyası tanımlanmamış kaynak sürekli çalışır, uyarı alır; tatil günü yine çalışma vermez', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-IM3', ad: 'Vardiyasız merkez', aciklama: null });
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-D', ad: 'Deneme D', isMerkeziId: merkez.id })).id;
    const makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MD', ad: 'Deneme makine D', istasyonId: ist })).id;
    const yarin = tesisGunu(tesisGunBasi(tesisGunu(Date.now())) + 36 * 3600_000);
    await tamam(c.yonetici, 'POST', '/takvim-gunleri', { tarih: yarin, tur: 'tatil', ad: 'Deneme tatil' });
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makine } })], 1000);
    const p = await taslaktaOner();
    const y = yer(p, i1!);
    assert.ok(Date.parse(y.baslangic) < tesisGunBasi(yarin), 'bugün başlar');
    assert.equal(Math.round((Date.parse(y.bitis) - Date.parse(y.baslangic)) / 60_000), 30 + 1000 * 2 + 24 * 60, 'tatil günü atlanır');
    assert.ok(p.uyarilar.some((u) => /vardiya takvimi yok; sürekli çalışır sayıldı/.test(u)));
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    await tamam(c.yonetici, 'POST', `/takvim-gunleri/${yarin}/kaldir`);
  });

  test('P-B24: tesiste gece yarısı geçmiş, UTC\'de dünkü günken plan günü tesis günüdür; vardiyasız kaynağın kapalı günü tesisin 00:00\'ında başlar', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-IM4', ad: 'Gece merkezi', aciklama: null });
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-E', ad: 'Deneme E', isMerkeziId: merkez.id })).id;
    const makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-ME', ad: 'Deneme makine E', istasyonId: ist })).id;
    const gece = new Date().setUTCHours(21, 30, 0, 0);
    const gun = tesisGunu(gece);
    assert.notEqual(gun, new Date(gece).toISOString().slice(0, 10), 'an UTC\'de bir gün geride');
    const yarin = tesisGunu(tesisGunBasi(gun) + 36 * 3600_000);
    await tamam(c.yonetici, 'POST', '/takvim-gunleri', { tarih: yarin, tur: 'tatil', ad: 'Deneme tatil' });
    // 30 + 720 * 2 = 1470 dk: tesiste 00:30'da başlayan iş gün bitince 60 dk artar; artan dakika tatilden sonra işler.
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makine } })], 720);
    mock.timers.enable({ apis: ['Date'], now: gece });
    try {
      const p = await taslaktaOner();
      assert.equal(p.gunler[0], gun);
      const y = yer(p, i1!);
      assert.equal(Date.parse(y.baslangic), gece);
      assert.equal(Math.round((Date.parse(y.bitis) - gece) / 60_000), 1470 + 24 * 60, 'tatil tesisin 00:00\'ından 24 saat');
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    } finally {
      mock.timers.reset();
    }
    await tamam(c.yonetici, 'POST', `/takvim-gunleri/${yarin}/kaldir`);
  });

  test('P-B15 karar a: yalnız plan.canliya-al olan müdür planlamacının taslağını canlıya alır; kaynak iş emrine yazılır', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    const ileri = new Date(Date.parse(yer(p, i1!).baslangic) + 200 * 24 * 3600_000).toISOString();
    p = (await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: ileri })).json<PlanCevabi>();
    assert.equal(await isEmriMakinesi(i1!), makineA, 'taslak iş emrini değiştirmez');
    assert.equal((await istek(c.mudur, 'POST', '/plan/oner', { taslak: tg(p) })).statusCode, 403, 'müdür taslağa yazamaz');
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    assert.deepEqual(yer(await planOku(), i1!).kaynak, { tur: 'makine', id: makineB });
    assert.equal(await isEmriMakinesi(i1!), makineB);
  });

  test('A4: canlı sıra iş emri kimliğiyle okunur; başlangıç sırasıyla, taslaktaki değişiklik ve yerleşmemiş iş görünmez', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    const canli = await planOku();
    const okunan = await vt().tx((db) => canliSira(db, [i2!, i1!, 999_999]));
    assert.equal(okunan.planSurumu, canli.surum);
    assert.deepEqual(okunan.yerlesimler.map((y) => y.isEmriId), [i1, i2], 'başlangıç sırasıyla; yerleşmemiş iş yok');
    const y1 = okunan.yerlesimler[0]!;
    assert.deepEqual(y1.kaynak, yer(canli, i1!).kaynak);
    assert.equal(y1.baslangic.toISOString(), new Date(yer(canli, i1!).baslangic).toISOString());
    assert.equal(y1.elleSira, null);
    // Taslaktaki taşıma canlı sırayı değiştirmez (P6).
    p = await taslaktaOner();
    const ileri = new Date(Date.parse(yer(p, i1!).baslangic) + 200 * 24 * 3600_000).toISOString();
    p = (await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: ileri })).json<PlanCevabi>();
    assert.deepEqual((await vt().tx((db) => canliSira(db, [i1!]))).yerlesimler[0]!.kaynak, y1.kaynak);
    assert.deepEqual(await vt().tx((db) => canliSira(db, [])), { planSurumu: canli.surum, yerlesimler: [] });
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('280 a: planı, karşılaştırmayı, canlı yerleşimi ve senaryoları yalnız planı gören ya da yazan okur; sürüm oturumlu; sayaç göremeyene boş', async () => {
    for (const yol of ['/plan', '/plan/karsilastir', '/plan/canli-yerlesim?isEmirleri=', '/plan/senaryolar']) {
      assert.equal((await istek(c.operator, 'GET', yol)).statusCode, 403, `${yol} operatöre kapalı`);
      for (const kim of [c.cam, c.kalite, c.planlama]) assert.equal((await istek(kim, 'GET', yol)).statusCode, 200, yol);
    }
    assert.equal((await istek(c.operator, 'GET', '/plan/surum')).statusCode, 200, 'açık ekranların sürüm sorusu oturumlu');
    const k = (await kimlikCozucu(vt())({ headers: { cookie: c.planlama } } as never))!;
    const gormez = { ...k, islemler: k.islemler.filter((i) => i !== 'plan.oku' && i !== 'plan.yaz') };
    const say = await vt().tx(async (db) => [await menuSayaclari(db, k), await menuSayaclari(db, gormez)]);
    assert.equal(typeof say[0]!.plan, 'number');
    assert.deepEqual([say[1]!.plan, say[1]!.studyo], [null, null], 'planı göremeyen plan ve stüdyo sayacı almaz');
  });

  test('#522: GET /plan/canli-yerlesim planı görenle canlı yerleşimi okur, taslağı göstermez; oturumsuz 401, bozuk liste 400', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    const canli = await planOku();
    const oku = () => tamam<CanliYerlesimCevabi>(c.cam, 'GET', `/plan/canli-yerlesim?isEmirleri=${i1},999999`);
    const once = await oku();
    assert.equal(once.planSurumu, canli.surum);
    assert.equal(once.yerlesimler.length, 1, 'yerleşmemiş iş listede yok');
    assert.deepEqual(once.yerlesimler[0]!.kaynak, yer(canli, i1!).kaynak);
    assert.equal(Date.parse(once.yerlesimler[0]!.baslangic), Date.parse(yer(canli, i1!).baslangic));
    assert.equal(Date.parse(once.yerlesimler[0]!.bitis), Date.parse(yer(canli, i1!).bitis));
    p = await taslaktaOner();
    const ileri = new Date(Date.parse(yer(p, i1!).baslangic) + 200 * 24 * 3600_000).toISOString();
    p = (await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: ileri })).json<PlanCevabi>();
    assert.deepEqual(await oku(), once, 'taslaktaki taşıma görünmez (P6)');
    assert.deepEqual(await tamam<CanliYerlesimCevabi>(c.cam, 'GET', '/plan/canli-yerlesim?isEmirleri='), { planSurumu: canli.surum, yerlesimler: [] });
    assert.equal((await app.inject({ method: 'GET', url: `/api/plan/canli-yerlesim?isEmirleri=${i1}` })).statusCode, 401);
    assert.equal((await istek(c.cam, 'GET', '/plan/canli-yerlesim?isEmirleri=1,x')).statusCode, 400);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('A4: başka ekrandan sıralama kişinin taslağına yazılır, canlı müdür alınca değişir; yetkisiz, eski sürüm, kilitli ve boş reddedilir', async () => {
    const kullanici = async (cerez: string) => (await kimlikCozucu(vt())({ headers: { cookie: cerez } } as never))!;
    const planlamaci = await kullanici(c.planlama);
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    const once = await vt().tx((db) => canliSira(db, [i1!, i2!]));
    assert.deepEqual(once.yerlesimler.map((y) => y.isEmriId), [i1, i2]);
    const kaynak = once.yerlesimler[0]!.kaynak;
    assert.deepEqual(once.yerlesimler[1]!.kaynak, kaynak, 'iki iş aynı kuyrukta');
    const yaz = (k: Awaited<ReturnType<typeof kullanici>>, idler: number[], planSurumu = once.planSurumu) =>
      vt().tx((db) => kuyruguSirala(db, k, { kaynak, isEmriIdleri: idler, planSurumu }));

    const ilk = await yaz(planlamaci, [i2!, i1!]);
    assert.equal(ilk.taslakAcildi, true);
    assert.deepEqual((await vt().tx((db) => canliSira(db, [i1!, i2!]))).yerlesimler.map((y) => y.isEmriId), [i1, i2], 'canlı değişmez (P6)');
    const taslak = await planOku(ilk.taslakId);
    assert.ok(Date.parse(yer(taslak, i2!).baslangic) < Date.parse(yer(taslak, i1!).baslangic), 'taslakta yeni sıra');
    assert.equal(yer(taslak, i2!).elleSira, 1);
    const ikinci = await yaz(planlamaci, [i2!, i1!]);
    assert.deepEqual(ikinci, { taslakId: ilk.taslakId, taslakAcildi: false }, 'açık taslak yeniden kullanılır');

    // Ret: plan yazma yetkisi yok, okunan canlı plan eski, boş ya da yinelenen liste, kilitli iş.
    await assert.rejects(yaz(await kullanici(c.kalite), [i2!, i1!]), { kod: 'YETKI_YOK' });
    await assert.rejects(yaz(planlamaci, [i2!, i1!], once.planSurumu - 1), { kod: 'CAKISMA', ayrinti: { neden: ESKI_SURUM_NEDENI } });
    await assert.rejects(yaz(planlamaci, []), { kod: 'DOGRULAMA' });
    await assert.rejects(yaz(planlamaci, [i1!, i1!]), { kod: 'DOGRULAMA' });
    const t = await planOku(ilk.taslakId);
    assert.equal((await isEmriKomutu(t, i1!, 'kilitle')).statusCode, 200);
    await assert.rejects(yaz(planlamaci, [i1!, i2!]), { kod: 'CAKISMA' });

    const s = await planOku(ilk.taslakId);
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${s.taslak!.id}/canliya-al`, { surum: s.taslak!.surum, cakismalariKabul: true });
    assert.deepEqual((await vt().tx((db) => canliSira(db, [i1!, i2!]))).yerlesimler.map((y) => y.isEmriId), [i2, i1], 'canlıya alınınca yeni sıra');
  });

  test('Reçete ve Rota kuyrukları (#1186): sıra ve atama taslağa yazılır, taslak canlıya alınınca canliSira aynı sırayı verir; yetki, sabit iş ve ret', async () => {
    // Kuyruğun makinesi rotadaki istasyonda: elle seçilen makine yalnız rota istasyonunda tutulur (276 a, yazımdan sonra motor önerir).
    const b = (): AdimGirdisi => yeniAdim({ kaynak: { tur: 'makine', id: makineB } });
    const [i1] = await isEmirleriAc([b()]);
    const [i2] = await isEmirleriAc([b()]);
    const [i3] = await isEmirleriAc([b()]);
    const hepsi = [i1!, i2!, i3!];
    const ilk = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${ilk.taslak!.id}/canliya-al`, { surum: ilk.taslak!.surum, cakismalariKabul: true });
    const canli = await planOku();
    const kaynak = { tur: 'makine' as const, id: makineB };
    const ad = (id: number) => ({ emirNo: yer(canli, id).emirNo, opNo: yer(canli, id).opNo });
    const isler = (idler: number[], dondurulmus = false) => idler.map((id) => ({ ...ad(id), dondurulmus }));
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yaz = (cerez: string, govde: Record<string, unknown>) => istek(cerez, 'POST', '/plan/kuyruklari-yaz', govde);
    // Yayın yalnız taslağın canlıya alınmasıyla olur (Y2): önce kuyruk taslağa, sonra taslak canlıya.
    const canliyaYaz = async (cerez: string, govde: Record<string, unknown>) => {
      const yazma = await yaz(cerez, govde);
      if (yazma.statusCode !== 200) return { yazma, canliya: yazma };
      const id = yazma.json<{ taslak: number }>().taslak;
      const surum = (await planOku(id, cerez)).taslak!.surum;
      return { yazma, canliya: await istek(cerez, 'POST', `/plan/senaryolar/${id}/canliya-al`, { surum, cakismalariKabul: false }) };
    };
    const sira = async () => (await vt().tx((db) => canliSira(db, hepsi))).yerlesimler;

    // Taslağa yazma: canlı değişmez; planlamacı kendi taslağını görür.
    const taslagaYazildi = await yaz(c.cam, { kuyruklar: [{ kaynak, baslangic, isler: isler([i3!, i1!, i2!]) }] });
    assert.equal(taslagaYazildi.statusCode, 200, taslagaYazildi.body);
    assert.deepEqual(taslagaYazildi.json(), { taslak: taslagaYazildi.json<{ taslak: number }>().taslak, canli: false, yazilan: 3, atlanan: 0 });
    const onceki = (await sira()).map((y) => y.isEmriId);
    const taslak = await planOku(taslagaYazildi.json<{ taslak: number }>().taslak, c.cam);
    assert.deepEqual([i3!, i1!, i2!].map((id) => yer(taslak, id).elleSira), [1, 2, 3]);
    assert.deepEqual([i3!, i1!, i2!].every((id) => yer(taslak, id).kaynak.id === makineB), true);

    // Eski köprünün ayar ve canlıya alma alanları yok sayılır: kuyruk yalnız taslağa yazılır, canlı ve ayar değişmez.
    const ilkAyar = (await planOku()).ayar;
    const eskiKopru = await yaz(c.planlama, { ayar: { ...ilkAyar, kural: 'fifo' }, canliyaAl: true, kuyruklar: [{ kaynak, baslangic, isler: isler([i2!, i3!, i1!]) }] });
    assert.equal(eskiKopru.statusCode, 200, eskiKopru.body);
    assert.equal(eskiKopru.json<{ canli: boolean }>().canli, false);
    assert.deepEqual((await sira()).map((y) => y.isEmriId), onceki, 'canlı değişmez');
    assert.deepEqual((await planOku()).ayar, ilkAyar, 'canlı ayar değişmez');
    assert.deepEqual((await planOku(eskiKopru.json<{ taslak: number }>().taslak)).ayar, ilkAyar, 'taslağın ayarı değişmez');

    // Taslak canlıya alınınca terminal sırayı canliSira'dan aynı sırayla okur.
    const canliya = await canliyaYaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i2!, i3!, i1!]) }] });
    assert.equal(canliya.canliya.statusCode, 200, canliya.canliya.body);
    assert.equal(canliya.yazma.json<{ yazilan: number }>().yazilan, 3);
    const yeni = await sira();
    assert.deepEqual(yeni.map((y) => y.isEmriId), [i2, i3, i1]);
    assert.deepEqual(yeni.map((y) => y.elleSira), [1, 2, 3]);
    assert.deepEqual(yeni.every((y) => y.kaynak.tur === 'makine' && y.kaynak.id === makineB), true);
    assert.notDeepEqual(onceki, yeni.map((y) => y.isEmriId), 'sıra gerçekten değişti');
    for (let n = 1; n < yeni.length; n += 1) assert.ok(yeni[n]!.baslangic.getTime() >= yeni[n - 1]!.bitis.getTime(), 'kaynak aynı anda tek iş');
    // Reçete ve Rota plan şeridi: canlı özet aynı sırayı emir no ve op no ile verir; son canlıya almanın zamanı ve yapanı gelir.
    const ozet = await vt().tx((db) => canliOzeti(db));
    const anahtarlar = new Set([i1!, i2!, i3!].map((id) => `${ad(id).emirNo}|${ad(id).opNo}`));
    assert.deepEqual(ozet.kuyruklar.find((q) => q.makineId === makineB)?.isler.filter((x) => anahtarlar.has(x.anahtar)).map((x) => x.anahtar),
      [i2!, i3!, i1!].map((id) => `${ad(id).emirNo}|${ad(id).opNo}`));
    // K1: canlı planın saatini sunucu kurar; özet her işin canlı başlangıç ve bitişini verir, ekran çubukları bunlarla çizer.
    const ozetIsleri = ozet.kuyruklar.find((q) => q.makineId === makineB)!.isler;
    for (const y of yeni) {
      const x = ozetIsleri.find((i) => i.anahtar === `${ad(y.isEmriId).emirNo}|${ad(y.isEmriId).opNo}`)!;
      assert.deepEqual([x.baslangic, x.bitis, x.elle], [y.baslangic.toISOString(), y.bitis.toISOString(), y.elleSira !== null]);
    }
    assert.ok(ozet.sonCanliyaAlma !== null && Date.now() - Date.parse(ozet.sonCanliyaAlma.zaman) < 600_000, 'son canlıya alma az önce');
    assert.ok(ozet.sonCanliyaAlma?.kisi, 'canlıya alanın adı');
    assert.ok([...anahtarlar].every((a) => ozet.planlanacak.includes(a)), 'planlanacak iş emirleri');

    // Çoklu planlamacı: açık ekranlar hafif uçtan canlı plan sürümünü sorar. Ekran okuduğu sürümü gönderirse ve plan arada canlıya
    // alındıysa yazma eski sürüm diye reddedilir (taşı, yerleştir, kuyruk yazımı); güncel sürümle ya da sürümsüz (eski ekran) geçer.
    const surumCevabi = await istek(c.operator, 'GET', '/plan/surum');
    assert.equal(surumCevabi.statusCode, 200, surumCevabi.body);
    const okunan = surumCevabi.json<{ planSurumu: number; sonCanliyaAlma: { kisi: string | null } | null }>();
    assert.equal(okunan.planSurumu, ozet.planSurumu);
    assert.equal(okunan.sonCanliyaAlma?.kisi, ozet.sonCanliyaAlma?.kisi);
    const eskiOkunan = okunan.planSurumu - 1;
    const eskiYazma = await yaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i1!, i2!, i3!]) }], planSurumu: eskiOkunan });
    assert.equal(eskiYazma.statusCode, 409, eskiYazma.body);
    assert.deepEqual((await sira()).map((y) => y.isEmriId), [i2, i3, i1], 'eski sürümle yazılan sıra canlıya geçmez');
    assert.equal((await istek(c.planlama, 'POST', `/plan/is-emirleri/${i1!}/tasi`, { taslak: null, kaynak, baslangic, planSurumu: eskiOkunan })).statusCode, 409);
    assert.equal((await istek(c.planlama, 'POST', '/plan/yerlestir', { taslak: null, isEmriId: i1!, kaynak, baslangic, planSurumu: eskiOkunan })).statusCode, 409);
    const guncelYazma = await yaz(c.cam, { kuyruklar: [{ kaynak, baslangic, isler: isler([i1!, i2!, i3!]) }], planSurumu: okunan.planSurumu });
    assert.equal(guncelYazma.statusCode, 200, guncelYazma.body);
    assert.equal((await istek(c.planlama, 'GET', '/plan/surum')).json<{ planSurumu: number }>().planSurumu, okunan.planSurumu, 'taslağa yazma sürümü artırmaz');
    // İki planlamacı aynı sürümü okuyup aynı kuyruğu canlıya yazar: önce gelen geçer, ikincisi ezmez (409), canlı sıra öncekinin kalır.
    // Taslağa yazma kişiye özeldir (öteki taslağa dokunmaz); canlı plan yalnız canlıya almada değişir ve sürüm orada artar.
    const ilkYazan = (await canliyaYaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i3!, i2!, i1!]) }], planSurumu: okunan.planSurumu })).canliya;
    assert.equal(ilkYazan.statusCode, 200, ilkYazan.body);
    const ikinciYazan = (await canliyaYaz(c.yonetici, { kuyruklar: [{ kaynak, baslangic, isler: isler([i1!, i2!, i3!]) }], planSurumu: okunan.planSurumu })).canliya;
    assert.equal(ikinciYazan.statusCode, 409, ikinciYazan.body);
    assert.deepEqual((await sira()).map((y) => y.isEmriId), [i3, i2, i1], 'ikinci yazan birincinin sırasını ezmez');
    assert.equal((await istek(c.planlama, 'GET', '/plan/surum')).json<{ planSurumu: number }>().planSurumu, okunan.planSurumu + 1);
    assert.equal((await canliyaYaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i2!, i3!, i1!]) }] })).canliya.statusCode, 200);

    // Dondurulmuş iş yerinde kalır (atlanır), geri kalanı onun etrafından yeni sırayı alır.
    const dondur = (await canliyaYaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i1!], true) }] })).canliya;
    assert.equal(dondur.statusCode, 200, dondur.body);
    const donukYer = (await sira()).find((y) => y.isEmriId === i1)!;
    assert.equal(donukYer.dondurulmus, true);
    const yine = (await canliyaYaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i1!, i3!, i2!]) }] })).yazma;
    assert.deepEqual(yine.json<{ yazilan: number; atlanan: number }>(), { ...yine.json(), yazilan: 2, atlanan: 1 });
    const sonra = await sira();
    assert.equal(sonra.find((y) => y.isEmriId === i1)!.baslangic.getTime(), donukYer.baslangic.getTime(), 'dondurulmuş iş yerinde');
    assert.deepEqual(sonra.filter((y) => y.isEmriId !== i1).map((y) => y.isEmriId), [i3, i2]);
    const donukBitis = donukYer.bitis.getTime();
    for (const y of sonra.filter((x) => x.isEmriId !== i1)) assert.ok(y.bitis.getTime() <= donukYer.baslangic.getTime() || y.baslangic.getTime() >= donukBitis, 'dondurulmuş işle çakışmaz');

    // Ret: yetki (yazma, canlıya alma, dondurma), bilinmeyen iş, yinelenen iş, boş istek, bir kaynak iki kez.
    const kuyruk = (idler: number[], kaynakEki = kaynak) => ({ kaynak: kaynakEki, baslangic, isler: isler(idler) });
    assert.equal((await yaz(c.operator, { kuyruklar: [kuyruk([i1!])] })).statusCode, 403);
    assert.equal((await canliyaYaz(c.cam, { kuyruklar: [kuyruk([i1!])] })).canliya.statusCode, 403, 'canlıya alma yetkisi ayrı');
    assert.equal((await yaz(c.cam, { kuyruklar: [{ ...kuyruk([i2!]), isler: isler([i2!], true) }] })).statusCode, 403, 'dondurma yetkisi ayrı');
    assert.equal((await yaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: [{ emirNo: 'YOK-1', opNo: 10, dondurulmus: false }] }] })).statusCode, 400);
    assert.equal((await yaz(c.planlama, { kuyruklar: [kuyruk([i2!, i2!])] })).statusCode, 400);
    assert.equal((await yaz(c.planlama, { kuyruklar: [] })).statusCode, 400);
    assert.equal((await yaz(c.planlama, { kuyruklar: [kuyruk([i2!]), kuyruk([i3!])] })).statusCode, 400);
    assert.equal((await yaz(c.planlama, { kuyruklar: [kuyruk([i2!], { tur: 'makine', id: 2_000_000_000 })] })).statusCode, 400);
    assert.deepEqual((await sira()).map((y) => y.isEmriId), sonra.map((y) => y.isEmriId), 'reddedilen istek planı değiştirmez');
  });

  test('kuyruk yazımı verilen taslağa: stüdyo aynı taslakta kalır; eski sürüm ve başkasının taslağı reddedilir', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    const canli = await planOku();
    const isi = (id: number) => {
      const y = canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
      return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false };
    };
    const kaynak = { tur: 'makine' as const, id: makineB };
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const ilk = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak, baslangic, isler: [isi(i1!), isi(i2!)] }],
    });
    // Stüdyo taslağın sürümünü plan okumasından alır.
    const ilkSurum = (await planOku(ilk.taslak)).taslak!.surum;
    const ikinci = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      taslak: { id: ilk.taslak, surum: ilkSurum }, kuyruklar: [{ kaynak, baslangic, isler: [isi(i2!), isi(i1!)] }],
    });
    assert.equal(ikinci.taslak, ilk.taslak, 'yeni taslak açılmaz');
    const p = await planOku(ikinci.taslak);
    assert.ok(p.taslak!.surum > ilkSurum);
    assert.ok(Date.parse(yer(p, i2!).baslangic) < Date.parse(yer(p, i1!).baslangic), 'ikinci yazımın sırası taslakta');

    const govde = (surum: number) => ({ taslak: { id: ilk.taslak, surum }, kuyruklar: [{ kaynak, baslangic, isler: [isi(i1!)] }] });
    assert.equal((await istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', govde(ilkSurum))).statusCode, 409, 'eski sürüm');
    assert.notEqual((await istek(c.mudur, 'POST', '/plan/kuyruklari-yaz', govde(p.taslak!.surum))).statusCode, 200, 'başkasının taslağı');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${ikinci.taslak}/vazgec`, { surum: p.taslak!.surum });
  });

  test('Z6: süresi elle girilerek yerleştirilen iş öneride plandan düşmez, yerinde kalır', async () => {
    // Rota onayı süre ister; süresi bilinmeyen iş emri (rotasız adım gibi) testte süresi silinerek kurulur.
    const [i1] = await isEmirleriAc([yeniAdim()]);
    await vt().tx((db) => db.sorgu('UPDATE uretim_emirleri_is_emri SET ayar_suresi_dk = NULL, birim_sure_dk = NULL WHERE id = $1', [i1]));
    let p = await taslaktaOner();
    assert.ok(p.yerlesmemis.some((x) => x.isEmriId === i1), 'rotada süresi olmayan iş önerilmez');
    const baslangic = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/yerlestir', { taslak: tg(p), isEmriId: i1!, kaynak: { tur: 'makine', id: makineB }, baslangic, sureDk: 45 });
    const once = yer(p, i1!);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    assert.ok(p.yerlesimler.some((x) => x.isEmriId === i1), 'öneriden sonra plandadır');
    assert.deepEqual([yer(p, i1!).baslangic, yer(p, i1!).bitis, yer(p, i1!).kaynak], [once.baslangic, once.bitis, once.kaynak]);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('Z1 rota sırası: kuyruk yazımında sonraki adım, başka makinedeki önceki adımı bitmeden başlamaz', async () => {
    const [dolgu] = await isEmirleriAc([yeniAdim({ birimSureDk: 30 })]);
    const [op10, op20] = await isEmirleriAc([yeniAdim(), yeniAdim({ kaynak: { tur: 'makine', id: makineB } })]);
    const canli = await planOku();
    const isi = (id: number) => {
      const y = canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
      return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false };
    };
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [
        { kaynak: { tur: 'makine', id: makineA }, baslangic, isler: [isi(dolgu!), isi(op10!)] },
        { kaynak: { tur: 'makine', id: makineB }, baslangic, isler: [isi(op20!)] },
      ],
    });
    const p = await planOku(yazildi.taslak);
    assert.ok(Date.parse(yer(p, op10!).baslangic) >= Date.parse(yer(p, dolgu!).bitis), 'OP10 dolgu işinden sonra');
    assert.ok(Date.parse(yer(p, op20!).baslangic) >= Date.parse(yer(p, op10!).bitis), 'OP20, OP10 bitmeden başlamaz');
  });

  test('elle sıra yalnız elle işaretli işte (kullanıcı kararı): ekranın kuyruk yazımı ötekileri elle saymaz; toptan yeniden hesapta elle sıra kalır', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    const [i3] = await isEmirleriAc([yeniAdim()]);
    const canli = await planOku();
    const kaynak = { tur: 'makine' as const, id: makineB };
    const isi = (id: number, elle?: boolean) => {
      const y = canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
      return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, ...(elle === undefined ? {} : { elle }) };
    };
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak, baslangic, isler: [isi(i1!, false), isi(i2!, true), isi(i3!, false)] }],
    });
    const taslak = await planOku(yazildi.taslak);
    assert.deepEqual([i1!, i2!, i3!].map((id) => yer(taslak, id).elleSira), [null, 2, null], 'yalnız elle işaretli iş elle sıra alır');
    // 276 a: elle olmayan işin makinesi ve sırası motorundur.

    // Toptan yeniden hesap (öner): elle iş elle sırasını korur ve kuyruğun başına geçer; ötekiler kurala göre dizilir, elle sayılmaz.
    const oner = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(taslak) });
    assert.deepEqual([i1!, i2!, i3!].map((id) => yer(oner, id).elleSira), [null, 2, null]);
    const b = (id: number) => Date.parse(yer(oner, id).baslangic);
    const ayniKaynakta = [i1!, i3!].filter((id) => yer(oner, id).kaynak.id === yer(oner, i2!).kaynak.id);
    for (const id of ayniKaynakta) assert.ok(b(i2!) < b(id), 'elle iş aynı kaynaktaki elle olmayan işten önce');

    // `elle` göndermeyen eski ekran: bütün işler eskisi gibi elle sayılır.
    const eski = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak, baslangic, isler: [isi(i3!), isi(i1!), isi(i2!)] }],
    });
    const eskiTaslak = await planOku(eski.taslak);
    assert.deepEqual([i3!, i1!, i2!].map((id) => yer(eskiTaslak, id).elleSira), [1, 2, 3]);
  });

  test('276 a: kuyruk yazımında elle olmayan işleri motor dizer; taslak motorun önerisiyle aynıdır, elle iş sırasını korur', async () => {
    const gun = (n: number) => new Date(Date.now() + n * 24 * 3600_000).toISOString().slice(0, 10);
    const [gec] = await isEmirleriAc([yeniAdim()], 10, gun(40));
    const [erken] = await isEmirleriAc([yeniAdim()], 10, gun(5));
    const [elle] = await isEmirleriAc([yeniAdim()], 10, gun(60));
    const canli = await planOku();
    const isi = (id: number, e: boolean) => {
      const y = canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
      return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: e };
    };
    // Motor şimdiden sayar: iki hesap aynı ana sabitlenir (dakika sınırını geçen saat yarışı olmasın).
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    let p: PlanCevabi;
    let oner: PlanCevabi;
    const yerleri = (x: PlanCevabi) => [gec!, erken!, elle!].map((id) => [yer(x, id).kaynak, yer(x, id).baslangic, yer(x, id).bitis, yer(x, id).elleSira]);
    try {
      // Ekran teslimi geç olanı öne koydu; bu sıra elle değil, motor teslime göre dizer.
      const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
        kuyruklar: [{ kaynak: { tur: 'makine', id: makineB }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler: [isi(gec!, false), isi(elle!, true), isi(erken!, false)] }],
      });
      p = await planOku(yazildi.taslak);
      oner = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    } finally {
      mock.timers.reset();
    }
    assert.deepEqual(yerleri(p), yerleri(oner), 'canlıya gidecek taslak motorun önerisidir');
    assert.equal(yer(p, elle!).elleSira, 2, 'elle iş elle sırasını korur');
    if (yer(p, gec!).kaynak.id === yer(p, erken!).kaynak.id) assert.ok(Date.parse(yer(p, erken!).baslangic) < Date.parse(yer(p, gec!).baslangic), 'teslimi erken olan önce');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${oner.taslak!.id}/vazgec`, { surum: oner.taslak!.surum });
  });

  test('elle seçilen makine (kullanıcı onayı): toptan hesap işi o makinede tutar, yalnız saatini ayarlar; seçilmeyen iş rotadaki makineye döner', async () => {
    const makineA3 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MA3', ad: 'Deneme makine A3', istasyonId: istasyonA })).id;
    const urun = await mamulAc();
    const rota = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim()]);
    const ac = await tamam<{ uretimEmriId: number; isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rota}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: null });
    const [s1, s2] = ac.isEmriIdleri;
    const canli = await planOku();
    const isi = (id: number, elleKaynak: boolean) => {
      const y = canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
      return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, elleKaynak };
    };
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA3 }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler: [isi(s1!, true), isi(s2!, false)] }],
    });
    let p = await planOku(yazildi.taslak);
    // 276 a: yazımdan sonra motor önerir; elle seçilmeyen makine yazımda rotadakine döner.
    assert.deepEqual([s1!, s2!].map((id) => [yer(p, id).kaynak.id, yer(p, id).elleKaynak]), [[makineA3, true], [makineA, false]]);

    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    assert.deepEqual([s1!, s2!].map((id) => [yer(p, id).kaynak.id, yer(p, id).elleKaynak]), [[makineA3, true], [makineA, false]]);

    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    const ozet = await vt().tx((db) => canliOzeti(db));
    const ozetIsi = (id: number) => ozet.kuyruklar.flatMap((q) => q.isler.map((x) => ({ ...x, makineId: q.makineId })))
      .find((x) => x.anahtar === `${yer(p, id).emirNo}|${yer(p, id).opNo}`);
    assert.deepEqual([ozetIsi(s1!)?.makineId, ozetIsi(s1!)?.elleKaynak], [makineA3, true]);
    assert.equal(ozetIsi(s2!)?.elleKaynak, false);
  });

  test('elle bölme (kart #1572): parçalar ayrı makinede, her biri ayarı öder; sonraki adım hepsini bekler; öner parçaları korur; canlı ve Terminal parçaları görür', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-BOL', ad: 'Deneme bölme merkezi', aciklama: null });
    const istC = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-BL', ad: 'Deneme bölme C', isMerkeziId: merkez.id })).id;
    const istD = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-BM', ad: 'Deneme bölme D', isMerkeziId: merkez.id })).id;
    const c1 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BL1', ad: 'Deneme C1', istasyonId: istC })).id;
    const c2 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BL2', ad: 'Deneme C2', istasyonId: istC })).id;
    const d1 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BM1', ad: 'Deneme D1', istasyonId: istD })).id;
    // Adet 10, ayar 30 dk, birim 2 dk: bütün iş 50 dk; 4 + 6 bölününce parçalar 38 ve 42 dk (her parça ayarı tam öder).
    const [op10, op20] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: c1 } }), yeniAdim({ kaynak: { tur: 'makine', id: d1 } })], 10);
    const canli = await planOku();
    const bul = (id: number) => canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
    const isi = (id: number, ek: Record<string, unknown> = {}) => ({ emirNo: bul(id).emirNo, opNo: bul(id).opNo, dondurulmus: false, elle: false, ...ek });
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yaz = (kuyruklar: unknown[]) => istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar });
    // Sonraki adımın kuyruğu ikinci parçanınkinden önce gelir: sınır yine bütün parçaların bitişidir.
    const bolunmus = (a1: number, a2: number, ek2: Record<string, unknown> = {}) => [
      { kaynak: { tur: 'makine', id: c1 }, baslangic, isler: [isi(op10!, { parca: { no: 1, adet: a1 } })] },
      { kaynak: { tur: 'makine', id: d1 }, baslangic, isler: [isi(op20!)] },
      { kaynak: { tur: 'makine', id: c2 }, baslangic, isler: [isi(op10!, { parca: { no: 2, adet: a2 }, ...ek2 })] },
    ];

    // Ret: adet toplamı adım adedi değil, tek parça, aynı parça iki kez, hem bölünmüş hem bütün.
    assert.equal((await yaz(bolunmus(4, 5))).statusCode, 400);
    assert.equal((await yaz([{ kaynak: { tur: 'makine', id: c1 }, baslangic, isler: [isi(op10!, { parca: { no: 1, adet: 10 } })] }])).statusCode, 400);
    assert.equal((await yaz([{ kaynak: { tur: 'makine', id: c1 }, baslangic, isler: [isi(op10!, { parca: { no: 1, adet: 5 } }), isi(op10!, { parca: { no: 1, adet: 5 } })] }])).statusCode, 400);
    assert.equal((await yaz([{ kaynak: { tur: 'makine', id: c1 }, baslangic, isler: [isi(op10!, { parca: { no: 1, adet: 5 } }), isi(op10!)] },
      { kaynak: { tur: 'makine', id: c2 }, baslangic, isler: [isi(op10!, { parca: { no: 2, adet: 5 } })] }])).statusCode, 400);

    const yazildi = await yaz(bolunmus(4, 6, { elleKaynak: true }));
    assert.equal(yazildi.statusCode, 200, yazildi.body);
    let p = await planOku(yazildi.json<{ taslak: number }>().taslak);
    const sure = (x: { baslangic: string; bitis: string }) => (Date.parse(x.bitis) - Date.parse(x.baslangic)) / 60_000;
    const parcalar = () => yer(p, op10!).parcalar!.map((x) => ({ no: x.no, adet: x.adet, makine: x.kaynak.id, sure: sure(x) }));
    assert.deepEqual(parcalar(), [{ no: 1, adet: 4, makine: c1, sure: 38 }, { no: 2, adet: 6, makine: c2, sure: 42 }]);
    const zarf = yer(p, op10!);
    assert.equal(zarf.kaynak.id, c1, 'zarfın kaynağı ilk parçanın');
    assert.equal(Date.parse(zarf.bitis), Math.max(...zarf.parcalar!.map((x) => Date.parse(x.bitis))));
    assert.ok(Date.parse(yer(p, op20!).baslangic) >= Date.parse(zarf.bitis), 'sonraki adım iki parçayı da bekler');
    assert.equal(yer(p, op20!).parcalar, undefined, 'bölünmemiş işte parça alanı yok');

    // Öner: parçalar korunur; elle seçilen makinedeki parça orada kalır, öteki rotadaki makineye; sonraki adım yine hepsini bekler.
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    assert.deepEqual(parcalar(), [{ no: 1, adet: 4, makine: c1, sure: 38 }, { no: 2, adet: 6, makine: c2, sure: 42 }]);
    assert.ok(Date.parse(yer(p, op20!).baslangic) >= Math.max(...yer(p, op10!).parcalar!.map((x) => Date.parse(x.bitis))));

    // Canlıya alınca: Reçete şeridinin özetinde her parça kendi makinesinin kuyruğunda; Terminal'in okuduğu canlı sırada parçalar.
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    const ozet = await vt().tx((db) => canliOzeti(db));
    const anahtar = `${bul(op10!).emirNo}|${bul(op10!).opNo}`;
    const ozetParcalari = ozet.kuyruklar.flatMap((q) => q.isler.filter((x) => x.anahtar === anahtar).map((x) => ({ makineId: q.makineId, parca: x.parca, elleKaynak: x.elleKaynak })));
    assert.deepEqual(ozetParcalari.sort((x, y) => x.parca!.no - y.parca!.no), [
      { makineId: c1, parca: { no: 1, adet: 4 }, elleKaynak: false }, { makineId: c2, parca: { no: 2, adet: 6 }, elleKaynak: true },
    ]);
    const sira = await vt().tx((db) => canliSira(db, [op10!]));
    assert.deepEqual(sira.yerlesimler[0]!.parcalar!.map((x) => [x.no, x.adet, x.kaynak.id]), [[1, 4, c1], [2, 6, c2]]);
    const cy = await tamam<CanliYerlesimCevabi>(c.cam, 'GET', `/plan/canli-yerlesim?isEmirleri=${op10}`);
    assert.deepEqual(cy.yerlesimler[0]!.parcalar!.map((x) => x.kaynak.id), [c1, c2]);

    // Yeni taslak canlının parçalarını taşır; plan modülünün tek iş taşıma ucu bölünmüş işi reddeder; parçasız yazım birleştirir.
    const birlesik = await yaz([{ kaynak: { tur: 'makine', id: c1 }, baslangic, isler: [isi(op10!)] }]);
    assert.equal(birlesik.statusCode, 200, birlesik.body);
    const b2 = await planOku(birlesik.json<{ taslak: number }>().taslak);
    assert.equal(yer(b2, op10!).parcalar, undefined, 'parçasız yazılan iş birleşir');
    assert.equal(sure(yer(b2, op10!)), 50);
    const t2 = await taslaktaOner();
    assert.equal(yer(t2, op10!).parcalar?.length, 2, 'canlıdan açılan taslak parçaları taşır');
    assert.equal((await isEmriKomutu(t2, op10!, 'tasi', { kaynak: { tur: 'makine', id: c2 }, baslangic })).statusCode, 409);
    const sirala = await istek(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(t2), kaynak: { tur: 'makine', id: c1 }, isEmriIdleri: [op10] });
    assert.equal(sirala.statusCode, 409, sirala.body);
    const parcaEkle = (adet: number) => vt().tx((db) => db.sorgu(
      "INSERT INTO plan_yerlesim_parcasi (is_emri_id, parca_no, adet, makine_id, baslangic, bitis) VALUES ($1, 3, $2, $3, now(), now() + interval '1 hour')", [op10, adet, c1]));
    await assert.rejects(parcaEkle(0), /plan_yerlesim_parcasi_adet/);
    await parcaEkle(1);
    await vt().tx((db) => db.sorgu('DELETE FROM plan_yerlesim_parcasi WHERE is_emri_id = $1 AND parca_no = 3', [op10]));
  });

  test('elle bölme kalıcıdır (kart #1572): motor bölünmüş işi yerleştiremezse bölme durur, iş uyarıyla yerleşmemiş görünür; makine açılınca parçalarıyla yerleşir', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-BK', ad: 'Deneme kalıcı bölme merkezi', aciklama: null });
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-BK', ad: 'Deneme kalıcı bölme', isMerkeziId: merkez.id })).id;
    const makine = async (kod: string) => tamam<{ id: number; surum: number }>(c.yonetici, 'POST', '/makineler', { kod, ad: `Deneme ${kod}`, istasyonId: ist });
    const m = [await makine('RT-BK1'), await makine('RT-BK2')];
    const aktif = async (deger: boolean) => {
      for (const [n, x] of m.entries()) {
        const r = await tamam<{ surum: number }>(c.yonetici, 'POST', `/makineler/${x.id}/guncelle`, { kod: `RT-BK${n + 1}`, ad: `Deneme RT-BK${n + 1}`, istasyonId: ist, aktif: deger, surum: x.surum });
        x.surum = r.surum;
      }
    };
    const [op10] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: m[0]!.id } })], 10);
    const canli = await planOku();
    const y0 = canli.yerlesimler.find((x) => x.isEmriId === op10) ?? canli.yerlesmemis.find((x) => x.isEmriId === op10)!;
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const parca = (n: number, adet: number) => ({ kaynak: { tur: 'makine', id: m[n - 1]!.id }, baslangic,
      isler: [{ emirNo: y0.emirNo, opNo: y0.opNo, dondurulmus: false, elle: false, parca: { no: n, adet } }] });
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar: [parca(1, 4), parca(2, 6)] });
    let p = await planOku(yazildi.taslak);
    assert.equal(yer(p, op10!).parcalar?.length, 2);

    // İki makine de kapanınca motor işi yerleştiremez: bölme silinmez, iş yerleşmemiş listesinde bölmesiyle ve uyarıyla görünür.
    await aktif(false);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    const yersiz = p.yerlesmemis.find((x) => x.isEmriId === op10);
    assert.deepEqual(yersiz?.bolme, [{ no: 1, adet: 4 }, { no: 2, adet: 6 }]);
    assert.ok(p.uyarilar.some((u) => u.includes(`${y0.emirNo} OP ${y0.opNo}`) && u.includes('bölme duruyor')), p.uyarilar.join(' | '));

    // Canlıya alınan yersiz bölme canlıda ve canlıdan açılan taslakta da durur.
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    assert.deepEqual((await planOku()).yerlesmemis.find((x) => x.isEmriId === op10)?.bolme?.map((x) => x.adet), [4, 6]);
    const ozet = await vt().tx((db) => canliOzeti(db));
    const anahtar = `${y0.emirNo}|${y0.opNo}`;
    assert.deepEqual(ozet.yersizBolmeler?.find((x) => x.anahtar === anahtar)?.parcalar, [{ no: 1, adet: 4 }, { no: 2, adet: 6 }], 'Reçete şeridi yersiz bölmeyi görür');
    assert.equal(ozet.adetler?.[anahtar], 10, 'parça adetlerinin toplanacağı adım adedi');
    await aktif(true);
    p = await taslaktaOner();
    assert.deepEqual(yer(p, op10!).parcalar!.map((x) => [x.no, x.adet]), [[1, 4], [2, 6]], 'makine açılınca parçalarıyla yerleşir');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    assert.deepEqual(yer(await planOku(), op10!).parcalar!.map((x) => x.adet), [4, 6]);
  });

  test('elle bölme hurdalı adımda (kart #1572): parça adetleri adım adedine (önceki adımın sağlamı) eşit olur; emir adedi reddedilir; canlı özet adım adedini verir', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-BH', ad: 'Deneme hurdalı bölme merkezi', aciklama: null });
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-BH', ad: 'Deneme hurdalı bölme', isMerkeziId: merkez.id })).id;
    const h1 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BH1', ad: 'Deneme RT-BH1', istasyonId: ist })).id;
    const h2 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BH2', ad: 'Deneme RT-BH2', istasyonId: ist })).id;
    const [op10, op20] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: h1 } }), yeniAdim({ kaynak: { tur: 'makine', id: h1 } })], 10);
    // OP10 10 adetten 8 sağlamla bitti: OP20'nin adedi 8.
    await vt().tx((db) => db.sorgu(
      "UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now() - interval '1 hour', bitis = now(), saglam_adet = 8 WHERE id = $1", [op10]));
    const canli = await planOku();
    const y = canli.yerlesimler.find((x) => x.isEmriId === op20) ?? canli.yerlesmemis.find((x) => x.isEmriId === op20)!;
    const anahtar = `${y.emirNo}|${y.opNo}`;
    assert.equal((await vt().tx((db) => canliOzeti(db))).adetler?.[anahtar], 8, 'canlı özet adım adedini verir');
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yaz = (a1: number, a2: number) => istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar: [
      { kaynak: { tur: 'makine', id: h1 }, baslangic, isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, parca: { no: 1, adet: a1 } }] },
      { kaynak: { tur: 'makine', id: h2 }, baslangic, isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, parca: { no: 2, adet: a2 } }] },
    ] });
    const red = await yaz(5, 5);
    assert.equal(red.statusCode, 400, 'emir adedi (10) adım adedi değil');
    assert.match(red.body, /toplamı 8/);
    const kabul = await yaz(3, 5);
    assert.equal(kabul.statusCode, 200, kabul.body);
    assert.deepEqual(yer(await planOku(kabul.json<{ taslak: number }>().taslak), op20!).parcalar!.map((x) => x.adet), [3, 5]);
  });

  test('elle bölme sonra hurda: önceki adım daha az sağlamla bitince parçaların süresi adım adedine oranla düşer, yazılı adetler kalır', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-BU', ad: 'Deneme bölme uzlaşma merkezi', aciklama: null });
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-BU', ad: 'Deneme bölme uzlaşma', isMerkeziId: merkez.id })).id;
    const u1 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BU1', ad: 'Deneme RT-BU1', istasyonId: ist })).id;
    const u2 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BU2', ad: 'Deneme RT-BU2', istasyonId: ist })).id;
    const [op10, op20] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: u1 } }), yeniAdim({ kaynak: { tur: 'makine', id: u1 } })], 10);
    const canli = await planOku();
    const y = canli.yerlesimler.find((x) => x.isEmriId === op20) ?? canli.yerlesmemis.find((x) => x.isEmriId === op20)!;
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar: [
      { kaynak: { tur: 'makine', id: u1 }, baslangic, isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, parca: { no: 1, adet: 4 } }] },
      { kaynak: { tur: 'makine', id: u2 }, baslangic, isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, parca: { no: 2, adet: 6 } }] },
    ] });
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${yazildi.taslak}/canliya-al`, { surum: (await planOku(yazildi.taslak)).taslak!.surum, cakismalariKabul: false });
    // OP10 10 adetten 8 sağlamla bitti; bölme 10 adetle yazılmıştı.
    await vt().tx((db) => db.sorgu(
      "UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now() - interval '1 hour', bitis = now(), saglam_adet = 8 WHERE id = $1", [op10]));
    const p = await taslaktaOner();
    const sure = (x: { baslangic: string; bitis: string }) => (Date.parse(x.bitis) - Date.parse(x.baslangic)) / 60_000;
    // Ayar 30 + adet x 2 dk; parça adedi 8/10 oranında: 4 -> 3,2 (36,4 dk), 6 -> 4,8 (39,6 dk). Önceden 38 ve 42 dk çıkıyordu.
    assert.deepEqual(yer(p, op20!).parcalar!.map((x) => [x.no, x.adet, Math.round(sure(x) * 10) / 10]), [[1, 4, 36.4], [2, 6, 39.6]]);
  });

  test('elle sıra rota değişince (kullanıcı kararı): aynı istasyonda makine değişirse kalır; istasyon değişir ya da adım kalkarsa düşer ve uyarılır', async () => {
    const makineA2 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MA2', ad: 'Deneme makine A2', istasyonId: istasyonA })).id;
    const urun = await mamulAc();
    const ilkRota = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim(), yeniAdim()]);
    const ac = await tamam<{ uretimEmriId: number; isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${ilkRota}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: null });
    const [s1, s2, s3] = ac.isEmriIdleri;
    const canli = await planOku();
    const isi = (id: number) => {
      const y = canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
      return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: true };
    };
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler: [isi(s1!), isi(s2!), isi(s3!)] }],
    });
    let p = await planOku(yazildi.taslak);
    assert.deepEqual([s1!, s2!, s3!].map((id) => yer(p, id).elleSira), [1, 2, 3]);
    assert.deepEqual(p.elleSiraDusenler, []);

    // Yeni rota: OP 10 aynı istasyonun öteki makinesine, OP 20 B istasyonuna geçer, OP 30 kalkar; emre uygulanır.
    const yeni = (await taslakAc(urun, { tur: 'revizyon', revizyonId: ilkRota })).json<KomutCevabi>().id;
    const adimlar = (await ayrinti(yeni)).adimlar.map(govdeye);
    const k = await kaydet(yeni, 1, [{ ...adimlar[0]!, kaynak: { tur: 'makine', id: makineA2 } }, { ...adimlar[1]!, kaynak: { tur: 'makine', id: makineB } }]);
    assert.equal(k.statusCode, 200, k.body);
    const g = await komut(yeni, 'onaya-gonder', { surum: k.json<KomutCevabi>().surum }, c.planlama);
    assert.equal((await komut(yeni, 'onayla', { surum: g.json<KomutCevabi>().surum, yururlugeAl: true }, c.mudur)).statusCode, 200);
    await tamam(c.planlama, 'POST', `/rota/emirler/${ac.uretimEmriId}/yururlukteki-rotayi-uygula`, {});
    p = await planOku(yazildi.taslak);
    const op = (id: number) => canli.yerlesimler.find((x) => x.isEmriId === id)?.opNo ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!.opNo;
    assert.equal(yer(p, s1!).elleSira, 1, 'aynı istasyonda makine değişince elle sıra kalır');
    assert.equal(yer(p, s2!).elleSira, null, 'istasyon değişince elle sıra düşer');
    assert.deepEqual(p.elleSiraDusenler, [
      { isEmriId: s2, emirNo: yer(p, s2!).emirNo, opNo: op(s2!), neden: 'istasyon', eskiIstasyon: 'RT-A', yeniIstasyon: 'RT-B' },
      { isEmriId: s3, emirNo: null, opNo: null, neden: 'rotadan-kalkti', eskiIstasyon: 'RT-A', yeniIstasyon: null },
    ]);
    assert.ok(p.uyarilar.includes(`Elle sıra düştü: ${yer(p, s2!).emirNo} OP ${op(s2!)}, istasyon RT-A -> RT-B.`), p.uyarilar.join('\n'));
    assert.ok(p.uyarilar.includes('Elle sıra düştü: RT-A kuyruğundaki bir adım rotadan kalktı.'));

    // Toptan yeniden hesap: düşen elle sıra motorda sayılmaz, uyarı planlamacı yeniden sıralayana dek kalır.
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    assert.equal(yer(p, s1!).elleSira, 1);
    assert.equal(yer(p, s2!).elleSira, null);
    assert.equal(p.elleSiraDusenler?.length, 2);

    // Canlı özet de düşen elle sırayı elle saymaz; ekran qorder'ını buradan kurar.
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    const ozet = await vt().tx((db) => canliOzeti(db));
    const ozetIsi = (id: number) => ozet.kuyruklar.flatMap((q) => q.isler).find((x) => x.anahtar === `${yer(p, id).emirNo}|${op(id)}`);
    assert.equal(ozetIsi(s1!)?.elle, true);
    assert.equal(ozetIsi(s2!)?.elle, false);
  });

  test('emir önizlemesi: yeni emrin bitişi, önerilen teslim, etkilenen emirler; hiçbir şey yazılmaz; yetkisiz ve yürürlükte olmayan rota reddedilir', async () => {
    await isEmirleriAc([yeniAdim()]);
    const urun = await mamulAc();
    const rev = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim({ kaynak: { tur: 'makine', id: makineB } })]);
    const canli = await planOku();
    const emirSayisi = (await tamam<{ emirler: unknown[] }>(c.planlama, 'GET', '/adimli-emirler')).emirler.length;
    const sorgu = (r: number) => `/plan/onizle?${new URLSearchParams({ revizyonId: String(r), adet: '20', oncelik: '1', teslim: '2020-01-01' }).toString()}`;
    const o = await tamam<OnizlemeCevabi>(c.planlama, 'GET', sorgu(rev));
    assert.equal(o.odak.isSayisi, 2);
    assert.equal(o.odak.yerlesen, 2);
    assert.ok(o.odak.bitis && o.odak.onerilenTeslim && o.odak.onerilenTeslim >= o.odak.bitis.slice(0, 10));
    const yeni = o.etkilenenEmirler.find((e) => e.yeni)!;
    assert.equal(yeni.emirNo, 'Yeni emir');
    assert.equal(yeni.gecikiyor, true, 'geçmiş teslim gecikir');
    assert.ok(o.sonra.geciken >= o.once.geciken + 1);
    assert.ok(o.yeniUyarilar.some((u) => u.startsWith('Yeni emir')));
    assert.deepEqual((await planOku()).yerlesimler, canli.yerlesimler, 'canlı değişmez');
    assert.equal((await tamam<{ emirler: unknown[] }>(c.planlama, 'GET', '/adimli-emirler')).emirler.length, emirSayisi, 'emir açılmaz');
    assert.equal((await istek(c.operator, 'GET', sorgu(rev))).statusCode, 403);
    assert.equal((await istek(c.kalite, 'GET', sorgu(rev))).statusCode, 200, 'yalnız emre kopyalama yetkisi yeter');
    assert.equal((await istek(c.cam, 'GET', sorgu(rev))).statusCode, 200, 'yalnız plan yazma yetkisi yeter');
    const taslakRev = (await taslakAc(await mamulAc())).json<KomutCevabi>().id;
    assert.equal((await istek(c.planlama, 'GET', sorgu(taslakRev))).statusCode, 422);
  });

  test('istasyonlar eki (#439): verim işleme süresini böler; arızalı makine iş almaz; yetkinliği olmayan istasyonda kişi uyarısı', async () => {
    const merkezId = (await tamam<{ istasyonlar: { id: number; isMerkeziId: number }[] }>(c.yonetici, 'GET', '/istasyonlar')).istasyonlar.find((x) => x.id === istasyonA)!.isMerkeziId;
    const ist = await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-V', ad: 'Deneme verim', isMerkeziId: merkezId });
    const mak = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MV', ad: 'Deneme makine V', istasyonId: ist.id });
    await tamam(c.yonetici, 'POST', `/istasyonlar/${ist.id}/plan-ayari`, { verimYuzde: 200, operatorIhtiyaci: 1, surum: 0 });
    const [v1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: mak.id } })]);
    let p = await taslaktaOner();
    const sure = (y: { baslangic: string; bitis: string }) => (Date.parse(y.bitis) - Date.parse(y.baslangic)) / 60_000;
    assert.equal(sure(yer(p, v1!)), 30 + (2 * 10) / 2, 'verim %200 işlemeyi yarıya indirir, ayar aynı kalır');
    assert.equal(sure(p.yerlesimler.find((y) => y.kaynak.tur === 'makine' && y.kaynak.id === makineA)!), 30 + 2 * 10, 'ayarı olmayan istasyon %100');
    // Arıza: makine plana iş almaz; var olan yerleşim uyarı taşır.
    await tamam(c.yonetici, 'POST', `/makineler/${mak.id}/durum`, { durum: 'ariza', aciklama: null, surum: 0 });
    assert.ok(yer(await planOku(p.taslak!.id), v1!).uyarilar.some((u) => /kullanımda değil/.test(u)));
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    assert.equal(p.yerlesimler.some((y) => y.isEmriId === v1), false);
    assert.ok(p.yerlesmemis.some((y) => y.isEmriId === v1));
    // Elle yerleştirme ve taşıma rotadaki süreyi hedef kaynağın verimiyle alır.
    await tamam(c.yonetici, 'POST', `/makineler/${mak.id}/durum`, { durum: 'calisir', aciklama: null });
    const uzak = new Date(Date.parse(p.simdi) + 90 * 24 * 3600_000).toISOString();
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/yerlestir', { taslak: tg(p), isEmriId: v1, kaynak: { tur: 'makine', id: mak.id }, baslangic: uzak });
    assert.equal(sure(yer(p, v1!)), 40);
    p = (await isEmriKomutu(p, v1!, 'tasi', { kaynak: { tur: 'makine', id: makineA }, baslangic: uzak })).json<PlanCevabi>();
    assert.equal(sure(yer(p, v1!)), 50);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    // S3: kişi rotadaki makinenin istasyonunda yetkin değilse uyarı; yetkinliği tanımlanmamış kişide uyarı yok.
    const [k1] = await isEmirleriAc([yeniAdim({ adaylar: [{ kaynak: { tur: 'kisi', id: operatorId }, ayarSuresiDk: 30, birimSureDk: 2 }] })]);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
    const ileri = new Date(Date.parse(yer(p, k1!).baslangic) + 60 * 24 * 3600_000).toISOString();
    p = (await isEmriKomutu(p, k1!, 'tasi', { kaynak: { tur: 'kisi', id: operatorId }, baslangic: ileri })).json<PlanCevabi>();
    const yetkinlikUyarisi = (pp: PlanCevabi) => yer(pp, k1!).uyarilar.includes('Kişinin bu istasyonda yetkinliği yok.');
    assert.equal(yetkinlikUyarisi(p), false);
    await tamam(c.yonetici, 'POST', `/kisi-yetkinlikleri/${operatorId}/belirle`, { istasyonIdleri: [istasyonB] });
    try {
      assert.equal(yetkinlikUyarisi(await planOku(p.taslak!.id)), true);
      await tamam(c.yonetici, 'POST', `/kisi-yetkinlikleri/${operatorId}/belirle`, { istasyonIdleri: [istasyonA] });
      assert.equal(yetkinlikUyarisi(await planOku(p.taslak!.id)), false);
    } finally {
      await tamam(c.yonetici, 'POST', `/kisi-yetkinlikleri/${operatorId}/belirle`, { istasyonIdleri: [] });
      await tamam(c.yonetici, 'POST', `/makineler/${mak.id}/durum`, { durum: 'calisir', aciklama: null });
    }
  });

  test('A7 ikinci menü sayaçları plan modülünde: açık revizyon, geciken emir, açık senaryo, düşük stok; emirler uydurulmaz', async () => {
    const say = await tamam<Record<string, number | null>>(c.yonetici, 'GET', '/plan/menu-sayaclari');
    const liste = await tamam<{ rotalar: { acik: unknown }[] }>(c.yonetici, 'GET', '/rota/urunler');
    const studyo = await tamam<SenaryolarCevabi>(c.yonetici, 'GET', '/plan/senaryolar');
    assert.equal(say.rotalar, liste.rotalar.filter((r) => r.acik !== null).length);
    assert.equal(say.plan, (await planOku(undefined, c.yonetici)).gostergeler.geciken);
    assert.equal(say.studyo, studyo.senaryolar.filter((x) => x.durum === 'acik').length);
    assert.equal(typeof say.stok, 'number');
    assert.equal(say.operasyonlar, (await tamam<SeceneklerCevabi>(c.yonetici, 'GET', '/rota/secenekler')).operasyonTipleri.length);
    assert.equal(say.emirler, undefined);
    // Rota sayfası yetkisi olmayan sayı görmez (Aşama 1'de sayfa yalnız yöneticide).
    assert.deepEqual(Object.values(await tamam<Record<string, number | null>>(c.operator, 'GET', '/plan/menu-sayaclari')).filter((n) => n !== null), []);
  });

  // Yük testi (2026-10-18): plan uçları istek başına yüzlerce sorgu atıyordu. Hız düzeltmesi davranışı değiştirmez; sorgu sayısı iş emri
  // sayısıyla büyümez.
  test('286 b: acil sipariş denemesi canlıya alınınca müşterili taslak sipariş açılır; onayda proje ve acil emir açılır, yetkisiz onay geri alınır', async () => {
    await isEmirleriAc([yeniAdim()]);
    const firma = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 286', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
    const secenek = await tamam<{ firmalar: { id: number }[] }>(c.planlama, 'GET', '/plan/musteri-secenekleri?ara=286');
    assert.deepEqual(secenek.firmalar.map((f) => f.id), [firma]);
    assert.equal((await istek(c.operator, 'GET', '/plan/musteri-secenekleri')).statusCode, 403);
    let s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: 'Acil 286' })).senaryolar.find((x) => x.ad === 'Acil 286')!;
    s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur: 'acil', surum: s.surum })).senaryolar.find((x) => x.id === s.id)!;
    const d = s.degisiklikler.find((x) => x.tur === 'acil_emir')!;
    assert.deepEqual(s.bekleyenler, [], 'acil sipariş artık canlıya geçer');
    {
      const r = await istek(c.planlama, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
      assert.equal(r.statusCode, 400);
      assert.match(r.body, /acilMusteriler/);
      const k = await istek(c.kalite, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true, acilMusteriler: [{ degisiklikId: d.id, firmaId: firma }] });
      assert.equal(k.statusCode, 403, 'kalitede sipariş yazma yok');
    }
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true, acilMusteriler: [{ degisiklikId: d.id, firmaId: firma }] });
    const sp = (await ortam!.sahip.tek<{ id: number; durum: string; firma_id: number; kdv_orani: string; miktar: string; birim_fiyat: string | null; satir: number }>(
      `SELECT s.id, s.durum, s.firma_id, s.kdv_orani::text, k.miktar::text, k.birim_fiyat::text, k.id AS satir FROM siparisler_siparis s
         JOIN siparisler_siparis_satiri k ON k.siparis_id = s.id WHERE s.firma_id = $1`, [firma]))!;
    assert.deepEqual([sp.durum, Number(sp.kdv_orani), Number(sp.miktar), sp.birim_fiyat], ['taslak', 20, 100, null]);
    const emirSayisi = async () => Number((await ortam!.sahip.tek<{ n: string }>('SELECT count(*) AS n FROM uretim_emri WHERE siparis_satiri_id = $1', [sp.satir]))!.n);
    assert.equal(await emirSayisi(), 0, 'onaya kadar emir açılmaz');
    const kim = async (cerez: string) => (await kimlikCozucu(vt())({ headers: { cookie: cerez } } as never))!;
    await assert.rejects(vt().tx(async (db) => acilSiparisOnaylandi(db, { siparisId: sp.id, kullanici: await kim(c.kalite) })), /proje ve üretim emri açma yetkisi/);
    assert.equal(await emirSayisi(), 0);
    // Fiyat Siparişler'de girilir; onay Siparişler'in ucundan verilir ve kablolama.ts'teki bağla emri açar.
    await ortam!.sahip.sorgu('UPDATE siparisler_siparis_satiri SET birim_fiyat = 10 WHERE id = $1', [sp.satir]);
    const surum = (await ortam!.sahip.tek<{ surum: number }>('SELECT surum FROM siparisler_siparis WHERE id = $1', [sp.id]))!.surum;
    await tamam(c.mudur, 'POST', `/siparisler/${sp.id}/onayla`, { surum });
    await vt().tx(async (db) => acilSiparisOnaylandi(db, { siparisId: sp.id, kullanici: await kim(c.mudur) }));
    const emir = (await ortam!.sahip.tek<{ oncelik: number; adet: number; proje: string }>(
      'SELECT e.oncelik, e.adet, p.kod AS proje FROM uretim_emri e JOIN projeler_proje p ON p.id = e.proje_id WHERE e.siparis_satiri_id = $1', [sp.satir]))!;
    assert.equal(await emirSayisi(), 1, 'ikinci bildirim yeni emir açmaz');
    assert.deepEqual([emir.oncelik, Number(emir.adet)], [1, 100]);
    assert.ok(/^[A-Z0-9._]+$/.test(emir.proje));
  });

  test('281 a: öncelik denemesi canlıya alınınca emrin önceliği, arıza denemesi makine durumu olur; yetkisi olmayan canlıya alamaz', async () => {
    await isEmirleriAc([yeniAdim()], 10, null, { oncelik: 3 });
    const veri = async (id: number) => (await ortam!.sahip.tek<{ veri: Record<string, number> }>('SELECT veri FROM plan_senaryo_degisikligi WHERE id = $1', [id]))!.veri;
    const dene = async (ad: string, tur: 'oncelik' | 'ariza') => {
      const s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad })).senaryolar.find((x) => x.ad === ad)!;
      const l = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur, surum: s.surum })).senaryolar.find((x) => x.id === s.id)!;
      assert.deepEqual(l.bekleyenler, [], `${tur} denemesi artık canlıya geçer`);
      return { s: l, d: l.degisiklikler.find((x) => x.tur !== 'oner')! };
    };
    const canliyaAl = (cerez: string, s: { id: number; surum: number }) =>
      istek(cerez, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });

    const o = await dene('Öncelik 281', 'oncelik');
    const { emirId } = await veri(o.d.id);
    assert.equal((await canliyaAl(c.kalite, o.s)).statusCode, 403, 'kalitede emir yazma yok');
    const oncelik = async () => (await ortam!.sahip.tek<{ oncelik: number }>('SELECT oncelik FROM uretim_emri WHERE id = $1', [emirId]))!.oncelik;
    assert.notEqual(await oncelik(), 1);
    assert.equal((await canliyaAl(c.planlama, o.s)).statusCode, 200);
    assert.equal(await oncelik(), 1);

    const a = await dene('Arıza 281', 'ariza');
    const { makineId } = await veri(a.d.id);
    const durum = async () => (await ortam!.sahip.tek<{ durum: string } | null>(
      'SELECT durum FROM istasyonlar_makine_durumu WHERE makine_id = $1', [makineId]))?.durum ?? 'calisir';
    try {
      assert.equal((await canliyaAl(c.planlama, a.s)).statusCode, 403, 'planlamada makine durumu yazma yok');
      assert.equal(await durum(), 'calisir');
      assert.equal((await canliyaAl(c.mudur, a.s)).statusCode, 200);
      assert.equal(await durum(), 'ariza');
    } finally {
      await tamam(c.yonetici, 'POST', `/makineler/${makineId}/durum`, { durum: 'calisir', aciklama: null });
    }
  });

  test('H1 geçmiş, H7: elle taşıma ve yerleştirme geçmişe konamaz; başkasının taslağına yazmada ve kapatmada senaryo iletisi', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    const y = yer(p, i1!);
    const gecmis = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    const r = await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: gecmis });
    assert.equal(r.statusCode, 400, r.body);
    assert.match(r.body, /geçmişte olamaz/);
    p = (await isEmriKomutu(p, i1!, 'kaldir')).json<PlanCevabi>();
    const yz = await istek(c.planlama, 'POST', '/plan/yerlestir', { taslak: tg(p), isEmriId: i1!, kaynak: y.kaynak, baslangic: gecmis });
    assert.equal(yz.statusCode, 400, yz.body);
    assert.match(yz.body, /baslangic/);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/yerlestir', { taslak: tg(p), isEmriId: i1!, kaynak: y.kaynak, baslangic: y.baslangic });

    const baska = await istek(c.planlama2, 'POST', '/plan/oner', { taslak: tg(p) });
    assert.equal(baska.statusCode, 403);
    assert.match(baska.body, /başka bir planlamacının taslağı/);
    const kapat = await istek(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    assert.equal(kapat.statusCode, 403);
    assert.match(kapat.body, /başka bir planlamacının taslağı/);
  });

  test('308 b: sıraya aykırı taşıma ve canlıya alma reddedilir; rota dışı elle makine uyarıyla tutulur (H3)', async () => {
    const [a1, a2] = await isEmirleriAc([yeniAdim(), yeniAdim()]);
    let p = await taslaktaOner();
    const once = new Date(Date.parse(yer(p, a1!).baslangic) - 3600_000);
    const r = await isEmriKomutu(p, a2!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: (once.getTime() > Date.now() ? once : new Date(Date.now() + 60_000)).toISOString() });
    assert.equal(r.statusCode, 409, r.body);
    assert.match(r.body, /sıraya aykırı/);
    // Eski kayıt ya da dışarıdan yazılmış aykırılık canlıya geçmez.
    await ortam!.sahip.sorgu(
      'UPDATE plan_senaryo_yerlesimi SET baslangic = $3, bitis = $3::timestamptz + interval \'10 minutes\' WHERE senaryo_id = $1 AND is_emri_id = $2',
      [p.taslak!.id, a2!, new Date(Date.parse(yer(p, a1!).baslangic) - 600_000).toISOString()]);
    p = await planOku(p.taslak!.id);
    const al = await istek(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: p.taslak!.surum, cakismalariKabul: true });
    assert.equal(al.statusCode, 409, al.body);
    assert.match(al.body, /sıraya aykırı/);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });

    const [b1] = await isEmirleriAc([yeniAdim()]);
    const canli = await planOku();
    const b = canli.yerlesimler.find((x) => x.isEmriId === b1) ?? canli.yerlesmemis.find((x) => x.isEmriId === b1)!;
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineB }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler: [{ emirNo: b.emirNo, opNo: b.opNo, dondurulmus: false, elleKaynak: true }] }],
    });
    const yb = yer(await planOku(yazildi.taslak), b1!);
    assert.deepEqual(yb.kaynak, { tur: 'makine', id: makineB }, 'motor elle seçilen rota dışı makineyi geri almaz');
    assert.ok(yb.uyarilar.some((u) => /rotadaki/.test(u)), JSON.stringify(yb.uyarilar));
  });

  test('H2: fasona alınan adımın eski yerleşimi kuyruğu ve taşımayı tıkamaz', async () => {
    const [a] = await isEmirleriAc([yeniAdim()]);
    const [b] = await isEmirleriAc([yeniAdim()]);
    const [d] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const kaynak = yer(p, a!).kaynak;
    const sirali = [a!, b!, d!].sort((x, y) => Date.parse(yer(p, x).baslangic) - Date.parse(yer(p, y).baslangic));
    assert.ok(sirali.every((i) => JSON.stringify(yer(p, i).kaynak) === JSON.stringify(kaynak)), 'üç iş aynı makinede');
    const [ilk, orta, son] = sirali as [number, number, number];
    const firma = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Fasoncu H2', 'tedarikci', $1) RETURNING id", [yoneticiId]))!.id;
    await ortam!.sahip.sorgu('UPDATE uretim_emirleri_is_emri SET fason_firma_id = $2, makine_id = NULL, kisi_id = NULL, istasyon_id = NULL, ayar_suresi_dk = NULL, birim_sure_dk = NULL, termin_gun = 3 WHERE id = $1', [orta, firma]);
    let q = await planOku(p.taslak!.id);
    assert.equal(q.yerlesimler.some((y) => y.isEmriId === orta), false, 'fason adım planda görünmez');
    q = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(q), kaynak, isEmriIdleri: [son, ilk] });
    // Sıralamadan sonra ilk iş fasondakinin eski yerinde; bir dakika kaydırmak yalnız o eski satırla çakışabilirdi.
    const t = await isEmriKomutu(q, ilk, 'tasi', { kaynak, baslangic: new Date(Date.parse(yer(q, ilk).baslangic) + 60_000).toISOString() });
    assert.equal(t.statusCode, 200, t.body);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${q.taslak!.id}/vazgec`, { surum: t.json<PlanCevabi>().taslak!.surum });
  });

  test('H5: hurdadan sonra sonraki adımın adedi süresiyle aynı kalandan gelir', async () => {
    const [a1, a2] = await isEmirleriAc([yeniAdim(), yeniAdim()], 10);
    await ortam!.sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now() - interval '2 hours', bitis = now() - interval '1 hour', saglam_adet = 8 WHERE id = $1", [a1!]);
    const p = await planOku();
    const y = p.yerlesimler.find((x) => x.isEmriId === a2) ?? p.yerlesmemis.find((x) => x.isEmriId === a2)!;
    assert.equal(y.adet, 8);
  });

  describe('sorgu sayısı ve aynı cevap', () => {
    const planlamaci = async () => {
      const id = (await vt().tx((db) => db.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'planlama'")))!.id;
      return (await vt().tx((db) => kullaniciYukle(db, id)))!;
    };
    // Öneri her yerleşimi ayrı satır olarak yazar; yazma okumadan ayrı sayılır, okuma sayısı sabit kalmalı.
    async function sorguSay<T>(is: (db: Db) => Promise<T>): Promise<number> {
      let n = 0;
      const say = (sql: string) => { if (!/^\s*(DELETE FROM|INSERT INTO) plan_senaryo_yerlesim/.test(sql)) n += 1; };
      await vt().tx((db) => is({ sorgu: (sql, p) => { say(sql); return db.sorgu(sql, p); }, tek: (sql, p) => { say(sql); return db.tek(sql, p); } }));
      return n;
    }
    const zamansiz = (p: PlanCevabi) => { const { simdi, taslakAcildi, ...geri } = p; void simdi; void taslakAcildi; return geri; };

    test('öner cevabı, aynı taslağın hemen ardından okunan planıyla aynıdır', async () => {
      await isEmirleriAc([yeniAdim(), yeniAdim({ kaynak: { tur: 'istasyon', id: istasyonB } })], 4, '2099-01-01');
      const p = await taslaktaOner();
      assert.deepEqual(zamansiz(p), zamansiz(await planOku(p.taslak!.id)));
      const p2 = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: tg(p) });
      assert.deepEqual(zamansiz(p2), zamansiz(await planOku(p.taslak!.id)));
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p2.taslak!.surum });
    });

    test('menü sayacının geciken sayısı planın geciken göstergesiyle aynıdır', async () => {
      await isEmirleriAc([yeniAdim()], 3, '2000-01-01');
      const [calisan] = await isEmirleriAc([yeniAdim(), yeniAdim()], 3, '2000-01-02');
      await isEmriDurumu(calisan!, 'calisiyor');
      const say = await tamam<Record<string, number | null>>(c.planlama, 'GET', '/plan/menu-sayaclari');
      const p = await planOku();
      assert.ok(p.gostergeler.geciken > 0);
      assert.equal(say.plan, p.gostergeler.geciken);
      await isEmriDurumu(calisan!, 'bekliyor');
    });

    test('plan, menü sayacı ve öner: sorgu sayısı açık iş emri sayısıyla büyümez', async () => {
      const urun = await mamulAc();
      const rev = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim({ kaynak: { tur: 'istasyon', id: istasyonB } })]);
      const emreKopyala = () => tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: '2099-01-01' });
      const ilk = (await emreKopyala()).isEmriIdleri;
      await isEmriDurumu(ilk[0]!, 'calisiyor');
      const k = await planlamaci();
      const olc = async () => [
        await sorguSay((db) => planServisi(db, k)), await sorguSay((db) => menuSayaclari(db, k)), await sorguSay((db) => oner(db, k, null)),
      ];
      const once = await olc();
      const ekler = [(await emreKopyala()).isEmriIdleri[0]!, (await emreKopyala()).isEmriIdleri[0]!];
      for (const ie of ekler) await isEmriDurumu(ie, 'calisiyor');
      assert.deepEqual(await olc(), once);
      for (const ie of [ilk[0]!, ...ekler]) await isEmriDurumu(ie, 'bekliyor');
    });
  });
});
