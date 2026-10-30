import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OkutCozCevabi, SepetCevabi, SepetEkleGovdesi, SepetSatiri, SepetTeslimEtCevabi, SepetTeslimEtGovdesi, TasimaGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Girdi, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KONUM_ETIKETI, miktarGirdisi, miktarMetni } from './gorunum.ts';
import { birakmaHedefi, ELDEN_NOTU, kisiHedefiMi, sepetTasinir, type OkutHedefi } from './okut-akisi.ts';
import { hataMetni, korumaliPost, useIslem, useStokKomutu } from './ortak.tsx';
import './stok.css';

// Taşıma sepeti (1338 a): kişinin sunucudaki sepetidir (Soru 133); depo sepetiyle aynı satırlar, aynı önbellek. Art arda okutulan
// malzeme buraya düşer; sepet doluyken okutulan yer bırakma hedefi olur. Sepet stok ayırmaz (1342 a): bırakırken sunucu yeniden denetler.
export const SEPET_ANAHTARI = [...anahtarlar.hepsi, 'sepet'] as const;
export function useTasimaSepeti(acik = true) {
  return useQuery({ queryKey: SEPET_ANAHTARI, queryFn: () => api.get<SepetCevabi>('/stok/sepet'), enabled: acik });
}
// Sepet miktarı üç ondalıklıdır; kalan kayan nokta hatası taşımasın diye bindelikle hesaplanır.
const kalanMiktar = (sepette: string, giden: string): string => String(Math.round(Number(sepette) * 1000 - Number(giden) * 1000) / 1000);
export function useSepeteAt(sonra?: () => void) {
  return useStokKomutu((g: SepetEkleGovdesi) => korumaliPost<SepetCevabi>('/stok/sepet/satir-ekle', g), 'Sepete atıldı.', sonra);
}

const satirAdi = (s: SepetSatiri): string => s.malzemeAd ?? s.malzemeKod ?? `Malzeme #${s.malzemeId}`;
const kaynakMetni = (s: SepetSatiri): string =>
  [s.kaynakKonumKod ? `${s.kaynakKonumKod}'den` : null, s.refakat?.etiket ?? s.partiEtiketi].filter(Boolean).join(' · ');
const hedefMetni = (h: OkutHedefi): string =>
  (kisiHedefiMi(h) ? `${h.alici.ad ?? 'Okutulan kişi'} · ${h.istasyon.ad}` : `${h.ad ?? h.kod} · ${KONUM_ETIKETI[h.tur]}`);

