import type { Db } from '#cekirdek/db.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { Dilim, SiralamaIstegi, SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type {
  AracDurumu, AracEkleVerisi, AracTalebiAcVerisi, AracTuru, DemirbasDurumu, DemirbasEkleVerisi, DemirbasTuru, IadeDurumu, ZimmetleVerisi, GorevDurumu, MasrafEkleVerisi, MasrafTuru, Sahiplik, AtikBirimi, KontrolEkleVerisi, KontrolGuncelleVerisi, KontrolTuru, SiklikBirimi, TalepAcVerisi, TalepAciliyeti, TalepDurumu, TalepKategorisi,
} from '#paylasilan/sozlesme/idari-isler.ts';

export interface TalepSatiri {
  id: number;
  no: string;
  kategori: TalepKategorisi;
  yer: string;
  aciklama: string | null;
  aciliyet: TalepAciliyeti;
  durum: TalepDurumu;
  acan_kisi_id: number;
  acilma: string;
  ustlenen_kisi_id: number | null;
  ustlenme: string | null;
  kapatan_kisi_id: number | null;
  kapanma: string | null;
  sonuc_notu: string | null;
  surum: number;
}

const SECIM = `SELECT t.id, t.no, t.kategori, t.yer, t.aciklama, t.aciliyet, t.durum, t.acan_kisi_id, ${zamanMetni('t.acilma')} AS acilma,
                      t.ustlenen_kisi_id, ${zamanMetni('t.ustlenme')} AS ustlenme, t.kapatan_kisi_id, ${zamanMetni('t.kapanma')} AS kapanma,
                      t.sonuc_notu, t.surum
                 FROM idari_isler_talep t`;

export async function siradakiNo(db: Db, yil: number): Promise<number> {
  const satir = await db.tek<{ son_sira: number }>(
    `INSERT INTO idari_isler_numara_sayaci (yil, son_sira) VALUES ($1, 1)
     ON CONFLICT (yil) DO UPDATE SET son_sira = idari_isler_numara_sayaci.son_sira + 1
     RETURNING son_sira`,
    [yil],
  );
  if (satir === null) throw new Error('Talep sırası alınamadı');
  return satir.son_sira;
}

// Numaranın yılı tesis gününden (veritabanı oturumunun saat dilimi tesisinkidir).
export async function buYil(db: Db): Promise<number> {
  const satir = await db.tek<{ yil: number }>('SELECT extract(year FROM current_date)::int AS yil');
  if (satir === null) throw new Error('Yıl okunamadı');
  return satir.yil;
}

export async function talepEkle(db: Db, no: string, g: TalepAcVerisi, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO idari_isler_talep (no, kategori, yer, aciklama, aciliyet, acan_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [no, g.kategori, g.yer, g.aciklama, g.aciliyet, kisiId],
  );
  if (satir === null) throw new Error('Talep eklenemedi');
  return satir.id;
}

export function talepGetir(db: Db, id: number): Promise<TalepSatiri | null> {
  return db.tek<TalepSatiri>(`${SECIM} WHERE t.id = $1`, [id]);
}

export function talepKilitle(db: Db, id: number): Promise<{ durum: TalepDurumu; acan_kisi_id: number } | null> {
  return db.tek<{ durum: TalepDurumu; acan_kisi_id: number }>(`SELECT durum, acan_kisi_id FROM idari_isler_talep WHERE id = $1 FOR UPDATE`, [id]);
}

export async function talepVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM idari_isler_talep WHERE id = $1', [id])) !== null;
}

// Durum yazmaları sürüm koşullu; hedef durum, üstlenen ve kapanış alanları birlikte yazılır (kısıtlar bütünlüğü korur).
export function ustlenmeYaz(db: Db, id: number, surum: number, ustlenen: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_talep SET durum = 'yapiliyor', ustlenen_kisi_id = $3, ustlenme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, ustlenen],
  );
}

export function birakmaYaz(db: Db, id: number, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_talep SET durum = 'yeni', ustlenen_kisi_id = NULL, ustlenme = NULL, surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum],
  );
}

export function kapanisYaz(
  db: Db, id: number, surum: number, durum: 'kapandi' | 'reddedildi' | 'geri_cekildi', kapatan: number, not: string | null,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_talep SET durum = $3, kapatan_kisi_id = $4, kapanma = now(), sonuc_notu = $5, surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, durum, kapatan, not],
  );
}

// Pano: açık sütunlar eski önce (sıra kuyruktur), kapananlar yeni önce ve son yedi gün.
export function acikTalepler(db: Db, durum: 'yeni' | 'yapiliyor', sinir: number): Promise<TalepSatiri[]> {
  return db.sorgu<TalepSatiri>(`${SECIM} WHERE t.durum = $1 ORDER BY t.acilma, t.id LIMIT $2`, [durum, sinir]);
}

