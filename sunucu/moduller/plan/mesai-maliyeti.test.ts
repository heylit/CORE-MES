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
  aySonuGunu, istasyonSaatDegeri, mesaiAyarlari, mesaiGunTuru, mesaiToplami, mesaiTutari, vardiyasizGun, type MesaiGirdisi,
} from './kurallar.ts';
import { mesaiMaliyeti } from './mesai-maliyeti.ts';

// 2653 (2644 b, 2657 a): taslağın ek mesai tutarı, yalnız toplam. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const YOL = '/api/plan/mesai-maliyeti';

// Ortak örnekler: istemcinin maliyet/kurallar.test.ts "mesaiTutari (2653 ortak örnekler)" tablosuyla aynıdır (devir-heylit/2653/ORNEKLER.md);
// biri değişirse öteki de değişir.
const ORNEKLER: [string, MesaiGirdisi, number | null][] = [
  ['M1 hafta içi', { h: 8, kisiBazli: true, op: 1, saatDegeri: 400, carpan: 1.5, kisiEk: 150, ucret: null, vardiyasiz: false, mesaiCarpan: undefined }, 4950],
  ['M2 cumartesi, iki operatör', { h: 8, kisiBazli: true, op: 2, saatDegeri: 350, carpan: 2, kisiEk: 100, ucret: null, vardiyasiz: false, mesaiCarpan: undefined }, 11400],
  ['M3 pazar, yarım operatör', { h: 7.5, kisiBazli: true, op: 0.5, saatDegeri: 500, carpan: 2, kisiEk: 0, ucret: null, vardiyasiz: false, mesaiCarpan: undefined }, 3750],
  ['M4 resmî tatil', { h: 8, kisiBazli: true, op: 1, saatDegeri: 420, carpan: 2.5, kisiEk: 120, ucret: null, vardiyasiz: true, mesaiCarpan: 3 }, 8520],
  ['M5 gün çarpanı yok: 1,5', { h: 4, kisiBazli: true, op: 1, saatDegeri: 300, carpan: undefined, kisiEk: null, ucret: null, vardiyasiz: false, mesaiCarpan: undefined }, 1800],
  ['M6 operatör oranı tanımsız: 1', { h: 8, kisiBazli: true, op: undefined, saatDegeri: 400, carpan: 1.5, kisiEk: 150, ucret: null, vardiyasiz: false, mesaiCarpan: undefined }, 4950],
  ['M7 saat değeri yok: mesai ücretine düşer', { h: 8, kisiBazli: true, op: 2, saatDegeri: null, carpan: 2, kisiEk: 100, ucret: 250, vardiyasiz: false, mesaiCarpan: 2 }, 2000],
  ['M8 saat değeri yok, vardiyasız gün', { h: 8, kisiBazli: true, op: 1, saatDegeri: null, carpan: 2, kisiEk: 100, ucret: 250, vardiyasiz: true, mesaiCarpan: 2 }, 4000],
  ['M9 saat değeri ve ücret yok: bilinmez', { h: 8, kisiBazli: true, op: 1, saatDegeri: null, carpan: 1.5, kisiEk: 100, ucret: null, vardiyasiz: false, mesaiCarpan: 2 }, null],
  ['M10 kişi bazlı değil, vardiyasız gün, çarpan yok: 1', { h: 8, kisiBazli: false, op: 1, saatDegeri: 400, carpan: 2, kisiEk: 100, ucret: 300, vardiyasiz: true, mesaiCarpan: undefined }, 2400],
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
    // Vardiyasız gün gün türünden ayrıdır: salı hafta içidir ama o gün vardiya tanımlı değil.
    assert.equal(vardiyasizGun('2026-01-05', a), false);
    assert.equal(vardiyasizGun('2026-01-06', a), true);
    assert.equal(vardiyasizGun('2026-01-01', a), true);
    assert.equal(aySonuGunu('2026-02'), '2026-02-28');
    assert.equal(aySonuGunu('2026-12'), '2026-12-31');
  });

  test('istasyon değeri atama yüzdesiyle ağırlıklı; bilinmeyen kişi değeri bilinmez yapar; atama yoksa null', () => {
    assert.deepEqual(istasyonSaatDegeri([{ yuzde: 100, deger: 120, havuz: false }, { yuzde: 50, deger: 150, havuz: false }]), { deger: 130, havuz: false });
    assert.deepEqual(istasyonSaatDegeri([{ yuzde: 100, deger: 120, havuz: false }, { yuzde: 100, deger: 160, havuz: true }]), { deger: 140, havuz: true });
    assert.equal(istasyonSaatDegeri([{ yuzde: 100, deger: 120, havuz: false }, { yuzde: 50, deger: null, havuz: false }]), null);
    assert.equal(istasyonSaatDegeri([]), null);
  });

  test('toplam: bilinmeyen sıfır sayılmaz; yalnız havuzlu satırlardan oluşan toplam null; ek mesai yoksa 0', () => {
    assert.deepEqual(mesaiToplami([{ tutar: 100, havuz: false }, { tutar: 50.555, havuz: true }]), { toplam: 150.56, bilinmeyen: false });
    assert.deepEqual(mesaiToplami([{ tutar: 100, havuz: false }, { tutar: null, havuz: false }]), { toplam: 100, bilinmeyen: true });
    assert.deepEqual(mesaiToplami([{ tutar: 100, havuz: true }]), { toplam: null, bilinmeyen: false });
    assert.deepEqual(mesaiToplami([{ tutar: 100, havuz: true }, { tutar: null, havuz: false }]), { toplam: null, bilinmeyen: true });
    assert.deepEqual(mesaiToplami([{ tutar: null, havuz: false }]), { toplam: null, bilinmeyen: true });
    assert.deepEqual(mesaiToplami([]), { toplam: 0, bilinmeyen: false });
  });
});

