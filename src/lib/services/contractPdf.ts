/**
 * @fileoverview Contract PDF Generation Service
 *
 * This module provides client-side PDF generation for contractor agreements
 * and work orders using jsPDF. PDFs are generated in-browser and can be
 * uploaded to Supabase Storage or downloaded directly.
 *
 * @module services/contractPdf
 *
 * Document Types:
 * - Contractor Agreement: Full legal contract with terms and conditions
 * - Work Order: Simple task-based work order (shorter format)
 *
 * Features:
 * - Professional styling with brand colors
 * - Automatic page breaks
 * - Signature blocks for both parties
 * - Currency and date formatting
 *
 * @example
 * ```typescript
 * import { generateContractorAgreement, downloadPdf } from '$lib/services/contractPdf';
 *
 * const contract = generateContractorAgreement({
 *   contractId: uuid,
 *   contractorName: 'John Doe',
 *   contractorEmail: 'john@example.com',
 *   task,
 *   organization,
 *   assignedBy: currentUser,
 *   createdAt: new Date()
 * });
 *
 * // Download locally
 * downloadPdf(contract);
 *
 * // Or upload to storage
 * await contractsApi.uploadPdf(contractId, contract.pdf, contract.filename);
 * ```
 */

import { jsPDF } from 'jspdf';
import type { Task, Organization, User } from '$lib/types';

/**
 * Input data required for generating contract PDFs.
 */
export interface ContractData {
  contractId: string;
  contractorName: string;
  contractorEmail: string;
  task: Task;
  organization: Organization;
  assignedBy: User;
  createdAt: Date;
}

/**
 * Output from PDF generation functions.
 */
export interface GeneratedContract {
  /** PDF file as a Blob for upload or download */
  pdf: Blob;
  /** Suggested filename with contract ID and contractor name */
  filename: string;
}

/**
 * Generates a professional contractor agreement PDF.
 *
 * Creates a multi-page A4 document with:
 * - Header with contract ID and date
 * - Parties section (Client and Contractor)
 * - Scope of work (task details)
 * - Compensation section
 * - Timeline/deadline
 * - Standard terms and conditions
 * - Signature blocks for both parties
 * - Footer with generation info
 *
 * @param data - Contract data including task, organization, and parties
 * @returns Generated PDF blob and filename
 */
