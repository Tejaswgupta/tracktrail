"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import EditableCounterpartyName from "./EditableCounterpartyName";

export type CaseTransactionRow = {
  id: string;
  entityName: string;
  accountLabel: string;
  dateLabel: string;
  description: string;
  amountLabel: string;
  amountValue: number;
  directionLabel: "Debit" | "Credit";
  counterparty: string;
  status: "Success" | "Failed";
  onCounterpartySave: (newName: string) => Promise<void> | void;
};

interface CaseTransactionsDataTableProps {
  data: CaseTransactionRow[];
}

export default function CaseTransactionsDataTable({
  data,
}: CaseTransactionsDataTableProps) {
  const [rowSelection, setRowSelection] = useState({});
  const [sorting, setSorting] = useState<{ id: string; desc: boolean }[]>([]);

  const columns = useMemo<ColumnDef<CaseTransactionRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(Boolean(value))
            }
            aria-label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-gray-900">
              {row.original.entityName}
            </div>
            <div className="text-xs text-gray-500">
              {row.original.accountLabel}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "dateLabel",
        header: "Date",
        cell: ({ row }) => (
          <div className="text-gray-700">{row.original.dateLabel}</div>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-gray-900">
              {row.original.description}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "amountValue",
        header: () => <div className="text-right">Amount</div>,
        cell: ({ row }) => {
          const isDebit = row.original.directionLabel === "Debit";
          return (
            <div
              className={`text-right font-medium ${
                isDebit ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {isDebit ? "-" : ""}
              {row.original.amountLabel}
            </div>
          );
        },
      },
      {
        accessorKey: "counterparty",
        header: "Counterparty",
        cell: ({ row }) => (
          <EditableCounterpartyName
            name={row.original.counterparty}
            onSave={row.original.onCounterpartySave}
          />
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === "Failed" ? "destructive" : "secondary"
            }
            className={
              row.original.status === "Failed"
                ? "bg-red-100 text-red-700 border-red-200"
                : "bg-emerald-100 text-emerald-700 border-emerald-200"
            }
          >
            {row.original.status}
          </Badge>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      rowSelection,
      sorting,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="hover:bg-gray-50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-4 py-3 align-top">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-sm text-gray-500"
                  >
                    No results found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div>
          {table.getFilteredSelectedRowModel().rows.length} selected of{" "}
          {table.getFilteredRowModel().rows.length} rows
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
