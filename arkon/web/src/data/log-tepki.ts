// Kayıt olayına ekranın tepkisi. Her sayım ve durum değişimi bütün tabletlere olay düşürür; ekran yalnız okuduğu tür ve makine için
// yeniden yükler ve aynı pencerede gelen olayları tek yüklemede toplar (tablet sayısı x olay sayısı kadar istek olmasın).

// Sunucudan gelen olay makineyi taşımaz (satır yok): o zaman ilgili sayılır, yükleme kaçırılmaz.
export function kayitIlgili(kind: string, row: { machine?: unknown } | null | undefined, kinds: readonly string[], machine: string | null | undefined): boolean {
  if (!kinds.includes(kind)) return false;
  if (!machine || !row || row.machine == null) return true;
  return row.machine === machine;
}

// İlk tetiklemeden `ms` sonra bir kez koşar; arada gelenler aynı koşuya katılır. Gecikme tek olaydaki ile aynıdır.
export function seyrelt(fn: () => void, ms: number): { tetikle(): void; birak(): void } {
  let bekleyen: ReturnType<typeof setTimeout> | null = null;
  return {
    tetikle() {
      if (bekleyen !== null) return;
      bekleyen = setTimeout(() => { bekleyen = null; fn(); }, ms);
    },
    birak() {
      if (bekleyen !== null) clearTimeout(bekleyen);
      bekleyen = null;
    },
  };
}
