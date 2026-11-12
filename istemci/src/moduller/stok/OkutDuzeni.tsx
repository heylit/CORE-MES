import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SonIslem, SonIslemlerimCevabi, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Dugme, Rozet, Secim, Simge, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { okutmaSesiAcik } from '../../ortak/arayuz/okutma-geribildirimi.ts';
import { api } from '../../ortak/veri/api.ts';
import { TESLIM_KUTUSU } from './is-malzeme-durumu.ts';
import { miktarMetni, zamanMetni } from './gorunum.ts';
import { hataMetni, useStokKomutu } from './ortak.tsx';
import type { OkutHedefi } from './okut-akisi.ts';

// 3085: okutmadan sonrası her an üç soruya cevap verir: ne okuttum, şimdi ne yapabilirim, az önce ne yaptım ve sonucu ne.

export type AkisAdimi = 'ne' | 'nereye' | 'onay' | 'sonuc';
const ADIMLAR: readonly { adim: AkisAdimi; ad: string }[] = [
  { adim: 'ne', ad: 'Ne' }, { adim: 'nereye', ad: 'Nereye' }, { adim: 'onay', ad: 'Onay' }, { adim: 'sonuc', ad: 'Sonuç' },
];

export function AdimSeridi({ adim }: { adim: AkisAdimi }) {
  const sira = ADIMLAR.findIndex((a) => a.adim === adim);
  return (
    <ol className="tc-stok-akis-adimlar" aria-label="Adımlar">
      {ADIMLAR.map((a, i) => (
        <li key={a.adim} aria-current={i === sira ? 'step' : undefined} data-bitti={i < sira ? '' : undefined}>
          {i < sira ? <Simge ad="check" /> : <span className="tc-stok-akis-no" aria-hidden="true">{i + 1}</span>}
          {a.ad}
        </li>
      ))}
    </ol>
  );
}

// Sonuç kartı: Yapıldı (stok yerinde), Yolda (karşı taraf teslim alınca kapanır), Yapılmadı (neden ve ne yapılacağı).
export interface IslemSonucu {
  ton: 'yapildi' | 'yolda' | 'yapilmadi';
  baslik: string;
  satirlar: string[];
  // Yoldaki teslimler: Geri çek ve "Alındı"ya dönüş Son yaptıklarım kaydından okunur.
  teslimNolari: string[];
}
const SONUC_GORUNUMU: Record<IslemSonucu['ton'], { etiket: string; simge: 'check' | 'clock' | 'alert' }> = {
  yapildi: { etiket: 'Yapıldı', simge: 'check' }, yolda: { etiket: 'Yolda', simge: 'clock' }, yapilmadi: { etiket: 'Yapılmadı', simge: 'alert' },
};

export function titret(ton: IslemSonucu['ton'] | 'okundu' | 'hata'): void {
  if (!okutmaSesiAcik()) return;
  try { navigator.vibrate?.(ton === 'yapilmadi' || ton === 'hata' ? [80, 60, 80] : 40); } catch { /* titreşim yok */ }
}

