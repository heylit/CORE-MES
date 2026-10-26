import { html, useNow, useState } from './temel';
import { LS } from './yukleyici';
import { useDocs } from './pano-planlama';
import { ALET_YOK_ILETISI, aletSecimAnahtari, secilebilirAletler, seciliAlet } from '../../../../istemci/src/ortak/cizim/cekirdek/olcum-aleti';
import type { OlcumAleti } from '../../../../istemci/src/ortak/cizim/cekirdek/olcum-aleti';

// Seçim cihazda alet türü başına saklanır: aynı türdeki sonraki ölçüm yeniden seçim istemez.
export function useOlcumAletleri(): OlcumAleti[] {
  const [list] = useDocs('gauges');
  return list as OlcumAleti[];
}
export const olcumAletiBul = (aletler: readonly OlcumAleti[], tool: unknown): OlcumAleti | null =>
  seciliAlet(aletler, tool, LS.get(aletSecimAnahtari(tool)), Date.now());

export function AletSecimi({ aletler, tool, onSec }: { aletler: readonly OlcumAleti[]; tool: unknown; onSec?: () => void }) {
  const now = useNow(600000), [, yenile] = useState(0);
  const secenek = secilebilirAletler(aletler, tool, now), secili = seciliAlet(aletler, tool, LS.get(aletSecimAnahtari(tool)), now);
  if (!secenek.length) return html`<span className="nok">${ALET_YOK_ILETISI}</span>`;
  return html`<select className="rsel" aria-label=${'Ölçü aleti: ' + String(tool || '')} value=${secili ? secili.id : ''}
    onChange=${e => { LS.set(aletSecimAnahtari(tool), e.target.value || null); yenile(n => n + 1); onSec && onSec(); }}>
    <option value="">${String(tool || 'Ölçü aleti')} · seçin</option>
    ${secenek.map(g => html`<option key=${g.id} value=${g.id}>${g.no}${g.type ? ' · ' + g.type : ''}</option>`)}
  </select>`;
}
