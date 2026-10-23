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
});
