import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { denemeKilitAnahtari } from './kurallar.ts';

export interface OturumCihazi { ip: string | null; tarayici: string | null }

export async function oturumEkle(db: Db, ozet: string, kisiId: number, cihaz: OturumCihazi): Promise<void> {
  // clock_timestamp: açılış, giriş kişi satırını paylaşımlı kilitledikten sonraki andır (transaction başlangıcı değil);
  // kisiler'in "bundan önceki oturumlar geçersiz" zamanıyla bu yüzden doğru sıralanır.
  await db.sorgu(
    'INSERT INTO oturum (anahtar_ozeti, kisi_id, acildi, ip, tarayici) VALUES ($1, $2, clock_timestamp(), $3, $4)',
    [ozet, kisiId, cihaz.ip, cihaz.tarayici],
  );
}

export interface GecerliOturum {
  id: number;
  kisi_id: number;
  // Açılış zamanı veritabanının verdiği metin olarak taşınır: yuvarlanmadan geri karşılaştırılır.
  acildi_metin: string;
  bayat: boolean;
}

export function gecerliOturumBul(
  db: Db,
  ozet: string,
  sure: { bostaSn: number; azamiSn: number; gorulmeAraligiSn: number },
): Promise<GecerliOturum | null> {
  return db.tek<GecerliOturum>(
    `SELECT id, kisi_id, acildi::text AS acildi_metin, son_gorulme < now() - make_interval(secs => $4) AS bayat
       FROM oturum
      WHERE anahtar_ozeti = $1 AND kapandi IS NULL
        AND son_gorulme > now() - make_interval(secs => $2)
        AND acildi > now() - make_interval(secs => $3)`,
    [ozet, sure.bostaSn, sure.azamiSn, sure.gorulmeAraligiSn],
  );
}

export async function gorulduYaz(db: Db, oturumId: number): Promise<void> {
  await db.sorgu('UPDATE oturum SET son_gorulme = now() WHERE id = $1', [oturumId]);
}

export async function oturumKapat(db: Db, ozet: string): Promise<void> {
  await db.sorgu('UPDATE oturum SET kapandi = now() WHERE anahtar_ozeti = $1 AND kapandi IS NULL', [ozet]);
}

export async function kisiOturumlariniKapat(db: Db, kisiId: number, haricOzet: string | null): Promise<number> {
  const satirlar = await db.sorgu(
    `UPDATE oturum SET kapandi = now()
      WHERE kisi_id = $1 AND kapandi IS NULL AND ($2::text IS NULL OR anahtar_ozeti <> $2)
      RETURNING id`,
    [kisiId, haricOzet],
  );
  return satirlar.length;
}

export type DenemeSonucu = 'basarili' | 'hatali';

// simdi: null ise veritabanı saati. Değer yalnız testten gelir; bekleme saat beklenmeden sınanır.
export type Simdi = Date | null;

export async function denemeEkle(db: Db, kullaniciAdi: string, sonuc: DenemeSonucu, ip: string, simdi: Simdi): Promise<void> {
  await db.sorgu(
    'INSERT INTO giris_denemesi (kullanici_adi, sonuc, ip, zaman) VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))',
    [kullaniciAdi, sonuc, ip, simdi],
  );
}

// Aynı cihazdan aynı anda yalnız bir deneme yürür: aynı anda gönderilen denemeler beklemeyi ve cihaz
// sınırını görmeden hep birlikte parolaya bakamaz. Kilit beklenmez: bekleyen her istek bir bağlantı
// tutar, tek cihaz havuzu doldururdu. Kilit transaction bitince kendiliğinden bırakılır.
// Advisory kilit veritabanı genelindedir; anahtara şema katılır ki aynı veritabanındaki başka şemanın
// (paralel test koşusu) aynı cihazı bu şemanın girişini reddettirmesin.
export async function denemeKilidiAl(db: Db, ip: string): Promise<boolean> {
  const satir = await db.tek<{ alindi: boolean }>(
    `SELECT pg_try_advisory_xact_lock(
              ('x' || left(encode(sha256(convert_to(coalesce(current_schema(), '') || ':' || $1::text, 'UTF8')), 'hex'), 16))::bit(64)::bigint
            ) AS alindi`,
    [denemeKilitAnahtari(ip)],
  );
  return satir?.alindi === true;
}

