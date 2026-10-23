import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import type { Db } from '#cekirdek/db.ts';
import { gununFazlaMesaisi, izinliKisiler, kisilerinIzinleri, kisininFazlaMesaisi, kisininIzinleri, kisininKalanIzni, resmiTatilGunleri } from './disari.ts';
import { ayarKaydet, iptalEt, kaydet } from './servis.ts';

type Govde = Record<string, unknown>;

describe('İK disari: izinli kişiler (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const kisi: Record<'a' | 'b' | 'c' | 'd' | 'e', number> = { a: 0, b: 0, c: 0, d: 0, e: 0 };

  before(async () => {
    ortam = await testVeritabaniKur('ik_disari');
    await ortam.vt.tx(async (db) => {
      const [im] = await db.sorgu<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IKD1', 'Merkez') RETURNING id");
      const yonId = await yoneticiOlustur(db, { ad: 'Deneme yönetici', kullaniciAdi: 'ik-disari-yon', parola: 'dogru-parola-1' });
      for (const k of Object.keys(kisi) as (keyof typeof kisi)[]) {
        kisi[k] = await yoneticiOlustur(db, { ad: `Deneme ${k}`, kullaniciAdi: `ik-disari-${k}`, parola: 'dogru-parola-1' });
      }
      const yon = (await kullaniciYukle(db, yonId)) as Kullanici;
      const personel = (id: string, ek: Govde): Govde => ({ id, kind: 'emp', ad: id, soyad: 'Deneme', isMerkeziId: im!.id, ...ek });
      for (const k of Object.keys(kisi) as (keyof typeof kisi)[]) await kaydet(db, yon, 'personel', `emp_${k}`, personel(`emp_${k}`, { kisiId: kisi[k] }), null);
      await kaydet(db, yon, 'personel', 'emp_bagsiz', personel('emp_bagsiz', {}), null);
      const izin = (id: string, emp: string, ek: Govde = {}): Govde =>
        ({ id, kind: 'leave', empId: emp, tur: 'Yıllık izin', baslangic: '2026-11-02', bitis: '2026-11-04', gun: 3, durum: 'Onaylandı', ...ek });
      await kaydet(db, yon, 'izinler', 'leave_a', izin('leave_a', 'emp_a'), null);
      await kaydet(db, yon, 'izinler', 'leave_b', izin('leave_b', 'emp_b', { tur: 'Hastalık / rapor' }), null);
      await kaydet(db, yon, 'izinler', 'leave_c', izin('leave_c', 'emp_c', { durum: 'Beklemede' }), null);
      await kaydet(db, yon, 'izinler', 'leave_d', izin('leave_d', 'emp_d', { baslangic: '2026-11-05', bitis: '2026-11-06', gun: 2 }), null);
      const e = await kaydet(db, yon, 'izinler', 'leave_e', izin('leave_e', 'emp_e'), null);
      await iptalEt(db, yon, 'izinler', 'leave_e', e.kayit.surum);
      await kaydet(db, yon, 'izinler', 'leave_bagsiz', izin('leave_bagsiz', 'emp_bagsiz'), null);
      const devam = (id: string, emp: string, ek: Govde = {}): Govde =>
        ({ id, kind: 'att', empId: emp, tarih: '2026-11-07', tur: 'Fazla mesai', saat: 3, onay: 'Onaylandı', ...ek });
      await kaydet(db, yon, 'devam', 'att_a', devam('att_a', 'emp_a'), null);
      await kaydet(db, yon, 'devam', 'att_a2', devam('att_a2', 'emp_a', { tur: 'Hafta tatili çalışması' }), null);
      await kaydet(db, yon, 'devam', 'att_b', devam('att_b', 'emp_b', { tur: 'Resmi tatil çalışması', onay: 'Beklemede' }), null);
      await kaydet(db, yon, 'devam', 'att_c', devam('att_c', 'emp_c', { tur: 'Geç kalma', saat: 1 }), null);
      await kaydet(db, yon, 'devam', 'att_d', devam('att_d', 'emp_d', { tarih: '2026-11-08' }), null);
      const ae = await kaydet(db, yon, 'devam', 'att_e', devam('att_e', 'emp_e'), null);
      await iptalEt(db, yon, 'devam', 'att_e', ae.kayit.surum);
      await kaydet(db, yon, 'devam', 'att_bagsiz', devam('att_bagsiz', 'emp_bagsiz'), null);
    });
  });
  after(async () => { await ortam?.kaldir(); });

  test('IK-54: o gün onaylı izinde ve raporda olan kişiler döner; bekleyen, iptal, başka gün ve kullanıcıya bağsız personel dönmez', async () => {
    const vt = ortam!.vt;
    assert.deepEqual(await vt.tx((db) => izinliKisiler(db, '2026-11-03')), [kisi.a, kisi.b].sort((x, y) => x - y));
    assert.deepEqual(await vt.tx((db) => izinliKisiler(db, '2026-11-04')), [kisi.a, kisi.b].sort((x, y) => x - y), 'bitiş günü dahil');
    assert.deepEqual(await vt.tx((db) => izinliKisiler(db, '2026-11-05')), [kisi.d]);
    assert.deepEqual(await vt.tx((db) => izinliKisiler(db, '2026-11-01')), []);
  });

  test('IK-76 (İdari İşler yemek sayısı): o gün fazla mesai, hafta tatili ya da resmi tatil çalışması kaydı olan kişiler bir kez döner; onay beklemede de sayılır; başka tür, başka gün, iptal ve kullanıcıya bağsız personel dönmez', async () => {
    const vt = ortam!.vt;
    assert.deepEqual(await vt.tx((db) => gununFazlaMesaisi(db, '2026-11-07')), [kisi.a, kisi.b].sort((x, y) => x - y));
    assert.deepEqual(await vt.tx((db) => gununFazlaMesaisi(db, '2026-11-08')), [kisi.d]);
    assert.deepEqual(await vt.tx((db) => gununFazlaMesaisi(db, '2026-11-09')), []);
  });
});

