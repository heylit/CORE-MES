import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, gecersiz } from '#cekirdek/hata.ts';
import type { KayitAramaKaynagi } from '#paylasilan/kayit-aramasi.ts';
import type { KatalogKartDurumu } from '#paylasilan/sozlesme/malzemeler.ts';
import { malzemeAramaKaynagi } from './arama/kaynak.ts';
import { cncKimligiYaz, cncKimlikliKartlar, katalogMalzemeOzeti } from './sorgular.ts';

// malzemeAdlari: adı olmayan kart koduyla yer alır; olmayan kimlik haritada yok. malzemeOzeti: `birim` kartta yoksa null.
export { malzemeAdlari, malzemeOzeti, malzemeKullanilabilirMi } from './servis.ts';
// Bağlama tur 1 (kart #163): toplu özet (olmayan kimlik haritada yok), metinle sayfalı arama (stok ve rota için tek imza),
// ölçü birimi listesi (SH4 a; pasif birim eski kartta durur, yeni kayıtta seçilemez).
export { malzemeOzetleri, malzemeAra, olcuBirimleri } from './servis.ts';
// Genel arama (Ctrl K, 1233): çekirdek bu listeyi ad kuralıyla bulur; yetkiyi çekirdek denetler.
export const kayitAramaKaynaklari: readonly KayitAramaKaynagi<Db>[] = [malzemeAramaKaynagi];
// 1247 d: satın alma kabulünde giriş kalite kontrolü isteyen kartlar.
export { gkkGerekenKartlar } from './servis.ts';
// Logo bağlantısı (kart #232): kuyruğu okur, her kartın sonucunu bildirir. Yetki denetlemez; nasıl kullanılacağı NOTLAR.md "Logo bağlantısı".
export { logoyaGidecekMalzemeler, malzemeLogoSonucu } from './servis.ts';
// Logo modülü birim setini kaldırmadan önce: set bir birim karşılığında kullanılıyor mu (kart #207 isteği madde 4).
export { logoBirimSetiKullaniliyorMu } from './servis.ts';
export type { LogoyaGidecekMalzeme, MalzemeLogoSonucu } from './servis.ts';
// Logo'da ad güncellemesi (kart #783, S4 b): Logo'ya gitmiş kartın adı değişince kuyruğa girer; sonuçta gönderilen ad verilir,
// ad bu arada yine değiştiyse güncelleme bekliyor kalır. Yetki denetlemez.
export { logoyaGuncellemeGidecekMalzemeler, malzemeLogoGuncellemeSonucu } from './servis.ts';
export type { LogoyaGuncellemeGidecekMalzeme } from './servis.ts';
export type { LogoGuncellemeSonucu } from './kurallar.ts';
// Kart #688: kartın Operasyonlar adımı, rota taslağı açmak için ({ no, kod, ad }, no sırasıyla); kart yoksa null.
export { malzemeOperasyonlari } from './servis.ts';
// Kart #688: Rota'nın kendiliğinden taslak işi için kodlu operasyonu olan aktif mamul ve yarı mamul kartlar ({ no, kisiId }; kişi
// kartı onaya gönderen, yoksa açan: soru 520 2 b).
export { operasyonluAktifKartlar } from './servis.ts';
export type { KartOperasyonu } from './kurallar.ts';
// Üretim emirleri numara kuralı (kart #802): kurumun firma kodu ya da null.
export { firmaKodu } from './servis.ts';
// Örnek veri (kart #906): stok kodundan kart no; örnek kartın no'su anahtarla (stok kodunu sunucu verir, firma kodu ayarı değiştirir).
export { malzemeNoKoddan, ornekMalzemeNo } from './servis.ts';
export { ORNEK_MALZEME_ANAHTARLARI } from './kurallar.ts';
export type { OrnekMalzemeAnahtari } from './kurallar.ts';
// Satın almanın kg fiyatı (19.10.2026): kartın kalite, aile, form ve stok birimi (olmayan kart haritada yok; hammadde dışında kalite
// ve form null); kullanılan kaliteler aktif hammadde kartlarından, kart sayısıyla. birimKg bugün null (ağırlık sunucuda yok). Yetki denetlemez.
export { malzemeMaliyetBilgileri, kullanilanKaliteler } from './servis.ts';
export type { MalzemeMaliyetBilgisi } from './servis.ts';
export type { KullanilanKaliteSatiri as KullanilanKalite } from './sorgular.ts';
// 233 a: Rota kartın revizyonlarını veren işlevi kaydeder (Malzemeler Rota'yı ithal edemez); bağ sunucu/kablolama.ts'te.
export type { RotaRevizyonlariCozucusu } from './servis.ts';
export { rotaRevizyonlariCozucusuKaydet as rotaRevizyonlariCozucusu } from './servis.ts';
// 1104 a: satın almanın talep, teklif ve siparişte gösterdiği kart ayrıntısı (kalite, standart, tolerans, durum, yüzey, sertifikalar, en az sipariş ...).
// Kartın sürümü de döner: satın alma siparişteki kopyanın karttan geri kaldığını bununla bilir (1105 a). İptal ve olmayan kart haritada yok.
export { malzemeSatinAlmaAyrintilari } from './servis.ts';
export type { MalzemeSatinAlmaAyrintisi } from './servis.ts';
// 1469 a: 3D Atölyesi'nin ham önerisi için aktif hammadde kartlarının formu ve ölçüleri (`dims` olduğu gibi). Yetki denetlemez.
export { hammaddeStokOlculeri } from './servis.ts';
export type { HammaddeStokOlcusu } from './servis.ts';
// Kart #688: çizim merkezi resmi kartla teknik resim no ve revizyonla eşler. Yalnız yarı mamul ve mamulde dolu; boş ya da yalnız
// boşluk null; olmayan kart haritada yok. Yetki denetlemez.
export { malzemeResimAnahtarlari } from './servis.ts';
export type { MalzemeResimAnahtari } from './servis.ts';
// 323 b: kartın alış birimi ve katsayısı (1 alış birimi = katsayı kadar stok birimi); Satın alma siparişi tedarikçinin biriminde girer,
// stoka kartın biriminde düşer. Yetki denetlemez.
export { malzemeBirimDonusumleri } from './servis.ts';
export type { MalzemeBirimDonusumu } from './servis.ts';
// CNC takım stoğu (153 a, 163 b): prototipin kütüphane kimliği karta bağlanır; CNC kurulumu stoğu bu bağla okur. Kart seçimi
// `malzemeAra` (sarf, demirbaş) ile. Yetki denetlemez; bağı yazan çağıran kart yazma işlemini korur.
export interface CncKimlikliMalzeme { malzemeId: number; kod: string; ad: string | null; birim: string | null; onayDurumu: KatalogKartDurumu }
// Kimlik listesi verilmezse bütün bağlı kartlar döner (CNC kurulumu kütüphanesini sunucuda bilmez).
export async function cncKimlikliMalzemeler(db: Db, kimlikler?: readonly string[]): Promise<Map<string, CncKimlikliMalzeme>> {
  if (kimlikler?.length === 0) return new Map();
  return new Map((await cncKimlikliKartlar(db, kimlikler === undefined ? null : [...new Set(kimlikler)])).map((k) => [k.cncKimligi, { malzemeId: k.id, kod: k.kod, ad: k.ad, birim: k.birim, onayDurumu: k.onayDurumu }]));
}
// Kimlik başka kartta bağlıysa oradan kalkar; null kartın bağını kaldırır. Bağı kalkan önceki kart döner.
export async function cncKimligiBagla(db: Db, malzemeId: number, kimlik: string | null): Promise<{ oncekiMalzemeId: number | null }> {
  const r = await cncKimligiYaz(db, malzemeId, kimlik);
  if (r.bagli) return { oncekiMalzemeId: r.oncekiNo };
  if ((await katalogMalzemeOzeti(db, malzemeId)) === null) throw bulunamadi('Malzeme kartı bulunamadı.');
  throw gecersiz('CNC kütüphanesine yalnız sarf ve demirbaş kartı bağlanır.');
}
