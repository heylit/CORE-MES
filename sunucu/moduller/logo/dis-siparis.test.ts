import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { SIPARIS_DUZELTME_DEGISKENI } from './ayar.ts';
import { CORE_SIPARISI_ILETISI, DEGISTI_ILETISI, disDuzeltmeTuru, disSiparisOku } from './dis-siparis.ts';
import { disDuzeltmeIsOrtami } from './isler.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import type { TxAcan } from './servis.ts';

const PAROLA = 'dogru-parola-1';

// Uydurma Logo siparişi (yardımcının içerik cevabı biçimi): dövizli malzeme satırı, kapalı hizmet satırı, açık hizmet satırı.
const disSiparis = (no: string, ref: number): Record<string, unknown> => ({
  logicalRef: ref, number: no, date: '2026-11-02', arpCode: 'ORN-CARI-1', currencyType: 20, rate: 30, status: 4, cancelled: false,
  lines: [
    { logicalRef: ref + 1, type: 0, code: 'ORN-MLZ-1', name: 'Deneme mil', quantity: 10, unitCode: 'ADET', price: 300, currencyPrice: 10, vatRate: 20, dueDate: '2026-11-20', description: 'ilk', closed: false },
    { logicalRef: ref + 2, type: 4, code: 'ORN-HZM-1', name: 'Deneme hizmet', quantity: 1, unitCode: 'ADET', price: 60, currencyPrice: 2, vatRate: 20, dueDate: null, description: null, closed: true },
    { logicalRef: ref + 3, type: 4, code: 'ORN-HZM-2', name: 'Deneme kaplama', quantity: 2, unitCode: 'ADET', price: 90, currencyPrice: 3, vatRate: 20, dueDate: null, description: null, closed: false },
  ],
});
const satirlar = (k: Record<string, unknown>): Record<string, unknown>[] => k['lines'] as Record<string, unknown>[];

