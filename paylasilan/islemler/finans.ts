// Firma kartı musteri-tedarikci modülündedir (kart #1164); firmayı gören finans rakamını görmez.
// finans.oku: bütün rakamlar; finans.yaz: günlük kayıt; iptal, geri alma, tanım ve ayar sekiz yönetim eylemindedir (3165 a).
// finans.kur-yaz: günlük kur ve faiz girer (satın alma da girer, kart #953); rakam açmaz.
// finans.beyan-yaz: vergi son gününün beyanını "verildi" işaretler ya da işareti kaldırır (1846, TKV-2 a); rakam açmaz.
// finans.maliyet-oku: malzeme, istasyon ve kişi birim maliyetlerini görür (kart #1187); yazma finans.maliyet-yaz'dadır.
// Finans yönetimi sekiz eyleme bölündü (3165 a): iptal, çek, hesap, oran, sabit kıymet, maliyet, düzenli ödeme, ayar.
const FINANS_YONETIM_ISLEMLERI = [
  'finans.iptal',
  'finans.cek-yonet',
  'finans.hesap-yonet',
  'finans.oran-yaz',
  'finans.sabit-kiymet',
  'finans.maliyet-yaz',
  'finans.duzenli-odeme',
  'finans.ayar',
] as const;
// Bölünmüş eski anahtar: hiçbir ucu açmaz, satırı ayrı kartla silinene dek katalogda kalır.
const FINANS_ESKI_ISLEMLERI = ['finans.yonet'] as const;
export const FINANS_ISLEMLERI = [
  'finans.beyan-yaz',
  'finans.kur-yaz',
  'finans.maliyet-oku',
  'finans.oku',
  'finans.yaz',
  ...FINANS_YONETIM_ISLEMLERI,
  ...FINANS_ESKI_ISLEMLERI,
] as const;
