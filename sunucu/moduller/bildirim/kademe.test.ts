import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ALICI_AYARLI_TURLER, BILDIRIM_TURLERI, KADEME_TURLERI } from '#paylasilan/sozlesme/bildirim.ts';
import type { BildirimTuruTanimi } from '#paylasilan/sozlesme/bildirim.ts';
import { KADEME_KAYNAKLARI, KADEME_KAYNAK_ANAHTARLARI, kademeTuru, type AcikTakiplerCevabi, type GecikenlerimCevabi, type KademeAyarlariCevabi, type KademeKaynagi } from '#paylasilan/sozlesme/bildirim-kademe.ts';
import { tesisGunBasi } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kademeKaynagiKaydet, kademeleriIlerlet, type KademeKaydi } from './kademe.ts';
import { bildirimGonder } from './servis.ts';
import { bildirilecekKademe, gerekenKademeler, isGunuFarki, isSaatiFarki, kademeAyarHatasi } from './kurallar.ts';

const BOS = new Set<string>();
const SON_GUN = { sayac: 'son-gun', k2Gun: 1, k3Gun: null, k4Gun: 1, k5Gun: 2 } as const;
const BEKLEME = { sayac: 'bekleme', k2Gun: null, k3Gun: 2, k4Gun: 2, k5Gun: 4 } as const;
const sg = (sonGun: string, bugun: string, yapanVar = true, kural: Parameters<typeof gerekenKademeler>[1] = SON_GUN) =>
  gerekenKademeler({ sonGun, baslangic: null, yapanVar }, kural, bugun, BOS);
const bk = (baslangic: string, bugun: string, yapanVar = true) => gerekenKademeler({ sonGun: null, baslangic, yapanVar }, BEKLEME, bugun, BOS);

