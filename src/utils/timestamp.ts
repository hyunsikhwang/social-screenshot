/**
 * Formats current date/time as YYYYMMDD_HHmmss string (e.g., 20260804_143022)
 * to append to file names so that duplicate files are avoided.
 */
export function getTimestampStr(date = new Date()): string {
  const YYYY = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const DD = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
}

/**
 * Ensures a filename has a timestamp appended before its extension.
 * e.g., "telegram-card-post123.png" -> "telegram-card-post123_20260804_143022.png"
 */
export function addTimestampToFilename(filename: string, overrideTimestamp?: string): string {
  if (!filename) return `file_${getTimestampStr()}`;
  const timestamp = overrideTimestamp || getTimestampStr();
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx === -1) {
    return `${filename}_${timestamp}`;
  }
  const name = filename.slice(0, dotIdx);
  const ext = filename.slice(dotIdx);
  return `${name}_${timestamp}${ext}`;
}
