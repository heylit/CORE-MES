import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Dugme } from '../../../../../ortak/arayuz/index.ts';
import { yerlesikKaliteYogunlugu } from '../../../disari.ts';
import { fmt } from '../../bicim.ts';
import { MALZEMELER_YENI, useAnalizAgirligi } from '../../veri.ts';
import { useSihirbaz } from '../baglam.ts';
import { MetinAlani } from '../parcalar.tsx';

const NEDEN = { 'analiz-yok': '3B modelin analizi henüz yok.', 'hacim-yok': '3B model kapalı bir katı değil; hacim, dolayısıyla ağırlık hesaplanamaz.' } as const;
const yuvarla = (x: number): number => Math.round(x * 1e4) / 1e4;

// 1710 (1704 a): mamul ve yarı mamul kartında net ağırlık 3B analizinin hacminden hesaplanır ve yalnız düğmeyle forma yazılır; kart
// her zamanki kaydetmeyle (malzemeler.yaz) yazılır. Yoğunluğu kullanıcı yazar; boşken ilk stok önerisinin kalitesi geçerlidir
// (3D Atölyesi ekranının kuralı, 1480). Model yoksa hiçbir şey gösterilmez.
export function AnalizAgirligi() {
  const { taslak: d, kartlar, yetki, degistir } = useSihirbaz();
  const no = kartlar.find((k) => k.kimlik === d.id)?.no ?? null;
  const uygun = yetki.yaz && (d.tur === 'mamul' || d.tur === 'yarimamul');
  const ozet = useAnalizAgirligi(no, uygun);
  const k = ozet.data?.kalite ?? null;
  const yerlesik = useQuery({
    queryKey: [...MALZEMELER_YENI, 'kalite-yogunlugu', k?.aile ?? '', k?.kaliteKodu ?? ''],
    enabled: k !== null && k.yogunluk === null && k.aile !== null && k.kaliteKodu !== null,
    staleTime: Infinity,
    queryFn: () => yerlesikKaliteYogunlugu(k?.aile ?? '', k?.kaliteKodu ?? ''),
  });
  const [yazilan, yaz] = useState<number | null>(null);
  const v = ozet.data;
  if (!uygun || v === undefined || v.model === null) return null;
  const onDeger = k?.yogunluk ?? yerlesik.data ?? null;
  const yogunluk = yazilan ?? onDeger;
  const kg = v.hacimMm3 === null || yogunluk === null ? null : yuvarla((v.hacimMm3 * yogunluk) / 1e6);
  const kaynak = `${v.model.belgeAdi} (${v.model.harf})`;
  return (
    <div className="tc-my-canli" role="group" aria-label="3B analizden net ağırlık">
      {v.neden !== null && v.neden !== 'model-yok' ? <div className="tc-my-canli-not">{NEDEN[v.neden]} Model: {kaynak}</div> : (
        <>
          <div><small>3B analiz hacmi</small><b>{fmt((v.hacimMm3 ?? 0) / 1000)} cm³</b><small>{kaynak}</small></div>
          <MetinAlani
            etiket="Yoğunluk (g/cm³)" deger={yazilan ?? ''} sayi yaz={(x) => { const n = Number(x); yaz(Number.isFinite(n) && n > 0 ? n : null); }}
            ipucu={onDeger === null ? 'Yoğunluğu yazın' : `Boşsa ${k?.ad ?? 'önerilen kalite'}: ${fmt(onDeger)}`}
          />
          <div>
            <small>Net ağırlık</small><b>{kg === null ? 'Yoğunluk gerekli' : `≈ ${fmt(kg)} kg`}</b>
            <Dugme simge="check" disabled={kg === null} onClick={() => { if (kg !== null) degistir((t) => { t.g.net = kg; }); }}>Net ağırlığa yaz</Dugme>
          </div>
        </>
      )}
    </div>
  );
}
