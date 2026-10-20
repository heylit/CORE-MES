import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FasonSureSatiri, FasonTerminUyumuSatiri } from '#paylasilan/sozlesme/satin-alma.ts';
import { CubukListesiKarti, Secim, type CubukSatiri } from '../../../ortak/arayuz/index.ts';
import { SURE, anahtarlar, cagri } from '../talep/ortak.ts';
import './fason-sure-grafikleri.css';

export const FASON_SON_GUN = 365;
// Kart başına en çok bu kadar kırılım çizilir (en uzun süre başta); ötesi süzgeçle bulunur.
const EN_COK_SATIR = 10;

const firmaEtiketi = (x: { firmaId: number; firmaAdi: string | null }): string => x.firmaAdi ?? `Firma ${x.firmaId}`;
const malzemeEtiketi = (x: { malzemeNo: number | null; malzemeAdi: string | null }): string => x.malzemeAdi ?? (x.malzemeNo === null ? 'Malzemesiz' : `Malzeme ${x.malzemeNo}`);
const sureEtiketi = (s: FasonSureSatiri): string =>
  `${malzemeEtiketi(s)} · ${s.operasyonAdi ?? `Operasyon ${s.operasyonTipiId}`} · ${firmaEtiketi(s)} · ${s.adet.toLocaleString('tr-TR')} adet`;
const terminEtiketi = (u: FasonTerminUyumuSatiri): string => `${firmaEtiketi(u)} (${u.ornekSayisi} iş)`;

// Dış operasyonlardaki fason iş emirlerinin gerçekleşen süresi ve termin uyumu. Yalnız gösterilir: plan tahminine termin girmez.
export function FasonSureGrafikleri() {
  const [firma, firmaYaz] = useState('');
  const [malzeme, malzemeYaz] = useState('');
  const l = useQuery({ queryKey: anahtarlar.fasonSureleri(FASON_SON_GUN), queryFn: () => cagri.get('/satin-alma-fason-sureleri', { sorgu: { sonGun: FASON_SON_GUN }, ...SURE }) });
  const veri = l.data;

  const firmaSecenekleri = veri === undefined ? [] : [...new Map([...veri.sureler, ...veri.terminUyumu].map((x) => [x.firmaId, firmaEtiketi(x)])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'tr')).map(([deger, baslik]) => ({ deger: String(deger), baslik }));
  const malzemeSecenekleri = veri === undefined ? [] : [...new Map(veri.sureler.flatMap((s) => (s.malzemeNo === null ? [] : [[s.malzemeNo, malzemeEtiketi(s)] as const]))).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'tr')).map(([deger, baslik]) => ({ deger: String(deger), baslik }));

  const suzulen = veri?.sureler.filter((s) => (firma === '' || s.firmaId === Number(firma)) && (malzeme === '' || s.malzemeNo === Number(malzeme)));
  const sureSatirlari: CubukSatiri[] | undefined = suzulen?.slice(0, EN_COK_SATIR).map((s) => ({ etiket: sureEtiketi(s), deger: s.ortalamaSureGun }));
  const uyumSatirlari: CubukSatiri[] | undefined = veri?.terminUyumu
    .filter((u) => firma === '' || u.firmaId === Number(firma))
    .map((u) => ({ etiket: terminEtiketi(u), deger: u.ortalamaFarkGun, ton: u.ortalamaFarkGun > 0 ? 'hata' : undefined }));
  const kesildi = suzulen !== undefined && suzulen.length > EN_COK_SATIR;

  return (
    <section className="sa-fason-grafik" aria-label="Fason süre ve termin grafikleri">
      {veri !== undefined && (firmaSecenekleri.length > 0 || malzemeSecenekleri.length > 0) && (
        <div className="sa-fason-suzgec">
          <Secim etiket="Firma" bosSecenek="Tüm firmalar" secenekler={firmaSecenekleri} value={firma} onChange={(e) => firmaYaz(e.target.value)} />
          <Secim etiket="Malzeme" bosSecenek="Tüm malzemeler" secenekler={malzemeSecenekleri} value={malzeme} onChange={(e) => malzemeYaz(e.target.value)} />
        </div>
      )}
      <div className="sa-fason-kartlar">
        <CubukListesiKarti
          baslik="Gerçekleşen fason süresi" simge="clock" birim="gün" satirlar={sureSatirlari} hata={l.isError}
          altMetin={`Son ${FASON_SON_GUN} gün; ilk gidişten son dönüşe ortalama${kesildi ? `; en uzun ${EN_COK_SATIR} kırılım` : ''}.`}
        />
        <CubukListesiKarti
          baslik="Fason termin uyumu" simge="flag" birim="gün" satirlar={uyumSatirlari} hata={l.isError}
          altMetin="Gerçek teslim - termin; artı değer gecikme, eksi değer erken teslim. Termin günü olmayan iş dışarıda."
        />
      </div>
    </section>
  );
}
