import { useRef, useState } from 'react';
import { useKamera } from '../veri/kamera.ts';
import { Girdi } from './Alan.tsx';
import { Dugme } from './Dugme.tsx';
import './kod-okuyucu.css';

// Kamera, fotoğraf ve el okuyucu tek yerde: okunan metin olduğu gibi `okundu`ya gider, ne olduğuna çağıran karar verir.
// El okuyucu klavye gibi yazar ve Enter gönderir; kamerasız bilgisayarda da yalnız bu alan yeter.
export function KodOkuyucu({ okundu, bekliyor = false, ipucu }: { okundu: (kod: string) => void; bekliyor?: boolean; ipucu?: string }) {
  const [elle, setElle] = useState('');
  const kamera = useKamera(okundu);
  const dosya = useRef<HTMLInputElement | null>(null);
  return (
    <div className="tc-kod-okuyucu">
      <div className="tc-kod-okuyucu-kamera" data-acik={kamera.acik ? '' : undefined}>
        <video ref={kamera.video} muted playsInline aria-label="Kamera görüntüsü" />
        <canvas ref={kamera.tuval} hidden />
        {kamera.acik
          ? <Dugme onClick={kamera.kapat}>Kamerayı kapat</Dugme>
          : <Dugme tur="birincil" simge="scan" onClick={() => void kamera.ac()}>Kamerayı aç</Dugme>}
        <span className="tc-kod-okuyucu-cerceve" aria-hidden="true" />
      </div>
      {kamera.hata && <p className="tc-kod-okuyucu-hata" role="status">{kamera.hata}</p>}
      <form className="tc-kod-okuyucu-elle" onSubmit={(o) => { o.preventDefault(); if (elle.trim() !== '') { okundu(elle.trim()); setElle(''); } }}>
        <Girdi etiket="Kod" placeholder="Kodu yaz ya da el okuyucuyla okut" value={elle} onChange={(o) => setElle(o.target.value)} autoFocus {...(ipucu ? { ipucu } : {})} />
        <Dugme tur="birincil" type="submit" yukleniyor={bekliyor}>Bul</Dugme>
      </form>
      <Dugme simge="upload" onClick={() => dosya.current?.click()}>Fotoğraftan oku</Dugme>
      <input ref={dosya} type="file" accept="image/*" capture="environment" hidden onChange={(o) => { const f = o.target.files?.[0]; if (f) void kamera.fotograftan(f); o.target.value = ''; }} />
    </div>
  );
}
