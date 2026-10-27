import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { z } from 'zod';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { ikiliCevap, uc, uclariKaydet } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { DOSYA_PARCASI, dosyaParametresi } from '#paylasilan/sozlesme/dosya.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { denetimSatiri, dosyaTutamagi, modulDeposuTutamagi } from './disari.ts';
import { isiBirKezCalistir, modulIsleriniKesfet } from '#cekirdek/zamanlayici.ts';
import { DOSYA_SINIRI, ILETILER, TEMIZLIK_SINIRI, TEMIZLIK_TUR_SORGUSU } from './kurallar.ts';
import type { DosyaSiniri } from './kurallar.ts';
import { dosyaParcasi } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const MODUL = 'deneme';
// Bağ tutamağı gerçek bir modül klasörü adı ister; testin bağları bu modülün adıyla yazılır.
const dosyalar = dosyaTutamagi('kisiler');

interface Oturum { cerez: string; id: number }

// Sentetik içerik: imzası türü belirler, gerisi rastgele (gerçek belge yok).
const pdf = (boyut = 3000): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(boyut - 9)]);
const ozetOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

describe('dosya saklama (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let a: Oturum;
  let b: Oturum;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const kullanici = (o: Oturum): Kullanici => ({ id: o.id, ad: 'deneme', islemler: [] });

  async function girisYap(rolKodu: string, yoneticiId: number | null): Promise<Oturum> {
    const kullaniciAdi = `dosya-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (yoneticiId !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yonetici = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
        await rolAl(db, yoneticiId, yeni, yonetici?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (o: Oturum, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: o.cerez }, payload: govde as object });
  const oku = (o: Oturum | null, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: o === null ? {} : { cookie: o.cerez } });

  // İçeriği parça parça yükler; son cevabı döner.
  async function yukle(o: Oturum, icerik: Buffer, ozet = ozetOf(icerik), parcaBoyu = 1000): Promise<LightMyRequestResponse> {
    const toplam = Math.ceil(icerik.length / parcaBoyu);
    let son: LightMyRequestResponse | null = null;
    for (let sira = 0; sira < toplam; sira += 1) {
      son = await gonder(o, `/dosyalar/${ozet}/parca`, { sira, toplam, veri: icerik.subarray(sira * parcaBoyu, (sira + 1) * parcaBoyu).toString('base64') });
      if (son.statusCode !== 200 || son.json().tamam === true) return son;
    }
    if (son === null) throw new Error('boş içerik');
    return son;
  }
  const sayi = async (sql: string, p: unknown[]): Promise<number> => (await vt().tek<{ n: number }>(sql, p))?.n ?? -1;
  const dosyaSayisi = (ozet: string) => sayi('SELECT count(*)::int AS n FROM dosya WHERE ozet = $1', [ozet]);
  const seritSayisi = (ozet: string, kisi: number) => sayi('SELECT count(*)::int AS n FROM dosya_yuklemesi WHERE ozet = $1 AND yukleyen_id = $2', [ozet, kisi]);
  // Temizlik zamanlanmış işin tek turudur; iş açılıştaki keşiften alınır ve zamanlayıcının yolundan (kilit ve transaction) koşar.
  const temizlikTuru = async (): Promise<void> => {
    const is = (await modulIsleriniKesfet()).find((i) => i.ad === 'dosya-temizlik');
    if (!is) throw new Error('dosya-temizlik işi yok');
    assert.equal(await isiBirKezCalistir(vt(), is), 'tamam');
  };
  // Uç katmanının yaptığı gibi: yazıları koruyan ret transaction'ı kalıcı kılar.
  const servisle = (o: Oturum, ozet: string, g: { sira: number; toplam: number; veri: string }, sinir: DosyaSiniri) =>
    vt().tx(async (db) => {
      try {
        return await dosyaParcasi(db, kullanici(o), ozet, g, sinir);
      } catch (hata) {
        if (hata instanceof UygulamaHatasi && hata.yazilarKalir) return hata;
        throw hata;
      }
    });

  before(async () => {
    ortam = await testVeritabaniKur('dosya');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    a = await girisYap('yonetici', null);
    b = await girisYap('operator', a.id);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('DSK-01 aynı içerik iki kez yüklenince tek dosya satırı; içeriği daha önce gönderen ilk parçada "tamam" alır, ilk kez gönderen bütün içeriği gönderir', async () => {
    const icerik = pdf();
    const ozet = ozetOf(icerik);
    const ilkParca = { sira: 0, toplam: 3, veri: icerik.subarray(0, 1000).toString('base64') };
    assert.deepEqual((await gonder(a, '/dosyalar/eksikler', { ozetler: [ozet] })).json(), { eksikler: [ozet] });
    assert.deepEqual((await gonder(a, `/dosyalar/${ozet}/parca`, ilkParca)).json(), { tamam: false });
    assert.deepEqual((await yukle(a, icerik)).json(), { tamam: true });
    assert.equal(await dosyaSayisi(ozet), 1);
    assert.equal(await sayi('SELECT count(*)::int AS n FROM dosya_icerigi WHERE ozet = $1', [ozet]), 3);
    assert.equal(await seritSayisi(ozet, a.id), 0);
    assert.deepEqual((await gonder(a, `/dosyalar/${ozet}/parca`, ilkParca)).json(), { tamam: true }, 'kendi gönderdiği içerik');
    assert.deepEqual((await gonder(b, '/dosyalar/eksikler', { ozetler: [ozet] })).json(), { eksikler: [ozet] }, 'depoda olsa da B göndermedi');
    assert.deepEqual((await gonder(b, `/dosyalar/${ozet}/parca`, ilkParca)).json(), { tamam: false });
    assert.deepEqual((await yukle(b, icerik)).json(), { tamam: true });
    assert.equal(await dosyaSayisi(ozet), 1);
    assert.equal(await sayi('SELECT count(*)::int AS n FROM dosya_icerigi WHERE ozet = $1', [ozet]), 3);
    assert.equal(await sayi('SELECT count(*)::int AS n FROM dosya_yukleyeni WHERE ozet = $1', [ozet]), 2);
    assert.equal(await seritSayisi(ozet, b.id), 0);
    assert.deepEqual((await gonder(b, '/dosyalar/eksikler', { ozetler: [ozet] })).json(), { eksikler: [] });
  });

  test('DSK-02 özet tutmazsa şerit atılır, 400; dosya oluşmaz', async () => {
    const icerik = pdf();
    const yanlis = ozetOf(Buffer.from('baska'));
    const cevap = await yukle(a, icerik, yanlis);
    assert.equal(cevap.statusCode, 400);
    assert.equal(cevap.json().alan, 'ozet');
    assert.equal(await dosyaSayisi(yanlis), 0);
    assert.equal(await seritSayisi(yanlis, a.id), 0);
  });

  test('DSK-03 dosya sınırı aşılınca 413 ve şerit atılır; depo toplamı aşılınca 429 ve kimsenin şeridi atılmaz', async () => {
    const icerik = pdf(1600);
    const ozet = ozetOf(icerik);
    const parca = (sira: number) => ({ sira, toplam: 2, veri: icerik.subarray(sira * 800, (sira + 1) * 800).toString('base64') });
    const dar = { ...DOSYA_SINIRI, dosyaBayt: 1500 };
    assert.equal(await servisle(a, ozet, parca(0), dar), false);
    const ret = await servisle(a, ozet, parca(1), dar);
    assert.ok(ret instanceof UygulamaHatasi && ret.kod === 'COK_BUYUK' && ret.durum === 413);
    assert.equal(await seritSayisi(ozet, a.id), 0);
    // Sınırın tam üstü geçer.
    assert.equal(await servisle(a, ozet, parca(0), { ...dar, dosyaBayt: 1600 }), false);
    assert.equal(await servisle(a, ozet, parca(1), { ...dar, dosyaBayt: 1600 }), true);

    const baskasi = pdf();
    await servisle(b, ozetOf(baskasi), { sira: 0, toplam: 2, veri: baskasi.subarray(0, 500).toString('base64') }, DOSYA_SINIRI);
    const simdiki = (await vt().tek<{ b: number }>(
      'SELECT (SELECT coalesce(sum(boyut), 0) FROM dosya)::float8 + (SELECT coalesce(sum(length(icerik)), 0) FROM dosya_yuklemesi)::float8 AS b'))?.b ?? 0;
    const yeni = pdf();
    await assert.rejects(
      servisle(a, ozetOf(yeni), { sira: 0, toplam: 2, veri: yeni.subarray(0, 500).toString('base64') }, { ...DOSYA_SINIRI, depoBayt: simdiki + 100 }),
      (h: UygulamaHatasi) => h.kod === 'COK_ISTEK',
    );
    assert.equal(await seritSayisi(ozetOf(baskasi), b.id), 1);
  });

  test('DSK-04 kişi kotası: altıncı açık yüklemede kişinin en eski açık yüklemesi atılır, başkasınınki kalır', async () => {
    await vt().sorgu('DELETE FROM dosya_yuklemesi WHERE yukleyen_id = ANY($1)', [[a.id, b.id]]);
    const baslat = async (o: Oturum): Promise<string> => {
      const icerik = pdf();
      const ozet = ozetOf(icerik);
      assert.equal((await gonder(o, `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 3, veri: icerik.subarray(0, 1000).toString('base64') })).statusCode, 200);
      return ozet;
    };
    const baskasininki = await baslat(b);
    // Başkasının şeridi en eskidir: kişi koşulu olmasa ilk atılacak olan odur.
    await vt().sorgu("UPDATE dosya_yuklemesi SET zaman = now() - interval '2 hours' WHERE ozet = $1", [baskasininki]);
    const acik: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      acik.push(await baslat(a));
      await vt().sorgu("UPDATE dosya_yuklemesi SET zaman = now() - make_interval(mins => $2) WHERE ozet = $1", [acik[i], 60 - i]);
    }
    const altinci = await baslat(a);
    assert.equal(await seritSayisi(acik[0] ?? '', a.id), 0, 'en eski atıldı');
    for (const o of [...acik.slice(1), altinci]) assert.equal(await seritSayisi(o, a.id), 1);
    assert.equal(await seritSayisi(baskasininki, b.id), 1, 'başkasının yüklemesi atılmaz');
  });

  test('DSK-05 tür içerikten bulunur: imzasız içerik 400 ve şerit atılır; PDF imzalı içerik kabul', async () => {
    const html = Buffer.concat([Buffer.from('<!doctype html><script>alert(1)</script>'), randomBytes(500)]);
    const cevap = await yukle(a, html);
    assert.equal(cevap.statusCode, 400);
    assert.equal(cevap.json().alan, 'veri');
    assert.equal(await dosyaSayisi(ozetOf(html)), 0);
    assert.equal(await seritSayisi(ozetOf(html), a.id), 0);
    const kabul = pdf();
    assert.equal((await yukle(a, kabul)).statusCode, 200);
    assert.equal((await vt().tek<{ tur: string }>('SELECT tur FROM dosya WHERE ozet = $1', [ozetOf(kabul)]))?.tur, 'pdf');
  });

  test('DSK-05 3B model ve çizim türleri (kart #749): GLB, glTF ve DXF kabul edilir, tür sütununa yazılır', async () => {
    const icerikler: [Buffer, string][] = [
      [Buffer.concat([Buffer.from('glTF'), randomBytes(600)]), 'glb'],
      [Buffer.from(`{"asset": {"version": "2.0"}, "extras": "${randomBytes(300).toString('hex')}"}`, 'utf8'), 'gltf'],
      [Buffer.from(`  0\nSECTION\n  2\nHEADER\n999\n${randomBytes(300).toString('hex')}\n`, 'latin1'), 'dxf'],
    ];
    for (const [icerik, tur] of icerikler) {
      assert.equal((await yukle(a, icerik)).statusCode, 200, tur);
      assert.equal((await vt().tek<{ tur: string }>('SELECT tur FROM dosya WHERE ozet = $1', [ozetOf(icerik)]))?.tur, tur);
    }
  });

  test('DSK-06 başkasının şeridine yazılamaz ve onu engelleyemez: iki kişi aynı özeti kendi şeridinde yükler', async () => {
    const icerik = pdf();
    const ozet = ozetOf(icerik);
    await gonder(a, `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 3, veri: icerik.subarray(0, 1000).toString('base64') });
    // B aynı özete bozuk parça gönderir: yalnız kendi şeridi düşer.
    const bozuk = await gonder(b, `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: Buffer.from('bozuk').toString('base64') });
    assert.equal(bozuk.statusCode, 400);
    assert.equal(await seritSayisi(ozet, a.id), 1);
    assert.equal(await seritSayisi(ozet, b.id), 0);
    assert.deepEqual((await yukle(a, icerik)).json(), { tamam: true });
  });

  test('DSK-07 bağsız dosyayı yalnız yükleyen okur; başkası ve oturumsuz okuyamaz; bağlanınca yükleyen de bu uçtan okuyamaz', async () => {
    const icerik = pdf(DOSYA_PARCASI + 1000);
    const ozet = ozetOf(icerik);
    assert.deepEqual((await yukle(a, icerik, ozet, DOSYA_PARCASI)).json(), { tamam: true });
    const kendi = await oku(a, `/dosyalar/${ozet}`);
    assert.equal(kendi.statusCode, 200);
    assert.deepEqual(kendi.rawPayload, icerik);
    assert.equal(kendi.headers['content-type'], 'application/pdf');
    assert.equal((await oku(b, `/dosyalar/${ozet}`)).statusCode, 404);
    assert.equal((await oku(null, `/dosyalar/${ozet}`)).statusCode, 401);
    await vt().tx((db) => dosyalar.dosyaBagla(db, kullanici(a), { ozet, kayit: 'k-7', ad: 'Çizim.pdf', belgeTuru: null }, { turler: ['pdf'], azamiBayt: 1e9 }));
    assert.equal((await oku(a, `/dosyalar/${ozet}`)).statusCode, 404);
  });

  test('DSK-08 bağ kaldırılınca dosya 7 gün kalır, sonra silinir; bağı olan dosya süresi geçse de silinmez', async () => {
    const bagli = pdf();
    const birakilan = pdf();
    const yeniBirakilan = pdf();
    for (const d of [bagli, birakilan, yeniBirakilan]) assert.equal((await yukle(a, d)).statusCode, 200);
    const sinir = { turler: ['pdf'] as const, azamiBayt: 1e9 };
    await vt().tx(async (db) => {
      for (const [d, kayit] of [[bagli, 'k-8a'], [birakilan, 'k-8b'], [yeniBirakilan, 'k-8c']] as const) {
        await dosyalar.dosyaBagla(db, kullanici(a), { ozet: ozetOf(d), kayit, ad: 'a.pdf', belgeTuru: null }, sinir);
      }
    });
    await vt().tx(async (db) => { await dosyalar.bagKaldir(db, 'k-8b', null); await dosyalar.bagKaldir(db, 'k-8c', ozetOf(yeniBirakilan)); });
    // Bağlı dosyanın sayacı da geçmiş olsa (elle) silinmez: yabancı anahtar ve bağ koşulu korur.
    await vt().sorgu("UPDATE dosya SET bagsiz_zaman = now() - interval '8 days' WHERE ozet = ANY($1)", [[ozetOf(bagli), ozetOf(birakilan)]]);
    await vt().sorgu("UPDATE dosya SET bagsiz_zaman = now() - interval '6 days' WHERE ozet = $1", [ozetOf(yeniBirakilan)]);
    await temizlikTuru();
    assert.equal(await dosyaSayisi(ozetOf(birakilan)), 0, '7 günü geçen bağsız dosya silindi');
    assert.equal(await sayi('SELECT count(*)::int AS n FROM dosya_icerigi WHERE ozet = $1', [ozetOf(birakilan)]), 0);
    assert.equal(await dosyaSayisi(ozetOf(yeniBirakilan)), 1, '7 günü dolmayan kalır');
    assert.equal(await dosyaSayisi(ozetOf(bagli)), 1, 'bağı olan kalır');
    await assert.rejects(vt().sorgu('DELETE FROM dosya WHERE ozet = $1', [ozetOf(bagli)]), /dosya_bagi/);
  });

  test('bağ: modül sınırı tür ve boyutu denetler; liste ve akış yalnız o kaydın dosyasını verir', async () => {
    const icerik = pdf(2000);
    const ozet = ozetOf(icerik);
    await yukle(b, icerik);
    const bagla = (sinir: { turler: readonly ('pdf' | 'png')[]; azamiBayt: number }, kayit = 'k-9') =>
      vt().tx((db) => dosyalar.dosyaBagla(db, kullanici(b), { ozet, kayit, ad: '  Sertifika.pdf ', belgeTuru: 'sertifika' }, sinir));
    await assert.rejects(bagla({ turler: ['png'], azamiBayt: 1e9 }), (h: UygulamaHatasi) => h.kod === 'DOGRULAMA');
    await assert.rejects(bagla({ turler: ['pdf'], azamiBayt: 1999 }), (h: UygulamaHatasi) => h.kod === 'COK_BUYUK');
    await assert.rejects(
      vt().tx((db) => dosyalar.dosyaBagla(db, kullanici(b), { ozet: ozetOf(Buffer.from('yok')), kayit: 'k-9', ad: 'a', belgeTuru: null }, { turler: ['pdf'], azamiBayt: 1e9 })),
      (h: UygulamaHatasi) => h.kod === 'DOGRULAMA' && h.alan === 'ozet');
    const bag = await bagla({ turler: ['pdf'], azamiBayt: 2000 });
    assert.deepEqual({ ...bag, zaman: typeof bag.zaman }, { ozet, ad: 'Sertifika.pdf', boyut: 2000, tur: 'pdf', belgeTuru: 'sertifika', ekleyenId: b.id, zaman: 'string' });
    assert.deepEqual((await vt().tx((db) => dosyalar.bagliDosyalar(db, 'k-9'))).map((d) => d.ozet), [ozet]);
    assert.deepEqual(await vt().tx((db) => dosyalar.bagliDosyalar(db, 'baska-kayit')), []);
    assert.equal(await vt().tx((db) => dosyalar.dosyaAkisi(db, 'baska-kayit', ozet)), null);
    assert.notEqual(await vt().tx((db) => dosyalar.dosyaAkisi(db, 'k-9', ozet)), null);
  });

  test('tutamak: başka modülün tutamağı bağı göremez, akıtamaz, kaldıramaz; sahibi görür ve kaldırır; klasörü olmayan ad reddedilir', async () => {
    const icerik = pdf(1800);
    const ozet = ozetOf(icerik);
    assert.equal((await yukle(a, icerik)).statusCode, 200);
    const sinir = { turler: ['pdf'] as const, azamiBayt: 1e9 };
    const yabanci = dosyaTutamagi('stok');
    await vt().tx((db) => dosyalar.dosyaBagla(db, kullanici(a), { ozet, kayit: 'k-tut', ad: 'a.pdf', belgeTuru: null }, sinir));
    assert.deepEqual(await vt().tx((db) => yabanci.bagliDosyalar(db, 'k-tut')), []);
    assert.equal(await vt().tx((db) => yabanci.dosyaAkisi(db, 'k-tut', ozet)), null);
    assert.deepEqual(await vt().tx((db) => yabanci.bagKaldir(db, 'k-tut', null)), []);
    assert.deepEqual(await vt().tx((db) => yabanci.bagKaldir(db, 'k-tut', ozet)), []);
    assert.deepEqual((await vt().tx((db) => dosyalar.bagliDosyalar(db, 'k-tut'))).map((d) => d.ozet), [ozet], 'yabancı kaldırma bağa dokunmadı');
    assert.notEqual(await vt().tx((db) => dosyalar.dosyaAkisi(db, 'k-tut', ozet)), null);
    assert.deepEqual((await vt().tx((db) => dosyalar.bagKaldir(db, 'k-tut', null))).map((d) => d.ozet), [ozet]);
    assert.deepEqual(await vt().tx((db) => dosyalar.bagliDosyalar(db, 'k-tut')), []);
    assert.equal(dosyaTutamagi('cizimler').modul, 'cizimler');
    for (const ad of ['olmayan-modul', '', '../dosya', 'dosya/', 'Kisiler', 'kisiler ', '.']) {
      assert.throws(() => dosyaTutamagi(ad), /modül klasörü yok/, ad);
    }
  });

  test('modül şeridinden içerik (kart #732): özet doğrulanır, tür içerikten bulunur, 1 MB altı parçalarla yazılır, kişi yükleyen olur', async () => {
    const arkon = modulDeposuTutamagi('arkon');
    const icerik = pdf(DOSYA_PARCASI * 2 + 10);
    const ozet = ozetOf(icerik);
    await assert.rejects(vt().tx((db) => arkon.icerikYaz(db, a.id, ozetOf(Buffer.from('baska')), icerik)), (h: UygulamaHatasi) => h.kod === 'DOGRULAMA' && h.alan === 'ozet');
    assert.equal(await dosyaSayisi(ozet), 0);
    assert.equal(await vt().tx((db) => arkon.icerikYaz(db, a.id, ozet, icerik)), 'pdf');
    assert.equal(await sayi('SELECT count(*)::int AS n FROM dosya_icerigi WHERE ozet = $1', [ozet]), 3);
    assert.equal(await sayi('SELECT boyut::int AS n FROM dosya WHERE ozet = $1', [ozet]), icerik.length);
    // İkinci kez yazan yalnız yükleyen olur; içerik yeniden yazılmaz.
    assert.equal(await vt().tx((db) => arkon.icerikYaz(db, b.id, ozet, icerik)), 'pdf');
    assert.equal(await sayi('SELECT count(*)::int AS n FROM dosya_yukleyeni WHERE ozet = $1', [ozet]), 2);
    // Yükleyen olduğu için kişi bağlayabilir (DSb korunur).
    await vt().tx((db) => arkon.dosyaBagla(db, kullanici(b), { ozet, kayit: 'depo', ad: 'a.pdf', belgeTuru: null }, { turler: ['pdf'], azamiBayt: 1e9 }));
    assert.deepEqual(await vt().tx((db) => arkon.bagliOlanlar(db, 'depo', [ozet, ozetOf(Buffer.from('yok'))])), [ozet]);
    // İmzasız içerik ikili türüyle girer (karar 743 a); kişinin yükleme ucu aynı içeriği reddeder (DSK-05).
    const imzasiz = randomBytes(3000);
    assert.equal(await vt().tx((db) => arkon.icerikYaz(db, a.id, ozetOf(imzasiz), imzasiz)), 'ikili');
    assert.equal(await sayi("SELECT count(*)::int AS n FROM dosya WHERE ozet = $1 AND tur = 'ikili'", [ozetOf(imzasiz)]), 1);
  });

  test('kaynaktan bağlama (karar 732 a): başka modülde bağlı dosyayı sunucu kişisiz bağlar; bağsız ya da yalnız kendi modülünde bağlı dosyada ret', async () => {
    const arkon = modulDeposuTutamagi('arkon');
    const cizimler = dosyaTutamagi('cizimler');
    const sinir = { turler: ['pdf'] as const, azamiBayt: 1e9 };
    const icerik = pdf(2200);
    const ozet = ozetOf(icerik);
    assert.equal((await yukle(a, icerik)).statusCode, 200);
    const kaynaktan = (kayit: string) => vt().tx((db) => arkon.kaynaktanBagla(db, { ozet, kayit, ad: ' Resim.pdf ', belgeTuru: null }, b.id, sinir));
    await assert.rejects(kaynaktan('paket-1'), (h: UygulamaHatasi) => h.kod === 'DOGRULAMA' && h.alan === 'ozet', 'bağsız dosya');
    await assert.rejects(
      vt().tx((db) => arkon.kaynaktanBagla(db, { ozet: ozetOf(Buffer.from('yok')), kayit: 'p', ad: 'a', belgeTuru: null }, b.id, sinir)),
      (h: UygulamaHatasi) => h.kod === 'DOGRULAMA');
    await vt().tx((db) => cizimler.dosyaBagla(db, kullanici(a), { ozet, kayit: 'revizyon-1', ad: 'r.pdf', belgeTuru: null }, sinir));
    await assert.rejects(
      vt().tx((db) => arkon.kaynaktanBagla(db, { ozet, kayit: 'p', ad: 'a', belgeTuru: null }, b.id, { turler: ['png'], azamiBayt: 1e9 })),
      (h: UygulamaHatasi) => h.kod === 'DOGRULAMA', 'modülün tür sınırı geçerli');
    const bag = await kaynaktan('paket-1');
    assert.deepEqual({ ozet: bag.ozet, ad: bag.ad, ekleyenId: bag.ekleyenId }, { ozet, ad: 'Resim.pdf', ekleyenId: b.id });
    assert.notEqual(await vt().tx((db) => arkon.dosyaAkisi(db, 'paket-1', ozet)), null);
    // Kaynak bağ kalkınca yalnız kendi modülünde bağlı dosya yeni kayda kaynaktan bağlanamaz.
    await vt().tx((db) => cizimler.bagKaldir(db, 'revizyon-1', ozet));
    await assert.rejects(kaynaktan('paket-2'), (h: UygulamaHatasi) => h.kod === 'DOGRULAMA');
  });

  test('DSK-11 bağlamayı yalnız içeriği kendisi gönderen yapar: özeti bilen ret alır, yanlış içerikle de kazanamaz; doğru içeriği gönderince bağlar', async () => {
    const icerik = pdf();
    const ozet = ozetOf(icerik);
    assert.equal((await yukle(a, icerik)).statusCode, 200);
    const sinir = { turler: ['pdf'] as const, azamiBayt: 1e9 };
    const bBaglar = () => vt().tx((db) => dosyalar.dosyaBagla(db, kullanici(b), { ozet, kayit: 'k-11b', ad: 'a.pdf', belgeTuru: null }, sinir));
    await assert.rejects(bBaglar(), (h: UygulamaHatasi) => h.kod === 'DOGRULAMA' && h.alan === 'ozet' && h.message === 'Dosya yüklenmemiş.');
    assert.equal((await oku(b, `/dosyalar/${ozet}`)).statusCode, 404);
    const yanlis = await yukle(b, pdf(), ozet);
    assert.equal(yanlis.statusCode, 400);
    assert.equal(yanlis.json().alan, 'ozet');
    await assert.rejects(bBaglar(), (h: UygulamaHatasi) => h.kod === 'DOGRULAMA');
    assert.equal(await sayi('SELECT count(*)::int AS n FROM dosya_bagi WHERE kayit = $1', ['k-11b']), 0);
    assert.equal((await yukle(b, icerik)).statusCode, 200);
    assert.equal((await oku(b, `/dosyalar/${ozet}`)).statusCode, 200);
    assert.equal((await bBaglar()).ekleyenId, b.id);
  });

  test('DSK-12 kişinin bağlamadığı dosyalar sınırı doldurunca yeni parça 429; bağlayınca yer açılır; sınırın tam üstü geçer', async () => {
    const bagsiz = async (): Promise<number> => sayi(
      'SELECT coalesce(sum(d.boyut), 0)::int AS n FROM dosya d JOIN dosya_yukleyeni y USING (ozet) WHERE y.kisi_id = $1 AND d.bagsiz_zaman IS NOT NULL', [a.id]);
    const eldeki = pdf(1500);
    assert.equal((await yukle(a, eldeki)).statusCode, 200);
    const simdiki = await bagsiz();
    assert.ok(simdiki >= 1500);
    const dar = { ...DOSYA_SINIRI, kisiBagsizBayt: simdiki + 500 };
    const yeni = pdf();
    const parca = (n: number) => ({ sira: 0, toplam: 9, veri: yeni.subarray(0, n).toString('base64') });
    await assert.rejects(servisle(a, ozetOf(yeni), parca(501), dar), (h: UygulamaHatasi) => h.kod === 'COK_ISTEK' && h.message === ILETILER.kotaBagsiz);
    assert.equal(await servisle(a, ozetOf(yeni), parca(500), dar), false);
    await vt().sorgu('DELETE FROM dosya_yuklemesi WHERE yukleyen_id = $1', [a.id]);
    await vt().tx((db) => dosyalar.dosyaBagla(db, kullanici(a), { ozet: ozetOf(eldeki), kayit: 'k-12', ad: 'a.pdf', belgeTuru: null }, { turler: ['pdf'], azamiBayt: 1e9 }));
    assert.equal(await servisle(a, ozetOf(yeni), parca(501), dar), false, 'bağlanan dosya sayılmaz');
  });

  test('DSK-13 bayat şerit bütün olarak silinir: son parçası bir günden eski şerit gider, eski parçalı ama yeni parçası olan şerit kalır', async () => {
    const bayat = pdf();
    const suren = pdf();
    for (const d of [bayat, suren]) {
      for (const sira of [0, 1]) await gonder(b, `/dosyalar/${ozetOf(d)}/parca`, { sira, toplam: 3, veri: d.subarray(sira * 1000, (sira + 1) * 1000).toString('base64') });
    }
    await vt().sorgu("UPDATE dosya_yuklemesi SET zaman = now() - interval '2 days' WHERE yukleyen_id = $1 AND ozet = $2", [b.id, ozetOf(bayat)]);
    await vt().sorgu("UPDATE dosya_yuklemesi SET zaman = now() - interval '2 days' WHERE yukleyen_id = $1 AND ozet = $2 AND sira = 0", [b.id, ozetOf(suren)]);
    await temizlikTuru();
    assert.equal(await seritSayisi(ozetOf(bayat), b.id), 0);
    assert.equal(await seritSayisi(ozetOf(suren), b.id), 2);
    assert.deepEqual((await gonder(b, `/dosyalar/${ozetOf(suren)}/parca`, { sira: 2, toplam: 3, veri: suren.subarray(2000).toString('base64') })).json(), { tamam: true });
  });

  test('temizlik yalnız işte: yükleme bayat şeridi ve süresi dolmuş bağsız dosyayı silmez; işin turu siler', async () => {
    const bayat = pdf();
    const birakilan = pdf();
    assert.equal((await yukle(a, birakilan)).statusCode, 200);
    await gonder(b, `/dosyalar/${ozetOf(bayat)}/parca`, { sira: 0, toplam: 3, veri: bayat.subarray(0, 1000).toString('base64') });
    await vt().sorgu("UPDATE dosya_yuklemesi SET zaman = now() - interval '2 days' WHERE yukleyen_id = $1 AND ozet = $2", [b.id, ozetOf(bayat)]);
    await vt().sorgu("UPDATE dosya SET bagsiz_zaman = now() - interval '8 days' WHERE ozet = $1", [ozetOf(birakilan)]);
    assert.equal((await yukle(a, pdf())).statusCode, 200);
    assert.equal(await seritSayisi(ozetOf(bayat), b.id), 1, 'yükleme bayat şeridi silmez');
    assert.equal(await dosyaSayisi(ozetOf(birakilan)), 1, 'yükleme bağsız dosyayı silmez');
    await temizlikTuru();
    assert.equal(await seritSayisi(ozetOf(bayat), b.id), 0);
    assert.equal(await dosyaSayisi(ozetOf(birakilan)), 0);
  });

  test('temizlik turu tek sorgunun sınırını aşan birikimi de siler; tur sınırını aşanı sonraki tura bırakır', async () => {
    const adet = TEMIZLIK_SINIRI.serit * TEMIZLIK_TUR_SORGUSU + 3;
    const ozetler = Array.from({ length: adet }, () => ozetOf(randomBytes(16)));
    await vt().sorgu(
      `INSERT INTO dosya_yuklemesi (ozet, yukleyen_id, sira, toplam, icerik, zaman)
       SELECT o, $2, 0, 2, '\\x01'::bytea, now() - interval '2 days' FROM unnest($1::text[]) AS o`,
      [ozetler, b.id]);
    const kalan = () => sayi('SELECT count(*)::int AS n FROM dosya_yuklemesi WHERE ozet = ANY($1)', [ozetler]);
    await temizlikTuru();
    assert.equal(await kalan(), 3, 'bir turda tur sınırı kadar şerit silinir');
    await temizlikTuru();
    assert.equal(await kalan(), 0);
  });

  test('DSK-14 aynı dosyanın iki bağı aynı anda kaldırılınca bağsız sayımı başlar', async () => {
    const icerik = pdf();
    const ozet = ozetOf(icerik);
    assert.equal((await yukle(a, icerik)).statusCode, 200);
    const sinir = { turler: ['pdf'] as const, azamiBayt: 1e9 };
    await vt().tx(async (db) => {
      for (const kayit of ['k-14a', 'k-14b']) await dosyalar.dosyaBagla(db, kullanici(a), { ozet, kayit, ad: 'a.pdf', belgeTuru: null }, sinir);
    });
    let birak = (): void => undefined;
    const kapi = new Promise<void>((coz) => { birak = coz; });
    const birinci = vt().tx(async (db) => { await dosyalar.bagKaldir(db, 'k-14a', ozet); await kapi; });
    await new Promise((coz) => setTimeout(coz, 100));
    const ikinci = vt().tx((db) => dosyalar.bagKaldir(db, 'k-14b', ozet));
    await new Promise((coz) => setTimeout(coz, 200));
    birak();
    await Promise.all([birinci, ikinci]);
    assert.equal(await sayi('SELECT count(*)::int AS n FROM dosya WHERE ozet = $1 AND bagsiz_zaman IS NOT NULL', [ozet]), 1);
  });

  test('yükleme uçları: oturumsuz 401; biçimsiz özet 400 ve hiçbir şey yazılmaz', async () => {
    for (const yol of ['/dosyalar/eksikler', `/dosyalar/${'a'.repeat(64)}/parca`]) {
      const cevap = await app.inject({ method: 'POST', url: `/api${yol}`, payload: { ozetler: ['a'.repeat(64)], sira: 0, toplam: 1, veri: 'eA==' } });
      assert.equal(cevap.statusCode, 401, yol);
    }
    const once = await sayi('SELECT count(*)::int AS n FROM dosya_yuklemesi', []);
    for (const ozet of ['A'.repeat(64), 'a'.repeat(63), '../etc']) {
      assert.equal((await gonder(a, `/dosyalar/${encodeURIComponent(ozet)}/parca`, { sira: 0, toplam: 1, veri: 'eA==' })).statusCode, 400, ozet);
    }
    assert.equal((await gonder(a, '/dosyalar/eksikler', { ozetler: ['xyz'] })).statusCode, 400);
    assert.equal(await sayi('SELECT count(*)::int AS n FROM dosya_yuklemesi', []), once);
    assert.equal((await gonder(a, `/dosyalar/${'a'.repeat(64)}/parca`, { sira: 0, toplam: 2, veri: 'eA==' })).statusCode, 200, 'biçimli özet kabul');
  });

  describe('bağlayan modülün uçları (DSK-09, DSK-10)', () => {
    let app2: FastifyInstance;
    const parametre = dosyaParametresi.extend({ kayit: z.string() });
    const sinir = { turler: ['pdf'] as const, azamiBayt: 1e9 };

    before(async () => {
      // Bağlayan modül örneği: indirme kendi okuma işlemiyle (burada kisiler.oku), bağ ve kaldırma kendi yazma işlemiyle.
      app2 = await uygulamaKur({ vt: vt(), ayar: ortam!.ayar, kimlik: kimlikCozucu(vt()), denetle: denetimYaz });
      uclariKaydet(app2, [
        uc({
          yontem: 'POST', yol: '/deneme/:kayit/belgeler/:ozet/bagla', yetki: 'kisiler.yaz', parametre, cevap: z.object({ tamam: z.literal(true) }),
          isle: async ({ db, kullanici: k, parametre: p, denetimEki }) => {
            const bag = await dosyalar.dosyaBagla(db, k, { ozet: p.ozet, kayit: p.kayit, ad: 'Rapor "son".pdf', belgeTuru: null }, sinir);
            denetimEki([denetimSatiri('bagla', bag)]);
            return { tamam: true as const };
          },
        }),
        uc({
          yontem: 'POST', yol: '/deneme/:kayit/belgeler/:ozet/kaldir', yetki: 'kisiler.yaz', parametre, cevap: z.object({ tamam: z.literal(true) }),
          isle: async ({ db, parametre: p, denetimEki }) => {
            denetimEki((await dosyalar.bagKaldir(db, p.kayit, p.ozet)).map((d) => denetimSatiri('kaldir', d)));
            return { tamam: true as const };
          },
        }),
        uc({
          yontem: 'GET', yol: '/deneme/:kayit/belgeler/:ozet', yetki: 'kisiler.oku', parametre, cevap: ikiliCevap,
          isle: async ({ db, parametre: p }) => {
            const akis = await dosyalar.dosyaAkisi(db, p.kayit, p.ozet);
            if (akis === null) throw new UygulamaHatasi('BULUNAMADI', 'Dosya yok.');
            return akis;
          },
        }),
      ], { vt: vt(), kimlik: kimlikCozucu(vt()), denetle: denetimYaz, modul: MODUL });
    });
    after(async () => { await app2?.close(); });

    const istek = (o: Oturum, yontem: 'GET' | 'POST', yol: string) =>
      app2.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: o.cerez } });

    test('DSK-09 indirme bağlayan modülün okuma işlemiyle: doğru başlık, nosniff, kaçırılmış ad; işlemi olmayan 403, bağı olmayan kayıt 404', async () => {
      const icerik = pdf(DOSYA_PARCASI * 2 + 7);
      const ozet = ozetOf(icerik);
      assert.equal((await yukle(a, icerik, ozet, DOSYA_PARCASI)).statusCode, 200);
      assert.equal((await istek(a, 'POST', `/deneme/k-10/belgeler/${ozet}/bagla`)).statusCode, 200);
      const cevap = await istek(a, 'GET', `/deneme/k-10/belgeler/${ozet}`);
      assert.equal(cevap.statusCode, 200);
      assert.deepEqual(cevap.rawPayload, icerik);
      assert.equal(cevap.headers['content-length'], String(icerik.length));
      assert.equal(cevap.headers['x-content-type-options'], 'nosniff');
      assert.match(String(cevap.headers['content-disposition']), /^attachment; filename="Rapor _son_.pdf"; filename\*=UTF-8''Rapor%20%22son%22\.pdf$/);
      assert.equal((await istek(b, 'GET', `/deneme/k-10/belgeler/${ozet}`)).statusCode, 403);
      assert.equal((await istek(a, 'GET', `/deneme/baska/belgeler/${ozet}`)).statusCode, 404);
    });

    test('DSK-10 bağlama ve kaldırma denetim kaydına özet, ad, boyut ve türle girer; içerik girmez; yükleme kaydı gövdesizdir', async () => {
      const icerik = pdf(1500);
      const ozet = ozetOf(icerik);
      assert.equal((await yukle(a, icerik)).statusCode, 200);
      assert.equal((await istek(a, 'POST', `/deneme/k-11/belgeler/${ozet}/bagla`)).statusCode, 200);
      assert.equal((await istek(a, 'POST', `/deneme/k-11/belgeler/${ozet}/kaldir`)).statusCode, 200);
      const kayitlar = await vt().sorgu<{ yol: string; govde: { _ek?: unknown } | null; modul: string | null }>(
        "SELECT yol, govde, modul FROM denetim_kaydi WHERE yol LIKE '/deneme/:kayit/belgeler/:ozet/%' AND parametre->>'kayit' = 'k-11' ORDER BY id");
      assert.deepEqual(kayitlar.map((k) => [k.yol, k.modul, k.govde?._ek]), [
        ['/deneme/:kayit/belgeler/:ozet/bagla', MODUL, [{ islem: 'bagla', ozet, ad: 'Rapor "son".pdf', boyut: 1500, tur: 'pdf' }]],
        ['/deneme/:kayit/belgeler/:ozet/kaldir', MODUL, [{ islem: 'kaldir', ozet, ad: 'Rapor "son".pdf', boyut: 1500, tur: 'pdf' }]],
      ]);
      const yukleme = await vt().sorgu<{ govde: Record<string, unknown> }>(
        "SELECT govde FROM denetim_kaydi WHERE yol = '/dosyalar/:ozet/parca' AND parametre->>'ozet' = $1", [ozet]);
      assert.ok(yukleme.length > 0);
      const icerikParcasi = icerik.subarray(0, 1000).toString('base64');
      for (const k of yukleme) {
        assert.deepEqual(Object.keys(k.govde).sort(), ['_ozet']);
        assert.equal(JSON.stringify(k.govde).includes(icerikParcasi.slice(0, 40)), false);
      }
    });
  });
});
