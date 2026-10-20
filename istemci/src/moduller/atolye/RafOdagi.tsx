import { useEffect, useMemo } from 'react';
import type { GozKalemi, Raf, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { Dugme, Secim } from '../../ortak/arayuz/index.ts';
import { rafOzetleri } from './DepoGorunumu.tsx';
import { GozPaneli } from './GozPaneli.tsx';
import { hucreAnahtari } from './kurallar.ts';

// Bölmeye karşıdan bakış: sahne yalnız seçili raf bölmesini tam karşıdan, ekrana sığdırarak gösterir; öbür her şey
// gizlenir. Üst çubuk bölme ve raf değiştirir; göze basınca içi yanda açılır. Oklar bölme değiştirir, Escape çıkar.

export interface RafOdakSecimi {
  rafId: number;
  bolme: number;
  kat: number | null;
  goz: number | null;
}

interface Ozellikler {
  yerlesim: YerlesimCevabi;
  raf: Raf;
  secim: RafOdakSecimi;
  secimYaz: (s: RafOdakSecimi | null) => void;
  gozKalemleri: readonly GozKalemi[] | undefined;
  yazabilir: boolean;
  depodaAc: (rafId: number, bolme: number, kat: number | null, goz: number | null) => void;
}

const yaziyor = (el: Element | null): boolean => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

export function RafOdagi({ yerlesim: y, raf, secim, secimYaz, gozKalemleri, yazabilir, depodaAc }: Ozellikler) {
  const raflar = useMemo(() => [...y.raflar].sort((a, b) => a.kod.localeCompare(b.kod, 'tr')), [y.raflar]);
  const ozetler = useMemo(() => rafOzetleri(gozKalemleri ?? [], raf.id), [gozKalemleri, raf.id]);
  const { bolme, kat, goz } = secim;
  const bolmeSec = (b: number) => secimYaz({ rafId: raf.id, bolme: Math.min(raf.bolmeSayisi, Math.max(1, b)), kat: null, goz: null });

  // Oklar bölme değiştirir (son bölmeden sonraki rafa geçer); Escape önce gözü, sonra bakışı kapatır.
  const sira = raflar.findIndex((r) => r.id === raf.id);
  const ileri = () => {
    if (bolme < raf.bolmeSayisi) { bolmeSec(bolme + 1); return; }
    const sonraki = raflar[sira + 1];
    if (sonraki) secimYaz({ rafId: sonraki.id, bolme: 1, kat: null, goz: null });
  };
  const geri = () => {
    if (bolme > 1) { bolmeSec(bolme - 1); return; }
    const onceki = raflar[sira - 1];
    if (onceki) secimYaz({ rafId: onceki.id, bolme: onceki.bolmeSayisi, kat: null, goz: null });
  };
  const tuslar = { ileri, geri, kapat: () => (kat !== null ? secimYaz({ ...secim, kat: null, goz: null }) : secimYaz(null)) };
  useEffect(() => {
    const tus = (o: KeyboardEvent) => {
      if (yaziyor(document.activeElement) || document.querySelector('[role="dialog"]')) return;
      if (o.key === 'ArrowRight') { o.preventDefault(); tuslar.ileri(); }
      if (o.key === 'ArrowLeft') { o.preventDefault(); tuslar.geri(); }
      if (o.key === 'Escape') tuslar.kapat();
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  });

  const ilkMi = bolme <= 1 && sira <= 0;
  const sonMu = bolme >= raf.bolmeSayisi && sira >= raflar.length - 1;
  return (
    <>
      <div className="tc-atolye-odak-cubuk" role="toolbar" aria-label="Bölme görünümü">
        <Dugme className="tc-atolye-ok" aria-label="Önceki bölme" title="Önceki bölme" disabled={ilkMi} onClick={geri}>‹</Dugme>
        <Secim
          etiket="Raf"
          secenekler={raflar.map((r) => ({ deger: String(r.id), baslik: `${r.kod} · ${r.ad}` }))}
          value={String(raf.id)}
          onChange={(o) => secimYaz({ rafId: Number(o.target.value), bolme: 1, kat: null, goz: null })}
        />
        <strong className="mono" aria-live="polite">Bölme {String(bolme).padStart(2, '0')}/{String(raf.bolmeSayisi).padStart(2, '0')}</strong>
        <Dugme className="tc-atolye-ok" aria-label="Sonraki bölme" title="Sonraki bölme" disabled={sonMu} onClick={ileri}>›</Dugme>
        <span className="tc-atolye-ipucu tc-atolye-masaustu">Göze bas: içi · ← →: bölme · Esc: çık</span>
        <Dugme simge="box" onClick={() => depodaAc(raf.id, bolme, kat, goz)}>Depoda</Dugme>
        <Dugme simge="x" onClick={() => secimYaz(null)}>Kapat</Dugme>
      </div>
      {kat !== null && goz !== null && (
        <div className="tc-atolye-odak-panel">
          <GozPaneli
            key={`${raf.id}-${bolme}-${kat}-${goz}`}
            rafId={raf.id}
            bolme={bolme}
            kat={kat}
            goz={goz}
            kalemler={ozetler.get(hucreAnahtari(bolme, kat, goz))?.kalemler ?? []}
            yazabilir={yazabilir}
            rafAktif={raf.aktif}
            kapat={() => secimYaz({ ...secim, kat: null, goz: null })}
          />
        </div>
      )}
    </>
  );
}
