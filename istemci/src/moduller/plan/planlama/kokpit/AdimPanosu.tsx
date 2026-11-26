import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { bolunemezNedeni } from './ElleBol.tsx';
import { adimKimligi, adimPaylari, durumYazisi, payIlerlemeYazisi, payNedeni, payYazisi, sureYaz, type KokpitEmri, type KokpitIsi, type KokpitModeli } from './kurallar.ts';
import { ilerlemeOzeti, komsuOzeti, tezgahSecenekleri, type AdimSayimi, type TasimaTahmini } from './pano.ts';

// 3663: adım bilgi panosu. Seçili adımda çubuğun yanında (kip "secili"), telefonda alt sayfa (kip "sayfa"), sürüklerken sabit köşede (kip "surukle", fareyi tutmaz). Pano yalnız
// bilgidir: tıklanır düğmesi yoktur, yalnız bölünmüş adımda "Bölmeyi yönet" (3681) vardır (taşıma sürükleme, sağ tık ve ayrıntıdaki yollarla yapılır). Sunucu cevabı gelene kadar sürükleme
// rakamları istemci tahminidir ve "tahmin" etiketi taşır.
export interface AdimPanosuOzellikleri {
  kip: 'secili' | 'surukle' | 'sayfa';
  m: KokpitModeli; e: KokpitEmri; x: KokpitIsi;
  zaman: (t: number) => string;
  sayim?: AdimSayimi | undefined;
  // Yalnız sürüklerken: hedef tezgâh, tahmin, sunucu cevabı (etki cümlesi sunucudansa dogrulandi true) ve geçersizlik nedeni.
  hedef?: { tezgah: string; S: number; tahmin: TasimaTahmini; etki: string; dogrulandi: boolean; neden: string | null };
  kapat?: () => void;
  // 3681: bölünmüş adımın payları bölme penceresinden yönetilir; yetkili kişide (bol verilmişse) pano o pencereyi açan düğmeyi taşır (dokunmatikte sağ tık yoktur).
  bolAc?: ((adimId: string) => void) | null;
  // 3751: telefonda (sağ tık ve sürükleme yok) pay kartından birleştirme alt sayfası açılır; verilmezse düğme yok.
  birlestirAc?: ((payId: string) => void) | null;
  // Konum: seçili kipte Tahta çubuğa göre yerleştirir.
  yerlestir?: (el: HTMLElement | null) => void;
}

const saatYaz = (zaman: (t: number) => string, t: number): string => zaman(t).slice(-5);

// 3681: pano kısa kalsın (1280x800'de çubuğun üstüne binmesin); kalan paylar bölme penceresinde.
const PANO_PAY = 2;

export function AdimPanosu({ kip, m, e, x, zaman, sayim, hedef, kapat, yerlestir, bolAc = null, birlestirAc = null }: AdimPanosuOzellikleri) {
  // 3681: telefon alt sayfasına pay kimliği (S2.a1~2) gelir; paylar ve bölme kaydı adımın kimliğiyle okunur.
  const adimId = adimKimligi(x);
  const surukle = kip === 'surukle' && hedef !== undefined;
  const kod = (id: string): string => m.tezgahlar.find((t) => t.id === id)?.kod ?? id;
  // 3681: adımın sayımı durum okumasında yoksa ama paylar sayım taşıyorsa ilerleme pay sayılanlarının toplamından gelir ("sayım yok" ile "sayılan 5" aynı panoda çelişmesin).
  const payToplam = adimPaylari(m, adimId).reduce<number | null>((t, y) => (y.pay?.sayilan === undefined && y.sayilan === undefined ? t : (t ?? 0) + (y.pay?.sayilan ?? y.sayilan ?? 0)), null);
  const il = ilerlemeOzeti(x, e.adet, sayim ?? (payToplam !== null ? { say: payToplam, bitti: false } : undefined), m.simdi), komsu = komsuOzeti(m, e, x.id);
  const secenek = tezgahSecenekleri(m, e, x);
  const ihlal = surukle ? hedef.neden ?? hedef.tahmin.ihlal : null;
  const adi = e.adimlar.find((a) => a.id === x.id)?.ad ?? x.ad;
  const fark = surukle ? hedef.S - x.S : 0;
  // 3681: bölünmüş adımın payları (kaynak, adet, sayılan, süre) ve bölmenin nedeni; bölünemeyen adımda nedeni.
  const paylar = adimPaylari(m, adimId), bolme = paylar.length > 1;
  const bolmeNedeni = bolme ? null : m.bolme?.[adimId]?.metin ?? (x.bitti === true || x.fason ? bolunemezNedeni(x, e.adet) : null);
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
        {!surukle && bolme && (
          <div data-pano="paylar">
            <dt>Paylar</dt>
            <dd>
              <small data-pay-neden="">{payNedeni(x) ?? ''}</small>
              <ul>
                {paylar.slice(0, PANO_PAY).map((y) => (
                  <li key={y.id} data-pay-satiri={y.id}>
                    <b>{payYazisi(y) ?? ''}</b> {kod(y.m)}{payIlerlemeYazisi(y) ? ` · sayılan ${payIlerlemeYazisi(y) ?? ''}` : ''} <small>{sureYaz(y.C - y.S)}</small>
                  </li>
                ))}
                {paylar.length > PANO_PAY && <li data-pay-daha=""><small>+{paylar.length - PANO_PAY} pay · Bölmeyi yönet'te</small></li>}
              </ul>
              {m.bolme?.[x.id] && <small data-pay-uygulanamadi="">Kayıtlı bölme uygulanamadı: {m.bolme[x.id]!.metin}</small>}
            </dd>
          </div>
        )}
        {!surukle && bolmeNedeni !== null && (
          <div data-pano="bolme">
            <dt>Bölme</dt>
            <dd data-bolme-neden="">{m.bolme?.[x.id] ? `Kayıtlı bölme uygulanamadı: ${bolmeNedeni}` : bolmeNedeni}</dd>
          </div>
        )}
      </dl>
      {!surukle && bolme && birlestirAc ? (
        <div className="tc-pyq-pano-dugmeler">
          <Dugme tur="ikincil" simge="fit" data-birlestir-ac={x.id} onClick={() => { birlestirAc(x.id); }}>Birleştir</Dugme>
          {bolAc && <Dugme tur="ikincil" simge="layers" data-bol-yonet={x.id} onClick={() => { bolAc(adimKimligi(x)); }}>Bölmeyi yönet</Dugme>}
        </div>
      ) : !surukle && bolme && bolAc && <Dugme tur="ikincil" simge="layers" data-bol-yonet={x.id} onClick={() => { bolAc(adimKimligi(x)); }}>Bölmeyi yönet</Dugme>}
    </aside>
  );
}
