import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
import { planIhtiyaclariniYaz, tedarikTerminiKaydet, tedarikTerminleriListesi } from './servis.ts';

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

  test('2433: termin takibi malzemeyi plan, talep, sipariş ve elle terminle birleştirir; durum sunucudan; siparişte elle termin gösterilmez', async () => {
    const s = ortam!.sahip;
    let sira = 0;
    const talep = async (durum: string, ihtiyac: string | null, malzemeNo: number | null, miktar: string, siparis?: { teslim: string | null }) => {
      sira += 1;
      const [t, kl, tk] = [randomUUID(), randomUUID(), randomUUID()];
      await s.sorgu('INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, ihtiyac_tarihi, iptal_nedeni) VALUES ($1, 2099, $2, $3, $4, $4, $5, $6, $7)',
        [t, 70000 + sira, `Deneme talep ${sira}`, yonetici.id, durum, ihtiyac, durum === 'iptal' ? 'Deneme iptal' : '']);
      let katalog: string | null = null;
      if (malzemeNo !== null) {
        katalog = randomUUID();
        await s.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, malzemeNo]);
      }
      await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id, miktar, birim) VALUES ($1, $2, 1, 'Deneme serbest kalem', $3, $4, 'adet')", [t, kl, katalog, miktar]);
      if (siparis) {
        await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [t, tk]);
        await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
        await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id, beklenen_teslim) VALUES ($1, $2, $3)', [t, tk, siparis.teslim]);
        await s.sorgu("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, $4, 'adet')", [t, tk, kl, miktar]);
      }
      return t;
    };
    const bugun = (await s.tek<{ g: string }>('SELECT current_date::text AS g'))!.g;
    const gun = async (n: number) => (await s.tek<{ g: string }>('SELECT (current_date + $1::int)::text AS g', [n]))!.g;
    // m1: plan 10 adet, 10 gün sonra; 4 adet sipariş 5 gün sonra + 3 adet açık talep: eksik 3.
    await vt().tx((db) => planIhtiyaclariniYaz(db, [{ malzemeNo: m1, miktar: 10, gerekenTarih: '2099-01-01', emirler: ['UE-1'], stokBilinmiyor: false }]));
    await s.sorgu('UPDATE satin_alma_plan_ihtiyaci SET gereken_tarih = current_date + 10 WHERE malzeme_no = $1', [m1]);
    const sip = await talep('siparis_verildi', null, m1, '4', { teslim: await gun(5) });
    await talep('teklif_isteniyor', await gun(8), m1, '3');
    // Serbest kalem (kartsız): kalem başına satır, talep yolda.
    const serbest = await talep('taslak', await gun(20), null, '2');
    // İptal edilmiş talep görünmez.
    await talep('iptal', await gun(2), m2, '9');
    const cevap = await vt().tx((db) => tedarikTerminleriListesi(db));
    const takip = cevap.takip!;
    const a = takip.find((x) => x.anahtar === `malzeme:${m1}`)!;
    assert.deepEqual([a.tur, a.kod, a.ihtiyacMiktari, a.gerekenTarih, a.emirler, a.karsilanan, a.eksik, a.durum, a.elleTermin],
      ['malzeme', 'HM-SAT-00001', '10', await gun(10), ['UE-1'], '7', '3', 'eksik', null]);
    assert.deepEqual(a.karsilayanlar.map((k) => [k.tur, k.talepId === sip, k.tarih, k.miktar]).sort(), [['siparis', true, await gun(5), '4'], ['talep', false, await gun(8), '3']]);
    assert.equal(a.karsilayanTarih, await gun(5));
    assert.equal(a.elleTermin, null, 'm1 elle termini (2020-01-01) sipariş varken gösterilmez');
    const b = takip.find((x) => x.anahtar.startsWith(`kalem:${serbest}:`))!;
    assert.deepEqual([b.tur, b.malzemeNo, b.ad, b.ihtiyacMiktari, b.eksik, b.durum], ['malzeme', null, 'Deneme serbest kalem', '2', '0', 'talep_yolda']);
    assert.equal(takip.some((x) => x.anahtar === `malzeme:${m2}` && x.karsilayanlar.length > 0), false);
    // Plan tarihi geçmişse gecikti ve listenin başında; teslim tarihi olmayan eski sipariş ayrı durumdur.
    await s.sorgu('UPDATE satin_alma_plan_ihtiyaci SET gereken_tarih = current_date - 1 WHERE malzeme_no = $1', [m1]);
    await talep('siparis_verildi', null, m2, '1', { teslim: null });
    const ikinci = (await vt().tx((db) => tedarikTerminleriListesi(db))).takip!;
    assert.deepEqual([ikinci[0]!.anahtar, ikinci[0]!.durum], [`malzeme:${m1}`, 'gecikti']);
    assert.equal(ikinci.find((x) => x.anahtar === `malzeme:${m2}`)?.durum, 'teslim_tarihi_yok');
    assert.ok(bugun.length === 10);
    await vt().tx((db) => planIhtiyaclariniYaz(db, []));
  });
});
