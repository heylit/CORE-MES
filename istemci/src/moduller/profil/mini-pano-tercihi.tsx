import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MiniPanoCevabi, MiniPanoSecGovdesi } from '#paylasilan/sozlesme/profil.ts';
import { miniPanoDestekli, useMiniPanoPenceresi } from '../../ortak/arayuz/MiniPano.tsx';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { gorunenMiniPanolar, miniPanolar, type MiniPano } from '../../ortak/rota/mini-pano.ts';
import { useHesapMaddesiDurumu, type UstEylemOzellikleri } from '../../ortak/rota/ust-eylemler.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { koseyeCekil, panoDenetiminiYaz, panoDurumuMu, panoKanali, panoPenceresiniAc, panoPenceresiniAcYaDaOneGetir, panoPenceresindeMi, yerineDon, type PanoDurumu } from './mini-pano-penceresi.ts';

// Mini pano seçimi kişinin profilindedir (2425-3 a): kapatılan panolar tutulur, kaydı olmayan kişide hepsi açıktır.
export const miniPanoAnahtari = (kisiId: number) => ['profil', 'mini-pano', kisiId] as const;

export const MINI_PANO_EYLEMI = 'mini-pano';

const OTURUMSUZ: readonly string[] = [];
const BOS: readonly MiniPano[] = [];
const PANO_YENILEME_MS = 20_000;
const ustPencere = (): Window | null =>
  (globalThis as unknown as { documentPictureInPicture?: { window: Window | null } }).documentPictureInPicture?.window ?? null;

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
// (telefon, Firefox, Safari) madde çizilmez. Madde panoyu bu sekmede değil küçük pano penceresinde açtırır (3093 a); pano
// oradayken madde bunu söyler. "Açılışta öner" seçiliyse oturumda bir kez bildirim çıkar; "Aç" düğmesi küçük pencereyi açar.
export function MiniPanoEylemi({ acmaIstegi = 0 }: UstEylemOzellikleri) {
  const { acik, tercih } = useMiniPanoTercihi();
  const kullanilir = acik.length > 0 && miniPanoDestekli();
  const [panoAcik, panoAcikYaz] = useState(false);
  const { bildir } = useBildirim();
  const burasi = panoPenceresindeMi();
  // Yalnız pano penceresinde üstteki panoyu tutar; ana sekme panoyu kendisi açmaz (3093 a).
  const ust = useMiniPanoPenceresi(burasi ? acik : BOS);
  useEffect(() => { if (burasi) panoDenetiminiYaz({ acik: ust.acik, ac: ust.ac }); }, [burasi, ust.acik, ust.ac]);
  // Pano açıkken taşıyıcı pencere köşede küçük durur; pano kapanınca eski boyutuna ve yerine döner (3153 b).
  useEffect(() => {
    if (!burasi || !ust.acik) return undefined;
    const onceki = koseyeCekil();
    return () => { yerineDon(onceki); };
  }, [burasi, ust.acik]);
  const istemci = useQueryClient();
  // Pano penceresi simge durumundayken tarayıcı onun zamanlayıcılarını yavaşlatabilir; üstteki pano görünür kaldığı için
  // yenileme onun zamanlayıcısıyla da tetiklenir.
  useEffect(() => {
    const pencere = ust.acik ? ustPencere() : null;
    if (pencere === null) return undefined;
    const z = pencere.setInterval(() => { void istemci.refetchQueries({ type: 'active' }); }, PANO_YENILEME_MS);
    return () => { pencere.clearInterval(z); };
  }, [ust.acik, istemci]);
  useHesapMaddesiDurumu(MINI_PANO_EYLEMI, !kullanilir, panoAcik || ust.acik ? 'Mini pano (açık)' : undefined);
  // Pano penceresi durumunu duyurur, ana sekme açılışta sorar (Hesap menüsündeki "(açık)"); ana sekmeden "öne gel" alır.
  useEffect(() => {
    const kanal = panoKanali();
    if (kanal === null) return undefined;
    if (burasi) {
      const duyur = (a: boolean, v: boolean) => { kanal.postMessage({ acik: a, var: v } satisfies PanoDurumu); };
      duyur(ust.acik, true);
      kanal.onmessage = (o: MessageEvent<unknown>) => {
        if (o.data === 'sor') duyur(ust.acik, true);
        else if (o.data === 'one-gel') { window.focus(); if (ust.acik) ust.ac(); }
      };
      const kapanirken = () => { duyur(false, false); };
      window.addEventListener('pagehide', kapanirken);
      return () => { window.removeEventListener('pagehide', kapanirken); kanal.close(); };
    }
    kanal.onmessage = (o: MessageEvent<unknown>) => { if (panoDurumuMu(o.data)) panoAcikYaz(o.data.acik); };
    kanal.postMessage('sor');
    return () => { kanal.close(); };
  }, [burasi, ust.acik, ust.ac]);
  const ac = useCallback(() => {
    // Pano penceresinin kendisinde yeni pencere aranmaz: aynı adla kendisi döner.
    void (burasi ? Promise.resolve(panoPenceresiniAc()) : panoPenceresiniAcYaDaOneGetir()).then((oldu) => {
      if (!oldu) bildir('hata', 'Mini pano penceresi açılamadı; tarayıcının açılır pencere iznini verin.');
    });
  }, [bildir, burasi]);
  // Yeniden çizilen düğme eski isteği yeniden açmaz: yalnız menüden gelen yeni seçim açar.
  const gorulenIstek = useRef(acmaIstegi);
  useEffect(() => {
    if (acmaIstegi === gorulenIstek.current) return;
    gorulenIstek.current = acmaIstegi;
    if (kullanilir) ac();
  }, [acmaIstegi, kullanilir, ac]);
  const oner = kullanilir && tercih?.acilistaOner === true && !panoAcik;
  useEffect(() => {
    if (!oner) return;
    try {
      if (sessionStorage.getItem(ONERILDI) !== null) return;
      sessionStorage.setItem(ONERILDI, '1');
    } catch { /* depolama kapalı: öneri bu açılışta bir kez çıkar */ }
    bildir('bilgi', 'Mini pano hazır.', { eylem: { etiket: 'Aç', yap: ac } });
  }, [oner, bildir, ac]);
  return burasi ? ust.cizim : null;
}
