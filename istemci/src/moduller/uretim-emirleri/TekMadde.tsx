import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { TOPLU_EK_ONAY_ESIGI } from '#paylasilan/sozlesme/adim-matrisi-kurali.ts';
import type { HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, IsaretKutusu, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { GEREKCE_EN_AZ } from './adim-tablosu.ts';
import {
  MADDELER, MADDE_ATLAMA_METNI, adimMaddesi, emirKapali, gerekceIsteyenSayisi, gerekceYeterli, maddeSayimi, tekDokunusEylemi, tekHucre,
  type Kalem, type MaddeEylemi,
} from './adim-matrisi.ts';
import { MADDE } from './hazirlik-bilgisi.ts';
import type { MaddePlan, MaddeSon } from './madde-yazimi.ts';

// 3738 dilim 2: Tek madde merceği. Seçili hazırlık maddesinin hâli her hücrede görünür; hücreye tek dokunuş onaylar (tik) ya da hazır değil yapar (çarpı),
// elle değer varsa hücredeki geri al düğmesi elle değeri kaldırır. Birden çok hücre seçilince toplu şerit aynı işlemi sayımla yapar.
const EYLEM_ADI: Readonly<Record<MaddeEylemi, string>> = { hazir: 'Onayla', eksik: 'Eksik işaretle', geri: 'Elle değeri geri al' };
const EYLEM_YAZISI: Readonly<Record<MaddeEylemi, string>> = { hazir: 'elle hazır', eksik: 'elle hazır değil', geri: 'elle değeri kaldır' };
export const maddeAdi = (m: HazirlikMaddesi): string => MADDE[m].ad;

interface HucreOzellikleri {
  kalem: Kalem;
  madde: HazirlikMaddesi;
  yazabilir: boolean;
  coklu: boolean;
  secildi: boolean;
  kisa: boolean;
  mesgul: boolean;
  tikla: (o: MouseEvent | KeyboardEvent) => void;
  geriAl: () => void;
}
export function TekMaddeHucresi({ kalem, madde, yazabilir, coklu, secildi, kisa, mesgul, tikla, geriAl }: HucreOzellikleri) {
  const m = adimMaddesi(kalem.adim, madde);
  const g = tekHucre(m);
  const kapali = emirKapali(kalem.emir);
  const eylem = kapali ? null : tekDokunusEylemi(m);
  const ad = `${kalem.emir.emirNo}, OP ${String(kalem.adim.opNo)} ${kalem.adim.ad}: ${maddeAdi(madde)} ${g.ad}${g.elle ? ', elle yazıldı' : ''}`;
  const dokunus = eylem === null ? (kapali ? 'emir bitti' : 'dokunuş yok') : eylem === 'hazir' ? 'dokununca onaylanır' : 'dokununca hazır değil olur';
  const kilit = !yazabilir || eylem === null;
  return (
    <div className={`tc-am-hucre-kap tc-am-tek-kap${secildi ? ' tc-am-secili-kap' : ''}`}>
      <button type="button" className={`tc-am-hucre tc-am-tek tc-am-ton-${g.ton}${secildi ? ' tc-am-secili' : ''}`} data-am-k={kalem.anahtar} disabled={kilit || mesgul}
        aria-pressed={coklu || secildi ? secildi : undefined} aria-label={`${ad} (${dokunus})`} title={kisa ? `${g.ad}${g.elle ? ' (elle)' : ''}` : undefined}
        onClick={(o) => { tikla(o); }}>
        <Simge ad={g.simge} boyut="k" />
        {!kisa && <span className="tc-am-hucre-ad">{g.ad}</span>}
        {g.elle && <span className="tc-am-e" aria-hidden="true">E</span>}
      </button>
      {g.elle && yazabilir && !kapali && (
        <Dugme simge="rotate" className="tc-am-tek-geri" disabled={mesgul} aria-label={`${ad}: elle değeri geri al`} title="Elle değeri geri al" onClick={geriAl} />
      )}
    </div>
  );
}

interface BarOzellikleri {
  madde: HazirlikMaddesi;
  maddeSec: (m: HazirlikMaddesi) => void;
  eksikSayisi: number;
  yazabilir: boolean;
  eksikleriOnayla: () => void;
  eksikleriSec: () => void;
}
// Madde seçimi ve "N eksik: madde" özeti; "Hepsini onayla" görünen eksik hücreleri seçer ve sayımlı onayı açar.
export function TekMaddeBari({ madde, maddeSec, eksikSayisi, yazabilir, eksikleriOnayla, eksikleriSec }: BarOzellikleri) {
  return (
    <div className="tc-am-tek-bar" role="group" aria-label="Tek madde">
      <Secim etiket="Madde" value={madde} onChange={(o) => { maddeSec(o.target.value as HazirlikMaddesi); }}
        secenekler={MADDELER.map((x) => ({ deger: x, baslik: maddeAdi(x) }))} />
      <p className="tc-am-tek-ozet" role="status"><b>{eksikSayisi}</b> eksik: {maddeAdi(madde)}</p>
      <div className="tc-am-serit-dugmeler">
        <Dugme simge="check" disabled={!yazabilir || eksikSayisi === 0} onClick={eksikleriOnayla}>Hepsini onayla…</Dugme>
        <Dugme simge="x" disabled={!yazabilir || eksikSayisi === 0} onClick={eksikleriSec}>Eksikleri seç</Dugme>
      </div>
      <p className="tc-emir-not tc-am-tek-not">Tek dokunuş: eksik ile hazır arasında geçer; E, elle yazıldığını gösterir.</p>
    </div>
  );
}

interface SeritOzellikleri {
  madde: HazirlikMaddesi;
  secili: Kalem[];
  plan: MaddePlan | null;
  mesgul: boolean;
  baslat: (eylem: MaddeEylemi) => void;
  temizle: () => void;
  planYaz: (p: MaddePlan | null) => void;
  uygula: (p: MaddePlan) => Promise<void>;
}
// Seçim şeridi (toplu işlem) ve sayımlı onay: yazmadan önce yazılır / atlanır sayısı ve atlananlar gösterilir; tek gerekçe bütün kalemlere yazılır.
export function MaddeSeridi({ madde, secili, plan, mesgul, baslat, temizle, planYaz, uygula }: SeritOzellikleri) {
  const [ekOnay, ekOnayYaz] = useState(false);
  if (plan !== null) {
    const s = maddeSayimi(plan.kalemler, plan.madde, plan.eylem);
    const gerek = gerekceIsteyenSayisi(plan.kalemler, plan.madde, plan.eylem) > 0;
    const ek = s.yazilir > TOPLU_EK_ONAY_ESIGI;
    const nedenler = s.nedenler.map((n) => `${String(n.sayi)} ${MADDE_ATLAMA_METNI[n.neden]}`).join(', ');
    const atlananlar = plan.kalemler.filter((k) => !maddeSayimi([k], plan.madde, plan.eylem).yazilir);
    const nedeni = (k: Kalem) => { const n = maddeSayimi([k], plan.madde, plan.eylem).nedenler[0]; return n === undefined ? '' : MADDE_ATLAMA_METNI[n.neden]; };
    return (
      <div className="tc-am-serit tc-am-plan" role="region" aria-label="Yazma onayı">
        <p className="tc-am-sayim"><b>{plan.kalemler.length} seçili: {s.yazilir} yazılır{s.atlanir > 0 ? `, ${String(s.atlanir)} atlanır (${nedenler})` : ''}</b></p>
        <p className="tc-emir-not">{maddeAdi(plan.madde)}: {EYLEM_YAZISI[plan.eylem]} yazılır.</p>
        {atlananlar.length > 0 && (
          <ul className="tc-am-atlananlar" aria-label="Atlanacak adımlar">
            {atlananlar.slice(0, 5).map((k) => <li key={k.anahtar}>{k.emir.emirNo} OP {k.adim.opNo}: {nedeni(k)}</li>)}
            {atlananlar.length > 5 && <li>ve {atlananlar.length - 5} adım daha</li>}
          </ul>
        )}
        {gerek && (
          <CokSatir etiket="Gerekçe" rows={2} autoFocus value={plan.gerekce} placeholder={`Zorunlu, en az ${String(GEREKCE_EN_AZ)} karakter`}
            ipucu="Bu madde eksikken iş emri başlamaz; tek gerekçe bütün adımlara yazılır." onChange={(o) => { planYaz({ ...plan, gerekce: o.target.value }); }} />
        )}
        {ek && <IsaretKutusu etiket={`${String(s.yazilir)} adıma yazılacak; bu 50 adımdan çok. Onaylıyorum.`} checked={ekOnay} onChange={(o) => { ekOnayYaz(o.target.checked); }} />}
        <div className="tc-am-serit-dugmeler">
          <Dugme tur="birincil" simge="check" yukleniyor={mesgul} disabled={s.yazilir === 0 || (gerek && !gerekceYeterli(plan.gerekce)) || (ek && !ekOnay)}
            onClick={() => { ekOnayYaz(false); void uygula(plan); }}>
            {plan.eylem === 'hazir' ? `${String(s.yazilir)} adımı onayla` : plan.eylem === 'eksik' ? `${String(s.yazilir)} adımı hazır değil yap` : `${String(s.yazilir)} adımın elle değerini geri al`}
          </Dugme>
          <Dugme disabled={mesgul} onClick={() => { planYaz(null); }}>Vazgeç</Dugme>
        </div>
      </div>
    );
  }
  if (secili.length === 0) return null;
  return (
    <div className="tc-am-serit" role="region" aria-label="Toplu hazırlık işlemi">
      <span className="tc-am-sayi-etiket">{secili.length} seçili</span>
      <span className="tc-emir-not">{maddeAdi(madde)}</span>
      <div className="tc-am-serit-dugmeler">
        <Dugme tur="birincil" simge="check" onClick={() => { baslat('hazir'); }}>{EYLEM_ADI.hazir}</Dugme>
        <Dugme simge="x" onClick={() => { baslat('eksik'); }}>{EYLEM_ADI.eksik}</Dugme>
        <Dugme simge="rotate" onClick={() => { baslat('geri'); }}>{EYLEM_ADI.geri}</Dugme>
        <Dugme simge="x" aria-label="Seçimi temizle" onClick={temizle}>Seçimi temizle</Dugme>
      </div>
    </div>
  );
}

interface SonOzellikleri {
  son: MaddeSon | null;
  hata: string | null;
  mesgul: boolean;
  kapat: () => void;
  geriAl: () => void;
  yenidenDene: () => void;
  adlandir: (anahtar: string) => string;
}
// Kalıcı "son yazım" şeridi: sonuç eklenmeden önce de DOM'dadır (ekran okuyucu duyurur); son toplu yazım geri alınabilir.
export function MaddeSonSeridi({ son, hata, mesgul, kapat, geriAl, yenidenDene, adlandir }: SonOzellikleri) {
  return (
    <div className="tc-am-son" role="status" aria-live="polite">
      {son !== null && (
        <>
          <span>
            {son.geriAlindi
              ? 'Son yazım geri alındı.'
              : `Son yazım (${maddeAdi(son.madde)}): ${String(son.ozet.yazildi + son.ozet.kaldirildi)} adım ${son.eylem === 'geri' ? 'elle değeri kalktı' : 'yazıldı'}${son.ozet.atlandi > 0 ? `, ${String(son.ozet.atlandi)} atlandı` : ''}${son.ozet.basarisiz.length > 0 ? `, ${String(son.ozet.basarisiz.length)} durum değişti (yeniden deneyin)` : ''}.`}
          </span>
          {!son.geriAlindi && son.yazilanlar.length > 0 && <Dugme simge="back" disabled={mesgul} onClick={geriAl}>Geri al</Dugme>}
          {son.ozet.basarisiz.length > 0 && <Dugme simge="rotate" disabled={mesgul} onClick={yenidenDene}>Yeniden dene</Dugme>}
          <Dugme simge="x" onClick={kapat} aria-label="Şeridi kapat" />
          {son.ozet.basarisiz.length > 0 && (
            <ul className="tc-am-atlananlar" aria-label="Yazılamayan adımlar">
              {son.ozet.basarisiz.map((b) => <li key={b.anahtar}>{adlandir(b.anahtar)}: {b.neden}</li>)}
            </ul>
          )}
        </>
      )}
      {hata !== null && <span role="alert" className="tc-am-hata">{hata}</span>}
    </div>
  );
}
