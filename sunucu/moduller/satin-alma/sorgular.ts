import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';
import type {
  Ayarlar, AyarlarKaydetYazimi, Hareket, KatalogKaydetYazimi, KatalogKaydi, Onay, Talep, TalepYazimi, Teklif,
  TedarikciKaydetYazimi,
} from '#paylasilan/sozlesme/satin-alma.ts';

const ISO = (s: string) => `to_json(${s}) #>> '{}'`;

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
}
const TALEP = `id, no, baslik, birim, talep_eden_kisi_id AS "talepEdenKisiId", acan_kisi_id AS "acanKisiId", oncelik,
  ihtiyac_tarihi AS "ihtiyacTarihi", notlar, durum, iptal_nedeni AS "iptalNedeni", agirlik_maliyet AS "agirlikMaliyet",
  agirlik_termin AS "agirlikTermin", agirlik_tedarikci AS "agirlikTedarikci", agirlik_garanti AS "agirlikGaranti", teslim_yontemi AS "teslimYontemi", uretim_emri_id AS "uretimEmriId", surum,
  ${ISO('olusturma')} AS olusturma, ${ISO('guncelleme')} AS guncelleme`;

// kisiId verilirse yalnız o kişinin açtığı ya da adına açılan talepler.
export function talepSatirlariOku(db: Db, kisiId: number | null, id: string | null = null): Promise<TalepSatiri[]> {
  return db.sorgu<TalepSatiri>(
    `SELECT ${TALEP} FROM satin_alma_talep
      WHERE ($1::int IS NULL OR acan_kisi_id = $1 OR talep_eden_kisi_id = $1) AND ($2::uuid IS NULL OR id = $2)
      ORDER BY olusturma DESC, no DESC`,
    [kisiId, id],
  );
}

