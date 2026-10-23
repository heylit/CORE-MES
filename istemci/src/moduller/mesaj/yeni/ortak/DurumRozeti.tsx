import { Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import type { GorevDurumu, SiparisOzeti, ToplantiYaniti } from '../tipler.ts';

// Eski ekranın TSTAT, OSTAT, ASTAT ve MSTAT etiketleri; renkler Rozet tonuna eşlenir (203 a, T1).
export const GOREV_DURUMLARI: Record<GorevDurumu, { t: string; ton: RozetTonu }> = {
  todo: { t: 'Yapılacak', ton: 'pasif' },
  doing: { t: 'Yapılıyor', ton: 'bilgi' },
  done: { t: 'Bitti', ton: 'tamam' },
};
export const SIPARIS_DURUMLARI: Record<SiparisOzeti['durum'], { t: string; ton: RozetTonu }> = {
  sirada: { t: 'Sırada', ton: 'pasif' },
  uretimde: { t: 'Üretimde', ton: 'uyari' },
  hazir: { t: 'Hazır', ton: 'bilgi' },
  sevk: { t: 'Sevk edildi', ton: 'tamam' },
};
export const ONAY_DURUMLARI: Record<'wait' | 'ok' | 'no', { t: string; ton: RozetTonu }> = {
  wait: { t: 'Onay bekliyor', ton: 'uyari' },
  ok: { t: 'Onaylandı', ton: 'tamam' },
  no: { t: 'Reddedildi', ton: 'hata' },
};
export const TOPLANTI_YANITLARI: Record<ToplantiYaniti, { t: string; ton: RozetTonu; s: string }> = {
  yes: { t: 'Katılıyor', ton: 'tamam', s: '✓' },
  maybe: { t: 'Belki', ton: 'uyari', s: '?' },
  no: { t: 'Katılmıyor', ton: 'hata', s: '✕' },
};

type Ozellikler =
  | { tur: 'gorev'; durum: GorevDurumu }
  | { tur: 'siparis'; durum: SiparisOzeti['durum'] }
  | { tur: 'onay'; durum: 'wait' | 'ok' | 'no' }
  | { tur: 'toplanti'; durum: ToplantiYaniti };

export function DurumRozeti(o: Ozellikler) {
  const tanim = o.tur === 'gorev' ? GOREV_DURUMLARI[o.durum]
    : o.tur === 'siparis' ? SIPARIS_DURUMLARI[o.durum]
      : o.tur === 'onay' ? ONAY_DURUMLARI[o.durum]
        : TOPLANTI_YANITLARI[o.durum];
  return <Rozet ton={tanim.ton}>{tanim.t}</Rozet>;
}
