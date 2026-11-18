import { useLayoutEffect, useRef } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi } from '../bicim.ts';
import { adimAdi, adimCarpani, adimDali, adimSuresi, dalBilgileri, fasonMu, sirali, sureSayisi, type Adim, type Dugum } from './kurallar.ts';
import { renkSinifi, type RotaEkrani } from './ortak.tsx';
import { ANA_HAT, hatSeritleri, zamanCizelgesi, type SureGirdisi, type ZamanCizelgesi } from './yatayHat.ts';

// 3248-2: hatta açılan yarı mamul akışı süre şeridinde kendi satırıdır; tükettiği adımın başlangıcından sonra hazır oluyorsa onu bekletir.
export interface YmSatiri { kod: string; hedef: Adim; dugum: Dugum }

// Adımın süre girdisi: adım kutusundaki hesapla aynı (istasyon verimi, dal çarpanı). İstasyonu olmayan adımın süresi yoktur (null).
export function sureGirdisi(r: RotaEkrani, d: Dugum): (a: Adim) => SureGirdisi {
  const { h } = r.duzen;
  return (a) => {
    const ist = a.stationId ? h.istasyon.get(a.stationId) : undefined;
    const adet = (d.adimlar.find((x) => x.a.id === a.id)?.miktar ?? d.miktar) * adimCarpani(a);
    const hazirlikDk = sureSayisi(a.setup) ?? 0;
    const t = adimSuresi(a, adet, ist, r.gunSaati(ist?.wcId ?? null));
    if (!t) return { dk: null, hazirlikDk, parcaDk: 0 };
    return { dk: t.dk, hazirlikDk, parcaDk: adet > 0 ? (t.dk - hazirlikDk) / adet : 0 };
  };
}

const saat = (dk: number) => sayi(Math.round((dk / 60) * 10) / 10);
const seritAdi = (s: string, carpan: number | null, bagimsiz: boolean) => (s === ANA_HAT ? 'Ana hat'
  : `Dal ${s}${bagimsiz ? ' (bağımsız)' : ''}${carpan !== null && carpan > 1 ? ` ×${String(carpan)}` : ''}`);

