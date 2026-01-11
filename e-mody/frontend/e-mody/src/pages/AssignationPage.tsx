// AssignationPage.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import ApiConfig from '@/lib/ApiConfig';
import { FileSpreadsheet, FileText, Users, Clock ,Truck, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

interface Employee {
  nb: number;
  matricule: string;
  prenom: string;
  adresse: string;
  activite: string;
  axe: string;
  heureDepart: string;
}

const API_BASE = ApiConfig.getBaseUrl();
const timeSlots = ['19:00', '20:00', '21:00', '22:00', '23:00','00:00','01:00','02:00','03:00','04:00','05:00','06:00'];

export const AssignationPage: React.FC = () => {
  const [selectedTime, setSelectedTime] = useState('19:00');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const [employeesForSelected, setEmployeesForSelected] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Drag & Drop states
  const [dragged, setDragged] = useState<{ emp: Employee; fromAxe: string } | null>(null);
  const [dropTargetAxe, setDropTargetAxe] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ emp: Employee; fromAxe: string; toAxe: string } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const dateKey = format(selectedDate, 'yyyy-MM-dd');
  const displayDate = format(selectedDate, 'dd/MM/yyyy');

  useEffect(() => {
    const fetchPlanning = async () => {
      setLoading(true);
      setError(null);

      const apiTime = `${selectedTime}:00`;
      try {
        const res = await fetch(
          `${API_BASE}/reports/planning?date=${encodeURIComponent(dateKey)}&heure=${encodeURIComponent(apiTime)}`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API Error ${res.status}: ${text}`);
        }

        const json = await res.json();
        const rows: any[] = Array.isArray(json.data) ? json.data : [];

        const mapped: Employee[] = rows.map((r, idx) => ({
          nb: idx + 1,
          matricule: r.matricule ?? '',
          prenom: r.nom_complet ?? '',
          adresse: r.nom_arret ?? '',
          activite: r.fonction ?? '',
          axe: r.nom_axe ?? 'Sans Axe',
          heureDepart: (r.heure_sortie ?? apiTime).slice(0,5)
        }));

        setEmployeesForSelected(mapped);
      } catch (err: any) {
        console.error(err);
        setError(err?.message ?? 'Erreur lors de la récupération des assignations');
        setEmployeesForSelected([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlanning();
  }, [dateKey, selectedTime]);

  // helpers: regroup by axe
  const axeMap: Record<string, Employee[]> = useMemo(() => {
    return employeesForSelected.reduce((acc, emp) => {
      if (!acc[emp.axe]) acc[emp.axe] = [];
      acc[emp.axe].push(emp);
      return acc;
    }, {} as Record<string, Employee[]>);
  }, [employeesForSelected]);

  const groupedEntries: { axe: string; employees: Employee[]; car: string }[] = useMemo(() => {
    return Object.keys(axeMap).map((axeName, idx) => ({
      axe: axeName,
      employees: axeMap[axeName],
      car: `Voiture N° ${idx + 1}`
    }));
  }, [axeMap]);

  const filteredEmployees = employeesForSelected;

  // ---------- Drag & Drop handlers ----------
  const handleDragStart = (e: React.DragEvent, emp: Employee, fromAxe: string) => {
    try {
      e.dataTransfer.setData('text/plain', emp.matricule || '');
      // optional: custom ghost image could be set here if desired
    } catch (err) {
      // ignore in some browsers
    }
    setDragged({ emp, fromAxe });
  };

  const handleDragEnd = () => {
    setDragged(null);
    setDropTargetAxe(null);
  };

  const handleDragOverAxe = (e: React.DragEvent, axe: string) => {
    e.preventDefault();
    setDropTargetAxe(axe);
  };

  const handleDragLeaveAxe = (_e: React.DragEvent, axe: string) => {
    setDropTargetAxe(prev => (prev === axe ? null : prev));
  };

  const handleDropOnAxe = (e: React.DragEvent, toAxe: string) => {
    e.preventDefault();
    if (!dragged) {
      setDropTargetAxe(null);
      return;
    }

    // if same axe - little feedback and cancel
    if (dragged.fromAxe === toAxe) {
      toast('Déplacé dans le même axe — aucune action.', { icon: 'ℹ️' });
      setDropTargetAxe(null);
      setDragged(null);
      return;
    }

    // open confirmation modal + store pending move
    setPendingMove({ emp: dragged.emp, fromAxe: dragged.fromAxe, toAxe });
    setShowConfirmModal(true);
    setDropTargetAxe(null);
  };

  const confirmMove = () => {
    if (!pendingMove) {
      setShowConfirmModal(false);
      return;
    }

    const { emp, toAxe } = pendingMove;

    setEmployeesForSelected(prev => {
      const newList = prev.map(e => e.matricule === emp.matricule ? { ...e, axe: toAxe } : e);
      return newList.map((e, idx) => ({ ...e, nb: idx + 1 }));
    });

    setShowConfirmModal(false);
    setPendingMove(null);
    setDragged(null);
    toast.success(`${emp.prenom} (${emp.matricule}) déplacé vers ${toAxe}`);
  };

  const cancelMove = () => {
    setShowConfirmModal(false);
    setPendingMove(null);
    setDragged(null);
    toast('Déplacement annulé', { icon: '✖️' });
  };

    const handleGenerateCarTemplate = async () => {
      try {
        // Récupérer les données des employés pour la date et l'heure sélectionnées
        const apiTime = `${selectedTime}:00`;
        const res = await fetch(
          `${API_BASE}/reports/planning?date=${encodeURIComponent(dateKey)}&heure=${encodeURIComponent(apiTime)}`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (!res.ok) {
          throw new Error(`Erreur API ${res.status}`);
        }

        const json = await res.json();
        const rows: any[] = Array.isArray(json.data) ? json.data : [];

        // Compter le nombre d'employés par axe (voiture)
        const employeesByAxe: Record<string, number> = {};
        rows.forEach((r) => {
          const axe = r.nom_axe ?? 'Sans Axe';
          employeesByAxe[axe] = (employeesByAxe[axe] || 0) + 1;
        });

        // create doc
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        const contentWidth = pageWidth - margin * 2;

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text("FICHE DE COMPTAGE DES VOITURE BB", pageWidth / 2, 52, { align: "center" });
        doc.setLineWidth(0.8);
        doc.line(margin, 60, pageWidth - margin, 60);

        // Two rows x two columns layout
        const boxY = 80;
        const boxH = 46;
        const gapX = 16; // gap between left & right column
        const gapY = 12; // gap between top & bottom row

        // compute equal column widths
        const colWidth = Math.round((contentWidth - gapX) / 2);

        // positions
        const leftX = margin;
        const rightX = margin + colWidth + gapX;
        const topY = boxY;
        const bottomY = boxY + boxH + gapY;

        // Fonts
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");

        // --- Top-left box: Date ---
        doc.rect(leftX, topY, colWidth, boxH);
        doc.setFont("helvetica", "bold");
        doc.text("Date :", leftX + 8, topY + 14);
        doc.setFont("helvetica", "normal");
        doc.text(displayDate ?? format(new Date(), "dd/MM/yyyy"), leftX + 8, topY + 32);

        // --- Top-right box: Prénom & Matricule ---
        doc.rect(rightX, topY, colWidth, boxH);
        doc.setFont("helvetica", "bold");
        doc.text("Prénom et Matricule :", rightX + 8, topY + 14);
        doc.setFont("helvetica", "normal");
        // underline for writing
        doc.text("____________________________________________", rightX + 8, topY + 32);

        // --- Bottom-left box: Horaire ---
        doc.rect(leftX, bottomY, colWidth, boxH);
        doc.setFont("helvetica", "bold");
        doc.text("Horaire :", leftX + 8, bottomY + 14);
        doc.setFont("helvetica", "normal");
        doc.text(`${selectedTime}:00`, leftX + 8, bottomY + 32);

        // --- Bottom-right box: Contact ---
        doc.rect(rightX, bottomY, colWidth, boxH);
        doc.setFont("helvetica", "bold");
        doc.text("Contact :", rightX + 8, bottomY + 14);
        doc.setFont("helvetica", "normal");
        doc.text("______________________________", rightX + 8, bottomY + 32);

        // decorative horizontal separation
        doc.setDrawColor(200);
        doc.setLineWidth(0.5);
        doc.line(margin, bottomY + boxH + 8, pageWidth - margin, bottomY + boxH + 8);

        // TABLE
        const tableStartY = bottomY + boxH + 26;
        
        // Préparer les données du tableau avec le nombre réel de passagers par voiture
        const axes = Object.keys(employeesByAxe);
        const body = [
          ["Van 01", axes[0] ? employeesByAxe[axes[0]].toString() : "0", ""],
          ["Van 02", axes[1] ? employeesByAxe[axes[1]].toString() : "0", ""],
          ["Van 03", axes[2] ? employeesByAxe[axes[2]].toString() : "0", ""],
          ["Van 04", axes[3] ? employeesByAxe[axes[3]].toString() : "0", ""],
          ["Van 05", axes[4] ? employeesByAxe[axes[4]].toString() : "0", ""]
        ];

        // Si plus de 5 axes, ajouter les voitures supplémentaires
        for (let i = 5; i < axes.length; i++) {
          if (i >= 10) break; // Limiter à 10 voitures maximum
          body.push([`Van ${String(i + 1).padStart(2, '0')}`, employeesByAxe[axes[i]].toString(), ""]);
        }

        const head = [["Nb Van", "Nb passagers", "Remarques"]];

        // dynamically import autoTable
        const { default: autoTable } = await import("jspdf-autotable");

        // table options: keep it centered and aligned with page margins
        const tableOptions = {
          startY: tableStartY,
          head,
          body,
          theme: "grid" as const,
          styles: {
            font: "helvetica",
            fontSize: 11,
            cellPadding: 8,
            overflow: "ellipsize" as const
          },
          headStyles: {
            fillColor: [240, 240, 240],
            textColor: 30,
            fontStyle: "bold"
          },
          columnStyles: {
            0: { cellWidth: 120, halign: "left" },
            1: { cellWidth: 120, halign: "center" },
            2: { cellWidth: contentWidth - 120 - 120 - 10, halign: "center" }
          },
          tableWidth: contentWidth,
          margin: { left: margin, right: margin },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.row.index % 2 === 0) {
              data.cell.styles.fillColor = [250, 250, 250];
            }
          }
        };

        const atResult: any = autoTable(doc as any, tableOptions as any);
        const lastTable = atResult ?? (doc as any).lastAutoTable;
        const finalY = (lastTable && typeof lastTable.finalY === "number") ? lastTable.finalY + 16 : tableStartY + 140;

        // TOTALS (left label + right aligned label)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        const totalsLeftX = margin + 6;
        
        // Calculer le total réel des voitures utilisées
        const totalVoitures = Math.min(axes.length, 10); // Maximum 10 voitures affichées
        const totalPassagers = Object.values(employeesByAxe).reduce((sum, count) => sum + count, 0);
        
        doc.text("TOTAL FICHE RETOURNE :", totalsLeftX, finalY + 16);
        doc.text(totalVoitures.toString().padStart(2, '0'), totalsLeftX + 200, finalY + 16);

        const totalsRightLabel = "TOTAL FICHE NON RETOURNE :";
        doc.text(totalsRightLabel, pageWidth - margin - 6, finalY + 16, { align: "right" });

        // Ajouter le total des passagers
        doc.text(`TOTAL PASSAGERS : ${totalPassagers}`, totalsLeftX, finalY + 32);

        // NB NOTE
        const noteY = finalY + 50;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const note = "NB: fiche à remplir pour chaque shift, document à remettre au SG le lendemain à 9h00 avec les fiches d'émargement.";
        const noteLines = doc.splitTextToSize(note, contentWidth);
        doc.text(noteLines, margin, noteY);

        // commentaire box
        const commentY = noteY + noteLines.length * 12 + 14;
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("commentaire :", margin, commentY);
        const commentBoxH = 110;
        doc.rect(margin, commentY + 6, contentWidth, commentBoxH);

        // footer
        doc.setFontSize(8);
        doc.setTextColor(120);
        const footer = `Généré le ${new Date().toLocaleString()} - ${totalVoitures} voitures - ${totalPassagers} passagers`;
        doc.text(footer, margin, pageHeight - 30);

        // save
        doc.save("FICHE_DE_COMPTAGE_VOITURE_BB.pdf");
        
        toast.success(`PDF généré avec ${totalVoitures} voitures et ${totalPassagers} passagers`);
      } catch (err) {
        console.error("Erreur génération PDF :", err);
        toast.error("Erreur lors de la génération du PDF");
      }
    };

  

  const handleExportPDF = async () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const { default: autoTable } = await import('jspdf-autotable');

      const rowsPerHalf = 13;
      const blankRowsPerHalf = 5;

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const sideMargin = 14;
      const headerHeight = 30;
      const halfHeight = (pageHeight - 20) / 2;

      let globalPageCounter = 0;

      const drawHalfHeader = (doc: any, yOffset: number, displayDate: string, selectedTime: string, car: string, axe: string) => {
        doc.setFillColor(240, 240, 240);
        doc.rect(0, yOffset, pageWidth, 20, 'F');

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 128);
        doc.text('LISTE DU PERSONNEL', pageWidth / 2, yOffset + 12, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        doc.text(`Date: ${displayDate}`, sideMargin, yOffset + 18);
        doc.text(`Heure: ${selectedTime}`, pageWidth / 2, yOffset + 18, { align: 'center' });
        doc.text(`Véhicule: ${car}`, pageWidth - sideMargin, yOffset + 18, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.text(`Axe: ${axe}`, pageWidth / 2, yOffset + 25, { align: 'center' });
      };

      const renderHalfTable = (doc: any, yOffset: number, employeesForHalf: Employee[]) => {
        const tableData = employeesForHalf.map(emp => [
          emp.nb?.toString() ?? '',
          emp.matricule ?? '',
          emp.prenom ?? '',
          emp.adresse ?? '',
          emp.activite ?? '',
          ''
        ]);

        const res = autoTable(doc, {
          startY: yOffset + headerHeight - 2,
          head: [['Nb', 'MATRICULE', 'PRÉNOM', 'ARRET/ADRESSE', 'FONCTION', 'SIGNATURE']],
          body: tableData,
          theme: 'grid',
          styles: {
            fontSize: 8,
            cellPadding: 3,
            lineColor: [100, 100, 100],
            lineWidth: 0.1,
            textColor: [40, 40, 40],
            cellWidth: 'wrap'
          },
          headStyles: {
            fillColor: [70, 130, 180],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            lineWidth: 0.1,
            fontSize: 9
          },
          columnStyles: {
            0: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 25, halign: 'center' },
            2: { cellWidth: 35, halign: 'left' },
            3: { cellWidth: 45, halign: 'left' },
            4: { cellWidth: 35, halign: 'left' },
            5: { cellWidth: 30, halign: 'center' }
          },
          margin: { top: yOffset + headerHeight - 2, right: sideMargin, bottom: 10, left: sideMargin },
          tableWidth: pageWidth - sideMargin * 2,
          pageBreak: 'auto',
          rowPageBreak: 'avoid'
        });

        return res;
      };

      groupedEntries.forEach(({ axe, employees, car }) => {
        const allEmps = Array.isArray(employees) ? employees : [];
        const pagesNeeded = Math.max(1, Math.ceil(allEmps.length / rowsPerHalf));

        for (let p = 0; p < pagesNeeded; p++) {
          if (!(globalPageCounter === 0 && p === 0)) doc.addPage();
          globalPageCounter++;

          const pageSlice = allEmps.slice(p * rowsPerHalf, (p + 1) * rowsPerHalf);
          const topEmps = pageSlice;

          const fillBlanks = (arr: Employee[], targetCount: number) => {
            const filled = [...arr];
            const present = filled.length;
            const blanksToAdd = Math.min(Math.max(0, targetCount - present), blankRowsPerHalf);
            for (let i = 0; i < blanksToAdd; i++) {
              filled.push({ nb: '', matricule: '', prenom: '', adresse: '', activite: '', axe: '', heureDepart: '' } as unknown as Employee);
            }
            return filled;
          };

          const topForRender = fillBlanks(topEmps, rowsPerHalf);
          const bottomForRender = [...topForRender];

          const topYOffset = 10;
          drawHalfHeader(doc, topYOffset, displayDate, selectedTime, car, axe);
          renderHalfTable(doc, topYOffset, topForRender);

          const bottomYOffset = topYOffset + halfHeight;
          drawHalfHeader(doc, bottomYOffset, displayDate, selectedTime, car, axe);
          renderHalfTable(doc, bottomYOffset, bottomForRender);

          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text(
            `Page ${globalPageCounter} sur ${pagesNeeded * groupedEntries.length} - Généré le ${new Date().toLocaleDateString()}`,
            pageWidth / 2,
            pageHeight - 8,
            { align: 'center' }
          );
          doc.setDrawColor(200, 200, 200);
          doc.line(sideMargin, pageHeight - 12, pageWidth - sideMargin, pageHeight - 12);
        }
      });

      const safeTime = selectedTime.replace(/:/g, 'h');
      const fileName = `Planning_${safeTime}_${displayDate.replace(/\//g, '-')}.pdf`;
      doc.save(fileName);
      toast.success('Export PDF réussi — 2 exemplaires identiques par page');
    } catch (e) {
      console.error('Export PDF error:', e);
      toast.error('Erreur lors de l\'export PDF');
    }
  };

  const handleExportEmptyPDF = async () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const { default: autoTable } = await import('jspdf-autotable');

      // Réduire le nombre de lignes pour éviter le débordement
      const rowsPerHalf = 12; // Réduit de 13 à 10

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const sideMargin = 14;
      const headerHeight = 30;
      const halfHeight = (pageHeight - 20) / 2;

      let globalPageCounter = 0;

      const drawHalfHeader = (doc: any, yOffset: number, displayDate: string, selectedTime: string, car: string, suffixTitle = '') => {
        doc.setFillColor(240, 240, 240);
        doc.rect(0, yOffset, pageWidth, 20, 'F');

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 128);
        const title = `LISTE PERSONNEL NON ASSIGNÉ${suffixTitle ? ' - ' + suffixTitle : ''}`;
        doc.text(title, pageWidth / 2, yOffset + 12, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        doc.text(`Date: ${displayDate}`, sideMargin, yOffset + 18);
        doc.text(`Heure: ${selectedTime}`, pageWidth / 2, yOffset + 18, { align: 'center' });
        doc.text(`Véhicule: ${car}`, pageWidth - sideMargin, yOffset + 18, { align: 'right' });
      };

      const renderEmptyHalfTable = (doc: any, yOffset: number, rowsCount: number) => {
        const emptyRowData = Array.from({ length: rowsCount }, () => ['', '', '', '', '', '']);

        // Ajouter des options pour mieux contrôler la hauteur
        const res = autoTable(doc, {
          startY: yOffset + headerHeight - 2,
          head: [['Nb', 'MATRICULE', 'PRÉNOM', 'ARRET/ADRESSE', 'FONCTION', 'SIGNATURE']],
          body: emptyRowData,
          theme: 'grid',
          styles: {
            fontSize: 8,
            cellPadding: 2, // Réduit le padding
            lineColor: [100, 100, 100],
            lineWidth: 0.1,
            textColor: [40, 40, 40],
            cellWidth: 'wrap',
            minCellHeight: 6, // Hauteur minimale des cellules
          },
          headStyles: {
            fillColor: [70, 130, 180],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            lineWidth: 0.1,
            fontSize: 9,
            cellPadding: 2, // Réduit le padding pour l'en-tête aussi
          },
          bodyStyles: {
            minCellHeight: 6, // Hauteur minimale pour le corps
          },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' }, // Réduit pour faire de la place
            1: { cellWidth: 35, halign: 'center' }, // Réduit pour faire de la place
            2: { cellWidth: 35, halign: 'left' },   // AUGMENTÉ pour le prénom (était 30)
            3: { cellWidth: 35, halign: 'left' },   // Réduit pour faire de la place (était 40)
            4: { cellWidth: 25, halign: 'left' },   // Réduit pour faire de la place (était 30)
            5: { cellWidth: 45, halign: 'center' }  // AUGMENTÉ pour la signature (était 25)
          },
          margin: { 
            top: yOffset + headerHeight - 2, 
            right: sideMargin, 
            bottom: 5, // Réduit la marge inférieure
            left: sideMargin 
          },
          tableWidth: pageWidth - sideMargin * 2,
          pageBreak: 'avoid', // Éviter les sauts de page dans les demi-tableaux
          rowPageBreak: 'avoid',
          // Désactiver le calcul automatique de hauteur problématique
          didDrawPage: () => {},
          willDrawCell: () => {},
          didDrawCell: () => {}
        });

        return res;
      };

      // Si groupedEntries vide, on fournira des axes vides par défaut
      const emptyAxes = [
        { axe: '', car: 'Voiture N° 1' },
        { axe: '', car: 'Voiture N° 2' },
        { axe: '', car: 'Voiture N° 3' },
        { axe: '', car: 'Voiture N° 4' },
        { axe: '', car: 'Voiture N° 5' },
        { axe: '', car: 'Voiture N° 6' },
        { axe: '', car: 'Voiture N° 7' },
        { axe: '', car: 'Voiture N° 8' },
        { axe: '', car: 'Voiture N° 9' },
        { axe: '', car: 'Voiture N° 10' }
      ];
      
      const axesToUse = groupedEntries.length > 0 
        ? groupedEntries.map(g => ({ axe: '', car: g.car ?? '' }))
        : emptyAxes;

      // DUPLICATION: Créer 2 copies de chaque fiche pour chaque véhicule
      const duplicatedAxes = [];
      for (const axis of axesToUse) {
        duplicatedAxes.push(axis);
        duplicatedAxes.push({...axis});
      }

      // Limiter le nombre d'axes pour éviter trop de pages
      const limitedAxes = duplicatedAxes.slice(0, 8); // Maximum 8 fiches (4 véhicules × 2)

      limitedAxes.forEach(({ axe, car }, axisIndex) => {
        if (!(globalPageCounter === 0 && axisIndex === 0)) doc.addPage();
        globalPageCounter++;

        const topYOffset = 10;
        drawHalfHeader(doc, topYOffset, displayDate, selectedTime, car ?? '', 'FICHE VIDE');
        renderEmptyHalfTable(doc, topYOffset, rowsPerHalf);

        const bottomYOffset = topYOffset + halfHeight;
        drawHalfHeader(doc, bottomYOffset, displayDate, selectedTime, car ?? '', 'FICHE VIDE');
        renderEmptyHalfTable(doc, bottomYOffset, rowsPerHalf);

        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(
          `Page ${globalPageCounter} - Fiche Vide - Généré le ${new Date().toLocaleDateString()}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        );
        doc.setDrawColor(200, 200, 200);
        doc.line(sideMargin, pageHeight - 12, pageWidth - sideMargin, pageHeight - 12);
      });

      const safeTime = selectedTime.replace(/:/g, 'h');
      const fileName = `Fiche_Vide_Complete_${safeTime}_${displayDate.replace(/\//g, '-')}.pdf`;
      doc.save(fileName);
      toast.success('Fiche PDF vide complète générée avec succès (toutes colonnes vides)');
    } catch (e) {
      console.error('Export PDF vide error:', e);
      toast.error('Erreur lors de la génération de la fiche vide');
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Assignation Employés aux Axes</h1>
        <p className="text-muted-foreground">Visualisation des employés planifiés par arrêt et axe</p>
        {/* Small hint for drag & drop */}
        <div className="mt-2 text-sm text-muted-foreground">Astuce: glisser-déposer une ligne d'un axe vers un autre pour proposer un déplacement (confirmation requise).</div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarIcon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{displayDate}</div>
                <div className="text-sm text-muted-foreground">Date</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-warning" />
              </div>
              <div>
                <div className="text-2xl font-bold">{selectedTime}:00</div>
                <div className="text-sm text-muted-foreground">Heure de sortie</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-success" />
              </div>
              <div>
                <div className="text-2xl font-bold">{filteredEmployees.length}</div>
                <div className="text-sm text-muted-foreground">Employés</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{groupedEntries.length}</div>
                <div className="text-sm text-muted-foreground">Voitures (Axes)</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <Card className="border-2 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Filtre et Export
            </CardTitle>
            <div className="flex gap-2">
              {/* Bouton statique : Générer template cars */}
              <Button
                onClick={handleGenerateCarTemplate}
                className="gap-2 bg-success hover:bg-success/90"
                title="Télécharger un template CSV pour les véhicules"
              >
                <Truck className="h-4 w-4" />
                Générer Fiche de Comptage
              </Button>
              
              <Button onClick={handleExportPDF} className="gap-2 bg-destructive hover:bg-destructive/90" disabled={filteredEmployees.length === 0}>
                <FileText className="h-4 w-4" />
                Export PDF
              </Button>

              {/* Dans la section des boutons d'export, ajoutez ce bouton */}
              <Button 
                onClick={handleExportEmptyPDF} 
                className="gap-2 bg-orange-500 hover:bg-orange-600"
                title="Générer une fiche PDF vide avec la structure mais sans données"
              >
                <FileText className="h-4 w-4" />
                Fiche Vide PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Date Picker */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-11",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : <span>Sélectionner une date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Heure de sortie</label>
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger className="h-11 text-base font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map(time => (
                    <SelectItem key={time} value={time} className="text-base">
                      {time}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading/Error */}
      {loading && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">Chargement des assignations...</CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="p-6 text-center text-red-600">Erreur : {error}</CardContent>
        </Card>
      )}

      {/* Grouped Tables by Axe with Car name */}
      {groupedEntries.map(({ axe, employees, car }) => {
        const isDropTarget = dropTargetAxe === axe;
        return (
          <Card
            key={`${car}-${axe}`}
            className={cn(
              "overflow-hidden border-2 shadow-lg transition-shadow duration-150",
              isDropTarget ? "ring-4 ring-dashed ring-primary/50 animate-pulse" : ""
            )}
            onDragOver={(e) => handleDragOverAxe(e, axe)}
            onDragEnter={(e) => handleDragOverAxe(e, axe)}
            onDragLeave={(e) => handleDragLeaveAxe(e, axe)}
            onDrop={(e) => handleDropOnAxe(e, axe)}
          >
            <CardHeader className="bg-gradient-to-r from-primary via-primary/90 to-primary/80 text-primary-foreground">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl font-bold flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                    <Users className="h-6 w-6" />
                  </div>
                  {car} — {axe}
                </CardTitle>
                <div className="text-sm bg-white/20 px-4 py-2 rounded-lg font-medium">
                  {employees.length} employé{employees.length > 1 ? 's' : ''}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[60px] font-bold text-center">Nb</TableHead>
                      <TableHead className="w-[120px] font-bold">MATRICULES</TableHead>
                      <TableHead className="min-w-[250px] font-bold">PRENOMS</TableHead>
                      <TableHead className="min-w-[250px] font-bold">ARRET (Adresse)</TableHead>
                      <TableHead className="min-w-[200px] font-bold">FONCTION</TableHead>
                      <TableHead className="w-[150px] font-bold text-center">SIGNATURE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((emp, index) => {
                      const isDragging = dragged?.emp?.matricule === emp.matricule;
                      return (
                        <TableRow
                          key={`${axe}-${emp.matricule}-${index}`}
                          className={cn(
                            index % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                            "cursor-grab",
                            isDragging ? 'opacity-70 scale-98 transform transition-transform' : '',
                          )}
                          draggable
                          onDragStart={(e) => handleDragStart(e, emp, axe)}
                          onDragEnd={handleDragEnd}
                          aria-grabbed={isDragging}
                        >
                          <TableCell className="font-bold text-center text-base">{emp.nb}</TableCell>
                          <TableCell className="font-mono font-medium">{emp.matricule}</TableCell>
                          <TableCell className="font-medium">{emp.prenom}</TableCell>
                          <TableCell>{emp.adresse}</TableCell>
                          <TableCell className="font-medium text-primary">{emp.activite}</TableCell>
                          <TableCell className="text-center text-muted-foreground">-</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {filteredEmployees.length === 0 && !loading && !error && (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Aucune assignation pour cette heure</p>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && pendingMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={cancelMove} />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Confirmer le déplacement</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Voulez-vous réellement déplacer <strong>{pendingMove.emp.prenom}</strong> ({pendingMove.emp.matricule})<br />
              de <strong>{pendingMove.fromAxe}</strong> vers <strong>{pendingMove.toAxe}</strong> ?
            </p>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={cancelMove}>Annuler</Button>
              <Button onClick={confirmMove} className="bg-primary">Confirmer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignationPage;
