import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { KurFaizAraligi } from '#paylasilan/sozlesme/finans.ts';
import { Secim, Simge } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';

// Şeridin kur ve faiz grafiği (1089 a). Ortak GrafikKarti sıfırdan çizer; kurun günlük oynaması orada düz çizgi kalır. Burada
// eksen seçilen aralığın en küçüğü ile en büyüğü arasındadır, yatay eksen takvim günüdür; çizgi yalnız girilen günlerden geçer.
export const SERILER = [
  { anahtar: 'kur-USD', ad: 'USD kuru', tur: 'kur', paraBirimi: 'USD' },
  { anahtar: 'kur-EUR', ad: 'EUR kuru', tur: 'kur', paraBirimi: 'EUR' },
  { anahtar: 'kur-GBP', ad: 'GBP kuru', tur: 'kur', paraBirimi: 'GBP' },
  { anahtar: 'faiz-TRY', ad: 'TRY aylık faiz', tur: 'faiz', paraBirimi: 'TRY' },
  { anahtar: 'faiz-USD', ad: 'USD aylık faiz', tur: 'faiz', paraBirimi: 'USD' },
  { anahtar: 'faiz-EUR', ad: 'EUR aylık faiz', tur: 'faiz', paraBirimi: 'EUR' },
] as const;
type Seri = (typeof SERILER)[number];
export const SURELER = [30, 90, 365] as const;

const EN = 320;
const BOY = 120;
const GUN = 86_400_000;
const gunSayisi = (t: string) => Date.parse(`${t}T00:00:00Z`) / GUN;
const gunOncesi = (t: string, n: number) => new Date(Date.parse(`${t}T00:00:00Z`) - n * GUN).toISOString().slice(0, 10);
const gunMetni = (t: string) => t.split('-').reverse().join('.');
const sayiMetni = (n: number, basamak: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: basamak });

export interface Nokta { tarih: string; deger: number }
// Kur: girilen günler. Faiz: aralığın başında geçerli oran (aralıktan önce başlamışsa başa çekilir) ve aralıktaki değişimler.
export function seriNoktalari(veri: KurFaizAraligi, seri: Seri, baslangic: string): Nokta[] {
  if (seri.tur === 'kur') return veri.kurlar.filter((k) => k.paraBirimi === seri.paraBirimi).map((k) => ({ tarih: k.tarih, deger: Number(k.kur) }));
  return veri.faizler.filter((f) => f.paraBirimi === seri.paraBirimi)
    .map((f) => ({ tarih: f.gecerlilikBaslangic < baslangic ? baslangic : f.gecerlilikBaslangic, deger: Number(f.aylikYuzde) }));
}

// Kur noktadan noktaya, faiz basamakla çizilir (yeni oran başlangıcına kadar eski oran geçerlidir); faiz bitiş gününe uzar.
export function cizgiYolu(noktalar: readonly Nokta[], baslangic: string, bitis: string, basamakli: boolean): string {
  if (noktalar.length === 0) return '';
  const ilk = gunSayisi(baslangic);
  const toplam = Math.max(1, gunSayisi(bitis) - ilk);
  const degerler = noktalar.map((n) => n.deger);
  let alt = Math.min(...degerler);
  let ust = Math.max(...degerler);
  const pay = ust === alt ? Math.max(Math.abs(ust) * 0.01, 0.01) : (ust - alt) * 0.08;
  alt -= pay; ust += pay;
  const x = (t: string) => (((gunSayisi(t) - ilk) / toplam) * EN).toFixed(2);
  const y = (d: number) => (BOY - ((d - alt) / (ust - alt)) * BOY).toFixed(2);
  const parca: string[] = [];
  noktalar.forEach((n, i) => {
    if (i === 0) parca.push(`M${x(n.tarih)},${y(n.deger)}`);
    else if (basamakli) parca.push(`H${x(n.tarih)}`, `V${y(n.deger)}`);
    else parca.push(`L${x(n.tarih)},${y(n.deger)}`);
  });
  if (basamakli) parca.push(`H${EN}`);
  return parca.join(' ');
}

export function KurGrafigi({ bugun }: { bugun: string }) {
  const [seriAnahtari, seriYaz] = useState<Seri['anahtar']>('kur-USD');
  const [sure, sureYaz] = useState<(typeof SURELER)[number]>(90);
  const seri = SERILER.find((s) => s.anahtar === seriAnahtari) ?? SERILER[0];
  const baslangic = gunOncesi(bugun, sure);
  const veri = useQuery({
    queryKey: ['finans', 'kur-faiz-araligi', baslangic, bugun],
    queryFn: () => api.get<KurFaizAraligi>(`/finans/kur-faiz-araligi?baslangic=${baslangic}&bitis=${bugun}`),
  });
  const noktalar = veri.data ? seriNoktalari(veri.data, seri, baslangic) : [];
  const basamak = seri.tur === 'kur' ? 4 : 2;
  const birimli = (d: number) => (seri.tur === 'kur' ? sayiMetni(d, basamak) : `%${sayiMetni(d, basamak)}`);
  const son = noktalar.at(-1);
  const degerler = noktalar.map((n) => n.deger);
  const yol = cizgiYolu(noktalar, baslangic, bugun, seri.tur === 'faiz');
  return (
    <div className="tc-kfg">
      <div className="tc-kfg-secim">
        <Secim etiket="Seri" value={seriAnahtari} onChange={(e) => seriYaz(e.target.value as Seri['anahtar'])}
          secenekler={SERILER.map((s) => ({ deger: s.anahtar, baslik: s.ad }))} />
        <Secim etiket="Süre" value={String(sure)} onChange={(e) => sureYaz(Number(e.target.value) as (typeof SURELER)[number])}
          secenekler={SURELER.map((g) => ({ deger: String(g), baslik: `Son ${g} gün` }))} />
      </div>
      {veri.isError ? <p className="tc-kfs-hata" role="alert">{hataIletisi(veri.error, 'Kur geçmişi okunamadı.')}</p>
        : veri.isPending ? <p className="tc-kfs-not">Yükleniyor…</p>
          : noktalar.length === 0 ? <p className="tc-kfs-not">Bu aralıkta {seri.ad} girilmemiş.</p>
            : (
              <>
                <div className="tc-kfg-ozet">
                  <span className="mono"><b>{son ? birimli(son.deger) : ''}</b> <span className="tc-kfs-not">{son ? gunMetni(son.tarih) : ''}</span></span>
                  <span className="tc-kfs-not mono">en düşük {birimli(Math.min(...degerler))} · en yüksek {birimli(Math.max(...degerler))}</span>
                </div>
                <svg className="tc-kfg-cizim" viewBox={`0 0 ${EN} ${BOY}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  <path className="tc-kfg-cizgi" d={yol} data-tur={seri.tur} />
                </svg>
                <div className="tc-kfg-eksen tc-kfs-not mono" aria-hidden="true"><span>{gunMetni(baslangic)}</span><span>{gunMetni(bugun)}</span></div>
                <table className="tc-kfg-tablo">
                  <caption>{seri.ad}, {sure} gün</caption>
                  <tbody>{noktalar.map((n) => <tr key={n.tarih}><th scope="row">{gunMetni(n.tarih)}</th><td>{birimli(n.deger)}</td></tr>)}</tbody>
                </table>
              </>
            )}
      <p className="tc-kfs-not"><Simge ad="chart" boyut="k" /> {seri.tur === 'kur' ? 'Yalnız girilen günler çizilir; girilmeyen gün uydurulmaz.' : 'Oran yeni başlangıç gününe kadar geçerlidir.'}</p>
    </div>
  );
}
