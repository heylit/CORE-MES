import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Sayfa } from '#paylasilan/sayfalar.ts';
import { menudeGorunur } from '#paylasilan/sayfalar.ts';
import type { SayfaTanimi } from '#paylasilan/sayfa-tanimi.ts';
import { KAYIT_TURLERI, aramaSorgusunuAyir, type KayitTuru } from '#paylasilan/kayit-aramasi.ts';
import { ara, aramaDizini, sadelestir } from '../rota/arama-dizini.ts';
import { komutAra, type Komut } from '../rota/komutlar.ts';
import type { SayfaKomutu } from '../rota/sayfa-komutlari.ts';
import { yerAdi } from '../rota/gezinme-gecmisi.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { useKayitAramasi, type KayitKaynagi } from '../veri/kayit-aramasi.ts';
import { Simge } from './Simge.tsx';
import './arama.css';

interface Ozellikler {
  sayfalar: readonly Sayfa[];
  menuler: readonly IkinciMenu[];
  islemler: readonly string[];
  // Kişinin görmediği, yalnız kayıtlarını arayabildiği sayfalar: sayfa olarak listelenmez, kayıt kaynağı olur.
  aramaSayfalari?: readonly Sayfa[];
  // Kişiye açık genel komutlar (modüllerin komutlar.ts bildirimi, süzülmüş).
  komutlar?: readonly Komut[];
  // Açık sayfanın o an çalıştırabileceği komutlar; boş sorguda da listelenir. Önerilerin (değer alan komut) sırası korunur.
  sayfaKomutlari?: readonly SayfaKomutu[];
  // Paletin sorgusu değişince (kapalıyken null): değer alan komutu öneren sayfa bunu dinler.
  sorguDegisti?: (sorgu: string | null) => void;
  // Geri yöndeki son yerler (en yakını başta, adım sayısıyla); boş sorguda listelenir, seçilince o adıma dönülür.
  sonYerler?: readonly { yol: string; adim: number }[];
}

interface Satir {
  anahtar: string;
  tur: 'sayfa' | 'madde' | 'kayit' | 'komut' | 'sayfa-komutu' | 'son-yer';
  baslik: string;
  ust: string | null;
  ad: string;
  grup: string | null;
  aciklama: string | null;
  // Sayfa komutunda adres yoktur; seçilince sayfanın işlevi çalışır.
  yol: string | null;
  simge: SimgeAdi;
  calistir?: () => void;
}

const SAYFASIZ: readonly Sayfa[] = [];
const YERSIZ: readonly { yol: string; adim: number }[] = [];
const KOMUTSUZ: readonly Komut[] = [];
const SAYFA_KOMUTSUZ: readonly SayfaKomutu[] = [];
// Boş sorguda açık sayfanın komutlarından en çok bu kadarı görünür; yazınca süzülür.
const BOS_SORGUDA_SAYFA_KOMUTU = 12;
const SAYFA_KOMUTU_GRUBU = 'Bu sayfa';
const KOMUT_GRUBU = 'Komut';
const SON_YER_GRUBU = 'Son yerler';

// Çekirdekten gelen kaydın simgesi türünden, eski kaynaktan gelenin simgesi sayfasındandır.
const KAYIT_SIMGESI: Record<KayitTuru, SimgeAdi> = {
  emir: 'list', malzeme: 'tag', parti: 'box', konum: 'target', firma: 'building', kisi: 'user', talep: 'edit', alim: 'truck',
  siparis: 'download', sevk: 'route', ncr: 'alert', hatali: 'wrench', cizim: 'fit', rota: 'tool', olcuAleti: 'ruler', istasyon: 'cpu',
};

const TUR_ADI: Record<Satir['tur'], string> = { sayfa: 'Sayfa', madde: 'Menü maddesi', kayit: 'Kayıt', komut: 'Komut', 'sayfa-komutu': 'Bu sayfanın komutu', 'son-yer': 'Son yer' };

