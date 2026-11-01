// Kayıt olayına ekranın tepkisi. Her sayım ve durum değişimi bütün tabletlere olay düşürür; ekran yalnız okuduğu tür ve makine için
// yeniden yükler ve aynı pencerede gelen olayları tek yüklemede toplar (tablet sayısı x olay sayısı kadar istek olmasın).

// Sunucudan gelen olay makineyi taşımıyorsa (satır yok) ilgili sayılır, yükleme kaçırılmaz; taşıyorsa logIletisiniDagit makineyle verir.
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


// Sunucunun `$log` iletisi yazılan kayıtların istasyonlarını taşıyabilir (1747): abone her istasyon için bir kez o istasyonla
// çağrılır, kayitIlgili başka istasyonun kaydını eler. Liste yoksa (istasyonsuz kayıt) abone satırsız çağrılır.
export function logIletisiniDagit(m: { kind?: unknown; machines?: unknown }, aboneler: Iterable<(kind: string, row: { machine: string } | null) => void>): void {
  const kind = typeof m.kind === 'string' ? m.kind : '';
  const makineler = Array.isArray(m.machines) && m.machines.length > 0 && m.machines.every((x) => typeof x === 'string') ? (m.machines as string[]) : null;
  for (const f of aboneler) {
    for (const row of makineler === null ? [null] : makineler.map((machine) => ({ machine }))) {
      try { f(kind, row); } catch { /* bir abonenin hatası ötekileri durdurmaz */ }
    }
  }
}
