import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';
import type { TalepDurumu,
  Ayarlar, AyarlarKaydetYazimi, Hareket, KatalogKaydetYazimi, KatalogKaydi, Onay, Talep, TalepYazimi, Teklif,
  TedarikciKaydetYazimi,
} from '#paylasilan/sozlesme/satin-alma.ts';
import { MALZEME_KARTI_IZ_YOLU, malzemeKartiIzParametreleri, type MalzemeKartiAnahtari, type MalzemeKartiIzi } from '#paylasilan/malzeme-karti-izi.ts';

const ISO = (s: string) => `to_json(${s}) #>> '{}'`;
// Kademeli fiyat (2975): teklif satırının fiyatı alınan miktarın basamağından okunur; basamaksız satırda taban fiyattır.
// Sipariş satırının miktarı alınan miktardır (en az miktar dahil), basamak ona göre seçilir.
const etkin = (f: string, miktar: string): string =>
  `satin_alma_etkin_birim_fiyat(${f}.talep_id, ${f}.teklif_id, ${f}.kalem_id, ${f}.birim_fiyat, ${miktar})`;

// ---- Numaralar ayardaki kalıptan gelir (ayarlar numaraAl); kalıp değişince çakışan numara atlanır.
export async function talepNoVarMi(db: Db, no: string): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM satin_alma_talep WHERE no = $1', [no])) !== null;
}
export async function siparisNoVarMi(db: Db, no: string): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM satin_alma_siparis WHERE no = $1', [no])) !== null;
}

// ---- Okuma: ana satırlar ve alt tablolar ayrı sorgularla, istemcinin bütününe burada değil serviste dizilir.
export interface TalepSatiri {
  id: string; no: string; baslik: string; birim: string | null; talepEdenKisiId: number; acanKisiId: number; oncelik: string;
  ihtiyacTarihi: string | null; notlar: string; durum: string; iptalNedeni: string;
  agirlikMaliyet: number | null; agirlikTermin: number | null; agirlikTedarikci: number | null; agirlikGaranti: number | null;
  teslimYontemi: 'firma_getirir' | 'biz_alacagiz' | null; uretimEmriId: number | null; surum: number; olusturma: string; guncelleme: string;
  birlesenTalepId: string | null; projeId: number | null; idariTalepId: number | null; guncellenenTalepId: string | null;
}
const TALEP = `id, no, baslik, birim, talep_eden_kisi_id AS "talepEdenKisiId", acan_kisi_id AS "acanKisiId", oncelik,
  ihtiyac_tarihi AS "ihtiyacTarihi", notlar, durum, iptal_nedeni AS "iptalNedeni", agirlik_maliyet AS "agirlikMaliyet",
  agirlik_termin AS "agirlikTermin", agirlik_tedarikci AS "agirlikTedarikci", agirlik_garanti AS "agirlikGaranti", teslim_yontemi AS "teslimYontemi", uretim_emri_id AS "uretimEmriId", surum,
  ${ISO('olusturma')} AS olusturma, ${ISO('guncelleme')} AS guncelleme, birlesen_talep_id AS "birlesenTalepId",
  proje_id AS "projeId", idari_talep_id AS "idariTalepId", guncellenen_talep_id AS "guncellenenTalepId"`;

// kisiId verilirse yalnız o kişinin açtığı ya da adına açılan talepler.
export function talepSatirlariOku(db: Db, kisiId: number | null, id: string | null = null): Promise<TalepSatiri[]> {
  return db.sorgu<TalepSatiri>(
    `SELECT ${TALEP} FROM satin_alma_talep
      WHERE ($1::int IS NULL OR acan_kisi_id = $1 OR talep_eden_kisi_id = $1) AND ($2::uuid IS NULL OR id = $2)
      ORDER BY olusturma DESC, no DESC`,
    [kisiId, id],
  );
}

export function talepSatirlariIdlerle(db: Db, idler: readonly string[]): Promise<TalepSatiri[]> {
  if (idler.length === 0) return Promise.resolve([]);
  return db.sorgu<TalepSatiri>(`SELECT ${TALEP} FROM satin_alma_talep WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)`, [idler]);
}

// 2454: yılın bütçe kullanımına girebilecek talepler (kararlı, siparişi verilmiş; iptal değil). Yıl siparişin ya da kararın tarihinden;
// süzgeç geniştir, kesin yıl kuralda.
export async function butceTalepIdleri(db: Db, yil: number): Promise<string[]> {
  return (await db.sorgu<{ id: string }>(
    `SELECT t.id FROM satin_alma_talep t JOIN satin_alma_karar k ON k.talep_id = t.id
      WHERE t.durum = 'siparis_verildi' AND t.birlesen_talep_id IS NULL
        AND (extract(year FROM k.karar_tarihi) = $1
             OR EXISTS (SELECT 1 FROM satin_alma_siparis p WHERE p.talep_id = t.id AND extract(year FROM p.siparis_tarihi) = $1))
      ORDER BY t.yil, t.sira`, [yil])).map((r) => r.id);
}

export interface AltKayitlar {
  kalemler: (Talep['kalemler'][number] & { talepId: string })[];
  istekler: (Talep['teklifIstekleri'][number] & { talepId: string })[];
  teklifler: (Omit<Teklif, 'fiyatlar'> & { talepId: string })[];
  fiyatlar: { talepId: string; teklifId: string; kalemId: string; birimFiyat: string; iskontoYuzdesi: string | null; terminGun: number | null; enAzMiktar: string | null }[];
  basamaklar: { talepId: string; teklifId: string; kalemId: string; esik: string; birimFiyat: string }[];
  kararlar: { talepId: string; mod: 'tek' | 'bolunmus'; teklifId: string | null; gerekce: string; kararVerenKisiId: number | null; kararTarihi: string; ogrenilenler: string; kurKilidi: string | null }[];
  bolunmeler: { talepId: string; kalemId: string; teklifId: string }[];
  sabitKurlar: { talepId: string; paraBirimi: string; kur: string; aylikFaizYuzdesi: string | null }[];
  siparisler: {
    talepId: string; teklifId: string; no: string | null; siparisNo: string; siparisTarihi: string | null; beklenenTeslim: string | null; vadeBaslangici: 'teslim' | 'siparis';
    logoDurumu: 'bekliyor' | 'gonderildi' | 'hata' | null; logoKayitNo: string | null; logoHata: string | null;
    logoIptalDurumu: 'bekliyor' | 'gonderildi' | 'hata' | null; logoIptalHata: string | null;
    logoGuncellemeDurumu: 'bekliyor' | 'gonderildi' | 'hata' | null; logoGuncellemeHata: string | null;
    logoKapatmaDurumu: 'bekliyor' | 'gonderildi' | 'hata' | null; logoKapatmaHata: string | null;
    logoBekletmeIstegi: 'beklet' | 'serbest' | null; logoBekletmeDurumu: 'bekliyor' | 'gonderildi' | 'hata' | null; logoBekletmeHata: string | null;
  }[];
  siparisSatirlari: { talepId: string; teklifId: string; id: number; kalemId: string; miktar: string; birim: string; parcaRevizyonu: string | null }[];
  onaylar: (Omit<Onay, 'kisiAdi'> & { talepId: string })[];
  hareketler: (Omit<Hareket, 'kisiAdi'> & { talepId: string })[];
  senaryolar: { talepId: string; id: string; ad: string; kisiId: number | null; olusturma: string }[];
  paylar: { talepId: string; senaryoId: string; kalemId: string; teklifId: string; miktar: string }[];
  dengeler: { talepId: string; senaryoId: string; kalemId: string; denge: string | null }[];
}

export async function altKayitlariOku(db: Db, idler: readonly string[]): Promise<AltKayitlar> {
  const p = [idler];
  const q = <T>(sql: string) => db.sorgu<T>(sql, p);
  return {
    kalemler: await q(`SELECT talep_id AS "talepId", id, katalog_id AS "katalogId", ad, ozellik, miktar, birim, kategori
      FROM satin_alma_talep_kalemi WHERE talep_id = ANY($1::uuid[]) ORDER BY talep_id, sira`),
    istekler: await q(`SELECT talep_id AS "talepId", firma_id AS "firmaId", gonderim, son_tarih AS "sonTarih"
      FROM satin_alma_teklif_istegi WHERE talep_id = ANY($1::uuid[]) ORDER BY talep_id, gonderim, firma_id`),
    teklifler: await q(`SELECT talep_id AS "talepId", id, firma_id AS "firmaId", tedarikci_adi AS "tedarikciAdi", teklif_tarihi AS "teklifTarihi",
      gecerlilik, para_birimi AS "paraBirimi", kur, iskonto_yuzdesi AS "iskontoYuzdesi", nakliye, diger_masraf AS "digerMasraf",
      teslim_sekli AS "teslimSekli", nakliye_dahil AS "nakliyeDahil", termin_gun AS "terminGun", vade_gun AS "vadeGun",
      avans_yuzdesi AS "avansYuzdesi", garanti_ay AS "garantiAy", teknik_uygun AS "teknikUygun", notlar, ilk_toplam AS "ilkToplam", revizyon
      FROM satin_alma_teklif WHERE talep_id = ANY($1::uuid[]) ORDER BY talep_id, sira, id`),
    // Satırlar silinip yeniden yazıldığı için sıra veritabanına bırakılmaz: kalemin sırası esastır.
    fiyatlar: await q(`SELECT s.talep_id AS "talepId", s.teklif_id AS "teklifId", s.kalem_id AS "kalemId", s.birim_fiyat AS "birimFiyat",
      s.iskonto_yuzdesi AS "iskontoYuzdesi", s.termin_gun AS "terminGun", s.en_az_miktar AS "enAzMiktar"
      FROM satin_alma_teklif_satiri s JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
      WHERE s.talep_id = ANY($1::uuid[]) ORDER BY s.talep_id, s.teklif_id, k.sira`),
    basamaklar: await q(`SELECT talep_id AS "talepId", teklif_id AS "teklifId", kalem_id AS "kalemId", esik, birim_fiyat AS "birimFiyat"
      FROM satin_alma_teklif_fiyat_basamagi WHERE talep_id = ANY($1::uuid[]) ORDER BY talep_id, teklif_id, kalem_id, esik`),
    kararlar: await q(`SELECT talep_id AS "talepId", mod, teklif_id AS "teklifId", gerekce, karar_veren_kisi_id AS "kararVerenKisiId",
      karar_tarihi AS "kararTarihi", ogrenilenler, ${ISO('kur_kilidi')} AS "kurKilidi" FROM satin_alma_karar WHERE talep_id = ANY($1::uuid[])`),
    bolunmeler: await q(`SELECT b.talep_id AS "talepId", b.kalem_id AS "kalemId", b.teklif_id AS "teklifId"
      FROM satin_alma_karar_kalemi b JOIN satin_alma_talep_kalemi k ON k.talep_id = b.talep_id AND k.id = b.kalem_id
      WHERE b.talep_id = ANY($1::uuid[]) ORDER BY b.talep_id, k.sira`),
    sabitKurlar: await q(`SELECT talep_id AS "talepId", para_birimi AS "paraBirimi", kur, aylik_faiz_yuzdesi AS "aylikFaizYuzdesi"
      FROM satin_alma_sabit_kur WHERE talep_id = ANY($1::uuid[]) ORDER BY talep_id, para_birimi`),
    siparisler: await q(`SELECT talep_id AS "talepId", teklif_id AS "teklifId", no, siparis_no AS "siparisNo", siparis_tarihi AS "siparisTarihi",
      beklenen_teslim AS "beklenenTeslim", vade_baslangici AS "vadeBaslangici", logo_gonderim_durumu AS "logoDurumu", logo_kayit_no AS "logoKayitNo", logo_hata AS "logoHata",
      logo_iptal_durumu AS "logoIptalDurumu", logo_iptal_hata AS "logoIptalHata",
      logo_guncelleme_durumu AS "logoGuncellemeDurumu", logo_guncelleme_hata AS "logoGuncellemeHata",
      logo_kapatma_durumu AS "logoKapatmaDurumu", logo_kapatma_hata AS "logoKapatmaHata",
      logo_bekletme_istegi AS "logoBekletmeIstegi", logo_bekletme_durumu AS "logoBekletmeDurumu", logo_bekletme_hata AS "logoBekletmeHata"
      FROM satin_alma_siparis WHERE talep_id = ANY($1::uuid[]) ORDER BY talep_id, id`),
    siparisSatirlari: await q(`SELECT s.talep_id AS "talepId", s.teklif_id AS "teklifId", s.id, s.kalem_id AS "kalemId", s.miktar, s.birim,
        s.parca_revizyonu AS "parcaRevizyonu"
      FROM satin_alma_siparis_satiri s JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
      WHERE s.talep_id = ANY($1::uuid[]) ORDER BY s.talep_id, s.teklif_id, k.sira`),
    onaylar: await q(`SELECT talep_id AS "talepId", id, ${ISO('zaman')} AS zaman, kisi_id AS "kisiId", sonuc, dort_gozsuz AS "dortGozsuz", notlar
      FROM satin_alma_onay WHERE talep_id = ANY($1::uuid[]) ORDER BY zaman, id`),
    hareketler: await q(`SELECT talep_id AS "talepId", id, ${ISO('zaman')} AS zaman, kisi_id AS "kisiId", metin
      FROM satin_alma_hareket WHERE talep_id = ANY($1::uuid[]) ORDER BY zaman, id`),
    senaryolar: await q(`SELECT talep_id AS "talepId", id, ad, kisi_id AS "kisiId", ${ISO('olusturma')} AS olusturma
      FROM satin_alma_senaryo WHERE talep_id = ANY($1::uuid[]) ORDER BY olusturma, id`),
    paylar: await q(`SELECT talep_id AS "talepId", senaryo_id AS "senaryoId", kalem_id AS "kalemId", teklif_id AS "teklifId", miktar
      FROM satin_alma_senaryo_payi WHERE talep_id = ANY($1::uuid[])`),
    dengeler: await q(`SELECT talep_id AS "talepId", senaryo_id AS "senaryoId", kalem_id AS "kalemId", denge
      FROM satin_alma_senaryo_kalemi WHERE talep_id = ANY($1::uuid[])`),
  };
}

// ---- Yazma: ana satır sürümle; alt kayıtlar eşitlenir (çıkarılan silinir, kalan güncellenir ya da eklenir).
const anaDegerler = (t: TalepYazimi, talepEden: number) => [
  t.baslik, t.birim, talepEden, t.oncelik, t.ihtiyacTarihi, t.notlar, t.durum, t.iptalNedeni,
  t.agirliklar?.maliyet ?? null, t.agirliklar?.termin ?? null, t.agirliklar?.tedarikci ?? null, t.agirliklar?.garanti ?? null, t.uretimEmriId,
  t.projeId ?? null,
];

