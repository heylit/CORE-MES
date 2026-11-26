import { useEffect, useRef, useState } from 'react';
import type { HazirlikMaddesi, StatuTopluCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import {
  kalemAnahtari, maddeGeriAlGovdeleri, maddeGovdeleri, maddeYazilacaklari, yazimOzeti, type Kalem, type MaddeEylemi, type YazimOzeti,
} from './adim-matrisi.ts';
import { KimlikDefteri, topluGonder } from './kimlik-defteri.ts';

// 3738 dilim 2: Tek madde merceğinin yazımı. Statü yazımıyla aynı kalıp: sayım yazmadan önce gösterilir, kalem başına bağımsız sonuç, son yazım
// bir sonraki işleme kadar geri alınabilir durur (tek hücreden yazımda sekiz saniye).
export interface MaddePlan { madde: HazirlikMaddesi; eylem: MaddeEylemi; kalemler: Kalem[]; gerekce: string; tek: boolean }
export interface MaddeSon {
  madde: HazirlikMaddesi; eylem: MaddeEylemi; gerekce: string; tek: boolean; ozet: YazimOzeti; yazilanlar: Kalem[]; geriAlindi: boolean;
}
const UC = '/adimli-emirler/hazirlik-toplu';
type Govdeler = ReturnType<typeof maddeGovdeleri>;

export function useMaddeYazimi(yenile: () => Promise<void>, bitti: (kalanlar: ReadonlySet<string>, coklu: boolean) => void) {
  const [plan, planYaz] = useState<MaddePlan | null>(null);
  const [son, sonYaz] = useState<MaddeSon | null>(null);
  const [mesgul, mesgulYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const sayac = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Her parça isteği kendi kimliğini taşır; sonucu bilinmeyen hatadan sonraki basış parçaların kimliğini korur.
  const [defter] = useState(() => new KimlikDefteri());
  useEffect(() => () => { if (sayac.current !== null) clearTimeout(sayac.current); }, []);

  const gonder = (govdeler: Govdeler) => topluGonder(defter, govdeler, (govde, d) => api.post<StatuTopluCevabi>(UC, govde, d));

  const uygula = async (p: MaddePlan) => {
    const yazilanlar = maddeYazilacaklari(p.kalemler, p.madde, p.eylem);
    mesgulYaz(true);
    hataYaz(null);
    try {
      const cevaplar = await gonder(maddeGovdeleri(p.kalemler, p.madde, p.eylem, p.gerekce));
      const ozet = yazimOzeti(cevaplar);
      const basarisiz = new Set(ozet.basarisiz.map((b) => b.anahtar));
      const tamam = new Set(cevaplar.flatMap((c) => c.kalemler.filter((k) => k.sonuc === 'yazildi' || k.sonuc === 'kaldirildi').map((k) => kalemAnahtari(k.emirId, k.isEmriId))));
      planYaz(null);
      sonYaz({ madde: p.madde, eylem: p.eylem, gerekce: p.gerekce, tek: p.tek, ozet, yazilanlar: yazilanlar.filter((k) => tamam.has(k.anahtar)), geriAlindi: false });
      if (sayac.current !== null) clearTimeout(sayac.current);
      // Tek hücreden yazımda sekiz saniye yeter; toplu yazımda şerit bir sonraki işleme kadar durur.
      if (p.tek && ozet.basarisiz.length === 0) sayac.current = setTimeout(() => { sonYaz((s) => (s !== null && s.tek ? null : s)); }, 8000);
      bitti(basarisiz, yazilanlar.length > 1);
      void yenile();
    } catch (x) {
      hataYaz(hataIletisi(x, 'Hazırlık yazılamadı.'));
    } finally {
      mesgulYaz(false);
    }
  };
  const geriAl = async () => {
    if (son === null) return;
    mesgulYaz(true);
    hataYaz(null);
    try {
      const cevaplar = await gonder(maddeGeriAlGovdeleri(son.yazilanlar, son.madde, son.eylem, son.gerekce));
      const ozet = yazimOzeti(cevaplar);
      sonYaz({ ...son, geriAlindi: true, ozet: { ...ozet, yazildi: 0 }, yazilanlar: [] });
      void yenile();
    } catch (x) {
      hataYaz(hataIletisi(x, 'Geri alınamadı.'));
    } finally {
      mesgulYaz(false);
    }
  };
  // Eylemi başlatır: toplu yazımda her zaman önce sayım gösterilir; tek hücrede gerekçe gerekmiyorsa hemen yazılır.
  const baslat = (kalemler: Kalem[], madde: HazirlikMaddesi, eylem: MaddeEylemi, tek: boolean, gerekceGerek: boolean) => {
    sonYaz(null);
    const p: MaddePlan = { madde, eylem, kalemler, gerekce: '', tek };
    if (tek && !gerekceGerek) { void uygula(p); return; }
    planYaz(p);
  };
  return { plan, planYaz, son, sonYaz, mesgul, hata, uygula, geriAl, baslat };
}
