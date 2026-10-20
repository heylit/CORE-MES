import type { BildirimOnemi } from '#paylasilan/sozlesme/bildirim.ts';
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
