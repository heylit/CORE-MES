import { lazy, Suspense, useEffect, useState } from 'react';
import { Dugme, DurumKutusu, Girdi, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { ALET_ZORUNLU_ILETISI, aletSecimAnahtari, olcumAletDamgasi, seciliAlet, type OlcumAleti } from '../../../../ortak/cizim/cekirdek/olcum-aleti.ts';
import { olcumDegerlendir } from '../../../../ortak/cizim/kurallar.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { olcuSatirlari } from './kurallar.ts';
import type { Meas, PlanItem } from './tipler.ts';
import './olcu-listesi.css';

const AletSecimi = lazy(async () => ({ default: (await import('../kalite/index.tsx')).AletSecimi }));

// 1354 a (kart #1358): Telefon profilinde sunucu PDF ve 3B vermez; Resim sekmesinin yerinde kontrol planının ölçüleri çizimsiz listelenir.
// Ölçüm kuralı teknik resimdekinin aynısıdır (tolerans, virgül kayması önerisi, ölçü aleti zorunlu); kayıt aynı yoldan (olcumYaz) gider.
export interface OlcuListesiOzellikleri {
  plan: readonly PlanItem[];
  operatorOlcer: readonly number[];
  siradaki: readonly number[];
  olcumler: Readonly<Record<string, Meas>>;
  aletler: readonly OlcumAleti[];
  odak: { id: number; n: number } | null;
  saltOkunur: boolean;
  yaz: (m: Record<number, Meas>) => void;
  bildir: (mesaj: string, uygun: boolean) => void;
}

export function OlcuListesi(p: OlcuListesiOzellikleri) {
  const satirlar = olcuSatirlari(p.plan, p.operatorOlcer, p.siradaki, p.olcumler);
  const [secili, seciliYaz] = useState<number | null>(null);
  useEffect(() => { if (p.odak) seciliYaz(p.odak.id); }, [p.odak?.n]);
  if (!satirlar.length) return <DurumKutusu durum="bos" mesaj="Bu işin kontrol planında ölçü yok." />;
  return (
    <div className="tc-ay1-olculer">
      <p className="tc-ay1-olculer-not"><Simge ad="lock" boyut="k" />Bu cihazda teknik resim açılmaz; ölçüler listeden girilir.</p>
      <ul>
        {satirlar.map((s) => (
          <li key={s.b.id} className={secili === s.b.id ? 'tc-ay1-olculer-acik' : undefined}>
            <button type="button" className="tc-ay1-olculer-satir" aria-expanded={secili === s.b.id} onClick={() => seciliYaz(secili === s.b.id ? null : s.b.id)}>
              <span className="tc-ay1-olculer-no">{s.b.id}</span>
              <span className="tc-ay1-olculer-metin"><b>{s.b.nom}</b><small>{olcuAlti(s.b)}</small></span>
              {s.olcum ? <Rozet ton={s.olcum.ok ? 'tamam' : 'hata'}>{String(s.olcum.v)}</Rozet>
                : s.sirada ? <Rozet ton="uyari">Sırada</Rozet>
                  : s.operator ? null : <Rozet ton="pasif">Kalite</Rozet>}
            </button>
            {secili === s.b.id ? <OlcuGirisi b={s.b} operator={s.operator} {...p} kapat={() => seciliYaz(null)} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

const olcuAlti = (b: PlanItem): string => [b.tol, b.gauge ? null : `${b.min} – ${b.max}`, b.tool, b.crit ? 'KRİTİK' : null].filter(Boolean).join(' · ');

function OlcuGirisi({ b, operator, olcumler, aletler, saltOkunur, yaz, bildir, kapat }: OlcuListesiOzellikleri & { b: PlanItem; operator: boolean; kapat: () => void }) {
  const [deger, degerYaz] = useState('');
  const [oneri, oneriYaz] = useState<{ v: number; alt: number } | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  if (!operator) return <p className="tc-ay1-olculer-govde">Bu ölçü <b>kalite istasyonunda</b> yapılır{b.freq ? ` · ${b.freq}` : ''}.</p>;
  if (saltOkunur) return null;
  const kaydet = (zorla?: 'ok' | 'nok' | null, secilen?: number | null) => {
    const alet = seciliAlet(aletler, b.tool, yerel.oku(aletSecimAnahtari(b.tool)), Date.now());
    if (!alet) { hataYaz(ALET_ZORUNLU_ILETISI + (b.tool ? ` · ${b.tool}` : '')); return; }
    const k = olcumDegerlendir(b, deger, zorla, secilen);
    if (k.tur === 'yok') { hataYaz('Değer sayı olmalı'); return; }
    if (k.tur === 'oneri') { oneriYaz({ v: k.v, alt: k.alt }); return; }
    hataYaz(null); oneriYaz(null); degerYaz('');
    yaz({ ...olcumler, [b.id]: { v: k.v, ok: k.ok, at: Date.now(), ...olcumAletDamgasi(alet) } } as Record<number, Meas>);
    bildir(`${k.ok ? 'Uygun · ' : 'Tolerans dışı! '}${b.nom} = ${k.v}`, k.ok);
    kapat();
  };
  return (
    <div className="tc-ay1-olculer-govde">
      <Suspense fallback={null}><AletSecimi aletler={aletler} tool={b.tool} onSec={() => hataYaz(null)} /></Suspense>
      {b.gauge ? (
        <div className="tc-ay1-olculer-dugmeler">
          <Dugme simge="check" onClick={() => kaydet('ok')}>Geçer</Dugme>
          <Dugme simge="x" tur="tehlike" onClick={() => kaydet('nok')}>Geçmez</Dugme>
        </div>
      ) : oneri ? (
        <div className="tc-ay1-olculer-dugmeler" role="alert">
          <span><b>{oneri.v}</b> tolerans dışında; <b>{oneri.alt}</b> mi demek istedin?</span>
          <Dugme tur="birincil" simge="check" onClick={() => kaydet(null, oneri.alt)}>{oneri.alt} kaydet</Dugme>
          <Dugme onClick={() => kaydet(null, oneri.v)}>{oneri.v} doğru</Dugme>
        </div>
      ) : (
        <div className="tc-ay1-olculer-dugmeler">
          <Girdi etiket="Ölçülen değer" inputMode="decimal" value={deger} hata={hata ?? undefined}
            onChange={(e) => { degerYaz(e.target.value); hataYaz(null); }} onKeyDown={(e) => { if (e.key === 'Enter') kaydet(); }} />
          <Dugme tur="birincil" simge="check" onClick={() => kaydet()} disabled={deger.trim() === ''}>Kaydet</Dugme>
        </div>
      )}
      {hata && (b.gauge || oneri) ? <p className="tc-ay1-olculer-hata" role="alert">{hata}</p> : null}
    </div>
  );
}
