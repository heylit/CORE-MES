// Olayı üreten modül kendi transaction'ında çağırır; okuma dışarı açılmaz (kişinin bildirimi yalnız kendi oturumundan okunur).
// `yalnizKisiler: true` alıcıyı verilen kişilerle türü alanların kesişimine daraltır (2453); boş liste sıfır alıcıdır.
export { bildirimGonder } from './servis.ts';
export type { BildirimOlayi } from './servis.ts';
// Kaynak kaydın kararı verilince o kayda bağlı açık bildirimi bütün alıcılarda kapatır; kararı yazanın transaction'ında.
export { bildirimKapat } from './servis.ts';
export type { BildirimKapanisi } from './servis.ts';
// Arkon çağrı kaydı açılınca çağırır (298 a); alıcı Sistem Ayarları > Bildirim yönetimi'ndeki ekip rolleridir.
export { ekipCagrisiBildir } from './servis.ts';
export type { EkipCagrisi } from './servis.ts';
// İstasyona elle bildirim (2147): etkin istasyonları ve o günkü atamalarını kablolama verir (istasyonlar bu modülü ithal eder).
export { istasyonCozucusuKaydet } from './yayin.ts';
export type { IstasyonCozucusu, YayinIstasyonu } from './yayin.ts';
