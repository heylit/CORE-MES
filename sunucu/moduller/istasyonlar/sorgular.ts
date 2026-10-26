import { kisitIhlali } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type {
  EkipGuncellemesi, EkipKaydi, KapasiteKaynagi, MakineDurumuDegeri, SurumluEkip, IsMerkeziGuncellemesi, IsMerkeziKaydi, IstasyonGuncellemesi, IstasyonKaydi, MakineGuncellemesi, MakineKaydi, OperasyonTipi,
  OperasyonTipiGuncellemesi, OperasyonTipiKaydi, SurumluOperasyonTipi, SurumluIsMerkezi as IsMerkezi, SurumluIstasyon, SurumluMakine as Makine,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import type { AtamaSatiri, AtamaTuru, SecimSatiri } from './kurallar.ts';

// Veritabanı satırı: sorumlunun adını servis kisiler modülünden ekler.
export type Istasyon = Omit<SurumluIstasyon, 'sorumluAd'>;

const IS_MERKEZI = 'id, kod, ad, aciklama, aktif, surum';
const ISTASYON = `id, kod, ad, is_merkezi_id AS "isMerkeziId", tip, sorumlu_kisi_id AS "sorumluKisiId",
  kapasite_kaynagi AS "kapasiteKaynagi", uretim_alani AS "uretimAlani", aktif, surum`;
const MAKINE = `id, kod, ad, tur, marka_model AS "markaModel", seri_no AS "seriNo", istasyon_id AS "istasyonId",
  baglanti_turu AS "baglantiTuru", baglanti_adresi AS "baglantiAdresi", aktif, surum`;

export function isMerkezleriListele(db: Db, pasiflerDahil: boolean): Promise<IsMerkezi[]> {
  return db.sorgu<IsMerkezi>(`SELECT ${IS_MERKEZI} FROM is_merkezi WHERE ($1 OR aktif) ORDER BY kod`, [pasiflerDahil]);
}

export function isMerkeziEkle(db: Db, g: IsMerkeziKaydi): Promise<IsMerkezi | null> {
  return db.tek<IsMerkezi>(
    `INSERT INTO is_merkezi (kod, ad, aciklama, aktif) VALUES ($1, $2, $3, $4) RETURNING ${IS_MERKEZI}`,
    [g.kod, g.ad, g.aciklama, g.aktif],
  );
}

// Sürüm tutmazsa satır dönmez; çağıran çekirdeğin surumluGuncelle'si ile 404/409 ayırır.
export function isMerkeziGuncelle(db: Db, id: number, g: IsMerkeziGuncellemesi): Promise<IsMerkezi | null> {
  return db.tek<IsMerkezi>(
    `UPDATE is_merkezi SET kod = $2, ad = $3, aciklama = $4, aktif = $5, surum = surum + 1
      WHERE id = $1 AND surum = $6 RETURNING ${IS_MERKEZI}`,
    [id, g.kod, g.ad, g.aciklama, g.aktif, g.surum],
  );
}

export async function isMerkeziVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM is_merkezi WHERE id = $1', [id])) !== null;
}

export async function isMerkeziSil(db: Db, id: number): Promise<boolean> {
  return (await db.sorgu('DELETE FROM is_merkezi WHERE id = $1 RETURNING id', [id])).length > 0;
}

// Aktif istasyonun tek tanımı: kendisi de iş merkezi de aktiftir. Seçim ve aktif listeler bunu kullanır.
const ISTASYON_I = `i.id, i.kod, i.ad, i.is_merkezi_id AS "isMerkeziId", i.tip, i.sorumlu_kisi_id AS "sorumluKisiId",
  i.kapasite_kaynagi AS "kapasiteKaynagi", i.uretim_alani AS "uretimAlani", i.aktif, i.surum`;
const ISTASYON_VE_MERKEZI = 'istasyon i JOIN is_merkezi m ON m.id = i.is_merkezi_id';
const AKTIF_ISTASYON = 'i.aktif AND m.aktif';

export function istasyonlariListele(db: Db, pasiflerDahil: boolean): Promise<Istasyon[]> {
  return db.sorgu<Istasyon>(
    `SELECT ${ISTASYON_I} FROM ${ISTASYON_VE_MERKEZI} WHERE ($1 OR (${AKTIF_ISTASYON})) ORDER BY i.kod`,
    [pasiflerDahil],
  );
}

// Stok konum seçimi: işaretli istasyonlar; varsayılan yalnız aktif (istasyon ve iş merkezi).
export function uretimAlanlariniListele(db: Db, pasiflerDahil: boolean): Promise<Istasyon[]> {
  return db.sorgu<Istasyon>(
    `SELECT ${ISTASYON_I} FROM ${ISTASYON_VE_MERKEZI} WHERE i.uretim_alani AND ($1 OR (${AKTIF_ISTASYON})) ORDER BY i.kod`,
    [pasiflerDahil],
  );
}

export function istasyonBul(db: Db, id: number): Promise<Istasyon | null> {
  return db.tek<Istasyon>(`SELECT ${ISTASYON} FROM istasyon WHERE id = $1`, [id]);
}

export function istasyonAdlariniBul(db: Db, idler: readonly number[]): Promise<{ id: number; ad: string }[]> {
  return db.sorgu<{ id: number; ad: string }>('SELECT id, ad FROM istasyon WHERE id = ANY($1::int[])', [idler]);
}

export function kapasiteKaynaklariniBul(db: Db, idler: readonly number[]): Promise<{ id: number; kapasiteKaynagi: KapasiteKaynagi | null }[]> {
  return db.sorgu('SELECT id, kapasite_kaynagi AS "kapasiteKaynagi" FROM istasyon WHERE id = ANY($1::int[])', [idler]);
}

