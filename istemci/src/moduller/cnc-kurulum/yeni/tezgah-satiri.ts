import type { Tezgah as SunucuTezgahi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { D } from './veri/cncdata.ts';
import type { Kontrol, Tezgah, TezgahTuru } from './veri/tipler.ts';

// Sunucudaki makine kaydından ekranın tezgâhı (1091 a, 1139 b, 1192). Saftır: ekranın genel durumunu (depo.ts) okumaz; düzeltmeleri
// (`mo`) çağıran verir. Ekran (secici.ts) ve Çizim Merkezi'nin CNC makineleri sayfası (1986) aynı kuralla kurar.

const MODEL_VARSAYILANI: Record<TezgahTuru, string> = { mill: 'm_vmc', lathe: 'm_lathe', millturn: 'm_tf' };
const KONTROL_ADI: Record<Kontrol, string> = { heid: 'Heidenhain', iso: 'ISO' };
const TIP_ADI: Record<TezgahTuru, string> = { mill: 'Freze', lathe: 'Torna', millturn: 'Torna-freze' };

export const tezgahKimligi = (t: Pick<SunucuTezgahi, 'makineId' | 'kod'>): string => D.MACHINES.find((m) => m.no === t.kod)?.id ?? `mk${String(t.makineId)}`;

export interface TezgahSatiri { sunucu: SunucuTezgahi; tezgah: Partial<Tezgah> & { id: string }; tam: boolean }

// Alan sırası: gömülü değer, sunucudaki ayar, düzeltme; kod ve ad yalnız İstasyonlar'dandır.
export function tezgahSatiri(t: SunucuTezgahi, mo: Partial<Tezgah> | undefined): TezgahSatiri {
  const id = tezgahKimligi(t);
  const gomulu = D.MACHINES.find((m) => m.id === id);
  const a = t.ayar;
  const ayar: Partial<Tezgah> = {};
  if (a) {
    if (a.tur !== null) ayar.type = a.tur;
    if (a.kontrol !== null) ayar.ctrl = a.kontrol;
    if (a.konik !== null) ayar.taper = a.konik;
    if (a.cepSayisi !== null) ayar.pockets = a.cepSayisi;
    if (a.devir !== null) ayar.rpm = a.devir;
    if (a.isMiliDevri !== null) ayar.spindle = a.isMiliDevri;
    if (a.canliTakim !== null) ayar.live = a.canliTakim;
    if (a.canliDevir !== null) ayar.liveRpm = a.canliDevir;
    if (a.elle !== null) ayar.manual = a.elle;
    if (a.modelTuru !== null) ayar.kind = a.modelTuru;
  }
  const duzeltme: Partial<Tezgah> = {};
  for (const [k, v] of Object.entries(mo ?? {})) if (k !== 'name' && k !== 'no' && k !== 'id' && v !== undefined) (duzeltme as Record<string, unknown>)[k] = v;
  const r: Partial<Tezgah> & { id: string } = Object.assign({}, gomulu ?? {}, ayar, duzeltme, {
    id, no: t.kod, name: t.ad, makineId: t.makineId, istasyonId: t.istasyonId,
  });
  if (r.type && !r.kind) r.kind = MODEL_VARSAYILANI[r.type];
  const tam = !!(r.type && r.ctrl && r.taper && r.pockets && r.rpm);
  if (tam && !gomulu) r.code = `${TIP_ADI[r.type!]} · ${r.taper!} · ${KONTROL_ADI[r.ctrl!]}`;
  return { sunucu: t, tezgah: r, tam };
}

// Ekranın kullanabildiği tezgâh: ayarı tam ve aktif; pasif makine yalnız seçiliyse kalır (kurulumu açılabilsin).
export const kullanilabilir = (x: TezgahSatiri, secili: string | null = null): boolean => x.tam && (x.sunucu.aktif || x.tezgah.id === secili);
