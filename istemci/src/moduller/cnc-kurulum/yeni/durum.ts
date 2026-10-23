import { D } from './veri/cncdata.ts';
import type { IsMalzemesi, Kalem, Tezgah, TezgahTuru } from './veri/tipler.ts';

// Prototipin bütün durumu: tek kayıt (`cnc-kurulum-motoru.v1`), eski ekranla aynı şema (soru 204 a). Görünümlere ait alanların
// (`cam`, `gsim*`, `prep`, `mstat`, `suProf`...) iç yapısını görünüm kendi tipiyle okur; açılış varsayılanları ise prototipte
// betik yüklenirken bütün görünümler için uygulanır, bu yüzden burada tek yerdedir (acilisVarsayimlari).
export const DURUM_ANAHTARI = 'cnc-kurulum-motoru.v1';

export interface Baglama { fixture: string; jaw: string; zero: string }
export interface KalemStogu { qty?: number | null; min?: number; tmiStok?: { malzemeId: number; kod?: string; ad?: string | null; birim?: string | null } | null; [alan: string]: unknown }

export interface CncDurumu {
  machine: string;
  material: string;
  coolant: string;
  byType: Partial<Record<TezgahTuru, Baglama>>;
  wcs: Record<string, string>;
  // Tezgâh başına magazin: cep sırasıyla takım kimliği ('empty' boş cep).
  tools: Record<string, string[]>;
  gauges: string[];
  cons: string[];
  meta: { part: string; prog: string; op: string; stock: string; [alan: string]: unknown };
  // Tezgâh düzeltmeleri (Tanımlar): tezgâh kimliği → değişen alanlar.
  mo: Record<string, Partial<Tezgah>>;
  inv: Record<string, KalemStogu | undefined>;
  // Tezgâhta elle kullanılan adet (magazin dışı): tezgâh → kalem → adet.
  active: Record<string, Record<string, number>>;
  custom: Kalem[];
  customMachines: Tezgah[];
  customMats: IsMalzemesi[];
  matO: Record<string, Partial<IsMalzemesi>>;
  stock: StokAyari;
  life: OmurAyari;
  gsim: unknown;
  [alan: string]: unknown;
}

// Ham Malzeme ayarı (prototipte STOCK_DEF). Sayı alanları formdan metin olarak da gelebilir ('' boş); okuyan num() ile çevirir.
type SayiAlani = number | string;
export interface StokAyari {
  type: string; ax: SayiAlani; ay: SayiAlani; az: SayiAlani; uni: boolean; round: SayiAlani; plate: boolean; axis: string;
  dAllow: SayiAlani; face: SayiAlani; cut: SayiAlani; barStd: boolean; idAllow: SayiAlani; idStep: SayiAlani; idMan: SayiAlani;
  mat: string; rho: SayiAlani; qty: SayiAlani; price: SayiAlani; mx: SayiAlani; my: SayiAlani; mz: SayiAlani; mvol: SayiAlani;
  axV?: number;
  [alan: string]: unknown;
}
export const STOCK_DEF: Readonly<StokAyari> = {
  type: 'block', ax: 3, ay: 3, az: 3, uni: true, round: 5, plate: true, axis: 'auto', dAllow: 2, face: 2, cut: 3, barStd: true, idAllow: '',
  idStep: 1, idMan: '', mat: '', rho: '', qty: 1, price: '', mx: '', my: '', mz: '', mvol: '',
};

// Takım Ömrü ayarı (prototipte LIFE_DEF).
export interface OmurAyari {
  sel: string; mat: string; cool: string; vc: SayiAlani; f: SayiAlani; ap: SayiAlani; ae: SayiAlani; ld: SayiAlani; vb: SayiAlani; rel: SayiAlani;
  tp: SayiAlani; batch: SayiAlani; price: SayiAlani; uses: SayiAlani; tc: SayiAlani; rate: SayiAlani; cal: Record<string, number>; mode: string;
  trel: SayiAlani; perDay: SayiAlani; psel: number;
  [alan: string]: unknown;
}
// Prototip her açılışta bu nesneleri yeniden kurar (sayfa yeniden yüklenir); burada ekran aynı oturumda yeniden kurulabildiği için
// iç nesneler (cal, prm...) her uygulamada yenidir, önceki açılıştan değişmiş nesne taşınmaz.
const lifeDef = (): OmurAyari => ({
  sel: '', mat: '', cool: '', vc: '', f: '', ap: '', ae: '', ld: 3, vb: 0.3, rel: 90, tp: '', batch: 100, price: '', uses: '', tc: 1, rate: 1500,
  cal: {}, mode: 'track', trel: 80, perDay: '', psel: 0,
});
export const LIFE_DEF: Readonly<OmurAyari> = lifeDef();

