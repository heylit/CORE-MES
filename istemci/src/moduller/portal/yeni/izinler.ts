import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import type { PortalKullanicisi } from './tipler.ts';

// Prototipin bölüm izinleri (portal.html v3: VIEW_PERM, ACT_PERM, SUBMIT_PERM; yalnız firma tarafı). Kişinin izinleri sunucunun
// kullanıcı kaydına yazdığı tmiIzinler'dir (TMI rolünden, kart #931). Ekran yalnız gizler; yazma ve okuma denetimi sunucudadır.

export type PortalIzni = 'sales' | 'purchase' | 'receive' | 'quality' | 'finance' | 'approve' | 'reports' | 'partners' | 'contracts' | 'admin' | 'docs';
type Gerek = PortalIzni | readonly PortalIzni[];

export const IZIN_ADLARI: Readonly<Record<PortalIzni, string>> = {
  sales: 'Satış', purchase: 'Satın alma', receive: 'Teslim alma', quality: 'Kalite', finance: 'Finans', approve: 'Onay', reports: 'Raporlar',
  partners: 'Firma yönetimi', contracts: 'Sözleşme', admin: 'Sistem yöneticisi', docs: 'Belge yönetimi',
};

// Satış ve satın alma siparişleri kalite izniyle açılmaz: kalite o bölümleri görmez, sunucu da okutmaz (kart #1162).
export const GORUNUM_IZINLERI: Readonly<Record<string, Gerek>> = {
  sales: 'sales', sale: 'sales', newsale: 'sales', sorders: ['sales', 'finance', 'receive'], pricelists: 'sales',
  purchase: 'purchase', rfq: 'purchase', newrfq: 'purchase', porders: ['purchase', 'receive', 'finance'], neworder: ['sales', 'purchase'],
  pricereqs: 'purchase', pricereq: 'purchase',
  quality: ['quality', 'purchase', 'sales'], ncr: ['quality', 'purchase', 'sales'], newncr: 'quality',
  payments: 'finance', pay: 'finance', newpay: 'finance', cheques: 'finance', accounts: 'finance', stmt: ['finance', 'sales', 'purchase', 'partners'],
  invoices: ['finance', 'purchase'], invmatch: ['finance', 'purchase'], recons: 'finance',
  contracts: ['contracts', 'sales', 'purchase', 'finance'], contract: ['contracts', 'sales', 'purchase', 'finance'], newcontract: 'contracts',
  reports: 'reports', supscore: ['reports', 'purchase', 'quality'], partners: 'partners', party: 'partners', docs: ['partners', 'docs', 'quality'],
  users: 'admin', outbox: 'admin', settings: 'admin', audit: 'admin',
};

export const EYLEM_IZINLERI: Readonly<Record<string, Gerek>> = {
  custaccept: 'sales', award: 'purchase', closerfq: 'purchase', cancelrfq: 'purchase', toorder: 'sales', termdecide: 'purchase', termupdate: 'sales',
  ship: 'sales', receive: 'receive', invoice: ['sales', 'finance'], cancelorder: ['purchase', 'sales'], paynow: 'finance',
  ncrfrom: 'quality', ncrclose: 'quality', ncrreject: 'quality', ncrremind: 'quality',
  setprice: 'sales', bulkprice: 'sales', additem: 'sales', prdecide: 'purchase', payconfirm: 'finance', payreject: 'finance', chq: 'finance', chqpaid: 'finance',
  newpay: 'finance', penalty: 'finance', invdecide: 'finance', calloff: ['purchase', 'sales'], docdecide: ['docs', 'partners', 'quality'],
  adddoc: ['docs', 'partners', 'quality'], blockparty: 'purchase', addcontact: 'partners', addact: 'partners', fudone: 'partners',
  reconsend: 'finance', reconclose: 'finance', edituser: 'admin', adduser: 'admin', saverules: 'admin', addindex: 'admin', csvaudit: 'admin',
};

export const GONDERIM_IZINLERI: Readonly<Record<string, Gerek | ((v: { type?: string }) => Gerek)>> = {
  quote: 'sales', newsale: 'sales', newrfq: 'purchase', neworder: (v) => (v.type === 'sales' ? 'sales' : 'purchase'),
  ncrresp: 'quality', newncr: 'quality', newpay: 'finance', party: 'partners', newcontract: 'contracts',
};

export interface PortalIzinleri {
  rol: string;
  unvan: string;
  izinler: readonly string[];
  roller: readonly string[];
  var: (gerek: Gerek | null | undefined) => boolean;
  gorunumAcik: (gorunum: string) => boolean;
  eylemAcik: (eylem: string) => boolean;
  gonderimAcik: (form: string, veri?: { type?: string }) => boolean;
}

