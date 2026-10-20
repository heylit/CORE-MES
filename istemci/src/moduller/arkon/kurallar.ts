import type { UretimHazirligiCevabi } from '#paylasilan/sozlesme/stok.ts';

// İkinci menüdeki sayılar Arkon belgelerinden okunur (Arkon'un kendi menü rozetiyle aynı kural).
export interface BekleyenSayilari {
  // Hazırlıkta yayınlanmamış paket: TMI'den gelen emirler de taslak olarak buradadır.
  taslakPaket: number;
  // Kalitede ölçüm bekleyen numune isteği.
  bekleyenNumune: number;
}

const durum = (govde: unknown): unknown => (govde && typeof govde === 'object' ? (govde as { status?: unknown }).status : undefined);

export function bekleyenSayilari(paketler: readonly { govde?: unknown }[], istekler: readonly { govde?: unknown }[]): BekleyenSayilari {
  return {
    taslakPaket: paketler.filter((p) => durum(p.govde) === 'draft').length,
    bekleyenNumune: istekler.filter((i) => durum(i.govde) === 'waiting' || durum(i.govde) === 'measuring').length,
  };
}

// Başlatmadan önce hazırlık (kart #1289): eksik girdiler, açılan istek ve depoda bulunduğu ilk yer. Eksik başlatmayı durdurmaz (karar 110 b).
// Eksik yoksa null.
export function hazirlikMetni(c: UretimHazirligiCevabi): string | null {
  if (c.hazir || c.eksikler.length === 0) return null;
  const satirlar = c.eksikler.map((e) => {
    const ad = e.kod ?? e.ad ?? `#${e.malzemeId}`;
    const yer = e.yerler[0] === undefined ? 'depoda yok' : `${e.yerler[0].konum} konumunda`;
    return `${ad} (${yer}${e.istek ? `, istek ${e.istek.no}` : ''})`;
  });
  const son = c.eksikler.some((e) => e.istek !== null)
    ? 'İstasyona istek açıldı; Teslim al ekranında görünür. İş uyarıyla başladı; depo isteği karşılayınca stok düzelir.'
    : 'İş uyarıyla başladı; malzemeyi istasyona getirip teslim alın, stok sonra düzelir.';
  return `Girdi istasyonda yok: ${satirlar.join('; ')}. ${son}`;
}
