// Ortak Dosyalar klasör, dosya ve klasör yetkisini başka modüle açmaz (ADR 0030): bunlar yalnız bu modülün uçlarından okunur.
// Kayda bağlı klasörler (kart 3288, ADR 0030 eki): kaynak modüllerin olay dinleyicileri ve mevcut kayıt kaynağı sunucu/kablolama.ts'te
// bunlarla bağlanır. Windows paylaşımı bağlayıcısı ayrı kart ve ADR'dir.
export { kayitEsitle, kayitKaynagiKaydet, kayitKlasoruAc, kayitKlasoruAdiniGuncelle, kayitKlasoruArsivle } from './kayit-klasorleri.ts';
export type { KayitKaynagi, KlasorSonucu } from './kayit-klasorleri.ts';
export type { FirmaBilgisi, KayitZinciri, ProjeBilgisi, SiparisBilgisi } from './kurallar.ts';
// Hazır listeler (kart 3390): sağlayıcılar kablolama.ts'te kaynakların `disari.ts`'inden kurulur.
export { aramaUyar, hazirSaglayiciKaydet } from './hazir-listeler.ts';
export type { HazirKayitSonucu, HazirSaglayici } from './hazir-listeler.ts';
