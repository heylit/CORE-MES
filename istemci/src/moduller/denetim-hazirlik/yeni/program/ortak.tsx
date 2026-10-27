import { useCallback, type ReactNode } from 'react';
import { Dugme, Rozet, Simge, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { prototipSimgesi } from '../gorunumler.ts';
import { siradakiDenetim } from '../kurallar/denetim-takvimi.ts';
import type { PuanSonucu } from '../kurallar/puan.ts';
import type { ProgramEkrani } from '../tipler.ts';
import { denetimSatiri, kararTonu, puanYazisi, type Ton } from './hesaplar.ts';
import './program.css';

// Program ekranlarının ortak parçaları: ekran durumu kancası, üst bant, halka, ton yazısı.

// Açık programın ekran durumu (seçili soru, kart, süzgeç); kişinin tarayıcısında kalır (204 a).
export function useProgramEkrani(): [ProgramEkrani, (f: (e: ProgramEkrani) => void) => void] {
  const d = useDenetim();
  const { ekranDegistir, program } = d;
  const degis = useCallback((f: (e: ProgramEkrani) => void) => { ekranDegistir((e) => { f(e.pw[program]); }); }, [ekranDegistir, program]);
  return [d.ekran.pw[d.program], degis];
}

export const tonSinifi = (t: Ton): string => `tc-dhy-ton-${t}`;

const ROZET: Record<Ton, RozetTonu> = { iyi: 'tamam', uyari: 'uyari', kotu: 'hata', bilgi: 'bilgi', soluk: 'pasif' };
export const rozetTonu = (t: Ton): RozetTonu => ROZET[t];

export function PSimge({ ad }: { ad: string }) {
  return <Simge ad={prototipSimgesi(ad)} boyut="k" />;
}

// Karar rozeti (prototip verdictPill): cevap yoksa "Başlanmadı".
export function KararRozeti({ r }: { r: PuanSonucu }) {
  if (!r.verdict) return <Rozet ton="pasif">Başlanmadı</Rozet>;
  return <Rozet ton={rozetTonu(kararTonu(r.verdict.k))}>{r.verdict.t}</Rozet>;
}

// Program görünümlerinin üst bandı (prototip topbar): sıradaki denetim satırı ve puan. Sekmeler kabuktadır (Y0).
export function ProgramBandi({ r, ek }: { r: PuanSonucu; ek?: ReactNode }) {
  const d = useDenetim();
  const na = siradakiDenetim(d.profil, d.program);
  return (
    <div className="tc-dhp-bant">
      <p className="tc-dhp-bant-satir">
        <Simge ad="clock" boyut="k" />
        <span>{na ? denetimSatiri(d.kb) : 'Denetim tarihi girilmedi'}</span>
        <button type="button" className="tc-dhp-baglanti" onClick={() => { d.git('takvim'); }}>{na ? 'Değiştir' : 'Denetim tarihi ekle'}</button>
      </p>
      <div className="tc-dhp-bant-sag">
        {ek}
        <KararRozeti r={r} />
        <b className="tc-dhp-bant-puan">{puanYazisi(d, r.pct)}</b>
      </div>
    </div>
  );
}

// Halka gösterge (prototip ring): yüzde boşsa halka boş kalır, ortada tire durur.
export function Halka({ yuzde, etiket, ton = 'bilgi', boyut = 'o' }: { yuzde: number | null; etiket?: string; ton?: Ton; boyut?: 'k' | 'o' | 'b' }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const p = yuzde == null ? 0 : Math.max(0, Math.min(100, yuzde));
  return (
    <svg className={`tc-dhp-halka tc-dhp-halka-${boyut} ${tonSinifi(ton)}`} viewBox="0 0 40 40" aria-hidden="true">
      <circle className="tc-dhp-halka-yol" cx="20" cy="20" r={r} fill="none" />
      {yuzde != null && p > 0 && (
        <circle className="tc-dhp-halka-deger" cx="20" cy="20" r={r} fill="none" strokeDasharray={`${(c * p) / 100} ${c}`} transform="rotate(-90 20 20)" />
      )}
      <text x="20" y="20" textAnchor="middle" dominantBaseline="central">{etiket ?? (yuzde == null ? '–' : `${String(Math.round(p))}%`)}</text>
    </svg>
  );
}

// Örnek veri bandı (prototip banner): örnek kipinde rapor ve genel bakış hayali cevaplarla çizilir.
export function OrnekBandi() {
  const d = useDenetim();
  if (!d.calisma.example) return null;
  return (
    <div className="tc-dhp-not" role="status">
      <span><Simge ad="help" boyut="k" /> <b>Örnek veri gösteriliyor.</b> Hayali cevaplar; kendi cevaplarınız korunuyor.</span>
      {d.yetki.yazabilir && <Dugme onClick={() => { d.degistir(null, (t) => { t.pw[d.program].example = false; t.pw[d.program].exDone = {}; }); }}>Örneği kapat</Dugme>}
    </div>
  );
}

export function IpucuKutusu({ simge = 'help', children }: { simge?: string; children: ReactNode }) {
  return <div className="tc-dhp-ipucu"><PSimge ad={simge} /><span>{children}</span></div>;
}

// Satır içi onay (prototip "confirm" + armed): soru, düğmenin olduğu yerde açılır; ikinci tık "evet"tir. Pencere açılmaz.
export function SatirOnayi({ metin, evet, onayla, vazgec, tur = 'tehlike' }: {
  metin: ReactNode; evet: string; onayla: () => void; vazgec: () => void; tur?: 'tehlike' | 'birincil';
}) {
  return (
    <span className="tc-dhp-onay" role="alert">
      <span>{metin}</span>
      <Dugme tur={tur} onClick={onayla}>{evet}</Dugme>
      <button type="button" className="tc-dhp-baglanti" onClick={vazgec}>Vazgeç</button>
    </span>
  );
}
