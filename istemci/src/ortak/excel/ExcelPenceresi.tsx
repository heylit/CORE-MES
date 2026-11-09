import { useRef, useState } from 'react';
import { Dugme, OnayPenceresi, Pencere, Simge, Tablo, type Sutun } from '../arayuz/index.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { ApiHatasi, hataIletisi } from '../veri/api.ts';
import { icerikKimligi } from '../veri/ozet.ts';
import { DosyaReddi, dosyaIndir, dosyaOku, sablonYaz } from './kitap.ts';
import { YazimReddi, gonderimNumaralari, planKur, planSayilari, reddedilenSatir, type ExcelTanimi, type Islem, type PlanSatiri } from './kurallar.ts';
import './excel.css';

export interface YazimSonucu { eklenen: number; guncellenen: number }

export const gonderilecekler = (plan: readonly PlanSatiri[]): PlanSatiri[] => plan.filter((p) => p.islem === 'ekle' || p.islem === 'guncelle');

interface Ozellikler {
  kapat: () => void;
  // null: sayfanın verisi henüz yüklenmedi (şablon güncel veriden kurulur).
  tanim: ExcelTanimi | null;
  // Satırlar tek komutla gider: biri reddedilirse hiçbiri yazılmaz (2627 1/2 b). Satır numarası `gonderimNumaralari` ile verilir.
  // İstek kimliği gidecek satırların içeriğinden türer: aynı dosya yeniden yüklenirse sunucu ilk cevabı döner, emirler ve
  // rezerveler ikinci kez açılmaz (tekrar deposu 24 saat). Kayıtlar o arada değiştiyse eşleşen sürüm de değişir, kimlik yenilenir.
  yaz: (satirlar: readonly PlanSatiri[], istekKimligi: string) => Promise<YazimSonucu>;
}

type Adim = 'yukle' | 'onizle' | 'yaziliyor' | 'sonuc';
const ADIMLAR: [Adim | 'sablon', string][] = [['sablon', 'Şablon indir'], ['yukle', 'Yükle'], ['onizle', 'Önizle'], ['yaziliyor', 'Yaz']];
const DURUM: Record<Islem, { ad: string; simge: SimgeAdi }> = {
  ekle: { ad: 'Yeni', simge: 'plus' },
  guncelle: { ad: 'Güncellenecek', simge: 'edit' },
  ayni: { ad: 'Değişmeyen', simge: 'check' },
  hata: { ad: 'Hatalı', simge: 'alert' },
};
const SIRA: Islem[] = ['ekle', 'guncelle', 'ayni', 'hata'];
const SAYFA_BOYU = 50;

interface Okunan { dosyaAdi: string; plan: PlanSatiri[]; istekKimligi: string }
interface Sonuc { tamam: boolean; metin: string; redSatiri: PlanSatiri | null; redIletisi: string | null }

const planKimligi = (ad: string, plan: readonly PlanSatiri[]): Promise<string> => icerikKimligi(new TextEncoder().encode(JSON.stringify([
  ad, gonderilecekler(plan).map((p) => [p.sayfa, p.satir, p.islem, p.degerler, p.eslesen ?? null]),
])));

const notlar = (p: PlanSatiri): string[] => [
  ...p.hatalar,
  ...(p.uyarilar ?? []).map((u) => `Uyarı: ${u}`),
  ...p.farklar.map((f) => `${f.baslik}: ${f.eski || '(boş)'} → ${f.yeni}`),
];

