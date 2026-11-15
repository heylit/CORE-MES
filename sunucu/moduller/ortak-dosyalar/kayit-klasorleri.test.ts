import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { kayitNoktasi } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type {
  AyarlarCevabi, DosyalarCevabi, Klasor, KlasorlerCevabi, MevcutAcCevabi, MevcutCevabi, TopluGeriAlCevabi, YetkiCevabi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kayitKaynagiKaydet, kayitKlasoruAc, kayitKlasoruAdiniGuncelle, kayitKlasoruArsivle } from './disari.ts';
import type { FirmaBilgisi, KayitZinciri, SiparisBilgisi } from './disari.ts';
import { KAYIT_ILETILERI, KOK_DUZEYLERI } from './kurallar.ts';

// Sentetik veri: ORN- adlar uydurmadır. Kaynak modüllerin olayı yerine zincir doğrudan verilir (kablolama dilim 2'de).
const PAROLA = 'dogru-parola-1';
interface Oturum { cerez: string; id: number }

const F1: FirmaBilgisi = { id: 9001, kod: 'ORN-M001', ad: 'ORN Hidrolik' };
const F2: FirmaBilgisi = { id: 9002, kod: null, ad: 'ORN Döküm' };
const S1: SiparisBilgisi = { id: 7001, no: 'SS-2026-0412', musteriSiparisNo: 'ORN-PO-7781', iptal: false };
const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(600)]);

