import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { TezgahEslemeCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { Dugme, Kart, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { GOLGE_NOTU, SorguDurumu } from './deneme-ortak.tsx';
import { gunSaatMetni } from './gosterim.ts';
import './tezgah-baglantisi.css';

type Cihaz = TezgahEslemeCevabi['cihazlar'][number];
type Taslak = { makineId: string; cevrimdeParca: string; durusEsigiDk: string };

const ANAHTAR = ['tezgah-baglantisi', 'deneme', 'esleme'] as const;
const KAYNAK = { mtconnect: 'MTConnect', lsv2: 'Heidenhain LSV2' } as const;

function durum(c: Cihaz) {
  if (c.makineId !== null) return <Rozet ton="tamam">Onaylı</Rozet>;
  if (c.oneriMakineId !== null) return <Rozet ton="uyari">Öneri, onay bekliyor</Rozet>;
  return <Rozet ton="pasif">Eşlenmedi</Rozet>;
}

export function Esleme() {
  const sorgu = useQuery({ queryKey: ANAHTAR, queryFn: () => api.get<TezgahEslemeCevabi>('/tezgah-baglantisi/deneme/esleme') });
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [taslaklar, taslakYaz] = useState<Record<string, Taslak>>({});
  const v = sorgu.data;
  const taslak = (c: Cihaz): Taslak => taslaklar[c.cihazAdi] ?? {
    makineId: String(c.makineId ?? c.oneriMakineId ?? ''), cevrimdeParca: String(c.cevrimdeParca), durusEsigiDk: String(c.durusEsigiDk),
  };
  const degistir = (c: Cihaz, ek: Partial<Taslak>) => taslakYaz((t) => ({ ...t, [c.cihazAdi]: { ...taslak(c), ...ek } }));
  const kaydet = useMutation({
    mutationFn: ({ c, t }: { c: Cihaz; t: Taslak }) => api.post(`/tezgah-baglantisi/deneme/esleme/${encodeURIComponent(c.cihazAdi)}/kaydet`, {
      makineId: t.makineId === '' ? null : Number(t.makineId), cevrimdeParca: Number(t.cevrimdeParca), durusEsigiDk: Number(t.durusEsigiDk),
    }),
    onSuccess: (_c, { c }) => {
      taslakYaz((t) => { const y = { ...t }; delete y[c.cihazAdi]; return y; });
      void istemci.invalidateQueries({ queryKey: ['tezgah-baglantisi', 'deneme'] });
      bildir('tamam', `${c.cihazAdi} eşlemesi kaydedildi`);
    },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Eşleme kaydedilemedi')); },
  });
  const secenekler = (v?.makineler ?? []).map((m) => ({ deger: String(m.id), baslik: `${m.kod} · ${m.ad}` }));

  const sutunlar: Sutun<Cihaz>[] = [
    { anahtar: 'cihaz', baslik: 'Tezgâh', mono: true, kartTamSatir: true, hucre: (c) => <><span>{c.cihazAdi}</span><span className="tc-tzb-alt">{KAYNAK[c.kaynak]}</span></> },
    { anahtar: 'durum', baslik: 'Durum', hucre: durum },
    {
      anahtar: 'makine', baslik: 'CORE makinesi', kartTamSatir: true,
      hucre: (c) => (
        <select className="tc-alan-kutu" aria-label={`${c.cihazAdi} makinesi`} value={taslak(c).makineId} onChange={(o) => degistir(c, { makineId: o.target.value })}>
          <option value="">Eşlenmedi</option>
          {secenekler.map((s) => <option key={s.deger} value={s.deger}>{s.baslik}</option>)}
        </select>
      ),
    },
    {
      anahtar: 'parca', baslik: 'Çevrimde parça',
      hucre: (c) => <input className="tc-alan-kutu tc-tzb-sayi-girdi" aria-label={`${c.cihazAdi} çevrimde parça`} type="number" min={1} max={1000} value={taslak(c).cevrimdeParca} onChange={(o) => degistir(c, { cevrimdeParca: o.target.value })} />,
    },
    {
      anahtar: 'esik', baslik: 'Duruş eşiği (dk)',
      hucre: (c) => <input className="tc-alan-kutu tc-tzb-sayi-girdi" aria-label={`${c.cihazAdi} duruş eşiği`} type="number" min={1} max={240} value={taslak(c).durusEsigiDk} onChange={(o) => degistir(c, { durusEsigiDk: o.target.value })} />,
    },
    { anahtar: 'degisti', baslik: 'Son değişiklik', hucre: (c) => (c.degisti === null ? null : `${gunSaatMetni(c.degisti)} · ${c.degistiren ?? ''}`) },
    {
      anahtar: 'eylem', baslik: '', sabit: 'sag', csv: false,
      hucre: (c) => (
        <Dugme simge="check" yukleniyor={kaydet.isPending && kaydet.variables.c.cihazAdi === c.cihazAdi} onClick={() => kaydet.mutate({ c, t: taslak(c) })}>
          {c.makineId === null && taslak(c).makineId !== '' ? 'Onayla' : 'Kaydet'}
        </Dugme>
      ),
    },
  ];

  return (
    <Kart baslik="Makine eşleme (deneme)">
      <div className="tc-tzb">
        <p className="tc-tzb-not">{GOLGE_NOTU}</p>
        <p className="tc-tzb-not">Her tezgâh cihazı bir CORE makinesine bağlanır. Ad benzerse (“CNC002” ile “CNC-002”) öneri kendiliğinden gelir; onaylanmayan eşleme hiçbir hesapta kullanılmaz. Çevrimde parça sayaç artışını adede çevirir; duruş eşiğinin altındaki beklemeler kısa duruş sayılır.</p>
        <SorguDurumu sorgu={sorgu} baslik="Eşleme" />
        {v && <Tablo etiket="Makine eşleme" sutunlar={sutunlar} satirlar={v.cihazlar} satirAnahtari={(c) => c.cihazAdi} bosMesaj="Henüz okunan tezgâh yok." />}
      </div>
    </Kart>
  );
}
