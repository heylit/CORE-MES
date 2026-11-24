import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { FaturaEslesmeCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { faturaEslesmeleri } from './kurallar.ts';
import type { EslesmeFinansFaturasi, EslesmeLogoFaturasi } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

const logo = (ek: Partial<EslesmeLogoFaturasi> = {}): EslesmeLogoFaturasi => ({
  tur: 'alis', faturaNo: 'ORN-F-1', tarih: '2026-11-04', cariKodu: 'ORN-C-1', dovizTuru: null, net: '1000', kdv: '200', brut: '1200', iptal: false, ...ek,
});
const finans = (ek: Partial<EslesmeFinansFaturasi> = {}): EslesmeFinansFaturasi => ({
  belgeId: 1, yon: 'gider', tur: 'fatura', belgeNo: 'orn-f-1', tarih: '2026-11-04', cariKodu: 'orn-c-1', paraBirimi: 'TRY', tutar: '1000.00', kdvTutari: '200.00', durum: 'acik', ...ek,
});

// 3675 D2: Logo faturası ile finans faturasının eşleşmesi (saf kurallar) ve salt okunur uç. Veri sentetiktir (ORN-).
describe('Logo fatura eşleşmesi: kurallar', () => {
  test('anahtar yön, iade, cari ve fatura no; harf gözetmez; eşleşince fark yok', () => {
    const r = faturaEslesmeleri([logo()], [finans()]);
    assert.equal(r.length, 1);
    assert.deepEqual([r[0]?.durum, r[0]?.farklar, r[0]?.farkTutari], ['eslesti', [], null]);
  });

  test('net, KDV, toplam, tarih ve para birimi farkı ayrı kodlanır; 1 kuruş tolerans içindir', () => {
    const r = faturaEslesmeleri([logo({ net: '1000.01', kdv: '199.00', brut: '1199.01', tarih: '2026-11-05', dovizTuru: 1 })], [finans()]);
    assert.equal(r[0]?.durum, 'farkli');
    assert.deepEqual(r[0]?.farklar, ['para-birimi', 'tarih', 'kdv', 'toplam']);
    assert.equal(r[0]?.farkTutari, '-0.99');
    assert.equal(faturaEslesmeleri([logo({ net: '1000.01', brut: '1200.01' })], [finans()])[0]?.durum, 'eslesti', '1 kuruş tolerans');
  });

  test('Logo\'da iptal edilen fatura finansta iptal değilse fark; ikisi de iptalse eşleşir; Logo\'da iptal ve finansta yoksa satır yok', () => {
    assert.deepEqual(faturaEslesmeleri([logo({ iptal: true })], [finans()])[0]?.farklar, ['iptal']);
    assert.equal(faturaEslesmeleri([logo({ iptal: true })], [finans({ durum: 'iptal' })])[0]?.durum, 'eslesti');
    assert.equal(faturaEslesmeleri([logo({ iptal: true })], []).length, 0);
  });

  test('yalnız bir tarafta olan fatura: Logo\'da var finansta yok, finansta var Logo\'da yok (iptal belge sayılmaz); cari kodsuz belge ayrı sınıftır', () => {
    const r = faturaEslesmeleri([logo({ faturaNo: 'ORN-F-2' })], [finans({ belgeId: 2, belgeNo: 'ORN-F-3' }), finans({ belgeId: 3, belgeNo: 'ORN-F-4', durum: 'iptal' }), finans({ belgeId: 4, belgeNo: 'ORN-F-5', cariKodu: null })]);
    assert.deepEqual(r.map((x) => [x.faturaNo, x.durum]).sort(), [['ORN-F-2', 'logoda-var-finansta-yok'], ['ORN-F-3', 'finansta-var-logoda-yok'], ['ORN-F-5', 'cari-kodu-yok']]);
  });

  test('N2: cari kodu boş firmanın belgesi aynı numaralı tek Logo faturasıyla yan yana, "cari kodu yok" sınıfında; Logo faturası ayrıca yalancı fark vermez', () => {
    const r = faturaEslesmeleri([logo({ faturaNo: 'ORN-F-9' })], [finans({ belgeNo: 'ORN-F-9', cariKodu: null })]);
    assert.equal(r.length, 1);
    assert.deepEqual([r[0]?.durum, r[0]?.logo !== null, r[0]?.finans !== null, r[0]?.cariKodu], ['cari-kodu-yok', true, true, 'ORN-C-1']);
    const iki = faturaEslesmeleri([logo({ faturaNo: 'ORN-F-9' }), logo({ faturaNo: 'ORN-F-9', cariKodu: 'ORN-C-2' })], [finans({ belgeNo: 'ORN-F-9', cariKodu: null })]);
    assert.deepEqual(iki.map((x) => x.durum).sort(), ['cari-kodu-yok', 'logoda-var-finansta-yok', 'logoda-var-finansta-yok'], 'numara iki cariye düşerse bağlanmaz');
  });

  test('B1: aynı anahtarlı iptal belge (daha büyük kimlikle) etkin belgeyi gölgelemez; sıra önemsizdir', () => {
    const acik = finans({ belgeId: 1 });
    const iptal = finans({ belgeId: 2, durum: 'iptal' });
    for (const sira of [[acik, iptal], [iptal, acik]]) {
      const r = faturaEslesmeleri([logo()], sira);
      assert.deepEqual([r.length, r[0]?.durum, r[0]?.finans?.belgeId], [1, 'eslesti', 1]);
    }
    assert.equal(faturaEslesmeleri([logo({ iptal: true })], [acik, iptal])[0]?.farklar[0], 'iptal', 'Logo iptal, finans etkin: gerçek fark');
  });

  test('N1: Logo\'da iptal edilip aynı numarayla yeniden kesilen fatura yalancı iptal farkı vermez', () => {
    const r = faturaEslesmeleri([logo({ iptal: true }), logo()], [finans()]);
    assert.deepEqual([r.length, r[0]?.durum], [1, 'eslesti']);
    assert.equal(faturaEslesmeleri([logo({ iptal: true })], [finans({ durum: 'iptal' })])[0]?.durum, 'eslesti');
  });

  test('S1: iade finansta asıl faturanın ters yönündedir (satış iadesi gider, alış iadesi gelir); iade fatura ile karışmaz', () => {
    const satisIade = faturaEslesmeleri([logo({ tur: 'satis-iade' })], [finans({ yon: 'gider', tur: 'iade' })]);
    assert.deepEqual([satisIade.length, satisIade[0]?.durum, satisIade[0]?.yon, satisIade[0]?.iade], [1, 'eslesti', 'gider', true]);
    const alisIade = faturaEslesmeleri([logo({ tur: 'alis-iade' })], [finans({ yon: 'gelir', tur: 'iade' })]);
    assert.deepEqual([alisIade.length, alisIade[0]?.durum, alisIade[0]?.yon], [1, 'eslesti', 'gelir']);
    assert.equal(faturaEslesmeleri([logo({ tur: 'satis' })], [finans({ yon: 'gelir' })])[0]?.durum, 'eslesti');
    assert.equal(faturaEslesmeleri([logo({ tur: 'alis-iade' })], [finans()]).map((x) => x.durum).includes('eslesti'), false, 'iade ile fatura karışmaz');
  });
});

describe('Logo fatura eşleşmesi: uç (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const yaz = (url: string, payload: unknown) => app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: yonetici, 'istek-kimligi': randomUUID() }, payload: payload as object });

  before(async () => {
    ortam = await testVeritabaniKur('logofaturaeslesme');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'fe-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'fe-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('salt okuma: finans belgesi ve Logo aynası eşleşir, fark ve eksikler listelenir; hiçbir şey yazılmaz; yetki finans.oku', async () => {
    const f = (await yaz('/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Tedarikçi', tur: 'tedarikci' })).json<{ firma: { id: number } }>().firma.id;
    await o().sahip.sorgu("UPDATE musteri_tedarikci_firma SET logo_cari_kodu = 'ORN-C-1' WHERE id = $1", [f]);
    const bugun = new Date().toISOString().slice(0, 10);
    const belge = (no: string, tutar: number) => yaz('/finans/belgeler/ekle', { yon: 'gider', kategori: 'mal_alimi', firmaId: f, belgeTarihi: bugun, vade: bugun, belgeNo: no, tutar, kdvOrani: 20 });
    assert.equal((await belge('ORN-F-1', 1000)).statusCode, 200);
    assert.equal((await belge('ORN-F-2', 500)).statusCode, 200);
    assert.equal((await belge('ORN-F-3', 300)).statusCode, 200);
    const satir = (ref: number, no: string, net: number) => o().sahip.sorgu(
      `INSERT INTO logo_fatura_baslik (firma, donem, logo_kayit_no, tur, fatura_no, tarih, cari_kodu, net, kdv, brut, iptal, okuma_zamani)
       VALUES (1, 1, $1, 'alis', $2, $3::date, 'ORN-C-1', $4, $5, $6, false, now())`, [ref, no, bugun, net, net * 0.2, net * 1.2]);
    await satir(1, 'ORN-F-1', 1000);
    await satir(2, 'ORN-F-2', 450);
    await satir(4, 'ORN-F-4', 100);
    const once = (await o().sahip.tek<{ n: string }>('SELECT count(*) AS n FROM finans_belge'))?.n;
    const c = await app.inject({ method: 'GET', url: '/api/logo/fatura-eslesme?gun=30', headers: { cookie: yonetici } });
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json<FaturaEslesmeCevabi>();
    assert.deepEqual(g.durumlar.map((d) => [d.durum, d.sayi]), [['eslesti', 1], ['farkli', 1], ['logoda-var-finansta-yok', 1], ['finansta-var-logoda-yok', 1], ['cari-kodu-yok', 0]]);
    const farkli = g.satirlar.find((x) => x.durum === 'farkli');
    assert.deepEqual([farkli?.faturaNo, farkli?.farklar, farkli?.farkTutari, farkli?.firmaAdi], ['ORN-F-2', ['net', 'kdv', 'toplam'], '-60.00', 'Deneme Tedarikçi']);
    assert.equal(g.baglanamayan, 0);
    assert.equal((await o().sahip.tek<{ n: string }>('SELECT count(*) AS n FROM finans_belge'))?.n, once, 'finans belgesine yazılmaz');
    assert.equal((await app.inject({ method: 'GET', url: '/api/logo/fatura-eslesme?durum=farkli', headers: { cookie: yonetici } })).json<FaturaEslesmeCevabi>().toplam, 1);
    assert.equal((await app.inject({ method: 'GET', url: '/api/logo/fatura-eslesme' })).statusCode, 401);
  });

  test('S1: finans iade uçundan gerçekten girilen alış iadesi (yön gelir) Logo alış iadesiyle eşleşir', async () => {
    const f = (await yaz('/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme İade Tedarikçi', tur: 'tedarikci' })).json<{ firma: { id: number } }>().firma.id;
    await o().sahip.sorgu("UPDATE musteri_tedarikci_firma SET logo_cari_kodu = 'ORN-C-9' WHERE id = $1", [f]);
    const bugun = new Date().toISOString().slice(0, 10);
    const asil = await yaz('/finans/belgeler/ekle', { yon: 'gider', kategori: 'mal_alimi', firmaId: f, belgeTarihi: bugun, vade: bugun, belgeNo: 'ORN-I-1', tutar: 1000, kdvOrani: 20 });
    assert.equal(asil.statusCode, 200, asil.body);
    const iade = await yaz('/finans/belgeler/ekle', { yon: 'gelir', tur: 'iade', kategori: 'alis_iadesi', iadeBelgeId: asil.json<{ belge: { id: number } }>().belge.id, firmaId: f, belgeTarihi: bugun, vade: bugun, belgeNo: 'ORN-II-1', tutar: 200, kdvOrani: 20 });
    assert.equal(iade.statusCode, 200, iade.body);
    await o().sahip.sorgu(
      `INSERT INTO logo_fatura_baslik (firma, donem, logo_kayit_no, tur, fatura_no, tarih, cari_kodu, net, kdv, brut, iptal, okuma_zamani)
       VALUES (1, 1, 90, 'alis-iade', 'ORN-II-1', $1::date, 'ORN-C-9', 200, 40, 240, false, now())`, [bugun]);
    const g = (await app.inject({ method: 'GET', url: '/api/logo/fatura-eslesme?gun=30', headers: { cookie: yonetici } })).json<FaturaEslesmeCevabi>();
    const s = g.satirlar.find((x) => x.faturaNo === 'ORN-II-1');
    assert.deepEqual([s?.durum, s?.yon, s?.iade, s?.farklar], ['eslesti', 'gelir', true, []]);
  });
});
