import type { Db } from '#cekirdek/db.ts';
import { LOGO_FIS_TURLERI } from './kurallar.ts';
import type { FaturaKaydi, FisGidenDurumu, ListeKaydi, LogoFisTuru, MalKabulSatiri } from './kurallar.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';

// Belge no sahibi modüldeki kimliktir: kart no, sipariş, talep ya da sipariş satırı kimliği; adım türleri (güncelleme, kapatma, iptal) aynı belgenin ayrı izidir.
export type FisTuru = LogoFisTuru;
export type BelgeTuru = 'malzeme' | 'hizmet' | 'malzeme-guncelleme' | 'siparis' | 'siparis-guncelleme' | 'siparis-kapatma' | 'siparis-iptal' | 'talep' | 'karsilama' | 'satis-teklifi' | 'satis-siparisi'
  | 'siparisler-teklifi' | 'siparisler-siparisi' | FisTuru;
export type GidenSonucu = 'gonderildi' | 'zaten-vardi' | 'silindi' | 'reddedildi' | 'yetkisiz' | 'ulasilamadi' | 'belirsiz' | 'yazilamadi';

export interface GidenSatiri {
  belgeNo: number;
  niyetZamani: Date | null;
  denemeSayisi: number;
  ardisikHata: number;
  sonDeneme: Date | null;
  sonSonuc: GidenSonucu | null;
  sonHata: string | null;
  sonrakiDeneme: Date | null;
  logoKayitNo: string | null;
}

const ALANLAR = `belge_no AS "belgeNo", niyet_zamani AS "niyetZamani", deneme_sayisi AS "denemeSayisi", ardisik_hata AS "ardisikHata",
  son_deneme AS "sonDeneme", son_sonuc AS "sonSonuc", son_hata AS "sonHata", sonraki_deneme AS "sonrakiDeneme", logo_kayit_no AS "logoKayitNo"`;

// Malzeme fişleri logo_giden'in kısıtını genişletmeden (dolu tablo) kendi giden kutusundadır; sütunlar aynıdır. Tablo adı sabittir, dışarıdan gelmez.
const tablo = (belgeTuru: BelgeTuru): 'logo_giden' | 'logo_malzeme_fisi_giden' =>
  (LOGO_FIS_TURLERI as readonly string[]).includes(belgeTuru) ? 'logo_malzeme_fisi_giden' : 'logo_giden';

export function gidenSatirlari(db: Db, belgeTuru: BelgeTuru, nolar: readonly number[]): Promise<GidenSatiri[]> {
  return db.sorgu<GidenSatiri>(`SELECT ${ALANLAR} FROM ${tablo(belgeTuru)} WHERE belge_turu = $1 AND belge_no = ANY($2::int[])`, [belgeTuru, nolar]);
}

export function gidenSatiri(db: Db, belgeTuru: BelgeTuru, no: number): Promise<GidenSatiri | null> {
  return db.tek<GidenSatiri>(`SELECT ${ALANLAR} FROM ${tablo(belgeTuru)} WHERE belge_turu = $1 AND belge_no = $2`, [belgeTuru, no]);
}

