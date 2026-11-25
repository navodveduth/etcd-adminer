export function connectionErrorMessage(error, fallback) {
  if (error.response?.data?.code === 'invalid_origin') {
    return 'Adminer rejected this browser origin before checking your credentials. Configure http.publicOrigin to match the browser URL (scheme, hostname and port), then restart Adminer.';
  }
  return error.response?.data?.message ?? fallback;
}
