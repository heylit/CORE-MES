import { useRef, useState } from 'react';
import { Dugme, Girdi, IsaretKutusu, Pencere, useBildirim } from '../../../../ortak/arayuz/index.ts';
import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { KartKaydi, KartOzeti } from '../tipler.ts';
import { kayitHatasi } from '../veri.ts';
import { dosyaIndir } from './dosya.ts';
import {
  calismaKitabi, planKur, planiUygula, satirDurumu, sayfalariOku, uygulanacaklar, type PlanSatiri, type SatirDurumu,
} from './excel.ts';

const DURUM_AD: Record<SatirDurumu, string> = { ekle: 'Eklenecek', guncelle: 'Güncellenecek', ayni: 'Değişmeyen', mukerrer: 'Mükerrer', hata: 'Hatalı', atla: 'Atlanacak' };
const DURUMLAR: SatirDurumu[] = ['ekle', 'guncelle', 'ayni', 'mukerrer', 'hata', 'atla'];
const GOSTERILEN = 400;

interface Ozellikler {
  kayitlar: readonly KartKaydi[];
  gorunen: readonly KartKaydi[];
  yazabilir: boolean;
  b: KuralBaglami;
  kapat: () => void;
  kaydet: (g: { kayit: KartKaydi; ozet: KartOzeti }) => Promise<unknown>;
}

