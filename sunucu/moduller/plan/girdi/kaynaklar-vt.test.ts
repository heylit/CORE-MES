import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { testVeritabaniKur, type TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../../kisiler/disari.ts';
import { KAYNAK_OKUMA } from '../../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from '../disari.ts';
import { planGirdisi } from '../plan-girdisi.ts';
import { planlamaGirdisi } from '../planlama-servis.ts';
import * as sorgular from '../sorgular.ts';
import { dilimFarki, farkMetni } from './esdegerlik.ts';
import { kaynakDilimiOku } from './kaynaklar.ts';
import { KAYNAK_ALANLARI, kaynakDilimiKur, type KaynakElleVerisi } from './kaynaklar-kurallar.ts';

// 1716: kaynak diliminin eşdeğerliği gerçek PostgreSQL'de. Aynı tohum veride eski yol (planlamaGirdisi -> planGirdisi, sayfanın açılışı)
// ile yeni yol (kaynakDilimiOku + kaynakDilimiKur) aynı kaynak alanlarını vermeli; her biri tam yetkiyle ve kısıtlı yetkiyle. Veriler uydurmadır.

const TAM: readonly string[] = [...new Set(Object.values(KAYNAK_OKUMA).flat())];

describe('kaynak dilimi eşdeğerliği (1716, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  const kullanici = (islemler: readonly string[]): Kullanici => ({ id: yoneticiId, ad: 'Deneme', islemler: islemler as Kullanici['islemler'] });

  // Planlama çalışması: elle değiştirilmiş tezgâh ücreti, sayfanın kişi alanı ve elle devamsızlık.
  const calisma = (ids: { m1: number; k1: number }) => ({
    surum: 2, setId: 'tmi', rrSavedAt: 0, dataVer: 1, kisitSurum: 2, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: {
      meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], siparisler: [],
      tezgahlar: [{ id: String(ids.m1), ad: 'Eski', grup: '0', ucret: 950, ucretIst: 900, verim: 0.8, vardiyalar: [], opOran: 0, isiksiz: true }],
      personel: [{ id: String(ids.k1), ad: 'Eski', vardiya: '', gruplar: [], makineler: [], enCok: null, ayar: true, notu: 'sayfa' }],
      devamsizlik: [{ personel: String(ids.k1), gun: '2026-10-23' }],
    },
  });

  before(async () => {
    ortam = await testVeritabaniKur('plan_girdi_kaynaklar');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const s = ortam.sahip;
    const id = async (sql: string, p: unknown[] = []): Promise<number> => (await s.tek<{ id: number }>(sql, p))!.id;
    const im1 = await id("INSERT INTO is_merkezi (kod, ad) VALUES ('KD-IM1', 'Deneme merkezi 1') RETURNING id");
    const im2 = await id("INSERT INTO is_merkezi (kod, ad) VALUES ('KD-IM2', 'Deneme merkezi 2') RETURNING id");
    const is1 = await id("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('KD-IS1', 'Deneme torna', $1, true) RETURNING id", [im1]);
    const is2 = await id("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('KD-IS2', 'Deneme freze', $1, true) RETURNING id", [im2]);
    const m1 = await id("INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('KD-M1', 'Deneme torna 1', $1, true) RETURNING id", [is1]);
    const m2 = await id("INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('KD-M2', 'Deneme torna 2', $1, true) RETURNING id", [is1]);
    await id("INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('KD-M3', 'Deneme freze 1', $1, true) RETURNING id", [is2]);
    await s.sorgu('INSERT INTO istasyonlar_plan_ayari (istasyon_id, verim_yuzde, operator_ihtiyaci, degistiren_kisi_id) VALUES ($1, 85, 0.5, $2)', [is1, yoneticiId]);
    await s.sorgu("INSERT INTO finans_istasyon_maliyet (istasyon_id, saat_maliyeti, para_birimi, guncelleyen_id) VALUES ($1, 900, 'TRY', $3), ($2, 40, 'EUR', $3)", [is1, is2, yoneticiId]);
    const v1 = await id("INSERT INTO vardiya (ad, baslangic, bitis, aktif) VALUES ('Gunduz', '08:00', '16:00', true) RETURNING id");
    const v2 = await id("INSERT INTO vardiya (ad, baslangic, bitis, aktif) VALUES ('Aksam', '16:00', '23:59', true) RETURNING id");
    await s.sorgu("INSERT INTO vardiya_molasi (vardiya_id, baslangic, bitis) VALUES ($1, '12:00', '12:30')", [v1]);
    await s.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) VALUES ($1, 1, $3), ($1, 1, $4), ($1, 2, $3), ($2, 7, $3)', [im1, im2, v1, v2]);
    await s.sorgu("INSERT INTO vardiya_takvim_gunu (tarih, tur, ad) VALUES ('2026-10-29', 'tatil', 'Deneme tatili')");
    const k1 = await id("INSERT INTO kisi (ad, aktif, gorev) VALUES ('Deneme Ayarci', true, 'Ayarcı') RETURNING id");
    const k2 = await id("INSERT INTO kisi (ad, aktif, gorev) VALUES ('Deneme Operator', true, 'Operatör') RETURNING id");
    await s.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $3), ($2, $3), ($2, $4)', [k1, k2, is1, is2]);
    await s.sorgu('INSERT INTO istasyonlar_makine_yetkinlik (kisi_id, makine_id, veren_kisi_id) VALUES ($1, $2, $4), ($1, $3, $4)', [k2, m1, m2, yoneticiId]);
    await s.sorgu('INSERT INTO istasyonlar_kisi_tezgah_siniri (kisi_id, en_cok, degistiren_kisi_id) VALUES ($1, 2, $2)', [k2, yoneticiId]);
    await s.sorgu('INSERT INTO vardiya_kisi (kisi_id, vardiya_id) VALUES ($1, $3), ($2, $4)', [k1, k2, v1, v2]);
    await ortam.vt.tx((db) => sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma({ m1, k1 }), kisiId: yoneticiId }));
  });
  after(async () => { await ortam?.kaldir(); });

  const karsilastir = async (islemler: readonly string[]): Promise<Record<string, unknown>> => {
    const k = kullanici(islemler);
    const simdi = Date.UTC(2026, 9, 19, 9);
    const { girdi } = await vt().tx((db) => planlamaGirdisi(db, k, simdi));
    assert.ok(girdi);
    const eski = planGirdisi({ calisma: girdi.calisma, kayit: girdi.kayit, kaynak: girdi.kaynak, bugun: '2026-10-19' }, simdi);
    assert.ok(eski);
    const eskiD = eski.S['D'] as Record<string, unknown>;
    const okuma = await vt().tx((db) => kaynakDilimiOku(db, k, simdi));
    const elle = (girdi.calisma as { D: KaynakElleVerisi }).D;
    const yeni = kaynakDilimiKur(okuma, elle);
    assert.equal(farkMetni(dilimFarki(eskiD, yeni, KAYNAK_ALANLARI)), '');
    return eskiD;
  };

  test('KV-01: tam yetkiyle yeni yol eski yolla aynı kaynak alanlarını verir; veri senaryoda dolu', async () => {
    const D = await karsilastir(TAM) as { tezgahlar: unknown[]; personel: unknown[]; vardiyalar: unknown[]; tatiller: string[]; calismaGunleri: object };
    assert.equal(D.tezgahlar.length, 3);
    assert.equal(D.personel.length, 3);
    assert.equal(D.vardiyalar.length, 2);
    assert.deepEqual(D.tatiller.includes('2026-10-29'), true);
    assert.ok(Object.keys(D.calismaGunleri).length > 0);
  });

  test('KV-02: maliyeti okumayan kullanıcıda da aynı', async () => {
    await karsilastir(TAM.filter((i) => !KAYNAK_OKUMA.maliyet.includes(i as never)));
  });

  test('KV-03: kişiyi okuyup istasyonu okumayan kullanıcıda kişi alanları aynı', async () => {
    const islemler = TAM.filter((i) => !KAYNAK_OKUMA.istasyon.includes(i as never));
    const k = kullanici(islemler);
    const { girdi } = await vt().tx((db) => planlamaGirdisi(db, k, Date.UTC(2026, 9, 19, 9)));
    assert.ok(girdi);
    const eski = planGirdisi({ calisma: girdi.calisma, kayit: girdi.kayit, kaynak: girdi.kaynak, bugun: '2026-10-19' });
    const okuma = await vt().tx((db) => kaynakDilimiOku(db, k));
    const yeni = kaynakDilimiKur(okuma, (girdi.calisma as { D: KaynakElleVerisi }).D);
    // İstasyon okunamayınca eski yol tezgâhı ve takvimi Reçete ve Rota kaydından kurar, yeni yol açık çalışmadakini korur (1720'de sorulur).
    assert.equal(farkMetni(dilimFarki(eski?.S['D'] as Record<string, unknown>, yeni, ['vardiyalar', 'tatiller', 'personel', 'devamsizlik'])), '');
  });
});