// 2614 1/2 a: idari talep bağı yalnız açılışta yazılır; güncelleme yolu onu değiştirmez.
export async function talepEkle(db: Db, t: TalepYazimi, no: string, talepEden: number, acan: number, idariTalepId: number | null = null): Promise<void> {
  await db.sorgu(
    `INSERT INTO satin_alma_talep (id, no, acan_kisi_id, baslik, birim, talep_eden_kisi_id, oncelik, ihtiyac_tarihi, notlar, durum,
       iptal_nedeni, agirlik_maliyet, agirlik_termin, agirlik_tedarikci, agirlik_garanti, uretim_emri_id, proje_id, idari_talep_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [t.id, no, acan, ...anaDegerler(t, talepEden), idariTalepId],
  );
  await talepEdenGecmisineEkle(db, t.id, [acan, talepEden]);
}

// 2398 a: talebi açan ve talep eden olmuş herkes; dört göz bunların onayını reddeder. Yalnız ekleme.
async function talepEdenGecmisineEkle(db: Db, talepId: string, kisiler: readonly number[]): Promise<void> {
  await db.sorgu(
    `INSERT INTO satin_alma_talep_eden_gecmisi (talep_id, kisi_id) SELECT $1, k FROM unnest($2::int[]) AS k ON CONFLICT DO NOTHING`,
    [talepId, [...new Set(kisiler)]],
  );
}
export async function talepEdenGecmisi(db: Db, talepId: string): Promise<number[]> {
  return (await db.sorgu<{ kisiId: number }>('SELECT kisi_id AS "kisiId" FROM satin_alma_talep_eden_gecmisi WHERE talep_id = $1', [talepId])).map((r) => r.kisiId);
}

// Sürüm tutmazsa satır dönmez; çağıran çekirdeğin surumluGuncelle'si ile 404/409 ayırır.
// 2876: güncelleme talebi açılışta kök talebe bağlanır (açılışın parçası; aynı işlemde, sürüm değişmez).
export async function guncellenenTalepYaz(db: Db, id: string, kokId: string): Promise<void> {
  await db.sorgu('UPDATE satin_alma_talep SET guncellenen_talep_id = $2 WHERE id = $1', [id, kokId]);
}

// 2876: verilen taleplerin güncelleme grupları (kök ve köke bağlı talepler). Tek üyeli grup (güncellemesiz talep) dönmez.
export interface GuncellemeUyesi { kokId: string; id: string; no: string; durum: string; surum: number }
export function guncellemeGruplariOku(db: Db, idler: readonly string[]): Promise<GuncellemeUyesi[]> {
  return db.sorgu(
    `WITH kokler AS (SELECT DISTINCT coalesce(guncellenen_talep_id, id) AS kok FROM satin_alma_talep WHERE id = ANY($1::uuid[])),
          uyeler AS (SELECT k.kok, t.id, t.no, t.durum, t.surum, t.olusturma FROM kokler k JOIN satin_alma_talep t ON t.id = k.kok OR t.guncellenen_talep_id = k.kok)
     SELECT kok AS "kokId", id, no, durum, surum FROM uyeler
      WHERE kok IN (SELECT kok FROM uyeler GROUP BY kok HAVING count(*) > 1)
      ORDER BY kok, id <> kok, olusturma, no`,
    [idler],
  );
}

export async function talepGuncelle(db: Db, t: TalepYazimi, talepEden: number, surum: number): Promise<{ id: string } | null> {
  const satir = await db.tek<{ id: string }>(
    `UPDATE satin_alma_talep SET baslik = $3, birim = $4, talep_eden_kisi_id = $5, oncelik = $6, ihtiyac_tarihi = $7, notlar = $8, durum = $9,
       iptal_nedeni = $10, agirlik_maliyet = $11, agirlik_termin = $12, agirlik_tedarikci = $13, agirlik_garanti = $14, uretim_emri_id = $15, proje_id = $16,
       durum_zamani = CASE WHEN durum IS DISTINCT FROM $9 THEN now() ELSE durum_zamani END,
       iptal_oncesi_durum = CASE WHEN $9 <> 'iptal' THEN NULL WHEN durum <> 'iptal' THEN durum ELSE iptal_oncesi_durum END,
       surum = surum + 1, guncelleme = now()
     WHERE id = $1 AND surum = $2 RETURNING id`,
    [t.id, surum, ...anaDegerler(t, talepEden)],
  );
  if (satir !== null) await talepEdenGecmisineEkle(db, t.id, [talepEden]);
  return satir;
}

// 2614 1/2 a: idari talepten açılmış satın alma talepleri (idari talep başına en çok bir).
export function idariTalepSatinAlmalari(db: Db, idariIdler: readonly number[]): Promise<{ idariTalepId: number; talepId: string; no: string; durum: string }[]> {
  return db.sorgu(
    `SELECT idari_talep_id AS "idariTalepId", id AS "talepId", no, durum FROM satin_alma_talep WHERE idari_talep_id = ANY($1::int[])`,
    [idariIdler],
  );
}

// 2624 b: kalemin üretim emri. Birleşik talepte kaynaktan gelen kalem kaynağın emrine bağlı kalır (kaynak birleşmişken donmuştur);
// talebin emri yalnız kaynaksız kaleme uygulanır. Mal kabul, proje ve emir tutarı ve genel gider oranı bu tek ifadeyi kullanır (Veri 3).
// Sorguda t talep, kt kalemin kaynak talebi takma adıdır.
export const KALEM_EMRI = 'COALESCE(kt.uretim_emri_id, t.uretim_emri_id)';

// 2611 a, 2637 a, 2638: filtreye uyan siparişlerin bütün satırları (masraf payı siparişin bütün malına oranlanır). Satırın genel iskontolu
// mal tutarı, sipariş miktarı, net teslimi, kartı (kalemin katalog kartı), fason bağı (sipariş satırının ya da kalemin iş emri), emri
// (KALEM_EMRI, 2624) ve talebin projesi; masraf siparişin nakliyesi (hariçse) ve diğer masrafı. İptal talep gelmez; birleşmiş kaynağın
// siparişi yoktur (siparişler birleşik taleptedir).
export interface YolSatiri {
  satirId: number; kalemAdi: string; birim: string; talepId: string; teklifId: string; paraBirimi: string; mal: string; miktar: string; teslim: string;
  malzemeNo: number | null; fason: boolean; emirId: number | null; projeId: number | null; masraf: string;
}
// siparisler: Finans'ın belgesine bağlı sipariş; talep iptal olsa da fatura gerçektir, durum süzülmez.
export interface YolFiltresi { projeIdler?: readonly number[]; emirIdler?: readonly number[]; siparisler?: readonly { talepId: string; teklifId: string }[] }
const YOL_KAYNAGI = `FROM satin_alma_talep t
       JOIN satin_alma_siparis_satiri s ON s.talep_id = t.id
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
       LEFT JOIN satin_alma_talep kt ON kt.id = k.kaynak_talep_id`;
export function siparisYolSatirlari(db: Db, f: YolFiltresi): Promise<YolSatiri[]> {
  return db.sorgu<YolSatiri>(
    `WITH secilen AS (
       SELECT DISTINCT s.talep_id, s.teklif_id ${YOL_KAYNAGI}
        WHERE (t.durum <> 'iptal' AND (t.proje_id = ANY($1::int[]) OR ${KALEM_EMRI} = ANY($2::int[])))
           OR (s.talep_id, s.teklif_id) IN (SELECT * FROM unnest($3::uuid[], $4::uuid[])))
     SELECT s.id AS "satirId", k.ad AS "kalemAdi", k.birim, s.talep_id AS "talepId", s.teklif_id AS "teklifId", q.para_birimi::text AS "paraBirimi",
            (s.miktar * ${etkin('f', 's.miktar')} * (1 - COALESCE(f.iskonto_yuzdesi, 0) / 100) * (1 - q.iskonto_yuzdesi / 100))::text AS mal,
            s.miktar::text AS miktar,
            coalesce((SELECT sum(x.miktar) FROM satin_alma_teslim x WHERE x.siparis_satiri_id = s.id), 0)::text AS teslim,
            c.malzeme_no AS "malzemeNo", (s.is_emri_id IS NOT NULL OR k.is_emri_id IS NOT NULL) AS fason,
            ${KALEM_EMRI} AS "emirId", t.proje_id AS "projeId",
            (CASE WHEN q.nakliye_dahil THEN 0 ELSE q.nakliye END + q.diger_masraf)::text AS masraf
       ${YOL_KAYNAGI}
       JOIN secilen x ON x.talep_id = s.talep_id AND x.teklif_id = s.teklif_id
       LEFT JOIN satin_alma_katalog c ON c.id = k.katalog_id
       JOIN satin_alma_teklif q ON q.talep_id = s.talep_id AND q.id = s.teklif_id
       JOIN satin_alma_teklif_satiri f ON f.talep_id = s.talep_id AND f.teklif_id = s.teklif_id AND f.kalem_id = s.kalem_id
      ORDER BY s.talep_id, s.teklif_id, s.id`,
    [f.projeIdler ?? [], f.emirIdler ?? [], (f.siparisler ?? []).map((x) => x.talepId), (f.siparisler ?? []).map((x) => x.teklifId)],
  );
}

// 2642 b: belgelerin eşlemeleri (kaldırılmışlar dahil; sürüm onlarla hesaplanır). Satırın siparişi okunur: belgenin güncel siparişiyle
// karşılaştırılır (Veri 1). Satır silinemez (RESTRICT), iç birleştirme.
export interface EslemeSatiri { id: number; belgeId: number; siparisSatiriId: number; tutar: string; kaldirilma: string | null; talepId: string; teklifId: string }
export function faturaEslemeleri(db: Db, belgeIdler: readonly number[]): Promise<EslemeSatiri[]> {
  return db.sorgu<EslemeSatiri>(
    `SELECT e.id, e.belge_id AS "belgeId", e.siparis_satiri_id AS "siparisSatiriId", e.tutar::text AS tutar, e.kaldirilma::text AS kaldirilma,
            s.talep_id AS "talepId", s.teklif_id AS "teklifId"
       FROM satin_alma_fatura_eslemesi e JOIN satin_alma_siparis_satiri s ON s.id = e.siparis_satiri_id
      WHERE e.belge_id = ANY($1::int[]) ORDER BY e.belge_id, e.id`, [belgeIdler]);
}
// Maliyet N2: satır başına başka belgelerin etkin eşlemeleri (mükerrer eşleme uyarısı). Para birimi Finans'tadır; toplamı servis
// aynı para birimindeki belgelerle yapar.
export function satirlarinBaskaEslemeleri(db: Db, belgeId: number, satirIdler: readonly number[]): Promise<{ siparisSatiriId: number; belgeId: number; tutar: string }[]> {
  return db.sorgu<{ siparisSatiriId: number; belgeId: number; tutar: string }>(
    `SELECT siparis_satiri_id AS "siparisSatiriId", belge_id AS "belgeId", tutar::text AS tutar FROM satin_alma_fatura_eslemesi
      WHERE siparis_satiri_id = ANY($2::int[]) AND belge_id <> $1 AND kaldirilma IS NULL`, [belgeId, satirIdler]);
}
export function faturaEslemesiEkle(db: Db, g: { belgeId: number; siparisSatiriId: number; tutar: string; kisiId: number }): Promise<unknown> {
  return db.sorgu('INSERT INTO satin_alma_fatura_eslemesi (belge_id, siparis_satiri_id, tutar, ekleyen_kisi_id) VALUES ($1, $2, $3, $4)',
    [g.belgeId, g.siparisSatiriId, g.tutar, g.kisiId]);
}
export function faturaEslemesiKaldir(db: Db, idler: readonly number[], kisiId: number): Promise<unknown> {
  return db.sorgu('UPDATE satin_alma_fatura_eslemesi SET kaldiran_kisi_id = $2, kaldirilma = now() WHERE id = ANY($1::int[]) AND kaldirilma IS NULL', [idler, kisiId]);
}

export function talepNolari(db: Db, idler: readonly string[]): Promise<{ id: string; no: string }[]> {
  return db.sorgu<{ id: string; no: string }>('SELECT id, no FROM satin_alma_talep WHERE id = ANY($1::uuid[])', [idler]);
}
export function teslimYontemiYaz(db: Db, id: string, teslimYontemi: string | null, surum: number): Promise<{ id: string } | null> {
  return db.tek<{ id: string }>(
    'UPDATE satin_alma_talep SET teslim_yontemi = $3, surum = surum + 1, guncelleme = now() WHERE id = $1 AND surum = $2 RETURNING id',
    [id, surum, teslimYontemi],
  );
}

// Talebin birimi (departman) ayarlardaki listeden seçilir; yazmadan önce denetlenir ki kullanıcı genel bir bağ hatası yerine açık ileti görsün.
export async function birimVarMi(db: Db, ad: string): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM satin_alma_birim WHERE ad = $1', [ad])) !== null;
}

// Stok mal kabulü: sipariş satırının üretim emri (KALEM_EMRI); emre bağlı olmayan satır haritada yoktur.
export async function siparisSatirlarininEmri(db: Db, idler: readonly number[]): Promise<{ id: number; uretimEmriId: number }[]> {
  return db.sorgu<{ id: number; uretimEmriId: number }>(
    `SELECT s.id, ${KALEM_EMRI} AS "uretimEmriId" FROM satin_alma_siparis_satiri s JOIN satin_alma_talep t ON t.id = s.talep_id
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
       LEFT JOIN satin_alma_talep kt ON kt.id = k.kaynak_talep_id
      WHERE s.id = ANY($1::int[]) AND ${KALEM_EMRI} IS NOT NULL`,
    [idler],
  );
}

export async function talepVarMi(db: Db, id: string): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM satin_alma_talep WHERE id = $1', [id])) !== null;
}

export function talepSil(db: Db, id: string, surum: number): Promise<{ id: string } | null> {
  return db.tek<{ id: string }>('DELETE FROM satin_alma_talep WHERE id = $1 AND surum = $2 RETURNING id', [id, surum]);
}

export async function altKayitlariYaz(db: Db, t: TalepYazimi, yeniSiparisNo: () => Promise<string>): Promise<void> {
  const id = t.id;
  const kalemIdleri = t.kalemler.map((k) => k.id);
  const teklifIdleri = t.teklifler.map((k) => k.id);
  // Karar kalktıysa önce o gider (bağlı sipariş, kur ve kalem kararı birlikte); karar varken teklif silmeyi tetikleyici reddeder.
  if (t.karar === null) await db.sorgu('DELETE FROM satin_alma_karar WHERE talep_id = $1', [id]);
  await db.sorgu('DELETE FROM satin_alma_senaryo WHERE talep_id = $1', [id]);
  await db.sorgu('DELETE FROM satin_alma_talep_kalemi WHERE talep_id = $1 AND NOT (id = ANY($2::uuid[]))', [id, kalemIdleri]);
  // Sıra benzersizliği yeniden sıralamada çakışmasın: önce kullanılmayan aralığa (1000+) kaydırılır (en çok 200 kalem).
  await db.sorgu('UPDATE satin_alma_talep_kalemi SET sira = sira + 1000 WHERE talep_id = $1', [id]);
  // Tek sorguda yazılır (H-3). Aynı kimlik iki kez gelirse sonuncusu kalır, sırası kendi konumundandır (satır satır yazmayla aynı).
  const kalemler = [...new Map(t.kalemler.map((k, i) => [k.id, { ...k, sira: i + 1 }] as const)).values()];
  await db.sorgu(
    `INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, katalog_id, ad, ozellik, miktar, birim, kategori)
     SELECT $1, * FROM unnest($2::uuid[], $3::smallint[], $4::uuid[], $5::text[], $6::text[], $7::numeric[], $8::text[], $9::text[])
     ON CONFLICT (talep_id, id) DO UPDATE SET sira = EXCLUDED.sira, katalog_id = EXCLUDED.katalog_id, ad = EXCLUDED.ad,
       ozellik = EXCLUDED.ozellik, miktar = EXCLUDED.miktar, birim = EXCLUDED.birim, kategori = EXCLUDED.kategori`,
    [id, kalemler.map((k) => k.id), kalemler.map((k) => k.sira), kalemler.map((k) => k.katalogId), kalemler.map((k) => k.ad),
      kalemler.map((k) => k.ozellik), kalemler.map((k) => k.miktar), kalemler.map((k) => k.birim), kalemler.map((k) => k.kategori)],
  );
  await db.sorgu('DELETE FROM satin_alma_teklif_istegi WHERE talep_id = $1', [id]);
  await db.sorgu('INSERT INTO satin_alma_teklif_istegi (talep_id, firma_id, gonderim, son_tarih) SELECT $1, * FROM unnest($2::int[], $3::date[], $4::date[])',
    [id, t.teklifIstekleri.map((r) => r.firmaId), t.teklifIstekleri.map((r) => r.gonderim), t.teklifIstekleri.map((r) => r.sonTarih)]);
  await db.sorgu('DELETE FROM satin_alma_teklif WHERE talep_id = $1 AND NOT (id = ANY($2::uuid[]))', [id, teklifIdleri]);
  for (const [sira, q] of t.teklifler.entries()) {
    // SAT-13: pazarlık izi sunucunundur; istemcinin ilk toplam ve revizyonu yok sayılır.
    const once = await db.tek<{ ilk: string | null; revizyon: number; toplam: string | null }>(
      'SELECT ilk_toplam AS ilk, revizyon, satin_alma_teklif_toplami(talep_id, id) AS toplam FROM satin_alma_teklif WHERE talep_id = $1 AND id = $2', [id, q.id]);
    await db.sorgu(
      `INSERT INTO satin_alma_teklif (talep_id, id, sira, firma_id, tedarikci_adi, teklif_tarihi, gecerlilik, para_birimi, kur, iskonto_yuzdesi,
         nakliye, diger_masraf, teslim_sekli, nakliye_dahil, termin_gun, vade_gun, avans_yuzdesi, garanti_ay, teknik_uygun, notlar, ilk_toplam, revizyon)
       VALUES ($1, $2, $22, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       ON CONFLICT (talep_id, id) DO UPDATE SET sira = EXCLUDED.sira, firma_id = EXCLUDED.firma_id, tedarikci_adi = EXCLUDED.tedarikci_adi,
         teklif_tarihi = EXCLUDED.teklif_tarihi, gecerlilik = EXCLUDED.gecerlilik, para_birimi = EXCLUDED.para_birimi, kur = EXCLUDED.kur,
         iskonto_yuzdesi = EXCLUDED.iskonto_yuzdesi, nakliye = EXCLUDED.nakliye, diger_masraf = EXCLUDED.diger_masraf,
         teslim_sekli = EXCLUDED.teslim_sekli, nakliye_dahil = EXCLUDED.nakliye_dahil, termin_gun = EXCLUDED.termin_gun,
         vade_gun = EXCLUDED.vade_gun, avans_yuzdesi = EXCLUDED.avans_yuzdesi, garanti_ay = EXCLUDED.garanti_ay,
         teknik_uygun = EXCLUDED.teknik_uygun, notlar = EXCLUDED.notlar, ilk_toplam = EXCLUDED.ilk_toplam, revizyon = EXCLUDED.revizyon`,
      [id, q.id, q.firmaId, q.tedarikciAdi, q.teklifTarihi, q.gecerlilik, q.paraBirimi, q.kur, q.iskontoYuzdesi, q.nakliye, q.digerMasraf,
        q.teslimSekli, q.nakliyeDahil, q.terminGun, q.vadeGun, q.avansYuzdesi, q.garantiAy, q.teknikUygun, q.notlar, q.ilkToplam, q.revizyon, sira],
    );
    await db.sorgu('DELETE FROM satin_alma_teklif_satiri WHERE talep_id = $1 AND teklif_id = $2', [id, q.id]);
    await db.sorgu(
      `INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat, iskonto_yuzdesi, termin_gun, en_az_miktar)
       SELECT $1, $2, * FROM unnest($3::uuid[], $4::numeric[], $5::numeric[], $6::int[], $7::numeric[])`,
      [id, q.id, q.fiyatlar.map((f) => f.kalemId), q.fiyatlar.map((f) => f.birimFiyat), q.fiyatlar.map((f) => f.iskontoYuzdesi ?? null),
        q.fiyatlar.map((f) => f.terminGun ?? null), q.fiyatlar.map((f) => f.enAzMiktar ?? null)]);
    // Basamaklar satırla birlikte silinir (yabancı anahtar, CASCADE) ve yeniden yazılır.
    const basamaklar = q.fiyatlar.flatMap((f) => (f.basamaklar ?? []).map((b) => ({ kalemId: f.kalemId, ...b })));
    if (basamaklar.length > 0) {
      await db.sorgu(
        `INSERT INTO satin_alma_teklif_fiyat_basamagi (talep_id, teklif_id, kalem_id, esik, birim_fiyat)
         SELECT $1, $2, * FROM unnest($3::uuid[], $4::numeric[], $5::numeric[])`,
        [id, q.id, basamaklar.map((b) => b.kalemId), basamaklar.map((b) => b.esik), basamaklar.map((b) => b.birimFiyat)]);
    }
    // İlk toplam bir kez yazılır; toplam 0,005'ten fazla değişirse revizyon artar (prototip kuralı).
    await db.sorgu(
      `UPDATE satin_alma_teklif SET
         ilk_toplam = COALESCE($3::numeric, satin_alma_teklif_toplami(talep_id, id)),
         revizyon = $4::int + CASE WHEN $5::numeric IS NOT NULL AND abs($5::numeric - satin_alma_teklif_toplami(talep_id, id)) > 0.005 THEN 1 ELSE 0 END
       WHERE talep_id = $1 AND id = $2`,
      [id, q.id, once?.ilk ?? null, once?.revizyon ?? 0, once?.toplam ?? null]);
  }
  const k = t.karar;
  if (k !== null) {
    await db.sorgu(
      `INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, gerekce, karar_veren_kisi_id, karar_tarihi, ogrenilenler, kur_kilidi)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (talep_id) DO UPDATE SET mod = EXCLUDED.mod, teklif_id = EXCLUDED.teklif_id, gerekce = EXCLUDED.gerekce,
         karar_veren_kisi_id = EXCLUDED.karar_veren_kisi_id, karar_tarihi = EXCLUDED.karar_tarihi, ogrenilenler = EXCLUDED.ogrenilenler,
         kur_kilidi = EXCLUDED.kur_kilidi`,
      [id, k.mod, k.teklifId, k.gerekce, k.kararVerenKisiId, k.kararTarihi, k.ogrenilenler, k.kurKilidi ?? null],
    );
    await db.sorgu('DELETE FROM satin_alma_karar_kalemi WHERE talep_id = $1', [id]);
    await db.sorgu('INSERT INTO satin_alma_karar_kalemi (talep_id, kalem_id, teklif_id) SELECT $1, * FROM unnest($2::uuid[], $3::uuid[])',
      [id, k.bolunme.map((b) => b.kalemId), k.bolunme.map((b) => b.teklifId)]);
    await db.sorgu('DELETE FROM satin_alma_sabit_kur WHERE talep_id = $1', [id]);
    await db.sorgu('INSERT INTO satin_alma_sabit_kur (talep_id, para_birimi, kur, aylik_faiz_yuzdesi) SELECT $1, * FROM unnest($2::text[], $3::numeric[], $4::numeric[])',
      [id, k.sabitKurlar.map((s) => s.paraBirimi), k.sabitKurlar.map((s) => s.kur), k.sabitKurlar.map((s) => s.aylikFaizYuzdesi ?? null)]);
    await db.sorgu('DELETE FROM satin_alma_siparis WHERE talep_id = $1 AND NOT (teklif_id = ANY($2::uuid[]))', [id, k.siparisler.map((s) => s.teklifId)]);
    for (const s of k.siparisler) {
      // Numara yalnız yeni siparişe verilir ve değişmez; istemci numara yazamaz. Sayaç boşa harcanmasın diye önce var mı bakılır.
      const mevcut = await db.tek('SELECT 1 FROM satin_alma_siparis WHERE talep_id = $1 AND teklif_id = $2', [id, s.teklifId]);
      const no = mevcut ? null : await yeniSiparisNo();
      await db.sorgu(
        `INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, siparis_no, siparis_tarihi, beklenen_teslim, vade_baslangici) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (talep_id, teklif_id) DO UPDATE SET siparis_no = EXCLUDED.siparis_no, siparis_tarihi = EXCLUDED.siparis_tarihi,
           beklenen_teslim = EXCLUDED.beklenen_teslim, vade_baslangici = EXCLUDED.vade_baslangici`,
        [id, s.teklifId, no, s.siparisNo, s.siparisTarihi, s.beklenenTeslim, s.vadeBaslangici],
      );
      // Sipariş satırları: tek kararda teklifin fiyat verdiği kalemler, kalem bazlı kararda o teklife atananlar. Kimlik korunur
      // (stokun mal kabulü ve GKK buna bağlanır); kapsamdan çıkan satır silinir, miktarı boş kalem satır olmaz.
      const kapsam = k.mod === 'tek'
        ? (t.teklifler.find((x) => x.id === s.teklifId)?.fiyatlar ?? []).map((f) => f.kalemId)
        : k.bolunme.filter((b) => b.teklifId === s.teklifId).map((b) => b.kalemId);
      const kalemler = t.kalemler.filter((x) => kapsam.includes(x.id) && x.miktar !== null);
      // 1099 a: en az miktar kalem miktarından büyükse sipariş o miktarla verilir (ödenen ve teslim beklenen miktar).
      const enAz = new Map((t.teklifler.find((x) => x.id === s.teklifId)?.fiyatlar ?? []).map((f) => [f.kalemId, f.enAzMiktar ?? null]));
      // Logo'da numarası olan satır kaldırılınca numarası siparişte saklanır: Logo düzenlemesi silineni açık listeden alır.
      await db.sorgu(
        `WITH silinen AS (DELETE FROM satin_alma_siparis_satiri WHERE talep_id = $1 AND teklif_id = $2 AND NOT (kalem_id = ANY($3::uuid[]))
           RETURNING logo_satir_ref)
         UPDATE satin_alma_siparis SET logo_kaldirilan_satir_refleri = logo_kaldirilan_satir_refleri
           || ARRAY(SELECT logo_satir_ref FROM silinen WHERE logo_satir_ref IS NOT NULL)
         WHERE talep_id = $1 AND teklif_id = $2`,
        [id, s.teklifId, kalemler.map((x) => x.id)]);
      for (const x of kalemler) {
        await db.sorgu(
          `INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, GREATEST($4::numeric, $6::numeric), $5)
           ON CONFLICT (talep_id, teklif_id, kalem_id) DO UPDATE SET miktar = EXCLUDED.miktar, birim = EXCLUDED.birim`,
          [id, s.teklifId, x.id, x.miktar, x.birim, enAz.get(x.id) ?? null],
        );
      }
    }
  }
  for (const s of t.senaryolar) {
    // Kişi ve zaman sunucunundur (B-010): servis yeni senaryoya oturumdaki kişiyi ve boş zaman verir, boş zaman sunucunun saatidir.
    await db.sorgu("INSERT INTO satin_alma_senaryo (talep_id, id, ad, kisi_id, olusturma) VALUES ($1, $2, $3, $4, COALESCE(NULLIF($5, '')::timestamptz, now()))",
      [id, s.id, s.ad, s.kisiId, s.olusturma]);
    await db.sorgu('INSERT INTO satin_alma_senaryo_payi (talep_id, senaryo_id, kalem_id, teklif_id, miktar) SELECT $1, $2, * FROM unnest($3::uuid[], $4::uuid[], $5::numeric[])',
      [id, s.id, s.paylar.map((p) => p.kalemId), s.paylar.map((p) => p.teklifId), s.paylar.map((p) => p.miktar)]);
    await db.sorgu('INSERT INTO satin_alma_senaryo_kalemi (talep_id, senaryo_id, kalem_id, denge) SELECT $1, $2, * FROM unnest($3::uuid[], $4::numeric[])',
      [id, s.id, s.dengeler.map((d) => d.kalemId), s.dengeler.map((d) => d.denge)]);
  }
}

// Yalnız ekleme: kişi ve zaman sunucunun; aynı kimlik yeniden gelirse yok sayılır.
export async function onayEkle(db: Db, talepId: string, o: Pick<Onay, 'id' | 'sonuc' | 'notlar'>, kisiId: number, dortGozsuz: boolean): Promise<void> {
  await db.sorgu(
    `INSERT INTO satin_alma_onay (id, talep_id, kisi_id, sonuc, dort_gozsuz, notlar) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
    [o.id, talepId, kisiId, o.sonuc, dortGozsuz, o.notlar],
  );
}
// Borç 36: kalem ve sipariş satırları birlikte değişir; satır kimliği korunur (mal kabul ve GKK ona bağlı). Talep sürümü önce artar,
// bu satır kilidi teslim yazımının kilidiyle (teslimHedefiKilitle) sıraya girer.
export function talepSurumuArttir(db: Db, id: string, surum: number): Promise<{ id: string } | null> {
  return db.tek<{ id: string }>('UPDATE satin_alma_talep SET surum = surum + 1, guncelleme = now() WHERE id = $1 AND surum = $2 RETURNING id', [id, surum]);
}
export async function siparisKalemiYaz(db: Db, talepId: string, kalemId: string, miktar: string, birim: string): Promise<void> {
  await db.sorgu('UPDATE satin_alma_talep_kalemi SET miktar = $3, birim = $4 WHERE talep_id = $1 AND id = $2', [talepId, kalemId, miktar, birim]);
  await db.sorgu('UPDATE satin_alma_siparis_satiri SET miktar = $3, birim = $4 WHERE talep_id = $1 AND kalem_id = $2', [talepId, kalemId, miktar, birim]);
}
// ---- Logo (#205 karar 1). Sipariş verilince siparişler Logo kuyruğuna girer; kayıtsız tedarikçinin siparişi gönderilemez, hata olarak
// görünür. Bağlantıdan önce verilmiş sipariş kuyruğa girmez (durum boş kalır).
export async function siparisleriLogoyaIsaretle(db: Db, talepId: string, kayitsizIletisi: string): Promise<void> {
  await db.sorgu(
    `UPDATE satin_alma_siparis p SET logo_gonderim_durumu = CASE WHEN q.firma_id IS NULL THEN 'hata' ELSE 'bekliyor' END,
       logo_hata = CASE WHEN q.firma_id IS NULL THEN $2 END, logo_gonderim_zamani = CASE WHEN q.firma_id IS NULL THEN now() END
       FROM satin_alma_teklif q WHERE q.talep_id = p.talep_id AND q.id = p.teklif_id AND p.talep_id = $1 AND p.logo_gonderim_durumu IS NULL`,
    [talepId, kayitsizIletisi],
  );
}
// S2 b: içeriği değişen, Logo'da kaydı olan ve iptali kuyrukta olmayan sipariş düzenleme kuyruğuna girer (hata da yeniden denenir).
export async function siparisGuncellemesiniIsaretle(db: Db, talepId: string, teklifIdler: readonly string[]): Promise<void> {
  if (teklifIdler.length === 0) return;
  await db.sorgu(`UPDATE satin_alma_siparis SET logo_guncelleme_durumu = 'bekliyor', logo_guncelleme_hata = NULL
    WHERE talep_id = $1 AND teklif_id = ANY($2::uuid[]) AND logo_kayit_no IS NOT NULL AND logo_iptal_durumu IS NULL`, [talepId, teklifIdler]);
}
// Sırada ya da hatada kalan bekletme isteği düşer; Logo'ya gitmiş son durum (bekletildi / serbest) kalır.
const BEKLEYEN_BEKLETME_DUSER = `logo_bekletme_istegi = CASE WHEN logo_bekletme_durumu = 'gonderildi' THEN logo_bekletme_istegi END,
      logo_bekletme_durumu = CASE WHEN logo_bekletme_durumu = 'gonderildi' THEN 'gonderildi' END, logo_bekletme_hata = NULL`;
