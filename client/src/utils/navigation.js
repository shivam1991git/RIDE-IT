export function appPath(path = '/') {
  const base = process.env.PUBLIC_URL || '';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${base}${normalizedPath}`;
}

export function redirectTo(path = '/') {
  window.location.href = appPath(path);
}
