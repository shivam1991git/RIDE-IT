import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { get, patch } from '../../lib/api';
import { dateTime, relativeTime } from '../../lib/format';
import { useToast } from '../../providers/ToastProvider';
import { AdminHeader, DataTable } from './shared';

const COLORS = { open: 'warning', in_progress: 'info', resolved: 'success' };

function Reply({ ticket, onClose }) {
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('resolved');
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => patch(`/admin/support/${ticket._id}`, { status, adminReply: reply || undefined }),
    onSuccess: () => { toast.success('Ticket updated — the user was notified'); queryClient.invalidateQueries({ queryKey: ['admin'] }); onClose(); },
    onError: error => toast.error(error.message),
  });
  return (
    <Dialog open={Boolean(ticket)} onClose={onClose} fullWidth maxWidth="sm">
      {ticket && (
        <>
          <DialogTitle>{ticket.subject}</DialogTitle>
          <DialogContent>
            <Typography variant="caption" color="text.secondary">{ticket.requesterName} ({ticket.requesterRole}) · {ticket.requesterEmail} · {dateTime(ticket.createdAt)} · via {ticket.source}</Typography>
            <Box sx={{ my: 2, p: 2, borderRadius: 3, bgcolor: 'action.hover', whiteSpace: 'pre-wrap' }}><Typography variant="body2">{ticket.message}</Typography></Box>
            {ticket.adminReply && <Typography variant="body2" sx={{ mb: 2 }}><b>Previous reply:</b> {ticket.adminReply}</Typography>}
            <Stack spacing={2}>
              <TextField label="Reply to the user" multiline minRows={3} value={reply} onChange={e => setReply(e.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
              <TextField select size="small" label="Status" value={status} onChange={e => setStatus(e.target.value)}>
                <MenuItem value="open">Open</MenuItem><MenuItem value="in_progress">In progress</MenuItem><MenuItem value="resolved">Resolved</MenuItem>
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>Send</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

export default function SupportAdmin() {
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const params = new URLSearchParams({ page, limit: 20, ...(status && { status }) });
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'support', params.toString()], queryFn: () => get(`/admin/support?${params}`) });
  const columns = [
    { key: 'createdAt', label: 'Opened', render: row => relativeTime(row.createdAt) },
    {
      key: 'subject',
      label: 'Subject',
      render: row => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {row.priority === 'urgent' && row.status !== 'resolved' && <Chip size="small" color="error" label={row.source === 'sos' ? 'SOS' : 'Urgent'} sx={{ fontWeight: 700 }} />}
          <Typography variant="body2" sx={{ fontWeight: 600, maxWidth: 280 }} noWrap>{row.subject}</Typography>
        </Stack>
      ),
    },
    { key: 'requester', label: 'From', render: row => `${row.requesterName} (${row.requesterRole})` },
    { key: 'source', label: 'Source', render: row => <Chip size="small" variant="outlined" label={{ form: 'Help centre', chatbot: 'Assistant', sos: 'SOS', trip_issue: 'Chauffeur report' }[row.source] || row.source} /> },
    { key: 'status', label: 'Status', render: row => <Chip size="small" color={COLORS[row.status]} label={row.status.replace('_', ' ')} /> },
    { key: 'action', label: '', align: 'right', render: row => <Button size="small" onClick={() => setSelected(row)}>Open</Button> },
  ];
  return (
    <>
      <AdminHeader
        title="Support"
        subtitle="Tickets from the help centre, the assistant, chauffeur trip reports and in-trip SOS alerts. Open urgent tickets are always listed first."
        action={(
          <TextField select size="small" label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} sx={{ minWidth: 160 }}>
            <MenuItem value="">All</MenuItem><MenuItem value="open">Open</MenuItem><MenuItem value="in_progress">In progress</MenuItem><MenuItem value="resolved">Resolved</MenuItem>
          </TextField>
        )}
      />
      <DataTable columns={columns} rows={data?.items || []} loading={isLoading} page={page} total={data?.total} onPage={setPage} empty="No tickets here." />
      <Reply ticket={selected} onClose={() => setSelected(null)} />
    </>
  );
}