export function sonKapananlar(db: Db, sinir: number): Promise<TalepSatiri[]> {
  return db.sorgu<TalepSatiri>(
    `${SECIM} WHERE t.kapanma IS NOT NULL AND t.kapanma >= now() - interval '7 days' AND t.durum <> 'geri_cekildi'
      ORDER BY t.kapanma DESC, t.id DESC LIMIT $1`,
    [sinir],
  );
}

export async function panoSayilari(db: Db): Promise<{ yeni: number; yapiliyor: number; kapanan: number }> {
  const satir = await db.tek<{ yeni: number; yapiliyor: number; kapanan: number }>(
    `SELECT count(*) FILTER (WHERE durum = 'yeni')::int AS yeni, count(*) FILTER (WHERE durum = 'yapiliyor')::int AS yapiliyor,
            count(*) FILTER (WHERE kapanma >= now() - interval '7 days' AND durum <> 'geri_cekildi')::int AS kapanan
       FROM idari_isler_talep WHERE durum IN ('yeni', 'yapiliyor') OR kapanma >= now() - interval '7 days'`,
  );
  return satir ?? { yeni: 0, yapiliyor: 0, kapanan: 0 };
}

// Bugün: bütün yeni talepler ve kişinin üstlendikleri; sayılar tesis gününe göre.
export function bugunTalepleri(db: Db, kisiId: number, sinir: number): Promise<TalepSatiri[]> {
  return db.sorgu<TalepSatiri>(
    `${SECIM} WHERE t.durum = 'yeni' OR (t.durum = 'yapiliyor' AND t.ustlenen_kisi_id = $1)
      ORDER BY (t.aciliyet = 'acil') DESC, t.acilma, t.id LIMIT $2`,
    [kisiId, sinir],
  );
}

export async function bugunSayilari(db: Db): Promise<{ acik_talep: number; acil_talep: number; bugun_acilan: number; bugun_kapanan: number }> {
  const satir = await db.tek<{ acik_talep: number; acil_talep: number; bugun_acilan: number; bugun_kapanan: number }>(
    `SELECT count(*) FILTER (WHERE durum IN ('yeni', 'yapiliyor'))::int AS acik_talep,
            count(*) FILTER (WHERE durum IN ('yeni', 'yapiliyor') AND aciliyet = 'acil')::int AS acil_talep,
            count(*) FILTER (WHERE acilma >= current_date)::int AS bugun_acilan,
            count(*) FILTER (WHERE durum = 'kapandi' AND kapanma >= current_date)::int AS bugun_kapanan
       FROM idari_isler_talep WHERE durum IN ('yeni', 'yapiliyor') OR acilma >= current_date OR kapanma >= current_date`,
  );
  return satir ?? { acik_talep: 0, acil_talep: 0, bugun_acilan: 0, bugun_kapanan: 0 };
}

export type TaleplerimSiralamasi = 'acilma' | 'no';
export const TALEPLERIM_SIRALAMASI: SiralamaTanimi<TaleplerimSiralamasi> = {
  sutunlar: { acilma: 't.acilma', no: 't.no' },
  ikincil: 't.id',
  varsayilan: { sutun: 't.acilma', yon: 'azalan' },
};

const KENDI_KOSULU = 'WHERE t.acan_kisi_id = $1 AND ($2::text IS NULL OR t.durum = $2)';

