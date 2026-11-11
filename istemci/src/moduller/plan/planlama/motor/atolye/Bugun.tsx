import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { hamleYapisi, useHamleci } from '../hamle/hamle.ts';
import { akis, asilBekleme, DARBOGAZ, duruslar, gs, malzemeGec, sure, tz, yukOranlari, zs } from './kurallar.ts';
import { ankraj, type Ortam } from './Pano.tsx';

// Bugün (cizBugun): katlanır alt şerit; geciken ve riskli siparişler, asıl beklemesi ve son kararlar. Çözüm yolu motorun "öne al"
// hamlesidir (2531 a): sonuç önizlenir, kişi uygular. Kararlar bu oturumun geri alma listesidir.
export function Bugun({ ort, acik }: { ort: Ortam; acik: boolean }) {
  const { c, liste } = ort;
  const hamle = useHamleci();
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
              const oneY = hamleYapisi(hamle, (h) => { h.oneAl(x.id); });
              return (
                <div key={x.id} className="tc-pym-tp-bugun-satir">
                  <button type="button" className="tc-pym-tp-bugun-sat" onClick={() => ort.sipGoster(x.id)}>
                    <b>{ort.emirNo(x.id)}</b><span className="tc-pym-tp-rozet" data-durum={x.durum}>{x.durum === 'gec' ? `${sure(x.T)} geç` : `${sure(x.pay)} pay`}</span>
                    <span className="tc-pym-tp-not">{dar ? `asıl bekleme · ${dar}` : ''}</span>
                  </button>
                  <button type="button" className="tc-dugme tc-pym-kucuk" aria-label={`${ort.emirNo(x.id)} öne al`} aria-disabled={oneY.yap ? undefined : 'true'}
                    title={oneY.yap ? 'Motor bu siparişi öne alan planı arar; önizlersiniz.' : `Öne al: ${oneY.not}`} onClick={oneY.yap ?? undefined}>
                    <Simge ad="first" boyut="k" /><span data-metin="">Öne al</span>
                  </button>
                </div>
              );
            })}
            {!L.length && <p className="tc-pym-tp-not">Geciken ya da riskli sipariş yok.</p>}
          </div>
          <div>
            <h4>Son kararlar</h4>
            <Kararlar ort={ort} n={8} bos="Bu oturumda karar yok." />
          </div>
        </div>
      )}
    </section>
  );
}

const saatTr = (t: number) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
// Bu oturumda geri alınabilir kararlar (eski S.geri), en yenisi önce; "Öncesine dön" o karar dahil sonrakileri birlikte geri alır.
export function Kararlar({ ort, n, bos }: { ort: Ortam; n: number; bos: string }) {
  const komut = ort.o.komut;
  const L = komut?.geriAdimlari().slice(0, n) ?? [];
  if (!L.length) return <p className="tc-pym-tp-not">{bos}</p>;
  return (
    <>
      {L.map((g, i) => (
        <div key={`${g.t}-${i}`} className="tc-pym-tp-kar">
          <span>{g.ne}<small>{saatTr(g.t)}</small></span>
          <button type="button" className="tc-dugme" aria-disabled={!ort.yaz} title="Bu karardan öncesine dön" onClick={() => { if (ort.yaz) komut?.geriDon(i + 1); }}>
            <Simge ad="back" boyut="k" />Öncesine dön
          </button>
        </div>
      ))}
    </>
  );
}

