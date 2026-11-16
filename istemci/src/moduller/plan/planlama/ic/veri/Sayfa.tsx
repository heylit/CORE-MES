import { useSearchParams } from 'react-router-dom';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import { gecmisBolumuOku, type GecmisBolumu } from '../gecmis/kurallar.ts';
import { VeriVeKisitlar } from './index.tsx';
import { bolumOku, type VeriBolumu } from './kurallar.ts';

// 3308: Veri, Planlama'nın ikinci menüsünde ayrı sayfadır (Motor'un içindeki ekran değil). On veri bölümü ve geçmişin iki bölümü
// (değişiklik defteri, değişiklik izi) tek bölüm şeridindedir; bölüm adresin sorgusundadır (`veri?bolum=kisitlar`).
export function VeriSayfasi(o: PlanlamaEkranOzellikleri) {
  const [q, qYaz] = useSearchParams();
  const b = q.get('bolum');
  const gecmis = gecmisBolumuOku(b); const veri = bolumOku(b);
  const sec = (x: VeriBolumu | GecmisBolumu) => { qYaz({ bolum: x }, { replace: true }); };
  return <VeriVeKisitlar {...o} bolum={veri ?? undefined} bolumSec={sec} gecmis={gecmis} gecmisSec={sec} />;
}
