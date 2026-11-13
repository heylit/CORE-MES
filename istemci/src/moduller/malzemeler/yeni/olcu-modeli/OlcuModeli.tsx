import { lazy, Suspense } from 'react';
import * as K from '../kurallar/index.ts';
import { useSihirbaz } from '../sihirbaz/baglam.ts';
import type { Taslak } from '../sihirbaz/durum.ts';
import type { KartKaydi } from '../tipler.ts';
import { kesitCizimi } from './kesit.ts';
import { OlcuKesiti } from './OlcuKesiti.tsx';
import { malzemeRengiAdi } from './sekil.ts';
import './olcu-modeli.css';

// 3215 c (Teknik kesit): hammaddenin biçim ve ölçüsünden ölçülü kesit çizimi ve küçük döner model. Model ve çizim saklanmaz; karta
// yüklenen 3B model bugünkü gibi "Resim, PDF ve 3B model" panelinde kalır. three ağır olduğundan model ayrı parça olarak yüklenir.
const KucukModel = lazy(() => import('./KucukModel.tsx').then((m) => ({ default: m.KucukModel })));

type Girdi = { form: string; olcu: Record<string, number>; renkAdi: string };

function girdi(d: Taslak | KartKaydi, b: K.KuralBaglami): Girdi | null {
  if (K.isGen(d, b) || !d.form || K.dimsErr(d, b)) return null;
  const olcu = K.dimVals(d, b);
  if (!olcu) return null;
  return { form: d.form, olcu, renkAdi: malzemeRengiAdi(d.fam, d.cls) };
}

function Model({ g }: { g: Girdi }) {
  return <Suspense fallback={null}><KucukModel form={g.form} olcu={g.olcu} renkAdi={g.renkAdi} /></Suspense>;
}

// Form adımında ölçü alanlarının yanında: kesit çizimi; dar ekranda (föy gizliyken) altında küçük model.
export function KesitBlogu() {
  const { taslak: d, b } = useSihirbaz();
  const g = girdi(d, b);
  const cizim = g ? kesitCizimi(g.form, g.olcu) : null;
  if (!g) return null;
  return (
    <div className="tc-om-blok">
      {cizim && <OlcuKesiti cizim={cizim} kod={String(K.finalKod(d, b) ?? '')} />}
      <div className="tc-om-dar"><Model g={g} /></div>
    </div>
  );
}

// Sağdaki canlı föyün başında küçük model (yalnız hammadde, ölçü tamken).
export function FoyModeli({ d }: { d: Taslak }) {
  const { b } = useSihirbaz();
  const g = girdi(d, b);
  if (!g) return null;
  return (
    <div className="tc-om-foy">
      <Model g={g} />
      <p className="tc-om-not">Model ölçüden çizilir, kaydedilmez. Karta yüklenen 3B model "Resim, PDF ve 3B model" bölümünde durur.</p>
    </div>
  );
}

// Kart penceresinde föyün altında aynı kesit (yalnız hammadde, kayıtlı ölçü tamken); model yalnız sihirbazda.
export function KartKesiti({ x, b }: { x: KartKaydi; b: K.KuralBaglami }) {
  const g = girdi(x, b);
  const cizim = g ? kesitCizimi(g.form, g.olcu) : null;
  if (!cizim) return null;
  return <OlcuKesiti cizim={cizim} kod={x.com.kod} />;
}