// Talep iptal edilince: Logo'da kaydı olan siparişin iptali kuyruğa girer (bekleyen düzenleme düşer), henüz gitmemiş sipariş kuyruktan çıkar.
export async function siparisIptaliniLogoyaIsaretle(db: Db, talepId: string): Promise<void> {
  await db.sorgu(`UPDATE satin_alma_siparis SET logo_iptal_durumu = 'bekliyor', logo_iptal_hata = NULL, logo_guncelleme_durumu = NULL, logo_guncelleme_hata = NULL,
      logo_kapatma_durumu = CASE WHEN logo_kapatma_durumu = 'gonderildi' THEN 'gonderildi' END, logo_kapatma_hata = NULL, ${BEKLEYEN_BEKLETME_DUSER}
    WHERE talep_id = $1 AND logo_kayit_no IS NOT NULL AND logo_iptal_durumu IS NULL`, [talepId]);
  await db.sorgu(`UPDATE satin_alma_siparis SET logo_gonderim_durumu = NULL, logo_hata = NULL, logo_gonderim_zamani = NULL
    WHERE talep_id = $1 AND logo_kayit_no IS NULL`, [talepId]);
}
export interface LogoSiparisSatiri {
  id: number; no: string; tarih: string; firmaId: number; paraBirimi: string; kur: string | null; iskontoYuzdesi: string; termin: string | null;
  durum: 'bekliyor' | 'hata'; logoKayitNo: string | null; kaldirilanSatirRefleri: string[]; bekletmeIstegi: 'beklet' | 'serbest' | null;
}
// Tarih sipariş tarihidir; girilmemişse Logo'ya gönderildiği gün (İstanbul). Kur siparişte sabitlenen, yoksa teklifin kuru; TRY'de boş.
// Gönderim kuyruğu ilk kaydı, düzenleme kuyruğu Logo'da kaydı olanın değişikliğini taşır (iptali kuyrukta olan düzenlenmez).
// Bekletme Logo'ya düzenleme gövdesiyle gider (Logo'da sipariş durumu yalnız düzenlemeyle yazılır): sırada düzenleme varken ya da
// Logo'da numarası olmayan satır varken gitmez, yoksa yeni satır iki kez eklenirdi. Kapatılan ve iptal edilen sipariş bekletilmez.
const KUYRUK_KOSULU = {
  gonderim: "p.logo_gonderim_durumu IN ('bekliyor', 'hata')",
  guncelleme: "p.logo_guncelleme_durumu IN ('bekliyor', 'hata') AND p.logo_iptal_durumu IS NULL",
  bekletme: `p.logo_bekletme_durumu IN ('bekliyor', 'hata') AND p.logo_iptal_durumu IS NULL AND p.logo_kapatma_durumu IS NULL AND p.logo_kayit_no IS NOT NULL
    AND p.logo_guncelleme_durumu IS DISTINCT FROM 'bekliyor' AND p.logo_guncelleme_durumu IS DISTINCT FROM 'hata'
    AND NOT EXISTS (SELECT 1 FROM satin_alma_siparis_satiri x WHERE x.talep_id = p.talep_id AND x.teklif_id = p.teklif_id AND x.logo_satir_ref IS NULL)`,
} as const;
export function logoyaGidecekSiparislerOku(db: Db, sinir: number, kuyruk: keyof typeof KUYRUK_KOSULU = 'gonderim'): Promise<LogoSiparisSatiri[]> {
  const kosul = KUYRUK_KOSULU[kuyruk];
  const durum = kuyruk === 'gonderim' ? 'p.logo_gonderim_durumu' : kuyruk === 'guncelleme' ? 'p.logo_guncelleme_durumu' : 'p.logo_bekletme_durumu';
  return db.sorgu<LogoSiparisSatiri>(
    `SELECT p.id, coalesce(p.no, '') AS no, coalesce(p.siparis_tarihi, (now() AT TIME ZONE 'Europe/Istanbul')::date)::text AS tarih,
        q.firma_id AS "firmaId", q.para_birimi AS "paraBirimi",
        CASE WHEN q.para_birimi = 'TRY' THEN NULL ELSE coalesce(sk.kur, q.kur)::text END AS kur, q.iskonto_yuzdesi::text AS "iskontoYuzdesi",
        p.beklenen_teslim::text AS termin, ${durum} AS durum, p.logo_kayit_no AS "logoKayitNo",
        p.logo_kaldirilan_satir_refleri AS "kaldirilanSatirRefleri", p.logo_bekletme_istegi AS "bekletmeIstegi"
       FROM satin_alma_siparis p
       JOIN satin_alma_teklif q ON q.talep_id = p.talep_id AND q.id = p.teklif_id
       LEFT JOIN satin_alma_sabit_kur sk ON sk.talep_id = p.talep_id AND sk.para_birimi = q.para_birimi
      WHERE ${kosul} AND q.firma_id IS NOT NULL
      ORDER BY p.id LIMIT $1`,
    [sinir],
  );
}
export interface LogoSiparisKalemi {
  siparisId: number; satirId: number; malzemeNo: number | null; miktar: string; birim: string; birimFiyat: string; logoSatirRef: string | null;
}
export function logoSiparisKalemleriOku(db: Db, siparisIdler: readonly number[]): Promise<LogoSiparisKalemi[]> {
  return db.sorgu<LogoSiparisKalemi>(
    `SELECT p.id AS "siparisId", s.id AS "satirId", c.malzeme_no AS "malzemeNo", s.miktar::text AS miktar, s.birim, round(${etkin('f', 's.miktar')} * (1 - COALESCE(f.iskonto_yuzdesi, 0) / 100), 4)::text AS "birimFiyat",
        s.logo_satir_ref AS "logoSatirRef"
       FROM satin_alma_siparis p
       JOIN satin_alma_siparis_satiri s ON s.talep_id = p.talep_id AND s.teklif_id = p.teklif_id
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
       LEFT JOIN satin_alma_katalog c ON c.id = k.katalog_id
       JOIN satin_alma_teklif_satiri f ON f.talep_id = s.talep_id AND f.teklif_id = s.teklif_id AND f.kalem_id = s.kalem_id
      WHERE p.id = ANY($1::int[]) ORDER BY p.id, k.sira`,
    [siparisIdler],
  );
}
// Başarı tekrarlanabilir: aynı kayıt numarası yeniden yazılırsa değişmez. Sipariş bu arada iptal edildiyse Logo'daki kaydın iptali
// kuyruğa girer. Dönen satır yoksa sipariş yok ya da başka kayıt numarasıyla gönderilmiş.
export function siparisLogoBasarisiYaz(db: Db, id: number, kayitNo: string): Promise<{ talepId: string; teklifId: string } | null> {
  return db.tek(
    `UPDATE satin_alma_siparis p SET logo_kayit_no = $2, logo_gonderim_durumu = 'gonderildi', logo_hata = NULL,
       logo_gonderim_zamani = CASE WHEN p.logo_kayit_no IS NULL THEN now() ELSE p.logo_gonderim_zamani END,
       logo_iptal_durumu = CASE WHEN t.durum = 'iptal' THEN coalesce(p.logo_iptal_durumu, 'bekliyor') ELSE p.logo_iptal_durumu END
       FROM satin_alma_talep t WHERE t.id = p.talep_id AND p.id = $1 AND (p.logo_kayit_no IS NULL OR p.logo_kayit_no = $2)
     RETURNING p.talep_id AS "talepId", p.teklif_id AS "teklifId"`,
    [id, kayitNo],
  );
}
export async function siparisSatiriLogoRefYaz(db: Db, sip: { talepId: string; teklifId: string }, satirId: number, ref: string): Promise<boolean> {
  return (await db.tek('UPDATE satin_alma_siparis_satiri SET logo_satir_ref = $4 WHERE id = $3 AND talep_id = $1 AND teklif_id = $2 RETURNING id',
    [sip.talepId, sip.teklifId, satirId, ref])) !== null;
}
// Hata yalnız kuyruktaki siparişe yazılır: bu arada iptalle kuyruktan çıkan ya da gönderilmiş sipariş değişmez.
export async function siparisLogoHatasiYaz(db: Db, id: number, hata: string): Promise<void> {
  await db.sorgu(`UPDATE satin_alma_siparis SET logo_gonderim_durumu = 'hata', logo_hata = $2, logo_gonderim_zamani = now()
    WHERE id = $1 AND logo_gonderim_durumu IN ('bekliyor', 'hata')`, [id, hata]);
}
// Düzenleme sonucu yalnız kuyruktaki siparişe yazılır; dönen satır yoksa sipariş kuyrukta değil (iptal edildi ya da yok).
export function siparisLogoGuncellemeSonucuYaz(db: Db, id: number, hata: string | null): Promise<{ talepId: string; teklifId: string } | null> {
  return db.tek(`UPDATE satin_alma_siparis SET logo_guncelleme_durumu = CASE WHEN $2::text IS NULL THEN 'gonderildi' ELSE 'hata' END,
      logo_guncelleme_hata = $2, logo_kaldirilan_satir_refleri = CASE WHEN $2::text IS NULL THEN '{}' ELSE logo_kaldirilan_satir_refleri END
    WHERE id = $1 AND logo_guncelleme_durumu IN ('bekliyor', 'hata') AND logo_iptal_durumu IS NULL
    RETURNING talep_id AS "talepId", teklif_id AS "teklifId"`, [id, hata]);
}
// "Kalanı kapat": yalnız Logo'da kaydı olan, iptali ve kapatması kuyrukta olmayan sipariş kapatma kuyruğuna girer.
export async function siparisiKapatmayaIsaretle(db: Db, talepId: string, teklifId: string): Promise<boolean> {
  return (await db.tek(`UPDATE satin_alma_siparis SET logo_kapatma_durumu = 'bekliyor', logo_kapatma_hata = NULL, ${BEKLEYEN_BEKLETME_DUSER}
    WHERE talep_id = $1 AND teklif_id = $2 AND logo_kayit_no IS NOT NULL AND logo_iptal_durumu IS NULL AND logo_kapatma_durumu IS NULL RETURNING id`,
    [talepId, teklifId])) !== null;
}
export function logoyaKapatmaGidecekSiparislerOku(db: Db, sinir: number): Promise<{ id: number; no: string; logoKayitNo: string; satirRefleri: string[] }[]> {
  return db.sorgu(`SELECT p.id, coalesce(p.no, '') AS no, p.logo_kayit_no AS "logoKayitNo",
      ARRAY(SELECT s.logo_satir_ref FROM satin_alma_siparis_satiri s WHERE s.talep_id = p.talep_id AND s.teklif_id = p.teklif_id
        AND s.logo_satir_ref IS NOT NULL ORDER BY s.id) AS "satirRefleri"
    FROM satin_alma_siparis p WHERE p.logo_kapatma_durumu IN ('bekliyor', 'hata') AND p.logo_iptal_durumu IS NULL ORDER BY p.id LIMIT $1`, [sinir]);
}
// Sonuç yalnız kuyruktaki siparişe yazılır; bu arada iptal kuyruğuna giren siparişin sonucu yok sayılır (iptal gider).
export async function siparisLogoKapatmaSonucuYaz(db: Db, id: number, hata: string | null): Promise<void> {
  await db.sorgu(`UPDATE satin_alma_siparis SET logo_kapatma_durumu = CASE WHEN $2::text IS NULL THEN 'gonderildi' ELSE 'hata' END, logo_kapatma_hata = $2
    WHERE id = $1 AND logo_kapatma_durumu IN ('bekliyor', 'hata') AND logo_iptal_durumu IS NULL`, [id, hata]);
}
// 2966-1 b: istek kuyruğa girer; aynı istek zaten Logo'ya gitmişse ya da sırada iş varsa satır dönmez (kural önce söyler, bu yarışı kapatır).
export async function siparisiBekletmeyeIsaretle(db: Db, talepId: string, teklifId: string, istek: 'beklet' | 'serbest'): Promise<boolean> {
  return (await db.tek(`UPDATE satin_alma_siparis SET logo_bekletme_istegi = $3, logo_bekletme_durumu = 'bekliyor', logo_bekletme_hata = NULL
    WHERE talep_id = $1 AND teklif_id = $2 AND logo_kayit_no IS NOT NULL AND logo_iptal_durumu IS NULL AND logo_kapatma_durumu IS NULL
      AND logo_bekletme_durumu IS DISTINCT FROM 'bekliyor'
      AND NOT (logo_bekletme_durumu IS NOT DISTINCT FROM 'gonderildi' AND logo_bekletme_istegi = $3)
      AND ($3 = 'beklet' OR logo_bekletme_istegi IS NOT NULL) RETURNING id`, [talepId, teklifId, istek])) !== null;
}
// Sonuç yalnız kuyruktaki ve gönderilen istekle aynı isteğe yazılır: bu arada iptal, kapatma ya da yeni istek geldiyse yok sayılır.
export async function siparisLogoBekletmeSonucuYaz(db: Db, id: number, istek: 'beklet' | 'serbest', hata: string | null): Promise<void> {
  await db.sorgu(`UPDATE satin_alma_siparis SET logo_bekletme_durumu = CASE WHEN $3::text IS NULL THEN 'gonderildi' ELSE 'hata' END, logo_bekletme_hata = $3
    WHERE id = $1 AND logo_bekletme_istegi = $2 AND logo_bekletme_durumu IN ('bekliyor', 'hata') AND logo_iptal_durumu IS NULL AND logo_kapatma_durumu IS NULL`,
    [id, istek, hata]);
}
export function logoyaIptalGidecekSiparislerOku(db: Db, sinir: number): Promise<{ id: number; no: string; logoKayitNo: string }[]> {
  return db.sorgu(`SELECT id, coalesce(no, '') AS no, logo_kayit_no AS "logoKayitNo" FROM satin_alma_siparis
    WHERE logo_iptal_durumu IN ('bekliyor', 'hata') ORDER BY id LIMIT $1`, [sinir]);
}
export async function siparisLogoIptalSonucuYaz(db: Db, id: number, hata: string | null): Promise<void> {
  await db.sorgu(`UPDATE satin_alma_siparis SET logo_iptal_durumu = CASE WHEN $2::text IS NULL THEN 'gonderildi' ELSE 'hata' END, logo_iptal_hata = $2
    WHERE id = $1 AND logo_iptal_durumu IN ('bekliyor', 'hata')`, [id, hata]);
}

// ---- Logo talep fişi ve karşılama (#205 S3 b, kart #790). Talep onaylanınca (ya da onaysız siparişe geçince) talep fişi kuyruğa
// girer; iptal edilen talebin gitmemiş fişi kuyruktan çıkar. Bağlantıdan önce onaylanmış talep kuyruğa girmez.
export async function talebiLogoyaIsaretle(db: Db, talepId: string): Promise<void> {
  await db.sorgu("UPDATE satin_alma_talep SET logo_gonderim_durumu = 'bekliyor' WHERE id = $1 AND logo_gonderim_durumu IS NULL", [talepId]);
}
export async function talepIptaliniLogoyaIsaretle(db: Db, talepId: string): Promise<void> {
  await db.sorgu('UPDATE satin_alma_talep SET logo_gonderim_durumu = NULL, logo_hata = NULL WHERE id = $1 AND logo_kayit_no IS NULL', [talepId]);
}
export interface LogoTalepSatiri { id: number; no: string; tarih: string; ihtiyacTarihi: string | null; durum: 'bekliyor' | 'hata' }
// Tarih talebin açıldığı gündür (İstanbul).
export function logoyaGidecekTaleplerOku(db: Db, sinir: number): Promise<LogoTalepSatiri[]> {
  return db.sorgu<LogoTalepSatiri>(
    `SELECT sayi_id AS id, no, (olusturma AT TIME ZONE 'Europe/Istanbul')::date::text AS tarih, ihtiyac_tarihi::text AS "ihtiyacTarihi",
        logo_gonderim_durumu AS durum
       FROM satin_alma_talep WHERE logo_gonderim_durumu IN ('bekliyor', 'hata') ORDER BY sayi_id LIMIT $1`,
    [sinir],
  );
}
export interface LogoTalepKalemi { talepId: number; satirId: number; malzemeNo: number | null; miktar: string; birim: string }
export function logoTalepKalemleriOku(db: Db, talepIdler: readonly number[]): Promise<LogoTalepKalemi[]> {
  return db.sorgu<LogoTalepKalemi>(
    `SELECT t.sayi_id AS "talepId", k.sayi_id AS "satirId", c.malzeme_no AS "malzemeNo", k.miktar::text AS miktar, k.birim
       FROM satin_alma_talep t
       JOIN satin_alma_talep_kalemi k ON k.talep_id = t.id
       LEFT JOIN satin_alma_katalog c ON c.id = k.katalog_id
      WHERE t.sayi_id = ANY($1::int[]) AND k.miktar IS NOT NULL ORDER BY t.sayi_id, k.sira`,
    [talepIdler],
  );
}
// Başarı tekrarlanabilir: aynı kayıt numarası yeniden yazılırsa değişmez. Dönen satır yoksa talep yok ya da başka numarayla gönderilmiş.
export function talepLogoBasarisiYaz(db: Db, id: number, kayitNo: string): Promise<{ talepId: string } | null> {
  return db.tek(
    `UPDATE satin_alma_talep SET logo_kayit_no = $2, logo_gonderim_durumu = 'gonderildi', logo_hata = NULL
      WHERE sayi_id = $1 AND (logo_kayit_no IS NULL OR logo_kayit_no = $2) RETURNING id AS "talepId"`,
    [id, kayitNo],
  );
}
export async function talepKalemiLogoRefYaz(db: Db, talepId: string, satirId: number, ref: string): Promise<boolean> {
  return (await db.tek('UPDATE satin_alma_talep_kalemi SET logo_satir_ref = $3 WHERE talep_id = $1 AND sayi_id = $2 RETURNING sayi_id',
    [talepId, satirId, ref])) !== null;
}
export async function talepLogoHatasiYaz(db: Db, id: number, hata: string): Promise<void> {
  await db.sorgu("UPDATE satin_alma_talep SET logo_gonderim_durumu = 'hata', logo_hata = $2 WHERE sayi_id = $1 AND logo_gonderim_durumu IN ('bekliyor', 'hata')",
    [id, hata]);
}
export interface LogoKarsilamaSatiri {
  siparisSatirId: number; siparisKayitNo: string; talepSatirRef: string; siparisSatirRef: string; miktar: string; malzemeNo: number; birim: string; firmaId: number;
}
// Karşılama: Logo'da satır numarası olan sipariş satırı, Logo'da satır numarası olan talep kalemine bağlanır. İptali kuyrukta olan
// siparişin karşılaması gitmez (Logo iptalde karşılamayı kendisi geri alır). Hata kuyrukta kalır.
export function logoyaGidecekKarsilamalarOku(db: Db, sinir: number): Promise<LogoKarsilamaSatiri[]> {
  return db.sorgu<LogoKarsilamaSatiri>(
    `SELECT s.id AS "siparisSatirId", p.logo_kayit_no AS "siparisKayitNo", k.logo_satir_ref AS "talepSatirRef", s.logo_satir_ref AS "siparisSatirRef", s.miktar::text AS miktar,
        c.malzeme_no AS "malzemeNo", s.birim, q.firma_id AS "firmaId"
       FROM satin_alma_siparis_satiri s
       JOIN satin_alma_siparis p ON p.talep_id = s.talep_id AND p.teklif_id = s.teklif_id
       JOIN satin_alma_teklif q ON q.talep_id = s.talep_id AND q.id = s.teklif_id
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
       JOIN satin_alma_katalog c ON c.id = k.katalog_id
      WHERE s.logo_karsilama_durumu IS DISTINCT FROM 'gonderildi' AND s.logo_satir_ref IS NOT NULL AND k.logo_satir_ref IS NOT NULL
        AND p.logo_kayit_no IS NOT NULL AND p.logo_iptal_durumu IS NULL AND c.malzeme_no IS NOT NULL AND q.firma_id IS NOT NULL
      ORDER BY s.id LIMIT $1`,
    [sinir],
  );
}
// Başarı tekrarlanabilir (aynı numara); dönen satır yoksa satır yok ya da başka numarayla karşılanmış. Hata yalnız gitmemişe yazılır.
export async function karsilamaLogoBasarisiYaz(db: Db, siparisSatirId: number, ref: string): Promise<boolean> {
  return (await db.tek(
    `UPDATE satin_alma_siparis_satiri SET logo_karsilama_ref = $2, logo_karsilama_durumu = 'gonderildi', logo_karsilama_hata = NULL
      WHERE id = $1 AND (logo_karsilama_ref IS NULL OR logo_karsilama_ref = $2) RETURNING id`,
    [siparisSatirId, ref])) !== null;
}
export async function karsilamaLogoHatasiYaz(db: Db, siparisSatirId: number, hata: string): Promise<void> {
  await db.sorgu(`UPDATE satin_alma_siparis_satiri SET logo_karsilama_durumu = 'hata', logo_karsilama_hata = $2
    WHERE id = $1 AND logo_karsilama_durumu IS DISTINCT FROM 'gonderildi'`, [siparisSatirId, hata]);
}

