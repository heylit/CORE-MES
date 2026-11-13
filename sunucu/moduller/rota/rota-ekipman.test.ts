import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AdimGirdisi, KomutCevabi, RevizyonAyrintisi, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { adimliEmirAyrintisi } from '../uretim-emirleri/disari.ts';
import { malzemeStokDurumlari } from '../stok/disari.ts';
import { isEmriAparatHazirliklari, isEmriOlcuAletiHazirliklari } from './disari.ts';
import { isEmriEkipmanlari } from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

// 2893-4 a: rota adımının aparat ve ölçü aleti listesi; emre kopya ve hazırlık maddeleri.
describe('rota adım ekipmanı (2893-4 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  const c: Record<'yonetici' | 'kartOnaycisi' | 'planlama' | 'mudur' | 'kalite' | 'operator', string> = { yonetici: '', kartOnaycisi: '', planlama: '', mudur: '', kalite: '', operator: '' };
  let tipler: SeceneklerCevabi['operasyonTipleri'] = [];
  let makine = 0;
  let hammadde = 0;
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

  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method: yontem, url: `/api${url}`, payload: payload as object | undefined,
      headers: { cookie: cerez, ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
    });

  async function tamam<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const cevap = await istek(cerez, yontem, url, payload);
    assert.equal(cevap.statusCode, 200, `${yontem} ${url}: ${cevap.body}`);
    return cevap.json();
  }

  async function red(cerez: string, url: string, payload: unknown, durum: number, ileti?: RegExp): Promise<void> {
    const cevap = await istek(cerez, 'POST', url, payload);
    assert.equal(cevap.statusCode, durum, `${url}: ${cevap.body}`);
    if (ileti) assert.match(cevap.json<{ mesaj: string }>().mesaj, ileti);
  }

  const kartZorunlulari = (tur: string, sira: number): Record<string, unknown> => ({
    hammadde: { grade: 'S235', form: 'cubuk', dims: { d: 20, l: 2000 + sira } },
    mamul: { g: { ad: `Deneme mamul ${sira}` } },
  } as Record<string, Record<string, unknown>>)[tur] ?? {};
  async function kartAc(tur: 'mamul' | 'hammadde'): Promise<number> {
    const kimlik = `ek${++sayac}`;
    const kod = `${tur === 'mamul' ? 'MM' : 'HM'}-EKP-00001`;
    const govde = (d: string, surum: number | null) => ({
      kayit: { id: kimlik, tur, fam: 'metal', com: { kod, ad: `Deneme ${tur} ${sayac}`, birim: 'adet' }, onay: { durum: d }, ...kartZorunlulari(tur, sayac) },
      ozet: { stok_kodu: kod, tur, onay_durumu: d, benzersiz_anahtar: `${tur}|${kimlik}`, mukerrer_gerekcesi: null },
      surum,
    });
    const r = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('taslak', null));
    const g = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('onayda', r.surum));
    await tamam(c.kartOnaycisi, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('aktif', g.surum));
    return (await vt().tx((db) => db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik])))!.no;
  }

  const tip = (kod: string): number => {
    const t = tipler.find((x) => x.kod === kod);
    if (!t) throw new Error(`Operasyon tipi yok: ${kod}`);
    return t.id;
  };
  const icAdim = (p: Partial<AdimGirdisi> = {}): AdimGirdisi => ({
    opNo: null, operasyonTipiId: tip('TRN'), ad: 'Tornalama', kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 30, birimSureDk: 2,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
    adaylar: [], bilesenler: [{ malzemeId: hammadde, miktar: 1, fireYuzde: 0 }], yanUrunler: [], ...p,
  });
  // Taslak: OP 10 ve OP 20 iç adım.
  async function taslak(adimlar: AdimGirdisi[] = [icAdim(), icAdim({ ad: 'Frezeleme', bilesenler: [] })]): Promise<{ id: number; surum: number; urun: number }> {
    const urun = await kartAc('mamul');
    const { id } = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak: { tur: 'bos' } });
    const k = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/kaydet`, { surum: 1, aciklama: null, adimlar });
    return { id, surum: k.surum, urun };
  }
  async function yururlugeAl(id: number, surum: number): Promise<void> {
    const g = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/onaya-gonder`, { surum });
    await tamam(c.mudur, 'POST', `/rota/revizyonlar/${id}/onayla`, { surum: g.surum, yururlugeAl: true });
  }
  const emirAc = async (revizyonId: number) =>
    tamam<{ uretimEmriId: number; isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${revizyonId}/emre-kopyala`, { projeId, adet: 4, teslim: null });

  let aparat = 0;
  let mikrometre = 0;
  let kumpas = 0;
  const yaz = (id: number, surum: number, opNo: number, ekipman: unknown[], cerez = c.planlama) =>
    istek(cerez, 'POST', `/rota/revizyonlar/${id}/adim-ekipmani`, { surum, opNo, ekipman });
  const oku = (id: number) => tamam<RevizyonAyrintisi>(c.mudur, 'GET', `/rota/revizyonlar/${id}`);

  before(async () => {
    ortam = await testVeritabaniKur('rota_ekipman');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('EKP.DENEME', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    c.yonetici = await girisCerezi('yonetici');
    await ortam.vt.tx((db) => db.sorgu(
      `INSERT INTO rol_islemi (rol_id, islem)
       SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem FROM (VALUES
         ('planlama_proje', 'rota.yaz'), ('planlama_proje', 'rota.revizyon-yaz'), ('planlama_proje', 'rota.onaya-gonder'),
         ('planlama_proje', 'rota.sablon-yaz'), ('planlama_proje', 'rota.taslak-ac'), ('planlama_proje', 'rota.sure-kabul'), ('planlama_proje', 'rota.emre-kopyala'), ('mudur', 'rota.onayla')) AS m (kod, islem)
       ON CONFLICT DO NOTHING`,
    ));
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kart Onaycısı', kullaniciAdi: 'kartonay', parola: PAROLA }));
    c.kartOnaycisi = await girisCerezi('kartonay');
    const roller = ((await istek(c.yonetici, 'GET', '/roller')).json() as { roller: { id: number; ad: string }[] }).roller;
    for (const [ad, rolAdi] of [['planlama', 'Planlama ve Proje'], ['mudur', 'Müdür'], ['kalite', 'Kalite'], ['operator', 'Operatör']] as const) {
      const rolId = roller.find((x) => x.ad === rolAdi)!.id;
      await vt().tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
        const kisi = await rolAta(db, yoneticiId, id, rolId);
        for (const rol of kisi.roller) if (rol.id !== rolId) await rolAl(db, yoneticiId, id, rol.id);
      });
      c[ad] = await girisCerezi(ad);
    }
    tipler = (await tamam<SeceneklerCevabi>(c.mudur, 'GET', '/rota/secenekler')).operasyonTipleri;
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'EK-IM', ad: 'Deneme merkez', aciklama: null });
    const istasyon = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'EK-A', ad: 'Deneme A', isMerkeziId: merkez.id })).id;
    makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'EK-MA', ad: 'Deneme makine', istasyonId: istasyon })).id;
    hammadde = await kartAc('hammadde');
    aparat = await kartAc('hammadde');
    const tur = async (ad: string) => (await ortam!.sahip.tek<{ id: number }>('SELECT id FROM olcu_aleti_turu WHERE ad = $1', [ad]))!.id;
    mikrometre = await tur('Mikrometre');
    kumpas = await tur('Kumpas');
  });

  after(async () => { await ortam?.kaldir(); });

  test('uç: planlama adımın listesini yazar; adlarıyla okunur; kaydet listeyi göndermezse korur; yetki, sürüm ve doğrulama', async () => {
    const turler = await tamam<{ turler: { id: number; ad: string }[] }>(c.planlama, 'GET', '/rota/olcu-aleti-turleri');
    assert.equal(turler.turler.some((t) => t.id === mikrometre && t.ad === 'Mikrometre'), true);
    assert.equal((await istek(c.operator, 'GET', '/rota/olcu-aleti-turleri')).statusCode, 403);
    const { id, surum } = await taslak();
    const liste = [{ tur: 'aparat', malzemeId: aparat, aciklama: 'Yumuşak çene' }, { tur: 'olcu_aleti', aletTuruId: mikrometre, aciklama: '' }];
    await red(c.operator, `/rota/revizyonlar/${id}/adim-ekipmani`, { surum, opNo: 10, ekipman: liste }, 403);
    await red(c.kalite, `/rota/revizyonlar/${id}/adim-ekipmani`, { surum, opNo: 10, ekipman: liste }, 403);
    assert.equal((await yaz(id, surum + 1, 10, liste)).statusCode, 409, 'eski sürüm');
    assert.equal((await yaz(id, surum, 30, liste)).statusCode, 400, 'adım yok');
    assert.equal((await yaz(id, surum, 10, [...liste, { tur: 'olcu_aleti', aletTuruId: mikrometre, aciklama: null }])).statusCode, 400, 'aynı tür iki kez');
    assert.equal((await yaz(id, surum, 10, [{ tur: 'olcu_aleti', aletTuruId: 2147483000, aciklama: null }])).statusCode, 400, 'tür yok');
    assert.equal((await yaz(id, surum, 10, [{ tur: 'aparat', malzemeId: 2147483000, aciklama: null }])).statusCode, 400, 'kart yok');
    const y = await yaz(id, surum, 10, liste);
    assert.equal(y.statusCode, 200, y.body);
    const r = await oku(id);
    const op10 = r.adimlar.find((a) => a.opNo === 10)!;
    assert.deepEqual(op10.ekipman.map((x) => [x.tur, x.malzeme?.id ?? null, x.aletTuru?.ad ?? null, x.aciklama]), [['aparat', aparat, null, 'Yumuşak çene'], ['olcu_aleti', null, 'Mikrometre', null]]);
    assert.deepEqual(r.adimlar.find((a) => a.opNo === 20)!.ekipman, []);
    // Ekipmanı bilmeyen kaydet (alan yok) listeyi korur; adım kimlikleri değişse de liste OP numarasıyla kalır.
    const k = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/kaydet`, {
      surum: y.json<KomutCevabi>().surum, aciklama: null, adimlar: [icAdim({ opNo: 10 }), icAdim({ opNo: 20, ad: 'Frezeleme', bilesenler: [] })],
    });
    assert.equal((await oku(id)).adimlar.find((a) => a.opNo === 10)!.ekipman.length, 2, 'kaydet listeyi korudu');
    // Kaydet listeyi gönderirse yazar (boş liste kaldırır).
    await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/kaydet`, {
      surum: k.surum, aciklama: null, adimlar: [icAdim({ opNo: 10, ekipman: [] }), icAdim({ opNo: 20, ad: 'Frezeleme', bilesenler: [], ekipman: [{ tur: 'olcu_aleti', aletTuruId: kumpas, aciklama: null }] })],
    });
    const s = await oku(id);
    assert.deepEqual(s.adimlar.map((a) => [a.opNo, a.ekipman.map((x) => x.aletTuru?.ad ?? x.malzeme?.id)]), [[10, []], [20, ['Kumpas']]]);
  });

  // 3199 (A): aparat satırı planın ikincil kaynak isteğidir: adet ve aşama yazılır, okunur ve emre kopyalanır; verilmezse 1 ve ayar ile işleme.
  test('aparat adedi ve aşaması yazılır, okunur ve iş emrine kopyalanır; verilmezse 1 adet ayar ve işleme; sınır dışı adet ve aşama 400', async () => {
    const { id, surum } = await taslak();
    const takim = await kartAc('hammadde');
    assert.equal((await yaz(id, surum, 10, [{ tur: 'aparat', malzemeId: aparat, aciklama: null, adet: 0 }])).statusCode, 400, 'adet 0');
    assert.equal((await yaz(id, surum, 10, [{ tur: 'aparat', malzemeId: aparat, aciklama: null, adet: 101 }])).statusCode, 400, 'adet tavan üstü');
    assert.equal((await yaz(id, surum, 10, [{ tur: 'aparat', malzemeId: aparat, aciklama: null, asama: 'ayar' }])).statusCode, 400, 'bilinmeyen aşama');
    const y = await yaz(id, surum, 10, [
      { tur: 'aparat', malzemeId: aparat, aciklama: null }, { tur: 'aparat', malzemeId: takim, aciklama: null, adet: 2, asama: 'isleme' },
      { tur: 'olcu_aleti', aletTuruId: mikrometre, aciklama: null },
    ]);
    assert.equal(y.statusCode, 200, y.body);
    const r = await oku(id);
    assert.deepEqual(r.adimlar.find((a) => a.opNo === 10)!.ekipman.map((x) => [x.malzeme?.id ?? null, x.adet, x.asama]),
      [[aparat, 1, 'ayar_isleme'], [takim, 2, 'isleme'], [null, 1, 'ayar_isleme']]);
    const kullanim = (await tamam<{ kullanim: { malzemeId: number; adim: number }[] }>(c.planlama, 'GET', '/rota/aparat-kullanimi')).kullanim;
    assert.equal(kullanim.find((k) => k.malzemeId === takim)?.adim, 1, 'kartı isteyen adım sayısı');
    await yururlugeAl(id, y.json<KomutCevabi>().surum);
    const { uretimEmriId } = await emirAc(id);
    const emir = await vt().tx((db) => adimliEmirAyrintisi(db, uretimEmriId));
    const ie = emir.isEmirleri.find((i) => i.opNo === 10)!.id;
    const liste = await vt().tx((db) => isEmriEkipmanlari(db, [ie]));
    assert.deepEqual(liste.map((x) => [x.malzemeId, x.adet, x.asama]), [[aparat, 1, 'ayar_isleme'], [takim, 2, 'isleme'], [null, 1, 'ayar_isleme']]);
  });

  test('yürürlükteki revizyona yazılmaz; emir açılınca liste iş emrine kopyalanır, hazırlık maddeleri eksik görünür; bölünen kol kopyalar', async () => {
    const { id, surum } = await taslak();
    const y = await yaz(id, surum, 10, [{ tur: 'aparat', malzemeId: aparat, aciklama: null }, { tur: 'olcu_aleti', aletTuruId: mikrometre, aciklama: null }]);
    const s2 = y.json<KomutCevabi>().surum;
    await yururlugeAl(id, s2);
    const r = await oku(id);
    assert.equal((await yaz(id, r.revizyon.surum, 10, [])).statusCode, 409, 'yalnız taslak');
    const { uretimEmriId } = await emirAc(id);
    const emir = await vt().tx((db) => adimliEmirAyrintisi(db, uretimEmriId));
    const op = (e: typeof emir, n: number) => e.isEmirleri.find((i) => i.opNo === n)!.id;
    const liste = await vt().tx((db) => isEmriEkipmanlari(db, [op(emir, 10), op(emir, 20)]));
    assert.deepEqual(liste.map((x) => [x.isEmriId, x.tur, x.malzemeId, x.aletTuruId]), [[op(emir, 10), 'aparat', aparat, null], [op(emir, 10), 'olcu_aleti', null, mikrometre]]);
    const aparatH = await vt().tx((db) => isEmriAparatHazirliklari(db, [op(emir, 10), op(emir, 20)], malzemeStokDurumlari));
    assert.deepEqual(aparatH.get(op(emir, 10)), { durum: 'yok', secildi: true }, 'aparat stokta yok');
    assert.deepEqual(aparatH.get(op(emir, 20)), { durum: 'yok', secildi: false }, 'listesiz adımda madde gerekmez');
    const olcuH = await vt().tx((db) => isEmriOlcuAletiHazirliklari(db, [op(emir, 10)]));
    assert.deepEqual(olcuH.get(op(emir, 10)), { durum: 'yok', secildi: true }, 'türde kalibrasyonu geçerli alet yok');
    const bol = await tamam<{ altEmirId: number }>(c.planlama, 'POST', `/adimli-emirler/${uretimEmriId}/bol`, { adimSira: 1, adet: 1, surum: emir.surum });
    const kol = await vt().tx((db) => adimliEmirAyrintisi(db, bol.altEmirId));
    const kolListe = await vt().tx((db) => isEmriEkipmanlari(db, [op(kol, 10)]));
    assert.deepEqual(kolListe.map((x) => [x.tur, x.malzemeId, x.aletTuruId]), [['aparat', aparat, null], ['olcu_aleti', null, mikrometre]]);
    await assert.rejects(ortam!.sahip.sorgu('UPDATE rota_is_emri_ekipmani SET aciklama = $1', ['x']), /yalnız ekleme/);
  });

  // Test 2 B1 (2893-D5): "yürürlükteki rotayı uygula" iş emri kimliklerini korur; bekleyen iş emrinin listesi yeni revizyondan yazılır.
  test('rota uygulanınca bekleyen iş emrinin listesi yeni revizyondan; eski satır kalmaz', async () => {
    const { id, surum, urun } = await taslak();
    const y = await yaz(id, surum, 10, [{ tur: 'aparat', malzemeId: aparat, aciklama: null }, { tur: 'olcu_aleti', aletTuruId: mikrometre, aciklama: null }]);
    await yururlugeAl(id, y.json<KomutCevabi>().surum);
    const { uretimEmriId } = await emirAc(id);
    const b = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak: { tur: 'revizyon', revizyonId: id } });
    const y2 = await yaz(b.id, (await oku(b.id)).revizyon.surum, 10, [{ tur: 'olcu_aleti', aletTuruId: kumpas, aciklama: null }]);
    assert.equal(y2.statusCode, 200, y2.body);
    await yururlugeAl(b.id, y2.json<KomutCevabi>().surum);
    const once = await vt().tx((db) => adimliEmirAyrintisi(db, uretimEmriId));
    await tamam(c.planlama, 'POST', `/rota/emirler/${uretimEmriId}/yururlukteki-rotayi-uygula`, {});
    const sonra = await vt().tx((db) => adimliEmirAyrintisi(db, uretimEmriId));
    assert.deepEqual(sonra.isEmirleri.map((i) => i.id), once.isEmirleri.map((i) => i.id), 'iş emri kimlikleri aynı (senaryonun koşulu)');
    const op10 = sonra.isEmirleri.find((i) => i.opNo === 10)!.id;
    const liste = await vt().tx((db) => isEmriEkipmanlari(db, [op10]));
    assert.deepEqual(liste.map((x) => [x.tur, x.malzemeId, x.aletTuruId]), [['olcu_aleti', null, kumpas]]);
  });

  test('hazırlık tamam yolu: aparat stokta varsa, türde kalibrasyonu geçerli alet varsa tamam', async () => {
    const { id, surum } = await taslak();
    const y = await yaz(id, surum, 10, [{ tur: 'aparat', malzemeId: aparat, aciklama: null }, { tur: 'olcu_aleti', aletTuruId: kumpas, aciklama: null }]);
    await yururlugeAl(id, y.json<KomutCevabi>().surum);
    const { uretimEmriId } = await emirAc(id);
    const op10 = (await vt().tx((db) => adimliEmirAyrintisi(db, uretimEmriId))).isEmirleri.find((i) => i.opNo === 10)!.id;
    const stok = (toplam: string) => async (_db: unknown, idler: number[]) => new Map(idler.map((m) => [m, { toplam }]));
    assert.deepEqual((await vt().tx((db) => isEmriAparatHazirliklari(db, [op10], stok('1')))).get(op10), { durum: 'tamam', secildi: true });
    assert.deepEqual((await vt().tx((db) => isEmriAparatHazirliklari(db, [op10], stok('0')))).get(op10), { durum: 'yok', secildi: true });
    assert.deepEqual((await vt().tx((db) => isEmriOlcuAletiHazirliklari(db, [op10]))).get(op10), { durum: 'yok', secildi: true });
    const alet = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO olcu_aleti (no, tur_id, ad) VALUES ('EK-KMP-1', $1, 'Deneme kumpas') RETURNING id", [kumpas]))!.id;
    await ortam!.sahip.sorgu("INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc) VALUES ($1, current_date, $2, 'uygun')", [alet, yoneticiId]);
    assert.deepEqual((await vt().tx((db) => isEmriOlcuAletiHazirliklari(db, [op10]))).get(op10), { durum: 'tamam', secildi: true });
  });

  test('kullanımda olmayan aparat kartı ve kapalı alet türü yeni satırda reddedilir (adım ekipmanı ve kaydet)', async () => {
    const pasifKart = await kartAc('hammadde');
    await ortam!.sahip.sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'pasif' WHERE no = $1", [pasifKart]);
    const kapali = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO olcu_aleti_turu (ad, aktif) VALUES ('Deneme kapalı tür', false) RETURNING id"))!.id;
    const { id, surum } = await taslak();
    await red(c.planlama, `/rota/revizyonlar/${id}/adim-ekipmani`, { surum, opNo: 10, ekipman: [{ tur: 'aparat', malzemeId: pasifKart, aciklama: null }] }, 400, /kullanımda değil/);
    await red(c.planlama, `/rota/revizyonlar/${id}/adim-ekipmani`, { surum, opNo: 10, ekipman: [{ tur: 'olcu_aleti', aletTuruId: kapali, aciklama: null }] }, 400);
    const adimlar = (ekipman: unknown[]) => [icAdim({ opNo: 10, ekipman: ekipman as AdimGirdisi['ekipman'] }), icAdim({ opNo: 20, ad: 'Frezeleme', bilesenler: [] })];
    await red(c.planlama, `/rota/revizyonlar/${id}/kaydet`, { surum, aciklama: null, adimlar: adimlar([{ tur: 'aparat', malzemeId: pasifKart, aciklama: null }]) }, 400, /kullanımda değil/);
    await red(c.planlama, `/rota/revizyonlar/${id}/kaydet`, { surum, aciklama: null, adimlar: adimlar([{ tur: 'olcu_aleti', aletTuruId: kapali, aciklama: null }]) }, 400);
    assert.deepEqual((await oku(id)).adimlar.map((a) => a.ekipman), [[], []], 'hiçbiri yazılmadı');
  });
});
