export function formatBytes(value) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return 'Unavailable';
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

export function workspaceLabel(profile) {
  return [
    profile.Name,
    ...(profile.Name.toLowerCase() === profile.BackEnd.toLowerCase() ? [] : [profile.BackEnd]),
    profile.UserName,
  ].join(' · ');
}