// 3405 a: kural saf; 3396'nın son gün davranışı aynen korunur, bekleme sayacı eklenir.
describe('kademeli uyarı kuralı (3405)', () => {
  test('iş günü farkı: cuma→pazartesi 1, pazartesi→cuma 4, tatil düşer, geriye eksi', () => {
    assert.equal(isGunuFarki('2026-11-20', '2026-11-23', BOS), 1);
    assert.equal(isGunuFarki('2026-11-16', '2026-11-20', BOS), 4);
    assert.equal(isGunuFarki('2026-11-16', '2026-11-20', new Set(['2026-11-18'])), 3);
    assert.equal(isGunuFarki('2026-11-23', '2026-11-20', BOS), -1);
    assert.equal(isGunuFarki('2026-11-20', '2026-11-20', BOS), 0);
  });

  test('son gün: 3396 ile aynı (yarın K2, cuma biten pazartesi K3+K4, iki iş günü K5, yapansız yalnız K4/K5)', () => {
    assert.deepEqual(sg('2026-11-18', '2026-11-17').kademeler, [1, 2]);
    assert.deepEqual(sg('2026-11-20', '2026-11-17').kademeler, [1]);
    assert.deepEqual(sg('2026-11-20', '2026-11-21').kademeler, [1, 2, 3], 'cumartesi gecikme iş günü değil');
    assert.deepEqual(sg('2026-11-20', '2026-11-23'), { kademeler: [1, 2, 3, 4], gecikme: 1 });
    assert.deepEqual(sg('2026-11-20', '2026-11-24'), { kademeler: [1, 2, 3, 4, 5], gecikme: 2 });
    assert.deepEqual(sg('2026-11-20', '2026-11-24', false).kademeler, [4, 5]);
    assert.deepEqual(sg('2026-11-20', '2026-11-20').kademeler, [1, 2], 'son gün K3 doğurmaz');
  });

  test('son gün: K2 kapalı (null) ve K5 kapalı kaynakta o kademe hiç gelmez', () => {
    const kural = { ...SON_GUN, k2Gun: null, k5Gun: null };
    assert.deepEqual(sg('2026-11-18', '2026-11-17', true, kural).kademeler, [1]);
    assert.deepEqual(sg('2026-11-20', '2026-11-30', true, kural).kademeler, [1, 3, 4]);
  });

  test('bekleme: K2 yoktur; K3 k3Gun iş günü bekleyince (gecikme 1), K4 ve K5 gecikmenin k4/k5 iş gününde', () => {
    assert.deepEqual(bk('2026-11-16', '2026-11-17'), { kademeler: [1], gecikme: null });
    assert.deepEqual(bk('2026-11-16', '2026-11-18'), { kademeler: [1, 3], gecikme: 1 });
    assert.deepEqual(bk('2026-11-16', '2026-11-19'), { kademeler: [1, 3, 4], gecikme: 2 });
    assert.deepEqual(bk('2026-11-16', '2026-11-23'), { kademeler: [1, 3, 4, 5], gecikme: 4 }, 'hafta sonu sayılmaz');
    assert.deepEqual(bk('2026-11-16', '2026-11-23', false).kademeler, [4, 5]);
  });

  // 3418 a: saat iş günlerinde geçen saattir (tesis saati UTC+3); hafta sonu ve tatil düşer, mesai dışı saat sayılır.
  test('iş saati farkı: cuma 18:00 → pazartesi 10:00 16 saat; pazartesi tatilse 6; eşiğin aşıldığı gün döner (3418)', () => {
    const an = (s: string) => Date.parse(s);
    assert.deepEqual(isSaatiFarki(an('2026-11-20T15:00:00Z'), an('2026-11-23T07:00:00Z'), BOS), { saat: 16, esikGunu: null });
    assert.equal(isSaatiFarki(an('2026-11-20T15:00:00Z'), an('2026-11-23T07:00:00Z'), new Set(['2026-11-23'])).saat, 6);
    assert.equal(isSaatiFarki(an('2026-11-20T15:00:00Z'), an('2026-11-23T07:00:00Z'), BOS, 8).esikGunu, '2026-11-23');
    assert.equal(isSaatiFarki(an('2026-11-20T15:00:00Z'), an('2026-11-23T07:00:00Z'), BOS, 17).esikGunu, null);
    assert.deepEqual(isSaatiFarki(an('2026-11-23T07:00:00Z'), an('2026-11-20T15:00:00Z'), BOS), { saat: 0, esikGunu: null });
  });

  test('bekleme saat biriminde: K3 4 iş saati geçince; K4 gecikmenin 2. iş günü; hafta sonu ve tatil sayılmaz; an yoksa gün başı (3418)', () => {
    const kural = { sayac: 'bekleme', k2Gun: null, k3Gun: 4, k4Gun: 2, k5Gun: null, k3Birim: 'saat' } as const;
    const sa = (baslangicAni: string | null, simdi: string, tatiller: ReadonlySet<string> = BOS) => {
      const t = Date.parse(simdi);
      const gun = new Date(t + 3 * 3_600_000).toISOString().slice(0, 10);
      const bas = baslangicAni === null ? '2026-11-16' : new Date(Date.parse(baslangicAni) + 3 * 3_600_000).toISOString().slice(0, 10);
      return gerekenKademeler({ sonGun: null, baslangic: bas, baslangicAni, yapanVar: true }, kural, gun, tatiller, t);
    };
    assert.deepEqual(sa('2026-11-16T06:00:00Z', '2026-11-16T09:00:00Z'), { kademeler: [1], gecikme: null }, '3 saat');
    assert.deepEqual(sa('2026-11-16T06:00:00Z', '2026-11-16T10:00:00Z'), { kademeler: [1, 3], gecikme: 1 }, '4 saat');
    assert.deepEqual(sa('2026-11-16T06:00:00Z', '2026-11-17T06:00:00Z'), { kademeler: [1, 3, 4], gecikme: 2 }, 'bir iş günü sonra Yöneticide');
    assert.deepEqual(sa('2026-11-20T19:00:00Z', '2026-11-23T05:00:00Z'), { kademeler: [1, 3], gecikme: 1 }, 'cuma 22:00 başlayan pazartesi 02:00 gecikir');
    assert.deepEqual(sa('2026-11-20T19:00:00Z', '2026-11-22T20:00:00Z'), { kademeler: [1], gecikme: null }, 'hafta sonu saat sayılmaz');
    assert.deepEqual(sa('2026-11-20T19:00:00Z', '2026-11-23T20:00:00Z', new Set(['2026-11-23'])), { kademeler: [1], gecikme: null }, 'tatil sayılmaz');
    assert.deepEqual(sa(null, '2026-11-16T01:00:00Z'), { kademeler: [1, 3], gecikme: 1 }, 'an vermeyen kaynakta gün başından');
  });

  test('tarihi olmayan kayıt hiçbir gecikme kademesine girmez (sıfır uydurulmaz)', () => {
    assert.deepEqual(gerekenKademeler({ sonGun: null, baslangic: null, yapanVar: true }, SON_GUN, '2026-11-17', BOS), { kademeler: [1], gecikme: null });
    assert.deepEqual(gerekenKademeler({ sonGun: null, baslangic: null, yapanVar: true }, BEKLEME, '2026-11-17', BOS), { kademeler: [1], gecikme: null });
  });

  test('kesintiden sonra yalnız en yüksek yeni kademe bildirilir; K1 hiç bildirilmez (Risk K6)', () => {
    assert.deepEqual(bildirilecekKademe([1, 2, 3, 4, 5], new Set()), { yeni: [1, 2, 3, 4, 5], bildirilecek: 5 });
    assert.deepEqual(bildirilecekKademe([1, 2, 3], new Set([1, 2])), { yeni: [3], bildirilecek: 3 });
    assert.deepEqual(bildirilecekKademe([1], new Set()), { yeni: [1], bildirilecek: null });
  });

  test('ayar sınaması: bekleme sayacında K2 yok, son gün sayacında K3 günü yok, Devret Yöneticide\'den sonra', () => {
    const g = { acik: true, k2Gun: null, k3Gun: 2, k4Gun: 2, k5Gun: 5 };
    assert.equal(kademeAyarHatasi('bekleme', g), null);
    assert.equal(kademeAyarHatasi('bekleme', { ...g, k2Gun: 1 })?.alan, 'k2Gun');
    assert.equal(kademeAyarHatasi('bekleme', { ...g, k3Gun: null })?.alan, 'k3Gun');
    assert.equal(kademeAyarHatasi('son-gun', g)?.alan, 'k3Gun');
    assert.equal(kademeAyarHatasi('bekleme', { ...g, k5Gun: 2 })?.alan, 'k5Gun');
    assert.equal(kademeAyarHatasi('bekleme', { ...g, k3Birim: 'saat' }), null);
    assert.equal(kademeAyarHatasi('bekleme', { ...g, k3Gun: 0, k3Birim: 'saat' })?.alan, 'k3Gun');
    assert.equal(kademeAyarHatasi('son-gun', { ...g, k3Gun: null, k3Birim: 'saat' })?.alan, 'k3Birim');
  });

  test('türler katalogdan: her kaynakta K3-K5, son gün sayacında K2 de; alıcı kaynağın okuma işlemi; para kaynağında e-posta kapalı', () => {
    for (const kaynak of KADEME_KAYNAK_ANAHTARLARI.filter((k) => k !== 'projeler.hazirlik')) {
      const t = KADEME_KAYNAKLARI[kaynak];
      const turler = KADEME_TURLERI.filter((x) => x.startsWith(`${kaynak.split('.')[0] ?? ''}.kademe-${kaynak.split('.')[1] ?? ''}-`));
      assert.equal(turler.length, t.sayac === 'son-gun' ? 4 : 3, kaynak);
      for (const tur of turler) {
        const d = BILDIRIM_TURLERI[tur] as BildirimTuruTanimi;
        assert.deepEqual(d.alanIslemler, t.okumaIslemleri, tur);
        assert.equal(d.yol, t.yol, tur);
        if ('para' in t) assert.equal(d.varsayilan.eposta, false, tur);
      }
    }
    // Risk K1: Bildirim yönetimindeki alıcı seçimi kademe türüne yazılamaz (okuma işlemi kuralının yerine geçmesin).
    assert.deepEqual(KADEME_TURLERI.filter((x) => (ALICI_AYARLI_TURLER as readonly string[]).includes(x)), []);
  });

});

