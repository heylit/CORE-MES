// İlk parça numunesi. Ret makineyi durdurur ve operatöre gerekçesiyle gösterilir; ölçüsüz ve gerekçesiz ret yoktur
// (sunucu da reddeder: sunucu/moduller/arkon/kurallar.ts numuneReddiEksigi).
export const NUMUNE_REDDI_OLCUSUZ = 'Red için en az bir ölçü girilmeli';
export const NUMUNE_REDDI_GEREKCESIZ = 'Red için gerekçe yazılmalı';

export function numuneReddiEksigi(olculen: number, gerekce: string | null | undefined): string | null {
  if (olculen < 1) return NUMUNE_REDDI_OLCUSUZ;
  return (gerekce ?? '').trim() === '' ? NUMUNE_REDDI_GEREKCESIZ : null;
}

interface Numune { id: string; pkgId?: string; at?: number; status?: string; items?: number[]; results?: Record<string, { ok?: boolean; v?: unknown }>; note?: string; decidedAt?: number }
interface PlanSatiri { id: number; nom?: string }

export type NumuneDurumu =
  | { pendingReq: string; pendingItems: number[]; pendingAt: number }
  | { lastDecision: { status: 'rejected'; bad: string; note: string | null; at: number } }
  | null;

const ACIK = new Set(['waiting', 'measuring']);

// Terminal açılırken ya da yenilenirken işin son numunesi: kalitede bekleyen numune ve son ret ekrana geri gelir (ret iletisi kaçmış ya da
// sayfa yenilenmiş olsa da). Onay ve sapma onayı ölçülerle zaten işe yazılır; durum döndürmez.
export function sonNumuneDurumu(numuneler: readonly Numune[], pkgId: string, plan: readonly PlanSatiri[] = []): NumuneDurumu {
  const son = numuneler.filter((n) => n.pkgId === pkgId).sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).at(-1);
  if (!son) return null;
  if (son.status && ACIK.has(son.status)) return { pendingReq: son.id, pendingItems: son.items ?? [], pendingAt: son.at ?? 0 };
  if (son.status !== 'rejected') return null;
  const kotu = (son.items ?? []).flatMap((id) => {
    const r = son.results?.[id];
    if (!r || r.ok) return [];
    const b = plan.find((q) => q.id === id);
    return [(b?.nom ?? '#' + id) + ' = ' + String(r.v)];
  });
  return { lastDecision: { status: 'rejected', bad: kotu.join(', '), note: son.note ?? null, at: son.decidedAt ?? son.at ?? 0 } };
}

// Teknik resimdeki "ölçüldü · red" satırı yalnız sayı verir; neden operatörün gözü önünde kalsın diye son retin gerekçesi o satıra eklenir.
export function retGerekcesiMetni(karar: { status?: string; note?: string | null } | null | undefined): string | null {
  if (karar?.status !== 'rejected') return null;
  const metin = (karar.note ?? '').trim();
  return metin === '' ? null : metin;
}

// Yeni numune gönderilince son ret kararına dokunulmaz: kart, yeni numunenin kararı gelene kadar gerekçesiyle ekranda kalır.
export const yeniNumuneYamasi = (istek: { id: string; items: number[]; at: number }) => ({ pendingReq: istek.id, pendingItems: istek.items, pendingAt: istek.at });

// Bekleyen istek, ölçüm yetkisi olan kişi seçince "Ölçülüyor"a geçer; öteki roller (amir, planlama, hazırlık) yalnız görür.
export const secinceOlcumeAlinir = (durum: string | undefined, olcebilir: boolean): boolean => durum === 'waiting' && olcebilir;

// Ölçüm girişi (elle, Geçer/Geçmez, CMM) q.meas, Red/Sapma/Onayla q.decide ister; yetkisiz rol düğmeyi görmez (basınca sunucu 403 verirdi).
export const numuneDugmeleri = (yetki: { olcebilir: boolean; karar: boolean }): { olcum: boolean; karar: boolean } => ({ olcum: yetki.olcebilir, karar: yetki.karar });
