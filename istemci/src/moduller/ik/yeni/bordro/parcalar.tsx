import { Fragment, useCallback, type ReactNode } from 'react';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import { Dugme, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, hataIletisi } from '../../../../ortak/veri/api.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { para } from '../bicim.ts';
import { ayKaydir } from '../ortak/AySecici.tsx';
import { AYLAR } from './kurallar.ts';
import type { AySonucu } from './motor-yuzu.ts';
import './bordro.css';

export interface BaslikDugmesi { anahtar: string; etiket: string; simge?: SimgeAdi; yap: () => void; birincil?: boolean; pasif?: boolean }

// Bugünkü sayfa başlığı: ad ve açıklama solda, bütün düğmeler sağda görünür.
export function Baslik({ baslik, simge, alt, dugmeler = [] }: { baslik: string; simge: SimgeAdi; alt?: ReactNode; dugmeler?: readonly BaslikDugmesi[] }) {
  return (
    <header className="tc-ikb-baslik">
      <div className="tc-ikb-baslik-bas">
        <h2 className="tc-ikb-baslik-ad"><Simge ad={simge} /><span>{baslik}</span></h2>
        {alt && <p className="tc-ikb-baslik-alt">{alt}</p>}
      </div>
      {dugmeler.length > 0 && (
        <div className="tc-ikb-baslik-eylem">
          {dugmeler.map((d) => (
            <Dugme key={d.anahtar} tur={d.birincil ? 'birincil' : 'ikincil'} simge={d.simge} disabled={d.pasif} onClick={d.yap}>{d.etiket}</Dugme>
          ))}
        </div>
      )}
    </header>
  );
}

// Bugünkü ay seçimi: önceki ve sonraki ay düğmeleri arasında ay ve yıl listeleri.
export function AyYilSecici({ ay, degistir, bugun }: { ay: string; degistir: (ay: string) => void; bugun: string }) {
  const yil = Number(ay.slice(0, 4));
  const buYil = Number(bugun.slice(0, 4));
  const yillar = Array.from(new Set([...Array.from({ length: 7 }, (_, i) => buYil - 5 + i), yil])).sort((a, b) => a - b);
  return (
    <span className="tc-ikb-ay" role="group" aria-label="Ay">
      <Dugme simge="chev-left" aria-label="Önceki ay" onClick={() => { degistir(ayKaydir(ay, -1)); }} />
      <Secim etiket="Ay" secenekler={AYLAR.map((a, i) => ({ deger: String(i + 1).padStart(2, '0'), baslik: a }))} value={ay.slice(5, 7)}
        onChange={(e) => { degistir(`${ay.slice(0, 4)}-${e.target.value}`); }} />
      <Secim etiket="Yıl" secenekler={yillar.map((y) => ({ deger: String(y), baslik: String(y) }))} value={String(yil)}
        onChange={(e) => { degistir(`${e.target.value}-${ay.slice(5, 7)}`); }} />
      <Dugme simge="chev-right" aria-label="Sonraki ay" onClick={() => { degistir(ayKaydir(ay, 1)); }} />
    </span>
  );
}

// Seçenekli düğme grubu (bugünkü "seg"): sekme değil, görünüm seçimidir; seçili düğme aria-pressed taşır.
export function DugmeGrubu<K extends string>({ etiket, secenekler, secili, sec }: {
  etiket: string; secenekler: readonly (readonly [K, string])[]; secili: K; sec: (k: K) => void;
}) {
  return (
    <div className="tc-ikb-grup" role="group" aria-label={etiket}>
      {secenekler.map(([k, ad]) => (
        <button key={k} type="button" className="tc-ikb-grup-dugme" aria-pressed={k === secili} onClick={() => { sec(k); }}>{ad}</button>
      ))}
    </div>
  );
}

