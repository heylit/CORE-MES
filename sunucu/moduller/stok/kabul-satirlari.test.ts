import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { MalKabulCevabi } from '#paylasilan/sozlesme/stok.ts';
import { malKabulSatirlariCevabi, type MalKabulSatirlariCevabi } from '#paylasilan/sozlesme/stok-mal-kabul-satirlari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// 2890: Mal kabulü yapılanlar listesi. Satır kabul edileni, kimin ne zaman aldığını ve lotun bugün nerede durduğunu taşır;
// sipariş no ve tedarikçi yalnız mal kabul yapan ya da satın alma okuyana gider. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = {
  depo: ['stok.giris', 'stok.transfer', 'stok.konum-yaz', 'stok.raf-yaz', 'stok.harita-yaz', 'stok.malzeme-ayari', 'stok.geri-al'],
  kalite: ['stok.sayim'],
};

interface Cevap<T = unknown> { durum: number; govde: T }

describe('stok: mal kabulü yapılanlar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  let yonetici = 0, sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const liste = async (kim: string, sorgu = ''): Promise<MalKabulSatirlariCevabi> => {
    const c = await istek(kim, 'GET', `/stok/mal-kabul-satirlari${sorgu}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return malKabulSatirlariCevabi.parse(c.govde);
  };
  async function kart(gkk = false): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['MKS-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, gkk_gerekli)
       VALUES ($1, 'hammadde', 'MKS-DNM-', $2, 'aktif', $3, $4, $4, $5) RETURNING no`,
      [`mks-dnm-${sira}`, sira, JSON.stringify({ id: `mks-dnm-${sira}`, com: { ad: `Kabul deneme ${sira}`, birim: 'adet' } }), yonetici, gkk]))!.no;
  }
  async function siparisSatiri(malzemeNo: number): Promise<number> {
    sira += 1;
    const [t, kl, tk, kt] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const s = o().sahip;
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi')",
      [t, 94000 + sira, yonetici]);
    await s.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [kt, malzemeNo]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id) VALUES ($1, $2, 1, 'Deneme kalem', $3)", [t, kl, kt]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, tedarikci_adi) VALUES ($1, $2, 'TRY', current_date, 'Deneme Tedarikci')", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    return (await s.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, 'adet') RETURNING id", [t, tk, kl]))!.id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('stok_kabul_satirlari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r, i]);
    }
    for (const rol of ['depo', 'kalite', 'operator']) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      await ortam.vt.tx(async (db) => {
        const k = await yoneticiOlustur(db, { ad: `Deneme ${rol}`, kullaniciAdi: rol, parola: PAROLA });
        await rolAta(db, yonetici, k, r);
        await rolAl(db, yonetici, k, yon);
      });
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: rol, parola: PAROLA } });
      assert.equal(g.statusCode, 200);
      cerezler.set(rol, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: oturumsuz 401, stok okuması olmayan 403', async () => {
    assert.equal((await istek('oturumsuz', 'GET', '/stok/mal-kabul-satirlari')).durum, 401);
    assert.equal((await istek('operator', 'GET', '/stok/mal-kabul-satirlari')).durum, 403);
  });

  test('satır: kabul edilen, kim, ne zaman, lot ve bugünkü yerleri; taşınan kısım iki konumda görünür', async () => {
    const k = await kart();
    const ss = await siparisSatiri(k);
    const mk = await istek<MalKabulCevabi>('depo', 'POST', '/stok/mal-kabul', { tur: 'satin_alma', irsaliyeNo: 'MKS-IRS-1', satirlar: [{ malzemeId: k, miktar: '7', siparisSatirId: ss, parti: { tedarikciPartiNo: 'TP-MKS-1' } }] });
    assert.equal(mk.durum, 200, JSON.stringify(mk.govde));
    const zemin = await istek<{ konum: { id: number } }>('depo', 'POST', '/stok/konumlar', { tur: 'depo_zemini', kod: `MKS-Z-${sira}`, ad: null });
    assert.equal(zemin.durum, 200, JSON.stringify(zemin.govde));
    const kabul = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    const satir = (await liste('depo', `?malzemeId=${k}`)).satirlar;
    assert.equal(satir.length, 1);
    const ilk = satir[0]!;
    const t = await istek('depo', 'POST', '/stok/tasima', { malzemeId: k, kaynakKonumId: kabul, partiId: ilk.partiId, hedefKonumId: zemin.govde.konum.id, miktar: '3' });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));

    const s = (await liste('depo', `?malzemeId=${k}`)).satirlar[0]!;
    assert.equal(s.belgeNo, mk.govde.belge.no);
    assert.equal(s.malKabulId, mk.govde.belge.id);
    assert.equal(s.kisiAd, 'Deneme depo');
    assert.equal(s.irsaliyeNo, 'MKS-IRS-1');
    assert.match(s.malzemeAd ?? '', /^Kabul deneme /);
    assert.equal(s.birim, 'adet');
    assert.equal(Number(s.sayilanMiktar), 7);
    assert.equal(s.tedarikciPartiNo, 'TP-MKS-1');
    assert.notEqual(s.lotNo, null);
    assert.equal(s.ilkKonumKod, 'KABUL');
    assert.deepEqual(s.yerler.map((y) => [y.konumKod, Number(y.miktar), y.kaliteDurumu]).sort(), [['KABUL', 4, 'serbest'], [`MKS-Z-${sira}`, 3, 'serbest']].sort());
    assert.equal(s.siparisNo !== null, true, 'mal kabul yapan siparişi görür');
    assert.equal(s.tedarikciAdi, 'Deneme Tedarikci');
    assert.equal(s.duzeltenId, null);
    assert.equal(s.logoDurumu, 'irsaliye_bekleniyor');
  });

  test('yetki genişlemez: yalnız stok okuyan sipariş no ve tedarikçiyi görmez; GKK lotu karantinada karar bekliyor görünür', async () => {
    const k = await kart(true);
    await o().sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, 'MKS-KRN', 'karantina' FROM stok_konum WHERE kod = 'KABUL'");
    const ss = await siparisSatiri(k);
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId: k, miktar: '2', siparisSatirId: ss }] })).durum, 200);
    const s = (await liste('kalite', `?malzemeId=${k}`)).satirlar[0]!;
    assert.equal(s.siparisNo, null);
    assert.equal(s.tedarikciAdi, null);
    assert.equal(s.kisiAd, 'Deneme depo');
    assert.equal(s.gkk, true);
    assert.deepEqual(s.yerler.map((y) => [y.konumKod, y.konumTur, Number(y.miktar), y.kaliteDurumu]), [['MKS-KRN', 'karantina', 2, 'karar_bekliyor']]);
    const depo = (await liste('depo', `?malzemeId=${k}`)).satirlar[0]!;
    assert.equal(depo.tedarikciAdi, 'Deneme Tedarikci');
  });

  test('düzeltilen belgenin satırı düzelteni gösterir, lotu depoda kalmaz; arama lot ve belge noyla bulur', async () => {
    const k = await kart();
    const mk = await istek<MalKabulCevabi>('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: k, miktar: '5' }] });
    assert.equal(mk.durum, 200, JSON.stringify(mk.govde));
    const d = await istek<MalKabulCevabi>('depo', 'POST', `/stok/mal-kabuller/${mk.govde.belge.id}/duzelt`, { satirlar: [] });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    const l = (await liste('depo', `?malzemeId=${k}`)).satirlar;
    assert.equal(l.length, 1, 'iptal belgesi satırsızdır');
    assert.equal(l[0]!.duzeltenId, d.govde.belge.id);
    assert.deepEqual(l[0]!.yerler, []);
    assert.equal(l[0]!.siparisNo, null);
    const lot = l[0]!.lotNo!;
    assert.deepEqual((await liste('depo', `?metin=${encodeURIComponent(lot)}`)).satirlar.map((x) => x.id), [l[0]!.id]);
    assert.deepEqual((await liste('depo', `?metin=${encodeURIComponent(mk.govde.belge.no)}`)).satirlar.map((x) => x.id), [l[0]!.id]);
  });

  test('sıralama: varsayılan en yeni önce; sayfalama toplamı verir', async () => {
    const k = await kart();
    for (const m of ['1', '2']) assert.equal((await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: k, miktar: m }] })).durum, 200);
    const l = await liste('depo', `?malzemeId=${k}&sayfaBoyu=1`);
    assert.equal(l.toplam, 2);
    assert.equal(Number(l.satirlar[0]!.sayilanMiktar), 2);
  });
});
