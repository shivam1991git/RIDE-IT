import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Chip, Rating, Typography } from '@mui/material';
import { get } from '../../../shared/api/apiClient';
import { dateOnly } from '../../../shared/utils/format';
import { AdminHeader, DataTable } from '../components/adminShared';

export default function FeedbackPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'feedback', page], queryFn: () => get(`/admin/feedback?page=${page}&limit=20`) });
  const tripColumns = [
    { key: 'at', label: 'Date', render: row => dateOnly(row.ratingByCustomer.at) },
    { key: 'ref', label: 'Booking', render: row => row.reference || row.type },
    { key: 'customer', label: 'Customer', render: row => row.user?.fullName || '—' },
    { key: 'driver', label: 'Chauffeur', render: row => row.driver?.fullName || '—' },
    { key: 'score', label: 'Rating', render: row => <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Rating value={row.ratingByCustomer.score} readOnly size="small" />{row.ratingByCustomer.score <= 2 && <Chip size="small" color="error" label="Follow up" />}</Box> },
    { key: 'comment', label: 'Comment', render: row => <Typography variant="body2" sx={{ maxWidth: 380 }}>{row.ratingByCustomer.comment || '—'}</Typography> },
  ];
  const columns = [
    { key: 'createdAt', label: 'Date', render: row => dateOnly(row.createdAt) },
    { key: 'from', label: 'From', render: row => row.userId?.fullName || row.driverId?.fullName || 'Deleted account' },
    { key: 'role', label: 'Role', render: row => (row.driverId ? 'Chauffeur' : 'Customer') },
    { key: 'appRating', label: 'Rating', render: row => <Rating value={row.appRating} readOnly size="small" /> },
    { key: 'comment', label: 'Comment', render: row => <Typography variant="body2" sx={{ maxWidth: 420 }}>{row.additionalComments || '—'}</Typography> },
  ];
  return (
    <>
      <AdminHeader title="Reviews & feedback" subtitle="Trip ratings from customers, and feedback about the app. Low trip ratings are flagged for follow-up." />
      <Typography variant="h6" sx={{ mb: 1 }}>Latest trip ratings</Typography>
      <Box sx={{ mb: 4 }}>
        <DataTable columns={tripColumns} rows={data?.tripRatings || []} loading={isLoading} empty="No trip ratings yet." />
      </Box>
      <Typography variant="h6" sx={{ mb: 1 }}>App feedback{data?.averageAppRating ? ` · average ${data.averageAppRating} / 5` : ''}</Typography>
      <DataTable columns={columns} rows={data?.items || []} loading={isLoading} page={page} total={data?.total} onPage={setPage} empty="No feedback yet." />
    </>
  );
}
