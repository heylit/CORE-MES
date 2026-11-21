import { useEffect, useRef, useState } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import { SURE_GOSTERME_SN, SURE_NOTU } from '../../motor/ust/HesapSuresi.tsx';
import './kokpit-tanitim.css';

// Kokpit tanıtımı (3535 a, 3536): Tanıtım sayfasının Kokpit bölümü. İçerik bu modülde yazılır ki ekran değişince aynı yerde güncellensin.
// Yalnız örnek (ORN-) veri; sunucuya istek yok. Hareket tasarım değişkenleriyle akar; hareket kapalıysa sayılar ve vurgu durur.
// Taşıma önizlemesi ve gelen değişiklikler bölümleri, ilgili dilimler (3531, 3532) birleşince eklenir.

type SimgeAdi = Parameters<typeof Simge>[0]['ad'];

const SAYILAR = [
  { deger: 42, ad: 'açık iş emri' },
  { deger: 5, ad: 'tezgâh' },
  { deger: 3, ad: 'gecikmede' },
  { deger: 82, ad: 'ortalama doluluk', on: '%' },
] as const;

const DOLULUK = [['ORN-TZG-01', 88], ['ORN-TZG-02', 74], ['ORN-TZG-03', 96], ['ORN-TZG-04', 69], ['ORN-TZG-05', 81]] as const;

export const BOLGELER = [
  { ad: 'Plan şeridi', metin: 'Planın durumu ve Plan menüsü. Yeni kayıt geldiyse "Planı güncelle" sayısıyla görünür; Engeller hazır olmayan işleri açar.' },
  { ad: 'Sipariş kartları', metin: 'Açık siparişler sırasıyla dizilir. Bir kart seçince altında emirleri ve operasyonları açılır.' },
  { ad: 'Emirler ve operasyonlar', metin: 'Seçilen kartın emirleri. Yeri olmayan adım için "İleriye yerleştir" ya da "Teslimden geriye yerleştir".' },
  { ad: 'Tahta', metin: 'Tam genişlik plan: Tezgâh, Sipariş, Matris ya da 3B görünüm. Tezgâh görünümünde iş sürüklenip başka saate ya da tezgâha taşınır.' },
  { ad: 'Taslak çubuğu', metin: 'Değişiklikler önce sizin taslağınızda durur. Geri al son değişikliği, Vazgeç bütün taslağı siler.' },
] as const;

const FIILLER: readonly { ad: string; simge: SimgeAdi; ne: string; zaman: string; sahne: 'guncelle' | 'bastan' | 'yerlestir' }[] = [
  { ad: 'Planı güncelle', simge: 'rotate', sahne: 'guncelle', ne: 'Sıra korunur; saatler yeni kayıtlara göre hesaplanır. Başlamış ve elle kilitli iş yerinde kalır.', zaman: 'Gün içinde, yeni emir ya da değişiklik geldiğinde. Bekleyen sayısı düğmede yazar.' },
  { ad: 'Baştan kur', simge: 'layers', sahne: 'bastan', ne: 'Sıra da yeniden dizilir; plansız emirler de yerleşir. Başlamış ve elle kilitli iş yerinde kalır.', zaman: 'Hafta başında ya da büyük bir değişiklikten sonra. Önce onay sorar.' },
  { ad: 'Yerleştir', simge: 'target', sahne: 'yerlestir', ne: 'Yeri olmayan emirler boşluklara yerleşir; öteki işler yerinde kalır.', zaman: 'Plansız emir varken. Seçili siparişi İleriye ya da Teslimden geriye yerleştirmek "Diğer seçenekler" altındadır.' },
];

const AKIS: readonly { ad: string; metin: string; simge: SimgeAdi }[] = [
  { ad: 'Taslak', metin: 'Güncelle, taşı, yerleştir: yalnız sizde', simge: 'edit' },
  { ad: 'Canlıya al', metin: 'Taslak ortak plana yazılır, onay sayfası açılır (yetkisi olmayanda Onaya gönder)', simge: 'upload' },
  { ad: 'Onay', metin: 'Onay akışı tamamlanır', simge: 'clipboard-check' },
  { ad: 'Canlı plan', metin: 'Atölye yeni planla çalışır', simge: 'check' },
];

const GUNLUK: readonly { ad: string; metin: string; simge: SimgeAdi }[] = [
  { ad: 'Şeride bakın', metin: '"Planı güncelle" sayı gösteriyorsa basın.', simge: 'eye' },
  { ad: 'Engelleri açın', metin: 'Hazır olmayan işi sorumlusuna iletin.', simge: 'alert' },
  { ad: 'Tahtayı tarayın', metin: 'Tezgâh görünümünde boşlukları ve sıkışan tezgâhları görün.', simge: 'gantt' },
  { ad: 'Gerekirse taşıyın', metin: 'İşi sürükleyin; değişiklik taslağa yazılır, Geri al geri alır.', simge: 'expand' },
  { ad: 'Canlıya alın', metin: 'Taslağı Canlıya al ile ortak plana yazın.', simge: 'upload' },
];

