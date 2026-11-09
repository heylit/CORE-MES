import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Belge, Odeme } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { tekrarDeposu } from '../../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';
import { belgeSiparisBagla, siparisOdemeKapanislari } from '../disari.ts';

// 2481 (2481-1 a, 2481-2 a): siparişin ödeme kapanış günü. Firmalar, tutarlar ve tarihler uydurmadır.
const PAROLA = 'dogru-parola-1';
const TEKRARLI = /\/(ekle|dagit|ciro)$/;
interface Siparis { talepId: string; teklifId: string }

describe('finans siparişin ödeme kapanışı (2481, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let cerez = '';
  let firma = 0;
  let hesap = 0;
  let sira = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function yaz<T>(yol: string, govde: unknown): Promise<T> {
    const basliklar: Record<string, string> = { cookie: cerez };
    if (TEKRARLI.test(yol)) basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: basliklar, payload: govde as object });
    assert.equal(c.statusCode, 200, `${yol} ${c.body}`);
    return c.json() as T;
  }
  // Satın almanın tabloları fikstürdür; siparişi satın almanın kendi akışı açar.
  async function siparis(): Promise<Siparis> {
    const s = { talepId: randomUUID(), teklifId: randomUUID() };
    sira += 1;
    await vt().sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $3, 'Deneme talep', $2, $2, 'siparis_verildi')", [s.talepId, yoneticiId, sira]);
    await vt().sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [s.talepId, s.teklifId]);
    await vt().sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [s.talepId]);
    await vt().sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [s.talepId, s.teklifId]);
    return s;
  }
  async function fatura(s: Siparis | null, yon: 'gider' | 'gelir' = 'gider', tutar = 100): Promise<Belge> {
    const b = (await yaz<{ belge: Belge }>('/finans/belgeler/ekle', {
      yon, kategori: yon === 'gider' ? 'mal_alimi' : 'urun_satisi', firmaId: firma, belgeTarihi: '2026-10-01', vade: '2026-11-30', tutar, kdvOrani: 0,
    })).belge;
    if (s) await vt().tx((db) => belgeSiparisBagla(db, yoneticiId, { belgeId: b.id, siparisFirmaId: firma, siparis: s }));
    return b;
  }
  const ode = (belgeId: number, tutar: number, tarih: string) => yaz<{ odeme: Odeme }>('/finans/odemeler/ekle', {
    yon: 'gider', firmaId: firma, tarih, yontem: 'banka', hesapId: hesap, tutar, dagitimlar: [{ belgeId, belgeTutari: tutar }],
  });
  const kapanislar = (l: Siparis[]) => vt().tx((db) => siparisOdemeKapanislari(db, l));
  const kapanis = async (s: Siparis) => (await kapanislar([s])).get(`${s.talepId}:${s.teklifId}`);

  before(async () => {
    ortam = await testVeritabaniKur('finanskapanis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    firma = (await yaz<{ firma: { id: number } }>('/musteri-tedarikci/firmalar/ekle', { ad: 'Kapanış Deneme Firma', tur: 'ikisi' })).firma.id;
    hesap = (await yaz<{ hesap: { id: number } }>('/finans/hesaplar/ekle', { ad: 'Kapanış Banka', tur: 'banka', paraBirimi: 'TRY', acilisBakiyesi: 100000, acilisTarihi: '2026-01-01' })).hesap.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('FNS-74: iki faturası da ödenen sipariş en geç ödeme gününü verir; biri açıkken null; istenen her sipariş haritada', async () => {
    const s = await siparis();
    const bos = await siparis();
    const f1 = await fatura(s), f2 = await fatura(s);
    await ode(f1.id, 100, '2026-10-10');
    assert.equal(await kapanis(s), null, 'ikinci fatura açık');
    await ode(f2.id, 40, '2026-10-12');
    assert.equal(await kapanis(s), null, 'kısmi ödeme kapatmaz');
    await ode(f2.id, 60, '2026-10-15');
    const h = await kapanislar([s, bos]);
    assert.deepEqual([...h.entries()], [[`${s.talepId}:${s.teklifId}`, { kapanis: '2026-10-15' }], [`${bos.talepId}:${bos.teklifId}`, null]]);
    assert.deepEqual((await kapanislar([])).size, 0);
  });

  test('FNS-74 (2481-1 a): sonradan dağıtılan avansta gün ödemenin günüdür, dağılımın günü değil', async () => {
    const s = await siparis();
    const f = await fatura(s);
    const avans = (await yaz<{ odeme: Odeme }>('/finans/odemeler/ekle', { yon: 'gider', firmaId: firma, tarih: '2026-09-01', yontem: 'banka', hesapId: hesap, tutar: 100 })).odeme;
    assert.equal(await kapanis(s), null, 'dağıtılmamış avans faturayı kapatmaz');
    await yaz(`/finans/odemeler/${avans.id}/dagit`, { tarih: '2026-10-20', dagitimlar: [{ belgeId: f.id, belgeTutari: 100 }] });
    assert.deepEqual(await kapanis(s), { kapanis: '2026-09-01' });
  });

  test('FNS-74 (2481-1 a): verilen çekle ödemede gün çekin vadesidir; vade düzeltilince kapanış da değişir', async () => {
    const s = await siparis();
    const f = await fatura(s);
    const cek = (await yaz<{ cek: { id: number; surum: number } }>('/finans/cekler/ekle', {
      yon: 'verilen', tur: 'cek', firmaId: firma, banka: 'Deneme Banka', seriNo: 'D-1', duzenlemeTarihi: '2026-10-05', vade: '2026-12-04', tutar: 100,
      dagitimlar: [{ belgeId: f.id, belgeTutari: 100 }],
    })).cek;
    assert.deepEqual(await kapanis(s), { kapanis: '2026-12-04' });
    await yaz(`/finans/cekler/${cek.id}/duzelt`, { surum: cek.surum, banka: 'Deneme Banka', seriNo: 'D-1', vade: '2026-12-20' });
    assert.deepEqual(await kapanis(s), { kapanis: '2026-12-20' });
  });

  test('FNS-74 (2481-1 a): ciro edilen alınan çekle ödemede gün çekin vadesidir', async () => {
    const s = await siparis();
    const f = await fatura(s);
    const cek = (await yaz<{ cek: { id: number; surum: number } }>('/finans/cekler/ekle', {
      yon: 'alinan', tur: 'cek', firmaId: firma, banka: 'Deneme Banka', seriNo: 'A-1', duzenlemeTarihi: '2026-10-02', vade: '2027-01-15', tutar: 100,
    })).cek;
    await yaz(`/finans/cekler/${cek.id}/ciro`, { surum: cek.surum, firmaId: firma, tarih: '2026-10-06', dagitimlar: [{ belgeId: f.id, belgeTutari: 100 }] });
    assert.deepEqual(await kapanis(s), { kapanis: '2027-01-15' });
  });

  test('FNS-74 (2481-2 a): mahsupla kapanan faturada gün mahsubun tarihidir', async () => {
    const s = await siparis();
    const f = await fatura(s);
    const satis = await fatura(null, 'gelir');
    await ode(f.id, 30, '2026-10-08');
    await yaz('/finans/mahsuplar/ekle', { firmaId: firma, satisBelgeId: satis.id, alisBelgeId: f.id, satisTutari: 70, tarih: '2026-10-25' });
    assert.deepEqual(await kapanis(s), { kapanis: '2026-10-25' });
  });

  test('FNS-74: iptal edilen dağılım kapanışı geri alır; iptal edilen belge sayılmaz, hepsi iptalse null', async () => {
    const s = await siparis();
    const f = await fatura(s);
    await ode(f.id, 100, '2026-10-11');
    assert.deepEqual(await kapanis(s), { kapanis: '2026-10-11' });
    const d = await vt().tek<{ id: number }>('SELECT id FROM finans_odeme_dagilimi WHERE belge_id = $1 AND iptal_zamani IS NULL', [f.id]);
    await yaz(`/finans/dagitimlar/${d?.id}/iptal`, {});
    assert.equal(await kapanis(s), null, 'iptal edilen dağılım sayılmaz');

    const iptalli = await siparis();
    const g = await fatura(iptalli);
    await yaz(`/finans/belgeler/${g.id}/iptal`, { surum: g.surum + 1, neden: 'Deneme iptal' });
    assert.equal(await kapanis(iptalli), null, 'yalnız iptal edilmiş belgesi olan sipariş kapanmaz');

    const karisik = await siparis();
    const k1 = await fatura(karisik), k2 = await fatura(karisik);
    await ode(k1.id, 100, '2026-10-13');
    await yaz(`/finans/belgeler/${k2.id}/iptal`, { surum: k2.surum + 1, neden: 'Deneme iptal' });
    assert.deepEqual(await kapanis(karisik), { kapanis: '2026-10-13' }, 'iptal edilen belge açık sayılmaz');
  });
});
