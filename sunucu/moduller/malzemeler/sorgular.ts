import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { LOGO_TUR_KARSILIGI_TURLERI } from '#paylasilan/sozlesme/malzemeler.ts';
import type {
  HizmetYonu, KatalogKartDurumu, KatalogMalzemeOzeti, KatalogTuru, LogoGonderimDurumu, LogoKarsilikCesidi, LogoKarsiligi,
} from '#paylasilan/sozlesme/malzemeler.ts';

/* ---------------- Malzeme Kataloğu (prototip) kartları ---------------- */

export interface KatalogKartiSatiri {
  no: number;
  kimlik: string;
  aktifOlmus: boolean;
  logoKayitNo: string | null;
  stokKodu: string;
  onek: string;
  onayDurumu: KatalogKartDurumu;
  surum: number;
  gonderenKisiId: number | null;
  acanKisiId: number;
  tur: string;
  hizmetYonu: string | null;
  benzersizAnahtar: string | null;
  mukerrerGerekcesi: string | null;
  kayit: Record<string, unknown>;
}

// `guncelleme` yazan transaction'ın başladığı andır; transaction okumadan önce başlayıp sonra biterse kartın anı okuma
// anından eskidir. Değişenler bu yüzden 5 dakika geriden okunur (yazma transaction'ları saniyelerle sınırlı); fazlası
// yeniden gönderilir, eksik kalmaz.
const DEGISENLER = `($1::timestamptz IS NULL OR guncelleme > $1::timestamptz - interval '5 minutes')`;

// Sıra kart numarasıdır (değişmez, yeni kart sona eklenir): düzenleme sayfalar arasında kart kaydırmaz.
export function katalogKartlari(
  db: Db, sonra: string | null, d: Dilim,
): Promise<{ kimlik: string; no: number; kayit: Record<string, unknown> | null; surum: number }[]> {
  return db.sorgu(
    `SELECT kimlik, no, CASE WHEN onay_durumu = 'iptal' THEN NULL ELSE kayit END AS kayit, surum
       FROM malzeme_katalog_karti WHERE ${DEGISENLER} ORDER BY no LIMIT $2 OFFSET $3`,
    [sonra, d.sinir, d.atla],
  );
}

export async function katalogKartSayisi(db: Db, sonra: string | null): Promise<number> {
  const satir = await db.tek<{ sayi: number }>(`SELECT count(*)::int AS sayi FROM malzeme_katalog_karti WHERE ${DEGISENLER}`, [sonra]);
  return satir?.sayi ?? 0;
}

export async function okumaAni(db: Db): Promise<string> {
  const satir = await db.tek<{ an: string }>(`SELECT ${zamanMetni('now()')} AS an`);
  return satir!.an;
}

export function katalogKartiKilitle(db: Db, kimlik: string): Promise<KatalogKartiSatiri | null> {
  return db.tek<KatalogKartiSatiri>(
    `SELECT no, kimlik, aktif_oldu AS "aktifOlmus", logo_kayit_no AS "logoKayitNo", stok_kodu AS "stokKodu", onek, onay_durumu AS "onayDurumu", surum, gonderen_kisi_id AS "gonderenKisiId",
            acan_kisi_id AS "acanKisiId", tur, hizmet_yonu AS "hizmetYonu", benzersiz_anahtar AS "benzersizAnahtar",
            mukerrer_gerekcesi AS "mukerrerGerekcesi", kayit
       FROM malzeme_katalog_karti WHERE kimlik = $1 FOR UPDATE`,
    [kimlik],
  );
}

// Önek satırı yoksa açılır; satır kilidi aynı önekte eşzamanlı iki kartın aynı sırayı almasını önler.
export async function katalogSiraAl(db: Db, onek: string): Promise<number> {
  const satir = await db.tek<{ son_sira: number }>(
    `INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 1)
     ON CONFLICT (onek) DO UPDATE SET son_sira = malzeme_katalog_kod_sirasi.son_sira + 1
     RETURNING son_sira`,
    [onek],
  );
  return satir!.son_sira;
}

export function katalogAyniAnahtarli(db: Db, anahtar: string, haric: string): Promise<{ kimlik: string; stokKodu: string }[]> {
  return db.sorgu(
    `SELECT kimlik, stok_kodu AS "stokKodu" FROM malzeme_katalog_karti
      WHERE benzersiz_anahtar = $1 AND kimlik <> $2 AND onay_durumu IN ('taslak', 'onayda', 'aktif')
      ORDER BY stok_kodu`,
    [anahtar, haric],
  );
}

export interface KatalogKartiYazimi {
  kimlik: string;
  tur: string;
  hizmetYonu: string | null;
  benzersizAnahtar: string | null;
  // Ekranın türe göre kurduğu anahtar; çakışma alanı seçili türde benzersiz anahtar ondan ayrılır (MKK-16).
  varsayilanAnahtar: string | null;
  mukerrerGerekcesi: string | null;
  onayDurumu: string;
  kayit: Record<string, unknown>;
  kisiId: number;
  gonderenKisiId: number | null;
  onaylayanKisiId: number | null;
  onaylandi: boolean;
  dortGozsuz: boolean;
  // S4 b (#783): Logo'ya gitmiş kartın adı değişti; Logo güncellemesi kuyruğa girer (yalnız güncellemede okunur).
  logoAdGuncellemesi: boolean;
  // null: özet ağırlık taşımadı, kayıtlı değerler korunur (eklemede boş kalır).
  agirlik: { birimAgirlikKg: number | null; kaliteAdi: string | null; formAdi: string | null } | null;
  netAgirlikKg: number | null;
  tedarikciFirmaId: number | null;
  olcuAletiId: number | null;
  // null: özet açıklama taşımadı, kayıtlı değerler korunur (eklemede boş kalır).
  aciklamalar: [string | null, string | null, string | null] | null;
  // 323 b: kartın alış birimi ve katsayısı her yazımda kayıttan yeniden yazılır; yoksa ikisi de boş.
  birimDonusumu: { alisBirimi: string; katsayi: string } | null;
}

