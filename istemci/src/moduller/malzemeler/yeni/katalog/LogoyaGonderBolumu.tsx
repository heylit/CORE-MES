import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LogoGecisKartiCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { Dugme, Kart, Rozet } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { LogoyaGonderPenceresi, type GonderAdayi } from '../../LogoMalzemeGecisi.tsx';

// 3632: Logo'ya bağlı kartta CORE'daki açıklamaları Logo'ya gönder. Logo geçişindeki düğmeyle aynı pencere ve aynı ad güncellemesi kuyruğu;
// bağlı olmayan kartta ya da Logo okunmamışken bölüm görünmez.
const FARK_ADLARI = { aciklama_1: 'Açıklama 1', aciklama_2: 'Açıklama 2', aciklama_3: 'Açıklama 3' } as const;

export function LogoyaGonderBolumu({ kimlik, yazar }: { kimlik: string; yazar: boolean }) {
  const istemci = useQueryClient();
  const [acik, acikYaz] = useState(false);
  const anahtar = ['malzemeler', 'logo-gecisi-kart', kimlik];
  const kart = useQuery({ queryKey: anahtar, queryFn: () => api.get<LogoGecisKartiCevabi>(`/malzeme-logo-gecisi/kart/${encodeURIComponent(kimlik)}`) });
  const satir = kart.data?.satir;
  if (!yazar || !kart.data || !satir) return null;
  if (satir.farklar.length === 0 && satir.logoyaGonder.durum === null) return null;
  const { logoyaGonderim } = kart.data;
  const neden = !logoyaGonderim.acik ? logoyaGonderim.neden : !satir.logoyaGonder.gonderilebilir ? "CORE'da dolu açıklama yok; Logo'daki metin silinmez" : null;
  const aday: GonderAdayi = {
    logoKayitNo: satir.logoKayitNo, stokKodu: satir.stokKodu, surum: satir.surum, bagli: true, farklar: satir.farklar, logoyaGonder: satir.logoyaGonder,
  };
  return (
    <Kart baslik="Logo açıklamaları" simge="box" baslikEki={<Rozet ton="uyari" gorunum="cizgi">Logo'dakinden farklı</Rozet>}>
      <div className="tc-mk-logo-gonder">
        {satir.farklar.map((f) => <p key={f.alan} className="tc-mk-logo-kaynak"><span>Logo'da {FARK_ADLARI[f.alan]}: {f.logo ?? '(boş)'}</span></p>)}
        {satir.logoyaGonder.durum === 'bekliyor' && <p className="tc-mk-soluk" role="status">Logo'ya gönderilmek üzere sırada.</p>}
        {satir.logoyaGonder.durum === 'hata' && <p className="tc-mk-uyari" data-ton="hata" role="alert">Logo'ya gönderilemedi: {satir.logoyaGonder.hata}</p>}
        <div className="tc-mk-logo-oku">
          <Dugme simge="upload" disabled={neden !== null} {...(neden ? { title: neden } : {})} onClick={() => acikYaz(true)}>CORE'dakini Logo'ya gönder</Dugme>
          {neden !== null && <p className="tc-mk-logo-kaynak"><span>{neden}.</span></p>}
        </div>
      </div>
      {acik && (
        <LogoyaGonderPenceresi
          secili={[aday]}
          gonderim={logoyaGonderim}
          kapat={() => acikYaz(false)}
          bitti={async () => { await istemci.invalidateQueries({ queryKey: anahtar }); }}
        />
      )}
    </Kart>
  );
}