// Eşleşen parçalar arama dizininin kuralıyla bulunur (Türkçe harf ve büyük-küçük farkı yok): "okut" "Okut"u, "cek" "Çek"i işaretler.
// Harf harf sadeleştirilir ki işaretin yeri özgün metindeki yerle aynı kalsın.
function isaretle(metin: string, sorgu: string): ReactNode {
  const sozcukler = sadelestir(sorgu).split(' ').filter((s) => s !== '');
  if (sozcukler.length === 0) return metin;
  const sade = Array.from(metin.split(''), (h) => {
    if (/\s/.test(h)) return ' ';
    const k = sadelestir(h);
    return k.length === 1 ? k : h;
  }).join('');
  const isaretli = new Array<boolean>(metin.length).fill(false);
  for (const s of sozcukler) {
    for (let i = sade.indexOf(s); i !== -1; i = sade.indexOf(s, i + 1)) isaretli.fill(true, i, i + s.length);
  }
  const parcalar: ReactNode[] = [];
  let bas = 0;
  for (let i = 1; i <= metin.length; i += 1) {
    if (i < metin.length && isaretli[i] === isaretli[bas]) continue;
    const parca = metin.slice(bas, i);
    parcalar.push(isaretli[bas] ? <mark key={bas} className="tc-arama-isaret">{parca}</mark> : parca);
    bas = i;
  }
  return parcalar;
}

function Onizleme({ satir }: { satir: Satir | null }) {
  return (
    <aside className="tc-arama-onizleme" aria-label="Önizleme" onMouseDown={(o) => { o.preventDefault(); }}>
      {satir === null
        ? <p className="tc-arama-onizleme-bos">Yazdıkça sayfalar, menü maddeleri, komutlar ve kayıtlar süzülür.</p>
        : (
          <div className="tc-arama-onizleme-ic" key={satir.anahtar}>
            <span className="tc-arama-onizleme-simge"><Simge ad={satir.simge} boyut="b" /></span>
            <p className="tc-arama-onizleme-baslik">{satir.baslik}</p>
            <dl className="tc-arama-onizleme-bilgi">
              <dt>Tür</dt><dd>{TUR_ADI[satir.tur]}</dd>
              {satir.ust !== null && <><dt>Yer</dt><dd>{satir.grup === null ? satir.ust : `${satir.ust} › ${satir.grup}`}</dd></>}
              {satir.tur === 'kayit' && satir.grup !== null && <><dt>Modül</dt><dd>{satir.grup}</dd></>}
              {satir.aciklama !== null && <><dt>Açıklama</dt><dd>{satir.aciklama}</dd></>}
              {satir.yol !== null && <><dt>Adres</dt><dd className="mono">{satir.yol}</dd></>}
            </dl>
          </div>
        )}
      <p className="tc-arama-onizleme-tuslar">
        <kbd className="mono">↑</kbd><kbd className="mono">↓</kbd> gezin <kbd className="mono">Enter</kbd> {satir?.tur === 'sayfa-komutu' ? 'çalıştır' : 'aç'} <kbd className="mono">Esc</kbd> kapat
      </p>
    </aside>
  );
}

// Eski arama ucu bildiren ve kişinin gördüğü (ya da yalnız arayabildiği) sayfalar; yetkiyi yine uç denetler.
function kayitKaynaklari(sayfalar: readonly Sayfa[]): (KayitKaynagi & { simge: SimgeAdi })[] {
  return sayfalar.filter(menudeGorunur).flatMap((s) => {
    const uc = (s as Pick<SayfaTanimi, 'aramaUcu'>).aramaUcu;
    return uc === undefined ? [] : [{ uc, ad: s.baslik, simge: s.simge }];
  });
}

