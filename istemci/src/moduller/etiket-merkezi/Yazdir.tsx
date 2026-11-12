import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { KayitSecimi, OzelOlcu, Sablon, YazdirCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { Dugme } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EtiketCizimi } from './Onizleme.tsx';

// Kart 2904: bu bilgisayara takılı etiket yazıcısına tarayıcıdan, Windows sürücüsüyle vektörel baskı. Yazıcı seçimi Windows'tadır.
// Baskıda yalnız etiket sayfaları görünür: sınıf gövdeye yalnız yazdırma süresince takılır (kalite-merkezi Onizleme kalıbı), sayfa
// ölçüsü şablondan gelir ve stil yazdırma bitince kalkar; öteki sayfaların baskısını etkilemez.
export const BASKI_SINIFI = 'tc-etk-baskida';
export const SAYFA_STILI_KIMLIGI = 'tc-etk-sayfa';

// @page ölçüsü basılan etiketin mm ölçüsüdür (özel ölçüde girilen ölçü), kenar boşluğu yoktur: her etiket bir sayfadır.
export const sayfaKurali = (genislik: number, yukseklik: number): string => `@page { size: ${String(genislik)}mm ${String(yukseklik)}mm; margin: 0; }`;

// Ekran ölçeği (gercek-boyut.ts) uygulanmaz: baskıda 1 mm = 1 mm. Her etiket `adet` kez, art arda sayfa olur.
export function BaskiSayfalari({ baski }: { baski: YazdirCevabi }) {
  const { genislik, yukseklik, ad } = baski.sablon;
  const boyut = { width: `${String(genislik)}mm`, height: `${String(yukseklik)}mm` };
  return (
    <div className="tc-etk-baski" aria-hidden="true">
      {baski.sayfalar.flatMap((ogeler, i) => Array.from({ length: baski.adet }, (_, j) => (
        <div key={`${String(i)}-${String(j)}`} className="tc-etk-baski-sayfa">
          <EtiketCizimi genislik={genislik} yukseklik={yukseklik} ad={ad} ogeler={ogeler} sinif="tc-etk-baski-etiket" boyut={boyut} />
        </div>
      )))}
    </div>
  );
}

function baskiyiKaldir(): void {
  document.body.classList.remove(BASKI_SINIFI);
  document.getElementById(SAYFA_STILI_KIMLIGI)?.remove();
}

// Defter satırı yazdırma penceresi açılmadan yazılır; tarayıcı etiketin basılıp basılmadığını uygulamaya bildirmez.
export function VektorelYazdir({ sablon, adet, kayit, olcu = null, dugmeMetni = 'Vektörel yazdır', birincil = false }: {
  sablon: Sablon; adet: number | null; kayit: KayitSecimi | null; olcu?: OzelOlcu | null; dugmeMetni?: string; birincil?: boolean;
}) {
  const istemci = useQueryClient();
  const [kimlik, setKimlik] = useState(yeniIstekKimligi);
  const [baski, setBaski] = useState<YazdirCevabi | null>(null);
  const [sonuc, setSonuc] = useState<{ ton: 'tamam' | 'hata'; metin: string } | null>(null);
  const yazdir = useMutation({
    mutationFn: (g: { adet: number; kayit?: KayitSecimi; olcu?: OzelOlcu }) =>
      api.post<YazdirCevabi>(`/etiket-merkezi/sablonlar/${sablon.anahtar}/yazdir`, g, { istekKimligi: kimlik }),
    onSuccess: (c) => {
      setKimlik(yeniIstekKimligi());
      void istemci.invalidateQueries({ queryKey: anahtarlar.baskilar });
      void istemci.invalidateQueries({ queryKey: anahtarlar.bekleyenler });
      setBaski(c);
      setSonuc({ ton: 'tamam', metin: 'Yazdırma penceresi açıldı ve deftere yazıldı. Etiketin çıktığını yazıcının başında kontrol edin.' });
    },
    onError: (h) => setSonuc({ ton: 'hata', metin: hataIletisi(h, 'Yazdırma hazırlanamadı; yeniden deneyin.') }),
  });

  // Sayfalar çizildikten sonra pencere açılır; kapanınca (afterprint) ya da ekran kapanınca sınıf ve sayfa stili kalkar.
  useEffect(() => {
    if (baski === null) return undefined;
    const stil = document.createElement('style');
    stil.id = SAYFA_STILI_KIMLIGI;
    stil.textContent = sayfaKurali(baski.sablon.genislik, baski.sablon.yukseklik);
    document.head.append(stil);
    document.body.classList.add(BASKI_SINIFI);
    const bitti = () => setBaski(null);
    window.addEventListener('afterprint', bitti);
    try { window.print(); } catch { bitti(); }
    return () => {
      window.removeEventListener('afterprint', bitti);
      baskiyiKaldir();
    };
  }, [baski]);

  return (
    <div className="tc-etk-gonder">
      <div className="tc-etk-dugmeler">
        <Dugme tur={birincil ? 'birincil' : 'ikincil'} boyut={birincil ? 'ana' : undefined} simge="printer" disabled={adet === null} yukleniyor={yazdir.isPending}
          onClick={() => { if (adet !== null) { setSonuc(null); yazdir.mutate({ adet, ...(kayit ? { kayit } : {}), ...(olcu ? { olcu } : {}) }); } }}>
          {dugmeMetni}
        </Dugme>
      </div>
      {!birincil && <p className="tc-etk-not">Bu bilgisayara takılı yazıcıya Windows sürücüsüyle basar; yazıcıyı yazdırma penceresinde seçin.</p>}
      {sonuc && <p className={sonuc.ton === 'hata' ? 'tc-etk-hata' : 'tc-etk-not'} role={sonuc.ton === 'hata' ? 'alert' : 'status'}>{sonuc.metin}</p>}
      {baski && createPortal(<BaskiSayfalari baski={baski} />, document.body)}
    </div>
  );
}