describe('D7 Logo\'da açılmış siparişi düzeltme (gerçek PostgreSQL, sahte köprü)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kopru: SahteKopru;
  const cerez: Record<'yonetici' | 'mudur' | 'satinalma', string> = { yonetici: '', mudur: '', satinalma: '' };
  const kisi: Record<'yonetici' | 'mudur', number> = { yonetici: 0, mudur: 0 };
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istemci = () => kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 3000 });
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  const rollu = async (kullaniciAdi: string, rol: string): Promise<number> => {
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }));
    await vt().sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = $2) WHERE kisi_id = $1', [id, rol]);
    return id;
  };
  const ayar = async (anahtar: string, deger: boolean): Promise<void> => {
    const c = await app.inject({
      method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: cerez.yonetici, 'istek-kimligi': randomUUID() }, payload: { deger },
    });
    assert.equal(c.statusCode, 200, `${anahtar}: ${c.body}`);
  };
  const oku = (no: string, kim: keyof typeof cerez = 'mudur') =>
    app.inject({ method: 'GET', url: `/api/logo/dis-siparis?no=${encodeURIComponent(no)}`, headers: { cookie: cerez[kim] } });
  const duzelt = (govde: Record<string, unknown>, kim: keyof typeof cerez = 'mudur') =>
    app.inject({ method: 'POST', url: '/api/logo/dis-siparis/duzelt', headers: { cookie: cerez[kim], 'istek-kimligi': randomUUID() }, payload: govde });
  const tx: () => TxAcan = () => vt();
  const yeniSiparis = (): { no: string; ref: number } => {
    sayac += 1;
    const s = { no: `ORN-DIS-${sayac}`, ref: 990_000 + sayac * 10 };
    kopru.disSiparisler.set(s.no, disSiparis(s.no, s.ref));
    return s;
  };
  const okuVeIz = async (no: string): Promise<string> => {
    const r = await disSiparisOku(tx(), istemci(), kisi.mudur, no);
    assert.equal(r.durum, 'tamam', JSON.stringify(r));
    assert.ok(r.iz);
    return r.iz;
  };
  const tur = (acik = true) => disDuzeltmeTuru(tx(), { kopru: istemci(), acik: () => acik, saat: () => new Date('2026-11-11T12:00:00Z') });
  const kayit = (id: number) => vt().tek<{ durum: string; hata: string | null; ozet: unknown; govde: Record<string, unknown> | null; logo_kayit_no: number | null }>(
    'SELECT durum, hata, ozet, govde, logo_kayit_no FROM logo_dis_siparis_duzeltme WHERE id = $1', [id]);

  before(async () => {
    ortam = await testVeritabaniKur('logodis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisi.yonetici = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ld-yonetici', parola: PAROLA }));
    kisi.mudur = await rollu('ld-mudur', 'satin_alma_muduru');
    await rollu('ld-satinalma', 'satin_alma');
    cerez.yonetici = await giris('ld-yonetici');
    cerez.mudur = await giris('ld-mudur');
    cerez.satinalma = await giris('ld-satinalma');
    kopru = await sahteKopruAc();
    await ayar('logo.baglanti', true);
  });
  after(async () => { await kopru?.kapat(); await app?.close(); await ortam?.kaldir(); });
  beforeEach(() => { kopru.senaryo = 'basari'; process.env[SIPARIS_DUZELTME_DEGISKENI] = 'acik'; });
  afterEach(async () => {
    delete process.env[SIPARIS_DUZELTME_DEGISKENI];
    await vt().sorgu("UPDATE logo_dis_siparis_duzeltme SET durum = 'hata', hata = 'test sonu', sonuc_zamani = now() WHERE durum = 'bekliyor'");
  });

  test('yetki: işlemi olmayan 403; Satın Alma Müdürü ve yönetici geçer; anahtar kapalıyken uçlar 404', async () => {
    const { no } = yeniSiparis();
    const govde = { no, iz: 'a'.repeat(64), satirlar: [], yeniSatirlar: [], tarih: '2026-11-05' };
    assert.equal((await oku(no, 'satinalma')).statusCode, 403);
    assert.equal((await duzelt(govde, 'satinalma')).statusCode, 403);
    // Uç köprü değişkeni olmadan koşar (test süreci): okuma "ortam-degiskeni-yok" der, istek atmaz.
    const c = await oku(no, 'mudur');
    assert.equal(c.statusCode, 200, c.body);
    assert.equal(c.json().durum, 'ortam-degiskeni-yok');
    assert.equal((await oku(no, 'yonetici')).statusCode, 200);
    delete process.env[SIPARIS_DUZELTME_DEGISKENI];
    assert.equal((await oku(no, 'mudur')).statusCode, 404);
    assert.equal((await duzelt(govde, 'mudur')).statusCode, 404);
    assert.equal((await app.inject({ method: 'GET', url: `/api/logo/dis-siparis/duzeltmeler?no=${no}`, headers: { cookie: cerez.mudur } })).statusCode, 404);
    process.env[SIPARIS_DUZELTME_DEGISKENI] = 'evet';
    assert.equal((await oku(no, 'mudur')).statusCode, 404, 'yalnız "acik" açar');
  });

  test('okuma fiyatlı içeriği ve izi döner; her okuma deftere fiyatsız yazılır', async () => {
    const { no, ref } = yeniSiparis();
    const once = Number((await vt().tek<{ n: string }>("SELECT count(*) AS n FROM denetim_kaydi WHERE yol = '/logo/dis-siparis'"))?.n);
    const r = await disSiparisOku(tx(), istemci(), kisi.mudur, no);
    assert.equal(r.durum, 'tamam');
    assert.equal(r.siparis?.ref, ref);
    assert.equal(r.siparis?.satirlar[0]?.dovizFiyati, '10');
    assert.match(r.iz ?? '', /^[0-9a-f]{64}$/);
    const yok = await disSiparisOku(tx(), istemci(), kisi.mudur, 'ORN-YOK-1');
    assert.equal(yok.durum, 'yok');
    const defter = await vt().sorgu<Record<string, unknown>>(
      "SELECT kisi_id, yontem, parametre, govde, modul, yetki FROM denetim_kaydi WHERE yol = '/logo/dis-siparis' ORDER BY id");
    assert.equal(defter.length, once + 2);
    // Satırın tamamı tam eşitlikle: fiyatlı içerik (fiyat, dovizFiyati) ne gövdeye ne parametreye girer; "okundu" kaydı dahil.
    const satir = (sonuc: string, fis: string) =>
      ({ kisi_id: kisi.mudur, yontem: 'GET', parametre: { no: fis, sonuc }, govde: null, modul: 'logo', yetki: 'logo.siparis-duzelt' });
    assert.deepEqual(defter.slice(-2), [satir('okundu', no), satir('yok', 'ORN-YOK-1')]);
    const metin = JSON.stringify(defter.slice(-2));
    for (const fiyatIzi of ['fiyat', 'dovizFiyati', 'price', '300', 'satirlar']) assert.equal(metin.includes(fiyatIzi), false, fiyatIzi);
  });

  test('CORE MES\'in kendi siparişi okunmaz ve düzeltilmez (422, CORE verisi dönmez)', async () => {
    const { no, ref } = yeniSiparis();
    await vt().sorgu("INSERT INTO logo_giden (belge_turu, belge_no, son_deneme, son_sonuc, logo_kayit_no) VALUES ('siparis', $1, now(), 'gonderildi', $2)", [ref, String(ref)]);
    await assert.rejects(disSiparisOku(tx(), istemci(), kisi.mudur, no), (h: unknown) => h instanceof UygulamaHatasi && h.message === CORE_SIPARISI_ILETISI);
    const ikinci = yeniSiparis();
    await vt().sorgu('INSERT INTO logo_siparis_no (belge_no, siparis_no) VALUES ($1, $2)', [ikinci.ref, ikinci.no]);
    const c = await duzelt({ no: ikinci.no, iz: 'a'.repeat(64), satirlar: [{ ref: ikinci.ref + 1, miktar: '11' }], yeniSatirlar: [] });
    assert.equal(c.statusCode, 422, c.body);
    assert.deepEqual(c.json(), { kod: 'GECERSIZ', mesaj: CORE_SIPARISI_ILETISI });
  });

  test('uçtan uca: okunan siparişte miktar ve fiyat değişir, satır kapanır, yeni satır eklenir; durum ve cari okunduğu gibi', async () => {
    const { no, ref } = yeniSiparis();
    const iz = await okuVeIz(no);
    const c = await duzelt({
      no, iz, satirlar: [{ ref: ref + 1, miktar: '12', fiyat: '11.5' }, { ref: ref + 3, kapat: true }],
      yeniSatirlar: [{ hizmet: false, kod: 'ORN-MLZ-9', miktar: '3', fiyat: '4', birim: 'adet', kdv: 20 }],
    });
    assert.equal(c.statusCode, 200, c.body);
    const id = c.json().kayit.id as number;
    assert.equal(c.json().kayit.durum, 'bekliyor');
    assert.equal((await duzelt({ no, iz, satirlar: [{ ref: ref + 1, miktar: '13' }], yeniSatirlar: [] })).statusCode, 409, 'aynı fişe ikinci bekleyen düzeltme');
    assert.deepEqual(await tur(), { tur: 'dis-duzeltme', no: id, sonuc: 'gonderildi' });
    const giden = kopru.disGuncellemeler.at(-1);
    assert.ok(giden);
    assert.equal(giden['logicalRef'], ref);
    assert.equal(giden['arpCode'], 'ORN-CARI-1');
    assert.equal('orderStatus' in giden, false);
    assert.equal(giden['externalOrder'], true, 'yardımcı birimi okunamayan satırı yazmasın diye ayırıcı gider (3007)');
    const logo = kopru.disSiparisler.get(no);
    assert.ok(logo);
    assert.deepEqual(satirlar(logo).map((s) => [s['logicalRef'], s['quantity'], s['currencyPrice'], s['closed']]).slice(0, 3), [
      [ref + 1, 12, 11.5, false], [ref + 2, 1, 2, true], [ref + 3, 2, 3, true],
    ]);
    assert.equal(satirlar(logo).length, 4);
    const k = await kayit(id);
    assert.equal(k?.durum, 'gonderildi');
    assert.equal(k?.logo_kayit_no, ref);
    assert.deepEqual(k?.ozet, { tarih: false, degisen: [ref + 1], kapanan: [ref + 3], yeni: 1 });
    const liste = await app.inject({ method: 'GET', url: `/api/logo/dis-siparis/duzeltmeler?no=${no}`, headers: { cookie: cerez.mudur } });
    assert.equal(liste.statusCode, 200, liste.body);
    assert.equal(liste.json().kayitlar[0].durum, 'gonderildi');
    assert.equal(liste.body.includes('11.5'), false, 'liste fiyat taşımaz');
    assert.deepEqual(await tur(), { tur: 'bos' });
  });

  test('okumadan sonra Logo\'da değişen sipariş yazılmaz; iptal edilmiş sipariş ve kapalı satır reddedilir', async () => {
    const a = yeniSiparis();
    const izA = await okuVeIz(a.no);
    const c = await duzelt({ no: a.no, iz: izA, satirlar: [{ ref: a.ref + 1, miktar: '15' }], yeniSatirlar: [] });
    assert.equal(c.statusCode, 200, c.body);
    satirlar(kopru.disSiparisler.get(a.no)!)[0]!['quantity'] = 9;
    const sayi = kopru.disGuncellemeler.length;
    assert.equal((await tur()).tur, 'dis-duzeltme');
    assert.deepEqual([(await kayit(c.json().kayit.id))?.durum, (await kayit(c.json().kayit.id))?.hata], ['reddedildi', DEGISTI_ILETISI]);
    assert.equal(kopru.disGuncellemeler.length, sayi, 'yazma isteği gitmedi');

    const b = yeniSiparis();
    kopru.disSiparisler.get(b.no)!['cancelled'] = true;
    const izB = await okuVeIz(b.no);
    const cb = await duzelt({ no: b.no, iz: izB, tarih: '2026-11-06', satirlar: [], yeniSatirlar: [] });
    await tur();
    assert.match((await kayit(cb.json().kayit.id))?.hata ?? '', /İptal/);

    const d = yeniSiparis();
    const izD = await okuVeIz(d.no);
    const cd = await duzelt({ no: d.no, iz: izD, satirlar: [{ ref: d.ref + 2, miktar: '5' }], yeniSatirlar: [] });
    await tur();
    assert.match((await kayit(cd.json().kayit.id))?.hata ?? '', /Kapalı satır/);
    assert.equal(kopru.disGuncellemeler.length, sayi);
  });

  test('yardımcının reddi iş kaydına yazılır, gönderilen gövde saklanır', async () => {
    const { no, ref } = yeniSiparis();
    const iz = await okuVeIz(no);
    const c = await duzelt({ no, iz, satirlar: [{ ref: ref + 1, miktar: '11' }], yeniSatirlar: [] });
    kopru.senaryo = 'dogrulama';
    await tur();
    const k = await kayit(c.json().kayit.id);
    assert.equal(k?.durum, 'reddedildi');
    assert.ok(k?.govde, 'reddedilen gövde iz için saklanır');
  });

  test('sonucu bilinmeyen gönderim yinelenmez ("hata"); anahtar kapalıyken iş istek atmaz', async () => {
    const { no, ref } = yeniSiparis();
    const iz = await okuVeIz(no);
    const c = await duzelt({ no, iz, satirlar: [{ ref: ref + 1, miktar: '11' }], yeniSatirlar: [] });
    const istek = kopru.istekler.length;
    assert.deepEqual(await tur(false), { tur: 'dis-duzeltme-kapali' });
    assert.equal(kopru.istekler.length, istek);
    kopru.senaryo = 'cevap-kayboldu';
    assert.deepEqual(await tur(), { tur: 'dis-duzeltme', no: c.json().kayit.id, sonuc: 'hata' });
    const k = await kayit(c.json().kayit.id);
    assert.match(k?.hata ?? '', /kendiliğinden yinelenmez/);
    assert.deepEqual(await tur(), { tur: 'bos' });
  });

  test('kayıtlı iş anahtarı her turda okur: kuyruğa girmiş düzeltme anahtar kapanınca gitmez, açılınca gider', async () => {
    const { no, ref } = yeniSiparis();
    const iz = await okuVeIz(no);
    const c = await duzelt({ no, iz, satirlar: [{ ref: ref + 1, miktar: '12' }], yeniSatirlar: [] });
    assert.equal(c.statusCode, 200, c.body);
    const ortami = disDuzeltmeIsOrtami(istemci());
    const istek = kopru.istekler.length;
    delete process.env[SIPARIS_DUZELTME_DEGISKENI];
    assert.deepEqual(await disDuzeltmeTuru(tx(), ortami), { tur: 'dis-duzeltme-kapali' });
    assert.equal(kopru.istekler.length, istek, 'anahtar kapalıyken Logo\'ya istek yok');
    process.env[SIPARIS_DUZELTME_DEGISKENI] = 'acik';
    assert.deepEqual(await disDuzeltmeTuru(tx(), ortami), { tur: 'dis-duzeltme', no: c.json().kayit.id, sonuc: 'gonderildi' });
  });

  test('istemcinin gönderdiği kayıt numarası yok sayılır; gövdedeki numara Logo okumasındandır (G2)', async () => {
    const { no, ref } = yeniSiparis();
    const iz = await okuVeIz(no);
    const c = await duzelt({ no, iz, logicalRef: 1, satirlar: [{ ref: ref + 1, miktar: '11' }], yeniSatirlar: [] });
    assert.equal(c.statusCode, 200, c.body);
    await tur();
    assert.equal(kopru.disGuncellemeler.at(-1)?.['logicalRef'], ref);
  });
});
