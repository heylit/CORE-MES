import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { KURULUYOR, type PlanKurucu } from './coz.ts';
import type { Derleme } from './kurallar.ts';
import { MOTOR_NOTU, YOK_NOTU } from './ortak.tsx';

// Çalışma var, plan yok (m-plan bosPlan): kaydın sayıları, üç adım, iki düğme. Planı kur sunucudaki motorla (576); yazamayana pasif. Veri ve
// kısıtlar motor sayfasının ekranıdır (577b); `veriAc` verilmezse pasif. Görünüm ve dönem çubuğu bu durumda çizilmez.
const ADIMLAR: [string, string][] = [
  ['Planı kur', 'Motor bütün kısıtlarla ilk planı kurar, kalan sürede iyileştirir.'],
  ['Sorunlara bak', 'Sağdaki karar paneli gecikeni, malzemesi eksik olanı ve darboğazı sıralar.'],
  ['Karar ver', 'Her öneri önce önizlenir; Uygula demeden plan değişmez.'],
];
function VeriDugmesi({ veriAc }: { veriAc: (() => void) | null }) {
  return veriAc
    ? <button type="button" className="tc-dugme" onClick={veriAc}><Simge ad="layers" boyut="k" />Veri ve kısıtlar</button>
    : <button type="button" className="tc-dugme" aria-disabled="true" title={`Veri ve kısıtlar: ${YOK_NOTU}`}><Simge ad="layers" boyut="k" />Veri ve kısıtlar</button>;
}

export function BosPlan({ c, cx, planKur = null, veriAc = null }: { c: PlanlamaCalismasi; cx: Derleme; planKur?: PlanKurucu | null; veriAc?: (() => void) | null }) {
  const D = c.D; const ad = typeof D.meta?.ad === 'string' ? D.meta.ad : null;
  const sayi = (n: number | undefined) => (n == null ? '—' : String(n));
  return (
    <div className="tc-pym-bos tc-pym-bos-genis">
      <Simge ad="gantt" boyut="b" />
      <strong>Plan henüz kurulmadı</strong>
      <span>{`${ad ? `${ad}: ` : ''}${D.tezgahlar.length} tezgâh, ${D.siparisler.length} sipariş, ${Object.keys(cx.byId).length} işlem, ${sayi(D.personel?.length)} personel.`}</span>
      <ol className="tc-pym-adimlar">
        {ADIMLAR.map(([b, m], i) => <li key={b}><b className="tc-pym-adim-no tc-pym-mono">{i + 1}</b><span><b>{b}</b><br /><small>{m}</small></span></li>)}
      </ol>
      <div className="tc-pym-bos-dugmeler">
        {planKur ? (
          <button type="button" className="tc-dugme tc-dugme-birincil" disabled={planKur.suruyor} aria-busy={planKur.suruyor || undefined} onClick={planKur.kur}
            title={planKur.suruyor ? KURULUYOR : undefined} aria-label="Planı kur"><Simge ad="play" boyut="k" />{planKur.suruyor ? 'Kuruluyor' : 'Planı kur'}</button>
        ) : <button type="button" className="tc-dugme tc-dugme-birincil" aria-disabled="true" title={`Planı kur: ${MOTOR_NOTU}`}><Simge ad="play" boyut="k" />Planı kur</button>}
        <VeriDugmesi veriAc={veriAc} />
      </div>
      {planKur?.suruyor && <small role="status">{KURULUYOR}</small>}
    </div>
  );
}

// Çalışma kaydı yokken (Soru 489/2 c): sade mesaj, kartın üç adımı, pasif "Planı kur"; "Veri ve kısıtlar" (497/10 a) boş ekranını açar.
// Sayılar çalışmayla gelir, çalışmayı ekran kurmaz (289/8).
export function BosCalisma({ veriAc = null }: { veriAc?: (() => void) | null }) {
  return (
    <div className="tc-pym-bos tc-pym-bos-genis">
      <Simge ad="gantt" boyut="b" />
      <strong>Planlama çalışması yok.</strong>
      <ol className="tc-pym-adimlar">
        {ADIMLAR.map(([b, m], i) => <li key={b}><b className="tc-pym-adim-no tc-pym-mono">{i + 1}</b><span><b>{b}</b><br /><small>{m}</small></span></li>)}
      </ol>
      <div className="tc-pym-bos-dugmeler">
        <button type="button" className="tc-dugme tc-dugme-birincil" aria-disabled="true" title={`Planı kur: ${MOTOR_NOTU}`}><Simge ad="play" boyut="k" />Planı kur</button>
        <VeriDugmesi veriAc={veriAc} />
      </div>
    </div>
  );
}
