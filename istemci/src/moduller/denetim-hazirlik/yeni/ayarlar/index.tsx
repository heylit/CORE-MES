import { useRef, useState } from 'react';
import { CokSatir, Dugme, Girdi, IsaretKutusu, Kart, OnayPenceresi, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { indir } from '../disa-aktar.ts';
import { PROGRAMLAR, PROGRAM_SIRASI } from '../icerik/programlar.ts';
import { siradakiDenetim } from '../kurallar/denetim-takvimi.ts';
import {
  hepsiniSil, profilAdi, profilEkle, profilKopyala, profilSil, SIFIRLAMA_ALANLARI, sifirla, yedekDosyaAdi, yedektenOku, yedekVerisi, yedekYukle, type SifirlamaAlani,
} from '../kurallar/profil.ts';
import { programPuani } from '../kurallar/puan.ts';
import { tarihMetni, tarihSaatMetni } from '../tarih.ts';
import type { FirmaBilgisi, ProgramKodu } from '../tipler.ts';
import { yikiciIzinli } from '../yonetim.ts';
import '../ic-denetim/p3-ortak.css';
import '../takvim/takvim.css';
import './ayarlar.css';

// Ayarlar ve veriler (prototip Profil ve veriler): firma bilgileri, programlar, profil listesi, yedek ve sıfırlama. Profil silme, seçerek
// sıfırlama, bütün profilleri silme ve yedekten yükleme yalnız yöneticide görünür (226 a); sunucu da reddeder.

const YEDEK_UYARI_MS = 14 * 86_400_000;
const bas = (n: string): string => {
  const w = n.trim().split(/\s+/).filter(Boolean);
  return w.length ? `${w[0]?.[0] ?? ''}${w[1]?.[0] ?? ''}`.toLocaleUpperCase('tr') : '?';
};
const puanMetni = (k: ProgramKodu, p: number | null): string => (p == null ? '–' : k === 'eydep' ? `${String(p)} p` : `%${String(p)}`);
const puanSinifi = (p: number | null): string => (p == null ? 'tc-dhd-soluk' : p >= 85 ? 'tc-dhy-ton-iyi' : p >= 70 ? 'tc-dhy-ton-bilgi' : p >= 50 ? 'tc-dhy-ton-uyari' : 'tc-dhy-ton-kotu');

type Soru = { tur: 'sil'; id: string; ad: string } | { tur: 'sifirla' } | { tur: 'hepsi' } | null;

export function Ayarlar() {
  const d = useDenetim();
  const dosya = useRef<HTMLInputElement>(null);
  const [secim, secimYaz] = useState<ReadonlySet<SifirlamaAlani>>(new Set());
  const [soru, soruYaz] = useState<Soru>(null);
  const yaz = d.yetki.yazabilir;
  const yonetici = yikiciIzinli(d.yetki);
  const P = d.profil.profile;
  const depo = d.depo;

  const alan = (k: keyof FirmaBilgisi) => ({
    value: P[k], disabled: !yaz, autoComplete: 'off',
    onChange: (e: { target: { value: string } }) => { const v = e.target.value.slice(0, k === 'kapsam' ? 600 : 160); d.degistir(null, (t) => { t.profile[k] = v; }); },
  });

  const yedekAl = (ids: string[]) => {
    try {
      const ad = yedekDosyaAdi(depo, ids);
      indir(ad, JSON.stringify(yedekVerisi(depo, ids), null, 1), 'application/json');
      if (yaz && ids.length === depo.order.length) d.depoDegistir(null, (t) => { t.lastBackup = Date.now(); });
      d.bildir(`Yedek indirildi: ${ad}`, { ton: 'bilgi' });
    } catch {
      d.bildir('Yedek dosyası oluşturulamadı', { ton: 'hata' });
    }
  };

  const yedekOku = (f: File) => {
    f.text().then((metin) => {
      const arr = yedektenOku(metin);
      if (!arr) { d.bildir('Bu dosya geçerli bir yedek değil', { ton: 'hata' }); return; }
      let n = 0;
      d.depoDegistir(null, (t) => { n = yedekYukle(t, arr); });
      d.bildir(`${String(n)} profil yedekten yüklendi`);
    }, () => { d.bildir('Dosya okunamadı', { ton: 'hata' }); });
  };

  const sonYedek = depo.lastBackup;
  // Saat okuma çizimde yapılır; yedek uyarısı yalnız bilgidir, ekran açıkken eskimesi önemsizdir.
  const eski = !sonYedek || Date.now() - sonYedek > YEDEK_UYARI_MS;
  const secilen = SIFIRLAMA_ALANLARI.filter(([k]) => secim.has(k)).length;

  return (
    <div className="tc-dhd">
      {d.ekran.ux !== 'uzman' && <p className="tc-dhd-aciklama">Firma bilgileri, her firma veya saha için ayrı profil, yedekleme ve sıfırlama.</p>}

      <Kart baslik="Firma ve denetim bilgileri" baslikEki={yaz ? <span className="tc-dhd-soluk">Yazdıkça kaydedilir</span> : undefined}>
        {d.kurumAdi && <p className="tc-dhd-not">{`Ekran başlığındaki kurum adı TMI ayarlarından gelir: ${d.kurumAdi}.`}</p>}
        <div className="tc-dhd-form">
          <Girdi etiket="Firma adı" placeholder="Örn. firma unvanı" {...alan('firma')} />
          <Girdi etiket="Tesis / saha" placeholder="Örn. 2. fabrika" {...alan('tesis')} />
          <div className="tc-dhd-genis"><CokSatir etiket="KYS kapsamı" rows={2} placeholder="Sertifikadaki kapsam ifadesiyle aynı yazın" {...alan('kapsam')} /></div>
          <Girdi etiket="Belgelendirme kuruluşu (varsayılan)" placeholder="Örn. TSE, TÜV, BV" {...alan('kurulus')} />
          <Girdi etiket="Hazırlayan" placeholder="Ad soyad, görev" list="tc-dhd-kisiler" {...alan('hazirlayan')} />
          <datalist id="tc-dhd-kisiler">{d.kisiler.map((k) => <option key={k.id} value={k.ad} />)}</datalist>
        </div>
      </Kart>

      <Kart baslik="Bu firmanın programları" sag={<Dugme simge="clock" onClick={() => { d.git('takvim'); }}>Takvimi aç</Dugme>}>
        {d.ekran.ux !== 'uzman' && (
          <p className="tc-dhd-aciklama">Her programın cevapları, hazırlık görevleri ve raporu ayrı tutulur. Program değiştirdiğinizde kaldığınız yerden devam edersiniz.</p>
        )}
        <ul className="tc-dhd-plist">
          {PROGRAM_SIRASI.map((k) => {
            const G = PROGRAMLAR[k];
            const sr = programPuani(d.profil, k);
            const na = siradakiDenetim(d.profil, k);
            const n = Object.keys(d.profil.pw[k].ans).length;
            const acik = d.program === k;
            return (
              <li key={k} className={`tc-dhd-prow tc-dhd-p-${k}${acik ? ' tc-dhd-prow-acik' : ''}`}>
                <span className="tc-dhd-pav" aria-hidden="true">{G.s.slice(0, 2)}</span>
                <span className="tc-dhd-iki">
                  <b>{G.n}</b>
                  <small>{[na ? `${na.type || 'Denetim'} · ${tarihMetni(na.date)}` : 'Planlanmış denetim yok', n ? `${String(n)} soru cevaplandı` : 'Henüz başlanmadı'].join(' · ')}</small>
                </span>
                <b className={puanSinifi(sr.pct)}>{puanMetni(k, sr.pct)}</b>
                {acik ? <Rozet ton="tamam">Açık</Rozet> : <Dugme onClick={() => { d.programSec(k); }}>Bu programa geç</Dugme>}
              </li>
            );
          })}
        </ul>
      </Kart>

      <Kart
        baslik="Profiller"
        sag={yaz ? (
          <span className="tc-dhd-dugmeler">
            <Dugme simge="file" onClick={() => { d.depoDegistir(null, (t) => { profilKopyala(t); }); d.bildir('Profil kopyalandı'); }}>Bu profili kopyala</Dugme>
            <Dugme tur="birincil" simge="plus" onClick={() => { d.depoDegistir(null, (t) => { profilEkle(t); }); d.bildir('Yeni profil açıldı'); }}>Yeni profil</Dugme>
          </span>
        ) : undefined}
      >
        {d.ekran.ux !== 'uzman' && (
          <p className="tc-dhd-aciklama">Her firma veya saha için ayrı profil açın. Cevaplar, görevler ve notlar profile özeldir; profil değiştirince kaldığınız yerden devam edersiniz.</p>
        )}
        <ul className="tc-dhd-plist">
          {depo.order.map((id) => {
            const x = depo.data[id];
            if (!x) return null;
            const acik = id === depo.active;
            const nm = profilAdi(x);
            const G = PROGRAMLAR[x.prog];
            const sr = programPuani(x, x.prog);
            const na = siradakiDenetim(x, '*');
            const meta = [na ? `${PROGRAMLAR[na.prog].s} · ${tarihMetni(na.date)}` : '', x.updated ? `Son değişiklik ${tarihSaatMetni(x.updated)}` : ''].filter(Boolean);
            return (
              <li key={id} className={`tc-dhd-prow${acik ? ' tc-dhd-prow-acik' : ''}`}>
                <span className="tc-dhd-pav" aria-hidden="true">{bas(x.profile.firma)}</span>
                <span className="tc-dhd-iki"><b>{nm}</b><small>{meta.length ? meta.join(' · ') : 'Bilgi girilmedi'}</small></span>
                <b className={puanSinifi(sr.pct)} title={`${G.s} hazırlık puanı`}>{sr.pct == null ? '–' : `${G.s} %${String(sr.pct)}`}</b>
                {acik ? <Rozet ton="tamam">Açık</Rozet> : yaz && (
                  <Dugme onClick={() => { d.depoDegistir(null, (t) => { t.active = id; }); d.bildir(`${nm} açıldı`); }}>Aç</Dugme>
                )}
                {yonetici && depo.order.length > 1 && (
                  <Dugme simge="trash" aria-label={`${nm} profilini sil`} title="Profili sil" onClick={() => { soruYaz({ tur: 'sil', id, ad: nm }); }} />
                )}
              </li>
            );
          })}
        </ul>
      </Kart>

      <Kart baslik="Veriler nerede saklanıyor?">
        <p className="tc-dhd-aciklama">Bütün bilgiler TMI sunucusunda, kurum içindeki ortak kayıtta tutulur; internete gönderilmez. Aynı kaydı yetkili herkes görür; başka bir bilgisayardan girildiğinde de kayıtlar oradadır.</p>
        <p className="tc-dhd-aciklama">Yedek dosyası (.json) bu kayıtların taşınabilir kopyasıdır; bir profili başka bir kuruluşa ya da başka bir kurulumda devam etmek için taşır.</p>
        <p className={`tc-dhd-durum ${eski ? 'tc-dhy-ton-uyari' : 'tc-dhy-ton-iyi'}`}>
          <Simge ad={eski ? 'alert' : 'check'} />
          <span>{`Otomatik kayıt açık. ${sonYedek ? `Son tam yedek: ${tarihSaatMetni(sonYedek)}.` : 'Henüz yedek alınmadı.'}${eski ? ' Önemli bir oturumdan sonra yedek almanız önerilir.' : ''}`}</span>
        </p>
        <div className="tc-dhd-dugmeler tc-dhd-sola">
          <Dugme tur="birincil" simge="download" onClick={() => { yedekAl(depo.order.slice()); }}>Tüm profilleri yedekle</Dugme>
          <Dugme simge="download" onClick={() => { yedekAl([depo.active]); }}>Yalnız bu profil</Dugme>
          {yonetici && <Dugme simge="upload" onClick={() => { if (dosya.current) { dosya.current.value = ''; dosya.current.click(); } }}>Yedek yükle</Dugme>}
          <input
            ref={dosya} type="file" accept=".json,application/json" hidden aria-label="Yedek dosyası"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) yedekOku(f); }}
          />
        </div>
        {yonetici && <p className="tc-dhd-not">Yedek yüklemek mevcut profilleri silmez, dosyadaki profilleri listeye ekler.</p>}
      </Kart>

      {yonetici && (
        <Kart baslik="Sıfırlama">
          <p className="tc-dhd-aciklama">
            {`Yalnızca açık firma (${profilAdi(d.profil)}) ve açık program (${d.pg.n}) etkilenir; takvim ve firma bilgileri seçerseniz silinir. Sıfırlamadan önce yedek almanız önerilir.`}
          </p>
          <div className="tc-dhd-sifirla">
            {SIFIRLAMA_ALANLARI.map(([k, ad]) => (
              <IsaretKutusu
                key={k} etiket={ad} checked={secim.has(k)}
                onChange={(e) => { const s = new Set(secim); if (e.target.checked) s.add(k); else s.delete(k); secimYaz(s); }}
              />
            ))}
          </div>
          <div className="tc-dhd-dugmeler tc-dhd-sola">
            <Dugme onClick={() => { secimYaz(secilen === SIFIRLAMA_ALANLARI.length ? new Set() : new Set(SIFIRLAMA_ALANLARI.map(([k]) => k))); }}>
              {secilen === SIFIRLAMA_ALANLARI.length ? 'Seçimi kaldır' : 'Tümünü seç'}
            </Dugme>
            <Dugme tur="tehlike" simge="rotate" disabled={!secilen} onClick={() => { soruYaz({ tur: 'sifirla' }); }}>Seçilenleri sıfırla</Dugme>
          </div>
          <div className="tc-dhd-tehlike">
            <span className="tc-dhd-iki"><b>Bütün profilleri sil</b><small>Ortak kayıttaki bütün profiller temizlenir, araç ilk açıldığı hale döner.</small></span>
            <Dugme tur="tehlike" simge="trash" onClick={() => { soruYaz({ tur: 'hepsi' }); }}>Tümünü sil</Dugme>
          </div>
        </Kart>
      )}

      <OnayPenceresi
        acik={soru !== null} tehlikeli vazgec={() => { soruYaz(null); }}
        baslik={soru?.tur === 'sil' ? 'Profil silinsin mi?' : soru?.tur === 'sifirla' ? 'Seçilenler sıfırlansın mı?' : 'Bütün profiller silinsin mi?'}
        onayMetni={soru?.tur === 'sifirla' ? 'Sıfırla' : soru?.tur === 'hepsi' ? 'Hepsini sil' : 'Sil'}
        onayla={() => {
          const s = soru;
          soruYaz(null);
          if (!s) return;
          if (s.tur === 'sil') { d.depoDegistir(null, (t) => { profilSil(t, s.id); }); d.bildir(`${s.ad} silindi`); return; }
          if (s.tur === 'sifirla') {
            const program = d.program;
            d.degistir('Sıfırlama', (t) => { sifirla(t, program, secim); });
            d.ekranDegistir((e) => {
              const w = e.pw[program];
              if (secim.has('sim')) { w.cur = 0; w.mode = 'full'; }
              if (secim.has('prep')) w.phase = -1;
              if (secim.has('trace')) w.chainSel = 't1';
              if (secim.has('cards')) { w.card = 0; w.flipped = false; }
              if (secim.has('docs')) w.docq = '';
            });
            secimYaz(new Set());
            return;
          }
          d.depoDegistir(null, hepsiniSil);
          secimYaz(new Set());
          d.bildir('Tüm profiller silindi');
          d.git('dash');
        }}
      >
        <p>
          {soru?.tur === 'sil' ? `${soru.ad} profili ve bütün kayıtları silinir.`
            : soru?.tur === 'sifirla' ? `${String(secilen)} alan silinecek. Geri al ile hemen geri alınabilir; sayfa kapanınca geri alınamaz.`
              : 'Ortak kayıttaki bütün profiller silinir, geri alınamaz.'}
        </p>
      </OnayPenceresi>
    </div>
  );
}
