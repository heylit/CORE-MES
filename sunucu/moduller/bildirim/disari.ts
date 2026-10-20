// Olayı üreten modül kendi transaction'ında çağırır; okuma dışarı açılmaz (kişinin bildirimi yalnız kendi oturumundan okunur).
export { bildirimGonder } from './servis.ts';
export type { BildirimOlayi } from './servis.ts';
