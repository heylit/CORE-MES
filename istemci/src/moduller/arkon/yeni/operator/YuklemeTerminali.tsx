import { CikisOnayi, DurakBitir, DurakKalemleri, useYukDuraklari, yukKalemAdi, type YukDuragi } from '../../../sevkiyat/disari.ts';
import { useOturum } from '../../../../ortak/veri/oturum.ts';
import { DepoTerminali, type DepoBaglami, type DepoIsi, type DepoMetinleri } from './DepoTerminali.tsx';

// 3389 a: yükleme standart terminal düzeninde; her durak bir iştir. Yüklendi +1 sıradaki kalemin çıkışını onayla yazar (sayı sunucunun
// çıkışıdır); Eksik +1 sıradaki kalemi eksik işaretler, atlar (bu cihazda). Bitir irsaliye no'yu (gerekiyorsa) yazar ve durağı kapatır.
export const YUK_METINLERI: DepoMetinleri = {
  serit: 'Araçtaki duraklar', birim: 'durak', olcu: 'kalem', calisiyor: 'Yükleniyor', sayac: 'Yüklendi', arti: 'Yüklendi +1', yan: 'Eksik', yanArti: 'Eksik +1', basla: 'Yüklemeyi başlat',
  bos: 'Bugün yüklenecek durak yok.',
};

export function yukDepoIsi(d: YukDuragi): DepoIsi {
  return {
    anahtar: `yuk:${String(d.is.id)}`,
    no: `${d.arac} · ${String(d.sira)}/${String(d.durakSayisi)}`,
    ad: d.baslik,
    tur: d.bitti ? 'Yola hazır' : `${String(d.sira)}. durak`,
    hedef: d.toplam,
    sunucuSayisi: d.cikan,
    bitti: d.bitti,
    alanlar: [
      { etiket: 'Araç', deger: d.arac },
      { etiket: 'Durak', deger: `${String(d.sira)} / ${String(d.durakSayisi)}`, mono: true },
      { etiket: 'Varış', deger: d.baslik },
      { etiket: 'Kalem', deger: `${String(d.toplam)} kalem`, mono: true },
      { etiket: 'İrsaliye no', deger: d.irsaliye ? d.is.belgeNo ?? 'yazılmadı' : 'gerekmez', mono: true },
    ],
    adimlar: [
      { t: 'Kalemleri araca yükle', d: d.bekleyen[0] ? `Sıradaki: ${yukKalemAdi(d.bekleyen[0])}` : 'Bütün kalemler çıktı', r: true },
      { t: 'Her kalemin çıkışını yaz', d: 'Yüklendi +1 ya da etiketi okut; yazmadan önce onay', r: true },
      ...(d.irsaliye ? [{ t: 'İrsaliye no gir', d: 'Bitir’de; yazılmadan durak bitmez', r: true }] : []),
    ],
  };
}

export function YuklemeTerminali({ dar }: { dar: boolean }) {
  const v = useYukDuraklari();
  const irsaliyeYazar = (useOturum().data?.islemler ?? []).includes('sevkiyat.is-yaz');
  const duraklar = v.duraklar ?? [];
  const kaynak = (anahtar: string) => duraklar.find((d) => `yuk:${String(d.is.id)}` === anahtar) ?? null;
  const metin = v.plansiz ? { ...YUK_METINLERI, bos: v.plansiz } : YUK_METINLERI;
  const cikisAc = (b: DepoBaglami, d: YukDuragi, i: number) => {
    const k = d.bekleyen[i];
    if (!k) { b.bildir('Kalan kalemler eksik işaretli; Bitir ile durağı kapatın.', 'kotu'); return; }
    b.ac('Çıkış onayı', <CikisOnayi kalem={k} vazgec={b.kapat} yazildi={(m) => { b.kapat(); b.bildir(m); }} />);
  };
  return (
    <DepoTerminali kip="yukle" dar={dar} metin={metin} isler={v.duraklar ? duraklar.map(yukDepoIsi) : null} yukleniyor={v.yukleniyor} hata={v.hata} yenile={v.yenile}
      arti={(b) => { const d = kaynak(b.is.anahtar); if (d) cikisAc(b, d, b.sayim.yan); }}
      yanArti={(b) => {
        const d = kaynak(b.is.anahtar);
        if (!d || b.sayim.yan >= d.bekleyen.length) return;
        b.guncelle({ yan: b.sayim.yan + 1 });
        b.bildir(`${yukKalemAdi(d.bekleyen[b.sayim.yan]!)} eksik işaretlendi.`, 'kotu');
      }}
      bitir={(b) => {
        const d = kaynak(b.is.anahtar);
        if (d) b.ac('Durağı bitir', <DurakBitir durak={d} eksik={b.sayim.yan} irsaliyeYazar={irsaliyeYazar} vazgec={b.kapat} bitti={(m) => { b.bitti(); b.bildir(m); }} />);
      }}
      sekmeler={(b) => {
        const d = kaynak(b.is.anahtar);
        return d ? [{ anahtar: 'kalemler', baslik: `Kalemler (${String(d.toplam)})`, simge: 'box', icerik: (
          <DurakKalemleri durak={d} bildir={(m) => b.bildir(m, 'kotu')}
            cikisAc={(k) => b.ac('Çıkış onayı', <CikisOnayi kalem={k} vazgec={b.kapat} yazildi={(m) => { b.kapat(); b.bildir(m); }} />)} />
        ) }] : [];
      }} />
  );
}
