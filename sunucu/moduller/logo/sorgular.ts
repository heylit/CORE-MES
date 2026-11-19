import type { Db } from '#cekirdek/db.ts';
import { LOGO_FIS_TURLERI, sonrakiDenemeYazilir } from './kurallar.ts';
import type { FaturaKaydi, FisGidenDurumu, LogoTopluAlis, IrsaliyeBasligiOkuma, IrsaliyeOkumaSirasi, IrsaliyeTuru, ListeKaydi, LogoFisTuru, LogoKullanimSatiri, LogoMalzemeKarti, LogoStokSatiri, MalKabulSatiri } from './kurallar.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import { MALZEME_KARTI_IZ_YOLU, malzemeKartiIzParametreleri, type MalzemeKartiAnahtari, type MalzemeKartiIzi } from '#paylasilan/malzeme-karti-izi.ts';

// Belge no sahibi modüldeki kimliktir: kart no, sipariş, talep ya da sipariş satırı kimliği; adım türleri (güncelleme, kapatma, iptal) aynı belgenin ayrı izidir.
export type FisTuru = LogoFisTuru;
export const GIDEN_BELGELERI = [
  'malzeme', 'hizmet', 'malzeme-guncelleme', 'siparis', 'siparis-guncelleme', 'siparis-kapatma', 'siparis-bekletme', 'siparis-iptal', 'talep', 'karsilama',
  'satis-teklifi', 'satis-siparisi', 'siparisler-teklifi', 'siparisler-siparisi', 'proje',
] as const;
export type BelgeTuru = (typeof GIDEN_BELGELERI)[number] | FisTuru;
export const belgeTuruMu = (b: string): b is BelgeTuru => (GIDEN_BELGELERI as readonly string[]).includes(b) || (LOGO_FIS_TURLERI as readonly string[]).includes(b);
export type { GidenSonucu } from './kurallar.ts';
import type { GidenSonucu } from './kurallar.ts';

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
    [belgeTuru, no, d.zaman, d.sonuc, d.hata, sonrakiDenemeYazilir(d.sonuc, d.sonrakiDeneme), d.logoKayitNo, d.niyetZamani !== undefined, d.niyetZamani ?? null, d.basarili, ...islemDegeri(belgeTuru, islem)],
  );
}

// 3315: Logo'da açılmış ya da bağlanmış projeler (kimlik ve Logo kaydı); kuyruktan düşülür, proje kartında gösterilir.
export function logodakiProjeler(db: Db, nolar?: readonly number[]): Promise<{ belgeNo: number; logoKayitNo: string }[]> {
  return db.sorgu<{ belgeNo: number; logoKayitNo: string }>(
    `SELECT belge_no AS "belgeNo", logo_kayit_no AS "logoKayitNo" FROM logo_giden
      WHERE belge_turu = 'proje' AND islem = 'gonder' AND son_sonuc IN ('gonderildi', 'zaten-vardi') AND logo_kayit_no IS NOT NULL
        AND ($1::int[] IS NULL OR belge_no = ANY($1::int[]))`,
    [nolar ?? null],
  );
}

// 3313: duran belgeyi (kalıcı ret, sonraki deneme boş) yeniden sıraya alır: sonraki deneme "şimdi" olur, deneme geçmişi kalır. Koşulludur: arada
// tur başka sonuç yazdıysa ya da belge zaten durmuyorsa hiçbir şey değişmez ve false döner.
export async function duraniYenidenAc(db: Db, belgeTuru: BelgeTuru, no: number, simdi: Date, islem: GidenIslemi = 'gonder'): Promise<boolean> {
  const r = await db.sorgu<{ x: number }>(
    `UPDATE ${tablo(belgeTuru)} SET sonraki_deneme = $3
      WHERE belge_turu = $1 AND belge_no = $2${islemKosulu(belgeTuru, 4)} AND son_sonuc = 'reddedildi' AND sonraki_deneme IS NULL RETURNING 1 AS x`,
    [belgeTuru, no, simdi, ...islemDegeri(belgeTuru, islem)],
  );
  return r.length > 0;
}

// 3313: bağlantı izleme. Başarıyla gitmemiş (ya da hiç denenmemiş) giden satırları; en eski son deneme önce. Tutar, fiyat ve firma taşımaz.
export interface GidenIzlemeSatiri {
  belgeTuru: string; belgeNo: number; islem: GidenIslemi; denemeSayisi: number; sonDeneme: Date | null; sonSonuc: GidenSonucu | null;
  sonHata: string | null; sonrakiDeneme: Date | null;
}
const IZLEME_ALANLARI = `belge_turu AS "belgeTuru", belge_no AS "belgeNo", deneme_sayisi AS "denemeSayisi", son_deneme AS "sonDeneme",
  son_sonuc AS "sonSonuc", son_hata AS "sonHata", sonraki_deneme AS "sonrakiDeneme"`;
