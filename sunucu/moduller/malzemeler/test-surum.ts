import type { Db } from '#cekirdek/db.ts';
import { katalogKayitSurumu } from './sorgular.ts';

// Yalnız testler için: şablon ve ayar ekranın okuduğu son sürümle yazılır. Sürüm vermeyen test isteğine kayıtlı sürümü ekler;
// testler böylece ekran gibi davranır, sürüm kuralını sınayan test sürümü kendisi verir.
export async function surumlu(db: Db, url: string, govde: unknown): Promise<unknown> {
  if (typeof govde !== 'object' || govde === null || 'surum' in govde) return govde;
  const ayar = /^\/malzeme-katalogu-ayarlari\/([^/]+)\/kaydet$/.exec(url);
  const sablon = /^\/malzeme-katalogu-sablonlari\/([^/]+)\/kaydet$/.exec(url);
  if (ayar?.[1]) return { ...govde, surum: await katalogKayitSurumu(db, 'ayar', ayar[1]) };
  if (sablon?.[1]) return { ...govde, surum: await katalogKayitSurumu(db, 'sablon', sablon[1]) };
  return govde;
}
