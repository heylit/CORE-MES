// Portal kayıtları belge deposunda prototipin biçimiyle durur (paylasilan/sozlesme/portal.ts: gövde TMI'de yorumlanmaz).
// Yeni ekran aynı belgeleri okur ve yazar; alan adları bu yüzden prototipinkilerdir. Tipler yalnız ekranın kullandığı alanları
// söyler, belgedeki öteki alanlar yazarken korunur.

export interface Gecmis { at: string; by: string; u?: string; text: string }

export interface DepoKaydi {
  id: string;
  // Belge deposunun sürümü; yazmada beklenen sürüm olarak gider.
  surum: number;
}

export type ParaBirimi = 'TRY' | 'USD' | 'EUR';

export interface Kalem {
  name: string;
  code?: string;
  spec?: string;
  qty: number;
  unit: string;
  price: number | null;
}

export interface Teslimat {
  no: string;
  shipDate: string;
  qtys: number[];
  status: 'in_transit' | 'received';
  acceptedQtys?: number[];
  rejectedQtys?: number[];
  receivedAt?: string;
}

export interface FaturaSatiri { qty: number; price: number | null }

export interface FaturaKarari { status: 'approved' | 'disputed' | 'credited'; note?: string; at?: string; u?: string }

export interface Fatura {
  no: string;
  date: string;
  dueDate: string;
  amount: number;
  qtys: number[];
  lines?: FaturaSatiri[];
  credit?: boolean;
  decision?: FaturaKarari;
}

export interface Ceza { no?: string; amount: number; status: 'applied' | 'waived'; at: string }

export interface TerminTalebi { date: string; status: 'pending' | 'approved' | 'rejected'; at: string; note?: string }

export type SiparisTuru = 'sales' | 'purchase';

export interface Siparis extends DepoKaydi {
  no: string;
  type: SiparisTuru;
  partyId: string;
  title: string;
  items: Kalem[];
  currency?: ParaBirimi;
  vat?: number;
  status?: 'cancelled';
  approvalState?: 'pending' | 'approved' | 'rejected';
  confirmedAt?: string;
  promisedDate: string;
  revisedDate?: string;
  termRequest?: TerminTalebi;
  deliveries?: Teslimat[];
  invoices?: Fatura[];
  penalties?: Ceza[];
  contractId?: string;
  createdAt: string;
  history?: Gecmis[];
}

export interface CekBilgisi { no: string; bank?: string; dueDate: string; status: string }

export interface Odeme extends DepoKaydi {
  no: string;
  partyId: string;
  orderId?: string;
  direction: 'in' | 'out';
  method: 'havale' | 'cek' | 'senet' | 'kart' | 'dbs' | 'nakit';
  amount: number;
  date?: string;
  status: 'notified' | 'confirmed' | 'sent' | 'rejected' | 'bounced' | 'awaiting';
  cheque?: CekBilgisi;
  senet?: CekBilgisi;
  createdAt: string;
  history?: Gecmis[];
}

export interface Ncr extends DepoKaydi {
  no: string;
  kind: 'supplier' | 'customer';
  partyId: string;
  defect: string;
  item?: string;
  severity?: 'Kritik' | 'Majör' | 'Minör';
  status: 'open' | 'answered' | 'closed' | 'rejected';
  dueDate?: string;
  response?: { at: string } | null;
  createdAt: string;
  history?: Gecmis[];
}

export interface FiyatTalebi extends DepoKaydi {
  no: string;
  partyId: string;
  item: string;
  oldPrice: number;
  newPrice: number;
  counterPrice?: number;
  effectiveDate: string;
  status: 'pending' | 'countered' | 'accepted' | 'rejected' | 'withdrawn';
  pendingApproval?: string | null;
  history?: Gecmis[];
}

export interface TeklifSurumu { v: number; prices: (number | null)[]; discount?: number; validUntil: string; createdAt?: string }

export interface TeklifTalebi extends DepoKaydi {
  no: string;
  customerId: string;
  title: string;
  items: Kalem[];
  status: 'new' | 'revision' | 'quoted' | 'accepted' | 'rejected' | 'ordered' | 'cancelled';
  versions?: TeklifSurumu[];
  acceptedVersion?: number;
  pendingApproval?: string | null;
  createdAt: string;
  history?: Gecmis[];
}

export interface Rfq extends DepoKaydi {
  no: string;
  title: string;
  items: Kalem[];
  invited?: string[];
  deadline: string;
  status: 'open' | 'closed' | 'awarded' | 'cancelled';
  history?: Gecmis[];
}

export interface TedarikciTeklifi extends DepoKaydi {
  rfqId: string;
  supplierId: string;
  prices: (number | null)[];
  status: 'submitted' | 'withdrawn' | 'won' | 'lost';
  history?: Gecmis[];
}

export interface FiyatGecmisi { from: string; price: number; at?: string; ackAt?: string }

export interface KatalogKalemi extends DepoKaydi {
  side: SiparisTuru;
  partyId: string;
  name: string;
  code?: string;
  unit?: string;
  history: FiyatGecmisi[];
}

