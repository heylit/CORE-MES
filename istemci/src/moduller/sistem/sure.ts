// Saniyeyi en fazla iki birimle okunur yazar; sıfır olan sondaki birim düşer. Geçersiz girdide "yok".
export function sureMetni(saniye: number): string {
  if (!Number.isFinite(saniye) || saniye < 0) return 'yok';
  const toplam = Math.floor(saniye);
  const gun = Math.floor(toplam / 86400);
  const saat = Math.floor((toplam % 86400) / 3600);
  const dakika = Math.floor((toplam % 3600) / 60);
  const sn = toplam % 60;
  const birlestir = (buyuk: string, kucuk: string, kucukDeger: number) =>
    kucukDeger > 0 ? `${buyuk} ${kucuk}` : buyuk;
  if (gun > 0) return birlestir(`${gun} g`, `${saat} sa`, saat);
  if (saat > 0) return birlestir(`${saat} sa`, `${dakika} dk`, dakika);
  if (dakika > 0) return birlestir(`${dakika} dk`, `${sn} sn`, sn);
  return `${sn} sn`;
}