const IZLEME_KOSULU = `(son_sonuc IS NULL OR son_sonuc NOT IN ('gonderildi', 'zaten-vardi'))`;
export function gidenIzlemeSatirlari(db: Db, sinir: number): Promise<GidenIzlemeSatiri[]> {
  return db.sorgu<GidenIzlemeSatiri>(
    `SELECT * FROM (
       SELECT ${IZLEME_ALANLARI}, islem FROM logo_giden WHERE ${IZLEME_KOSULU}
       UNION ALL SELECT ${IZLEME_ALANLARI}, 'gonder' AS islem FROM logo_malzeme_fisi_giden WHERE ${IZLEME_KOSULU}
     ) g ORDER BY "sonDeneme" NULLS FIRST, "belgeTuru", "belgeNo" LIMIT $1`,
    [sinir],
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
     ON CONFLICT (belge_turu, belge_no) DO UPDATE SET bekleyen_degisiklik = g.bekleyen_degisiklik + 1,
       -- 3313: fiş değişti; duran fiş (kurallar.ts durduMu) yeniden sıraya girer.
       sonraki_deneme = CASE WHEN g.son_sonuc = 'reddedildi' AND g.sonraki_deneme IS NULL THEN g.son_deneme ELSE g.sonraki_deneme END`,
    [tur, id],
  );
}

// Stokta yeni elle gönderim isteği ("Gönder", "Yeniden gönder"): fiş beklemeden ve önceki niyeti bırakarak sıraya girer. Niyetin
// bırakılması, sonucu bilinmeyen eski isteğe rağmen yeniden göndermedir; ekran bunu kullanıcıya söyler (295 a).
export async function fisIstegiYaz(db: Db, tur: FisTuru, id: number, istek: string): Promise<void> {
  await db.sorgu(
    `UPDATE logo_malzeme_fisi_giden SET son_istek = $3, istek_bekliyor = true, niyet_zamani = NULL,
            -- 3313: duran fiş (kurallar.ts durduMu) son denemesinin zamanına alınır, yani hemen sıradadır; öteki beklemeden gider.
            sonraki_deneme = CASE WHEN son_sonuc = 'reddedildi' THEN son_deneme END,
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
        AND (son_sonuc IS DISTINCT FROM 'reddedildi' OR sonraki_deneme IS NOT NULL) -- 3313: duran fiş (kurallar.ts durduMu) sırayı tutmaz
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
    [tur, id, d.sonuc, d.hata, d.zaman, sonrakiDenemeYazilir(d.sonuc, d.sonrakiDeneme)],
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

// 3316-K2 a: okuma ayarı kapalıyken görülürse, tamamlanmış tur bir sonraki açılışta baştan okunur (ayarı kapatıp açmak aynayı tazeler).
export async function acilistaTurIste(db: Db, akis: SayfaliAkis): Promise<void> {
  await db.sorgu('UPDATE logo_okuma_imleci SET tur_istendi = true WHERE akis = $1 AND NOT tur_istendi AND son_tamam IS NOT NULL', [akis]);
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

/* ---------------- 3384-c a: Logo son alış kopyası (yalnız eklenir) ---------------- */

export interface SonAlisImleci { firma: number; donem: number; sonRef: number; dolu: boolean; sonOkuma: Date }

// Yardımcının son okunan firma ve dönemi en son okunandır.
export function sonAlisImleci(db: Db): Promise<SonAlisImleci | null> {
  return db.tek<SonAlisImleci>(
    `SELECT firma, donem, son_ref::float8 AS "sonRef", dolu, son_okuma AS "sonOkuma"
       FROM logo_son_alis_imleci ORDER BY son_okuma DESC, firma DESC, donem DESC LIMIT 1`,
  );
}

export function sonAlisImleciVar(db: Db, firma: number, donem: number): Promise<{ sonRef: number } | null> {
  return db.tek<{ sonRef: number }>('SELECT son_ref::float8 AS "sonRef" FROM logo_son_alis_imleci WHERE firma = $1 AND donem = $2', [firma, donem]);
}

export async function sonAlisImleciYaz(db: Db, i: Omit<SonAlisImleci, 'sonOkuma'>, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO logo_son_alis_imleci (firma, donem, son_ref, dolu, son_okuma) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (firma, donem) DO UPDATE SET son_ref = EXCLUDED.son_ref, dolu = EXCLUDED.dolu, son_okuma = EXCLUDED.son_okuma`,
    [i.firma, i.donem, i.sonRef, i.dolu, zaman],
  );
}

// Aynı satır ikinci kez gelirse atlanır; kopya güncellenmez, silinmez (tablo yalnız eklemeye açıktır).
export async function sonAlislariYaz(db: Db, firma: number, donem: number, satirlar: readonly LogoTopluAlis[], zaman: Date): Promise<number> {
  if (satirlar.length === 0) return 0;
  const r = await db.sorgu<{ x: number }>(
    `INSERT INTO logo_son_alis (firma, donem, logo_kayit_no, malzeme_kodu, tarih, cari_kodu, fatura_no, miktar, birim, fiyat, doviz_turu, doviz_fiyati, okuma_zamani)
     SELECT $1, $2, r, k, t, c, f, m, b, fy, dt, df, $13
       FROM unnest($3::bigint[], $4::text[], $5::date[], $6::text[], $7::text[], $8::numeric[], $9::text[], $10::numeric[], $11::int[], $12::numeric[])
         AS x(r, k, t, c, f, m, b, fy, dt, df)
     ON CONFLICT (firma, donem, logo_kayit_no) DO NOTHING RETURNING 1 AS x`,
    [firma, donem, satirlar.map((x) => x.logoKayitNo), satirlar.map((x) => x.malzemeKodu), satirlar.map((x) => x.tarih), satirlar.map((x) => x.cariKodu),
      satirlar.map((x) => x.faturaNo), satirlar.map((x) => x.miktar), satirlar.map((x) => x.birim), satirlar.map((x) => x.fiyat),
      satirlar.map((x) => x.dovizTuru), satirlar.map((x) => x.dovizFiyati), zaman],
  );
  return r.length;
}

export async function sonAlisOzeti(db: Db): Promise<{ sayi: number | null; son: string | null }> {
  const r = await db.tek<{ sayi: number; son: string | null }>(
    `SELECT (SELECT count(*)::int FROM logo_son_alis) AS sayi,
            (SELECT ${zamanMetni('max(son_okuma)')} FROM logo_son_alis_imleci) AS son`,
  );
  return r === null || (r.sayi === 0 && r.son === null) ? { sayi: null, son: null } : r;
}

export interface SonAlisSatiri {
  stokKodu: string; tarih: string; cariKodu: string | null; faturaNo: string | null; miktar: string; birim: string | null;
  fiyat: string; dovizTuru: number | null; dovizFiyati: string | null;
}

// CORE stok kodu Logo koduna eşlemeyle çevrilir (eşlemesi yoksa aynı kod). Malzeme başına en yeni fatura tarihli satır.
export function sonAlislar(db: Db, stokKodlari: readonly string[]): Promise<SonAlisSatiri[]> {
  return db.sorgu<SonAlisSatiri>(
    `SELECT DISTINCT ON (k.stok_kodu) k.stok_kodu AS "stokKodu", a.tarih::text AS tarih, a.cari_kodu AS "cariKodu", a.fatura_no AS "faturaNo",
            a.miktar::text AS miktar, a.birim, a.fiyat::text AS fiyat, a.doviz_turu AS "dovizTuru", a.doviz_fiyati::text AS "dovizFiyati"
       FROM unnest($1::text[]) AS k(stok_kodu)
       LEFT JOIN logo_malzeme_eslemesi e ON e.stok_kodu = k.stok_kodu
       JOIN logo_son_alis a ON a.malzeme_kodu = coalesce(e.logo_kodu, k.stok_kodu)
      ORDER BY k.stok_kodu, a.tarih DESC, a.okuma_zamani DESC, a.logo_kayit_no DESC`,
    [[...new Set(stokKodlari)]],
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

// 3313: okunmuş Logo kopyasında (canlı aramada eklenen dahil) bu kodlu kart var mı; kart denetimi Logo'ya her turda sormaz.
export async function aynadakiKodlar(db: Db, logoKodlari: readonly string[]): Promise<Set<string>> {
  if (logoKodlari.length === 0) return new Set();
  const satirlar = await db.sorgu<{ kod: string }>('SELECT kod FROM logo_malzeme_karti WHERE kod = ANY($1::text[])', [logoKodlari]);
  return new Set(satirlar.map((x) => x.kod));
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

/* ---------------- Logo irsaliyeleri (3345 a): ayna, yalnız okunur ---------------- */

export interface IrsaliyeImleci {
  firma: number;
  donem: number;
  sonRef: number;
  degisme: string | null;
  degismeRef: number;
  sira: IrsaliyeOkumaSirasi;
  refDenetimi: Date | null;
}

// En son okunan dönem; yardımcı başka döneme geçince o dönemin imleci ayrı açılır (Risk K2).
export function irsaliyeImleci(db: Db): Promise<IrsaliyeImleci | null> {
  return db.tek<IrsaliyeImleci>(
    `SELECT firma, donem, son_ref AS "sonRef", degisme, degisme_ref AS "degismeRef", sira, ref_denetimi AS "refDenetimi"
       FROM logo_irsaliye_imleci ORDER BY son_okuma DESC, firma DESC, donem DESC LIMIT 1`,
  );
}

// 3384 a: satın alma siparişlerine (CORE numarasıyla) bağlı Logo alış ve alış iade irsaliyesi satırları; iptal ve silinmiş başlık gelmez.
// Sipariş numarası da aranır: Logo kayıt numarası yalnız dönem içinde tekildir, numara başka dönemin aynı kayıtlı satırını ayırır.
export interface SiparisIrsaliyeSatiri {
  firma: number; donem: number; irsaliyeRef: number; fisNo: string | null; belgeNo: string | null; tarih: string; tur: number; faturaNo: string | null;
  siparisNo: string; siparisSatirRef: string; miktar: string | null; birim: string | null;
}
export function siparisIrsaliyeSatirlari(db: Db, nolar: readonly string[]): Promise<SiparisIrsaliyeSatiri[]> {
  if (nolar.length === 0) return Promise.resolve([]);
  return db.sorgu<SiparisIrsaliyeSatiri>(
    `SELECT i.firma, i.donem, i.logical_ref::int AS "irsaliyeRef", i.fis_no AS "fisNo", i.belge_no AS "belgeNo", i.tarih::text AS tarih, i.tur::int AS tur,
            i.fatura_no AS "faturaNo", s.siparis_no AS "siparisNo", s.siparis_satir_ref::text AS "siparisSatirRef", s.miktar::text AS miktar, s.birim
       FROM logo_irsaliye_satiri s JOIN logo_irsaliye i ON i.firma = s.firma AND i.donem = s.donem AND i.logical_ref = s.irsaliye_ref
      WHERE s.siparis_no = ANY($1::text[]) AND s.siparis_satir_ref IS NOT NULL AND i.tur IN (1, 6) AND NOT i.iptal AND i.logoda_yok IS NULL
      ORDER BY i.tarih, i.logical_ref, s.sira`,
    [[...new Set(nolar)]],
  );
}

// 3384 a: siparişlerin Logo'dan okunan fatura numaraları; yalnız en az bir kez okunmuş sipariş döner (okunmamış "fatura yok" sayılmaz).
export async function siparisFaturaNolari(db: Db, nolar: readonly string[]): Promise<Map<string, string[]>> {
  if (nolar.length === 0) return new Map();
  const r = await db.sorgu<{ siparisNo: string; faturalar: (string | null)[] }>(
    `SELECT o.siparis_no AS "siparisNo", coalesce(array_agg(f.fatura_no ORDER BY f.fatura_no) FILTER (WHERE f.fatura_no IS NOT NULL), '{}') AS faturalar
       FROM logo_fatura_okuma o LEFT JOIN logo_fatura f ON f.siparis_no = o.siparis_no
      WHERE o.siparis_no = ANY($1::text[])
      GROUP BY o.siparis_no`,
    [[...new Set(nolar)]],
  );
  return new Map(r.map((x) => [x.siparisNo, x.faturalar.filter((n): n is string => n !== null)]));
}

export function irsaliyeSonOkumasi(db: Db): Promise<string | null> {
  return db.tek<{ son: string | null }>(`SELECT ${zamanMetni('max(son_okuma)')} AS son FROM logo_irsaliye_imleci`).then((r) => r?.son ?? null);
}

// Kayıt imleci ve değişme imleci geri gitmez; ref denetimi zamanı yalnız verilince değişir.
export async function irsaliyeImleciYaz(db: Db, i: IrsaliyeImleci, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO logo_irsaliye_imleci (firma, donem, son_ref, degisme, degisme_ref, sira, son_okuma, ref_denetimi)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (firma, donem) DO UPDATE SET
       son_ref = GREATEST(logo_irsaliye_imleci.son_ref, EXCLUDED.son_ref),
       degisme = CASE WHEN logo_irsaliye_imleci.degisme IS NULL OR (EXCLUDED.degisme, EXCLUDED.degisme_ref) > (logo_irsaliye_imleci.degisme, logo_irsaliye_imleci.degisme_ref)
                      THEN EXCLUDED.degisme ELSE logo_irsaliye_imleci.degisme END,
       degisme_ref = CASE WHEN logo_irsaliye_imleci.degisme IS NULL OR (EXCLUDED.degisme, EXCLUDED.degisme_ref) > (logo_irsaliye_imleci.degisme, logo_irsaliye_imleci.degisme_ref)
                      THEN EXCLUDED.degisme_ref ELSE logo_irsaliye_imleci.degisme_ref END,
       sira = EXCLUDED.sira, son_okuma = EXCLUDED.son_okuma,
       ref_denetimi = COALESCE(EXCLUDED.ref_denetimi, logo_irsaliye_imleci.ref_denetimi)`,
    [i.firma, i.donem, i.sonRef, i.degisme, i.degismeRef, i.sira, zaman, i.refDenetimi],
  );
}

// Başlık yeniden okununca alanları ve satırları Logo'daki son hâle getirilir (iptal, faturalanma, satır değişimi); Logo'da yok işareti kalkar.
export async function irsaliyeleriYaz(db: Db, firma: number, donem: number, basliklar: readonly IrsaliyeBasligiOkuma[], zaman: Date): Promise<void> {
  if (basliklar.length === 0) return;
  const b = basliklar;
  await db.sorgu(
    `INSERT INTO logo_irsaliye (firma, donem, logical_ref, tur, fis_no, belge_no, tarih, iptal, ambar_no, cari_kodu, cari_adi, fatura_no, e_irsaliye, logo_degisme, logoda_yok, okuma_zamani)
     SELECT $1, $2, t.*, NULL, $15 FROM unnest($3::bigint[], $4::smallint[], $5::text[], $6::text[], $7::date[], $8::boolean[], $9::int[], $10::text[], $11::text[], $12::text[], $13::boolean[], $14::text[]) AS t
     ON CONFLICT (firma, donem, logical_ref) DO UPDATE SET
       tur = EXCLUDED.tur, fis_no = EXCLUDED.fis_no, belge_no = EXCLUDED.belge_no, tarih = EXCLUDED.tarih, iptal = EXCLUDED.iptal, ambar_no = EXCLUDED.ambar_no,
       cari_kodu = EXCLUDED.cari_kodu, cari_adi = EXCLUDED.cari_adi, fatura_no = EXCLUDED.fatura_no, e_irsaliye = EXCLUDED.e_irsaliye,
       logo_degisme = EXCLUDED.logo_degisme, logoda_yok = NULL, okuma_zamani = EXCLUDED.okuma_zamani`,
    [firma, donem, b.map((x) => x.kayitNo), b.map((x) => x.tur), b.map((x) => x.fisNo), b.map((x) => x.belgeNo), b.map((x) => x.tarih), b.map((x) => x.iptal),
      b.map((x) => x.ambarNo), b.map((x) => x.cariKodu), b.map((x) => x.cariAdi), b.map((x) => x.faturaNo), b.map((x) => x.eIrsaliye), b.map((x) => x.degisme), zaman],
  );
  await db.sorgu('DELETE FROM logo_irsaliye_satiri WHERE firma = $1 AND donem = $2 AND irsaliye_ref = ANY($3::bigint[])', [firma, donem, b.map((x) => x.kayitNo)]);
  const s = b.flatMap((x) => x.satirlar.map((y, i) => ({ ...y, irsaliye: x.kayitNo, sira: i + 1 })));
  if (s.length === 0) return;
  await db.sorgu(
    `INSERT INTO logo_irsaliye_satiri (firma, donem, logical_ref, irsaliye_ref, sira, malzeme_kodu, malzeme_adi, miktar, birim, fiyat, doviz_turu, doviz_fiyati, siparis_ref, siparis_satir_ref, siparis_no)
     SELECT $1, $2, t.* FROM unnest($3::bigint[], $4::bigint[], $5::smallint[], $6::text[], $7::text[], $8::numeric[], $9::text[], $10::numeric[], $11::int[], $12::numeric[],
       $13::bigint[], $14::bigint[], $15::text[]) AS t
     ON CONFLICT (firma, donem, logical_ref) DO UPDATE SET irsaliye_ref = EXCLUDED.irsaliye_ref, sira = EXCLUDED.sira, malzeme_kodu = EXCLUDED.malzeme_kodu,
       malzeme_adi = EXCLUDED.malzeme_adi, miktar = EXCLUDED.miktar, birim = EXCLUDED.birim, fiyat = EXCLUDED.fiyat, doviz_turu = EXCLUDED.doviz_turu,
       doviz_fiyati = EXCLUDED.doviz_fiyati, siparis_ref = EXCLUDED.siparis_ref, siparis_satir_ref = EXCLUDED.siparis_satir_ref, siparis_no = EXCLUDED.siparis_no`,
    [firma, donem, s.map((x) => x.kayitNo), s.map((x) => x.irsaliye), s.map((x) => x.sira), s.map((x) => x.malzemeKodu), s.map((x) => x.malzemeAdi), s.map((x) => x.miktar),
      s.map((x) => x.birim), s.map((x) => x.fiyat), s.map((x) => x.dovizTuru), s.map((x) => x.dovizFiyati), s.map((x) => x.siparisRef), s.map((x) => x.siparisSatirRef),
      s.map((x) => x.siparisNo)],
  );
}

// Denetim penceresindeki (tarih >= başlangıç) ve Logo'nun kayıt listesinde olmayan başlık "Logo'da yok" işaretlenir; listede yeniden görünen işaretten çıkar.
export async function irsaliyeYoklariniIsaretle(db: Db, firma: number, donem: number, baslangic: string, refler: readonly number[], zaman: Date): Promise<number> {
  const r = await db.sorgu<{ logical_ref: number }>(
    `UPDATE logo_irsaliye SET logoda_yok = $5
      WHERE firma = $1 AND donem = $2 AND tarih >= $3::date AND logoda_yok IS NULL AND NOT (logical_ref = ANY($4::bigint[])) RETURNING logical_ref`,
    [firma, donem, baslangic, refler, zaman],
  );
  await db.sorgu(
    'UPDATE logo_irsaliye SET logoda_yok = NULL WHERE firma = $1 AND donem = $2 AND logoda_yok IS NOT NULL AND logical_ref = ANY($3::bigint[])',
    [firma, donem, refler],
  );
  return r.length;
}

export interface IrsaliyeAynaBasligi {
  firma: number;
  donem: number;
  kayitNo: number;
  tur: IrsaliyeTuru;
  fisNo: string | null;
  belgeNo: string | null;
  tarih: string;
  iptal: boolean;
  logodaYok: boolean;
  cariKodu: string | null;
  cariAdi: string | null;
  eIrsaliye: boolean;
  faturaNo: string | null;
  ambar: string | null;
  okumaZamani: string;
}
export interface IrsaliyeAynaSatiri {
  firma: number;
  donem: number;
  irsaliyeRef: number;
  kayitNo: number;
  malzemeKodu: string | null;
  malzemeAdi: string | null;
  miktar: string | null;
  birim: string | null;
  fiyat: string | null;
  tutar: string | null;
  dovizTuru: number | null;
  dovizFiyati: string | null;
  siparisSatirRef: number | null;
  siparisNo: string | null;
}

const BASLIK_ALANLARI = `i.firma, i.donem, i.logical_ref AS "kayitNo", i.tur, i.fis_no AS "fisNo", i.belge_no AS "belgeNo", i.tarih, i.iptal,
  (i.logoda_yok IS NOT NULL) AS "logodaYok", i.cari_kodu AS "cariKodu", i.cari_adi AS "cariAdi", i.e_irsaliye AS "eIrsaliye", i.fatura_no AS "faturaNo",
  CASE WHEN i.ambar_no IS NULL THEN NULL ELSE COALESCE(a.ad, 'Ambar ' || i.ambar_no::text) END AS ambar, ${zamanMetni('i.okuma_zamani')} AS "okumaZamani"`;
const SATIR_ALANLARI = `s.firma, s.donem, s.irsaliye_ref AS "irsaliyeRef", s.logical_ref AS "kayitNo", s.malzeme_kodu AS "malzemeKodu", s.malzeme_adi AS "malzemeAdi",
  s.miktar::text AS miktar, s.birim, s.fiyat::text AS fiyat, (s.miktar * s.fiyat)::text AS tutar, s.doviz_turu AS "dovizTuru", s.doviz_fiyati::text AS "dovizFiyati",
  s.siparis_satir_ref AS "siparisSatirRef", s.siparis_no AS "siparisNo"`;

// Liste: türler ve günle süzülür, arama fiş no, belge no, cari ve satırdaki malzemede (Türkçe sadeleştirmeyle); en yeni tarih önce. Eşleşme bellekte hesaplanır.
export function irsaliyeBasliklari(db: Db, f: { turler: readonly number[]; baslangic: string; ara: string | null }): Promise<IrsaliyeAynaBasligi[]> {
  return db.sorgu<IrsaliyeAynaBasligi>(
    `SELECT ${BASLIK_ALANLARI}
       FROM logo_irsaliye i LEFT JOIN logo_ambar a ON a.kod = i.ambar_no::text
      WHERE i.tur = ANY($1::smallint[]) AND i.tarih >= $2::date
        AND ($3::text IS NULL OR public.arama_sade(i.fis_no) LIKE $3 OR public.arama_sade(i.belge_no) LIKE $3
             OR public.arama_sade(i.cari_kodu) LIKE $3 OR public.arama_sade(i.cari_adi) LIKE $3
             OR EXISTS (SELECT 1 FROM logo_irsaliye_satiri s WHERE s.firma = i.firma AND s.donem = i.donem AND s.irsaliye_ref = i.logical_ref
                          AND (public.arama_sade(s.malzeme_kodu) LIKE $3 OR public.arama_sade(s.malzeme_adi) LIKE $3)))
      ORDER BY i.tarih DESC, i.logical_ref DESC`,
    [f.turler, f.baslangic, f.ara === null ? null : icindeDeseni(f.ara)],
  );
}

export function irsaliyeBasligi(db: Db, firma: number, donem: number, kayitNo: number): Promise<IrsaliyeAynaBasligi | null> {
  return db.tek<IrsaliyeAynaBasligi>(
    `SELECT ${BASLIK_ALANLARI} FROM logo_irsaliye i LEFT JOIN logo_ambar a ON a.kod = i.ambar_no::text
      WHERE i.firma = $1 AND i.donem = $2 AND i.logical_ref = $3`,
    [firma, donem, kayitNo],
  );
}

export function irsaliyeSatirlari(db: Db, basliklar: readonly Pick<IrsaliyeAynaBasligi, 'firma' | 'donem' | 'kayitNo'>[]): Promise<IrsaliyeAynaSatiri[]> {
  if (basliklar.length === 0) return Promise.resolve([]);
  return db.sorgu<IrsaliyeAynaSatiri>(
    `SELECT ${SATIR_ALANLARI} FROM logo_irsaliye_satiri s
       JOIN unnest($1::int[], $2::int[], $3::bigint[]) AS k(firma, donem, ref) ON k.firma = s.firma AND k.donem = s.donem AND k.ref = s.irsaliye_ref
      ORDER BY s.firma, s.donem, s.irsaliye_ref, s.sira`,
    [basliklar.map((b) => b.firma), basliklar.map((b) => b.donem), basliklar.map((b) => b.kayitNo)],
  );
}

// Sipariş satırı başına aynadaki net alış irsaliyesi: satın alma (1) eksi satın alma iade (6); iptal ve Logo'da olmayan başlık sayılmaz.
export async function logoSiparisNetleri(db: Db, firma: number, donem: number, siparisSatirRefleri: readonly number[]): Promise<Map<number, string>> {
  if (siparisSatirRefleri.length === 0) return new Map();
  const r = await db.sorgu<{ ref: number; net: string }>(
    `SELECT s.siparis_satir_ref AS ref, sum(CASE WHEN i.tur = 6 THEN -s.miktar ELSE s.miktar END)::text AS net
       FROM logo_irsaliye_satiri s JOIN logo_irsaliye i ON i.firma = s.firma AND i.donem = s.donem AND i.logical_ref = s.irsaliye_ref
      WHERE s.firma = $1 AND s.donem = $2 AND s.siparis_satir_ref = ANY($3::bigint[]) AND i.tur IN (1, 6) AND NOT i.iptal AND i.logoda_yok IS NULL AND s.miktar IS NOT NULL
      GROUP BY s.siparis_satir_ref`,
    [firma, donem, [...new Set(siparisSatirRefleri)]],
  );
  return new Map(r.map((x) => [Number(x.ref), x.net]));
}

// 3360 a: Logo kayıt numarasından o kayda gitmiş CORE belgesi (giden kutusu; gönderildi ya da Logo'da vardı).
export async function logoKaydinaGidenler(db: Db, belgeTuru: string, kayitNolari: readonly string[]): Promise<{ belgeNo: number; logoKayitNo: string }[]> {
  if (kayitNolari.length === 0) return [];
  return db.sorgu(
    `SELECT belge_no AS "belgeNo", logo_kayit_no AS "logoKayitNo" FROM logo_giden
      WHERE belge_turu = $1 AND islem = 'gonder' AND son_sonuc IN ('gonderildi', 'zaten-vardi') AND logo_kayit_no = ANY($2::text[])
      ORDER BY belge_no`,
    [belgeTuru, kayitNolari],
  );
}

// 3360-2 a: elle bağlama. Satır "zaten-vardi" sonucuyla ve Logo kayıt numarasıyla yazılır; deneme izi kalır, niyet ve bekleme boşalır.
export async function elleBagYaz(db: Db, belgeTuru: string, no: number, kayitNo: string, kisiId: number, zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO logo_giden AS g (belge_turu, belge_no, islem, son_deneme, son_sonuc, logo_kayit_no, elle_baglandi, elle_baglayan)
     VALUES ($1, $2, 'gonder', $4, 'zaten-vardi', $3, $4, $5)
     ON CONFLICT (belge_turu, belge_no, islem) DO UPDATE SET
       niyet_zamani = NULL, ardisik_hata = 0, son_deneme = $4, son_sonuc = 'zaten-vardi', son_hata = NULL, sonraki_deneme = NULL,
       logo_kayit_no = $3, elle_baglandi = $4, elle_baglayan = $5`,
    [belgeTuru, no, kayitNo, zaman, kisiId],
  );
}

export function elleBagliNolar(db: Db, belgeTuru: string, nolar: readonly number[]): Promise<{ belgeNo: number; logoKayitNo: string }[]> {
  if (nolar.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `SELECT belge_no AS "belgeNo", logo_kayit_no AS "logoKayitNo" FROM logo_giden
      WHERE belge_turu = $1 AND islem = 'gonder' AND elle_baglandi IS NOT NULL AND belge_no = ANY($2::int[]) ORDER BY belge_no`,
    [belgeTuru, nolar],
  );
}

export async function elleBagliKayitMi(db: Db, belgeTuru: string, kayitNo: string): Promise<boolean> {
  return (await db.tek<{ var: boolean }>(
    `SELECT true AS var FROM logo_giden WHERE belge_turu = $1 AND islem = 'gonder' AND elle_baglandi IS NOT NULL AND logo_kayit_no = $2 LIMIT 1`,
    [belgeTuru, kayitNo],
  )) !== null;
}

// Bağ kaldırılınca belge hiç gitmemiş gibi sıraya döner; deneme sayısı iz olarak kalır.
export async function elleBagKaldir(db: Db, belgeTuru: string, no: number): Promise<boolean> {
  return (await db.tek<{ belgeNo: number }>(
    `UPDATE logo_giden SET son_deneme = NULL, son_sonuc = NULL, logo_kayit_no = NULL, ardisik_hata = 0, sonraki_deneme = NULL,
            elle_baglandi = NULL, elle_baglayan = NULL
      WHERE belge_turu = $1 AND belge_no = $2 AND islem = 'gonder' AND elle_baglandi IS NOT NULL RETURNING belge_no AS "belgeNo"`,
    [belgeTuru, no],
  )) !== null;
}

/* ---------------- 3445: yönetim sayfası, akış günlüğü ---------------- */

export interface GunlukKaydi { akis: string; yon: 'okuma' | 'yazma' | 'istek' | 'baglanti'; sonuc: 'tamam' | 'hata'; sayi: number | null; ileti: string | null }
export interface GunlukSatiri extends GunlukKaydi { id: number; zaman: string }

export async function gunlukYaz(db: Db, k: GunlukKaydi, zaman: Date): Promise<void> {
  await db.sorgu('INSERT INTO logo_akis_gunlugu (zaman, akis, yon, sonuc, sayi, ileti) VALUES ($1, $2, $3, $4, $5, $6)', [zaman, k.akis, k.yon, k.sonuc, k.sayi, k.ileti]);
}

export async function gunlukTemizle(db: Db, sinir: Date): Promise<void> {
  await db.sorgu('DELETE FROM logo_akis_gunlugu WHERE zaman < $1', [sinir]);
}

export function gunlukOku(db: Db, o: { akis: string | null; yalnizHata: boolean; once: number | null; sinir: number }): Promise<GunlukSatiri[]> {
  return db.sorgu<GunlukSatiri>(
    `SELECT id::float8 AS id, ${zamanMetni('zaman')} AS zaman, akis, yon, sonuc, sayi, ileti
       FROM logo_akis_gunlugu
      WHERE ($1::text IS NULL OR akis = $1) AND (NOT $2 OR sonuc = 'hata') AND ($3::bigint IS NULL OR id < $3)
      ORDER BY id DESC LIMIT $4`,
    [o.akis, o.yalnizHata, o.once, o.sinir],
  );
}

// Her akışın son günlük satırı (ekrandaki "son sonuç").
export function gunlukSonlari(db: Db): Promise<GunlukSatiri[]> {
  return db.sorgu<GunlukSatiri>(
    `SELECT DISTINCT ON (akis) id::float8 AS id, ${zamanMetni('zaman')} AS zaman, akis, yon, sonuc, sayi, ileti
       FROM logo_akis_gunlugu WHERE zaman >= $1 ORDER BY akis, zaman DESC, id DESC`,
    [new Date(Date.now() - 30 * 24 * 3_600_000)],
  );
}

// Bir akışın son günlük satırı (yoksa null).
export function gunlukSonu(db: Db, akis: string): Promise<GunlukSatiri | null> {
  return db.tek<GunlukSatiri>(
    `SELECT id::float8 AS id, ${zamanMetni('zaman')} AS zaman, akis, yon, sonuc, sayi, ileti
       FROM logo_akis_gunlugu WHERE akis = $1 ORDER BY zaman DESC, id DESC LIMIT 1`,
    [akis],
  );
}

export async function gunlukHataSayisi(db: Db, bas: Date): Promise<number> {
  return (await db.tek<{ n: number }>("SELECT count(*)::int AS n FROM logo_akis_gunlugu WHERE sonuc = 'hata' AND zaman >= $1", [bas]))?.n ?? 0;
}

// Gönderimi başarısız olup yeniden denenmeyi bekleyen belgeler, belge türüne göre.
export function bekleyenGidenler(db: Db): Promise<{ belgeTuru: string; sayi: number }[]> {
  return db.sorgu<{ belgeTuru: string; sayi: number }>(
    `SELECT belge_turu AS "belgeTuru", count(*)::int AS sayi FROM logo_giden
      WHERE son_sonuc IS NOT NULL AND son_sonuc NOT IN ('gonderildi', 'zaten-vardi') GROUP BY belge_turu
     UNION ALL
     SELECT 'malzeme-fisi', count(*)::int FROM logo_malzeme_fisi_giden
      WHERE son_sonuc IS NOT NULL AND son_sonuc NOT IN ('gonderildi', 'zaten-vardi')`,
  );
}
