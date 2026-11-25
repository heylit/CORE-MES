import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AlternatifZarfi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import type { KabulSiniri } from '#paylasilan/sozlesme/satin-alma.ts';
import { Girdi, IsaretKutusu, Rozet, Simge } from '../../../ortak/arayuz/index.ts';
import { BELIRSIZ_MIKTAR, belirsizMiktarVar, miktarGirdisi } from '../../../ortak/veri/miktar.ts';
import { SURE, anahtarlar, cagri } from './ortak.ts';

// 3437 a (dilim 2): kalemin kabul sınırı kartın alternatif zarfından gelir (Malzemeler > İkame ve alternatifler). Talep eden yalnız daraltır:
// muadili çıkarır, ölçü payını küçültür ya da "Yalnız aynı malzeme" der. Şartlı muadil varsayılan kapalıdır. null sınır zarfın tamamıdır.
const BOS: KabulSiniri = { yalnizAyni: false, sartliKabul: false, kaliteler: null, durumlar: null, payMm: null };
const sayi = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
const TUR_ADI = { tam: 'tam', ust: 'üst', sartli: 'şartlı' } as const;
const varsayilanMi = (k: KabulSiniri) => !k.yalnizAyni && !k.sartliKabul && k.kaliteler === null && k.durumlar === null && k.payMm === null;

type Secenekler = AlternatifZarfi['kalite']['secenekler'];
// Seçili liste yalnız açık seçeneklerden kurulur: şartlı kabul kapalıyken şartlı değer listeye girmez. Açıkların hepsi seçiliyse liste null (zarf).
const acikDegerler = (secenekler: Secenekler, sartliKabul: boolean) => secenekler.filter((s) => s.tur !== 'sartli' || sartliKabul).map((s) => s.deger);
function listeYaz(l: readonly string[] | null, secenekler: Secenekler, sartliKabul: boolean): string[] | null {
  if (l === null) return null;
  const acik = acikDegerler(secenekler, sartliKabul);
  const kalan = l.filter((x) => acik.includes(x));
  return acik.every((x) => kalan.includes(x)) ? null : kalan;
}

function Muadiller({ ad, istenen, acik, secenekler, secili, sartliKabul, degistir }: {
  ad: string; istenen: string | null; acik: boolean; secenekler: Secenekler; secili: readonly string[] | null; sartliKabul: boolean;
  degistir: (l: string[] | null) => void;
}) {
  if (!acik || secenekler.length === 0) return <span className="sa-kabul-ayni">Yalnız {istenen ?? 'istenen'}</span>;
  return (
    <div className="sa-kabul-cipler" role="group" aria-label={`${ad} muadilleri`}>
      {secenekler.map((s) => {
        const kapali = s.tur === 'sartli' && !sartliKabul;
        const icinde = !kapali && (secili === null || secili.includes(s.deger));
        const ipucu = kapali ? 'Şartlı muadil; açmak için "Şartlı muadilleri kabul ediyorum"u işaretleyin.' : icinde ? 'Tıklayınca çıkarılır' : 'Tıklayınca geri eklenir';
        return (
          <button key={s.deger} type="button" className="sa-kabul-cip" aria-pressed={icinde} disabled={kapali} title={s.notu ? `${ipucu} · ${s.notu}` : ipucu}
            onClick={() => {
              const l = icinde ? (secili ?? acikDegerler(secenekler, sartliKabul)).filter((x) => x !== s.deger) : [...(secili ?? []), s.deger];
              degistir(listeYaz(l, secenekler, sartliKabul));
            }}>
            <Simge ad={kapali ? 'lock' : icinde ? 'check' : 'x'} boyut="k" />
            {s.deger} <span className="sa-talep-not">{kapali ? 'şartlı: kapalı' : TUR_ADI[s.tur]}</span>
          </button>
        );
      })}
    </div>
  );
}

