import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { Sihirbaz, type SihirbazDegeri, type SihirbazTanimi } from '../ortak/sade/index.ts';
import { Acilim, izinYok, type AcilimSecenegi } from './IsiHaritasi.tsx';

// Açılımın form kısmı (zz30-isi isAcilim, isFormAc, isIlkForm): hücre seçilince ilk izinli form sipariş dolu açılır; kayıttan sonra "Kaydedildi"
// ve "Yeniden düzenle"; öteki formlar "Ya da"da. tanim null: kişinin izni yok (eski yetki süzgeci gibi görünmez). kapali: form sahibinin
// alanını yazar (222 a), yerinde pasif görünür, altında not (Soru 466/1 a).
export interface AcilimFormu {
  ad: string; etki: string; simge: SimgeAdi; tanim: SihirbazTanimi | null; deg: SihirbazDegeri; adim?: number; kapali?: string;
}

export function FormluAcilim({ baslik, ton, neden, bilgi, formlar, secenekler = [], sonNot, kapat }: {
  baslik: string; ton: string; neden: string; bilgi?: readonly [string, string][]; formlar: readonly AcilimFormu[];
  secenekler?: readonly AcilimSecenegi[]; sonNot?: string; kapat: () => void;
}) {
  const izinli = formlar.map((f, i) => ({ f, i })).filter((x) => x.f.tanim !== null && !x.f.kapali);
  const pasif = formlar.filter((f) => Boolean(f.kapali));
  const [acik, acikYaz] = useState<number | null>(izinli[0]?.i ?? null);
  const [fi, fiYaz] = useState<number | null>(izinli[0]?.i ?? null);
  const [son, sonYaz] = useState<string | null>(null);
  const ac = (i: number) => { acikYaz(i); fiYaz(i); sonYaz(null); };
  const f = acik === null ? undefined : formlar[acik];
  const kap = useRef<HTMLDivElement>(null);
  // Esc açılımı kapatır; açılınca ve form açılınca odak formun ilk alanına gider, form yoksa ilk düğmeye (zz30-isi keydown, isOdak).
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key !== 'Escape' || e.defaultPrevented) return; e.preventDefault(); kapat(); };
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('keydown', tus); };
  }, [kapat]);
  useEffect(() => {
    const ac = kap.current?.querySelector('.tc-pys-ac'); if (!ac) return;
    ac.scrollIntoView?.({ block: 'nearest' });
    const ilk = ac.querySelector<HTMLElement>('form input:not([type=hidden]), form select, form textarea, form button[type=submit]')
      ?? (acik === null ? ac.querySelector<HTMLElement>('.tc-pys-form button:not([disabled])') : null);
    ilk?.focus();
  }, [acik]);

  let govde: ReactNode;
  if (f?.tanim) {
    govde = (
      <Sihirbaz key={acik} tanim={f.tanim} acilis={{ deg: f.deg, adim: f.adim, geriSiniri: true }}
        vazgec={() => { acikYaz(null); }} bitti={(m) => { sonYaz(m); acikYaz(null); }} />
    );
  } else {
    const ana = izinli.find((x) => x.i === fi) ?? izinli[0];
    const yerinde = !ana ? pasif[0] : undefined;
    govde = (
      <>
        {son && <p className="tc-pys-son" role="status"><Simge ad="check" boyut="k" /><span><b>{son}</b> {sonNot}</span></p>}
        {ana && <Dugme tur={son ? undefined : 'birincil'} simge="edit" onClick={() => { ac(ana.i); }}>{son ? 'Yeniden düzenle' : ana.f.ad}</Dugme>}
        {yerinde && (
          <>
            <Dugme simge={yerinde.simge} disabled>{yerinde.ad}</Dugme>
            <p className="tc-pys-kucuk"><Simge ad="lock" boyut="k" /> {yerinde.kapali}</p>
          </>
        )}
        {!ana && !yerinde && formlar.length > 0 && izinYok}
      </>
    );
  }
  const anaPasif = izinli.length ? null : pasif[0];
  const yada: AcilimSecenegi[] = [
    ...formlar.flatMap((x, i): AcilimSecenegi[] => {
      if (x.kapali) return x === anaPasif ? [] : [{ ad: x.ad, etki: x.kapali, simge: x.simge, pasif: true }];
      if (x.tanim === null || i === fi) return [];
      return [{ ad: x.ad, etki: x.etki, simge: x.simge, yap: () => { ac(i); } }];
    }),
    ...secenekler,
  ];
  return <div className="tc-pys-ac-kap" ref={kap}><Acilim baslik={baslik} ton={ton} neden={neden} bilgi={bilgi} form={govde} secenekler={yada} kapat={kapat} /></div>;
}
