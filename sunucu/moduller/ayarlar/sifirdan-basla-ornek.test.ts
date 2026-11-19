import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { sifirlamaKapsami, yedekAdi } from './kurallar.ts';
import { sifirdanBaslat } from './sorgular.ts';

// Örnek veriyle sıfırlama (3433): ertelenmiş kısıtlı tablolar (rota adımı, iş emri sırası, stok defteri) doluyken
// sıfırlama hatasız biter; istasyona bağlı konumun stok hareketi konumdan önce gider.
const PAROLA = 'dogru-parola-1';
// Sıfırlama tek deyimdir ve isteğin sorgu sınırıyla koşar; sekiz dosyanın aynı veritabanında koştuğu CI'da örnek veriyle de 10 sn'yi
// aşabilir. Bu dosya sınırı değil işlevin doğruluğunu ölçer: sınır yalnız bu dosyanın bağlantılarında uzar.
const SORGU_SURESI_MS = '60000';

class GeriAl extends Error {}

describe('sıfırdan başla örnek veriyle (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let dizin = '';
  const oncekiSorguSuresi = process.env['TMIV2_PG_SORGU_SURE_MS'];
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const say = async (t: string) => (await o().sahip.tek<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}"`))!.n;
  const ertelenebilirDolu = async () => (await o().sahip.sorgu<{ t: string }>(
    `SELECT DISTINCT c.conrelid::regclass::text AS t FROM pg_constraint c
      WHERE c.condeferrable AND c.condeferred AND c.connamespace = current_schema()::regnamespace ORDER BY 1`))
    .map((r) => r.t);

  before(async () => {
    dizin = await mkdtemp(path.join(tmpdir(), 'tmiv2-sifirlama-ornek-'));
    process.env['TMIV2_YEDEK_DIZINI'] = dizin;
    process.env['TMIV2_YEDEK_ANAHTARI'] = Buffer.alloc(32, 7).toString('base64');
    process.env['TMIV2_SIFIRLAMA_ACIK'] = '1';
    process.env['TMIV2_PG_SORGU_SURE_MS'] = SORGU_SURESI_MS;
    ortam = await testVeritabaniKur('ayarlar_sifirlama_ornek');
    await ornekVeriYukle(ortam.vt, await modulOrnekVerileriniKesfet(), { ortam: 'gelistirme', bildir: () => undefined });
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'ORN Yönetici', kullaniciAdi: 'sifirlayan', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'sifirlayan', parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    yonetici = String(g.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => {
    await ortam?.kaldir();
    if (dizin !== '') await rm(dizin, { recursive: true, force: true });
    delete process.env['TMIV2_YEDEK_DIZINI'];
    delete process.env['TMIV2_YEDEK_ANAHTARI'];
    delete process.env['TMIV2_SIFIRLAMA_ACIK'];
    if (oncekiSorguSuresi === undefined) delete process.env['TMIV2_PG_SORGU_SURE_MS'];
    else process.env['TMIV2_PG_SORGU_SURE_MS'] = oncekiSorguSuresi;
  });

  test('örnek veri ertelenmiş kısıtlı tabloları ve istasyon konumundaki stok hareketini doldurur', async () => {
    for (const t of ['rota_adimi', 'uretim_emirleri_is_emri', 'stok_hareketi', 'stok_bakiye']) assert.ok(await say(t) > 0, `${t} boş`);
    assert.ok((await ertelenebilirDolu()).includes('rota_adimi'));
    const n = (await o().sahip.tek<{ n: number }>(
      'SELECT count(*)::int AS n FROM stok_hareketi h JOIN stok_konum k ON k.id IN (h.kaynak_konum_id, h.hedef_konum_id) WHERE k.istasyon_id IS NOT NULL'))!.n;
    assert.ok(n > 0, 'istasyon konumunda hareket yok');
  });

  test('kullanıcılar ve tanımlar kalsın: işlev hatasız biter (işlem geri alınır)', async () => {
    const k = sifirlamaKapsami({ kullanicilar: true, tanimlar: true });
    let sonuc: Awaited<ReturnType<typeof sifirdanBaslat>> | null = null;
    await assert.rejects(o().vt.tx(async (db) => {
      sonuc = await sifirdanBaslat(db, { kalan: k.kalan, kismi: k.kismi, kullanicilar: true, yoneticiId });
      throw new GeriAl();
    }), GeriAl);
    assert.ok(sonuc !== null && (sonuc as { tablolar: Record<string, number> }).tablolar['rota_adimi']! > 0, JSON.stringify(sonuc));
    assert.ok(await say('rota_adimi') > 0, 'geri alınan işlem bir şey silmez');
  });

  test('kullanıcılar kalmasın: silinen her satır bir kez ve doğru başlıkta sayılır (işlem geri alınır)', async () => {
    const once = new Map<string, number>();
    for (const t of ['rota_adimi', 'stok_hareketi', 'stok_bakiye', 'uretim_emirleri_is_emri']) once.set(t, await say(t));
    const k = sifirlamaKapsami({ kullanicilar: false, tanimlar: false });
    let sonuc: Awaited<ReturnType<typeof sifirdanBaslat>> | null = null;
    await assert.rejects(o().vt.tx(async (db) => {
      sonuc = await sifirdanBaslat(db, { kalan: k.kalan, kismi: k.kismi, kullanicilar: false, yoneticiId });
      throw new GeriAl();
    }), GeriAl);
    const r = sonuc as unknown as { tablolar: Record<string, number>; cozulen: Record<string, number> };
    // İstasyon konumundaki hareketler daldan, ötekiler sıralı silmeden gelir; ikisi toplanır, çözülen başlığına düşmez.
    for (const [t, n] of once) {
      assert.equal(r.tablolar[t], n, `${t}: ${JSON.stringify(r)}`);
      assert.equal(r.cozulen[t], undefined, t);
    }
    assert.ok((r.cozulen['stok_konum'] ?? 0) > 0, 'istasyon konumu kalan tablodan çözülür');
  });

  test('dal: kalan tablodaki boş olabilen bağ boşaltılır, satır kalır; silinen tablodaki bağlı satır silinir', async () => {
    await assert.rejects(o().sahip.tx(async (db) => {
      await db.sorgu('CREATE TABLE orn_ana (id int PRIMARY KEY)');
      await db.sorgu('CREATE TABLE orn_bos (id int PRIMARY KEY, ana_id int REFERENCES orn_ana)');
      await db.sorgu('CREATE TABLE orn_dolu (id int PRIMARY KEY, ana_id int NOT NULL REFERENCES orn_ana)');
      await db.sorgu('INSERT INTO orn_ana VALUES (1), (2)');
      await db.sorgu('INSERT INTO orn_bos VALUES (1, 1), (2, 2)');
      await db.sorgu('INSERT INTO orn_dolu VALUES (1, 1), (2, 2)');
      const ctid = "ARRAY(SELECT ctid FROM orn_ana WHERE id = 1)";
      const r = (await db.tek<{ r: Record<string, number> }>(`SELECT ayarlar_sifirlama_dal_sil('orn_ana', ${ctid}, '{}'::text[], 1) AS r`))!.r;
      assert.deepEqual(r, { orn_bos: 1, orn_dolu: 1 });
      assert.deepEqual(await db.sorgu('SELECT id, ana_id FROM orn_bos ORDER BY id'), [{ id: 1, ana_id: null }, { id: 2, ana_id: 2 }]);
      assert.deepEqual(await db.sorgu('SELECT id FROM orn_dolu ORDER BY id'), [{ id: 2 }]);
      // Silinen tablo listesindeyse boş olabilen bağ da boşaltılmaz, satır gider.
      const r2 = (await db.tek<{ r: Record<string, number> }>(
        "SELECT ayarlar_sifirlama_dal_sil('orn_ana', ARRAY(SELECT ctid FROM orn_ana WHERE id = 2), ARRAY['orn_bos'], 1) AS r"))!.r;
      assert.deepEqual(r2, { orn_bos: 1, orn_dolu: 1 });
      assert.equal((await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM orn_bos'))!.n, 1);
      throw new GeriAl();
    }), GeriAl);
  });

  test('tetikleri yeniden açan her işlev önce ertelenmiş denetimleri koşturur (55006)', async () => {
    const islevler = await o().sahip.sorgu<{ ad: string; govde: string }>(
      `SELECT p.proname::text AS ad, p.prosrc AS govde FROM pg_proc p
        WHERE p.pronamespace = current_schema()::regnamespace AND p.prosrc ~ 'ENABLE (%s|ALWAYS )?TRIGGER'`);
    assert.ok(islevler.some((f) => f.ad === 'ayarlar_sifirdan_basla') && islevler.some((f) => f.ad === 'ayarlar_veri_temizle_kur'));
    await assert.rejects(o().vt.tx((db) => db.sorgu("SELECT ayarlar_sifirlama_dal_sil('rota', '{}'::tid[], '{}'::text[], 1)")), /permission denied/);
    for (const f of islevler) {
      const ac = f.govde.search(/EXECUTE t;/);
      const ani = f.govde.indexOf('SET CONSTRAINTS ALL IMMEDIATE');
      assert.ok(ani >= 0 && (ac < 0 || ani < ac), `${f.ad}: tetikler açılmadan SET CONSTRAINTS ALL IMMEDIATE`);
    }
  });

  test('kullanıcılar kalmasın: uçtan 200, yönetici, denetim izi ve göç kaydı kalır', async () => {
    const goc = await say('goc_kaydi');
    const ad = yedekAdi(String(process.env['TMIV2_PG_DATABASE']), 'elle', new Date());
    await writeFile(path.join(dizin, ad), 'yedek');
    const c = await app.inject({
      method: 'POST', url: '/api/veri-temizleme/sifirla',
      payload: { kullanicilar: false, tanimlar: false, yedekAdi: ad, onay: 'SIFIRDAN BASLA', parola: PAROLA },
      headers: { cookie: yonetici, 'istek-kimligi': '00000000-0000-4000-8000-000000000001' },
    });
    assert.equal(c.statusCode, 200, c.body);
    for (const t of ['rota_adimi', 'uretim_emri', 'uretim_emirleri_is_emri', 'stok_hareketi', 'stok_bakiye']) assert.equal(await say(t), 0, t);
    assert.equal(await say('goc_kaydi'), goc);
    assert.ok(await say('denetim_kaydi') > 0);
    assert.equal((await o().sahip.tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM kisi WHERE id = $1 AND aktif AND kullanici_adi = 'sifirlayan'", [yoneticiId]))!.n, 1);
    assert.equal((await o().sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'D'"))!.n, 0);
  });
});
