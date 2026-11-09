import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MiniPanoCevabi, MiniPanoSecGovdesi } from '#paylasilan/sozlesme/profil.ts';
import { miniPanoDestekli, useMiniPanoPenceresi } from '../../ortak/arayuz/MiniPano.tsx';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { gorunenMiniPanolar, miniPanolar } from '../../ortak/rota/mini-pano.ts';
import { useHesapMaddesiDurumu, type UstEylemOzellikleri } from '../../ortak/rota/ust-eylemler.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';

// Mini pano seçimi kişinin profilindedir (2425-3 a): kapatılan panolar tutulur, kaydı olmayan kişide hepsi açıktır.
export const miniPanoAnahtari = (kisiId: number) => ['profil', 'mini-pano', kisiId] as const;

export const MINI_PANO_EYLEMI = 'mini-pano';

const OTURUMSUZ: readonly string[] = [];

// Kişinin yetkisiyle görebileceği panolar ve profildeki seçimi. Seçim okunamazsa hepsi açık sayılır: pano yine yetkiyle sınırlıdır.
export function useMiniPanoTercihi() {
  const oturum = useOturum().data;
  const kisiId = oturum?.id ?? null;
  const yetkili = gorunenMiniPanolar(miniPanolar, oturum?.islemler ?? OTURUMSUZ);
  const sorgu = useQuery({
    queryKey: miniPanoAnahtari(kisiId ?? 0),
    queryFn: () => api.get<MiniPanoCevabi>('/profil/mini-pano'),
    enabled: kisiId !== null && yetkili.length > 0,
    staleTime: Infinity,
  });
  const kapali = new Set(sorgu.data?.kapali ?? []);
  return { kisiId, yetkili, acik: yetkili.filter((p) => !kapali.has(p.anahtar)), tercih: sorgu.data };
}

export function useMiniPanoSec(kisiId: number | null) {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (govde: MiniPanoSecGovdesi) => api.post<MiniPanoCevabi>('/profil/mini-pano-sec', govde, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: (sonuc) => { if (kisiId !== null) istemci.setQueryData(miniPanoAnahtari(kisiId), sonuc); },
  });
}

const ONERILDI = 'tmi-mini-pano-onerildi';

// Hesap menüsünün "Mini pano" maddesi (2425, Arayüz kararı): kişinin açık panosu yoksa ya da tarayıcı pencereyi açamıyorsa
// (telefon, Firefox, Safari) madde çizilmez; pencere açıkken madde bunu söyler. "Açılışta öner" seçiliyse oturumda bir kez
// bildirim çıkar; pencere yalnız tıklamayla açıldığı için bildirimin "Aç" düğmesi açar.
export function MiniPanoEylemi({ acmaIstegi = 0 }: UstEylemOzellikleri) {
  const { acik, tercih } = useMiniPanoTercihi();
  const kullanilir = acik.length > 0 && miniPanoDestekli();
  const penceresi = useMiniPanoPenceresi(acik);
  const { bildir } = useBildirim();
  useHesapMaddesiDurumu(MINI_PANO_EYLEMI, !kullanilir, penceresi.acik ? 'Mini pano (açık)' : undefined);
  const ac = useRef(penceresi.ac);
  ac.current = penceresi.ac;
  // Yeniden çizilen düğme eski isteği yeniden açmaz: yalnız menüden gelen yeni seçim açar.
  const gorulenIstek = useRef(acmaIstegi);
  useEffect(() => {
    if (acmaIstegi === gorulenIstek.current) return;
    gorulenIstek.current = acmaIstegi;
    if (kullanilir) ac.current();
  }, [acmaIstegi, kullanilir]);
  const oner = kullanilir && tercih?.acilistaOner === true;
  useEffect(() => {
    if (!oner) return;
    try {
      if (sessionStorage.getItem(ONERILDI) !== null) return;
      sessionStorage.setItem(ONERILDI, '1');
    } catch { /* depolama kapalı: öneri bu açılışta bir kez çıkar */ }
    bildir('bilgi', 'Mini pano hazır.', { eylem: { etiket: 'Aç', yap: () => { ac.current(); } } });
  }, [oner, bildir]);
  return penceresi.cizim;
}
