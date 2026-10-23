import type { ComponentType } from 'react';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { AyrintiSayfasi } from './ayrinti/index.tsx';
import { Ayarlar, KuralFormu } from './ayarlar/index.tsx';
import { Bugun } from './bugun/index.tsx';
import type { FormIstegi, FormOzellikleri, Gorunum } from './durum.tsx';
import { GorevFormu, Isler, OnayFormu } from './isler/index.tsx';
import type { Sayaclar } from './kurallar.ts';
import { Siparisler } from './siparisler/index.tsx';
import { DuyuruFormu, KanalFormu, Sohbet, ZamanlaFormu } from './sohbet/index.tsx';
import { Takvim, ToplantiFormu } from './takvim/index.tsx';
import { YeniSecici } from './Yeni.tsx';

// Parçaların kayıt yeri (M0). Parça bu dosyaya dokunmaz; yeni kayıt satırı M0'a istek olarak gelir.

export interface GorunumTanimi {
  anahtar: Gorunum;
  baslik: string;
  simge: SimgeAdi;
  ekran: ComponentType;
  // Sekmedeki sayaç (eski ekranın navCount'u); null: sayaç yok.
  sayac: ((s: Sayaclar) => number) | null;
}

export const GORUNUM_TANIMLARI: readonly GorunumTanimi[] = [
  { anahtar: 'bugun', baslik: 'Bugün', simge: 'home', ekran: Bugun, sayac: (s) => s.duyuru },
  { anahtar: 'sohbet', baslik: 'Sohbet', simge: 'users', ekran: Sohbet, sayac: (s) => s.sohbet },
  { anahtar: 'isler', baslik: 'İşler', simge: 'clipboard-check', ekran: Isler, sayac: (s) => s.isler },
  { anahtar: 'takvim', baslik: 'Takvim', simge: 'clock', ekran: Takvim, sayac: (s) => s.toplanti },
  { anahtar: 'siparisler', baslik: 'Siparişler', simge: 'box', ekran: Siparisler, sayac: (s) => s.siparis },
  { anahtar: 'ayarlar', baslik: 'Ayarlar ve otomasyon', simge: 'gear', ekran: Ayarlar, sayac: null },
];

type FormKaydi = { [T in FormIstegi['tur']]: ComponentType<FormOzellikleri<T>> };

export const FORMLAR: FormKaydi = {
  yeni: YeniSecici,
  gorev: GorevFormu,
  onay: OnayFormu,
  toplanti: ToplantiFormu,
  duyuru: DuyuruFormu,
  zamanla: ZamanlaFormu,
  kanal: KanalFormu,
  kural: KuralFormu,
};

export { AyrintiSayfasi };

// Eski ekranın lastView değerleri (eski ekranla ortak tercih belgesi).
export const ESKI_GORUNUM: Record<Gorunum, string> = {
  bugun: 'today', sohbet: 'chat', isler: 'work', takvim: 'cal', siparisler: 'orders', ayarlar: 'admin',
};
export const eskiGorunumden = (v: string | null | undefined): Gorunum | null =>
  (Object.entries(ESKI_GORUNUM).find(([, e]) => e === v)?.[0] as Gorunum | undefined) ?? null;
