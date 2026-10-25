import { Dugme, Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import {
  fasonDurumu, fasoncular, fasonTalasliMi, fasonTutari, gunYaz, isoGun, isoSaat, pdDenge, pdKat, planIsleri, sayi, tl, tmAyar, zamanYaz,
  type FasonIsi, type IsTanimi,
} from '../kurallar.ts';
import { fasonKararKaldirYaz, fasonTerminYaz, nesneMi, type Yaz } from '../yazmalar.ts';
import { AltNot, AsilKart, Kpi, MOTOR_KAPALI, Not } from './girdi.tsx';
import { TonRozeti } from '../ortak.tsx';

// Fason planının "Tüm satırlar"ı: bugünkü sayfanın kartları (zu-yan-sayfalar sFasonPlani, zv-termin tmFasonKart). Öneriyi plan motoru
// hesaplar; kart görünür, düğmesi kapalıdır (357 b). Müdür kararını kaldırmak motor istemez.

type Y = (f: (z: Yaz) => boolean) => boolean;
const katYaz = (d: number): string => { const k = pdKat(d); return `×${sayi(k, k >= 10 ? 0 : 2)}`; };

export function FasonSayfasi({ c, I, L, para, yaz }: { c: PlanlamaCalismasi; I: Map<string, IsTanimi> | null; L: FasonIsi[]; para: boolean; yaz: Yaz | null }) {
  const D = c.D;
  const y: Y = (f) => (yaz ? f(yaz) : false);
  const karar = nesneMi(D.fasonKarar) ? D.fasonKarar : {};
  const kl = Object.entries(karar);
  return (
    <>
      <PlanKarti c={c} I={I} para={para} karar={karar} />
      <AsilKart simge="target" baslik="Plan önerisi" eylem={<Dugme simge="play" disabled title={MOTOR_KAPALI}>Önerileri hesapla</Dugme>}>
        <Not>Öneri için güncel plan gerekir. Plan, darboğaz tezgâhtaki fasona uygun işleri tek tek talaşlı fasona vermeyi ve kendi seçtiği fasonları geri almayı dener. {MOTOR_KAPALI}</Not>
        {kl.length > 0 && (
          <>
            <Not><b>Müdür kararları</b></Not>
            <div className="tc-pyk-cipler">
              {kl.map(([id, x]) => {
                const k = nesneMi(x) ? x : {};
                return (
                  <span key={id} className="tc-pyk-cip">
                    {id} · {k.karar === 'kabul' ? 'fasonda' : 'içeride'} · {String(k.kim ?? '')}
                    {yaz && <button type="button" aria-label={`${id} kararını kaldır`} onClick={() => { y((z) => fasonKararKaldirYaz(z, id)); }}><Simge ad="x" boyut="k" /></button>}
                  </span>
                );
              })}
            </div>
          </>
        )}
        <Not>Yalnız rotada "gerekirse fasona verilebilir" işaretli adımlar talaşlı fasona gidebilir. Net kazanç = önlenen gecikme bedeli × plan dengesi çarpanı ({katYaz(pdDenge(D))}) − (fason − tezgâh ve ayar) maliyet farkı. Müdür kararı motora kısıt olarak girer: "Fasona ver" o adımı yalnız fasonda, "İçeride yap" yalnız tezgâhta planlatır. Karar yoksa motor tek TL toplamına göre kendisi seçer.</Not>
      </AsilKart>
      {I && <TerminKarti c={c} L={L} y={y} kapali={!yaz} />}
    </>
  );
}

function PlanKarti({ c, I, para, karar }: { c: PlanlamaCalismasi; I: Map<string, IsTanimi> | null; para: boolean; karar: Record<string, unknown> }) {
  const D = c.D;
  if (!c.plan || !I) return <AsilKart simge="truck" baslik="Fason planı"><Not>Önce plan kurulmalı.</Not></AsilKart>;
  const fas = planIsleri(c).filter((r) => r.fas).sort((a, b) => a.S - b.S);
  const FS = fasoncular(D);
  const topTL = fas.reduce((a, r) => a + (fasonTutari(D, r, I.get(r.id)) ?? 0), 0);
  return (
    <AsilKart simge="truck" baslik="Fason planı">
      <Kpi l={[
        ['truck', 'Fason sevki', String(fas.length), `${String(fas.filter((r) => fasonTalasliMi(D, r)).length)} talaşlı`],
        ['lira', 'Fason maliyeti', para ? tl(topTL) : 'müdürde', 'taşıma dahil'],
        ['flag', 'Müdür kararı', String(Object.keys(karar).length), 'kabul ya da red'],
      ]} />
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>İş</th><th>Fasoncu</th><th>Çıkış</th><th>Dönüş</th>{para && <th className="tc-pyk-num">Maliyet</th>}<th>Tür</th></tr></thead>
          <tbody>
            {fas.length === 0 && <tr><td colSpan={6} className="tc-pyk-soluk">Fason sevki yok.</td></tr>}
            {fas.map((r) => {
              const o = I.get(r.id);
              const f = FS.find((x) => `@${x.id}` === r.m);
              return (
                <tr key={r.id}>
                  <td><b className="tc-pyk-mono">{r.id}</b><AltNot>{o?.ad ?? ''} · {sayi(o?.adet ?? null, 0)} adet</AltNot></td>
                  <td>{f?.ad ?? r.m}</td>
                  <td>{zamanYaz(D, r.S)}</td>
                  <td>{zamanYaz(D, r.C)}</td>
                  {para && <td className="tc-pyk-num">{tl(fasonTutari(D, r, o))}</td>}
                  <td>{fasonTalasliMi(D, r) ? (karar[r.id] !== undefined ? <Rozet ton="tamam">Müdür kabul etti</Rozet> : <Rozet ton="uyari">Plan seçti</Rozet>) : <Rozet ton="pasif">Rotada fason</Rozet>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AsilKart>
  );
}

function TerminKarti({ c, L, y, kapali }: { c: PlanlamaCalismasi; L: FasonIsi[]; y: Y; kapali: boolean }) {
  const D = c.D;
  const A = tmAyar(D);
  const gir = (t: number | null): string => (t === null ? '' : isoGun(D, Math.floor(t / 24)));
  return (
    <AsilKart simge="truck" baslik="Fason dönüş terminleri">
      <div className="tc-tablo-kap">
        <table className="tc-tablo">
          <thead><tr><th>İş</th><th>Fasoncu</th><th>Durum</th><th>Çıkış</th><th>Gerekli dönüş</th><th>En geç</th><th>Dönüş termini</th><th>Planda dönüş</th></tr></thead>
          <tbody>
            {L.length === 0 && <tr><td colSpan={8} className="tc-pyk-soluk">Planda fason yok.</td></tr>}
            {L.map((x) => {
              const [d, ton] = fasonDurumu(x);
              return (
                <tr key={x.id} data-ton={ton === 'hata' ? 'hata' : undefined}>
                  <td><b className="tc-pyk-mono">{x.id}</b><AltNot>{x.tanim?.ad ?? ''} · {sayi(x.tanim?.adet ?? null, 0)} adet</AltNot></td>
                  <td>{x.f?.ad ?? x.r.m}</td>
                  <td><TonRozeti ton={ton}>{d}</TonRozeti></td>
                  <td>{gunYaz(D, x.r.S)}</td>
                  <td>{gunYaz(D, x.ger)}</td>
                  <td>{gunYaz(D, x.enGec)}</td>
                  <td>
                    {kapali ? gunYaz(D, x.T) : (
                      <input
                        key={gir(x.T)} className="tc-alan-kutu tc-pyk-tarih" type="date" defaultValue={gir(x.T)} aria-label={`${x.id} fason dönüş termini`}
                        onChange={(o) => { const v = o.currentTarget.value; if (v !== gir(x.T)) y((z) => fasonTerminYaz(z, x.id, v, Number.isFinite(x.r.C) ? isoSaat(D, x.r.C) : null)); }}
                      />
                    )}
                    <AltNot>referans {gunYaz(D, x.ref ?? x.tahmini)}</AltNot>
                  </td>
                  <td>{gunYaz(D, x.r.C)}<AltNot>{x.T === null ? 'referans terminden' : 'terminden'}</AltNot></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Not>Gerekli dönüş: işin sonraki adımının planlanan başlangıcı (son adımsa sipariş termini). En geç: siparişin terminini kaçırmadan dönebileceği son gün. Termin girilmeyen fasonda dönüş, fasoncunun süresi × katsayısından (fasoncunun kendi katsayısı, yoksa genel {sayi(A.katFas, 2)}){A.ekFas ? ` + 100 adet başına ${sayi(A.ekFas, 1)} gün` : ''} tahmin edilir; girilen termin kesin süredir ve plan onu kullanır.</Not>
    </AsilKart>
  );
}
