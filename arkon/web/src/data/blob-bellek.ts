// Büyük ikili verilerin (PDF, STEP, 3B ağı) bellekteki kopyası. Kalıcı kopya IndexedDB'dedir; bellekten çıkan blob oradan yeniden okunur.
// Sınır, tablette çizim ve modeller açıldıkça sekme belleğinin büyümemesi içindir.
export const BLOB_BELLEK_SINIRI = 64e6;

export function blobBellegi(sinir: number) {
  const m = new Map<string, Uint8Array>();
  let toplam = 0;
  return {
    al(h: string): Uint8Array | undefined {
      const u = m.get(h);
      if (u === undefined) return undefined;
      m.delete(h); m.set(h, u);
      return u;
    },
    koy(h: string, u: Uint8Array): void {
      if (m.has(h)) return;
      m.set(h, u); toplam += u.length;
      while (toplam > sinir && m.size) { const [k, v] = m.entries().next().value as [string, Uint8Array]; toplam -= v.length; m.delete(k); }
    },
    boyut(): number { return toplam; },
  };
}
