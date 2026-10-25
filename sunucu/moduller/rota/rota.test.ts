import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir } from '#cekirdek/zamanlayici.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { OPERASYON_GRUP_ADLARI } from '#paylasilan/sozlesme/istasyonlar.ts';
import type {
  AdimGirdisi, AgacCevabi, GerceklesenKabulCevabi, KomutCevabi, SurelerCevabi, KullanimCevabi, RevizyonAyrintisi, RotaListesiCevabi, SablonCevabi, SablonlarCevabi, SeceneklerCevabi, TalimatlarCevabi, UrunRevizyonlariCevabi,
} from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { adimliEmirAyrintisi, emirAyar, emirBaslat, emirBitir, emirBittiDinle, emirlerinMalzemeIhtiyaci, emirSayim, kararliSayimiSonuclandir, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { adimBilesenleri, adimEtkinSureleri, adimEtkinSureleriToplu, emirBittiYansit, revizyonGetir, revizyonlar, urunAgaci, yururluktekiRevizyon } from './disari.ts';
import { isler } from './isler.ts';

const PAROLA = 'dogru-parola-1';

interface Rol { id: number; ad: string }
type Cerez = string;

describe('rotalar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  const c: Record<'yonetici' | 'kartOnaycisi' | 'planlama' | 'mudur' | 'kalite' | 'cam' | 'operator', Cerez> = {
    yonetici: '', kartOnaycisi: '', planlama: '', mudur: '', kalite: '', cam: '', operator: '',
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
  const kartZorunlulari = (tur: string, sira: number): Record<string, unknown> => ({
    hammadde: { grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 + sira } },
    mamul: { g: { ad: `Deneme mamul ${sira}` } },
    yarimamul: { g: { ad: `Deneme yarimamul ${sira}`, tip: 'Talaşlı işlenmiş parça' } },
    ticari_mal: { g: { ad: `Deneme ticari_mal ${sira}` } },
    hizmet: { g: { kat: 'fason', yon: 'Alınan', cesit: 'Talaşlı imalat' } },
  } as Record<string, Record<string, unknown>>)[tur] ?? {};
  async function kartAc(tur: 'mamul' | 'yarimamul' | 'hammadde' | 'ticari_mal' | 'hizmet', durum: 'aktif' | 'taslak' = 'aktif', ops: { no: number; kod: string; ad: string }[] = []): Promise<number> {
    const kimlik = `rt${++sayac}`;
    // Kart, malzeme sihirbazının zorunlu alanlarıyla açılır (malzemeler B11): hammaddede aile, kalite ve kart başına ayrı ölçü.
    const zorunlu = kartZorunlulari(tur, sayac);
    const kod = `${{ hammadde: 'HM', mamul: 'MM', yarimamul: 'YM', ticari_mal: 'TM', hizmet: 'HZ' }[tur]}-RTA-00001`;
    const govde = (d: string, surum: number | null) => ({
      kayit: { id: kimlik, tur, fam: 'metal', com: { kod, ad: `Deneme ${tur} ${sayac}`, birim: 'adet' }, ...(ops.length > 0 ? { ops } : {}), onay: { durum: d }, ...zorunlu },
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
    terminGun: a.terminGun, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, firePayiYuzde: Number(a.firePayiYuzde), makineKullanimi: a.makineKullanimi,
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
    ortam = await testVeritabaniKur('rotalar');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ROTA.DENEME', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    c.yonetici = await girisCerezi('yonetici');
    // Rol x işlem satırları teslimle girmez (şartname): önerilen dağılım test veritabanına burada yazılır (UYGULA.md'deki öneri göçüyle aynı).
    await ortam.vt.tx((db) => db.sorgu(
      `INSERT INTO rol_islemi (rol_id, islem)
       SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem FROM (VALUES
         ('planlama_proje', 'rota.yaz'), ('planlama_proje', 'rota.talimat-yaz'), ('planlama_proje', 'rota.emre-kopyala'),
         ('mudur', 'rota.onayla'), ('cam', 'rota.talimat-yaz')) AS m (kod, islem)
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
    const kullanicilar = [['planlama', 'Planlama ve Proje'], ['mudur', 'Müdür'], ['kalite', 'Kalite'], ['cam', 'CAM'], ['operator', 'Operatör']] as const;
    for (const [ad, rolAdi] of kullanicilar) {
      await kisiEkle(ad, rol(rolAdi));
      c[ad] = await girisCerezi(ad);
    }
    tipler = (await tamam<SeceneklerCevabi>(c.operator, 'GET', '/rota/secenekler')).operasyonTipleri;
    assert.ok(tipler.length > 0 && tipler.every((t) => t.grupAdi === OPERASYON_GRUP_ADLARI[t.grup]), 'tip listesi grubu ve grup adıyla gelir (#544)');
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-IM', ad: 'Deneme merkez', aciklama: null });
    istasyonA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-A', ad: 'Deneme A', isMerkeziId: merkez.id })).id;
    istasyonB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-B', ad: 'Deneme B', isMerkeziId: merkez.id })).id;
    makineA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MA', ad: 'Deneme makine A', istasyonId: istasyonA })).id;
    makineB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MB', ad: 'Deneme makine B', istasyonId: istasyonB })).id;
    operatorId = (await vt().tx((db) => db.tek<{ id: number }>("SELECT id FROM kisi WHERE ad = 'Deneme operator'")))!.id;
    ortakHammadde = await hammaddeAc();
  });

  after(async () => { await ortam?.kaldir(); });

  test('RT-22: okuma oturumla açılır; taslak açma ve kaydet yalnız rota.yaz ile (operatör, kalite, CAM reddedilir)', async () => {
    const urun = await mamulAc();
    assert.equal((await istek(c.operator, 'GET', '/rota/urunler')).statusCode, 200);
    for (const cerez of [c.operator, c.kalite, c.cam]) assert.equal((await taslakAc(urun, { tur: 'bos' }, cerez)).statusCode, 403);
    const ac = await taslakAc(urun);
    assert.equal(ac.statusCode, 200, ac.body);
    const { id } = ac.json<KomutCevabi>();
    assert.equal((await kaydet(id, 1, [yeniAdim()], c.cam)).statusCode, 403);
    assert.equal((await kaydet(id, 1, [yeniAdim()])).statusCode, 200);
    assert.equal((await istek(c.operator, 'GET', `/rota/revizyonlar/${id}`)).statusCode, 200);
    const liste = await tamam<RotaListesiCevabi>(c.operator, 'GET', '/rota/urunler');
    assert.equal(liste.rotalar.find((r) => r.urun.id === urun)?.acik?.harf, 'A');
  });

  test('#1372: ilk adımında giren olmayan rota kaydedilir ama onaya gitmez', async () => {
    const urun = await mamulAc();
    const { id } = (await taslakAc(urun)).json<KomutCevabi>();
    const k = await kaydet(id, 1, [yeniAdim({ bilesenler: [] }), yeniAdim({ bilesenler: [] })]);
    assert.equal(k.statusCode, 200, k.body);
    const g = await komut(id, 'onaya-gonder', { surum: k.json<KomutCevabi>().surum }, c.planlama);
    assert.equal(g.statusCode, 422);
    assert.equal(g.json<{ mesaj: string }>().mesaj, 'OP 10: giren (hammadde ya da yarı mamul) seçilmeli.');
  });

  test('RT-07, RT-31, RT-48: standart taslak on bir adımdır, OP 10..110, tezgahsız, süresiz, yeniden ayar açık', async () => {
    const urun = await mamulAc();
    const ac = await taslakAc(urun, { tur: 'standart' });
    assert.equal(ac.statusCode, 200, ac.body);
    const a = await ayrinti(ac.json<KomutCevabi>().id);
    assert.deepEqual(a.adimlar.map((x) => x.opNo), [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]);
    assert.deepEqual(a.adimlar.map((x) => x.ad), [
      'Depo girişi', 'Tornalama', 'Muayene', 'Frezeleme', 'Muayene', 'Tesviye', 'Muayene', 'Markalama', 'Özel proses', 'Son muayene', 'Sevk',
    ]);
    assert.deepEqual(a.adimlar.map((x) => x.operasyonTipi.id).slice(0, 3), [tip('GKK'), tip('TRN'), tip('BM')]);
    assert.equal(a.adimlar.every((x) => x.kaynak === null && x.ayarSuresiDk === null && x.birimSureDk === null && x.yenidenAyar), true);
    assert.equal(a.adimlar.at(-1)?.akis.cikti.tur, 'urun');
    assert.equal(a.adimlar[0]?.akis.cikti.tur, 'ara-hal');
  });

  test('#464: standart rota tipi kimlikle bulur; katalogda kod değişse de taslak açılır', async () => {
    const trn = tip('TRN');
    await vt().tx((db) => db.sorgu("UPDATE istasyonlar_operasyon_tipi SET kod = 'TRN-YENI' WHERE id = $1", [trn]));
    try {
      const ac = await taslakAc(await mamulAc(), { tur: 'standart' });
      assert.equal(ac.statusCode, 200, ac.body);
      assert.equal((await ayrinti(ac.json<KomutCevabi>().id)).adimlar[1]?.operasyonTipi.id, trn);
    } finally {
      await vt().tx((db) => db.sorgu("UPDATE istasyonlar_operasyon_tipi SET kod = 'TRN' WHERE id = $1", [trn]));
    }
  });

  test('#698: standart rota varsayılan şablondur; şablon eklenir, düzenlenir, varsayılan yapılır, ondan taslak açılır; yazma rota.yaz ister', async () => {
    const ilk = (await tamam<SablonlarCevabi>(c.operator, 'GET', '/rota/sablonlar')).sablonlar;
    const standart = ilk.find((x) => x.varsayilan);
    assert.equal(standart?.ad, 'Standart rota');
    assert.equal(standart?.adimlar.length, 11);
    assert.equal((await istek(c.kalite, 'POST', '/rota/sablonlar/ekle', { ad: 'Yetkisiz', adimlar: [] })).statusCode, 403);

    const yeni = (await tamam<SablonCevabi>(c.planlama, 'POST', '/rota/sablonlar/ekle', { ad: 'Kısa rota', adimlar: [{ operasyonTipiId: tip('TRN'), ad: 'Torna' }] })).sablon;
    assert.deepEqual([yeni.varsayilan, yeni.adimlar.map((a) => [a.sira, a.operasyonTipi.id, a.ad])], [false, [[1, tip('TRN'), 'Torna']]]);
    assert.equal((await istek(c.planlama, 'POST', '/rota/sablonlar/ekle', { ad: 'Kısa rota', adimlar: [] })).statusCode, 409);

    const kayit = await tamam<SablonCevabi>(c.planlama, 'POST', `/rota/sablonlar/${yeni.id}/kaydet`, {
      ad: 'Kısa rota', surum: yeni.surum, adimlar: [{ operasyonTipiId: tip('TRN'), ad: 'Torna' }, { operasyonTipiId: tip('BM'), ad: 'Muayene' }],
    });
    assert.equal(kayit.sablon.adimlar.length, 2);
    assert.equal((await istek(c.planlama, 'POST', `/rota/sablonlar/${yeni.id}/kaydet`, { ad: 'Kısa rota', surum: yeni.surum, adimlar: [] })).statusCode, 409);

    const urun = await mamulAc();
    const ac = await taslakAc(urun, { tur: 'sablon', sablonId: yeni.id });
    assert.equal(ac.statusCode, 200, ac.body);
    assert.deepEqual((await ayrinti(ac.json<KomutCevabi>().id)).adimlar.map((x) => [x.opNo, x.ad]), [[10, 'Torna'], [20, 'Muayene']]);

    // Varsayılan değişince "standart" yeni varsayılandan açar; eski varsayılan silinebilir olur, varsayılan silinmez.
    await tamam<SablonCevabi>(c.planlama, 'POST', `/rota/sablonlar/${yeni.id}/varsayilan-yap`, { surum: kayit.sablon.surum });
    const ikinci = await taslakAc(await mamulAc(), { tur: 'standart' });
    assert.equal((await ayrinti(ikinci.json<KomutCevabi>().id)).adimlar.length, 2);
    const simdi = (await tamam<SablonlarCevabi>(c.planlama, 'GET', '/rota/sablonlar')).sablonlar;
    const yeniVarsayilan = simdi.find((x) => x.id === yeni.id)!;
    assert.equal((await istek(c.planlama, 'POST', `/rota/sablonlar/${yeni.id}/sil`, { surum: yeniVarsayilan.surum })).statusCode, 422);
    const eski = simdi.find((x) => x.id === standart!.id)!;
    assert.equal(eski.varsayilan, false);
    // Eski varsayılanı geri getir: sonraki testler standart rotayı on bir adım bekler.
    await tamam<SablonCevabi>(c.planlama, 'POST', `/rota/sablonlar/${eski.id}/varsayilan-yap`, { surum: eski.surum });
    const son = (await tamam<SablonlarCevabi>(c.planlama, 'GET', '/rota/sablonlar')).sablonlar.find((x) => x.id === yeni.id)!;
    const sil = await tamam<SablonlarCevabi>(c.planlama, 'POST', `/rota/sablonlar/${yeni.id}/sil`, { surum: son.surum });
    assert.equal(sil.sablonlar.some((x) => x.id === yeni.id), false);
    // Şablondan açılmış taslak şablon silinince değişmez.
    assert.equal((await ayrinti(ac.json<KomutCevabi>().id)).adimlar.length, 2);
  });

  test('#688: karttaki operasyonlar ilk taslağa aktarılır; kod tipe eşlenir, eşleşmeyen varsayılan tiple kalır; rotası olan üründe ve operasyonsuz kartta reddedilir', async () => {
    const urun = await kartAc('yarimamul', 'aktif', [{ no: 20, kod: 'BM', ad: 'Muayene' }, { no: 10, kod: 'trn', ad: 'Torna' }, { no: 30, kod: 'YOK', ad: 'Boya' }]);
    const once = await tamam<UrunRevizyonlariCevabi>(c.planlama, 'GET', `/rota/urunler/${urun}`);
    assert.deepEqual(once.kartOperasyonlari, { sayi: 3, eslesmeyen: ['Boya'] });
    const ac = await taslakAc(urun, { tur: 'kart' });
    assert.equal(ac.statusCode, 200, ac.body);
    const a = await ayrinti(ac.json<KomutCevabi>().id);
    assert.deepEqual(a.adimlar.map((x) => [x.opNo, x.ad, x.operasyonTipi.id]), [[10, 'Torna', tip('TRN')], [20, 'Muayene', tip('BM')], [30, 'Boya', a.adimlar[2]?.operasyonTipi.id]]);
    assert.equal(a.adimlar[2]?.operasyonTipi.aktif, true);
    assert.equal(a.adimlar.every((x) => x.kaynak === null && x.ayarSuresiDk === null), true);
    // Rotası olan üründe kart önerisi gelmez ve karttan ikinci kez açılmaz.
    assert.equal((await tamam<UrunRevizyonlariCevabi>(c.planlama, 'GET', `/rota/urunler/${urun}`)).kartOperasyonlari, null);
    assert.equal((await komut(ac.json<KomutCevabi>().id, 'iptal', { surum: 1 }, c.planlama)).statusCode, 200);
    assert.equal((await taslakAc(urun, { tur: 'kart' })).statusCode, 409);
    const bos = await mamulAc();
    assert.equal((await tamam<UrunRevizyonlariCevabi>(c.planlama, 'GET', `/rota/urunler/${bos}`)).kartOperasyonlari, null);
    assert.equal((await taslakAc(bos, { tur: 'kart' })).statusCode, 422);
  });

  test('#688: onaylanan kartın ilk taslağı iş taramasıyla kendiliğinden açılır; açanı kartı onaya gönderendir (520 2 b); rotası olan kart yeniden açılmaz', async () => {
    const urun = await kartAc('mamul', 'aktif', [{ no: 10, kod: 'TRN', ad: 'Torna' }]);
    const taslakta = await kartAc('mamul', 'taslak', [{ no: 10, kod: 'TRN', ad: 'Torna' }]);
    const operasyonsuz = await mamulAc();
    const revizyonlar = (id: number) => vt().tx((db) => db.sorgu<{ id: number; durum: string; acan: number; gonderen: number; onaylayan: number }>(
      `SELECT r.id, r.durum, r.acan_kisi_id AS acan, COALESCE(k.gonderen_kisi_id, k.acan_kisi_id) AS gonderen, k.onaylayan_kisi_id AS onaylayan
         FROM rota_revizyonu r JOIN malzeme_katalog_karti k ON k.no = r.malzeme_id WHERE r.malzeme_id = $1`, [id]));
    assert.equal(await isiBirKezCalistir(vt(), isler[0]!), 'tamam');
    const [ilk, ...fazla] = await revizyonlar(urun);
    assert.equal(fazla.length, 0);
    assert.equal(ilk?.durum, 'taslak');
    assert.equal(ilk?.acan, ilk?.gonderen);
    assert.notEqual(ilk?.acan, ilk?.onaylayan);
    assert.deepEqual((await ayrinti(ilk!.id)).adimlar.map((x) => [x.opNo, x.ad, x.operasyonTipi.id]), [[10, 'Torna', tip('TRN')]]);
    assert.equal((await revizyonlar(taslakta)).length, 0);
    assert.equal((await revizyonlar(operasyonsuz)).length, 0);
    // Taslak iptal edilse de iş onu yeniden açmaz: kart yalnız ilk rotayı besler.
    assert.equal((await komut(ilk!.id, 'iptal', { surum: 1 }, c.planlama)).statusCode, 200);
    await isiBirKezCalistir(vt(), isler[0]!);
    assert.equal((await revizyonlar(urun)).length, 1);
  });

  test('#688: Reçete ve Rota açılırken karttan taslaklar taramayı beklemeden açılır; ikinci çağrı açmaz; rota.yaz yoksa 403', async () => {
    const urun = await kartAc('mamul', 'aktif', [{ no: 10, kod: 'TRN', ad: 'Torna' }]);
    assert.equal((await istek(c.operator, 'POST', '/rota/karttan-taslaklar')).statusCode, 403);
    const ilk = await istek(c.planlama, 'POST', '/rota/karttan-taslaklar');
    assert.equal(ilk.statusCode, 200);
    assert.ok(ilk.json<{ acilan: number }>().acilan >= 1);
    const revizyon = await vt().tx((db) => db.sorgu<{ durum: string }>('SELECT durum FROM rota_revizyonu WHERE malzeme_id = $1', [urun]));
    assert.deepEqual(revizyon.map((r) => r.durum), ['taslak']);
    assert.deepEqual((await istek(c.planlama, 'POST', '/rota/karttan-taslaklar')).json(), { acilan: 0 });
  });

  test('RT-02: açık revizyon varken ikinci taslak açılamaz (409); RT-57 dışı kart ve mamul olmayan karta rota açılamaz', async () => {
    const urun = await mamulAc();
    assert.equal((await taslakAc(urun)).statusCode, 200);
    assert.equal((await taslakAc(urun)).statusCode, 409);
    const hammadde = await hammaddeAc();
    const red = await taslakAc(hammadde);
    assert.equal(red.statusCode, 422);
    assert.match(red.json<{ mesaj: string }>().mesaj, /mamul/);
  });

  test('RT-20, RT-30, RT-31, RT-32: kaydet sürümü artırır; yeni ve çoğaltılan adım numarayı sistemden alır; bilinmeyen numara ve eski sürüm reddedilir; silinen numara yeniden verilmez', async () => {
    const urun = await mamulAc();
    const { id } = (await taslakAc(urun)).json<KomutCevabi>();
    const ilk = await kaydet(id, 1, [yeniAdim({ ad: 'Bir' }), yeniAdim({ ad: 'İki' }), yeniAdim({ ad: 'Üç' })]);
    assert.equal(ilk.json<KomutCevabi>().surum, 2);
    let a = await ayrinti(id);
    assert.deepEqual(a.adimlar.map((x) => x.opNo), [10, 20, 30]);
    const eski = await kaydet(id, 1, a.adimlar.map(govdeye));
    assert.equal(eski.statusCode, 409);
    // Eski sürüm çekirdeğin ortak iletisiyle döner; ortak istemci yenileme akışını bununla tanır (B12).
    assert.equal(eski.json<{ ayrinti?: { neden?: string } }>().ayrinti?.neden, 'eski-surum');
    assert.equal((await kaydet(id, 2, [yeniAdim({ opNo: 70 })])).statusCode, 400);
    // Adım tipi istasyonlar kataloğuna bağlıdır (RG1 a): katalogda olmayan tip taslakta da veritabanınca reddedilir.
    await assert.rejects(
      vt().sorgu('UPDATE rota_adimi SET operasyon_tipi_id = 2147483647 WHERE revizyon_id = $1', [id]),
      /rota_adimi_operasyon_tipi_bagi/,
    );
    // OP 30 silinir, OP 10 çoğaltılır, yeni bir adım eklenir: 30 yeniden verilmez, yeni numaralar 40 ve 50 olur.
    const [bir, iki] = a.adimlar;
    if (!bir || !iki) throw new Error('adım yok');
    const ikinci = await kaydet(id, 2, [govdeye(bir), { ...govdeye(bir), opNo: null }, govdeye(iki), yeniAdim({ ad: 'Dört' })]);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    a = await ayrinti(id);
    assert.deepEqual(a.adimlar.map((x) => [x.opNo, x.ad]), [[10, 'Bir'], [40, 'Bir'], [20, 'İki'], [50, 'Dört']]);
    const ucuncu = await kaydet(id, 3, [...a.adimlar.map(govdeye), yeniAdim()]);
    assert.equal(ucuncu.statusCode, 200);
    assert.deepEqual((await ayrinti(id)).adimlar.map((x) => x.opNo), [10, 40, 20, 50, 60]);
  });

  test('RT-33, RT-34, RT-47: ilk adım bekleyen kaydedilir; devir adedi olmadan akışlı ve tek makinede en küçük parça reddedilir', async () => {
    const urun = await mamulAc();
    const { id } = (await taslakAc(urun)).json<KomutCevabi>();
    assert.equal((await kaydet(id, 1, [yeniAdim(), yeniAdim({ bagimlilik: 'akisli' })])).statusCode, 400);
    assert.equal((await kaydet(id, 1, [yeniAdim({ enKucukParca: 4 })])).statusCode, 400);
    const k = await kaydet(id, 1, [yeniAdim({ bagimlilik: 'akisli', devirAdedi: 5 }), yeniAdim({ bagimlilik: 'akisli', devirAdedi: 5 })]);
    assert.equal(k.statusCode, 200, k.body);
    const a = await ayrinti(id);
    assert.deepEqual(a.adimlar.map((x) => [x.bagimlilik, x.devirAdedi]), [['bekleyen', null], ['akisli', 5]]);
    assert.deepEqual(a.adimlar[1]?.akis.tuketir, [10]);
  });

  test('RT-37, RT-39: bilinmeyen operasyon tipi ve adımın kendi makinesini aday yazmak reddedilir; aday makine ve kişi kaydedilir', async () => {
    const urun = await mamulAc();
    const { id } = (await taslakAc(urun)).json<KomutCevabi>();
    assert.equal((await kaydet(id, 1, [yeniAdim({ operasyonTipiId: 2147483000 })])).statusCode, 400);
    assert.equal((await kaydet(id, 1, [yeniAdim({ adaylar: [{ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: null, birimSureDk: null }] })])).statusCode, 400);
    const k = await kaydet(id, 1, [yeniAdim({ adaylar: [
      { kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: null, birimSureDk: 1.5 }, { kaynak: { tur: 'kisi', id: operatorId }, ayarSuresiDk: 10, birimSureDk: 3 },
    ] })]);
    assert.equal(k.statusCode, 200, k.body);
    assert.deepEqual((await ayrinti(id)).adimlar[0]?.adaylar.map((x) => [x.kaynak.tur, x.kaynak.kod ?? x.kaynak.ad, x.kaynak.istasyon?.kod ?? null, x.birimSureDk]),
      [['makine', 'RT-MB', 'RT-B', '1.5000'], ['kisi', 'Deneme operator', null, '3.0000']]);
  });

  test('RT-08, RT-09, RT-38: adımsız ve süresiz revizyon onaya gitmez; pasif makine kaydedilmez, sonradan pasifleşen makineyle onaya gitmez; kaynağı atanmamış adımla gider', async () => {
    const urun = await mamulAc();
    const { id } = (await taslakAc(urun)).json<KomutCevabi>();
    assert.equal((await komut(id, 'onaya-gonder', { surum: 1 }, c.planlama)).statusCode, 422);
    await kaydet(id, 1, [yeniAdim({ birimSureDk: null })]);
    assert.equal((await komut(id, 'onaya-gonder', { surum: 2 }, c.planlama)).statusCode, 422);
    const gecici = await tamam<{ id: number; surum: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MP', ad: 'Deneme pasiflenecek', istasyonId: istasyonA });
    assert.equal((await kaydet(id, 2, [yeniAdim({ kaynak: { tur: 'makine', id: 999_999 } })])).statusCode, 400);
    assert.equal((await kaydet(id, 2, [yeniAdim({ kaynak: { tur: 'makine', id: gecici.id } })])).statusCode, 200);
    await tamam(c.yonetici, 'POST', `/makineler/${gecici.id}/guncelle`, { kod: 'RT-MP', ad: 'Deneme pasiflenecek', istasyonId: istasyonA, aktif: false, surum: gecici.surum });
    const red = await komut(id, 'onaya-gonder', { surum: 3 }, c.planlama);
    assert.equal(red.statusCode, 422);
    assert.match(red.json<{ mesaj: string }>().mesaj, /makine ya da kişi/);
    await kaydet(id, 3, [yeniAdim({ kaynak: null })]);
    const g = await komut(id, 'onaya-gonder', { surum: 4 }, c.planlama);
    assert.equal(g.statusCode, 200, g.body);
    assert.equal(g.json<KomutCevabi>().durum, 'onay_bekliyor');
  });

  test('RT-04, RT-19, RT-13: onay bekleyen revizyon kaydedilemez ve içeriği SQL ile de yazılamaz; geri gönderilince yeniden taslak olur', async () => {
    const urun = await mamulAc();
    const { id } = (await taslakAc(urun)).json<KomutCevabi>();
    await kaydet(id, 1, [yeniAdim()]);
    const g = await komut(id, 'onaya-gonder', { surum: 2 }, c.planlama);
    assert.equal((await kaydet(id, 3, [yeniAdim()])).statusCode, 409);
    await assert.rejects(vt().sorgu('DELETE FROM rota_adimi WHERE revizyon_id = $1', [id]), /rota_icerik_kilitli|yalnız taslakta/);
    assert.equal((await komut(id, 'geri-gonder', { surum: g.json<KomutCevabi>().surum }, c.planlama)).statusCode, 403);
    const geri = await komut(id, 'geri-gonder', { surum: g.json<KomutCevabi>().surum }, c.mudur);
    assert.equal(geri.statusCode, 200, geri.body);
    assert.equal(geri.json<KomutCevabi>().durum, 'taslak');
    assert.equal((await kaydet(id, geri.json<KomutCevabi>().surum, [yeniAdim()])).statusCode, 200);
  });

  test('ana sayfa revizyon özeti ürün listesinden sayılanla aynıdır; okuma oturumla açılır', async () => {
    const taslak = (await taslakAc(await mamulAc())).json<KomutCevabi>();
    await kaydet(taslak.id, 1, [yeniAdim()]);
    const onayda = (await taslakAc(await mamulAc())).json<KomutCevabi>();
    await kaydet(onayda.id, 1, [yeniAdim()]);
    assert.equal((await komut(onayda.id, 'onaya-gonder', { surum: 2 }, c.planlama)).statusCode, 200);
    await yururlugeAlinmisRota(await mamulAc(), [yeniAdim()]);
    const liste = (await tamam<RotaListesiCevabi>(c.operator, 'GET', '/rota/urunler')).rotalar;
    const beklenen = { acikRevizyon: liste.filter((r) => r.acik !== null).length, onayBekleyen: liste.filter((r) => r.acik?.durum === 'onay_bekliyor').length };
    assert.ok(beklenen.acikRevizyon >= 2 && beklenen.onayBekleyen >= 1 && liste.some((r) => r.acik === null));
    assert.deepEqual(await tamam(c.operator, 'GET', '/rota/revizyon-ozeti'), beklenen);
    assert.equal((await app.inject({ method: 'GET', url: '/api/rota/revizyon-ozeti' })).statusCode, 401);
  });

  test('RT-18, RT-22, RT-17: kalite onaylayamaz; ayar açıkken gönderen yönetici onaylayamaz, müdür onaylar; varsayılan kapalıyken gönderen kendisi onaylar ve dört gözsüz işaretlenir', async () => {
    await tamam(c.yonetici, 'POST', '/ayarlar/rota.dort-goz/degistir', { deger: true });
    try {
      const urun = await mamulAc();
      const { id } = (await tamam<KomutCevabi>(c.yonetici, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak: { tur: 'bos' } }));
      await kaydet(id, 1, [yeniAdim()], c.yonetici);
      const g = await komut(id, 'onaya-gonder', { surum: 2 }, c.yonetici);
      const surum = g.json<KomutCevabi>().surum;
      assert.equal((await komut(id, 'onayla', { surum, yururlugeAl: false }, c.kalite)).statusCode, 403);
      const red = await komut(id, 'onayla', { surum, yururlugeAl: false }, c.yonetici);
      assert.equal(red.statusCode, 403);
      assert.match(red.json<{ mesaj: string }>().mesaj, /onaylayamazsın/);
      assert.deepEqual((await ayrinti(id, c.yonetici)).komutlar, ['geri-gonder', 'kopyala']);
      const o = await komut(id, 'onayla', { surum, yururlugeAl: false }, c.mudur);
      assert.equal(o.statusCode, 200, o.body);
      const a = await ayrinti(id);
      assert.equal(a.revizyon.onaylayan?.ad, 'Deneme mudur');
      assert.equal(a.revizyon.gonderen?.ad, 'Deneme Yönetici');
      assert.deepEqual(a.revizyon.duzenleyenler.map((d) => d.ad), ['Deneme Yönetici']);
      assert.equal(a.revizyon.dortGozsuzOnay, false);
    } finally {
      await tamam(c.yonetici, 'POST', '/ayarlar/rota.dort-goz/degistir', { deger: false });
    }

    // Kullanıcı kararı: ayar varsayılan kapalı; gönderen kendisi onaylar, kayıt dört gözsüz işaretlenir.
    const urun2 = await mamulAc();
    const t = await tamam<KomutCevabi>(c.yonetici, 'POST', `/rota/urunler/${urun2}/taslak-ac`, { kaynak: { tur: 'bos' } });
    await kaydet(t.id, 1, [yeniAdim()], c.yonetici);
    const g2 = await komut(t.id, 'onaya-gonder', { surum: 2 }, c.yonetici);
    const o2 = await komut(t.id, 'onayla', { surum: g2.json<KomutCevabi>().surum, yururlugeAl: false }, c.yonetici);
    assert.equal(o2.statusCode, 200, o2.body);
    assert.equal((await ayrinti(t.id)).revizyon.dortGozsuzOnay, true);

    // Veritabanı kısıtı da korur: düzenleyen kişiyi onaylayan yazan güncelleme reddedilir.
    const urun3 = await mamulAc();
    const t3 = await tamam<KomutCevabi>(c.yonetici, 'POST', `/rota/urunler/${urun3}/taslak-ac`, { kaynak: { tur: 'bos' } });
    await kaydet(t3.id, 1, [yeniAdim()], c.yonetici);
    await komut(t3.id, 'onaya-gonder', { surum: 2 }, c.planlama);
    await assert.rejects(
      vt().sorgu("UPDATE rota_revizyonu SET durum = 'onayli', onaylayan_kisi_id = $2, onaylama = now() WHERE id = $1", [t3.id, yoneticiId]),
      /düzenleyen|rota_revizyonu_dort_goz/,
    );
  });

  test('RT-10, RT-11, RT-12, RT-01: yalnız onaylanan yürürlüğü değiştirmez; yürürlüğe alınınca önceki onaylıya döner; tek yürürlükte', async () => {
    const urun = await mamulAc();
    const a = await yururlugeAlinmisRota(urun, [yeniAdim()]);
    const b = (await taslakAc(urun, { tur: 'revizyon', revizyonId: a })).json<KomutCevabi>().id;
    const k = await kaydet(b, 1, [yeniAdim(), yeniAdim()]);
    const g = await komut(b, 'onaya-gonder', { surum: k.json<KomutCevabi>().surum }, c.planlama);
    const o = await komut(b, 'onayla', { surum: g.json<KomutCevabi>().surum, yururlugeAl: false }, c.mudur);
    assert.equal(o.json<KomutCevabi>().durum, 'onayli');
    let revizyonlar = (await tamam<UrunRevizyonlariCevabi>(c.planlama, 'GET', `/rota/urunler/${urun}`)).revizyonlar;
    assert.deepEqual(revizyonlar.map((r) => [r.harf, r.durum]), [['A', 'yururlukte'], ['B', 'onayli']]);
    assert.equal((await komut(b, 'yururluge-al', { surum: o.json<KomutCevabi>().surum }, c.planlama)).statusCode, 403);
    const y = await komut(b, 'yururluge-al', { surum: o.json<KomutCevabi>().surum }, c.mudur);
    assert.equal(y.statusCode, 200, y.body);
    revizyonlar = (await tamam<UrunRevizyonlariCevabi>(c.planlama, 'GET', `/rota/urunler/${urun}`)).revizyonlar;
    assert.deepEqual(revizyonlar.map((r) => [r.harf, r.durum]), [['A', 'onayli'], ['B', 'yururlukte']]);
    // Geri geçiş kopya açmaz.
    const ra = await ayrinti(a);
    assert.equal((await komut(a, 'yururluge-al', { surum: ra.revizyon.surum }, c.mudur)).statusCode, 200);
    revizyonlar = (await tamam<UrunRevizyonlariCevabi>(c.planlama, 'GET', `/rota/urunler/${urun}`)).revizyonlar;
    assert.deepEqual(revizyonlar.map((r) => [r.harf, r.durum]), [['A', 'yururlukte'], ['B', 'onayli']]);
    await assert.rejects(vt().sorgu("UPDATE rota_revizyonu SET durum = 'yururlukte' WHERE id = $1", [b]), /rota_revizyonu_tek_yururlukte|yururluge_alinmis|duplicate|benzersiz/);
  });

  test('RT-14, RT-03, RT-15: taslak iptal olur, silinmez; iptal harfi yeniden verilmez; iptal revizyon değişmez', async () => {
    const urun = await mamulAc();
    const { id } = (await taslakAc(urun)).json<KomutCevabi>();
    await kaydet(id, 1, [yeniAdim()]);
    const i = await komut(id, 'iptal', { surum: 2 }, c.planlama);
    assert.equal(i.json<KomutCevabi>().durum, 'iptal');
    assert.equal((await ayrinti(id)).revizyon.iptalEden?.ad, 'Deneme planlama');
    const yeni = (await taslakAc(urun)).json<KomutCevabi>().id;
    assert.equal((await ayrinti(yeni)).revizyon.harf, 'B');
    await assert.rejects(vt().sorgu('DELETE FROM rota_revizyonu WHERE id = $1', [id]), /silinmez/);
    await assert.rejects(vt().sorgu("UPDATE rota_revizyonu SET durum = 'taslak', iptal_eden_kisi_id = NULL, iptal_etme = NULL WHERE id = $1", [id]), /İptal edilen/);
    await assert.rejects(vt().sorgu('DELETE FROM rota_op_numarasi WHERE malzeme_id = $1', [urun]), /yalnız ekleme/);
    // Kaydetmede kalkan adımın numarası da iptal taslakta kalan numara da yeniden verilmez.
    await kaydet(yeni, 1, [yeniAdim()]);
    assert.deepEqual((await ayrinti(yeni)).adimlar.map((x) => x.opNo), [20]);
  });

  test('RT-05, RT-06: yürürlükteki revizyondan açılan taslak içeriği kopyalar, numaraları korur; kaynak değişmez', async () => {
    const urun = await mamulAc();
    const a = await yururlugeAlinmisRota(urun, [yeniAdim({ ad: 'Bir' }), yeniAdim({ ad: 'İki' })]);
    const b = (await taslakAc(urun, { tur: 'revizyon', revizyonId: a })).json<KomutCevabi>().id;
    const kopya = await ayrinti(b);
    assert.deepEqual(kopya.adimlar.map((x) => [x.opNo, x.ad]), [[10, 'Bir'], [20, 'İki']]);
    assert.equal(kopya.revizyon.kaynak?.harf, 'A');
    await kaydet(b, 1, [govdeye(kopya.adimlar[1] as RevizyonAyrintisi['adimlar'][number])]);
    assert.deepEqual((await ayrinti(a)).adimlar.map((x) => x.opNo), [10, 20]);
    assert.equal((await kaydet(a, 1, [yeniAdim()])).statusCode, 409);
  });

  test('RT-16: revizyon başka mamule kopyalanır; hedefte kullanılmış numara yeni numara alır; hedefte açık revizyon varsa 409', async () => {
    const kaynak = await mamulAc();
    const hedef = await mamulAc();
    const a = await yururlugeAlinmisRota(kaynak, [yeniAdim({ ad: 'Bir' }), yeniAdim({ ad: 'İki' })]);
    const h = (await taslakAc(hedef)).json<KomutCevabi>().id;
    await kaydet(h, 1, [yeniAdim({ ad: 'Hedef' })]);
    assert.equal((await komut(a, 'kopyala', { hedefUrunId: hedef }, c.planlama)).statusCode, 409);
    await komut(h, 'iptal', { surum: 2 }, c.planlama);
    const k = await komut(a, 'kopyala', { hedefUrunId: hedef }, c.planlama);
    assert.equal(k.statusCode, 200, k.body);
    const kopya = await ayrinti(k.json<KomutCevabi>().id);
    assert.equal(kopya.urun.id, hedef);
    assert.deepEqual(kopya.adimlar.map((x) => [x.opNo, x.ad]), [[30, 'Bir'], [20, 'İki']]);
  });

  test('ticari mal ve hizmet reçetede girdi olmaz: kaydet reddeder; eski taslakta kalmışsa onaya gidemez', async () => {
    const urun = await mamulAc();
    const tm = await kartAc('ticari_mal');
    const hz = await kartAc('hizmet');
    const { id } = (await taslakAc(urun)).json<KomutCevabi>();
    for (const m of [tm, hz]) {
      const r = await kaydet(id, 1, [yeniAdim({ bilesenler: [{ malzemeId: m, miktar: 1, fireYuzde: 0 }] })]);
      assert.equal(r.statusCode, 400, r.body);
      assert.match(r.body, /reçetede girdi olmaz/);
    }
    // Kural gelmeden yazılmış taslak: satır doğrudan eklenir, onay denetimi yakalar.
    assert.equal((await kaydet(id, 1, [yeniAdim()])).statusCode, 200);
    await vt().tx((db) => db.sorgu('INSERT INTO rota_bileseni (adim_id, malzeme_id, miktar) SELECT id, $2, 1 FROM rota_adimi WHERE revizyon_id = $1', [id, tm]));
    const onay = await komut(id, 'onaya-gonder', { surum: 2 }, c.planlama);
    assert.equal(onay.statusCode, 422, onay.body);
    assert.match(onay.json<{ mesaj: string }>().mesaj, /reçetede girdi olmaz/);
  });

  test('RT-52, RT-55, RT-56, RT-57: bileşen kullanımdaki kart olmalı; ürün kendisini alamaz; alt mamulün yürürlükte rotası yoksa ya da döngü varsa onaya gidemez', async () => {
    const ust = await mamulAc();
    const alt = await mamulAc();
    const hm = await hammaddeAc();
    const taslakKart = { id: await kartAc('mamul', 'taslak') };
    const { id } = (await taslakAc(ust)).json<KomutCevabi>();
    assert.equal((await kaydet(id, 1, [yeniAdim({ bilesenler: [{ malzemeId: taslakKart.id, miktar: 1, fireYuzde: 0 }] })])).statusCode, 400);
    assert.equal((await kaydet(id, 1, [yeniAdim({ bilesenler: [{ malzemeId: ust, miktar: 1, fireYuzde: 0 }] })])).statusCode, 400);
    const k = await kaydet(id, 1, [yeniAdim({ bilesenler: [{ malzemeId: alt, miktar: 2, fireYuzde: 0 }, { malzemeId: hm, miktar: 1, fireYuzde: 5 }] })]);
    assert.equal(k.statusCode, 200, k.body);
    const rotasiz = await komut(id, 'onaya-gonder', { surum: 2 }, c.planlama);
    assert.equal(rotasiz.statusCode, 422);
    assert.match(rotasiz.json<{ mesaj: string }>().mesaj, /yürürlükte rotası yok/);
    // Alt mamulün rotası üst mamulü bileşen alırsa döngü olur: önce alt, sonra üst onaylanmak istenir.
    await yururlugeAlinmisRota(alt, [yeniAdim()]);
    const g = await komut(id, 'onaya-gonder', { surum: 2 }, c.planlama);
    assert.equal(g.statusCode, 200, g.body);
    await komut(id, 'onayla', { surum: g.json<KomutCevabi>().surum, yururlugeAl: true }, c.mudur);
    const altB = (await taslakAc(alt)).json<KomutCevabi>().id;
    await kaydet(altB, 1, [yeniAdim({ bilesenler: [{ malzemeId: ust, miktar: 1, fireYuzde: 0 }] })]);
    const dongu = await komut(altB, 'onaya-gonder', { surum: 2 }, c.planlama);
    assert.equal(dongu.statusCode, 422);
    assert.match(dongu.json<{ mesaj: string }>().mesaj, /döngüsü/);
  });

  test('RT-58: ağaç üstten aşağı toplam ihtiyacı fire paylarıyla döner; alt mamul kendi rotasıyla açılır', async () => {
    const ust = await mamulAc();
    const alt = await mamulAc();
    const hm = await hammaddeAc();
    await yururlugeAlinmisRota(alt, [yeniAdim({ bilesenler: [{ malzemeId: hm, miktar: 0.5, fireYuzde: 0 }] })]);
    const id = await yururlugeAlinmisRota(ust, [yeniAdim({ firePayiYuzde: 20, bilesenler: [{ malzemeId: alt, miktar: 2, fireYuzde: 10 }, { malzemeId: hm, miktar: 3, fireYuzde: 0 }] })]);
    const ayrinti8 = await tamam<RevizyonAyrintisi>(c.operator, 'GET', `/rota/revizyonlar/${id}?miktar=8`);
    assert.equal(ayrinti8.miktar, '8');
    assert.equal(ayrinti8.adimlar[0]?.adimMiktari, '10');
    assert.deepEqual(ayrinti8.adimlar[0]?.bilesenler.map((b) => b.toplamMiktar), ['22', '30']);
    assert.equal(ayrinti8.ozet.toplamTeorikSureDk, '50');
    const agac = await tamam<AgacCevabi>(c.operator, 'GET', `/rota/revizyonlar/${id}/agac?miktar=8`);
    assert.deepEqual(agac.dugumler.map((d) => [d.derinlik, d.ust, d.malzeme.id, d.toplamMiktar]), [
      [1, null, alt, '22'], [2, 0, hm, '11'], [1, null, hm, '30'],
    ]);
    assert.deepEqual(agac.toplamlar.map((t) => [t.malzeme.id, t.miktar]), [[hm, '41']]);
    assert.equal(agac.dugumler[0]?.revizyon?.harf, 'A');
    const disaridan = await vt().tx((db) => urunAgaci(db, ust, 8));
    assert.deepEqual(disaridan?.toplamlar, agac.toplamlar);
    // Malzemeler bölümü: hammadde iki rotada (alt ve üst) bileşendir.
    const kul = await tamam<KullanimCevabi>(c.operator, 'GET', `/rota/malzeme-kullanimi?malzemeIdleri=${hm},${alt}`);
    assert.deepEqual(kul.kullanimlar.filter((k) => k.malzemeId === hm).map((k) => [k.urun.id, k.revizyon.harf, k.rol]).sort(), [[alt, 'A', 'bilesen'], [ust, 'A', 'bilesen']].sort());
    assert.deepEqual(kul.kullanimlar.filter((k) => k.malzemeId === alt).map((k) => k.urun.id), [ust]);
    assert.equal((await istek(c.operator, 'GET', '/rota/malzeme-kullanimi?malzemeIdleri=abc')).statusCode, 400);
  });

  test('RT-60, RT-61, RT-62, RT-63: CAM talimat yazar; sürüm artar, eski kalır; revizyon değişmez; adımı olmayan numaraya ve eski sürümle yazı reddedilir', async () => {
    const urun = await mamulAc();
    const id = await yururlugeAlinmisRota(urun, [yeniAdim()]);
    const once = await ayrinti(id);
    const yaz = (cerez: Cerez, opNo: number, metin: string, okunanSurum: number | null) =>
      istek(cerez, 'POST', `/rota/urunler/${urun}/talimat-yaz`, { opNo, metin, okunanSurum });
    assert.equal((await yaz(c.operator, 10, 'Deneme talimat', null)).statusCode, 403);
    assert.equal((await yaz(c.kalite, 10, 'Deneme talimat', null)).statusCode, 403);
    const bir = await yaz(c.cam, 10, 'Birinci talimat', null);
    assert.equal(bir.statusCode, 200, bir.body);
    const eskiTalimat = await yaz(c.planlama, 10, 'Eski sürümden', null);
    assert.equal(eskiTalimat.statusCode, 409);
    assert.equal(eskiTalimat.json<{ ayrinti?: { neden?: string } }>().ayrinti?.neden, 'eski-surum');
    const iki = await yaz(c.planlama, 10, 'İkinci talimat', 1);
    assert.deepEqual(iki.json<TalimatlarCevabi>().surumler.map((s) => [s.surum, s.metin, s.yazan.ad]), [
      [2, 'İkinci talimat', 'Deneme planlama'], [1, 'Birinci talimat', 'Deneme cam'],
    ]);
    assert.equal((await yaz(c.cam, 90, 'Olmayan adım', null)).statusCode, 400);
    const sonra = await ayrinti(id);
    assert.equal(sonra.revizyon.surum, once.revizyon.surum);
    assert.deepEqual(sonra.adimlar[0]?.talimat, { surum: 2, metin: 'İkinci talimat' });
    await assert.rejects(vt().sorgu('UPDATE rota_talimati SET metin = $1 WHERE malzeme_id = $2', ['x', urun]), /yalnız ekleme/);
  });

  test('RT-54, RT-64: disari yürürlükteki revizyonu, adım bileşenlerini ve emre sabitlenecek talimat sürümünü verir', async () => {
    const urun = await mamulAc();
    const hm = await hammaddeAc();
    const id = await yururlugeAlinmisRota(urun, [yeniAdim({ bilesenler: [{ malzemeId: hm, miktar: 1.25, fireYuzde: 3 }] }), yeniAdim({ kaynak: null })]);
    await tamam(c.cam, 'POST', `/rota/urunler/${urun}/talimat-yaz`, { opNo: 20, metin: 'Deneme', okunanSurum: null });
    const r = await vt().tx((db) => yururluktekiRevizyon(db, urun));
    assert.equal(r?.id, id);
    assert.deepEqual(r?.adimlar.map((a) => [a.opNo, a.kaynak === null, a.talimatSurumu]), [[10, false, null], [20, true, 1]]);
    assert.deepEqual(await vt().tx((db) => adimBilesenleri(db, id, 10)), [{ malzemeId: hm, miktar: '1.2500', fireYuzde: '3.00' }]);
    assert.equal(await vt().tx((db) => revizyonGetir(db, 2147483000)), null);
    assert.equal(await vt().tx((db) => yururluktekiRevizyon(db, hm)), null);
  });
  // Plan her emrin rota revizyonunu ayrı okuyordu; toplu okuma aynı sonucu sabit sayıda sorguyla verir.
  test('RT-54b: revizyonlar toplu okur; her revizyon revizyonGetir ile aynıdır, olmayan kimlik haritada yoktur; sorgu sayısı revizyon sayısıyla artmaz', async () => {
    const urun = await mamulAc();
    const urun2 = await mamulAc();
    const hm = await hammaddeAc();
    const a = await yururlugeAlinmisRota(urun, [yeniAdim({ bilesenler: [{ malzemeId: hm, miktar: 1.25, fireYuzde: 3 }] }), yeniAdim({ kaynak: null })]);
    await tamam(c.cam, 'POST', `/rota/urunler/${urun}/talimat-yaz`, { opNo: 20, metin: 'Deneme', okunanSurum: null });
    const b = await yururlugeAlinmisRota(urun2, [yeniAdim(), yeniAdim(), yeniAdim()]);
    const yok = 2147483000;
    const sorguSay = async <T,>(f: (db: Parameters<Parameters<ReturnType<typeof vt>['tx']>[0]>[0]) => Promise<T>): Promise<[T, number]> => vt().tx(async (db) => {
      let n = 0;
      const sayan = new Proxy(db, { get: (h, ad, al) => { const d = Reflect.get(h, ad, al) as unknown; if (typeof d !== 'function') return d; return (...x: unknown[]) => { if (ad === 'sorgu' || ad === 'tek') n += 1; return (d as (...y: unknown[]) => unknown).apply(h, x); }; } });
      const sonuc = await f(sayan);
      return [sonuc, n];
    });
    const [harita, toplu] = await sorguSay((db) => revizyonlar(db, [a, b, yok, a]));
    assert.deepEqual([...harita.keys()].sort((x, y) => x - y), [a, b].sort((x, y) => x - y));
    assert.deepEqual(harita.get(a), await vt().tx((db) => revizyonGetir(db, a)));
    assert.deepEqual(harita.get(b), await vt().tx((db) => revizyonGetir(db, b)));
    assert.deepEqual(harita.get(a)?.adimlar.map((x) => x.talimatSurumu), [null, 1]);
    const [, tekli] = await sorguSay((db) => revizyonlar(db, [a]));
    assert.equal(toplu, tekli);
    assert.deepEqual(await vt().tx((db) => revizyonlar(db, [])), new Map());
  });

  test('F1-F3, F6, FS3 b: fason firma her operasyon tipinde adımın kaynağı olur; süresiz, termin günüyle onaya gider ve dakika toplamına girmez', async () => {
    const firma = async (ad: string, fason: boolean) =>
      (await tamam<{ firma: { id: number; surum: number } }>(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad, tur: 'tedarikci', fason })).firma;
    const fasoncu = await firma(`Deneme fasoncu ${++sayac}`, true);
    const fasonsuz = await firma(`Deneme tedarikci ${++sayac}`, false);
    // Seçici yalnız kullanımdaki, fason işaretli firmaları sunar.
    const fasonlar = (await tamam<SeceneklerCevabi>(c.planlama, 'GET', '/rota/secenekler')).fasonFirmalar.map((f) => f.id);
    assert.equal(fasonlar.includes(fasoncu.id), true);
    assert.equal(fasonlar.includes(fasonsuz.id), false);
    // KD-021: finansın arama sınırını fason olmayan firmalar doldursa da fason firma listede kalır.
    for (let i = 0; i < 55; i += 1) await firma(`Deneme aa tedarikci ${++sayac}`, false);
    const sondaki = await firma(`Deneme zz fasoncu ${++sayac}`, true);
    assert.equal((await tamam<SeceneklerCevabi>(c.planlama, 'GET', '/rota/secenekler')).fasonFirmalar.some((f) => f.id === sondaki.id), true);
    const urun = await mamulAc();
    const { id } = (await taslakAc(urun)).json<KomutCevabi>();
    const fasonAdim = (p: Partial<AdimGirdisi> = {}) =>
      yeniAdim({ ad: 'Kaplama', kaynak: { tur: 'fason', id: fasoncu.id }, ayarSuresiDk: null, birimSureDk: null, terminGun: 7, ...p });
    // Firma fason işaretli değilse ya da yoksa kaydedilmez; fason adımda süre, fasonsuz adımda termin reddedilir.
    for (const kaynak of [{ tur: 'fason' as const, id: fasonsuz.id }, { tur: 'fason' as const, id: 2_147_483_000 }]) {
      const red = await kaydet(id, 1, [yeniAdim(), fasonAdim({ kaynak })]);
      assert.equal(red.statusCode, 400, red.body);
      assert.equal(red.json<{ alan: string }>().alan, 'adimlar.1.kaynak');
    }
    assert.equal((await kaydet(id, 1, [yeniAdim(), fasonAdim({ birimSureDk: 2 })])).json<{ alan: string }>().alan, 'adimlar.1.ayarSuresiDk');
    assert.equal((await kaydet(id, 1, [yeniAdim({ terminGun: 7 }), fasonAdim()])).json<{ alan: string }>().alan, 'adimlar.0.terminGun');
    // RT-69: fason adımda aday makine ya da kişi ve paralel bölme kaydedilmez.
    const rt69: [Partial<AdimGirdisi>, string][] = [
      [{ adaylar: [{ kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: null, birimSureDk: null }] }, 'adimlar.1.adaylar'],
      [{ makineKullanimi: 'paralel', enKucukParca: 2 }, 'adimlar.1.makineKullanimi'],
    ];
    for (const [ek, alan] of rt69) {
      const red = await kaydet(id, 1, [yeniAdim(), fasonAdim(ek)]);
      assert.equal(red.statusCode, 400, red.body);
      assert.equal(red.json<{ alan: string }>().alan, alan);
    }
    assert.equal((await kaydet(id, 1, [yeniAdim(), fasonAdim({ terminGun: null })])).statusCode, 200);
    assert.equal((await kaydet(id, 2, [yeniAdim(), fasonAdim()])).statusCode, 200);
    const a = await ayrinti(id);
    assert.deepEqual(a.adimlar.map((x) => [x.kaynak?.tur, x.terminGun, x.teorikSureDk]), [['makine', null, '32'], ['fason', 7, null]]);
    assert.equal(a.adimlar[1]?.kaynak?.ad.startsWith('Deneme fasoncu'), true);
    assert.equal(a.adimlar[1]?.kaynak?.istasyon, null);
    assert.deepEqual([a.ozet.toplamTeorikSureDk, a.ozet.enUzunAdimOpNo, a.ozet.fasonTerminGunu], ['32', a.adimlar[0]?.opNo, 7]);
    // Ekran gövdeyi ayrıntıdan kurar: fason kaynak ve termin gidip gelir.
    assert.equal((await kaydet(id, 3, a.adimlar.map(govdeye))).statusCode, 200);
    // Veritabanı da kuralı tutar: fason adıma süre yazılamaz.
    await assert.rejects(vt().tx((db) => db.sorgu('UPDATE rota_adimi SET birim_sure_dk = 1 WHERE revizyon_id = $1 AND fason_firma_id IS NOT NULL', [id])),
      /rota_adimi_fason_suresiz/);
    const g = await komut(id, 'onaya-gonder', { surum: 4 }, c.planlama);
    assert.equal(g.statusCode, 200, g.body);
    const o = await komut(id, 'onayla', { surum: g.json<KomutCevabi>().surum, yururlugeAl: true }, c.mudur);
    assert.equal(o.statusCode, 200, o.body);
    // Başka modüllere: fason adımın makine ya da kişi kaynağı yoktur; firma ve termin ayrı alandadır.
    const r = await vt().tx((db) => revizyonGetir(db, id));
    assert.deepEqual(r?.adimlar.map((x) => [x.kaynak?.tur ?? null, x.fason]), [['makine', null], [null, { firmaId: fasoncu.id, terminGun: 7 }]]);
    // Taslak yürürlükteki revizyondan açılınca fason adım olduğu gibi kopyalanır.
    const b = (await taslakAc(urun, { tur: 'revizyon', revizyonId: id })).json<KomutCevabi>().id;
    assert.deepEqual((await ayrinti(b)).adimlar.map((x) => [x.kaynak?.tur, x.terminGun]), [['makine', null], ['fason', 7]]);
    // Termin isteğe bağlıdır: termini boş fason adımlı rota onaya gider; termin toplamı uydurulmaz (null).
    // Yeni kart açılmaz (malzeme aramasının sınırını kaydırır): yürürlükteki revizyondan açılan taslak kullanılır.
    const bk = await kaydet(b, 1, [yeniAdim(), fasonAdim({ terminGun: null })]);
    assert.equal(bk.statusCode, 200, bk.body);
    const bg = await komut(b, 'onaya-gonder', { surum: bk.json<KomutCevabi>().surum }, c.planlama);
    assert.equal(bg.statusCode, 200, bg.body);
    const ba = await ayrinti(b);
    assert.deepEqual([ba.adimlar[1]?.terminGun, ba.ozet.fasonTerminGunu], [null, null]);
  });

  test('RT-65: yeni kayıt açan komutlar (taslak aç, kopyala) istek kimliği ister; aynı kimlikle yinelenen istek ikinci kayıt açmaz', async () => {
    const urun = await mamulAc();
    const yol = `/rota/urunler/${urun}/taslak-ac`;
    assert.equal((await istek(c.planlama, 'POST', yol, { kaynak: { tur: 'bos' } }, null)).statusCode, 400);
    const kimlik = randomUUID();
    const bir = await istek(c.planlama, 'POST', yol, { kaynak: { tur: 'bos' } }, kimlik);
    const iki = await istek(c.planlama, 'POST', yol, { kaynak: { tur: 'bos' } }, kimlik);
    assert.equal(bir.statusCode, 200, bir.body);
    assert.deepEqual(iki.json(), bir.json());
    assert.equal((await tamam<{ revizyonlar: unknown[] }>(c.operator, 'GET', `/rota/urunler/${urun}`)).revizyonlar.length, 1);
  });
  test('RT-66, RT-68: yürürlükteki rota emre kopyalanır (her adım bir iş emri); taslak kopyalanmaz; yetkisiz rol reddedilir', async () => {
    const urun = await mamulAc();
    const id = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim({ kaynak: { tur: 'kisi', id: operatorId } })]);
    const yol = `/rota/revizyonlar/${id}/emre-kopyala`;
    assert.equal((await istek(c.operator, 'POST', yol, { projeId: denemeProjeId, adet: 5, teslim: null })).statusCode, 403);
    assert.equal((await istek(c.planlama, 'POST', yol, { projeId: denemeProjeId, adet: 5, teslim: '2026-10-30' }, null)).statusCode, 400);
    const k = await istek(c.planlama, 'POST', yol, { projeId: denemeProjeId, adet: 5, teslim: '2026-10-30' });
    assert.equal(k.statusCode, 200, k.body);
    assert.equal(k.json<{ isEmriIdleri: number[] }>().isEmriIdleri.length, 2);
    const { id: taslak } = (await taslakAc(urun)).json<KomutCevabi>();
    assert.equal((await istek(c.planlama, 'POST', `/rota/revizyonlar/${taslak}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: null })).statusCode, 422);
  });
  test('#1184: adımın ve aday kaynağın kaynağı istasyon olur; bilinmeyen ve yinelenen istasyon reddedilir; emre kopyada iş emri istasyonda atanmamış kalır', async () => {
    const urun = await mamulAc();
    const { id } = (await taslakAc(urun)).json<KomutCevabi>();
    assert.equal((await kaydet(id, 1, [yeniAdim({ kaynak: { tur: 'istasyon', id: 999_999 } })])).statusCode, 400);
    const ikiKez = { kaynak: { tur: 'istasyon' as const, id: istasyonB }, ayarSuresiDk: null, birimSureDk: null };
    assert.equal((await kaydet(id, 1, [yeniAdim({ kaynak: { tur: 'istasyon', id: istasyonA }, adaylar: [ikiKez, ikiKez] })])).statusCode, 400);
    const k = await kaydet(id, 1, [yeniAdim({ kaynak: { tur: 'istasyon', id: istasyonA }, adaylar: [ikiKez] })]);
    assert.equal(k.statusCode, 200, k.body);
    const a = (await ayrinti(id)).adimlar[0]!;
    assert.deepEqual([a.kaynak?.tur, a.kaynak?.kod, a.kaynak?.istasyon?.kod], ['istasyon', 'RT-A', 'RT-A']);
    assert.deepEqual(a.adaylar.map((x) => [x.kaynak.tur, x.kaynak.kod]), [['istasyon', 'RT-B']]);
    // Kısıt SQL ile de geçerli: adımda en çok bir kaynak, adayda tam bir kaynak.
    await assert.rejects(vt().tx((db) => db.sorgu('UPDATE rota_adimi SET makine_id = $2 WHERE revizyon_id = $1', [id, makineA])), /rota_adimi_tek_kaynak/);
    await assert.rejects(vt().tx((db) => db.sorgu(
      'UPDATE rota_aday_kaynagi SET istasyon_id = NULL WHERE adim_id IN (SELECT id FROM rota_adimi WHERE revizyon_id = $1)', [id])), /rota_aday_kaynagi_tek_kaynak/);

    const yid = await yururlugeAlinmisRota(await mamulAc(), [yeniAdim({ kaynak: { tur: 'istasyon', id: istasyonA } })]);
    const e = await istek(c.planlama, 'POST', `/rota/revizyonlar/${yid}/emre-kopyala`, { projeId: denemeProjeId, adet: 3, teslim: null });
    assert.equal(e.statusCode, 200, e.body);
    const ie = await vt().tx((db) => db.sorgu<{ istasyonId: number | null; makineId: number | null; kisiId: number | null }>(
      'SELECT istasyon_id AS "istasyonId", makine_id AS "makineId", kisi_id AS "kisiId" FROM uretim_emirleri_is_emri WHERE id = ANY($1::int[])',
      [e.json<{ isEmriIdleri: number[] }>().isEmriIdleri]));
    assert.deepEqual(ie, [{ istasyonId: istasyonA, makineId: null, kisiId: null }]);
  });

  test('emre kopyada seçilen emir türü emre yazılır; verilmezse seri, geçersiz tür reddedilir (borç R13)', async () => {
    const yid = await yururlugeAlinmisRota(await mamulAc(), [yeniAdim()]);
    const yol = `/rota/revizyonlar/${yid}/emre-kopyala`;
    const tur = async (govde: Record<string, unknown>) => {
      const e = await istek(c.planlama, 'POST', yol, { projeId: denemeProjeId, adet: 2, teslim: null, ...govde });
      assert.equal(e.statusCode, 200, e.body);
      return (await vt().tx((db) => db.tek<{ t: string }>('SELECT emir_turu AS t FROM uretim_emri WHERE id = $1', [e.json<{ uretimEmriId: number }>().uretimEmriId])))?.t;
    };
    assert.deepEqual([await tur({ emirTuru: 'numune' }), await tur({})], ['numune', 'seri']);
    assert.equal((await istek(c.planlama, 'POST', yol, { projeId: denemeProjeId, adet: 2, teslim: null, emirTuru: 'uydurma' })).statusCode, 400);
  });

  test('emre kopyada adımın girenleri iş emrinin bileşeni olur (stok sayımda adımın girdisini bunlardan sarf eder)', async () => {
    const hm = ortakHammadde;
    const yid = await yururlugeAlinmisRota(await mamulAc(), [yeniAdim({ bilesenler: [{ malzemeId: hm, miktar: 2.5, fireYuzde: 5 }] }), yeniAdim()]);
    const e = await istek(c.planlama, 'POST', `/rota/revizyonlar/${yid}/emre-kopyala`, { projeId: denemeProjeId, adet: 3, teslim: null });
    assert.equal(e.statusCode, 200, e.body);
    const [ilk, ikinci] = e.json<{ isEmriIdleri: number[] }>().isEmriIdleri;
    const b = await vt().tx((db) => db.sorgu<{ isEmriId: number; malzemeNo: number; miktar: string; fireYuzde: string }>(
      `SELECT is_emri_id AS "isEmriId", malzeme_no AS "malzemeNo", miktar::float8::text AS miktar, fire_yuzde::float8::text AS "fireYuzde"
         FROM uretim_emirleri_is_emri_bileseni WHERE is_emri_id = ANY($1::int[]) ORDER BY id`, [[ilk, ikinci]]));
    assert.deepEqual(b, [
      { isEmriId: ilk, malzemeNo: hm, miktar: '2.5', fireYuzde: '5' },
      { isEmriId: ikinci, malzemeNo: hm, miktar: '1', fireYuzde: '0' },
    ]);
  });

  test('250 a: emre kopyada adımın fire payı, paralel kullanımı, en küçük partisi, yeniden ayarı ve makine/kişi adayları iş emrine geçer; istasyon adayı geçmez; ihtiyaç adım firesiyle büyür', async () => {
    const hm = ortakHammadde;
    const adaylar = [
      { kaynak: { tur: 'makine' as const, id: makineB }, ayarSuresiDk: 20, birimSureDk: 3 },
      { kaynak: { tur: 'istasyon' as const, id: istasyonB }, ayarSuresiDk: null, birimSureDk: null },
    ];
    const yid = await yururlugeAlinmisRota(await mamulAc(), [
      yeniAdim({ firePayiYuzde: 20, makineKullanimi: 'paralel', enKucukParca: 4, yenidenAyar: false, adaylar, bilesenler: [{ malzemeId: hm, miktar: 1, fireYuzde: 0 }] }),
      yeniAdim(),
    ]);
    const e = await istek(c.planlama, 'POST', `/rota/revizyonlar/${yid}/emre-kopyala`, { projeId: denemeProjeId, adet: 8, teslim: null });
    assert.equal(e.statusCode, 200, e.body);
    const { uretimEmriId, isEmriIdleri } = e.json<{ uretimEmriId: number; isEmriIdleri: number[] }>();
    const [ilk, ikinci] = isEmriIdleri;
    const ie = await vt().tx((db) => db.sorgu<{ id: number; fire: string; kullanim: string; enKucuk: number | null; yenidenAyar: boolean }>(
      `SELECT id, fire_payi_yuzde::float8::text AS fire, makine_kullanimi AS kullanim, en_kucuk_parca AS "enKucuk", yeniden_ayar AS "yenidenAyar"
         FROM uretim_emirleri_is_emri WHERE id = ANY($1::int[]) ORDER BY sira`, [isEmriIdleri]));
    assert.deepEqual(ie, [
      { id: ilk, fire: '20', kullanim: 'paralel', enKucuk: 4, yenidenAyar: false },
      { id: ikinci, fire: '0', kullanim: 'tek', enKucuk: null, yenidenAyar: true },
    ]);
    const ad = await vt().tx((db) => db.sorgu<{ isEmriId: number; makineId: number | null; kisiId: number | null; ayar: string | null; birim: string | null }>(
      `SELECT is_emri_id AS "isEmriId", makine_id AS "makineId", kisi_id AS "kisiId", ayar_suresi_dk::float8::text AS ayar, birim_sure_dk::float8::text AS birim
         FROM uretim_emirleri_is_emri_adayi WHERE is_emri_id = ANY($1::int[]) ORDER BY id`, [isEmriIdleri]));
    assert.deepEqual(ad, [{ isEmriId: ilk, makineId: makineB, kisiId: null, ayar: '20', birim: '3' }]);
    // Emir adedi istenen sağlam çıktıdır: %20 fireli adımın girdisi 8 / 0,8 = 10 adet için, firesiz adımınki 8 adet için.
    const ihtiyac = (await vt().tx((db) => emirlerinMalzemeIhtiyaci(db, [uretimEmriId]))).get(uretimEmriId);
    assert.deepEqual(ihtiyac?.map((m) => [m.malzemeNo, m.brut]), [[hm, '10.0000'], [hm, '8.0000']]);
  });

  test('#861: emre kopyala gövdesindeki projeId üretim emrine gider; pasif ya da olmayan proje reddedilir; projeId verilmezse seri emir açılmaz (224)', async () => {
    const urun = await mamulAc();
    const id = await yururlugeAlinmisRota(urun, [yeniAdim()]);
    const yol = `/rota/revizyonlar/${id}/emre-kopyala`;
    const proje = async (kod: string, durum: string): Promise<number> => {
      const r = await vt().tx((db) => db.tek<{ id: number }>('INSERT INTO projeler_proje (kod, ad, durum, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING id', [kod, `Deneme ${kod}`, durum, yoneticiId]));
      if (!r) throw new Error('proje kurulamadı');
      return r.id;
    };
    const [aktif, iptal] = [await proje('RPRA', 'aktif'), await proje('RPRX', 'iptal')];
    const a = await istek(c.planlama, 'POST', yol, { adet: 5, teslim: null, projeId: aktif });
    assert.equal(a.statusCode, 200, a.body);
    assert.equal((await vt().tx((db) => adimliEmirAyrintisi(db, a.json<{ uretimEmriId: number }>().uretimEmriId))).projeId, aktif);
    const p = await istek(c.planlama, 'POST', yol, { adet: 5, teslim: null, projeId: iptal });
    assert.equal(p.statusCode, 400, p.body);
    assert.match(p.body, /Proje bulunamadı ya da aktif değil/);
    const bos = await istek(c.planlama, 'POST', yol, { adet: 5, teslim: null, projeId: null });
    assert.equal(bos.statusCode, 400, bos.body);
    assert.match(bos.body, /Üretim emri bir projeyle açılmalı/);
  });
  test('176 a: emre kopyala siparisSatiriId\'yi emre geçirir; satır projenin siparişinde değilse 409 ve emir açılmaz; verilmezse projenin tek satırı kendiliğinden bağlanır (224)', async () => {
    const urun = await mamulAc();
    const id = await yururlugeAlinmisRota(urun, [yeniAdim()]);
    const yol = `/rota/revizyonlar/${id}/emre-kopyala`;
    const ekle = async (sql: string, p: unknown[]): Promise<number> => {
      const r = await ortam!.sahip.tek<{ id: number }>(sql, p);
      if (!r) throw new Error('kurulamadı');
      return r.id;
    };
    sayac += 1;
    const firma = await ekle("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ($1, 'musteri', $2) RETURNING id", [`Deneme müşteri ${sayac}`, yoneticiId]);
    const siparis = await ekle(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
       VALUES ($1, 'onayli', $2, current_date, current_date + 30, 20, $3, $3, now()) RETURNING id`, [`SS-2026-${String(900 + sayac)}`, firma, yoneticiId]);
    const satir = await ekle('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 5) RETURNING id', [siparis, urun]);
    const proje = await ekle("INSERT INTO projeler_proje (kod, ad, siparis_id, olusturan_id) VALUES ($1, 'Deneme proje', $2, $3) RETURNING id", [`RSSP${sayac}`, siparis, yoneticiId]);
    const siparissiz = await ekle("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ($1, 'Deneme proje', $2) RETURNING id", [`RSSX${sayac}`, yoneticiId]);

    const a = await istek(c.planlama, 'POST', yol, { adet: 5, teslim: null, projeId: proje, siparisSatiriId: satir });
    assert.equal(a.statusCode, 200, a.body);
    const e = await vt().tx((db) => adimliEmirAyrintisi(db, a.json<{ uretimEmriId: number }>().uretimEmriId));
    assert.deepEqual([e.projeId, e.siparisSatiriId], [proje, satir]);

    const once = (await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n;
    const red = await istek(c.planlama, 'POST', yol, { adet: 5, teslim: null, projeId: siparissiz, siparisSatiriId: satir });
    assert.equal(red.statusCode, 409, red.body);
    assert.match(red.json<{ mesaj: string }>().mesaj, /siparişten açılmış bir projeye bağlı olmalı/);
    assert.equal((await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n, once);

    const bos = await istek(c.planlama, 'POST', yol, { adet: 5, teslim: null, projeId: proje });
    assert.equal(bos.statusCode, 200, bos.body);
    assert.equal((await vt().tx((db) => adimliEmirAyrintisi(db, bos.json<{ uretimEmriId: number }>().uretimEmriId))).siparisSatiriId, satir);
  });
  test('#459: yürürlükteki rota emre uygulanır; künye harfi ve yürürlüğü verir; aynı rotada 409, yetkisiz 403, istek kimliği ister', async () => {
    const urun = await mamulAc();
    const a = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim()]);
    const k = await istek(c.planlama, 'POST', `/rota/revizyonlar/${a}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: null });
    assert.equal(k.statusCode, 200, k.body);
    const emir = k.json<{ uretimEmriId: number }>().uretimEmriId;
    const kunye = async (id: number) => (await tamam<{ revizyonlar: { id: number; harf: string; malzemeId: number; yururlukteId: number | null }[] }>(
      c.operator, 'GET', `/rota/revizyon-kunyeleri?idler=${id}`)).revizyonlar;
    const ilk = await kunye(a);
    assert.deepEqual(ilk.map((r) => [r.id, r.malzemeId, r.yururlukteId]), [[a, urun, a]]);
    const yol = `/rota/emirler/${emir}/yururlukteki-rotayi-uygula`;
    assert.equal((await istek(c.planlama, 'POST', yol, {})).statusCode, 409);
    const b = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim(), yeniAdim()]);
    assert.deepEqual((await kunye(a)).map((r) => [r.harf, r.yururlukteId]), [[ilk[0]!.harf, b]]);
    assert.equal((await istek(c.operator, 'POST', yol, {})).statusCode, 403);
    assert.equal((await istek(c.planlama, 'POST', yol, {}, null)).statusCode, 400);
    const u = await istek(c.planlama, 'POST', yol, {});
    assert.equal(u.statusCode, 200, u.body);
    const cevap = u.json<{ degisenler: string[]; kaynakRevizyon: { id: number; harf: string } }>();
    assert.equal(cevap.kaynakRevizyon.id, b);
    assert.notEqual(cevap.kaynakRevizyon.harf, ilk[0]!.harf);
    assert.ok(cevap.degisenler.length > 0);
    const e = await vt().tx((db) => adimliEmirAyrintisi(db, emir));
    assert.equal(e.kaynakRotaRevizyonId, b);
    assert.equal(e.isEmirleri.length, 3);
  });
  test('#1185: emir yalnız yürürlükteki revizyondan açılır; onaylı ama yürürlükte olmayan revizyon reddedilir, yürürlükteki kabul edilir', async () => {
    const urun = await mamulAc();
    const eski = await yururlugeAlinmisRota(urun, [yeniAdim()]);
    const yeni = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim()]);
    const revizyonDurumu = async (id: number) => (await tamam<{ revizyonlar: { id: number; durum: string }[] }>(c.operator, 'GET', `/rota/urunler/${urun}`))
      .revizyonlar.find((r) => r.id === id)?.durum;
    assert.equal(await revizyonDurumu(eski), 'onayli');
    assert.equal(await revizyonDurumu(yeni), 'yururlukte');
    const red = await istek(c.planlama, 'POST', `/rota/revizyonlar/${eski}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: null });
    assert.equal(red.statusCode, 422, red.body);
    assert.match(red.body, /Yalnız yürürlükteki rota emre kopyalanır/);
    const kabul = await istek(c.planlama, 'POST', `/rota/revizyonlar/${yeni}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: null });
    assert.equal(kabul.statusCode, 200, kabul.body);
    const emir = await vt().tx((db) => adimliEmirAyrintisi(db, kabul.json<{ uretimEmriId: number }>().uretimEmriId));
    assert.equal(emir.kaynakRotaRevizyonId, yeni);
  });
  test('malzeme arama kullanımdaki kartları türe göre verir; hepsi istenince taslak kart da gelir', async () => {
    const mm = await mamulAc();
    const taslak = await kartAc('mamul', 'taslak');
    const taslakAdi = `Deneme mamul ${String(sayac)}`;
    const aktifler = await tamam<{ satirlar: { id: number; tur: string; stokBirimi: string | null }[] }>(c.operator, 'GET', '/rota/malzeme-ara?tur=mamul,yarimamul');
    assert.ok(aktifler.satirlar.some((x) => x.id === mm));
    // Birim malzemelerin özetinden gelir (B5).
    assert.equal(aktifler.satirlar.find((x) => x.id === mm)?.stokBirimi, 'adet');
    assert.equal((await tamam<{ satirlar: unknown[] }>(c.operator, 'GET', '/rota/malzeme-ara?tur=bilinmeyen')).satirlar.length, 0);
    assert.ok(!aktifler.satirlar.some((x) => x.id === taslak));
    assert.ok(aktifler.satirlar.every((x) => x.tur === 'mamul' || x.tur === 'yarimamul'));
    // Sayfa boyu sınırlıdır; taslak kart adıyla aranır (testte açılan kart sayısı sonucu değiştirmez).
    const hepsi = await tamam<{ satirlar: { id: number }[] }>(c.operator, 'GET', `/rota/malzeme-ara?hepsi=true&metin=${encodeURIComponent(taslakAdi)}`);
    assert.ok(hepsi.satirlar.some((x) => x.id === taslak));
  });

  describe('süreler (teorik ayrım ve gerçekleşen süre)', () => {
    const sureler = (rev: number, cerez = c.operator, ek = '') => tamam<SurelerCevabi>(cerez, 'GET', `/rota/revizyonlar/${rev}/sureler${ek}`);
    const yaz = (adimId: number, govde: Record<string, unknown>, cerez = c.planlama, kimlik: string | null = randomUUID()) =>
      istek(cerez, 'POST', `/rota/adimlar/${adimId}/gerceklesen-sure`, { makineId: null, okunanId: null, ...govde }, kimlik);

    test('RT-70, RT-71, RT-72: işlem ve değişim girilince birim süre toplamdır; ayrılmamış adımda işlem çevrimdir, oran hesaplanır', async () => {
      const { id } = (await taslakAc(await mamulAc())).json<KomutCevabi>();
      const k = await kaydet(id, 1, [
        yeniAdim({ birimSureDk: null, islemSuresiDk: 1.6, degisimSuresiDk: 0.4 }),
        yeniAdim({ ad: 'Eski adım', birimSureDk: 2.5 }),
        yeniAdim({ ad: 'Adaylı', adaylar: [{ kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: null, birimSureDk: null, islemSuresiDk: 3, degisimSuresiDk: 1 }] }),
      ]);
      assert.equal(k.statusCode, 200, k.body);
      const a = await ayrinti(id);
      assert.deepEqual([a.adimlar[0]?.birimSureDk, a.adimlar[0]?.islemSuresiDk, a.adimlar[0]?.degisimSuresiDk, a.adimlar[0]?.degisimOraniYuzde], ['2.0000', '1.6000', '0.4000', '25']);
      assert.deepEqual([a.adimlar[1]?.birimSureDk, a.adimlar[1]?.islemSuresiDk, a.adimlar[1]?.degisimSuresiDk, a.adimlar[1]?.degisimOraniYuzde], ['2.5000', '2.5000', null, null]);
      assert.deepEqual([a.adimlar[2]?.adaylar[0]?.birimSureDk, a.adimlar[2]?.adaylar[0]?.islemSuresiDk], ['4.0000', '3.0000']);
      // Ayrıntıdan geri kaydetmek (ekranın yaptığı) ayrımı bozmaz.
      const geri = await kaydet(id, k.json<KomutCevabi>().surum, a.adimlar.map((x) => ({
        ...govdeye(x), islemSuresiDk: x.islemSuresiDk === null ? null : Number(x.islemSuresiDk), degisimSuresiDk: x.degisimSuresiDk === null ? null : Number(x.degisimSuresiDk),
      })));
      assert.equal(geri.statusCode, 200, geri.body);
      assert.equal((await ayrinti(id)).adimlar[0]?.degisimOraniYuzde, '25');
    });

    test('RT-70: toplamla uyuşmayan birim süre ve işlemsiz değişim reddedilir; kısıt da tutar', async () => {
      const { id } = (await taslakAc(await mamulAc())).json<KomutCevabi>();
      const uyusmaz = await kaydet(id, 1, [yeniAdim({ birimSureDk: 3, islemSuresiDk: 1.6, degisimSuresiDk: 0.4 })]);
      assert.equal(uyusmaz.statusCode, 400, uyusmaz.body);
      assert.equal(uyusmaz.json<{ alan: string }>().alan, 'adimlar.0.birimSureDk');
      const islemsiz = await kaydet(id, 1, [yeniAdim({ degisimSuresiDk: 0.4 })]);
      assert.equal(islemsiz.statusCode, 400, islemsiz.body);
      assert.equal(islemsiz.json<{ alan: string }>().alan, 'adimlar.0.islemSuresiDk');
      // Veritabanı kısıtı da aynı kuralı tutar (servisi atlayan yazma): birim süre 2, işlem 1 olamaz.
      assert.equal((await kaydet(id, 1, [yeniAdim()])).statusCode, 200);
      await assert.rejects(vt().tx((db) => db.sorgu('UPDATE rota_adimi SET islem_suresi_dk = 1 WHERE revizyon_id = $1', [id])), /rota_adimi_sure_ayrimi/);
    });

    test('RT-73, RT-74, 169 c: elle ölçüm planın süresini değiştirmez, bekleyen ölçüm olur; boş giriş ölçümü boşaltır', async () => {
      const urun = await mamulAc();
      const rev = await yururlugeAlinmisRota(urun, [yeniAdim({ ayarSuresiDk: 30, birimSureDk: null, islemSuresiDk: 2, degisimSuresiDk: 0.5 })]);
      const once = await sureler(rev);
      const adim = once.adimlar[0]!;
      assert.deepEqual(adim.teorik, { hazirlikDk: '30.00', islemDk: '2.0000', degisimDk: '0.5000', degisimOraniYuzde: '25' });
      assert.deepEqual([adim.etkin.hazirlikDk, adim.etkin.birimSureDk, adim.olcum.islem], ['30', '2.5', null]);
      const g = await yaz(adim.adimId, { tur: 'islem', sureDk: 2.8 });
      assert.equal(g.statusCode, 200, g.body);
      const sonra = g.json<SurelerCevabi>().adimlar[0]!;
      assert.deepEqual([sonra.olcum.islem?.sureDk, sonra.olcum.islem?.kaynak, sonra.olcum.islem?.isEmriId, sonra.etkin.birimSureDk], ['2.8', 'elle', null, '2.5']);
      assert.equal(sonra.olcum.islem?.yazan.ad, 'Deneme planlama');
      assert.equal((await vt().tx((db) => adimEtkinSureleri(db, rev))).get(adim.opNo)?.birimSureDk, 2.5, 'plan teorik süreyle çalışır');
      // Makineye özgü ölçüm o makinenin ve makinesiz görünümde görünür; teorik değişmez.
      const m = await yaz(adim.adimId, { tur: 'hazirlik', sureDk: 40, makineId: makineA });
      assert.equal(m.statusCode, 200, m.body);
      const makinede = (await sureler(rev, c.operator, `?makineId=${makineA}`)).adimlar[0]!;
      assert.deepEqual([makinede.olcum.hazirlik?.sureDk, makinede.olcum.hazirlik?.makineId, makinede.etkin.hazirlikDk], ['40', makineA, '30']);
      assert.equal((await sureler(rev, c.operator, `?makineId=${makineB}`)).adimlar[0]?.olcum.hazirlik, null);
      const geri = await yaz(adim.adimId, { tur: 'islem', sureDk: null, okunanId: sonra.sonKayit.islem });
      assert.equal(geri.statusCode, 200, geri.body);
      assert.deepEqual([geri.json<SurelerCevabi>().adimlar[0]?.etkin.birimSureDk, geri.json<SurelerCevabi>().adimlar[0]?.olcum.islem], ['2.5', null]);
    });

    test('RT-74b: adimEtkinSureleriToplu her istek için adimEtkinSureleri ile aynıdır, sırayı korur; sorgu sayısı istek sayısıyla artmaz', async () => {
      const urun = await mamulAc();
      const urun2 = await mamulAc();
      const rev = await yururlugeAlinmisRota(urun, [yeniAdim({ ayarSuresiDk: 30, birimSureDk: 2 }), yeniAdim({ ayarSuresiDk: 10, birimSureDk: 1 })]);
      const rev2 = await yururlugeAlinmisRota(urun2, [yeniAdim({ ayarSuresiDk: 5, birimSureDk: 3 })]);
      const adim = (await sureler(rev)).adimlar[0]!;
      assert.equal((await yaz(adim.adimId, { tur: 'hazirlik', sureDk: 40, makineId: makineA })).statusCode, 200);
      const yok = 2147483000;
      const sorguSay = async <T,>(f: (db: Parameters<Parameters<ReturnType<typeof vt>['tx']>[0]>[0]) => Promise<T>): Promise<[T, number]> => vt().tx(async (db) => {
        let n = 0;
        const sayan = new Proxy(db, { get: (h, ad, al) => { const d = Reflect.get(h, ad, al) as unknown; if (typeof d !== 'function') return d; return (...x: unknown[]) => { if (ad === 'sorgu' || ad === 'tek') n += 1; return (d as (...y: unknown[]) => unknown).apply(h, x); }; } });
        const sonuc = await f(sayan);
        return [sonuc, n];
      });
      const istekler = [{ revizyonId: rev, makineId: null }, { revizyonId: rev2, makineId: null }, { revizyonId: rev, makineId: makineA }, { revizyonId: yok, makineId: null }];
      const [toplu, coklu] = await sorguSay((db) => adimEtkinSureleriToplu(db, istekler));
      assert.equal(toplu.length, istekler.length);
      for (const [i, x] of istekler.entries()) assert.deepEqual(toplu[i], await vt().tx((db) => adimEtkinSureleri(db, x.revizyonId, x.makineId)));
      assert.deepEqual([toplu[0]?.get(adim.opNo)?.ayarSuresiDk, toplu[2]?.get(adim.opNo)?.ayarSuresiDk, toplu[1]?.get(1)?.birimSureDk ?? toplu[1]?.values().next().value?.birimSureDk, toplu[3]], [30, 30, 3, new Map()]);
      const [, tekli] = await sorguSay((db) => adimEtkinSureleriToplu(db, [istekler[0]!]));
      assert.equal(coklu, tekli);
      assert.deepEqual(await vt().tx((db) => adimEtkinSureleriToplu(db, [])), []);
    });

    test('RT-73: terminal satırı iş emri bağı olmadan yazılamaz', async () => {
      const urun = await mamulAc();
      const rev = await yururlugeAlinmisRota(urun, [yeniAdim({ birimSureDk: 2 })]);
      const adim = (await sureler(rev)).adimlar[0]!;
      await assert.rejects(vt().tx((db) => db.sorgu(
        `INSERT INTO rota_gerceklesen_sure (malzeme_id, op_no, tur, sure_dk, kaynak, kisi_id) VALUES ($1, $2, 'islem', 9, 'terminal', $3)`, [urun, adim.opNo, operatorId],
      )), /rota_gerceklesen_sure_is_emri/);
      assert.equal((await sureler(rev)).adimlar[0]?.olcum.islem, null);
    });

    // Emir bitti dinleyicisini bu dosya kendisi bağlar; sunucuda bağ kablolama.ts'tedir. Aynı iş emri ikinci kez ölçüm yazmadığı için
    // iki bağ birlikte kurulu olsa da satır yinelenmez.
    describe('terminal ölçümü, kabul ve yürürlükte boşaltma (B38, 169 c)', () => {
      let birak: (() => void) | undefined;
      before(async () => {
        birak = emirBittiDinle(emirBittiYansit);
        // UE20: başlatan istasyonda yetkin olmalı; yetkinlik istasyonlar modülünündür, kurulum doğrudan yazar.
        await ortam!.sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING', [operatorId, istasyonA, istasyonB]);
      });
      after(() => { birak?.(); });
      const kabulEt = (adimId: number, govde: Record<string, unknown>, cerez = c.planlama, kimlik: string | null = randomUUID()) =>
        istek(cerez, 'POST', `/rota/adimlar/${adimId}/gerceklesen-sure/kabul`, { makineId: null, okunanId: null, ...govde }, kimlik);

      // Rotadaki adımla aynı OP numarasında makine iş emri açılır; terminal ayar, başlat ve sayım geçmiş anlarla yazılır, ilk parça
      // onayı ve bitirme şimdidir (hazırlık 20 dk, 10 sağlam 30 dk'da: net birim 3 dk). Girdi verilmez: stok başlatmayı durdurmasın.
      async function olculmusEmir(urun: number, rev: number, opNo: number, makineId: number): Promise<{ emirId: number; isEmriId: number }> {
        const simdi = Date.now();
        const an = (dk: number) => new Date(simdi + dk * 60_000).toISOString();
        return vt().tx(async (db) => {
          const planlamaci = await kullaniciYukle(db, (await db.tek<{ id: number }>("SELECT id FROM kisi WHERE ad = 'Deneme planlama'"))!.id);
          const operator = await kullaniciYukle(db, operatorId);
          const { uretimEmriId: emirId, isEmriIdleri } = await uretimEmriAc(db, planlamaci!, {
            malzemeNo: urun, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, projeId: denemeProjeId,
            isEmirleri: [{
              sira: 1, opNo, ad: 'Deneme adım', operasyonTipiId: tip('TRN'), kaynak: { tur: 'makine', id: makineId }, ayarSuresiDk: '30', birimSureDk: '2.5',
              terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
            }],
          });
          await emirAyar(db, operator!, emirId, an(-50));
          await emirBaslat(db, operator!, emirId, undefined, an(-30));
          await emirSayim(db, operator!, emirId, { tur: 'saglam', adet: 10 }, { an: an(-1) });
          await kararliSayimiSonuclandir(db, yoneticiId, emirId, 'onay');
          await emirBitir(db, operator!, emirId);
          return { emirId, isEmriId: isEmriIdleri[0]! };
        });
      }
      const ayrikAdim = () => yeniAdim({ ayarSuresiDk: 30, birimSureDk: null, islemSuresiDk: 2, degisimSuresiDk: 0.5 });

      test('RT-76: emir bitince makine iş emrinin ölçümü (net birim, değişim dahil) o makineye özgü terminal ölçümü olur; plan kullanmaz, aynı iş emri ikinci kez yazılmaz', async () => {
        const urun = await mamulAc();
        const rev = await yururlugeAlinmisRota(urun, [ayrikAdim()]);
        const adim = (await sureler(rev)).adimlar[0]!;
        const { emirId, isEmriId } = await olculmusEmir(urun, rev, adim.opNo, makineA);
        const satirlar = await vt().tx((db) => db.sorgu<{ tur: string; makineId: number | null; sureDk: string; kaynak: string; isEmriId: number; kisiId: number }>(
          `SELECT tur, makine_id AS "makineId", sure_dk AS "sureDk", kaynak, is_emri_id AS "isEmriId", kisi_id AS "kisiId"
             FROM rota_gerceklesen_sure WHERE malzeme_id = $1 ORDER BY id`, [urun],
        ));
        assert.deepEqual(satirlar.map((x) => [x.tur, x.makineId, Number(x.sureDk), x.kaynak, x.isEmriId, x.kisiId]), [
          ['hazirlik', makineA, 20, 'terminal', isEmriId, operatorId], ['islem', makineA, 3, 'terminal', isEmriId, operatorId],
        ]);
        const makinede = (await sureler(rev, c.operator, `?makineId=${makineA}`)).adimlar[0]!;
        assert.deepEqual([makinede.olcum.islem?.sureDk, makinede.olcum.islem?.kaynak, makinede.olcum.islem?.isEmriId, makinede.olcum.islem?.makineId, makinede.olcum.hazirlik?.sureDk, makinede.olcum.degisim],
          ['3', 'terminal', isEmriId, makineA, '20', null]);
        assert.equal((await sureler(rev)).adimlar[0]?.olcum.islem?.sureDk, '3', 'makinesiz görünüm her makinenin ölçümünü gösterir');
        assert.equal((await sureler(rev, c.operator, `?makineId=${makineB}`)).adimlar[0]?.olcum.islem, null);
        assert.equal((await vt().tx((db) => adimEtkinSureleri(db, rev, makineA))).get(adim.opNo)?.birimSureDk, 2.5);
        await vt().tx((db) => emirBittiYansit(db, { uretimEmriId: emirId, saglamAdet: 10, kisiId: operatorId }));
        const adet = await vt().tx((db) => db.tek<{ n: number }>('SELECT count(*)::int AS n FROM rota_gerceklesen_sure WHERE malzeme_id = $1', [urun]));
        assert.equal(adet?.n, 2);
      });

      test('RT-77, RT-78, RT-79: kabul yürürlükteki revizyondan taslak açar, teorik süreye yazar; plan yürürlüğe kadar eskiyle çalışır, yürürlükte ölçüm boşalır', async () => {
        const urun = await mamulAc();
        const rev = await yururlugeAlinmisRota(urun, [ayrikAdim()]);
        const adim = (await sureler(rev)).adimlar[0]!;
        const { isEmriId } = await olculmusEmir(urun, rev, adim.opNo, makineA);
        const once = (await sureler(rev)).adimlar[0]!;
        const k = await kabulEt(adim.adimId, { tur: 'islem', olcumId: once.olcum.islem!.id, okunanId: once.sonKayit.islem });
        assert.equal(k.statusCode, 200, k.body);
        const { taslak, sureler: ts } = k.json<GerceklesenKabulCevabi>();
        assert.notEqual(taslak.id, rev);
        assert.equal(taslak.durum, 'taslak');
        const t0 = ts.adimlar[0]!;
        assert.deepEqual([t0.teorik.islemDk, t0.teorik.degisimDk, t0.etkin.birimSureDk, t0.teorik.hazirlikDk], ['2.5000', '0.5000', '3', '30.00'], '170 b: birim ölçülen toplam, değişim korunur');
        assert.equal(t0.olcum.islem?.sureDk, '3', 'ölçüm yürürlüğe kadar görünür');
        assert.equal((await vt().tx((db) => adimEtkinSureleri(db, rev))).get(adim.opNo)?.birimSureDk, 2.5, 'plan yürürlükteki revizyonla çalışır');
        const kabul = await vt().tx((db) => db.tek<{ isEmriId: number; makineId: number | null; sureDk: string }>(
          `SELECT is_emri_id AS "isEmriId", makine_id AS "makineId", sure_dk AS "sureDk" FROM rota_gerceklesen_sure WHERE malzeme_id = $1 AND kaynak = 'kabul'`, [urun],
        ));
        assert.deepEqual([kabul?.isEmriId, kabul?.makineId, Number(kabul?.sureDk)], [isEmriId, null, 3]);
        // İkinci kabul aynı açık taslağa yazar.
        const h = await kabulEt(t0.adimId, { tur: 'hazirlik', olcumId: t0.olcum.hazirlik!.id, okunanId: t0.sonKayit.hazirlik });
        assert.equal(h.statusCode, 200, h.body);
        assert.equal(h.json<GerceklesenKabulCevabi>().taslak.id, taslak.id);
        assert.equal(h.json<GerceklesenKabulCevabi>().sureler.adimlar[0]?.teorik.hazirlikDk, '20.00');
        // Kabul eden düzenleyendir: dört gözle onayı başkası verir.
        const gonder = await komut(taslak.id, 'onaya-gonder', { surum: h.json<GerceklesenKabulCevabi>().taslak.surum }, c.planlama);
        assert.equal(gonder.statusCode, 200, gonder.body);
        const t1 = h.json<GerceklesenKabulCevabi>().sureler.adimlar[0]!;
        assert.equal((await kabulEt(t1.adimId, { tur: 'islem', olcumId: t1.olcum.islem!.id, okunanId: t1.sonKayit.islem })).statusCode, 409, 'onaydaki revizyona kabul yazılmaz');
        const onay = await komut(taslak.id, 'onayla', { surum: gonder.json<KomutCevabi>().surum, yururlugeAl: true }, c.mudur);
        assert.equal(onay.statusCode, 200, onay.body);
        assert.equal((await vt().tx((db) => adimEtkinSureleri(db, taslak.id))).get(adim.opNo)?.birimSureDk, 3);
        for (const ek of ['', `?makineId=${makineA}`]) {
          const sonra = (await sureler(taslak.id, c.operator, ek)).adimlar[0]!;
          assert.deepEqual([sonra.olcum.islem, sonra.olcum.hazirlik], [null, null], `yürürlükte ölçüm boşalır ${ek}`);
        }
        // Eski teorik eski revizyonda kalır.
        assert.equal((await sureler(rev)).adimlar[0]?.teorik.islemDk, '2.0000');
      });

      test('RT-78: makineye özgü kabul adayın süresine yazar; yürürlükte yalnız o makinenin ölçümü boşalır, değişmeyen tür kalır', async () => {
        const urun = await mamulAc();
        const rev = await yururlugeAlinmisRota(urun, [yeniAdim({
          ayarSuresiDk: 30, birimSureDk: 2.5, kaynak: { tur: 'makine', id: makineB },
          adaylar: [{ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 25, birimSureDk: 2.4 }],
        })]);
        const adim = (await sureler(rev)).adimlar[0]!;
        await olculmusEmir(urun, rev, adim.opNo, makineA);
        const once = (await sureler(rev, c.operator, `?makineId=${makineA}`)).adimlar[0]!;
        const k = await kabulEt(adim.adimId, { tur: 'islem', olcumId: once.olcum.islem!.id, makineId: makineA, okunanId: once.sonKayit.islem });
        assert.equal(k.statusCode, 200, k.body);
        const { taslak } = k.json<GerceklesenKabulCevabi>();
        const ayr = await ayrinti(taslak.id);
        assert.deepEqual([ayr.adimlar[0]?.birimSureDk, ayr.adimlar[0]?.adaylar[0]?.birimSureDk, ayr.adimlar[0]?.adaylar[0]?.ayarSuresiDk], ['2.5000', '3.0000', '25.00']);
        const gonder = await komut(taslak.id, 'onaya-gonder', { surum: taslak.surum }, c.planlama);
        assert.equal((await komut(taslak.id, 'onayla', { surum: gonder.json<KomutCevabi>().surum, yururlugeAl: true }, c.mudur)).statusCode, 200);
        const sonra = (await sureler(taslak.id, c.operator, `?makineId=${makineA}`)).adimlar[0]!;
        assert.deepEqual([sonra.olcum.islem, sonra.olcum.hazirlik?.sureDk], [null, '20'], 'hazırlık kabul edilmedi, ölçümü kalır');
      });

      test('RT-77, sürüm, yetki ve tekrar: rota.yaz olmayan, eski okunan satır, başka adımın ya da türün satırı, boşaltma satırı, başka makine reddedilir; yinelenen istek tek taslak yazar', async () => {
        const urun = await mamulAc();
        const rev = await yururlugeAlinmisRota(urun, [ayrikAdim(), yeniAdim({ ad: 'İkinci' })]);
        const [adim, ikinci] = (await sureler(rev)).adimlar as [SurelerCevabi['adimlar'][number], SurelerCevabi['adimlar'][number]];
        await olculmusEmir(urun, rev, adim.opNo, makineA);
        const once = (await sureler(rev)).adimlar[0]!;
        const olcumId = once.olcum.islem!.id;
        for (const cerez of [c.operator, c.kalite, c.cam]) assert.equal((await kabulEt(adim.adimId, { tur: 'islem', olcumId }, cerez)).statusCode, 403);
        assert.equal((await kabulEt(ikinci.adimId, { tur: 'islem', olcumId })).statusCode, 422);
        assert.equal((await kabulEt(adim.adimId, { tur: 'hazirlik', olcumId })).statusCode, 422);
        assert.equal((await kabulEt(adim.adimId, { tur: 'islem', olcumId, makineId: makineB })).statusCode, 422);
        assert.equal((await kabulEt(adim.adimId, { tur: 'islem', olcumId: 2_147_483_000 })).statusCode, 404);
        assert.equal((await kabulEt(2_147_483_000, { tur: 'islem', olcumId })).statusCode, 404);
        const bos = await yaz(adim.adimId, { tur: 'degisim', sureDk: null });
        assert.equal(bos.statusCode, 200, bos.body);
        const bosId = bos.json<SurelerCevabi>().adimlar[0]!.sonKayit.degisim!;
        assert.equal((await kabulEt(adim.adimId, { tur: 'degisim', olcumId: bosId, okunanId: bosId })).statusCode, 422);
        const kimlik = randomUUID();
        assert.equal((await kabulEt(adim.adimId, { tur: 'islem', olcumId, okunanId: once.sonKayit.islem }, c.planlama, kimlik)).statusCode, 200);
        assert.equal((await kabulEt(adim.adimId, { tur: 'islem', olcumId, okunanId: once.sonKayit.islem }, c.planlama, kimlik)).statusCode, 200);
        const adet = await vt().tx((db) => db.tek<{ kabul: number; taslak: number }>(
          `SELECT (SELECT count(*)::int FROM rota_gerceklesen_sure WHERE malzeme_id = $1 AND kaynak = 'kabul') AS kabul,
                  (SELECT count(*)::int FROM rota_revizyonu WHERE malzeme_id = $1 AND durum = 'taslak') AS taslak`, [urun],
        ));
        assert.deepEqual(adet, { kabul: 1, taslak: 1 });
        assert.equal((await kabulEt(adim.adimId, { tur: 'islem', olcumId, okunanId: null })).statusCode, 409, 'arada yazılmış satır varken eski okunanla kabul edilmez');
      });
    });

    test('RT-75, sürüm, yetki ve tekrar: sıfır işlem, eski okunan satır, rota.yaz olmayan kişi ve fason adım reddedilir; yinelenen istek tek satır yazar', async () => {
      const urun = await mamulAc();
      const rev = await yururlugeAlinmisRota(urun, [yeniAdim()]);
      const adim = (await sureler(rev)).adimlar[0]!;
      const sifir = await yaz(adim.adimId, { tur: 'islem', sureDk: 0 });
      assert.equal(sifir.statusCode, 400, sifir.body);
      for (const cerez of [c.operator, c.kalite, c.cam]) assert.equal((await yaz(adim.adimId, { tur: 'islem', sureDk: 1 }, cerez)).statusCode, 403);
      const kimlik = randomUUID();
      assert.equal((await yaz(adim.adimId, { tur: 'degisim', sureDk: 0.3 }, c.planlama, kimlik)).statusCode, 200);
      assert.equal((await yaz(adim.adimId, { tur: 'degisim', sureDk: 0.3 }, c.planlama, kimlik)).statusCode, 200);
      const satir = await vt().tx((db) => db.tek<{ adet: number }>(
        "SELECT count(*)::int AS adet FROM rota_gerceklesen_sure WHERE malzeme_id = $1 AND tur = 'degisim'", [urun],
      ));
      assert.equal(satir?.adet, 1);
      // Başkası yazdıktan sonra eski okunan satırla yazma reddedilir.
      const eski = await yaz(adim.adimId, { tur: 'degisim', sureDk: 0.2, okunanId: null });
      assert.equal(eski.statusCode, 409, eski.body);
      assert.equal((await yaz(2_147_483_000, { tur: 'islem', sureDk: 1 })).statusCode, 404);
      assert.equal((await yaz(adim.adimId, { tur: 'hazirlik', sureDk: 5, makineId: 2_147_483_000 })).statusCode, 409);
      // Defter değişmez: düzeltme yeni satırdır.
      await assert.rejects(vt().tx((db) => db.sorgu('UPDATE rota_gerceklesen_sure SET sure_dk = 1 WHERE malzeme_id = $1', [urun])));
      const firma = (await tamam<{ firma: { id: number } }>(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad: `Deneme fasoncu ${++sayac}`, tur: 'tedarikci', fason: true })).firma;
      const fUrun = await mamulAc();
      const fRev = await yururlugeAlinmisRota(fUrun, [yeniAdim({ kaynak: { tur: 'fason', id: firma.id }, ayarSuresiDk: null, birimSureDk: null, terminGun: 5 })]);
      const fAdim = (await sureler(fRev)).adimlar[0]!;
      assert.equal(fAdim.fason, true);
      assert.equal((await yaz(fAdim.adimId, { tur: 'islem', sureDk: 1 })).statusCode, 422);
    });
  });
});
