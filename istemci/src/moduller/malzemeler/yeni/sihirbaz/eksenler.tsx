import { useState } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import * as K from '../kurallar/index.ts';
import * as S from '../sabitler/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import { useSihirbaz } from './baglam.ts';
import type { Taslak } from './durum.ts';
import { Baslangic } from './adimlar/Baslangic.tsx';
import { DurumAdimi, type DurumBolumu } from './adimlar/DurumAdimi.tsx';
import { FormAdimi } from './adimlar/FormAdimi.tsx';
import { KaliteAdimi } from './adimlar/KaliteAdimi.tsx';
import { OzetAdimi } from './adimlar/OzetAdimi.tsx';
import { TeknikAdimi } from './adimlar/TeknikAdimi.tsx';
import { TicariAdimi } from './adimlar/TicariAdimi.tsx';
import './eksenler.css';

// Hammadde kartı yedi teknik eksene göre düzenlenir (3476 a, tasarım B): adım sırası ve denetimleri aynı kalır,
// adlar eksenleri söyler, her adımın üstündeki şerit kartın eksen eksen ne kadar dolu olduğunu gösterir.
export const EKSEN_ADIM_ADLARI = ['Tür ve aile', 'Kalite ve standart', 'Form, ölçü, tolerans', 'Kondisyon, üretim, yüzey', 'Teknik özellikler', 'Ticari ve sertifika', 'Özet ve kayıt'];

// Metalde "ek işlem" listesi ısıl işlemlerle başlar, yüzey işlemleriyle sürer; sınır listedeki son ısıl işlemdir.
const ISIL = new Set(S.M_ISLEM.slice(0, S.M_ISLEM.indexOf('Hidrojen gevrekliği giderme') + 1));
const metalMi = (d: Taslak) => d.fam === 'metal';
const ISLENEBILIRLIK = ['isleme', 'kaynak', 'korozyon'];
const ADIM_DISI = { form: ['olcustd', 'kesim'], ticari: ['ambalaj'] };

const s = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const birlestir = (...p: string[]) => p.filter(Boolean).join(' · ');
const islemler = (d: Taslak, isil: boolean) => (Array.isArray(d.opts['islem']) ? (d.opts['islem'] as string[]) : []).filter((x) => !metalMi(d) || ISIL.has(x) === isil);

function esdeger(g: K.Kalite | undefined): string {
  // Eşdeğer anahtarı ailede değişir (alüminyumda AA, çelikte AISI/SAE); ilk uyan ad parantezde yazılır.
  const k = g?.eq ? Object.keys(g.eq).find((x) => ['AA', 'AISI', 'UNS'].some((o) => x === o || x.startsWith(`${o}/`)) && g.eq?.[x]) : undefined;
  return k && g?.eq ? ` (${k} ${g.eq[k] ?? ''})` : '';
}

function ozellik(k: string, d: Taslak, b: KuralBaglami, on: string, son: string): string {
  if (!K.propsFor(d.fam, b).some((p) => p.k === k)) return '';
  const v = s(K.val(k, d, b));
  return v ? `${on}${v}${son}` : '';
}

interface Eksen { id: string; no: string; ad: string; kaliteden?: boolean; ozet: (d: Taslak, b: KuralBaglami) => string }

export const EKSENLER: readonly Eksen[] = [
  { id: 'e1', no: '1', ad: 'Kimyasal / kalite', ozet: (d, b) => { const g = K.grade(d, b); return g ? birlestir(g.ad + esdeger(g), s(d.stds) || s(d.opts['kimstd'])) : ''; } },
  { id: 'e2', no: '2', ad: 'Kondisyon', ozet: (d) => birlestir(s(d.opts['durum']), s(d.opts['mekstd']), metalMi(d) ? islemler(d, true).join(', ') : '') },
  {
    id: 'e3', no: '3', ad: 'Mekanik', kaliteden: true,
    ozet: (d, b) => (K.grade(d, b) ? birlestir(ozellik('akma', d, b, 'Rp0,2 ', ' MPa'), ozellik('cekme', d, b, 'Rm ', ' MPa'), ozellik('uzama', d, b, 'A %', ''), ozellik('sert', d, b, '', ` ${d.fam ? b.t.FAMS[d.fam]?.sert ?? '' : ''}`.trimEnd())) : ''),
  },
  { id: 'e4', no: '4', ad: 'Form, ölçü, tolerans', ozet: (d, b) => (d.form ? birlestir(K.dimsStr(d, undefined, b) || '', s(d.opts['olcustd']), d.tol ?? '') : '') },
  { id: 'e5', no: '5', ad: 'Üretim ve iç yapı', ozet: (d) => birlestir(s(d.opts['uretim']), d.opts['ut'] ? `UT ${s(d.opts['ut'])}` : '', s(d.opts['test'])) },
  {
    id: 'e6', no: '6', ad: 'İşlenebilirlik', kaliteden: true,
    ozet: (d, b) => (K.grade(d, b) ? birlestir(ozellik('isleme', d, b, 'işlenebilirlik ', ''), ozellik('kaynak', d, b, 'kaynak ', '')) : ''),
  },
  { id: 'e7', no: '7', ad: 'Yüzey ve kaplama', ozet: (d) => birlestir(s(d.opts['yuzey']), d.opts['ra'] ? `Ra ≤ ${s(d.opts['ra'])} µm` : '', metalMi(d) ? islemler(d, false).join(', ') : '', s(d.opts['kaplamastd'])) },
  { id: 'es', no: 'S', ad: 'Sertifika', ozet: (d) => s(d.com.sertifika) },
];

