import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Db } from '#cekirdek/db.ts';
import { yoneticiOlustur } from '../../kisiler/disari.ts';
import {
  dogrudanEmilmeyenToplami, dogrudanEmilmeyenToplamiYalnizHesapIcin, dolayliPersonelToplami, dolayliPersonelToplamiYalnizHesapIcin, grupSaatMaliyetleri,
  type KatilimKaynagi,
} from '../disari.ts';

// Adlar ve tutarlar uydurmadır. 2026-11 30 günlük; parametre: SGK 20, işsizlik 2, tavan 150.000, aylık saat 220 (22.000 brüt -> 26.840).
describe('IK-88, IK-89 (2647 a, 2659): personel genel gider bileşenleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const kisi: number[] = [];
  let dolayli = 0;
  let dogrudan = 0;
  let kalite = 0;
  let yon = 0;
  let im = 0;
  const tx = <T>(f: (db: Db) => Promise<T>) => ortam!.vt.tx(f);
  const personel = (db: Db, i: number, departman: number | null, brut: number | null, kisiId: number | null, giris: string | null = null, cikis: string | null = null) => db.tek<{ no: number }>(
    `INSERT INTO ik_personel (kimlik, ad, soyad, is_merkezi_id, departman_no, brut_maas, kisi_id, ise_giris, cikis_tarihi, olusturan_kisi_id, guncelleyen_kisi_id)
     VALUES ($1, $1, 'Deneme', $2, $3, $4, $5, $6, $7, $8, $8) RETURNING no`, [`emp_pb_${i}`, im, departman, brut, kisiId, giris, cikis, yon]).then((r) => r!.no);

  before(async () => {
    ortam = await testVeritabaniKur('ik_personel_bilesenleri');
    await tx(async (db) => {
      yon = await yoneticiOlustur(db, { ad: 'Deneme yönetici', kullaniciAdi: 'ik-pb-yon', parola: 'dogru-parola-1' });
      for (let i = 0; i < 4; i++) kisi.push(await yoneticiOlustur(db, { ad: `Deneme ${i}`, kullaniciAdi: `ik-pb-${i}`, parola: 'dogru-parola-1' }));
      im = (await db.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IKPB', 'Merkez') RETURNING id"))!.id;
      const dep = async (kimlik: string, ad: string, isaret: boolean | null) => (await db.tek<{ no: number }>(
        'INSERT INTO ik_departman (kimlik, ad, dogrudan_iscilik, olusturan_kisi_id, guncelleyen_kisi_id) VALUES ($1, $2, $3, $4, $4) RETURNING no', [kimlik, ad, isaret, yon]))!.no;
      dolayli = await dep('dep_pb_idari', 'İdari', false);
      dogrudan = await dep('dep_pb_uretim', 'Üretim', true);
      kalite = await dep('dep_pb_kalite', 'Kalite', null);
      await db.sorgu("INSERT INTO ik_parametre_donemi (kod, ad, baslangic, sgk_isveren_orani, issizlik_isveren_orani, sgk_tavani, aylik_saat) VALUES ('pb2026', '2026', '2026-01-01', 20, 2, 150000, 220)");
      // İdari: iki kişi tam ay, biri 16 Kasım'da girdi (yarım ay), biri Ekim'de çıktı (kapsam dışı).
      await personel(db, 1, dolayli, 22000, null);
      await personel(db, 2, dolayli, 22000, null);
      await personel(db, 3, dolayli, 22000, null, '2026-11-16');
      await personel(db, 4, dolayli, 22000, null, null, '2026-10-20');
      // Üretim: üç kişi; ikisi bağlı (kişi), biri bağsız. Puantaj Kasım'da 10'ar saat: grup değeri 122.
      const u1 = await personel(db, 5, dogrudan, 22000, kisi[0]!);
      const u2 = await personel(db, 6, dogrudan, 22000, kisi[1]!);
      const u3 = await personel(db, 7, dogrudan, 22000, null);
      for (const no of [u1, u2, u3]) {
        await db.sorgu("INSERT INTO ik_puantaj (personel_no, tarih, durum, giris, cikis, yazan_kisi_id) VALUES ($1, '2026-11-03', 'calisti', '08:00', '18:00', $2)", [no, yon]);
      }
    });
  });
  after(async () => { await ortam?.kaldir(); });

  test('IK-88: dolaylı toplam yalnız dolaylı departman ve ay içinde kayıtlı kişi; yarım ay gün oranlı; işaretsiz departman kişisizse etkilemez', async () => {
    // 26.840 + 26.840 + 13.420; Ekim'de çıkan sayılmaz; Kalite işaretsiz ama kişisi yok.
    assert.deepEqual(await tx((db) => dolayliPersonelToplami(db, '2026-11')), { tutar: 67100, kisiSayisi: 3, kucuk: false, eksik: [] });
    // Ekim: 16 Kasım'da giren yok, Ekim'de çıkan var (20 gün): 26.840 x 2 + 26.840 x 20/30.
    const ekim = await tx((db) => dolayliPersonelToplamiYalnizHesapIcin(db, '2026-10'));
    assert.equal(ekim.tutar, Math.round((53680 + (22000 * 20 / 30) * 1.22) * 100) / 100);
  });

  test('Güvenlik K1: küçük birleşik grupta ekran işlevi tutarı null verir, hesap işlevi gerçek değeri; kişi değeri ya da ad dönmez', async () => {
    await tx((db) => db.sorgu("UPDATE ik_personel SET iptal = true, surum = surum + 1 WHERE kimlik = 'emp_pb_1'"));
    try {
      assert.deepEqual(await tx((db) => dolayliPersonelToplami(db, '2026-11')), { tutar: null, kisiSayisi: 2, kucuk: true, eksik: [] });
      assert.deepEqual(await tx((db) => dolayliPersonelToplamiYalnizHesapIcin(db, '2026-11')), { tutar: 40260, kisiSayisi: 2, kucuk: true, eksik: [] });
    } finally {
      await tx((db) => db.sorgu("UPDATE ik_personel SET iptal = false, surum = surum + 1 WHERE kimlik = 'emp_pb_1'"));
    }
  });

  test('Veri 2647: işaretsiz departmandaki ve departmansız kişi tutarı null yapar, eksik listesi ad ve sayı', async () => {
    const no = await tx((db) => personel(db, 8, kalite, 22000, null));
    const bos = await tx((db) => personel(db, 9, null, 22000, null));
    try {
      const t = await tx((db) => dolayliPersonelToplamiYalnizHesapIcin(db, '2026-11'));
      assert.deepEqual(t, { tutar: null, kisiSayisi: 3, kucuk: false, eksik: ['işaretlenmemiş departman: Kalite', 'departmanı olmayan 1 kişi'] });
      const e = await tx((db) => dogrudanEmilmeyenToplamiYalnizHesapIcin(db, '2026-11', async () => new Map()));
      assert.equal(e.tutar, null);
    } finally {
      await tx((db) => db.sorgu('UPDATE ik_personel SET iptal = true, surum = surum + 1 WHERE no = ANY($1::int[])', [[no, bos]]));
    }
  });

  test('IK-89: maaş, katılım ve grup değeri aynı aydan; katılım tesis ayı penceresiyle istenir; bağsız kişinin tamamı girer', async () => {
    assert.equal((await tx((db) => grupSaatMaliyetleri(db, '2026-11'))).get(dogrudan)?.saatMaliyeti, 122);
    const istekler: [number[], string, string][] = [];
    const katilim: KatilimKaynagi = async (_db, idler, bas, bit) => {
      istekler.push([[...idler].sort((a, b) => a - b), bas, bit]);
      return new Map([[kisi[0]!, 100 * 3600], [kisi[1]!, 50 * 3600], [kisi[3]!, 999 * 3600]]);
    };
    // 3 x 26.840 - (100 + 50) x 122 = 80.520 - 18.300.
    assert.deepEqual(await tx((db) => dogrudanEmilmeyenToplami(db, '2026-11', katilim)), { tutar: 62220, kisiSayisi: 3, kucuk: false, eksik: [] });
    assert.deepEqual(istekler, [[[kisi[0]!, kisi[1]!].sort((a, b) => a - b), '2026-10-31T21:00:00.000Z', '2026-11-30T21:00:00.000Z']]);
    assert.deepEqual(await tx((db) => dogrudanEmilmeyenToplami(db, '2026-11', null)), { tutar: null, kisiSayisi: 3, kucuk: false, eksik: ['katılım kaynağı yok'] });
  });

  test('Güvenlik 2659: küçük doğrudan grupta ekran işlevi null, hesap işlevi gerçek ve eksi olabilir', async () => {
    await tx((db) => db.sorgu("UPDATE ik_personel SET iptal = true, surum = surum + 1 WHERE kimlik = 'emp_pb_7'"));
    try {
      const katilim: KatilimKaynagi = async () => new Map([[kisi[0]!, 300 * 3600], [kisi[1]!, 300 * 3600]]);
      assert.deepEqual(await tx((db) => dogrudanEmilmeyenToplami(db, '2026-11', katilim)), { tutar: null, kisiSayisi: 2, kucuk: true, eksik: [] });
      // Grup değeri iki kişiyle de 122 (gerçek değer): 53.680 - 600 x 122 = -19.520.
      assert.deepEqual(await tx((db) => dogrudanEmilmeyenToplamiYalnizHesapIcin(db, '2026-11', katilim)), { tutar: -19520, kisiSayisi: 2, kucuk: true, eksik: [] });
    } finally {
      await tx((db) => db.sorgu("UPDATE ik_personel SET iptal = false, surum = surum + 1 WHERE kimlik = 'emp_pb_7'"));
    }
  });
});
