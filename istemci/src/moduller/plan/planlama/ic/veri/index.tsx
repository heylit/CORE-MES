import { useMemo, useState } from 'react';
import { Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import '../../../../../ortak/arayuz/tablo.css';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import { bitenler, derle, girdiKur, planOku, plandanBitenler } from '../../motor/kurallar.ts';
import { AyarMatrisi } from './Ayar.tsx';
import { Denetim, denetimBulgulari, hataMetni } from './Denetim.tsx';
import { Kisitlar } from './Kisitlar.tsx';
import { FasonListesi, MalzemeListesi, PersonelListesi, SiparisListesi, TezgahListesi, type ListeOzellikleri } from './Listeler.tsx';
import { ILK_BOLUM, VERI_BOLUMLERI, type VeriBolumu } from './kurallar.ts';
import { Rotalar } from './Rotalar.tsx';
import { Takvim } from './Takvim.tsx';
import './veri.css';

export { VERI_BOLUMLERI, bolumOku, type VeriBolumu } from './kurallar.ts';

// "Veri ve kısıtlar" ekranı (bugünkü sayfa b-kabuk.betik EKRANLAR veri; 575 a: iç görünümler yeni sayfaya aynen gelir). Ekranın kendi görünüm
// seridi bugünkü sayfanın ikinci menüsünün yerindedir; bölüm denetimli verilirse (`bolum`, `bolumSec`, adres) onu izler, verilmezse kendi
// durumunu tutar. Veri çalışmanın verisinden okunur; yazma yalnız planlama çalışmasının alanlarına ve çalışma komutuyla (221 c, 222 a).

export interface VeriEkraniOzellikleri extends PlanlamaEkranOzellikleri {
  bolum?: VeriBolumu;
  bolumSec?: (b: VeriBolumu) => void;
}

export function VeriVeKisitlar(o: VeriEkraniOzellikleri) {
  const { calisma: c, komut, yetki } = o;
  const [ic, icYaz] = useState<VeriBolumu>(ILK_BOLUM);
  const bolum = o.bolum ?? ic;
  const sec = (b: VeriBolumu) => { if (o.bolumSec) o.bolumSec(b); else icYaz(b); };
  const { bildir } = useBildirim();
  const uyar = (ileti: string) => { bildir('hata', ileti); };
  const emirler = o.depo.durum?.emirler ?? null;
  const p = useMemo(() => (c ? planOku(c) : null), [c]);
  const derleme = useMemo(() => {
    if (!c) return null;
    try { return { cx: derle(girdiKur(c, emirler ? bitenler(emirler, c.D) : plandanBitenler(c, p))), hata: null }; } catch (e) { return { cx: null, hata: hataMetni(e) }; }
  }, [c, p, emirler]);
  const cx = derleme?.cx ?? null;
  const bulgular = useMemo(() => (!c || !derleme ? [] : derleme.cx ? denetimBulgulari(c, derleme.cx) : [{ k: 'hata', t: `Veri derlenemedi: ${derleme.hata ?? ''}` }]), [c, derleme]);

  return (
    <div className="tc-pyi" data-parca="veri" data-bolum={bolum}>
      <nav className="tc-pyi-serit-menu" aria-label="Veri ve kısıtlar">
        {VERI_BOLUMLERI.map(([k, ad, s]) => (
          <button key={k} type="button" aria-current={k === bolum ? 'page' : undefined} onClick={() => { sec(k); }}>
            <Simge ad={s} boyut="k" /><span>{ad}</span>{k === 'denetim' && bulgular.length > 0 && <span className="tc-pyi-sayi">{bulgular.length}</span>}
          </button>
        ))}
      </nav>
      {!c ? (
        <div className="tc-pyi-bos"><Simge ad="layers" /><strong>Planlama çalışması yok</strong><span>Çalışma kaydı açılınca veri ve kısıtlar burada görünür.</span></div>
      ) : (
        <section className="tc-pyi-icerik" aria-label={VERI_BOLUMLERI.find((x) => x[0] === bolum)?.[1]}>
          {(() => {
            const l: ListeOzellikleri = {
              c, p, cx, komut, planYaz: yetki.planYaz, maliyet: yetki.maliyetOku, uyar,
              cizelgede: (s) => { o.sec({ siparis: s, adim: null }); o.git('plan'); },
            };
            switch (bolum) {
              case 'siparisler': return <SiparisListesi {...l} />;
              case 'kisitlar': return <Kisitlar c={c} komut={komut} planYaz={yetki.planYaz} git={sec} uyar={uyar} />;
              case 'tezgahlar': return <TezgahListesi {...l} />;
              case 'rotalar': return <Rotalar c={c} />;
              case 'takvim': return <Takvim c={c} komut={komut} planYaz={yetki.planYaz} />;
              case 'personel': return <PersonelListesi {...l} />;
              case 'malzeme': return <MalzemeListesi {...l} />;
              case 'fason': return <FasonListesi {...l} />;
              case 'ayar': return <AyarMatrisi c={c} komut={komut} planYaz={yetki.planYaz} uyar={uyar} />;
              case 'denetim': return <Denetim bulgular={bulgular} git={sec} />;
            }
          })()}
        </section>
      )}
    </div>
  );
}