describe('kayda bağlı klasörler (kart 3288; gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Oturum;
  let satis: Oturum;
  let depo: Oturum;
  let operator: Oturum;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function girisYap(rolKodu: string): Promise<Oturum> {
    const kullaniciAdi = `kayit-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const r = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
      const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
      await rolAta(db, yonetici.id, yeni, r?.id ?? 0);
      await rolAl(db, yonetici.id, yeni, yon?.id ?? 0);
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  const gonder = (o: Oturum, yol: string, govde: unknown = {}): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: o.cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
  const oku = (o: Oturum, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: o.cerez } });
  const ac = (z: KayitZinciri, topluIs: string | null = null) => vt().tx((db) => kayitKlasoruAc(db, yonetici.id, z, topluIs));
  const klasorler = async (o: Oturum): Promise<Klasor[]> => (await oku(o, '/ortak-dosyalar/klasorler')).json<KlasorlerCevabi>().klasorler;
  const kaynakli = (tur: string, id: number) =>
    vt().tek<{ id: number; ad: string; ust_id: number; arsiv: boolean; toplu_is: string | null }>(
      'SELECT id, ad, ust_id, arsiv, toplu_is FROM ortak_dosyalar_klasor WHERE kaynak_tur = $1 AND kaynak_id = $2', [tur, id],
    );

  before(async () => {
    ortam = await testVeritabaniKur('ortak_dosyalar_kayit');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const ilkId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'kayit-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'kayit-yonetici', parola: PAROLA } });
    yonetici = { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id: ilkId };
    satis = await girisYap('satis');
    depo = await girisYap('depo');
    operator = await girisYap('operator');
  });
  after(async () => { kayitKaynagiKaydet(null); await app?.close(); await ortam?.kaldir(); });

  test('KK-8 kök yokken klasör açılamaz: kayıt işlemi sürer, satır "Açılamayan klasörler"e aynı işlemde düşer', async () => {
    // Kaydın kendi yazması yerine aynı işlemde sonradan yazılan bir şablon satırı: işlem sürdü ve kalıcı oldu.
    const sonuc = await vt().tx(async (db) => {
      const s = await kayitKlasoruAc(db, yonetici.id, { tur: 'firma', firma: F1 });
      await db.sorgu("INSERT INTO ortak_dosyalar_sablon (hedef, sira, ad, ad_anahtari) VALUES ('proje', 99, 'KK8 iz', 'kk8 iz')");
      return s;
    });
    assert.deepEqual(sonuc, { tamam: false, neden: KAYIT_ILETILERI.kokYok });
    assert.ok(await vt().tek("SELECT 1 FROM ortak_dosyalar_sablon WHERE sira = 99"));
    await vt().sorgu('DELETE FROM ortak_dosyalar_sablon WHERE sira = 99');
    const a = (await oku(yonetici, '/ortak-dosyalar/ayarlar')).json<AyarlarCevabi>();
    assert.deepEqual(a.acilamayan.map((x) => [x.tur, x.id]), [['firma', F1.id]]);
    assert.equal(a.kok, null);
  });

  test('KK-9 kökü yalnız yetki-ver açar; aynı adlı kişi kökü varken durur; rol düzeyleri 2067-5 a', async () => {
    assert.equal((await gonder(satis, '/ortak-dosyalar/ayarlar/kok-ac')).statusCode, 403);
    assert.equal((await oku(satis, '/ortak-dosyalar/ayarlar')).statusCode, 403);
    assert.equal((await oku(satis, '/ortak-dosyalar/ayarlar/mevcut')).statusCode, 403);
    assert.equal((await gonder(satis, '/ortak-dosyalar/ayarlar/acilamayan/siparis/1/yeniden-dene')).statusCode, 403);
    assert.equal((await gonder(satis, `/ortak-dosyalar/ayarlar/toplu/${randomUUID()}/arsivle`)).statusCode, 403);
    assert.equal((await gonder(satis, `/ortak-dosyalar/ayarlar/toplu/${randomUUID()}/arsivden-cikar`)).statusCode, 403);
    const elle = await gonder(yonetici, '/ortak-dosyalar/klasorler', { ustId: null, ad: 'MÜŞTERİLER' });
    assert.equal(elle.statusCode, 200, elle.body);
    const dolu = await gonder(yonetici, '/ortak-dosyalar/ayarlar/kok-ac');
    assert.equal(dolu.statusCode, 409, dolu.body);
    assert.match(dolu.body, /başka bir klasör var/);
    await vt().sorgu("UPDATE ortak_dosyalar_klasor SET ad = 'Eski müşteriler', ad_anahtari = 'eski müşteriler' WHERE id = $1", [elle.json<Klasor>().id]);
    const c = await gonder(yonetici, '/ortak-dosyalar/ayarlar/kok-ac');
    assert.equal(c.statusCode, 200, c.body);
    const kok = c.json<AyarlarCevabi>().kok;
    assert.ok(kok);
    assert.equal((await gonder(yonetici, '/ortak-dosyalar/ayarlar/kok-ac')).statusCode, 409);
    const y = (await oku(yonetici, `/ortak-dosyalar/klasorler/${kok.id}/yetki`)).json<YetkiCevabi>();
    const kodlar = new Map((await vt().sorgu<{ id: number; kod: string }>('SELECT id, kod FROM rol')).map((r) => [r.id, r.kod]));
    const yazilan = Object.fromEntries(y.satirlar.map((s) => [kodlar.get(s.rolId), s.duzey]));
    assert.deepEqual(yazilan, KOK_DUZEYLERI);
    assert.ok((await klasorler(satis)).some((k) => k.id === kok.id && k.duzey === 'yonetir' && k.kaynak?.tur === 'kok'));
    assert.ok(!(await klasorler(operator)).some((k) => k.id === kok.id));
  });

  test('KK-8 yeniden dene: kök açıldıktan sonra açılamayan kayıt klasörünü alır, satır kalkar', async () => {
    const c = await gonder(yonetici, `/ortak-dosyalar/ayarlar/acilamayan/firma/${F1.id}/yeniden-dene`);
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<AyarlarCevabi>().acilamayan, []);
    assert.equal((await kaynakli('firma', F1.id))?.ad, 'ORN-M001 ORN Hidrolik');
  });

  test('KK-2/3/4 proje zinciri: firma, sipariş ve proje klasörü adlarıyla; şablon alt klasörleri; ikinci çağrı yeni satır açmaz', async () => {
    const z: KayitZinciri = { tur: 'proje', firma: F1, siparis: S1, proje: { id: 5001, kod: 'ORN-P-118', ad: 'Valf gövdesi' } };
    const ilk = await ac(z);
    assert.ok(ilk.tamam);
    const sayi = async () => (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM ortak_dosyalar_klasor'))?.n;
    const once = await sayi();
    assert.deepEqual(await ac(z), ilk);
    assert.equal(await sayi(), once);
    const sp = await kaynakli('siparis', S1.id);
    assert.equal(sp?.ad, 'SS-2026-0412 (ORN-PO-7781)');
    assert.equal(sp?.ust_id, (await kaynakli('firma', F1.id))?.id);
    const pr = await kaynakli('proje', 5001);
    assert.equal(pr?.ad, 'ORN-P-118 Valf gövdesi');
    assert.equal(pr?.ust_id, sp?.id);
    const altlar = async (id: number) => (await vt().sorgu<{ ad: string }>('SELECT ad FROM ortak_dosyalar_klasor WHERE ust_id = $1 AND kaynak_tur IS NULL ORDER BY id', [id])).map((r) => r.ad);
    assert.deepEqual(await altlar(sp?.id ?? 0), ['Teklif', 'Çizim ve model', 'Kalite', 'Sevkiyat']);
    assert.deepEqual(await altlar(pr?.id ?? 0), ['Çizim ve model', 'Kalite (FAI)', 'Üretim']);
    // Siparişsiz ve firmasız proje.
    assert.ok((await ac({ tur: 'proje', firma: F2, siparis: null, proje: { id: 5002, kod: 'ORN-P-119', ad: 'Mil' } })).tamam);
    const f2 = await kaynakli('firma', F2.id);
    assert.equal(f2?.ad, 'M-9002 ORN Döküm');
    const ss = await kaynakli('siparissiz-projeler', F2.id);
    assert.equal(ss?.ust_id, f2?.id);
    assert.equal((await kaynakli('proje', 5002))?.ust_id, ss?.id);
    assert.ok((await ac({ tur: 'proje', firma: null, siparis: null, proje: { id: 5003, kod: 'ORN-P-120', ad: 'Burç' } })).tamam);
    const fp = await vt().tek<{ id: number }>("SELECT id FROM ortak_dosyalar_klasor WHERE kaynak_tur = 'firmasiz-projeler'");
    assert.equal((await kaynakli('proje', 5003))?.ust_id, fp?.id);
  });

  test('KK-5 yükleme adı önerisi en yakın sipariş numarası ve alt klasör adıdır; miras düzeyle satış yükler, depo görür, operatör görmez', async () => {
    const sp = await kaynakli('siparis', S1.id);
    const cizim = await vt().tek<{ id: number }>("SELECT id FROM ortak_dosyalar_klasor WHERE ust_id = $1 AND ad = 'Çizim ve model'", [sp?.id ?? 0]);
    const d = (await oku(satis, `/ortak-dosyalar/klasorler/${cizim?.id ?? 0}/dosyalar`)).json<DosyalarCevabi>();
    assert.deepEqual(d.adOnerisi, { onek: 'SS-2026-0412', altKlasor: 'Çizim-ve-model' });
    assert.equal(d.klasor.duzey, 'yonetir');
    assert.equal((await oku(depo, `/ortak-dosyalar/klasorler/${cizim?.id ?? 0}/dosyalar`)).json<DosyalarCevabi>().klasor.duzey, 'gorur');
    assert.equal((await oku(operator, `/ortak-dosyalar/klasorler/${cizim?.id ?? 0}/dosyalar`)).statusCode, 404);
  });

  test('KK-10 kayıt bağlantısı: görebilen klasör kimliğini alır; göremeyen ve klasörü olmayan 404', async () => {
    const c = await oku(depo, `/ortak-dosyalar/kayit/siparis/${S1.id}`);
    assert.equal(c.statusCode, 200, c.body);
    assert.equal(c.json<{ klasorId: number }>().klasorId, (await kaynakli('siparis', S1.id))?.id);
    assert.equal((await oku(operator, `/ortak-dosyalar/kayit/siparis/${S1.id}`)).statusCode, 404);
    assert.equal((await oku(yonetici, '/ortak-dosyalar/kayit/siparis/999999')).statusCode, 404);
  });

  test('KK-1 ad kayıttan izler; ad çakışması kaydı durdurmaz, hata listesine düşer', async () => {
    await vt().tx((db) => kayitKlasoruAdiniGuncelle(db, yonetici.id, { tur: 'firma', firma: { ...F1, ad: 'ORN Hidrolik / Makina' } }));
    assert.equal((await kaynakli('firma', F1.id))?.ad, 'ORN-M001 ORN Hidrolik - Makina');
    const kok = (await oku(yonetici, '/ortak-dosyalar/ayarlar')).json<AyarlarCevabi>().kok;
    assert.equal((await gonder(yonetici, '/ortak-dosyalar/klasorler', { ustId: kok?.id, ad: 'ORN-M003 ORN Kalıp' })).statusCode, 200);
    const s = await ac({ tur: 'firma', firma: { id: 9003, kod: 'ORN-M003', ad: 'ORN Kalıp' } });
    assert.deepEqual(s, { tamam: false, neden: KAYIT_ILETILERI.adCakisti });
    assert.equal(await kaynakli('firma', 9003), null);
    const a = (await oku(yonetici, '/ortak-dosyalar/ayarlar')).json<AyarlarCevabi>();
    assert.ok(a.acilamayan.some((x) => x.tur === 'firma' && x.id === 9003 && x.etiket === 'Müşteri ORN-M003 ORN Kalıp'));
  });

  test('KK-8 iç içe ara nokta: dış ara nokta içinde açma geçer, dış ret iç açmayı da geri alır', async () => {
    const z: KayitZinciri = { tur: 'firma', firma: { id: 9004, kod: 'ORN-M004', ad: 'ORN Pres' } };
    const dis = await vt().tx(async (db) => kayitNoktasi(db, async () => {
      const s = await kayitKlasoruAc(db, yonetici.id, z);
      assert.ok(s.tamam);
      throw new (await import('#cekirdek/hata.ts')).UygulamaHatasi('CAKISMA', 'dış ret');
    }));
    assert.equal(dis.tamam, false);
    assert.equal(await kaynakli('firma', 9004), null);
    assert.ok((await vt().tx(async (db) => kayitNoktasi(db, () => kayitKlasoruAc(db, yonetici.id, z)))).tamam);
    assert.ok(await kaynakli('firma', 9004));
  });

  test('KK-7 sipariş iptalinde klasör arşive kalkar ve görünmez; geri alınınca döner', async () => {
    const id = (await kaynakli('siparis', S1.id))?.id ?? 0;
    await vt().tx((db) => kayitKlasoruArsivle(db, yonetici.id, 'siparis', S1.id, true));
    assert.ok(!(await klasorler(satis)).some((k) => k.id === id));
    assert.ok(!(await klasorler(yonetici)).some((k) => k.id === id));
    assert.equal((await oku(satis, `/ortak-dosyalar/klasorler/${id}/dosyalar`)).statusCode, 404);
    assert.equal((await oku(satis, `/ortak-dosyalar/kayit/proje/5001`)).statusCode, 404);
    await vt().tx((db) => kayitKlasoruArsivle(db, yonetici.id, 'siparis', S1.id, false));
    assert.ok((await klasorler(satis)).some((k) => k.id === id));
  });

  test('KK-6 şablon: tekrar eden ad 400; değişiklik yalnız sonra açılan klasöre uygulanır', async () => {
    assert.equal((await gonder(yonetici, '/ortak-dosyalar/ayarlar/sablon', { siparis: ['A', 'a'], proje: [] })).statusCode, 400);
    assert.equal((await gonder(satis, '/ortak-dosyalar/ayarlar/sablon', { siparis: ['A'], proje: [] })).statusCode, 403);
    const c = await gonder(yonetici, '/ortak-dosyalar/ayarlar/sablon', { siparis: ['Teklif', 'Çizim'], proje: [] });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<AyarlarCevabi>().sablon, { siparis: ['Teklif', 'Çizim'], proje: [] });
    const s2: SiparisBilgisi = { id: 7002, no: 'SS-2026-0413', musteriSiparisNo: null, iptal: false };
    assert.ok((await ac({ tur: 'siparis', firma: F1, siparis: s2 })).tamam);
    const yeni = await kaynakli('siparis', 7002);
    assert.equal(yeni?.ad, 'SS-2026-0413');
    const altlar = await vt().sorgu<{ ad: string }>('SELECT ad FROM ortak_dosyalar_klasor WHERE ust_id = $1 ORDER BY id', [yeni?.id ?? 0]);
    assert.deepEqual(altlar.map((r) => r.ad), ['Teklif', 'Çizim']);
    const eski = await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM ortak_dosyalar_klasor WHERE ust_id = $1', [(await kaynakli('siparis', S1.id))?.id ?? 0]);
    assert.equal(eski?.n, 5);
  });

  test('KK-11 toplu komut: sayım, değişen sayıda durur, gruplar halinde açar, eşgüçlü, toplu işle arşivlenir (dolu klasör atlanır)', async () => {
    const bagsiz = (await oku(yonetici, '/ortak-dosyalar/ayarlar/mevcut')).json<MevcutCevabi>();
    assert.equal(bagsiz.bagli, false);
    const zincirler: KayitZinciri[] = [
      { tur: 'firma', firma: F1 },
      { tur: 'firma', firma: { id: 9010, kod: 'ORN-M010', ad: 'ORN Torna' } },
      { tur: 'firma', firma: { id: 9011, kod: 'ORN-M011', ad: 'ORN Freze' } },
      { tur: 'siparis', firma: { id: 9010, kod: 'ORN-M010', ad: 'ORN Torna' }, siparis: { id: 7010, no: 'SS-2026-0500', musteriSiparisNo: null, iptal: false } },
      { tur: 'siparis', firma: { id: 9010, kod: 'ORN-M010', ad: 'ORN Torna' }, siparis: { id: 7011, no: 'SS-2026-0501', musteriSiparisNo: null, iptal: true } },
    ];
    kayitKaynagiKaydet(async () => zincirler);
    const m = (await oku(yonetici, '/ortak-dosyalar/ayarlar/mevcut')).json<MevcutCevabi>();
    assert.deepEqual(m, { bagli: true, kokVar: true, klasorsuz: { firma: 2, siparis: 2, proje: 0 } });
    assert.equal((await gonder(satis, '/ortak-dosyalar/ayarlar/mevcut/ac', { topluIs: randomUUID(), beklenen: m.klasorsuz })).statusCode, 403);
    const yanlis = await gonder(yonetici, '/ortak-dosyalar/ayarlar/mevcut/ac', { topluIs: randomUUID(), beklenen: { firma: 9, siparis: 2, proje: 0 } });
    assert.equal(yanlis.statusCode, 409);
    const topluIs = randomUUID();
    const c = await gonder(yonetici, '/ortak-dosyalar/ayarlar/mevcut/ac', { topluIs, beklenen: m.klasorsuz });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<MevcutAcCevabi>(), { acilan: 4, acilamayan: 0, kalan: 0 });
    assert.equal((await kaynakli('siparis', 7011))?.arsiv, true);
    assert.equal((await kaynakli('siparis', 7011))?.toplu_is, null);
    assert.equal((await kaynakli('firma', 9010))?.toplu_is, topluIs);
    const ikinci = await gonder(yonetici, '/ortak-dosyalar/ayarlar/mevcut/ac', { topluIs: randomUUID(), beklenen: null });
    assert.deepEqual(ikinci.json<MevcutAcCevabi>(), { acilan: 0, acilamayan: 0, kalan: 0 });
    // Kullanıcının dosya yüklediği klasör toplu arşivde atlanır.
    const sp = await kaynakli('siparis', 7010);
    const icerik = pdf();
    const ozet = createHash('sha256').update(icerik).digest('hex');
    assert.equal((await app.inject({
      method: 'POST', url: `/api/dosyalar/${ozet}/parca`, payload: { sira: 0, toplam: 1, veri: icerik.toString('base64') }, headers: { cookie: satis.cerez },
    })).statusCode, 200);
    const altId = (await vt().tek<{ id: number }>("SELECT id FROM ortak_dosyalar_klasor WHERE ust_id = $1 AND ad = 'Teklif'", [sp?.id ?? 0]))?.id ?? 0;
    assert.equal((await gonder(satis, `/ortak-dosyalar/klasorler/${altId}/yukle`, { ad: 'SS-2026-0500_Teklif_r1.pdf', ozet })).statusCode, 200);
    const g = await gonder(yonetici, `/ortak-dosyalar/ayarlar/toplu/${topluIs}/arsivle`);
    assert.equal(g.statusCode, 200, g.body);
    assert.deepEqual(g.json<TopluGeriAlCevabi>(), { arsivlenen: 1, atlanan: 2 });
    assert.equal((await kaynakli('firma', 9011))?.arsiv, true);
    assert.equal((await kaynakli('siparis', 7010))?.arsiv, false);
    const geri = await gonder(yonetici, `/ortak-dosyalar/ayarlar/toplu/${topluIs}/arsivden-cikar`);
    assert.deepEqual(geri.json<TopluGeriAlCevabi>(), { arsivlenen: 1, atlanan: 0 });
    assert.equal((await kaynakli('siparis', 7011))?.arsiv, true);
    assert.equal((await gonder(yonetici, `/ortak-dosyalar/ayarlar/toplu/${randomUUID()}/arsivle`)).statusCode, 404);
  });
});
