import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MiniPanoCevabi, MiniPanoSecGovdesi } from '#paylasilan/sozlesme/profil.ts';
import { MiniPanoDugmesi, miniPanoDestekli, useMiniPanoPenceresi } from '../../ortak/arayuz/MiniPano.tsx';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { gorunenMiniPanolar, miniPanolar, type MiniPano } from '../../ortak/rota/mini-pano.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';

// Mini pano seçimi kişinin profilindedir (2425-3 a): kapatılan panolar tutulur, kaydı olmayan kişide hepsi açıktır.
export const miniPanoAnahtari = (kisiId: number) => ['profil', 'mini-pano', kisiId] as const;

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

// Üst çubuktaki düğme: kişinin açık panosu yoksa ya da tarayıcı pencereyi açamıyorsa (telefon, Firefox, Safari) çizilmez. "Açılışta öner" seçiliyse oturumda bir kez bildirim çıkar;
// pencere yalnız tıklamayla açıldığı için bildirimin "Aç" düğmesi açar.
export function MiniPanoEylemi() {
  const { acik, tercih } = useMiniPanoTercihi();
  if (acik.length === 0 || !miniPanoDestekli()) return null;
  return <MiniPanoAcici panolar={acik} oner={tercih?.acilistaOner === true} />;
}

function MiniPanoAcici({ panolar, oner }: { panolar: readonly MiniPano[]; oner: boolean }) {
  const penceresi = useMiniPanoPenceresi(panolar);
  const { bildir } = useBildirim();
  const ac = useRef(penceresi.ac);
  ac.current = penceresi.ac;
  useEffect(() => {
    if (!oner) return;
    try {
      if (sessionStorage.getItem(ONERILDI) !== null) return;
      sessionStorage.setItem(ONERILDI, '1');
    } catch { /* depolama kapalı: öneri bu açılışta bir kez çıkar */ }
    bildir('bilgi', 'Mini pano hazır.', { eylem: { etiket: 'Aç', yap: () => { ac.current(); } } });
  }, [oner, bildir]);
  return <MiniPanoDugmesi penceresi={penceresi} />;
}
