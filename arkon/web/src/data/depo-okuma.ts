/* Sunucu ölçü aleti, bakım ve çizim depolarını rol başına okutur (sunucu/moduller/arkon/kurallar.ts DEPO_OKUYUCULARI). Okuyamayan
   rolün tableti isteği hiç göndermez; karar yine sunucudadır, bu yalnız boşuna 403'ü önler. Liste sunucudakiyle aynı tutulur
   (istemci/src/moduller/arkon/depo-okuma.test.ts). */
const OKUYUCULAR: Readonly<Record<string, readonly string[]>> = {
  maint: ['admin', 'plan', 'prep', 'quality', 'maint', 'lead'],
  gauges: ['admin', 'plan', 'prep', 'quality', 'lead'],
  draws: ['admin', 'plan', 'prep'],
};

export const depoOkunur = (depo: string, rol: string | null | undefined): boolean => !rol || (OKUYUCULAR[depo]?.includes(rol) ?? true);