const gsimOptDef = () => ({
  rapid: 30000, dialect: 'auto', lathe: false, removal: true, showRapid: true, follow: false, speed: 'auto', stockSrc: 'blk', hamOrigin: 'tlf',
  showPart: true, compare: true,
});
const camDef = () => ({ prm: {}, dialect: '', cal: {}, vis: {}, sel: 0 });
const camScDef = () => ({ meas: 'probe', jaw: 'std', fix: 'vise', kit: 'yes', job: 'repeat', op: 'exp', qc: 'op', tol: 'fine', faiw: 'wait' });

const alanNesnesi = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' ? v as Record<string, unknown> : {});

// Prototipin betik yüklenirken duruma uyguladığı varsayılanlar, prototipteki sırayla (satır 18517-18518, 19069-19071, 19646-19647,
// 22797, 23204, 23864-23866, 24075). Kayıt yüklendikten hemen sonra bir kez uygulanır.
export function acilisVarsayimlari(s: CncDurumu): void {
  s.stock = Object.assign({}, STOCK_DEF, s.stock || {});
  if (s.stock.axV !== 3) { s.stock.axis = 'auto'; s.stock.axV = 3; }
  s['gsimOpt'] = Object.assign(gsimOptDef(), s['gsimOpt'] || {});
  const gtools = s['gtools'];
  if (!gtools || !alanNesnesi(gtools)['__v2']) s['gtools'] = { __v2: 1 };
  if (s['gstock'] && !s['gstockMan']) { s['gstockMan'] = s['gstock']; delete s['gstock']; }
  s.life = Object.assign(lifeDef(), s.life || {});
  if (!s.life.cal) s.life.cal = {};
  s['wear'] = s['wear'] || {};
  s['wearLog'] = s['wearLog'] || [];
  const cam = Object.assign(camDef(), s['cam'] || {}) as Record<string, unknown>;
  s['cam'] = cam;
  cam['mtMill'] = cam['mtMill'] || 'same';
  if (cam['suV'] !== 2) { cam['su'] = {}; cam['suV'] = 2; }
  cam['su'] = cam['su'] || {};
  cam['sc'] = Object.assign(camScDef(), cam['sc'] || {});
  s['suProf'] = s['suProf'] || {};
}

export function defaults(): CncDurumu {
  return {
    machine: 'f5a', material: 'c45', coolant: 'bor5',
    byType: { mill: { fixture: 'vise125', jaw: 'j_hard', zero: 'z_probe' }, lathe: { fixture: 'ch3', jaw: 'lj_hard', zero: 'z_arm' }, millturn: { fixture: 'ch3', jaw: 'lj_soft', zero: 'z_probe' } },
    wcs: { heid: 'p1', iso: 'g54' }, tools: {}, gauges: ['g_cal', 'g_mic', 'g_dial'], cons: ['c_bez', 'c_cap', 'c_eld', 'c_goz'],
    meta: { part: '', prog: '', op: '', stock: '' }, mo: {}, inv: {}, active: {}, custom: [], customMachines: [], customMats: [], matO: {},
    // Boş kalır; acilisVarsayimlari doldurur (prototipte de varsayılan boştur, betik yüklenirken dolar).
    stock: {} as StokAyari, life: {} as OmurAyari, gsim: null,
  };
}

const nesneMi = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

// Kayıt prototipin açılışındaki gibi varsayılanlarla birleşir. Prototip `Object.assign(df, kayit)`tan sonra byType, wcs ve
// meta'yı `df`nin (artık kaydın) alanına birleştirir: sonuç kaydın alanının kendisidir, eksik alt alan varsayılanla dolmaz.
// Aynı sonuç burada açıkça yazılır; kayıtta olmayan ya da nesne olmayan alan varsayılan kalır. Okunamayan kayıt varsayılandır.
export function durumBirlestir(kayit: unknown): CncDurumu {
  const df = defaults();
  if (!nesneMi(kayit)) return df;
  const s = Object.assign(df, kayit) as CncDurumu;
  const ilk = defaults();
  if (!nesneMi(kayit['byType'])) s.byType = ilk.byType;
  if (!nesneMi(kayit['wcs'])) s.wcs = ilk.wcs;
  if (!nesneMi(kayit['meta'])) s.meta = ilk.meta;
  return s;
}

// Kayıt metni (sunucudan gelen JSON metni) durum olur; bozuk metin varsayılandır.
export function durumOku(metin: string | null | undefined): CncDurumu {
  if (metin == null || metin === '') return defaults();
  try { return durumBirlestir(JSON.parse(metin) as unknown); } catch { return defaults(); }
}

export { D };
