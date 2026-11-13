import type { Db } from '#cekirdek/db.ts';
import { LOGO_FIS_TURLERI } from './kurallar.ts';
import type { FaturaKaydi, FisGidenDurumu, ListeKaydi, LogoFisTuru, LogoKullanimSatiri, LogoMalzemeKarti, LogoStokSatiri, MalKabulSatiri } from './kurallar.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import { MALZEME_KARTI_IZ_YOLU, malzemeKartiIzParametreleri, type MalzemeKartiAnahtari, type MalzemeKartiIzi } from '#paylasilan/malzeme-karti-izi.ts';

// Belge no sahibi modüldeki kimliktir: kart no, sipariş, talep ya da sipariş satırı kimliği; adım türleri (güncelleme, kapatma, iptal) aynı belgenin ayrı izidir.
export type FisTuru = LogoFisTuru;
export type BelgeTuru = 'malzeme' | 'hizmet' | 'malzeme-guncelleme' | 'siparis' | 'siparis-guncelleme' | 'siparis-kapatma' | 'siparis-bekletme' | 'siparis-iptal' | 'talep' | 'karsilama' | 'satis-teklifi' | 'satis-siparisi'
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

// logo_giden'de işlem türü (2114b): kart belgesinin gönderim ve Logo'da pasife alma izi ayrı satırdır. Fiş giden kutusunda işlem yoktur (yalnız gönderim).
export type GidenIslemi = 'gonder' | 'pasif';
// Koşul ve çakışma hedefi tabloya göre; işlem parametresi yalnız logo_giden'de verilir (fazla parametre sorguyu bozar).
const islemli = (belgeTuru: BelgeTuru): boolean => tablo(belgeTuru) === 'logo_giden';
const islemKosulu = (belgeTuru: BelgeTuru, yer: number): string => (islemli(belgeTuru) ? ` AND islem = $${yer}` : '');
const islemDegeri = (belgeTuru: BelgeTuru, islem: GidenIslemi): GidenIslemi[] => (islemli(belgeTuru) ? [islem] : []);
const cakisma = (belgeTuru: BelgeTuru): string => (islemli(belgeTuru) ? '(belge_turu, belge_no, islem)' : '(belge_turu, belge_no)');

export function gidenSatirlari(db: Db, belgeTuru: BelgeTuru, nolar: readonly number[], islem: GidenIslemi = 'gonder'): Promise<GidenSatiri[]> {
  return db.sorgu<GidenSatiri>(
    `SELECT ${ALANLAR} FROM ${tablo(belgeTuru)} WHERE belge_turu = $1 AND belge_no = ANY($2::int[])${islemKosulu(belgeTuru, 3)}`,
    [belgeTuru, nolar, ...islemDegeri(belgeTuru, islem)],
  );
}

export function gidenSatiri(db: Db, belgeTuru: BelgeTuru, no: number, islem: GidenIslemi = 'gonder'): Promise<GidenSatiri | null> {
  return db.tek<GidenSatiri>(
    `SELECT ${ALANLAR} FROM ${tablo(belgeTuru)} WHERE belge_turu = $1 AND belge_no = $2${islemKosulu(belgeTuru, 3)}`,
    [belgeTuru, no, ...islemDegeri(belgeTuru, islem)],
  );
}