// Pay, miktar gibi ortak ayrıştırıcıdan okunur ("2,5" = "2.5"). Zarfınkinden geniş pay kırpılmaz: alan hata gösterir, form gönderilmez.
function payOku(yazi: string, enCok: number): { deger: number | null; hata: string | null } {
  const v = miktarGirdisi(yazi);
  if (v === '') return { deger: null, hata: null };
  if (belirsizMiktarVar(v)) return { deger: null, hata: BELIRSIZ_MIKTAR };
  if (!/^\d+(\.\d+)?$/.test(v)) return { deger: null, hata: 'Payı sayı olarak yazın; ondalık için virgül (2,5).' };
  const n = Number(v);
  return n > enCok ? { deger: null, hata: `Kartın sınırı en çok ${sayi(enCok)} mm; daha geniş pay yazılamaz.` } : { deger: n, hata: null };
}

// Tablo hücresi ve ayrıntı aynı önbelleği okur: zarf bir kez istenir.
export const useKabulZarfi = (no: number) => useQuery({
  queryKey: anahtarlar.kabulZarfi(no),
  queryFn: () => cagri.get('/satin-alma-kabul-zarfi/:no', { parametre: { no }, ...SURE }),
});
export const kapaliZarfNotu = (gerekce: string | null) => `Bu kartta alternatif kapalı${gerekce ? `: ${gerekce}` : ''}.`;

