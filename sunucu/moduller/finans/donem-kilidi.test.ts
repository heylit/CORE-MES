import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Belge, Odeme } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Firmalar ve tutarlar uydurmadır.
const PAROLA = 'dogru-parola-1';
const KILITLI = '2026-10';
const ACIK_AY_TARIHI = '2026-09-15';
const KILITLI_TARIH = '2026-10-10';
const BUGUN_AYI_TARIHI = new Date().toISOString().slice(0, 10);
interface Cevap<T = unknown> { durum: number; govde: T }

describe('finans dönem kilidi (3672, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerez.get(kim) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const yaz = <T = unknown>(yol: string, govde: unknown, kim = 'muhasebe') => istek<T>(kim, 'POST', yol, govde);
  const tamam = <T>(c: Cevap<T>): T => { assert.equal(c.durum, 200, `${c.durum} ${JSON.stringify(c.govde)}`); return c.govde; };
  const ileti = (c: Cevap): string => String((c.govde as { ileti?: string; hata?: { ileti?: string } }).ileti ?? (c.govde as { hata?: { ileti?: string } }).hata?.ileti ?? JSON.stringify(c.govde));

  let sayac = 0;
  async function firma(): Promise<number> {
    return tamam(await yaz<{ firma: { id: number } }>('/musteri-tedarikci/firmalar/ekle', { ad: `Deneme Firma ${(sayac += 1)}`, tur: 'ikisi' })).firma.id;
  }
  async function hesap(): Promise<number> {
    return tamam(await yaz<{ hesap: { id: number } }>('/finans/hesaplar/ekle', { ad: `Deneme Hesap ${(sayac += 1)}`, tur: 'banka', paraBirimi: 'TRY', acilisBakiyesi: 0, acilisTarihi: '2026-01-01' })).hesap.id;
  }
  const belgeGovdesi = (firmaId: number, tarih: string, ek: Record<string, unknown> = {}) => ({
    yon: 'gelir', kategori: 'urun_satisi', firmaId, belgeTarihi: tarih, vade: '2026-12-31', tutar: 1000, kdvOrani: 20, ...ek,
  });
  const belge = async (firmaId: number, tarih: string, ek: Record<string, unknown> = {}): Promise<Belge> =>
    tamam(await yaz<{ belge: Belge }>('/finans/belgeler/ekle', belgeGovdesi(firmaId, tarih, ek))).belge;
  const odeme = async (firmaId: number, hesapId: number, tarih: string, tutar: number, dagitimlar: unknown[] = []): Promise<Cevap<{ odeme: Odeme }>> =>
    yaz<{ odeme: Odeme }>('/finans/odemeler/ekle', { yon: 'gelir', firmaId, tarih, yontem: 'banka', hesapId, tutar, dagitimlar });
  const kilitle = (donem: string, kim = 'muhasebe') => yaz('/finans/donem-kilitle', { donem }, kim);
  const ac = (donem: string, neden: string | undefined, kim = 'yonetici') => yaz('/finans/donem-ac', neden === undefined ? { donem } : { donem, neden }, kim);
  const kisitAdi = async (sql: string, p: unknown[]): Promise<string | null> => {
    try { await vt().sorgu(sql, p); return null; } catch (h) { return (h as { constraint?: string }).constraint ?? String((h as Error).message); }
  };

  async function girisliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`gecici_${kullaniciAdi}`]);
    const yr = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yr) throw new Error('rol');
    for (const i of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, i]);
    await vt().tx(async (db) => { const k = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }); await rolAta(db, yoneticiId, k, rol.id); await rolAl(db, yoneticiId, k, yr.id); });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  before(async () => {
    ortam = await testVeritabaniKur('finans_donem_kilidi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez.set('yonetici', String(c.headers['set-cookie']).split(';')[0] ?? '');
    const firmaIslemleri = ['musteri-tedarikci.oku', 'musteri-tedarikci.yaz'];
    await girisliKisi('muhasebe', ['sayfa.finans', 'finans.oku', 'finans.yaz', 'finans.iptal', 'finans.hesap-yonet', ...firmaIslemleri]);
    await girisliKisi('okuyan', ['sayfa.finans', 'finans.oku']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('DK-01: kilit finans.yaz ister, açma yalnız yöneticidir ve gerekçe ister; geçmiş ve devam eden dönem kilitlenmez', async () => {
    assert.equal((await kilitle(KILITLI, 'okuyan')).durum, 403);
    assert.equal((await kilitle(BUGUN_AYI_TARIHI.slice(0, 7))).durum, 422, 'devam eden dönem kilitlenmez');
    assert.equal((await kilitle('2999-01')).durum, 422, 'gelecek dönem kilitlenmez');
    assert.equal((await kilitle('2026-13')).durum, 400);
    assert.deepEqual(tamam(await kilitle(KILITLI)), { donem: KILITLI, kilitli: true });
    assert.equal((await kilitle(KILITLI)).durum, 422, 'ikinci kilit reddedilir');
    assert.equal((await ac(KILITLI, 'Düzeltme gerekli', 'muhasebe')).durum, 403, 'muhasebe dönemi açamaz');
    assert.equal((await ac(KILITLI, undefined)).durum, 400, 'gerekçesiz açılmaz');
    assert.equal((await ac(KILITLI, 'a')).durum, 400, 'tek harfli gerekçe olmaz');
    assert.equal((await ac('2026-08', 'Kilitli değil')).durum, 422);
    const oku = tamam(await istek<{ kilitliDonemler: string[]; gecmis: { islem: string }[] }>('okuyan', 'GET', '/finans/donem-kilitleri'));
    assert.deepEqual(oku.kilitliDonemler, [KILITLI]);
  });

  test('DK-02: kilitli dönemde belge eklenmez, düzeltilmez, iptal edilmez; ödeme eklenmez; başka dönem açıktır', async () => {
    const f = await firma();
    const h = await hesap();
    const acikBelge = await belge(f, ACIK_AY_TARIHI);
    const e = await yaz('/finans/belgeler/ekle', belgeGovdesi(f, KILITLI_TARIH));
    assert.equal(e.durum, 422);
    assert.match(ileti(e), /kilitli/);
    assert.equal((await odeme(f, h, KILITLI_TARIH, 50)).durum, 422);
    assert.equal((await yaz('/finans/virmanlar/ekle', { kaynakHesapId: h, hedefHesapId: await hesap(), tarih: KILITLI_TARIH, tutar: 1 })).durum, 422);
    // Düzeltme: açık dönemdeki belgeyi kilitli döneme taşımak da kilide takılır.
    const tasi = await yaz(`/finans/belgeler/${acikBelge.id}/duzelt`, { ...belgeGovdesi(f, KILITLI_TARIH), surum: acikBelge.surum });
    assert.equal(tasi.durum, 422);
    // Açık dönem etkilenmez.
    assert.equal((await odeme(f, h, ACIK_AY_TARIHI, 50)).durum, 200);
  });

  test('DK-03: kilitli dönemdeki belge düzeltilmez ve iptal edilmez; eski belgeye bugünkü ödeme yazılır ve belge kapanır', async () => {
    const f = await firma();
    const h = await hesap();
    // Belge kilitlenmeden önce açılır.
    assert.equal((await ac(KILITLI, 'Test belgesi açmak için')).durum, 200);
    const eski = await belge(f, KILITLI_TARIH);
    assert.equal((await kilitle(KILITLI)).durum, 200);
    const duzelt = await yaz(`/finans/belgeler/${eski.id}/duzelt`, { ...belgeGovdesi(f, KILITLI_TARIH, { aciklama: 'sonradan' }), surum: eski.surum });
    assert.equal(duzelt.durum, 422);
    assert.match(ileti(duzelt), /kilitli/);
    assert.equal((await yaz(`/finans/belgeler/${eski.id}/iptal`, { surum: eski.surum, neden: 'sonradan iptal' })).durum, 422);
    // N2: kilitli aydaki kaydın tarihini açık aya taşımak da kilide takılır (eski tarih kontrol edilir).
    const tasima = await yaz(`/finans/belgeler/${eski.id}/duzelt`, { ...belgeGovdesi(f, ACIK_AY_TARIHI), surum: eski.surum });
    assert.equal(tasima.durum, 422);
    assert.equal(await kisitAdi('UPDATE finans_belge SET belge_tarihi = $2, vade = $2 WHERE id = $1', [eski.id, ACIK_AY_TARIHI]), 'finans_donem_kilitli');
    // Bugünkü ödeme eski belgeyi kapatır: durum geçişi kilide takılmaz.
    const toplam = Number(eski.toplam);
    const o = await odeme(f, h, ACIK_AY_TARIHI, toplam, [{ belgeId: eski.id, belgeTutari: toplam }]);
    assert.equal(o.durum, 200, `odeme: ${JSON.stringify(o.govde)}`);
    const durum = await vt().tek<{ durum: string }>('SELECT durum FROM finans_belge WHERE id = $1', [eski.id]);
    assert.equal(durum?.durum, 'kapandi');
    // Ödemeyi iptal etmek belgeyi yeniden açar; yine kilide takılmaz.
    assert.equal((await yaz(`/finans/odemeler/${tamam(o).odeme.id}/iptal`, { surum: tamam(o).odeme.surum, neden: 'deneme' })).durum, 200);
    assert.equal((await vt().tek<{ durum: string }>('SELECT durum FROM finans_belge WHERE id = $1', [eski.id]))?.durum, 'acik');
  });

  test('DK-04: veritabanı tetikleyicisi çek, eşitleme ve doğrudan yazmayı da tutar; açık dönemde sonuçlanan eski çek yazılır', async () => {
    const f = await firma();
    const h = await hesap();
    const cekSql = `INSERT INTO finans_cek (yon, tur, firma_id, duzenleme_tarihi, vade, para_birimi, kur, tutar, durum, olusturan_id)
                    VALUES ('alinan', 'cek', $1, $2, '2026-12-31', 'TRY', 1, 100, 'portfoy', $3) RETURNING id`;
    assert.equal(await kisitAdi(cekSql, [f, KILITLI_TARIH, yoneticiId]), 'finans_donem_kilitli');
    assert.equal(await kisitAdi('INSERT INTO finans_bakiye_esitleme (hesap_id, tarih, gercek_bakiye, fark, olusturan_id) VALUES ($1, $2, 0, 0, $3)', [h, KILITLI_TARIH, yoneticiId]), 'finans_donem_kilitli');
    assert.equal(await kisitAdi('INSERT INTO finans_bakiye_esitleme (hesap_id, tarih, gercek_bakiye, fark, olusturan_id) VALUES ($1, $2, 0, 0, $3)', [h, ACIK_AY_TARIHI, yoneticiId]), null);
    // Eski çek: kilitten önce açılır, kilitten sonra açık dönemde sonuçlanır.
    assert.equal((await ac(KILITLI, 'Çek açmak için')).durum, 200);
    const cek = await vt().tek<{ id: number }>(cekSql, [f, KILITLI_TARIH, yoneticiId]);
    assert.equal((await kilitle(KILITLI)).durum, 200);
    assert.equal(await kisitAdi("UPDATE finans_cek SET durum = 'tahsilde' WHERE id = $1", [cek?.id]), null, 'durum geçişi kilitli dönemin kaydını değiştirmez');
    assert.equal(await kisitAdi('UPDATE finans_cek SET tutar = 5 WHERE id = $1', [cek?.id]), 'finans_donem_kilitli');
    assert.equal(await kisitAdi("UPDATE finans_cek SET durum = 'iptal' WHERE id = $1", [cek?.id]), 'finans_donem_kilitli');
    assert.equal(await kisitAdi("UPDATE finans_cek SET durum = 'karsiliksiz', sonuc_tarihi = $2 WHERE id = $1", [cek?.id, ACIK_AY_TARIHI]), null, 'açık dönemde sonuçlanır');
    assert.equal(await kisitAdi("UPDATE finans_cek SET durum = 'karsiliksiz', sonuc_tarihi = $2 WHERE id = $1", [cek?.id, KILITLI_TARIH]), 'finans_donem_kilitli');
  });

  test('DK-05: yönetici dönemi gerekçeyle açar; kayıt yazılır; geçmiş ve denetim izi kalır; kilit yeniden konur', async () => {
    const f = await firma();
    assert.equal((await ac(KILITLI, 'Mali müşavir düzeltmesi')).durum, 200);
    const b = await belge(f, KILITLI_TARIH);
    assert.equal(b.belgeTarihi, KILITLI_TARIH);
    assert.equal((await kilitle(KILITLI)).durum, 200);
    const gecmis = (await istek<{ gecmis: { islem: string; neden: string | null; donem: string }[]; kilitliDonemler: string[] }>('okuyan', 'GET', '/finans/donem-kilitleri')).govde;
    assert.deepEqual(gecmis.kilitliDonemler, [KILITLI]);
    assert.ok(gecmis.gecmis.some((s) => s.islem === 'ac' && s.neden === 'Mali müşavir düzeltmesi' && s.donem === KILITLI));
    assert.notEqual(await kisitAdi("UPDATE finans_donem_kilidi SET neden = 'xyz'", []), null, 'geçmiş değişmez');
    assert.notEqual(await kisitAdi('DELETE FROM finans_donem_kilidi', []), null, 'geçmiş silinmez');
  });

  test('DK-06: kapanmış belgenin kategorisi ve belge no\'su değişmez; açıklama serbest kalır', async () => {
    const f = await firma();
    const h = await hesap();
    const b = await belge(f, ACIK_AY_TARIHI, { belgeNo: 'DNM-1' });
    const toplam = Number(b.toplam);
    tamam(await odeme(f, h, ACIK_AY_TARIHI, toplam / 2, [{ belgeId: b.id, belgeTutari: toplam / 2 }]));
    const guncel = (await vt().tek<{ surum: number }>('SELECT surum FROM finans_belge WHERE id = $1', [b.id]))?.surum ?? 0;
    const kategori = await yaz(`/finans/belgeler/${b.id}/duzelt`, { ...belgeGovdesi(f, ACIK_AY_TARIHI, { belgeNo: 'DNM-1', kategori: 'hizmet_geliri' }), surum: guncel });
    assert.equal(kategori.durum, 422);
    assert.match(ileti(kategori), /kategori/i);
    const no = await yaz(`/finans/belgeler/${b.id}/duzelt`, { ...belgeGovdesi(f, ACIK_AY_TARIHI, { belgeNo: 'DNM-2' }), surum: guncel });
    assert.equal(no.durum, 422);
    const serbest = await yaz(`/finans/belgeler/${b.id}/duzelt`, { ...belgeGovdesi(f, ACIK_AY_TARIHI, { belgeNo: 'DNM-1', aciklama: 'Not eklendi' }), surum: guncel });
    assert.equal(serbest.durum, 200, JSON.stringify(serbest.govde));
  });
  test('DK-07 (N1 kararı): sabit kıymet, tedarikçi alacağı, vergi beyanı, faiz ve bütçe de kilitli ayda değişmez; amortisman geriye oynamaz', async () => {
    // Bu noktada KILITLI (2026-10) kilitlidir (DK-05).
    assert.deepEqual(tamam(await istek<{ kilitliDonemler: string[] }>('okuyan', 'GET', '/finans/donem-kilitleri')).kilitliDonemler, [KILITLI]);
    const KIL = 'finans_donem_kilitli';
    // Faiz ve bütçe: başlangıcı kilitli ayda ya da öncesinde olan kayıt kilitli ayın rakamını geriye oynatır.
    assert.equal(await kisitAdi("INSERT INTO finans_faiz (para_birimi, gecerlilik_baslangic, aylik_yuzde, olusturan_id) VALUES ('TRY', '2026-10-15', 3, $1)", [yoneticiId]), KIL);
    assert.equal(await kisitAdi("INSERT INTO finans_faiz (para_birimi, gecerlilik_baslangic, aylik_yuzde, olusturan_id) VALUES ('TRY', '2026-09-15', 3, $1)", [yoneticiId]), KIL);
    assert.equal(await kisitAdi("INSERT INTO finans_faiz (para_birimi, gecerlilik_baslangic, aylik_yuzde, olusturan_id) VALUES ('TRY', '2026-11-05', 3, $1)", [yoneticiId]), null);
    assert.equal(await kisitAdi("INSERT INTO finans_gunluk_faiz (para_birimi, gecerlilik_baslangic, gunluk_yuzde, olusturan_id) VALUES ('TRY', '2026-10-02', 0.1, $1)", [yoneticiId]), KIL);
    assert.equal(await kisitAdi("INSERT INTO finans_oran (tur, para_birimi, gecerlilik_baslangic, yillik_yuzde, olusturan_id) VALUES ('kredi', 'TRY', '2026-10-02', 40, $1)", [yoneticiId]), KIL);
    assert.equal(await kisitAdi("INSERT INTO finans_butce (kategori, baslangic_ayi, aylik_tutar, olusturan_id) VALUES ('kira', '2026-10-01', 100, $1)", [yoneticiId]), KIL);
    assert.equal(await kisitAdi("INSERT INTO finans_butce (kategori, baslangic_ayi, aylik_tutar, olusturan_id) VALUES ('kira', '2026-11-01', 100, $1)", [yoneticiId]), null);
    assert.equal(await kisitAdi("UPDATE finans_butce SET aylik_tutar = 200 WHERE kategori = 'kira' AND baslangic_ayi = '2026-11-01'", []), null);
    // Vergi beyanı: son günün ayı kilitliyse işaret konmaz ve kaldırılmaz.
    assert.equal(await kisitAdi("INSERT INTO finans_vergi_beyani (son_gun, kod, isaretleyen_id) VALUES ('2026-10-26', 'kdv', $1)", [yoneticiId]), KIL);
    assert.equal(await kisitAdi("INSERT INTO finans_vergi_beyani (son_gun, kod, isaretleyen_id) VALUES ('2026-11-26', 'kdv', $1)", [yoneticiId]), null);
    assert.equal(await kisitAdi("DELETE FROM finans_vergi_beyani WHERE son_gun = '2026-11-26'", []), null);
    // Sabit kıymet: kilitli ay alış ayında ya da sonrasındaysa amortisman o ayı kapsar.
    const kiymet = (tarih: string) => vt().tek<{ id: number }>(
      "INSERT INTO finans_sabit_kiymet (ad, bedel, kur, alis_tarihi, omur_ay, olusturan_id) VALUES ('Deneme kıymet', 1200, 1, $1, 12, $2) RETURNING id", [tarih, yoneticiId]);
    assert.equal(await kisitAdi("INSERT INTO finans_sabit_kiymet (ad, bedel, kur, alis_tarihi, omur_ay, olusturan_id) VALUES ('K1', 1200, 1, '2026-10-05', 12, $1)", [yoneticiId]), KIL);
    assert.equal(await kisitAdi("INSERT INTO finans_sabit_kiymet (ad, bedel, kur, alis_tarihi, omur_ay, olusturan_id) VALUES ('K2', 1200, 1, '2026-09-01', 12, $1)", [yoneticiId]), KIL, 'eski alış, kilitli ayın amortismanını değiştirir');
    const yeniKiymet = await kiymet('2026-11-02');
    assert.equal(await kisitAdi('UPDATE finans_sabit_kiymet SET bedel = 2400 WHERE id = $1', [yeniKiymet?.id]), null);
    assert.equal(await kisitAdi("UPDATE finans_sabit_kiymet SET alis_tarihi = '2026-10-20' WHERE id = $1", [yeniKiymet?.id]), KIL, 'alışı kilitli aya çekmek');
    assert.equal(await kisitAdi("UPDATE finans_sabit_kiymet SET ad = 'Yeni ad' WHERE id = $1", [yeniKiymet?.id]), null, 'ad serbest');
    // Tedarikçi alacağı: kilitli ayda açılmış alacağın tutarı, firması ve açılışı değişmez; durum geçişi (kapatma) bugünün kaydıdır, serbesttir.
    const kisi = yoneticiId;
    const f = await firma();
    const talep = (await vt().tek<{ id: string }>("INSERT INTO satin_alma_talep (id, no, acan_kisi_id, baslik, talep_eden_kisi_id) VALUES (gen_random_uuid(), 'RT-3672', $1, 'Deneme', $1) RETURNING id", [kisi]))!.id;
    await vt().sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [talep]);
    const alacak = async (olusturma: string): Promise<number> => {
      const teklif = (await vt().tek<{ id: string }>("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, gen_random_uuid(), 'TRY', current_date) RETURNING id", [talep]))!.id;
      await vt().sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [talep, teklif]);
      return (await vt().tek<{ id: number }>(
        "INSERT INTO finans_tedarikci_alacagi (satin_alma_talep_id, satin_alma_teklif_id, siparis_no, firma_id, para_birimi, tutar, olusturan_id, olusturma) VALUES ($1, $2, 'DNM', $3, 'TRY', 10, $4, $5) RETURNING id",
        [talep, teklif, f, kisi, olusturma]))!.id;
    };
    const eskiAlacak = await alacak('2026-10-05T09:00:00Z');
    const yeniAlacak = await alacak('2026-11-05T09:00:00Z');
    assert.equal(await kisitAdi("UPDATE finans_tedarikci_alacagi SET tutar = 11 WHERE id = $1", [eskiAlacak]), KIL);
    assert.equal(await kisitAdi("DELETE FROM finans_tedarikci_alacagi WHERE id = $1", [eskiAlacak]), KIL);
    assert.equal(await kisitAdi("UPDATE finans_tedarikci_alacagi SET olusturma = '2026-11-02T09:00:00Z' WHERE id = $1", [eskiAlacak]), KIL, 'açılış tarihi kilitli aydan çıkarılamaz');
    assert.equal(await kisitAdi("UPDATE finans_tedarikci_alacagi SET durum = 'acik', durum_degistiren_id = $2, durum_zamani = now(), aciklama = 'Avans ödendi', surum = surum + 1 WHERE id = $1", [eskiAlacak, kisi]), null, 'kilitli ayın alacağı açık ayda teyit edilir');
    assert.equal(await kisitAdi("UPDATE finans_tedarikci_alacagi SET durum = 'kapandi', aciklama = 'Mahsup edildi', durum_degistiren_id = $2, durum_zamani = now(), surum = surum + 1 WHERE id = $1", [eskiAlacak, kisi]), null, 'sonra açık ayda kapatılır');
    assert.equal(await kisitAdi("UPDATE finans_tedarikci_alacagi SET tutar = 11 WHERE id = $1", [eskiAlacak]), KIL, 'kapanınca da tutar değişmez');
    assert.equal(await kisitAdi("UPDATE finans_tedarikci_alacagi SET tutar = 11 WHERE id = $1", [yeniAlacak]), null);
    // Dönem açılınca hepsi yeniden yazılır; ayrıca kilit yeniden konur.
    assert.equal((await ac(KILITLI, 'Toplu düzeltme')).durum, 200);
    assert.equal(await kisitAdi("UPDATE finans_tedarikci_alacagi SET tutar = 12 WHERE id = $1", [eskiAlacak]), null);
    assert.equal(await kisitAdi("INSERT INTO finans_butce (kategori, baslangic_ayi, aylik_tutar, olusturan_id) VALUES ('enerji', '2026-10-01', 100, $1)", [yoneticiId]), null);
    assert.equal((await kilitle(KILITLI)).durum, 200);
  });
});
