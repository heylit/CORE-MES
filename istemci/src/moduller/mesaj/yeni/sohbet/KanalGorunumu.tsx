import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DurumKutusu, OnayPenceresi, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { gunEtiketi } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { bahisleriAc, bahisleriKodla, duzMetin } from '../kurallar.ts';
import { useKoleksiyon, useOda } from '../veri.ts';
import type { Ileti as IletiTipi, Kanal, Kayit } from '../tipler.ts';
import { Ileti, type IletiOlaylari } from './Ileti.tsx';
import { IletiBilgisi } from './IletiBilgisi.tsx';
import { IletiIslemleri } from './IletiIslemleri.tsx';
import { bilinenAdlar, SohbetOdasiBaglami } from './ortak.ts';
import { YazmaAlani, type Yanit } from './YazmaAlani.tsx';
import { ZamanliListesi } from './ZamanliListesi.tsx';
import {
  akisOgeleri, iletiIslemleri, sonOkunacak, tepkiYamasi, yanitBilgisi, yaziyorMetni, yazanlar, type IletiIslemi,
} from './yardimci.ts';

const ILETI_SINIRI = 400;
const ALTTA_PAYI = 120;
const YAZIYOR_YENILEME_MS = 4000;

// Açık kanal (chat): başlık, ileti akışı, yazıyor bilgisi ve yazma alanı.
export function KanalGorunumu({ kanal, hedefIleti }: { kanal: Kayit<Kanal>; hedefIleti: string | null }) {
  const { ben, ad, kisiHaritasi, veri, tercihler, yetki, yaz, git, formAc, okunduIsaretle, atlamaBitti } = useMesaj();
  const { esler, durumYaz } = useOda(true);
  const { bildir } = useBildirim();
  const tersten = useKoleksiyon<IletiTipi>(`channels/${kanal.id}/msgs`, { sira: ['ts', 'desc'], sinir: ILETI_SINIRI });
  const iletiler = useMemo(() => (tersten ? tersten.slice().reverse() : undefined), [tersten]);

  const [isaret, isaretYaz] = useState(() => tercihler.lastRead[kanal.id] ?? 0);
  const [yanit, yanitYaz] = useState<Yanit | null>(null);
  const [duyuruKipi, duyuruKipiYaz] = useState(false);
  const [duzenlenen, duzenlenenYaz] = useState<{ id: string; eslesme: ReadonlyMap<string, string> } | null>(null);
  const [menu, menuYaz] = useState<Kayit<IletiTipi> | null>(null);
  const [bilgi, bilgiYaz] = useState<Kayit<IletiTipi> | null>(null);
  const [silinecek, silinecekYaz] = useState<Kayit<IletiTipi> | null>(null);
  const [zamanliAcik, zamanliAcikYaz] = useState(false);
  const [simdi, simdiYaz] = useState(() => Date.now());
  const akis = useRef<HTMLDivElement>(null);
  const ilkAcilis = useRef(true);
  const altta = useRef(true);

  useEffect(() => {
    isaretYaz(tercihler.lastRead[kanal.id] ?? 0);
    yanitYaz(null); duyuruKipiYaz(false); duzenlenenYaz(null);
    ilkAcilis.current = true;
  }, [kanal.id]);

  useEffect(() => {
    const z = window.setInterval(() => { simdiYaz(Date.now()); }, YAZIYOR_YENILEME_MS);
    return () => { window.clearInterval(z); };
  }, []);

  // Görünür sekmede açık kanal okunmuş sayılır (markRead).
  useEffect(() => {
    if (!iletiler) return undefined;
    const isaretle = () => {
      if (document.hidden) return;
      const son = sonOkunacak(kanal, iletiler, ben.id);
      if ((tercihler.lastRead[kanal.id] ?? 0) < son) okunduIsaretle(kanal.id, son);
    };
    isaretle();
    document.addEventListener('visibilitychange', isaretle);
    return () => { document.removeEventListener('visibilitychange', isaretle); };
  }, [iletiler, kanal, tercihler.lastRead[kanal.id]]);

  // Açılışta "Yeni mesajlar" çizgisine ya da en alta; sonra altta duruluyorsa altta kalınır; hedef ileti ortaya alınır.
  useLayoutEffect(() => {
    const kutu = akis.current;
    if (!kutu || !iletiler) return;
    if (hedefIleti) {
      const el = document.getElementById(`ileti-${hedefIleti}`);
      if (el) { el.scrollIntoView?.({ block: 'center' }); el.classList.add('tc-ms-vurgu'); ilkAcilis.current = false; atlamaBitti(); return; }
    }
    if (ilkAcilis.current) {
      const cizgi = kutu.querySelector<HTMLElement>('.tc-ms-yeni-cizgisi');
      kutu.scrollTop = cizgi ? Math.max(0, cizgi.offsetTop - 80) : kutu.scrollHeight;
      ilkAcilis.current = false;
    } else if (altta.current) kutu.scrollTop = kutu.scrollHeight;
  }, [iletiler, hedefIleti]);

  const iletiyeGit = (id: string) => {
    const el = document.getElementById(`ileti-${id}`);
    if (!el) return;
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    el.classList.remove('tc-ms-vurgu'); void el.offsetWidth; el.classList.add('tc-ms-vurgu');
  };

  const yol = (m: Kayit<IletiTipi>) => `channels/${kanal.id}/msgs/${m.id}`;
  const sakla = (p: Promise<unknown>) => { p.catch(() => { /* ileti veri katmanında gösterildi */ }); };

  const duzenlemeKaydet = (metin: string) => {
    const d = duzenlenen;
    const m = iletiler?.find((x) => x.id === d?.id);
    duzenlenenYaz(null);
    const v = metin.trim();
    if (!m || !d || !v) return;
    const { out, ids } = bahisleriKodla(v, bilinenAdlar(kisiHaritasi, d.eslesme));
    if (out === m.text) return;
    sakla(yaz.guncelle(yol(m), { text: out, edited: Date.now(), mentions: ids }));
    if (m.kind === 'ann' && m.ref) sakla(yaz.guncelle(`duyurular/${m.ref}`, { text: out }));
  };

  // Düzenleme kendi iletimde; çözülen adlar kaydederken aynı kişiye kodlanır (startEdit).
  const duzenlemeyeBasla = (m: Kayit<IletiTipi>) => {
    if (m.by !== ben.id) return;
    duzenlenenYaz({ id: m.id, eslesme: bahisleriAc(m.text, ad).eslesme });
  };

  const yanitla = (m: Kayit<IletiTipi>) => { yanitYaz(yanitBilgisi(m)); duyuruKipiYaz(false); };

  const olaylar: IletiOlaylari = {
    tepki: (m, k) => { if (yetki.yaz && k) sakla(yaz.guncelle(yol(m), tepkiYamasi(m, k, ben.id))); },
    yanitla,
    menu: menuYaz,
    bilgi: bilgiYaz,
    git: iletiyeGit,
    duzenlemeKaydet,
    duzenlemeBirak: () => { duzenlenenYaz(null); },
  };

  const islemSec = (m: Kayit<IletiTipi>, islem: IletiIslemi) => {
    const duz = duzMetin(m.text ?? '', ad);
    switch (islem) {
      case 'yanitla': yanitla(m); break;
      case 'goreve': formAc({ tur: 'gorev', ilk: { title: duz.slice(0, 200), cid: kanal.id, mid: m.id, reply: yanitBilgisi(m) } }); break;
      case 'onaya': formAc({ tur: 'onay', ilk: { title: (duz.split('\n')[0] ?? '').slice(0, 120), note: duz, cid: kanal.id, mid: m.id, reply: yanitBilgisi(m) } }); break;
      case 'kopyala':
        void navigator.clipboard?.writeText(duz).then(() => { bildir('tamam', 'Kopyalandı.'); }, () => { bildir('hata', 'Kopyalanamadı.'); });
        break;
      case 'bilgi': bilgiYaz(m); break;
      case 'duzenle': duzenlemeyeBasla(m); break;
      case 'sil': silinecekYaz(m); break;
      default: break;
    }
  };

  const sonunuDuzenle = () => {
    const son = [...(iletiler ?? [])].reverse().find((m) => m.by === ben.id && m.kind === 'msg' && !m.deleted);
    if (son) duzenlemeyeBasla(son);
  };

  const cevrimici = new Set([ben.id, ...esler.map((e) => e.kisi)]).size;
  const oda = useMemo(() => ({ cevrimici: esler.map((e) => e.kisi), iletiler: iletiler ?? [] }), [esler, iletiler]);
  const bekleyenZamanli = veri.zamanli.filter((z) => z.status === 'bekliyor' && z.cid === kanal.id).length;
  const yaziyor = yaziyorMetni(yazanlar(esler, kanal.id, ben.id, simdi), ad);

  return (
    <SohbetOdasiBaglami.Provider value={oda}>
    <section className="tc-ms-kanal-gorunumu" aria-label={`#${kanal.name}`}>
      <header className="tc-ms-kanal-basligi">
        <button type="button" className="tc-ms-arac tc-ms-geri" aria-label="Kanallara dön" onClick={() => { git({ gorunum: 'sohbet' }); }}>
          <Simge ad="chev-left" />
        </button>
        <span className="tc-ms-kanal-simge" aria-hidden="true">{kanal.emoji || '#'}</span>
        <div className="tc-ms-kanal-basligi-metin">
          <h2>{kanal.name}</h2>
          <p>{cevrimici} kişi çevrimiçi{kanal.topic ? `, ${kanal.topic}` : ''}</p>
        </div>
        {bekleyenZamanli > 0 && (
          <button type="button" className="tc-ms-zamanli-dugme" title="Zamanlanmış mesajlar" onClick={() => { zamanliAcikYaz(true); }}>
            <Simge ad="clock" boyut="k" /><span>{bekleyenZamanli}</span>
          </button>
        )}
      </header>
      <div
        ref={akis} className="tc-ms-akis" role="log" aria-label="Mesajlar"
        onScroll={(o) => { const k = o.currentTarget; altta.current = k.scrollHeight - k.scrollTop - k.clientHeight < ALTTA_PAYI; }}
      >
        {!iletiler && <DurumKutusu durum="yukleniyor" />}
        {iletiler && (iletiler.length >= ILETI_SINIRI
          ? <div className="tc-ms-eski">Daha eski mesajlar gösterilmiyor.</div>
          : (
            <div className="tc-ms-giris">
              <div className="tc-ms-giris-simge" aria-hidden="true">{kanal.emoji || '#'}</div>
              <h2>{kanal.name}</h2>
              {kanal.topic && <p>{kanal.topic}</p>}
            </div>
          ))}
        {iletiler && akisOgeleri(iletiler, isaret, ben.id).map((o, i) => (
          o.tur === 'gun' ? <div key={`g${i}`} className="tc-ms-gun"><span>{gunEtiketi(o.ts)}</span></div>
            : o.tur === 'yeni' ? <div key="yeni" className="tc-ms-yeni-cizgisi">Yeni mesajlar</div>
            : <Ileti key={o.ileti.id} ileti={o.ileti} kanal={kanal.id} devam={o.devam} duzenleniyor={duzenlenen?.id ?? null} olaylar={olaylar} />
        ))}
      </div>
      <div className="tc-ms-yaziyor" aria-live="polite">{yaziyor && <><span className="tc-ms-noktalar" aria-hidden="true"><i /><i /><i /></span>{yaziyor}</>}</div>
      <YazmaAlani
        kanal={kanal.id} kanalAdi={kanal.name} yanit={yanit} yanitYaz={yanitYaz} durumYaz={durumYaz}
        duyuruKipi={duyuruKipi} duyuruKipiYaz={duyuruKipiYaz} sonunuDuzenle={sonunuDuzenle}
      />
      {menu && (
        <IletiIslemleri
          islemler={iletiIslemleri(menu, ben.id, yetki.yaz)} tepkiVar={yetki.yaz}
          tepkiSec={(k) => { olaylar.tepki(menu, k); }} sec={(i) => { islemSec(menu, i); }} kapat={() => { menuYaz(null); }}
        />
      )}
      {bilgi && <IletiBilgisi ileti={bilgi} kanal={kanal.id} kapat={() => { bilgiYaz(null); }} />}
      {zamanliAcik && <ZamanliListesi kanal={kanal.id} kapat={() => { zamanliAcikYaz(false); }} />}
      <OnayPenceresi
        acik={silinecek !== null} baslik="Mesaj silinsin mi?" onayMetni="Sil" tehlikeli
        onayla={() => { if (silinecek) sakla(yaz.guncelle(yol(silinecek), { deleted: true, text: '', att: null })); silinecekYaz(null); }}
        vazgec={() => { silinecekYaz(null); }}
      >
        <p>Herkes için “Bu mesaj silindi” görünecek.</p>
      </OnayPenceresi>
    </section>
    </SohbetOdasiBaglami.Provider>
  );
}
