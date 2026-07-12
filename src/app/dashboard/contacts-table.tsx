"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  requestAddresses,
  type RequestAddressesResult,
} from "@/app/dashboard/actions";
// `import type` is fully erased at compile time — the runtime module (which
// is server-only) never enters the client bundle.
import type { SendStatus } from "@/lib/queries/contacts";

/** Serialized contact row passed from the server page. */
export interface DashboardRow {
  id: string;
  fullName: string;
  partnerName: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  sendStatus: SendStatus;
  updatedAfterSend: boolean;
  /** Preformatted server-side so the table needs no Date handling. */
  updatedAtLabel: string;
}

const chipBase =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium";

const chipStyles = {
  updated:
    "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  none: "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
  sent: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  delivered:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  opened:
    "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
  bounced:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  complained:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
} as const;

const chipLabels = {
  updated: "Updated",
  none: "—",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  bounced: "Bounced",
  complained: "Complained",
} as const;

function StatusChip({ row }: { row: DashboardRow }) {
  // "Updated" (recipient confirmed/changed details after our last send)
  // outranks the raw delivery status in the UI.
  const key = row.updatedAfterSend ? "updated" : row.sendStatus;
  return <span className={`${chipBase} ${chipStyles[key]}`}>{chipLabels[key]}</span>;
}

const thClasses =
  "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const tdClasses = "px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300";
const buttonClasses =
  "inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800";

/**
 * Ids are captured when the dialog opens so the send targets exactly what the
 * user confirmed. There is deliberately no "whole book" mode: with an active
 * search the table shows a filtered subset, and a server-side fan-out would
 * email (and rotate the live links of) contacts the dialog never mentioned.
 */
type ConfirmState = {
  mode: "selected" | "shown";
  ids: string[];
  sendable: number;
  skipped: number;
};

export function ContactsTable({ rows }: { rows: DashboardRow[] }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [result, setResult] = useState<RequestAddressesResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const emailableIds = useMemo(
    () => rows.filter((row) => row.email !== null).map((row) => row.id),
    [rows],
  );
  // Guard against stale selections surviving a data refresh (e.g. a contact
  // edited to drop its email while checked).
  const selectedCount = emailableIds.filter((id) => selected.has(id)).length;
  const allSelected =
    emailableIds.length > 0 && selectedCount === emailableIds.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function fire(input: Parameters<typeof requestAddresses>[0]) {
    setConfirm(null);
    setResult(null);
    startTransition(async () => {
      const res = await requestAddresses(input);
      setResult(res);
      if (!("error" in res)) setSelected(new Set());
    });
  }

  const banner =
    result === null ? null : "error" in result ? (
      <p
        role="alert"
        className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      >
        {result.error}
      </p>
    ) : (
      <p
        role="status"
        className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
      >
        {[
          `Sent ${result.sent} ${result.sent === 1 ? "request" : "requests"}`,
          result.skippedNoEmail > 0
            ? `${result.skippedNoEmail} skipped (no email)`
            : null,
          result.failed > 0 ? `${result.failed} failed` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    );

  return (
    <div>
      {banner}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={selectedCount === 0 || isPending}
          onClick={() =>
            setConfirm({
              mode: "selected",
              ids: emailableIds.filter((id) => selected.has(id)),
              sendable: selectedCount,
              skipped: 0,
            })
          }
          className={buttonClasses}
        >
          Request addresses{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
        <button
          type="button"
          disabled={rows.length === 0 || isPending}
          onClick={() =>
            // All VISIBLE rows (search-filtered), never the whole book. The
            // no-email ones are included so the server reports them skipped.
            // slice: the action caps at 1000 ids per request.
            setConfirm({
              mode: "shown",
              ids: rows.slice(0, 1000).map((row) => row.id),
              sendable: emailableIds.length,
              skipped: rows.length - emailableIds.length,
            })
          }
          className={buttonClasses}
        >
          Send to all shown
        </button>
        {isPending ? (
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Sending…
          </span>
        ) : null}
      </div>

      {confirm ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Confirm address request"
          className="mt-4 rounded-xl border border-zinc-300 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Send address requests to{" "}
            <strong>
              {confirm.mode === "shown"
                ? `the ${confirm.sendable} ${confirm.sendable === 1 ? "contact" : "contacts"} shown`
                : `${confirm.sendable} ${confirm.sendable === 1 ? "contact" : "contacts"}`}
            </strong>
            {confirm.skipped > 0 ? (
              <> — {confirm.skipped} will be skipped (no email)</>
            ) : null}
            ? Each gets a personal update link that expires in 30 days; any
            previously sent links stop working.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={confirm.sendable === 0 || isPending}
              onClick={() => fire({ contactIds: confirm.ids })}
              className="inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Confirm and send
            </button>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className={buttonClasses}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full min-w-[40rem]" aria-label="Contacts">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th scope="col" className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all contacts with an email"
                  checked={allSelected}
                  disabled={emailableIds.length === 0}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(emailableIds))
                  }
                  className="size-4 accent-zinc-900 dark:accent-zinc-50"
                />
              </th>
              <th scope="col" className={thClasses}>
                Name
              </th>
              <th scope="col" className={thClasses}>
                Partner
              </th>
              <th scope="col" className={thClasses}>
                Email
              </th>
              <th scope="col" className={thClasses}>
                Location
              </th>
              <th scope="col" className={thClasses}>
                Status
              </th>
              <th scope="col" className={thClasses}>
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.fullName}`}
                    checked={row.email !== null && selected.has(row.id)}
                    disabled={row.email === null}
                    title={
                      row.email === null
                        ? "No email address — add one to request an update"
                        : undefined
                    }
                    onChange={() => toggle(row.id)}
                    className="size-4 accent-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:accent-zinc-50"
                  />
                </td>
                <td className={tdClasses}>
                  <Link
                    href={`/dashboard/contacts/${row.id}`}
                    className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
                  >
                    {row.fullName}
                  </Link>
                </td>
                <td className={tdClasses}>{row.partnerName ?? "—"}</td>
                <td className={tdClasses}>{row.email ?? "—"}</td>
                <td className={tdClasses}>
                  {[row.city, row.country].filter(Boolean).join(", ") || "—"}
                </td>
                <td className={tdClasses}>
                  <StatusChip row={row} />
                </td>
                <td className={`${tdClasses} whitespace-nowrap`}>
                  {row.updatedAtLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