export interface Endeks { key: string; share: number; base: number }

export interface SozlesmeSatiri { name: string; code?: string; qty: number; price: number; index?: Endeks }

export interface Sozlesme extends DepoKaydi {
  no: string;
  type: SiparisTuru;
  partyId: string;
  title: string;
  startDate: string;
  endDate: string;
  lines: SozlesmeSatiri[];
  penalty?: { rate: number; grace?: number; cap: number };
  approval?: 'pending' | 'approved' | 'rejected';
  signed?: { firm?: { u: string; at: string } | null; party?: { u: string; at: string } | null };
  terminated?: boolean;
  history?: Gecmis[];
}

export type OnayTuru = 'po' | 'payment' | 'iban' | 'discount' | 'pricereq' | 'contract';

export interface OnayAdimi { role: string; status: 'pending' | 'approved' | 'rejected'; u?: string; at?: string; note?: string }

export interface Onay extends DepoKaydi {
  no: string;
  kind: OnayTuru;
  refCol: string;
  refId: string;
  title: string;
  amount: number | null;
  partyId?: string;
  payload?: unknown;
  requestedBy: string;
  at: string;
  steps: OnayAdimi[];
  status: 'pending' | 'approved' | 'rejected';
  history?: Gecmis[];
}

export interface Mutabakat extends DepoKaydi {
  no: string;
  partyId: string;
  kind: 'cari' | 'babs';
  period: string;
  form?: 'Ba' | 'Bs';
  status: 'sent' | 'agreed' | 'disagreed' | 'closed';
  response?: { note?: string };
  history?: Gecmis[];
}

export interface FirmaBelgesi extends DepoKaydi {
  partyId: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  expiresAt?: string;
  at: string;
  rejectNote?: string;
  history?: Gecmis[];
}

export interface Firma extends DepoKaydi {
  name: string;
  type: 'customer' | 'supplier';
  status?: 'active' | 'blocked';
  blockReason?: string;
  creditLimit?: number;
  bank?: { bank?: string; iban?: string };
  bankChange?: { status: 'pending' | 'approved' | 'rejected' };
  history?: Gecmis[];
}

export interface PortalKullanicisi extends DepoKaydi {
  partyId: string;
  name: string;
  role: string;
  unvan?: string;
  // TMI kişisinde rol ve izinleri yalnız sunucu yazar (sunucu/moduller/portal/kurallar.ts portalRolu).
  tmiIzinler?: string[];
  tmiRoller?: string[];
  active?: boolean;
}

export interface Etkinlik extends DepoKaydi {
  partyId: string;
  u?: string;
  followUp?: { date: string; text: string; done?: boolean };
}

export interface Mesaj extends DepoKaydi {
  thread: string;
  from: string;
  u?: string;
  text: string;
  at: string;
}

export interface EndeksSerisi { values: { date?: string; value: number }[] }

export interface PortalAyarlari extends DepoKaydi {
  rules?: Partial<OnayKurallari>;
  indexes?: Record<string, EndeksSerisi>;
}

export interface OnayKurallari {
  payFin: number;
  discMgr: number;
  priceMgr: number;
  contractGM: number;
  priceTol: number;
  // Satın alma limit tablosundan sunucu bindirir; tanımsızsa alan yoktur ve ekran onay adımını ister.
  poMgr?: number;
  poGM?: number;
}

// Ekranın okuduğu koleksiyonlar ve kayıt tipleri. Okunmayan koleksiyon yüklenmez (prototip açılışta hepsini okurdu).
export interface Koleksiyonlar {
  parties: Firma;
  catalog: KatalogKalemi;
  orders: Siparis;
  payments: Odeme;
  ncrs: Ncr;
  priceReqs: FiyatTalebi;
  rfqs: Rfq;
  bids: TedarikciTeklifi;
  requests: TeklifTalebi;
  messages: Mesaj;
  users: PortalKullanicisi;
  docs: FirmaBelgesi;
  activities: Etkinlik;
  contracts: Sozlesme;
  approvals: Onay;
  recons: Mutabakat;
  settings: PortalAyarlari;
}

export type KoleksiyonAdi = keyof Koleksiyonlar;

export const KOLEKSIYON_ADLARI = [
  'parties', 'catalog', 'orders', 'payments', 'ncrs', 'priceReqs', 'rfqs', 'bids', 'requests', 'messages',
  'users', 'docs', 'activities', 'contracts', 'approvals', 'recons', 'settings',
] as const satisfies readonly KoleksiyonAdi[];

// Kimliğe göre kayıtlar. Yüklenmemiş koleksiyon boş nesnedir; hesaplar bunu "kayıt yok" sayar.
export type Depo = { [K in KoleksiyonAdi]: Readonly<Record<string, Koleksiyonlar[K]>> };

export const bosDepo = (): Depo => Object.fromEntries(KOLEKSIYON_ADLARI.map((k) => [k, {}])) as unknown as Depo;
