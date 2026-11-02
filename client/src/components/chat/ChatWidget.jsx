import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Box, Button, Chip, Fab, IconButton, InputBase, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ChatBubbleRounded from '@mui/icons-material/ChatBubbleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import { post } from '../../lib/api';
import { money, timeOnly } from '../../lib/format';
import { useAuth } from '../../providers/AuthProvider';
import { StatusChip } from '../ui';

const STORAGE_KEY = 'rid-chat';
const WELCOME = {
  role: 'assistant',
  content: 'Hi! I am the RIDE-IT assistant. Ask me about booking, fares, cancellations or rentals — or, if you are signed in, “where is my ride?”.',
  at: Date.now(),
  suggestions: ['How do I book a ride?', 'Fare from Assi Ghat to Sarnath', 'Where is my ride?', 'How do I cancel?'],
};

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) && saved.length ? saved : [WELCOME];
  } catch {
    return [WELCOME];
  }
}

function BookingCard({ data }) {
  return (
    <Box component={RouterLink} to={`/trips/${data.id}`} sx={{ display: 'block', textDecoration: 'none', color: 'inherit', p: 1.25, mt: 1, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: 'background.paper', '&:hover': { borderColor: 'primary.main' } }}>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{data.title}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{money(data.amount)}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.75 }}>
        <StatusChip status={data.status} />
        <Typography variant="caption" color="text.secondary">{data.when}</Typography>
      </Stack>
    </Box>
  );
}

function Message({ message, onSuggestion, onTicket }) {
  const mine = message.role === 'user';
  return (
    <Stack sx={{ alignItems: mine ? 'flex-end' : 'flex-start' }} component={motion.div} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Box
        sx={{
          maxWidth: '86%', px: 1.75, py: 1.25, borderRadius: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          borderBottomRightRadius: mine ? 6 : undefined, borderBottomLeftRadius: mine ? undefined : 6,
          bgcolor: mine ? 'primary.main' : 'action.hover', color: mine ? 'primary.contrastText' : 'text.primary',
          border: message.error ? 1 : 0, borderColor: 'error.main',
        }}
      >
        <Typography variant="body2">{message.content}</Typography>
        {message.cards?.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'success.main' }}>
              <VerifiedRounded sx={{ fontSize: 14 }} />
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Verified from your account</Typography>
            </Stack>
            {message.cards.map(card => <BookingCard key={card.data.id} data={card.data} />)}
          </Box>
        )}
        {message.actions?.map(action => (action.type === 'link' ? (
          <Button key={action.label} size="small" variant="outlined" component={RouterLink} to={action.to} sx={{ mt: 1, mr: 1 }}>{action.label}</Button>
        ) : (
          <Button key={action.label} size="small" variant="contained" onClick={onTicket} sx={{ mt: 1 }}>{action.label}</Button>
        )))}
      </Box>
      <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, px: 0.5, alignItems: 'center' }}>
        {message.source === 'ai' && (
          <Tooltip title="Written by an AI model from our help content. Booking details are only shown in verified cards.">
            <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', color: 'text.secondary' }}><AutoAwesomeRounded sx={{ fontSize: 12 }} /><Typography variant="caption">AI answer</Typography></Stack>
          </Tooltip>
        )}
        <Typography variant="caption" color="text.secondary">{timeOnly(message.at)}</Typography>
      </Stack>
      {message.suggestions && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
          {message.suggestions.map(suggestion => <Chip key={suggestion} label={suggestion} size="small" variant="outlined" onClick={() => onSuggestion(suggestion)} />)}
        </Stack>
      )}
    </Stack>
  );
}

function Typing() {
  return (
    <Stack direction="row" spacing={0.6} sx={{ px: 2, py: 1.5, borderRadius: 4, bgcolor: 'action.hover', alignSelf: 'flex-start' }} aria-label="Assistant is typing">
      {[0, 1, 2].map(i => (
        <Box key={i} component={motion.span} animate={{ y: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'text.secondary' }} />
      ))}
    </Stack>
  );
}

