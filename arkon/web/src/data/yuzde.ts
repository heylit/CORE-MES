// Sıfırdan büyük ama yarım yüzdenin altındaki oran "0%" yazılmaz: vardiyanın küçük bir kısmında çalışmış makinede OEE
// gerçekten küçüktür, sıfır görünmesi "hiç üretmedi" diye okunuyordu.
export const yuzdeMetni = (v: number | null | undefined): string =>
  v == null ? '—' : v > 0 && v < 0.005 ? '<1%' : `${Math.round(v * 100)}%`;
