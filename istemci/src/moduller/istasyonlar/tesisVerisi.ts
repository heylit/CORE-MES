import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type {
  EkiplerCevabi, EkipUyeleriCevabi, IsMerkezleriCevabi, IstasyonKisileriCevabi, IstasyonlarCevabi, KisiSecenekleriCevabi, MakineDurumlariCevabi,
  MakineKisileriCevabi, MakinelerCevabi, PlanAyarlariCevabi, YetkinliklerCevabi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import type { TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Vardiya modülünün takvim anahtarıdır: onun yazma komutu cevabı bu anahtara koyar, iki ekran aynı veriyi görür.
export const TAKVIM_ANAHTARI = ['vardiya', 'takvim'] as const;

// Sekmelerin ortak verisi. Anahtarlar ve adresler bölümün eski ekranlarıyla aynıdır: pencereler aynı önbelleği okur.
// Kişi seçenekleri yazma işlemi ister; okuyucu kişi adlarını atama satırlarından görür.
export function useTesisVerisi(yazabilir: boolean, etkin = true) {
  const merkezler = useQuery({ queryKey: anahtarlar.isMerkezleri, queryFn: () => api.get<IsMerkezleriCevabi>('/is-merkezleri?pasifler=true'), enabled: etkin });
  const istasyonlar = useQuery({ queryKey: anahtarlar.istasyonlar, queryFn: () => api.get<IstasyonlarCevabi>('/istasyonlar?pasifler=true'), enabled: etkin });
  const makineler = useQuery({ queryKey: anahtarlar.makineler, queryFn: () => api.get<MakinelerCevabi>('/makineler?pasifler=true'), enabled: etkin });
  const durumlar = useQuery({ queryKey: anahtarlar.makineDurumlari, queryFn: () => api.get<MakineDurumlariCevabi>('/makine-durumlari'), enabled: etkin });
  const ayarlar = useQuery({ queryKey: anahtarlar.planAyarlari, queryFn: () => api.get<PlanAyarlariCevabi>('/istasyon-plan-ayarlari'), enabled: etkin });
  const ekipler = useQuery({ queryKey: anahtarlar.ekipler, queryFn: () => api.get<EkiplerCevabi>('/ekipler?pasifler=true'), enabled: etkin });
  const istasyonKisileri = useQuery({ queryKey: anahtarlar.istasyonKisileri, queryFn: () => api.get<IstasyonKisileriCevabi>('/istasyon-kisileri'), enabled: etkin });
  const makineKisileri = useQuery({ queryKey: anahtarlar.makineKisileri, queryFn: () => api.get<MakineKisileriCevabi>('/makine-kisileri'), enabled: etkin });
  const ekipUyeleri = useQuery({ queryKey: anahtarlar.ekipUyeleri, queryFn: () => api.get<EkipUyeleriCevabi>('/ekip-uyeleri'), enabled: etkin });
  const yetkinlikler = useQuery({ queryKey: anahtarlar.yetkinlikler, queryFn: () => api.get<YetkinliklerCevabi>('/kisi-yetkinlikleri'), enabled: etkin });
  const kisiler = useQuery({
    queryKey: anahtarlar.kisiSecenekleri,
    queryFn: () => api.get<KisiSecenekleriCevabi>('/kisi-secenekleri'),
    enabled: etkin && yazabilir,
  });
  // Vardiya okunamazsa (sayfa.vardiya yoksa) haftalık saat "Alınamadı" yazar; bölüm yine açılır.
  const takvim = useQuery({ queryKey: TAKVIM_ANAHTARI, queryFn: () => api.get<TakvimCevabi>('/vardiya-takvimi'), retry: false, enabled: etkin });

  const temel = [merkezler, istasyonlar, makineler];
  return {
    yukleniyor: temel.some((s) => s.isPending),
    hata: temel.some((s) => s.isError),
    yenile: () => { for (const s of temel) void s.refetch(); },
    merkezler: merkezler.data?.isMerkezleri ?? [],
    istasyonlar: istasyonlar.data?.istasyonlar ?? [],
    makineler: makineler.data?.makineler ?? [],
    // Okunamayan yan veri boş dizi değil null'dur: ekran sıfır uydurmaz.
    durumlar: durumlar.data?.durumlar ?? (durumlar.isError ? null : undefined),
    ayarlar: ayarlar.data?.ayarlar ?? (ayarlar.isError ? null : undefined),
    ekipler: ekipler.data?.ekipler ?? (ekipler.isError ? null : undefined),
    istasyonKisileri: istasyonKisileri.data?.kisiler ?? (istasyonKisileri.isError ? null : undefined),
    makineKisileri: makineKisileri.data?.kisiler ?? (makineKisileri.isError ? null : undefined),
    ekipUyeleri: ekipUyeleri.data?.kisiler ?? (ekipUyeleri.isError ? null : undefined),
    yetkinlikler: yetkinlikler.data?.yetkinlikler ?? (yetkinlikler.isError ? null : undefined),
    kisiler: kisiler.data?.kisiler ?? (kisiler.isError ? null : undefined),
    takvim: takvim.data ?? (takvim.isError ? null : undefined),
  };
}
export type TesisVerisi = ReturnType<typeof useTesisVerisi>;

export interface HucreKomutu {
  yol: string;
  govde?: unknown;
  // Hata bu satırın altında yazar; aynı satırın sonraki başarılı yazısı iletiyi siler.
  satir: string;
}

export const ESKI_SURUM_UYARISI = 'Bu satırı arada başka biri değiştirdi; güncel hali yüklendi, değişikliğinizi yeniden girin.';

// Hücreden yazma: satırdan çıkınca tek komut gider. Eski sürümde (IS9) satır uyarır ve güncel veri yüklenir; üstüne yazılmaz.
export function useTesisYaz() {
  const istemci = useQueryClient();
  const [hatalar, hatalarYaz] = useState<Record<string, string>>({});
  const satirHatasi = (satir: string, ileti: string | null) => hatalarYaz((h) => {
    const yeni = { ...h };
    if (ileti === null) delete yeni[satir]; else yeni[satir] = ileti;
    return yeni;
  });
  const yaz = useMutation({
    mutationFn: ({ yol, govde }: HucreKomutu) => api.post(yol, govde),
    onSuccess: async (_c, k) => {
      satirHatasi(k.satir, null);
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    },
    onError: async (e, k) => {
      const eski = e instanceof ApiHatasi && eskiSurumMu(e.govde);
      satirHatasi(k.satir, eski ? ESKI_SURUM_UYARISI : hataIletisi(e, 'Kaydedilemedi.'));
      if (eski) await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    },
  });
  return { gonder: yaz.mutate, mesgul: yaz.isPending, hatalar };
}
export type TesisYaz = ReturnType<typeof useTesisYaz>;

export interface TopluKomut {
  yol: string;
  govde: unknown;
  // Kabul edilince (seçimi boşaltmak, pencereyi kapatmak için).
  tamam?: () => void;
}

// Toplu işlem ve çoklu ekle (kart #1296): hepsi ya da hiçbiri. Ret iletisi reddedilen kaydın kodunu taşır, kimliği satırı işaretler.
// Eski sürüm reddinde güncel veri yüklenir; seçim kalır, kullanıcı yeniden dener.
export function useTopluYaz() {
  const istemci = useQueryClient();
  const [ret, retYaz] = useState<{ ileti: string; kayitId: number | null } | null>(null);
  const yaz = useMutation({
    mutationFn: ({ yol, govde }: TopluKomut) => api.post(yol, govde),
    onSuccess: async (_c, k) => {
      retYaz(null);
      k.tamam?.();
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    },
    onError: async (e) => {
      const ayrinti = e instanceof ApiHatasi ? (e.govde.ayrinti as { kayitId?: unknown } | null | undefined) : undefined;
      retYaz({ ileti: hataIletisi(e, 'Kaydedilemedi; hiçbir kayıt değişmedi.'), kayitId: typeof ayrinti?.kayitId === 'number' ? ayrinti.kayitId : null });
      if (e instanceof ApiHatasi && eskiSurumMu(e.govde)) await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    },
  });
  return { gonder: yaz.mutate, mesgul: yaz.isPending, ret, temizle: () => retYaz(null) };
}
export type TopluYaz = ReturnType<typeof useTopluYaz>;
