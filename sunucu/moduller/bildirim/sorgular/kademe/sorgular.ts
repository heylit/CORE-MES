import type { Db } from '#cekirdek/db.ts';

// 3405 a: kademeli uyarı tabloları (göç bildirim_kademe). Ayar satırı yalnız değiştirilen kaynakta vardır; defter yalnız eklenir.

export interface KademeAyarSatiri {
  kaynak: string; acik: boolean; k2_gun: number | null; k3_gun: number | null; k4_gun: number | null; k5_gun: number | null; k3_birim: 'gun' | 'saat' | null;
  eposta_kademe: number; serit: boolean; kapatilamaz: boolean; yonetici_rol_id: number | null; surum: number; degistiren_id: number | null; degisti: string | null;
}
const AYAR = `kaynak, acik, k2_gun, k3_gun, k3_birim, k4_gun, k5_gun, eposta_kademe, serit, kapatilamaz, yonetici_rol_id, surum, degistiren_id,
  to_char(degisti AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS degisti`;

export function ayarSatirlari(db: Db): Promise<KademeAyarSatiri[]> {
  return db.sorgu<KademeAyarSatiri>(`SELECT ${AYAR} FROM bildirim_kademe_ayari ORDER BY kaynak`);
}

export interface KademeAyarYazimi {
  acik: boolean; k2Gun: number | null; k3Gun: number | null; k4Gun: number | null; k5Gun: number | null; epostaKademe: number; serit: boolean;
  kapatilamaz: boolean; yoneticiRolId: number | null; k3Birim: 'gun' | 'saat';
}
// Satırı olmayan kaynağın sürümü 1 sayılır (katalog varsayılanı): ilk yazım satırı 2 ile açar. Sürüm tutmazsa null döner.
export async function ayarYaz(db: Db, kaynak: string, g: KademeAyarYazimi, surum: number, kisiId: number): Promise<{ surum: number } | null> {
  const degerler = [kaynak, g.acik, g.k2Gun, g.k3Gun, g.k4Gun, g.k5Gun, g.epostaKademe, g.serit, g.kapatilamaz, g.yoneticiRolId, surum, kisiId, g.k3Birim];
  const guncel = await db.tek<{ surum: number }>(
    `UPDATE bildirim_kademe_ayari SET acik = $2, k2_gun = $3, k3_gun = $4, k4_gun = $5, k5_gun = $6, eposta_kademe = $7, serit = $8, kapatilamaz = $9,
       yonetici_rol_id = $10, k3_birim = $13, surum = surum + 1, degistiren_id = $12, degisti = now()
      WHERE kaynak = $1 AND surum = $11 RETURNING surum`,
    degerler,
  );
  if (guncel !== null || surum !== 1) return guncel;
  return db.tek<{ surum: number }>(
    `INSERT INTO bildirim_kademe_ayari (kaynak, acik, k2_gun, k3_gun, k4_gun, k5_gun, eposta_kademe, serit, kapatilamaz, yonetici_rol_id, k3_birim, surum, degistiren_id, degisti)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $13, 2, $12, now() WHERE $11::int = 1
     ON CONFLICT (kaynak) DO NOTHING RETURNING surum`,
    degerler,
  );
}

// İlk çalışma işareti: satırı ilk yazan çalışma true alır (iki sunucu aynı anda başlasa da bir kez).
export async function baslangicVarMi(db: Db, kaynak: string): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM bildirim_kademe_baslangic WHERE kaynak = $1', [kaynak])) !== null;
}
export async function baslangicYaz(db: Db, kaynak: string): Promise<void> {
  await db.sorgu('INSERT INTO bildirim_kademe_baslangic (kaynak) VALUES ($1) ON CONFLICT (kaynak) DO NOTHING', [kaynak]);
}

export async function defterKademeleri(db: Db, kaynak: string): Promise<Map<string, Set<number>>> {
  const satirlar = await db.sorgu<{ kayit: string; kademe: number }>('SELECT kayit, kademe FROM bildirim_kademe_defteri WHERE kaynak = $1', [kaynak]);
  const m = new Map<string, Set<number>>();
  for (const r of satirlar) {
    const s = m.get(r.kayit) ?? new Set<number>();
    s.add(r.kademe);
    m.set(r.kayit, s);
  }
  return m;
}

// Tekil anahtar yinelenen yazımı yutar: false dönerse kademe başka çalışmada yazılmıştır, bildirim gönderilmez.
export async function defterYaz(db: Db, kaynak: string, kayit: string, kademe: number, bildirildi: boolean, aliciSayisi: number): Promise<boolean> {
  return (await db.tek(
    `INSERT INTO bildirim_kademe_defteri (kaynak, kayit, kademe, bildirildi, alici_sayisi) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ON CONSTRAINT bildirim_kademe_defteri_tekil DO NOTHING RETURNING kademe`,
    [kaynak, kayit, kademe, bildirildi, aliciSayisi],
  )) !== null;
}

export function kayitDefteri(db: Db, kaynak: string, kayit: string): Promise<{ kademe: number; an: string; bildirildi: boolean; alici_sayisi: number }[]> {
  return db.sorgu(
    `SELECT kademe, to_char(an AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS an, bildirildi, alici_sayisi
       FROM bildirim_kademe_defteri WHERE kaynak = $1 AND kayit = $2 ORDER BY kademe`,
    [kaynak, kayit],
  );
}