export function secimSatirlari(db: Db): Promise<SecimSatiri[]> {
  return db.sorgu<SecimSatiri>(
    `SELECT ${ISTASYON_I}, m.kod AS "isMerkeziKod", m.ad AS "isMerkeziAd"
       FROM ${ISTASYON_VE_MERKEZI}
      WHERE ${AKTIF_ISTASYON}`,
  );
}

export function istasyonEkle(db: Db, g: IstasyonKaydi): Promise<Istasyon | null> {
  return db.tek<Istasyon>(
    `INSERT INTO istasyon (kod, ad, is_merkezi_id, tip, sorumlu_kisi_id, kapasite_kaynagi, uretim_alani, aktif)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${ISTASYON}`,
    [g.kod, g.ad, g.isMerkeziId, g.tip, g.sorumluKisiId, g.kapasiteKaynagi, g.uretimAlani, g.aktif],
  );
}

export function istasyonGuncelle(db: Db, id: number, g: IstasyonGuncellemesi): Promise<Istasyon | null> {
  return db.tek<Istasyon>(
    `UPDATE istasyon SET kod = $2, ad = $3, is_merkezi_id = $4, tip = $5, sorumlu_kisi_id = $6, kapasite_kaynagi = $7,
            aktif = $8, uretim_alani = coalesce($10, uretim_alani), surum = surum + 1
      WHERE id = $1 AND surum = $9 RETURNING ${ISTASYON}`,
    [id, g.kod, g.ad, g.isMerkeziId, g.tip, g.sorumluKisiId, g.kapasiteKaynagi, g.aktif, g.surum, g.uretimAlani ?? null],
  );
}

export async function istasyonVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM istasyon WHERE id = $1', [id])) !== null;
}

export async function istasyonSil(db: Db, id: number): Promise<boolean> {
  return (await db.sorgu('DELETE FROM istasyon WHERE id = $1 RETURNING id', [id])).length > 0;
}

export function makineleriListele(
  db: Db,
  secenek: { pasiflerDahil: boolean; istasyonId: number | null },
): Promise<Makine[]> {
  return db.sorgu<Makine>(
    `SELECT ${MAKINE} FROM makine WHERE ($1 OR aktif) AND ($2::int IS NULL OR istasyon_id = $2) ORDER BY kod`,
    [secenek.pasiflerDahil, secenek.istasyonId],
  );
}

export function makineBul(db: Db, id: number): Promise<Makine | null> {
  return db.tek<Makine>(`SELECT ${MAKINE} FROM makine WHERE id = $1`, [id]);
}

export function makineEkle(db: Db, g: MakineKaydi): Promise<Makine | null> {
  return db.tek<Makine>(
    `INSERT INTO makine (kod, ad, tur, marka_model, seri_no, istasyon_id, baglanti_turu, baglanti_adresi, aktif)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${MAKINE}`,
    [g.kod, g.ad, g.tur, g.markaModel, g.seriNo, g.istasyonId, g.baglantiTuru, g.baglantiAdresi, g.aktif],
  );
}

export function makineGuncelle(db: Db, id: number, g: MakineGuncellemesi): Promise<Makine | null> {
  return db.tek<Makine>(
    `UPDATE makine SET kod = $2, ad = $3, tur = $4, marka_model = $5, seri_no = $6, istasyon_id = $7,
            baglanti_turu = $8, baglanti_adresi = $9, aktif = $10, surum = surum + 1
      WHERE id = $1 AND surum = $11 RETURNING ${MAKINE}`,
    [id, g.kod, g.ad, g.tur, g.markaModel, g.seriNo, g.istasyonId, g.baglantiTuru, g.baglantiAdresi, g.aktif, g.surum],
  );
}

export async function makineVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM makine WHERE id = $1', [id])) !== null;
}

export async function makineSil(db: Db, id: number): Promise<boolean> {
  return (await db.sorgu('DELETE FROM makine WHERE id = $1 RETURNING id', [id])).length > 0;
}

export async function kisiIsMerkezleri(db: Db, kisiId: number): Promise<number[]> {
  const satirlar = await db.sorgu<{ id: number }>(
    'SELECT is_merkezi_id AS id FROM kisi_is_merkezi WHERE kisi_id = $1 ORDER BY is_merkezi_id',
    [kisiId],
  );
  return satirlar.map((s) => s.id);
}

// Kişinin bugün geçerli yetkinliği olan aktif istasyonların iş merkezleri (iş merkezi kısıtına eklenir).
export async function yetkinIsMerkezleri(db: Db, kisiId: number, gun: string): Promise<number[]> {
  const satirlar = await db.sorgu<{ id: number }>(
    `SELECT DISTINCT i.is_merkezi_id AS id FROM istasyonlar_yetkinlik y JOIN istasyon i ON i.id = y.istasyon_id
      WHERE y.kisi_id = $1 AND i.aktif AND i.is_merkezi_id IS NOT NULL AND ${GECERLI_YETKINLIK} ORDER BY 1`,
    [kisiId, gun],
  );
  return satirlar.map((s) => s.id);
}

export async function aktifIsMerkeziIdleri(db: Db, idler: readonly number[]): Promise<number[]> {
  const satirlar = await db.sorgu<{ id: number }>(
    'SELECT id FROM is_merkezi WHERE aktif AND id = ANY($1::int[])',
    [idler],
  );
  return satirlar.map((s) => s.id);
}

// Liste tümden yazılır: kişi satırı kilitlenmez, aynı kişiye eşzamanlı iki yazma son yazanın listesini bırakır.
export async function kisiIsMerkezleriniYaz(db: Db, kisiId: number, idler: readonly number[]): Promise<void> {
  await db.sorgu('DELETE FROM kisi_is_merkezi WHERE kisi_id = $1', [kisiId]);
  await db.sorgu(
    'INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) SELECT $1, unnest($2::int[])',
    [kisiId, idler],
  );
}

export type TesisDuzeyi = 'is_merkezi' | 'istasyon' | 'makine';

