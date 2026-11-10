import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import {
  aySonuGunu, grupMesaiSaatTL, istasyonSaatDegeri, mesaiAyarlari, mesaiGunTuru, mesaiToplami, mesaiTutari, type MesaiGirdisi,
} from './kurallar.ts';
import { degerlendirmeBaslat, type degerlendirmeYap } from './degerlendirme.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { mesaiMaliyeti, mesaiSaatDegerleri } from './mesai-maliyeti.ts';
import { planCozumKaynagi } from './planlama-servis.ts';
import * as sorgular from './sorgular.ts';

// 2653 (2644 b, 2657 a): taslağın ek mesai tutarı, yalnız toplam. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const YOL = '/api/plan/mesai-maliyeti';

// Ortak örnekler: istemcinin maliyet/kurallar.test.ts "mesaiTutari (2653 ortak örnekler)" tablosuyla aynıdır (devir-heylit/2653/ORNEKLER.md);
// biri değişirse öteki de değişir.
const ORNEKLER: [string, MesaiGirdisi, number | null][] = [
  ['M1 hafta içi', { h: 8, kisiBazli: true, op: 1, saatDegeri: 400, carpan: 1.5, kisiEk: 150, ucret: null, mesaiCarpan: undefined }, 4950],
  ['M2 cumartesi, iki operatör', { h: 8, kisiBazli: true, op: 2, saatDegeri: 350, carpan: 2, kisiEk: 100, ucret: null, mesaiCarpan: undefined }, 11400],
  ['M3 pazar, yarım operatör', { h: 7.5, kisiBazli: true, op: 0.5, saatDegeri: 500, carpan: 2, kisiEk: 0, ucret: null, mesaiCarpan: undefined }, 3750],
  ['M4 resmî tatil', { h: 8, kisiBazli: true, op: 1, saatDegeri: 420, carpan: 2.5, kisiEk: 120, ucret: null, mesaiCarpan: 3 }, 8520],
  ['M5 gün çarpanı yok: 1,5', { h: 4, kisiBazli: true, op: 1, saatDegeri: 300, carpan: undefined, kisiEk: null, ucret: null, mesaiCarpan: undefined }, 1800],
  ['M6 operatör oranı tanımsız: 1', { h: 8, kisiBazli: true, op: undefined, saatDegeri: 400, carpan: 1.5, kisiEk: 150, ucret: null, mesaiCarpan: undefined }, 4950],
  ['M7 saat değeri yok: mesai ücretine düşer, çarpan her ek mesaide (2510 a)', { h: 8, kisiBazli: true, op: 2, saatDegeri: null, carpan: 2, kisiEk: 100, ucret: 250, mesaiCarpan: 2 }, 4000],
  ['M8 saat değeri yok, vardiyasız gün: M7 ile aynı', { h: 8, kisiBazli: true, op: 1, saatDegeri: null, carpan: 2, kisiEk: 100, ucret: 250, mesaiCarpan: 2 }, 4000],
  ['M9 saat değeri ve ücret yok: bilinmez', { h: 8, kisiBazli: true, op: 1, saatDegeri: null, carpan: 1.5, kisiEk: 100, ucret: null, mesaiCarpan: 2 }, null],
  ['M10 kişi bazlı değil, çarpan yok: 1,5', { h: 8, kisiBazli: false, op: 1, saatDegeri: 400, carpan: 2, kisiEk: 100, ucret: 300, mesaiCarpan: undefined }, 3600],
  // 2749 ile ortak yalın örnekler (2503): vardiyalı ya da vardiyasız gün aynı tutar.
  ['Y1 hafta içi vardiyalı, 8 sa, 200, çarpan 1,5', { h: 8, kisiBazli: false, op: 1, saatDegeri: null, carpan: 1.5, kisiEk: null, ucret: 200, mesaiCarpan: 1.5 }, 2400],
  ['Y2 vardiyasız gün, aynı', { h: 8, kisiBazli: true, op: 1, saatDegeri: null, carpan: 2, kisiEk: null, ucret: 200, mesaiCarpan: 1.5 }, 2400],
  ['Y3 çarpan kayıtta yok: 1,5', { h: 8, kisiBazli: false, op: 1, saatDegeri: null, carpan: 1.5, kisiEk: null, ucret: 200, mesaiCarpan: undefined }, 2400],
  ['Y4 ücret yok: bilinmez', { h: 8, kisiBazli: false, op: 1, saatDegeri: null, carpan: 1.5, kisiEk: null, ucret: null, mesaiCarpan: 1.5 }, null],
  ['Y5 çarpan 2, hafta içi, 8 sa, 200', { h: 8, kisiBazli: false, op: 1, saatDegeri: null, carpan: 1.5, kisiEk: null, ucret: 200, mesaiCarpan: 2 }, 3200],
  ['Y6 Maliyet örneği: hafta içi vardiyalı 8 sa, 300', { h: 8, kisiBazli: false, op: 1, saatDegeri: null, carpan: 1.5, kisiEk: null, ucret: 300, mesaiCarpan: undefined }, 3600],
];

