import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../../kisiler/disari.ts';
import { grupSaatMaliyetleri, kisilerinGrupSaatMaliyeti, kisilerinGrupSaatMaliyetiYalnizHesapIcin } from '../disari.ts';

describe('İK grup saat maliyeti (2602-a; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const kisi: number[] = [];
  let uretim = 0;
  let kucuk = 0;

  before(async () => {
    ortam = await testVeritabaniKur('ik_saat_maliyeti');
    await ortam.vt.tx(async (db) => {
      const yon = await yoneticiOlustur(db, { ad: 'Deneme yönetici', kullaniciAdi: 'ik-sm-yon', parola: 'dogru-parola-1' });
      for (let i = 0; i < 6; i++) kisi.push(await yoneticiOlustur(db, { ad: `Deneme ${i}`, kullaniciAdi: `ik-sm-${i}`, parola: 'dogru-parola-1' }));
      const [im] = await db.sorgu<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IKSM', 'Merkez') RETURNING id");
      const dep = async (kimlik: string, ad: string) => (await db.tek<{ no: number }>(
        'INSERT INTO ik_departman (kimlik, ad, olusturan_kisi_id, guncelleyen_kisi_id) VALUES ($1, $2, $3, $3) RETURNING no', [kimlik, ad, yon]))!.no;
      uretim = await dep('dep_uretim', 'Üretim');
      kucuk = await dep('dep_kucuk', 'Kalite');
      await db.sorgu("INSERT INTO ik_parametre_donemi (kod, ad, baslangic, sgk_isveren_orani, issizlik_isveren_orani, sgk_tavani, aylik_saat) VALUES ('p2026', '2026', '2026-01-01', 20, 2, 150000, 220)");
      // 2026-03'te oranlar değişir: şubat ocak dönemini, mart yeni dönemi kullanır.
      await db.sorgu("INSERT INTO ik_parametre_donemi (kod, ad, baslangic, sgk_isveren_orani, issizlik_isveren_orani, sgk_tavani, aylik_saat) VALUES ('p2026m', '2026 mart', '2026-03-01', 30, 2, 150000, 220)");
      const personel = async (i: number, departman: number | null, brut: number | null, kisiId: number | null) => (await db.tek<{ no: number }>(
        `INSERT INTO ik_personel (kimlik, ad, soyad, is_merkezi_id, departman_no, brut_maas, kisi_id, olusturan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, $1, 'Deneme', $2, $3, $4, $5, $6, $6) RETURNING no`, [`emp_${i}`, im!.id, departman, brut, kisiId, yon]))!.no;
      const gun = async (no: number, tarih: string, giris: string, cikis: string | null) => db.sorgu(
        "INSERT INTO ik_puantaj (personel_no, tarih, durum, giris, cikis, yazan_kisi_id) VALUES ($1, $2, 'calisti', $3, $4, $5)", [no, tarih, giris, cikis, yon]);
      // Üretim: üç kişi. 0: kartta 22.000, ücret geçmişinde şubatta 44.000'e çıkar. 1: 22.000. 2: 44.000, gece vardiyası.
      const p0 = await personel(0, uretim, 22000, kisi[0]!);
      await db.sorgu("INSERT INTO ik_personel_ucret (personel_no, sira, yururluk, brut) VALUES ($1, 1, '2026-01-01', 22000), ($1, 2, '2026-02-15', 44000)", [p0]);
      const p1 = await personel(1, uretim, 22000, kisi[1]!);
      const p2 = await personel(2, uretim, 44000, kisi[2]!);
      await gun(p0, '2026-01-05', '08:00', '18:00');
      await gun(p1, '2026-01-05', '08:00', '18:00');
      await gun(p1, '2026-01-06', '08:00', '18:00');
      await gun(p2, '2026-01-05', '22:00', '06:00');
      await gun(p2, '2026-01-07', '08:00', null);
      await gun(p0, '2026-02-02', '08:00', '18:00');
      // 2632 a: 1'in ocak bordrosu kesinleşmiş: işveren maliyeti 30.000, 27 prim günü, 30 saat fazla mesai, 22 saat resmi tatil çalışması
      // -> bölen 220 x 27 / 30 + 30 + 22 = 250 -> 120. 0'ın ocak bordrosu
      // kesinleşmemiş, iptal edilmiş bordro da sayılmaz: 0 formülle kalır.
      const bordro = (kimlik: string, no: number, maliyet: number, kesin: boolean, iptal = false) => db.sorgu(
        `INSERT INTO ik_bordro (kimlik, personel_no, donem, maliyet, gun, mesai_saat, tatil_saat, kesinlesme, iptal, olusturan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, $2, '2026-01-01', $3, 27, 30, 22, CASE WHEN $4 THEN now() END, $5, $6, $6)`, [kimlik, no, maliyet, kesin, iptal, yon]);
      await bordro('b1', p1, 30000, true);
      await bordro('b0', p0, 99999, false);
      await bordro('b0i', p0, 88888, true, true);
      // Kalite: iki kişi (küçük grup), biri bağsız.
      const p3 = await personel(3, kucuk, 22000, kisi[3]!);
      const p4 = await personel(4, kucuk, 22000, null);
      await gun(p3, '2026-01-05', '08:00', '12:00');
      await gun(p4, '2026-01-05', '08:00', '12:00');
      // Departmansız kişi hiçbir gruba girmez.
      await personel(5, null, 22000, kisi[4]!);
    });
  });
  after(async () => { await ortam?.kaldir(); });

  test('IK-86, IK-85 (2632 a): departman değeri saatle ağırlıklı; kesinleşmiş bordro formülün yerine geçer; çıkışsız gün sayılmaz, gece vardiyası 8 saat; kişi brütü dönmez', async () => {
    const g = await ortam!.vt.tx((db) => grupSaatMaliyetleri(db, '2026-01'));
    // Ocak: 0 -> 122 x 10 (formül), 1 -> 120 x 20 (bordro), 2 -> 244 x 8. (1220 + 2400 + 1952) / 38.
    assert.deepEqual(g.get(uretim), { departmanNo: uretim, departmanAd: 'Üretim', saatMaliyeti: Math.round((5572 / 38) * 10000) / 10000, kisiSayisi: 3, kucuk: false });
    // Güvenlik K1: küçük grubun değeri ekrana gidebilen işlevde gizli.
    assert.deepEqual(g.get(kucuk), { departmanNo: kucuk, departmanAd: 'Kalite', saatMaliyeti: null, kisiSayisi: 2, kucuk: true });
    assert.deepEqual(Object.keys(g.get(uretim)!).sort(), ['departmanAd', 'departmanNo', 'kisiSayisi', 'kucuk', 'saatMaliyeti']);
  });

  test('IK-85: ay sonunda yürürlükteki brüt ve ayın parametre dönemi; puantajı olmayan ayda değer bilinmez', async () => {
    const subat = await ortam!.vt.tx((db) => grupSaatMaliyetleri(db, '2026-02'));
    // Şubat: yalnız 0 çalıştı, brüt 44.000 (15 Şubat'tan), ocak dönemi oranları: 44.000 x 1,22 / 220 = 244.
    // Tek kişilik grup: ekrana gidebilen işlev gizler; hesap işlevi gerçek değeri verir.
    assert.deepEqual(subat.get(uretim), { departmanNo: uretim, departmanAd: 'Üretim', saatMaliyeti: null, kisiSayisi: 1, kucuk: true });
    const hesap = await ortam!.vt.tx((db) => kisilerinGrupSaatMaliyetiYalnizHesapIcin(db, [kisi[0]!], '2026-02'));
    assert.deepEqual(hesap.get(kisi[0]!), { departmanNo: uretim, saatMaliyeti: 244, kucuk: true });
    assert.equal(subat.get(kucuk)?.saatMaliyeti, null);
    const mart = await ortam!.vt.tx((db) => grupSaatMaliyetleri(db, '2026-03'));
    assert.equal(mart.get(uretim)?.saatMaliyeti, null);
  });

  test('kişi için grubun değeri döner; bağsız ve departmansız kişi haritada yok; boş liste sorgu atmaz', async () => {
    const m = await ortam!.vt.tx((db) => kisilerinGrupSaatMaliyeti(db, [kisi[0]!, kisi[3]!, kisi[4]!, kisi[5]!, kisi[3]!], '2026-01'));
    assert.deepEqual([...m.keys()].sort((a, b) => a - b), [kisi[0]!, kisi[3]!].sort((a, b) => a - b));
    assert.deepEqual(m.get(kisi[3]!), { departmanNo: kucuk, saatMaliyeti: null, kucuk: true });
    const hesap = await ortam!.vt.tx((db) => kisilerinGrupSaatMaliyetiYalnizHesapIcin(db, [kisi[3]!, kisi[4]!], '2026-01'));
    assert.deepEqual([...hesap], [[kisi[3]!, { departmanNo: kucuk, saatMaliyeti: 122, kucuk: true }]]);
    assert.equal(m.get(kisi[0]!)?.saatMaliyeti, Math.round((5572 / 38) * 10000) / 10000);
    assert.equal((await ortam!.vt.tx((db) => kisilerinGrupSaatMaliyeti(db, [], '2026-01'))).size, 0);
  });
});