export async function kendiTalepSayisi(db: Db, kisiId: number, durum: TalepDurumu | null): Promise<number> {
  const satir = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM idari_isler_talep t ${KENDI_KOSULU}`, [kisiId, durum]);
  return satir?.toplam ?? 0;
}

export function kendiTalepleri(
  db: Db, kisiId: number, durum: TalepDurumu | null, siralama: SiralamaIstegi<TaleplerimSiralamasi>, dilim: Dilim,
): Promise<TalepSatiri[]> {
  return db.sorgu<TalepSatiri>(
    `${SECIM} ${KENDI_KOSULU} ORDER BY ${siralamaSql(TALEPLERIM_SIRALAMASI, siralama)} LIMIT $3 OFFSET $4`,
    [kisiId, durum, dilim.sinir, dilim.atla],
  );
}

export async function sonYerler(db: Db, kisiId: number, sinir: number): Promise<string[]> {
  const satirlar = await db.sorgu<{ yer: string }>(
    `SELECT yer FROM idari_isler_talep WHERE acan_kisi_id = $1 GROUP BY yer ORDER BY max(acilma) DESC, yer LIMIT $2`,
    [kisiId, sinir],
  );
  return satirlar.map((s) => s.yer);
}

export async function menuSayilari(db: Db, kisiId: number): Promise<{ bugun: number; acik: number; kendi: number }> {
  const satir = await db.tek<{ bugun: number; acik: number; kendi: number }>(
    `SELECT count(*) FILTER (WHERE durum = 'yeni' OR (durum = 'yapiliyor' AND ustlenen_kisi_id = $1))::int AS bugun,
            count(*)::int AS acik,
            count(*) FILTER (WHERE acan_kisi_id = $1)::int AS kendi
       FROM idari_isler_talep WHERE durum IN ('yeni', 'yapiliyor')`,
    [kisiId],
  );
  return satir ?? { bugun: 0, acik: 0, kendi: 0 };
}

export interface KontrolSatiri {
  id: number;
  ad: string;
  tur: KontrolTuru;
  siklik_deger: number | null;
  siklik_birim: SiklikBirimi | null;
  sonraki_tarih: string;
  kalan_gun: number;
  firma_id: number | null;
  aciklama: string | null;
  aktif: boolean;
  surum: number;
}

// Kalan gün tesis gününe göre (veritabanı oturumunun saat dilimi tesisinkidir).
const KONTROL_SECIMI = `SELECT k.id, k.ad, k.tur, k.siklik_deger, k.siklik_birim, k.sonraki_tarih, (k.sonraki_tarih - current_date)::int AS kalan_gun,
                               k.firma_id, k.aciklama, k.aktif, k.surum
                          FROM idari_isler_kontrol k`;

export async function bugunTarihi(db: Db): Promise<string> {
  const satir = await db.tek<{ bugun: string }>('SELECT current_date AS bugun');
  if (satir === null) throw new Error('Tarih okunamadı');
  return satir.bugun;
}

export async function kontrolEkle(db: Db, g: KontrolEkleVerisi, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO idari_isler_kontrol (ad, tur, siklik_deger, siklik_birim, sonraki_tarih, firma_id, aciklama, olusturan_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [g.ad, g.tur, g.siklikDeger, g.siklikBirim, g.sonrakiTarih, g.firmaId, g.aciklama, kisiId],
  );
  if (satir === null) throw new Error('Kontrol eklenemedi');
  return satir.id;
}

export function kontrolGetir(db: Db, id: number): Promise<KontrolSatiri | null> {
  return db.tek<KontrolSatiri>(`${KONTROL_SECIMI} WHERE k.id = $1`, [id]);
}

export function kontrolKilitle(db: Db, id: number): Promise<KontrolSatiri | null> {
  return db.tek<KontrolSatiri>(`${KONTROL_SECIMI} WHERE k.id = $1 FOR UPDATE`, [id]);
}

export async function kontrolVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM idari_isler_kontrol WHERE id = $1', [id])) !== null;
}

export function kontrolGuncelle(db: Db, id: number, g: KontrolGuncelleVerisi): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_kontrol SET ad = $3, siklik_deger = $4, siklik_birim = $5, sonraki_tarih = $6, firma_id = $7, aciklama = $8, surum = surum + 1
      WHERE id = $1 AND surum = $2 AND aktif RETURNING id`,
    [id, g.surum, g.ad, g.siklikDeger, g.siklikBirim, g.sonrakiTarih, g.firmaId, g.aciklama],
  );
}

export interface KayitVerisi {
  yapilma: string;
  oncekiTarih: string;
  sonrakiTarih: string;
  belgeNo: string | null;
  not: string | null;
  miktar: string | null;
  birim: AtikBirimi | null;
  firmaId: number | null;
}

// Kayıt eklenir, kalemin sonraki tarihi aynı komutta ilerler (sürüm koşullu).
export async function yapildiYaz(db: Db, id: number, surum: number, v: KayitVerisi, kisiId: number): Promise<{ id: number } | null> {
  const guncel = await db.tek<{ id: number }>(
    'UPDATE idari_isler_kontrol SET sonraki_tarih = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 AND aktif RETURNING id',
    [id, surum, v.sonrakiTarih],
  );
  if (guncel === null) return null;
  await db.sorgu(
    `INSERT INTO idari_isler_kontrol_kaydi (kontrol_id, yapilma, onceki_tarih, sonraki_tarih, belge_no, not_metni, miktar, birim, firma_id, kaydeden_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, v.yapilma, v.oncekiTarih, v.sonrakiTarih, v.belgeNo, v.not, v.miktar, v.birim, v.firmaId, kisiId],
  );
  return guncel;
}

export function bitisYaz(db: Db, id: number, surum: number, kisiId: number, neden: string | null): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_kontrol SET aktif = false, bitiren_kisi_id = $3, bitis = now(), bitis_nedeni = $4, surum = surum + 1
      WHERE id = $1 AND surum = $2 AND aktif RETURNING id`,
    [id, surum, kisiId, neden],
  );
}

export function etkinKontroller(db: Db, sinir: number): Promise<KontrolSatiri[]> {
  return db.sorgu<KontrolSatiri>(`${KONTROL_SECIMI} WHERE k.aktif ORDER BY k.sonraki_tarih, k.id LIMIT $1`, [sinir]);
}