// Sabah brifingi (cizBrif): çizelgeyi örtmeyen, katlı başlayan şerit (2729 b). Özeti üst çubuktaki gecikme satırındadır; gün temizse
// düğme ve şerit çıkmaz. Satır çözüme götürür.
type BrifHedefi = { sip: string } | { tezgah: string } | { ariza: string };
interface BrifOgesi { ik: SimgeAdi; durum: 'gec' | 'risk'; ana: string; alt: string; git: BrifHedefi }
// Saf: Pano her çizimde değil, plan değişince hesaplar (sürüklerken yeniden çizim sık).
export function brifOgeleri({ c, p, cx, now, liste, emirNo }: Pick<Ortam, 'c' | 'p' | 'cx' | 'now' | 'liste' | 'emirNo'>): BrifOgesi[] {
  const D = c.D;
  const gec = liste.filter((x) => x.durum === 'gec').sort((a, b) => (b.T ?? 0) - (a.T ?? 0)); const risk = liste.filter((x) => x.durum === 'risk');
  const dar = yukOranlari(D, p, cx, now, now + 72).filter((x) => x.oran >= DARBOGAZ); const mal = liste.filter(malzemeGec); const dn = duruslar(c);
  const ilk = gec[0] ?? risk[0];
  const l: (BrifOgesi | null)[] = [
    ilk ? { ik: 'alert', durum: 'gec', ana: `${gec.length} geciken, ${risk.length} riskli sipariş`,
      alt: gec.slice(0, 3).map((x) => `${emirNo(x.id)} ${sure(x.T)}`).join(' · ') || `Riskliler: ${risk.slice(0, 3).map((x) => emirNo(x.id)).join(', ')}`, git: { sip: ilk.id } } : null,
    dar[0] ? { ik: 'fire', durum: 'risk', ana: `${dar.length} tezgâh darboğaz (3 gün)`, alt: dar.slice(0, 3).map((x) => `${x.m} %${Math.round(x.oran * 100)}`).join(' · '),
      git: { tezgah: dar[0]?.m ?? '' } } : null,
    mal[0] ? { ik: 'box', durum: 'risk', ana: `${mal.length} siparişte malzeme geç`, alt: mal.slice(0, 3).map((x) => `${emirNo(x.id)} malzeme ${tz(D, x.bas)}`).join(' · '), git: { sip: mal[0]?.id ?? '' } } : null,
    dn[0] ? { ik: 'wrench', durum: 'gec', ana: `${dn.length} arıza`, alt: dn.map((d) => `${d.m} ${tz(D, d.from)} → ${zs(D, d.to)}`).join(' · '), git: { ariza: dn[0]?.m ?? '' } } : null,
  ];
  return l.filter((x): x is BrifOgesi => x !== null);
}
export const BRIF_SERIDI = 'tc-pym-tp-brif';
function brifeGit(ort: Ortam, h: BrifHedefi): void {
  if ('sip' in h) ort.sipGoster(h.sip);
  else if ('tezgah' in h) ort.suzSec({ g: null, m: h.tezgah, j: null });
  else ort.kartAc({ tur: 'gunluk', m: h.ariza });
}

export function Brif({ ort, l, kapat }: { ort: Ortam; l: BrifOgesi[]; kapat: () => void }) {
  return (
    <section className="tc-pym-tp-brif" id={BRIF_SERIDI} aria-label="Sabah brifingi">
      <span className="tc-pym-tp-brif-bas"><Simge ad="sun" boyut="k" />{`Günaydın · ${gs(ort.c.D, ort.now)}`}</span>
      <div className="tc-pym-tp-brif-l">
        {l.length ? l.map((x) => (
          <button key={x.ana} type="button" className="tc-pym-tp-brif-sat" data-durum={x.durum} onClick={() => brifeGit(ort, x.git)} title={x.alt}>
            <Simge ad={x.ik} boyut="k" /><span><b>{x.ana}</b><small>{x.alt}</small></span><Simge ad="chev-right" boyut="k" />
          </button>
        )) : <p className="tc-pym-tp-not"><Simge ad="check" boyut="k" /> Geciken, darboğaz ve eksik malzeme yok.</p>}
      </div>
      <button type="button" className="tc-dugme tc-pym-hayalet tc-pym-kucuk" aria-label="Brifingi katla" onClick={kapat}><Simge ad="up" boyut="k" /></button>
    </section>
  );
}