export function ExcelPenceresi({ kayitlar, gorunen, yazabilir, b, kapat, kaydet }: Ozellikler) {
  const { bildir } = useBildirim();
  const dosya = useRef<HTMLInputElement | null>(null);
  const [plan, planYaz] = useState<{ ad: string; satirlar: PlanSatiri[] } | null>(null);
  const [suz, suzYaz] = useState<SatirDurumu | 'uyari' | ''>('');
  const [mukEkle, mukEkleYaz] = useState(false);
  const [mukNeden, mukNedenYaz] = useState('');
  const [mesgul, mesgulYaz] = useState<string | null>(null);

  const indir = async (liste: readonly KartKaydi[] | null, ad: string) => {
    mesgulYaz(ad);
    try { dosyaIndir(ad, await calismaKitabi(liste, b)); } catch { bildir('hata', 'Excel dosyası oluşturulamadı.'); } finally { mesgulYaz(null); }
  };

  const oku = async (f: File) => {
    mesgulYaz('oku');
    try {
      const sayfalar = await sayfalariOku(await f.arrayBuffer());
      const satirlar = planKur(sayfalar, kayitlar, b);
      if (!satirlar.length) { bildir('hata', 'Dosyada okunacak satır bulunamadı. Sayfa adları (Hammadde, Yarı mamul …) ve başlıklar şablondaki gibi olmalı.'); return; }
      suzYaz(''); mukEkleYaz(false);
      planYaz({ ad: f.name, satirlar });
    } catch {
      bildir('hata', 'Dosya okunamadı; şablondan oluşturulmuş bir .xlsx olmalı.');
    } finally { mesgulYaz(null); }
  };

  if (!plan) {
    return (
      <Pencere acik kapat={kapat} baslik="Excel ile toplu giriş ve çıkış" tur="orta" alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
        <div className="tc-mk-excel">
          <button type="button" className="tc-mk-excel-secenek" disabled={mesgul !== null} onClick={() => void indir(null, 'malzeme-sablonu.xlsx')}>
            <b>Boş şablon indir</b>
            <span>Her tür için ayrı sayfa, açılır listeler, örnek satır ve kullanım kılavuzu. Listeler Malzeme ayarlarını yansıtır.</span>
          </button>
          <button type="button" className="tc-mk-excel-secenek" disabled={!kayitlar.length || mesgul !== null} onClick={() => void indir(gorunen, 'malzeme-katalogu.xlsx')}>
            <b>Excel'e aktar</b>
            <span>
              {gorunen.length !== kayitlar.length ? `Listede görünen ${gorunen.length} kart` : `Katalogdaki ${kayitlar.length} kart`}; aynı şablon biçiminde. Düzeltip geri içe aktarabilirsin.
            </span>
          </button>
          {yazabilir && (
            <button type="button" className="tc-mk-excel-secenek" disabled={mesgul !== null} onClick={() => dosya.current?.click()}>
              <b>Excel'den içe aktar</b>
              <span>Şablonu doldurup yükle; önce sonuçları gösterir, onaylayınca kartları oluşturur ya da günceller.</span>
            </button>
          )}
          <input
            ref={dosya} type="file" accept=".xlsx" hidden aria-label="Excel dosyası"
            onChange={(o) => { const f = o.target.files?.[0]; o.target.value = ''; if (f) void oku(f); }}
          />
        </div>
      </Pencere>
    );
  }

  const say: Record<SatirDurumu, number> = { ekle: 0, guncelle: 0, ayni: 0, mukerrer: 0, hata: 0, atla: 0 };
  plan.satirlar.forEach((p) => { say[satirDurumu(p, mukEkle)]++; });
  const uyarili = plan.satirlar.filter((p) => p.uyarilar.length && !p.hatalar.length).length;
  const liste = plan.satirlar.filter((p) => !suz || satirDurumu(p, mukEkle) === suz || (suz === 'uyari' && p.uyarilar.length > 0 && !p.hatalar.length));
  const yapilacak = say.ekle + say.guncelle;
  const dugmeMetni = yapilacak
    ? [say.ekle ? `${say.ekle} kart ekle` : '', say.guncelle ? `${say.guncelle} kart güncelle` : ''].filter(Boolean).join(', ')
    : 'Aktarılacak satır yok';

  const uygula = async () => {
    const yap = uygulanacaklar(plan.satirlar, mukEkle);
    if (yap.some((p) => p.mukerrer.length && p.islem === 'ekle') && !mukNeden.trim()) { bildir('hata', 'Mükerrerleri eklemek için gerekçe yaz.'); return; }
    mesgulYaz(`0 / ${yap.length}`);
    const s = await planiUygula(yap, mukNeden, b, kaydet, (n) => mesgulYaz(`${n} / ${yap.length}`));
    mesgulYaz(null);
    if (s.ilkHata) bildir('hata', kayitHatasi(s.ilkHata).ileti);
    bildir('tamam', `${s.ok} kart aktarıldı${s.hata ? `, ${s.hata} kart kaydedilemedi` : ''}${b.genel.onayAkisi && s.ok ? '; yeniler onay bekliyor' : ''}.`);
    kapat();
  };

  return (
    <Pencere
      acik kapat={kapat} baslik="İçe aktarım önizlemesi" tur="tam"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={mesgul !== null}>Vazgeç</Dugme>
          <Dugme tur="birincil" disabled={!yapilacak} yukleniyor={mesgul !== null} onClick={() => void uygula()}>{mesgul ?? dugmeMetni}</Dugme>
        </>
      )}
    >
      <p className="tc-mk-ipucu">{plan.ad} · {plan.satirlar.length} satır</p>
      <div className="tc-mk-cipler" role="group" aria-label="Sonuca göre süz">
        {DURUMLAR.map((k) => (
          <Dugme key={k} aria-pressed={suz === k} onClick={() => suzYaz(suz === k ? '' : k)}><b>{say[k]}</b> {DURUM_AD[k]}</Dugme>
        ))}
        <Dugme aria-pressed={suz === 'uyari'} onClick={() => suzYaz(suz === 'uyari' ? '' : 'uyari')}><b>{uyarili}</b> Uyarılı</Dugme>
      </div>
      {(say.mukerrer > 0 || mukEkle) && (
        <>
          <IsaretKutusu etiket="Mükerrer görünenleri de yeni kart olarak ekle" checked={mukEkle} onChange={(o) => mukEkleYaz(o.target.checked)} />
          {mukEkle && <Girdi etiket="Gerekçe" required value={mukNeden} placeholder="ör. Tedarikçiye özel kartlar" onChange={(o) => mukNedenYaz(o.target.value)} />}
        </>
      )}
      <div className="tc-mk-tablo-kap">
        <table className="tc-mk-tablo">
          <thead>
            <tr><th scope="col">Sayfa</th><th scope="col" className="tc-mk-sayi">Satır</th><th scope="col">Sonuç</th><th scope="col">Kod</th><th scope="col">Ad</th><th scope="col">Açıklama</th></tr>
          </thead>
          <tbody>
            {liste.slice(0, GOSTERILEN).map((p) => {
              const d = satirDurumu(p, mukEkle);
              const k = p.kayit;
              const kod = k ? (k.com.kod || (p.islem === 'guncelle' && p.eslesen ? p.eslesen.com.kod : 'otomatik')) : String(p.r['com.kod'] ?? '');
              const notlar = [
                ...p.hatalar.map((x) => `✕ ${x}`),
                ...(d === 'mukerrer' ? [`Aynı kart var: ${p.mukerrer.join(', ')}`] : []),
                ...(d === 'guncelle' && p.farklar ? p.farklar.slice(0, 4).map((f) => `${f.f}: ${f.a} → ${f.b}`).concat(p.farklar.length > 4 ? [`+${p.farklar.length - 4} değişiklik`] : []) : []),
                ...p.uyarilar.map((x) => `! ${x}`),
              ];
              return (
                <tr key={`${p.sayfa}-${p.satir}`} data-durum={d}>
                  <td>{p.sayfa}</td>
                  <td className="tc-mk-sayi">{p.satir}</td>
                  <td>{DURUM_AD[d]}</td>
                  <td><b className="tc-mk-kod">{kod || '—'}</b></td>
                  <td>{k ? K.finalAd(k, b) : ''}</td>
                  <td className="tc-mk-soluk">{notlar.map((n, i) => <div key={i}>{n}</div>)}</td>
                </tr>
              );
            })}
            {liste.length === 0 && <tr><td colSpan={6}>Bu süzgeçte satır yok.</td></tr>}
          </tbody>
        </table>
      </div>
      {liste.length > GOSTERILEN && <p className="tc-mk-ipucu">İlk {GOSTERILEN} satır gösteriliyor.</p>}
    </Pencere>
  );
}