// IDR-14: Bugün'e düşen kalemler (süresi geçen ve gün sınırı içindekiler).
export function yaklasanKontroller(db: Db, gun: number, sinir: number): Promise<KontrolSatiri[]> {
  return db.sorgu<KontrolSatiri>(
    `${KONTROL_SECIMI} WHERE k.aktif AND k.sonraki_tarih <= current_date + $1::int ORDER BY k.sonraki_tarih, k.id LIMIT $2`,
    [gun, sinir],
  );
}

export async function kontrolSayilari(db: Db, yakinGun: number, bugunGun: number): Promise<{ gecen: number; yakin: number; bugun: number }> {
  const satir = await db.tek<{ gecen: number; yakin: number; bugun: number }>(
    `SELECT count(*) FILTER (WHERE sonraki_tarih < current_date)::int AS gecen,
            count(*) FILTER (WHERE sonraki_tarih >= current_date AND sonraki_tarih <= current_date + $1::int)::int AS yakin,
            count(*) FILTER (WHERE sonraki_tarih <= current_date + $2::int)::int AS bugun
       FROM idari_isler_kontrol WHERE aktif AND sonraki_tarih <= current_date + greatest($1::int, $2::int)`,
    [yakinGun, bugunGun],
  );
  return satir ?? { gecen: 0, yakin: 0, bugun: 0 };
}

export interface KontrolKaydiSatiri {
  id: number;
  yapilma: string;
  onceki_tarih: string;
  sonraki_tarih: string;
  belge_no: string | null;
  not_metni: string | null;
  miktar: string | null;
  birim: AtikBirimi | null;
  firma_id: number | null;
  kaydeden_kisi_id: number;
  kayit: string;
}

export function kontrolKayitlari(db: Db, kontrolId: number, sinir: number): Promise<KontrolKaydiSatiri[]> {
  return db.sorgu<KontrolKaydiSatiri>(
    `SELECT id, yapilma, onceki_tarih, sonraki_tarih, belge_no, not_metni, miktar, birim, firma_id, kaydeden_kisi_id, ${zamanMetni('kayit')} AS kayit
       FROM idari_isler_kontrol_kaydi WHERE kontrol_id = $1 ORDER BY yapilma DESC, id DESC LIMIT $2`,
    [kontrolId, sinir],
  );
}

export interface YemekSatiri {
  id: number;
  tarih: string;
  kadro: number;
  izinli: number;
  fazla_mesai: number;
  ziyaretci: number;
  duzeltme: number;
  duzeltme_nedeni: string | null;
  sayi: number;
  bildiren_kisi_id: number;
  bildirim: string;
}

const YEMEK_SECIM = `SELECT id, tarih, kadro, izinli, fazla_mesai, ziyaretci, duzeltme, duzeltme_nedeni, sayi, bildiren_kisi_id,
                            ${zamanMetni('bildirim')} AS bildirim
                       FROM idari_isler_yemek_bildirimi`;

export async function yemekBildirimiEkle(
  db: Db, v: { tarih: string; kadro: number; izinli: number; fazlaMesai: number; ziyaretci: number; duzeltme: number; neden: string | null; sayi: number },
  kisiId: number,
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO idari_isler_yemek_bildirimi (tarih, kadro, izinli, fazla_mesai, ziyaretci, duzeltme, duzeltme_nedeni, sayi, bildiren_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [v.tarih, v.kadro, v.izinli, v.fazlaMesai, v.ziyaretci, v.duzeltme, v.neden, v.sayi, kisiId],
  );
  if (satir === null) throw new Error('Yemek bildirimi yazılamadı');
  return satir.id;
}

// Günün geçerli bildirimi en son kayıttır.
export async function sonYemekBildirimi(db: Db, tarih: string): Promise<YemekSatiri | null> {
  return db.tek<YemekSatiri>(`${YEMEK_SECIM} WHERE tarih = $1 ORDER BY id DESC LIMIT 1`, [tarih]);
}

// Verilen günden önceki gunSayisi gündeki her günün son bildirimi, yeniden eskiye.
export async function yemekGecmisi(db: Db, tarih: string, gunSayisi: number): Promise<YemekSatiri[]> {
  return db.sorgu<YemekSatiri>(
    `SELECT DISTINCT ON (tarih) * FROM (${YEMEK_SECIM} WHERE tarih < $1::date AND tarih >= $1::date - $2::int) y
      ORDER BY tarih DESC, id DESC`,
    [tarih, gunSayisi],
  );
}

export async function bugunYemekBildirildiMi(db: Db): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>('SELECT EXISTS (SELECT 1 FROM idari_isler_yemek_bildirimi WHERE tarih = current_date) AS var');
  return satir?.var ?? false;
}