export function SonucKarti({ sonuc, yeniOkut, kayitlar }: { sonuc: IslemSonucu; yeniOkut: () => void; kayitlar?: readonly SonIslem[] }) {
  const g = SONUC_GORUNUMU[sonuc.ton];
  const ilgili = (kayitlar ?? []).filter((k) => k.no !== null && sonuc.teslimNolari.includes(k.no));
  const alindi = ilgili.length > 0 && ilgili.every((k) => k.durum === 'alindi');
  const ton = alindi ? 'yapildi' : sonuc.ton;
  // Bırakma formu aşağıda kapanır; sonuç telefonda ekranın dışında kalıp "bir şey olmadı" sanılmasın.
  const kok = useRef<HTMLElement>(null);
  useEffect(() => { kok.current?.scrollIntoView?.({ block: 'nearest' }); }, []);
  return (
    <section ref={kok} className="tc-stok-sonuc-karti" data-ton={ton} role="status" aria-live="polite" aria-label="İşlem sonucu">
      <div className="tc-stok-sonuc-bas">
        <Simge ad={alindi ? 'check' : g.simge} boyut="b" />
        <div>
          <span className="tc-stok-sonuc-etiket">{alindi ? 'Alındı' : g.etiket}</span>
          <strong>{sonuc.baslik}</strong>
        </div>
      </div>
      {sonuc.satirlar.length > 0 && <ul className="tc-stok-sonuc-satirlar">{sonuc.satirlar.map((s) => <li key={s}>{s}</li>)}</ul>}
      {ton === 'yolda' && <p className="tc-stok-not">Karşı taraf teslim alınca burada ve Son yaptıklarım'da "Alındı" olur.</p>}
      <div className="tc-stok-eylem">
        {ilgili.filter((k) => k.durum === 'yolda').map((k) => <GeriCek key={k.id} k={k} />)}
        <Dugme tur="birincil" simge="scan" onClick={yeniOkut}>Yeni okut</Dugme>
      </div>
    </section>
  );
}

export const sonIslemlerimAnahtari = [...TESLIM_KUTUSU, 'son-islemlerim'] as const;
// V3: yolda olan varken kısa aralıkla, yokken seyrek yenilenir; anlık bildirim değildir.
export function useSonIslemlerim() {
  return useQuery({
    queryKey: sonIslemlerimAnahtari,
    queryFn: () => api.get<SonIslemlerimCevabi>('/stok/teslim-kutusu/son-islemlerim'),
    refetchInterval: (s) => (s.state.data?.islemler.some((k) => k.durum === 'yolda') ? 15_000 : 60_000),
    refetchOnWindowFocus: true,
  });
}

const DURUM: Record<SonIslem['durum'], { etiket: string; ton: RozetTonu }> = {
  yapildi: { etiket: 'Yapıldı', ton: 'tamam' }, yolda: { etiket: 'Yolda', ton: 'uyari' }, alindi: { etiket: 'Alındı', ton: 'tamam' },
  red: { etiket: 'Reddedildi', ton: 'hata' }, iptal: { etiket: 'Geri çekildi', ton: 'pasif' },
};

function GeriCek({ k }: { k: SonIslem }) {
  const istemci = useQueryClient();
  const iptal = useStokKomutu((g: { surum: number }) => api.post(`/stok/teslimler/${k.id}/iptal-et`, g), `${k.no ?? 'Teslim'} geri çekildi.`,
    () => { void istemci.invalidateQueries({ queryKey: sonIslemlerimAnahtari }); });
  if (k.tur !== 'teslim' || k.durum !== 'yolda' || k.surum === null) return null;
  const surum = k.surum;
  return (
    <>
      <Dugme tur="ikincil" simge="back" yukleniyor={iptal.komut.isPending} onClick={() => iptal.komut.mutate({ surum })}>Geri çek</Dugme>
      {iptal.onayPenceresi}
    </>
  );
}

export function SonYaptiklarim({ sorgu }: { sorgu: ReturnType<typeof useSonIslemlerim> }) {
  return (
    <section className="tc-stok-son-islemler" aria-label="Son yaptıklarım">
      <div className="tc-stok-bolum-bas">
        <h3 className="tc-stok-teslim-baslik"><Simge ad="clock" /> Son yaptıklarım</h3>
        <span className="tc-stok-not">bugün</span>
      </div>
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(sorgu.error)} yenile={() => { void sorgu.refetch(); }} />
        : sorgu.data.islemler.length === 0 ? <p className="tc-stok-not">Bugün bu panelden yaptığın teslim ya da taşıma yok.</p>
        : (
          <ul className="tc-stok-son-liste">
            {sorgu.data.islemler.slice(0, 10).map((k) => {
              const d = DURUM[k.durum];
              const nereye = k.aliciAd ? `${k.aliciAd} · ${k.nereye.ad ?? k.nereye.kod}` : k.nereye.ad ?? k.nereye.kod;
              return (
                <li key={`${k.tur}-${k.id}`} className="tc-stok-son-satir">
                  <span className="tc-stok-son-saat">{zamanMetni(k.zaman).slice(-5)}</span>
                  <span className="tc-stok-son-ne">
                    <strong>{k.malzemeAd ?? 'Malzeme'}{k.partiEtiketi ? ` · ${k.partiEtiketi}` : ''} · {miktarMetni(k.miktar)}</strong>
                    <span className="tc-stok-not">
                      {k.tur === 'teslim' ? (k.aliciAd ? 'Elden teslim' : 'Teslim') : 'Taşıma'}: {nereye}{k.no ? ` · ${k.no}` : ''}
                      {k.redNedeni ? ` · ${k.redNedeni}` : ''}
                    </span>
                  </span>
                  <span className="tc-stok-son-durum">
                    <Rozet ton={d.ton}>{d.etiket}</Rozet>
                    <GeriCek k={k} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

// Konum satırı (B7, Kurgu 4): kutucukların hemen üstünde tek satır "Konum: X · Değiştir". Depocuda seçilmemiş konum "Depo"dur
// (Arayüz K3); istasyonda çalışan seçmemişse seçim kutusu açık durur ve kutucuklar önce konumu ister.
export function KonumSatiri({ kutu, istasyonId, sec, depocu }: { kutu: TeslimKutusuCevabi; istasyonId: number | null; sec: (id: number | null) => void; depocu: boolean }) {
  const [acik, setAcik] = useState(false);
  const i = istasyonId === null ? undefined : kutu.istasyonlar.find((x) => x.id === istasyonId);
  if (kutu.istasyonlar.length === 0) return null;
  const ad = i?.ad ?? (depocu || kutu.istasyonlar.length > 1 ? null : kutu.istasyonlar[0]!.ad);
  const metin = ad ?? (depocu ? 'Depo' : null);
  if (kutu.istasyonlar.length === 1 && !depocu) return <p className="tc-stok-konum-satiri"><Simge ad="pin" /> Konum: <strong>{metin}</strong></p>;
  if (metin !== null && !acik) {
    return (
      <p className="tc-stok-konum-satiri">
        <Simge ad="pin" /> <span>Konum: <strong>{metin}</strong></span>
        <Dugme tur="ikincil" simge="edit" onClick={() => setAcik(true)}>Değiştir</Dugme>
      </p>
    );
  }
  const secenekler = [{ deger: '', baslik: depocu ? 'Depo' : 'Konumu seçin' }, ...kutu.istasyonlar.map((x) => ({ deger: String(x.id), baslik: `${x.ad} (${x.kod})` }))];
  return (
    <div className="tc-stok-konum-satiri">
      <Simge ad="pin" />
      <Secim etiket="Konum" secenekler={secenekler} value={String(istasyonId ?? '')}
        onChange={(o) => { const n = Number(o.target.value); sec(n > 0 ? n : null); setAcik(false); }} />
    </div>
  );
}

// Listeden seç (kullanıcı 06:31Z): okutmadan bırakılacak yer; seçilen yer okutulmuş gibi bırakmayı açar.
export function HedefListesi({ kutu, sec, kapat }: { kutu: TeslimKutusuCevabi; sec: (h: OkutHedefi) => void; kapat: () => void }) {
  const grup = (baslik: string, ogeler: ReactNode[]) => (ogeler.length === 0 ? null : (
    <div className="tc-stok-hedef-grup"><span className="tc-stok-not">{baslik}</span><div className="tc-stok-hedef-dugmeler">{ogeler}</div></div>
  ));
  return (
    <section className="tc-stok-hedef-listesi" aria-label="Bırakılacak yeri seç">
      <div className="tc-stok-bolum-bas">
        <h3 className="tc-stok-teslim-baslik">Nereye bırakılacak?</h3>
        <Dugme simge="x" aria-label="Listeyi kapat" onClick={kapat} />
      </div>
      {grup('Depo', kutu.depoKonumlari.map((k) => (
        <Dugme key={`k${k.id}`} simge="box" onClick={() => sec({ konumId: k.id, kod: k.kod, ad: k.ad, tur: 'raf_gozu', istasyonId: null })}>{k.ad ?? k.kod}</Dugme>)))}
      {grup('Ara alan', kutu.araAlanlar.map((k) => (
        <Dugme key={`a${k.id}`} simge="pin" onClick={() => sec({ konumId: k.id, kod: k.kod, ad: k.ad, tur: 'ara_alan', istasyonId: null })}>{k.ad ?? k.kod}</Dugme>)))}
      {grup('İstasyon', kutu.hedefIstasyonlar.map((x) => (
        <Dugme key={`i${x.id}`} simge="cpu" onClick={() => sec({ konumId: 0, kod: x.kod, ad: x.ad, tur: 'istasyon', istasyonId: x.id })}>{x.ad}</Dugme>)))}
    </section>
  );
}