export interface HataliSeri {
  sayi: number;
  gecen_sn: number | null;
}

// Son başarılı girişten sonraki hatalı denemeler.
export async function hataliSeriBul(db: Db, kullaniciAdi: string, ip: string, simdi: Simdi): Promise<HataliSeri> {
  const satir = await db.tek<HataliSeri>(
    `SELECT count(*) AS sayi, floor(extract(epoch FROM COALESCE($3::timestamptz, now()) - max(d.zaman)))::int AS gecen_sn
       FROM giris_denemesi d
      WHERE d.kullanici_adi = $1 AND d.ip IS NOT DISTINCT FROM $2 AND d.sonuc = 'hatali'
        AND d.id > COALESCE(
              (SELECT max(b.id) FROM giris_denemesi b
                WHERE b.kullanici_adi = $1 AND b.ip IS NOT DISTINCT FROM $2 AND b.sonuc = 'basarili'),
              0)`,
    [kullaniciAdi, ip, simdi],
  );
  return satir ?? { sayi: 0, gecen_sn: null };
}

// Cihazın pencere içindeki son `sinir` hatalı denemesi: sayı ve en eskisinin pencereden düşmesine kalan saniye.
export async function cihazHataliBul(
  db: Db, ip: string, pencereDk: number, sinir: number, simdi: Simdi,
): Promise<{ sayi: number; kalanSn: number | null }> {
  const satir = await db.tek<{ sayi: number; kalan_sn: number | null }>(
    `SELECT count(*)::int AS sayi,
            ceil(extract(epoch FROM min(s.zaman) + make_interval(mins => $2) - COALESCE($4::timestamptz, now())))::int AS kalan_sn
       FROM (SELECT zaman FROM giris_denemesi
              WHERE ip = $1 AND sonuc = 'hatali' AND zaman > COALESCE($4::timestamptz, now()) - make_interval(mins => $2)
              ORDER BY zaman DESC LIMIT $3) s`,
    [ip, pencereDk, sinir, simdi],
  );
  return { sayi: satir?.sayi ?? 0, kalanSn: satir?.kalan_sn ?? null };
}

// Kapanış anı: kapatıldıysa kapandi; kapatılmadıysa hareketsizlik ya da azami sürenin önce dolduğu an (gecerliOturumBul ile aynı süreler).
export async function eskiOturumCihaziniBosalt(db: Db, gun: number, sure: OturumSuresi, simdi: Simdi): Promise<void> {
  await db.sorgu(
    `UPDATE oturum SET ip = NULL, tarayici = NULL
      WHERE (ip IS NOT NULL OR tarayici IS NOT NULL)
        AND COALESCE(kapandi, LEAST(son_gorulme + make_interval(secs => $2), acildi + make_interval(secs => $3)))
            < COALESCE($4::timestamptz, now()) - make_interval(days => $1)`,
    [gun, sure.bostaSn, sure.azamiSn, simdi],
  );
}

export async function eskiDenemeleriSil(db: Db, gun: number, simdi: Simdi): Promise<void> {
  await db.sorgu(
    'DELETE FROM giris_denemesi WHERE zaman < COALESCE($2::timestamptz, now()) - make_interval(days => $1)',
    [gun, simdi],
  );
}

// Ada bütün cihazlardan gelen hatalı seri: son başarılı denemeden ve son kilidin başından sonrası. Kilidi başlatan deneme
// kilitle aynı anı taşır, sayılmaz; açılan ya da süresi dolan kilit seriyi böylece sıfırlar.
export async function hesapSerisiSay(db: Db, kullaniciAdi: string): Promise<number> {
  const satir = await db.tek<{ sayi: number }>(
    `SELECT count(*)::int AS sayi
       FROM giris_denemesi d
      WHERE d.kullanici_adi = $1 AND d.sonuc = 'hatali'
        AND d.id > COALESCE((SELECT max(b.id) FROM giris_denemesi b WHERE b.kullanici_adi = $1 AND b.sonuc = 'basarili'), 0)
        AND d.zaman > COALESCE((SELECT max(k.kilitlendi) FROM oturum_hesap_kilidi k WHERE k.kullanici_adi = $1), '-infinity')`,
    [kullaniciAdi],
  );
  return satir?.sayi ?? 0;
}

