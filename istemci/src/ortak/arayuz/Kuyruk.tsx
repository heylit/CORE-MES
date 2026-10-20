import type { ReactNode } from 'react';
import type { MakineDurumu } from './durum.ts';
import './kuyruk.css';

export function DurumRozeti({ durum, children }: { durum: MakineDurumu; children: ReactNode }) {
  return (
    <span className="tc-durum-rozet" data-durum={durum}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

const YARICAP = 21;
const CEVRE = 2 * Math.PI * YARICAP;

export function MiniHalka({ oran }: { oran: number }) {
  const sinirli = Math.min(1, Math.max(0, oran));
  return (
    <span className="tc-kuyruk-halka">
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle className="tc-kuyruk-halka-yol" cx="26" cy="26" r={YARICAP} fill="none" strokeWidth="4" />
        <circle
          className="tc-kuyruk-halka-yay" cx="26" cy="26" r={YARICAP} fill="none" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={CEVRE} strokeDashoffset={CEVRE * (1 - sinirli)}
        />
      </svg>
      <span>%{Math.round(sinirli * 100)}</span>
    </span>
  );
}

interface KartOzellikleri {
  no: string;
  parca: string;
  adet: string;
  ayrinti?: readonly string[];
  durum: MakineDurumu;
  durumMetni: string;
  // 0..1; bilinmiyorsa null: halka çizilmez, sıfır uydurulmaz.
  ilerleme?: number | null;
  secili?: boolean;
  // "Sıradaki" gibi ek işaretler için yer.
  isaret?: ReactNode;
  sec: () => void;
}

export function KuyrukKarti({
  no, parca, adet, ayrinti = [], durum, durumMetni, ilerleme = null, secili = false, isaret, sec,
}: KartOzellikleri) {
  const sinif = ['tc-kuyruk-kart', secili && 'tc-kuyruk-kart-secili', ilerleme === null && 'tc-kuyruk-kart-halkasiz']
    .filter(Boolean).join(' ');
  return (
    <button type="button" className={sinif} data-durum={durum} aria-current={secili ? 'true' : undefined} onClick={sec}>
      {ilerleme !== null && <MiniHalka oran={ilerleme} />}
      <span className="tc-kuyruk-govde">
        <span className="tc-kuyruk-no mono">{no}</span>
        <span className="tc-kuyruk-parca">{parca}</span>
        <span className="tc-kuyruk-ayrinti">
          <span>{adet}</span>
          {ayrinti.map((a) => <span key={a}>{a}</span>)}
        </span>
        <span className="tc-kuyruk-rozetler">
          <DurumRozeti durum={durum}>{durumMetni}</DurumRozeti>
          {isaret}
        </span>
      </span>
    </button>
  );
}

interface ListeOzellikleri {
  baslik: string;
  sayac?: string;
  sag?: ReactNode;
  children: ReactNode;
}

export function KuyrukListesi({ baslik, sayac, sag, children }: ListeOzellikleri) {
  return (
    <section className="tc-kuyruk" aria-label={baslik}>
      <header className="tc-kuyruk-ust">
        <h2 className="tc-kuyruk-baslik">{baslik}</h2>
        {sayac && <span className="tc-kuyruk-sayac">{sayac}</span>}
        {sag}
      </header>
      <div className="tc-kuyruk-liste">{children}</div>
    </section>
  );
}