// Niyet: bu belge için açma isteği gidecek. Transaction bitince kalıcıdır; istek bir sonraki turda gider.
export async function niyetYaz(db: Db, belgeTuru: BelgeTuru, no: number, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO ${tablo(belgeTuru)} (belge_turu, belge_no, niyet_zamani) VALUES ($1, $2, $3)
     ON CONFLICT (belge_turu, belge_no) DO UPDATE SET niyet_zamani = EXCLUDED.niyet_zamani`,
    [belgeTuru, no, zaman],
  );
}

export interface DenemeSonucu {
  zaman: Date;
  sonuc: GidenSonucu;
  hata: string | null;
  logoKayitNo: string | null;
  // undefined: niyet olduğu gibi kalır; null: boşalır (sonuç kesin); Date: yenilenir (yeni belirsiz istek).
  niyetZamani: Date | null | undefined;
  sonrakiDeneme: Date | null;
  basarili: boolean;
}

export async function denemeYaz(db: Db, belgeTuru: BelgeTuru, no: number, d: DenemeSonucu): Promise<void> {
  await db.sorgu(
    `INSERT INTO ${tablo(belgeTuru)} AS g (belge_turu, belge_no, niyet_zamani, deneme_sayisi, ardisik_hata, son_deneme, son_sonuc, son_hata, sonraki_deneme, logo_kayit_no)
     VALUES ($1, $2, CASE WHEN $8 THEN $9::timestamptz END, 1, CASE WHEN $10 THEN 0 ELSE 1 END, $3, $4, $5, $6, $7)
     ON CONFLICT (belge_turu, belge_no) DO UPDATE SET
       niyet_zamani = CASE WHEN $8 THEN $9::timestamptz ELSE g.niyet_zamani END,
       deneme_sayisi = g.deneme_sayisi + 1,
       ardisik_hata = CASE WHEN $10 THEN 0 ELSE g.ardisik_hata + 1 END,
       son_deneme = $3, son_sonuc = $4, son_hata = $5, sonraki_deneme = $6, logo_kayit_no = $7`,
    [belgeTuru, no, d.zaman, d.sonuc, d.hata, d.sonrakiDeneme, d.logoKayitNo, d.niyetZamani !== undefined, d.niyetZamani ?? null, d.basarili],
  );
}

/* ---------------- Birim seti listesi (LB6 c, LB11 a) ---------------- */

export interface BirimSetiSatiri {
  kod: string;
  ad: string | null;
  elle: boolean;
  kopruListesinde: boolean;
}

export function birimSetleri(db: Db): Promise<BirimSetiSatiri[]> {
  return db.sorgu<BirimSetiSatiri>(
    'SELECT kod, ad, elle, kopru_listesinde AS "kopruListesinde" FROM logo_birim_seti ORDER BY kod',
  );
}

export function birimSetiOkumasi(db: Db): Promise<{ sonOkuma: string; sonOkumaAn: Date } | null> {
  return db.tek<{ sonOkuma: string; sonOkumaAn: Date }>(
    `SELECT ${zamanMetni('son_okuma')} AS "sonOkuma", son_okuma AS "sonOkumaAn" FROM logo_birim_seti_okuma`,
  );
}

export async function birimSetiElleYaz(db: Db, kod: string, ad: string | null, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO logo_birim_seti (kod, ad, elle, ekleyen_kisi_id) VALUES ($1, $2, true, $3)
     ON CONFLICT (kod) DO UPDATE SET elle = true, ad = COALESCE(EXCLUDED.ad, logo_birim_seti.ad), ekleyen_kisi_id = EXCLUDED.ekleyen_kisi_id, guncelleme = now()`,
    [kod, ad, kisiId],
  );
}

export function birimSetiKilitle(db: Db, kod: string): Promise<BirimSetiSatiri | null> {
  return db.tek<BirimSetiSatiri>(
    'SELECT kod, ad, elle, kopru_listesinde AS "kopruListesinde" FROM logo_birim_seti WHERE kod = $1 FOR UPDATE',
    [kod],
  );
}

// Elle işareti kalkar; köprü listesinde olmayan satır silinir.
export async function birimSetiElleKaldir(db: Db, kod: string): Promise<void> {
  await db.sorgu('DELETE FROM logo_birim_seti WHERE kod = $1 AND NOT kopru_listesinde', [kod]);
  await db.sorgu('UPDATE logo_birim_seti SET elle = false, ekleyen_kisi_id = NULL, guncelleme = now() WHERE kod = $1', [kod]);
}

