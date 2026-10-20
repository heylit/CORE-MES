/* Durum kaydı (events) yalnız aynı işin durumu bu tablette değişince gönderilir. İş değiştirmek ya da sayfayı yenilemek işin durumunu
   değiştirmez: yenilemeden sonra etkin iş listenin ilk işidir ve onun eski durumunu yeniden göndermek TMI'de ret bırakıyordu
   (durmuş işte "Duruş nedeni yok", duraklamış işte "Yalnız çalışan iş duraklatılır"; ikinci tarayıcı turu Y3). Eski işin
   duraklatılması iş değiştirmenin kendi kaydıdır (is-gecisi.ts). */
export interface DurumIzi { no?: unknown; state?: unknown }

export const durumKaydiGerekir = (onceki: DurumIzi | null | undefined, simdiki: DurumIzi): boolean =>
  onceki !== null && onceki !== undefined && onceki.no === simdiki.no && onceki.state !== simdiki.state;
