import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import { isiBirKezCalistir, modulIsleriniKesfet } from '#cekirdek/zamanlayici.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { ArkonDeposu, ArkonRolu, BelgeCevabi, BelgeYazCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { GERCEK_BORU_SVG, GERCEK_CIZIM_SVG, GERCEK_FLANS_SVG } from './cizim-fiksturu.ts';
import { belgeYaz, belgeler, dosyaParcasi, iletiler } from './servis.ts';
import * as sorgular from './sorgular.ts';
import { ALET_ONEKI, ESLENMEYEN_IZINLER, ILETILER } from './kurallar.ts';
import { isler } from './isler.ts';

const PAROLA = 'dogru-parola-1';

interface Cevap<T = unknown> { durum: number; govde: T }

// Her Arkon rolü gerçek giriş akışıyla kendi kullanıcısıyla girer; TMI işlemi rol başına ayrı geçici role bağlıdır.
const ROL_ISLEMI: Record<ArkonRolu, string> = {
  operator: 'arkon.operator', quality: 'arkon.kalite', prep: 'arkon.hazirlik', plan: 'arkon.planlama',
  lead: 'arkon.amir', maint: 'arkon.bakim', admin: 'arkon.yonetici',
};
const ROLLER = Object.keys(ROL_ISLEMI) as ArkonRolu[];
// Planlı duruş Vardiya'ya yazılır (kart #519): duruş yazan Arkon rolleri gerçek sistemdeki gibi `vardiya.durus-yaz` da taşır
// (yönetici bütün işlemleri, amir müdürde, planlama planlama_proje'de).
const DURUS_YAZAN_ROLLER: readonly ArkonRolu[] = ['admin', 'plan', 'lead'];
// Arkon formunun en küçük geçerli planlı duruş gövdesi (tesiste 08:00-09:00).
const DURUS = { title: 'Deneme duruş', scope: 'all', target: '', from: Date.UTC(2026, 9, 7, 5, 0), to: Date.UTC(2026, 9, 7, 6, 0), rep: 'none' };

