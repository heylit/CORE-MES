import { useMemo } from 'react';

// İş emri no (Reçete ve Rota kaydı orders[].no). Çalışmadaki sipariş kimliği emrin iç kimliğidir (girdi.betik); kullanıcı emri
// numarasıyla tanır, ekranlar tam no gösterir (2693 a). Parça soneki (/2) korunur; numarası bilinmeyen kimlik olduğu gibi yazılır.
export type EmirNo = (id: string) => string;
// `canli` planlama kaynağının emirleridir (`/plan/planlama-kaynagi` emirler): Reçete ve Rota kaydı yazıldıktan sonra başka sayfadan açılan
// emrin numarası yalnız orada vardır; ikisinde de varsa canlı olan geçer.
export function emirNoOkuyucu(kayit: unknown, canli?: unknown): EmirNo {
  const liste = (k: unknown): unknown[] => {
    const orders = k !== null && typeof k === 'object' ? (k as { orders?: unknown }).orders : undefined;
    return Array.isArray(orders) ? orders as unknown[] : [];
  };
  const m = new Map<string, string>();
  for (const o of [...liste(kayit), ...liste(canli)]) {
    if (o === null || typeof o !== 'object') continue;
    const { id, no } = o as { id?: unknown; no?: unknown };
    if ((typeof id === 'string' || typeof id === 'number') && typeof no === 'string' && no.trim()) m.set(String(id), no.trim());
  }
  return (id) => {
    const p = /^(.*)(\/\d+)$/.exec(id);
    const kok = p?.[1] ?? id;
    const no = m.get(kok);
    return no ? `${no}${p?.[2] ?? ''}` : id;
  };
}

export function useEmirNo(receteRotaKaydi: unknown, canli?: unknown): EmirNo {
  return useMemo(() => emirNoOkuyucu(receteRotaKaydi, canli), [receteRotaKaydi, canli]);
}

// Adım kimliği `<sipariş>.<adım>`: ekranda sipariş kısmı emir no yazılır.
export function isAdi(emirNo: EmirNo, id: string, job: string): string {
  return id.startsWith(`${job}.`) ? `${emirNo(job)}${id.slice(job.length)}` : id;
}

// Dar yerde emir no: ayırt eden kuyruk kalır (MM-ORN-00002-26-11-005 → …11-005). Baştaki ön ek bütün emirlerde aynıdır; sondan kırpmak
// satırları birbirinin aynısı gösterir.
export function emirKuyrugu(no: string): string {
  const p = no.split('-');
  return p.length > 2 ? `…${p.slice(-2).join('-')}` : no;
}
