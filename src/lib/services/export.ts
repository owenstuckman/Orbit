/**
 * Export service for generating CSV and PDF downloads
 */

// ============================================================================
// CSV Export
// ============================================================================

interface CSVOptions {
  filename: string;
  headers?: string[];
  includeHeaders?: boolean;
}

/**
 * Convert an array of objects to CSV format and trigger download
 */
export function exportToCSV<T extends object>(
  data: T[],
  options: CSVOptions
): void {
  if (data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const { filename, headers, includeHeaders = true } = options;

  // Get headers from first object if not provided
  const columnHeaders = headers || Object.keys(data[0]);

  // Build CSV content
  const rows: string[] = [];

  // Add header row
  if (includeHeaders) {
    rows.push(columnHeaders.map(h => escapeCSVValue(formatHeader(h))).join(','));
  }

  // Add data rows
  for (const item of data) {
    const row = columnHeaders.map(header => {
      const value = (item as Record<string, unknown>)[header];
      return escapeCSVValue(formatValue(value));
    });
    rows.push(row.join(','));
  }

  const csvContent = rows.join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

/**
 * Escape special characters for CSV
 */
function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format header names for display (camelCase to Title Case)
 */
function formatHeader(header: string): string {
  return header
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Format value for CSV output
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

// ============================================================================
// PDF Export (using browser print)
// ============================================================================

interface PDFOptions {
  title: string;
  subtitle?: string;
  orientation?: 'portrait' | 'landscape';
}

/**
 * Generate a printable HTML document and open print dialog
 */
export function exportToPDF<T extends object>(
  data: T[],
  columns: { key: string; label: string; format?: (value: unknown) => string }[],
  options: PDFOptions
): void {
  const { title, subtitle, orientation = 'portrait' } = options;

  // Build HTML table
  const tableRows = data.map(item => {
    const cells = columns.map(col => {
      const value = (item as Record<string, unknown>)[col.key];
      const formatted = col.format ? col.format(value) : formatValue(value);
      return `<td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${formatted}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  });

  const headerCells = columns.map(col =>
    `<th style="padding: 10px 12px; text-align: left; font-weight: 600; background: #f8fafc; border-bottom: 2px solid #e2e8f0;">${col.label}</th>`
  );

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @media print {
          @page {
            size: ${orientation};
            margin: 1cm;
          }
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          color: #1e293b;
          line-height: 1.5;
          padding: 20px;
        }
        h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 4px 0;
        }
        .subtitle {
          color: #64748b;
          font-size: 14px;
          margin-bottom: 20px;
        }
        .meta {
          font-size: 12px;
          color: #94a3b8;
          margin-bottom: 16px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        thead {
          background: #f8fafc;
        }
        tbody tr:hover {
          background: #f8fafc;
        }
        .footer {
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
          font-size: 12px;
          color: #94a3b8;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
      <p class="meta">Generated on ${new Date().toLocaleString()} | ${data.length} records</p>

      <table>
        <thead>
          <tr>${headerCells.join('')}</tr>
        </thead>
        <tbody>
          ${tableRows.join('')}
        </tbody>
      </table>

      <div class="footer">
        Generated by Orbit | ${new Date().toLocaleDateString()}
      </div>
    </body>
    </html>
  `;

  // Open new window and print
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

// ============================================================================
// JSON Export
// ============================================================================

export function exportToJSON<T>(data: T[], filename: string): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  downloadBlob(blob, `${filename}.json`);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Trigger a blob download
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Specific Export Functions
// ============================================================================

export interface TaskExport {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  project: string;
  base_value: number;
  created_at: string;
  completed_at?: string;
}

export function exportTasks(tasks: TaskExport[], format: 'csv' | 'pdf'): void {
  if (format === 'csv') {
    exportToCSV(tasks, {
      filename: `tasks-export-${new Date().toISOString().split('T')[0]}`,
      headers: ['id', 'title', 'status', 'priority', 'assignee', 'project', 'base_value', 'created_at', 'completed_at']
    });
  } else {
    exportToPDF(tasks, [
      { key: 'title', label: 'Title' },
      { key: 'status', label: 'Status' },
      { key: 'priority', label: 'Priority' },
      { key: 'assignee', label: 'Assignee' },
      { key: 'base_value', label: 'Value', format: (v) => `$${(v as number)?.toFixed(2) || '0.00'}` },
      { key: 'created_at', label: 'Created', format: (v) => new Date(v as string).toLocaleDateString() }
    ], {
      title: 'Tasks Export',
      subtitle: `Exported on ${new Date().toLocaleDateString()}`
    });
  }
}

export interface PayoutExport {
  id: string;
  user_name: string;
  amount: number;
  type: string;
  status: string;
  created_at: string;
  paid_at?: string;
}

export function exportPayouts(payouts: PayoutExport[], format: 'csv' | 'pdf'): void {
  if (format === 'csv') {
    exportToCSV(payouts, {
      filename: `payouts-export-${new Date().toISOString().split('T')[0]}`,
      headers: ['id', 'user_name', 'amount', 'type', 'status', 'created_at', 'paid_at']
    });
  } else {
    exportToPDF(payouts, [
      { key: 'user_name', label: 'User' },
      { key: 'amount', label: 'Amount', format: (v) => `$${(v as number)?.toFixed(2) || '0.00'}` },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Date', format: (v) => new Date(v as string).toLocaleDateString() }
    ], {
      title: 'Payouts Export',
      subtitle: `Exported on ${new Date().toLocaleDateString()}`
    });
  }
}

export interface UserExport {
  id: string;
  full_name: string;
  email: string;
  role: string;
  level: number;
  created_at: string;
}

export function exportUsers(users: UserExport[], format: 'csv' | 'pdf'): void {
  if (format === 'csv') {
    exportToCSV(users, {
      filename: `users-export-${new Date().toISOString().split('T')[0]}`,
      headers: ['id', 'full_name', 'email', 'role', 'level', 'created_at']
    });
  } else {
    exportToPDF(users, [
      { key: 'full_name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role' },
      { key: 'level', label: 'Level' },
      { key: 'created_at', label: 'Joined', format: (v) => new Date(v as string).toLocaleDateString() }
    ], {
      title: 'Users Export',
      subtitle: `Exported on ${new Date().toLocaleDateString()}`
    });
  }
}

export interface ProjectExport {
  id: string;
  name: string;
  status: string;
  total_value: number;
  pm_name: string;
  sales_name: string;
  created_at: string;
  deadline?: string;
}

export function exportProjects(projects: ProjectExport[], format: 'csv' | 'pdf'): void {
  if (format === 'csv') {
    exportToCSV(projects, {
      filename: `projects-export-${new Date().toISOString().split('T')[0]}`,
      headers: ['id', 'name', 'status', 'total_value', 'pm_name', 'sales_name', 'created_at', 'deadline']
    });
  } else {
    exportToPDF(projects, [
      { key: 'name', label: 'Project' },
      { key: 'status', label: 'Status' },
      { key: 'total_value', label: 'Value', format: (v) => `$${(v as number)?.toLocaleString() || '0'}` },
      { key: 'pm_name', label: 'PM' },
      { key: 'deadline', label: 'Deadline', format: (v) => v ? new Date(v as string).toLocaleDateString() : '-' }
    ], {
      title: 'Projects Export',
      subtitle: `Exported on ${new Date().toLocaleDateString()}`,
      orientation: 'landscape'
    });
  }
}