// Köprünün listesi gelince: listede olanlar işaretlenir (adı köprüden), olmayanların işareti kalkar, ne elle ne köprüde olan silinir.
export async function kopruListesiniYaz(db: Db, setler: readonly { kod: string; ad: string | null }[], zaman: Date): Promise<void> {
  const kodlar = setler.map((s) => s.kod);
  await db.sorgu(
    `INSERT INTO logo_birim_seti (kod, ad, kopru_listesinde)
     SELECT k, a, true FROM unnest($1::text[], $2::text[]) AS t(k, a)
     ON CONFLICT (kod) DO UPDATE SET kopru_listesinde = true, ad = COALESCE(EXCLUDED.ad, logo_birim_seti.ad), guncelleme = now()`,
    [kodlar, setler.map((s) => s.ad)],
  );
  await db.sorgu('UPDATE logo_birim_seti SET kopru_listesinde = false, guncelleme = now() WHERE kopru_listesinde AND NOT (kod = ANY($1::text[]))', [kodlar]);
  await db.sorgu('DELETE FROM logo_birim_seti WHERE NOT elle AND NOT kopru_listesinde');
  await db.sorgu(
    `INSERT INTO logo_birim_seti_okuma (tek, son_okuma, sayi) VALUES (true, $1, $2)
     ON CONFLICT (tek) DO UPDATE SET son_okuma = EXCLUDED.son_okuma, sayi = EXCLUDED.sayi`,
    [zaman, kodlar.length],
  );
}

/* ---------------- Bağlantı hazırlığı ---------------- */

export interface GidenOzeti {
  belgeTuru: BelgeTuru;
  gonderilen: number;
  hatali: number;
  sonDeneme: string | null;
}

// Belge türü başına son sonuç: Logo'da açılmış (ya da zaten vardı) ve son denemesi başarısız olan kayıt sayısı.
export function gidenOzetleri(db: Db): Promise<GidenOzeti[]> {
  return db.sorgu<GidenOzeti>(
    `SELECT belge_turu AS "belgeTuru",
       count(*) FILTER (WHERE son_sonuc IN ('gonderildi', 'zaten-vardi'))::int AS gonderilen,
       count(*) FILTER (WHERE son_sonuc IS NOT NULL AND son_sonuc NOT IN ('gonderildi', 'zaten-vardi'))::int AS hatali,
       ${zamanMetni('max(son_deneme)')} AS "sonDeneme"
     FROM (SELECT belge_turu, son_sonuc, son_deneme FROM logo_giden UNION ALL SELECT belge_turu, son_sonuc, son_deneme FROM logo_malzeme_fisi_giden) g GROUP BY belge_turu`,
  );
}

/* ---------------- Okuma akışları: yalnız saklanır ---------------- */

export function malKabulImleci(db: Db): Promise<{ sonRef: number; sonOkuma: string; sonOkumaAn: Date } | null> {
  return db.tek<{ sonRef: number; sonOkuma: string; sonOkumaAn: Date }>(
    `SELECT son_ref AS "sonRef", ${zamanMetni('son_okuma')} AS "sonOkuma", son_okuma AS "sonOkumaAn" FROM logo_mal_kabul_imleci`,
  );
}

// Satır kaydı tekildir: yinelenen okuma ikinci satır açmaz. İmleç yalnız ileri gider.
export async function malKabulYaz(db: Db, satirlar: readonly MalKabulSatiri[], zaman: Date): Promise<void> {
  if (satirlar.length > 0) {
    await db.sorgu(
      `INSERT INTO logo_mal_kabul_satiri (logical_ref, siparis_satir_ref, siparis_fis_ref, fis_no, malzeme_kodu, miktar, birim, ham, okuma_zamani)
       SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::bigint[], $4::text[], $5::text[], $6::numeric[], $7::text[], $8::jsonb[], $9::timestamptz[])
       ON CONFLICT (logical_ref) DO NOTHING`,
      [
        satirlar.map((x) => x.kayitNo), satirlar.map((x) => x.siparisSatirRef), satirlar.map((x) => x.siparisFisRef), satirlar.map((x) => x.fisNo),
        satirlar.map((x) => x.malzemeKodu), satirlar.map((x) => x.miktar), satirlar.map((x) => x.birim), satirlar.map((x) => JSON.stringify(x.ham)),
        satirlar.map(() => zaman),
      ],
    );
  }
  await db.sorgu(
    `INSERT INTO logo_mal_kabul_imleci (tek, son_ref, son_okuma) VALUES (true, $1, $2)
     ON CONFLICT (tek) DO UPDATE SET son_ref = GREATEST(logo_mal_kabul_imleci.son_ref, EXCLUDED.son_ref), son_okuma = EXCLUDED.son_okuma`,
    [satirlar.reduce((en, x) => Math.max(en, x.kayitNo), 0), zaman],
  );
}

