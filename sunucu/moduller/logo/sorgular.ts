import type { Db } from '#cekirdek/db.ts';
import type { FaturaKaydi, ListeKaydi, MalKabulSatiri } from './kurallar.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';

// Belge no sahibi modüldeki kimliktir: kart no, sipariş, talep ya da sipariş satırı kimliği; adım türleri (güncelleme, kapatma, iptal) aynı belgenin ayrı izidir.
export type FisTuru = 'sarf-fisi' | 'uretim-girisi';
export type BelgeTuru = 'malzeme' | 'hizmet' | 'malzeme-guncelleme' | 'siparis' | 'siparis-guncelleme' | 'siparis-kapatma' | 'siparis-iptal' | 'talep' | 'karsilama' | 'satis-teklifi' | 'satis-siparisi' | FisTuru;
export type GidenSonucu = 'gonderildi' | 'zaten-vardi' | 'reddedildi' | 'yetkisiz' | 'ulasilamadi' | 'belirsiz' | 'yazilamadi';

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
  belgeTuru === 'sarf-fisi' || belgeTuru === 'uretim-girisi' ? 'logo_malzeme_fisi_giden' : 'logo_giden';

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

// 335: biten emrin iki fişi kuyruğa bir kez girer (belge no emir kimliği); yeniden biten emir ikinci kez girmez.
export async function malzemeFisiKuyrugaAl(db: Db, emirId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO logo_malzeme_fisi_giden (belge_turu, belge_no) VALUES ('sarf-fisi', $1), ('uretim-girisi', $1) ON CONFLICT (belge_turu, belge_no) DO NOTHING`,
    [emirId],
  );
}

// Logo'ya gitmemiş fişler; zamanı gelenler önce, sonra kuyruğa giriş sırası. Fiş tarihi ve saati emrin kuyruğa girdiği (bittiği) andır, İstanbul saatiyle.
export interface KuyruktakiFis { tur: FisTuru; emirId: number; tarih: string; saat: string }
export function malzemeFisiKuyrugu(db: Db, sinir: number): Promise<KuyruktakiFis[]> {
  return db.sorgu<KuyruktakiFis>(
    `SELECT belge_turu AS tur, belge_no AS "emirId", to_char(olusma AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS tarih,
            to_char(olusma AT TIME ZONE 'Europe/Istanbul', 'HH24:MI:SS') AS saat
       FROM logo_malzeme_fisi_giden
      WHERE logo_kayit_no IS NULL
      ORDER BY sonraki_deneme NULLS FIRST, olusma, belge_no, belge_turu LIMIT $1`,
    [sinir],
  );
}

// Satırı olmayan fiş (emirde sarf ya da giriş yok) kuyruktan düşer; Logo'ya hiç istek gitmemişse.
export async function bosMalzemeFisiniDus(db: Db, tur: FisTuru, emirId: number): Promise<void> {
  await db.sorgu(
    `DELETE FROM logo_malzeme_fisi_giden WHERE belge_turu = $1 AND belge_no = $2 AND logo_kayit_no IS NULL AND niyet_zamani IS NULL AND son_deneme IS NULL`,
    [tur, emirId],
  );
}
