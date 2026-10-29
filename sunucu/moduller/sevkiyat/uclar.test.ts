// Uç testi: gerçek giriş akışı (kişi, rol, rol_islemi, oturum çerezi) ve gerçek PostgreSQL; uydurma ızgara yol ağı.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { ucEnvanteri, uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur, uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { SEVKIYAT_ISLEMLERI } from '#paylasilan/islemler/sevkiyat.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { izgaraKaynagi } from './test-agi.ts';
import { dosyadanHaritaKaynagi } from './servis.ts';
import { DEPODAKI_PAKET, sevkiyatUclari } from './uclar.ts';

const PAROLA = 'dogru-parola-1';
const TARIH = '2026-10-08';
type Islem = (typeof SEVKIYAT_ISLEMLERI)[number];

// Uç başına istenen işlem; ON-PAKET 3. bölümdeki tablo bununla aynıdır.
const BEKLENEN: Record<string, Islem | { biri: readonly string[] }> = {
  'GET /sevkiyat/noktalar': 'sevkiyat.oku',
  'GET /sevkiyat/firmalar': 'sevkiyat.tanim-yaz',
  'GET /sevkiyat/ozet': 'sevkiyat.oku',
  'POST /sevkiyat/noktalar/ekle': 'sevkiyat.tanim-yaz',
  'POST /sevkiyat/noktalar/:id/guncelle': 'sevkiyat.tanim-yaz',
  'POST /sevkiyat/noktalar/:id/pasiflestir': 'sevkiyat.tanim-yaz',
  'GET /sevkiyat/araclar': 'sevkiyat.oku',
  'POST /sevkiyat/araclar/ekle': 'sevkiyat.tanim-yaz',
  'POST /sevkiyat/araclar/:id/guncelle': 'sevkiyat.tanim-yaz',
  'POST /sevkiyat/araclar/:id/pasiflestir': 'sevkiyat.tanim-yaz',
  'GET /sevkiyat/bekleyenler': 'sevkiyat.oku',
  'GET /sevkiyat/urun-sevkleri': 'sevkiyat.oku',
  'POST /sevkiyat/bekleyenler/:id/ise-cevir': 'sevkiyat.is-yaz',
  'POST /sevkiyat/bekleyenler/:id/kaldir': 'sevkiyat.is-yaz',
  'POST /sevkiyat/bekleyenler/:id/bol': 'sevkiyat.is-yaz',
  // Tüm işler (941 c): kalemin sahibi modülün yazma işlemi de bırakır; kalem başına denetim serviste.
  'GET /sevkiyat/tum-isler': { biri: ['sevkiyat.oku', 'sevkiyat.is-yaz', 'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'satin-alma.yaz'] },
  'POST /sevkiyat/tum-isler/serbest-birak': { biri: ['sevkiyat.is-yaz', 'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'satin-alma.yaz'] },
  'POST /sevkiyat/tum-isler/elle': 'sevkiyat.is-yaz',
  'POST /sevkiyat/kalemler/:id/tasima': 'sevkiyat.is-yaz',
  'POST /sevkiyat/isler/:id/tetikle': 'sevkiyat.is-yaz',
  'POST /sevkiyat/isler/:id/tetigi-geri-al': 'sevkiyat.is-yaz',
  'POST /sevkiyat/isler/ekle': 'sevkiyat.is-yaz',
  'POST /sevkiyat/isler/:id/guncelle': 'sevkiyat.is-yaz',
  'POST /sevkiyat/isler/:id/iptal-et': 'sevkiyat.is-yaz',
  'POST /sevkiyat/isler/:id/durum': 'sevkiyat.is-yaz',
  'GET /sevkiyat/planlar/:tarih': 'sevkiyat.oku',
  'POST /sevkiyat/planlar/:tarih/dagit': 'sevkiyat.plan-yaz',
  'POST /sevkiyat/planlar/:tarih/yerlestir': 'sevkiyat.plan-yaz',
  'POST /sevkiyat/planlar/:tarih/kaydet': 'sevkiyat.plan-yaz',
  'POST /sevkiyat/planlar/:tarih/onayla': 'sevkiyat.onayla',
  'POST /sevkiyat/planlar/:tarih/onayi-kaldir': 'sevkiyat.onayla',
  'GET /sevkiyat/tek-rota': 'sevkiyat.oku',
  'GET /sevkiyat/harita': 'sevkiyat.oku',
  'GET /sevkiyat/trafik': 'sevkiyat.oku',
  'GET /sevkiyat/arama': 'sevkiyat.oku',
  'GET /sevkiyat/ara': { biri: ['sevkiyat.oku', 'sevkiyat.is-yaz', 'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'satin-alma.yaz'] },
};

describe('sevkiyat uçları (gerçek giriş, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani;
  let app: FastifyInstance;
  let hedef: FastifyInstance;
  let yonetici = '';
  let yalnizSayfa = '';
  const islemCerezi = new Map<Islem, string>();

  const girisYap = async (kullaniciAdi: string): Promise<string> => {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie'] ?? '').split(';')[0] ?? '';
  };
  // Kişi yönetici olarak açılır, sonra tek işlemli role geçirilir.
  const rolluKisi = async (kullaniciAdi: string, islemler: readonly string[]): Promise<string> => {
    const vt = ortam.vt;
    const id = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA }));
    await vt.sorgu('INSERT INTO rol (kod, ad) VALUES ($1, $1)', [`rol_${kullaniciAdi}`]);
    for (const islem of islemler) {
      await vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT id, $2 FROM rol WHERE kod = $1', [`rol_${kullaniciAdi}`, islem]);
    }
    await vt.sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = $2) WHERE kisi_id = $1', [id, `rol_${kullaniciAdi}`]);
    return girisYap(kullaniciAdi);
  };
  // Her yazma yeni bir istek kimliği taşır: tekrar korumalı uçlar başlıksız isteği reddeder; aynı kimlikle yineleme ayrı testte.
  const iste = (uygulama: FastifyInstance, method: 'GET' | 'POST', url: string, cerez?: string, payload?: unknown, istekKimligi: string = randomUUID()) =>
    uygulama.inject({
      method, url: `/api${url}`, ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { ...(cerez ? { cookie: cerez } : {}), ...(method === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: istekKimligi } : {}) },
    });

  before(async () => {
    ortam = await testVeritabaniKur('sevkuc');
    const kimlik = kimlikCozucu(ortam.vt);
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik, tekrar: tekrarDeposu });
    // Aynı veritabanı ve aynı kimlik çözücü; yalnız harita kaynağı dosya yerine ızgara yol ağıdır.
    hedef = Fastify();
    hataYonetiminiKur(hedef);
    uclariKaydet(hedef, sevkiyatUclari(izgaraKaynagi()), { vt: ortam.vt, kimlik, tekrar: tekrarDeposu });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisYap('yonetici');
    // Sayfa işlemi menü görünürlüğüdür; hiçbir veri ucunu açmamalı.
    yalnizSayfa = await rolluKisi('sayfaci', ['sayfa.sevkiyat']);
    for (const [sira, islem] of SEVKIYAT_ISLEMLERI.entries()) islemCerezi.set(islem, await rolluKisi(`islemci${sira}`, [islem]));
  });

  after(async () => {
    await hedef.close();
    await app.close();
    await ortam.kaldir();
  });

  test('uygulama modülü klasörden bulur: yönetici gerçek girişle noktaları okur', async () => {
    const cevap = await iste(app, 'GET', '/sevkiyat/noktalar', yonetici);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual(cevap.json(), { noktalar: [], fabrikaAyardan: false });
  });

  test('her uç beklenen işlemi ister; kimliksiz 401, sayfa işlemi ya da başka işlem 403, doğru işlem geçer', async () => {
    const envanter = ucEnvanteri(sevkiyatUclari(izgaraKaynagi()));
    assert.deepEqual(Object.fromEntries(envanter.map((u) => [`${u.yontem} ${u.yol}`, u.yetki])), BEKLENEN);
    for (const u of envanter) {
      const yol = u.yol.replace(':id', '999999').replace(':tarih', TARIH);
      const ad = `${u.yontem} ${u.yol}`;
      const yontem = u.yontem === 'GET' ? 'GET' : 'POST';
      assert.equal((await iste(hedef, yontem, yol)).statusCode, 401, ad);
      assert.equal((await iste(hedef, yontem, yol, yalnizSayfa)).statusCode, 403, ad);
      for (const [islem, cerez] of islemCerezi) {
        const durum = (await iste(hedef, yontem, yol, cerez)).statusCode;
        // Kabul: yetki geçer; gövdesiz ya da var olmayan kayıtlı istek doğrulama ya da bulunamadı ile döner.
        if (typeof u.yetki === 'string' ? islem === u.yetki : (u.yetki as { biri: readonly string[] }).biri.includes(islem)) assert.equal([401, 403].includes(durum), false, `${ad} ${islem} -> ${durum}`);
        else assert.equal(durum, 403, `${ad} ${islem}`);
      }
    }
  });

  test('uçtan uca: tanım, iş, dağıtma, onay, onaylı planda kayıt reddi ve tek rota; cevaplar sözleşmeden geçer', async () => {
    const y = (method: 'GET' | 'POST', url: string, payload?: unknown) => iste(hedef, method, url, yonetici, payload);
    // 930 a: fabrikanın konumu Sistem Ayarları'ndadır; ayar girilmeden fabrika açılmaz, gönderilen konum yok sayılır.
    const fabrikaGovdesi = { ad: 'Deneme Fabrika', tur: 'fabrika', enlem: 1, boylam: 1, adres: '', durakSuresiDakika: 0 };
    const ayarsiz = await y('POST', '/sevkiyat/noktalar/ekle', fabrikaGovdesi);
    assert.equal(ayarsiz.json().kod, 'GECERSIZ', ayarsiz.body);
    const kisi = (await ortam.vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Konum Ayari') RETURNING id"))!.id;
    await ortam.vt.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('sevkiyat.fabrika-enlem', '39.9', $1), ('sevkiyat.fabrika-boylam', '32.7', $1)", [kisi]);
    const fabrika = await y('POST', '/sevkiyat/noktalar/ekle', fabrikaGovdesi);
    assert.equal(fabrika.statusCode, 200, fabrika.body);
    assert.equal(fabrika.json().nokta.adres, null);
    assert.deepEqual([fabrika.json().nokta.enlem, fabrika.json().nokta.boylam], [39.9, 32.7]);
    const a = (await y('POST', '/sevkiyat/noktalar/ekle', { ad: 'Nokta A', tur: 'musteri', enlem: 39.95, boylam: 32.8, adres: null, durakSuresiDakika: 10 })).json().nokta;
    const b = (await y('POST', '/sevkiyat/noktalar/ekle', { ad: 'Nokta B', tur: 'musteri', enlem: 39.99, boylam: 32.73, adres: null, durakSuresiDakika: 10 })).json().nokta;
    const arac = await y('POST', '/sevkiyat/araclar/ekle', {
      ad: 'Araç 1', tur: 'kamyonet', plaka: null, kapasiteKilogram: 1500, kapasitePalet: 4, musaitBaslangic: '08:00', musaitBitis: '18:00',
      kilometreMaliyeti: 12.5, saatMaliyeti: null, gunlukMaliyet: null,
    });
    assert.equal(arac.statusCode, 200, arac.body);
    assert.equal(arac.json().arac.kilometreMaliyeti, '12.50');
    const isGovdesi = {
      tarih: TARIH, tur: 'aktarma', alisNoktasiId: a.id, birakisNoktasiId: b.id, agirlikKilogram: 10, paletSayisi: 0, durakSuresiDakika: null,
      alisEnErken: '09:00', alisEnGec: '12:00', birakisEnErken: null, birakisEnGec: null, belgeNo: null, aciklama: null, sabitAracId: null,
    };
    assert.equal((await y('POST', '/sevkiyat/isler/ekle', isGovdesi)).statusCode, 200);
    assert.equal((await y('POST', '/sevkiyat/isler/ekle', { ...isGovdesi, tarih: '2026-02-30' })).statusCode, 400);

    const dagit = await y('POST', `/sevkiyat/planlar/${TARIH}/dagit`, { amac: 'maliyet', kilitliAraclar: [], surum: null });
    assert.equal(dagit.statusCode, 200, dagit.body.slice(0, 400));
    assert.equal(dagit.json().rotalar[0].hesap.seferler[0].google.startsWith('https://www.google.com/maps/dir/'), true);
    const okunan = (await y('GET', `/sevkiyat/planlar/${TARIH}`)).json();
    const onay = await y('POST', `/sevkiyat/planlar/${TARIH}/onayla`, { surum: okunan.surum });
    assert.equal(onay.statusCode, 200, onay.body.slice(0, 400));
    assert.equal((await y('POST', `/sevkiyat/planlar/${TARIH}/kaydet`, { amac: 'sure', rotalar: [], surum: onay.json().surum })).statusCode, 422);
    // Eski sürümle gelen komut çakışmadır.
    assert.equal((await y('POST', `/sevkiyat/planlar/${TARIH}/onayi-kaldir`, { surum: okunan.surum })).statusCode, 409);

    const tek = await y('GET', `/sevkiyat/tek-rota?tarih=${TARIH}&cikis=08:30&arac=kamyon&amac=maliyet&fabrikayaDon=1&siraKorunur=0&duraklar=${a.id}s20b1,${b.id}a1`);
    assert.equal(tek.statusCode, 200, tek.body.slice(0, 400));
    assert.deepEqual(tek.json().plan.duraklar.map((d: { noktaId: number }) => d.noktaId), [b.id, a.id]);
    assert.equal(tek.json().plan.duraklar[1].durakSuresiDakika, 20);
    assert.equal((await y('GET', `/sevkiyat/tek-rota?tarih=${TARIH}&duraklar=x`)).statusCode, 400);
    assert.ok((await y('GET', '/sevkiyat/harita')).json().harita.geometri.length > 0);
    assert.equal((await y('GET', `/sevkiyat/trafik?tarih=${TARIH}&dakika=480`)).statusCode, 200);
    assert.equal((await y('GET', '/sevkiyat/arama?metin=nokta')).json().sonuclar.length > 0, true);
  });

  test('180, 200 a: araç oranı ve rota maliyeti yalnız finans.maliyet-oku olana döner; öteki oranı silemez, göndermesi yazılmaz', async () => {
    const yetkiler = ['sevkiyat.oku', 'sevkiyat.tanim-yaz', 'sevkiyat.is-yaz', 'sevkiyat.plan-yaz'];
    const planci = await rolluKisi('maliyetsiz', yetkiler);
    const mudur = await rolluKisi('maliyetli', [...yetkiler, 'finans.maliyet-oku']);
    const gun = '2026-03-04';
    const p = (method: 'GET' | 'POST', url: string, payload?: unknown) => iste(hedef, method, url, planci, payload);
    const m = (method: 'GET' | 'POST', url: string, payload?: unknown) => iste(hedef, method, url, mudur, payload);
    const govde = {
      ad: 'Maliyet Aracı', tur: 'kamyonet', plaka: null, kapasiteKilogram: 1500, kapasitePalet: 4, musaitBaslangic: '08:00', musaitBitis: '18:00',
      kilometreMaliyeti: 12.5, saatMaliyeti: 300, gunlukMaliyet: null,
    };
    const eklenen = (await m('POST', '/sevkiyat/araclar/ekle', govde)).json().arac;
    assert.deepEqual([eklenen.kilometreMaliyeti, eklenen.saatMaliyeti], ['12.50', '300.00']);
    const aracOf = async (istek: typeof p, id: number) => {
      const c = await istek('GET', '/sevkiyat/araclar');
      assert.equal(c.statusCode, 200, c.body);
      return { arac: c.json().araclar.find((a: { id: number }) => a.id === id), ornek: c.json().ornekMaliyetler };
    };
    const gizli = await aracOf(p, eklenen.id);
    assert.deepEqual([gizli.arac.kilometreMaliyeti, gizli.arac.saatMaliyeti, gizli.arac.gunlukMaliyet, gizli.arac.varsayilanMaliyet, gizli.ornek], [null, null, null, null, null]);
    assert.equal(gizli.arac.ad, 'Maliyet Aracı');
    const acik = await aracOf(m, eklenen.id);
    assert.equal(acik.arac.kilometreMaliyeti, '12.50');
    assert.ok(acik.arac.varsayilanMaliyet && acik.ornek);

    // Maliyeti görmeyen düzenlerken oranları boş gönderir: kayıttaki oran korunur, cevapta yine gizlidir.
    const guncel = await p('POST', `/sevkiyat/araclar/${eklenen.id}/guncelle`, { ...govde, ad: 'Maliyet Aracı 2', kilometreMaliyeti: null, saatMaliyeti: 1, surum: eklenen.surum });
    assert.equal(guncel.statusCode, 200, guncel.body);
    assert.equal(guncel.json().arac.kilometreMaliyeti, null);
    const sonra = await aracOf(m, eklenen.id);
    assert.deepEqual([sonra.arac.ad, sonra.arac.kilometreMaliyeti, sonra.arac.saatMaliyeti], ['Maliyet Aracı 2', '12.50', '300.00']);
    const plancininki = (await p('POST', '/sevkiyat/araclar/ekle', { ...govde, ad: 'Plancı Aracı', kilometreMaliyeti: 99 })).json().arac;
    assert.equal((await aracOf(m, plancininki.id)).arac.kilometreMaliyeti, null);

    const y = (method: 'GET' | 'POST', url: string, payload?: unknown) => iste(hedef, method, url, yonetici, payload);
    const a = (await y('POST', '/sevkiyat/noktalar/ekle', { ad: 'Maliyet A', tur: 'musteri', enlem: 39.94, boylam: 32.78, adres: null, durakSuresiDakika: 10 })).json().nokta;
    const b = (await y('POST', '/sevkiyat/noktalar/ekle', { ad: 'Maliyet B', tur: 'musteri', enlem: 39.97, boylam: 32.74, adres: null, durakSuresiDakika: 10 })).json().nokta;
    const is = await p('POST', '/sevkiyat/isler/ekle', {
      tarih: gun, tur: 'aktarma', alisNoktasiId: a.id, birakisNoktasiId: b.id, agirlikKilogram: 10, paletSayisi: 0, durakSuresiDakika: null,
      alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, belgeNo: null, aciklama: null, sabitAracId: null,
    });
    assert.equal(is.statusCode, 200, is.body);
    const dagit = await p('POST', `/sevkiyat/planlar/${gun}/dagit`, { amac: 'maliyet', kilitliAraclar: [], surum: null });
    assert.equal(dagit.statusCode, 200, dagit.body.slice(0, 400));
    const gizliPlan = dagit.json();
    const hesaplar = gizliPlan.rotalar.filter((r: { hesap: unknown }) => r.hesap !== null);
    assert.ok(hesaplar.length > 0 && gizliPlan.toplam && gizliPlan.karsilastirma.length > 0);
    assert.ok(hesaplar.every((r: { hesap: { maliyet: unknown; kilometre: number } }) => r.hesap.maliyet === null && r.hesap.kilometre > 0));
    assert.equal(gizliPlan.toplam.maliyet, null);
    assert.ok(gizliPlan.karsilastirma.every((k: { maliyet: unknown }) => k.maliyet === null));
    assert.ok(gizliPlan.araclar.every((x: { varsayilanMaliyet: unknown }) => x.varsayilanMaliyet === null));
    const acikPlan = (await m('GET', `/sevkiyat/planlar/${gun}`)).json();
    assert.equal(typeof acikPlan.toplam.maliyet, 'number');
    assert.deepEqual(acikPlan.rotalar.map((r: { aracId: number }) => r.aracId), gizliPlan.rotalar.map((r: { aracId: number }) => r.aracId));

    const tekUrl = `/sevkiyat/tek-rota?tarih=${gun}&cikis=08:30&arac=kamyon&amac=maliyet&fabrikayaDon=1&siraKorunur=0&duraklar=${a.id},${b.id}`;
    const gizliTek = (await p('GET', tekUrl)).json().plan;
    assert.deepEqual([gizliTek.maliyet, gizliTek.oranlar], [null, null]);
    assert.ok(gizliTek.karsilastirma.every((k: { maliyet: unknown }) => k.maliyet === null));
    const acikTek = (await m('GET', tekUrl)).json().plan;
    assert.equal(typeof acikTek.maliyet, 'number');
    assert.deepEqual(gizliTek.duraklar, acikTek.duraklar);
  });

  test('borç 7: harita ucu etiketle döner; aynı etiketle soru 304 ve gövdesiz, önbellek özel', async () => {
    const ilk = await iste(hedef, 'GET', '/sevkiyat/harita', yonetici);
    assert.equal(ilk.statusCode, 200, ilk.body.slice(0, 200));
    const etiket = String(ilk.headers.etag ?? '');
    assert.ok(etiket.length > 0);
    assert.match(String(ilk.headers['cache-control']), /private/);
    const ikinci = await hedef.inject({ method: 'GET', url: '/api/sevkiyat/harita', headers: { cookie: yonetici, 'if-none-match': etiket } });
    assert.equal(ikinci.statusCode, 304);
    assert.equal(ikinci.body, '');
    const kimliksiz = await hedef.inject({ method: 'GET', url: '/api/sevkiyat/harita', headers: { 'if-none-match': etiket } });
    assert.equal(kimliksiz.statusCode, 401);
  });

  test('kayıt açan uç aynı istek kimliğiyle yinelenince ikinci kayıt açmaz, ilk cevabı döner; kimliksiz yazma reddedilir', async () => {
    const govde = { ad: 'Tekrar Noktası', tur: 'musteri', enlem: 39.93, boylam: 32.85, adres: null, durakSuresiDakika: 5 };
    const kimlik = randomUUID();
    const ilk = await iste(hedef, 'POST', '/sevkiyat/noktalar/ekle', yonetici, govde, kimlik);
    const ikinci = await iste(hedef, 'POST', '/sevkiyat/noktalar/ekle', yonetici, govde, kimlik);
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.equal(ikinci.json().nokta.id, ilk.json().nokta.id);
    const sayi = await ortam.vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM sevkiyat_noktasi WHERE ad = 'Tekrar Noktası'");
    assert.equal(sayi?.n, 1);
    const kimliksiz = await hedef.inject({ method: 'POST', url: '/api/sevkiyat/noktalar/ekle', headers: { cookie: yonetici }, payload: { ...govde, ad: 'Kimliksiz' } });
    assert.equal(kimliksiz.statusCode, 400, kimliksiz.body);
  });
});

test('depodaki harita paketi ayarsız okunur: harita, yol ağı ve arama dizini dolu', async () => {
  const paket = await dosyadanHaritaKaynagi(DEPODAKI_PAKET)();
  assert.ok(paket);
  assert.ok(paket.arama);
  assert.ok(paket.harita);
});
