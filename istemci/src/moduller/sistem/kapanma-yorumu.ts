import type { GunlukDuzeyi, KapanmaAyrintisi, KapanmaNedeni, KapanmaSatiri } from '#paylasilan/sozlesme/saglik.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { sureMetni } from './sure.ts';

// Neden sınıfı renkle, yazıyla ve simgeyle gösterilir (renk tek ipucu değildir). Planlı olanlar (güncelleme, ekrandan yeniden başlatma)
// kullanıcının kendi isteğidir: sekme sayısına girmez, alarm tonu almaz.
export const NEDEN_BILGISI: Record<KapanmaNedeni, { ad: string; ton: RozetTonu; simge: SimgeAdi; planli: boolean }> = {
  'bellek-tasmasi': { ad: 'Bellek taşması', ton: 'hata', simge: 'alert', planli: false },
  'yakalanmamis-hata': { ad: 'Yakalanmamış hata', ton: 'hata', simge: 'alert', planli: false },
  donma: { ad: 'Donma (bekçi kapattı)', ton: 'hata', simge: 'stop', planli: false },
  'ekrandan-yeniden-baslatma': { ad: 'Ekrandan yeniden başlatma', ton: 'bilgi', simge: 'rotate', planli: true },
  guncelleme: { ad: 'Güncelleme (planlı)', ton: 'bilgi', simge: 'rotate', planli: true },
  bilinmiyor: { ad: 'Bilinmiyor', ton: 'pasif', simge: 'help', planli: false },
};

export const GUNLUK_DUZEY_BILGISI: Record<GunlukDuzeyi, { ad: string; ton: RozetTonu; simge: SimgeAdi }> = {
  bilgi: { ad: 'Bilgi', ton: 'pasif', simge: 'list' },
  uyari: { ad: 'Uyarı', ton: 'uyari', simge: 'alert' },
  hata: { ad: 'Hata', ton: 'hata', simge: 'alert' },
  olumcul: { ad: 'Ölümcül', ton: 'hata', simge: 'stop' },
};

export const SAYAC_GUNU = 7;
// Günlük dosyaları bu kadar gün saklanır (kurulum/gunluk.md); kapanma kaydı daha uzun yaşar.
export const GUNLUK_SAKLAMA_GUN = 60;
const GUN_MS = 86_400_000;

// Sekme rozeti: son 7 günde plansız kapanma. Planlı güncelleme ve ekrandan yeniden başlatma sayılmaz.
export function plansizKapanmaSayisi(kapanmalar: readonly Pick<KapanmaSatiri, 'kapandiAn' | 'neden'>[], simdi: number): number {
  return kapanmalar.filter((k) => !NEDEN_BILGISI[k.neden].planli && simdi - Date.parse(k.kapandiAn) <= SAYAC_GUNU * GUN_MS).length;
}

// Yerel takvim günü (günlük dosyası adındaki tarihle aynı kural: sunucunun yerel tarihi); tarayıcı ile sunucu aynı saat dilimindedir.
export function yerelGun(iso: string): string {
  const t = new Date(iso);
  return `${String(t.getFullYear())}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function yerelSaat(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

export function gunlukDosyasiVarMi(kapandiAn: string, simdi: number): boolean {
  return simdi - Date.parse(kapandiAn) <= GUNLUK_SAKLAMA_GUN * GUN_MS;
}

// Çıkış kodu yalnız kanıt varsa açıklanır; kodun tek başına anlamı sürece ve işletim sistemine bağlıdır (doğrulanmadı), uydurulmaz.
export function cikisKoduAciklamasi(k: Pick<KapanmaAyrintisi, 'cikisKodu' | 'sinyal' | 'neden' | 'kanit'>): string {
  const kodu = k.sinyal !== null ? `Sinyal ${k.sinyal}` : k.cikisKodu !== null ? `Çıkış kodu ${String(k.cikisKodu)}` : 'Çıkış kodu kayıtlı değil';
  if (k.kanit?.startsWith('rapor:') === true) return `${kodu}; tanı raporu ${k.neden === 'bellek-tasmasi' ? 'bellek taşmasını' : 'yakalanmamış hatayı'} gösteriyor`;
  if (k.neden === 'donma') return `${kodu}; bekçi cevap vermeyen süreci kapattı`;
  if (k.neden === 'guncelleme' || k.neden === 'ekrandan-yeniden-baslatma') return `${kodu}; sunucu bilerek kapatıldı`;
  return `${kodu}; anlamı tanı kanıtı olmadan bilinmiyor`;
}

// Ayrıntının en üstündeki tek cümle: ne oldu, hangi istek sürüyordu, ne kadar kapalı kaldı. Süren istek yoksa o parça yazılmaz.
export function kapanmaOzeti(k: Pick<KapanmaAyrintisi, 'kapandiAn' | 'kapaliSn' | 'neden' | 'surenIstekler'>): string {
  const saat = yerelSaat(k.kapandiAn);
  const sonra = `Sunucu ${saat}'de kapandı, ${sureMetni(k.kapaliSn)} sonra yeniden açıldı.`;
  const en = k.surenIstekler[0];
  const istek = en === undefined ? '' : ` Sürenlerin en uzunu: ${en.yontem} ${en.adres}${en.kisiId === null ? '' : `, kişi ${String(en.kisiId)}`}, ${sureMetni(en.sureSn)}.`;
  const baslik: Record<KapanmaNedeni, string> = {
    'bellek-tasmasi': 'Sunucu belleği doldurdu.', 'yakalanmamis-hata': 'Sunucu yakalanmamış bir hatayla düştü.', donma: 'Sunucu cevap vermedi, bekçi kapattı.',
    'ekrandan-yeniden-baslatma': 'Sunucu ekrandan yeniden başlatıldı.', guncelleme: 'Sunucu güncelleme için kapandı.', bilinmiyor: 'Kapanma nedeni belirlenemedi.',
  };
  const neden = k.neden === 'bilinmiyor' ? ' Tanı raporu, bekçi günlüğü ve sunucu günlüğünde neden bulunamadı.' : '';
  return `${baslik[k.neden]}${neden}${istek} ${sonra}`;
}