export interface TakipSatiri {
  kaynak: string; kayit: string; no: string; baslik: string; yol: string; son_gun: string | null; baslangic: string | null; kademe: number;
  gecikme_gun: number | null; yapanlar: number[]; ustler: number[];
}
const TAKIP = `kaynak, kayit, no, baslik, yol, to_char(son_gun, 'YYYY-MM-DD') AS son_gun, to_char(baslangic, 'YYYY-MM-DD') AS baslangic, kademe, gecikme_gun, yapanlar, ustler`;

export function takipKayitlari(db: Db, kaynak: string): Promise<{ kayit: string }[]> {
  return db.sorgu<{ kayit: string }>('SELECT kayit FROM bildirim_kademe_takip WHERE kaynak = $1', [kaynak]);
}

export async function takipYaz(db: Db, t: Omit<TakipSatiri, 'kaynak'> & { kaynak: string }): Promise<void> {
  await db.sorgu(
    `INSERT INTO bildirim_kademe_takip (kaynak, kayit, no, baslik, yol, son_gun, baslangic, kademe, gecikme_gun, yapanlar, ustler, guncellendi)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT ON CONSTRAINT bildirim_kademe_takip_tekil DO UPDATE SET no = $3, baslik = $4, yol = $5, son_gun = $6, baslangic = $7, kademe = $8,
       gecikme_gun = $9, yapanlar = $10, ustler = $11, guncellendi = now()`,
    [t.kaynak, t.kayit, t.no, t.baslik, t.yol, t.son_gun, t.baslangic, t.kademe, t.gecikme_gun, t.yapanlar, t.ustler],
  );
}

export async function takipSil(db: Db, kaynak: string, kayitlar: readonly string[]): Promise<void> {
  if (kayitlar.length === 0) return;
  await db.sorgu('DELETE FROM bildirim_kademe_takip WHERE kaynak = $1 AND kayit = ANY($2::text[])', [kaynak, kayitlar]);
}
// Kapanan kaynak: takibi boşalır (açık bildirimleri motor kapatır).
export async function kaynakTakibiniSil(db: Db, kaynak: string): Promise<void> {
  await db.sorgu('DELETE FROM bildirim_kademe_takip WHERE kaynak = $1', [kaynak]);
}

// Kişinin kayıtları: yapan ya da üst (K4, K5 alıcısı) olduğu ve en az `enAz` kademedeki kayıtlar. Kaynak süzgeci serviste (okuma işlemi).
export function kisininTakipleri(db: Db, kisiId: number, enAz: number): Promise<TakipSatiri[]> {
  return db.sorgu<TakipSatiri>(
    `SELECT ${TAKIP} FROM bildirim_kademe_takip
      WHERE kademe >= $2 AND ($1 = ANY(yapanlar) OR ($1 = ANY(ustler) AND kademe >= 4))
      ORDER BY kademe DESC, gecikme_gun DESC NULLS LAST, son_gun NULLS LAST, kaynak, kayit`,
    [kisiId, enAz],
  );
}

export function tumTakipler(db: Db, kaynaklar: readonly string[]): Promise<TakipSatiri[]> {
  return db.sorgu<TakipSatiri>(
    `SELECT ${TAKIP} FROM bildirim_kademe_takip WHERE kaynak = ANY($1::text[])
      ORDER BY kademe DESC, gecikme_gun DESC NULLS LAST, son_gun NULLS LAST, kaynak, kayit LIMIT 500`,
    [kaynaklar],
  );
}

export function kaynakSayilari(db: Db): Promise<{ kaynak: string; takipte: number; gecikti: number }[]> {
  return db.sorgu(
    `SELECT kaynak, count(*)::int AS takipte, count(*) FILTER (WHERE kademe >= 3)::int AS gecikti FROM bildirim_kademe_takip GROUP BY kaynak`,
  );
}

export async function ozetYaz(db: Db, kaynak: string, gun: string, sayi: number): Promise<boolean> {
  return (await db.tek(
    'INSERT INTO bildirim_kademe_ozet (kaynak, gun, kayit_sayisi) VALUES ($1, $2, $3) ON CONFLICT ON CONSTRAINT bildirim_kademe_ozet_tekil DO NOTHING RETURNING gun',
    [kaynak, gun, sayi],
  )) !== null;
}

// Kaynağın sorgusu hata verirse yalnız onun yazdıkları geri alınır; işin transaction'ı ve öteki kaynaklar sürer (Risk K4: hata veren
// kaynakta kapatma yapılmaz). Her hata yakalanır: kaynak okuması kural reddi değil, yeniden denenecek iştir (sonraki çalışma).
const KAYNAK_NOKTASI = 'kademe_kaynagi';
export async function kaynakKorumali<T>(db: Db, is: () => Promise<T>): Promise<{ tamam: true; deger: T } | { tamam: false; hata: unknown }> {
  await db.sorgu(`SAVEPOINT ${KAYNAK_NOKTASI}`);
  try {
    const deger = await is();
    await db.sorgu(`RELEASE SAVEPOINT ${KAYNAK_NOKTASI}`);
    return { tamam: true, deger };
  } catch (hata) {
    await db.sorgu(`ROLLBACK TO SAVEPOINT ${KAYNAK_NOKTASI}`);
    await db.sorgu(`RELEASE SAVEPOINT ${KAYNAK_NOKTASI}`);
    return { tamam: false, hata };
  }
}

export function enYuksekKademeler(db: Db, kaynak: string, kayitlar: readonly string[]): Promise<{ kayit: string; kademe: number }[]> {
  return db.sorgu(
    'SELECT kayit, max(kademe)::int AS kademe FROM bildirim_kademe_defteri WHERE kaynak = $1 AND kayit = ANY($2::text[]) GROUP BY kayit',
    [kaynak, [...kayitlar]],
  );
}