export function listeOkumasi(db: Db, liste: 'cari' | 'ambar'): Promise<{ sonOkumaAn: Date } | null> {
  return db.tek<{ sonOkumaAn: Date }>('SELECT son_okuma AS "sonOkumaAn" FROM logo_liste_okuma WHERE liste = $1', [liste]);
}

// Önbellek listenin aynasıdır: listede olmayan kod silinir; boş cevap (okuma kazası olabilir) önbelleği boşaltmaz.
export async function listeYaz(db: Db, liste: 'cari' | 'ambar', kayitlar: readonly ListeKaydi[], zaman: Date): Promise<void> {
  const kodlar = kayitlar.map((k) => k.kod);
  if (kayitlar.length > 0) {
    const gir = liste === 'cari'
      ? 'INSERT INTO logo_cari (kod, ad, son_okuma) SELECT k, a, $3 FROM unnest($1::text[], $2::text[]) AS t(k, a) ON CONFLICT (kod) DO UPDATE SET ad = EXCLUDED.ad, son_okuma = EXCLUDED.son_okuma'
      : 'INSERT INTO logo_ambar (kod, ad, son_okuma) SELECT k, a, $3 FROM unnest($1::text[], $2::text[]) AS t(k, a) ON CONFLICT (kod) DO UPDATE SET ad = EXCLUDED.ad, son_okuma = EXCLUDED.son_okuma';
    await db.sorgu(gir, [kodlar, kayitlar.map((k) => k.ad), zaman]);
    await db.sorgu(liste === 'cari' ? 'DELETE FROM logo_cari WHERE NOT (kod = ANY($1::text[]))' : 'DELETE FROM logo_ambar WHERE NOT (kod = ANY($1::text[]))', [kodlar]);
  }
  await db.sorgu(
    `INSERT INTO logo_liste_okuma (liste, son_okuma, sayi) VALUES ($1, $2, $3)
     ON CONFLICT (liste) DO UPDATE SET son_okuma = EXCLUDED.son_okuma, sayi = EXCLUDED.sayi`,
    [liste, zaman, kodlar.length],
  );
}

// Fatura okuması siparişin numarasıyla gider; numarayı sipariş Logo'ya giderken buraya yazılır (logo_giden yalnız kimliği tutar).
export async function siparisNoYaz(db: Db, belgeNo: number, siparisNo: string): Promise<void> {
  await db.sorgu('INSERT INTO logo_siparis_no (belge_no, siparis_no) VALUES ($1, $2) ON CONFLICT (belge_no) DO UPDATE SET siparis_no = EXCLUDED.siparis_no', [belgeNo, siparisNo]);
}

// Logo'da açılmış siparişlerden okuması en eski olan (hiç okunmayan önce); `eskiden` öncesinde okunmuş ya da hiç okunmamış olanlar.
export function faturaSiparisleri(db: Db, eskiden: Date, sinir: number): Promise<{ siparisNo: string }[]> {
  return db.sorgu<{ siparisNo: string }>(
    `SELECT n.siparis_no AS "siparisNo"
     FROM logo_giden g
     JOIN logo_siparis_no n ON n.belge_no = g.belge_no
     LEFT JOIN logo_fatura_okuma o ON o.siparis_no = n.siparis_no
     WHERE g.belge_turu = 'siparis' AND g.son_sonuc IN ('gonderildi', 'zaten-vardi') AND g.logo_kayit_no IS NOT NULL
       AND (o.son_okuma IS NULL OR o.son_okuma <= $1)
     ORDER BY o.son_okuma NULLS FIRST, n.belge_no
     LIMIT $2`,
    [eskiden, sinir],
  );
}

