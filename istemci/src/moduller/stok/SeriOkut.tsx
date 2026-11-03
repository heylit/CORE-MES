import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { SeriListeCevabi, SeriListelerCevabi, SeriSatiri } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, KodOkuyucu, Simge, useOkutmaGecmisi, type KomutIsleyici } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api } from '../../ortak/veri/api.ts';
import { zamanMetni } from './gorunum.ts';
import { hataMetni, korumaliPost, useStokOkur } from './ortak.tsx';
import { SERI_TURU_ADI, seriTuru, type SeriTuru } from './seri-liste.ts';
import './stok.css';

// Okut panelinin Seri modu (1915): ne okutulursa seçim sormadan kişinin seri listesine düşer; stok değişmez. Liste sunucudadır,
// bilgisayarda Stok > Seri listeler'de düzeltilip bir işe verilir. Okutmalar sırayla gönderilir: ilk okutmanın açtığı liste
// sonrakilere geçer. Panel açılınca kişinin son açık telefon listesi sürer.
export const SERI_ANAHTARI = ['stok', 'seri-listeler'] as const;
export const SERI_SIMGESI: Readonly<Record<SeriTuru, SimgeAdi>> = {
  goz: 'target', lot: 'box', malzeme: 'layers', raf: 'grid', kart: 'tag', 'is-emri': 'clipboard-check', bilinmiyor: 'alert',
};

export function SeriOkut({ komut: ustKomut }: { komut?: KomutIsleyici }) {
  const gecmis = useOkutmaGecmisi();
  const istemci = useQueryClient();
  const stokOkur = useStokOkur();
  const listeler = useQuery({ queryKey: SERI_ANAHTARI, queryFn: () => api.get<SeriListelerCevabi>('/stok/seri-listeler') });
  const [liste, setListe] = useState<SeriListeCevabi | null>(null);
  const [yeniListe, setYeniListe] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const kuyruk = useRef<Promise<unknown>>(Promise.resolve());
  const listeRef = useRef<SeriListeCevabi | null>(null);
  const yaz = (l: SeriListeCevabi | null) => { listeRef.current = l; setListe(l); };
  const surenId = listeler.data?.listeler.find((l) => l.kaynak === 'okutma')?.id ?? null;
  useEffect(() => {
    if (liste !== null || yeniListe || surenId === null) return;
    void api.get<SeriListeCevabi>(`/stok/seri-listeler/${surenId}`).then((l) => { if (listeRef.current === null) yaz(l); }, () => undefined);
  }, [surenId, liste, yeniListe]);


  const ekle = (kod: string) => {
    kuyruk.current = kuyruk.current.then(async () => {
      const listeId = listeRef.current?.liste.id;
      try {
        const l = await korumaliPost<SeriListeCevabi>('/stok/seri-listeler/okutma-ekle', { ...(listeId ? { listeId } : {}), kodlar: [kod] });
        yaz(l);
        setYeniListe(false);
        setHata(null);
        const t = seriTuru(kod);
        const son = l.satirlar.at(-1);
        gecmis.bildir(kod, t === 'bilinmiyor' ? 'uyari' : 'tamam', son?.adet && son.kod === kod && son.adet !== '1' ? `${SERI_TURU_ADI[t]} · adet ${son.adet}` : `${SERI_TURU_ADI[t]} listeye eklendi`);
      } catch (e) {
        setHata(hataMetni(e));
        gecmis.bildir(kod, 'hata', hataMetni(e));
      }
      await istemci.invalidateQueries({ queryKey: SERI_ANAHTARI });
    });
  };
  const sil = (s: SeriSatiri) => {
    const l = listeRef.current;
    if (!l) return;
    kuyruk.current = kuyruk.current.then(async () => {
      try { yaz(await api.post<SeriListeCevabi>(`/stok/seri-listeler/${l.liste.id}/satirlar/${s.id}/sil`, {})); setHata(null); } catch (e) { setHata(hataMetni(e)); }
    });
  };
  const bitir = () => { yaz(null); setYeniListe(true); void istemci.invalidateQueries({ queryKey: SERI_ANAHTARI }); };
  const sonAcik = liste?.satirlar.filter((s) => s.islendi === null).at(-1);
  const komut: KomutIsleyici = (k) => {
    switch (k.ad) {
      case 'GERI-AL':
        if (!sonAcik) return { ton: 'uyari', metin: 'Silinecek okutma yok' };
        sil(sonAcik);
        return { ton: 'tamam', metin: 'Son okutma silindi' };
      case 'KAYDET':
        if (!liste) return { ton: 'uyari', metin: 'Liste boş' };
        bitir();
        return { ton: 'tamam', metin: 'Liste bitti; bilgisayarda Seri listeler' };
      case 'EVET': case 'VAZGEC': case 'ARTI': case 'EKSI': case 'MIKTAR': case 'MOD':
        return ustKomut?.(k) ?? null;
    }
  };
  const satirlar = liste?.satirlar ?? [];
  const okutma = satirlar.reduce((t, s) => t + (s.adet === null ? 1 : Math.max(1, Math.round(Number(s.adet)))), 0);
  return (
    <div className="tc-stok-okut-ust">
      <div className="tc-stok-seri-ozet">
        <span><strong>{liste ? `Seri liste · ${zamanMetni(liste.liste.acilis)}` : 'Yeni seri liste'}</strong>
          {liste && <span className="tc-stok-not"> · {okutma} okutma · {satirlar.length} satır</span>}</span>
        {liste && <span className="tc-stok-not"><Simge ad="check" /> Kaydedildi</span>}
      </div>
      <KodOkuyucu kendiliginden dokunmatikteOdakYok okundu={ekle} geribildirim={gecmis} komut={komut}
        ipucu="Göz, lot, malzeme, refakat kartı: ne okutursan listeye düşer. Stok değişmez." />
      {hata && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert">{hata}</p>}
      {satirlar.length === 0
        ? <p className="tc-stok-not">Henüz okutma yok. İlk okutma listeyi açar.</p>
        : (
          <ul className="tc-stok-seri-satirlar" aria-label="Seri liste">
            {satirlar.slice().reverse().map((s) => {
              const t = seriTuru(s.kod);
              return (
                <li key={s.id} data-tur={t} data-islendi={s.islendi ? '' : undefined}>
                  <span className="tc-stok-seri-tur"><Simge ad={SERI_SIMGESI[t]} /></span>
                  <div><strong className="tc-stok-mono">{s.kod}</strong><span className="tc-stok-not">{SERI_TURU_ADI[t]}{s.islendi ? ' · işlendi' : ''}</span></div>
                  <span className="tc-stok-mono">{s.adet ?? ''}</span>
                  {s.islendi === null ? <Dugme simge="trash" aria-label={`Sil ${s.kod}`} onClick={() => sil(s)} /> : <span />}
                </li>
              );
            })}
          </ul>
        )}
      <div className="tc-stok-eylem">
        <Dugme simge="x" disabled={!sonAcik} onClick={() => sonAcik && sil(sonAcik)}>Sonuncuyu sil</Dugme>
        <Dugme tur="birincil" simge="check" disabled={!liste} onClick={bitir}>Bitir, bilgisayarda devam</Dugme>
        {stokOkur && <Link to="/stok/seri-listeler">Seri listeler</Link>}
      </div>
    </div>
  );
}
