import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dugme, Girdi, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { useKatman } from '../../ortak/arayuz/katman.ts';
import { miktarGirdisi, miktarMetni } from './gorunum.ts';
import './kabul-akisi.css';

// Telefonda mal kabulü kalem kalem sayma akışı (kart 3676 dilim 2c). Form ve gönderim mal kabul formununkidir: akış yalnız seçilmiş
// sipariş satırlarının sayılan miktarını yazar ve aynı gönderimi tetikler; parti, ambalaj, konum ve belge gibi ayrıntı gereken
// satır için "Ayrıntılı gir" ile forma dönülür. Sonuç sunucudan gelmeden başarı gösterilmez; hatada girilenler korunur.
export interface AkisKalemi {
  anahtar: number;
  ad: string;
  siparis: string;
  birim: string;
  beklenen: string;
  kalan: string;
  miktar: string;
}
export type AkisSonucu = 'bekliyor' | 'gonderiyor' | 'basarili' | 'hata';

interface Ozellikler {
  kalemler: readonly AkisKalemi[];
  miktarYaz: (anahtar: number, miktar: string) => void;
  irsaliye: string;
  irsaliyeYaz: (no: string) => void;
  // Gelmedi denen ve miktarı girilmeyen kalemlerin anahtarları gönderimden çıkarılır.
  gonder: (atlanan: readonly number[]) => void;
  sonuc: AkisSonucu;
  hataMetni: string | null;
  kapat: () => void;
  ayrintili: () => void;
}

const sayiOf = (v: string): number => Number(miktarGirdisi(v === '' ? '0' : v));
const TUSLAR = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'sil'] as const;
const ENCOK_UZUNLUK = 9;

