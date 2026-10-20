import type { Priority, Quality, RequestStatus, Settings, SupplierStatus } from "./tipler.ts";
import { SAYFALAR } from "#paylasilan/sayfalar.ts";
import type { MALZEMELER_IKINCI_MENU } from "#paylasilan/sayfalar/malzemeler.ts";

// SA2: yeni malzeme kartı satın almada açılmaz; bağlantı yeni sekmede açılır ki yarım talep formu kaybolmasın.
// Etiket malzemelerin sayfa tanımından okunur; sayfanın adı değişince burası kendiliğinden izler.
// Malzeme kartı yalnız orada oluşturulur: bağlantı doğrudan yeni kart formunu açar.
const kartSayfasi = SAYFALAR.find(s => s.islem === "sayfa.malzemeler") ?? { yol: "/malzemeler", baslik: "Malzemeler ve Hizmetler" };
type Madde = (typeof MALZEMELER_IKINCI_MENU)["gruplar"][number]["maddeler"][number];
const YENI_KART_YOLU: Extract<Madde, { anahtar: "new" }>["yol"] = "/malzemeler/yeni";
export const KART_SAYFASI = `<a href="${YENI_KART_YOLU}" target="_blank" rel="noopener">${kartSayfasi.baslik}</a>`;

export const STATUSES: { k: RequestStatus; l: string }[] = [
  { k: "draft", l: "Satın almada" }, { k: "rfq", l: "Teklif toplanıyor" }, { k: "eval", l: "Değerlendirme" },
  { k: "approval", l: "Onay" }, { k: "ordered", l: "Sipariş verildi" }, { k: "received", l: "Teslim alındı" },
  { k: "cancelled", l: "İptal" },
];
export const FLOW: RequestStatus[] = ["draft", "rfq", "eval", "approval", "ordered", "received"];
export const stLabel = (k: RequestStatus): string => (STATUSES.find((s) => s.k === k) ?? STATUSES[0]!).l;
export const OPEN: RequestStatus[] = ["draft", "rfq", "eval", "approval"];
export const COMMITTED: RequestStatus[] = ["ordered", "received"];
export const PRIO: Record<Priority, string> = { urgent: "Acil", normal: "Normal", low: "Düşük" };
export const SUP_STATUS: Record<SupplierStatus, string> = { approved: "Onaylı", trial: "Deneme", suspended: "Askıda" };
export const QUALITY: Record<Quality, string> = { ok: "Sorunsuz", partial: "Kısmi sorun", rejected: "Red / iade" };
export const DELIVERY = [
  "Fabrikamıza teslim, nakliye dahil", "Tedarikçi deposundan teslim (EXW)", "Kargo ile, alıcı ödemeli",
  "Yurt dışı FCA / FOB", "Yurt dışı CIF / CPT", "Yurt dışı DAP / DDP",
];
export const UNITS = ["adet", "kg", "m", "m²", "m³", "lt", "takım", "paket", "rulo", "kutu", "koli", "saat", "ton", "palet"];

export type CritKey = "cost" | "lead" | "supplier" | "warranty";
export const CRIT: { k: CritKey; l: string; c: string }[] = [
  { k: "cost", l: "Net maliyet", c: "k1" }, { k: "lead", l: "Termin", c: "k2" },
  { k: "supplier", l: "Tedarikçi performansı", c: "k3" }, { k: "warranty", l: "Garanti", c: "k4" },
];

export const DEFAULT_SETTINGS: Settings = {
  company: "",
  currencies: { TRY: { rate: 1, monthly: 3 }, USD: { rate: null, monthly: 0.4 }, EUR: { rate: null, monthly: 0.3 }, GBP: { rate: null, monthly: 0.4 } },
  weights: { cost: 50, lead: 20, supplier: 20, warranty: 10 },
  validityDays: 15, minQuotes: 3, ratesDate: "", priceAlertPct: 10,
  categories: ["Bakım ve yedek parça", "Hırdavat ve sarf", "Elektrik", "Ambalaj", "Hammadde", "Ofis ve kırtasiye", "Hizmet", "Yatırım / makine"],
  departments: [{ name: "Bakım", budget: 0 }, { name: "Üretim", budget: 0 }, { name: "Lojistik", budget: 0 }, { name: "İdari işler", budget: 0 }],
  approvalLimits: [{ max: 50000, role: "Satın alma uzmanı" }, { max: 250000, role: "Satın alma müdürü" }, { max: 1000000, role: "Genel müdür yardımcısı" }, { max: null, role: "Genel müdür" }],
};
