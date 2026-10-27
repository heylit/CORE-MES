import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { VeriSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planAyarlari } from '../istasyonlar/disari.ts';
import { durumVeEmirler } from '../recete-rota/disari.ts';
import { vardiyaMatrisi } from '../vardiya/disari.ts';
import { planlamaCalismaKaydi } from './planlama-servis.ts';
import { veriSagligi as kural, type VeriSagligiGirdisi } from './veri-sagligi-kurallar.ts';

// Veri sağlığı raporu (782). Kaynak çağıranın yetkisiyle okunur: sunucu motorunun iç okuyucusunun verisi kimseye dönmez (ADR 0018);
// okunamayan dilimin sayısı boş gelir.
export async function veriSagligi(db: Db, kullanici: Kullanici): Promise<VeriSagligiCevabi> {
  const { durum } = await durumVeEmirler(db, kullanici);
  const planAyarli = new Set((await planAyarlari(db)).map((a) => String(a.istasyonId)));
  const vardiyali = new Set((await vardiyaMatrisi(db)).map((m) => String(m.isMerkeziId)));
  return kural({ durum, planAyarliIstasyonlar: planAyarli, vardiyaliMerkezler: vardiyali, tezgahlar: calismaTezgahlari(await planlamaCalismaKaydi(db)) });
}

// Çalışma kaydı JSON'dur ve biçimi motorundur; yalnız sayılan alanlar alınır, beklenmeyen satır atlanır.
function calismaTezgahlari(kayit: unknown): VeriSagligiGirdisi['tezgahlar'] {
  const D = (kayit as { D?: { tezgahlar?: unknown } } | null)?.D;
  if (!D || !Array.isArray(D.tezgahlar)) return null;
  const sayi = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return D.tezgahlar.flatMap((t: unknown) => {
    if (t === null || typeof t !== 'object') return [];
    const x = t as { id?: unknown; ad?: unknown; ucret?: unknown; ucretIst?: unknown };
    if (typeof x.id !== 'string') return [];
    return [{ id: x.id, ad: typeof x.ad === 'string' ? x.ad : x.id, ucret: sayi(x.ucret), ucretIst: x.ucretIst === undefined ? undefined : sayi(x.ucretIst) }];
  });
}