export async function hareketEkle(db: Db, talepId: string, id: string, metin: string, kisiId: number | null): Promise<void> {
  await db.sorgu('INSERT INTO satin_alma_hareket (id, talep_id, kisi_id, metin) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
    [id, talepId, kisiId, metin]);
}

// ---- Tedarikçi
export interface TedarikciSatiri { firmaId: number; durum: 'onayli' | 'deneme' | 'askida'; puan: number | null; notlar: string; surum: number; olusturma: string }
// firmaId null ise bütün tedarikçiler; verilirse yalnız o firma.
export function tedarikcileriOku(db: Db, firmaId: number | null = null): Promise<TedarikciSatiri[]> {
  return db.sorgu<TedarikciSatiri>(`SELECT firma_id AS "firmaId", durum, puan, notlar, surum, ${ISO('olusturma')} AS olusturma FROM satin_alma_tedarikci
    WHERE ($1::int IS NULL OR firma_id = $1) ORDER BY firma_id`, [firmaId]);
}
export function tedarikciKategorileriOku(db: Db, firmaId: number | null = null): Promise<{ firmaId: number; kategori: string }[]> {
  return db.sorgu('SELECT firma_id AS "firmaId", kategori FROM satin_alma_tedarikci_kategorisi WHERE ($1::int IS NULL OR firma_id = $1) ORDER BY firma_id, sira, kategori', [firmaId]);
}
export function degerlendirmeleriOku(db: Db, firmaId: number | null = null): Promise<{ firmaId: number; id: string; tarih: string; puan: number; metin: string; degerlendiren: string; kisiId: number | null }[]> {
  return db.sorgu(`SELECT firma_id AS "firmaId", id, tarih, puan, metin, degerlendiren, kisi_id AS "kisiId"
    FROM satin_alma_tedarikci_degerlendirmesi WHERE ($1::int IS NULL OR firma_id = $1) ORDER BY firma_id, tarih, olusturma`, [firmaId]);
}
export function tedarikciEkle(db: Db, t: TedarikciKaydetYazimi): Promise<{ firmaId: number } | null> {
  // 236 a: durum sütunu yazılmaz (onay durumu Kalite Merkezi'nindir); yeni satır sütunun varsayılanını alır.
  return db.tek(`INSERT INTO satin_alma_tedarikci (firma_id, puan, notlar) VALUES ($1, $2, $3) ON CONFLICT (firma_id) DO NOTHING RETURNING firma_id AS "firmaId"`,
    [t.firmaId, t.puan, t.notlar]);
}
export function tedarikciGuncelle(db: Db, t: TedarikciKaydetYazimi, surum: number): Promise<{ firmaId: number } | null> {
  return db.tek(`UPDATE satin_alma_tedarikci SET puan = $2, notlar = $3, surum = surum + 1, guncelleme = now()
    WHERE firma_id = $1 AND surum = $4 RETURNING firma_id AS "firmaId"`, [t.firmaId, t.puan, t.notlar, surum]);
}
export async function tedarikciVarMi(db: Db, firmaId: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM satin_alma_tedarikci WHERE firma_id = $1', [firmaId])) !== null;
}
export async function tedarikciAltlariniYaz(db: Db, t: TedarikciKaydetYazimi, kisiId: number): Promise<void> {
  await db.sorgu('DELETE FROM satin_alma_tedarikci_kategorisi WHERE firma_id = $1', [t.firmaId]);
  // Girildiği sıra korunur (prototip kategorileri bu sırayla gösterir).
  for (const [i, k] of [...new Set(t.kategoriler)].entries()) await db.sorgu('INSERT INTO satin_alma_tedarikci_kategorisi (firma_id, kategori, sira) VALUES ($1, $2, $3)', [t.firmaId, k, i]);
  for (const d of t.degerlendirmeler) {
    await db.sorgu(`INSERT INTO satin_alma_tedarikci_degerlendirmesi (id, firma_id, tarih, puan, metin, degerlendiren, kisi_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`, [d.id, t.firmaId, d.tarih, d.puan, d.metin, d.degerlendiren, kisiId]);
  }
}
export function tedarikciSil(db: Db, firmaId: number): Promise<{ firmaId: number } | null> {
  return db.tek('DELETE FROM satin_alma_tedarikci WHERE firma_id = $1 RETURNING firma_id AS "firmaId"', [firmaId]);
}

// ---- Katalog
export function katalogOku(db: Db, id: string | null = null): Promise<Omit<KatalogKaydi, 'takmaAdlari' | 'kod' | 'ad' | 'birim'>[]> {
  return db.sorgu(`SELECT id, kategori, ozellik, notlar, malzeme_no AS "malzemeNo", surum, ${ISO('olusturma')} AS olusturma
    FROM satin_alma_katalog WHERE ($1::uuid IS NULL OR id = $1) ORDER BY malzeme_no`, [id]);
}
export function takmaAdlariOku(db: Db): Promise<{ katalogId: string; takmaAd: string }[]> {
  return db.sorgu('SELECT katalog_id AS "katalogId", takma_ad AS "takmaAd" FROM satin_alma_katalog_takma_adi ORDER BY katalog_id, takma_ad');
}
// Katalog kalemi ekleme işlem sonuna kadar sıralanır: aynı karta ikinci kalem açılmamalıdır (KD-012).
export async function katalogEklemeKilidi(db: Db): Promise<void> {
  await islemKilidiAl(db, 'satin-alma-katalog-ekle');
}
// Faturanın sipariş bağı işlem sonuna kadar sıralanır: iki kişi aynı faturayı iki siparişe aynı anda bağlarsa ikincisi öncekinin bağını görür.
export async function faturaBagKilidi(db: Db, belgeId: number): Promise<void> {
  await islemKilidiAl(db, 'satin-alma-fatura-bag', belgeId);
}
type KatalogYazimi = KatalogKaydetYazimi & { kategori: string };
export function katalogEkle(db: Db, k: KatalogYazimi): Promise<{ id: string } | null> {
  return db.tek(
    `INSERT INTO satin_alma_katalog (id, kategori, ozellik, notlar, malzeme_no) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING RETURNING id`,
    [k.id, k.kategori, k.ozellik, k.notlar, k.malzemeNo],
  );
}
export function katalogGuncelle(db: Db, k: KatalogYazimi, surum: number): Promise<{ id: string } | null> {
  return db.tek(`UPDATE satin_alma_katalog SET kategori = $2, ozellik = $3, notlar = $4, malzeme_no = $5, surum = surum + 1, guncelleme = now()
    WHERE id = $1 AND surum = $6 RETURNING id`, [k.id, k.kategori, k.ozellik, k.notlar, k.malzemeNo, surum]);
}
export async function katalogMalzemeNosu(db: Db, id: string): Promise<number | null> {
  return (await db.tek<{ no: number | null }>('SELECT malzeme_no AS no FROM satin_alma_katalog WHERE id = $1', [id]))?.no ?? null;
}
export function katalogMalzemeNolari(db: Db, idler: string[]): Promise<{ id: string; no: number | null }[]> {
  return db.sorgu('SELECT id, malzeme_no AS no FROM satin_alma_katalog WHERE id = ANY($1::uuid[])', [idler]);
}
export function katalogBaglari(db: Db, nolar: number[]): Promise<{ no: number; id: string }[]> {
  return db.sorgu('SELECT malzeme_no AS no, id FROM satin_alma_katalog WHERE malzeme_no = ANY($1::int[])', [nolar]);
}
export async function katalogVarMi(db: Db, id: string): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM satin_alma_katalog WHERE id = $1', [id])) !== null;
}
export async function takmaAdlariYaz(db: Db, id: string, adlar: readonly string[]): Promise<void> {
  await db.sorgu('DELETE FROM satin_alma_katalog_takma_adi WHERE katalog_id = $1', [id]);
  for (const a of new Set(adlar)) await db.sorgu('INSERT INTO satin_alma_katalog_takma_adi (katalog_id, takma_ad) VALUES ($1, $2)', [id, a]);
}
export function katalogSil(db: Db, id: string, surum: number): Promise<{ id: string } | null> {
  return db.tek('DELETE FROM satin_alma_katalog WHERE id = $1 AND surum = $2 RETURNING id', [id, surum]);
}

// ---- Ayarlar
// Kur bu tabloda değil, finanstadır (SA3 a); servis ekler.
export type AyarSatirlari = Omit<Ayarlar, 'kurTarihi' | 'kurlar' | 'sirket' | 'dortGoz' | 'onayKademesi'> & { kurlar: { paraBirimi: Ayarlar['kurlar'][number]['paraBirimi'] }[] };
export async function onayLimitleri(db: Db): Promise<{ azamiTutar: string | null; seviye: string; rolId: number | null }[]> {
  return db.sorgu('SELECT azami_tutar AS "azamiTutar", seviye, rol_id AS "rolId" FROM satin_alma_onay_limiti ORDER BY sira');
}
export async function ayarlariOku(db: Db): Promise<AyarSatirlari> {
  const a = (await db.tek<{ m: number; t: number; td: number; g: number; gecerlilikGun: number; enAzTeklif: number; fiyatUyariYuzdesi: string; surum: number }>(
    `SELECT agirlik_maliyet AS m, agirlik_termin AS t, agirlik_tedarikci AS td, agirlik_garanti AS g, gecerlilik_gun AS "gecerlilikGun",
      en_az_teklif AS "enAzTeklif", fiyat_uyari_yuzdesi AS "fiyatUyariYuzdesi", surum FROM satin_alma_ayar`))!;
  return {
    agirliklar: { maliyet: a.m, termin: a.t, tedarikci: a.td, garanti: a.g }, gecerlilikGun: a.gecerlilikGun,
    enAzTeklif: a.enAzTeklif, fiyatUyariYuzdesi: a.fiyatUyariYuzdesi, surum: a.surum,
    kurlar: await db.sorgu('SELECT para_birimi AS "paraBirimi" FROM satin_alma_kur ORDER BY sira, para_birimi'),
    kategoriler: (await db.sorgu<{ ad: string }>('SELECT ad FROM satin_alma_kategori ORDER BY sira, ad')).map((k) => k.ad),
    birimler: await db.sorgu('SELECT ad, yillik_butce AS "yillikButce" FROM satin_alma_birim ORDER BY sira, ad'),
    onayLimitleri: await onayLimitleri(db),
  };
}
// Teklif ve sabit kur satin_alma_kur'a bağlıdır: ayarları hiç kaydetmemiş kurulumda döviz teklifi yabancı anahtara takılmasın diye yazmadan
// önce eksik para birimi satırı eklenir (sıra sona). Finansın kur tablosuna yazılmaz. Faiz bu tablodan okunmaz, finanstandır (937 b).
export async function paraBirimleriniEkle(db: Db, paraBirimleri: readonly string[]): Promise<void> {
  if (paraBirimleri.length === 0) return;
  await db.sorgu(
    `INSERT INTO satin_alma_kur (para_birimi, sira)
     SELECT k.kod, (SELECT COALESCE(max(sira), 0) FROM satin_alma_kur) + k.n
       FROM unnest($1::char(3)[]) WITH ORDINALITY AS k(kod, n)
     ON CONFLICT (para_birimi) DO NOTHING`,
    [paraBirimleri],
  );
}
export function ayarGuncelle(db: Db, a: AyarlarKaydetYazimi): Promise<{ surum: number } | null> {
  return db.tek(`UPDATE satin_alma_ayar SET agirlik_maliyet = $1, agirlik_termin = $2, agirlik_tedarikci = $3, agirlik_garanti = $4,
      gecerlilik_gun = $5, en_az_teklif = $6, fiyat_uyari_yuzdesi = $7, surum = surum + 1, guncelleme = now()
    WHERE surum = $8 RETURNING surum`,
  [a.agirliklar.maliyet, a.agirliklar.termin, a.agirliklar.tedarikci, a.agirliklar.garanti, a.gecerlilikGun, a.enAzTeklif,
    a.fiyatUyariYuzdesi, a.surum]);
}
// Listeler: kurlar eşitlenir (tekliflerin bağlı olduğu para birimi silinemez), diğerleri baştan yazılır.
export async function ayarListeleriniYaz(db: Db, a: AyarlarKaydetYazimi): Promise<void> {
  const kodlar = a.kurlar.map((k) => k.paraBirimi);
  await db.sorgu("DELETE FROM satin_alma_kur WHERE para_birimi <> 'TRY' AND NOT (para_birimi = ANY($1::char(3)[]))", [kodlar]);
  for (const [i, k] of a.kurlar.entries()) {
    await db.sorgu(`INSERT INTO satin_alma_kur (para_birimi, sira) VALUES ($1, $2)
      ON CONFLICT (para_birimi) DO UPDATE SET sira = EXCLUDED.sira`, [k.paraBirimi, i]);
  }
  await db.sorgu('DELETE FROM satin_alma_kategori');
  for (const [i, ad] of [...new Set(a.kategoriler)].entries()) await db.sorgu('INSERT INTO satin_alma_kategori (ad, sira) VALUES ($1, $2)', [ad, i]);
  // Birim talebe bağlı olabilir: kullanılmayanlar silinir, kalanlar güncellenir.
  await db.sorgu('DELETE FROM satin_alma_birim b WHERE NOT (ad = ANY($1::text[])) AND NOT EXISTS (SELECT 1 FROM satin_alma_talep t WHERE t.birim = b.ad)',
    [a.birimler.map((b) => b.ad)]);
  for (const [i, b] of a.birimler.entries()) {
    await db.sorgu(`INSERT INTO satin_alma_birim (ad, yillik_butce, sira) VALUES ($1, $2, $3)
      ON CONFLICT (ad) DO UPDATE SET yillik_butce = EXCLUDED.yillik_butce, sira = EXCLUDED.sira`, [b.ad, b.yillikButce, i]);
  }
  await db.sorgu('DELETE FROM satin_alma_onay_limiti');
  for (const [i, l] of a.onayLimitleri.entries()) {
    await db.sorgu('INSERT INTO satin_alma_onay_limiti (sira, azami_tutar, seviye, rol_id) VALUES ($1, $2, $3, $4)',
      [i + 1, l.azamiTutar, l.seviye, l.rolId ?? null]);
  }
}

// ---- Stok için: teslim bekleyen sipariş satırları (fiyatsız; mal kabul belgesi bunlara bağlanır). Liste net teslimi miktara ulaşan
// satırı vermez (#544); kimlikle istenen satır teslimi tamamlansa da gelir (geri alma ve fazla teslim o satıra yazılır).
// Kalan miktar (sipariş - net teslim, eksiye inmez) mal kabulde önerilecek miktardır (denetim #18).
export interface SiparisSatiriOkuma {
  id: number; talepId: string; talepNo: string; siparisNo: string; firmaId: number | null; tedarikciAdi: string;
  malzemeNo: number | null; kalemAdi: string; miktar: string; kalanMiktar: string; birim: string; beklenenTeslim: string | null;
  isEmriId: number | null; parcaRevizyonu: string | null;
  // 2881: revizyonun kartı (fasonda uygulanacak parça, değilse kalemin kartı); yürürlükteki revizyon bununla sorulur.
  revizyonMalzemeNo: number | null;
}
export function siparisSatirlariOku(db: Db, idler: readonly number[] | null): Promise<SiparisSatiriOkuma[]> {
  return db.sorgu<SiparisSatiriOkuma>(
    `SELECT s.id, s.talep_id AS "talepId", t.no AS "talepNo", coalesce(p.no, p.siparis_no) AS "siparisNo", q.firma_id AS "firmaId", q.tedarikci_adi AS "tedarikciAdi",
        c.malzeme_no AS "malzemeNo", k.ad AS "kalemAdi", s.miktar, greatest(s.miktar - coalesce(m.toplam, 0), 0)::text AS "kalanMiktar", s.birim,
        p.beklenen_teslim AS "beklenenTeslim", s.is_emri_id AS "isEmriId", s.parca_revizyonu AS "parcaRevizyonu",
        coalesce(k.uygulanan_malzeme_no, c.malzeme_no) AS "revizyonMalzemeNo"
       FROM satin_alma_siparis_satiri s
       JOIN satin_alma_siparis p ON p.talep_id = s.talep_id AND p.teklif_id = s.teklif_id
       JOIN satin_alma_talep t ON t.id = s.talep_id
       JOIN satin_alma_teklif q ON q.talep_id = s.talep_id AND q.id = s.teklif_id
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
       LEFT JOIN satin_alma_katalog c ON c.id = k.katalog_id
       LEFT JOIN LATERAL (SELECT sum(x.miktar) AS toplam FROM satin_alma_teslim x WHERE x.siparis_satiri_id = s.id) m ON true
      WHERE ($1::int[] IS NULL AND t.durum = 'siparis_verildi' AND p.logo_kapatma_durumu IS NULL AND coalesce(m.toplam, 0) < s.miktar)
         OR s.id = ANY($1::int[])
      ORDER BY p.beklenen_teslim NULLS LAST, t.yil, t.sira, k.sira`,
    [idler],
  );
}

// ---- Plan için: açık siparişte gelecek malzeme. Kalan = sipariş miktarı - net teslim (> 0); kalanı kapatılmış sipariş gelmez.
export interface MalzemeGelisiOkuma { malzemeNo: number; tarih: string | null; miktar: string; birim: string; siparisNo: string }
export function malzemeGelisleriOku(db: Db, malzemeNolar: readonly number[]): Promise<MalzemeGelisiOkuma[]> {
  return db.sorgu<MalzemeGelisiOkuma>(
    `SELECT c.malzeme_no AS "malzemeNo", p.beklenen_teslim AS tarih, (s.miktar - coalesce(m.toplam, 0))::text AS miktar, s.birim,
        coalesce(p.no, p.siparis_no) AS "siparisNo"
       FROM satin_alma_siparis_satiri s
       JOIN satin_alma_siparis p ON p.talep_id = s.talep_id AND p.teklif_id = s.teklif_id
       JOIN satin_alma_talep t ON t.id = s.talep_id
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
       JOIN satin_alma_katalog c ON c.id = k.katalog_id
       LEFT JOIN LATERAL (SELECT sum(x.miktar) AS toplam FROM satin_alma_teslim x WHERE x.siparis_satiri_id = s.id) m ON true
      WHERE c.malzeme_no = ANY($1::int[]) AND t.durum = 'siparis_verildi' AND p.logo_kapatma_durumu IS NULL AND coalesce(m.toplam, 0) < s.miktar
      ORDER BY c.malzeme_no, p.beklenen_teslim NULLS LAST, t.yil, t.sira, k.sira`,
    [[...malzemeNolar]],
  );
}

// 3256-1: bir talebin plana giden gelişleri (malzemeGelisleriOku'nun süzgeciyle); talep kaydından önce ve sonra okunur, farkı plan işaretler.
export interface TalepGelisiOkuma { malzemeNo: number; tarih: string | null; miktar: string; satirId: number }
export function talepGelisleriOku(db: Db, talepId: string): Promise<TalepGelisiOkuma[]> {
  return db.sorgu<TalepGelisiOkuma>(
    `SELECT c.malzeme_no AS "malzemeNo", p.beklenen_teslim AS tarih, (s.miktar - coalesce(m.toplam, 0))::text AS miktar, s.id AS "satirId"
       FROM satin_alma_siparis_satiri s
       JOIN satin_alma_siparis p ON p.talep_id = s.talep_id AND p.teklif_id = s.teklif_id
       JOIN satin_alma_talep t ON t.id = s.talep_id
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
       JOIN satin_alma_katalog c ON c.id = k.katalog_id
       LEFT JOIN LATERAL (SELECT sum(x.miktar) AS toplam FROM satin_alma_teslim x WHERE x.siparis_satiri_id = s.id) m ON true
      WHERE s.talep_id = $1 AND c.malzeme_no IS NOT NULL AND t.durum = 'siparis_verildi' AND p.logo_kapatma_durumu IS NULL
        AND coalesce(m.toplam, 0) < s.miktar
      ORDER BY s.id`,
    [talepId],
  );
}

// ---- Stok değeri için alış fiyatları (1382 d). Fiyat net: teklif satırının ve teklifin iskontosu düşülür; masraf dağıtılmaz.
// TRY karşılığı siparişte sabitlenen kurla, yoksa teklif günü kuruyla (döviz teklifi kursuz yazılamaz, SA3); ikisi de yoksa boş.
// Güncel kur finanstadır, burada kullanılmaz. Teslim mal kabul satırı başına netlenir: geri alınan (neti sıfır ya da eksi) teslim
// ne son alış ne ortalama sayılır.
const ETKIN_TESLIM_FIYATI = etkin('f', 's.miktar');
const NET_BIRIM_FIYAT = `${ETKIN_TESLIM_FIYATI} * (1 - COALESCE(f.iskonto_yuzdesi, 0) / 100) * (1 - COALESCE(q.iskonto_yuzdesi, 0) / 100)`;
// 3143 a: sıfır fiyatlı (bedelsiz) teslim alış fiyatı değildir: müşteri malı sıfır fiyatlı siparişle girer (3139 b); sıfır sayılsaydı kendi
// alışımızın ortalamasını ve son alışını düşürürdü. Ortalama, son alış ve stok değerlemesi için fiyatı yoktur (boş), bir önceki gerçek
// alış geçer. Emrin ya da projenin sipariş fiyatı (siparisBirimFiyatlariOku) sıfırı korur: o emre gerçekten bedelsiz gelmiştir.
const ALIS_BIRIM_FIYATI = `nullif(${NET_BIRIM_FIYAT}, 0)`;
const TRY_KURU = "coalesce(sk.kur, q.kur, CASE WHEN q.para_birimi = 'TRY' THEN 1 END)";
const TESLIM_FIYATI_BAGI = `
           JOIN satin_alma_siparis_satiri s ON s.id = m.siparis_satiri_id
           JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
           JOIN satin_alma_katalog c ON c.id = k.katalog_id
           JOIN satin_alma_teklif q ON q.talep_id = s.talep_id AND q.id = s.teklif_id
           JOIN satin_alma_teklif_satiri f ON f.talep_id = s.talep_id AND f.teklif_id = s.teklif_id AND f.kalem_id = s.kalem_id
           LEFT JOIN satin_alma_sabit_kur sk ON sk.talep_id = s.talep_id AND sk.para_birimi = q.para_birimi`;