const VURGU_ARALIGI = 3500;
const SAYAC_SURESI = 900;

// Kök öğede hareket kapalıysa (Sistem Ayarları ya da işletim sistemi tercihi) sayaç ve otomatik vurgu çalışmaz.
function hareketVar(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.getAttribute('data-hareket') === 'kapali') return false;
  return !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

function Sayac({ deger, on }: { deger: number; on?: string }) {
  const [n, setN] = useState(() => (hareketVar() ? 0 : deger));
  useEffect(() => {
    if (!hareketVar()) { setN(deger); return undefined; }
    let kare = 0;
    const bas = performance.now();
    const adim = (t: number): void => {
      const o = Math.min(1, (t - bas) / SAYAC_SURESI);
      setN(Math.round(deger * (1 - (1 - o) ** 3)));
      if (o < 1) kare = requestAnimationFrame(adim);
    };
    kare = requestAnimationFrame(adim);
    return () => { cancelAnimationFrame(kare); };
  }, [deger]);
  return <b>{on}{n}</b>;
}

// Hesap süresi örneği: sayaç döngüyle 0'dan 12'ye sayar; eşiği geçince ekrandaki notun aynısı çıkar (şeritte ilerleme çizgisi yoktur,
// bitişi bilinmez). Hareket kapalıysa 12 sn'de durur.
const ORNEK_SON = 12;
function HesapOrnegi() {
  const [sn, setSn] = useState(() => (hareketVar() ? 0 : ORNEK_SON));
  useEffect(() => {
    if (!hareketVar()) return undefined;
    const z = window.setInterval(() => { setSn((n) => (n >= ORNEK_SON + 2 ? 0 : n + 1)); }, 1000);
    return () => { window.clearInterval(z); };
  }, []);
  const gorunen = Math.min(sn, ORNEK_SON);
  const suruyor = sn <= ORNEK_SON;
  return (
    <div className="tc-ktn-hesap" aria-hidden="true">
      <div className="tc-ktn-hesap-serit">
        <span>{suruyor ? 'Planı güncelle' : 'Plan güncel'}</span>
        <em data-suruyor={suruyor ? '' : undefined}><Simge ad="rotate" boyut="k" />{suruyor ? 'Güncelleniyor' : 'Güncel'}</em>
        {suruyor && gorunen >= SURE_GOSTERME_SN && <small>{`${String(gorunen)} sn · ${SURE_NOTU}`}</small>}
      </div>
    </div>
  );
}

const oranYaz = (deger: number) => (el: HTMLElement | null): void => { el?.style.setProperty('--oran', String(deger / 100)); };

