import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { BedelAyari, CanliYerlesimCevabi, KuyrukYazCevabi, PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { CalismaGeriAlCevabi, CalismaTaslagiCevabi, CanliFarkiCevabi, TabanVeCanliCevabi, TaslaktanCalismayaCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import type { AdimGirdisi, KomutCevabi, RevizyonAyrintisi, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { canliOzeti } from './disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { calismaPlani } from './plan-girdisi.ts';
import { planlamaGirdisi } from './planlama-servis.ts';
import { komutIstegi } from '../../../istemci/src/moduller/recete-rota/kaynak-komutlari.ts';
import { planSenaryoKomutlari } from '../../../istemci/src/moduller/recete-rota/plan-senaryo-komutlari.ts';
import { PLAN_STOK_KOMUTLARI } from '../../../istemci/src/moduller/recete-rota/plan-stok-komutlari.ts';

const PAROLA = 'dogru-parola-1';

interface Rol { id: number; ad: string }

describe('Reçete ve Rota canlıya al akışı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  const c: Record<'yonetici' | 'kartOnaycisi' | 'planlama' | 'mudur', string> = { yonetici: '', kartOnaycisi: '', planlama: '', mudur: '' };
  let tipler: SeceneklerCevabi['operasyonTipleri'] = [];
  let makineA = 0;
  let ortakHammadde = 0;
  let fasoncu = 0;
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

  const kartZorunlulari = (tur: string, sira: number): Record<string, unknown> => ({
    hammadde: { grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 + sira } },
    mamul: { g: { ad: `Deneme mamul ${sira}` } },
    yarimamul: { g: { ad: `Deneme yarimamul ${sira}`, tip: 'Talaşlı işlenmiş parça' } },
    ticari_mal: { g: { ad: `Deneme ticari_mal ${sira}` } },
    hizmet: { g: { kat: 'fason', yon: 'Alınan', cesit: 'Talaşlı imalat' } },
  } as Record<string, Record<string, unknown>>)[tur] ?? {};
  async function kartAc(tur: 'mamul' | 'hammadde'): Promise<number> {
    const kimlik = `ca${++sayac}`;
    // Kart, malzeme sihirbazının zorunlu alanlarıyla açılır (malzemeler B11): hammaddede aile, kalite ve kart başına ayrı ölçü.
    const zorunlu = kartZorunlulari(tur, sayac);
    const kod = `${tur === 'hammadde' ? 'HM' : 'MM'}-CAL-00001`;
    const govde = (d: string, surum: number | null) => ({
      kayit: { id: kimlik, tur, fam: 'metal', com: { kod, ad: `Deneme ${tur} ${sayac}`, birim: 'adet' }, onay: { durum: d }, ...zorunlu },
      ozet: { stok_kodu: kod, tur, onay_durumu: d, benzersiz_anahtar: `${tur}|${kimlik}`, mukerrer_gerekcesi: null },
      surum,
    });
    const r = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('taslak', null));
    const g = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('onayda', r.surum));
    await tamam(c.kartOnaycisi, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('aktif', g.surum));
    const satir = await vt().tx((db) => db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]));
    return satir!.no;
  }

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
  const fasonAdim = (terminGun: number): AdimGirdisi =>
    yeniAdim({ ad: 'Deneme kaplama', kaynak: { tur: 'fason', id: fasoncu }, ayarSuresiDk: null, birimSureDk: null, terminGun });

  async function yururlugeAlinmisRota(urun: number, adimlar: AdimGirdisi[]): Promise<number> {
    const ac = await istek(c.planlama, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak: { tur: 'bos' } });
    assert.equal(ac.statusCode, 200, ac.body);
    const { id } = ac.json<KomutCevabi>();
    const k = await istek(c.planlama, 'POST', `/rota/revizyonlar/${id}/kaydet`, { surum: 1, aciklama: null, adimlar });
    assert.equal(k.statusCode, 200, k.body);
    const g = await istek(c.planlama, 'POST', `/rota/revizyonlar/${id}/onaya-gonder`, { surum: k.json<KomutCevabi>().surum });
    assert.equal(g.statusCode, 200, g.body);
    const o = await istek(c.mudur, 'POST', `/rota/revizyonlar/${id}/onayla`, { surum: g.json<KomutCevabi>().surum, yururlugeAl: true });
    assert.equal(o.statusCode, 200, o.body);
    return id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('rrcanliyaal');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('RR.CANLI', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    c.yonetici = await girisCerezi('yonetici');
    await ortam.vt.tx((db) => db.sorgu(
      `INSERT INTO rol_islemi (rol_id, islem)
       SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem FROM (VALUES
         ('planlama_proje', 'rota.yaz'), ('planlama_proje', 'rota.emre-kopyala'),
         ('mudur', 'rota.onayla'),
         ('planlama_proje', 'plan.yaz'), ('planlama_proje', 'plan.kilitle'), ('planlama_proje', 'plan.studyo'), ('planlama_proje', 'plan.canliya-al'),
         ('mudur', 'plan.studyo'), ('mudur', 'plan.canliya-al')) AS m (kod, islem)
       ON CONFLICT DO NOTHING`,
    ));
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kart Onaycısı', kullaniciAdi: 'kartonay', parola: PAROLA }));
    c.kartOnaycisi = await girisCerezi('kartonay');
    const roller = ((await istek(c.yonetici, 'GET', '/roller')).json() as { roller: Rol[] }).roller;
    const rol = (ad: string): number => {
      const r = roller.find((x) => x.ad === ad);
      if (!r) throw new Error(`Rol yok: ${ad}`);
      return r.id;
    };
    for (const [ad, rolAdi] of [['planlama', 'Planlama ve Proje'], ['mudur', 'Müdür']] as const) {
      await kisiEkle(ad, rol(rolAdi));
      c[ad] = await girisCerezi(ad);
    }
    tipler = (await tamam<SeceneklerCevabi>(c.planlama, 'GET', '/rota/secenekler')).operasyonTipleri;
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'CA-IM', ad: 'Deneme merkez', aciklama: null });
    const istasyon = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'CA-A', ad: 'Deneme A', isMerkeziId: merkez.id })).id;
    makineA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'CA-MA', ad: 'Deneme makine A', istasyonId: istasyon })).id;
    // ADR 0018: canlıya alma ve kuyruk yazımı sunucu motoruyla dizer. Motor planlama sayfasının çalışma kaydı olmadan çözmez (409) ve
    // vardiyası tanımsız tezgâha yer vermez (168 b): kayıt boş yazılır, makinenin iş merkezi her gün çalışır.
    const gun = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('CA gunduz', '00:00', '23:59') RETURNING id"))!.id;
    await ortam!.sahip.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) SELECT $1, g, $2 FROM generate_series(1, 7) g', [merkez.id, gun]);
    await tamam(c.yonetici, 'POST', '/plan/planlama-kayitlari/yaz', {
      anahtar: PLANLAMA_ANAHTARI, bicim: 'json', beklenenSurum: null,
      deger: {
        surum: 2, rrSavedAt: null, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
        w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
        D: { meta: { ad: 'Deneme', baslangic: tesisGunu(Date.now()) }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [],
          tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
      },
    });
    ortakHammadde = await kartAc('hammadde');
    fasoncu = (await tamam<{ firma: { id: number } }>(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme fasoncu', tur: 'tedarikci', fason: true })).firma.id;
  });

  after(async () => { await ortam?.kaldir(); });

  const govdeye = (a: RevizyonAyrintisi['adimlar'][number]): AdimGirdisi => ({
    opNo: a.opNo, operasyonTipiId: a.operasyonTipi.id, ad: a.ad, kaynak: a.kaynak ? { tur: a.kaynak.tur, id: a.kaynak.id } : null,
    ayarSuresiDk: a.ayarSuresiDk === null ? null : Number(a.ayarSuresiDk), birimSureDk: a.birimSureDk === null ? null : Number(a.birimSureDk),
    terminGun: a.terminGun, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, firePayiYuzde: Number(a.firePayiYuzde), makineKullanimi: a.makineKullanimi,
    enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar, adaylar: [],
    bilesenler: a.bilesenler.map((b) => ({ malzemeId: b.malzeme.id, miktar: Number(b.miktar), fireYuzde: Number(b.fireYuzde) })),
    yanUrunler: a.yanUrunler.map((y) => ({ malzemeId: y.malzeme.id, miktar: Number(y.miktar) })),
  });

  // Yürürlükteki rotadan yeni revizyon türetir: eski adımlar op numaralarıyla gelir, `degistir` yeni listeyi kurar.
  async function yeniRota(urun: number, kaynakRevizyon: number, degistir: (eski: AdimGirdisi[]) => AdimGirdisi[]): Promise<number> {
    const ac = await istek(c.planlama, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak: { tur: 'revizyon', revizyonId: kaynakRevizyon } });
    assert.equal(ac.statusCode, 200, ac.body);
    const { id, surum } = ac.json<KomutCevabi>();
    const a = await tamam<RevizyonAyrintisi>(c.planlama, 'GET', `/rota/revizyonlar/${id}`);
    const k = await istek(c.planlama, 'POST', `/rota/revizyonlar/${id}/kaydet`, { surum, aciklama: null, adimlar: degistir(a.adimlar.map(govdeye)) });
    assert.equal(k.statusCode, 200, k.body);
    const g = await istek(c.planlama, 'POST', `/rota/revizyonlar/${id}/onaya-gonder`, { surum: k.json<KomutCevabi>().surum });
    assert.equal(g.statusCode, 200, g.body);
    const o = await istek(c.mudur, 'POST', `/rota/revizyonlar/${id}/onayla`, { surum: g.json<KomutCevabi>().surum, yururlugeAl: true });
    assert.equal(o.statusCode, 200, o.body);
    return id;
  }

  interface Emir { uretimEmriId: number; isEmriIdleri: number[]; revizyon: number; urun: number }
  async function emirAc(adimlar: AdimGirdisi[], urun?: number, revizyon?: number): Promise<Emir> {
    const u = urun ?? await kartAc('mamul');
    const rev = revizyon ?? await yururlugeAlinmisRota(u, adimlar);
    const e = await tamam<{ isEmriIdleri: number[]; uretimEmriId: number }>(c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 10, teslim: null });
    return { ...e, revizyon: rev, urun: u };
  }

  const canliPlan = (idler: number[]) => tamam<CanliYerlesimCevabi>(c.planlama, 'GET', `/plan/canli-yerlesim?isEmirleri=${idler.join(',')}`);
  const emirOp = async (id: number) => (await vt().tx((db) => db.tek<{ emirNo: string; opNo: number }>(
    'SELECT e.emir_no AS "emirNo", i.op_no AS "opNo" FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id WHERE i.id = $1', [id])))!;
  // Ekranın planYaz'ı: tek makine kuyruğu, başlangıç gelecekte. Kuyruk taslağa yazılır; canliyaAl ise o taslak plan modülünün
  // canlıya alma ucuyla canlıya alınır (yayının tek yolu taslak, sonra canlıya al).
  async function kuyrukYaz(idler: number[], canliyaAl: boolean, cerez = c.planlama) {
    const isler = await Promise.all(idler.map(async (id) => ({ ...(await emirOp(id)), dondurulmus: false })));
    const yaz = await istek(cerez, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler }],
    });
    if (canliyaAl && yaz.statusCode === 200) await canliyaYaz(yaz.json<KuyrukYazCevabi>().taslak, cerez);
    return yaz;
  }
  // Canlıya yalnız onaydaki taslak alınır (H1): önce onaya gönderilir; dört göz kapalıyken gönderen kendisi onaylar.
  async function canliyaYaz(taslak: number, cerez = c.planlama) {
    const surum = async () => (await tamam<PlanCevabi>(cerez, 'GET', `/plan?taslak=${String(taslak)}`)).taslak!.surum;
    await tamam(cerez, 'POST', `/plan/senaryolar/${String(taslak)}/onaya-gonder`, { surum: await surum() });
    await tamam(cerez, 'POST', `/plan/senaryolar/${String(taslak)}/canliya-al`, { surum: await surum(), cakismalariKabul: false });
  }
  // Ekranın onay düğmeleri: önce onaya gönder, sonra canlıya al; ikisi de tekrar korumalı.
  async function onaylaCanliyaAl(komutlar: ReturnType<typeof planSenaryoKomutlari>, taslak: number) {
    for (const ad of ['plan-senaryo-onaya-gonder', 'plan-senaryo-canliya-al']) {
      const r = await komutlar[ad]!.hazirla({ taslak });
      assert.equal(r.tekrarKorumali, true);
      await tamam(c.planlama, 'POST', r.yol, r.govde);
    }
  }

  const GUN_MS = 86_400_000;
  const anahtarlar = async (idler: number[]) => Promise.all(idler.map(async (id) => { const x = await emirOp(id); return `${x.emirNo}|${x.opNo}`; }));
  const ozetKuyrugu = async (anahtar: string[]) => (await vt().tx((db) => canliOzeti(db))).kuyruklar.find((q) => q.makineId === makineA)?.isler
    .filter((x) => anahtar.includes(x.anahtar)).map((x) => x.anahtar) ?? [];
  const isEmriDurumu = (id: number, durum: 'bekliyor' | 'calisiyor') => vt().tx((db) => db.sorgu(
    'UPDATE uretim_emirleri_is_emri SET durum = $2, baslama = CASE WHEN $2 = \'calisiyor\' THEN now() END WHERE id = $1', [id, durum]));
  const emirdekiAdimlar = (uretimEmriId: number) => vt().tx((db) => db.sorgu<{ opNo: number; durum: string; makineId: number | null; fasonFirmaId: number | null }>(
    `SELECT op_no AS "opNo", durum, makine_id AS "makineId", fason_firma_id AS "fasonFirmaId" FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira`, [uretimEmriId]));

  test('CA-1: canlıya al önce boş canlı kuyruk, sonra verilen sıra; canlıda sıra, makine, son canlıya alma zamanı ve kişisi', async () => {
    const e1 = await emirAc([yeniAdim(), fasonAdim(2), yeniAdim()]);
    const e2 = await emirAc([yeniAdim(), fasonAdim(2), yeniAdim()]);
    const [i1, , i3] = e1.isEmriIdleri as [number, number, number];
    const [j1, , j3] = e2.isEmriIdleri as [number, number, number];
    const idler = [i1, i3, j1, j3];
    const anahtar = await anahtarlar(idler);

    const onceki = await canliPlan(idler);
    const ozetOnce = await vt().tx((db) => canliOzeti(db));
    assert.deepEqual(onceki.yerlesimler, [], 'emir açılınca canlıda yer yok');
    assert.deepEqual(await ozetKuyrugu(anahtar), []);
    assert.equal(ozetOnce.sonCanliyaAlma, null, 'bu veritabanında henüz canlıya alma yok');
    assert.deepEqual(anahtar.filter((a) => !ozetOnce.planlanacak.includes(a)), [], 'fason olmayan dört adım planlanacak listesinde');

    const taslaga = await kuyrukYaz([j1, i1, j3, i3], false);
    assert.equal(taslaga.statusCode, 200, taslaga.body);
    assert.deepEqual(taslaga.json(), { ...taslaga.json(), yazilan: 4, atlanan: 0 });
    assert.deepEqual((await canliPlan(idler)).yerlesimler, [], 'taslağa yazmak canlıyı değiştirmez');

    const canliya = await kuyrukYaz([j1, i1, j3, i3], true);
    assert.equal(canliya.statusCode, 200, canliya.body);
    assert.deepEqual(canliya.json(), { ...canliya.json(), yazilan: 4, atlanan: 0 });
    const sonra = await canliPlan(idler);
    const sirali = [...sonra.yerlesimler].sort((a, b) => a.elleSira! - b.elleSira!);
    assert.deepEqual(sirali.map((y) => y.isEmriId), [j1, i1, j3, i3]);
    assert.deepEqual(sirali.map((y) => y.elleSira), [1, 2, 3, 4]);
    assert.ok(sirali.every((y) => y.kaynak.tur === 'makine' && y.kaynak.id === makineA && !y.kilitli && !y.dondurulmus));
    for (let n = 1; n < sirali.length; n += 1) assert.ok(Date.parse(sirali[n]!.baslangic) >= Date.parse(sirali[n - 1]!.bitis), 'makine aynı anda tek iş');
    assert.ok(sonra.planSurumu > onceki.planSurumu, 'canlıya alma plan sürümünü artırır');

    const ozet = await vt().tx((db) => canliOzeti(db));
    assert.deepEqual(await ozetKuyrugu(anahtar), await anahtarlar([j1, i1, j3, i3]));
    assert.ok(ozet.sonCanliyaAlma !== null && Date.now() - Date.parse(ozet.sonCanliyaAlma.zaman) < 600_000, 'son canlıya alma az önce');
    assert.equal(ozet.sonCanliyaAlma?.kisi, 'Deneme planlama');

    // Yeniden sıralayıp canlıya almak önceki canlı sırayı değiştirir.
    // 248 a: canlıdaki işler 4 saatin dışına alınır; yakın iş yeniden sıralanamaz.
    await vt().tx((db) => db.sorgu("UPDATE plan_yerlesimi SET baslangic = baslangic + interval '1 day', bitis = bitis + interval '1 day' WHERE is_emri_id = ANY($1::int[])", [idler]));
    const yine = await kuyrukYaz([i1, j1, i3, j3], true);
    assert.equal(yine.statusCode, 200, yine.body);
    assert.deepEqual((await ozetKuyrugu(anahtar)), await anahtarlar([i1, j1, i3, j3]));
    assert.notDeepEqual(await ozetKuyrugu(anahtar), await anahtarlar([j1, i1, j3, i3]));
  });

  // Köprü ve bu test aynı tabloyu ve istek kurucusunu kullanır; ekran ayar ya da canlıya alma gönderse de kuyruk yazımına girmez.
  test('CA-1b: ekranın Canlıya al\'ı üç adımdır: ayar /plan/ayar ile yeni taslağa, kuyruk aynı taslağa, sonra taslak canlıya alınır', async () => {
    const e = await emirAc([yeniAdim(), yeniAdim()]);
    const idler = e.isEmriIdleri;
    const anahtar = await anahtarlar(idler);
    const gonder = <T,>(r: { yol: string; govde: unknown; tekrarKorumali?: boolean }) => { assert.equal(r.tekrarKorumali, true); return tamam<T>(c.planlama, 'POST', r.yol, r.govde); };
    const onceki = await tamam<PlanCevabi>(c.planlama, 'GET', '/plan');
    const ayar = { ...onceki.ayar, tamponGun: onceki.ayar.tamponGun === 5 ? 6 : 5 };
    const a = await gonder<PlanCevabi>(komutIstegi(PLAN_STOK_KOMUTLARI['plan-ayar']!, { ayar, taslak: { id: 1, surum: 1 } }));
    assert.ok(a.taslak !== null && a.taslak.benim, 'ayar kişiye yeni açılan taslağa yazılır');
    assert.equal((await tamam<PlanCevabi>(c.planlama, 'GET', '/plan')).ayar.tamponGun, onceki.ayar.tamponGun, 'canlı ayar değişmez');
    const isler = await Promise.all(idler.map(async (id) => ({ ...(await emirOp(id)), dondurulmus: false })));
    const kuyruklar = [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler }];
    const k = await gonder<KuyrukYazCevabi>(komutIstegi(PLAN_STOK_KOMUTLARI['plan-yaz']!, {
      kuyruklar, taslak: { id: a.taslak.id, surum: a.taslak.surum }, planSurumu: onceki.surum, ayar: { ...ayar, tamponGun: 9 }, canliyaAl: true,
    }));
    assert.deepEqual([k.taslak, k.canli, k.yazilan], [a.taslak.id, false, 2]);
    assert.deepEqual(await ozetKuyrugu(anahtar), [], 'canlıya alınmadan canlı değişmez');
    const komutlar = planSenaryoKomutlari((yol) => tamam(c.planlama, 'GET', yol));
    await onaylaCanliyaAl(komutlar, k.taslak);
    assert.deepEqual(await ozetKuyrugu(anahtar), anahtar);
    assert.equal((await tamam<PlanCevabi>(c.planlama, 'GET', '/plan')).ayar.tamponGun, ayar.tamponGun, 'canlı ayar taslaktan gelir');
  });

  test('CA-1c: ekranın Dondur düğmeleri plan modülünün dondurma uçlarına gider; dondurma taslağa yazılır, taslak canlıya alınır', async () => {
    const e = await emirAc([yeniAdim(), yeniAdim()]);
    const idler = e.isEmriIdleri;
    const anahtar = await anahtarlar(idler);
    const gonder = <T,>(r: { yol: string; govde: unknown; tekrarKorumali?: boolean }) => { assert.equal(r.tekrarKorumali, true); return tamam<T>(c.planlama, 'POST', r.yol, r.govde); };
    const komutlar = planSenaryoKomutlari((yol) => tamam(c.planlama, 'GET', yol));
    const canlidaDonmus = async () => (await tamam<PlanCevabi>(c.planlama, 'GET', '/plan')).yerlesimler
      .filter((y) => idler.includes(y.isEmriId)).map((y) => [y.isEmriId, y.dondurulmus]);
    const onceki = await tamam<PlanCevabi>(c.planlama, 'GET', '/plan');
    const a = await gonder<PlanCevabi>(komutIstegi(PLAN_STOK_KOMUTLARI['plan-ayar']!, { ayar: { ...onceki.ayar, dondurmaGun: 3 } }));
    const isler = await Promise.all(idler.map(async (id) => ({ ...(await emirOp(id)), dondurulmus: false })));
    const k = await gonder<KuyrukYazCevabi>(komutIstegi(PLAN_STOK_KOMUTLARI['plan-yaz']!, {
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler }],
      taslak: { id: a.taslak!.id, surum: a.taslak!.surum }, planSurumu: onceki.surum,
    }));
    const d = await gonder<PlanCevabi>(await komutlar['plan-dondur']!.hazirla({ taslak: k.taslak }));
    assert.equal(d.taslak?.id, k.taslak, 'ekranın az önce yazdığı taslağa');
    assert.equal((await canlidaDonmus()).some(([, donmus]) => donmus), false, 'canlıya alınmadan canlı değişmez');
    await onaylaCanliyaAl(komutlar, d.taslak!.id);
    assert.deepEqual(await canlidaDonmus(), idler.map((id) => [id, true]));

    // Tek işin dondurması: taslak verilmezse plan modülü yeni taslak açar; iş emri canlı plandan anahtarıyla bulunur.
    const tek = await gonder<PlanCevabi>(await komutlar['plan-is-dondurmayi-kaldir']!.hazirla({ anahtar: anahtar[0] }));
    assert.ok(tek.taslakAcildi);
    await onaylaCanliyaAl(komutlar, tek.taslak!.id);
    assert.deepEqual(await canlidaDonmus(), [[idler[0], false], [idler[1], true]]);
    await assert.rejects(komutlar['plan-is-dondurmayi-kaldir']!.hazirla({ anahtar: anahtar[0] }), /dondurulmuş değil/);

    const hepsi = await gonder<PlanCevabi>(await komutlar['plan-dondurmayi-kaldir']!.hazirla({}));
    await onaylaCanliyaAl(komutlar, hepsi.taslak!.id);
    assert.deepEqual(await canlidaDonmus(), idler.map((id) => [id, false]));
    const geri = await gonder<PlanCevabi>(komutIstegi(PLAN_STOK_KOMUTLARI['plan-ayar']!, { ayar: onceki.ayar }));
    await onaylaCanliyaAl(komutlar, geri.taslak!.id);
  });

  test('CA-2 (#1424, kullanıcı kararı): fason iş emri planda kapasite tüketmez; sonraki iç adım kuyruk yazımında fason termini kadar bekler', async () => {
    const TERMIN = 2;
    const e = await emirAc([yeniAdim(), fasonAdim(TERMIN), yeniAdim()]);
    const [i1, fason, i3] = e.isEmriIdleri as [number, number, number];
    const adimlar = await emirdekiAdimlar(e.uretimEmriId);
    assert.deepEqual(adimlar.map((a) => [a.opNo, a.fasonFirmaId === null ? 'ic' : 'fason']), [[10, 'ic'], [20, 'fason'], [30, 'ic']]);
    const [aFason, aIc] = [await anahtarlar([fason]), await anahtarlar([i1, i3])];
    assert.equal((await vt().tx((db) => canliOzeti(db))).planlanacak.some((a) => aFason.includes(a)), false, 'fason adım planlanacak listesinde yok');

    // Kuyruk yazımı (Canlıya al): fason adım kuyruğa girmez, iç adımlar yazılır; sonraki iç adım fason termini kadar bekler.
    const once = await canliPlan(e.isEmriIdleri);
    const red = await kuyrukYaz([i1, fason, i3], true);
    assert.equal(red.statusCode, 400, red.body);
    assert.match(red.body, /OP 20 planlanacak iş emri değil/);
    assert.deepEqual(await canliPlan(e.isEmriIdleri), once, 'reddedilen yazım canlıyı değiştirmez');
    const yaz = await kuyrukYaz([i1, i3], true);
    assert.equal(yaz.statusCode, 200, yaz.body);
    const canli = await canliPlan(e.isEmriIdleri);
    assert.deepEqual(canli.yerlesimler.map((x) => x.isEmriId).sort(), [i1, i3].sort(), 'canlıda fason iş emrinin yeri yok');
    const c1 = canli.yerlesimler.find((x) => x.isEmriId === i1)!;
    const c3 = canli.yerlesimler.find((x) => x.isEmriId === i3)!;
    const bekleme = Date.parse(c3.baslangic) - Date.parse(c1.bitis);
    assert.ok(bekleme >= TERMIN * GUN_MS && bekleme < (TERMIN + 1) * GUN_MS, `kuyruk yazımı fason termini kadar bekler (ölçülen ${bekleme} ms)`);
    assert.deepEqual(await ozetKuyrugu([...aIc, ...aFason]), aIc, 'makine kuyruğunda yalnız iç adımlar');
  });

  test('CA-3 (#1408): emirde olmayan adım (yeni rotada OP40) kuyruğa yazılmaz: 400, canlı değişmez; planlanacak listesinde yok', async () => {
    const e = await emirAc([yeniAdim(), fasonAdim(2), yeniAdim()]);
    const [i1, , i3] = e.isEmriIdleri as [number, number, number];
    assert.equal((await kuyrukYaz([i1, i3], true)).statusCode, 200);
    const rotaB = await yeniRota(e.urun, e.revizyon, (eski) => [...eski, yeniAdim({ ad: 'Yeni adım' })]);
    assert.notEqual(rotaB, e.revizyon);

    const emir = (await emirOp(i1)).emirNo;
    const adimlar = await emirdekiAdimlar(e.uretimEmriId);
    assert.deepEqual(adimlar.map((a) => a.opNo), [10, 20, 30], 'emir eski rotada kalır');
    const once = await canliPlan(e.isEmriIdleri);
    const ozetOnce = await vt().tx((db) => canliOzeti(db));
    assert.equal(ozetOnce.planlanacak.includes(`${emir}|40`), false, 'OP40 planlanacak listesinde yok');

    const op40 = (isler: { emirNo: string; opNo: number }[]) => istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      ayar: null, canliyaAl: false,
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler: isler.map((x) => ({ ...x, dondurulmus: false })) }],
    });
    const red = await op40([{ emirNo: emir, opNo: 40 }]);
    assert.equal(red.statusCode, 400, red.body);
    assert.match(red.body, /OP 40 planlanacak iş emri değil/);
    // Karışık istek de bütünüyle reddedilir: OP10'un yeri değişmez.
    const karisik = await op40([{ emirNo: emir, opNo: 30 }, { emirNo: emir, opNo: 10 }, { emirNo: emir, opNo: 40 }]);
    assert.equal(karisik.statusCode, 400, karisik.body);
    assert.deepEqual(await canliPlan(e.isEmriIdleri), once, 'canlı plan ve sürümü değişmedi');
    assert.deepEqual(await ozetKuyrugu(await anahtarlar([i1, i3])), await anahtarlar([i1, i3]));
  });

  test('CA-4 (#1409): rotası değişen açık emre yeni rota uygulanınca yeni adımın iş emri doğar ve kuyruğa yazılır; tekrar korumalı', async () => {
    const e = await emirAc([yeniAdim(), yeniAdim()]);
    const [i1, i2] = e.isEmriIdleri as [number, number];
    await yeniRota(e.urun, e.revizyon, (eski) => [...eski, yeniAdim({ ad: 'Yeni adım' })]);
    const emir = (await emirOp(i1)).emirNo;
    const yol = `/rota/emirler/${e.uretimEmriId}/yururlukteki-rotayi-uygula`;
    const kimlik = randomUUID();

    const u = await istek(c.planlama, 'POST', yol, {}, kimlik);
    assert.equal(u.statusCode, 200, u.body);
    assert.deepEqual(u.json<{ degisenler: string[] }>().degisenler, ['OP 30 eklendi']);
    const yineleme = await istek(c.planlama, 'POST', yol, {}, kimlik);
    assert.equal(yineleme.statusCode, 200, 'aynı istek kimliğiyle yineleme ikinci kez uygulanmaz, ilk cevap döner');
    assert.deepEqual(yineleme.json(), u.json());

    const adimlar = await emirdekiAdimlar(e.uretimEmriId);
    assert.deepEqual(adimlar.map((a) => [a.opNo, a.durum]), [[10, 'bekliyor'], [20, 'bekliyor'], [30, 'bekliyor']]);
    const yeni = adimlar.find((a) => a.opNo === 30);
    assert.ok(yeni && yeni.makineId === makineA && yeni.fasonFirmaId === null);
    const [i30] = (await vt().tx((db) => db.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 AND op_no = 30', [e.uretimEmriId]))).map((x) => x.id) as [number];
    assert.ok((await vt().tx((db) => canliOzeti(db))).planlanacak.includes(`${emir}|30`), 'OP30 artık planlanacak listesinde');

    const yaz = await kuyrukYaz([i1, i2, i30], true);
    assert.equal(yaz.statusCode, 200, yaz.body);
    assert.deepEqual(yaz.json(), { ...yaz.json(), yazilan: 3, atlanan: 0 });
    const sirali = [...(await canliPlan([i1, i2, i30])).yerlesimler].sort((a, b) => a.elleSira! - b.elleSira!);
    assert.deepEqual(sirali.map((x) => x.isEmriId), [i1, i2, i30]);
  });

  test('CA-4b (#1409): yeni adım başlamış adımın önüne düşüyorsa uygulama 409 ile reddedilir; emir ve canlı plan değişmez, eski adımlar canlıya alınabilir', async () => {
    const e = await emirAc([yeniAdim(), yeniAdim()]);
    const [i1, i2] = e.isEmriIdleri as [number, number];
    await yeniRota(e.urun, e.revizyon, (eski) => [yeniAdim({ ad: 'Öne düşen adım' }), ...eski]);
    await isEmriDurumu(i1, 'calisiyor');
    const once = await emirdekiAdimlar(e.uretimEmriId);

    const u = await istek(c.planlama, 'POST', `/rota/emirler/${e.uretimEmriId}/yururlukteki-rotayi-uygula`, {});
    assert.equal(u.statusCode, 409, u.body);
    assert.match(u.body, /başlamış ya da bitmiş adımların önüne düşüyor/);
    assert.deepEqual(await emirdekiAdimlar(e.uretimEmriId), once, 'emirdeki adımlar değişmedi');
    const kaynak = await vt().tx((db) => db.tek<{ rev: number }>('SELECT kaynak_rota_revizyonu_id AS rev FROM uretim_emri WHERE id = $1', [e.uretimEmriId]));
    assert.equal(kaynak?.rev, e.revizyon, 'emir eski rotada kaldı');

    const yaz = await kuyrukYaz([i2], true);
    assert.equal(yaz.statusCode, 200, yaz.body);
    assert.deepEqual((await canliPlan([i2])).yerlesimler.map((x) => x.isEmriId), [i2]);
    const emir = (await emirOp(i1)).emirNo;
    const yeniOp = await istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      ayar: null, canliyaAl: false, kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler: [{ emirNo: emir, opNo: 30, dondurulmus: false }] }],
    });
    assert.equal(yeniOp.statusCode, 400, yeniOp.body);
  });

  test('CA-9: plan öncelik ayarları köprü tablosuyla plan modülüne yazılır; müdür yazar, planlama 403 alır, okuma herkese açık', async () => {
    const onceki = await tamam<BedelAyari>(c.planlama, 'GET', '/plan/bedel-ayari');
    const yeni = { ...onceki, tabanBedelSaat: onceki.tabanBedelSaat + 1, finansmanOraniGun: null };
    const r = komutIstegi(PLAN_STOK_KOMUTLARI['plan-bedel-ayari']!, { ...yeni, fazla: 1 });
    assert.deepEqual([r.yol, r.tekrarKorumali, r.govde], ['/plan/bedel-ayari', true, { ...yeni, taslak: null }]);
    assert.equal((await istek(c.planlama, 'POST', r.yol, r.govde)).statusCode, 403);
    // 148 a: bedel ayarı taslağa yazılır, onayla canlıya geçer.
    const t = (await tamam<PlanCevabi>(c.mudur, 'POST', r.yol, r.govde)).taslak!.id;
    assert.deepEqual(await tamam<BedelAyari>(c.planlama, 'GET', `/plan/bedel-ayari?taslak=${String(t)}`), yeni);
    assert.deepEqual(await tamam<BedelAyari>(c.planlama, 'GET', '/plan/bedel-ayari'), onceki, 'onaya kadar canlı değişmez');
    await canliyaYaz(t, c.mudur);
    assert.deepEqual(await tamam<BedelAyari>(c.planlama, 'GET', '/plan/bedel-ayari'), yeni);
    await canliyaYaz((await tamam<PlanCevabi>(c.mudur, 'POST', r.yol, { ...onceki, taslak: null })).taslak!.id, c.mudur);
  });
  // 499 a, 503 a, 505 a, 506 a: çalışma planı sunucuda plan modülünün diliyle okunur ve yazılır. Çalışmanın işlem kimlikleri sayfanın
  // çevirisinden (calisma.betik); saatler planın ekseninde, bugünün 00:00'ından.
  test('CA-10: çalışma planı yeni taslağa yazılır (yetki, sürüm), canlıyla farkı ve taban/canlı plan sayfanın anahtarlarıyla okunur', async () => {
    const e = await emirAc([yeniAdim(), yeniAdim()]);
    const [i1, i2] = e.isEmriIdleri as [number, number];
    const [a1, a2] = await anahtarlar([i1, i2]);
    const bugun = tesisGunu(Date.now());
    const saat = (an: number) => (an - tesisGunBasi(bugun)) / 3_600_000;
    let calismaSurumu: number | null = (await vt().tx((db) => db.tek<{ surum: number }>('SELECT surum FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI])))?.surum ?? null;
    const calismaYaz = async (ops: Record<string, { S: number; C: number; m: string; done?: boolean }> | null) => {
      const calisma = {
        surum: 2, rrSavedAt: null, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [],
        plan: ops === null ? null : { ops, dataVer: 1, zaman: Date.now() },
        w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
        D: { meta: { ad: 'Deneme', baslangic: bugun }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [],
          personel: [], siparisler: [], ayarlar: {} },
      };
      const r = await tamam<{ kayit: { surum: number } }>(c.yonetici, 'POST', '/plan/planlama-kayitlari/yaz',
        { anahtar: PLANLAMA_ANAHTARI, bicim: 'metin', deger: JSON.stringify(calisma), beklenenSurum: calismaSurumu });
      calismaSurumu = r.kayit.surum;
    };
    await calismaYaz(null);
    const planlamaci = (await kimlikCozucu(vt())({ headers: { cookie: c.planlama } } as never))!;
    const kimlik = await vt().tx(async (db) => {
      const g = await planlamaGirdisi(db, planlamaci);
      return calismaPlani({ ...g.girdi!, bugun })!.kimlik;
    });
    const k = (a: string) => Object.entries(kimlik).find(([, x]) => x === a)?.[0];
    const [k1, k2] = [k(a1!), k(a2!)];
    assert.ok(k1 !== undefined && k2 !== undefined && k1 !== k2, 'iki adım sayfanın işlem kimliğine çevrilir');
    assert.equal((await tamam<CanliFarkiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi/canli-farki')), null, 'çalışmada plan yok');

    const bas = saat(Date.now() + 2 * 3_600_000);
    const ops = { [k1]: { S: bas, C: bas + 50 / 60, m: String(makineA) }, [k2]: { S: bas + 50 / 60, C: bas + 100 / 60, m: String(makineA) },
      'yok.1': { S: bas, C: bas + 1, m: String(makineA) } };
    await calismaYaz(ops);
    // Önceki testlerin canlıdaki işleri bu çalışmada yok: eksik sayılırlar; kıyas bu emrin adımlarına bakar.
    const bunlar = (f: NonNullable<CanliFarkiCevabi>) => f.isler.filter((x) => x.anahtar === a1 || x.anahtar === a2).map((x) => [x.k, x.anahtar, x.tur]).sort();
    let f = (await tamam<CanliFarkiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi/canli-farki'))!;
    assert.deepEqual([f.ayni, f.yeni, f.tezgah, f.sira], [false, 2, 0, 0]);
    assert.equal(f.eksik, f.isler.filter((x) => x.tur === 'eksik').length);
    assert.deepEqual(bunlar(f), [[k1, a1, 'yeni'], [k2, a2, 'yeni']].sort());
    assert.deepEqual(f.yazilamaz, ['yok.1']);

    // Yazma: oturumlu ama plan yetkisiz kişi 403; plan yazma yetkisi olup stüdyo yetkisi olmayan 403 (plan modülünde); eski sürüm 409.
    const yazGovde = (surum: number | null) => ({ ad: 'Deneme calisma', calismaSurumu: surum });
    const rol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('test_yalniz_plan_yaz', 'test_yalniz_plan_yaz') RETURNING id");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'plan.yaz')", [rol!.id]);
    await kisiEkle('yalnizyaz', rol!.id);
    const yalnizYaz = await girisCerezi('yalnizyaz');
    const bos = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('test_yalniz_oturum', 'test_yalniz_oturum') RETURNING id");
    await kisiEkle('yalnizoturum', bos!.id);
    const oturumlu = await girisCerezi('yalnizoturum');
    const red = await istek(oturumlu, 'POST', '/plan/planlama-calismasi/taslak-yaz', yazGovde(calismaSurumu));
    assert.equal(red.statusCode, 403, red.body);
    const studyosuz = await istek(yalnizYaz, 'POST', '/plan/planlama-calismasi/taslak-yaz', yazGovde(calismaSurumu));
    assert.equal(studyosuz.statusCode, 403, studyosuz.body);
    assert.match(studyosuz.body, /stüdyosu/);
    const eski = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/taslak-yaz', yazGovde(calismaSurumu! - 1));
    assert.equal(eski.statusCode, 409, eski.body);
    const acikOnce = await vt().tx((db) => db.tek<{ n: number }>("SELECT count(*)::int AS n FROM plan_senaryosu WHERE ad = 'Deneme calisma'"));
    assert.equal(acikOnce!.n, 0, 'reddedilen yazma taslak bırakmaz');
    const y = await tamam<CalismaTaslagiCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/taslak-yaz', yazGovde(calismaSurumu));
    assert.deepEqual([y.yazilan, y.atlanan, y.yazilamaz], [2, 0, ['yok.1']]);
    const taslak = await vt().tx((db) => db.tek<{ ad: string; durum: string; acan: number }>(
      'SELECT ad, durum, acan_kisi_id AS acan FROM plan_senaryosu WHERE id = $1', [y.taslak.id]));
    assert.deepEqual(taslak, { ad: 'Deneme calisma', durum: 'acik', acan: planlamaci.id }, 'taslak yazanın adına açılır');
    const denetim = await ortam!.sahip.sorgu<{ kisi: number; ek: unknown }>(
      "SELECT kisi_id AS kisi, govde -> '_ek' AS ek FROM denetim_kaydi WHERE yol = '/plan/planlama-calismasi/taslak-yaz' ORDER BY id");
    assert.deepEqual(denetim.map((x) => x.kisi), [planlamaci.id], 'yalnız başarılı yazma, yazanın adıyla denetime girer');
    assert.match(JSON.stringify(denetim[0]!.ek), new RegExp(`"taslak":${String(y.taslak.id)}`));
    assert.deepEqual((await canliPlan([i1, i2])).yerlesimler, [], 'taslağa yazmak canlıyı değiştirmez');
    await canliyaYaz(y.taslak.id);

    f = (await tamam<CanliFarkiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi/canli-farki'))!;
    assert.deepEqual(bunlar(f), [], 'canlıya alınan çalışma canlıda yerinde: saatleri plan modülü kurar, tezgâh ve sıra aynı');
    // Çalışmada k1 k2'nin arkasına geçer: tezgâhtaki sıra değişir (en az iş işaretlenir); yalnız saat kayması fark değildir; k2 biterse
    // sayılmaz; k2 çalışmadan düşerse eksiktir (canlıda var, çalışmada yok).
    const kaydir = (S: number) => ({ S, C: S + 50 / 60, m: String(makineA) });
    await calismaYaz({ ...ops, [k1]: kaydir(bas + 5) });
    f = (await tamam<CanliFarkiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi/canli-farki'))!;
    assert.deepEqual(bunlar(f).map((x) => x[2]), ['sira']);
    assert.deepEqual([f.ayni, f.tasinan], [false, f.tezgah + f.sira]);
    await calismaYaz({ ...ops, [k1]: kaydir(bas + 0.5), [k2]: kaydir(bas + 3) });
    f = (await tamam<CanliFarkiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi/canli-farki'))!;
    assert.deepEqual(bunlar(f), [], 'sıra aynı, saat farkı sayılmaz');
    await calismaYaz({ ...ops, [k1]: kaydir(bas + 5), [k2]: { ...ops[k2]!, done: true } });
    f = (await tamam<CanliFarkiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi/canli-farki'))!;
    assert.deepEqual(bunlar(f), [], 'biten k2 sayılmaz');
    await calismaYaz(Object.fromEntries(Object.entries(ops).filter(([id]) => id !== k2)));
    f = (await tamam<CanliFarkiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi/canli-farki'))!;
    assert.deepEqual(bunlar(f).filter((x) => x[2] === 'eksik'), [[k2, a2, 'eksik']]);

    // Taban ve canlı: ilk canlıya almada taban yazılır; ikisi de aynı yer, sayfanın kimliğiyle. Okuma oturum ister.
    const tc = await tamam<TabanVeCanliCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi/taban-ve-canli');
    const satir = (id: number) => tc.isler.find((x) => x.isEmriId === id)!;
    for (const [id, kk, a] of [[i1, k1, a1], [i2, k2, a2]] as const) {
      const s = satir(id);
      assert.deepEqual([s.k, s.anahtar, s.uretimEmriId], [kk, a, e.uretimEmriId]);
      assert.ok(s.taban !== null && s.canli !== null);
      assert.deepEqual([s.taban.kaynak, s.taban.baslangic], [s.canli.kaynak, s.canli.baslangic]);
      assert.deepEqual(s.canli.parcalar, []);
    }
    // Okuma uçları aynı veriyi veren okumaların yetkisini ister: yalnız oturumlu kişi 403, oturumsuz 401. Planı okuyup çalışmayı okuyamayan
    // taban ve canlıyı görür ama sayfanın kimliği ona çevrilmez; farkı göremez (çalışma okuması).
    for (const yol of ['canli-farki', 'taban-ve-canli']) {
      assert.equal((await istek(oturumlu, 'GET', `/plan/planlama-calismasi/${yol}`)).statusCode, 403, yol);
      assert.equal((await app.inject({ method: 'GET', url: `/api/plan/planlama-calismasi/${yol}` })).statusCode, 401, yol);
    }
    const okurRol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('test_plan_oku', 'test_plan_oku') RETURNING id");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'plan.oku')", [okurRol!.id]);
    await kisiEkle('planokur', okurRol!.id);
    const planOkur = await girisCerezi('planokur');
    const yalniz = await tamam<TabanVeCanliCevabi>(planOkur, 'GET', '/plan/planlama-calismasi/taban-ve-canli');
    assert.deepEqual(yalniz.isler.filter((x) => x.isEmriId === i1).map((x) => [x.k, x.anahtar]), [[null, a1]]);
    assert.equal((await istek(planOkur, 'GET', '/plan/planlama-calismasi/canli-farki')).statusCode, 403);
    // Çalışmayı okuyup planı okuyamayan kişi farkı göremez.
    const calismaRol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('test_calisma_oku', 'test_calisma_oku') RETURNING id");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'plan.planlama-oku')", [calismaRol!.id]);
    await kisiEkle('calismaokur', calismaRol!.id);
    const farkRed = await istek(await girisCerezi('calismaokur'), 'GET', '/plan/planlama-calismasi/canli-farki');
    assert.equal(farkRed.statusCode, 403, farkRed.body);
  });
  test('CA-11: çalışmanın ek vardiyası taslağa geçer; taslağın yeri ve kilidi çalışmaya yazılır (yetki, iki sürüm); geri al önceki sürüme döner, arada yazma varsa 409', async () => {
    const e = await emirAc([yeniAdim(), yeniAdim()]);
    const [i1, i2] = e.isEmriIdleri as [number, number];
    const [a1, a2] = await anahtarlar([i1, i2]);
    const bugun = tesisGunu(Date.now());
    const saat = (an: number) => (an - tesisGunBasi(bugun)) / 3_600_000;
    const vardiya = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Deneme ek', '16:00', '20:00') RETURNING id"))!.id;
    const kayitSurumu = async () => (await vt().tx((db) => db.tek<{ surum: number }>('SELECT surum FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI])))?.surum ?? null;
    const kayitDegeri = async () => (await vt().tx((db) => db.tek<{ deger: unknown }>('SELECT deger FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI])))!.deger;
    const calismaYaz = async (ops: Record<string, Record<string, unknown>> | null) => {
      const calisma = {
        surum: 2, rrSavedAt: null, dataVer: 1, down: [], locks: {}, gercek: {}, kapali: [], olaylar: [],
        ekMesai: [{ m: String(makineA), gun: 1, vardiya: String(vardiya) }, { m: 'X1', gun: 1, vardiya: 'V3' }],
        plan: ops === null ? null : { ops, dataVer: 1, zaman: Date.now() },
        w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
        D: { meta: { ad: 'Deneme', baslangic: bugun }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [],
          personel: [], siparisler: [], ayarlar: {} },
      };
      return (await tamam<{ kayit: { surum: number } }>(c.yonetici, 'POST', '/plan/planlama-kayitlari/yaz',
        { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, beklenenSurum: await kayitSurumu() })).kayit.surum;
    };
    await calismaYaz(null);
    const planlamaci = (await kimlikCozucu(vt())({ headers: { cookie: c.planlama } } as never))!;
    const kimlik = await vt().tx(async (db) => calismaPlani({ ...(await planlamaGirdisi(db, planlamaci)).girdi!, bugun })!.kimlik);
    const k = (a: string) => Object.entries(kimlik).find(([, x]) => x === a)![0];
    const [k1, k2] = [k(a1!), k(a2!)];
    const bas = saat(Date.now() + 2 * 3_600_000);
    const ops = { [k1]: { S: bas, C: bas + 1, m: String(makineA), Su: bas - 0.5, lot1: bas + 0.5 }, [k2]: { S: bas + 1, C: bas + 2, m: String(makineA) } };
    let surum = await calismaYaz(ops);

    // 507 2 a: çalışmanın ek vardiyası taslağa; sunucuda karşılığı olmayan tezgâh ve vardiya atlanır.
    const y = await tamam<CalismaTaslagiCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/taslak-yaz', { ad: 'Deneme ek mesai', calismaSurumu: surum });
    assert.deepEqual(y.ekMesai, { yazilan: 1, atlanan: 1 });
    const p = await tamam<PlanCevabi>(c.planlama, 'GET', `/plan?taslak=${String(y.taslak.id)}`);
    assert.deepEqual(p.ekMesai!.satirlar, [{ makineId: makineA, gun: tesisGunu(tesisGunBasi(bugun) + 36 * 3_600_000), vardiyaId: vardiya, saat: 4 }]);

    // Taslakta i2 ileri taşınır, i1 kilitlenir.
    const ileri = new Date(Date.now() + 30 * 3_600_000).toISOString();
    const t1 = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(i2)}/tasi`, { taslak: { id: p.taslak!.id, surum: p.taslak!.surum }, kaynak: { tur: 'makine', id: makineA }, baslangic: ileri });
    const t2 = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(i1)}/kilitle`, { taslak: { id: t1.taslak!.id, surum: t1.taslak!.surum } });
    const yer = (id: number) => t2.yerlesimler.find((x) => x.isEmriId === id)!;
    const govde = (taslakSurumu: number, calismaSurumu: number) => ({ taslakId: t2.taslak!.id, taslakSurumu, calismaSurumu });
    const yol = '/plan/planlama-calismasi/taslaktan-yaz';

    // Yetki: recete-rota.yaz yoksa 403, yalnız recete-rota.yaz da yetmez (plan.yaz); eski taslak ve eski çalışma sürümü 409; reddedilen
    // yazma kaydı değiştirmez.
    const cerezler: Record<string, string> = {};
    for (const ad of ['ekyalnizplan', 'ekyalnizrr']) {
      const r = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${ad}`]);
      await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [r!.id, ad === 'ekyalnizplan' ? 'plan.yaz' : 'recete-rota.yaz']);
      await kisiEkle(ad, r!.id);
      cerezler[ad] = await girisCerezi(ad);
      const red = await istek(cerezler[ad], 'POST', yol, govde(t2.taslak!.surum, surum));
      assert.equal(red.statusCode, 403, `${ad}: ${red.body}`);
    }
    assert.equal((await istek(c.planlama, 'POST', yol, govde(t2.taslak!.surum - 1, surum))).statusCode, 409, 'eski taslak');
    assert.equal((await istek(c.planlama, 'POST', yol, govde(t2.taslak!.surum, surum - 1))).statusCode, 409, 'eski çalışma');
    assert.equal(await kayitSurumu(), surum);

    const w = await tamam<TaslaktanCalismayaCevabi>(c.planlama, 'POST', yol, govde(t2.taslak!.surum, surum));
    assert.deepEqual([w.oncekiSurum, w.yazilan, w.kilitli], [surum, 2, 1]);
    assert.ok(!w.atlanan.includes(a1!) && !w.atlanan.includes(a2!));
    const d = await kayitDegeri() as { plan: { ops: Record<string, { S: number; C: number; m: string; Su?: number }>; dataVer: unknown }; locks: Record<string, unknown> };
    const eksende = (an: string) => saat(Date.parse(an));
    for (const [kk, id] of [[k1, i1], [k2, i2]] as const) {
      assert.equal(d.plan.ops[kk]!.m, String(makineA));
      assert.ok(Math.abs(d.plan.ops[kk]!.S - eksende(yer(id).baslangic)) < 1 / 60, `${kk} başlangıcı taslaktan`);
      assert.ok(Math.abs(d.plan.ops[kk]!.C - eksende(yer(id).bitis)) < 1 / 60, `${kk} bitişi taslaktan`);
    }
    assert.ok(Math.abs(d.plan.ops[k1]!.Su! - (d.plan.ops[k1]!.S - 0.5)) < 1e-9, 'ayar başlangıcı aynı kayar');
    assert.deepEqual(d.locks, { [k1]: { m: String(makineA), S: d.plan.ops[k1]!.S } }, 'yalnız kilitli iş kilitlenir');
    assert.equal(d.plan.dataVer, null, 'plan güncel değil; sayfa yeniden çözer');
    const denetim = await ortam!.sahip.sorgu<{ ek: unknown }>("SELECT govde -> '_ek' AS ek FROM denetim_kaydi WHERE yol = $1 ORDER BY id", [yol]);
    assert.equal(denetim.length, 1, 'yalnız başarılı yazma denetime girer');

    // Geri al: önceki sürüm geri gelir; eski sürümle 409; yetkisiz 403; geri alma da yazmadır (ikinci geri alma ileri döner).
    const geri = '/plan/planlama-calismasi/geri-al';
    assert.equal((await istek(c.planlama, 'POST', geri, { calismaSurumu: surum })).statusCode, 409, 'arada yazma oldu');
    for (const ad of ['ekyalnizplan', 'ekyalnizrr']) assert.equal((await istek(cerezler[ad]!, 'POST', geri, { calismaSurumu: w.calismaSurumu })).statusCode, 403, ad);
    const g = await tamam<CalismaGeriAlCevabi>(c.planlama, 'POST', geri, { calismaSurumu: w.calismaSurumu });
    assert.equal(g.donulenSurum, surum);
    const eskiDeger = await kayitDegeri() as { plan: { ops: Record<string, { S: number }>; dataVer: unknown }; locks: Record<string, unknown> };
    assert.deepEqual([eskiDeger.plan.ops[k1]!.S, eskiDeger.plan.dataVer, eskiDeger.locks], [bas, 1, {}]);
    surum = g.calismaSurumu;
    const ileriDon = await tamam<CalismaGeriAlCevabi>(c.planlama, 'POST', geri, { calismaSurumu: surum });
    assert.equal(ileriDon.donulenSurum, w.calismaSurumu);
    assert.equal((await kayitDegeri() as { plan: { dataVer: unknown } }).plan.dataVer, null);
  });

  test('CA-12 (898 a): canlıya alma, canlı planın malzeme eksiğini aynı işlemde satın almaya yazar; taslağa yazmak yazmaz', async () => {
    const ham = await kartAc('hammadde');
    const e = await emirAc([yeniAdim({ bilesenler: [{ malzemeId: ham, miktar: 2, fireYuzde: 0 }] })]);
    const [i] = e.isEmriIdleri as [number];
    const satir = () => ortam!.sahip.tek<{ miktar: string; stokBilinmiyor: boolean; emirler: string[] }>(
      'SELECT miktar::text AS miktar, stok_bilinmiyor AS "stokBilinmiyor", emirler FROM satin_alma_plan_ihtiyaci WHERE malzeme_no = $1', [ham]);
    const taslaga = await kuyrukYaz([i], false);
    assert.equal(taslaga.statusCode, 200, taslaga.body);
    assert.equal(await satir(), null, 'taslak canlı plan değildir');
    const canliya = await kuyrukYaz([i], true);
    assert.equal(canliya.statusCode, 200, canliya.body);
    const s = await satir();
    assert.ok(s !== null, 'canlıya alınan emrin hammaddesi satın almada');
    assert.deepEqual([Number(s.miktar), s.stokBilinmiyor, s.emirler], [20, true, [(await emirOp(i)).emirNo]]);
  });
});

