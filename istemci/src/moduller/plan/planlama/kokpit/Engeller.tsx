import { useNavigate } from 'react-router-dom';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { ENGEL_TONU, type DuzeltmeYeri, type EngelGrubu } from './engeller.ts';

export interface EngellerOzellikleri {
  gruplar: readonly EngelGrubu[];
  ozet: { toplam: number; metin: string };
  // Planlama süresinin bittiği an (tarih metni).
  ufukSonu: string;
  emirGoster: (emir: string) => void;
  mesaiAc: () => void;
  // Kişi düzeltme sayfasını açabiliyor mu (oturumun işlemleri).
  acabilir: (islem: string) => boolean;
  kapat: () => void;
}

// Engeller paneli (3457-1 A): nedene göre gruplu; her satır ne oldu, neden, ne yapmalı ve düzeltme düğmeleri. Düğme, kişinin o ekranı açma
// yetkisi yoksa düğme olmaz, sayfanın adı yazılır (kime başvuracağını bilir).
export function Engeller({ gruplar, ozet, ufukSonu, emirGoster, mesaiAc, acabilir, kapat }: EngellerOzellikleri) {
  const git = useNavigate();
  const duzelt = (d: DuzeltmeYeri) => {
    if (d.tur === 'kapasite') return <Dugme key={d.baslik} simge="wrench" onClick={mesaiAc}>{d.baslik}</Dugme>;
    if (!acabilir(d.islem)) return <span key={d.baslik} className="tc-pyq-not">{`Bu düzeltme ${d.sayfa} sayfasında yapılır; açma yetkiniz yok, planlama sorumlusuna başvurun.`}</span>;
    return <Dugme key={d.baslik} simge="chev-right" onClick={() => { void git(d.yol); }}>{d.baslik}</Dugme>;
  };
  return (
    <aside className="tc-pyq-ayrinti tc-pyq-ayarlar tc-pyq-engeller" aria-label="Engeller">
      <header>
        <div><b>Engeller</b><small>{ozet.metin || 'Engel yok'} · plan {ufukSonu} tarihine kadar</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Engelleri kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {gruplar.length === 0 && <p className="tc-pyq-not">Son planda engel yok: bütün adımlar planda.</p>}
      {gruplar.map((g) => (
        <section key={g.tur} data-engel-grubu={g.tur} data-ton={ENGEL_TONU[g.tur]} aria-label={g.ad}>
          <h3>{g.ad} <span className="tc-pyq-engel-sayi">{g.engeller.length}</span></h3>
          <ul className="tc-pyq-engel-liste">
            {g.engeller.map((e) => (
              <li key={e.anahtar} data-engel={e.anahtar}>
                <b>{e.baslik}</b>
                <dl>
                  <dt>Ne oldu</dt><dd>{e.neOldu}</dd>
                  {e.neden !== null && <><dt>Neden</dt><dd>{e.neden}</dd></>}
                  <dt>Ne yapmalı</dt><dd>{e.neYapmali}</dd>
                </dl>
                <div className="tc-pyq-engel-dugmeler">
                  {e.duzelt.map(duzelt)}
                  {e.emir !== null && <Dugme simge="search" onClick={() => { emirGoster(e.emir!); }}>Emri göster</Dugme>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
