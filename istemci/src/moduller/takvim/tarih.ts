// Tarihler tesis günüdür (YYYY-AA-GG); hesap UTC gece yarısında yapılır, saat dilimi kaymaz.
const GUN_MS = 86_400_000;
const an = (t: string): number => Date.parse(`${t}T00:00:00Z`);

export const gunEkle = (t: string, gun: number): string => new Date(an(t) + gun * GUN_MS).toISOString().slice(0, 10);
export const gunFarki = (a: string, b: string): number => Math.round((an(b) - an(a)) / GUN_MS);
// 0 pazartesi ... 6 pazar.
export const haftaGunu = (t: string): number => (new Date(an(t)).getUTCDay() + 6) % 7;
export const haftaBasi = (t: string): string => gunEkle(t, -haftaGunu(t));
export const ayBasi = (t: string): string => `${t.slice(0, 8)}01`;
export const ayEkle = (t: string, ay: number): string => {
  const d = new Date(an(ayBasi(t)));
  d.setUTCMonth(d.getUTCMonth() + ay);
  return d.toISOString().slice(0, 10);
};
const aySonu = (t: string): string => gunEkle(ayEkle(t, 1), -1);

// Ay görünümü: ayın ilk gününün haftasının pazartesisinden son gününün haftasının pazarına (en çok 42 gün).
export function ayIzgarasi(t: string): { baslangic: string; bitis: string } {
  const son = aySonu(t);
  return { baslangic: haftaBasi(ayBasi(t)), bitis: gunEkle(haftaBasi(son), 6) };
}

export const gunler = (baslangic: string, bitis: string): string[] =>
  Array.from({ length: gunFarki(baslangic, bitis) + 1 }, (_, i) => gunEkle(baslangic, i));

export const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;
export const GUN_ADLARI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

const ayAdi = (t: string): string => AY_ADLARI[Number(t.slice(5, 7)) - 1] ?? '';
export const gunNo = (t: string): number => Number(t.slice(8, 10));
export const tarihMetni = (t: string): string => `${gunNo(t)} ${ayAdi(t).slice(0, 3)} ${GUN_ADLARI[haftaGunu(t)] ?? ''}`;
export const ayBasligi = (t: string): string => `${ayAdi(t)} ${t.slice(0, 4)}`;
export const haftaBasligi = (t: string): string => {
  const son = gunEkle(t, 6);
  return `${gunNo(t)} ${ayAdi(t).slice(0, 3)} – ${gunNo(son)} ${ayAdi(son).slice(0, 3)}`;
};