// hatali: alanda gönderilemeyecek bir değer var (talep formu gönderimi durdurur).
export function KabulSinirlari({ no, kabul, degistir }: { no: number; kabul: KabulSiniri | null; degistir: (k: KabulSiniri | null, hatali: boolean) => void }) {
  const [payYazi, payYaziYaz] = useState(() => (kabul?.payMm == null ? '' : sayi(kabul.payMm)));
  const [yalnizOncesi, yalnizOncesiYaz] = useState<KabulSiniri | null>(null);
  const sorgu = useKabulZarfi(no);
  const z = sorgu.data?.zarf;
  if (sorgu.isPending) return <p className="sa-talep-not">Kabul sınırları okunuyor</p>;
  if (sorgu.isError) return <p className="sa-talep-not">Kabul sınırları okunamadı; kalem kartın sınırıyla gider.</p>;
  if (z == null) return null;
  const k = kabul ?? BOS;
  const enCokPay = Math.max(0, ...z.olcu.map((o) => o.enCok - o.istenen));
  const pay = payOku(payYazi, enCokPay);
  const yaz = (d: Partial<KabulSiniri>, hatali = pay.hata !== null) => {
    const y = { ...k, ...d };
    degistir(varsayilanMi(y) ? null : y, hatali);
  };
  const sartliYaz = (acik: boolean) => yaz(acik ? { sartliKabul: true } : {
    sartliKabul: false,
    kaliteler: listeYaz(k.kaliteler, z.kalite.secenekler, false),
    durumlar: listeYaz(k.durumlar, z.durum.secenekler, false),
  });
  const baslik = (
    <div className="sa-kabul-baslik">
      <span><Simge ad="list" boyut="k" /> <b>Kabul sınırları</b></span>
      {z.kapali || k.yalnizAyni ? <Rozet ton="pasif">Yalnız aynı malzeme</Rozet> : <Rozet ton="tamam">Alternatif kabul</Rozet>}
    </div>
  );
  if (z.kapali) {
    return (
      <section className="sa-kabul" aria-label="Kabul sınırları">
        {baslik}
        <p className="sa-talep-not">{kapaliZarfNotu(z.gerekce)} Kalem yalnız aynı malzemeyle karşılanır.</p>
      </section>
    );
  }
  const sartliVar = !z.sartliAcik && [...z.kalite.secenekler, ...z.durum.secenekler].some((s) => s.tur === 'sartli');
  const olcu = z.olcu.map((o) => {
    const enCok = k.payMm === null ? o.enCok : Math.min(o.enCok, o.istenen + k.payMm);
    return `${o.anahtar} ${sayi(o.istenen)} – ${sayi(enCok)} mm`;
  }).join(' · ');
  const satirlar: { ad: string; istenen: string; kabul: ReactNode }[] = k.yalnizAyni ? [] : [
    { ad: 'Kalite', istenen: z.kalite.istenen ?? '-', kabul: <Muadiller ad="Kalite" istenen={z.kalite.istenen} acik={z.kalite.acik} secenekler={z.kalite.secenekler} secili={k.kaliteler} sartliKabul={k.sartliKabul || z.sartliAcik} degistir={(l) => yaz({ kaliteler: l })} /> },
    { ad: 'Durum', istenen: z.durum.istenen ?? '-', kabul: <Muadiller ad="Durum" istenen={z.durum.istenen} acik={z.durum.acik} secenekler={z.durum.secenekler} secili={k.durumlar} sartliKabul={k.sartliKabul || z.sartliAcik} degistir={(l) => yaz({ durumlar: l })} /> },
    ...(z.olcu.length === 0 ? [] : [{
      ad: 'Ölçü', istenen: z.olcu.map((o) => `${o.anahtar} ${sayi(o.istenen)}`).join(' · '),
      kabul: (
        <div className="sa-kabul-pay">
          <span>{olcu}</span>
          <Girdi etiket="En çok fazla (mm)" inputMode="decimal" className="sa-kabul-pay-girdi" value={payYazi} placeholder={sayi(enCokPay)}
            ipucu={`Boş: kartın sınırı (en çok ${sayi(enCokPay)} mm)`} hata={pay.hata ?? undefined}
            onChange={(e) => {
              payYaziYaz(e.target.value);
              const p = payOku(e.target.value, enCokPay);
              yaz(p.hata === null ? { payMm: p.deger } : {}, p.hata !== null);
            }} />
        </div>
      ),
    }]),
    ...(z.boy ? [{ ad: 'Boy', istenen: z.boy.istenen === null ? '-' : sayi(z.boy.istenen), kabul: z.boy.istenen === null ? '-' : z.boy.uzunKesilir ? `${sayi(z.boy.istenen)} ve uzun (kesilir)` : 'Aynı' }] : []),
    ...(z.yuzey.istenen === null ? [] : [{ ad: 'Yüzey', istenen: z.yuzey.istenen, kabul: z.yuzey.serbest ? 'Serbest' : 'Aynı' }]),
  ];
  const yalnizAyniYaz = (ayni: boolean) => {
    if (ayni === k.yalnizAyni) return;
    if (ayni) { yalnizOncesiYaz(kabul); degistir({ ...BOS, yalnizAyni: true }, false); return; }
    degistir(yalnizOncesi, payOku(payYazi, enCokPay).hata !== null);
  };
  return (
    <section className="sa-kabul" aria-label="Kabul sınırları">
      {baslik}
      <fieldset className="sa-kabul-kip">
        <legend>Bu malzeme yerine başka malzeme kabul edilir mi?</legend>
        <label className="tc-isaret"><input type="radio" name={`kabul-kip-${String(no)}`} checked={k.yalnizAyni} onChange={() => yalnizAyniYaz(true)} /><span><b>Yalnız aynı malzeme</b><span className="sa-talep-not"> Alternatif teklif alınmaz</span></span></label>
        <label className="tc-isaret"><input type="radio" name={`kabul-kip-${String(no)}`} checked={!k.yalnizAyni} onChange={() => yalnizAyniYaz(false)} /><span><b>Alternatif kabul</b><span className="sa-talep-not"> Aşağıdaki sınırlar içinde</span></span></label>
      </fieldset>
      <p className="sa-talep-not">Satın alma yalnız burada izin verdiğiniz alternatiflerle teklif alır. Muadil: kalite ya da durumu eşdeğer sayılan kart. Şartlı: ancak siz onaylarsanız kabul edilir.</p>
      {satirlar.length > 0 && (
        <table className="sa-talep-kt sa-kabul-tablo">
          <thead><tr><th scope="col">Özellik</th><th scope="col">İstenen</th><th scope="col">Kabul edilen</th></tr></thead>
          <tbody>{satirlar.map((s) => <tr key={s.ad}><th scope="row">{s.ad}</th><td>{s.istenen}</td><td>{s.kabul}</td></tr>)}</tbody>
        </table>
      )}
      <div className="sa-kabul-secim">
        {sartliVar && !k.yalnizAyni && (
          <IsaretKutusu etiket="Şartlı kalite ve durum muadillerini de kabul ediyorum (satın alma bulunca size sorulur)" checked={k.sartliKabul} onChange={(e) => sartliYaz(e.target.checked)} />
        )}
        <p className="sa-talep-not">{k.yalnizAyni ? 'Satın alma alternatif seçemez.' : 'Satın alma bu sınırlar içindeki alternatifi seçebilir; şartlı muadil size sorulur.'}</p>
      </div>
    </section>
  );
}
