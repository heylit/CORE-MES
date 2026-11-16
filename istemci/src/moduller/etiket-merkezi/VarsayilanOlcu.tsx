import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CiktiCevabi, OzelOlcu, SablonListesiOgesi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { Dugme, Girdi, Rozet, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { Onizleme } from './Onizleme.tsx';
import { olcuCoz, olcuYazisi } from './ozel-olcu.ts';

const ayni = (a: { genislik: number; yukseklik: number }, b: { genislik: number; yukseklik: number }) => a.genislik === b.genislik && a.yukseklik === b.yukseklik;

// 3306 a: şablonun bütün cihazlardaki varsayılan ölçüsü. Tasarım orantılı ölçeklenir (3011 a); okunmayan ölçüyü sunucu reddeder ve
// iletisi alanın altında görünür. Cihazdaki "Standart dışı etikete bas" bundan önce gelir.
export function VarsayilanOlcu({ sablon, yazar }: { sablon: SablonListesiOgesi; yazar: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [en, setEn] = useState(String(sablon.genislik));
  const [boy, setBoy] = useState(String(sablon.yukseklik));
  const [sonuc, setSonuc] = useState<string | null>(null);
  const cozum = olcuCoz(en, boy);
  const degisti = cozum.olcu !== null && !ayni(cozum.olcu, sablon);
  // Değişmemişken sunucu etkin ölçüyle çizer; girilen ölçü değişince o ölçü denenir (okunmayan ölçüyü sunucu reddeder).
  const sorgu = degisti && cozum.olcu ? `dil=zpl&dpi=203&en=${String(cozum.olcu.genislik)}&boy=${String(cozum.olcu.yukseklik)}` : 'dil=zpl&dpi=203';
  const deneme = useQuery({
    queryKey: anahtarlar.cikti(sablon.anahtar, sorgu),
    queryFn: () => api.get<CiktiCevabi>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/cikti?${sorgu}`),
    enabled: yazar && cozum.olcu !== null,
    retry: false,
  });
  const kaydet = useMutation({
    mutationFn: (olcu: OzelOlcu | null) => api.post<SablonListesiOgesi>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/olcu`, { olcu }, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: (s) => {
      setEn(String(s.genislik));
      setBoy(String(s.yukseklik));
      setSonuc(`${s.ad} artık ${olcuYazisi(s)} basılır.`);
      void istemci.invalidateQueries({ queryKey: anahtarlar.sablonlar });
      void istemci.invalidateQueries({ queryKey: anahtarlar.etiketler });
      void istemci.invalidateQueries({ queryKey: ['etiket-merkezi', 'cikti'] });
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Ölçü kaydedilemedi; yeniden deneyin.')),
  });
  const tasarimda = ayni(sablon, sablon.tasarim);
  const degisiklik = sablon.degisiklik ? `${sablon.degisiklik.kisi ?? 'Bilinmeyen kişi'} · ${tesisSaati(new Date(sablon.degisiklik.zaman))}` : null;

  if (!yazar) {
    return tasarimda ? null : (
      <p className="tc-etk-not" aria-label="Varsayılan ölçü">
        <Rozet ton="bilgi">Varsayılan ölçü {olcuYazisi(sablon)}</Rozet> Tasarım {olcuYazisi(sablon.tasarim)}; içerik orantılı ölçeklenir.
      </p>
    );
  }
  const sunucuHatasi = degisti && deneme.isError ? hataIletisi(deneme.error, 'Bu ölçüde basılamaz.') : undefined;
  const bilgi = degisti ? deneme.data?.ozelOlcu ?? null : null;
  return (
    <section className="tc-etk-bolum" aria-label="Varsayılan ölçü">
      {deneme.data && !(degisti && deneme.isError) && (
        <div className="tc-etk-kagit-alani"><Onizleme cikti={deneme.data} /></div>
      )}
      <h4 className="tc-etk-bolum-baslik">
        Varsayılan ölçü {!tasarimda && <Rozet ton="bilgi">Değişti</Rozet>}
      </h4>
      <div className="tc-etk-secimler">
        <Girdi etiket="Etiket eni (mm)" inputMode="decimal" value={en} onChange={(e) => { setEn(e.target.value); setSonuc(null); }} hata={cozum.enHatasi ?? sunucuHatasi} />
        <Girdi etiket="Etiket boyu (mm)" inputMode="decimal" value={boy} onChange={(e) => { setBoy(e.target.value); setSonuc(null); }} hata={cozum.boyHatasi} />
      </div>
      {bilgi && (
        <p className="tc-etk-not" role="status">
          <Rozet ton="bilgi">Ölçek %{Math.round(bilgi.olcek * 100)}</Rozet>{' '}
          {olcuYazisi(sablon.tasarim)} tasarım {cozum.olcu ? olcuYazisi(cozum.olcu) : ''} etikete orantılı yerleşir. Bu tasarımın en küçük ölçüsü {olcuYazisi(bilgi.enKucuk)}.
        </p>
      )}
      {bilgi?.uyarilar.map((u) => <p key={u} className="tc-etk-not"><Rozet ton="uyari">Okunurluk</Rozet> {u}</p>)}
      <p className="tc-etk-not">Bütün yazıcılarda ve cihazlarda bu ölçü kullanılır. Cihazda "Standart dışı etikete bas" açıksa o cihaz kendi ölçüsünü kullanır.</p>
      {sonuc && <p className="tc-etk-not" role="status"><Rozet ton="tamam">Kaydedildi</Rozet> {sonuc}</p>}
      {degisiklik && <p className="tc-etk-not"><Rozet ton="pasif">Son değişiklik</Rozet> {degisiklik}</p>}
      <div className="tc-etk-dugmeler">
        <Dugme tur="birincil" simge="check" yukleniyor={kaydet.isPending} disabled={!degisti || deneme.isPending || deneme.isError}
          onClick={() => { if (cozum.olcu) kaydet.mutate(cozum.olcu); }}>Ölçüyü kaydet</Dugme>
        {!tasarimda && (
          <Dugme simge="rotate" disabled={kaydet.isPending} onClick={() => kaydet.mutate(null)}>Tasarım ölçüsüne dön ({olcuYazisi(sablon.tasarim)})</Dugme>
        )}
      </div>
    </section>
  );
}
