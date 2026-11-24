import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { SiparisAyrintisi, SiparisDonusumCevabi, SiparisRevizyonlariCevabi, TeklifAyrintiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('3637 kabul edilmiş teklife yeni sürüm (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let sayac = 0;
  let musteriId = 0;
  let mamulNo = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function girisYap(rolKodu: string | null): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `kabul-${(sayac += 1)}`;
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
        await rolAl(db, yoneticiId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  const gonder = (cerez: string, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });

  async function teklifAc(): Promise<TeklifAyrintiCevabi> {
    const c = await gonder(yonetici, '/siparisler/teklifler/ekle', {
      firmaId: musteriId, baslik: 'Deneme talebi', istenenTarih: '2026-11-30', aciklama: null,
      satirlar: [{ malzemeNo: mamulNo, tanim: 'Deneme parça A', miktar: '100' }, { malzemeNo: mamulNo, tanim: 'Deneme parça B', miktar: '10' }],
    });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<TeklifAyrintiCevabi>();
  }
  async function komut(t: Pick<TeklifAyrintiCevabi, 'id' | 'surum'>, yol: string, govde: Record<string, unknown>, beklenen = 200, cerez = yonetici): Promise<TeklifAyrintiCevabi> {
    const c = await gonder(cerez, `/siparisler/teklifler/${t.id}/${yol}`, { surum: t.surum, ...govde });
    assert.equal(c.statusCode, beklenen, c.body);
    return c.json<TeklifAyrintiCevabi>();
  }
  const fiyatlar = (t: TeklifAyrintiCevabi, ...birim: string[]) => t.satirlar.map((s, i) => ({ satirId: s.id, birimFiyat: birim[i] ?? '1' }));
  const donusum = { siparisTarihi: '2026-10-19', termin: '2026-11-20', kdvOrani: '20', musteriSiparisNo: null };
  const logoSirasi = async (teklifId: number) => (await o().sahip.sorgu<{ surum_no: number }>(
    "SELECT surum_no FROM siparisler_logo_gonderim WHERE tur = 'teklif' AND teklif_id = $1 ORDER BY surum_no", [teklifId])).map((r) => r.surum_no);
  const planYeri = async (teklifId: number) => (await o().sahip.sorgu<{ durum: string }>(
    'SELECT durum FROM siparisler_teklif_plan_taslagi WHERE teklif_id = $1', [teklifId])).map((r) => r.durum);

  before(async () => {
    ortam = await testVeritabaniKur('siparisler_kabul_sonrasi');
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const y = await girisYap(null);
    yonetici = y.cerez;
    yoneticiId = y.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KBL-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    mamulNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kbl-dnm-1', 'mamul', 'KBL-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kbl-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    const f = await gonder(yonetici, '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Firma KBL', tur: 'musteri' });
    assert.equal(f.statusCode, 200, f.body);
    musteriId = f.json<{ firma: { id: number } }>().firma.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kabul edilmiş teklife sürüm verilir; durum ve kabul yerinde kalır, Logo sırasına girer; yeni sürüm ancak kabul edilince kabul edilen olur', async () => {
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), kdvOrani: '20' });
    t = await komut(t, 'kabul', { surumNo: 1 });
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '9', '18'), kdvOrani: '20', odemeKosulu: '45 gün' });
    assert.deepEqual([t.durum, t.kabulSurumu, t.surumler.length], ['kabul', 1, 2]);
    assert.deepEqual(await logoSirasi(t.id), [1, 2]);
    // Kabul edilen sürümden önceki ya da aynı sürüm yeniden kabul edilmez; yenisi edilir.
    await komut(t, 'kabul', { surumNo: 1 }, 422);
    t = await komut(t, 'kabul', { surumNo: 2 });
    assert.deepEqual([t.durum, t.kabulSurumu], ['kabul', 2]);
    await komut(t, 'kabul', { surumNo: 2 }, 422);
    // Siparişe kabul edilen sürümle dönüşür (en yeni değil).
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '8', '16'), kdvOrani: '20' });
    assert.deepEqual([t.durum, t.kabulSurumu], ['kabul', 2]);
    const c = await gonder(yonetici, `/siparisler/teklifler/${t.id}/siparise-donustur`, { surum: t.surum, ...donusum });
    assert.equal(c.statusCode, 200, c.body);
    const s = (await oku(yonetici, `/siparisler/${c.json<SiparisDonusumCevabi>().siparisId}`)).json<SiparisAyrintisi>();
    assert.deepEqual(s.satirlar.map((r) => r.birimFiyat), ['9.0000', '18.0000']);
  });

  test('siparişe dönmüş teklife de sürüm verilir; teklif "siparis" kalır, siparişteki sürüm 1 görünür; plan taslağı kabulden sonra reddedilir', async () => {
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), kdvOrani: '20' });
    t = await komut(t, 'kabul', { surumNo: 1 });
    const c = await gonder(yonetici, `/siparisler/teklifler/${t.id}/siparise-donustur`, { surum: t.surum, ...donusum });
    t = c.json<SiparisDonusumCevabi>().teklif;
    assert.deepEqual([t.durum, t.siparisteSurumNo], ['siparis', 1]);
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '9', '18'), kdvOrani: '20' });
    assert.deepEqual([t.durum, t.kabulSurumu, t.siparisteSurumNo, t.surumler.length], ['siparis', 1, 1, 2]);
    // Plan taslağıyla kabulden sonra sürüm verilmez; plandaki yere dokunulmaz.
    const planli = await gonder(yonetici, `/siparisler/teklifler/${t.id}/surum-ver`, {
      surum: t.surum, fiyatlar: fiyatlar(t, '9', '18'), kdvOrani: '20', gecerlilik: '2026-12-31',
      planTaslagi: { istenenTermin: '2026-12-15', karOrani: '10', yerlesim: 'geriye', baslangic: null },
    });
    assert.equal(planli.statusCode, 400, planli.body);
    assert.match(planli.json().mesaj, /plan taslağı kullanılmaz/);
    await komut(t, 'reddet', { not: 'Deneme' }, 422);
    await komut(t, 'revizyon-iste', { not: 'Deneme' }, 422);
  });

  test('kabul edilmiş teklifin plandaki yeri kabulden sonra verilen elle sürümle kalkmaz; kabulden önceki elle sürüm kaldırır', async () => {
    const yerEkle = (teklifId: number) => o().sahip.sorgu(
      `INSERT INTO siparisler_teklif_plan_taslagi (teklif_id, surum_id, tur, durum, plan_surumu, gecerlilik, kar_orani, kalemler, kayanlar, kilitler, olusturan_id, yerlesim)
       SELECT $1, v.id, 'satis', 'aktif', 'deneme', current_date + 30, 10, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $2, 'arkaya'
         FROM siparisler_teklif_surumu v WHERE v.teklif_id = $1 AND v.surum_no = 1`, [teklifId, yoneticiId]);
    // Kabulden önce: elle sürüm yeri kaldırır (bugünkü kural).
    let a = await teklifAc();
    a = await komut(a, 'surum-ver', { fiyatlar: fiyatlar(a, '10', '20'), kdvOrani: '20' });
    await yerEkle(a.id);
    assert.deepEqual(await planYeri(a.id), ['aktif']);
    a = await komut(a, 'surum-ver', { fiyatlar: fiyatlar(a, '9', '18'), kdvOrani: '20' });
    assert.deepEqual(await planYeri(a.id), ['kalkti']);
    // Kabulden sonra: elle sürüm yeri kaldırmaz.
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), kdvOrani: '20' });
    await yerEkle(t.id);
    t = await komut(t, 'kabul', { surumNo: 1 });
    assert.deepEqual(await planYeri(t.id), ['aktif']);
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '9', '18'), kdvOrani: '20' });
    assert.deepEqual([t.durum, await planYeri(t.id)], ['kabul', ['aktif']]);
  });

  test('kabulden sonra verilen %10 üstü iskontolu sürüm onay bekler: durum yerinde kalır, kabul edilemez, Logo\'ya gitmez; müdür onaylayınca kabul edilir ve gider', async () => {
    const mudur = await girisYap('mudur');
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), kdvOrani: '20' });
    t = await komut(t, 'kabul', { surumNo: 1 });
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), kdvOrani: '20', iskontoOrani: '15' });
    assert.deepEqual([t.durum, t.kabulSurumu], ['kabul', 1]);
    assert.deepEqual(await logoSirasi(t.id), [1]);
    await komut(t, 'kabul', { surumNo: 2 }, 422);
    t = await komut(t, 'iskonto-onayla', {}, 200, mudur.cerez);
    assert.deepEqual([t.durum, t.kabulSurumu], ['kabul', 1]);
    assert.deepEqual(await logoSirasi(t.id), [1, 2]);
    t = await komut(t, 'kabul', { surumNo: 2 });
    assert.equal(t.kabulSurumu, 2);
  });

  test('Siparişe uygula iskontolu sürümün iskontolu birim fiyatını yazar; kalem eşleşmiyorsa 422 ve sipariş değişmez', async () => {
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), kdvOrani: '20' });
    t = await komut(t, 'kabul', { surumNo: 1 });
    const c = await gonder(yonetici, `/siparisler/teklifler/${t.id}/siparise-donustur`, { surum: t.surum, ...donusum });
    t = c.json<SiparisDonusumCevabi>().teklif;
    const siparisId = t.siparisId ?? 0;
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '8', '16'), kdvOrani: '20', iskontoOrani: '5' });
    t = await komut(t, 'kabul', { surumNo: 2 });
    let s = (await oku(yonetici, `/siparisler/${siparisId}`)).json<SiparisAyrintisi>();
    assert.equal((await gonder(yonetici, `/siparisler/${siparisId}/onayla`, { surum: s.surum })).statusCode, 200);
    s = (await oku(yonetici, `/siparisler/${siparisId}`)).json<SiparisAyrintisi>();
    const govde = { siparisSurum: s.surum, surumNo: 2, gerekce: 'Müşteri iskontolu fiyatı kabul etti' };
    // Kalem eşleşmesi bozulursa (sipariş satırının sırası teklifinkinden ayrılırsa) uygulanmaz.
    await o().sahip.sorgu('UPDATE siparisler_siparis_satiri SET sira = sira + 50 WHERE siparis_id = $1 AND sira = 2', [siparisId]);
    await komut(t, 'siparise-uygula', govde, 422);
    assert.equal((await oku(yonetici, `/siparisler/${siparisId}`)).json<SiparisAyrintisi>().surum, s.surum);
    await o().sahip.sorgu('UPDATE siparisler_siparis_satiri SET sira = sira - 50 WHERE siparis_id = $1 AND sira = 52', [siparisId]);
    t = await komut(t, 'siparise-uygula', govde);
    s = (await oku(yonetici, `/siparisler/${siparisId}`)).json<SiparisAyrintisi>();
    // 8 ve 16, %5 iskonto: iskontosuz birim fiyat (8, 16) değil iskontolu fiyat yazılır.
    assert.deepEqual(s.satirlar.map((r) => r.birimFiyat), ['7.6000', '15.2000']);
  });

  test('Siparişe uygula: yalnız kabul edilen sürüm, yalnız onaylı siparişe; fiyat, KDV ve ödeme koşulu Rev olarak geçer, kalem ve termin yerinde kalır', async () => {
    const operator = (await girisYap('operator')).cerez;
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), kdvOrani: '20', odemeKosulu: '30 gün' });
    await komut(t, 'siparise-uygula', { siparisSurum: 1, surumNo: 1, gerekce: 'Deneme' }, 422);
    t = await komut(t, 'kabul', { surumNo: 1 });
    await komut(t, 'siparise-uygula', { siparisSurum: 1, surumNo: 1, gerekce: 'Deneme' }, 422);
    const c = await gonder(yonetici, `/siparisler/teklifler/${t.id}/siparise-donustur`, { surum: t.surum, ...donusum });
    t = c.json<SiparisDonusumCevabi>().teklif;
    const siparisId = t.siparisId ?? 0;
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '9', '18'), kdvOrani: '10', odemeKosulu: '60 gün' });
    // Kabul kaydı yok: uygulanmaz.
    let s = (await oku(yonetici, `/siparisler/${siparisId}`)).json<SiparisAyrintisi>();
    const govde = (kalan: Record<string, unknown> = {}) => ({ siparisSurum: s.surum, surumNo: 2, gerekce: 'Müşteri yeni fiyatı kabul etti', ...kalan });
    await komut(t, 'siparise-uygula', govde(), 422);
    t = await komut(t, 'kabul', { surumNo: 2 });
    // Sipariş taslak: Rev kuralı reddeder.
    const taslakRet = await gonder(yonetici, `/siparisler/teklifler/${t.id}/siparise-uygula`, { surum: t.surum, ...govde() });
    assert.equal(taslakRet.statusCode, 422, taslakRet.body);
    assert.equal((await gonder(yonetici, `/siparisler/${siparisId}/onayla`, { surum: s.surum })).statusCode, 200);
    s = (await oku(yonetici, `/siparisler/${siparisId}`)).json<SiparisAyrintisi>();
    // Yetki: onaylama yetkisi olmayan 403; eski sipariş sürümü 409.
    assert.equal((await gonder(operator, `/siparisler/teklifler/${t.id}/siparise-uygula`, { surum: t.surum, ...govde() })).statusCode, 403);
    // Onaylama yetkisi var, fiyat görme yetkisi yok: fiyat yazan işlem 403.
    const kod = `kabul_fiyatsiz_${randomUUID().slice(0, 8)}`;
    await o().sahip.sorgu('INSERT INTO rol (kod, ad) VALUES ($1, $1)', [kod]);
    await o().sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT (SELECT id FROM rol WHERE kod = $1), unnest($2::text[])', [kod, ['siparisler.oku', 'siparisler.yaz', 'siparisler.onayla']]);
    const fiyatsiz = (await girisYap(kod)).cerez;
    const fiyatsizRet = await gonder(fiyatsiz, `/siparisler/teklifler/${t.id}/siparise-uygula`, { surum: t.surum, ...govde() });
    assert.equal(fiyatsizRet.statusCode, 403, fiyatsizRet.body);
    assert.equal((await gonder(yonetici, `/siparisler/teklifler/${t.id}/siparise-uygula`, { surum: t.surum, ...govde({ siparisSurum: s.surum + 5 }) })).statusCode, 409);
    await komut(t, 'siparise-uygula', govde({ surumNo: 1 }), 422);
    const uyg = await gonder(yonetici, `/siparisler/teklifler/${t.id}/siparise-uygula`, { surum: t.surum, ...govde() });
    assert.equal(uyg.statusCode, 200, uyg.body);
    const sonuc = uyg.json<SiparisDonusumCevabi>();
    assert.equal(sonuc.siparisId, siparisId);
    assert.deepEqual([sonuc.teklif.durum, sonuc.teklif.siparisteSurumNo], ['siparis', 2]);
    s = (await oku(yonetici, `/siparisler/${siparisId}`)).json<SiparisAyrintisi>();
    assert.deepEqual(s.satirlar.map((r) => [r.miktar, r.birimFiyat]), [['100.000', '9.0000'], ['10.000', '18.0000']]);
    assert.deepEqual([s.kdvOrani, s.odemeKosulu, s.termin], ['10.00', '60 gün', '2026-11-20']);
    const rev = (await oku(yonetici, `/siparisler/${siparisId}/surumler`)).json<SiparisRevizyonlariCevabi>();
    assert.deepEqual(rev.revizyonlar.map((r) => [r.revNo, r.kaynakSurumNo]), [[1, 2]]);
    assert.match(rev.revizyonlar[0]?.gerekce ?? '', /^\S+ sürüm 2: Müşteri yeni fiyatı kabul etti$/);
    // Aynı sürüm ikinci kez uygulanmaz.
    await komut(sonuc.teklif, 'siparise-uygula', { siparisSurum: s.surum, surumNo: 2, gerekce: 'Deneme' }, 422);
    // Elle açılan sürüm sonrası siparişteki sürüm bilinmez.
    const elle = await gonder(yonetici, `/siparisler/${siparisId}/yeni-surum`, {
      firmaId: musteriId, musteriSiparisNo: null, siparisTarihi: s.siparisTarihi, termin: s.termin, kdvOrani: '10', odemeKosulu: '60 gün', aciklama: null, surum: s.surum, gerekce: 'Elle fiyat',
      satirlar: s.satirlar.map((r, i) => ({ id: r.id, malzemeNo: r.malzemeNo, miktar: '100', birimFiyat: i === 0 ? '9.5' : '18', termin: null, aciklama: null })).map((r, i) => (i === 1 ? { ...r, miktar: '10' } : r)),
    });
    assert.equal(elle.statusCode, 200, elle.body);
    const son = (await oku(yonetici, `/siparisler/teklifler/${t.id}`)).json<TeklifAyrintiCevabi>();
    assert.equal(son.siparisteSurumNo, null);
  });
});
