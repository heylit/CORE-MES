import { useEffect, useState, type ReactNode } from 'react';
import { Dugme, Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import type { OkunanPlan } from '../motor/kurallar.ts';
import { Hamleler, type HamleOzellikleri } from './Hamleler.tsx';
import { DURDURMA_BEKLIYOR, durumYazisi as emirDurumYazisi, eksikNedeni, engelleyenAdim, sureYaz, type EmirDurumu, type KokpitModeli } from './kurallar.ts';
import type { SiraKarti } from './yerlestirme.ts';
import { kartSonucu, listeSirasi } from './yol.ts';

// Liste ortada düzeni (3414 b): tek sipariş tablosu. Satırda siparişin durumu ve tek düğme durur; satır açılınca o siparişin sonucu
// (bitiş, termin, geçse neden), adımları ve tezgâhlardaki yeri görünür. Bütün tezgâhlar istenince açılır.
const TON: Record<EmirDurumu, RozetTonu> = { gec: 'hata', risk: 'uyari', plansiz: 'uyari', iyi: 'tamam' };
const DUGME: Record<EmirDurumu, string> = { plansiz: 'Planla', gec: 'Düzelt', risk: 'Düzelt', iyi: 'Aç' };

export interface ListeDuzeniOzellikleri {
  m: KokpitModeli; p: OkunanPlan | null;
  kartlar: readonly SiraKarti[];
  // Açık satırın kartı; null ise hiçbiri.
  acik: string | null; ac: (kok: string | null) => void;
  zaman: (t: number) => string;
  mesgul: boolean;
  // Yazamayan kişide null: satır açılır, plan değiştiren düğmeler çıkmaz.
  planla: ((k: SiraKarti) => void) | null;
  yenidenPlanla: ((k: SiraKarti) => void) | null;
  hamle: HamleOzellikleri['uygula']; surum: number | null;
  malzemeBekleyen?: Readonly<Record<string, number>>;
  // Açık siparişin tezgâhlardaki yeri (tahta ve telefondaki listesi); sayfa çizer, işleri vurgular.
  tahta: ReactNode;
  // Sayfada tek birincil düğme olur (2155-9 a): Canlıya al birincilken açık satırın düğmesi ikincil çizilir.
  satirBirincil: boolean;
  // Planda yeri olan adıma basınca iş seçilir ve tezgâhlarda görünür; seçili adıma yeniden basmak bırakır.
  adimSec: (emirId: string, isId: string) => void; seciliIs: string | null;
}

// Açık satırın kendi birincil düğmesi var mı: plansızda Planla, geç ya da riskli siparişte Seçenekleri göster.
export const satirBirincilIster = (k: SiraKarti | undefined): boolean => k !== undefined && k.durum !== 'iyi';

// Çok emirli satırda emir ve parti ayrı sayılır: partinin numarası "<emir no>/<n>" biçimindedir.
const emirSayisi = (k: SiraKarti): string => {
  const parti = k.emirler.filter((e) => /\/\d+$/.test(e.no)).length, emir = k.emirler.length - parti;
  return [emir > 0 ? `${String(emir)} emir` : '', parti > 0 ? `${String(parti)} parti` : ''].filter(Boolean).join(', ');
};

const durumYazisi = (k: SiraKarti): string => {
  if (k.durum === 'plansiz') return k.yerlesen > 0 ? `${String(k.yerlesen)} / ${String(k.adim)} planda` : 'Plansız';
  if (k.durum === 'risk') return 'Riskli';
  if (k.durum === 'iyi') return 'Zamanında';
  const g = Math.max(0, ...k.emirler.map((e) => e.gecikme ?? 0));
  return `${sureYaz(g)} geç`;
};

export function ListeDuzeni({ m, p, kartlar, acik, ac, zaman, mesgul, planla, yenidenPlanla, hamle, surum, malzemeBekleyen, tahta, satirBirincil, adimSec, seciliIs }: ListeDuzeniOzellikleri) {
  const [secenekAcik, setSecenekAcik] = useState(false);
  useEffect(() => { setSecenekAcik(false); }, [acik]);
  // Basılan Planla düğmesi iş sürerken döner; iş bitince (mesgul düşünce) bırakılır.
  const [basilan, setBasilan] = useState<string | null>(null);
  useEffect(() => { if (!mesgul) setBasilan(null); }, [mesgul]);
  const sirali = listeSirasi(kartlar);
  if (sirali.length === 0) return <p className="tc-pyq-not">Bu süzgeçle eşleşen sipariş ya da emir yok.</p>;
  const kod = (id: string): string => m.tezgahlar.find((t) => t.id === id)?.kod ?? id;
  return (
    <div className="tc-pyq-ld" role="table" aria-label="Siparişler">
      <div className="tc-pyq-ld-bas" role="row">
        {['Sipariş', 'Ürün', 'Termin', 'Bitiş', 'Durum', ''].map((x) => <span key={x} role="columnheader">{x}</span>)}
      </div>
      {sirali.map((k) => {
        const bas = k.emirler[0], ad = k.siparis?.no ?? bas?.no ?? k.kok, secili = acik === k.kok;
        const bitisler = k.emirler.flatMap((e) => (e.bitis === null ? [] : [e.bitis]));
        const bitis = k.durum === 'plansiz' || bitisler.length === 0 ? null : Math.max(...bitisler);
        const sonuc = secili && k.durum !== 'plansiz' ? kartSonucu(m, p, k, zaman, malzemeBekleyen) : null;
        const bekleyen = k.emirler.filter((e) => e.durum === 'plansiz').length;
        // Kısmen planlı sipariş: tezgâh adımlarından planda yeri olmayanlar.
        const eksik = k.adim - k.yerlesen;
        return (
          <div className="tc-pyq-ld-kart" key={k.kok} data-d={k.durum} data-acik={secili ? '' : undefined}>
            <div className="tc-pyq-ld-satir" role="row" data-kart={k.kok}>
              <b role="cell" className="tc-pyq-mono">{ad}</b>
              <span role="cell">{bas?.urun ?? ''}{k.emirler.length > 1 ? ` · ${emirSayisi(k)}` : bas ? ` · ${String(bas.adet)} adet` : ''}</span>
              <span role="cell" data-ad="Termin">{k.termin === null ? 'yok' : zaman(k.termin)}</span>
              <span role="cell" data-ad="Bitiş">{bitis === null ? '—' : zaman(bitis)}</span>
              <span role="cell"><Rozet ton={TON[k.durum]} gorunum="cizgi">{durumYazisi(k)}</Rozet></span>
              <span role="cell">
                <Dugme aria-expanded={secili} onClick={() => { ac(secili ? null : k.kok); }}>{secili ? 'Kapat' : DUGME[k.durum]}</Dugme>
              </span>
            </div>
            {secili && (
              <div className="tc-pyq-ld-ayrinti">
                <div className="tc-pyq-ld-panel">
                  {k.durum === 'plansiz' ? (
                    <div className="tc-pyq-yol-govde" data-tur="risk">
                      {eksik > 0 && k.yerlesen > 0
                        ? <p role="status" data-kismi=""><b>{String(eksik)} adımın planda yeri yok; {String(k.yerlesen)} adım planda.</b><small>Planla eksik adımlara yer bulur; bu siparişin planda olan adımları da yeniden dizilebilir, öteki siparişler yerinde kalır. Geri al ile alınır.</small></p>
                        : <p role="status"><b>{bekleyen > 1 ? `${String(bekleyen)} emrin planda yeri yok.` : 'Planda yeri yok.'}</b><small>Sistem tezgâhları ve saatleri seçer; sonucu burada görürsünüz. Canlıya almadan atölye görmez; Geri al ile alınır.</small></p>}
                      {planla && <Dugme tur={satirBirincil ? 'birincil' : 'ikincil'} simge="play" disabled={mesgul} yukleniyor={mesgul && basilan === k.kok} onClick={() => { setBasilan(k.kok); planla(k); }}>{mesgul && basilan === k.kok ? 'Planlanıyor' : 'Planla'}</Dugme>}
                    </div>
                  ) : sonuc && (
                    <div className="tc-pyq-yol-govde" data-tur={sonuc.tur}>
                      <p role="status"><b>{sonuc.baslik}</b>{sonuc.neden !== null && <small>Neden: {sonuc.neden}</small>}</p>
                      {sonuc.emir && hamle && !secenekAcik && <Dugme tur={satirBirincil ? 'birincil' : 'ikincil'} simge="route" onClick={() => { setSecenekAcik(true); }}>Seçenekleri göster</Dugme>}
                      {yenidenPlanla && <Dugme simge="play" disabled={mesgul} title="Sistem bu siparişin işlerini yeniden dizer; başlamış ve kilitli iş yerinde kalır" yukleniyor={mesgul && basilan === k.kok} onClick={() => { setBasilan(k.kok); yenidenPlanla(k); }}>{mesgul && basilan === k.kok ? 'Planlanıyor' : 'Planla'}</Dugme>}
                      {sonuc.emir && secenekAcik && (
                        <div className="tc-pyq-yol-secenek" role="group" aria-label="Düzeltme seçenekleri">
                          <small>Her seçeneğin sonucu basmadan önce yazılıdır</small>
                          <Hamleler m={m} e={sonuc.emir} isId={null} zaman={zaman} uygula={hamle} surum={surum} bekle={mesgul} />
                        </div>
                      )}
                    </div>
                  )}
                  {k.emirler.map((e) => {
                    // Çok emirli siparişte her emir (ana emir ve partileri) kendi başlığıyla ayrı öbektir; adım satırı emir no taşımaz.
                    const ayri = k.emirler.length > 1;
                    const adimlar = (
                      <ol className="tc-pyq-ld-adimlar" aria-label={ayri ? `${e.no} adımları` : 'Adımlar'}>
                        {e.adimlar.map((a, i) => {
                          const x = m.isler[a.id];
                          // Yerleşmeyen adımı tutan adım planda varsa (ör. ufka taşan önceki adım) basınca o gösterilir.
                          const engel = x ? null : engelleyenAdim(p, m.isler, a.id);
                          const hedef = x ? a.id : engel;
                          const govde = (
                            <>
                              <span>{String(i + 1)}. {a.ad}</span>
                              <small data-yeri-yok={x ? undefined : a.id}>{x ? `${x.fason ? 'Fason' : kod(x.m)} · ${zaman(x.S)} → ${zaman(x.C).slice(6)}${x.ufukDisi ? ` · ufuk sonrasında ${sureYaz(x.ufukDisi)} çalışma` : ''}` : `yeri yok: ${eksikNedeni(p, a.id)}`}</small>
                              {x?.durdurmaBekliyor && <small data-durdurma-bekliyor={a.id}>{DURDURMA_BEKLIYOR}; canlıda eski yerinde</small>}
                            </>
                          );
                          const hedefIs = hedef === null ? undefined : m.isler[hedef];
                          return (
                            <li key={a.id} data-yok={x ? undefined : ''}>
                              {hedef !== null && hedefIs
                                ? <button type="button" data-adim={a.id} data-engel={engel ?? undefined} aria-pressed={x ? seciliIs === a.id : undefined} title={x ? 'Tezgâhlarda göster' : 'Bu adımı tutan önceki adımı tezgâhlarda göster'} onClick={() => { adimSec(hedefIs.job, hedef); }}>{govde}</button>
                                : govde}
                            </li>
                          );
                        })}
                      </ol>
                    );
                    if (!ayri) return <div key={e.id}>{adimlar}</div>;
                    return (
                      <section key={e.id} className="tc-pyq-ld-emir" aria-label={e.no} data-emir={e.id}>
                        <p className="tc-pyq-ld-emir-bas">
                          <b className="tc-pyq-mono">{e.no}</b>
                          <small>{String(e.adet)} adet · {emirDurumYazisi(e)}</small>
                        </p>
                        {adimlar}
                      </section>
                    );
                  })}
                </div>
                <div className="tc-pyq-ld-tahta">{tahta}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
