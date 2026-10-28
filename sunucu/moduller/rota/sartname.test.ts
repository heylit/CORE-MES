import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type {
  AdimGirdisi, IsEmriSartnameleriCevabi, KomutCevabi, ParametreGirdisi, RevizyonSartnameleriCevabi, SartnameCevabi, SartnamelerCevabi, SeceneklerCevabi,
  TalimatAdimiGirdisi, TalimatlarCevabi, TalimatSablonlariCevabi, TalimatSablonuCevabi,
} from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { adimliEmirAyrintisi } from '../uretim-emirleri/disari.ts';
import { isEmriSartnameleri, talimatSurumuAdimlari } from './disari.ts';

const PAROLA = 'dogru-parola-1';

describe('işlem şartnamesi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  const c: Record<'yonetici' | 'kartOnaycisi' | 'planlama' | 'mudur' | 'operator', string> = { yonetici: '', kartOnaycisi: '', planlama: '', mudur: '', operator: '' };
  let tipler: SeceneklerCevabi['operasyonTipleri'] = [];
  let makine = 0;
  let fasoncu = 0;
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
    const kimlik = `sr${++sayac}`;
    const kod = `${tur === 'mamul' ? 'MM' : 'HM'}-SRT-00001`;
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
  const fasonAdim = (p: Partial<AdimGirdisi> = {}): AdimGirdisi =>
    icAdim({ ad: 'Kaplama', kaynak: { tur: 'fason', id: fasoncu }, ayarSuresiDk: null, birimSureDk: null, terminGun: 7, bilesenler: [], ...p });

  // Taslak: OP 10 iç, OP 20 fason.
  async function taslak(adimlar: AdimGirdisi[] = [icAdim(), fasonAdim()]): Promise<{ id: number; surum: number; urun: number }> {
    const urun = await kartAc('mamul');
    const { id } = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak: { tur: 'bos' } });
    const k = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/kaydet`, { surum: 1, aciklama: null, adimlar });
    return { id, surum: k.surum, urun };
  }
  const bagla = (id: number, surum: number, opNo: number, sartnameler: { sartnameId: number; degerler: Record<string, unknown> }[], cerez = c.planlama) =>
    istek(cerez, 'POST', `/rota/revizyonlar/${id}/adim-sartnameleri`, { surum, opNo, sartnameler });
  async function yururlugeAl(id: number, surum: number): Promise<void> {
    const g = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/onaya-gonder`, { surum });
    await tamam(c.mudur, 'POST', `/rota/revizyonlar/${id}/onayla`, { surum: g.surum, yururlugeAl: true });
  }
  const emirAc = async (revizyonId: number) =>
    tamam<{ uretimEmriId: number; isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${revizyonId}/emre-kopyala`, { projeId, adet: 4, teslim: null });

  let kutuphane: SartnamelerCevabi;
  const sartname = (kod: string) => {
    const x = kutuphane.sartnameler.find((s) => s.kod === kod);
    if (!x) throw new Error(`Şartname yok: ${kod}`);
    return x;
  };
  const ayrinti = (id: number) => tamam<SartnameCevabi>(c.operator, 'GET', `/rota/sartnameler/${id}`);

  const alan = (p: Partial<ParametreGirdisi> & Pick<ParametreGirdisi, 'anahtar' | 'tur'>): ParametreGirdisi => ({
    ad: p.anahtar, birim: null, secenekler: null, varsayilan: null, ipucu: null, zorunlu: false, adimdaDegisir: true, ...p,
  });
  const taslakGovdesi = (surum: number, parametreler: ParametreGirdisi[], atiflar: { standartId: number; rol: string; not: string | null }[] = []) =>
    ({ surum, parametreler, atiflar, istenenBelgeler: ['Uygunluk belgesi (CoC)'], terminalNotu: null, degisiklikNotu: null });

  // Kendi şartnamesi: yayınlanmış, adımda zorunlu ve varsayılansız "renk" alanlı, iç ve fason adımda kullanılır.
  async function kendiSartnamesi(kapsam: 'ic' | 'fason' | 'ikisi' = 'ikisi'): Promise<SartnameCevabi['sartname']> {
    const kod = `DN-${++sayac}`;
    const e = await tamam<SartnameCevabi>(c.yonetici, 'POST', '/rota/sartnameler/ekle', {
      kod, kategoriId: kutuphane.kategoriler[0]!.id, ad: `Deneme şartname ${sayac}`, kapsam, musteriFirmaId: null, musteriBelgeNo: null,
    });
    const k = await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${e.sartname.id}/taslak-kaydet`, taslakGovdesi(e.sartname.surum, [
      alan({ anahtar: 'renk', tur: 'metin', zorunlu: true }),
      alan({ anahtar: 'kalinlik', tur: 'sayi', birim: 'µm', varsayilan: 60 }),
      alan({ anahtar: 'sinif', tur: 'secim', secenekler: ['C3', 'C4'], varsayilan: 'C3', adimdaDegisir: false, zorunlu: true }),
    ], [{ standartId: kutuphane.standartlar[0]!.id, rol: 'yontem', not: null }]));
    return (await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${e.sartname.id}/yayinla`, { surum: k.sartname.surum })).sartname;
  }

  before(async () => {
    ortam = await testVeritabaniKur('sartname');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('SRT.DENEME', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    c.yonetici = await girisCerezi('yonetici');
    // Şartname işlemleri ilk aşamada yalnız yöneticidedir (976 a): planlama rotayı yazar ama şartname yazamaz.
    await ortam.vt.tx((db) => db.sorgu(
      `INSERT INTO rol_islemi (rol_id, islem)
       SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem FROM (VALUES
         ('planlama_proje', 'rota.yaz'), ('planlama_proje', 'rota.emre-kopyala'), ('planlama_proje', 'rota.talimat-yaz'), ('mudur', 'rota.onayla')) AS m (kod, islem)
       ON CONFLICT DO NOTHING`,
    ));
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kart Onaycısı', kullaniciAdi: 'kartonay', parola: PAROLA }));
    c.kartOnaycisi = await girisCerezi('kartonay');
    const roller = ((await istek(c.yonetici, 'GET', '/roller')).json() as { roller: { id: number; ad: string }[] }).roller;
    for (const [ad, rolAdi] of [['planlama', 'Planlama ve Proje'], ['mudur', 'Müdür'], ['operator', 'Operatör']] as const) {
      const rolId = roller.find((x) => x.ad === rolAdi)!.id;
      await vt().tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
        const kisi = await rolAta(db, yoneticiId, id, rolId);
        for (const rol of kisi.roller) if (rol.id !== rolId) await rolAl(db, yoneticiId, id, rol.id);
      });
      c[ad] = await girisCerezi(ad);
    }
    tipler = (await tamam<SeceneklerCevabi>(c.operator, 'GET', '/rota/secenekler')).operasyonTipleri;
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'SR-IM', ad: 'Deneme merkez', aciklama: null });
    const istasyon = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'SR-A', ad: 'Deneme A', isMerkeziId: merkez.id })).id;
    makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'SR-MA', ad: 'Deneme makine', istasyonId: istasyon })).id;
    fasoncu = (await tamam<{ firma: { id: number } }>(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme fasoncu', tur: 'tedarikci', fason: true })).firma.id;
    hammadde = await kartAc('hammadde');
    kutuphane = await tamam<SartnamelerCevabi>(c.operator, 'GET', '/rota/sartnameler');
  });

  after(async () => { await ortam?.kaldir(); });

  test('varsayılan kütüphane göçle gelir ve oturumla okunur: kategoriler, standartlar, yürürlükteki birinci sürümler', async () => {
    assert.equal(kutuphane.kategoriler.length, 14);
    assert.equal(kutuphane.standartlar.length, 141);
    assert.equal(kutuphane.sartnameler.length, 53);
    assert.equal(kutuphane.sartnameler.every((s) => s.kaynak === 'varsayilan' && s.yururlukteSurumNo === 1 && s.taslakSurumNo === null && s.aktif), true);
    const zn = await ayrinti(sartname('KPL-ZN').id);
    const [v] = zn.sartname.surumler;
    assert.equal(zn.sartname.kapsam, 'fason');
    assert.equal(v?.durum, 'yururlukte');
    assert.deepEqual(v?.parametreler.find((p) => p.anahtar === 'kalinlik')?.varsayilan, '8 µm (Fe/Zn8)');
    assert.equal(v?.atiflar.some((a) => a.standart.numara === 'ISO 2081' && a.rol === 'yontem'), true);
    assert.equal(kutuphane.sartnameler.some((s) => s.kod === 'TKR-SOK'), true, 'kırık takım sökümü (977)');
    assert.equal((await istek(c.operator, 'GET', '/rota/sartnameler/2147483000')).statusCode, 404);
  });

  test('976 a: şartname yazmak rota.sartname-yaz, yayınlamak rota.sartname-yayinla ister; rota yazan reddedilir, yönetici yazar', async () => {
    const govde = { kod: 'YT-1', kategoriId: kutuphane.kategoriler[0]!.id, ad: 'Yetki denemesi', kapsam: 'ic', musteriFirmaId: null, musteriBelgeNo: null };
    await red(c.planlama, '/rota/sartnameler/ekle', govde, 403);
    await red(c.planlama, '/rota/standartlar/ekle', { numara: 'DENEME 1', kisaAciklama: 'Deneme' }, 403);
    const e = await tamam<SartnameCevabi>(c.yonetici, 'POST', '/rota/sartnameler/ekle', govde);
    assert.equal(e.sartname.kaynak, 'firma');
    assert.deepEqual(e.sartname.surumler.map((v) => [v.surumNo, v.durum]), [[1, 'taslak']]);
    const id = e.sartname.id;
    await red(c.planlama, `/rota/sartnameler/${id}/taslak-kaydet`, taslakGovdesi(e.sartname.surum, []), 403);
    await red(c.planlama, `/rota/sartnameler/${id}/yayinla`, { surum: e.sartname.surum }, 403);
    await red(c.planlama, `/rota/sartnameler/${id}/pasife-al`, { surum: e.sartname.surum }, 403);
    const y = await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${id}/yayinla`, { surum: e.sartname.surum });
    assert.equal(y.sartname.yururlukteSurumNo, 1);
    assert.equal(y.sartname.surumler[0]?.yayinlayan?.id, yoneticiId);
    // Aynı kod ikinci kez açılmaz; eski sürümle komut reddedilir.
    await red(c.yonetici, '/rota/sartnameler/ekle', govde, 409);
    await red(c.yonetici, `/rota/sartnameler/${id}/surum-ac`, { surum: e.sartname.surum }, 409);
  });

  test('müşteri şartnamesi firma ve belge numarasıyla birlikte tutulur; tedarikçi firma ve yarım bilgi reddedilir', async () => {
    const musteri = (await tamam<{ firma: { id: number } }>(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme müşteri', tur: 'musteri', fason: false })).firma.id;
    const kaynak = sartname('BYA-TOZ').id;
    await red(c.yonetici, `/rota/sartnameler/${kaynak}/kopyala`, { kod: 'MS-1', ad: 'Müşteri toz boya', musteriFirmaId: musteri, musteriBelgeNo: null }, 400, /birlikte/);
    await red(c.yonetici, `/rota/sartnameler/${kaynak}/kopyala`, { kod: 'MS-1', ad: 'Müşteri toz boya', musteriFirmaId: fasoncu, musteriBelgeNo: 'SP-1' }, 400, /Müşteri firma/);
    const k = await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${kaynak}/kopyala`, { kod: 'ms-1', ad: 'Müşteri toz boya', musteriFirmaId: musteri, musteriBelgeNo: 'SP-1' });
    assert.equal(k.sartname.kod, 'MS-1');
    assert.equal(k.sartname.kaynak, 'musteri');
    assert.equal(k.sartname.musteriFirma?.ad, 'Deneme müşteri');
    assert.equal(k.sartname.kapsam, sartname('BYA-TOZ').kapsam);
    const kaynakAlanlari = (await ayrinti(kaynak)).sartname.surumler[0]!.parametreler.map((p) => p.anahtar);
    assert.deepEqual(k.sartname.surumler[0]?.parametreler.map((p) => p.anahtar), kaynakAlanlari, 'kopya kaynağın yürürlükteki içeriğiyle taslak başlar');
    assert.equal(k.sartname.surumler[0]?.durum, 'taslak');
  });

  test('taslak şablonu denetlenir: seçeneksiz seçim, seçenek dışı varsayılan, yinelenen anahtar, bilinmeyen standart; sabit zorunlu alan değersizse yayın reddedilir', async () => {
    const e = await tamam<SartnameCevabi>(c.yonetici, 'POST', '/rota/sartnameler/ekle', {
      kod: 'SB-1', kategoriId: kutuphane.kategoriler[1]!.id, ad: 'Şablon denemesi', kapsam: 'ic', musteriFirmaId: null, musteriBelgeNo: null,
    });
    const yol = `/rota/sartnameler/${e.sartname.id}/taslak-kaydet`;
    const s = e.sartname.surum;
    await red(c.yonetici, yol, taslakGovdesi(s, [alan({ anahtar: 'a', tur: 'secim' })]), 400, /seçenek girilmeli/);
    await red(c.yonetici, yol, taslakGovdesi(s, [alan({ anahtar: 'a', tur: 'secim', secenekler: ['X'], varsayilan: 'Y' })]), 400, /seçeneklerden biri/);
    await red(c.yonetici, yol, taslakGovdesi(s, [alan({ anahtar: 'a', tur: 'sayi', varsayilan: 'beş' })]), 400, /sayı olmalı/);
    await red(c.yonetici, yol, taslakGovdesi(s, [alan({ anahtar: 'a', tur: 'aralik', varsayilan: [5, 1] })]), 400, /alt değer/);
    await red(c.yonetici, yol, taslakGovdesi(s, [alan({ anahtar: 'a', tur: 'sayi' }), alan({ anahtar: 'a', tur: 'metin' })]), 400, /aynı anahtar/);
    await red(c.yonetici, yol, taslakGovdesi(s, [], [{ standartId: 2_147_483_000, rol: 'yontem', not: null }]), 400, /Standart bulunamadı/);
    const k = await tamam<SartnameCevabi>(c.yonetici, 'POST', yol, taslakGovdesi(s, [alan({ anahtar: 'sinif', tur: 'metin', zorunlu: true, adimdaDegisir: false })]));
    await red(c.yonetici, `/rota/sartnameler/${e.sartname.id}/yayinla`, { surum: k.sartname.surum }, 422, /Sabit zorunlu alanın değeri yok: sinif/);
    await red(c.yonetici, `/rota/sartnameler/${e.sartname.id}/taslak-sil`, { surum: k.sartname.surum }, 422, /İlk sürüm silinmez/);
    const d = await tamam<SartnameCevabi>(c.yonetici, 'POST', yol, taslakGovdesi(k.sartname.surum, [alan({ anahtar: 'sinif', tur: 'metin', zorunlu: true, adimdaDegisir: false, varsayilan: 'A' })]));
    const y = await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${e.sartname.id}/yayinla`, { surum: d.sartname.surum });
    assert.equal(y.sartname.yururlukteSurumNo, 1);
    await red(c.yonetici, yol, taslakGovdesi(y.sartname.surum, []), 422, /Taslak sürüm yok/);
  });

  test('yayınlanmış sürüm, alanları ve atıfları veritabanında da değişmez; yeni sürüm yayınlanınca eskiye geçer', async () => {
    const x = await kendiSartnamesi();
    const surumId = x.surumler[0]!.id;
    for (const sql of [
      'UPDATE rota_islem_sartnamesi_parametresi SET ad = $2 WHERE surum_id = $1',
      'DELETE FROM rota_islem_sartnamesi_atfi WHERE surum_id = $1 AND $2::text IS NOT NULL',
      'UPDATE rota_islem_sartnamesi_surumu SET terminal_notu = $2 WHERE id = $1',
    ]) {
      await assert.rejects(ortam!.sahip.sorgu(sql, [surumId, 'değişti']), /değişmez|yalnız taslak/);
    }
    const ac = await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${x.id}/surum-ac`, { surum: x.surum });
    assert.deepEqual(ac.sartname.surumler.map((v) => [v.surumNo, v.durum]), [[2, 'taslak'], [1, 'yururlukte']]);
    await red(c.yonetici, `/rota/sartnameler/${x.id}/surum-ac`, { surum: ac.sartname.surum }, 409, /açık taslağı/);
    const y = await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${x.id}/yayinla`, { surum: ac.sartname.surum });
    assert.deepEqual(y.sartname.surumler.map((v) => [v.surumNo, v.durum]), [[2, 'yururlukte'], [1, 'eski']]);
  });

  test('adım şartnamesi: kapsam adımın kaynağına uyar, sabit alana ve türü tutmayan değere izin yok, rota.yaz ister, yalnız taslakta yazılır', async () => {
    const { id, surum } = await taslak();
    const zn = sartname('KPL-ZN').id;
    assert.equal((await bagla(id, surum, 20, [{ sartnameId: zn, degerler: {} }], c.operator)).statusCode, 403);
    for (const [opNo, sartnameler, ileti] of [
      [10, [{ sartnameId: zn, degerler: {} }], /yalnız fason adıma/],
      [20, [{ sartnameId: zn, degerler: { crvi: false } }], /sabittir/],
      [20, [{ sartnameId: zn, degerler: { beyazPas: 'çok' } }], /sayı olmalı/],
      [20, [{ sartnameId: zn, degerler: { kalinlik: '7 µm' } }], /seçeneklerden biri/],
      [20, [{ sartnameId: zn, degerler: { uydurma: 1 } }], /böyle bir alan yok/],
      [20, [{ sartnameId: zn, degerler: {} }, { sartnameId: zn, degerler: {} }], /iki kez/],
      [30, [{ sartnameId: zn, degerler: {} }], /Adım bu revizyonda yok/],
    ] as const) {
      const r = await bagla(id, surum, opNo, sartnameler as never);
      assert.equal(r.statusCode, 400, r.body);
      assert.match(r.json<{ mesaj: string }>().mesaj, ileti);
    }
    assert.equal((await bagla(id, surum + 1, 20, [{ sartnameId: zn, degerler: {} }])).statusCode, 409, 'eski sürüm');
    const b = await bagla(id, surum, 20, [{ sartnameId: zn, degerler: { kalinlik: '12 µm (Fe/Zn12)', kirmiziPas: 720 } }]);
    assert.equal(b.statusCode, 200, b.body);
    const okunan = await tamam<RevizyonSartnameleriCevabi>(c.operator, 'GET', `/rota/revizyonlar/${id}/sartnameler`);
    assert.deepEqual(okunan.adimlar.map((a) => [a.opNo, a.sartnameler.map((s) => [s.sartname.kod, s.degerler, s.eksikler, s.kapsamUyumsuz])]),
      [[20, [['KPL-ZN', { kalinlik: '12 µm (Fe/Zn12)', kirmiziPas: 720 }, [], false]]]]);
    // İç adım iç ya da ikisi kapsamlı şartname alır.
    const tls = sartname('TLS-GNL');
    assert.ok(tls.kapsam !== 'fason');
    assert.equal((await bagla(id, b.json<KomutCevabi>().surum, 10, [{ sartnameId: tls.id, degerler: {} }])).statusCode, 200);
  });

  test('adımda zorunlu boş alan ve kaynağı değişip kapsamı tutmayan şartname onaya göndermeyi durdurur; adım silinince bağı da gider', async () => {
    const x = await kendiSartnamesi('ic');
    const { id, surum } = await taslak();
    const b = await bagla(id, surum, 10, [{ sartnameId: x.id, degerler: {} }]);
    assert.equal(b.statusCode, 200, b.body);
    const okunan = await tamam<RevizyonSartnameleriCevabi>(c.operator, 'GET', `/rota/revizyonlar/${id}/sartnameler`);
    assert.deepEqual(okunan.adimlar[0]?.sartnameler[0]?.eksikler, ['renk']);
    await red(c.planlama, `/rota/revizyonlar/${id}/onaya-gonder`, { surum: b.json<KomutCevabi>().surum }, 422, new RegExp(`OP 10: ${x.kod} şartnamesinde zorunlu alan boş: renk`));
    const d = await bagla(id, b.json<KomutCevabi>().surum, 10, [{ sartnameId: x.id, degerler: { renk: 'RAL 7035' } }]);
    assert.equal(d.statusCode, 200, d.body);
    // OP 10 fasona dönerse iç şartnamesi kapsam dışında kalır: kayıt geçer, onaya gönderme reddedilir.
    const k = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/kaydet`, {
      surum: d.json<KomutCevabi>().surum, aciklama: null, adimlar: [{ ...fasonAdim({ bilesenler: [{ malzemeId: hammadde, miktar: 1, fireYuzde: 0 }] }), opNo: 10 }, { ...fasonAdim(), opNo: 20 }],
    });
    assert.equal((await tamam<RevizyonSartnameleriCevabi>(c.operator, 'GET', `/rota/revizyonlar/${id}/sartnameler`)).adimlar[0]?.sartnameler[0]?.kapsamUyumsuz, true);
    await red(c.planlama, `/rota/revizyonlar/${id}/onaya-gonder`, { surum: k.surum }, 422, /adımın kaynağına uymuyor/);
    // OP 10 çıkarılınca bağı da silinir; kalan rota onaya gider.
    const s = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/kaydet`, {
      surum: k.surum, aciklama: null, adimlar: [{ ...fasonAdim({ bilesenler: [{ malzemeId: hammadde, miktar: 1, fireYuzde: 0 }] }), opNo: 20 }],
    });
    assert.deepEqual((await tamam<RevizyonSartnameleriCevabi>(c.operator, 'GET', `/rota/revizyonlar/${id}/sartnameler`)).adimlar, []);
    const g = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/onaya-gonder`, { surum: s.surum });
    // Onaya giden revizyonun bağı değişmez.
    assert.equal((await bagla(id, g.surum, 20, [])).statusCode, 409);
  });

  test('kullanımdan kalkan şartname yeni adıma seçilmez ve onaya göndermeyi durdurur; yeniden etkinleşince geçer', async () => {
    const x = await kendiSartnamesi();
    const { id, surum } = await taslak();
    const b = await bagla(id, surum, 10, [{ sartnameId: x.id, degerler: { renk: 'Siyah' } }]);
    assert.equal(b.statusCode, 200, b.body);
    const p = await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${x.id}/pasife-al`, { surum: x.surum });
    await red(c.yonetici, `/rota/sartnameler/${x.id}/pasife-al`, { surum: p.sartname.surum }, 409);
    const yeni = await taslak();
    assert.equal((await bagla(yeni.id, yeni.surum, 10, [{ sartnameId: x.id, degerler: {} }])).statusCode, 400);
    // Önceden bağlı şartname adımda kalır (değeri düzeltilebilir), onaya gitmez.
    const d = await bagla(id, b.json<KomutCevabi>().surum, 10, [{ sartnameId: x.id, degerler: { renk: 'Beyaz' } }]);
    assert.equal(d.statusCode, 200, d.body);
    await red(c.planlama, `/rota/revizyonlar/${id}/onaya-gonder`, { surum: d.json<KomutCevabi>().surum }, 422, /kullanımda değil/);
    await tamam(c.yonetici, 'POST', `/rota/sartnameler/${x.id}/etkinlestir`, { surum: p.sartname.surum });
    assert.equal((await istek(c.planlama, 'POST', `/rota/revizyonlar/${id}/onaya-gonder`, { surum: d.json<KomutCevabi>().surum })).statusCode, 200);
  });

  test('971 a: emir açılınca yürürlükteki sürüm ve çözülmüş değerler iş emrine sabitlenir; sonra yayınlanan sürüm eski emri değiştirmez, yeni emir yeniyi alır', async () => {
    const x = await kendiSartnamesi();
    const zn = sartname('KPL-ZN');
    const { id, surum } = await taslak();
    const b1 = await bagla(id, surum, 10, [{ sartnameId: x.id, degerler: { renk: 'RAL 9005' } }]);
    const b2 = await bagla(id, b1.json<KomutCevabi>().surum, 20, [{ sartnameId: zn.id, degerler: { kalinlik: '12 µm (Fe/Zn12)' } }]);
    assert.equal(b2.statusCode, 200, b2.body);
    await yururlugeAl(id, b2.json<KomutCevabi>().surum);
    const e1 = await emirAc(id);
    const [ie10, ie20] = e1.isEmriIdleri;
    const okunan = await tamam<IsEmriSartnameleriCevabi>(c.operator, 'GET', `/rota/is-emri-sartnameleri?idler=${ie10},${ie20}`);
    const ilk = okunan.isEmirleri.find((i) => i.isEmriId === ie10)!.sartnameler[0]!;
    assert.equal(ilk.surum.surumNo, 1);
    assert.deepEqual(ilk.degerler, { renk: 'RAL 9005', kalinlik: 60, sinif: 'C3' });
    assert.equal(ilk.sabitleyen.ad, 'Deneme planlama');
    const fason = okunan.isEmirleri.find((i) => i.isEmriId === ie20)!.sartnameler[0]!;
    assert.equal(fason.sartname.kod, 'KPL-ZN');
    assert.equal(fason.degerler.kalinlik, '12 µm (Fe/Zn12)');
    assert.equal(fason.degerler.crvi, true, 'sabit alan şablondan gelir');
    assert.ok(fason.surum.atiflar.length > 0 && fason.surum.istenenBelgeler.length > 0);
    // Yeni sürümde sabit sınıf C4 olur: açık emir eski sürümü korur, yeni emir yeni sürümü alır.
    const ac = await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${x.id}/surum-ac`, { surum: x.surum });
    const alanlar = ac.sartname.surumler[0]!.parametreler.map(({ sira: _, ...p }) => (p.anahtar === 'sinif' ? { ...p, varsayilan: 'C4' } : p));
    const k = await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${x.id}/taslak-kaydet`, {
      ...taslakGovdesi(ac.sartname.surum, alanlar), degisiklikNotu: 'Sınıf C4',
    });
    await tamam(c.yonetici, 'POST', `/rota/sartnameler/${x.id}/yayinla`, { surum: k.sartname.surum });
    const eski = await vt().tx((db) => isEmriSartnameleri(db, [ie10!]));
    assert.deepEqual([eski.get(ie10!)?.[0]?.surum.surumNo, eski.get(ie10!)?.[0]?.degerler.sinif], [1, 'C3']);
    const e2 = await emirAc(id);
    const yeni = await vt().tx((db) => isEmriSartnameleri(db, [e2.isEmriIdleri[0]!]));
    assert.deepEqual([yeni.get(e2.isEmriIdleri[0]!)?.[0]?.surum.surumNo, yeni.get(e2.isEmriIdleri[0]!)?.[0]?.degerler.sinif], [2, 'C4']);
    // Sabitleme yalnız eklenir.
    await assert.rejects(ortam!.sahip.sorgu("UPDATE rota_is_emri_sartnamesi SET degerler = '{}' WHERE is_emri_id = $1", [ie10]));
  });

  test('aynı ürünün revizyonundan açılan taslak bağları alır; yürürlükteki rota emre uygulanınca başlamamış iş emri yeni bağı alır', async () => {
    const x = await kendiSartnamesi();
    const { id, surum, urun } = await taslak();
    const b = await bagla(id, surum, 10, [{ sartnameId: x.id, degerler: { renk: 'Kırmızı' } }]);
    await yururlugeAl(id, b.json<KomutCevabi>().surum);
    const emir = await emirAc(id);
    const yeni = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak: { tur: 'revizyon', revizyonId: id } });
    const kopya = await tamam<RevizyonSartnameleriCevabi>(c.operator, 'GET', `/rota/revizyonlar/${yeni.id}/sartnameler`);
    assert.deepEqual(kopya.adimlar.map((a) => [a.opNo, a.sartnameler[0]?.degerler]), [[10, { renk: 'Kırmızı' }]]);
    const d = await bagla(yeni.id, yeni.surum, 10, [{ sartnameId: x.id, degerler: { renk: 'Mavi' } }]);
    await yururlugeAl(yeni.id, d.json<KomutCevabi>().surum);
    await tamam(c.planlama, 'POST', `/rota/emirler/${emir.uretimEmriId}/yururlukteki-rotayi-uygula`, {});
    const e = await vt().tx((db) => adimliEmirAyrintisi(db, emir.uretimEmriId));
    const op10 = e.isEmirleri.find((i) => i.opNo === 10)!;
    const sabit = await vt().tx((db) => isEmriSartnameleri(db, [op10.id]));
    assert.deepEqual(sabit.get(op10.id)?.map((s) => s.degerler.renk), ['Mavi']);
  });

  test('emir açılırken yayınlanmamış ya da zorunlu alanı boş şartname emri durdurur', async () => {
    const x = await kendiSartnamesi();
    const { id, surum } = await taslak();
    const b = await bagla(id, surum, 10, [{ sartnameId: x.id, degerler: { renk: 'Yeşil' } }]);
    await yururlugeAl(id, b.json<KomutCevabi>().surum);
    // Yeni sürümde "sinif" adımda değişir olur ve varsayılanı kalkar: rotadaki adımın değeri yoktur.
    const ac = await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${x.id}/surum-ac`, { surum: x.surum });
    const alanlar = ac.sartname.surumler[0]!.parametreler.map(({ sira: _, ...p }) => (p.anahtar === 'sinif' ? { ...p, varsayilan: null, adimdaDegisir: true } : p));
    const k = await tamam<SartnameCevabi>(c.yonetici, 'POST', `/rota/sartnameler/${x.id}/taslak-kaydet`, taslakGovdesi(ac.sartname.surum, alanlar));
    await tamam(c.yonetici, 'POST', `/rota/sartnameler/${x.id}/yayinla`, { surum: k.sartname.surum });
    const once = (await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n;
    await red(c.planlama, `/rota/revizyonlar/${id}/emre-kopyala`, { projeId, adet: 2, teslim: null }, 422, /zorunlu alan boş \(sinif\); emir açılamaz/);
    assert.equal((await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n, once, 'emir geri alınır');
  });

  test('standart atfı eklenir; aynı numara ikinci kez eklenmez', async () => {
    const s = await tamam<{ standart: { id: number; numara: string } }>(c.yonetici, 'POST', '/rota/standartlar/ekle', { numara: 'DENEME 100', kisaAciklama: 'Deneme standardı' });
    assert.equal(s.standart.numara, 'DENEME 100');
    await red(c.yonetici, '/rota/standartlar/ekle', { numara: 'DENEME 100', kisaAciklama: 'Yine' }, 409);
  });

  /* ---------------- adım adım talimat ve talimat şablonu (989 a, 993 a) ---------------- */

  const adim = (p: Partial<TalimatAdimiGirdisi> = {}): TalimatAdimiGirdisi => ({ baslik: 'Parçayı bağla', metin: null, kontrol: { tur: 'yok' }, zorunlu: false, medya: [], ...p });

  test('varsayılan talimat şablonları göçle gelir; şablonun adımları ve şartnamesi okunur', async () => {
    const l = await tamam<TalimatSablonlariCevabi>(c.operator, 'GET', '/rota/talimat-sablonlari');
    assert.deepEqual(l.sablonlar.map((x) => x.kod), ['TS-AST', 'TS-BYA', 'TS-CMM', 'TS-CNC', 'TS-FSN', 'TS-MON', 'TS-MRK', 'TS-TES', 'TS-TKR']);
    assert.equal(l.sablonlar.reduce((t, x) => t + x.adimSayisi, 0), 38);
    const ast = l.sablonlar.find((x) => x.kod === 'TS-AST')!;
    assert.equal(ast.sartname?.kod, 'AST-EPX');
    const a = await tamam<TalimatSablonuCevabi>(c.operator, 'GET', `/rota/talimat-sablonlari/${ast.id}`);
    assert.deepEqual(a.sablon.adimlar[2]?.kontrol, { tur: 'olcum', ad: 'Ortam sıcaklığı', alt: 10, ust: 35, birim: '°C' });
    assert.equal(a.sablon.adimlar[2]?.zorunlu, true);
  });

  test('adımlı talimat yeni sürümdür: metni başlıklardır, eski düz sürüm tek adım okunur, kontrol listesi adımlardan kurulur', async () => {
    const t = await taslak();
    const yaz = (cerez: string, okunanSurum: number | null, adimlar: TalimatAdimiGirdisi[], opNo = 10) =>
      istek(cerez, 'POST', `/rota/urunler/${t.urun}/talimat-adimli-yaz`, { opNo, okunanSurum, adimlar });
    assert.equal((await yaz(c.operator, null, [adim()])).statusCode, 403);
    await tamam(c.planlama, 'POST', `/rota/urunler/${t.urun}/talimat-yaz`, { opNo: 10, metin: 'Eski talimat\nİkinci satır', okunanSurum: null });
    const adimlar = [
      adim({ baslik: 'Programı doğrula', kontrol: { tur: 'onay' }, zorunlu: true }),
      adim({ baslik: 'İlk parçayı ölç', metin: 'Kritik ölçü ölçüm planından.', kontrol: { tur: 'olcum', ad: 'Çap', alt: 11.95, ust: 12.05, birim: 'mm' }, zorunlu: true }),
      adim({ baslik: 'Rengi karşılaştır', kontrol: { tur: 'secim', secenekler: ['Uygun', 'Uygun değil'] } }),
      adim({ baslik: 'Kutula', kontrol: { tur: 'foto', aciklama: 'Kutulanmış parça' } }),
    ];
    assert.equal((await yaz(c.planlama, null, adimlar)).statusCode, 409);
    const cevap = await yaz(c.planlama, 1, adimlar);
    assert.equal(cevap.statusCode, 200, cevap.body);
    const l = cevap.json<TalimatlarCevabi>();
    assert.deepEqual(l.surumler.map((x) => [x.surum, x.adimli, x.adimlar.length]), [[2, true, 4], [1, false, 1]]);
    assert.equal(l.surumler[0]?.metin, 'Programı doğrula\nİlk parçayı ölç\nRengi karşılaştır\nKutula');
    assert.deepEqual(l.surumler[1]?.adimlar[0], { sira: 1, baslik: 'Eski talimat', metin: 'Eski talimat\nİkinci satır', kontrol: { tur: 'yok' }, zorunlu: false, medya: [] });
    assert.deepEqual(l.surumler[0]?.adimlar[1]?.kontrol, { tur: 'olcum', ad: 'Çap', alt: 11.95, ust: 12.05, birim: 'mm' });

    await yururlugeAl(t.id, t.surum);
    const emir = await emirAc(t.id);
    const liste = await vt().tx((db) => db.sorgu<{ ad: string; aciklama: string | null }>(
      'SELECT ad, aciklama FROM emir_adimi WHERE is_emri_id = $1 ORDER BY sira', [emir.isEmriIdleri[0]]));
    assert.deepEqual(liste.map((x) => [x.ad, x.aciklama]), [
      ['Programı doğrula', null], ['İlk parçayı ölç', 'Kritik ölçü ölçüm planından.'], ['Rengi karşılaştır', null], ['Kutula', null],
    ]);
    const okunan = await vt().tx((db) => talimatSurumuAdimlari(db, t.urun, 10, 2));
    assert.equal(okunan?.[0]?.zorunlu, true);
    assert.equal((await vt().tx((db) => talimatSurumuAdimlari(db, t.urun, 10, 1)))?.length, 1);
    assert.equal(await vt().tx((db) => talimatSurumuAdimlari(db, t.urun, 10, 9)), null);
  });

  test('adımlı talimat kuralları: zorunlu adım kontrol noktası ister, ölçüm sınırı ters olamaz, seçenekler tekil, sürüm yalnız eklenir', async () => {
    const t = await taslak();
    const url = `/rota/urunler/${t.urun}/talimat-adimli-yaz`;
    await red(c.planlama, url, { opNo: 10, okunanSurum: null, adimlar: [adim({ zorunlu: true })] }, 400, /zorunlu olamaz/);
    await red(c.planlama, url, { opNo: 10, okunanSurum: null, adimlar: [adim({ kontrol: { tur: 'olcum', ad: 'Çap', alt: 2, ust: 1, birim: 'mm' } })] }, 400, /alt sınırı/);
    await red(c.planlama, url, { opNo: 10, okunanSurum: null, adimlar: [adim({ kontrol: { tur: 'secim', secenekler: ['Var', 'var'] } })] }, 400, /farklı/);
    await red(c.planlama, url, { opNo: 10, okunanSurum: null, adimlar: [] }, 400);
    await red(c.planlama, url, { opNo: 10, okunanSurum: null, adimlar: Array.from({ length: 31 }, () => adim()) }, 400);
    await red(c.planlama, url, { opNo: 90, okunanSurum: null, adimlar: [adim()] }, 400, /OP 90/);
    await tamam(c.planlama, 'POST', url, { opNo: 10, okunanSurum: null, adimlar: [adim()] });
    await assert.rejects(vt().tx((db) => db.sorgu("UPDATE rota_talimat_adimi SET baslik = 'Değişti'")));
  });

  test('talimat şablonu yazılır, kaydedilir ve pasife alınır; kod tekil, sürüm denetlenir, operatör yazamaz', async () => {
    const govde = { kod: 'ts-deneme', ad: 'Deneme şablon', sartnameId: null, adimlar: [adim({ baslik: 'Birinci' })] };
    await red(c.operator, '/rota/talimat-sablonlari/ekle', govde, 403);
    const e = await tamam<TalimatSablonuCevabi>(c.planlama, 'POST', '/rota/talimat-sablonlari/ekle', govde);
    assert.equal(e.sablon.kod, 'TS-DENEME');
    await red(c.planlama, '/rota/talimat-sablonlari/ekle', govde, 409, /kod/);
    await red(c.planlama, '/rota/talimat-sablonlari/ekle', { ...govde, kod: 'TS-DENEME-2', sartnameId: 999999 }, 400, /şartname/i);
    const k = await tamam<TalimatSablonuCevabi>(c.planlama, 'POST', `/rota/talimat-sablonlari/${e.sablon.id}/kaydet`, {
      surum: e.sablon.surum, ad: 'Deneme şablon 2', sartnameId: sartname('TLS-GNL').id, adimlar: [adim({ baslik: 'Bir' }), adim({ baslik: 'İki', kontrol: { tur: 'onay' }, zorunlu: true })],
    });
    assert.deepEqual([k.sablon.ad, k.sablon.sartname?.kod, k.sablon.adimlar.map((x) => x.baslik)], ['Deneme şablon 2', 'TLS-GNL', ['Bir', 'İki']]);
    await red(c.planlama, `/rota/talimat-sablonlari/${e.sablon.id}/kaydet`, { surum: e.sablon.surum, ad: 'Eski', sartnameId: null, adimlar: [adim()] }, 409);
    const p = await tamam<TalimatSablonuCevabi>(c.planlama, 'POST', `/rota/talimat-sablonlari/${e.sablon.id}/durum`, { surum: k.sablon.surum, aktif: false });
    assert.equal(p.sablon.aktif, false);
  });
  // Sentetik PNG: imza ve rastgele gövde (tür ilk baytlardan bulunur).
  async function resimYukle(cerez: string, ek = randomUUID()): Promise<string> {
    const icerik = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(ek)]);
    const ozet = createHash('sha256').update(icerik).digest('hex');
    await tamam(cerez, 'POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
    return ozet;
  }

  test('adım medyası: yükleyen bağlar, bağlı dosya yeniden yüklenmeden kullanılır, oturumla okunur; yüklemeyen bağlayamaz, PDF eklenmez', async () => {
    const t = await taslak();
    const url = `/rota/urunler/${t.urun}/talimat-adimli-yaz`;
    const ozet = await resimYukle(c.planlama);
    await red(c.yonetici, url, { opNo: 10, okunanSurum: null, adimlar: [adim({ medya: [{ ozet, ad: 'bağlama.png' }] })] }, 400, /yüklenmemiş/i);
    await red(c.planlama, url, { opNo: 10, okunanSurum: null, adimlar: [adim({ medya: [{ ozet, ad: 'a.png' }, { ozet, ad: 'b.png' }] })] }, 400, /iki kez/);
    const l = await tamam<TalimatlarCevabi>(c.planlama, 'POST', url, { opNo: 10, okunanSurum: null, adimlar: [adim({ medya: [{ ozet, ad: 'bağlama.png' }] })] });
    assert.deepEqual(l.surumler[0]?.adimlar[0]?.medya.map((m) => [m.ozet, m.ad, m.tur]), [[ozet, 'bağlama.png', 'resim']]);
    // Dosyayı yüklemeyen yönetici, rotada bağlı dosyayı yeni sürümde kullanabilir (şablondan kopya gibi).
    const iki = await tamam<TalimatlarCevabi>(c.yonetici, 'POST', url, { opNo: 10, okunanSurum: 1, adimlar: [adim({ medya: [{ ozet, ad: 'yeni ad.png' }] })] });
    assert.equal(iki.surumler[0]?.adimlar[0]?.medya[0]?.ad, 'yeni ad.png');
    const oku = await istek(c.operator, 'GET', `/rota/talimat-medyasi/${ozet}`);
    assert.equal(oku.statusCode, 200);
    assert.equal(oku.headers['content-type'], 'image/png');
    assert.equal((await istek(c.operator, 'GET', `/rota/talimat-medyasi/${'0'.repeat(64)}`)).statusCode, 404);
    const pdf = Buffer.from(`%PDF-1.4 ${randomUUID()}`);
    const pdfOzeti = createHash('sha256').update(pdf).digest('hex');
    await tamam(c.planlama, 'POST', `/dosyalar/${pdfOzeti}/parca`, { sira: 0, toplam: 1, veri: pdf.toString('base64') });
    await red(c.planlama, url, { opNo: 10, okunanSurum: 2, adimlar: [adim({ medya: [{ ozet: pdfOzeti, ad: 'belge.pdf' }] })] }, 400, /türde/);
  });

  test('şablon medyası kopyalanır; şablondan çıkan ve başka yerde kullanılmayan dosyanın bağı kalkar', async () => {
    const ozet = await resimYukle(c.planlama);
    const e = await tamam<TalimatSablonuCevabi>(c.planlama, 'POST', '/rota/talimat-sablonlari/ekle', {
      kod: 'TS-MEDYA', ad: 'Medyalı şablon', sartnameId: null, adimlar: [adim({ baslik: 'Bak', medya: [{ ozet, ad: 'örnek.png' }] })],
    });
    assert.equal(e.sablon.adimlar[0]?.medya[0]?.ozet, ozet);
    assert.equal((await istek(c.operator, 'GET', `/rota/talimat-medyasi/${ozet}`)).statusCode, 200);
    await tamam(c.planlama, 'POST', `/rota/talimat-sablonlari/${e.sablon.id}/kaydet`, { surum: e.sablon.surum, ad: 'Medyasız', sartnameId: null, adimlar: [adim()] });
    assert.equal((await istek(c.operator, 'GET', `/rota/talimat-medyasi/${ozet}`)).statusCode, 404);
  });
});