export function generateContractorAgreement(data: ContractData): GeneratedContract {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);
  let y = margin;

  // Helper functions
  const addText = (text: string, fontSize: number, style: 'normal' | 'bold' = 'normal', align: 'left' | 'center' | 'right' = 'left') => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', style);

    const x = align === 'center' ? pageWidth / 2 : align === 'right' ? pageWidth - margin : margin;
    doc.text(text, x, y, { align });
  };

  const addWrappedText = (text: string, fontSize: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', style);
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, y);
    return lines.length * (fontSize * 0.4);
  };

  const addLine = () => {
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  };

  const checkPageBreak = (neededSpace: number) => {
    if (y + neededSpace > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Format date
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // ========== HEADER ==========
  doc.setFillColor(79, 70, 229); // Indigo
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('CONTRACTOR AGREEMENT', pageWidth / 2, 18, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Contract ID: ${data.contractId.slice(0, 8).toUpperCase()}`, pageWidth / 2, 28, { align: 'center' });
  doc.text(`Generated: ${formatDate(data.createdAt)}`, pageWidth / 2, 34, { align: 'center' });

  y = 55;
  doc.setTextColor(0, 0, 0);

  // ========== PARTIES ==========
  addText('PARTIES TO THIS AGREEMENT', 14, 'bold');
  y += 10;

  // Party A (Company)
  doc.setFillColor(249, 250, 251);
  doc.rect(margin, y - 5, contentWidth, 25, 'F');

  addText('PARTY A (Client)', 10, 'bold');
  y += 6;
  addText(`Organization: ${data.organization.name}`, 10);
  y += 5;
  addText(`Representative: ${data.assignedBy.full_name || data.assignedBy.email}`, 10);
  y += 5;
  addText(`Email: ${data.assignedBy.email}`, 10);
  y += 15;

  // Party B (Contractor)
  doc.setFillColor(249, 250, 251);
  doc.rect(margin, y - 5, contentWidth, 20, 'F');

  addText('PARTY B (Contractor)', 10, 'bold');
  y += 6;
  addText(`Name: ${data.contractorName}`, 10);
  y += 5;
  addText(`Email: ${data.contractorEmail}`, 10);
  y += 15;

  addLine();

  // ========== SCOPE OF WORK ==========
  checkPageBreak(60);
  addText('1. SCOPE OF WORK', 12, 'bold');
  y += 8;

  doc.setFillColor(239, 246, 255);
  doc.rect(margin, y - 3, contentWidth, 35, 'F');

  addText('Task Details', 10, 'bold');
  y += 6;
  addText(`Title: ${data.task.title}`, 10);
  y += 5;

  if (data.task.description) {
    const descHeight = addWrappedText(`Description: ${data.task.description}`, 9);
    y += descHeight + 3;
  }

  if (data.task.story_points) {
    addText(`Estimated Effort: ${data.task.story_points} story points`, 10);
    y += 5;
  }
  y += 10;

  // ========== COMPENSATION ==========
  checkPageBreak(40);
  addText('2. COMPENSATION', 12, 'bold');
  y += 8;

  doc.setFillColor(240, 253, 244);
  doc.rect(margin, y - 3, contentWidth, 25, 'F');

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 163, 74); // Green
  doc.text(formatCurrency(data.task.dollar_value), margin + 5, y + 5);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Total Contract Value', margin + 5, y + 12);

  if (data.task.urgency_multiplier && data.task.urgency_multiplier > 1) {
    doc.text(`(Includes ${((data.task.urgency_multiplier - 1) * 100).toFixed(0)}% urgency bonus)`, margin + 5, y + 18);
  }
  y += 30;

  const paymentTerms = `Payment shall be made within 30 days of successful completion and approval of the deliverables.
Payment will be processed through ${data.organization.name}'s standard payment system.`;
  const paymentHeight = addWrappedText(paymentTerms, 10);
  y += paymentHeight + 10;

  // ========== TIMELINE ==========
  checkPageBreak(30);
  addText('3. TIMELINE', 12, 'bold');
  y += 8;

  if (data.task.deadline) {
    doc.setFillColor(254, 249, 195);
    doc.rect(margin, y - 3, contentWidth, 15, 'F');

    addText(`Deadline: ${formatDate(new Date(data.task.deadline))}`, 11, 'bold');
    y += 6;
    addText('Work must be submitted by the deadline specified above.', 9);
    y += 12;
  } else {
    addText('No specific deadline. Work should be completed in a reasonable timeframe.', 10);
    y += 8;
  }
  y += 5;

  // ========== TERMS AND CONDITIONS ==========
  checkPageBreak(80);
  addText('4. TERMS AND CONDITIONS', 12, 'bold');
  y += 8;

  const terms = [
    {
      title: '4.1 Independent Contractor Status',
      content: 'The Contractor is an independent contractor and not an employee of the Client. The Contractor shall be responsible for all taxes, insurance, and other obligations associated with self-employment.'
    },
    {
      title: '4.2 Intellectual Property',
      content: 'All work product, deliverables, and intellectual property created under this agreement shall become the exclusive property of the Client upon payment in full.'
    },
    {
      title: '4.3 Confidentiality',
      content: 'The Contractor agrees to maintain the confidentiality of all proprietary information disclosed during the course of this agreement and shall not disclose such information to any third party.'
    },
    {
      title: '4.4 Quality Standards',
      content: 'All work shall be performed in a professional manner and meet the quality standards specified by the Client. Work may be subject to review and approval before payment is released.'
    },
    {
      title: '4.5 Revisions',
      content: 'The Contractor agrees to make reasonable revisions to the work if it does not meet the specified requirements, at no additional cost to the Client.'
    },
    {
      title: '4.6 Termination',
      content: 'Either party may terminate this agreement with written notice. In the event of termination, the Contractor shall be compensated for work completed up to the date of termination.'
    }
  ];

  for (const term of terms) {
    checkPageBreak(25);
    addText(term.title, 10, 'bold');
    y += 5;
    const height = addWrappedText(term.content, 9);
    y += height + 8;
  }

  // ========== SIGNATURES ==========
  checkPageBreak(70);
  addLine();
  y += 5;
  addText('5. SIGNATURES', 12, 'bold');
  y += 10;

  const sigBlockWidth = (contentWidth - 10) / 2;

  // Party A signature block
  doc.setFillColor(249, 250, 251);
  doc.rect(margin, y, sigBlockWidth, 45, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.rect(margin, y, sigBlockWidth, 45, 'S');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('PARTY A (Client)', margin + 5, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.text(`Name: ${data.assignedBy.full_name || data.assignedBy.email}`, margin + 5, y + 16);
  doc.text(`Organization: ${data.organization.name}`, margin + 5, y + 22);

  doc.setDrawColor(150, 150, 150);
  doc.line(margin + 5, y + 35, margin + sigBlockWidth - 10, y + 35);
  doc.setFontSize(8);
  doc.text('Signature / Date', margin + 5, y + 40);

  // Party B signature block
  const partyBX = margin + sigBlockWidth + 10;
  doc.setFillColor(249, 250, 251);
  doc.rect(partyBX, y, sigBlockWidth, 45, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.rect(partyBX, y, sigBlockWidth, 45, 'S');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('PARTY B (Contractor)', partyBX + 5, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.text(`Name: ${data.contractorName}`, partyBX + 5, y + 16);
  doc.text(`Email: ${data.contractorEmail}`, partyBX + 5, y + 22);

  doc.setDrawColor(150, 150, 150);
  doc.line(partyBX + 5, y + 35, partyBX + sigBlockWidth - 10, y + 35);
  doc.setFontSize(8);
  doc.text('Signature / Date', partyBX + 5, y + 40);

  y += 55;

  // ========== FOOTER ==========
  checkPageBreak(20);
  doc.setFillColor(243, 244, 246);
  doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `This contract was generated by ${data.organization.name} via Orbit Platform`,
    pageWidth / 2,
    pageHeight - 12,
    { align: 'center' }
  );
  doc.text(
    `Contract ID: ${data.contractId} | Generated: ${formatDate(data.createdAt)}`,
    pageWidth / 2,
    pageHeight - 7,
    { align: 'center' }
  );

  // Generate filename and blob
  const filename = `contract-${data.contractId.slice(0, 8)}-${data.contractorName.replace(/\s+/g, '-').toLowerCase()}.pdf`;
  const pdfBlob = doc.output('blob');

  return {
    pdf: pdfBlob,
    filename
  };
}

/**
 * Generates a simple work order PDF.
 *
 * Creates a single-page A4 document with:
 * - Header with work order number
 * - Client and contractor info
 * - Task details box
 * - Compensation and deadline
 *
 * Suitable for quick assignments without full contract terms.
 *
 * @param data - Contract data including task and parties
 * @returns Generated PDF blob and filename
 */
export function generateWorkOrder(data: ContractData): GeneratedContract {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Header
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageWidth, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('WORK ORDER', pageWidth / 2, 15, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`#${data.contractId.slice(0, 8).toUpperCase()}`, pageWidth / 2, 23, { align: 'center' });

  y = 45;
  doc.setTextColor(0, 0, 0);

  // Client & Contractor Info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Client:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.organization.name, margin + 25, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Contractor:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${data.contractorName} (${data.contractorEmail})`, margin + 25, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Date:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(data.createdAt), margin + 25, y);
  y += 15;

  // Task Details Box
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(margin, y, pageWidth - (margin * 2), 50, 3, 3, 'FD');

  y += 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Task Details', margin + 5, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(data.task.title, margin + 5, y);
  y += 7;

  if (data.task.description) {
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(data.task.description, pageWidth - (margin * 2) - 10);
    doc.text(lines.slice(0, 3), margin + 5, y);
    y += lines.slice(0, 3).length * 5;
  }

  y += 20;

  // Compensation
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(margin, y, pageWidth - (margin * 2), 25, 3, 3, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 163, 74);
  doc.text(`Compensation: ${formatCurrency(data.task.dollar_value)}`, margin + 5, y + 10);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  if (data.task.deadline) {
    doc.text(`Due: ${formatDate(new Date(data.task.deadline))}`, margin + 5, y + 18);
  }

  const filename = `work-order-${data.contractId.slice(0, 8)}.pdf`;
  const pdfBlob = doc.output('blob');

  return {
    pdf: pdfBlob,
    filename
  };
}

/**
 * Downloads a generated contract PDF to the user's device.
 * Creates a temporary object URL and triggers browser download.
 *
 * @param contract - Generated contract with PDF blob and filename
 */
export function downloadPdf(contract: GeneratedContract) {
  const url = URL.createObjectURL(contract.pdf);
  const link = document.createElement('a');
  link.href = url;
  link.download = contract.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
