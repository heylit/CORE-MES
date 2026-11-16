import { durumMetni, isMalzemesiniAc, useIsMalzemeDurumu } from '../../baglanti.ts';
import { sayi } from '../cekirdek/bicim.ts';
import type { Is } from './tipler.ts';

// Sayacın iki yanı: solda istasyondaki malzemenin kalan işe yetme oranı (şarj gibi azalır), sağda üretilen (iyi / hedef, artar).
// Malzeme oranı stok modülünün okumasıdır (en kısıtlı girdi, çip ile aynı istek); veri yoksa çubuk çizilmez, yeri boş kalır ki kadran ortada dursun.
export const malzemeTonu = (oran: number): 'tamam' | 'uyari' | 'hata' => (oran >= 0.5 ? 'tamam' : oran >= 0.2 ? 'uyari' : 'hata');
const yuzde = (oran: number): number => Math.round(Math.min(1, Math.max(0, oran)) * 100);
const miktarYazi = (m: string): string => Number(m).toLocaleString('tr-TR', { maximumFractionDigits: 3 });

function Cubuk({ oran, ad }: { oran: number; ad: string }) {
  const p = yuzde(oran);
  return (
    <span className="tc-ay1-gosterge-cubuk" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`${ad} %${String(p)}`}>
      <svg viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y={100 - p} width="10" height={p} /></svg>
    </span>
  );
}
const Bos = () => <span className="tc-ay1-gosterge" data-bos="" aria-hidden="true" />;

export function MalzemeGostergesi({ istasyon, emirId }: { istasyon: string; emirId: number | null }) {
  const { durum, istasyonId } = useIsMalzemeDurumu(istasyon, emirId);
  const y = durum?.yetme ?? null;
  if (!durum || !y || istasyonId === null || emirId === null) return <Bos />;
  const oran = y.kalanAdet > 0 ? y.adetlik / y.kalanAdet : 1;
  const birim = y.birim ? ` ${y.birim}` : '';
  const ipucu = `${[y.kod, y.ad].filter(Boolean).join(' · ')} · istasyonda ${miktarYazi(y.miktar)}${birim} · ${sayi(y.adetlik)} adetlik, kalan iş ${sayi(y.kalanAdet)} · ${durumMetni(durum).metin}`;
  return (
    <button type="button" className="tc-ay1-gosterge" data-ton={malzemeTonu(oran)} title={ipucu} onClick={() => isMalzemesiniAc({ istasyonId, uretimEmriId: emirId, malzemeId: null })}>
      <span className="tc-ay1-gosterge-ad">Malzeme</span>
      <Cubuk oran={oran} ad="Malzeme" />
      <b>{sayi(y.adetlik)} adetlik</b>
      <small>{miktarYazi(y.miktar)}{birim}</small>
    </button>
  );
}

export function UretimGostergesi({ is }: { is: Is }) {
  if (is.empty || !(is.target > 0)) return <Bos />;
  const oran = is.good / is.target;
  return (
    <div className="tc-ay1-gosterge" data-ton="bilgi">
      <span className="tc-ay1-gosterge-ad">Üretilen</span>
      <Cubuk oran={oran} ad="Üretilen" />
      <b className="tc-ay1-mono">{sayi(is.good)} / {sayi(is.target)}</b>
      <small>%{yuzde(oran)}</small>
    </div>
  );
}
