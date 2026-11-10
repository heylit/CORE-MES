import { useMemo } from 'react';

// İş emri no (Reçete ve Rota kaydı orders[].no). Çalışmadaki sipariş kimliği emrin iç kimliğidir (girdi.betik); kullanıcı emri
// numarasıyla tanır, ekranlar tam no gösterir (2693 a). Parça soneki (/2) korunur; numarası bilinmeyen kimlik olduğu gibi yazılır.
export type EmirNo = (id: string) => string;
export function emirNoOkuyucu(kayit: unknown): EmirNo {
  const orders = kayit !== null && typeof kayit === 'object' ? (kayit as { orders?: unknown }).orders : undefined;
  const m = new Map<string, string>();
  if (Array.isArray(orders)) for (const o of orders as unknown[]) {
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

export function useEmirNo(receteRotaKaydi: unknown): EmirNo {
  return useMemo(() => emirNoOkuyucu(receteRotaKaydi), [receteRotaKaydi]);
}

// Adım kimliği `<sipariş>.<adım>`: ekranda sipariş kısmı emir no yazılır.
export function isAdi(emirNo: EmirNo, id: string, job: string): string {
  return id.startsWith(`${job}.`) ? `${emirNo(job)}${id.slice(job.length)}` : id;
}