export async function faturaYaz(db: Db, siparisNo: string, faturalar: readonly FaturaKaydi[], zaman: Date): Promise<void> {
  if (faturalar.length > 0) {
    await db.sorgu(
      `INSERT INTO logo_fatura (siparis_no, anahtar, fatura_no, ham, okuma_zamani)
       SELECT $1, a, n, h, $5 FROM unnest($2::text[], $3::text[], $4::jsonb[]) AS t(a, n, h)
       ON CONFLICT (siparis_no, anahtar) DO UPDATE SET fatura_no = EXCLUDED.fatura_no, ham = EXCLUDED.ham, okuma_zamani = EXCLUDED.okuma_zamani`,
      [siparisNo, faturalar.map((f) => f.anahtar), faturalar.map((f) => f.faturaNo), faturalar.map((f) => JSON.stringify(f.ham)), zaman],
    );
  }
  await db.sorgu(
    `INSERT INTO logo_fatura_okuma (siparis_no, son_okuma, sayi) VALUES ($1, $2, $3)
     ON CONFLICT (siparis_no) DO UPDATE SET son_okuma = EXCLUDED.son_okuma, sayi = EXCLUDED.sayi`,
    [siparisNo, zaman, faturalar.length],
  );
}

// Reddedilen sipariş sırayı tıkamasın: okuma denendi diye işaretlenir, sayı değişmez.
export async function faturaDenemesiYaz(db: Db, siparisNo: string, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO logo_fatura_okuma (siparis_no, son_okuma, sayi) VALUES ($1, $2, 0)
     ON CONFLICT (siparis_no) DO UPDATE SET son_okuma = EXCLUDED.son_okuma`,
    [siparisNo, zaman],
  );
}

export interface OkumaOzeti {
  malKabul: number;
  malKabulSon: string | null;
  cariAmbar: number;
  cariAmbarSon: string | null;
  fatura: number;
  faturaSon: string | null;
}

export async function okumaOzeti(db: Db): Promise<OkumaOzeti> {
  const r = await db.tek<OkumaOzeti>(
    `SELECT (SELECT count(*) FROM logo_mal_kabul_satiri)::int AS "malKabul",
            (SELECT ${zamanMetni('son_okuma')} FROM logo_mal_kabul_imleci) AS "malKabulSon",
            (SELECT coalesce(sum(sayi), 0) FROM logo_liste_okuma)::int AS "cariAmbar",
            (SELECT ${zamanMetni('max(son_okuma)')} FROM logo_liste_okuma) AS "cariAmbarSon",
            (SELECT count(*) FROM logo_fatura)::int AS "fatura",
            (SELECT ${zamanMetni('max(son_okuma)')} FROM logo_fatura_okuma) AS "faturaSon"`,
  );
  if (!r) throw new Error('Okuma özeti okunamadı.');
  return r;
}

// Stoğun fiş değişiklik akışında kalınan yer (göçle tek satır açılır).
export interface FisImleci { zaman: string; fisId: number; enBuyukFisId: number }
export function fisImleci(db: Db): Promise<FisImleci | null> {
  return db.tek<FisImleci>(`SELECT ${zamanMetni('zaman')} AS zaman, fis_id AS "fisId", en_buyuk_fis_id AS "enBuyukFisId" FROM logo_malzeme_fisi_imleci`);
}
// İmleç yalnız ileri gider; karşılaştırma veritabanında mikrosaniyeyle (JS Date milisaniyeye kırpar, aynı milisaniyedeki fiş imleci durdururdu).
export async function fisImleciYaz(db: Db, i: FisImleci): Promise<void> {
  await db.sorgu(`UPDATE logo_malzeme_fisi_imleci SET
      zaman = CASE WHEN ($1::timestamptz, $2::int) > (zaman, fis_id) THEN $1::timestamptz ELSE zaman END,
      fis_id = CASE WHEN ($1::timestamptz, $2::int) > (zaman, fis_id) THEN $2::int ELSE fis_id END,
      en_buyuk_fis_id = GREATEST(en_buyuk_fis_id, $3)`, [i.zaman, i.fisId, i.enBuyukFisId]);
}

// Stok fişinin yeni sayacı: artış bekleyen değişikliğe eklenir. Aynı değişiklik ikinci kez okunursa (imlecin örtüşme penceresi) sayılmaz.
export async function fisDegisikligiYaz(db: Db, tur: FisTuru, id: number, degisiklik: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO logo_malzeme_fisi_giden AS g (belge_turu, belge_no, kaynak_degisiklik, bekleyen_degisiklik) VALUES ($1, $2, $3, $3)
     ON CONFLICT (belge_turu, belge_no) DO UPDATE SET
       bekleyen_degisiklik = g.bekleyen_degisiklik + GREATEST(EXCLUDED.kaynak_degisiklik - g.kaynak_degisiklik, 0),
       kaynak_degisiklik = GREATEST(g.kaynak_degisiklik, EXCLUDED.kaynak_degisiklik)`,
    [tur, id, degisiklik],
  );
}