describe('İK disari: kişisel özet okumaları, kart #1322 (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const kisi: Record<'a' | 'b' | 'c', number> = { a: 0, b: 0, c: 0 };

  before(async () => {
    ortam = await testVeritabaniKur('ik_disari_ozet');
    await ortam.vt.tx(async (db) => {
      const [im] = await db.sorgu<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IKD2', 'Merkez') RETURNING id");
      const yonId = await yoneticiOlustur(db, { ad: 'Deneme yönetici', kullaniciAdi: 'ik-ozet-yon', parola: 'dogru-parola-1' });
      for (const k of Object.keys(kisi) as (keyof typeof kisi)[]) {
        kisi[k] = await yoneticiOlustur(db, { ad: `Deneme ${k}`, kullaniciAdi: `ik-ozet-${k}`, parola: 'dogru-parola-1' });
      }
      const yon = (await kullaniciYukle(db, yonId)) as Kullanici;
      const personel = (id: string, ek: Govde): Govde => ({ id, kind: 'emp', ad: id, soyad: 'Deneme', isMerkeziId: im!.id, ...ek });
      // a: altı yıllık (5 x 14 + 20 gün hak); b: bağlı ama işe giriş yok; c: personel kaydı yok.
      await kaydet(db, yon, 'personel', 'emp_a', personel('emp_a', { kisiId: kisi.a, iseGiris: '2020-01-15', dogumTarihi: '1990-05-01' }), null);
      await kaydet(db, yon, 'personel', 'emp_b', personel('emp_b', { kisiId: kisi.b }), null);
      const izin = (id: string, emp: string, ek: Govde = {}): Govde =>
        ({ id, kind: 'leave', empId: emp, tur: 'Yıllık izin', baslangic: '2026-10-12', bitis: '2026-10-16', gun: 5, durum: 'Onaylandı', ...ek });
      await kaydet(db, yon, 'izinler', 'leave_a1', izin('leave_a1', 'emp_a'), null);
      await kaydet(db, yon, 'izinler', 'leave_a2', izin('leave_a2', 'emp_a', { baslangic: '2026-11-02', bitis: '2026-11-04', gun: 3, durum: 'Beklemede' }), null);
      await kaydet(db, yon, 'izinler', 'leave_a3', izin('leave_a3', 'emp_a', { tur: 'Mazeret izni', baslangic: '2026-09-30', bitis: '2026-10-01', gun: 2 }), null);
      const iptal = await kaydet(db, yon, 'izinler', 'leave_a4', izin('leave_a4', 'emp_a', { baslangic: '2026-10-20', bitis: '2026-10-21', gun: 2 }), null);
      await iptalEt(db, yon, 'izinler', 'leave_a4', iptal.kayit.surum);
      const devam = (id: string, ek: Govde): Govde => ({ id, kind: 'att', empId: 'emp_a', tarih: '2026-10-02', tur: 'Fazla mesai', saat: 3, onay: 'Onaylandı', ...ek });
      await kaydet(db, yon, 'devam', 'att_1', devam('att_1', {}), null);
      await kaydet(db, yon, 'devam', 'att_2', devam('att_2', { tarih: '2026-10-05', tur: 'Hafta tatili çalışması', saat: 5, onay: 'Beklemede' }), null);
      await kaydet(db, yon, 'devam', 'att_3', devam('att_3', { tarih: '2026-10-06', tur: 'Geç kalma', saat: 1 }), null);
      await kaydet(db, yon, 'devam', 'att_4', devam('att_4', { tarih: '2026-09-30', saat: 2 }), null);
      const d5 = await kaydet(db, yon, 'devam', 'att_5', devam('att_5', { tarih: '2026-10-07', saat: 4 }), null);
      await iptalEt(db, yon, 'devam', 'att_5', d5.kayit.surum);
    });
  });
  after(async () => { await ortam?.kaldir(); });

  test('IK-55: fazla mesai yalnız fazla mesai, hafta tatili ve resmi tatil çalışmasıdır; aralık dışı, iptal ve geç kalma girmez; yıllık sınır dönem ayarından', async () => {
    const vt = ortam!.vt;
    const ozet = await vt.tx((db) => kisininFazlaMesaisi(db, kisi.a, '2026-10-01', '2026-10-31'));
    assert.deepEqual(ozet, {
      satirlar: [
        { tarih: '2026-10-02', tur: 'Fazla mesai', saat: 3, onay: 'Onaylandı' },
        { tarih: '2026-10-05', tur: 'Hafta tatili çalışması', saat: 5, onay: 'Beklemede' },
      ],
      yillikSinirSaat: 270,
    });
    assert.deepEqual((await vt.tx((db) => kisininFazlaMesaisi(db, kisi.a, '2026-09-30', '2026-09-30')))?.satirlar.map((s) => s.saat), [2], 'iki uç dahil');
    assert.deepEqual(await vt.tx((db) => kisininFazlaMesaisi(db, kisi.b, '2026-10-01', '2026-10-31')), { satirlar: [], yillikSinirSaat: 270 });
    assert.equal(await vt.tx((db) => kisininFazlaMesaisi(db, kisi.c, '2026-10-01', '2026-10-31')), null, 'personel kaydı yoksa null');
  });

  test('kişinin izinleri: aralıkla kesişen her durumdaki izin döner, iptal edilen dönmez; personel kaydı yoksa null', async () => {
    const vt = ortam!.vt;
    assert.deepEqual(await vt.tx((db) => kisininIzinleri(db, kisi.a, '2026-10-01', '2026-11-30')), [
      { tur: 'Mazeret izni', baslangic: '2026-09-30', bitis: '2026-10-01', gun: 2, durum: 'Onaylandı' },
      { tur: 'Yıllık izin', baslangic: '2026-10-12', bitis: '2026-10-16', gun: 5, durum: 'Onaylandı' },
      { tur: 'Yıllık izin', baslangic: '2026-11-02', bitis: '2026-11-04', gun: 3, durum: 'Beklemede' },
    ]);
    assert.deepEqual(await vt.tx((db) => kisininIzinleri(db, kisi.a, '2026-10-17', '2026-10-31')), []);
    assert.deepEqual(await vt.tx((db) => kisininIzinleri(db, kisi.b, '2026-10-01', '2026-11-30')), []);
    assert.equal(await vt.tx((db) => kisininIzinleri(db, kisi.c, '2026-10-01', '2026-11-30')), null);
  });

  // Vardiya takvimi kişi başına iki sorguyla okuyordu (yük testi 2026-10-18).
  test('kişilerin izinleri toplu: kişi başına okumayla aynı; personeli olmayan haritada yok; tek sorgu, boşta sorgu yok', async () => {
    const vt = ortam!.vt;
    const idler = [kisi.a, kisi.b, kisi.c, kisi.a];
    for (const [bas, bit] of [['2026-10-01', '2026-11-30'], ['2026-10-17', '2026-10-31'], ['2026-10-01', '2026-10-01']] as const) {
      let sorgu = 0;
      const toplu = await vt.tx((db) => kisilerinIzinleri({
        sorgu: (sql, p) => { sorgu += 1; return db.sorgu(sql, p); },
        tek: (sql, p) => { sorgu += 1; return db.tek(sql, p); },
      } satisfies Db, idler, bas, bit));
      assert.equal(sorgu, 1);
      const tekil = new Map<number, unknown>();
      for (const id of new Set(idler)) {
        const izinler = await vt.tx((db) => kisininIzinleri(db, id, bas, bit));
        if (izinler !== null) tekil.set(id, izinler);
      }
      assert.deepEqual(toplu, tekil, `${bas} - ${bit}`);
      assert.ok(!toplu.has(kisi.c) && toplu.get(kisi.b)?.length === 0, 'bağ yok ile izin yok ayrı');
    }
    assert.equal((await vt.tx((db) => kisilerinIzinleri(db, [kisi.a], '2026-10-01', '2026-11-30'))).get(kisi.a)?.length, 3);
    let bosSorgu = 0;
    const bos = await vt.tx((db) => kisilerinIzinleri({ sorgu: (sql, p) => { bosSorgu += 1; return db.sorgu(sql, p); }, tek: db.tek.bind(db) }, [], '2026-10-01', '2026-10-31'));
    assert.deepEqual([bos.size, bosSorgu], [0, 0]);
  });

  test('kalan yıllık izin: hak İK motorundan, yalnız onaylı yıllık izin düşer; işe giriş yoksa hak ve kalan null; personel yoksa null', async () => {
    const vt = ortam!.vt;
    assert.deepEqual(await vt.tx((db) => kisininKalanIzni(db, kisi.a, '2026-10-14')), {
      hakGun: 90, kalanGun: 85, kullanilanGun: 5, bekleyenGun: 3, sonrakiHakTarihi: '2027-01-15', sonrakiHakGun: 20,
    });
    assert.deepEqual(await vt.tx((db) => kisininKalanIzni(db, kisi.b, '2026-10-14')), {
      hakGun: null, kalanGun: null, kullanilanGun: 0, bekleyenGun: 0, sonrakiHakTarihi: null, sonrakiHakGun: null,
    });
    assert.equal(await vt.tx((db) => kisininKalanIzni(db, kisi.c, '2026-10-14')), null);
    await assert.rejects(vt.tx((db) => kisininKalanIzni(db, kisi.a, '14.10.2026')), /YYYY-AA-GG/);
  });
});