// Kartın tam teknik tanımı: kesilmez; föyde ve özette okunur.
export function tanimSatiri(d: Taslak, b: KuralBaglami): { ad: string; deger: string }[] {
  const g = K.grade(d, b);
  if (!g) return [];
  const p: { ad: string; deger: string }[] = [{ ad: 'Malzeme', deger: birlestir(g.ad + esdeger(g), s(d.stds?.[0] ?? d.opts['kimstd'])) }];
  const ekle = (ad: string, deger: string) => { if (deger) p.push({ ad, deger }); };
  ekle('Kondisyon', birlestir(s(d.opts['durum']), s(d.opts['mekstd'])));
  ekle('Ölçü', EKSENLER[3]!.ozet(d, b));
  ekle('İç yapı', d.opts['ut'] ? `UT ${s(d.opts['ut'])}` : '');
  ekle('Yüzey', EKSENLER[6]!.ozet(d, b));
  ekle('Sertifika', s(d.com.sertifika));
  return p;
}

export function TanimSatiri() {
  const { taslak: d, b } = useSihirbaz();
  if (K.isGen(d, b)) return null;
  const p = tanimSatiri(d, b);
  if (!p.length) return null;
  return (
    <div className="tc-ek-tanim">
      <span className="tc-my-etiket">Tam teknik tanım</span>
      <p>{p.map((x, i) => <span key={x.ad}>{i > 0 && <span className="tc-ek-ayir"> | </span>}<b>{x.ad}:</b> {x.deger}</span>)}</p>
    </div>
  );
}

export function EksenSeridi() {
  const { taslak: d, b } = useSihirbaz();
  const [acik, acikYaz] = useState(false);
  const ozetler = EKSENLER.map((x) => ({ ...x, deger: x.ozet(d, b) }));
  const tek = ozetler.map((x) => x.deger).filter(Boolean).slice(0, 4).join(' · ');
  return (
    <section className="tc-ek-serit" aria-label="Kartın eksenleri">
      <button type="button" className="tc-ek-serit-bas" aria-expanded={acik} onClick={() => { acikYaz(!acik); }}>
        <span className="tc-ek-gosterge">
          {ozetler.map((x) => (
            <span key={x.id} className={!x.deger ? 'tc-ek-nokta' : x.kaliteden ? 'tc-ek-nokta tc-ek-turev' : 'tc-ek-nokta tc-ek-dolu'} title={`${x.no} ${x.ad}${!x.deger ? ': eksik' : x.kaliteden ? ': kaliteden' : ''}`}>{x.no}</span>
          ))}
        </span>
        <span className="tc-ek-tek">{tek || 'Henüz seçim yok'}</span>
        <span className={acik ? 'tc-ek-ok tc-ek-ok-acik' : 'tc-ek-ok'}><Simge ad="chev-right" /></span>
      </button>
      {acik && (
        <div className="tc-ek-gruplar">
          {ozetler.map((x) => (
            <div key={x.id} className={x.deger ? 'tc-ek-grup' : 'tc-ek-grup tc-ek-eksik'}>
              <small><span className="tc-ek-no">{x.no}</span> {x.ad}{x.deger && x.kaliteden && <span className="tc-ek-kaliteden">kaliteden</span>}</small>
              <span>{x.deger || 'Eksik'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Baslik({ no, ad }: { no: string; ad: string }) {
  return <h3 className="tc-ek-bolum-baslik"><span className="tc-ek-no">{no}</span>{ad}</h3>;
}

function durumBolumleri(d: Taslak): DurumBolumu[] {
  const metal = metalMi(d);
  const l: DurumBolumu[] = [
    { no: '2', ad: 'Kondisyon', anahtarlar: metal ? ['kimstd', 'mekstd', 'durum', 'islem'] : ['kimstd', 'mekstd', 'durum'], degerSuz: metal ? (k, v) => k !== 'islem' || ISIL.has(v) : undefined },
    { no: '5', ad: 'Üretim ve iç yapı', anahtarlar: ['uretim', 'katki', 'ut', 'test'] },
    { no: '7', ad: 'Yüzey ve kaplama', anahtarlar: metal ? ['yuzey', 'ra', 'kaplamastd', 'islem', 'koruma'] : ['yuzey', 'renk', 'ra', 'kaplamastd', 'koruma'], degerSuz: metal ? (k, v) => k !== 'islem' || !ISIL.has(v) : undefined },
  ];
  if (!metal) l.push({ no: '', ad: 'Ek işlemler', anahtarlar: ['islem'] });
  return l;
}

// Adım sırası bugünkü sihirbazla aynı: 0 tür, 1 kalite, 2 form, 3 durum, 4 teknik, 5 ticari, 6 özet.
export function EksenAdimi() {
  const { taslak: d, adim } = useSihirbaz();
  switch (adim) {
    case 0: return <Baslangic />;
    case 1: return <KaliteAdimi />;
    case 2: return <><FormAdimi /><DurumAdimi anahtarlar={ADIM_DISI.form} /></>;
    case 3: return <DurumAdimi bolumler={durumBolumleri(d)} haric={[...ADIM_DISI.form, ...ADIM_DISI.ticari]} />;
    case 4: return (
      <>
        <Baslik no="3" ad="Mekanik ve fiziksel" /><TeknikAdimi haric={ISLENEBILIRLIK} ekler={false} />
        <Baslik no="6" ad="İşlenebilirlik" /><TeknikAdimi anahtarlar={ISLENEBILIRLIK} yardim={false} />
      </>
    );
    case 5: return <><TicariAdimi /><DurumAdimi anahtarlar={ADIM_DISI.ticari} /></>;
    default: return <OzetAdimi />;
  }
}
