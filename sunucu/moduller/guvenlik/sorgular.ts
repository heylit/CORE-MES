import type { Db } from '#cekirdek/db.ts';
import { islemKilidiDene } from '#cekirdek/kilit.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { AlarmDurumu, AlarmGorunumu, Onem, RetNedeni, Sinyal } from '#paylasilan/sozlesme/guvenlik.ts';
import type { Bulgu, CihazTaramaOzeti, KisiRetOzeti } from './kurallar.ts';

export interface AlarmSatiri {
  id: number;
  sinyal: Sinyal;
  onem: Onem;
  kullaniciAdi: string | null;
  ip: string | null;
  kisiId: number | null;
  gozlenenSayi: number;
  tekrarSayisi: number;
  ilkGoruldu: string;
  sonGoruldu: string;
  durum: AlarmDurumu;
  onaylayanKisiId: number | null;
  onaylandi: string | null;
  kapatanKisiId: number | null;
  kapandi: string | null;
  kapanisNotu: string | null;
  surum: number;
}

const SECIM = `a.id::int AS id, a.sinyal, a.onem, a.kullanici_adi AS "kullaniciAdi", a.ip, a.kisi_id AS "kisiId",
  a.gozlenen_sayi AS "gozlenenSayi", a.tekrar_sayisi AS "tekrarSayisi",
  ${zamanMetni('a.ilk_goruldu')} AS "ilkGoruldu", ${zamanMetni('a.son_goruldu')} AS "sonGoruldu", a.durum,
  a.onaylayan_kisi_id AS "onaylayanKisiId", ${zamanMetni('a.onaylandi')} AS onaylandi,
  a.kapatan_kisi_id AS "kapatanKisiId", ${zamanMetni('a.kapandi')} AS kapandi, a.kapanis_notu AS "kapanisNotu", a.surum`;

// G-18: önce önem, sonra son görülme (yeni önce); eşitte kimlik.
const SIRA = `CASE a.onem WHEN 'kritik' THEN 0 WHEN 'yuksek' THEN 1 ELSE 2 END, a.son_goruldu DESC, a.id DESC`;

// Taramanın kendi kilidi: zamanlayıcının iş kilidinden ayrıdır ki tarama başka yoldan çağrılsa da tek kopya koşsun (G-15).
export async function taramaKilidiAl(db: Db): Promise<boolean> {
  return islemKilidiDene(db, 'guvenlik-taramasi');
}

export async function veritabaniSaati(db: Db): Promise<string> {
  const r = await db.tek<{ simdi: string }>(`SELECT ${zamanMetni('now()')} AS simdi`);
  if (r === null) throw new Error('Veritabanı saati okunamadı.');
  return r.simdi;
}

export type AcikAlarm = Pick<AlarmSatiri, 'id' | 'sinyal' | 'kullaniciAdi' | 'ip' | 'kisiId' | 'gozlenenSayi' | 'sonGoruldu'>;

export function kapanmamisAlarmlar(db: Db): Promise<AcikAlarm[]> {
  return db.sorgu<AcikAlarm>(
    `SELECT a.id::int AS id, a.sinyal, a.kullanici_adi AS "kullaniciAdi", a.ip, a.kisi_id AS "kisiId", a.gozlenen_sayi AS "gozlenenSayi",
            ${zamanMetni('a.son_goruldu')} AS "sonGoruldu"
       FROM guvenlik_alarmi a WHERE a.durum <> 'kapandi'`,
  );
}

// Kapanmış hesap-kilidi alarmlarının ada göre en yeni son görülmesi; yalnız pencere içindeki kilitlerle karşılaştırılır.
export async function kapanmisKilitAlarmlari(db: Db, pencereSn: number): Promise<Map<string, string>> {
  const satirlar = await db.sorgu<{ kullaniciAdi: string; sonGoruldu: string }>(
    `SELECT kullanici_adi AS "kullaniciAdi", ${zamanMetni('max(son_goruldu)')} AS "sonGoruldu"
       FROM guvenlik_alarmi
      WHERE sinyal = 'hesap-kilidi' AND durum = 'kapandi' AND son_goruldu > now() - make_interval(secs => $1)
      GROUP BY kullanici_adi`,
    [pencereSn],
  );
  return new Map(satirlar.map((r) => [r.kullaniciAdi, r.sonGoruldu]));
}

// Aynı kaynakta kapanmamış alarm varsa (G-06) açılmaz, null döner.
export async function alarmAc(db: Db, b: Bulgu): Promise<number | null> {
  const r = await db.tek<{ id: number }>(
    `INSERT INTO guvenlik_alarmi (sinyal, onem, kullanici_adi, ip, kisi_id, gozlenen_sayi, ilk_goruldu, son_goruldu)
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $7::timestamptz)
     ON CONFLICT (sinyal, coalesce(kullanici_adi, ''), coalesce(ip, ''), coalesce(kisi_id, 0)) WHERE durum <> 'kapandi' DO NOTHING
     RETURNING id::int AS id`,
    [b.sinyal, b.onem, b.kullaniciAdi, b.ip, b.kisiId, b.sayi, b.sonOlay],
  );
  return r?.id ?? null;
}

