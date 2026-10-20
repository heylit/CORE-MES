/* Kart #1194 (AR-BI-1): biten işte sayaç kapalıdır. Sunucu da biten işin sonucunda sayı ve durum değişikliğini reddeder
   (sunucu/moduller/arkon/kurallar.ts bitmisIsReddi); ekran düğmeleri kapalı göstererek ret almadan önce durdurur. */
export interface SayimIsi { state?: string; empty?: boolean }

export const BITMIS_IS_ILETISI = 'Bu iş bitti · sayı değişmez';
export const BASLAMAMIS_IS_ILETISI = 'İş başlamadı · önce başlat';
export const DURUSTA_SAYIM_ILETISI = 'Duruşta sayım yapılmaz · önce devam et';
export const HAZIRLIKTA_SAYIM_ILETISI = 'Hazırlıkta sayım yapılmaz · önce ilk parça onayı';

// TMI sayımı yalnız başlamış ve durmamış emirde kabul eder (sunucu/moduller/uretim-emirleri/kurallar.ts sayimIhlali): ekran o durumlarda
// düğmeyi kapatır, sayı önce değişip sonra geri dönmez. Hazırlıkta iyi parça sayılmaz (sunucu da reddeder, arkon/kurallar.ts sayimKomutu):
// onaysız ilk parçalar işin sonunda iyi parçaya katılıyordu. Hazırlık hurdası sayılır.
export function sayimKapaliNedeni(is: SayimIsi | null | undefined, tur: 'good' | 'scrap' = 'scrap'): string | null {
  if (!is || is.empty || is.state === 'done') return BITMIS_IS_ILETISI;
  if (is.state === 'queued') return BASLAMAMIS_IS_ILETISI;
  if (is.state === 'setup' && tur === 'good') return HAZIRLIKTA_SAYIM_ILETISI;
  return is.state === 'stopped' ? DURUSTA_SAYIM_ILETISI : null;
}

export const sayimKapali = (is: SayimIsi | null | undefined, tur: 'good' | 'scrap' = 'scrap'): boolean => sayimKapaliNedeni(is, tur) !== null;

// Sunucu TMI'de biten emrin paketine okumada `tmi.bitti` yazar (sunucu/moduller/arkon/kurallar.ts bitenEmirIsareti).
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

// Kayıt isteğinin cevabı: TMI'ye işlenmeyen satırlar `reddedilen` listesinde döner (paylasilan/sozlesme/arkon.ts).
// `tmiDurum`: reddedilen durum kaydında işin TMI'deki hâli; varsa ekran kendi gösterdiğini buna eşitler.
export function logRetleri(cevap: unknown): { cid: string; ileti: string; tmiDurum?: string }[] {
  const liste = (cevap as { reddedilen?: unknown } | null | undefined)?.reddedilen;
  if (!Array.isArray(liste)) return [];
  return liste.filter((r): r is { cid: string; ileti: string; tmiDurum?: string } => !!r && typeof r.cid === 'string' && typeof r.ileti === 'string');
}

// Sayım kaydı bekleyip sonradan TMI'ye yazılamadıysa sunucu `$tmiRet` iletisi yayar (cevaptaki ret o istekte sonuçlananları taşır).
// Yalnız sayımı yapan kişinin tableti uygular; ayrıntı cevaptaki retle aynıdır, ekran aynı yoldan sayıyı geri çevirir.
export function gecikmeliRet(m: unknown, kullaniciId: string | undefined): { store: string; kind: string; id: string; cid: string; row: Record<string, unknown>; msg: string } | null {
  const d = m as { type?: unknown; kind?: unknown; cid?: unknown; row?: unknown; ileti?: unknown } | null | undefined;
  if (d?.type !== '$tmiRet' || d.kind !== 'counts' || typeof d.cid !== 'string' || typeof d.ileti !== 'string') return null;
  const row = d.row as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== 'object' || kullaniciId === undefined || String(row.userId) !== String(kullaniciId)) return null;
  return { store: 'log_counts', kind: 'counts', id: d.cid, cid: d.cid, row, msg: d.ileti };
}

// TMI durum kaydını reddetti ve işin TMI'deki hâlini bildirdi: ekran o hâli gösterir (duraklatma yazılmadıysa iş çalışıyor görünür,
// devam reddedildiyse ama iş TMI'de çalışıyorsa çalışıyor görünür). Eşitleme yeni durum kaydı yazmaz.
const ESITLENEN_DURUMLAR = new Set(['running', 'paused', 'stopped', 'queued', 'done']);
// pkgId undefined: emrin bu istasyondaki bütün işleri (TMI hâli emrin hâlidir).
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

// Makine devralınınca TMI iki işin yeni hâlini `$durum` iletisiyle yayar (sunucu `devralmaHaliniYay`): istasyonun tableti o emri eşitler.
export function durumIletisi(m: unknown, istasyon: string): DurumEsitleme | null {
  const d = m as { type?: unknown; machine?: unknown; orderNo?: unknown; state?: unknown } | null | undefined;
  if (d?.type !== '$durum' || d.machine !== istasyon || typeof d.orderNo !== 'string' || d.orderNo === '') return null;
  if (typeof d.state !== 'string' || !ESITLENEN_DURUMLAR.has(d.state)) return null;
  return { orderNo: d.orderNo, pkgId: undefined, state: d.state };
}

// Sunucunun reddettiği başlatma (kayıttan önceki 409 ya da TMI reddi): iş başlamadı, terminal çalışıyor göstermez. Üretimi olmayan iş
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
