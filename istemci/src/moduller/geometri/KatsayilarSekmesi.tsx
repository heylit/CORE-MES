import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GeometriKalibrasyonCevabi, GeometriSureKatsayilariCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { DurumKutusu, Dugme, Girdi, Kart, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKorumaliKomut } from '../../ortak/veri/korumali-komut.ts';
import { zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import { katsayiMetni } from './gorunum.ts';
import { useKaliteSecenekleri } from './ham-secimi.ts';
import { KATSAYI_BOLUMLERI, katsayiAdi, katsayiSatirlari, olcumFarki } from './kalibrasyon.ts';
import type { KatsayiSatiri, OlcumFarki } from './kalibrasyon.ts';

export function useSureKatsayilari() {
  return useQuery({ queryKey: anahtarlar.katsayilar(), queryFn: () => api.get<GeometriSureKatsayilariCevabi>('/geometri/sure-katsayilari') });
}

const KAYNAK: Readonly<Record<KatsayiSatiri['kaynak'], { ad: string; ton: RozetTonu }>> = {
  kaynakli: { ad: 'Kaynaklı', ton: 'tamam' }, tahmin: { ad: 'Tahmin', ton: 'uyari' }, elle: { ad: 'Elle', ton: 'bilgi' },
};
const SIMGE = { malzeme: 'layers', tasarim: 'ruler', geometri: 'box' } as const;
const sayi = (x: number): string => katsayiMetni(x);
const ondalik = (metin: string): number => Number(metin.trim().replace(',', '.'));

// Aynı ölçüm grubundaki (ör. ISO S) bütün satırların farkı tek uyarıdır: grubun son satırının altında, bütün sınıfların yeni değerleriyle.
type GrupFarki = OlcumFarki & { satirlar: { baslik: string; yeni: OlcumFarki['yeni'] }[] };
function grupFarklari(satirlar: readonly KatsayiSatiri[], gruplar: GeometriKalibrasyonCevabi['gruplar']): Map<string, GrupFarki> {
  const gruba = new Map<string, { son: string; fark: GrupFarki }>();
  for (const s of satirlar) {
    const f = olcumFarki(s, gruplar);
    if (f === null) continue;
    const g = gruba.get(f.grup);
    if (g === undefined) gruba.set(f.grup, { son: s.kimlik, fark: { ...f, satirlar: [{ baslik: s.baslik, yeni: f.yeni }] } });
    else {
      g.son = s.kimlik;
      g.fark = { ...g.fark, yeni: [...g.fark.yeni, ...f.yeni], satirlar: [...g.fark.satirlar, { baslik: s.baslik, yeni: f.yeni }] };
    }
  }
  return new Map([...gruba.values()].map((g) => [g.son, g.fark]));
}

type Yazim = { tur: 'yaz'; degerler: { anahtar: string; deger: number }[]; not: string | null } | { tur: 'don'; anahtarlar: string[] };

// Kalibrasyon sayfasının "Başlangıç katsayıları" sekmesi (3363, ön izleme 2A): malzeme, tasarım ve geometri tabloları, kaynak rozeti,
// satır içi düzenleme ve yerleşiğe dönme. Yazma geometri.kalibrasyon ister; okuyan yalnız tabloyu görür.
export function KatsayilarSekmesi({ k, yazar }: { k: GeometriKalibrasyonCevabi; yazar: boolean }) {
  const sorgu = useSureKatsayilari();
  const kaliteler = useKaliteSecenekleri();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [duzenlenen, duzenlenenYaz] = useState<string | null>(null);
  const sinifAdlari = useMemo(() => new Map((kaliteler.data ?? []).map((q) => [q.sinif, q.sinifAdi])), [kaliteler.data]);
  const komut = useKorumaliKomut<Yazim, GeometriSureKatsayilariCevabi>({
    gonder: (g, d) => (g.tur === 'yaz'
      ? api.post<GeometriSureKatsayilariCevabi>('/geometri/sure-katsayilari/yaz', { degerler: g.degerler, not: g.not }, d)
      : api.post<GeometriSureKatsayilariCevabi>('/geometri/sure-katsayilari/yerlesige-don', { anahtarlar: g.anahtarlar }, d)),
    onSuccess: (c, g) => {
      istemci.setQueryData(anahtarlar.katsayilar(), c);
      void istemci.invalidateQueries({ queryKey: ['geometri', 'sure'] });
      void istemci.invalidateQueries({ queryKey: anahtarlar.kalibrasyon() });
      duzenlenenYaz(null);
      bildir('tamam', g.tur === 'yaz' ? 'Katsayı kaydedildi; tahminler yeniden hesaplanır.' : 'Yerleşik değere dönüldü.');
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Katsayı yazılamadı.')),
  });
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Katsayılar okunamadı.')} yenile={() => { void sorgu.refetch(); }} />;
  const l = sorgu.data.katsayilar;
  return (
    <>
      {KATSAYI_BOLUMLERI.map((b) => {
        const satirlar = katsayiSatirlari(l, b.turler, sinifAdlari);
        const farklar = grupFarklari(satirlar, k.gruplar);
        return (
          <Kart key={b.kimlik} baslik={b.baslik} simge={SIMGE[b.kimlik]} sag={b.kimlik === 'malzeme' ? <Rozet ton="pasif">{String(satirlar.length)} sınıf</Rozet> : undefined}>
            <table className="tc-g3b-su-tablo tc-g3b-ks-tablo">
              <thead>
                <tr>
                  <th scope="col">{b.kimlik === 'malzeme' ? 'Sınıf' : 'Katsayı'}</th>
                  {b.kimlik === 'malzeme'
                    ? <><th scope="col">Kaba</th><th scope="col">Finiş</th></>
                    : <th scope="col">Değerler</th>}
                  <th scope="col" className="tc-g3b-ks-genis">Kaynak</th>
                  <th scope="col" className="tc-g3b-ks-genis">Dayanak</th>
                  {yazar && <th scope="col"><span className="tc-gizli-etiket">İşlem</span></th>}
                </tr>
              </thead>
              <tbody>
                {satirlar.map((s) => {
                  const fark = farklar.get(s.kimlik) ?? null;
                  const elle = s.katsayilar.filter((x) => x.elle !== null).map((x) => x.anahtar);
                  return (
                    <SatirGrubu key={s.kimlik} s={s} fark={fark} yazar={yazar} bekliyor={komut.isPending} sinifAdlari={sinifAdlari}
                      acik={duzenlenen === s.kimlik} ac={() => { duzenlenenYaz(duzenlenen === s.kimlik ? null : s.kimlik); }}
                      don={elle.length === 0 ? null : () => { komut.mutate({ tur: 'don', anahtarlar: elle }); }}
                      yaz={(degerler, not) => { komut.mutate({ tur: 'yaz', degerler, not }); }} />
                  );
                })}
              </tbody>
            </table>
            {b.kimlik === 'geometri' && (
              <p className="tc-g3b-soluk">
                Kaynaklar: Engineering ToolBox ve Machining Doctor işlenebilirlik tabloları; Armillotta 2021 (J Intell Manuf); Makino 2021 tarama;
                Modus Advanced 2026. Ölçülmüş parça geldikçe kalibrasyon bu değerlerin üstüne düzeltir.
              </p>
            )}
          </Kart>
        );
      })}
    </>
  );
}

function SatirGrubu({ s, fark, yazar, bekliyor, sinifAdlari, acik, ac, don, yaz }: {
  s: KatsayiSatiri; fark: GrupFarki | null; yazar: boolean; bekliyor: boolean; sinifAdlari: ReadonlyMap<string, string>;
  acik: boolean; ac: () => void; don: (() => void) | null; yaz: (degerler: { anahtar: string; deger: number }[], not: string | null) => void;
}) {
  const kaynak = KAYNAK[s.kaynak];
  const son = s.katsayilar.flatMap((x) => (x.elle === null ? [] : [x.elle])).sort((a, b) => b.zaman.localeCompare(a.zaman))[0];
  const dayanak = son === undefined ? s.dayanak : `${s.not ?? s.dayanak} · ${son.kisi ?? 'Bilinmeyen kişi'}, ${zamanMetni(son.zaman)}`;
  const malzeme = s.iso !== null || s.kimlik.startsWith('malzeme:');
  const malzemeDegeri = (ad: 'kaba' | 'finis'): string => {
    const x = s.katsayilar.find((y) => y.anahtar.startsWith(`malzeme.${ad}.`));
    return x === undefined ? '-' : `×${sayi(x.deger)}`;
  };
  const degerler = s.katsayilar.map((x) => `${katsayiAdi(x.anahtar, sinifAdlari)} ${x.tur === 'tutma' || x.tur === 'kesme' ? sayi(x.deger) : `×${sayi(x.deger)}`}`).join(' · ');
  const kolon = (yazar ? 5 : 4) + (malzeme ? 1 : 0);
  return (
    <>
      <tr>
        <td>
          {s.baslik}{s.iso !== null && <span className="tc-g3b-soluk"> · {s.iso}</span>}
          <span className="tc-g3b-ks-dar"><br /><Rozet ton={kaynak.ton}>{kaynak.ad}</Rozet><br /><span className="tc-g3b-soluk">{dayanak}</span></span>
        </td>
        {malzeme ? <><td className="tc-g3b-su-deger">{malzemeDegeri('kaba')}</td><td className="tc-g3b-su-deger">{malzemeDegeri('finis')}</td></> : <td>{degerler}</td>}
        <td className="tc-g3b-ks-genis"><Rozet ton={kaynak.ton}>{kaynak.ad}</Rozet></td>
        <td className="tc-g3b-ks-genis">{dayanak}</td>
        {yazar && (
          <td>
            {don !== null
              ? <Dugme tur="ikincil" simge="rotate" disabled={bekliyor} onClick={don} aria-label={`${s.baslik}: yerleşiğe dön`}><span className="tc-g3b-ks-genis">Yerleşiğe dön</span></Dugme>
              : <Dugme tur="ikincil" simge="edit" aria-expanded={acik} onClick={ac} aria-label={`${s.baslik}: düzenle`}><span className="tc-g3b-ks-genis">Düzenle</span></Dugme>}
          </td>
        )}
      </tr>
      {fark !== null && (
        <tr className="tc-g3b-ks-fark">
          <td colSpan={kolon}>
            <p className="tc-g3b-su-uyari">
              <Simge ad="alert" />
              <span>
                Ölçüm farklı: {fark.grup} ×{sayi(fark.carpan)} ({String(fark.n)} parça){fark.satirlar.length > 1 ? `; gruptaki ${String(fark.satirlar.length)} sınıf` : ''}.
                {yazar && <> <button type="button" className="tc-g3b-ka-bag" disabled={bekliyor}
                  onClick={() => { yaz(fark.yeni, `Ölçümle güncellendi: ${fark.grup} ×${sayi(fark.carpan)}, ${String(fark.n)} parça`); }}>
                  {fark.satirlar.length > 1 ? `${String(fark.satirlar.length)} sınıfı bu çarpanla güncelle` : `Bu çarpanla güncelle (${fark.yeni.map((y) => `×${sayi(y.deger)}`).join(' · ')})`}
                </button></>}
              </span>
            </p>
            {fark.satirlar.length > 1 && (
              <p className="tc-g3b-soluk">Yeni değerler: {fark.satirlar.map((x) => `${x.baslik} ${x.yeni.map((y) => `×${sayi(y.deger)}`).join(' · ')}`).join('; ')}</p>
            )}
          </td>
        </tr>
      )}
      {acik && (
        <tr>
          <td colSpan={kolon}><Duzenleyici s={s} sinifAdlari={sinifAdlari} bekliyor={bekliyor} vazgec={ac} yaz={yaz} /></td>
        </tr>
      )}
    </>
  );
}

function Duzenleyici({ s, sinifAdlari, bekliyor, vazgec, yaz }: {
  s: KatsayiSatiri; sinifAdlari: ReadonlyMap<string, string>; bekliyor: boolean; vazgec: () => void;
  yaz: (degerler: { anahtar: string; deger: number }[], not: string | null) => void;
}) {
  const [metinler, metinlerYaz] = useState<Record<string, string>>(() => Object.fromEntries(s.katsayilar.map((x) => [x.anahtar, sayi(x.deger)])));
  const [not, notYaz] = useState(s.not ?? '');
  const hatali = s.katsayilar.filter((x) => !Number.isFinite(ondalik(metinler[x.anahtar] ?? '')));
  const degisen = s.katsayilar.flatMap((x) => {
    const d = ondalik(metinler[x.anahtar] ?? '');
    return Number.isFinite(d) && Math.abs(d - x.deger) > 1e-9 ? [{ anahtar: x.anahtar, deger: d }] : [];
  });
  return (
    <form className="tc-g3b-ks-duzen" onSubmit={(o) => { o.preventDefault(); if (hatali.length === 0 && degisen.length > 0) yaz(degisen, not.trim() === '' ? null : not.trim()); }}>
      <p className="tc-g3b-su-etiket">{s.baslik} düzenleniyor</p>
      <div className="tc-g3b-ks-alanlar">
        {s.katsayilar.map((x) => (
          <Girdi key={x.anahtar} etiket={katsayiAdi(x.anahtar, sinifAdlari)} inputMode="decimal" value={metinler[x.anahtar] ?? ''}
            ipucu={`Yerleşik ${sayi(x.yerlesik)}`} hata={hatali.includes(x) ? 'Sayı girin.' : undefined}
            onChange={(o) => { metinlerYaz({ ...metinler, [x.anahtar]: o.target.value }); }} />
        ))}
        <Girdi etiket="Not" value={not} maxLength={200} ipucu="En çok 200 harf" onChange={(o) => { notYaz(o.target.value); }} />
      </div>
      <div className="tc-g3b-ks-eylem">
        <Dugme type="submit" disabled={bekliyor || hatali.length > 0 || degisen.length === 0}>Kaydet</Dugme>
        <Dugme tur="ikincil" type="button" onClick={vazgec}>Vazgeç</Dugme>
        <span className="tc-g3b-soluk">Bu katsayıyı kullanan bütün parçaların tahmini değişir.</span>
      </div>
    </form>
  );
}