describe('2653 kuralları', () => {
  for (const [ad, girdi, beklenen] of ORNEKLER) test(`ortak örnekler: ${ad}`, () => { assert.equal(mesaiTutari(girdi), beklenen); });

  test('mesai ayarları istemcinin varsayılanlarıyla okunur; 0 ya da boş mesai çarpanı istemcideki gibi', () => {
    const v = mesaiAyarlari({});
    assert.equal(v.kisiBazli, true);
    assert.deepEqual(v.carp, { hi: 1.5, cmt: 1.5, paz: 2, tatil: 2 });
    assert.equal(v.kisiEk, null);
    assert.equal(v.ucret, null);
    assert.equal(v.mesaiCarpan, 1.5);
    const a = mesaiAyarlari({
      mesaiSis: { kisiBazli: false, carp: { cmt: '2' }, kisiEk: 80 }, planTL: { mesaiCarpan: null }, ayarlar: { mesaiUcret: 250 },
      tezgahlar: [{ id: 7, grup: '3', opOran: 0.5 }, { id: 'kisi-1', grup: 3 }], tatiller: ['2026-01-01'], calismaGunleri: { pzt: ['1'] },
    });
    assert.equal(a.kisiBazli, false);
    assert.deepEqual(a.carp, { hi: 1.5, cmt: 2, paz: 2, tatil: 2 });
    assert.equal(a.kisiEk, 80);
    assert.equal(a.ucret, 250);
    assert.equal(a.mesaiCarpan, undefined, 'boş çarpan istemcide de || 1 olur');
    assert.deepEqual(a.tezgahlar.get('7'), { opOran: 0.5, grup: '3' });
    assert.deepEqual(a.tezgahlar.get('kisi-1'), { opOran: undefined, grup: '3' });
    // 2026-01-05 pazartesi, 2026-01-03 cumartesi, 2026-01-04 pazar, 2026-01-01 tatil (perşembe).
    assert.equal(mesaiGunTuru('2026-01-05', a), 'hi');
    assert.equal(mesaiGunTuru('2026-01-03', a), 'cmt');
    assert.equal(mesaiGunTuru('2026-01-04', a), 'paz');
    assert.equal(mesaiGunTuru('2026-01-01', a), 'tatil');
    assert.equal(aySonuGunu('2026-02'), '2026-02-28');
    assert.equal(aySonuGunu('2026-12'), '2026-12-31');
  });

  test('istasyon değeri atama yüzdesiyle ağırlıklı; bilinmeyen kişi (küçük grup da) değeri bilinmez yapar; atama yoksa null', () => {
    assert.equal(istasyonSaatDegeri([{ yuzde: 100, deger: 120 }, { yuzde: 50, deger: 150 }]), 130);
    // Karışık istasyon: büyük grubun kişisiyle küçük grubun kişisi (değeri null) birlikte: havuz da gerçek değer de girmez.
    assert.equal(istasyonSaatDegeri([{ yuzde: 100, deger: 120 }, { yuzde: 100, deger: null }]), null);
    assert.equal(istasyonSaatDegeri([{ yuzde: 100, deger: 120 }, { yuzde: 50, deger: null }]), null);
    assert.equal(istasyonSaatDegeri([]), null);
  });

  test('toplam: bilinmeyen sıfır sayılmaz; bilinen yoksa null; havuz kuralı yok (2743 b); ek mesai yoksa 0', () => {
    assert.deepEqual(mesaiToplami([100, 50.555]), { toplam: 150.56, bilinmeyen: false });
    assert.deepEqual(mesaiToplami([100, null]), { toplam: 100, bilinmeyen: true });
    // Küçük grubun satırı da yalın ücretle bilinen tutardır; toplam görünür.
    assert.deepEqual(mesaiToplami([100]), { toplam: 100, bilinmeyen: false });
    assert.deepEqual(mesaiToplami([null]), { toplam: null, bilinmeyen: true });
    assert.deepEqual(mesaiToplami([]), { toplam: 0, bilinmeyen: false });
  });

  test('C2 yıllık grup değeri: bilinen tezgâhların opOran ağırlıklı ortalaması, op bir kez; hepsi null ise null', () => {
    // Bir tezgâh, op 1: istemcinin mesaiSaatTL'si ile aynı formül (s x op x hi + kisiEk / 8 x op).
    assert.equal(grupMesaiSaatTL([{ opOran: 1, deger: 400 }], 1.5, 160), 400 * 1.5 + 20);
    // İki tezgâh aynı istasyonda (aynı değer): op çift sayılmaz; ortalama op 1,5.
    assert.equal(grupMesaiSaatTL([{ opOran: 1, deger: 400 }, { opOran: 2, deger: 400 }], 1.5, 160), 400 * 1.5 * 1.5 + 20 * 1.5);
    // Farklı değer: s = (1 x 300 + 3 x 500) / 4 = 450; ortalama op 2.
    assert.equal(grupMesaiSaatTL([{ opOran: 1, deger: 300 }, { opOran: 3, deger: 500 }], 2, null), 450 * 2 * 2);
    // Bilinmeyen tezgâh ortalamaya girmez ama op ortalamasında kalır; opOran yoksa 1.
    assert.equal(grupMesaiSaatTL([{ opOran: undefined, deger: 400 }, { opOran: 1, deger: null }], 1.5, 0), 400 * 1.5);
    assert.equal(grupMesaiSaatTL([{ opOran: 1, deger: null }], 1.5, 160), null);
    assert.equal(grupMesaiSaatTL([], 1.5, 160), null);
  });
});

