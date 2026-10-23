import { useState } from 'react';
import { Dugme, Pencere, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { LSIZES } from '../sabitler/index.ts';
import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { KartKaydi } from '../tipler.ts';
import { kimlikOf } from './liste.ts';
import { belgeyiYazdir, dosyaIndir, guvenliAd, svgAdresi } from './dosya.ts';

type Boyut = Extract<keyof typeof LSIZES, string>;
const BOYUTLAR = Object.keys(LSIZES) as Boyut[];

// Basım belgesi kâğıda gider: etiket ölçüsü sayfa ölçüsüdür, her etiket bir sayfa (prototipin labelsDoc'u).
export function etiketBelgesi(kayitlar: readonly KartKaydi[], [W, H]: readonly [number, number], b: KuralBaglami): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Etiketler</title><style>@page{size:${W}mm ${H}mm;margin:0}`
    + `html,body{margin:0}body{font-family:Arial,sans-serif}.l{width:${W}mm;height:${H}mm;page-break-after:always;break-after:page}.l svg{display:block}`
    + '@media screen{body{background:#ddd;padding:10px}.l{margin:0 0 6px}}</style></head><body>'
    + `${kayitlar.map((x) => `<div class="l">${K.labelSVG(x, [W, H], b)}</div>`).join('')}</body></html>`;
}

// Hizmet kartına etiket basılmaz; karışık seçimde yalnız ötekiler kalır (prototip).
export const etiketlenebilir = (kayitlar: readonly KartKaydi[]): KartKaydi[] => kayitlar.filter((x) => x.tur !== 'hizmet');

export function EtiketPenceresi({ kayitlar, b, kapat }: { kayitlar: readonly KartKaydi[]; b: KuralBaglami; kapat: () => void }) {
  const [boyut, boyutYaz] = useState<Boyut>(BOYUTLAR[0]!);
  const { bildir } = useBildirim();
  const sz = LSIZES[boyut] as readonly [number, number];
  const coklu = kayitlar.length > 1;
  return (
    <Pencere
      acik kapat={kapat} baslik={coklu ? `Etiketler (${kayitlar.length})` : 'Etiket'} tur="yan"
      alt={(
        <div className="tc-mk-pencere-alt">
          <Dugme
            tur="birincil" simge="printer"
            onClick={() => { if (!belgeyiYazdir(etiketBelgesi(kayitlar, sz, b))) bildir('hata', 'Yazdırma bu görünümde açılamadı; dosyayı indirip yazdır.'); }}
          >
            Yazdır
          </Dugme>
          <Dugme
            simge="download"
            onClick={() => (coklu
              ? dosyaIndir('etiketler.html', etiketBelgesi(kayitlar, sz, b))
              : dosyaIndir(`${guvenliAd(kayitlar[0]!.com.kod)}-etiket.svg`, K.labelSVG(kayitlar[0]!, sz, b)))}
          >
            {coklu ? 'Etiket sayfasını indir (.html)' : 'Etiketi indir (.svg)'}
          </Dugme>
          <Dugme className="tc-mk-sona" onClick={kapat}>Kapat</Dugme>
        </div>
      )}
    >
      <div className="tc-mk-cipler" role="radiogroup" aria-label="Etiket boyutu">
        {BOYUTLAR.map((k) => (
          <Dugme key={k} role="radio" aria-checked={k === boyut} onClick={() => boyutYaz(k)}>{String(k).replace('x', ' × ')} mm</Dugme>
        ))}
      </div>
      <div className="tc-mk-etiketler">
        {kayitlar.map((x) => (
          <img key={kimlikOf(x)} className="tc-mk-etiket" data-boyut={boyut} src={svgAdresi(K.labelSVG(x, sz, b))} alt={`${x.com.kod} etiketi`} />
        ))}
      </div>
      <p className="tc-mk-ipucu">QR kod; malzeme kodu, ad, kalite ve ölçüyü içerir. Yazdırma penceresi açılmazsa dosyayı indirip oradan yazdır.</p>
    </Pencere>
  );
}
