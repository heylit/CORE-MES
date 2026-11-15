import { useState } from 'react';
import { DurumKutusu, Dugme, Girdi, OnayPenceresi, Pencere, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { tarih } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { RotaSablonu } from '../rotalar/sablonSecimi.ts';
import { useRotaSablonKomutu, useRotaSablonlari, type RotaSablonKomutu } from '../rotalar/sablonVerisi.ts';

// Rota şablonları (3273 a): liste, kullanım, düzenle, çoğalt, varsayılan yap, kullanımdan kaldır. Kullanılmış şablon silinmez (Risk K1);
// varsayılan şablon kullanımdan kalkmaz (K2). Yeni şablon Ürün ve rotalar'da "Şablon olarak sakla" ile açılır: adımlar gerçek rotadan gelir.

const adimlarGovdesi = (s: RotaSablonu) => [...s.adimlar].sort((a, b) => a.sira - b.sira).map((x) => ({ operasyonTipiId: x.operasyonTipi.id, ad: x.ad }));
const sozcukListesi = (m: string): string[] => [...new Set(m.split(',').map((x) => x.trim()).filter((x) => x !== ''))];

function DuzenlePenceresi({ s, kapat }: { s: RotaSablonu; kapat: () => void }) {
  const komut = useRotaSablonKomutu();
  const { bildir } = useBildirim();
  const [ad, setAd] = useState(s.ad);
  const [sozcuk, setSozcuk] = useState(s.oneriSozcukleri.join(', '));
  const [aciklama, setAciklama] = useState(s.aciklama ?? '');
  const kaydet = () => {
    komut.mutate({ ad: 'kaydet', id: s.id, govde: { ad: ad.trim(), aciklama: aciklama.trim() || null, oneriSozcukleri: sozcukListesi(sozcuk), adimlar: adimlarGovdesi(s), surum: s.surum } }, {
      onSuccess: () => { bildir('tamam', `${ad.trim()} şablonu kaydedildi.`); kapat(); },
      onError: (h) => { bildir('hata', `Kaydedilemedi: ${h.message}`); },
    });
  };
  return (
    <Pencere acik kapat={kapat} baslik={`${s.ad} şablonunu düzenle`} alt={(
      <>
        <Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" disabled={ad.trim() === ''} yukleniyor={komut.isPending} onClick={kaydet}>Kaydet</Dugme>
      </>
    )}>
      <Girdi etiket="Şablon adı" value={ad} maxLength={120} onChange={(e) => { setAd(e.target.value); }} />
      <Girdi etiket="Öneri sözcükleri" ipucu="Virgülle ayır; ürün adında geçerse şablon boş rotada önerilir." value={sozcuk} onChange={(e) => { setSozcuk(e.target.value); }} />
      <Girdi etiket="Açıklama" value={aciklama} maxLength={500} onChange={(e) => { setAciklama(e.target.value); }} />
      <p className="tc-rs-ipucu">Adımlar şablon kullanıldığında katalogdaki istasyon ve süreyle gelir; adım sırası değiştirmek için rotadan yeniden sakla.</p>
    </Pencere>
  );
}

function SablonSatiri({ s, yazabilir, duzenle }: { s: RotaSablonu; yazabilir: boolean; duzenle: () => void }) {
  const komut = useRotaSablonKomutu();
  const { bildir } = useBildirim();
  const [silOnayi, setSilOnayi] = useState(false);
  const gonder = (k: RotaSablonKomutu, tamam: string) => {
    komut.mutate(k, { onSuccess: () => { bildir('tamam', tamam); setSilOnayi(false); }, onError: (h) => { bildir('hata', h.message); setSilOnayi(false); } });
  };
  const kullanim = s.kullanim.revizyon > 0 ? `${String(s.kullanim.revizyon)} rotada kullanıldı${s.kullanim.son ? `, son ${tarih(s.kullanim.son)}` : ''}` : 'henüz kullanılmadı';
  return (
    <li className={`tc-rs-satir${s.aktif ? '' : ' tc-rs-pasif'}`}>
      <div className="tc-rs-bas">
        <Simge ad="route" boyut="k" /> <b>{s.ad}</b>
        {s.varsayilan && <span className="tc-rs-rozet">varsayılan</span>}
        {!s.aktif && <span className="tc-rs-rozet">kullanımdan kalktı</span>}
      </div>
      <small className="tc-rs-ipucu">{`${String(s.adimlar.length)} adım · ${kullanim}`}</small>
      <span className="tc-rs-adimlar">{[...s.adimlar].sort((a, b) => a.sira - b.sira).map((x) => x.ad).join(' › ')}</span>
      {s.oneriSozcukleri.length > 0 && <small className="tc-rs-ipucu">Öneri sözcükleri: {s.oneriSozcukleri.join(', ')}</small>}
      {s.aciklama && <p className="tc-rs-aciklama">{s.aciklama}</p>}
      {yazabilir && (
        <span className="tc-rs-dugmeler">
          <Dugme tur="ikincil" simge="edit" onClick={duzenle}>Düzenle</Dugme>
          <Dugme tur="ikincil" simge="layers" yukleniyor={komut.isPending}
            onClick={() => { gonder({ ad: 'ekle', govde: { ad: `${s.ad} (kopya)`.slice(0, 120), aciklama: s.aciklama, oneriSozcukleri: s.oneriSozcukleri, adimlar: adimlarGovdesi(s) } }, `${s.ad} çoğaltıldı.`); }}>
            Çoğalt
          </Dugme>
          {!s.varsayilan && s.aktif && (
            <Dugme tur="ikincil" simge="flag" onClick={() => { gonder({ ad: 'varsayilan-yap', id: s.id, govde: { surum: s.surum } }, `${s.ad} varsayılan şablon oldu.`); }}>Varsayılan yap</Dugme>
          )}
          {!s.varsayilan && (
            <Dugme tur="ikincil" simge={s.aktif ? 'lock' : 'check'}
              onClick={() => { gonder({ ad: 'durum', id: s.id, govde: { aktif: !s.aktif, surum: s.surum } }, s.aktif ? `${s.ad} kullanımdan kaldırıldı; boş rotada önerilmez.` : `${s.ad} yeniden kullanımda.`); }}>
              {s.aktif ? 'Kullanımdan kaldır' : 'Kullanıma al'}
            </Dugme>
          )}
          {!s.varsayilan && s.kullanim.revizyon === 0 && <Dugme tur="tehlike" simge="trash" onClick={() => { setSilOnayi(true); }}>Sil</Dugme>}
        </span>
      )}
      <OnayPenceresi acik={silOnayi} baslik={`${s.ad} silinsin mi?`} onayMetni="Sil" tehlikeli yukleniyor={komut.isPending}
        vazgec={() => { setSilOnayi(false); }} onayla={() => { gonder({ ad: 'sil', id: s.id, govde: { surum: s.surum } }, `${s.ad} silindi.`); }}>
        <p>Bu şablondan hiç rota açılmadı; silinince geri gelmez.</p>
      </OnayPenceresi>
    </li>
  );
}

export function RotaSablonlari(o: EkranOzellikleri) {
  const sorgu = useRotaSablonlari();
  const [duzenlenen, setDuzenlenen] = useState<number | null>(null);
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj="Rota şablonları okunamadı." />;
  const liste = sorgu.data;
  const secili = liste.find((s) => s.id === duzenlenen) ?? null;
  return (
    <div className="tc-rs" data-parca="R1">
      <p className="tc-rs-ipucu">
        {o.yetki.sablonYaz ? 'Yeni şablon Ürün ve rotalar\'da "Şablon olarak sakla" ile açılır.' : 'Şablonları düzenleme yetkin yok; liste salt okunur.'}
      </p>
      {liste.length === 0 ? <DurumKutusu durum="bos" mesaj="Şablon yok." /> : (
        <ul className="tc-rs-liste" aria-label="Rota şablonları">
          {liste.map((s) => <SablonSatiri key={s.id} s={s} yazabilir={o.yetki.sablonYaz} duzenle={() => { setDuzenlenen(s.id); }} />)}
        </ul>
      )}
      {secili && <DuzenlePenceresi key={secili.id} s={secili} kapat={() => { setDuzenlenen(null); }} />}
    </div>
  );
}