export interface AracSatiri {
  id: number;
  plaka: string;
  tur: AracTuru;
  marka_model: string | null;
  sahiplik: Sahiplik;
  durum: AracDurumu;
  km: number | null;
  sonraki_bakim_km: number | null;
  muayene_tarihi: string | null;
  sigorta_tarihi: string | null;
  sevkiyatta: boolean;
  aciklama: string | null;
  surum: number;
}

const ARAC_SECIM = `SELECT id, plaka, tur, marka_model, sahiplik, durum, km, sonraki_bakim_km, muayene_tarihi, sigorta_tarihi, sevkiyatta,
                           aciklama, surum
                      FROM idari_isler_arac`;

type AracYazimi = Omit<AracEkleVerisi, 'plaka'> & { plaka: string };

export async function aracEkle(db: Db, v: AracYazimi, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO idari_isler_arac (plaka, tur, marka_model, sahiplik, durum, km, sonraki_bakim_km, muayene_tarihi, sigorta_tarihi, sevkiyatta,
                                   aciklama, olusturan_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [v.plaka, v.tur, v.markaModel, v.sahiplik, v.durum, v.km, v.sonrakiBakimKm, v.muayeneTarihi, v.sigortaTarihi, v.sevkiyatta, v.aciklama, kisiId],
  );
  if (satir === null) throw new Error('Araç yazılamadı');
  return satir.id;
}

export async function aracGetir(db: Db, id: number): Promise<AracSatiri | null> {
  return db.tek<AracSatiri>(`${ARAC_SECIM} WHERE id = $1`, [id]);
}

export async function aracKilitle(db: Db, id: number): Promise<AracSatiri | null> {
  return db.tek<AracSatiri>(`${ARAC_SECIM} WHERE id = $1 FOR UPDATE`, [id]);
}

export async function aracVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek<{ id: number }>('SELECT id FROM idari_isler_arac WHERE id = $1', [id])) !== null;
}

// Plakayı başka araç tutuyor mu (kendisi hariç).
export async function plakaBaskasinda(db: Db, plaka: string, haric: number | null): Promise<boolean> {
  return (await db.tek<{ id: number }>('SELECT id FROM idari_isler_arac WHERE plaka = $1 AND id IS DISTINCT FROM $2', [plaka, haric])) !== null;
}

export async function aracGuncelle(db: Db, id: number, surum: number, v: AracYazimi): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_arac SET plaka = $3, tur = $4, marka_model = $5, sahiplik = $6, durum = $7, km = $8, sonraki_bakim_km = $9,
            muayene_tarihi = $10, sigorta_tarihi = $11, sevkiyatta = $12, aciklama = $13, surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, v.plaka, v.tur, v.markaModel, v.sahiplik, v.durum, v.km, v.sonrakiBakimKm, v.muayeneTarihi, v.sigortaTarihi, v.sevkiyatta, v.aciklama],
  );
}

// Etkin araçlar önce, pasifler sonda; plaka sırasıyla.
export async function araclar(db: Db, sinir: number): Promise<AracSatiri[]> {
  return db.sorgu<AracSatiri>(`${ARAC_SECIM} ORDER BY durum = 'pasif', plaka LIMIT $1`, [sinir]);
}

export interface GorevSatiri {
  id: number;
  talep_eden_kisi_id: number;
  amac: string;
  varis: string;
  tarih: string;
  donus_tarihi: string;
  aciklama: string | null;
  durum: GorevDurumu;
  talep: string;
  arac_id: number | null;
  plaka: string | null;
  onaylayan_kisi_id: number | null;
  onay: string | null;
  red_nedeni: string | null;
  cikis_km: number | null;
  cikis: string | null;
  donus_km: number | null;
  donus: string | null;
  kapanma: string | null;
  surum: number;
}

const GOREV_SECIM = `SELECT g.id, g.talep_eden_kisi_id, g.amac, g.varis, g.tarih, g.donus_tarihi, g.aciklama, g.durum, ${zamanMetni('g.talep')} AS talep,
                            g.arac_id, a.plaka, g.onaylayan_kisi_id, ${zamanMetni('g.onay')} AS onay, g.red_nedeni, g.cikis_km,
                            ${zamanMetni('g.cikis')} AS cikis, g.donus_km, ${zamanMetni('g.donus')} AS donus, ${zamanMetni('g.kapanma')} AS kapanma,
                            g.surum
                       FROM idari_isler_arac_gorevi g LEFT JOIN idari_isler_arac a ON a.id = g.arac_id`;

export async function gorevEkle(db: Db, g: AracTalebiAcVerisi, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO idari_isler_arac_gorevi (talep_eden_kisi_id, amac, varis, tarih, donus_tarihi, aciklama)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [kisiId, g.amac, g.varis, g.tarih, g.donusTarihi, g.aciklama],
  );
  if (satir === null) throw new Error('Araç görevi yazılamadı');
  return satir.id;
}

