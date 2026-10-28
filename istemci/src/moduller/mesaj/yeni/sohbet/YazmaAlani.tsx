import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Menu, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useMesaj } from '../durum.tsx';
import { duzMetin, EMOJILER } from '../kurallar.ts';
import { KisiRozeti } from '../ortak/index.ts';
import { ekYukle, useKisiselDeger } from '../veri.ts';
import { TASLAK_TEMIZLE } from './ortak.ts';
import { bahisAdaylari, bahisSorgusu } from './yardimci.ts';

export interface Yanit { id: string; by: string; text: string }

interface Ozellikler {
  kanal: string;
  kanalAdi: string;
  yanit: Yanit | null;
  yanitYaz: (y: Yanit | null) => void;
  duyuruKipi: boolean;
  duyuruKipiYaz: (acik: boolean) => void;
  // Boş alanda yukarı ok: kendi son iletisini düzenler.
  sonunuDuzenle: () => void;
  // Oda durumu (yazıyor); oda kanal görünümünde bir kez yoklanır.
  durumYaz: (yama: Record<string, unknown>) => void;
}

const YAZIYOR_MS = 3500;
const TASLAK_GECIKMESI_MS = 800;
const EK_TURLERI = 'image/*,video/*,application/pdf,text/plain,text/csv';
const dokunmatik = () => typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;

