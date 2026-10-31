import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir } from '#cekirdek/zamanlayici.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { geometriAnalizCevabi, geometriHamCevabi, geometriModelListeCevabi } from '#paylasilan/sozlesme/geometri.ts';
import type { GeometriAnalizCevabi, GeometriModelSatiri } from '#paylasilan/sozlesme/geometri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { isler } from './isler.ts';
import { EN_COK_DENEME, ILETILER } from './kurallar.ts';
import { geometriTuru } from './servis.ts';
import { geometriSureci, geometriSureciKur } from './surec.ts';
import { kutuStep } from './test-ortak.ts';
import type { GeometriSureci } from './surec.ts';

const PAROLA = 'dogru-parola-1';
const KUTU = Buffer.from(kutuStep(40, 20, 10));
const BOZUK = Buffer.from('ISO-10303-21;\nHEADER;\nbozuk icerik\n');
const sessiz = { uyar: () => undefined, hata: () => undefined };

describe('geometri: model listesi, analiz kuyruğu ve ayrı hesap süreci (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonId = 0;
  let surec: GeometriSureci;
  const cerez = new Map<string, string>();
  let mil = 0;
  let flans = 0;
  let burc = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  const istek = (ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<LightMyRequestResponse> => {
    const basliklar: Record<string, string> = ad === null ? {} : { cookie: cerez.get(ad) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    return app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
  };
  const tamam = (r: LightMyRequestResponse): unknown => { assert.equal(r.statusCode, 200, r.body); return r.json(); };

  async function giris(kullaniciAdi: string): Promise<void> {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerez.set(kullaniciAdi, String(r.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const rol = (await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]))!.id;
    for (const islem of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol, islem]);
    const yonRolu = (await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yonId, yeni, rol);
      await rolAl(db, yonId, yeni, yonRolu);
    });
    await giris(kullaniciAdi);
  }

  // Model, malzeme kartından Çizim Merkezi'nin kendi ucuyla eklenir (bu test merkezin tablolarına yazmaz).
  async function modelEkle(malzemeNo: number, icerik: Buffer, dosyaAdi: string): Promise<void> {
    const ozet = createHash('sha256').update(icerik).digest('hex');
    tamam(await istek('yonetici', 'POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }));
    const ad = `Model ${dosyaAdi}`;
    const c = tamam(await istek('yonetici', 'POST', `/cizimler/malzemeler/${String(malzemeNo)}/belge-ekle`, { ad, tur: '3b-model', ozet, dosyaAdi })) as
      { belgeler: { id: number; ad: string; surum: number; revizyonlar: { id: number }[] }[] };
    // Karttan eklenen model taslaktır; yayına merkez alır.
    const b = c.belgeler.find((x) => x.ad === ad);
    assert.ok(b);
    tamam(await istek('yonetici', 'POST', `/cizimler/${String(b.id)}/revizyonlar/${String(b.revizyonlar[0]?.id)}/yayinla`, { surum: b.surum }));
  }

  const liste = async (ad = 'yonetici'): Promise<GeometriModelSatiri[]> =>
    geometriModelListeCevabi.parse(tamam(await istek(ad, 'GET', '/geometri/modeller'))).satirlar;
  const satir = async (malzemeNo: number): Promise<GeometriModelSatiri> => {
    const s = (await liste()).find((x) => x.malzemeNo === malzemeNo);
    assert.ok(s, `listede yok: ${String(malzemeNo)}`);
    return s;
  };
  const analiz = async (revizyonId: number, ad = 'yonetici'): Promise<GeometriAnalizCevabi> =>
    geometriAnalizCevabi.parse(tamam(await istek(ad, 'GET', `/geometri/analizler/${String(revizyonId)}`)));
  const tur = (s: GeometriSureci = surec): Promise<number> => geometriTuru(o().vt, s, sessiz);

  before(async () => {
    ortam = await testVeritabaniKur('geometri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const hepsi = await modulOrnekVerileriniKesfet();
    const secilen = hepsi.filter((t) => t.modul === 'malzemeler' || t.modul === 'kisiler');
    assert.equal((await ornekVeriYukle(ortam.vt, secilen, { ortam: 'test', bildir: () => undefined })).durum, 'yuklendi');
    await giris('yonetici');
    await islemliKisi('okur', ['sayfa.geometri', 'geometri.oku']);
    await islemliKisi('hesaplar', ['geometri.oku', 'geometri.hesapla']);
    await islemliKisi('yetkisiz', ['sayfa.geometri']);
    await o().vt.tx(async (db) => {
      mil = (await ornekMalzemeNo(db, 'mil'))!;
      flans = (await ornekMalzemeNo(db, 'flans'))!;
      burc = (await ornekMalzemeNo(db, 'burc'))!;
    });
    surec = geometriSureciKur();
  });

  after(async () => {
    surec?.kapat();
    geometriSureci().kapat();
    await ortam?.kaldir();
  });

  test('G-A1 yayına giren STEP önce "yok", tur kuyruğa alır ve ayrı süreçte hesaplar: 40x20x10 mm kutu, hacim 8000 mm3; ham önerisi pay ekler', async () => {
    assert.deepEqual(await liste(), []);
    await modelEkle(mil, KUTU, 'kup.step');
    const once = await satir(mil);
    assert.equal(once.durum, 'yok');
    assert.equal(once.dosyaTuru, 'step');
    assert.equal((await analiz(once.revizyonId)).analiz, null, 'veri yoksa analiz null');
    assert.equal(await tur(), 1);
    const a = await analiz(once.revizyonId);
    assert.equal(a.durum, 'bitti');
    assert.ok(a.analiz);
    assert.deepEqual(a.analiz.kutu, { x: 40, y: 20, z: 10 });
    assert.deepEqual([a.analiz.obb.a, a.analiz.obb.b, a.analiz.obb.c], [40, 20, 10]);
    assert.equal(a.analiz.hacimMm3, 8000);
    assert.ok(Math.abs(a.analiz.obb.cap - 22.3607) < 1e-3, 'uzun eksen çevresinde kesit köşegeni');
    assert.equal(a.analiz.alanMm2, 2800);
    assert.equal(a.analiz.kapali, true);
    assert.equal(a.is?.denemeSayisi, 1);
    const ham = geometriHamCevabi.parse(tamam(await istek('okur', 'GET', `/geometri/ham-onerisi/${String(once.revizyonId)}?payMm=2`)));
    assert.equal(ham.payKaynagi, 'istek');
    assert.deepEqual(ham.enAz, { a: 44, b: 24, c: 14 });
    assert.equal(ham.neden, null);
    // Örnek veride hammadde kartları çubuk ve levha; 10 mm levha 14 mm kalınlığa sığmaz, çubuk çapı kesit köşegeni + 2 pay'ı kapsar.
    assert.ok(ham.oneriler.length > 0 && ham.oneriler.every((x) => x.form === 'cubuk'), JSON.stringify(ham.oneriler));
    assert.ok(ham.oneriler[0]!.olcu['d']! >= Math.hypot(20, 10) + 4 - 1e-6);
    assert.equal(ham.oneriler[0]!.kesimBoyuMm, 44);
    assert.ok(ham.kaliteler.includes('C45') && ham.kaliteler.includes('S235'));
    const c45 = geometriHamCevabi.parse(tamam(await istek('okur', 'GET', `/geometri/ham-onerisi/${String(once.revizyonId)}?payMm=2&kalite=C45`)));
    assert.deepEqual(c45.oneriler.map((x) => [x.kalite, x.form, x.olcu]), [['C45', 'cubuk', { d: 50, l: 3000 }]]);
    const yok = geometriHamCevabi.parse(tamam(await istek('okur', 'GET', `/geometri/ham-onerisi/${String(once.revizyonId)}?payMm=2&kalite=YOK`)));
    assert.deepEqual([yok.oneriler, yok.neden], [[], 'stok-listesi-yok']);
    const genis = geometriHamCevabi.parse(tamam(await istek('okur', 'GET', `/geometri/ham-onerisi/${String(once.revizyonId)}?payMm=100&kalite=C45`)));
    assert.deepEqual([genis.oneriler, genis.neden], [[], 'sigan-yok']);
    // Pay verilmezse ayar; ayar boşsa 0 ve kaynak 'yok'.
    const paysiz = async () => geometriHamCevabi.parse(tamam(await istek('okur', 'GET', `/geometri/ham-onerisi/${String(once.revizyonId)}`)));
    assert.deepEqual([(await paysiz()).payMm, (await paysiz()).payKaynagi, (await paysiz()).enAz], [0, 'yok', { a: 40, b: 20, c: 10 }]);
    tamam(await istek('yonetici', 'POST', '/ayarlar/geometri.ham-payi-mm/degistir', { deger: 3 }));
    const ayarli = await paysiz();
    assert.deepEqual([ayarli.payMm, ayarli.payKaynagi, ayarli.enAz], [3, 'ayar', { a: 46, b: 26, c: 16 }]);
    assert.equal(await tur(), 0, 'bitmiş iş yeniden hesaplanmaz');
  });

  test('G-A2 bozuk STEP kalıcı hatadır: bir denemede "hata" olur, metniyle listede görünür; biçimi tutmayan dosya sürece gitmez', async () => {
    await modelEkle(flans, BOZUK, 'bozuk.step');
    await tur();
    const s = await satir(flans);
    assert.equal(s.durum, 'hata');
    assert.equal(s.hataMetni, ILETILER.okunamadi);
    assert.equal((await analiz(s.revizyonId)).is?.denemeSayisi, 1);
    assert.deepEqual((await liste()).filter((x) => x.durum === 'hata').map((x) => x.malzemeNo), [flans]);
    assert.deepEqual(geometriModelListeCevabi.parse(tamam(await istek('yonetici', 'GET', '/geometri/modeller?durum=hata'))).satirlar.map((x) => x.malzemeNo), [flans]);
    assert.equal(geometriHamCevabi.parse(tamam(await istek('yonetici', 'GET', `/geometri/ham-onerisi/${String(s.revizyonId)}?payMm=2`))).neden, 'analiz-yok');
  });

  test('G-A3 yetki: okur görür ama hesaplatamaz; hesaplar hesaplatır; işlemsiz 403, oturumsuz 401', async () => {
    const s = await satir(mil);
    assert.equal((await analiz(s.revizyonId, 'okur')).durum, 'bitti');
    const d = await istek('okur', 'GET', `/geometri/modeller/${String(s.revizyonId)}/dosya`);
    assert.equal(d.statusCode, 200);
    assert.deepEqual(d.rawPayload, KUTU, 'görüntüleyici yayındaki dosyayı alır');
    assert.equal((await istek('yetkisiz', 'GET', `/geometri/modeller/${String(s.revizyonId)}/dosya`)).statusCode, 403);
    assert.equal((await istek('yetkisiz', 'GET', '/geometri/modeller')).statusCode, 403);
    assert.equal((await istek('yetkisiz', 'GET', `/geometri/analizler/${String(s.revizyonId)}`)).statusCode, 403);
    assert.equal((await istek(null, 'GET', '/geometri/modeller')).statusCode, 401);
    const a = await analiz(s.revizyonId);
    const govde = { surum: a.is!.surum };
    assert.equal((await istek('okur', 'POST', `/geometri/analizler/${String(s.revizyonId)}/yeniden-hesapla`, govde)).statusCode, 403);
    assert.equal((await istek(null, 'POST', `/geometri/analizler/${String(s.revizyonId)}/yeniden-hesapla`, govde)).statusCode, 401);
    const r = geometriAnalizCevabi.parse(tamam(await istek('hesaplar', 'POST', `/geometri/analizler/${String(s.revizyonId)}/yeniden-hesapla`, govde)));
    assert.equal(r.durum, 'bekliyor');
    assert.equal(r.is?.denemeSayisi, 0);
    assert.ok(r.analiz, 'eski analiz yeni hesap gelene kadar görünür');
    await tur();
    assert.equal((await analiz(s.revizyonId)).durum, 'bitti');
  });

  test('G-A4 yeniden hesaplatma sürümlüdür: eski sürüm 409, iş yokken null ile açılır, bağsız revizyon 404', async () => {
    const s = await satir(mil);
    const a = await analiz(s.revizyonId);
    const yol = `/geometri/analizler/${String(s.revizyonId)}/yeniden-hesapla`;
    assert.equal((await istek('yonetici', 'POST', yol, { surum: a.is!.surum + 5 })).statusCode, 409);
    assert.equal((await istek('yonetici', 'POST', yol, { surum: null })).statusCode, 409, 'iş varken null eski bilgidir');
    assert.equal((await istek('yonetici', 'POST', '/geometri/analizler/999999/yeniden-hesapla', { surum: null })).statusCode, 404);
    assert.equal((await istek('yonetici', 'GET', '/geometri/analizler/999999')).statusCode, 404);
    assert.equal((await istek('yonetici', 'GET', `/geometri/ham-onerisi/${String(s.revizyonId)}?payMm=-1`)).statusCode, 400);

    await modelEkle(burc, KUTU, 'kup-burc.step');
    const b = await satir(burc);
    assert.equal(b.durum, 'yok');
    const r = geometriAnalizCevabi.parse(tamam(await istek('yonetici', 'POST', `/geometri/analizler/${String(b.revizyonId)}/yeniden-hesapla`, { surum: null })));
    assert.equal(r.durum, 'bekliyor');
    assert.equal((await istek('yonetici', 'POST', `/geometri/analizler/${String(b.revizyonId)}/yeniden-hesapla`, { surum: null })).statusCode, 409);
    await tur();
    assert.equal((await analiz(b.revizyonId)).analiz?.hacimMm3, 8000);
  });

  test('G-A5 süre aşımında süreç öldürülür, iş geçici hatayla yinelenir ve sınırda "hata" kalır; yeni süreç açılır', async () => {
    const s = await satir(burc);
    const yavas = geometriSureciKur({ sureMs: 1 });
    try {
      let a = await analiz(s.revizyonId);
      for (let i = 1; i <= EN_COK_DENEME; i++) {
        if (i === 1) tamam(await istek('yonetici', 'POST', `/geometri/analizler/${String(s.revizyonId)}/yeniden-hesapla`, { surum: a.is!.surum }));
        await tur(yavas);
        a = await analiz(s.revizyonId);
        assert.equal(a.is?.denemeSayisi, i);
        assert.equal(a.durum, i < EN_COK_DENEME ? 'bekliyor' : 'hata');
        assert.equal(a.is?.hataMetni, ILETILER.sureAsimi);
      }
      assert.equal(yavas.durum().acilis, EN_COK_DENEME, 'her öldürmeden sonra yeniden açılır');
    } finally {
      yavas.kapat();
    }
  });

  test('G-A6 iş ortasında kapanan sunucunun öksüz işi sonraki turda geçici hata sayılır; zamanlayıcı işi tanımlıdır', async () => {
    const s = await satir(mil);
    await o().sahip.sorgu("UPDATE geometri_is SET durum = 'calisiyor', deneme_sayisi = 1 WHERE revizyon_id = $1", [s.revizyonId]);
    await tur();
    const a = await analiz(s.revizyonId);
    assert.equal(a.durum, 'bitti', 'öksüz iş kuyruğa döner ve aynı turda yeniden hesaplanır');
    assert.equal(a.is?.denemeSayisi, 2);
    assert.equal(isler.length, 1);
    assert.equal(await isiBirKezCalistir(o().vt, isler[0]!), 'tamam');
  });
});
