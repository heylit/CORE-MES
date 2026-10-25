import { Fragment } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import { Dg } from '../cizelge/Dugme.tsx';
import { durusOku } from '../harita/kurallar.ts';
import { saatYaz } from '../kurallar.ts';
import { MOTOR_NOTU, VERI_NOTU, YOK_NOTU } from '../ortak.tsx';
import { isoYerel, rotaAdimlari, tezgahYazi } from './kurallar.ts';
import type { Ozellikler } from './SecimPaneli.tsx';

// Rota sekmesi (za-merkez mzRota): siparişin adımları rota sırasıyla, her adımda yapabilen tezgâhlar. Adımı başka tezgâha taşımak motorla
// gelir (357 b); rota verisi Rotalar sayfasında değişir, o sayfa yeni ekranda yok.
export function RotaSekmesi({ c, p, cx, j, planYaz: yaz, opSec, sipSec, rotaSec }: Ozellikler & { j: string }) {
  const D = c.D; const sp = D.siparisler.find((x) => x.id === j);
  const urunAd = (u: unknown) => D.urunler.find((x) => x.id === u)?.ad ?? String(u ?? '');
  const ayni = D.siparisler.filter((x) => !x.havuz && x.urun === sp?.urun && x.id !== j);
  // Adımın bitti ve şu an işareti planın şimdisine göredir (zaman imleci önizlemedir).
  const adimlar = cx.jobs[j] ? rotaAdimlari(c, p, cx, j, cx.now) : [];
  const tasi = yaz ? MOTOR_NOTU : 'Plan yazma yetkiniz yok.';
  return (
    <>
      <div className="tc-pym-mz-arac">
        <label className="tc-pym-mz-sirala">
          <span>Sipariş</span>
          <select className="tc-pym-mz-sec" value={cx.jobs[j] ? j : ''} onChange={(e) => { if (e.target.value) rotaSec(e.target.value); }}>
            {!cx.jobs[j] && <option value="">Seçin</option>}
            {D.siparisler.filter((x) => !x.havuz && p.J[x.id]).map((x) => <option key={x.id} value={x.id}>{x.id} · {urunAd(x.urun)}</option>)}
          </select>
        </label>
        <small className="tc-pym-kucuk-yazi">
          {adimlar.length ? 'Koyu çip adımın şu anki tezgâhı. Başka çipe basınca adım oraya taşınır; etkisi şeritte görünür. Rota verisinin kendisi Rotalar sayfasında değişir.'
            : 'Resimde, tabloda ya da kuyrukta bir sipariş seçin; rotası burada adım adım açılır.'}
        </small>
        {adimlar.length > 0 && <Dg ad="Rotalar" simge="edit" hayalet not={YOK_NOTU} />}
      </div>
      {adimlar.length > 0 && (
        <ol className="tc-pym-mz-rota" aria-label={`${j} rotası`}>
          {adimlar.map((a, i) => (
            <Fragment key={a.id}>
              {i > 0 && <li className="tc-pym-mz-ok" aria-hidden="true"><Simge ad="chev-right" boyut="k" /></li>}
              <li className="tc-pym-mz-adim" data-bitti={a.bitti || undefined} data-simdi={(!a.bitti && a.simdi) || undefined}>
                <header>
                  <b className="tc-pym-mono">{i + 1}</b>
                  <button type="button" className="tc-pym-link" onClick={() => opSec(a.id)}>{a.ad}</button>
                  {a.kilitli && <Simge ad="lock" boyut="k" />}
                </header>
                <small className="tc-pym-mono">{a.zaman}</small>
                <ul>
                  {a.cipler.map((x) => (
                    <li key={x.m} data-bu={x.bu || undefined}>
                      {x.bu || a.bitti || a.simdi || !yaz
                        ? <span className="tc-pym-mono">{x.ad}</span>
                        : <button type="button" className="tc-pym-mono" aria-disabled="true" title={`Bu adımı ${x.ad} tezgâhına taşı: ${tasi}`}>{x.ad}</button>}
                      <small className="tc-pym-mono">{x.sure}{x.carpan && <> <b className="tc-pym-mz-carpan" title={`Süre sapması: işleme süresi ${x.carpan} çarpıldı`}>{x.carpan}</b></>}</small>
                    </li>
                  ))}
                </ul>
              </li>
            </Fragment>
          ))}
        </ol>
      )}
      {adimlar.length > 0 && ayni.length > 0 && (
        <p className="tc-pym-kucuk-yazi">Aynı ürün: {ayni.slice(0, 8).map((x, i) => (
          <Fragment key={x.id}>{i > 0 && ', '}<button type="button" className="tc-pym-link tc-pym-mono" onClick={() => sipSec(x.id)}>{x.id}</button></Fragment>
        ))}</p>
      )}
    </>
  );
}

