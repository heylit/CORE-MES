import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyInstance } from 'fastify';

interface Sayac {
  sorgu: number;
}

const istekte = new AsyncLocalStorage<Sayac>();

// Her uygulama sorgusu, içinde koştuğu isteğin sayacını artırır; istek dışındaki sorgu (göç, arka plan işi) sayılmaz.
export function sorguSayildi(): void {
  const sayac = istekte.getStore();
  if (sayac !== undefined) sayac.sorgu += 1;
}

export interface OlcumSecenegi {
  // Bu süreyi geçen uç ayrı iletiyle (uyarı) yazılır; günlükte aranacak satırlar bunlardır.
  yavasMs?: number;
}

export const YAVAS_UC_MS = 500;

// Süre kovalarının üst sınırları (ms); son kova sınırsızdır. Yüzdelik kovadan okunur: değer kovanın üst sınırıdır, gerçek süre
// ondan kısa ya da eşittir. Kova sayısı sabittir ki bellek uç sayısıyla sınırlı kalsın.
export const SURE_KOVALARI_MS = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000] as const;

export type DurumSinifi = '1xx' | '2xx' | '3xx' | '4xx' | '5xx';

// Açılıştan beri artan sayaç; dakikalık fark sağlık modülünün işidir. Anahtar uç kalıbıdır (kimlik ve sorgu dizgesi yok).
export interface UcSayaci {
  yontem: string;
  // Eşleşen uç yoksa (404) null: adres kalıpsızdır, kendisi sayılmaz.
  yol: string | null;
  sinif: DurumSinifi;
  sayi: number;
  toplamMs: number;
  // SURE_KOVALARI_MS sırasıyla, artı sınırsız kova; her istek tek kovaya girer.
  kovalar: number[];
  // 503: havuz dolu ya da veritabanına ulaşılamıyor.
  mesgul: number;
}

const ucSayaclari = new Map<string, UcSayaci>();

export function durumSinifi(durum: number): DurumSinifi {
  if (durum >= 500) return '5xx';
  if (durum >= 400) return '4xx';
  if (durum >= 300) return '3xx';
  if (durum >= 200) return '2xx';
  return '1xx';
}

export function kovaSirasi(sureMs: number): number {
  const sira = SURE_KOVALARI_MS.findIndex((ust) => sureMs <= ust);
  return sira === -1 ? SURE_KOVALARI_MS.length : sira;
}

export function istekSay(yontem: string, yol: string | null, durum: number, sureMs: number): void {
  const sinif = durumSinifi(durum);
  const anahtar = `${yontem} ${yol ?? ''} ${sinif}`;
  let sayac = ucSayaclari.get(anahtar);
  if (sayac === undefined) {
    sayac = { yontem, yol, sinif, sayi: 0, toplamMs: 0, kovalar: Array.from({ length: SURE_KOVALARI_MS.length + 1 }, () => 0), mesgul: 0 };
    ucSayaclari.set(anahtar, sayac);
  }
  sayac.sayi += 1;
  sayac.toplamMs += sureMs;
  const kova = kovaSirasi(sureMs);
  sayac.kovalar[kova] = (sayac.kovalar[kova] ?? 0) + 1;
  if (durum === 503) sayac.mesgul += 1;
}

// Kopya döner: okuyan sayacı değiştiremez.
export function istekSayaclari(): UcSayaci[] {
  return [...ucSayaclari.values()].map((s) => ({ ...s, kovalar: [...s.kovalar] }));
}

// Yavaşlık ölçülmeden hangi düzeltmenin işe yaradığı bilinmez: her cevapta süre ve sorgu sayısı yalnız yerel günlüğe
// yazılır. İstek başına tek satır budur (1748): güvenlik izi için istemci adresi ve sorgu dizgesiz yol da buradadır.
// Sorgu dizgesi günlüğe girmez: arama metni gibi kişisel veri taşıyabilir.
export function istekOlcumunuKur(app: FastifyInstance, secenek: OlcumSecenegi = {}): void {
  const yavasMs = secenek.yavasMs ?? YAVAS_UC_MS;
  const sayaclar = new WeakMap<object, Sayac>();
  // Sayaç işleyicinin bütün devamına geçsin diye kanca geri çağırmalıdır: söz döndüren kancanın devamı bu bağlamın dışında koşar.
  app.addHook('onRequest', (istek, _yanit, bitti) => {
    const sayac: Sayac = { sorgu: 0 };
    sayaclar.set(istek, sayac);
    istekte.run(sayac, bitti);
  });
  app.addHook('onResponse', (istek, yanit, bitti) => {
    const sureMs = Math.round(yanit.elapsedTime);
    const olcum = {
      yontem: istek.method,
      yol: istek.routeOptions.url ?? null,
      adres: istek.url.split('?', 1)[0] ?? '',
      ip: istek.ip,
      durum: yanit.statusCode,
      sureMs,
      sorgu: sayaclar.get(istek)?.sorgu ?? 0,
    };
    istekSay(olcum.yontem, olcum.yol, olcum.durum, sureMs);
    if (sureMs >= yavasMs) istek.log.warn(olcum, 'Yavaş uç');
    else istek.log.info(olcum, 'Uç süresi');
    bitti();
  });
}