export interface AltKayitlar {
  kalemler: (Talep['kalemler'][number] & { talepId: string })[];
  istekler: (Talep['teklifIstekleri'][number] & { talepId: string })[];
  teklifler: (Omit<Teklif, 'fiyatlar'> & { talepId: string })[];
  fiyatlar: { talepId: string; teklifId: string; kalemId: string; birimFiyat: string; iskontoYuzdesi: string | null; terminGun: number | null; enAzMiktar: string | null }[];
  kararlar: { talepId: string; mod: 'tek' | 'bolunmus'; teklifId: string | null; gerekce: string; kararVerenKisiId: number | null; kararTarihi: string; ogrenilenler: string; kurKilidi: string | null }[];
  bolunmeler: { talepId: string; kalemId: string; teklifId: string }[];
  sabitKurlar: { talepId: string; paraBirimi: string; kur: string; aylikFaizYuzdesi: string | null }[];
  siparisler: {
    talepId: string; teklifId: string; no: string | null; siparisNo: string; siparisTarihi: string | null; beklenenTeslim: string | null;
    logoDurumu: 'bekliyor' | 'gonderildi' | 'hata' | null; logoKayitNo: string | null; logoHata: string | null;
    logoIptalDurumu: 'bekliyor' | 'gonderildi' | 'hata' | null; logoIptalHata: string | null;
    logoGuncellemeDurumu: 'bekliyor' | 'gonderildi' | 'hata' | null; logoGuncellemeHata: string | null;
    logoKapatmaDurumu: 'bekliyor' | 'gonderildi' | 'hata' | null; logoKapatmaHata: string | null;
  }[];
  siparisSatirlari: { talepId: string; teklifId: string; id: number; kalemId: string; miktar: string; birim: string }[];
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
    kararlar: await q(`SELECT talep_id AS "talepId", mod, teklif_id AS "teklifId", gerekce, karar_veren_kisi_id AS "kararVerenKisiId",
      karar_tarihi AS "kararTarihi", ogrenilenler, ${ISO('kur_kilidi')} AS "kurKilidi" FROM satin_alma_karar WHERE talep_id = ANY($1::uuid[])`),
    bolunmeler: await q(`SELECT b.talep_id AS "talepId", b.kalem_id AS "kalemId", b.teklif_id AS "teklifId"
      FROM satin_alma_karar_kalemi b JOIN satin_alma_talep_kalemi k ON k.talep_id = b.talep_id AND k.id = b.kalem_id
      WHERE b.talep_id = ANY($1::uuid[]) ORDER BY b.talep_id, k.sira`),
    sabitKurlar: await q(`SELECT talep_id AS "talepId", para_birimi AS "paraBirimi", kur, aylik_faiz_yuzdesi AS "aylikFaizYuzdesi"
      FROM satin_alma_sabit_kur WHERE talep_id = ANY($1::uuid[]) ORDER BY talep_id, para_birimi`),
    siparisler: await q(`SELECT talep_id AS "talepId", teklif_id AS "teklifId", no, siparis_no AS "siparisNo", siparis_tarihi AS "siparisTarihi",
      beklenen_teslim AS "beklenenTeslim", logo_gonderim_durumu AS "logoDurumu", logo_kayit_no AS "logoKayitNo", logo_hata AS "logoHata",
      logo_iptal_durumu AS "logoIptalDurumu", logo_iptal_hata AS "logoIptalHata",
      logo_guncelleme_durumu AS "logoGuncellemeDurumu", logo_guncelleme_hata AS "logoGuncellemeHata",
      logo_kapatma_durumu AS "logoKapatmaDurumu", logo_kapatma_hata AS "logoKapatmaHata" FROM satin_alma_siparis WHERE talep_id = ANY($1::uuid[]) ORDER BY talep_id, id`),
    siparisSatirlari: await q(`SELECT s.talep_id AS "talepId", s.teklif_id AS "teklifId", s.id, s.kalem_id AS "kalemId", s.miktar, s.birim
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
];

export async function talepEkle(db: Db, t: TalepYazimi, no: string, talepEden: number, acan: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO satin_alma_talep (id, no, acan_kisi_id, baslik, birim, talep_eden_kisi_id, oncelik, ihtiyac_tarihi, notlar, durum,
       iptal_nedeni, agirlik_maliyet, agirlik_termin, agirlik_tedarikci, agirlik_garanti, uretim_emri_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [t.id, no, acan, ...anaDegerler(t, talepEden)],
  );
}

// Sürüm tutmazsa satır dönmez; çağıran çekirdeğin surumluGuncelle'si ile 404/409 ayırır.
export function talepGuncelle(db: Db, t: TalepYazimi, talepEden: number, surum: number): Promise<{ id: string } | null> {
  return db.tek<{ id: string }>(
    `UPDATE satin_alma_talep SET baslik = $3, birim = $4, talep_eden_kisi_id = $5, oncelik = $6, ihtiyac_tarihi = $7, notlar = $8, durum = $9,
       iptal_nedeni = $10, agirlik_maliyet = $11, agirlik_termin = $12, agirlik_tedarikci = $13, agirlik_garanti = $14, uretim_emri_id = $15,
       surum = surum + 1, guncelleme = now()
     WHERE id = $1 AND surum = $2 RETURNING id`,
    [t.id, surum, ...anaDegerler(t, talepEden)],
  );
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

// Stok mal kabulü: sipariş satırının talebindeki üretim emri; emre bağlı olmayan talebin satırı haritada yoktur.
export async function siparisSatirlarininEmri(db: Db, idler: readonly number[]): Promise<{ id: number; uretimEmriId: number }[]> {
  return db.sorgu<{ id: number; uretimEmriId: number }>(
    `SELECT s.id, t.uretim_emri_id AS "uretimEmriId" FROM satin_alma_siparis_satiri s JOIN satin_alma_talep t ON t.id = s.talep_id
      WHERE s.id = ANY($1::int[]) AND t.uretim_emri_id IS NOT NULL`,
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
        `INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, siparis_no, siparis_tarihi, beklenen_teslim) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (talep_id, teklif_id) DO UPDATE SET siparis_no = EXCLUDED.siparis_no, siparis_tarihi = EXCLUDED.siparis_tarihi,
           beklenen_teslim = EXCLUDED.beklenen_teslim`,
        [id, s.teklifId, no, s.siparisNo, s.siparisTarihi, s.beklenenTeslim],
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
// Talep iptal edilince: Logo'da kaydı olan siparişin iptali kuyruğa girer (bekleyen düzenleme düşer), henüz gitmemiş sipariş kuyruktan çıkar.
export async function siparisIptaliniLogoyaIsaretle(db: Db, talepId: string): Promise<void> {
  await db.sorgu(`UPDATE satin_alma_siparis SET logo_iptal_durumu = 'bekliyor', logo_iptal_hata = NULL, logo_guncelleme_durumu = NULL, logo_guncelleme_hata = NULL,
      logo_kapatma_durumu = CASE WHEN logo_kapatma_durumu = 'gonderildi' THEN 'gonderildi' END, logo_kapatma_hata = NULL
    WHERE talep_id = $1 AND logo_kayit_no IS NOT NULL AND logo_iptal_durumu IS NULL`, [talepId]);
  await db.sorgu(`UPDATE satin_alma_siparis SET logo_gonderim_durumu = NULL, logo_hata = NULL, logo_gonderim_zamani = NULL
    WHERE talep_id = $1 AND logo_kayit_no IS NULL`, [talepId]);
}
export interface LogoSiparisSatiri {
  id: number; no: string; tarih: string; firmaId: number; paraBirimi: string; kur: string | null; iskontoYuzdesi: string; termin: string | null;
  durum: 'bekliyor' | 'hata'; logoKayitNo: string | null; kaldirilanSatirRefleri: string[];
}
// Tarih sipariş tarihidir; girilmemişse Logo'ya gönderildiği gün (İstanbul). Kur siparişte sabitlenen, yoksa teklifin kuru; TRY'de boş.
// Gönderim kuyruğu ilk kaydı, düzenleme kuyruğu Logo'da kaydı olanın değişikliğini taşır (iptali kuyrukta olan düzenlenmez).
export function logoyaGidecekSiparislerOku(db: Db, sinir: number, kuyruk: 'gonderim' | 'guncelleme' = 'gonderim'): Promise<LogoSiparisSatiri[]> {
  const kosul = kuyruk === 'gonderim' ? "p.logo_gonderim_durumu IN ('bekliyor', 'hata')"
    : "p.logo_guncelleme_durumu IN ('bekliyor', 'hata') AND p.logo_iptal_durumu IS NULL";
  const durum = kuyruk === 'gonderim' ? 'p.logo_gonderim_durumu' : 'p.logo_guncelleme_durumu';
  return db.sorgu<LogoSiparisSatiri>(
    `SELECT p.id, coalesce(p.no, '') AS no, coalesce(p.siparis_tarihi, (now() AT TIME ZONE 'Europe/Istanbul')::date)::text AS tarih,
        q.firma_id AS "firmaId", q.para_birimi AS "paraBirimi",
        CASE WHEN q.para_birimi = 'TRY' THEN NULL ELSE coalesce(sk.kur, q.kur)::text END AS kur, q.iskonto_yuzdesi::text AS "iskontoYuzdesi",
        p.beklenen_teslim::text AS termin, ${durum} AS durum, p.logo_kayit_no AS "logoKayitNo",
        p.logo_kaldirilan_satir_refleri AS "kaldirilanSatirRefleri"
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
    `SELECT p.id AS "siparisId", s.id AS "satirId", c.malzeme_no AS "malzemeNo", s.miktar::text AS miktar, s.birim, round(f.birim_fiyat * (1 - COALESCE(f.iskonto_yuzdesi, 0) / 100), 4)::text AS "birimFiyat",
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
  return (await db.tek(`UPDATE satin_alma_siparis SET logo_kapatma_durumu = 'bekliyor', logo_kapatma_hata = NULL
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
export interface TedarikciSatiri { firmaId: number; durum: 'onayli' | 'deneme' | 'askida'; puan: number; notlar: string; surum: number; olusturma: string }
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
export type AyarSatirlari = Omit<Ayarlar, 'kurTarihi' | 'kurlar'> & { kurlar: { paraBirimi: Ayarlar['kurlar'][number]['paraBirimi'] }[] };
export async function onayLimitleri(db: Db): Promise<{ azamiTutar: string | null; seviye: string }[]> {
  return db.sorgu('SELECT azami_tutar AS "azamiTutar", seviye FROM satin_alma_onay_limiti ORDER BY sira');
}
export async function ayarlariOku(db: Db): Promise<AyarSatirlari> {
  const a = (await db.tek<{ sirket: string; m: number; t: number; td: number; g: number; gecerlilikGun: number; enAzTeklif: number; fiyatUyariYuzdesi: string; surum: number }>(
    `SELECT sirket, agirlik_maliyet AS m, agirlik_termin AS t, agirlik_tedarikci AS td, agirlik_garanti AS g, gecerlilik_gun AS "gecerlilikGun",
      en_az_teklif AS "enAzTeklif", fiyat_uyari_yuzdesi AS "fiyatUyariYuzdesi", surum FROM satin_alma_ayar`))!;
  return {
    sirket: a.sirket, agirliklar: { maliyet: a.m, termin: a.t, tedarikci: a.td, garanti: a.g }, gecerlilikGun: a.gecerlilikGun,
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
export async function sirketAdiOku(db: Db): Promise<string> {
  return (await db.tek<{ sirket: string }>('SELECT sirket FROM satin_alma_ayar'))!.sirket;
}
export function ayarGuncelle(db: Db, a: AyarlarKaydetYazimi): Promise<{ surum: number } | null> {
  return db.tek(`UPDATE satin_alma_ayar SET sirket = $1, agirlik_maliyet = $2, agirlik_termin = $3, agirlik_tedarikci = $4, agirlik_garanti = $5,
      gecerlilik_gun = $6, en_az_teklif = $7, fiyat_uyari_yuzdesi = $8, surum = surum + 1, guncelleme = now()
    WHERE surum = $9 RETURNING surum`,
  [a.sirket, a.agirliklar.maliyet, a.agirliklar.termin, a.agirliklar.tedarikci, a.agirliklar.garanti, a.gecerlilikGun, a.enAzTeklif,
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
    await db.sorgu('INSERT INTO satin_alma_onay_limiti (sira, azami_tutar, seviye) VALUES ($1, $2, $3)', [i + 1, l.azamiTutar, l.seviye]);
  }
}

// ---- Stok için: teslim bekleyen sipariş satırları (fiyatsız; mal kabul belgesi bunlara bağlanır). Liste net teslimi miktara ulaşan
// satırı vermez (#544); kimlikle istenen satır teslimi tamamlansa da gelir (geri alma ve fazla teslim o satıra yazılır).
// Kalan miktar (sipariş - net teslim, eksiye inmez) mal kabulde önerilecek miktardır (denetim #18).
export interface SiparisSatiriOkuma {
  id: number; talepId: string; talepNo: string; siparisNo: string; firmaId: number | null; tedarikciAdi: string;
  malzemeNo: number | null; kalemAdi: string; miktar: string; kalanMiktar: string; birim: string; beklenenTeslim: string | null;
}
export function siparisSatirlariOku(db: Db, idler: readonly number[] | null): Promise<SiparisSatiriOkuma[]> {
  return db.sorgu<SiparisSatiriOkuma>(
    `SELECT s.id, s.talep_id AS "talepId", t.no AS "talepNo", coalesce(p.no, p.siparis_no) AS "siparisNo", q.firma_id AS "firmaId", q.tedarikci_adi AS "tedarikciAdi",
        c.malzeme_no AS "malzemeNo", k.ad AS "kalemAdi", s.miktar, greatest(s.miktar - coalesce(m.toplam, 0), 0)::text AS "kalanMiktar", s.birim,
        p.beklenen_teslim AS "beklenenTeslim"
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

// ---- Stok değeri için alış fiyatları (1382 d). Fiyat net: teklif satırının ve teklifin iskontosu düşülür; masraf dağıtılmaz.
// TRY karşılığı siparişte sabitlenen kurla, yoksa teklif günü kuruyla (döviz teklifi kursuz yazılamaz, SA3); ikisi de yoksa boş.
// Güncel kur finanstadır, burada kullanılmaz. Teslim mal kabul satırı başına netlenir: geri alınan (neti sıfır ya da eksi) teslim
// ne son alış ne ortalama sayılır.
const NET_BIRIM_FIYAT = 'f.birim_fiyat * (1 - COALESCE(f.iskonto_yuzdesi, 0) / 100) * (1 - COALESCE(q.iskonto_yuzdesi, 0) / 100)';
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
         SELECT c.malzeme_no, sum(m.miktar) AS net, ${NET_BIRIM_FIYAT} * ${TRY_KURU} AS tl
           FROM satin_alma_teslim m ${TESLIM_FIYATI_BAGI}
          WHERE c.malzeme_no = ANY($1::int[])
          GROUP BY c.malzeme_no, m.mal_kabul_satiri_id, m.siparis_satiri_id, f.birim_fiyat, f.iskonto_yuzdesi, q.iskonto_yuzdesi, sk.kur, q.kur, q.para_birimi
         HAVING sum(m.miktar) > 0) x ON x.malzeme_no = n.no AND x.tl IS NOT NULL
      GROUP BY n.no`,
    [malzemeNolar],
  );
}
export interface SonAlisFiyatiSatiri { malzemeNo: number; birimFiyat: string; paraBirimi: string; tryBirimFiyat: string | null; zaman: string }
export function sonAlisFiyatlariOku(db: Db, malzemeNolar: readonly number[]): Promise<SonAlisFiyatiSatiri[]> {
  return db.sorgu<SonAlisFiyatiSatiri>(
    `SELECT DISTINCT ON (x.malzeme_no) x.malzeme_no AS "malzemeNo", (round(x.net_fiyat, 4))::text AS "birimFiyat", x.para_birimi AS "paraBirimi",
        (round(x.net_fiyat * x.kur, 4))::text AS "tryBirimFiyat", ${ISO('x.zaman')} AS zaman
       FROM (
         SELECT c.malzeme_no, ${NET_BIRIM_FIYAT} AS net_fiyat, q.para_birimi::text AS para_birimi, ${TRY_KURU} AS kur,
                max(m.zaman) FILTER (WHERE m.miktar > 0) AS zaman, max(m.id) FILTER (WHERE m.miktar > 0) AS id
           FROM satin_alma_teslim m ${TESLIM_FIYATI_BAGI}
          WHERE c.malzeme_no = ANY($1::int[])
          GROUP BY c.malzeme_no, m.mal_kabul_satiri_id, m.siparis_satiri_id, f.birim_fiyat, f.iskonto_yuzdesi, q.iskonto_yuzdesi, sk.kur, q.kur, q.para_birimi
         HAVING sum(m.miktar) > 0) x
      ORDER BY x.malzeme_no, x.zaman DESC, x.id DESC`,
    [malzemeNolar],
  );
}
// Stokun mal kabul satırı başına net TRY birim fiyatı (stok hareketli ortalaması ve son alışı için). Teslimi olmayan satır yoktur.
export interface MalKabulFiyatiSatiri { malKabulSatirId: number; tryBirimFiyat: string | null }
export function malKabulFiyatlariOku(db: Db, malKabulSatirIdler: readonly number[]): Promise<MalKabulFiyatiSatiri[]> {
  return db.sorgu<MalKabulFiyatiSatiri>(
    `SELECT DISTINCT ON (m.mal_kabul_satiri_id) m.mal_kabul_satiri_id::int AS "malKabulSatirId",
        (round(${NET_BIRIM_FIYAT} * ${TRY_KURU}, 4))::text AS "tryBirimFiyat"
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
    `SELECT s.is_emri_id AS "isEmriId", round(sum(s.miktar * f.birim_fiyat * (1 - COALESCE(f.iskonto_yuzdesi, 0) / 100) * (1 - q.iskonto_yuzdesi / 100)), 2)::text AS tutar, q.para_birimi::text AS "paraBirimi"
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
export function teslimHedefiKilitle(db: Db, siparisSatirId: number): Promise<{ talepDurumu: string; kapali: boolean } | null> {
  return db.tek<{ talepDurumu: string; kapali: boolean }>(
    `SELECT t.durum AS "talepDurumu", p.logo_kapatma_durumu IS NOT NULL AS kapali
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

// ---- İkinci menü sayıları (madde başına tek sorgu; yetki serviste süzülür)
export async function menuSayilari(db: Db): Promise<{ acik: number; onayda: number; katalog: number; tedarikci: number }> {
  return (await db.tek<{ acik: number; onayda: number; katalog: number; tedarikci: number }>(
    // "Açık" prototipteki tanımdır (OPEN: taslak, teklif isteniyor, değerlendirme, onayda): menü sayısı listeyle aynı olsun.
    `SELECT (SELECT count(*)::int FROM satin_alma_talep WHERE durum IN ('taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda')) AS acik,
            (SELECT count(*)::int FROM satin_alma_talep WHERE durum = 'onayda') AS onayda,
            (SELECT count(*)::int FROM satin_alma_katalog) AS katalog,
            (SELECT count(*)::int FROM satin_alma_tedarikci) AS tedarikci`))!;
}

// Pano sayıları. Onay bekleyen: onaydaki talepte son onay kaydı "onay" değil (onaylanıp sipariş bekleyen sayılmaz; ret
// sonrası yeniden gönderilen sayılır). Teslim bekleyen satır: siparişteki talepte net teslimi miktarın altında kalan satır;
// açık sipariş: böyle satırı olan sipariş. Açık sipariş tutarı: bu siparişlerin bütün satırları, iskontolu, nakliye ve masraf
// sipariş başına bir kez; TL'ye sabit kurla, yoksa teklif kuruyla. Kuru bilinmeyen sipariş varsa tutar boş (sıfır uydurulmaz).
export interface PanoSayilariSatiri { onayBekleyen: number; acikTalep: number; teslimBekleyenSatir: number; acikSiparis: number; acikSiparisTutari: string | null }
export async function panoSayilari(db: Db): Promise<PanoSayilariSatiri> {
  return (await db.tek<PanoSayilariSatiri>(
    `WITH bekleyen AS (
       SELECT s.talep_id, s.teklif_id FROM satin_alma_siparis_satiri s JOIN satin_alma_talep t ON t.id = s.talep_id AND t.durum = 'siparis_verildi'
       WHERE coalesce((SELECT sum(m.miktar) FROM satin_alma_teslim m WHERE m.siparis_satiri_id = s.id), 0) < s.miktar)
     SELECT (SELECT count(*)::int FROM satin_alma_talep t WHERE t.durum = 'onayda'
               AND (SELECT o.sonuc FROM satin_alma_onay o WHERE o.talep_id = t.id ORDER BY o.zaman DESC, o.id DESC LIMIT 1) IS DISTINCT FROM 'onay') AS "onayBekleyen",
            (SELECT count(*)::int FROM satin_alma_talep WHERE durum IN ('taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda')) AS "acikTalep",
            (SELECT count(*)::int FROM bekleyen) AS "teslimBekleyenSatir",
            (SELECT count(*)::int FROM (SELECT DISTINCT talep_id, teklif_id FROM bekleyen) x) AS "acikSiparis",
            (SELECT CASE WHEN bool_and(kur IS NOT NULL) IS NOT FALSE THEN coalesce(round(sum(tutar * kur), 2), 0)::text END
               FROM (SELECT (sum(f.birim_fiyat * s.miktar * (1 - COALESCE(f.iskonto_yuzdesi, 0) / 100)) * (1 - q.iskonto_yuzdesi / 100) + q.nakliye + q.diger_masraf) AS tutar,
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
export interface SiparisOdemeKosulu { teklifId: string; toplam: string; avans: string; kalan: string; vadeGun: number; siparisTarihi: string | null; beklenenTeslim: string | null }
export function siparisOdemeKosullari(db: Db, talepId: string): Promise<SiparisOdemeKosulu[]> {
  return db.sorgu<SiparisOdemeKosulu>(
    `WITH t AS (
       SELECT o.teklif_id, round(
           COALESCE((SELECT sum(ss.miktar * ts.birim_fiyat * (1 - COALESCE(ts.iskonto_yuzdesi, 0) / 100)) FROM satin_alma_siparis_satiri ss
                       JOIN satin_alma_teklif_satiri ts ON ts.talep_id = ss.talep_id AND ts.teklif_id = ss.teklif_id AND ts.kalem_id = ss.kalem_id
                      WHERE ss.talep_id = o.talep_id AND ss.teklif_id = o.teklif_id), 0) * (1 - q.iskonto_yuzdesi / 100)
           + CASE WHEN q.nakliye_dahil THEN 0 ELSE q.nakliye END + q.diger_masraf, 2) AS toplam,
         q.avans_yuzdesi, q.vade_gun, o.siparis_tarihi, o.beklenen_teslim
         FROM satin_alma_siparis o JOIN satin_alma_teklif q ON q.talep_id = o.talep_id AND q.id = o.teklif_id
        WHERE o.talep_id = $1)
     SELECT teklif_id AS "teklifId", toplam, round(toplam * avans_yuzdesi / 100, 2) AS avans, toplam - round(toplam * avans_yuzdesi / 100, 2) AS kalan,
            vade_gun AS "vadeGun", ${ISO('siparis_tarihi')} AS "siparisTarihi", ${ISO('beklenen_teslim')} AS "beklenenTeslim"
       FROM t`, [talepId]);
}

// ---- Kg fiyatı (SAT-77): yalnız eklenir. TL karşılığı çağıranın verdiği kurla (para birimi, kur dizileri); kuru olmayan boş.
export interface KgFiyatiOkuma {
  kaliteKodu: string; form: string | null; kgFiyati: string; paraBirimi: string; tryKgFiyati: string | null; talasKgFiyati: string | null;
  tryTalasKgFiyati: string | null; gecerlilik: string; aciklama: string; kisiId: number; zaman: string;
  islemKatsayisi: string | null; araciKatsayisi: string | null; etkinKgFiyati: string | null;
}
const KG_FIYATI_SECIMI = `f.kalite_kodu AS "kaliteKodu", f.form, f.kg_fiyati::text AS "kgFiyati", f.para_birimi::text AS "paraBirimi",
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
       SELECT DISTINCT ON (kalite_kodu, form) * FROM satin_alma_kg_fiyati WHERE gecerlilik <= coalesce($3::date, current_date)
        ORDER BY kalite_kodu, form, gecerlilik DESC, id DESC) f
       ${KG_KURU}
      ORDER BY f.kalite_kodu, f.form NULLS FIRST`,
    [kur.paraBirimleri, kur.kurlar, gun],
  );
}
export function kgFiyatiGecmisi(db: Db, kur: KurDizisi, kaliteKodu: string, form: string | null): Promise<KgFiyatiOkuma[]> {
  return db.sorgu<KgFiyatiOkuma>(
    `SELECT ${KG_FIYATI_SECIMI} FROM satin_alma_kg_fiyati f ${KG_KURU}
      WHERE f.kalite_kodu = $3 AND f.form IS NOT DISTINCT FROM $4::text ORDER BY f.gecerlilik DESC, f.id DESC`,
    [kur.paraBirimleri, kur.kurlar, kaliteKodu, form],
  );
}
export interface KgFiyatiYazimi { kaliteKodu: string; form: string | null; kgFiyati: string; talasKgFiyati: string | null; paraBirimi: string;
  gecerlilik: string; aciklama: string; islemKatsayisi: string | null; araciKatsayisi: string | null;
}
export async function kgFiyatlariEkle(db: Db, kisiId: number, satirlar: readonly KgFiyatiYazimi[]): Promise<void> {
  await db.sorgu(
    `INSERT INTO satin_alma_kg_fiyati (kalite_kodu, form, kg_fiyati, para_birimi, gecerlilik, aciklama, talas_kg_fiyati, islem_katsayisi, araci_katsayisi, kisi_id)
     SELECT a, b, c, d, e, f, g, h, i, $10::int
       FROM unnest($1::text[], $2::text[], $3::numeric[], $4::text[], $5::date[], $6::text[], $7::numeric[], $8::numeric[], $9::numeric[])
            WITH ORDINALITY AS x(a, b, c, d, e, f, g, h, i, sira)
      ORDER BY sira`,
    [satirlar.map((s) => s.kaliteKodu), satirlar.map((s) => s.form), satirlar.map((s) => s.kgFiyati), satirlar.map((s) => s.paraBirimi),
      satirlar.map((s) => s.gecerlilik), satirlar.map((s) => s.aciklama), satirlar.map((s) => s.talasKgFiyati),
      satirlar.map((s) => s.islemKatsayisi), satirlar.map((s) => s.araciKatsayisi), kisiId],
  );
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
export interface KalemBagSatiri { kalemId: string; uygulananMalzemeNo: number | null; isEmriId: number | null }
export async function kalemBaglariYaz(db: Db, talepId: string, baglar: readonly KalemBagSatiri[]): Promise<void> {
  if (baglar.length === 0) return;
  await db.sorgu(
    `UPDATE satin_alma_talep_kalemi k SET uygulanan_malzeme_no = b.uygulanan, is_emri_id = b.is_emri
       FROM unnest($2::uuid[], $3::int[], $4::int[]) AS b(id, uygulanan, is_emri) WHERE k.talep_id = $1 AND k.id = b.id`,
    [talepId, baglar.map((b) => b.kalemId), baglar.map((b) => b.uygulananMalzemeNo), baglar.map((b) => b.isEmriId)],
  );
}
export function kalemBaglariOku(db: Db, talepIdleri: readonly string[]): Promise<(KalemBagSatiri & { talepId: string })[]> {
  return db.sorgu(
    `SELECT talep_id AS "talepId", id AS "kalemId", uygulanan_malzeme_no AS "uygulananMalzemeNo", is_emri_id AS "isEmriId"
       FROM satin_alma_talep_kalemi WHERE talep_id = ANY($1::uuid[]) AND (uygulanan_malzeme_no IS NOT NULL OR is_emri_id IS NOT NULL)`,
    [talepIdleri],
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
export function acikTalepMiktarlari(db: Db, malzemeNolar: readonly number[]): Promise<{ malzemeNo: number; birim: string; miktar: string }[]> {
  if (malzemeNolar.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `SELECT c.malzeme_no AS "malzemeNo", k.birim, sum(k.miktar)::text AS miktar
       FROM satin_alma_talep_kalemi k JOIN satin_alma_talep t ON t.id = k.talep_id JOIN satin_alma_katalog c ON c.id = k.katalog_id
      WHERE c.malzeme_no = ANY($1::int[]) AND k.miktar IS NOT NULL AND t.durum IN ('taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda')
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