// Adres: `?sistem=<sekme>&kayit=<no>` ve günlük süzgeci. Bilinmeyen sekme Özet'tir (kullanıcı yanlış adresle boş ekran görmez).
export const SEKMELER = ['ozet', 'kapanmalar', 'gunluk'] as const;
export type SekmeAnahtari = (typeof SEKMELER)[number];

export interface GunlukSuzgeci {
  gun: string;
  baslangic: string;
  bitis: string;
  duzey: GunlukDuzeyi;
  uc: string;
  kisi: string;
  hata: string;
}

export interface IzlemeAdresi {
  sekme: SekmeAnahtari;
  kayit: number | null;
  suzgec: Partial<GunlukSuzgeci>;
}

const DUZEYLER: readonly string[] = ['bilgi', 'uyari', 'hata', 'olumcul'];

export function adresiCoz(p: URLSearchParams): IzlemeAdresi | null {
  const s = p.get('sistem');
  if (s === null) return null;
  const sekme = (SEKMELER as readonly string[]).includes(s) ? s as SekmeAnahtari : 'ozet';
  const kayit = Number(p.get('kayit'));
  const duzey = p.get('duzey');
  const suzgec: Partial<GunlukSuzgeci> = {};
  for (const alan of ['gun', 'baslangic', 'bitis', 'uc', 'kisi', 'hata'] as const) {
    const d = p.get(alan);
    if (d !== null && d !== '') suzgec[alan] = d;
  }
  if (duzey !== null && DUZEYLER.includes(duzey)) suzgec.duzey = duzey as GunlukDuzeyi;
  return { sekme, kayit: Number.isInteger(kayit) && kayit > 0 ? kayit : null, suzgec };
}

// Pencere açıkken adrese yazılacak parametreler; kapalıyken (null) bu parametreler adresten kalkar.
export function adresiYaz(p: URLSearchParams, a: IzlemeAdresi | null): URLSearchParams {
  const yeni = new URLSearchParams(p);
  for (const k of ['sistem', 'kayit', 'gun', 'baslangic', 'bitis', 'duzey', 'uc', 'kisi', 'hata']) yeni.delete(k);
  if (a === null) return yeni;
  yeni.set('sistem', a.sekme);
  if (a.sekme === 'kapanmalar' && a.kayit !== null) yeni.set('kayit', String(a.kayit));
  if (a.sekme === 'gunluk') for (const [k, v] of Object.entries(a.suzgec)) if (v !== '' && v !== undefined) yeni.set(k, v);
  return yeni;
}

// Günlük süzgecinden istek parametreleri: gün + saat -> yerel zamandan an (ISO).
export function gunlukIstegi(s: Partial<GunlukSuzgeci>, imlec: string | null): URLSearchParams {
  const p = new URLSearchParams();
  p.set('duzey', s.duzey ?? 'hata');
  p.set('adet', '500');
  if (s.uc !== undefined && s.uc !== '') p.set('uc', s.uc);
  if (s.kisi !== undefined && s.kisi !== '') p.set('kisi', s.kisi);
  if (s.hata !== undefined && s.hata !== '') p.set('hataKodu', s.hata);
  if (s.gun !== undefined && s.gun !== '') {
    p.set('gun', s.gun);
    if (s.baslangic !== undefined && s.baslangic !== '') p.set('baslangic', new Date(`${s.gun}T${s.baslangic}:00`).toISOString());
    if (s.bitis !== undefined && s.bitis !== '') p.set('bitis', new Date(`${s.gun}T${s.bitis}:59.999`).toISOString());
  }
  if (imlec !== null) p.set('imlec', imlec);
  return p;
}

// "Günlükte bu saati aç": kapanıştan 5 dakika önce ile 2 dakika sonrası, o günün dosyasında, hata ve üstü.
export function kapanmaGunlukAdresi(k: Pick<KapanmaSatiri, 'kapandiAn'>): IzlemeAdresi {
  const an = Date.parse(k.kapandiAn);
  return { sekme: 'gunluk', kayit: null, suzgec: { gun: yerelGun(k.kapandiAn), baslangic: yerelSaat(new Date(an - 5 * 60_000).toISOString()), bitis: yerelSaat(new Date(an + 2 * 60_000).toISOString()), duzey: 'hata' } };
}
