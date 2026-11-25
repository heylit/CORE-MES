import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HazirlikSablonuCevabi, HazirlikSablonuOzelCevabi, HazirlikSablonuOzelYazGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import { maddeGorunumu, useHazirlikMaddeleri } from './hazirlik-maddeleri.ts';
import './hazirlik-sablonu.css';

// 3688: emre özel hazırlık farkı. Tür şablonu bir maddeyi kapatmış ya da açmışsa bu emirde tersi yazılır; "Şablona dön" farkı kaldırır (kayıt silinmez).
// Yazma yetkisi tür şablonuyla aynıdır (sunucu `yazar` der); yetkisiz kişi yalnız farkları görür.
const ozelAnahtari = (id: number) => ['uretim-emirleri', 'hazirlik-sablonu-ozel', id] as const;

export function EmreOzelSablon({ emirId }: { emirId: number }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const maddeler = useHazirlikMaddeleri();
  const gorunum = maddeGorunumu(maddeler.data?.maddeler);
  const fark = useQuery({ queryKey: ozelAnahtari(emirId), queryFn: () => api.get<HazirlikSablonuOzelCevabi>(`/adimli-emirler/${String(emirId)}/hazirlik-sablonu-ozel`) });
  const sablon = useQuery({ queryKey: ['uretim-emirleri', 'hazirlik-sablonu'], queryFn: () => api.get<HazirlikSablonuCevabi>('/hazirlik-sablonu') });
  const [madde, maddeYaz] = useState('');
  const [gerekli, gerekliYaz] = useState('hayir');
  const [gerekce, gerekceYaz] = useState('');
  const yenile = () => Promise.all([
    istemci.invalidateQueries({ queryKey: ozelAnahtari(emirId) }),
    istemci.invalidateQueries({ queryKey: anahtarlar.adimDurumu(emirId) }),
    istemci.invalidateQueries({ queryKey: anahtarlar.hazirlik(emirId) }),
  ]);
  const yaz = useMutation({
    mutationFn: () => {
      const govde: HazirlikSablonuOzelYazGovdesi = { gerekli: gerekli === 'evet', gerekce: gerekce.trim() };
      return api.put<HazirlikSablonuOzelCevabi>(`/adimli-emirler/${String(emirId)}/hazirlik-sablonu-ozel/${madde}`, govde);
    },
    onSuccess: async () => { bildir('tamam', 'Bu emir için şablon farkı yazıldı.'); gerekceYaz(''); maddeYaz(''); await yenile(); },
    onError: (x) => { bildir('hata', hataIletisi(x, 'Fark yazılmadı.')); },
  });
  const don = useMutation({
    mutationFn: (m: string) => api.post<HazirlikSablonuOzelCevabi>(`/adimli-emirler/${String(emirId)}/hazirlik-sablonu-ozel/${m}/sil`, {}),
    onSuccess: async () => { bildir('tamam', 'Şablona dönüldü.'); await yenile(); },
    onError: (x) => { bildir('hata', hataIletisi(x, 'Şablona dönülemedi.')); },
  });
  if (fark.isPending || fark.isError) return null;
  const yazar = sablon.data?.yazar === true;
  const acik = (maddeler.data?.maddeler ?? []).filter((m) => m.acik);
  const gecerli = madde !== '' && gerekce.trim() !== '';
  return (
    <details className="tc-hs-acilim">
      <summary>{`Bu emirde şablondan farklar${fark.data.farklar.length > 0 ? ` (${String(fark.data.farklar.length)})` : ''}`}</summary>
      <div className="tc-hs">
        {fark.data.farklar.length === 0
          ? <p className="tc-hs-not">Bu emir operasyon türünün şablonunu aynen izliyor.</p>
          : (
            <ul className="tc-hs-liste" aria-label="Emre özel farklar">
              {fark.data.farklar.map((f) => (
                <li key={f.madde} className="tc-hs-fark" data-gerekli={f.gerekli ? '' : 'hayir'}>
                  <span><b>{gorunum.ad(f.madde, f.madde)}</b>: {f.gerekli ? 'bu emirde gerekli' : 'bu emirde gerekmez'}
                    <small className="tc-hs-not tc-hs-blok">{f.kisiAdi ?? ''} · {tarihSaatMetni(f.an)}{f.gerekce ? ` · ${f.gerekce}` : ''}</small></span>
                  {yazar && <Dugme simge="back" yukleniyor={don.isPending} onClick={() => don.mutate(f.madde)}>Şablona dön</Dugme>}
                </li>
              ))}
            </ul>
          )}
        {yazar && (
          <div className="tc-hs-alt">
            <Secim etiket="Madde" value={madde} onChange={(o) => maddeYaz(o.target.value)} bosSecenek="Seçiniz"
              secenekler={acik.map((m) => ({ deger: m.kod, baslik: gorunum.ad(m.kod, m.ad) }))} />
            <Secim etiket="Bu emirde" value={gerekli} onChange={(o) => gerekliYaz(o.target.value)}
              secenekler={[{ deger: 'hayir', baslik: 'Gerekmez' }, { deger: 'evet', baslik: 'Gerekli' }]} />
            <CokSatir etiket="Gerekçe" required rows={2} maxLength={450} value={gerekce} onChange={(o) => gerekceYaz(o.target.value)} />
            <Dugme tur="birincil" simge="check" disabled={!gecerli} yukleniyor={yaz.isPending} onClick={() => yaz.mutate()}>Bu emirde uygula</Dugme>
          </div>
        )}
      </div>
    </details>
  );
}
