import { useEffect, useMemo, useRef, useState } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useOturum } from '../../../../ortak/veri/oturum.ts';
import { useBirimSistemi } from '../tercihler.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { kayitHatasi, useAyarKaydet, useKartlar } from '../veri.ts';
import {
  TABAN, ayarliTablolar, bolumBaglami, type AyarliTablolar, type GenelAyar, type HamTablolar, type KuralBaglami,
} from './kaynak.ts';
import { ayarVerisi, kayitBicimi, type AyarVerisi, type KategoriTuru, type Sonuc } from './islemler.ts';

// Genel ayar kaydında giden anahtarlar (prototipin AYAR_SUNUCU listesi); geri kalanı sunucuya gitmez.
const GENEL_ANAHTARLAR = ['onayAkisi', 'dortGoz', 'kodYapisi', 'acUzunluk', 'acBuyuk', 'qrAdres', 'firmaKodu', 'firmaKoduTurleri'] as const;

// Bölümler arasında geçerken kalan seçimler (prototipte aynı oturumda kalırdı).
export interface Secimler {
  aile: string;
  sinif: string;
  form: string;
  kat: string;
  kuralTur: string;
  yeni: string | null;
  kaliteDuz: string | null;
}

export interface Duzen {
  o: EkranOzellikleri;
  v: AyarVerisi;
  t: AyarliTablolar;
  taban: HamTablolar;
  b: KuralBaglami;
  genel: GenelAyar;
  // Yazamayan kullanıcı ayarı yalnız görür: düğmeler gizli, anahtarlar kilitli.
  ro: boolean;
  secim: Secimler;
  sec: (s: Partial<Secimler>) => void;
  acikListeler: ReadonlySet<string>;
  listeAc: (id: string, acik: boolean) => void;
  degis: (yeni: AyarVerisi, ileti?: string) => void;
  uygula: (s: Sonuc) => boolean;
  genelYaz: (degisen: Partial<Record<(typeof GENEL_ANAHTARLAR)[number], unknown>>, ileti?: string) => void;
  bildir: ReturnType<typeof useBildirim>['bildir'];
}

export const kategoriTablosu = (t: AyarliTablolar, tur: KategoriTuru) => (tur === 'sarf' ? t.SARF_KAT : t.DB_KAT);

export function useAyarDuzeni(o: EkranOzellikleri): Duzen {
  const { bildir } = useBildirim();
  const kaydet = useAyarKaydet();
  const kartlar = useKartlar().data;
  const kullanici = useOturum().data;
  const [birim] = useBirimSistemi();
  const kisi = useMemo(() => ({ id: kullanici?.id ?? 0, ad: kullanici?.ad ?? '' }), [kullanici]);
  const ro = !o.yetki.ayarYaz;

  const sunucuAyari = useMemo(() => ayarVerisi(o.ortam.malzemeAyari), [o.ortam.malzemeAyari]);
  const sunucuGeneli = o.ortam.genel;
  // Kayıt sürerken ekran son yapılan değişikliği gösterir; bütün kayıtlar bitince sunucunun cevabına döner.
  const [yerel, yerelYaz] = useState<AyarVerisi | null>(null);
  const [yerelGenel, yerelGenelYaz] = useState<GenelAyar | null>(null);
  const bekleyen = useRef(0);
  useEffect(() => { if (bekleyen.current === 0) { yerelYaz(null); yerelGenelYaz(null); } }, [sunucuAyari, sunucuGeneli]);

  const v = yerel ?? sunucuAyari;
  const genel = yerelGenel ?? sunucuGeneli;
  const kayitli = useMemo(() => kayitBicimi(v), [v]);
  const b = useMemo(
    () => bolumBaglami({ ortam: o.ortam, kartlar, kisi, birim, yetki: o.yetki }, kayitli, genel),
    [o.ortam, o.yetki, kartlar, kisi, birim, kayitli, genel],
  );
  const t = ayarliTablolar(b);

  const [secim, secimYaz] = useState<Secimler>({ aile: 'metal', sinif: '', form: 'levha', kat: '', kuralTur: 'mamul', yeni: null, kaliteDuz: null });
  const [acikListeler, acikYaz] = useState<ReadonlySet<string>>(new Set());

  const yaz = (anahtar: 'malzeme' | 'genel', deger: unknown, geriAl: () => void) => {
    bekleyen.current += 1;
    kaydet.mutate({ anahtar, deger } as never, {
      onError: (e: unknown) => { geriAl(); bildir('hata', kayitHatasi(e).ileti); },
      onSettled: () => { bekleyen.current -= 1; },
    });
  };

  const degis = (yeni: AyarVerisi, ileti?: string) => {
    if (ro) { bildir('hata', 'Malzeme ayarlarını yalnız yönetici değiştirebilir.'); return; }
    yerelYaz(yeni);
    yaz('malzeme', kayitBicimi(yeni), () => yerelYaz(null));
    if (ileti) bildir('tamam', ileti);
  };

  const uygula = (s: Sonuc) => {
    if (!s.tamam) { bildir('hata', s.ileti); return false; }
    degis(s.ayar, s.ileti);
    return true;
  };

  const genelYaz: Duzen['genelYaz'] = (degisen, ileti) => {
    if (ro) { bildir('hata', 'Malzeme ayarlarını yalnız yönetici değiştirebilir.'); return; }
    const g = genel as unknown as Record<string, unknown>;
    const deger: Record<string, unknown> = {};
    GENEL_ANAHTARLAR.forEach((k) => { if (g[k] !== undefined) deger[k] = g[k]; });
    Object.assign(deger, degisen);
    yerelGenelYaz({ ...genel, ...degisen } as GenelAyar);
    yaz('genel', deger, () => yerelGenelYaz(null));
    if (ileti) bildir('tamam', ileti);
  };

  return {
    o, v, t, taban: TABAN, b, genel, ro, secim,
    sec: (s) => secimYaz((onceki) => ({ ...onceki, ...s })),
    acikListeler,
    listeAc: (id, acik) => acikYaz((onceki) => {
      const l = new Set(onceki);
      if (acik) l.add(id); else l.delete(id);
      return l;
    }),
    degis, uygula, genelYaz, bildir,
  };
}

// Seçili aile ve sınıf geçersizse ilk geçerliye düşer (aile silinmiş, sınıf başka ailede).
export function gecerliAileSinif(d: Duzen): { aile: string; sinif: string } {
  const aile = d.t.FAMS[d.secim.aile] ? d.secim.aile : 'metal';
  const siniflar = Object.keys(d.t.FAMS[aile]?.classes ?? {});
  const sinif = siniflar.includes(d.secim.sinif) ? d.secim.sinif : siniflar[0] ?? '';
  return { aile, sinif };
}
