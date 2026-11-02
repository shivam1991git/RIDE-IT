import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Rating, Typography } from '@mui/material';
import { get } from '../../lib/api';
import { dateOnly } from '../../lib/format';
import { AdminHeader, DataTable } from './shared';

export default function Feedback() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'feedback', page], queryFn: () => get(`/admin/feedback?page=${page}&limit=20`) });
  const columns = [
    { key: 'createdAt', label: 'Date', render: row => dateOnly(row.createdAt) },
    { key: 'from', label: 'From', render: row => row.userId?.fullName || row.driverId?.fullName || 'Deleted account' },
    { key: 'role', label: 'Role', render: row => (row.driverId ? 'Driver' : 'Rider') },
    { key: 'appRating', label: 'Rating', render: row => <Rating value={row.appRating} readOnly size="small" /> },
    { key: 'comment', label: 'Comment', render: row => <Typography variant="body2" sx={{ maxWidth: 420 }}>{row.additionalComments || '—'}</Typography> },
  ];
  return (
    <>
      <AdminHeader title="App feedback" subtitle={data?.averageAppRating ? `Average rating ${data.averageAppRating} / 5 from ${data.total} responses` : 'Ratings riders and drivers leave for the app.'} />
      <DataTable columns={columns} rows={data?.items || []} loading={isLoading} page={page} total={data?.total} onPage={setPage} empty="No feedback yet." />
    </>
  );
}
