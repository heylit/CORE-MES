import type { Bildirim, BildirimOnemi, BildirimSinifi, YayinSimgesi, YayinTuru } from '#paylasilan/sozlesme/bildirim.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

// Zil 30 sn'de bir ve sekme öne gelince yoklar (kurgu §10); anlık itme yok. Cihaz bildirimi bu yoklamadan doğar (cihaz.ts).
export const SAYAC_YOKLAMA_MS = 30_000;

// Kaynak modülün ekrandaki adı ve simgesi; bilinmeyen modül zil simgesiyle, kendi adıyla görünür.
const MODUL: Record<string, { ad: string; simge: SimgeAdi }> = {
  'satin-alma': { ad: 'Satın alma', simge: 'tag' },
  siparisler: { ad: 'Siparişler', simge: 'list' },
  ik: { ad: 'İK', simge: 'user' },
  istasyonlar: { ad: 'İstasyonlar', simge: 'cpu' },
};
export const modulAdi = (modul: string): string => MODUL[modul]?.ad ?? modul;
export const modulSimgesi = (modul: string): SimgeAdi => MODUL[modul]?.simge ?? 'bell';

export const ONEM_ADI = { bilgi: 'Bilgi', uyari: 'Uyarı', acil: 'Acil' } as const satisfies Record<BildirimOnemi, string>;

// 2174-2 a: satırın sınıf etiketi. Bilgi etiketsizdir (bugünkü satır görünümü); görev ve hatırlatma yapılınca "Yapıldı" olur.
export const SINIF_ADI = { gorev: 'Görev', hatirlatma: 'Hatırlatma', bilgi: 'Bilgi' } as const satisfies Record<BildirimSinifi, string>;
export function sinifEtiketi(b: Pick<Bildirim, 'sinif' | 'yapildi'>): { ad: string; durum: BildirimSinifi | 'yapildi' } | null {
  if (b.sinif === 'bilgi') return null;
  return b.yapildi !== null ? { ad: 'Yapıldı', durum: 'yapildi' } : { ad: SINIF_ADI[b.sinif], durum: b.sinif };
}

// Elle yayının türü (2147): ad, varsayılan simge ve renk tonu (önemle aynı üç ton; duyuru bilgi tonundadır).
export const YAYIN_TURU = {
  uyari: { ad: 'Uyarı', simge: 'alert', ton: 'uyari' },
  duyuru: { ad: 'Duyuru', simge: 'bell', ton: 'bilgi' },
  bilgi: { ad: 'Bilgi', simge: 'flag', ton: 'bilgi' },
  acil: { ad: 'Acil', simge: 'fire', ton: 'acil' },
} as const satisfies Record<YayinTuru, { ad: string; simge: SimgeAdi; ton: BildirimOnemi }>;

export const YAYIN_TURU_SIRASI = ['uyari', 'duyuru', 'bilgi', 'acil'] as const satisfies readonly YayinTuru[];

// Sözleşmedeki sınırlar ve simge listesi (istemci paylasilan'dan değer almaz; tip eşliği aşağıda sınanır). Sunucu yeniden sınar.
export const BASLIK_EN_COK = 200;
export const METIN_EN_COK = 1000;
export const HEDEF_EN_COK = 100;
export const GORSEL_EN_COK_BAYT = 5 * 1024 * 1024;
export const SECILEBILEN_SIMGELER = [
  'bell', 'alert', 'fire', 'flag', 'wrench', 'helmet', 'calendar', 'cpu', 'users', 'gear', 'bolt', 'clipboard-check', 'truck', 'meal', 'drop', 'thermometer', 'lock',
] as const satisfies readonly (YayinSimgesi & SimgeAdi)[];
// Sözleşmeye yeni simge eklenip burada unutulursa derleme düşer.
type EksikSimge = Exclude<YayinSimgesi, (typeof SECILEBILEN_SIMGELER)[number]>;
export const SIMGE_LISTESI_TAM: [EksikSimge] extends [never] ? true : EksikSimge = true;

// Satırın simgesi ve alt satırı: elle yayında seçilen simge ve gönderen, otomatikte kaynak modül.
export const satirSimgesi = (b: Pick<Bildirim, 'yayin' | 'kaynakModul'>): SimgeAdi => b.yayin?.simge ?? modulSimgesi(b.kaynakModul);
export function satirKaynagi(b: Pick<Bildirim, 'yayin' | 'kaynakModul' | 'onem'>): string {
  if (b.yayin === null) return `${modulAdi(b.kaynakModul)} · ${ONEM_ADI[b.onem]}`;
  return `${YAYIN_TURU[b.yayin.tur].ad} · ${b.yayin.gonderen ?? 'Bildirim merkezi'}`;
}

// Terminal ekranlarında ortadaki pencere Y3'e kadar çıkmaz: Arkon hazırlık uyarısıyla sırası orada kurulur (UYUM-BORCU).
const ORTADA_BEKLEYEN_YOLLAR = ['/uretim-terminali', '/arkon/operator', '/terminal'] as const;
export const ortadaBekletilirMi = (yol: string): boolean => ORTADA_BEKLEYEN_YOLLAR.some((y) => yol === y || yol.startsWith(`${y}/`));

// "3 dk önce", "2 sa önce"; bir günden eskisi tarih ve saatle.
export function gecenZaman(iso: string, simdi: Date): string {
  const an = new Date(iso);
  if (Number.isNaN(an.getTime())) return iso;
  const dk = Math.floor((simdi.getTime() - an.getTime()) / 60_000);
  if (dk < 1) return 'Az önce';
  if (dk < 60) return `${dk} dk önce`;
  if (dk < 24 * 60) return `${Math.floor(dk / 60)} sa önce`;
  return an.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const sayacMetni = (n: number): string => (n > 99 ? '99+' : String(n));