// Yazma alanı (composer): ekle menüsü, emoji, @kişi tamamlama, yanıt ve duyuru şeridi, taslak, yazıyor bilgisi, dosya.
export function YazmaAlani({ kanal, kanalAdi, yanit, yanitYaz, duyuruKipi, duyuruKipiYaz, sonunuDuzenle, durumYaz }: Ozellikler) {
  const { ben, ad, kisiler, yetki, gonder, duyuruGonder, formAc } = useMesaj();
  const { bildir } = useBildirim();
  // Tamamlamadan seçilen adlar (mentionMap): aynı adlı iki kişiden seçilen kodlanır.
  const secilenler = useRef(new Map<string, string>());
  const bilinen = secilenler.current;
  const [taslaklar, taslaklariYaz] = useKisiselDeger<Record<string, string>>(ben.id, 'drafts', {});
  const [metin, metinYaz] = useState(() => taslaklar[kanal] ?? '');
  const [emoji, emojiYaz] = useState(false);
  const [yukleniyor, yukleniyorYaz] = useState(false);
  const [oneri, oneriYaz] = useState<{ ogeler: { id: string; ad: string }[]; secili: number; bas: number } | null>(null);
  const alan = useRef<HTMLTextAreaElement>(null);
  const dosya = useRef<HTMLInputElement>(null);
  const yaziyor = useRef<{ acik: boolean; zamanlayici: number }>({ acik: false, zamanlayici: 0 });
  const taslakZamanlayici = useRef(0);
  const oneriZamanlayici = useRef(0);
  const taslakGuncel = useRef(taslaklar);
  taslakGuncel.current = taslaklar;

  const yaziyorBitti = () => {
    window.clearTimeout(yaziyor.current.zamanlayici);
    if (yaziyor.current.acik) { yaziyor.current.acik = false; durumYaz({ typing: null }); }
  };
  const taslakKaydet = (k: string, deger: string) => {
    window.clearTimeout(taslakZamanlayici.current);
    taslakZamanlayici.current = window.setTimeout(() => {
      const yeni = { ...taslakGuncel.current };
      if (deger.trim()) yeni[k] = deger; else delete yeni[k];
      taslaklariYaz(yeni);
    }, TASLAK_GECIKMESI_MS);
  };

  useEffect(() => {
    metinYaz(taslakGuncel.current[kanal] ?? '');
    oneriYaz(null);
    emojiYaz(false);
    if (!dokunmatik()) alan.current?.focus({ preventScroll: true });
    return yaziyorBitti;
  }, [kanal]);

  useEffect(() => {
    const temizle = (o: Event) => { if ((o as CustomEvent<string>).detail === kanal) { metinYaz(''); taslakKaydet(kanal, ''); } };
    window.addEventListener(TASLAK_TEMIZLE, temizle);
    return () => { window.removeEventListener(TASLAK_TEMIZLE, temizle); };
  }, [kanal]);

  // Bileşen kapanınca bekleyen zamanlayıcı çalışmaz: öneri kapatma `document`'e bakar, sayfa ya da test ortamı o sırada gitmiş olabilir.
  useEffect(() => () => { window.clearTimeout(taslakZamanlayici.current); window.clearTimeout(oneriZamanlayici.current); }, []);

  if (!yetki.yaz) return <div className="tc-ms-salt-okur">Bu çalışma alanında yalnızca okuma iznin var.</div>;

  const oneriGuncelle = (deger: string, imlec: number) => {
    const s = bahisSorgusu(deger, imlec);
    if (!s) { oneriYaz(null); return; }
    const ogeler = bahisAdaylari(kisiler, s.sorgu, ben.id, true);
    oneriYaz(ogeler.length > 0 ? { ogeler, secili: 0, bas: s.bas } : null);
  };

  const degisti = (deger: string, imlec: number) => {
    metinYaz(deger);
    oneriGuncelle(deger, imlec);
    taslakKaydet(kanal, deger);
    if (!deger.trim()) { yaziyorBitti(); return; }
    if (!yaziyor.current.acik) { yaziyor.current.acik = true; durumYaz({ typing: kanal }); }
    window.clearTimeout(yaziyor.current.zamanlayici);
    yaziyor.current.zamanlayici = window.setTimeout(yaziyorBitti, YAZIYOR_MS);
  };

  const ekle = (parca: string) => {
    const ta = alan.current;
    const bas = ta?.selectionStart ?? metin.length;
    const son = ta?.selectionEnd ?? bas;
    const yeni = metin.slice(0, bas) + parca + metin.slice(son);
    degisti(yeni, bas + parca.length);
    window.requestAnimationFrame(() => { ta?.focus(); ta?.setSelectionRange(bas + parca.length, bas + parca.length); });
  };

  const oneriSec = (i: number) => {
    const o = oneri?.ogeler[i];
    const ta = alan.current;
    if (!o || !oneri) return;
    const imlec = ta?.selectionStart ?? metin.length;
    const parca = `@${o.id === '__all' ? 'herkes' : o.ad} `;
    if (o.id !== '__all') secilenler.current.set(o.ad, o.id);
    const yeni = metin.slice(0, oneri.bas) + parca + metin.slice(imlec);
    const konum = oneri.bas + parca.length;
    oneriYaz(null);
    degisti(yeni, konum);
    window.requestAnimationFrame(() => { ta?.focus(); ta?.setSelectionRange(konum, konum); });
  };

  const gonderMetni = async () => {
    const ham = metin;
    const temiz = ham.trim();
    if (!temiz) return;
    const y = yanit;
    const d = duyuruKipi;
    metinYaz(''); oneriYaz(null); yaziyorBitti(); taslakKaydet(kanal, '');
    yanitYaz(null); duyuruKipiYaz(false);
    try {
      if (d) await duyuruGonder({ kanal, metin: temiz, bilinen });
      else await gonder({ kanal, metin: temiz, bilinen, ...(y ? { ek: { replyTo: { id: y.id, by: y.by, text: y.text.slice(0, 200) } } } : {}) });
    } catch {
      metinYaz(ham); taslakKaydet(kanal, ham); yanitYaz(y); duyuruKipiYaz(d);
    }
  };

  const dosyaGonder = async (f: File) => {
    yukleniyorYaz(true);
    const aciklama = metin.trim();
    try {
      const att = await ekYukle(f);
      metinYaz(''); taslakKaydet(kanal, '');
      await gonder({ kanal, metin: aciklama, bilinen, ek: { att } });
    } catch (hata) {
      if (hata instanceof Error && /sınır/i.test(hata.message)) bildir('hata', hata.message);
      else bildir('hata', 'Dosya yüklenemedi. Desteklenen türler: görsel, video, PDF, metin, CSV.');
    }
    yukleniyorYaz(false);
  };

  const tus = (o: KeyboardEvent<HTMLTextAreaElement>) => {
    if (oneri) {
      if (o.key === 'ArrowDown' || o.key === 'ArrowUp') {
        o.preventDefault();
        const n = oneri.ogeler.length;
        oneriYaz({ ...oneri, secili: (oneri.secili + (o.key === 'ArrowDown' ? 1 : -1) + n) % n });
        return;
      }
      if (o.key === 'Enter' || o.key === 'Tab') { o.preventDefault(); oneriSec(oneri.secili); return; }
      if (o.key === 'Escape') { o.preventDefault(); oneriYaz(null); return; }
    }
    if (o.key === 'Enter' && !o.shiftKey && !o.nativeEvent.isComposing && !dokunmatik()) { o.preventDefault(); void gonderMetni(); return; }
    if (o.key === 'ArrowUp' && !metin) { o.preventDefault(); sonunuDuzenle(); return; }
    if (o.key === 'Escape' && (yanit || duyuruKipi)) { o.preventDefault(); yanitYaz(null); duyuruKipiYaz(false); }
  };

  return (
    <div className="tc-ms-yazma">
      {yanit && (
        <div className="tc-ms-serit">
          <Simge ad="chev-left" />
          <div><b>{ad(yanit.by)}</b> kişisine yanıt<span>{duzMetin(yanit.text, ad).slice(0, 90)}</span></div>
          <button type="button" className="tc-ms-arac" aria-label="Yanıtı iptal et" onClick={() => { yanitYaz(null); }}><Simge ad="x" /></button>
        </div>
      )}
      {duyuruKipi && (
        <div className="tc-ms-serit tc-ms-serit-duyuru">
          <Simge ad="bell" />
          <div><b>Duyuru</b><span>Herkes “Okudum” diyecek; kimin okumadığını görebileceksin.</span></div>
          <button type="button" className="tc-ms-arac" aria-label="Duyuruyu iptal et" onClick={() => { duyuruKipiYaz(false); }}><Simge ad="x" /></button>
        </div>
      )}
      {oneri && (
        <ul className="tc-ms-oneriler" role="listbox" aria-label="Kişi önerileri">
          {oneri.ogeler.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === oneri.secili}>
              <button type="button" className="tc-ms-oneri" onPointerDown={(e) => { e.preventDefault(); oneriSec(i); }} onClick={() => { oneriSec(i); }}>
                {o.id === '__all'
                  ? <><span className="tc-ms-herkes-rozeti">@</span><span><b>@herkes</b> <small>kanaldaki herkese bildir</small></span></>
                  : <><KisiRozeti id={o.id} cevrimici /><span>{o.ad}</span></>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {emoji && (
        <div className="tc-ms-emojiler" role="group" aria-label="Emoji">
          {EMOJILER.map((e) => (
            <button key={e} type="button" className="tc-ms-emoji" aria-label={e} onClick={() => { emojiYaz(false); ekle(e); }}>{e}</button>
          ))}
        </div>
      )}
      <div className={`tc-ms-yazma-cubugu${duyuruKipi ? ' tc-ms-yazma-duyuru' : ''}`}>
        <Menu
          etiket="Ekle: dosya, görev, onay, duyuru" simge="plus" ipucu="Ekle: dosya, görev, onay, duyuru"
          ogeler={[
            { anahtar: 'dosya', baslik: 'Dosya ya da fotoğraf', simge: 'upload', sec: () => { dosya.current?.click(); } },
            { anahtar: 'gorev', baslik: 'Görev ver', simge: 'list', sec: () => { formAc({ tur: 'gorev', ilk: { cid: kanal } }); } },
            { anahtar: 'onay', baslik: 'Onay iste', simge: 'clipboard-check', sec: () => { formAc({ tur: 'onay', ilk: { cid: kanal } }); } },
            { anahtar: 'toplanti', baslik: 'Toplantı planla', simge: 'users', sec: () => { formAc({ tur: 'toplanti', ilk: { cid: kanal } }); } },
            { anahtar: 'duyuru', baslik: 'Duyuru yap (okundu onaylı)', simge: 'bell', sec: () => { duyuruKipiYaz(true); yanitYaz(null); alan.current?.focus(); } },
            { anahtar: 'zamanla', baslik: 'Mesajı zamanla', simge: 'clock', sec: () => { formAc({ tur: 'zamanla', kanal, metin, yazmaAlanindan: true }); } },
          ]}
        />
        <textarea
          ref={alan} className="tc-ms-yazma-alani" rows={1} aria-label="Mesaj yaz" value={metin}
          placeholder={duyuruKipi ? 'Duyuru metnini yaz… (herkes okundu onayı verecek)' : `#${kanalAdi} kanalına yaz…`}
          onChange={(o) => { degisti(o.target.value, o.target.selectionStart); }}
          onKeyDown={tus}
          onBlur={() => {
            window.clearTimeout(oneriZamanlayici.current);
            oneriZamanlayici.current = window.setTimeout(() => { if (document.activeElement !== alan.current) oneriYaz(null); }, 160);
          }}
        />
        <button type="button" className="tc-ms-arac" aria-label="Emoji" aria-expanded={emoji} onClick={() => { emojiYaz(!emoji); }}>😊</button>
        <button type="button" className="tc-ms-gonder" aria-label="Gönder" disabled={!metin.trim() || yukleniyor} onClick={() => { void gonderMetni(); }}>
          {yukleniyor ? <span className="tc-ms-doner" aria-hidden="true" /> : <Simge ad="next" />}
        </button>
        <input
          ref={dosya} type="file" hidden accept={EK_TURLERI} aria-label="Dosya seç"
          onChange={(o) => { const f = o.target.files?.[0]; o.target.value = ''; if (f) void dosyaGonder(f); }}
        />
      </div>
    </div>
  );
}
