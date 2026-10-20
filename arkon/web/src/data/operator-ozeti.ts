// Terminal üst şeridindeki operatör özeti için saf hesaplar. Sayı yoksa null: sıfır uydurulmaz.

// Vardiyanın kalan süresi (dk). Vardiya dışında ya da vardiya bitmişse null.
export function vardiyaKalanDk(vardiya: { name: string; e: number }, an: number): number | null {
  if (vardiya.name === '—' || an >= vardiya.e) return null;
  return Math.ceil((vardiya.e - an) / 60000);
}

export function kalanMetni(dk: number | null): string | null {
  if (dk == null) return null;
  const sa = Math.floor(dk / 60), d = dk % 60;
  return sa ? `${sa} sa ${d} dk kaldı` : `${d} dk kaldı`;
}

// Vardiyanın iyi parçası ve beklenen adedi: beklenen (planlı süre / planlı çevrim) yoksa yalnız iyi parça yazılır.
export function vardiyaUretimi(iyi: number, beklenen: number | null | undefined): { metin: string; oran: number | null } {
  if (beklenen && beklenen > 0) return { metin: `Vardiya ${iyi} / ${beklenen}`, oran: Math.min(1, iyi / beklenen) };
  return { metin: `Vardiya ${iyi} iyi`, oran: null };
}