const DUZEY_TABLOLARI: Record<TesisDuzeyi, { tablo: string; sutun: string }> = {
  is_merkezi: { tablo: 'is_merkezi', sutun: 'is_merkezi_id' },
  istasyon: { tablo: 'istasyon', sutun: 'istasyon_id' },
  makine: { tablo: 'makine', sutun: 'makine_id' },
};

// Güncellemeden önce, aynı transaction'da: sürüm tutmazsa satır yazılmaz; güncelleme sonra düşerse transaction ikisini birlikte geri alır.
export async function eskiKoduYaz(db: Db, duzey: TesisDuzeyi, id: number, g: { kod: string; surum: number }): Promise<void> {
  const { tablo, sutun } = DUZEY_TABLOLARI[duzey];
  await db.sorgu(
    `INSERT INTO istasyonlar_kod_gecmisi (${sutun}, kod) SELECT id, kod FROM ${tablo} WHERE id = $1 AND surum = $2 AND kod <> $3`,
    [id, g.surum, g.kod],
  );
}

// Bir kaydın t anındaki kodu: t'den sonra bıraktığı ilk eski kod, yoksa bugünkü kodu. Kod aynı anda tek kayıttadır; birden çok
// kayıt t'de aynı kodu taşıyor görünüyorsa gerçek sahip, kodu en erken bırakandır (ötekiler kodu ondan sonra aldı).
// Zaman yoksa bugünkü sahibi, bugün sahibi yoksa kodu en son bırakan döner.
export function koddanKimlikler(db: Db, duzey: TesisDuzeyi, kodlar: readonly string[], zaman: Date | null): Promise<{ kod: string; id: number }[]> {
  const { tablo, sutun } = DUZEY_TABLOLARI[duzey];
  if (zaman === null) {
    return db.sorgu<{ kod: string; id: number }>(
      `SELECT DISTINCT ON (kod) kod, id FROM (
         SELECT kod, id, NULL::timestamptz AS birakildi FROM ${tablo} WHERE kod = ANY($1::text[])
         UNION ALL
         SELECT kod, ${sutun}, birakildi FROM istasyonlar_kod_gecmisi WHERE ${sutun} IS NOT NULL AND kod = ANY($1::text[])
       ) aday ORDER BY kod, birakildi DESC NULLS FIRST, id`,
      [kodlar],
    );
  }
  return db.sorgu<{ kod: string; id: number }>(
    `SELECT DISTINCT ON (kod) kod, id FROM (
       SELECT t.id, coalesce(sonraki.kod, t.kod) AS kod, sonraki.birakildi FROM ${tablo} t
         LEFT JOIN LATERAL (
           SELECT g.kod, g.birakildi FROM istasyonlar_kod_gecmisi g WHERE g.${sutun} = t.id AND g.birakildi > $2 ORDER BY g.birakildi, g.id LIMIT 1
         ) sonraki ON true
     ) donem WHERE kod = ANY($1::text[]) ORDER BY kod, birakildi NULLS LAST, id`,
    [kodlar, zaman],
  );
}

const OPERASYON_TIPI_ALANLARI = `id, kod, ad, grup, aktif, kisaltma, varsayilan_ayar_dk::text AS "varsayilanAyarDk",
  varsayilan_birim_dk::text AS "varsayilanBirimDk", varsayilan_istasyon_id AS "varsayilanIstasyonId"`;

export function operasyonTipleriListele(db: Db, pasiflerDahil: boolean): Promise<OperasyonTipi[]> {
  return db.sorgu<OperasyonTipi>(
    `SELECT ${OPERASYON_TIPI_ALANLARI} FROM istasyonlar_operasyon_tipi WHERE ($1 OR aktif) ORDER BY kod`,
    [pasiflerDahil],
  );
}

const OPERASYON_TIPI = `${OPERASYON_TIPI_ALANLARI}, surum`;

export function operasyonTipiKayitlari(db: Db, pasiflerDahil: boolean): Promise<SurumluOperasyonTipi[]> {
  return db.sorgu<SurumluOperasyonTipi>(
    `SELECT ${OPERASYON_TIPI} FROM istasyonlar_operasyon_tipi WHERE ($1 OR aktif) ORDER BY kod`,
    [pasiflerDahil],
  );
}

export function operasyonTipiEkle(db: Db, g: OperasyonTipiKaydi): Promise<SurumluOperasyonTipi | null> {
  return db.tek<SurumluOperasyonTipi>(
    `INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup, aktif, kisaltma, varsayilan_ayar_dk, varsayilan_birim_dk, varsayilan_istasyon_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${OPERASYON_TIPI}`,
    [g.kod, g.ad, g.grup, g.aktif, g.kisaltma, g.varsayilanAyarDk, g.varsayilanBirimDk, g.varsayilanIstasyonId],
  );
}

export function operasyonTipiGuncelle(db: Db, id: number, g: OperasyonTipiGuncellemesi): Promise<SurumluOperasyonTipi | null> {
  return db.tek<SurumluOperasyonTipi>(
    `UPDATE istasyonlar_operasyon_tipi SET kod = coalesce($14, kod), ad = $2, grup = $3, aktif = $4,
            kisaltma = CASE WHEN $10 THEN $6 ELSE kisaltma END,
            varsayilan_ayar_dk = CASE WHEN $11 THEN $7::numeric ELSE varsayilan_ayar_dk END,
            varsayilan_birim_dk = CASE WHEN $12 THEN $8::numeric ELSE varsayilan_birim_dk END,
            varsayilan_istasyon_id = CASE WHEN $13 THEN $9::int ELSE varsayilan_istasyon_id END, surum = surum + 1
      WHERE id = $1 AND surum = $5 RETURNING ${OPERASYON_TIPI}`,
    [id, g.ad, g.grup, g.aktif, g.surum, g.kisaltma ?? null, g.varsayilanAyarDk ?? null, g.varsayilanBirimDk ?? null, g.varsayilanIstasyonId ?? null,
      g.kisaltma !== undefined, g.varsayilanAyarDk !== undefined, g.varsayilanBirimDk !== undefined, g.varsayilanIstasyonId !== undefined, g.kod ?? null],
  );
}

