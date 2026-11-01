// Başka modül ekranlarının ithal edebildiği tek dosya.
// 1480: yerleşik kalitenin yoğunluğu (g/cm³) yalnız bu modülün kalite tablosundadır; tablo büyük olduğu için ilk istekte ayrı parça
// olarak yüklenir. Aile ya da kod tabloda yoksa ya da yoğunluk yazılı değilse null.
export async function yerlesikKaliteYogunlugu(aile: string, kod: string): Promise<number | null> {
  const { FAMS } = await import('./yeni/sabitler/index.ts');
  const a = FAMS[aile];
  if (a === undefined) return null;
  for (const sinif of Object.values(a.classes)) {
    const ro = sinif.grades.find((g) => g.kod === kod)?.p?.ro;
    if (typeof ro === 'number' && Number.isFinite(ro) && ro > 0) return ro;
  }
  return null;
}
