/**
 * Utility for handling Blob lifecycle and secure downloads.
 * Resolves Finding 47: ensures window.URL.revokeObjectURL is always called
 * after browser download triggers, preventing memory leaks.
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  // Asynchronously clean up DOM and revoke Blob URL
  setTimeout(() => {
    a.remove();
    window.URL.revokeObjectURL(url);
  }, 1000);
}
