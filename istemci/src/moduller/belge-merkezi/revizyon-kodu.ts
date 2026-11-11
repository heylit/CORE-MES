// 2138-2: merkezin harfi (A, B) yalnız yükleme sırasıdır, ekranda gösterilmez. Gösterilen revizyon kodu sunucudan gelir:
// resmin antet revizyonu, yoksa bağlı malzeme kartının revizyonu; ikisi de yoksa revizyon kodsuzdur.
export const revKoduMetni = (kod: string | null | undefined): string => kod ?? '—';

export const revizyonAdi = (r: { revKodu?: string | null }): string => (r.revKodu ? `Revizyon ${r.revKodu}` : 'Kodsuz revizyon');