// Ağırlıklı ortalama: neti artı kalan teslimler, net miktarla; karşılığı olmayan teslim ortalamaya girmez.
export interface OrtalamaAlisFiyatiSatiri { malzemeNo: number; tryBirimFiyat: string | null; teslimSayisi: number }
export function ortalamaAlisFiyatlariOku(db: Db, malzemeNolar: readonly number[]): Promise<OrtalamaAlisFiyatiSatiri[]> {
  return db.sorgu<OrtalamaAlisFiyatiSatiri>(
    `SELECT n.no AS "malzemeNo", (round(sum(x.tl * x.net) / nullif(sum(x.net), 0), 4))::text AS "tryBirimFiyat", count(x.net)::int AS "teslimSayisi"
       FROM unnest($1::int[]) AS n(no)
       LEFT JOIN (
         SELECT c.malzeme_no, sum(m.miktar) AS net, ${ALIS_BIRIM_FIYATI} * ${TRY_KURU} AS tl
           FROM satin_alma_teslim m ${TESLIM_FIYATI_BAGI}
          WHERE c.malzeme_no = ANY($1::int[])
          GROUP BY c.malzeme_no, m.mal_kabul_satiri_id, m.siparis_satiri_id, ${ETKIN_TESLIM_FIYATI}, f.iskonto_yuzdesi, q.iskonto_yuzdesi, sk.kur, q.kur, q.para_birimi
         HAVING sum(m.miktar) > 0) x ON x.malzeme_no = n.no AND x.tl IS NOT NULL
      GROUP BY n.no`,
    [malzemeNolar],
  );
}
// 2613 2/2, 2720-1: emre (KALEM_EMRI) ya da projeye (talebin projesi; emirli talep projeye sayılmaz, 2611 a) bağlı siparişin malzeme başına
// net TRY birim fiyatı, stok değeriyle aynı yoldan; net teslimi olan satırlar, net teslimle ağırlıklı. Fason satırı (iş emri bağı) ve
// kartsız kalem gelmez; iptal talep sayılmaz. Bir satırın TL karşılığı yoksa o çiftin fiyatı boş: kısmi ortalama gerçek alıştan sapardı.
// 2733 a: teslim miktarı fiyatın ağırlığı olan aynı net teslimdir (teslimler eksi iadeler); mal kabul onu stok giriş hareketiyle aynı
// miktardan yazar, birimi stok birimidir. Fiyatı boş çiftin miktarı da bilinir.
export interface SiparisBirimFiyatiSatiri { hedef: 'emir' | 'proje'; hedefId: number; malzemeNo: number; tryBirimFiyati: string | null; teslimMiktari: string }
export function siparisBirimFiyatlariOku(db: Db, emirIdler: readonly number[], projeIdler: readonly number[], malzemeNolar: readonly number[]): Promise<SiparisBirimFiyatiSatiri[]> {
  return db.sorgu<SiparisBirimFiyatiSatiri>(
    `SELECT x.hedef, x.hedef_id AS "hedefId", x.malzeme_no AS "malzemeNo",
            CASE WHEN bool_or(x.tl IS NULL) THEN NULL ELSE (round(sum(x.tl * x.net) / sum(x.net), 4))::text END AS "tryBirimFiyati",
            sum(x.net)::text AS "teslimMiktari"
       FROM (
         SELECT h.hedef, h.hedef_id, c.malzeme_no, sum(m.miktar) AS net, ${NET_BIRIM_FIYAT} * ${TRY_KURU} AS tl
           FROM satin_alma_teslim m ${TESLIM_FIYATI_BAGI}
           JOIN satin_alma_talep t ON t.id = s.talep_id
           LEFT JOIN satin_alma_talep kt ON kt.id = k.kaynak_talep_id
           CROSS JOIN LATERAL (VALUES ('emir', ${KALEM_EMRI}), ('proje', CASE WHEN ${KALEM_EMRI} IS NULL THEN t.proje_id END)) AS h(hedef, hedef_id)
          WHERE t.durum <> 'iptal' AND s.is_emri_id IS NULL AND k.is_emri_id IS NULL AND c.malzeme_no = ANY($3::int[])
            AND ((h.hedef = 'emir' AND h.hedef_id = ANY($1::int[])) OR (h.hedef = 'proje' AND h.hedef_id = ANY($2::int[])))
          GROUP BY h.hedef, h.hedef_id, c.malzeme_no, m.mal_kabul_satiri_id, m.siparis_satiri_id, ${ETKIN_TESLIM_FIYATI}, f.iskonto_yuzdesi, q.iskonto_yuzdesi, sk.kur, q.kur, q.para_birimi
         HAVING sum(m.miktar) > 0) x
      GROUP BY x.hedef, x.hedef_id, x.malzeme_no
      ORDER BY x.hedef, x.hedef_id, x.malzeme_no`,
    [emirIdler, projeIdler, malzemeNolar],
  );
}
export interface SonAlisFiyatiSatiri { malzemeNo: number; birimFiyat: string; paraBirimi: string; tryBirimFiyat: string | null; zaman: string }
export function sonAlisFiyatlariOku(db: Db, malzemeNolar: readonly number[]): Promise<SonAlisFiyatiSatiri[]> {
  return db.sorgu<SonAlisFiyatiSatiri>(
    `SELECT DISTINCT ON (x.malzeme_no) x.malzeme_no AS "malzemeNo", (round(x.net_fiyat, 4))::text AS "birimFiyat", x.para_birimi AS "paraBirimi",
        (round(x.net_fiyat * x.kur, 4))::text AS "tryBirimFiyat", ${ISO('x.zaman')} AS zaman
       FROM (
         SELECT c.malzeme_no, ${ALIS_BIRIM_FIYATI} AS net_fiyat, q.para_birimi::text AS para_birimi, ${TRY_KURU} AS kur,
                max(m.zaman) FILTER (WHERE m.miktar > 0) AS zaman, max(m.id) FILTER (WHERE m.miktar > 0) AS id
           FROM satin_alma_teslim m ${TESLIM_FIYATI_BAGI}
          WHERE c.malzeme_no = ANY($1::int[])
          GROUP BY c.malzeme_no, m.mal_kabul_satiri_id, m.siparis_satiri_id, ${ETKIN_TESLIM_FIYATI}, f.iskonto_yuzdesi, q.iskonto_yuzdesi, sk.kur, q.kur, q.para_birimi
         HAVING sum(m.miktar) > 0) x
      WHERE x.net_fiyat IS NOT NULL
      ORDER BY x.malzeme_no, x.zaman DESC, x.id DESC`,
    [malzemeNolar],
  );
}
// Stokun mal kabul satırı başına net TRY birim fiyatı (stok hareketli ortalaması ve son alışı için). Teslimi olmayan satır yoktur.
export interface MalKabulFiyatiSatiri { malKabulSatirId: number; tryBirimFiyat: string | null }
export function malKabulFiyatlariOku(db: Db, malKabulSatirIdler: readonly number[]): Promise<MalKabulFiyatiSatiri[]> {
  return db.sorgu<MalKabulFiyatiSatiri>(
    `SELECT DISTINCT ON (m.mal_kabul_satiri_id) m.mal_kabul_satiri_id::int AS "malKabulSatirId",
        (round(${ALIS_BIRIM_FIYATI} * ${TRY_KURU}, 4))::text AS "tryBirimFiyat"
       FROM satin_alma_teslim m ${TESLIM_FIYATI_BAGI}
      WHERE m.mal_kabul_satiri_id = ANY($1::bigint[])
      ORDER BY m.mal_kabul_satiri_id, m.id`,
    [malKabulSatirIdler],
  );
}

// 197 a: iş emrine bağlı sipariş satırlarının KDV hariç tutarı, iş emri ve teklif para birimi başına. İskonto teklif başına yüzde
// olduğundan satıra düşer; nakliye ve diğer masraf teklif başınadır, iş emrine dağıtılmaz. İptal edilen talebin satırı sayılmaz.
export interface IsEmriFasonTutari { isEmriId: number; tutar: string; paraBirimi: string }
export function isEmriFasonTutarlari(db: Db, isEmriIdler: readonly number[]): Promise<IsEmriFasonTutari[]> {
  return db.sorgu<IsEmriFasonTutari>(
    `SELECT s.is_emri_id AS "isEmriId", round(sum(s.miktar * ${etkin('f', 's.miktar')} * (1 - COALESCE(f.iskonto_yuzdesi, 0) / 100) * (1 - q.iskonto_yuzdesi / 100)), 2)::text AS tutar, q.para_birimi::text AS "paraBirimi"
       FROM satin_alma_siparis_satiri s
       JOIN satin_alma_talep t ON t.id = s.talep_id
       JOIN satin_alma_teklif q ON q.talep_id = s.talep_id AND q.id = s.teklif_id
       JOIN satin_alma_teklif_satiri f ON f.talep_id = s.talep_id AND f.teklif_id = s.teklif_id AND f.kalem_id = s.kalem_id
      WHERE s.is_emri_id = ANY($1::int[]) AND t.durum <> 'iptal'
      GROUP BY s.is_emri_id, q.para_birimi
      ORDER BY s.is_emri_id, q.para_birimi`,
    [isEmriIdler],
  );
}

// ---- Teslim (SH1 a): stok mal kabul işleminin içinde yazar; kayıt yalnız eklenir.
export interface TeslimToplami { siparisSatiriId: number; toplam: string; sonTarih: string | null }
// Satır başına net teslim ve artı kayıtların son günü; teslim kaydı olmayan satır listede yoktur.
export function teslimToplamlari(db: Db, siparisSatirIdler: readonly number[]): Promise<TeslimToplami[]> {
  return db.sorgu<TeslimToplami>(
    `SELECT siparis_satiri_id AS "siparisSatiriId", sum(miktar)::text AS toplam, (max(zaman) FILTER (WHERE miktar > 0))::date::text AS "sonTarih"
       FROM satin_alma_teslim WHERE siparis_satiri_id = ANY($1::int[]) GROUP BY siparis_satiri_id`,
    [siparisSatirIdler],
  );
}
// Teslim yazılacak sipariş satırının talebi kilitlenir: aynı anda talep kaydı ya da başka teslim beklesin.
export function teslimHedefiKilitle(db: Db, siparisSatirId: number): Promise<{ talepId: string; talepDurumu: string; kapali: boolean } | null> {
  return db.tek<{ talepId: string; talepDurumu: string; kapali: boolean }>(
    `SELECT t.id AS "talepId", t.durum AS "talepDurumu", p.logo_kapatma_durumu IS NOT NULL AS kapali
       FROM satin_alma_siparis_satiri s JOIN satin_alma_talep t ON t.id = s.talep_id
       JOIN satin_alma_siparis p ON p.talep_id = s.talep_id AND p.teklif_id = s.teklif_id
      WHERE s.id = $1 FOR UPDATE OF t`,
    [siparisSatirId],
  );
}
// Mal kabul satırı başına, sipariş satırına göre net teslim (sıfır olanlar düşer).
export function malKabulNetleri(db: Db, malKabulSatirId: number): Promise<{ siparisSatiriId: number; net: string }[]> {
  return db.sorgu<{ siparisSatiriId: number; net: string }>(
    `SELECT siparis_satiri_id AS "siparisSatiriId", sum(miktar)::text AS net FROM satin_alma_teslim
      WHERE mal_kabul_satiri_id = $1 GROUP BY siparis_satiri_id HAVING sum(miktar) <> 0 ORDER BY siparis_satiri_id`,
    [malKabulSatirId],
  );
}
// Kapalı siparişe düzeltme yazımı (1404): aynı işlemde (now() işlem başlangıcıdır) bu sipariş satırına ters teslim yazıldı mı.
export async function buIslemdeGeriAlindiMi(db: Db, siparisSatirId: number): Promise<boolean> {
  return (await db.tek<{ var: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM satin_alma_teslim WHERE siparis_satiri_id = $1 AND miktar < 0 AND zaman = now()) AS var',
    [siparisSatirId],
  ))!.var;
}
export async function teslimEkle(db: Db, siparisSatirId: number, malKabulSatirId: number, miktar: string, kisiId: number): Promise<void> {
  await db.sorgu('INSERT INTO satin_alma_teslim (siparis_satiri_id, mal_kabul_satiri_id, miktar, kisi_id) VALUES ($1, $2, $3, $4)',
    [siparisSatirId, malKabulSatirId, miktar, kisiId]);
}

// Kart 1474: tedarikçi karnesine giden teslim olayının kaynağı. Firma siparişin teklifinden (kayıtsız tedarikçide null), termin
// siparişin beklenen teslimi; net teslim ve artı kayıtların son zamanı satırın bütün teslimlerinden.
export interface KarneTeslimBilgisi { firmaId: number | null; termin: string | null; miktar: string; net: string; sonZaman: string | null }
export function karneTeslimBilgisi(db: Db, siparisSatirId: number): Promise<KarneTeslimBilgisi | null> {
  return db.tek<KarneTeslimBilgisi>(
    `SELECT q.firma_id AS "firmaId", p.beklenen_teslim::text AS termin, s.miktar::text AS miktar,
            coalesce((SELECT sum(miktar) FROM satin_alma_teslim WHERE siparis_satiri_id = s.id), 0)::text AS net,
            ${ISO('(SELECT max(zaman) FROM satin_alma_teslim WHERE siparis_satiri_id = s.id AND miktar > 0)')} AS "sonZaman"
       FROM satin_alma_siparis_satiri s
       JOIN satin_alma_siparis p ON p.talep_id = s.talep_id AND p.teklif_id = s.teklif_id
       JOIN satin_alma_teklif q ON q.talep_id = s.talep_id AND q.id = s.teklif_id
      WHERE s.id = $1`,
    [siparisSatirId],
  );
}

// Onay bekleyen talep, menüde ve panoda tek tanım: onaydaki talepte son onay kaydı "onay" değil (onaylanıp sipariş bekleyen sayılmaz;
// ret sonrası yeniden gönderilen sayılır). Menü yalnız durumu sayınca boş Onaylar sayfasında sayaç 1 görünüyordu (TMI A4).
const ONAY_BEKLEYEN_SQL = `SELECT count(*)::int FROM satin_alma_talep t WHERE t.durum = 'onayda'
               AND (SELECT o.sonuc FROM satin_alma_onay o WHERE o.talep_id = t.id ORDER BY o.zaman DESC, o.id DESC LIMIT 1) IS DISTINCT FROM 'onay'`;

// ---- İkinci menü sayıları (madde başına tek sorgu; yetki serviste süzülür)
export async function menuSayilari(db: Db): Promise<{ acik: number; onayda: number; katalog: number; tedarikci: number }> {
  return (await db.tek<{ acik: number; onayda: number; katalog: number; tedarikci: number }>(
    // "Açık" prototipteki tanımdır (OPEN: taslak, teklif isteniyor, değerlendirme, onayda): menü sayısı listeyle aynı olsun.
    `SELECT (SELECT count(*)::int FROM satin_alma_talep WHERE durum IN ('taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda')) AS acik,
            (${ONAY_BEKLEYEN_SQL}) AS onayda,
            (SELECT count(*)::int FROM satin_alma_katalog) AS katalog,
            (SELECT count(*)::int FROM satin_alma_tedarikci) AS tedarikci`))!;
}

// Pano sayıları. Onay bekleyen: onaydaki talepte son onay kaydı "onay" değil (onaylanıp sipariş bekleyen sayılmaz; ret
// sonrası yeniden gönderilen sayılır). Teslim bekleyen satır: siparişteki talepte net teslimi miktarın altında kalan satır;
// açık sipariş: böyle satırı olan sipariş. Açık sipariş tutarı: bu siparişlerin bütün satırları, iskontolu, nakliye ve masraf
// sipariş başına bir kez; TL'ye sabit kurla, yoksa teklif kuruyla. Kuru bilinmeyen sipariş varsa tutar boş (sıfır uydurulmaz).
export interface PanoSayilariSatiri {
  onayBekleyen: number; acikTalep: number; teslimBekleyenSatir: number; acikSiparis: number; acikSiparisTutari: string | null;
  gecikenTeslim: number; buHaftaGelecekTeslim: number; siparisVerilecek: number; kararVerilecek: number; ihtiyaciGecen: number;
  gecikenEnEskiGun: number | null; ihtiyaciGecenEnEskiGun: number | null;
}
// 2425: iş kutusunun sayımları (istemci calc.ts panoSayilari ve roles.ts ile aynı). Sipariş tedarikçi başına sayılır; Logo'da
// kapatılmamış ve satırlarından biri tam gelmemişse açıktır. Termin beklenen teslim, yoksa sipariş tarihi + teklif termini;
// hesaplanamayan sipariş gecikmeye ve bu haftaya girmez. Bu hafta bugün dahil önümüzdeki 7 gündür.
const ACIK_SIPARIS_TERMINI_SQL = `SELECT COALESCE(p.beklenen_teslim, p.siparis_tarihi + q.termin_gun) AS termin
       FROM satin_alma_siparis p JOIN satin_alma_talep t ON t.id = p.talep_id AND t.durum = 'siparis_verildi'
       JOIN satin_alma_teklif q ON q.talep_id = p.talep_id AND q.id = p.teklif_id
      WHERE p.logo_kapatma_durumu IS NULL AND EXISTS (SELECT 1 FROM satin_alma_siparis_satiri s WHERE s.talep_id = p.talep_id AND s.teklif_id = p.teklif_id
        AND coalesce((SELECT sum(m.miktar) FROM satin_alma_teslim m WHERE m.siparis_satiri_id = s.id), 0) < s.miktar)`;
const SON_ONAY_SQL = `(SELECT o.sonuc FROM satin_alma_onay o WHERE o.talep_id = t.id ORDER BY o.zaman DESC, o.id DESC LIMIT 1)`;
export async function panoSayilari(db: Db): Promise<PanoSayilariSatiri> {
  return (await db.tek<PanoSayilariSatiri>(
    `WITH bekleyen AS (
       SELECT s.talep_id, s.teklif_id FROM satin_alma_siparis_satiri s JOIN satin_alma_talep t ON t.id = s.talep_id AND t.durum = 'siparis_verildi'
       WHERE coalesce((SELECT sum(m.miktar) FROM satin_alma_teslim m WHERE m.siparis_satiri_id = s.id), 0) < s.miktar),
     termin AS (${ACIK_SIPARIS_TERMINI_SQL})
     SELECT (${ONAY_BEKLEYEN_SQL}) AS "onayBekleyen",
            (SELECT count(*)::int FROM satin_alma_talep WHERE durum IN ('taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda')) AS "acikTalep",
            (SELECT count(*)::int FROM bekleyen) AS "teslimBekleyenSatir",
            (SELECT count(*)::int FROM termin WHERE termin < current_date) AS "gecikenTeslim",
            (SELECT max(current_date - termin) FROM termin WHERE termin < current_date) AS "gecikenEnEskiGun",
            (SELECT count(*)::int FROM termin WHERE termin BETWEEN current_date AND current_date + 6) AS "buHaftaGelecekTeslim",
            (SELECT count(*)::int FROM satin_alma_talep t WHERE t.durum = 'onayda' AND ${SON_ONAY_SQL} = 'onay') AS "siparisVerilecek",
            (SELECT count(*)::int FROM satin_alma_talep WHERE durum = 'degerlendirme') AS "kararVerilecek",
            (SELECT count(*)::int FROM satin_alma_talep WHERE durum IN ('taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda') AND ihtiyac_tarihi < current_date) AS "ihtiyaciGecen",
            (SELECT max(current_date - ihtiyac_tarihi) FROM satin_alma_talep WHERE durum IN ('taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda') AND ihtiyac_tarihi < current_date) AS "ihtiyaciGecenEnEskiGun",
            (SELECT count(*)::int FROM (SELECT DISTINCT talep_id, teklif_id FROM bekleyen) x) AS "acikSiparis",
            (SELECT CASE WHEN bool_and(kur IS NOT NULL) IS NOT FALSE THEN coalesce(round(sum(tutar * kur), 2), 0)::text END
               FROM (SELECT (sum(${etkin('f', 's.miktar')} * s.miktar * (1 - COALESCE(f.iskonto_yuzdesi, 0) / 100)) * (1 - q.iskonto_yuzdesi / 100) + q.nakliye + q.diger_masraf) AS tutar,
                            coalesce(sk.kur, q.kur, CASE WHEN q.para_birimi = 'TRY' THEN 1 END) AS kur
                       FROM (SELECT DISTINCT talep_id, teklif_id FROM bekleyen) b
                       JOIN satin_alma_siparis_satiri s ON s.talep_id = b.talep_id AND s.teklif_id = b.teklif_id
                       JOIN satin_alma_teklif q ON q.talep_id = s.talep_id AND q.id = s.teklif_id
                       JOIN satin_alma_teklif_satiri f ON f.talep_id = s.talep_id AND f.teklif_id = s.teklif_id AND f.kalem_id = s.kalem_id
                       LEFT JOIN satin_alma_sabit_kur sk ON sk.talep_id = s.talep_id AND sk.para_birimi = q.para_birimi
                      GROUP BY b.talep_id, b.teklif_id, q.iskonto_yuzdesi, q.nakliye, q.diger_masraf, q.para_birimi, q.kur, sk.kur) x) AS "acikSiparisTutari"`))!;
}

// Karar tarihi sunucunun günüdür (B-001).
export async function bugun(db: Db): Promise<string> {
  const satir = await db.tek<{ bugun: string }>('SELECT current_date::text AS bugun');
  if (satir === null) throw new Error('current_date okunamadı');
  return satir.bugun;
}

export async function siparisSatiriVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek<{ var: boolean }>('SELECT EXISTS (SELECT 1 FROM satin_alma_siparis_satiri WHERE id = $1) AS var', [id]))?.var ?? false;
}

