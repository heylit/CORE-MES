// T.C. kimlik no biçimi ve sağlama haneleri (VARSAYIM: yaygın bilinen algoritma, resmî belgeden açılmadı). Yalnız yazarken denetlenir; yanlış girişi erken yakalar.
export function kimlikGecerliMi(deger: string): boolean {
  if (!/^[1-9]\d{10}$/.test(deger)) return false;
  const h = [...deger].map(Number);
  const tek = (h[0]! + h[2]! + h[4]! + h[6]! + h[8]!) * 7;
  const cift = h[1]! + h[3]! + h[5]! + h[7]!;
  if ((((tek - cift) % 10) + 10) % 10 !== h[9]) return false;
  return h.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === h[10];
}