describe('2653 mesai maliyeti (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let makineBuyuk = 0;
  let makineKucuk = 0;
  let makineAtamasiz = 0;
  let makineKarisik = 0;
  let istasyonBuyuk = 0;
  let vardiya = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  // Şubat tesis günü: maliyet ayı ocak (2626 1/2 b).
  const AN = new Date('2026-02-10T09:00:00Z');
  // Üretim üç kişi 122/sa: eşikte, büyük grup (görünür). Kalite iki kişi ve Bakım bir kişi: küçük grup, değerleri hiçbir yoldan girmez.

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  const taslak = async (satirlar: { makineId: number; gun: string; saat: number }[]): Promise<number> => {
    const id = (await ortam!.sahip.tek<{ id: number }>('INSERT INTO plan_senaryosu (ad, taban_plan_surumu, acan_kisi_id) VALUES ($1, 1, $2) RETURNING id', ['Deneme', yoneticiId]))!.id;
    for (const s of satirlar) {
      await ortam!.sahip.sorgu('INSERT INTO plan_senaryo_ek_mesai (senaryo_id, makine_id, gun, vardiya_id, saat) VALUES ($1, $2, $3, $4, $5)', [id, s.makineId, s.gun, vardiya, s.saat]);
    }
    return id;
  };
  const hesapla = (id: number) => vt().tx((db) => mesaiMaliyeti(db, id, AN));

  before(async () => {
    ortam = await testVeritabaniKur('plan_mesai_maliyeti');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx(async (db) => {
      yoneticiId = await yoneticiOlustur(db, { ad: 'Deneme yönetici', kullaniciAdi: 'mm-yon', parola: PAROLA });
      const kisi: number[] = [];
      for (let i = 0; i < 6; i++) kisi.push(await yoneticiOlustur(db, { ad: `Deneme ${i}`, kullaniciAdi: `mm-${i}`, parola: PAROLA }));
      const [im] = await db.sorgu<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('MM', 'Merkez') RETURNING id");
      const dep = async (kimlik: string, ad: string) => (await db.tek<{ no: number }>(
        'INSERT INTO ik_departman (kimlik, ad, olusturan_kisi_id, guncelleyen_kisi_id) VALUES ($1, $2, $3, $3) RETURNING no', [kimlik, ad, yoneticiId]))!.no;
      const uretim = await dep('dep_uretim', 'Üretim');
      const kalite = await dep('dep_kalite', 'Kalite');
      const bakim = await dep('dep_bakim', 'Bakım');
      await db.sorgu("INSERT INTO ik_parametre_donemi (kod, ad, baslangic, sgk_isveren_orani, issizlik_isveren_orani, sgk_tavani, aylik_saat) VALUES ('p2026', '2026', '2026-01-01', 20, 2, 150000, 220)");
      const personel = async (i: number, departman: number, brut: number, kisiId: number) => (await db.tek<{ no: number }>(
        `INSERT INTO ik_personel (kimlik, ad, soyad, is_merkezi_id, departman_no, brut_maas, kisi_id, olusturan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, $1, 'Deneme', $2, $3, $4, $5, $6, $6) RETURNING no`, [`emp_${i}`, im!.id, departman, brut, kisiId, yoneticiId]))!.no;
      const gun = (no: number) => db.sorgu(
        "INSERT INTO ik_puantaj (personel_no, tarih, durum, giris, cikis, yazan_kisi_id) VALUES ($1, '2026-01-05', 'calisti', '08:00', '18:00', $2)", [no, yoneticiId]);
      for (let i = 0; i < 3; i++) await gun(await personel(i, uretim, 22000, kisi[i]!));
      await gun(await personel(3, kalite, 22000, kisi[3]!));
      await gun(await personel(4, kalite, 22000, kisi[4]!));
      await gun(await personel(5, bakim, 44000, kisi[5]!));
      const istasyon = async (kod: string) => (await db.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $1, $2) RETURNING id', [kod, im!.id]))!.id;
      const makine = async (kod: string, ist: number) => (await db.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $1, $2) RETURNING id', [kod, ist]))!.id;
      const buyuk = await istasyon('MM-B');
      const kucuk = await istasyon('MM-K');
      const atamasiz = await istasyon('MM-A');
      const karisik = await istasyon('MM-X');
      istasyonBuyuk = buyuk;
      makineBuyuk = await makine('MM-MB', buyuk);
      makineKarisik = await makine('MM-MX', karisik);
      makineKucuk = await makine('MM-MK', kucuk);
      makineAtamasiz = await makine('MM-MA', atamasiz);
      const ata = (ist: number, k: number, baslangic: string) =>
        db.sorgu('INSERT INTO istasyon_kisi (istasyon_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, $3, 100)', [ist, k, baslangic]);
      for (let i = 0; i < 3; i++) await ata(buyuk, kisi[i]!, '2026-01-01');
      // Kalite'nin tek kişisi küçük istasyonda: tek başına ölçülse kendi değeri (122) çıkardı.
      await ata(kucuk, kisi[3]!, '2026-01-01');
      // Karışık istasyon: büyük grubun kişisi ve küçük grubun kişisi birlikte.
      await ata(karisik, kisi[0]!, '2026-01-01');
      await ata(karisik, kisi[4]!, '2026-01-01');
      // Ay sonundan sonra başlayan atama sayılmaz.
      await ata(atamasiz, kisi[0]!, '2026-02-01');
      vardiya = (await db.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Deneme mesai', '08:00', '16:00') RETURNING id"))!.id;
    });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('büyük departmanın istasyonu: saat x saat değeri x hafta içi çarpanı; ay son tam ay', async () => {
    // 2026-02-16 pazartesi: 8 x 1 x 122 x 1,5.
    assert.deepEqual(await hesapla(await taslak([{ makineId: makineBuyuk, gun: '2026-02-16', saat: 8 }])), { ay: '2026-01', toplam: 1464, bilinmeyen: false });
  });

  test('2743 b: küçük grubun (2 kişi) istasyonu yalın mesai ücretine düşer; ücret yoksa satır bilinmiyor; havuz ve gerçek değer girmez', async () => {
    assert.deepEqual(await hesapla(await taslak([{ makineId: makineKucuk, gun: '2026-02-16', saat: 8 }])), { ay: '2026-01', toplam: null, bilinmeyen: true });
    // Fark alma: büyük grubun görünen değeri (1 x 122 x 1,5) dışında toplama küçük gruptan hiçbir şey girmez.
    const ikisi = await hesapla(await taslak([{ makineId: makineBuyuk, gun: '2026-02-16', saat: 1 }, { makineId: makineKucuk, gun: '2026-02-16', saat: 1 }]));
    assert.deepEqual(ikisi, { ay: '2026-01', toplam: 183, bilinmeyen: true });
  });

  test('karışık istasyon (büyük ve küçük grubun kişisi) bilinmiyor: yalın ücrete düşer, büyük grubun değeri de kullanılmaz', async () => {
    assert.deepEqual(await hesapla(await taslak([{ makineId: makineKarisik, gun: '2026-02-16', saat: 8 }])), { ay: '2026-01', toplam: null, bilinmeyen: true });
  });

  test('ay sonunda geçerli ataması olmayan istasyon: değer ve mesai ücreti yok, satır bilinmiyor; toplam bilinenden', async () => {
    const c = await hesapla(await taslak([{ makineId: makineBuyuk, gun: '2026-02-16', saat: 8 }, { makineId: makineAtamasiz, gun: '2026-02-16', saat: 8 }]));
    assert.deepEqual(c, { ay: '2026-01', toplam: 1464, bilinmeyen: true });
  });

  test('ek mesaisi olmayan taslakta toplam 0; olmayan taslak 404', async () => {
    assert.deepEqual(await hesapla(await taslak([])), { ay: '2026-01', toplam: 0, bilinmeyen: false });
    await assert.rejects(hesapla(999_999), (h: { durum?: number }) => h.durum === 404);
  });

  test('uç: yalnız finans.maliyet-oku; cevap yalnız ay, toplam, bilinmeyen; saat istemciden alınmaz', async () => {
    const id = await taslak([{ makineId: makineBuyuk, gun: '2026-02-16', saat: 8 }]);
    const maliyet = await islemliKisi('mm_maliyet', ['finans.maliyet-oku']);
    const c = await app.inject({ method: 'GET', url: `${YOL}?taslak=${String(id)}`, headers: { cookie: maliyet } });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(Object.keys(c.json() as object).sort(), ['ay', 'bilinmeyen', 'toplam']);
    assert.doesNotMatch(c.body, /kisi|departman|saat|grup/i);
    assert.equal((await app.inject({ method: 'GET', url: `${YOL}?taslak=${String(id)}&saat=1`, headers: { cookie: maliyet } })).statusCode, 400, 'fazla alan');
    assert.equal((await app.inject({ method: 'GET', url: YOL, headers: { cookie: maliyet } })).statusCode, 400, 'taslak yok');
    assert.equal((await app.inject({ method: 'GET', url: `${YOL}?taslak=999999`, headers: { cookie: maliyet } })).statusCode, 404);
    for (const [ad, islemler] of [['mm_yaz', ['plan.yaz']], ['mm_oku', ['plan.planlama-oku']]] as const) {
      const cerez = await islemliKisi(ad, [...islemler]);
      assert.equal((await app.inject({ method: 'GET', url: `${YOL}?taslak=${String(id)}`, headers: { cookie: cerez } })).statusCode, 403, ad);
    }
  });

  // Bundan sonraki testler planlama kaydı yazar (mesai ücreti 300, kişi başı ek 80); öncekiler kayıtsız çalışmayla koşar.
  const kayitYaz = async () => {
    const c = (await vt().tx((db) => planCozumKaynagi(db, AN.getTime()))).calisma as { D: Record<string, unknown> };
    const deger = { ...c, D: { ...c.D, ayarlar: { ...(c.D['ayarlar'] as object), mesaiUcret: 300 }, mesaiSis: { kisiBazli: true, carp: { hi: 1.5 }, kisiEk: 80 } } };
    await vt().tx(async (db) => {
      await db.sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
      await sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, kisiId: yoneticiId });
    });
  };

  test('2743 b, 2510 a: mesai ücreti varken küçük ve karışık istasyon yalın ücretle, hafta içi vardiyada da 1,5 çarpanla; büyük grup grup değeriyle', async () => {
    await kayitYaz();
    // 2026-02-16 pazartesi. Yalın: 8 x 300 x 1,5. Büyük: 8 x 1 x 122 x 1,5 + 80.
    assert.deepEqual(await hesapla(await taslak([{ makineId: makineKucuk, gun: '2026-02-16', saat: 8 }])), { ay: '2026-01', toplam: 3600, bilinmeyen: false });
    assert.deepEqual(await hesapla(await taslak([{ makineId: makineKarisik, gun: '2026-02-16', saat: 8 }])), { ay: '2026-01', toplam: 3600, bilinmeyen: false });
    assert.deepEqual(await hesapla(await taslak([{ makineId: makineBuyuk, gun: '2026-02-16', saat: 8 }])), { ay: '2026-01', toplam: 1544, bilinmeyen: false });
  });

  test('2742 yıllık plan ucu: yalnız finans.maliyet-oku; parametresiz, strict; büyük grup değerli, küçük, karışık ve atamasız null', async () => {
    await kayitYaz();
    const UC = '/api/plan/mesai-saat-degerleri';
    const maliyet = await islemliKisi('mm_yillik', ['finans.maliyet-oku']);
    const c = await app.inject({ method: 'GET', url: UC, headers: { cookie: maliyet } });
    assert.equal(c.statusCode, 200, c.body);
    const u = c.json() as { ay: string; gruplar: { grup: string; saatTL: number | null }[] };
    assert.deepEqual(Object.keys(u).sort(), ['ay', 'gruplar']);
    assert.doesNotMatch(c.body, /kisi|departman|havuz/i);
    // Değerler maliyet ayına bağlıdır (uç bugünün ayını okur): hesap testin anıyla doğrudan.
    const g = await vt().tx((db) => mesaiSaatDegerleri(db, AN));
    assert.equal(g.ay, '2026-01');
    for (const x of [...u.gruplar, ...g.gruplar]) assert.deepEqual(Object.keys(x).sort(), ['grup', 'saatTL']);
    // Büyük grup: 122 x 1 x 1,5 + 80 / 8 x 1 (istemcinin mesaiSaatTL formülü).
    const bilinen = g.gruplar.filter((x) => x.saatTL !== null);
    assert.deepEqual(bilinen, [{ grup: String(istasyonBuyuk), saatTL: 193 }], JSON.stringify(g));
    assert.ok(g.gruplar.length >= 4, 'küçük, karışık ve atamasız istasyon null satırla döner');
    assert.equal((await app.inject({ method: 'GET', url: `${UC}?grup=1`, headers: { cookie: maliyet } })).statusCode, 400, 'parametre alınmaz');
    for (const [ad, islemler] of [['mm_y_yaz', ['plan.yaz']], ['mm_y_oku', ['plan.planlama-oku']]] as const) {
      const cerez = await islemliKisi(ad, [...islemler]);
      assert.equal((await app.inject({ method: 'GET', url: UC, headers: { cookie: cerez } })).statusCode, 403, ad);
    }
  });

  test('2742 K2, K3: değerlendirme girdisine tezgâh değeri yalnız maliyeti görende yazılır; hiçbir okuma cevabı mesaiSaat taşımaz', async () => {
    await kayitYaz();
    const surum = (await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))!.surum;
    const yakala = (): { yap: typeof degerlendirmeYap; girdi: () => unknown } => {
      let g: unknown = null;
      return { yap: ((girdi: unknown) => { g = girdi; return Promise.resolve(null); }) as unknown as typeof degerlendirmeYap, girdi: () => g };
    };
    const mesaiSaati = (g: unknown) => (g as { calisma: { D: { mesaiSaat?: Record<string, number | null> } } }).calisma.D.mesaiSaat;
    const gorur = yakala();
    await vt().tx((db) => degerlendirmeBaslat(db, { id: yoneticiId, ad: 'g', islemler: ['plan.planlama-oku', 'finans.maliyet-oku'] }, { surum, istek: { tur: 'plan-kur' } }, AN.getTime(), gorur.yap));
    const ms = mesaiSaati(gorur.girdi());
    assert.ok(ms !== undefined, 'maliyeti görende değer yazılır');
    assert.equal(ms[String(makineBuyuk)], 122);
    for (const m of [makineKucuk, makineKarisik, makineAtamasiz]) assert.equal(ms[String(m)], null, String(m));
    const gormez = yakala();
    await vt().tx((db) => degerlendirmeBaslat(db, { id: yoneticiId + 1, ad: 'o', islemler: ['plan.planlama-oku'] }, { surum, istek: { tur: 'plan-kur' } }, AN.getTime(), gormez.yap));
    assert.equal(mesaiSaati(gormez.girdi()), undefined, 'maliyeti görmeyende değer okunmaz');

    // Gerçek hesapla değerlendirme sonucu, planlama çalışması ve ham kayıt okuması: anahtar hiçbir cevapta yok.
    const maliyet = await islemliKisi('mm_k2', ['plan.planlama-oku', 'finans.maliyet-oku', 'recete-rota.oku']);
    const b = await app.inject({ method: 'POST', url: '/api/plan/planlama-degerlendirmesi', headers: { cookie: maliyet }, payload: { surum, istek: { tur: 'plan-kur' } } });
    assert.equal(b.statusCode, 200, b.body);
    const is = (b.json() as { is: string }).is;
    let d = 'suruyor';
    for (let i = 0; i < 500; i++) {
      const r = await app.inject({ method: 'GET', url: `/api/plan/planlama-degerlendirmesi/${is}`, headers: { cookie: maliyet } });
      assert.equal(r.statusCode, 200, r.body);
      d = (r.json() as { durum: string }).durum;
      if (d !== 'suruyor') { assert.doesNotMatch(r.body, /mesaiSaat/); break; }
      await new Promise((coz) => setTimeout(coz, 20));
    }
    assert.notEqual(d, 'suruyor');
    for (const url of ['/api/plan/planlama-calismasi', '/api/plan/planlama-kayitlari']) {
      const r = await app.inject({ method: 'GET', url, headers: { cookie: maliyet } });
      assert.equal(r.statusCode, 200, `${url} ${r.body.slice(0, 200)}`);
      assert.doesNotMatch(r.body, /mesaiSaat/, url);
    }
    // İstemci değeri geri yazsa da kayda girmez (Güvenlik Ek).
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'mm-yon', parola: PAROLA } });
    const yon = String(g.headers['set-cookie']).split(';')[0] ?? '';
    const k = (await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))!;
    const deger = k.deger as { D: Record<string, unknown> };
    const yaz = await app.inject({ method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: yon },
      payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: { ...deger, D: { ...deger.D, mesaiSaat: { [String(makineBuyuk)]: 7771 } } }, beklenenSurum: k.surum } });
    assert.equal(yaz.statusCode, 200, yaz.body);
    const sonra = JSON.stringify((await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))?.deger);
    assert.ok(!sonra.includes('mesaiSaat') && !sonra.includes('7771'), sonra.slice(0, 200));
  });
});
