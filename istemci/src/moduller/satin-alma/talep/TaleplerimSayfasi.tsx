import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { OnTalep } from '#paylasilan/sozlesme/satin-alma.ts';
import { Sekmeler, type Sekme } from '../../../ortak/arayuz/index.ts';
import { OnTalepler } from './OnTalepler.tsx';
import { TalepAc } from './TalepAc.tsx';
import { HEPSI, Taleplerim, suzgeceUyar, type DurumSuzgeci } from './Taleplerim.tsx';
import { SURE, anahtarlar, cagri } from './ortak.ts';
import './talep.css';

type Bolum = 'on' | 'liste' | 'yeni';

// 898 a: Taleplerim üç bölümdür: sistemin önerdiği ön talepler, açılan talepler ve yeni talep. Ön talep "Talebe çevir" ile formu doldurur.
// Özet kutuları listeyi o duruma süzer. Sayılar talep listesinden (en çok 500 talep) ve ön talep ucundan gelir.
export function TaleplerimSayfasi() {
  const [bolum, bolumYaz] = useState<Bolum>('on');
  const [taslak, taslakYaz] = useState<readonly OnTalep[] | null>(null);
  const [suzgec, suzgecYaz] = useState<DurumSuzgeci>('acik');
  // Ctrl K komutu ve arama sonucu (1237) bölümü adresle seçer; adres temizlenir ki geri gelince bölüm yeniden zorlanmasın.
  const [adres, adresYaz] = useSearchParams();
  useEffect(() => {
    const istenen = adres.get('bolum');
    if (istenen !== 'yeni' && istenen !== 'liste') return;
    bolumYaz(istenen);
    adresYaz({}, { replace: true });
  }, [adres, adresYaz]);
  const on = useQuery({ queryKey: anahtarlar.onTalepler, queryFn: () => cagri.get('/satin-alma-on-talepleri', SURE) });
  const talepler = useQuery({ queryKey: anahtarlar.taleplerim(HEPSI), queryFn: () => cagri.get('/satin-alma-taleplerim', { sorgu: { sinir: HEPSI }, ...SURE }) });
  const say = (s: DurumSuzgeci) => talepler.data?.talepler.filter((t) => suzgeceUyar(t, s)).length;
  const onSayisi = on.data?.onTalepler.length;
  const sekmeler: Sekme<Bolum>[] = [
    { anahtar: 'on', baslik: 'Ön talepler', simge: 'rotate', ...(onSayisi === undefined ? {} : { sayi: onSayisi }) },
    { anahtar: 'liste', baslik: 'Taleplerim', simge: 'list' },
    { anahtar: 'yeni', baslik: 'Yeni talep', simge: 'plus' },
  ];
  const ozet: readonly [string, number | undefined, () => void][] = [
    ['Ön talep bekliyor', onSayisi, () => bolumYaz('on')],
    ...(['satin', 'onay', 'siparis'] as const).map((s): [string, number | undefined, () => void] => [
      { satin: 'Satın almada', onay: 'Onayda', siparis: 'Sipariş verildi' }[s], say(s), () => { suzgecYaz(s); bolumYaz('liste'); }]),
  ];
  return (
    <div className="sa-talep">
      <div className="sa-talep-ozet" role="group" aria-label="Özet">
        {ozet.map(([ad, sayi, git]) => (
          <button key={ad} type="button" className="sa-talep-ozet-kutu" onClick={git}>
            <b>{sayi === undefined ? '…' : sayi.toLocaleString('tr-TR')}</b>
            <span>{ad}</span>
          </button>
        ))}
      </div>
      <Sekmeler etiket="Taleplerim bölümleri" sekmeler={sekmeler} secili={bolum} sec={bolumYaz} />
      {bolum === 'on' && <OnTalepler cevir={(l) => { taslakYaz(l); bolumYaz('yeni'); }} />}
      {bolum === 'liste' && <Taleplerim tam suzgec={suzgec} suzgecYaz={suzgecYaz} />}
      {/* Form bölüm değişse de bağlı kalır ki yarım kalan talep kaybolmasın. */}
      <div hidden={bolum !== 'yeni'}>
        <TalepAc taslak={taslak} taslakBitti={(gonderildi) => { taslakYaz(null); bolumYaz(gonderildi ? 'liste' : 'on'); suzgecYaz('acik'); }} />
      </div>
    </div>
  );
}
