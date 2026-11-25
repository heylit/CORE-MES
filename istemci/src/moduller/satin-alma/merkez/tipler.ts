import type { SiparisDegisikligi, SiparisOnerisi, AlternatifSonucu, SiparisLogo, TeklifAlternatifi, VadeBaslangici } from '#paylasilan/sozlesme/satin-alma.ts';
import type { SiparisOdemeYontemi } from '#paylasilan/sozlesme/finans.ts';
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

// 3279 a: "unregistered" Kalite Merkezi'nde kaydı olmayan firmadır; onaylı sayılmaz.
export const SUPPLIER_STATUSES = ["approved", "trial", "suspended", "unregistered"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const QUALITIES = ["ok", "partial", "rejected"] as const;
export type Quality = (typeof QUALITIES)[number];

export type AwardMode = "single" | "split";
export type ApprovalDecision = "approved" | "rejected";

/** Tarih alanları "YYYY-MM-DD" metni, zaman damgaları milisaniye cinsinden sayıdır. */
export type DateStr = string;

export interface Weights { cost: number; lead: number; supplier: number; warranty: number }
/** Güncel kur finanstan gelir (SA3 a); finansta kuru olmayan para biriminde boş. */
export interface CurrencySetting { rate: number | null; monthly: number | null }
export interface DepartmentSetting { name: string; budget: number }
// rolId: basamağı onaylayan rol (2397 b; null rolsüz, undefined bilinmiyor); rolAdi yalnız okumadır, sunucu verir.
// kisiler: basamağa yazılı kişiler (3442-7b a; undefined bilinmiyor, kayıtta gönderilmez ve sunucu eskisini korur).
export interface ApprovalLimit { max: number | null; role: string; rolId?: number | null; rolAdi?: string | null; kisiler?: { id: number; ad: string }[] }

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
  // Basamak denetimi (sistem ayarı satin-alma.onay-kademesi); burada yalnız gösterilir.
  onayKademesi?: boolean;
  // Dört göz (sistem ayarı satin-alma.dort-goz); sipariş değişikliği penceresinin tahmininde kullanılır, kesin karar sunucudadır.
  dortGoz?: boolean;
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
  /** Kalite Merkezi'nin onay durumu (236 a); sunucudan gelir, yazılmaz. Kaydı yoksa null. */
  kaliteDurumu?: string | null;
  /** Finans firma kartının aktifliği; sunucudan gelir, yazılmaz. Boşsa bilinmiyor (pasif sayılmaz). */
  active?: boolean;
  /** Elle verilen 1-5 puan; verilmemişse null (2157-1 a). */
  rating: number | null;
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
  /** Hizmet kaleminin bağları (2429): uygulanan parça ve fason adımı; yalnız okunur, kayıtta gönderilmez. */
  parca?: { no: number; kod: string | null; ad: string | null; revizyon?: string | null } | null;
  fason?: { emirNo: string | null; opNo: number | null; adim: string | null; firmaAdi: string | null } | null;
  /** 3100: yaklaşık karşılık metni ("≈ 4 adet", "≈ 12,5 kg"); sunucu hesaplar, yalnız okunur, kayıtta gönderilmez. */
  karsilik?: string | null;
  /** 3121: kartın kalite, durum, işlem ve ölçüsü (bugünkü hâli); kartsız kalemde yok. Yalnız okunur. */
  malzeme?: MalzemeOzelligi;
  /** 3593: talep edenin işaretlediği alternatif kartları (işaretlendiği hâliyle: ad, tür, özet). Yalnız okunur, kayıtta gönderilmez. */
  alternatifler?: { setId: number | null; ad: string; tur: 'tam' | 'ust' | 'sartli'; ozet: string }[];
  /** 3696: kalemin kendi istenen termini (talepten farklıysa); boşsa talebin terminidir. Yalnız okunur, kayıtta gönderilmez. */
  istenenTermin?: string;
  /** 3442-5: kimliği değişmemesi gereken kalem (parça, fason, die ya da satış siparişi bağı; birleşik talebin kaynak kalemi). Yalnız okunur. */
  sabit?: "bag" | "kaynak";
}

/** 3121: satın alma tablolarında ayrı sütun olan kart alanları; `kayitsiz` sipariş kopyası işlem ve ölçüden önce alınmış demektir. */
export interface MalzemeOzelligi {
  kalite: string | null; durum: string | null; islem: string | null; olcu: string | null; aciklama: string | null;
  /** 3133: kart föyündeki ayrıntılar, föy sırasıyla; boş alan yok. */
  ayrinti: { ad: string; deger: string }[]; kayitsiz?: boolean;
}

export interface Rfq { supplierId: string; sentAt: DateStr; dueDate: DateStr }