describe('2653 mesai maliyeti (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let makineBuyuk = 0;
  let makineKucuk = 0;
  let makineAtamasiz = 0;
  let vardiya = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  // Şubat tesis günü: maliyet ayı ocak (2626 1/2 b).
  const AN = new Date('2026-02-10T09:00:00Z');
  // Üretim üç kişi 122/sa (görünür). Havuz: Kalite iki kişi 122 ve Bakım bir kişi 244, eşit saatle -> (122 + 122 + 244) / 3.
  const HAVUZ = Math.round((488 / 3) * 10000) / 10000;

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
      makineBuyuk = await makine('MM-MB', buyuk);
      makineKucuk = await makine('MM-MK', kucuk);
      makineAtamasiz = await makine('MM-MA', atamasiz);
      const ata = (ist: number, k: number, baslangic: string) =>
        db.sorgu('INSERT INTO istasyon_kisi (istasyon_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, $3, 100)', [ist, k, baslangic]);
      for (let i = 0; i < 3; i++) await ata(buyuk, kisi[i]!, '2026-01-01');
      // Kalite'nin tek kişisi küçük istasyonda: tek başına ölçülse kendi değeri (122) çıkardı.
      await ata(kucuk, kisi[3]!, '2026-01-01');
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

  test('2657 a: yalnız küçük grubun istasyonundan oluşan toplam null; fark alma kişinin değerini değil havuzu verir', async () => {
    assert.deepEqual(await hesapla(await taslak([{ makineId: makineKucuk, gun: '2026-02-16', saat: 8 }])), { ay: '2026-01', toplam: null, bilinmeyen: false });
    const ikisi = await hesapla(await taslak([{ makineId: makineBuyuk, gun: '2026-02-16', saat: 1 }, { makineId: makineKucuk, gun: '2026-02-16', saat: 1 }]));
    assert.equal(ikisi.bilinmeyen, false);
    // Büyük grubun görünen değeri (122 x 1,5) çıkarılınca kalan küçük kısım havuzdur, Kalite kişisinin 122'si değil.
    const kalan = (ikisi.toplam! - 122 * 1.5) / 1.5;
    assert.ok(Math.abs(kalan - HAVUZ) < 0.01, `kalan ${String(kalan)}`);
    assert.notEqual(Math.round(kalan), 122);
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
});