describe('İK disari: resmî tatil günleri (IK-80, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  before(async () => { ortam = await testVeritabaniKur('ik_disari_tatil'); });
  after(async () => { await ortam?.kaldir(); });

  test('IK-80: ayar kaydedilmemişse tatil yok, kaydedilmişse İK listesi okunur; her yıl tekrarlayan satır her yıla açılır', async () => {
    const vt = ortam!.vt;
    assert.deepEqual(await vt.tx((db) => resmiTatilGunleri(db, '2026-01-01', '2026-12-31')), [], 'varsayılan liste takvime girmez');
    await vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme tatil', kullaniciAdi: 'ik-disari-tatil', parola: 'dogru-parola-1' });
      const yon = (await kullaniciYukle(db, id)) as Kullanici;
      await ayarKaydet(db, yon, { tatiller: '01-01 Yılbaşı\n2027-03-10 Deneme Bayramı\n02-29 Artık gün' }, null);
    });
    assert.deepEqual(await vt.tx((db) => resmiTatilGunleri(db, '2026-12-31', '2028-03-01')), [
      { tarih: '2027-01-01', ad: 'Yılbaşı' }, { tarih: '2027-03-10', ad: 'Deneme Bayramı' }, { tarih: '2028-01-01', ad: 'Yılbaşı' }, { tarih: '2028-02-29', ad: 'Artık gün' },
    ]);
    await vt.tx(async (db) => { await db.sorgu('DELETE FROM ik_resmi_tatil'); });
    assert.deepEqual(await vt.tx((db) => resmiTatilGunleri(db, '2026-01-01', '2026-12-31')), [], 'boş kaydedilmiş liste tatilsizdir');
  });
});
