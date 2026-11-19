import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { sifirlamaOzetiCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import {
  SIFIRLAMA_DENETIM, SIFIRLAMA_HER_ZAMAN_KISMI, SIFIRLAMA_KISI, SIFIRLAMA_SISTEM, SIFIRLAMA_TANIM, sifirlamaKapsami, yedekAdi,
} from './kurallar.ts';

// "Sıfırdan başla" (3426 a): uygulama verisi ilk kurulum haline döner; yönetici, sistem ayarları ve seçilenler kalır.
// Her test kendi verisini kurar: sıfırlama önceki testin bıraktığını da siler. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('sıfırdan başla (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let dizin = '';
  let sira = 0;
  let ilkDolu: Map<string, number> = new Map();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  const istek = (cerez: string | null, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method: yontem, url: `/api${url}`, payload: payload as object | undefined,
      headers: { ...(cerez === null ? {} : { cookie: cerez }), ...(yontem === 'POST' ? { 'istek-kimligi': `00000000-0000-4000-8000-${String(++sira).padStart(12, '0')}` } : {}) },
    });
  const giris = (kullaniciAdi: string) => app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const c = await giris(kullaniciAdi);
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function yedekKoy(): Promise<string> {
    const ad = yedekAdi(String(process.env['TMIV2_PG_DATABASE']), 'elle', new Date());
    await writeFile(path.join(dizin, ad), 'yedek');
    return ad;
  }
  async function sayilar(): Promise<Map<string, number>> {
    const tablolar = await o().sahip.sorgu<{ ad: string }>(
      `SELECT c.relname::text AS ad FROM pg_class c WHERE c.relnamespace = current_schema()::regnamespace AND c.relkind IN ('r', 'p')
          AND NOT c.relispartition ORDER BY 1`);
    const m = new Map<string, number>();
    for (const { ad } of tablolar) m.set(ad, (await o().sahip.tek<{ n: number }>(`SELECT count(*)::int AS n FROM "${ad}"`))!.n);
    return m;
  }
  // Uygulamanın her yerinden birer satır: istasyon (tanım), emir, sipariş, malzeme, istasyona bağlı stok konumu, ikinci kullanıcı.
  async function veriKur(): Promise<{ planci: string; istasyon: number }> {
    const s = o().sahip;
    const n = ++sira;
    const im = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ($1, 'ORN merkez') RETURNING id", [`ORNM${n}`]))!.id;
    const ist = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, 'ORN istasyon', $2, true) RETURNING id", [`ORNI${n}`, im]))!.id;
    await s.sorgu(
      `INSERT INTO stok_konum (depo_id, kod, tur, ad, istasyon_id) SELECT id, 'IST-' || $1::int, 'istasyon', 'ORN', $1::int FROM stok_depo WHERE kod = 'ANA'`, [ist]);
    const firma = (await s.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('ORN Firma', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
    await s.sorgu(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, para_birimi, kdv_orani, olusturan_id)
       VALUES ($1, 'taslak', $2, current_date, current_date + 10, 'TRY', 20, $3)`, [`ORN-SP-${n}`, firma, yoneticiId]);
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const mlz = (await s.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'ORN-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`orn-dnm-${n}`, n, JSON.stringify({ id: `orn-dnm-${n}`, com: { ad: `ORN malzeme ${n}` } }), yoneticiId]))!.no;
    await s.sorgu(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no) VALUES ('ORN-P', 'ORN deneme', 5, $1, $2, $3)", [ist, yoneticiId, mlz]);
    const kullaniciAdi = `planci${n}`;
    await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'ORN Planci', kullaniciAdi, parola: PAROLA }));
    return { planci: kullaniciAdi, istasyon: ist };
  }
  const sifirla = async (secim: { kullanicilar: boolean; tanimlar: boolean }, ek: Record<string, unknown> = {}) =>
    istek(yonetici, 'POST', '/veri-temizleme/sifirla', { ...secim, yedekAdi: await yedekKoy(), onay: 'SIFIRDAN BASLA', parola: PAROLA, ...ek });

  before(async () => {
    dizin = await mkdtemp(path.join(tmpdir(), 'tmiv2-sifirlama-'));
    process.env['TMIV2_YEDEK_DIZINI'] = dizin;
    process.env['TMIV2_YEDEK_ANAHTARI'] = Buffer.alloc(32, 7).toString('base64');
    process.env['TMIV2_SIFIRLAMA_ACIK'] = '1';
    ortam = await testVeritabaniKur('ayarlar_sifirlama');
    ilkDolu = new Map([...(await sayilar())].filter(([, n]) => n > 0));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'ORN Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
  });
  after(async () => {
    await ortam?.kaldir();
    if (dizin !== '') await rm(dizin, { recursive: true, force: true });
    delete process.env['TMIV2_YEDEK_DIZINI'];
    delete process.env['TMIV2_YEDEK_ANAHTARI'];
    delete process.env['TMIV2_SIFIRLAMA_ACIK'];
  });

  test('sınıflama: ilk kurulumda satırı olan her tablo korunur; listelerdeki her tablo vardır', async () => {
    const korunan = new Set<string>(['goc_kaydi', ...SIFIRLAMA_SISTEM, ...SIFIRLAMA_DENETIM]);
    const siniflanmamis = [...ilkDolu.keys()].filter((t) => !korunan.has(t));
    assert.deepEqual(siniflanmamis, [], 'ilk kurulum satırı olan tablo SIFIRLAMA_SISTEM listesine girmeli');
    const var_ = new Set((await sayilar()).keys());
    for (const t of [...SIFIRLAMA_SISTEM, ...SIFIRLAMA_TANIM, ...SIFIRLAMA_DENETIM, ...SIFIRLAMA_KISI, ...SIFIRLAMA_HER_ZAMAN_KISMI]) {
      assert.ok(var_.has(t), `${t} tablosu yok`);
    }
  });

  test('yetki ve koşullar: oturumsuz 401, bayraksız 403, parola yanlışsa 400, yedek yoksa 409; hiçbiri bir şey silmez', async () => {
    const { planci } = await veriKur();
    const once = await sayilar();
    const secim = { kullanicilar: false, tanimlar: false };
    assert.equal((await istek(null, 'GET', '/veri-temizleme/sifirlama-ozeti?kullanicilar=0&tanimlar=0')).statusCode, 401);
    const bayraksiz = await girisCerezi(planci);
    // Bayraksız kişi işlem rolünde olsa da sıfırlayamaz.
    const rol = (await o().sahip.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'planlama_muduru'"))!.id;
    await o().sahip.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'ayarlar.veri-temizle') ON CONFLICT DO NOTHING", [rol]);
    await o().sahip.sorgu("INSERT INTO kisi_rolu (kisi_id, rol_id) SELECT id, $2 FROM kisi WHERE kullanici_adi = $1", [planci, rol]);
    await o().sahip.sorgu("DELETE FROM kisi_rolu WHERE kisi_id = (SELECT id FROM kisi WHERE kullanici_adi = $1) AND rol_id <> $2", [planci, rol]);
    const r = await istek(bayraksiz, 'POST', '/veri-temizleme/sifirla', { ...secim, yedekAdi: await yedekKoy(), onay: 'SIFIRDAN BASLA', parola: PAROLA });
    assert.equal(r.statusCode, 403, r.body);
    assert.equal((await sifirla(secim, { parola: 'yanlis' })).statusCode, 400);
    assert.equal((await sifirla(secim, { onay: 'SIFIRLA' })).statusCode, 400);
    // Varsayılan kapalı: ortam değişkeni yoksa özet de sıfırlama da reddedilir.
    delete process.env['TMIV2_SIFIRLAMA_ACIK'];
    assert.equal((await istek(yonetici, 'GET', '/veri-temizleme/sifirlama-ozeti?kullanicilar=0&tanimlar=0')).statusCode, 409);
    assert.equal((await sifirla(secim)).statusCode, 409);
    process.env['TMIV2_SIFIRLAMA_ACIK'] = '1';
    assert.equal((await sifirla(secim, { yedekAdi: yedekAdi(String(process.env['TMIV2_PG_DATABASE']), 'elle', new Date(Date.now() - 2 * 3600_000)) })).statusCode, 409);
    const sonra = await sayilar();
    for (const [t, n] of once) if (!SIFIRLAMA_DENETIM.includes(t as never) && t !== 'oturum' && t !== 'giris_denemesi' && t !== 'kisi_rolu' && t !== 'rol_islemi') assert.equal(sonra.get(t), n, t);
    await o().sahip.sorgu("DELETE FROM rol_islemi WHERE rol_id = $1 AND islem = 'ayarlar.veri-temizle'", [rol]);
  });

  test('sıfırdan başla: yalnız yönetici, sistem tabloları ve denetim izi kalır; öteki kullanıcı girişsiz, veriler boş', async () => {
    const { planci, istasyon } = await veriKur();
    const bagli = await girisCerezi(planci);
    const s = o().sahip;
    // Denetimde adı geçen kişi kalır (pasif, girişsiz); hiçbir yerde adı geçmeyen kişi silinir.
    const planciId = (await s.tek<{ id: number }>('SELECT id FROM kisi WHERE kullanici_adi = $1', [planci]))!.id;
    await s.sorgu("INSERT INTO denetim_kaydi (kisi_id, yontem, yol) VALUES ($1, 'POST', '/orn')", [planciId]);
    const bagsiz = (await s.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('ORN Bagsiz') RETURNING id"))!.id;
    // Yönetici yalnız özel bir yönetici rolündeyse: özel rol gider, yerleşik yönetici rolü verilir.
    const ozel = (await s.tek<{ id: number }>("INSERT INTO rol (kod, ad, yonetici) VALUES ('orn_ozel', 'ORN özel', true) RETURNING id"))!.id;
    await s.sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $3), ($2, $3)', [yoneticiId, planciId, ozel]);
    await s.sorgu("DELETE FROM kisi_rolu WHERE kisi_id = $1 AND rol_id = (SELECT id FROM rol WHERE kod = 'yonetici')", [yoneticiId]);
    // Boş olabilen bağ: kalan depo silinen salona bağlıysa depo kalır, bağ boşalır.
    const salon = (await s.tek<{ id: number }>(
      "INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ('ORNS', 'ORN salon', 10, 10, 1, $1) RETURNING id", [yoneticiId]))!.id;
    await s.sorgu("UPDATE stok_depo SET atolye_salon_id = $1 WHERE kod = 'ANA'", [salon]);
    // Özet, yöneticinin kendi kalan satırlarını saymaz.
    const secim0 = { kullanicilar: false, tanimlar: false };
    const k0 = sifirlamaKapsami(secim0);
    const ham = (await o().vt.tx((db) => db.tek<{ s: Record<string, number> }>(
      'SELECT ayarlar_sifirlama_sayilari($1::text[], $2::text[], false, $3) AS s', [k0.kalan, k0.kismi, yoneticiId])))!.s;
    for (const t of ['kisi_rolu', 'oturum']) {
      assert.equal(ham[t] ?? 0, (await s.tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} WHERE kisi_id <> $1`, [yoneticiId]))!.n, t);
    }
    assert.equal(ham['kisi'], (await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM kisi WHERE id <> $1', [yoneticiId]))!.n);
    const ozet = await istek(yonetici, 'GET', '/veri-temizleme/sifirlama-ozeti?kullanicilar=0&tanimlar=0');
    assert.equal(ozet.statusCode, 200, ozet.body);
    const o1 = sifirlamaOzetiCevabi.parse(ozet.json());
    for (const ad of ['Üretim emri', 'Sipariş', 'Malzeme kartı', 'Kişi (silinir ya da girişsiz kalır)']) assert.ok(o1.satirlar.some((s) => s.ad === ad && s.sayi > 0), ad);
    const sistemOnce = await sayilar();
    const c = await sifirla({ kullanicilar: false, tanimlar: false });
    assert.equal(c.statusCode, 200, c.body);
    assert.ok((c.json<{ toplam: number }>()).toplam > 0);

    const sonra = await sayilar();
    const { kalan } = sifirlamaKapsami({ kullanicilar: false, tanimlar: false });
    const korunur = new Set<string>(['goc_kaydi', 'kisi', ...kalan, ...SIFIRLAMA_KISI, ...SIFIRLAMA_HER_ZAMAN_KISMI]);
    for (const [t, n] of sonra) if (!korunur.has(t)) assert.equal(n, 0, `${t} boşalmalı`);
    for (const t of SIFIRLAMA_SISTEM) {
      if (t === 'stok_konum' || t === 'rol') continue;
      assert.equal(sonra.get(t), sistemOnce.get(t), `${t} değişmemeli`);
    }
    // İstasyona bağlı stok konumu istasyonla gider; deponun kendi konumları kalır.
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_konum WHERE istasyon_id = $1', [istasyon]))!.n, 0);
    assert.equal(sonra.get('stok_konum'), ilkDolu.get('stok_konum'));
    for (const t of SIFIRLAMA_KISI) {
      assert.equal((await o().sahip.tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} WHERE kisi_id <> $1`, [yoneticiId]))!.n, 0, t);
    }
    // Yönetici oturumu sürer, bayrağı kalır; öteki kullanıcının oturumu kapanır, girişi yoktur (denetimde adı geçtiği için pasif kalır).
    assert.equal((await istek(yonetici, 'GET', '/veri-temizleme/sifirlama-ozeti?kullanicilar=0&tanimlar=0')).statusCode, 200);
    assert.equal((await istek(bagli, 'GET', '/veri-temizleme/sifirlama-ozeti?kullanicilar=0&tanimlar=0')).statusCode, 401);
    assert.equal((await giris(planci)).statusCode, 401);
    const kisiler = await o().sahip.sorgu<{ id: number; aktif: boolean; giris: boolean }>(
      'SELECT id, aktif, kullanici_adi IS NOT NULL AS giris FROM kisi ORDER BY id');
    assert.ok(kisiler.every((k) => k.id === yoneticiId ? k.aktif && k.giris : !k.aktif && !k.giris), JSON.stringify(kisiler));
    assert.ok((sonra.get('denetim_kaydi') ?? 0) > 0, 'denetim izi kalır');
    assert.deepEqual(kisiler.map((k) => k.id).sort((a, b) => a - b), [yoneticiId, planciId].sort((a, b) => a - b), 'bağsız kişi silinir, denetimdeki kalır');
    assert.ok(!kisiler.some((k) => k.id === bagsiz));
    assert.equal((await s.tek<{ n: number }>("SELECT count(*)::int AS n FROM rol WHERE kod = 'orn_ozel'"))!.n, 0, 'özel rol gider');
    assert.equal(sonra.get('rol'), ilkDolu.get('rol'), 'yerleşik roller kalır');
    assert.deepEqual((await s.sorgu<{ kod: string }>('SELECT r.kod FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id WHERE kr.kisi_id = $1', [yoneticiId])).map((r) => r.kod), ['yonetici']);
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM kisi_rolu WHERE kisi_id <> $1', [yoneticiId]))!.n, 0);
    assert.equal((await s.tek<{ id: number | null }>("SELECT atolye_salon_id AS id FROM stok_depo WHERE kod = 'ANA'"))?.id, null, 'depo kalır, salon bağı boşalır');
    // Kapatılan tetikler işlem sonunda yeniden açılır: defter yine yalnız eklenir.
    assert.equal((await o().sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'D'"))!.n, 0);
    await assert.rejects(o().sahip.sorgu('DELETE FROM denetim_kaydi'));
    assert.equal((await giris('yonetici')).statusCode, 200);
  });

  test('kullanıcılar ve tanımlar kalsın: istasyon ve kullanıcı kalır, öteki kullanıcının oturumu kapanır; denetim izi her zaman kalır', async () => {
    const { planci, istasyon } = await veriKur();
    const bagli = await girisCerezi(planci);
    const planciId = (await o().sahip.tek<{ id: number }>('SELECT id FROM kisi WHERE kullanici_adi = $1', [planci]))!.id;
    await o().sahip.sorgu("INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'ayarlar.yaz', $2)", [planciId, yoneticiId]);
    const yetkiSayisi = async () => (await o().sahip.tek<{ n: number }>(
      'SELECT (SELECT count(*) FROM kisi_rolu WHERE kisi_id = $1) + (SELECT count(*) FROM kisi_islemi WHERE kisi_id = $1) + (SELECT count(*) FROM kisi_islem_kisiti WHERE kisi_id = $1) AS n',
      [planciId]))!.n;
    const yetkiOnce = await yetkiSayisi();
    const denetimOnce = (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM denetim_kaydi'))!.n;
    assert.ok(Number(yetkiOnce) >= 2);
    const c = await sifirla({ kullanicilar: true, tanimlar: true });
    assert.equal(c.statusCode, 200, c.body);
    const sonra = await sayilar();
    assert.equal(sonra.get('uretim_emri'), 0);
    assert.equal(sonra.get('siparisler_siparis'), 0);
    assert.equal(sonra.get('malzeme_katalog_karti'), 0);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM istasyon WHERE id = $1', [istasyon]))!.n, 1);
    assert.equal((await istek(bagli, 'GET', '/veri-temizleme/sifirlama-ozeti?kullanicilar=1&tanimlar=1')).statusCode, 401);
    assert.equal((await giris(planci)).statusCode, 200, 'kullanıcı kalır, yeniden girer');
    assert.equal(await yetkiSayisi(), yetkiOnce, 'kullanıcının rol ve işlem satırları kalır');
    // Denetim izi seçenek değildir: önceki kayıtlar durur, sıfırlamanın kendi kaydı da yazılır.
    assert.ok(Number(sonra.get('denetim_kaydi')) >= denetimOnce, 'denetim izi kalır');
    const yollar = (await o().sahip.sorgu<{ yol: string }>('SELECT yol FROM denetim_kaydi ORDER BY id')).map((r) => r.yol);
    assert.ok(yollar.includes('/veri-temizleme/sifirla'), JSON.stringify(yollar.slice(-3)));
    // Uygulama denetim tablosunu kısmi listede gönderse de işlev reddeder.
    const k = sifirlamaKapsami({ kullanicilar: true, tanimlar: true });
    await assert.rejects(o().vt.tx((db) => db.sorgu('SELECT ayarlar_sifirdan_basla($1::text[], $2::text[], true, $3)',
      [k.kalan.filter((t) => t !== 'denetim_kaydi'), [...k.kismi, 'denetim_kaydi'], yoneticiId])), /denetim izine/);
  });
});