// Kart #1124 (SAT-74): siparişin KDV hariç toplamı (teklif toplamı formülü, sipariş satırlarının miktarıyla; kalem bazlı kararda
// yalnız bu tedarikçiye düşen kalemler), avans ve kalan tutarı, vade günü ve tarihleri. numeric ile hesaplanır.
// 2417: partiler mal kabul günü başına net teslim edilen malın sipariş malına oranı (satır fiyatı ve iskontosuyla), gün sırasıyla;
// geri alınan teslimin günü eksi paydır (kural son partilerden düşer).
export interface SiparisOdemeKosulu {
  teklifId: string; toplam: string; avans: string; kalan: string; vadeGun: number; siparisTarihi: string | null; beklenenTeslim: string | null; malKabul: string | null; kdvOrani: string | null;
  vadeBaslangici: 'teslim' | 'siparis'; partiler: { gun: string; oran: string }[]; tamTeslim: boolean;
  // 2472: kalanı kapatılmış (Logo kapatma durumu dolu) siparişin gerçekleşen değeri kuralda hesaplanır; SQL satır değerlerini verir:
  // satırın genel iskontolu mal tutarı, sipariş miktarı ve net teslimi; masraf nakliye (hariçse) ve diğer masraf.
  kapali: boolean; satirlar: { mal: string; miktar: string; teslim: string }[]; masraf: string;
}
export function siparisOdemeKosullari(db: Db, talepId: string): Promise<SiparisOdemeKosulu[]> {
  return db.sorgu<SiparisOdemeKosulu>(
    `WITH t AS (
       SELECT o.teklif_id, round(
           COALESCE((SELECT sum(ss.miktar * ${etkin('ts', 'ss.miktar')} * (1 - COALESCE(ts.iskonto_yuzdesi, 0) / 100)) FROM satin_alma_siparis_satiri ss
                       JOIN satin_alma_teklif_satiri ts ON ts.talep_id = ss.talep_id AND ts.teklif_id = ss.teklif_id AND ts.kalem_id = ss.kalem_id
                      WHERE ss.talep_id = o.talep_id AND ss.teklif_id = o.teklif_id), 0) * (1 - q.iskonto_yuzdesi / 100)
           + CASE WHEN q.nakliye_dahil THEN 0 ELSE q.nakliye END + q.diger_masraf, 2) AS toplam,
         q.avans_yuzdesi, q.vade_gun, o.siparis_tarihi, o.logo_kapatma_durumu IS NOT NULL AS kapali,
         (SELECT COALESCE(json_agg(json_build_object(
                   'mal', (ss.miktar * ${etkin('ts', 'ss.miktar')} * (1 - COALESCE(ts.iskonto_yuzdesi, 0) / 100) * (1 - q.iskonto_yuzdesi / 100))::text,
                   'miktar', ss.miktar::text,
                   'teslim', coalesce((SELECT sum(x.miktar) FROM satin_alma_teslim x WHERE x.siparis_satiri_id = ss.id), 0)::text) ORDER BY ss.id), '[]'::json)
            FROM satin_alma_siparis_satiri ss
            JOIN satin_alma_teklif_satiri ts ON ts.talep_id = ss.talep_id AND ts.teklif_id = ss.teklif_id AND ts.kalem_id = ss.kalem_id
           WHERE ss.talep_id = o.talep_id AND ss.teklif_id = o.teklif_id) AS satirlar,
         (CASE WHEN q.nakliye_dahil THEN 0 ELSE q.nakliye END + q.diger_masraf)::text AS masraf, o.beklenen_teslim, o.kdv_orani, o.vade_baslangici,
         (SELECT COALESCE(json_agg(json_build_object('gun', to_char(p.gun, 'YYYY-MM-DD'), 'oran', round(p.deger / NULLIF(m.deger, 0), 6)::text) ORDER BY p.gun), '[]'::json)
            FROM (SELECT (x.zaman AT TIME ZONE 'Europe/Istanbul')::date AS gun, sum(x.miktar * ${etkin('ts', 'ss.miktar')} * (1 - COALESCE(ts.iskonto_yuzdesi, 0) / 100)) AS deger
                    FROM satin_alma_teslim x JOIN satin_alma_siparis_satiri ss ON ss.id = x.siparis_satiri_id
                    JOIN satin_alma_teklif_satiri ts ON ts.talep_id = ss.talep_id AND ts.teklif_id = ss.teklif_id AND ts.kalem_id = ss.kalem_id
                   WHERE ss.talep_id = o.talep_id AND ss.teklif_id = o.teklif_id GROUP BY 1) p,
                 (SELECT sum(ss.miktar * ${etkin('ts', 'ss.miktar')} * (1 - COALESCE(ts.iskonto_yuzdesi, 0) / 100)) AS deger FROM satin_alma_siparis_satiri ss
                    JOIN satin_alma_teklif_satiri ts ON ts.talep_id = ss.talep_id AND ts.teklif_id = ss.teklif_id AND ts.kalem_id = ss.kalem_id
                   WHERE ss.talep_id = o.talep_id AND ss.teklif_id = o.teklif_id) m
           WHERE p.deger <> 0 AND m.deger > 0) AS partiler,
         -- Teslimi bitti: kalanı kapatıldı ya da her satır net tam geldi.
         (o.logo_kapatma_durumu IS NOT NULL OR NOT EXISTS (SELECT 1 FROM satin_alma_siparis_satiri ss WHERE ss.talep_id = o.talep_id AND ss.teklif_id = o.teklif_id
            AND coalesce((SELECT sum(x.miktar) FROM satin_alma_teslim x WHERE x.siparis_satiri_id = ss.id), 0) < ss.miktar)) AS tam_teslim,
         -- 2132-6: net teslimi kalan siparişin son mal kabul günü (tesis günü); geri alınmış teslim sayılmaz.
         (SELECT CASE WHEN sum(x.miktar) > 0 THEN (max(x.zaman) FILTER (WHERE x.miktar > 0) AT TIME ZONE 'Europe/Istanbul')::date END
            FROM satin_alma_teslim x JOIN satin_alma_siparis_satiri ss ON ss.id = x.siparis_satiri_id
           WHERE ss.talep_id = o.talep_id AND ss.teklif_id = o.teklif_id) AS mal_kabul
         FROM satin_alma_siparis o JOIN satin_alma_teklif q ON q.talep_id = o.talep_id AND q.id = o.teklif_id
        WHERE o.talep_id = $1)
     SELECT teklif_id AS "teklifId", toplam, round(toplam * avans_yuzdesi / 100, 2) AS avans, toplam - round(toplam * avans_yuzdesi / 100, 2) AS kalan,
            vade_gun AS "vadeGun", ${ISO('siparis_tarihi')} AS "siparisTarihi", ${ISO('beklenen_teslim')} AS "beklenenTeslim",
            ${ISO('mal_kabul')} AS "malKabul", kdv_orani::text AS "kdvOrani", vade_baslangici AS "vadeBaslangici", partiler, tam_teslim AS "tamTeslim",
            kapali, satirlar, masraf
       FROM t`, [talepId]);
}
// 2132-7: siparişin elle seçilen KDV oranı (boş: genel oran).
export async function siparisKdvOraniYaz(db: Db, talepId: string, teklifId: string, oran: string | null): Promise<void> {
  await db.sorgu('UPDATE satin_alma_siparis SET kdv_orani = $3 WHERE talep_id = $1 AND teklif_id = $2', [talepId, teklifId, oran]);
}

// ---- Kg fiyatı (SAT-77): yalnız eklenir. TL karşılığı çağıranın verdiği kurla (para birimi, kur dizileri); kuru olmayan boş.
export interface KgFiyatiOkuma {
  id: number; kaynak: KgFiyatiKaynagi | null; iptalEdildi: boolean;
  // Güvenlik E2: iptal edilen girişin iptal kaydı (gerekçe, kişi, zaman); iptal edilmemişse null.
  iptal: { gerekce: string; kisiId: number; zaman: string } | null;
  kaliteKodu: string; form: string | null; kgFiyati: string; paraBirimi: string; tryKgFiyati: string | null; talasKgFiyati: string | null;
  tryTalasKgFiyati: string | null; gecerlilik: string; aciklama: string; kisiId: number; zaman: string;
  islemKatsayisi: string | null; araciKatsayisi: string | null; etkinKgFiyati: string | null;
}
export type KgFiyatiKaynagi = 'tedarikci_teklifi' | 'piyasa' | 'son_alis';
// 2455-A: iptal satırı (iptal_edilen_id dolu) okunmaz; iptal edilen giriş güncelden düşer, geçmişte işaretli görünür.
const KG_IPTAL_EDILDI = 'EXISTS (SELECT 1 FROM satin_alma_kg_fiyati i WHERE i.iptal_edilen_id = f.id)';
const KG_FIYATI_SECIMI = `f.id, f.kaynak, ${KG_IPTAL_EDILDI} AS "iptalEdildi",
  (SELECT json_build_object('gerekce', i.aciklama, 'kisiId', i.kisi_id, 'zaman', ${ISO('i.zaman')}) FROM satin_alma_kg_fiyati i WHERE i.iptal_edilen_id = f.id) AS iptal,
  f.kalite_kodu AS "kaliteKodu", f.form, f.kg_fiyati::text AS "kgFiyati", f.para_birimi::text AS "paraBirimi",
  (round(f.kg_fiyati * k.kur, 4))::text AS "tryKgFiyati",
  f.talas_kg_fiyati::text AS "talasKgFiyati", (round(f.talas_kg_fiyati * k.kur, 4))::text AS "tryTalasKgFiyati", f.gecerlilik::text AS gecerlilik, f.aciklama, f.kisi_id AS "kisiId", ${ISO('f.zaman')} AS zaman,
  trim_scale(f.islem_katsayisi)::text AS "islemKatsayisi", trim_scale(f.araci_katsayisi)::text AS "araciKatsayisi",
  (round(f.kg_fiyati * f.islem_katsayisi * f.araci_katsayisi, 4))::text AS "etkinKgFiyati"`;
const KG_KURU = 'LEFT JOIN unnest($1::text[], $2::numeric[]) AS k(para_birimi, kur) ON k.para_birimi = f.para_birimi::text';
export interface KurDizisi { paraBirimleri: string[]; kurlar: string[] }
// Kalite + form başına geçerlilik günü bugünü geçmemiş en son giriş; aynı günde sonra girilen kazanır.
// Gün verilirse o gün geçerli olan giriş (stok değerinin ay sonu serisi, 1382 d).
export function guncelKgFiyatlari(db: Db, kur: KurDizisi, gun: string | null = null): Promise<KgFiyatiOkuma[]> {
  return db.sorgu<KgFiyatiOkuma>(
    `SELECT ${KG_FIYATI_SECIMI} FROM (
       SELECT DISTINCT ON (kalite_kodu, form) * FROM satin_alma_kg_fiyati g
        WHERE g.gecerlilik <= coalesce($3::date, current_date) AND g.iptal_edilen_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM satin_alma_kg_fiyati i WHERE i.iptal_edilen_id = g.id)
        ORDER BY kalite_kodu, form, gecerlilik DESC, id DESC) f
       ${KG_KURU}
      ORDER BY f.kalite_kodu, f.form NULLS FIRST`,
    [kur.paraBirimleri, kur.kurlar, gun],
  );
}
export function kgFiyatiGecmisi(db: Db, kur: KurDizisi, kaliteKodu: string, form: string | null): Promise<KgFiyatiOkuma[]> {
  return db.sorgu<KgFiyatiOkuma>(
    `SELECT ${KG_FIYATI_SECIMI} FROM satin_alma_kg_fiyati f ${KG_KURU}
      WHERE f.kalite_kodu = $3 AND f.form IS NOT DISTINCT FROM $4::text AND f.iptal_edilen_id IS NULL ORDER BY f.gecerlilik DESC, f.id DESC`,
    [kur.paraBirimleri, kur.kurlar, kaliteKodu, form],
  );
}
export interface KgFiyatiYazimi { kaliteKodu: string; form: string | null; kgFiyati: string; talasKgFiyati: string | null; paraBirimi: string;
  gecerlilik: string; aciklama: string; islemKatsayisi: string | null; araciKatsayisi: string | null; kaynak: KgFiyatiKaynagi | null;
}
export async function kgFiyatlariEkle(db: Db, kisiId: number, satirlar: readonly KgFiyatiYazimi[]): Promise<void> {
  await db.sorgu(
    `INSERT INTO satin_alma_kg_fiyati (kalite_kodu, form, kg_fiyati, para_birimi, gecerlilik, aciklama, talas_kg_fiyati, islem_katsayisi, araci_katsayisi, kaynak, kisi_id)
     SELECT a, b, c, d, e, f, g, h, i, j, $11::int
       FROM unnest($1::text[], $2::text[], $3::numeric[], $4::text[], $5::date[], $6::text[], $7::numeric[], $8::numeric[], $9::numeric[], $10::text[])
            WITH ORDINALITY AS x(a, b, c, d, e, f, g, h, i, j, sira)
      ORDER BY sira`,
    [satirlar.map((s) => s.kaliteKodu), satirlar.map((s) => s.form), satirlar.map((s) => s.kgFiyati), satirlar.map((s) => s.paraBirimi),
      satirlar.map((s) => s.gecerlilik), satirlar.map((s) => s.aciklama), satirlar.map((s) => s.talasKgFiyati),
      satirlar.map((s) => s.islemKatsayisi), satirlar.map((s) => s.araciKatsayisi), satirlar.map((s) => s.kaynak), kisiId],
  );
}
// 2455-A: iptal yeni satırdır (tablo yalnız eklenir): kalite ve form iptal edilenden, geçerlilik bugün, gerekçe açıklamada.
// İptal edilen satır kilitlenir; iptal satırı ya da zaten iptal edilmiş satır için null döner (ikincisi benzersiz dizinle de korunur).
export type KgIptalSonucu = 'yok' | 'iptal-satiri' | 'zaten-iptal' | 'tamam';
export async function kgFiyatiIptalEt(db: Db, id: number, kisiId: number, gerekce: string): Promise<KgIptalSonucu> {
  const r = await db.tek<{ iptalSatiri: boolean; iptalEdildi: boolean }>(
    `SELECT f.iptal_edilen_id IS NOT NULL AS "iptalSatiri", ${KG_IPTAL_EDILDI} AS "iptalEdildi" FROM satin_alma_kg_fiyati f WHERE f.id = $1 FOR UPDATE`, [id]);
  if (r === null) return 'yok';
  if (r.iptalSatiri) return 'iptal-satiri';
  if (r.iptalEdildi) return 'zaten-iptal';
  await db.sorgu(
    `INSERT INTO satin_alma_kg_fiyati (kalite_kodu, form, gecerlilik, aciklama, iptal_edilen_id, kisi_id)
     SELECT kalite_kodu, form, current_date, $3, id, $2 FROM satin_alma_kg_fiyati WHERE id = $1`, [id, kisiId, gerekce]);
  return 'tamam';
}
// 2455-A son alış: teslimi olan malzeme numaraları (karttan kalite ve form, satın almadan fiyat okunur).
export async function teslimliMalzemeNolari(db: Db): Promise<number[]> {
  return (await db.sorgu<{ no: number }>(
    `SELECT DISTINCT c.malzeme_no AS no FROM satin_alma_teslim m ${TESLIM_FIYATI_BAGI} WHERE m.miktar > 0 AND c.malzeme_no IS NOT NULL ORDER BY 1`)).map((r) => r.no);
}

// ---- 533 a: tedarik termini (malzeme başına tek satır). Planın gereken tarihi sürümü artırmaz: plan her kayıtta tam listeyi
// yazar, sürüm artsaydı açık termin girişleri 409'a düşerdi. Sürüm ve güncelleme yalnız termin girişini izler.
export interface TedarikTerminiOkuma {
  malzemeNo: number; termin: string | null; gerekenTarih: string | null; aciklama: string; surum: number; kisiId: number | null; guncelleme: string;
}
const TERMIN_SECIMI = `malzeme_no AS "malzemeNo", termin, gereken_tarih AS "gerekenTarih", aciklama, surum, kisi_id AS "kisiId",
  ${ISO('guncelleme')} AS guncelleme`;
// nolar null: termini ya da gereken tarihi dolu bütün satırlar (ekran listesi).
export function tedarikTerminleriOku(db: Db, nolar: readonly number[] | null): Promise<TedarikTerminiOkuma[]> {
  return nolar === null
    ? db.sorgu<TedarikTerminiOkuma>(`SELECT ${TERMIN_SECIMI} FROM satin_alma_tedarik_termini
        WHERE termin IS NOT NULL OR gereken_tarih IS NOT NULL ORDER BY gereken_tarih NULLS LAST, termin NULLS LAST, malzeme_no`)
    : db.sorgu<TedarikTerminiOkuma>(`SELECT ${TERMIN_SECIMI} FROM satin_alma_tedarik_termini WHERE malzeme_no = ANY($1::int[]) ORDER BY malzeme_no`, [[...nolar]]);
}
export interface TedarikTerminiYazimi { malzemeNo: number; termin: string | null; aciklama: string }
export function tedarikTerminiEkle(db: Db, y: TedarikTerminiYazimi, kisiId: number): Promise<TedarikTerminiOkuma | null> {
  return db.tek<TedarikTerminiOkuma>(
    `INSERT INTO satin_alma_tedarik_termini (malzeme_no, termin, aciklama, kisi_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (malzeme_no) DO NOTHING RETURNING ${TERMIN_SECIMI}`, [y.malzemeNo, y.termin, y.aciklama, kisiId]);
}
export function tedarikTerminiGuncelle(db: Db, y: TedarikTerminiYazimi, surum: number, kisiId: number): Promise<TedarikTerminiOkuma | null> {
  return db.tek<TedarikTerminiOkuma>(
    `UPDATE satin_alma_tedarik_termini SET termin = $2, aciklama = $3, kisi_id = $4, surum = surum + 1, guncelleme = now()
      WHERE malzeme_no = $1 AND surum = $5 RETURNING ${TERMIN_SECIMI}`, [y.malzemeNo, y.termin, y.aciklama, kisiId, surum]);
}
export async function tedarikTerminiVarMi(db: Db, malzemeNo: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM satin_alma_tedarik_termini WHERE malzeme_no = $1', [malzemeNo])) !== null;
}
// Listede olmayanın gereken tarihi boşalır (plan artık istemiyor); aynı tarih yeniden yazılmaz.
export async function gerekenTarihleriYaz(db: Db, ihtiyaclar: readonly { malzemeNo: number; gerekenTarih: string }[]): Promise<void> {
  const nolar = ihtiyaclar.map((i) => i.malzemeNo);
  await db.sorgu(`UPDATE satin_alma_tedarik_termini SET gereken_tarih = NULL WHERE gereken_tarih IS NOT NULL AND malzeme_no <> ALL($1::int[])`, [nolar]);
  if (ihtiyaclar.length === 0) return;
  await db.sorgu(
    `INSERT INTO satin_alma_tedarik_termini AS t (malzeme_no, gereken_tarih)
     SELECT * FROM unnest($1::int[], $2::date[])
     ON CONFLICT (malzeme_no) DO UPDATE SET gereken_tarih = EXCLUDED.gereken_tarih WHERE t.gereken_tarih IS DISTINCT FROM EXCLUDED.gereken_tarih`,
    [nolar, ihtiyaclar.map((i) => i.gerekenTarih)]);
}

// 898 a: fason ön talep. Bağlı iş emri: siparişi verilmiş ya da iptal olmayan bir talebin kaleminde olan.
export async function fasonBagliIsEmirleri(db: Db, isEmriIdleri: readonly number[]): Promise<Set<number>> {
  if (isEmriIdleri.length === 0) return new Set();
  const satirlar = await db.sorgu<{ id: number }>(
    `SELECT k.is_emri_id AS id FROM satin_alma_talep_kalemi k JOIN satin_alma_talep t ON t.id = k.talep_id
      WHERE k.is_emri_id = ANY($1::int[]) AND t.durum <> 'iptal'
     UNION SELECT s.is_emri_id FROM satin_alma_siparis_satiri s WHERE s.is_emri_id = ANY($1::int[])`,
    [isEmriIdleri],
  );
  return new Set(satirlar.map((r) => r.id));
}
// Aynı fason adımı iki talep aynı anda bağlamasın: bağ denetimi ile yazma arası iş emri başına sıralanır.
export async function fasonBagKilidi(db: Db, isEmriIdleri: readonly number[]): Promise<void> {
  for (const id of [...new Set(isEmriIdleri)].sort((a, b) => a - b)) await islemKilidiAl(db, 'satin-alma-fason-bag', id);
}
export interface OnTalepYoksaySatiri { id: number; isEmriId: number; neden: string; kisiId: number; zaman: string }
export function fasonYoksaylari(db: Db): Promise<OnTalepYoksaySatiri[]> {
  return db.sorgu<OnTalepYoksaySatiri>(
    `SELECT id, is_emri_id AS "isEmriId", neden, kisi_id AS "kisiId", ${ISO('zaman')} AS zaman
       FROM satin_alma_on_talep_yoksay WHERE kaynak = 'fason' ORDER BY zaman DESC, id DESC`,
  );
}
// Aynı iş emri ikinci kez yoksayılırsa ilk karar kalır.
export async function fasonYoksayEkle(db: Db, g: { isEmriId: number; neden: string; kisiId: number }): Promise<void> {
  await db.sorgu(
    `INSERT INTO satin_alma_on_talep_yoksay (kaynak, is_emri_id, neden, kisi_id) VALUES ('fason', $1, $2, $3) ON CONFLICT (is_emri_id) DO NOTHING`,
    [g.isEmriId, g.neden, g.kisiId],
  );
}
export async function onTalepYoksaySil(db: Db, id: number): Promise<boolean> {
  return (await db.tek('DELETE FROM satin_alma_on_talep_yoksay WHERE id = $1 RETURNING id', [id])) !== null;
}
export interface KalemBagSatiri { kalemId: string; uygulananMalzemeNo: number | null; isEmriId: number | null; dieId: number | null }
export async function kalemBaglariYaz(db: Db, talepId: string, baglar: readonly KalemBagSatiri[]): Promise<void> {
  if (baglar.length === 0) return;
  await db.sorgu(
    `UPDATE satin_alma_talep_kalemi k SET uygulanan_malzeme_no = b.uygulanan, is_emri_id = b.is_emri, die_id = b.die
       FROM unnest($2::uuid[], $3::int[], $4::int[], $5::int[]) AS b(id, uygulanan, is_emri, die) WHERE k.talep_id = $1 AND k.id = b.id`,
    [talepId, baglar.map((b) => b.kalemId), baglar.map((b) => b.uygulananMalzemeNo), baglar.map((b) => b.isEmriId), baglar.map((b) => b.dieId)],
  );
}
// Talepteki kalem sırasıyla: sıra burada verilir, PostgreSQL ORDER BY olmadan sıra garantisi vermez (kalem bağları ekranda bu sırayla).
export function kalemBaglariOku(db: Db, talepIdleri: readonly string[]): Promise<(KalemBagSatiri & { talepId: string })[]> {
  return db.sorgu(
    `SELECT talep_id AS "talepId", id AS "kalemId", uygulanan_malzeme_no AS "uygulananMalzemeNo", is_emri_id AS "isEmriId", die_id AS "dieId"
       FROM satin_alma_talep_kalemi WHERE talep_id = ANY($1::uuid[]) AND (uygulanan_malzeme_no IS NOT NULL OR is_emri_id IS NOT NULL OR die_id IS NOT NULL)
      ORDER BY talep_id, sira`,
    [talepIdleri],
  );
}

