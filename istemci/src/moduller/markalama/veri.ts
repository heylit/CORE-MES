import type { MalzemeBelgeleriCevabi } from '#paylasilan/sozlesme/cizimler.ts';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import { ApiHatasi, OTURUM_BITTI } from '../../ortak/veri/api.ts';
import type { ModelBicimi } from '../cizimler/disari.ts';

// İkili cevap `api` ile okunmaz (JSON bekler); çizim modülündeki okuyucunun aynısı. `api`'ye ikili okuma eklenince kalkar.
export async function ikiliOku(yol: string, sinyal?: AbortSignal): Promise<Uint8Array> {
  const cevap = await fetch(`/api${yol}`, { credentials: 'include', ...(sinyal ? { signal: sinyal } : {}) });
  if (!cevap.ok) {
    if (cevap.status === 401) window.dispatchEvent(new CustomEvent(OTURUM_BITTI));
    let govde: unknown = null;
    try { govde = await cevap.json(); } catch { /* gövdesiz ya da vekil sayfası */ }
    const hataMi = govde !== null && typeof govde === 'object' && 'kod' in govde && 'mesaj' in govde && typeof govde.mesaj === 'string';
    throw new ApiHatasi(cevap.status, hataMi ? govde as HataGovdesi : null);
  }
  return new Uint8Array(await cevap.arrayBuffer());
}

export interface ModelSecenegi {
  belgeId: number;
  belgeAdi: string;
  revizyonId: number;
  harf: string;
  durum: string;
  bicim: ModelBicimi;
}

const BICIMLER: readonly string[] = ['step', 'iges', 'stl', 'glb', 'gltf'];
const bicimMi = (t: string): t is ModelBicimi => BICIMLER.includes(t);

// Malzemeye bağlı belgelerden üç boyutlu okunabilen revizyonlar; eski revizyon dışarıda kalır, kapak belgesi önce gelir.
export function modelSecenekleri(c: MalzemeBelgeleriCevabi): ModelSecenegi[] {
  const sirali = [...c.belgeler].sort((a, b) => Number(b.kapak) - Number(a.kapak));
  const sonuc: ModelSecenegi[] = [];
  for (const b of sirali) {
    for (const r of [...b.revizyonlar].sort((x, y) => y.sira - x.sira)) {
      if (r.durum === 'eski' || !bicimMi(r.dosyaTuru)) continue;
      sonuc.push({ belgeId: b.id, belgeAdi: b.ad, revizyonId: r.id, harf: r.harf, durum: r.durum, bicim: r.dosyaTuru });
    }
  }
  return sonuc;
}
