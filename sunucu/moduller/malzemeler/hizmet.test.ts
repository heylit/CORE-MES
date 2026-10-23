import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi, LogoDurumuCevabi, OlcuBirimleriCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { logoyaGidecekMalzemeler, malzemeAra, malzemeOzetleri } from './disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('Hizmet kartı (kart #163, MH1-MH5, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let kisiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: yonetici }, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object }) });
  async function tamam<T>(yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await istek(yontem, url, govde);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function ret(durum: number, kod: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<string> {
    const c = await istek(yontem, url, govde);
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum, kod }, `${yontem} ${url}: ${c.body}`);
    return String(c.json().mesaj);
  }

  // Onay akışı kapalı: kart doğrudan aktif açılır. Ekran yönü seçim metniyle yazar ("Alınan" / "Verilen").
  let sayac = 0;
  interface Kart { tur?: string; kod?: string; ad?: string; birim?: string; kat?: string; yon?: string | null; durum?: string; bom?: unknown[]; ops?: unknown[] }
  const govde = (kimlik: string, o: Kart, surum: number | null = null) => {
    const tur = o.tur ?? 'hizmet';
    const g: Record<string, unknown> = { kat: o.kat ?? 'fason' };
    if (o.yon !== null) g['yon'] = o.yon ?? 'Alınan';
    return {
      kayit: {
        id: kimlik, tur, ...(tur === 'hammadde' ? { fam: 'metal' } : {}),
        com: { kod: o.kod ?? 'HZ-FSN-00001', ad: o.ad ?? `Hizmet ${kimlik}`, birim: o.birim ?? 'saat' },
        g, ...(o.bom ? { bom: o.bom } : {}), ...(o.ops ? { ops: o.ops } : {}), onay: { durum: o.durum ?? 'aktif' },
      },
      ozet: { benzersiz_anahtar: tur === 'hammadde' || tur === 'sarf' ? `${tur}|hizmet-testi|${kimlik}` : null, mukerrer_gerekcesi: null },
      surum,
    };
  };
  const kaydet = (kimlik: string, o: Kart, surum: number | null = null) => istek('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde(kimlik, o, surum));
  async function kartAc(o: Kart): Promise<{ kimlik: string; no: number; surum: number; kod: string }> {
    const kimlik = `hz${++sayac}`;
    const r = await tamam<KatalogKartiKaydetCevabi>('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde(kimlik, o));
    const no = (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
    return { kimlik, no, surum: r.surum, kod: r.stok_kodu };
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemehizmet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme hizmet', kullaniciAdi: 'hz-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'hz-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await tamam('POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('hizmet kartı HZ önekiyle açılır; yön sütuna ASCII yazılır; özet yönü, hizmet grubunu ve adını verir', async () => {
    const a = await kartAc({ yon: 'Alınan', kat: 'fason', birim: 'saat' });
    assert.equal(a.kod, 'HZ-FSN-00001');
    const v = await kartAc({ yon: 'Verilen', kat: 'nakliye', kod: 'HZ-NAK-00001', birim: 'sefer' });
    assert.equal(v.kod, 'HZ-NAK-00001');
    const ozet = await vt().tx((db) => malzemeOzetleri(db, [a.no, v.no]));
    assert.deepEqual(
      [ozet.get(a.no), ozet.get(v.no)].map((o) => [o?.tur, o?.hizmetYonu, o?.kategori, o?.kategoriAdi, o?.birim]),
      [['hizmet', 'alinan', 'fason', 'Fason işçilik', 'saat'], ['hizmet', 'verilen', 'nakliye', 'Nakliye', 'sefer']],
    );
    const sarf = await kartAc({ tur: 'sarf', kod: 'SF-KYN-00001', kat: 'kaynak', birim: 'kg', yon: null });
    assert.equal((await vt().tx((db) => malzemeOzetleri(db, [sarf.no]))).get(sarf.no)?.hizmetYonu, null, 'hizmet olmayan kartın yönü yok');
  });

  test('yönsüz ya da geçersiz yönlü hizmet, yanlış önek ve listede olmayan birim reddedilir; satır yazılmaz', async () => {
    assert.match(await ret(400, 'DOGRULAMA', 'POST', '/malzeme-katalogu-kartlari/hz-yonsuz/kaydet', govde('hz-yonsuz', { yon: null })), /yönü alınan ya da verilen/);
    assert.match(await ret(400, 'DOGRULAMA', 'POST', '/malzeme-katalogu-kartlari/hz-yanlis/kaydet', govde('hz-yanlis', { yon: 'İkisi' })), /yönü/);
    assert.match(await ret(400, 'DOGRULAMA', 'POST', '/malzeme-katalogu-kartlari/hz-onek/kaydet', govde('hz-onek', { kod: 'SF-FSN-00001' })), /türüne uymuyor/);
    assert.match(await ret(422, 'GECERSIZ', 'POST', '/malzeme-katalogu-kartlari/hz-birim/kaydet', govde('hz-birim', { birim: 'koli' })), /"koli" birim listesinde yok/);
    assert.equal(await vt().tek(`SELECT 1 FROM malzeme_katalog_karti WHERE kimlik IN ('hz-yonsuz', 'hz-yanlis', 'hz-onek', 'hz-birim')`), null);
  });

  test('hizmet birimleri (adet, saat, gün, sefer, ay, kg, m², km) ve sekiz hizmet grubu listede; malzeme ayarı kaydı grupları kapatmaz', async () => {
    const b = Object.fromEntries((await tamam<OlcuBirimleriCevabi>('GET', '/malzeme-birimleri')).birimler.map((x) => [x.kod, x.aktif]));
    for (const kod of ['adet', 'saat', 'gün', 'sefer', 'ay', 'kg', 'm²', 'km']) assert.equal(b[kod], true, kod);
    await tamam('POST', '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { listeler: { 'birim|hizmet': { ekle: ['proje'], gizle: ['km'] } } } });
    const sonra = Object.fromEntries((await tamam<OlcuBirimleriCevabi>('GET', '/malzeme-birimleri')).birimler.map((x) => [x.kod, x.aktif]));
    assert.deepEqual([sonra['proje'], sonra['km'], sonra['saat']], [true, false, true], 'hizmet listesi Ayarlar\'dan genişler ve daralır');
    await kartAc({ kod: 'HZ-DNS-00001', kat: 'danismanlik', birim: 'proje' });
    const gruplar = await vt().sorgu<{ kod: string; kisa: string; aktif: boolean }>(
      `SELECT kod, kisa_kod AS kisa, aktif FROM malzeme_kategorisi WHERE tur = 'hizmet' ORDER BY kisa_kod`);
    assert.deepEqual(gruplar.map((g) => [g.kod, g.kisa, g.aktif]),
      [['bakim', 'BKM', true], ['diger', 'DGR', true], ['danismanlik', 'DNS', true], ['fason', 'FSN', true], ['isil', 'ISL', true], ['muayene', 'MYT', true],
        ['nakliye', 'NAK', true], ['yuzey', 'YZY', true]]);
  });

  test('yön yalnız hiç aktif olmamış taslakta değişir: aktif kartta 422, tetikleyici de tutar', async () => {
    const t = await kartAc({ durum: 'taslak', kod: 'HZ-BKM-00001', kat: 'bakim' });
    const r = await kaydet(t.kimlik, { durum: 'taslak', kod: t.kod, kat: 'bakim', yon: 'Verilen' }, t.surum);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal((await vt().tek<{ y: string }>('SELECT hizmet_yonu AS y FROM malzeme_katalog_karti WHERE kimlik = $1', [t.kimlik]))!.y, 'verilen');
    const a = await kartAc({ kod: 'HZ-BKM-00001', kat: 'bakim' });
    const mesaj = await ret(422, 'GECERSIZ', 'POST', `/malzeme-katalogu-kartlari/${a.kimlik}/kaydet`, govde(a.kimlik, { kod: a.kod, kat: 'bakim', yon: 'Verilen' }, a.surum));
    assert.match(mesaj, /yönü yalnız hiç aktif olmamış taslakta değişir/);
    await assert.rejects(vt().sorgu(`UPDATE malzeme_katalog_karti SET hizmet_yonu = 'verilen' WHERE kimlik = $1`, [a.kimlik]),
      (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_hizmet_yonu_degismez');
  });

  test('kısıt: yön yalnız hizmette ve hizmette zorunlu; değer alinan ya da verilen', async () => {
    const h = await kartAc({ kod: 'HZ-DGR-00001', kat: 'diger' });
    const kisit = (sql: string, ad: string) => assert.rejects(vt().sorgu(sql, [h.kimlik]), (e: { constraint?: string }) => e.constraint === ad);
    await kisit(`UPDATE malzeme_katalog_karti SET hizmet_yonu = NULL WHERE kimlik = $1`, 'malzeme_katalog_karti_hizmet_yonu_degismez');
    await vt().sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 5) ON CONFLICT (onek) DO NOTHING', ['HM-KST-']);
    const ekle = (tur: string, yon: string | null) => vt().sorgu(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, hizmet_yonu)
       VALUES ($1, $2, 'HM-KST-', $3, 'taslak', '{}', $4, $4, $5)`, [`hz-k${++sayac}`, tur, sayac, kisiId, yon]);
    await assert.rejects(ekle('hammadde', 'alinan'), (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_hizmet_yonu');
    await assert.rejects(ekle('hizmet', null), (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_hizmet_yonu');
    await assert.rejects(ekle('hizmet', 'ikisi'), (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_hizmet_yonu_degeri');
  });

  test('madde 6: hizmet reçete bileşeni ve operasyon sarfı olamaz (422, satır yazılmaz); sarf bileşen olur', async () => {
    const h = await kartAc({ kod: 'HZ-FSN-00001', kat: 'fason' });
    const s = await kartAc({ tur: 'sarf', kod: 'SF-KYN-00001', kat: 'kaynak', birim: 'kg', yon: null });
    const mamul = (kimlik: string, o: Pick<Kart, 'bom' | 'ops'>) => govde(kimlik, { tur: 'mamul', kod: 'MM-GEN-00001', birim: 'adet', yon: null, ...o });
    let m = await ret(422, 'GECERSIZ', 'POST', '/malzeme-katalogu-kartlari/hz-bom/kaydet', mamul('hz-bom', { bom: [{ ref: h.kimlik, miktar: 1 }, { ref: s.kimlik, miktar: 2 }] }));
    assert.match(m, new RegExp(`Hizmet ve ticari mal kartı reçeteye ya da operasyon sarfına girmez: ${h.kod}`));
    m = await ret(422, 'GECERSIZ', 'POST', '/malzeme-katalogu-kartlari/hz-ops/kaydet', mamul('hz-ops', { ops: [{ ad: 'Montaj', sarf: [{ ref: h.kimlik, miktar: 1 }] }] }));
    assert.match(m, /operasyon sarfına girmez/);
    assert.equal(await vt().tek(`SELECT 1 FROM malzeme_katalog_karti WHERE kimlik IN ('hz-bom', 'hz-ops')`), null);
    const r = await istek('POST', '/malzeme-katalogu-kartlari/hz-bom2/kaydet', mamul('hz-bom2', { bom: [{ ref: s.kimlik, miktar: 2 }, { ad: 'Serbest satır', miktar: 1 }] }));
    assert.equal(r.statusCode, 200, r.body);
  });

  test('Logo: hizmet tür karşılığına yazılamaz (adlı kısıt); karşılık listesinde hizmet satırı yok; durum sayfasında tür karşılığı eksiği sayılmaz', async () => {
    const m = await istek('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'hizmet', logoDegeri: '13' });
    assert.notEqual(m.statusCode, 200, m.body);
    assert.match(String(m.json().mesaj), /Tür karşılığı yalnız altı malzeme türü için yazılır/);
    await assert.rejects(
      vt().sorgu(`INSERT INTO malzeme_logo_karsiligi (cesit, tmi_degeri, logo_degeri, guncelleyen_kisi_id) VALUES ('tur', 'hizmet', '13', $1)`, [kisiId]),
      (e: { constraint?: string }) => e.constraint === 'malzeme_logo_karsiligi_tur');
    const h = await kartAc({ kod: 'HZ-NAK-00001', kat: 'nakliye' });
    const d = await tamam<LogoDurumuCevabi>('GET', '/malzeme-logo-durumu');
    assert.deepEqual(d.karsiliklar.filter((k) => k.cesit === 'tur').map((k) => k.tmiDegeri), ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'ticari_mal']);
    const satir = d.kartlar.find((k) => k.id === h.no);
    assert.deepEqual([satir?.tur, satir?.durum, satir?.eksikler], ['hizmet', 'bekliyor', ['birim_karsiligi']]);
  });

  test('Logo kuyruğu: hizmet öntanımda gelmez; hizmetDahil ile yönüyle gelir, tür karşılığı eksik sayılmaz', async () => {
    const h = await kartAc({ kod: 'HZ-DGR-00001', kat: 'diger', yon: 'Verilen' });
    await tamam('POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'saat', logoDegeri: 'SAAT' });
    const varsayilan = await vt().tx((db) => logoyaGidecekMalzemeler(db, 500));
    assert.equal(varsayilan.some((k) => k.tur === 'hizmet'), false);
    const dahil = await vt().tx((db) => logoyaGidecekMalzemeler(db, 500, { hizmetDahil: true }));
    const k = dahil.find((x) => x.no === h.no);
    assert.deepEqual([k?.tur, k?.hizmetYonu, k?.logoKartTuru, k?.eksikler], ['hizmet', 'verilen', null, []]);
  });

  test('malzemeAra: hizmet türü ve yönüyle süzülür (satın alma alınan hizmeti seçer)', async () => {
    const r = await vt().tx((db) => malzemeAra(db, { metin: null, turler: ['hizmet'], hizmetYonu: 'alinan', yalnizAktif: true, sayfa: 1, sayfaBoyu: 200 }));
    assert.ok(r.satirlar.length > 0);
    assert.ok(r.satirlar.every((o) => o.tur === 'hizmet' && o.hizmetYonu === 'alinan' && o.onayDurumu === 'aktif'));
    assert.equal(r.toplam, r.satirlar.length);
    const verilen = await vt().tx((db) => malzemeAra(db, { metin: null, hizmetYonu: 'verilen', sayfa: 1 }));
    assert.ok(verilen.satirlar.length > 0 && verilen.satirlar.every((o) => o.hizmetYonu === 'verilen'));
  });
});
