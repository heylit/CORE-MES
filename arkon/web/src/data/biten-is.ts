/* Kart #1194 (AR-BI-1): biten işte sayaç kapalıdır. Sunucu da biten işin sonucunda sayı ve durum değişikliğini reddeder
   (sunucu/moduller/arkon/kurallar.ts bitmisIsReddi); ekran düğmeleri kapalı göstererek ret almadan önce durdurur. */
export interface SayimIsi { state?: string; empty?: boolean; pkg?: { tmi?: object | null } | null }

// 3173: sayımı SmartES'ten gelen istasyonda iyi parçayı terminal saymaz; aynı üretim iki kez stoğa girmez. Sunucu da bu sayımı reddeder.
// Hurda ve hatalı terminalde kalır (SmartES red adedi CORE'a işlenmiyor).
export const SMARTES_SAYIM_ILETISI = 'Bu istasyonda sayım SmartES’ten gelir';
export const smartesSayimi = (is: SayimIsi | null | undefined): boolean => (is?.pkg?.tmi as { sayimKaynagi?: unknown } | null | undefined)?.sayimKaynagi === 'smartes';

export const BITMIS_IS_ILETISI = 'Bu iş bitti · sayı değişmez';
export const BASLAMAMIS_IS_ILETISI = 'İş başlamadı · önce başlat';
export const DURUSTA_SAYIM_ILETISI = 'Duruşta sayım yapılmaz · önce devam et';
export const HAZIRLIKTA_SAYIM_ILETISI = 'Hazırlıkta sayım yapılmaz · önce ilk parça onayı';

// CORE sayımı yalnız başlamış ve durmamış emirde kabul eder (sunucu/moduller/uretim-emirleri/kurallar.ts sayimIhlali): ekran o durumlarda
// düğmeyi kapatır, sayı önce değişip sonra geri dönmez. Hazırlıkta iyi parça sayılmaz (sunucu da reddeder, arkon/kurallar.ts sayimKomutu):
// onaysız ilk parçalar işin sonunda iyi parçaya katılıyordu. Hazırlık hurdası sayılır.
export function sayimKapaliNedeni(is: SayimIsi | null | undefined, tur: 'good' | 'scrap' = 'scrap'): string | null {
  if (!is || is.empty || is.state === 'done') return BITMIS_IS_ILETISI;
  if (tur === 'good' && smartesSayimi(is)) return SMARTES_SAYIM_ILETISI;
  if (is.state === 'queued') return BASLAMAMIS_IS_ILETISI;
  if (is.state === 'setup' && tur === 'good') return HAZIRLIKTA_SAYIM_ILETISI;
  return is.state === 'stopped' ? DURUSTA_SAYIM_ILETISI : null;
}

export const sayimKapali = (is: SayimIsi | null | undefined, tur: 'good' | 'scrap' = 'scrap'): boolean => sayimKapaliNedeni(is, tur) !== null;

// Sunucu CORE'da biten emrin paketine okumada `tmi.bitti` yazar (sunucu/moduller/arkon/kurallar.ts bitenEmirIsareti).
export const tmiBitti = (paket: { tmi?: { bitti?: unknown } | null } | null | undefined): boolean => paket?.tmi?.bitti === true;

// Kuyruk listesi: açık işler önce, biten işler ayrı başlık altında; sıra numarası listedeki yeridir (seçim onunla yapılır).
export function bitenleriAyir<T extends SayimIsi>(isler: readonly T[]): { acik: [T, number][]; biten: [T, number][] } {
  const sirali = isler.map((is, sira): [T, number] => [is, sira]);
  return { acik: sirali.filter(([is]) => is.state !== 'done'), biten: sirali.filter(([is]) => is.state === 'done') };
}

// Sunucunun reddettiği sayım kaydı (kayıt isteğinin `reddedilen` listesi ya da 4xx) terminaldeki sayıyı geri çevirir: ekran sunucunun
// kabul etmediği adedi göstermez.
export interface SayimGeriAlma { orderNo: string; pkgId: string | null; alan: 'good' | 'scrap'; fark: number }

export function sayimGeriAlma(detay: unknown): SayimGeriAlma | null {
  const d = detay as { kind?: unknown; row?: Record<string, unknown> } | null | undefined;
  const row = d?.row;
  if (d?.kind !== 'counts' || !row) return null;
  const { kind, delta, orderNo, pkgId } = row;
  if ((kind !== 'good' && kind !== 'scrap') || typeof delta !== 'number' || !Number.isSafeInteger(delta) || delta === 0) return null;
  if (typeof orderNo !== 'string' || orderNo === '') return null;
  return { orderNo, pkgId: typeof pkgId === 'string' ? pkgId : null, alan: kind, fark: -delta };
}

interface SayacliIs { no?: unknown; pkg?: { id?: unknown } | null; good: number; scrap: number }

export const geriAlinacakIs = (is: SayacliIs, g: SayimGeriAlma): boolean =>
  is.no === g.orderNo && ((is.pkg?.id ?? null) === g.pkgId);

