// Olayı üreten modül kendi transaction'ında çağırır; okuma dışarı açılmaz (kişinin bildirimi yalnız kendi oturumundan okunur).
export { bildirimGonder } from './servis.ts';
export type { BildirimOlayi } from './servis.ts';
// Arkon çağrı kaydı açılınca çağırır (298 a); alıcı Sistem Ayarları > Bildirim yönetimi'ndeki ekip rolleridir.
export { ekipCagrisiBildir } from './servis.ts';
export type { EkipCagrisi } from './servis.ts';