// 2428: dış işlem emrine bağlı talep kalemleri. Emre bağlı belgede bağ kalemin die_id'si ya da (DIE'den önce açılmış talepte) is_emri_id'sidir.
export interface DieTalepKalemi { talepId: string; talepNo: string; kalemId: string; ad: string; miktar: string | null; birim: string; durum: TalepDurumu }
export function dieTalepKalemleri(db: Db, dieId: number, isEmriId: number | null): Promise<DieTalepKalemi[]> {
  return db.sorgu(
    `SELECT k.talep_id AS "talepId", t.no AS "talepNo", k.id AS "kalemId", k.ad, k.miktar::text AS miktar, k.birim, t.durum
       FROM satin_alma_talep_kalemi k JOIN satin_alma_talep t ON t.id = k.talep_id
      WHERE k.die_id = $1 OR ($2::int IS NOT NULL AND k.is_emri_id = $2)
      ORDER BY t.olusturma, t.id, k.sira`,
    [dieId, isEmriId],
  );
}
// Sipariş satırının DIE'si kalemden okunur (sipariş satırında DIE sütunu yok); emre bağlı satır is_emri_id'siyle de gelir.
export interface DieSiparisSatiri { id: number; talepId: string; siparisNo: string | null; miktar: string; birim: string; tedarikciAdi: string | null }
export function dieSiparisSatirlari(db: Db, dieId: number, isEmriId: number | null): Promise<DieSiparisSatiri[]> {
  return db.sorgu(
    `SELECT s.id, s.talep_id AS "talepId", nullif(p.siparis_no, '') AS "siparisNo", s.miktar::text AS miktar, s.birim,
            nullif(q.tedarikci_adi, '') AS "tedarikciAdi"
       FROM satin_alma_siparis_satiri s
       JOIN satin_alma_siparis p ON p.talep_id = s.talep_id AND p.teklif_id = s.teklif_id
       JOIN satin_alma_teklif q ON q.talep_id = s.talep_id AND q.id = s.teklif_id
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
      WHERE k.die_id = $1 OR ($2::int IS NOT NULL AND s.is_emri_id = $2)
      ORDER BY s.id`,
    [dieId, isEmriId],
  );
}
// Parti belgelerinin sipariş satırı: belge başına en son, iptal olmayan talepten.
export function dieSiparisSatirIdleri(db: Db, dieIdleri: readonly number[]): Promise<{ dieId: number; id: number }[]> {
  if (dieIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `SELECT DISTINCT ON (k.die_id) k.die_id AS "dieId", s.id
       FROM satin_alma_siparis_satiri s
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
       JOIN satin_alma_talep t ON t.id = s.talep_id AND t.durum <> 'iptal'
      WHERE k.die_id = ANY($1::int[])
      ORDER BY k.die_id, s.id DESC`,
    [dieIdleri],
  );
}

