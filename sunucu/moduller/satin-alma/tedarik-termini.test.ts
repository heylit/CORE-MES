import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { ESKI_SURUM_ILETISI } from '#paylasilan/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tedarikIhtiyaclariniYaz, tedarikTerminleri } from './disari.ts';
import { tedarikTerminiKaydet, tedarikTerminleriListesi } from './servis.ts';

const PAROLA = 'dogru-parola-1';

describe('satin-alma tedarik termini (533 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Kullanici;
  let cerezYonetici = '';
  let m1 = 0;
  let m2 = 0;

  const vt = () => ortam!.vt;
  const giris = async (k: string): Promise<string> => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const kisiKur = async (kullaniciAdi: string, islemler: readonly string[]): Promise<string> => {
    const sahip = ortam!.sahip;
    const yoneticiRolu = (await sahip.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!;
    const gecici = (await sahip.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]))!;
    for (const islem of islemler) await sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yonetici.id, yeni, gecici.id);
      await rolAl(db, yonetici.id, yeni, yoneticiRolu.id);
    });
    return giris(kullaniciAdi);
  };
  const istek = (cerez: string, yontem: 'GET' | 'POST', yol: string, govde?: object) => app.inject({
    method: yontem, url: `/api${yol}`, headers: { cookie: cerez, ...(yontem === 'POST' ? { 'istek-kimligi': crypto.randomUUID() } : {}) },
    ...(govde === undefined ? {} : { payload: govde }),
  });
  const kartAc = async (kimlik: string, kod: string, cap: number): Promise<number> => {
    const r = await app.inject({
      method: 'POST', url: `/api/malzeme-katalogu-kartlari/${kimlik}/kaydet`, headers: { cookie: cerezYonetici, 'istek-kimligi': crypto.randomUUID() },
      payload: { kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: cap, l: 1000 }, com: { kod, ad: `Deneme ${kod}`, birim: 'adet' }, onay: { durum: 'aktif' } },
        ozet: { benzersiz_anahtar: `hammadde|tedarik-termini|${kimlik}`, mukerrer_gerekcesi: null }, surum: null },
    });
    assert.equal(r.statusCode, 200, r.body);
    return (await ortam!.sahip.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
  };

  before(async () => {
    ortam = await testVeritabaniKur('satin_alma_termin');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const id = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = { id, islemler: [] } as unknown as Kullanici;
    cerezYonetici = await giris('yonetici');
    const ayar = await app.inject({ method: 'POST', url: '/api/malzeme-katalogu-ayarlari/genel/kaydet', payload: { deger: { onayAkisi: false } }, headers: { cookie: cerezYonetici, 'istek-kimligi': crypto.randomUUID() } });
    assert.equal(ayar.statusCode, 200, ayar.body);
    m1 = await kartAc('tt-kart-1', 'HM-SAT-00001', 20);
    m2 = await kartAc('tt-kart-2', 'HM-SAT-00002', 30);
  });
  after(async () => { await ortam?.kaldir(); });

  test('satırı olmayan malzeme haritada yok (termin bekliyor); boş liste boş harita', async () => {
    assert.deepEqual(await vt().tx((db) => tedarikTerminleri(db, [m1, m2])), new Map());
    assert.deepEqual(await vt().tx((db) => tedarikTerminleri(db, [])), new Map());
    assert.deepEqual((await vt().tx((db) => tedarikTerminleriListesi(db))).terminler, []);
  });

  test('ilk termin sürümsüz yazılır, kişi ve zaman sunucudan; ikinci sürümsüz giriş 409, eski sürüm 409, doğru sürüm yazar', async () => {
    const ilk = await vt().tx((db) => tedarikTerminiKaydet(db, yonetici, { malzemeNo: m1, termin: '2026-11-10', aciklama: 'ilk', surum: null }));
    assert.equal(ilk.termin.termin, '2026-11-10');
    assert.equal(ilk.termin.surum, 1);
    assert.equal(ilk.termin.gerekenTarih, null);
    const kisi = await ortam!.sahip.tek<{ kisi_id: number }>('SELECT kisi_id FROM satin_alma_tedarik_termini WHERE malzeme_no = $1', [m1]);
    assert.equal(kisi?.kisi_id, yonetici.id);
    await assert.rejects(vt().tx((db) => tedarikTerminiKaydet(db, yonetici, { malzemeNo: m1, termin: '2026-11-12', aciklama: '', surum: null })), (h: { durum?: number }) => h.durum === 409);
    await assert.rejects(vt().tx((db) => tedarikTerminiKaydet(db, yonetici, { malzemeNo: m1, termin: '2026-11-12', aciklama: '', surum: 5 })), (h: { durum?: number; message?: string }) => h.durum === 409 && h.message === ESKI_SURUM_ILETISI);
    const ikinci = await vt().tx((db) => tedarikTerminiKaydet(db, yonetici, { malzemeNo: m1, termin: '2026-11-12', aciklama: 'gecikti', surum: 1 }));
    assert.equal(ikinci.termin.surum, 2);
    assert.equal((await vt().tx((db) => tedarikTerminleri(db, [m1]))).get(m1)?.termin, '2026-11-12');
  });

  test('termin kaldırılınca satır kalır, termin boş (termin bekler); geçmiş tarih kabul edilir', async () => {
    const r = await vt().tx((db) => tedarikTerminiKaydet(db, yonetici, { malzemeNo: m1, termin: null, aciklama: '', surum: 2 }));
    assert.equal(r.termin.termin, null);
    const gecmis = await vt().tx((db) => tedarikTerminiKaydet(db, yonetici, { malzemeNo: m1, termin: '2020-01-01', aciklama: '', surum: 3 }));
    assert.equal(gecmis.termin.termin, '2020-01-01');
  });

  test('bilinmeyen malzeme reddedilir, satır yazılmaz', async () => {
    await assert.rejects(vt().tx((db) => tedarikTerminiKaydet(db, yonetici, { malzemeNo: 2147483000, termin: '2026-11-10', aciklama: '', surum: null })), (h: { kod?: string }) => h.kod === 'DOGRULAMA');
    await assert.rejects(vt().tx((db) => tedarikIhtiyaclariniYaz(db, [{ malzemeNo: 2147483000, gerekenTarih: '2026-11-01' }])), (h: { kod?: string }) => h.kod === 'GECERSIZ');
    await assert.rejects(vt().tx((db) => tedarikIhtiyaclariniYaz(db, [{ malzemeNo: m1, gerekenTarih: '2026-11-01' }, { malzemeNo: m1, gerekenTarih: '2026-11-02' }])), (h: { kod?: string }) => h.kod === 'GECERSIZ');
    assert.equal(await vt().tx((db) => tedarikTerminleri(db, [2147483000])).then((m) => m.size), 0);
  });

  test('plan gereken tarihi yazar: sürüm artmaz, termin korunur; listede olmayanın gereken tarihi boşalır; liste ekranı dolu satırları gösterir', async () => {
    const once = (await vt().tx((db) => tedarikTerminleri(db, [m1]))).get(m1)!;
    await vt().tx((db) => tedarikIhtiyaclariniYaz(db, [{ malzemeNo: m1, gerekenTarih: '2026-11-05' }, { malzemeNo: m2, gerekenTarih: '2026-11-08' }]));
    await vt().tx((db) => tedarikIhtiyaclariniYaz(db, [{ malzemeNo: m1, gerekenTarih: '2026-11-05' }, { malzemeNo: m2, gerekenTarih: '2026-11-08' }]));
    const h = await vt().tx((db) => tedarikTerminleri(db, [m1, m2]));
    assert.deepEqual({ ...h.get(m1)!, guncelleme: once.guncelleme }, { ...once, gerekenTarih: '2026-11-05' });
    assert.equal(h.get(m1)?.surum, once.surum, 'gereken tarih sürümü artırmaz');
    assert.deepEqual([h.get(m2)?.termin, h.get(m2)?.gerekenTarih, h.get(m2)?.surum], [null, '2026-11-08', 1]);
    const cevap = await vt().tx((db) => tedarikTerminleriListesi(db));
    const liste = cevap.terminler;
    assert.deepEqual(liste.map((t) => [t.malzemeNo, t.malzemeKodu, t.kisiAdi]), [[m1, 'HM-SAT-00001', 'Deneme Yönetici'], [m2, 'HM-SAT-00002', null]]);
    // Açık siparişi olmayan malzemede sipariş listesi boştur; bugün sunucunun günüdür (TMI A3).
    assert.deepEqual(liste.map((t) => t.siparisler), [[], []]);
    assert.equal(cevap.bugun, (await vt().tx((db) => db.tek<{ g: string }>('SELECT current_date::text AS g')))?.g);
    // Planlama ekranının açık girişi plan yeniden yazınca bozulmaz: m2'nin sürümü hâlâ 1.
    const yaz = await vt().tx((db) => tedarikTerminiKaydet(db, yonetici, { malzemeNo: m2, termin: '2026-11-07', aciklama: '', surum: 1 }));
    assert.equal(yaz.termin.gerekenTarih, '2026-11-08');
    await vt().tx((db) => tedarikIhtiyaclariniYaz(db, [{ malzemeNo: m2, gerekenTarih: '2026-11-09' }]));
    const son = await vt().tx((db) => tedarikTerminleri(db, [m1, m2]));
    assert.equal(son.get(m1)?.gerekenTarih, null, 'plan artık istemiyor');
    assert.equal(son.get(m1)?.termin, '2020-01-01', 'termin kalır');
    assert.deepEqual([son.get(m2)?.termin, son.get(m2)?.gerekenTarih], ['2026-11-07', '2026-11-09']);
    await vt().tx((db) => tedarikIhtiyaclariniYaz(db, []));
    assert.equal((await vt().tx((db) => tedarikTerminleri(db, [m2]))).get(m2)?.gerekenTarih, null);
  });

  test('534 1 a: termin ucu satın almayı yazana ve planı yazana açık; satın almayı ya da planı yalnız okuyan ve ilgisiz kişi 403; liste okuyana açık', async () => {
    const satinAlmaci = await kisiKur('termin_sa', ['satin-alma.yaz']);
    const planlamaci = await kisiKur('termin_plan', ['plan.yaz', 'plan.oku']);
    const okuyucu = await kisiKur('termin_oku', ['satin-alma.oku', 'plan.oku', 'plan.planlama-oku']);
    const ilgisiz = await kisiKur('termin_yok', ['stok.oku']);
    const sonSurum = async (no: number) => (await vt().tx((db) => tedarikTerminleri(db, [no]))).get(no)?.surum ?? null;
    const kaydet = (cerez: string, no: number, termin: string | null, surum: number | null) =>
      istek(cerez, 'POST', '/satin-alma-tedarik-terminleri/kaydet', { malzemeNo: no, termin, surum });

    const sa = await kaydet(satinAlmaci, m2, '2026-11-20', await sonSurum(m2));
    assert.equal(sa.statusCode, 200, sa.body);
    assert.equal((sa.json() as { termin: { termin: string } }).termin.termin, '2026-11-20');
    const pl = await kaydet(planlamaci, m2, '2026-11-21', await sonSurum(m2));
    assert.equal(pl.statusCode, 200, pl.body);
    const kisi = await ortam!.sahip.tek<{ ad: string }>('SELECT k.ad FROM satin_alma_tedarik_termini t JOIN kisi k ON k.id = t.kisi_id WHERE t.malzeme_no = $1', [m2]);
    assert.equal(kisi?.ad, 'Deneme termin_plan', 'kişi oturumdan, gövdeden değil');
    for (const cerez of [okuyucu, ilgisiz]) {
      const r = await kaydet(cerez, m2, '2026-12-01', await sonSurum(m2));
      assert.equal(r.statusCode, 403, r.body);
    }
    assert.equal((await vt().tx((db) => tedarikTerminleri(db, [m2]))).get(m2)?.termin, '2026-11-21', 'reddedilen yazmadı');
    const eski = await kaydet(satinAlmaci, m2, '2026-12-02', 1);
    assert.equal(eski.statusCode, 409, eski.body);
    const kisiGovdede = await istek(satinAlmaci, 'POST', '/satin-alma-tedarik-terminleri/kaydet', { malzemeNo: m2, termin: '2026-12-03', surum: await sonSurum(m2), kisiId: 1 });
    assert.equal(kisiGovdede.statusCode, 200, kisiGovdede.body);
    const yazan = await ortam!.sahip.tek<{ ad: string }>('SELECT k.ad FROM satin_alma_tedarik_termini t JOIN kisi k ON k.id = t.kisi_id WHERE t.malzeme_no = $1', [m2]);
    assert.equal(yazan?.ad, 'Deneme termin_sa', 'gövdedeki kişi alanı yok sayılır');
    const kotuTarih = await kaydet(satinAlmaci, m2, '2026-02-30', await sonSurum(m2));
    assert.equal(kotuTarih.statusCode, 400, kotuTarih.body);

    assert.equal((await istek(okuyucu, 'GET', '/satin-alma-tedarik-terminleri')).statusCode, 200);
    assert.equal((await istek(satinAlmaci, 'GET', '/satin-alma-tedarik-terminleri')).statusCode, 200);
    assert.equal((await istek(planlamaci, 'GET', '/satin-alma-tedarik-terminleri')).statusCode, 403, 'plan okuyan satın alma listesini görmez; termini plandan okur');
    assert.equal((await istek(ilgisiz, 'GET', '/satin-alma-tedarik-terminleri')).statusCode, 403);
    const oturumsuz = await app.inject({ method: 'POST', url: '/api/satin-alma-tedarik-terminleri/kaydet', headers: { 'istek-kimligi': crypto.randomUUID() }, payload: { malzemeNo: m2, termin: null, surum: 1 } });
    assert.equal(oturumsuz.statusCode, 401);
  });
});
