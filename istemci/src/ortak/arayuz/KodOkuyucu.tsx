import { useEffect, useRef, useState, type FormEvent } from 'react';
import { kodTuru, okutmaDuzelt } from '#paylasilan/kod-sozlugu.ts';
import { useKamera } from '../veri/kamera.ts';
import { Girdi } from './Alan.tsx';
import { Dugme } from './Dugme.tsx';
import type { OkutmaGecmisi, OkutmaTonu } from './okutma-geribildirimi.ts';
import { KOMUT_YOK, type KomutIsleyici } from './okuyucu-komutu.ts';
import './kod-okuyucu.css';

// Kamera, fotoğraf ve el okuyucu tek yerde: okunan metin `okundu`ya gider, ne olduğuna çağıran karar verir. Klavyeden gelen metin
// `okutmaDuzelt`ten geçer: fabrika ayarındaki okuyucunun Türkçe klavyede bozduğu ayraçlar düzelir, başka metin değişmez.
// El okuyucu klavye gibi yazar ve Enter gönderir; kamerasız bilgisayarda da yalnız bu alan yeter.
// `kendiliginden` kamerayı açılışta başlatır (okutmak için açılan ekranlar); varsayılan dokunmayla açılıştır.
// `sik` okuyucuyu tek satıra indirir (kamera, kod, bul, fotoğraf); kamera görüntüsü yalnız açıkken yer kaplar, ipucu alanın açıklaması olur.
// `geribildirim` (1906, `useOkutmaGecmisi`): çağıranın bildirdiği sonuçla alan bir an yeşil, turuncu ya da kırmızı yanar; son beş okutma
// altta şerittir, ses oradan kapatılır.
// `komut` (1909, 1912): komut barkodu (CMD:...) `okundu`ya gitmez, ekranın işleyicisine gider; sonucu şeritte görünür. Verilmezse
// komut da sıradan kod gibi `okundu`ya gider.
// `alansiz` (3187 a): kod alanı ve düğmeleri çizilmez; el okuyucu her cihazda pencere düzeyinde dinlenir, kamerayı çağıran `kameraAcik`
// ile açıp kapatır (düğmesi çağıranın ekranındadır). Kamera kapalıyken okuyucu yer kaplamaz.
// Kod alanı açılışta odak alır; pencere içindeyse de (pencere ilk odağı `data-ilk-odak`a verir). `dokunmatikteOdakYok` ile yalnız fareli cihazda ya da kamera hata verince alır: tablette ekran klavyesi açılıp kamerayı örtmesin.
function inceIsaretci(): boolean {
  try { return window.matchMedia('(pointer: fine)').matches; } catch { return false; }
}
function yaziAlaniMi(hedef: EventTarget | null): boolean {
  return hedef instanceof HTMLElement && (hedef.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(hedef.tagName));
}
// Okuyucunun dışında bir pencere (onay gibi) açıkken tuşlar o pencerenindir.
function baskaPencereAcik(kok: HTMLElement | null): boolean {
  return [...document.querySelectorAll('[role="dialog"]')].some((p) => kok === null || !p.contains(kok));
}
const PARLAMA_MS = 1200;
const TON_ADI: Readonly<Record<OkutmaTonu, string>> = { tamam: 'doğru', uyari: 'uyarı', hata: 'yanlış' };