export interface PriceTier { min: number; price: number }

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
  /** Kademeli fiyat (2975): kalem kimliği → "eşik ve üstü" ek basamaklar; taban basamak `prices`'tır. */
  tiers?: Record<string, PriceTier[]>;
  /** 2974-1 a: ilk basamağın eşiği satırın en az miktarıdır; talep altında kalırsa alınan miktar eşiğe yükselir.
   *  Anahtarı olmayan kalemde alan gönderilmez (sunucu saklananı korur); null temizler. */
  minQty?: Record<string, number | null>;
  /** 3437 a: kalem kimliği → teklif edilen alternatif (boş nitelik istenenle aynı); null alternatifi kaldırır. */
  alternatives?: Record<string, TeklifAlternatifi | null>;
  /** 3437 a: sunucunun hesapladığı sonuç (yalnız okunur). */
  altResults?: Record<string, AlternatifSonucu>;
  discountPct: number;
  shipping: number;
  otherCost: number;
  deliveryTerm: string;
  deliveryIncluded: boolean;
  leadDays: number | null;
  payDays: number;
  advancePct: number;
  /** Ödeme yöntemi; boş belirtilmedi. Alan yoksa sunucu saklananı korur. */
  payMethod?: SiparisOdemeYontemi | null;
  warrantyMonths: number | null;
  compliant: boolean;
  note: string;
  firstTotal?: number;
  revisions?: number;
  createdAt?: number;
  /** 3574-1 (R2): siparişte eklenen firmanın kaydı; teklif sayısına, karşılaştırmaya ve analize girmez. Yalnız okunur. */
  source?: "siparis";
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
  /** 2417: vade teslimattan (varsayılan) ya da siparişten sayılır */
  vadeBaslangici?: VadeBaslangici;
  deliveredDate?: DateStr;
  quality?: Quality | "";
  excess?: ExcessLine[];
  /** Siparişin Logo durumu (#205 karar 1); sunucu yazar, Logo'ya sıraya girmemiş siparişte yok. */
  logo?: SiparisLogo | null;
  /** 3574-1: firma başlığı; tedarikçiye not sipariş metnine girer, iç not girmez. */
  teslimYeri?: string;
  tedarikciNotu?: string;
  icNot?: string;
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
  vadeBaslangici?: VadeBaslangici;
  deliveredDate?: DateStr;
  quality?: Quality;
  excess?: ExcessLine[];
  logo?: SiparisLogo | null;
  /** 3574-1: tek siparişin firma başlığı (bölünmüş kararda orders içinde). */
  teslimYeri?: string;
  tedarikciNotu?: string;
  icNot?: string;
  lessons?: string;
  /** Sipariş anında sabitlenen kurlar (para birimi → TL). Açık taleplerde güncel kur kullanılır. */
  fx?: Record<string, number>;
  /** Karar onaya gönderilince sunucunun kuru ve aylık faizi sabitlediği an (yalnız okunur); eski kararlarda yok. */
  kurKilidi?: string | null;
  /** Sabitlenen aylık faiz (para birimi → yüzde); finansta faiz yoksa boş. */
  sabitFaiz?: Record<string, number | null>;
  /** teklif kimliği → sipariş (yalnızca kalem bazlı kararda) */
  orders?: Record<string, AwardOrder>;
  /** Sipariş satırları (sunucu kimliğiyle): sertifika ve rapor satıra bağlanır. */
  lines?: OrderLine[];
}

/** Sipariş satırı; miktar ve stokta kabul edilen miktar Siparişler sayfası (2430) içindir, sunucuya geri gitmez. */
/** parcaRevizyonu: sipariş anında sabitlenen parça revizyonu (2881); yalnız okunur. */
export interface OrderLine { id: number; itemId: string; quoteId: string; qty?: number; unit?: string; received?: number | null; parcaRevizyonu?: string | null; malzeme?: MalzemeOzelligi;
  /** 3574-1: satırın kendi termini (boşsa siparişin) ve notu; yalnız okunur. */
  expectedDate?: string | null; note?: string }

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
  /** 3571: talebin çizim sayısı (ilk tabloda ataç); yalnız okunur. */
  cizimSayisi?: number;
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
  projeId?: number | null;
  /** 2876: güncelleme grubu (kök önce; tek üyeli grup yok); sunucu yazar, merkez yalnız gösterir. */
  guncellemeGrubu?: { id: string; no: string; status: RequestStatus; kok: boolean }[];
  /** 3590: talebin ayrıldığı talep ve ondan ayrılanlar (kararın bir kısmı onaya gidince kalan kalemler); sunucu yazar. */
  ayrilma?: { ayrildigi: { id: string; no: string } | null; ayrilanlar: { id: string; no: string; kalemSayisi: number }[] };
  weights?: Weights | null;
  items: RequestItem[];
  rfqs: Rfq[];
  quotes: Quote[];
  award?: Award | null;
  log: LogEntry[];
  /** dağıtım denemesi senaryoları (kararı etkilemez) */
  scenarios?: SimScenario[];
  /** 3574-1 (S1 a): onay bekleyen sipariş; yalnız okunur. */
  siparisOnerisi?: SiparisOnerisiEkrani | null;
  /** 3574-2a: teklif kimliği → siparişin değişiklik numarası, KDV oranı ve geçmişi (fiyat görmeyene gelmez). */
  siparisGecmisi?: Record<string, SiparisGecmisiEkrani>;
  sample?: boolean;
  createdAt: number;
  updatedAt?: number;
  version?: number;
}

export interface SiparisGecmisiEkrani { no: number; kdvOrani: string | null; degisiklikler: SiparisDegisikligi[] | null }

export interface SiparisOnerisiEkrani {
  /** 3574-2a: öneri sipariş verme ya da verilmiş siparişin değişikliğidir; değişiklikte paylar ve başlıklar boş, `degisiklik` dolu. */
  tur?: "siparis-ver" | "siparis-degistir";
  degisiklik?: SiparisOnerisi["degisiklik"];
  onayliTutar: number | null; yeniTutar: number | null; yeniFirmalar: string[]; gerekce: string; onerenId: string; onerenAdi: string; zaman: number;
  /** Onaylanacak siparişin kendisi (yalnız okunur): pay ve firma başlıkları. */
  paylar: { itemId: string; quoteId: string; qty: number; price: number; exp: string; note: string }[];
  basliklar: { quoteId: string; yeniFirmaId: string | null; currency: Currency | null; poNo: string; orderDate: string; expectedDate: string; teslimYeri: string; tedarikciNotu: string; icNot: string }[];
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
