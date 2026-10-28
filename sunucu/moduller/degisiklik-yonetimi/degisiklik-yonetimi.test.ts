import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { DEGISIKLIK_YONETIMI_ISLEMLERI } from '#paylasilan/islemler/degisiklik-yonetimi.ts';
import { IMZA_ANLAMLARI } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import type {
  EmirCevabi, EmirListeCevabi, GorevlerimCevabi, IzlenebilirlikCevabi, KonfigurasyonCevabi, OlayListeCevabi, ParcaAdaylariCevabi, RaporCevabi,
  SeriListeCevabi, SonUrunlerCevabi, TalepCevabi, TalepListeCevabi,
} from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import type { RollerCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { yayinla } from './servis.ts';
import type { EtkiCozucusu } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const K = '/degisiklik-yonetimi';

// Aşama 1'de işlemler yalnız yöneticidedir; görevler ayrılığı (DY-3) iki yöneticiyle sınanır. Tek işlemli roller uç başına yetkiyi sınar.
describe('degisiklik-yonetimi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let acan = '';
  let onaylayan = '';
  let acanId = 0;
  let onaylayanId = 0;
  let yoneticiRolu = 0;
  let operator = '';
  const tekIslemli = new Map<Islem, string>();
  let mil = 0;
  let flans = 0;
  let cubuk = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisYap(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  const yoneticiAc = (kullaniciAdi: string): Promise<number> =>
    vt().tx((db) => yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }));
  async function kisiEkle(kullaniciAdi: string, rolId: number): Promise<string> {
    const id = await yoneticiAc(kullaniciAdi);
    await vt().tx(async (db) => {
      await rolAta(db, acanId, id, rolId);
      await rolAl(db, acanId, id, yoneticiRolu);
    });
    return girisYap(kullaniciAdi);
  }

  const cagir = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, istekKimligi: string = randomUUID()) =>
    app.inject({
      method: yontem,
      url: `/api${url}`,
      headers: { cookie: cerez, ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: istekKimligi } : {}) },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  async function tamam<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const c = await cagir(cerez, yontem, url, payload);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json<T>();
  }
  async function kod(cerez: string, url: string, payload: unknown, beklenen: number, ileti?: RegExp): Promise<void> {
    const c = await cagir(cerez, 'POST', url, payload);
    assert.equal(c.statusCode, beklenen, `${url}: ${c.body}`);
    if (ileti) assert.match(c.json<{ mesaj: string }>().mesaj, ileti);
  }

  const talepAc = (ek: Record<string, unknown> = {}, cerez = acan) =>
    tamam<TalepCevabi>(cerez, 'POST', `${K}/talepler/ac`, { baslik: 'Delik çapı değişikliği', aciliyet: 'normal', malzemeIdleri: [mil], ...ek });
  const cevaplar = { cizim: 'evet', fff: 'evet', proses: null, sure: null };

  // Talebi CCB'den geçirip emir açar; D1'de müşteri onayı da kaydedilir.
  async function emreKadar(sinif: 'D1' | 'D2' | 'P1' | 'P2', malzemeIdleri = [mil]): Promise<EmirCevabi> {
    let t = await talepAc({ malzemeIdleri });
    const c = sinif[0] === 'D'
      ? { cizim: 'evet', fff: sinif === 'D1' ? 'evet' : 'hayir', proses: null, sure: null }
      : { cizim: 'hayir', fff: null, proses: sinif === 'P1' ? 'evet' : 'hayir', sure: sinif === 'P2' ? 'hayir' : null };
    t = await tamam(acan, 'POST', `${K}/talepler/${t.id}/siniflandir`, { sinif, aciliyet: 'yuksek', cevaplar: c, surum: t.surum });
    t = await tamam(acan, 'POST', `${K}/talepler/${t.id}/etki-analizi`, { surum: t.surum });
    t = await tamam(onaylayan, 'POST', `${K}/talepler/${t.id}/ccb`, { karar: 'onay', surum: t.surum });
    if (t.durum === 'musteri_onayi_bekliyor') t = await tamam(onaylayan, 'POST', `${K}/talepler/${t.id}/musteri-onayi`, { referans: 'ONAY-1', surum: t.surum });
    return tamam<EmirCevabi>(acan, 'POST', `${K}/talepler/${t.id}/emir-ac`, { surum: t.surum });
  }

  // Emri taslaktan yayına hazır hale getirir.
  async function yayinaHazir(e: EmirCevabi, kalem: Record<string, unknown> = {}): Promise<EmirCevabi> {
    let x = await tamam<EmirCevabi>(acan, 'POST', `${K}/emirler/${e.id}/taslak-ac`, { surum: e.surum });
    const proses = x.sinif === 'P1' || x.sinif === 'P2';
    for (const k of x.kalemler) {
      x = await tamam(acan, 'POST', `${K}/emirler/${e.id}/kalem-kaydet`, {
        kalemId: k.id, yeniCizimRevizyonuId: null, yeniRotaRevizyonuId: 41, eskiYeniyeUyar: proses ? null : 'evet',
        yeniEskiyeUyar: proses ? null : 'evet', ozet: 'Ø12 delik Ø12,5 oldu', surum: x.surum, ...kalem,
      });
    }
    return tamam(acan, 'POST', `${K}/emirler/${e.id}/yayina-gonder`, { surum: x.surum });
  }

  before(async () => {
    ortam = await testVeritabaniKur('degisiklik_yonetimi');
    const hepsi = await modulOrnekVerileriniKesfet();
    const gerekli = new Set<string>();
    const ekle = (ad: string): void => {
      const t = hepsi.find((x) => x.modul === ad);
      if (!t || gerekli.has(ad)) return;
      gerekli.add(ad);
      for (const g of t.gerekir) ekle(g);
    };
    ekle('malzemeler');
    await ornekVeriYukle(ortam.vt, hepsi.filter((t) => gerekli.has(t.modul)), { ortam: 'test', bildir: () => undefined });
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    acanId = await yoneticiAc('dy-acan');
    acan = await girisYap('dy-acan');
    onaylayanId = await yoneticiAc('dy-onaylayan');
    onaylayan = await girisYap('dy-onaylayan');
    const roller = (await cagir(acan, 'GET', '/roller')).json<RollerCevabi>().roller;
    yoneticiRolu = roller.find((r) => r.yonetici === true)?.id ?? 0;
    operator = await kisiEkle('dy-operator', roller.find((r) => r.ad === 'Operatör')?.id ?? 0);
    for (const islem of DEGISIKLIK_YONETIMI_ISLEMLERI) {
      const kisa = islem.slice('degisiklik-yonetimi.'.length);
      const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`test_dy_${kisa.replaceAll('-', '_')}`, `Test ${kisa}`]);
      await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
      tekIslemli.set(islem, await kisiEkle(`dy-${kisa}`, rol?.id ?? 0));
    }
    await vt().tx(async (db) => {
      mil = (await ornekMalzemeNo(db, 'mil')) ?? 0;
      flans = (await ornekMalzemeNo(db, 'flans')) ?? 0;
      cubuk = (await ornekMalzemeNo(db, 'cubuk')) ?? 0;
    });
    assert.ok(mil > 0 && flans > 0 && cubuk > 0);
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('yetki: oturumsuz 401, işlemsiz 403; her komut yalnız kendi işlemiyle geçer; okuma işlemlerden biriyle açılır', async () => {
    const komutlar: [string, Islem][] = [
      ['/talepler/ac', 'degisiklik-yonetimi.talep-ac'], ['/talepler/999999/siniflandir', 'degisiklik-yonetimi.siniflandir'],
      ['/talepler/999999/etki-analizi', 'degisiklik-yonetimi.siniflandir'], ['/talepler/999999/ccb', 'degisiklik-yonetimi.ccb-karar'],
      ['/talepler/999999/musteri-onayi', 'degisiklik-yonetimi.musteri-onayi'], ['/talepler/999999/emir-ac', 'degisiklik-yonetimi.emir-ac'],
      ['/emirler/999999/taslak-ac', 'degisiklik-yonetimi.revizyon-hazirla'], ['/emirler/999999/kalem-kaydet', 'degisiklik-yonetimi.revizyon-hazirla'],
      ['/emirler/999999/yayina-gonder', 'degisiklik-yonetimi.revizyon-hazirla'], ['/emirler/999999/geri-gonder', 'degisiklik-yonetimi.yayinla'],
      ['/emirler/999999/yayinla', 'degisiklik-yonetimi.yayinla'], ['/emirler/999999/karar', 'degisiklik-yonetimi.karar-ver'],
      ['/emirler/999999/toplu-karar', 'degisiklik-yonetimi.karar-ver'], ['/emirler/999999/mrb-karar', 'degisiklik-yonetimi.mrb-karar'],
      ['/emirler/999999/fai-onayla', 'degisiklik-yonetimi.fai-onayla'], ['/emirler/999999/kapat', 'degisiklik-yonetimi.kapat'],
    ];
    for (const [yol, islem] of komutlar) {
      const url = `${K}${yol}`;
      assert.equal((await app.inject({ method: 'POST', url: `/api${url}`, payload: {} })).statusCode, 401, url);
      assert.equal((await cagir(operator, 'POST', url, {})).statusCode, 403, `operatör ${url}`);
      for (const [sahip, cerez] of tekIslemli) {
        const durum = (await cagir(cerez, 'POST', url, {})).statusCode;
        if (sahip === islem) assert.notEqual(durum, 403, `${sahip} ${url}`);
        else assert.equal(durum, 403, `${sahip} ${url}`);
      }
    }
    const okumalar = ['/gorevlerim', '/talepler', '/emirler', '/son-urunler', '/seriler', `/konfigurasyon/${mil}`, `/izlenebilirlik?sonUrunMalzemeId=${mil}&seriNo=1`, '/raporlar', '/olaylar'];
    for (const yol of okumalar) {
      assert.equal((await app.inject({ method: 'GET', url: `/api${K}${yol}` })).statusCode, 401, yol);
      assert.equal((await cagir(operator, 'GET', `${K}${yol}`)).statusCode, 403, `operatör ${yol}`);
      for (const [islem, cerez] of tekIslemli) assert.equal((await cagir(cerez, 'GET', `${K}${yol}`)).statusCode, 200, `${islem} ${yol}`);
    }
    // Parça adayları yalnız talep açana.
    assert.equal((await cagir(tekIslemli.get('degisiklik-yonetimi.talep-ac') ?? '', 'GET', `${K}/parca-adaylari`)).statusCode, 200);
    assert.equal((await cagir(tekIslemli.get('degisiklik-yonetimi.kapat') ?? '', 'GET', `${K}/parca-adaylari`)).statusCode, 403);
  });

  test('DY-20: talep yalnız aktif mamul ya da yarı mamul kartına açılır; kişi ve zaman sunucudan; aynı istek kimliği ikinci talep açmaz', async () => {
    await kod(acan, `${K}/talepler/ac`, { baslik: 'x', aciliyet: 'normal', malzemeIdleri: [cubuk] }, 400, /mamul/);
    await kod(acan, `${K}/talepler/ac`, { baslik: 'x', aciliyet: 'normal', malzemeIdleri: [2147480000] }, 400, /bulunamadı/);
    await kod(acan, `${K}/talepler/ac`, { baslik: 'x', aciliyet: 'normal', malzemeIdleri: [] }, 400);
    const t = await talepAc({ malzemeIdleri: [mil, flans], onSinif: 'D2', aciklama: '  ' });
    assert.equal(t.durum, 'gonderildi');
    assert.equal(t.acan.kisiId, acanId);
    assert.equal(t.aciklama, null);
    assert.deepEqual(t.malzemeler.map((m) => m.malzemeId), [mil, flans]);
    assert.ok(t.malzemeler.every((m) => m.kod !== null && m.cizimRevizyonu === null));
    assert.equal(t.gecmis[0]?.olay, 'talep_gonderildi');
    const kimlik = randomUUID();
    const govde = { baslik: 'Tekrar', aciliyet: 'acil', malzemeIdleri: [mil] };
    const ilk = await cagir(acan, 'POST', `${K}/talepler/ac`, govde, kimlik);
    const ikinci = await cagir(acan, 'POST', `${K}/talepler/ac`, govde, kimlik);
    assert.equal(ilk.statusCode, 200);
    assert.equal(ikinci.json<TalepCevabi>().id, ilk.json<TalepCevabi>().id);
    assert.equal((await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM degisiklik_yonetimi_talep WHERE baslik = 'Tekrar'"))?.n, 1);
  });

  test('DY-1, DY-2: sınıflandırma; süre değişikliği talep sayılmaz; adım sırası ve eski sürüm', async () => {
    const t = await talepAc();
    await kod(acan, `${K}/talepler/${t.id}/etki-analizi`, { surum: t.surum }, 409, /aşamada/);
    await kod(acan, `${K}/talepler/${t.id}/siniflandir`, {
      sinif: 'P2', aciliyet: 'normal', cevaplar: { cizim: 'hayir', fff: null, proses: 'hayir', sure: 'evet' }, surum: t.surum,
    }, 400, /planlama parametresi/);
    const s = await tamam<TalepCevabi>(acan, 'POST', `${K}/talepler/${t.id}/siniflandir`, { sinif: 'D1', aciliyet: 'acil', cevaplar, not: 'Müşteri isteği', surum: t.surum });
    assert.deepEqual([s.durum, s.sinif, s.aciliyet, s.surum], ['analizde', 'D1', 'acil', t.surum + 1]);
    assert.equal(s.gecmis.at(-1)?.aciklama, 'Müşteri isteği');
    await kod(acan, `${K}/talepler/${t.id}/siniflandir`, { sinif: 'D1', aciliyet: 'acil', cevaplar, surum: t.surum }, 409);
    const e = await tamam<TalepCevabi>(acan, 'POST', `${K}/talepler/${t.id}/etki-analizi`, { surum: s.surum });
    assert.equal(e.durum, 'ccb_bekliyor');
    assert.equal(e.etki?.fai, 'tam_ve_kismi');
    assert.equal(e.etki?.emirler, null);
    await kod(acan, `${K}/talepler/${t.id}/emir-ac`, { surum: e.surum }, 409);
  });

  test('DY-3, DY-5: açan kendi talebine CCB veremez; D1 onayı müşteri onayına gider; ret talebi kapatır', async () => {
    let t = await talepAc();
    t = await tamam(acan, 'POST', `${K}/talepler/${t.id}/siniflandir`, { sinif: 'D1', aciliyet: 'normal', cevaplar, surum: t.surum });
    t = await tamam(acan, 'POST', `${K}/talepler/${t.id}/etki-analizi`, { surum: t.surum });
    await kod(acan, `${K}/talepler/${t.id}/ccb`, { karar: 'onay', surum: t.surum }, 403, /Görevler ayrılığı/);
    const onay = await tamam<TalepCevabi>(onaylayan, 'POST', `${K}/talepler/${t.id}/ccb`, { karar: 'onay', aciklama: 'Uygun', surum: t.surum });
    assert.equal(onay.durum, 'musteri_onayi_bekliyor');
    const imzali = onay.gecmis.at(-1);
    assert.deepEqual([imzali?.olay, imzali?.kisiId, imzali?.imzaAnlami], ['ccb_onay', onaylayanId, IMZA_ANLAMLARI.ccb_onay]);
    await kod(onaylayan, `${K}/talepler/${t.id}/musteri-onayi`, { referans: ' ', surum: onay.surum }, 400);
    const m = await tamam<TalepCevabi>(onaylayan, 'POST', `${K}/talepler/${t.id}/musteri-onayi`, { referans: 'MUS-77', surum: onay.surum });
    assert.deepEqual([m.durum, m.musteriReferansi], ['onaylandi', 'MUS-77']);

    let p = await talepAc();
    p = await tamam(acan, 'POST', `${K}/talepler/${p.id}/siniflandir`, { sinif: 'P2', aciliyet: 'normal', cevaplar: { cizim: 'hayir', fff: null, proses: 'hayir', sure: 'hayir' }, surum: p.surum });
    p = await tamam(acan, 'POST', `${K}/talepler/${p.id}/etki-analizi`, { surum: p.surum });
    const ret = await tamam<TalepCevabi>(onaylayan, 'POST', `${K}/talepler/${p.id}/ccb`, { karar: 'ret', surum: p.surum });
    assert.equal(ret.durum, 'reddedildi');
    assert.equal(ret.gecmis.at(-1)?.imzaAnlami, IMZA_ANLAMLARI.ccb_ret);
    await kod(acan, `${K}/talepler/${p.id}/emir-ac`, { surum: ret.surum }, 409);
    // D2 onayı doğrudan onaylanır.
    let d2 = await talepAc();
    d2 = await tamam(acan, 'POST', `${K}/talepler/${d2.id}/siniflandir`, { sinif: 'D2', aciliyet: 'normal', cevaplar: { ...cevaplar, fff: 'hayir' }, surum: d2.surum });
    d2 = await tamam(acan, 'POST', `${K}/talepler/${d2.id}/etki-analizi`, { surum: d2.surum });
    assert.equal((await tamam<TalepCevabi>(onaylayan, 'POST', `${K}/talepler/${d2.id}/ccb`, { karar: 'onay', surum: d2.surum })).durum, 'onaylandi');
  });

  test('D1 akışı: emir, taslak, DY-6/DY-7 yayın denetimi, geri gönderme, yayın, DY-8 ilk parça, DY-14 ilerleme, DY-15 kapanış', async () => {
    const e = await emreKadar('D1', [mil, flans]);
    assert.deepEqual([e.durum, e.kalemler.length, e.musteriReferansi, e.koordinator.kisiId], ['acik', 2, 'ONAY-1', acanId]);
    const t = await tamam<TalepCevabi>(acan, 'GET', `${K}/talepler/${e.talep?.id ?? 0}`);
    assert.deepEqual([t.durum, t.emirId], ['emir_acildi', e.id]);
    await kod(acan, `${K}/emirler/${e.id}/yayina-gonder`, { surum: e.surum }, 409);
    let x = await tamam<EmirCevabi>(acan, 'POST', `${K}/emirler/${e.id}/taslak-ac`, { surum: e.surum });
    const [k1, k2] = x.kalemler;
    assert.ok(k1 && k2);
    x = await tamam(acan, 'POST', `${K}/emirler/${e.id}/kalem-kaydet`, {
      kalemId: k1.id, yeniCizimRevizyonuId: 11, yeniRotaRevizyonuId: 21, eskiYeniyeUyar: 'hayir', yeniEskiyeUyar: 'evet', ozet: 'Yeni flanş deseni', surum: x.surum,
    });
    assert.equal(x.kalemler[0]?.yeniParcaNoGerekir, true);
    assert.deepEqual(x.kalemler[0]?.yeniRotaRevizyonu, { id: 21, etiket: null });
    x = await tamam(acan, 'POST', `${K}/emirler/${e.id}/kalem-kaydet`, {
      kalemId: k2.id, yeniCizimRevizyonuId: 12, yeniRotaRevizyonuId: null, eskiYeniyeUyar: 'evet', yeniEskiyeUyar: 'evet', ozet: 'Pah eklendi', surum: x.surum,
    });
    await kod(acan, `${K}/emirler/${e.id}/kalem-kaydet`, { kalemId: 2147480000, yeniCizimRevizyonuId: null, yeniRotaRevizyonuId: null, eskiYeniyeUyar: null, yeniEskiyeUyar: null, surum: x.surum }, 404);
    await kod(acan, `${K}/emirler/${e.id}/yayina-gonder`, { surum: x.surum }, 400, /yeni parça numarası/);
    x = await tamam(acan, 'POST', `${K}/emirler/${e.id}/kalem-kaydet`, {
      kalemId: k1.id, yeniCizimRevizyonuId: 11, yeniRotaRevizyonuId: 21, eskiYeniyeUyar: 'hayir', yeniEskiyeUyar: 'evet', yeniParcaNo: 'YENI-PARCA-1',
      yeniParcaAdi: 'Yeni flanş', ozet: 'Yeni flanş deseni', surum: x.surum,
    });
    x = await tamam(acan, 'POST', `${K}/emirler/${e.id}/yayina-gonder`, { surum: x.surum });
    assert.equal(x.durum, 'yayina_hazir');
    await kod(onaylayan, `${K}/emirler/${e.id}/geri-gonder`, { aciklama: ' ', surum: x.surum }, 400);
    x = await tamam(onaylayan, 'POST', `${K}/emirler/${e.id}/geri-gonder`, { aciklama: 'Özet eksik', surum: x.surum });
    assert.equal(x.durum, 'revizyon_hazirlaniyor');
    x = await tamam(acan, 'POST', `${K}/emirler/${e.id}/yayina-gonder`, { surum: x.surum });
    await kod(onaylayan, `${K}/emirler/${e.id}/yayinla`, { gecerlilik: { tur: 'seri', sonUrunMalzemeId: 2147480000, ilkSeri: 120 }, surum: x.surum }, 400, /Son ürün/);
    x = await tamam(onaylayan, 'POST', `${K}/emirler/${e.id}/yayinla`, { gecerlilik: { tur: 'seri', sonUrunMalzemeId: mil, ilkSeri: 120 }, surum: x.surum });
    // Etki kaynağı bağlı değil: karar yok, ilk parça şartları bekler.
    assert.equal(x.durum, 'uygulamada');
    assert.deepEqual(x.gecerlilik?.tur === 'seri' ? [x.gecerlilik.sonUrun.malzemeId, x.gecerlilik.ilkSeri] : null, [mil, 120]);
    assert.deepEqual(x.fai.map((f) => [f.kalemId, f.tur, f.durum, f.kanitVar]), [[k1.id, 'tam', 'bekliyor', null], [k2.id, 'kismi', 'bekliyor', null]]);
    assert.equal(x.kararlar.length, 0);
    assert.equal(x.kapanisKosullari.find((k) => k.kosul === 'kararlar')?.durum, 'bilinmiyor');
    assert.equal(x.kapanisKosullari.find((k) => k.kosul === 'fai')?.durum, 'eksik');
    assert.equal(x.gecmis.find((g) => g.olay === 'yayinlandi')?.imzaAnlami, IMZA_ANLAMLARI.yayinlandi);
    await kod(onaylayan, `${K}/emirler/${e.id}/kapat`, { surum: x.surum }, 409);
    const [f1, f2] = x.fai;
    assert.ok(f1 && f2);
    x = await tamam(onaylayan, 'POST', `${K}/emirler/${e.id}/fai-onayla`, { faiId: f1.id, surum: x.surum });
    await kod(onaylayan, `${K}/emirler/${e.id}/fai-onayla`, { faiId: f1.id, surum: x.surum }, 409, /zaten onaylı/);
    assert.equal(x.durum, 'uygulamada');
    x = await tamam(onaylayan, 'POST', `${K}/emirler/${e.id}/fai-onayla`, { faiId: f2.id, surum: x.surum });
    assert.equal(x.durum, 'dogrulama');
    assert.equal(x.fai[1]?.onaylayan?.kisiId, onaylayanId);
    x = await tamam(onaylayan, 'POST', `${K}/emirler/${e.id}/kapat`, { aciklama: 'Doğrulandı', surum: x.surum });
    assert.equal(x.durum, 'kapandi');
    assert.match(x.kapanis ?? '', /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(x.gecmis.map((g) => g.olay), [
      'emir_acildi', 'taslak_acildi', 'kalem_kaydedildi', 'kalem_kaydedildi', 'kalem_kaydedildi', 'yayina_gonderildi', 'geri_gonderildi',
      'yayina_gonderildi', 'yayinlandi', 'fai_onaylandi', 'fai_onaylandi', 'fai_tamam', 'kapandi',
    ]);
    const olaylar = await tamam<OlayListeCevabi>(acan, 'GET', `${K}/olaylar?ilgili=rota`);
    assert.ok(olaylar.satirlar.some((o) => o.kayitNo === x.no && o.tur === 'revizyon_yayinlandi' && o.alanlar.yeniParcaNo === 'YENI-PARCA-1'));
    // 1175 a: arama kayıt numarasında ve veri alanlarının değerlerinde; joker karakter düz metindir.
    const noIle = await tamam<OlayListeCevabi>(acan, 'GET', `${K}/olaylar?ara=${x.no}`);
    assert.ok(noIle.satirlar.length > 0 && noIle.satirlar.every((o) => o.kayitNo === x.no));
    const alanIle = await tamam<OlayListeCevabi>(acan, 'GET', `${K}/olaylar?ara=yeni-parca-1`);
    assert.ok(alanIle.satirlar.some((o) => o.kayitNo === x.no && o.tur === 'revizyon_yayinlandi'));
    assert.equal((await tamam<OlayListeCevabi>(acan, 'GET', `${K}/olaylar?ara=%25`)).toplam, 0);
  });

  test('P2 akışı: ilk parça şartı yok, yayında doğrulamaya geçer; proseste yeni parça numarası verilmez', async () => {
    const e = await emreKadar('P2');
    const x0 = await tamam<EmirCevabi>(acan, 'POST', `${K}/emirler/${e.id}/taslak-ac`, { surum: e.surum });
    await kod(acan, `${K}/emirler/${e.id}/kalem-kaydet`, {
      kalemId: x0.kalemler[0]?.id, yeniCizimRevizyonuId: null, yeniRotaRevizyonuId: 5, eskiYeniyeUyar: null, yeniEskiyeUyar: null, yeniParcaNo: 'X', surum: x0.surum,
    }, 400, /Proses/);
    let x = x0;
    x = await tamam(acan, 'POST', `${K}/emirler/${e.id}/kalem-kaydet`, {
      kalemId: x.kalemler[0]?.id, yeniCizimRevizyonuId: null, yeniRotaRevizyonuId: 5, eskiYeniyeUyar: null, yeniEskiyeUyar: null, ozet: 'Kesme parametresi', surum: x.surum,
    });
    x = await tamam(acan, 'POST', `${K}/emirler/${e.id}/yayina-gonder`, { surum: x.surum });
    x = await tamam(onaylayan, 'POST', `${K}/emirler/${e.id}/yayinla`, { gecerlilik: { tur: 'tarih', tarih: '2026-12-01' }, surum: x.surum });
    assert.deepEqual([x.durum, x.fai.length], ['dogrulama', 0]);
    assert.deepEqual(x.gecerlilik, { tur: 'tarih', tarih: '2026-12-01' });
  });

  test('DY-9 - DY-13: kararlar önerilir, otomatik uygulanır; doğru uç, izinli kod, sapma, bekletme ve toplu onay', async () => {
    const e = await yayinaHazir(await emreKadar('P1'));
    const cozucu: EtkiCozucusu = async (_db, g) => ({
      emirler: [
        { uretimEmriId: 501, malzemeId: g.malzemeIdleri[0] ?? 0, emir: { durum: 'planli', basladi: false, donmus: false, seriAraligi: null, sonUrunu: false, baslangic: '2026-12-10', terminKayar: false } },
        { uretimEmriId: 502, malzemeId: g.malzemeIdleri[0] ?? 0, emir: { durum: 'serbest', basladi: false, donmus: false, seriAraligi: null, sonUrunu: false, baslangic: '2026-12-10', terminKayar: false } },
        { uretimEmriId: 503, malzemeId: g.malzemeIdleri[0] ?? 0, emir: { durum: 'uretimde', basladi: true, donmus: false, seriAraligi: null, sonUrunu: false, baslangic: '2026-10-01', terminKayar: null } },
        { uretimEmriId: 504, malzemeId: g.malzemeIdleri[0] ?? 0, emir: { durum: 'tamamlandi', basladi: true, donmus: false, seriAraligi: null, sonUrunu: false, baslangic: '2026-09-01', terminKayar: null } },
      ],
      stok: [{ stokId: 601, malzemeId: g.malzemeIdleri[0] ?? 0 }],
    });
    const kisi = { id: onaylayanId, ad: 'Deneme dy-onaylayan', islemler: [...DEGISIKLIK_YONETIMI_ISLEMLERI] };
    let x = await vt().tx((db) => yayinla(db, kisi, e.id, { gecerlilik: { tur: 'tum' }, surum: e.surum }, cozucu));
    const hedef = (id: number) => {
      const k = x.kararlar.find((y) => y.hedefId === id);
      if (!k) throw new Error(`karar yok: ${id}`);
      return k;
    };
    assert.equal(x.durum, 'karar');
    assert.deepEqual([hedef(501).mod, hedef(501).verilenKod, hedef(501).veren?.kisiId], ['otomatik', 'yeniden_olustur', onaylayanId]);
    assert.deepEqual([hedef(502).onerilenKod, hedef(502).mod, hedef(502).verilenKod], ['yeniden_olustur', 'onayli', null]);
    assert.deepEqual([hedef(503).onerilenKod, hedef(503).mod], ['kalanlari_gecir', 'mrb']);
    assert.deepEqual([hedef(504).onerilenKod, hedef(504).mod], ['islem_yok', 'onayli']);
    assert.deepEqual([hedef(601).hedef, hedef(601).verilenKod], ['stok', 'islem_yok']);
    assert.equal(x.fai.length, 1);
    const karar = (url: string, k: { id: number }, kod2: string, ek: Record<string, unknown> = {}) =>
      cagir(onaylayan, 'POST', `${K}/emirler/${e.id}/${url}`, { kararId: k.id, kod: kod2, surum: x.surum, ...ek });
    // MRB modundaki karar karar ucundan, MRB olmayan karar MRB ucundan verilmez; izinsiz kod 400.
    assert.equal((await karar('karar', hedef(503), 'kalanlari_gecir')).statusCode, 403);
    assert.equal((await karar('mrb-karar', hedef(502), 'yeniden_olustur')).statusCode, 403);
    assert.equal((await karar('karar', hedef(502), 'hurda')).statusCode, 403);
    assert.equal((await karar('karar', hedef(504), 'yeniden_olustur')).statusCode, 400);
    assert.equal((await karar('mrb-karar', hedef(504), 'eskiyle_tamamla_sapma')).statusCode, 400);
    assert.equal((await karar('karar', hedef(501), 'yeniden_olustur')).statusCode, 409);
    // Bekletme karar değildir: not yazılır, karar bekler.
    const b = await karar('mrb-karar', hedef(503), 'beklet', { aciklama: 'Toplantıda' });
    assert.equal(b.statusCode, 200, b.body);
    x = b.json<EmirCevabi>();
    assert.deepEqual([hedef(503).verilenKod, hedef(503).not], [null, 'MRB toplantısına ertelendi: Toplantıda']);
    // Toplu onay 502 ve 504'ü verir, MRB kararı 503 bekler.
    x = await tamam(onaylayan, 'POST', `${K}/emirler/${e.id}/toplu-karar`, { surum: x.surum });
    assert.deepEqual([hedef(502).verilenKod, hedef(504).verilenKod, hedef(503).verilenKod, x.durum], ['yeniden_olustur', 'islem_yok', null, 'karar']);
    await kod(onaylayan, `${K}/emirler/${e.id}/toplu-karar`, { surum: x.surum }, 409, /bekleyen öneri yok/);
    const gorev = await tamam<GorevlerimCevabi>(onaylayan, 'GET', `${K}/gorevlerim`);
    assert.ok(gorev.gorevler.some((g) => g.tur === 'emir' && g.id === e.id && /MRB kararı ver \(1\)/.test(g.adim)));
    assert.equal((await tamam<GorevlerimCevabi>(tekIslemli.get('degisiklik-yonetimi.karar-ver') ?? '', 'GET', `${K}/gorevlerim`)).gorevler.some((g) => g.id === e.id && g.tur === 'emir' && /MRB/.test(g.adim)), false);
    const sapma = await karar('mrb-karar', hedef(503), 'eskiyle_tamamla_sapma', { sapmaReferansi: 'SAP-3' });
    assert.equal(sapma.statusCode, 200, sapma.body);
    x = sapma.json<EmirCevabi>();
    assert.deepEqual([hedef(503).verilenKod, hedef(503).sapmaReferansi, x.durum], ['eskiyle_tamamla_sapma', 'SAP-3', 'uygulamada']);
    assert.ok(x.gecmis.some((g) => g.olay === 'mrb_karar' && g.imzaAnlami === IMZA_ANLAMLARI.mrb_karar));
    assert.ok(x.gecmis.some((g) => g.olay === 'kararlar_tamam'));
    assert.equal(x.kapanisKosullari.find((k) => k.kosul === 'kararlar')?.durum, 'tamam');
    const olaylar = await tamam<OlayListeCevabi>(acan, 'GET', `${K}/olaylar?tur=sapma_acildi`);
    assert.ok(olaylar.satirlar.some((o) => o.kayitNo === x.no && o.ilgili === 'kalite-merkezi'));
    const rapor = await tamam<RaporCevabi>(acan, 'GET', `${K}/raporlar`);
    assert.deepEqual(rapor.kararDagilimi.find((r) => r.emirNo === x.no), { emirNo: x.no, otomatik: 2, onayli: 2, mrb: 1 });
  });

  test('kısıtlar: geçmiş ve olay yalnız eklenir; karar izinli kodla bir kez; geçerlilik bütün', async () => {
    const kisit = async (sql: string, p: unknown[] = []): Promise<string> => {
      try {
        await vt().sorgu(sql, p);
      } catch (hata) {
        return (hata as { constraint?: string; message: string }).constraint ?? (hata as Error).message;
      }
      return 'kabul edildi';
    };
    assert.notEqual(await kisit("UPDATE degisiklik_yonetimi_gecmis SET ozet = 'x'"), 'kabul edildi');
    assert.notEqual(await kisit('DELETE FROM degisiklik_yonetimi_olay'), 'kabul edildi');
    const e = await emreKadar('P2');
    const ekle = (kod2: string | null, izinli: string[]) => kisit(
      `INSERT INTO degisiklik_yonetimi_karar (emir_id, hedef, hedef_id, onerilen_kod, mod, gerekce, izinli_kodlar, verilen_kod, veren_kisi_id, verilme)
       VALUES ($1, 'emir', $2, 'islem_yok', 'onayli', 'g', $3::text[], $4, CASE WHEN $4::text IS NULL THEN NULL ELSE $5::int END, CASE WHEN $4::text IS NULL THEN NULL ELSE now() END)`,
      [e.id, Math.floor(Math.random() * 1e6) + 1, izinli, kod2, acanId],
    );
    assert.equal(await ekle('hurda', ['islem_yok']), 'degisiklik_yonetimi_karar_verilen_izinli');
    assert.equal(await ekle('beklet', ['beklet']), 'degisiklik_yonetimi_karar_verilen_izinli');
    assert.equal(await ekle('islem_yok', ['islem_yok']), 'kabul edildi');
    assert.equal(await ekle(null, ['uydurma']), 'degisiklik_yonetimi_karar_kod_degeri');
    assert.equal(await kisit("UPDATE degisiklik_yonetimi_emir SET gecerlilik_turu = 'seri' WHERE id = $1", [e.id]), 'degisiklik_yonetimi_emir_gecerlilik_butun');
    assert.equal(await kisit("UPDATE degisiklik_yonetimi_emir SET durum = 'karar' WHERE id = $1", [e.id]), 'degisiklik_yonetimi_emir_yayinli');
  });

  test('listeler, görevlerim, son ürünler, konfigürasyon, izlenebilirlik ve raporlar', async () => {
    const t = await talepAc({ baslik: 'Liste denemesi benzersiz' });
    const acik = await tamam<TalepListeCevabi>(acan, 'GET', `${K}/talepler?ara=benzersiz`);
    assert.deepEqual(acik.satirlar.map((s) => s.id), [t.id]);
    assert.equal(acik.satirlar[0]?.malzemeler[0]?.malzemeId, mil);
    assert.equal((await tamam<TalepListeCevabi>(acan, 'GET', `${K}/talepler?ara=benzersiz&kapsam=kapali`)).satirlar.length, 0);
    assert.equal((await tamam<TalepListeCevabi>(acan, 'GET', `${K}/talepler?ara=%25`)).satirlar.length, 0);
    const emirler = await tamam<EmirListeCevabi>(acan, 'GET', `${K}/emirler?kapsam=tumu`);
    assert.ok(emirler.toplam !== null && emirler.toplam > 0);
    assert.ok(emirler.satirlar.some((s) => s.durum === 'kapandi' && s.gecerlilik?.tur === 'seri'));
    assert.ok((await tamam<EmirListeCevabi>(acan, 'GET', `${K}/emirler`)).satirlar.every((s) => s.durum !== 'kapandi'));

    const gorev = await tamam<GorevlerimCevabi>(acan, 'GET', `${K}/gorevlerim`);
    assert.ok(gorev.gorevler.some((g) => g.tur === 'talep' && g.id === t.id && g.adim === 'Talebi sınıflandır' && g.hedefIsGunu === 5));
    assert.ok(gorev.hat.find((h) => h.asama === 'talep')?.adet ?? 0 > 0);
    assert.ok(gorev.sonKayitlar.length > 0 && gorev.sonKayitlar.every((s) => s.id > 0 && s.kayitNo !== ''));
    const [{ kapanan } = { kapanan: -1 }] = await vt().sorgu<{ kapanan: number }>(
      `SELECT count(*)::int AS kapanan FROM degisiklik_yonetimi_emir WHERE kapanis > current_date - 90`,
    );
    assert.ok(kapanan > 0);
    assert.equal(gorev.kapanan90Gun, kapanan);
    // Kendi talebinin CCB görevi açana düşmez, başka yöneticiye düşer.
    let c = await talepAc();
    c = await tamam(acan, 'POST', `${K}/talepler/${c.id}/siniflandir`, { sinif: 'D2', aciliyet: 'acil', cevaplar: { ...cevaplar, fff: 'hayir' }, surum: c.surum });
    c = await tamam(acan, 'POST', `${K}/talepler/${c.id}/etki-analizi`, { surum: c.surum });
    assert.equal((await tamam<GorevlerimCevabi>(acan, 'GET', `${K}/gorevlerim`)).gorevler.some((g) => g.id === c.id && g.tur === 'talep'), false);
    assert.ok((await tamam<GorevlerimCevabi>(onaylayan, 'GET', `${K}/gorevlerim`)).gorevler.some((g) => g.id === c.id && g.adim === 'CCB kararı ver'));

    const adaylar = await tamam<ParcaAdaylariCevabi>(acan, 'GET', `${K}/parca-adaylari`);
    assert.ok(adaylar.parcalar.some((p) => p.malzemeId === mil));
    assert.ok(!adaylar.parcalar.some((p) => p.malzemeId === cubuk));
    const sonlar = await tamam<SonUrunlerCevabi>(acan, 'GET', `${K}/son-urunler`);
    assert.ok(sonlar.sonUrunler.some((s) => s.malzemeId === mil && s.seriIzlenir === null));
    const konf = await tamam<KonfigurasyonCevabi>(acan, 'GET', `${K}/konfigurasyon/${mil}`);
    assert.deepEqual([konf.baseline, konf.seriler, konf.revizyonStogu, konf.aileIpligi], [null, null, null, null]);
    assert.ok(konf.gecerlilikler.some((g) => g.ilkSeri === 120));
    assert.ok(konf.acikDegisiklikler.some((a) => a.tur === 'talep' && a.id === t.id));
    assert.equal((await cagir(acan, 'GET', `${K}/konfigurasyon/2147480000`)).statusCode, 404);
    const iz = await tamam<IzlenebilirlikCevabi>(acan, 'GET', `${K}/izlenebilirlik?sonUrunMalzemeId=${mil}&seriNo=125`);
    assert.deepEqual([iz.uyum, iz.iplik, iz.seriNo, iz.modSeviyesi, iz.emirRevizyonu, iz.not], ['bilinmiyor', null, '125', null, null, null]);
    assert.deepEqual(iz.soyAgaci, { bilesenler: null, operasyonlar: null });
    // Seri kaydı bağlı değil: satır yok, toplam bilinmiyor.
    const seri = await tamam<SeriListeCevabi>(acan, 'GET', `${K}/seriler?ara=125&sayfa=2`);
    assert.deepEqual([seri.satirlar, seri.toplam, seri.sayfa], [[], null, 2]);
    const rapor = await tamam<RaporCevabi>(acan, 'GET', `${K}/raporlar`);
    assert.ok(rapor.cevrim.length > 0 && rapor.cevrim.every((r) => r.isGunu >= 0 && r.acilis <= r.kapanis));
    assert.deepEqual([rapor.rotaOlgunlugu, rapor.hurdaMaliyeti, rapor.reworkMaliyeti, rapor.engellenenNcDenemesi], [null, null, null, null]);
    assert.equal((await cagir(acan, 'GET', `${K}/raporlar?baslangic=2026-12-01&bitis=2026-11-01`)).statusCode, 400);
  });
});
