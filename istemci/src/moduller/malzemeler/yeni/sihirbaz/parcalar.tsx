import { useEffect, useId, useState, type ReactNode } from 'react';
import { parseNum } from '../bicim.ts';
import { KatalogSimgesi } from '../ortak/KatalogSimgesi.tsx';

// Prototipin alan, çip ve kutu kalıpları. Sayı alanı yazılan metni kendisi tutar: "12," yazılırken değer 12 olsa da
// metin silinmez; değer dışarıdan değişince (Otomatik, şablon) metin yeniden kurulur.
const sayiMetni = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : typeof v === 'string' ? v : '');

interface AlanOzellikleri {
  etiket: ReactNode;
  deger: unknown;
  yaz: (v: string | number) => void;
  sayi?: boolean;
  birim?: string;
  ipucu?: string;
  genis?: boolean;
  saltOkunur?: boolean;
  tip?: 'text' | 'date' | 'search';
  sonEk?: ReactNode;
  alt?: ReactNode;
  enCok?: number;
  kimlik?: string;
  girdiSinifi?: string;
  zorunlu?: boolean;
}

export function MetinAlani({
  etiket, deger, yaz, sayi = false, birim, ipucu, genis = false, saltOkunur = false, tip = 'text', sonEk, alt, enCok, kimlik, girdiSinifi, zorunlu,
}: AlanOzellikleri) {
  const ic = useId();
  const id = kimlik ?? ic;
  const dis = sayi ? sayiMetni(deger) : String(deger ?? '');
  const [metin, metinYaz] = useState(dis);
  useEffect(() => {
    if (!sayi) { metinYaz(dis); return; }
    metinYaz((m) => (parseNum(m) === parseNum(dis) ? m : dis));
  }, [dis, sayi]);
  return (
    <div className={genis ? 'tc-my-alan tc-my-alan-genis' : 'tc-my-alan'}>
      <label htmlFor={id} className="tc-my-alan-etiket">{etiket}{zorunlu && <span aria-hidden="true"> *</span>}</label>
      <span className="tc-my-girdi">
        <input
          id={id} type={tip} value={metin} placeholder={ipucu} readOnly={saltOkunur} autoComplete="off" maxLength={enCok}
          inputMode={sayi ? 'decimal' : undefined} className={girdiSinifi} required={zorunlu}
          onChange={(e) => { metinYaz(e.target.value); yaz(sayi ? parseNum(e.target.value) : e.target.value); }}
        />
        {birim && <span className="tc-my-birim">{birim}</span>}
        {sonEk}
      </span>
      {alt}
    </div>
  );
}

export function CokSatirAlani({ etiket, deger, yaz, ipucu }: { etiket: string; deger: string | undefined; yaz: (v: string) => void; ipucu?: string }) {
  const id = useId();
  return (
    <div className="tc-my-alan tc-my-alan-genis">
      <label htmlFor={id} className="tc-my-alan-etiket">{etiket}</label>
      <textarea id={id} className="tc-my-cok" value={deger ?? ''} placeholder={ipucu} onChange={(e) => { yaz(e.target.value); }} />
    </div>
  );
}

export function SecimAlani({
  etiket, deger, yaz, secenekler, bos, istenir = false, kimlik,
}: { etiket: string; deger: string; yaz: (v: string) => void; secenekler: readonly string[]; bos?: string; istenir?: boolean; kimlik?: string }) {
  const ic = useId();
  const id = kimlik ?? ic;
  return (
    <div className="tc-my-alan">
      <label htmlFor={id} className="tc-my-alan-etiket">{etiket}</label>
      <span className="tc-my-girdi">
        <select id={id} value={istenir ? '' : deger} onChange={(e) => { yaz(e.target.value); }}>
          {istenir && <option value="" disabled>Birim seçin</option>}
          {bos !== undefined && <option value="">{bos}</option>}
          {secenekler.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </span>
    </div>
  );
}

export type CipTonu = 'yaygin' | 'dikkat' | 'uyumsuz';

export function Cip({
  basili, tikla, children, ton, radyo = false, baslik, ipucu,
}: { basili: boolean; tikla: () => void; children: ReactNode; ton?: CipTonu; radyo?: boolean; baslik?: string; ipucu?: boolean }) {
  const sinif = ['tc-my-cip', ton && `tc-my-cip-${ton}`, ipucu && 'tc-my-cip-ipucu'].filter(Boolean).join(' ');
  return radyo
    ? <button type="button" role="radio" aria-checked={basili} className={sinif} title={baslik} onClick={tikla}>{children}</button>
    : <button type="button" aria-pressed={basili} className={sinif} title={baslik} onClick={tikla}>{children}</button>;
}

export function CipGrubu({ etiket, radyo = false, children }: { etiket: string; radyo?: boolean; children: ReactNode }) {
  return <div className="tc-my-cipler" role={radyo ? 'radiogroup' : 'group'} aria-label={etiket}>{children}</div>;
}

// Prototipte `opt-group`: simgeli başlık, sayaç ve çip grubu.
export function SecenekGrubu({
  baslik, ikon, ikonAcik = false, sayac, children,
}: { baslik: ReactNode; ikon?: string | null; ikonAcik?: boolean; sayac?: number; children: ReactNode }) {
  return (
    <div className="tc-my-sgrup">
      <span className="tc-my-sgrup-baslik">
        {ikon && <span className={ikonAcik ? 'tc-my-sgrup-ikon tc-my-sgrup-ikon-acik' : 'tc-my-sgrup-ikon'}><KatalogSimgesi yol={ikon} /></span>}
        {baslik}
        {sayac ? <span className="tc-my-sayac">{sayac} seçili</span> : null}
      </span>
      {children}
    </div>
  );
}

export function Kutu({ baslik, children, sinif }: { baslik?: string; children: ReactNode; sinif?: string }) {
  return (
    <section className={['tc-my-kutu', sinif].filter(Boolean).join(' ')}>
      {baslik && <h4>{baslik}</h4>}
      {children}
    </section>
  );
}

export function Alanlar({ children }: { children: ReactNode }) {
  return <div className="tc-my-alanlar">{children}</div>;
}

export function Uyari({ ton = 'dikkat', children, kimlik }: { ton?: 'dikkat' | 'uyumsuz'; children: ReactNode; kimlik?: string }) {
  return <div id={kimlik} className={ton === 'uyumsuz' ? 'tc-my-uyari tc-my-uyari-uyumsuz' : 'tc-my-uyari'}>{children}</div>;
}

export function Tamam({ children }: { children: ReactNode }) {
  return <div className="tc-my-tamam" role="status">{children}</div>;
}

export function Yardim({ children }: { children: ReactNode }) {
  return <p className="tc-my-yardim">{children}</p>;
}

export function BagDugmesi({ children, tikla }: { children: ReactNode; tikla: () => void }) {
  return <button type="button" className="tc-my-bag" onClick={tikla}>{children}</button>;
}
