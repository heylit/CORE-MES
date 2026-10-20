// Operatör ekranının örnek iş emirleri (FLN-120 vb.) yalnız tanıtım modunda, örnek istasyonda. Önizleme yalnız önizlenen paketi gösterir:
// örnek işler eklenmez (TMI içinde gerçek paketin altında örnek liste görünüyordu).
export const ORNEK_ISTASYON = 'TZG-04';
export const ornekIslerAcik = (demo: boolean, makine: string, onizleme: boolean): boolean => !onizleme && demo && makine === ORNEK_ISTASYON;