// Niyet: bu belge için istek gidecek. Transaction bitince kalıcıdır; istek bir sonraki turda gider.
// Pasife alma yeniden istenebilir (Arşiv'den dönen kart yeniden silinir): satır yeni isteğe açılır, son sonuç boşalır (deneme sayısı kalır).
export async function niyetYaz(db: Db, belgeTuru: BelgeTuru, no: number, zaman: Date, islem: GidenIslemi = 'gonder'): Promise<void> {
  const i = islemli(belgeTuru);
  const yeniIstek = i && islem === 'pasif'
    ? ', son_sonuc = NULL, son_deneme = NULL, son_hata = NULL, logo_kayit_no = NULL, sonraki_deneme = NULL, ardisik_hata = 0'
    : '';
  await db.sorgu(
    `INSERT INTO ${tablo(belgeTuru)} (belge_turu, belge_no, niyet_zamani${i ? ', islem' : ''}) VALUES ($1, $2, $3${i ? ', $4' : ''})
     ON CONFLICT ${cakisma(belgeTuru)} DO UPDATE SET niyet_zamani = EXCLUDED.niyet_zamani${yeniIstek}`,
    [belgeTuru, no, zaman, ...islemDegeri(belgeTuru, islem)],
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

export async function denemeYaz(db: Db, belgeTuru: BelgeTuru, no: number, d: DenemeSonucu, islem: GidenIslemi = 'gonder'): Promise<void> {
  const i = islemli(belgeTuru);
  await db.sorgu(
    `INSERT INTO ${tablo(belgeTuru)} AS g (belge_turu, belge_no, niyet_zamani, deneme_sayisi, ardisik_hata, son_deneme, son_sonuc, son_hata, sonraki_deneme, logo_kayit_no${i ? ', islem' : ''})
     VALUES ($1, $2, CASE WHEN $8 THEN $9::timestamptz END, 1, CASE WHEN $10 THEN 0 ELSE 1 END, $3, $4, $5, $6, $7${i ? ', $11' : ''})
     ON CONFLICT ${cakisma(belgeTuru)} DO UPDATE SET
       niyet_zamani = CASE WHEN $8 THEN $9::timestamptz ELSE g.niyet_zamani END,
       deneme_sayisi = g.deneme_sayisi + 1,
       ardisik_hata = CASE WHEN $10 THEN 0 ELSE g.ardisik_hata + 1 END,
       son_deneme = $3, son_sonuc = $4, son_hata = $5, sonraki_deneme = $6, logo_kayit_no = $7`,
    [belgeTuru, no, d.zaman, d.sonuc, d.hata, d.sonrakiDeneme, d.logoKayitNo, d.niyetZamani !== undefined, d.niyetZamani ?? null, d.basarili, ...islemDegeri(belgeTuru, islem)],
  );
}

// 3070: kartı Logo'da TMI mi açtı. Yalnız açma isteğinin kesin sonucu ("gonderildi") sayılır; "zaten-vardi" Logo'da bulunan karttır, "Al" ve
// "Bağla" ile gelen kartın gönderim izi hiç yoktur. Belge no malzeme kartının numarasıdır (malzeme ya da hizmet).
export async function logodaTmiActi(db: Db, kartNo: number): Promise<boolean> {
  const r = await db.tek<{ var: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM logo_giden WHERE belge_turu IN ('malzeme', 'hizmet') AND belge_no = $1 AND islem = 'gonder' AND son_sonuc = 'gonderildi') AS var`,
    [kartNo],
  );
  return r?.var === true;
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

// Aynı kodun yalnız büyük/küçük harfi farklı başka bir kaydı (elle ya da köprü listesinden); yoksa null.
export function birimSetiHarfFarkliKod(db: Db, kod: string): Promise<{ kod: string } | null> {
  return db.tek<{ kod: string }>('SELECT kod FROM logo_birim_seti WHERE lower(kod) = lower($1) AND kod <> $1 ORDER BY kod LIMIT 1', [kod]);
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

// Belge türü başına son sonuç (yalnız gönderim; pasife alma izi sayılmaz): Logo'da açılmış (ya da zaten vardı) ve son denemesi başarısız olan kayıt sayısı.
export function gidenOzetleri(db: Db): Promise<GidenOzeti[]> {
  return db.sorgu<GidenOzeti>(
    `SELECT belge_turu AS "belgeTuru",
       count(*) FILTER (WHERE son_sonuc IN ('gonderildi', 'zaten-vardi'))::int AS gonderilen,
       count(*) FILTER (WHERE son_sonuc IS NOT NULL AND son_sonuc NOT IN ('gonderildi', 'zaten-vardi'))::int AS hatali,
       ${zamanMetni('max(son_deneme)')} AS "sonDeneme"
     FROM (SELECT belge_turu, son_sonuc, son_deneme FROM logo_giden WHERE islem = 'gonder' UNION ALL SELECT belge_turu, son_sonuc, son_deneme FROM logo_malzeme_fisi_giden) g GROUP BY belge_turu`,
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

export function listeOkumasi(db: Db, liste: 'cari' | 'ambar' | 'malzeme'): Promise<{ sonOkumaAn: Date } | null> {
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

// Logo malzeme kodlarının aynası (2089-2 a); boş cevap (okuma kazası olabilir) aynayı boşaltmaz.
export async function malzemeKodlariniYaz(db: Db, kodlar: readonly string[], zaman: Date): Promise<void> {
  if (kodlar.length > 0) {
    await db.sorgu(
      'INSERT INTO logo_malzeme_kodu (kod, son_okuma) SELECT k, $2 FROM unnest($1::text[]) AS t(k) ON CONFLICT (kod) DO UPDATE SET son_okuma = EXCLUDED.son_okuma',
      [kodlar, zaman],
    );
    await db.sorgu('DELETE FROM logo_malzeme_kodu WHERE son_okuma < $1', [zaman]);
  }
  await db.sorgu(
    `INSERT INTO logo_liste_okuma (liste, son_okuma, sayi) VALUES ('malzeme', $1, $2)
     ON CONFLICT (liste) DO UPDATE SET son_okuma = EXCLUDED.son_okuma, sayi = EXCLUDED.sayi`,
    [zaman, kodlar.length],
  );
}

// TMI'nin Logo'da açtığı ya da eşlediği kartın kodu liste beklenmeden aynaya girer.
export async function malzemeKoduEkle(db: Db, kod: string, zaman: Date): Promise<void> {
  await db.sorgu('INSERT INTO logo_malzeme_kodu (kod, son_okuma) VALUES ($1, $2) ON CONFLICT (kod) DO NOTHING', [kod, zaman]);
}

// Verilen kodlardan Logo'da kullanılanlar (aynaya göre).
export async function logodaOlanMalzemeKodlari(db: Db, kodlar: readonly string[]): Promise<string[]> {
  if (kodlar.length === 0) return [];
  const satirlar = await db.sorgu<{ kod: string }>('SELECT kod FROM logo_malzeme_kodu WHERE kod = ANY($1::text[])', [kodlar]);
  return satirlar.map((r) => r.kod);
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
     WHERE g.belge_turu = 'siparis' AND g.islem = 'gonder' AND g.son_sonuc IN ('gonderildi', 'zaten-vardi') AND g.logo_kayit_no IS NOT NULL
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

// 2948: fişin Logo'ya giden numarası; boşsa kural koddadır (kurallar.ts logoFisNumarasi). Satır kuyruktan gelir, yoksa yazılmaz.
export async function fisNumarasi(db: Db, tur: FisTuru, id: number): Promise<string | null> {
  return (await db.tek<{ numara: string | null }>('SELECT numara FROM logo_malzeme_fisi_giden WHERE belge_turu = $1 AND belge_no = $2', [tur, id]))?.numara ?? null;
}
export async function fisNumarasiYaz(db: Db, tur: FisTuru, id: number, numara: string): Promise<void> {
  await db.sorgu('UPDATE logo_malzeme_fisi_giden SET numara = $3 WHERE belge_turu = $1 AND belge_no = $2 AND numara IS NULL', [tur, id, numara]);
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
export async function pasifHatasiYaz(db: Db, tur: FisTuru, id: number, d: { zaman: Date; sonuc: GidenSonucu; hata: string; sonrakiDeneme: Date }): Promise<void> {
  await db.sorgu(
    `UPDATE logo_malzeme_fisi_giden SET son_sonuc = $3, son_hata = $4, son_deneme = $5, sonraki_deneme = $6, deneme_sayisi = deneme_sayisi + 1,
            ardisik_hata = ardisik_hata + 1
      WHERE belge_turu = $1 AND belge_no = $2`,
    [tur, id, d.sonuc, d.hata, d.zaman, d.sonrakiDeneme],
  );
}

/* ---------------- 2116: Logo malzeme kartı ve stok toplamı aynası, kod eşlemesi ---------------- */

export type SayfaliAkis = 'malzeme-karti' | 'stok' | 'kullanim';
export interface OkumaImleci {
  sonRef: number; turBasi: Date; sonTamam: Date | null; sonTamamMetni: string | null; sayi: number; turIstendi: boolean;
}

export function okumaImleci(db: Db, akis: SayfaliAkis): Promise<OkumaImleci | null> {
  return db.tek<OkumaImleci>(
    `SELECT son_ref::float8 AS "sonRef", tur_basi AS "turBasi", son_tamam AS "sonTamam", ${zamanMetni('son_tamam')} AS "sonTamamMetni", sayi,
            tur_istendi AS "turIstendi"
       FROM logo_okuma_imleci WHERE akis = $1`,
    [akis],
  );
}

// 3077 a: "Şimdi oku" sayfalı akışları baştan okutur. İmleç satırı yoksa yazılmaz: hiç okunmamış akış zaten baştan başlar.
export async function turIste(db: Db): Promise<void> {
  await db.sorgu("UPDATE logo_okuma_imleci SET tur_istendi = true WHERE akis IN ('malzeme-karti', 'stok', 'kullanim')");
}

// Sayfa yazılır; son sayfada turda görülmeyen satırlar silinir ve imleç başa döner. Boş tam tur (okuma kazası olabilir) aynayı boşaltmaz.
export async function sayfaYaz(
  db: Db, akis: SayfaliAkis, turBasi: Date, zaman: Date, sonraki: number | null, sayfaSayisi: number,
  yaz: () => Promise<void>,
): Promise<void> {
  await yaz();
  const onceki = await okumaImleci(db, akis);
  const sayi = (onceki && onceki.sonRef > 0 ? onceki.sayi : 0) + sayfaSayisi;
  if (sonraki === null && sayi > 0) {
    const tablo = { 'malzeme-karti': 'logo_malzeme_karti', stok: 'logo_stok_toplami', kullanim: 'logo_malzeme_kullanimi' }[akis];
    await db.sorgu(`DELETE FROM ${tablo} WHERE son_okuma < $1`, [turBasi]);
  }
  await db.sorgu(
    `INSERT INTO logo_okuma_imleci (akis, son_ref, tur_basi, son_tamam, sayi) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (akis) DO UPDATE SET son_ref = EXCLUDED.son_ref, tur_basi = EXCLUDED.tur_basi,
       son_tamam = coalesce(EXCLUDED.son_tamam, logo_okuma_imleci.son_tamam), sayi = EXCLUDED.sayi,
       -- Turun ilk sayfası isteği karşılar; tur ortasında gelen istek kalır ve tur bitince yeni tur başlatır (3077 a).
       tur_istendi = logo_okuma_imleci.tur_istendi AND logo_okuma_imleci.son_ref > 0`,
    [akis, sonraki ?? 0, turBasi, sonraki === null ? zaman : null, sayi],
  );
}

export async function malzemeKartlariniYaz(db: Db, kartlar: readonly LogoMalzemeKarti[], zaman: Date): Promise<void> {
  if (kartlar.length === 0) return;
  // Kod Logo'da tekildir; kartın kodu değiştiyse eski kayıttaki aynı kod önce boşaltılır (tekil kısıt sıraya takılmasın).
  await db.sorgu('DELETE FROM logo_malzeme_karti WHERE kod = ANY($1::text[]) AND NOT (logical_ref = ANY($2::bigint[]))',
    [kartlar.map((k) => k.kod), kartlar.map((k) => k.logoKayitNo)]);
  await db.sorgu(
    `INSERT INTO logo_malzeme_karti (logical_ref, kod, ad, aciklama_2, aciklama_3, kart_turu, birim_seti, aktif, son_okuma)
     SELECT * , $9::timestamptz FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::text[], $8::boolean[])
     ON CONFLICT (logical_ref) DO UPDATE SET kod = EXCLUDED.kod, ad = EXCLUDED.ad, aciklama_2 = EXCLUDED.aciklama_2, aciklama_3 = EXCLUDED.aciklama_3,
       kart_turu = EXCLUDED.kart_turu, birim_seti = EXCLUDED.birim_seti, aktif = EXCLUDED.aktif, son_okuma = EXCLUDED.son_okuma`,
    [kartlar.map((k) => k.logoKayitNo), kartlar.map((k) => k.kod), kartlar.map((k) => k.ad), kartlar.map((k) => k.aciklama2), kartlar.map((k) => k.aciklama3),
      kartlar.map((k) => k.kartTuru), kartlar.map((k) => k.birimSeti), kartlar.map((k) => k.aktif), zaman],
  );
}

export async function stokToplamlariniYaz(db: Db, satirlar: readonly LogoStokSatiri[], zaman: Date): Promise<void> {
  if (satirlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO logo_stok_toplami (malzeme_kodu, ambar_no, miktar, son_okuma)
     SELECT k, a, m, $4 FROM unnest($1::text[], $2::int[], $3::numeric[]) AS t(k, a, m)
     ON CONFLICT (malzeme_kodu, ambar_no) DO UPDATE SET miktar = EXCLUDED.miktar, son_okuma = EXCLUDED.son_okuma`,
    [satirlar.map((x) => x.malzemeKodu), satirlar.map((x) => x.ambarNo), satirlar.map((x) => x.miktar), zaman],
  );
}