// 1105 a: kart kopyası henüz alınmamış sipariş satırları (kartlı kalemler); kopyası olan ve kartsız kalem dönmez.
export function kopyasizSiparisSatirlari(db: Db, talepId: string): Promise<{ satirId: number; malzemeNo: number }[]> {
  return db.sorgu(
    `SELECT ss.id AS "satirId", c.malzeme_no AS "malzemeNo"
       FROM satin_alma_siparis_satiri ss
       JOIN satin_alma_talep_kalemi k ON k.talep_id = ss.talep_id AND k.id = ss.kalem_id
       JOIN satin_alma_katalog c ON c.id = k.katalog_id
       LEFT JOIN satin_alma_siparis_kart_kopyasi kk ON kk.siparis_satiri_id = ss.id
      WHERE ss.talep_id = $1 AND kk.siparis_satiri_id IS NULL`, [talepId]);
}
export async function kartKopyalariniYaz(db: Db, satirlar: readonly { satirId: number; malzemeNo: number; kartSurumu: number; ayrinti: object }[]): Promise<void> {
  if (satirlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO satin_alma_siparis_kart_kopyasi (siparis_satiri_id, malzeme_no, kart_surumu, ayrinti)
     SELECT * FROM unnest($1::int[], $2::int[], $3::int[], $4::jsonb[]) ON CONFLICT (siparis_satiri_id) DO NOTHING`,
    [satirlar.map((x) => x.satirId), satirlar.map((x) => x.malzemeNo), satirlar.map((x) => x.kartSurumu), satirlar.map((x) => JSON.stringify(x.ayrinti))]);
}
export interface KartKopyasiSatiri { kalemId: string; teklifId: string; malzemeNo: number; kartSurumu: number; ayrinti: Record<string, unknown>; zaman: string }
export function kartKopyalariOku(db: Db, talepId: string): Promise<KartKopyasiSatiri[]> {
  return db.sorgu(
    `SELECT ss.kalem_id AS "kalemId", ss.teklif_id AS "teklifId", kk.malzeme_no AS "malzemeNo", kk.kart_surumu AS "kartSurumu", kk.ayrinti,
            ${ISO('kk.zaman')} AS zaman
       FROM satin_alma_siparis_kart_kopyasi kk JOIN satin_alma_siparis_satiri ss ON ss.id = kk.siparis_satiri_id
      WHERE ss.talep_id = $1 ORDER BY ss.id`, [talepId]);
}
// 3121: sipariş satırlarının kart kopyası, talepler toplu (merkezin sipariş tablosu sütunları).
export function kartKopyalariToplu(db: Db, talepIdleri: readonly string[]): Promise<{ talepId: string; kalemId: string; teklifId: string; ayrinti: Record<string, unknown> }[]> {
  return db.sorgu(
    `SELECT ss.talep_id AS "talepId", ss.kalem_id AS "kalemId", ss.teklif_id AS "teklifId", kk.ayrinti
       FROM satin_alma_siparis_kart_kopyasi kk JOIN satin_alma_siparis_satiri ss ON ss.id = kk.siparis_satiri_id
      WHERE ss.talep_id = ANY($1::uuid[]) ORDER BY ss.id`, [talepIdleri]);
}
// 898 a, Dal 2: planın malzeme eksiği. Plan canlıya alınınca tam liste yazılır; listede olmayan satır silinir, aynı satır yeniden yazılmaz.
export interface PlanIhtiyaciSatiri { malzemeNo: number; miktar: string; gerekenTarih: string; emirler: string[]; stokBilinmiyor: boolean }
export async function planIhtiyaclariYaz(db: Db, l: readonly { malzemeNo: number; miktar: number; gerekenTarih: string; emirler: readonly string[]; stokBilinmiyor: boolean }[]): Promise<void> {
  const nolar = l.map((x) => x.malzemeNo);
  await db.sorgu('DELETE FROM satin_alma_plan_ihtiyaci WHERE malzeme_no <> ALL($1::int[])', [nolar]);
  if (l.length === 0) return;
  await db.sorgu(
    `INSERT INTO satin_alma_plan_ihtiyaci AS p (malzeme_no, miktar, gereken_tarih, emirler, stok_bilinmiyor)
     SELECT n, m, g, ARRAY(SELECT jsonb_array_elements_text(e)), b FROM unnest($1::int[], $2::numeric[], $3::date[], $4::jsonb[], $5::bool[]) AS x(n, m, g, e, b)
     ON CONFLICT (malzeme_no) DO UPDATE SET miktar = EXCLUDED.miktar, gereken_tarih = EXCLUDED.gereken_tarih, emirler = EXCLUDED.emirler,
       stok_bilinmiyor = EXCLUDED.stok_bilinmiyor, zaman = now()
     WHERE (p.miktar, p.gereken_tarih, p.emirler, p.stok_bilinmiyor) IS DISTINCT FROM (EXCLUDED.miktar, EXCLUDED.gereken_tarih, EXCLUDED.emirler, EXCLUDED.stok_bilinmiyor)`,
    [nolar, l.map((x) => x.miktar), l.map((x) => x.gerekenTarih), l.map((x) => JSON.stringify(x.emirler)), l.map((x) => x.stokBilinmiyor)],
  );
}
export function planIhtiyaclariOku(db: Db): Promise<PlanIhtiyaciSatiri[]> {
  return db.sorgu<PlanIhtiyaciSatiri>(
    `SELECT malzeme_no AS "malzemeNo", miktar::text AS miktar, to_char(gereken_tarih, 'YYYY-MM-DD') AS "gerekenTarih", emirler, stok_bilinmiyor AS "stokBilinmiyor"
       FROM satin_alma_plan_ihtiyaci ORDER BY gereken_tarih, malzeme_no`,
  );
}
// Sipariş verilmemiş açık talepteki miktar, malzeme ve birim başına (siparişe geçen talep sipariş satırıyla sayılır).
// 2876 (Maliyet E1): güncelleme grubunda aynı ihtiyacın birden çok açık talebi olabilir; grubun yalnız en yeni açık talebi sayılır.
export function acikTalepMiktarlari(db: Db, malzemeNolar: readonly number[]): Promise<{ malzemeNo: number; birim: string; miktar: string }[]> {
  if (malzemeNolar.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `WITH sayilan AS (
       SELECT DISTINCT ON (coalesce(guncellenen_talep_id, id)) id FROM satin_alma_talep
        WHERE durum IN ('taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda')
        ORDER BY coalesce(guncellenen_talep_id, id), olusturma DESC, id DESC)
     SELECT c.malzeme_no AS "malzemeNo", k.birim, sum(k.miktar)::text AS miktar
       FROM satin_alma_talep_kalemi k JOIN sayilan t ON t.id = k.talep_id JOIN satin_alma_katalog c ON c.id = k.katalog_id
      WHERE c.malzeme_no = ANY($1::int[]) AND k.miktar IS NOT NULL
      GROUP BY c.malzeme_no, k.birim`,
    [[...malzemeNolar]],
  );
}
export interface PlanYoksaySatiri { id: number; malzemeNo: number; miktar: string; neden: string; kisiId: number; zaman: string }
export function planYoksaylari(db: Db): Promise<PlanYoksaySatiri[]> {
  return db.sorgu<PlanYoksaySatiri>(
    `SELECT id, malzeme_no AS "malzemeNo", miktar::text AS miktar, neden, kisi_id AS "kisiId", ${ISO('zaman')} AS zaman
       FROM satin_alma_on_talep_yoksay WHERE kaynak = 'plan' ORDER BY zaman DESC, id DESC`,
  );
}
// Malzeme yeniden yoksayılırsa (ihtiyaç arttı) karar o anki miktarla yenilenir.
export async function planYoksayYaz(db: Db, g: { malzemeNo: number; miktar: number; neden: string; kisiId: number }): Promise<void> {
  await db.sorgu(
    `INSERT INTO satin_alma_on_talep_yoksay (kaynak, malzeme_no, miktar, neden, kisi_id) VALUES ('plan', $1, $2, $3, $4)
     ON CONFLICT (malzeme_no) DO UPDATE SET miktar = EXCLUDED.miktar, neden = EXCLUDED.neden, kisi_id = EXCLUDED.kisi_id, zaman = now()`,
    [g.malzemeNo, g.miktar, g.neden, g.kisiId],
  );
}

// Takvim (891): beklenen teslimi aralıkta olan, siparişi verilmiş talebin siparişleri; satırlar teslim durumunu türetmek için gelir.
export interface TakvimSiparisSatiri {
  id: number; no: string | null; beklenenTeslim: string; firmaId: number | null; tedarikciAdi: string; talepBasligi: string; kapali: boolean;
  satirlar: { miktar: string; teslimAlinan: string | null }[];
}
export function takvimSiparisleri(db: Db, baslangic: string, bitis: string): Promise<TakvimSiparisSatiri[]> {
  return db.sorgu<TakvimSiparisSatiri>(
    `SELECT p.id, coalesce(p.no, nullif(p.siparis_no, '')) AS no, p.beklenen_teslim::text AS "beklenenTeslim", q.firma_id AS "firmaId",
        q.tedarikci_adi AS "tedarikciAdi", t.baslik AS "talepBasligi", p.logo_kapatma_durumu IS NOT NULL AS kapali,
        coalesce((SELECT json_agg(json_build_object('miktar', s.miktar::text, 'teslimAlinan', (SELECT sum(x.miktar)::text FROM satin_alma_teslim x WHERE x.siparis_satiri_id = s.id)) ORDER BY s.id)
           FROM satin_alma_siparis_satiri s WHERE s.talep_id = p.talep_id AND s.teklif_id = p.teklif_id), '[]'::json) AS satirlar
       FROM satin_alma_siparis p
       JOIN satin_alma_talep t ON t.id = p.talep_id
       JOIN satin_alma_teklif q ON q.talep_id = p.talep_id AND q.id = p.teklif_id
      WHERE t.durum IN ('siparis_verildi', 'teslim_alindi') AND p.beklenen_teslim BETWEEN $1::date AND $2::date
      ORDER BY p.beklenen_teslim, p.id`,
    [baslangic, bitis],
  );
}

// 1647: revizyonu henüz yazılmamış, malzemeli sipariş satırları (talep başına) ve revizyonun bir kez yazılması.
// 2881: fason kaleminin revizyonu hizmet kartının değil, uygulanacak parçanındır (REVIZYON_KARTI).
const REVIZYON_KARTI = 'coalesce(k.uygulanan_malzeme_no, c.malzeme_no)';
// Yalnız bu kayıtta açılan satır (oncekiler dışındaki): eski boş satıra kayıt anının revizyonu yazılmaz (2881 Test B1).
export function siparisSatirIdleri(db: Db, talepId: string): Promise<number[]> {
  return db.sorgu<{ id: number }>('SELECT id FROM satin_alma_siparis_satiri WHERE talep_id = $1', [talepId]).then((l) => l.map((x) => x.id));
}
export function revizyonsuzSiparisSatirlari(db: Db, talepId: string, oncekiler: readonly number[] = []): Promise<{ id: number; malzemeNo: number }[]> {
  return db.sorgu(
    `SELECT s.id, ${REVIZYON_KARTI} AS "malzemeNo"
       FROM satin_alma_siparis_satiri s
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
       LEFT JOIN satin_alma_katalog c ON c.id = k.katalog_id
      WHERE s.talep_id = $1 AND s.parca_revizyonu IS NULL AND ${REVIZYON_KARTI} IS NOT NULL AND NOT (s.id = ANY($2::int[]))
      ORDER BY s.id`, [talepId, oncekiler]);
}
export async function siparisSatiriRevizyonlariYaz(db: Db, satirlar: readonly { id: number; parcaRevizyonu: string }[]): Promise<void> {
  if (satirlar.length === 0) return;
  await db.sorgu(
    `UPDATE satin_alma_siparis_satiri s SET parca_revizyonu = r.rev
       FROM unnest($1::int[], $2::text[]) AS r(id, rev) WHERE s.id = r.id AND s.parca_revizyonu IS NULL`,
    [satirlar.map((x) => x.id), satirlar.map((x) => x.parcaRevizyonu)]);
}

// Arşivdeki silinmiş malzeme kartlarının bu modüldeki izi (2114c); malzemeler kablolamadan okur.
export async function malzemeKartiIzleri(db: Db, kartlar: readonly MalzemeKartiAnahtari[]): Promise<MalzemeKartiIzi[]> {
  if (kartlar.length === 0) return [];
  return db.sorgu<MalzemeKartiIzi>(
    `WITH k AS (SELECT * FROM unnest($1::int[], $2::text[], $3::text[]) AS k(no, kod, kimlik))
     SELECT k.no, 'Satın alma kataloğu' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id::text) AS ornek
       FROM k JOIN satin_alma_katalog t ON t.malzeme_no = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Ön talep yoksayma' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id::text) AS ornek
       FROM k JOIN satin_alma_on_talep_yoksay t ON t.malzeme_no = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Plan ihtiyacı' AS kayit, 'kesin' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN satin_alma_plan_ihtiyaci t ON t.malzeme_no = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Sipariş kart kopyası' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.siparis_satiri_id::text) AS ornek
       FROM k JOIN satin_alma_siparis_kart_kopyasi t ON t.malzeme_no = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Talep kalemi' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.talep_id::text) AS ornek
       FROM k JOIN satin_alma_talep_kalemi t ON t.uygulanan_malzeme_no = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Tedarik termini' AS kayit, 'kesin' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN satin_alma_tedarik_termini t ON t.malzeme_no = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Sipariş kart kopyası ayrıntısı' AS kayit, 'olasi' AS tur, count(*)::int AS adet, min(t.siparis_satiri_id::text) AS ornek
       FROM k JOIN satin_alma_siparis_kart_kopyasi t ON jsonb_path_exists(t.ayrinti, $4::jsonpath, jsonb_build_object('no', k.no, 'kod', k.kod, 'kimlik', k.kimlik)) GROUP BY k.no`,
    [...malzemeKartiIzParametreleri(kartlar), MALZEME_KARTI_IZ_YOLU],
  );
}

// 2151: Satın alma analizi için sipariş satırları (iptal edilmemiş talep, sipariş günü verilen günden sonra). Fiyat teklif para
// biriminde ve iskontosuzdur; teslim toplamı ve son teslimin tesis günü yanında gelir. Hesap analiz-kurallar.ts'tedir.
export interface AnalizSiparisSatiri {
  id: number; siparisTarihi: string; firmaId: number | null; tedarikciAdi: string; paraBirimi: string; kur: string | null;
  genelIskonto: string; birimFiyat: string | null; satirIskonto: string | null; terminGun: number | null; miktar: string; birim: string;
  katalogId: string | null; ad: string; malzemeNo: number | null; teslimMiktari: string | null; sonTeslimGunu: string | null;
}
export function analizSiparisSatirlari(db: Db, basTarih: string, saatDilimi: string): Promise<AnalizSiparisSatiri[]> {
  return db.sorgu<AnalizSiparisSatiri>(
    `SELECT r.id, s.siparis_tarihi::text AS "siparisTarihi", q.firma_id AS "firmaId", q.tedarikci_adi AS "tedarikciAdi",
            trim(q.para_birimi) AS "paraBirimi", q.kur::text AS kur, q.iskonto_yuzdesi::text AS "genelIskonto",
            ${etkin('f', 'r.miktar')}::text AS "birimFiyat", f.iskonto_yuzdesi::text AS "satirIskonto", COALESCE(f.termin_gun, q.termin_gun) AS "terminGun",
            r.miktar::text AS miktar, r.birim, k.katalog_id::text AS "katalogId", k.ad, c.malzeme_no AS "malzemeNo",
            t.teslim::text AS "teslimMiktari", t.son AS "sonTeslimGunu"
       FROM satin_alma_siparis_satiri r
       JOIN satin_alma_siparis s ON s.talep_id = r.talep_id AND s.teklif_id = r.teklif_id
       JOIN satin_alma_talep tl ON tl.id = r.talep_id AND tl.durum <> 'iptal'
       JOIN satin_alma_teklif q ON q.talep_id = r.talep_id AND q.id = r.teklif_id
       JOIN satin_alma_talep_kalemi k ON k.talep_id = r.talep_id AND k.id = r.kalem_id
       LEFT JOIN satin_alma_teklif_satiri f ON f.talep_id = r.talep_id AND f.teklif_id = r.teklif_id AND f.kalem_id = r.kalem_id
       LEFT JOIN satin_alma_katalog c ON c.id = k.katalog_id
       LEFT JOIN LATERAL (SELECT sum(e.miktar) AS teslim, ((max(e.zaman) FILTER (WHERE e.miktar > 0) AT TIME ZONE $2)::date)::text AS son
                            FROM satin_alma_teslim e WHERE e.siparis_satiri_id = r.id) t ON true
      WHERE s.siparis_tarihi >= $1::date
      ORDER BY s.siparis_tarihi, r.id`,
    [basTarih, saatDilimi],
  );
}

// 2471: talebin aşama uçları (tesis günü). İptal talep gelmez; açılışı verilen günden önce olan gelmez. Onay yalnız 'onay' sonuçlu
// son kayıttır. Tam teslim: talebin her sipariş satırının net teslimi sipariş miktarına ulaştıysa son artı teslimin günüdür.
export interface TalepAsamaOkuma {
  talepId: string; acilis: string; ilkIstek: string | null; sonTeklif: string | null; karar: string | null; kararVeren: number | null;
  sonOnay: string | null; siparis: string | null; ilkTeslim: string | null; tamTeslim: string | null; birim: string | null; kategoriler: string[];
}
export function analizTalepAsamalari(db: Db, basTarih: string, saatDilimi: string): Promise<TalepAsamaOkuma[]> {
  return db.sorgu<TalepAsamaOkuma>(
    `SELECT t.id AS "talepId", ((t.olusturma AT TIME ZONE $2)::date)::text AS acilis,
            (SELECT min(i.gonderim) FROM satin_alma_teklif_istegi i WHERE i.talep_id = t.id)::text AS "ilkIstek",
            (SELECT max(q.teklif_tarihi) FROM satin_alma_teklif q WHERE q.talep_id = t.id)::text AS "sonTeklif",
            kr.karar_tarihi::text AS karar, kr.karar_veren_kisi_id AS "kararVeren",
            (SELECT ((max(o.zaman) AT TIME ZONE $2)::date)::text FROM satin_alma_onay o WHERE o.talep_id = t.id AND o.sonuc = 'onay') AS "sonOnay",
            (SELECT min(sp.siparis_tarihi) FROM satin_alma_siparis sp WHERE sp.talep_id = t.id)::text AS siparis,
            (SELECT ((min(e.zaman) AT TIME ZONE $2)::date)::text FROM satin_alma_teslim e JOIN satin_alma_siparis_satiri r ON r.id = e.siparis_satiri_id
              WHERE r.talep_id = t.id AND e.miktar > 0) AS "ilkTeslim",
            (SELECT CASE WHEN count(*) > 0 AND bool_and(x.net >= x.miktar) THEN ((max(x.son) AT TIME ZONE $2)::date)::text END
               FROM (SELECT r.miktar, coalesce(sum(e.miktar), 0) AS net, max(e.zaman) FILTER (WHERE e.miktar > 0) AS son
                       FROM satin_alma_siparis_satiri r LEFT JOIN satin_alma_teslim e ON e.siparis_satiri_id = r.id
                      WHERE r.talep_id = t.id GROUP BY r.id, r.miktar) x) AS "tamTeslim",
            t.birim, ARRAY(SELECT DISTINCT k.kategori FROM satin_alma_talep_kalemi k WHERE k.talep_id = t.id) AS kategoriler
       FROM satin_alma_talep t LEFT JOIN satin_alma_karar kr ON kr.talep_id = t.id
      WHERE t.durum <> 'iptal' AND (t.olusturma AT TIME ZONE $2)::date >= $1::date
      ORDER BY t.olusturma, t.id`,
    [basTarih, saatDilimi],
  );
}

// 2471: sipariş satırının talep, teklif ve kalem bağı; talebin açılış günü ve teklif sayısı (analizSiparisSatirlari ile aynı süzgeç).
export function analizSiparisBaglari(db: Db, basTarih: string, saatDilimi: string): Promise<{
  id: number; talepId: string; teklifId: string; kalemId: string; talepAcilis: string; teklifSayisi: number;
}[]> {
  return db.sorgu(
    `SELECT r.id, r.talep_id AS "talepId", r.teklif_id AS "teklifId", r.kalem_id AS "kalemId",
            ((tl.olusturma AT TIME ZONE $2)::date)::text AS "talepAcilis",
            (SELECT count(*)::int FROM satin_alma_teklif q WHERE q.talep_id = r.talep_id) AS "teklifSayisi"
       FROM satin_alma_siparis_satiri r
       JOIN satin_alma_siparis s ON s.talep_id = r.talep_id AND s.teklif_id = r.teklif_id
       JOIN satin_alma_talep tl ON tl.id = r.talep_id AND tl.durum <> 'iptal'
      WHERE s.siparis_tarihi >= $1::date`,
    [basTarih, saatDilimi],
  );
}

// 2471: verilen taleplerin bütün teklif satırları (teklif para biriminde, iskontosuz), kaçınılan maliyet için.
export function analizTeklifFiyatlari(db: Db, talepIdler: readonly string[]): Promise<{
  talepId: string; teklifId: string; kalemId: string; paraBirimi: string; kur: string | null; genelIskonto: string; birimFiyat: string;
  satirIskonto: string | null; teknikUygun: boolean;
}[]> {
  if (talepIdler.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `SELECT f.talep_id AS "talepId", f.teklif_id AS "teklifId", f.kalem_id AS "kalemId", trim(q.para_birimi) AS "paraBirimi", q.kur::text AS kur,
            q.iskonto_yuzdesi::text AS "genelIskonto", ${etkin('f', 'GREATEST(k.miktar, f.en_az_miktar)')}::text AS "birimFiyat", f.iskonto_yuzdesi::text AS "satirIskonto",
            q.teknik_uygun AS "teknikUygun"
       FROM satin_alma_teklif_satiri f JOIN satin_alma_teklif q ON q.talep_id = f.talep_id AND q.id = f.teklif_id
       JOIN satin_alma_talep_kalemi k ON k.talep_id = f.talep_id AND k.id = f.kalem_id
      WHERE f.talep_id = ANY($1::uuid[])`,
    [talepIdler],
  );
}

// 2426: fason iş emrinin hizmet sipariş satırı (iptal olmayan talep). Birden çoksa teslimi tamamlanmamış en yenisi, hepsi tamamsa en yenisi.
// 2874-1 a: talebin siparişe geçen fason satırları, bağlı iş emri ve siparişin tedarikçisiyle (kalem bağı ya da satır bağı).
export function siparisFasonFirmalari(db: Db, talepId: string): Promise<{ isEmriId: number; firmaId: number }[]> {
  return db.sorgu<{ isEmriId: number; firmaId: number }>(
    `SELECT DISTINCT COALESCE(s.is_emri_id, k.is_emri_id) AS "isEmriId", q.firma_id AS "firmaId"
       FROM satin_alma_siparis_satiri s
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
       JOIN satin_alma_teklif q ON q.talep_id = s.talep_id AND q.id = s.teklif_id
      WHERE s.talep_id = $1 AND COALESCE(s.is_emri_id, k.is_emri_id) IS NOT NULL AND q.firma_id IS NOT NULL
      ORDER BY 1, 2`,
    [talepId]);
}
export function fasonSiparisSatirlari(db: Db, isEmriIdleri: readonly number[]): Promise<{ isEmriId: number; id: number }[]> {
  if (isEmriIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<{ isEmriId: number; id: number }>(
    `SELECT DISTINCT ON (s.is_emri_id) s.is_emri_id AS "isEmriId", s.id
       FROM satin_alma_siparis_satiri s JOIN satin_alma_talep t ON t.id = s.talep_id AND t.durum <> 'iptal'
      WHERE s.is_emri_id = ANY($1::int[])
      ORDER BY s.is_emri_id, coalesce((SELECT sum(m.miktar) FROM satin_alma_teslim m WHERE m.siparis_satiri_id = s.id), 0) < s.miktar DESC, s.id DESC`,
    [isEmriIdleri]);
}

// ---- 2433 termin takibi: siparişi verilmemiş açık talep kalemleri ve açık sipariş satırlarının kalanı (net teslim düşülür; Logo'da
// kapatılan ya da tamamı gelen satır gelmez). Fiyat taşımaz.
export interface TerminKalemiOkuma {
  kaynak: 'talep' | 'siparis'; talepId: string; talepNo: string; talepDurumu: string; ihtiyacTarihi: string | null;
  kalemId: string; ad: string; birim: string; miktar: string | null; malzemeNo: number | null; isEmriId: number | null;
  teklifId: string | null; siparisNo: string | null; beklenenTeslim: string | null;
}
export function terminKalemleriOku(db: Db): Promise<TerminKalemiOkuma[]> {
  return db.sorgu<TerminKalemiOkuma>(
    `SELECT 'talep' AS kaynak, t.id AS "talepId", t.no AS "talepNo", t.durum AS "talepDurumu", to_char(coalesce(k.kaynak_ihtiyac_tarihi, t.ihtiyac_tarihi), 'YYYY-MM-DD') AS "ihtiyacTarihi",
        k.id AS "kalemId", k.ad, k.birim, k.miktar::text AS miktar, c.malzeme_no AS "malzemeNo", k.is_emri_id AS "isEmriId",
        NULL::uuid AS "teklifId", NULL::text AS "siparisNo", NULL::text AS "beklenenTeslim", t.yil, t.sira, k.sira AS ksira
       FROM satin_alma_talep_kalemi k JOIN satin_alma_talep t ON t.id = k.talep_id LEFT JOIN satin_alma_katalog c ON c.id = k.katalog_id
      WHERE t.durum IN ('taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda')
     UNION ALL
     SELECT 'siparis', t.id, t.no, t.durum, to_char(coalesce(k.kaynak_ihtiyac_tarihi, t.ihtiyac_tarihi), 'YYYY-MM-DD'),
        k.id, k.ad, s.birim, (s.miktar - coalesce(m.toplam, 0))::text, c.malzeme_no, k.is_emri_id,
        s.teklif_id, coalesce(p.no, p.siparis_no), to_char(p.beklenen_teslim, 'YYYY-MM-DD'), t.yil, t.sira, k.sira
       FROM satin_alma_siparis_satiri s
       JOIN satin_alma_siparis p ON p.talep_id = s.talep_id AND p.teklif_id = s.teklif_id
       JOIN satin_alma_talep t ON t.id = s.talep_id
       JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
       LEFT JOIN satin_alma_katalog c ON c.id = k.katalog_id
       LEFT JOIN LATERAL (SELECT sum(x.miktar) AS toplam FROM satin_alma_teslim x WHERE x.siparis_satiri_id = s.id) m ON true
      WHERE t.durum = 'siparis_verildi' AND p.logo_kapatma_durumu IS NULL AND coalesce(m.toplam, 0) < s.miktar
      ORDER BY yil, sira, ksira`,
  );
}

// 2432: hatırlatma adayları. İptal ve teslim alınmış talep aday değildir; sipariş verilmiş talepte yalnız açık siparişler gelir
// (termin takibiyle aynı koşul: Logo'da kapatılmamış ve teslimi tamamlanmamış satırı olan).
export interface HatirlatmaTalebiOkuma {
  talepId: string;
  no: string;
  durum: TalepDurumu;
  ihtiyacTarihi: string | null;
  durumZamani: Date;
  teklifIstegiVar: boolean;
  kararVar: boolean;
  kurKilidi: Date | null;
  sonOnay: { id: string; sonuc: 'onay' | 'ret'; zaman: string } | null;
  istekler: { firmaId: number; tedarikci: string; gonderim: string; teklifVar: boolean }[];
  teklifler: { teklifId: string; tedarikci: string; gecerlilik: string | null }[];
  siparisler: { teklifId: string; siparisNo: string | null; beklenenTeslim: string | null }[];
}
export function hatirlatmaTalepleriOku(db: Db): Promise<HatirlatmaTalebiOkuma[]> {
  return db.sorgu<HatirlatmaTalebiOkuma>(
    `SELECT t.id AS "talepId", t.no, t.durum, to_char(t.ihtiyac_tarihi, 'YYYY-MM-DD') AS "ihtiyacTarihi", t.durum_zamani AS "durumZamani",
        EXISTS (SELECT 1 FROM satin_alma_teklif_istegi r WHERE r.talep_id = t.id) AS "teklifIstegiVar",
        (k.talep_id IS NOT NULL) AS "kararVar", k.kur_kilidi AS "kurKilidi",
        (SELECT json_build_object('id', o.id, 'sonuc', o.sonuc, 'zaman', o.zaman) FROM satin_alma_onay o WHERE o.talep_id = t.id ORDER BY o.zaman DESC, o.id DESC LIMIT 1) AS "sonOnay",
        coalesce((SELECT json_agg(json_build_object('firmaId', r.firma_id, 'tedarikci', coalesce(q1.tedarikci_adi, ''), 'gonderim', to_char(r.gonderim, 'YYYY-MM-DD'),
            'teklifVar', q1.id IS NOT NULL) ORDER BY r.firma_id)
          FROM satin_alma_teklif_istegi r
          LEFT JOIN LATERAL (SELECT q.id, q.tedarikci_adi FROM satin_alma_teklif q WHERE q.talep_id = r.talep_id AND q.firma_id = r.firma_id LIMIT 1) q1 ON true
          WHERE r.talep_id = t.id), '[]') AS istekler,
        coalesce((SELECT json_agg(json_build_object('teklifId', q.id, 'tedarikci', q.tedarikci_adi, 'gecerlilik', to_char(q.gecerlilik, 'YYYY-MM-DD')) ORDER BY q.sira, q.id)
          FROM satin_alma_teklif q WHERE q.talep_id = t.id), '[]') AS teklifler,
        coalesce((SELECT json_agg(json_build_object('teklifId', p.teklif_id, 'siparisNo', coalesce(p.no, p.siparis_no), 'beklenenTeslim', to_char(p.beklenen_teslim, 'YYYY-MM-DD'))
            ORDER BY p.teklif_id)
          FROM satin_alma_siparis p
          WHERE p.talep_id = t.id AND p.logo_kapatma_durumu IS NULL AND EXISTS (
            SELECT 1 FROM satin_alma_siparis_satiri s
            LEFT JOIN LATERAL (SELECT sum(x.miktar) AS toplam FROM satin_alma_teslim x WHERE x.siparis_satiri_id = s.id) m ON true
            WHERE s.talep_id = p.talep_id AND s.teklif_id = p.teklif_id AND coalesce(m.toplam, 0) < s.miktar)), '[]') AS siparisler
       FROM satin_alma_talep t LEFT JOIN satin_alma_karar k ON k.talep_id = t.id
      WHERE t.durum NOT IN ('iptal', 'teslim_alindi') AND t.birlesen_talep_id IS NULL
      ORDER BY t.yil, t.sira`,
  );
}

export async function hatirlatmaKayitlari(db: Db): Promise<{ anahtar: string; tur: string; acik: boolean }[]> {
  return db.sorgu<{ anahtar: string; tur: string; acik: boolean }>('SELECT anahtar, tur, kapandi IS NULL AS acik FROM satin_alma_hatirlatma');
}
// Yalnız yeni eklenen anahtar döner: aynı anda koşan iki tur aynı hatırlatmayı iki kez göndermez.
export async function hatirlatmaEkle(db: Db, anahtar: string, tur: string, talepId: string | null): Promise<boolean> {
  return (await db.tek('INSERT INTO satin_alma_hatirlatma (anahtar, tur, talep_id) VALUES ($1, $2, $3) ON CONFLICT (anahtar) DO NOTHING RETURNING anahtar',
    [anahtar, tur, talepId])) !== null;
}
export async function hatirlatmaKapat(db: Db, anahtarlar: readonly string[]): Promise<void> {
  if (anahtarlar.length === 0) return;
  await db.sorgu('UPDATE satin_alma_hatirlatma SET kapandi = now() WHERE anahtar = ANY($1::text[]) AND kapandi IS NULL', [anahtarlar]);
}

// 2413 a: iptalden önceki durum yalnız sunucunundur (gövdeden yazılmaz); kayıtlı değilse null.
export async function iptalOncesiDurum(db: Db, id: string): Promise<TalepDurumu | null> {
  return (await db.tek<{ d: TalepDurumu | null }>('SELECT iptal_oncesi_durum AS d FROM satin_alma_talep WHERE id = $1', [id]))?.d ?? null;
}

// 2414 a: birleşen talebin kalemlerinin kaynakları (kaynak talep, sırası, ihtiyaç tarihi, birimi).
export interface KalemKaynagi { talepId: string; kalemId: string; kaynakTalepId: string; kaynakIhtiyacTarihi: string | null; kaynakBirim: string | null }
export function kalemKaynaklariOku(db: Db, talepIdleri: readonly string[]): Promise<KalemKaynagi[]> {
  return db.sorgu<KalemKaynagi>(
    `SELECT talep_id AS "talepId", id AS "kalemId", kaynak_talep_id AS "kaynakTalepId", to_char(kaynak_ihtiyac_tarihi, 'YYYY-MM-DD') AS "kaynakIhtiyacTarihi",
        kaynak_birim AS "kaynakBirim"
       FROM satin_alma_talep_kalemi WHERE talep_id = ANY($1::uuid[]) AND kaynak_talep_id IS NOT NULL ORDER BY talep_id, sira`,
    [talepIdleri],
  );
}
// K7: birleştirilecek talepler tek işlemde, kimlik sırasıyla kilitlenir (aynı anda iki birleştirme kilitlenmez); bulunanlar döner.
export async function talepleriKilitle(db: Db, idler: readonly string[]): Promise<string[]> {
  return (await db.sorgu<{ id: string }>('SELECT id FROM satin_alma_talep WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [idler])).map((r) => r.id);
}
// Kalemler kaynak sırası ve kendi sırasıyla birleşen talebe taşınır; anahtar (talep, kalem) değişir. Teklif satırı, karar, senaryo ve
// sipariş satırı yokken çağrılır (2414 V2 a): kalem yabancı anahtarlarında ON UPDATE yoktur.
export async function kalemleriBirlesenTalebeTasi(db: Db, birlesenId: string, kaynakIdleri: readonly string[]): Promise<void> {
  await db.sorgu(
    `WITH sirali AS (
       SELECT k.talep_id, k.id, row_number() OVER (ORDER BY array_position($2::uuid[], k.talep_id), k.sira) AS yeni_sira
         FROM satin_alma_talep_kalemi k WHERE k.talep_id = ANY($2::uuid[]))
     UPDATE satin_alma_talep_kalemi k SET talep_id = $1, sira = s.yeni_sira, kaynak_talep_id = k.talep_id, kaynak_sira = k.sira,
         kaynak_ihtiyac_tarihi = t.ihtiyac_tarihi, kaynak_birim = t.birim
       FROM sirali s, satin_alma_talep t
      WHERE k.talep_id = s.talep_id AND k.id = s.id AND t.id = k.talep_id`,
    [birlesenId, kaynakIdleri],
  );
  await db.sorgu('UPDATE satin_alma_talep SET birlesen_talep_id = $1, surum = surum + 1, guncelleme = now() WHERE id = ANY($2::uuid[])', [birlesenId, kaynakIdleri]);
}
// Ayırma: kalemler kaynağına, kaynaktaki sırasıyla döner; kaynak talebin birleşme bağı kalkar.
export async function kalemleriKaynagaDondur(db: Db, birlesenId: string, kaynakIdleri: readonly string[]): Promise<void> {
  await db.sorgu(
    `UPDATE satin_alma_talep_kalemi SET talep_id = kaynak_talep_id, sira = kaynak_sira, kaynak_talep_id = NULL, kaynak_sira = NULL,
         kaynak_ihtiyac_tarihi = NULL, kaynak_birim = NULL
      WHERE talep_id = $1 AND kaynak_talep_id = ANY($2::uuid[])`,
    [birlesenId, kaynakIdleri],
  );
  await db.sorgu('UPDATE satin_alma_talep SET birlesen_talep_id = NULL, surum = surum + 1, guncelleme = now() WHERE id = ANY($2::uuid[]) AND birlesen_talep_id = $1',
    [birlesenId, kaynakIdleri]);
}
// Dört göz (madde 8): kaynakların açanları, talep edenleri ve geçmişleri birleşen talebin talep eden geçmişine girer. Okuma erişimine girmez (K3).
export async function talepEdenGecmisiniKopyala(db: Db, hedef: string, kaynakIdleri: readonly string[]): Promise<void> {
  await db.sorgu(
    `INSERT INTO satin_alma_talep_eden_gecmisi (talep_id, kisi_id)
     SELECT $1, k FROM (
       SELECT acan_kisi_id AS k FROM satin_alma_talep WHERE id = ANY($2::uuid[])
       UNION SELECT talep_eden_kisi_id FROM satin_alma_talep WHERE id = ANY($2::uuid[])
       UNION SELECT kisi_id FROM satin_alma_talep_eden_gecmisi WHERE talep_id = ANY($2::uuid[])) x
     WHERE k IS NOT NULL ON CONFLICT DO NOTHING`,
    [hedef, kaynakIdleri],
  );
}
// Son kaynak da ayrılınca kalemsiz birleşen talep silinmez, iptal edilir: numara ve geçmiş kalır (Veri). Sürüm çağıranda arttı.
export async function kalemsizTalebiIptalEt(db: Db, id: string, neden: string): Promise<void> {
  await db.sorgu(
    `UPDATE satin_alma_talep SET durum = 'iptal', iptal_nedeni = $2, iptal_oncesi_durum = NULL, durum_zamani = now(), surum = surum + 1, guncelleme = now()
      WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM satin_alma_talep_kalemi WHERE talep_id = $1)`,
    [id, neden],
  );
}

// 2893 D2: Adım Durumu için emre (KALEM_EMRI) ya da fason iş emrine (sipariş satırının ya da kalemin iş emri) bağlı talep kalemleri;
// sipariş satırı varsa sipariş no, beklenen teslim ve net teslim. Fiyat ve tedarikçi okunmaz. İptal talep ve birleşmiş kaynak gelmez
// (kalemi birleşik taleptedir).
export interface EmirTedarikSatiri {
  uretimEmriId: number | null; isEmriId: number | null; malzemeNo: number | null; talepNo: string; talepDurumu: string;
  siparisNo: string | null; beklenenTeslim: string | null; miktar: string | null; teslim: string; kapali: boolean;
}
export function emirTedarikDurumlariOku(db: Db, uretimEmriIdleri: readonly number[], isEmriIdleri: readonly number[]): Promise<EmirTedarikSatiri[]> {
  return db.sorgu<EmirTedarikSatiri>(
    `SELECT ${KALEM_EMRI} AS "uretimEmriId", coalesce(s.is_emri_id, k.is_emri_id) AS "isEmriId", c.malzeme_no AS "malzemeNo",
            t.no AS "talepNo", t.durum AS "talepDurumu", coalesce(p.no, nullif(p.siparis_no, '')) AS "siparisNo", p.beklenen_teslim::text AS "beklenenTeslim",
            s.miktar::text AS miktar, coalesce(m.toplam, 0)::text AS teslim, (p.logo_kapatma_durumu IS NOT NULL) AS kapali
       FROM satin_alma_talep_kalemi k
       JOIN satin_alma_talep t ON t.id = k.talep_id
       LEFT JOIN satin_alma_talep kt ON kt.id = k.kaynak_talep_id
       LEFT JOIN satin_alma_katalog c ON c.id = k.katalog_id
       LEFT JOIN satin_alma_siparis_satiri s ON s.talep_id = k.talep_id AND s.kalem_id = k.id
       LEFT JOIN satin_alma_siparis p ON p.talep_id = s.talep_id AND p.teklif_id = s.teklif_id
       LEFT JOIN LATERAL (SELECT sum(x.miktar) AS toplam FROM satin_alma_teslim x WHERE x.siparis_satiri_id = s.id) m ON true
      WHERE t.durum <> 'iptal' AND t.birlesen_talep_id IS NULL
        AND (${KALEM_EMRI} = ANY($1::int[]) OR coalesce(s.is_emri_id, k.is_emri_id) = ANY($2::int[]))
      ORDER BY t.yil, t.sira, k.sira`,
    [uretimEmriIdleri, isEmriIdleri],
  );
}

// D7: numarası ya da Logo kayıt numarası CORE MES siparişine ait mi (Logo'daki sipariş düzeltmesi bunu düzeltmez, G3).
export async function coreSiparisiMi(db: Db, no: string, logoKayitNo: string): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM satin_alma_siparis WHERE no = $1 OR logo_kayit_no = $2 LIMIT 1', [no, logoKayitNo])) !== null;
}