export function izinKur(kullanici: Pick<PortalKullanicisi, 'role' | 'unvan' | 'tmiIzinler' | 'tmiRoller'> | null): PortalIzinleri {
  const izinler = kullanici?.tmiIzinler ?? [];
  const tam = izinler.includes('*');
  const varMi = (gerek: Gerek | null | undefined): boolean => {
    if (!gerek) return true;
    if (tam) return true;
    return (typeof gerek === 'string' ? [gerek] : gerek).some((x) => izinler.includes(x));
  };
  return {
    rol: kullanici?.role ?? '',
    unvan: kullanici?.unvan ?? kullanici?.role ?? '',
    izinler,
    roller: kullanici?.tmiRoller ?? (kullanici ? [kullanici.role] : []),
    var: varMi,
    gorunumAcik: (g) => varMi(GORUNUM_IZINLERI[g]),
    eylemAcik: (e) => varMi(EYLEM_IZINLERI[e]),
    gonderimAcik: (f, v = {}) => {
      const g = GONDERIM_IZINLERI[f];
      return varMi(typeof g === 'function' ? g(v) : g);
    },
  };
}

// Ekranın bölümleri (prototip v4 MODULES.firm), 231 a kapsamıyla: yalnız müşteri teklifleri, firma belgeleri ve onaylar taşınır.
// Taşınmayan görünüm (sipariş, ödeme, kalite, firma kartı, yönetim...) menüde yoktur; adına gelen kişi sahibinde aç özetini
// görür (sahibinde.tsx). Simgeler TMI simge setinden (203 a).
export interface AltGorunum { anahtar: string; baslik: string }
export interface Bolum { anahtar: string; baslik: string; simge: SimgeAdi; altlar: readonly AltGorunum[] }

export const BOLUMLER: readonly Bolum[] = [
  { anahtar: 'home', baslik: 'Ana sayfa', simge: 'home', altlar: [{ anahtar: 'home', baslik: 'Ana sayfa' }] },
  { anahtar: 'approvals', baslik: 'Onaylarım', simge: 'check', altlar: [{ anahtar: 'approvals', baslik: 'Onaylarım' }] },
  { anahtar: 'sales', baslik: 'Müşteri teklifleri', simge: 'tag', altlar: [{ anahtar: 'sales', baslik: 'Müşteri teklifleri' }] },
  { anahtar: 'partners', baslik: 'Firma belgeleri', simge: 'building', altlar: [{ anahtar: 'docs', baslik: 'Firma belgeleri' }] },
];

// Yeni ekranda açılan görünümler; geri kalanı sahibinde açılır.
export const TASINAN_GORUNUMLER: ReadonlySet<string> = new Set(['home', 'approvals', 'sales', 'sale', 'newsale', 'docs']);

// İzinden bağımsız açık görünümler.
const HER_ZAMAN = new Set(['home', 'approvals', 'notifprefs']);
export const altAcik = (iz: PortalIzinleri, gorunum: string): boolean => HER_ZAMAN.has(gorunum) || iz.gorunumAcik(gorunum);

// Ayrıntı ve yeni kayıt görünümlerinin bağlı olduğu liste (prototip VIEW_PARENT); sipariş türüne göre ayrılan "order" çağıranda çözülür.
export const UST_GORUNUM: Readonly<Record<string, string>> = {
  sale: 'sales', newsale: 'sales', rfq: 'purchase', newrfq: 'purchase', ncr: 'quality', newncr: 'quality', pay: 'payments', newpay: 'payments',
  pricereq: 'pricereqs', stmt: 'accounts', supscore: 'reports', party: 'partners', contract: 'contracts', newcontract: 'contracts', invmatch: 'invoices',
};

// Onay bölümü onay izni olana ya da kendi açtığı onayı izleyene görünür.
export function gorunurBolumler(iz: PortalIzinleri, kendiOnayiVar: boolean): Bolum[] {
  return BOLUMLER
    .map((b) => ({ ...b, altlar: b.altlar.filter((a) => altAcik(iz, a.anahtar)) }))
    .filter((b) => b.altlar.length > 0 && (b.anahtar !== 'approvals' || iz.var('approve') || kendiOnayiVar));
}

export function bolumunu(bolumler: readonly Bolum[], gorunum: string): Bolum | undefined {
  const ust = UST_GORUNUM[gorunum] ?? gorunum;
  return bolumler.find((b) => b.altlar.some((a) => a.anahtar === ust)) ?? bolumler.find((b) => b.anahtar === 'home');
}