// Etkin kilit yoksa yazılır; eşzamanlı iki hatalı deneme aynı adı iki kez kilitleyebilir, açma ikisini birden açar.
export async function hesapKilidiEkle(db: Db, kullaniciAdi: string, dakika: number, simdi: Simdi): Promise<boolean> {
  const satirlar = await db.sorgu(
    `INSERT INTO oturum_hesap_kilidi (kullanici_adi, kilitlendi, bitis)
     SELECT $1, z.an, z.an + make_interval(mins => $2)
       FROM (SELECT COALESCE($3::timestamptz, now()) AS an) z
      WHERE NOT EXISTS (
              SELECT 1 FROM oturum_hesap_kilidi k
               WHERE k.kullanici_adi = $1 AND k.acildi IS NULL AND k.bitis > z.an)
     RETURNING id`,
    [kullaniciAdi, dakika, simdi],
  );
  return satirlar.length > 0;
}

// Etkin kilidin kalan tam saniyesi (yukarı yuvarlanır); kilit yoksa null.
export async function hesapKilidiKalanSn(db: Db, kullaniciAdi: string, simdi: Simdi): Promise<number | null> {
  const satir = await db.tek<{ kalan_sn: number | null }>(
    `SELECT ceil(extract(epoch FROM max(bitis) - COALESCE($2::timestamptz, now())))::int AS kalan_sn
       FROM oturum_hesap_kilidi
      WHERE kullanici_adi = $1 AND acildi IS NULL AND bitis > COALESCE($2::timestamptz, now())`,
    [kullaniciAdi, simdi],
  );
  return satir?.kalan_sn ?? null;
}

export interface HesapKilidiSatiri {
  id: number;
  kullaniciAdi: string;
  kilitlendi: string;
  bitis: string;
}

const ETKIN_KILITLER = 'FROM oturum_hesap_kilidi WHERE acildi IS NULL AND bitis > COALESCE($1::timestamptz, now())';