// Panelin altındaki şerit: sepet her ekranda görünür; dokununca satırlar açılır, satır çıkarılır.
export function SepetSeridi({ satirlar }: { satirlar: SepetSatiri[] }) {
  const [acik, setAcik] = useState(false);
  const cikar = useStokKomutu((g: { id: number }) => api.post<SepetCevabi>(`/stok/sepet/satirlar/${g.id}/sil`, {}), 'Sepetten çıkarıldı.');
  if (satirlar.length === 0) return null;
  return (
    <section className="tc-stok-sepet-serit" aria-label="Taşıma sepetim">
      <button type="button" className="tc-stok-sepet-serit-bas" aria-expanded={acik} onClick={() => setAcik((a) => !a)}>
        <Simge ad="cart" />
        <strong>Taşıma sepetim</strong>
        <span className="tc-stok-sepet-sayi">{satirlar.length}</span>
        <span className="tc-stok-not">{acik ? 'Kapat' : 'Bırakmak için yeri okut'}</span>
      </button>
      {acik && (
        <ul className="tc-stok-satirlar" aria-label="Sepetteki kalemler">
          {satirlar.map((s) => (
            <li key={s.id}>
              <span><strong>{satirAdi(s)}</strong> <span className="tc-stok-mono">{kaynakMetni(s)}</span></span>
              <strong>{miktarMetni(s.miktar)}</strong>
              <Dugme simge="x" aria-label={`${satirAdi(s)} sepetten çıkar`} yukleniyor={cikar.komut.isPending && cikar.komut.variables?.id === s.id}
                onClick={() => cikar.komut.mutate({ id: s.id })} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Bırakma (1338 a): okutulan yer ya da kişi hedeftir; satırlar işaretli ve tam miktarla gelir. İşareti kaldırılan ya da azaltılan
// satırın kalanı sepette kalır (parçalı bırakma). Her satır ayrı kayıttır; biri reddedilirse ötekiler yazılmış kalır ve nedeni söylenir.
interface Secim { secili: boolean; miktar: string }
const tamMiktar = (s: SepetSatiri): string => miktarMetni(s.miktar).replace(/\./g, '');
export function Birakma({ hedef, satirlar, bitti, vazgec }: { hedef: OkutHedefi; satirlar: SepetSatiri[]; bitti: (metin: string) => void; vazgec: () => void }) {
  const depocu = useIslem('stok.transfer');
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [secim, setSecim] = useState<Record<number, Secim>>(() => Object.fromEntries(satirlar.map((s) => [s.id, { secili: true, miktar: tamMiktar(s) }])));
  const [kimlik, setKimlik] = useState(yeniIstekKimligi);
  const [reddedilen, setReddedilen] = useState<string[]>([]);
  const ayar = (id: number, d: Partial<Secim>) => setSecim((x) => ({ ...x, [id]: { ...(x[id] ?? { secili: false, miktar: '' }), ...d } }));
  const secilen = satirlar.filter((s) => secim[s.id]?.secili && (secim[s.id]?.miktar.trim() ?? '') !== '');
  const birak = useMutation({
    mutationFn: async () => {
      const teslim: SepetTeslimEtGovdesi['satirlar'] = [];
      const kayitlar: string[] = [], hatalar: string[] = [];
      for (const s of secilen) {
        const m = miktarGirdisi(secim[s.id]!.miktar);
        const tamami = m === miktarGirdisi(tamMiktar(s));
        if (kisiHedefiMi(hedef) || !sepetTasinir(depocu, s.refakat != null, hedef) || s.kaynakKonumId === null) {
          teslim.push({ satirId: s.id, hedef: birakmaHedefi(hedef), ...(tamami ? {} : { miktar: m }) });
          continue;
        }
        // Depo içi taşıma onay beklemez (Yerleştir ile aynı uç); sepet satırı sonra düşer ya da azalır.
        try {
          const g: TasimaGovdesi = { malzemeId: s.malzemeId, kaynakKonumId: s.kaynakKonumId, partiId: s.partiId, hedefKonumId: hedef.konumId, miktar: m, aciklama: 'Taşıma sepeti' };
          await korumaliPost('/stok/tasima', g);
          if (tamami) await api.post(`/stok/sepet/satirlar/${s.id}/sil`, {});
          else await api.post(`/stok/sepet/satirlar/${s.id}/degistir`, { miktar: kalanMiktar(s.miktar, m) });
          kayitlar.push(satirAdi(s));
        } catch (h) { hatalar.push(`${satirAdi(s)}: ${hataMetni(h)}`); }
      }
      if (teslim.length > 0) {
        const c = await korumaliPost<SepetTeslimEtCevabi>('/stok/sepet/gonder', {
          satirlar: teslim, kaynakKimligi: kimlik, aliciKodu: kisiHedefiMi(hedef) ? hedef.alici.kod : null,
        } satisfies SepetTeslimEtGovdesi);
        for (const t of c.teslimler) kayitlar.push(t.teslimNo);
        for (const k of c.kalanlar) hatalar.push(`${satirAdi(satirlar.find((s) => s.id === k.satirId) ?? satirlar[0]!)}: ${k.neden}`);
      }
      return { kayitlar, hatalar };
    },
    onSuccess: ({ kayitlar, hatalar }) => {
      setKimlik(yeniIstekKimligi());
      setReddedilen(hatalar);
      const metin = `${kayitlar.length} kalem ${hedefMetni(hedef)} yerine bırakıldı.`;
      if (hatalar.length === 0) { bildir('tamam', metin); bitti(metin); } else bildir('hata', `${metin} ${hatalar.length} kalem bırakılamadı.`);
    },
    onError: (h) => bildir('hata', hataMetni(h)),
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }),
  });
  return (
    <form className="tc-stok-form tc-stok-birakma" onSubmit={(o) => { o.preventDefault(); if (secilen.length > 0) birak.mutate(); }}>
      <div className="tc-stok-birakma-hedef">
        <Simge ad="pin" />
        <div><strong>Buraya bırak: {hedefMetni(hedef)}</strong>{kisiHedefiMi(hedef) && <span className="tc-stok-not">{ELDEN_NOTU(hedef.alici.ad)}</span>}</div>
      </div>
      <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Bırakılacaklar">
        {satirlar.map((s) => {
          const x = secim[s.id] ?? { secili: false, miktar: '' };
          const parcali = x.secili && x.miktar.trim() !== '' && Number(miktarGirdisi(x.miktar)) < Number(s.miktar);
          return (
            <li key={s.id} className="tc-stok-is tc-stok-birakma-satir" data-secili={x.secili ? '' : undefined}>
              <label className="tc-stok-birakma-sec">
                <input type="checkbox" checked={x.secili} onChange={(o) => ayar(s.id, { secili: o.target.checked })} />
                <span><strong>{satirAdi(s)}</strong><span className="tc-stok-mono">{kaynakMetni(s)} · sepette {miktarMetni(s.miktar)}</span>
                  {parcali && <span className="tc-stok-not">Parçalı: kalan sepette kalır</span>}</span>
              </label>
              <Girdi etiket="Miktar" inputMode="decimal" value={x.miktar} disabled={!x.secili} onChange={(o) => ayar(s.id, { miktar: o.target.value })} />
            </li>
          );
        })}
      </ul>
      {reddedilen.length > 0 && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{reddedilen.join(' · ')}</p>}
      <div className="tc-stok-eylem">
        <Dugme tur="birincil" type="submit" simge="check" yukleniyor={birak.isPending} disabled={secilen.length === 0}>{secilen.length} kalemi bırak</Dugme>
        <Dugme simge="back" onClick={vazgec}>Başka yer okut</Dugme>
      </div>
    </form>
  );
}

// Başkasının sepetindeki miktar (1342 a): yalnız bilgi, stok ayrılmaz.
export function BaskaSepetler({ c, konumId, malzemeId }: { c: OkutCozCevabi; konumId?: number; malzemeId?: number }) {
  const liste = ('baskaSepetler' in c ? c.baskaSepetler ?? [] : [])
    .filter((x) => (konumId === undefined || x.konumId === konumId) && (malzemeId === undefined || x.malzemeId === malzemeId));
  if (liste.length === 0) return null;
  return (
    <p className="tc-stok-not" role="note">
      {liste.map((x) => <Rozet key={`${x.konumId}-${x.malzemeId}-${x.partiId ?? 0}-${x.kisiAd ?? ''}`} ton="bilgi">{x.kisiAd ?? 'Başka biri'} sepetinde · {miktarMetni(x.miktar)}</Rozet>)}
    </p>
  );
}
