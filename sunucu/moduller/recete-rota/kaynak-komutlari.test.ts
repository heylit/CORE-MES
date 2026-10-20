import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ESKI_SURUM_ILETISI, eskiSurumMu } from '#paylasilan/hata.ts';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import {
  BOS_ANLIK, KAYNAK_KOMUTLARI, KAYNAK_OKUMALARI, koleksiyonKur, komutIstegi, takvimEki,
} from '../../../istemci/src/moduller/recete-rota/kaynak-komutlari.ts';
import type { KaynakAnlik, KaynakKoleksiyonu } from '../../../istemci/src/moduller/recete-rota/kaynak-komutlari.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { denetimYaz } from '../denetim/disari.ts';
import {
  aktifMakineler, istasyonlar, istasyonYetkinlikleri, isMerkezleri, makineDurumlari, planAyarlari,
} from '../istasyonlar/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kisiSecenekleri, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Kaynaklar sekmesinin komutları, köprünün kullandığı AYNI tablo ve istek kurucusuyla (istemci/src/moduller/recete-rota/kaynak-komutlari.ts) sahibi
// modüllerin gerçek uçlarına gönderilir; sonuç sahibinin kendi okuma işleviyle doğrulanır (İstasyonlar, Kişiler, Vardiya'da görünür).
const PAROLA = 'dogru-parola-1';