export function KabulAkisi({ kalemler, miktarYaz, irsaliye, irsaliyeYaz, gonder, sonuc, hataMetni, kapat, ayrintili }: Ozellikler) {
  const [adim, adimYaz] = useState(0);
  const [atlanan, atlananYaz] = useState<readonly number[]>([]);
  const [soruluyor, soruluyorYaz] = useState(false);
  // Başarıda form sıfırlanır; ekran gönderilen sayıları kendi tutar.
  const [gonderilen, gonderilenYaz] = useState<{ kabul: number; gelmedi: number } | null>(null);
  // Gönderimden sonra liste boşalır (form sıfırlanır); özet ve başarı ekranı ilk kalem listesiyle çizilir.
  const [liste] = useState(kalemler);
  const asama: 'say' | 'ozet' = adim >= liste.length ? 'ozet' : 'say';
  const kalem = liste[adim];
  const guncel = kalem ? kalemler.find((k) => k.anahtar === kalem.anahtar) : undefined;
  const miktar = guncel?.miktar ?? '';
  const girilen = liste.filter((k) => !atlanan.includes(k.anahtar) && sayiOf(kalemler.find((x) => x.anahtar === k.anahtar)?.miktar ?? '') > 0);
  const girdiVar = girilen.length > 0 || atlanan.length > 0;
  const katman = useKatman<HTMLDivElement>(true, () => { if (sonuc === 'basarili') kapat(); else soruluyorYaz(true); });
  // Sipariş kalanı öneri olarak dolu gelir; sayım sıfırdan başlar, iptalde ilk değerler geri konur.
  useEffect(() => { liste.forEach((k) => { miktarYaz(k.anahtar, ''); }); }, []);

  const tus = (t: (typeof TUSLAR)[number]) => {
    if (!kalem) return;
    if (t === 'sil') { miktarYaz(kalem.anahtar, miktar.slice(0, -1)); return; }
    if (t === ',' && (miktar.includes(',') || miktar === '')) return;
    if (miktar.length >= ENCOK_UZUNLUK) return;
    miktarYaz(kalem.anahtar, miktar === '0' && t !== ',' ? t : miktar + t);
  };
  const cikis = () => { if (girdiVar && sonuc !== 'basarili') soruluyorYaz(true); else kapat(); };
  const sonraki = () => { atlananYaz((a) => a.filter((x) => x !== kalem?.anahtar)); adimYaz((a) => a + 1); };
  const gelmedi = () => {
    if (!kalem) return;
    atlananYaz((a) => (a.includes(kalem.anahtar) ? a : [...a, kalem.anahtar]));
    miktarYaz(kalem.anahtar, '');
    adimYaz((a) => a + 1);
  };
  const fazla = kalem ? sayiOf(miktar) - Number(kalem.kalan) : 0;

  const icerik = (
    <div ref={katman} className="tc-kabul-akisi" role="dialog" aria-modal="true" aria-label="Kalem kalem mal kabul">
      <header className="tc-kabul-akisi-ust">
        <button type="button" className="tc-kabul-akisi-kapat" aria-label="Kapat" onClick={cikis}><Simge ad="x" /></button>
        <h2>Mal kabul{asama === 'say' ? ` · ${String(adim + 1)}/${String(liste.length)}` : ''}</h2>
      </header>
      <div className="tc-kabul-akisi-ilerleme" role="presentation">
        {liste.map((k, i) => <span key={k.anahtar} data-tamam={i < adim ? '' : undefined} data-simdiki={i === adim ? '' : undefined} />)}
      </div>

      {sonuc === 'basarili' ? (
        <div className="tc-kabul-akisi-orta" role="status">
          <Simge ad="check" boyut="b" />
          <h3>Mal kabul kaydedildi</h3>
          <p>{gonderilen?.kabul ?? girilen.length} kalem kabul edildi{(gonderilen?.gelmedi ?? atlanan.length) > 0 ? `, ${String(gonderilen?.gelmedi ?? atlanan.length)} kalem gelmedi` : ''}. Lot etiketlerini formdan basabilirsiniz.</p>
          <Dugme tur="birincil" boyut="ana" onClick={kapat}>Tamam</Dugme>
        </div>
      ) : asama === 'say' && kalem ? (
        <>
          <div className="tc-kabul-akisi-orta">
            <p className="tc-kabul-akisi-siparis">{kalem.siparis}</p>
            <h3>{kalem.ad}</h3>
            <p className="tc-kabul-akisi-bilgi">Beklenen {miktarMetni(kalem.beklenen)} · Kalan {miktarMetni(kalem.kalan)} {kalem.birim}</p>
            <p className="tc-kabul-akisi-sayi" role="status" aria-live="polite">{miktar === '' ? '0' : miktar}<span>{kalem.birim}</span></p>
            <Dugme tur="ikincil" onClick={() => { miktarYaz(kalem.anahtar, miktarMetni(kalem.kalan).replace(/\./g, '')); }}>Kalan {miktarMetni(kalem.kalan)} {kalem.birim} ile doldur</Dugme>
            {fazla > 1e-9 && <p className="tc-kabul-akisi-uyari" role="alert">Siparişten {miktarMetni(String(Math.round(fazla * 1000) / 1000))} {kalem.birim} fazla; fazla teslim olarak yazılır.</p>}
            {miktar === '' && <p className="tc-kabul-akisi-ipucu">Miktar girin ya da kalem gelmediyse atlayın</p>}
          </div>
          <div className="tc-kabul-akisi-tuslar" role="group" aria-label="Sayı tuşları">
            {TUSLAR.map((t) => <button key={t} type="button" onClick={() => { tus(t); }} aria-label={t === 'sil' ? 'Sil' : t === ',' ? 'Virgül' : t}>{t === 'sil' ? <Simge ad="x" /> : t}</button>)}
          </div>
          <div className="tc-kabul-akisi-alt">
            <Dugme onClick={() => { if (adim === 0) cikis(); else adimYaz((a) => a - 1); }}>{adim === 0 ? 'Vazgeç' : 'Geri'}</Dugme>
            <Dugme onClick={gelmedi}>Gelmedi</Dugme>
            <Dugme tur="birincil" disabled={sayiOf(miktar) <= 0} onClick={sonraki}>{adim === liste.length - 1 ? 'Özete geç' : 'Sonraki'}</Dugme>
          </div>
        </>
      ) : (
        <>
          <div className="tc-kabul-akisi-orta tc-kabul-akisi-ozet">
            <h3>{girilen.length} kalem kabul edilecek{atlanan.length > 0 ? `, ${String(atlanan.length)} kalem gelmedi` : ''}</h3>
            <ul>
              {liste.map((k) => {
                const m = kalemler.find((x) => x.anahtar === k.anahtar)?.miktar ?? '';
                const gitmez = atlanan.includes(k.anahtar) || sayiOf(m) <= 0;
                const f = sayiOf(m) - Number(k.kalan);
                return (
                  <li key={k.anahtar}>
                    <span>{k.ad}</span>
                    {gitmez ? <Rozet ton="pasif">Gelmedi</Rozet> : <strong>{m} {k.birim}{f > 1e-9 ? <Rozet ton="uyari">Fazla</Rozet> : null}</strong>}
                  </li>
                );
              })}
            </ul>
            <Girdi etiket="İrsaliye no" value={irsaliye} onChange={(e) => { irsaliyeYaz(e.target.value); }} />
            {sonuc === 'hata' && (
              <p className="tc-kabul-akisi-uyari" role="alert">Kabul kaydedilemedi. Girdiğiniz miktarlar korundu.{hataMetni ? ` ${hataMetni}` : ''}{' '}
                <button type="button" className="tc-kabul-akisi-bag" onClick={ayrintili}>Ayrıntılı gir</button></p>
            )}
          </div>
          <div className="tc-kabul-akisi-alt">
            <Dugme onClick={() => { adimYaz(liste.length - 1); }} disabled={sonuc === 'gonderiyor'}>Geri</Dugme>
            <Dugme tur="birincil" yukleniyor={sonuc === 'gonderiyor'} disabled={girilen.length === 0} onClick={() => { gonderilenYaz({ kabul: girilen.length, gelmedi: liste.length - girilen.length }); gonder(liste.filter((k) => !girilen.includes(k)).map((k) => k.anahtar)); }}>
              {sonuc === 'gonderiyor' ? 'Kabul ediliyor...' : sonuc === 'hata' ? 'Tekrar dene' : 'Kabul et'}
            </Dugme>
          </div>
        </>
      )}

      {soruluyor && (
        <div className="tc-kabul-akisi-sor" role="dialog" aria-modal="true" aria-label="Girdiler silinsin mi?">
          <div>
            <h3>Girdiler silinsin mi?</h3>
            <p>Bu mal kabul için girdiğiniz miktarlar kaydedilmedi.</p>
            <Dugme tur="birincil" onClick={() => { soruluyorYaz(false); }}>Devam et</Dugme>
            <Dugme tur="tehlike" onClick={() => { liste.forEach((k) => { miktarYaz(k.anahtar, k.miktar); }); kapat(); }}>Sil ve çık</Dugme>
          </div>
        </div>
      )}
    </div>
  );
  return createPortal(icerik, document.body);
}