export async function kullanimlariYaz(db: Db, satirlar: readonly LogoKullanimSatiri[], zaman: Date): Promise<void> {
  if (satirlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO logo_malzeme_kullanimi (malzeme_kodu, son_hareket, acik_siparis, son_okuma)
     SELECT k, h, a, $4 FROM unnest($1::text[], $2::date[], $3::boolean[]) AS t(k, h, a)
     ON CONFLICT (malzeme_kodu) DO UPDATE SET son_hareket = EXCLUDED.son_hareket, acik_siparis = EXCLUDED.acik_siparis, son_okuma = EXCLUDED.son_okuma`,
    [satirlar.map((x) => x.malzemeKodu), satirlar.map((x) => x.sonHareket), satirlar.map((x) => x.acikSiparis), zaman],
  );
}

export interface AynadakiKart extends LogoMalzemeKarti { sonOkuma: string }

// `ara` kod, ad ve açıklamaların içinde geçen parçadır; Türkçe harf sadeleştirmesiyle (public.arama_sade) büyük/küçük harf duyarsız.
// Desen parametredir, metin SQL'e yazılmaz.
export function aynadakiKartlar(
  db: Db, o: { kodlar?: readonly string[]; ara?: string; sinir: number; sonra: number },
): Promise<AynadakiKart[]> {
  const ara = o.ara?.trim() ? icindeDeseni(o.ara) : null;
  return db.sorgu<AynadakiKart>(
    `SELECT logical_ref::float8 AS "logoKayitNo", kod, ad, aciklama_2 AS "aciklama2", aciklama_3 AS "aciklama3", kart_turu AS "kartTuru",
            birim_seti AS "birimSeti", aktif, ${zamanMetni('son_okuma')} AS "sonOkuma"
       FROM logo_malzeme_karti WHERE logical_ref > $3 AND ($1::text[] IS NULL OR kod = ANY($1::text[]))
        AND ($4::text IS NULL OR public.arama_sade(kod) LIKE $4 OR public.arama_sade(ad) LIKE $4
             OR public.arama_sade(aciklama_2) LIKE $4 OR public.arama_sade(aciklama_3) LIKE $4)
      ORDER BY logical_ref LIMIT $2`,
    [o.kodlar ?? null, o.sinir, o.sonra, ara],
  );
}

// Geçiş sayfası (3068): aynanın hafif özeti, süzgeç ve sayaçlar için; stok bütün ambarların toplamıdır (okunmamışsa null).
// Kullanım izi (3079 a) okunmamış kartta sonHareket ve acikSiparis null.
export interface AynaOzetSatiri { logoKayitNo: number; kod: string; aktif: boolean; stok: string | null; sonHareket: string | null; acikSiparis: boolean | null }
export function aynaOzeti(db: Db, o: { ara?: string }): Promise<AynaOzetSatiri[]> {
  const ara = o.ara?.trim() ? icindeDeseni(o.ara) : null;
  return db.sorgu<AynaOzetSatiri>(
    `SELECT k.logical_ref::float8 AS "logoKayitNo", k.kod, k.aktif, t.toplam::text AS stok,
            u.son_hareket::text AS "sonHareket", u.acik_siparis AS "acikSiparis"
       FROM logo_malzeme_karti k
       LEFT JOIN (SELECT malzeme_kodu, sum(miktar) AS toplam FROM logo_stok_toplami GROUP BY malzeme_kodu) t ON t.malzeme_kodu = k.kod
       LEFT JOIN logo_malzeme_kullanimi u ON u.malzeme_kodu = k.kod
      WHERE ($1::text IS NULL OR public.arama_sade(k.kod) LIKE $1 OR public.arama_sade(k.ad) LIKE $1
             OR public.arama_sade(k.aciklama_2) LIKE $1 OR public.arama_sade(k.aciklama_3) LIKE $1)
      ORDER BY k.logical_ref`,
    [ara],
  );
}

export function aynadakiStoklar(db: Db, kodlar: readonly string[]): Promise<(LogoStokSatiri & { sonOkuma: string })[]> {
  return db.sorgu(
    `SELECT malzeme_kodu AS "malzemeKodu", ambar_no AS "ambarNo", miktar::text AS miktar, ${zamanMetni('son_okuma')} AS "sonOkuma"
       FROM logo_stok_toplami WHERE malzeme_kodu = ANY($1::text[]) ORDER BY malzeme_kodu, ambar_no`,
    [kodlar],
  );
}

// TMI stok kodu -> Logo kodu; yalnız eşlemesi olan kodlar döner.
export async function logoKodHaritasi(db: Db, stokKodlari: readonly string[]): Promise<Map<string, string>> {
  if (stokKodlari.length === 0) return new Map();
  const satirlar = await db.sorgu<{ stokKodu: string; logoKodu: string }>(
    'SELECT stok_kodu AS "stokKodu", logo_kodu AS "logoKodu" FROM logo_malzeme_eslemesi WHERE stok_kodu = ANY($1::text[])', [stokKodlari],
  );
  return new Map(satirlar.map((x) => [x.stokKodu, x.logoKodu]));
}

// Logo kodu -> TMI stok kodu (okunan mal kabul ve fatura satırları için).
export async function tmiKodHaritasi(db: Db, logoKodlari: readonly string[]): Promise<Map<string, string>> {
  if (logoKodlari.length === 0) return new Map();
  const satirlar = await db.sorgu<{ stokKodu: string; logoKodu: string }>(
    'SELECT stok_kodu AS "stokKodu", logo_kodu AS "logoKodu" FROM logo_malzeme_eslemesi WHERE logo_kodu = ANY($1::text[])', [logoKodlari],
  );
  return new Map(satirlar.map((x) => [x.logoKodu, x.stokKodu]));
}

export async function eslemeYaz(db: Db, e: { stokKodu: string; logoKodu: string; logoKayitNo: number }): Promise<void> {
  await db.sorgu('INSERT INTO logo_malzeme_eslemesi (stok_kodu, logo_kodu, logo_kayit_no) VALUES ($1, $2, $3)', [e.stokKodu, e.logoKodu, e.logoKayitNo]);
}
// Arşivdeki silinmiş malzeme kartlarının bu modüldeki izi (2114c); malzemeler kablolamadan okur.
export async function malzemeKartiIzleri(db: Db, kartlar: readonly MalzemeKartiAnahtari[]): Promise<MalzemeKartiIzi[]> {
  if (kartlar.length === 0) return [];
  return db.sorgu<MalzemeKartiIzi>(
    `WITH k AS (SELECT * FROM unnest($1::int[], $2::text[], $3::text[]) AS k(no, kod, kimlik))
     SELECT k.no, 'Logo mal kabul satırı' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.logical_ref)::text AS ornek
       FROM k JOIN logo_mal_kabul_satiri t ON t.malzeme_kodu = k.kod GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Logo kod eşlemesi' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.logo_kodu) AS ornek
       FROM k JOIN logo_malzeme_eslemesi t ON t.stok_kodu = k.kod GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Logo mal kabul ham kaydı' AS kayit, 'olasi' AS tur, count(*)::int AS adet, min(t.logical_ref)::text AS ornek
       FROM k JOIN logo_mal_kabul_satiri t ON jsonb_path_exists(t.ham, $4::jsonpath, jsonb_build_object('no', k.no, 'kod', k.kod, 'kimlik', k.kimlik)) GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Logo faturası ham kaydı' AS kayit, 'olasi' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN logo_fatura t ON jsonb_path_exists(t.ham, $4::jsonpath, jsonb_build_object('no', k.no, 'kod', k.kod, 'kimlik', k.kimlik)) GROUP BY k.no`,
    [...malzemeKartiIzParametreleri(kartlar), MALZEME_KARTI_IZ_YOLU],
  );
}

