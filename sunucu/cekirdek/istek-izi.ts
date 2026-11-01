import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

// Fastify'ın istek günlüğü izi bu alanla taşır; iz aynı adla yazılır ki bir aramada isteğin bütün satırları çıksın.
export const IZ_ALANI = 'reqId';

const izDeposu = new AsyncLocalStorage<string>();

// Her istek günlükte bu kimlikle görünür; 5xx cevabı aynı kimliği başlıkta taşır ki kullanıcının söylediği kod günlükte bulunsun.
// Kimlik başlıktan alınmaz: istemci günlüğe istediği kimliği yazamasın. Kısa tutulur, kullanıcı okuyup söyler.
export function istekIziUret(): string {
  return randomUUID().slice(0, 8);
}

export function izIle<T>(iz: string, is: () => T): T {
  return izDeposu.run(iz, is);
}

export function etkinIz(): string | undefined {
  return izDeposu.getStore();
}

interface BagliGunluk {
  bindings(): Record<string, unknown>;
}

// pino karışımı: istek ya da iş içinde istek günlüğü dışından (uygulama günlüğü, çekirdek yardımcıları) yazılan satır da izi
// taşır. İstek günlüğü izi zaten bağlamında taşır; alan iki kez yazılmaz.
export function izKarisimi(_nesne: object, _duzey: number, gunluk?: BagliGunluk): Record<string, string> {
  const iz = izDeposu.getStore();
  if (iz === undefined) return {};
  if (gunluk !== undefined && IZ_ALANI in gunluk.bindings()) return {};
  return { [IZ_ALANI]: iz };
}

// İz işleyicinin bütün devamına geçsin diye kanca geri çağırmalıdır: söz döndüren kancanın devamı bu bağlamın dışında koşar.
export function istekIziniKur(app: FastifyInstance): void {
  app.addHook('onRequest', (istek, _yanit, bitti) => {
    izDeposu.run(istek.id, bitti);
  });
}