// Üst çubuktaki arama ve komut paleti (Ctrl K). Sıra: açık sayfanın komutları ("Bu sayfa"; boş sorguda da görünür), boş sorguda son yerler, sayfa
// ve menü maddeleri, modüllerin genel komutları (sunucuya gitmeden), altında kayıtlar (çekirdeğin tek arama ucu ve henüz ona geçmemiş
// modüllerin eski uçları). Komut
// yazma yapmaz: genel komut modülün ekranını açar, sayfa komutu sayfanın kendi işlevini çağırır; yetki yine uçtadır. Çerçeveli modülün içindeki tuşlar modülündür: tuş çerçevenin belgesine gider, buraya ulaşmaz.
// Açılınca kutu ortada komut paleti olur, arkası perdelenir; geniş ekranda sağda seçili sonucun önizlemesi durur. Kutu DOM'da
// üst çubukta kalır (yalnız görünüşü taşınır): odak, tuş ve ekran okuyucu düzeni kapalı kutuyla aynıdır.
// Telefonda yalnız simge düğmesi görünür; dokununca palet ekranın üstünde açılır.
export function GenelArama({
  sayfalar, menuler, islemler, aramaSayfalari = SAYFASIZ, komutlar = KOMUTSUZ, sayfaKomutlari = SAYFA_KOMUTSUZ, sorguDegisti,
  sonYerler = YERSIZ,
}: Ozellikler) {
  const gezin = useNavigate();
  const [sorgu, sorguYaz] = useState('');
  const [acik, acikYaz] = useState(false);
  const [secili, seciliYaz] = useState(0);
  const kutu = useRef<HTMLInputElement>(null);
  const kap = useRef<HTMLDivElement>(null);
  const kimlik = useId();
  const listeKimlik = `${kimlik}-liste`;
  const dizin = useMemo(() => aramaDizini(sayfalar, menuler, islemler), [sayfalar, menuler, islemler]);
  const kaynaklar = useMemo(() => kayitKaynaklari([...sayfalar, ...aramaSayfalari]), [sayfalar, aramaSayfalari]);
  const kayitlar = useKayitAramasi(kaynaklar, acik ? sorgu : '');
  // Önekli sorgu ("e:1234") yalnız o türün kayıtlarını arar: sayfa, komut ve son yer listelenmez, işaret öneksiz metindedir.
  const { tur: suzgec, q: aramaMetni } = aramaSorgusunuAyir(sorgu);
  const sayfaSonuclari = useMemo(() => (suzgec === null ? ara(dizin, sorgu) : []), [dizin, sorgu, suzgec]);
  // Öneriler sayfanın yazılana verdiği cevaptır: metinle yeniden süzülmez, sabit komutların önünde durur.
  const sayfaKomutSonuclari = useMemo(() => {
    const sabit = sayfaKomutlari.filter((k) => k.oneri !== true);
    if (sorgu.trim() === '') return sabit.slice(0, BOS_SORGUDA_SAYFA_KOMUTU);
    if (suzgec !== null) return [];
    return [...sayfaKomutlari.filter((k) => k.oneri === true), ...komutAra(sabit, sorgu)];
  }, [sayfaKomutlari, sorgu, suzgec]);
  useEffect(() => { sorguDegisti?.(acik ? sorgu : null); }, [sorguDegisti, acik, sorgu]);
  const komutSonuclari = useMemo(() => (suzgec === null ? komutAra(komutlar, sorgu) : []), [komutlar, sorgu, suzgec]);
  // Yazınca yerini sayfa sonuçları alır: aynı sayfa iki kez listelenmez.
  const sonYerSonuclari = sorgu.trim() === '' ? sonYerler : YERSIZ;
  const sonuclar = useMemo<Satir[]>(() => [
    ...sayfaKomutSonuclari.map((k, sira): Satir => ({
      anahtar: `bu-sayfa#${sira}#${k.anahtar}`, tur: 'sayfa-komutu', baslik: k.baslik, ust: null, ad: k.baslik,
      grup: SAYFA_KOMUTU_GRUBU, aciklama: k.aciklama, yol: null, simge: k.simge, calistir: k.calistir,
    })),
    ...sonYerSonuclari.map((y): Satir => {
      const ad = yerAdi(y.yol, menuler);
      return {
        anahtar: `son-yer#${y.adim}`, tur: 'son-yer', baslik: ad, ust: null, ad, grup: SON_YER_GRUBU, aciklama: null, yol: y.yol,
        simge: 'clock', calistir: () => { void gezin(y.adim); },
      };
    }),
    ...sayfaSonuclari.map((s): Satir => ({
      anahtar: s.anahtar, tur: s.ust === null ? 'sayfa' : 'madde', baslik: s.baslik, ust: s.ust,
      ad: s.ust === null ? s.baslik : `${s.ust} › ${s.baslik}`, grup: s.grup, aciklama: null, yol: s.yol, simge: s.simge,
    })),
    ...komutSonuclari.map((k): Satir => ({
      anahtar: `komut#${k.anahtar}`, tur: 'komut', baslik: k.baslik, ust: null, ad: k.baslik, grup: KOMUT_GRUBU,
      aciklama: k.aciklama, yol: k.yol, simge: k.simge,
    })),
    ...kayitlar.sonuclar.map((k): Satir => ({
      anahtar: k.anahtar, tur: 'kayit', baslik: k.baslik, ust: null, ad: k.baslik, grup: k.kaynak, aciklama: k.aciklama, yol: k.yol,
      simge: k.tur === null ? kaynaklar.find((y) => y.ad === k.kaynak)?.simge ?? 'search' : KAYIT_SIMGESI[k.tur],
    })),
  ], [sayfaKomutSonuclari, sonYerSonuclari, menuler, gezin, sayfaSonuclari, komutSonuclari, kayitlar.sonuclar, kaynaklar]);
  const komutVar = komutlar.length > 0 || sayfaKomutlari.length > 0;
  const etiket = komutVar
    ? (kaynaklar.length > 0 ? 'Sayfa, kayıt ya da komut ara' : 'Sayfa ya da komut ara')
    : (kaynaklar.length > 0 ? 'Sayfa ya da kayıt ara' : 'Sayfa ya da menü ara');
  const listeAcik = acik && (sorgu.trim() !== '' || sayfaKomutSonuclari.length > 0 || sonYerSonuclari.length > 0);

  // Modülün kendi Ctrl K'sı (stokta ve satın almada kendi araması) önce gelir. Kabuk tuşu en önce (yakalama evresinde)
  // görür ve tarayıcının kendi Ctrl K'sını hemen durdurur; modülün dinleyicisi tuşu işlerse (preventDefault çağırırsa)
  // bunu öğrenmek için çağrı sayılır. Olay bitince modül işlememişse kabuğun kutusu açılır.
  useEffect(() => {
    const tus = (o: globalThis.KeyboardEvent) => {
      if (!(o.ctrlKey || o.metaKey) || o.altKey || o.key.toLocaleLowerCase('tr') !== 'k') return;
      const durdur = o.preventDefault.bind(o);
      let modulAldi = false;
      Object.defineProperty(o, 'preventDefault', { configurable: true, value: () => { modulAldi = true; durdur(); } });
      durdur();
      window.setTimeout(() => {
        if (modulAldi) return;
        acikYaz(true);
        kutu.current?.focus();
        kutu.current?.select();
      }, 0);
    };
    window.addEventListener('keydown', tus, true);
    return () => { window.removeEventListener('keydown', tus, true); };
  }, []);

  const kapat = () => { acikYaz(false); sorguYaz(''); seciliYaz(0); };
  const git = (yol: string) => {
    kapat();
    kutu.current?.blur();
    void gezin(yol);
  };
  // Sayfa komutu palet kapandıktan sonra çalışır: açtığı pencere odağı alabilsin.
  const sec = (satir: Satir) => {
    if (satir.calistir !== undefined) {
      kapat();
      kutu.current?.blur();
      satir.calistir();
    } else if (satir.yol !== null) git(satir.yol);
  };
  const tusla = (o: KeyboardEvent<HTMLInputElement>) => {
    if (o.key === 'Escape') {
      o.preventDefault();
      kapat();
      kutu.current?.blur();
      return;
    }
    if (!listeAcik || sonuclar.length === 0) return;
    if (o.key === 'ArrowDown' || o.key === 'ArrowUp') {
      o.preventDefault();
      const son = sonuclar.length - 1;
      seciliYaz((s) => (o.key === 'ArrowDown' ? (s >= son ? 0 : s + 1) : (s <= 0 ? son : s - 1)));
    } else if (o.key === 'Enter') {
      o.preventDefault();
      const hedef = sonuclar[Math.min(secili, sonuclar.length - 1)];
      if (hedef) sec(hedef);
    }
  };
  const seciliSira = Math.min(secili, sonuclar.length - 1);
  const seciliKimlik = listeAcik && sonuclar.length > 0 ? `${listeKimlik}-${seciliSira}` : undefined;
  const seciliSatir = listeAcik ? sonuclar[seciliSira] ?? null : null;
  // Klavyeyle gezilen satır görünür alanda kalsın; liste kendi içinde kayar.
  useEffect(() => {
    if (seciliKimlik === undefined) return;
    document.getElementById(seciliKimlik)?.scrollIntoView?.({ block: 'nearest' });
  }, [seciliKimlik]);

  return (
    <div
      ref={kap}
      className="tc-arama"
      data-acik={acik ? '' : undefined}
      onBlur={(o) => { if (!kap.current?.contains(o.relatedTarget as Node | null)) { acikYaz(false); } }}
    >
      <button
        type="button"
        className="tc-kabuk-tema tc-arama-dugme"
        aria-label="Ara"
        onClick={() => { acikYaz(true); requestAnimationFrame(() => { kutu.current?.focus(); }); }}
      >
        <Simge ad="search" />
      </button>
      {acik && (
        <div
          className="tc-arama-perde"
          aria-hidden="true"
          onMouseDown={(o) => { o.preventDefault(); acikYaz(false); kutu.current?.blur(); }}
        />
      )}
      <div className="tc-arama-palet">
        <label className="tc-arama-kutu">
          <Simge ad="search" boyut="k" />
          <input
            ref={kutu}
            type="search"
            role="combobox"
            aria-label={etiket}
            aria-expanded={listeAcik}
            aria-controls={listeKimlik}
            aria-autocomplete="list"
            aria-activedescendant={seciliKimlik}
            placeholder={etiket}
            autoComplete="off"
            spellCheck={false}
            value={sorgu}
            onChange={(o) => { sorguYaz(o.target.value); seciliYaz(0); acikYaz(true); }}
            onFocus={() => { acikYaz(true); }}
            onKeyDown={tusla}
          />
          <kbd className="tc-arama-tus mono" aria-hidden="true">Ctrl K</kbd>
          <button type="button" className="tc-arama-kapat" aria-label="Aramayı kapat" onClick={() => { kapat(); kutu.current?.blur(); }}>
            <Simge ad="x" boyut="k" />
          </button>
        </label>
        <div id={listeKimlik} role="listbox" aria-label="Arama sonuçları" className="tc-arama-liste" hidden={!listeAcik}>
          {listeAcik && suzgec !== null && <p className="tc-arama-bos" role="status">Yalnız {KAYIT_TURLERI[suzgec].ad}</p>}
          {listeAcik && sonuclar.length === 0 && !kayitlar.suruyor && !kayitlar.hata && <p className="tc-arama-bos">Sonuç yok</p>}
          {listeAcik && sonuclar.map((s, sira) => (
            <div
              key={s.anahtar}
              id={`${listeKimlik}-${sira}`}
              role="option"
              aria-selected={sira === seciliSira}
              // İşaret parçaları ekran okuyucuda sözcüğü bölmesin: ad işaretsiz metinden kurulur.
              aria-label={[s.ad, s.aciklama, s.grup].filter((p) => p !== null).join(' ')}
              className="tc-arama-sonuc"
              // Tıklama girişten odağı almadan önce seçilsin: kutu kapanmadan gidilir.
              onMouseDown={(o) => { o.preventDefault(); }}
              onClick={() => { sec(s); }}
              onMouseEnter={() => { seciliYaz(sira); }}
            >
              <Simge ad={s.simge} boyut="k" />
              <span className="tc-arama-ad">
                {isaretle(s.ad, aramaMetni)}
                {s.aciklama !== null && <span className="tc-arama-aciklama">{s.aciklama}</span>}
              </span>
              {s.grup !== null && <span className="tc-arama-grup">{s.grup}</span>}
            </div>
          ))}
          {listeAcik && kayitlar.suruyor && <p className="tc-arama-bos" role="status">Kayıtlar aranıyor</p>}
          {listeAcik && !kayitlar.suruyor && kayitlar.hata && <p className="tc-arama-bos" role="status">Kayıt araması cevap vermedi</p>}
          {listeAcik && !kayitlar.suruyor && kayitlar.eksik.length > 0 && (
            <p className="tc-arama-bos" role="status">Cevap vermeyen: {kayitlar.eksik.join(', ')}</p>
          )}
        </div>
        {acik && <Onizleme satir={seciliSatir} />}
      </div>
    </div>
  );
}