export async function etkinKilitSay(db: Db, simdi: Simdi): Promise<number> {
  const satir = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${ETKIN_KILITLER}`, [simdi]);
  return satir?.toplam ?? 0;
}

export function etkinKilitler(db: Db, simdi: Simdi, dilim: Dilim): Promise<HesapKilidiSatiri[]> {
  return db.sorgu<HesapKilidiSatiri>(
    `SELECT id, kullanici_adi AS "kullaniciAdi", ${zamanMetni('kilitlendi')} AS kilitlendi, ${zamanMetni('bitis')} AS bitis
       ${ETKIN_KILITLER} ORDER BY kilitlendi DESC, id DESC LIMIT $2 OFFSET $3`,
    [simdi, dilim.sinir, dilim.atla],
  );
}

// Kimliği verilen etkin kilidin adındaki bütün etkin kilitler açılır; açılan sayısı döner (0: etkin kilit yok).
export async function hesapKilidiAc(db: Db, id: number, acanKisiId: number, simdi: Simdi): Promise<number> {
  const satirlar = await db.sorgu(
    `UPDATE oturum_hesap_kilidi k SET acildi = COALESCE($3::timestamptz, now()), acan_kisi_id = $2
      WHERE k.acildi IS NULL AND k.bitis > COALESCE($3::timestamptz, now())
        AND k.kullanici_adi = (
              SELECT h.kullanici_adi FROM oturum_hesap_kilidi h
               WHERE h.id = $1 AND h.acildi IS NULL AND h.bitis > COALESCE($3::timestamptz, now()))
     RETURNING k.id`,
    [id, acanKisiId, simdi],
  );
  return satirlar.length;
}

export interface KilitOzetiSatiri {
  kullaniciAdi: string;
  kilitSayisi: number;
  sonKilit: string;
}

// Son sonSn saniyede kurulan kilitler, ada göre; açılmış ya da süresi dolmuş kilit de sayılır (olay olarak).
export function sonKilitOzeti(db: Db, sonSn: number): Promise<KilitOzetiSatiri[]> {
  return db.sorgu<KilitOzetiSatiri>(
    `SELECT kullanici_adi AS "kullaniciAdi", count(*)::int AS "kilitSayisi", ${zamanMetni('max(kilitlendi)')} AS "sonKilit"
       FROM oturum_hesap_kilidi WHERE kilitlendi > now() - make_interval(secs => $1)
      GROUP BY kullanici_adi ORDER BY kullanici_adi`,
    [sonSn],
  );
}

// Güvenlik izlemesinin okumaları ve tek oturumu kapatma: tablolar bu modülündür, başka modül yalnız disari.ts'ten ulaşır.

export interface DenemeOzetiSatiri {
  kullaniciAdi: string;
  ip: string | null;
  hataliSayi: number;
  basariliSayi: number;
  sonDeneme: string;
  // Hatalı deneme yoksa null.
  sonHatali: string | null;
}

// Son sonSn saniyedeki denemeler, kullanıcı adı ve cihaz çiftine göre. Tabloda yalnız parolaya bakılan denemeler vardır.
export function denemeOzetiBul(db: Db, sonSn: number): Promise<DenemeOzetiSatiri[]> {
  return db.sorgu<DenemeOzetiSatiri>(
    `SELECT kullanici_adi AS "kullaniciAdi", ip,
            (count(*) FILTER (WHERE sonuc = 'hatali'))::int AS "hataliSayi",
            (count(*) FILTER (WHERE sonuc = 'basarili'))::int AS "basariliSayi",
            ${zamanMetni('max(zaman)')} AS "sonDeneme",
            ${zamanMetni("max(zaman) FILTER (WHERE sonuc = 'hatali')")} AS "sonHatali"
       FROM giris_denemesi
      WHERE zaman > now() - make_interval(secs => $1)
      GROUP BY kullanici_adi, ip
      ORDER BY kullanici_adi, ip NULLS FIRST`,
    [sonSn],
  );
}

export interface SaatlikDenemeSatiri {
  saat: string;
  basarili: number;
  hatali: number;
}

// Son saatSayisi saat dilimi, eskiden yeniye. Denemesiz saat sıfırdır: tablo saklama süresindeki bütün denemeleri tutar,
// sıfır eksik veri değildir.
export function saatlikDenemeBul(db: Db, saatSayisi: number): Promise<SaatlikDenemeSatiri[]> {
  return db.sorgu<SaatlikDenemeSatiri>(
    `WITH saatler AS (
       SELECT generate_series(date_trunc('hour', now()) - make_interval(hours => $1 - 1), date_trunc('hour', now()), interval '1 hour') AS saat
     )
     SELECT ${zamanMetni('s.saat')} AS saat,
            (count(d.id) FILTER (WHERE d.sonuc = 'basarili'))::int AS basarili,
            (count(d.id) FILTER (WHERE d.sonuc = 'hatali'))::int AS hatali
       FROM saatler s
       LEFT JOIN giris_denemesi d ON d.zaman >= s.saat AND d.zaman < s.saat + interval '1 hour'
      GROUP BY s.saat
      ORDER BY s.saat`,
    [saatSayisi],
  );
}

export interface DenemeSuzgeci {
  sonuc: DenemeSonucu | null;
  ara: string | null;
}

export interface DenemeSatiri {
  id: number;
  kullaniciAdi: string;
  ip: string | null;
  sonuc: DenemeSonucu;
  zaman: string;
}

// Arama metni joker karakter taşımasın diye LIKE yerine konum aranır.
const DENEME_SUZGECI = `FROM giris_denemesi
  WHERE sonuc IN ('basarili', 'hatali') AND ($1::text IS NULL OR sonuc = $1)
    AND ($2::text IS NULL OR strpos(lower(kullanici_adi), lower($2)) > 0 OR strpos(lower(coalesce(ip, '')), lower($2)) > 0)`;

export async function denemeSay(db: Db, s: DenemeSuzgeci): Promise<number> {
  const r = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${DENEME_SUZGECI}`, [s.sonuc, s.ara]);
  return r?.toplam ?? 0;
}

export function denemeSatirlari(db: Db, s: DenemeSuzgeci, dilim: { sinir: number; atla: number }): Promise<DenemeSatiri[]> {
  return db.sorgu<DenemeSatiri>(
    `SELECT id::int AS id, kullanici_adi AS "kullaniciAdi", ip, sonuc, ${zamanMetni('zaman')} AS zaman ${DENEME_SUZGECI}
      ORDER BY giris_denemesi.zaman DESC, id DESC LIMIT $3 OFFSET $4`,
    [s.sonuc, s.ara, dilim.sinir, dilim.atla],
  );
}

