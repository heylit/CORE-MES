import { useMemo, useState } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { saatYazi, saatYaz, type Derleme, type OkunanPlan } from '../kurallar.ts';
import { HAZIRLANIYOR, MOTOR_NOTU, degisken, yuzde } from '../ortak.tsx';
import { siparisRengi } from '../harita/kurallar.ts';
import { useIpucu } from './Ipucu.tsx';
import { gunAcilimlari, gunCizelgesi, isIpucu, tezgahAdi } from './kurallar.ts';

// Saatlik gün (s-gun sGunYuzey ve gyYan, w-v20 kilit şeridi): tezgâh satırları ve saatler; kapalı saat, arıza, şimdi ve dondurma bölgesi.
// İş seçilince yapabilen tezgâhlar yanar, sağda işin ayrıntısı açılır. Taşıma, saat kapatma, çoklu kaydırma ve formlar motorla gelir (357 b).
const SAATLER = Array.from({ length: 12 }, (_, i) => i * 2);

interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; g: number; planYaz: boolean; planKilitle: boolean;
  secili: string | null; secJob: string | null; isSec: (id: string) => void; tezSec: (m: string) => void; gunSec: (g: number) => void;
}

export function GunCizelgesi(o: Ozellikler) {
  const { c, p, cx, g } = o; const D = c.D;
  const [istisna, setIstisna] = useState(false);
  const [vurgu, setVurgu] = useState(false);
  const v = useMemo(() => gunCizelgesi(c, p, cx, g, o.secili, o.secJob), [c, p, cx, g, o.secili, o.secJob]);
  const sec = o.secili ? p.ops[o.secili] ?? null : null; const secO = sec ? cx.byId[sec.id] : undefined;
  const gunAd = saatYaz(D, v.a).slice(0, 9); const oz = p.ozet; const dondu = v.gunler[g]?.dondu ?? false;
  const ip = useIpucu();
  // İş bloğu ipucu (v-yardim isIpucu): iş, tezgâh ve saat, neden burada, sabitlik ve siparişin durumu.
  const icerik = (id: string) => {
    const x = isIpucu(c, p, cx, id); if (!x) return null;
    return (
      <span className="tc-pym-ip-is">
        <b>{x.baslik}</b><span className="tc-pym-mono">{x.satir}</span>
        <span><b>Neden burada:</b> {x.neden}</span>{x.kilit && <span>{x.kilit}</span>}
        <span data-ton={x.durum.ton}>{x.durum.metin}</span>
      </span>
    );
  };
  const pasif = (simge: SimgeAdi, ad: string, not = MOTOR_NOTU) => (
    <button type="button" className="tc-dugme tc-pym-kucuk" aria-disabled="true" aria-pressed="false" title={`${ad}: ${not}`}><Simge ad={simge} boyut="k" /><span>{ad}</span></button>
  );
  return (
    <section className="tc-pym-gy" aria-label={`Gün katmanı: ${gunAd}`} data-istisna={istisna ? '' : undefined} data-kilit={vurgu ? '' : undefined}>
      <header className="tc-pym-gy-ust">
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-simge-d" title="Önceki gün" aria-label="Önceki gün" onClick={() => o.gunSec(Math.max(0, g - 1))}><Simge ad="chev-left" boyut="k" /></button>
        <b className="tc-pym-mono">{gunAd}</b>
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-simge-d" title="Sonraki gün" aria-label="Sonraki gün" onClick={() => o.gunSec(g + 1)}><Simge ad="chev-right" boyut="k" /></button>
        <div className="tc-pym-seg tc-pym-gy-gunler" role="group" aria-label="Günler">
          {v.gunler.map((x) => <button key={x.g} type="button" aria-pressed={x.g === g} data-dondu={x.dondu ? '' : undefined} onClick={() => o.gunSec(x.g)}>{x.ad}</button>)}
        </div>
        <span className="tc-pym-ara" />
        {o.planYaz && <>{pasif('check', 'Çoklu seç')}{pasif('wrench', 'Saat kapat')}</>}
        <button type="button" className="tc-dugme tc-pym-kucuk" aria-pressed={istisna} title="Yalnız istisna" onClick={() => setIstisna((x) => !x)}><Simge ad="alert" boyut="k" /><span>Yalnız istisna</span></button>
        {o.planKilitle && pasif('lock', dondu ? 'Dondurmayı kaldır' : 'Günü dondur', HAZIRLANIYOR)}
        <span className="tc-pym-gy-oz tc-pym-mono" data-ton={oz.late ? 'hata' : undefined}>gecikme {saatYazi(oz.wT)} · geciken {oz.late}</span>
      </header>
      <div className="tc-pym-gy-kilit" role="status">
        <Simge ad="lock" boyut="k" />
        <span className="tc-pym-gy-kilit-m" title={`Bu gün donuk ${v.kilit.donukBu} iş, toplam donuk ${v.kilit.donukTum} iş, elle sabit ${v.kilit.elle} iş${v.kilit.cit != null ? `, dondurma bölgesi ${saatYaz(D, v.kilit.cit)}'e kadar` : ''}`}>
          Donuk <b className="tc-pym-mono">{v.kilit.donukBu}/{v.kilit.donukTum}</b> · Sabit <b className="tc-pym-mono">{v.kilit.elle}</b>
          {v.kilit.cit != null && <> · Dondurma <b className="tc-pym-mono">{saatYaz(D, v.kilit.cit)}</b>'e kadar</>}
        </span>
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-pressed={vurgu} title="Kilitlileri vurgula" aria-label="Kilitlileri vurgula" onClick={() => setVurgu((x) => !x)}><Simge ad="eye" boyut="k" /></button>
      </div>
      <div className="tc-pym-gy-govde">
        <div className="tc-pym-gy-tablo">
          <div className="tc-pym-gy-saat" aria-hidden="true">
            <span className="tc-pym-gy-ad" />
            <div>{SAATLER.map((s) => <span key={s} ref={degisken({ '--x': yuzde(s / 24) })}>{String(s).padStart(2, '0')}</span>)}</div>
          </div>
          <div className="tc-pym-gy-satirlar">
            {(v.simdi != null || v.cit != null || v.citBant) && (
              <div className="tc-pym-gy-simdi-kat" aria-hidden="true">
                <span />
                <div>
                  {v.citBant && <i className="tc-pym-gy-cit-bant" ref={degisken({ '--x': yuzde(v.citBant.x), '--w': yuzde(v.citBant.w) })} />}
                  {v.simdi != null && <i className="tc-pym-gy-simdi" ref={degisken({ '--x': yuzde(v.simdi) })} />}
                  {v.cit != null && <i className="tc-pym-gy-cit" title={`Dondurma bölgesi sonu: ${v.kilit.cit != null ? saatYaz(D, v.kilit.cit) : ''}`} ref={degisken({ '--x': yuzde(v.cit) })}><span>dondurma sonu</span></i>}
                </div>
              </div>
            )}
            {v.satirlar.map((s) => (
              <div key={s.m} className="tc-pym-gy-satir" data-uygun={s.uygun === true ? '' : undefined} data-uygunsuz={s.uygun === false ? '' : undefined}>
                <button type="button" className="tc-pym-gy-ad" title={`${s.ad}: tezgâh ayrıntısı`} onClick={() => o.tezSec(s.m)}>
                  <b className="tc-pym-mono">{s.etiket}</b><small className="tc-pym-mono" data-isi={s.isi}>{s.oran == null ? 'kapalı' : `%${Math.round(s.oran * 100)}`}</small>
                </button>
                <div className="tc-pym-gy-cizgi">
                  {s.kapali.map((k) => <i key={k.x} className="tc-pym-gy-kapali" ref={degisken({ '--x': yuzde(k.x), '--w': yuzde(k.w) })} />)}
                  {s.ariza.map((k) => <i key={k.x} className="tc-pym-gy-ariza" title="Arıza ya da bakım" ref={degisken({ '--x': yuzde(k.x), '--w': yuzde(k.w) })} />)}
                  {s.erken && <i className="tc-pym-gy-erken" title={`${s.erken.ad}: ${saatYaz(D, s.erken.t)}`} ref={degisken({ '--x': '0%', '--w': yuzde(s.erken.w) })} />}
                  {s.erken?.cizgi != null && <i className="tc-pym-gy-cizgi-im" ref={degisken({ '--x': yuzde(s.erken.cizgi) })}><span>{s.erken.ad}</span></i>}
                  {s.bloklar.map((b) => (
                    <button key={b.id} type="button" className="tc-pym-gy-blok" title={b.baslik} onClick={() => o.isSec(b.id)}
                      onPointerEnter={(e) => { if (e.pointerType === 'mouse') ip.ac(e.currentTarget, icerik(b.id), 250); }} onPointerLeave={ip.kapat}
                      onFocus={(e) => ip.ac(e.currentTarget, icerik(b.id))} onBlur={ip.kapat}
                      data-sol={b.sol ? '' : undefined} data-sag={b.sag ? '' : undefined} data-secili={b.secili ? '' : undefined}
                      data-soluk={b.soluk ? '' : undefined} data-gec={b.gec ? '' : undefined} data-risk={!b.gec && b.risk ? '' : undefined}
                      data-dondu={b.dondu ? '' : undefined} data-kilit={b.sabit ? (b.dondu ? 'gun' : 'elle') : undefined}
                      ref={degisken({ '--x': yuzde(b.x), '--w': yuzde(b.w), '--c': b.renk })}>
                      {b.sabit && <Simge ad="lock" boyut="k" />}<b className="tc-pym-mono">{b.job}</b><small>{b.ad}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <aside className="tc-pym-gy-yan">
          {sec ? (
            <div className="tc-pym-gy-sec">
              <h4><span className="tc-pym-mono" ref={degisken({ '--c': `var(--tc-pym-is-${siparisRengi(D, sec.job)})` })}>{sec.id}</span></h4>
              <p className="tc-pym-kucuk-yazi">{secO?.ad ?? ''} · {tezgahAdi(D, sec.m)}<br />{saatYaz(D, sec.S)} → {saatYaz(D, sec.C)} · {saatYazi(sec.C - sec.S)}</p>
              {v.erken && <p className="tc-pym-gy-erken-not"><Simge ad="clock" boyut="k" /><span>En erken <b className="tc-pym-mono">{saatYaz(D, v.erken.t)}</b>: {v.erken.ad.toLocaleLowerCase('tr-TR')}.</span></p>}
              {o.planYaz && (
                <>
                  <p className="tc-pym-kucuk-yazi"><Simge ad="target" boyut="k" /> Yanan satırda saate tıklayın, işi oraya sürükleyin ya da ok tuşlarıyla kaydırın (←/→ bir saat, Shift ile çeyrek saat, ↑/↓ başka tezgâh).{secO && secO.c.filter((m) => m !== sec.m && !m.startsWith('@')).length ? '' : ' Bu adımı yalnız bu tezgâh yapabiliyor.'}</p>
                  <div className="tc-pym-dugmeler">
                    {o.planKilitle && pasif('lock', c.locks[sec.id] ? 'Sabitliği kaldır' : 'Burada sabitle', HAZIRLANIYOR)}
                    {pasif('list', 'Siparişin yolu', HAZIRLANIYOR)}
                    <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Seçimi bırak" aria-label="Seçimi bırak" onClick={() => o.isSec(sec.id)}><Simge ad="x" boyut="k" /></button>
                  </div>
                  {gunAcilimlari(c, cx, sec).map(([sm, ad, acik]) => (
                    <details key={ad} className="tc-pym-gy-ac" open={acik || undefined}><summary><Simge ad={sm} boyut="k" /> {ad}</summary><p className="tc-pym-kucuk-yazi">{MOTOR_NOTU}</p></details>
                  ))}
                </>
              )}
            </div>
          ) : (
            <div className="tc-pym-gy-sec"><p className="tc-pym-kucuk-yazi">Bir iş seçin: yapabilen tezgâhlar yanar, saatine tıklayınca oraya taşınır ve sabitlenir. Shift ile birden çok iş seçip birlikte kaydırabilirsiniz. Soldaki havuzdan sipariş sürükleyip bir satıra bırakmak onu plana alır. Tezgâh adına basınca ayrıntısı sağda açılır.</p></div>
          )}
          <p className="tc-pym-kucuk-yazi tc-pym-gy-lejant"><i className="tc-pym-gy-l-kapali" />kapalı <i className="tc-pym-gy-l-ariza" />arıza <i className="tc-pym-gy-l-gec" />geciken <Simge ad="lock" boyut="k" />sabit</p>
        </aside>
      </div>
      {ip.kutu}
    </section>
  );
}