export default function ChatWidget() {
  const { account } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(load);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticketMode, setTicketMode] = useState(false);
  const scroller = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))); } catch { /* storage unavailable */ }
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 200); }, [open]);

  const send = async text => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    const userMessage = { role: 'user', content, at: Date.now() };
    const next = [...messages.map(({ suggestions, ...m }) => m), userMessage];
    setMessages(next);
    setBusy(true);
    try {
      if (ticketMode) {
        await post('/chat/ticket', { message: content });
        setTicketMode(false);
        setMessages(current => [...current, { role: 'assistant', content: 'Your ticket is created. Our team will reply in your notifications, usually within a day.', at: Date.now() }]);
      } else {
        const history = next.filter(m => !m.error).slice(-10).map(({ role, content: c }) => ({ role, content: c.slice(0, 1000) }));
        const reply = await post('/chat', { messages: history });
        setMessages(current => [...current, { role: 'assistant', content: reply.reply, cards: reply.cards, actions: reply.actions, source: reply.source, at: Date.now(), suggestions: reply.intent === 'unknown' || reply.intent === 'greeting' ? reply.suggestions?.slice(0, 4) : undefined }]);
      }
    } catch (error) {
      setMessages(current => [...current, { role: 'assistant', content: error.status === 429 ? error.message : `${error.message} You can also reach us from the Help page.`, error: true, at: Date.now() }]);
    } finally {
      setBusy(false);
    }
  };

  const startTicket = () => {
    if (!account) return;
    setTicketMode(true);
    setMessages(current => [...current, { role: 'assistant', content: 'Describe the issue in one message (at least 10 characters) and I will send it to our support team.', at: Date.now() }]);
    inputRef.current?.focus();
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <Paper
            component={motion.section}
            aria-label="RIDE-IT assistant"
            role="dialog"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            sx={{
              position: 'fixed', zIndex: 1300, right: { xs: 0, sm: 24 }, bottom: { xs: 0, sm: 96 },
              width: { xs: '100vw', sm: 380 }, height: { xs: '100dvh', sm: 'min(600px, calc(100dvh - 140px))' },
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              borderRadius: { xs: 0, sm: 6 }, border: 1, borderColor: 'divider',
              boxShadow: theme => `0 30px 80px -20px ${alpha(theme.palette.common.black, 0.5)}`,
            }}
          >
            <Stack direction="row" sx={{ alignItems: 'center', px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ width: 36, height: 36, borderRadius: 3, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center', mr: 1.5 }}><ChatBubbleRounded fontSize="small" /></Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>RIDE-IT assistant</Typography>
                <Typography variant="caption" color="text.secondary">{account ? 'Can look up your own bookings' : 'Sign in to ask about your bookings'}</Typography>
              </Box>
              <Tooltip title="Clear conversation"><IconButton size="small" onClick={() => { setMessages([{ ...WELCOME, at: Date.now() }]); setTicketMode(false); }} aria-label="Clear conversation"><RestartAltRounded fontSize="small" /></IconButton></Tooltip>
              <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close assistant"><CloseRounded fontSize="small" /></IconButton>
            </Stack>
            <Stack ref={scroller} spacing={1.5} sx={{ flex: 1, overflowY: 'auto', p: 2 }} aria-live="polite">
              {messages.map((message, index) => <Message key={`${message.at}-${index}`} message={message} onSuggestion={send} onTicket={startTicket} />)}
              {busy && <Typography component="div"><Typing /></Typography>}
            </Stack>
            <Box component="form" onSubmit={e => { e.preventDefault(); send(); }} sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
              {ticketMode && <Chip size="small" color="primary" label="Writing to support" onDelete={() => setTicketMode(false)} sx={{ mb: 1 }} />}
              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end', bgcolor: 'action.hover', borderRadius: 4, pl: 2, pr: 0.5, py: 0.5 }}>
                <InputBase
                  inputRef={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value.slice(0, 500))}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={ticketMode ? 'Describe your issue…' : 'Ask about rides, fares, rentals…'}
                  multiline
                  maxRows={4}
                  sx={{ flex: 1, py: 1, fontSize: 14 }}
                  inputProps={{ 'aria-label': 'Message', maxLength: 500 }}
                />
                <IconButton type="submit" color="primary" disabled={!input.trim() || busy} aria-label="Send message"><SendRounded /></IconButton>
              </Stack>
              {input.length > 400 && <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>{500 - input.length} characters left</Typography>}
            </Box>
          </Paper>
        )}
      </AnimatePresence>
      <Fab
        color="primary"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: 1301, display: { xs: open ? 'none' : 'flex', sm: 'flex' } }}
      >
        {open ? <CloseRounded /> : <ChatBubbleRounded />}
      </Fab>
    </>
  );
}