// Fişi bir kez daha eşitlemeye işaretler (fire gönderimi kapalıyken fire değişince emrin sarf fişi).
export async function fisIsaretle(db: Db, tur: FisTuru, id: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO logo_malzeme_fisi_giden AS g (belge_turu, belge_no, bekleyen_degisiklik) VALUES ($1, $2, 1)
     ON CONFLICT (belge_turu, belge_no) DO UPDATE SET bekleyen_degisiklik = g.bekleyen_degisiklik + 1`,
    [tur, id],
  );
}

// Stokta yeni elle gönderim isteği ("Gönder", "Yeniden gönder"): fiş beklemeden ve önceki niyeti bırakarak sıraya girer. Niyetin
// bırakılması, sonucu bilinmeyen eski isteğe rağmen yeniden göndermedir; ekran bunu kullanıcıya söyler (295 a).
export async function fisIstegiYaz(db: Db, tur: FisTuru, id: number, istek: string): Promise<void> {
  await db.sorgu(
    `UPDATE logo_malzeme_fisi_giden SET son_istek = $3, istek_bekliyor = true, niyet_zamani = NULL, sonraki_deneme = NULL,
            bekleyen_degisiklik = GREATEST(bekleyen_degisiklik, 1)
      WHERE belge_turu = $1 AND belge_no = $2 AND (son_istek IS NULL OR son_istek < $3)`,
    [tur, id, istek],
  );
}

// Elle isteği sonuçlandı (gönderildi, eşitlendi ya da başarısız): elle türde fiş yeni istek gelene kadar beklemez.
export async function fisIstegiKapat(db: Db, tur: FisTuru, id: number): Promise<void> {
  await db.sorgu('UPDATE logo_malzeme_fisi_giden SET istek_bekliyor = false WHERE belge_turu = $1 AND belge_no = $2 AND istek_bekliyor', [tur, id]);
}

// Logo'yla eşitlenecek fişler: otomatik türde bekleyen her fiş, elle türde yalnız isteği olan. Zamanı gelenler önce, sonra eski fiş.
export function malzemeFisiKuyrugu(db: Db, a: { otomatik: readonly FisTuru[]; elle: readonly FisTuru[]; sinir: number }): Promise<{ tur: FisTuru; id: number }[]> {
  return db.sorgu<{ tur: FisTuru; id: number }>(
    `SELECT belge_turu AS tur, belge_no AS id
       FROM logo_malzeme_fisi_giden
      WHERE bekleyen_degisiklik > 0 AND (belge_turu = ANY($1::text[]) OR (belge_turu = ANY($2::text[]) AND istek_bekliyor))
      ORDER BY sonraki_deneme NULLS FIRST, belge_no, belge_turu LIMIT $3`,
    [[...a.otomatik], [...a.elle], a.sinir],
  );
}

// Stoğun sorduğu fişlerin giden kutusu satırları (durum ekranı).
export async function fisGidenDurumlari(db: Db, fisler: readonly { tur: FisTuru; id: number }[]): Promise<Map<string, FisGidenDurumu>> {
  if (fisler.length === 0) return new Map();
  const satirlar = await db.sorgu<FisGidenDurumu & { tur: FisTuru; id: number }>(
    `SELECT belge_turu AS tur, belge_no AS id, kaynak_degisiklik AS "kaynakDegisiklik", bekleyen_degisiklik AS bekleyen, istek_bekliyor AS "istekBekliyor",
            logo_kayit_no AS "logoKayitNo", son_sonuc AS "sonSonuc", son_hata AS "sonHata", son_deneme AS "sonDeneme", sonraki_deneme AS "sonrakiDeneme",
            deneme_sayisi AS "denemeSayisi", ardisik_hata AS "ardisikHata"
       FROM logo_malzeme_fisi_giden g
       JOIN unnest($1::text[], $2::int[]) AS q (tur, id) ON q.tur = g.belge_turu AND q.id = g.belge_no`,
    [fisler.map((f) => f.tur), fisler.map((f) => f.id)],
  );
  return new Map(satirlar.map(({ tur, id, ...d }) => [`${tur}:${id}`, d]));
}

export interface EsitlemeDurumu { bekleyen: number; sonSatirOzeti: string | null }
export function esitlemeDurumu(db: Db, tur: FisTuru, id: number): Promise<EsitlemeDurumu | null> {
  return db.tek<EsitlemeDurumu>(
    'SELECT bekleyen_degisiklik AS bekleyen, son_satir_ozeti AS "sonSatirOzeti" FROM logo_malzeme_fisi_giden WHERE belge_turu = $1 AND belge_no = $2',
    [tur, id],
  );
}

// Fiş Logo'dakiyle aynı: okunan değişiklikler düşer, elle istek kapanır. Tur sürerken gelen değişiklik sayaçta kalır, sonraki turda yeniden bakılır.
export async function esitlendi(db: Db, tur: FisTuru, id: number, okunan: number, ozet: string | null): Promise<void> {
  await db.sorgu(
    `UPDATE logo_malzeme_fisi_giden SET bekleyen_degisiklik = GREATEST(bekleyen_degisiklik - $3, 0), son_satir_ozeti = $4, istek_bekliyor = false
      WHERE belge_turu = $1 AND belge_no = $2`,
    [tur, id, okunan, ozet],
  );
}

// Fiş Logo'da silindi: kayıt no ve satır özeti boşalır, değişiklik sayacı kalır (yeni satırlar sonraki turda aynı numarayla açılır).
export async function silindiYaz(db: Db, tur: FisTuru, id: number, zaman: Date): Promise<void> {
  await db.sorgu(
    `UPDATE logo_malzeme_fisi_giden SET son_sonuc = 'silindi', son_hata = NULL, son_deneme = $3, sonraki_deneme = NULL, niyet_zamani = NULL,
            logo_kayit_no = NULL, son_satir_ozeti = NULL, deneme_sayisi = deneme_sayisi + 1, ardisik_hata = 0
      WHERE belge_turu = $1 AND belge_no = $2`,
    [tur, id, zaman],
  );
}

// Silme başarısız: fiş Logo'da durur, kayıt no kalır; geri çekilmeyle yeniden denenir.
export async function silmeHatasiYaz(db: Db, tur: FisTuru, id: number, d: { zaman: Date; sonuc: GidenSonucu; hata: string; sonrakiDeneme: Date }): Promise<void> {
  await db.sorgu(
    `UPDATE logo_malzeme_fisi_giden SET son_sonuc = $3, son_hata = $4, son_deneme = $5, sonraki_deneme = $6, deneme_sayisi = deneme_sayisi + 1,
            ardisik_hata = ardisik_hata + 1
      WHERE belge_turu = $1 AND belge_no = $2`,
    [tur, id, d.sonuc, d.hata, d.zaman, d.sonrakiDeneme],
  );
}