// Stok kodu veritabanında türer; kart içindeki kod da aynı değere çekilir ki prototip listede aynısını görsün.
export async function katalogKartiEkle(db: Db, k: KatalogKartiYazimi, onek: string, sira: number): Promise<{ stokKodu: string; surum: number }> {
  const satir = await db.tek<{ stokKodu: string; surum: number }>(
    `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, benzersiz_anahtar, mukerrer_gerekcesi, onay_durumu, kayit,
                                        acan_kisi_id, gonderen_kisi_id, onaylayan_kisi_id, onaylama, dort_gozsuz_onay, guncelleyen_kisi_id, hizmet_yonu,
                                        varsayilan_anahtar, birim_agirlik_kg, kalite_adi, form_adi, net_agirlik_kg, tedarikci_firma_id,
                                        aciklama_1, aciklama_2, aciklama_3, alis_birimi, alis_katsayisi, olcu_aleti_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CASE WHEN $12 THEN now() END, $13, $9, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25::numeric, $26)
     RETURNING stok_kodu AS "stokKodu", surum`,
    [k.kimlik, k.tur, onek, sira, k.benzersizAnahtar, k.mukerrerGerekcesi, k.onayDurumu, k.kayit, k.kisiId, k.gonderenKisiId,
      k.onaylayanKisiId, k.onaylandi, k.dortGozsuz, k.hizmetYonu, k.varsayilanAnahtar,
      k.agirlik?.birimAgirlikKg ?? null, k.agirlik?.kaliteAdi ?? null, k.agirlik?.formAdi ?? null, k.netAgirlikKg, k.tedarikciFirmaId,
      k.aciklamalar?.[0] ?? null, k.aciklamalar?.[1] ?? null, k.aciklamalar?.[2] ?? null, k.birimDonusumu?.alisBirimi ?? null, k.birimDonusumu?.katsayi ?? null,
      k.olcuAletiId],
  );
  await db.sorgu(
    `UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{com,kod}', to_jsonb(stok_kodu), true)
      WHERE kimlik = $1 AND jsonb_typeof(kayit -> 'com') = 'object'`,
    [k.kimlik],
  );
  return satir!;
}

// `yeniKod` verilirse (taslakta tür değişimi) tür, önek ve sıra birlikte yazılır; kart içindeki kod da yeni koda çekilir
// (türetilen sütun UPDATE içinde eski değerini taşıdığından yeni kod elle geçirilir).
export interface KatalogYeniKod { tur: string; onek: string; sira: number; stokKodu: string }

export async function katalogKartiGuncelle(db: Db, k: KatalogKartiYazimi, yeniKod: KatalogYeniKod | null): Promise<{ stokKodu: string; surum: number }> {
  const satir = await db.tek<{ stokKodu: string; surum: number }>(
    `UPDATE malzeme_katalog_karti
        SET benzersiz_anahtar = $2, mukerrer_gerekcesi = $3, onay_durumu = $4,
            tur = COALESCE($11::text, tur), onek = COALESCE($12::text, onek), sira_no = COALESCE($13::int, sira_no),
            kayit = CASE WHEN jsonb_typeof($5::jsonb -> 'com') = 'object' THEN jsonb_set($5::jsonb, '{com,kod}', to_jsonb(COALESCE($14::text, stok_kodu)), true) ELSE $5::jsonb END,
            gonderen_kisi_id = $6,
            onaylayan_kisi_id = CASE WHEN $7 THEN $8::int WHEN $4 IN ('taslak', 'onayda') THEN NULL ELSE onaylayan_kisi_id END,
            onaylama = CASE WHEN $7 THEN now() WHEN $4 IN ('taslak', 'onayda') THEN NULL ELSE onaylama END,
            dort_gozsuz_onay = CASE WHEN $7 THEN $9 ELSE dort_gozsuz_onay END,
            hizmet_yonu = $15, surum = surum + 1, guncelleyen_kisi_id = $10, guncelleme = now(),
            logo_guncelleme_durumu = CASE WHEN $16 THEN 'bekliyor' ELSE logo_guncelleme_durumu END,
            logo_guncelleme_hata = CASE WHEN $16 THEN NULL ELSE logo_guncelleme_hata END,
            logo_guncelleme_zamani = CASE WHEN $16 THEN now() ELSE logo_guncelleme_zamani END,
            varsayilan_anahtar = $17,
            birim_agirlik_kg = CASE WHEN $18 THEN $19::numeric ELSE birim_agirlik_kg END,
            kalite_adi = CASE WHEN $18 THEN $20::text ELSE kalite_adi END,
            form_adi = CASE WHEN $18 THEN $21::text ELSE form_adi END,
            net_agirlik_kg = $22, tedarikci_firma_id = $23,
            aciklama_1 = CASE WHEN $24 THEN $25::text ELSE aciklama_1 END,
            aciklama_2 = CASE WHEN $24 THEN $26::text ELSE aciklama_2 END,
            aciklama_3 = CASE WHEN $24 THEN $27::text ELSE aciklama_3 END,
            alis_birimi = $28, alis_katsayisi = $29::numeric, olcu_aleti_id = $30
      WHERE kimlik = $1
      RETURNING stok_kodu AS "stokKodu", surum`,
    [k.kimlik, k.benzersizAnahtar, k.mukerrerGerekcesi, k.onayDurumu, k.kayit, k.gonderenKisiId, k.onaylandi, k.onaylayanKisiId, k.dortGozsuz, k.kisiId,
      yeniKod?.tur ?? null, yeniKod?.onek ?? null, yeniKod?.sira ?? null, yeniKod?.stokKodu ?? null, k.hizmetYonu, k.logoAdGuncellemesi,
      k.varsayilanAnahtar, k.agirlik !== null, k.agirlik?.birimAgirlikKg ?? null, k.agirlik?.kaliteAdi ?? null, k.agirlik?.formAdi ?? null,
      k.netAgirlikKg, k.tedarikciFirmaId, k.aciklamalar !== null, k.aciklamalar?.[0] ?? null, k.aciklamalar?.[1] ?? null, k.aciklamalar?.[2] ?? null,
      k.birimDonusumu?.alisBirimi ?? null, k.birimDonusumu?.katsayi ?? null, k.olcuAletiId],
  );
  return satir!;
}