export function sayimGeriUygula<T extends SayacliIs>(isler: readonly T[], g: SayimGeriAlma): T[] {
  return isler.map((is) => (geriAlinacakIs(is, g) ? { ...is, [g.alan]: Math.max(0, is[g.alan] + g.fark) } : is));
}

// Kayıt isteğinin cevabı: CORE'a işlenmeyen satırlar `reddedilen` listesinde döner (paylasilan/sozlesme/arkon.ts).
// `tmiDurum`: reddedilen durum kaydında işin CORE'daki hâli; varsa ekran kendi gösterdiğini buna eşitler.
export function logRetleri(cevap: unknown): { cid: string; ileti: string; tmiDurum?: string }[] {
  const liste = (cevap as { reddedilen?: unknown } | null | undefined)?.reddedilen;
  if (!Array.isArray(liste)) return [];
  return liste.filter((r): r is { cid: string; ileti: string; tmiDurum?: string } => !!r && typeof r.cid === 'string' && typeof r.ileti === 'string');
}

// Sayım kaydı bekleyip sonradan CORE'a yazılamadıysa sunucu `$tmiRet` iletisi yayar (cevaptaki ret o istekte sonuçlananları taşır).
// Yalnız sayımı yapan kişinin tableti uygular; ayrıntı cevaptaki retle aynıdır, ekran aynı yoldan sayıyı geri çevirir.
export function gecikmeliRet(m: unknown, kullaniciId: string | undefined): { store: string; kind: string; id: string; cid: string; row: Record<string, unknown>; msg: string } | null {
  const d = m as { type?: unknown; kind?: unknown; cid?: unknown; row?: unknown; ileti?: unknown } | null | undefined;
  if (d?.type !== '$tmiRet' || d.kind !== 'counts' || typeof d.cid !== 'string' || typeof d.ileti !== 'string') return null;
  const row = d.row as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== 'object' || kullaniciId === undefined || String(row.userId) !== String(kullaniciId)) return null;
  return { store: 'log_counts', kind: 'counts', id: d.cid, cid: d.cid, row, msg: d.ileti };
}

// CORE durum kaydını reddetti ve işin CORE'daki hâlini bildirdi: ekran o hâli gösterir (duraklatma yazılmadıysa iş çalışıyor görünür,
// devam reddedildiyse ama iş CORE'da çalışıyorsa çalışıyor görünür). Eşitleme yeni durum kaydı yazmaz.
const ESITLENEN_DURUMLAR = new Set(['running', 'paused', 'stopped', 'queued', 'done']);
// pkgId undefined: emrin bu istasyondaki bütün işleri (CORE hâli emrin hâlidir).
export interface DurumEsitleme { orderNo: string; pkgId: string | null | undefined; state: string }

export function durumEsitleme(detay: unknown): DurumEsitleme | null {
  const d = detay as { kind?: unknown; row?: Record<string, unknown>; tmiDurum?: unknown } | null | undefined;
  const row = d?.row;
  if (d?.kind !== 'events' || !row || typeof d.tmiDurum !== 'string' || !ESITLENEN_DURUMLAR.has(d.tmiDurum)) return null;
  const { orderNo, pkgId } = row;
  if (typeof orderNo !== 'string' || orderNo === '') return null;
  return { orderNo, pkgId: typeof pkgId === 'string' ? pkgId : null, state: d.tmiDurum };
}

export function durumEsitle<T extends DurumluIs>(isler: readonly T[], e: DurumEsitleme): T[] {
  return isler.map((is) => {
    if (is.no !== e.orderNo || (e.pkgId !== undefined && (is.pkg?.id ?? null) !== e.pkgId) || is.state === e.state) return is;
    return e.state === 'queued' ? { ...is, state: e.state, startedAt: undefined } : { ...is, state: e.state };
  });
}

// Makine devralınınca CORE iki işin yeni hâlini `$durum` iletisiyle yayar (sunucu `devralmaHaliniYay`): istasyonun tableti o emri eşitler.
export function durumIletisi(m: unknown, istasyon: string): DurumEsitleme | null {
  const d = m as { type?: unknown; machine?: unknown; orderNo?: unknown; state?: unknown } | null | undefined;
  if (d?.type !== '$durum' || d.machine !== istasyon || typeof d.orderNo !== 'string' || d.orderNo === '') return null;
  if (typeof d.state !== 'string' || !ESITLENEN_DURUMLAR.has(d.state)) return null;
  return { orderNo: d.orderNo, pkgId: undefined, state: d.state };
}

// Sunucunun reddettiği başlatma (kayıttan önceki 409 ya da CORE reddi): iş başlamadı, terminal çalışıyor göstermez. Üretimi olmayan iş
// kuyruğa, üretimi olan iş duraklamaya döner.
export interface BaslatmaGeriAlma { orderNo: string; pkgId: string | null }

export function baslatmaGeriAlma(detay: unknown): BaslatmaGeriAlma | null {
  const d = detay as { kind?: unknown; row?: Record<string, unknown> } | null | undefined;
  const row = d?.row;
  if (d?.kind !== 'events' || !row || row.state !== 'running') return null;
  const { orderNo, pkgId } = row;
  if (typeof orderNo !== 'string' || orderNo === '') return null;
  return { orderNo, pkgId: typeof pkgId === 'string' ? pkgId : null };
}