export async function operasyonTipiVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM istasyonlar_operasyon_tipi WHERE id = $1', [id])) !== null;
}

export async function operasyonTipiKodu(db: Db, id: number): Promise<string | null> {
  return (await db.tek<{ kod: string }>('SELECT kod FROM istasyonlar_operasyon_tipi WHERE id = $1', [id]))?.kod ?? null;
}

// Tipe bağlı kayıt var mı (rota adımı, standart adım, iş emri adımı): tip, ara noktada silinmeye çalışılır ve hep geri alınır.
// Kullanan tablolar başka modüllerindir; onları sorgulamak yerine yabancı anahtarın kendisi sorulur, yeni bağlanan modül de kendiliğinden sayılır.
export async function operasyonTipiBagliMi(db: Db, id: number): Promise<boolean> {
  await db.sorgu('SAVEPOINT operasyon_tipi_bagi');
  try {
    await db.sorgu('DELETE FROM istasyonlar_operasyon_tipi WHERE id = $1', [id]);
    return false;
  } catch (hata) {
    if (kisitIhlali(hata)?.hata.kod === 'BAGIMLI_KAYIT') return true;
    throw hata;
  } finally {
    await db.sorgu('ROLLBACK TO SAVEPOINT operasyon_tipi_bagi');
    await db.sorgu('RELEASE SAVEPOINT operasyon_tipi_bagi');
  }
}

// Üye sayısı bugün geçerli üyeliklerdir: her kişinin bugüne kadarki son satırı, çıkarılmışlar hariç.
const EKIP = `e.id, e.kod, e.ad, e.istasyon_id AS "istasyonId", e.aktif, e.surum,
  (SELECT count(*)::int FROM (
     SELECT DISTINCT ON (u.kisi_id) u.yuzde FROM ekip_uye u
      WHERE u.ekip_id = e.id AND u.iptal_zamani IS NULL AND u.baslangic <= current_date ORDER BY u.kisi_id, u.baslangic DESC
   ) son WHERE son.yuzde IS NOT NULL) AS "uyeSayisi"`;

export function ekipleriListele(db: Db, pasiflerDahil: boolean): Promise<SurumluEkip[]> {
  return db.sorgu<SurumluEkip>(`SELECT ${EKIP} FROM ekip e WHERE ($1 OR e.aktif) ORDER BY e.kod`, [pasiflerDahil]);
}

export async function ekipVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM ekip WHERE id = $1', [id])) !== null;
}

export function ekipAdi(db: Db, id: number): Promise<{ ad: string; aktif: boolean } | null> {
  return db.tek<{ ad: string; aktif: boolean }>('SELECT ad, aktif FROM ekip WHERE id = $1', [id]);
}

export function ekipEkle(db: Db, g: EkipKaydi): Promise<SurumluEkip | null> {
  return db.tek<SurumluEkip>(
    `WITH e AS (INSERT INTO ekip (kod, ad, istasyon_id, aktif) VALUES ($1, $2, $3, $4) RETURNING *) SELECT ${EKIP} FROM e`,
    [g.kod, g.ad, g.istasyonId, g.aktif],
  );
}

export function ekipGuncelle(db: Db, id: number, g: EkipGuncellemesi): Promise<SurumluEkip | null> {
  return db.tek<SurumluEkip>(
    `WITH e AS (UPDATE ekip SET kod = $2, ad = $3, istasyon_id = $4, aktif = $5, surum = surum + 1
                 WHERE id = $1 AND surum = $6 RETURNING *) SELECT ${EKIP} FROM e`,
    [id, g.kod, g.ad, g.istasyonId, g.aktif, g.surum],
  );
}

const ATAMA_TABLOLARI: Record<AtamaTuru, { tablo: string; hedef: string }> = {
  istasyon: { tablo: 'istasyon_kisi', hedef: 'istasyon_id' },
  makine: { tablo: 'makine_kisi', hedef: 'makine_id' },
  ekip: { tablo: 'ekip_uye', hedef: 'ekip_id' },
};

// Atamanın "bugün"ü veritabanının günüdür; sunucu saatine bağlı kalmaz.
export async function bugun(db: Db): Promise<string> {
  const satir = await db.tek<{ bugun: string }>('SELECT current_date::text AS bugun');
  if (satir === null) throw new Error('current_date okunamadı');
  return satir.bugun;
}

// Kişinin bütün atama satırları (her tür, iptal edilenler hariç); yüzde sent olarak gelir.
export function kisiAtamaSatirlari(db: Db, kisiId: number): Promise<AtamaSatiri[]> {
  const parcalar = (Object.entries(ATAMA_TABLOLARI) as [AtamaTuru, { tablo: string; hedef: string }][]).map(
    ([tur, { tablo, hedef }]) =>
      `SELECT '${tur}' AS tur, ${hedef} AS "hedefId", baslangic::text AS baslangic, (yuzde * 100)::int AS sent FROM ${tablo}
        WHERE kisi_id = $1 AND iptal_zamani IS NULL`,
  );
  return db.sorgu<AtamaSatiri>(parcalar.join(' UNION ALL '), [kisiId]);
}

// Toplam kuralı satırlar arasıdır: aynı kişiye eşzamanlı iki atama ayrı ayrı geçip birlikte 100'ü aşabilir.
// Kişi bazında transaction sonuna kadar sıraya sokulur; okuma bu kilitten sonra yapılmalıdır.
export async function kisiAtamaKilidi(db: Db, kisiId: number): Promise<void> {
  await db.sorgu("SELECT pg_advisory_xact_lock(hashtext('kisi_atama'), $1)", [kisiId]);
}