export function ExcelPenceresi({ kapat, tanim, yaz }: Ozellikler) {
  const dosya = useRef<HTMLInputElement | null>(null);
  const [adim, adimYaz] = useState<Adim>('yukle');
  const [okunan, okunanYaz] = useState<Okunan | null>(null);
  const [suz, suzYaz] = useState<Islem | ''>('');
  const [sayfa, sayfaYaz] = useState(1);
  const [ileti, iletiYaz] = useState<string | null>(null);
  const [mesgul, mesgulYaz] = useState<string | null>(null);
  const [sonuc, sonucYaz] = useState<Sonuc | null>(null);
  const [kapatSor, kapatSorYaz] = useState(false);

  const kapatIste = () => { if (adim === 'yaziliyor') kapatSorYaz(true); else kapat(); };

  const indir = async (dolu: boolean) => {
    if (!tanim) return;
    mesgulYaz(dolu ? 'dolu' : 'bos');
    try { dosyaIndir(`${tanim.ad}-${dolu ? 'kayitlar' : 'sablon'}.xlsx`, await sablonYaz(tanim, { dolu })); }
    catch { iletiYaz('Excel dosyası oluşturulamadı.'); }
    finally { mesgulYaz(null); }
  };

  const oku = async (f: File) => {
    if (!tanim) return;
    mesgulYaz('oku'); iletiYaz(null);
    try {
      const { plan, uyari } = planKur(tanim, await dosyaOku(tanim, f));
      if (uyari) { iletiYaz(uyari); return; }
      okunanYaz({ dosyaAdi: f.name, plan, istekKimligi: await planKimligi(tanim.ad, plan) });
      suzYaz(planSayilari(plan).hata > 0 ? 'hata' : ''); sayfaYaz(1); adimYaz('onizle');
    } catch (e) {
      iletiYaz(e instanceof DosyaReddi ? e.message : 'Dosya okunamadı. Bu sayfadan indirilen şablonla doldurulmuş bir .xlsx olmalı.');
    } finally { mesgulYaz(null); }
  };

  const hataDosyasi = async (plan: readonly PlanSatiri[], ek: { satir: PlanSatiri; ileti: string } | null) => {
    if (!tanim) return;
    const sonuclar: Record<string, { hucreler: PlanSatiri['ham']; sonuc: string }[]> = {};
    for (const p of plan) {
      const sonucMetni = p === ek?.satir ? ek.ileti : p.hatalar.join(' ') || (p.islem === 'ayni' ? 'Değişiklik yok' : 'Hatasız');
      (sonuclar[p.sayfa] ??= []).push({ hucreler: p.ham, sonuc: sonucMetni });
    }
    try { dosyaIndir(`${tanim.ad}-hatalar.xlsx`, await sablonYaz(tanim, { sonuclar })); } catch { iletiYaz('Hata dosyası oluşturulamadı.'); }
  };

  const yazmayaBasla = async () => {
    if (!okunan) return;
    const gidecek = gonderilecekler(okunan.plan);
    adimYaz('yaziliyor');
    try {
      const s = await yaz(gidecek, okunan.istekKimligi);
      sonucYaz({ tamam: true, metin: `${String(s.eklenen + s.guncellenen)} satır yazıldı (${String(s.eklenen)} yeni, ${String(s.guncellenen)} güncelleme).`, redSatiri: null, redIletisi: null });
    } catch (e) {
      const no = e instanceof ApiHatasi ? reddedilenSatir(e.govde.ayrinti) : null;
      const red = no === null ? null : gidecek[gonderimNumaralari(gidecek).indexOf(no)] ?? null;
      const ham = e instanceof ApiHatasi ? (e.sunucuIletisi ?? e.message) : e instanceof YazimReddi ? e.message : hataIletisi(e, 'Kayıt yapılamadı.');
      const neden = red ? `${red.sayfa} sayfası, ${String(red.satir)}. satır: ${ham.replace(/^Satır \d+: /, '')}` : ham;
      sonucYaz({ tamam: false, metin: `Hiçbir satır yazılmadı: ${neden}`, redSatiri: red, redIletisi: neden });
    }
    adimYaz('sonuc');
  };

  const adimSirasi = adim === 'sonuc' ? 3 : ADIMLAR.findIndex(([a]) => a === adim);
  const adimlar = (
    <ol className="tc-xl-adimlar" aria-label="Adımlar">
      {ADIMLAR.map(([a, ad], i) => (
        <li key={a} data-durum={i < adimSirasi || adim === 'sonuc' ? 'bitti' : i === adimSirasi ? 'simdi' : 'sonra'} aria-current={i === adimSirasi ? 'step' : undefined}>
          <span className="tc-xl-adim-no">{i + 1}</span> {ad}
        </li>
      ))}
    </ol>
  );

  const plan = okunan?.plan ?? [];
  const say = planSayilari(plan);
  const yazilacak = say.ekle + say.guncelle;
  const uyarili = plan.filter((p) => p.uyarilar?.length).length;
  const ozet = tanim?.ozet?.(gonderilecekler(plan)) ?? null;
  const liste = plan.filter((p) => !suz || p.islem === suz);
  const sutunlar: Sutun<PlanSatiri>[] = [
    { anahtar: 'yer', baslik: 'Sayfa, satır', kirilmaz: true, hucre: (p) => `${p.sayfa} ${String(p.satir)}` },
    { anahtar: 'durum', baslik: 'Durum', kirilmaz: true, hucre: (p) => <span className="tc-xl-durum" data-islem={p.islem}><Simge ad={DURUM[p.islem].simge} /> {DURUM[p.islem].ad}</span> },
    { anahtar: 'kod', baslik: 'Kod', mono: true, hucre: (p) => p.kod ?? '—' },
    { anahtar: 'not', baslik: 'Açıklama', hucre: (p) => <div className="tc-xl-notlar">{notlar(p).map((n, i) => <div key={i}>{n}</div>)}</div> },
  ];

  let govde;
  let alt;
  if (adim === 'yukle') {
    govde = (
      <div className="tc-xl-secenekler">
        <button type="button" className="tc-xl-secenek" disabled={!tanim || mesgul !== null} onClick={() => void indir(false)}>
          <b><Simge ad="download" /> Boş şablon indir</b>
          <span>Açılır listeler uygulamadaki güncel kayıtlardan gelir. Her indirişte yeniden oluşur.</span>
        </button>
        <button type="button" className="tc-xl-secenek" disabled={!tanim || mesgul !== null} onClick={() => void indir(true)}>
          <b><Simge ad="file" /> Kayıtlarla indir</b>
          <span>Var olan kayıtlar dolu gelir; düzeltip geri yükleyebilirsiniz.</span>
        </button>
        <button type="button" className="tc-xl-secenek" disabled={!tanim || mesgul !== null} onClick={() => dosya.current?.click()}>
          <b><Simge ad="upload" /> Doldurulmuş dosyayı yükle</b>
          <span>Önce önizleme görünür; onaylamadan hiçbir şey yazılmaz.</span>
        </button>
        <input
          ref={dosya} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden aria-label="Excel dosyası"
          onChange={(o) => { const f = o.target.files?.[0]; o.target.value = ''; if (f) void oku(f); }}
        />
        {!tanim && <p className="tc-xl-ipucu" role="status">Kayıtlar yükleniyor…</p>}
        {mesgul === 'oku' && <p className="tc-xl-ipucu" role="status">Dosya okunuyor…</p>}
      </div>
    );
    alt = <Dugme onClick={kapat}>Kapat</Dugme>;
  } else if (adim === 'onizle' || adim === 'yaziliyor') {
    const ilk = (sayfa - 1) * SAYFA_BOYU;
    govde = (
      <>
        <p className="tc-xl-ipucu">{okunan?.dosyaAdi} · {plan.length} satır</p>
        <div className="tc-xl-cipler" role="group" aria-label="Duruma göre süz">
          {SIRA.map((k) => (
            <Dugme key={k} simge={DURUM[k].simge} aria-pressed={suz === k} disabled={adim === 'yaziliyor'} onClick={() => { suzYaz(suz === k ? '' : k); sayfaYaz(1); }}>
              <b>{say[k]}</b> {DURUM[k].ad}
            </Dugme>
          ))}
        </div>
        {say.hata > 0 && (
          <p className="tc-xl-uyari" role="alert">
            <Simge ad="alert" /> {say.hata} satır hatalı; tek hatalı satır varken hiçbir satır yazılmaz. Hata dosyasını indirip düzeltin ve yeniden yükleyin.
          </p>
        )}
        {say.hata === 0 && ozet && <p className="tc-xl-ipucu"><Simge ad="clipboard-check" /> {ozet}</p>}
        {uyarili > 0 && <p className="tc-xl-ipucu"><Simge ad="alert" /> {uyarili} satırda uyarı var; yazımı durdurmaz, açıklamada okuyun.</p>}
        {say.hata === 0 && yazilacak === 0 && <p className="tc-xl-ipucu">Yazılacak değişiklik yok.</p>}
        <Tablo
          etiket="Önizleme" sutunlar={sutunlar} satirlar={liste.slice(ilk, ilk + SAYFA_BOYU)} satirAnahtari={(p) => `${p.sayfa}-${String(p.satir)}`}
          bosMesaj="Bu süzgeçte satır yok."
          sayfalama={liste.length > SAYFA_BOYU ? { sayfa, sayfaBoyu: SAYFA_BOYU, toplam: liste.length, degistir: sayfaYaz, etiket: 'Önizleme sayfaları' } : undefined}
        />
        <p className="tc-xl-ipucu" role="status" aria-live="polite">{adim === 'yaziliyor' ? `Yazılıyor (${String(yazilacak)} satır)…` : ''}</p>
      </>
    );
    alt = (
      <>
        <Dugme onClick={() => { okunanYaz(null); adimYaz('yukle'); }} disabled={adim === 'yaziliyor'}>Başka dosya</Dugme>
        {say.hata > 0 && <Dugme simge="download" onClick={() => void hataDosyasi(plan, null)}>Hata dosyasını indir</Dugme>}
        <Dugme tur="birincil" simge="check" disabled={say.hata > 0 || yazilacak === 0} yukleniyor={adim === 'yaziliyor'} onClick={() => void yazmayaBasla()}>
          Hepsini yaz ({yazilacak} satır)
        </Dugme>
      </>
    );
  } else {
    govde = (
      <div className="tc-xl-sonuc" role="status" aria-live="polite" data-tamam={sonuc?.tamam ? 'evet' : 'hayir'}>
        <Simge ad={sonuc?.tamam ? 'check' : 'alert'} /> <span>{sonuc?.metin}</span>
      </div>
    );
    alt = (
      <>
        {sonuc && !sonuc.tamam && okunan && (
          <Dugme simge="download" onClick={() => void hataDosyasi(okunan.plan, sonuc.redSatiri && sonuc.redIletisi ? { satir: sonuc.redSatiri, ileti: sonuc.redIletisi } : null)}>Hata dosyasını indir</Dugme>
        )}
        {sonuc && !sonuc.tamam && <Dugme onClick={() => { okunanYaz(null); adimYaz('yukle'); }}>Yeniden yükle</Dugme>}
        <Dugme tur="birincil" onClick={kapat}>Kapat</Dugme>
      </>
    );
  }

  return (
    <>
      <Pencere acik kapat={kapatIste} baslik={`${tanim?.baslik ?? ''}: Excel ile toplu giriş`} tur="yan" genis alt={alt}>
        {adimlar}
        {ileti && <p className="tc-xl-uyari" role="alert"><Simge ad="alert" /> {ileti}</p>}
        {govde}
      </Pencere>
      <OnayPenceresi acik={kapatSor} baslik="Yazım sürüyor" onayMetni="Yine de kapat" vazgec={() => kapatSorYaz(false)} onayla={() => { kapatSorYaz(false); kapat(); }}>
        Satırlar sunucuda yazılıyor. Pencereyi kapatırsanız sonucu burada göremezsiniz; yazım yine tamamlanır ya da hiçbiri yazılmaz.
      </OnayPenceresi>
    </>
  );
}
