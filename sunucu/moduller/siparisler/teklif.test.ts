import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { SiparisAyrintisi, SiparisDonusumCevabi, TeklifAyrintiCevabi, TeklifAyrintisi, TeklifListesiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { teklifDurumlari } from './disari.ts';
import * as sorgular from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

describe('siparisler teklif (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let operator = '';
  let sayac = 0;
  let musteriId = 0;
  let tedarikciId = 0;
  let mamulNo = 0;
  let sarfNo = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function girisYap(rolKodu: string | null): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `teklif-${(sayac += 1)}`;
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

  const talep = (degisen: Record<string, unknown> = {}): Record<string, unknown> => ({
    firmaId: musteriId, baslik: 'Deneme talebi', istenenTarih: '2026-11-30', aciklama: null,
    satirlar: [{ malzemeNo: mamulNo, tanim: 'Deneme parça A', miktar: '100' }, { malzemeNo: null, tanim: 'Kartı açılmamış parça', miktar: '10' }],
    ...degisen,
  });
  async function teklifAc(degisen: Record<string, unknown> = {}): Promise<TeklifAyrintisi> {
    const c = await gonder(yonetici, '/siparisler/teklifler/ekle', talep(degisen));
    assert.equal(c.statusCode, 200, c.body);
    return c.json<TeklifAyrintisi>();
  }
  // Başarısız komutun dönüşü kullanılmaz; yalnız durum kodu denetlenir.
  async function komut(t: Pick<TeklifAyrintisi, 'id' | 'surum'>, yol: string, govde: Record<string, unknown>, beklenen = 200): Promise<TeklifAyrintisi> {
    const c = await gonder(yonetici, `/siparisler/teklifler/${t.id}/${yol}`, { surum: t.surum, ...govde });
    assert.equal(c.statusCode, beklenen, c.body);
    return c.json<TeklifAyrintisi>();
  }
  const siparisGovdesi = () => ({
    firmaId: musteriId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-15', kdvOrani: '20', odemeKosulu: null, aciklama: null,
    satirlar: [{ malzemeNo: mamulNo, miktar: '1', birimFiyat: '1', termin: null, aciklama: null }],
  });
  const fiyatlar = (t: TeklifAyrintisi, ...birim: string[]) => t.satirlar.map((s, i) => ({ satirId: s.id, birimFiyat: birim[i] ?? '1' }));

  async function kartAc(tur: string): Promise<number> {
    sayac += 1;
    const kimlik = `tkl-dnm-${sayac}`;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'TKL-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [kimlik, tur, sayac, JSON.stringify({ id: kimlik, com: { ad: `Deneme ${tur}` } }), yoneticiId],
    ))!.no;
  }
  async function firmaAc(tur: string): Promise<number> {
    const c = await gonder(yonetici, '/musteri-tedarikci/firmalar/ekle', { ad: `Deneme Firma ${(sayac += 1)}`, tur });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<{ firma: { id: number } }>().firma.id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('siparisler_teklif');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const y = await girisYap(null);
    yonetici = y.cerez;
    yoneticiId = y.id;
    operator = (await girisYap('operator')).cerez;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('TKL-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    mamulNo = await kartAc('mamul');
    sarfNo = await kartAc('sarf');
    musteriId = await firmaAc('musteri');
    tedarikciId = await firmaAc('tedarikci');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yetki: yönetici talep açar; işlemi olmayan rol okuyamaz ve yazamaz, kayıt açılmaz; girişsiz 401', async () => {
    const t = await teklifAc();
    assert.match(t.no, /^TK-\d{4}-\d{3,}$/);
    assert.equal(t.durum, 'yeni');
    const once = (await oku(yonetici, '/siparisler/teklifler')).json<TeklifListesiCevabi>().toplam;
    assert.equal((await oku(operator, '/siparisler/teklifler')).statusCode, 403);
    assert.equal((await oku(operator, `/siparisler/teklifler/${t.id}`)).statusCode, 403);
    assert.equal((await gonder(operator, '/siparisler/teklifler/ekle', talep())).statusCode, 403);
    assert.equal((await gonder(operator, `/siparisler/teklifler/${t.id}/surum-ver`, { surum: t.surum, fiyatlar: fiyatlar(t) })).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/siparisler/teklifler' })).statusCode, 401);
    assert.equal((await oku(yonetici, '/siparisler/teklifler')).json<TeklifListesiCevabi>().toplam, once);
  });

  test('numara ortak sayaçtan gelir; sayaç baştan başlasa da dolu numara atlanır', async () => {
    const a = await teklifAc();
    const sira = (no: string) => Number(no.split('-')[2]);
    assert.match(a.no, new RegExp(`^TK-${tesisGunu(Date.now()).slice(0, 4)}-\\d{3,}$`));
    await o().sahip.sorgu("DELETE FROM ayar_numara_sayaci WHERE anahtar = 'siparisler.teklif-no'");
    assert.equal(sira((await teklifAc()).no), sira(a.no) + 1);
  });

  test('teklif numarası kalıbı Sistem Ayarları\'ndan değişir; 16 karakteri aşabilecek kalıp kaydedilmez', async () => {
    const kalip = async (deger: string, durum = 200) => assert.equal((await gonder(yonetici, '/ayarlar/siparisler.teklif-no/degistir', { deger })).statusCode, durum);
    await kalip('TEK{YY}/{SAYAC:5}');
    assert.match((await teklifAc()).no, /^TEK\d{2}\/\d{5}$/);
    // 3399 a: sınır kalıp kaydında denetlenir; numara almadan önce kullanıcı uyarılır.
    await kalip('SATISTEKLIFI-{YYYY}-{SAYAC:3}', 400);
    assert.match((await teklifAc()).no, /^TEK\d{2}\/\d{5}$/);
    await kalip('TK-{YYYY}-{SAYAC:3}');
  });

  test('3399 a: teklif firma kodunu taşır; {FIRMA}lı kalıpta numara firma kodlu ve firma başına sıralıdır', async () => {
    const kalip = async (deger: string) => assert.equal((await gonder(yonetici, '/ayarlar/siparisler.teklif-no/degistir', { deger })).statusCode, 200);
    for (const [kod, varsayilan] of [['ORNA', true], ['ORNB', false]] as const) {
      const c = await gonder(yonetici, '/firma-kodlari/ekle', { kod, ad: `Deneme ${kod}`, varsayilan });
      assert.ok([200, 409].includes(c.statusCode), c.body);
    }
    await kalip('{FIRMA}-T{YY}-{SAYAC:3}');
    try {
      const a = await teklifAc({ firmaKodu: 'ORNB' });
      const b = await teklifAc({ firmaKodu: 'ORNB' });
      const v = await teklifAc();
      assert.deepEqual([a.firmaKodu, v.firmaKodu], ['ORNB', 'ORNA']);
      assert.match(a.no, /^ORNB-T\d{2}-\d{3}$/);
      assert.equal(Number(b.no.slice(-3)), Number(a.no.slice(-3)) + 1);
      assert.match(v.no, /^ORNA-T\d{2}-\d{3}$/);
      assert.equal((await gonder(yonetici, '/siparisler/teklifler/ekle', talep({ firmaKodu: 'YOK' }))).statusCode, 400);
    } finally {
      await kalip('TK-{YYYY}-{SAYAC:3}');
    }
  });

  test('3399 a: tekliften dönen sipariş teklifin kodunu ve {FIRMA}lı kalıpta o kodla numarasını alır; kod sonradan pasif olsa da döner', async () => {
    const siparisKalibi = async (deger: string) =>
      assert.equal((await gonder(yonetici, '/ayarlar/siparisler.siparis-no/degistir', { deger })).statusCode, 200);
    for (const [kod, varsayilan] of [['ORNA', true], ['ORNB', false]] as const) {
      const c = await gonder(yonetici, '/firma-kodlari/ekle', { kod, ad: `Deneme ${kod}`, varsayilan });
      assert.ok([200, 409].includes(c.statusCode), c.body);
    }
    await siparisKalibi('{FIRMA}-S{YY}-{SAYAC:3}');
    try {
      let t = await teklifAc({ firmaKodu: 'ORNB' });
      t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), iskontoOrani: '0' });
      t = await komut(t, 'kabul', { surumNo: 1 });
      for (const s of t.satirlar.filter((x) => x.malzemeNo === null)) t = await komut(t, `satirlar/${s.id}/kart-bagla`, { malzemeNo: mamulNo });
      const kodlar = (await oku(yonetici, '/firma-kodlari')).json<{ firmaKodlari: { id: number; kod: string; ad: string; surum: number }[] }>().firmaKodlari;
      const b = kodlar.find((k) => k.kod === 'ORNB');
      assert.ok(b);
      const pasif = await gonder(yonetici, `/firma-kodlari/${b.id}/duzenle`, { ad: b.ad, varsayilan: false, aktif: false, surum: b.surum });
      assert.equal(pasif.statusCode, 200, pasif.body);
      const c = await gonder(yonetici, `/siparisler/teklifler/${t.id}/siparise-donustur`, {
        surum: t.surum, siparisTarihi: '2026-10-19', termin: '2026-11-20', kdvOrani: '20', musteriSiparisNo: null,
      });
      assert.equal(c.statusCode, 200, c.body);
      const s = (await oku(yonetici, `/siparisler/${c.json<SiparisDonusumCevabi>().siparisId}`)).json<SiparisAyrintisi>();
      assert.equal(s.firmaKodu, 'ORNB');
      assert.match(s.no, /^ORNB-S\d{2}-\d{3}$/);
      assert.equal((await gonder(yonetici, '/siparisler/ekle', { ...siparisGovdesi(), firmaKodu: 'ORNB' })).statusCode, 400, 'pasif kod yeni siparişe seçilemez');
      const yeni = await gonder(yonetici, '/siparisler/ekle', { ...siparisGovdesi(), firmaKodu: 'ORNA' });
      assert.equal(yeni.statusCode, 200, yeni.body);
      assert.match(yeni.json<SiparisAyrintisi>().no, /^ORNA-S\d{2}-\d{3}$/);
    } finally {
      await siparisKalibi('SS-{YYYY}-{SAYAC:3}');
    }
  });

  test('3399 a: firma kodu listesini kayıt yazma işlemi olmayan okuyamaz (403); ekleme ayar yazma ister (403)', async () => {
    assert.equal((await oku(operator, '/firma-kodlari')).statusCode, 403);
    const planlama = (await girisYap('planlama_proje')).cerez;
    assert.equal((await gonder(planlama, '/firma-kodlari/ekle', { kod: 'ORNX', ad: 'Deneme X', varsayilan: false })).statusCode, 403);
  });

  test('SIP-10 (180): teklif fiyatları, iskonto ve toplam yalnız siparisler.fiyat-oku olana gider', async () => {
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), iskontoOrani: '10' });
    const planlama = (await girisYap('planlama_proje')).cerez;
    const gizli = (await oku(planlama, `/siparisler/teklifler/${t.id}`)).json<TeklifAyrintiCevabi>();
    assert.equal(gizli.durum, 'verildi');
    const v = gizli.surumler[0];
    assert.deepEqual([v?.surumNo, v?.iskontoOrani, v?.toplam], [1, null, null]);
    assert.deepEqual(v?.fiyatlar.map((f) => [f.satirId, f.birimFiyat, f.iskontoluFiyat, f.tutar]), t.satirlar.map((m) => [m.id, null, null, null]));
    const acik = (await oku(yonetici, `/siparisler/teklifler/${t.id}`)).json<TeklifAyrintiCevabi>();
    assert.equal(acik.surumler[0]?.toplam, t.surumler[0]?.toplam);
    assert.notEqual(acik.surumler[0]?.toplam, null);
  });

  test('SIP-11 (201 a): teklif talebini planlama açar, fiyatlı sürümü yalnız fiyatı gören verir (403)', async () => {
    const planlama = (await girisYap('planlama_proje')).cerez;
    const c = await gonder(planlama, '/siparisler/teklifler/ekle', talep());
    assert.equal(c.statusCode, 200, c.body);
    const t = c.json<TeklifAyrintiCevabi>();
    const r = await gonder(planlama, `/siparisler/teklifler/${t.id}/surum-ver`, { surum: t.surum, fiyatlar: t.satirlar.map((m) => ({ satirId: m.id, birimFiyat: '5' })) });
    assert.equal(r.statusCode, 403, r.body);
    assert.equal((await komut(t, 'surum-ver', { fiyatlar: t.satirlar.map((m) => ({ satirId: m.id, birimFiyat: '5' })) })).durum, 'verildi');
  });

  test('SIP-01 ve SIP-02 teklifte de: tedarikçiye talep açılmaz, sarf kart satıra girmez; kartsız tanımlı satır girer', async () => {
    assert.equal((await gonder(yonetici, '/siparisler/teklifler/ekle', talep({ firmaId: tedarikciId }))).statusCode, 400);
    const sarf = await gonder(yonetici, '/siparisler/teklifler/ekle', talep({ satirlar: [{ malzemeNo: sarfNo, tanim: 'x', miktar: '1' }] }));
    assert.equal(sarf.statusCode, 400, sarf.body);
    const t = await teklifAc();
    assert.deepEqual(t.satirlar.map((s) => s.malzemeNo), [mamulNo, null]);
  });

  test('TKL-03 ve TKL-04: talep yeniyken düzenlenir; sürüm her satıra fiyat ister; verilen teklifin talebi değişmez; sürümler eklenir', async () => {
    let t = await teklifAc();
    t = await komut(t, 'guncelle', { ...talep({ baslik: 'Düzeltilmiş' }) });
    assert.equal(t.baslik, 'Düzeltilmiş');
    await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t).slice(0, 1) }, 400);
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), iskontoOrani: '10', teslimGun: 21, odemeKosulu: '60 gün vadeli' });
    assert.equal(t.durum, 'verildi');
    assert.deepEqual(t.surumler[0]?.fiyatlar.map((f) => [f.iskontoluFiyat, f.tutar]), [['9.0000', '900.00'], ['18.0000', '180.00']]);
    assert.equal(t.surumler[0]?.toplam, '1080.00');
    const red = await gonder(yonetici, `/siparisler/teklifler/${t.id}/guncelle`, { ...talep(), surum: t.surum });
    assert.equal(red.statusCode, 422, red.body);
    t = await komut(t, 'revizyon-iste', { not: 'Fiyat yüksek' });
    assert.deepEqual([t.durum, t.not], ['revizyon', 'Fiyat yüksek']);
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '9', '19') });
    assert.deepEqual(t.surumler.map((v) => v.surumNo), [1, 2]);
    assert.equal(t.sonSurumNo, 2);
    await komut({ ...t, surum: t.surum - 1 }, 'kabul', { surumNo: 2 }, 409);
  });

  test('3461: sürüm KDV oranını taşır; KDV ve KDV dahil toplam sürümün KDV hariç toplamından; oransız sürümde üçü null; fiyat görmeyene oran gider, tutar gitmez', async () => {
    let t = await teklifAc();
    await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), kdvOrani: '101' }, 400);
    await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), kdvOrani: '20.123' }, 400);
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20') });
    assert.deepEqual([t.surumler[0]?.kdvOrani, t.surumler[0]?.kdvTutari, t.surumler[0]?.genelToplam], [null, null, null]);
    t = await komut(t, 'revizyon-iste', { not: 'KDV yazılsın' });
    // 1199.99 * %10 = 119.999 -> 120.00 (iki ondalık, siparişteki gibi toplamdan).
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '9.9999', '20'), kdvOrani: '10' });
    const v = t.surumler[1];
    assert.deepEqual([v?.toplam, v?.kdvOrani, v?.kdvTutari, v?.genelToplam], ['1199.99', '10.00', '120.00', '1319.99']);
    assert.deepEqual(t.kdvSecenekleri, { oranlar: ['0.00', '1.00', '10.00', '20.00'], genel: '20.00' });
    const planlama = (await girisYap('planlama_proje')).cerez;
    const gizli = (await oku(planlama, `/siparisler/teklifler/${t.id}`)).json<TeklifAyrintiCevabi>().surumler[1];
    assert.deepEqual([gizli?.kdvOrani, gizli?.kdvTutari, gizli?.genelToplam, gizli?.toplam], ['10.00', null, null, null]);
    await assert.rejects(o().sahip.sorgu('UPDATE siparisler_teklif_surumu SET kdv_orani = 20 WHERE teklif_id = $1', [t.id]));
    await assert.rejects(o().sahip.sorgu(
      `INSERT INTO siparisler_teklif_surumu (teklif_id, surum_no, olusturan_id, kdv_orani) VALUES ($1, 9, $2, 100.01)`, [t.id, yoneticiId]),
    /siparisler_teklif_surumu_kdv/);
  });

  test('verilen sürüm değişmez: fiyat ve sürüm satırı veritabanında güncellenemez', async () => {
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '5', '6') });
    await assert.rejects(o().sahip.sorgu('UPDATE siparisler_teklif_fiyati SET birim_fiyat = 1 WHERE satir_id = $1', [t.satirlar[0]!.id]));
    await assert.rejects(o().sahip.sorgu("UPDATE siparisler_teklif_surumu SET iskonto_orani = 50 WHERE teklif_id = $1", [t.id]));
  });

  test('TKL-05 ve TKL-06 kabul, kart bağlama ve siparişe dönüştürme; sipariş kabul edilen sürümün iskontolu fiyatıyla açılır', async () => {
    let t = await teklifAc();
    await komut(t, 'kabul', { surumNo: 1 }, 422);
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), iskontoOrani: '5', odemeKosulu: '30 gün vadeli' });
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '12', '22'), iskontoOrani: '0' });
    await komut(t, 'kabul', { surumNo: 3 }, 400);
    t = await komut(t, 'kabul', { surumNo: 1 });
    assert.deepEqual([t.durum, t.kabulSurumu], ['kabul', 1]);
    const donusum = { siparisTarihi: '2026-10-19', termin: '2026-11-20', kdvOrani: '20', musteriSiparisNo: null };
    await komut(t, 'siparise-donustur', donusum, 422);
    const bos = t.satirlar.find((s) => s.malzemeNo === null)!;
    await komut(t, `satirlar/${bos.id}/kart-bagla`, { malzemeNo: sarfNo }, 400);
    t = await komut(t, `satirlar/${bos.id}/kart-bagla`, { malzemeNo: mamulNo });
    // 2120: bağlanan kartın adı satırda gelir; açıklamasız kartta açıklama dizisi boş.
    assert.deepEqual(t.satirlar.filter((x) => x.id === bos.id).map((x) => [x.malzemeAdi, x.aciklamalar]), [['Deneme mamul', []]]);
    const c = await gonder(yonetici, `/siparisler/teklifler/${t.id}/siparise-donustur`, { surum: t.surum, ...donusum });
    assert.equal(c.statusCode, 200, c.body);
    const sonuc = c.json<SiparisDonusumCevabi>();
    assert.deepEqual([sonuc.teklif.durum, sonuc.teklif.siparisId], ['siparis', sonuc.siparisId]);
    const s = (await oku(yonetici, `/siparisler/${sonuc.siparisId}`)).json<SiparisAyrintisi>();
    assert.deepEqual([s.durum, s.firmaId, s.odemeKosulu], ['taslak', musteriId, '30 gün vadeli']);
    assert.deepEqual(s.satirlar.map((r) => [r.malzemeNo, r.miktar, r.birimFiyat]), [[mamulNo, '100.000', '9.5000'], [mamulNo, '10.000', '19.0000']]);
    assert.equal(s.araToplam, '1140.00');
    await komut(sonuc.teklif, 'siparise-donustur', donusum, 422);
    await komut(sonuc.teklif, `satirlar/${bos.id}/kart-bagla`, { malzemeNo: mamulNo }, 422);
  });

  test('red notla olur, notsuz reddedilir; reddedilen teklife sürüm verilmez', async () => {
    let t = await teklifAc();
    await komut(t, 'reddet', {}, 400);
    t = await komut(t, 'reddet', { not: 'Proje ertelendi' });
    assert.deepEqual([t.durum, t.not], ['red', 'Proje ertelendi']);
    await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t) }, 422);
    const liste = (await oku(yonetici, `/siparisler/teklifler?durum=red&ara=${encodeURIComponent(t.no)}`)).json<TeklifListesiCevabi>();
    assert.deepEqual(liste.satirlar.map((x) => x.id), [t.id]);
  });

  test('TKL-09 (E-24) ret: işlemi olmayana her teklif ucu 403, salt okuyana yazma 403; olmayan teklife 404; kayıt değişmez', async () => {
    const t = await teklifAc();
    const kalite = (await girisYap('kalite')).cerez;
    const yazma = (id: number, surum: number, satirId: number): [string, Record<string, unknown>][] => [
      ['/siparisler/teklifler/ekle', talep()],
      [`/siparisler/teklifler/${id}/guncelle`, { ...talep(), surum }],
      [`/siparisler/teklifler/${id}/surum-ver`, { surum, fiyatlar: [{ satirId, birimFiyat: '5' }] }],
      [`/siparisler/teklifler/${id}/revizyon-iste`, { surum, not: 'Deneme' }],
      [`/siparisler/teklifler/${id}/reddet`, { surum, not: 'Deneme' }],
      [`/siparisler/teklifler/${id}/kabul`, { surum, surumNo: 1 }],
      [`/siparisler/teklifler/${id}/satirlar/${satirId}/kart-bagla`, { surum, malzemeNo: mamulNo }],
      [`/siparisler/teklifler/${id}/siparise-donustur`, {
        surum, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-30', kdvOrani: '20',
        cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null,
      }],
    ];
    const satirId = t.satirlar[0]?.id ?? 0;
    const once = (await oku(yonetici, '/siparisler/teklifler')).json<TeklifListesiCevabi>().toplam;
    for (const [yol, g] of yazma(t.id, t.surum, satirId)) {
      assert.equal((await gonder(operator, yol, g)).statusCode, 403, yol);
      assert.equal((await gonder(kalite, yol, g)).statusCode, 403, yol);
    }
    assert.equal((await oku(kalite, '/siparisler/teklifler')).statusCode, 200);
    assert.equal((await oku(kalite, `/siparisler/teklifler/${t.id}`)).statusCode, 200);

    assert.equal((await oku(yonetici, '/siparisler/teklifler/999999')).statusCode, 404);
    for (const [yol, g] of yazma(999999, 1, 1).slice(1)) {
      const c = await gonder(yonetici, yol, g);
      assert.equal(c.statusCode, 404, `${yol} ${c.body}`);
      assert.match(c.body, /Teklif bulunamadı/);
    }
    const sonra = (await oku(yonetici, `/siparisler/teklifler/${t.id}`)).json<TeklifAyrintisi>();
    assert.deepEqual([sonra.durum, sonra.surum], ['yeni', t.surum]);
    assert.equal((await oku(yonetici, '/siparisler/teklifler')).json<TeklifListesiCevabi>().toplam, once);
  });

  test('TKL-10 (254 a) disari teklifDurumlari: tek sorguda durumları verir; yineleneni tek, olmayanı yok sayar; boş dizide sorgu yok', async () => {
    const yeni = await teklifAc();
    let red = await teklifAc();
    red = await komut(red, 'reddet', { not: 'Deneme' });
    let sorgu = 0;
    const durumlar = await o().vt.tx((db) => teklifDurumlari({ sorgu: (...x: Parameters<typeof db.sorgu>) => { sorgu += 1; return db.sorgu(...x); }, tek: db.tek.bind(db) },
      [yeni.id, red.id, red.id, 999999]));
    assert.equal(sorgu, 1);
    assert.deepEqual([...durumlar.entries()].sort(([a], [b]) => a - b), [[yeni.id, 'yeni'], [red.id, 'red']]);
    sorgu = 0;
    const sayanDb = { sorgu: async () => { sorgu += 1; return []; }, tek: async () => { sorgu += 1; return null; } };
    assert.equal((await teklifDurumlari(sayanDb, [])).size, 0);
    assert.equal(sorgu, 0);
  });

  test('TKL-11 (291 a) %10 üstü iskontolu sürüm müdür onayı bekler: kabul edilemez, yazar onaylayamaz; müdür onaylar, teklif müşteriye gider', async () => {
    const mudur = await girisYap('mudur');
    const planlama = (await girisYap('planlama_proje')).cerez;
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t, '10', '20'), iskontoOrani: '10.01' });
    assert.equal(t.durum, 'onay-bekliyor');
    assert.deepEqual(t.surumler.map((v) => [v.iskontoOnaylayan, v.iskontoOnayAni]), [[null, null]]);
    const bildirim = await o().sahip.sorgu<{ baslik: string }>(
      "SELECT baslik FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = 'siparisler.iskonto-onay-bekliyor' AND yol = $2", [mudur.id, `/siparisler/teklifler/${t.id}`]);
    assert.deepEqual(bildirim, [{ baslik: `İskonto onayı bekleyen teklif: ${t.no}` }]);
    await komut(t, 'kabul', { surumNo: 1 }, 422);
    await komut(t, 'revizyon-iste', { not: 'Deneme' }, 422);
    assert.equal((await gonder(planlama, `/siparisler/teklifler/${t.id}/iskonto-onayla`, { surum: t.surum })).statusCode, 403);
    assert.equal((await gonder(operator, `/siparisler/teklifler/${t.id}/iskonto-onayla`, { surum: t.surum })).statusCode, 403);
    assert.equal((await oku(yonetici, `/siparisler/teklifler/${t.id}`)).json<TeklifAyrintisi>().surum, t.surum);
    const c = await gonder(mudur.cerez, `/siparisler/teklifler/${t.id}/iskonto-onayla`, { surum: t.surum });
    assert.equal(c.statusCode, 200, c.body);
    t = c.json<TeklifAyrintisi>();
    assert.equal(t.durum, 'verildi');
    assert.match(t.surumler[0]?.iskontoOnaylayan ?? '', /^Deneme teklif-/);
    assert.ok(t.surumler[0]?.iskontoOnayAni);
    await komut(t, 'iskonto-onayla', {}, 422);
    t = await komut(t, 'kabul', { surumNo: 1 });
    assert.equal(t.durum, 'kabul');

    // Eşik dahil onaysız geçer; bekleyen teklife daha düşük iskontolu yeni sürüm verilir ya da reddedilir.
    let u = await teklifAc();
    u = await komut(u, 'surum-ver', { fiyatlar: fiyatlar(u), iskontoOrani: '10' });
    assert.equal(u.durum, 'verildi');
    u = await komut(u, 'surum-ver', { fiyatlar: fiyatlar(u), iskontoOrani: '25' });
    assert.equal(u.durum, 'onay-bekliyor');
    u = await komut(u, 'surum-ver', { fiyatlar: fiyatlar(u), iskontoOrani: '5' });
    assert.equal(u.durum, 'verildi');
    let r = await teklifAc();
    r = await komut(r, 'surum-ver', { fiyatlar: fiyatlar(r), iskontoOrani: '50' });
    r = await komut(r, 'reddet', { not: 'Müdür onaylamadı' });
    assert.equal(r.durum, 'red');
  });

  test('TKL-12 (293) dört göz açıkken sürümü veren kendi iskontosunu onaylayamaz (422); başka yetkili onaylar; kapalıyken veren de onaylar', async () => {
    const mudur = (await girisYap('mudur')).cerez;
    const ayarla = async (deger: boolean) => {
      const c = await gonder(yonetici, '/ayarlar/siparisler.iskonto-dort-goz/degistir', { deger });
      assert.equal(c.statusCode, 200, c.body);
    };
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t), iskontoOrani: '15' });
    t = await komut(t, 'iskonto-onayla', {});
    assert.equal(t.durum, 'verildi');

    await ayarla(true);
    try {
      let u = await teklifAc();
      u = await komut(u, 'surum-ver', { fiyatlar: fiyatlar(u), iskontoOrani: '15' });
      const ret = await gonder(yonetici, `/siparisler/teklifler/${u.id}/iskonto-onayla`, { surum: u.surum });
      assert.equal(ret.statusCode, 422, ret.body);
      assert.match(ret.body, /Dört göz kuralı açık/);
      const c = await gonder(mudur, `/siparisler/teklifler/${u.id}/iskonto-onayla`, { surum: u.surum });
      assert.equal(c.statusCode, 200, c.body);
      assert.equal(c.json<TeklifAyrintisi>().durum, 'verildi');
    } finally {
      await ayarla(false);
    }
  });

  test('3400-2/3 kalem birimi ve yerlilik: kartsız kalem seçilen birimi ve girilen oranı, karta bağlı kalem kartın birimini ve oranını taşır', async () => {
    sayac += 1;
    const kimlik = `tkl-dnm-${sayac}`;
    const yerli = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'TKL-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [kimlik, sayac, JSON.stringify({ id: kimlik, com: { ad: 'Deneme yerli', birim: 'adet' }, g: { yerlilik: 62.5 } }), yoneticiId],
    ))!.no;
    const t = await teklifAc({ satirlar: [
      { malzemeNo: yerli, tanim: 'Yerli parça', miktar: '5', birim: 'kg', yerlilikOrani: '10' },
      { malzemeNo: null, tanim: 'Kartsız takım', miktar: '2', birim: 'set', yerlilikOrani: '40' },
      { malzemeNo: mamulNo, tanim: 'Oransız kart', miktar: '1', yerlilikOrani: '55.5' },
    ] });
    assert.deepEqual(t.satirlar.map((x) => [x.birim, x.yerlilikOrani]), [['adet', '62.50'], ['set', '40.00'], [null, '55.50']]);
    // Kartsız kalem sonradan karta bağlanınca kartsızken seçilen birim bırakılır, kartın birimi geçer; girilen oran kalır.
    const kartsiz = t.satirlar[1]!;
    const bagli = await komut(t, `satirlar/${kartsiz.id}/kart-bagla`, { malzemeNo: yerli });
    assert.deepEqual(bagli.satirlar.filter((x) => x.id === kartsiz.id).map((x) => [x.malzemeNo, x.birim, x.yerlilikOrani]), [[yerli, 'adet', '40.00']]);
    assert.equal((await o().sahip.tek<{ birim: string | null }>('SELECT birim FROM siparisler_teklif_satiri WHERE id = $1', [kartsiz.id]))?.birim, null);

    // Pasif birim kartsız kalemde kabul edilmez; ticari mal kartında kayıtlı oran (yalnız mamul ve yarı mamulde geçerli) kaleme gelmez.
    await o().sahip.sorgu("INSERT INTO malzeme_birimi (kod, aktif) VALUES ('dnm-pasif', false) ON CONFLICT (kod) DO UPDATE SET aktif = false");
    const pasif = await gonder(yonetici, '/siparisler/teklifler/ekle', talep({ satirlar: [{ malzemeNo: null, tanim: 'Pasif birim', miktar: '1', birim: 'dnm-pasif' }] }));
    assert.equal(pasif.statusCode, 400, pasif.body);
    assert.match(pasif.body, /Birim listede yok/);
    sayac += 1;
    const hmKimlik = `tkl-dnm-${sayac}`;
    const hammadde = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'ticari_mal', 'TKL-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [hmKimlik, sayac, JSON.stringify({ id: hmKimlik, com: { ad: 'Deneme ticari yerli', birim: 'kg' }, g: { yerlilik: 80 } }), yoneticiId],
    ))!.no;
    const hmSecenek = (await oku(yonetici, '/siparisler/malzeme-secenekleri?ara=Deneme%20ticari%20yerli')).json<{ satirlar: { no: number; yerlilikOrani: string | null }[] }>().satirlar;
    const hmSatir = hmSecenek.find((x) => x.no === hammadde);
    assert.ok(hmSatir, 'ticari mal kartı seçeneklerde');
    assert.equal(hmSatir.yerlilikOrani, null);
    const hmTeklif = await teklifAc({ satirlar: [{ malzemeNo: hammadde, tanim: 'Ticari', miktar: '1' }] });
    assert.equal(hmTeklif.satirlar[0]?.yerlilikOrani, null);

    const yok = await gonder(yonetici, '/siparisler/teklifler/ekle', talep({ satirlar: [{ malzemeNo: null, tanim: 'Bilinmeyen birim', miktar: '1', birim: 'yok-boyle-birim' }] }));
    assert.equal(yok.statusCode, 400, yok.body);
    assert.match(yok.body, /Birim listede yok/);
    assert.match(yok.body, /satirlar\.0\.birim/);
    const fazla = await gonder(yonetici, '/siparisler/teklifler/ekle', talep({ satirlar: [{ malzemeNo: null, tanim: 'Fazla oran', miktar: '1', yerlilikOrani: '100.5' }] }));
    assert.notEqual(fazla.statusCode, 200, fazla.body);

    const birimler = (await oku(yonetici, '/siparisler/birim-secenekleri')).json<{ birimler: { kod: string; logo: string | null }[] }>().birimler;
    assert.ok(birimler.some((b) => b.kod === 'set'));
    assert.equal((await oku(operator, '/siparisler/birim-secenekleri')).statusCode, 403);
    const secenek = (await oku(yonetici, '/siparisler/malzeme-secenekleri?ara=Deneme%20yerli')).json<{ satirlar: { no: number; yerlilikOrani: string | null }[] }>().satirlar;
    assert.equal(secenek.find((x) => x.no === yerli)?.yerlilikOrani, '62.50');
  });
  test('3419 a: fiyatı verilmemiş teklifi açan ya da onay yetkilisi siler; başkası 403, fiyatlı 422, eski sürüm 409; denetim kaydı kalır, numara geri verilmez', async () => {
    const acan = await girisYap('planlama_proje');
    const baska = (await girisYap('planlama_proje')).cerez;
    const mudur = (await girisYap('mudur')).cerez;
    const ac = async (cerez: string) => {
      const c = await gonder(cerez, '/siparisler/teklifler/ekle', talep());
      assert.equal(c.statusCode, 200, c.body);
      return c.json<TeklifAyrintisi>();
    };
    const sil = (cerez: string, t: Pick<TeklifAyrintisi, 'id' | 'surum'>, surum = t.surum) => gonder(cerez, `/siparisler/teklifler/${t.id}/sil`, { surum });

    const t = await ac(acan.cerez);
    assert.equal(t.olusturanId, acan.id);
    assert.equal((await sil(operator, t)).statusCode, 403);
    const red = await sil(baska, t);
    assert.equal(red.statusCode, 403, red.body);
    assert.equal((await sil(acan.cerez, t, t.surum + 1)).statusCode, 409);
    const c = await sil(acan.cerez, t);
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json(), { id: t.id, no: t.no });
    assert.equal((await oku(yonetici, `/siparisler/teklifler/${t.id}`)).statusCode, 404);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM siparisler_teklif_satiri WHERE teklif_id = $1', [t.id]))?.n, 0);
    const kayit = await o().sahip.tek<{ kisi_id: number; ek: unknown }>(
      "SELECT kisi_id, govde->'_ek' AS ek FROM denetim_kaydi WHERE yol = '/siparisler/teklifler/:id/sil' AND parametre->>'id' = $1", [String(t.id)]);
    assert.equal(kayit?.kisi_id, acan.id);
    assert.deepEqual(kayit?.ek, [{ islem: 'teklif-sil', teklif: t.id, no: t.no, firma: musteriId, baslik: 'Deneme talebi', kalem: 2, taslak: 0 }]);
    assert.notEqual((await teklifAc()).no, t.no);

    // Onay yetkilisi başkasının taslağını siler; fiyatı verilmiş teklif silinmez, kaydı değişmez.
    const u = await ac(acan.cerez);
    assert.equal((await sil(mudur, u)).statusCode, 200);
    let f = await teklifAc();
    f = await komut(f, 'surum-ver', { fiyatlar: fiyatlar(f) });
    const fiyatli = await sil(yonetici, f);
    assert.equal(fiyatli.statusCode, 422, fiyatli.body);
    assert.equal((await oku(yonetici, `/siparisler/teklifler/${f.id}`)).json<TeklifAyrintisi>().surum, f.surum);
    // Fiyatsız ama reddedilmiş teklif de silinmez: müşterinin reddi kayıt olarak kalır.
    let r = await ac(acan.cerez);
    r = await komut(r, 'reddet', { not: 'Deneme' });
    assert.equal((await sil(acan.cerez, r)).statusCode, 422);
  });

  test('3419 a: fiyatlı teklif nedenle arşivlenir; listede ve sayıda yok, komut almaz, Logo sırası bekler; arşivden çıkınca döner', async () => {
    const liste = async (arsiv: 'evet' | 'hayir') =>
      (await oku(yonetici, `/siparisler/teklifler?arsiv=${arsiv}&sayfaBoyu=200`)).json<TeklifListesiCevabi>().satirlar.map((x) => x.id);
    const sirada = async (id: number) => (await sorgular.logoyaGidecekTeklifSiralari(o().sahip, 1000)).some((x) => x.teklif_id === id);
    let t = await teklifAc();
    await komut(t, 'arsivle', { neden: 'deneme' }, 422);
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t) });
    assert.equal(t.durum, 'verildi');
    assert.equal(await sirada(t.id), true);
    await komut(t, 'arsivle', {}, 400);
    await komut(t, 'arsivle', { neden: 'olmayan' }, 400);
    await komut(t, 'arsivden-cikar', {}, 422);
    const acikSayi = async () => (await oku(yonetici, '/siparisler/ozet')).json<{ acikTeklif: number }>().acikTeklif;
    const acikOnce = await acikSayi();
    assert.equal((await gonder(operator, `/siparisler/teklifler/${t.id}/arsivle`, { surum: t.surum, neden: 'deneme' })).statusCode, 403);
    const a = await komut(t, 'arsivle', { neden: 'yanlis-firma', not: 'Deneme notu' });
    assert.equal(a.durum, 'verildi');
    assert.equal(a.surum, t.surum + 1);
    assert.equal(a.arsiv?.neden, 'yanlis-firma');
    assert.equal(a.arsiv?.not, 'Deneme notu');
    assert.match(a.arsiv?.kisi ?? '', /^Deneme teklif-/);
    assert.ok((await liste('evet')).includes(t.id));
    assert.ok(!(await liste('hayir')).includes(t.id));
    assert.equal(await sirada(t.id), false);
    assert.equal(await acikSayi(), acikOnce - 1);
    await komut(a, 'surum-ver', { fiyatlar: fiyatlar(a) }, 422);
    await komut(a, 'kabul', { surumNo: 1 }, 422);
    await komut(a, 'reddet', { not: 'Deneme' }, 422);
    await komut(a, 'arsivle', { neden: 'deneme' }, 422);
    await komut(a, 'form-metni-kaydet', { metin: null }, 422);
    await komut(a, 'revizyon-iste', { not: 'Deneme' }, 422);
    const kartsiz = a.satirlar.find((x) => x.malzemeNo === null)!;
    await komut(a, `satirlar/${kartsiz.id}/kart-bagla`, { malzemeNo: mamulNo }, 422);
    const degismedi = (await oku(yonetici, `/siparisler/teklifler/${t.id}`)).json<TeklifAyrintisi>();
    assert.deepEqual([degismedi.surum, degismedi.durum, degismedi.satirlar.find((x) => x.id === kartsiz.id)?.malzemeNo], [a.surum, 'verildi', null]);
    assert.equal((await gonder(yonetici, `/siparisler/teklifler/${t.id}/sil`, { surum: a.surum })).statusCode, 422);

    const c = await komut(a, 'arsivden-cikar', {});
    assert.equal(c.arsiv, null);
    assert.ok((await liste('hayir')).includes(t.id));
    assert.equal(await sirada(t.id), true);
    assert.equal(await acikSayi(), acikOnce);
    const k = await komut(c, 'kabul', { surumNo: 1 });
    await komut(k, 'arsivle', { neden: 'deneme' }, 422);
    // Reddedilen (kayıp) teklif de arşivlenir.
    let r = await teklifAc();
    r = await komut(r, 'reddet', { not: 'Deneme' });
    assert.equal((await komut(r, 'arsivle', { neden: 'tekrar' })).arsiv?.neden, 'tekrar');
    // Kısıt: kabul edilmiş teklif veritabanında da arşivlenemez.
    await assert.rejects(o().sahip.sorgu("UPDATE siparisler_teklif SET arsiv_an = now(), arsivleyen_id = $2, arsiv_nedeni = 'deneme' WHERE id = $1", [k.id, yoneticiId]),
      /siparisler_teklif_arsiv_durum/);
    await assert.rejects(o().sahip.sorgu('UPDATE siparisler_teklif SET arsiv_an = NULL WHERE id = $1', [r.id]), /siparisler_teklif_arsiv_butun/);
  });

  test('3419 a (K3): onay bekleyen teklif arşivlenince iskonto onayı bildirimi kapanır', async () => {
    const mudur = await girisYap('mudur');
    let t = await teklifAc();
    t = await komut(t, 'surum-ver', { fiyatlar: fiyatlar(t), iskontoOrani: '30' });
    assert.equal(t.durum, 'onay-bekliyor');
    const acik = () => o().sahip.tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = 'siparisler.iskonto-onay-bekliyor' AND yol = $2 AND okundu IS NULL",
      [mudur.id, `/siparisler/teklifler/${t.id}`]);
    assert.equal((await acik())?.n, 1);
    t = await komut(t, 'arsivle', { neden: 'diger' });
    assert.equal((await acik())?.n, 0);
    assert.equal((await gonder(mudur.cerez, `/siparisler/teklifler/${t.id}/iskonto-onayla`, { surum: t.surum })).statusCode, 422);
  });

  test('3419 a (K1): eşzamanlı fiyat verme ile silme, arşivleme ile kabul: biri geçer, öbürü çakışır; yarım kayıt kalmaz', async () => {
    for (let i = 0; i < 3; i += 1) {
      const t = await teklifAc();
      const [v, s] = await Promise.all([
        gonder(yonetici, `/siparisler/teklifler/${t.id}/surum-ver`, { surum: t.surum, fiyatlar: fiyatlar(t) }),
        gonder(yonetici, `/siparisler/teklifler/${t.id}/sil`, { surum: t.surum }),
      ]);
      const kodlar = [v.statusCode, s.statusCode].sort();
      assert.equal(kodlar.filter((x) => x === 200).length, 1, `${v.body} ${s.body}`);
      assert.ok([404, 409].includes(kodlar.find((x) => x !== 200) ?? 0), `${v.body} ${s.body}`);
      const kalan = await o().sahip.tek<{ teklif: number; surum: number }>(
        'SELECT (SELECT count(*)::int FROM siparisler_teklif WHERE id = $1) AS teklif, (SELECT count(*)::int FROM siparisler_teklif_surumu WHERE teklif_id = $1) AS surum', [t.id]);
      assert.deepEqual(kalan, s.statusCode === 200 ? { teklif: 0, surum: 0 } : { teklif: 1, surum: 1 });

      let u = await teklifAc();
      u = await komut(u, 'surum-ver', { fiyatlar: fiyatlar(u) });
      const [a, k] = await Promise.all([
        gonder(yonetici, `/siparisler/teklifler/${u.id}/arsivle`, { surum: u.surum, neden: 'deneme' }),
        gonder(yonetici, `/siparisler/teklifler/${u.id}/kabul`, { surum: u.surum, surumNo: 1 }),
      ]);
      assert.equal([a.statusCode, k.statusCode].filter((x) => x === 200).length, 1, `${a.body} ${k.body}`);
      const son = (await oku(yonetici, `/siparisler/teklifler/${u.id}`)).json<TeklifAyrintisi>();
      assert.ok(son.durum === 'kabul' ? son.arsiv === null : son.arsiv !== null);
    }
  });
});
