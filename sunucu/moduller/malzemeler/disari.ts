// malzemeAdlari: adı olmayan kart koduyla yer alır; olmayan kimlik haritada yok. malzemeOzeti: `birim` kartta yoksa null.
export { malzemeAdlari, malzemeOzeti, malzemeKullanilabilirMi } from './servis.ts';
// Bağlama tur 1 (kart #163): toplu özet (olmayan kimlik haritada yok), metinle sayfalı arama (stok ve rota için tek imza),
// ölçü birimi listesi (SH4 a; pasif birim eski kartta durur, yeni kayıtta seçilemez).
export { malzemeOzetleri, malzemeAra, olcuBirimleri } from './servis.ts';
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
// Kart #688: Rota'nın kendiliğinden taslak işi için kodlu operasyonu olan aktif mamul ve yarı mamul kartlar ({ no, kisiId }).
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