export function gorevGetir(db: Db, id: number): Promise<GorevSatiri | null> {
  return db.tek<GorevSatiri>(`${GOREV_SECIM} WHERE g.id = $1`, [id]);
}

export interface GorevKilidi {
  durum: GorevDurumu; talep_eden_kisi_id: number; arac_id: number | null; cikis_km: number | null; tarih: string; donus_tarihi: string;
}
export function gorevKilitle(db: Db, id: number): Promise<GorevKilidi | null> {
  return db.tek<GorevKilidi>(
    'SELECT durum, talep_eden_kisi_id, arac_id, cikis_km, tarih, donus_tarihi FROM idari_isler_arac_gorevi WHERE id = $1 FOR UPDATE',
    [id],
  );
}

export async function gorevVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM idari_isler_arac_gorevi WHERE id = $1', [id])) !== null;
}

export function gorevOnayYaz(db: Db, id: number, surum: number, aracId: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_arac_gorevi SET durum = 'onaylandi', arac_id = $3, onaylayan_kisi_id = $4, onay = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, aracId, kisiId],
  );
}

// Red ve geri çekme görevi kapatır; red nedeni yalnız redde yazılır.
export function gorevKapanisYaz(
  db: Db, id: number, surum: number, hedef: 'reddedildi' | 'geri_cekildi', kisiId: number, neden: string | null,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_arac_gorevi SET durum = $3, red_nedeni = $5, kapatan_kisi_id = $4, kapanma = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, hedef, kisiId, neden],
  );
}

export function gorevCikisYaz(db: Db, id: number, surum: number, km: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_arac_gorevi SET durum = 'yolda', cikis_km = $3, cikis = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, km],
  );
}

export function gorevDonusYaz(db: Db, id: number, surum: number, km: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_arac_gorevi SET durum = 'tamamlandi', donus_km = $3, donus = now(), kapatan_kisi_id = $4, kapanma = now(),
            surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, km, kisiId],
  );
}

// IDR-25: aracın bu tarihlerle kesişen başka onaylı ya da yoldaki görevi.
export async function aracCakisiyorMu(db: Db, aracId: number, tarih: string, donusTarihi: string, haric: number): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM idari_isler_arac_gorevi
        WHERE arac_id = $1 AND durum IN ('onaylandi', 'yolda') AND id <> $4 AND tarih <= $3::date AND donus_tarihi >= $2::date
     ) AS var`,
    [aracId, tarih, donusTarihi, haric],
  );
  return satir?.var ?? false;
}

export async function aracYoldaBaskaGorevVarMi(db: Db, aracId: number, haric: number): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM idari_isler_arac_gorevi WHERE arac_id = $1 AND durum = 'yolda' AND id <> $2) AS var`,
    [aracId, haric],
  );
  return satir?.var ?? false;
}

// Görev aracın km'sini ve durumunu yazar; araç satırı çağıranın işleminde kilitlidir, kartı açık olan ekran eski sürüm uyarısı alır.
export async function aracGorevYaz(db: Db, aracId: number, km: number, durum: AracDurumu): Promise<void> {
  await db.sorgu('UPDATE idari_isler_arac SET km = GREATEST(coalesce(km, 0), $2), durum = $3, surum = surum + 1 WHERE id = $1', [aracId, km, durum]);
}

// Açık görevler (bekleyen, onaylı, yolda) önce, sonra son kapananlar; açıklar gidiş tarihine, kapananlar en yeniden.
export function gorevler(db: Db, kapananGun: number, sinir: number): Promise<GorevSatiri[]> {
  return db.sorgu<GorevSatiri>(
    `${GOREV_SECIM}
      WHERE g.durum IN ('bekliyor', 'onaylandi', 'yolda') OR g.kapanma >= now() - make_interval(days => $1)
      ORDER BY g.durum IN ('tamamlandi', 'reddedildi', 'geri_cekildi'),
               CASE WHEN g.durum IN ('tamamlandi', 'reddedildi', 'geri_cekildi') THEN NULL ELSE g.tarih END, g.kapanma DESC, g.id
      LIMIT $2`,
    [kapananGun, sinir],
  );
}

export function kendiGorevleri(db: Db, kisiId: number, sinir: number): Promise<GorevSatiri[]> {
  return db.sorgu<GorevSatiri>(`${GOREV_SECIM} WHERE g.talep_eden_kisi_id = $1 ORDER BY g.id DESC LIMIT $2`, [kisiId, sinir]);
}

export async function gorevSayilari(db: Db, kisiId: number): Promise<{ bekleyen: number; kendi: number }> {
  const satir = await db.tek<{ bekleyen: number; kendi: number }>(
    `SELECT count(*) FILTER (WHERE durum = 'bekliyor')::int AS bekleyen,
            count(*) FILTER (WHERE talep_eden_kisi_id = $1 AND durum IN ('bekliyor', 'onaylandi', 'yolda'))::int AS kendi
       FROM idari_isler_arac_gorevi`,
    [kisiId],
  );
  return satir ?? { bekleyen: 0, kendi: 0 };
}

