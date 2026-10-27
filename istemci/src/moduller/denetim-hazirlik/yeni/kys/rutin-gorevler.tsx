import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { guvenliAd, indir } from '../disa-aktar.ts';
import { RT, RTF, type Donem } from '../icerik/kys-yapi.ts';
import { donemAnahtari, donemEtiketi, rolAdi, rutinIstatistigi, rutinYapildi } from '../kurallar/kys.ts';
import { bugunTarihi } from '../tarih.ts';
import { rutinTakvimi } from './dokuman-metni.ts';
import { Bolum, KysBaglantisi, OranCubugu, yuzdeTonu } from './ortak.tsx';

// Rutin görevler (prototip kysRutin, rtIcs): dönem başına işaretler; dönem değişince sıfırlanır, geçmiş dönem uyumu hesaplanır.

const KAYIT_SINIRI = 60;

export function RutinGorevler() {
  const d = useDenetim();
  const yaz = d.yetki.yazabilir;
  const isaretle = (id: string, f: Donem, v: boolean) => {
    const anahtar = donemAnahtari(f);
    d.degistir(null, (t) => {
      const arr = t.kys.rt[id] ?? [];
      t.kys.rt[id] = arr;
      const ix = arr.indexOf(anahtar);
      if (v && ix < 0) { arr.push(anahtar); if (arr.length > KAYIT_SINIRI) arr.shift(); } else if (!v && ix >= 0) arr.splice(ix, 1);
      if (!t.kys.rtStart) t.kys.rtStart = bugunTarihi();
    });
  };
  return (
    <>
      <Bolum baslik="KYS rutin görevleri" simge="rotate" sag={(
        <Dugme simge="download" onClick={() => {
          indir(`${guvenliAd(`kys-rutin-gorevler-${d.profil.profile.firma || 'firma'}`)}.ics`, rutinTakvimi(d.profil, d.depo.active), 'text/calendar');
          d.bildir('Haftalık, aylık, üç aylık ve yıllık hatırlatmalar indirildi');
        }}>Takvime tekrarlayan hatırlatmalar</Dugme>
      )}>
        <p className="tc-dhk-not">
          Sistemi yaşatan düzenli işler. İşaretler dönem değişince kendiliğinden sıfırlanır; geçmiş dönemler uyum oranında görünür.
          Sorumlular Görev tanımları sekmesindeki rollerdir.
        </p>
      </Bolum>
      <div className="tc-dhk-rutinler">
        {(Object.keys(RTF) as Donem[]).map((f) => {
          const s = rutinIstatistigi(d.profil, f);
          const cur = donemAnahtari(f);
          return (
            <section key={f} className="tc-dhk-kart tc-dhk-rutin">
              <header className="tc-dhk-kart-ust">
                <h3>{RTF[f]}<small className="tc-dhk-soluk">{donemEtiketi(f)}</small></h3>
                <span className="mono">{`${String(s.k)}/${String(s.n)}`}</span>
              </header>
              <OranCubugu etiket={`${RTF[f]}: ${String(s.k)}/${String(s.n)}`} parcalar={[{ oran: s.n ? s.k / s.n : 0, ton: 'vurgu' }]} />
              <ul className="tc-dhk-rutin-liste">
                {RT.filter((x) => x.f === f).map((x) => {
                  const dn = rutinYapildi(d.profil, x.id, cur);
                  return (
                    <li key={x.id} className="tc-dhk-rutin-satir" data-yapildi={dn || undefined}>
                      <label>
                        <input type="checkbox" checked={dn} disabled={!yaz} onChange={(e) => { isaretle(x.id, f, e.target.checked); }} />
                        <span><span>{x.t}</span><small>{rolAdi(x.r)}</small></span>
                      </label>
                      <KysBaglantisi hedef={x.l} />
                    </li>
                  );
                })}
              </ul>
              <p className="tc-dhk-not">
                {s.uyum === null
                  ? 'Geçmiş dönem uyumu, işaretlemeye başladıktan sonraki dönemlerde hesaplanır.'
                  : <>{`Son ${String(s.per)} dönemde uyum: `}<b className={`tc-dhy-ton-${yuzdeTonu(s.uyum)}`}>{`%${String(s.uyum)}`}</b></>}
              </p>
            </section>
          );
        })}
      </div>
    </>
  );
}
