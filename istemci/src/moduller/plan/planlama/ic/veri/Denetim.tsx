import { Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import { veriDenetimi, type Derleme, type VeriBulgusu } from '../../motor/kurallar.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { DENETIM_SAYFASI, denetimAdi, denetimGruplari, denetimTonu, type VeriBolumu } from './kurallar.ts';
import { KucukDugme, Serit, VeriKarti } from './ortak.tsx';

// Veri denetimi (02-orta.betik sDenetim, denetimBulgulari): çözücüden önce kısıtların birlikte sınanması. Denetim motorun derlemesiyle aynı kuralla
// kurulan girdiden yapılır (motor/kurallar.ts veriDenetimi; motor koşmaz). Derleme kurulamazsa bulgu olarak yazılır.

export const hataMetni = (e: unknown): string => (e instanceof Error ? e.message : String(e));
export function denetimBulgulari(c: PlanlamaCalismasi, cx: Derleme): VeriBulgusu[] {
  try { return veriDenetimi(c, cx); } catch (e) { return [{ k: 'hata', t: `Veri derlenemedi: ${hataMetni(e)}` }]; }
}

export function Denetim({ bulgular, git }: { bulgular: VeriBulgusu[]; git: (b: VeriBolumu) => void }) {
  const gruplar = denetimGruplari(bulgular);
  return (
    <div className="tc-pyi-dik">
      <Serit simge="scan">
        Denetim çözücüden önce kısıtları birlikte sınar: açık vardiyada yetkin personel ve ayarcı, rotadaki tezgâh ve öncül, tanımsız aparat, ayar matrisinde olmayan
        aile geçişi, karşılanmayan malzeme, çıkış günü olmayan fasoncu. Veri her değiştiğinde yeniden koşar.
      </Serit>
      {gruplar.length === 0 && <Serit ton="tamam" simge="check">Bulgu yok. Kısıtlar birlikte tutarlı.</Serit>}
      {gruplar.map(([k, bs]) => {
        const sayfa = DENETIM_SAYFASI[k];
        return (
          <VeriKarti
            key={k} baslik={denetimAdi(k)} ek={<Rozet ton="uyari">{String(bs.length)}</Rozet>}
            sag={sayfa ? <KucukDugme ad="Düzelt" metin="Düzelt" simge="edit" yap={() => { git(sayfa); }} /> : undefined}
          >
            <ul className="tc-pyi-olaylar">
              {bs.map((b, i) => <li key={i} className="tc-pyi-olay" data-ton={denetimTonu(k)}><Simge ad="alert" boyut="k" /><span>{b.t}</span></li>)}
            </ul>
          </VeriKarti>
        );
      })}
    </div>
  );
}