// Kaynak: kablolamada bağlı olmayan ikinci aşama kaynağı (test kendi okuyucusunu kaydeder). Bekleme sayacı.
const KAYNAK = 'malzemeler.kart-onay' as const;
const PAZARTESI = '2030-01-07';
const an = (gun: string, saat = 10) => new Date(tesisGunBasi(gun) + saat * 3_600_000);

describe('kademeli uyarı motoru (3405, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yonetici = { cerez: '', id: 0 };
  const rol = new Map<string, number>();
  let sayac = 0;
  let kayitlar: KademeKaydi[] = [];
  let hata = false;
  // İkinci kaynak: son gün sayacı (K2 var); test kendi okuyucusunu kaydeder. Varsayılanı kapalı (3478), test açar; K4 3, K5 7, e-posta K3'ten, kapatılamaz.
  const DOF = 'kalite-merkezi.dof' as const;
  let dofKayitlari: KademeKaydi[] = [];
  const dof = (kayit: string, sonGun: string, yapanlar: readonly number[]): KademeKaydi =>
    ({ kayit, no: `ORN-DOF-${kayit}`, baslik: 'DÖF', yol: '/kalite-merkezi/dof', sonGun, yapanlar, yoneticiler: [] });
  const posta = async (k: { id: number }, kayit: string, kademe: number) => (await ortam!.sahip.sorgu<{ n: number }>(
    `SELECT count(*)::int AS n FROM bildirim_eposta_kuyrugu q JOIN bildirim_kaydi b ON b.id = q.bildirim_id
     WHERE q.kisi_id = $1 AND b.tekil_anahtar LIKE $2`, [k.id, `%:${kayit}:k${String(kademe)}`]))[0]?.n ?? -1;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  interface Kisi { cerez: string; id: number }
  const PAROLA = 'dogru-parola-1';
  async function giris(ad: string, id: number): Promise<Kisi> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  async function kisi(rolKodu: string, ekIslem: string | null = null): Promise<Kisi> {
    const ad = `ku-${String((sayac += 1))}`;
    const rolId = rol.get(rolKodu) ?? 0;
    if (ekIslem !== null) await ortam!.sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rolId, ekIslem]);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rolId);
      await rolAl(db, yoneticiId, yeni, rol.get('yonetici') ?? 0);
      return yeni;
    });
    return giris(ad, id);
  }
  const gonder = (k: Kisi, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: k.cerez, 'istek-kimligi': randomUUID() } });
  const oku = (k: Kisi, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: k.cerez } });
  const ilerlet = (gun = PAZARTESI, saat = 10) => vt().tx((db) => kademeleriIlerlet(db, an(gun, saat)));
  const defter = async (kayit: string) => (await vt().sorgu<{ kademe: number; bildirildi: boolean }>(
    'SELECT kademe, bildirildi FROM bildirim_kademe_defteri WHERE kaynak = $1 AND kayit = $2 ORDER BY kademe', [KAYNAK, kayit])).map((x) => `${String(x.kademe)}${x.bildirildi ? '!' : ''}`);
  const zil = async (k: Kisi, kayit: string, kademe: number, acik = true) => (await vt().tek<{ n: number }>(
    `SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tekil_anahtar LIKE $2${acik ? ' AND yapildi IS NULL' : ''}`,
    [k.id, `%:${kayit}:k${String(kademe)}`]))?.n ?? -1;
  const ayar = async (kaynak: KademeKaynagi = KAYNAK) => (await oku(yonetici, '/bildirim-kademe/kaynaklar')).json<KademeAyarlariCevabi>().kaynaklar.find((k) => k.kaynak === kaynak)!;
  const ayarla = async (ek: Record<string, unknown>, kaynak: KademeKaynagi = KAYNAK) => {
    const a = await ayar(kaynak);
    const govde = { acik: a.acik, k2Gun: a.k2Gun, k3Gun: a.k3Gun, k4Gun: a.k4Gun, k5Gun: a.k5Gun, epostaKademe: a.epostaKademe, serit: a.serit,
      kapatilamaz: a.kapatilamaz, yoneticiRolId: a.yoneticiRolId, k3Birim: a.k3Birim, surum: a.surum, ...ek };
    return gonder(yonetici, `/bildirim-kademe/kaynaklar/${kaynak}/ayarla`, govde);
  };

  before(async () => {
    ortam = await testVeritabaniKur('bildirim_kademe');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    for (const r of await ortam.vt.sorgu<{ id: number; kod: string }>('SELECT id, kod FROM rol')) rol.set(r.kod, r.id);
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await giris('yonetici', yoneticiId);
    kademeKaynagiKaydet(KAYNAK, async () => {
      if (hata) throw new Error('kaynak sorgusu düştü');
      return kayitlar;
    });
    kademeKaynagiKaydet(DOF, async () => dofKayitlari);
    const ac = await ayarla({ acik: true }, DOF);
    assert.equal(ac.statusCode, 200, ac.body);
  });
  after(async () => { kademeKaynagiKaydet(KAYNAK, null); kademeKaynagiKaydet(DOF, null); await app?.close(); await ortam?.kaldir(); });

  test('ayar: yalnız kademe yöneticisi; sıra bozuksa 400, sürüm tutmazsa 409; kapalı gelen kaynak açılır', async () => {
    const okuyan = await kisi('kalite', 'malzemeler.onayla');
    assert.equal((await oku(okuyan, '/bildirim-kademe/kaynaklar')).statusCode, 403);
    const a = await ayar();
    assert.deepEqual([a.acik, a.varsayilan, a.asama, a.sayac, a.takipte], [false, true, 2, 'bekleme', 0]);
    assert.equal((await ayarla({ acik: true, k4Gun: 3, k5Gun: 3 })).statusCode, 400);
    assert.equal((await ayarla({ acik: true, k2Gun: 1 })).statusCode, 400, 'bekleme sayacında K2 yok');
    const c = await ayarla({ acik: true, k3Gun: 1, k4Gun: 2, k5Gun: 3, epostaKademe: 3, serit: true, kapatilamaz: true });
    assert.equal(c.statusCode, 200, c.body);
    const b = await ayar();
    assert.deepEqual([b.acik, b.varsayilan, b.surum, b.degistiren !== null], [true, false, 2, true]);
    assert.equal((await gonder(yonetici, `/bildirim-kademe/kaynaklar/${KAYNAK}/ayarla`, { ...{ acik: true, k2Gun: null, k3Gun: 1, k4Gun: 2, k5Gun: 3, epostaKademe: 3, serit: true, kapatilamaz: true, yoneticiRolId: null }, surum: 1 })).statusCode, 409);
  });

  test('ilk çalışma sessizdir (Risk K5): var olan gecikme deftere bildirimsiz girer, Gecikenlerim ve şeritte görünür', async () => {
    const yapan = await kisi('kalite', 'malzemeler.onayla');
    kayitlar = [{ kayit: 'eski', no: 'ORN-MK-1', baslik: 'Kart onayı', yol: '/malzemeler', baslangic: '2029-12-02', yapanlar: [yapan.id], yoneticiler: [] }];
    const r = await ilerlet();
    assert.equal(r.bildirilen, 0);
    assert.deepEqual(await defter('eski'), ['1', '3', '4', '5']);
    assert.equal(await zil(yapan, 'eski', 5), 0);
    const g = (await oku(yapan, '/bildirim-kademe/gecikenlerim')).json<GecikenlerimCevabi>();
    assert.deepEqual(g.kayitlar.map((x) => [x.kayit, x.kademe, x.no]), [['eski', 5, 'ORN-MK-1']]);
    assert.equal((await oku(yapan, '/bildirim-kademe/seridim')).json<GecikenlerimCevabi>().kayitlar.length, 1);
  });

  test('yeni kademe bildirilir, ikinci çalışma yazmaz; kayıt kapanınca bildirim yapıldı olur ve takipten düşer', async () => {
    const yapan = await kisi('kalite', 'malzemeler.onayla');
    const ust = await kisi('cam', 'malzemeler.onayla');
    // Cuma başlayan bekleme pazartesi bir iş günüdür: K3 (k3Gun 1), gecikme 1 (K4 2. günde).
    const yeni: KademeKaydi = { kayit: 'yeni', no: 'ORN-MK-2', baslik: 'Kart onayı', yol: '/malzemeler', baslangic: '2030-01-04', yapanlar: [yapan.id], yoneticiler: [ust.id] };
    kayitlar = [...kayitlar, yeni];
    const r = await ilerlet();
    assert.equal(r.bildirilen, 1);
    assert.deepEqual(await defter('yeni'), ['1', '3!']);
    assert.deepEqual([await zil(yapan, 'yeni', 3), await zil(ust, 'yeni', 3)], [1, 0]);
    assert.equal((await ilerlet()).yazilan, 0, 'tekrar yok');
    await ilerlet('2030-01-08');
    assert.deepEqual(await defter('yeni'), ['1', '3!', '4!']);
    assert.deepEqual([await zil(ust, 'yeni', 4), await zil(yapan, 'yeni', 4)], [1, 0], 'K4 üste gider, yapana değil');
    const kimdeK4 = (await oku(yonetici, '/bildirim-kademe/acik-takipler')).json<{ kayitlar: { kayit: string; kimde: string[] }[] }>().kayitlar.find((x) => x.kayit === 'yeni')?.kimde;
    assert.equal(kimdeK4?.length, 2, 'K4 ve sonrasında iş yapanda ve üstte görünür');
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM bildirim_kademe_defteri WHERE kaynak = $1', [KAYNAK]), /yalnız ekleme/);

    kayitlar = kayitlar.filter((k) => k.kayit !== 'yeni');
    const k = await ilerlet('2030-01-08');
    assert.equal(k.kapanan, 1);
    assert.deepEqual([await zil(yapan, 'yeni', 3), await zil(ust, 'yeni', 4)], [0, 0], 'kapanan kaydın kademe bildirimi yapıldı olur');
    assert.equal((await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM bildirim_kademe_takip WHERE kaynak = $1 AND kayit = 'yeni'", [KAYNAK]))?.n, 0);
  });

  test('kaynak sorgusu düşerse hiçbir kayıt kapanmaz (Risk K4); kaynağı okuyamayan Gecikenlerim satırını görmez (Risk K2)', async () => {
    hata = true;
    try {
      const r = await ilerlet();
      assert.deepEqual(r.hatali, [KAYNAK]);
      assert.equal((await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM bildirim_kademe_takip WHERE kaynak = $1 AND kayit = 'eski'", [KAYNAK]))?.n, 1);
    } finally {
      hata = false;
    }
    const okumayan = await kisi('operator');
    kayitlar = [...kayitlar, { kayit: 'okumayan', no: 'ORN-MK-3', baslik: 'x', yol: '/malzemeler', baslangic: '2029-12-02', yapanlar: [okumayan.id], yoneticiler: [] }];
    await ilerlet();
    assert.deepEqual((await oku(okumayan, '/bildirim-kademe/gecikenlerim')).json<GecikenlerimCevabi>().kayitlar, []);
    assert.equal(await zil(okumayan, 'okumayan', 5), 0, 'okuma işlemi olmayan zil de almaz');
  });

  test('kaynak kapatılınca açık kademe bildirimleri kapanır ve takip boşalır; Açık takipler yalnız açık kaynakları verir', async () => {
    const yapan = await kisi('kalite', 'malzemeler.onayla');
    kayitlar = [...kayitlar, { kayit: 'son', no: 'ORN-MK-4', baslik: 'x', yol: '/malzemeler', baslangic: '2030-01-04', yapanlar: [yapan.id], yoneticiler: [] }];
    await ilerlet();
    assert.equal(await zil(yapan, 'son', 3), 1);
    const acik = (await oku(yonetici, '/bildirim-kademe/acik-takipler')).json<{ kayitlar: { kaynak: string; kayit: string; kimde: string[] }[] }>();
    assert.equal(acik.kayitlar.find((x) => x.kaynak === KAYNAK && x.kayit === 'son')?.kimde.length, 1, 'K3: yalnız yapan');
    assert.equal((await ayarla({ acik: false })).statusCode, 200);
    await ilerlet();
    assert.equal(await zil(yapan, 'son', 3), 0);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM bildirim_kademe_takip WHERE kaynak = $1', [KAYNAK]))?.n, 0);
    assert.ok(!(await oku(yonetici, '/bildirim-kademe/acik-takipler')).json<{ kayitlar: { kaynak: string }[] }>().kayitlar.some((x) => x.kaynak === KAYNAK));
  });

  test('kayda bağlı alıcısı olmayan K4 yalnız kaynağı okuyan kademe yöneticisine gider; okuyamayan kademe yöneticisi Açık takipler satırını almaz (Risk K2)', async () => {
    const yedek = await kisi('proses_muhendisi', 'bildirim.kademe-yonet');
    const okuyan = await kisi('kalite');
    const okumayanYonetici = await kisi('depo', 'bildirim.kademe-yonet');
    dofKayitlari = [];
    await ilerlet();
    dofKayitlari = [dof('sahipsiz', '2029-12-31', [])];
    assert.equal((await ilerlet()).bildirilen, 1);
    assert.deepEqual([await zil(yedek, 'sahipsiz', 4), await zil(okuyan, 'sahipsiz', 4)], [1, 0], 'yedek yalnız kademe yöneticisi; herkese yayılmaz');
    const takip = async (k: { cerez: string }) => {
      const r = await oku(k as Kisi, '/bildirim-kademe/acik-takipler');
      assert.equal(r.statusCode, 200, r.body);
      return r.json<AcikTakiplerCevabi>().kayitlar.filter((x) => x.kaynak === DOF).map((x) => x.kayit);
    };
    assert.deepEqual(await takip(yedek), ['sahipsiz']);
    assert.deepEqual(await takip(okumayanYonetici), [], 'DÖF okuyamayan kademe yöneticisi');
  });

  test('e-posta kademesinin altındaki kademe e-postasızdır; eski kişi tercihi satırı okunmaz (3435-1)', async () => {
    const eski = { ...process.env };
    Object.assign(process.env, { TMIV2_POSTA_SUNUCUSU: '127.0.0.1:1', TMIV2_POSTA_ALAN_ADI: 'ornek.local', TMIV2_POSTA_GONDEREN: 'mes@ornek.local', TMIV2_POSTA_GUVENLIK: 'yok' });
    try {
      const kip = await gonder(yonetici, '/ayarlar/bildirim.eposta-kipi/degistir', { deger: 'kurum-ici' });
      assert.equal(kip.statusCode, 200, kip.body);
      // Yönetici K2 türünde e-postayı açmış olsa da kaynağın e-posta kademesi (3) K2'yi e-postasız tutar.
      await ortam!.sahip.sorgu("INSERT INTO bildirim_eposta_tetikleyici (tur, eposta, zaman) VALUES ($1, true, 'hemen') ON CONFLICT (tur) DO UPDATE SET eposta = true", [kademeTuru(DOF, 2)]);
      const b = await kisi('kalite');
      dofKayitlari = [dof('e2', '2030-01-09', [b.id]), dof('e3', '2030-01-04', [b.id])];
      await ilerlet();
      assert.deepEqual([await zil(b, 'e2', 2), await posta(b, 'e2', 2), await zil(b, 'e3', 3), await posta(b, 'e3', 3)], [1, 0, 1, 1]);
      // E-posta K2'den başlar; tablodaki eski kapalı tercih satırları gönderimi değiştirmez: kim alır yöneticinin ayarıdır.
      assert.equal((await ayarla({ epostaKademe: 2 }, DOF)).statusCode, 200);
      const a = await kisi('kalite');
      for (const k of [2, 3] as const) await ortam!.sahip.sorgu('INSERT INTO bildirim_tercihi (kisi_id, tur, mesaj, eposta) VALUES ($1, $2, true, false)', [a.id, kademeTuru(DOF, k)]);
      const c = await kisi('kalite');
      dofKayitlari = [...dofKayitlari, dof('f2', '2030-01-09', [a.id, c.id]), dof('f3', '2030-01-04', [a.id])];
      await ilerlet();
      assert.deepEqual([await zil(a, 'f2', 2), await posta(a, 'f2', 2), await posta(c, 'f2', 2), await posta(a, 'f3', 3)], [1, 1, 1, 1]);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in eski)) Reflect.deleteProperty(process.env, k);
      Object.assign(process.env, eski);
    }
  });

  test('kayıt kapanınca aynı kaynak kimliğiyle açık eski hatırlatma (2432) da kapanır (Risk K5)', async () => {
    const onaylayan = await kisi('mudur');
    const kayit = 'ORN-T1:2029-12-02';
    let acik = true;
    kademeKaynagiKaydet('satin-alma.talep-onay', async () => (acik
      ? [{ kayit, no: 'ORN-ST-1', baslik: 'Onay', yol: '/satin-alma/onaylar', baslangic: '2029-12-02', yapanlar: [onaylayan.id], yoneticiler: [] }] : []));
    try {
      await ilerlet();
      await vt().tx((db) => bildirimGonder(db, { tur: 'satin-alma.hatirlatma-onay-bekliyor', baslik: 'ORN-ST-1', kaynakKimlik: kayit, kisiler: [onaylayan.id], yalnizKisiler: true }));
      const eskiTur = async () => (await ortam!.sahip.sorgu<{ yapildi: boolean }>(
        "SELECT yapildi IS NOT NULL AS yapildi FROM bildirim_kaydi WHERE tur = 'satin-alma.hatirlatma-onay-bekliyor' AND kisi_id = $1", [onaylayan.id])).map((x) => x.yapildi);
      assert.deepEqual(await eskiTur(), [false]);
      acik = false;
      await ilerlet();
      assert.deepEqual(await eskiTur(), [true]);
    } finally {
      kademeKaynagiKaydet('satin-alma.talep-onay', null);
    }
  });

  test('şeridi kapalı kaynak Gecikenlerim\'de görünür, şeritte görünmez; kaynak kapanınca ikisinde de görünmez', async () => {
    const yapan = await kisi('kalite');
    assert.equal((await ayarla({ serit: false }, DOF)).statusCode, 200);
    dofKayitlari = [dof('g1', '2030-01-02', [yapan.id])];
    await ilerlet();
    const liste = async (yol: string) => (await oku(yapan, yol)).json<GecikenlerimCevabi>().kayitlar.filter((x) => x.kaynak === DOF).map((x) => x.kayit);
    assert.deepEqual([await liste('/bildirim-kademe/gecikenlerim'), await liste('/bildirim-kademe/seridim')], [['g1'], []]);
    // Motor çalışmadan da (takip satırı dururken) kapalı kaynak görünmez.
    assert.equal((await ayarla({ acik: false }, DOF)).statusCode, 200);
    assert.deepEqual([await liste('/bildirim-kademe/gecikenlerim'), await liste('/bildirim-kademe/seridim')], [[], []]);
  });
  test('saat birimi (3418 a): K3 iş günlerinde 4 saat geçince, K4 ertesi iş günü; son gün kaynağında saat 400; boş birim gün sayılır', async () => {
    const yapan = await kisi('kalite', 'malzemeler.onayla');
    assert.equal((await ayarla({ acik: true, k3Gun: 4, k3Birim: 'saat', k4Gun: 2, k5Gun: null })).statusCode, 200);
    assert.deepEqual([(await ayar()).k3Birim, (await ayar()).k3Gun], ['saat', 4]);
    assert.equal((await ayarla({ k3Birim: 'saat' }, DOF)).statusCode, 400, 'son gün sayacında saat yok');
    const kademeler = async () => (await defter('saat1')).map((x) => x.replace('!', ''));
    kayitlar = [{
      kayit: 'saat1', no: 'ORN-MK-9', baslik: 'Kart onayı', yol: '/malzemeler', baslangic: PAZARTESI, baslangicAni: an(PAZARTESI, 9).toISOString(),
      yapanlar: [yapan.id], yoneticiler: [],
    }];
    await ilerlet(PAZARTESI, 12);
    assert.deepEqual(await kademeler(), ['1'], '3 saat');
    await ilerlet(PAZARTESI, 13);
    assert.deepEqual(await kademeler(), ['1', '3'], '4 saat');
    assert.equal(await zil(yapan, 'saat1', 3), 1);
    await ilerlet('2030-01-08', 9);
    assert.deepEqual(await kademeler(), ['1', '3', '4'], 'bir iş günü sonra Yöneticide');
    await ortam!.sahip.sorgu('UPDATE bildirim_kademe_ayari SET k3_birim = NULL WHERE kaynak = $1', [KAYNAK]);
    assert.equal((await ayar()).k3Birim, 'gun', 'göçten önceki satır gün sayılır');
  });
});
