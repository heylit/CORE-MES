// Firma kartı musteri-tedarikci modülündedir (kart #1164); firmayı gören finans rakamını görmez.
// finans.oku: bütün rakamlar; finans.yaz: günlük kayıt; finans.yonet: iptal, geri alma, tanım ve ayar.
// finans.kur-yaz: günlük kur ve faiz girer (satın alma da girer, kart #953); rakam açmaz.
// finans.maliyet-oku: malzeme, istasyon ve kişi birim maliyetlerini görür (kart #1187); yazma finans.yonet'tedir.
export const FINANS_ISLEMLERI = [
  'finans.kur-yaz',
  'finans.maliyet-oku',
  'finans.oku',
  'finans.yaz',
  'finans.yonet',
] as const;
