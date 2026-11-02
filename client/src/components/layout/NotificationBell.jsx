import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Box, Button, Divider, IconButton, Popover, Stack, Tooltip, Typography } from '@mui/material';
import NotificationsRounded from '@mui/icons-material/NotificationsRounded';
import { get, post } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import { useAuth } from '../../providers/AuthProvider';

export default function NotificationBell() {
  const { role } = useAuth();
  const [anchor, setAnchor] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => get('/notifications'), refetchInterval: 60000 });
  const readAll = useMutation({
    mutationFn: () => post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const open = item => {
    setAnchor(null);
    if (!item.readAt) post(`/notifications/${item._id}/read`).then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }));
    if (item.booking) navigate(role === 'driver' ? `/driver/jobs/${item.booking}` : `/trips/${item.booking}`);
  };

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton onClick={e => setAnchor(e.currentTarget)} aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ''}`}>
          <Badge color="primary" badgeContent={data?.unread || 0} max={9}><NotificationsRounded /></Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 'min(360px, 92vw)', mt: 1, borderRadius: 4, border: 1, borderColor: 'divider' } } }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
          <Typography variant="h6">Notifications</Typography>
          {data?.unread > 0 && <Button size="small" onClick={() => readAll.mutate()}>Mark all read</Button>}
        </Stack>
        <Divider />
        <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
          {!data?.items?.length && (
            <Typography color="text.secondary" variant="body2" sx={{ p: 3, textAlign: 'center' }}>You are all caught up.</Typography>
          )}
          {data?.items?.map(item => (
            <Box
              key={item._id}
              component="button"
              onClick={() => open(item)}
              sx={{
                display: 'block', width: '100%', textAlign: 'left', border: 0, cursor: 'pointer', font: 'inherit', color: 'inherit',
                px: 2, py: 1.5, bgcolor: item.readAt ? 'transparent' : 'action.hover', borderBottom: 1, borderColor: 'divider',
                '&:hover': { bgcolor: 'action.selected' },
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2">{item.title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{relativeTime(item.createdAt)}</Typography>
              </Stack>
              {item.body && <Typography variant="body2" color="text.secondary">{item.body}</Typography>}
            </Box>
          ))}
        </Box>
      </Popover>
    </>
  );
}