// Aynı gün ikinci değişiklik o günün satırının üstüne yazar (gün içi geçmiş tutulmaz; kullanıcı kararı).
export async function atamaYaz(
  db: Db,
  tur: AtamaTuru,
  g: { hedefId: number; kisiId: number; baslangic: string; sent: number | null },
): Promise<void> {
  const { tablo, hedef } = ATAMA_TABLOLARI[tur];
  await db.sorgu(
    `INSERT INTO ${tablo} (${hedef}, kisi_id, baslangic, yuzde) VALUES ($1, $2, $3::date, $4::numeric / 100)
     ON CONFLICT (${hedef}, kisi_id, baslangic) WHERE iptal_zamani IS NULL DO UPDATE SET yuzde = EXCLUDED.yuzde`,
    [g.hedefId, g.kisiId, g.baslangic, g.sent],
  );
}

export interface GecerliAtama { hedefId: number; kisiId: number; baslangic: string; yuzde: string }

// Verilen tarihte geçerli atamalar: her (hedef, kişi) için o tarihe kadarki son satır; çıkarılmışlar düşer.
export function gecerliAtamalar(
  db: Db,
  tur: AtamaTuru,
  secenek: { hedefId: number | null; kisiId: number | null; tarih: string },
): Promise<GecerliAtama[]> {
  const { tablo, hedef } = ATAMA_TABLOLARI[tur];
  return db.sorgu<GecerliAtama>(
    `SELECT "hedefId", "kisiId", baslangic, yuzde FROM (
       SELECT DISTINCT ON (${hedef}, kisi_id) ${hedef} AS "hedefId", kisi_id AS "kisiId", baslangic::text AS baslangic, yuzde::text AS yuzde
         FROM ${tablo}
        WHERE iptal_zamani IS NULL AND baslangic <= $3::date AND ($1::int IS NULL OR ${hedef} = $1) AND ($2::int IS NULL OR kisi_id = $2)
        ORDER BY ${hedef}, kisi_id, baslangic DESC
     ) son WHERE yuzde IS NOT NULL ORDER BY "hedefId", "kisiId"`,
    [secenek.hedefId, secenek.kisiId, secenek.tarih],
  );
}

// Verilen tarihten sonra başlayacak atamalar: her (hedef, kişi) için ileri tarihli ilk atama satırı (planlı çıkarmalar düşer).
export function baslayacakAtamalar(
  db: Db,
  tur: AtamaTuru,
  secenek: { hedefId: number | null; kisiId: number | null; tarih: string },
): Promise<GecerliAtama[]> {
  const { tablo, hedef } = ATAMA_TABLOLARI[tur];
  return db.sorgu<GecerliAtama>(
    `SELECT DISTINCT ON (${hedef}, kisi_id) ${hedef} AS "hedefId", kisi_id AS "kisiId", baslangic::text AS baslangic, yuzde::text AS yuzde
       FROM ${tablo}
      WHERE iptal_zamani IS NULL AND yuzde IS NOT NULL AND baslangic > $3::date AND ($1::int IS NULL OR ${hedef} = $1) AND ($2::int IS NULL OR kisi_id = $2)
      ORDER BY ${hedef}, kisi_id, baslangic`,
    [secenek.hedefId, secenek.kisiId, secenek.tarih],
  );
}

export interface IleriAtama { baslangic: string; yuzde: string | null }

// Aynı hedefte verilen tarihten sonra başlayan, iptal edilmemiş satırlar (planlı atamalar ve planlı çıkarmalar).
export function ileriAtamalar(db: Db, tur: AtamaTuru, g: { hedefId: number; kisiId: number; tarih: string }): Promise<IleriAtama[]> {
  const { tablo, hedef } = ATAMA_TABLOLARI[tur];
  return db.sorgu<IleriAtama>(
    `SELECT baslangic::text AS baslangic, yuzde::text AS yuzde FROM ${tablo}
      WHERE ${hedef} = $1 AND kisi_id = $2 AND baslangic > $3::date AND iptal_zamani IS NULL ORDER BY baslangic`,
    [g.hedefId, g.kisiId, g.tarih],
  );
}

// Satır silinmez, iptal zamanı yazılır (E3k).
export async function ileriAtamalariIptalEt(db: Db, tur: AtamaTuru, g: { hedefId: number; kisiId: number; tarih: string }): Promise<number> {
  const { tablo, hedef } = ATAMA_TABLOLARI[tur];
  const satirlar = await db.sorgu(
    `UPDATE ${tablo} SET iptal_zamani = now()
      WHERE ${hedef} = $1 AND kisi_id = $2 AND baslangic > $3::date AND iptal_zamani IS NULL RETURNING 1`,
    [g.hedefId, g.kisiId, g.tarih],
  );
  return satirlar.length;
}

// Plan girdileri (T2). Gövdedeki sürüm verilirse yazma ancak o sürümdeki satıra (satır yoksa 0) olur; tutmazsa satır dönmez.
// Aynı anda iki ilk yazmada ikincisi çakışmada bekler, sonra koşul tutmadığı için satır döndürmez.
export interface PlanAyariSatiri {
  istasyonId: number; verimYuzde: string; operatorIhtiyaci: string; degistirenKisiId: number; degisme: string; surum: number;
}

export function planAyarlari(db: Db): Promise<PlanAyariSatiri[]> {
  return db.sorgu<PlanAyariSatiri>(
    `SELECT istasyon_id AS "istasyonId", verim_yuzde::text AS "verimYuzde", operator_ihtiyaci::text AS "operatorIhtiyaci",
            degistiren_kisi_id AS "degistirenKisiId", ${zamanMetni('degisme')} AS degisme, surum
       FROM istasyonlar_plan_ayari ORDER BY istasyon_id`,
  );
}

