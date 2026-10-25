/* Durum kaydı (events) yalnız aynı işin durumu bu tablette değişince gönderilir. İş değiştirmek ya da sayfayı yenilemek işin durumunu
   değiştirmez: yenilemeden sonra etkin iş listenin ilk işidir ve onun eski durumunu yeniden göndermek TMI'de ret bırakıyordu
   (durmuş işte "Duruş nedeni yok", duraklamış işte "Yalnız çalışan iş duraklatılır"; ikinci tarayıcı turu Y3). Eski işin
   duraklatılması iş değiştirmenin kendi kaydıdır (is-gecisi.ts). */
export interface DurumIzi { no?: unknown; state?: unknown }

export const durumKaydiGerekir = (onceki: DurumIzi | null | undefined, simdiki: DurumIzi): boolean =>
  onceki !== null && onceki !== undefined && onceki.no === simdiki.no && onceki.state !== simdiki.state;

/* T3: "bu durumda geçen süre" işin son durum kaydından (sunucudaki kayıt, tabletin saatiyle) okunur. Tabletin yerel kaydı yalnız etkin işi
   tutar: yenileme sonrası etkin iş başka iş olunca, çalışan işe geri dönünce ya da başka cihazda süre sıfırdan başlıyordu. Son kayıt işin
   bugünkü durumu değilse (kayıt henüz gitmemiş) süre bilinmez: null, ekran kendi saatini korur. */
export interface DurumKaydiSatiri { state?: unknown; at?: unknown }
export function durumBaslangici(kayitlar: readonly DurumKaydiSatiri[], durum: string): number | null {
  let son: { state?: unknown; at: number } | null = null;
  for (const k of kayitlar) if (typeof k.at === 'number' && Number.isFinite(k.at) && (son === null || k.at >= son.at)) son = { state: k.state, at: k.at };
  return son !== null && son.state === durum ? son.at : null;
}
