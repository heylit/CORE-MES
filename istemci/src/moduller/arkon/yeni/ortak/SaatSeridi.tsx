import { Dugme } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { saat } from '../cekirdek/bicim.ts';
import { anlikVardiya } from '../cekirdek/vardiya.ts';
import { useArkon, useSimdi } from '../veri/baglam.ts';

// Eski sayfa üst çubuklarının sağ ucu (PrepTop, QTop, LabTop, PageShell): öteki Arkon sayfalarına kısayollar ve saat. Saatin altında
// sayfanın yazısı ya da (verilmezse) anlık vardiya yazar. Kısayol, kişinin göremediği sayfa için çizilmez.
export interface Kisayol { sayfa: string; simge: SimgeAdi; metin: string; yalnizSimge?: boolean }

export function SaatSeridi({ kisayollar = [], alt }: { kisayollar?: readonly Kisayol[]; alt?: string }) {
  const { ayarlar, git, sayfaGorunur } = useArkon();
  const simdi = useSimdi(30000);
  return (
    <>
      {kisayollar.filter((k) => sayfaGorunur(k.sayfa)).map((k) => (
        <Dugme key={k.sayfa} simge={k.simge} onClick={() => git(k.sayfa)} title={k.metin} aria-label={k.yalnizSimge ? k.metin : undefined}>
          {k.yalnizSimge ? null : k.metin}
        </Dugme>
      ))}
      <span className="tc-ay-saat"><b className="mono">{saat(simdi)}</b><small>{alt ?? anlikVardiya(simdi, ayarlar.vardiyalar, ayarlar.tatiller).label}</small></span>
    </>
  );
}
