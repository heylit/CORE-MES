import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Gorev, GorevAyrintisiCevabi, ProjeYonetimiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';
const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2000)]);
const ozetOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

interface Kisi { cerez: string; id: number }

describe('3458 görevin içi: adım, not, kanıt (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Kisi;
  let planlama: Kisi;
  let kalite1: Kisi;
  let kalite2: Kisi;
  let operator: Kisi;
  const rol = new Map<string, number>();
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = (kod: string): number => {
    const id = rol.get(kod);
    if (id === undefined) throw new Error(`rol yok: ${kod}`);
    return id;
  };

  async function girisYap(rolKodu: string | null, yonetenId: number | null): Promise<Kisi> {
    const kullaniciAdi = `gic-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null && yonetenId !== null) {
        await rolAta(db, yonetenId, yeni, rolId(rolKodu));
        await rolAl(db, yonetenId, yeni, rolId('yonetici'));
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (k: Kisi, yol: string, govde: unknown = {}): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: k.cerez, 'istek-kimligi': randomUUID() } });
  const oku = (k: Kisi, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: k.cerez } });

  async function projeAc(): Promise<number> {
    const s = await vt().tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, durum, baslangic, bitis, olusturan_id) VALUES ($1, 'Deneme içerik projesi', 'aktif', '2026-12-01', '2026-12-31', $2) RETURNING id",
      [`GI.${(sayac += 1)}`, yonetici.id],
    );
    return s?.id ?? 0;
  }
  async function gorevAc(projeId: number, govde: Record<string, unknown>): Promise<Gorev> {
    const c = await gonder(planlama, `/projeler/${projeId}/gorevler`, { ad: 'İçerik görevi', planBaslangic: '2026-12-01', planBitis: '2026-12-05', ...govde });
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json<ProjeYonetimiCevabi>().gorevler.at(-1);
    if (!g) throw new Error('görev yok');
    return g;
  }
  const surum = async (gorevId: number): Promise<number> =>
    (await vt().tek<{ surum: number }>('SELECT surum FROM projeler_gorev WHERE id = $1', [gorevId]))?.surum ?? 0;
  async function basarili(k: Kisi, yol: string, govde: unknown = {}): Promise<GorevAyrintisiCevabi> {
    const c = await gonder(k, yol, govde);
    assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
    return c.json<GorevAyrintisiCevabi>();
  }
  async function yukle(k: Kisi, icerik: Buffer): Promise<string> {
    const ozet = ozetOf(icerik);
    const c = await gonder(k, `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
    assert.equal(c.statusCode, 200, c.body);
    return ozet;
  }

  before(async () => {
    ortam = await testVeritabaniKur('gorev_icerigi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    for (const r of await ortam.vt.sorgu<{ id: number; kod: string }>('SELECT id, kod FROM rol')) rol.set(r.kod, r.id);
    yonetici = await girisYap(null, null);
    planlama = await girisYap('planlama_proje', yonetici.id);
    kalite1 = await girisYap('kalite', yonetici.id);
    kalite2 = await girisYap('kalite', yonetici.id);
    operator = await girisYap('operator', yonetici.id);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('adım: görev yazan ve yapan ekler; yalnız yapan işaretler; ilerleme adımlardan, sürüm artar; işaretli adım silinmez', async () => {
    const p = await projeAc();
    const g = await gorevAc(p, { sorumluKisiId: kalite1.id });
    const a1 = await basarili(planlama, `/projeler/gorevler/${g.id}/adimlar`, { ad: 'Çizim alındı' });
    assert.deepEqual([a1.adimlar.length, a1.gorev.adimToplam, a1.gorev.ilerleme], [1, 1, 0]);
    const a2 = await basarili(kalite1, `/projeler/gorevler/${g.id}/adimlar`, { ad: '  Ölçü listesi  ' });
    assert.equal(a2.adimlar[1]?.ad, 'Ölçü listesi', 'ad kırpılır');
    assert.equal((await gonder(kalite2, `/projeler/gorevler/${g.id}/adimlar`, { ad: 'Başkası' })).statusCode, 403, 'atanmamış yapan adım ekleyemez');

    const ilkAdim = a2.adimlar[0]?.id ?? 0;
    const once = await surum(g.id);
    assert.equal((await gonder(planlama, `/projeler/gorevler/${g.id}/adimlar/${ilkAdim}/isaretle`, { yapildi: true })).statusCode, 403, 'görev yazan işaretleyemez');
    const i = await basarili(kalite1, `/projeler/gorevler/${g.id}/adimlar/${ilkAdim}/isaretle`, { yapildi: true });
    assert.deepEqual([i.gorev.ilerleme, i.gorev.adimYapilan, i.adimlar[0]?.yapildi, i.adimlar[0]?.yapanAd !== null], [50, 1, true, true]);
    assert.ok((await surum(g.id)) > once, 'adım işareti görevin sürümünü artırır');

    const sil = await gonder(planlama, `/projeler/gorevler/${g.id}/adimlar/${ilkAdim}/sil`);
    assert.equal(sil.statusCode, 400, sil.body);
    // Test 3458-1 T2: atanmamış kişi adım silemez.
    const ikinci = a2.adimlar[1]?.id ?? 0;
    assert.equal((await gonder(kalite2, `/projeler/gorevler/${g.id}/adimlar/${ikinci}/sil`)).statusCode, 403, 'atanmamış yapan adım silemez');
    const kalan = await basarili(planlama, `/projeler/gorevler/${g.id}/adimlar/${a2.adimlar[1]?.id ?? 0}/sil`);
    assert.deepEqual([kalan.adimlar.length, kalan.gorev.ilerleme], [1, 100]);
    const geri = await basarili(kalite1, `/projeler/gorevler/${g.id}/adimlar/${ilkAdim}/isaretle`, { yapildi: false });
    assert.deepEqual([geri.gorev.ilerleme, geri.adimlar[0]?.yapanAd], [0, null]);
    const liste = (await oku(planlama, `/projeler/${p}/yonetim`)).json<ProjeYonetimiCevabi>().gorevler.find((x) => x.id === g.id);
    assert.deepEqual([liste?.adimToplam, liste?.adimYapilan], [1, 0], 'listede adım sayısı');
    // Test 3458-1 T3: görev başına en çok 50 adım sunucuda sayılır.
    await vt().sorgu("INSERT INTO projeler_gorev_adimi (gorev_id, sira, ad) SELECT $1, 100 + n, 'Dolgu ' || n FROM generate_series(1, 49) AS n", [g.id]);
    const fazla = await gonder(planlama, `/projeler/gorevler/${g.id}/adimlar`, { ad: 'Elli birinci' });
    assert.equal(fazla.statusCode, 400, fazla.body);
    assert.match(fazla.body, /en çok 50 adım/);
  });

  test('bitti (Risk K1): açık adımlar bitirenin adına işaretlenir; kontrole giden görevin ilerlemesi 100; kontrolde içerik değişmez', async () => {
    const p = await projeAc();
    const g = await gorevAc(p, { sorumluKisiId: kalite1.id, kontrolKisiId: planlama.id });
    await basarili(planlama, `/projeler/gorevler/${g.id}/adimlar`, { ad: 'Bir' });
    await basarili(planlama, `/projeler/gorevler/${g.id}/adimlar`, { ad: 'İki' });
    const b = await basarili(kalite1, `/projeler/gorevler/${g.id}/bitir`, { surum: await surum(g.id) });
    assert.deepEqual([b.gorev.durum, b.gorev.ilerleme, b.adimlar.every((a) => a.yapildi)], ['kontrolde', 100, true]);
    const adim = b.adimlar[0]?.id ?? 0;
    assert.equal((await gonder(kalite1, `/projeler/gorevler/${g.id}/adimlar/${adim}/isaretle`, { yapildi: false })).statusCode, 400, 'kontrolde adım değişmez');
    assert.equal((await gonder(planlama, `/projeler/gorevler/${g.id}/adimlar`, { ad: 'Üç' })).statusCode, 400, 'kontrolde adım eklenmez');
    // Test 3458-1 T2: kontrolde işaretsiz adım da silinmez (içerik kapalı; işaretli adım reddinden ayrı ileti).
    await vt().sorgu('UPDATE projeler_gorev_adimi SET yapildi = false, yapan_id = NULL, an = NULL WHERE id = $1', [adim]);
    const kapali = await gonder(planlama, `/projeler/gorevler/${g.id}/adimlar/${adim}/sil`);
    assert.equal(kapali.statusCode, 400, kapali.body);
    assert.match(kapali.body, /Kontrolde/);
    await vt().sorgu('UPDATE projeler_gorev_adimi SET yapildi = true, yapan_id = $2, an = now() WHERE id = $1', [adim, kalite1.id]);
    const geri = await basarili(planlama, `/projeler/gorevler/${g.id}/geri-gonder`, { gerekce: 'Eksik', surum: await surum(g.id) });
    assert.equal(geri.gorev.durum, 'suruyor');
    const ac = await basarili(kalite1, `/projeler/gorevler/${g.id}/adimlar/${adim}/isaretle`, { yapildi: false });
    assert.equal(ac.gorev.ilerleme, 50, 'geri gelen görevde ilerleme yeniden adımlardan');
  });

  test('kanıt (Risk K3): yalnız yapan ekler ve kaldırır; zorunlu görev kanıtsız bitmez; görmeyen indiremez; denetimde iz', async () => {
    const p = await projeAc();
    const g = await gorevAc(p, { sorumluKisiId: kalite1.id, kanitZorunlu: true });
    assert.equal(g.kanitZorunlu, true);
    const yok = await gonder(kalite1, `/projeler/gorevler/${g.id}/bitir`, { surum: await surum(g.id) });
    assert.equal(yok.statusCode, 400, yok.body);
    assert.match(yok.body, /kanıt ister/);
    // Risk 3458-1 K1: görev yazan düzenlemeyle de kanıtsız bitiremez; zorunluluğu aynı yazmada kaldırmak da kapıyı açmaz.
    const duzenle = async (d: Record<string, unknown>) => gonder(planlama, `/projeler/gorevler/${g.id}/guncelle`, {
      kilometreTasiId: null, ad: g.ad, aciklama: null, sorumluKisiId: g.sorumluKisiId, planBaslangic: g.planBaslangic, planBitis: g.planBitis,
      oncekiGorevId: null, gercekBaslangic: '2026-12-01', gercekBitis: '2026-12-02', ilerleme: 0, durum: 'bitti', surum: await surum(g.id), ...d,
    });
    for (const d of [{}, { kanitZorunlu: false }]) {
      const r = await duzenle(d);
      assert.equal(r.statusCode, 400, r.body);
      assert.match(r.body, /kanıt ister/);
    }
    assert.equal((await vt().tek<{ kanit_zorunlu: boolean }>('SELECT kanit_zorunlu FROM projeler_gorev WHERE id = $1', [g.id]))?.kanit_zorunlu, true);

    const icerik = pdf();
    const ozet = await yukle(kalite1, icerik);
    assert.equal((await gonder(planlama, `/projeler/gorevler/${g.id}/kanitlar`, { ozet, dosyaAdi: 'olcum.pdf' })).statusCode, 403, 'görev yazan kanıt eklemez');
    const k = await basarili(kalite1, `/projeler/gorevler/${g.id}/kanitlar`, { ozet, dosyaAdi: 'olcum.pdf' });
    assert.deepEqual(k.kanitlar.map((x) => [x.ad, x.tur, x.ekleyenAd !== null]), [['olcum.pdf', 'pdf', true]]);

    const indir = await oku(planlama, `/projeler/gorevler/${g.id}/kanitlar/${ozet}/dosya`);
    assert.equal(indir.statusCode, 200);
    assert.equal(indir.rawPayload.length, icerik.length);
    assert.equal((await oku(operator, `/projeler/gorevler/${g.id}/kanitlar/${ozet}/dosya`)).statusCode, 404, 'görevi görmeyen');
    const baska = await gorevAc(p, { sorumluKisiId: kalite1.id });
    assert.equal((await oku(planlama, `/projeler/gorevler/${baska.id}/kanitlar/${ozet}/dosya`)).statusCode, 404, 'özet başka görevden okunmaz');

    const kaldir = await basarili(kalite1, `/projeler/gorevler/${g.id}/kanitlar/${ozet}/kaldir`);
    assert.equal(kaldir.kanitlar.length, 0);
    const iz = await vt().sorgu<{ yol: string; ek: boolean }>(
      "SELECT yol, (parametre::text || COALESCE(govde::text, '')) LIKE '%' || $2 || '%' AS ek FROM denetim_kaydi WHERE yol LIKE '/projeler/gorevler/:gorevId/kanitlar%' AND parametre->>'gorevId' = $1 AND kisi_id = $3 ORDER BY id",
      [String(g.id), ozet, kalite1.id],
    );
    assert.deepEqual(iz.map((x) => [x.yol.endsWith('/kaldir'), x.ek]), [[false, true], [true, true]], 'bağ ve kaldırma özetiyle denetimde');

    await basarili(kalite1, `/projeler/gorevler/${g.id}/kanitlar`, { ozet, dosyaAdi: 'olcum.pdf' });
    const bit = await basarili(kalite1, `/projeler/gorevler/${g.id}/bitir`, { surum: await surum(g.id) });
    assert.equal(bit.gorev.durum, 'bitti');
    assert.equal((await gonder(kalite1, `/projeler/gorevler/${g.id}/kanitlar/${ozet}/kaldir`)).statusCode, 400, 'biten görevin kanıtı kalkmaz');
  });

  test('not: görevi gören ve görev işlemi olan yazar, görev bitse de; yalnız eklenir; boş not 400', async () => {
    const p = await projeAc();
    const g = await gorevAc(p, { yapanRolId: rolId('kalite') });
    const n = await basarili(kalite2, `/projeler/gorevler/${g.id}/notlar`, { metin: 'Cıvata boyu sorulacak.' });
    assert.deepEqual(n.notlar.map((x) => x.metin), ['Cıvata boyu sorulacak.']);
    assert.equal((await gonder(kalite2, `/projeler/gorevler/${g.id}/notlar`, { metin: '   ' })).statusCode, 400);
    assert.equal((await gonder(operator, `/projeler/gorevler/${g.id}/notlar`, { metin: 'x' })).statusCode, 404, 'görevi görmeyen');
    // Test 3458-1 T1: görevi görmeyen (görev işlemi var, proje okumaz) yazamaz ve not kalmaz.
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM projeler_gorev_notu WHERE gorev_id = $1 AND kisi_id = $2', [g.id, operator.id]))?.n, 0);
    const nid = n.notlar[0]?.id ?? 0;
    await assert.rejects(vt().sorgu('DELETE FROM projeler_gorev_notu WHERE id = $1', [nid]), 'not silinmez');
    assert.deepEqual(n.icerikIzinleri, { adimIsaretler: false, adimYazar: false, kanitEkler: false, notYazar: true }, 'üstlenmeden yalnız not');
  });
});
