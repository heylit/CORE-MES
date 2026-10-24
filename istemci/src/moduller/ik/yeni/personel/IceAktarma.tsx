import { useRef, useState } from 'react';
import { CokSatir, IsaretKutusu, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import { Rozet, type RozetTonu } from '../../../../ortak/arayuz/Rozet.tsx';
import { SayiKarti } from '../../../../ortak/arayuz/SayiKarti.tsx';
import { Tablo } from '../../../../ortak/arayuz/Tablo.tsx';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { ikSabitleri } from '../motor.ts';
import { useIkKomutu, yeniKimlik, type IkDeposu } from '../veri.ts';
import { PERSONEL_SECENEKLERI } from './alanlar.ts';
import {
  AKTARIM_ALANLARI, AKTARIM_SABLONU, aktarimHazirla, aktarimKayitlari, eslemeTahmini, tabloAyristir,
  type AktarimAlani, type AktarimEylemi, type AktarimHazirligi, type AktarimSatiri, type AktarimSecenegi,
} from './ice-aktarma.ts';
import { adSoyadMetni, bugun } from './kurallar.ts';

const EYLEM: Record<AktarimEylemi, [string, RozetTonu]> = { yeni: ['Yeni', 'tamam'], guncelle: ['Güncellenecek', 'bilgi'], atla: ['Atlanacak', 'pasif'], hata: ['Hatalı', 'hata'] };

// Üç adım: veriyi ekle (yapıştır ya da CSV), sütunları eşle, kontrol et ve aktar. Excel dosyası okunmaz; CSV UTF-8 değilse
// Türkçe Windows kodlamasıyla yeniden okunur (bugünkü davranış).
export function IceAktarma({ acik, kapat, depo }: { acik: boolean; kapat(): void; depo: IkDeposu }) {
  const komut = useIkKomutu();
  const sabitler = ikSabitleri();
  const { bildir } = useBildirim();
  const dosya = useRef<HTMLInputElement>(null);
  const [adim, adimYaz] = useState<1 | 2 | 3>(1);
  const [metin, metinYaz] = useState('');
  const [tablo, tabloYaz] = useState<string[][]>([]);
  const [esleme, eslemeYaz] = useState<(AktarimAlani | '')[]>([]);
  const [sec, secYaz] = useState<AktarimSecenegi>({ departmanOlustur: true, eslesen: 'atla' });
  const [hazirlik, hazirlikYaz] = useState<AktarimHazirligi | null>(null);
  const [uyari, uyariYaz] = useState<string | null>(null);

  const kapatVeSifirla = () => {
    adimYaz(1); metinYaz(''); tabloYaz([]); eslemeYaz([]); hazirlikYaz(null); uyariYaz(null);
    kapat();
  };

  const dosyaOku = async (f: File) => {
    let t = await f.text();
    if (t.includes('�')) {
      try { t = new TextDecoder('windows-1254').decode(await f.arrayBuffer()); } catch { /* tarayıcı bu kodlamayı bilmiyorsa UTF-8 metni kalır */ }
    }
    metinYaz(t);
  };

  const devam = () => {
    uyariYaz(null);
    if (adim === 1) {
      const r = tabloAyristir(metin);
      if (r.length < 2) { uyariYaz('En az bir başlık ve bir veri satırı gerekli.'); return; }
      tabloYaz(r);
      eslemeYaz(eslemeTahmini(r[0] ?? []));
      adimYaz(2);
      return;
    }
    if (!esleme.includes('ad') && !esleme.includes('adsoyad')) { uyariYaz('Ad (veya Ad soyad) sütununu eşleştirin.'); return; }
    hazirlikYaz(aktarimHazirla(tablo, esleme, sec, {
      gun: bugun(), personeller: depo.tur('emp'), departmanlar: depo.tur('dept'), isMerkezleri: depo.ben.secenekler.isMerkezleri,
      secenekler: PERSONEL_SECENEKLERI, yeniKimlik, yakaTahmini: sabitler?.inferCollar, kademeTahmini: sabitler?.inferLevel,
    }));
    adimYaz(3);
  };

  const aktar = async () => {
    if (!hazirlik) return;
    const kayitlar = aktarimKayitlari(hazirlik);
    try {
      await komut.topluKaydet(kayitlar);
    } catch {
      bildir('hata', 'Aktarım tamamlanamadı; yazılan kayıtlar listede, kalanları kontrol edip yeniden aktarın.');
      return;
    }
    kapatVeSifirla();
    bildir('tamam', `${kayitlar.length} kayıt aktarıldı.`);
  };

  const sayilar = (h: AktarimHazirligi) => (e: AktarimEylemi) => h.satirlar.filter((s) => s.eylem === e).length;
  const alinacak = hazirlik ? aktarimKayitlari(hazirlik).length - hazirlik.yeniDepartmanlar.length : 0;
  const basliklar = ['Personel aktar: 1. Veriyi ekleyin', 'Personel aktar: 2. Sütunları eşleştirin', 'Personel aktar: 3. Kontrol edin'] as const;

  return (
    <Pencere
      acik={acik} kapat={kapatVeSifirla} baslik={basliklar[adim - 1] ?? basliklar[0]} tur="yan"
      alt={(
        <>
          {adim > 1 && <Dugme simge="chev-left" onClick={() => { uyariYaz(null); adimYaz(adim === 3 ? 2 : 1); }}>Geri</Dugme>}
          <Dugme onClick={kapatVeSifirla}>Vazgeç</Dugme>
          {adim < 3
            ? <Dugme tur="birincil" onClick={devam}>{adim === 1 ? 'Devam' : 'Önizle'}</Dugme>
            : <Dugme tur="birincil" simge="upload" disabled={alinacak === 0} yukleniyor={komut.calisiyor} onClick={() => { void aktar(); }}>{`${alinacak} kaydı aktar`}</Dugme>}
        </>
      )}
    >
      {uyari && <p className="tc-ikp-uyari" role="alert">{uyari}</p>}
      {adim === 1 && (
        <div className="tc-ikp-aktarim">
          <p>Excel’de başlık satırıyla birlikte hücreleri seçip kopyalayın ve aşağıya yapıştırın. Ya da CSV dosyası seçin (Excel: Farklı Kaydet &gt; CSV UTF-8).</p>
          <CokSatir etiket="Yapıştırılan tablo" rows={10} value={metin} placeholder={'Ad\tSoyad\tT.C. Kimlik No\tİşe Giriş\tPozisyon\tDepartman\tBrüt Ücret'} onChange={(e) => { metinYaz(e.target.value); }} />
          <div className="tc-ikp-satir">
            <Dugme simge="file" onClick={() => dosya.current?.click()}>CSV dosyası seç</Dugme>
            <Dugme simge="download" onClick={() => { csvIndir('personel-aktarim-sablonu', AKTARIM_SABLONU.basliklar, [[...AKTARIM_SABLONU.ornek]]); }}>Örnek şablonu indir</Dugme>
            <input
              ref={dosya} type="file" accept=".csv,.txt,text/csv,text/plain" hidden aria-label="CSV dosyası"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void dosyaOku(f); }}
            />
          </div>
        </div>
      )}
      {adim === 2 && (
        <div className="tc-ikp-aktarim">
          <p className="tc-ikp-ipucu">{`${tablo.length - 1} satır bulundu. Sütun başlıkları tahmin edildi; gerekirse düzeltin. Eşleşmeyen sütunlar alınmaz.`}</p>
          <div className="tc-ikp-esleme">
            {(tablo[0] ?? []).map((h, c) => (
              <Secim
                key={`${c}-${h}`} etiket={h || `Sütun ${c + 1}`} value={esleme[c] ?? ''} bosSecenek="Alma"
                ipucu={tablo.slice(1, 3).map((r) => r[c] ?? '').filter(Boolean).join(' · ').slice(0, 60) || undefined}
                secenekler={AKTARIM_ALANLARI.map(([deger, baslik]) => ({ deger, baslik }))}
                onChange={(e) => { const y = [...esleme]; y[c] = e.target.value as AktarimAlani | ''; eslemeYaz(y); }}
              />
            ))}
          </div>
          <IsaretKutusu etiket="Olmayan departmanları oluştur" checked={sec.departmanOlustur} onChange={(e) => { secYaz({ ...sec, departmanOlustur: e.target.checked }); }} />
          <Secim
            etiket="Kayıtlı personelle eşleşenler" value={sec.eslesen} ipucu="T.C. kimlik no, sicil no veya ad soyad ve işe giriş tarihiyle eşleştirilir."
            secenekler={[{ deger: 'atla', baslik: 'Atla' }, { deger: 'guncelle', baslik: 'Boş olmayan alanlarla güncelle' }]}
            onChange={(e) => { secYaz({ ...sec, eslesen: e.target.value as AktarimSecenegi['eslesen'] }); }}
          />
        </div>
      )}
      {adim === 3 && hazirlik && (() => {
        const say = sayilar(hazirlik);
        const uyarili = hazirlik.satirlar.filter((s) => s.uyarilar.length && s.eylem !== 'hata').length;
        return (
          <div className="tc-ikp-aktarim">
            <div className="tc-ikp-kartlar">
              <SayiKarti baslik="Yeni personel" simge="user-plus" sayi={say('yeni')} />
              <SayiKarti baslik="Güncellenecek" simge="edit" sayi={say('guncelle')} />
              <SayiKarti baslik="Atlanacak (kayıtlı)" simge="next" sayi={say('atla')} />
              <SayiKarti baslik="Hatalı (alınmaz)" simge="alert" sayi={say('hata')} ton={say('hata') ? 'hata' : 'bilgi'} />
            </div>
            {hazirlik.yeniDepartmanlar.length > 0 && <p>{`${hazirlik.yeniDepartmanlar.length} yeni departman oluşturulacak: ${hazirlik.yeniDepartmanlar.map((d) => d.ad).join(', ')}.`}</p>}
            {uyarili > 0 && <p className="tc-ikp-ipucu">{`${uyarili} satırda uyarı var; bu satırlar alınır, uyarılı alanlar boş bırakılır.`}</p>}
            <Tablo<AktarimSatiri>
              etiket="Aktarım önizlemesi" satirlar={hazirlik.satirlar} satirAnahtari={(s) => s.satir}
              sutunlar={[
                { anahtar: 'satir', baslik: 'Satır', hucre: (s) => s.satir, hizala: 'sag' },
                { anahtar: 'ad', baslik: 'Ad soyad', hucre: (s) => s.ad },
                { anahtar: 'eylem', baslik: 'Durum', hucre: (s) => <Rozet ton={EYLEM[s.eylem][1]}>{EYLEM[s.eylem][0]}</Rozet> },
                { anahtar: 'not', baslik: 'Notlar', hucre: (s) => [...s.hatalar, ...s.uyarilar].join('; ') || (s.eslesen ? `Kayıtlı: ${adSoyadMetni(s.eslesen)}` : '') },
              ]}
            />
          </div>
        );
      })()}
    </Pencere>
  );
}
