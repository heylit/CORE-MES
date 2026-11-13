import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { AdimListesi, DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { adimCevabiUygula, adimYaz } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { useArkon, useArkonDurumu } from '../veri/baglam.ts';
import type { TmiAdim } from '../veri/depo.ts';
import { MontajSahnesi } from './MontajSahnesi.tsx';
import type { Pkg } from './tipler.ts';

// 1999 a: sağ sütun kaymasın diye adımlar sayfa sayfa gösterilir; sayfa boyu sabit, ilk açılışta ilk yapılmamış adımın sayfası.
// Yana kaydırmak da sayfa çevirir (yalnız bakar); kaydırmanın sonundaki tıklama adımı işaretlemesin diye yutulur.
export const ADIM_SAYFASI = 4;
const KAYDIR = 60;

function useSayfa(liste: readonly { tamam: boolean }[]) {
  const sayfaSayisi = Math.max(1, Math.ceil(liste.length / ADIM_SAYFASI));
  const [sayfa, sayfaYaz] = useState<number | null>(null);
  // Açılış sayfası liste gelince bir kez seçilir; işaretlemek sayfayı kendiliğinden çevirmez.
  const acilis = useRef<number | null>(null);
  if (acilis.current === null && liste.length) acilis.current = Math.floor(Math.max(liste.findIndex((x) => !x.tamam), 0) / ADIM_SAYFASI);
  const s = Math.min(sayfa ?? acilis.current ?? 0, sayfaSayisi - 1);
  const gezgin = sayfaSayisi > 1 ? (
    <nav className="tc-ay1-adim-sayfa" aria-label="Adım sayfaları">
      <button type="button" className="tc-ay1-simge-dugme" aria-label="Önceki adımlar" disabled={s <= 0} onClick={() => sayfaYaz(s - 1)}><Simge ad="chev-left" /></button>
      <b className="tc-ay1-mono">{`${s + 1} / ${sayfaSayisi}`}</b>
      <button type="button" className="tc-ay1-simge-dugme" aria-label="Sonraki adımlar" disabled={s >= sayfaSayisi - 1} onClick={() => sayfaYaz(s + 1)}><Simge ad="chev-right" /></button>
    </nav>
  ) : null;
  const tutus = useRef<{ x: number; y: number; id: number } | null>(null);
  const yut = useRef(false);
  const surukle: HTMLAttributes<HTMLDivElement> = sayfaSayisi > 1 ? {
    onPointerDown: (e) => { tutus.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; yut.current = false; },
    onPointerUp: (e) => {
      const t = tutus.current;
      tutus.current = null;
      if (!t || t.id !== e.pointerId) return;
      const dx = e.clientX - t.x;
      if (Math.abs(dx) < KAYDIR || Math.abs(dx) < Math.abs(e.clientY - t.y) * 2) return;
      yut.current = true;
      sayfaYaz(Math.min(sayfaSayisi - 1, Math.max(0, s + (dx < 0 ? 1 : -1))));
    },
    onPointerCancel: () => { tutus.current = null; },
    onClickCapture: (e) => { if (yut.current) { yut.current = false; e.preventDefault(); e.stopPropagation(); } },
  } : {};
  return { sayfa: sayfaSayisi > 1 ? { boyut: ADIM_SAYFASI, no: s } : undefined, gezgin, surukle };
}

// Operasyon adımları (operator-parcalar.ts Steps). TMI emrinde adımlar emrin talimatıdır ve işaret TMI'ye yazılır; yerel pakette
// paketin adımları ekranda işaretlenir, kayda gitmez. Önizlemede TMI'ye yazılmaz, paketin adımları gösterilir.

// 3209 a: iş emri bilinirse ve talimatında 3B sahne varsa adımların üstünde "3B montaj" açılır (yalnız sunucu kipinde).
export function Adimlar({ adimlar, emirId, onizleme, isEmriId = null }: { adimlar: Pkg['steps'] | undefined; emirId: number | null; onizleme: boolean; isEmriId?: number | null }) {
  const durum = useArkonDurumu();
  return emirId !== null && !onizleme && durum.mode === 'server' ? <TmiAdimlari emirId={emirId} isEmriId={isEmriId} /> : <YerelAdimlar adimlar={adimlar} />;
}

function TmiAdimlari({ emirId, isEmriId }: { emirId: number; isEmriId: number | null }) {
  const { depo } = useArkon();
  const [liste, listeYaz] = useState<TmiAdim[] | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const suruyor = useRef(new Set<number>());
  useEffect(() => {
    let canli = true;
    depo.Server.tmiAdimlari(emirId).then((l) => { if (canli) listeYaz(l); }, () => { if (canli) { listeYaz([]); hataYaz('Adımlar alınamadı'); } });
    return () => { canli = false; };
  }, [depo, emirId]);
  const isaretle = (id: number, tamam: boolean) => {
    if (suruyor.current.has(id)) return;
    suruyor.current.add(id);
    hataYaz(null);
    listeYaz((l) => l && adimYaz(l, id, (x) => ({ ...x, tamam })));
    depo.Server.tmiAdimIsaretle(emirId, id, tamam)
      .then((c) => listeYaz((l) => l && adimCevabiUygula(l, id, c)))
      .catch((e: unknown) => {
        listeYaz((l) => l && adimYaz(l, id, (x) => ({ ...x, tamam: !tamam })));
        hataYaz(`Adım kaydedilmedi · ${(e instanceof Error && e.message) || 'CORE kabul etmedi'}`);
      })
      .finally(() => { suruyor.current.delete(id); });
  };
  const { sayfa, gezgin, surukle } = useSayfa(liste ?? []);
  if (liste === null) return <DurumKutusu durum="yukleniyor" mesaj="Adımlar yükleniyor" />;
  return (
    <div className="tc-ay1-adimlar" {...surukle}>
      {hata ? <p className="tc-ay1-hata" role="alert">{hata}</p> : null}
      {isEmriId !== null && liste.length > 0 ? <MontajSahnesi isEmriId={isEmriId} adimlar={liste} /> : null}
      <AdimListesi baslik="Operasyon adımları · CORE'a yazılır" adimlar={liste} sayfa={sayfa} degistir={isaretle} bosMesaj="Bu emrin talimat adımı yok" />
      {gezgin}
    </div>
  );
}

export function YerelAdimlar({ adimlar }: { adimlar: Pkg['steps'] | undefined }) {
  const L = adimlar || [];
  const [on, onYaz] = useState<Record<string, boolean>>(() => Object.fromEntries(L.filter((s) => s.on).map((s) => [s.id, true])));
  const zorunlu = L.filter((s) => s.r).length;
  const liste = L.map((s, i) => ({ id: i, ad: s.t, aciklama: s.d || null, tamam: !!on[s.id], not: s.r ? 'Zorunlu' : null }));
  const { sayfa, gezgin, surukle } = useSayfa(liste);
  return (
    <div className="tc-ay1-adimlar" {...surukle}>
      <AdimListesi
        baslik={`Operasyon adımları${L.length ? ` · ${zorunlu} zorunlu` : ''}`}
        adimlar={liste}
        sayfa={sayfa}
        degistir={(i, tamam) => { const s = L[i]; if (s) onYaz((x) => ({ ...x, [s.id]: tamam })); }}
        bosMesaj="Bu işin paketinde adım yok"
      />
      {gezgin}
    </div>
  );
}
