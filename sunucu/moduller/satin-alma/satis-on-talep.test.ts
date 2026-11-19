import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { OnTalepleriCevabi, SiparisOnTalep } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ILETILER } from './kurallar.ts';
import { malzemeGelisTarihleri, onayliTalepGelisleri } from './disari.ts';
import { acikTalepMiktarlari } from './sorgular.ts';

// 3429-3 F3: satış siparişinin "Satın al" kalemi onayda satın almanın ön talebidir; talebe çevrilen kalem siparişte kilitli, açık talep
// siparişin iptalini durdurur. Bağlar kablolamadadır (uygulamaKur kurar). Veriler uydurmadır (ORN- kodlu).
const PAROLA = 'dogru-parola-1';
interface Hata { kod: string; mesaj: string }

describe('satış siparişi ön talebi (3429-3 F3, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  let firmaId = 0;
  let sayac = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tek = async (sql: string, p: unknown[] = []): Promise<number> => (await o().sahip.tek<{ id: number }>(sql, p))!.id;
  async function istek<T = unknown>(yontem: 'GET' | 'POST' | 'PUT', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const malzeme = async (tur: 'mamul' | 'ticari_mal' = 'ticari_mal'): Promise<number> => {
    sayac += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'ORN-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`ornsot-${sayac}`, tur, sayac, JSON.stringify({ id: `ornsot-${sayac}`, com: { ad: 'Deneme satılan', birim: 'adet' } }), yoneticiId]))!.no;
  };
  const siparis = async (kalemler: { malzemeNo: number; miktar: number; karsilama: string }[]): Promise<{ id: number; no: string; satirlar: number[] }> => {
    sayac += 1;
    const no = `ORN-SOT-${String(sayac).padStart(4, '0')}`;
    const id = await tek(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id)
       VALUES ($1, 'taslak', $2, current_date, current_date + 30, 20, $3) RETURNING id`, [no, firmaId, yoneticiId]);
    const satirlar: number[] = [];
    for (const [i, k] of kalemler.entries()) {
      satirlar.push(await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, karsilama) VALUES ($1, $2, $3, $4, 5, $5) RETURNING id',
        [id, i + 1, k.malzemeNo, k.miktar, k.karsilama]));
    }
    return { id, no, satirlar };
  };
  const surum = async (id: number): Promise<number> => (await o().sahip.tek<{ surum: number }>('SELECT surum FROM siparisler_siparis WHERE id = $1', [id]))!.surum;
  const komut = async (id: number, k: 'onayla' | 'onay-geri-al' | 'iptal') =>
    istek<Hata>('POST', `/siparisler/${id}/${k}`, { surum: await surum(id), ...(k === 'onayla' ? {} : { neden: 'Deneme' }) });
  const satislar = async (): Promise<SiparisOnTalep[]> => {
    const r = await istek<OnTalepleriCevabi>('GET', '/satin-alma-on-talepleri');
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    return r.govde.onTalepler.filter((x): x is SiparisOnTalep => x.kaynak === 'siparis');
  };
  const talepAc = (kalemler: { malzemeNo: number; miktar: string; satisSiparisSatiriId?: number }[], tur = 'malzeme') =>
    istek<Hata & { id: string; no: string }>('POST', '/satin-alma-talepleri/hizli-ac', {
      id: randomUUID(), tur, ihtiyacTarihi: null, aciklama: '', uretimEmriId: null, kalemler: kalemler.map((k) => ({ aciklama: '', ...k })),
    });

  before(async () => {
    ortam = await testVeritabaniKur('satin_alma_satis_on_talep');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    firmaId = await tek("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri', 'musteri', $1) RETURNING id", [yoneticiId]);
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-', 0) ON CONFLICT (onek) DO NOTHING");
  });
  after(async () => { await ortam?.kaldir(); });

  test('onayda "Satın al" kalemi ön talep olur; talebe çevrilince düşer, ikinci kez çevrilmez; plan ihtiyacının açık talebine sayılmaz', async () => {
    const m = await malzeme();
    const s = await siparis([{ malzemeNo: m, miktar: 4, karsilama: 'satin-al' }, { malzemeNo: m, miktar: 1, karsilama: 'stok' }]);
    assert.deepEqual(await satislar(), [], 'taslak sipariş ön talep vermez');
    assert.equal((await komut(s.id, 'onayla')).durum, 200);
    const [o1, ...fazla] = await satislar();
    assert.deepEqual(fazla, []);
    assert.deepEqual([o1?.siparisSatiriId, o1?.siparisNo, o1?.musteriAdi, o1?.malzeme.no, o1?.miktar, o1?.birim], [s.satirlar[0], s.no, 'Deneme Müşteri', m, '4', 'adet']);

    const baska = await malzeme();
    assert.deepEqual([(await talepAc([{ malzemeNo: baska, miktar: '4', satisSiparisSatiriId: s.satirlar[0]! }])).govde.mesaj], [ILETILER.satisKartFarkli]);
    assert.equal((await talepAc([{ malzemeNo: m, miktar: '4', satisSiparisSatiriId: s.satirlar[1]! }])).govde.mesaj, ILETILER.satisOnTalepYok, '"Stoktan" kalem ön talep değil');
    assert.equal((await talepAc([{ malzemeNo: m, miktar: '4', satisSiparisSatiriId: s.satirlar[0]! }], 'hizmet')).durum, 400);
    const t = await talepAc([{ malzemeNo: m, miktar: '4', satisSiparisSatiriId: s.satirlar[0]! }]);
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const bag = await o().sahip.sorgu<{ satir: number | null }>('SELECT satis_siparis_satiri_id AS satir FROM satin_alma_talep_kalemi WHERE talep_id = $1', [t.govde.id]);
    assert.deepEqual(bag, [{ satir: s.satirlar[0] }]);
    assert.deepEqual(await satislar(), []);
    assert.equal((await talepAc([{ malzemeNo: m, miktar: '4', satisSiparisSatiriId: s.satirlar[0]! }])).govde.mesaj, ILETILER.satisOnTalepYok);
    // Plan ihtiyacı satış talebini kendi açık talebi saymaz (ikisi ayrı ihtiyaçtır).
    assert.deepEqual(await acikTalepMiktarlari(o().vt, [m]), []);
  });

  test('talebe bağlı kalem onayı geri alınmış siparişte kilitli; açık talep siparişin iptalini durdurur, talep iptal edilince ön talep geri gelir', async () => {
    const m = await malzeme();
    const s = await siparis([{ malzemeNo: m, miktar: 3, karsilama: 'satin-al' }]);
    assert.equal((await komut(s.id, 'onayla')).durum, 200);
    const t = await talepAc([{ malzemeNo: m, miktar: '3', satisSiparisSatiriId: s.satirlar[0]! }]);
    assert.equal(t.durum, 200, JSON.stringify(t.govde));

    const ip = await komut(s.id, 'iptal');
    assert.deepEqual([ip.durum, ip.govde.mesaj], [409, `Siparişe bağlı açık satın alma talebi var; önce talebi iptal edin: ${t.govde.no}.`]);
    assert.equal((await komut(s.id, 'onay-geri-al')).durum, 200);
    const ayrinti = await istek<{ surum: number; satirlar: { id: number; emreBagli: boolean }[] }>('GET', `/siparisler/${s.id}`);
    assert.deepEqual(ayrinti.govde.satirlar.map((k) => k.emreBagli), [true]);
    const g = await istek<Hata>('POST', `/siparisler/${s.id}/guncelle`, {
      firmaId, musteriSiparisNo: null, siparisTarihi: new Date().toISOString().slice(0, 10), termin: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      kdvOrani: '20', odemeKosulu: 'Peşin', aciklama: null, surum: ayrinti.govde.surum,
      satirlar: [{ id: s.satirlar[0], malzemeNo: m, miktar: '3', birimFiyat: '5', termin: null, aciklama: null, karsilama: 'uret' }],
    });
    assert.deepEqual([g.durum, g.govde.mesaj], [409, 'Emre ya da satın alma talebine bağlı kalemde yalnız termin değişir (kalem 1).']);

    assert.equal((await komut(s.id, 'onayla')).durum, 200);
    await o().sahip.sorgu("UPDATE satin_alma_talep SET durum = 'iptal', iptal_nedeni = 'Deneme' WHERE id = $1", [t.govde.id]);
    assert.deepEqual((await satislar()).map((x) => x.siparisSatiriId), [s.satirlar[0]], 'iptal edilen talepteki bağ ön talebi tutmaz');
    assert.equal((await komut(s.id, 'iptal')).durum, 200);
    assert.deepEqual(await satislar(), []);
  });

  test('Risk D1: satışa bağlı kalem plana gelmez (onaylı talep ve açık sipariş), stoktan karşılanmaz; F4 gelene kadar ticari mal dışı kart ön talep olmaz', async () => {
    const m = await malzeme();
    const s = await siparis([{ malzemeNo: m, miktar: 6, karsilama: 'satin-al' }]);
    assert.equal((await komut(s.id, 'onayla')).durum, 200);
    const t = await talepAc([{ malzemeNo: m, miktar: '6', satisSiparisSatiriId: s.satirlar[0]! }]);
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const kalem = (await o().sahip.tek<{ id: string }>('SELECT id FROM satin_alma_talep_kalemi WHERE talep_id = $1', [t.govde.id]))!.id;
    const stoktan = await istek<Hata>('POST', '/stok/kontrol-ihtiyaclari/karsila', { talepId: t.govde.id, kalemId: kalem, miktar: '1' });
    assert.deepEqual([stoktan.durum, stoktan.govde.mesaj], [422, 'Bu kalem Logo, iş emri, kalıp, satış siparişi ya da teklife bağlı; stoktan karşılanamaz.']);

    // Onaylı talep (karar ve son onay "onay"): bağ varken plana gelmez, bağ kalkınca gelir (süzgecin kendisi ölçülür).
    const teklif = randomUUID();
    await o().sahip.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, termin_gun) VALUES ($1, $2, 'TRY', current_date, 10)", [t.govde.id, teklif]);
    await o().sahip.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, current_date)", [t.govde.id, teklif]);
    await o().sahip.sorgu("INSERT INTO satin_alma_onay (id, talep_id, kisi_id, sonuc, notlar) VALUES ($1, $2, $3, 'onay', '')", [randomUUID(), t.govde.id, yoneticiId]);
    await o().sahip.sorgu("UPDATE satin_alma_talep SET durum = 'onayda' WHERE id = $1", [t.govde.id]);
    const bugun = new Date().toISOString().slice(0, 10);
    const bagla = (satir: number | null) => o().sahip.sorgu('UPDATE satin_alma_talep_kalemi SET satis_siparis_satiri_id = $2 WHERE talep_id = $1', [t.govde.id, satir]);
    assert.equal((await onayliTalepGelisleri(o().vt, [m], bugun)).size, 0);
    await bagla(null);
    assert.equal((await onayliTalepGelisleri(o().vt, [m], bugun)).get(m)?.length, 1, 'bağsız onaylı kalem plana gelir');
    await bagla(s.satirlar[0]!);
    // Açık satın alma siparişi: kalan bağ varken plana gelmez.
    await o().sahip.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, no) VALUES ($1, $2, 'ORN-SP-1')", [t.govde.id, teklif]);
    await o().sahip.sorgu("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 6, 'adet')", [t.govde.id, teklif, kalem]);
    await o().sahip.sorgu("UPDATE satin_alma_talep SET durum = 'siparis_verildi' WHERE id = $1", [t.govde.id]);
    assert.equal((await malzemeGelisTarihleri(o().vt, [m])).size, 0);
    await bagla(null);
    assert.equal((await malzemeGelisTarihleri(o().vt, [m])).get(m)?.length, 1, 'bağsız sipariş kalanı plana gelir');
    await bagla(s.satirlar[0]!);

    const mamul = await malzeme('mamul');
    const s2 = await siparis([{ malzemeNo: mamul, miktar: 2, karsilama: 'satin-al' }]);
    assert.equal((await komut(s2.id, 'onayla')).durum, 200);
    assert.deepEqual((await satislar()).filter((x) => x.siparisId === s2.id), []);
    assert.equal((await talepAc([{ malzemeNo: mamul, miktar: '2', satisSiparisSatiriId: s2.satirlar[0]! }])).govde.mesaj, ILETILER.satisOnTalepYok);
  });
});
