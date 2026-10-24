import type {
  CalismaSenaryosu, ExtraAlanlar, IzSatiri, PlanAgirliklari, PlanParametreleri, PlanVerisi, PlanlamaCalismasi,
} from './tipler.ts';

// Çalışma belgesinin okunması ve saf durum yardımcıları. Belge sunucuda şemasızdır (recete_rota_kayit jsonb); ekran belgeyi burada bir kez
// daraltır, görünümler yalnız tipli nesneyi görür.

// Bugünkü sayfanın yeni çalışma değerleri (a-durum.betik yeniCalisma): belgede alan yoksa sayfa bu değerle başlardı.
export const VARSAYILAN_AGIRLIK: PlanAgirliklari = { dondurma: 4, famK: 0.3, mat: 'karma', sure: 10 };
export const VARSAYILAN_PARAMETRE: PlanParametreleri = {
  tampon: true, tamponZ: 1.28, acilPay: 0.05, maxChg: 15, chgTL: 50, bolmeKip: 'otomatik', bolmeMin: 5, bolmeMaks: 3, bolmeEsik: 1000,
};
// Geri alma derinliği sayfadakiyle aynı (a-durum.betik: veri 30, plan 20).
export const VERI_GERI_ALMA = 30;
export const PLAN_GERI_ALMA = 20;

const nesneMi = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const dizi = <T>(v: unknown, uygun: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(uygun) : []);
const kimlikli = (alan: string) => (x: unknown): x is ExtraAlanlar => nesneMi(x) && typeof x[alan] === 'string';
const sayi = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const izSatiriMi = (x: unknown): x is IzSatiri => nesneMi(x) && typeof x.t === 'number' && typeof x.ne === 'string';

function veriOku(D: Record<string, unknown>): PlanVerisi {
  // Kimliksiz satır plan girdisinde eşlenemez (motor kimlikle çalışır); okunmaz.
  return {
    ...D,
    siparisler: dizi(D.siparisler, kimlikli('id')) as unknown as PlanVerisi['siparisler'],
    tezgahlar: dizi(D.tezgahlar, kimlikli('id')) as unknown as PlanVerisi['tezgahlar'],
    urunler: dizi(D.urunler, kimlikli('id')) as unknown as PlanVerisi['urunler'],
  };
}

// Kayıttaki değeri çalışmaya çevirir. Sürüm 2 ve veri nesnesi yoksa null: sayfa böyle belgeyi okumaz, yeni çalışma kurardı.
export function calismaOku(deger: unknown): PlanlamaCalismasi | null {
  if (!nesneMi(deger) || deger.surum !== 2 || !nesneMi(deger.D)) return null;
  const c = deger;
  return {
    ...c,
    surum: 2,
    D: veriOku(c.D as Record<string, unknown>),
    down: dizi(c.down, nesneMi),
    ekMesai: dizi(c.ekMesai, nesneMi),
    locks: nesneMi(c.locks) ? c.locks : {},
    pref: nesneMi(c.pref) ? c.pref : {},
    w: { ...VARSAYILAN_AGIRLIK, ...(nesneMi(c.w) ? c.w : {}) } as PlanAgirliklari,
    param: { ...VARSAYILAN_PARAMETRE, ...(nesneMi(c.param) ? c.param : {}) } as PlanParametreleri,
    kapali: dizi(c.kapali, (x): x is string => typeof x === 'string'),
    bedel: c.bedel ?? null,
    olaylar: dizi(c.olaylar, nesneMi),
    plan: nesneMi(c.plan) && sayi(c.plan.dataVer) !== null ? (c.plan as PlanlamaCalismasi['plan']) : null,
    dataVer: sayi(c.dataVer) ?? 1,
    senaryolar: dizi(c.senaryolar, kimlikli('id')) as unknown as CalismaSenaryosu[],
    canli: typeof c.canli === 'string' ? c.canli : null,
    canliSurum: sayi(c.canliSurum) ?? 0,
    tabanSurum: sayi(c.tabanSurum) ?? 0,
    iz: dizi(c.iz, izSatiriMi),
  };
}

// Plan çözüldüğü veriyle mi duruyor (a-durum.betik planGuncel): veri sonra değiştiyse plan yeniden çözülene dek bayattır.
export function planGuncel(c: PlanlamaCalismasi): boolean {
  return c.plan !== null && c.plan.dataVer === c.dataVer;
}

// Sayfanın canlı saydığı senaryo (a-durum.betik canliSen); yoksa null.
export function canliSenaryo(c: PlanlamaCalismasi): CalismaSenaryosu | null {
  return c.canli === null ? null : c.senaryolar.find((s) => s.id === c.canli) ?? null;
}

// Geri alma yığını (a-durum.betik geriAl ve planGeri): sınır aşılınca en eski düşer. Değer kopyalanmış olmalıdır (yığın değiştirmez).
export class GeriAlYigini<T> {
  readonly #sinir: number;
  #liste: T[] = [];
  constructor(sinir: number) { this.#sinir = sinir; }
  get boy(): number { return this.#liste.length; }
  koy(deger: T): void {
    this.#liste.push(deger);
    if (this.#liste.length > this.#sinir) this.#liste.shift();
  }
  al(): T | null { return this.#liste.pop() ?? null; }
  bosalt(): void { this.#liste = []; }
}