describe('arkon güvenlik (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerezler = {} as Record<ArkonRolu, string>;
  const kisiIdleri = {} as Record<ArkonRolu, number>;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  // Yeni yerel (emir dışı) paket açılmaz (A5, kart #541); bu dosyanın paket denetimleri yerel paketin daha önce kaydedilmiş olduğu
  // durumu sınar. İlk yazımda paket aynı yerde boş taslak olarak önceden kurulmuş sayılır: satır eklenir, taban onun sürümü olur; yazım
  // reddedilirse satır geri alınır.
  // Yeni yerel paketin reddi `A5: yerel paket` testindedir ve bu yoldan geçmez (`istekDogrudan`).
  const yerelTaslak = (kimlik: string, govde: unknown): Record<string, unknown> => {
    const g = typeof govde === 'object' && govde !== null ? govde as Record<string, unknown> : {};
    return { id: kimlik, status: 'draft', ...('machine' in g ? { machine: g['machine'] } : {}), ...('mc' in g ? { mc: g['mc'] } : {}) };
  };
  async function yerelPaketKur(yol: string, govde: unknown): Promise<{ govde: unknown; geriAl: () => Promise<void> } | null> {
    const eslesme = /^\/arkon\/belgeler\/pkgs\/([^/]+)\/yaz$/.exec(yol);
    const kimlik = eslesme?.[1];
    if (kimlik === undefined || kimlik.startsWith('tmi-') || typeof govde !== 'object' || govde === null) return null;
    const g = govde as { taban?: number | null; govde?: unknown };
    if (g.taban !== null && g.taban !== 0 && g.taban !== undefined) return null;
    const satir = await vt().tek<{ surum: number }>(
      `INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('pkgs', $1, $2, 1, $3)
       ON CONFLICT (depo, kimlik) DO NOTHING RETURNING surum::float8 AS surum`, [kimlik, JSON.stringify(yerelTaslak(kimlik, g.govde)), yoneticiId]);
    if (satir === null) return null;
    return { govde: { ...g, taban: satir.surum }, geriAl: async () => { await vt().sorgu("DELETE FROM arkon_belge WHERE depo = 'pkgs' AND kimlik = $1 AND surum = 1", [kimlik]); } };
  }

  // İş emirsiz emrin açma ucu yok (238 H3): kurulum emri doğrudan yazar.
  const emirYaz = async (g: { parcaNo: string; parcaAd: string; adet: number; istasyonId: number; projeId: number }) => {
    const emir = (await ortam!.sahip.tek<{ id: number; emirNo: string }>(
      `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, proje_id)
       VALUES ($1, $2, $3, $4, (SELECT min(id) FROM kisi), $5) RETURNING id, emir_no AS "emirNo"`,
      [g.parcaNo, g.parcaAd, g.adet, g.istasyonId, g.projeId]))!;
    return { durum: 200, govde: { emir } };
  };

  async function istek<T = unknown>(cerez: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const kurulan = yontem === 'POST' ? await yerelPaketKur(yol, govde) : null;
    const cevap = await istekDogrudan<T>(cerez, yontem, yol, kurulan?.govde ?? govde);
    if (kurulan !== null && (cevap.durum !== 200 || (cevap.govde as { sonuc?: string } | undefined)?.sonuc !== 'yazildi')) await kurulan.geriAl();
    return cevap;
  }

  async function istekDogrudan<T = unknown>(cerez: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerez, ...(yontem === 'POST' && (yol === '/uretim-emirleri' || yol === '/planli-duruslar') ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }

  // 150 a: ölçüm geçerli bir ölçü aletiyle girilir. Ölçümü konu almayan testlerde aletsiz ölçüme geçerli alet damgalanır; alet kuralının
  // kendi testleri istek() ile doğrudan yazar.
  let gecerliAlet = '';
  const aletDamgala = (depo: string, govde: unknown): unknown => {
    const alan = depo === 'requests' ? 'results' : depo === 'results' ? 'meas' : null;
    if (alan === null || govde === null || typeof govde !== 'object') return govde;
    const olcumler = (govde as Record<string, unknown>)[alan];
    if (olcumler === null || typeof olcumler !== 'object') return govde;
    const damgali = Object.fromEntries(Object.entries(olcumler).map(([k, m]) => [k,
      m !== null && typeof m === 'object' && !('gid' in m) && (depo === 'requests' || (m as { who?: unknown }).who === 'op') ? { ...m, gid: gecerliAlet } : m]));
    return { ...govde, [alan]: damgali };
  };
  const yaz = (rol: ArkonRolu, depo: string, kimlik: string, taban: number | null, govde: unknown = depo === 'downs' ? { ...DURUS, id: kimlik } : { id: kimlik }) =>
    istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/${depo}/${kimlik}/yaz`, { taban, govde: aletDamgala(depo, govde), kaynak: 'g1' });
  const oku = (rol: ArkonRolu, depo: string, kimlik: string) =>
    istek<BelgeCevabi>(cerezler[rol], 'GET', `/arkon/belgeler/${depo}/${kimlik}`);
  // Köprü gibi silmede son bilinen sürümü gönderir; taban verilmezse güncel sürüm okunur.
  const sil = async (rol: ArkonRolu, depo: string, kimlik: string, taban?: number) =>
    istek(cerezler[rol], 'POST', `/arkon/belgeler/${depo}/${kimlik}/sil`, { kaynak: 'g1', taban: taban ?? (await oku('admin', depo, kimlik)).govde.belge?.surum ?? 0 });
  const surum = (c: Cevap<BelgeYazCevabi>): number => (c.govde.sonuc === 'yazildi' ? c.govde.surum : -1);
  // TMI'de ölçü aleti açar; Arkon kimliği (`tmi-alet-<id>`) döner.
  const aletAc = async (no: string, ek: Record<string, unknown>): Promise<string> => {
    const tur = await vt().tek<{ id: number }>("SELECT id FROM olcu_aleti_turu WHERE ad = 'Kumpas'");
    const c = await istek<{ id: number }>(yonetici, 'POST', '/olcu-aletleri', { no, turId: tur?.id, ...ek });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return ALET_ONEKI + String(c.govde.id);
  };

  // Arkon rolü TMI işleminden gelir: kişi, tek Arkon işlemi taşıyan geçici bir role bağlanır (bayraklı yönetici rolü alınır).
  async function arkonKisiKur(kullaniciAdi: string, rol: ArkonRolu): Promise<{ id: number; cerez: string }> {
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const gecici = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, `Geçici ${kullaniciAdi}`]);
    if (!yoneticiRolu || !gecici) throw new Error('rol kurulamadı');
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2), ($1, 'sayfa.arkon')", [gecici.id, ROL_ISLEMI[rol]]);
    if (DURUS_YAZAN_ROLLER.includes(rol)) await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'vardiya.durus-yaz')", [gecici.id]);
    const id = await vt().tx(async (db) => {
      const yeniId = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeniId, gecici.id);
      await rolAl(db, yoneticiId, yeniId, yoneticiRolu.id);
      return yeniId;
    });
    return { id, cerez: await girisCerezi(kullaniciAdi) };
  }

  let yonetici = '';

  let projeId = 0;

  before(async () => {
    ortam = await testVeritabaniKur('arkonguv');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    // Denetim #27: rotasız emir varsayılan kapalı ve projeyle açılır; kurulum ayarı açar, test projesi verir.
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('TEST.PROJE', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.rotasiz-emir', 'true', $1)", [yoneticiId]);
    yonetici = await girisCerezi('yonetici');
    gecerliAlet = await aletAc('GA-1', { ilkKalibrasyon: { sonuc: 'uygun' } });
    for (const rol of ROLLER) {
      const kisi = await arkonKisiKur(`k_${rol}`, rol);
      kisiIdleri[rol] = kisi.id;
      cerezler[rol] = kisi.cerez;
    }
  });

  after(async () => {
    await ortam?.kaldir();
  });

  // Kaynak: arkon/web/src/app/ortak-ayarlar.ts:48 (PERMS0) ve yazma yerlerindeki allowed() denetimleri.
  const YAZAR: Record<string, readonly ArkonRolu[]> = {
    pkgs: ['admin', 'plan', 'prep', 'quality'],
    results: ['admin', 'operator', 'lead', 'quality', 'prep', 'plan'],
    requests: ['admin', 'operator', 'lead', 'quality'],
    // 124 a (19.10): planlamacıya Çizim stüdyosu (page.draw) açıldı; çizim kaydeder, silemez (silme yetkisi verilmedi).
    draws: ['admin', 'plan', 'prep'],
    downs: ['admin', 'plan', 'lead'],
    maint: ['admin', 'maint', 'lead'],
    // A7 (#518): ölçü aletleri TMI Kalibrasyon modülündedir; Arkon'dan kimse yazamaz ve silemez.
    gauges: [],
    logi: ['admin', 'operator', 'lead', 'plan'],
  };
  const SILER: Record<string, readonly ArkonRolu[]> = {
    pkgs: ['admin', 'prep'], results: ['admin'], requests: ['admin'], draws: ['admin', 'prep'],
    downs: ['admin', 'plan', 'lead'], maint: ['admin', 'maint'], logi: ['admin'],
  };
  const KV_YAZAR: Record<string, readonly ArkonRolu[]> = {
    policy: ['admin'], mode: ['admin'],
    handover: ROLLER, ruleTpls: ['admin', 'plan', 'prep'], seedRules: ['admin', 'plan', 'prep'], seedV11: ['admin', 'plan', 'prep'], 'bilinmeyen-anahtar': ['admin'],
  };

  test('depo yazımı rol başınadır: yazabilen rol 200, yazamayan 403 ve belge oluşmaz', async () => {
    let n = 0;
    for (const [depo, izinli] of Object.entries(YAZAR)) {
      for (const rol of ROLLER) {
        const kimlik = `yaz-${depo}-${rol}-${(n += 1)}`;
        const cevap = await yaz(rol, depo, kimlik, 0);
        assert.equal(cevap.durum, izinli.includes(rol) ? 200 : 403, `${depo} ${rol}: ${JSON.stringify(cevap.govde)}`);
        const var_ = (await oku('admin', depo, kimlik)).govde.belge !== null;
        assert.equal(var_, izinli.includes(rol), `${depo} ${rol} belge`);
      }
    }
  });

  test('kv ayar yazımı anahtar başına ve rol başınadır', async () => {
    for (const [anahtar, izinli] of Object.entries(KV_YAZAR)) {
      for (const rol of ROLLER) {
        const cevap = await istek(cerezler[rol], 'POST', `/arkon/belgeler/kv/${anahtar}/yaz`, { taban: 0, govde: { v: { rol } }, kaynak: 'g1' });
        assert.ok([200, 409].includes(cevap.durum) === izinli.includes(rol), `kv/${anahtar} ${rol}: ${cevap.durum}`);
        if (!izinli.includes(rol)) assert.equal(cevap.durum, 403, `kv/${anahtar} ${rol}`);
      }
    }
  });

  test('depo silmesi rol başınadır: silebilen rol belgeyi siler, silemeyen 403 alır ve belge kalır', async () => {
    let n = 0;
    for (const [depo, izinli] of Object.entries(SILER)) {
      for (const rol of ROLLER) {
        const kimlik = `sil-${depo}-${rol}-${(n += 1)}`;
        assert.equal((await yaz('admin', depo, kimlik, 0)).durum, 200);
        const cevap = await sil(rol, depo, kimlik);
        assert.equal(cevap.durum, izinli.includes(rol) ? 200 : 403, `${depo} ${rol}: ${JSON.stringify(cevap.govde)}`);
        assert.equal((await oku('admin', depo, kimlik)).govde.belge === null, izinli.includes(rol), `${depo} ${rol} belge`);
      }
    }
    for (const rol of ROLLER) assert.equal((await sil(rol, 'gauges', 'sil-gauges')).durum, 403, `gauges ${rol}`);
  });

  // B-005: okuma tablosu bugünkü tablet davranışıdır (hangi ekran hangi depoyu okur: bakim-raporlar.ts, pano-planlama.ts, kalite.ts, hazirlik.ts,
  // cizim-studyosu.ts; açılışta herkes downs ve gauges okur ama gauges'u yalnız kalite ekranı kullanır, ortak-ayarlar.ts:145 hatayı yutar).
  const OKUR: Record<string, readonly ArkonRolu[]> = {
    pkgs: ROLLER, results: ROLLER, requests: ROLLER, downs: ROLLER, logi: ROLLER, kv: ROLLER,
    maint: ['admin', 'plan', 'prep', 'quality', 'maint', 'lead'],
    gauges: ['admin', 'plan', 'prep', 'quality', 'lead'],
    draws: ['admin', 'plan', 'prep'],
  };

  test('depo okuması rol başınadır: okuyamayan rol liste ve tek belgede 403 alır, belge dönmez (B-005)', async () => {
    for (const [depo, izinli] of Object.entries(OKUR)) {
      const kimlik = `oku-${depo}`;
      if (depo !== 'kv' && depo !== 'gauges') assert.equal((await yaz('admin', depo, kimlik, 0)).durum, 200, depo);
      for (const rol of ROLLER) {
        const liste = await istek<{ belgeler?: unknown[] }>(cerezler[rol], 'GET', `/arkon/belgeler/${depo}`);
        assert.equal(liste.durum, izinli.includes(rol) ? 200 : 403, `${depo} liste ${rol}`);
        if (!izinli.includes(rol)) assert.equal(liste.govde.belgeler, undefined, `${depo} liste ${rol} gövde`);
        const tek = await oku(rol, depo, depo === 'kv' ? 'handover' : kimlik);
        assert.equal(tek.durum, izinli.includes(rol) ? 200 : 403, `${depo} tek ${rol}`);
      }
    }
  });

  test('B-006, 129, 131 b, denetim #12: Başlat ilk parça onayını beklemez; ilk sağlam sayılır, sonrakiler Kalite Merkezi kararına kadar karar bekleyen yazılır; Arkon numunesi ve operatör ölçümü karar değildir', async () => {
    // Emir paketi: kapı paketin emrinin Kalite Merkezi kararını okur; bu emrin kararı yok (uçtan uca karar yansima.test.ts "denetim #12").
    const paket = 'tmi-ue-990006';
    let n = 0;
    const say = (delta = 1, ek: Record<string, unknown> = {}) => istek<{ eklenen: number }>(cerezler.operator, 'POST', '/arkon/kayitlar/counts/ekle', {
      satirlar: [{ cid: `b006-s${++n}`, machine: 'M-B006', pkgId: paket, kind: 'good', delta, state: 'running', ...ek }], kaynak: 'g1',
    });
    const bekleyen = async () => (await vt().tek<{ kb: number | null }>("SELECT (govde->>'tmiKararBekliyor')::int AS kb FROM arkon_kayit WHERE cid = $1", [`b006-s${n}`]))?.kb ?? null;
    await vt().sorgu("INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('pkgs', $1, $2, 1, $3)",
      [paket, JSON.stringify({ id: paket, machine: 'M-B006', plan: [{ id: 1 }, { id: 2, freq: 'Her 10 parça' }] }), yoneticiId]);
    const basla = await istek<{ eklenen: number }>(cerezler.operator, 'POST', '/arkon/kayitlar/events/ekle', {
      satirlar: [{ cid: 'b006-1', machine: 'M-B006', pkgId: paket, state: 'running', reason: null }], kaynak: 'g1',
    });
    assert.equal(basla.govde.eklenen, 1, JSON.stringify(basla.govde));
    assert.equal((await say(3)).govde.eklenen, 1, 'toplu girişte ilk parçadan fazlası reddedilmez');
    assert.equal(await bekleyen(), 2, 'ilk parça sağlam, kalan ikisi karar bekler');
    assert.equal((await say(1, { tmiKararBekliyor: 0 })).govde.eklenen, 1);
    assert.equal(await bekleyen(), 1, 'istemcinin karar bekleyen alanı yok sayılır');
    assert.equal((await say(-1)).govde.eklenen, 1, 'düzeltme geçer');
    assert.equal(await bekleyen(), null, 'düzeltme karar bekleyen taşımaz');
    assert.equal((await yaz('operator', 'results', paket, 0, { id: paket, meas: { 1: { ok: true, who: 'op' } } })).durum, 200);
    assert.equal((await say()).govde.eklenen, 1);
    assert.equal(await bekleyen(), 1, 'sonuç belgesindeki operatör ölçümü karar değildir');
    assert.equal((await yaz('operator', 'requests', 'rq-b006-op', 0, { id: 'rq-b006-op', pkgId: paket, items: [1], status: 'approved', results: {} })).durum, 403);
    assert.equal((await yaz('quality', 'requests', 'rq-b006', 0, { id: 'rq-b006', pkgId: paket, items: [1], status: 'approved', decidedAt: 1, results: { 1: { ok: true } } })).durum, 200);
    assert.equal((await say()).govde.eklenen, 1);
    assert.equal(await bekleyen(), 1, 'Arkon numune onayı karar değildir; karar Kalite Merkezi ucundadır');
  });

  // Terminal kural 1/5: son numune RED ya da paket revizyonu değiştiyse yeniden başlatma.
  test('yeniden başlatmada son numune RED ya da revizyon değişikliği ilk parça onayı istemez (bugünkü davranış)', async () => {
    const paket = 'ipy-0';
    const olay = (cid: string) => istek<{ eklenen: number }>(cerezler.operator, 'POST', '/arkon/kayitlar/events/ekle', {
      satirlar: [{ cid, machine: 'M-IPY', pkgId: paket, orderNo: 'E-IPY', state: 'running', reason: null }], kaynak: 'g1',
    });
    assert.equal((await yaz('admin', 'pkgs', paket, 0, { id: paket, rev: 'A', plan: [{ id: 1 }] })).durum, 200);
    assert.equal((await yaz('quality', 'requests', 'rq-ipy-0', 0, { id: 'rq-ipy-0', pkgId: paket, rev: 'A', items: [1], status: 'approved', decidedAt: 1, results: { 1: { ok: true } } })).durum, 200);
    assert.equal((await olay('ipy-0-1')).govde.eklenen, 1);
    const b = (await oku('admin', 'pkgs', paket)).govde.belge;
    assert.equal((await yaz('admin', 'pkgs', paket, b?.surum ?? 0, { ...(b?.govde as object), rev: 'B' })).durum, 200);
    assert.equal((await olay('ipy-0-2')).govde.eklenen, 1);
  });

  test('Terminal kural 1/5, 130 a: yeniden ilk parça kararını yalnız yayın rolleri verir; an, numune listesi, kişi ve sayım tabanı sunucudan damgalanır; kararla ilgisiz yazım damgayı korur', async () => {
    // Kapının kendisi (karardan sonra ikinci sağlamın reddi, Kalite Merkezi onayıyla kapanış) emirli pakette: yansima.test.ts "denetim #12: yeniden".
    const paket = 'ipy-1';
    let n = 0;
    const say = () => istek<{ eklenen: number }>(cerezler.operator, 'POST', '/arkon/kayitlar/counts/ekle', {
      satirlar: [{ cid: `ipy-1-${++n}`, machine: 'M-IPY', pkgId: paket, orderNo: 'E-IPY1', kind: 'good', delta: 1, state: 'running' }], kaynak: 'g1',
    });
    const paketOku = async () => (await oku('admin', 'pkgs', paket)).govde.belge!;
    const degistir = async (rol: ArkonRolu, degisim: Record<string, unknown>) => {
      const b = await paketOku();
      return yaz(rol, 'pkgs', paket, b.surum, { ...(b.govde as object), ...degisim });
    };
    const karar = (rol: ArkonRolu, fpRe: Record<string, unknown> | null) => degistir(rol, { fpRe });
    const numune = (kimlik: string, rev: string, status: string) =>
      yaz('quality', 'requests', kimlik, 0, { id: kimlik, pkgId: paket, rev, items: [1], status, decidedAt: 1, note: 'not', results: { 1: { ok: status !== 'rejected', v: 1 } } });
    assert.equal((await yaz('admin', 'pkgs', paket, 0, { id: paket, rev: 'A', plan: [{ id: 1 }] })).durum, 200);
    assert.equal((await numune('rq-ipy-1a', 'A', 'approved')).durum, 200);
    for (let i = 0; i < 3; i += 1) assert.equal((await say()).govde.eklenen, 1);
    assert.equal((await numune('rq-ipy-1b', 'A', 'rejected')).durum, 200);
    assert.equal((await karar('operator', { on: true, key: 'red:rq-ipy-1b', why: 'red' })).durum, 403);
    assert.equal((await karar('quality', { on: true, key: 'red:rq-ipy-1b', why: 'red' })).durum, 403);
    assert.equal((await karar('prep', { on: true, key: 'red:rq-ipy-1b', why: 'red', at: 1, once: [], by: 'Sahte', cnt: 99 })).durum, 200);
    const k1 = (await paketOku()).govde as { fpRe: { at: number; once: string[]; by: string; cnt: number } };
    assert.deepEqual([...k1.fpRe.once].sort(), ['rq-ipy-1a', 'rq-ipy-1b']);
    assert.ok(k1.fpRe.at > 1);
    assert.equal(k1.fpRe.by, 'Deneme k_prep');
    assert.equal(k1.fpRe.cnt, 3);
    assert.equal((await degistir('prep', { note: 'not' })).durum, 200);
    assert.deepEqual(((await paketOku()).govde as typeof k1).fpRe, k1.fpRe);
    assert.equal((await degistir('admin', { rev: 'B' })).durum, 200);
    assert.equal((await karar('plan', { on: true, key: 'rev:B', why: 'revizyon' })).durum, 200);
    assert.notEqual(((await paketOku()).govde as typeof k1).fpRe.at, undefined);
    assert.equal((await say()).govde.eklenen, 1, 'emri olmayan pakette kapı yok');
  });

  test('ilk parça kapısı kapalı pakette, talaşlı olmayan işte ve emri olmayan pakette yoktur (B-006, 131 b)', async () => {
    let n = 0;
    const say = (paket: string) => istek<{ eklenen: number }>(cerezler.operator, 'POST', '/arkon/kayitlar/counts/ekle', {
      satirlar: [{ cid: `b006-k${++n}`, machine: 'M-B006', pkgId: paket, orderNo: `E-${paket}`, kind: 'good', delta: 1, state: 'running' }], kaynak: 'g1',
    });
    const bekleyen = async () => (await vt().tek<{ kb: number | null }>("SELECT coalesce((govde->>'tmiKararBekliyor')::int, 0) AS kb FROM arkon_kayit WHERE cid = $1", [`b006-k${n}`]))?.kb;
    const plan = [{ id: 1 }];
    assert.equal((await yaz('admin', 'pkgs', 'b006-kapali', 0, { id: 'b006-kapali', plan, rules: { q: { firstPiece: false } } })).durum, 200);
    assert.equal((await say('b006-kapali')).govde.eklenen, 1);
    assert.equal((await say('b006-kapali')).govde.eklenen, 1);
    assert.equal((await yaz('admin', 'pkgs', 'b006-montaj', 0, { id: 'b006-montaj', plan, opType: 'montaj' })).durum, 200);
    assert.equal((await say('b006-montaj')).govde.eklenen, 1);
    assert.equal((await say('b006-montaj')).govde.eklenen, 1);
    assert.equal((await yaz('admin', 'pkgs', 'b006-emirsiz', 0, { id: 'b006-emirsiz', plan })).durum, 200);
    assert.equal((await say('b006-emirsiz')).govde.eklenen, 1);
    assert.equal((await say('b006-emirsiz')).govde.eklenen, 1);
    assert.equal(await bekleyen(), 0, 'emri olmayan paketin sayımı TMI\'ye yansımaz, karar beklemez');
    assert.equal((await say('b006-yok')).govde.eklenen, 1, 'paketi olmayan kayıt kapıya takılmaz');
    assert.equal((await say('b006-yok')).govde.eklenen, 1);
  });

  test('kritik ölçüde ikinci kontrol kuralı olan pakette kalite onayı ikinci kontrol işareti olmadan 400 alır; işaretle, kuralsız pakette ve kritiksiz istekte geçer (B-006)', async () => {
    const plan = [{ id: 1, crit: true }, { id: 2 }];
    assert.equal((await yaz('admin', 'pkgs', 'b006-kk', 0, { id: 'b006-kk', plan, rules: { q: { critTwice: true } } })).durum, 200);
    assert.equal((await yaz('admin', 'pkgs', 'b006-kk-yok', 0, { id: 'b006-kk-yok', plan })).durum, 200);
    const istek_ = (kimlik: string, paket: string, items: number[], ek: Record<string, unknown> = {}) =>
      ({ id: kimlik, pkgId: paket, items, status: 'approved', decidedAt: 1, results: Object.fromEntries(items.map((i) => [i, { ok: true }])), ...ek });
    const red = await yaz('quality', 'requests', 'rq-kk-1', 0, istek_('rq-kk-1', 'b006-kk', [1, 2]));
    assert.equal(red.durum, 400, JSON.stringify(red.govde));
    assert.equal((await oku('admin', 'requests', 'rq-kk-1')).govde.belge, null);
    assert.equal((await yaz('quality', 'requests', 'rq-kk-2', 0, istek_('rq-kk-2', 'b006-kk', [1, 2], { c2: true }))).durum, 200);
    assert.equal((await yaz('quality', 'requests', 'rq-kk-3', 0, istek_('rq-kk-3', 'b006-kk', [2]))).durum, 200);
    assert.equal((await yaz('quality', 'requests', 'rq-kk-4', 0, istek_('rq-kk-4', 'b006-kk-yok', [1]))).durum, 200);
    assert.equal((await yaz('quality', 'requests', 'rq-kk-5', 0, istek_('rq-kk-5', 'b006-kk', [1], { status: 'rejected', note: 'ölçü dışı', results: { 1: { ok: false } } }))).durum, 200);
  });

  test('kv belgesini yazan rol bile silemez; silmeyi yalnız yönetici yapar', async () => {
    assert.equal((await istek(cerezler.operator, 'POST', '/arkon/belgeler/kv/handover-sil/yaz', { taban: 0, govde: { v: 1 }, kaynak: 'g1' })).durum, 403);
    assert.equal((await istek(cerezler.lead, 'POST', '/arkon/belgeler/kv/handover/yaz', { taban: 0, govde: { v: { n: 1 } }, kaynak: 'g1' })).durum, 200);
    assert.equal((await sil('lead', 'kv', 'handover')).durum, 403);
    assert.ok((await oku('admin', 'kv', 'handover')).govde.belge);
    assert.equal((await sil('admin', 'kv', 'handover')).durum, 200);
  });

  test('sürümsüz yazım var olan belgenin üstüne yazmaz: taban yok ya da eski ise çakışma döner ve içerik değişmez', async () => {
    const ilk = await yaz('prep', 'pkgs', 'surum-1', 0, { id: 'surum-1', v: 1 });
    assert.equal(ilk.govde.sonuc, 'yazildi');
    const s1 = surum(ilk);
    for (const taban of [null, 0, s1 - 1]) {
      const red = await yaz('prep', 'pkgs', 'surum-1', taban, { id: 'surum-1', v: 99 });
      assert.equal(red.durum, 200);
      assert.deepEqual(red.govde, { sonuc: 'cakisma', guncel: { surum: s1, govde: { id: 'surum-1', v: 1 } } }, `taban ${String(taban)}`);
    }
    assert.deepEqual((await oku('prep', 'pkgs', 'surum-1')).govde.belge, { surum: s1, govde: { id: 'surum-1', v: 1 } });
    const iyi = await yaz('prep', 'pkgs', 'surum-1', s1, { id: 'surum-1', v: 2 });
    assert.equal(iyi.govde.sonuc, 'yazildi');
    // Karşı örnek: olmayan belgenin ilk yazımı sürümsüz (null) de gelebilir.
    assert.equal((await yaz('prep', 'pkgs', 'surum-yeni', null)).govde.sonuc, 'yazildi');
  });

  test('silmede sürüm zorunludur ve eşleşmelidir: sürümsüz silme 400, eşleşmeyen 409 alır ve belge kalır', async () => {
    const s = surum(await yaz('admin', 'draws', 'sil-surum', 0));
    const surumsuz = await istek(cerezler.admin, 'POST', '/arkon/belgeler/draws/sil-surum/sil', { kaynak: 'g1' });
    assert.equal(surumsuz.durum, 400);
    assert.ok((await oku('admin', 'draws', 'sil-surum')).govde.belge);
    const red = await sil('admin', 'draws', 'sil-surum', s - 1);
    assert.equal(red.durum, 409);
    assert.ok((await oku('admin', 'draws', 'sil-surum')).govde.belge);
    assert.equal((await sil('admin', 'draws', 'sil-surum', s)).durum, 200);
    assert.equal((await oku('admin', 'draws', 'sil-surum')).govde.belge, null);
  });

  test('köprünün gönderdiği meşru akışlar geçer: ilk yazım taban 0, sürümle güncelleme, sürümle silme', async () => {
    // operatör: sonuç (ilk yazım taban=0, ardından bildiği sürümle), numune isteği, malzeme isteği, vardiya devri
    const r1 = await yaz('operator', 'results', 'akis-r1', 0, { id: 'akis-r1', state: 'running', good: 1 });
    assert.equal((await yaz('operator', 'results', 'akis-r1', surum(r1), { id: 'akis-r1', state: 'running', good: 2 })).govde.sonuc, 'yazildi');
    assert.equal((await yaz('operator', 'requests', 'akis-q1', 0)).govde.sonuc, 'yazildi');
    assert.equal((await yaz('operator', 'logi', 'akis-l1', 0)).govde.sonuc, 'yazildi');
    assert.equal((await istek(cerezler.operator, 'POST', '/arkon/belgeler/kv/handover/yaz', { taban: 0, govde: { v: { note: 'n' } }, kaynak: 'g1' })).durum, 200);
    // hazırlık: paket kaydet, yayınla, çizim yükle, çizimi sil
    const p1 = await yaz('prep', 'pkgs', 'akis-p1', 0, { id: 'akis-p1', status: 'draft' });
    assert.equal((await yaz('prep', 'pkgs', 'akis-p1', surum(p1), { id: 'akis-p1', status: 'published', steps: [{ id: 's1' }] })).govde.sonuc, 'yazildi');
    assert.equal((await yaz('prep', 'draws', 'akis-d1', 0)).govde.sonuc, 'yazildi');
    assert.equal((await sil('prep', 'draws', 'akis-d1')).durum, 200);
    // kalite: numune kararı, sonuç, paket onayı
    assert.equal((await yaz('quality', 'requests', 'akis-q1', 0)).govde.sonuc, 'cakisma');
    assert.equal((await yaz('quality', 'results', 'akis-r1', 0)).govde.sonuc, 'cakisma');
    const onay = await oku('quality', 'pkgs', 'akis-p1');
    assert.equal((await yaz('quality', 'pkgs', 'akis-p1', onay.govde.belge?.surum ?? null, { id: 'akis-p1', status: 'published', steps: [{ id: 's1' }], approval: { ok: true } })).govde.sonuc, 'yazildi');
    // amir ve yönetici: ayarlar
    assert.equal((await istek(cerezler.lead, 'POST', '/arkon/belgeler/kv/shifts/yaz', { taban: 0, govde: { v: [] }, kaynak: 'g1' })).durum, 403);
    assert.equal((await istek(cerezler.admin, 'POST', '/arkon/belgeler/kv/policy/yaz', { taban: 0, govde: { v: {} }, kaynak: 'g1' })).durum, 200);
  });

  describe('depo başına yetkinin açtığı alan değişiklikleri kapalı (#223 öncesi dar kapanış)', () => {
    const guncel = async (depo: string, kimlik: string): Promise<{ surum: number; govde: Record<string, unknown> }> => {
      const b = (await oku('admin', depo, kimlik)).govde.belge;
      assert.ok(b, `${depo}/${kimlik} yok`);
      return { surum: b.surum, govde: b.govde as Record<string, unknown> };
    };
    const yeniden = async (rol: ArkonRolu, depo: string, kimlik: string, degisim: Record<string, unknown>) => {
      const b = await guncel(depo, kimlik);
      return yaz(rol, depo, kimlik, b.surum, { ...b.govde, ...degisim });
    };

    test('periyodik bakım planını yalnız bakım ve yönetici yazar; amir yalnız "yapıldı" işaretinde lastAt günceller', async () => {
      const plan = { id: 'pm-plan-1', type: 'plan', mc: 'M1', title: 'Yağlama', everyDays: 30 };
      assert.equal((await yaz('lead', 'maint', 'pm-plan-1', 0, plan)).durum, 403);
      assert.equal((await oku('admin', 'maint', 'pm-plan-1')).govde.belge, null);
      assert.equal((await yaz('maint', 'maint', 'pm-plan-1', 0, plan)).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('lead', 'maint', 'pm-plan-1', { everyDays: 90 })).durum, 403);
      assert.equal((await yeniden('lead', 'maint', 'pm-plan-1', { type: 'ariza' })).durum, 403);
      assert.equal((await guncel('maint', 'pm-plan-1')).govde['everyDays'], 30);
      assert.equal((await yeniden('lead', 'maint', 'pm-plan-1', { lastAt: 1000 })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('maint', 'maint', 'pm-plan-1', { everyDays: 60 })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('admin', 'maint', 'pm-plan-1', { everyDays: 45 })).govde.sonuc, 'yazildi');
      // arıza kaydı amire açık kalır
      assert.equal((await yaz('lead', 'maint', 'ar-amir-1', 0, { id: 'ar-amir-1', type: 'ariza', st: 'X', status: 'open' })).govde.sonuc, 'yazildi');
    });

    test('paketi yayınlamak ve geri çekmek yalnız planlama, hazırlık ve yöneticide; kalite yalnız onay yazar', async () => {
      const p = { id: 'yy-1', no: 'YY-1', rev: 'A', machine: 'X', status: 'draft' };
      assert.equal((await yaz('prep', 'pkgs', 'yy-1', 0, p)).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('quality', 'pkgs', 'yy-1', { status: 'published', steps: [{ id: 's1' }] })).durum, 403);
      assert.equal((await guncel('pkgs', 'yy-1')).govde['status'], 'draft');
      assert.equal((await yeniden('quality', 'pkgs', 'yy-1', { approval: { ok: true, at: 5 } })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('plan', 'pkgs', 'yy-1', { status: 'published', steps: [{ id: 's1' }] })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('quality', 'pkgs', 'yy-1', { status: 'draft' })).durum, 403);
      assert.equal((await yeniden('prep', 'pkgs', 'yy-1', { status: 'draft' })).govde.sonuc, 'yazildi');
      // yayında olmayan pakete kalitenin öteki yazımı ve yeni yayında paket açması
      assert.equal((await yaz('quality', 'pkgs', 'yy-2', 0, { ...p, id: 'yy-2', status: 'published', steps: [{ id: 's1' }] })).durum, 403);
      assert.equal((await yaz('prep', 'pkgs', 'yy-3', 0, { ...p, id: 'yy-3', status: 'published', steps: [{ id: 's1' }] })).govde.sonuc, 'yazildi');
    });

    test('adımı olmayan paket yayınlanamaz (T5): taslaktan yayın ve yeni sürüm 400, paket değişmez; adımlı yayınlanır; sürümü değişmeyen düzenleme geçer', async () => {
      const p = { id: 'ad-1', no: 'AD-1', rev: 'A', machine: 'X', status: 'draft', steps: [] };
      assert.equal((await yaz('prep', 'pkgs', 'ad-1', 0, p)).govde.sonuc, 'yazildi', 'adımsız taslak kaydedilir');
      for (const rol of ['prep', 'admin'] as const) {
        const ret = await yeniden(rol, 'pkgs', 'ad-1', { status: 'published', version: 1 });
        assert.equal(ret.durum, 400, rol);
        assert.match(JSON.stringify(ret.govde), /en az bir operasyon adımı/);
      }
      assert.equal((await yeniden('prep', 'pkgs', 'ad-1', { status: 'published', version: 1, steps: undefined })).durum, 400, 'adım alanı yok');
      assert.equal((await guncel('pkgs', 'ad-1')).govde['status'], 'draft');
      assert.equal((await yaz('prep', 'pkgs', 'ad-2', 0, { ...p, id: 'ad-2', status: 'published', version: 1 })).durum, 400, 'yayında açılan yeni paket');
      assert.equal((await yeniden('prep', 'pkgs', 'ad-1', { status: 'published', version: 1, steps: [{ id: 's1', t: 'Bağla' }] })).govde.sonuc, 'yazildi');
      // Yayındaki paketin yeni sürümü adımsızsa reddedilir; sürüm değişmeden başka alan düzenlenir.
      assert.equal((await yeniden('prep', 'pkgs', 'ad-1', { version: 2, steps: [] })).durum, 400);
      assert.equal((await guncel('pkgs', 'ad-1')).govde['version'], 1);
      await vt().sorgu("UPDATE arkon_belge SET govde = jsonb_set(govde, '{steps}', '[]') WHERE depo = 'pkgs' AND kimlik = 'ad-1'");
      assert.equal((await yeniden('prep', 'pkgs', 'ad-1', { note: 'eski adımsız yayın' })).govde.sonuc, 'yazildi');
    });

    test('kalitenin geri gönderdiği paket yayınlanamaz; onay kuralı açıkken onaysız (silinip yeniden açılmış dahil) paket yayınlanamaz', async () => {
      const p = { id: 'yo-1', no: 'YO-1', rev: 'A', machine: 'X', status: 'draft' };
      assert.equal((await yaz('prep', 'pkgs', 'yo-1', 0, p)).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('prep', 'pkgs', 'yo-1', { apReq: { at: 10, by: 'x' } })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('quality', 'pkgs', 'yo-1', { approval: { ok: false, at: 20, note: 'red' } })).govde.sonuc, 'yazildi');
      const ret = await yeniden('prep', 'pkgs', 'yo-1', { status: 'published', steps: [{ id: 's1' }] });
      assert.equal(ret.durum, 403);
      assert.match(JSON.stringify(ret.govde), /kalite onayı/);
      assert.equal((await guncel('pkgs', 'yo-1')).govde['status'], 'draft');
      // yeniden onaya gönderilen paket (onay kuralı kapalıyken) yayınlanır
      assert.equal((await yeniden('prep', 'pkgs', 'yo-1', { apReq: { at: 30, by: 'x' } })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('prep', 'pkgs', 'yo-1', { status: 'published', steps: [{ id: 's1' }] })).govde.sonuc, 'yazildi');
      // onay kuralı açık: onaysız paket yayınlanamaz, silinip yeniden açılan da; onaylı paket yayınlanır; yönetici kuraldan muaf
      const politika = await oku('admin', 'kv', 'policy');
      const pTaban = politika.govde.belge?.surum ?? 0;
      assert.equal((await istek(cerezler.admin, 'POST', '/arkon/belgeler/kv/policy/yaz', { taban: pTaban, govde: { v: { approval: true } }, kaynak: 'g1' })).durum, 200);
      try {
        assert.equal((await yaz('prep', 'pkgs', 'yo-2', 0, { ...p, id: 'yo-2', status: 'published', steps: [{ id: 's1' }] })).durum, 403);
        assert.equal((await yaz('prep', 'pkgs', 'yo-2', 0, { ...p, id: 'yo-2', steps: [{ id: 's1' }] })).govde.sonuc, 'yazildi');
        assert.equal((await yeniden('prep', 'pkgs', 'yo-2', { status: 'published', steps: [{ id: 's1' }] })).durum, 403);
        assert.equal((await yeniden('quality', 'pkgs', 'yo-2', { approval: { ok: true, at: 40 } })).govde.sonuc, 'yazildi');
        assert.equal((await yeniden('prep', 'pkgs', 'yo-2', { status: 'published', steps: [{ id: 's1' }] })).govde.sonuc, 'yazildi');
        assert.equal((await yaz('admin', 'pkgs', 'yo-3', 0, { ...p, id: 'yo-3', status: 'published', steps: [{ id: 's1' }] })).govde.sonuc, 'yazildi');
      } finally {
        const b = (await oku('admin', 'kv', 'policy')).govde.belge;
        await istek(cerezler.admin, 'POST', '/arkon/belgeler/kv/policy/yaz', { taban: b?.surum ?? 0, govde: { v: {} }, kaynak: 'g1' });
      }
    });

    // Kart Arkon 33: onaydan sonra içeriği (plan, adımlar, dosyalar, uyarılar) değişen paketin yayını.
    test('Arkon 33: onay kuralı açıkken onaydan sonra içeriği değişen paket yayınlanmaz; yeniden onaylanınca yayınlanır; içerik dışı değişiklik onayı bozmaz', async () => {
      const p = { id: 'oz-1', no: 'OZ-1', rev: 'A', machine: 'X', status: 'draft', steps: [{ id: 's1', t: 'ilk' }] };
      const politika = await oku('admin', 'kv', 'policy');
      assert.equal((await istek(cerezler.admin, 'POST', '/arkon/belgeler/kv/policy/yaz', { taban: politika.govde.belge?.surum ?? 0, govde: { v: { approval: true } }, kaynak: 'g1' })).durum, 200);
      try {
        assert.equal((await yaz('prep', 'pkgs', 'oz-1', 0, p)).govde.sonuc, 'yazildi');
        assert.equal((await yeniden('quality', 'pkgs', 'oz-1', { approval: { ok: true, at: 40 } })).govde.sonuc, 'yazildi');
        const onayli = (await guncel('pkgs', 'oz-1')).govde['approval'] as { ozet?: unknown };
        assert.match(String(onayli.ozet), /^[0-9a-f]{64}$/);
        // durum, sürüm, zaman ve not içerik değildir: onay geçerli kalır, özet aynen korunur
        assert.equal((await yeniden('prep', 'pkgs', 'oz-1', { note: 'not', updatedAt: 99 })).govde.sonuc, 'yazildi');
        assert.equal(((await guncel('pkgs', 'oz-1')).govde['approval'] as { ozet?: unknown }).ozet, onayli.ozet);
        // istemcinin gönderdiği sahte özet sayılmaz (kalite onayı aynı bırakıp özeti değiştiremez)
        assert.equal((await yeniden('quality', 'pkgs', 'oz-1', { approval: { ...(onayli as object), ozet: 'sahte' } })).govde.sonuc, 'yazildi');
        assert.equal(((await guncel('pkgs', 'oz-1')).govde['approval'] as { ozet?: unknown }).ozet, onayli.ozet);
        assert.equal((await yeniden('prep', 'pkgs', 'oz-1', { steps: [{ id: 's1', t: 'değişti' }] })).govde.sonuc, 'yazildi');
        const ret = await yeniden('prep', 'pkgs', 'oz-1', { status: 'published', version: 1 });
        assert.equal(ret.durum, 403);
        assert.match(JSON.stringify(ret.govde), /içeriği değişti/);
        assert.equal((await guncel('pkgs', 'oz-1')).govde['status'], 'draft');
        // uyarı da içeriktir
        assert.equal((await yeniden('quality', 'pkgs', 'oz-1', { approval: { ok: true, at: 50 } })).govde.sonuc, 'yazildi');
        assert.equal((await yeniden('prep', 'pkgs', 'oz-1', { rules: { warns: [{ id: 'w1', t: 'yeni uyarı' }] } })).govde.sonuc, 'yazildi');
        assert.equal((await yeniden('prep', 'pkgs', 'oz-1', { status: 'published', version: 1 })).durum, 403);
        // yeniden onay: yayınlanır; yayındaki pakette içerik değişip yeni sürüm çıkarılırsa da durur
        assert.equal((await yeniden('quality', 'pkgs', 'oz-1', { approval: { ok: true, at: 60 } })).govde.sonuc, 'yazildi');
        assert.equal((await yeniden('prep', 'pkgs', 'oz-1', { status: 'published', version: 1 })).govde.sonuc, 'yazildi');
        assert.equal((await yeniden('prep', 'pkgs', 'oz-1', { files: [{ id: 'f1', name: 'yeni.pdf' }], version: 2 })).durum, 403);
        // özetsiz eski onay yayını durdurmaz; yönetici onay kuralından muaftır
        assert.equal((await yaz('quality', 'pkgs', 'oz-2', 0, { ...p, id: 'oz-2', approval: { ok: true, at: 1 } })).govde.sonuc, 'yazildi');
        await vt().tx((db) => db.sorgu(`UPDATE arkon_belge SET govde = jsonb_set(govde, '{approval}', (govde->'approval') - 'ozet') WHERE depo = 'pkgs' AND kimlik = 'oz-2'`));
        assert.equal((await yeniden('prep', 'pkgs', 'oz-2', { steps: [{ id: 's8' }] })).govde.sonuc, 'yazildi');
        assert.equal((await yeniden('prep', 'pkgs', 'oz-2', { status: 'published', version: 1 })).govde.sonuc, 'yazildi');
        assert.equal((await yeniden('quality', 'pkgs', 'oz-1', { approval: { ok: true, at: 70 } })).govde.sonuc, 'yazildi');
        assert.equal((await yeniden('admin', 'pkgs', 'oz-1', { steps: [{ id: 's7' }], version: 3 })).govde.sonuc, 'yazildi');
      } finally {
        const b = (await oku('admin', 'kv', 'policy')).govde.belge;
        await istek(cerezler.admin, 'POST', '/arkon/belgeler/kv/policy/yaz', { taban: b?.surum ?? 0, govde: { v: {} }, kaynak: 'g1' });
      }
    });

    test('operatör sonucundaki sayım ve durumu yalnız operatör, amir ve yönetici değiştirir; hazırlık ve kalite belgeyi sayıya dokunmadan yazar', async () => {
      const r = { id: 'ss-1', no: 'SS-1', state: 'running', good: 5, scrap: 1, meas: {}, pins: [{ id: 'p1', by: 'x', at: 1, status: 'open' }] };
      assert.equal((await yaz('operator', 'results', 'ss-1', 0, r)).govde.sonuc, 'yazildi');
      for (const rol of ['prep', 'plan', 'quality'] as const) {
        assert.equal((await yeniden(rol, 'results', 'ss-1', { good: 50 })).durum, 403, `${rol} good`);
        assert.equal((await yeniden(rol, 'results', 'ss-1', { scrap: 0 })).durum, 403, `${rol} scrap`);
        assert.equal((await yeniden(rol, 'results', 'ss-1', { state: 'done' })).durum, 403, `${rol} state`);
      }
      assert.deepEqual([(await guncel('results', 'ss-1')).govde['good'], (await guncel('results', 'ss-1')).govde['scrap']], [5, 1]);
      assert.equal((await yeniden('prep', 'results', 'ss-1', { pins: [{ id: 'p1', by: 'x', at: 1, status: 'done', reply: 'ok' }] })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('quality', 'results', 'ss-1', { meas: { m1: { v: 1, ok: true } } })).govde.sonuc, 'yazildi');
      assert.equal((await yaz('quality', 'results', 'ss-2', 0, { id: 'ss-2', no: 'SS-2', meas: {}, pins: [] })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('lead', 'results', 'ss-1', { good: 4 })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('operator', 'results', 'ss-1', { good: 6 })).govde.sonuc, 'yazildi');
    });

    // AR-BI-1 (kart #1194): terminal biten işte sayımı artırıp azaltabiliyordu.
    test('AR-BI-1: biten işin sonucunda sağlam, hurda ve durum yönetici dahil değişmez; ölçüm ve not yazılır; bitmemiş işte sayım değişir', async () => {
      const r = { id: 'bi-1', no: 'BI-1', state: 'running', good: 5, scrap: 1, baseGood: 0, meas: {}, pins: [{ id: 'p1', by: 'x', at: 1, status: 'open' }] };
      assert.equal((await yaz('operator', 'results', 'bi-1', 0, r)).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('operator', 'results', 'bi-1', { good: 6, scrap: 2 })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('operator', 'results', 'bi-1', { state: 'done' })).govde.sonuc, 'yazildi');
      for (const rol of ['operator', 'lead', 'admin'] as const) {
        assert.equal((await yeniden(rol, 'results', 'bi-1', { good: 7 })).durum, 403, `${rol} good +1`);
        assert.equal((await yeniden(rol, 'results', 'bi-1', { good: 5 })).durum, 403, `${rol} good -1`);
        assert.equal((await yeniden(rol, 'results', 'bi-1', { scrap: 3 })).durum, 403, `${rol} scrap +1`);
        assert.equal((await yeniden(rol, 'results', 'bi-1', { scrap: 1 })).durum, 403, `${rol} scrap -1`);
        assert.equal((await yeniden(rol, 'results', 'bi-1', { baseGood: 6 })).durum, 403, `${rol} baseGood`);
        assert.equal((await yeniden(rol, 'results', 'bi-1', { state: 'running' })).durum, 403, `${rol} state`);
      }
      const son = (await guncel('results', 'bi-1')).govde;
      assert.deepEqual([son['good'], son['scrap'], son['state']], [6, 2, 'done']);
      assert.equal((await yeniden('quality', 'results', 'bi-1', { meas: { m1: { v: 1, ok: true } } })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('prep', 'results', 'bi-1', { pins: [{ id: 'p1', by: 'x', at: 1, status: 'done', reply: 'ok' }] })).govde.sonuc, 'yazildi');
    });

    test('çağrıdan açılan arızada açan çağrıyı açan kişidir: istemcinin ve belgeyi yazan bakımcının adı yazılmaz; çağrısı olmayan arızada açan yazandır', async () => {
      const cagri = { cid: 'oc-c1', callId: 'oc-1', team: 'bakim', phase: 'open', machine: 'X', note: 'Yağ kaçağı' };
      const k = await istek(cerezler.operator, 'POST', '/arkon/kayitlar/calls/ekle', { satirlar: [cagri], kaynak: 'g1' });
      assert.equal(k.durum, 200, JSON.stringify(k.govde));
      const ariza = (id: string, callId?: string) => ({ id, type: 'ariza', st: 'X', title: 'Bakım çağrısı', openedAt: 1, openedBy: 'Sahte Ad', ackAt: 2, status: 'work', ...(callId === undefined ? {} : { callId }) });
      assert.equal((await yaz('maint', 'maint', 'ar-oc-1', 0, ariza('ar-oc-1', 'oc-1'))).govde.sonuc, 'yazildi');
      assert.equal((await guncel('maint', 'ar-oc-1')).govde['openedBy'], 'Deneme k_operator');
      // sonraki yazımda açan değişmez
      assert.equal((await yeniden('maint', 'maint', 'ar-oc-1', { note: 'parça bekleniyor' })).govde.sonuc, 'yazildi');
      assert.equal((await guncel('maint', 'ar-oc-1')).govde['openedBy'], 'Deneme k_operator');
      // karşı örnekler: çağrısız arıza ve kaydı olmayan çağrı kimliği yazanın adını alır
      assert.equal((await yaz('maint', 'maint', 'ar-oc-2', 0, ariza('ar-oc-2'))).govde.sonuc, 'yazildi');
      assert.equal((await guncel('maint', 'ar-oc-2')).govde['openedBy'], 'Deneme k_maint');
      assert.equal((await yaz('maint', 'maint', 'ar-oc-3', 0, ariza('ar-oc-3', 'oc-yok'))).govde.sonuc, 'yazildi');
      assert.equal((await guncel('maint', 'ar-oc-3')).govde['openedBy'], 'Deneme k_maint');
    });

    test('numune isteğinde operatör ve amir boş ölçüm alanını doldurur; dolu ölçümü değiştirmek ve silmek yalnız kalite ve yöneticide', async () => {
      const istek0 = { id: 'nr-dolu-1', machine: 'X', status: 'waiting', items: [1, 2, 3], results: {} };
      assert.equal((await yaz('operator', 'requests', 'nr-dolu-1', 0, istek0)).govde.sonuc, 'yazildi');
      const sonuclar = async (): Promise<Record<string, Record<string, unknown>>> => (await guncel('requests', 'nr-dolu-1')).govde['results'] as Record<string, Record<string, unknown>>;
      assert.equal((await yeniden('operator', 'requests', 'nr-dolu-1', { results: { 1: { v: 10.02, ok: true } } })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('lead', 'requests', 'nr-dolu-1', { results: { ...(await sonuclar()), 2: { v: 5.5, ok: true } } })).govde.sonuc, 'yazildi');
      // dolu ölçüm: değer değişimi ve silme 403, belge değişmez
      const once = await guncel('requests', 'nr-dolu-1');
      assert.equal((await yeniden('operator', 'requests', 'nr-dolu-1', { results: { ...(await sonuclar()), 1: { v: 10.0, ok: true } } })).durum, 403);
      const { 2: _, ...ikisiz } = await sonuclar();
      assert.equal((await yeniden('lead', 'requests', 'nr-dolu-1', { results: ikisiz })).durum, 403);
      assert.equal((await yeniden('prep', 'requests', 'nr-dolu-1', { results: {} })).durum, 403);
      assert.equal((await guncel('requests', 'nr-dolu-1')).surum, once.surum);
      // aynı ölçümleri aynen geri göndermek ve yeni alan eklemek serbest
      assert.equal((await yeniden('operator', 'requests', 'nr-dolu-1', { results: { ...(await sonuclar()), 3: { v: 1, ok: false } } })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('quality', 'requests', 'nr-dolu-1', { results: { ...(await sonuclar()), 1: { v: 10.0, ok: true } } })).govde.sonuc, 'yazildi');
      assert.equal((await yeniden('admin', 'requests', 'nr-dolu-1', { results: {} })).govde.sonuc, 'yazildi');
    });

    test('150 a: yeni ya da değişen ölçüm geçerli ölçü aletiyle girilir; aletsiz ve kalibrasyonu geçmiş aletle 400; değişmeyen eski ölçüme ve kaliteden kopyalanan sonuca bakılmaz', async () => {
      const gecmis = await aletAc('GA-GECMIS', { periyotGun: 30, ilkKalibrasyon: { tarih: '2020-01-10', sonuc: 'uygun' } });
      const ham = (rol: ArkonRolu, depo: string, kimlik: string, taban: number | null, govde: unknown) =>
        istek<BelgeYazCevabi & { mesaj?: string }>(cerezler[rol], 'POST', `/arkon/belgeler/${depo}/${kimlik}/yaz`, { taban, govde, kaynak: 'g1' });
      const istek0 = { id: 'nr-alet-1', machine: 'X', status: 'waiting', items: [1, 2], results: {} };
      assert.equal((await ham('quality', 'requests', 'nr-alet-1', 0, istek0)).govde.sonuc, 'yazildi');
      const s0 = (await guncel('requests', 'nr-alet-1')).surum;
      const aletsiz = await ham('quality', 'requests', 'nr-alet-1', s0, { ...istek0, results: { 1: { v: 1, ok: true } } });
      assert.equal(aletsiz.durum, 400);
      assert.equal(aletsiz.govde.mesaj, ILETILER.aletZorunlu);
      const eski = await ham('quality', 'requests', 'nr-alet-1', s0, { ...istek0, results: { 1: { v: 1, ok: true, gid: gecmis } } });
      assert.equal(eski.durum, 400);
      assert.equal(eski.govde.mesaj, ILETILER.aletGecersiz);
      assert.equal((await ham('quality', 'requests', 'nr-alet-1', s0, { ...istek0, results: { 1: { v: 1, ok: true, gid: ALET_ONEKI + '999999' } } })).durum, 400);
      assert.equal((await guncel('requests', 'nr-alet-1')).surum, s0);
      assert.equal((await ham('quality', 'requests', 'nr-alet-1', s0, { ...istek0, results: { 1: { v: 1, ok: true, gid: gecerliAlet, gno: 'GA-1' } } })).govde.sonuc, 'yazildi');

      // 150 a öncesi girilmiş aletsiz ölçüm: değişmedikçe yeniden yazımı engellemez.
      await vt().sorgu(`UPDATE arkon_belge SET govde = jsonb_set(govde, '{results,2}', '{"v": 2, "ok": true}') WHERE depo = 'requests' AND kimlik = 'nr-alet-1'`);
      const b = await guncel('requests', 'nr-alet-1');
      assert.equal((await ham('quality', 'requests', 'nr-alet-1', b.surum, { ...b.govde, note: 'not' })).govde.sonuc, 'yazildi');

      // Sonuç belgesi: operatörün kendi ölçümü (who: 'op') aleti ister; kalite kararıyla kopyalanan sonuç istemez.
      const sonuc0 = { id: 'nr-alet-p', state: 'running', good: 0, meas: {} };
      assert.equal((await ham('operator', 'results', 'nr-alet-p', 0, sonuc0)).govde.sonuc, 'yazildi');
      const r0 = (await guncel('results', 'nr-alet-p')).surum;
      assert.equal((await ham('operator', 'results', 'nr-alet-p', r0, { ...sonuc0, meas: { 1: { v: 1, ok: true, who: 'op', cnt: 0 } } })).durum, 400);
      assert.equal((await ham('operator', 'results', 'nr-alet-p', r0, { ...sonuc0, meas: { 1: { v: 1, ok: true, who: 'op', cnt: 0, gid: gecmis } } })).durum, 400);
      assert.equal((await ham('operator', 'results', 'nr-alet-p', r0, { ...sonuc0, meas: { 1: { v: 1, ok: true } } })).govde.sonuc, 'yazildi');
      const r1 = (await guncel('results', 'nr-alet-p')).surum;
      assert.equal((await ham('operator', 'results', 'nr-alet-p', r1, { ...sonuc0, meas: { 1: { v: 1, ok: true }, 2: { v: 2, ok: true, who: 'op', cnt: 0, gid: gecerliAlet } } })).govde.sonuc, 'yazildi');
    });
  });

  describe('kayıt zamanı, kişi, kaynak ve değişiklik günlüğü', () => {
    const ekle = (cerez: string, tur: string, satirlar: Record<string, unknown>[]) =>
      istek<{ eklenen: number }>(cerez, 'POST', `/arkon/kayitlar/${tur}/ekle`, { satirlar, kaynak: 'g1' });
    const kayitlar = (cerez: string, tur: string, sorgu = '') => istek<{ satirlar: Record<string, unknown>[] }>(cerez, 'GET', `/arkon/kayitlar/${tur}${sorgu}`);

    test('kayıt zamanı: istemci zamanı 12 saat geri ve 2 dakika ileri penceresindeyse esastır, dışındaysa sunucu saati yazılır; istemciZamani her durumda saklanır', async () => {
      const simdi = Date.now();
      const pencere = [['iyi-1', simdi - 3600e3, true], ['iyi-2', simdi - 11 * 3600e3, true], ['iyi-3', simdi + 60e3, true], ['kot-1', simdi - 13 * 3600e3, false], ['kot-2', simdi + 3 * 60e3, false], ['kot-3', simdi + 86400e3, false]] as const;
      const c = await ekle(cerezler.operator, 'counts', pencere.map(([cid, at]) => ({ cid: `pz-${cid}`, at, kind: 'good', delta: 1 })));
      assert.equal(c.govde.eklenen, 6);
      const sonra = Date.now();
      const okunan = (await kayitlar(cerezler.admin, 'counts', `?baslangic=${simdi - 20 * 3600e3}`)).govde.satirlar.filter((s) => String(s['cid']).startsWith('pz-'));
      for (const [cid, at, esas] of pencere) {
        const s = okunan.find((x) => x['cid'] === `pz-${cid}`);
        assert.ok(s, cid);
        assert.equal(s['istemciZamani'], at, cid);
        if (esas) assert.equal(s['at'], at, cid);
        else assert.ok(Number(s['at']) >= simdi && Number(s['at']) <= sonra, cid);
      }
    });

    test('kayıt zamanı sunucu saatidir; istemcinin zamanı yalnız istemciZamani alanında kalır', async () => {
      const once = Date.now();
      const gecmis = Date.parse('2001-01-01T00:00:00Z');
      const gelecek = Date.parse('2100-01-01T00:00:00Z');
      const cevap = await ekle(cerezler.operator, 'counts', [
        { cid: 'zm-1', at: gecmis, kind: 'good', delta: 1 }, { cid: 'zm-2', at: gelecek, kind: 'good', delta: 1 }, { cid: 'zm-3', kind: 'good', delta: 1 },
      ]);
      assert.equal(cevap.govde.eklenen, 3);
      const sonra = Date.now();
      const okunan = (await kayitlar(cerezler.admin, 'counts', '?baslangic=' + String(once - 1000))).govde.satirlar.filter((s) => String(s['cid']).startsWith('zm-'));
      assert.equal(okunan.length, 3);
      for (const satir of okunan) assert.ok(Number(satir['at']) >= once && Number(satir['at']) <= sonra, `${String(satir['cid'])}: ${String(satir['at'])}`);
      assert.deepEqual(okunan.map((s) => s['istemciZamani']), [gecmis, gelecek, null]);
      const sutun = await vt().tek<{ zaman: Date }>("SELECT zaman FROM arkon_kayit WHERE cid = 'zm-2'");
      assert.ok((sutun?.zaman.getTime() ?? 0) <= sonra);
    });

    test('kişi alanlarının hepsi oturumdan gelir: istemcinin yazdığı userId, userName, by ve benzerleri atılır', async () => {
      assert.equal((await ekle(cerezler.operator, 'events', [{
        cid: 'kz-1', state: 'running', userId: '999', userName: 'Sahte Kişi', by: 'Sahte', who: 'Sahte', userRole: 'admin', operatorName: 'Sahte',
      }])).govde.eklenen, 1);
      const satir = (await kayitlar(cerezler.admin, 'events')).govde.satirlar.find((s) => s['cid'] === 'kz-1');
      assert.equal(satir?.['userId'], String(kisiIdleri.operator));
      assert.equal(satir?.['userName'], 'Deneme k_operator');
      for (const alan of ['by', 'who', 'userRole', 'operatorName']) assert.equal(alan in (satir ?? {}), false, alan);
      const kisi = await vt().tek<{ kisi_id: number }>("SELECT kisi_id FROM arkon_kayit WHERE cid = 'kz-1'");
      assert.equal(kisi?.kisi_id, kisiIdleri.operator);
    });

    test('istemciden gelen makine kaynağı (src: auto) 400 alır ve hiçbir satır yazılmaz; öteki kaynaklar geçer', async () => {
      for (const tur of ['events', 'counts']) {
        for (const rol of ['operator', 'admin'] as const) {
          const red = await ekle(cerezler[rol], tur, [{ cid: `src-ok-${tur}-${rol}`, state: 'running', src: 'op' }, { cid: `src-red-${tur}-${rol}`, src: 'auto' }]);
          assert.equal(red.durum, 400, `${tur} ${rol}`);
        }
      }
      const sayi = await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM arkon_kayit WHERE cid LIKE 'src-%'");
      assert.equal(sayi?.n, 0);
      assert.equal((await ekle(cerezler.operator, 'events', [{ cid: 'src-ok-1', state: 'running', src: 'op' }])).govde.eklenen, 1);
      assert.equal((await ekle(cerezler.quality, 'meas', [{ cid: 'src-ok-2', pkgId: 'p', itemId: 1, value: 1, ok: true, src: 'quality' }])).govde.eklenen, 1);
    });

    test('değişiklik günlüğü (audit) istemciden yazılamaz; sunucu belge yazma ve silmede kendisi üretir', async () => {
      for (const rol of ROLLER) {
        const red = await ekle(cerezler[rol], 'audit', [{ cid: `au-${rol}`, area: 'paket', action: 'sahte', target: 'x' }]);
        assert.equal(red.durum, 400, rol);
      }
      assert.equal((await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM arkon_kayit WHERE cid LIKE 'au-%'"))?.n, 0);

      const once = Date.now();
      const p1 = surum(await yaz('prep', 'pkgs', 'au-p1', 0, { id: 'au-p1', no: 'N1', status: 'draft' }));
      const p2 = surum(await yaz('prep', 'pkgs', 'au-p1', p1, { id: 'au-p1', no: 'N1', status: 'draft', note: 'x' }));
      const p3 = surum(await yaz('prep', 'pkgs', 'au-p1', p2, { id: 'au-p1', no: 'N1', status: 'published', steps: [{ id: 's1' }] }));
      assert.ok(p3 > 0);
      assert.equal((await sil('prep', 'pkgs', 'au-p1')).durum, 200);
      await yaz('operator', 'results', 'au-r1', 0, { id: 'au-r1', good: 1 });
      const vs = (await istek<BelgeCevabi>(cerezler.admin, 'GET', '/arkon/belgeler/kv/mode')).govde.belge?.surum ?? 0;
      assert.equal(surum(await istek<BelgeYazCevabi>(cerezler.admin, 'POST', '/arkon/belgeler/kv/mode/yaz', { taban: vs, govde: { v: { gece: true } }, kaynak: 'g1' })) > 0, true);
      const satirlar = (await kayitlar(cerezler.admin, 'audit', '?baslangic=' + String(once - 1000))).govde.satirlar;
      const paket = satirlar.filter((s) => s['target'] === 'N1');
      // Taslak notu değişimi günlüğe girmez; durum değişimi ve silme girer. Yerel paket önceden kurulu sayılır (A5); oluşturma satırı
      // TMI taslağının ilk kaydında sınanır ("A5: yeni paket yalnız TMI emrinin paketidir").
      assert.deepEqual(paket.map((s) => s['action']), ['yayınlandı', 'silindi']);
      for (const s of paket) {
        assert.equal(s['area'], 'paket');
        assert.equal(s['userId'], String(kisiIdleri.prep));
        assert.equal(s['userName'], 'Deneme k_prep');
        assert.ok(Number(s['at']) >= once);
        assert.equal(typeof s['cid'], 'string');
      }
      assert.equal(satirlar.some((s) => s['target'] === 'au-r1'), false, 'sonuç yazımı günlüğe girmez');
      const kip = satirlar.filter((s) => s['area'] === 'sistem').at(-1);
      assert.equal(kip?.['userId'], String(kisiIdleri.admin));
      assert.equal(kip?.['target'], '');
      // Arkon'un değişiklik günlüğü ekranı satırın bu alanlarını okur (cid, at, userName, area, action, target, detail).
      for (const alan of ['cid', 'at', 'userName', 'area', 'action', 'target']) assert.ok(alan in (paket[0] ?? {}), alan);
    });
  });

  describe('çizim svg\'si ve rapora giren alanların biçimi', () => {
    const gercekSvg = GERCEK_CIZIM_SVG;
    const paket = (id: string, svg: unknown) => ({ id, machine: 'X', plan: [], derived: { 'ozet+imza': { kind: 'step', fa: 2, V: {}, D: { svg, w: 1000, h: 707, balloons: [] } } } });

    const KOTU_YUKLER: Record<string, string> = {
      script: '<script>alert(1)</script>',
      'g içinde script': '<g><script>alert(1)</script></g>',
      'büyük harf script': '<SCRIPT>alert(1)</SCRIPT>',
      'karışık harf script': '<ScRiPt>alert(1)</ScRiPt>',
      'iç içe bozuk script': '<<script>script>alert(1)<</script>/script>',
      'etiket içinde etiket': '<g <script>alert(1)</script>></g>',
      onerror: '<path d="M0 0" onerror="alert(1)"/>',
      onload: '<g onload="alert(1)"></g>',
      'büyük harf onload': '<g ONLOAD="alert(1)"></g>',
      'tek tırnaklı olay': '<g onclick=\'alert(1)\'></g>',
      'tırnaksız olay': '<g onclick=alert(1)></g>',
      'svg onload': '<svg onload="alert(1)"></svg>',
      'a href javascript': '<a href="javascript:alert(1)"><text>x</text></a>',
      'use href javascript': '<use href="javascript:alert(1)"/>',
      'use xlink:href data': '<use xlink:href="data:image/svg+xml;base64,AAAA"/>',
      'use dış adres': '<use href="https://evil.example/x.svg#a"/>',
      'varlık kodlu javascript': '<use href="&#x6A;avascript:alert(1)"/>',
      'varlık kodlu url': '<path d="M0 0" style="fill:&#117;rl(javascript:alert(1))"/>',
      'image dış adres': '<image href="https://evil.example/x.png"/>',
      'image xlink:href': '<image xlink:href="https://evil.example/x.png"/>',
      foreignObject: '<foreignObject><iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe></foreignObject>',
      'style url': '<path d="M0 0" style="fill:url(https://evil.example/x)"/>',
      'style url javascript': '<path d="M0 0" style="fill:url(javascript:alert(1))"/>',
      'style expression': '<path d="M0 0" style="width:expression(alert(1))"/>',
      'style import': '<path d="M0 0" style="@import url(x)"/>',
      'style etiketi': '<style>@import url(https://evil.example/x.css)</style>',
      iframe: '<iframe src="javascript:alert(1)"></iframe>',
      object: '<object data="javascript:alert(1)"></object>',
      animate: '<animate attributeName="href" values="javascript:alert(1)"/>',
      set: '<set attributeName="onmouseover" to="alert(1)"/>',
      'cdata': '<![CDATA[<script>alert(1)</script>]]>',
      yorum: '<!-- --><g></g>',
      'xml bildirimi': '<?xml version="1.0"?><g></g>',
      kapanmamış: '<g><path d="M0 0"/>',
      'yanlış kapanış': '<g></path></g>',
      'fazla kapanış': '<g></g></g>',
      'ham büyüktür': '<text>a > b</text>',
      'metinde etiket': '<text><b>x</b></text>',
      'yabancı varlık': '<text>&#60;script&#62;</text>',
      'öznitelikte etiket': '<g class="a<script>"></g>',
      'çift öznitelik': '<g class="a" class="b"></g>',
      'bilinmeyen öznitelik': '<g data-x="1"></g>',
      'id çakışması': '<g id="root"></g>',
      'üstte metin': 'serbest metin<g></g>',
      'image-set': '<path d="M0 0" style="fill:image-set(url(x) 1x)"/>',
      'webkit image-set': '<path d="M0 0" style="fill:-webkit-image-set(url(x) 1x)"/>',
      'element()': '<path d="M0 0" style="fill:element(#a)"/>',
      'rgb işlevi': '<path d="M0 0" style="fill:rgb(1,2,3)"/>',
      'url boşluklu': '<path d="M0 0" fill="url (https://evil.example/x)"/>',
      'NBSP ayırıcı': '<g class="a"></g>',
      'VT ayırıcı': '<g\u000bclass="a"></g>',
      'BOM ayırıcı': '<g﻿class="a"></g>',
      'üst düzey NBSP metni': ' <g></g>',
      'etiket sonu NBSP': '<g ></g>',
      'style özellik listesi dışı': '<path d="M0 0" style="position:fixed"/>',
      'style karışık bildirim': '<path d="M0 0" style="animation-delay:1s;position:fixed"/>',
      'style büyük harf özellik': '<path d="M0 0" style="POSITION:fixed"/>',
      'href path üzerinde': '<path d="M0 0" href="#cz-a"/>',
      'href g üzerinde': '<g href="#cz-a"></g>',
      'xlink:href text üzerinde': '<text xlink:href="#cz-a">x</text>',
    };

    test('bilinen XSS yüklerinin hepsi reddedilir (400) ve belge yazılmaz; paketin her yerinde svg alanı denetlenir', async () => {
      let n = 0;
      for (const [ad, yuk] of Object.entries(KOTU_YUKLER)) {
        const kimlik = `svg-red-${(n += 1)}`;
        const cevap = await yaz('prep', 'pkgs', kimlik, 0, paket(kimlik, yuk));
        assert.equal(cevap.durum, 400, ad);
        assert.equal((cevap.govde as unknown as { kod: string }).kod, 'DOGRULAMA', ad);
        assert.equal((await oku('admin', 'pkgs', kimlik)).govde.belge, null, ad);
        // Gömülü kötü yük: gerçek çizimin sonuna eklenmiş.
        const gomulu = `svg-gomulu-${n}`;
        assert.equal((await yaz('prep', 'pkgs', gomulu, 0, paket(gomulu, gercekSvg + yuk))).durum, 400, `gömülü ${ad}`);
      }
      // Aynı yük başka belgede, başka derinlikte, başka depoda da reddedilir.
      assert.equal((await yaz('prep', 'draws', 'svg-draw', 0, { id: 'svg-draw', svg: '<script>alert(1)</script>' })).durum, 400);
      assert.equal((await yaz('prep', 'draws', 'svg-draw2', 0, { id: 'svg-draw2', a: [{ b: { svg: '<g onload="x"></g>' } }] })).durum, 400);
      assert.equal((await istek(cerezler.admin, 'POST', '/arkon/belgeler/kv/mode/yaz', { taban: 0, govde: { v: { svg: '<script></script>' } }, kaynak: 'g1' })).durum, 400);
      // svg metin değilse (nesne, sayı) reddedilir; boş ve null kabul edilir.
      assert.equal((await yaz('prep', 'draws', 'svg-nesne', 0, { id: 'x', svg: { a: 1 } })).durum, 400);
      assert.equal((await yaz('prep', 'draws', 'svg-bos', 0, { id: 'x', svg: '' })).govde.sonuc, 'yazildi');
      assert.equal((await yaz('prep', 'draws', 'svg-null', 0, { id: 'x', svg: null })).govde.sonuc, 'yazildi');
    });

    test('Arkon\'un gerçek boru çizimi (dış çap, delik çıkma çizgisi) aynen geçer; hata alan yolu sınırlıdır', async () => {
      const govde = paket('svg-ok-boru', GERCEK_BORU_SVG);
      assert.equal((await yaz('prep', 'pkgs', 'svg-ok-boru', 0, govde)).govde.sonuc, 'yazildi');
      assert.deepEqual((await oku('prep', 'pkgs', 'svg-ok-boru')).govde.belge?.govde, govde);
      let derin: unknown = { svg: '<script></script>' };
      for (let i = 0; i < 400; i += 1) derin = { ['a'.repeat(30) + i]: derin };
      const red = await yaz('prep', 'draws', 'svg-derin', 0, derin);
      assert.equal(red.durum, 400);
      assert.ok(((red.govde as unknown as { alan?: string }).alan ?? '').length <= 200);
    });

    test('yazım denetiminden önce saklanmış güvensiz çizim okumada dönmez: hazır sonuç atılır, öteki svg boşalır; liste, tek okuma ve çakışma cevabı aynı', async () => {
      const kirli = { ...paket('svg-eski', '<g onload="alert(1)"></g>'), not: { svg: '<script>1</script>' } };
      await vt().sorgu("INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('pkgs', 'svg-eski', $1, 7, $2)", [JSON.stringify(kirli), yoneticiId]);
      const beklenen = { id: 'svg-eski', machine: 'X', plan: [], derived: {}, not: { svg: '' } };
      assert.deepEqual((await oku('operator', 'pkgs', 'svg-eski')).govde.belge?.govde, beklenen);
      const liste = await istek<{ belgeler: { kimlik: string; govde: unknown }[] }>(cerezler.operator, 'GET', '/arkon/belgeler/pkgs');
      assert.deepEqual(liste.govde.belgeler.find((b) => b.kimlik === 'svg-eski')?.govde, beklenen);
      const cakisma = await yaz('prep', 'pkgs', 'svg-eski', 3, { id: 'svg-eski', machine: 'X' });
      assert.equal(cakisma.govde.sonuc, 'cakisma');
      assert.deepEqual((cakisma.govde as unknown as { guncel: { govde: unknown } }).guncel.govde, beklenen);
      // Saklanan satır değişmez; temiz belge aynen döner.
      assert.deepEqual((await vt().tek<{ govde: unknown }>("SELECT govde FROM arkon_belge WHERE depo = 'pkgs' AND kimlik = 'svg-eski'"))?.govde, kirli);
      const temiz = paket('svg-temiz', gercekSvg);
      assert.equal((await yaz('prep', 'pkgs', 'svg-temiz', 0, temiz)).govde.sonuc, 'yazildi');
      assert.deepEqual((await oku('operator', 'pkgs', 'svg-temiz')).govde.belge?.govde, temiz);
    });

    test('Arkon\'un gerçek flanş çizimi (delik çemberi, PCD) aynen geçer; PCD çemberine eklenen olay özniteliği reddedilir', async () => {
      assert.match(GERCEK_FLANS_SVG, /<circle class="ctr" cx="[0-9.]+" cy="[0-9.]+" r="[0-9.]+"\/>/);
      assert.ok(GERCEK_FLANS_SVG.includes('PCD Ø50'));
      const govde = paket('svg-ok-flans', GERCEK_FLANS_SVG);
      assert.equal((await yaz('prep', 'pkgs', 'svg-ok-flans', 0, govde)).govde.sonuc, 'yazildi');
      assert.deepEqual((await oku('operator', 'pkgs', 'svg-ok-flans')).govde.belge?.govde, govde);
      const kotu = GERCEK_FLANS_SVG.replace('<circle class="ctr"', '<circle onload="alert(1)" class="ctr"');
      assert.notEqual(kotu, GERCEK_FLANS_SVG);
      assert.equal((await yaz('prep', 'pkgs', 'svg-red-flans', 0, paket('svg-red-flans', kotu))).durum, 400);
    });

    test('Arkon\'un gerçek çizim sonucu aynen geçer: paket belgesinde hazır sonuç (derived) olduğu gibi yazılır ve okunur', async () => {
      const govde = paket('svg-ok-1', gercekSvg);
      const y = await yaz('prep', 'pkgs', 'svg-ok-1', 0, govde);
      assert.equal(y.durum, 200, JSON.stringify(y.govde));
      assert.equal(y.govde.sonuc, 'yazildi');
      assert.deepEqual((await oku('quality', 'pkgs', 'svg-ok-1')).govde.belge?.govde, govde);
      // Meşru küçük parçalar: iç başvuru, kaçışlı metin, grup içi metin.
      const kucuk = '<defs><clipPath id="cz-kirp"><rect x="0" y="0" width="10" height="10"/></clipPath></defs><use href="#cz-kirp"/><g clip-path="url(#cz-kirp)"><text x="1" y="2">A &amp; B &lt; C</text></g><title>Başlık</title>';
      assert.equal((await yaz('prep', 'draws', 'svg-ok-2', 0, { id: 'svg-ok-2', svg: kucuk })).govde.sonuc, 'yazildi');
    });

    test('rapora kaçışsız giren alanlar sunucuda biçim denetimi görür: karakteristik id sayı, ölçüm itemId sayı, numune durumu izinli listeden', async () => {
      const kotuId = ['1<img src=x onerror=alert(1)>', '"><script>1</script>', 'x', 1.5, null, true];
      for (const id of kotuId) {
        const k = `bicim-${String(id).length}-${typeof id}`;
        const cevap = await yaz('prep', 'pkgs', k, 0, { id: k, machine: 'X', plan: [{ id, nom: 'n' }] });
        assert.equal(cevap.durum, 400, String(id));
      }
      assert.equal((await yaz('prep', 'pkgs', 'bicim-plan-notarray', 0, { id: 'x', plan: 'x' })).durum, 400);
      assert.equal((await yaz('prep', 'pkgs', 'bicim-ok', 0, { id: 'bicim-ok', machine: 'X', plan: [{ id: 1, nom: 'a' }, { id: 2, nom: 'b' }] })).govde.sonuc, 'yazildi');

      for (const itemId of ['4', '<img src=x onerror=alert(1)>', 1.5, null, {}]) {
        const red = await istek(cerezler.quality, 'POST', '/arkon/kayitlar/meas/ekle', {
          satirlar: [{ cid: `bicim-m-${JSON.stringify(itemId)}`, pkgId: 'p', itemId, value: 1, ok: true }], kaynak: 'g1',
        });
        assert.equal(red.durum, 400, JSON.stringify(itemId));
      }
      assert.equal((await istek<{ eklenen: number }>(cerezler.quality, 'POST', '/arkon/kayitlar/meas/ekle', { satirlar: [{ cid: 'bicim-m-ok', pkgId: 'p', itemId: 4, value: 1, ok: true }], kaynak: 'g1' })).govde.eklenen, 1);
      assert.equal((await istek<{ eklenen: number }>(cerezler.quality, 'POST', '/arkon/kayitlar/meas/ekle', { satirlar: [{ cid: 'bicim-m-ok2', pkgId: 'p', value: 1, ok: true }], kaynak: 'g1' })).govde.eklenen, 1);

      for (const status of ['x"><img src=x onerror=alert(1)>', 'APPROVED', '', 5, null, 'bilinmeyen']) {
        const k = `bicim-q-${typeof status}-${String(status).length}`;
        assert.equal((await yaz('quality', 'requests', k, 0, { id: k, machine: 'X', status })).durum, 400, JSON.stringify(status));
      }
      // Uçtan uca deneme 2. tur: kalite ölçü girmeden ve gerekçesiz reddedebiliyordu.
      const ret = (k: string, ek: Record<string, unknown>) => yaz('quality', 'requests', k, 0, { id: k, machine: 'X', status: 'rejected', ...ek });
      const olcusuz = await ret('bicim-ret-1', { note: 'çapak' });
      assert.deepEqual([olcusuz.durum, (olcusuz.govde as { mesaj?: string }).mesaj], [400, 'Numune reddi için en az bir ölçü girilmeli.']);
      assert.equal((await ret('bicim-ret-2', { note: 'çapak', results: {} })).durum, 400);
      const gerekcesiz = await ret('bicim-ret-3', { results: { 1: { v: 1, ok: false } }, note: '  ' });
      assert.deepEqual([gerekcesiz.durum, (gerekcesiz.govde as { mesaj?: string }).mesaj], [400, 'Numune reddi için gerekçe yazılmalı.']);
      assert.equal((await ret('bicim-ret-4', { results: { 1: { v: 1, ok: false } }, note: 'çapak' })).govde.sonuc, 'yazildi');
      for (const status of ['waiting', 'measuring', 'approved', 'rejected', 'deviation']) {
        const karar = status === 'rejected' ? { note: 'ölçü dışı', results: { 1: { v: 1, ok: false } } } : {};
        assert.equal((await yaz('quality', 'requests', `bicim-q-${status}`, 0, { id: `bicim-q-${status}`, machine: 'X', status, ...karar })).govde.sonuc, 'yazildi', status);
      }
    });
  });

  describe('dosya kotası ve kişi başına yükleme şeridi', () => {
    const parcala = (icerik: Buffer): { ozet: string; p0: string; p1: string } => {
      const yari = Math.floor(icerik.length / 2);
      return {
        ozet: createHash('sha256').update(icerik).digest('hex'),
        p0: icerik.subarray(0, yari).toString('base64'), p1: icerik.subarray(yari).toString('base64'),
      };
    };
    let sayac = 0;
    const yeni = () => parcala(Buffer.from(`ISO-10303-21; kota ${(sayac += 1)} `.repeat(30)));
    const gonder = (rol: ArkonRolu, ozet: string, sira: number, veri: string, toplam = 2) =>
      istek<{ tamam: boolean }>(cerezler[rol], 'POST', `/arkon/dosyalar/${ozet}/parca`, { sira, toplam, veri });
    const parcaSayisi = async (ozet: string): Promise<number> =>
      (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_dosya_parcasi WHERE ozet = $1', [ozet]))?.n ?? -1;
    const acikSayisi = async (rol: ArkonRolu): Promise<number> =>
      (await vt().tek<{ n: number }>('SELECT count(DISTINCT ozet)::int AS n FROM arkon_dosya_parcasi WHERE yukleyen_id = $1', [kisiIdleri[rol]]))?.n ?? -1;
    const eskit = (ozet: string, dakika: number) =>
      vt().sorgu('UPDATE arkon_dosya_parcasi SET zaman = now() - make_interval(mins => $2) WHERE ozet = $1', [ozet, dakika]);

    test('kişi başına en çok 5 açık yükleme: sınır içinde yazılır; aşılınca altıncı parça 429 ile reddedilir, eski yüklemeler yerinde kalır; başka kişi etkilenmez', async () => {
      const dosyalar = Array.from({ length: 6 }, yeni);
      for (const [i, d] of dosyalar.slice(0, 5).entries()) {
        assert.equal((await gonder('lead', d.ozet, 0, d.p0)).durum, 200);
        await eskit(d.ozet, 5 - i);
      }
      assert.equal(await acikSayisi('lead'), 5);
      const altinci = dosyalar[5];
      assert.ok(altinci);
      const red = await gonder('lead', altinci.ozet, 0, altinci.p0);
      assert.equal(red.durum, 429);
      assert.equal((red.govde as { kod?: string }).kod, 'COK_ISTEK');
      assert.match(String((red.govde as { mesaj?: string }).mesaj), /Açık yükleme sayısı sınırına ulaşıldı/);
      assert.equal(await acikSayisi('lead'), 5);
      assert.equal(await parcaSayisi(altinci.ozet), 0);
      for (const d of dosyalar.slice(0, 5)) assert.equal(await parcaSayisi(d.ozet), 1, 'hiçbir açık yükleme kendiliğinden silinmez');
      // Açık yüklemenin kendi öteki parçası kota yemez; tamamlanan yükleme sınırdan düşer, sonra altıncı girer.
      const ilk = dosyalar[0];
      assert.ok(ilk);
      assert.deepEqual((await gonder('lead', ilk.ozet, 1, ilk.p1)).govde, { tamam: true });
      assert.equal(await acikSayisi('lead'), 4);
      assert.equal((await gonder('lead', altinci.ozet, 0, altinci.p0)).durum, 200);
      assert.equal(await acikSayisi('lead'), 5);
      // Başka kişi kendi kotasını kullanır.
      const baska = yeni();
      assert.equal((await gonder('quality', baska.ozet, 0, baska.p0)).durum, 200);
      assert.equal(await acikSayisi('lead'), 5);
    });

    test('eşzamanlı ilk parçalar kişi sınırını aşmaz; aynı özeti iki kişi birbirini engellemeden yükler (kişi başına şerit)', async () => {
      const onlar = Array.from({ length: 10 }, yeni);
      const cevaplar = await Promise.all(onlar.map((d) => gonder('maint', d.ozet, 0, d.p0)));
      assert.deepEqual([cevaplar.filter((c) => c.durum === 200).length, cevaplar.filter((c) => c.durum === 429).length], [5, 5]);
      assert.equal(await acikSayisi('maint'), 5);
      const ortak = yeni();
      const [a, b] = await Promise.all([gonder('plan', ortak.ozet, 0, ortak.p0), gonder('prep', ortak.ozet, 0, ortak.p0)]);
      assert.deepEqual([a.durum, b.durum], [200, 200]);
      const sahipler = await vt().sorgu<{ yukleyen_id: number }>('SELECT DISTINCT yukleyen_id FROM arkon_dosya_parcasi WHERE ozet = $1 ORDER BY 1', [ortak.ozet]);
      assert.deepEqual(sahipler.map((s) => s.yukleyen_id), [kisiIdleri.plan, kisiIdleri.prep].sort((x, y) => x - y));
      // Öteki kişinin şeridi sürerken biri ezmeye kalkamaz: aynı sıra kendi şeridine yazılır, öteki şeridi bozmaz.
      assert.equal((await gonder('plan', ortak.ozet, 0, Buffer.from('ezme').toString('base64'), 2)).durum, 200);
      assert.equal((await vt().tek<{ icerik: Buffer }>('SELECT icerik FROM arkon_dosya_parcasi WHERE ozet = $1 AND yukleyen_id = $2 AND sira = 0', [ortak.ozet, kisiIdleri.prep]))?.icerik.toString('base64'), ortak.p0);
    });

    test('uyuşmayan toplamla şerit attırıp başlatmak başkasını etkilemez: asıl yükleyen 403 almaz ve tamamlar; ilk tamamlayan yazar, ikincisi "zaten var" alır', async () => {
      await vt().sorgu('DELETE FROM arkon_dosya_parcasi WHERE yukleyen_id = ANY($1)', [[kisiIdleri.lead, kisiIdleri.quality]]);
      const d = yeni();
      assert.equal((await gonder('quality', d.ozet, 0, d.p0, 3)).durum, 200);
      // Saldırgan aynı özette toplamı bozarak kendi şeridini attırır ve yeniden başlatır; kaliteci etkilenmez.
      for (let i = 0; i < 3; i += 1) {
        assert.equal((await gonder('lead', d.ozet, 0, d.p0, 3)).durum, 200);
        assert.equal((await gonder('lead', d.ozet, 1, d.p1, 4)).durum, 400);
      }
      assert.equal((await gonder('quality', d.ozet, 1, d.p1, 2)).durum, 400, 'kalitecinin kendi tutarsız toplamı kendi şeridini atar');
      await eskit(d.ozet, 200);
      assert.equal((await gonder('quality', d.ozet, 0, d.p0)).durum, 200);
      assert.equal((await gonder('lead', d.ozet, 0, d.p0)).durum, 200);
      assert.deepEqual((await gonder('quality', d.ozet, 1, d.p1)).govde, { tamam: true });
      assert.equal(await parcaSayisi(d.ozet), 1, 'kalitecinin şeridi temizlendi, amirinki duruyor');
      assert.deepEqual((await gonder('lead', d.ozet, 1, d.p1)).govde, { tamam: true });
      assert.equal(await parcaSayisi(d.ozet), 0);
      const kimYazdi = await vt().tek<{ yukleyen_id: number }>('SELECT yukleyen_id FROM arkon_dosya WHERE ozet = $1', [d.ozet]);
      assert.equal(kimYazdi?.yukleyen_id, kisiIdleri.quality);
      // Dosya hazırken yeni parça gönderen şeridini açmaz.
      assert.deepEqual((await gonder('prep', d.ozet, 0, d.p0)).govde, { tamam: true });
      assert.equal(await parcaSayisi(d.ozet), 0);
    });

    test('iki kişi aynı özetleri çapraz ve eşzamanlı gönderirken kilitlenme olmaz (10 tur)', async () => {
      await vt().sorgu('DELETE FROM arkon_dosya_parcasi WHERE yukleyen_id = ANY($1)', [[kisiIdleri.plan, kisiIdleri.prep]]);
      for (let tur = 0; tur < 10; tur += 1) {
        const d = yeni();
        const e = yeni();
        // Her iki kişi iki özet için de ilk parçaları, sonra son parçaları çapraz sırayla aynı anda gönderir.
        await Promise.all([gonder('plan', d.ozet, 0, d.p0), gonder('prep', d.ozet, 0, d.p0), gonder('plan', e.ozet, 0, e.p0), gonder('prep', e.ozet, 0, e.p0)]);
        const son = await Promise.all([gonder('plan', d.ozet, 1, d.p1), gonder('prep', e.ozet, 1, e.p1), gonder('prep', d.ozet, 1, d.p1), gonder('plan', e.ozet, 1, e.p1)]);
        for (const c of son) assert.deepEqual([c.durum, (c.govde as { tamam?: boolean }).tamam], [200, true], `tur ${tur}: ${JSON.stringify(c.govde)}`);
      }
      // Sınır aşımında ret de çapraz eşzamanlıdır; açık yüklemeler yerinde kalır.
      const ortak = Array.from({ length: 5 }, yeni);
      for (const o of ortak) { await gonder('plan', o.ozet, 0, o.p0); await gonder('prep', o.ozet, 0, o.p0); }
      const yeniler = Array.from({ length: 4 }, yeni);
      const cevaplar = await Promise.all(yeniler.flatMap((o, i) => [gonder(i % 2 === 0 ? 'plan' : 'prep', o.ozet, 0, o.p0), gonder(i % 2 === 0 ? 'prep' : 'plan', o.ozet, 0, o.p0)]));
      for (const c of cevaplar) assert.equal(c.durum, 429, JSON.stringify(c.govde));
      assert.deepEqual([await acikSayisi('plan'), await acikSayisi('prep')], [5, 5]);
      for (const o of ortak) assert.equal(await parcaSayisi(o.ozet), 2, 'iki kişinin şeridi de yerinde');
    });

    test('bayt sınırları (servis düzeyi, enjekte edilen sınırla): depo dolunca ve kişi baytı aşılınca 429, kimsenin yüklemesi atılmaz; sınır içindeki yazılır', async () => {
      const kisi = (rol: ArkonRolu) => ({ id: kisiIdleri[rol], ad: `Deneme k_${rol}`, islemler: [ROL_ISLEMI[rol]] as never });
      const parca = (n: number): { sira: number; toplam: number; veri: string } => ({ sira: 0, toplam: 2, veri: Buffer.alloc(n, 7).toString('base64') });
      const yolla = (rol: ArkonRolu, ozet: string, g: { sira: number; toplam: number; veri: string }, sinir: { kisiAcikYukleme: number; kisiAcikBayt: number; depoBayt: number }) =>
        vt().tx((db) => dosyaParcasi(db, kisi(rol), ozet, g, sinir));
      const sayi = async (rol: ArkonRolu): Promise<number> => (await vt().tek<{ n: number }>('SELECT count(DISTINCT ozet)::int AS n FROM arkon_dosya_parcasi WHERE yukleyen_id = $1', [kisiIdleri[rol]]))?.n ?? -1;
      const ozetAl = () => yeni().ozet;
      const genis = { kisiAcikYukleme: 50, kisiAcikBayt: 1e12, depoBayt: 1e12 };
      const simdiki = async (): Promise<number> => (await vt().tek<{ b: number }>(
        'SELECT (SELECT coalesce(sum(boyut), 0) FROM arkon_dosya)::float8 + (SELECT coalesce(sum(length(icerik)), 0) FROM arkon_dosya_parcasi)::float8 AS b'))?.b ?? 0;
      // Temiz başlangıç: bu testin kullanacağı kişilerin açık yüklemeleri
      await vt().sorgu('DELETE FROM arkon_dosya_parcasi WHERE yukleyen_id = ANY($1)', [[kisiIdleri.plan, kisiIdleri.prep, kisiIdleri.maint]]);
      // DEPO: başkasının ve kendi eski yüklemesi varken depo dolu
      const baskasi = ozetAl();
      const kendiEski = ozetAl();
      await yolla('prep', baskasi, parca(300), genis);
      await yolla('plan', kendiEski, parca(300), genis);
      const doluSinir = { kisiAcikYukleme: 50, kisiAcikBayt: 1e12, depoBayt: await simdiki() + 100 };
      const yeniOzet = ozetAl();
      await assert.rejects(yolla('plan', yeniOzet, parca(300), doluSinir), (h: { kod?: string }) => h.kod === 'COK_ISTEK');
      assert.equal(await parcaSayisi(baskasi), 1, 'başkasının yüklemesi atılmaz');
      assert.equal(await parcaSayisi(kendiEski), 1, 'depo doluyken kendi eskisi de atılmaz');
      assert.equal(await parcaSayisi(yeniOzet), 0);
      // Depo sınırı tam sınırda geçer
      await yolla('plan', yeniOzet, parca(100), { ...doluSinir, depoBayt: await simdiki() + 100 });
      assert.equal(await parcaSayisi(yeniOzet), 1);
      // KİŞİ BAYTI: sınır içi yazılır, aşılınca ret; eski yükleme yerinde kalır
      await vt().sorgu('DELETE FROM arkon_dosya_parcasi WHERE yukleyen_id = $1', [kisiIdleri.maint]);
      const k1 = ozetAl();
      const k2 = ozetAl();
      const bayt = { kisiAcikYukleme: 50, kisiAcikBayt: 700, depoBayt: 1e12 };
      await yolla('maint', k1, parca(400), bayt);
      await eskit(k1, 3);
      await assert.rejects(yolla('maint', k2, parca(400), bayt), (h: { kod?: string }) => h.kod === 'COK_ISTEK');
      assert.equal(await parcaSayisi(k1), 1, 'en eski açık yükleme atılmadı');
      assert.equal(await parcaSayisi(k2), 0);
      await yolla('maint', k2, parca(300), bayt);
      assert.equal(await parcaSayisi(k2), 1, 'sınır içindeki yazılır');
      assert.equal(await sayi('maint'), 2);
      const buyuk = ozetAl();
      await assert.rejects(yolla('maint', buyuk, parca(800), bayt), (h: { kod?: string }) => h.kod === 'COK_ISTEK');
      assert.equal(await parcaSayisi(buyuk), 0);
      assert.equal(await parcaSayisi(k2), 1, 'reddedilen yeni yükleme eskisini atmaz');
    });

    test('depo kilidi: farklı kişilerin eşzamanlı ilk parçaları (servis düzeyi) depo toplam sınırını birlikte aşmaz; sınır içindeki yazılır', async () => {
      const roller: ArkonRolu[] = ['plan', 'prep', 'maint', 'lead', 'quality'];
      const kisi = (rol: ArkonRolu) => ({ id: kisiIdleri[rol], ad: `Deneme k_${rol}`, islemler: [ROL_ISLEMI[rol]] as never });
      const simdiki = async (): Promise<number> => (await vt().tek<{ b: number }>(
        'SELECT (SELECT coalesce(sum(boyut), 0) FROM arkon_dosya)::float8 + (SELECT coalesce(sum(length(icerik)), 0) FROM arkon_dosya_parcasi)::float8 AS b'))?.b ?? 0;
      for (let tur = 0; tur < 5; tur += 1) {
        await vt().sorgu('DELETE FROM arkon_dosya_parcasi WHERE yukleyen_id = ANY($1)', [roller.map((r) => kisiIdleri[r])]);
        const taban = await simdiki();
        // Sınıra iki parçalık yer var: beş kişiden yalnız ikisi girer.
        const sinir = { kisiAcikYukleme: 50, kisiAcikBayt: 1e12, depoBayt: taban + 450 };
        const sonuc = await Promise.allSettled(roller.map((rol) =>
          vt().tx((db) => dosyaParcasi(db, kisi(rol), yeni().ozet, { sira: 0, toplam: 2, veri: Buffer.alloc(200, tur).toString('base64') }, sinir))));
        assert.equal(sonuc.filter((r) => r.status === 'fulfilled').length, 2, `tur ${tur}`);
        for (const r of sonuc) if (r.status === 'rejected') assert.equal((r.reason as { kod?: string }).kod, 'COK_ISTEK');
        assert.ok(await simdiki() <= sinir.depoBayt, `tur ${tur}: depo sınırı aşıldı`);
      }
    });

    test('kişi kilidi: tek kişinin eşzamanlı ilk parçaları (servis düzeyi, boş durumdan) 5 tur boyunca açık yükleme sınırını aşmaz', async () => {
      const kisi = { id: kisiIdleri.maint, ad: 'Deneme k_maint', islemler: [ROL_ISLEMI.maint] as never };
      for (let tur = 0; tur < 5; tur += 1) {
        await vt().sorgu('DELETE FROM arkon_dosya_parcasi WHERE yukleyen_id = $1', [kisiIdleri.maint]);
        const dokuz = Array.from({ length: 9 }, yeni);
        const sonuc = await Promise.allSettled(dokuz.map((d) => vt().tx((db) => dosyaParcasi(db, kisi, d.ozet, { sira: 0, toplam: 2, veri: d.p0 }))));
        assert.equal(sonuc.filter((r) => r.status === 'fulfilled').length, 5, `tur ${tur}`);
        for (const r of sonuc) if (r.status === 'rejected') assert.equal((r.reason as { kod?: string }).kod, 'COK_ISTEK');
        assert.equal(await acikSayisi('maint'), 5, `tur ${tur}`);
      }
    });

    test('yükleme silme yalnız verilen kişinin şeridini siler', async () => {
      const d = yeni();
      assert.equal((await gonder('operator', d.ozet, 0, d.p0)).durum, 200);
      assert.equal((await gonder('plan', d.ozet, 0, d.p0)).durum, 200);
      await vt().tx((db) => sorgular.yuklemeyiAt(db, d.ozet, kisiIdleri.operator));
      assert.equal(await parcaSayisi(d.ozet), 1, 'yalnız operatörün şeridi gitti');
      const kalan = await vt().tek<{ yukleyen_id: number }>('SELECT yukleyen_id FROM arkon_dosya_parcasi WHERE ozet = $1', [d.ozet]);
      assert.equal(kalan?.yukleyen_id, kisiIdleri.plan);
    });

    test('özet tutmayınca o yüklemenin bütün parçaları atılır (yalnız son parça değil) ve 400 döner; başka yüklemeler kalır', async () => {
      const d = yeni();
      const baska = yeni();
      assert.equal((await gonder('prep', baska.ozet, 0, baska.p0)).durum, 200);
      const kotu = Buffer.from('bozuk icerik'.repeat(20)).toString('base64');
      assert.equal((await gonder('prep', d.ozet, 0, kotu, 3)).durum, 200);
      assert.equal((await gonder('prep', d.ozet, 1, kotu, 3)).durum, 200);
      assert.equal(await parcaSayisi(d.ozet), 2);
      const red = await gonder('prep', d.ozet, 2, kotu, 3);
      assert.equal(red.durum, 400);
      assert.equal(await parcaSayisi(d.ozet), 0);
      assert.equal(await parcaSayisi(baska.ozet), 1);
      assert.equal((await istek(cerezler.prep, 'GET', `/arkon/dosyalar/${d.ozet}`)).durum, 404);
    });

    test('bir günü geçen yarım yüklemeler yazma anında temizlenir', async () => {
      const eski = yeni();
      assert.equal((await gonder('plan', eski.ozet, 0, eski.p0)).durum, 200);
      await eskit(eski.ozet, 2 * 24 * 60);
      const tetik = yeni();
      assert.equal((await gonder('prep', tetik.ozet, 0, tetik.p0)).durum, 200);
      assert.equal(await parcaSayisi(eski.ozet), 0);
    });
  });

  describe('kayıt türü x rol, kalite kararı ve belgelerdeki kişi alanları', () => {
    const KAYIT_YAZAR: Record<string, readonly ArkonRolu[]> = {
      events: ['admin', 'operator', 'lead'],
      counts: ['admin', 'operator', 'lead'],
      meas: ['admin', 'operator', 'lead', 'quality'],
      calls: ['admin', 'operator', 'lead', 'quality', 'maint'],
    };
    const ekle = (rol: ArkonRolu, tur: string, satir: Record<string, unknown>) =>
      istek<{ eklenen: number }>(cerezler[rol], 'POST', `/arkon/kayitlar/${tur}/ekle`, { satirlar: [satir], kaynak: 'g1' });

    test('kayıt yazımı tür ve rol başınadır; öteki roller 403 alır ve satır yazılmaz', async () => {
      let n = 0;
      for (const [tur, izinli] of Object.entries(KAYIT_YAZAR)) {
        for (const rol of ROLLER) {
          const cid = `kr-${tur}-${rol}-${(n += 1)}`;
          const cevap = await ekle(rol, tur, { cid, ...(tur === 'meas' ? { itemId: 1 } : {}) });
          assert.equal(cevap.durum, izinli.includes(rol) ? 200 : 403, `${tur} ${rol}`);
          const var_ = (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_kayit WHERE cid = $1', [cid]))?.n;
          assert.equal(var_, izinli.includes(rol) ? 1 : 0, `${tur} ${rol} satır`);
        }
      }
    });

    test('ölçüm kaynağı rolle sınırlıdır: quality ve cmm yalnız kalite ve yönetici, op operatör ve amir; bilinmeyen kaynak 400', async () => {
      const olc = (rol: ArkonRolu, src: unknown, i: number) => ekle(rol, 'meas', { cid: `ok-${rol}-${i}`, itemId: 1, src });
      assert.equal((await olc('operator', 'quality', 1)).durum, 403);
      assert.equal((await olc('operator', 'cmm', 2)).durum, 403);
      assert.equal((await olc('lead', 'quality', 3)).durum, 403);
      assert.equal((await olc('quality', 'op', 4)).durum, 403);
      assert.equal((await olc('operator', 'op', 5)).durum, 200);
      assert.equal((await olc('lead', 'op', 6)).durum, 200);
      assert.equal((await olc('quality', 'quality', 7)).durum, 200);
      assert.equal((await olc('quality', 'cmm', 8)).durum, 200);
      assert.equal((await olc('admin', 'cmm', 9)).durum, 200);
      for (const src of ['x', 5, {}, 'QUALITY']) assert.equal((await olc('quality', src, 10)).durum, 400, JSON.stringify(src));
    });

    test('numune isteğinde bekleme dışı durumu yalnız kalite ve yönetici yazar; operatör bekleyen isteği açar', async () => {
      const q = (rol: ArkonRolu, kimlik: string, status: string, taban = 0) =>
        istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/requests/${kimlik}/yaz`, {
          taban, govde: aletDamgala('requests', { id: kimlik, machine: 'X', status, ...(status === 'rejected' ? { note: 'ölçü dışı', results: { 1: { v: 1, ok: false } } } : {}) }), kaynak: 'g1',
        });
      assert.equal((await q('operator', 'nk-1', 'waiting')).govde.sonuc, 'yazildi');
      for (const durum of ['measuring', 'approved', 'rejected', 'deviation']) {
        assert.equal((await q('operator', `nk-o-${durum}`, durum)).durum, 403, durum);
        assert.equal((await q('lead', `nk-l-${durum}`, durum)).durum, 403, durum);
        assert.equal((await q('quality', `nk-q-${durum}`, durum)).govde.sonuc, 'yazildi', durum);
        assert.equal((await q('admin', `nk-a-${durum}`, durum)).govde.sonuc, 'yazildi', durum);
      }
      const s = (await oku('admin', 'requests', 'nk-1')).govde.belge?.surum ?? 0;
      assert.equal((await q('operator', 'nk-1', 'approved', s)).durum, 403);
      assert.equal((await oku('admin', 'requests', 'nk-1')).govde.belge?.surum, s);
    });

    test('belgelerdeki kişi alanları değiştirildiğinde oturumdaki kişi olur; değişmeyen alan, kişi olmayan alan ve "Ad · Makine" eki korunur', async () => {
      const yaz2 = (rol: ArkonRolu, depo: string, kimlik: string, govde: unknown, taban = 0) =>
        istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/${depo}/${kimlik}/yaz`, { taban, govde: aletDamgala(depo, govde), kaynak: 'g1' });
      const govdeOku = async (depo: string, kimlik: string) => (await oku('admin', depo, kimlik)).govde.belge?.govde as Record<string, any>;
      // istek: yeni belge, sahte kişi alanları
      await yaz2('operator', 'requests', 'kk-q', { id: 'kk-q', machine: 'X', status: 'waiting', by: 'Sahte', decidedBy: 'Sahte', operation: 'Op 30 · CNC', who: 'q', byline: 'serbest', standby: 'serbest' });
      const q1 = await govdeOku('requests', 'kk-q');
      assert.equal(q1['by'], 'Deneme k_operator');
      assert.equal(q1['decidedBy'], 'Deneme k_operator');
      assert.deepEqual([q1['operation'], q1['who'], q1['byline'], q1['standby']], ['Op 30 · CNC', 'q', 'serbest', 'serbest']);
      // kalite karar verir: yalnız değişen alan (decidedBy) kaliteye döner, by (değişmedi) kalır
      const s1 = (await oku('admin', 'requests', 'kk-q')).govde.belge?.surum ?? 0;
      await yaz2('quality', 'requests', 'kk-q', { ...q1, status: 'approved', decidedBy: 'Başkası' }, s1);
      const q2 = await govdeOku('requests', 'kk-q');
      assert.equal(q2['by'], 'Deneme k_operator');
      assert.equal(q2['decidedBy'], 'Deneme k_quality');
      // paket: onay ve geri gönderme alanları, geçmiş girdisi
      await yaz2('prep', 'pkgs', 'kk-p', { id: 'kk-p', machine: 'X', by: 'Sahte', apReq: { by: 'Sahte', at: 1 }, history: [{ v: 1, by: 'Sahte', ap: 'x' }] });
      const p1 = await govdeOku('pkgs', 'kk-p');
      assert.equal(p1['by'], 'Deneme k_prep');
      assert.equal(p1['apReq'].by, 'Deneme k_prep');
      assert.equal(p1['history'][0].by, 'Deneme k_prep');
      const ps = (await oku('admin', 'pkgs', 'kk-p')).govde.belge?.surum ?? 0;
      await yaz2('quality', 'pkgs', 'kk-p', { ...p1, approval: { ok: true, by: 'Kalitecimiş' }, history: [...p1['history'], { v: 2, by: 'Sahte' }] }, ps);
      const p2 = await govdeOku('pkgs', 'kk-p');
      assert.equal(p2['approval'].by, 'Deneme k_quality');
      assert.equal(p2['by'], 'Deneme k_prep');
      assert.equal(p2['history'][0].by, 'Deneme k_prep');
      assert.equal(p2['history'][1].by, 'Deneme k_quality');
      // sonuç: pin "Ad · Makine" eki korunur, CMM kişi değildir, meas.who kalır
      await yaz2('operator', 'results', 'kk-r', { id: 'kk-r', pins: [{ id: 'p1', by: 'Sahte · TZG-04', status: 'open' }], meas: { 1: { v: 1, ok: true, by: 'Sahte', who: 'op' }, 2: { v: 1, ok: true, by: 'CMM', who: 'q' } } });
      const r1 = await govdeOku('results', 'kk-r');
      assert.equal(r1['pins'][0].by, 'Deneme k_operator · TZG-04');
      assert.equal(r1['meas']['1'].by, 'Deneme k_operator');
      assert.equal(r1['meas']['2'].by, 'CMM');
      assert.deepEqual([r1['meas']['1'].who, r1['meas']['2'].who], ['op', 'q']);
      // bakım ve malzeme
      await yaz2('maint', 'maint', 'kk-m', { id: 'kk-m', type: 'ariza', openedBy: 'Sahte', ackBy: 'Sahte', closedBy: 'Sahte' });
      const m1 = await govdeOku('maint', 'kk-m');
      assert.deepEqual([m1['openedBy'], m1['ackBy'], m1['closedBy']], ['Deneme k_maint', 'Deneme k_maint', 'Deneme k_maint']);
      await yaz2('lead', 'logi', 'kk-l', { id: 'kk-l', by: 'Sahte', handledBy: 'Sahte', doneBy: 'Sahte' });
      const l1 = await govdeOku('logi', 'kk-l');
      assert.deepEqual([l1['by'], l1['handledBy'], l1['doneBy']], ['Deneme k_lead', 'Deneme k_lead', 'Deneme k_lead']);
    });

    test('kişi alanı kardeş alan değişince de ezilir: kendi değerini koruyup öteki alanı değiştiren başkasının adına yazamaz; ilgisiz değişiklikte korunur', async () => {
      const yaz2 = (rol: ArkonRolu, depo: string, kimlik: string, govde: unknown) =>
        istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/${depo}/${kimlik}/yaz`, { taban: 0, govde: aletDamgala(depo, govde), kaynak: 'g1' });
      const yaz3 = async (rol: ArkonRolu, depo: string, kimlik: string, govde: Record<string, unknown>) => {
        const taban = (await oku('admin', depo, kimlik)).govde.belge?.surum ?? 0;
        const c = await istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/${depo}/${kimlik}/yaz`, { taban, govde: aletDamgala(depo, { id: kimlik, ...govde }), kaynak: 'g1' });
        assert.equal(c.govde.sonuc, 'yazildi', JSON.stringify(c.govde));
      };
      const oku2 = async (depo: string, kimlik: string) => (await oku('admin', depo, kimlik)).govde.belge?.govde as Record<string, any>;
      // Onay alanının sahibi alanı kendi değeriyle bırakıp başka alanı değiştiren kişiye geçer: kalite adına onay saklanamaz.
      await yaz2('quality', 'pkgs', 'kd-p', { id: 'kd-p', no: 'KD-1', rev: 'A', machine: 'X', status: 'review', approval: { ok: false, by: 'x' } });
      const p1 = await oku2('pkgs', 'kd-p');
      assert.equal(p1['approval'].by, 'Deneme k_quality');
      await yaz3('admin', 'pkgs', 'kd-p', { ...p1, status: 'published', steps: [{ id: 's1' }], version: 2, approval: { ok: true, by: p1['approval'].by } });
      const p2 = await oku2('pkgs', 'kd-p');
      assert.equal(p2['approval'].ok, true);
      assert.equal(p2['approval'].by, 'Deneme k_admin');
      const gunluk = (await istek<{ satirlar: Record<string, any>[] }>(cerezler.admin, 'GET', '/arkon/kayitlar/audit')).govde.satirlar.filter((s) => s['target'] === 'KD-1' && s['action'] === 'yayınlandı');
      assert.match(String(gunluk.at(-1)?.['detail']), /onay: Deneme k_admin/);
      // Onayı değiştirmeyen yazım onay sahibini korur.
      await yaz3('plan', 'pkgs', 'kd-p', { ...p2, note: 'sadece not' });
      assert.equal((await oku2('pkgs', 'kd-p'))['approval'].by, 'Deneme k_admin');
      // history[]: dizin bazında; değişen girdinin by'ı ezilir, değişmeyen girdi ve eklenmeyen alan korunur.
      await yaz2('prep', 'pkgs', 'kd-h', { id: 'kd-h', machine: 'X', history: [{ v: 1, by: 'x', rev: 'a' }, { v: 2, by: 'x', rev: 'b' }] });
      const h1 = await oku2('pkgs', 'kd-h');
      assert.deepEqual(h1['history'].map((g: { by: string }) => g.by), ['Deneme k_prep', 'Deneme k_prep']);
      await yaz3('plan', 'pkgs', 'kd-h', { ...h1, history: [h1['history'][0], { ...h1['history'][1], rev: 'DEĞİŞTİ' }] });
      const h2 = await oku2('pkgs', 'kd-h');
      assert.equal(h2['history'][0].by, 'Deneme k_prep');
      assert.equal(h2['history'][1].by, 'Deneme k_plan');
      assert.equal(h2['history'][1].rev, 'DEĞİŞTİ');
      // Numune kararı: durum değişince decidedBy yazanındır; durum değişmezse korunur.
      await yaz2('operator', 'requests', 'kd-q', { id: 'kd-q', machine: 'X', status: 'waiting' });
      const q0 = await oku2('requests', 'kd-q');
      await yaz3('quality', 'requests', 'kd-q', { ...q0, status: 'approved', decidedBy: 'x' });
      const q1 = await oku2('requests', 'kd-q');
      assert.equal(q1['decidedBy'], 'Deneme k_quality');
      await yaz3('admin', 'requests', 'kd-q', { ...q1, note: 'ilgisiz' });
      assert.equal((await oku2('requests', 'kd-q'))['decidedBy'], 'Deneme k_quality');
      await yaz3('admin', 'requests', 'kd-q', { ...q1, status: 'rejected', note: 'ölçü dışı', results: { 1: { v: 1, ok: false } } });
      assert.equal((await oku2('requests', 'kd-q'))['decidedBy'], 'Deneme k_admin');
      // Pin: çözüm (durum, yanıt) pin sahibini değiştirmez; metin değişirse sahip değişir.
      await yaz2('operator', 'results', 'kd-r', { id: 'kd-r', pins: [{ id: 'p1', by: 'x · M1', at: 1, text: 'not', status: 'open' }] });
      const r1 = await oku2('results', 'kd-r');
      assert.equal(r1['pins'][0].by, 'Deneme k_operator · M1');
      await yaz3('prep', 'results', 'kd-r', { ...r1, pins: [{ ...r1['pins'][0], status: 'done', reply: 'tamam' }] });
      assert.equal((await oku2('results', 'kd-r'))['pins'][0].by, 'Deneme k_operator · M1');
      await yaz3('prep', 'results', 'kd-r', { ...r1, pins: [{ ...r1['pins'][0], text: 'başka metin' }] });
      assert.equal((await oku2('results', 'kd-r'))['pins'][0].by, 'Deneme k_prep · M1');
      // Vardiya devri (kv/handover): kişi alanı oturumdan, "Ad · Vardiya" eki korunur.
      const devir = await istek(cerezler.operator, 'POST', '/arkon/belgeler/kv/handover/yaz', { taban: (await oku('admin', 'kv', 'handover')).govde.belge?.surum ?? 0, govde: { v: { note: 'n', by: 'Sahte · Vardiya 1', at: 1 } }, kaynak: 'g1' });
      assert.equal(devir.durum, 200);
      const hv = (await oku('admin', 'kv', 'handover')).govde.belge?.govde as { v: { by: string } };
      assert.equal(hv.v.by, 'Deneme k_operator · Vardiya 1');
    });

    test('paket approval alanını yalnız kalite ve yönetici yazar, değiştirir, siler; başka rol approval\'a dokunmadan paketi yazabilir ve var olanı aynen geri gönderebilir', async () => {
      const pk = (rol: ArkonRolu, kimlik: string, govde: Record<string, unknown>, taban?: number) =>
        istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/pkgs/${kimlik}/yaz`, {
          taban: taban ?? 0, govde: { id: kimlik, no: 'AP-1', rev: 'A', machine: 'X', ...govde }, kaynak: 'g1',
        });
      const oku3 = async (kimlik: string) => (await oku('admin', 'pkgs', kimlik)).govde.belge;
      // yeni belge: kalite dışı rol approval içeren paket açamaz
      for (const rol of ['prep', 'plan', 'operator', 'lead', 'maint'] as const) {
        assert.equal((await pk(rol, `ap-yeni-${rol}`, { approval: { ok: true, by: 'x' } })).durum, 403, rol);
        assert.equal((await oku3(`ap-yeni-${rol}`)), null);
      }
      assert.equal((await pk('quality', 'ap-1', { status: 'review', approval: { ok: false, at: 5 } })).govde.sonuc, 'yazildi');
      const a1 = await oku3('ap-1');
      const onay = (a1?.govde as { approval: unknown }).approval;
      // kalite dışı rol: değiştirme, silme, sahte onay 403 ve belge değişmez
      for (const rol of ['prep', 'plan'] as const) {
        const taban = (await oku3('ap-1'))?.surum ?? 0;
        assert.equal((await pk(rol, 'ap-1', { status: 'published', steps: [{ id: 's1' }], approval: { ...(onay as object), ok: true } }, taban)).durum, 403, `${rol} değiştir`);
        assert.equal((await pk(rol, 'ap-1', { status: 'published', steps: [{ id: 's1' }] }, taban)).durum, 403, `${rol} sil`);
        assert.equal((await pk(rol, 'ap-1', { status: 'published', steps: [{ id: 's1' }], approval: { ok: false, at: 5, by: 'başkası' } }, taban)).durum, 403, `${rol} by`);
      }
      assert.deepEqual((await oku3('ap-1'))?.govde, a1?.govde);
      // meşru akış: hazırlık yayınlarken var olan approval'ı AYNEN geri gönderir; taslak düzenleme, onaya gönderme, sıra, istasyon değişimi.
      // Kalitenin geri gönderdiği paket yeniden onaya gönderilmeden (apReq onaydan yeni) yayınlanamaz.
      const g = a1?.govde as Record<string, unknown>;
      const s = async () => (await oku3('ap-1'))?.surum ?? 0;
      assert.equal((await pk('prep', 'ap-1', { ...g, apReq: { at: 9, by: 'x' } }, await s())).govde.sonuc, 'yazildi');
      assert.equal((await pk('prep', 'ap-1', { ...g, apReq: { at: 9, by: 'x' }, status: 'published', steps: [{ id: 's1' }], version: 2 }, await s())).govde.sonuc, 'yazildi');
      assert.equal((await pk('prep', 'ap-1', { ...g, status: 'draft', note: 'düzenleme' }, await s())).govde.sonuc, 'yazildi');
      assert.equal((await pk('prep', 'ap-1', { ...g, apReq: { at: 9, by: 'x' } }, await s())).govde.sonuc, 'yazildi');
      assert.equal((await pk('plan', 'ap-1', { ...g, seq: 3 }, await s())).govde.sonuc, 'yazildi');
      assert.equal((await pk('plan', 'ap-1', { ...g, seq: 3, machine: 'Y' }, await s())).govde.sonuc, 'yazildi');
      assert.deepEqual(((await oku3('ap-1'))?.govde as { approval: unknown }).approval, onay);
      // kalite ve yönetici değiştirir ve siler
      assert.equal((await pk('quality', 'ap-1', { ...g, approval: { ok: true, at: 6 } }, await s())).govde.sonuc, 'yazildi');
      assert.equal((await pk('admin', 'ap-1', { ...g, approval: undefined }, await s())).govde.sonuc, 'yazildi');
    });

    test('karar verilmiş numune isteğini yalnız kalite ve yönetici değiştirir; operatör bekleyen isteğe yazar ama kararı geri alamaz, alan silemez', async () => {
      const rq = (rol: ArkonRolu, kimlik: string, govde: Record<string, unknown>, taban = 0) =>
        istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/requests/${kimlik}/yaz`, { taban, govde: aletDamgala('requests', { id: kimlik, machine: 'X', ...govde }), kaynak: 'g1' });
      const oku3 = async (kimlik: string) => (await oku('admin', 'requests', kimlik)).govde.belge;
      assert.equal((await rq('operator', 'nr-1', { status: 'waiting', items: [1] })).govde.sonuc, 'yazildi');
      assert.equal((await rq('operator', 'nr-1', { status: 'waiting', items: [1, 2] }, (await oku3('nr-1'))?.surum)).govde.sonuc, 'yazildi');
      for (const durum of ['approved', 'rejected', 'deviation', 'measuring']) {
        const k = `nr-${durum}`;
        await rq('quality', k, { status: durum, note: 'karar', results: { 1: { v: 1, ok: true } } });
        const eski = await oku3(k);
        assert.ok(eski, durum);
        const taban = eski?.surum ?? 0;
        for (const rol of ['operator', 'lead'] as const) {
          assert.equal((await rq(rol, k, { status: 'waiting', note: 'karar', results: { 1: { v: 1, ok: true } } }, taban)).durum, 403, `${rol} ${durum} geri al`);
          // Notsuz ya da ölçüsüz ret biçim olarak da geçersizdir (400): yetkiden önce reddedilir, sonuç aynı, belge değişmez.
          const silRet = durum === 'rejected' ? [400, 403] : [403];
          assert.ok(silRet.includes((await rq(rol, k, { status: durum, results: { 1: { v: 1, ok: true } } }, taban)).durum), `${rol} ${durum} note sil`);
          assert.ok(silRet.includes((await rq(rol, k, { status: durum, note: 'karar' }, taban)).durum), `${rol} ${durum} results sil`);
          assert.equal((await rq(rol, k, { status: durum, note: 'değişti', results: { 1: { v: 1, ok: true } } }, taban)).durum, 403, `${rol} ${durum} not değiştir`);
        }
        assert.deepEqual((await oku3(k))?.govde, eski?.govde, durum);
        assert.equal((await rq('quality', k, { status: durum, note: 'kalite düzeltti', results: { 1: { v: 1, ok: true } } }, taban)).govde.sonuc, 'yazildi');
        assert.equal((await rq('admin', k, { status: 'waiting' }, (await oku3(k))?.surum)).govde.sonuc, 'yazildi');
      }
    });

    test('kapanmış arıza yalnız bakım ve yönetici tarafından, tamamlanmış malzeme isteği yalnız teslim alan roller ve yönetici tarafından değiştirilir; açık kayıtta bugünkü davranış kalır', async () => {
      const yazK = async (rol: ArkonRolu, depo: string, kimlik: string, govde: Record<string, unknown>) => {
        const taban = (await oku('admin', depo, kimlik)).govde.belge?.surum ?? 0;
        return istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/${depo}/${kimlik}/yaz`, { taban, govde: aletDamgala(depo, { id: kimlik, ...govde }), kaynak: 'g1' });
      };
      const okuK = async (depo: string, kimlik: string) => (await oku('admin', depo, kimlik)).govde.belge?.govde as Record<string, any>;
      // Arıza: açıkken amir da bakım da düzenler; amir kapatır; kapandıktan sonra amir değiştiremez
      assert.equal((await yazK('lead', 'maint', 'kk-a', { type: 'ariza', st: 'X', status: 'open', title: 't', openedAt: 1 })).govde.sonuc, 'yazildi');
      assert.equal((await yazK('maint', 'maint', 'kk-a', { type: 'ariza', st: 'X', status: 'work', title: 't', openedAt: 1, ackAt: 2 })).govde.sonuc, 'yazildi');
      assert.equal((await yazK('lead', 'maint', 'kk-a', { type: 'ariza', st: 'X', status: 'done', title: 't', openedAt: 1, ackAt: 2, closedAt: 3, cause: 'c' })).govde.sonuc, 'yazildi');
      const a1 = await okuK('maint', 'kk-a');
      assert.equal((await yazK('lead', 'maint', 'kk-a', { ...a1, cause: 'başka' })).durum, 403);
      assert.equal((await yazK('lead', 'maint', 'kk-a', { ...a1, status: 'open', closedAt: undefined })).durum, 403, 'yeniden açma');
      assert.equal((await yazK('lead', 'maint', 'kk-a', { ...a1 })).govde.sonuc, 'yazildi', 'değişmeyen yazım serbest');
      assert.deepEqual(await okuK('maint', 'kk-a'), a1);
      assert.equal((await yazK('maint', 'maint', 'kk-a', { ...a1, cause: 'bakım düzeltti' })).govde.sonuc, 'yazildi');
      assert.equal((await yazK('admin', 'maint', 'kk-a', { ...(await okuK('maint', 'kk-a')), action: 'yönetici' })).govde.sonuc, 'yazildi');
      // Durumu done olmasa da closedAt/closedBy dolu kayıt kapanmıştır
      assert.equal((await yazK('maint', 'maint', 'kk-a2', { type: 'ariza', st: 'X', status: 'work', closedAt: 5, closedBy: 'x' })).govde.sonuc, 'yazildi');
      assert.equal((await yazK('lead', 'maint', 'kk-a2', { ...(await okuK('maint', 'kk-a2')), cause: 'amir' })).durum, 403);
      // Malzeme isteği: planlama hazırlar, teslim alan (operatör ya da amir) tamamlar; tamamlanınca planlama değiştiremez
      assert.equal((await yazK('operator', 'logi', 'kk-l', { kind: 'req', st: 'X', status: 'open', at: 1 })).govde.sonuc, 'yazildi');
      const l0 = await okuK('logi', 'kk-l');
      assert.equal((await yazK('plan', 'logi', 'kk-l', { ...l0, status: 'sent', handledAt: 2 })).govde.sonuc, 'yazildi');
      assert.equal((await yazK('operator', 'logi', 'kk-l', { ...(await okuK('logi', 'kk-l')), status: 'done', doneAt: 3 })).govde.sonuc, 'yazildi');
      const l1 = await okuK('logi', 'kk-l');
      assert.equal((await yazK('plan', 'logi', 'kk-l', { ...l1, note: 'sonradan' })).durum, 403);
      assert.equal((await yazK('plan', 'logi', 'kk-l', { ...l1, status: 'open' })).durum, 403, 'geri alma');
      assert.equal((await yazK('plan', 'logi', 'kk-l', { ...l1 })).govde.sonuc, 'yazildi', 'değişmeyen yazım serbest');
      assert.equal((await yazK('lead', 'logi', 'kk-l', { ...l1, note: 'amir düzeltti' })).govde.sonuc, 'yazildi');
      assert.equal((await yazK('admin', 'logi', 'kk-l', { ...(await okuK('logi', 'kk-l')), note: 'yönetici' })).govde.sonuc, 'yazildi');
    });

    test('numune isteğinin results girdilerindeki ve sonuç belgesinin acks girdilerindeki kişi alanları da oturumdan gelir; CMM korunur; belge gövdesi nesne olmalıdır', async () => {
      const yazN = async (rol: ArkonRolu, depo: string, kimlik: string, govde: unknown, taban = 0) =>
        istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/${depo}/${kimlik}/yaz`, { taban, govde: aletDamgala(depo, govde), kaynak: 'g1' });
      const okuN = async (depo: string, kimlik: string) => (await oku('admin', depo, kimlik)).govde.belge?.govde as Record<string, any>;
      assert.equal((await yazN('operator', 'requests', 'kn-q', { id: 'kn-q', machine: 'X', status: 'waiting', results: { 1: { v: 1, ok: true, by: 'kalite kişisi' }, 2: { v: 2, ok: true, by: 'CMM' } } })).govde.sonuc, 'yazildi');
      const q = await okuN('requests', 'kn-q');
      assert.equal(q['results']['1'].by, 'Deneme k_operator');
      assert.equal(q['results']['2'].by, 'CMM');
      // Girdiyi değiştirip adı korumaya çalışan yine ezilir; değişmeyen girdi korunur (dolu ölçümü kalite değiştirir)
      const taban = (await oku('admin', 'requests', 'kn-q')).govde.belge?.surum ?? 0;
      assert.equal((await yazN('quality', 'requests', 'kn-q', { ...q, results: { ...q['results'], 1: { ...q['results']['1'], v: 9 } } }, taban)).govde.sonuc, 'yazildi');
      const q2 = await okuN('requests', 'kn-q');
      assert.equal(q2['results']['1'].by, 'Deneme k_quality');
      assert.equal(q2['results']['2'].by, 'CMM');
      assert.equal((await yazN('operator', 'results', 'kn-r', { id: 'kn-r', acks: { w1: { at: 1, by: 'başkası', cnt: 3, k: 'a', v: 1 } } })).govde.sonuc, 'yazildi');
      assert.equal((await okuN('results', 'kn-r'))['acks']['w1'].by, 'Deneme k_operator');
      // Belge gövdesi nesne değilse biçim ve kişi denetimleri atlanmasın: 400
      for (const [depo, rol, govde] of [['pkgs', 'prep', [1]], ['logi', 'operator', 'metin'], ['results', 'operator', 5], ['maint', 'maint', true], ['requests', 'operator', [{ status: 'approved' }]]] as const) {
        assert.equal((await yazN(rol, depo, `kn-nesne-${depo}`, govde)).durum, 400, depo);
        assert.equal((await oku('admin', depo, `kn-nesne-${depo}`)).govde.belge, null, depo);
      }
    });

    describe('kişi alanı kimlik eşlemesi, geçmiş onayı ve biçim', () => {
      const yazD = async (rol: ArkonRolu, depo: string, kimlik: string, govde: Record<string, unknown>) => {
        const taban = (await oku('admin', depo, kimlik)).govde.belge?.surum ?? 0;
        return istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/${depo}/${kimlik}/yaz`, { taban, govde: { id: kimlik, ...govde }, kaynak: 'g1' });
      };
      const okuD = async (depo: string, kimlik: string) => (await oku('admin', depo, kimlik)).govde.belge?.govde as Record<string, any>;

      test('malzeme belgesinde hazırlayanın adı, tamamlayanın yazımında silinmez: her kişi alanı kendi zaman alanına bağlıdır', async () => {
        // Teslim kaydı (out): yeni malzeme isteği (req) stokta açılır ve Arkon'dan değişmez (arkon.test.ts "malzeme isteği stokta").
        assert.equal((await yazD('operator', 'logi', 'kz-l', { kind: 'out', st: 'X', to: 'Y', qty: 2, status: 'open', by: 'x', at: 1 })).govde.sonuc, 'yazildi');
        const l0 = await okuD('logi', 'kz-l');
        assert.equal((await yazD('plan', 'logi', 'kz-l', { ...l0, status: 'prep', handledBy: 'x', handledAt: 2 })).govde.sonuc, 'yazildi');
        const l1 = await okuD('logi', 'kz-l');
        assert.equal(l1['handledBy'], 'Deneme k_plan');
        // Arkon yalnız doneBy ve doneAt yollar (bakim-raporlar.ts:276); handledBy aynen geri gelir
        assert.equal((await yazD('lead', 'logi', 'kz-l', { ...l1, status: 'done', doneBy: 'x', doneAt: 3 })).govde.sonuc, 'yazildi');
        const l2 = await okuD('logi', 'kz-l');
        assert.deepEqual([l2['handledBy'], l2['doneBy'], l2['by']], ['Deneme k_plan', 'Deneme k_lead', 'Deneme k_operator']);
        // handledAt değişirse handledBy yazanındır
        assert.equal((await yazD('lead', 'logi', 'kz-l', { ...l2, status: 'sent', handledAt: 4 })).govde.sonuc, 'yazildi');
        assert.equal((await okuD('logi', 'kz-l'))['handledBy'], 'Deneme k_lead');
      });

      test('geçmiş kırpılınca kalan girdiler yeniden damgalanmaz: girdiler kimlikle eşlenir (history v+at, pin id)', async () => {
        const gecmis = Array.from({ length: 60 }, (_, i) => ({ v: i + 1, at: 1000 + i, rev: 'A', by: 'x' }));
        assert.equal((await yazD('prep', 'pkgs', 'km-p', { machine: 'X', history: gecmis })).govde.sonuc, 'yazildi');
        const p1 = await okuD('pkgs', 'km-p');
        assert.ok(p1['history'].every((g: { by: string }) => g.by === 'Deneme k_prep'));
        // Arkon yayında son 60 girdiyi tutar: ilk girdi düşer, yenisi eklenir
        const kirpik = [...p1['history'].slice(1), { v: 61, at: 2000, rev: 'A', by: 'x' }];
        assert.equal((await yazD('plan', 'pkgs', 'km-p', { ...p1, history: kirpik })).govde.sonuc, 'yazildi');
        const p2 = await okuD('pkgs', 'km-p');
        assert.equal(p2['history'].length, 60);
        assert.equal(p2['history'].slice(0, 59).filter((g: { by: string }) => g.by === 'Deneme k_prep').length, 59);
        assert.equal(p2['history'][59].by, 'Deneme k_plan');
        // pin: baştaki pin çıkınca kalanın sahibi değişmez
        assert.equal((await yazD('operator', 'results', 'km-r', { pins: [{ id: 'a', by: 'x · M1', at: 1, text: 'bir' }, { id: 'b', by: 'x · M1', at: 2, text: 'iki' }] })).govde.sonuc, 'yazildi');
        const r1 = await okuD('results', 'km-r');
        assert.equal((await yazD('lead', 'results', 'km-r', { ...r1, pins: [r1['pins'][1]] })).govde.sonuc, 'yazildi');
        assert.deepEqual((await okuD('results', 'km-r'))['pins'].map((p: { id: string; by: string }) => [p.id, p.by]), [['b', 'Deneme k_operator · M1']]);
      });

      test('geçmiş girdisinin onaylayan adı (ap) saklı onaydan türer: onay yoksa ya da ok değilse yazılmaz, ok ise onaylayandır', async () => {
        assert.equal((await yazD('quality', 'pkgs', 'ka-p', { machine: 'X', approval: { ok: false, at: 1 } })).govde.sonuc, 'yazildi');
        const p0 = await okuD('pkgs', 'ka-p');
        assert.equal((await yazD('prep', 'pkgs', 'ka-p', { ...p0, history: [{ v: 1, at: 5, rev: 'A', ap: 'kalite kişisi' }] })).govde.sonuc, 'yazildi');
        const p1 = await okuD('pkgs', 'ka-p');
        assert.equal('ap' in p1['history'][0], false);
        assert.equal((await yazD('quality', 'pkgs', 'ka-p', { ...p1, approval: { ok: true, at: 6 } })).govde.sonuc, 'yazildi');
        const p2 = await okuD('pkgs', 'ka-p');
        assert.equal((await yazD('prep', 'pkgs', 'ka-p', { ...p2, history: [...p2['history'], { v: 2, at: 7, rev: 'A', ap: 'sahte kişi' }] })).govde.sonuc, 'yazildi');
        const p3 = await okuD('pkgs', 'ka-p');
        assert.equal(p3['history'][1].ap, 'Deneme k_quality');
        assert.equal('ap' in p3['history'][0], false, 'değişmeyen eski girdi aynen kalır');
        // değişen eski girdide de ap istemciden alınmaz
        assert.equal((await yazD('prep', 'pkgs', 'ka-p', { ...p3, history: [{ ...p3['history'][0], ap: 'sahte kişi', rev: 'B' }, p3['history'][1]] })).govde.sonuc, 'yazildi');
        assert.equal((await okuD('pkgs', 'ka-p'))['history'][0].ap, 'Deneme k_quality');
      });

      test('biçim değiştirerek damgadan kaçılamaz: kişi alanı taşıyan alanların türü denetlenir, değişen girdide silinen by oturumdan dolar', async () => {
        const kotu: [string, string, Record<string, unknown>][] = [
          ['prep', 'pkgs', { machine: 'X', history: { v: 1, by: 'x' } }],
          ['prep', 'pkgs', { machine: 'X', history: [1, 'a'] }],
          ['prep', 'pkgs', { machine: 'X', apReq: ['x'] }],
          ['prep', 'pkgs', { machine: 'X', apReq: 'x' }],
          ['quality', 'pkgs', { machine: 'X', approval: ['x'] }],
          ['operator', 'results', { pins: { a: 1 } }],
          ['operator', 'results', { meas: [1] }],
          ['operator', 'results', { meas: { 1: 'x' } }],
        ];
        let n = 0;
        for (const [rol, depo, govde] of kotu) assert.equal((await yazD(rol as ArkonRolu, depo, `kb-${(n += 1)}`, govde)).durum, 400, JSON.stringify(govde));
        const hv = await istek(cerezler.operator, 'POST', '/arkon/belgeler/kv/handover/yaz', { taban: (await oku('admin', 'kv', 'handover')).govde.belge?.surum ?? 0, govde: { v: ['x'] }, kaynak: 'g1' });
        assert.equal(hv.durum, 400);
        // null, apReq ve approval için meşrudur (Arkon yayında apReq: null yazar)
        assert.equal((await yazD('prep', 'pkgs', 'kb-null', { machine: 'X', apReq: null })).govde.sonuc, 'yazildi');
        // by silinerek kaçış: yeni girdi ve değişen girdi damgalanır, değişmeyen girdi eski değerini korur
        assert.equal((await yazD('prep', 'pkgs', 'kb-by', { machine: 'X', history: [{ v: 1, at: 1, rev: 'A', by: 'x' }] })).govde.sonuc, 'yazildi');
        const p1 = await okuD('pkgs', 'kb-by');
        assert.equal((await yazD('plan', 'pkgs', 'kb-by', { ...p1, history: [{ v: 1, at: 1, rev: 'A' }, { v: 2, at: 2, rev: 'A' }] })).govde.sonuc, 'yazildi');
        const p2 = await okuD('pkgs', 'kb-by');
        assert.deepEqual(p2['history'].map((g: { by: string }) => g.by), ['Deneme k_prep', 'Deneme k_plan']);
        assert.equal((await yazD('plan', 'pkgs', 'kb-by', { ...p2, history: [{ v: 1, at: 1, rev: 'DEĞİŞTİ' }, p2['history'][1]] })).govde.sonuc, 'yazildi');
        assert.equal((await okuD('pkgs', 'kb-by'))['history'][0].by, 'Deneme k_plan');
      });
    });
  });

  describe('sunucu günlüğü ekranın audit() çağrılarını karşılar', () => {
    const yeniSatirlar = async (islem: () => Promise<unknown>): Promise<{ area: string; action: string; target: string; detail: string | null; userId: string }[]> => {
      const once = (await istek<{ satirlar: unknown[] }>(cerezler.admin, 'GET', '/arkon/kayitlar/audit')).govde.satirlar.length;
      await islem();
      const hepsi = (await istek<{ satirlar: Record<string, any>[] }>(cerezler.admin, 'GET', '/arkon/kayitlar/audit')).govde.satirlar;
      return hepsi.slice(once) as never;
    };
    const belgeYaz = async (rol: ArkonRolu, depo: string, kimlik: string, govde: Record<string, unknown>) => {
      const taban = (await oku('admin', depo, kimlik)).govde.belge?.surum ?? 0;
      const c = await istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/${depo}/${kimlik}/yaz`, { taban, govde: { id: kimlik, ...govde }, kaynak: 'g1' });
      assert.equal(c.durum, 200);
      assert.equal(c.govde.sonuc, 'yazildi');
    };
    const satir = (s: { area: string; action: string; target: string; detail: string | null }) => [s.area, s.action, s.target, s.detail];

    test('paket: onaya gönderme, yayın, yeniden yayın, geri çekme, onay, geri gönderme, istasyon ve sıra değişimi, silme (hazirlik.ts:119,148,164,166; bakim-raporlar.ts:200; pano-planlama.ts:201)', async () => {
      const temel = { no: 'G-1', rev: 'A', part: 'Flanş', machine: 'X', status: 'draft', version: 1 };
      // Yerel paket önceden kurulu sayılır (A5): aynı gövdeyle ilk yazım günlüğe satır eklemez; oluşturma satırı TMI taslağında sınanır.
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('prep', 'pkgs', 'gp1', temel))).map(satir), []);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('prep', 'pkgs', 'gp1', { ...temel, apReq: { by: 'Deneme k_prep', at: 1 } }))).map(satir), [['paket', 'onaya gönderildi', 'G-1', 'Rev A · v1']]);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('prep', 'pkgs', 'gp1', { ...temel, apReq: { by: 'Deneme k_prep', at: 1 }, status: 'published', steps: [{ id: 's1' }], version: 2 }))).map(satir), [['paket', 'yayınlandı', 'G-1', 'Rev A · v2 · X']]);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('prep', 'pkgs', 'gp1', { ...temel, apReq: { by: 'Deneme k_prep', at: 1 }, status: 'published', steps: [{ id: 's1' }], version: 3 }))).map(satir), [['paket', 'yayınlandı', 'G-1', 'Rev A · v3 · X']]);
      const yayinli = { ...temel, apReq: { by: 'Deneme k_prep', at: 1 }, status: 'published', steps: [{ id: 's1' }], version: 3 };
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('quality', 'pkgs', 'gp1', { ...yayinli, approval: { ok: true, by: 'Deneme k_quality', note: 'tamam' } }))).map(satir), [['paket', 'kalitece onaylandı', 'G-1', 'Rev A · tamam']]);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('quality', 'pkgs', 'gp1', { ...yayinli, approval: { ok: false, by: 'Deneme k_quality' } }))).map(satir), [['paket', 'geri gönderildi', 'G-1', 'Rev A']]);
      const onayli = { ...yayinli, approval: { ok: false, by: 'Deneme k_quality' } };
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('prep', 'pkgs', 'gp1', { ...onayli, status: 'draft' }))).map(satir), [['paket', 'geri çekildi', 'G-1', null]]);
      const taslak = { ...onayli, status: 'draft' };
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('plan', 'pkgs', 'gp1', { ...taslak, machine: 'Y' }))).map(satir), [['plan', 'istasyon değişti', 'G-1', 'X → Y']]);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('plan', 'pkgs', 'gp1', { ...taslak, machine: 'Y', seq: 2 }))).map(satir), [['plan', 'sıra değişti', 'G-1', 'Y · 2']]);
      const hepsi = await yeniSatirlar(() => sil('prep', 'pkgs', 'gp1'));
      assert.deepEqual(hepsi.map(satir), [['paket', 'silindi', 'G-1', 'Flanş']]);
      // kişi ve zaman oturumdan: son satırların hepsi işlemi yapan kişinin
      assert.equal(hepsi[0]?.userId, String(kisiIdleri.prep));
    });

    test('planlı duruş, bakım ve ayar belgeleri ekranın günlük satırlarını üretir (pano-planlama.ts:288,291; bakim-raporlar.ts:30,65-67,78,241; giris-ayarlar-spc.ts:290; ayarlar-uretim.ts:51)', async () => {
      // Tesiste 08:00-10:30 (Europe/Istanbul, UTC+3): günlük duvar saatini yazar.
      const d = { title: 'Bahar bakımı', scope: 'all', from: Date.UTC(2026, 9, 7, 5, 0), to: Date.UTC(2026, 9, 7, 7, 30) };
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('admin', 'downs', 'gd1', d))).map(satir), [['planlı duruş', 'eklendi', 'Bahar bakımı', '2026-10-07 08:00–10:30']]);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('admin', 'downs', 'gd1', { ...d, note: 'x' }))).map(satir), [['planlı duruş', 'değiştirildi', 'Bahar bakımı', '2026-10-07 08:00–10:30']]);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('maint', 'downs', 'gd2', { ...d, title: 'Bakım · Yağlama' }).catch(() => undefined))).map(satir), []);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('lead', 'downs', 'gd2', { ...d, title: 'Bakım · Yağlama' }))).map(satir), [['planlı duruş', 'bakım için eklendi', 'Bakım · Yağlama', '2026-10-07 08:00–10:30']]);
      assert.deepEqual((await yeniSatirlar(() => sil('admin', 'downs', 'gd1'))).map(satir), [['planlı duruş', 'silindi', 'Bahar bakımı', null]]);

      const plan = { type: 'plan', mc: 'M1', title: 'Yağ değişimi', everyDays: 30 };
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('maint', 'maint', 'gm1', plan))).map(satir), [['bakım', 'periyodik plan eklendi', 'M1', 'Yağ değişimi · 30 günde bir']]);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('maint', 'maint', 'gm1', { ...plan, everyDays: 60 }))).map(satir), [['bakım', 'periyodik plan değişti', 'M1', 'Yağ değişimi · 60 günde bir']]);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('maint', 'maint', 'gm2', { type: 'pm', planId: 'gm1', mc: 'M1', title: 'Yağ değişimi' }))).map(satir), [['bakım', 'periyodik bakım yapıldı', 'M1', 'Yağ değişimi']]);
      assert.deepEqual((await yeniSatirlar(() => sil('maint', 'maint', 'gm1'))).map(satir), [['bakım', 'periyodik plan silindi', 'M1', 'Yağ değişimi']]);
      const ariza = { type: 'ariza', st: 'ST1', mc: 'M1', title: 'Ses geliyor', status: 'open' };
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('lead', 'maint', 'gm3', ariza))).map(satir), [['bakım', 'arıza açıldı', 'ST1 · M1', 'Ses geliyor']]);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('maint', 'maint', 'gm3', { ...ariza, status: 'work' }))).map(satir), [['bakım', 'arıza üstlenildi', 'ST1 · M1', 'Ses geliyor']]);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('maint', 'maint', 'gm3', { ...ariza, status: 'done' }))).map(satir), [['bakım', 'arıza kapatıldı', 'ST1 · M1', 'Ses geliyor']]);
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('maint', 'maint', 'gm3', { ...ariza, status: 'done', cause: 'yağ' }))).map(satir), []);


      const kv = async (rol: ArkonRolu, anahtar: string) => {
        const taban = (await oku('admin', 'kv', anahtar)).govde.belge?.surum ?? 0;
        return istek(cerezler[rol], 'POST', `/arkon/belgeler/kv/${anahtar}/yaz`, { taban, govde: { v: { x: Math.random() } }, kaynak: 'g1' });
      };
      assert.deepEqual((await yeniSatirlar(() => kv('admin', 'mode'))).map(satir), [['sistem', 'çalışma kipi değişti', '', null]]);
      assert.deepEqual((await yeniSatirlar(() => kv('admin', 'policy'))).map(satir), [['kural', 'çalışma kuralları değişti', '', null]]);
      // Sonuç, numune ve malzeme isteği günlüğe girmez; konumsuz yazımda satır üretilmez
      assert.deepEqual((await yeniSatirlar(() => belgeYaz('operator', 'results', 'gr1', { good: 1 }))).map(satir), []);
    });
  });

  describe('yetki matrisi (kv/perms) sunucu tablolarından türer', () => {
    // Arkon'un varsayılan matrisi: arkon/web/src/app/ortak-ayarlar.ts:48 PERMS0.
    const PERMS0: Record<string, string[]> = {
      plan: ['page.op', 'page.board', 'page.plan', 'page.prep', 'page.quality', 'page.report', 'page.draw', 'pkg.edit', 'pkg.publish', 'prod.station', 'q.report', 'adm.shifts', 'plan.edit', 'down.edit', 'logi.handle'],
      prep: ['page.op', 'page.board', 'page.plan', 'page.prep', 'page.quality', 'page.report', 'page.draw', 'pkg.edit', 'pkg.publish', 'pkg.del', 'prod.station', 'q.report'],
      quality: ['page.op', 'page.board', 'page.quality', 'page.report', 'q.meas', 'q.decide', 'q.report', 'prod.ack', 'pkg.approve', 'gauge.edit'],
      lead: ['page.op', 'page.board', 'page.plan', 'page.quality', 'page.maint', 'page.report', 'prod.run', 'prod.fix', 'prod.station', 'prod.ack', 'q.report', 'adm.shifts', 'down.edit', 'logi.req', 'maint.work'],
      maint: ['page.op', 'page.board', 'page.maint', 'page.report', 'prod.ack', 'prod.station', 'maint.work', 'maint.plan'],
      operator: ['page.op', 'prod.run', 'logi.req'],
    };
    const TUM_ANAHTARLAR = [...new Set(Object.values(PERMS0).flat()), 'adm.users', 'adm.plant', 'adm.backup', 'adm.demo', 'adm.reasons', 'adm.audit', 'page.draw'];
    let n = 0;
    const id = (): string => `ym-${(n += 1)}`;
    const ekle = (rol: ArkonRolu, tur: string, satir: Record<string, unknown>) =>
      istek<{ eklenen: number }>(cerezler[rol], 'POST', `/arkon/kayitlar/${tur}/ekle`, { satirlar: [satir], kaynak: 'g1' });
    const matrisOku = async (rol: ArkonRolu): Promise<Record<string, string[]>> =>
      ((await oku(rol, 'kv', 'perms')).govde.belge?.govde as { v: Record<string, string[]> }).v;

    test('kv/perms yazımı ve silmesi yönetici dahil herkese 403 ("TMI\'de yönetilir"); okuma türetilmiş matrisi verir, kayıtlı eski değer yok sayılır', async () => {
      for (const rol of ROLLER) {
        const y = await istek(cerezler[rol], 'POST', '/arkon/belgeler/kv/perms/yaz', { taban: 0, govde: { v: { operator: ['pkg.del'] } }, kaynak: 'g1' });
        assert.equal(y.durum, 403, rol);
        assert.match((y.govde as unknown as { mesaj: string }).mesaj, /TMI/);
        assert.equal((await istek(cerezler[rol], 'POST', '/arkon/belgeler/kv/perms/sil', { kaynak: 'g1' })).durum, 403, rol);
      }
      // Önceden (yerelde) yazılmış değer: tabloda satır olsa bile okuma türetilmiş matristir.
      await vt().sorgu("INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('kv', 'perms', $1, 5, $2) ON CONFLICT (depo, kimlik) DO NOTHING", [JSON.stringify({ v: { operator: ['pkg.del', 'adm.audit'] } }), yoneticiId]);
      const m = await matrisOku('operator');
      assert.ok(!m['operator']?.includes('pkg.del'));
      const liste = (await istek<{ belgeler: { kimlik: string; govde: { v: unknown } }[] }>(cerezler.admin, 'GET', '/arkon/belgeler/kv')).govde.belgeler.filter((b) => b.kimlik === 'perms');
      assert.equal(liste.length, 1);
      assert.deepEqual(liste[0]?.govde.v, m);
    });

    test('okunan matris Arkon\'un bütün izin anahtarlarını bilir; eşlenmeyen anahtarlar varsayılandan aynen gelir; hiçbir role varsayılandan fazla izin eklenmez', async () => {
      const m = await matrisOku('plan');
      const bilinen = (m as unknown as { _known: string[] })._known;
      for (const k of TUM_ANAHTARLAR) assert.ok(bilinen.includes(k), k);
      assert.equal(bilinen.length, new Set(bilinen).size);
      for (const [rol, varsayilan] of Object.entries(PERMS0)) {
        const turetilen = m[rol] ?? [];
        for (const k of turetilen) assert.ok(varsayilan.includes(k), `${rol} ${k} varsayılanda yok`);
        for (const k of ESLENMEYEN_IZINLER) assert.equal(turetilen.includes(k), varsayilan.includes(k), `${rol} ${k}`);
      }
      assert.ok(ESLENMEYEN_IZINLER.includes('page.op') && ESLENMEYEN_IZINLER.includes('adm.plant') && ESLENMEYEN_IZINLER.includes('adm.shifts') && ESLENMEYEN_IZINLER.includes('gauge.edit') && !ESLENMEYEN_IZINLER.includes('pkg.del'));
    });

    test('tablo güdümlü çapraz denetim: matriste olan her eylemi sunucu kabul eder, varsayılanda olup matristen düşen her eylemi reddeder', async () => {
      const iletiYolla = (rol: ArkonRolu, type: string) => istek(cerezler[rol], 'POST', '/arkon/iletiler', { ileti: { type }, kaynak: 'g1' });
      const belgeYaz = (rol: ArkonRolu, depo: string, govde: Record<string, unknown>) => {
        const kimlik = id();
        return istek<BelgeYazCevabi>(cerezler[rol], 'POST', `/arkon/belgeler/${depo}/${kimlik}/yaz`, { taban: 0, govde: { id: kimlik, ...govde }, kaynak: 'g1' });
      };
      const ESLEME: Record<string, (rol: ArkonRolu) => Promise<{ durum: number }>> = {
        'prod.run': (r) => ekle(r, 'counts', { cid: id() }),
        'prod.ack': (r) => iletiYolla(r, 'call-ack'),
        'logi.req': (r) => belgeYaz(r, 'logi', {}),
        'logi.handle': (r) => belgeYaz(r, 'logi', {}),
        'plan.edit': (r) => iletiYolla(r, 'pkg-order'),
        'down.edit': (r) => belgeYaz(r, 'downs', DURUS),
        'pkg.edit': (r) => belgeYaz(r, 'pkgs', { machine: 'X' }),
        'pkg.publish': (r) => iletiYolla(r, 'pkg'),
        'pkg.del': async (r) => {
          const k = id();
          await yaz('admin', 'pkgs', k, 0, { id: k });
          return sil(r, 'pkgs', k);
        },
        'pkg.approve': (r) => iletiYolla(r, 'pkg-approved'),
        'q.meas': (r) => belgeYaz(r, 'requests', { machine: 'X', status: 'measuring' }),
        'q.decide': (r) => belgeYaz(r, 'requests', { machine: 'X', status: 'approved' }),
        'maint.work': (r) => belgeYaz(r, 'maint', { type: 'ariza' }),
        'maint.plan': (r) => belgeYaz(r, 'maint', { type: 'plan' }),
      };
      let denetlenen = 0;
      for (const rol of Object.keys(PERMS0) as ArkonRolu[]) {
        const matris = await matrisOku(rol);
        for (const [anahtar, eylem] of Object.entries(ESLEME)) {
          const varsayilanda = PERMS0[rol]?.includes(anahtar) === true;
          const matriste = matris[rol]?.includes(anahtar) === true;
          if (matriste) assert.equal((await eylem(rol)).durum, 200, `${rol} ${anahtar}: matriste var, sunucu reddetti`);
          else if (varsayilanda) assert.equal((await eylem(rol)).durum, 403, `${rol} ${anahtar}: matristen düştü, sunucu kabul etti`);
          else continue;
          denetlenen += 1;
        }
      }
      assert.ok(denetlenen >= 22, `denetlenen ${denetlenen}`);
      // Yoksayılan taraf: varsayılanda olmayıp sunucunun kabul ettiği eylemler matriste YOKTUR (gevşek taraf; belgelenir).
      const gevsek = (await matrisOku('operator'))['operator'] ?? [];
      assert.ok(!gevsek.includes('logi.handle') && (await ESLEME['logi.handle']?.('operator'))?.durum === 200);
    });

    test('değişiklik günlüğünü yalnız yönetici okur', async () => {
      for (const rol of ROLLER) {
        const c = await istek(cerezler[rol], 'GET', '/arkon/kayitlar/audit');
        assert.equal(c.durum, rol === 'admin' ? 200 : 403, rol);
      }
      const m = await matrisOku('quality');
      assert.ok(!(m['quality'] ?? []).includes('adm.audit'));
    });
  });

  describe('anlık ileti türleri', () => {
    const TUM: readonly ArkonRolu[] = ROLLER;
    // Kaynak: arkon/web/src içindeki bütün Bus.send çağrıları (rol: çağrıyı yapan ekranın yetki denetimi).
    const GONDEREN: Record<string, readonly ArkonRolu[]> = {
      cfg: ['admin', 'plan', 'lead'],
      'pkg-approved': ['admin', 'quality'],
      call: TUM,
      'call-ack': ['admin', 'quality', 'lead', 'maint'],
      'call-done': TUM,
      maint: ['admin', 'lead', 'maint'],
      'pkg-draft': ['admin', 'prep', 'plan'],
      'pkg-removed': ['admin', 'prep', 'plan'],
      'pkg-approval': ['admin', 'prep', 'plan'],
      pkg: ['admin', 'prep', 'plan'],
      'pkg-order': ['admin', 'plan'],
      'pin-resolved': ['admin', 'prep', 'plan'],
      'sample-result': ['admin', 'quality'],
      result: ['admin', 'quality', 'operator', 'lead'],
      progress: ['admin', 'operator', 'lead', 'quality', 'prep', 'plan'],
      sample: ['admin', 'operator', 'lead', 'quality'],
      downs: ['admin', 'plan', 'lead'],
      logi: ['admin', 'operator', 'lead', 'plan'],
    };
    const gonder = (rol: ArkonRolu, ileti: unknown) => istek(cerezler[rol], 'POST', '/arkon/iletiler', { ileti, kaynak: 'g1' });
    const iletiSayisi = async (): Promise<number> => (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_ileti'))?.n ?? -1;

    test('ileti türü izinli listededir ve gönderebilecek rol türe göredir; öteki 403, bilinmeyen tür 400 ve hiçbiri cihazlara ulaşmaz', async () => {
      for (const [tur, izinli] of Object.entries(GONDEREN)) {
        for (const rol of ROLLER) {
          const once = await iletiSayisi();
          const cevap = await gonder(rol, { type: tur, id: 'x', mid: 'm1', at: 1 });
          assert.equal(cevap.durum, izinli.includes(rol) ? 200 : 403, `${tur} ${rol}`);
          assert.equal(await iletiSayisi() - once, izinli.includes(rol) ? 1 : 0, `${tur} ${rol} yayın`);
        }
      }
      const once = await iletiSayisi();
      for (const tur of ['bogus', 'pkg-approved ', 'PKG', 'cfg2', '', 'constructor', '__proto__', 'toString', 'pkgs', 'results', 'gauges']) {
        for (const rol of ['admin', 'operator'] as const) assert.equal((await gonder(rol, { type: tur })).durum, 400, JSON.stringify(tur));
      }
      assert.equal((await gonder('admin', { type: 5 })).durum, 400);
      assert.equal(await iletiSayisi(), once);
    });

    test('ileti boyutu BAYT olarak sınırlıdır (çok baytlı karakter); kişi başına dakikada 120 ileti, aşım 429, başkası etkilenmez', async () => {
      // 5000 karakter ama 10000 bayt
      assert.equal((await gonder('operator', { type: 'call', note: 'ş'.repeat(5000) })).durum, 400);
      assert.equal((await gonder('operator', { type: 'call', note: 'ş'.repeat(3000) })).durum, 200);
      const hiz = await arkonKisiKur('hiz_op', 'operator');
      const yolla = (cerez: string) => istek(cerez, 'POST', '/arkon/iletiler', { ileti: { type: 'call' }, kaynak: 'g1' });
      for (let i = 0; i < 120; i += 1) assert.equal((await yolla(hiz.cerez)).durum, 200, String(i));
      assert.equal((await yolla(hiz.cerez)).durum, 429);
      assert.equal((await yolla(hiz.cerez)).durum, 429);
      assert.equal((await yolla(cerezler.lead)).durum, 200);
    });

    test('ileti: Arkon\'un gerçek ileti gövdeleri geçer', async () => {
      assert.equal((await gonder('operator', { type: 'call', note: 'x'.repeat(9000) })).durum, 400);
      const gercekler: [ArkonRolu, Record<string, unknown>][] = [
        ['operator', { type: 'call', k: 'bakim', l: 'Bakım', machine: 'TZG-04', wc: 'TAL', mc: null, by: 'Deneme', t0: 1, note: 'ses var', orderNo: 'UE-1', at: 2, mid: 'a1' }],
        ['operator', { type: 'progress', id: 'p1', no: 'UE-1', at: 2, mid: 'a2' }],
        ['operator', { type: 'sample', reqId: 'rq1', no: 'UE-1', machine: 'TZG-04', reason: 'İlk parça', at: 2, mid: 'a3' }],
        ['prep', { type: 'pkg', id: 'p1', no: 'UE-1', rev: 'A', version: 2, machine: 'TZG-04', at: 2, mid: 'a4' }],
        ['quality', { type: 'sample-result', reqId: 'rq1', id: 'p1', no: 'UE-1', status: 'approved', machine: 'TZG-04', at: 2, mid: 'a5' }],
        ['quality', { type: 'pkg-approved', id: 'p1', ok: true, note: '', at: 2, mid: 'a6' }],
        ['operator', { type: 'result', id: 'p1', no: 'UE-1', at: 2, mid: 'a9' }],
        // 101 a: sonuç iletisi operatör ve amire de açıktır (iş geçişi ve operatör ölçümü).
        ['lead', { type: 'result', id: 'p1', no: 'UE-1', at: 2, mid: 'a10' }],
        ['lead', { type: 'cfg', at: 2, mid: 'a7' }],
        ['plan', { type: 'downs', id: 'dn-1', del: true, at: 2, mid: 'a8' }],
      ];
      for (const [rol, ileti] of gercekler) assert.equal((await gonder(rol, ileti)).durum, 200, String(ileti['type']));
    });
  });

  describe('veri kapsamı', () => {
    let sayac = 0;
    const kod = (onek: string): string => `${onek}${(sayac += 1)}`;
    interface Yer { merkez: string; merkezId: number; istasyon: string; istasyonId: number; makine: string }
    let A = {} as Yer;
    let B = {} as Yer;
    let kapsamliOp = { id: 0, cerez: '' };
    let kapsamliPlan = { id: 0, cerez: '' };
    let kapsamliLead = { id: 0, cerez: '' };

    async function yerKur(ad: string): Promise<Yer> {
      const im = await istek<{ id: number; kod: string }>(yonetici, 'POST', '/is-merkezleri', { kod: kod('KM'), ad });
      const ist = await istek<{ id: number; kod: string }>(yonetici, 'POST', '/istasyonlar', { kod: kod('KI'), ad, isMerkeziId: im.govde.id, tip: 'kalite' });
      const mk = await istek<{ kod: string }>(yonetici, 'POST', '/makineler', { kod: kod('KK'), ad, istasyonId: ist.govde.id, baglantiTuru: 'mtconnect' });
      assert.equal(mk.durum, 200, JSON.stringify(mk.govde));
      return { merkez: im.govde.kod, merkezId: im.govde.id, istasyon: ist.govde.kod, istasyonId: ist.govde.id, makine: mk.govde.kod };
    }

    before(async () => {
      A = await yerKur('Kapsam A');
      B = await yerKur('Kapsam B');
      kapsamliOp = await arkonKisiKur('kapsamli_op', 'operator');
      kapsamliPlan = await arkonKisiKur('kapsamli_plan', 'plan');
      kapsamliLead = await arkonKisiKur('kapsamli_lead', 'lead');
      for (const kisi of [kapsamliOp, kapsamliPlan, kapsamliLead]) {
        const r = await istek(yonetici, 'POST', `/kisi-is-merkezleri/${kisi.id}/belirle`, { isMerkeziIdleri: [A.merkezId] });
        assert.equal(r.durum, 200, JSON.stringify(r.govde));
      }
    });

    const ekle = (cerez: string, tur: string, satirlar: Record<string, unknown>[]) =>
      istek<{ eklenen: number }>(cerez, 'POST', `/arkon/kayitlar/${tur}/ekle`, { satirlar, kaynak: 'g1' });
    const kayitlar = (cerez: string, tur: string) => istek<{ satirlar: Record<string, unknown>[] }>(cerez, 'GET', `/arkon/kayitlar/${tur}`);

    test('kayıt eklemede iş merkezi, istasyon ya da makine kodundan çözülen iş merkezi kapsam dışıysa 403 ve hiçbir satır yazılmaz', async () => {
      const op = kapsamliOp.cerez;
      assert.equal((await ekle(op, 'counts', [{ cid: 'kp-a1', wc: A.merkez, machine: A.istasyon, mc: A.makine, kind: 'good', delta: 1 }])).govde.eklenen, 1);
      const redler: Record<string, unknown>[] = [
        { cid: 'kp-b1', wc: B.merkez },
        { cid: 'kp-b2', machine: B.istasyon },
        { cid: 'kp-b3', mc: B.makine },
        { cid: 'kp-b4', wc: A.merkez, machine: B.istasyon },
        { cid: 'kp-b5', wc: B.merkez, machine: A.istasyon },
      ];
      for (const satir of redler) assert.equal((await ekle(op, 'counts', [{ ...satir, kind: 'good', delta: 1 }])).durum, 403, String(satir['cid']));
      // Bir toplu isteğin tek kötü satırı bütününü geri alır.
      assert.equal((await ekle(op, 'counts', [{ cid: 'kp-a2', wc: A.merkez }, { cid: 'kp-b6', wc: B.merkez }])).durum, 403);
      const sayi = await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM arkon_kayit WHERE cid LIKE 'kp-%'");
      assert.equal(sayi?.n, 1);
      // Kısıtlı kişide iş merkezi çözülemeyen kayıt (kod yok ya da TMI'de tanımsız kod) reddedilir; kısıtsız kişide null kuralı kalır.
      assert.equal((await ekle(op, 'counts', [{ cid: 'kp-n1', kind: 'good', delta: 1 }])).durum, 403);
      assert.equal((await ekle(op, 'counts', [{ cid: 'kp-n2', machine: 'TMI-DE-YOK' }])).durum, 403);
      assert.equal((await ekle(cerezler.operator, 'counts', [{ cid: 'kp-n1', kind: 'good', delta: 1 }, { cid: 'kp-n2', machine: 'TMI-DE-YOK' }])).govde.eklenen, 2);
      // Kapsamı olmayan kişi her iş merkezine yazar.
      assert.equal((await ekle(cerezler.operator, 'counts', [{ cid: 'kp-b7', wc: B.merkez }])).govde.eklenen, 1);
    });

    test('kayıt listesinde kapsam dışı iş merkezinin satırları görünmez; kapsamsız kişi hepsini görür', async () => {
      await ekle(cerezler.operator, 'events', [
        { cid: 'ls-a', wc: A.merkez, machine: A.istasyon, state: 'running' },
        { cid: 'ls-b1', wc: B.merkez, state: 'running' },
        { cid: 'ls-b2', machine: B.istasyon, state: 'running' },
        { cid: 'ls-b3', mc: B.makine, state: 'running' },
        { cid: 'ls-n', state: 'running' },
        { cid: 'ls-karisik', wc: A.merkez, mc: B.makine, state: 'running' },
      ]);
      const gorunen = (await kayitlar(kapsamliOp.cerez, 'events')).govde.satirlar.map((s) => s['cid']).sort();
      assert.deepEqual(gorunen.filter((c) => String(c).startsWith('ls-')), ['ls-a']);
      const hepsi = (await kayitlar(yonetici, 'events')).govde.satirlar.map((s) => s['cid']);
      for (const c of ['ls-a', 'ls-b1', 'ls-b2', 'ls-b3', 'ls-n', 'ls-karisik']) assert.ok(hepsi.includes(c), c);
    });

    test('istasyona bağlı belgeler: kapsam dışı yazma, ezme, silme 403; liste ve okuma kapsam dışını göstermez', async () => {
      const pa = surum(await yaz('admin', 'pkgs', 'kb-pa', 0, { id: 'kb-pa', machine: A.istasyon }));
      const pb = surum(await yaz('admin', 'pkgs', 'kb-pb', 0, { id: 'kb-pb', machine: B.istasyon }));
      assert.ok(pa > 0 && pb > 0);
      const plan = kapsamliPlan.cerez;
      const pYaz = (kimlik: string, taban: number, govde: unknown) => istek<BelgeYazCevabi>(plan, 'POST', `/arkon/belgeler/pkgs/${kimlik}/yaz`, { taban, govde, kaynak: 'g1' });
      assert.equal((await pYaz('kb-yeni-a', 0, { id: 'kb-yeni-a', machine: A.istasyon })).durum, 200);
      assert.equal((await pYaz('kb-yeni-b', 0, { id: 'kb-yeni-b', machine: B.istasyon })).durum, 403);
      assert.equal((await pYaz('kb-yeni-mc', 0, { id: 'kb-yeni-mc', machine: A.istasyon, mc: B.makine })).durum, 403);
      // Kapsam dışı belgeyi kendi kapsamındaki istasyonu yazarak ezemez (var olan belgenin yeri de denetlenir).
      assert.equal((await pYaz('kb-pb', pb, { id: 'kb-pb', machine: A.istasyon })).durum, 403);
      assert.deepEqual((await oku('admin', 'pkgs', 'kb-pb')).govde.belge?.govde, { id: 'kb-pb', machine: B.istasyon });
      // Kendi kapsamındaki belgeyi başka iş merkezine taşıyamaz.
      assert.equal((await pYaz('kb-pa', pa, { id: 'kb-pa', machine: B.istasyon })).durum, 403);
      // Sonuç belgesi paketin istasyonundan: kapsam dışı paketin sonucu yazılamaz.
      const ropa = await istek(kapsamliOp.cerez, 'POST', '/arkon/belgeler/results/kb-pa/yaz', { taban: 0, govde: { id: 'kb-pa', good: 1 }, kaynak: 'g1' });
      assert.equal(ropa.durum, 200);
      const ropb = await istek(kapsamliOp.cerez, 'POST', '/arkon/belgeler/results/kb-pb/yaz', { taban: 0, govde: { id: 'kb-pb', good: 1 }, kaynak: 'g1' });
      assert.equal(ropb.durum, 403);
      // Silme: planlama duruş siler; kapsam dışı hedefli duruş silinemez.
      assert.equal((await yaz('admin', 'downs', 'kb-db', 0, { ...DURUS, id: 'kb-db', scope: 'st', target: B.istasyon })).durum, 200);
      assert.equal((await yaz('admin', 'downs', 'kb-da', 0, { ...DURUS, id: 'kb-da', scope: 'wc', target: A.merkez })).durum, 200);
      assert.equal((await istek(plan, 'POST', '/arkon/belgeler/downs/kb-db/sil', { kaynak: 'g1' })).durum, 403);
      assert.equal((await istek(plan, 'POST', '/arkon/belgeler/downs/kb-da/sil', { kaynak: 'g1', taban: (await oku('admin', 'downs', 'kb-da')).govde.belge?.surum ?? 0 })).durum, 200);
      assert.ok((await oku('admin', 'downs', 'kb-db')).govde.belge);
      // Liste ve tek okuma.
      await yaz('admin', 'results', 'kb-pb', 0, { id: 'kb-pb', good: 5 });
      const liste = async (depo: string, cerez: string) =>
        (await istek<{ belgeler: { kimlik: string }[] }>(cerez, 'GET', `/arkon/belgeler/${depo}`)).govde.belgeler.map((b) => b.kimlik);
      const pk = await liste('pkgs', plan);
      assert.ok(pk.includes('kb-pa'));
      assert.ok(!pk.includes('kb-pb'));
      assert.ok((await liste('pkgs', cerezler.plan)).includes('kb-pb'));
      assert.ok(!(await liste('results', kapsamliOp.cerez)).includes('kb-pb'));
      assert.ok((await liste('results', yonetici)).includes('kb-pb'));
      assert.ok(!(await liste('downs', plan)).includes('kb-db'));
      assert.equal((await istek<BelgeCevabi>(plan, 'GET', '/arkon/belgeler/pkgs/kb-pb')).govde.belge, null);
      assert.ok((await istek<BelgeCevabi>(plan, 'GET', '/arkon/belgeler/pkgs/kb-pa')).govde.belge);
    });

    // G-1 (E-17): dosya özetle adreslenir; özeti bilmek okumaya yetmez. Okuma kuralı belge okumasıyla aynıdır.
    test('dosya yalnız onu anan belgeyi okuyabilene ya da yükleyene akar; kapsam dışı ve bağsız dosya "yok" döner', async () => {
      const dosyaKoy = async (metin: string): Promise<{ ozet: string; icerik: Buffer }> => {
        const icerik = Buffer.from(metin.repeat(50));
        const ozet = createHash('sha256').update(icerik).digest('hex');
        await vt().sorgu('INSERT INTO arkon_dosya (ozet, icerik, boyut, yukleyen_id) VALUES ($1, $2, $3, $4)', [ozet, icerik, icerik.length, kisiIdleri.admin]);
        return { ozet, icerik };
      };
      const indir = async (cerez: string, ozet: string) => {
        const c = await app.inject({ method: 'GET', url: `/api/arkon/dosyalar/${ozet}`, headers: { cookie: cerez } });
        return { durum: c.statusCode, icerik: c.rawPayload };
      };
      const fa = await dosyaKoy('kapsam A cizimi ');
      const fb = await dosyaKoy('kapsam B cizimi ');
      const bagsiz = await dosyaKoy('bagsiz dosya ');
      // Arkon dosyayı her derinlikte anar (dizi içinde nesne).
      assert.equal(surum(await yaz('admin', 'pkgs', 'kd-fa', 0, { id: 'kd-fa', machine: A.istasyon, files: [{ name: 'a.pdf', data: { $blob: fa.ozet, t: 'u8', n: fa.icerik.length } }] })) > 0, true);
      assert.equal(surum(await yaz('admin', 'pkgs', 'kd-fb', 0, { id: 'kd-fb', machine: B.istasyon, files: [{ name: 'b.pdf', data: { $blob: fb.ozet, t: 'u8', n: fb.icerik.length } }] })) > 0, true);
      const plan = kapsamliPlan.cerez;
      const a = await indir(plan, fa.ozet);
      assert.deepEqual([a.durum, a.icerik.equals(fa.icerik)], [200, true]);
      assert.equal((await indir(plan, fb.ozet)).durum, 404);
      assert.equal((await indir(plan, bagsiz.ozet)).durum, 404);
      // Kapsamsız kişi kapsam dışını okur; bağsız dosyayı yalnız yükleyen okur.
      assert.equal((await indir(cerezler.plan, fb.ozet)).icerik.equals(fb.icerik), true);
      assert.equal((await indir(cerezler.plan, bagsiz.ozet)).durum, 404);
      assert.equal((await indir(cerezler.admin, bagsiz.ozet)).icerik.equals(bagsiz.icerik), true);
      // Belge dosyayı anmayı bırakınca kapsamdaki kişi de okuyamaz.
      assert.equal((await yaz('admin', 'pkgs', 'kd-fa', (await oku('admin', 'pkgs', 'kd-fa')).govde.belge?.surum ?? 0, { id: 'kd-fa', machine: A.istasyon, files: [] })).durum, 200);
      assert.equal((await indir(plan, fa.ozet)).durum, 404);
    });

    // Rol panosu (kart #489): sayım Arkon listesiyle aynı kapsamdadır; kısıtlı bakımcı başka iş merkezinin arızasını saymaz.
    test('rol panosu özeti kapsamla süzülür: kısıtlı kişi yalnız kendi iş merkezindeki açık arızayı sayar, kapsamsız kişi hepsini', async () => {
      const kapsamliBakim = await arkonKisiKur('kapsamli_bakim', 'maint');
      const r = await istek(yonetici, 'POST', `/kisi-is-merkezleri/${kapsamliBakim.id}/belirle`, { isMerkeziIdleri: [A.merkezId] });
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
      const acik = async (cerez: string) => (await istek<{ bakimAcik: number | null }>(cerez, 'GET', '/arkon/ozet')).govde.bakimAcik!;
      const [kisitliOnce, tumOnce] = [await acik(kapsamliBakim.cerez), await acik(cerezler.maint)];
      assert.equal((await yaz('admin', 'maint', 'oz-ka', 0, { id: 'oz-ka', type: 'ariza', status: 'open', st: A.istasyon, wc: A.merkez })).durum, 200);
      assert.equal((await yaz('admin', 'maint', 'oz-kb', 0, { id: 'oz-kb', type: 'ariza', status: 'open', st: B.istasyon, wc: B.merkez })).durum, 200);
      assert.deepEqual([await acik(kapsamliBakim.cerez) - kisitliOnce, await acik(cerezler.maint) - tumOnce], [1, 2]);
    });

    test('TMI\'deki açık emirden türeyen taslak paket yalnız iş merkezi kapsamındaki kişiye görünür; taslağı kapsam dışından ezemez', async () => {
      const emir = await emirYaz({ parcaNo: 'KAPSAM-B', parcaAd: 'B parçası', adet: 3, istasyonId: B.istasyonId, projeId });
      assert.equal(emir.durum, 200, JSON.stringify(emir.govde));
      const kimlik = `tmi-ue-${emir.govde.emir.id}`;
      const liste = async (cerez: string) =>
        (await istek<{ belgeler: { kimlik: string }[] }>(cerez, 'GET', '/arkon/belgeler/pkgs')).govde.belgeler.map((b) => b.kimlik);
      assert.ok((await liste(yonetici)).includes(kimlik));
      assert.ok(!(await liste(kapsamliPlan.cerez)).includes(kimlik));
      assert.equal((await istek<BelgeCevabi>(kapsamliPlan.cerez, 'GET', `/arkon/belgeler/pkgs/${kimlik}`)).govde.belge, null);
      const ez = await istek(kapsamliPlan.cerez, 'POST', `/arkon/belgeler/pkgs/${kimlik}/yaz`, { taban: 0, govde: { id: kimlik, machine: A.istasyon }, kaynak: 'g1' });
      assert.equal(ez.durum, 403);
    });

    // A5 (kart #541): Arkon'dan emir açılmaz; yeni paket yalnız TMI emrinin ya da iş emrinin paketidir.
    test('A5: yeni yerel paket her yazan rolde 403 ve belge oluşmaz; var olan yerel paket yazılır; TMI taslağının ilk kaydı geçer ve "oluşturuldu" yazar', async () => {
      for (const rol of ['admin', 'plan', 'prep', 'quality'] as const) {
        const kimlik = `a5-yerel-${rol}`;
        const red = await istekDogrudan<{ error?: string }>(cerezler[rol], 'POST', `/arkon/belgeler/pkgs/${kimlik}/yaz`, { taban: 0, govde: { id: kimlik, machine: A.istasyon }, kaynak: 'g1' });
        assert.equal(red.durum, 403, rol);
        assert.equal((await oku('admin', 'pkgs', kimlik)).govde.belge, null, rol);
      }
      // Kanonik olmayan TMI kimliği de yereldir.
      assert.equal((await istekDogrudan(yonetici, 'POST', '/arkon/belgeler/pkgs/tmi-ue-0012/yaz', { taban: 0, govde: { id: 'tmi-ue-0012', machine: A.istasyon }, kaynak: 'g1' })).durum, 403);
      await vt().sorgu("INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('pkgs', 'a5-eski', $1, 7, $2)", [JSON.stringify({ id: 'a5-eski', machine: A.istasyon }), yoneticiId]);
      const eski = await istekDogrudan<BelgeYazCevabi>(yonetici, 'POST', '/arkon/belgeler/pkgs/a5-eski/yaz', { taban: 7, govde: { id: 'a5-eski', machine: A.istasyon, note: 'güncel' }, kaynak: 'g1' });
      assert.equal(eski.durum, 200, JSON.stringify(eski.govde));
      assert.equal(eski.govde.sonuc, 'yazildi');
      const emir = await emirYaz({ parcaNo: 'A5-P', parcaAd: 'A5 parçası', adet: 2, istasyonId: A.istasyonId, projeId });
      assert.equal(emir.durum, 200, JSON.stringify(emir.govde));
      const kimlik = `tmi-ue-${emir.govde.emir.id}`;
      const taslak = (await oku('admin', 'pkgs', kimlik)).govde.belge;
      assert.ok(taslak, 'TMI emrinin taslağı Hazırlık\'ta görünür');
      const ilk = await istekDogrudan<BelgeYazCevabi>(yonetici, 'POST', `/arkon/belgeler/pkgs/${kimlik}/yaz`, { taban: taslak.surum, govde: { ...(taslak.govde as object), note: 'A5' }, kaynak: 'g1' });
      assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
      assert.equal(ilk.govde.sonuc, 'yazildi');
      const satirlar = (await kayitlar(yonetici, 'audit')).govde.satirlar.filter((r) => r['target'] === (taslak.govde as { no: string }).no);
      assert.deepEqual(satirlar.map((r) => r['action']), ['oluşturuldu']);
    });

    test('kapsamlı kişinin meşru akışı geçer: kendi istasyonunda sayım, paket, sonuç, bakım ve malzeme isteği', async () => {
      assert.equal((await ekle(kapsamliOp.cerez, 'counts', [{ cid: 'ok-1', wc: A.merkez, machine: A.istasyon, kind: 'good', delta: 1 }])).govde.eklenen, 1);
      assert.equal((await istek(kapsamliOp.cerez, 'POST', '/arkon/belgeler/logi/ok-l/yaz', { taban: 0, govde: { id: 'ok-l', st: A.istasyon, wc: A.merkez }, kaynak: 'g1' })).durum, 200);
      assert.equal((await istek(kapsamliLead.cerez, 'POST', '/arkon/belgeler/maint/ok-m/yaz', { taban: 0, govde: { id: 'ok-m', type: 'ariza', st: A.istasyon, mc: A.makine, wc: A.merkez }, kaynak: 'g1' })).durum, 200);
      assert.equal((await istek(kapsamliLead.cerez, 'POST', '/arkon/belgeler/requests/ok-q/yaz', { taban: 0, govde: { id: 'ok-q', machine: A.istasyon }, kaynak: 'g1' })).durum, 200);
      assert.equal((await istek(kapsamliLead.cerez, 'POST', '/arkon/belgeler/maint/ok-m2/yaz', { taban: 0, govde: { id: 'ok-m2', type: 'ariza', st: B.istasyon }, kaynak: 'g1' })).durum, 403);
    });

    test('iletiler kapsamla süzülür: kısıtlı kişi başka iş merkezinin çağrısını, numunesini ve paket iletisini almaz, gönderemez; kod taşımayan ileti herkese gider', async () => {
      assert.equal((await yaz('admin', 'pkgs', 'il-pa', 0, { id: 'il-pa', no: 'IL-A', machine: A.istasyon })).govde.sonuc, 'yazildi');
      assert.equal((await yaz('admin', 'pkgs', 'il-pb', 0, { id: 'il-pb', no: 'IL-B', machine: B.istasyon })).govde.sonuc, 'yazildi');
      const oku = async (cerez: string, son: number) =>
        (await istek<{ son: number; iletiler: Record<string, unknown>[] }>(cerez, 'GET', `/arkon/iletiler?kaynak=okuyan&son=${son}`)).govde.iletiler;
      const son = (await istek<{ son: number }>(yonetici, 'GET', '/arkon/iletiler?kaynak=okuyan')).govde.son;
      const gonderilen: [ArkonRolu, Record<string, unknown>][] = [
        ['operator', { type: 'call', k: 'bakim', machine: A.istasyon, wc: A.merkez, note: 'A', mid: 'il-1' }],
        ['operator', { type: 'call', k: 'bakim', machine: B.istasyon, wc: B.merkez, note: 'B', mid: 'il-2' }],
        ['operator', { type: 'call', k: 'bakim', mc: B.makine, mid: 'il-3' }],
        ['operator', { type: 'sample', reqId: 'rq', no: 'IL-B', machine: B.istasyon, mid: 'il-4' }],
        ['prep', { type: 'pkg', id: 'il-pb', no: 'IL-B', mid: 'il-5' }],
        ['prep', { type: 'pkg', id: 'il-pa', no: 'IL-A', mid: 'il-6' }],
        ['operator', { type: 'call', k: 'bakim', orderNo: 'IL-B', mid: 'il-7' }],
        ['operator', { type: 'call', k: 'bakim', machine: 'TMI-DE-YOK', mid: 'il-8' }],
        ['lead', { type: 'cfg', mid: 'il-9' }],
        ['prep', { type: 'pkg-removed', id: 'il-silinmis', mid: 'il-10' }],
      ];
      for (const [rol, ileti] of gonderilen) assert.equal((await istek(cerezler[rol], 'POST', '/arkon/iletiler', { ileti, kaynak: 'g1' })).durum, 200, String(ileti['mid']));
      const mid = (l: Record<string, unknown>[]) => l.map((i) => String(i['mid'])).filter((m) => m.startsWith('il-')).sort();
      assert.deepEqual(mid(await oku(kapsamliOp.cerez, son)), ['il-1', 'il-10', 'il-6', 'il-9']);
      assert.deepEqual(mid(await oku(yonetici, son)), gonderilen.map(([, i]) => String(i['mid'])).sort());
      // Gönderim: kapsam dışı ve tanımsız konuma 403, kapsam içi ve kod taşımayan ileti geçer.
      const once = (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_ileti'))?.n;
      for (const ileti of [
        { type: 'call', k: 'bakim', machine: B.istasyon }, { type: 'call', k: 'bakim', wc: A.merkez, mc: B.makine },
        { type: 'call', k: 'bakim', machine: 'TMI-DE-YOK' }, { type: 'progress', id: 'il-pb' }, { type: 'call', k: 'bakim', machine: ['x'] },
      ]) assert.equal((await istek(kapsamliOp.cerez, 'POST', '/arkon/iletiler', { ileti, kaynak: 'g1' })).durum, 403, JSON.stringify(ileti));
      assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_ileti'))?.n, once);
      for (const ileti of [{ type: 'call', k: 'bakim', machine: A.istasyon, wc: A.merkez }, { type: 'progress', id: 'il-pa' }, { type: 'call-done', t0: 1 }]) {
        assert.equal((await istek(kapsamliOp.cerez, 'POST', '/arkon/iletiler', { ileti, kaynak: 'g1' })).durum, 200, JSON.stringify(ileti));
      }
    });

    test('ileti yoklaması: yeni ileti yoksa tesis ve paket okunmaz; varsa yalnız anılan paketler kimlikle okunur, kapsam dışı ileti yine süzülür', async () => {
      assert.equal((await yaz('admin', 'pkgs', 'yk-pa', 0, { id: 'yk-pa', no: 'YK-A', machine: A.istasyon })).govde.sonuc, 'yazildi');
      assert.equal((await yaz('admin', 'pkgs', 'yk-pb', 0, { id: 'yk-pb', no: 'YK-B', machine: B.istasyon })).govde.sonuc, 'yazildi');
      const kisi = { id: kapsamliOp.id, ad: 'Deneme kapsamli_op', islemler: [ROL_ISLEMI.operator] as never };
      const sayimli = (sayilan: string[]): Db => ({
        sorgu: (sql, p) => { sayilan.push(sql); return vt().sorgu(sql, p); },
        tek: (sql, p) => { sayilan.push(sql); return vt().tek(sql, p); },
      });
      const son = (await istek<{ son: number }>(yonetici, 'GET', '/arkon/iletiler?kaynak=yk')).govde.son;
      const bos: string[] = [];
      assert.deepEqual((await iletiler(sayimli(bos), kisi, son, 'yk')).iletiler, []);
      assert.deepEqual(bos.filter((q) => /is_merkezi|istasyon|makine|arkon_belge|kisi_is_merkezi/i.test(q)), [], 'boş yoklama tesis ve paket okumamalı');

      for (const ileti of [{ type: 'progress', id: 'yk-pb', mid: 'yk-1' }, { type: 'progress', id: 'yk-pa', mid: 'yk-2' }]) {
        assert.equal((await istek(yonetici, 'POST', '/arkon/iletiler', { ileti, kaynak: 'yk-g' })).durum, 200);
      }
      const dolu: string[] = [];
      const cevap = await iletiler(sayimli(dolu), kisi, son, 'yk');
      assert.deepEqual(cevap.iletiler.map((i) => i['mid']), ['yk-2']);
      const paketOkumalari = dolu.filter((q) => /FROM arkon_belge/.test(q) && /'pkgs'/.test(q));
      assert.ok(paketOkumalari.length > 0, 'paket okuması beklenir (yokluk testi önce verinin geldiğini doğrular)');
      assert.ok(paketOkumalari.every((q) => /kimlik = ANY/.test(q)), `bütün paketler önyüklenmemeli: ${paketOkumalari.join(' | ')}`);
    });

    test('KD-004: budama imleçten sonraki iletileri sildiyse cevap yalnız yeniden yükleme iletisidir; imlecin kendi satırı silinmişse ileti kaçmamıştır; boş tabloda yeni imleç döngü yapmaz', async () => {
      const yokla = async (son?: number) => (await istek<{ son: number; iletiler: Record<string, unknown>[] }>(
        yonetici, 'GET', `/arkon/iletiler?kaynak=kd4${son === undefined ? '' : `&son=${son}`}`)).govde;
      const gonder = async (mid: string) => assert.equal((await istek(yonetici, 'POST', '/arkon/iletiler', { ileti: { type: 'progress', id: 'kd4', mid }, kaynak: 'kd4-g' })).durum, 200);
      const sil = (sinir: number) => vt().sorgu('DELETE FROM arkon_ileti WHERE id <= $1', [sinir]);

      const s0 = (await yokla()).son;
      await gonder('kd4-1');
      await gonder('kd4-2');
      await sil(s0);
      assert.deepEqual((await yokla(s0)).iletiler.map((i) => i['mid']), ['kd4-1', 'kd4-2'], 'imlecin kendi satırı silinmiş: ileti kaçmadı');

      const s1 = (await yokla()).son;
      await gonder('kd4-3');
      await gonder('kd4-4');
      await sil(s1 + 1);
      const kacan = await yokla(s1);
      assert.deepEqual(kacan.iletiler, [{ type: '$reload' }]);
      assert.deepEqual((await yokla(kacan.son)).iletiler, []);

      const s2 = (await yokla()).son;
      await gonder('kd4-5');
      await vt().sorgu('DELETE FROM arkon_ileti');
      assert.deepEqual((await yokla(s2)).iletiler, [{ type: '$reload' }], 'boş tabloda kaçan ileti sayaçtan anlaşılır');
      const yeni = (await yokla()).son;
      assert.ok(yeni > s2);
      assert.deepEqual((await yokla(yeni)).iletiler, [], 'yeniden yüklenen cihaz yeniden yükleme döngüsüne girmemeli');
    });

    test('eski iletiler kayıt işleminde değil, arka plan işinde silinir: ileti eklemek eski satıra dokunmaz, iş 15 dakikadan eskiyi siler', async () => {
      const eski = (await vt().tek<{ id: number }>("INSERT INTO arkon_ileti (kaynak, govde, zaman) VALUES ('budama-g', '{}', now() - interval '16 minutes') RETURNING id::int AS id"))!.id;
      assert.equal((await istek(yonetici, 'POST', '/arkon/iletiler', { ileti: { type: 'progress', id: 'bd', mid: 'bd-1' }, kaynak: 'budama-g' })).durum, 200);
      const satirlar = async () => (await vt().sorgu<{ id: number }>("SELECT id::int AS id FROM arkon_ileti WHERE kaynak = 'budama-g' ORDER BY id")).map((r) => r.id);
      assert.equal((await satirlar())[0], eski, 'eşzamanlı kayıtlar aynı satırları silmek için birbirini beklemesin');
      const is = (await modulIsleriniKesfet()).find((i) => i.ad === 'arkon-ileti-budama');
      assert.equal(is, isler.find((i) => i.ad === 'arkon-ileti-budama'));
      assert.equal(is?.aralikMs, 60_000);
      assert.equal(await isiBirKezCalistir(vt(), is!), 'tamam');
      const kalan = await satirlar();
      assert.equal(kalan.length, 1);
      assert.ok(kalan[0]! > eski);
    });

    test('kısıtlı kişide kod dolanmaları kapalıdır: uydurma, küçük harf, boşluklu, dizi kod; konumsuz kayıt; pkgId/orderNo; pasif makine; alan silme', async () => {
      const op = kapsamliOp.cerez;
      assert.equal((await yaz('admin', 'pkgs', 'sk-pa', 0, { id: 'sk-pa', no: 'NO-A', machine: A.istasyon })).govde.sonuc, 'yazildi');
      assert.equal((await yaz('admin', 'pkgs', 'sk-pb', 0, { id: 'sk-pb', no: 'NO-B', machine: B.istasyon })).govde.sonuc, 'yazildi');
      assert.equal((await yaz('admin', 'pkgs', 'sk-hic', 0, { id: 'sk-hic', no: 'NO-HIC' })).govde.sonuc, 'yazildi');
      // Pasif makine: B istasyonuna ikinci makine kur ve pasifleştir.
      const pm = await istek<{ id: number; kod: string }>(yonetici, 'POST', '/makineler', { kod: kod('KP'), ad: 'Pasif', istasyonId: B.istasyonId });
      assert.equal(pm.durum, 200, JSON.stringify(pm.govde));
      const pasif = await istek(yonetici, 'POST', `/makineler/${pm.govde.id}/guncelle`, { kod: pm.govde.kod, ad: 'Pasif', istasyonId: B.istasyonId, aktif: false, surum: 1 });
      assert.equal(pasif.durum, 200, JSON.stringify(pasif.govde));
      const kotuKayitlar: Record<string, unknown>[] = [
        { cid: 'sk-1', machine: 'uydurma' },
        { cid: 'sk-2', machine: A.istasyon.toLowerCase() },
        { cid: 'sk-3', machine: ` ${A.istasyon}` },
        { cid: 'sk-4', machine: [B.istasyon] },
        { cid: 'sk-5', wc: { a: 1 } },
        { cid: 'sk-6', wc: A.merkez, machine: [B.istasyon] },
        { cid: 'sk-7', pkgId: 'sk-pb' },
        { cid: 'sk-8', orderNo: 'NO-B' },
        { cid: 'sk-9', pkgId: 'sk-yok' },
        { cid: 'sk-10', pkgId: 'sk-hic' },
        { cid: 'sk-11', mc: pm.govde.kod },
        { cid: 'sk-12', wc: A.merkez, orderNo: 'NO-B' },
        { cid: 'sk-13' },
        { cid: 'sk-14', wc: A.merkez, machine: 'uydurma' },
        { cid: 'sk-15', wc: A.merkez, pkgId: 'sk-yok' },
      ];
      for (const tur of ['counts', 'meas', 'events', 'calls']) {
        for (const satir of kotuKayitlar) assert.equal((await ekle(op, tur, [{ ...satir, cid: `${tur}-${String(satir['cid'])}`, itemId: tur === 'meas' ? 1 : undefined }])).durum, 403, `${tur} ${String(satir['cid'])}`);
      }
      assert.equal((await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM arkon_kayit WHERE cid LIKE '%-sk-%'"))?.n, 0);
      // Karşı örnek: kendi iş merkezindeki PASİF makine de çözülür ve kabul edilir.
      const pa = await istek<{ id: number; kod: string }>(yonetici, 'POST', '/makineler', { kod: kod('KP'), ad: 'Pasif A', istasyonId: A.istasyonId });
      await istek(yonetici, 'POST', `/makineler/${pa.govde.id}/guncelle`, { kod: pa.govde.kod, ad: 'Pasif A', istasyonId: A.istasyonId, aktif: false, surum: 1 });
      assert.equal((await ekle(op, 'counts', [{ cid: 'sk-ok-0', mc: pa.govde.kod, kind: 'good', delta: 1 }])).govde.eklenen, 1);
      // Karşı örnek: paket ve iş emri kendi kapsamındaysa konumsuz kayıt geçer.
      assert.equal((await ekle(op, 'meas', [{ cid: 'sk-ok-1', pkgId: 'sk-pa', itemId: 1, value: 1, ok: true }])).govde.eklenen, 1);
      assert.equal((await ekle(op, 'counts', [{ cid: 'sk-ok-2', orderNo: 'NO-A', kind: 'good', delta: 1 }])).govde.eklenen, 1);
      // Belgeler: istasyonsuz ya da alanı silinmiş gövde, başka kodla birleşik gövde 403.
      const lead = kapsamliLead.cerez;
      const ly = (depo: string, kimlik: string, govde: unknown, taban = 0) =>
        istek<BelgeYazCevabi>(lead, 'POST', `/arkon/belgeler/${depo}/${kimlik}/yaz`, { taban, govde, kaynak: 'g1' });
      assert.equal((await ly('requests', 'sk-q1', { id: 'sk-q1', status: 'waiting' })).durum, 403);
      assert.equal((await ly('requests', 'sk-q2', { id: 'sk-q2', machine: 'uydurma', status: 'waiting' })).durum, 403);
      assert.equal((await ly('requests', 'sk-q3', { id: 'sk-q3', machine: B.istasyon, pkgId: 'sk-pa', status: 'waiting' })).durum, 403);
      assert.equal((await ly('requests', 'sk-q4', { id: 'sk-q4', pkgId: 'sk-pb', status: 'waiting' })).durum, 403);
      assert.equal((await ly('requests', 'sk-q5', { id: 'sk-q5', pkgId: 'sk-pa', status: 'waiting' })).durum, 200);
      const q5 = (await oku('admin', 'requests', 'sk-q5')).govde.belge?.surum ?? 0;
      assert.equal((await ly('requests', 'sk-q5', { id: 'sk-q5', status: 'waiting' }, q5)).durum, 403);
      assert.equal((await ly('logi', 'sk-l1', { id: 'sk-l1', pkgId: 'sk-pb' })).durum, 403);
      assert.equal((await ly('maint', 'sk-m1', { id: 'sk-m1', type: 'ariza', mc: pm.govde.kod })).durum, 403);
      assert.equal((await ly('maint', 'sk-m2', { id: 'sk-m2', type: 'ariza', st: ['x'] })).durum, 403);
      assert.equal((await yaz('admin', 'results', 'sk-hic', 0, { id: 'sk-hic', good: 1 })).govde.sonuc, 'yazildi');
      assert.equal((await istek(op, 'POST', '/arkon/belgeler/results/sk-hic/yaz', { taban: 0, govde: { id: 'sk-hic' }, kaynak: 'g1' })).durum, 403);
      assert.equal((await istek(op, 'POST', '/arkon/belgeler/results/sk-yok/yaz', { taban: 0, govde: { id: 'sk-yok' }, kaynak: 'g1' })).durum, 403);
      // Tesis geneli planlı duruş: kısıtlı kişi yazamaz ve silemez; kapsam dışı istasyon hedefi de 403.
      assert.equal((await yaz('admin', 'downs', 'sk-d-all', 0, { ...DURUS, id: 'sk-d-all', scope: 'all', target: '' })).govde.sonuc, 'yazildi');
      assert.equal((await ly('downs', 'sk-d-yeni', { ...DURUS, id: 'sk-d-yeni', scope: 'all', target: '' })).durum, 403);
      assert.equal((await istek(lead, 'POST', '/arkon/belgeler/downs/sk-d-all/sil', { kaynak: 'g1' })).durum, 403);
      assert.equal((await ly('downs', 'sk-d-b', { ...DURUS, id: 'sk-d-b', scope: 'st', target: B.istasyon })).durum, 403);
      assert.equal((await ly('downs', 'sk-d-a', { ...DURUS, id: 'sk-d-a', scope: 'st', target: A.istasyon })).durum, 200);
      assert.equal((await ly('downs', 'sk-d-x', { ...DURUS, id: 'sk-d-x', scope: 'ST', target: A.istasyon })).durum, 403);
    });

    test('planlı duruş Vardiya kaydıdır: Vardiya kaydı Arkon belgesi olur, Arkon formu Vardiya kaydını yazar, araya giren Vardiya yazımı çakışmadır (kart #519)', async () => {
      interface Durus { id: number; surum: number; baslik: string; kapsam: string; isMerkeziId: number | null; gunler: number[] }
      const vardiyaKayitlari = async () => (await istek<{ satirlar: Durus[] }>(yonetici, 'GET', '/planli-duruslar?sayfaBoyu=200')).govde.satirlar;
      const vg = {
        baslik: 'Vardiyadan', kapsam: 'istasyon', istasyonId: A.istasyonId, baslangic: '2026-10-08T08:00:00+03:00', bitis: '2026-10-08T09:00:00+03:00',
        tekrar: 'haftalik', gunler: [4, 7],
      };
      const v = await istek<{ durus: Durus }>(yonetici, 'POST', '/planli-duruslar', vg);
      assert.equal(v.durum, 200, JSON.stringify(v.govde));
      const kimlik = `tmi-pd-${v.govde.durus.id}`;
      const belge = (await oku('admin', 'downs', kimlik)).govde.belge;
      assert.ok(belge);
      const bg = belge.govde as Record<string, unknown>;
      const { by: _by, at: _at, ...govde } = bg;
      assert.deepEqual(govde, {
        id: kimlik, title: 'Vardiyadan', scope: 'st', target: A.istasyon, from: Date.UTC(2026, 9, 8, 5, 0), to: Date.UTC(2026, 9, 8, 6, 0),
        rep: 'weekly', days: [4, 0], until: null, note: '', active: true,
      });
      // Arkon formu düzenler: Vardiya kaydı değişir, ISO günlerine çevrilir.
      const y = await yaz('admin', 'downs', kimlik, belge.surum, { ...bg, title: 'Arkondan', days: [1, 0] });
      assert.equal(y.govde.sonuc, 'yazildi', JSON.stringify(y.govde));
      const kayit = (await vardiyaKayitlari()).find((d) => d.id === v.govde.durus.id);
      assert.deepEqual([kayit?.baslik, kayit?.gunler], ['Arkondan', [1, 7]]);
      // Vardiya ekranından araya giren yazım: Arkon'un eski tabanı çakışma alır, Vardiya kaydı ezilmez.
      const g2 = await istek(yonetici, 'POST', `/planli-duruslar/${v.govde.durus.id}/guncelle`, { ...vg, baslik: 'Vardiya 2', surum: kayit?.surum });
      assert.equal(g2.durum, 200, JSON.stringify(g2.govde));
      const eski = await yaz('admin', 'downs', kimlik, surum(y), { ...bg, title: 'Arkon eski' });
      assert.equal(eski.govde.sonuc, 'cakisma');
      assert.equal((await vardiyaKayitlari()).find((d) => d.id === v.govde.durus.id)?.baslik, 'Vardiya 2');
      assert.equal((await sil('admin', 'downs', kimlik, surum(y))).durum, 409);
      // Arkon'dan açılan belge Vardiya kaydı açar; belge kimliği korunur, yinelenen yazım ikinci kayıt açmaz.
      const yeni = { ...DURUS, id: 'dn-ark-1', scope: 'wc', target: A.merkez };
      const ilk = await yaz('admin', 'downs', 'dn-ark-1', 0, yeni);
      assert.equal(ilk.govde.sonuc, 'yazildi');
      assert.equal((await yaz('admin', 'downs', 'dn-ark-1', surum(ilk), { ...yeni, title: 'İkinci' })).govde.sonuc, 'yazildi');
      const acilan = (await vardiyaKayitlari()).filter((d) => d.isMerkeziId === A.merkezId && d.kapsam === 'is-merkezi');
      assert.deepEqual(acilan.map((d) => d.baslik), ['İkinci']);
      // Pasif duruş Arkon'dan (active taşımayan gövdeyle, Bakım düğmesi gibi) güncellenince pasif kalır; active açıkça gelirse yazılır.
      const pv = await istek<{ durus: Durus }>(yonetici, 'POST', '/planli-duruslar', { ...vg, baslik: 'Pasif', aktif: false });
      assert.equal(pv.durum, 200, JSON.stringify(pv.govde));
      const pk = `tmi-pd-${pv.govde.durus.id}`;
      const pb = (await oku('admin', 'downs', pk)).govde.belge!;
      const { active: _active, ...aktifsiz } = pb.govde as Record<string, unknown>;
      const py = await yaz('admin', 'downs', pk, pb.surum, { ...aktifsiz, title: 'Pasif 2' });
      assert.equal(py.govde.sonuc, 'yazildi', JSON.stringify(py.govde));
      const pasifMi = async () => (await istek<{ satirlar: (Durus & { aktif: boolean })[] }>(yonetici, 'GET', '/planli-duruslar?sayfaBoyu=200')).govde.satirlar.find((d) => d.id === pv.govde.durus.id);
      assert.deepEqual([(await pasifMi())?.baslik, (await pasifMi())?.aktif], ['Pasif 2', false]);
      assert.equal((await yaz('admin', 'downs', pk, surum(py), { ...aktifsiz, active: true })).govde.sonuc, 'yazildi');
      assert.equal((await pasifMi())?.aktif, true);
      // Tanınmayan kod Vardiya'ya yazılmaz.
      assert.equal((await yaz('admin', 'downs', 'dn-ark-2', 0, { ...yeni, id: 'dn-ark-2', reason: 'YOK-KOD' })).durum, 400);
      // Eski Arkon belgeleri taşınmaz ve okunmaz (kullanıcı kararı: boş başlar).
      await vt().tx((db) => sorgular.belgeYaz(db, 'downs', 'eski-arkon', { ...DURUS, id: 'eski-arkon' }, 1, yoneticiId));
      const kimlikler = (await istek<{ belgeler: { kimlik: string }[] }>(yonetici, 'GET', '/arkon/belgeler/downs')).govde.belgeler.map((b) => b.kimlik);
      assert.ok(kimlikler.includes('dn-ark-1') && kimlikler.includes(kimlik));
      assert.ok(!kimlikler.includes('eski-arkon'));
      assert.equal((await oku('admin', 'downs', 'eski-arkon')).govde.belge, null);
    });

    test('kısıtlı kişinin sonuç yazımı paket gövdelerini okumaz: paket listesi sorgusu liste okumasında görülür, kısıtlı yazımda görülmez', async () => {
      for (let i = 0; i < 60; i += 1) await yaz('admin', 'pkgs', `pf-${i}`, 0, { id: `pf-${i}`, machine: A.istasyon, plan: [{ id: 1 }], blob: 'x'.repeat(20000) });
      const kisi = (id: number, rol: ArkonRolu) => ({ id, ad: `Deneme ${rol}`, islemler: [ROL_ISLEMI[rol]] as never });
      const sorgulari = async (is: (db: { sorgu: Db['sorgu']; tek: Db['tek'] }) => Promise<unknown>): Promise<string[]> => {
        const kayit: string[] = [];
        await vt().tx(async (db) => {
          await is({
            sorgu: <T>(sql: string, p?: readonly unknown[]) => { kayit.push(sql); return db.sorgu<T>(sql, p); },
            tek: <T>(sql: string, p?: readonly unknown[]) => { kayit.push(sql); return db.tek<T>(sql, p); },
          });
        });
        return kayit;
      };
      const PAKET_LISTESI = /FROM arkon_belge WHERE depo = \$1 ORDER BY kimlik/;
      // Varlık: desen, paket listesini okuyan yolda eşleşir (kısıtsız kişinin liste okuması).
      const liste = await sorgulari((db) => belgeler(db, kisi(kisiIdleri.operator, 'operator'), 'pkgs'));
      assert.ok(liste.some((sql) => PAKET_LISTESI.test(sql)), 'desen liste okumasında eşleşmeli');
      // Yokluk: aynı kişinin ve kısıtlı kişinin sonuç yazımında eşleşmez; kısıtlı yazım yalnız tek paketin konum alanlarını okur.
      const yazim = (id: number, rol: ArkonRolu, kimlik: string) =>
        sorgulari((db) => belgeYaz(db, kisi(id, rol), 'results', kimlik, { taban: null, govde: { id: kimlik, good: 1 }, kaynak: 'g1' }));
      const kisitsiz = await yazim(kisiIdleri.operator, 'operator', 'pf-1');
      const kisitli = await yazim(kapsamliOp.id, 'operator', 'pf-2');
      for (const sql of [...kisitsiz, ...kisitli]) assert.ok(!PAKET_LISTESI.test(sql), sql);
      assert.equal(kisitli.filter((sql) => /govde->>'machine'/.test(sql)).length, 1, 'tek paket konumu sorgusu');
      assert.equal(kisitsiz.filter((sql) => /govde->>'machine'/.test(sql)).length, 0, 'kısıtsız yazım paket konumu okumaz');
    });
  });
});
