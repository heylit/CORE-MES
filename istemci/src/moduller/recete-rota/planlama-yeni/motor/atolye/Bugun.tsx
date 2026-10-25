import type { ReactNode } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { IzSatiri } from '../../tipler.ts';
import { MOTOR_NOTU } from '../ortak.tsx';
import { akis, asilBekleme, DARBOGAZ, duruslar, gs, malzemeGec, sure, tz, yukOranlari, zs } from './kurallar.ts';
import { ankraj, type Ortam } from './Pano.tsx';

// Bugün (cizBugun): katlanır alt şerit; geciken ve riskli siparişler, asıl beklemesi ve son kararlar. Eski panonun her sipariş için arka planda
// aradığı çözüm yolları motor ister (357 b). Kararlar çalışmanın değişiklik izindendir; yalnız son değişiklik geri alınır.
export function Bugun({ ort, acik }: { ort: Ortam; acik: boolean }) {
  const { c, liste } = ort;
  const L = liste.filter((x) => x.durum !== 'iyi'); const gec = L.filter((x) => x.durum === 'gec').length;
  const ar = duruslar(c).length; const son = c.iz[0];
  return (
    <section className="tc-pym-tp-bugun" aria-label="Bugün">
      <div className="tc-pym-tp-bugun-ust">
        <button type="button" className="tc-pym-tp-bugun-bas" aria-expanded={acik} onClick={() => ort.bugunAc(!acik)}>
          <Simge ad={acik ? 'down' : 'up'} boyut="k" /><b>Bugün</b><span>{`${gec} geciken · ${L.length - gec} riskli${ar ? ` · ${ar} arıza` : ''}`}</span>
          {son && <span data-son="">{`Son: ${son.ne}`}</span>}
        </button>
        <button type="button" className="tc-pym-tp-bugun-gun" title="Gün özeti ve geçmiş günler" onClick={(e) => ort.kartAc({ tur: 'gun' }, ankraj(e))}><Simge ad="book" boyut="k" /><span>Gün özeti</span></button>
      </div>
      {acik && (
        <div className="tc-pym-tp-bugun-ic">
          <div>
            <h4>Çözülecekler</h4>
            {L.map((x) => {
              const dar = asilBekleme(akis(ort.p, ort.cx, ort.hazir, x.id));
              return (
                <button key={x.id} type="button" className="tc-pym-tp-bugun-sat" onClick={() => ort.sipGoster(x.id)}>
                  <b>{x.id}</b><span className="tc-pym-tp-rozet" data-durum={x.durum}>{x.durum === 'gec' ? `${sure(x.T)} geç` : `${sure(x.pay)} pay`}</span>
                  <span className="tc-pym-tp-not" title={`Çözüm yolları: ${MOTOR_NOTU}`}>{dar ? `asıl bekleme · ${dar}` : 'çözüm yolu motorla'}</span>
                </button>
              );
            })}
            {!L.length && <p className="tc-pym-tp-not">Geciken ya da riskli sipariş yok.</p>}
          </div>
          <div>
            <h4>Son kararlar</h4>
            <Kararlar ort={ort} n={8} />
          </div>
        </div>
      )}
    </section>
  );
}

const saatTr = (t: number) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
// Değişiklik izinin son satırları; en üstteki bu oturumda yapıldıysa "Öncesine dön" onu geri alır.
export function Kararlar({ ort, n }: { ort: Ortam; n: number }) {
  const { c, o } = ort; const komut = o.komut;
  const L: IzSatiri[] = c.iz.slice(0, n);
  if (!L.length) return <p className="tc-pym-tp-not">Bu çalışmada karar yok.</p>;
  const geri = ort.yaz && !!komut?.geriAlinabilir();
  return (
    <>
      {L.map((g, i) => (
        <div key={`${g.t}-${i}`} className="tc-pym-tp-kar">
          <span>{g.ne}<small>{`${saatTr(g.t)}${g.ayrinti ? ` · ${g.ayrinti}` : ''}`}</small></span>
          <button type="button" className="tc-dugme" aria-disabled={!(i === 0 && geri)} title={i === 0 && geri ? 'Bu kararı geri al' : 'Yalnız bu oturumdaki son değişiklik geri alınır.'}
            onClick={() => { if (i === 0 && geri) komut?.geriAl(); }}>
            <Simge ad="back" boyut="k" />Öncesine dön
          </button>
        </div>
      ))}
    </>
  );
}

// Sabah brifingi (cizBrif): günün ilk açılışında bir kez; kapatmadan da çalışılır, satır çözüme götürür.
export function Brif({ ort, kapat }: { ort: Ortam; kapat: () => void }) {
  const { c, p, cx, now, liste } = ort; const D = c.D;
  const gec = liste.filter((x) => x.durum === 'gec').sort((a, b) => (b.T ?? 0) - (a.T ?? 0)); const risk = liste.filter((x) => x.durum === 'risk');
  const dar = yukOranlari(D, p, cx, now, now + 72).filter((x) => x.oran >= DARBOGAZ); const mal = liste.filter(malzemeGec); const dn = duruslar(c);
  const sat = (ik: SimgeAdi, durum: 'gec' | 'risk', ana: string, alt: ReactNode, git: () => void) => (
    <button key={ana} type="button" className="tc-pym-tp-brif-sat" data-durum={durum} onClick={git}>
      <Simge ad={ik} boyut="k" /><span><b>{ana}</b><small>{alt}</small></span><Simge ad="chev-right" boyut="k" />
    </button>
  );
  const ilk = gec[0] ?? risk[0];
  const S1 = [
    ilk ? sat('alert', 'gec', `${gec.length} geciken, ${risk.length} riskli sipariş`,
      gec.slice(0, 3).map((x) => `${x.id} ${sure(x.T)}`).join(' · ') || `Riskliler: ${risk.slice(0, 3).map((x) => x.id).join(', ')}`, () => ort.sipGoster(ilk.id)) : null,
    dar[0] ? sat('fire', 'risk', `${dar.length} tezgâh darboğaz (3 gün)`, dar.slice(0, 3).map((x) => `${x.m} %${Math.round(x.oran * 100)}`).join(' · '),
      () => ort.suzSec({ g: null, m: dar[0]?.m ?? null, j: null })) : null,
    mal[0] ? sat('box', 'risk', `${mal.length} siparişte malzeme geç`, mal.slice(0, 3).map((x) => `${x.id} malzeme ${tz(D, x.bas)}`).join(' · '), () => ort.sipGoster(mal[0]?.id ?? '')) : null,
    dn[0] ? sat('wrench', 'gec', `${dn.length} arıza`, dn.map((d) => `${d.m} ${tz(D, d.from)} → ${zs(D, d.to)}`).join(' · '),
      () => ort.kartAc({ tur: 'gunluk', m: dn[0]?.m ?? '' })) : null,
  ].filter(Boolean);
  return (
    <section className="tc-pym-tp-brif" aria-label="Sabah brifingi">
      <h4><Simge ad="sun" boyut="k" />{`Günaydın · ${gs(D, now)}`}<span className="tc-pym-tp-bosluk" />
        <button type="button" className="tc-dugme tc-pym-hayalet tc-pym-kucuk" aria-label="Kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </h4>
      {S1.length ? S1 : <p className="tc-pym-tp-not"><Simge ad="check" boyut="k" /> Geciken, darboğaz ve eksik malzeme yok.</p>}
      <p className="tc-pym-tp-not">Satıra dokun, çözüme git.</p>
    </section>
  );
}
