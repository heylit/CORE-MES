import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { KAYIT_TURLERI, SABLON_TURLERI } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import type { BasCevabi, BaskilarCevabi, CiktiCevabi, EtiketlerCevabi, IndirCevabi, KayitCiktiCevabi, SablonlarCevabi, Yazici, YazicilarCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';

const PAROLA = 'dogru-parola-1';

interface Rol { id: number; yonetici: boolean | null }

describe('etiket-merkezi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yetkisiz = '';
  let yoneticiId = 0;

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  const al = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  const yaz = (cerez: string, url: string, payload: object, kimlik = randomUUID()) =>
    app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: kimlik }, payload });
  const DOSYA = { ad: 'Argox depo', dil: 'pplb', dpi: 203, baglanti: 'dosya', adres: null };
  const AG = { ad: 'Zebra kabul', dil: 'zpl', dpi: 203, baglanti: 'ag', adres: '127.0.0.1' };

  // Tek işlem taşıyan yerleşik rol yok: geçici rol doğrudan yazılır; kişi uygulamanın kendi atama işleviyle alır.
  async function tekIslemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const vt = ortam!.vt;
    const rol = await vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, id, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, id, r.id);
    });
    return girisCerezi(kullaniciAdi);
  }

  // Yazıcının yerine 127.0.0.1:9100'de dinleyen sahte yazıcı: gelen baytları toplar.
  async function sahteYazici(): Promise<{ gelen: () => string; kapat: () => Promise<void> }> {
    let veri = '';
    const sunucu: Server = createServer((s) => { s.on('data', (p) => { veri += p.toString('utf8'); }); });
    await new Promise<void>((coz, reddet) => { sunucu.once('error', reddet); sunucu.listen(9100, '127.0.0.1', () => coz()); });
    return { gelen: () => veri, kapat: () => new Promise((coz) => { sunucu.close(() => coz()); }) };
  }
  const bekle = async (kosul: () => boolean) => { for (let i = 0; i < 50 && !kosul(); i++) await new Promise((c) => setTimeout(c, 20)); };

  before(async () => {
    ortam = await testVeritabaniKur('etiket_merkezi');
    const vt = ortam.vt;
    app = await uygulamaKur({ vt, ayar: ortam.ayar, kimlik: kimlikCozucu(vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
    const roller = ((await al(yonetici, '/roller')).json() as { roller: Rol[] }).roller;
    const bayraksiz = roller.find((r) => r.yonetici === false);
    if (!bayraksiz) throw new Error('Bütün işlemleri vermeyen rol yok; yetkisiz kişi kurulamadı.');
    // Kişi yönetici rolüyle doğar; yönetici olmayan rol uygulamanın kendi atama işleviyle verilir. İşlemler henüz hiçbir role verilmedi.
    await vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'yetkisiz', parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, id, bayraksiz.id);
      for (const rol of kisi.roller) if (rol.id !== bayraksiz.id) await rolAl(db, yoneticiId, id, rol.id);
    });
    yetkisiz = await girisCerezi('yetkisiz');
  });

  after(async () => { delete process.env['TMIV2_ETIKET_YAZICI_AGI']; await ortam?.kaldir(); });

  test('EM-U1: hazır şablonları sayfayı gören okur; sayfası olmayan 403 alır', async () => {
    const cevap = await al(yonetici, '/etiket-merkezi/sablonlar');
    assert.equal(cevap.statusCode, 200);
    const govde = cevap.json() as SablonlarCevabi;
    for (const tur of ['konum', 'malzeme', 'lot', 'refakat', 'istasyon', 'deneme']) {
      assert.equal(govde.sablonlar.some((s) => s.tur === tur), true, tur);
      assert.equal((govde.alanlar[tur as keyof typeof govde.alanlar] ?? []).some((a) => a.anahtar === 'qr'), true, tur);
    }
    assert.deepEqual(govde.secenekler.diller.map((d) => d.deger), ['zpl', 'pplb']);
    assert.equal(govde.secenekler.enCokAdet, 500);
    assert.equal((await al(yetkisiz, '/etiket-merkezi/sablonlar')).statusCode, 403);
    assert.equal((await al(yetkisiz, '/etiket-merkezi/sablonlar/lot-100x50/cikti?dil=zpl&dpi=203')).statusCode, 403);
  });

  test('EM-U2: çıktı seçilen dilde, ölçüde ve adette komut ile aynı yerleşimden önizleme döner', async () => {
    const z = (await al(yonetici, '/etiket-merkezi/sablonlar/lot-100x50/cikti?dil=zpl&dpi=203&adet=2')).json() as CiktiCevabi;
    assert.equal(z.dosyaAdi, 'lot-100x50-203.zpl');
    assert.match(z.komut, /^\^XA\n\^CI28\n\^PW799\n\^LL400\n/);
    assert.match(z.komut, /\^PQ2\n\^XZ\n$/);
    assert.equal(z.onizleme.some((o) => o.tur === 'qr' && o.veri === 'LOT:LT-000123'), true);

    const p = (await al(yonetici, '/etiket-merkezi/sablonlar/lot-100x50/cikti?dil=pplb&dpi=300&sade=true')).json() as CiktiCevabi;
    assert.equal(p.dosyaAdi, 'lot-100x50-300.prn');
    assert.match(p.komut, /^\nN\nq1181\nQ591,35\n/);
    assert.match(p.komut, /\nP1\n$/);
    assert.equal(/[çğıöşüÇĞİÖŞÜ]/.test(p.komut), false);
  });

  test('EM-U3: deneme şablonu yazıcı dilini ve çözünürlüğü etikete yazar', async () => {
    const c = (await al(yonetici, '/etiket-merkezi/sablonlar/deneme-50x25/cikti?dil=pplb&dpi=203')).json() as CiktiCevabi;
    assert.equal(c.onizleme.some((o) => o.tur === 'metin' && o.satirlar.join(' ').includes('Argox (PPLB) · 203 dpi')), true);
  });

  test('EM-U4: bilinmeyen şablon 404, sınır dışı adet ve dil 400', async () => {
    assert.equal((await al(yonetici, '/etiket-merkezi/sablonlar/olmayan/cikti?dil=zpl&dpi=203')).statusCode, 404);
    assert.equal((await al(yonetici, '/etiket-merkezi/sablonlar/lot-100x50/cikti?dil=zpl&dpi=203&adet=501')).statusCode, 400);
    assert.equal((await al(yonetici, '/etiket-merkezi/sablonlar/lot-100x50/cikti?dil=zpl&dpi=203&adet=0')).statusCode, 400);
    assert.equal((await al(yonetici, '/etiket-merkezi/sablonlar/lot-100x50/cikti?dil=ppla&dpi=203')).statusCode, 400);
    assert.equal((await al(yonetici, '/etiket-merkezi/sablonlar/lot-100x50/cikti?dil=zpl&dpi=600')).statusCode, 400);
    assert.equal((await al(yonetici, '/etiket-merkezi/sablonlar/lot-100x50/cikti?dil=zpl&dpi=203&adet=500')).statusCode, 200);
  });

  test('EM-U5: yazıcı tanımı yazici-yaz ister; okuma oku ister; dosya yazıcısı adressiz kaydedilir ve sürümle güncellenir', async () => {
    const okuyan = await tekIslemliKisi('okuyan', ['etiket-merkezi.oku']);
    assert.equal((await yaz(okuyan, '/etiket-merkezi/yazicilar/ac', DOSYA)).statusCode, 403);
    assert.equal((await yaz(yetkisiz, '/etiket-merkezi/yazicilar/ac', DOSYA)).statusCode, 403);
    assert.equal((await al(yetkisiz, '/etiket-merkezi/yazicilar')).statusCode, 403);
    const acilan = await yaz(yonetici, '/etiket-merkezi/yazicilar/ac', DOSYA);
    assert.equal(acilan.statusCode, 200, acilan.body);
    const y = acilan.json() as Yazici;
    assert.deepEqual({ ...y, id: 0 }, { id: 0, ad: 'Argox depo', dil: 'pplb', dpi: 203, baglanti: 'dosya', adres: null, sade: false, aktif: true, surum: 1 });
    assert.equal((await yaz(yonetici, '/etiket-merkezi/yazicilar/ac', DOSYA)).statusCode, 409);
    const liste = (await al(okuyan, '/etiket-merkezi/yazicilar')).json() as YazicilarCevabi;
    assert.equal(liste.yazicilar.some((x) => x.id === y.id), true);
    assert.equal(liste.dogrudanBaski.acik, false);
    const guncel = await yaz(yonetici, `/etiket-merkezi/yazicilar/${String(y.id)}/guncelle`, { ...DOSYA, sade: true, aktif: true, surum: 1 });
    assert.equal(guncel.statusCode, 200, guncel.body);
    assert.equal((guncel.json() as Yazici).surum, 2);
    assert.equal((await yaz(yonetici, `/etiket-merkezi/yazicilar/${String(y.id)}/guncelle`, { ...DOSYA, aktif: true, surum: 1 })).statusCode, 409);
  });

  test('EM-U6: ağ yazıcısı aralık tanımlı değilken ve aralık dışındaki adresle reddedilir, içindeki adresle kaydedilir', async () => {
    delete process.env['TMIV2_ETIKET_YAZICI_AGI'];
    const tanimsiz = await yaz(yonetici, '/etiket-merkezi/yazicilar/ac', { ...AG, ad: 'Aralıksız' });
    assert.equal(tanimsiz.statusCode, 400);
    process.env['TMIV2_ETIKET_YAZICI_AGI'] = '127.0.0.1/32';
    for (const adres of ['127.0.0.2', '10.0.5.20', '8.8.8.8', 'yazici.ornek.com']) {
      const red = await yaz(yonetici, '/etiket-merkezi/yazicilar/ac', { ...AG, ad: `Dış ${adres}`, adres });
      assert.equal(red.statusCode, 400, adres);
    }
    const kabul = await yaz(yonetici, '/etiket-merkezi/yazicilar/ac', AG);
    assert.equal(kabul.statusCode, 200, kabul.body);
    assert.equal((kabul.json() as Yazici).adres, '127.0.0.1');
  });

  test('EM-U7: doğrudan baskı ayar kapalıyken reddedilir; açıkken deneme etiketi yazıcıya gider, deftere yazılır, yineleme ikinci baskı açmaz', async () => {
    process.env['TMIV2_ETIKET_YAZICI_AGI'] = '127.0.0.1/32';
    const yazicilarim = ((await al(yonetici, '/etiket-merkezi/yazicilar')).json() as YazicilarCevabi).yazicilar;
    const ag = yazicilarim.find((x) => x.ad === AG.ad);
    const dosya = yazicilarim.find((x) => x.ad === DOSYA.ad);
    assert.ok(ag && dosya);
    const kapali = await yaz(yonetici, '/etiket-merkezi/sablonlar/deneme-50x25/bas', { yaziciId: ag.id, adet: 1 });
    assert.equal(kapali.statusCode, 400);
    assert.equal((await yaz(yonetici, '/ayarlar/etiket-merkezi.dogrudan-baski/degistir', { deger: true })).statusCode, 200);
    assert.equal(((await al(yonetici, '/etiket-merkezi/yazicilar')).json() as YazicilarCevabi).dogrudanBaski.acik, true);

    const basan = await tekIslemliKisi('basan', ['etiket-merkezi.bas']);
    const okuyan2 = await tekIslemliKisi('okuyan2', ['etiket-merkezi.oku']);
    assert.equal((await yaz(okuyan2, '/etiket-merkezi/sablonlar/deneme-50x25/bas', { yaziciId: ag.id, adet: 1 })).statusCode, 403);
    assert.equal((await yaz(basan, '/etiket-merkezi/sablonlar/lot-100x50/bas', { yaziciId: ag.id, adet: 1 })).statusCode, 400);
    assert.equal((await yaz(basan, '/etiket-merkezi/sablonlar/deneme-50x25/bas', { yaziciId: dosya.id, adet: 1 })).statusCode, 400);
    assert.equal((await yaz(basan, '/etiket-merkezi/sablonlar/deneme-50x25/bas', { yaziciId: ag.id, adet: 501 })).statusCode, 400);

    const yazici = await sahteYazici();
    const tekrarKimligi = randomUUID();
    try {
      const ilk = await yaz(basan, '/etiket-merkezi/sablonlar/deneme-50x25/bas', { yaziciId: ag.id, adet: 2 }, tekrarKimligi);
      assert.equal(ilk.statusCode, 200, ilk.body);
      const cevap = ilk.json() as BasCevabi;
      assert.equal(cevap.sonuc, 'gonderildi');
      await bekle(() => yazici.gelen().endsWith('^XZ\n'));
      assert.match(yazici.gelen(), /^\^XA\n\^CI28\n\^PW400\n\^LL200\n/);
      assert.match(yazici.gelen(), /\^PQ2\n\^XZ\n$/);
      const yineleme = await yaz(basan, '/etiket-merkezi/sablonlar/deneme-50x25/bas', { yaziciId: ag.id, adet: 2 }, tekrarKimligi);
      assert.equal((yineleme.json() as BasCevabi).baskiId, cevap.baskiId);
    } finally {
      await yazici.kapat();
    }
    const kayitlar = await ortam!.vt.sorgu<{ sonuc: string }>("SELECT sonuc FROM etiket_merkezi_baski WHERE sonuc = 'gonderildi'");
    assert.equal(kayitlar.length, 1);
  });

  test('EM-U8: ulaşılamayan yazıcı "hata" sonucuyla deftere yazılır, ileti adres taşımaz; defter değişmez ve okuma oku ister', async () => {
    process.env['TMIV2_ETIKET_YAZICI_AGI'] = '127.0.0.1/32';
    const ag = ((await al(yonetici, '/etiket-merkezi/yazicilar')).json() as YazicilarCevabi).yazicilar.find((x) => x.ad === AG.ad);
    assert.ok(ag);
    const c = await yaz(yonetici, '/etiket-merkezi/sablonlar/deneme-100x50/bas', { yaziciId: ag.id, adet: 1 });
    assert.equal(c.statusCode, 200, c.body);
    const cevap = c.json() as BasCevabi;
    assert.equal(cevap.sonuc, 'hata');
    assert.equal(cevap.ileti?.includes('127.0.0.1'), false);
    const defter = (await al(yonetici, '/etiket-merkezi/baskilar')).json() as BaskilarCevabi;
    assert.equal(defter.baskilar[0]?.id, cevap.baskiId);
    assert.equal(defter.baskilar[0]?.kisi, 'Deneme Yönetici');
    assert.equal(defter.baskilar.some((b) => b.sonuc === 'gonderildi' && b.adet === 2), true);
    assert.equal((await al(yetkisiz, '/etiket-merkezi/baskilar')).statusCode, 403);
    await assert.rejects(ortam!.vt.sorgu('DELETE FROM etiket_merkezi_baski'));
  });

  // Konum stokun tablosudur; test kendi konumlarını doğrudan açar (stokta konum açan ortak işlev yok).
  async function konumAc(kod: string): Promise<number> {
    const k = await ortam!.vt.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, $1, 'depo_zemini' FROM stok_depo WHERE kod = 'ANA' RETURNING id", [kod],
    );
    if (!k) throw new Error('Konum açılamadı.');
    return k.id;
  }

  test('EM-U9: seçili konumların etiketi stok konum koduyla, istenen sırada çıkar; bulunamayan kimlik eksiklerde döner; oku ister', async () => {
    const a = await konumAc('ETK-A01');
    const b = await konumAc('ETK-B02');
    const yok = 2147483000;
    const adres = (anahtar: string, id: string, ek = '') => `/etiket-merkezi/sablonlar/${anahtar}/kayit-cikti?dil=zpl&dpi=203&tur=konum&id=${id}${ek}`;
    const c = await al(yonetici, adres('konum-100x50', `${b},${a},${b},${yok}`, '&adet=2'));
    assert.equal(c.statusCode, 200, c.body);
    const cevap = c.json() as KayitCiktiCevabi;
    assert.deepEqual(cevap.kayitlar, [{ id: b, baslik: 'ETK-B02' }, { id: a, baslik: 'ETK-A01' }]);
    assert.deepEqual(cevap.eksikler, [yok]);
    assert.equal(cevap.komut.match(/\^XA/g)?.length, 2);
    assert.equal(cevap.komut.match(/\^PQ2\n/g)?.length, 2);
    assert.ok(cevap.komut.indexOf('ETK-B02') < cevap.komut.indexOf('ETK-A01'));
    assert.equal(cevap.onizleme.find((o) => o.tur === 'qr')?.tur === 'qr' ? (cevap.onizleme.find((o) => o.tur === 'qr') as { veri: string }).veri : null, 'LOC:ETK-B02');

    assert.equal((await al(yonetici, adres('lot-100x50', String(a)))).statusCode, 400);
    assert.equal((await al(yonetici, adres('konum-100x50', String(yok)))).statusCode, 404);
    assert.equal((await al(yonetici, adres('konum-100x50', 'a,1'))).statusCode, 400);
    assert.equal((await al(yonetici, adres('konum-100x50', String(a), '&adet=500') + `,${b}`)).statusCode, 400);
    const okuyan = await tekIslemliKisi('kayitokur', ['etiket-merkezi.oku']);
    assert.equal((await al(okuyan, adres('konum-50x25', String(a)))).statusCode, 200);
    const sayfaci = await tekIslemliKisi('sayfaci', ['sayfa.etiket-merkezi']);
    assert.equal((await al(sayfaci, adres('konum-50x25', String(a)))).statusCode, 403);
  });

  test('EM-U10: konum etiketi ağ yazıcısına gider; basılan konumlar baskıya bağlı yazılır, örnek değerli konum etiketi basılmaz', async () => {
    process.env['TMIV2_ETIKET_YAZICI_AGI'] = '127.0.0.1/32';
    const ag = ((await al(yonetici, '/etiket-merkezi/yazicilar')).json() as YazicilarCevabi).yazicilar.find((x) => x.ad === AG.ad);
    assert.ok(ag);
    const a = await konumAc('ETK-C03');
    const yok = 2147483001;
    assert.equal((await yaz(yonetici, '/etiket-merkezi/sablonlar/konum-50x25/bas', { yaziciId: ag.id, adet: 1 })).statusCode, 400);
    assert.equal((await yaz(yonetici, '/etiket-merkezi/sablonlar/deneme-50x25/bas', { yaziciId: ag.id, adet: 1, kayit: { tur: 'konum', idler: [a] } })).statusCode, 400);
    const yazici = await sahteYazici();
    let baskiId = 0;
    try {
      const c = await yaz(yonetici, '/etiket-merkezi/sablonlar/konum-50x25/bas', { yaziciId: ag.id, adet: 1, kayit: { tur: 'konum', idler: [a, yok] } });
      assert.equal(c.statusCode, 200, c.body);
      const cevap = c.json() as BasCevabi;
      assert.equal(cevap.sonuc, 'gonderildi');
      baskiId = cevap.baskiId;
      await bekle(() => yazici.gelen().endsWith('^XZ\n'));
      assert.match(yazici.gelen(), /\^FDETK-C03\^FS/);
    } finally {
      await yazici.kapat();
    }
    const kayitlar = await ortam!.vt.sorgu<{ kaynak_tur: string; kaynak_id: number }>(
      'SELECT kaynak_tur, kaynak_id FROM etiket_merkezi_baski_kaydi WHERE baski_id = $1', [baskiId],
    );
    assert.deepEqual(kayitlar, [{ kaynak_tur: 'konum', kaynak_id: a }]);
    const defter = (await al(yonetici, '/etiket-merkezi/baskilar')).json() as BaskilarCevabi;
    assert.equal(defter.baskilar.find((b) => b.id === baskiId)?.kayitSayisi, 1);
    await assert.rejects(ortam!.vt.sorgu('DELETE FROM etiket_merkezi_baski_kaydi'));
  });

  test('EM-U11: dosya yazıcısının komut dosyası yazıcının dili ve çözünürlüğüyle iner ve "indirildi" diye deftere yazılır; ağ yazıcısı ve oku yetkisi indiremez', async () => {
    const yazicilarim = ((await al(yonetici, '/etiket-merkezi/yazicilar')).json() as YazicilarCevabi).yazicilar;
    const ag = yazicilarim.find((x) => x.ad === AG.ad);
    const dosya = yazicilarim.find((x) => x.ad === DOSYA.ad);
    assert.ok(ag && dosya);
    const a = await konumAc('ETK-D04');
    const yok = 2147483002;
    const basan = await tekIslemliKisi('indiren', ['etiket-merkezi.bas']);
    const okuyan = await tekIslemliKisi('indiremez', ['etiket-merkezi.oku']);
    const govde = { yaziciId: dosya.id, adet: 3, kayit: { tur: 'konum', idler: [a, yok] } };
    assert.equal((await yaz(okuyan, '/etiket-merkezi/sablonlar/konum-50x25/indir', govde)).statusCode, 403);
    assert.equal((await yaz(basan, '/etiket-merkezi/sablonlar/konum-50x25/indir', { ...govde, yaziciId: ag.id })).statusCode, 400);
    assert.equal((await yaz(basan, '/etiket-merkezi/sablonlar/konum-50x25/indir', { yaziciId: dosya.id, adet: 1 })).statusCode, 400);

    const tekrarKimligi = randomUUID();
    const c = await yaz(basan, '/etiket-merkezi/sablonlar/konum-50x25/indir', govde, tekrarKimligi);
    assert.equal(c.statusCode, 200, c.body);
    const cevap = c.json() as IndirCevabi;
    assert.equal(cevap.dosyaAdi, 'konum-50x25-203.prn');
    assert.match(cevap.komut, /ETK-D04/);
    assert.match(cevap.komut, /^\nN\n/);
    const yineleme = await yaz(basan, '/etiket-merkezi/sablonlar/konum-50x25/indir', govde, tekrarKimligi);
    assert.equal((yineleme.json() as IndirCevabi).baskiId, cevap.baskiId);

    const defter = (await al(yonetici, '/etiket-merkezi/baskilar')).json() as BaskilarCevabi;
    const satir = defter.baskilar.find((b) => b.id === cevap.baskiId);
    assert.deepEqual(satir && { yazici: satir.yazici, sonuc: satir.sonuc, adet: satir.adet, kayitSayisi: satir.kayitSayisi, hata: satir.hata },
      { yazici: DOSYA.ad, sonuc: 'indirildi', adet: 3, kayitSayisi: 1, hata: null });
    const deneme = await yaz(basan, '/etiket-merkezi/sablonlar/deneme-50x25/indir', { yaziciId: dosya.id, adet: 1 });
    assert.equal(deneme.statusCode, 200, deneme.body);
  });

  // Parti ve istasyon sahiplerinin tablolarıdır; test kendi kayıtlarını doğrudan açar.
  async function partiAc(lotKodu: string): Promise<number> {
    const sahip = ortam!.sahip;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ETK-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'ETK-', (SELECT count(*) + 1 FROM malzeme_katalog_karti WHERE onek = 'ETK-'), 'aktif', $2, $3, $3) RETURNING no`,
      [`etk-${lotKodu}`, JSON.stringify({ id: `etk-${lotKodu}`, com: { ad: 'Deneme mil' } }), yoneticiId],
    );
    const p = await sahip.tek<{ id: number }>(
      "INSERT INTO stok_parti (malzeme_id, tedarikci_parti_no, lot_no, acan_kisi_id) VALUES ($1, $2, 'LT-' || $2, $3) RETURNING id::int AS id", [kart?.no, lotKodu, yoneticiId],
    );
    if (!p) throw new Error('Parti açılamadı.');
    return p.id;
  }
  async function istasyonAc(kod: string, konumKodu: string | null): Promise<number> {
    const sahip = ortam!.sahip;
    const im = await sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`M${kod}`, 'Deneme merkezi']);
    const ist = await sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [kod, `Deneme tezgâhı ${kod}`, im?.id]);
    if (!ist) throw new Error('İstasyon açılamadı.');
    if (konumKodu !== null) {
      await sahip.sorgu(
        "INSERT INTO stok_konum (depo_id, kod, tur, istasyon_id) SELECT id, $1, 'istasyon', $2 FROM stok_depo WHERE kod = 'ANA'", [konumKodu, ist.id],
      );
    }
    return ist.id;
  }

  test('EM-U12: lot etiketi stoktaki lottan, istasyon etiketi istasyonun stok konum kodundan çıkar; konumsuz istasyon eksikte kalır; basılanlar deftere bağlanır', async () => {
    const parti = await partiAc('P-ETK-1');
    const ist = await istasyonAc('ETKIST1', 'ETK-IST1');
    const konumsuz = await istasyonAc('ETKIST2', null);
    const adres = (anahtar: string, tur: string, id: string) => `/etiket-merkezi/sablonlar/${anahtar}/kayit-cikti?dil=zpl&dpi=203&tur=${tur}&id=${id}`;

    const lot = await al(yonetici, adres('lot-100x50', 'lot', `${parti},2147483003`));
    assert.equal(lot.statusCode, 200, lot.body);
    const lc = lot.json() as KayitCiktiCevabi;
    assert.deepEqual(lc.kayitlar, [{ id: parti, baslik: 'LT-P-ETK-1' }]);
    assert.deepEqual(lc.eksikler, [2147483003]);
    assert.match(lc.komut, /Parti P-ETK-1/);
    assert.equal((lc.onizleme.find((o) => o.tur === 'qr') as { veri: string } | undefined)?.veri, 'LOT:LT-P-ETK-1');
    assert.equal((await al(yonetici, adres('konum-50x25', 'lot', String(parti)))).statusCode, 400);

    const i = await al(yonetici, adres('istasyon-100x50', 'istasyon', `${konumsuz},${ist}`));
    assert.equal(i.statusCode, 200, i.body);
    const ic = i.json() as KayitCiktiCevabi;
    assert.deepEqual(ic.kayitlar, [{ id: ist, baslik: 'ETK-IST1' }]);
    assert.deepEqual(ic.eksikler, [konumsuz]);
    assert.equal((ic.onizleme.find((o) => o.tur === 'qr') as { veri: string } | undefined)?.veri, 'LOC:ETK-IST1');
    assert.match(ic.komut, /\^FDETK-IST1\^FS/);
    assert.match(ic.komut, /Deneme tezg/);

    const yazicilarim = ((await al(yonetici, '/etiket-merkezi/yazicilar')).json() as YazicilarCevabi).yazicilar;
    const dosya = yazicilarim.find((x) => x.ad === DOSYA.ad);
    assert.ok(dosya);
    const c = await yaz(yonetici, '/etiket-merkezi/sablonlar/lot-100x50/indir', { yaziciId: dosya.id, adet: 1, kayit: { tur: 'lot', idler: [parti] } });
    assert.equal(c.statusCode, 200, c.body);
    const kayitlar = await ortam!.vt.sorgu<{ kaynak_tur: string; kaynak_id: number }>(
      'SELECT kaynak_tur, kaynak_id FROM etiket_merkezi_baski_kaydi WHERE baski_id = $1', [(c.json() as IndirCevabi).baskiId],
    );
    assert.deepEqual(kayitlar, [{ kaynak_tur: 'lot', kaynak_id: parti }]);
  });

  // Üretim emri sahibinin açma işleviyle açılır; kart, proje ve işlem tipi sahiplerinin tablolarına doğrudan yazılır.
  async function emirAc(): Promise<{ id: number; emirNo: string; malzemeNo: number }> {
    const sahip = ortam!.sahip;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ETK-M-', 0) ON CONFLICT (onek) DO NOTHING");
    const sira = ((await sahip.tek<{ n: number }>('SELECT count(*)::int + 1 AS n FROM malzeme_katalog_karti'))?.n ?? 1);
    const kart = await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'ETK-M-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`etk-m-${sira}`, sira, JSON.stringify({ id: `etk-m-${sira}`, com: { ad: 'Deneme flanş' } }), yoneticiId],
    );
    const proje = await sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ($1, 'Deneme proje', $2) RETURNING id", [`ETK.${sira}`, yoneticiId]);
    // Emir gerçek bir rota revizyonuna bağlanır; iptal durumu açık ve yürürlükteki revizyon tekil dizinlerine girmez.
    const rev = await sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [kart!.no, yoneticiId]);
    const tip = await sahip.tek<{ id: number }>(
      "INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`ETK-T${sira}`]);
    const { uretimEmriId } = await ortam!.vt.tx(async (db) => {
      const kim = await kullaniciYukle(db, yoneticiId);
      if (kim === null) throw new Error('Yönetici yüklenemedi.');
      return uretimEmriAc(db, kim, {
        malzemeNo: kart!.no, adet: 12, teslim: '2026-11-02', kaynakRotaRevizyonId: rev!.id, projeId: proje!.id,
        isEmirleri: [{
          sira: 1, opNo: 10, ad: 'Torna', operasyonTipiId: tip!.id, kaynak: null, ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null,
          bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
        }],
      });
    });
    const emir = ((await al(yonetici, `/adimli-emirler/${uretimEmriId}`)).json() as { emir: { emirNo: string } }).emir;
    return { id: uretimEmriId, emirNo: emir.emirNo, malzemeNo: kart!.no };
  }

  test('EM-U13 (Soru 587 a): emirden lotsuz refakat kartı basılmaz; tur=refakat önizlemede ve indirmede reddedilir, deftere yazılmaz', async () => {
    const e = await emirAc();
    const r = await al(yonetici, `/etiket-merkezi/sablonlar/refakat-100x150/kayit-cikti?dil=zpl&dpi=203&tur=refakat&id=${e.id}`);
    assert.equal(r.statusCode, 400, r.body);
    const yazicilarim = ((await al(yonetici, '/etiket-merkezi/yazicilar')).json() as YazicilarCevabi).yazicilar;
    const dosya = yazicilarim.find((x) => x.ad === DOSYA.ad);
    assert.ok(dosya);
    const once = await ortam!.vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM etiket_merkezi_baski_kaydi');
    const c = await yaz(yonetici, '/etiket-merkezi/sablonlar/refakat-100x150/indir', { yaziciId: dosya.id, adet: 1, kayit: { tur: 'refakat', idler: [e.id] } });
    assert.equal(c.statusCode, 400, c.body);
    assert.deepEqual(await ortam!.vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM etiket_merkezi_baski_kaydi'), once);
  });

  test('EM-U16 (kart #127): refakat partisinin kartı emrin kartı, partinin QR ve etiketi, lot satırıyla basılır; iptal kart eksikte kalır; deftere emrin kartı yazılır', async () => {
    const e = await emirAc();
    const sahip = ortam!.sahip;
    // Kart ve lot stoğun tablolarıdır; test kendi kayıtlarını doğrudan açar.
    const lot = (await sahip.tek<{ id: number }>(
      "INSERT INTO stok_parti (malzeme_id, tedarikci_parti_no, dokum_no, sertifika_no, acan_kisi_id, lot_no) VALUES ($1, 'P-9', 'D-01', 'S-01', $2, $3) RETURNING id",
      [e.malzemeNo, yoneticiId, `LT-ETK-${e.id}`]))!.id;
    const kart = async (sira: number, durum: 'acik' | 'iptal') => (await sahip.tek<{ id: number }>(
      `INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id, durum, iptal_eden_kisi_id, iptal_zamani)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 = 'iptal' THEN $5::int END, CASE WHEN $6 = 'iptal' THEN now() END) RETURNING id`,
      [e.id, sira, e.malzemeNo, lot, yoneticiId, durum]))!.id;
    const [acik, iptal] = [await kart(1, 'acik'), await kart(2, 'iptal')];
    const adres = (id: string) => `/etiket-merkezi/sablonlar/refakat-100x150/kayit-cikti?dil=zpl&dpi=203&tur=refakat-partisi&id=${id}`;
    const r = await al(yonetici, adres(`${acik},${iptal},2147483004`));
    assert.equal(r.statusCode, 200, r.body);
    const rc = r.json() as KayitCiktiCevabi;
    assert.deepEqual(rc.kayitlar, [{ id: e.id, baslik: `${e.emirNo}-P1` }]);
    assert.deepEqual(rc.eksikler, [iptal, 2147483004]);
    assert.equal((rc.onizleme.find((o) => o.tur === 'qr') as { veri: string } | undefined)?.veri, `RP:${acik}`);
    // Kart #707: lot satırı rota sütununun dar kutusunda iki satıra bölünebilir; bütün metin aynı kutudadır.
    const lotKutusu = rc.onizleme.find((o) => o.tur === 'metin' && o.satirlar[0]?.startsWith(`Lot LT-ETK-${e.id}`));
    assert.equal(lotKutusu?.tur === 'metin' && lotKutusu.satirlar.join(' '), `Lot LT-ETK-${e.id} · Parti P-9 · Döküm D-01 · Sertifika S-01`);
    assert.match(rc.komut, new RegExp(`Lot LT-ETK-${e.id} · Parti P-9`));
    assert.match(rc.komut, /10 Torna/);
    assert.equal((await al(yonetici, `/etiket-merkezi/sablonlar/lot-100x50/kayit-cikti?dil=zpl&dpi=203&tur=refakat-partisi&id=${acik}`)).statusCode, 400, 'lot şablonu refakat partisi basmaz');

    const dosya = ((await al(yonetici, '/etiket-merkezi/yazicilar')).json() as YazicilarCevabi).yazicilar.find((x) => x.ad === DOSYA.ad);
    assert.ok(dosya);
    const c = await yaz(yonetici, '/etiket-merkezi/sablonlar/refakat-100x150/indir', { yaziciId: dosya.id, adet: 1, kayit: { tur: 'refakat-partisi', idler: [acik] } });
    assert.equal(c.statusCode, 200, c.body);
    const kayitlar = await ortam!.vt.sorgu<{ kaynak_tur: string; kaynak_id: number }>(
      'SELECT kaynak_tur, kaynak_id FROM etiket_merkezi_baski_kaydi WHERE baski_id = $1', [(c.json() as IndirCevabi).baskiId],
    );
    assert.deepEqual(kayitlar, [{ kaynak_tur: 'refakat', kaynak_id: e.id }]);
  });

  test('EM-U14: malzeme etiketi karttan, mal kabul seçimi o kabulün bütün lotlarından çıkar; mal kabul lotları deftere lot olarak bağlanır', async () => {
    const parti = await partiAc('P-ETK-MK');
    const kart = (await ortam!.sahip.tek<{ m: number }>('SELECT malzeme_id::int AS m FROM stok_parti WHERE id = $1', [parti]))!.m;
    const adres = (anahtar: string, tur: string, id: string) => `/etiket-merkezi/sablonlar/${anahtar}/kayit-cikti?dil=zpl&dpi=203&tur=${tur}&id=${id}`;

    const m = await al(yonetici, adres('malzeme-50x25', 'malzeme', `${kart},2147483005`));
    assert.equal(m.statusCode, 200, m.body);
    const mc = m.json() as KayitCiktiCevabi;
    assert.deepEqual(mc.eksikler, [2147483005]);
    assert.equal(mc.kayitlar.length, 1);
    assert.equal((mc.onizleme.find((o) => o.tur === 'qr') as { veri: string } | undefined)?.veri, `MLZ:${kart}`);
    assert.match(mc.komut, /Deneme mil/);

    const kabul = await yaz(yonetici, '/stok/mal-kabul', {
      tur: 'diger', satirlar: [{ malzemeId: kart, miktar: '5', parti: { tedarikciPartiNo: 'MK-A' } }, { malzemeId: kart, miktar: '7', parti: { tedarikciPartiNo: 'MK-B' } }],
    });
    assert.equal(kabul.statusCode, 200, kabul.body);
    const mkId = (kabul.json() as { belge: { id: number } }).belge.id;
    const k = await al(yonetici, adres('lot-100x50', 'mal-kabul', `${mkId},2147483006`));
    assert.equal(k.statusCode, 200, k.body);
    const kc = k.json() as KayitCiktiCevabi;
    assert.equal(kc.kayitlar.length, 2, 'iki satır iki lot');
    assert.deepEqual(kc.eksikler, [2147483006]);
    assert.match(kc.komut, /Parti MK-A/);
    assert.match(kc.komut, /Parti MK-B/);
    assert.match(kc.komut, /Kart \d+ · Hammadde/, 'lot etiketinde tür adı (271 a)');
    assert.equal((await al(yonetici, adres('konum-50x25', 'mal-kabul', String(mkId)))).statusCode, 400);

    const yazicilarim = ((await al(yonetici, '/etiket-merkezi/yazicilar')).json() as YazicilarCevabi).yazicilar;
    const dosya = yazicilarim.find((x) => x.ad === DOSYA.ad);
    assert.ok(dosya);
    const c = await yaz(yonetici, '/etiket-merkezi/sablonlar/lot-100x50/indir', { yaziciId: dosya.id, adet: 1, kayit: { tur: 'mal-kabul', idler: [mkId] } });
    assert.equal(c.statusCode, 200, c.body);
    const kayitlar = await ortam!.vt.sorgu<{ kaynak_tur: string; kaynak_id: number }>(
      'SELECT kaynak_tur, kaynak_id FROM etiket_merkezi_baski_kaydi WHERE baski_id = $1 ORDER BY kaynak_id', [(c.json() as IndirCevabi).baskiId],
    );
    assert.deepEqual(kayitlar, kc.kayitlar.map((x) => ({ kaynak_tur: 'lot', kaynak_id: x.id })).sort((a, b) => a.kaynak_id - b.kaynak_id));
    const mz = await yaz(yonetici, '/etiket-merkezi/sablonlar/malzeme-50x25/indir', { yaziciId: dosya.id, adet: 1, kayit: { tur: 'malzeme', idler: [kart] } });
    assert.equal(mz.statusCode, 200, mz.body);
    assert.equal((await al(yonetici, adres('lot-100x50', 'mal-kabul', String(mkId)) + '&adet=300')).statusCode, 400, 'iki lot x 300 sınırı aşar');
  });
  test('EM-U15: raf etiketi Fabrika Haritası rafından RAF önekiyle çıkar; bölüm ve bölme/kat gözlerden gelir; pasif ve olmayan raf eksikte kalır; deftere raf olarak bağlanır (#116)', async () => {
    const sahip = ortam!.sahip;
    const salon = (await sahip.tek<{ id: number }>(
      `INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ('ETKSALON', 'Etiket salonu', 20, 20, 5, $1) RETURNING id`, [yoneticiId],
    ))!.id;
    const rafAc = async (kod: string, ad: string, aktif: boolean, bolme: number, kat: number): Promise<number> => {
      const id = (await sahip.tek<{ id: number }>(
        `INSERT INTO atolye_raf (salon_id, kod, ad, tur, bolme_sayisi, kat_sayisi, goz_sayisi, bolme_genisligi, derinlik, yukseklik, x, z, donus, aktif)
         VALUES ($1, $2, $3, 'palet', $4, $5, 1, 1, 1, 2, 5, 5, 0, $6) RETURNING id`, [salon, kod, ad, bolme, kat, aktif],
      ))!.id;
      await sahip.sorgu('INSERT INTO atolye_goz (raf_id, bolme, kat, goz) SELECT $1, b, k, 1 FROM generate_series(1, $2::int) b, generate_series(1, $3::int) k', [id, bolme, kat]);
      return id;
    };
    const r1 = await rafAc('E1', 'Etiket palet rafı', true, 3, 2);
    const r2 = await rafAc('E2', 'E2', true, 1, 1);
    const pasif = await rafAc('E9', 'Sökülen raf', false, 1, 1);
    const yok = 2147483007;

    const secim = (await al(yonetici, '/etiket-merkezi/raflar')).json() as { raflar: { id: number; kod: string; salonKodu: string | null }[] };
    assert.deepEqual(secim.raflar.filter((r) => r.kod.startsWith('E')).map((r) => [r.kod, r.salonKodu]), [['E1', 'ETKSALON'], ['E2', 'ETKSALON']], 'pasif raf seçimde yok');

    const adres = (id: string) => `/etiket-merkezi/sablonlar/raf-100x50/kayit-cikti?dil=zpl&dpi=203&tur=raf&id=${id}`;
    const c = await al(yonetici, adres(`${r1},${r2},${pasif},${yok}`));
    assert.equal(c.statusCode, 200, c.body);
    const cevap = c.json() as KayitCiktiCevabi;
    assert.deepEqual(cevap.kayitlar, [{ id: r1, baslik: 'E1' }, { id: r2, baslik: 'E2' }]);
    assert.deepEqual(cevap.eksikler, [pasif, yok]);
    assert.equal((cevap.onizleme.find((o) => o.tur === 'qr') as { veri: string } | undefined)?.veri, 'RAF:E1');
    assert.match(cevap.komut, /ETKSALON · 3 bölme × 2/);
    assert.match(cevap.komut, /Etiket palet rafı/);
    assert.equal((await al(yonetici, `/etiket-merkezi/sablonlar/konum-50x25/kayit-cikti?dil=zpl&dpi=203&tur=raf&id=${r1}`)).statusCode, 400, 'konum şablonu raf basmaz');

    const dosya = ((await al(yonetici, '/etiket-merkezi/yazicilar')).json() as YazicilarCevabi).yazicilar.find((x) => x.ad === DOSYA.ad);
    assert.ok(dosya);
    const i = await yaz(yonetici, '/etiket-merkezi/sablonlar/raf-50x25/indir', { yaziciId: dosya.id, adet: 1, kayit: { tur: 'raf', idler: [r1, r2] } });
    assert.equal(i.statusCode, 200, i.body);
    const kayitlar = await ortam!.vt.sorgu<{ kaynak_tur: string; kaynak_id: number }>(
      'SELECT kaynak_tur, kaynak_id FROM etiket_merkezi_baski_kaydi WHERE baski_id = $1 ORDER BY kaynak_id', [(i.json() as IndirCevabi).baskiId],
    );
    assert.deepEqual(kayitlar, [{ kaynak_tur: 'raf', kaynak_id: r1 }, { kaynak_tur: 'raf', kaynak_id: r2 }]);

    const okuyan = await tekIslemliKisi('rafokur', ['etiket-merkezi.oku']);
    assert.equal((await al(okuyan, '/etiket-merkezi/raflar')).statusCode, 200);
    assert.equal((await al(okuyan, adres(String(r1)))).statusCode, 200);
    const sayfaci = await tekIslemliKisi('rafsayfaci', ['sayfa.etiket-merkezi']);
    assert.equal((await al(sayfaci, '/etiket-merkezi/raflar')).statusCode, 403);
    assert.equal((await al(sayfaci, adres(String(r1)))).statusCode, 403);
  });

  test('EM-U17 (kart #1292): etiket listesi sayfayı gören okur; tablo koddaki şablon ve kayıt türleriyle ayrışmaz; dışarıda basılanlar görünür', async () => {
    const sayfaci = await tekIslemliKisi('etiketlistesi', ['sayfa.etiket-merkezi']);
    const cevap = await al(sayfaci, '/etiket-merkezi/etiketler');
    assert.equal(cevap.statusCode, 200);
    const { etiketler } = cevap.json() as EtiketlerCevabi;
    const hazir = etiketler.filter((e) => e.durum === 'hazir');
    // Her şablon türünün ve basılabilen her kayıt türünün listede tam bir hazır satırı vardır; yeni tür eklenip listeye yazılmazsa test düşer.
    for (const tur of SABLON_TURLERI) assert.equal(hazir.filter((e) => e.sablonTuru === tur).length, 1, tur);
    for (const tur of KAYIT_TURLERI) assert.equal(hazir.filter((e) => e.kayitTurleri.includes(tur)).length, 1, tur);
    for (const e of hazir) assert.equal(e.sablonlar.length > 0, true, e.kod);
    for (const e of etiketler.filter((x) => x.durum !== 'hazir')) {
      assert.equal(e.sablonTuru, null, e.kod);
      assert.deepEqual(e.sablonlar, [], e.kod);
    }
    // 1285 a: ilk tur kalite durum, hatalı parça ve sevk koli etiketi; 1288: dışarıdaki dört baskı yolu listede.
    assert.deepEqual(etiketler.filter((e) => e.durum === 'ilk-tur').map((e) => e.kod), ['kalite-durum', 'hatali-parca', 'sevk-koli']);
    assert.deepEqual(etiketler.filter((e) => e.disaridakiYol !== null).map((e) => e.kod).sort(), ['kalite-durum', 'konum', 'lot', 'malzeme', 'seri-no']);
    assert.equal((await al(yetkisiz, '/etiket-merkezi/etiketler')).statusCode, 403);
  });
});
