import type { SiparisLogo } from '#paylasilan/sozlesme/satin-alma.ts';
/**
 * Sunucu ve arayüzün ortak veri tipleri.
 * Arayüz talepleri "toplu kayıt" (aggregate) olarak işler: kalemler, teklif istekleri,
 * teklifler, karar ve hareket geçmişi talebin içinde gelir. Sunucu bunları
 * normalleştirilmiş PostgreSQL tablolarına yazar ve geri birleştirir.
 */

export const CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const REQUEST_STATUSES = ["draft", "rfq", "eval", "approval", "ordered", "received", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const PRIORITIES = ["low", "normal", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SUPPLIER_STATUSES = ["approved", "trial", "suspended"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const QUALITIES = ["ok", "partial", "rejected"] as const;
export type Quality = (typeof QUALITIES)[number];

export type AwardMode = "single" | "split";
export type ApprovalDecision = "approved" | "rejected";

/** Tarih alanları "YYYY-MM-DD" metni, zaman damgaları milisaniye cinsinden sayıdır. */
export type DateStr = string;

export interface Weights { cost: number; lead: number; supplier: number; warranty: number }
/** Güncel kur finanstan gelir (SA3 a); finansta kuru olmayan para biriminde boş. */
export interface CurrencySetting { rate: number | null; monthly: number }
export interface DepartmentSetting { name: string; budget: number }
export interface ApprovalLimit { max: number | null; role: string }

export interface Settings {
  company: string;
  currencies: Record<Currency, CurrencySetting>;
  weights: Weights;
  validityDays: number;
  minQuotes: number;
  priceAlertPct: number;
  ratesDate: DateStr;
  categories: string[];
  departments: DepartmentSetting[];
  approvalLimits: ApprovalLimit[];
  version?: number;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  spec: string;
  notes: string;
  aliases: string[];
  /** SA2: katalog kalemi bir malzeme kartına bağlıdır; kod, ad, kategori ve birim karttan okunur. */
  malzemeNo?: number;
  sample?: boolean;
  createdAt: number;
  updatedAt?: number;
  version?: number;
}

/** Katalog kalemi eklerken aranan malzeme kartı; katalogId doluysa kart zaten katalogdadır. */
/** D6 b: siparişin tedarikçisinin finanstaki alış faturası; tutar gelmez (FNS-48) */
export interface SiparisFaturasi { id: number; belgeNo: string | null; belgeTarihi: string; aciklama: string | null; bagli: boolean; baskaSipariste: boolean }
export interface MalzemeSecenegi { no: number; kod: string; ad: string; birim: string | null; kategori: string | null; katalogId: string | null }

export interface SupplierEval {
  id: string;
  date: DateStr;
  rating: number;
  text: string;
  name: string;
  by: string;
}

export interface Supplier {
  id: string;
  name: string;
  categories: string[];
  contact: string;
  phone: string;
  email: string;
  city: string;
  taxNo: string;
  status: SupplierStatus;
  /** Finans firma kartının aktifliği; sunucudan gelir, yazılmaz. Boşsa bilinmiyor (pasif sayılmaz). */
  active?: boolean;
  rating: number;
  notes: string;
  evals: SupplierEval[];
  sample?: boolean;
  createdAt: number;
  updatedAt?: number;
  version?: number;
}

export interface RequestItem {
  id: string;
  materialId?: string | null;
  name: string;
  spec: string;
  qty: number | null;
  unit: string;
  category?: string;
}

export interface Rfq { supplierId: string; sentAt: DateStr; dueDate: DateStr }

export interface Quote {
  id: string;
  supplierId: string;
  supplierName: string;
  date: DateStr;
  validUntil: DateStr;
  currency: Currency;
  fxRate: number | null;
  /** kalem kimliği → birim fiyat (teklif para biriminde, KDV hariç) */
  prices: Record<string, number>;
  discountPct: number;
  shipping: number;
  otherCost: number;
  deliveryTerm: string;
  deliveryIncluded: boolean;
  leadDays: number | null;
  payDays: number;
  advancePct: number;
  warrantyMonths: number | null;
  compliant: boolean;
  note: string;
  firstTotal?: number;
  revisions?: number;
  createdAt?: number;
}

export interface Approval {
  id: string;
  at: number;
  by: string;
  name: string;
  decision: ApprovalDecision;
  note: string;
}

/** Kalem bazlı kararda her tedarikçiye (teklife) ayrı sipariş ve teslimat */
export interface AwardOrder {
  /** TMI'nin verdiği sipariş numarası (numara kuralı); sunucu yazar. poNo Logo / tedarikçi numarasıdır. */
  orderNo?: string;
  poNo?: string;
  orderDate?: DateStr;
  expectedDate?: DateStr;
  deliveredDate?: DateStr;
  quality?: Quality | "";
  excess?: ExcessLine[];
  /** Siparişin Logo durumu (#205 karar 1); sunucu yazar, Logo'ya sıraya girmemiş siparişte yok. */
  logo?: SiparisLogo | null;
}

/** Kalanı aşan teslim reddedilmez; sipariş satırında "fazla teslim" olarak görünür. */
export interface ExcessLine { item: string; qty: number; unit: string }

export interface Award {
  mode: AwardMode;
  quoteId: string | null;
  /** kalem kimliği → teklif kimliği (kalem bazlı kararda) */
  splits?: Record<string, string>;
  reason: string;
  by: string;
  decidedAt: DateStr;
  approvals?: Approval[];
  orderNo?: string;
  poNo?: string;
  orderDate?: DateStr;
  expectedDate?: DateStr;
  deliveredDate?: DateStr;
  quality?: Quality;
  excess?: ExcessLine[];
  logo?: SiparisLogo | null;
  lessons?: string;
  /** Sipariş anında sabitlenen kurlar (para birimi → TL). Açık taleplerde güncel kur kullanılır. */
  fx?: Record<string, number>;
  /** teklif kimliği → sipariş (yalnızca kalem bazlı kararda) */
  orders?: Record<string, AwardOrder>;
  /** Sipariş satırları (sunucu kimliğiyle): sertifika ve rapor satıra bağlanır. */
  lines?: OrderLine[];
}

export interface OrderLine { id: number; itemId: string; quoteId: string }

export interface LogEntry { id: string; at: number; by: string; t: string }

/** Dağıtım denemesinde kaydedilen senaryo: kalem → teklif → miktar */
export interface SimScenario {
  id: string;
  name: string;
  alloc: Record<string, Record<string, number>>;
  itemBal?: Record<string, number | null>;
  createdAt: number;
  by: string;
}

export interface PurchaseRequest {
  id: string;
  no: string;
  title: string;
  department: string;
  requester: string;
  priority: Priority;
  needDate: DateStr;
  notes: string;
  status: RequestStatus;
  cancelReason?: string;
  /** Kart #1310: malzemeyi tedarikçi mi getirir, biz mi alırız; boş: belirtilmedi. */
  teslimYontemi?: 'firma_getirir' | 'biz_alacagiz' | null;
  /** Talebin açıldığı üretim emri (boş: bağlı değil); merkez değiştirmez, kaydederken olduğu gibi geri yollar. */
  uretimEmriId?: number | null;
  uretimEmriNo?: string | null;
  weights?: Weights | null;
  items: RequestItem[];
  rfqs: Rfq[];
  quotes: Quote[];
  award?: Award | null;
  log: LogEntry[];
  /** dağıtım denemesi senaryoları (kararı etkilemez) */
  scenarios?: SimScenario[];
  sample?: boolean;
  createdAt: number;
  updatedAt?: number;
  version?: number;
}

export interface AppUser { id: string; email: string; name: string }

export interface Bootstrap {
  requests: PurchaseRequest[];
  suppliers: Supplier[];
  materials: Material[];
  settings: Settings;
  users: AppUser[];
  me: AppUser | null;
}

/** Sunucunun LISTEN/NOTIFY üzerinden yayınladığı değişiklik olayı */
export interface ChangeEvent {
  table: "purchase_request" | "supplier" | "material" | "app_settings";
  id: string;
  op: "insert" | "update" | "delete";
}

/** Dışa/içe aktarma biçimi (tarayıcı sürümünün JSON yedeğiyle uyumlu) */
export interface ExportFile {
  app?: string;
  version?: number;
  exportedAt?: string;
  requests: Record<string, PurchaseRequest> | PurchaseRequest[];
  suppliers: Record<string, Supplier> | Supplier[];
  materials: Record<string, Material> | Material[];
  settings?: Partial<Settings> | null;
}