/* ---------------- D7: Logo'da CORE MES dışında açılmış siparişin düzeltme işi ---------------- */

export type DisDuzeltmeDurumu = 'bekliyor' | 'gonderildi' | 'reddedildi' | 'hata';

export interface DisDuzeltmeKaydi {
  id: number;
  fisNo: string;
  durum: DisDuzeltmeDurumu;
  hata: string | null;
  ozet: unknown;
  kisiId: number;
  olusturma: string;
  sonucZamani: string | null;
}

export interface BekleyenDisDuzeltme {
  id: number;
  fisNo: string;
  iz: string;
  duzeltme: unknown;
}

// Aynı fişte bekleyen düzeltme varsa null (tekil kısmi dizin): çağıran "bekleyen düzeltme var" der.
export async function disDuzeltmeEkle(db: Db, k: { fisNo: string; iz: string; duzeltme: unknown; kisiId: number }): Promise<number | null> {
  const r = await db.tek<{ id: number }>(
    `INSERT INTO logo_dis_siparis_duzeltme (fis_no, iz, duzeltme, kisi_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (fis_no) WHERE durum = 'bekliyor' DO NOTHING RETURNING id`,
    [k.fisNo, k.iz, JSON.stringify(k.duzeltme), k.kisiId],
  );
  return r?.id ?? null;
}