describe('Kaynaklar komutları sahibi modüllerin uçlarına yazar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let tam = '';
  let sinirli = '';
  let sahip = '';
  let yoneticiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const al = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });

  // Köprünün okuduğu anlık: aynı okuma tablosu, aynı kurucu.
  async function anlikOku(cerez: string): Promise<KaynakAnlik> {
    const anlik: Record<string, KaynakKoleksiyonu | null> = { ...BOS_ANLIK };
    for (const o of KAYNAK_OKUMALARI) {
      const cevap = await al(cerez, o.yol);
      anlik[o.koleksiyon] = cevap.statusCode === 200 ? koleksiyonKur(cevap.json(), o.alan, o.anahtar) : null;
    }
    return anlik as unknown as KaynakAnlik;
  }

  const denenen = new Set<string>();
  // Komutu köprüdeki gibi kurar ve sahibinin ucuna yollar.
  async function komut(cerez: string, ad: string, girdi: Record<string, unknown>, anlik: KaynakAnlik = BOS_ANLIK) {
    const tanim = KAYNAK_KOMUTLARI[ad];
    assert.ok(tanim, `tabloda yok: ${ad}`);
    denenen.add(ad);
    const k = komutIstegi(tanim, girdi, anlik);
    const basliklar: Record<string, string> = { cookie: cerez };
    if (k.tekrarKorumali) basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const cevap = await app.inject({
      method: 'POST', url: `/api${k.yol}`, headers: basliklar, payload: Object.keys(k.govde).length === 0 ? undefined : k.govde,
    });
    return cevap;
  }
  const basarili = async (cerez: string, ad: string, girdi: Record<string, unknown>, anlik?: KaynakAnlik) => {
    const c = await komut(cerez, ad, girdi, anlik);
    assert.ok(c.statusCode === 200 || c.statusCode === 201 || c.statusCode === 204, `${ad}: ${String(c.statusCode)} ${c.body}`);
    return c.statusCode === 204 ? null : c.json() as Record<string, unknown>;
  };
  // Tek düzenleme yeri: plan ayarı, makine durumu ve vardiya köprüde yazılmaz; okuma denemesinin verisi sahibinin kendi ucundan yazılır.
  const sahibineYaz = async (yol: string, govde: Record<string, unknown>) => {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: tam, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde });
    assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
    return c.json() as Record<string, unknown>;
  };
  const durumOku = async (cerez: string): Promise<DurumCevabi> => (await al(cerez, '/recete-rota/durum')).json() as DurumCevabi;

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_kaynak');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    tam = await girisCerezi('yonetici');
    // Yalnız Reçete ve Rota sayfasını görür: sahibinin yazma yetkisi yok.
    const rol = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('test_sinirli', 'test_sinirli') RETURNING id");
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'recete-rota.yaz')", [rol?.id]);
    const id = await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Sınırlı', kullaniciAdi: 'sinirli', parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
      return yeni;
    });
    assert.ok(id > 0);
    sinirli = await girisCerezi('sinirli');
    // Yönetici değil; yalnız istasyonlar sahibinin yazma işlemi var (kişiler ve vardiya yazma işlemi yok).
    const sahipRol = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('test_istasyon_sahibi', 'test_istasyon_sahibi') RETURNING id");
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'istasyonlar.yaz')", [sahipRol?.id]);
    await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme İstasyon Sahibi', kullaniciAdi: 'sahip', parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, sahipRol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== sahipRol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    sahip = await girisCerezi('sahip');
  });

  after(async () => { await ortam?.kaldir(); });

  test('KK-01: iş merkezi, istasyon ve makine eklenir, düzenlenir; sahibinin okuması ve durum ucu aynı kaydı gösterir, açıklama silinmez', async () => {
    const merkez = await basarili(tam, 'is-merkezi-ekle', { kod: 'kk-im', ad: 'Kaynak merkezi', aciklama: 'Üretim hattı', aktif: true });
    const merkezId = merkez?.['id'] as number;
    const istasyon = await basarili(tam, 'istasyon-ekle', { kod: 'KK-IS', ad: 'Kaynak istasyonu', isMerkeziId: merkezId });
    const istasyonId = istasyon?.['id'] as number;
    const makine = await basarili(tam, 'makine-ekle', { kod: 'KK-MK', ad: 'Kaynak makinesi', istasyonId });
    const makineId = makine?.['id'] as number;

    assert.deepEqual((await vt().tx((db) => isMerkezleri(db, { pasiflerDahil: false }))).filter((m) => m.kod === 'KK-IM').map((m) => [m.ad, m.aciklama]), [['Kaynak merkezi', 'Üretim hattı']]);
    assert.deepEqual((await vt().tx((db) => istasyonlar(db, { pasiflerDahil: false }))).filter((i) => i.kod === 'KK-IS').map((i) => [i.ad, i.isMerkeziId]), [['Kaynak istasyonu', merkezId]]);
    assert.deepEqual((await vt().tx((db) => aktifMakineler(db))).filter((m) => m.kod === 'KK-MK').map((m) => [m.ad, m.istasyonId]), [['Kaynak makinesi', istasyonId]]);

    // Ekran yalnız adı gönderir; açıklama, tip ve öteki alanlar okunmuş kayıttan tamamlanır.
    let anlik = await anlikOku(tam);
    await basarili(tam, 'is-merkezi-guncelle', { id: String(merkezId), ad: 'Yeni merkez adı' }, anlik);
    anlik = await anlikOku(tam);
    await basarili(tam, 'istasyon-guncelle', { id: String(istasyonId), ad: 'Yeni istasyon adı' }, anlik);
    await basarili(tam, 'makine-guncelle', { id: String(makineId), ad: 'Yeni makine adı' }, anlik);
    const merkezSonra = (await vt().tx((db) => isMerkezleri(db, { pasiflerDahil: false }))).find((m) => m.kod === 'KK-IM');
    assert.deepEqual([merkezSonra?.ad, merkezSonra?.aciklama], ['Yeni merkez adı', 'Üretim hattı']);
    assert.equal((await vt().tx((db) => istasyonlar(db, { pasiflerDahil: false }))).find((i) => i.kod === 'KK-IS')?.ad, 'Yeni istasyon adı');
    assert.equal((await vt().tx((db) => aktifMakineler(db))).find((m) => m.kod === 'KK-MK')?.ad, 'Yeni makine adı');

    const d = await durumOku(tam);
    assert.equal(d.wcs?.find((w) => w.code === 'KK-IM')?.name, 'Yeni merkez adı');
    assert.equal(d.stations?.find((s) => s.code === 'KK-IS')?.wcId, String(merkezId));
    assert.equal(d.machines?.find((m) => m.code === 'KK-MK')?.stationId, String(istasyonId));
  });

  test('KK-02: verim, operatör ihtiyacı ve makine durumu köprüde yazılmaz; sahibinin ucundan yazılanı durum ucu gösterir', async () => {
    for (const ad of ['istasyon-plan-ayari', 'makine-durumu']) assert.equal(Object.hasOwn(KAYNAK_KOMUTLARI, ad), false, ad);
    const merkezId = ((await basarili(tam, 'is-merkezi-ekle', { kod: 'KK2-IM', ad: 'İkinci merkez' }))?.['id']) as number;
    const istasyonId = ((await basarili(tam, 'istasyon-ekle', { kod: 'KK2-IS', ad: 'İkinci istasyon', isMerkeziId: merkezId }))?.['id']) as number;
    const makineId = ((await basarili(tam, 'makine-ekle', { kod: 'KK2-MK', ad: 'İkinci makine', istasyonId }))?.['id']) as number;
    await sahibineYaz(`/istasyonlar/${String(istasyonId)}/plan-ayari`, { verimYuzde: 85, operatorIhtiyaci: 0.5, surum: 0 });
    await sahibineYaz(`/makineler/${String(makineId)}/durum`, { durum: 'bakim', aciklama: 'Yağ değişimi', surum: 0 });
    const ayar = (await vt().tx((db) => planAyarlari(db))).find((a) => a.istasyonId === istasyonId);
    assert.deepEqual([Number(ayar?.verimYuzde), Number(ayar?.operatorIhtiyaci)], [85, 0.5]);
    assert.equal((await vt().tx((db) => makineDurumlari(db))).find((x) => x.makineId === makineId)?.durum, 'bakim');
    const d = await durumOku(tam);
    const ist = d.stations?.find((x) => x.code === 'KK2-IS');
    assert.deepEqual({ eff: ist?.eff, opPer: ist?.opPer }, { eff: 85, opPer: 0.5 });
    assert.equal(d.machines?.find((m) => m.code === 'KK2-MK')?.status, 'bakim');
  });

  test('KK-03: kişi eklenir (tekrar korumalı), düzenlenir; görev silinmez; yetkinlik listesi sahibinin tablosuna yazılır', async () => {
    const merkezId = ((await basarili(tam, 'is-merkezi-ekle', { kod: 'KK3-IM', ad: 'Üçüncü merkez' }))?.['id']) as number;
    const ist1 = ((await basarili(tam, 'istasyon-ekle', { kod: 'KK3-1', ad: 'Birinci', isMerkeziId: merkezId }))?.['id']) as number;
    const ist2 = ((await basarili(tam, 'istasyon-ekle', { kod: 'KK3-2', ad: 'İkinci', isMerkeziId: merkezId }))?.['id']) as number;

    const kisi = await basarili(tam, 'kisi-ekle', { ad: 'Deneme Operatör', sicilNo: 'KK-001', gorev: 'Operatör' });
    const kisiId = kisi?.['id'] as number;
    assert.deepEqual((await vt().tx((db) => kisiSecenekleri(db))).filter((k) => k.id === kisiId).map((k) => [k.ad, k.sicilNo]), [['Deneme Operatör', 'KK-001']]);

    const anlik = await anlikOku(tam);
    await basarili(tam, 'kisi-duzenle', { id: String(kisiId), ad: 'Deneme Usta' }, anlik);
    const sonra = await al(tam, '/kisiler');
    const satir = (sonra.json() as { kisiler: Array<{ id: number; ad: string; sicilNo: string | null; gorev: string | null }> }).kisiler.find((k) => k.id === kisiId);
    assert.deepEqual([satir?.ad, satir?.sicilNo, satir?.gorev], ['Deneme Usta', 'KK-001', 'Operatör']);

    await basarili(tam, 'yetkinlik-belirle', { kisiId: String(kisiId), istasyonIdleri: [ist1, ist2] });
    assert.deepEqual((await vt().tx((db) => istasyonYetkinlikleri(db))).filter((y) => y.kisiId === kisiId).map((y) => y.istasyonId).sort(), [ist1, ist2].sort());
    await basarili(tam, 'yetkinlik-belirle', { kisiId: String(kisiId), istasyonIdleri: [ist2] });
    assert.deepEqual((await vt().tx((db) => istasyonYetkinlikleri(db))).filter((y) => y.kisiId === kisiId).map((y) => y.istasyonId), [ist2]);
    assert.deepEqual((await durumOku(tam)).people?.find((p) => p.id === String(kisiId))?.skills, [String(ist2)]);
  });

  test('KK-04: vardiya ve tatil köprüde yazılmaz; Vardiya\'da yazılanı durum ucu gösterir', async () => {
    for (const ad of ['vardiya-ekle', 'vardiya-guncelle', 'tatil-ekle', 'tatil-kaldir', 'resmi-tatilleri-ekle']) assert.equal(Object.hasOwn(KAYNAK_KOMUTLARI, ad), false, ad);
    await sahibineYaz('/vardiyalar', { ad: 'KK sabah', baslangic: '07:00', bitis: '15:00', molalar: [{ baslangic: '11:00', bitis: '11:30' }], aktif: true });
    await sahibineYaz('/takvim-gunleri', { tarih: '2099-05-01', ad: 'KK emek', tur: 'tatil' });
    const d = await durumOku(tam);
    assert.deepEqual(d.cal.shifts.filter((v) => v.name === 'KK sabah').map((v) => [v.start, v.end]), [['07:00', '15:00']]);
    assert.equal(d.cal.holidays.includes('2099-05-01'), true);
  });

  test('KK-05: iki yerden düzenlemede ikinci kaydeden sürüm uyarısı alır (409, eski sürüm); kayıt ilk kaydedenin değerinde kalır; yenileyince geçer', async () => {
    const merkezId = ((await basarili(tam, 'is-merkezi-ekle', { kod: 'KK5-IM', ad: 'Sürüm merkezi' }))?.['id']) as number;
    const istasyonId = ((await basarili(tam, 'istasyon-ekle', { kod: 'KK5-IS', ad: 'Sürüm istasyonu', isMerkeziId: merkezId }))?.['id']) as number;
    const makineId = ((await basarili(tam, 'makine-ekle', { kod: 'KK5-MK', ad: 'Sürüm makinesi', istasyonId }))?.['id']) as number;
    const kisiId = ((await basarili(tam, 'kisi-ekle', { ad: 'Sürüm Kişisi' }))?.['id']) as number;

    // İki ekran aynı anda aynı kayıtları okur: biri R&R Kaynaklar, öteki İstasyonlar / Kişiler / Vardiya ekranı.
    const rr = await anlikOku(tam);
    const baska = await anlikOku(tam);
    const durumlar: Array<[string, string, Record<string, unknown>]> = [
      ['is-merkezi-guncelle', 'ad', { id: String(merkezId) }],
      ['istasyon-guncelle', 'ad', { id: String(istasyonId) }],
      ['makine-guncelle', 'ad', { id: String(makineId) }],
      ['kisi-duzenle', 'ad', { id: String(kisiId) }],
    ];
    for (const [ad, alan, kimlik] of durumlar) {
      await basarili(tam, ad, { ...kimlik, [alan]: `Diğer ekran ${ad}` }, baska);
      const ikinci = await komut(tam, ad, { ...kimlik, [alan]: `R&R ${ad}` }, rr);
      assert.equal(ikinci.statusCode, 409, `${ad}: ${ikinci.body}`);
      const govde = ikinci.json() as HataGovdesi;
      assert.equal(eskiSurumMu(govde), true, ad);
      assert.equal(govde.mesaj, ESKI_SURUM_ILETISI);
    }
    assert.equal((await vt().tx((db) => isMerkezleri(db, { pasiflerDahil: false }))).find((m) => m.kod === 'KK5-IM')?.ad, 'Diğer ekran is-merkezi-guncelle');
    assert.equal((await vt().tx((db) => aktifMakineler(db))).find((m) => m.kod === 'KK5-MK')?.ad, 'Diğer ekran makine-guncelle');

    // Ekran güncel kaydı okuyunca aynı değişiklik geçer.
    const yenilenmis = await anlikOku(tam);
    await basarili(tam, 'istasyon-guncelle', { id: String(istasyonId), ad: 'R&R yeniden' }, yenilenmis);
    assert.equal((await vt().tx((db) => istasyonlar(db, { pasiflerDahil: false }))).find((i) => i.kod === 'KK5-IS')?.ad, 'R&R yeniden');
  });

  test('KK-06: reddedilen komutlar: sahibinin yetkisi yoksa 403, sahibinin kuralı bozulursa 400/409; hiçbiri kayıt bırakmaz', async () => {
    const yetkisiz = await komut(sinirli, 'is-merkezi-ekle', { kod: 'KK6-IM', ad: 'Yetkisiz merkez' });
    assert.equal(yetkisiz.statusCode, 403);
    assert.equal((await vt().tx((db) => isMerkezleri(db, { pasiflerDahil: true }))).some((m) => m.kod === 'KK6-IM'), false);

    assert.equal((await komut(tam, 'is-merkezi-ekle', { kod: 'geçersiz kod!', ad: 'X' })).statusCode, 400);
    await basarili(tam, 'is-merkezi-ekle', { kod: 'KK6-IM', ad: 'Altıncı merkez' });
    assert.equal((await komut(tam, 'is-merkezi-ekle', { kod: 'KK6-IM', ad: 'Kopya' })).statusCode, 409);
    assert.equal((await vt().tx((db) => isMerkezleri(db, { pasiflerDahil: true }))).filter((m) => m.kod === 'KK6-IM').length, 1);

    // Gövdeye ekranın eklediği izinsiz alan sahibine ulaşmaz.
    const k = komutIstegi(KAYNAK_KOMUTLARI['is-merkezi-ekle']!, { kod: 'KK6-X', ad: 'X', yetki: 'yonetici', id: 5 });
    assert.deepEqual(Object.keys(k.govde).sort(), ['ad', 'kod']);
  });

  test('KK-09: yönetici olmayan, yalnız istasyonlar yazma işlemi olan kişi kendi sahibinin komutlarını yazar; başka sahibinin komutu 403 alır', async () => {
    const merkezId = ((await basarili(sahip, 'is-merkezi-ekle', { kod: 'KK9-IM', ad: 'Dokuzuncu merkez' }))?.['id']) as number;
    await basarili(sahip, 'istasyon-ekle', { kod: 'KK9-IS', ad: 'Dokuzuncu istasyon', isMerkeziId: merkezId });
    assert.equal((await vt().tx((db) => istasyonlar(db, { pasiflerDahil: false }))).some((i) => i.kod === 'KK9-IS'), true);
    assert.equal((await komut(sahip, 'kisi-ekle', { ad: 'Yetkisiz Kişi' })).statusCode, 403);
  });

  test('KK-07: kullanımdaki istasyon silinemez (sahibinin kuralı); boş olan silinir ve sahibinin listesinden çıkar', async () => {
    const merkezId = ((await basarili(tam, 'is-merkezi-ekle', { kod: 'KK7-IM', ad: 'Yedinci merkez' }))?.['id']) as number;
    const dolu = ((await basarili(tam, 'istasyon-ekle', { kod: 'KK7-1', ad: 'Dolu', isMerkeziId: merkezId }))?.['id']) as number;
    const bos = ((await basarili(tam, 'istasyon-ekle', { kod: 'KK7-2', ad: 'Boş', isMerkeziId: merkezId }))?.['id']) as number;
    const makineId = ((await basarili(tam, 'makine-ekle', { kod: 'KK7-MK', ad: 'Makine', istasyonId: dolu }))?.['id']) as number;
    assert.equal((await komut(tam, 'is-merkezi-sil', { id: merkezId })).statusCode, 409);
    assert.equal((await komut(tam, 'istasyon-sil', { id: dolu })).statusCode, 409);
    await basarili(tam, 'istasyon-sil', { id: bos });
    assert.equal((await vt().tx((db) => istasyonlar(db, { pasiflerDahil: true }))).some((i) => i.id === bos), false);
    await basarili(tam, 'makine-sil', { id: makineId });
    assert.equal((await vt().tx((db) => aktifMakineler(db))).some((m) => m.id === makineId), false);
    await basarili(tam, 'istasyon-sil', { id: dolu });
    await basarili(tam, 'is-merkezi-sil', { id: merkezId });
    assert.equal((await vt().tx((db) => isMerkezleri(db, { pasiflerDahil: true }))).some((m) => m.id === merkezId), false);
  });

  test('KK-10: iş merkezi haftası ve kişi vardiyası köprüde yazılmaz; Vardiya\'da yazılanı köprünün çevirisi (gün 7 = pazar 0) aynı düzenle verir', async () => {
    for (const ad of ['vardiya-matrisi-degistir', 'vardiya-matrisi-hafta-uygula', 'kisi-vardiyasi-belirle']) assert.equal(Object.hasOwn(KAYNAK_KOMUTLARI, ad), false, ad);
    const merkezId = ((await basarili(tam, 'is-merkezi-ekle', { kod: 'KK10-A', ad: 'Hafta kaynağı' }))?.['id']) as number;
    const vardiyaId = ((await sahibineYaz('/vardiyalar', { ad: 'KK10 vardiya', baslangic: '07:00', bitis: '15:00', molalar: [], aktif: true }))['vardiyalar'] as Array<{ id: number; ad: string }>).find((v) => v.ad === 'KK10 vardiya')?.id ?? 0;
    const kisiId = ((await basarili(tam, 'kisi-ekle', { ad: 'Hafta Kişisi' }))?.['id']) as number;
    const takvim = async () => (await al(tam, '/vardiya-takvimi')).json() as TakvimCevabi;
    await sahibineYaz('/vardiya-matrisi/degistir', { isMerkeziId: merkezId, gun: 1, vardiyaId, acik: true });
    await sahibineYaz('/vardiya-matrisi/degistir', { isMerkeziId: merkezId, gun: 7, vardiyaId, acik: true });
    await sahibineYaz(`/kisi-vardiyalari/${String(kisiId)}/belirle`, { vardiyaId });
    const ek = takvimEki(await takvim());
    assert.deepEqual(ek?.hafta[String(merkezId)], { 1: [String(vardiyaId)], 0: [String(vardiyaId)] });
    assert.equal(ek?.kisiVardiyasi[String(kisiId)], String(vardiyaId));
  });

  test('KK-08: tablodaki her komut en az bir testte sahibinin gerçek ucuna gitti (tabloda ölü komut kalmaz)', () => {
    assert.deepEqual(Object.keys(KAYNAK_KOMUTLARI).filter((ad) => !denenen.has(ad)), []);
  });
});
