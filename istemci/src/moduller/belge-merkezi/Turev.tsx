import { useId } from 'react';
import { Link } from 'react-router-dom';
import type { Kullanim, Revizyon, TurevOzeti } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { Dugme, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { KULLANIMLAR, KULLANIM_ADLARI } from './gosterim.ts';
import { revKoduMetni } from './revizyon-kodu.ts';

// 3468-2: türev, orijinalin bir revizyonundan bir iş için hazırlanmış ayrı belgedir. Durum dili tektir: "Kaynağı eski" (uyarı tonu).

export const KULLANIM_SIMGESI: Readonly<Record<Kullanim, SimgeAdi>> = {
  'ic-uretim': 'gear', 'dis-uretim': 'truck', 'dis-operasyon': 'route', kalite: 'clipboard-check', teklif: 'lira', diger: 'file',
};

export function KullanimRozeti({ kullanim }: { kullanim: Kullanim }) {
  return <Rozet ton="bilgi" gorunum="cizgi"><span className="tc-cz-simgeli tc-cz-kullanim"><Simge ad={KULLANIM_SIMGESI[kullanim]} />{KULLANIM_ADLARI[kullanim]}</span></Rozet>;
}

export const KAYNAK_ESKI_ACIKLAMASI = 'Türevin çıktığı revizyon artık yayında değil; güncel revizyondan yenisini çıkarın.';
export function KaynakEskiRozeti() {
  return <span title={KAYNAK_ESKI_ACIKLAMASI}><Rozet ton="uyari">Kaynağı eski</Rozet></span>;
}

// Kaydet penceresinde ve "Türev ekle"de oluşacak belge adı: kısa ad verilirse o, yoksa kullanımın adı.
export const turevAdi = (kaynakAd: string, kullanim: Kullanim, kisaAd: string): string =>
  `${kaynakAd.slice(0, 80)} · ${kisaAd.trim() || KULLANIM_ADLARI[kullanim]}`.slice(0, 120);

export const KISA_AD_ZORUNLU = 'Bu kullanımda başka türev var; kısa ad zorunlu.';

// Aynı kullanımda başka türev varsa iki türev ayrılsın diye kısa ad zorunludur (kaplama, ısıl işlem).
export const kisaAdGerekli = (turevler: readonly Pick<TurevOzeti, 'kullanim' | 'aktif'>[], kullanim: Kullanim): boolean =>
  turevler.some((t) => t.aktif && t.kullanim === kullanim);

// Tek seçim: yerel radyo düğmeleri, oklarla gezilir.
export function KullanimSecimi({ deger, sec }: { deger: Kullanim | null; sec: (k: Kullanim) => void }) {
  const ad = useId();
  return (
    <fieldset className="tc-cz-kullanimlar">
      <legend>Kullanım</legend>
      {KULLANIMLAR.map((k) => (
        <label key={k} className={k === deger ? 'tc-cz-kullanim-secenek tc-cz-kullanim-secili' : 'tc-cz-kullanim-secenek'}>
          <input type="radio" name={ad} value={k} checked={k === deger} onChange={() => { sec(k); }} />
          <Simge ad={KULLANIM_SIMGESI[k]} />
          <span>{KULLANIM_ADLARI[k]}</span>
        </label>
      ))}
    </fieldset>
  );
}

// Revizyon ağacı (C): revizyonun altında ondan çıkan türevler; güncel revizyonda eksik iş eylemle ("Dış üretim türevi Rev A'dan").
export function RevizyonTurevleri({ revizyon, revizyonlar, turevler, ekleyebilir, turevEkle }: {
  revizyon: Revizyon;
  revizyonlar: readonly Revizyon[];
  turevler: readonly TurevOzeti[];
  ekleyebilir: boolean;
  turevEkle: (kullanim: Kullanim | null) => void;
}) {
  const bunlar = turevler.filter((t) => t.kaynakRevizyonId === revizyon.id);
  // Güncel revizyonda karşılığı olmayan, eski revizyondan kalmış kullanımlar.
  const eksik = revizyon.durum !== 'yayinda' ? [] : KULLANIMLAR.filter((k) =>
    !bunlar.some((t) => t.kullanim === k && t.aktif) && turevler.some((t) => t.kullanim === k && t.aktif && t.kaynakEski));
  const eskiRev = (k: Kullanim): string => {
    const t = turevler.find((x) => x.kullanim === k && x.aktif && x.kaynakEski);
    return revKoduMetni(revizyonlar.find((r) => r.id === t?.kaynakRevizyonId)?.revKodu ?? null);
  };
  if (bunlar.length === 0 && eksik.length === 0 && !(ekleyebilir && revizyon.durum !== 'taslak')) return null;
  return (
    <div className="tc-cz-turevler" role="group" aria-label={`Rev ${revKoduMetni(revizyon.revKodu)} türevleri`}>
      {bunlar.map((t) => (
        <div key={t.id} className="tc-cz-turev">
          <KullanimRozeti kullanim={t.kullanim} />
          <Link to={`/cizimler/belge/${String(t.id)}`} className="tc-cz-turev-ad">{t.ad}</Link>
          {t.yayindakiHarf === null ? <Rozet ton="uyari">Taslak</Rozet> : <span className="tc-cz-ipucu mono">Rev {revKoduMetni(t.yayindakiRevKodu)}</span>}
          {!t.aktif && <Rozet ton="pasif">Arşivde</Rozet>}
          {t.aktif && t.kaynakEski && <KaynakEskiRozeti />}
        </div>
      ))}
      {eksik.map((k) => (
        <p key={k} className="tc-cz-uyari tc-cz-simgeli tc-cz-turev-eksik">
          <Simge ad="alert" />
          <span>{KULLANIM_ADLARI[k]} türevi yalnız eski revizyondan var (Rev {eskiRev(k)}).</span>
          {ekleyebilir && <Dugme simge="plus" onClick={() => { turevEkle(k); }}>Bu revizyondan yenile</Dugme>}
        </p>
      ))}
      {ekleyebilir && revizyon.durum !== 'taslak' && (
        <div><Dugme simge="plus" onClick={() => { turevEkle(null); }} aria-label={`Rev ${revKoduMetni(revizyon.revKodu)} için türev ekle`}>Türev ekle</Dugme></div>
      )}
    </div>
  );
}
