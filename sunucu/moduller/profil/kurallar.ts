// PRF-1: kişinin profilinde son 50 geri bildirimi görünür; daha eskisi okuyanın listesindedir.
export const PROFIL_GERI_BILDIRIM_SINIRI = 50;

// PRF-2: profildeki izin listesi bugünden bir yıl geriye ve bir yıl ileriye bakar (önümüzdeki onaylı izinler dahil).
// PRF-3: fazla mesai bu takvim yılının başından bugüne.
export function profilAraliklari(bugun: string): { izinBaslangic: string; izinBitis: string; mesaiBaslangic: string; mesaiBitis: string } {
  const [y, a, g] = bugun.split('-').map(Number) as [number, number, number];
  const kaydir = (yil: number): string => {
    // 29 Şubat bir yıl kayınca 28 Şubat olur: geçersiz tarih motorda reddedilir.
    const gun = a === 2 && g === 29 ? 28 : g;
    return `${String(yil).padStart(4, '0')}-${String(a).padStart(2, '0')}-${String(gun).padStart(2, '0')}`;
  };
  return { izinBaslangic: kaydir(y - 1), izinBitis: kaydir(y + 1), mesaiBaslangic: `${String(y).padStart(4, '0')}-01-01`, mesaiBitis: bugun };
}

// PRF-4: fazla mesai toplamı yalnız saati girilmiş satırların toplamıdır; hiç saat yoksa null (sıfır uydurulmaz).
export function mesaiToplami(satirlar: readonly { saat: number | null }[]): number | null {
  const saatler = satirlar.map((s) => s.saat).filter((s): s is number => s !== null);
  if (saatler.length === 0) return null;
  return Math.round(saatler.reduce((t, s) => t + s, 0) * 100) / 100;
}