export interface AcikOturumSatiri {
  id: number;
  kisiId: number;
  acildi: string;
  sonGorulme: string;
  ip: string | null;
  tarayici: string | null;
  buOturum: boolean;
}

export interface OturumSuresi { bostaSn: number; azamiSn: number }

// Geçerlilik gecerliOturumBul ile aynı sürelerledir; kişinin sonradan pasife alınması burada sayılmaz (kisiler'in kararıdır).
const ACIK_OTURUM = `FROM oturum
  WHERE kapandi IS NULL AND son_gorulme > now() - make_interval(secs => $1) AND acildi > now() - make_interval(secs => $2)`;

export function acikOturumSatirlari(db: Db, sure: OturumSuresi, buOzet: string | null): Promise<AcikOturumSatiri[]> {
  return db.sorgu<AcikOturumSatiri>(
    `SELECT id::int AS id, kisi_id AS "kisiId", ${zamanMetni('acildi')} AS acildi, ${zamanMetni('son_gorulme')} AS "sonGorulme", ip, tarayici,
            ($3::text IS NOT NULL AND anahtar_ozeti = $3) AS "buOturum"
       ${ACIK_OTURUM}
      ORDER BY oturum.son_gorulme DESC, id DESC`,
    [sure.bostaSn, sure.azamiSn, buOzet],
  );
}

export function acikOturumSayilari(db: Db, sure: OturumSuresi): Promise<{ kisiId: number; acikOturum: number }[]> {
  return db.sorgu<{ kisiId: number; acikOturum: number }>(
    `SELECT kisi_id AS "kisiId", count(*)::int AS "acikOturum" ${ACIK_OTURUM} GROUP BY kisi_id ORDER BY kisi_id`,
    [sure.bostaSn, sure.azamiSn],
  );
}

// haricOzet isteği yapanın oturumudur: kendi oturumunu buradan kapatan, uygulamadan habersiz düşmesin (çıkış ayrı yoldur).
export async function oturumKimlikleKapat(db: Db, oturumId: number, haricOzet: string | null): Promise<'kapandi' | 'yok' | 'kendi'> {
  const satir = await db.tek<{ ozet: string }>(
    'SELECT anahtar_ozeti AS ozet FROM oturum WHERE id = $1 AND kapandi IS NULL FOR UPDATE',
    [oturumId],
  );
  if (satir === null) return 'yok';
  if (haricOzet !== null && satir.ozet === haricOzet) return 'kendi';
  await db.sorgu('UPDATE oturum SET kapandi = now() WHERE id = $1', [oturumId]);
  return 'kapandi';
}

/* ---------------- akıllı saat (kart #1632) ---------------- */

// Süresi dolmuş ya da belirteci alınmış istekler silinir (zamanlanmış iş yok); sonra bekleyen istek sayıları okunur.
// Sayma ile ekleme arasında eşzamanlı istek sınırı aşmasın diye açışlar transaction kilidiyle sıraya girer (az ve kısa iştir).
export async function saatIstekleriniTemizleSay(db: Db, ip: string): Promise<{ genel: number; cihaz: number }> {
  await db.sorgu("SELECT pg_advisory_xact_lock(('x' || left(encode(sha256(convert_to(coalesce(current_schema(), '') || ':oturum_saat_istegi', 'UTF8')), 'hex'), 16))::bit(64)::bigint)");
  await db.sorgu('DELETE FROM oturum_saat_istegi WHERE son <= now() OR alindi IS NOT NULL');
  const satir = await db.tek<{ genel: number; cihaz: number }>(
    'SELECT count(*)::int AS genel, (count(*) FILTER (WHERE ip = $1))::int AS cihaz FROM oturum_saat_istegi',
    [ip],
  );
  return satir ?? { genel: 0, cihaz: 0 };
}

