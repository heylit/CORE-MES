import { Simge } from '../../../../ortak/arayuz/index.ts';
import { durumYazisi, sureYaz, type KokpitEmri, type KokpitIsi, type KokpitModeli } from './kurallar.ts';
import { ilerlemeOzeti, komsuOzeti, tezgahSecenekleri, type AdimSayimi, type TasimaTahmini } from './pano.ts';

// 3663: adım bilgi panosu. Seçili adımda çubuğun yanında (kip "secili"), telefonda alt sayfa (kip "sayfa"), sürüklerken sabit köşede (kip "surukle", fareyi tutmaz). Pano yalnız
// bilgidir: tıklanır düğmesi yoktur (taşıma sürükleme, sağ tık ve ayrıntıdaki yollarla yapılır). Sunucu cevabı gelene kadar sürükleme
// rakamları istemci tahminidir ve "tahmin" etiketi taşır.
export interface AdimPanosuOzellikleri {
  kip: 'secili' | 'surukle' | 'sayfa';
  m: KokpitModeli; e: KokpitEmri; x: KokpitIsi;
  zaman: (t: number) => string;
  sayim?: AdimSayimi | undefined;
  // Yalnız sürüklerken: hedef tezgâh, tahmin, sunucu cevabı (etki cümlesi sunucudansa dogrulandi true) ve geçersizlik nedeni.
  hedef?: { tezgah: string; S: number; tahmin: TasimaTahmini; etki: string; dogrulandi: boolean; neden: string | null };
  kapat?: () => void;
  // Konum: seçili kipte Tahta çubuğa göre yerleştirir.
  yerlestir?: (el: HTMLElement | null) => void;
}

const saatYaz = (zaman: (t: number) => string, t: number): string => zaman(t).slice(-5);

export function AdimPanosu({ kip, m, e, x, zaman, sayim, hedef, kapat, yerlestir }: AdimPanosuOzellikleri) {
  const surukle = kip === 'surukle' && hedef !== undefined;
  const kod = (id: string): string => m.tezgahlar.find((t) => t.id === id)?.kod ?? id;
  const il = ilerlemeOzeti(x, e.adet, sayim, m.simdi), komsu = komsuOzeti(m, e, x.id);
  const secenek = tezgahSecenekleri(m, e, x);
  const ihlal = surukle ? hedef.neden ?? hedef.tahmin.ihlal : null;
  const adi = e.adimlar.find((a) => a.id === x.id)?.ad ?? x.ad;
  const fark = surukle ? hedef.S - x.S : 0;
  return (
    <aside
      className="tc-pyq-pano" data-kip={kip} data-ihlal={ihlal !== null ? '' : undefined} aria-label={`${adi} bilgisi`} ref={yerlestir}
      {...(surukle ? { 'aria-hidden': true } : {})}
    >
      <header>
        <div><b>{adi}</b><small>{e.no} · {e.adet} adet</small></div>
        <span className="tc-pyq-pano-durum" data-d={ihlal !== null ? 'gec' : surukle ? 'iyi' : undefined}>{ihlal !== null ? 'Bırakılamaz' : surukle ? 'Taşınıyor' : 'Seçili'}</span>
        {!surukle && kapat && <button type="button" className="tc-pyq-simge-dugme" aria-label="Adım bilgisini kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>}
      </header>
      <dl>
        <div data-pano="zaman">
          <dt>Zaman</dt>
          <dd>
            {surukle
              ? <>{zaman(hedef.tahmin.yeniS)} – {saatYaz(zaman, hedef.tahmin.yeniC)} <small>({Math.abs(fark) < 0.01 ? 'aynı saat' : `${sureYaz(fark)} ${fark < 0 ? 'erken' : 'geç'}`})</small></>
              : <>{zaman(x.S)} – {saatYaz(zaman, x.C)} <small>({sureYaz(x.C - x.S)} · {kod(x.m)})</small></>}
          </dd>
        </div>
        <div data-pano="etki">
          <dt>Etki</dt>
          <dd>
            {surukle ? (
              <>
                {ihlal !== null ? <span data-pano-ihlal="">{ihlal}</span> : hedef.etki !== '' ? <span>{hedef.etki}</span> : <span>Başka işe ya da sonraki adıma etkisi yok</span>}
                {' '}<small className="tc-pyq-pano-etiket" data-dogrulandi={hedef.dogrulandi ? '' : undefined}>{hedef.dogrulandi ? 'sunucu doğruladı' : 'tahmin'}</small>
              </>
            ) : (
              <>
                {komsu.once ? <>Önce <b>{komsu.once.ad}</b> {saatYaz(zaman, komsu.once.bitis)}'de biter</> : 'İlk adım'}
                {komsu.sonra ? <> · sonra <b>{komsu.sonra.ad}</b> {saatYaz(zaman, komsu.sonra.baslangic)}'de başlar</> : ' · son adım'}
                {komsu.pay !== null && <small data-pano="termin" data-d={e.durum}>{komsu.pay < -0.01 ? `Termin ${sureYaz(-komsu.pay)} aşılıyor` : `Termin payı ${sureYaz(komsu.pay)}`} · {durumYazisi(e)}</small>}
              </>
            )}
          </dd>
        </div>
        <div data-pano="ilerleme">
          <dt>İlerleme</dt>
          <dd>
            {il.oran !== null && <span className="tc-pyq-pano-cubuk" role="img" aria-label={`İlerleme %${String(Math.round(il.oran * 100))}`}><i ref={(el) => { el?.style.setProperty('--oran', String(il.oran)); }} />{il.planOran !== null && <u ref={(el) => { el?.style.setProperty('--plan', String(il.planOran)); }} />}</span>}
            <span>{il.yazi}</span>
            {il.plan !== null && <small data-pano="plan">{il.plan}</small>}
          </dd>
        </div>
        <div data-pano="tezgah">
          <dt>{surukle ? 'Tezgâh (bilgi)' : 'Tezgâh'}</dt>
          <dd>
            {surukle
              ? <span>{kod(hedef.tezgah)}{hedef.tezgah === x.m ? ' (aynı tezgâh)' : ' (hedef)'}</span>
              : secenek.neden !== null ? <span>{secenek.neden}</span>
                : secenek.secenekler.length === 0 ? <span>{x.basladi ? 'Süren adım taşınırsa durdurulmuş sayılır' : 'Bugünkü yerinden erken başka yer yok'}</span>
                  : <ul>{secenek.secenekler.map((s) => <li key={s.tezgah} data-pano-tezgah={s.tezgah}>{kod(s.tezgah)} <small>{zaman(s.baslangic)} · {sureYaz(s.kazanc)} erken</small></li>)}</ul>}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
