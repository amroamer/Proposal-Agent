import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  thClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick }: DataTableProps<T>) {
  return (
    <div className="bg-white rounded-lg shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-kpmg-gray-50 text-xs uppercase tracking-wide text-kpmg-gray-500">
            <tr>
              {columns.map(c => (
                <th
                  key={c.key}
                  className={`text-left px-4 py-3 font-medium ${c.thClassName ?? ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-kpmg-gray-100">
            {rows.map(row => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "hover:bg-kpmg-gray-50 cursor-pointer" : "hover:bg-kpmg-gray-50"}
              >
                {columns.map(c => (
                  <td key={c.key} className={`px-4 py-3 ${c.className ?? ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