function OkutmaSeridi({ g }: { g: OkutmaGecmisi }) {
  return (
    <div className="tc-kod-okuyucu-serit">
      <div className="tc-kod-okuyucu-serit-ust">
        <span>Son okutmalar</span>
        <Dugme className="tc-kod-okuyucu-ses" simge="bell" aria-pressed={g.sesAcik} onClick={g.sesDegistir}>{g.sesAcik ? 'Ses açık' : 'Ses kapalı'}</Dugme>
      </div>
      {g.son.length === 0
        ? <p className="tc-kod-okuyucu-serit-bos">Henüz okutma yok.</p>
        : (
          <ol aria-label="Son okutmalar">
            {g.son.map((k) => (
              <li key={k.kimlik} data-ton={k.ton}>
                <span className="tc-kod-okuyucu-nokta" aria-label={TON_ADI[k.ton]} role="img" />
                <b>{k.kod}</b>
                <span>{k.zaman} · {k.metin}</span>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}

function useParlama(g: OkutmaGecmisi | undefined): OkutmaTonu | null {
  const ilk = g?.son[0];
  const [parlak, setParlak] = useState<{ kimlik: number; ton: OkutmaTonu } | null>(null);
  useEffect(() => {
    if (!ilk) return;
    setParlak({ kimlik: ilk.kimlik, ton: ilk.ton });
    const z = window.setTimeout(() => setParlak((p) => (p?.kimlik === ilk.kimlik ? null : p)), PARLAMA_MS);
    return () => window.clearTimeout(z);
  }, [ilk]);
  return parlak?.ton ?? null;
}

export function KodOkuyucu({ okundu: kodOkundu, bekliyor = false, ipucu, kendiliginden = false, dokunmatikteOdakYok = false, sik = false, alansiz = false, kameraAcik = false, geribildirim, komut }: {
  okundu: (kod: string) => void; bekliyor?: boolean; ipucu?: string; kendiliginden?: boolean; dokunmatikteOdakYok?: boolean; sik?: boolean;
  alansiz?: boolean; kameraAcik?: boolean; geribildirim?: OkutmaGecmisi; komut?: KomutIsleyici;
}) {
  const okundu = (kod: string) => {
    const k = komut ? kodTuru(kod) : null;
    if (!komut || k?.tur !== 'komut') { kodOkundu(kod); return; }
    const s = komut(k.komut);
    geribildirim?.bildir(kod, s?.ton ?? 'uyari', s?.metin ?? KOMUT_YOK);
  };
  const parlak = useParlama(geribildirim);
  const tonu = parlak ? { 'data-ton': parlak } : {};
  const [elle, setElleDurumu] = useState('');
  const elleSon = useRef('');
  const setElle = (deger: string) => { elleSon.current = deger; setElleDurumu(deger); };
  const kamera = useKamera(okundu);
  const { ac, kapat } = kamera;
  useEffect(() => { if (kendiliginden) void ac(); }, [kendiliginden, ac]);
  useEffect(() => { if (!alansiz) return; if (kameraAcik) void ac(); else kapat(); }, [alansiz, kameraAcik, ac, kapat]);
  const [acilistaOdak] = useState(() => !alansiz && (!dokunmatikteOdakYok || inceIsaretci()));
  const form = useRef<HTMLFormElement | null>(null);
  const kok = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (dokunmatikteOdakYok && kamera.hata) form.current?.querySelector('input')?.focus(); }, [dokunmatikteOdakYok, kamera.hata]);
  // Alan odaksızken (tablet) el okuyucunun fiziksel tuşları hiçbir yere yazılmazdı. Odak bir yazı alanında değilse yazdırılabilir tuşlar
  // koda eklenir, Enter gönderir; alan odak almadığı için ekran klavyesi yine açılmaz. Yakalama aşamasında dinlenir: odaktaki düğme
  // okutmanın tuşlarıyla tıklanmasın.
  const sonOkundu = useRef(okundu);
  useEffect(() => { sonOkundu.current = okundu; });
  useEffect(() => {
    if (acilistaOdak) return;
    const tus = (o: KeyboardEvent) => {
      if (o.defaultPrevented || o.ctrlKey || o.altKey || o.metaKey || yaziAlaniMi(o.target) || baskaPencereAcik(kok.current)) return;
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
  if (alansiz) {
    return (
      <div ref={kok} className="tc-kod-okuyucu tc-kod-okuyucu-sik" {...tonu}>
        <div className="tc-kod-okuyucu-kamera" data-acik={kamera.acik ? '' : undefined} hidden={!kamera.acik}>
          <video ref={kamera.video} muted playsInline aria-label="Kamera görüntüsü" />
          <canvas ref={kamera.tuval} hidden />
          <span className="tc-kod-okuyucu-cerceve" aria-hidden="true" />
        </div>
        {kamera.hata && <p className="tc-kod-okuyucu-hata" role="status">{kamera.hata}</p>}
      </div>
    );
  }
  if (sik) {
    return (
      <div ref={kok} className="tc-kod-okuyucu tc-kod-okuyucu-sik" {...tonu}>
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
        {geribildirim && <OkutmaSeridi g={geribildirim} />}
        {dosyaGirdisi}
      </div>
    );
  }
  return (
    <div ref={kok} className="tc-kod-okuyucu" {...tonu}>
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
      {geribildirim && <OkutmaSeridi g={geribildirim} />}
      {dosyaGirdisi}
    </div>
  );
}