export async function planAyariYaz(
  db: Db, istasyonId: number, g: { verimYuzde: number; operatorIhtiyaci: number; surum: number | null }, kisiId: number,
): Promise<boolean> {
  const satir = await db.tek(
    `INSERT INTO istasyonlar_plan_ayari AS a (istasyon_id, verim_yuzde, operator_ihtiyaci, degistiren_kisi_id)
     SELECT $1, $2, $3, $4 WHERE $5::int IS NULL OR $5 = 0 OR EXISTS (SELECT 1 FROM istasyonlar_plan_ayari WHERE istasyon_id = $1)
     ON CONFLICT (istasyon_id) DO UPDATE SET verim_yuzde = EXCLUDED.verim_yuzde, operator_ihtiyaci = EXCLUDED.operator_ihtiyaci,
       degistiren_kisi_id = EXCLUDED.degistiren_kisi_id, degisme = now(), surum = a.surum + 1
       WHERE $5::int IS NULL OR a.surum = $5
     RETURNING 1`,
    [istasyonId, g.verimYuzde, g.operatorIhtiyaci, kisiId, g.surum],
  );
  return satir !== null;
}

export interface MakineDurumuSatiri {
  makineId: number; durum: MakineDurumuDegeri; aciklama: string | null; degistirenKisiId: number; degisme: string; surum: number;
}

export function makineDurumlari(db: Db): Promise<MakineDurumuSatiri[]> {
  return db.sorgu<MakineDurumuSatiri>(
    `SELECT makine_id AS "makineId", durum, aciklama, degistiren_kisi_id AS "degistirenKisiId", ${zamanMetni('degisme')} AS degisme, surum
       FROM istasyonlar_makine_durumu ORDER BY makine_id`,
  );
}

export async function makineDurumuBul(db: Db, makineId: number): Promise<string | null> {
  const satir = await db.tek<{ durum: string }>('SELECT durum FROM istasyonlar_makine_durumu WHERE makine_id = $1', [makineId]);
  return satir?.durum ?? null;
}

export async function makineDurumuYaz(
  db: Db, makineId: number, g: { durum: MakineDurumuDegeri; aciklama: string | null; surum: number | null }, kisiId: number,
): Promise<boolean> {
  const satir = await db.tek(
    `INSERT INTO istasyonlar_makine_durumu AS d (makine_id, durum, aciklama, degistiren_kisi_id)
     SELECT $1, $2, $3, $4 WHERE $5::int IS NULL OR $5 = 0 OR EXISTS (SELECT 1 FROM istasyonlar_makine_durumu WHERE makine_id = $1)
     ON CONFLICT (makine_id) DO UPDATE SET durum = EXCLUDED.durum, aciklama = EXCLUDED.aciklama,
       degistiren_kisi_id = EXCLUDED.degistiren_kisi_id, degisme = now(), surum = d.surum + 1
       WHERE $5::int IS NULL OR d.surum = $5
     RETURNING 1`,
    [makineId, g.durum, g.aciklama, kisiId, g.surum],
  );
  return satir !== null;
}

// Plan için çalışabilir makine: aktif (kullanımda) ve durumu arıza ya da bakım değil (IS-01).
export async function calisirMakineIdleri(db: Db, istasyonId: number): Promise<number[]> {
  const satirlar = await db.sorgu<{ id: number }>(
    `SELECT m.id FROM makine m LEFT JOIN istasyonlar_makine_durumu d ON d.makine_id = m.id
      WHERE m.aktif AND m.istasyon_id = $1 AND coalesce(d.durum, 'calisir') = 'calisir' ORDER BY m.kod`,
    [istasyonId],
  );
  return satirlar.map((s) => s.id);
}

// Kullanımdaki makineler; durum satırı olmayan makine çalışır sayılır (calisirMakineIdleri ile aynı kural).
export async function makineSayilari(db: Db): Promise<{ toplam: number; calisir: number; ariza: number; bakim: number }> {
  const satir = await db.tek<{ toplam: number; calisir: number; ariza: number; bakim: number }>(
    `SELECT count(*)::int AS toplam,
            count(*) FILTER (WHERE d.durum = 'calisir')::int AS calisir,
            count(*) FILTER (WHERE d.durum = 'ariza')::int AS ariza,
            count(*) FILTER (WHERE d.durum = 'bakim')::int AS bakim
       FROM makine m LEFT JOIN istasyonlar_makine_durumu d ON d.makine_id = m.id
      WHERE m.aktif`,
  );
  return satir ?? { toplam: 0, calisir: 0, ariza: 0, bakim: 0 };
}

// Geçerlilik bitişi boşsa süresizdir; bitiş günü dahil geçerlidir ($2: tesis günü).
const GECERLI_YETKINLIK = '(y.gecerlilik_bitis IS NULL OR y.gecerlilik_bitis >= $2::date)';

// Bugün geçerli yetkinlikler (iş başlatma, plan kapasitesi, iş merkezi kapsamı bunları okur).
export function yetkinlikSatirlari(db: Db, kisiId: number | null, gun: string): Promise<{ kisiId: number; istasyonId: number }[]> {
  return db.sorgu<{ kisiId: number; istasyonId: number }>(
    `SELECT kisi_id AS "kisiId", istasyon_id AS "istasyonId" FROM istasyonlar_yetkinlik y
      WHERE ($1::int IS NULL OR kisi_id = $1) AND ${GECERLI_YETKINLIK} ORDER BY kisi_id, istasyon_id`,
    [kisiId, gun],
  );
}

export interface YetkinlikAyrintiSatiri {
  kisiId: number;
  istasyonId: number;
  verenKisiId: number | null;
  verilme: string | null;
  gecerlilikBitis: string | null;
  dayanak: string | null;
  surum: number;
}
const YETKINLIK_AYRINTI = `kisi_id AS "kisiId", istasyon_id AS "istasyonId", veren_kisi_id AS "verenKisiId", ${zamanMetni('verilme')} AS verilme,
  gecerlilik_bitis::text AS "gecerlilikBitis", dayanak, surum`;