// MKK-16: çakışma alanları değişince türün kartlarının anahtarı yeniden kurulur. Sürüm artmaz: anahtar kartın içeriği değil, ayarın sonucudur.
export function katalogTurAnahtarKartlari(db: Db, tur: string): Promise<{ kimlik: string; stokKodu: string; kayit: Record<string, unknown>;
  varsayilanAnahtar: string | null; etkin: boolean; gerekceli: boolean }[]> {
  return db.sorgu(
    `SELECT kimlik, stok_kodu AS "stokKodu", kayit, varsayilan_anahtar AS "varsayilanAnahtar",
            onay_durumu IN ('taslak', 'onayda', 'aktif') AS etkin, mukerrer_gerekcesi IS NOT NULL AS gerekceli
       FROM malzeme_katalog_karti WHERE tur = $1 ORDER BY stok_kodu`,
    [tur],
  );
}
export async function katalogAnahtarlariYaz(db: Db, satirlar: readonly { kimlik: string; anahtar: string | null }[]): Promise<void> {
  if (!satirlar.length) return;
  // Önce boşaltılır: tekil dizin satır satır denetlenir; iki kartın anahtarı yer değiştirirken arada çakışma görünmesin.
  const kimlikler = satirlar.map((s) => s.kimlik);
  await db.sorgu(`UPDATE malzeme_katalog_karti SET benzersiz_anahtar = NULL WHERE kimlik = ANY($1::text[])`, [kimlikler]);
  await db.sorgu(
    `UPDATE malzeme_katalog_karti k SET benzersiz_anahtar = y.anahtar
       FROM unnest($1::text[], $2::text[]) AS y(kimlik, anahtar)
      WHERE k.kimlik = y.kimlik`,
    [kimlikler, satirlar.map((s) => s.anahtar)],
  );
}

export async function katalogKartiIptal(db: Db, kimlik: string, kisiId: number): Promise<void> {
  await db.sorgu(
    `UPDATE malzeme_katalog_karti SET onay_durumu = 'iptal', surum = surum + 1, guncelleyen_kisi_id = $2, guncelleme = now() WHERE kimlik = $1`,
    [kimlik, kisiId],
  );
}

// Ad yalnız `kayit.com.ad` metin ise ve boş değilse vardır; `com` nesne değilse ya da ad metin değilse null.
const KATALOG_AD = `CASE WHEN jsonb_typeof(kayit -> 'com') = 'object' AND jsonb_typeof(kayit -> 'com' -> 'ad') = 'string'
                         THEN NULLIF(btrim(kayit -> 'com' ->> 'ad'), '') END`;

// Birim ekranın yazdığı yerde durur: `kayit.com.birim` (her tür). Yalnız dolu metin birimdir; ekranın varsayılan birimi ('adet' vb.) uydurulmaz.
const KATALOG_BIRIM = `CASE WHEN jsonb_typeof(kayit -> 'com') = 'object' AND jsonb_typeof(kayit -> 'com' -> 'birim') = 'string'
                           THEN NULLIF(btrim(kayit -> 'com' ->> 'birim'), '') END`;

// Kategori (hizmette hizmet grubu) yalnız sarf, demirbaş ve hizmette, `kayit.g.kat` dolu metin ise; adı kategori listesinden (listede yoksa null).
const KATALOG_KATEGORI = `CASE WHEN k.tur IN ('sarf', 'demirbas', 'hizmet') AND jsonb_typeof(k.kayit -> 'g') = 'object' AND jsonb_typeof(k.kayit -> 'g' -> 'kat') = 'string'
                              THEN NULLIF(btrim(k.kayit -> 'g' ->> 'kat'), '') END`;
const OZET_SECIMI = `k.no AS id, k.kimlik, k.stok_kodu AS kod, k.tur, ${KATALOG_AD.replaceAll('kayit', 'k.kayit')} AS ad,
       k.onay_durumu AS "onayDurumu", ${KATALOG_BIRIM.replaceAll('kayit', 'k.kayit')} AS birim,
       ${KATALOG_KATEGORI} AS kategori, kt.ad AS "kategoriAdi", k.hizmet_yonu AS "hizmetYonu"
  FROM malzeme_katalog_karti k
  LEFT JOIN malzeme_kategorisi kt ON kt.tur = k.tur AND kt.kod = ${KATALOG_KATEGORI}`;
// Eski / ERP kodu ve tedarikçi kodu da aranır: katalog ekranının kendi araması bu alanlara bakar, üst arama ve seçiciler aynı kartı bulmalı.
const COM_METNI = (alan: string): string => `CASE WHEN jsonb_typeof(k.kayit -> 'com' -> '${alan}') = 'string' THEN k.kayit -> 'com' ->> '${alan}' END`;
const ARAMA_KOSULU = `k.onay_durumu <> 'iptal'
        AND ($1::text IS NULL OR k.stok_kodu ILIKE $1 OR ${KATALOG_AD.replaceAll('kayit', 'k.kayit')} ILIKE $1 OR k.no = $2::int
             OR ${COM_METNI('eskiKod')} ILIKE $1 OR ${COM_METNI('tkod')} ILIKE $1)
        AND (cardinality($3::text[]) = 0 OR k.tur = ANY($3::text[]))
        AND (NOT $4::boolean OR k.onay_durumu = 'aktif')
        AND ($5::text IS NULL OR k.hizmet_yonu = $5)`;

export function katalogMalzemeOzeti(db: Db, no: number): Promise<KatalogMalzemeOzeti | null> {
  return db.tek<KatalogMalzemeOzeti>(`SELECT ${OZET_SECIMI} WHERE k.no = $1`, [no]);
}

