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
    if (sureMs >= yavasMs) istek.log.warn(olcum, 'Yavaş uç');
    else istek.log.info(olcum, 'Uç süresi');
    bitti();
  });
}
