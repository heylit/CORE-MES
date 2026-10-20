/* Sunucuya giden yazım hata alınca kaydın akıbeti: sonucu bilinmeyen hata (ağ yok, durumsuz, 401, 5xx) kuyrukta kalıp sonra yeniden gönderilir;
   sunucunun açıkça reddettiği (öteki 4xx, çözülemeyen 409 dahil) kuyruğu tıkamasın diye düşer ve bildirilir. Karar tek yerdedir (store.ts flush, Log.add,
   Docs.put, Docs.del); sunucu/moduller/arkon/kurallar.test.ts davranışı sınar. */
export type GonderimHatasi = { offline?: boolean; status?: number };

export const gonderimSonucu = (e: GonderimHatasi): 'kuyruk' | 'red' =>
  e.offline || !e.status || e.status === 401 || e.status >= 500 ? 'kuyruk' : 'red';

// Cihazlar arası ileti (Bus) kuyruğa girmez: ağ yoksa bağlantı uyarısı zaten görünür, ileti düşer. Hız sınırı (429) bir kez yeniden denenir;
// öteki ret (boyut sınırı, 4xx, 5xx) ekrana "öteki cihazlara gitmedi" diye söylenir, sessiz kalmaz.
export const ILETI_GITMEDI = 'İleti öteki cihazlara gitmedi';
export const iletiHataKarari = (e: GonderimHatasi, denendi: boolean): 'sessiz' | 'tekrar' | 'uyar' => {
  if (e.offline || !e.status) return 'sessiz';
  return e.status === 429 && !denendi ? 'tekrar' : 'uyar';
};

// Belge yazımı sunucuda reddedilince (yükleme sınırı, yetki, geçersiz kayıt) yerel kopya kalır ama sunucuya yazılmaz; ekran bunu söyler.
export const KAYIT_GITMEDI = 'Kayıt sunucuya yazılmadı';
export const KAYIT_REDDI_OLAYI = 'arkon-kayit-reddedildi';