export function katalogMalzemeOzetleri(db: Db, nolar: number[]): Promise<KatalogMalzemeOzeti[]> {
  return db.sorgu<KatalogMalzemeOzeti>(`SELECT ${OZET_SECIMI} WHERE k.no = ANY($1::int[])`, [nolar]);
}

// CNC takım stoğu (163 b): kütüphane kimliği bağlı kartlar; iptal kart da döner (stoğu durur), durumu çağıran görür.
// null bütün bağlı kartlardır.
export function cncKimlikliKartlar(db: Db, kimlikler: readonly string[] | null): Promise<(KatalogMalzemeOzeti & { cncKimligi: string })[]> {
  return db.sorgu(`SELECT ${OZET_SECIMI.replace(' AS "hizmetYonu"', ' AS "hizmetYonu", k.cnc_kutuphane_kimligi AS "cncKimligi"')}
     WHERE k.cnc_kutuphane_kimligi IS NOT NULL AND ($1::text[] IS NULL OR k.cnc_kutuphane_kimligi = ANY($1::text[])) ORDER BY k.no`, [kimlikler]);
}

// Kimlik başka kartta bağlıysa oradan kalkar (tekil); null kartın bağını kaldırır. Kart yoksa ya da türü sarf ve demirbaş değilse
// satır dönmez. Önceki kart (bağı kalkan) döner.
export async function cncKimligiYaz(db: Db, no: number, kimlik: string | null): Promise<{ bagli: boolean; oncekiNo: number | null }> {
  const once = kimlik === null ? null : await db.tek<{ no: number }>(
    `UPDATE malzeme_katalog_karti SET cnc_kutuphane_kimligi = NULL WHERE cnc_kutuphane_kimligi = $1 AND no <> $2 RETURNING no`, [kimlik, no]);
  const bag = await db.tek<{ no: number }>(
    `UPDATE malzeme_katalog_karti SET cnc_kutuphane_kimligi = $2 WHERE no = $1 AND ($2::text IS NULL OR tur IN ('sarf', 'demirbas')) RETURNING no`, [no, kimlik]);
  return { bagli: bag !== null, oncekiNo: once?.no ?? null };
}