export interface MasrafSatiri {
  id: number;
  arac_id: number;
  tarih: string;
  tur: MasrafTuru;
  tutar: string;
  km: number | null;
  belge_no: string | null;
  aciklama: string | null;
  kaydeden_kisi_id: number;
  kayit: string;
  iptal: string | null;
  iptal_nedeni: string | null;
  surum: number;
}

const MASRAF_SECIM = `SELECT id, arac_id, tarih, tur, tutar::text AS tutar, km, belge_no, aciklama, kaydeden_kisi_id, ${zamanMetni('kayit')} AS kayit,
                             ${zamanMetni('iptal')} AS iptal, iptal_nedeni, surum
                        FROM idari_isler_arac_masrafi`;

export async function masrafEkle(db: Db, aracId: number, g: MasrafEkleVerisi, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO idari_isler_arac_masrafi (arac_id, tarih, tur, tutar, km, belge_no, aciklama, kaydeden_kisi_id)
     VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, $8) RETURNING id`,
    [aracId, g.tarih, g.tur, g.tutar, g.km, g.belgeNo, g.aciklama, kisiId],
  );
  if (satir === null) throw new Error('Masraf yazılamadı');
  return satir.id;
}

export function masrafGetir(db: Db, id: number): Promise<MasrafSatiri | null> {
  return db.tek<MasrafSatiri>(`${MASRAF_SECIM} WHERE id = $1`, [id]);
}

export function masrafKilitle(db: Db, id: number): Promise<{ iptal: string | null } | null> {
  return db.tek<{ iptal: string | null }>('SELECT iptal::text AS iptal FROM idari_isler_arac_masrafi WHERE id = $1 FOR UPDATE', [id]);
}

export async function masrafVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM idari_isler_arac_masrafi WHERE id = $1', [id])) !== null;
}

export function masrafIptalYaz(db: Db, id: number, surum: number, kisiId: number, neden: string): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_arac_masrafi SET iptal_eden_kisi_id = $3, iptal = now(), iptal_nedeni = $4, surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, kisiId, neden],
  );
}

export function aracMasraflari(db: Db, aracId: number, sinir: number): Promise<MasrafSatiri[]> {
  return db.sorgu<MasrafSatiri>(`${MASRAF_SECIM} WHERE arac_id = $1 ORDER BY tarih DESC, id DESC LIMIT $2`, [aracId, sinir]);
}

// Bu yılın iptal edilmemiş masrafları; kayıt yoksa null (sıfır uydurulmaz).
export async function aracYilToplami(db: Db, aracId: number): Promise<string | null> {
  const satir = await db.tek<{ toplam: string | null }>(
    `SELECT sum(tutar)::text AS toplam FROM idari_isler_arac_masrafi
      WHERE arac_id = $1 AND iptal IS NULL AND tarih >= date_trunc('year', current_date)::date`,
    [aracId],
  );
  return satir?.toplam ?? null;
}

export interface DemirbasSatiri {
  id: number;
  tur: DemirbasTuru;
  marka_model: string | null;
  seri_no: string | null;
  deger: string | null;
  durum: DemirbasDurumu;
  aciklama: string | null;
  surum: number;
}

export interface ZimmetSatiri {
  id: number;
  demirbas_id: number;
  kisi_id: number | null;
  personel_adi: string | null;
  verilis: string | null;
  iade: string | null;
  iade_durumu: IadeDurumu | null;
  iade_notu: string | null;
  aciklama: string | null;
  veren_kisi_id: number;
  iade_alan_kisi_id: number | null;
  ikden_tasindi: boolean;
  surum: number;
}

const DEMIRBAS_SECIM = `SELECT id, tur, marka_model, seri_no, deger::text AS deger, durum, aciklama, surum FROM idari_isler_demirbas`;
const ZIMMET_SECIM = `SELECT id, demirbas_id, kisi_id, personel_adi, verilis, iade, iade_durumu, iade_notu, aciklama, veren_kisi_id, iade_alan_kisi_id,
                             kaynak_ik_kimlik IS NOT NULL AS ikden_tasindi, surum
                        FROM idari_isler_zimmet`;

export async function demirbasEkle(db: Db, v: DemirbasEkleVerisi, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO idari_isler_demirbas (tur, marka_model, seri_no, deger, aciklama, olusturan_kisi_id)
     VALUES ($1, $2, $3, $4::numeric, $5, $6) RETURNING id`,
    [v.tur, v.markaModel, v.seriNo, v.deger, v.aciklama, kisiId],
  );
  if (satir === null) throw new Error('Demirbaş yazılamadı');
  return satir.id;
}

