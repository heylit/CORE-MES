import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { MalzemeFisiAyrintiCevabi, MalzemeFisiGonderGovdesi, MalzemeFisiOzeti, MalzemeFisiSatiri } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Kart, OnayPenceresi, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { HareketTablosu } from './Hareketler.tsx';
import { FisTuruRozeti, LogoDurumRozeti, kaynakMetni } from './MalzemeFisleri.tsx';
import { FIS_GONDERIM_ETIKETI, MALZEME_FISI_ETIKETI, miktarMetni, zamanMetni } from './gorunum.ts';
import { SayfaBasi, hataMetni, useIslem } from './ortak.tsx';
import './stok.css';

const satirSutunlari = (ambar: boolean): Sutun<MalzemeFisiSatiri>[] => [
  { anahtar: 'kod', baslik: 'Stok kodu', mono: true, hucre: (s) => s.stokKodu ?? <Rozet ton="hata">Kart kodu yok</Rozet> },
  { anahtar: 'ad', baslik: 'Malzeme', hucre: (s) => s.malzemeAd ?? `Kart ${s.malzemeId}` },
  ...(ambar ? [{ anahtar: 'ambar', baslik: 'Ambar', mono: true, hucre: (s: MalzemeFisiSatiri) => `${s.kaynakAmbarNo ?? '—'} → ${s.hedefAmbarNo ?? '—'}` }] : []),
  { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (s) => <strong>{miktarMetni(s.miktar)}</strong> },
  { anahtar: 'birim', baslik: 'Birim', hucre: (s) => s.birim ?? <Rozet ton="hata">Birim yok</Rozet> },
  { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (s) => s.aciklama ?? '—' },
];

// Fişin Logo durumu Logo modülündedir; ekran gösterir. Gönder yalnız elle türde bekleyen ya da hatalı fişte görünür (295 a).
export function MalzemeFisi() {
  const id = Number(useParams().id);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const gonderebilir = useIslem('stok.malzeme-fisi-gonder');
  const [onay, setOnay] = useState(false);
  const f = useQuery({ queryKey: anahtarlar.ayrinti('malzeme-fisi', id), queryFn: () => api.get<MalzemeFisiAyrintiCevabi>(`/stok/malzeme-fisleri/${id}`) });
  const gonder = useMutation({
    mutationFn: (g: MalzemeFisiGonderGovdesi) => api.post<MalzemeFisiOzeti>(`/stok/malzeme-fisleri/${id}/gonder`, g),
    onSuccess: async () => { setOnay(false); bildir('tamam', 'Fiş yeniden sıraya alındı.'); await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); },
    onError: (hata) => { setOnay(false); bildir('hata', hataIletisi(hata, 'Gönderilemedi. Bağlantıyı kontrol edip yeniden deneyin.')); },
  });
  if (f.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (f.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(f.error)} yenile={() => void f.refetch()} />;
  const x = f.data.fis;
  const hatali = x.logo.durum === 'hata';
  return (
    <section className="tc-stok">
      <SayfaBasi baslik={`${MALZEME_FISI_ETIKETI[x.tur]} fişi ${x.no}`} alt={zamanMetni(x.acilis)}
        sag={gonderebilir && x.gonderilebilir ? <Dugme tur="birincil" simge="rotate" onClick={() => setOnay(true)}>{hatali ? 'Yeniden gönder' : 'Gönder'}</Dugme> : undefined} />
      <Kart baslik="Fiş">
        <div className="tc-stok-form">
          <p><strong>Tür:</strong> <FisTuruRozeti tur={x.tur} /></p>
          <p><strong>Kaynak:</strong> {kaynakMetni(x)}</p>
          <p><strong>TMI:</strong> {x.satirSayisi === 0 ? 'Boş' : `${x.satirSayisi} satır`}</p>
          <p><strong>Logo:</strong> <LogoDurumRozeti logo={x.logo} />{x.logo.gonderimSekli !== null && ` · ${FIS_GONDERIM_ETIKETI[x.logo.gonderimSekli]}`}</p>
          {x.logo.kayitNo !== null && <p><strong>Logo kayıt no:</strong> {x.logo.kayitNo}</p>}
          {x.logo.neden !== null && <p><strong>{hatali ? 'Son hata' : 'Not'}:</strong> {x.logo.neden}</p>}
          {x.gonderimIstegi !== null && <p><strong>Son gönderim isteği:</strong> {zamanMetni(x.gonderimIstegi)}</p>}
        </div>
      </Kart>
      <Kart baslik="Satırlar">
        <Tablo etiket="Fiş satırları" sutunlar={satirSutunlari(x.tur === 'ambar')} satirlar={f.data.satirlar} satirAnahtari={(s) => `${s.malzemeId}-${s.aciklama ?? ''}-${s.kaynakAmbarNo ?? ''}-${s.hedefAmbarNo ?? ''}`} bosMesaj="Fişte satır yok; boş fiş Logo'ya gitmez." />
      </Kart>
      <Kart baslik="Hareketler">
        <HareketTablosu satirlar={f.data.hareketler} />
      </Kart>
      <Kart baslik="Logo geçmişi">
        <div className="tc-stok-form">
          <p><strong>Deneme:</strong> {x.logo.denemeSayisi}</p>
          <p><strong>Ardışık hata:</strong> {x.logo.ardisikHata}</p>
          <p><strong>Son deneme:</strong> {zamanMetni(x.logo.sonDeneme)}</p>
          <p><strong>Sonraki deneme:</strong> {zamanMetni(x.logo.sonrakiDeneme)}</p>
        </div>
      </Kart>
      <OnayPenceresi acik={onay} baslik={hatali ? 'Fişi yeniden gönder' : 'Fişi Logo\'ya gönder'} onayMetni={hatali ? 'Yeniden gönder' : 'Gönder'} yukleniyor={gonder.isPending}
        onayla={() => gonder.mutate({ surum: x.surum })} vazgec={() => setOnay(false)}>
        <p>Fiş sıraya alınır; Logo işi sonraki turunda gönderir.{hatali && ' Sonucu bilinmeyen bir deneme varsa önce Logo\'da fişin açılmadığını kontrol edin: fiş iki kez açılabilir.'}</p>
      </OnayPenceresi>
    </section>
  );
}