// Metin stok kodunda ya da adda (büyük-küçük harf duyarsız) geçer; yalnız rakamsa kart no'su da eşleşir. Sıra: stok kodu, no.
export async function katalogMalzemeAra(
  db: Db, g: { metin: string | null; turler: readonly string[]; yalnizAktif: boolean; hizmetYonu: string | null; sinir: number; atla: number },
): Promise<{ satirlar: KatalogMalzemeOzeti[]; toplam: number }> {
  const desen = g.metin === null ? null : `%${g.metin.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const no = g.metin !== null && /^\d{1,9}$/.test(g.metin) ? Number(g.metin) : null;
  const p = [desen, no, g.turler, g.yalnizAktif, g.hizmetYonu];
  const satirlar = await db.sorgu<KatalogMalzemeOzeti>(
    `SELECT ${OZET_SECIMI} WHERE ${ARAMA_KOSULU} ORDER BY k.stok_kodu, k.no LIMIT $6 OFFSET $7`, [...p, g.sinir, g.atla]);
  const sayim = await db.tek<{ toplam: string }>(`SELECT count(*) AS toplam FROM malzeme_katalog_karti k WHERE ${ARAMA_KOSULU}`, p);
  return { satirlar, toplam: Number(sayim?.toplam ?? 0) };
}

// Kg fiyatı (satın alma) için kartın kalitesi ve formu `kayit`'tadır: hazır kalitede `grade`, özel kalitede `custom.kod` (yoksa `custom.ad`).
// Yalnız dolu metin alınır; hammadde dışı kartta kalite ve form yoktur, uydurulmaz.
const KATALOG_METIN = (yol: string): string => `NULLIF(btrim(CASE WHEN jsonb_typeof(k.kayit #> '{${yol}}') = 'string' THEN k.kayit #>> '{${yol}}' END), '')`;
const KATALOG_KALITE = `CASE WHEN k.kayit ->> 'grade' = '__ozel' THEN COALESCE(${KATALOG_METIN('custom,kod')}, ${KATALOG_METIN('custom,ad')})
                             ELSE ${KATALOG_METIN('grade')} END`;

export interface KatalogMaliyetSatiri {
  no: number; tur: string; kaliteKodu: string | null; kaliteAdi: string | null; aile: string | null; form: string | null; formAdi: string | null;
  stokBirimi: string | null; birimKg: number | null; netKg: number | null;
}

export function katalogMaliyetSatirlari(db: Db, nolar: number[]): Promise<KatalogMaliyetSatiri[]> {
  return db.sorgu<KatalogMaliyetSatiri>(
    `SELECT k.no, k.tur, CASE WHEN k.tur = 'hammadde' THEN ${KATALOG_KALITE} END AS "kaliteKodu",
            CASE WHEN k.tur = 'hammadde' THEN ${KATALOG_METIN('fam')} END AS aile,
            CASE WHEN k.tur = 'hammadde' THEN ${KATALOG_METIN('form')} END AS form,
            ${KATALOG_BIRIM.replaceAll('kayit', 'k.kayit')} AS "stokBirimi",
            k.kalite_adi AS "kaliteAdi", k.form_adi AS "formAdi", k.birim_agirlik_kg::float8 AS "birimKg",
            k.net_agirlik_kg::float8 AS "netKg"
       FROM malzeme_katalog_karti k WHERE k.no = ANY($1::int[])`, [nolar]);
}

export interface KatalogResimSatiri { no: number; resimNo: string | null; revizyon: string | null }

// Teknik resim no ve revizyon yalnız yarı mamul ve mamulde anlamlıdır; başka türde kart null'larla döner.
export function katalogResimSatirlari(db: Db, nolar: number[]): Promise<KatalogResimSatiri[]> {
  return db.sorgu<KatalogResimSatiri>(
    `SELECT k.no, CASE WHEN k.tur IN ('mamul', 'yarimamul') THEN ${KATALOG_METIN('g,resim')} END AS "resimNo",
            CASE WHEN k.tur IN ('mamul', 'yarimamul') THEN ${KATALOG_METIN('g,rev')} END AS revizyon
       FROM malzeme_katalog_karti k WHERE k.no = ANY($1::int[])`, [nolar]);
}

export interface KullanilanKaliteSatiri { kaliteKodu: string; aile: string | null; form: string | null; kartSayisi: number }

// Aktif hammadde kartlarındaki kalite + form; kalitesi boş kart sayılmaz. Sıra: kalite, form (boş form sonda).
export function kullanilanKaliteSatirlari(db: Db): Promise<KullanilanKaliteSatiri[]> {
  return db.sorgu<KullanilanKaliteSatiri>(
    `SELECT kalite AS "kaliteKodu", min(aile) AS aile, form, count(*)::int AS "kartSayisi"
       FROM (SELECT ${KATALOG_KALITE} AS kalite, ${KATALOG_METIN('fam')} AS aile, ${KATALOG_METIN('form')} AS form
               FROM malzeme_katalog_karti k WHERE k.onay_durumu = 'aktif' AND k.tur = 'hammadde') x
      WHERE kalite IS NOT NULL
      GROUP BY kalite, form ORDER BY kalite, form NULLS LAST`);
}

export function katalogKartKaydiNoIle(db: Db, no: number): Promise<{ kayit: Record<string, unknown> } | null> {
  return db.tek<{ kayit: Record<string, unknown> }>(`SELECT kayit FROM malzeme_katalog_karti WHERE no = $1`, [no]);
}

export function operasyonluAktifKartKayitlari(db: Db): Promise<{ no: number; kisiId: number; kayit: Record<string, unknown> }[]> {
  return db.sorgu<{ no: number; kisiId: number; kayit: Record<string, unknown> }>(
    `SELECT no, COALESCE(gonderen_kisi_id, acan_kisi_id) AS "kisiId", kayit FROM malzeme_katalog_karti
      WHERE onay_durumu = 'aktif' AND tur IN ('mamul', 'yarimamul')
        AND jsonb_typeof(kayit->'ops') = 'array' AND jsonb_array_length(kayit->'ops') > 0
      ORDER BY no`,
  );
}

// Adı olmayan kart koduyla gelir (ad uydurulmaz, ama kart listeden düşmez).
export function katalogMalzemeAdlari(db: Db, nolar: number[]): Promise<{ id: number; ad: string }[]> {
  return db.sorgu<{ id: number; ad: string }>(
    `SELECT no AS id, COALESCE(${KATALOG_AD}, stok_kodu) AS ad FROM malzeme_katalog_karti WHERE no = ANY($1::int[])`,
    [nolar],
  );
}

export function katalogSablonlari(
  db: Db,
): Promise<{ kimlik: string; sablon: Record<string, unknown>; surum: number; kaydedenKisiId: number | null }[]> {
  return db.sorgu(`SELECT kimlik, sablon, surum, kaydeden_kisi_id AS "kaydedenKisiId" FROM malzeme_katalog_sablonu WHERE aktif ORDER BY guncelleme DESC, kimlik`);
}

export type SurumluYazmaSonucu = { surum: number } | 'yetkisiz' | 'cakisma';

// Kayıtlı şablonun üstüne yalnız kaydeden ya da onay yetkilisi yazar (koşul güncellemede, yarışta da tutar); kaydeden ilk yazandır, sonradan değişmez.
// Yazma, okunan sürüm kayıtlıyla aynıysa olur; kaldırılmış şablonun sürümü listede görünmediği için onun üstüne sürümsüz yazılır.
export async function katalogSablonuYaz(
  db: Db, kimlik: string, sablon: Record<string, unknown>, kisiId: number, onayYetkilisi: boolean, surum: number | null,
): Promise<SurumluYazmaSonucu> {
  const r = await db.sorgu<{ surum: number }>(
    `INSERT INTO malzeme_katalog_sablonu AS m (kimlik, sablon, aktif, guncelleyen_kisi_id, kaydeden_kisi_id) VALUES ($1, $2, true, $3, $3)
     ON CONFLICT (kimlik) DO UPDATE SET sablon = EXCLUDED.sablon, aktif = true, guncelleyen_kisi_id = EXCLUDED.guncelleyen_kisi_id, guncelleme = now(), surum = m.surum + 1
       WHERE ($4::boolean OR m.kaydeden_kisi_id = $3) AND (m.surum = $5::int OR ($5::int IS NULL AND NOT m.aktif))
     RETURNING surum`,
    [kimlik, sablon, kisiId, onayYetkilisi, surum],
  );
  if (r[0]) return { surum: r[0].surum };
  const k = await db.tek<{ kaydeden_kisi_id: number }>('SELECT kaydeden_kisi_id FROM malzeme_katalog_sablonu WHERE kimlik = $1', [kimlik]);
  return k && !onayYetkilisi && k.kaydeden_kisi_id !== kisiId ? 'yetkisiz' : 'cakisma';
}

export type SablonKaldirmaSonucu = 'kaldirildi' | 'yok' | 'yetkisiz';

export async function katalogSablonuKaldir(db: Db, kimlik: string, kisiId: number, onayYetkilisi: boolean): Promise<SablonKaldirmaSonucu> {
  const r = await db.sorgu<{ kimlik: string }>(
    `UPDATE malzeme_katalog_sablonu SET aktif = false, guncelleyen_kisi_id = $2, guncelleme = now(), surum = surum + 1
      WHERE kimlik = $1 AND aktif AND ($3::boolean OR kaydeden_kisi_id = $2) RETURNING kimlik`,
    [kimlik, kisiId, onayYetkilisi],
  );
  if (r.length > 0) return 'kaldirildi';
  const kayitli = await db.tek<{ kimlik: string }>('SELECT kimlik FROM malzeme_katalog_sablonu WHERE kimlik = $1 AND aktif', [kimlik]);
  return kayitli ? 'yetkisiz' : 'yok';
}

export function katalogAyarlari(db: Db): Promise<{ anahtar: string; deger: Record<string, unknown>; surum: number }[]> {
  return db.sorgu('SELECT anahtar, deger, surum FROM malzeme_katalog_ayari');
}

// Kaydın şimdiki sürümü (yoksa null); şablonda yalnız listede görünen (aktif) satır sayılır.
export async function katalogKayitSurumu(db: Db, tablo: 'ayar' | 'sablon', anahtar: string): Promise<number | null> {
  const r = tablo === 'ayar'
    ? await db.tek<{ surum: number }>('SELECT surum FROM malzeme_katalog_ayari WHERE anahtar = $1', [anahtar])
    : await db.tek<{ surum: number }>('SELECT surum FROM malzeme_katalog_sablonu WHERE kimlik = $1 AND aktif', [anahtar]);
  return r?.surum ?? null;
}

// İlk kayıt sürümsüz gelir; kayıtlı ayarın üstüne yalnız okunan sürümle yazılır.
export async function katalogAyariYaz(
  db: Db, anahtar: string, deger: Record<string, unknown>, kisiId: number, surum: number | null,
): Promise<{ surum: number } | 'cakisma'> {
  const r = await db.sorgu<{ surum: number }>(
    `INSERT INTO malzeme_katalog_ayari AS m (anahtar, deger, guncelleyen_kisi_id) VALUES ($1, $2, $3)
     ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, guncelleyen_kisi_id = EXCLUDED.guncelleyen_kisi_id, guncelleme = now(), surum = m.surum + 1
       WHERE m.surum = $4::int
     RETURNING surum`,
    [anahtar, deger, kisiId, surum],
  );
  return r[0] ? { surum: r[0].surum } : 'cakisma';
}

/* ---------------- Logo'ya gönderime hazırlık (kart #232) ---------------- */

export interface LogoKartSatiri {
  id: number;
  kod: string;
  ad: string | null;
  tur: KatalogTuru;
  hizmetYonu: HizmetYonu | null;
  birim: string | null;
  durum: LogoGonderimDurumu;
  hata: string | null;
  zaman: string | null;
  kayitNo: string | null;
  // Gönderilmemiş kartta o anki karşılık; gönderilmiş kartta Logo'ya giden (kartta yazılı) değer.
  logoKartTuru: string | null;
  logoBirimSeti: string | null;
  guncellemeDurumu: LogoGonderimDurumu | null;
  guncellemeHata: string | null;
  guncellemeZamani: string | null;
  aciklama1: string | null;
  aciklama2: string | null;
  aciklama3: string | null;
}

const LOGO_KART_ALANLARI = `k.no AS id, k.stok_kodu AS kod, ${KATALOG_AD.replaceAll('kayit', 'k.kayit')} AS ad, k.tur, k.hizmet_yonu AS "hizmetYonu",
       ${KATALOG_BIRIM.replaceAll('kayit', 'k.kayit')} AS birim, k.logo_gonderim_durumu AS durum, k.logo_hata AS hata,
       ${zamanMetni('k.logo_gonderim_zamani')} AS zaman, k.logo_kayit_no AS "kayitNo",
       CASE WHEN k.logo_gonderim_durumu = 'gonderildi' THEN k.logo_kart_turu ELSE kt.logo_degeri END AS "logoKartTuru",
       CASE WHEN k.logo_gonderim_durumu = 'gonderildi' THEN k.logo_birim_seti ELSE kb.logo_degeri END AS "logoBirimSeti",
       k.logo_guncelleme_durumu AS "guncellemeDurumu", k.logo_guncelleme_hata AS "guncellemeHata",
       ${zamanMetni('k.logo_guncelleme_zamani')} AS "guncellemeZamani", k.aciklama_1 AS aciklama1, k.aciklama_2 AS aciklama2, k.aciklama_3 AS aciklama3`;
const LOGO_KARSILIK_BAGI = `LEFT JOIN malzeme_logo_karsiligi kt ON kt.cesit = 'tur' AND kt.tmi_degeri = k.tur
  LEFT JOIN malzeme_logo_karsiligi kb ON kb.cesit = 'birim' AND kb.tmi_degeri = ${KATALOG_BIRIM.replaceAll('kayit', 'k.kayit')}`;

// Gönderim kuyruğu: bekleyen ve hatalı kartlar, en eski aktiflik önce (aktiflik zamanı yoksa açılış). Hizmet yalnız istenirse.
export function logoKuyrugu(db: Db, sinir: number, hizmetDahil: boolean): Promise<LogoKartSatiri[]> {
  return db.sorgu<LogoKartSatiri>(
    `SELECT ${LOGO_KART_ALANLARI}
       FROM malzeme_katalog_karti k ${LOGO_KARSILIK_BAGI}
      WHERE k.logo_gonderim_durumu IN ('bekliyor', 'hata') AND ($2::boolean OR k.tur <> 'hizmet')
      ORDER BY COALESCE(k.onaylama, k.acilma), k.no
      LIMIT $1`,
    [sinir, hizmetDahil],
  );
}

// Madde 6 ve TM3: verilen kimliklerden hizmet ya da ticari mal olan kartların stok kodları (reçete bileşeni olamazlar).
export async function katalogBilesenOlamayanKodlar(db: Db, kimlikler: readonly string[]): Promise<string[]> {
  if (kimlikler.length === 0) return [];
  return (await db.sorgu<{ kod: string }>(
    `SELECT stok_kodu AS kod FROM malzeme_katalog_karti WHERE kimlik = ANY($1::text[]) AND tur IN ('hizmet', 'ticari_mal') ORDER BY stok_kodu`, [kimlikler],
  )).map((r) => r.kod);
}

// Durum listesi: durumu olan bütün kartlar (sıralama kuralı `kurallar.ts` `logoDurumSirasi`).
export function logoDurumluKartlar(db: Db): Promise<LogoKartSatiri[]> {
  return db.sorgu<LogoKartSatiri>(
    `SELECT ${LOGO_KART_ALANLARI}
       FROM malzeme_katalog_karti k ${LOGO_KARSILIK_BAGI}
      WHERE k.logo_gonderim_durumu IS NOT NULL`,
  );
}

export function logoKartiKilitle(db: Db, no: number): Promise<{ durum: LogoGonderimDurumu | null } | null> {
  return db.tek<{ durum: LogoGonderimDurumu | null }>(
    'SELECT logo_gonderim_durumu AS durum FROM malzeme_katalog_karti WHERE no = $1 FOR UPDATE',
    [no],
  );
}

// Logo'ya giden tür ve birim karşılığı karta yazılır; tetikleyici sonradan değiştirilmesine izin vermez.
// `gonderilen` verilirse Logo'ya gerçekten giden değer yazılır (kuyruk okunduktan sonra karşılık değişmiş olabilir); verilmezse o anki karşılık.
export async function logoGonderildiYaz(
  db: Db, no: number, kayitNo: string, gonderilen?: { logoKartTuru: string | null; logoBirimSeti: string | null },
): Promise<void> {
  await db.sorgu(
    `UPDATE malzeme_katalog_karti k
        SET logo_gonderim_durumu = 'gonderildi', logo_kayit_no = $2, logo_gonderim_zamani = now(), logo_hata = NULL,
            logo_kart_turu = CASE WHEN $3::boolean THEN $4::text
              ELSE (SELECT logo_degeri FROM malzeme_logo_karsiligi WHERE cesit = 'tur' AND tmi_degeri = k.tur) END,
            logo_birim_seti = CASE WHEN $3::boolean THEN $5::text
              ELSE (SELECT logo_degeri FROM malzeme_logo_karsiligi WHERE cesit = 'birim' AND tmi_degeri = ${KATALOG_BIRIM.replaceAll('kayit', 'k.kayit')}) END
      WHERE no = $1`,
    [no, kayitNo, gonderilen !== undefined, gonderilen?.logoKartTuru ?? null, gonderilen?.logoBirimSeti ?? null],
  );
}

export async function logoHataYaz(db: Db, no: number, hata: string): Promise<void> {
  await db.sorgu(
    `UPDATE malzeme_katalog_karti SET logo_gonderim_durumu = 'hata', logo_gonderim_zamani = now(), logo_hata = $2 WHERE no = $1`,
    [no, hata],
  );
}

/* ---------------- Logo'da ad güncellemesi (kart #783, S4 b) ---------------- */

export interface LogoGuncellemeSatiri {
  no: number; stokKodu: string; ad: string | null; logoKayitNo: string; durum: 'bekliyor' | 'hata'; tur: KatalogTuru; hizmetYonu: HizmetYonu | null;
}

// Bekleyen ve hatalı güncellemeler, en eski istek ya da son deneme önce.
export function logoGuncellemeKuyrugu(db: Db, sinir: number): Promise<LogoGuncellemeSatiri[]> {
  return db.sorgu<LogoGuncellemeSatiri>(
    `SELECT no, stok_kodu AS "stokKodu", ${KATALOG_AD} AS ad, logo_kayit_no AS "logoKayitNo", logo_guncelleme_durumu AS durum,
            tur, hizmet_yonu AS "hizmetYonu"
       FROM malzeme_katalog_karti
      WHERE logo_guncelleme_durumu IN ('bekliyor', 'hata')
      ORDER BY logo_guncelleme_zamani, no
      LIMIT $1`,
    [sinir],
  );
}

export function logoGuncellemeKilitle(db: Db, no: number): Promise<{ durum: LogoGonderimDurumu | null; ad: string | null } | null> {
  return db.tek<{ durum: LogoGonderimDurumu | null; ad: string | null }>(
    `SELECT logo_guncelleme_durumu AS durum, ${KATALOG_AD} AS ad FROM malzeme_katalog_karti WHERE no = $1 FOR UPDATE`,
    [no],
  );
}

export async function logoGuncellemeSonucuYaz(db: Db, no: number, durum: 'gonderildi' | 'hata', hata: string | null): Promise<void> {
  await db.sorgu(
    `UPDATE malzeme_katalog_karti SET logo_guncelleme_durumu = $2, logo_guncelleme_hata = $3, logo_guncelleme_zamani = now() WHERE no = $1`,
    [no, durum, hata],
  );
}

// Tür karşılığı olan beş türün satırı (karşılığı yazılmamışsa boş; hizmet yok) ve kartlarda geçen ya da karşılığı yazılmış birimler.
export function logoKarsiliklari(db: Db): Promise<LogoKarsiligi[]> {
  return db.sorgu<LogoKarsiligi>(
    `WITH degerler AS (
       SELECT 'tur' AS cesit, t AS tmi_degeri FROM unnest($1::text[]) AS t
       UNION SELECT 'birim', ${KATALOG_BIRIM} FROM malzeme_katalog_karti WHERE onay_durumu <> 'iptal' AND ${KATALOG_BIRIM} IS NOT NULL
       UNION SELECT cesit, tmi_degeri FROM malzeme_logo_karsiligi
     )
     SELECT d.cesit, d.tmi_degeri AS "tmiDegeri", m.logo_degeri AS "logoDegeri"
       FROM degerler d LEFT JOIN malzeme_logo_karsiligi m USING (cesit, tmi_degeri)
      ORDER BY d.cesit DESC, array_position($1::text[], d.tmi_degeri), d.tmi_degeri`,
    [LOGO_TUR_KARSILIGI_TURLERI],
  );
}

export async function logoKarsiligiYaz(db: Db, cesit: LogoKarsilikCesidi, tmiDegeri: string, logoDegeri: string | null, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO malzeme_logo_karsiligi (cesit, tmi_degeri, logo_degeri, guncelleyen_kisi_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (cesit, tmi_degeri) DO UPDATE SET logo_degeri = EXCLUDED.logo_degeri, guncelleyen_kisi_id = EXCLUDED.guncelleyen_kisi_id, guncelleme = now()`,
    [cesit, tmiDegeri, logoDegeri, kisiId],
  );
}

export async function logoBirimSetiKullanimda(db: Db, kod: string): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM malzeme_logo_karsiligi WHERE cesit = 'birim' AND logo_degeri = $1) AS var`,
    [kod],
  );
  return satir?.var === true;
}

/* ---------------- Ölçü birimi ve kategori listesi (kart #163) ---------------- */

export function olcuBirimleri(db: Db): Promise<{ kod: string; aktif: boolean }[]> {
  return db.sorgu('SELECT kod, aktif FROM malzeme_birimi ORDER BY aktif DESC, kod');
}

export function birimTablosu(db: Db): Promise<{ kod: string; yerlesikListeler: string[] }[]> {
  return db.sorgu('SELECT kod, yerlesik_listeler AS "yerlesikListeler" FROM malzeme_birimi FOR UPDATE');
}

export async function birimleriYaz(db: Db, birimler: readonly { kod: string; aktif: boolean }[]): Promise<void> {
  await db.sorgu(
    `INSERT INTO malzeme_birimi (kod, aktif) SELECT * FROM unnest($1::text[], $2::boolean[])
     ON CONFLICT (kod) DO UPDATE SET aktif = EXCLUDED.aktif, guncelleme = now() WHERE malzeme_birimi.aktif IS DISTINCT FROM EXCLUDED.aktif`,
    [birimler.map((b) => b.kod), birimler.map((b) => b.aktif)],
  );
}

// 323 b: Satın alma için; dönüşümü olmayan kart satır vermez. Katsayının sondaki sıfırları atılır (50.000000 -> 50).
export interface BirimDonusumuSatiri { no: number; stokBirimi: string | null; alisBirimi: string; katsayi: string }
export function katalogBirimDonusumleri(db: Db, nolar: number[]): Promise<BirimDonusumuSatiri[]> {
  return db.sorgu<BirimDonusumuSatiri>(
    `SELECT k.no, ${KATALOG_BIRIM.replaceAll('kayit', 'k.kayit')} AS "stokBirimi", k.alis_birimi AS "alisBirimi", trim_scale(k.alis_katsayisi)::text AS katsayi
       FROM malzeme_katalog_karti k
      WHERE k.no = ANY($1::int[]) AND k.alis_birimi IS NOT NULL`,
    [nolar],
  );
}

export async function birimSecilebilirMi(db: Db, kod: string): Promise<boolean> {
  return (await db.tek<{ aktif: boolean }>('SELECT aktif FROM malzeme_birimi WHERE kod = $1', [kod]))?.aktif === true;
}

export async function kategoriAcikMi(db: Db, tur: string, kod: string): Promise<boolean> {
  return (await db.tek<{ var: boolean }>('SELECT true AS var FROM malzeme_kategorisi WHERE tur = $1 AND kod = $2 AND aktif', [tur, kod])) !== null;
}

export function kategoriTablosu(db: Db): Promise<{ tur: 'sarf' | 'demirbas' | 'hizmet'; kod: string; ad: string; kisaKod: string | null; yerlesik: boolean }[]> {
  return db.sorgu('SELECT tur, kod, ad, kisa_kod AS "kisaKod", yerlesik FROM malzeme_kategorisi FOR UPDATE');
}

export async function kategorileriYaz(
  db: Db, k: readonly { tur: string; kod: string; ad: string; kisaKod: string | null; aktif: boolean }[],
): Promise<void> {
  await db.sorgu(
    `INSERT INTO malzeme_kategorisi (tur, kod, ad, kisa_kod, yerlesik, aktif)
     SELECT tur, kod, ad, kisa, false, aktif FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::boolean[]) AS x (tur, kod, ad, kisa, aktif)
     ON CONFLICT (tur, kod) DO UPDATE SET ad = EXCLUDED.ad, kisa_kod = EXCLUDED.kisa_kod, aktif = EXCLUDED.aktif, guncelleme = now()
      WHERE (malzeme_kategorisi.ad, malzeme_kategorisi.kisa_kod, malzeme_kategorisi.aktif) IS DISTINCT FROM (EXCLUDED.ad, EXCLUDED.kisa_kod, EXCLUDED.aktif)`,
    [k.map((x) => x.tur), k.map((x) => x.kod), k.map((x) => x.ad), k.map((x) => x.kisaKod), k.map((x) => x.aktif)],
  );
}

// Değişiklik talebi kartın kaydında durur; katalogdaki sayım gibi iptal dışındaki her kartta sayılır.
export async function onayBekleyenKartSayisi(db: Db): Promise<number> {
  const r = await db.tek<{ n: number }>(
    `SELECT count(*)::int AS n FROM malzeme_katalog_karti
      WHERE onay_durumu = 'onayda' OR (onay_durumu <> 'iptal' AND kayit->'talep'->>'durum' = 'beklemede')`,
  );
  return r?.n ?? 0;
}

/* ---------------- Koddan kart ve örnek veri (kart #906) ---------------- */

export async function katalogKartNoKoddan(db: Db, stokKodu: string): Promise<number | null> {
  return (await db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE stok_kodu = $1', [stokKodu]))?.no ?? null;
}

export async function katalogKartNoKimlikten(db: Db, kimlik: string): Promise<number | null> {
  return (await db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))?.no ?? null;
}

export async function ornekKartVarMi(db: Db): Promise<boolean> {
  return (await db.tek<{ var: boolean }>(`SELECT EXISTS (SELECT 1 FROM malzeme_katalog_karti WHERE kimlik LIKE 'ornek-%') AS var`))?.var === true;
}