export function KokpitTanitimi() {
  const [bolge, setBolge] = useState(0);
  const elle = useRef(false);
  useEffect(() => {
    if (!hareketVar()) return undefined;
    // Bir tur döner ve ilk bölgede durur; elle seçilince hemen durur.
    let adim = 0;
    const z = window.setInterval(() => {
      adim += 1;
      if (elle.current || adim > BOLGELER.length) { window.clearInterval(z); return; }
      setBolge(adim % BOLGELER.length);
    }, VURGU_ARALIGI);
    return () => { window.clearInterval(z); };
  }, []);
  const sec = (i: number): void => { elle.current = true; setBolge(i); };

  return (
    <div className="tc-ktn">
      <header className="tc-ktn-giris">
        <p className="tc-ktn-ust">Tanıtım ve kullanım · örnek veri (ORN-)</p>
        <h2>Atölyenin planı tek ekranda: gör, taşı, canlıya al.</h2>
        <p>Kokpit açık iş emirlerini tezgâhlara dizer, engelleri gösterir ve değişikliği önce taslakta tutar. Bu bölüm ekranın nasıl okunduğunu ve günlük kullanımı anlatır.</p>
        <div className="tc-ktn-sayilar">
          {SAYILAR.map((s) => <div key={s.ad} className="tc-ktn-sayi"><Sayac deger={s.deger} {...('on' in s ? { on: s.on } : {})} /><span>{s.ad}</span></div>)}
        </div>
        <figure className="tc-ktn-doluluk" aria-label="Bu hafta tezgâh doluluğu, örnek">
          <figcaption>Bu hafta tezgâh doluluğu</figcaption>
          {DOLULUK.map(([ad, d]) => (
            <div key={ad} className="tc-ktn-cubuk" data-yogun={d >= 90 ? '' : undefined}>
              <span>{ad}</span><i ref={oranYaz(d)} /><b>%{d}</b>
            </div>
          ))}
        </figure>
      </header>

      <section className="tc-ktn-bolum" aria-labelledby="tc-ktn-b1">
        <h3 id="tc-ktn-b1"><i>1</i>Ekranı okumak</h3>
        <p>Kokpit yukarıdan aşağı okunur: önce şerit, sonra sipariş, sonra tahta. Bir maddeye dokunun; ilgili bölge yanar.</p>
        <div className="tc-ktn-okuma">
          <div className="tc-ktn-sema" aria-hidden="true" data-bolge={bolge}>
            <div className="tc-ktn-sema-serit" data-yanik={bolge === 0 ? '' : undefined}><span>Plan</span><span>Planı güncelle (3)</span><span>Engeller (2)</span><em>Canlıya al</em></div>
            <div className="tc-ktn-sema-kartlar" data-yanik={bolge === 1 ? '' : undefined}><span>ORN-SIP-11</span><span>ORN-SIP-12</span><span>ORN-SIP-13</span></div>
            <div className="tc-ktn-sema-emirler" data-yanik={bolge === 2 ? '' : undefined}><span>ORN-E-204 · Torna</span><span>ORN-E-205 · Freze</span></div>
            <div className="tc-ktn-sema-tahta" data-yanik={bolge === 3 ? '' : undefined}>
              {[0, 1, 2].map((r) => <div key={r}><i /><i /><i /></div>)}
            </div>
            <div className="tc-ktn-sema-taslak" data-yanik={bolge === 4 ? '' : undefined}><span>Taslak · 2 değişiklik</span><span>Geri al</span><span>Vazgeç</span><em>Canlıya al</em></div>
          </div>
          <ol className="tc-ktn-bolgeler">
            {BOLGELER.map((b, i) => (
              <li key={b.ad}>
                <button type="button" aria-pressed={bolge === i} onClick={() => { sec(i); }}>
                  <i>{i + 1}</i><span><b>{b.ad}</b><small>{b.metin}</small></span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tc-ktn-bolum" aria-labelledby="tc-ktn-b2">
        <h3 id="tc-ktn-b2"><i>2</i>Plan menüsü: üç fiil, üç ayrı iş</h3>
        <p>Hangi satırı seçeceğiniz, planın ne kadarının değişmesini istediğinize bağlıdır.</p>
        <div className="tc-ktn-fiiller">
          {FIILLER.map((f) => (
            <article key={f.ad} className="tc-ktn-fiil">
              <div className={`tc-ktn-mini tc-ktn-mini-${f.sahne}`} aria-hidden="true">
                <div><i /><i /><i /></div>
                <div><i /><i /></div>
              </div>
              <h4><Simge ad={f.simge} boyut="k" />{f.ad}</h4>
              <p>{f.ne}</p>
              <p className="tc-ktn-ne-zaman"><b>Ne zaman:</b> {f.zaman}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="tc-ktn-bolum" aria-labelledby="tc-ktn-b3">
        <h3 id="tc-ktn-b3"><i>3</i>Taslaktan canlıya</h3>
        <p>Taslakta istediğiniz kadar deneme yapabilirsiniz; ortak plan siz yazana kadar değişmez.</p>
        <ol className="tc-ktn-akis">
          {AKIS.map((a) => <li key={a.ad}><Simge ad={a.simge} /><b>{a.ad}</b><small>{a.metin}</small></li>)}
        </ol>
      </section>

      <section className="tc-ktn-bolum" aria-labelledby="tc-ktn-b4">
        <h3 id="tc-ktn-b4"><i>4</i>Hesap sürerken</h3>
        <p>{`Planı güncellemek çoğu zaman birkaç saniye sürer. ${String(SURE_GOSTERME_SN)} saniyeyi geçerse düğmenin yanında geçen süre ve kısa bir not çıkar; bitince kalkar.`}</p>
        <HesapOrnegi />
      </section>

      <section className="tc-ktn-bolum" aria-labelledby="tc-ktn-b5">
        <h3 id="tc-ktn-b5"><i>5</i>Günlük kullanım, beş adım</h3>
        <p>Vardiya başında kısa bir rutin.</p>
        <ol className="tc-ktn-gunluk">
          {GUNLUK.map((g, i) => <li key={g.ad}><span><Simge ad={g.simge} /></span><b>{`${String(i + 1)}. ${g.ad}`}</b><small>{g.metin}</small></li>)}
        </ol>
      </section>

      <p className="tc-ktn-not">Bütün adlar ve sayılar örnektir (ORN-).</p>
    </div>
  );
}
