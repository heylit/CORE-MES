import type { Adim, Bagimlilik, AdimKaynakOzeti, RevizyonDurumu, UrunOzeti } from '#paylasilan/sozlesme/rota.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

export const DURUM_ETIKETI: Record<RevizyonDurumu, string> = {
  taslak: 'Taslak', onay_bekliyor: 'Onay bekliyor', onayli: 'Onaylı', yururlukte: 'Yürürlükte', iptal: 'İptal',
};
export const DURUM_TONU: Record<RevizyonDurumu, RozetTonu> = {
  taslak: 'uyari', onay_bekliyor: 'uyari', onayli: 'bilgi', yururlukte: 'tamam', iptal: 'pasif',
};
export const BAGIMLILIK_ETIKETI: Record<Bagimlilik, string> = {
  bekleyen: 'Bekleyen', akisli: 'Akışlı', bagimsiz: 'Bağımsız',
};
export const BAGIMLILIK_ACIKLAMA: Record<Bagimlilik, string> = {
  bekleyen: 'Önceki adım bitince başlar.', akisli: 'Önceki adım üretirken, devir adedi birikince başlar.', bagimsiz: 'Önceki adımı beklemez (paralel).',
};

const TUR_KISA: Record<string, string> = { mamul: 'MM', yarimamul: 'YM', hammadde: 'HM', sarf: 'SF', demirbas: 'DB' };
export const turKisa = (tur: string): string => TUR_KISA[tur] ?? '?';

export const kartAdi = (u: Pick<UrunOzeti, 'stokKodu' | 'ad'>): string => (u.stokKodu ? `${u.stokKodu} ${u.ad}` : u.ad);

// Ara hal kartı: ürünün bir adımdan çıkıp sonrakini bekleyen hali ("MM OP 30 Tornalama").
export const araHalAdi = (urun: Pick<UrunOzeti, 'tur'>, adim: Pick<Adim, 'opNo' | 'ad'>): string => `${turKisa(urun.tur)} OP ${adim.opNo} ${adim.ad}`;


// İstasyon rengi tasarım değişkenlerinden altı renkten biridir; tezgahsız adım ayrı renktedir.
export const istasyonRengi = (id: number | null): string => (id === null ? 'tc-renk-yok' : `tc-renk-${id % 6}`);

// Ondalık metin ekranda virgülle gösterilir; değer yoksa "yok".
export const sayiMetni = (m: string | null): string => (m === null ? 'yok' : m.replace('.', ','));

// Süre sütunları sağa yaslı ve iki ondalıklı gösterilir (Türkçe virgül); sıfırdan farklı değer iki ondalıkta 0,00'a yuvarlanıyorsa dört ondalık yazılır. Değer yoksa "–".
export function ikiOndalikMetni(m: string | null): string {
  if (m === null) return '–';
  const n = Number(m);
  if (!Number.isFinite(n)) return '–';
  const ondalik = n !== 0 && Number(n.toFixed(2)) === 0 ? 4 : 2;
  return n.toLocaleString('tr-TR', { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik });
}

export function sureMetni(dk: string | null): string {
  if (dk === null) return 'Süre yok';
  const n = Number(dk);
  if (n < 60) return `${sayiMetni(dk)} dk`;
  return `${(n / 60).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa`;
}

// Formdan sayıya: boş alan null, virgül ondalık ayırıcı sayılır.
export function sayiyaCevir(metin: string): number | null {
  const temiz = metin.trim().replace(',', '.');
  if (temiz === '') return null;
  const sayi = Number(temiz);
  return Number.isFinite(sayi) ? sayi : null;
}

export const metneCevir = (sayi: number | null): string => (sayi === null ? '' : String(sayi).replace('.', ','));

export const zamanVeyaCizgi = (iso: string | null): string => (iso === null ? '–' : zamanMetni(iso));

export function zamanMetni(iso: string | null): string {
  if (iso === null) return 'yok';
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

const KAYNAK_TURU_ADI: Record<AdimKaynakOzeti['tur'], string> = { makine: 'Makine', kisi: 'Kişi', istasyon: 'İstasyon', fason: 'Fason' };
// Kaynak: makine "kod ad", kişi ve fason firma adıyla; istasyonu varsa yanında. Atanmamış kaynak ayrı yazılır.
export const kaynakAdi = (k: AdimKaynakOzeti | null): string => (k === null ? 'Makine ya da kişi atanmadı' : k.tur === 'makine' ? `${k.kod ?? ''} ${k.ad}`.trim() : k.ad);
export const kaynakKisa = (k: AdimKaynakOzeti): string => `${KAYNAK_TURU_ADI[k.tur]} ${kaynakAdi(k)}${k.istasyon ? ` · ${k.istasyon.kod}` : ''}`;
export const kaynakAyrinti = (k: AdimKaynakOzeti | null): string =>
  k === null ? 'Makine ya da kişi atanmadı' : `${KAYNAK_TURU_ADI[k.tur]}: ${kaynakAdi(k)}${k.istasyon ? ` · ${k.istasyon.kod}` : ''}`;
export const kaynakAnahtari = (k: { tur: string; id: number } | null): string => (k === null ? '' : `${k.tur}:${k.id}`);
export const kaynakCoz = (a: string): { tur: 'makine' | 'kisi'; id: number } | null => {
  const [tur, id] = a.split(':');
  return (tur === 'makine' || tur === 'kisi') && id ? { tur, id: Number(id) } : null;
};
export const adimKaynagiCoz = (a: string): { tur: AdimKaynakOzeti['tur']; id: number } | null => {
  const [tur, id] = a.split(':');
  return (tur === 'fason' && id ? { tur, id: Number(id) } : null) ?? kaynakCoz(a);
};
// Fason adım dakikayla değil takvim günüyle ölçülür.
export const adimSuresiMetni = (a: Pick<Adim, 'kaynak' | 'terminGun' | 'teorikSureDk'>): string =>
  a.kaynak?.tur === 'fason' ? (a.terminGun === null ? 'Termin yok' : `Termin ${a.terminGun} gün`) : sureMetni(a.teorikSureDk);
export const birimMetni = (b: string | null): string => b ?? '';

// Bölme ağacı sırası (kart #262): alt parti üst emrin hemen altında; üstü listede olmayan parti kök gibi durur. Kökler gelen sırayı korur.
export function dalla<T>(liste: readonly T[], id: (e: T) => number, ust: (e: T) => number | null): { e: T; derinlik: number }[] {
  const idler = new Set(liste.map(id));
  const ustu = (e: T) => { const u = ust(e); return u !== null && idler.has(u) ? u : null; };
  const sonuc: { e: T; derinlik: number }[] = [];
  const ekle = (e: T, derinlik: number) => { sonuc.push({ e, derinlik }); for (const c of liste.filter((x) => ustu(x) === id(e))) ekle(c, derinlik + 1); };
  for (const e of liste.filter((x) => ustu(x) === null)) ekle(e, 0);
  return sonuc;
}

// 561 1 b: operatör ihtiyacı çalışan bir makinenin istediği operatördür; 1/N (aşağı yuvarlanmış) "1 operatör N tezgâha bakar" okunur.
// Çeviri İstasyonlar'ın girişiyle aynıdır (567 ortak anlaşma); burada yalnız gösterilir.
export const operatorMetni = (oran: number): string => {
  if (oran === 0) return 'Operatör gerekmez';
  const n = oran > 0 && oran < 1 ? Math.round(1 / oran) : 0;
  return n >= 2 && n <= 10 && Math.floor(100 / n) / 100 === oran ? `1 operatör ${n} tezgâha bakar` : `${oran.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} operatör/makine`;
};