// Tarama sayaçları günceller, sürümü artırmaz: sürüm insan kararlarını (onay, kapanış) korur; koşul sürdükçe her dakika
// artsaydı ekrandaki onay her seferinde eski sürüme düşerdi.
export async function alarmSayaclariniYaz(db: Db, id: number, g: { gozlenenSayi: number; sonGoruldu: string }): Promise<boolean> {
  const satirlar = await db.sorgu(
    `UPDATE guvenlik_alarmi SET gozlenen_sayi = $2, son_goruldu = $3::timestamptz, tekrar_sayisi = tekrar_sayisi + 1
      WHERE id = $1 AND durum <> 'kapandi' RETURNING id`,
    [id, g.gozlenenSayi, g.sonGoruldu],
  );
  return satirlar.length > 0;
}

export async function taramaDefterineYaz(db: Db, yeniAlarm: number, guncellenenAlarm: number): Promise<void> {
  await db.sorgu('INSERT INTO guvenlik_taramasi (yeni_alarm, guncellenen_alarm) VALUES ($1, $2)', [yeniAlarm, guncellenenAlarm]);
}

export async function taramaDurumunuYaz(db: Db): Promise<void> {
  await db.sorgu(
    'INSERT INTO guvenlik_tarama_durumu (tek, son_tarama) VALUES (true, now()) ON CONFLICT (tek) DO UPDATE SET son_tarama = EXCLUDED.son_tarama',
  );
}

export async function sonTaramaZamani(db: Db): Promise<string | null> {
  const r = await db.tek<{ son: string }>(`SELECT ${zamanMetni('son_tarama')} AS son FROM guvenlik_tarama_durumu`);
  return r?.son ?? null;
}

// Saklama süresi dolmuş kapanmış alarmlar ve defter satırları; sınırı tetikleyici de denetler.
export async function eskileriSil(db: Db, gun: number): Promise<number> {
  const alarmlar = await db.sorgu(
    "DELETE FROM guvenlik_alarmi WHERE durum = 'kapandi' AND kapandi < now() - make_interval(days => $1) RETURNING id",
    [gun],
  );
  const taramalar = await db.sorgu('DELETE FROM guvenlik_taramasi WHERE calisti < now() - make_interval(days => $1) RETURNING id', [gun]);
  return alarmlar.length + taramalar.length;
}

const GORUNUM_SUZGECI: Readonly<Record<AlarmGorunumu, string>> = {
  etkin: "a.durum <> 'kapandi'",
  acik: "a.durum = 'acik'",
  onaylandi: "a.durum = 'onaylandi'",
  kapandi: "a.durum = 'kapandi'",
  hepsi: 'true',
};