interface DurumluIs { no?: unknown; pkg?: { id?: unknown } | null; state?: string; good: number; scrap: number; startedAt?: number }

export function baslatmaGeriUygula<T extends DurumluIs>(isler: readonly T[], g: BaslatmaGeriAlma): T[] {
  return isler.map((is) => {
    if (is.no !== g.orderNo || (is.pkg?.id ?? null) !== g.pkgId || is.state !== 'running') return is;
    return is.good + is.scrap > 0 ? { ...is, state: 'paused' } : { ...is, state: 'queued', startedAt: undefined };
  });
}

// Bağlantı yokken kuyrukta beklemiş üretim kaydı reddedilince kaybolmaz (karar 3158 a): kuyruk öğesi `red` ile işaretlenir ve kişi çözene kadar
// gönderilmez. `yazildi`: sunucu kaydı yazmış ama CORE'a işlememiştir; aynı kimlik sunucuda elendiğinden cihazdan yeniden denenemez.
// `yenidenDenendi`: kişi bir kez yeniden denedi ve yine kesinleşmedi; aynı kayıt ikinci kez denenmez.
export interface KuyrukReddi { ileti: string; at: number; yazildi: boolean; yenidenDenendi?: boolean; cozum?: 'vazgecildi' | 'duzeltildi'; cozumAt?: number }
interface KuyrukKaydi { op?: unknown; kind?: unknown; row?: unknown; at?: unknown; uid?: unknown; red?: KuyrukReddi }

export const KUYRUK_BITTI_OLAYI = 'arkon-kuyruk-bitti';
// Yeniden denenen sayım yazıldı ya da sunucuda yeniden sıraya girdi: ret anında geri alınan adet ekranda yeniden eklenir.
export const SAYIM_YENIDEN_YAZILDI_OLAYI = 'arkon-sayim-yeniden-yazildi';
const COZULMUS_IZ_SURESI_MS = 24 * 3600e3;

export const kararBekler = (oge: unknown): boolean => !!(oge as KuyrukKaydi | null | undefined)?.red;

export const cozulmusEskidi = (oge: unknown, simdi: number): boolean => {
  const red = (oge as KuyrukKaydi | null | undefined)?.red;
  return red?.cozum !== undefined && simdi - (red.cozumAt ?? red.at) > COZULMUS_IZ_SURESI_MS;
};

export type BekleyenDurumu = 'bekliyor' | 'gonderiliyor' | 'karar' | 'vazgecildi' | 'duzeltildi';
export interface BekleyenKayit<A = unknown> {
  anahtar: A; tur: string; satir: Record<string, unknown>; zaman: number | null; durum: BekleyenDurumu;
  neden: string | null; yenidenDenenir: boolean;
}

// Sunucuda yazılmamış kayıt kuyruktan yeniden gönderilir; sunucuda yazılmış ama CORE'un reddettiği kayıttan yalnız sayım yeniden denenir (3167 b).
// İkinci kez kesinleşmeyen kayıt denenmez.
function yenidenDenenir(tur: string, red: KuyrukReddi | undefined): boolean {
  if (!red || red.cozum !== undefined || red.yenidenDenendi) return false;
  return !red.yazildi || tur === 'counts';
}

// Gecikmeli ret iletisi ($tmiRet) cihazda karar bekleyen kayda aitse ekran sayıyı yeniden geri almaz: ret anında zaten geri alınmıştır.
export const kararBekleyenKayitMi = (kuyruk: readonly unknown[], cid: string): boolean =>
  kuyruk.some((o) => { const k = o as KuyrukKaydi | null | undefined; return !!k?.red && k.op === 'log' && (k.row as { cid?: unknown } | null | undefined)?.cid === cid; });

// Kuyruktaki üretim kayıtları (belge yazımları değil), yalnız oturumdaki kişininkiler: ortak tablette başkasının işlemi listelenmez.
export function bekleyenKayitlar<A>(
  kuyruk: readonly (readonly [A, unknown])[], kisiId: string | undefined, yolda: { has(a: A): boolean }, gonderiliyor: boolean,
): BekleyenKayit<A>[] {
  const liste: BekleyenKayit<A>[] = [];
  for (const [anahtar, oge] of kuyruk) {
    const o = oge as KuyrukKaydi | null | undefined;
    if (!o || o.op !== 'log' || typeof o.kind !== 'string' || !o.row || typeof o.row !== 'object' || o.uid !== kisiId) continue;
    const red = o.red;
    const durum: BekleyenDurumu = red ? (red.cozum ?? 'karar') : gonderiliyor || yolda.has(anahtar) ? 'gonderiliyor' : 'bekliyor';
    liste.push({
      anahtar, tur: o.kind, satir: o.row as Record<string, unknown>, zaman: typeof o.at === 'number' ? o.at : null, durum,
      neden: red ? red.ileti : null, yenidenDenenir: yenidenDenenir(o.kind, red),
    });
  }
  return liste;
}
