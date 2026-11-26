export function connectionErrorMessage(error, fallback) {
  if (error.response?.data?.code === 'timeout' || error.response?.status === 504) {
    return 'Adminer could not reach the configured etcd backend before the timeout. Check VPN connectivity, the backend endpoint and firewall access from the Adminer server. Your credentials have not been verified; this is not an invalid-password response.';
  }
  if (error.response?.data?.code === 'invalid_origin') {
    return 'Adminer rejected this browser origin before checking your credentials. Configure http.publicOrigin to match the browser URL (scheme, hostname and port), then restart Adminer.';
  }
  return error.response?.data?.message ?? fallback;
}
