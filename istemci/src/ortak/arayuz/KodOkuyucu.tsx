import { useEffect, useRef, useState, type FormEvent } from 'react';
import { okutmaDuzelt } from '#paylasilan/kod-sozlugu.ts';
import { useKamera } from '../veri/kamera.ts';
import { Girdi } from './Alan.tsx';
import { Dugme } from './Dugme.tsx';
import './kod-okuyucu.css';

// Kamera, fotoğraf ve el okuyucu tek yerde: okunan metin `okundu`ya gider, ne olduğuna çağıran karar verir. Klavyeden gelen metin
// `okutmaDuzelt`ten geçer: fabrika ayarındaki okuyucunun Türkçe klavyede bozduğu ayraçlar düzelir, başka metin değişmez.
// El okuyucu klavye gibi yazar ve Enter gönderir; kamerasız bilgisayarda da yalnız bu alan yeter.
// `kendiliginden` kamerayı açılışta başlatır (okutmak için açılan ekranlar); varsayılan dokunmayla açılıştır.
// `sik` okuyucuyu tek satıra indirir (kamera, kod, bul, fotoğraf); kamera görüntüsü yalnız açıkken yer kaplar, ipucu alanın açıklaması olur.
// Kod alanı açılışta odak alır; pencere içindeyse de (pencere ilk odağı `data-ilk-odak`a verir). `dokunmatikteOdakYok` ile yalnız fareli cihazda ya da kamera hata verince alır: tablette ekran klavyesi açılıp kamerayı örtmesin.
function inceIsaretci(): boolean {
  try { return window.matchMedia('(pointer: fine)').matches; } catch { return false; }
}
function yaziAlaniMi(hedef: EventTarget | null): boolean {
  return hedef instanceof HTMLElement && (hedef.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(hedef.tagName));
}
export function KodOkuyucu({ okundu, bekliyor = false, ipucu, kendiliginden = false, dokunmatikteOdakYok = false, sik = false }: {
  okundu: (kod: string) => void; bekliyor?: boolean; ipucu?: string; kendiliginden?: boolean; dokunmatikteOdakYok?: boolean; sik?: boolean;
}) {
  const [elle, setElleDurumu] = useState('');
  const elleSon = useRef('');
  const setElle = (deger: string) => { elleSon.current = deger; setElleDurumu(deger); };
  const kamera = useKamera(okundu);
  const { ac } = kamera;
  useEffect(() => { if (kendiliginden) void ac(); }, [kendiliginden, ac]);
  const [acilistaOdak] = useState(() => !dokunmatikteOdakYok || inceIsaretci());
  const form = useRef<HTMLFormElement | null>(null);
  useEffect(() => { if (dokunmatikteOdakYok && kamera.hata) form.current?.querySelector('input')?.focus(); }, [dokunmatikteOdakYok, kamera.hata]);
  // Alan odaksızken (tablet) el okuyucunun fiziksel tuşları hiçbir yere yazılmazdı. Odak bir yazı alanında değilse yazdırılabilir tuşlar
  // koda eklenir, Enter gönderir; alan odak almadığı için ekran klavyesi yine açılmaz. Yakalama aşamasında dinlenir: odaktaki düğme
  // okutmanın tuşlarıyla tıklanmasın.
  const sonOkundu = useRef(okundu);
  useEffect(() => { sonOkundu.current = okundu; });
  useEffect(() => {
    if (acilistaOdak) return;
    const tus = (o: KeyboardEvent) => {
      if (o.defaultPrevented || o.ctrlKey || o.altKey || o.metaKey || yaziAlaniMi(o.target)) return;
      if (o.key === 'Enter') {
        const kod = elleSon.current.trim();
        if (kod === '') return;
        o.preventDefault();
        o.stopPropagation();
        elleSon.current = '';
        setElleDurumu('');
        sonOkundu.current(okutmaDuzelt(kod));
        return;
      }
      if (o.key.length !== 1) return;
      o.preventDefault();
      elleSon.current += o.key;
      setElleDurumu(elleSon.current);
    };
    window.addEventListener('keydown', tus, true);
    return () => window.removeEventListener('keydown', tus, true);
  }, [acilistaOdak]);
  const dosya = useRef<HTMLInputElement | null>(null);
  const gonder = (o: FormEvent) => { o.preventDefault(); if (elle.trim() !== '') { okundu(okutmaDuzelt(elle.trim())); setElle(''); } };
  const kodAlani = (
    <Girdi etiket="Kod" placeholder={sik ? 'Kodu yaz ya da okut' : 'Kodu yaz ya da el okuyucuyla okut'} value={elle} onChange={(o) => setElle(o.target.value)} autoFocus={acilistaOdak}
      {...(acilistaOdak ? { 'data-ilk-odak': '' } : {})} {...(ipucu ? { ipucu } : {})} />
  );
  const dosyaGirdisi = (
    <input ref={dosya} type="file" accept="image/*" capture="environment" hidden onChange={(o) => { const f = o.target.files?.[0]; if (f) void kamera.fotograftan(f); o.target.value = ''; }} />
  );
  if (sik) {
    return (
      <div className="tc-kod-okuyucu tc-kod-okuyucu-sik">
        <form ref={form} className="tc-kod-okuyucu-satir" onSubmit={gonder}>
          {kamera.acik
            ? <Dugme simge="x" aria-label="Kamerayı kapat" title="Kamerayı kapat" onClick={kamera.kapat} />
            : <Dugme tur="birincil" simge="scan" aria-label="Kamerayı aç" title="Kamerayı aç" onClick={() => void kamera.ac()} />}
          {kodAlani}
          <Dugme simge="search" type="submit" aria-label="Bul" title="Bul" yukleniyor={bekliyor} />
          <Dugme simge="upload" aria-label="Fotoğraftan oku" title="Fotoğraftan oku" onClick={() => dosya.current?.click()} />
        </form>
        <div className="tc-kod-okuyucu-kamera" data-acik={kamera.acik ? '' : undefined} hidden={!kamera.acik}>
          <video ref={kamera.video} muted playsInline aria-label="Kamera görüntüsü" />
          <canvas ref={kamera.tuval} hidden />
          <span className="tc-kod-okuyucu-cerceve" aria-hidden="true" />
        </div>
        {kamera.hata && <p className="tc-kod-okuyucu-hata" role="status">{kamera.hata}</p>}
        {dosyaGirdisi}
      </div>
    );
  }
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
      <form ref={form} className="tc-kod-okuyucu-elle" onSubmit={gonder}>
        {kodAlani}
        <Dugme tur="birincil" type="submit" yukleniyor={bekliyor}>Bul</Dugme>
      </form>
      <Dugme simge="upload" onClick={() => dosya.current?.click()}>Fotoğraftan oku</Dugme>
      {dosyaGirdisi}
    </div>
  );
}
