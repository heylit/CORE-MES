import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Belge, OnayTalebi, Odeme } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Firmalar, hesaplar ve tutarlar uydurmadır.
const PAROLA = 'dogru-parola-1';
const TARIH = '2026-11-10';
interface Cevap<T = unknown> { durum: number; govde: T }
interface AyarCevabi { ayar: { esikOdeme: string | null; esikIptal: string | null; esikEsitleme: string | null; surum: number } }

describe('finans ikinci kişi onayı (3673, gerçek PostgreSQL)', () => {
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
  const oku = <T = unknown>(yol: string, kim = 'muhasebe') => istek<T>(kim, 'GET', yol);
  const tamam = <T>(c: Cevap<T>): T => { assert.equal(c.durum, 200, `${c.durum} ${JSON.stringify(c.govde)}`); return c.govde; };
  const ileti = (c: Cevap): string => String((c.govde as { ileti?: string }).ileti ?? JSON.stringify(c.govde));

  let sayac = 0;
  async function firma(): Promise<number> {
    return tamam(await yaz<{ firma: { id: number } }>('/musteri-tedarikci/firmalar/ekle', { ad: `Deneme Firma ${(sayac += 1)}`, tur: 'ikisi' })).firma.id;
  }
  async function hesap(): Promise<number> {
    return tamam(await yaz<{ hesap: { id: number } }>('/finans/hesaplar/ekle', { ad: `Deneme Hesap ${(sayac += 1)}`, tur: 'banka', paraBirimi: 'TRY', acilisBakiyesi: 1000000, acilisTarihi: '2026-01-01' })).hesap.id;
  }
  const odemeGovdesi = (firmaId: number, hesapId: number, tutar: number) => ({ yon: 'gider', firmaId, tarih: TARIH, yontem: 'banka', hesapId, tutar, dagitimlar: [] });
  const esikleriYaz = async (esikOdeme: string | null, esikIptal: string | null, esikEsitleme: string | null, kim = 'yonetici') => {
    const { ayar } = tamam(await oku<AyarCevabi>('/finans/onay-ayari', 'yonetici'));
    return yaz<AyarCevabi>('/finans/onay-ayari', { surum: ayar.surum, esikOdeme, esikIptal, esikEsitleme }, kim);
  };
  const talepAc = (tur: string, hedef: string, govde: unknown, kim = 'muhasebe') => yaz<{ talep: OnayTalebi }>('/finans/onay-talepleri/ac', { tur, hedef, govde, gerekce: 'Tedarikçi ödemesi' }, kim);
  const onayla = (t: OnayTalebi, kim = 'onayci') => yaz<{ talep: OnayTalebi }>(`/finans/onay-talepleri/${t.id}/onayla`, { surum: t.surum }, kim);
  const durumuOku = async (id: number): Promise<string | undefined> => (await vt().tek<{ durum: string }>('SELECT durum FROM finans_onay WHERE id = $1', [id]))?.durum;
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
    ortam = await testVeritabaniKur('finans_onay');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez.set('yonetici', String(c.headers['set-cookie']).split(';')[0] ?? '');
    const firmaIslemleri = ['musteri-tedarikci.oku', 'musteri-tedarikci.yaz'];
    await girisliKisi('muhasebe', ['sayfa.finans', 'finans.oku', 'finans.yaz', 'finans.iptal', 'finans.hesap-yonet', ...firmaIslemleri]);
    await girisliKisi('onayci', ['sayfa.finans', 'finans.oku', 'finans.onay']);
    await girisliKisi('okuyan', ['sayfa.finans', 'finans.oku']);
    await girisliKisi('ayarci', ['sayfa.finans', 'finans.oku', 'finans.ayar']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('ON-01: ayar boşken hiçbir işlem onay istemez; eşiği yalnız yönetici (finans.onay-ayar) yazar, sürümle', async () => {
    const f = await firma(); const h = await hesap();
    assert.deepEqual(tamam(await oku<AyarCevabi>('/finans/onay-ayari', 'okuyan')).ayar.esikOdeme, null);
    tamam(await yaz('/finans/odemeler/ekle', odemeGovdesi(f, h, 999999)));
    assert.equal((await yaz('/finans/onay-ayari', { surum: 1, esikOdeme: '1000', esikIptal: null, esikEsitleme: null }, 'muhasebe')).durum, 403);
    assert.equal((await yaz('/finans/onay-ayari', { surum: 1, esikOdeme: '1000', esikIptal: null, esikEsitleme: null }, 'ayarci')).durum, 403, 'finans.ayar tek başına eşik yazdırmaz');
    assert.equal((await yaz('/finans/onay-ayari', { surum: 1, esikOdeme: '0', esikIptal: null, esikEsitleme: null }, 'yonetici')).durum, 400, 'sıfır eşik olmaz');
    const a = tamam(await esikleriYaz('1000', '5000', '400')).ayar;
    assert.deepEqual([a.esikOdeme, a.esikIptal, a.esikEsitleme, a.surum], ['1000.00', '5000.00', '400.00', 2]);
    assert.equal((await yaz('/finans/onay-ayari', { surum: 1, esikOdeme: '1', esikIptal: null, esikEsitleme: null }, 'yonetici')).durum, 409, 'eski sürüm reddedilir');
  });

  test('ON-02: ödeme eşiğin altında onaysız geçer, eşikte (>=) onay ister; onay başka tutarda, başkasında ve ikinci kez kullanılamaz', async () => {
    const f = await firma(); const h = await hesap();
    tamam(await yaz('/finans/odemeler/ekle', odemeGovdesi(f, h, 999.99)));
    const c = await yaz('/finans/odemeler/ekle', odemeGovdesi(f, h, 1000));
    assert.equal(c.durum, 400);
    assert.match(ileti(c), /ikinci kişinin onayını/);
    assert.equal((await talepAc('odeme', 'odeme:ekle', odemeGovdesi(f, h, 999.99))).durum, 400, 'eşik altı tutar için talep açılmaz');
    const t = tamam(await talepAc('odeme', 'odeme:ekle', odemeGovdesi(f, h, 1000))).talep;
    assert.deepEqual([t.durum, t.tutarTl, t.talepEdenAdi], ['bekliyor', '1000.00', 'Deneme muhasebe']);
    // N1: ikinci kişi kime, hangi hesaptan, hangi tarihte ve belge para biriminde ne kadar ödendiğini görür.
    assert.match(t.ayrinti.firma ?? '', /^Deneme Firma \d+$/);
    assert.match(t.ayrinti.hesap ?? '', /^Deneme Hesap \d+$/);
    assert.deepEqual([t.ayrinti.tarih, t.ayrinti.tutar], [TARIH, '1000.00 TRY']);
    assert.equal((await yaz('/finans/odemeler/ekle', { ...odemeGovdesi(f, h, 1000), onayId: t.id })).durum, 400, 'bekleyen onayla yazılmaz');
    const onayli = tamam(await onayla(t)).talep;
    assert.equal(onayli.durum, 'onaylandi');
    assert.equal(onayli.kararVerenAdi, 'Deneme onayci');
    assert.match(ileti(await yaz('/finans/odemeler/ekle', { ...odemeGovdesi(f, h, 1001), onayId: t.id })), /bu komut için verilmemiş/);
    assert.equal((await yaz('/finans/odemeler/ekle', { ...odemeGovdesi(f, h, 1000), onayId: t.id }, 'yonetici')).durum, 400, 'başkasının onayı kullanılamaz');
    const o = tamam(await yaz<{ odeme: Odeme }>('/finans/odemeler/ekle', { ...odemeGovdesi(f, h, 1000), onayId: t.id })).odeme;
    assert.equal(o.tutar, '1000.00');
    assert.equal(await durumuOku(t.id), 'kullanildi');
    assert.match(ileti(await yaz('/finans/odemeler/ekle', { ...odemeGovdesi(f, h, 1000), onayId: t.id })), /bir kez kullanıldı/);
  });

  test('ON-03: talep eden kendi talebini onaylayamaz (sunucu ve veritabanı), karar finans.onay ister, red gerekçelidir ve reddedilen kullanılamaz', async () => {
    const f = await firma(); const h = await hesap();
    const t = tamam(await talepAc('odeme', 'odeme:ekle', odemeGovdesi(f, h, 2000))).talep;
    assert.equal((await onayla(t, 'muhasebe')).durum, 403, 'finans.onay olmayan karar veremez');
    const kendi = tamam(await talepAc('odeme', 'odeme:ekle', odemeGovdesi(f, h, 2500), 'yonetici')).talep;
    const c = await onayla(kendi, 'yonetici');
    assert.equal(c.durum, 400);
    assert.match(ileti(c), /ikinci bir kişi/);
    assert.equal(await kisitAdi('UPDATE finans_onay SET durum = $2, karar_veren_id = talep_eden_id, karar_zamani = now() WHERE id = $1', [kendi.id, 'onaylandi']), 'finans_onay_ikinci_kisi');
    const r = tamam(await talepAc('odeme', 'odeme:ekle', odemeGovdesi(f, h, 3000))).talep;
    assert.equal((await yaz(`/finans/onay-talepleri/${r.id}/reddet`, { surum: r.surum }, 'onayci')).durum, 400, 'red gerekçesiz olmaz');
    const red = tamam(await yaz<{ talep: OnayTalebi }>(`/finans/onay-talepleri/${r.id}/reddet`, { surum: r.surum, not: 'Tutar yanlış' }, 'onayci')).talep;
    assert.deepEqual([red.durum, red.kararNotu], ['reddedildi', 'Tutar yanlış']);
    assert.match(ileti(await yaz('/finans/odemeler/ekle', { ...odemeGovdesi(f, h, 3000), onayId: r.id })), /reddedildi/);
    assert.equal((await onayla(red)).durum, 422, 'karara bağlanmış talep yeniden karara bağlanmaz');
  });

  test('ON-04: talep eden vazgeçebilir; başkası vazgeçemez; vazgeçilen kullanılamaz; aynı komut için ikinci açık talep olmaz', async () => {
    const f = await firma(); const h = await hesap();
    const govde = odemeGovdesi(f, h, 4000);
    const t = tamam(await talepAc('odeme', 'odeme:ekle', govde)).talep;
    assert.equal((await talepAc('odeme', 'odeme:ekle', govde)).durum, 409, 'aynı komut için açık talep zaten var');
    assert.equal((await yaz(`/finans/onay-talepleri/${t.id}/vazgec`, { surum: t.surum }, 'yonetici')).durum, 400);
    const v = tamam(await yaz<{ talep: OnayTalebi }>(`/finans/onay-talepleri/${t.id}/vazgec`, { surum: t.surum })).talep;
    assert.equal(v.durum, 'vazgecildi');
    assert.match(ileti(await yaz('/finans/odemeler/ekle', { ...govde, onayId: t.id })), /vazgeçilmiş/);
    assert.equal((await talepAc('odeme', 'odeme:ekle', govde)).durum, 200, 'vazgeçilince yeni talep açılabilir');
  });

  test('ON-05: iptal eşiği belge, ödeme ve virman iptalinde ayrıdır; onaylı iptal bir kez geçer', async () => {
    const f = await firma(); const h = await hesap();
    const b = tamam(await yaz<{ belge: Belge }>('/finans/belgeler/ekle', { yon: 'gider', kategori: 'mal_alimi', firmaId: f, belgeTarihi: TARIH, vade: '2026-12-31', tutar: 6000, kdvOrani: 0 })).belge;
    const kucuk = tamam(await yaz<{ belge: Belge }>('/finans/belgeler/ekle', { yon: 'gider', kategori: 'mal_alimi', firmaId: f, belgeTarihi: TARIH, vade: '2026-12-31', tutar: 4000, kdvOrani: 0 })).belge;
    tamam(await yaz(`/finans/belgeler/${kucuk.id}/iptal`, { surum: kucuk.surum, neden: 'Yanlış giriş' }));
    const c = await yaz(`/finans/belgeler/${b.id}/iptal`, { surum: b.surum, neden: 'Yanlış giriş' });
    assert.equal(c.durum, 400);
    assert.match(ileti(c), /iptal için 5000.00 TL/);
    const t = tamam(await talepAc('iptal', `belge:${b.id}:iptal`, { surum: b.surum, neden: 'Yanlış giriş' })).talep;
    assert.deepEqual([t.ayrinti.tarih, t.ayrinti.tutar, t.ayrinti.hesap], [TARIH, '6000.00 TRY', null]);
    assert.match(t.ayrinti.firma ?? '', /^Deneme Firma \d+$/);
    tamam(await onayla(t));
    assert.equal((await yaz(`/finans/belgeler/${b.id}/iptal`, { surum: b.surum, neden: 'Başka neden', onayId: t.id })).durum, 400, 'gövde değişince onay geçmez');
    assert.equal(tamam(await yaz<{ belge: Belge }>(`/finans/belgeler/${b.id}/iptal`, { surum: b.surum, neden: 'Yanlış giriş', onayId: t.id })).belge.durum, 'iptal');
    const h2 = await hesap();
    const v = tamam(await yaz<{ virman: { id: number; surum: number } }>('/finans/virmanlar/ekle', { kaynakHesapId: h, hedefHesapId: h2, tarih: TARIH, tutar: 7000 })).virman;
    assert.equal((await yaz(`/finans/virmanlar/${v.id}/iptal`, { surum: v.surum })).durum, 400);
    const vt1 = tamam(await talepAc('iptal', `virman:${v.id}:iptal`, { surum: v.surum })).talep;
    assert.match(vt1.ayrinti.hesap ?? '', /^Deneme Hesap \d+ → Deneme Hesap \d+$/);
    assert.equal(vt1.ayrinti.tutar, '7000.00 TRY');
    tamam(await onayla(vt1));
    tamam(await yaz(`/finans/virmanlar/${v.id}/iptal`, { surum: v.surum, onayId: vt1.id }));
    assert.equal(await durumuOku(vt1.id), 'kullanildi');
  });

  test('ON-06: bakiye eşitleme gerekçe ister; eşikte onay ister; onay komuttaki farka bağlıdır', async () => {
    const h = await hesap();
    assert.equal((await yaz(`/finans/hesaplar/${h}/esitle`, { tarih: TARIH, gercekBakiye: 1000100 })).durum, 400, 'gerekçesiz eşitleme olmaz');
    tamam(await yaz(`/finans/hesaplar/${h}/esitle`, { tarih: TARIH, gercekBakiye: 1000300, neden: 'Banka ekstresi farkı' }));
    assert.equal((await vt().tek<{ neden: string }>('SELECT neden FROM finans_bakiye_esitleme WHERE hesap_id = $1', [h]))?.neden, 'Banka ekstresi farkı');
    const govde = { tarih: TARIH, gercekBakiye: 1000800, neden: 'Sayım farkı' };
    const c = await yaz(`/finans/hesaplar/${h}/esitle`, govde);
    assert.equal(c.durum, 400);
    assert.match(ileti(c), /bakiye eşitleme için 400.00 TL/);
    const t = tamam(await talepAc('esitleme', `hesap:${h}:esitle`, govde)).talep;
    assert.equal(t.tutarTl, '500.00');
    assert.match(t.ayrinti.hesap ?? '', /^Deneme Hesap \d+$/);
    assert.equal(t.ayrinti.tutar, '500.00 TRY');
    tamam(await onayla(t));
    // Onaydan sonra bakiye oynarsa fark değişir; onay eski farka verilmişti.
    const f = await firma();
    tamam(await yaz('/finans/odemeler/ekle', odemeGovdesi(f, h, 100)));
    assert.match(ileti(await yaz(`/finans/hesaplar/${h}/esitle`, { ...govde, onayId: t.id })), /bu komut için verilmemiş/);
    const t2 = tamam(await talepAc('esitleme', `hesap:${h}:esitle`, govde)).talep;
    tamam(await onayla(t2));
    tamam(await yaz(`/finans/hesaplar/${h}/esitle`, { ...govde, onayId: t2.id }));
    assert.equal(await durumuOku(t2.id), 'kullanildi');
  });

  test('ON-07: peşin gider belgesi ve talep yetkisi: yetkisi olmayan talep açamaz, eşiği aşan peşin belge onaysız yazılmaz ve geri alınır', async () => {
    const f = await firma(); const h = await hesap();
    const belge = { yon: 'gider', kategori: 'mal_alimi', firmaId: f, belgeTarihi: TARIH, vade: TARIH, tutar: 1500, kdvOrani: 0, pesin: { yontem: 'banka', hesapId: h, tarih: TARIH } };
    const once = (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_belge'))?.n;
    assert.equal((await yaz('/finans/belgeler/ekle', belge)).durum, 400);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_belge'))?.n, once, 'reddedilen komut belge bırakmaz');
    assert.equal((await talepAc('odeme', 'belge:ekle', belge, 'okuyan')).durum, 403, 'finans.yaz olmayan talep açamaz');
    // Peşin belgede ayrıntı tutarı kapının baktığı KDV dahil tabandadır.
    assert.equal(tamam(await talepAc('odeme', 'belge:ekle', { ...belge, kdvOrani: 20 })).talep.ayrinti.tutar, '1800.00 TRY');
    const t = tamam(await talepAc('odeme', 'belge:ekle', belge)).talep;
    tamam(await onayla(t));
    tamam(await yaz('/finans/belgeler/ekle', { ...belge, onayId: t.id }));
    assert.equal(await durumuOku(t.id), 'kullanildi');
    assert.equal((await talepAc('iptal', 'odeme:ekle', odemeGovdesi(f, h, 2000))).durum, 400, 'tür hedefe uymalı');
    assert.equal((await talepAc('odeme', 'bilinmeyen:ekle', {})).durum, 400);
  });

  test('ON-08: talep komutu değişmez ve silinmez; geçişler tek yönlüdür; liste durumla süzülür', async () => {
    const f = await firma(); const h = await hesap();
    const t = tamam(await talepAc('odeme', 'odeme:ekle', odemeGovdesi(f, h, 8000))).talep;
    assert.equal(await kisitAdi('UPDATE finans_onay SET tutar_tl = 1 WHERE id = $1', [t.id]), 'finans_onay_degismez');
    assert.equal(await kisitAdi('UPDATE finans_onay SET durum = $2 WHERE id = $1', [t.id, 'kullanildi']), 'finans_onay_gecis', 'onaylanmadan kullanılamaz');
    assert.match(String(await kisitAdi('DELETE FROM finans_onay WHERE id = $1', [t.id])), /yalnız ekleme/);
    const bekleyen = tamam(await oku<{ talepler: OnayTalebi[] }>('/finans/onay-talepleri?durum=bekliyor')).talepler;
    assert.ok(bekleyen.some((x) => x.id === t.id));
    assert.ok(bekleyen.every((x) => x.durum === 'bekliyor'));
    assert.equal((await oku('/finans/onay-talepleri', 'okuyan')).durum, 200);
  });

  test('ON-09: verilen çek düzenlenirken, alınan çek cirolanırken, çekle kapanan gider belgesinde, düzenli ödeme ve ödeme iptalinde kapı vardır; çekin ödendisi kapısızdır', async () => {
    const f = await firma(); const h = await hesap();
    // Karar (kullanıcı): verilen çek düzenleme anında onay ister; çek o andan tedarikçiye verilmiş sayılır.
    const cekGovdesi = { yon: 'verilen', tur: 'cek', firmaId: f, duzenlemeTarihi: TARIH, vade: '2026-12-01', tutar: 3000 };
    const reddedilen = await yaz('/finans/cekler/ekle', cekGovdesi);
    assert.equal(reddedilen.durum, 400);
    assert.match(ileti(reddedilen), /ikinci kişinin onayını/);
    const tc = tamam(await talepAc('odeme', 'cek:ekle', cekGovdesi)).talep;
    assert.deepEqual([tc.tutarTl, tc.ayrinti.tarih, tc.ayrinti.tutar], ['3000.00', TARIH, '3000.00 TRY']);
    tamam(await onayla(tc));
    assert.equal((await yaz('/finans/cekler/ekle', { ...cekGovdesi, tutar: 3001, onayId: tc.id })).durum, 400, 'onay başka tutarda kullanılamaz');
    const c = tamam(await yaz<{ cek: { id: number; surum: number } }>('/finans/cekler/ekle', { ...cekGovdesi, onayId: tc.id })).cek;
    assert.equal((await yaz('/finans/cekler/ekle', { ...cekGovdesi, onayId: tc.id })).durum, 400, 'onay bir kez kullanılır');
    tamam(await yaz(`/finans/cekler/${c.id}/odendi`, { surum: c.surum, hesapId: h, tarih: TARIH }));
    // Eşik altı çek onaysız düzenlenir; alınan çek düzenlemesi kapıya girmez.
    tamam(await yaz('/finans/cekler/ekle', { ...cekGovdesi, tutar: 999 }));
    const alinan = tamam(await yaz<{ cek: { id: number; surum: number } }>('/finans/cekler/ekle', { yon: 'alinan', tur: 'cek', firmaId: f, duzenlemeTarihi: TARIH, vade: '2026-12-01', tutar: 4000 })).cek;
    const ciro = { surum: alinan.surum, firmaId: f, tarih: TARIH, dagitimlar: [] };
    assert.equal((await yaz(`/finans/cekler/${alinan.id}/ciro`, ciro)).durum, 400, 'ciro eşik üstünde onay ister');
    const tg = tamam(await talepAc('odeme', `cek:${alinan.id}:ciro`, ciro)).talep;
    tamam(await onayla(tg));
    tamam(await yaz(`/finans/cekler/${alinan.id}/ciro`, { ...ciro, onayId: tg.id }));
    // Çekle kapanan gider belgesi de düzenleme anında kapıdan geçer.
    const belge = { yon: 'gider', kategori: 'mal_alimi', firmaId: f, belgeTarihi: TARIH, vade: TARIH, tutar: 2500, kdvOrani: 0, cek: { tur: 'cek', banka: 'Deneme Banka', seriNo: 'ORN-CK-1', vade: '2026-12-01' } };
    assert.equal((await yaz('/finans/belgeler/ekle', belge)).durum, 400);
    const tb = tamam(await talepAc('odeme', 'belge:ekle', belge)).talep;
    tamam(await onayla(tb));
    tamam(await yaz('/finans/belgeler/ekle', { ...belge, onayId: tb.id }));
    const d = tamam(await yaz<{ duzenli: { id: number } }>('/finans/duzenli-odemeler/ekle', { ad: 'Maaşlar', kategori: 'personel', tutar: 2000, ayinGunu: 5 }, 'yonetici')).duzenli;
    const dGovde = { tarih: TARIH, hesapId: h, yontem: 'banka' };
    assert.equal((await yaz(`/finans/duzenli-odemeler/${d.id}/odendi`, dGovde)).durum, 400, 'peşin belge kapıyı atlayamaz');
    const td = tamam(await talepAc('odeme', `duzenli:${d.id}:odendi`, dGovde)).talep;
    tamam(await onayla(td));
    tamam(await yaz(`/finans/duzenli-odemeler/${d.id}/odendi`, { ...dGovde, onayId: td.id }));
    const o = tamam(await yaz<{ odeme: Odeme }>('/finans/odemeler/ekle', { ...odemeGovdesi(f, h, 900) })).odeme;
    const kucukIptal = await yaz(`/finans/odemeler/${o.id}/iptal`, { surum: o.surum, neden: 'Yanlış' });
    assert.equal(kucukIptal.durum, 200, 'iptal eşiğinin altı onaysız geçer');
    const o2 = tamam(await yaz<{ odeme: Odeme }>('/finans/odemeler/ekle', { ...odemeGovdesi(f, h, 950) })).odeme;
    assert.equal(o2.tutar, '950.00');
    tamam(await esikleriYaz('1000', '900', '400'));
    assert.equal((await yaz(`/finans/odemeler/${o2.id}/iptal`, { surum: o2.surum, neden: 'Yanlış' })).durum, 400, 'iptal eşiği 900: 950 onay ister');
  });
  test('ON-10: ikinci onayı Müdür ve Genel Müdür verebilir (göçle gelen yetki); finans.onay-ayar hiçbir role verilmez', async () => {
    const roller = await vt().sorgu<{ kod: string; islem: string }>("SELECT r.kod, ri.islem FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE ri.islem IN ('finans.onay', 'finans.onay-ayar') AND r.kod NOT LIKE 'gecici_%' ORDER BY 1, 2");
    assert.deepEqual(roller.map((x) => `${x.kod}:${x.islem}`), ['genel_mudur:finans.onay', 'mudur:finans.onay']);
  });
});