export function demirbasGetir(db: Db, id: number): Promise<DemirbasSatiri | null> {
  return db.tek<DemirbasSatiri>(`${DEMIRBAS_SECIM} WHERE id = $1`, [id]);
}

export function demirbasKilitle(db: Db, id: number): Promise<{ durum: DemirbasDurumu } | null> {
  return db.tek<{ durum: DemirbasDurumu }>('SELECT durum FROM idari_isler_demirbas WHERE id = $1 FOR UPDATE', [id]);
}

export async function demirbasVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM idari_isler_demirbas WHERE id = $1', [id])) !== null;
}

export function demirbasGuncelle(
  db: Db, id: number, surum: number, v: DemirbasEkleVerisi & { durum: DemirbasDurumu },
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_demirbas SET tur = $3, marka_model = $4, seri_no = $5, deger = $6::numeric, aciklama = $7, durum = $8, surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, v.tur, v.markaModel, v.seriNo, v.deger, v.aciklama, v.durum],
  );
}

// Zimmet ve iade demirbaşın durumunu aynı işlemde yazar; sürüm kilidi komutun kendi kaydındadır.
export async function demirbasDurumYaz(db: Db, id: number, durum: DemirbasDurumu): Promise<void> {
  await db.sorgu('UPDATE idari_isler_demirbas SET durum = $2, surum = surum + 1 WHERE id = $1', [id, durum]);
}

export function demirbasSurumluDurumYaz(db: Db, id: number, surum: number, durum: DemirbasDurumu): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>('UPDATE idari_isler_demirbas SET durum = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum, durum]);
}

export function demirbaslar(db: Db, sinir: number): Promise<DemirbasSatiri[]> {
  return db.sorgu<DemirbasSatiri>(`${DEMIRBAS_SECIM} ORDER BY id DESC LIMIT $1`, [sinir]);
}

export async function zimmetEkle(db: Db, demirbasId: number, v: ZimmetleVerisi, verenKisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO idari_isler_zimmet (demirbas_id, kisi_id, verilis, aciklama, veren_kisi_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [demirbasId, v.kisiId, v.verilis, v.aciklama, verenKisiId],
  );
  if (satir === null) throw new Error('Zimmet yazılamadı');
  return satir.id;
}

export function zimmetGetir(db: Db, id: number): Promise<ZimmetSatiri | null> {
  return db.tek<ZimmetSatiri>(`${ZIMMET_SECIM} WHERE id = $1`, [id]);
}

export function zimmetKilitle(db: Db, id: number): Promise<ZimmetSatiri | null> {
  return db.tek<ZimmetSatiri>(`${ZIMMET_SECIM} WHERE id = $1 FOR UPDATE`, [id]);
}

export async function zimmetVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM idari_isler_zimmet WHERE id = $1', [id])) !== null;
}

export function zimmetIadeYaz(
  db: Db, id: number, surum: number, v: { iade: string; iadeDurumu: IadeDurumu; iadeNotu: string | null }, kisiId: number,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE idari_isler_zimmet SET iade = $3, iade_durumu = $4, iade_notu = $5, iade_alan_kisi_id = $6, surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, v.iade, v.iadeDurumu, v.iadeNotu, kisiId],
  );
}

export function zimmetKisiYaz(db: Db, id: number, surum: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    'UPDATE idari_isler_zimmet SET kisi_id = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 AND kisi_id IS NULL RETURNING id',
    [id, surum, kisiId],
  );
}

export function acikZimmetler(db: Db, demirbasIdleri: number[]): Promise<ZimmetSatiri[]> {
  return db.sorgu<ZimmetSatiri>(`${ZIMMET_SECIM} WHERE iade IS NULL AND demirbas_id = ANY($1::int[])`, [demirbasIdleri]);
}

export function demirbasZimmetleri(db: Db, demirbasId: number): Promise<ZimmetSatiri[]> {
  return db.sorgu<ZimmetSatiri>(`${ZIMMET_SECIM} WHERE demirbas_id = $1 ORDER BY id DESC`, [demirbasId]);
}

export interface KisiZimmetSatiri {
  kisi_id: number;
  demirbas_id: number;
  tur: DemirbasTuru;
  marka_model: string | null;
  seri_no: string | null;
  verilis: string | null;
}

export function kisilerinAcikZimmetleri(db: Db, kisiIdleri: number[]): Promise<KisiZimmetSatiri[]> {
  return db.sorgu<KisiZimmetSatiri>(
    `SELECT z.kisi_id, z.demirbas_id, d.tur, d.marka_model, d.seri_no, z.verilis
       FROM idari_isler_zimmet z JOIN idari_isler_demirbas d ON d.id = z.demirbas_id
      WHERE z.iade IS NULL AND z.kisi_id = ANY($1::int[])
      ORDER BY z.kisi_id, z.id`,
    [kisiIdleri],
  );
}
