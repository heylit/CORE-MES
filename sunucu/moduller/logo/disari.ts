import { logoAyariOku } from './ayar.ts';
// Ters yöndeki bağ (293 a): stok logoyu ithal edemez; fişin Logo durumunu sunucu/kablolama.ts stoğa bu çözücüyle bağlar.
export { malzemeFisiLogoDurumlari } from './servis.ts';
// Ters yöndeki bağ (LOG-1 a): malzemeler logoyu ithal edemez; geçerli birim seti kodlarını sunucu/kablolama.ts bağlar.
export { gecerliBirimSetiKodlari } from './servis.ts';
// Ters yöndeki bağ (2089-2 a): malzemeler yeni stok kodu verirken Logo'da kullanılan kodları bununla atlar; sunucu/kablolama.ts bağlar.
export { logodaKullanilanMalzemeKodlari } from './servis.ts';
// 2116 (kararlar 2116-2 a, 2116-3 c): malzemeler "Logo'dan gelenler" listesini aynadan okur, Logo'dan alınan kartın kod eşlemesini yazar;
// stok Logo toplamını karşılaştırma ve açılış devri için okur. Hepsini sunucu/kablolama.ts bağlar; yetki denetlemezler.
export { logodakiMalzemeKartlari, logodakiStokToplamlari, malzemeEslemesiYaz, tmiStokKodlari } from './servis.ts';
export type { CariOkumasi } from './servis.ts';
export type { LogoCari, LogoMalzemeKarti, LogoStokSatiri } from './kurallar.ts';
// 2118: müşteri-tedarikçi Logo carisini arar ve tek cariyi okur (yalnız GET); sunucu/kablolama.ts bağlar.
export { logodaCariAra, logodanCariOku } from './isler.ts';
export { logodaTmiActi, malzemeKartiIzleri } from './sorgular.ts';
// Güvenlik Merkezi ayar denetimi (2164) yalnız bağlantının açık olup olmadığını okur; adres ve anahtar modülden çıkmaz.
export function logoBaglantisiAcikMi(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return logoAyariOku(env) !== null;
}