// Kod ya da gizli anahtar başka bekleyen istekle çakışırsa tekil kısıta takılır ve null döner; çağıran yeniden üretir.
export function saatIstegiEkle(
  db: Db, g: { gizliOzeti: string; kodOzeti: string; ip: string; sureSn: number },
): Promise<{ son: string } | null> {
  return db.tek<{ son: string }>(
    `INSERT INTO oturum_saat_istegi (gizli_ozeti, kod_ozeti, ip, olusturma, son)
     VALUES ($1, $2, $3, now(), now() + make_interval(secs => $4))
     ON CONFLICT DO NOTHING
     RETURNING ${zamanMetni('son')} AS son`,
    [g.gizliOzeti, g.kodOzeti, g.ip, g.sureSn],
  );
}

// Onay tek koşullu yazmadır: aynı isteği ikinci onay bulamaz.
export async function saatIstegiOnayla(db: Db, kodOzeti: string, kisiId: number): Promise<boolean> {
  const satirlar = await db.sorgu(
    `UPDATE oturum_saat_istegi SET kisi_id = $2, onaylandi = now()
      WHERE kod_ozeti = $1 AND kisi_id IS NULL AND son > now()
      RETURNING id`,
    [kodOzeti, kisiId],
  );
  return satirlar.length > 0;
}

export type SaatIstegiDurumu = { durum: 'yok' } | { durum: 'erken' } | { durum: 'bekliyor' } | { durum: 'onaylandi'; kisiId: number };

// Onaylanmış istek yalnız bir kez alınır: aynı gizli anahtarla ikinci istek 'yok' görür.
export async function saatIstegiAl(db: Db, gizliOzeti: string, soruAraligiSn: number): Promise<SaatIstegiDurumu> {
  const alinan = await db.tek<{ kisi_id: number }>(
    `UPDATE oturum_saat_istegi SET alindi = now()
      WHERE gizli_ozeti = $1 AND kisi_id IS NOT NULL AND alindi IS NULL AND son > now()
      RETURNING kisi_id`,
    [gizliOzeti],
  );
  if (alinan !== null) return { durum: 'onaylandi', kisiId: alinan.kisi_id };
  const bekleyen = await db.tek<{ erken: boolean }>(
    `SELECT son_soru IS NOT NULL AND son_soru > now() - make_interval(secs => $2) AS erken
       FROM oturum_saat_istegi WHERE gizli_ozeti = $1 AND kisi_id IS NULL AND son > now()
      FOR UPDATE`,
    [gizliOzeti, soruAraligiSn],
  );
  if (bekleyen === null) return { durum: 'yok' };
  if (bekleyen.erken) return { durum: 'erken' };
  await db.sorgu('UPDATE oturum_saat_istegi SET son_soru = now() WHERE gizli_ozeti = $1', [gizliOzeti]);
  return { durum: 'bekliyor' };
}

export async function saatBelirteciEkle(db: Db, ozet: string, kisiId: number, sureSn: number): Promise<{ id: number; son: string }> {
  // clock_timestamp: oturumEkle ile aynı neden (kişinin "bundan önceki oturumlar geçersiz" zamanıyla doğru sıralanır).
  const satir = await db.tek<{ id: number; son: string }>(
    // Saat bir kez okunur: iki ayrı clock_timestamp() 12 saat kısıtını mikro saniyeyle aşar.
    `INSERT INTO oturum_saat_belirteci (belirtec_ozeti, kisi_id, acildi, son)
     SELECT $1, $2, an, an + make_interval(secs => $3) FROM (SELECT clock_timestamp() AS an) s
     RETURNING id::int AS id, ${zamanMetni('son')} AS son`,
    [ozet, kisiId, sureSn],
  );
  if (satir === null) throw new Error('Saat belirteci yazılamadı.');
  return satir;
}

export function gecerliSaatBelirteciBul(db: Db, ozet: string): Promise<{ kisi_id: number; acildi_metin: string } | null> {
  return db.tek(
    `SELECT kisi_id, acildi::text AS acildi_metin FROM oturum_saat_belirteci
      WHERE belirtec_ozeti = $1 AND kapandi IS NULL AND son > now()`,
    [ozet],
  );
}

export interface SaatBelirteciSatiri {
  id: number;
  kisiId: number;
  acildi: string;
  son: string;
}