// Süresi dolmuşlar dahil bütün yetkinlikler (ekran listesi ve yazma).
export function yetkinlikAyrintilari(db: Db, kisiId: number | null): Promise<YetkinlikAyrintiSatiri[]> {
  return db.sorgu<YetkinlikAyrintiSatiri>(
    `SELECT ${YETKINLIK_AYRINTI} FROM istasyonlar_yetkinlik WHERE $1::int IS NULL OR kisi_id = $1 ORDER BY kisi_id, istasyon_id`,
    [kisiId],
  );
}

// Kişinin satırları kilitlenir: eşzamanlı iki liste yazması sırayla uygulanır ve ikisinin defter kaydı da kalır.
export function kisiYetkinlikleriniKilitle(db: Db, kisiId: number): Promise<YetkinlikAyrintiSatiri[]> {
  return db.sorgu<YetkinlikAyrintiSatiri>(
    `SELECT ${YETKINLIK_AYRINTI} FROM istasyonlar_yetkinlik WHERE kisi_id = $1 ORDER BY istasyon_id FOR UPDATE`,
    [kisiId],
  );
}

export async function yetkinlikEkle(db: Db, kisiId: number, istasyonId: number, verenKisiId: number): Promise<void> {
  await db.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id, veren_kisi_id, verilme) VALUES ($1, $2, $3, now())', [kisiId, istasyonId, verenKisiId]);
}

export async function yetkinlikKaldir(db: Db, kisiId: number, istasyonId: number): Promise<void> {
  await db.sorgu('DELETE FROM istasyonlar_yetkinlik WHERE kisi_id = $1 AND istasyon_id = $2', [kisiId, istasyonId]);
}

// Sürüm tutmazsa null döner.
export function yetkinlikAyrintisiYaz(
  db: Db, kisiId: number, istasyonId: number, g: { gecerlilikBitis: string | null; dayanak: string | null; surum: number },
): Promise<YetkinlikAyrintiSatiri | null> {
  return db.tek<YetkinlikAyrintiSatiri>(
    `UPDATE istasyonlar_yetkinlik SET gecerlilik_bitis = $3, dayanak = $4, surum = surum + 1
      WHERE kisi_id = $1 AND istasyon_id = $2 AND surum = $5 RETURNING ${YETKINLIK_AYRINTI}`,
    [kisiId, istasyonId, g.gecerlilikBitis, g.dayanak, g.surum],
  );
}

export interface YetkinlikGecmisSatiri {
  istasyonId: number;
  istasyonKod: string;
  islem: 'ver' | 'degistir' | 'kaldir';
  gecerlilikBitis: string | null;
  dayanak: string | null;
  degistirenKisiId: number;
  zaman: string;
}

export async function yetkinlikGecmisiYaz(
  db: Db, g: { kisiId: number; istasyonId: number; islem: YetkinlikGecmisSatiri['islem']; gecerlilikBitis: string | null; dayanak: string | null; degistirenKisiId: number },
): Promise<void> {
  await db.sorgu(
    `INSERT INTO istasyonlar_yetkinlik_gecmisi (kisi_id, istasyon_id, istasyon_kod, islem, gecerlilik_bitis, dayanak, degistiren_kisi_id)
       SELECT $1, $2, i.kod, $3, $4, $5, $6 FROM istasyon i WHERE i.id = $2`,
    [g.kisiId, g.istasyonId, g.islem, g.gecerlilikBitis, g.dayanak, g.degistirenKisiId],
  );
}

export function yetkinlikGecmisi(db: Db, kisiId: number): Promise<YetkinlikGecmisSatiri[]> {
  return db.sorgu<YetkinlikGecmisSatiri>(
    `SELECT istasyon_id AS "istasyonId", istasyon_kod AS "istasyonKod", islem, gecerlilik_bitis::text AS "gecerlilikBitis", dayanak, degistiren_kisi_id AS "degistirenKisiId",
            ${zamanMetni('zaman')} AS zaman
       FROM istasyonlar_yetkinlik_gecmisi WHERE kisi_id = $1 ORDER BY zaman DESC, id DESC LIMIT 500`,
    [kisiId],
  );
}

export function tumKisiIsMerkezleri(db: Db): Promise<{ kisiId: number; isMerkeziId: number }[]> {
  return db.sorgu<{ kisiId: number; isMerkeziId: number }>(
    'SELECT kisi_id AS "kisiId", is_merkezi_id AS "isMerkeziId" FROM kisi_is_merkezi ORDER BY kisi_id, is_merkezi_id',
  );
}

export async function aktifIstasyonIdleri(db: Db, idler: readonly number[]): Promise<number[]> {
  const satirlar = await db.sorgu<{ id: number }>(
    `SELECT i.id FROM ${ISTASYON_VE_MERKEZI} WHERE ${AKTIF_ISTASYON} AND i.id = ANY($1::int[])`, [idler],
  );
  return satirlar.map((s) => s.id);
}

// 563 c: makine yetkinliği. Okuma, makinenin bugünkü istasyonunu taşır; istasyon yetkinliği kontrolü servistedir.
export interface MakineYetkinligiSatiri { kisiId: number; makineId: number; istasyonId: number | null; verenKisiId: number; verilme: string }
const MAKINE_YETKINLIK = `y.kisi_id AS "kisiId", y.makine_id AS "makineId", m.istasyon_id AS "istasyonId", y.veren_kisi_id AS "verenKisiId",
  ${zamanMetni('y.verilme')} AS verilme`;

