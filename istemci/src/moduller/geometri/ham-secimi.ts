import { useCallback, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { GeometriHamCevabi, GeometriIsoGrubu, HamStokFormu } from '#paylasilan/sozlesme/geometri.ts';
import { api } from '../../ortak/veri/api.ts';
import { yerlesikKaliteSecenekleri } from '../malzemeler/disari.ts';
import type { KaliteSecenegi } from '../malzemeler/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FORM_ADI, ISO_GRUPLARI } from './gorunum.ts';

// 3321-2: Ham önerisi ve Süre kartlarının ortak seçimi adres satırındadır (pay, kesme, malzeme, elle ISO grubu, seçilen ham formu); iki
// kart aynı hamı ve aynı malzemeyi görür, bağlantı paylaşılınca seçim de gider. Kaydedilmez. Model seçilince adres yalnız rev'e döner.
// Malzeme adreste yoksa rotadaki hammadde girdisi (sunucu) varsayılandır; "kalite=" (boş) bütün kaliteler demektir.
export const SECIM_ANAHTARLARI = ['pay', 'kesme', 'kalite', 'sinif', 'iso', 'form'] as const;
type SecimAnahtari = (typeof SECIM_ANAHTARLARI)[number];

export const sayiOku = (metin: string): number | null => (metin.trim() === '' ? null : Number(metin.replace(',', '.')));
const gecerliMi = (x: number | null): boolean => x === null || (Number.isFinite(x) && x >= 0);

export interface EtkinMalzeme {
  kalite: string;
  sinif: string | null;
  kaynak: 'secim' | 'rota';
  // Malzemeler tablosundaki karşılığı (yoğunluk ve sınıf adı); özel kalitede null.
  secenek: KaliteSecenegi | null;
  rotaKodu: string | null;
}

export function useKaliteSecenekleri() {
  return useQuery({ queryKey: ['geometri', 'kalite-secenekleri'], queryFn: yerlesikKaliteSecenekleri, staleTime: Infinity });
}

// Kartın kalitesini Malzemeler tablosunda bulur: önce aynı aile ve kod, sonra yalnız kod (aile yazılmamış eski kart).
export function kaliteSecenegiBul(l: readonly KaliteSecenegi[], kod: string | null, aile: string | null = null): KaliteSecenegi | null {
  if (kod === null) return null;
  return l.find((k) => k.kod === kod && (aile === null || k.aile === aile)) ?? l.find((k) => k.kod === kod) ?? null;
}

export function useHamSecimi(revizyonId: number, etkin = true) {
  const [adres, adresYaz] = useSearchParams();
  const metin = (k: SecimAnahtari): string => adres.get(k) ?? '';
  const pay = metin('pay'), kesme = metin('kesme');
  const payMm = sayiOku(pay), kesmeMm = sayiOku(kesme);
  const payGecerli = gecerliMi(payMm), kesmeGecerli = gecerliMi(kesmeMm);
  const kaliteVar = adres.has('kalite');
  const secilenKalite = metin('kalite');
  const sinifMetni = metin('sinif');
  const isoMetni = metin('iso');
  const iso = (ISO_GRUPLARI as readonly string[]).includes(isoMetni) ? (isoMetni as GeometriIsoGrubu) : null;
  const formMetni = metin('form');
  const form = Object.hasOwn(FORM_ADI, formMetni) ? (formMetni as HamStokFormu) : null;
  const yaz = useCallback((degisen: Partial<Record<SecimAnahtari, string | null>>) => {
    adresYaz((onceki) => {
      const y = new URLSearchParams(onceki);
      for (const [k, v] of Object.entries(degisen)) {
        if (v === null) y.delete(k);
        else y.set(k, v);
      }
      return y;
    }, { replace: true });
  }, [adresYaz]);

  const secenekler = useKaliteSecenekleri();
  // Ham sorgusu: önce adresteki kaliteyle; adreste yoksa kalitesiz okunur, rotanın malzemesi gelince o kaliteyle yeniden okunur.
  const ilkSorgu = useHamSorgusu(revizyonId, payMm, kesmeMm, kaliteVar ? secilenKalite : '', etkin && payGecerli && kesmeGecerli);
  const rota = ilkSorgu.data?.rotaMalzemesi ?? null;
  const etkinMalzeme: EtkinMalzeme | null = useMemo(() => {
    const l = secenekler.data ?? [];
    if (kaliteVar) {
      if (secilenKalite === '') return null;
      const secenek = kaliteSecenegiBul(l, secilenKalite, sinifMetni === '' ? null : sinifMetni.split('/')[0] ?? null);
      return { kalite: secilenKalite, sinif: sinifMetni === '' ? secenek?.sinif ?? null : sinifMetni, kaynak: 'secim', secenek, rotaKodu: null };
    }
    if (rota === null || rota.kalite === null) return null;
    const secenek = kaliteSecenegiBul(l, rota.kaliteKodu, rota.aile);
    return { kalite: rota.kalite, sinif: rota.sinif ?? secenek?.sinif ?? null, kaynak: 'rota', secenek, rotaKodu: rota.kod };
  }, [kaliteVar, secilenKalite, sinifMetni, rota, secenekler.data]);
  const hamKalitesi = kaliteVar ? secilenKalite : (etkinMalzeme?.kalite ?? '');
  const ham = useHamSorgusu(revizyonId, payMm, kesmeMm, hamKalitesi, etkin && payGecerli && kesmeGecerli && (kaliteVar || ilkSorgu.isSuccess));
  // Süre isteği malzeme belli olunca gider: adreste yoksa rotanın malzemesi okunmuş, sınıfı bulmak için kalite tablosu yüklenmiş olmalı.
  const rotaOkundu = kaliteVar || ilkSorgu.isSuccess || ilkSorgu.isError;
  const tabloGerekir = kaliteVar ? secilenKalite !== '' && sinifMetni === '' : rota !== null && rota.kalite !== null && rota.sinif === null;
  const hazir = rotaOkundu && (!tabloGerekir || secenekler.isSuccess || secenekler.isError);
  return {
    pay, kesme, payMm, kesmeMm, payGecerli, kesmeGecerli, iso, form, yaz, hazir,
    malzeme: etkinMalzeme, kaliteSecenekleri: secenekler.data ?? null, hamKalitesi,
    // Varsayılan malzemenin kalitesiyle ikinci okuma bitene kadar ilk okuma gösterilir (kart boşalmaz).
    ham: ham.data === undefined && !kaliteVar ? ilkSorgu : ham,
  };
}

function useHamSorgusu(revizyonId: number, payMm: number | null, kesmeMm: number | null, kalite: string, enabled: boolean) {
  return useQuery({
    queryKey: anahtarlar.ham(revizyonId, payMm ?? -1, kalite, kesmeMm ?? -1),
    queryFn: () => api.get<GeometriHamCevabi>(`/geometri/ham-onerisi/${String(revizyonId)}${sorguMetni({ payMm, kesmeMm, kalite })}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function sorguMetni(g: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(g)) if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s === '' ? '' : `?${s}`;
}