// Geçerli (kapanmamış, süresi dolmamış) belirteçler; kisiId verilirse yalnız o kişinin. Özet dönmez.
// acildiMetin kişinin geçerliliğini sınamak içindir (oturumla aynı karşılaştırma); cevaba girmez.
export function saatBelirtecleri(db: Db, kisiId: number | null): Promise<(SaatBelirteciSatiri & { acildiMetin: string })[]> {
  return db.sorgu<SaatBelirteciSatiri & { acildiMetin: string }>(
    `SELECT id::int AS id, kisi_id AS "kisiId", ${zamanMetni('acildi')} AS acildi, ${zamanMetni('son')} AS son, acildi::text AS "acildiMetin"
       FROM oturum_saat_belirteci
      WHERE kapandi IS NULL AND son > now() AND ($1::int IS NULL OR kisi_id = $1)
      ORDER BY oturum_saat_belirteci.acildi DESC, id DESC`,
    [kisiId],
  );
}

// kisiId verilirse yalnız o kişinin belirteci kapanır (kişinin kendi saati); null ise yönetici kapatır.
export async function saatBelirteciKapat(db: Db, id: number, kapatanKisiId: number, kisiId: number | null): Promise<boolean> {
  const satirlar = await db.sorgu(
    `UPDATE oturum_saat_belirteci SET kapandi = now(), kapatan_kisi_id = $2
      WHERE id = $1 AND kapandi IS NULL AND son > now() AND ($3::int IS NULL OR kisi_id = $3)
      RETURNING id`,
    [id, kapatanKisiId, kisiId],
  );
  return satirlar.length > 0;
}

// Kişi kendi parolasını ya da PIN'ini değiştirince öbür oturumlarıyla birlikte saatleri de kapanır.
export async function kisiSaatBelirtecleriniKapat(db: Db, kisiId: number): Promise<void> {
  await db.sorgu(
    'UPDATE oturum_saat_belirteci SET kapandi = now(), kapatan_kisi_id = $1 WHERE kisi_id = $1 AND kapandi IS NULL',
    [kisiId],
  );
}

/* ---------------- ortak cihaz (kart #739) ---------------- */

export interface OrtakCihazSatiri {
  id: number;
  ad: string;
  kaydedenKisiId: number;
  kaydedildi: string;
  ozet: string;
}

const ORTAK_CIHAZ_ALANLARI = `id::int AS id, ad, kaydeden_kisi_id AS "kaydedenKisiId", ${zamanMetni('kaydedildi')} AS kaydedildi,
  belirtec_ozeti AS ozet`;

export function ortakCihazEkle(db: Db, ozet: string, ad: string, kisiId: number): Promise<OrtakCihazSatiri | null> {
  return db.tek<OrtakCihazSatiri>(
    `INSERT INTO oturum_ortak_cihaz (belirtec_ozeti, ad, kaydeden_kisi_id, kaydedildi)
     VALUES ($1, $2, $3, now())
     RETURNING ${ORTAK_CIHAZ_ALANLARI}`,
    [ozet, ad, kisiId],
  );
}

export async function acikOrtakCihazAdiVar(db: Db, ad: string): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM oturum_ortak_cihaz WHERE lower(ad) = lower($1) AND kapandi IS NULL', [ad])) !== null;
}

export function acikOrtakCihazBul(db: Db, ozet: string): Promise<OrtakCihazSatiri | null> {
  return db.tek<OrtakCihazSatiri>(`SELECT ${ORTAK_CIHAZ_ALANLARI} FROM oturum_ortak_cihaz WHERE belirtec_ozeti = $1 AND kapandi IS NULL`, [ozet]);
}

export function acikOrtakCihazlar(db: Db): Promise<OrtakCihazSatiri[]> {
  return db.sorgu<OrtakCihazSatiri>(
    `SELECT ${ORTAK_CIHAZ_ALANLARI} FROM oturum_ortak_cihaz WHERE kapandi IS NULL ORDER BY lower(ad), id`,
  );
}

export async function ortakCihazKapat(db: Db, id: number, kapatanKisiId: number): Promise<string | null> {
  const satir = await db.tek<{ ozet: string }>(
    `UPDATE oturum_ortak_cihaz SET kapandi = now(), kapatan_kisi_id = $2
      WHERE id = $1 AND kapandi IS NULL
      RETURNING belirtec_ozeti AS ozet`,
    [id, kapatanKisiId],
  );
  return satir?.ozet ?? null;
}
