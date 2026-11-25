import { gelisGunu } from '../merkez/kimlik.ts';
import type { PurchaseRequest } from '../merkez/tipler.ts';
import { dayDiff, fmtDate, nf0 } from '../merkez/util.ts';

// 3710: talebin açıldığı gün ve kaç gün önce; satın alma talep listelerinde aynı hücre. Kayıt zamanı yoksa "–" (uydurulmaz).
export function TalepTarihi({ r, bugun }: { r: Pick<PurchaseRequest, 'createdAt'>; bugun: string }) {
  const g = gelisGunu(r);
  if (!g) return <>–</>;
  const once = dayDiff(g, bugun);
  return <span className="sa-ekran-govde"><span>{fmtDate(g)}</span><small>{once === 0 ? 'bugün' : `${nf0.format(once)} gün önce`}</small></span>;
}