export function Bolum({ baslik, eylem, children, className }: { baslik?: string; eylem?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={['tc-ikb-bolum', className].filter(Boolean).join(' ')} aria-label={baslik}>
      {(baslik || eylem) && (
        <header className="tc-ikb-bolum-ust">
          {baslik && <h3>{baslik}</h3>}
          {eylem && <div className="tc-ikb-bolum-eylem">{eylem}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Not({ children }: { children: ReactNode }) {
  return <p className="tc-ikb-not">{children}</p>;
}

// Yardım metinleri bugünkü ekranın sabit metnidir (<p>, <p class="ref">, <b>); kullanıcı verisi buraya girmez.
const PARAGRAF = /<p( class="ref")?>([\s\S]*?)<\/p>/g;
function satirIci(metin: string): ReactNode[] {
  return metin.split(/(<b>[\s\S]*?<\/b>)/g).filter(Boolean).map((p, i) => {
    const m = /^<b>([\s\S]*)<\/b>$/.exec(p);
    const duz = (m ? m[1] ?? '' : p).replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    return m ? <b key={i}>{duz}</b> : <Fragment key={i}>{duz}</Fragment>;
  });
}
export function Metin({ html }: { html: string }) {
  const parcalar = [...html.matchAll(PARAGRAF)];
  return <>{parcalar.map((m, i) => <p key={i} className={m[1] ? 'tc-ikb-dayanak' : undefined}>{satirIci(m[2] ?? '')}</p>)}</>;
}

export function Aciklama({ baslik, html, children }: { baslik?: string; html?: string; children?: ReactNode }) {
  return (
    <div className="tc-ikb-aciklama">
      {baslik && <h4>{baslik}</h4>}
      {html !== undefined && <Metin html={html} />}
      {children}
    </div>
  );
}

// Hesaplama adımları (bugünkü "steps" tablosu): başlık satırı, açıklamalı satır ve toplam satırı.
export type Adim = { h: string } | { l: string; v: string; n?: ReactNode; tot?: boolean };
export function Adimlar({ adimlar }: { adimlar: readonly Adim[] }) {
  return (
    <div className="tc-ikb-tablo-kap">
      <table className="tc-ikb-adimlar">
        <tbody>
          {adimlar.map((a, i) => ('h' in a
            ? <tr key={i} data-bas=""><td colSpan={2}>{a.h}</td></tr>
            : (
              <tr key={i} data-toplam={a.tot ? '' : undefined}>
                <td><b>{a.l}</b>{a.n !== undefined && <div className="tc-ikb-soluk">{a.n}</div>}</td>
                <td data-sag="">{a.v}</td>
              </tr>
            )))}
        </tbody>
      </table>
    </div>
  );
}

export const yuzde = (v: number): string => `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
export const sayiMetni = (v: number): string => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
export const eksi = (v: number): string => `−${para(v)}`;

// Kişinin aylık bordro dökümü (bugünkü pusula penceresi ve kişi sayfasındaki tahmin).
export function HesapDokumu({ a, oranlar }: { a: AySonucu; oranlar: { sgkIsci: number; issIsci: number; bes: number; sgkIsveren: number; issIsveren: number } }) {
  const satir = (dt: string, dd: string, tur?: 'top' | 'alt') => (
    <Fragment key={dt + dd}><dt data-tur={tur}>{dt}</dt><dd data-tur={tur}>{dd}</dd></Fragment>
  );
  const yanHak = (ad: string, y: AySonucu['yemek']) => {
    if (!y) return null;
    if (y.hizmet) return satir(`${ad}: ${y.yontem}`, 'bordro dışı', 'alt');
    return (
      <Fragment key={ad}>
        {satir(`${ad} (${y.yontem}, ${y.fg} fiili gün)`, para(y.tutar))}
        {satir('GV istisnası / SGK istisnası', `${para(y.gvIst)} / ${y.sgkIst === y.tutar ? 'tamamı' : para(y.sgkIst)}`, 'alt')}
      </Fragment>
    );
  };
  return (
    <dl className="tc-ikb-dokum">
      {a.gun < 30 && satir('Aylık brüt ücret', para(a.aylik))}
      {a.gun < 30 && satir('Prim günü', `${a.gun} gün`)}
      {satir(`Brüt ücret${a.gun < 30 ? ` (${a.gun}/30)` : ''}`, para(a.brut))}
      {a.ek ? satir('Ek ödeme (prim, ikramiye)', para(a.ek)) : null}
      {a.mesaiUcret ? satir('Fazla mesai ücreti', para(a.mesaiUcret)) : null}
      {(a.primDetay ?? []).map((p) => satir(p.ad, `${para(p.tutar)} (ek ödemeye dahil)`, 'alt'))}
      {yanHak('Yemek yardımı', a.yemek)}
      {yanHak('Yol yardımı', a.yol)}
      {satir('Toplam brüt', para(a.toplam), 'top')}
      {satir(`SGK işçi payı (${yuzde(oranlar.sgkIsci)})`, eksi(a.sgk))}
      {satir(`İşsizlik işçi payı (${yuzde(oranlar.issIsci)})`, eksi(a.iss))}
      {a.ind ? satir('Engellilik indirimi', eksi(a.ind)) : null}
      {satir('Gelir vergisi matrahı', para(a.matrah))}
      {satir('Kümülatif matrah (önceki aylar)', para(a.cumOnce))}
      {satir('Hesaplanan gelir vergisi', para(a.gvHam))}
      {satir('Asgari ücret gelir vergisi istisnası', eksi(a.gvIst))}
      {satir('Gelir vergisi', eksi(a.gv))}
      {satir('Damga vergisi (istisna sonrası)', eksi(a.dv))}
      {a.kesinti ? satir('Diğer kesintiler (avans, icra vb.)', eksi(a.kesinti)) : null}
      {a.bes ? satir(`Bireysel emeklilik (${yuzde(oranlar.bes)})`, eksi(a.bes)) : null}
      {satir('Net (yan haklar dahil)', para(a.net), 'top')}
      {a.ayni ? satir('Kart / ayni ödenen yan haklar', eksi(a.ayni)) : null}
      {a.ayni ? satir('Bankaya ödenecek', para(a.banka), 'top') : null}
      {satir(`SGK işveren payı (${yuzde(oranlar.sgkIsveren)})`, para(a.isvBrut))}
      {a.tesvik ? satir(`Teşvik: ${a.tesvik.ad}`, eksi(a.tInd)) : null}
      {satir(`İşsizlik işveren payı (${yuzde(oranlar.issIsveren)})`, para(a.isvIss))}
      {satir('Toplam işveren maliyeti', para(a.maliyet), 'top')}
    </dl>
  );
}

// Yazma sonucu kullanıcıya bildirilir; eski sürüm iletisini veri.ts zaten gösterir.
export type Yazici = (is: () => Promise<unknown>, tamam: string, hata: string) => Promise<boolean>;
export function useYaz(): Yazici {
  const { bildir } = useBildirim();
  return useCallback<Yazici>(async (is, tamam, hata) => {
    try {
      await is();
    } catch (h) {
      if (!(h instanceof ApiHatasi && eskiSurumMu(h.govde))) bildir('hata', hataIletisi(h, hata));
      return false;
    }
    if (tamam) bildir('tamam', tamam);
    return true;
  }, [bildir]);
}
