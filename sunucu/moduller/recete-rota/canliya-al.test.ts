import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { BedelAyari, CanliYerlesimCevabi, KuyrukYazCevabi, PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { AdimGirdisi, KomutCevabi, RevizyonAyrintisi, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { canliOzeti } from '../plan/disari.ts';
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

  test('CA-2 (#1424, kullanıcı kararı): fason iş emri planda kapasite tüketmez; sonraki iç adım fason termini kadar bekler, öneride de kuyruk yazımında da', async () => {
    const TERMIN = 2;
    const e = await emirAc([yeniAdim(), fasonAdim(TERMIN), yeniAdim()]);
    const [i1, fason, i3] = e.isEmriIdleri as [number, number, number];
    const adimlar = await emirdekiAdimlar(e.uretimEmriId);
    assert.deepEqual(adimlar.map((a) => [a.opNo, a.fasonFirmaId === null ? 'ic' : 'fason']), [[10, 'ic'], [20, 'fason'], [30, 'ic']]);
    const [aFason, aIc] = [await anahtarlar([fason]), await anahtarlar([i1, i3])];
    assert.equal((await vt().tx((db) => canliOzeti(db))).planlanacak.some((a) => aFason.includes(a)), false, 'fason adım planlanacak listesinde yok');

    // Öneri: fason termini iki iç adımın arasına takvim günü olarak girer.
    const oner = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: null });
    const y = (id: number) => oner.yerlesimler.find((x) => x.isEmriId === id);
    assert.equal(y(fason), undefined, 'fason iş emri öneride yerleşmez');
    assert.ok(y(i1) && y(i3));
    const bekleme = Date.parse(y(i3)!.baslangic) - Date.parse(y(i1)!.bitis);
    assert.ok(bekleme >= TERMIN * GUN_MS && bekleme < (TERMIN + 1) * GUN_MS, `fason termini kadar bekler (ölçülen ${bekleme} ms)`);

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
    assert.ok(Date.parse(c3.baslangic) - Date.parse(c1.bitis) >= TERMIN * GUN_MS, 'kuyruk yazımı fason terminini bekler');
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
});

