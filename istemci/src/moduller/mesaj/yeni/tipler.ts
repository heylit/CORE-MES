// Belge gövdeleri eski çerçevenin (prototip) biçimidir ve aynı belge deposunda durur (204 a): alan adları değişmez, eski
// ekranla yeni ekran aynı kayıtları okur ve yazar. Kişi kimliği TMI kişi no'sunun metnidir; `__bot` otomatik uyarı gönderenidir.

export type Kayit<T> = T & { id: string; surum: number };

// Kişi haritalarının anahtarı `kisiAnahtari(kisi)` ile kodlanır (kurallar.ts).
export type KisiHaritasi<T> = Record<string, T>;

export interface IzSatiri { by: string; ts: number; t: string }

export interface Kanal {
  name: string;
  emoji?: string;
  topic?: string;
  createdAt?: number;
  createdBy?: string;
  lastAt?: number;
  lastBy?: string;
  lastText?: string;
  mentions?: KisiHaritasi<number>;
  everyone?: number;
  everyoneBy?: string;
}

export type IletiTuru = 'msg' | 'ann' | 'approval' | 'task' | 'meeting' | 'auto' | 'system';

export interface EkBilgisi { name: string; type: string; size: number; id?: string }

export interface Ileti {
  by: string;
  ts: number;
  kind: IletiTuru;
  text?: string;
  // Tepki anahtarı -> kişi anahtarı -> kişi (boş metin: geri alındı).
  rx?: Record<string, KisiHaritasi<string>>;
  mentions?: string[];
  everyone?: boolean;
  replyTo?: { id: string; by: string; text: string };
  ref?: string;
  att?: EkBilgisi | null;
  edited?: number;
  deleted?: boolean;
  scheduled?: boolean;
  rule?: string;
  threadOf?: string;
}

export type GorevDurumu = 'todo' | 'doing' | 'done';

export interface Gorev {
  title: string;
  to: string | null;
  by: string;
  status: GorevDurumu;
  due: number | null;
  remind?: number | null;
  orderId?: string | null;
  note?: string;
  cid?: string | null;
  mid?: string | null;
  doneAt?: number | null;
  createdAt: number;
  last?: IzSatiri;
}

export interface Oy { u: string; d: 'ok' | 'no'; note?: string; ts: number; r: number }

export interface Onay {
  title: string;
  note?: string;
  by: string;
  approvers: string[];
  round?: number;
  votes?: KisiHaritasi<Oy>;
  orderId?: string | null;
  cid?: string | null;
  mid?: string | null;
  createdAt: number;
  last?: IzSatiri;
  closedSeen?: boolean;
}

export interface Duyuru {
  by: string;
  ts: number;
  text: string;
  cid: string;
  mid: string | null;
  ack?: KisiHaritasi<string>;
}

export type ToplantiYaniti = 'yes' | 'no' | 'maybe';

export interface Toplanti {
  title: string;
  start: number;
  dur?: number;
  attendees?: string[];
  loc?: string;
  link?: string;
  agenda?: string;
  remind?: number;
  by: string;
  rsvp?: KisiHaritasi<{ u: string; r: ToplantiYaniti; ts: number }>;
  cancelled?: boolean;
  cid?: string | null;
  mid?: string | null;
  createdAt: number;
  last?: IzSatiri;
}

export type Tekrar = 'none' | 'daily' | 'weekdays' | 'weekly';

export interface Zamanli {
  cid: string;
  by: string;
  text: string;
  sendAt: number;
  repeat?: Tekrar;
  ann?: boolean;
  status: 'bekliyor' | 'gonderildi' | 'iptal';
  sentAt?: number;
  lastSent?: number;
  createdAt: number;
}

export type KuralTuru = 'order_risk' | 'order_ready' | 'order_new' | 'prod_word' | 'task_late' | 'appr_wait' | 'ann_unread';

export interface Kural {
  type: KuralTuru;
  cid: string;
  params?: Record<string, unknown>;
  on: boolean;
  by: string;
  createdAt: number;
}

export interface Not { by: string; text: string; ts: number }

// Kanal anahtarı (kodlu) -> son okunan ileti zamanı.
export interface Okuma { c?: Record<string, number> }

export interface Tercihler {
  lastRead: Record<string, number>;
  lastChannel: string | null;
  lastView: string;
  notif: { sound?: boolean; push?: boolean; remind?: number };
  // E-posta ayarları 208 a ile yeni ekranda yoktur; eski ekranın yazdığı değer korunur.
  mail?: Record<string, unknown>;
}

// Siparişler sekmesinin satırı (212 a): siparisler ve uretim-emirleri uçlarından türetilir, Mesaj yazmaz.
export interface SiparisOzeti {
  id: string;
  no: string;
  musteri: string;
  urun: string;
  hedef: number | null;
  birim: string;
  teslim: number | null;
  durum: 'sirada' | 'uretimde' | 'hazir' | 'sevk';
  uretilen: number | null;
}

export interface Ben { id: string; ad: string; yazabilir: boolean; yonetici: boolean }
export interface Kisi { id: string; ad: string }
export interface Es { kisi: string; durum: Record<string, unknown>; guncellendi: number }
