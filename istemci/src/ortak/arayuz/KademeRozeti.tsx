import { KADEME_ADLARI, type Kademe } from '#paylasilan/sozlesme/kademe-sabitleri.ts';
import './kademe-rozeti.css';

// Kademeli uyarı rozeti (3588): bildirim, hazırlık görevi, proje ve sipariş ekranları aynı sözlüğü ve aynı görünümü kullanır.
// Ad rozette yazılıdır, renk tek taşıyıcı değildir; yazı koyu, dolgu açık (küçük yazıda 4,5:1, test ölçer).
const kademeMi = (k: number): k is Kademe => k in KADEME_ADLARI;

export const kademeMetni = (k: number | null): string => (k === null ? '' : `K${String(k)} ${kademeMi(k) ? KADEME_ADLARI[k] : ''}`.trim());

export function KademeRozeti({ kademe }: { kademe: number }) {
  return (
    <span className="tc-kademe-rozeti" data-kademe={kademeMi(kademe) ? String(kademe) : 'bilinmiyor'}>
      <i aria-hidden="true" />
      {kademeMetni(kademe)}
    </span>
  );
}