// Takvim sekmesi (zb-merkez2 mzTakvim): tezgâhın vardiyaları, bakım denemesi, kapalı pencereler ve ek mesai. Vardiya ve kapalı pencere
// veri sahibinden girer (222 a, 223 a); bakım denemesi motorla gelir (357 b). Ek mesai çalışmanındır, kaldırmak plan.yaz ile yazar.
export function TakvimSekmesi({ c, cx, t, m, komut, planYaz: yaz }: Ozellikler & { m: string }) {
  const D = c.D; const T = D.tezgahlar.find((x) => x.id === m);
  if (!T) {
    return (
      <section className="tc-pym-mz-blok">
        <h4><Simge ad="clock" boyut="k" />Tezgâh takvimi</h4>
        <p className="tc-pym-kucuk-yazi">Resimde ya da kuyrukta bir tezgâh seçin; vardiyaları ve kapalı pencereleri burada değişir.</p>
      </section>
    );
  }
  const tumu = (D.vardiyalar ?? []).map((v) => ({ id: String(v.id ?? ''), bas: String(v.bas ?? ''), bit: String(v.bit ?? '') }));
  const vr = T.vardiyalar ?? tumu.map((v) => v.id);
  const ar = durusOku(c).filter((d) => d.m === m);
  const em = c.ekMesai.map((x, i) => ({ x, i })).filter((o) => o.x.m === m);
  const t0 = Math.ceil(Math.max(cx.now, t));
  const pasif = yaz ? MOTOR_NOTU : 'Plan yazma yetkiniz yok.';
  const sil = (i: number, ad: string) => (yaz && komut ? () => {
    komut.degistir('Ek mesai kaldırıldı', (x) => { x.ekMesai = x.ekMesai.filter((_, k) => k !== i); }, { ayrinti: ad });
  } : null);
  return (
    <section className="tc-pym-mz-blok">
      <h4><Simge ad="clock" boyut="k" />{m} takvimi</h4>
      <div className="tc-pym-mz-vardiya" role="group" aria-label={`${m} vardiyaları`}>
        {tumu.map((v) => (
          <label key={v.id} className="tc-pym-mz-cip" title={`${v.id}: ${VERI_NOTU}`}>
            <input type="checkbox" checked={vr.includes(v.id)} disabled readOnly />
            <span>{v.id} <small className="tc-pym-mono">{v.bas}–{v.bit}</small></span>
          </label>
        ))}
      </div>
      <form className="tc-pym-mz-form" noValidate onSubmit={(e) => e.preventDefault()}>
        <label className="tc-alan">
          <span className="tc-alan-etiket">Bakım başlar</span>
          <input className="tc-alan-kutu" type="datetime-local" readOnly aria-disabled="true" title={pasif} defaultValue={isoYerel(D, t0)} key={`${m}-${t0}`} />
        </label>
        <label className="tc-alan">
          <span className="tc-alan-etiket">Süre (sa)</span>
          <input className="tc-alan-kutu" type="number" min={1} max={72} step={1} readOnly aria-disabled="true" title={pasif} defaultValue={4} />
        </label>
        <Dg ad="Bakımı dene" simge="wrench" not={pasif} />
      </form>
      <ul className="tc-pym-mz-liste">
        {ar.map((d, i) => (
          <li key={`a${String(i)}`}>
            <span className="tc-pym-mono">{saatYaz(D, d.from)} → {saatYaz(D, d.to).slice(6)}</span><small>kapalı</small>
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-disabled="true" aria-label="Kapalı pencereyi kaldır" title={`Kapalı pencereyi kaldır: ${VERI_NOTU}`}><Simge ad="trash" boyut="k" /></button>
          </li>
        ))}
        {em.map(({ x, i }) => {
          const ad = `${saatYaz(D, Number(x.gun) * 24).slice(0, 9)} ${String(x.vardiya ?? '')}`; const yap = sil(i, `${m} ${String(x.vardiya ?? '')}`);
          return (
            <li key={`e${String(i)}`}>
              <span className="tc-pym-mono">{ad}</span><small>ek mesai</small>
              <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-disabled={yap ? undefined : 'true'} aria-label="Ek mesaiyi kaldır"
                title={yap ? 'Ek mesaiyi kaldır' : 'Ek mesaiyi kaldır: Plan yazma yetkiniz yok.'} onClick={yap ?? undefined}><Simge ad="trash" boyut="k" /></button>
            </li>
          );
        })}
        {!ar.length && !em.length && <li className="tc-pym-kucuk-yazi">Kapalı pencere ya da ek mesai yok.</li>}
      </ul>
      <p className="tc-pym-kucuk-yazi">Bakım denemesi önizlemedir, sepete adım olarak düşer. Vardiya ve kaldırma veriyi değiştirir; plan yeniden kurulunca etkisi görünür.</p>
    </section>
  );
}