export async function alarmSay(db: Db, gorunum: AlarmGorunumu): Promise<number> {
  const r = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM guvenlik_alarmi a WHERE ${GORUNUM_SUZGECI[gorunum]}`);
  return r?.toplam ?? 0;
}

export function alarmSatirlari(db: Db, gorunum: AlarmGorunumu, dilim: Dilim): Promise<AlarmSatiri[]> {
  return db.sorgu<AlarmSatiri>(
    `SELECT ${SECIM} FROM guvenlik_alarmi a WHERE ${GORUNUM_SUZGECI[gorunum]} ORDER BY ${SIRA} LIMIT $1 OFFSET $2`,
    [dilim.sinir, dilim.atla],
  );
}

export function sonAlarmlar(db: Db, sinir: number): Promise<AlarmSatiri[]> {
  return db.sorgu<AlarmSatiri>(`SELECT ${SECIM} FROM guvenlik_alarmi a ORDER BY a.son_goruldu DESC, a.id DESC LIMIT $1`, [sinir]);
}

export function alarmBul(db: Db, id: number): Promise<AlarmSatiri | null> {
  return db.tek<AlarmSatiri>(`SELECT ${SECIM} FROM guvenlik_alarmi a WHERE a.id = $1`, [id]);
}

// Durum kuralı kilitli satırda okunur: eşzamanlı onay ve kapatma sıraya girer.
export function alarmKilitle(db: Db, id: number): Promise<AlarmSatiri | null> {
  return db.tek<AlarmSatiri>(`SELECT ${SECIM} FROM guvenlik_alarmi a WHERE a.id = $1 FOR UPDATE`, [id]);
}

export async function alarmVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM guvenlik_alarmi WHERE id = $1', [id])) !== null;
}

export function alarmOnayla(db: Db, id: number, surum: number, kisiId: number): Promise<AlarmSatiri | null> {
  return db.tek<AlarmSatiri>(
    `UPDATE guvenlik_alarmi a SET durum = 'onaylandi', onaylayan_kisi_id = $3, onaylandi = now(), surum = surum + 1
      WHERE a.id = $1 AND a.surum = $2 RETURNING ${SECIM}`,
    [id, surum, kisiId],
  );
}

export function alarmKapat(db: Db, id: number, surum: number, kisiId: number, not: string): Promise<AlarmSatiri | null> {
  return db.tek<AlarmSatiri>(
    `UPDATE guvenlik_alarmi a SET durum = 'kapandi', kapatan_kisi_id = $3, kapandi = now(), kapanis_notu = $4, surum = surum + 1
      WHERE a.id = $1 AND a.surum = $2 RETURNING ${SECIM}`,
    [id, surum, kisiId, not],
  );
}

export interface DurumSayilari { kritik: number; yuksek: number; orta: number; onaylandi: number }

export async function durumSayilari(db: Db): Promise<DurumSayilari> {
  const r = await db.tek<DurumSayilari>(
    `SELECT (count(*) FILTER (WHERE durum = 'acik' AND onem = 'kritik'))::int AS kritik,
            (count(*) FILTER (WHERE durum = 'acik' AND onem = 'yuksek'))::int AS yuksek,
            (count(*) FILTER (WHERE durum = 'acik' AND onem = 'orta'))::int AS orta,
            (count(*) FILTER (WHERE durum = 'onaylandi'))::int AS onaylandi
       FROM guvenlik_alarmi WHERE durum <> 'kapandi'`,
  );
  return r ?? { kritik: 0, yuksek: 0, orta: 0, onaylandi: 0 };
}

// Reddedilen istekler (1363 a): çekirdeğin tamponundan boşaltılan olaylar tek sorguyla yazılır.
export interface RetGirdisi { zaman: Date; neden: RetNedeni; kisiId: number | null; yontem: string; yol: string; ip: string | null }

export async function retOlaylariniYaz(db: Db, olaylar: readonly RetGirdisi[]): Promise<number> {
  if (olaylar.length === 0) return 0;
  const satirlar = await db.sorgu(
    `INSERT INTO guvenlik_red_olayi (zaman, neden, kisi_id, yontem, yol, ip)
     SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::int[], $4::text[], $5::text[], $6::text[])
     RETURNING id`,
    [
      olaylar.map((o) => o.zaman.toISOString()), olaylar.map((o) => o.neden), olaylar.map((o) => o.kisiId),
      olaylar.map((o) => o.yontem), olaylar.map((o) => o.yol), olaylar.map((o) => o.ip),
    ],
  );
  return satirlar.length;
}

export function kisiRetOzetleri(db: Db, pencereSn: number, nedenler: readonly RetNedeni[]): Promise<KisiRetOzeti[]> {
  return db.sorgu<KisiRetOzeti>(
    `SELECT kisi_id AS "kisiId",
            count(DISTINCT (yontem, yol)) FILTER (WHERE neden <> 'kapsam')::int AS "farkliUc",
            (count(*) FILTER (WHERE neden = 'kapsam'))::int AS kapsam,
            ${zamanMetni('max(zaman)')} AS "sonRet"
       FROM guvenlik_red_olayi
      WHERE kisi_id IS NOT NULL AND neden = ANY($2::text[]) AND zaman > now() - make_interval(secs => $1)
      GROUP BY kisi_id`,
    [pencereSn, nedenler],
  );
}

export function cihazTaramaOzetleri(db: Db, pencereSn: number): Promise<CihazTaramaOzeti[]> {
  return db.sorgu<CihazTaramaOzeti>(
    `SELECT ip, count(DISTINCT yol)::int AS "farkliYol", ${zamanMetni('max(zaman)')} AS "sonRet"
       FROM guvenlik_red_olayi
      WHERE neden = 'adres-yok' AND ip IS NOT NULL AND zaman > now() - make_interval(secs => $1)
      GROUP BY ip`,
    [pencereSn],
  );
}

export async function eskiRetleriSil(db: Db, gun: number): Promise<number> {
  const satirlar = await db.sorgu('DELETE FROM guvenlik_red_olayi WHERE zaman < now() - make_interval(days => $1) RETURNING id', [gun]);
  return satirlar.length;
}

export interface RetListeSatiri { id: number; zaman: string; neden: RetNedeni; kisiId: number | null; yontem: string; yol: string; ip: string | null }
export interface RetSuzgeci { neden: RetNedeni | null; ara: string | null }

// Arama metni joker karakter taşımasın diye LIKE yerine konum aranır (giriş listesiyle aynı).
const RET_SUZGECI = `FROM guvenlik_red_olayi r
  WHERE ($1::text IS NULL OR r.neden = $1)
    AND ($2::text IS NULL OR strpos(lower(r.yol), lower($2)) > 0 OR strpos(lower(coalesce(r.ip, '')), lower($2)) > 0)`;

export async function retSay(db: Db, s: RetSuzgeci): Promise<number> {
  const r = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${RET_SUZGECI}`, [s.neden, s.ara]);
  return r?.toplam ?? 0;
}

export function retSatirlari(db: Db, s: RetSuzgeci, dilim: Dilim): Promise<RetListeSatiri[]> {
  return db.sorgu<RetListeSatiri>(
    `SELECT r.id::int AS id, ${zamanMetni('r.zaman')} AS zaman, r.neden, r.kisi_id AS "kisiId", r.yontem, r.yol, r.ip ${RET_SUZGECI}
      ORDER BY r.zaman DESC, r.id DESC LIMIT $3 OFFSET $4`,
    [s.neden, s.ara, dilim.sinir, dilim.atla],
  );
}