const DIS_DUZELTME_ALANLARI = () => `id, fis_no AS "fisNo", durum, hata, ozet, kisi_id AS "kisiId", ${zamanMetni('olusturma')} AS olusturma,
  ${zamanMetni('sonuc_zamani')} AS "sonucZamani"`;

// Gövde (fiyat) dönmez; liste yalnız özet ve sonuç taşır.
export async function disDuzeltmeleri(db: Db, fisNo: string, sinir: number): Promise<DisDuzeltmeKaydi[]> {
  return db.sorgu<DisDuzeltmeKaydi>(
    `SELECT ${DIS_DUZELTME_ALANLARI()} FROM logo_dis_siparis_duzeltme WHERE fis_no = $1 ORDER BY id DESC LIMIT $2`, [fisNo, sinir],
  );
}

export async function disDuzeltmeKaydi(db: Db, id: number): Promise<DisDuzeltmeKaydi | null> {
  return db.tek<DisDuzeltmeKaydi>(`SELECT ${DIS_DUZELTME_ALANLARI()} FROM logo_dis_siparis_duzeltme WHERE id = $1`, [id]);
}

// Kuyruğun en eskisi; iş turda bir düzeltme gönderir (köprü tek oturum).
export async function siradakiDisDuzeltme(db: Db): Promise<BekleyenDisDuzeltme | null> {
  return db.tek<BekleyenDisDuzeltme>(
    `SELECT id, fis_no AS "fisNo", iz, duzeltme FROM logo_dis_siparis_duzeltme
      WHERE durum = 'bekliyor' ORDER BY id LIMIT 1`,
  );
}