// 3248: süre şeridi. Her şerit ana hattın ya da bir dalın adımlarını zamana göre dizer; çakışan adım alt satıra iner (çubuklar tam boy kalır).
// Konum ve genişlik ölçüdür, bütün rotanın bitişine oranla yüzde olarak çizimde yazılır.
export function SureSeridi({ r, d, z, miktar, ymler = [] }: { r: RotaEkrani; d: Dugum; z: ZamanCizelgesi; miktar: number; ymler?: readonly YmSatiri[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const liste = sirali(r.duzen.adimlar(d.id));
  const seritler = hatSeritleri(liste);
  const sure = sureGirdisi(r, d);
  useLayoutEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('[data-bas]').forEach((el) => {
      el.style.setProperty('--tc-rr1-ss-bas', `${el.dataset.bas ?? '0'}%`);
      el.style.setProperty('--tc-rr1-ss-en', `${el.dataset.en ?? '0'}%`);
      el.style.setProperty('--tc-rr1-ss-hz', `${el.dataset.hz ?? '0'}%`);
      el.style.setProperty('--tc-rr1-ss-alt', el.dataset.alt ?? '0');
    });
    ref.current?.querySelectorAll<HTMLElement>('[data-satir]').forEach((el) => { el.style.setProperty('--tc-rr1-ss-satir', el.dataset.satir ?? '1'); });
  });
  const fasonGun = liste.filter((a) => fasonMu(a) && z.zaman.get(a.id)?.kritik === true).reduce((t, a) => t + (a.terminGun ?? 0), 0);
  const sureYok = liste.filter((a) => z.zaman.get(a.id)?.sureYok === true).length;
  const kritikDal = seritler.find((s) => s !== ANA_HAT && liste.some((a) => adimDali(a) === s && z.zaman.get(a.id)?.kritik === true));
  const bagimsizDallar = new Set(dalBilgileri(liste).filter((b) => b.bagimsiz).map((b) => b.dal));
  // Yarı mamul akışı sıfırdan başlar (kendi emri); şeridin ölçeği en geç biteni kapsar.
  const ym = ymler.map((y) => {
    const l = sirali(r.duzen.adimlar(y.dugum.id));
    const c = zamanCizelgesi(l, sureGirdisi(r, y.dugum));
    const bas = z.zaman.get(y.hedef.id)?.bas ?? 0;
    return { ...y, l, c, bekletir: c.bitis > bas ? c.bitis - bas : 0 };
  });
  const olcek = Math.max(z.bitis, ...ym.map((y) => y.c.bitis));
  const yuzde = (n: number) => String(olcek > 0 ? Math.round((n / olcek) * 10000) / 100 : 0);
  const secili = r.secim?.tur === 'adim' && r.secim.urunId === d.id ? r.secim.adimId : null;
  return (
    <section className="tc-rr1-ss" aria-label="Süre şeridi" ref={ref}>
      <div className="tc-rr1-ss-bas">
        <span className="tc-rr1-ss-baslik"><Simge ad="clock" boyut="k" /> Süre şeridi</span>
        <span className="tc-rr1-ss-ozet">
          {sayi(miktar)} adet · kritik yol <b>{saat(z.kritikDk)} sa</b>
          {fasonGun > 0 && <> + fason <b>{String(fasonGun)} gün</b></>}
          {kritikDal !== undefined ? ` · Dal ${kritikDal} birleşmeyi bekletiyor` : seritler.length > 1 ? ' · dallar ana hattı bekletmiyor' : ''}
          {sureYok > 0 && ` · ${String(sureYok)} adımın süresi yok`}
          {ym.filter((y) => y.bekletir > 0).map((y) => ` · ${y.kod} (yarı mamul) ${adimAdi(y.hedef)} adımını ${saat(y.bekletir)} sa bekletiyor`).join('')}
        </span>
        <span className="tc-rr1-ss-lejant" aria-hidden="true">
          <i className="tc-rr1-ss-lj tc-rr1-ss-lj-hz" />hazırlık <i className="tc-rr1-ss-lj tc-rr1-ss-lj-kr" />kritik yol <i className="tc-rr1-ss-lj tc-rr1-ss-lj-fs" />fason
        </span>
      </div>
      <div className="tc-rr1-ss-izler">
        {ym.map((y) => [
          <span key={`ya${y.dugum.nid}`} className="tc-rr1-ss-ad">{y.kod} (YM)</span>,
          <div key={`yi${y.dugum.nid}`} className="tc-rr1-ss-iz" data-satir={String(y.c.altSatir.get(ANA_HAT) ?? 1)} role="group" aria-label={`${y.kod} yarı mamul akışı`}>
            {y.l.map((a) => {
              const t = y.c.zaman.get(a.id);
              if (!t) return null;
              const op = r.duzen.h.op.get(a.opId);
              return (
                <span key={a.id} className={`tc-rr1-ss-cubuk tc-rr1-ss-ym ${a.stationId ? renkSinifi(a.stationId) : 'tc-rr1-renk-yok'}`}
                  data-bas={yuzde(t.bas)} data-en={yuzde(t.bit - t.bas)} data-hz="0" data-alt={String(t.altSira)} title={`${y.kod} ${adimAdi(a)} ${op?.name ?? ''}`.trim()}>
                  <span className="tc-rr1-ss-yazi">{op?.abbr ?? op?.code ?? '?'}</span>
                </span>
              );
            })}
          </div>,
        ])}
        {seritler.map((s) => {
          const adimlar = liste.filter((a) => (adimDali(a) ?? ANA_HAT) === s);
          return [
            <span key={`a${s}`} className="tc-rr1-ss-ad">{seritAdi(s, s === ANA_HAT ? null : adimlar[0]?.adetCarpani ?? null, bagimsizDallar.has(s))}</span>,
            <div key={`i${s}`} className="tc-rr1-ss-iz" data-satir={String(z.altSatir.get(s) ?? 1)}>
              {adimlar.map((a) => {
                const t = z.zaman.get(a.id);
                if (!t) return null;
                const op = r.duzen.h.op.get(a.opId);
                const g = sure(a);
                const ad = `OP ${String(a.seq)} ${op?.name ?? ''}`;
                const ayrinti = t.fason ? `fason, ${a.terminGun ? `${String(a.terminGun)} gün` : 'termin girilmedi'}`
                  : t.sureYok ? 'süre hesaplanmadı: istasyon yok' : `hazırlık ${sayi(Math.round(g.hazirlikDk))} dk + işlem ${sayi(Math.round((g.dk ?? 0) - g.hazirlikDk))} dk`;
                return (
                  <button
                    key={a.id} type="button"
                    className={`tc-rr1-ss-cubuk ${a.stationId ? renkSinifi(a.stationId) : 'tc-rr1-renk-yok'}${t.kritik ? ' tc-rr1-ss-kritik' : ''}${t.fason ? ' tc-rr1-ss-fason' : ''}${t.sureYok ? ' tc-rr1-ss-yok' : ''}${secili === a.id ? ' tc-rr1-secili' : ''}`}
                    data-bas={yuzde(t.bas)} data-en={yuzde(t.bit - t.bas)} data-hz={!t.fason && g.dk ? String(Math.round((g.hazirlikDk / g.dk) * 100)) : '0'}
                    data-alt={String(t.altSira)} title={`${ad.trim()}: ${ayrinti}${t.kritik ? ' (kritik yol)' : ''}`} aria-label={`${ad.trim()}: ${ayrinti}`}
                    onClick={() => { r.sec({ tur: 'adim', urunId: d.id, adimId: a.id, seq: a.seq, miktar: d.adimlar.find((x) => x.a.id === a.id)?.miktar ?? d.miktar }); }}
                  >
                    {!t.fason && <span className="tc-rr1-ss-hz" />}
                    <span className="tc-rr1-ss-yazi">{op?.abbr ?? op?.code ?? '?'}{t.fason && a.terminGun ? ` ${String(a.terminGun)} gün` : ''}</span>
                  </button>
                );
              })}
            </div>,
          ];
        })}
      </div>
    </section>
  );
}
