import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AdimGirdisi, KomutCevabi, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { talasliAdimSureleri } from './disari.ts';

const PAROLA = 'dogru-parola-1';

// 3278 D: 3D Atölyesi süre kartının rota karşılaştırması. Rota yalnız okunur; talaşlı adım kaynağı talaşlı istasyon ya da talaşlı
// istasyondaki makinedir; ölçüm ortancası pencerenin son 5 işlem ölçümündendir.
describe('rota talaşlı adım süreleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  const c: Record<'yonetici' | 'kartOnaycisi' | 'planlama' | 'mudur', string> = { yonetici: '', kartOnaycisi: '', planlama: '', mudur: '' };
  let tipler: SeceneklerCevabi['operasyonTipleri'] = [];
  let talasliIstasyon = 0;
  let kaliteIstasyonu = 0;
  let talasliMakine = 0;
  let kaliteMakinesi = 0;
  let hammadde = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function tamam<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const cevap = await app.inject({
      method: yontem, url: `/api${url}`, payload: payload as object | undefined,
      headers: { cookie: cerez, ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
    });
    assert.equal(cevap.statusCode, 200, `${yontem} ${url}: ${cevap.body}`);
    return cevap.json();
  }
  const kartZorunlulari = (tur: string, sira: number): Record<string, unknown> => ({
    hammadde: { grade: 'S235', form: 'cubuk', dims: { d: 20, l: 2000 + sira } },
    mamul: { g: { ad: `Deneme mamul ${sira}` } },
  } as Record<string, Record<string, unknown>>)[tur] ?? {};
  async function kartAc(tur: 'mamul' | 'hammadde'): Promise<number> {
    const kimlik = `ts${++sayac}`;
    const kod = `${tur === 'mamul' ? 'MM' : 'HM'}-TSR-0000${sayac}`;
    const govde = (d: string, surum: number | null) => ({
      kayit: { id: kimlik, tur, fam: 'metal', com: { kod, ad: `Deneme ${tur} ${sayac}`, birim: 'adet' }, onay: { durum: d }, ...kartZorunlulari(tur, sayac) },
      ozet: { stok_kodu: kod, tur, onay_durumu: d, benzersiz_anahtar: `${tur}|${kimlik}`, mukerrer_gerekcesi: null },
      surum,
    });
    const r = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('taslak', null));
    const g = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('onayda', r.surum));
    await tamam(c.kartOnaycisi, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('aktif', g.surum));
    return (await vt().tx((db) => db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik])))!.no;
  }
  const tip = (kod: string): number => {
    const t = tipler.find((x) => x.kod === kod);
    if (!t) throw new Error(`Operasyon tipi yok: ${kod}`);
    return t.id;
  };
  const adim = (p: Partial<AdimGirdisi>): AdimGirdisi => ({
    opNo: null, operasyonTipiId: tip('TRN'), ad: 'Tornalama', kaynak: { tur: 'makine', id: talasliMakine }, ayarSuresiDk: 30, birimSureDk: 2,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
    adaylar: [], bilesenler: [{ malzemeId: hammadde, miktar: 1, fireYuzde: 0 }], yanUrunler: [], ...p,
  });
  async function yururlukteRota(adimlar: AdimGirdisi[]): Promise<{ urun: number; revizyonId: number }> {
    const urun = await kartAc('mamul');
    const { id } = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak: { tur: 'bos' } });
    const k = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/kaydet`, { surum: 1, aciklama: null, adimlar });
    const g = await tamam<KomutCevabi>(c.planlama, 'POST', `/rota/revizyonlar/${id}/onaya-gonder`, { surum: k.surum });
    await tamam(c.mudur, 'POST', `/rota/revizyonlar/${id}/onayla`, { surum: g.surum, yururlugeAl: true });
    return { urun, revizyonId: id };
  }
  // Terminal ve kabul satırı iş emrine bağlıdır (rota_gerceklesen_sure_is_emri); elle satır bağsızdır.
  const olcumYaz = (urun: number, opNo: number, sureDk: number | null, kaynak = 'elle', isEmriId: number | null = null) => ortam!.sahip.sorgu(
    'INSERT INTO rota_gerceklesen_sure (malzeme_id, op_no, tur, makine_id, sure_dk, kaynak, kisi_id, is_emri_id) VALUES ($1, $2, \'islem\', NULL, $3, $4, $5, $6)',
    [urun, opNo, sureDk, kaynak, yoneticiId, isEmriId]);

  before(async () => {
    ortam = await testVeritabaniKur('talasli_sure');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await girisCerezi('yonetici');
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('TSR.DENEME', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await ortam.vt.tx((db) => db.sorgu(
      `INSERT INTO rol_islemi (rol_id, islem)
       SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem FROM (VALUES
         ('planlama_proje', 'rota.yaz'), ('planlama_proje', 'rota.revizyon-yaz'), ('planlama_proje', 'rota.onaya-gonder'),
         ('planlama_proje', 'rota.taslak-ac'), ('planlama_proje', 'rota.emre-kopyala'), ('mudur', 'rota.onayla')) AS m (kod, islem)
       ON CONFLICT DO NOTHING`,
    ));
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kart Onaycısı', kullaniciAdi: 'kartonay', parola: PAROLA }));
    c.kartOnaycisi = await girisCerezi('kartonay');
    const roller = (await tamam<{ roller: { id: number; ad: string }[] }>(c.yonetici, 'GET', '/roller')).roller;
    for (const [ad, rolAdi] of [['planlama', 'Planlama ve Proje'], ['mudur', 'Müdür']] as const) {
      const rolId = roller.find((x) => x.ad === rolAdi)!.id;
      await vt().tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
        const kisi = await rolAta(db, yoneticiId, id, rolId);
        for (const rol of kisi.roller) if (rol.id !== rolId) await rolAl(db, yoneticiId, id, rol.id);
      });
      c[ad] = await girisCerezi(ad);
    }
    tipler = (await tamam<SeceneklerCevabi>(c.mudur, 'GET', '/rota/secenekler')).operasyonTipleri;
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'TS-IM', ad: 'Deneme merkez', aciklama: null });
    talasliIstasyon = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'TS-A', ad: 'Deneme talaşlı', isMerkeziId: merkez.id })).id;
    kaliteIstasyonu = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'TS-K', ad: 'Deneme kalite', isMerkeziId: merkez.id, tip: 'kalite' })).id;
    talasliMakine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'TS-MA', ad: 'Deneme makine', istasyonId: talasliIstasyon })).id;
    kaliteMakinesi = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'TS-MK', ad: 'Deneme ölçüm', istasyonId: kaliteIstasyonu })).id;
    hammadde = await kartAc('hammadde');
  });

  after(async () => { await ortam?.kaldir(); });

  test('RT-96: yürürlükte rota yoksa null; talaşlı istasyon ve talaşlı istasyondaki makine adımı gelir, kalite ve kişi adımı gelmez', async () => {
    const rotasiz = await kartAc('mamul');
    assert.equal(await vt().tx((db) => talasliAdimSureleri(db, rotasiz)), null);
    const { urun } = await yururlukteRota([
      adim({ ad: 'Tornalama', birimSureDk: 2 }),
      adim({ ad: 'Ölçüm', kaynak: { tur: 'istasyon', id: kaliteIstasyonu }, birimSureDk: 5 }),
      adim({ ad: 'Frezeleme', kaynak: { tur: 'istasyon', id: talasliIstasyon }, birimSureDk: null, islemSuresiDk: 3.5, degisimSuresiDk: 0.5 }),
      adim({ ad: 'CMM', kaynak: { tur: 'makine', id: kaliteMakinesi }, birimSureDk: 4 }),
      adim({ ad: 'Çapak', kaynak: null, birimSureDk: 1 }),
    ]);
    const adimlar = await vt().tx((db) => talasliAdimSureleri(db, urun));
    // İşlem süresi girilmiş adımda işlem, girilmemişte birim süre (teorikAyrim); değişim karşılaştırmaya girmez.
    // 3321-2: makine kaynağında makine (kod), istasyonda null; bileşen kartları süre kartının varsayılan malzemesidir.
    const makineKod = (await vt().tx((db) => db.tek<{ kod: string }>('SELECT kod FROM makine WHERE id = $1', [talasliMakine])))!.kod;
    assert.deepEqual(adimlar, [
      { opNo: 10, ad: 'Tornalama', islemDk: 2, olcumOrtancaDk: null, olcumAdedi: 0, makineId: talasliMakine, makineKod, hammaddeNolari: [hammadde] },
      { opNo: 30, ad: 'Frezeleme', islemDk: 3.5, olcumOrtancaDk: null, olcumAdedi: 0, makineId: null, makineKod: null, hammaddeNolari: [hammadde] },
    ]);
  });

  test('RT-97: ölçüm ortancası pencerenin son 5 işlem ölçümündendir; boşaltmadan önceki ve kabul satırı sayılmaz', async () => {
    const { urun, revizyonId } = await yururlukteRota([adim({}), adim({ ad: 'Frezeleme' })]);
    const emir = await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${revizyonId}/emre-kopyala`, { projeId, adet: 4, teslim: null });
    const isEmri = emir.isEmriIdleri[0]!;
    await olcumYaz(urun, 10, 50);
    await olcumYaz(urun, 10, null);
    for (const x of [1, 2]) await olcumYaz(urun, 10, x);
    await olcumYaz(urun, 10, 3, 'terminal', isEmri);
    for (const x of [10, 11, 12]) await olcumYaz(urun, 10, x);
    await olcumYaz(urun, 20, 7, 'kabul', isEmri);
    const adimlar = await vt().tx((db) => talasliAdimSureleri(db, urun));
    // Boşaltmadan (boş elle satır) sonraki 1, 2, 3 (terminal), 10, 11, 12; son 5'i 2..12, ortanca 10 (ilk 5'in ortancası 3, altısının 6,5).
    // OP 20'de yalnız kabul var: ölçüm yok.
    assert.deepEqual(adimlar?.map((a) => [a.opNo, a.olcumOrtancaDk, a.olcumAdedi]), [[10, 10, 5], [20, null, 0]]);
  });
});
