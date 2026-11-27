import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ParcaRevizyonlariCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { parcaRevMetni } from '#paylasilan/sozlesme/emir-durumu.ts';
import { Dugme, Pencere, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';

// 3755: emrin ana yeri burasıdır; parça revizyonu seçimi de buradadır. Seçim gerekliyse (açık emir, revizyon boş, kartın çizimi var)
// uyarı ve düzenleme yetkisinde "Revizyonu seç"; seçilmişse ve kartta daha yeni revizyon yayındaysa bilgi notu (emir değişmez).
export const PARCA_REVIZYONU_YETKISI = 'uretim-emirleri.duzenle';

interface Ozellikler {
  emirId: number;
  emirNo: string;
  malzemeNo: number;
  surum: number | undefined;
  parcaRevizyonu: string | null;
  secimGerekli: boolean;
}

export function ParcaRevizyonuSeridi({ emirId, emirNo, malzemeNo, surum, parcaRevizyonu, secimGerekli }: Ozellikler) {
  const yetkili = ((useOturum().data?.islemler ?? []) as readonly string[]).includes(PARCA_REVIZYONU_YETKISI);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [secim, setSecim] = useState<string | null>(null);
  const liste = useQuery({
    queryKey: [...anahtarlar.hepsi, 'parca-revizyonlari', malzemeNo] as const,
    queryFn: () => api.get<ParcaRevizyonlariCevabi>(`/adimli-emirler/parca-revizyonlari?malzemeNo=${String(malzemeNo)}`),
    enabled: secimGerekli || parcaRevizyonu !== null,
    retry: false,
  });
  const kapat = () => { setSecim(null); };
  const komut = useMutation({
    mutationFn: (revizyonId: number) => api.post(`/adimli-emirler/${String(emirId)}/parca-revizyonu`, { revizyonId, surum }, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: async () => {
      bildir('tamam', `${emirNo}: parça revizyonu sabitlendi.`);
      kapat();
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    },
  });
  const revizyonlar = liste.data?.revizyonlar ?? [];
  if (!secimGerekli) {
    const yayinda = revizyonlar.find((r) => r.durum === 'yayinda') ?? null;
    if (parcaRevizyonu === null || yayinda === null || yayinda.kod === parcaRevizyonu) return null;
    const bu = parcaRevMetni(parcaRevizyonu);
    return (
      <section className="tc-emir-bekleme" data-ton="bilgi" role="status" aria-label="Kartta yeni parça revizyonu">
        <Simge ad="file" />
        <div className="tc-emir-bekleme-metin">
          <b>Kartta yeni revizyon var: {parcaRevMetni(yayinda.kod)}.</b>
          <span>Bu emir {bu} ile açıldı ve {bu}&apos;da kalır; refakat kartı {bu} basar.</span>
        </div>
      </section>
    );
  }
  if (liste.isSuccess && revizyonlar.length === 0) return null;
  return (
    <>
      <section className="tc-emir-bekleme" role="status" aria-label="Parça revizyonu seçilmemiş">
        <Simge ad="alert" />
        <div className="tc-emir-bekleme-metin">
          <b>Parça revizyonu seçilmemiş</b>
          <span>Üretimi durdurmaz; refakat kartı ve etiketler kartın güncel çizim revizyonunu basar.</span>
          {!yetkili && <small>Revizyonu seçmek için emir düzenleme yetkisi gerekir.</small>}
          {liste.isError && <small className="tc-emir-hurda" role="alert">{hataIletisi(liste.error, 'Revizyonlar alınamadı.')}</small>}
        </div>
        <Dugme simge="file" disabled={!yetkili || surum === undefined || !liste.isSuccess} onClick={() => { setSecim(''); }}>Revizyonu seç</Dugme>
      </section>
      <Pencere
        acik={secim !== null} kapat={kapat} baslik={`Parça revizyonu seç · ${emirNo}`}
        alt={(
          <>
            <Dugme onClick={kapat}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="check" disabled={!secim} yukleniyor={komut.isPending} onClick={() => { komut.mutate(Number(secim)); }}>Kaydet</Dugme>
          </>
        )}
      >
        <Secim
          etiket="Parça revizyonu (çizim)" bosSecenek="Revizyon seçin" value={secim ?? ''} onChange={(e) => { setSecim(e.target.value); }}
          secenekler={revizyonlar.map((r) => ({
            deger: String(r.revizyonId),
            baslik: `${parcaRevMetni(r.kod)} · ${r.durum === 'yayinda' ? 'yayında' : 'eski'} · ${tarihMetni(r.yayinlandi.slice(0, 10))}`,
          }))}
          ipucu="Seçim sonradan değişmez ve emrin geçmişine yazılır."
        />
        {komut.isError && <p className="tc-emir-hurda" role="alert">{hataIletisi(komut.error, 'Revizyon kaydedilemedi.')}</p>}
      </Pencere>
    </>
  );
}
