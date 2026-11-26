import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, Box, CircularProgress, IconButton, InputAdornment, TextField, Tooltip, Typography } from '@mui/material';
import MyLocationRounded from '@mui/icons-material/MyLocationRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import BookmarkRounded from '@mui/icons-material/BookmarkRounded';
import { get } from '../../api/apiClient';
import { useAuth } from '../../../app/providers/AuthProvider';
import { useToast } from '../../../app/providers/ToastProvider';

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const keyOf = place => `${place.name}|${place.lat}|${place.lng}`;

export default function PlaceSearch({ label, value, onChange, kind = 'drop', allowLocate = false, autoFocus, error, helperText }) {
  const { account } = useAuth();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [locating, setLocating] = useState(false);
  const query = useDebounced(input.trim());

  const popular = useQuery({ queryKey: ['geo', 'popular'], queryFn: () => get('/geo/popular'), staleTime: Infinity });
  const search = useQuery({
    queryKey: ['geo', 'search', query],
    queryFn: ({ signal }) => get(`/geo/search?q=${encodeURIComponent(query)}`, { signal }),
    enabled: query.length >= 2 && query !== value?.name,
    staleTime: 5 * 60 * 1000,
  });

  const options = useMemo(() => {
    if (query.length >= 2 && query !== value?.name) return (search.data?.places || []).map(place => ({ ...place, group: 'Results' }));
    const saved = (account?.savedPlaces || []).map(place => ({ name: place.label, address: place.address, lat: place.lat, lng: place.lng, group: 'Saved places', saved: true }));
    const landmarks = (popular.data?.places || []).map(({ tag, ...place }) => ({ ...place, group: 'Popular in Varanasi' }));
    return [...saved, ...landmarks];
  }, [query, value, search.data, popular.data, account]);

  const locate = () => {
    if (!navigator.geolocation) {
      toast.error('Location is not available in this browser');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const { latitude: lat, longitude: lng } = position.coords;
        const result = await get(`/geo/reverse?lat=${lat}&lng=${lng}`);
        if (!result.inServiceArea) toast.error('You seem to be outside our Varanasi service area');
        onChange({ ...result.place, lat, lng });
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLocating(false);
      }
    }, () => {
      setLocating(false);
      toast.error('We could not get your location. Search for a place instead.');
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  return (
    <Autocomplete
      value={value || null}
      onChange={(event, place) => onChange(place ? { name: place.name, address: place.address, lat: place.lat, lng: place.lng } : null)}
      inputValue={input}
      onInputChange={(event, next) => setInput(next)}
      options={options}
      groupBy={option => option.group}
      filterOptions={x => x}
      getOptionLabel={option => option.name || ''}
      isOptionEqualToValue={(a, b) => keyOf(a) === keyOf(b)}
      getOptionKey={option => `${option.group}-${keyOf(option)}`}
      loading={search.isFetching}
      noOptionsText={query.length < 2 ? 'Type at least 2 letters' : 'No places found in our service area'}
      renderOption={(props, option) => {
        const { key, ...rest } = props;
        return (
          <Box component="li" key={key} {...rest} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start !important' }}>
            {option.saved ? <BookmarkRounded fontSize="small" color="primary" sx={{ mt: 0.3 }} /> : <PlaceRounded fontSize="small" sx={{ mt: 0.3, color: 'text.secondary' }} />}
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{option.name}</Typography>
              {option.address && <Typography variant="caption" color="text.secondary">{option.address}</Typography>}
            </Box>
          </Box>
        );
      }}
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          autoFocus={autoFocus}
          error={Boolean(error)}
          helperText={error || helperText}
          slotProps={{
            input: {
              ...params.InputProps,
              startAdornment: (
                <InputAdornment position="start">
                  <Box sx={{ width: 10, height: 10, borderRadius: kind === 'drop' ? '3px' : '50%', bgcolor: { pickup: 'secondary.main', stop: 'text.secondary' }[kind] || 'primary.main', ml: 0.5 }} />
                </InputAdornment>
              ),
              endAdornment: (
                <>
                  {search.isFetching && <CircularProgress size={18} />}
                  {allowLocate && (
                    <Tooltip title="Use my current location">
                      <IconButton size="small" onClick={locate} aria-label="Use my current location" disabled={locating}>
                        {locating ? <CircularProgress size={18} /> : <MyLocationRounded fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  )}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
