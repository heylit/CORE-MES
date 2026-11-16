import { Secim } from '../../ortak/arayuz/index.ts';
import type { useHamSecimi } from './ham-secimi.ts';

type HamSecimi = ReturnType<typeof useHamSecimi>;

// 3321-2: Ham kartının Malzeme seçimi. Liste Malzemeler'in yerleşik kaliteleridir (aile ve sınıf sırasıyla); kartlarınızda olup
// tabloda olmayan kalite (özel kalite) sonda. Seçim ham listesini o kaliteye süzer; yoğunluk, ISO grubu ve kesme katsayısı ondan gelir.
// Değer "sinif|kod"dur: aynı kod başka ailede de olabilir.
export function MalzemeSecimi({ secim, kaliteler }: { secim: HamSecimi; kaliteler: readonly string[] }) {
  const l = secim.kaliteSecenekleri ?? [];
  const tablodaki = new Set(l.map((k) => k.kod));
  const ozel = kaliteler.filter((k) => !tablodaki.has(k));
  const m = secim.malzeme;
  const deger = m === null ? '' : `${m.secenek?.sinif ?? ''}|${m.kalite}`;
  const secenekler = [
    ...l.map((k) => ({ deger: `${k.sinif}|${k.kod}`, baslik: `${k.kod} · ${k.sinifAdi}` })),
    ...ozel.map((k) => ({ deger: `|${k}`, baslik: `${k} · kartlarınızdan` })),
  ];
  if (m !== null && !secenekler.some((s) => s.deger === deger)) secenekler.push({ deger, baslik: m.kalite });
  const ipucu = m === null
    ? 'Seçilmedi: bütün kaliteler listelenir; ISO grubu Süre\'de elle seçilir.'
    : m.kaynak === 'rota'
      ? `Rotadaki hammadde kartından: ${m.rotaKodu ?? ''}`
      : m.secenek === null ? 'Kartlarınızdaki kalite; Malzemeler tablosunda yok, ISO grubu Süre\'de elle seçilir.'
        : `${m.secenek.aileAdi} · ${m.secenek.sinifAdi}`;
  return (
    <Secim etiket="Malzeme" value={deger} bosSecenek="Tüm kaliteler" ipucu={ipucu} disabled={secim.kaliteSecenekleri === null}
      secenekler={secenekler}
      onChange={(o) => {
        const [sinif = '', kod = ''] = o.target.value.split('|');
        secim.yaz(o.target.value === '' ? { kalite: '', sinif: null, iso: null, form: null } : { kalite: kod, sinif: sinif === '' ? null : sinif, iso: null, form: null });
      }} />
  );
}
