import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Chip, Typography } from '@mui/material';
import { get } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { AdminHeader, DataTable } from './shared';

export default function Audit() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'audit', page], queryFn: () => get(`/admin/audit?page=${page}&limit=30`) });
  const columns = [
    { key: 'createdAt', label: 'When', render: row => dateTime(row.createdAt) },
    { key: 'action', label: 'Action', render: row => <Chip size="small" variant="outlined" label={row.action} sx={{ fontFamily: 'ui-monospace, monospace' }} /> },
    { key: 'actorRole', label: 'Actor', render: row => `${row.actorRole}${row.actor ? ` · …${String(row.actor).slice(-6)}` : ''}` },
    { key: 'target', label: 'Target', render: row => (row.targetType ? `${row.targetType} …${String(row.targetId).slice(-6)}` : '—') },
    { key: 'meta', label: 'Details', render: row => <Typography variant="caption" sx={{ fontFamily: 'ui-monospace, monospace', maxWidth: 360, display: 'block' }} noWrap>{row.meta ? JSON.stringify(row.meta) : ''}</Typography> },
  ];
  return (
    <>
      <AdminHeader title="Audit log" subtitle="Sign-ins, admin changes, bookings and payments. Kept for 180 days." />
      <DataTable columns={columns} rows={data?.items || []} loading={isLoading} page={page} total={data?.total} limit={30} onPage={setPage} />
    </>
  );
}
