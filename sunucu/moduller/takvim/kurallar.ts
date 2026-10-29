import type { Islem } from '#paylasilan/islemler.ts';
import { TAKVIM_KAYNAKLARI } from '#paylasilan/sozlesme/takvim.ts';
import type { TakvimKaydi, TakvimKaynagi } from '#paylasilan/sozlesme/takvim.ts';

// Kaynağın okuma yetkisi (1163 a): kaynağın kendi ekranını açan işlem; üretim emrinin okuma işlemi yoktur, emir listesi sayfasıyla okunur. null: kaynak oturumla okunur (planlı duruş, vardiya takvimi gibi).
// bagli: false olan kaynak Aşama 1'de bağlanmadı (modülü başka işte); yetkisi olana "bağlanmadı" diye bildirilir (UYUM-BORCU).
export const KAYNAK_YETKILERI: Readonly<Record<TakvimKaynagi, { islem: Islem | null; bagli: boolean }>> = {
  'siparis': { islem: 'siparisler.oku', bagli: true },
  'emir-plan': { islem: 'sayfa.uretim-emirleri', bagli: true },
  'emir-bitis': { islem: 'sayfa.uretim-emirleri', bagli: true },
  'sevk': { islem: 'sevkiyat.oku', bagli: true },
  'satin-alma': { islem: 'satin-alma.oku', bagli: true },
  'kalibrasyon': { islem: 'kalibrasyon.oku', bagli: true },
  'denetim': { islem: 'denetim-hazirlik.oku', bagli: true },
  'izin': { islem: null, bagli: true },
  'vergi': { islem: 'finans.oku', bagli: true },
  'planli-durus': { islem: null, bagli: true },
};

export function gorulenKaynaklar(islemler: readonly string[]): { okunan: TakvimKaynagi[]; bekleyen: TakvimKaynagi[] } {
  const okunan: TakvimKaynagi[] = [];
  const bekleyen: TakvimKaynagi[] = [];
  for (const k of TAKVIM_KAYNAKLARI) {
    const y = KAYNAK_YETKILERI[k];
    if (y.islem !== null && !islemler.includes(y.islem)) continue;
    (y.bagli ? okunan : bekleyen).push(k);
  }
  return { okunan, bekleyen };
}

// İzin (1191 a): ik.oku ya da ik.izin-oku olan bütün personelin iznini, öteki kişi yalnız kendi iznini görür.
export const butunIzinleriGorurMu = (islemler: readonly string[]): boolean => islemler.includes('ik.oku') || islemler.includes('ik.izin-oku');

// Aynı gün içinde kaynak sırası sabittir: ekran ve CSV her okumada aynı sırayı görür.
export function kayitlariSirala(kayitlar: readonly TakvimKaydi[]): TakvimKaydi[] {
  const sira = (k: TakvimKaynagi): number => TAKVIM_KAYNAKLARI.indexOf(k);
  return [...kayitlar].sort((a, b) => (a.tarih !== b.tarih ? (a.tarih < b.tarih ? -1 : 1)
    : a.kaynak !== b.kaynak ? sira(a.kaynak) - sira(b.kaynak) : a.kimlik < b.kimlik ? -1 : a.kimlik > b.kimlik ? 1 : 0));
}