// Yalnız bekleyen kayıt sonuçlanır: aynı işin iki kez sonuçlanması ikinciyi yazmaz. Gövde kurulduysa (gönderildi ya da sonucu belirsiz) kayıt
// numarası, gövde ve özet de yazılır.
export async function disDuzeltmeSonucu(
  db: Db, id: number, durum: Exclude<DisDuzeltmeDurumu, 'bekliyor'>, hata: string | null, zaman: Date,
  gonderilen: { logoKayitNo: number; govde: Record<string, unknown>; ozet: unknown } | null,
): Promise<void> {
  await db.sorgu(
    `UPDATE logo_dis_siparis_duzeltme SET durum = $2, hata = $3, sonuc_zamani = $4, logo_kayit_no = $5, govde = $6, ozet = $7
      WHERE id = $1 AND durum = 'bekliyor'`,
    [id, durum, hata === null ? null : hata.slice(0, 500), zaman, gonderilen?.logoKayitNo ?? null,
      gonderilen === null ? null : JSON.stringify(gonderilen.govde), gonderilen === null ? null : JSON.stringify(gonderilen.ozet)],
  );
}

// Logo kuyruğunun bildiği CORE MES siparişi: gönderilmiş sipariş belgesinin kaydı ya da fatura okumasının sipariş numarası.
export async function coreSiparisiLogodaMi(db: Db, no: string, logoKayitNo: number): Promise<boolean> {
  return (await db.tek(
    `SELECT 1 WHERE EXISTS (SELECT 1 FROM logo_giden WHERE belge_turu = 'siparis' AND logo_kayit_no = $2)
        OR EXISTS (SELECT 1 FROM logo_siparis_no WHERE siparis_no = $1)`,
    [no, String(logoKayitNo)],
  )) !== null;
}

/* ---------------- 3201: malzeme kartının "Logo'da" bölümü ---------------- */

// Ambar listesi aynası: kod ambar numarasının metnidir; adı olmayan ya da sayı olmayan kod atlanır.
export async function ambarAdlari(db: Db): Promise<Map<number, string | null>> {
  const l = await db.sorgu<{ kod: string; ad: string | null }>("SELECT kod, ad FROM logo_ambar WHERE kod ~ '^[0-9]{1,9}$'");
  return new Map(l.map((x) => [Number(x.kod), x.ad]));
}

export async function cariAdlari(db: Db, kodlar: readonly string[]): Promise<Map<string, string | null>> {
  if (kodlar.length === 0) return new Map();
  const l = await db.sorgu<{ kod: string; ad: string | null }>('SELECT kod, ad FROM logo_cari WHERE kod = ANY($1::text[])', [kodlar]);
  return new Map(l.map((x) => [x.kod, x.ad]));
}