export function makineYetkinlikAyrintilari(db: Db, kisiId: number | null): Promise<MakineYetkinligiSatiri[]> {
  return db.sorgu<MakineYetkinligiSatiri>(
    `SELECT ${MAKINE_YETKINLIK} FROM istasyonlar_makine_yetkinlik y JOIN makine m ON m.id = y.makine_id
      WHERE $1::int IS NULL OR y.kisi_id = $1 ORDER BY y.kisi_id, y.makine_id`,
    [kisiId],
  );
}

export function kisiMakineYetkinlikleriniKilitle(db: Db, kisiId: number): Promise<MakineYetkinligiSatiri[]> {
  return db.sorgu<MakineYetkinligiSatiri>(
    `SELECT ${MAKINE_YETKINLIK} FROM istasyonlar_makine_yetkinlik y JOIN makine m ON m.id = y.makine_id
      WHERE y.kisi_id = $1 ORDER BY y.makine_id FOR UPDATE OF y`,
    [kisiId],
  );
}

// Bugün geçerli istasyon yetkinliği olan istasyonun makineleri (plan motoru bunu okur).
export function gecerliMakineYetkinlikleri(db: Db, kisiId: number | null, gun: string): Promise<{ kisiId: number; makineId: number }[]> {
  return db.sorgu<{ kisiId: number; makineId: number }>(
    `SELECT my.kisi_id AS "kisiId", my.makine_id AS "makineId"
       FROM istasyonlar_makine_yetkinlik my JOIN makine m ON m.id = my.makine_id
       JOIN istasyonlar_yetkinlik y ON y.kisi_id = my.kisi_id AND y.istasyon_id = m.istasyon_id
      WHERE ($1::int IS NULL OR my.kisi_id = $1) AND ${GECERLI_YETKINLIK} ORDER BY my.kisi_id, my.makine_id`,
    [kisiId, gun],
  );
}

// Yeni makine yetkinliği için makinenin varlığı, aktifliği ve istasyonu.
export function makineIstasyonlari(db: Db, idler: readonly number[]): Promise<{ id: number; istasyonId: number | null; aktif: boolean }[]> {
  return db.sorgu<{ id: number; istasyonId: number | null; aktif: boolean }>(
    'SELECT id, istasyon_id AS "istasyonId", aktif FROM makine WHERE id = ANY($1::int[])',
    [[...idler]],
  );
}

export async function makineYetkinlikEkle(db: Db, kisiId: number, makineId: number, verenKisiId: number): Promise<void> {
  await db.sorgu('INSERT INTO istasyonlar_makine_yetkinlik (kisi_id, makine_id, veren_kisi_id) VALUES ($1, $2, $3)', [kisiId, makineId, verenKisiId]);
}

export async function makineYetkinlikKaldir(db: Db, kisiId: number, makineId: number): Promise<void> {
  await db.sorgu('DELETE FROM istasyonlar_makine_yetkinlik WHERE kisi_id = $1 AND makine_id = $2', [kisiId, makineId]);
}

export type MakineYetkinlikNedeni = 'elle' | 'istasyon_yetkinligi_kalkti';
export async function makineYetkinlikGecmisiYaz(
  db: Db, g: { kisiId: number; makineId: number; islem: 'ver' | 'kaldir'; neden: MakineYetkinlikNedeni; degistirenKisiId: number },
): Promise<void> {
  await db.sorgu(
    `INSERT INTO istasyonlar_makine_yetkinlik_gecmisi (kisi_id, makine_id, makine_kod, islem, neden, degistiren_kisi_id)
       SELECT $1, $2, m.kod, $3, $4, $5 FROM makine m WHERE m.id = $2`,
    [g.kisiId, g.makineId, g.islem, g.neden, g.degistirenKisiId],
  );
}

export interface MakineYetkinlikGecmisSatiri { makineId: number; makineKod: string; islem: 'ver' | 'kaldir'; neden: MakineYetkinlikNedeni; degistirenKisiId: number; zaman: string }
export function makineYetkinlikGecmisi(db: Db, kisiId: number): Promise<MakineYetkinlikGecmisSatiri[]> {
  return db.sorgu<MakineYetkinlikGecmisSatiri>(
    `SELECT makine_id AS "makineId", makine_kod AS "makineKod", islem, neden, degistiren_kisi_id AS "degistirenKisiId", ${zamanMetni('zaman')} AS zaman
       FROM istasyonlar_makine_yetkinlik_gecmisi WHERE kisi_id = $1 ORDER BY zaman DESC, id DESC LIMIT 500`,
    [kisiId],
  );
}

// 563 2 a: kişi başına aynı anda en çok tezgâh. Satır yoksa sınır yoktur.
export function kisiTezgahSinirlari(db: Db): Promise<{ kisiId: number; enCok: number }[]> {
  return db.sorgu<{ kisiId: number; enCok: number }>('SELECT kisi_id AS "kisiId", en_cok AS "enCok" FROM istasyonlar_kisi_tezgah_siniri ORDER BY kisi_id');
}

export async function kisiTezgahSiniriYaz(db: Db, kisiId: number, enCok: number | null, degistirenKisiId: number): Promise<void> {
  if (enCok === null) {
    await db.sorgu('DELETE FROM istasyonlar_kisi_tezgah_siniri WHERE kisi_id = $1', [kisiId]);
    return;
  }
  await db.sorgu(
    `INSERT INTO istasyonlar_kisi_tezgah_siniri (kisi_id, en_cok, degistiren_kisi_id) VALUES ($1, $2, $3)
       ON CONFLICT (kisi_id) DO UPDATE SET en_cok = EXCLUDED.en_cok, degistiren_kisi_id = EXCLUDED.degistiren_kisi_id, degisme = now()
       WHERE istasyonlar_kisi_tezgah_siniri.en_cok IS DISTINCT FROM EXCLUDED.en_cok`,
    [kisiId, enCok, degistirenKisiId],
  );
}
