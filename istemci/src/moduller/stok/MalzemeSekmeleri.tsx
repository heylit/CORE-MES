import { useNavigate } from 'react-router-dom';
import { Sekmeler, type Sekme } from '../../ortak/arayuz/index.ts';

// 2896: Malzemeler ve türe göre listeler (2099-6 a) tek sayfanın sekmeleridir. Yollar Malzemeler'in altında durur ki ikinci
// menüde Malzemeler maddesi dördünde de etkin görünsün.
export type MalzemeSekmesi = 'malzemeler' | 'kimyasallar' | 'kesici-takimlar' | 'aparatlar';
export const MALZEME_SEKME_YOLLARI: Record<MalzemeSekmesi, string> = {
  malzemeler: '/stok/malzemeler',
  kimyasallar: '/stok/malzemeler/kimyasallar',
  'kesici-takimlar': '/stok/malzemeler/kesici-takimlar',
  aparatlar: '/stok/malzemeler/aparatlar',
};
const SEKMELER: readonly Sekme<MalzemeSekmesi>[] = [
  { anahtar: 'malzemeler', baslik: 'Malzemeler', simge: 'layers' },
  { anahtar: 'kimyasallar', baslik: 'Kimyasallar', simge: 'drop' },
  { anahtar: 'kesici-takimlar', baslik: 'Kesici takımlar', simge: 'tool' },
  { anahtar: 'aparatlar', baslik: 'Aparatlar', simge: 'cube' },
];

// Sekme değişince arama metni yeni sekmeye taşınır, sıfırlanmaz. Durum süzgeçleri sekmeye özgüdür, taşınmaz.
export function MalzemeSekmeleri({ secili, metin = '' }: { secili: MalzemeSekmesi; metin?: string }) {
  const yonlendir = useNavigate();
  const git = (s: MalzemeSekmesi) => {
    const m = metin.trim();
    void yonlendir(MALZEME_SEKME_YOLLARI[s] + (m ? `?metin=${encodeURIComponent(m)}` : ''));
  };
  return (
    <div className="tc-stok-sekmeler-sar">
      <Sekmeler etiket="Malzeme türü" sekmeler={SEKMELER} secili={secili} sec={(s) => { if (s !== secili) git(s); }} />
    </div>
  );
}
